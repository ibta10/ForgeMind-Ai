export type SubsetId = 'FD001' | 'FD002' | 'FD003' | 'FD004';

export type ModelId = 'linear_regression' | 'random_forest' | 'gradient_boosting' | 'lstm';

export type PolicyId = 'run_to_failure' | 'fixed_interval' | 'threshold' | 'risk_aware' | 'oracle';

export type PageId =
  | 'overview'
  | 'datasets'
  | 'fleet'
  | 'health'
  | 'benchmark'
  | 'uncertainty'
  | 'simulator'
  | 'sensitivity'
  | 'features'
  | 'research';

export interface SubsetSpec {
  id: SubsetId;
  name: string;
  trainEngines: number;
  testEngines: number;
  conditions: number;
  faultModes: number;
  faultDescription: string;
  operatingProfile: string;
  minLife: number;
  medianLife: number;
  maxLife: number;
}

export interface SensorMeta {
  id: string;
  index: number;
  symbol: string;
  description: string;
  unit: string;
  trendDirection: 'up' | 'down' | 'flat';
}

export interface CycleTelemetry {
  cycle: number;
  os1: number;
  os2: number;
  os3: number;
  regime: number;
  trueRul: number;
  cappedRul: number;
  sensors: Record<string, number>;
  normalizedGlobal: Record<string, number>;
  normalizedRegime: Record<string, number>;
  rollingMean: Record<string, number>;
  rollingStd: Record<string, number>;
  rollingMeanGlobal: Record<string, number>;
  rollingStdGlobal: Record<string, number>;
}

export interface EngineTrajectory {
  engineId: number;
  subset: SubsetId;
  split: 'fit' | 'calibration' | 'tuning' | 'evaluation';
  failureCycle: number;
  faultMode: number;
  cycles: CycleTelemetry[];
}

export interface RegressionMetrics {
  mae: number;
  rmse: number;
  mse: number;
  mape: number;
  phm08: number;
  cappedMae: number;
  cappedRmse: number;
  cappedPhm08: number;
}

export interface ModelBenchmarkRow {
  subset: SubsetId;
  model: ModelId;
  modelLabel: string;
  preprocessing: 'global' | 'regime_aware';
  metrics: RegressionMetrics;
  trainTimeSec: number;
}

export interface ConformalBinSummary {
  binLabel: string;
  minPred: number;
  maxPred: number;
  qHat: number;
  empiricalCoverage: number;
  meanWidth: number;
  sampleCount: number;
}

export interface ConformalPoint {
  cycle: number;
  trueRul: number;
  predRul: number;
  lower: number;
  upper: number;
  covered: boolean;
  width: number;
}

export interface ConformalStudyResult {
  subset: SubsetId;
  model: ModelId;
  alpha: number;
  nominalCoverage: number;
  mode: 'global' | 'rul_binned';
  regimeAware: boolean;
  globalQHat: number;
  empiricalCoverage: number;
  meanWidth: number;
  bins: ConformalBinSummary[];
  sampleTrajectory: ConformalPoint[];
}

export interface MaintenanceParams {
  subset: SubsetId;
  model: ModelId;
  preventiveCost: number;
  failureCost: number;
  alpha: number;
  fixedInterval: number;
  rulThreshold: number;
  riskMultiplier: number;
  regimeAware: boolean;
  autoTune: boolean;
  seed: number;
}

export interface EpisodeOutcome {
  engineId: number;
  policy: PolicyId;
  failureCycle: number;
  actionCycle: number;
  failed: boolean;
  cost: number;
  operatingCycles: number;
  wastedRul: number;
}

export interface PolicySummary {
  policy: PolicyId;
  label: string;
  tunedParamLabel: string;
  meanCostPerCycle: number;
  ciLower: number;
  ciUpper: number;
  totalCost: number;
  totalCycles: number;
  preventiveCount: number;
  failureCount: number;
  failureRatePct: number;
  meanWastedRul: number;
  episodes: EpisodeOutcome[];
}

export interface SensitivityPoint {
  costRatio: number;
  failureCost: number;
  fixedCostPerCycle: number;
  thresholdCostPerCycle: number;
  riskAwareCostPerCycle: number;
  oracleCostPerCycle: number;
}

export interface ThresholdCostSurfaceCell {
  rulThreshold: number;
  preventiveCost: number;
  riskAwareCostPerCycle: number;
  riskAwareFailureRatePct: number;
  riskAwareWastedRul: number;
  thresholdCostPerCycle: number;
  thresholdFailureRatePct: number;
  thresholdWastedRul: number;
  advantagePct: number;
}

export interface ThresholdCostSurfaceResult {
  thresholds: number[];
  preventiveCosts: number[];
  cells: ThresholdCostSurfaceCell[];
  optimalRiskByCost: Record<number, { rulThreshold: number; costPerCycle: number; failureRatePct: number }>;
  optimalThresholdByCost: Record<number, { rulThreshold: number; costPerCycle: number; failureRatePct: number }>;
}

export interface FeatureDiagnostic {
  sensorId: string;
  symbol: string;
  description: string;
  unit: string;
  variance: number;
  withinRegimeVariance: number;
  correlationWithRul: number;
  importanceScore: number;
  isConstant: boolean;
}

export interface ExperimentProvenance {
  simulation_mode: 'synthetic_surrogate' | 'imported_external';
  uses_raw_nasa_files: boolean;
  data_generator: string;
  surrogate_models_note: string;
  genuinely_implemented: string[];
  simulated_components: string[];
  limitations: string[];
  safety_disclaimer: string;
}

export interface ExperimentArtifact {
  experiment_id: string;
  timestamp: string;
  source: 'synthetic_demo' | 'imported_file';
  subset: SubsetId;
  model: ModelId;
  config: {
    rul_cap: number;
    rolling_window: number;
    regime_aware: boolean;
    conformal_mode: 'global' | 'rul_binned';
    alpha: number;
    preventive_cost: number;
    failure_cost: number;
    seed: number;
  };
  metrics: RegressionMetrics;
  uncertainty: {
    nominal_coverage: number;
    empirical_coverage: number;
    mean_width: number;
    global_q_hat: number;
  };
  policies: Array<{
    policy: PolicyId;
    label: string;
    cost_per_cycle: number;
    ci_95: [number, number];
    failure_rate_pct: number;
    mean_wasted_rul: number;
  }>;
  provenance?: ExperimentProvenance;
}

export interface AbVariantConfig {
  model: ModelId;
  regimeAware: boolean;
}

export interface AbVariantResult {
  config: AbVariantConfig;
  modelLabel: string;
  scalingLabel: string;
  metrics: RegressionMetrics;
  trainTimeSec: number;
  conformal: {
    empiricalCoverage: number;
    meanWidth: number;
    globalQHat: number;
  };
  maintenance: {
    riskAwareCostPerCycle: number;
    riskAwareFailureRatePct: number;
    riskAwareWastedRul: number;
    thresholdCostPerCycle: number;
    thresholdFailureRatePct: number;
    thresholdWastedRul: number;
    oracleCostPerCycle: number;
    tunedRiskThreshold: number;
    tunedPointThreshold: number;
  };
  sampleTrajectory: {
    engineId: number;
    cycles: number[];
    targetRul: number[];
    uncappedRul: number[];
    predRul: number[];
    absError: number[];
  };
}

export interface AbComparisonResult {
  subset: SubsetId;
  evalEngineId: number;
  variantA: AbVariantResult;
  variantB: AbVariantResult;
  deltas: {
    rmseDelta: number;
    rmsePct: number;
    maeDelta: number;
    phm08Delta: number;
    phm08Pct: number;
    riskCostDelta: number;
    riskCostPct: number;
    thresholdCostDelta: number;
    failureRateDelta: number;
    wastedRulDelta: number;
    savingsPer100kCycles: number;
  };
}

export interface MaintenanceRoiEpisodePoint {
  step: number;
  engineId: number;
  cumulativeCycles: number;
  cumulativeSavings: number;
  cumulativeBaselineSpend: number;
  cumulativePolicySpend: number;
  episodeSavings: number;
  failed: boolean;
}

export interface MaintenanceRoiPolicySummary {
  policy: PolicyId;
  label: string;
  costPerCycle: number;
  baselineCostPerCycle: number;
  costReductionPct: number;
  roiPct: number;
  savingsPer10kCycles: number;
  baselineSpendPer10kCycles: number;
  policySpendPer10kCycles: number;
  realizedEvalSavings: number;
  avoidedFailures: number;
  failureRatePct: number;
  episodesSeries: MaintenanceRoiEpisodePoint[];
}

export interface MaintenanceRoiResult {
  baselinePolicy: PolicyId;
  baselineLabel: string;
  baselineCostPerCycle: number;
  baselineSpendPer10kCycles: number;
  baselineTotalCost: number;
  baselineFailureCount: number;
  evalEngineCount: number;
  policies: MaintenanceRoiPolicySummary[];
}

export interface PolicyComparisonConfig {
  policy: PolicyId;
  model: ModelId;
  regimeAware: boolean;
  alpha: number;
  autoTune: boolean;
  rulThreshold: number;
  fixedInterval: number;
}

export interface PolicyConfigurationEvaluation {
  config: PolicyComparisonConfig;
  summary: PolicySummary;
  preventiveSpend: number;
  failureSpend: number;
  effectiveParamLabel: string;
}

export interface PolicyComparisonResult {
  evalEngineCount: number;
  preventiveCost: number;
  failureCost: number;
  resultA: PolicyConfigurationEvaluation;
  resultB: PolicyConfigurationEvaluation;
  deltas: {
    totalCostDelta: number;
    totalCostPct: number;
    costPerCycleDelta: number;
    costPerCyclePct: number;
    failureRateDelta: number;
    failureCountDelta: number;
    wastedRulDelta: number;
    preventiveSpendDelta: number;
    failureSpendDelta: number;
  };
}

