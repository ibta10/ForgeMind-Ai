import React, { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import {
  comparePolicyConfigurations,
  POLICY_LABELS,
} from '../../engine/maintenance';
import { MODEL_LABELS, MODEL_ORDER } from '../../engine/models';
import { TechnicalInterpretation } from '../charts/TechnicalInterpretation';
import type {
  EngineTrajectory,
  MaintenanceParams,
  ModelId,
  PolicyComparisonConfig,
  PolicyId,
  SubsetId,
} from '../../engine/types';

interface PolicyConfigComparatorProps {
  subset: SubsetId;
  fleet: EngineTrajectory[];
  params: MaintenanceParams;
  rulCap: number;
}

const COMPARABLE_POLICIES: PolicyId[] = [
  'risk_aware',
  'threshold',
  'fixed_interval',
  'run_to_failure',
  'oracle',
];

function formatDeltaCurrency(val: number): string {
  const abs = Math.abs(Math.round(val)).toLocaleString('en-US');
  if (val > 0) return `+$${abs}`;
  if (val < 0) return `-$${abs}`;
  return '$0';
}

function formatDeltaNumber(val: number, decimals: number, suffix = ''): string {
  const abs = Math.abs(val).toFixed(decimals);
  if (val > 0) return `+${abs}${suffix}`;
  if (val < 0) return `-${abs}${suffix}`;
  return `0.${'0'.repeat(decimals)}${suffix}`;
}

export const PolicyConfigComparator: React.FC<PolicyConfigComparatorProps> = ({
  subset,
  fleet,
  params,
  rulCap,
}) => {
  const [configA, setConfigA] = useState<PolicyComparisonConfig>(() => ({
    policy: 'risk_aware',
    model: params.model,
    regimeAware: true,
    alpha: params.alpha,
    autoTune: true,
    rulThreshold: params.rulThreshold,
    fixedInterval: params.fixedInterval,
  }));

  const [configB, setConfigB] = useState<PolicyComparisonConfig>(() => ({
    policy: 'threshold',
    model: params.model,
    regimeAware: true,
    alpha: params.alpha,
    autoTune: true,
    rulThreshold: params.rulThreshold,
    fixedInterval: params.fixedInterval,
  }));

  const comparison = useMemo(
    () =>
      comparePolicyConfigurations(
        fleet,
        configA,
        configB,
        {
          subset,
          preventiveCost: params.preventiveCost,
          failureCost: params.failureCost,
          riskMultiplier: params.riskMultiplier,
          seed: params.seed,
        },
        rulCap,
      ),
    [fleet, configA, configB, subset, params.preventiveCost, params.failureCost, params.riskMultiplier, params.seed, rulCap],
  );

  const { resultA, resultB, deltas } = comparison;
  const sumA = resultA.summary;
  const sumB = resultB.summary;

  const applyPreset = (
    preset:
      | 'risk_vs_threshold'
      | 'regime_vs_global'
      | 'gbt_vs_linear'
      | 'alpha_strict_vs_relaxed',
  ) => {
    if (preset === 'risk_vs_threshold') {
      setConfigA({
        policy: 'risk_aware',
        model: params.model,
        regimeAware: true,
        alpha: params.alpha,
        autoTune: true,
        rulThreshold: 20,
        fixedInterval: 150,
      });
      setConfigB({
        policy: 'threshold',
        model: params.model,
        regimeAware: true,
        alpha: params.alpha,
        autoTune: true,
        rulThreshold: 20,
        fixedInterval: 150,
      });
    } else if (preset === 'regime_vs_global') {
      setConfigA({
        policy: 'risk_aware',
        model: params.model,
        regimeAware: true,
        alpha: params.alpha,
        autoTune: true,
        rulThreshold: 20,
        fixedInterval: 150,
      });
      setConfigB({
        policy: 'risk_aware',
        model: params.model,
        regimeAware: false,
        alpha: params.alpha,
        autoTune: true,
        rulThreshold: 20,
        fixedInterval: 150,
      });
    } else if (preset === 'gbt_vs_linear') {
      setConfigA({
        policy: 'risk_aware',
        model: 'gradient_boosting',
        regimeAware: true,
        alpha: params.alpha,
        autoTune: true,
        rulThreshold: 20,
        fixedInterval: 150,
      });
      setConfigB({
        policy: 'risk_aware',
        model: 'linear_regression',
        regimeAware: true,
        alpha: params.alpha,
        autoTune: true,
        rulThreshold: 20,
        fixedInterval: 150,
      });
    } else {
      setConfigA({
        policy: 'risk_aware',
        model: params.model,
        regimeAware: true,
        alpha: 0.05,
        autoTune: false,
        rulThreshold: 18,
        fixedInterval: 150,
      });
      setConfigB({
        policy: 'risk_aware',
        model: params.model,
        regimeAware: true,
        alpha: 0.2,
        autoTune: false,
        rulThreshold: 18,
        fixedInterval: 150,
      });
    }
  };

  const handleSwap = () => {
    setConfigA(configB);
    setConfigB(configA);
  };

  const renderConfigSelectors = (
    slotLabel: string,
    slotKey: 'a' | 'b',
    accentCls: string,
    cfg: PolicyComparisonConfig,
    onChange: (next: PolicyComparisonConfig) => void,
  ) => {
    const usesPredictor = cfg.policy === 'risk_aware' || cfg.policy === 'threshold';
    const usesManualTrigger =
      !cfg.autoTune &&
      (cfg.policy === 'risk_aware' || cfg.policy === 'threshold' || cfg.policy === 'fixed_interval');

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className={`font-mono text-xs font-semibold ${accentCls}`}>
            {slotLabel}
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            {POLICY_LABELS[cfg.policy]}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`comp-policy-${slotKey}`}
              className="block text-[11px] text-slate-400 mb-1"
            >
              Policy Strategy
            </label>
            <select
              id={`comp-policy-${slotKey}`}
              value={cfg.policy}
              onChange={(e) => onChange({ ...cfg, policy: e.target.value as PolicyId })}
              className="w-full rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1.5 text-xs font-mono text-slate-100"
            >
              {COMPARABLE_POLICIES.map((p) => (
                <option key={p} value={p}>
                  {POLICY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={`comp-model-${slotKey}`}
              className="block text-[11px] text-slate-400 mb-1"
            >
              RUL Predictor
            </label>
            <select
              id={`comp-model-${slotKey}`}
              value={cfg.model}
              disabled={!usesPredictor}
              onChange={(e) => onChange({ ...cfg, model: e.target.value as ModelId })}
              className="w-full rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1.5 text-xs font-mono text-slate-100 disabled:opacity-45"
            >
              {MODEL_ORDER.map((m) => (
                <option key={m} value={m}>
                  {MODEL_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-[#080B12] px-2.5 py-1.5">
            <span className="text-[11px] text-slate-400">Regime Scaling</span>
            <button
              type="button"
              disabled={!usesPredictor}
              onClick={() => onChange({ ...cfg, regimeAware: !cfg.regimeAware })}
              aria-pressed={cfg.regimeAware}
              className={`px-2 py-0.5 rounded font-mono text-[11px] border disabled:opacity-45 ${
                cfg.regimeAware
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {cfg.regimeAware ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-[#080B12] px-2.5 py-1.5">
            <span className="text-[11px] text-slate-400">Threshold Mode</span>
            <button
              type="button"
              disabled={cfg.policy === 'run_to_failure' || cfg.policy === 'oracle'}
              onClick={() => onChange({ ...cfg, autoTune: !cfg.autoTune })}
              aria-pressed={cfg.autoTune}
              className={`px-2 py-0.5 rounded font-mono text-[11px] border disabled:opacity-45 ${
                cfg.autoTune
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {cfg.autoTune ? 'Auto-Tune' : 'Manual'}
            </button>
          </div>
        </div>

        {(cfg.policy === 'risk_aware' || usesManualTrigger) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {cfg.policy === 'risk_aware' && (
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <label htmlFor={`comp-alpha-${slotKey}`}>Confidence (1 − α)</label>
                  <span className="font-mono tabular-nums text-slate-200">
                    {((1 - cfg.alpha) * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  id={`comp-alpha-${slotKey}`}
                  type="range"
                  min={0.02}
                  max={0.25}
                  step={0.01}
                  value={cfg.alpha}
                  onChange={(e) => onChange({ ...cfg, alpha: Number(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>
            )}

            {usesManualTrigger && cfg.policy === 'fixed_interval' && (
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <label htmlFor={`comp-fixed-${slotKey}`}>Fixed Interval T</label>
                  <span className="font-mono tabular-nums text-slate-200">
                    {cfg.fixedInterval} cyc
                  </span>
                </div>
                <input
                  id={`comp-fixed-${slotKey}`}
                  type="range"
                  min={90}
                  max={240}
                  step={5}
                  value={cfg.fixedInterval}
                  onChange={(e) => onChange({ ...cfg, fixedInterval: Number(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>
            )}

            {usesManualTrigger && cfg.policy !== 'fixed_interval' && (
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <label htmlFor={`comp-tau-${slotKey}`}>Trigger Threshold τ</label>
                  <span className="font-mono tabular-nums text-slate-200">
                    {cfg.rulThreshold} cyc
                  </span>
                </div>
                <input
                  id={`comp-tau-${slotKey}`}
                  type="range"
                  min={5}
                  max={45}
                  step={1}
                  value={cfg.rulThreshold}
                  onChange={(e) => onChange({ ...cfg, rulThreshold: Number(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (comparison.evalEngineCount === 0) {
    return (
      <section
        data-testid="policy-comparator-empty"
        className="rounded-lg border border-dashed border-slate-700 bg-[#0E131D] p-6 text-center space-y-1.5"
      >
        <div className="text-sm font-medium text-slate-200">Policy Comparator Unavailable</div>
        <p className="text-xs text-slate-400">
          No held-out evaluation engines exist in the current synthetic cohort.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-5"
      aria-labelledby="policy-comparator-heading"
    >
      {/* Title & Presets */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="policy-comparator-heading"
            className="font-display text-base font-semibold text-slate-100"
          >
            Side-by-Side Policy Configuration Comparator ({comparison.evalEngineCount} Evaluation Engines)
          </h3>
          <p className="text-xs text-slate-400">
            Select any two policy, predictor, scaling, or threshold configurations to compare total costs, failure rates, and mean wasted RUL at Cp=${params.preventiveCost} · Cf=${params.failureCost}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'risk_vs_threshold', label: 'Conformal vs. Threshold' },
              { id: 'regime_vs_global', label: 'Regime vs. Global' },
              { id: 'gbt_vs_linear', label: 'HistGBT vs. Ridge (Surrogates)' },
              { id: 'alpha_strict_vs_relaxed', label: '95% vs. 80% Confidence' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition-colors whitespace-nowrap"
            >
              {p.label}
            </button>
          ))}

          <button
            type="button"
            onClick={handleSwap}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <ArrowLeftRight className="w-3 h-3" />
            Swap A ↔ B
          </button>
        </div>
      </div>

      {/* Dual Configuration Selectors separated by hairline divider */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-slate-800/80">
        {renderConfigSelectors('Configuration A (Reference)', 'a', 'text-cyan-300', configA, setConfigA)}
        <div className="pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-800/80 lg:pl-6">
          {renderConfigSelectors('Configuration B (Candidate)', 'b', 'text-amber-300', configB, setConfigB)}
        </div>
      </div>

      {/* Side-by-Side Breakdown Table */}
      <div className="pt-4 border-t border-slate-800/80 overflow-x-auto">
        <table className="w-full text-left text-xs" data-testid="policy-comparison-table">
          <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-4 font-medium">Comparison Dimension</th>
              <th className="py-2.5 px-4 font-medium text-right text-cyan-300">
                Config A · {sumA.label}
              </th>
              <th className="py-2.5 px-4 font-medium text-right text-amber-300">
                Config B · {sumB.label}
              </th>
              <th className="py-2.5 px-4 font-medium text-right">Delta (B − A)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 font-mono tabular-nums">
            <tr className="bg-slate-900/35">
              <td className="py-3 px-4 font-sans font-semibold text-slate-100">
                Total Fleet Evaluation Cost ($)
              </td>
              <td
                data-testid="comp-a-total-cost"
                className="py-3 px-4 text-right font-bold text-slate-100"
              >
                ${sumA.totalCost.toLocaleString('en-US')}
              </td>
              <td
                data-testid="comp-b-total-cost"
                className="py-3 px-4 text-right font-bold text-slate-100"
              >
                ${sumB.totalCost.toLocaleString('en-US')}
              </td>
              <td
                data-testid="comp-delta-total-cost"
                className={`py-3 px-4 text-right font-bold ${
                  deltas.totalCostDelta < 0
                    ? 'text-emerald-400'
                    : deltas.totalCostDelta > 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                }`}
              >
                {formatDeltaCurrency(deltas.totalCostDelta)}{' '}
                <span className="text-[11px] font-normal">
                  ({deltas.totalCostPct >= 0 ? `+${deltas.totalCostPct.toFixed(1)}%` : `${deltas.totalCostPct.toFixed(1)}%`})
                </span>
              </td>
            </tr>

            <tr>
              <td className="py-2.5 px-4 font-sans text-slate-300">
                Preventive vs. Failure Spend Split
              </td>
              <td className="py-2.5 px-4 text-right text-slate-300">
                ${resultA.preventiveSpend.toLocaleString('en-US')} prev · ${resultA.failureSpend.toLocaleString('en-US')} fail
              </td>
              <td className="py-2.5 px-4 text-right text-slate-300">
                ${resultB.preventiveSpend.toLocaleString('en-US')} prev · ${resultB.failureSpend.toLocaleString('en-US')} fail
              </td>
              <td className="py-2.5 px-4 text-right text-slate-400">
                {formatDeltaCurrency(deltas.preventiveSpendDelta)} prev · {formatDeltaCurrency(deltas.failureSpendDelta)} fail
              </td>
            </tr>

            <tr>
              <td className="py-2.5 px-4 font-sans text-slate-300">
                Mean Cost / Operating Cycle
              </td>
              <td className="py-2.5 px-4 text-right text-cyan-300 font-semibold">
                ${sumA.meanCostPerCycle.toFixed(3)}
                <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                  [{sumA.ciLower.toFixed(3)}, {sumA.ciUpper.toFixed(3)}]
                </span>
              </td>
              <td className="py-2.5 px-4 text-right text-amber-300 font-semibold">
                ${sumB.meanCostPerCycle.toFixed(3)}
                <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                  [{sumB.ciLower.toFixed(3)}, {sumB.ciUpper.toFixed(3)}]
                </span>
              </td>
              <td
                className={`py-2.5 px-4 text-right ${
                  deltas.costPerCycleDelta < 0
                    ? 'text-emerald-400'
                    : deltas.costPerCycleDelta > 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                }`}
              >
                {deltas.costPerCycleDelta > 0 ? '+' : deltas.costPerCycleDelta < 0 ? '-' : ''}
                ${Math.abs(deltas.costPerCycleDelta).toFixed(3)}/cyc
              </td>
            </tr>

            <tr>
              <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                Unplanned Failure Rate
              </td>
              <td
                data-testid="comp-a-failure-rate"
                className={`py-2.5 px-4 text-right font-semibold ${
                  sumA.failureCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {sumA.failureRatePct.toFixed(1)}% ({sumA.failureCount}/{sumA.episodes.length})
              </td>
              <td
                data-testid="comp-b-failure-rate"
                className={`py-2.5 px-4 text-right font-semibold ${
                  sumB.failureCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {sumB.failureRatePct.toFixed(1)}% ({sumB.failureCount}/{sumB.episodes.length})
              </td>
              <td
                className={`py-2.5 px-4 text-right font-semibold ${
                  deltas.failureRateDelta < 0
                    ? 'text-emerald-400'
                    : deltas.failureRateDelta > 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                }`}
              >
                {formatDeltaNumber(deltas.failureRateDelta, 1, ' pts')} ({deltas.failureCountDelta > 0 ? '+' : ''}
                {deltas.failureCountDelta} fail)
              </td>
            </tr>

            <tr>
              <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                Mean Wasted RUL
              </td>
              <td data-testid="comp-a-wasted-rul" className="py-2.5 px-4 text-right text-slate-200">
                {sumA.meanWastedRul.toFixed(1)} cyc
              </td>
              <td data-testid="comp-b-wasted-rul" className="py-2.5 px-4 text-right text-slate-200">
                {sumB.meanWastedRul.toFixed(1)} cyc
              </td>
              <td
                className={`py-2.5 px-4 text-right ${
                  deltas.wastedRulDelta < 0
                    ? 'text-emerald-400'
                    : deltas.wastedRulDelta > 0
                      ? 'text-amber-300'
                      : 'text-slate-400'
                }`}
              >
                {formatDeltaNumber(deltas.wastedRulDelta, 1, ' cyc')}
              </td>
            </tr>

            <tr>
              <td className="py-2.5 px-4 font-sans text-slate-300">
                Active Trigger &amp; Predictor Spec
              </td>
              <td className="py-2.5 px-4 text-right text-slate-300">
                {resultA.effectiveParamLabel} · {MODEL_LABELS[configA.model]} (
                {configA.regimeAware ? 'Regime' : 'Global'})
              </td>
              <td className="py-2.5 px-4 text-right text-slate-300">
                {resultB.effectiveParamLabel} · {MODEL_LABELS[configB.model]} (
                {configB.regimeAware ? 'Regime' : 'Global'})
              </td>
              <td className="py-2.5 px-4 text-right text-slate-400">
                {sumA.totalCycles} vs {sumB.totalCycles} cyc
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <TechnicalInterpretation
        title="Side-by-Side Policy Comparison"
        summary="Breaks down preventive vs failure spend, cost/cycle, and wasted RUL"
        whatItShows="Total Fleet Evaluation Cost sums preventive replacements (Cp per engine) plus catastrophic failure penalties (Cf per engine). Mean Cost / Operating Cycle divides total cost by realized fleet operating cycles, with 95% bootstrap confidence intervals shown in brackets."
        sampleScope={`${comparison.evalEngineCount} held-out evaluation synthetic engines`}
        metrics={['cost_per_cycle', 'preventive_replacement', 'failure_rate', 'wasted_useful_life']}
      />
    </section>
  );
};
