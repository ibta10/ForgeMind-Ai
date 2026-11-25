import React, { useId, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { METRIC_DEFINITIONS, type MetricId } from '../../engine/metricsCatalog';

export interface TechnicalInterpretationProps {
  title?: string;
  summary: string;
  whatItShows: string;
  conditionGuide?: {
    normal: string;
    warning: string;
    critical: string;
  };
  sampleScope?: string;
  metrics?: MetricId[];
  defaultOpen?: boolean;
}

export const TechnicalInterpretation: React.FC<TechnicalInterpretationProps> = ({
  title = 'Technical Interpretation',
  summary,
  whatItShows,
  conditionGuide,
  sampleScope,
  metrics = [],
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      className="rounded-md border border-slate-800/90 bg-[#080B12]/75 text-xs"
      data-testid="technical-interpretation"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-slate-800/35 transition-colors rounded-md focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
          <span className="font-medium text-slate-200 whitespace-nowrap">{title}</span>
          <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-400 truncate hidden sm:inline">{summary}</span>
        </div>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-cyan-300 shrink-0">
          {open ? 'Hide' : 'Expand'}
          {open ? (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          className="px-3.5 pb-3.5 pt-2.5 border-t border-slate-800/80 space-y-3 text-slate-300 leading-relaxed"
        >
          <div className="space-y-1">
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              How to Read This Chart
            </div>
            <p className="text-xs text-slate-300">{whatItShows}</p>
            {sampleScope && (
              <p className="text-[11px] font-mono text-slate-400 pt-0.5">
                Evaluation Scope: {sampleScope}
              </p>
            )}
          </div>

          {conditionGuide && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/70">
              <div className="rounded border border-emerald-500/30 bg-emerald-500/[0.04] px-2.5 py-2">
                <div className="font-mono text-[10px] font-bold uppercase text-emerald-300">
                  Normal Condition
                </div>
                <p className="mt-0.5 text-[11px] text-slate-300">{conditionGuide.normal}</p>
              </div>
              <div className="rounded border border-amber-500/30 bg-amber-500/[0.04] px-2.5 py-2">
                <div className="font-mono text-[10px] font-bold uppercase text-amber-300">
                  Watch / Warning
                </div>
                <p className="mt-0.5 text-[11px] text-slate-300">{conditionGuide.warning}</p>
              </div>
              <div className="rounded border border-rose-500/30 bg-rose-500/[0.04] px-2.5 py-2">
                <div className="font-mono text-[10px] font-bold uppercase text-rose-300">
                  Critical Risk
                </div>
                <p className="mt-0.5 text-[11px] text-slate-300">{conditionGuide.critical}</p>
              </div>
            </div>
          )}

          {metrics.length > 0 && (
            <div className="pt-2 border-t border-slate-800/70 space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                Metric Definitions
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {metrics.map((metricId) => {
                  const def = METRIC_DEFINITIONS[metricId];
                  if (!def) return null;
                  return (
                    <div
                      key={def.id}
                      className="rounded border border-slate-800 bg-[#0E131D]/80 px-2.5 py-2 space-y-1"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-slate-100">{def.name}</span>
                        <span className="font-mono text-[10px] text-cyan-300">{def.direction}</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {def.formulaHint} · Unit: {def.unit}
                      </div>
                      <p className="text-[11px] text-slate-300">{def.plainExplanation}</p>
                      <p className="text-[11px] text-slate-400">{def.engineeringImpact}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
