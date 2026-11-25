import React, { useId, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import {
  METRIC_DEFINITIONS,
  METRIC_ORDER,
  type MetricCategory,
  type MetricId,
} from '../../engine/metricsCatalog';

interface MetricGlossaryPanelProps {
  title?: string;
  description?: string;
  highlightedMetrics?: MetricId[];
  defaultOpen?: boolean;
}

const CATEGORY_LABELS: Record<'all' | MetricCategory, string> = {
  all: 'All 10 Metrics',
  accuracy: 'Prognostic Error',
  uncertainty: 'Conformal Uncertainty',
  economics: 'Maintenance Economics',
};

export const MetricGlossaryPanel: React.FC<MetricGlossaryPanelProps> = ({
  title = 'Engineering Metrics & Formula Reference',
  description = 'Plain-language definitions and decision tradeoffs for all evaluation metrics displayed across the workbench',
  highlightedMetrics,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [category, setCategory] = useState<'all' | MetricCategory>('all');
  const contentId = useId();

  const metricsToShow = useMemo(() => {
    const baseList =
      highlightedMetrics && highlightedMetrics.length > 0 && category === 'all'
        ? METRIC_ORDER.slice().sort((a, b) => {
            const aHi = highlightedMetrics.includes(a) ? 0 : 1;
            const bHi = highlightedMetrics.includes(b) ? 0 : 1;
            return aHi - bHi;
          })
        : METRIC_ORDER;

    return baseList
      .map((id) => METRIC_DEFINITIONS[id])
      .filter((def) => category === 'all' || def.category === category);
  }, [highlightedMetrics, category]);

  return (
    <section
      className="rounded-lg border border-slate-800 bg-[#0E131D]"
      data-testid="metric-glossary-panel"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-slate-800/30 transition-colors rounded-lg focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <BookOpen className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-cyan-300 shrink-0">
          {open ? 'Collapse Guide' : 'Open Metric Guide (10 Terms)'}
          {open ? (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {open && (
        <div id={contentId} className="px-5 pb-5 pt-3 border-t border-slate-800 space-y-4">
          <div
            role="group"
            aria-label="Filter metrics by category"
            className="flex flex-wrap items-center gap-1.5"
          >
            {(['all', 'accuracy', 'uncertainty', 'economics'] as const).map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'border-cyan-500/45 bg-cyan-500/15 text-cyan-300'
                      : 'border-slate-800 bg-[#080B12] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {metricsToShow.map((def) => {
              const isHighlighted = highlightedMetrics?.includes(def.id);
              return (
                <div
                  key={def.id}
                  data-testid={`metric-def-${def.id}`}
                  className={`rounded-md border p-3.5 space-y-1.5 ${
                    isHighlighted
                      ? 'border-cyan-500/35 bg-cyan-500/[0.04]'
                      : 'border-slate-800 bg-[#080B12]'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-xs font-semibold text-slate-100">{def.name}</h4>
                    <span className="font-mono text-[10px] text-cyan-300">{def.direction}</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {def.formulaHint} · <span className="text-slate-300">Unit: {def.unit}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{def.plainExplanation}</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <strong className="text-slate-300 font-medium">Why it matters:</strong>{' '}
                    {def.engineeringImpact}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
