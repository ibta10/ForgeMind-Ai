import React from 'react';
import { AlertTriangle, FileCheck2, FlaskConical, X } from 'lucide-react';
import type { ExperimentArtifact } from '../../engine/types';

interface NoticeBannerProps {
  importedArtifact: ExperimentArtifact | null;
  onClearImported: () => void;
  onJumpToResearch: () => void;
}

export const NoticeBanner: React.FC<NoticeBannerProps> = ({
  importedArtifact,
  onClearImported,
  onJumpToResearch,
}) => {
  if (importedArtifact) {
    return (
      <div
        data-testid="notice-banner-imported"
        className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-950/25 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 text-emerald-100 min-w-0">
          <span className="inline-flex self-start sm:self-auto items-center gap-1 rounded border border-emerald-400/50 bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-200 shrink-0">
            <FileCheck2 className="w-3 h-3" aria-hidden="true" />
            IMPORTED ARTIFACT
          </span>
          <span className="leading-relaxed">
            External run{' '}
            <span className="font-mono font-semibold text-emerald-200">
              {importedArtifact.experiment_id}
            </span>{' '}
            ({importedArtifact.subset} · {importedArtifact.model}) is active for Overview KPIs, LinkedIn cards, and JSON/PDF exports. Interactive fleet, telemetry, and simulator views still evaluate the local synthetic cohort.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onJumpToResearch}
            className="text-emerald-300 hover:text-emerald-100 font-medium whitespace-nowrap"
          >
            Data Provenance
          </button>
          <button
            type="button"
            onClick={onClearImported}
            className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-emerald-200 hover:bg-emerald-500/20 font-medium whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Revert to Synthetic Simulation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="notice-banner-synthetic"
      className="mb-6 rounded-lg border border-amber-500/35 bg-[#0E131D] px-4 py-2.5 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 text-xs text-slate-300"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 min-w-0">
        <span className="inline-flex self-start sm:self-auto items-center gap-1 rounded border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300 shrink-0">
          <FlaskConical className="w-3 h-3" aria-hidden="true" />
          SYNTHETIC SIMULATION
        </span>
        <span className="leading-relaxed">
          Runs deterministic C-MAPSS-shaped trajectories and browser TypeScript surrogates —{' '}
          <strong className="font-semibold text-slate-100">
            does not load raw NASA files or train production ML models
          </strong>
          . Research prototype only; not for operational safety decisions.
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden xl:inline-flex items-center gap-1 text-[11px] font-mono text-amber-300/90 whitespace-nowrap">
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          Non-Operational Prototype
        </span>
        <button
          type="button"
          onClick={onJumpToResearch}
          className="text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap shrink-0"
        >
          Data Provenance &amp; JSON
        </button>
      </div>
    </div>
  );
};
