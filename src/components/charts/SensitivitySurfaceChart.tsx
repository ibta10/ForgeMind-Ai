import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { ThresholdCostSurfaceCell, ThresholdCostSurfaceResult } from '../../engine/types';
import { TechnicalInterpretation } from './TechnicalInterpretation';

export type SurfaceViewMode = 'risk_aware' | 'threshold' | 'advantage';

interface SensitivitySurfaceChartProps {
  surface: ThresholdCostSurfaceResult;
  viewMode: SurfaceViewMode;
  activePreventiveCost: number;
  activeThreshold: number;
  failureCost?: number;
  evalEngineCount?: number;
  onApplyPoint: (preventiveCost: number, rulThreshold: number) => void;
}

function getCostColor(value: number, minVal: number, maxVal: number): string {
  const span = Math.max(0.001, maxVal - minVal);
  const t = Math.max(0, Math.min(1, (value - minVal) / span));
  if (t < 0.35) {
    // Optimal low-cost zone (emerald/cyan)
    const alpha = 0.42 - t * 0.4;
    return `rgba(16, 185, 129, ${Math.max(0.18, alpha).toFixed(2)})`;
  }
  if (t < 0.7) {
    // Moderate cost zone (cyan/slate)
    const alpha = 0.16 + ((t - 0.35) / 0.35) * 0.25;
    return `rgba(245, 158, 11, ${alpha.toFixed(2)})`;
  }
  // High cost zone (failure penalty region - rose)
  const alpha = 0.28 + ((t - 0.7) / 0.3) * 0.45;
  return `rgba(244, 63, 94, ${alpha.toFixed(2)})`;
}

function getAdvantageColor(deltaPct: number): string {
  if (deltaPct > 0.5) {
    const t = Math.min(1, deltaPct / 25);
    return `rgba(6, 182, 212, ${(0.18 + t * 0.55).toFixed(2)})`;
  }
  if (deltaPct < -0.5) {
    const t = Math.min(1, Math.abs(deltaPct) / 25);
    return `rgba(245, 158, 11, ${(0.18 + t * 0.52).toFixed(2)})`;
  }
  return 'rgba(51, 65, 85, 0.35)';
}

export const SensitivitySurfaceChart: React.FC<SensitivitySurfaceChartProps> = ({
  surface,
  viewMode,
  activePreventiveCost,
  activeThreshold,
  failureCost,
  evalEngineCount,
  onApplyPoint,
}) => {
  const isEmptySurface =
    surface.cells.length === 0 ||
    surface.preventiveCosts.length === 0 ||
    surface.thresholds.length === 0;

  const cellMap = useMemo(() => {
    const map = new Map<string, ThresholdCostSurfaceCell>();
    for (const c of surface.cells) {
      map.set(`${c.preventiveCost}:${c.rulThreshold}`, c);
    }
    return map;
  }, [surface.cells]);

  const nearestCp = useMemo(
    () =>
      surface.preventiveCosts.length > 0
        ? surface.preventiveCosts.reduce((best, cp) =>
            Math.abs(cp - activePreventiveCost) < Math.abs(best - activePreventiveCost) ? cp : best,
          )
        : activePreventiveCost,
    [surface.preventiveCosts, activePreventiveCost],
  );

  const nearestTau = useMemo(
    () =>
      surface.thresholds.length > 0
        ? surface.thresholds.reduce((best, t) =>
            Math.abs(t - activeThreshold) < Math.abs(best - activeThreshold) ? t : best,
          )
        : activeThreshold,
    [surface.thresholds, activeThreshold],
  );

  const [selectedCoord, setSelectedCoord] = useState<{ cp: number; tau: number }>({
    cp: nearestCp,
    tau: nearestTau,
  });

  useEffect(() => {
    setSelectedCoord({ cp: nearestCp, tau: nearestTau });
  }, [nearestCp, nearestTau]);

  const { minCost, maxCost } = useMemo(() => {
    if (surface.cells.length === 0) {
      return { minCost: 0, maxCost: 0 };
    }
    const vals = surface.cells.map((c) =>
      viewMode === 'threshold' ? c.thresholdCostPerCycle : c.riskAwareCostPerCycle,
    );
    return {
      minCost: Math.min(...vals),
      maxCost: Math.max(...vals),
    };
  }, [surface.cells, viewMode]);

  const activeCell =
    cellMap.get(`${selectedCoord.cp}:${selectedCoord.tau}`) ?? surface.cells[0];

  if (isEmptySurface) {
    return (
      <div
        data-testid="sensitivity-2d-empty"
        className="rounded-lg border border-dashed border-slate-700 bg-[#0E131D] p-6 text-center space-y-1.5"
      >
        <div className="text-sm font-medium text-slate-200">
          2D Sensitivity Matrix Unavailable
        </div>
        <p className="text-xs text-slate-400">
          No valid (Preventive Cost Cp, RUL Threshold τ) grid cells exist for the current evaluation cohort.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            2D Cost-per-Cycle Sensitivity Matrix (RUL Threshold τ × Preventive Cost Cp)
          </h3>
          <p className="text-xs text-slate-400">
            {evalEngineCount !== undefined ? `Evaluated on ${evalEngineCount} synthetic eval engines · ` : ''}
            Columns: RUL Threshold τ (cycles) · Rows: Preventive Cost Cp ($) · Cyan ring marks row-optimal threshold
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-mono text-slate-300">
          {viewMode === 'advantage' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-500/70" />
                Threshold cheaper
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-slate-700" />
                Parity
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-cyan-500/75" />
                Conformal cheaper
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-emerald-500/50" />
                Optimal (${minCost.toFixed(3)}/cyc)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-500/45" />
                Moderate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-rose-500/70" />
                High (${maxCost.toFixed(3)}/cyc)
              </span>
            </>
          )}
        </div>
      </div>

      {failureCost !== undefined && failureCost <= activePreventiveCost && (
        <div
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200"
        >
          <strong>Degenerate Economics Notice:</strong> Failure penalty (Cf = ${failureCost}) is not strictly greater than preventive replacement cost (Cp = ${activePreventiveCost}). Predictive replacement yields no economic benefit under this cost ratio.
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div
          className="grid gap-1 min-w-[660px]"
          style={{
            gridTemplateColumns: `88px repeat(${surface.thresholds.length}, minmax(60px, 1fr))`,
          }}
        >
          <div className="flex items-end justify-end pr-2 pb-1 text-[11px] font-mono text-slate-400">
            Cp \ τ
          </div>
          {surface.thresholds.map((tau) => (
            <div
              key={tau}
              className="text-center pb-1 text-[11px] font-mono text-slate-300 tabular-nums"
            >
              {tau} cyc
            </div>
          ))}

          {surface.preventiveCosts.map((cp) => {
            const optimalForRow =
              viewMode === 'threshold'
                ? surface.optimalThresholdByCost[cp]?.rulThreshold
                : surface.optimalRiskByCost[cp]?.rulThreshold;

            return (
              <React.Fragment key={cp}>
                <div className="flex items-center justify-end pr-2.5 text-xs font-mono text-slate-300 tabular-nums">
                  ${cp}
                </div>
                {surface.thresholds.map((tau) => {
                  const cell = cellMap.get(`${cp}:${tau}`);
                  if (!cell) return <div key={tau} />;

                  const isOptimal = tau === optimalForRow && viewMode !== 'advantage';
                  const isSelected = selectedCoord.cp === cp && selectedCoord.tau === tau;

                  const val =
                    viewMode === 'advantage'
                      ? cell.advantagePct
                      : viewMode === 'threshold'
                        ? cell.thresholdCostPerCycle
                        : cell.riskAwareCostPerCycle;

                  const bg =
                    viewMode === 'advantage'
                      ? getAdvantageColor(val)
                      : getCostColor(val, minCost, maxCost);

                  const display =
                    viewMode === 'advantage'
                      ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
                      : `$${val.toFixed(3)}`;

                  const failPct =
                    viewMode === 'threshold'
                      ? cell.thresholdFailureRatePct
                      : cell.riskAwareFailureRatePct;

                  return (
                    <button
                      key={tau}
                      type="button"
                      onMouseEnter={() => setSelectedCoord({ cp, tau })}
                      onClick={() => setSelectedCoord({ cp, tau })}
                      aria-label={`Preventive cost $${cp}, threshold ${tau} cycles: ${display}, failures ${failPct.toFixed(1)}%`}
                      className={`h-11 rounded px-1 flex flex-col items-center justify-center font-mono tabular-nums transition-transform focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                        isSelected
                          ? 'ring-2 ring-white scale-[1.03] z-10'
                          : isOptimal
                            ? 'ring-1 ring-cyan-400'
                            : 'ring-1 ring-slate-800/60 hover:ring-slate-500'
                      }`}
                      style={{ backgroundColor: bg }}
                    >
                      <span className="text-[11px] font-semibold text-slate-100 leading-tight">
                        {display}
                      </span>
                      <span className="text-[9px] text-slate-300/90 leading-tight">
                        {isOptimal ? `★ ${failPct.toFixed(1)}%` : `${failPct.toFixed(1)}% fail`}
                      </span>
                    </button>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {activeCell && (
        <div className="pt-3 border-t border-slate-800/80 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300 font-mono tabular-nums">
              <span>
                Point: <strong className="text-slate-100">Cp=${activeCell.preventiveCost} · τ={activeCell.rulThreshold} cyc</strong>
              </span>
              <span>
                Risk-Aware:{' '}
                <strong className="text-cyan-300">${activeCell.riskAwareCostPerCycle.toFixed(3)}/cyc</strong>{' '}
                ({activeCell.riskAwareFailureRatePct.toFixed(1)}% fail · {activeCell.riskAwareWastedRul.toFixed(1)}c wasted)
              </span>
              <span>
                Threshold:{' '}
                <strong className="text-amber-300">${activeCell.thresholdCostPerCycle.toFixed(3)}/cyc</strong>{' '}
                ({activeCell.thresholdFailureRatePct.toFixed(1)}% fail · {activeCell.thresholdWastedRul.toFixed(1)}c wasted)
              </span>
            </div>

            <button
              type="button"
              onClick={() => onApplyPoint(activeCell.preventiveCost, activeCell.rulThreshold)}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
            >
              Apply Operating Point to Simulator
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Tradeoff summary: At Cp=${activeCell.preventiveCost} and trigger τ={activeCell.rulThreshold} cyc, Conformal Risk-Aware intervention saves ${(activeCell.thresholdCostPerCycle - activeCell.riskAwareCostPerCycle).toFixed(3)}/cyc vs point-thresholding ({activeCell.advantagePct >= 0 ? `+${activeCell.advantagePct.toFixed(1)}%` : `${activeCell.advantagePct.toFixed(1)}%`} advantage).
          </p>
        </div>
      )}

      <TechnicalInterpretation
        title="2D Cost-per-Cycle Sensitivity Matrix"
        summary="Tradeoff map of Preventive Cost Cp versus RUL Trigger Threshold τ"
        whatItShows="Each row fixes a Preventive Replacement Cost Cp ($), and each column sweeps the RUL trigger threshold τ (cycles). Moving left toward small τ delays maintenance and increases catastrophic failure rate; moving right toward high τ cuts failures to near zero at the cost of higher wasted useful life."
        sampleScope={evalEngineCount !== undefined ? `${evalEngineCount} held-out evaluation synthetic engines per grid cell` : undefined}
        metrics={['cost_per_cycle', 'failure_rate', 'wasted_useful_life', 'preventive_replacement']}
      />
    </div>
  );
};
