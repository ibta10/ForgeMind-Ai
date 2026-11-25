import { MODEL_LABELS } from './models';
import { buildArtifactProvenance, PROTOTYPE_SAFETY_WARNING } from './provenance';
import type {
  ConformalPoint,
  ExperimentArtifact,
  ModelId,
  PageId,
  PolicyId,
  SubsetId,
} from './types';

const VALID_PAGES: PageId[] = [
  'overview',
  'datasets',
  'fleet',
  'health',
  'features',
  'benchmark',
  'uncertainty',
  'simulator',
  'sensitivity',
  'research',
];
const VALID_SUBSETS: SubsetId[] = ['FD001', 'FD002', 'FD003', 'FD004'];
const VALID_MODELS: ModelId[] = [
  'linear_regression',
  'random_forest',
  'gradient_boosting',
  'lstm',
];
const VALID_POLICIES: PolicyId[] = [
  'run_to_failure',
  'fixed_interval',
  'threshold',
  'risk_aware',
  'oracle',
];

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validates and normalizes an uploaded JSON experiment artifact.
 * Rejects corrupt, incomplete, or mismatched schemas with a clear error message.
 */
export function parseAndValidateExperimentArtifact(rawText: string): {
  artifact?: ExperimentArtifact;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { error: 'Invalid JSON syntax. Select a well-formed ForgeMind experiment artifact.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'Artifact root must be a JSON object.' };
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.experiment_id !== 'string' || obj.experiment_id.trim().length === 0) {
    return { error: 'Missing required string field: experiment_id.' };
  }
  if (!VALID_SUBSETS.includes(obj.subset as SubsetId)) {
    return { error: 'Invalid or missing subset (expected FD001, FD002, FD003, or FD004).' };
  }
  if (!VALID_MODELS.includes(obj.model as ModelId)) {
    return {
      error:
        'Invalid or missing model (expected linear_regression, random_forest, gradient_boosting, or lstm).',
    };
  }

  const cfg = obj.config as Record<string, unknown> | undefined;
  if (!cfg || typeof cfg !== 'object') {
    return { error: 'Missing required config object.' };
  }
  if (
    !isFiniteNum(cfg.rul_cap) ||
    cfg.rul_cap < 25 ||
    cfg.rul_cap > 300 ||
    !isFiniteNum(cfg.rolling_window) ||
    cfg.rolling_window < 2 ||
    cfg.rolling_window > 60 ||
    typeof cfg.regime_aware !== 'boolean' ||
    (cfg.conformal_mode !== 'global' && cfg.conformal_mode !== 'rul_binned') ||
    !isFiniteNum(cfg.alpha) ||
    cfg.alpha <= 0 ||
    cfg.alpha >= 0.5 ||
    !isFiniteNum(cfg.preventive_cost) ||
    cfg.preventive_cost <= 0 ||
    !isFiniteNum(cfg.failure_cost) ||
    cfg.failure_cost <= 0 ||
    !isFiniteNum(cfg.seed)
  ) {
    return { error: 'Artifact config fields fail schema bounds (rul_cap, rolling_window, alpha, costs, seed).' };
  }

  const metrics = obj.metrics as Record<string, unknown> | undefined;
  if (
    !metrics ||
    typeof metrics !== 'object' ||
    !isFiniteNum(metrics.mae) ||
    !isFiniteNum(metrics.rmse) ||
    !isFiniteNum(metrics.mse) ||
    !isFiniteNum(metrics.mape) ||
    !isFiniteNum(metrics.phm08) ||
    !isFiniteNum(metrics.cappedMae) ||
    !isFiniteNum(metrics.cappedRmse) ||
    !isFiniteNum(metrics.cappedPhm08)
  ) {
    return { error: 'Artifact metrics object is missing required numeric regression/PHM08 scores.' };
  }

  const unc = obj.uncertainty as Record<string, unknown> | undefined;
  if (
    !unc ||
    typeof unc !== 'object' ||
    !isFiniteNum(unc.nominal_coverage) ||
    !isFiniteNum(unc.empirical_coverage) ||
    !isFiniteNum(unc.mean_width) ||
    !isFiniteNum(unc.global_q_hat)
  ) {
    return { error: 'Artifact uncertainty object is missing required conformal coverage/width metrics.' };
  }

  if (!Array.isArray(obj.policies) || obj.policies.length === 0) {
    return { error: 'Artifact policies must be a non-empty array of evaluated maintenance policies.' };
  }

  const validatedPolicies: ExperimentArtifact['policies'] = [];
  for (const item of obj.policies) {
    if (!item || typeof item !== 'object') {
      return { error: 'Each policy entry must be a structured object.' };
    }
    const p = item as Record<string, unknown>;
    if (
      !VALID_POLICIES.includes(p.policy as PolicyId) ||
      typeof p.label !== 'string' ||
      !isFiniteNum(p.cost_per_cycle) ||
      !Array.isArray(p.ci_95) ||
      p.ci_95.length !== 2 ||
      !isFiniteNum(p.ci_95[0]) ||
      !isFiniteNum(p.ci_95[1]) ||
      !isFiniteNum(p.failure_rate_pct) ||
      !isFiniteNum(p.mean_wasted_rul)
    ) {
      return { error: 'One or more policy entries contain invalid policy IDs, costs, or CI bounds.' };
    }
    validatedPolicies.push({
      policy: p.policy as PolicyId,
      label: p.label,
      cost_per_cycle: p.cost_per_cycle,
      ci_95: [p.ci_95[0], p.ci_95[1]],
      failure_rate_pct: p.failure_rate_pct,
      mean_wasted_rul: p.mean_wasted_rul,
    });
  }

  const timestamp =
    typeof obj.timestamp === 'string' && !Number.isNaN(Date.parse(obj.timestamp))
      ? obj.timestamp
      : new Date().toISOString();

  const defaultProvenance = buildArtifactProvenance('imported_file', obj.experiment_id.trim());
  const rawProv = obj.provenance as Record<string, unknown> | undefined;
  const normalizedProvenance =
    rawProv && typeof rawProv === 'object' && !Array.isArray(rawProv)
      ? {
          simulation_mode: 'imported_external' as const,
          uses_raw_nasa_files:
            typeof rawProv.uses_raw_nasa_files === 'boolean' ? rawProv.uses_raw_nasa_files : false,
          data_generator:
            typeof rawProv.data_generator === 'string' && rawProv.data_generator.trim().length > 0
              ? rawProv.data_generator.trim()
              : defaultProvenance.data_generator,
          surrogate_models_note:
            typeof rawProv.surrogate_models_note === 'string' && rawProv.surrogate_models_note.trim().length > 0
              ? rawProv.surrogate_models_note.trim()
              : defaultProvenance.surrogate_models_note,
          genuinely_implemented: Array.isArray(rawProv.genuinely_implemented)
            ? rawProv.genuinely_implemented.filter((x): x is string => typeof x === 'string')
            : defaultProvenance.genuinely_implemented,
          simulated_components: Array.isArray(rawProv.simulated_components)
            ? rawProv.simulated_components.filter((x): x is string => typeof x === 'string')
            : defaultProvenance.simulated_components,
          limitations: Array.isArray(rawProv.limitations)
            ? rawProv.limitations.filter((x): x is string => typeof x === 'string')
            : defaultProvenance.limitations,
          safety_disclaimer:
            typeof rawProv.safety_disclaimer === 'string' && rawProv.safety_disclaimer.trim().length > 0
              ? rawProv.safety_disclaimer.trim()
              : PROTOTYPE_SAFETY_WARNING,
        }
      : defaultProvenance;

  return {
    artifact: {
      experiment_id: obj.experiment_id.trim(),
      timestamp,
      source: 'imported_file',
      subset: obj.subset as SubsetId,
      model: obj.model as ModelId,
      config: {
        rul_cap: cfg.rul_cap,
        rolling_window: Math.round(cfg.rolling_window),
        regime_aware: cfg.regime_aware,
        conformal_mode: cfg.conformal_mode,
        alpha: cfg.alpha,
        preventive_cost: cfg.preventive_cost,
        failure_cost: cfg.failure_cost,
        seed: Math.round(cfg.seed),
      },
      metrics: {
        mae: metrics.mae,
        rmse: metrics.rmse,
        mse: metrics.mse,
        mape: metrics.mape,
        phm08: metrics.phm08,
        cappedMae: metrics.cappedMae,
        cappedRmse: metrics.cappedRmse,
        cappedPhm08: metrics.cappedPhm08,
      },
      uncertainty: {
        nominal_coverage: unc.nominal_coverage,
        empirical_coverage: unc.empirical_coverage,
        mean_width: unc.mean_width,
        global_q_hat: unc.global_q_hat,
      },
      policies: validatedPolicies,
      provenance: normalizedProvenance,
    },
  };
}

export function parseUrlState(search: string): {
  page?: PageId;
  subset?: SubsetId;
  model?: ModelId;
} {
  const params = new URLSearchParams(search);
  const rawPage = params.get('page') as PageId | null;
  const rawSubset = params.get('subset') as SubsetId | null;
  const rawModel = params.get('model') as ModelId | null;

  return {
    page: rawPage && VALID_PAGES.includes(rawPage) ? rawPage : undefined,
    subset: rawSubset && VALID_SUBSETS.includes(rawSubset) ? rawSubset : undefined,
    model: rawModel && VALID_MODELS.includes(rawModel) ? rawModel : undefined,
  };
}

export function buildShareableUrl(
  origin: string,
  pathname: string,
  state: { page: PageId; subset: SubsetId; model: ModelId },
): string {
  const params = new URLSearchParams();
  if (state.page !== 'overview') params.set('page', state.page);
  params.set('subset', state.subset);
  params.set('model', state.model);
  const qs = params.toString();
  return `${origin}${pathname}${qs ? `?${qs}` : ''}`;
}

export interface ReviewerScenario {
  id: string;
  title: string;
  subtitle: string;
  targetPage: PageId;
  subset: SubsetId;
  model: ModelId;
  regimeAware: boolean;
  preventiveCost: number;
  failureCost: number;
  alpha: number;
  conformalMode?: 'global' | 'rul_binned';
  rulCap?: number;
  rollingWindow?: number;
  seed?: number;
  investigationFocus: string;
  suggestedExperiments: string[];
}

export const REVIEWER_SCENARIOS: ReviewerScenario[] = [
  {
    id: 'multi_regime_stress',
    title: 'Multi-Regime Decision Study',
    subtitle: 'FD002 (6 flight regimes) · Histogram GBDT · 90% RUL-binned conformal',
    targetPage: 'simulator',
    subset: 'FD002',
    model: 'gradient_boosting',
    regimeAware: true,
    preventiveCost: 100,
    failureCost: 600,
    alpha: 0.1,
    conformalMode: 'rul_binned',
    rulCap: 125,
    rollingWindow: 15,
    seed: 42,
    investigationFocus:
      'Compare Risk-Aware Conformal against the point-estimate RUL Threshold policy under 6 shifting flight regimes. Notice how conformal safety margins suppress unplanned failures while keeping cycle-normalized cost near the Oracle lower bound.',
    suggestedExperiments: [
      'Toggle Regime-Aware Scaling off to observe how mixing 6 flight conditions degrades threshold stability.',
      'Increase Failure Penalty (Cf) from $600 to $1,200 to test when conservative lower conformal bounds outperform.',
      'Use the Side-by-Side Policy Comparator below to isolate Threshold vs. Risk-Aware wasted RUL.',
    ],
  },
  {
    id: 'high_failure_penalty',
    title: 'High Failure Penalty (12×)',
    subtitle: 'FD004 (6 regimes, 2 fault modes) · Cf=$1200 vs Cp=$100 · Risk-Aware vs Threshold',
    targetPage: 'simulator',
    subset: 'FD004',
    model: 'lstm',
    regimeAware: true,
    preventiveCost: 100,
    failureCost: 1200,
    alpha: 0.08,
    conformalMode: 'rul_binned',
    rulCap: 125,
    rollingWindow: 15,
    seed: 42,
    investigationFocus:
      'Investigate the dual-fault FD004 fleet when unplanned failure costs 12× preventive replacement (Cf=$1,200 vs. Cp=$100). Observe how a tighter α=0.08 (92% confidence) penalizes late threshold triggers and widens the cost advantage of uncertainty-aware scheduling.',
    suggestedExperiments: [
      'Switch Predictor Surrogate from Causal Sequence ELM to Ridge Linear to watch linear bias trigger late failures.',
      'Adjust Preventive Cost (Cp) upward toward $250 to inspect how maintenance margins compress.',
      'Toggle Auto-Tune Thresholds off and adjust RUL Threshold manually to see trade-offs vs. wasted RUL.',
    ],
  },
  {
    id: 'conformal_calibration',
    title: 'Adaptive Conformal Bands',
    subtitle: 'Inspect RUL-binned uncertainty intervals narrowing near end-of-life on FD002',
    targetPage: 'uncertainty',
    subset: 'FD002',
    model: 'gradient_boosting',
    regimeAware: true,
    preventiveCost: 100,
    failureCost: 600,
    alpha: 0.1,
    conformalMode: 'rul_binned',
    rulCap: 125,
    rollingWindow: 15,
    seed: 42,
    investigationFocus:
      'Inspect how RUL-binned split conformal calibration adapts interval half-widths q̂ across [0–30, 31–60, 61–90, 91+] cycle horizons. Tighter intervals near low RUL preserve safety without triggering excessively early preventive removals.',
    suggestedExperiments: [
      'Switch Conformal Mode between RUL-Binned Adaptive and Global Quantile to compare bin-level coverage.',
      'Drag Significance α between 0.05 (95% target) and 0.20 (80% target) to watch band width and empirical coverage respond.',
      'Disable Regime-Aware Scaling to observe conformal interval inflation when flight regimes are unnormalized.',
    ],
  },
];

export interface LinkedInShowcaseCopy {
  projectTitle: string;
  projectDescription: string;
  skills: string[];
  postDraft: string;
  bibtex: string;
}

export function buildLinkedInProjectSummary(
  artifact: ExperimentArtifact,
  liveUrl = 'https://github.com/Ibtasham/ForgeMind-Ai',
): LinkedInShowcaseCopy {
  const riskPolicy = artifact.policies.find((p) => p.policy === 'risk_aware');
  const thresholdPolicy = artifact.policies.find((p) => p.policy === 'threshold');

  const isSynthetic = artifact.source === 'synthetic_demo';
  const sourceQualifier = isSynthetic
    ? 'Runs deterministically in-browser via seeded synthetic C-MAPSS-shaped turbofan degradation trajectories and lightweight TypeScript model-family surrogates (no raw NASA files or offline ML training), with support for importing external experiment JSON artifacts. Research prototype only; not an operational safety system.'
    : `Loaded imported external artifact ${artifact.experiment_id} (${artifact.subset}, ${MODEL_LABELS[artifact.model]}), visually separated from local synthetic simulations.`;

  const projectTitle =
    'ForgeMind AI — Uncertainty-Aware Predictive Maintenance Research Platform';

  const projectDescription = [
    'Built an interactive predictive maintenance research platform and telemetry workbench investigating whether split conformal prediction intervals reduce simulated maintenance costs under changing operating conditions (synthetic C-MAPSS-shaped FD001–FD004 regime profiles).',
    '',
    'Key Engineering Architecture:',
    '• Regime-Aware Preprocessing: k-means clustering on 3 operating settings (OS1–OS3) with per-regime min-max scaling and causal rolling window features fitted strictly on fit-split engines.',
    '• Leak-Free Model-Family Surrogates & PHM08 Scoring: Ridge Linear, Random Forest, Histogram GBDT, and Causal Sequence ELM (w=30) surrogates fitted strictly on fit-split data and evaluated on MAE, RMSE, and asymmetric PHM08 late-prediction penalties.',
    '• RUL-Binned Conformal Calibration: Finite-sample split conformal quantiles conditioned on predicted RUL bins across engine-disjoint fit / calibration / tuning / evaluation splits.',
    '• Per-Engine Maintenance Decision Study: Evaluates Run-to-Failure, Fixed Interval, RUL Threshold, Risk-Aware (lower conformal bound), and Oracle policies via cost per operating cycle and 95% bootstrap confidence intervals.',
    '',
    sourceQualifier,
  ].join('\n');

  const skills = [
    'Predictive Maintenance',
    'Conformal Prediction',
    'Uncertainty Quantification',
    'Time-Series Forecasting',
    'TypeScript',
    'React',
    'D3.js',
    'Scientific Computing',
    'Risk-Aware Optimization',
    'Reliability Engineering',
  ];

  const simSnapshotLine =
    riskPolicy && thresholdPolicy
      ? `In the ${artifact.subset} (${isSynthetic ? 'synthetic simulation' : 'imported external artifact'}) run: Risk-Aware Conformal achieved $${riskPolicy.cost_per_cycle.toFixed(3)}/cycle (${riskPolicy.failure_rate_pct.toFixed(0)}% failure rate) vs. $${thresholdPolicy.cost_per_cycle.toFixed(3)}/cycle for point-estimate RUL Threshold.`
      : '';

  const postDraft = [
    'Can calibrated prediction intervals make maintenance policies safer and cheaper when operating regimes shift?',
    '',
    'I built ForgeMind AI — a research and simulation prototype exploring uncertainty-aware turbofan prognostics across synthetic C-MAPSS-shaped FD001–FD004 profiles.',
    '',
    'What I focused on technically:',
    '1. Zero data leakage: engine-disjoint fit / calibration / tuning / evaluation partitions across preprocessing, surrogate fitting, conformal calibration, and policy tuning.',
    '2. Regime-aware normalization: k-means clustering fitted on training units so multi-regime fleets (FD002/FD004) are scaled within each operating regime.',
    '3. RUL-binned conformal intervals: adapting interval width across the engine lifecycle instead of using a single static margin.',
    '4. Decision-centric evaluation: comparing Run-to-Failure, Fixed Interval, RUL Threshold, Risk-Aware Conformal, and Oracle by cost per operating cycle with bootstrap 95% CIs.',
    '',
    simSnapshotLine,
    '',
    `Explore the research prototype: ${liveUrl}`,
    'Source repository: https://github.com/Ibtasham/ForgeMind-Ai',
    '#PredictiveMaintenance #ConformalPrediction #Prognostics #ScientificComputing #TypeScript #ReliabilityEngineering',
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n');

  const bibtex = `@software{rahman2026forgemind,
  author = {Rahman, MD Ibtashamur},
  title = {ForgeMind AI: Uncertainty-Aware Predictive Maintenance Research Platform},
  version = {1.1.0},
  year = {2026},
  url = {https://github.com/Ibtasham/ForgeMind-Ai},
  license = {MIT}
}`;

  return {
    projectTitle,
    projectDescription,
    skills,
    postDraft,
    bibtex,
  };
}

export function renderLinkedInCardToCanvas(
  canvas: HTMLCanvasElement,
  artifact: ExperimentArtifact,
  sampleTrajectory?: ConformalPoint[],
): void {
  const w = 1200;
  const h = 627;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Deep obsidian background
  ctx.fillStyle = '#080B12';
  ctx.fillRect(0, 0, w, h);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
  ctx.lineWidth = 1;
  for (let x = 60; x < w; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 60; y < h; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Outer card frame
  ctx.fillStyle = '#0E131D';
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(44, 40, w - 88, h - 80, 14);
  ctx.fill();
  ctx.stroke();

  // Top kicker & explicit provenance badge
  const isSynthetic = artifact.source === 'synthetic_demo';
  ctx.fillStyle = '#06B6D4';
  ctx.font = '600 17px "JetBrains Mono", monospace';
  ctx.fillText(`FORGEMIND AI  ·  ${artifact.subset} PROFILE  ·  RESEARCH PROTOTYPE`, 84, 94);

  const badgeText = isSynthetic ? 'SYNTHETIC SIMULATION' : 'IMPORTED ARTIFACT';
  ctx.fillStyle = isSynthetic ? 'rgba(245, 158, 11, 0.16)' : 'rgba(16, 185, 129, 0.16)';
  ctx.strokeStyle = isSynthetic ? '#F59E0B' : '#10B981';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(872, 68, 244, 32, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = isSynthetic ? '#FCD34D' : '#6EE7B7';
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, 994, 89);
  ctx.textAlign = 'left';

  // Main headline (left column when trajectory graph is present)
  const hasTraj = Boolean(sampleTrajectory && sampleTrajectory.length > 5);
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 36px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Uncertainty-Aware', 84, 150);
  ctx.fillText('Predictive Maintenance', 84, 196);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 17px "IBM Plex Sans", sans-serif';
  ctx.fillText('RUL-binned split conformal intervals &', 84, 236);
  ctx.fillText('engine-disjoint cost simulation pipeline', 84, 260);

  // Right-side embedded Turbofan Health Graph (live RUL + Conformal Band)
  if (hasTraj && sampleTrajectory) {
    const gx = 590;
    const gy = 118;
    const gw = 526;
    const gh = 174;

    ctx.fillStyle = '#080B12';
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 10);
    ctx.fill();
    ctx.stroke();

    // Inner chart padding
    const px = gx + 18;
    const py = gy + 32;
    const pw = gw - 36;
    const ph = gh - 52;

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText('EVALUATION UNIT CONFORMAL RUL TRAJECTORY', px, gy + 20);

    const maxRul = Math.max(130, ...sampleTrajectory.map((p) => p.upper));
    const minCyc = sampleTrajectory[0].cycle;
    const maxCyc = Math.max(minCyc + 1, sampleTrajectory[sampleTrajectory.length - 1].cycle);

    const toX = (c: number) => px + ((c - minCyc) / (maxCyc - minCyc)) * pw;
    const toY = (v: number) => py + ph - (Math.max(0, Math.min(maxRul, v)) / maxRul) * ph;

    // Subtle horizontal grid inside spark chart
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      const yGrid = py + (ph * k) / 4;
      ctx.beginPath();
      ctx.moveTo(px, yGrid);
      ctx.lineTo(px + pw, yGrid);
      ctx.stroke();
    }

    // Conformal band fill
    ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
    ctx.beginPath();
    sampleTrajectory.forEach((pt, idx) => {
      const x = toX(pt.cycle);
      const y = toY(pt.upper);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (let i = sampleTrajectory.length - 1; i >= 0; i--) {
      ctx.lineTo(toX(sampleTrajectory[i].cycle), toY(sampleTrajectory[i].lower));
    }
    ctx.closePath();
    ctx.fill();

    // True RUL dashed line
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    sampleTrajectory.forEach((pt, idx) => {
      const x = toX(pt.cycle);
      const y = toY(pt.trueRul);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Predicted RUL line
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    sampleTrajectory.forEach((pt, idx) => {
      const x = toX(pt.cycle);
      const y = toY(pt.predRul);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // 4 Metric tiles
  const riskPolicy = artifact.policies.find((p) => p.policy === 'risk_aware');
  const thresholdPolicy = artifact.policies.find((p) => p.policy === 'threshold');
  const tiles = [
    {
      label: 'ACTIVE MODEL & RMSE',
      value: `${artifact.metrics.cappedRmse.toFixed(2)} cyc`,
      sub: `${artifact.model} (MAE ${artifact.metrics.cappedMae.toFixed(2)})`,
      color: '#06B6D4',
    },
    {
      label: 'CONFORMAL COVERAGE',
      value: `${artifact.uncertainty.empirical_coverage.toFixed(1)}%`,
      sub: `Target ${artifact.uncertainty.nominal_coverage.toFixed(0)}% · Width ${artifact.uncertainty.mean_width.toFixed(1)} cyc`,
      color: '#10B981',
    },
    {
      label: 'RISK-AWARE COST',
      value: riskPolicy ? `$${riskPolicy.cost_per_cycle.toFixed(3)}/cyc` : '—',
      sub: riskPolicy ? `Failures: ${riskPolicy.failure_rate_pct.toFixed(0)}%` : '—',
      color: '#38BDF8',
    },
    {
      label: 'THRESHOLD BASELINE',
      value: thresholdPolicy ? `$${thresholdPolicy.cost_per_cycle.toFixed(3)}/cyc` : '—',
      sub: thresholdPolicy ? `Failures: ${thresholdPolicy.failure_rate_pct.toFixed(0)}%` : '—',
      color: '#F59E0B',
    },
  ];

  const tileW = 246;
  const tileH = 148;
  const gap = 18;
  tiles.forEach((tile, i) => {
    const x = 84 + i * (tileW + gap);
    const y = 324;
    ctx.fillStyle = '#080B12';
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, tileW, tileH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.fillText(tile.label, x + 18, y + 34);

    ctx.fillStyle = tile.color;
    ctx.font = '700 32px "JetBrains Mono", monospace';
    ctx.fillText(tile.value, x + 18, y + 84);

    ctx.fillStyle = '#CBD5E1';
    ctx.font = '400 14px "IBM Plex Sans", sans-serif';
    ctx.fillText(tile.sub, x + 18, y + 122);
  });

  // Footer attribution & non-operational disclaimer
  ctx.fillStyle = '#64748B';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText(
    'MD Ibtashamur Rahman  ·  github.com/Ibtasham/ForgeMind-Ai  ·  Surrogate simulation prototype (not raw NASA data / not for operational safety)',
    84,
    536,
  );
}

