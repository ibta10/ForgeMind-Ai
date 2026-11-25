import { analyzeFeatures } from './cmapss';
import { clamp, createSeededRng, solveRidgeRegression } from './prng';
import type {
  CycleTelemetry,
  EngineTrajectory,
  ModelBenchmarkRow,
  ModelId,
  RegressionMetrics,
  SubsetId,
} from './types';

export const MODEL_LABELS: Record<ModelId, string> = {
  linear_regression: 'Ridge Linear (Surrogate)',
  random_forest: 'Random Forest (Surrogate)',
  gradient_boosting: 'Histogram GBDT (Surrogate)',
  lstm: 'Causal Sequence ELM (w=30 Surrogate)',
};

export const MODEL_ORDER: ModelId[] = [
  'linear_regression',
  'random_forest',
  'gradient_boosting',
  'lstm',
];

export function computePhm08Score(yTrue: number[], yPred: number[]): number {
  let total = 0;
  const n = Math.min(yTrue.length, yPred.length);
  for (let i = 0; i < n; i++) {
    const d = yPred[i] - yTrue[i];
    if (d < 0) {
      total += Math.exp(-d / 13) - 1;
    } else {
      total += Math.exp(d / 10) - 1;
    }
  }
  return Number(total.toFixed(2));
}

export function computeRegressionMetrics(
  yTrue: number[],
  yPred: number[],
  rulCap = 125,
): RegressionMetrics {
  const n = Math.min(yTrue.length, yPred.length);
  if (n === 0) {
    return {
      mae: 0,
      rmse: 0,
      mse: 0,
      mape: 0,
      phm08: 0,
      cappedMae: 0,
      cappedRmse: 0,
      cappedPhm08: 0,
    };
  }

  let absErrSum = 0;
  let sqErrSum = 0;
  let pctErrSum = 0;
  let cappedAbsErrSum = 0;
  let cappedSqErrSum = 0;

  const yTrueCapped = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const yt = yTrue[i];
    const yp = yPred[i];
    const err = yp - yt;
    absErrSum += Math.abs(err);
    sqErrSum += err * err;
    pctErrSum += Math.abs(err) / Math.max(10, yt);

    const ytCap = Math.min(yt, rulCap);
    yTrueCapped[i] = ytCap;
    const capErr = yp - ytCap;
    cappedAbsErrSum += Math.abs(capErr);
    cappedSqErrSum += capErr * capErr;
  }

  const mse = sqErrSum / n;
  const cappedMse = cappedSqErrSum / n;

  return {
    mae: Number((absErrSum / n).toFixed(2)),
    rmse: Number(Math.sqrt(mse).toFixed(2)),
    mse: Number(mse.toFixed(2)),
    mape: Number(((pctErrSum / n) * 100).toFixed(2)),
    phm08: computePhm08Score(yTrue, yPred),
    cappedMae: Number((cappedAbsErrSum / n).toFixed(2)),
    cappedRmse: Number(Math.sqrt(cappedMse).toFixed(2)),
    cappedPhm08: computePhm08Score(yTrueCapped, yPred),
  };
}

interface TreeNode {
  isLeaf: boolean;
  value: number;
  featureIdx?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

function predictTree(node: TreeNode, x: number[]): number {
  let cur = node;
  while (!cur.isLeaf) {
    const val = x[cur.featureIdx!];
    cur = val <= cur.threshold! ? cur.left! : cur.right!;
  }
  return cur.value;
}

interface TrainedRulEstimator {
  model: ModelId;
  regimeAware: boolean;
  rulCap: number;
  activeSensorIds: string[];
  topSensorIds: string[];
  trainTimeSec: number;
  // Ridge linear regression
  ridgeWeights?: number[];
  // Random forest / GBDT
  baseScore?: number;
  learningRate?: number;
  trees?: TreeNode[];
  // Sequence ELM (Causal Sequence Net w=30)
  seqProjWeights?: number[][];
  seqReadoutWeights?: number[];
}

const MODEL_CACHE = new WeakMap<EngineTrajectory[], Map<string, TrainedRulEstimator>>();

function selectActiveSensors(fitEngines: EngineTrajectory[], regimeAware: boolean): {
  activeSensorIds: string[];
  topSensorIds: string[];
} {
  const diag = analyzeFeatures(fitEngines, regimeAware)
    .filter((d) => !d.isConstant)
    .sort((a, b) => b.importanceScore - a.importanceScore);

  const active = diag.map((d) => d.sensorId);
  const fallback = ['s2', 's3', 's4', 's7', 's8', 's9', 's11', 's12', 's13', 's14', 's15', 's17', 's20', 's21'];
  const activeSensorIds = active.length >= 4 ? active : fallback;
  const topSensorIds = activeSensorIds.slice(0, 6);
  return { activeSensorIds, topSensorIds };
}

/**
 * Extracts strictly causal sensor features at cycle `c` (never inspects `trueRul` or `cappedRul`).
 */
function buildLinearFeaturesForCycle(
  c: CycleTelemetry,
  activeSensorIds: string[],
  regimeAware: boolean,
): number[] {
  const norm = regimeAware ? c.normalizedRegime : c.normalizedGlobal;
  const feats: number[] = [1]; // bias
  for (let i = 0; i < activeSensorIds.length; i++) {
    const sid = activeSensorIds[i];
    feats.push(norm[sid] ?? 0);
  }
  return feats;
}

function buildRichFeaturesForEngine(
  engine: EngineTrajectory,
  activeSensorIds: string[],
  topSensorIds: string[],
  regimeAware: boolean,
): number[][] {
  const cycles = engine.cycles;
  const out: number[][] = new Array(cycles.length);

  for (let i = 0; i < cycles.length; i++) {
    const c = cycles[i];
    const rm = regimeAware ? c.rollingMean : c.rollingMeanGlobal;
    const rs = regimeAware ? c.rollingStd : c.rollingStdGlobal;
    const norm = regimeAware ? c.normalizedRegime : c.normalizedGlobal;
    const lag5 = cycles[Math.max(0, i - 5)];
    const lag10 = cycles[Math.max(0, i - 10)];
    const rmLag5 = regimeAware ? lag5.rollingMean : lag5.rollingMeanGlobal;
    const rmLag10 = regimeAware ? lag10.rollingMean : lag10.rollingMeanGlobal;
    const warmupWeight = Math.min(1, i / 5);

    const row: number[] = [];
    for (let s = 0; s < activeSensorIds.length; s++) {
      const sid = activeSensorIds[s];
      row.push(rm[sid] ?? norm[sid] ?? 0);
    }
    for (let s = 0; s < topSensorIds.length; s++) {
      const sid = topSensorIds[s];
      row.push(((rm[sid] ?? 0) - (rmLag5[sid] ?? 0)) * warmupWeight);
      row.push(((rm[sid] ?? 0) - (rmLag10[sid] ?? 0)) * warmupWeight);
      row.push((rs[sid] ?? 0) * warmupWeight);
    }
    out[i] = row;
  }
  return out;
}

function buildSequenceFeaturesForEngine(
  engine: EngineTrajectory,
  activeSensorIds: string[],
  topSensorIds: string[],
  regimeAware: boolean,
): number[][] {
  const cycles = engine.cycles;
  const out: number[][] = new Array(cycles.length);
  const emaAlpha = 2 / 31; // 30-cycle causal exponential memory
  const ema: Record<string, number> = {};
  if (cycles.length > 0) {
    const firstNorm = regimeAware ? cycles[0].normalizedRegime : cycles[0].normalizedGlobal;
    for (const sid of activeSensorIds) {
      ema[sid] = firstNorm[sid] ?? 0;
    }
  }

  for (let i = 0; i < cycles.length; i++) {
    const c = cycles[i];
    const norm = regimeAware ? c.normalizedRegime : c.normalizedGlobal;
    const rm = regimeAware ? c.rollingMean : c.rollingMeanGlobal;
    const rs = regimeAware ? c.rollingStd : c.rollingStdGlobal;

    const lag8 = cycles[Math.max(0, i - 8)];
    const lag20 = cycles[Math.max(0, i - 20)];
    const lag30 = cycles[Math.max(0, i - 29)];
    const rmLag8 = regimeAware ? lag8.rollingMean : lag8.rollingMeanGlobal;
    const rmLag20 = regimeAware ? lag20.rollingMean : lag20.rollingMeanGlobal;
    const rmLag30 = regimeAware ? lag30.rollingMean : lag30.rollingMeanGlobal;

    const row: number[] = [];
    for (let s = 0; s < activeSensorIds.length; s++) {
      const sid = activeSensorIds[s];
      const curVal = norm[sid] ?? 0;
      ema[sid] = emaAlpha * curVal + (1 - emaAlpha) * (ema[sid] ?? curVal);
      row.push(ema[sid]);
      row.push(rm[sid] ?? curVal);
    }
    for (let s = 0; s < topSensorIds.length; s++) {
      const sid = topSensorIds[s];
      const curRm = rm[sid] ?? 0;
      row.push(curRm - (rmLag8[sid] ?? 0));
      row.push(curRm - (rmLag20[sid] ?? 0));
      row.push(curRm - (rmLag30[sid] ?? 0));
      row.push(rs[sid] ?? 0);
    }
    out[i] = row;
  }
  return out;
}

function buildRegressionTree(
  X: number[][],
  y: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minSamplesLeaf: number,
  featurePool: number[] | null,
  quantileCandidates: number[][],
  rng: () => number,
  l2Leaf = 0,
): TreeNode {
  const n = indices.length;
  let sumY = 0;
  for (let i = 0; i < n; i++) sumY += y[indices[i]];
  const leafVal = n > 0 ? sumY / (n + l2Leaf) : 0;

  if (depth >= maxDepth || n < minSamplesLeaf * 2) {
    return { isLeaf: true, value: leafVal };
  }

  const numFeatures = X[0].length;
  let candidateFeatures: number[];
  if (featurePool) {
    candidateFeatures = featurePool;
  } else if (n > 0) {
    candidateFeatures = Array.from({ length: numFeatures }, (_, f) => f);
  } else {
    return { isLeaf: true, value: leafVal };
  }

  const activeFeats =
    candidateFeatures.length === numFeatures && l2Leaf === 0
      ? (() => {
          const mtry = Math.max(4, Math.ceil(Math.sqrt(numFeatures) * 1.5));
          const chosen: number[] = [];
          const used = new Set<number>();
          while (chosen.length < Math.min(mtry, numFeatures)) {
            const f = Math.floor(rng() * numFeatures);
            if (!used.has(f)) {
              used.add(f);
              chosen.push(f);
            }
          }
          return chosen;
        })()
      : candidateFeatures;

  let bestScore = -Infinity;
  let bestFeature = -1;
  let bestThreshold = 0;
  const totalSumSq = (sumY * sumY) / (n + l2Leaf);

  for (let fi = 0; fi < activeFeats.length; fi++) {
    const f = activeFeats[fi];
    const thresholds = quantileCandidates[f];
    for (let ti = 0; ti < thresholds.length; ti++) {
      const thr = thresholds[ti];
      let leftCount = 0;
      let leftSum = 0;
      for (let i = 0; i < n; i++) {
        const idx = indices[i];
        if (X[idx][f] <= thr) {
          leftCount++;
          leftSum += y[idx];
        }
      }
      const rightCount = n - leftCount;
      if (leftCount < minSamplesLeaf || rightCount < minSamplesLeaf) continue;

      const rightSum = sumY - leftSum;
      const gain =
        (leftSum * leftSum) / (leftCount + l2Leaf) +
        (rightSum * rightSum) / (rightCount + l2Leaf) -
        totalSumSq;

      if (gain > bestScore) {
        bestScore = gain;
        bestFeature = f;
        bestThreshold = thr;
      }
    }
  }

  if (bestFeature < 0 || bestScore <= 1e-6) {
    return { isLeaf: true, value: leafVal };
  }

  const leftIndices: number[] = [];
  const rightIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = indices[i];
    if (X[idx][bestFeature] <= bestThreshold) leftIndices.push(idx);
    else rightIndices.push(idx);
  }

  return {
    isLeaf: false,
    value: leafVal,
    featureIdx: bestFeature,
    threshold: bestThreshold,
    left: buildRegressionTree(
      X,
      y,
      leftIndices,
      depth + 1,
      maxDepth,
      minSamplesLeaf,
      featurePool,
      quantileCandidates,
      rng,
      l2Leaf,
    ),
    right: buildRegressionTree(
      X,
      y,
      rightIndices,
      depth + 1,
      maxDepth,
      minSamplesLeaf,
      featurePool,
      quantileCandidates,
      rng,
      l2Leaf,
    ),
  };
}

function computeFeatureQuantiles(X: number[][], bins = 14): number[][] {
  if (X.length === 0) return [];
  const numFeatures = X[0].length;
  const res: number[][] = new Array(numFeatures);
  const col = new Float64Array(X.length);

  for (let f = 0; f < numFeatures; f++) {
    for (let i = 0; i < X.length; i++) col[i] = X[i][f];
    col.sort();
    const thresholds: number[] = [];
    let lastVal = -Infinity;
    for (let b = 1; b < bins; b++) {
      const qIdx = Math.min(col.length - 1, Math.floor((b / bins) * col.length));
      const v = col[qIdx];
      if (v > lastVal + 1e-6) {
        thresholds.push(v);
        lastVal = v;
      }
    }
    res[f] = thresholds;
  }
  return res;
}

/**
 * Trains an RUL estimator strictly on `fit`-split engines (zero leakage).
 */
export function trainRulEstimator(
  fleet: EngineTrajectory[],
  model: ModelId,
  regimeAware: boolean,
  rulCap = 125,
  seed = 42,
): TrainedRulEstimator {
  let fleetCache = MODEL_CACHE.get(fleet);
  if (!fleetCache) {
    fleetCache = new Map();
    MODEL_CACHE.set(fleet, fleetCache);
  }
  const cacheKey = `${model}:${regimeAware ? 1 : 0}:${rulCap}:${seed}`;
  const cached = fleetCache.get(cacheKey);
  if (cached) return cached;

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const fitSplit = fleet.filter((e) => e.split === 'fit');
  const fitEngines = fitSplit.length > 0 ? fitSplit : fleet.slice(0, Math.max(1, Math.floor(fleet.length * 0.45)));

  const { activeSensorIds, topSensorIds } = selectActiveSensors(fitEngines, regimeAware);
  const rng = createSeededRng(seed + model.length * 97 + (regimeAware ? 13 : 29));

  let estimator: TrainedRulEstimator;

  if (model === 'linear_regression') {
    const X: number[][] = [];
    const y: number[] = [];
    for (const eng of fitEngines) {
      for (let i = 0; i < eng.cycles.length; i += 2) {
        const c = eng.cycles[i];
        X.push(buildLinearFeaturesForCycle(c, activeSensorIds, regimeAware));
        y.push(Math.min(c.trueRul, rulCap));
      }
    }
    const ridgeWeights = solveRidgeRegression(X, y, 0.001, true);
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    estimator = {
      model,
      regimeAware,
      rulCap,
      activeSensorIds,
      topSensorIds,
      ridgeWeights,
      trainTimeSec: Number(Math.max(0.001, (t1 - t0) / 1000).toFixed(3)),
    };
  } else if (model === 'random_forest') {
    const X: number[][] = [];
    const y: number[] = [];
    for (const eng of fitEngines) {
      const feats = buildRichFeaturesForEngine(eng, activeSensorIds, topSensorIds, regimeAware);
      for (let i = 0; i < eng.cycles.length; i += 2) {
        X.push(feats[i]);
        y.push(Math.min(eng.cycles[i].trueRul, rulCap));
      }
    }
    const quantiles = computeFeatureQuantiles(X, 11);
    const nRows = X.length;
    const trees: TreeNode[] = [];
    const numTrees = 14;
    const sampleSize = Math.max(24, Math.floor(nRows * 0.72));

    for (let t = 0; t < numTrees; t++) {
      const bootIdx = new Array<number>(sampleSize);
      for (let i = 0; i < sampleSize; i++) {
        bootIdx[i] = Math.floor(rng() * nRows);
      }
      trees.push(buildRegressionTree(X, y, bootIdx, 0, 5, 8, null, quantiles, rng, 0));
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    estimator = {
      model,
      regimeAware,
      rulCap,
      activeSensorIds,
      topSensorIds,
      trees,
      trainTimeSec: Number(Math.max(0.001, (t1 - t0) / 1000).toFixed(3)),
    };
  } else if (model === 'gradient_boosting') {
    const X: number[][] = [];
    const y: number[] = [];
    for (const eng of fitEngines) {
      const feats = buildRichFeaturesForEngine(eng, activeSensorIds, topSensorIds, regimeAware);
      for (let i = 0; i < eng.cycles.length; i += 2) {
        X.push(feats[i]);
        y.push(Math.min(eng.cycles[i].trueRul, rulCap));
      }
    }
    const quantiles = computeFeatureQuantiles(X, 12);
    const nRows = X.length;
    const baseScore = nRows > 0 ? y.reduce((s, v) => s + v, 0) / nRows : rulCap * 0.5;
    const preds = new Float64Array(nRows).fill(baseScore);
    const residuals = new Array<number>(nRows);
    const allIndices = Array.from({ length: nRows }, (_, i) => i);
    const allFeatures = Array.from({ length: X[0]?.length ?? 1 }, (_, f) => f);

    const trees: TreeNode[] = [];
    const numTrees = 28;
    const learningRate = 0.18;

    for (let t = 0; t < numTrees; t++) {
      for (let i = 0; i < nRows; i++) {
        residuals[i] = y[i] - preds[i];
      }
      const tree = buildRegressionTree(
        X,
        residuals,
        allIndices,
        0,
        4,
        10,
        allFeatures,
        quantiles,
        rng,
        1.5,
      );
      trees.push(tree);
      for (let i = 0; i < nRows; i++) {
        preds[i] += learningRate * predictTree(tree, X[i]);
      }
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    estimator = {
      model,
      regimeAware,
      rulCap,
      activeSensorIds,
      topSensorIds,
      baseScore,
      learningRate,
      trees,
      trainTimeSec: Number(Math.max(0.001, (t1 - t0) / 1000).toFixed(3)),
    };
  } else {
    // Causal Sequence Net (w=30): 30-cycle lag/EWMA temporal encoder + tanh random-projection MLP readout
    const Xseq: number[][] = [];
    const y: number[] = [];
    for (const eng of fitEngines) {
      const feats = buildSequenceFeaturesForEngine(eng, activeSensorIds, topSensorIds, regimeAware);
      for (let i = 0; i < eng.cycles.length; i += 2) {
        Xseq.push(feats[i]);
        y.push(Math.min(eng.cycles[i].trueRul, rulCap));
      }
    }

    const inDim = Xseq[0]?.length ?? 1;
    const hiddenUnits = 32;
    const seqProjWeights: number[][] = Array.from({ length: hiddenUnits }, () => {
      const row = new Array<number>(inDim + 1);
      for (let j = 0; j < inDim; j++) {
        row[j] = (rng() * 2 - 1) * (1.35 / Math.sqrt(inDim));
      }
      row[inDim] = (rng() * 2 - 1) * 0.4; // bias
      return row;
    });

    const Z = Xseq.map((x) => {
      const z = new Array<number>(1 + inDim + hiddenUnits);
      z[0] = 1;
      for (let j = 0; j < inDim; j++) z[1 + j] = x[j];
      for (let h = 0; h < hiddenUnits; h++) {
        const w = seqProjWeights[h];
        let dot = w[inDim];
        for (let j = 0; j < inDim; j++) dot += w[j] * x[j];
        z[1 + inDim + h] = Math.tanh(dot);
      }
      return z;
    });

    const seqReadoutWeights = solveRidgeRegression(Z, y, 2.5, true);
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    estimator = {
      model,
      regimeAware,
      rulCap,
      activeSensorIds,
      topSensorIds,
      seqProjWeights,
      seqReadoutWeights,
      trainTimeSec: Number(Math.max(0.001, (t1 - t0) / 1000).toFixed(3)),
    };
  }

  fleetCache.set(cacheKey, estimator);
  return estimator;
}

/**
 * Predicts per-cycle RUL on a single engine trajectory using the estimator
 * trained exclusively on `fit`-split engines. Never reads `trueRul` on the target engine.
 */
export function predictWithEstimator(
  estimator: TrainedRulEstimator,
  engine: EngineTrajectory,
): number[] {
  const { model, regimeAware, rulCap, activeSensorIds, topSensorIds } = estimator;

  if (model === 'linear_regression') {
    const w = estimator.ridgeWeights ?? [];
    return engine.cycles.map((c) => {
      const x = buildLinearFeaturesForCycle(c, activeSensorIds, regimeAware);
      let pred = 0;
      for (let j = 0; j < Math.min(w.length, x.length); j++) pred += w[j] * x[j];
      return Number(clamp(pred, 0, rulCap + 15).toFixed(2));
    });
  }

  if (model === 'random_forest') {
    const trees = estimator.trees ?? [];
    const feats = buildRichFeaturesForEngine(engine, activeSensorIds, topSensorIds, regimeAware);
    return feats.map((x) => {
      let sum = 0;
      for (let t = 0; t < trees.length; t++) sum += predictTree(trees[t], x);
      const avg = trees.length > 0 ? sum / trees.length : rulCap * 0.5;
      return Number(clamp(avg, 0, rulCap + 15).toFixed(2));
    });
  }

  if (model === 'gradient_boosting') {
    const trees = estimator.trees ?? [];
    const baseScore = estimator.baseScore ?? rulCap * 0.5;
    const lr = estimator.learningRate ?? 0.16;
    const feats = buildRichFeaturesForEngine(engine, activeSensorIds, topSensorIds, regimeAware);
    return feats.map((x) => {
      let pred = baseScore;
      for (let t = 0; t < trees.length; t++) pred += lr * predictTree(trees[t], x);
      return Number(clamp(pred, 0, rulCap + 15).toFixed(2));
    });
  }

  // Causal Sequence Net (w=30) with causal output smoothing
  const proj = estimator.seqProjWeights ?? [];
  const readout = estimator.seqReadoutWeights ?? [];
  const feats = buildSequenceFeaturesForEngine(engine, activeSensorIds, topSensorIds, regimeAware);
  let prevPred = rulCap;
  return feats.map((x, idx) => {
    const inDim = x.length;
    let pred = readout[0] ?? 0;
    for (let j = 0; j < inDim; j++) {
      pred += (readout[1 + j] ?? 0) * x[j];
    }
    for (let h = 0; h < proj.length; h++) {
      const w = proj[h];
      let dot = w[inDim];
      for (let j = 0; j < inDim; j++) dot += w[j] * x[j];
      pred += (readout[1 + inDim + h] ?? 0) * Math.tanh(dot);
    }
    const smoothed = idx > 0 ? 0.72 * pred + 0.28 * prevPred : pred;
    const clamped = Number(clamp(smoothed, 0, rulCap + 15).toFixed(2));
    prevPred = clamped;
    return clamped;
  });
}

export function predictEngineRulSeries(
  fleet: EngineTrajectory[],
  engine: EngineTrajectory,
  model: ModelId,
  regimeAware: boolean,
  rulCap = 125,
  seed = 42,
): number[] {
  const estimator = trainRulEstimator(fleet, model, regimeAware, rulCap, seed);
  return predictWithEstimator(estimator, engine);
}

export function runModelBenchmark(
  fleet: EngineTrajectory[],
  subset: SubsetId,
  regimeAware: boolean,
  rulCap = 125,
  seed = 42,
): ModelBenchmarkRow[] {
  const evalEngines = fleet.filter((e) => e.split === 'evaluation' || e.split === 'tuning');
  const targetEngines = evalEngines.length > 0 ? evalEngines : fleet;

  return MODEL_ORDER.map((model) => {
    const estimator = trainRulEstimator(fleet, model, regimeAware, rulCap, seed);
    const yTrue: number[] = [];
    const yPred: number[] = [];
    for (const eng of targetEngines) {
      const preds = predictWithEstimator(estimator, eng);
      for (let i = 0; i < eng.cycles.length; i += 4) {
        yTrue.push(eng.cycles[i].trueRul);
        yPred.push(preds[i]);
      }
      const last = eng.cycles.length - 1;
      yTrue.push(eng.cycles[last].trueRul);
      yPred.push(preds[last]);
    }

    return {
      subset,
      model,
      modelLabel: MODEL_LABELS[model],
      preprocessing: regimeAware ? 'regime_aware' : 'global',
      metrics: computeRegressionMetrics(yTrue, yPred, rulCap),
      trainTimeSec: estimator.trainTimeSec,
    };
  });
}
