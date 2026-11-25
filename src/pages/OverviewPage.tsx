import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  GitBranch,
  Globe,
  Layers,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  TrendingDown,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import ogBannerImg from '../assets/images/forgemind_linkedin_og_1795283375860.jpg';
import { ArchitectureWorkflowDiagram } from '../components/overview/ArchitectureWorkflowDiagram';
import { SUBSET_SPECS } from '../engine/cmapss';
import { MODEL_LABELS } from '../engine/models';
import { REVIEWER_SCENARIOS, type ReviewerScenario } from '../engine/portfolio';
import {
  DATASET_PROVENANCE_CATALOG,
  PROTOTYPE_SAFETY_WARNING,
  RESEARCH_LIMITATIONS,
  SURROGATE_BENCHMARK_DISCLOSURE,
} from '../engine/provenance';
import type {
  ConformalStudyResult,
  ExperimentArtifact,
  ModelBenchmarkRow,
  PageId,
  PolicySummary,
  SubsetId,
} from '../engine/types';

interface OverviewPageProps {
  subset: SubsetId;
  benchmarkRows: ModelBenchmarkRow[];
  conformalStudy: ConformalStudyResult;
  policySummaries: PolicySummary[];
  importedArtifact?: ExperimentArtifact | null;
  activeScenarioId?: string | null;
  canResetDemo?: boolean;
  onNavigate: (page: PageId) => void;
  onApplyScenario: (scenario: ReviewerScenario) => void;
  onStartGuidedDemo: () => void;
  onResetDemo: () => void;
}

const FALLBACK_LIVE_APP_URL =
  'https://ais-pre-khj2qtjcfryiz6wf75je3n-473102775373.asia-southeast1.run.app';
const GITHUB_REPO_URL = 'https://github.com/Ibtasham/ForgeMind-Ai';

interface CapabilityItem {
  index: string;
  title: string;
  domain: string;
  description: string;
  actionLabel: string;
  page: PageId;
  icon: React.ComponentType<{ className?: string }>;
}

const PLATFORM_CAPABILITIES: CapabilityItem[] = [
  {
    index: '01',
    title: 'Remaining Useful Life Estimation',
    domain: 'Prognostic Regression & PHM08 Scoring',
    description:
      'Compares Ridge Linear, Random Forest, Histogram GBDT, and Causal Sequence ELM surrogates under piecewise RUL capping (125 cycles) and asymmetric late-prediction penalties.',
    actionLabel: 'Inspect Model Benchmark',
    page: 'benchmark',
    icon: Cpu,
  },
  {
    index: '02',
    title: 'Synthetic Turbofan Telemetry',
    domain: 'Deterministic 21-Sensor Degradation Cohort',
    description:
      'Simulates 48 engine lifetimes per subset across 21 modeled sensor channels (s1–s21) with mulberry32 seeded noise, exponential damage growth, and run-to-failure truncation.',
    actionLabel: 'Explore Synthetic Fleet',
    page: 'datasets',
    icon: Activity,
  },
  {
    index: '03',
    title: 'Operating-Regime Analysis',
    domain: 'k-Means Clustering & Fit-Only Normalization',
    description:
      'Separates single-condition (FD001, FD003) from 6-regime altitude/Mach flight profiles (FD002, FD004) using 12-iteration k-means centroids and causal trailing windows.',
    actionLabel: 'Analyze Regime Features',
    page: 'features',
    icon: Sliders,
  },
  {
    index: '04',
    title: 'Conformal Prediction Simulation',
    domain: 'Finite-Sample Split Uncertainty Quantification',
    description:
      'Constructs distribution-free prediction intervals [L, U] conditioned on RUL horizon bins, tracking empirical coverage against target confidence (1 - α).',
    actionLabel: 'Open Conformal Study',
    page: 'uncertainty',
    icon: ShieldCheck,
  },
  {
    index: '05',
    title: 'Maintenance Policy Optimization',
    domain: 'Episode Replay & Asymmetric Cost Control',
    description:
      'Simulates cycle-by-cycle inspection triggers comparing Run-to-Failure, Fixed Interval, RUL Threshold, Risk-Aware Lower-Bound, and Oracle policies with 95% bootstrap intervals.',
    actionLabel: 'Run Policy Simulator',
    page: 'simulator',
    icon: Wrench,
  },
  {
    index: '06',
    title: 'Economic Sensitivity Analysis',
    domain: 'Cp/Cf Cost Topology & Interactive 3D Surface',
    description:
      'Maps expected maintenance cost per cycle across preventive-cost ratios and RUL decision thresholds via D3 heatmaps and an interactive 3D cost surface.',
    actionLabel: 'Explore Cost Surface',
    page: 'sensitivity',
    icon: TrendingUp,
  },
];

const TECH_STACK_GROUPS = [
  {
    category: 'Interface & Visualization',
    items: [
      { name: 'React 19 + TypeScript', detail: 'Strict typed modular workbench architecture' },
      { name: 'Tailwind CSS v4', detail: 'High-contrast dark industrial design tokens' },
      { name: 'D3.js v7 Projections', detail: '2D cost heatmaps & rotatable 3D cost surface' },
      { name: 'Custom SVG Telemetry', detail: 'Zero-overhead degradation & conformal charts' },
    ],
  },
  {
    category: 'Simulation & ML Surrogates',
    items: [
      { name: 'Mulberry32 Seeded PRNG', detail: '100% deterministic multi-subset cohort generation' },
      { name: 'k-Means Regime Scaler', detail: '12-iteration fit-only OS1–OS3 regime partitioning' },
      { name: 'Tree & Linear Surrogates', detail: 'Ridge OLS, Quantile RF, 28-stage HistGBDT' },
      { name: 'Causal Sequence ELM', detail: '30-cycle EWMA & lag temporal encoder + Ridge readout' },
    ],
  },
  {
    category: 'Uncertainty & Decision Math',
    items: [
      { name: 'Split Conformal Quantiles', detail: 'Exact ceil((n+1)(1-α))/n order-statistic bounds' },
      { name: 'RUL-Binned Calibration', detail: 'Horizon-adaptive [0–30, 31–60, 61–90, 91+] intervals' },
      { name: 'Episode Cost Replay', detail: 'Disjoint tuning/eval with unplanned failure penalties' },
      { name: 'Bootstrap CIs & 10-pt OLS', detail: '350-resample policy CIs & linear EOL projection' },
    ],
  },
  {
    category: 'Verification & Reporting',
    items: [
      { name: 'node:test Suite (30 tests)', detail: 'Zero-leakage, calibration, and cost invariants' },
      { name: 'Schema-Validated JSON', detail: 'Provenance-tagged experiment artifact import/export' },
      { name: 'jsPDF 3-Page Builder', detail: 'Canvas-embedded charts, policies, and audit ledger' },
      { name: 'URL State Persistence', detail: 'Shareable subset, model, and workbench deep links' },
    ],
  },
];

export const OverviewPage: React.FC<OverviewPageProps> = ({
  subset,
  benchmarkRows,
  conformalStudy,
  policySummaries,
  importedArtifact,
  activeScenarioId,
  canResetDemo = false,
  onNavigate,
  onApplyScenario,
  onStartGuidedDemo,
  onResetDemo,
}) => {
  const [imgError, setImgError] = useState(false);
  const [copiedLiveUrl, setCopiedLiveUrl] = useState(false);

  const spec = SUBSET_SPECS[subset];
  const bestModel = [...benchmarkRows].sort((a, b) => a.metrics.rmse - b.metrics.rmse)[0];
  const thresholdPolicy = policySummaries.find((p) => p.policy === 'threshold');
  const riskPolicy = policySummaries.find((p) => p.policy === 'risk_aware');
  const oraclePolicy = policySummaries.find((p) => p.policy === 'oracle');

  const importedThreshold = importedArtifact?.policies.find((p) => p.policy === 'threshold');
  const importedRisk = importedArtifact?.policies.find((p) => p.policy === 'risk_aware');
  const importedOracle = importedArtifact?.policies.find((p) => p.policy === 'oracle');

  const displayRmse = importedArtifact ? importedArtifact.metrics.rmse : bestModel?.metrics.rmse;
  const displayMae = importedArtifact ? importedArtifact.metrics.mae : bestModel?.metrics.mae;
  const displayModelLabel = importedArtifact
    ? MODEL_LABELS[importedArtifact.model]
    : bestModel
      ? MODEL_LABELS[bestModel.model]
      : '—';
  const displayCoverage = importedArtifact
    ? importedArtifact.uncertainty.empirical_coverage
    : conformalStudy.empiricalCoverage;
  const displayNominal = importedArtifact
    ? importedArtifact.uncertainty.nominal_coverage
    : conformalStudy.nominalCoverage;
  const displayWidth = importedArtifact
    ? importedArtifact.uncertainty.mean_width
    : conformalStudy.meanWidth;

  const activeThresholdCost = importedThreshold
    ? importedThreshold.cost_per_cycle
    : thresholdPolicy?.meanCostPerCycle;
  const activeRiskCost = importedRisk
    ? importedRisk.cost_per_cycle
    : riskPolicy?.meanCostPerCycle;
  const activeThresholdFail = importedThreshold
    ? importedThreshold.failure_rate_pct
    : thresholdPolicy?.failureRatePct;
  const activeRiskFail = importedRisk
    ? importedRisk.failure_rate_pct
    : riskPolicy?.failureRatePct;
  const activeOracleCost = importedOracle
    ? importedOracle.cost_per_cycle
    : oraclePolicy?.meanCostPerCycle;

  const deltaPct =
    activeThresholdCost !== undefined &&
    activeRiskCost !== undefined &&
    activeThresholdCost > 0
      ? ((activeThresholdCost - activeRiskCost) / activeThresholdCost) * 100
      : 0;

  const scrollToMethodology = () => {
    const el = document.getElementById('research-methodology');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      onNavigate('research');
    }
  };

  const liveAppUrl =
    typeof window !== 'undefined' &&
    window.location.origin &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1')
      ? window.location.origin
      : FALLBACK_LIVE_APP_URL;

  const handleCopyLiveUrl = async () => {
    try {
      await navigator.clipboard.writeText(liveAppUrl);
      setCopiedLiveUrl(true);
      setTimeout(() => setCopiedLiveUrl(false), 2000);
    } catch {
      // Clipboard blocked in restricted context; anchor link remains directly usable
    }
  };

  return (
    <div className="space-y-10">
      {/* 1. Hero & Engineering Problem Framing */}
      <section className="rounded-lg border border-slate-800/90 bg-[#0E131D]/88 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 lg:p-9 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono text-slate-400">
                <span className="text-cyan-400 font-medium">Reliability & Prognostics Research</span>
                <span aria-hidden="true">·</span>
                <span>
                  {importedArtifact
                    ? 'External Experiment Artifact'
                    : 'Synthetic C-MAPSS-Shaped Simulation'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-blue-300 tabular-nums">{spec.id} Profile Active</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-xl border border-violet-500/30 bg-[#04040C] p-1.5 shadow-lg shadow-violet-950/20">
                  <img
                    src="/assets/aistudio/ForgeMind_AI_Logo_858328c3.png"
                    alt="ForgeMind AI — Predict, Optimize, Innovate"
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-50 text-balance">
                    ForgeMind AI
                  </h2>
                  <p className="font-display text-base sm:text-xl font-medium text-cyan-200/95 leading-snug text-balance">
                    Uncertainty-Aware Predictive Maintenance &amp; Decision Simulation Workbench.
                  </p>
                </div>
              </div>

              {/* Engineering Problem Formulation */}
              <div className="border-t border-slate-800/80 pt-4 space-y-1.5">
                <div className="text-[11px] font-mono tracking-wide text-blue-300">
                  Core Engineering Problem
                </div>
                <p className="text-sm sm:text-[15px] font-medium text-slate-100 leading-snug">
                  How can predictive maintenance incorporate uncertainty when estimating remaining useful life and selecting preventive maintenance policies?
                </p>
                <p className="text-xs sm:text-[13px] text-slate-400 leading-relaxed">
                  Point RUL forecasts alone ignore multi-regime sensor variance and heavy unplanned failure penalties. ForgeMind AI couples engine-disjoint RUL surrogate predictions with finite-sample split conformal bounds so maintenance triggers act on calibrated lower confidence limits rather than optimistic point estimates.
                </p>
              </div>
            </div>

            {/* Primary Actions + Quick Telemetry Access */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('simulator')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-300"
                >
                  Launch Interactive Workbench
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onStartGuidedDemo}
                  className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/55 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-blue-500/25 hover:border-cyan-400/60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <Play className="w-3.5 h-3.5 text-cyan-300" />
                  Start Guided Demo
                </button>
                <button
                  type="button"
                  onClick={scrollToMethodology}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#080B12] px-3 py-2 text-xs font-medium text-slate-100 hover:border-blue-400/60 hover:text-cyan-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  Explore Research Methodology
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => onNavigate('health')}
                  className="hover:text-cyan-300 transition-colors underline-offset-4 hover:underline whitespace-nowrap"
                >
                  Inspect Single-Engine Telemetry
                </button>
                <span aria-hidden="true" className="text-slate-700">·</span>
                <button
                  type="button"
                  onClick={() => onNavigate('fleet')}
                  className="hover:text-cyan-300 transition-colors underline-offset-4 hover:underline whitespace-nowrap"
                >
                  View 48-Unit Fleet Matrix
                </button>
                <span aria-hidden="true" className="text-slate-700">·</span>
                <button
                  type="button"
                  onClick={() => onNavigate('research')}
                  className="hover:text-cyan-300 transition-colors underline-offset-4 hover:underline whitespace-nowrap"
                >
                  Open Artifact Export & PDF Report
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[240px] bg-[#080B12] border-t lg:border-t-0 lg:border-l border-slate-800">
            {!imgError ? (
              <img
                src={ogBannerImg}
                alt="Turbofan engine cross-section schematic integrated with remaining useful life degradation trajectories and conformal prediction bands"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full lg:h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-6 text-center text-xs font-mono text-slate-400">
                Turbofan Health Telemetry · 21 Sensor Channels · Split Conformal UQ
              </div>
            )}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0E131D]/95 via-[#0E131D]/20 to-transparent"
            />
            <div className="absolute bottom-3.5 left-4 right-4 flex items-center justify-between gap-3 text-[11px] font-mono text-slate-300">
              <span>Turbofan Telemetry · OS1–OS3</span>
              <span className="text-cyan-300 whitespace-nowrap shrink-0 tabular-nums">
                45 / 20 / 15 / 20% Splits
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Live Simulation Snapshot & Guided Reviewer Scenarios */}
      <section aria-label="Active Subset Summary Metrics" className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-5">
            <div className="text-xs text-slate-400">Active Subset Profile</div>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-100">
              {spec.id}
            </div>
            <div className="mt-1.5 text-xs text-slate-400">
              {spec.conditions} condition{spec.conditions > 1 ? 's' : ''} · {spec.faultModes} fault mode{spec.faultModes > 1 ? 's' : ''}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-5">
            <div className="text-xs text-slate-400">
              {importedArtifact ? 'Imported Artifact RMSE' : 'Best Surrogate Eval RMSE (Sim)'}
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-cyan-300">
              {displayRmse !== undefined ? displayRmse.toFixed(2) : '—'}
              <span className="ml-1.5 text-xs font-normal text-slate-400">cycles</span>
            </div>
            <div className="mt-1.5 text-xs text-slate-400 truncate">
              {displayModelLabel} · MAE {displayMae !== undefined ? displayMae.toFixed(2) : '—'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-5">
            <div className="text-xs text-slate-400">
              {importedArtifact ? 'Imported Conformal Coverage' : 'Conformal Coverage (RUL-Binned)'}
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-400">
              {displayCoverage.toFixed(1)}%
            </div>
            <div className="mt-1.5 text-xs text-slate-400 font-mono tabular-nums">
              Target {displayNominal.toFixed(0)}% · Mean width {displayWidth.toFixed(1)} cyc
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-5">
            <div className="text-xs text-slate-400">Risk-Aware vs Threshold</div>
            <div
              className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                deltaPct >= 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {deltaPct >= 0 ? `-${deltaPct.toFixed(1)}%` : `+${Math.abs(deltaPct).toFixed(1)}%`}
              <span className="ml-1.5 text-xs font-normal text-slate-400">cost/cyc</span>
            </div>
            <div className="mt-1.5 text-xs text-slate-400 font-mono tabular-nums">
              Fail: {activeRiskFail?.toFixed(0) ?? '—'}% vs {activeThresholdFail?.toFixed(0) ?? '—'}% · Oracle{' '}
              {activeOracleCost !== undefined ? activeOracleCost.toFixed(3) : '—'}
            </div>
          </div>
        </div>

        {/* Guided Reviewer Scenarios */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-slate-100">
                Three Guided Investigation Scenarios
              </h3>
              <p className="text-xs text-slate-400">
                Load a real predefined configuration on its live workbench page, explore parameter changes, and return to baseline or reset at any time.
              </p>
            </div>
            {canResetDemo && (
              <button
                type="button"
                onClick={onResetDemo}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#0E131D] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Demonstration
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {REVIEWER_SCENARIOS.map((sc, idx) => {
              const isActive = activeScenarioId === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => onApplyScenario(sc)}
                  className={`group text-left rounded-lg border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 flex flex-col justify-between ${
                    isActive
                      ? 'border-cyan-500/60 bg-cyan-950/20'
                      : 'border-slate-800 bg-[#0E131D] hover:border-cyan-500/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs font-mono text-cyan-300">
                      <span className="truncate">
                        Scenario 0{idx + 1} · {sc.subset} · {MODEL_LABELS[sc.model]}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 transition-colors shrink-0" />
                    </div>
                    <div className="mt-1.5 font-display text-sm font-semibold text-slate-100 group-hover:text-cyan-200 transition-colors">
                      {sc.title}
                    </div>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">{sc.subtitle}</p>
                    <p className="mt-2 text-[11px] text-slate-300/90 leading-relaxed">
                      {sc.investigationFocus}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800/70 flex items-center justify-between text-[11px] font-mono text-cyan-400">
                    <span>{isActive ? 'Active Scenario' : 'Launch Scenario'}</span>
                    <span>
                      Cp=${sc.preventiveCost} · Cf=${sc.failureCost} · α={sc.alpha.toFixed(2)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Project Capability Matrix (6 Core Capabilities) */}
      <section aria-labelledby="capabilities-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h3
              id="capabilities-heading"
              className="font-display text-xl font-semibold text-slate-100 text-balance"
            >
              Workbench Simulation Capabilities
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl">
              Six coupled analytical modules spanning synthetic telemetry synthesis, regime normalization, conformal calibration, and economic decision simulation.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PLATFORM_CAPABILITIES.map((cap) => {
            const Icon = cap.icon;
            return (
              <button
                key={cap.index}
                type="button"
                onClick={() => onNavigate(cap.page)}
                className="group text-left rounded-lg border border-slate-800 bg-[#0E131D] p-5 hover:border-cyan-500/45 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-mono text-slate-400">
                    <span>
                      {cap.index} · <span className="text-blue-300">{cap.domain}</span>
                    </span>
                    <Icon className="w-4 h-4 text-cyan-400/80 group-hover:text-cyan-300 transition-colors shrink-0" />
                  </div>
                  <h4 className="mt-2.5 font-display text-base font-semibold text-slate-100 group-hover:text-cyan-200 transition-colors">
                    {cap.title}
                  </h4>
                  <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                    {cap.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/70 flex items-center justify-between text-xs font-medium text-cyan-400 group-hover:text-cyan-300">
                  <span>{cap.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. End-to-End Architecture Workflow Diagram */}
      <section aria-labelledby="architecture-heading" className="space-y-4">
        <div className="space-y-1">
          <h3
            id="architecture-heading"
            className="font-display text-xl font-semibold text-slate-100 text-balance"
          >
            End-to-End Pipeline Architecture
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-3xl">
            Signal and decision flow from deterministic turbofan trajectory synthesis to conformal maintenance optimization. Select any stage node to inspect its live module.
          </p>
        </div>

        <ArchitectureWorkflowDiagram onNavigate={onNavigate} />
      </section>

      {/* 5. Technology Stack & Engineering Implementation */}
      <section aria-labelledby="tech-stack-heading" className="space-y-4">
        <div className="space-y-1">
          <h3
            id="tech-stack-heading"
            className="font-display text-xl font-semibold text-slate-100 text-balance"
          >
            Technology Stack & Numerical Implementation
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-3xl">
            Client-side TypeScript numerical kernel paired with D3 visualization, deterministic verification tests, and structured export pipelines.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {TECH_STACK_GROUPS.map((group) => (
            <div
              key={group.category}
              className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-3"
            >
              <h4 className="font-display text-sm font-semibold text-cyan-300 border-b border-slate-800 pb-2.5">
                {group.category}
              </h4>
              <ul className="space-y-2.5">
                {group.items.map((item) => (
                  <li key={item.name} className="space-y-0.5">
                    <div className="text-xs font-medium text-slate-100 font-mono">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-slate-400 leading-snug">{item.detail}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Research Methodology, Data Provenance & Research Limitations */}
      <section
        id="research-methodology"
        aria-labelledby="methodology-provenance-heading"
        className="pt-2 space-y-5 scroll-mt-20"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h3
              id="methodology-provenance-heading"
              className="font-display text-xl font-semibold text-slate-100 text-balance"
            >
              Research Methodology, Data Provenance & Limitations
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl">
              Scientific boundaries separating genuinely executed split conformal and cost optimization calculations from synthetic dataset and surrogate approximations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('research')}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#0E131D] px-3.5 py-2 text-xs font-medium text-cyan-300 hover:border-cyan-500/50 transition-colors whitespace-nowrap shrink-0"
          >
            Open Full Provenance Ledger & Exports
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Prototype & Surrogate Disclosure Notice */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-rose-500/35 bg-rose-950/15 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-200">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              Non-Operational Research Prototype Warning
            </div>
            <p className="text-xs text-rose-100/85 leading-relaxed">{PROTOTYPE_SAFETY_WARNING}</p>
          </div>

          <div className="rounded-lg border border-amber-500/35 bg-amber-950/15 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
              <Layers className="w-4 h-4 text-amber-400 shrink-0" />
              Synthetic Data & Surrogate Modeling Disclosure
            </div>
            <p className="text-xs text-amber-100/85 leading-relaxed">
              {SURROGATE_BENCHMARK_DISCLOSURE}
            </p>
          </div>
        </div>

        {/* Two-column: Provenance Summary & Guardrails vs. Explicit Limitations */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4">
            <h4 className="font-display text-sm font-semibold text-slate-100">
              Data Provenance & Methodological Guardrails
            </h4>

            <div className="divide-y divide-slate-800/80">
              {DATASET_PROVENANCE_CATALOG.slice(0, 4).map((entry) => (
                <div key={entry.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-100">{entry.datasetName}</span>
                    <span className="font-mono text-[11px] text-cyan-300">
                      {entry.originLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {entry.sampleScope}. {entry.limitations}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  Disjoint Splits
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Zero fit, cal, tune, or eval unit overlap.
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-slate-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  Failure Reality
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Missed triggers incur full Cf penalties.
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-slate-200">
                  <TrendingDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Unit Bootstraps
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  350-resample 95% CIs over eval units.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4">
            <h4 className="font-display text-sm font-semibold text-slate-100">
              Research Limitations & Scope Constraints
            </h4>
            <div className="divide-y divide-slate-800/80">
              {RESEARCH_LIMITATIONS.map((lim) => (
                <div key={lim.title} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <div className="text-xs font-semibold text-slate-200">{lim.title}</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{lim.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7. Author, Institutional Affiliation & Repository / Live Links */}
      <footer
        aria-label="Project Author and Repository Attribution"
        className="rounded-lg border border-slate-800 bg-[#0E131D] p-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="text-[11px] font-mono text-cyan-400">
              Research Author & Institutional Affiliation
            </div>
            <h3 className="font-display text-lg font-bold text-slate-100">
              MD Ibtashamur Rahman
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              Industrial and Production Engineering · Shahjalal University of Science and Technology, Bangladesh
            </p>
            <p className="text-xs text-slate-400">
              MIT License · Open-source uncertainty-aware prognostics & reliability decision simulation workbench
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap lg:flex-nowrap items-center gap-2.5 shrink-0">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-[#080B12] px-3 py-2 text-xs font-medium text-slate-100 hover:border-cyan-500/50 hover:text-cyan-200 transition-colors whitespace-nowrap shrink-0"
            >
              <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
              GitHub Repository
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            <a
              href={liveAppUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5" />
              Live Application
              <ExternalLink className="w-3 h-3" />
            </a>

            <button
              type="button"
              onClick={handleCopyLiveUrl}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-[#080B12] px-3 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 hover:border-slate-600 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedLiveUrl ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
              {copiedLiveUrl ? 'Link Copied' : 'Copy Live URL'}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('research')}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-800 px-3 py-2 text-xs font-medium text-cyan-300 hover:bg-slate-800/60 transition-colors whitespace-nowrap shrink-0"
            >
              LinkedIn Project Kit
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
