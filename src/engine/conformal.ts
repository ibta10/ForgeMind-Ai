import { predictWithEstimator, trainRulEstimator } from './models';
import { clamp, conformalQuantile, mean } from './prng';
import type {
  ConformalBinSummary,
  ConformalPoint,
  ConformalStudyResult,
  EngineTrajectory,
  ModelId,
  SubsetId,
} from './types';

const RUL_BINS: Array<{ label: string; min: number; max: number }> = [
  { label: '0–25 cyc', min: -Infinity, max: 25 },
  { label: '25–55 cyc', min: 25, max: 55 },
  { label: '55–90 cyc', min: 55, max: 90 },
  { label: '90+ cyc', min: 90, max: Infinity },
];

export interface CalibratedConformalModel {
  globalQHat: number;
  binQHats: number[];
  getHalfWidth: (predRul: number) => number;
}

export function calibrateConformalModel(
  fleet: EngineTrajectory[],
  model: ModelId,
  regimeAware: boolean,
  alpha: number,
  mode: 'global' | 'rul_binned',
  rulCap = 125,
  seed = 42,
): CalibratedConformalModel {
  const estimator = trainRulEstimator(fleet, model, regimeAware, rulCap, seed);
  const calSplit = fleet.filter((e) => e.split === 'calibration');
  const calibrationEngines = calSplit.length > 0 ? calSplit : fleet.slice(0, Math.min(8, fleet.length));

  const allResiduals: number[] = [];
  const binResiduals: number[][] = RUL_BINS.map(() => []);

  for (const eng of calibrationEngines) {
    const preds = predictWithEstimator(estimator, eng);
    for (let i = 0; i < eng.cycles.length; i++) {
      const yTrue = eng.cycles[i].cappedRul;
      const yPred = preds[i];
      const residual = Math.abs(yTrue - yPred);
      allResiduals.push(residual);
      const binIdx = RUL_BINS.findIndex((b) => yPred >= b.min && yPred < b.max);
      if (binIdx >= 0) {
        binResiduals[binIdx].push(residual);
      }
    }
  }

  const globalQHat = Number(conformalQuantile(allResiduals, alpha).toFixed(2));
  const binQHats = binResiduals.map((res) =>
    res.length >= 12 ? Number(conformalQuantile(res, alpha).toFixed(2)) : globalQHat,
  );

  return {
    globalQHat,
    binQHats,
    getHalfWidth: (predRul: number) => {
      if (mode === 'global') return globalQHat;
      const binIdx = RUL_BINS.findIndex((b) => predRul >= b.min && predRul < b.max);
      return binIdx >= 0 ? binQHats[binIdx] : globalQHat;
    },
  };
}

export function runConformalStudy(
  fleet: EngineTrajectory[],
  subset: SubsetId,
  model: ModelId,
  alpha: number,
  mode: 'global' | 'rul_binned',
  regimeAware: boolean,
  rulCap = 125,
  seed = 42,
): ConformalStudyResult {
  const estimator = trainRulEstimator(fleet, model, regimeAware, rulCap, seed);
  const evalEngines = fleet.filter((e) => e.split === 'evaluation');

  const calibrator = calibrateConformalModel(
    fleet,
    model,
    regimeAware,
    alpha,
    mode,
    rulCap,
    seed,
  );

  const testSet = evalEngines.length > 0 ? evalEngines : fleet.slice(-8);

  const binStats = RUL_BINS.map((b) => ({
    label: b.label,
    min: b.min,
    max: b.max,
    coveredCount: 0,
    totalCount: 0,
    widths: [] as number[],
    qHat: 0,
  }));

  let totalCovered = 0;
  let totalPoints = 0;
  const allWidths: number[] = [];

  let sampleTrajectory: ConformalPoint[] = [];

  testSet.forEach((eng, idx) => {
    const preds = predictWithEstimator(estimator, eng);
    const traj: ConformalPoint[] = [];

    for (let i = 0; i < eng.cycles.length; i++) {
      const trueRul = eng.cycles[i].cappedRul;
      const predRul = preds[i];
      const q = calibrator.getHalfWidth(predRul);
      const lower = Number(Math.max(0, predRul - q).toFixed(2));
      const upper = Number((predRul + q).toFixed(2));
      const covered = trueRul >= lower && trueRul <= upper;
      const width = Number((upper - lower).toFixed(2));

      totalPoints++;
      if (covered) totalCovered++;
      allWidths.push(width);

      const binIdx = RUL_BINS.findIndex((b) => predRul >= b.min && predRul < b.max);
      if (binIdx >= 0) {
        binStats[binIdx].totalCount++;
        if (covered) binStats[binIdx].coveredCount++;
        binStats[binIdx].widths.push(width);
        binStats[binIdx].qHat = mode === 'global' ? calibrator.globalQHat : calibrator.binQHats[binIdx];
      }

      if (idx === 0) {
        traj.push({
          cycle: eng.cycles[i].cycle,
          trueRul,
          predRul,
          lower,
          upper,
          covered,
          width,
        });
      }
    }

    if (idx === 0) {
      sampleTrajectory = traj;
    }
  });

  const bins: ConformalBinSummary[] = binStats.map((b, i) => ({
    binLabel: b.label,
    minPred: Number.isFinite(b.min) ? b.min : 0,
    maxPred: Number.isFinite(b.max) ? b.max : rulCap,
    qHat: mode === 'global' ? calibrator.globalQHat : calibrator.binQHats[i],
    empiricalCoverage:
      b.totalCount > 0 ? Number(((b.coveredCount / b.totalCount) * 100).toFixed(1)) : 0,
    meanWidth: b.widths.length > 0 ? Number(mean(b.widths).toFixed(2)) : 0,
    sampleCount: b.totalCount,
  }));

  return {
    subset,
    model,
    alpha,
    nominalCoverage: Number(((1 - alpha) * 100).toFixed(1)),
    mode,
    regimeAware,
    globalQHat: calibrator.globalQHat,
    empiricalCoverage:
      totalPoints > 0 ? Number(clamp((totalCovered / totalPoints) * 100, 0, 100).toFixed(1)) : 0,
    meanWidth: allWidths.length > 0 ? Number(mean(allWidths).toFixed(2)) : 0,
    bins,
    sampleTrajectory,
  };
}
