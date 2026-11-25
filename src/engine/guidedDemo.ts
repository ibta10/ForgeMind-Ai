import type { ReviewerScenario } from './portfolio';
import type { ModelId, PageId, SubsetId } from './types';

export interface WorkbenchSimulationState {
  subset: SubsetId;
  selectedModel: ModelId;
  regimeAware: boolean;
  rulCap: number;
  rollingWindow: number;
  alpha: number;
  conformalMode: 'global' | 'rul_binned';
  seed: number;
  maintConfig: {
    preventiveCost: number;
    failureCost: number;
    fixedInterval: number;
    rulThreshold: number;
    riskMultiplier: number;
    autoTune: boolean;
  };
}

export const DEFAULT_WORKBENCH_STATE: WorkbenchSimulationState = {
  subset: 'FD002',
  selectedModel: 'gradient_boosting',
  regimeAware: true,
  rulCap: 125,
  rollingWindow: 15,
  alpha: 0.1,
  conformalMode: 'rul_binned',
  seed: 42,
  maintConfig: {
    preventiveCost: 100,
    failureCost: 600,
    fixedInterval: 155,
    rulThreshold: 20,
    riskMultiplier: 1.0,
    autoTune: true,
  },
};

export interface GuidedTourStep {
  id: string;
  stepNumber: number;
  title: string;
  targetPage: PageId;
  pageLabel: string;
  topicSummary: string;
  explanation: string;
  tryAction: string;
  recommendedSubset?: SubsetId;
  recommendedModel?: ModelId;
}

export const GUIDED_TOUR_STEPS: GuidedTourStep[] = [
  {
    id: 'orientation',
    stepNumber: 1,
    title: 'Workbench Orientation & Research Problem',
    targetPage: 'overview',
    pageLabel: 'Mission Overview',
    topicSummary: 'Why uncertainty quantification matters in predictive maintenance',
    explanation:
      'ForgeMind AI examines how split conformal uncertainty intervals turn noisy RUL point forecasts into cost-aware preventive maintenance decisions. Every displayed curve is computed live in-browser over seeded synthetic trajectories rather than pre-baked tables.',
    tryAction:
      'Use the top-right FD001–FD004 switcher at any time to recompute the entire pipeline across single- or multi-regime fleets.',
  },
  {
    id: 'subsets_and_telemetry',
    stepNumber: 2,
    title: 'Four C-MAPSS Subsets & Synthetic Sensor Telemetry',
    targetPage: 'datasets',
    pageLabel: 'Dataset Explorer',
    topicSummary: 'FD001–FD004 operating conditions and mulberry32 trajectory synthesis',
    explanation:
      'NASA C-MAPSS defines four canonical fault/regime profiles: FD001 (1 regime, 1 fault), FD002 (6 altitude/Mach/throttle regimes, 1 fault), FD003 (1 regime, 2 faults), and FD004 (6 regimes, 2 faults). For each subset, our deterministic generator simulates 48 units across 21 sensors (s1–s21) using seeded exponential damage growth partitioned strictly by unit ID (45% fit / 20% cal / 15% tune / 20% eval).',
    tryAction:
      'Switch between FD001 and FD002 below or via the Top Bar to compare 1-cluster static operation against 6-cluster k-means flight regimes.',
    recommendedSubset: 'FD002',
  },
  {
    id: 'surrogate_comparison',
    stepNumber: 3,
    title: 'Comparing Model-Family Surrogate Predictions',
    targetPage: 'benchmark',
    pageLabel: 'Model Benchmark',
    topicSummary: 'Ridge Linear, Random Forest, Histogram GBDT, and Causal Sequence ELM',
    explanation:
      'Four browser-native TypeScript model-family surrogates are fitted exclusively on fit-split engines and evaluated blind on held-out evaluation units. Compare MAE, RMSE, MAPE, and the asymmetric PHM08 score, which penalizes dangerous late predictions exponentially harder than conservative early predictions.',
    tryAction:
      'Toggle Scaling between Regime-Aware and Global, or open the Surrogate A/B Comparison tab to isolate feature scaling vs. model family impact.',
    recommendedSubset: 'FD002',
    recommendedModel: 'gradient_boosting',
  },
  {
    id: 'conformal_uncertainty',
    stepNumber: 4,
    title: 'Prediction Uncertainty & Split Conformal Intervals',
    targetPage: 'uncertainty',
    pageLabel: 'Robustness & Conformal',
    topicSummary: 'Distribution-free finite-sample intervals conditioned on RUL horizon',
    explanation:
      'Point estimates omit residual variance. Using the disjoint 9-unit calibration cohort, ForgeMind AI computes order-statistic residual quantiles q̂ at level ceil((n+1)(1−α))/n, producing interval bounds [L, U] whose width adapts across lifecycle RUL bins ([0–30, 31–60, 61–90, 91+]).',
    tryAction:
      'Adjust significance level α or switch between RUL-Binned Adaptive and Global Quantile modes to verify how empirical coverage tracks (1 − α).',
    recommendedSubset: 'FD002',
    recommendedModel: 'gradient_boosting',
  },
  {
    id: 'maintenance_policies',
    stepNumber: 5,
    title: 'Maintenance Policies & Parameter Response',
    targetPage: 'simulator',
    pageLabel: 'Decision Simulator',
    topicSummary: 'Run-to-Failure, Fixed Interval, RUL Threshold, Risk-Aware & Oracle',
    explanation:
      'Each policy replays cycle-by-cycle inspection decisions on the blind evaluation cohort. While Threshold acts on point predictions (risking costly failures when true degradation accelerates), Risk-Aware triggers maintenance when the lower conformal bound crosses its threshold, balancing preventive cost Cp against failure penalty Cf.',
    tryAction:
      'Vary Failure Cost (Cf), Preventive Cost (Cp), or Confidence (1 − α), or use the Side-by-Side Policy Comparator to observe live cost/cycle and failure-rate shifts.',
    recommendedSubset: 'FD002',
    recommendedModel: 'gradient_boosting',
  },
  {
    id: 'sensitivity_analysis',
    stepNumber: 6,
    title: 'Economic Cost Sensitivity Analysis',
    targetPage: 'sensitivity',
    pageLabel: 'Sensitivity Analysis',
    topicSummary: '2D cost grid and rotatable D3 3D surface over Cp × RUL threshold',
    explanation:
      'Optimal thresholds depend heavily on economics. This grid evaluates 72 (Preventive Cost × RUL Threshold) operating points over the live engine fleet, surfacing a 2D heatmap and interactive D3 3D surface to isolate the global minimum cost basin.',
    tryAction:
      'Drag the 3D cost surface to inspect slope sensitivity, or click any heatmap cell to apply that (Cp, Threshold) operating point straight into the Simulator.',
  },
  {
    id: 'export_reproducibility',
    stepNumber: 7,
    title: 'Configuration Export, Provenance & PDF Reports',
    targetPage: 'research',
    pageLabel: 'Research & Repro',
    topicSummary: 'Schema-validated JSON artifacts, 3-page PDF reports, and limitations',
    explanation:
      'Every parameter selection updates the deterministic run configuration, explicit data provenance ledger, and downloadable outputs. Export complete JSON artifacts (or import external JSON runs to switch the workbench into Imported Artifact mode) and generate 3-page PDF engineering summaries.',
    tryAction:
      'Inspect the Data Provenance matrix, copy a LinkedIn showcase summary, download the 3-page PDF report, or export the active JSON artifact.',
  },
];

export function buildScenarioWorkbenchState(
  scenario: ReviewerScenario,
  current: WorkbenchSimulationState,
): WorkbenchSimulationState {
  return {
    subset: scenario.subset,
    selectedModel: scenario.model,
    regimeAware: scenario.regimeAware,
    rulCap: scenario.rulCap ?? 125,
    rollingWindow: scenario.rollingWindow ?? 15,
    alpha: scenario.alpha,
    conformalMode: scenario.conformalMode ?? 'rul_binned',
    seed: scenario.seed ?? 42,
    maintConfig: {
      ...current.maintConfig,
      preventiveCost: scenario.preventiveCost,
      failureCost: scenario.failureCost,
      fixedInterval: DEFAULT_WORKBENCH_STATE.maintConfig.fixedInterval,
      rulThreshold: DEFAULT_WORKBENCH_STATE.maintConfig.rulThreshold,
      riskMultiplier: DEFAULT_WORKBENCH_STATE.maintConfig.riskMultiplier,
      autoTune: true,
    },
  };
}

export function getScenarioChangedFields(
  current: WorkbenchSimulationState,
  scenario: ReviewerScenario,
): string[] {
  const baseline = buildScenarioWorkbenchState(scenario, DEFAULT_WORKBENCH_STATE);
  const diffs: string[] = [];

  if (current.subset !== baseline.subset) diffs.push(`Subset (${current.subset} vs ${baseline.subset})`);
  if (current.selectedModel !== baseline.selectedModel) {
    diffs.push(`Model (${current.selectedModel} vs ${baseline.selectedModel})`);
  }
  if (current.regimeAware !== baseline.regimeAware) {
    diffs.push(`Scaling (${current.regimeAware ? 'Regime-Aware' : 'Global'})`);
  }
  if (Math.abs(current.alpha - baseline.alpha) > 1e-6) {
    diffs.push(`Alpha (${current.alpha.toFixed(2)} vs ${baseline.alpha.toFixed(2)})`);
  }
  if (current.conformalMode !== baseline.conformalMode) {
    diffs.push(`Conformal (${current.conformalMode})`);
  }
  if (current.maintConfig.preventiveCost !== baseline.maintConfig.preventiveCost) {
    diffs.push(`Cp ($${current.maintConfig.preventiveCost} vs $${baseline.maintConfig.preventiveCost})`);
  }
  if (current.maintConfig.failureCost !== baseline.maintConfig.failureCost) {
    diffs.push(`Cf ($${current.maintConfig.failureCost} vs $${baseline.maintConfig.failureCost})`);
  }
  if (current.maintConfig.autoTune !== baseline.maintConfig.autoTune) {
    diffs.push(`Auto-Tune (${current.maintConfig.autoTune ? 'On' : 'Manual'})`);
  }
  if (!current.maintConfig.autoTune && current.maintConfig.rulThreshold !== baseline.maintConfig.rulThreshold) {
    diffs.push(`Threshold (${current.maintConfig.rulThreshold})`);
  }
  if (current.seed !== baseline.seed) {
    diffs.push(`Seed (${current.seed} vs ${baseline.seed})`);
  }

  return diffs;
}

export function isDefaultWorkbenchState(current: WorkbenchSimulationState): boolean {
  return (
    current.subset === DEFAULT_WORKBENCH_STATE.subset &&
    current.selectedModel === DEFAULT_WORKBENCH_STATE.selectedModel &&
    current.regimeAware === DEFAULT_WORKBENCH_STATE.regimeAware &&
    current.rulCap === DEFAULT_WORKBENCH_STATE.rulCap &&
    current.rollingWindow === DEFAULT_WORKBENCH_STATE.rollingWindow &&
    Math.abs(current.alpha - DEFAULT_WORKBENCH_STATE.alpha) < 1e-6 &&
    current.conformalMode === DEFAULT_WORKBENCH_STATE.conformalMode &&
    current.seed === DEFAULT_WORKBENCH_STATE.seed &&
    current.maintConfig.preventiveCost === DEFAULT_WORKBENCH_STATE.maintConfig.preventiveCost &&
    current.maintConfig.failureCost === DEFAULT_WORKBENCH_STATE.maintConfig.failureCost &&
    current.maintConfig.fixedInterval === DEFAULT_WORKBENCH_STATE.maintConfig.fixedInterval &&
    current.maintConfig.rulThreshold === DEFAULT_WORKBENCH_STATE.maintConfig.rulThreshold &&
    current.maintConfig.riskMultiplier === DEFAULT_WORKBENCH_STATE.maintConfig.riskMultiplier &&
    current.maintConfig.autoTune === DEFAULT_WORKBENCH_STATE.maintConfig.autoTune
  );
}
