import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, ShieldCheck } from 'lucide-react';
import {
  analyzeFleetUncertaintyAlerts,
  type CriticalUncertaintyEngineAlert,
  type FleetEngineHealthCard,
} from '../../engine/fleetHealth';
import { MODEL_LABELS } from '../../engine/models';
import type { ModelId, SubsetId } from '../../engine/types';
import { TechnicalInterpretation } from '../charts/TechnicalInterpretation';

interface CriticalUncertaintyAlertPanelProps {
  subset: SubsetId;
  selectedModel: ModelId;
  regimeAware: boolean;
  alpha: number;
  rulThreshold: number;
  cards: FleetEngineHealthCard[];
  onInspectEngine: (engineId: number) => void;
}

type AlertSortMode = 'anomaly' | 'width' | 'lower_bound';

const SENSITIVITY_PRESETS: Array<{ value: number; label: string; shortLabel: string }> = [
  { value: 0.75, label: 'Strict (≥ +0.75σ)', shortLabel: 'Strict +0.75σ' },
  { value: 1.0, label: 'Balanced (≥ +1.00σ)', shortLabel: 'Balanced +1.0σ' },
  { value: 1.5, label: 'Severe (≥ +1.50σ)', shortLabel: 'Severe +1.5σ' },
];

export const CriticalUncertaintyAlertPanel: React.FC<CriticalUncertaintyAlertPanelProps> = ({
  subset,
  selectedModel,
  regimeAware,
  alpha,
  rulThreshold,
  cards,
  onInspectEngine,
}) => {
  const [sigmaCutoff, setSigmaCutoff] = useState<number>(1.0);
  const [sortBy, setSortBy] = useState<AlertSortMode>('anomaly');

  const analysis = useMemo(
    () => analyzeFleetUncertaintyAlerts(cards, { sigmaCutoff }),
    [cards, sigmaCutoff],
  );

  const sortedFlagged = useMemo<CriticalUncertaintyEngineAlert[]>(() => {
    const items = [...analysis.flagged];
    items.sort((a, b) => {
      if (sortBy === 'width') {
        const wd = b.card.conformalIntervalWidth - a.card.conformalIntervalWidth;
        return wd !== 0 ? wd : b.anomalyScore - a.anomalyScore;
      }
      if (sortBy === 'lower_bound') {
        const ld = a.card.conformalLowerAtObserved - b.card.conformalLowerAtObserved;
        return ld !== 0 ? ld : b.anomalyScore - a.anomalyScore;
      }
      return b.anomalyScore - a.anomalyScore;
    });
    return items;
  }, [analysis.flagged, sortBy]);

  const nominalPct = ((1 - alpha) * 100).toFixed(0);

  return (
    <section
      data-testid="critical-uncertainty-alert-panel"
      className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4"
      aria-label="Critical Engine Alert Panel"
    >
      {/* Panel Header & Interactive Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <h3 className="font-display text-sm sm:text-base font-semibold text-slate-100">
              Critical Engine Alert — Conformal High-Uncertainty Outliers ({subset})
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Dynamically flags units whose {nominalPct}% conformal RUL prediction band (
            {MODEL_LABELS[selectedModel]}, {regimeAware ? 'Regime-Aware' : 'Global'}), trailing
            trajectory volatility, or threshold boundary straddle exceeds +{sigmaCutoff.toFixed(2)}σ
            above fleet expectation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 max-w-full">
          <div
            className="flex flex-wrap items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5 max-w-full"
            role="group"
            aria-label="Conformal Uncertainty Cutoff"
          >
            {SENSITIVITY_PRESETS.map((preset) => {
              const active = Math.abs(sigmaCutoff - preset.value) < 0.01;
              return (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSigmaCutoff(preset.value)}
                  className={`px-2 sm:px-2.5 py-1 text-[11px] font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {preset.shortLabel}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="uncertainty-alert-sort" className="text-xs text-slate-400 whitespace-nowrap">
              Sort
            </label>
            <select
              id="uncertainty-alert-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as AlertSortMode)}
              className="rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1 text-xs font-mono text-slate-100"
            >
              <option value="anomaly">Anomaly Score (σ)</option>
              <option value="width">Widest Interval (cyc)</option>
              <option value="lower_bound">Lowest Lower Bound</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inline Baseline Strip (no nested cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-3 border-y border-slate-800/80 text-xs">
        <div>
          <div className="text-slate-400">Flagged Uncertainty Outliers</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-rose-300">
            <span data-testid="uncertainty-alert-count">{analysis.flaggedCount}</span>{' '}
            <span className="text-xs font-normal text-slate-400">/ {cards.length} units</span>
          </div>
        </div>

        <div>
          <div className="text-slate-400">Fleet Conformal Width (Mean / Med)</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-100">
            {analysis.fleetMeanWidth.toFixed(1)}c{' '}
            <span className="text-xs font-normal text-slate-400">
              / {analysis.fleetMedianWidth.toFixed(1)}c
            </span>
          </div>
        </div>

        <div>
          <div className="text-slate-400">Peak Fleet Interval Width</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-amber-300">
            {analysis.fleetMaxWidth.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">
              cyc (±{analysis.fleetStdWidth.toFixed(1)} SD)
            </span>
          </div>
        </div>

        <div>
          <div className="text-slate-400">Boundary Straddles (LB ≤ {rulThreshold}c &lt; Pred)</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-cyan-300">
            {analysis.straddleCount}{' '}
            <span className="text-xs font-normal text-slate-400">
              {analysis.straddleCount === 1 ? 'unit' : 'units'}
            </span>
          </div>
        </div>
      </div>

      {/* Empty State or Dynamic Alert Table */}
      {sortedFlagged.length === 0 ? (
        <div
          data-testid="uncertainty-alert-empty"
          className="py-6 px-4 text-center space-y-2.5"
        >
          <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-300">
            <ShieldCheck className="w-4 h-4" />
            <span>No High-Uncertainty Outliers Above +{sigmaCutoff.toFixed(2)}σ</span>
          </div>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            All {cards.length} units in {subset} sit within expected conformal prediction bounds for{' '}
            {MODEL_LABELS[selectedModel]}. Lower the sensitivity cutoff to inspect borderline
            intervals.
          </p>
          <button
            type="button"
            onClick={() => setSigmaCutoff(0.75)}
            className="px-3 py-1.5 rounded-md border border-slate-700 bg-[#080B12] text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Switch to Strict Cutoff (+0.75σ)
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Dense Telemetry Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400">
                  <th className="py-2 pr-3 font-medium">Unit &amp; Cycle</th>
                  <th className="py-2 px-3 font-medium text-right">Pred RUL</th>
                  <th className="py-2 px-3 font-medium text-right">{nominalPct}% Conformal Band</th>
                  <th className="py-2 px-3 font-medium text-right">Interval Width</th>
                  <th className="py-2 px-3 font-medium text-right">Step Volatility</th>
                  <th className="py-2 px-3 font-medium text-right">Uncertainty Z</th>
                  <th className="py-2 px-3 font-medium">Flag Reason</th>
                  <th className="py-2 pl-3 font-medium text-right">Telemetry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {sortedFlagged.map((item) => {
                  const { card, anomalyScore, widthExcessPct, severity, reasons } = item;
                  const isSevere = severity === 'severe';
                  return (
                    <tr
                      key={card.engineId}
                      data-testid={`uncertainty-alert-row-${card.engineId}`}
                      className="hover:bg-slate-800/35 transition-colors"
                    >
                      <td className="py-2.5 pr-3 font-mono tabular-nums whitespace-nowrap">
                        <span className="font-semibold text-slate-100">
                          Unit #{String(card.engineId).padStart(2, '0')}
                        </span>
                        <span className="ml-2 text-[11px] text-slate-400">
                          c{card.observedCycle}/{card.failureCycle} · {card.split}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-200 whitespace-nowrap">
                        {card.predRulAtObserved.toFixed(1)}c
                      </td>

                      <td className="py-2.5 px-3 font-mono tabular-nums text-right text-amber-300 whitespace-nowrap">
                        [{card.conformalLowerAtObserved.toFixed(1)},{' '}
                        {card.conformalUpperAtObserved.toFixed(1)}]
                      </td>

                      <td className="py-2.5 px-3 font-mono tabular-nums text-right whitespace-nowrap">
                        <span className="font-semibold text-slate-100">
                          {card.conformalIntervalWidth.toFixed(1)}c
                        </span>
                        <span className="ml-1.5 text-[11px] text-slate-400">
                          ({widthExcessPct >= 0 ? '+' : ''}
                          {widthExcessPct.toFixed(1)}%)
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-300 whitespace-nowrap">
                        ±{card.localPredVolatility.toFixed(2)} c/s
                      </td>

                      <td className="py-2.5 px-3 font-mono tabular-nums text-right whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            isSevere ? 'text-rose-400' : 'text-amber-300'
                          }`}
                        >
                          +{anomalyScore.toFixed(2)}σ · {isSevere ? 'Severe' : 'Elevated'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-slate-300 min-w-[190px]">
                        {reasons.join(' · ')}
                      </td>

                      <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onInspectEngine(card.engineId)}
                          aria-label={`Inspect high-uncertainty Unit ${card.engineId}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 bg-[#080B12] text-[11px] font-medium text-cyan-300 hover:bg-slate-800 transition-colors whitespace-nowrap"
                        >
                          Inspect
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked List (no horizontal overflow on 390px) */}
          <div className="md:hidden divide-y divide-slate-800/80">
            {sortedFlagged.map((item) => {
              const { card, anomalyScore, widthExcessPct, severity, reasons } = item;
              const isSevere = severity === 'severe';
              return (
                <div key={card.engineId} className="py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-xs tabular-nums">
                      <span className="font-semibold text-slate-100">
                        Unit #{String(card.engineId).padStart(2, '0')}
                      </span>
                      <span className="ml-2 text-slate-400">
                        c{card.observedCycle}/{card.failureCycle}
                      </span>
                    </div>
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums ${
                        isSevere ? 'text-rose-400' : 'text-amber-300'
                      }`}
                    >
                      +{anomalyScore.toFixed(2)}σ ({isSevere ? 'Severe' : 'Elevated'})
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-slate-300">
                    <span>
                      Pred {card.predRulAtObserved.toFixed(1)}c · Band [
                      {card.conformalLowerAtObserved.toFixed(1)},{' '}
                      {card.conformalUpperAtObserved.toFixed(1)}]
                    </span>
                    <span className="text-slate-200">
                      Width {card.conformalIntervalWidth.toFixed(1)}c ({widthExcessPct >= 0 ? '+' : ''}
                      {widthExcessPct.toFixed(1)}%)
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[11px] text-slate-400">{reasons.join(' · ')}</span>
                    <button
                      type="button"
                      onClick={() => onInspectEngine(card.engineId)}
                      aria-label={`Inspect flagged mobile Unit ${card.engineId}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 bg-[#080B12] text-[11px] font-medium text-cyan-300 hover:bg-slate-800 shrink-0"
                    >
                      Inspect
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <TechnicalInterpretation
        title="High-Uncertainty Outlier Detection"
        summary="Flags units with wide conformal intervals, prediction volatility, or τ straddles"
        whatItShows="Units are ranked by a standardized Anomaly Z-score combining conformal interval width excess above fleet median, trailing prediction step volatility, and whether the conformal lower bound (LB) straddles the maintenance threshold τ while the point estimate stays above τ."
        sampleScope={`${cards.length} monitored synthetic engines in ${subset}`}
        conditionGuide={{
          normal: 'Conformal prediction band is tight and well clear of the safety trigger τ.',
          warning: 'Elevated interval width (+0.75σ–1.5σ) or LB straddling τ while Pred RUL stays above τ.',
          critical: 'Severe uncertainty anomaly (≥ +1.5σ) near maintenance boundary.',
        }}
        metrics={['interval_width', 'conformal_coverage', 'rul']}
      />
    </section>
  );
};
