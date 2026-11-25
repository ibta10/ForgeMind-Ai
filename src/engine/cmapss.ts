import { clamp, createSeededRng, mean, pearsonCorrelation, sampleNormal, stdDev } from './prng';
import type {
  CycleTelemetry,
  EngineTrajectory,
  FeatureDiagnostic,
  SensorMeta,
  SubsetId,
  SubsetSpec,
} from './types';

export const SUBSET_SPECS: Record<SubsetId, SubsetSpec> = {
  FD001: {
    id: 'FD001',
    name: 'FD001 · Single Regime, HPC Degradation',
    trainEngines: 100,
    testEngines: 100,
    conditions: 1,
    faultModes: 1,
    faultDescription: 'High-Pressure Compressor (HPC) degradation',
    operatingProfile: 'Sea-level static (1 operating condition)',
    minLife: 128,
    medianLife: 199,
    maxLife: 362,
  },
  FD002: {
    id: 'FD002',
    name: 'FD002 · Six Regimes, HPC Degradation',
    trainEngines: 260,
    testEngines: 259,
    conditions: 6,
    faultModes: 1,
    faultDescription: 'High-Pressure Compressor (HPC) degradation',
    operatingProfile: '6 altitude / Mach / throttle regimes',
    minLife: 128,
    medianLife: 199,
    maxLife: 378,
  },
  FD003: {
    id: 'FD003',
    name: 'FD003 · Single Regime, Dual Fault Modes',
    trainEngines: 100,
    testEngines: 100,
    conditions: 1,
    faultModes: 2,
    faultDescription: 'HPC degradation + Fan degradation',
    operatingProfile: 'Sea-level static (1 operating condition)',
    minLife: 145,
    medianLife: 221,
    maxLife: 525,
  },
  FD004: {
    id: 'FD004',
    name: 'FD004 · Six Regimes, Dual Fault Modes',
    trainEngines: 249,
    testEngines: 248,
    conditions: 6,
    faultModes: 2,
    faultDescription: 'HPC degradation + Fan degradation',
    operatingProfile: '6 altitude / Mach / throttle regimes',
    minLife: 128,
    medianLife: 234,
    maxLife: 543,
  },
};

export const SENSORS: SensorMeta[] = [
  { id: 's1', index: 1, symbol: 'T2', description: 'Total temperature at fan inlet', unit: '°R', trendDirection: 'flat' },
  { id: 's2', index: 2, symbol: 'T24', description: 'Total temperature at LPC outlet', unit: '°R', trendDirection: 'up' },
  { id: 's3', index: 3, symbol: 'T30', description: 'Total temperature at HPC outlet', unit: '°R', trendDirection: 'up' },
  { id: 's4', index: 4, symbol: 'T50', description: 'Total temperature at LPT outlet', unit: '°R', trendDirection: 'up' },
  { id: 's5', index: 5, symbol: 'P2', description: 'Pressure at fan inlet', unit: 'psia', trendDirection: 'flat' },
  { id: 's6', index: 6, symbol: 'P15', description: 'Total pressure in bypass-duct', unit: 'psia', trendDirection: 'flat' },
  { id: 's7', index: 7, symbol: 'P30', description: 'Total pressure at HPC outlet', unit: 'psia', trendDirection: 'down' },
  { id: 's8', index: 8, symbol: 'Nf', description: 'Physical fan speed', unit: 'rpm', trendDirection: 'up' },
  { id: 's9', index: 9, symbol: 'Nc', description: 'Physical core speed', unit: 'rpm', trendDirection: 'up' },
  { id: 's10', index: 10, symbol: 'epr', description: 'Engine pressure ratio (P50/P2)', unit: 'ratio', trendDirection: 'flat' },
  { id: 's11', index: 11, symbol: 'Ps30', description: 'Static pressure at HPC outlet', unit: 'psia', trendDirection: 'up' },
  { id: 's12', index: 12, symbol: 'phi', description: 'Ratio of fuel flow to Ps30', unit: 'pps/psi', trendDirection: 'down' },
  { id: 's13', index: 13, symbol: 'NRf', description: 'Corrected fan speed', unit: 'rpm', trendDirection: 'up' },
  { id: 's14', index: 14, symbol: 'NRc', description: 'Corrected core speed', unit: 'rpm', trendDirection: 'up' },
  { id: 's15', index: 15, symbol: 'BPR', description: 'Bypass Ratio', unit: 'ratio', trendDirection: 'up' },
  { id: 's16', index: 16, symbol: 'farB', description: 'Burner fuel-air ratio', unit: 'ratio', trendDirection: 'flat' },
  { id: 's17', index: 17, symbol: 'htBleed', description: 'Bleed Enthalpy', unit: 'btu/lb', trendDirection: 'up' },
  { id: 's18', index: 18, symbol: 'Nf_dmd', description: 'Demanded fan speed', unit: 'rpm', trendDirection: 'flat' },
  { id: 's19', index: 19, symbol: 'PCNfR_dmd', description: 'Demanded corrected fan speed', unit: 'pct', trendDirection: 'flat' },
  { id: 's20', index: 20, symbol: 'W31', description: 'HPT coolant bleed', unit: 'lbm/s', trendDirection: 'down' },
  { id: 's21', index: 21, symbol: 'W32', description: 'LPT coolant bleed', unit: 'lbm/s', trendDirection: 'down' },
];

export const REGIME_CENTERS: Array<{ os1: number; os2: number; os3: number; label: string }> = [
  { os1: 0.0, os2: 0.0002, os3: 100.0, label: 'Sea Level / Full' },
  { os1: 10.0, os2: 0.2504, os3: 100.0, label: '10k ft / Low Mach' },
  { os1: 20.0, os2: 0.7005, os3: 100.0, label: '20k ft / Cruise' },
  { os1: 25.0, os2: 0.6208, os3: 60.0, label: '25k ft / Idle' },
  { os1: 35.0, os2: 0.8403, os3: 100.0, label: '35k ft / High Cruise' },
  { os1: 42.0, os2: 0.8409, os3: 100.0, label: '42k ft / Ceiling' },
];

// Sensor baseline + regime offset + degradation sensitivity
const SENSOR_COEFFS: Record<
  string,
  { base: number; os1Coef: number; os2Coef: number; os3Coef: number; degScale: number; noise: number }
> = {
  s1: { base: 518.67, os1Coef: -1.45, os2Coef: 21.0, os3Coef: 0.0, degScale: 0.0, noise: 0.02 },
  s2: { base: 642.15, os1Coef: -1.62, os2Coef: 25.5, os3Coef: 0.35, degScale: 1.95, noise: 0.24 },
  s3: { base: 1589.5, os1Coef: -3.25, os2Coef: 46.0, os3Coef: 1.25, degScale: 16.5, noise: 2.1 },
  s4: { base: 1400.6, os1Coef: -3.65, os2Coef: 51.0, os3Coef: 1.65, degScale: 21.0, noise: 2.4 },
  s5: { base: 14.62, os1Coef: -0.22, os2Coef: 2.8, os3Coef: 0.0, degScale: 0.0, noise: 0.005 },
  s6: { base: 21.61, os1Coef: -0.31, os2Coef: 4.1, os3Coef: 0.0, degScale: 0.02, noise: 0.015 },
  s7: { base: 553.75, os1Coef: -7.1, os2Coef: 95.0, os3Coef: 1.85, degScale: -4.2, noise: 0.45 },
  s8: { base: 2388.05, os1Coef: -1.8, os2Coef: 18.0, os3Coef: 3.1, degScale: 0.58, noise: 0.06 },
  s9: { base: 9055.2, os1Coef: -14.5, os2Coef: 142.0, os3Coef: 8.5, degScale: 42.0, noise: 5.5 },
  s10: { base: 1.3, os1Coef: -0.005, os2Coef: 0.08, os3Coef: 0.002, degScale: 0.0, noise: 0.001 },
  s11: { base: 47.45, os1Coef: -0.18, os2Coef: 1.9, os3Coef: 0.06, degScale: 1.15, noise: 0.09 },
  s12: { base: 521.75, os1Coef: -6.8, os2Coef: 92.0, os3Coef: 1.75, degScale: -3.85, noise: 0.41 },
  s13: { base: 2388.08, os1Coef: -0.6, os2Coef: 6.5, os3Coef: 1.2, degScale: 0.54, noise: 0.055 },
  s14: { base: 8138.6, os1Coef: -9.2, os2Coef: 88.0, os3Coef: 4.1, degScale: 34.0, noise: 4.2 },
  s15: { base: 8.425, os1Coef: 0.045, os2Coef: -0.55, os3Coef: -0.012, degScale: 0.145, noise: 0.014 },
  s16: { base: 0.03, os1Coef: 0.0, os2Coef: 0.0, os3Coef: 0.0, degScale: 0.0, noise: 0.0001 },
  s17: { base: 392.4, os1Coef: -0.95, os2Coef: 13.0, os3Coef: 0.42, degScale: 5.2, noise: 0.65 },
  s18: { base: 2388.0, os1Coef: 0.0, os2Coef: 0.0, os3Coef: -12.0, degScale: 0.0, noise: 0.01 },
  s19: { base: 100.0, os1Coef: 0.0, os2Coef: 0.0, os3Coef: 0.0, degScale: 0.0, noise: 0.005 },
  s20: { base: 38.92, os1Coef: -0.52, os2Coef: 6.8, os3Coef: 0.14, degScale: -0.68, noise: 0.075 },
  s21: { base: 23.35, os1Coef: -0.31, os2Coef: 4.05, os3Coef: 0.085, degScale: -0.41, noise: 0.045 },
};

export interface FittedRegimeModel {
  k: number;
  os1Min: number;
  os1Max: number;
  os2Min: number;
  os2Max: number;
  os3Min: number;
  os3Max: number;
  centroids: number[][];
}

function normalizeConditionPoint(
  r: { os1: number; os2: number; os3: number },
  bounds: Pick<FittedRegimeModel, 'os1Min' | 'os1Max' | 'os2Min' | 'os2Max' | 'os3Min' | 'os3Max'>,
): number[] {
  return [
    (r.os1 - bounds.os1Min) / Math.max(1e-6, bounds.os1Max - bounds.os1Min),
    (r.os2 - bounds.os2Min) / Math.max(1e-6, bounds.os2Max - bounds.os2Min),
    (r.os3 - bounds.os3Min) / Math.max(1e-6, bounds.os3Max - bounds.os3Min),
  ];
}

export function fitRegimeCentroids(
  fitRows: Array<{ os1: number; os2: number; os3: number }>,
  k: number,
): FittedRegimeModel {
  if (k <= 1 || fitRows.length === 0) {
    return {
      k: 1,
      os1Min: 0,
      os1Max: 1,
      os2Min: 0,
      os2Max: 1,
      os3Min: 0,
      os3Max: 100,
      centroids: [[0, 0, 1]],
    };
  }

  let os1Min = Infinity;
  let os1Max = -Infinity;
  let os2Min = Infinity;
  let os2Max = -Infinity;
  let os3Min = Infinity;
  let os3Max = -Infinity;

  for (const r of fitRows) {
    if (r.os1 < os1Min) os1Min = r.os1;
    if (r.os1 > os1Max) os1Max = r.os1;
    if (r.os2 < os2Min) os2Min = r.os2;
    if (r.os2 > os2Max) os2Max = r.os2;
    if (r.os3 < os3Min) os3Min = r.os3;
    if (r.os3 > os3Max) os3Max = r.os3;
  }

  const bounds = { os1Min, os1Max, os2Min, os2Max, os3Min, os3Max };
  const points = fitRows.map((r) => normalizeConditionPoint(r, bounds));
  const centroids = REGIME_CENTERS.slice(0, k).map((c) => normalizeConditionPoint(c, bounds));
  const assignments = new Array<number>(fitRows.length).fill(0);

  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      let bestCluster = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const cent = centroids[c];
        const dist =
          (p[0] - cent[0]) ** 2 + (p[1] - cent[1]) ** 2 + (p[2] - cent[2]) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestCluster = c;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }
    if (!changed && iter > 0) break;

    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      sums[c][2] += points[i][2];
      sums[c][3] += 1;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centroids[c] = [
          sums[c][0] / sums[c][3],
          sums[c][1] / sums[c][3],
          sums[c][2] / sums[c][3],
        ];
      }
    }
  }

  return { k, ...bounds, centroids };
}

export function assignRegimesToCentroids(
  rows: Array<{ os1: number; os2: number; os3: number }>,
  model: FittedRegimeModel,
): number[] {
  if (model.k <= 1 || rows.length === 0) {
    return rows.map(() => 0);
  }
  return rows.map((r) => {
    const p = normalizeConditionPoint(r, model);
    let bestCluster = 0;
    let bestDist = Infinity;
    for (let c = 0; c < model.k; c++) {
      const cent = model.centroids[c];
      const dist = (p[0] - cent[0]) ** 2 + (p[1] - cent[1]) ** 2 + (p[2] - cent[2]) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestCluster = c;
      }
    }
    return bestCluster;
  });
}

export function assignKMeansRegimes(
  rows: Array<{ os1: number; os2: number; os3: number }>,
  k: number,
): number[] {
  const model = fitRegimeCentroids(rows, k);
  return assignRegimesToCentroids(rows, model);
}

export function generateSyntheticFleet(
  subset: SubsetId,
  options: {
    numEngines?: number;
    rulCap?: number;
    rollingWindow?: number;
    seed?: number;
  } = {},
): EngineTrajectory[] {
  const spec = SUBSET_SPECS[subset];
  const numEngines = options.numEngines ?? 48;
  const rulCap = options.rulCap ?? 125;
  const rollingWindow = Math.max(2, options.rollingWindow ?? 15);
  const seed = options.seed ?? 42;
  const rng = createSeededRng(seed + subset.charCodeAt(4) * 131);

  const rawEngines: Array<{
    engineId: number;
    split: EngineTrajectory['split'];
    failureCycle: number;
    faultMode: number;
    rows: Array<{
      cycle: number;
      os1: number;
      os2: number;
      os3: number;
      trueRul: number;
      cappedRul: number;
      sensors: Record<string, number>;
    }>;
  }> = [];

  for (let e = 0; e < numEngines; e++) {
    const engineId = e + 1;
    const ratio = e / numEngines;
    const split: EngineTrajectory['split'] =
      ratio < 0.45 ? 'fit' : ratio < 0.65 ? 'calibration' : ratio < 0.80 ? 'tuning' : 'evaluation';

    const baseLife = spec.medianLife + sampleNormal(rng, 0, 36);
    const failureCycle = Math.round(clamp(baseLife, spec.minLife, Math.min(340, spec.maxLife)));
    const faultMode = spec.faultModes > 1 && rng() > 0.52 ? 2 : 1;
    const initialWear = 0.015 + rng() * 0.035;
    const degRate = (0.95 + rng() * 0.35) / failureCycle;
    const sensorBias: Record<string, number> = {};
    for (const s of SENSORS) {
      sensorBias[s.id] = sampleNormal(rng, 0, SENSOR_COEFFS[s.id].noise * 0.8);
    }

    // Hold flight regimes for multi-cycle flight sortie blocks (3-7 cycles) rather than per-cycle jumps
    let activeRegimeIdx = spec.conditions === 1 ? 0 : Math.floor(rng() * 6);
    let segmentRemaining = spec.conditions === 1 ? failureCycle + 1 : 3 + Math.floor(rng() * 5);

    const rows: typeof rawEngines[number]['rows'] = [];
    for (let cycle = 1; cycle <= failureCycle; cycle++) {
      const trueRul = failureCycle - cycle;
      const cappedRul = Math.min(trueRul, rulCap);
      if (spec.conditions > 1) {
        if (segmentRemaining <= 0) {
          activeRegimeIdx = Math.floor(rng() * 6);
          segmentRemaining = 3 + Math.floor(rng() * 5);
        }
        segmentRemaining -= 1;
      }
      const center = REGIME_CENTERS[activeRegimeIdx];
      const os1 = center.os1 + sampleNormal(rng, 0, spec.conditions === 1 ? 0.0022 : 0.004);
      const os2 = center.os2 + sampleNormal(rng, 0, spec.conditions === 1 ? 0.0003 : 0.0008);
      const os3 = center.os3;

      // Exponential damage propagation (Saxena et al. 2008 shape)
      const tNorm = cycle / failureCycle;
      const healthLoss = initialWear + (Math.exp(2.85 * tNorm) - 1) / (Math.exp(2.85) - 1) * (1 - initialWear);
      const faultAmplifier = faultMode === 2 ? 1.18 : 1.0;

      const sensors: Record<string, number> = {};
      for (const s of SENSORS) {
        const coef = SENSOR_COEFFS[s.id];
        const modeShift =
          faultMode === 2 && (s.id === 's8' || s.id === 's13' || s.id === 's15') ? 1.35 : faultAmplifier;
        const val =
          coef.base +
          coef.os1Coef * os1 +
          coef.os2Coef * os2 +
          coef.os3Coef * (os3 - 100.0) +
          coef.degScale * healthLoss * modeShift * (0.95 + degRate * 50) +
          sensorBias[s.id] +
          sampleNormal(rng, 0, coef.noise);
        sensors[s.id] = Number(val.toFixed(4));
      }

      rows.push({ cycle, os1, os2, os3, trueRul, cappedRul, sensors });
    }

    rawEngines.push({ engineId, split, failureCycle, faultMode, rows });
  }

  // Fit regime k-means and scaling statistics strictly on fit-split engines (zero data leakage)
  const fitRows = rawEngines.filter((eng) => eng.split === 'fit').flatMap((eng) => eng.rows);
  const allRows = rawEngines.flatMap((eng) => eng.rows);
  const regimeModel = fitRegimeCentroids(fitRows.length > 0 ? fitRows : allRows, spec.conditions);
  const regimesAll = assignRegimesToCentroids(allRows, regimeModel);

  let cursor = 0;
  const fitRegimeRows: Array<{ regime: number; sensors: Record<string, number> }> = [];
  for (const eng of rawEngines) {
    for (const r of eng.rows) {
      const regime = regimesAll[cursor++];
      if (eng.split === 'fit') {
        fitRegimeRows.push({ regime, sensors: r.sensors });
      }
    }
  }

  // Compute global min-max on fit split
  const globalMin: Record<string, number> = {};
  const globalMax: Record<string, number> = {};
  for (const s of SENSORS) {
    const vals = fitRows.map((r) => r.sensors[s.id]);
    globalMin[s.id] = Math.min(...vals);
    globalMax[s.id] = Math.max(...vals);
  }

  // Compute per-regime min-max on fit split
  const regimeMin: Record<number, Record<string, number>> = {};
  const regimeMax: Record<number, Record<string, number>> = {};
  for (let reg = 0; reg < spec.conditions; reg++) {
    const regRows = fitRegimeRows.filter((r) => r.regime === reg);
    const sourceRows = regRows.length > 0 ? regRows : fitRegimeRows;
    regimeMin[reg] = {};
    regimeMax[reg] = {};
    for (const s of SENSORS) {
      const vals = sourceRows.map((r) => r.sensors[s.id]);
      regimeMin[reg][s.id] = Math.min(...vals);
      regimeMax[reg][s.id] = Math.max(...vals);
    }
  }

  // Build normalized + causal rolling window features (both regime-aware and global)
  cursor = 0;
  return rawEngines.map((eng) => {
    const cycles: CycleTelemetry[] = [];
    const regimeHistoryBySensor: Record<string, number[]> = {};
    const globalHistoryBySensor: Record<string, number[]> = {};
    for (const s of SENSORS) {
      regimeHistoryBySensor[s.id] = [];
      globalHistoryBySensor[s.id] = [];
    }

    for (const r of eng.rows) {
      const regime = regimesAll[cursor++];
      const normalizedGlobal: Record<string, number> = {};
      const normalizedRegime: Record<string, number> = {};
      const rollingMean: Record<string, number> = {};
      const rollingStd: Record<string, number> = {};
      const rollingMeanGlobal: Record<string, number> = {};
      const rollingStdGlobal: Record<string, number> = {};

      for (const s of SENSORS) {
        const rawVal = r.sensors[s.id];
        const gSpan = Math.max(1e-6, globalMax[s.id] - globalMin[s.id]);
        normalizedGlobal[s.id] = Number(clamp((rawVal - globalMin[s.id]) / gSpan, -0.25, 1.25).toFixed(4));

        const rSpan = Math.max(1e-6, regimeMax[regime][s.id] - regimeMin[regime][s.id]);
        normalizedRegime[s.id] = Number(clamp((rawVal - regimeMin[regime][s.id]) / rSpan, -0.25, 1.25).toFixed(4));

        const rHist = regimeHistoryBySensor[s.id];
        rHist.push(normalizedRegime[s.id]);
        const rSlice = rHist.slice(Math.max(0, rHist.length - rollingWindow));
        rollingMean[s.id] = Number(mean(rSlice).toFixed(4));
        rollingStd[s.id] = Number(stdDev(rSlice).toFixed(4));

        const gHist = globalHistoryBySensor[s.id];
        gHist.push(normalizedGlobal[s.id]);
        const gSlice = gHist.slice(Math.max(0, gHist.length - rollingWindow));
        rollingMeanGlobal[s.id] = Number(mean(gSlice).toFixed(4));
        rollingStdGlobal[s.id] = Number(stdDev(gSlice).toFixed(4));
      }

      cycles.push({
        cycle: r.cycle,
        os1: Number(r.os1.toFixed(4)),
        os2: Number(r.os2.toFixed(4)),
        os3: Number(r.os3.toFixed(1)),
        regime,
        trueRul: r.trueRul,
        cappedRul: r.cappedRul,
        sensors: r.sensors,
        normalizedGlobal,
        normalizedRegime,
        rollingMean,
        rollingStd,
        rollingMeanGlobal,
        rollingStdGlobal,
      });
    }

    return {
      engineId: eng.engineId,
      subset,
      split: eng.split,
      failureCycle: eng.failureCycle,
      faultMode: eng.faultMode,
      cycles,
    };
  });
}

export function analyzeFeatures(fleet: EngineTrajectory[], regimeAware: boolean): FeatureDiagnostic[] {
  const fitCycles = fleet.filter((e) => e.split === 'fit').flatMap((e) => e.cycles);
  const ruls = fitCycles.map((c) => c.cappedRul);

  // Group raw fit cycles by regime to measure genuine within-regime signal dispersion dynamically
  const byRegime = new Map<number, CycleTelemetry[]>();
  for (const c of fitCycles) {
    const arr = byRegime.get(c.regime);
    if (arr) arr.push(c);
    else byRegime.set(c.regime, [c]);
  }

  const diagnostics = SENSORS.map((sensor) => {
    const rawVals = fitCycles.map((c) => c.sensors[sensor.id]);
    const normVals = fitCycles.map((c) =>
      regimeAware ? c.normalizedRegime[sensor.id] : c.normalizedGlobal[sensor.id],
    );
    const rawStd = stdDev(rawVals);
    const normStd = stdDev(normVals);

    let withinRegimeRawStd = rawStd;
    if (byRegime.size > 1) {
      let weightedVar = 0;
      let totalN = 0;
      for (const group of byRegime.values()) {
        if (group.length < 2) continue;
        const s = stdDev(group.map((c) => c.sensors[sensor.id]));
        weightedVar += s * s * group.length;
        totalN += group.length;
      }
      withinRegimeRawStd = totalN > 0 ? Math.sqrt(weightedVar / totalN) : rawStd;
    }

    const rawCorr = pearsonCorrelation(normVals, ruls);
    const effectiveRawStd = regimeAware ? withinRegimeRawStd : rawStd;
    const isConstant =
      normStd < 0.035 ||
      effectiveRawStd < 1e-4 ||
      (effectiveRawStd < 0.035 && Math.abs(rawCorr) < 0.22);

    const corr = isConstant ? 0 : rawCorr;
    const absCorr = Math.abs(corr);

    return {
      sensorId: sensor.id,
      symbol: sensor.symbol,
      description: sensor.description,
      unit: sensor.unit,
      variance: Number((rawStd * rawStd).toFixed(5)),
      withinRegimeVariance: Number((normStd * normStd).toFixed(4)),
      correlationWithRul: Number(corr.toFixed(4)),
      importanceScore: Number((isConstant ? 0 : absCorr * 0.72 + Math.min(0.28, normStd * 0.9)).toFixed(4)),
      isConstant,
    };
  });

  const maxImp = Math.max(1e-6, ...diagnostics.map((d) => d.importanceScore));
  return diagnostics.map((d) => ({
    ...d,
    importanceScore: Number((d.importanceScore / maxImp).toFixed(3)),
  }));
}

export function computeCorrelationMatrix(
  fleet: EngineTrajectory[],
  sensorIds: string[],
  regimeAware: boolean,
): number[][] {
  const fitCycles = fleet.filter((e) => e.split === 'fit').flatMap((e) => e.cycles);
  const series: Record<string, number[]> = {};
  for (const id of sensorIds) {
    series[id] = fitCycles.map((c) =>
      regimeAware ? c.normalizedRegime[id] : c.normalizedGlobal[id],
    );
  }
  return sensorIds.map((rowId) =>
    sensorIds.map((colId) =>
      rowId === colId ? 1 : Number(pearsonCorrelation(series[rowId], series[colId]).toFixed(3)),
    ),
  );
}
