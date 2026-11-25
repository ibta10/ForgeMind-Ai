import React, { useMemo, useState } from 'react';
import type { MaintenanceRoiResult, PolicyId } from '../../engine/types';
import { TechnicalInterpretation } from './TechnicalInterpretation';

interface MaintenanceRoiChartProps {
  roi: MaintenanceRoiResult;
  preventiveCost: number;
  failureCost: number;
}

type ChartMode = 'cumulative_engines' | 'horizon_10k';

const POLICY_STYLES: Record<
  PolicyId,
  { color: string; dashed?: boolean; width: number; shortLabel: string }
> = {
  run_to_failure: { color: '#EF4444', dashed: true, width: 1.5, shortLabel: 'Reactive' },
  fixed_interval: { color: '#94A3B8', width: 1.75, shortLabel: 'Fixed Interval' },
  threshold: { color: '#F59E0B', width: 2, shortLabel: 'RUL Threshold' },
  risk_aware: { color: '#06B6D4', width: 2.6, shortLabel: 'Risk-Aware' },
  oracle: { color: '#10B981', dashed: true, width: 1.6, shortLabel: 'Oracle' },
};

function formatCurrency(val: number): string {
  const abs = Math.abs(Math.round(val)).toLocaleString('en-US');
  if (val < 0) return `-$${abs}`;
  return `$${abs}`;
}

function formatSignedCurrency(val: number): string {
  const abs = Math.abs(Math.round(val)).toLocaleString('en-US');
  if (val > 0) return `+$${abs}`;
  if (val < 0) return `-$${abs}`;
  return '$0';
}

export const MaintenanceRoiChart: React.FC<MaintenanceRoiChartProps> = ({
  roi,
  preventiveCost,
  failureCost,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('cumulative_engines');
  const [showOracle, setShowOracle] = useState<boolean>(true);
  const [focusedPolicy, setFocusedPolicy] = useState<PolicyId | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const riskPolicy = roi.policies.find((p) => p.policy === 'risk_aware');
  const thresholdPolicy = roi.policies.find((p) => p.policy === 'threshold');
  const hasPolicies = roi.policies.length > 0 && roi.evalEngineCount > 0;

  const visiblePolicies = useMemo(
    () =>
      roi.policies.filter((p) => (p.policy === 'oracle' ? showOracle : true)),
    [roi.policies, showOracle],
  );

  const breakdownPolicies = useMemo(() => {
    const order: PolicyId[] = ['risk_aware', 'threshold', 'fixed_interval', 'oracle'];
    return order
      .map((id) => roi.policies.find((p) => p.policy === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
  }, [roi.policies]);

  const width = 680;
  const height = 294;
  const pad = { top: 22, right: 20, bottom: 48, left: 74 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const chartData = useMemo(() => {
    const horizonTicks = [0, 2000, 4000, 6000, 8000, 10000];

    if (chartMode === 'horizon_10k') {
      const series = visiblePolicies.map((p) => {
        const cpcDelta = roi.baselineCostPerCycle - p.costPerCycle;
        const points = horizonTicks.map((cyc, idx) => ({
          idx,
          x: cyc,
          label: `${(cyc / 1000).toFixed(0)}k cyc`,
          y: Number((cpcDelta * cyc).toFixed(1)),
          failed: false,
        }));
        return { policy: p.policy, label: p.label, points };
      });
      return { xValues: horizonTicks, series };
    }

    const firstSeries = visiblePolicies[0]?.episodesSeries ?? [];
    const xValues = [0, ...firstSeries.map((pt) => pt.step)];

    const series = visiblePolicies.map((p) => {
      const points = [
        {
          idx: 0,
          x: 0,
          label: 'Start (0 units)',
          y: 0,
          failed: false,
        },
        ...p.episodesSeries.map((pt, i) => ({
          idx: i + 1,
          x: pt.step,
          label: `Unit #${String(pt.engineId).padStart(2, '0')} (Step ${pt.step})`,
          y: pt.cumulativeSavings,
          failed: pt.failed,
        })),
      ];
      return { policy: p.policy, label: p.label, points };
    });

    return { xValues, series };
  }, [chartMode, visiblePolicies, roi.baselineCostPerCycle]);

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const xs = chartData.xValues;
    const ys: number[] = [0];
    for (const s of chartData.series) {
      for (const pt of s.points) {
        ys.push(pt.y);
      }
    }
    const minX = xs.length > 0 ? Math.min(...xs) : 0;
    const maxX = xs.length > 0 ? Math.max(...xs) : 10;
    const rawMinY = Math.min(...ys);
    const rawMaxY = Math.max(...ys);
    const span = Math.max(200, rawMaxY - rawMinY);
    return {
      xMin: minX,
      xMax: maxX === minX ? minX + 1 : maxX,
      yMin: rawMinY < 0 ? rawMinY - span * 0.1 : 0 - span * 0.06,
      yMax: rawMaxY > 0 ? rawMaxY + span * 0.1 : span * 0.15,
    };
  }, [chartData]);

  const mapX = (x: number) => pad.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const mapY = (y: number) => pad.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  const yTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => {
      const val = yMin + ((yMax - yMin) * i) / count;
      return { val, y: mapY(val) };
    });
  }, [yMin, yMax, plotH]);

  const xTicks = useMemo(() => {
    if (chartMode === 'horizon_10k') {
      return [0, 2500, 5000, 7500, 10000].map((v) => ({
        val: v,
        label: v === 0 ? '0' : `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`,
        x: mapX(v),
      }));
    }
    const maxStep = Math.max(1, xMax);
    const stepCount = Math.min(4, maxStep);
    const ticks: Array<{ val: number; label: string; x: number }> = [];
    for (let i = 0; i <= stepCount; i++) {
      const val = Math.round((maxStep * i) / stepCount);
      if (ticks.some((t) => t.val === val)) continue;
      ticks.push({
        val,
        label: val === 0 ? '0' : `E${val}`,
        x: mapX(val),
      });
    }
    return ticks;
  }, [chartMode, xMax, plotW]);

  const zeroY = mapY(0);

  const riskAreaPath = useMemo(() => {
    const riskSeries = chartData.series.find((s) => s.policy === 'risk_aware');
    if (!riskSeries || riskSeries.points.length < 2) return '';
    const linePart = riskSeries.points
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.x).toFixed(1)} ${mapY(pt.y).toFixed(1)}`)
      .join(' ');
    const lastX = mapX(riskSeries.points[riskSeries.points.length - 1].x).toFixed(1);
    const firstX = mapX(riskSeries.points[0].x).toFixed(1);
    return `${linePart} L ${lastX} ${zeroY.toFixed(1)} L ${firstX} ${zeroY.toFixed(1)} Z`;
  }, [chartData, zeroY, xMin, xMax, yMin, yMax]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (chartData.xValues.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const dataX = xMin + ((relX - pad.left) / plotW) * (xMax - xMin);
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < chartData.xValues.length; i++) {
      const d = Math.abs(chartData.xValues[i] - dataX);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
  };

  const activeStepX =
    hoverIdx !== null && chartData.xValues[hoverIdx] !== undefined
      ? chartData.xValues[hoverIdx]
      : null;

  const isPositiveRiskRoi = (riskPolicy?.savingsPer10kCycles ?? 0) >= 0;
  const tooltipLeftPct = activeStepX !== null ? (mapX(activeStepX) / width) * 100 : 50;
  const tooltipAlignRight = tooltipLeftPct > 58;

  const xAxisTitle =
    chartMode === 'cumulative_engines'
      ? `Evaluation Episode Sequence (${roi.evalEngineCount} Disjoint Units)`
      : 'Projected Fleet Horizon (Operating Cycles)';

  return (
    <section
      className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-5"
      aria-labelledby="maintenance-roi-heading"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="maintenance-roi-heading" className="font-display text-base font-semibold text-slate-100">
            Maintenance ROI vs. Reactive Baseline ({roi.evalEngineCount} Evaluation Engines)
          </h3>
          <p className="text-xs text-slate-400">
            Net cost savings relative to unscheduled run-to-failure at Cp=${preventiveCost} vs. Cf=${failureCost} ({(failureCost / Math.max(1, preventiveCost)).toFixed(1)}× penalty)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowOracle((v) => !v)}
            aria-pressed={showOracle}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              showOracle
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            {showOracle ? 'Oracle Ceiling: Shown' : 'Oracle Ceiling: Hidden'}
          </button>

          <div
            role="group"
            aria-label="ROI projection scale"
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
          >
            <button
              type="button"
              onClick={() => {
                setChartMode('cumulative_engines');
                setHoverIdx(null);
              }}
              aria-pressed={chartMode === 'cumulative_engines'}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                chartMode === 'cumulative_engines'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cumulative Fleet ($)
            </button>
            <button
              type="button"
              onClick={() => {
                setChartMode('horizon_10k');
                setHoverIdx(null);
              }}
              aria-pressed={chartMode === 'horizon_10k'}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                chartMode === 'horizon_10k'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              10k-Cycle Horizon
            </button>
          </div>
        </div>
      </div>

      {!hasPolicies ? (
        <div
          data-testid="maintenance-roi-empty"
          className="rounded-md border border-dashed border-slate-800 bg-[#080B12] px-4 py-12 text-center text-xs text-slate-400"
        >
          No evaluation episodes available to compute maintenance ROI curves.
        </div>
      ) : (
        <>
          {/* 4-Column ROI Summary Strip (hairline divider, zero nested cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-800/80">
            <div>
              <div className="text-xs text-slate-400">Net Savings / 10k Operating Cycles</div>
              <div
                data-testid="roi-savings-10k"
                className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                  isPositiveRiskRoi ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatSignedCurrency(riskPolicy?.savingsPer10kCycles ?? 0)}
              </div>
              <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
                vs. {formatCurrency(roi.baselineSpendPer10kCycles)} reactive spend
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Cost Reduction &amp; Return on Spend</div>
              <div
                data-testid="roi-reduction-pct"
                className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                  (riskPolicy?.costReductionPct ?? 0) >= 0 ? 'text-cyan-300' : 'text-rose-400'
                }`}
              >
                {(riskPolicy?.costReductionPct ?? 0) >= 0
                  ? `-${(riskPolicy?.costReductionPct ?? 0).toFixed(1)}%`
                  : `+${Math.abs(riskPolicy?.costReductionPct ?? 0).toFixed(1)}%`}
              </div>
              <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
                ROI multiple {(riskPolicy?.roiPct ?? 0) >= 0 ? '+' : ''}
                {(riskPolicy?.roiPct ?? 0).toFixed(1)}% on policy spend
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">
                Realized Eval Savings ({roi.evalEngineCount} Engines)
              </div>
              <div
                data-testid="roi-eval-realized"
                className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                  (riskPolicy?.realizedEvalSavings ?? 0) >= 0 ? 'text-slate-100' : 'text-rose-400'
                }`}
              >
                {formatSignedCurrency(riskPolicy?.realizedEvalSavings ?? 0)}
              </div>
              <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
                RUL Threshold: {formatSignedCurrency(thresholdPolicy?.realizedEvalSavings ?? 0)}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Unplanned Failures Avoided</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
                {riskPolicy?.avoidedFailures ?? 0}
                <span className="ml-1.5 text-sm font-normal text-slate-400">
                  / {roi.baselineFailureCount}
                </span>
              </div>
              <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
                {riskPolicy?.failureRatePct.toFixed(1)}% residual failure vs 100.0% reactive
              </div>
            </div>
          </div>

          {/* Main Split View: Trajectory Chart + Policy Spend/Savings Comparison */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 pt-4 border-t border-slate-800/80 items-start">
            {/* Left: SVG Cumulative Savings Plot */}
            <div className="xl:col-span-7 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-200">
                  {chartMode === 'cumulative_engines'
                    ? `Cumulative Net Cost Savings Across ${roi.evalEngineCount} Evaluation Engines ($)`
                    : 'Projected Fleet Savings Over 10,000 Operating Cycles ($)'}
                </span>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-rose-500" />
                    Reactive ($0)
                  </span>
                  {chartData.series.map((s) => {
                    const st = POLICY_STYLES[s.policy];
                    return (
                      <span key={s.policy} className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-0.5 w-3"
                          style={{
                            backgroundColor: st.dashed ? 'transparent' : st.color,
                            borderTop: st.dashed ? `2px dashed ${st.color}` : undefined,
                          }}
                        />
                        {st.shortLabel}
                      </span>
                    );
                  })}
                  {chartMode === 'cumulative_engines' && (
                    <span className="inline-flex items-center gap-1 text-rose-300">
                      <span className="inline-block h-2 w-2 rounded-full border border-rose-400 bg-[#080B12]" />
                      Unplanned Failure
                    </span>
                  )}
                </div>
              </div>

              <div className="relative">
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  className="w-full h-auto cursor-crosshair select-none"
                  role="img"
                  aria-label="Maintenance ROI savings compared to baseline reactive maintenance"
                  data-testid="maintenance-roi-svg"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  {/* Horizontal grid lines */}
                  {yTicks.map((t, i) => (
                    <g key={i}>
                      <line
                        x1={pad.left}
                        x2={width - pad.right}
                        y1={t.y}
                        y2={t.y}
                        stroke="#1E293B"
                        strokeWidth={1}
                      />
                      <text
                        x={pad.left - 8}
                        y={t.y + 4}
                        textAnchor="end"
                        className="fill-slate-400 text-[10px] font-mono tabular-nums"
                      >
                        {formatCurrency(t.val)}
                      </text>
                    </g>
                  ))}

                  {/* Vertical grid lines */}
                  {xTicks.map((t, i) => (
                    <g key={i}>
                      <line
                        x1={t.x}
                        x2={t.x}
                        y1={pad.top}
                        y2={height - pad.bottom}
                        stroke="#1E293B"
                        strokeWidth={0.6}
                        strokeDasharray="2 3"
                      />
                      <text
                        x={t.x}
                        y={height - pad.bottom + 14}
                        textAnchor="middle"
                        className="fill-slate-400 text-[10px] font-mono tabular-nums"
                      >
                        {t.label}
                      </text>
                    </g>
                  ))}

                  {/* Axes Frame & Titles */}
                  <line
                    x1={pad.left}
                    x2={pad.left}
                    y1={pad.top}
                    y2={height - pad.bottom}
                    stroke="#334155"
                    strokeWidth={1}
                  />
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={height - pad.bottom}
                    y2={height - pad.bottom}
                    stroke="#334155"
                    strokeWidth={1}
                  />
                  <text
                    x={pad.left + plotW / 2}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10.5px] font-sans"
                  >
                    {xAxisTitle}
                  </text>
                  <text
                    x={15}
                    y={pad.top + plotH / 2}
                    textAnchor="middle"
                    transform={`rotate(-90 15 ${pad.top + plotH / 2})`}
                    className="fill-slate-400 text-[10.5px] font-sans"
                  >
                    Cumulative Net Savings ($)
                  </text>

                  {/* Shaded Risk-Aware savings area relative to $0 reactive baseline */}
                  {riskAreaPath && (
                    <path
                      d={riskAreaPath}
                      fill={
                        isPositiveRiskRoi
                          ? 'rgba(6, 182, 212, 0.14)'
                          : 'rgba(244, 63, 94, 0.14)'
                      }
                      stroke="none"
                    />
                  )}

                  {/* $0 Reactive Baseline Break-Even Line */}
                  <g>
                    <line
                      x1={pad.left}
                      x2={width - pad.right}
                      y1={zeroY}
                      y2={zeroY}
                      stroke="#EF4444"
                      strokeWidth={1.35}
                      strokeDasharray="5 4"
                    />
                    <text
                      x={width - pad.right - 4}
                      y={zeroY - 6}
                      textAnchor="end"
                      className="fill-rose-400 text-[10px] font-mono"
                    >
                      Reactive Baseline ($0 break-even)
                    </text>
                  </g>

                  {/* Policy Trajectories */}
                  {chartData.series.map((s) => {
                    const st = POLICY_STYLES[s.policy];
                    const isDimmed = focusedPolicy !== null && focusedPolicy !== s.policy;
                    const d = s.points
                      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.x).toFixed(1)} ${mapY(pt.y).toFixed(1)}`)
                      .join(' ');
                    return (
                      <g key={s.policy} opacity={isDimmed ? 0.25 : 1}>
                        <path
                          d={d}
                          fill="none"
                          stroke={st.color}
                          strokeWidth={focusedPolicy === s.policy ? st.width + 1 : st.width}
                          strokeDasharray={st.dashed ? '5 4' : undefined}
                        />
                        {chartMode === 'cumulative_engines' &&
                          s.points.slice(1).map((pt) =>
                            pt.failed ? (
                              <circle
                                key={`${s.policy}-fail-${pt.x}`}
                                cx={mapX(pt.x)}
                                cy={mapY(pt.y)}
                                r={3}
                                fill="#080B12"
                                stroke="#F43F5E"
                                strokeWidth={1.6}
                              />
                            ) : null,
                          )}
                      </g>
                    );
                  })}

                  {/* Interactive Hover Crosshair */}
                  {activeStepX !== null && hoverIdx !== null && (
                    <g>
                      <line
                        x1={mapX(activeStepX)}
                        x2={mapX(activeStepX)}
                        y1={pad.top}
                        y2={height - pad.bottom}
                        stroke="#64748B"
                        strokeWidth={1}
                      />
                      {chartData.series.map((s) => {
                        const pt = s.points[hoverIdx];
                        if (!pt) return null;
                        return (
                          <circle
                            key={`hover-${s.policy}`}
                            cx={mapX(pt.x)}
                            cy={mapY(pt.y)}
                            r={3.5}
                            fill={POLICY_STYLES[s.policy].color}
                            stroke="#080B12"
                            strokeWidth={1.5}
                          />
                        );
                      })}
                    </g>
                  )}
                </svg>

                {/* Floating Hover Tooltip */}
                {hoverIdx !== null && chartData.series[0]?.points[hoverIdx] && (
                  <div
                    role="status"
                    className="pointer-events-none hidden sm:block absolute top-2 z-20 w-60 rounded-md border border-slate-700/90 bg-[#080B12]/95 px-3 py-2 text-[11px] shadow-xl"
                    style={{
                      left: tooltipAlignRight
                        ? `calc(${tooltipLeftPct.toFixed(1)}% - 252px)`
                        : `calc(${tooltipLeftPct.toFixed(1)}% + 12px)`,
                    }}
                  >
                    <div className="border-b border-slate-800 pb-1 font-mono font-semibold text-slate-100">
                      {chartData.series[0].points[hoverIdx].label}
                    </div>
                    <div className="mt-1 space-y-0.5 font-mono tabular-nums">
                      {chartData.series.map((s) => {
                        const pt = s.points[hoverIdx];
                        if (!pt) return null;
                        return (
                          <div key={s.policy} className="flex items-center justify-between gap-2">
                            <span style={{ color: POLICY_STYLES[s.policy].color }}>
                              {POLICY_STYLES[s.policy].shortLabel}
                              {pt.failed ? ' (Fail)' : ''}
                            </span>
                            <span className="text-slate-100">{formatSignedCurrency(pt.y)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 leading-snug">
                      Positive slopes indicate savings accrued vs. running every unit until Cf=${failureCost} failure.
                    </p>
                  </div>
                )}
              </div>

              {/* Monospace Interactive Readout */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-xs font-mono tabular-nums text-slate-400">
                <span>
                  {hoverIdx !== null && chartData.series[0]?.points[hoverIdx]
                    ? chartData.series[0].points[hoverIdx].label
                    : 'Hover trajectory to inspect net savings vs. reactive baseline'}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  {hoverIdx !== null &&
                    chartData.series.map((s) => {
                      const pt = s.points[hoverIdx];
                      if (!pt) return null;
                      return (
                        <span key={s.policy} style={{ color: POLICY_STYLES[s.policy].color }}>
                          {POLICY_STYLES[s.policy].shortLabel}: {formatSignedCurrency(pt.y)}
                        </span>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Right: Policy Spend vs. Savings Breakdown (10k Cycle Basis) */}
            <div className="xl:col-span-5 space-y-3">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-slate-200">
                  10k-Cycle Spend vs. Net Savings Breakdown
                </span>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  Baseline: {formatCurrency(roi.baselineSpendPer10kCycles)}
                </span>
              </div>

              <div className="divide-y divide-slate-800/70">
                {breakdownPolicies.map((p) => {
                  const st = POLICY_STYLES[p.policy];
                  const maxSpend = Math.max(
                    1,
                    roi.baselineSpendPer10kCycles,
                    ...breakdownPolicies.map((item) => item.policySpendPer10kCycles),
                  );
                  const spendPct = Math.min(100, (p.policySpendPer10kCycles / maxSpend) * 100);
                  const baselinePct = Math.min(100, (roi.baselineSpendPer10kCycles / maxSpend) * 100);
                  const savedWidthPct = Math.max(0, baselinePct - spendPct);
                  const isHighlighted = focusedPolicy === p.policy;
                  const isRisk = p.policy === 'risk_aware';

                  return (
                    <button
                      key={p.policy}
                      type="button"
                      onMouseEnter={() => setFocusedPolicy(p.policy)}
                      onMouseLeave={() => setFocusedPolicy(null)}
                      onClick={() =>
                        setFocusedPolicy((prev) => (prev === p.policy ? null : p.policy))
                      }
                      className={`w-full text-left py-2.5 px-2 rounded transition-colors ${
                        isHighlighted
                          ? 'bg-slate-800/50'
                          : isRisk
                            ? 'bg-cyan-500/[0.04] hover:bg-slate-800/40'
                            : 'hover:bg-slate-800/35'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span
                            className="font-medium truncate"
                            style={{ color: isRisk ? '#67E8F9' : '#E2E8F0' }}
                          >
                            {p.label}
                          </span>
                          <span className="text-slate-600" aria-hidden="true">·</span>
                          <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
                            {p.avoidedFailures} fail avoided
                          </span>
                        </div>

                        <div className="font-mono tabular-nums text-xs shrink-0">
                          <span
                            className={
                              p.savingsPer10kCycles >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'
                            }
                          >
                            {formatSignedCurrency(p.savingsPer10kCycles)}
                          </span>
                          <span className="ml-1.5 text-[11px] text-slate-400">
                            ({p.costReductionPct >= 0 ? `-${p.costReductionPct.toFixed(1)}%` : `+${Math.abs(p.costReductionPct).toFixed(1)}%`})
                          </span>
                        </div>
                      </div>

                      <div className="mt-1.5 relative h-4 w-full rounded bg-slate-900 border border-slate-800/80 overflow-hidden flex">
                        <div
                          className="h-full transition-all duration-200"
                          style={{
                            width: `${spendPct}%`,
                            backgroundColor: st.color,
                            opacity: 0.78,
                          }}
                          title={`Policy spend: ${formatCurrency(p.policySpendPer10kCycles)} / 10k cyc`}
                        />
                        {savedWidthPct > 0 && (
                          <div
                            className="h-full bg-emerald-500/20 border-l border-emerald-400/50 transition-all duration-200"
                            style={{ width: `${savedWidthPct}%` }}
                            title={`Saved vs reactive: ${formatSignedCurrency(p.savingsPer10kCycles)} / 10k cyc`}
                          />
                        )}
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
                        <span>Spend {formatCurrency(p.policySpendPer10kCycles)} / 10k cyc</span>
                        <span>ROI {p.roiPct >= 0 ? '+' : ''}{p.roiPct.toFixed(1)}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <TechnicalInterpretation
        summary="Compares cumulative maintenance savings against unscheduled run-to-failure break-even"
        whatItShows="Lines above the $0 dashed break-even reference indicate cumulative savings achieved over reactive run-to-failure (every unit incurring Cf). Hollow red markers highlight individual episodes where an unplanned failure reduced net savings."
        sampleScope={`Evaluated across ${roi.evalEngineCount} disjoint evaluation synthetic engines`}
        metrics={['cost_per_cycle', 'preventive_replacement', 'failure_rate']}
      />
    </section>
  );
};
