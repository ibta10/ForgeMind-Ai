import React, { useMemo, useState } from 'react';
import { AlertTriangle, Play, RotateCcw } from 'lucide-react';
import { BenchmarkBarChart } from '../components/charts/BenchmarkBarChart';
import { MaintenanceRoiChart } from '../components/charts/MaintenanceRoiChart';
import { MetricGlossaryPanel } from '../components/charts/MetricGlossaryPanel';
import { TelemetryChart } from '../components/charts/TelemetryChart';
import { PolicyConfigComparator } from '../components/simulator/PolicyConfigComparator';
import { computeMaintenanceRoi, runCostRatioSensitivity } from '../engine/maintenance';
import { getFleetSplitCounts, validateMaintenanceConfig } from '../engine/metricsCatalog';
import { MODEL_LABELS, MODEL_ORDER } from '../engine/models';
import { PROTOTYPE_SAFETY_WARNING } from '../engine/provenance';
import type {
  EngineTrajectory,
  MaintenanceParams,
  ModelId,
  PolicySummary,
  SubsetId,
} from '../engine/types';

interface DecisionSimulatorPageProps {
  subset: SubsetId;
  fleet: EngineTrajectory[];
  params: MaintenanceParams;
  onUpdateParams: (next: Partial<MaintenanceParams>) => void;
  summaries: PolicySummary[];
  tunedParams: {
    fixedInterval: number;
    rulThreshold: number;
    riskThreshold: number;
  };
  onRerunWithNewSeed: () => void;
  rulCap: number;
}

const POLICY_COLORS: Record<string, string> = {
  run_to_failure: '#EF4444',
  fixed_interval: '#64748B',
  threshold: '#F59E0B',
  risk_aware: '#06B6D4',
  oracle: '#10B981',
};

export const DecisionSimulatorPage: React.FC<DecisionSimulatorPageProps> = ({
  subset,
  fleet,
  params,
  onUpdateParams,
  summaries,
  tunedParams,
  onRerunWithNewSeed,
  rulCap,
}) => {
  const [selectedPolicyTab, setSelectedPolicyTab] = useState<'risk_aware' | 'threshold'>('risk_aware');

  const sensitivity = useMemo(
    () => runCostRatioSensitivity(fleet, params, rulCap),
    [
      fleet,
      params.model,
      params.regimeAware,
      params.alpha,
      params.preventiveCost,
      params.fixedInterval,
      params.rulThreshold,
      params.riskMultiplier,
      params.autoTune,
      params.seed,
      rulCap,
    ],
  );

  const maintenanceRoi = useMemo(() => computeMaintenanceRoi(summaries), [summaries]);

  const costBarData = useMemo(
    () =>
      summaries.map((s) => ({
        id: s.policy,
        label: s.label,
        value: s.meanCostPerCycle,
        ciLower: s.ciLower,
        ciUpper: s.ciUpper,
        sublabel: s.tunedParamLabel,
        color: POLICY_COLORS[s.policy] ?? '#64748B',
        highlight: s.policy === 'risk_aware',
      })),
    [summaries],
  );

  const sensitivitySeries = useMemo(
    () => [
      {
        id: 'fixed',
        label: 'Fixed Interval',
        color: '#64748B',
        values: sensitivity.map((p) => ({ x: p.costRatio, y: p.fixedCostPerCycle })),
      },
      {
        id: 'threshold',
        label: 'RUL Threshold',
        color: '#F59E0B',
        values: sensitivity.map((p) => ({ x: p.costRatio, y: p.thresholdCostPerCycle })),
      },
      {
        id: 'risk_aware',
        label: 'Risk-Aware Conformal',
        color: '#06B6D4',
        values: sensitivity.map((p) => ({ x: p.costRatio, y: p.riskAwareCostPerCycle })),
      },
      {
        id: 'oracle',
        label: 'Oracle',
        color: '#10B981',
        dashed: true,
        values: sensitivity.map((p) => ({ x: p.costRatio, y: p.oracleCostPerCycle })),
      },
    ],
    [sensitivity],
  );

  const activePolicySummary = useMemo(
    () => summaries.find((s) => s.policy === selectedPolicyTab) ?? summaries[0],
    [summaries, selectedPolicyTab],
  );

  const thresholdSummary = summaries.find((s) => s.policy === 'threshold');
  const riskSummary = summaries.find((s) => s.policy === 'risk_aware');
  const savingsPct =
    thresholdSummary && riskSummary && thresholdSummary.meanCostPerCycle > 0
      ? ((thresholdSummary.meanCostPerCycle - riskSummary.meanCostPerCycle) /
          thresholdSummary.meanCostPerCycle) *
        100
      : 0;

  const splits = useMemo(() => getFleetSplitCounts(fleet), [fleet]);
  const paramValidation = useMemo(
    () =>
      validateMaintenanceConfig({
        preventiveCost: params.preventiveCost,
        failureCost: params.failureCost,
        alpha: params.alpha,
        rulThreshold: params.rulThreshold,
        fixedInterval: params.fixedInterval,
      }),
    [params.preventiveCost, params.failureCost, params.alpha, params.rulThreshold, params.fixedInterval],
  );

  return (
    <div className="space-y-6">
      <div
        role="note"
        className="rounded-lg border border-rose-500/35 bg-rose-950/15 px-4 py-2.5 flex items-start sm:items-center gap-2.5 text-xs text-rose-200"
      >
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
        <span>{PROTOTYPE_SAFETY_WARNING}</span>
      </div>

      {(!paramValidation.isValid || paramValidation.warnings.length > 0) && (
        <div
          data-testid="maintenance-param-warning"
          role="alert"
          className="rounded-lg border border-amber-500/45 bg-amber-950/25 px-4 py-2.5 flex items-start gap-2.5 text-xs text-amber-200"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5">
            <div className="font-semibold text-amber-100">Maintenance Economic Parameter Guard</div>
            {paramValidation.warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        </div>
      )}

      {/* Simulator Controls Panel */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Per-Engine Run-to-Failure Maintenance Simulator ({subset} · {splits.evaluation} Eval Engines)
            </h2>
            <p className="text-xs text-slate-400">
              Policies are tuned on {splits.tuning} tuning units and evaluated on {splits.evaluation} disjoint evaluation engines with 95% bootstrap CIs
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onUpdateParams({
                  preventiveCost: 100,
                  failureCost: 600,
                  alpha: 0.1,
                  riskMultiplier: 1.0,
                  autoTune: true,
                  regimeAware: true,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={onRerunWithNewSeed}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              Run New Seed ({params.seed})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2 border-t border-slate-800/80">
          <div>
            <label htmlFor="sim-model" className="block text-xs text-slate-400 mb-1.5">
              RUL Predictor
            </label>
            <select
              id="sim-model"
              value={params.model}
              onChange={(e) => onUpdateParams({ model: e.target.value as ModelId })}
              className="w-full rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1.5 text-xs font-mono text-slate-100"
            >
              {MODEL_ORDER.map((m) => (
                <option key={m} value={m}>
                  {MODEL_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <label htmlFor="cp-slider">Preventive Cost (Cp)</label>
              <span className="font-mono tabular-nums text-slate-200">${params.preventiveCost}</span>
            </div>
            <input
              id="cp-slider"
              type="range"
              min={50}
              max={300}
              step={10}
              value={params.preventiveCost}
              onChange={(e) => onUpdateParams({ preventiveCost: Number(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <label htmlFor="cf-slider">Failure Penalty (Cf)</label>
              <span className="font-mono tabular-nums text-rose-300">
                ${params.failureCost} ({(params.failureCost / params.preventiveCost).toFixed(1)}×)
              </span>
            </div>
            <input
              id="cf-slider"
              type="range"
              min={200}
              max={2000}
              step={50}
              value={params.failureCost}
              onChange={(e) => onUpdateParams({ failureCost: Number(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <label htmlFor="sim-alpha">Conformal Level (1 − α)</label>
              <span className="font-mono tabular-nums text-amber-300">
                {((1 - params.alpha) * 100).toFixed(0)}%
              </span>
            </div>
            <input
              id="sim-alpha"
              type="range"
              min={0.02}
              max={0.25}
              step={0.01}
              value={params.alpha}
              onChange={(e) => onUpdateParams({ alpha: Number(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>

          <div className="flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Regime-Aware Scaling</span>
              <button
                type="button"
                aria-pressed={params.regimeAware}
                onClick={() => onUpdateParams({ regimeAware: !params.regimeAware })}
                className={`px-2 py-0.5 rounded font-mono text-[11px] border ${
                  params.regimeAware
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {params.regimeAware ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Auto-Tune Thresholds</span>
              <button
                type="button"
                aria-pressed={params.autoTune}
                onClick={() => onUpdateParams({ autoTune: !params.autoTune })}
                className={`px-2 py-0.5 rounded font-mono text-[11px] border ${
                  params.autoTune
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {params.autoTune ? 'ON' : 'Manual'}
              </button>
            </div>
          </div>
        </div>

        {!params.autoTune && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800/70">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <label htmlFor="manual-fixed">Fixed Interval T</label>
                <span className="font-mono tabular-nums text-slate-200">{params.fixedInterval} cyc</span>
              </div>
              <input
                id="manual-fixed"
                type="range"
                min={90}
                max={240}
                step={5}
                value={params.fixedInterval}
                onChange={(e) => onUpdateParams({ fixedInterval: Number(e.target.value) })}
                className="w-full accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <label htmlFor="manual-thresh">RUL Trigger Threshold τ</label>
                <span className="font-mono tabular-nums text-slate-200">{params.rulThreshold} cyc</span>
              </div>
              <input
                id="manual-thresh"
                type="range"
                min={5}
                max={45}
                step={1}
                value={params.rulThreshold}
                onChange={(e) => onUpdateParams({ rulThreshold: Number(e.target.value) })}
                className="w-full accent-cyan-500"
              />
            </div>
          </div>
        )}
      </section>

      {/* Primary KPI Delta Row */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Risk-Aware Cost / Operating Cycle</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-cyan-300">
            ${riskSummary?.meanCostPerCycle.toFixed(3)}
            <span className="ml-1.5 text-xs font-normal text-slate-400">/ cyc</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            95% CI [{riskSummary?.ciLower.toFixed(3)}, {riskSummary?.ciUpper.toFixed(3)}]
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Cost Change vs. RUL Threshold</div>
          <div
            className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
              savingsPct >= 0 ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {savingsPct >= 0 ? `-${savingsPct.toFixed(1)}%` : `+${Math.abs(savingsPct).toFixed(1)}%`}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            Risk failure rate {riskSummary?.failureRatePct.toFixed(1)}% vs Threshold {thresholdSummary?.failureRatePct.toFixed(1)}%
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Active Policy Parameters</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums pt-1">
            Fixed T={tunedParams.fixedInterval} · Thresh τ={tunedParams.rulThreshold} · Risk τ={tunedParams.riskThreshold}
          </div>
          <div className="mt-1.5 text-xs text-slate-400">
            {params.autoTune ? 'Selected via tuning-split grid search' : 'Manual operator override'}
          </div>
        </div>
      </section>

      {riskSummary && thresholdSummary && (
        <section className="rounded-lg border border-slate-800 bg-[#0E131D] px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
          <span>
            <strong className="text-slate-100 font-semibold">Decision Tradeoff ({(params.failureCost / params.preventiveCost).toFixed(1)}× Penalty):</strong>{' '}
            Risk-Aware Conformal recorded{' '}
            <span className="font-mono text-cyan-300">{riskSummary.failureCount}</span> unplanned failure{riskSummary.failureCount === 1 ? '' : 's'} (mean wasted RUL{' '}
            <span className="font-mono">{riskSummary.meanWastedRul.toFixed(1)} cyc</span>) vs.{' '}
            <span className="font-mono text-amber-300">{thresholdSummary.failureCount}</span> for point-estimate RUL Threshold (mean wasted RUL{' '}
            <span className="font-mono">{thresholdSummary.meanWastedRul.toFixed(1)} cyc</span>).
          </span>
          <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap">
            {riskSummary.failureCount < thresholdSummary.failureCount
              ? `Avoided ${thresholdSummary.failureCount - riskSummary.failureCount} unplanned failure(s)`
              : 'Safety parity achieved at lower-bound trigger'}
          </span>
        </section>
      )}

      {/* Policy Cost Bar Chart + Cost-Ratio Sensitivity */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BenchmarkBarChart
          title="Cost per Operating Cycle (with 95% Bootstrap CI)"
          subtitle="Evaluated across disjoint evaluation episodes (lower is better)"
          sampleScopeLabel={`${splits.evaluation} eval synthetic engines`}
          xAxisLabel="Mean Cost per Operating Cycle ($/cyc)"
          unit="$/cyc"
          precision={3}
          data={costBarData}
          interpretation={{
            summary:
              'Compares mean expected lifecycle cost per operating cycle across all five maintenance policies.',
            whatItShows:
              'Thin horizontal white whiskers denote 95% bootstrap confidence intervals across evaluation engines. Conformal Risk-Aware intervention balances avoided Cf failure penalties against premature Cp swaps.',
            metrics: ['cost_per_cycle', 'preventive_replacement', 'failure_rate'],
          }}
        />

        <TelemetryChart
          title="Cost Ratio Sensitivity Sweep (Cf / Cp from 2× to 20×)"
          subtitle="Expected cost per cycle as catastrophic failure penalty intensifies relative to preventive swap cost"
          sampleScopeLabel={`${splits.evaluation} eval engines`}
          yLabel="Mean Cost / Operating Cycle ($/cyc)"
          xLabel="Failure-to-Preventive Cost Ratio (Cf / Cp)"
          xUnit="×"
          unit="$/cyc"
          tickPrecision={3}
          valuePrecision={3}
          xPrecision={1}
          series={sensitivitySeries}
          height={265}
          clampZero
          interpretation={{
            summary:
              'Traces how policy operating cost scales as failure severity increases from 2× to 20× preventive swap cost.',
            whatItShows:
              'As failure penalties climb relative to preventive replacement (right side of curve), reactive or overly aggressive thresholding climbs sharply while Risk-Aware Conformal intervention tracks closely above the theoretical Oracle.',
            metrics: ['cost_per_cycle', 'failure_rate', 'wasted_useful_life'],
          }}
        />
      </div>

      {/* Maintenance ROI Visualization vs. Reactive Baseline */}
      <MaintenanceRoiChart
        roi={maintenanceRoi}
        preventiveCost={params.preventiveCost}
        failureCost={params.failureCost}
      />

      {/* Policy Comparison Table */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100">
            Policy Evaluation Ledger ({summaries[0]?.episodes.length ?? 0} Evaluation Engines)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-medium">Policy</th>
                <th className="py-2.5 px-4 font-medium">Parameter</th>
                <th className="py-2.5 px-4 font-medium text-right">Cost / Cycle</th>
                <th className="py-2.5 px-4 font-medium text-right">95% Bootstrap CI</th>
                <th className="py-2.5 px-4 font-medium text-right">Preventive</th>
                <th className="py-2.5 px-4 font-medium text-right">Failures</th>
                <th className="py-2.5 px-4 font-medium text-right">Mean Wasted RUL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {summaries.map((s) => (
                <tr
                  key={s.policy}
                  className={s.policy === 'risk_aware' ? 'bg-cyan-500/8 text-slate-100' : 'text-slate-300'}
                >
                  <td className="py-3 px-4 font-medium">
                    <span className={s.policy === 'risk_aware' ? 'text-cyan-300' : 'text-slate-100'}>
                      {s.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">{s.tunedParamLabel}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                    ${s.meanCostPerCycle.toFixed(3)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">
                    [${s.ciLower.toFixed(3)}, ${s.ciUpper.toFixed(3)}]
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{s.preventiveCount}</td>
                  <td
                    className={`py-3 px-4 text-right font-mono tabular-nums ${
                      s.failureCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {s.failureCount} ({s.failureRatePct.toFixed(1)}%)
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                    {s.meanWastedRul.toFixed(1)} cyc
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Side-by-Side Policy Configuration Comparative Table */}
      <PolicyConfigComparator
        subset={subset}
        fleet={fleet}
        params={params}
        rulCap={rulCap}
      />

      {/* Per-Engine Episode Trace Inspector */}
      {activePolicySummary && (
        <section className="rounded-lg border border-slate-800 bg-[#0E131D] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Per-Engine Episode Outcomes
              </h3>
              <p className="text-xs text-slate-400">
                Compare replacement timing vs failure cycle on individual evaluation engines
              </p>
            </div>
            <div
              className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
              role="group"
              aria-label="Inspect Policy Episodes"
            >
              <button
                type="button"
                aria-pressed={selectedPolicyTab === 'risk_aware'}
                onClick={() => setSelectedPolicyTab('risk_aware')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  selectedPolicyTab === 'risk_aware'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Risk-Aware
              </button>
              <button
                type="button"
                aria-pressed={selectedPolicyTab === 'threshold'}
                onClick={() => setSelectedPolicyTab('threshold')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  selectedPolicyTab === 'threshold'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                RUL Threshold
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-4 font-medium">Unit ID</th>
                  <th className="py-2 px-4 font-medium text-right">True Failure Cycle</th>
                  <th className="py-2 px-4 font-medium text-right">Intervention Cycle</th>
                  <th className="py-2 px-4 font-medium text-right">Wasted RUL</th>
                  <th className="py-2 px-4 font-medium text-right">Episode Cost</th>
                  <th className="py-2 px-4 font-medium text-right">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {activePolicySummary.episodes.map((ep) => (
                  <tr key={ep.engineId} className="hover:bg-slate-800/35">
                    <td className="py-2 px-4 font-mono text-slate-200">
                      Unit #{String(ep.engineId).padStart(2, '0')}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-300">
                      {ep.failureCycle}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-100">
                      {ep.actionCycle}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-400">
                      {ep.wastedRul} cyc
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-200">
                      ${ep.cost}
                    </td>
                    <td className="py-2 px-4 text-right font-mono">
                      {ep.failed ? (
                        <span className="text-rose-400">Unplanned Failure</span>
                      ) : (
                        <span className="text-emerald-400">Preventive Swap</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <MetricGlossaryPanel
        highlightedMetrics={['cost_per_cycle', 'preventive_replacement', 'failure_rate', 'wasted_useful_life']}
      />
    </div>
  );
};
