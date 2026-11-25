import React, { useMemo, useState } from 'react';
import {
  buildSubsetRulHistogram,
  type HistogramSnapshotMode,
} from '../../engine/rulDistribution';
import type { EngineTrajectory, ModelId, SubsetId } from '../../engine/types';
import { TechnicalInterpretation } from './TechnicalInterpretation';

interface RulDistributionHistogramProps {
  subset: SubsetId;
  fleet: EngineTrajectory[];
  primaryEngineId: number;
  onSelectEngine: (engineId: number) => void;
  selectedModel: ModelId;
  regimeAware: boolean;
  rulThreshold: number;
  rulCap: number;
  seed: number;
  playbackCycle: number;
}

const ZONE_BAR_COLORS = {
  critical: {
    fill: 'rgba(244, 63, 94, 0.72)',
    stroke: '#F43F5E',
    text: 'text-rose-300',
    zoneLabel: 'CRITICAL (≤ τ)',
    zoneNote: 'Immediate preventive maintenance zone; remaining cycles are at or below safety trigger τ.',
  },
  warning: {
    fill: 'rgba(245, 158, 11, 0.72)',
    stroke: '#F59E0B',
    text: 'text-amber-300',
    zoneLabel: 'WATCH (τ to τ + 25c)',
    zoneNote: 'Approaching trigger threshold; conformal lower bounds often breach τ first inside this band.',
  },
  healthy: {
    fill: 'rgba(16, 185, 129, 0.72)',
    stroke: '#10B981',
    text: 'text-emerald-300',
    zoneLabel: 'HEALTHY (> τ + 25c)',
    zoneNote: 'Comfortable operating margin above maintenance trigger τ.',
  },
};

export const RulDistributionHistogram: React.FC<RulDistributionHistogramProps> = ({
  subset,
  fleet,
  primaryEngineId,
  onSelectEngine,
  selectedModel,
  regimeAware,
  rulThreshold,
  rulCap,
  seed,
  playbackCycle,
}) => {
  const [snapshotMode, setSnapshotMode] = useState<HistogramSnapshotMode>('playback_cycle');
  const [selectedBinIdx, setSelectedBinIdx] = useState<number | null>(null);
  const [hoveredBinIdx, setHoveredBinIdx] = useState<number | null>(null);

  const histogram = useMemo(
    () =>
      buildSubsetRulHistogram(fleet, {
        subset,
        primaryEngineId,
        model: selectedModel,
        regimeAware,
        rulThreshold,
        rulCap,
        seed,
        snapshotMode,
        targetCycle: playbackCycle,
        binWidth: 15,
      }),
    [
      fleet,
      subset,
      primaryEngineId,
      selectedModel,
      regimeAware,
      rulThreshold,
      rulCap,
      seed,
      snapshotMode,
      playbackCycle,
    ],
  );

  const activeBin = useMemo(() => {
    const idx = hoveredBinIdx ?? selectedBinIdx;
    if (idx !== null && histogram.bins[idx]) {
      return histogram.bins[idx];
    }
    return (
      histogram.bins.find((b) => b.containsPrimary) ??
      histogram.bins.reduce((best, cur) => (cur.count > best.count ? cur : best), histogram.bins[0])
    );
  }, [histogram.bins, selectedBinIdx, hoveredBinIdx]);

  const width = 820;
  const height = 266;
  const pad = { top: 28, right: 20, bottom: 48, left: 60 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxCount = Math.max(4, ...histogram.bins.map((b) => b.count));
  const yCeiling = Math.ceil(maxCount * 1.18);

  const yTicks = useMemo(() => {
    const step = Math.max(1, Math.ceil(yCeiling / 4));
    const ticks: number[] = [];
    for (let v = 0; v <= yCeiling; v += step) {
      ticks.push(v);
    }
    return ticks;
  }, [yCeiling]);

  const mapY = (count: number) => pad.top + (1 - count / yCeiling) * plotH;

  const slotW = plotW / Math.max(1, histogram.bins.length);
  const barGap = Math.max(4, slotW * 0.16);
  const barW = Math.max(12, slotW - barGap);

  const maxBinSpan = histogram.bins.length * histogram.binWidth;
  const threshRatio = Math.max(0, Math.min(1, rulThreshold / Math.max(1, maxBinSpan)));
  const threshX = pad.left + threshRatio * plotW;

  const watchCutoff = rulThreshold + 25;
  const watchRatio = Math.max(0, Math.min(1, watchCutoff / Math.max(1, maxBinSpan)));
  const watchX = pad.left + watchRatio * plotW;

  const unitRulById = useMemo(
    () => new Map(histogram.unitRuls.map((u) => [u.engineId, u])),
    [histogram.unitRuls],
  );

  return (
    <section
      className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4"
      aria-labelledby="rul-histogram-heading"
    >
      {/* Header & Snapshot Basis Toggle */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="rul-histogram-heading"
            className="font-display text-base font-semibold text-slate-100"
          >
            Subset Predicted RUL Distribution — {subset} ({histogram.totalEngines} Synthetic Engines)
          </h3>
          <p className="text-xs text-slate-400">
            {snapshotMode === 'playback_cycle'
              ? `Cross-fleet remaining life distribution evaluated at playback cycle c${histogram.targetCycle} (${histogram.alreadyFailedCount} already reached failure)`
              : 'Cross-fleet staggered lifecycle snapshot showing critical, watch, and healthy RUL cohorts'}
          </p>
        </div>

        <div
          role="group"
          aria-label="Histogram Snapshot Basis"
          className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
        >
          <button
            type="button"
            onClick={() => setSnapshotMode('playback_cycle')}
            aria-pressed={snapshotMode === 'playback_cycle'}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              snapshotMode === 'playback_cycle'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Synced: Cycle {playbackCycle}
          </button>
          <button
            type="button"
            onClick={() => setSnapshotMode('mixed_fleet')}
            aria-pressed={snapshotMode === 'mixed_fleet'}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              snapshotMode === 'mixed_fleet'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mixed Fleet Snapshot
          </button>
        </div>
      </div>

      {histogram.totalEngines === 0 ? (
        <div
          data-testid="rul-histogram-empty"
          className="rounded-md border border-dashed border-slate-800 bg-[#080B12] px-4 py-12 text-center text-xs text-slate-400"
        >
          No engines in the active fleet cohort to compute an RUL distribution histogram.
        </div>
      ) : (
        <>
          {/* 4-Column Distribution Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-800/80">
            <div>
              <div className="text-xs text-slate-400">Median &amp; Mean Predicted RUL</div>
              <div
                data-testid="histogram-median-rul"
                className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-100"
              >
                {histogram.medianPredRul.toFixed(1)} cyc
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-400">
                Mean {histogram.meanPredRul.toFixed(1)} ± {histogram.stdDevPredRul.toFixed(1)} cyc
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Interquartile Spread (P25–P75)</div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-cyan-300">
                {histogram.p25PredRul.toFixed(1)}–{histogram.p75PredRul.toFixed(1)} cyc
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-400">
                P10–P90: {histogram.p10PredRul.toFixed(1)} – {histogram.p90PredRul.toFixed(1)} cyc
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Dominant Timeline Cluster</div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-100">
                {histogram.dominantBinLabel} cyc
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-400">
                {histogram.dominantBinCount} units ({((histogram.dominantBinCount / Math.max(1, histogram.totalEngines)) * 100).toFixed(1)}%)
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Active Unit #{String(primaryEngineId).padStart(2, '0')} Position</div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-300">
                {histogram.primaryEnginePredRul.toFixed(1)} cyc
              </div>
              <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-400">
                Rank #{histogram.primaryEngineRank} lowest of {histogram.totalEngines} units
              </div>
            </div>
          </div>

          {/* Interactive Histogram SVG */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5 text-rose-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-rose-500/80" />
                  Critical (≤ {rulThreshold}c)
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-500/80" />
                  Watch ({rulThreshold}–{watchCutoff}c)
                </span>
                <span className="inline-flex items-center gap-1.5 text-emerald-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-emerald-500/80" />
                  Healthy (&gt; {watchCutoff}c)
                </span>
                <span className="inline-flex items-center gap-1.5 text-cyan-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs border border-cyan-300 bg-cyan-500/20" />
                  Unit #{String(primaryEngineId).padStart(2, '0')} Bin
                </span>
              </div>
              <span>Hover or click any bar to inspect constituent engines</span>
            </div>

            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto select-none"
              role="img"
              aria-label={`Predicted RUL distribution histogram across ${histogram.totalEngines} engines in ${subset}`}
              data-testid="rul-histogram-svg"
            >
              {/* Y-axis horizontal gridlines */}
              {yTicks.map((val) => {
                const y = mapY(val);
                return (
                  <g key={`y-${val}`}>
                    <line
                      x1={pad.left}
                      x2={width - pad.right}
                      y1={y}
                      y2={y}
                      stroke="#1E293B"
                      strokeWidth={1}
                    />
                    <text
                      x={pad.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono tabular-nums"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Axes Baseline & Rotated Y-Axis Title */}
              <line
                x1={pad.left}
                x2={pad.left}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="#334155"
                strokeWidth={1}
              />
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={pad.top + plotH}
                y2={pad.top + plotH}
                stroke="#334155"
                strokeWidth={1}
              />
              <text
                x={15}
                y={pad.top + plotH / 2}
                textAnchor="middle"
                transform={`rotate(-90 15 ${pad.top + plotH / 2})`}
                className="fill-slate-400 text-[10.5px] font-sans"
              >
                Engine Count (units)
              </text>

              {/* Bars */}
              {histogram.bins.map((bin) => {
                const x = pad.left + bin.index * slotW + barGap * 0.5;
                const y = mapY(bin.count);
                const h = Math.max(bin.count > 0 ? 3 : 0, pad.top + plotH - y);
                const palette = ZONE_BAR_COLORS[bin.zone];
                const isSelected = activeBin?.index === bin.index;

                return (
                  <g
                    key={bin.index}
                    role="button"
                    tabIndex={0}
                    aria-label={`RUL bin ${bin.label} cycles, ${palette.zoneLabel}: ${bin.count} engines (${bin.pct.toFixed(1)}%)`}
                    onClick={() => setSelectedBinIdx(bin.index)}
                    onMouseEnter={() => setHoveredBinIdx(bin.index)}
                    onMouseLeave={() => setHoveredBinIdx(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedBinIdx(bin.index);
                      }
                    }}
                    className="cursor-pointer focus:outline-none"
                    data-testid={`histogram-bar-${bin.index}`}
                  >
                    <rect
                      x={pad.left + bin.index * slotW}
                      y={pad.top}
                      width={slotW}
                      height={plotH}
                      fill="transparent"
                    />

                    {bin.count > 0 && (
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={h}
                        rx={3}
                        fill={palette.fill}
                        stroke={bin.containsPrimary ? '#22D3EE' : isSelected ? '#F8FAFC' : palette.stroke}
                        strokeWidth={bin.containsPrimary ? 2 : isSelected ? 1.5 : 1}
                        opacity={(hoveredBinIdx !== null || selectedBinIdx !== null) && !isSelected ? 0.58 : 1}
                      />
                    )}

                    {bin.count > 0 && (
                      <text
                        x={x + barW * 0.5}
                        y={Math.max(pad.top + 10, y - 6)}
                        textAnchor="middle"
                        className={`text-[10px] font-mono tabular-nums ${
                          bin.containsPrimary ? 'fill-cyan-300 font-bold' : 'fill-slate-300'
                        }`}
                      >
                        {bin.count}
                      </text>
                    )}

                    {bin.containsPrimary && (
                      <text
                        x={x + barW * 0.5}
                        y={pad.top - 9}
                        textAnchor="middle"
                        className="fill-cyan-300 text-[9px] font-mono font-bold"
                      >
                        ▼ #{String(primaryEngineId).padStart(2, '0')}
                      </text>
                    )}

                    <text
                      x={x + barW * 0.5}
                      y={height - 24}
                      textAnchor="middle"
                      className={`text-[10px] font-mono tabular-nums ${
                        isSelected ? 'fill-slate-100 font-semibold' : 'fill-slate-400'
                      }`}
                    >
                      {bin.label}
                    </text>
                  </g>
                );
              })}

              {/* Critical Threshold Reference Line */}
              <g>
                <line
                  x1={threshX}
                  x2={threshX}
                  y1={pad.top}
                  y2={pad.top + plotH}
                  stroke="#F43F5E"
                  strokeWidth={1.35}
                  strokeDasharray="4 4"
                />
                <text
                  x={threshX + 4}
                  y={pad.top + 11}
                  textAnchor="start"
                  stroke="#080B12"
                  strokeWidth={3}
                  paintOrder="stroke"
                  className="fill-rose-300 text-[10px] font-mono"
                >
                  τ = {rulThreshold}c
                </text>
              </g>

              {/* Watch Window Boundary Reference Line */}
              {watchX < pad.left + plotW - 12 && (
                <g>
                  <line
                    x1={watchX}
                    x2={watchX}
                    y1={pad.top}
                    y2={pad.top + plotH}
                    stroke="#F59E0B"
                    strokeWidth={1}
                    strokeDasharray="3 4"
                    opacity={0.7}
                  />
                  <text
                    x={watchX + 4}
                    y={pad.top + 22}
                    textAnchor="start"
                    stroke="#080B12"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="fill-amber-300 text-[9.5px] font-mono"
                  >
                    Watch ≤ {watchCutoff}c
                  </text>
                </g>
              )}

              {/* X-axis Units Label */}
              <text
                x={pad.left + plotW * 0.5}
                y={height - 6}
                textAnchor="middle"
                className="fill-slate-400 text-[10.5px] font-sans"
              >
                Predicted Remaining Useful Life Bin (cycles)
              </text>
            </svg>

            {/* Interactive Bin Engine Inspector Footer with Plain-English Explanation */}
            {activeBin && (
              <div
                className="mt-2 pt-3 border-t border-slate-800/80 space-y-2 text-xs"
                data-testid="histogram-bin-inspector"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-mono tabular-nums text-slate-300">
                    Bin <strong className="text-slate-100">{activeBin.label} cyc</strong>:{' '}
                    <span className={ZONE_BAR_COLORS[activeBin.zone].text}>
                      {activeBin.count} unit{activeBin.count === 1 ? '' : 's'} ({activeBin.pct.toFixed(1)}%) ·{' '}
                      {ZONE_BAR_COLORS[activeBin.zone].zoneLabel}
                    </span>
                  </div>

                  {activeBin.engineIds.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeBin.engineIds.map((id) => {
                        const u = unitRulById.get(id);
                        const isActive = id === primaryEngineId;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => onSelectEngine(id)}
                            className={`px-2 py-0.5 rounded border text-[11px] font-mono tabular-nums transition-colors ${
                              isActive
                                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 font-semibold'
                                : 'border-slate-700 bg-[#080B12] text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200'
                            }`}
                          >
                            #{String(id).padStart(2, '0')} · {u ? `${u.predRul.toFixed(1)}c` : ''}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="font-mono text-[11px] text-slate-400">
                      No engines currently reside in this RUL interval
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400">
                  {ZONE_BAR_COLORS[activeBin.zone].zoneNote}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <TechnicalInterpretation
        summary="Shows fleet-wide remaining life spread and which engines sit inside critical vs. watch windows"
        whatItShows="Each 15-cycle bin counts synthetic engines at either the synchronized playback cycle or a staggered mixed-fleet snapshot. Engines left of τ require immediate action, while Watch units sit within 25 cycles of triggering."
        sampleScope={`Evaluated across all ${histogram.totalEngines} synthetic engines in ${subset}`}
        conditionGuide={{
          normal: `Predicted RUL > ${watchCutoff} cycles — healthy operating horizon.`,
          warning: `Predicted RUL between ${rulThreshold} and ${watchCutoff} cycles — approaching maintenance trigger.`,
          critical: `Predicted RUL ≤ ${rulThreshold} cycles — critical intervention threshold reached.`,
        }}
        metrics={['rul', 'preventive_replacement']}
      />
    </section>
  );
};
