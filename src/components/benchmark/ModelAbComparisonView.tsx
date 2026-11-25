import React, { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { TelemetryChart } from '../charts/TelemetryChart';
import { TechnicalInterpretation } from '../charts/TechnicalInterpretation';
import { runModelAbComparison } from '../../engine/abComparison';
import { getFleetSplitCounts } from '../../engine/metricsCatalog';
import { MODEL_LABELS, MODEL_ORDER } from '../../engine/models';
import type {
  AbVariantConfig,
  EngineTrajectory,
  MaintenanceParams,
  ModelId,
  SubsetId,
} from '../../engine/types';

interface ModelAbComparisonViewProps {
  subset: SubsetId;
  fleet: EngineTrajectory[];
  selectedModel: ModelId;
  regimeAware: boolean;
  targetView: 'capped' | 'uncapped';
  maintenanceParams: MaintenanceParams;
  rulCap: number;
  seed: number;
}

function formatSigned(val: number, decimals: number, prefix = '', suffix = ''): string {
  const sign = val > 0 ? '+' : val < 0 ? '−' : '';
  return `${sign}${prefix}${Math.abs(val).toFixed(decimals)}${suffix}`;
}

export const ModelAbComparisonView: React.FC<ModelAbComparisonViewProps> = ({
  subset,
  fleet,
  selectedModel,
  regimeAware,
  targetView,
  maintenanceParams,
  rulCap,
  seed,
}) => {
  const isMultiRegime = subset === 'FD002' || subset === 'FD004';
  const splits = useMemo(() => getFleetSplitCounts(fleet), [fleet]);

  const [variantA, setVariantA] = useState<AbVariantConfig>(() => ({
    model: isMultiRegime ? selectedModel : 'linear_regression',
    regimeAware: isMultiRegime ? false : regimeAware,
  }));

  const [variantB, setVariantB] = useState<AbVariantConfig>(() => ({
    model:
      !isMultiRegime && selectedModel === 'linear_regression'
        ? 'gradient_boosting'
        : selectedModel,
    regimeAware: true,
  }));

  const evalCandidates = useMemo(() => {
    const evals = fleet.filter((e) => e.split === 'evaluation');
    return evals.length > 0 ? evals : fleet;
  }, [fleet]);

  const [selectedEngineId, setSelectedEngineId] = useState<number>(
    () => evalCandidates[0]?.engineId ?? 1,
  );

  const activeEngineId = useMemo(() => {
    if (evalCandidates.some((e) => e.engineId === selectedEngineId)) {
      return selectedEngineId;
    }
    return evalCandidates[0]?.engineId ?? 1;
  }, [evalCandidates, selectedEngineId]);

  const comparison = useMemo(
    () =>
      runModelAbComparison(fleet, subset, variantA, variantB, maintenanceParams, {
        evalEngineId: activeEngineId,
        targetView,
        rulCap,
        seed,
      }),
    [fleet, subset, variantA, variantB, maintenanceParams, activeEngineId, targetView, rulCap, seed],
  );

  const { variantA: resA, variantB: resB, deltas } = comparison;

  const rmseA = targetView === 'capped' ? resA.metrics.cappedRmse : resA.metrics.rmse;
  const rmseB = targetView === 'capped' ? resB.metrics.cappedRmse : resB.metrics.rmse;
  const maeA = targetView === 'capped' ? resA.metrics.cappedMae : resA.metrics.mae;
  const maeB = targetView === 'capped' ? resB.metrics.cappedMae : resB.metrics.mae;
  const phmA = targetView === 'capped' ? resA.metrics.cappedPhm08 : resA.metrics.phm08;
  const phmB = targetView === 'capped' ? resB.metrics.cappedPhm08 : resB.metrics.phm08;

  const trajASeries = useMemo(() => {
    const t = resA.sampleTrajectory;
    const refArr = targetView === 'capped' ? t.targetRul : t.uncappedRul;
    return [
      {
        id: 'true',
        label: targetView === 'capped' ? `Target (≤${rulCap})` : 'True RUL',
        color: '#94A3B8',
        dashed: true,
        values: t.cycles.map((c, idx) => ({ x: c, y: refArr[idx] })),
      },
      {
        id: 'predA',
        label: `A: ${resA.modelLabel}`,
        color: '#06B6D4',
        values: t.cycles.map((c, idx) => ({ x: c, y: t.predRul[idx] })),
      },
    ];
  }, [resA, targetView, rulCap]);

  const trajBSeries = useMemo(() => {
    const t = resB.sampleTrajectory;
    const refArr = targetView === 'capped' ? t.targetRul : t.uncappedRul;
    return [
      {
        id: 'true',
        label: targetView === 'capped' ? `Target (≤${rulCap})` : 'True RUL',
        color: '#94A3B8',
        dashed: true,
        values: t.cycles.map((c, idx) => ({ x: c, y: refArr[idx] })),
      },
      {
        id: 'predB',
        label: `B: ${resB.modelLabel}`,
        color: '#F59E0B',
        values: t.cycles.map((c, idx) => ({ x: c, y: t.predRul[idx] })),
      },
    ];
  }, [resB, targetView, rulCap]);

  const overlaySeries = useMemo(() => {
    const tA = resA.sampleTrajectory;
    const tB = resB.sampleTrajectory;
    const refArr = targetView === 'capped' ? tA.targetRul : tA.uncappedRul;
    return [
      {
        id: 'true',
        label: targetView === 'capped' ? `Target (≤${rulCap})` : 'True RUL',
        color: '#94A3B8',
        dashed: true,
        values: tA.cycles.map((c, idx) => ({ x: c, y: refArr[idx] })),
      },
      {
        id: 'armA',
        label: `A (${resA.modelLabel} · ${variantA.regimeAware ? 'Regime' : 'Global'})`,
        color: '#06B6D4',
        values: tA.cycles.map((c, idx) => ({ x: c, y: tA.predRul[idx] })),
      },
      {
        id: 'armB',
        label: `B (${resB.modelLabel} · ${variantB.regimeAware ? 'Regime' : 'Global'})`,
        color: '#F59E0B',
        values: tB.cycles.map((c, idx) => ({ x: c, y: tB.predRul[idx] })),
      },
    ];
  }, [resA, resB, variantA.regimeAware, variantB.regimeAware, targetView, rulCap]);

  const absErrorSeries = useMemo(() => {
    const tA = resA.sampleTrajectory;
    const tB = resB.sampleTrajectory;
    return [
      {
        id: 'errA',
        label: `|Error| A (${resA.modelLabel})`,
        color: '#06B6D4',
        values: tA.cycles.map((c, idx) => ({ x: c, y: tA.absError[idx] })),
      },
      {
        id: 'errB',
        label: `|Error| B (${resB.modelLabel})`,
        color: '#F59E0B',
        values: tB.cycles.map((c, idx) => ({ x: c, y: tB.absError[idx] })),
      },
    ];
  }, [resA, resB]);

  const handleSwap = () => {
    setVariantA(variantB);
    setVariantB(variantA);
  };

  const applyPresetScaling = () => {
    setVariantA({ model: selectedModel, regimeAware: false });
    setVariantB({ model: selectedModel, regimeAware: true });
  };

  const applyPresetModels = () => {
    setVariantA({ model: 'linear_regression', regimeAware });
    setVariantB({
      model: selectedModel === 'linear_regression' ? 'gradient_boosting' : selectedModel,
      regimeAware,
    });
  };

  const matrixRows: Array<{
    metric: string;
    category: string;
    valA: string;
    valB: string;
    deltaLabel: string;
    winner: 'A' | 'B' | 'Tie';
  }> = [
    {
      metric: targetView === 'capped' ? `RMSE (Capped ≤${rulCap})` : 'RMSE (Uncapped)',
      category: 'RUL Error',
      valA: `${rmseA.toFixed(2)} cyc`,
      valB: `${rmseB.toFixed(2)} cyc`,
      deltaLabel: formatSigned(deltas.rmseDelta, 2, '', ' cyc'),
      winner: Math.abs(rmseB - rmseA) < 0.01 ? 'Tie' : rmseB < rmseA ? 'B' : 'A',
    },
    {
      metric: targetView === 'capped' ? `MAE (Capped ≤${rulCap})` : 'MAE (Uncapped)',
      category: 'RUL Error',
      valA: `${maeA.toFixed(2)} cyc`,
      valB: `${maeB.toFixed(2)} cyc`,
      deltaLabel: formatSigned(deltas.maeDelta, 2, '', ' cyc'),
      winner: Math.abs(maeB - maeA) < 0.01 ? 'Tie' : maeB < maeA ? 'B' : 'A',
    },
    {
      metric: 'PHM08 Asymmetric Score',
      category: 'RUL Error',
      valA: phmA.toFixed(1),
      valB: phmB.toFixed(1),
      deltaLabel: formatSigned(deltas.phm08Delta, 1),
      winner: Math.abs(phmB - phmA) < 0.1 ? 'Tie' : phmB < phmA ? 'B' : 'A',
    },
    {
      metric: `Conformal Width (${((1 - maintenanceParams.alpha) * 100).toFixed(0)}%)`,
      category: 'Uncertainty',
      valA: `${resA.conformal.meanWidth.toFixed(1)} cyc`,
      valB: `${resB.conformal.meanWidth.toFixed(1)} cyc`,
      deltaLabel: formatSigned(
        resB.conformal.meanWidth - resA.conformal.meanWidth,
        1,
        '',
        ' cyc',
      ),
      winner:
        Math.abs(resB.conformal.meanWidth - resA.conformal.meanWidth) < 0.1
          ? 'Tie'
          : resB.conformal.meanWidth < resA.conformal.meanWidth
            ? 'B'
            : 'A',
    },
    {
      metric: 'Risk-Aware Cost / Cycle',
      category: 'Maintenance',
      valA: `$${resA.maintenance.riskAwareCostPerCycle.toFixed(3)}`,
      valB: `$${resB.maintenance.riskAwareCostPerCycle.toFixed(3)}`,
      deltaLabel: formatSigned(deltas.riskCostDelta, 3, '$', '/cyc'),
      winner:
        Math.abs(deltas.riskCostDelta) < 0.001
          ? 'Tie'
          : deltas.riskCostDelta < 0
            ? 'B'
            : 'A',
    },
    {
      metric: 'RUL Threshold Cost / Cycle',
      category: 'Maintenance',
      valA: `$${resA.maintenance.thresholdCostPerCycle.toFixed(3)}`,
      valB: `$${resB.maintenance.thresholdCostPerCycle.toFixed(3)}`,
      deltaLabel: formatSigned(deltas.thresholdCostDelta, 3, '$', '/cyc'),
      winner:
        Math.abs(deltas.thresholdCostDelta) < 0.001
          ? 'Tie'
          : deltas.thresholdCostDelta < 0
            ? 'B'
            : 'A',
    },
    {
      metric: 'Unplanned Failure Rate',
      category: 'Safety',
      valA: `${resA.maintenance.riskAwareFailureRatePct.toFixed(1)}%`,
      valB: `${resB.maintenance.riskAwareFailureRatePct.toFixed(1)}%`,
      deltaLabel: formatSigned(deltas.failureRateDelta, 1, '', ' pp'),
      winner:
        Math.abs(deltas.failureRateDelta) < 0.1
          ? 'Tie'
          : deltas.failureRateDelta < 0
            ? 'B'
            : 'A',
    },
    {
      metric: 'Mean Wasted RUL',
      category: 'Efficiency',
      valA: `${resA.maintenance.riskAwareWastedRul.toFixed(1)} cyc`,
      valB: `${resB.maintenance.riskAwareWastedRul.toFixed(1)} cyc`,
      deltaLabel: formatSigned(deltas.wastedRulDelta, 1, '', ' cyc'),
      winner:
        Math.abs(deltas.wastedRulDelta) < 0.1
          ? 'Tie'
          : deltas.wastedRulDelta < 0
            ? 'B'
            : 'A',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Split-Screen Presets & Shared Fleet Context */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-300 mr-1">Quick A/B Presets:</span>
          <button
            type="button"
            onClick={applyPresetScaling}
            className="px-2.5 py-1.5 rounded text-xs font-medium border border-slate-700 bg-[#080B12] text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            Scaling: Global vs Regime-Aware
          </button>
          <button
            type="button"
            onClick={applyPresetModels}
            className="px-2.5 py-1.5 rounded text-xs font-medium border border-slate-700 bg-[#080B12] text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            Surrogates: Ridge vs {selectedModel === 'linear_regression' ? 'HistGBT (Surrogate)' : MODEL_LABELS[selectedModel]}
          </button>
          <button
            type="button"
            onClick={handleSwap}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border border-slate-700 bg-slate-900 text-cyan-300 hover:bg-slate-800 whitespace-nowrap"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Swap A ↔ B
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-mono text-slate-400">
            Policy Basis: Cp=${maintenanceParams.preventiveCost} · Cf=${maintenanceParams.failureCost} · {((1 - maintenanceParams.alpha) * 100).toFixed(0)}% Conf
          </span>
          <div className="flex items-center gap-1.5">
            <label htmlFor="ab-engine-select" className="text-slate-400 whitespace-nowrap">
              Inspect Engine:
            </label>
            <select
              id="ab-engine-select"
              value={activeEngineId}
              onChange={(e) => setSelectedEngineId(Number(e.target.value))}
              className="rounded border border-slate-700 bg-[#080B12] px-2 py-1 text-xs font-mono text-slate-100"
            >
              {evalCandidates.map((eng) => (
                <option key={eng.engineId} value={eng.engineId}>
                  Engine #{eng.engineId} ({eng.failureCycle} cyc)
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 4-Card Delta Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Δ RUL RMSE (B − A)</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
              deltas.rmseDelta < -0.01
                ? 'text-emerald-400'
                : deltas.rmseDelta > 0.01
                  ? 'text-rose-400'
                  : 'text-slate-200'
            }`}
          >
            {formatSigned(deltas.rmseDelta, 2, '', ' cyc')}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            {formatSigned(deltas.rmsePct, 1, '', '%')} ·{' '}
            {deltas.rmseDelta < 0 ? 'Variant B lower error' : deltas.rmseDelta > 0 ? 'Variant A lower error' : 'Parity'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Δ PHM08 Score (B − A)</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
              deltas.phm08Delta < -0.1
                ? 'text-emerald-400'
                : deltas.phm08Delta > 0.1
                  ? 'text-rose-400'
                  : 'text-slate-200'
            }`}
          >
            {formatSigned(deltas.phm08Delta, 1)}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            {formatSigned(deltas.phm08Pct, 1, '', '%')} late-risk penalty diff
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Δ Risk-Aware Cost / Cycle</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
              deltas.riskCostDelta < -0.001
                ? 'text-emerald-400'
                : deltas.riskCostDelta > 0.001
                  ? 'text-rose-400'
                  : 'text-slate-200'
            }`}
          >
            {formatSigned(deltas.riskCostDelta, 3, '$', '/cyc')}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            {deltas.savingsPer100kCycles >= 0
              ? `B saves $${deltas.savingsPer100kCycles.toLocaleString()} / 100k cyc`
              : `A saves $${Math.abs(deltas.savingsPer100kCycles).toLocaleString()} / 100k cyc`}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Δ Failure Rate & Waste (B − A)</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
              deltas.failureRateDelta < 0
                ? 'text-emerald-400'
                : deltas.failureRateDelta > 0
                  ? 'text-rose-400'
                  : 'text-slate-200'
            }`}
          >
            {formatSigned(deltas.failureRateDelta, 1, '', ' pp')}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            Wasted RUL diff: {formatSigned(deltas.wastedRulDelta, 1, '', ' cyc')}
          </div>
        </div>
      </section>

      {/* Split-Screen Variant A (Left) vs Variant B (Right) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Arm A Panel */}
        <div className="rounded-lg border border-cyan-500/35 bg-[#0E131D] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-300">
                Variant A · Baseline Arm
              </div>
              <h3 className="font-display text-base font-semibold text-slate-100">
                {resA.modelLabel}
              </h3>
            </div>
            <span className="font-mono text-xs text-slate-300 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded">
              {resA.scalingLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ab-model-a" className="block text-xs text-slate-400 mb-1">
                Model Family (A)
              </label>
              <select
                id="ab-model-a"
                value={variantA.model}
                onChange={(e) =>
                  setVariantA((prev) => ({ ...prev, model: e.target.value as ModelId }))
                }
                className="w-full rounded border border-slate-700 bg-[#080B12] px-2.5 py-1.5 text-xs font-mono text-slate-100"
              >
                {MODEL_ORDER.map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs text-slate-400 mb-1">Feature Scaling (A)</span>
              <button
                type="button"
                aria-label="Toggle Variant A Regime-Aware Scaling"
                onClick={() =>
                  setVariantA((prev) => ({ ...prev, regimeAware: !prev.regimeAware }))
                }
                className={`w-full rounded border px-2.5 py-1.5 text-xs font-mono font-medium transition-colors ${
                  variantA.regimeAware
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                }`}
              >
                {variantA.regimeAware ? 'Regime-Aware (K-Means)' : 'Global (Unconditioned)'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded border border-slate-800 bg-[#080B12] p-2.5">
              <div className="text-[11px] text-slate-400">RMSE</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-cyan-300 mt-0.5">
                {rmseA.toFixed(2)} cyc
              </div>
            </div>
            <div className="rounded border border-slate-800 bg-[#080B12] p-2.5">
              <div className="text-[11px] text-slate-400">PHM08</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-slate-100 mt-0.5">
                {phmA.toFixed(1)}
              </div>
            </div>
            <div className="rounded border border-slate-800 bg-[#080B12] p-2.5">
              <div className="text-[11px] text-slate-400">Risk Cost</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-slate-100 mt-0.5">
                ${resA.maintenance.riskAwareCostPerCycle.toFixed(3)}
              </div>
            </div>
            <div className="rounded border border-slate-800 bg-[#080B12] p-2.5">
              <div className="text-[11px] text-slate-400">Fail / Waste</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-slate-100 mt-0.5">
                {resA.maintenance.riskAwareFailureRatePct.toFixed(1)}% ·{' '}
                {resA.maintenance.riskAwareWastedRul.toFixed(1)}c
              </div>
            </div>
          </div>

          <TelemetryChart
            title={`Arm A Trajectory — Engine #${activeEngineId}`}
            subtitle={`Variant A surrogate trajectory against ground-truth RUL (${splits.evaluation} eval engines cohort)`}
            yLabel="Remaining Useful Life (cycles)"
            series={trajASeries}
            height={235}
            unit="cyc"
            tickPrecision={0}
            valuePrecision={1}
            clampZero
          />
        </div>

        {/* Arm B Panel */}
        <div className="rounded-lg border border-amber-500/35 bg-[#0E131D] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-amber-300">
                Variant B · Challenger Arm
              </div>
              <h3 className="font-display text-base font-semibold text-slate-100">
                {resB.modelLabel}
              </h3>
            </div>
            <span className="font-mono text-xs text-slate-300 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded">
              {resB.scalingLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ab-model-b" className="block text-xs text-slate-400 mb-1">
                Model Family (B)
              </label>
              <select
                id="ab-model-b"
                value={variantB.model}
                onChange={(e) =>
                  setVariantB((prev) => ({ ...prev, model: e.target.value as ModelId }))
                }
                className="w-full rounded border border-slate-700 bg-[#080B12] px-2.5 py-1.5 text-xs font-mono text-slate-100"
              >
                {MODEL_ORDER.map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs text-slate-400 mb-1">Feature Scaling (B)</span>
              <button
                type="button"
                aria-label="Toggle Variant B Regime-Aware Scaling"
                onClick={() =>
                  setVariantB((prev) => ({ ...prev, regimeAware: !prev.regimeAware }))
                }
                className={`w-full rounded border px-2.5 py-1.5 text-xs font-mono font-medium transition-colors ${
                  variantB.regimeAware
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                }`}
              >
                {variantB.regimeAware ? 'Regime-Aware (K-Means)' : 'Global (Unconditioned)'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded border border-slate-800 bg-[#080B12] p-2.5">
              <div className="text-[11px] text-slate-400">RMSE</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-amber-300 mt-0.5">
                {rmseB.toFixed(2)} cyc
              </div>
            </div>
            <div className="rounded border border-slate-800 bg-[#080B12] p-2.5">
              <div className="text-[11px] text-slate-400">PHM08</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-slate-100 mt-0.5">
                {phmB.toFixed(1)}
              </div>
            </div>
            <div className="rounded border border-slate-800 bg-[#080B12] p-2.5">
              <div className="text-[11px] text-slate-400">Risk Cost</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-slate-100 mt-0.5">
                ${resB.maintenance.riskAwareCostPerCycle.toFixed(3)}
              </div>
            </div>
            <div className="rounded border border-slate-800 bg-[#080B12] p-2.5">
              <div className="text-[11px] text-slate-400">Fail / Waste</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-slate-100 mt-0.5">
                {resB.maintenance.riskAwareFailureRatePct.toFixed(1)}% ·{' '}
                {resB.maintenance.riskAwareWastedRul.toFixed(1)}c
              </div>
            </div>
          </div>

          <TelemetryChart
            title={`Arm B Trajectory — Engine #${activeEngineId}`}
            subtitle={`Variant B surrogate trajectory against ground-truth RUL (${splits.evaluation} eval engines cohort)`}
            yLabel="Remaining Useful Life (cycles)"
            series={trajBSeries}
            height={235}
            unit="cyc"
            tickPrecision={0}
            valuePrecision={1}
            clampZero
          />
        </div>
      </section>

      {/* Synchronized Overlay & Absolute Error Comparison Charts */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TelemetryChart
          title={`Simultaneous RUL Prediction Overlay — Engine #${activeEngineId}`}
          subtitle="Direct trajectory comparison of Baseline Arm A vs Challenger Arm B across full engine life"
          sampleScopeLabel={`${splits.evaluation} eval engines`}
          yLabel="Remaining Useful Life (cycles)"
          series={overlaySeries}
          height={260}
          unit="cyc"
          tickPrecision={0}
          valuePrecision={1}
          clampZero
          interpretation={{
            summary: 'Compares Arm A vs Arm B RUL predictions against ground truth',
            whatItShows:
              'Curves tracking tightly below the dashed True RUL reference predict end-of-life without late over-optimism. Regime-aware scaling suppresses erratic jumps on FD002/FD004.',
            metrics: ['rul', 'rmse', 'phm08'],
          }}
        />

        <TelemetryChart
          title={`Per-Cycle Absolute Error |ŷ − y| — Engine #${activeEngineId}`}
          subtitle="Instantaneous RUL prediction error magnitude along the operating cycle timeline"
          sampleScopeLabel={`${splits.evaluation} eval engines`}
          yLabel="Absolute RUL Error (cycles)"
          series={absErrorSeries}
          height={260}
          unit="cyc"
          tickPrecision={0}
          valuePrecision={1}
          clampZero
          interpretation={{
            summary: 'Tracks instantaneous error spikes across engine lifecycle',
            whatItShows:
              'Lower absolute error near the end-of-life tail (right half of chart) directly prevents late maintenance triggers and asymmetric PHM08 penalties.',
            metrics: ['mae', 'rmse', 'phm08'],
          }}
        />
      </section>

      {/* Head-to-Head Outcome Matrix */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Head-to-Head RUL Error &amp; Maintenance Outcome Ledger ({subset} · {splits.evaluation} Eval Engines)
            </h3>
            <p className="text-xs text-slate-400">
              Evaluated identically on {splits.evaluation} held-out eval engines ({splits.fit} fit · {splits.calibration} cal · {splits.tuning} tuning)
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">Lower is better across all cost &amp; error rows</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-medium">Metric</th>
                <th className="py-2.5 px-4 font-medium">Domain</th>
                <th className="py-2.5 px-4 font-medium text-right text-cyan-300">Variant A</th>
                <th className="py-2.5 px-4 font-medium text-right text-amber-300">Variant B</th>
                <th className="py-2.5 px-4 font-medium text-right">Delta (B − A)</th>
                <th className="py-2.5 px-4 font-medium text-right">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {matrixRows.map((row) => (
                <tr key={row.metric} className="hover:bg-slate-800/35 text-slate-300">
                  <td className="py-2.5 px-4 font-medium text-slate-100">{row.metric}</td>
                  <td className="py-2.5 px-4 text-slate-400">{row.category}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-cyan-300">
                    {row.valA}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-300">
                    {row.valB}
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                      row.winner === 'B'
                        ? 'text-emerald-400'
                        : row.winner === 'A'
                          ? 'text-rose-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {row.deltaLabel}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    {row.winner === 'Tie' ? (
                      <span className="text-slate-400">Tie</span>
                    ) : (
                      <span className={row.winner === 'B' ? 'text-amber-300' : 'text-cyan-300'}>
                        Variant {row.winner}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 pb-5">
          <TechnicalInterpretation
            title="A/B Surrogate & Scaling Ledger"
            summary="Head-to-head error, uncertainty, and economic deltas (Arm B − Arm A)"
            whatItShows="Negative deltas (B − A) in emerald mean Challenger Arm B reduces RUL estimation error, late-tail PHM08 penalty, or expected $/cycle cost relative to Baseline Arm A under identical held-out evaluation splits."
            sampleScope={`${splits.evaluation} evaluation synthetic engines in ${subset}`}
            metrics={['rmse', 'mae', 'phm08', 'cost_per_cycle', 'failure_rate', 'wasted_useful_life']}
          />
        </div>
      </section>
    </div>
  );
};
