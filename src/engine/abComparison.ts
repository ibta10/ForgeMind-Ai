import { runConformalStudy } from './conformal';
import { runMaintenanceDecisionStudy } from './maintenance';
import { MODEL_LABELS, predictEngineRulSeries, runModelBenchmark } from './models';
import type {
  AbComparisonResult,
  AbVariantConfig,
  AbVariantResult,
  EngineTrajectory,
  MaintenanceParams,
  SubsetId,
} from './types';

function evaluateAbVariant(
  fleet: EngineTrajectory[],
  subset: SubsetId,
  variant: AbVariantConfig,
  evalEngine: EngineTrajectory,
  baseMaintParams: MaintenanceParams,
  targetView: 'capped' | 'uncapped',
  rulCap: number,
  seed: number,
): AbVariantResult {
  const benchmarkRows = runModelBenchmark(fleet, subset, variant.regimeAware, rulCap, seed);
  const matchedRow =
    benchmarkRows.find((r) => r.model === variant.model) ?? benchmarkRows[0];

  const conformal = runConformalStudy(
    fleet,
    subset,
    variant.model,
    baseMaintParams.alpha,
    'rul_binned',
    variant.regimeAware,
    rulCap,
    seed,
  );

  const maint = runMaintenanceDecisionStudy(
    fleet,
    {
      ...baseMaintParams,
      subset,
      model: variant.model,
      regimeAware: variant.regimeAware,
      seed,
    },
    rulCap,
  );

  const byPolicy = new Map(maint.summaries.map((s) => [s.policy, s]));
  const riskSummary = byPolicy.get('risk_aware');
  const threshSummary = byPolicy.get('threshold');
  const oracleSummary = byPolicy.get('oracle');

  const predRul = predictEngineRulSeries(
    fleet,
    evalEngine,
    variant.model,
    variant.regimeAware,
    rulCap,
    seed,
  );

  const cycles = evalEngine.cycles.map((c) => c.cycle);
  const targetRul = evalEngine.cycles.map((c) => c.cappedRul);
  const uncappedRul = evalEngine.cycles.map((c) => c.trueRul);
  const absError = evalEngine.cycles.map((c, idx) => {
    const ref = targetView === 'capped' ? c.cappedRul : c.trueRul;
    return Number(Math.abs(predRul[idx] - ref).toFixed(2));
  });

  return {
    config: variant,
    modelLabel: MODEL_LABELS[variant.model],
    scalingLabel: variant.regimeAware ? 'Regime-Aware Scaling' : 'Global Scaling',
    metrics: matchedRow.metrics,
    trainTimeSec: matchedRow.trainTimeSec,
    conformal: {
      empiricalCoverage: conformal.empiricalCoverage,
      meanWidth: conformal.meanWidth,
      globalQHat: conformal.globalQHat,
    },
    maintenance: {
      riskAwareCostPerCycle: riskSummary?.meanCostPerCycle ?? 0,
      riskAwareFailureRatePct: riskSummary?.failureRatePct ?? 0,
      riskAwareWastedRul: riskSummary?.meanWastedRul ?? 0,
      thresholdCostPerCycle: threshSummary?.meanCostPerCycle ?? 0,
      thresholdFailureRatePct: threshSummary?.failureRatePct ?? 0,
      thresholdWastedRul: threshSummary?.meanWastedRul ?? 0,
      oracleCostPerCycle: oracleSummary?.meanCostPerCycle ?? 0,
      tunedRiskThreshold: maint.tunedParams.riskThreshold,
      tunedPointThreshold: maint.tunedParams.rulThreshold,
    },
    sampleTrajectory: {
      engineId: evalEngine.engineId,
      cycles,
      targetRul,
      uncappedRul,
      predRul,
      absError,
    },
  };
}

export function runModelAbComparison(
  fleet: EngineTrajectory[],
  subset: SubsetId,
  variantAConfig: AbVariantConfig,
  variantBConfig: AbVariantConfig,
  baseMaintParams: MaintenanceParams,
  options?: {
    evalEngineId?: number;
    targetView?: 'capped' | 'uncapped';
    rulCap?: number;
    seed?: number;
  },
): AbComparisonResult {
  const rulCap = options?.rulCap ?? 125;
  const seed = options?.seed ?? baseMaintParams.seed;
  const targetView = options?.targetView ?? 'capped';

  const evalPool = fleet.filter((e) => e.split === 'evaluation');
  const candidates = evalPool.length > 0 ? evalPool : fleet;
  const evalEngine =
    candidates.find((e) => e.engineId === options?.evalEngineId) ?? candidates[0];

  const variantA = evaluateAbVariant(
    fleet,
    subset,
    variantAConfig,
    evalEngine,
    baseMaintParams,
    targetView,
    rulCap,
    seed,
  );

  const variantB = evaluateAbVariant(
    fleet,
    subset,
    variantBConfig,
    evalEngine,
    baseMaintParams,
    targetView,
    rulCap,
    seed,
  );

  const rmseA = targetView === 'capped' ? variantA.metrics.cappedRmse : variantA.metrics.rmse;
  const rmseB = targetView === 'capped' ? variantB.metrics.cappedRmse : variantB.metrics.rmse;
  const maeA = targetView === 'capped' ? variantA.metrics.cappedMae : variantA.metrics.mae;
  const maeB = targetView === 'capped' ? variantB.metrics.cappedMae : variantB.metrics.mae;
  const phmA = targetView === 'capped' ? variantA.metrics.cappedPhm08 : variantA.metrics.phm08;
  const phmB = targetView === 'capped' ? variantB.metrics.cappedPhm08 : variantB.metrics.phm08;

  const rmseDelta = Number((rmseB - rmseA).toFixed(2));
  const rmsePct = rmseA > 0 ? Number((((rmseB - rmseA) / rmseA) * 100).toFixed(1)) : 0;
  const maeDelta = Number((maeB - maeA).toFixed(2));
  const phm08Delta = Number((phmB - phmA).toFixed(1));
  const phm08Pct = phmA > 0 ? Number((((phmB - phmA) / phmA) * 100).toFixed(1)) : 0;

  const costA = variantA.maintenance.riskAwareCostPerCycle;
  const costB = variantB.maintenance.riskAwareCostPerCycle;
  const riskCostDelta = Number((costB - costA).toFixed(3));
  const riskCostPct = costA > 0 ? Number((((costB - costA) / costA) * 100).toFixed(1)) : 0;

  const thresholdCostDelta = Number(
    (
      variantB.maintenance.thresholdCostPerCycle -
      variantA.maintenance.thresholdCostPerCycle
    ).toFixed(3),
  );
  const failureRateDelta = Number(
    (
      variantB.maintenance.riskAwareFailureRatePct -
      variantA.maintenance.riskAwareFailureRatePct
    ).toFixed(1),
  );
  const wastedRulDelta = Number(
    (variantB.maintenance.riskAwareWastedRul - variantA.maintenance.riskAwareWastedRul).toFixed(
      1,
    ),
  );
  const savingsPer100kCycles = Math.round((costA - costB) * 100_000);

  return {
    subset,
    evalEngineId: evalEngine.engineId,
    variantA,
    variantB,
    deltas: {
      rmseDelta,
      rmsePct,
      maeDelta,
      phm08Delta,
      phm08Pct,
      riskCostDelta,
      riskCostPct,
      thresholdCostDelta,
      failureRateDelta,
      wastedRulDelta,
      savingsPer100kCycles,
    },
  };
}
