import React from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Compass,
  Database,
  Layers,
  LayoutGrid,
  Play,
  RotateCcw,
  ShieldAlert,
  Sliders,
  TrendingUp,
  X,
} from 'lucide-react';
import type { PageId } from '../../engine/types';

export interface NavItem {
  id: PageId;
  label: string;
  group: 'Foundation' | 'Prognostics' | 'Decision Study';
  icon: React.FC<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Mission Overview', group: 'Foundation', icon: Compass },
  { id: 'datasets', label: 'Dataset Explorer', group: 'Foundation', icon: Database },
  { id: 'fleet', label: 'Fleet Health Overview', group: 'Prognostics', icon: LayoutGrid },
  { id: 'health', label: 'Machine Health', group: 'Prognostics', icon: Activity },
  { id: 'features', label: 'Feature Analytics', group: 'Prognostics', icon: Layers },
  { id: 'benchmark', label: 'Model Benchmark', group: 'Prognostics', icon: BarChart3 },
  { id: 'uncertainty', label: 'Robustness & Conformal', group: 'Decision Study', icon: ShieldAlert },
  { id: 'simulator', label: 'Decision Simulator', group: 'Decision Study', icon: Sliders },
  { id: 'sensitivity', label: 'Sensitivity Analysis', group: 'Decision Study', icon: TrendingUp },
  { id: 'research', label: 'Research & Repro', group: 'Decision Study', icon: BookOpen },
];

interface SidebarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  rulCap: number;
  tourActive: boolean;
  tourStepNumber?: number;
  totalTourSteps?: number;
  canResetDemo: boolean;
  onStartGuidedDemo: () => void;
  onResetDemo: () => void;
}

const GROUPS: Array<NavItem['group']> = ['Foundation', 'Prognostics', 'Decision Study'];

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  mobileOpen,
  onCloseMobile,
  rulCap,
  tourActive,
  tourStepNumber,
  totalTourSteps,
  canResetDemo,
  onStartGuidedDemo,
  onResetDemo,
}) => {
  const navContent = (
    <div className="flex h-full flex-col justify-between overflow-y-auto bg-[#0B0F18] border-r border-slate-800/90 px-3 py-4">
      <div>
        <div className="px-2 pr-8 lg:pr-2 pb-4 border-b border-slate-800/80">
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              onSelectPage('overview');
              onCloseMobile();
            }}
            aria-label="ForgeMind AI — Return to Mission Overview"
            className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <div className="mx-auto w-28 h-28 rounded-xl border border-violet-500/25 bg-[#04040C] p-1 shadow-sm group-hover:border-cyan-400/50 transition-colors">
              <img
                src="/assets/aistudio/ForgeMind_AI_Logo_858328c3.png"
                alt="ForgeMind AI — Predict, Optimize, Innovate"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
            <p className="mt-2 text-center text-[11px] font-mono text-slate-400 group-hover:text-slate-200 transition-colors">
              C-MAPSS Prognostics Workbench
            </p>
          </a>
        </div>

        <nav className="mt-4 space-y-4" aria-label="Primary Navigation">
          {GROUPS.map((group) => (
            <div key={group}>
              <div className="px-3 mb-1.5 text-[11px] font-medium text-slate-400">
                {group}
              </div>
              <ul className="space-y-0.5">
                {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectPage(item.id);
                          onCloseMobile();
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                          isActive
                            ? 'bg-cyan-500/12 text-cyan-300 border border-cyan-500/30'
                            : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-slate-800/80 pt-3 px-2 text-xs text-slate-400 space-y-2.5">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => {
              onStartGuidedDemo();
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium border transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              tourActive
                ? 'border-cyan-500/55 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-700 bg-[#080B12] text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200'
            }`}
          >
            <Play className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>
              {tourActive && tourStepNumber && totalTourSteps
                ? `Guided Demo (${tourStepNumber}/${totalTourSteps})`
                : 'Start Guided Demo'}
            </span>
          </button>

          {canResetDemo && (
            <button
              type="button"
              onClick={() => {
                onResetDemo();
                onCloseMobile();
              }}
              className="w-full flex items-center justify-center gap-1.5 rounded-md border border-slate-800 bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              <span>Reset Demonstration</span>
            </button>
          )}
        </div>

        <div className="px-1 space-y-1">
          <div className="flex items-center justify-between gap-2 font-mono tabular-nums whitespace-nowrap">
            <span>Engine Splits</span>
            <span className="text-slate-300">45/20/15/20%</span>
          </div>
          <div className="flex items-center justify-between gap-2 font-mono tabular-nums whitespace-nowrap">
            <span>RUL Cap</span>
            <span className="text-slate-300">{rulCap} cycles</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-64 max-w-[82vw] h-full z-10">
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="absolute top-4 right-3 p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
