import { calibrateConformalModel, type CalibratedConformalModel } from './conformal';
import { predictWithEstimator, trainRulEstimator } from './models';
import { bootstrapMeanCi, createSeededRng, mean } from './prng';
import type {
  EngineTrajectory,
  EpisodeOutcome,
  MaintenanceParams,
  MaintenanceRoiEpisodePoint,
  MaintenanceRoiPolicySummary,
  MaintenanceRoiResult,
  PolicyComparisonConfig,
  PolicyComparisonResult,
  PolicyConfigurationEvaluation,
  PolicyId,
  PolicySummary,
  SensitivityPoint,
  SubsetId,
  ThresholdCostSurfaceCell,
  ThresholdCostSurfaceResult,
} from './types';

export const POLICY_LABELS: Record<PolicyId, string> = {
  run_to_failure: 'Run-to-Failure',
  fixed_interval: 'Fixed Interval',
  threshold: 'RUL Threshold',
  risk_aware: 'Risk-Aware Conformal',
  oracle: 'Oracle (Perfect Foresight)',
};

export function simulateEpisode(
  engine: EngineTrajectory,
  preds: number[],
  calibrator: CalibratedConformalModel,
  policy: PolicyId,
  params: {
    preventiveCost: number;
    failureCost: number;
    fixedInterval: number;
    rulThreshold: number;
    riskMultiplier: number;
  },
): EpisodeOutcome {
  const T = engine.failureCycle;

  if (policy === 'run_to_failure') {
    return {
      engineId: engine.engineId,
      policy,
      failureCycle: T,
      actionCycle: T,
      failed: true,
      cost: params.failureCost,
      operatingCycles: T,
      wastedRul: 0,
    };
  }

  if (policy === 'oracle') {
    const actionCycle = Math.max(1, T - 1);
    return {
      engineId: engine.engineId,
      policy,
      failureCycle: T,
      actionCycle,
      failed: false,
      cost: params.preventiveCost,
      operatingCycles: actionCycle,
      wastedRul: 1,
    };
  }

  for (let i = 0; i < engine.cycles.length; i++) {
    const cycle = engine.cycles[i].cycle;
    // Engine fails on its final cycle T if not replaced before cycle T
    if (cycle >= T) {
      return {
        engineId: engine.engineId,
        policy,
        failureCycle: T,
        actionCycle: T,
        failed: true,
        cost: params.failureCost,
        operatingCycles: T,
        wastedRul: 0,
      };
    }

    let triggerReplace = false;
    if (policy === 'fixed_interval') {
      triggerReplace = cycle >= params.fixedInterval;
    } else if (policy === 'threshold') {
      triggerReplace = preds[i] <= params.rulThreshold;
    } else if (policy === 'risk_aware') {
      const halfWidth = calibrator.getHalfWidth(preds[i]) * params.riskMultiplier;
      const lowerBound = Math.max(0, preds[i] - halfWidth);
      triggerReplace = lowerBound <= params.rulThreshold;
    }

    if (triggerReplace) {
      return {
        engineId: engine.engineId,
        policy,
        failureCycle: T,
        actionCycle: cycle,
        failed: false,
        cost: params.preventiveCost,
        operatingCycles: cycle,
        wastedRul: T - cycle,
      };
    }
  }

  return {
    engineId: engine.engineId,
    policy,
    failureCycle: T,
    actionCycle: T,
    failed: true,
    cost: params.failureCost,
    operatingCycles: T,
    wastedRul: 0,
  };
}

function summarizePolicy(
  policy: PolicyId,
  tunedParamLabel: string,
  episodes: EpisodeOutcome[],
  rngSeed: number,
): PolicySummary {
  const perEngineCostsPerCycle = episodes.map((ep) => ep.cost / Math.max(1, ep.operatingCycles));
  const boot = bootstrapMeanCi(perEngineCostsPerCycle, createSeededRng(rngSeed), 350);
  const totalCost = episodes.reduce((s, e) => s + e.cost, 0);
  const totalCycles = episodes.reduce((s, e) => s + e.operatingCycles, 0);
  const failureCount = episodes.filter((e) => e.failed).length;
  const preventiveCount = episodes.length - failureCount;

  return {
    policy,
    label: POLICY_LABELS[policy],
    tunedParamLabel,
    meanCostPerCycle: Number((totalCost / Math.max(1, totalCycles)).toFixed(3)),
    ciLower: Number(boot.lower.toFixed(3)),
    ciUpper: Number(boot.upper.toFixed(3)),
    totalCost: Math.round(totalCost),
    totalCycles,
    preventiveCount,
    failureCount,
    failureRatePct: Number(((failureCount / Math.max(1, episodes.length)) * 100).toFixed(1)),
    meanWastedRul: Number(mean(episodes.map((e) => e.wastedRul)).toFixed(1)),
    episodes,
  };
}

export function runMaintenanceDecisionStudy(
  fleet: EngineTrajectory[],
  params: MaintenanceParams,
  rulCap = 125,
): {
  summaries: PolicySummary[];
  tunedParams: {
    fixedInterval: number;
    rulThreshold: number;
    riskThreshold: number;
  };
} {
  const tuneEngines = fleet.filter((e) => e.split === 'tuning');
  const evalEngines = fleet.filter((e) => e.split === 'evaluation');

  const estimator = trainRulEstimator(fleet, params.model, params.regimeAware, rulCap, params.seed);
  const calibrator = calibrateConformalModel(
    fleet,
    params.model,
    params.regimeAware,
    params.alpha,
    'rul_binned',
    rulCap,
    params.seed,
  );

  const tunePool = tuneEngines.length > 0 ? tuneEngines : fleet.slice(8, 18);
  const evalPool = evalEngines.length > 0 ? evalEngines : fleet.slice(-12);

  const tunePreds = tunePool.map((eng) => predictWithEstimator(estimator, eng));
  const evalPreds = evalPool.map((eng) => predictWithEstimator(estimator, eng));

  let bestFixed = params.fixedInterval;
  let bestThreshold = params.rulThreshold;
  let bestRiskThreshold = params.rulThreshold;

  if (params.autoTune) {
    // Grid search on tuning split only
    let minFixedCpc = Infinity;
    for (let interval = 100; interval <= 240; interval += 10) {
      const eps = tunePool.map((eng, i) =>
        simulateEpisode(eng, tunePreds[i], calibrator, 'fixed_interval', {
          preventiveCost: params.preventiveCost,
          failureCost: params.failureCost,
          fixedInterval: interval,
          rulThreshold: params.rulThreshold,
          riskMultiplier: params.riskMultiplier,
        }),
      );
      const cpc =
        eps.reduce((s, e) => s + e.cost, 0) / Math.max(1, eps.reduce((s, e) => s + e.operatingCycles, 0));
      if (cpc < minFixedCpc) {
        minFixedCpc = cpc;
        bestFixed = interval;
      }
    }

    let minThreshCpc = Infinity;
    for (let thr = 6; thr <= 42; thr += 3) {
      const eps = tunePool.map((eng, i) =>
        simulateEpisode(eng, tunePreds[i], calibrator, 'threshold', {
          preventiveCost: params.preventiveCost,
          failureCost: params.failureCost,
          fixedInterval: bestFixed,
          rulThreshold: thr,
          riskMultiplier: params.riskMultiplier,
        }),
      );
      const cpc =
        eps.reduce((s, e) => s + e.cost, 0) / Math.max(1, eps.reduce((s, e) => s + e.operatingCycles, 0));
      if (cpc < minThreshCpc) {
        minThreshCpc = cpc;
        bestThreshold = thr;
      }
    }

    let minRiskCpc = Infinity;
    for (let thr = 4; thr <= 34; thr += 3) {
      const eps = tunePool.map((eng, i) =>
        simulateEpisode(eng, tunePreds[i], calibrator, 'risk_aware', {
          preventiveCost: params.preventiveCost,
          failureCost: params.failureCost,
          fixedInterval: bestFixed,
          rulThreshold: thr,
          riskMultiplier: params.riskMultiplier,
        }),
      );
      const cpc =
        eps.reduce((s, e) => s + e.cost, 0) / Math.max(1, eps.reduce((s, e) => s + e.operatingCycles, 0));
      if (cpc < minRiskCpc) {
        minRiskCpc = cpc;
        bestRiskThreshold = thr;
      }
    }
  }

  const policies: Array<{ id: PolicyId; paramLabel: string; thr: number }> = [
    { id: 'run_to_failure', paramLabel: 'No preventive action', thr: 0 },
    { id: 'fixed_interval', paramLabel: `T = ${bestFixed} cycles`, thr: bestThreshold },
    { id: 'threshold', paramLabel: `RUL ≤ ${bestThreshold} cyc`, thr: bestThreshold },
    {
      id: 'risk_aware',
      paramLabel: `LB(α=${params.alpha.toFixed(2)}) ≤ ${bestRiskThreshold} cyc`,
      thr: bestRiskThreshold,
    },
    { id: 'oracle', paramLabel: 'Replace at T - 1', thr: 1 },
  ];

  const summaries = policies.map((p, idx) => {
    const episodes = evalPool.map((eng, i) =>
      simulateEpisode(eng, evalPreds[i], calibrator, p.id, {
        preventiveCost: params.preventiveCost,
        failureCost: params.failureCost,
        fixedInterval: bestFixed,
        rulThreshold: p.thr,
        riskMultiplier: params.riskMultiplier,
      }),
    );
    return summarizePolicy(p.id, p.paramLabel, episodes, params.seed + idx * 101);
  });

  return {
    summaries,
    tunedParams: {
      fixedInterval: bestFixed,
      rulThreshold: bestThreshold,
      riskThreshold: bestRiskThreshold,
    },
  };
}

export function runCostRatioSensitivity(
  fleet: EngineTrajectory[],
  baseParams: MaintenanceParams,
  rulCap = 125,
): SensitivityPoint[] {
  const ratios = [2, 4, 6, 10, 15, 20];
  const tuneEngines = fleet.filter((e) => e.split === 'tuning');
  const evalEngines = fleet.filter((e) => e.split === 'evaluation');
  const tunePool = tuneEngines.length > 0 ? tuneEngines : fleet.slice(8, 18);
  const evalPool = evalEngines.length > 0 ? evalEngines : fleet.slice(-12);

  const estimator = trainRulEstimator(fleet, baseParams.model, baseParams.regimeAware, rulCap, baseParams.seed);
  const calibrator = calibrateConformalModel(
    fleet,
    baseParams.model,
    baseParams.regimeAware,
    baseParams.alpha,
    'rul_binned',
    rulCap,
    baseParams.seed,
  );
  const tunePreds = tunePool.map((eng) => predictWithEstimator(estimator, eng));
  const evalPreds = evalPool.map((eng) => predictWithEstimator(estimator, eng));

  return ratios.map((ratio) => {
    const failureCost = Math.round(baseParams.preventiveCost * ratio);

    let bestFixed = baseParams.fixedInterval;
    let bestThreshold = baseParams.rulThreshold;
    let bestRiskThreshold = baseParams.rulThreshold;

    if (baseParams.autoTune) {
      let minFixedCpc = Infinity;
      for (let interval = 100; interval <= 240; interval += 10) {
        const eps = tunePool.map((eng, i) =>
          simulateEpisode(eng, tunePreds[i], calibrator, 'fixed_interval', {
            preventiveCost: baseParams.preventiveCost,
            failureCost,
            fixedInterval: interval,
            rulThreshold: baseParams.rulThreshold,
            riskMultiplier: baseParams.riskMultiplier,
          }),
        );
        const cpc =
          eps.reduce((s, e) => s + e.cost, 0) / Math.max(1, eps.reduce((s, e) => s + e.operatingCycles, 0));
        if (cpc < minFixedCpc) {
          minFixedCpc = cpc;
          bestFixed = interval;
        }
      }

      let minThreshCpc = Infinity;
      for (let thr = 6; thr <= 42; thr += 3) {
        const eps = tunePool.map((eng, i) =>
          simulateEpisode(eng, tunePreds[i], calibrator, 'threshold', {
            preventiveCost: baseParams.preventiveCost,
            failureCost,
            fixedInterval: bestFixed,
            rulThreshold: thr,
            riskMultiplier: baseParams.riskMultiplier,
          }),
        );
        const cpc =
          eps.reduce((s, e) => s + e.cost, 0) / Math.max(1, eps.reduce((s, e) => s + e.operatingCycles, 0));
        if (cpc < minThreshCpc) {
          minThreshCpc = cpc;
          bestThreshold = thr;
        }
      }

      let minRiskCpc = Infinity;
      for (let thr = 4; thr <= 34; thr += 3) {
        const eps = tunePool.map((eng, i) =>
          simulateEpisode(eng, tunePreds[i], calibrator, 'risk_aware', {
            preventiveCost: baseParams.preventiveCost,
            failureCost,
            fixedInterval: bestFixed,
            rulThreshold: thr,
            riskMultiplier: baseParams.riskMultiplier,
          }),
        );
        const cpc =
          eps.reduce((s, e) => s + e.cost, 0) / Math.max(1, eps.reduce((s, e) => s + e.operatingCycles, 0));
        if (cpc < minRiskCpc) {
          minRiskCpc = cpc;
          bestRiskThreshold = thr;
        }
      }
    }

    const evalCostPerCycle = (policyId: PolicyId, thr: number) => {
      const eps = evalPool.map((eng, i) =>
        simulateEpisode(eng, evalPreds[i], calibrator, policyId, {
          preventiveCost: baseParams.preventiveCost,
          failureCost,
          fixedInterval: bestFixed,
          rulThreshold: thr,
          riskMultiplier: baseParams.riskMultiplier,
        }),
      );
      const totalCost = eps.reduce((s, e) => s + e.cost, 0);
      const totalCycles = Math.max(1, eps.reduce((s, e) => s + e.operatingCycles, 0));
      return Number((totalCost / totalCycles).toFixed(3));
    };

    return {
      costRatio: ratio,
      failureCost,
      fixedCostPerCycle: evalCostPerCycle('fixed_interval', bestThreshold),
      thresholdCostPerCycle: evalCostPerCycle('threshold', bestThreshold),
      riskAwareCostPerCycle: evalCostPerCycle('risk_aware', bestRiskThreshold),
      oracleCostPerCycle: evalCostPerCycle('oracle', 1),
    };
  });
}

export function runThresholdCostSurface(
  fleet: EngineTrajectory[],
  baseParams: MaintenanceParams,
  rulCap = 125,
): ThresholdCostSurfaceResult {
  const thresholds = [5, 10, 15, 20, 25, 30, 35, 40, 45];
  const preventiveCosts = [50, 80, 110, 140, 170, 200, 230, 260];

  const evalEngines = fleet.filter((e) => e.split === 'evaluation');
  const evalPool = evalEngines.length > 0 ? evalEngines : fleet.slice(-12);

  const estimator = trainRulEstimator(fleet, baseParams.model, baseParams.regimeAware, rulCap, baseParams.seed);
  const calibrator = calibrateConformalModel(
    fleet,
    baseParams.model,
    baseParams.regimeAware,
    baseParams.alpha,
    'rul_binned',
    rulCap,
    baseParams.seed,
  );

  const evalPreds = evalPool.map((eng) => predictWithEstimator(estimator, eng));

  const cells: ThresholdCostSurfaceCell[] = [];
  const optimalRiskByCost: ThresholdCostSurfaceResult['optimalRiskByCost'] = {};
  const optimalThresholdByCost: ThresholdCostSurfaceResult['optimalThresholdByCost'] = {};

  for (const preventiveCost of preventiveCosts) {
    let bestRisk = { rulThreshold: thresholds[0], costPerCycle: Infinity, failureRatePct: 0 };
    let bestThresh = { rulThreshold: thresholds[0], costPerCycle: Infinity, failureRatePct: 0 };

    for (const rulThreshold of thresholds) {
      const riskEpisodes = evalPool.map((eng, i) =>
        simulateEpisode(eng, evalPreds[i], calibrator, 'risk_aware', {
          preventiveCost,
          failureCost: baseParams.failureCost,
          fixedInterval: baseParams.fixedInterval,
          rulThreshold,
          riskMultiplier: baseParams.riskMultiplier,
        }),
      );
      const threshEpisodes = evalPool.map((eng, i) =>
        simulateEpisode(eng, evalPreds[i], calibrator, 'threshold', {
          preventiveCost,
          failureCost: baseParams.failureCost,
          fixedInterval: baseParams.fixedInterval,
          rulThreshold,
          riskMultiplier: baseParams.riskMultiplier,
        }),
      );

      const riskCost =
        riskEpisodes.reduce((s, e) => s + e.cost, 0) /
        Math.max(1, riskEpisodes.reduce((s, e) => s + e.operatingCycles, 0));
      const riskFailPct =
        (riskEpisodes.filter((e) => e.failed).length / Math.max(1, riskEpisodes.length)) * 100;
      const riskWasted = mean(riskEpisodes.map((e) => e.wastedRul));

      const threshCost =
        threshEpisodes.reduce((s, e) => s + e.cost, 0) /
        Math.max(1, threshEpisodes.reduce((s, e) => s + e.operatingCycles, 0));
      const threshFailPct =
        (threshEpisodes.filter((e) => e.failed).length / Math.max(1, threshEpisodes.length)) * 100;
      const threshWasted = mean(threshEpisodes.map((e) => e.wastedRul));

      const advantagePct =
        threshCost > 0 ? ((threshCost - riskCost) / threshCost) * 100 : 0;

      const cell: ThresholdCostSurfaceCell = {
        rulThreshold,
        preventiveCost,
        riskAwareCostPerCycle: Number(riskCost.toFixed(3)),
        riskAwareFailureRatePct: Number(riskFailPct.toFixed(1)),
        riskAwareWastedRul: Number(riskWasted.toFixed(1)),
        thresholdCostPerCycle: Number(threshCost.toFixed(3)),
        thresholdFailureRatePct: Number(threshFailPct.toFixed(1)),
        thresholdWastedRul: Number(threshWasted.toFixed(1)),
        advantagePct: Number(advantagePct.toFixed(1)),
      };
      cells.push(cell);

      if (cell.riskAwareCostPerCycle < bestRisk.costPerCycle) {
        bestRisk = {
          rulThreshold,
          costPerCycle: cell.riskAwareCostPerCycle,
          failureRatePct: cell.riskAwareFailureRatePct,
        };
      }
      if (cell.thresholdCostPerCycle < bestThresh.costPerCycle) {
        bestThresh = {
          rulThreshold,
          costPerCycle: cell.thresholdCostPerCycle,
          failureRatePct: cell.thresholdFailureRatePct,
        };
      }
    }

    optimalRiskByCost[preventiveCost] = bestRisk;
    optimalThresholdByCost[preventiveCost] = bestThresh;
  }

  return {
    thresholds,
    preventiveCosts,
    cells,
    optimalRiskByCost,
    optimalThresholdByCost,
  };
}

export function computeMaintenanceRoi(summaries: PolicySummary[]): MaintenanceRoiResult {
  const baseline =
    summaries.find((s) => s.policy === 'run_to_failure') ?? summaries[0];

  if (!baseline) {
    return {
      baselinePolicy: 'run_to_failure',
      baselineLabel: POLICY_LABELS.run_to_failure,
      baselineCostPerCycle: 0,
      baselineSpendPer10kCycles: 0,
      baselineTotalCost: 0,
      baselineFailureCount: 0,
      evalEngineCount: 0,
      policies: [],
    };
  }

  const baselineCpc = baseline.totalCost / Math.max(1, baseline.totalCycles);
  const baselineSpend10k = Math.round(baselineCpc * 10000);
  const comparisonOrder: PolicyId[] = ['fixed_interval', 'threshold', 'risk_aware', 'oracle'];

  const policies: MaintenanceRoiPolicySummary[] = [];

  for (const policyId of comparisonOrder) {
    const summary = summaries.find((s) => s.policy === policyId);
    if (!summary) continue;

    const policyCpc = summary.totalCost / Math.max(1, summary.totalCycles);
    const policySpend10k = Math.round(policyCpc * 10000);
    const savings10k = baselineSpend10k - policySpend10k;
    const costReductionPct =
      baselineCpc > 0 ? ((baselineCpc - policyCpc) / baselineCpc) * 100 : 0;
    const roiPct =
      summary.totalCost > 0
        ? ((baselineCpc * summary.totalCycles - summary.totalCost) / summary.totalCost) * 100
        : 0;

    // Sort episodes deterministically by engineId for trajectory continuity
    const sortedEpisodes = [...summary.episodes].sort((a, b) => a.engineId - b.engineId);
    let cumulativeCycles = 0;
    let cumulativeBaselineSpend = 0;
    let cumulativePolicySpend = 0;

    const episodesSeries: MaintenanceRoiEpisodePoint[] = sortedEpisodes.map((ep, idx) => {
      const cycleNormalizedBaseline = baselineCpc * ep.operatingCycles;
      const episodeSavings = cycleNormalizedBaseline - ep.cost;
      cumulativeCycles += ep.operatingCycles;
      cumulativeBaselineSpend += cycleNormalizedBaseline;
      cumulativePolicySpend += ep.cost;

      return {
        step: idx + 1,
        engineId: ep.engineId,
        cumulativeCycles,
        cumulativeSavings: Number((cumulativeBaselineSpend - cumulativePolicySpend).toFixed(2)),
        cumulativeBaselineSpend: Number(cumulativeBaselineSpend.toFixed(2)),
        cumulativePolicySpend: Number(cumulativePolicySpend.toFixed(2)),
        episodeSavings: Number(episodeSavings.toFixed(2)),
        failed: ep.failed,
      };
    });

    const realizedEvalSavings = Number(
      (baselineCpc * summary.totalCycles - summary.totalCost).toFixed(2),
    );

    policies.push({
      policy: policyId,
      label: summary.label,
      costPerCycle: summary.meanCostPerCycle,
      baselineCostPerCycle: baseline.meanCostPerCycle,
      costReductionPct: Number(costReductionPct.toFixed(1)),
      roiPct: Number(roiPct.toFixed(1)),
      savingsPer10kCycles: savings10k,
      baselineSpendPer10kCycles: baselineSpend10k,
      policySpendPer10kCycles: policySpend10k,
      realizedEvalSavings,
      avoidedFailures: baseline.failureCount - summary.failureCount,
      failureRatePct: summary.failureRatePct,
      episodesSeries,
    });
  }

  return {
    baselinePolicy: baseline.policy,
    baselineLabel: baseline.label,
    baselineCostPerCycle: baseline.meanCostPerCycle,
    baselineSpendPer10kCycles: baselineSpend10k,
    baselineTotalCost: baseline.totalCost,
    baselineFailureCount: baseline.failureCount,
    evalEngineCount: baseline.episodes.length,
    policies,
  };
}

export function evaluatePolicyConfiguration(
  fleet: EngineTrajectory[],
  config: PolicyComparisonConfig,
  context: {
    subset: SubsetId;
    preventiveCost: number;
    failureCost: number;
    riskMultiplier: number;
    seed: number;
  },
  rulCap = 125,
): PolicyConfigurationEvaluation {
  const { summaries } = runMaintenanceDecisionStudy(
    fleet,
    {
      subset: context.subset,
      model: config.model,
      preventiveCost: context.preventiveCost,
      failureCost: context.failureCost,
      alpha: config.alpha,
      fixedInterval: config.fixedInterval,
      rulThreshold: config.rulThreshold,
      riskMultiplier: context.riskMultiplier,
      regimeAware: config.regimeAware,
      autoTune: config.autoTune,
      seed: context.seed,
    },
    rulCap,
  );

  const summary =
    summaries.find((s) => s.policy === config.policy) ?? summaries[0];

  const preventiveSpend = Math.round(summary.preventiveCount * context.preventiveCost);
  const failureSpend = Math.round(summary.failureCount * context.failureCost);

  return {
    config,
    summary,
    preventiveSpend,
    failureSpend,
    effectiveParamLabel: summary.tunedParamLabel,
  };
}

export function comparePolicyConfigurations(
  fleet: EngineTrajectory[],
  configA: PolicyComparisonConfig,
  configB: PolicyComparisonConfig,
  context: {
    subset: SubsetId;
    preventiveCost: number;
    failureCost: number;
    riskMultiplier: number;
    seed: number;
  },
  rulCap = 125,
): PolicyComparisonResult {
  const resultA = evaluatePolicyConfiguration(fleet, configA, context, rulCap);
  const resultB = evaluatePolicyConfiguration(fleet, configB, context, rulCap);

  const sumA = resultA.summary;
  const sumB = resultB.summary;

  const totalCostDelta = Math.round(sumB.totalCost - sumA.totalCost);
  const totalCostPct =
    sumA.totalCost > 0
      ? Number((((sumB.totalCost - sumA.totalCost) / sumA.totalCost) * 100).toFixed(1))
      : 0;
  const costPerCycleDelta = Number((sumB.meanCostPerCycle - sumA.meanCostPerCycle).toFixed(3));
  const costPerCyclePct =
    sumA.meanCostPerCycle > 0
      ? Number(
          (((sumB.meanCostPerCycle - sumA.meanCostPerCycle) / sumA.meanCostPerCycle) * 100).toFixed(
            1,
          ),
        )
      : 0;

  return {
    evalEngineCount: sumA.episodes.length,
    preventiveCost: context.preventiveCost,
    failureCost: context.failureCost,
    resultA,
    resultB,
    deltas: {
      totalCostDelta,
      totalCostPct,
      costPerCycleDelta,
      costPerCyclePct,
      failureRateDelta: Number((sumB.failureRatePct - sumA.failureRatePct).toFixed(1)),
      failureCountDelta: sumB.failureCount - sumA.failureCount,
      wastedRulDelta: Number((sumB.meanWastedRul - sumA.meanWastedRul).toFixed(1)),
      preventiveSpendDelta: resultB.preventiveSpend - resultA.preventiveSpend,
      failureSpendDelta: resultB.failureSpend - resultA.failureSpend,
    },
  };
}

