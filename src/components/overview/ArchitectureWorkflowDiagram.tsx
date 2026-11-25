import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { PageId } from '../../engine/types';

interface WorkflowStage {
  step: string;
  title: string;
  moduleTag: string;
  ioSpec: string;
  summary: string;
  splitRole: string;
  page: PageId;
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    step: '01',
    title: 'Synthetic Turbofan Telemetry',
    moduleTag: 'cmapss.ts · mulberry32 PRNG',
    ioSpec: '48 units · 21 sensors (s1–s21) · OS1–OS3',
    summary:
      'Generates deterministic run-to-failure engine trajectories across single and 6-regime operating profiles with exponential degradation.',
    splitRole: 'All Cohort Splits',
    page: 'datasets',
  },
  {
    step: '02',
    title: 'Regime Normalization & Causal Features',
    moduleTag: '12-iter k-means · Trailing Windows',
    ioSpec: 'Fit-only scalers · 15-cycle causal window',
    summary:
      'Clusters flight operating settings into regimes, fits per-regime min-max bounds strictly on fit engines, and computes leak-free rolling stats.',
    splitRole: 'Fit Split Only (45%)',
    page: 'features',
  },
  {
    step: '03',
    title: 'RUL Surrogate Estimators',
    moduleTag: 'Ridge · RF · HistGBDT · Seq ELM',
    ioSpec: 'Piecewise RUL cap (125 cyc) · PHM08 score',
    summary:
      'Fits four browser-native model-family surrogates on fit-split trajectories and scores point error plus asymmetric late-prediction risk.',
    splitRole: 'Fit Train -> Eval Score',
    page: 'benchmark',
  },
  {
    step: '04',
    title: 'Split Conformal Calibration',
    moduleTag: 'conformal.ts · RUL-Binned Quantiles',
    ioSpec: 'Finite-sample (1 - α) interval [L, U]',
    summary:
      'Calibrates absolute residual quantiles across predicted RUL horizon bins on held-out calibration engines to quantify prediction uncertainty.',
    splitRole: 'Calibration Split (20%)',
    page: 'uncertainty',
  },
  {
    step: '05',
    title: 'Maintenance Policy Simulation',
    moduleTag: 'maintenance.ts · Episode Replay',
    ioSpec: 'Cp vs. Cf ratio · 350x bootstrap 95% CI',
    summary:
      'Tunes trigger thresholds on tuning units and evaluates Run-to-Failure, Fixed Interval, Threshold, Risk-Aware Lower-Bound, and Oracle policies.',
    splitRole: 'Tune (15%) -> Eval (20%)',
    page: 'simulator',
  },
  {
    step: '06',
    title: 'Economic Sensitivity & Provenance',
    moduleTag: 'surface3d.ts · pdfReport.ts',
    ioSpec: 'D3 3D Cost Basin · JSON & 3-Page PDF',
    summary:
      'Maps cost sensitivity across preventive-to-failure ratios and RUL triggers while bundling explicit provenance metadata into exports.',
    splitRole: 'Eval & Export Ledger',
    page: 'sensitivity',
  },
];

const SPLIT_PARTITION_SEGMENTS = [
  { label: 'Fit Cohort', share: '45%', units: '22 units', role: 'Regime k-means, scalers & surrogates', accent: 'bg-blue-500/80' },
  { label: 'Calibration', share: '20%', units: '9 units', role: 'Split conformal residual quantiles', accent: 'bg-cyan-500/80' },
  { label: 'Policy Tuning', share: '15%', units: '7 units', role: 'Threshold & risk-multiplier search', accent: 'bg-sky-400/80' },
  { label: 'Evaluation', share: '20%', units: '10 units', role: 'Blind PHM08, coverage & episode cost', accent: 'bg-emerald-500/80' },
];

interface ArchitectureWorkflowDiagramProps {
  onNavigate: (page: PageId) => void;
}

export const ArchitectureWorkflowDiagram: React.FC<ArchitectureWorkflowDiagramProps> = ({
  onNavigate,
}) => {
  return (
    <div
      data-testid="architecture-workflow-diagram"
      className="border-y border-slate-800/90 py-6 space-y-6"
    >
      {/* Pipeline Flow Grid with Orthogonal Bus Connectors */}
      <div className="relative">
        {/* Desktop SVG Signal Bus Schematic Overlay */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1200 420"
          preserveAspectRatio="none"
          className="hidden xl:block pointer-events-none absolute inset-0 w-full h-full"
        >
          {/* Row 1 horizontal buses (Node 1 -> Node 2 -> Node 3) */}
          <line x1="382" y1="92" x2="414" y2="92" stroke="#06B6D4" strokeWidth="1.75" strokeOpacity="0.6" />
          <polygon points="414,88 421,92 414,96" fill="#06B6D4" fillOpacity="0.75" />
          <line x1="786" y1="92" x2="818" y2="92" stroke="#3B82F6" strokeWidth="1.75" strokeOpacity="0.6" />
          <polygon points="818,88 825,92 818,96" fill="#3B82F6" fillOpacity="0.75" />

          {/* Inter-row routing bus (Node 3 -> Node 4) */}
          <path
            d="M 1000 186 L 1000 208 L 200 208 L 200 226"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            strokeOpacity="0.45"
          />
          <polygon points="196,225 200,232 204,225" fill="#38BDF8" fillOpacity="0.7" />

          {/* Row 2 horizontal buses (Node 4 -> Node 5 -> Node 6) */}
          <line x1="382" y1="322" x2="414" y2="322" stroke="#06B6D4" strokeWidth="1.75" strokeOpacity="0.6" />
          <polygon points="414,318 421,322 414,326" fill="#06B6D4" fillOpacity="0.75" />
          <line x1="786" y1="322" x2="818" y2="322" stroke="#3B82F6" strokeWidth="1.75" strokeOpacity="0.6" />
          <polygon points="818,318 825,322 818,326" fill="#3B82F6" fillOpacity="0.75" />
        </svg>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-6 relative z-10">
          {WORKFLOW_STAGES.map((stage) => (
            <button
              key={stage.step}
              type="button"
              onClick={() => onNavigate(stage.page)}
              className="group text-left rounded-lg border border-slate-800 bg-[#0E131D] p-4 hover:border-cyan-500/50 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 flex flex-col justify-between min-h-[164px]"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                  <span className="text-cyan-400 font-semibold tracking-wide">
                    Stage {stage.step} · {stage.splitRole}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors shrink-0" />
                </div>

                <h4 className="mt-2 font-display text-sm sm:text-[15px] font-semibold text-slate-100 group-hover:text-cyan-200 transition-colors">
                  {stage.title}
                </h4>

                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  {stage.summary}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-0.5 text-[11px] font-mono">
                <div className="text-blue-300/90">{stage.moduleTag}</div>
                <div className="text-slate-400">{stage.ioSpec}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Engine-Disjoint Data Partitioning Track */}
      <div className="pt-4 border-t border-slate-800/90 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-200">
            Engine-Disjoint Experimental Partitioning (Zero Cross-Unit Leakage)
          </span>
          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
            48 Synthetic Units / Subset · Partitioned by Unit ID
          </span>
        </div>

        <div className="flex h-2 w-full overflow-hidden rounded-sm bg-slate-900">
          <div className="h-full bg-blue-500/80" style={{ width: '45%' }} />
          <div className="h-full bg-cyan-500/80 border-l border-[#0E131D]" style={{ width: '20%' }} />
          <div className="h-full bg-sky-400/80 border-l border-[#0E131D]" style={{ width: '15%' }} />
          <div className="h-full bg-emerald-500/80 border-l border-[#0E131D]" style={{ width: '20%' }} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {SPLIT_PARTITION_SEGMENTS.map((seg) => (
            <div key={seg.label} className="flex items-start gap-2.5 text-xs">
              <span className={`mt-1.5 w-2 h-2 rounded-xs shrink-0 ${seg.accent}`} aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-slate-200 tabular-nums">
                  {seg.label} · {seg.share} ({seg.units})
                </div>
                <div className="text-[11px] text-slate-400 leading-snug">{seg.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
