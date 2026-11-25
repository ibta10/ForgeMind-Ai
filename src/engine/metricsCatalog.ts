import type { EngineTrajectory } from './types';

export type MetricId =
  | 'mae'
  | 'rmse'
  | 'phm08'
  | 'rul'
  | 'conformal_coverage'
  | 'interval_width'
  | 'cost_per_cycle'
  | 'preventive_replacement'
  | 'failure_rate'
  | 'wasted_useful_life';

export type MetricCategory = 'accuracy' | 'uncertainty' | 'economics';

export interface MetricDefinition {
  id: MetricId;
  name: string;
  shortLabel: string;
  category: MetricCategory;
  unit: string;
  direction: string;
  formulaHint: string;
  plainExplanation: string;
  engineeringImpact: string;
}

export const METRIC_DEFINITIONS: Record<MetricId, MetricDefinition> = {
  mae: {
    id: 'mae',
    name: 'Mean Absolute Error (MAE)',
    shortLabel: 'MAE',
    category: 'accuracy',
    unit: 'cycles',
    direction: 'Lower is better',
    formulaHint: '(1/n) Σ |ŷᵢ − yᵢ|',
    plainExplanation:
      'Average absolute difference in operating cycles between predicted Remaining Useful Life and true Remaining Useful Life across evaluation cycles.',
    engineeringImpact:
      'Gives every cycle error equal linear weight, making it straightforward to judge typical prediction offset without outlier distortion.',
  },
  rmse: {
    id: 'rmse',
    name: 'Root Mean Squared Error (RMSE)',
    shortLabel: 'RMSE',
    category: 'accuracy',
    unit: 'cycles',
    direction: 'Lower is better',
    formulaHint: '√[(1/n) Σ (ŷᵢ − yᵢ)²]',
    plainExplanation:
      'Square root of the average squared RUL prediction error across all evaluated engine cycles.',
    engineeringImpact:
      'Penalizes large misses more heavily than MAE, exposing models that occasionally drift far from true degradation near end-of-life.',
  },
  phm08: {
    id: 'phm08',
    name: 'PHM08 Asymmetric Score',
    shortLabel: 'PHM08 Score',
    category: 'accuracy',
    unit: 'score (unitless)',
    direction: 'Lower is better',
    formulaHint: 'd < 0: exp(−d/13) − 1 · d ≥ 0: exp(+d/10) − 1',
    plainExplanation:
      'Asymmetric prognostics score from the IEEE PHM 2008 challenge where d = ŷ − y (positive d means predicting too much life left).',
    engineeringImpact:
      'Late predictions (over-estimating RUL) grow faster exponentially because missing an imminent failure is far riskier than intervening early.',
  },
  rul: {
    id: 'rul',
    name: 'Remaining Useful Life (RUL)',
    shortLabel: 'RUL',
    category: 'accuracy',
    unit: 'cycles',
    direction: 'Monotonic countdown to 0 at failure',
    formulaHint: 'RUL(t) = T_failure − t (piecewise capped ≤ RUL_cap)',
    plainExplanation:
      'Number of operating cycles remaining before an engine reaches its simulated functional failure cycle.',
    engineeringImpact:
      'Piecewise capping reflects that early-life cycles look stationary before measurable wear begins, stabilizing regression training targets.',
  },
  conformal_coverage: {
    id: 'conformal_coverage',
    name: 'Conformal Coverage',
    shortLabel: 'Conformal Coverage',
    category: 'uncertainty',
    unit: '% of cycles',
    direction: 'Match or exceed target (1 − α)',
    formulaHint: 'P(y_true ∈ [LB, UB]) ≥ 1 − α',
    plainExplanation:
      'Empirical fraction of evaluation cycles whose true RUL falls inside the calibrated [Lower Bound, Upper Bound] conformal prediction interval.',
    engineeringImpact:
      'Measures whether the uncertainty bands calibrated on disjoint calibration engines hold reliably on unseen evaluation engines.',
  },
  interval_width: {
    id: 'interval_width',
    name: 'Prediction Interval Width',
    shortLabel: 'Interval Width',
    category: 'uncertainty',
    unit: 'cycles',
    direction: 'Narrower is sharper (while preserving coverage)',
    formulaHint: 'UB − LB = 2 × q̂ (before non-negativity clamping)',
    plainExplanation:
      'Total span in cycles between the upper and lower calibrated conformal bounds around a point RUL estimate.',
    engineeringImpact:
      'Directly controls conservatism: tighter bands reduce premature shop visits when the underlying predictor is accurate and regime-normalized.',
  },
  cost_per_cycle: {
    id: 'cost_per_cycle',
    name: 'Cost per Operating Cycle',
    shortLabel: 'Cost / Cycle',
    category: 'economics',
    unit: '$/cycle',
    direction: 'Lower is better',
    formulaHint: 'Σ Episode Costs / Σ Achieved Operating Cycles',
    plainExplanation:
      'Total maintenance and failure penalty expenditure across evaluated engines divided by total productive operating cycles achieved.',
    engineeringImpact:
      'Normalizes replacement timing tradeoffs onto one common unit-economic rate balancing early swaps against catastrophic failures.',
  },
  preventive_replacement: {
    id: 'preventive_replacement',
    name: 'Preventive Replacement',
    shortLabel: 'Preventive Swap',
    category: 'economics',
    unit: 'count / Cp ($)',
    direction: 'Prefer planned Cp over unplanned Cf',
    formulaHint: 'Action triggered while true RUL > 0 at cost Cp',
    plainExplanation:
      'Scheduled maintenance intervention executed before engine failure when the policy trigger (e.g., conformal lower bound ≤ τ) fires.',
    engineeringImpact:
      'Incurs the lower planned cost Cp instead of emergency failure cost Cf, at the tradeoff of forfeiting a small tail of remaining life.',
  },
  failure_rate: {
    id: 'failure_rate',
    name: 'Unplanned Failure Rate',
    shortLabel: 'Failure Rate',
    category: 'economics',
    unit: '% of units',
    direction: 'Lower is better (0.0% target)',
    formulaHint: '(Unplanned Failures / Evaluated Engines) × 100%',
    plainExplanation:
      'Percentage of evaluated engines that ran to failure before a maintenance policy triggered a preventive replacement.',
    engineeringImpact:
      'High failure rates quickly dominate total cost whenever unplanned failure penalty Cf greatly exceeds preventive cost Cp.',
  },
  wasted_useful_life: {
    id: 'wasted_useful_life',
    name: 'Wasted Useful Life',
    shortLabel: 'Wasted RUL',
    category: 'economics',
    unit: 'cycles',
    direction: 'Lower is better (without causing failures)',
    formulaHint: 'Mean remaining true cycles at preventive intervention',
    plainExplanation:
      'Average number of healthy operating cycles forfeited because preventive maintenance intervened earlier than the actual failure cycle.',
    engineeringImpact:
      'Quantifies over-conservatism: overly wide intervals or high triggers reduce failures toward 0% but retire engines too early.',
  },
};

export const METRIC_ORDER: MetricId[] = [
  'mae',
  'rmse',
  'phm08',
  'rul',
  'conformal_coverage',
  'interval_width',
  'cost_per_cycle',
  'preventive_replacement',
  'failure_rate',
  'wasted_useful_life',
];

export interface FleetSplitCounts {
  total: number;
  fit: number;
  calibration: number;
  tuning: number;
  evaluation: number;
}

export function getFleetSplitCounts(fleet: EngineTrajectory[]): FleetSplitCounts {
  const counts: FleetSplitCounts = {
    total: fleet.length,
    fit: 0,
    calibration: 0,
    tuning: 0,
    evaluation: 0,
  };
  for (const eng of fleet) {
    counts[eng.split] += 1;
  }
  return counts;
}

export interface MaintenanceConfigValidation {
  isValid: boolean;
  warnings: string[];
  costRatio: number;
}

export function validateMaintenanceConfig(params: {
  preventiveCost: number;
  failureCost: number;
  alpha: number;
  rulThreshold: number;
  fixedInterval?: number;
}): MaintenanceConfigValidation {
  const warnings: string[] = [];
  const cp = Number.isFinite(params.preventiveCost) ? params.preventiveCost : 0;
  const cf = Number.isFinite(params.failureCost) ? params.failureCost : 0;
  const alpha = Number.isFinite(params.alpha) ? params.alpha : 0.1;

  if (cp <= 0) {
    warnings.push('Preventive cost (Cp) must be greater than $0 to evaluate valid replacement economics.');
  }
  if (cf <= 0) {
    warnings.push('Failure penalty (Cf) must be greater than $0.');
  }
  if (cp > 0 && cf > 0 && cf <= cp) {
    warnings.push(
      `Failure penalty Cf ($${cf}) is not higher than preventive cost Cp ($${cp}): preventive maintenance cannot achieve positive net savings over run-to-failure.`,
    );
  }
  if (alpha <= 0 || alpha >= 0.5) {
    warnings.push(
      `Miscoverage α=${alpha.toFixed(2)} is outside the standard 0.02–0.25 calibration band.`,
    );
  }
  if (params.rulThreshold < 0) {
    warnings.push('RUL trigger threshold τ cannot be negative.');
  }

  const costRatio = cp > 0 && cf > 0 ? cf / cp : 0;
  return {
    isValid: cp > 0 && cf > 0 && warnings.length === 0,
    warnings,
    costRatio,
  };
}

function safeFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function formatRul(value: number, withUnit = true): string {
  const formatted = safeFinite(value).toFixed(1);
  return withUnit ? `${formatted} cyc` : formatted;
}

export function formatErrorMetric(value: number, withUnit = true): string {
  const formatted = safeFinite(value).toFixed(2);
  return withUnit ? `${formatted} cyc` : formatted;
}

export function formatPhm08(value: number): string {
  return safeFinite(value).toFixed(1);
}

export function formatCostPerCycle(value: number, withUnit = true): string {
  const v = safeFinite(value);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v).toFixed(3);
  return withUnit ? `${sign}$${abs}/cyc` : `${sign}$${abs}`;
}

export function formatPct(value: number, decimals = 1): string {
  return `${safeFinite(value).toFixed(decimals)}%`;
}

export function formatPearsonR(value: number): string {
  const v = safeFinite(value);
  const clean = Math.abs(v) < 0.0005 ? 0 : v;
  return `${clean >= 0 ? '+' : ''}${clean.toFixed(3)}`;
}

export function formatInterval(lower: number, upper: number, withUnit = true): string {
  const lb = safeFinite(lower).toFixed(1);
  const ub = safeFinite(upper).toFixed(1);
  return withUnit ? `[${lb}, ${ub}] cyc` : `[${lb}, ${ub}]`;
}
