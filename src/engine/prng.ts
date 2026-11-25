export function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleNormal(rng: () => number, mean = 0, std = 1): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / values.length);
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const clampedQ = clamp(q, 0, 1);
  const pos = (sorted.length - 1) * clampedQ;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function conformalQuantile(residuals: number[], alpha: number): number {
  if (residuals.length === 0) return 0;
  const sorted = [...residuals].sort((a, b) => a - b);
  const n = sorted.length;
  const level = clamp(Math.ceil((n + 1) * (1 - alpha)) / n, 0, 1);
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(level * n) - 1));
  return sorted[idx];
}

export function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dxSq = 0;
  let dySq = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dxSq += dx * dx;
    dySq += dy * dy;
  }
  const denom = Math.sqrt(dxSq * dySq);
  if (denom < 1e-12) return 0;
  return clamp(num / denom, -1, 1);
}

export function bootstrapMeanCi(
  values: number[],
  rng: () => number,
  iterations = 400,
): { mean: number; lower: number; upper: number } {
  if (values.length === 0) {
    return { mean: 0, lower: 0, upper: 0 };
  }
  const observedMean = mean(values);
  if (values.length === 1) {
    return { mean: observedMean, lower: observedMean, upper: observedMean };
  }
  const bootMeans: number[] = [];
  const n = values.length;
  for (let b = 0; b < iterations; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      sum += values[idx];
    }
    bootMeans.push(sum / n);
  }
  return {
    mean: observedMean,
    lower: quantile(bootMeans, 0.025),
    upper: quantile(bootMeans, 0.975),
  };
}

/**
 * Deterministic staggered fleet lifecycle age so cross-fleet views
 * expose late-life critical (~18%), watch (~25%), and healthy (~57%) units.
 */
export function computeStaggeredObservedCycle(failureCycle: number, engineId: number, seed: number): number {
  const rng = createSeededRng(seed + engineId * 131 + 17);
  const bucket = rng();
  let frac: number;
  if (bucket < 0.18) {
    frac = 0.84 + rng() * 0.13;
  } else if (bucket < 0.43) {
    frac = 0.67 + rng() * 0.16;
  } else {
    frac = 0.30 + rng() * 0.36;
  }
  return Math.max(10, Math.min(failureCycle, Math.round(failureCycle * frac)));
}

/**
 * Solves (X^T X + lambda * I) w = X^T y via partial-pivoted Gaussian elimination.
 * Assumes column 0 may be bias (unpenalized if unpenalizeFirstCol is true).
 */
export function solveRidgeRegression(
  rows: number[][],
  targets: number[],
  lambda = 1.0,
  unpenalizeFirstCol = true,
): number[] {
  const n = rows.length;
  if (n === 0 || rows[0].length === 0) return [];
  const d = rows[0].length;

  const A = Array.from({ length: d }, () => new Float64Array(d));
  const b = new Float64Array(d);

  for (let i = 0; i < n; i++) {
    const x = rows[i];
    const y = targets[i];
    for (let j = 0; j < d; j++) {
      const xj = x[j];
      b[j] += xj * y;
      for (let k = j; k < d; k++) {
        A[j][k] += xj * x[k];
      }
    }
  }

  for (let j = 0; j < d; j++) {
    for (let k = 0; k < j; k++) {
      A[j][k] = A[k][j];
    }
    const pen = unpenalizeFirstCol && j === 0 ? 1e-6 : lambda;
    A[j][j] += pen;
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < d; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < d; r++) {
      const v = Math.abs(A[r][col]);
      if (v > maxVal) {
        maxVal = v;
        pivotRow = r;
      }
    }
    if (pivotRow !== col) {
      const tmpRow = A[col];
      A[col] = A[pivotRow];
      A[pivotRow] = tmpRow;
      const tmpB = b[col];
      b[col] = b[pivotRow];
      b[pivotRow] = tmpB;
    }

    const diag = Math.abs(A[col][col]) < 1e-12 ? 1e-12 : A[col][col];
    for (let r = col + 1; r < d; r++) {
      const factor = A[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c < d; c++) {
        A[r][c] -= factor * A[col][c];
      }
      b[r] -= factor * b[col];
    }
  }

  const w = new Array<number>(d).fill(0);
  for (let r = d - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < d; c++) {
      sum -= A[r][c] * w[c];
    }
    const diag = Math.abs(A[r][r]) < 1e-12 ? 1e-12 : A[r][r];
    w[r] = sum / diag;
  }
  return w;
}

