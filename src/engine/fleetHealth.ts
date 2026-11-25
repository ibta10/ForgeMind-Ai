import { calibrateConformalModel } from './conformal';
import { predictWithEstimator, trainRulEstimator } from './models';
import { clamp, computeStaggeredObservedCycle } from './prng';
import type { EngineTrajectory, ModelId, SubsetId } from './types';

export type CriticalityLevel = 'critical' | 'warning' | 'healthy';

export interface FleetEngineHealthCard {
  engineId: number;
  split: EngineTrajectory['split'];
  faultMode: number;
  failureCycle: number;
  observedCycle: number;
  trueRulAtObserved: number;
  predRulAtObserved: number;
  conformalLowerAtObserved: number;
  conformalUpperAtObserved: number;
  conformalHalfWidthQHat: number;
  conformalIntervalWidth: number;
  relativeUncertaintyPct: number;
  localPredVolatility: number;
  thresholdStraddle: boolean;
  criticality: CriticalityLevel;
  rulSparkline: number[];
  sensorSparkline: number[];
  currentSensorNorm: number;
}

export interface FleetHealthOverviewResult {
  subset: SubsetId;
  model: ModelId;
  rulThreshold: number;
  cards: FleetEngineHealthCard[];
  counts: {
    total: number;
    critical: number;
    warning: number;
    healthy: number;
  };
  meanPredRul: number;
}

export type UncertaintySeverity = 'severe' | 'elevated';

export type UncertaintyFlagReason =
  | 'High Conformal Spread'
  | 'Volatile Trajectory'
  | 'Threshold Boundary Straddle'
  | 'High Relative Uncertainty';

export interface CriticalUncertaintyEngineAlert {
  card: FleetEngineHealthCard;
  effectiveUncertainty: number;
  widthExcessPct: number;
  anomalyScore: number;
  severity: UncertaintySeverity;
  reasons: UncertaintyFlagReason[];
}

export interface FleetUncertaintyAlertAnalysis {
  sigmaCutoff: number;
  fleetMeanWidth: number;
  fleetMedianWidth: number;
  fleetStdWidth: number;
  fleetMeanVolatility: number;
  fleetMaxWidth: number;
  straddleCount: number;
  flaggedCount: number;
  flagged: CriticalUncertaintyEngineAlert[];
}

function downsampleSeries(values: number[], targetLen = 22): number[] {
  if (values.length <= targetLen) return values.map((v) => Number(v.toFixed(2)));
  const out: number[] = [];
  for (let i = 0; i < targetLen; i++) {
    const idx = Math.round((i / (targetLen - 1)) * (values.length - 1));
    out.push(Number(values[idx].toFixed(2)));
  }
  return out;
}

function computeTrailingDeltaStd(series: number[], window = 12): number {
  const start = Math.max(0, series.length - window);
  const slice = series.slice(start);
  if (slice.length < 3) return 0;
  const deltas: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    deltas.push(slice[i] - slice[i - 1]);
  }
  const avg = deltas.reduce((acc, v) => acc + v, 0) / deltas.length;
  const variance =
    deltas.reduce((acc, v) => acc + (v - avg) * (v - avg), 0) / deltas.length;
  return Number(Math.sqrt(variance).toFixed(2));
}

function computeObservedCycle(
  engine: EngineTrajectory,
  snapshotMode: 'mixed_fleet' | 'uniform_cycle',
  uniformCycle: number,
  seed: number,
): number {
  if (snapshotMode === 'uniform_cycle') {
    return Math.max(5, Math.min(engine.failureCycle, Math.round(uniformCycle)));
  }
  return computeStaggeredObservedCycle(engine.failureCycle, engine.engineId, seed);
}

export function computeFleetHealthOverview(
  fleet: EngineTrajectory[],
  subset: SubsetId,
  model: ModelId,
  regimeAware: boolean,
  alpha: number,
  rulThreshold: number,
  options?: {
    snapshotMode?: 'mixed_fleet' | 'uniform_cycle';
    uniformCycle?: number;
    sensorId?: string;
    rulCap?: number;
    seed?: number;
  },
): FleetHealthOverviewResult {
  const snapshotMode = options?.snapshotMode ?? 'mixed_fleet';
  const uniformCycle = options?.uniformCycle ?? 130;
  const sensorId = options?.sensorId ?? 's4';
  const rulCap = options?.rulCap ?? 125;
  const seed = options?.seed ?? 42;

  const estimator = trainRulEstimator(fleet, model, regimeAware, rulCap, seed);
  const calibrator = calibrateConformalModel(
    fleet,
    model,
    regimeAware,
    alpha,
    'rul_binned',
    rulCap,
    seed,
  );

  let critical = 0;
  let warning = 0;
  let healthy = 0;
  let predSum = 0;

  const cards: FleetEngineHealthCard[] = fleet.map((eng) => {
    const preds = predictWithEstimator(estimator, eng);
    const observedCycle = computeObservedCycle(eng, snapshotMode, uniformCycle, seed);
    const obsIdx = Math.max(0, Math.min(eng.cycles.length - 1, observedCycle - 1));

    const predRulAtObserved = Number(preds[obsIdx].toFixed(1));
    const qHat = calibrator.getHalfWidth(preds[obsIdx]);
    const conformalLowerAtObserved = Number(Math.max(0, preds[obsIdx] - qHat).toFixed(1));
    const conformalUpperAtObserved = Number((preds[obsIdx] + qHat).toFixed(1));
    const conformalHalfWidthQHat = Number(qHat.toFixed(1));
    const conformalIntervalWidth = Number(
      (conformalUpperAtObserved - conformalLowerAtObserved).toFixed(1),
    );
    const relativeUncertaintyPct = Number(
      ((conformalIntervalWidth / Math.max(15, predRulAtObserved)) * 100).toFixed(1),
    );
    const slicedPreds = preds.slice(0, obsIdx + 1);
    const localPredVolatility = computeTrailingDeltaStd(slicedPreds, 12);
    const thresholdStraddle =
      conformalLowerAtObserved <= rulThreshold && predRulAtObserved > rulThreshold;
    const trueRulAtObserved = eng.cycles[obsIdx].trueRul;

    let criticality: CriticalityLevel;
    if (conformalLowerAtObserved <= rulThreshold) {
      criticality = 'critical';
      critical += 1;
    } else if (
      conformalLowerAtObserved <= rulThreshold + 25 ||
      predRulAtObserved <= rulThreshold + 25
    ) {
      criticality = 'warning';
      warning += 1;
    } else {
      criticality = 'healthy';
      healthy += 1;
    }

    predSum += predRulAtObserved;

    const slicedSensors = eng.cycles
      .slice(0, obsIdx + 1)
      .map((c) =>
        clamp(regimeAware ? c.normalizedRegime[sensorId] ?? 0.5 : c.normalizedGlobal[sensorId] ?? 0.5, 0, 1.15),
      );

    return {
      engineId: eng.engineId,
      split: eng.split,
      faultMode: eng.faultMode,
      failureCycle: eng.failureCycle,
      observedCycle,
      trueRulAtObserved,
      predRulAtObserved,
      conformalLowerAtObserved,
      conformalUpperAtObserved,
      conformalHalfWidthQHat,
      conformalIntervalWidth,
      relativeUncertaintyPct,
      localPredVolatility,
      thresholdStraddle,
      criticality,
      rulSparkline: downsampleSeries(slicedPreds, 22),
      sensorSparkline: downsampleSeries(slicedSensors, 22),
      currentSensorNorm: Number((slicedSensors[slicedSensors.length - 1] ?? 0.5).toFixed(2)),
    };
  });

  return {
    subset,
    model,
    rulThreshold,
    cards,
    counts: {
      total: cards.length,
      critical,
      warning,
      healthy,
    },
    meanPredRul: cards.length > 0 ? Number((predSum / cards.length).toFixed(1)) : 0,
  };
}

export function analyzeFleetUncertaintyAlerts(
  cards: FleetEngineHealthCard[],
  options?: {
    sigmaCutoff?: number;
  },
): FleetUncertaintyAlertAnalysis {
  const sigmaCutoff = options?.sigmaCutoff ?? 1.0;
  if (cards.length === 0) {
    return {
      sigmaCutoff,
      fleetMeanWidth: 0,
      fleetMedianWidth: 0,
      fleetStdWidth: 0,
      fleetMeanVolatility: 0,
      fleetMaxWidth: 0,
      straddleCount: 0,
      flaggedCount: 0,
      flagged: [],
    };
  }

  const widths = cards.map((c) => c.conformalIntervalWidth);
  const sortedWidths = [...widths].sort((a, b) => a - b);
  const mid = Math.floor(sortedWidths.length / 2);
  const fleetMedianWidth =
    sortedWidths.length % 2 === 1
      ? sortedWidths[mid]
      : Number(((sortedWidths[mid - 1] + sortedWidths[mid]) / 2).toFixed(1));
  const fleetMeanWidth = Number(
    (widths.reduce((acc, w) => acc + w, 0) / widths.length).toFixed(1),
  );
  const fleetStdWidth = Number(
    Math.sqrt(
      widths.reduce((acc, w) => acc + (w - fleetMeanWidth) ** 2, 0) / widths.length,
    ).toFixed(2),
  );
  const fleetMaxWidth = Number(Math.max(...widths).toFixed(1));

  const vols = cards.map((c) => c.localPredVolatility);
  const fleetMeanVolatility = Number(
    (vols.reduce((acc, v) => acc + v, 0) / vols.length).toFixed(2),
  );
  const fleetStdVol = Math.max(
    0.5,
    Math.sqrt(
      vols.reduce((acc, v) => acc + (v - fleetMeanVolatility) ** 2, 0) / vols.length,
    ),
  );

  // Composite conformal uncertainty (interval width + local trajectory dispersion)
  const effValues = cards.map((c) => c.conformalIntervalWidth + 2.0 * c.localPredVolatility);
  const effMean = effValues.reduce((acc, v) => acc + v, 0) / effValues.length;
  const effStd = Math.max(
    1.5,
    Math.sqrt(effValues.reduce((acc, v) => acc + (v - effMean) ** 2, 0) / effValues.length),
  );

  let straddleCount = 0;
  const candidates: CriticalUncertaintyEngineAlert[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (card.thresholdStraddle) straddleCount += 1;

    const eff = Number(effValues[i].toFixed(1));
    const baseZ = (eff - effMean) / effStd;
    const straddleBoost = card.thresholdStraddle ? 1.15 : 0;
    const relSpreadBoost =
      card.relativeUncertaintyPct >= 65
        ? clamp(((card.relativeUncertaintyPct - 65) / 50) * 0.75, 0, 1.1)
        : 0;
    const anomalyScore = Number((baseZ + straddleBoost + relSpreadBoost).toFixed(2));

    if (anomalyScore < sigmaCutoff) continue;

    const reasons: UncertaintyFlagReason[] = [];
    if (card.thresholdStraddle) {
      reasons.push('Threshold Boundary Straddle');
    }
    if (card.conformalIntervalWidth >= fleetMeanWidth + Math.max(1.5, 0.5 * fleetStdWidth)) {
      reasons.push('High Conformal Spread');
    }
    if (card.localPredVolatility >= fleetMeanVolatility + 0.7 * fleetStdVol) {
      reasons.push('Volatile Trajectory');
    }
    if (card.relativeUncertaintyPct >= 85) {
      reasons.push('High Relative Uncertainty');
    }
    if (reasons.length === 0) {
      reasons.push('High Conformal Spread');
    }

    const widthExcessPct =
      fleetMedianWidth > 0
        ? Number((((card.conformalIntervalWidth - fleetMedianWidth) / fleetMedianWidth) * 100).toFixed(0))
        : 0;

    candidates.push({
      card,
      effectiveUncertainty: eff,
      widthExcessPct,
      anomalyScore,
      severity:
        anomalyScore >= sigmaCutoff + 0.65 || (card.thresholdStraddle && anomalyScore >= 1.2)
          ? 'severe'
          : 'elevated',
      reasons,
    });
  }

  candidates.sort((a, b) => b.anomalyScore - a.anomalyScore);

  return {
    sigmaCutoff,
    fleetMeanWidth,
    fleetMedianWidth,
    fleetStdWidth,
    fleetMeanVolatility,
    fleetMaxWidth,
    straddleCount,
    flaggedCount: candidates.length,
    flagged: candidates,
  };
}

export interface RulHeatmapColor {
  ratio: number;
  r: number;
  g: number;
  b: number;
  hex: string;
  fillRgba: string;
  borderRgba: string;
}

export interface FleetRulHeatmapCell {
  row: number;
  col: number;
  card: FleetEngineHealthCard;
  displayRul: number;
  color: RulHeatmapColor;
}

export interface FleetRulHeatmapMatrix {
  rows: FleetRulHeatmapCell[][];
  colCount: number;
  rowCount: number;
  minRul: number;
  maxRul: number;
  meanRul: number;
}

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

export function computeRulGradientColor(
  rulValue: number,
  rulThreshold: number,
  rulCap: number,
): RulHeatmapColor {
  const denom = Math.max(1, rulCap - rulThreshold);
  const ratio = clamp((rulValue - rulThreshold) / denom, 0, 1);

  // Stop 0.0: Critical Red (#EF4444 = 239, 68, 68)
  // Stop 0.42: Watch Amber (#F59E0B = 245, 158, 11)
  // Stop 1.0: Healthy Green (#10B981 = 16, 185, 129)
  const pivot = 0.42;
  let r: number;
  let g: number;
  let b: number;

  if (ratio <= pivot) {
    const t = ratio / pivot;
    r = 239 + (245 - 239) * t;
    g = 68 + (158 - 68) * t;
    b = 68 + (11 - 68) * t;
  } else {
    const t = (ratio - pivot) / (1 - pivot);
    r = 245 + (16 - 245) * t;
    g = 158 + (185 - 158) * t;
    b = 11 + (129 - 11) * t;
  }

  const ri = Math.round(r);
  const gi = Math.round(g);
  const bi = Math.round(b);
  const hex = `#${toHexByte(ri)}${toHexByte(gi)}${toHexByte(bi)}`;

  // Slightly richer saturation for low-RUL critical units so urgent engines stand out cleanly
  const fillAlpha = ratio <= 0.05 ? 0.36 : 0.22 + (1 - ratio) * 0.1;
  const borderAlpha = ratio <= 0.05 ? 0.68 : 0.42 + (1 - ratio) * 0.18;

  return {
    ratio: Number(ratio.toFixed(3)),
    r: ri,
    g: gi,
    b: bi,
    hex,
    fillRgba: `rgba(${ri}, ${gi}, ${bi}, ${fillAlpha.toFixed(2)})`,
    borderRgba: `rgba(${ri}, ${gi}, ${bi}, ${borderAlpha.toFixed(2)})`,
  };
}

export function buildFleetRulHeatmapMatrix(
  cards: FleetEngineHealthCard[],
  options: {
    sortBy: 'engine_id' | 'criticality';
    metric: 'pred_rul' | 'conformal_lower';
    rulThreshold: number;
    rulCap: number;
  },
): FleetRulHeatmapMatrix {
  const { sortBy, metric, rulThreshold, rulCap } = options;
  const colCount = 8;

  const sorted = [...cards].sort((a, b) => {
    if (sortBy === 'criticality') {
      const valA = metric === 'conformal_lower' ? a.conformalLowerAtObserved : a.predRulAtObserved;
      const valB = metric === 'conformal_lower' ? b.conformalLowerAtObserved : b.predRulAtObserved;
      if (valA !== valB) return valA - valB;
    }
    return a.engineId - b.engineId;
  });

  const rows: FleetRulHeatmapCell[][] = [];
  let minRul = Infinity;
  let maxRul = -Infinity;
  let sumRul = 0;

  for (let i = 0; i < sorted.length; i += colCount) {
    const rowIdx = Math.floor(i / colCount);
    const slice = sorted.slice(i, i + colCount);
    rows.push(
      slice.map((card, colIdx) => {
        const displayRul =
          metric === 'conformal_lower'
            ? card.conformalLowerAtObserved
            : card.predRulAtObserved;
        minRul = Math.min(minRul, displayRul);
        maxRul = Math.max(maxRul, displayRul);
        sumRul += displayRul;
        return {
          row: rowIdx,
          col: colIdx,
          card,
          displayRul,
          color: computeRulGradientColor(displayRul, rulThreshold, rulCap),
        };
      }),
    );
  }

  return {
    rows,
    colCount,
    rowCount: rows.length,
    minRul: cards.length > 0 ? Number(minRul.toFixed(1)) : 0,
    maxRul: cards.length > 0 ? Number(maxRul.toFixed(1)) : 0,
    meanRul: cards.length > 0 ? Number((sumRul / cards.length).toFixed(1)) : 0,
  };
}

export interface FleetStressPoint {
  card: FleetEngineHealthCard;
  operationalCycles: number;
  currentRul: number;
  uncertaintyWidth: number;
  uncertaintyRatio: number;
  color: RulHeatmapColor;
  isHighRisk: boolean;
  isHighUncertainty: boolean;
  isHighRiskHighUncertainty: boolean;
  stressScore: number;
  radius: number;
}

export interface FleetStressPlotData {
  points: FleetStressPoint[];
  minCycles: number;
  maxCycles: number;
  meanCycles: number;
  maxRul: number;
  meanRul: number;
  minWidth: number;
  maxWidth: number;
  meanWidth: number;
  highUncertaintyCutoff: number;
  highRiskCount: number;
  highUncertaintyCount: number;
  highRiskHighUncertaintyCount: number;
  highlightedUnitIds: number[];
}

export function computeUncertaintyWidthColor(
  width: number,
  minWidth: number,
  maxWidth: number,
): RulHeatmapColor {
  const span = maxWidth - minWidth;
  const ratio = span < 0.5 ? 0.2 : clamp((width - minWidth) / span, 0, 1);

  // Stop 0.0: Tight Conformal Band Cyan-Teal (#06B6D4 = 6, 182, 212)
  // Stop 0.5: Elevated Uncertainty Amber (#F59E0B = 245, 158, 11)
  // Stop 1.0: Wide High-Uncertainty Rose (#F43F5E = 244, 63, 94)
  const pivot = 0.5;
  let r: number;
  let g: number;
  let b: number;

  if (ratio <= pivot) {
    const t = ratio / pivot;
    r = 6 + (245 - 6) * t;
    g = 182 + (158 - 182) * t;
    b = 212 + (11 - 212) * t;
  } else {
    const t = (ratio - pivot) / (1 - pivot);
    r = 245 + (244 - 245) * t;
    g = 158 + (63 - 158) * t;
    b = 11 + (94 - 11) * t;
  }

  const ri = Math.round(r);
  const gi = Math.round(g);
  const bi = Math.round(b);
  const hex = `#${toHexByte(ri)}${toHexByte(gi)}${toHexByte(bi)}`;

  return {
    ratio: Number(ratio.toFixed(3)),
    r: ri,
    g: gi,
    b: bi,
    hex,
    fillRgba: `rgba(${ri}, ${gi}, ${bi}, 0.88)`,
    borderRgba: `rgba(${ri}, ${gi}, ${bi}, 0.96)`,
  };
}

export function buildFleetStressScatterData(
  cards: FleetEngineHealthCard[],
  options: {
    rulThreshold: number;
    rulCap: number;
    rulMetric?: 'pred_rul' | 'conformal_lower';
  },
): FleetStressPlotData {
  const { rulThreshold, rulCap, rulMetric = 'pred_rul' } = options;

  if (cards.length === 0) {
    return {
      points: [],
      minCycles: 0,
      maxCycles: 200,
      meanCycles: 0,
      maxRul: rulCap,
      meanRul: 0,
      minWidth: 0,
      maxWidth: 0,
      meanWidth: 0,
      highUncertaintyCutoff: 0,
      highRiskCount: 0,
      highUncertaintyCount: 0,
      highRiskHighUncertaintyCount: 0,
      highlightedUnitIds: [],
    };
  }

  const cycles = cards.map((c) => c.observedCycle);
  const widths = cards.map((c) => c.conformalIntervalWidth);
  const ruls = cards.map((c) =>
    rulMetric === 'conformal_lower' ? c.conformalLowerAtObserved : c.predRulAtObserved,
  );

  const minCycles = Math.min(...cycles);
  const maxCycles = Math.max(...cycles);
  const meanCycles = Number((cycles.reduce((s, v) => s + v, 0) / cycles.length).toFixed(1));
  const maxRul = Number(Math.max(rulCap, ...ruls).toFixed(1));
  const meanRul = Number((ruls.reduce((s, v) => s + v, 0) / ruls.length).toFixed(1));

  const minWidth = Number(Math.min(...widths).toFixed(1));
  const maxWidth = Number(Math.max(...widths).toFixed(1));
  const meanWidth = Number((widths.reduce((s, v) => s + v, 0) / widths.length).toFixed(1));
  const stdWidth = Math.sqrt(
    widths.reduce((s, v) => s + (v - meanWidth) ** 2, 0) / widths.length,
  );
  const sortedWidths = [...widths].sort((a, b) => a - b);
  const p70Width =
    sortedWidths[Math.min(sortedWidths.length - 1, Math.floor(0.7 * sortedWidths.length))];

  const highUncertaintyCutoff =
    maxWidth - minWidth < 0.5
      ? Number((maxWidth + 1).toFixed(1))
      : Number(
          Math.max(
            minWidth + 0.45 * (maxWidth - minWidth),
            Math.min(p70Width, meanWidth + 0.35 * stdWidth),
          ).toFixed(1),
        );

  let highRiskCount = 0;
  let highUncertaintyCount = 0;
  let highRiskHighUncertaintyCount = 0;

  const rawPoints: FleetStressPoint[] = cards.map((card, idx) => {
    const currentRul = ruls[idx];
    const uncertaintyWidth = card.conformalIntervalWidth;
    const color = computeUncertaintyWidthColor(uncertaintyWidth, minWidth, maxWidth);
    const uncertaintyRatio = color.ratio;

    const isHighRisk =
      card.conformalLowerAtObserved <= rulThreshold ||
      card.predRulAtObserved <= rulThreshold + 15;
    const isHighUncertainty = uncertaintyWidth >= highUncertaintyCutoff;
    const isHighRiskHighUncertainty = isHighRisk && isHighUncertainty;

    if (isHighRisk) highRiskCount += 1;
    if (isHighUncertainty) highUncertaintyCount += 1;
    if (isHighRiskHighUncertainty) highRiskHighUncertaintyCount += 1;

    const rulUrgency = clamp(1 - currentRul / Math.max(1, maxRul), 0, 1);
    const cycleSpan = maxCycles - minCycles;
    const ageStress = cycleSpan > 0 ? clamp((card.observedCycle - minCycles) / cycleSpan, 0, 1) : 0.5;
    const stressScore = Number(
      (0.45 * rulUrgency + 0.4 * uncertaintyRatio + 0.15 * ageStress).toFixed(3),
    );

    const radius = isHighRiskHighUncertainty ? 6.8 : isHighRisk || isHighUncertainty ? 5.3 : 4.4;

    return {
      card,
      operationalCycles: card.observedCycle,
      currentRul,
      uncertaintyWidth,
      uncertaintyRatio,
      color,
      isHighRisk,
      isHighUncertainty,
      isHighRiskHighUncertainty,
      stressScore,
      radius,
    };
  });

  const highlightedUnitIds = [...rawPoints]
    .filter((p) => p.isHighRiskHighUncertainty)
    .sort((a, b) => b.stressScore - a.stressScore)
    .slice(0, 4)
    .map((p) => p.card.engineId);

  // Draw normal points first and highest-stress / outlier points on top
  const points = [...rawPoints].sort((a, b) => {
    const rankA = a.isHighRiskHighUncertainty ? 2 : a.isHighRisk || a.isHighUncertainty ? 1 : 0;
    const rankB = b.isHighRiskHighUncertainty ? 2 : b.isHighRisk || b.isHighUncertainty ? 1 : 0;
    if (rankA !== rankB) return rankA - rankB;
    return a.stressScore - b.stressScore;
  });

  return {
    points,
    minCycles,
    maxCycles,
    meanCycles,
    maxRul,
    meanRul,
    minWidth,
    maxWidth,
    meanWidth,
    highUncertaintyCutoff,
    highRiskCount,
    highUncertaintyCount,
    highRiskHighUncertaintyCount,
    highlightedUnitIds,
  };
}

