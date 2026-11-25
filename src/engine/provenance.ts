import type { ExperimentArtifact, ExperimentProvenance, ModelId } from './types';

export const PROTOTYPE_SAFETY_WARNING =
  'Research Prototype Only: ForgeMind AI is an academic and methodological simulation workbench. It is NOT a certified aviation, industrial safety, or operational maintenance decision system and must not be used to authorize equipment dispatch, inspection intervals, or safety-critical maintenance actions.';

export const SURROGATE_BENCHMARK_DISCLOSURE =
  'No raw NASA C-MAPSS .txt files are loaded, and no offline PyTorch, TensorFlow, or scikit-learn models are trained or evaluated in this browser application. All benchmark rows compare lightweight TypeScript model-family surrogates fitted exclusively on deterministic C-MAPSS-shaped synthetic trajectories.';

export const MODEL_SURROGATE_DETAILS: Record<
  ModelId,
  {
    surrogateLabel: string;
    familyApproximated: string;
    browserImplementation: string;
  }
> = {
  linear_regression: {
    surrogateLabel: 'Ridge Linear (Surrogate)',
    familyApproximated: 'Regularized Linear Baseline',
    browserImplementation:
      'Exact L2-penalized Ridge OLS closed-form solver on normalized fit-split sensor readings (sampled every 2nd cycle).',
  },
  random_forest: {
    surrogateLabel: 'Random Forest (Surrogate)',
    familyApproximated: 'Bagged Decision Tree Ensemble',
    browserImplementation:
      '14 bootstrapped depth-5 quantile-split regression trees trained on causal rolling means, lags, and rolling stds.',
  },
  gradient_boosting: {
    surrogateLabel: 'Histogram GBDT (Surrogate)',
    familyApproximated: 'Gradient Boosted Regression Trees',
    browserImplementation:
      '28-stage additive residual trees (depth-4, L2 leaf regularization, learning rate 0.18) over quantile-binned causal features.',
  },
  lstm: {
    surrogateLabel: 'Causal Sequence ELM (w=30 Surrogate)',
    familyApproximated: 'Recurrent / Sequence Neural Baseline',
    browserImplementation:
      '30-cycle causal EWMA + multi-lag temporal encoder feeding a fixed tanh random-projection hidden layer with Ridge readout (no backpropagation).',
  },
};

export interface DatasetProvenanceEntry {
  id: string;
  datasetName: string;
  originType: 'literature_reference' | 'synthetic_generator' | 'browser_surrogate' | 'external_import';
  originLabel: string;
  usesRawNasaFiles: boolean;
  sampleScope: string;
  summary: string;
  limitations: string;
}

export const DATASET_PROVENANCE_CATALOG: DatasetProvenanceEntry[] = [
  {
    id: 'nasa_reference',
    datasetName: 'NASA C-MAPSS Reference Specs (FD001–FD004)',
    originType: 'literature_reference',
    originLabel: 'Literature Metadata Only',
    usesRawNasaFiles: false,
    sampleScope: 'FD001 (100/100), FD002 (260/259), FD003 (100/100), FD004 (249/248)',
    summary:
      'Official unit counts, operating condition counts, fault-mode counts, and run-to-failure life bounds cited from Saxena et al. (PHM 2008) for structural context.',
    limitations:
      'Only static metadata constants are stored; raw NASA time-series sensor tables are not distributed or parsed in the browser.',
  },
  {
    id: 'synthetic_cohort',
    datasetName: 'In-Browser Synthetic Turbofan Cohort',
    originType: 'synthetic_generator',
    originLabel: 'Seeded Synthetic Generator',
    usesRawNasaFiles: false,
    sampleScope: '48 engines per subset (22 fit / 9 cal / 7 tune / 10 eval)',
    summary:
      'Deterministic mulberry32-seeded exponential damage propagation across 21 modeled channels (s1–s21) and 1 or 6 flight regimes (OS1–OS3).',
    limitations:
      'Idealized Gaussian sensor noise and multi-cycle sortie blocks omit real-world sensor dropouts, unmodeled repairs, and empirical NASA test truncation.',
  },
  {
    id: 'surrogate_models',
    datasetName: 'Model-Family Surrogate Predictions & Benchmark',
    originType: 'browser_surrogate',
    originLabel: 'TypeScript In-Browser Surrogates',
    usesRawNasaFiles: false,
    sampleScope: '4 model-family surrogates fitted per subset & scaling mode',
    summary:
      'Lightweight browser-native estimators trained strictly on synthetic fit-split rows using causal features without label leakage.',
    limitations:
      'Approximates comparative inductive biases (linear vs. bagged trees vs. boosted trees vs. causal sequence memory) rather than full-scale PyTorch/LightGBM benchmarks.',
  },
  {
    id: 'conformal_episodes',
    datasetName: 'Conformal Intervals & Maintenance Episodes',
    originType: 'browser_surrogate',
    originLabel: 'Exact Math on Synthetic Splits',
    usesRawNasaFiles: false,
    sampleScope: 'Calibration split (9 units) · Tuning split (7 units) · Eval split (10 units)',
    summary:
      'Finite-sample split conformal quantiles, episode cost stepping, and 350-resample bootstrap 95% confidence intervals executed over synthetic trajectories.',
    limitations:
      'Small finite evaluation cohorts increase discrete jumpiness in failure rates; simplified single-unit Cp/Cf economics omit logistics and spare-parts delays.',
  },
  {
    id: 'imported_artifact',
    datasetName: 'Imported External Experiment Artifact (JSON)',
    originType: 'external_import',
    originLabel: 'User-Supplied JSON Payload',
    usesRawNasaFiles: false,
    sampleScope: 'Single validated ExperimentArtifact summary schema',
    summary:
      'Externally supplied benchmark summary JSON validated strictly on upload to populate Overview KPIs, LinkedIn cards, JSON, and PDF exports.',
    limitations:
      'Imported files supply aggregate metrics, conformal summaries, and policy costs only; interactive per-engine telemetry and sensitivity plots continue using the local synthetic fleet.',
  },
];

export interface ImplementationBoundaryItem {
  category: 'simulated' | 'implemented';
  title: string;
  detail: string;
}

export const IMPLEMENTATION_BOUNDARY_ITEMS: ImplementationBoundaryItem[] = [
  {
    category: 'simulated',
    title: 'Synthetic Engine Trajectories (s1–s21, OS1–OS3)',
    detail:
      'Generated deterministically in-browser using seeded exponential damage growth calibrated to C-MAPSS subset profiles rather than read from raw NASA files.',
  },
  {
    category: 'simulated',
    title: 'Model-Family Surrogate Estimators',
    detail:
      'In-browser TypeScript Ridge, 14-tree RF, 28-tree GBDT, and 32-unit tanh Sequence ELM surrogates replace offline Python/PyTorch training pipelines.',
  },
  {
    category: 'simulated',
    title: 'Cohort Size & Maintenance Cost Units',
    detail:
      'Evaluated on 48 synthetic units per subset with stylized preventive (Cp) and failure (Cf) cost ratios plus 1-cycle-to-1-day calendar previews.',
  },
  {
    category: 'implemented',
    title: 'Leak-Free Engine-Disjoint Splits & Fit-Only Preprocessing',
    detail:
      '12-iteration k-means regime clustering, min-max scalers, feature importance, and estimators are strictly isolated from calibration, tuning, and evaluation units.',
  },
  {
    category: 'implemented',
    title: 'Causal Rolling Statistics & Scoring Metrics',
    detail:
      'Exact trailing rolling mean/std, MAE, RMSE, MAPE, capped targets, and asymmetric PHM08 late-prediction exponential scores are computed mathematically.',
  },
  {
    category: 'implemented',
    title: 'Split Conformal Calibration, Episode Replay & Bootstrap CIs',
    detail:
      'Exact finite-sample order-statistic quantiles ceil((n+1)(1-α))/n, per-engine threshold/conformal trigger stepping, 350-resample 95% CIs, 10-pt OLS extrapolation, and D3 3D surface optimization.',
  },
];

export const RESEARCH_LIMITATIONS: Array<{ title: string; description: string }> = [
  {
    title: '1. Synthetic Trajectory Idealization (Not Raw NASA Telemetry)',
    description:
      'The generator models smooth exponential degradation with stationary Gaussian noise and clean 3–7 cycle flight-regime holds. Real turbofan fleets exhibit sensor drift jumps, missing cycles, maintenance resets, and multimodal manufacturing variance.',
  },
  {
    title: '2. Reduced 48-Unit Fleet Scale & Discrete Episode Variance',
    description:
      'Browser responsiveness constrains each subset to 48 units (22 fit / 9 calibration / 7 tuning / 10 evaluation), roughly one-fifth the size of NASA FD002/FD004. Single-engine threshold flips on a 10-unit evaluation split shift failure rates in 10% increments.',
  },
  {
    title: '3. Lightweight Surrogate Estimators vs. Production ML',
    description:
      'The Causal Sequence ELM uses causal EWMA/lags with random tanh projections and Ridge readout rather than gradient-trained LSTM/Transformer weights; tree ensembles use fixed shallow depths for sub-second interactive execution.',
  },
  {
    title: '4. Split Conformal Exchangeability Assumption',
    description:
      'Finite-sample coverage guarantees hold when calibration and evaluation engine residuals are exchangeable. Severe operating-regime shifts, aging drift, or out-of-distribution fault modes can degrade empirical interval coverage.',
  },
  {
    title: '5. Simplified Maintenance Cost & Single-Asset Economics',
    description:
      'Episode simulation compares stylized preventive (Cp) vs. unplanned failure (Cf) penalties on independent single-engine lifetimes, omitting turnaround lead times, inspection false positives, hangar capacity, and fleet-wide dispatch scheduling.',
  },
];

export function buildArtifactProvenance(
  source: ExperimentArtifact['source'],
  importedExperimentId?: string,
): ExperimentProvenance {
  const isSynthetic = source === 'synthetic_demo';
  return {
    simulation_mode: isSynthetic ? 'synthetic_surrogate' : 'imported_external',
    uses_raw_nasa_files: false,
    data_generator: isSynthetic
      ? 'In-browser seeded synthetic C-MAPSS-shaped turbofan generator (48 units/subset, mulberry32 PRNG)'
      : `Externally imported benchmark artifact (${importedExperimentId ?? 'uploaded_json'})`,
    surrogate_models_note: SURROGATE_BENCHMARK_DISCLOSURE,
    genuinely_implemented: IMPLEMENTATION_BOUNDARY_ITEMS.filter((i) => i.category === 'implemented').map(
      (i) => `${i.title}: ${i.detail}`,
    ),
    simulated_components: IMPLEMENTATION_BOUNDARY_ITEMS.filter((i) => i.category === 'simulated').map(
      (i) => `${i.title}: ${i.detail}`,
    ),
    limitations: RESEARCH_LIMITATIONS.map((l) => `${l.title} — ${l.description}`),
    safety_disclaimer: PROTOTYPE_SAFETY_WARNING,
  };
}
