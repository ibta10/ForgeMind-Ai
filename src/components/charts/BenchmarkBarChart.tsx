import React, { useMemo, useState } from 'react';
import {
  TechnicalInterpretation,
  type TechnicalInterpretationProps,
} from './TechnicalInterpretation';

export interface BarDatum {
  id: string;
  label: string;
  value: number;
  ciLower?: number;
  ciUpper?: number;
  sublabel?: string;
  color: string;
  highlight?: boolean;
  note?: string;
}

interface BenchmarkBarChartProps {
  title: string;
  subtitle?: string;
  sampleScopeLabel?: string;
  xAxisLabel?: string;
  unit?: string;
  precision?: number;
  data: BarDatum[];
  interpretation?: TechnicalInterpretationProps;
}

export const BenchmarkBarChart: React.FC<BenchmarkBarChartProps> = ({
  title,
  subtitle,
  sampleScopeLabel,
  xAxisLabel,
  unit = '',
  precision = 2,
  data,
  interpretation,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const validData = useMemo(
    () => data.filter((d) => Number.isFinite(d.value) && d.value >= 0),
    [data],
  );

  const maxVal = useMemo(
    () =>
      Math.max(
        1e-6,
        ...validData.map((d) =>
          typeof d.ciUpper === 'number' && Number.isFinite(d.ciUpper)
            ? Math.max(d.value, d.ciUpper)
            : d.value,
        ),
      ),
    [validData],
  );

  const bestVal = useMemo(
    () => (validData.length > 0 ? Math.min(...validData.map((d) => d.value)) : 0),
    [validData],
  );

  const hasAnyCi = validData.some(
    (d) => typeof d.ciLower === 'number' && typeof d.ciUpper === 'number',
  );

  const scaleTicks = useMemo(
    () =>
      [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
        pct: frac * 100,
        val: maxVal * frac,
      })),
    [maxVal],
  );

  const hoveredItem = useMemo(
    () => validData.find((d) => d.id === hoveredId) ?? null,
    [validData, hoveredId],
  );

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            {sampleScopeLabel && (
              <span className="font-mono text-[11px] text-cyan-300/90 tabular-nums">
                · {sampleScopeLabel}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>

        {hasAnyCi && (
          <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap">
            Whiskers = 95% Bootstrap CI
          </span>
        )}
      </div>

      {validData.length === 0 ? (
        <div
          data-testid="benchmark-bar-empty"
          className="rounded-md border border-dashed border-slate-800 bg-[#080B12] px-4 py-10 text-center text-xs text-slate-400"
        >
          No valid comparison entries available for this subset or configuration.
        </div>
      ) : (
        <div className="space-y-3">
          {validData.map((item) => {
            const widthPct = Math.min(100, Math.max(2, (item.value / maxVal) * 100));
            const hasCi =
              typeof item.ciLower === 'number' &&
              typeof item.ciUpper === 'number' &&
              Number.isFinite(item.ciLower) &&
              Number.isFinite(item.ciUpper);
            const ciLeftPct = hasCi ? Math.min(100, Math.max(0, (item.ciLower! / maxVal) * 100)) : 0;
            const ciRightPct = hasCi ? Math.min(100, Math.max(0, (item.ciUpper! / maxVal) * 100)) : 0;
            const isHovered = hoveredId === item.id;

            return (
              <div
                key={item.id}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(item.id)}
                onBlur={() => setHoveredId(null)}
                tabIndex={0}
                className={`space-y-1 rounded px-1.5 py-1 -mx-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  isHovered ? 'bg-slate-800/35' : ''
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className={`truncate font-medium ${
                        item.highlight ? 'text-cyan-300' : 'text-slate-200'
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.sublabel && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-400 font-mono text-[11px] truncate">
                          {item.sublabel}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="font-mono tabular-nums text-slate-100 shrink-0">
                    {item.value.toFixed(precision)}
                    {unit ? <span className="ml-1 text-slate-400">{unit}</span> : null}
                    {hasCi && (
                      <span className="ml-2 text-[11px] text-slate-400">
                        [{item.ciLower!.toFixed(precision)}, {item.ciUpper!.toFixed(precision)}]
                      </span>
                    )}
                  </div>
                </div>

                <div className="relative h-5 w-full rounded bg-slate-900/90 border border-slate-800/80 overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: item.color,
                      opacity: item.highlight || isHovered ? 0.94 : 0.72,
                    }}
                  />
                  {hasCi && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-2.5 border-x border-slate-100"
                      style={{
                        left: `${ciLeftPct}%`,
                        width: `${Math.max(0.8, ciRightPct - ciLeftPct)}%`,
                      }}
                    >
                      <div className="absolute top-1/2 left-0 right-0 h-[1.5px] -translate-y-1/2 bg-slate-100" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Explicit Numeric X-Axis Scale & Unit Label */}
          <div className="pt-1 border-t border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
              {scaleTicks.map((t, i) => (
                <span key={i}>{t.val.toFixed(precision)}</span>
              ))}
            </div>
            {(xAxisLabel || unit) && (
              <div className="text-center text-[11px] text-slate-400">
                {xAxisLabel ?? `Scale (${unit})`} · Lower values sit further left
              </div>
            )}
          </div>

          {/* Interactive Technical Hover Explanation Bar */}
          <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-300">
            {hoveredItem ? (
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums">
                <span>
                  <strong className="text-slate-100 font-sans">{hoveredItem.label}:</strong>{' '}
                  {hoveredItem.value.toFixed(precision)}
                  {unit ? ` ${unit}` : ''}
                  {typeof hoveredItem.ciLower === 'number' && typeof hoveredItem.ciUpper === 'number'
                    ? ` (95% CI span ${(hoveredItem.ciUpper - hoveredItem.ciLower).toFixed(precision)} ${unit || ''})`
                    : ''}
                </span>
                <span className="text-cyan-300">
                  {hoveredItem.value <= bestVal + 1e-6
                    ? 'Lowest in cohort'
                    : `+${(hoveredItem.value - bestVal).toFixed(precision)}${unit ? ` ${unit}` : ''} vs best`}
                </span>
              </div>
            ) : (
              <span className="text-[11px] font-mono text-slate-400">
                Hover or focus any bar to inspect spread vs. best-performing entry
              </span>
            )}
          </div>
        </div>
      )}

      {interpretation && <TechnicalInterpretation {...interpretation} />}
    </div>
  );
};
