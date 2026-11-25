import React, { useId, useMemo, useState } from 'react';
import {
  TechnicalInterpretation,
  type TechnicalInterpretationProps,
} from './TechnicalInterpretation';

export interface TelemetrySeries {
  id: string;
  label: string;
  color: string;
  dashed?: boolean;
  values: Array<{ x: number; y: number }>;
}

export interface ShadedBand {
  label: string;
  color: string;
  points: Array<{ x: number; lower: number; upper: number }>;
}

export interface BreachMarker {
  x: number;
  y: number;
  label: string;
  color?: string;
}

interface TelemetryChartProps {
  title: string;
  subtitle?: string;
  sampleScopeLabel?: string;
  yLabel: string;
  xLabel?: string;
  xUnit?: string;
  series: TelemetrySeries[];
  band?: ShadedBand;
  thresholdY?: number;
  thresholdLabel?: string;
  highlightBelowThreshold?: boolean;
  criticalZoneLabel?: string;
  breachMarkers?: BreachMarker[];
  height?: number;
  unit?: string;
  tickPrecision?: number;
  valuePrecision?: number;
  xPrecision?: number;
  clampZero?: boolean;
  xDomain?: [number, number];
  yDomain?: [number, number];
  cursorX?: number;
  emptyMessage?: string;
  interpretation?: TechnicalInterpretationProps;
}

function formatTickValue(val: number, tickPrecision?: number): string {
  if (!Number.isFinite(val)) return '—';
  if (typeof tickPrecision === 'number') return val.toFixed(tickPrecision);
  const abs = Math.abs(val);
  if (abs >= 100) return val.toFixed(0);
  if (abs >= 10) return val.toFixed(1);
  return val.toFixed(2);
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({
  title,
  subtitle,
  sampleScopeLabel,
  yLabel,
  xLabel = 'Operating Cycle',
  xUnit = '',
  series,
  band,
  thresholdY,
  thresholdLabel,
  highlightBelowThreshold = false,
  criticalZoneLabel,
  breachMarkers,
  height = 280,
  unit = '',
  tickPrecision,
  valuePrecision = 2,
  xPrecision = 0,
  clampZero = false,
  xDomain,
  yDomain,
  cursorX,
  emptyMessage = 'No trajectory points available for the selected engine or parameter range.',
  interpretation,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const reactId = useId();
  const safeId = reactId.replace(/[^a-zA-Z0-9_-]/g, '');
  const criticalClipId = `critical-clip-${safeId}`;
  const plotClipId = `plot-clip-${safeId}`;

  const sanitizedSeries = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        values: s.values.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      })),
    [series],
  );

  const hasData = sanitizedSeries.some((s) => s.values.length > 0);

  const width = 760;
  const pad = { top: 20, right: 24, bottom: 48, left: 68 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const { xMin, xMax, yMin, yMax, primaryXs } = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of sanitizedSeries) {
      for (const p of s.values) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    if (band) {
      for (const p of band.points) {
        if (Number.isFinite(p.x) && Number.isFinite(p.lower) && Number.isFinite(p.upper)) {
          xs.push(p.x);
          ys.push(p.lower, p.upper);
        }
      }
    }
    if (typeof thresholdY === 'number' && Number.isFinite(thresholdY)) {
      ys.push(thresholdY);
    }
    const minX = xDomain ? xDomain[0] : xs.length > 0 ? Math.min(...xs) : 0;
    const maxX = xDomain ? xDomain[1] : xs.length > 0 ? Math.max(...xs) : 100;
    const rawMinY = yDomain ? yDomain[0] : ys.length > 0 ? Math.min(...ys) : 0;
    const rawMaxY = yDomain ? yDomain[1] : ys.length > 0 ? Math.max(...ys) : 100;
    const span = Math.max(1e-3, rawMaxY - rawMinY);
    const baseSeries = sanitizedSeries[0]?.values ?? [];
    const paddedMin = yDomain ? rawMinY : rawMinY - span * 0.06;

    return {
      xMin: minX,
      xMax: maxX === minX ? minX + 1 : maxX,
      yMin: clampZero && !yDomain ? Math.max(0, paddedMin) : paddedMin,
      yMax: yDomain ? rawMaxY : rawMaxY + span * 0.08,
      primaryXs: baseSeries.map((p) => p.x),
    };
  }, [sanitizedSeries, band, thresholdY, clampZero, xDomain, yDomain]);

  const mapX = (x: number) => pad.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const mapY = (y: number) => pad.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  const yTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => {
      const val = yMin + ((yMax - yMin) * i) / count;
      return { val, y: mapY(val) };
    });
  }, [yMin, yMax, plotH]);

  const xTicks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) => {
      const raw = xMin + ((xMax - xMin) * i) / count;
      const val = xPrecision === 0 ? Math.round(raw) : Number(raw.toFixed(xPrecision));
      return { val, x: mapX(val) };
    });
  }, [xMin, xMax, plotW, xPrecision]);

  const bandPath = useMemo(() => {
    if (!band || band.points.length < 2) return '';
    const valid = band.points.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.lower) && Number.isFinite(p.upper),
    );
    if (valid.length < 2) return '';
    const topEdge = valid
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapX(p.x).toFixed(1)} ${mapY(p.upper).toFixed(1)}`)
      .join(' ');
    const bottomEdge = [...valid]
      .reverse()
      .map((p) => `L ${mapX(p.x).toFixed(1)} ${mapY(p.lower).toFixed(1)}`)
      .join(' ');
    return `${topEdge} ${bottomEdge} Z`;
  }, [band, xMin, xMax, yMin, yMax]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (primaryXs.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const dataX = xMin + ((relX - pad.left) / plotW) * (xMax - xMin);
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < primaryXs.length; i++) {
      const d = Math.abs(primaryXs[i] - dataX);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (primaryXs.length === 0) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHoverIdx((prev) => (prev === null ? primaryXs.length - 1 : Math.max(0, prev - 1)));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHoverIdx((prev) => (prev === null ? 0 : Math.min(primaryXs.length - 1, prev + 1)));
    } else if (e.key === 'Escape') {
      setHoverIdx(null);
    }
  };

  const activeX = hoverIdx !== null && primaryXs[hoverIdx] !== undefined ? primaryXs[hoverIdx] : null;

  const lookupYAtX = (values: Array<{ x: number; y: number }>, targetX: number): number | null => {
    if (values.length === 0) return null;
    for (let i = 0; i < values.length; i++) {
      const p = values[i];
      if (Math.abs(p.x - targetX) < 1e-6) return p.y;
      const next = values[i + 1];
      if (next && ((p.x <= targetX && next.x >= targetX) || (p.x >= targetX && next.x <= targetX))) {
        const span = next.x - p.x;
        if (Math.abs(span) < 1e-9) return p.y;
        const t = (targetX - p.x) / span;
        return p.y + t * (next.y - p.y);
      }
    }
    return null;
  };

  const activeBandPoint = useMemo(() => {
    if (activeX === null || !band) return null;
    if (
      hoverIdx !== null &&
      band.points[hoverIdx] &&
      Math.abs(band.points[hoverIdx].x - activeX) < 1e-6
    ) {
      return band.points[hoverIdx];
    }
    return band.points.find((pt) => Math.abs(pt.x - activeX) < 1e-6) ?? null;
  }, [activeX, band, hoverIdx]);

  const hoverStatusInfo = useMemo(() => {
    if (activeX === null || typeof thresholdY !== 'number' || !highlightBelowThreshold) return null;
    const predSeries = sanitizedSeries.find((s) => !s.dashed) ?? sanitizedSeries[0];
    const predVal = predSeries ? lookupYAtX(predSeries.values, activeX) : null;
    if (predVal === null) return null;
    const lb = activeBandPoint?.lower;
    if (predVal <= thresholdY) {
      return {
        label: 'CRITICAL ZONE',
        cls: 'text-rose-300',
        note: `Point estimate (${predVal.toFixed(1)} ${unit || 'cyc'}) is at or below safety trigger τ = ${thresholdY}.`,
      };
    }
    if (typeof lb === 'number' && lb <= thresholdY) {
      return {
        label: 'WATCH / CONFORMAL TRIGGER',
        cls: 'text-amber-300',
        note: `Conformal lower bound (${lb.toFixed(1)} ${unit || 'cyc'}) breached τ = ${thresholdY} before point estimate.`,
      };
    }
    if (predVal <= thresholdY + 25) {
      return {
        label: 'WATCH WINDOW',
        cls: 'text-amber-300',
        note: `Within 25 cycles of trigger τ = ${thresholdY}; prepare maintenance scheduling.`,
      };
    }
    return {
      label: 'NORMAL MARGIN',
      cls: 'text-emerald-300',
      note: `Operating safely above τ = ${thresholdY} trigger threshold.`,
    };
  }, [activeX, thresholdY, highlightBelowThreshold, sanitizedSeries, activeBandPoint, unit]);

  const tooltipLeftPct =
    activeX !== null ? ((mapX(activeX) / width) * 100) : 50;
  const tooltipAlignRight = tooltipLeftPct > 58;

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            {sampleScopeLabel && (
              <span className="font-mono text-[11px] text-cyan-300/90 tabular-nums">
                · {sampleScopeLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {subtitle ?? `${yLabel} vs. ${xLabel}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
          {band && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-3.5 rounded-xs border border-amber-400/50"
                style={{ backgroundColor: band.color }}
              />
              {band.label}
            </span>
          )}
          {highlightBelowThreshold && typeof thresholdY === 'number' && (
            <span className="inline-flex items-center gap-1.5 text-rose-300">
              <span className="inline-block h-0.5 w-3.5 bg-rose-500" />
              Critical Zone (≤ {thresholdY} {unit || 'cyc'})
            </span>
          )}
          {sanitizedSeries.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-3.5"
                style={{
                  backgroundColor: s.dashed ? 'transparent' : s.color,
                  borderTop: s.dashed ? `2px dashed ${s.color}` : undefined,
                }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div
          data-testid="telemetry-chart-empty"
          className="rounded-md border border-dashed border-slate-800 bg-[#080B12] px-4 py-12 text-center space-y-1.5"
        >
          <div className="text-xs font-semibold text-slate-200">No Telemetry Points Available</div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">{emptyMessage}</p>
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto cursor-crosshair select-none focus-visible:outline-2 focus-visible:outline-cyan-400 rounded"
            role="img"
            tabIndex={0}
            aria-label={`${title}. ${yLabel} versus ${xLabel}.`}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
            onKeyDown={handleKeyDown}
          >
            <defs>
              <clipPath id={plotClipId}>
                <rect x={pad.left} y={pad.top} width={plotW} height={plotH} />
              </clipPath>
              {highlightBelowThreshold && typeof thresholdY === 'number' && (
                <clipPath id={criticalClipId}>
                  <rect
                    x={pad.left}
                    y={Math.max(pad.top, Math.min(height - pad.bottom, mapY(thresholdY)))}
                    width={plotW}
                    height={Math.max(
                      0,
                      height -
                        pad.bottom -
                        Math.max(pad.top, Math.min(height - pad.bottom, mapY(thresholdY))),
                    )}
                  />
                </clipPath>
              )}
            </defs>

            {/* Horizontal gridlines */}
            {yTicks.map((t, idx) => (
              <g key={idx}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={t.y}
                  y2={t.y}
                  stroke="#1E293B"
                  strokeWidth={1}
                />
                <text
                  x={pad.left - 8}
                  y={t.y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono tabular-nums"
                >
                  {formatTickValue(t.val, tickPrecision)}
                </text>
              </g>
            ))}

            {/* X axis ticks */}
            {xTicks.map((t, idx) => (
              <g key={idx}>
                <line
                  x1={t.x}
                  x2={t.x}
                  y1={pad.top}
                  y2={height - pad.bottom}
                  stroke="#1E293B"
                  strokeWidth={0.6}
                  strokeDasharray="2 3"
                />
                <text
                  x={t.x}
                  y={height - pad.bottom + 14}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-mono tabular-nums"
                >
                  {xPrecision === 0 ? t.val : t.val.toFixed(xPrecision)}
                  {xUnit ? xUnit : ''}
                </text>
              </g>
            ))}

            {/* Plot Axes Frame */}
            <line
              x1={pad.left}
              x2={pad.left}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke="#334155"
              strokeWidth={1}
            />
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={height - pad.bottom}
              y2={height - pad.bottom}
              stroke="#334155"
              strokeWidth={1}
            />

            {/* Explicit Axis Titles */}
            <text
              x={pad.left + plotW / 2}
              y={height - 6}
              textAnchor="middle"
              className="fill-slate-400 text-[10.5px] font-sans"
            >
              {xLabel}
            </text>
            <text
              x={15}
              y={pad.top + plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90 15 ${pad.top + plotH / 2})`}
              className="fill-slate-400 text-[10.5px] font-sans"
            >
              {yLabel}
            </text>

            {/* Critical Safety Zone Band below thresholdY */}
            {highlightBelowThreshold && typeof thresholdY === 'number' && (
              <g data-testid="critical-safety-zone">
                <rect
                  x={pad.left}
                  y={Math.max(pad.top, Math.min(height - pad.bottom, mapY(thresholdY)))}
                  width={plotW}
                  height={Math.max(
                    0,
                    height -
                      pad.bottom -
                      Math.max(pad.top, Math.min(height - pad.bottom, mapY(thresholdY))),
                  )}
                  fill="rgba(244, 63, 94, 0.11)"
                />
                {criticalZoneLabel && (
                  <text
                    x={pad.left + 8}
                    y={Math.min(height - pad.bottom - 6, mapY(thresholdY) + 14)}
                    textAnchor="start"
                    className="fill-rose-300/90 text-[10px] font-mono"
                  >
                    {criticalZoneLabel}
                  </text>
                )}
              </g>
            )}

            {/* Conformal uncertainty band */}
            {bandPath && (
              <path d={bandPath} fill={band?.color ?? 'rgba(245, 158, 11, 0.16)'} stroke="none" />
            )}

            {/* Conformal band critical overlap highlight */}
            {highlightBelowThreshold && typeof thresholdY === 'number' && bandPath && (
              <path
                d={bandPath}
                fill="rgba(244, 63, 94, 0.22)"
                stroke="none"
                clipPath={`url(#${criticalClipId})`}
              />
            )}

            {/* Threshold reference line */}
            {typeof thresholdY === 'number' && (
              <g>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={mapY(thresholdY)}
                  y2={mapY(thresholdY)}
                  stroke="#F43F5E"
                  strokeWidth={1.35}
                  strokeDasharray="5 4"
                />
                {thresholdLabel && (
                  <text
                    x={width - pad.right - 4}
                    y={mapY(thresholdY) - 6}
                    textAnchor="end"
                    stroke="#080B12"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="fill-rose-300 text-[10px] font-mono"
                  >
                    {thresholdLabel}
                  </text>
                )}
              </g>
            )}

            {/* Signal paths */}
            <g clipPath={`url(#${plotClipId})`}>
              {sanitizedSeries.map((s) => {
                if (s.values.length === 0) return null;
                if (s.values.length === 1) {
                  const p = s.values[0];
                  const inDanger =
                    highlightBelowThreshold &&
                    !s.dashed &&
                    typeof thresholdY === 'number' &&
                    p.y <= thresholdY;
                  return (
                    <circle
                      key={s.id}
                      cx={mapX(p.x)}
                      cy={mapY(p.y)}
                      r={inDanger ? 4 : 3}
                      fill={inDanger ? '#F43F5E' : s.color}
                    />
                  );
                }
                const d = s.values
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapX(p.x).toFixed(1)} ${mapY(p.y).toFixed(1)}`)
                  .join(' ');
                const shouldHighlight =
                  highlightBelowThreshold && !s.dashed && typeof thresholdY === 'number';
                return (
                  <g key={s.id} data-testid={`series-${s.id}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.dashed ? 1.6 : 2}
                      strokeDasharray={s.dashed ? '5 4' : undefined}
                    />
                    {shouldHighlight && (
                      <g clipPath={`url(#${criticalClipId})`} data-testid={`critical-segment-${s.id}`}>
                        <path
                          d={d}
                          fill="none"
                          stroke="rgba(244, 63, 94, 0.35)"
                          strokeWidth={6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d={d}
                          fill="none"
                          stroke="#F43F5E"
                          strokeWidth={2.75}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Critical threshold crossing / breach markers */}
            {breachMarkers &&
              breachMarkers.map((m, idx) => {
                const cx = mapX(m.x);
                const cy = mapY(m.y);
                const clr = m.color ?? '#F43F5E';
                const isBottomMarker = cy >= height - pad.bottom - 14;
                const anchorEnd = isBottomMarker
                  ? cx > width - pad.right - 150
                  : cx > pad.left + 150;
                const labelX = anchorEnd ? cx - 6 : cx + 8;
                const thresholdLineY =
                  typeof thresholdY === 'number' ? mapY(thresholdY) : null;
                let rawLabelY = isBottomMarker
                  ? anchorEnd
                    ? cy - 52
                    : cy - 12
                  : cy - 10;
                if (
                  thresholdLineY !== null &&
                  cx > width - pad.right - 280 &&
                  Math.abs(rawLabelY - (thresholdLineY - 6)) < 18
                ) {
                  rawLabelY = thresholdLineY - 24;
                }
                const labelY = Math.max(pad.top + 14, rawLabelY);
                const guideTopY = isBottomMarker && labelY < cy - 18 ? labelY + 4 : cy;
                return (
                  <g key={`breach-${idx}`}>
                    <line
                      x1={cx}
                      x2={cx}
                      y1={guideTopY}
                      y2={height - pad.bottom}
                      stroke={clr}
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      opacity={0.75}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4.5}
                      fill="#080B12"
                      stroke={clr}
                      strokeWidth={2}
                    />
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor={anchorEnd ? 'end' : 'start'}
                      fill={clr}
                      stroke="#080B12"
                      strokeWidth={3}
                      paintOrder="stroke"
                      className="text-[10px] font-mono font-semibold"
                    >
                      {m.label}
                    </text>
                  </g>
                );
              })}

            {/* Playback cursor playhead */}
            {typeof cursorX === 'number' && (
              <g>
                <line
                  x1={mapX(cursorX)}
                  x2={mapX(cursorX)}
                  y1={pad.top}
                  y2={height - pad.bottom}
                  stroke="#22D3EE"
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                  opacity={0.75}
                />
                {sanitizedSeries.map((s) => {
                  const pt = s.values[s.values.length - 1];
                  if (!pt || Math.abs(pt.x - cursorX) > 0.5) return null;
                  const inDanger =
                    highlightBelowThreshold &&
                    !s.dashed &&
                    typeof thresholdY === 'number' &&
                    pt.y <= thresholdY;
                  return (
                    <circle
                      key={`cursor-${s.id}`}
                      cx={mapX(pt.x)}
                      cy={mapY(pt.y)}
                      r={inDanger ? 4.5 : 3.5}
                      fill={inDanger ? '#F43F5E' : s.color}
                      stroke="#080B12"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </g>
            )}

            {/* Interactive crosshair */}
            {activeX !== null && (
              <g>
                <line
                  x1={mapX(activeX)}
                  x2={mapX(activeX)}
                  y1={pad.top}
                  y2={height - pad.bottom}
                  stroke="#64748B"
                  strokeWidth={1}
                />
                {sanitizedSeries.map((s) => {
                  const ptY = lookupYAtX(s.values, activeX);
                  if (ptY === null) return null;
                  return (
                    <circle
                      key={s.id}
                      cx={mapX(activeX)}
                      cy={mapY(ptY)}
                      r={3.5}
                      fill={s.color}
                      stroke="#080B12"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </g>
            )}
          </svg>

          {/* Floating Interactive Hover Tooltip */}
          {activeX !== null && (
            <div
              role="status"
              data-testid="telemetry-hover-tooltip"
              className="pointer-events-none hidden sm:block absolute top-2 z-20 w-64 rounded-md border border-slate-700/90 bg-[#080B12]/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur-xs"
              style={{
                left: tooltipAlignRight
                  ? `calc(${tooltipLeftPct.toFixed(1)}% - 268px)`
                  : `calc(${tooltipLeftPct.toFixed(1)}% + 12px)`,
              }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1 font-mono tabular-nums">
                <span className="font-semibold text-slate-100">
                  {xLabel}: {xPrecision === 0 ? Math.round(activeX) : activeX.toFixed(xPrecision)}
                  {xUnit}
                </span>
                {hoverStatusInfo && (
                  <span className={`text-[10px] font-bold ${hoverStatusInfo.cls}`}>
                    {hoverStatusInfo.label}
                  </span>
                )}
              </div>
              <div className="mt-1.5 space-y-1 font-mono tabular-nums">
                {sanitizedSeries.map((s) => {
                  const ptY = lookupYAtX(s.values, activeX);
                  if (ptY === null) return null;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2">
                      <span className="truncate" style={{ color: s.color }}>
                        {s.label}
                      </span>
                      <span className="text-slate-100 shrink-0">
                        {ptY.toFixed(valuePrecision)}
                        {unit ? ` ${unit}` : ''}
                      </span>
                    </div>
                  );
                })}
                {activeBandPoint && (
                  <div className="flex items-center justify-between gap-2 text-amber-300 pt-0.5 border-t border-slate-800/80">
                    <span>Conformal Band</span>
                    <span>
                      [{activeBandPoint.lower.toFixed(1)}, {activeBandPoint.upper.toFixed(1)}] (w=
                      {(activeBandPoint.upper - activeBandPoint.lower).toFixed(1)}c)
                    </span>
                  </div>
                )}
              </div>
              {hoverStatusInfo && (
                <p className="mt-1.5 pt-1 border-t border-slate-800/80 text-[10px] text-slate-300 leading-snug font-sans">
                  {hoverStatusInfo.note}
                </p>
              )}
            </div>
          )}

          {/* Monospace coordinate readout bar */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-xs font-mono tabular-nums text-slate-400">
            <span>
              {activeX !== null
                ? `${xLabel}: ${xPrecision === 0 ? Math.round(activeX) : activeX.toFixed(xPrecision)}${xUnit}`
                : 'Hover plot or use arrow keys for cycle readout'}
            </span>
            <div className="flex flex-wrap items-center gap-4">
              {activeX !== null &&
                sanitizedSeries.map((s) => {
                  const ptY = lookupYAtX(s.values, activeX);
                  if (ptY === null) return null;
                  return (
                    <span key={s.id} style={{ color: s.color }}>
                      {s.label}: {ptY.toFixed(valuePrecision)}
                      {unit ? ` ${unit}` : ''}
                    </span>
                  );
                })}
              {activeX !== null && activeBandPoint && (
                <span className="text-amber-300">
                  Band: [{activeBandPoint.lower.toFixed(1)}, {activeBandPoint.upper.toFixed(1)}] · w=
                  {(activeBandPoint.upper - activeBandPoint.lower).toFixed(1)}c
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {interpretation && <TechnicalInterpretation {...interpretation} />}
    </div>
  );
};
