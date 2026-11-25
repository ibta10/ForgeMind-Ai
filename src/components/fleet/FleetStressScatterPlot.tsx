import React, { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { ArrowUpRight } from 'lucide-react';
import {
  buildFleetStressScatterData,
  type CriticalityLevel,
  type FleetEngineHealthCard,
  type FleetStressPoint,
} from '../../engine/fleetHealth';
import { TechnicalInterpretation } from '../charts/TechnicalInterpretation';

interface FleetStressScatterPlotProps {
  cards: FleetEngineHealthCard[];
  alpha: number;
  rulThreshold: number;
  rulCap: number;
  activeFilter: 'all' | CriticalityLevel;
  onResetFilter?: () => void;
  onInspectEngine: (engineId: number) => void;
}

const CRIT_META: Record<CriticalityLevel, { label: string; textCls: string }> = {
  critical: { label: 'CRITICAL', textCls: 'text-rose-400' },
  warning: { label: 'WATCH', textCls: 'text-amber-300' },
  healthy: { label: 'HEALTHY', textCls: 'text-emerald-400' },
};

const SVG_W = 800;
const SVG_H = 340;
const MARGIN = { top: 24, right: 24, bottom: 48, left: 58 };
const PLOT_W = SVG_W - MARGIN.left - MARGIN.right;
const PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;

interface PlacedCallout {
  engineId: number;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'end';
  text: string;
  accentHex: string;
}

export const FleetStressScatterPlot: React.FC<FleetStressScatterPlotProps> = ({
  cards,
  alpha,
  rulThreshold,
  rulCap,
  activeFilter,
  onResetFilter,
  onInspectEngine,
}) => {
  const [rulMetric, setRulMetric] = useState<'pred_rul' | 'conformal_lower'>('pred_rul');
  const [onlyOutliers, setOnlyOutliers] = useState<boolean>(false);
  const [hoveredEngineId, setHoveredEngineId] = useState<number | null>(null);

  const stressData = useMemo(
    () =>
      buildFleetStressScatterData(cards, {
        rulThreshold,
        rulCap,
        rulMetric,
      }),
    [cards, rulThreshold, rulCap, rulMetric],
  );

  const xDomain = useMemo<[number, number]>(() => {
    const pad = Math.max(10, Math.round((stressData.maxCycles - stressData.minCycles) * 0.08));
    return [Math.max(0, stressData.minCycles - pad), stressData.maxCycles + pad];
  }, [stressData.minCycles, stressData.maxCycles]);

  const yDomainMax = useMemo(
    () => Math.max(rulCap + 10, Math.ceil((stressData.maxRul + 10) / 25) * 25),
    [stressData.maxRul, rulCap],
  );

  const xScale = useMemo(
    () => d3.scaleLinear().domain(xDomain).range([MARGIN.left, MARGIN.left + PLOT_W]),
    [xDomain],
  );

  const yScale = useMemo(
    () => d3.scaleLinear().domain([0, yDomainMax]).range([MARGIN.top + PLOT_H, MARGIN.top]),
    [yDomainMax],
  );

  const xTicks = useMemo(() => xScale.ticks(7), [xScale]);
  const yTicks = useMemo(() => yScale.ticks(5), [yScale]);

  const focusedPoint: FleetStressPoint | null = useMemo(() => {
    if (hoveredEngineId !== null) {
      const match = stressData.points.find((p) => p.card.engineId === hoveredEngineId);
      if (match) return match;
    }
    const topPriorityId = stressData.highlightedUnitIds[0];
    if (topPriorityId !== undefined) {
      return stressData.points.find((p) => p.card.engineId === topPriorityId) ?? null;
    }
    return [...stressData.points].sort((a, b) => b.stressScore - a.stressScore)[0] ?? null;
  }, [stressData, hoveredEngineId]);

  const placedCallouts: PlacedCallout[] = useMemo(() => {
    const targetIds = new Set(stressData.highlightedUnitIds);
    if (hoveredEngineId !== null) targetIds.add(hoveredEngineId);

    const candidates = stressData.points
      .filter((p) => targetIds.has(p.card.engineId))
      .sort((a, b) => b.stressScore - a.stressScore)
      .slice(0, 5);

    const candidateCoords = candidates.map((p) => ({
      engineId: p.card.engineId,
      px: xScale(p.operationalCycles),
      py: yScale(p.currentRul),
    }));

    const placed: PlacedCallout[] = [];
    const labelW = 32;
    const labelH = 14;

    const offsets: Array<{ dx: number; dy: number; anchor: 'start' | 'end' }> = [
      { dx: 12, dy: -11, anchor: 'start' },
      { dx: -12, dy: -11, anchor: 'end' },
      { dx: 12, dy: 16, anchor: 'start' },
      { dx: -12, dy: 16, anchor: 'end' },
      { dx: 12, dy: -24, anchor: 'start' },
      { dx: -12, dy: -24, anchor: 'end' },
      { dx: 0, dy: -18, anchor: 'start' },
    ];

    for (const pt of candidates) {
      const px = xScale(pt.operationalCycles);
      const py = yScale(pt.currentRul);
      let best: { x: number; y: number; anchor: 'start' | 'end' } | null = null;

      for (const opt of offsets) {
        const tx = px + opt.dx;
        const ty = Math.max(
          MARGIN.top + 14,
          Math.min(MARGIN.top + PLOT_H - 6, py + opt.dy),
        );
        const boxLeft = opt.anchor === 'start' ? tx : tx - labelW;
        const boxRight = boxLeft + labelW;
        const boxTop = ty - labelH;
        const boxBottom = ty + 2;

        if (boxLeft < MARGIN.left + 4 || boxRight > MARGIN.left + PLOT_W - 4) {
          continue;
        }

        const overlapsLabel = placed.some((other) => {
          const oLeft = other.anchor === 'start' ? other.labelX : other.labelX - labelW;
          const oRight = oLeft + labelW;
          const oTop = other.labelY - labelH;
          const oBottom = other.labelY + 2;
          return !(
            boxRight + 4 < oLeft ||
            boxLeft - 4 > oRight ||
            boxBottom + 2 < oTop ||
            boxTop - 2 > oBottom
          );
        });
        if (overlapsLabel) continue;

        const overlapsMarker = candidateCoords.some(
          (dot) =>
            dot.px >= boxLeft - 11 &&
            dot.px <= boxRight + 11 &&
            dot.py >= boxTop - 11 &&
            dot.py <= boxBottom + 11,
        );
        if (overlapsMarker) continue;

        best = { x: tx, y: ty, anchor: opt.anchor };
        break;
      }

      const fallbackAnchor: 'start' | 'end' = px > MARGIN.left + PLOT_W - 64 ? 'end' : 'start';
      const chosen = best ?? {
        x: px + (fallbackAnchor === 'end' ? -12 : 12),
        y: Math.max(MARGIN.top + 14, py - 12),
        anchor: fallbackAnchor,
      };

      placed.push({
        engineId: pt.card.engineId,
        x: px,
        y: py,
        labelX: chosen.x,
        labelY: chosen.y,
        anchor: chosen.anchor,
        text: `#${String(pt.card.engineId).padStart(2, '0')}`,
        accentHex:
          pt.card.engineId === hoveredEngineId
            ? '#F8FAFC'
            : pt.isHighRiskHighUncertainty
              ? '#FDA4AF'
              : '#E2E8F0',
      });
    }

    return placed;
  }, [stressData.points, stressData.highlightedUnitIds, hoveredEngineId, xScale, yScale]);

  const thresholdY = yScale(rulThreshold);
  const zeroY = yScale(0);
  const meanCyclesX = xScale(stressData.meanCycles);

  const focusedWhisker = useMemo(() => {
    if (!focusedPoint) return null;
    const x = xScale(focusedPoint.operationalCycles);
    const yPred = yScale(focusedPoint.currentRul);
    const yLower = yScale(Math.max(0, focusedPoint.card.conformalLowerAtObserved));
    const yUpper = yScale(
      Math.min(yDomainMax, focusedPoint.card.conformalUpperAtObserved),
    );
    return { x, yPred, yLower, yUpper };
  }, [focusedPoint, xScale, yScale, yDomainMax]);

  const coveragePct = ((1 - alpha) * 100).toFixed(0);
  const visibleCount = useMemo(
    () =>
      stressData.points.filter(
        (pt) =>
          (activeFilter === 'all' || pt.card.criticality === activeFilter) &&
          (!onlyOutliers || pt.isHighRiskHighUncertainty),
      ).length,
    [stressData.points, activeFilter, onlyOutliers],
  );
  const hoveredPoint = useMemo(
    () =>
      hoveredEngineId !== null
        ? stressData.points.find((p) => p.card.engineId === hoveredEngineId) ?? null
        : null,
    [hoveredEngineId, stressData.points],
  );

  if (stressData.points.length === 0) {
    return (
      <section
        data-testid="fleet-stress-empty"
        className="rounded-lg border border-dashed border-slate-700 bg-[#0E131D] p-6 text-center space-y-1.5"
      >
        <div className="text-sm font-medium text-slate-200">Fleet Stress Scatter Unavailable</div>
        <p className="text-xs text-slate-400">
          No engine telemetry points are currently loaded.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4"
      aria-labelledby="fleet-stress-heading"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[260px]">
          <h3
            id="fleet-stress-heading"
            className="font-display text-base font-semibold text-slate-100"
          >
            Fleet Stress Scatter Plot (RUL vs. Operational Cycles)
          </h3>
          <p className="text-xs text-slate-400">
            {visibleCount} matching / {stressData.points.length} engines · Color encodes {coveragePct}% conformal width (±q̂) to isolate high-risk, high-uncertainty units
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <div
            role="group"
            aria-label="Fleet Stress Y-Axis Metric"
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5 max-w-full"
          >
            <button
              type="button"
              onClick={() => setRulMetric('pred_rul')}
              aria-pressed={rulMetric === 'pred_rul'}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                rulMetric === 'pred_rul'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Predicted RUL
            </button>
            <button
              type="button"
              onClick={() => setRulMetric('conformal_lower')}
              aria-pressed={rulMetric === 'conformal_lower'}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                rulMetric === 'conformal_lower'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Conformal LB
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOnlyOutliers((prev) => !prev)}
            aria-pressed={onlyOutliers}
            className={`px-2.5 py-1.5 rounded-md border text-xs font-mono tabular-nums transition-colors whitespace-nowrap ${
              onlyOutliers
                ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                : 'border-slate-700 bg-[#080B12] text-slate-300 hover:border-slate-600'
            }`}
          >
            High-Risk &amp; Wide Band ({stressData.highRiskHighUncertaintyCount})
          </button>
        </div>
      </div>

      {/* Uncertainty Color Scale & Zone Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80 text-xs">
        <div className="flex items-center gap-3 min-w-[240px] flex-1 max-w-md">
          <span className="font-mono text-[11px] text-cyan-300 whitespace-nowrap tabular-nums">
            {stressData.minWidth.toFixed(1)}c Tight
          </span>
          <div
            className="h-2.5 flex-1 rounded-xs border border-slate-700/80"
            style={{
              background:
                'linear-gradient(90deg, #06B6D4 0%, #F59E0B 50%, #F43F5E 100%)',
            }}
            aria-hidden="true"
          />
          <span className="font-mono text-[11px] text-rose-400 whitespace-nowrap tabular-nums">
            {stressData.maxWidth.toFixed(1)}c Wide
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-slate-400">
          <span className="inline-flex items-center gap-1.5 text-rose-300">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full border-2 border-rose-300 bg-rose-500/40"
              aria-hidden="true"
            />
            Ring = High-Risk + Width ≥ {stressData.highUncertaintyCutoff.toFixed(1)}c
          </span>
          <span>
            Mean Width: <strong className="text-slate-200">{stressData.meanWidth.toFixed(1)}c</strong>
          </span>
          <span>
            Mean Cycles: <strong className="text-slate-200">{stressData.meanCycles.toFixed(0)}c</strong>
          </span>
        </div>
      </div>

      {/* Scatter SVG Canvas */}
      <div className="relative w-full rounded-md border border-slate-800/90 bg-[#080B12] p-2">
        {visibleCount === 0 && (
          <div
            data-testid="fleet-stress-filter-empty"
            className="mb-2 rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200"
          >
            <span>No engines match both the active criticality filter and the High-Risk &amp; Wide Band toggle.</span>
            <div className="flex items-center gap-2">
              {onlyOutliers && (
                <button
                  type="button"
                  onClick={() => setOnlyOutliers(false)}
                  className="rounded border border-amber-400/50 bg-slate-900 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-slate-800"
                >
                  Show All Bands
                </button>
              )}
              {activeFilter !== 'all' && onResetFilter && (
                <button
                  type="button"
                  onClick={onResetFilter}
                  className="rounded border border-amber-400/50 bg-slate-900 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-slate-800"
                >
                  Reset Status Filter
                </button>
              )}
            </div>
          </div>
        )}

        {hoveredPoint && (
          <div
            data-testid="fleet-stress-hover-tooltip"
            className="pointer-events-none hidden sm:block absolute top-3 right-3 z-10 max-w-xs rounded-md border border-slate-700/90 bg-[#0E131D]/95 px-3 py-2 text-[11px] font-mono tabular-nums shadow-xl space-y-0.5"
          >
            <div className="flex items-center justify-between gap-3 font-semibold text-slate-100">
              <span>Unit #{String(hoveredPoint.card.engineId).padStart(2, '0')}</span>
              <span className={CRIT_META[hoveredPoint.card.criticality].textCls}>
                {CRIT_META[hoveredPoint.card.criticality].label}
              </span>
            </div>
            <div className="text-slate-300">
              Cycles: {hoveredPoint.card.observedCycle}/{hoveredPoint.card.failureCycle} · Pred RUL: {hoveredPoint.card.predRulAtObserved.toFixed(1)}c
            </div>
            <div className="text-cyan-300">
              {coveragePct}% Band: [{hoveredPoint.card.conformalLowerAtObserved.toFixed(1)}, {hoveredPoint.card.conformalUpperAtObserved.toFixed(1)}]c (±{(hoveredPoint.uncertaintyWidth / 2).toFixed(1)}c)
            </div>
            <div className="text-slate-400 font-sans text-[10px]">
              {hoveredPoint.isHighRiskHighUncertainty
                ? 'High-stress & wide conformal band — strong candidate for immediate inspection.'
                : 'Within standard fleet uncertainty envelope.'}
            </div>
          </div>
        )}

        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto block select-none"
          role="img"
          aria-label={`Fleet Stress scatter plot of ${stressData.points.length} engines mapping current RUL against total operational cycles`}
          data-testid="fleet-stress-scatter-svg"
        >
          {/* Danger Zone Band (RUL <= tau) */}
          <rect
            x={MARGIN.left}
            y={thresholdY}
            width={PLOT_W}
            height={Math.max(0, zeroY - thresholdY)}
            fill="rgba(244, 63, 94, 0.08)"
          />

          {/* High-Cycle / High-Stress Quadrant subtle highlight (cycles >= mean && RUL <= tau + 15) */}
          <rect
            x={meanCyclesX}
            y={yScale(Math.min(yDomainMax, rulThreshold + 15))}
            width={Math.max(0, MARGIN.left + PLOT_W - meanCyclesX)}
            height={Math.max(
              0,
              zeroY - yScale(Math.min(yDomainMax, rulThreshold + 15)),
            )}
            fill="rgba(244, 63, 94, 0.05)"
          />

          {/* Horizontal Gridlines & Y-Axis Ticks */}
          {yTicks.map((tick) => {
            const py = yScale(tick);
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={MARGIN.left}
                  y1={py}
                  x2={MARGIN.left + PLOT_W}
                  y2={py}
                  stroke="#1E293B"
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 8}
                  y={py + 4}
                  textAnchor="end"
                  fill="#94A3B8"
                  fontSize="11"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Vertical Gridlines & X-Axis Ticks */}
          {xTicks.map((tick) => {
            const px = xScale(tick);
            return (
              <g key={`x-${tick}`}>
                <line
                  x1={px}
                  y1={MARGIN.top}
                  x2={px}
                  y2={MARGIN.top + PLOT_H}
                  stroke="#162032"
                  strokeWidth={1}
                />
                <text
                  x={px}
                  y={MARGIN.top + PLOT_H + 17}
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="11"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Axes Frame */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={MARGIN.top + PLOT_H}
            stroke="#334155"
            strokeWidth={1}
          />
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + PLOT_H}
            x2={MARGIN.left + PLOT_W}
            y2={MARGIN.top + PLOT_H}
            stroke="#334155"
            strokeWidth={1}
          />

          {/* Vertical Mean Operational Cycles Line */}
          <line
            x1={meanCyclesX}
            y1={MARGIN.top}
            x2={meanCyclesX}
            y2={MARGIN.top + PLOT_H}
            stroke="#475569"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text
            x={meanCyclesX + 6}
            y={MARGIN.top + 13}
            fill="#94A3B8"
            fontSize="11"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
          >
            Mean {stressData.meanCycles.toFixed(0)} cyc
          </text>

          {/* Horizontal Critical Threshold Line */}
          <line
            x1={MARGIN.left}
            y1={thresholdY}
            x2={MARGIN.left + PLOT_W}
            y2={thresholdY}
            stroke="#FB7185"
            strokeWidth={1.3}
            strokeDasharray="5 4"
          />
          <text
            x={MARGIN.left + PLOT_W - 6}
            y={thresholdY - 6}
            textAnchor="end"
            fill="#FDA4AF"
            fontSize="11"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
          >
            Safety Trigger τ = {rulThreshold}c
          </text>

          {/* Conformal Interval Whisker on Focused Point */}
          {focusedWhisker && (
            <g aria-hidden="true">
              <line
                x1={focusedWhisker.x}
                y1={focusedWhisker.yUpper}
                x2={focusedWhisker.x}
                y2={focusedWhisker.yLower}
                stroke="#E2E8F0"
                strokeWidth={1.5}
                strokeOpacity={0.75}
              />
              <line
                x1={focusedWhisker.x - 5}
                y1={focusedWhisker.yUpper}
                x2={focusedWhisker.x + 5}
                y2={focusedWhisker.yUpper}
                stroke="#E2E8F0"
                strokeWidth={1.5}
                strokeOpacity={0.75}
              />
              <line
                x1={focusedWhisker.x - 5}
                y1={focusedWhisker.yLower}
                x2={focusedWhisker.x + 5}
                y2={focusedWhisker.yLower}
                stroke="#E2E8F0"
                strokeWidth={1.5}
                strokeOpacity={0.75}
              />
            </g>
          )}

          {/* 48 Engine Scatter Points */}
          {stressData.points.map((pt) => {
            const px = xScale(pt.operationalCycles);
            const py = yScale(pt.currentRul);
            const matchesCritFilter =
              activeFilter === 'all' || pt.card.criticality === activeFilter;
            const matchesOutlierToggle =
              !onlyOutliers || pt.isHighRiskHighUncertainty;
            const visible = matchesCritFilter && matchesOutlierToggle;
            const isHovered = hoveredEngineId === pt.card.engineId;
            const isFocused = focusedPoint?.card.engineId === pt.card.engineId;

            return (
              <g
                key={pt.card.engineId}
                data-testid={`stress-point-${pt.card.engineId}`}
                data-high-risk-high-uncertainty={
                  pt.isHighRiskHighUncertainty ? 'true' : 'false'
                }
                role="button"
                tabIndex={0}
                aria-label={`Unit ${pt.card.engineId}, ${pt.card.observedCycle} cycles, ${
                  rulMetric === 'conformal_lower' ? 'conformal LB' : 'predicted RUL'
                } ${pt.currentRul.toFixed(1)} cycles, uncertainty width ${pt.uncertaintyWidth.toFixed(
                  1,
                )} cycles`}
                onClick={() => onInspectEngine(pt.card.engineId)}
                onMouseEnter={() => setHoveredEngineId(pt.card.engineId)}
                onMouseLeave={() => setHoveredEngineId(null)}
                onFocus={() => setHoveredEngineId(pt.card.engineId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onInspectEngine(pt.card.engineId);
                  }
                }}
                style={{
                  cursor: 'pointer',
                  opacity: visible ? 1 : 0.14,
                  outline: 'none',
                }}
              >
                {/* Outer Alert Halo for High-Risk + High-Uncertainty Outliers */}
                {pt.isHighRiskHighUncertainty && (
                  <circle
                    cx={px}
                    cy={py}
                    r={pt.radius + 4}
                    fill="none"
                    stroke="#FDA4AF"
                    strokeWidth={1.3}
                    strokeOpacity={0.85}
                  />
                )}

                {/* Focused / Hovered Ring */}
                {(isHovered || isFocused) && (
                  <circle
                    cx={px}
                    cy={py}
                    r={pt.radius + 5.5}
                    fill="none"
                    stroke="#F8FAFC"
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                )}

                {/* Main Scatter Marker Colored by Conformal Uncertainty Width */}
                <circle
                  cx={px}
                  cy={py}
                  r={isHovered ? pt.radius + 1.5 : pt.radius}
                  fill={pt.color.hex}
                  fillOpacity={0.9}
                  stroke={isHovered ? '#F8FAFC' : '#080B12'}
                  strokeWidth={isHovered ? 1.8 : 1.1}
                />
              </g>
            );
          })}

          {/* Collision-checked #XX Callout Labels for Top Outliers & Focused Point */}
          {placedCallouts.map((c) => (
            <text
              key={`callout-${c.engineId}`}
              x={c.labelX}
              y={c.labelY}
              textAnchor={c.anchor}
              fill={c.accentHex}
              fontSize="11"
              fontWeight={700}
              fontFamily="ui-monospace, SFMono-Regular, monospace"
              style={{ pointerEvents: 'none' }}
            >
              {c.text}
            </text>
          ))}

          {/* Axis Titles */}
          <text
            x={MARGIN.left + PLOT_W / 2}
            y={SVG_H - 10}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="12"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Total Operational Cycles (Observed Cycle)
          </text>
          <text
            x={16}
            y={MARGIN.top + PLOT_H / 2}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="12"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            transform={`rotate(-90 16 ${MARGIN.top + PLOT_H / 2})`}
          >
            {rulMetric === 'conformal_lower'
              ? `${coveragePct}% Conformal LB (cycles)`
              : 'Current Predicted RUL (cycles)'}
          </text>
        </svg>
      </div>

      {/* Focused Engine Telemetry Readout Bar */}
      {focusedPoint && (
        <div
          className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums text-slate-300"
          data-testid="fleet-stress-readout"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="text-slate-100 font-semibold">
              {hoveredEngineId !== null ? 'Focused' : 'Top Stress Unit'}: Unit #
              {String(focusedPoint.card.engineId).padStart(2, '0')}
            </span>
            <span>
              Cycles:{' '}
              <strong className="text-white">
                {focusedPoint.card.observedCycle}/{focusedPoint.card.failureCycle}
              </strong>
            </span>
            <span>
              Pred RUL:{' '}
              <strong className="text-cyan-300">
                {focusedPoint.card.predRulAtObserved.toFixed(1)}c
              </strong>
            </span>
            <span>
              {coveragePct}% Band:{' '}
              <strong className="text-slate-200">
                [{focusedPoint.card.conformalLowerAtObserved.toFixed(1)},{' '}
                {focusedPoint.card.conformalUpperAtObserved.toFixed(1)}]c
              </strong>
            </span>
            <span>
              Width:{' '}
              <strong style={{ color: focusedPoint.color.hex }}>
                {focusedPoint.uncertaintyWidth.toFixed(1)}c
              </strong>
            </span>
            <span className={CRIT_META[focusedPoint.card.criticality].textCls}>
              {CRIT_META[focusedPoint.card.criticality].label}
              {focusedPoint.isHighRiskHighUncertainty ? ' · HIGH-RISK & WIDE' : ''}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onInspectEngine(focusedPoint.card.engineId)}
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1 text-xs font-sans font-medium text-cyan-300 hover:border-cyan-500/50 hover:text-cyan-200 transition-colors whitespace-nowrap"
          >
            Inspect in Playback
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <TechnicalInterpretation
        title="Fleet Stress Scatter Analysis"
        summary="Maps remaining useful life vs operational cycles colored by conformal band width"
        whatItShows="Engines in the shaded lower-right quadrant (high accumulated operational cycles, low remaining useful life) face maximum wear. Rose halo rings highlight units with both low remaining life and wide conformal uncertainty bands, where point RUL estimates alone can understate imminent failure risk."
        sampleScope={`${stressData.points.length} synthetic engines across operational lifecycle snapshots`}
        conditionGuide={{
          normal: 'Cyan markers have tight conformal prediction bands and high certainty.',
          warning: 'Amber markers show moderate band width across operating shifts.',
          critical: 'Rose-haloed markers combine low remaining life with wide uncertainty bands.',
        }}
        metrics={['rul', 'interval_width', 'conformal_coverage']}
      />
    </section>
  );
};
