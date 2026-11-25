import React, { useMemo, useState } from 'react';
import { REGIME_CENTERS } from '../../engine/cmapss';
import {
  TechnicalInterpretation,
  type TechnicalInterpretationProps,
} from './TechnicalInterpretation';

export interface RegimePoint {
  os1: number;
  os2: number;
  os3: number;
  regime: number;
}

interface RegimeScatterChartProps {
  points: RegimePoint[];
  conditions: number;
  fleetEngineCount?: number;
  interpretation?: TechnicalInterpretationProps;
}

const REGIME_COLORS = ['#06B6D4', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#38BDF8'];

export const RegimeScatterChart: React.FC<RegimeScatterChartProps> = ({
  points,
  conditions,
  fleetEngineCount,
  interpretation,
}) => {
  const [hoveredRegime, setHoveredRegime] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<RegimePoint | null>(null);

  const width = 560;
  const height = 284;
  const pad = { top: 20, right: 20, bottom: 48, left: 62 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const mapX = (os1: number) => pad.left + (Math.max(-2, Math.min(45, os1)) / 45) * plotW;
  const mapY = (os2: number) => pad.top + (1 - Math.max(-0.05, Math.min(0.95, os2)) / 0.95) * plotH;

  const sampled = useMemo(() => points.slice(0, 320), [points]);

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Operating Regime Clustering (k-means, k = {conditions})
          </h3>
          <p className="text-xs text-slate-400">
            Flight-envelope Altitude (OS1) vs. Mach Number (OS2) across {sampled.length} sampled cycles
            {typeof fleetEngineCount === 'number' ? ` (${fleetEngineCount} synthetic units)` : ''}
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-cyan-300">
          {hoveredRegime !== null
            ? `Regime ${hoveredRegime + 1}: ${REGIME_CENTERS[hoveredRegime]?.label ?? ''}`
            : `${conditions} active cluster${conditions > 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Explicit Cluster Color & Centroid Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-300 border-t border-slate-800/80 pt-2">
        {REGIME_CENTERS.slice(0, conditions).map((c, idx) => (
          <button
            key={c.label}
            type="button"
            onMouseEnter={() => setHoveredRegime(idx)}
            onMouseLeave={() => setHoveredRegime(null)}
            onClick={() => setHoveredRegime((prev) => (prev === idx ? null : idx))}
            className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${
              hoveredRegime === idx ? 'bg-slate-800 text-white' : 'hover:text-white'
            }`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: REGIME_COLORS[idx % REGIME_COLORS.length] }}
            />
            <span>R{idx + 1}</span>
          </button>
        ))}
        <span className="inline-flex items-center gap-1.5 text-slate-400 ml-auto">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-slate-200" />
          k-means Centroid
        </span>
      </div>

      {sampled.length === 0 ? (
        <div
          data-testid="regime-scatter-empty"
          className="rounded-md border border-dashed border-slate-800 bg-[#080B12] px-4 py-12 text-center text-xs text-slate-400"
        >
          No operating condition samples available for regime clustering.
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none"
            role="img"
            aria-label={`Operating regime scatter plot of Mach Number OS2 versus Altitude OS1 across ${conditions} flight clusters`}
          >
            {[0, 0.25, 0.5, 0.75, 0.9].map((v) => (
              <g key={v}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={mapY(v)}
                  y2={mapY(v)}
                  stroke="#1E293B"
                  strokeWidth={1}
                />
                <text
                  x={pad.left - 8}
                  y={mapY(v) + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono tabular-nums"
                >
                  {v.toFixed(2)}
                </text>
              </g>
            ))}
            {[0, 10, 20, 30, 42].map((v) => (
              <g key={v}>
                <line
                  x1={mapX(v)}
                  x2={mapX(v)}
                  y1={pad.top}
                  y2={height - pad.bottom}
                  stroke="#1E293B"
                  strokeWidth={0.7}
                  strokeDasharray="2 3"
                />
                <text
                  x={mapX(v)}
                  y={height - pad.bottom + 14}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-mono tabular-nums"
                >
                  {v}k ft
                </text>
              </g>
            ))}

            {/* Axes & Explicit Titles */}
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
            <text
              x={pad.left + plotW / 2}
              y={height - 6}
              textAnchor="middle"
              className="fill-slate-400 text-[10.5px] font-sans"
            >
              Operating Setting 1: Altitude (1,000 ft)
            </text>
            <text
              x={15}
              y={pad.top + plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90 15 ${pad.top + plotH / 2})`}
              className="fill-slate-400 text-[10.5px] font-sans"
            >
              Operating Setting 2: Mach Number
            </text>

            {sampled.map((pt, idx) => {
              const dimmed = hoveredRegime !== null && hoveredRegime !== pt.regime;
              const isPointHovered = hoveredPoint === pt;
              return (
                <circle
                  key={idx}
                  cx={mapX(pt.os1)}
                  cy={mapY(pt.os2)}
                  r={isPointHovered ? 4.5 : 3}
                  fill={REGIME_COLORS[pt.regime % REGIME_COLORS.length]}
                  fillOpacity={dimmed ? 0.18 : 0.8}
                  stroke={isPointHovered ? '#F8FAFC' : 'none'}
                  strokeWidth={isPointHovered ? 1.5 : 0}
                  onMouseEnter={() => {
                    setHoveredRegime(pt.regime);
                    setHoveredPoint(pt);
                  }}
                  onMouseLeave={() => {
                    setHoveredRegime(null);
                    setHoveredPoint(null);
                  }}
                />
              );
            })}

            {REGIME_CENTERS.slice(0, conditions).map((c, idx) => (
              <g
                key={idx}
                role="button"
                tabIndex={0}
                aria-label={`Highlight Regime ${idx + 1}: ${c.label}`}
                onMouseEnter={() => setHoveredRegime(idx)}
                onMouseLeave={() => setHoveredRegime(null)}
                onFocus={() => setHoveredRegime(idx)}
                onBlur={() => setHoveredRegime(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setHoveredRegime((prev) => (prev === idx ? null : idx));
                  }
                }}
                className="cursor-pointer focus:outline-none"
              >
                <circle
                  cx={mapX(c.os1)}
                  cy={mapY(c.os2)}
                  r={6.5}
                  fill="none"
                  stroke={hoveredRegime === idx ? '#22D3EE' : '#F8FAFC'}
                  strokeWidth={hoveredRegime === idx ? 2.2 : 1.5}
                />
                <text
                  x={mapX(c.os1) + 9}
                  y={mapY(c.os2) + 3}
                  className="fill-slate-200 text-[10px] font-mono"
                >
                  R{idx + 1}
                </text>
              </g>
            ))}
          </svg>

          {/* Coordinate & Regime Explanation Footer */}
          <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-400">
            {hoveredPoint ? (
              <>
                <span className="text-slate-200">
                  Regime R{hoveredPoint.regime + 1} ({REGIME_CENTERS[hoveredPoint.regime]?.label ?? 'Nominal'}): Alt{' '}
                  {hoveredPoint.os1.toFixed(1)}k ft · Mach {hoveredPoint.os2.toFixed(3)} · TRA {hoveredPoint.os3.toFixed(0)}°
                </span>
                <span className="text-cyan-300 font-sans text-[11px]">
                  Normalized within cluster R{hoveredPoint.regime + 1} when Regime-Aware is ON
                </span>
              </>
            ) : (
              <span>
                Hover a sample dot or centroid R1–R{conditions} to inspect flight regime coordinates
              </span>
            )}
          </div>
        </div>
      )}

      {interpretation && <TechnicalInterpretation {...interpretation} />}
    </div>
  );
};
