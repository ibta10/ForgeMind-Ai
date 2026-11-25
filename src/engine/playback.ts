import { calibrateConformalModel } from './conformal';
import { predictEngineRulSeries } from './models';
import type { EngineTrajectory, ModelId } from './types';

export interface PlaybackStep {
  cycle: number;
  trueRul: number;
  cappedRul: number;
  predRul: number;
  lower: number;
  upper: number;
  width: number;
  regime: number;
  riskTriggered: boolean;
  thresholdTriggered: boolean;
}

export interface EnginePlaybackTimeline {
  engineId: number;
  failureCycle: number;
  nominalCoverage: number;
  globalQHat: number;
  firstRiskTriggerCycle: number | null;
  firstThresholdTriggerCycle: number | null;
  riskTriggerCount: number;
  alertBreachCount: number;
  frames: PlaybackStep[];
}

export function buildEnginePlaybackTimeline(
  fleet: EngineTrajectory[],
  engine: EngineTrajectory,
  model: ModelId,
  regimeAware: boolean,
  alpha: number,
  conformalMode: 'global' | 'rul_binned',
  rulThreshold: number,
  rulCap = 125,
  seed = 42,
): EnginePlaybackTimeline {
  const calibrator = calibrateConformalModel(
    fleet,
    model,
    regimeAware,
    alpha,
    conformalMode,
    rulCap,
    seed,
  );

  const preds = predictEngineRulSeries(fleet, engine, model, regimeAware, rulCap, seed);
  let firstRiskTriggerCycle: number | null = null;
  let firstThresholdTriggerCycle: number | null = null;
  let riskTriggerCount = 0;
  let alertBreachCount = 0;

  const frames: PlaybackStep[] = engine.cycles.map((c, idx) => {
    const predRul = preds[idx];
    const q = calibrator.getHalfWidth(predRul);
    const lower = Number(Math.max(0, predRul - q).toFixed(2));
    const upper = Number((predRul + q).toFixed(2));
    const width = Number((upper - lower).toFixed(2));
    const riskTriggered = lower <= rulThreshold;
    const thresholdTriggered = predRul <= rulThreshold;

    if (riskTriggered) {
      riskTriggerCount += 1;
      if (firstRiskTriggerCycle === null) {
        firstRiskTriggerCycle = c.cycle;
      }
    }
    if (thresholdTriggered) {
      alertBreachCount += 1;
      if (firstThresholdTriggerCycle === null) {
        firstThresholdTriggerCycle = c.cycle;
      }
    }

    return {
      cycle: c.cycle,
      trueRul: c.trueRul,
      cappedRul: Math.min(c.trueRul, rulCap),
      predRul,
      lower,
      upper,
      width,
      regime: c.regime,
      riskTriggered,
      thresholdTriggered,
    };
  });

  return {
    engineId: engine.engineId,
    failureCycle: engine.failureCycle,
    nominalCoverage: Number(((1 - alpha) * 100).toFixed(1)),
    globalQHat: calibrator.globalQHat,
    firstRiskTriggerCycle,
    firstThresholdTriggerCycle,
    riskTriggerCount,
    alertBreachCount,
    frames,
  };
}

export function slicePlaybackTimeline(
  timeline: EnginePlaybackTimeline,
  cursorCycle: number,
): {
  visibleFrames: PlaybackStep[];
  activeFrame: PlaybackStep;
  clampedCycle: number;
  progressPct: number;
} {
  const maxCycle = timeline.frames.length;
  const clampedCount = Math.max(1, Math.min(maxCycle, Math.round(cursorCycle)));
  const visibleFrames = timeline.frames.slice(0, clampedCount);
  const activeFrame = visibleFrames[visibleFrames.length - 1] ?? timeline.frames[0];
  const progressPct = Number(((clampedCount / Math.max(1, maxCycle)) * 100).toFixed(1));

  return {
    visibleFrames,
    activeFrame,
    clampedCycle: activeFrame?.cycle ?? clampedCount,
    progressPct,
  };
}

export interface RulExtrapolationResult {
  windowSizeUsed: number;
  slope: number;
  intercept: number;
  rSquared: number;
  currentCycle: number;
  currentPredRul: number;
  isConverging: boolean;
  projectedEolCycle: number | null;
  remainingCycles: number | null;
  projectedEolDateLabel: string;
  projectedEolShortDate: string;
  linePoints: Array<{ x: number; y: number }>;
}

function formatUtcDatePlusDays(referenceIso: string, addDays: number): {
  fullLabel: string;
  shortLabel: string;
} {
  const [y, m, d] = referenceIso.split('-').map((n) => Number(n));
  const baseMs = Date.UTC(y || 2026, (m || 11) - 1, d || 23);
  const targetDate = new Date(baseMs + Math.max(0, Math.round(addDays)) * 86_400_000);
  const fullLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(targetDate);
  const shortLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(targetDate);
  return { fullLabel, shortLabel };
}

export function computeRulLinearExtrapolation(
  visibleFrames: PlaybackStep[],
  options?: {
    windowSize?: number;
    maxHorizonX?: number;
    yCeiling?: number;
    referenceDateIso?: string;
    cyclesPerDay?: number;
  },
): RulExtrapolationResult {
  const windowSize = options?.windowSize ?? 10;
  const yCeiling = options?.yCeiling ?? 160;
  const referenceDateIso = options?.referenceDateIso ?? new Date().toISOString().slice(0, 10);
  const cyclesPerDay = Math.max(0.25, options?.cyclesPerDay ?? 1);

  if (visibleFrames.length === 0) {
    return {
      windowSizeUsed: 0,
      slope: 0,
      intercept: 0,
      rSquared: 0,
      currentCycle: 0,
      currentPredRul: 0,
      isConverging: false,
      projectedEolCycle: null,
      remainingCycles: null,
      projectedEolDateLabel: 'Insufficient Data',
      projectedEolShortDate: 'N/A',
      linePoints: [],
    };
  }

  const window = visibleFrames.slice(-Math.max(2, windowSize));
  const lastFrame = window[window.length - 1];
  const currentCycle = lastFrame.cycle;
  const currentPredRul = lastFrame.predRul;

  if (window.length < 2) {
    return {
      windowSizeUsed: window.length,
      slope: 0,
      intercept: currentPredRul,
      rSquared: 0,
      currentCycle,
      currentPredRul,
      isConverging: false,
      projectedEolCycle: null,
      remainingCycles: null,
      projectedEolDateLabel: 'Need ≥ 2 cycles',
      projectedEolShortDate: 'N/A',
      linePoints: [],
    };
  }

  const n = window.length;
  let sumX = 0;
  let sumY = 0;
  for (const pt of window) {
    sumX += pt.cycle;
    sumY += pt.predRul;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const pt of window) {
    const dx = pt.cycle - meanX;
    const dy = pt.predRul - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  const slope = sxx > 1e-9 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;
  const ssRes = window.reduce((acc, pt) => {
    const pred = slope * pt.cycle + intercept;
    return acc + (pt.predRul - pred) ** 2;
  }, 0);
  const rSquared = syy > 1e-9 ? Math.max(0, Math.min(1, 1 - ssRes / syy)) : 1;

  const isConverging = slope < -0.02;
  let projectedEolCycle: number | null = null;
  let remainingCycles: number | null = null;
  let projectedEolDateLabel = 'Stable Horizon (slope ≥ 0)';
  let projectedEolShortDate = 'Stable';

  if (isConverging) {
    const rawZeroCycle = -intercept / slope;
    const clampedEolCycle = Math.max(currentCycle, rawZeroCycle);
    projectedEolCycle = Number(clampedEolCycle.toFixed(1));
    remainingCycles = Number(Math.max(0, projectedEolCycle - currentCycle).toFixed(1));
    const formatted = formatUtcDatePlusDays(referenceDateIso, remainingCycles / cyclesPerDay);
    projectedEolDateLabel = formatted.fullLabel;
    projectedEolShortDate = formatted.shortLabel;
  }

  const startX = window[0].cycle;
  const startY = Math.max(0, Math.min(yCeiling, slope * startX + intercept));

  const fallbackHorizon = currentCycle + 35;
  const targetEndX = isConverging && projectedEolCycle !== null
    ? projectedEolCycle
    : fallbackHorizon;
  const clampedEndX =
    typeof options?.maxHorizonX === 'number'
      ? Math.max(currentCycle, Math.min(options.maxHorizonX, targetEndX))
      : targetEndX;
  const endY = Math.max(0, Math.min(yCeiling, slope * clampedEndX + intercept));

  const midX = currentCycle;
  const midY = Math.max(0, Math.min(yCeiling, slope * midX + intercept));

  const linePoints: Array<{ x: number; y: number }> = [
    { x: Number(startX.toFixed(1)), y: Number(startY.toFixed(2)) },
    { x: Number(midX.toFixed(1)), y: Number(midY.toFixed(2)) },
  ];
  if (clampedEndX > midX + 0.1) {
    linePoints.push({ x: Number(clampedEndX.toFixed(1)), y: Number(endY.toFixed(2)) });
  }

  return {
    windowSizeUsed: n,
    slope: Number(slope.toFixed(3)),
    intercept: Number(intercept.toFixed(2)),
    rSquared: Number(rSquared.toFixed(3)),
    currentCycle,
    currentPredRul,
    isConverging,
    projectedEolCycle,
    remainingCycles,
    projectedEolDateLabel,
    projectedEolShortDate,
    linePoints,
  };
}

export type RulVolatilitySeverity = 'normal' | 'elevated' | 'spike';

export interface RulVolatilityStep {
  cycle: number;
  rollingStdDev: number;
  isSpike: boolean;
}

export interface RulVolatilityMetrics {
  windowSize: number;
  windowUsed: number;
  rollingStdDev: number;
  rollingMean: number;
  baselineStdDev: number;
  peakStdDev: number;
  peakCycle: number;
  spikeCutoff: number;
  zScore: number;
  spikeRatio: number;
  spikeCount: number;
  severity: RulVolatilitySeverity;
  alertMessage: string;
  history: RulVolatilityStep[];
}

function computePopStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  if (values.length < 2) return { mean, stdDev: 0 };
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

export function computeRulVolatility(
  visibleFrames: PlaybackStep[],
  rollingWindow: number,
): RulVolatilityMetrics {
  const w = Math.max(2, Math.round(rollingWindow));

  if (visibleFrames.length === 0) {
    return {
      windowSize: w,
      windowUsed: 0,
      rollingStdDev: 0,
      rollingMean: 0,
      baselineStdDev: 0,
      peakStdDev: 0,
      peakCycle: 1,
      spikeCutoff: 10,
      zScore: 0,
      spikeRatio: 1,
      spikeCount: 0,
      severity: 'normal',
      alertMessage: 'Insufficient cycles for rolling dispersion',
      history: [],
    };
  }

  const rawHistory: Array<{ cycle: number; stdDev: number; mean: number }> = [];
  for (let i = 0; i < visibleFrames.length; i++) {
    const start = Math.max(0, i - w + 1);
    const slice = visibleFrames.slice(start, i + 1).map((f) => f.predRul);
    const { mean, stdDev } = computePopStdDev(slice);
    rawHistory.push({
      cycle: visibleFrames[i].cycle,
      stdDev,
      mean,
    });
  }

  const current = rawHistory[rawHistory.length - 1];
  const currentSlice = visibleFrames.slice(-w);
  const stdValues = rawHistory.map((h) => h.stdDev);
  const sortedStds = [...stdValues].sort((a, b) => a - b);
  const mid = Math.floor(sortedStds.length / 2);
  const baselineStdDev =
    sortedStds.length % 2 === 1
      ? sortedStds[mid]
      : (sortedStds[mid - 1] + sortedStds[mid]) / 2;

  const { mean: histMean, stdDev: histSpread } = computePopStdDev(stdValues);
  const zScore =
    stdValues.length >= 4
      ? (current.stdDev - histMean) / Math.max(0.65, histSpread)
      : 0;
  const spikeRatio =
    baselineStdDev > 0.25 ? current.stdDev / baselineStdDev : current.stdDev > 1 ? 2 : 1;

  // Dynamic spike threshold combining relative historical baseline jump and absolute dispersion
  const spikeCutoff = Math.max(
    8.5,
    Math.min(
      14.5,
      Math.max(baselineStdDev * 1.45, histMean + 1.35 * Math.max(0.8, histSpread)),
    ),
  );
  const elevatedCutoff = Math.max(6.2, spikeCutoff * 0.78);

  let peakStdDev = 0;
  let peakCycle = current.cycle;
  let spikeCount = 0;

  const history: RulVolatilityStep[] = rawHistory.map((item) => {
    const rounded = Number(item.stdDev.toFixed(2));
    if (rounded >= peakStdDev) {
      peakStdDev = rounded;
      peakCycle = item.cycle;
    }
    const isStepSpike = item.stdDev >= spikeCutoff || item.stdDev >= 12.0;
    if (isStepSpike) spikeCount += 1;
    return {
      cycle: item.cycle,
      rollingStdDev: rounded,
      isSpike: isStepSpike,
    };
  });

  const rollingStdDev = Number(current.stdDev.toFixed(2));
  const rollingMean = Number(current.mean.toFixed(1));

  let severity: RulVolatilitySeverity = 'normal';
  let alertMessage = 'Stable prediction dispersion over window';

  if (
    rollingStdDev >= 12.0 ||
    (visibleFrames.length >= Math.max(6, Math.ceil(w * 0.5)) &&
      (rollingStdDev >= spikeCutoff || (zScore >= 1.5 && rollingStdDev >= 6.5)))
  ) {
    severity = 'spike';
    alertMessage =
      spikeRatio >= 1.25
        ? `Spike: ${spikeRatio.toFixed(1)}× med (±${rollingStdDev.toFixed(1)}c)`
        : `High instability: ±${rollingStdDev.toFixed(1)}c`;
  } else if (
    rollingStdDev >= elevatedCutoff ||
    (zScore >= 1.0 && rollingStdDev >= 5.2)
  ) {
    severity = 'elevated';
    alertMessage = `Elevated: +${Math.max(0, zScore).toFixed(1)}σ drift`;
  }

  return {
    windowSize: w,
    windowUsed: currentSlice.length,
    rollingStdDev,
    rollingMean,
    baselineStdDev: Number(baselineStdDev.toFixed(2)),
    peakStdDev: Number(peakStdDev.toFixed(2)),
    peakCycle,
    spikeCutoff: Number(spikeCutoff.toFixed(2)),
    zScore: Number(zScore.toFixed(2)),
    spikeRatio: Number(spikeRatio.toFixed(2)),
    spikeCount,
    severity,
    alertMessage,
    history,
  };
}


