import { SENSORS } from './cmapss';
import { predictWithEstimator, trainRulEstimator } from './models';
import type { EngineTrajectory, ModelId } from './types';

export type OverlayAlignmentMode = 'lifecycle_pct' | 'cycles_to_failure' | 'absolute_cycles';
export type OverlaySignalMode = 'rolling_mean' | 'normalized' | 'pred_rul';

export interface DegradationOverlayPoint {
  x: number;
  y: number;
  cycle: number;
  trueRul: number;
}

export interface EngineSlopeSeries {
  engineId: number;
  isPrimary: boolean;
  split: EngineTrajectory['split'];
  faultMode: number;
  failureCycle: number;
  earlySlopePer100: number;
  terminalSlopePer100: number;
  accelerationRatio: number;
  points: DegradationOverlayPoint[];
}

export interface FleetEnvelopePoint {
  x: number;
  mean: number;
  lower: number;
  upper: number;
}

export interface DegradationSlopeOverlayResult {
  sensorId: string;
  sensorSymbol: string;
  alignment: OverlayAlignmentMode;
  signalMode: OverlaySignalMode;
  series: EngineSlopeSeries[];
  fleetEnvelope: FleetEnvelopePoint[];
}

function olsSlopePer100(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    num += dx * (ys[i] - meanY);
    den += dx * dx;
  }
  if (den <= 1e-9) return 0;
  return (num / den) * 100;
}

export function pickDefaultPeerEngineIds(
  fleet: EngineTrajectory[],
  primaryEngineId: number,
  maxPeers = 4,
): number[] {
  const candidates = fleet.filter((e) => e.engineId !== primaryEngineId);
  if (candidates.length === 0) return [];

  const byLife = [...candidates].sort((a, b) => a.failureCycle - b.failureCycle);
  const picks: EngineTrajectory[] = [];
  const used = new Set<number>();

  const tryAdd = (eng?: EngineTrajectory) => {
    if (!eng || used.has(eng.engineId) || picks.length >= maxPeers) return;
    used.add(eng.engineId);
    picks.push(eng);
  };

  // Pick shortest lifespan (fast wear), longest lifespan (gradual wear), and quartiles/alternate fault modes
  tryAdd(byLife[0]);
  tryAdd(byLife[byLife.length - 1]);

  const primary = fleet.find((e) => e.engineId === primaryEngineId);
  if (primary) {
    const altFault = byLife.find((e) => e.faultMode !== primary.faultMode && !used.has(e.engineId));
    tryAdd(altFault);
  }

  tryAdd(byLife[Math.floor(byLife.length * 0.35)]);
  tryAdd(byLife[Math.floor(byLife.length * 0.68)]);

  for (const eng of byLife) {
    if (picks.length >= maxPeers) break;
    tryAdd(eng);
  }

  return picks.map((e) => e.engineId);
}

function extractSignalSeries(
  fleet: EngineTrajectory[],
  engine: EngineTrajectory,
  sensorId: string,
  signalMode: OverlaySignalMode,
  regimeAware: boolean,
  model: ModelId,
  rulCap: number,
  seed: number,
): number[] {
  if (signalMode === 'pred_rul') {
    const estimator = trainRulEstimator(fleet, model, regimeAware, rulCap, seed);
    return predictWithEstimator(estimator, engine);
  }
  if (signalMode === 'normalized') {
    return engine.cycles.map((c) =>
      regimeAware ? c.normalizedRegime[sensorId] ?? 0 : c.normalizedGlobal[sensorId] ?? 0,
    );
  }
  return engine.cycles.map((c) =>
    regimeAware ? c.rollingMean[sensorId] ?? 0 : c.rollingMeanGlobal[sensorId] ?? 0,
  );
}

function downsampleForAxis(
  engine: EngineTrajectory,
  values: number[],
  alignment: OverlayAlignmentMode,
  targetPoints = 41,
): DegradationOverlayPoint[] {
  const len = engine.cycles.length;
  if (len === 0) return [];

  if (alignment === 'lifecycle_pct') {
    const out: DegradationOverlayPoint[] = [];
    for (let i = 0; i < targetPoints; i++) {
      const pct = (i / (targetPoints - 1)) * 100;
      const idx = Math.min(len - 1, Math.max(0, Math.round((i / (targetPoints - 1)) * (len - 1))));
      const c = engine.cycles[idx];
      out.push({
        x: Number(pct.toFixed(1)),
        y: Number(values[idx].toFixed(3)),
        cycle: c.cycle,
        trueRul: c.trueRul,
      });
    }
    return out;
  }

  const out: DegradationOverlayPoint[] = [];
  const stepCount = Math.min(len, targetPoints);
  for (let i = 0; i < stepCount; i++) {
    const idx = stepCount === 1 ? 0 : Math.round((i / (stepCount - 1)) * (len - 1));
    const c = engine.cycles[idx];
    const x = alignment === 'cycles_to_failure' ? c.cycle - engine.failureCycle : c.cycle;
    out.push({
      x,
      y: Number(values[idx].toFixed(3)),
      cycle: c.cycle,
      trueRul: c.trueRul,
    });
  }
  return out;
}

export function buildDegradationSlopeOverlay(
  fleet: EngineTrajectory[],
  selectedEngineIds: number[],
  options: {
    primaryEngineId: number;
    sensorId: string;
    alignment: OverlayAlignmentMode;
    signalMode: OverlaySignalMode;
    regimeAware: boolean;
    model: ModelId;
    rulCap: number;
    seed: number;
  },
): DegradationSlopeOverlayResult {
  const { primaryEngineId, sensorId, alignment, signalMode, regimeAware, model, rulCap, seed } = options;
  const sensorMeta = SENSORS.find((s) => s.id === sensorId) ?? SENSORS[3];

  const uniqueIds = Array.from(new Set([primaryEngineId, ...selectedEngineIds]));
  const engines = uniqueIds
    .map((id) => fleet.find((e) => e.engineId === id))
    .filter((e): e is EngineTrajectory => Boolean(e));

  const series: EngineSlopeSeries[] = engines.map((eng) => {
    const signalValues = extractSignalSeries(
      fleet,
      eng,
      sensorId,
      signalMode,
      regimeAware,
      model,
      rulCap,
      seed,
    );

    // Compute drift slopes from smoothed normalized drift (rollingMean / rollingMeanGlobal) or active signal
    const slopeSource =
      signalMode === 'pred_rul'
        ? signalValues
        : eng.cycles.map((c) =>
            regimeAware ? c.rollingMean[sensorId] ?? 0 : c.rollingMeanGlobal[sensorId] ?? 0,
          );

    const midIdx = Math.max(2, Math.floor(eng.cycles.length * 0.5));
    const termStartIdx = Math.max(0, Math.floor(eng.cycles.length * 0.7));

    const earlyXs = eng.cycles.slice(0, midIdx).map((c) => c.cycle);
    const earlyYs = slopeSource.slice(0, midIdx);
    const termXs = eng.cycles.slice(termStartIdx).map((c) => c.cycle);
    const termYs = slopeSource.slice(termStartIdx);

    const earlySlope = olsSlopePer100(earlyXs, earlyYs);
    const terminalSlope = olsSlopePer100(termXs, termYs);
    const accel =
      Math.abs(earlySlope) > 0.015
        ? Math.abs(terminalSlope) / Math.abs(earlySlope)
        : Math.abs(terminalSlope) / 0.015;

    return {
      engineId: eng.engineId,
      isPrimary: eng.engineId === primaryEngineId,
      split: eng.split,
      faultMode: eng.faultMode,
      failureCycle: eng.failureCycle,
      earlySlopePer100: Number(earlySlope.toFixed(3)),
      terminalSlopePer100: Number(terminalSlope.toFixed(3)),
      accelerationRatio: Number(Math.min(25, accel).toFixed(1)),
      points: downsampleForAxis(eng, signalValues, alignment, 41),
    };
  });

  // Compute canonical fleet mean ± 1σ pattern envelope on normalized lifecycle grid (0%..100%)
  const fleetEnvelope: FleetEnvelopePoint[] = [];
  if (alignment === 'lifecycle_pct' && fleet.length > 0) {
    const gridCount = 41;
    const allFleetSignals = fleet.map((eng) =>
      extractSignalSeries(fleet, eng, sensorId, signalMode, regimeAware, model, rulCap, seed),
    );

    for (let g = 0; g < gridCount; g++) {
      const pct = (g / (gridCount - 1)) * 100;
      const valsAtGrid: number[] = [];
      for (let eIdx = 0; eIdx < fleet.length; eIdx++) {
        const len = fleet[eIdx].cycles.length;
        const idx = Math.min(len - 1, Math.max(0, Math.round((g / (gridCount - 1)) * (len - 1))));
        valsAtGrid.push(allFleetSignals[eIdx][idx]);
      }
      const meanVal = valsAtGrid.reduce((s, v) => s + v, 0) / valsAtGrid.length;
      const variance =
        valsAtGrid.reduce((s, v) => s + (v - meanVal) * (v - meanVal), 0) / valsAtGrid.length;
      const sd = Math.sqrt(variance);
      fleetEnvelope.push({
        x: Number(pct.toFixed(1)),
        mean: Number(meanVal.toFixed(3)),
        lower: Number((meanVal - sd).toFixed(3)),
        upper: Number((meanVal + sd).toFixed(3)),
      });
    }
  }

  return {
    sensorId: sensorMeta.id,
    sensorSymbol: sensorMeta.symbol,
    alignment,
    signalMode,
    series,
    fleetEnvelope,
  };
}
