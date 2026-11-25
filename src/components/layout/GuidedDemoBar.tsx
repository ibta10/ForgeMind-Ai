import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  GUIDED_TOUR_STEPS,
  getScenarioChangedFields,
  type WorkbenchSimulationState,
} from '../../engine/guidedDemo';
import { MODEL_LABELS } from '../../engine/models';
import { REVIEWER_SCENARIOS, type ReviewerScenario } from '../../engine/portfolio';
import type { SubsetId } from '../../engine/types';

interface GuidedDemoBarProps {
  tourStepIndex: number | null;
  activeScenario: ReviewerScenario | null;
  workbenchState: WorkbenchSimulationState;
  onSelectTourStep: (index: number) => void;
  onExitTour: () => void;
  onApplyScenario: (scenario: ReviewerScenario) => void;
  onRestoreScenarioBaseline: () => void;
  onSelectSubset: (subset: SubsetId) => void;
  onResetDemo: () => void;
}

const SUBSET_QUICK_LABELS: Array<{ id: SubsetId; short: string }> = [
  { id: 'FD001', short: 'FD001 · 1 Regime / 1 Fault' },
  { id: 'FD002', short: 'FD002 · 6 Regimes / 1 Fault' },
  { id: 'FD003', short: 'FD003 · 1 Regime / 2 Faults' },
  { id: 'FD004', short: 'FD004 · 6 Regimes / 2 Faults' },
];

export const GuidedDemoBar: React.FC<GuidedDemoBarProps> = ({
  tourStepIndex,
  activeScenario,
  workbenchState,
  onSelectTourStep,
  onExitTour,
  onApplyScenario,
  onRestoreScenarioBaseline,
  onSelectSubset,
  onResetDemo,
}) => {
  if (tourStepIndex !== null) {
    const step = GUIDED_TOUR_STEPS[tourStepIndex] ?? GUIDED_TOUR_STEPS[0];
    const isFirst = tourStepIndex <= 0;
    const isLast = tourStepIndex >= GUIDED_TOUR_STEPS.length - 1;

    return (
      <section
        data-testid="guided-tour-panel"
        aria-label="Guided Interactive Walkthrough"
        className="mb-6 rounded-lg border border-cyan-500/45 bg-[#0E131D] p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-cyan-300">
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
              Guided Exploration · Step {step.stepNumber} of {GUIDED_TOUR_STEPS.length}
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="font-mono text-blue-300">{step.pageLabel}</span>
            <span aria-hidden="true" className="text-slate-600 hidden sm:inline">
              ·
            </span>
            <span className="text-slate-400 hidden sm:inline">{step.topicSummary}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetDemo}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#080B12] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Demonstration
            </button>
            <button
              type="button"
              onClick={onExitTour}
              aria-label="Close guided walkthrough"
              className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Step Selector Strip */}
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Guided tour steps"
        >
          {GUIDED_TOUR_STEPS.map((item, idx) => {
            const active = idx === tourStepIndex;
            const visited = idx < tourStepIndex;
            const shortTabNames: Record<string, string> = {
              orientation: 'Overview',
              subsets_and_telemetry: 'Subsets & Telemetry',
              surrogate_comparison: 'Surrogates',
              conformal_uncertainty: 'Conformal UQ',
              maintenance_policies: 'Policies',
              sensitivity_analysis: 'Sensitivity',
              export_reproducibility: 'Export & PDF',
            };
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectTourStep(idx)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  active
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : visited
                      ? 'bg-slate-800/80 text-cyan-300 hover:bg-slate-800'
                      : 'bg-[#080B12] text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                {item.stepNumber}. {shortTabNames[item.id] ?? item.pageLabel}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-8 space-y-1.5">
            <h2 className="font-display text-base font-semibold text-slate-100">
              {step.title}
            </h2>
            <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed">
              {step.explanation}
            </p>
            <p className="text-xs text-cyan-300/95 leading-relaxed pt-0.5">
              <strong className="font-semibold text-cyan-200">Investigate:</strong> {step.tryAction}
            </p>

            {step.id === 'subsets_and_telemetry' && (
              <div className="pt-2 flex flex-wrap items-center gap-1.5">
                {SUBSET_QUICK_LABELS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectSubset(s.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors whitespace-nowrap ${
                      workbenchState.subset === s.id
                        ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200 font-semibold'
                        : 'border-slate-800 bg-[#080B12] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {s.short}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 flex flex-wrap lg:justify-end items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => onSelectTourStep(tourStepIndex - 1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#080B12] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Previous
            </button>

            {!isLast ? (
              <button
                type="button"
                onClick={() => onSelectTourStep(tourStepIndex + 1)}
                className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap"
              >
                Next Step
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onExitTour}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap"
              >
                Finish Walkthrough
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (activeScenario) {
    const diffs = getScenarioChangedFields(workbenchState, activeScenario);
    const isModified = diffs.length > 0;

    return (
      <section
        data-testid="guided-scenario-panel"
        aria-label="Active Guided Scenario Inspector"
        className="mb-6 rounded-lg border border-blue-500/40 bg-[#0E131D] p-4 sm:p-5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-blue-300">
              <Play className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              Guided Scenario: {activeScenario.title}
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="font-mono text-slate-300 tabular-nums">
              Live: {workbenchState.subset} · {MODEL_LABELS[workbenchState.selectedModel]} ·{' '}
              {workbenchState.regimeAware ? 'Regime-Aware' : 'Global'} · Cp=${workbenchState.maintConfig.preventiveCost} · Cf=${workbenchState.maintConfig.failureCost} · α={workbenchState.alpha.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRestoreScenarioBaseline}
              disabled={!isModified}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium border transition-colors whitespace-nowrap ${
                isModified
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                  : 'border-slate-800 bg-[#080B12] text-slate-500 cursor-not-allowed'
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              Return to Original Config
            </button>
            <button
              type="button"
              onClick={onResetDemo}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#080B12] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Demonstration
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-7 space-y-1.5">
            <p className="text-xs sm:text-[13px] text-slate-200 leading-relaxed">
              <strong className="font-semibold text-cyan-300">What to Investigate:</strong>{' '}
              {activeScenario.investigationFocus}
            </p>
            <div className="text-[11px] font-mono">
              {isModified ? (
                <span className="text-amber-300">
                  Modified parameters: {diffs.join(' · ')}
                </span>
              ) : (
                <span className="text-emerald-300">
                  Original scenario configuration active — modify any control below to explore parameter sensitivity.
                </span>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-1.5">
            <div className="text-[11px] font-mono text-slate-400">
              Try Adjusting Live Controls
            </div>
            <ul className="space-y-1 text-xs text-slate-300">
              {activeScenario.suggestedExperiments.map((exp) => (
                <li key={exp} className="leading-snug">
                  • {exp}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800/70 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] font-mono text-slate-400">Switch Scenario:</span>
          {REVIEWER_SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => onApplyScenario(sc)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap ${
                sc.id === activeScenario.id
                  ? 'border-cyan-500/55 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-800 bg-[#080B12] text-slate-400 hover:text-slate-200'
              }`}
            >
              {sc.title}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return null;
};
