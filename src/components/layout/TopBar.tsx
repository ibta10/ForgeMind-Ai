import React from 'react';
import { Download, FileCheck2, FlaskConical, Menu } from 'lucide-react';
import type { ExperimentArtifact, PageId, SubsetId } from '../../engine/types';
import { NAV_ITEMS } from './Sidebar';

interface TopBarProps {
  activePage: PageId;
  subset: SubsetId;
  onSelectSubset: (subset: SubsetId) => void;
  artifactSource?: ExperimentArtifact['source'];
  importedExperimentId?: string;
  onExportArtifact: () => void;
  onOpenMobileNav: () => void;
  onNavigateOverview?: () => void;
}

const SUBSETS: SubsetId[] = ['FD001', 'FD002', 'FD003', 'FD004'];

export const TopBar: React.FC<TopBarProps> = ({
  activePage,
  subset,
  onSelectSubset,
  artifactSource = 'synthetic_demo',
  importedExperimentId,
  onExportArtifact,
  onOpenMobileNav,
  onNavigateOverview,
}) => {
  const currentNav = NAV_ITEMS.find((item) => item.id === activePage);
  const isImported = artifactSource === 'imported_file';

  return (
    <header className="sticky top-0 z-30 min-h-14 py-2 sm:py-0 bg-[#080B12]/95 backdrop-blur border-b border-slate-800/90 px-3 sm:px-6 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-4">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="lg:hidden p-1.5 -ml-1 rounded-md text-slate-300 hover:bg-slate-800 hover:text-slate-100 shrink-0"
        >
          <Menu className="w-4 h-4" />
        </button>

        <a
          href="#overview"
          onClick={(e) => {
            if (onNavigateOverview) {
              e.preventDefault();
              onNavigateOverview();
            }
          }}
          aria-label="ForgeMind AI Mission Overview"
          className="lg:hidden shrink-0 w-7 h-7 rounded-md border border-violet-500/30 bg-[#04040C] p-0.5 flex items-center justify-center"
        >
          <img
            src="/assets/aistudio/ForgeMind_AI_Logo_858328c3.png"
            alt="ForgeMind AI"
            className="w-full h-full object-contain rounded-[3px]"
          />
        </a>

        <div className="hidden md:flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-400 whitespace-nowrap">
            {currentNav?.group ?? 'Workspace'}
          </span>
          <span className="text-slate-600" aria-hidden="true">
            /
          </span>
          <h1 className="font-display font-semibold text-slate-100 truncate">
            {currentNav?.label ?? 'Mission Overview'}
          </h1>
        </div>

        <span
          data-testid="provenance-mode-badge"
          title={
            isImported
              ? `External JSON artifact loaded (${importedExperimentId ?? 'imported'}). Local fleet & telemetry curves remain synthetic.`
              : 'Synthetic Simulation: In-browser C-MAPSS-shaped trajectories and TypeScript surrogates (not raw NASA data or production ML).'
          }
          className={`inline-flex items-center gap-1 rounded border px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold tracking-wider uppercase whitespace-nowrap shrink-0 ${
            isImported
              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
              : 'border-amber-500/55 bg-amber-500/15 text-amber-300'
          }`}
        >
          {isImported ? (
            <FileCheck2 className="w-3 h-3 shrink-0" aria-hidden="true" />
          ) : (
            <FlaskConical className="w-3 h-3 shrink-0" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {isImported ? 'IMPORTED ARTIFACT' : 'SYNTHETIC SIMULATION'}
          </span>
          <span className="sm:hidden">{isImported ? 'IMPORTED' : 'SYNTHETIC'}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <div
          className="flex items-center rounded-md border border-slate-800 bg-[#0E131D] p-0.5"
          role="group"
          aria-label="Select C-MAPSS Subset"
        >
          {SUBSETS.map((id) => {
            const active = subset === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectSubset(id)}
                className={`px-1.5 sm:px-2.5 py-1 text-[10.5px] sm:text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {id}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onExportArtifact}
          className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export Metrics JSON</span>
          <span className="sm:hidden">Export</span>
        </button>
      </div>
    </header>
  );
};
