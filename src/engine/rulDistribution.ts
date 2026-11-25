import { predictWithEstimator, trainRulEstimator } from './models';
import { computeStaggeredObservedCycle, quantile } from './prng';
import type { EngineTrajectory, ModelId, SubsetId } from './types';

export type HistogramSnapshotMode = 'playback_cycle' | 'mixed_fleet';

export interface RulHistogramBin {
  index: number;
  label: string;
  minRul: number;
  maxRul: number;
  isOpenEndedUpper: boolean;
  count: number;
  pct: number;
  engineIds: number[];
  containsPrimary: boolean;
  zone: 'critical' | 'warning' | 'healthy';
}

export interface SubsetRulHistogramResult {
  subset: SubsetId;
  model: ModelId;
  snapshotMode: HistogramSnapshotMode;
  targetCycle: number;
  binWidth: number;
  totalEngines: number;
  alreadyFailedCount: number;
  bins: RulHistogramBin[];
  meanPredRul: number;
  stdDevPredRul: number;
  medianPredRul: number;
  p10PredRul: number;
  p25PredRul: number;
  p75PredRul: number;
  p90PredRul: number;
  primaryEngineId: number;
  primaryEnginePredRul: number;
  primaryEngineRank: number;
  dominantBinLabel: string;
  dominantBinCount: number;
  unitRuls: Array<{ engineId: number; predRul: number; alreadyFailed: boolean }>;
}

export function buildSubsetRulHistogram(
  fleet: EngineTrajectory[],
  options: {
    subset: SubsetId;
    primaryEngineId: number;
    model: ModelId;
    regimeAware: boolean;
    rulThreshold: number;
    rulCap: number;
    seed: number;
    snapshotMode: HistogramSnapshotMode;
    targetCycle: number;
    binWidth?: number;
  },
): SubsetRulHistogramResult {
  const {
    subset,
    primaryEngineId,
    model,
    regimeAware,
    rulThreshold,
    rulCap,
    seed,
    snapshotMode,
    targetCycle,
  } = options;
  const binWidth = options.binWidth ?? 15;
  const estimator = trainRulEstimator(fleet, model, regimeAware, rulCap, seed);

  let alreadyFailedCount = 0;

  const unitRuls = fleet.map((eng) => {
    const preds = predictWithEstimator(estimator, eng);
    let predRul: number;
    let alreadyFailed = false;

    if (snapshotMode === 'mixed_fleet') {
      const obsCycle = computeStaggeredObservedCycle(eng.failureCycle, eng.engineId, seed);
      const obsIdx = Math.max(0, Math.min(eng.cycles.length - 1, obsCycle - 1));
      predRul = Number(Math.max(0, preds[obsIdx]).toFixed(1));
    } else {
      const clampedTarget = Math.max(1, Math.round(targetCycle));
      if (clampedTarget > eng.failureCycle) {
        alreadyFailed = true;
        alreadyFailedCount += 1;
        predRul = 0;
      } else {
        const obsIdx = Math.max(0, Math.min(eng.cycles.length - 1, clampedTarget - 1));
        predRul = Number(Math.max(0, preds[obsIdx]).toFixed(1));
      }
    }

    return {
      engineId: eng.engineId,
      predRul,
      alreadyFailed,
    };
  });

  // Ensure enough bins to cover [0, max(135, rulCap + 10)] cleanly (default 10 bins of 15c = 0..135+)
  const numBins = Math.max(9, Math.ceil((rulCap + 15) / binWidth));
  const bins: RulHistogramBin[] = Array.from({ length: numBins }, (_, i) => {
    const minRul = i * binWidth;
    const maxRul = (i + 1) * binWidth;
    const isOpenEndedUpper = i === numBins - 1;
    const midpoint = minRul + binWidth * 0.5;
    let zone: 'critical' | 'warning' | 'healthy';
    if (maxRul <= rulThreshold + 5 || midpoint <= rulThreshold) {
      zone = 'critical';
    } else if (minRul <= rulThreshold + 25) {
      zone = 'warning';
    } else {
      zone = 'healthy';
    }

    return {
      index: i,
      label: isOpenEndedUpper ? `${minRul}+` : `${minRul}–${maxRul}`,
      minRul,
      maxRul,
      isOpenEndedUpper,
      count: 0,
      pct: 0,
      engineIds: [],
      containsPrimary: false,
      zone,
    };
  });

  for (const u of unitRuls) {
    const rawIdx = Math.floor(Math.max(0, u.predRul) / binWidth);
    const binIdx = Math.min(bins.length - 1, rawIdx);
    const bin = bins[binIdx];
    bin.count += 1;
    bin.engineIds.push(u.engineId);
    if (u.engineId === primaryEngineId) {
      bin.containsPrimary = true;
    }
  }

  const totalEngines = unitRuls.length;
  for (const bin of bins) {
    bin.pct = totalEngines > 0 ? Number(((bin.count / totalEngines) * 100).toFixed(1)) : 0;
  }

  const sortedRuls = [...unitRuls.map((u) => u.predRul)].sort((a, b) => a - b);
  const meanVal =
    totalEngines > 0
      ? sortedRuls.reduce((s, v) => s + v, 0) / totalEngines
      : 0;
  const variance =
    totalEngines > 0
      ? sortedRuls.reduce((s, v) => s + (v - meanVal) * (v - meanVal), 0) / totalEngines
      : 0;

  const primaryEntry = unitRuls.find((u) => u.engineId === primaryEngineId) ?? unitRuls[0];
  const primaryPred = primaryEntry?.predRul ?? 0;
  const sortedByAsc = [...unitRuls].sort((a, b) => a.predRul - b.predRul || a.engineId - b.engineId);
  const primaryRank =
    sortedByAsc.findIndex((u) => u.engineId === primaryEngineId) + 1 || 1;

  const dominantBin = bins.reduce(
    (best, cur) => (cur.count > best.count ? cur : best),
    bins[0],
  );

  return {
    subset,
    model,
    snapshotMode,
    targetCycle: Math.max(1, Math.round(targetCycle)),
    binWidth,
    totalEngines,
    alreadyFailedCount,
    bins,
    meanPredRul: Number(meanVal.toFixed(1)),
    stdDevPredRul: Number(Math.sqrt(variance).toFixed(1)),
    medianPredRul: Number(quantile(sortedRuls, 0.5).toFixed(1)),
    p10PredRul: Number(quantile(sortedRuls, 0.1).toFixed(1)),
    p25PredRul: Number(quantile(sortedRuls, 0.25).toFixed(1)),
    p75PredRul: Number(quantile(sortedRuls, 0.75).toFixed(1)),
    p90PredRul: Number(quantile(sortedRuls, 0.9).toFixed(1)),
    primaryEngineId,
    primaryEnginePredRul: primaryPred,
    primaryEngineRank: primaryRank,
    dominantBinLabel: `${dominantBin?.label ?? '0–15'}c`,
    dominantBinCount: dominantBin?.count ?? 0,
    unitRuls,
  };
}
