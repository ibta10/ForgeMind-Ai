import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MetricGlossaryPanel } from '../components/charts/MetricGlossaryPanel';
import { Sensitivity3DSurfacePlot } from '../components/charts/Sensitivity3DSurfacePlot';
import {
  SensitivitySurfaceChart,
  type SurfaceViewMode,
} from '../components/charts/SensitivitySurfaceChart';
import { TelemetryChart } from '../components/charts/TelemetryChart';
import { runThresholdCostSurface } from '../engine/maintenance';
import { getFleetSplitCounts, validateMaintenanceConfig } from '../engine/metricsCatalog';
import { MODEL_LABELS, MODEL_ORDER } from '../engine/models';
import type {
  EngineTrajectory,
  MaintenanceParams,
  ModelId,
  SubsetId,
} from '../engine/types';

interface SensitivityAnalysisPageProps {
  subset: SubsetId;
  fleet: EngineTrajectory[];
  params: MaintenanceParams;
  onUpdateParams: (next: Partial<MaintenanceParams>) => void;
  onApplyOperatingPoint: (preventiveCost: number, rulThreshold: number) => void;
  rulCap: number;
}

const SLICE_COSTS = [50, 110, 170, 230];
const SLICE_COLORS = ['#10B981', '#06B6D4', '#F59E0B', '#F43F5E'];

export const SensitivityAnalysisPage: React.FC<SensitivityAnalysisPageProps> = ({
  subset,
  fleet,
  params,
  onUpdateParams,
  onApplyOperatingPoint,
  rulCap,
}) => {
  const [viewMode, setViewMode] = useState<SurfaceViewMode>('risk_aware');

  const surface = useMemo(
    () => runThresholdCostSurface(fleet, params, rulCap),
    [
      fleet,
      params.model,
      params.regimeAware,
      params.alpha,
      params.failureCost,
      params.fixedInterval,
      params.riskMultiplier,
      params.seed,
      rulCap,
    ],
  );

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

  const activeNearestCp = useMemo(
    () =>
      surface.preventiveCosts.length > 0
        ? surface.preventiveCosts.reduce((best, cp) =>
            Math.abs(cp - params.preventiveCost) < Math.abs(best - params.preventiveCost) ? cp : best,
          )
        : params.preventiveCost,
    [surface.preventiveCosts, params.preventiveCost],
  );

  const optimalRiskAtCp = surface.optimalRiskByCost[activeNearestCp];
  const optimalThreshAtCp = surface.optimalThresholdByCost[activeNearestCp];

  const zeroFailureThreshold = useMemo(() => {
    const rowCells = surface.cells
      .filter((c) => c.preventiveCost === activeNearestCp)
      .sort((a, b) => a.rulThreshold - b.rulThreshold);
    const firstSafe = rowCells.find((c) => c.riskAwareFailureRatePct === 0);
    return firstSafe ? firstSafe.rulThreshold : null;
  }, [surface.cells, activeNearestCp]);

  const conformalWinRate = useMemo(() => {
    const winsOrTies = surface.cells.filter((c) => c.advantagePct >= 0).length;
    return (winsOrTies / Math.max(1, surface.cells.length)) * 100;
  }, [surface.cells]);

  // Chart 1: U-shaped Cost-per-Cycle curves across RUL thresholds for multiple Cp levels
  const multiCostSeries = useMemo(
    () =>
      SLICE_COSTS.map((cp, idx) => ({
        id: `cp_${cp}`,
        label: `Cp = $${cp}`,
        color: SLICE_COLORS[idx],
        values: surface.cells
          .filter((c) => c.preventiveCost === cp)
          .sort((a, b) => a.rulThreshold - b.rulThreshold)
          .map((c) => ({
            x: c.rulThreshold,
            y:
              viewMode === 'threshold'
                ? c.thresholdCostPerCycle
                : c.riskAwareCostPerCycle,
          })),
      })),
    [surface.cells, viewMode],
  );

  // Chart 2: Policy comparison at active Cp (Risk-Aware vs RUL Threshold across tau)
  const policyCompareSeries = useMemo(() => {
    const row = surface.cells
      .filter((c) => c.preventiveCost === activeNearestCp)
      .sort((a, b) => a.rulThreshold - b.rulThreshold);

    return [
      {
        id: 'risk_aware',
        label: `Risk-Aware Conformal (Cp=$${activeNearestCp})`,
        color: '#06B6D4',
        values: row.map((c) => ({ x: c.rulThreshold, y: c.riskAwareCostPerCycle })),
      },
      {
        id: 'threshold',
        label: `Point RUL Threshold (Cp=$${activeNearestCp})`,
        color: '#F59E0B',
        dashed: true,
        values: row.map((c) => ({ x: c.rulThreshold, y: c.thresholdCostPerCycle })),
      },
    ];
  }, [surface.cells, activeNearestCp]);

  return (
    <div className="space-y-6">
      {(!paramValidation.isValid || paramValidation.warnings.length > 0) && (
        <div
          data-testid="sensitivity-param-warning"
          role="alert"
          className="rounded-lg border border-amber-500/45 bg-amber-950/25 px-4 py-2.5 flex items-start gap-2.5 text-xs text-amber-200"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5">
            <div className="font-semibold text-amber-100">Economic Parameter Notice</div>
            {paramValidation.warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        </div>
      )}

      {/* Parameter Controls Bar */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Threshold &amp; Preventive Cost Sensitivity Surface ({subset} · {splits.evaluation} Eval Engines)
            </h2>
            <p className="text-xs text-slate-400">
              Sweeps RUL trigger threshold (5–45 cycles) against preventive cost ($50–$260) on {splits.evaluation} disjoint evaluation units
            </p>
          </div>

          <div
            className="flex flex-wrap items-center gap-0.5 rounded-md border border-slate-700 bg-[#080B12] p-0.5 max-w-full"
            role="group"
            aria-label="Sensitivity Surface View Mode"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'risk_aware'}
              onClick={() => setViewMode('risk_aware')}
              className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded transition-colors whitespace-nowrap ${
                viewMode === 'risk_aware'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Risk-Aware Cost
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'threshold'}
              onClick={() => setViewMode('threshold')}
              className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded transition-colors whitespace-nowrap ${
                viewMode === 'threshold'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RUL Threshold
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'advantage'}
              onClick={() => setViewMode('advantage')}
              className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded transition-colors whitespace-nowrap ${
                viewMode === 'advantage'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cost Advantage Δ%
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-800/80 items-end">
          <div>
            <label htmlFor="sens-model" className="block text-xs text-slate-400 mb-1.5">
              RUL Predictor
            </label>
            <select
              id="sens-model"
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
              <label htmlFor="sens-cf">Failure Penalty (Cf)</label>
              <span className="font-mono tabular-nums text-rose-300">${params.failureCost}</span>
            </div>
            <input
              id="sens-cf"
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
              <label htmlFor="sens-alpha">Conformal Level (1 − α)</label>
              <span className="font-mono tabular-nums text-amber-300">
                {((1 - params.alpha) * 100).toFixed(0)}%
              </span>
            </div>
            <input
              id="sens-alpha"
              type="range"
              min={0.02}
              max={0.25}
              step={0.01}
              value={params.alpha}
              onChange={(e) => onUpdateParams({ alpha: Number(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-[#080B12] px-3 py-2">
            <span className="text-xs text-slate-300">Regime-Aware Scaling</span>
            <button
              type="button"
              role="switch"
              aria-checked={params.regimeAware}
              onClick={() => onUpdateParams({ regimeAware: !params.regimeAware })}
              className={`px-2.5 py-0.5 rounded font-mono text-[11px] border ${
                params.regimeAware
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {params.regimeAware ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </section>

      {/* KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Optimal Risk-Aware τ* (Cp=${activeNearestCp})</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-cyan-300">
            {optimalRiskAtCp ? `${optimalRiskAtCp.rulThreshold} cyc` : '—'}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            Min cost ${optimalRiskAtCp?.costPerCycle.toFixed(3)}/cyc ({optimalRiskAtCp?.failureRatePct.toFixed(1)}% fail)
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Optimal Point-Threshold τ* (Cp=${activeNearestCp})</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-amber-300">
            {optimalThreshAtCp ? `${optimalThreshAtCp.rulThreshold} cyc` : '—'}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            Min cost ${optimalThreshAtCp?.costPerCycle.toFixed(3)}/cyc ({optimalThreshAtCp?.failureRatePct.toFixed(1)}% fail)
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Zero-Failure Boundary (Risk-Aware)</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-400">
            {zeroFailureThreshold !== null ? `τ ≥ ${zeroFailureThreshold} cyc` : '> 45 cyc'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Minimum lower-bound trigger eliminating unplanned failures
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Conformal Grid Win / Parity Rate</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-100">
            {conformalWinRate.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Share of {surface.cells.length} (τ, Cp) cells where Risk-Aware ≤ Threshold
          </div>
        </div>
      </section>

      {/* 3D D3 Maintenance Cost Surface */}
      <Sensitivity3DSurfacePlot
        surface={surface}
        policyBasis={viewMode === 'threshold' ? 'threshold' : 'risk_aware'}
        failureCost={params.failureCost}
        activePreventiveCost={params.preventiveCost}
        activeThreshold={params.rulThreshold}
        evalEngineCount={splits.evaluation}
        onApplyPoint={onApplyOperatingPoint}
      />

      {/* 2D Sensitivity Heatmap */}
      <SensitivitySurfaceChart
        surface={surface}
        viewMode={viewMode}
        activePreventiveCost={params.preventiveCost}
        activeThreshold={params.rulThreshold}
        failureCost={params.failureCost}
        evalEngineCount={splits.evaluation}
        onApplyPoint={onApplyOperatingPoint}
      />

      {/* Two 1D Slice Curve Plots */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TelemetryChart
          title={`Mean Cost/Cycle Across RUL Threshold τ (${viewMode === 'threshold' ? 'Point Threshold' : 'Risk-Aware Conformal'})`}
          subtitle="Iso-cost curves showing how rising preventive swap expense shifts the minimum-cost threshold left"
          sampleScopeLabel={`${splits.evaluation} eval engines`}
          yLabel="Mean Cost / Operating Cycle ($/cyc)"
          xLabel="RUL Trigger Threshold τ (cycles)"
          xUnit=" cyc"
          unit="$/cyc"
          tickPrecision={3}
          valuePrecision={3}
          xPrecision={0}
          series={multiCostSeries}
          height={270}
          clampZero
          interpretation={{
            summary:
              'Shows how preventive swap cost Cp shifts the U-shaped optimal trigger threshold τ*.',
            whatItShows:
              'Each curve tracks expected $/cycle across trigger thresholds τ for a fixed preventive cost Cp. Higher Cp increases the economic penalty of early wasted useful life.',
            metrics: ['cost_per_cycle', 'wasted_useful_life'],
          }}
        />

        <TelemetryChart
          title={`Policy Comparison Across τ at Preventive Cost Cp = $${activeNearestCp}`}
          subtitle="Direct cost slice comparing Risk-Aware Conformal bounds vs Point RUL Threshold"
          sampleScopeLabel={`${splits.evaluation} eval engines`}
          yLabel="Mean Cost / Operating Cycle ($/cyc)"
          xLabel="RUL Trigger Threshold τ (cycles)"
          xUnit=" cyc"
          unit="$/cyc"
          tickPrecision={3}
          valuePrecision={3}
          xPrecision={0}
          series={policyCompareSeries}
          height={270}
          clampZero
          interpretation={{
            summary:
              'Compares Risk-Aware Conformal intervention directly against Point RUL thresholding along a fixed Cp slice.',
            whatItShows:
              'At low thresholds (left), conformal lower bounds trigger slightly earlier to avoid severe failure penalties Cf, yielding lower cost than point estimation.',
            metrics: ['cost_per_cycle', 'failure_rate'],
          }}
        />
      </div>

      {/* Optimal Tradeoff Schedule Table by Cp */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100">
            Optimal Trigger Schedule Across Preventive Cost Levels (Cf = ${params.failureCost})
          </h3>
          <p className="text-xs text-slate-400">
            As preventive maintenance becomes more expensive relative to failure penalty, optimal triggers shift tighter (lower τ*)
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-medium">Preventive Cost (Cp)</th>
                <th className="py-2.5 px-4 font-medium text-right">Penalty Ratio</th>
                <th className="py-2.5 px-4 font-medium text-right">Optimal Risk τ*</th>
                <th className="py-2.5 px-4 font-medium text-right">Risk Min Cost/Cyc</th>
                <th className="py-2.5 px-4 font-medium text-right">Optimal Thresh τ*</th>
                <th className="py-2.5 px-4 font-medium text-right">Thresh Min Cost/Cyc</th>
                <th className="py-2.5 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {surface.preventiveCosts.map((cp) => {
                const riskOpt = surface.optimalRiskByCost[cp];
                const threshOpt = surface.optimalThresholdByCost[cp];
                const ratio = (params.failureCost / cp).toFixed(1);
                const isNearest = cp === activeNearestCp;
                return (
                  <tr
                    key={cp}
                    className={isNearest ? 'bg-cyan-500/8 text-slate-100' : 'text-slate-300 hover:bg-slate-800/35'}
                  >
                    <td className="py-2.5 px-4 font-mono tabular-nums font-semibold">
                      ${cp}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400">
                      {ratio}×
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-cyan-300 font-semibold">
                      {riskOpt.rulThreshold} cyc
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      ${riskOpt.costPerCycle.toFixed(3)} ({riskOpt.failureRatePct.toFixed(1)}% fail)
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-300">
                      {threshOpt.rulThreshold} cyc
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      ${threshOpt.costPerCycle.toFixed(3)} ({threshOpt.failureRatePct.toFixed(1)}% fail)
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onApplyOperatingPoint(cp, riskOpt.rulThreshold)}
                        className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:bg-slate-800 whitespace-nowrap"
                      >
                        Simulate τ={riskOpt.rulThreshold}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <MetricGlossaryPanel
        highlightedMetrics={['cost_per_cycle', 'failure_rate', 'wasted_useful_life', 'preventive_replacement']}
      />
    </div>
  );
};
