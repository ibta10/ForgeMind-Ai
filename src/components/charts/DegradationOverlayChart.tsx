import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import {
  buildDegradationSlopeOverlay,
  pickDefaultPeerEngineIds,
  type OverlayAlignmentMode,
  type OverlaySignalMode,
} from '../../engine/degradationOverlay';
import type { EngineTrajectory, ModelId } from '../../engine/types';
import { TechnicalInterpretation } from './TechnicalInterpretation';

interface DegradationOverlayChartProps {
  fleet: EngineTrajectory[];
  primaryEngineId: number;
  onSelectPrimaryEngine: (engineId: number) => void;
  sensorId: string;
  regimeAware: boolean;
  selectedModel: ModelId;
  rulCap: number;
  seed: number;
}

const PEER_PALETTE = ['#F59E0B', '#F43F5E', '#10B981', '#A78BFA', '#38BDF8'];

function getSeriesColor(isPrimary: boolean, peerIndex: number): string {
  if (isPrimary) return '#22D3EE';
  return PEER_PALETTE[peerIndex % PEER_PALETTE.length];
}

export const DegradationOverlayChart: React.FC<DegradationOverlayChartProps> = ({
  fleet,
  primaryEngineId,
  onSelectPrimaryEngine,
  sensorId,
  regimeAware,
  selectedModel,
  rulCap,
  seed,
}) => {
  const [alignment, setAlignment] = useState<OverlayAlignmentMode>('lifecycle_pct');
  const [signalMode, setSignalMode] = useState<OverlaySignalMode>('rolling_mean');
  const [showFleetEnvelope, setShowFleetEnvelope] = useState<boolean>(true);
  const [peerIds, setPeerIds] = useState<number[]>(() =>
    pickDefaultPeerEngineIds(fleet, primaryEngineId, 4),
  );
  const [focusedEngineId, setFocusedEngineId] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Keep peer list excluding the active primary engine when fleet/primary changes
  useEffect(() => {
    setPeerIds((prev) => {
      const valid = prev.filter(
        (id) => id !== primaryEngineId && fleet.some((e) => e.engineId === id),
      );
      if (valid.length >= 2) return valid;
      return pickDefaultPeerEngineIds(fleet, primaryEngineId, 4);
    });
  }, [fleet, primaryEngineId]);

  const overlay = useMemo(
    () =>
      buildDegradationSlopeOverlay(fleet, peerIds, {
        primaryEngineId,
        sensorId,
        alignment,
        signalMode,
        regimeAware,
        model: selectedModel,
        rulCap,
        seed,
      }),
    [fleet, peerIds, primaryEngineId, sensorId, alignment, signalMode, regimeAware, selectedModel, rulCap, seed],
  );

  const seriesColorMap = useMemo(() => {
    const map = new Map<number, string>();
    let peerIdx = 0;
    for (const s of overlay.series) {
      if (s.isPrimary) {
        map.set(s.engineId, '#22D3EE');
      } else {
        map.set(s.engineId, getSeriesColor(false, peerIdx++));
      }
    }
    return map;
  }, [overlay.series]);

  const availableToAdd = useMemo(
    () =>
      fleet
        .filter((e) => e.engineId !== primaryEngineId && !peerIds.includes(e.engineId))
        .sort((a, b) => a.engineId - b.engineId),
    [fleet, primaryEngineId, peerIds],
  );

  const width = 820;
  const height = 304;
  const pad = { top: 22, right: 24, bottom: 48, left: 68 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xAxisTitle =
    alignment === 'lifecycle_pct'
      ? 'Normalized Engine Lifecycle (%)'
      : alignment === 'cycles_to_failure'
        ? 'Cycles Remaining Before Failure (cycles)'
        : 'Operating Cycle (cycles)';

  const yAxisTitle =
    signalMode === 'pred_rul'
      ? 'Predicted RUL (cycles)'
      : signalMode === 'normalized'
        ? `${overlay.sensorSymbol} Normalized Signal`
        : `${overlay.sensorSymbol} Causal Rolling Mean`;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of overlay.series) {
      for (const pt of s.points) {
        xs.push(pt.x);
        ys.push(pt.y);
      }
    }
    if (showFleetEnvelope && overlay.fleetEnvelope.length > 0) {
      for (const ep of overlay.fleetEnvelope) {
        xs.push(ep.x);
        ys.push(ep.lower, ep.upper);
      }
    }
    const minX = xs.length > 0 ? Math.min(...xs) : 0;
    const maxX = xs.length > 0 ? Math.max(...xs) : 100;
    const rawMinY = ys.length > 0 ? Math.min(...ys) : 0;
    const rawMaxY = ys.length > 0 ? Math.max(...ys) : 1;
    const span = Math.max(0.05, rawMaxY - rawMinY);
    return {
      xMin: minX,
      xMax: maxX === minX ? minX + 1 : maxX,
      yMin: signalMode === 'pred_rul' ? 0 : Math.max(-0.25, rawMinY - span * 0.06),
      yMax: rawMaxY + span * 0.08,
    };
  }, [overlay, showFleetEnvelope, signalMode]);

  const mapX = (x: number) => pad.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const mapY = (y: number) => pad.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  const xTicks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) => {
      const val = Math.round(xMin + ((xMax - xMin) * i) / count);
      const label =
        alignment === 'lifecycle_pct'
          ? `${val}%`
          : alignment === 'cycles_to_failure'
            ? val === 0
              ? '0 (EoL)'
              : `${val}`
            : `c${val}`;
      return { val, label, x: mapX(val) };
    });
  }, [xMin, xMax, alignment, plotW]);

  const yTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => {
      const val = yMin + ((yMax - yMin) * i) / count;
      return {
        val,
        label: signalMode === 'pred_rul' ? `${val.toFixed(0)}c` : val.toFixed(2),
        y: mapY(val),
      };
    });
  }, [yMin, yMax, signalMode, plotH]);

  const envelopeBandPath = useMemo(() => {
    if (!showFleetEnvelope || overlay.fleetEnvelope.length < 2) return '';
    const top = overlay.fleetEnvelope
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapX(p.x).toFixed(1)} ${mapY(p.upper).toFixed(1)}`)
      .join(' ');
    const bot = [...overlay.fleetEnvelope]
      .reverse()
      .map((p) => `L ${mapX(p.x).toFixed(1)} ${mapY(p.lower).toFixed(1)}`)
      .join(' ');
    return `${top} ${bot} Z`;
  }, [overlay.fleetEnvelope, showFleetEnvelope, xMin, xMax, yMin, yMax]);

  const envelopeMeanPath = useMemo(() => {
    if (!showFleetEnvelope || overlay.fleetEnvelope.length < 2) return '';
    return overlay.fleetEnvelope
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapX(p.x).toFixed(1)} ${mapY(p.mean).toFixed(1)}`)
      .join(' ');
  }, [overlay.fleetEnvelope, showFleetEnvelope, xMin, xMax, yMin, yMax]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const clampedX = Math.max(xMin, Math.min(xMax, xMin + ((relX - pad.left) / plotW) * (xMax - xMin)));
    setHoverX(clampedX);
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const step = (xMax - xMin) / 40;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHoverX((prev) => Math.max(xMin, (prev ?? (xMin + xMax) / 2) - step));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHoverX((prev) => Math.min(xMax, (prev ?? (xMin + xMax) / 2) + step));
    } else if (e.key === 'Escape') {
      setHoverX(null);
    }
  };

  const hoverSnapshots = useMemo(() => {
    if (hoverX === null) return [];
    return overlay.series.map((s) => {
      let best = s.points[0];
      let bestDist = Infinity;
      for (const pt of s.points) {
        const d = Math.abs(pt.x - hoverX);
        if (d < bestDist) {
          bestDist = d;
          best = pt;
        }
      }
      return { engineId: s.engineId, isPrimary: s.isPrimary, point: best };
    });
  }, [hoverX, overlay.series]);

  const tooltipLeftPct = hoverX !== null ? (mapX(hoverX) / width) * 100 : 50;
  const tooltipAlignRight = tooltipLeftPct > 58;

  return (
    <section
      className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4"
      aria-labelledby="degradation-overlay-heading"
    >
      {/* Header & Alignment / Signal Controls */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="degradation-overlay-heading"
            className="font-display text-base font-semibold text-slate-100"
          >
            Comparative Degradation Slope Overlay — {overlay.sensorSymbol} Pattern Cohort ({overlay.series.length} Overlaid / {fleet.length} Fleet Units)
          </h3>
          <p className="text-xs text-slate-400">
            Side-by-side historical wear trajectories across multiple engines to expose common exponential knees and fault-mode divergence
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {alignment === 'lifecycle_pct' && (
            <button
              type="button"
              onClick={() => setShowFleetEnvelope((v) => !v)}
              aria-pressed={showFleetEnvelope}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                showFleetEnvelope
                  ? 'border-slate-600 bg-slate-800/80 text-slate-200'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {showFleetEnvelope ? 'Fleet Mean ±1σ: On' : 'Fleet Mean ±1σ: Off'}
            </button>
          )}

          <div
            role="group"
            aria-label="Overlay Axis Alignment"
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
          >
            {(
              [
                { id: 'lifecycle_pct', label: 'Lifecycle %' },
                { id: 'cycles_to_failure', label: 'Failure-Aligned' },
                { id: 'absolute_cycles', label: 'Absolute Cyc' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setAlignment(opt.id);
                  setHoverX(null);
                }}
                aria-pressed={alignment === opt.id}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  alignment === opt.id
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Overlay Signal Basis"
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
          >
            {(
              [
                { id: 'rolling_mean', label: 'Smoothed Drift' },
                { id: 'normalized', label: 'Normalized' },
                { id: 'pred_rul', label: 'Predicted RUL' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSignalMode(opt.id)}
                aria-pressed={signalMode === opt.id}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  signalMode === opt.id
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active Overlaid Engines Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2" data-testid="overlay-cohort-chips">
          {overlay.series.map((s) => {
            const color = seriesColorMap.get(s.engineId) ?? '#94A3B8';
            return s.isPrimary ? (
              <span
                key={s.engineId}
                className="inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/10 px-2.5 py-1 text-xs font-mono text-cyan-200 whitespace-nowrap"
              >
                <span className="inline-block h-0.5 w-3" style={{ backgroundColor: color }} />
                Unit #{String(s.engineId).padStart(2, '0')} · Primary ({s.failureCycle}c)
              </span>
            ) : (
              <button
                key={s.engineId}
                type="button"
                onMouseEnter={() => setFocusedEngineId(s.engineId)}
                onMouseLeave={() => setFocusedEngineId(null)}
                onClick={() => setPeerIds((prev) => prev.filter((id) => id !== s.engineId))}
                aria-label={`Remove Unit #${s.engineId} from comparison overlay`}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1 text-xs font-mono text-slate-200 hover:border-slate-500 transition-colors whitespace-nowrap"
              >
                <span className="inline-block h-0.5 w-3" style={{ backgroundColor: color }} />
                <span>Unit #{String(s.engineId).padStart(2, '0')}</span>
                <span className="text-slate-400">({s.failureCycle}c)</span>
                <X className="w-3 h-3 text-slate-400 hover:text-rose-300" />
              </button>
            );
          })}
          {alignment === 'lifecycle_pct' && showFleetEnvelope && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-400 ml-1">
              <span className="inline-block h-2.5 w-3.5 rounded-xs border border-slate-500/50 bg-slate-400/15" />
              Fleet Mean ±1σ Band
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="overlay-add-peer" className="sr-only">
            Add Peer Engine to Overlay
          </label>
          <select
            id="overlay-add-peer"
            value=""
            disabled={peerIds.length >= 5 || availableToAdd.length === 0}
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id > 0 && peerIds.length < 5) {
                setPeerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
              }
            }}
            className="rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1 text-xs font-mono text-slate-200 disabled:opacity-50"
          >
            <option value="">
              {peerIds.length >= 5 ? 'Max 5 peers overlaid' : '+ Add Peer Engine...'}
            </option>
            {availableToAdd.map((e) => (
              <option key={e.engineId} value={e.engineId}>
                Unit #{String(e.engineId).padStart(2, '0')} · {e.failureCycle} cyc (Mode {e.faultMode})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setPeerIds(pickDefaultPeerEngineIds(fleet, primaryEngineId, 4))}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            Auto-Pick Diverse Peers
          </button>
        </div>
      </div>

      {/* Comparative Multi-Engine SVG Plot */}
      {overlay.series.length === 0 ? (
        <div
          data-testid="degradation-overlay-empty"
          className="rounded-md border border-dashed border-slate-800 bg-[#080B12] px-4 py-12 text-center text-xs text-slate-400"
        >
          No engine trajectories available to overlay for this subset or sensor channel.
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto cursor-crosshair select-none focus-visible:outline-2 focus-visible:outline-cyan-400 rounded"
            role="img"
            tabIndex={0}
            aria-label={`Comparative multi-engine historical degradation slope overlay chart: ${yAxisTitle} versus ${xAxisTitle}`}
            data-testid="degradation-overlay-svg"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverX(null)}
            onKeyDown={handleKeyDown}
          >
            {/* Y grid & ticks */}
            {yTicks.map((t, i) => (
              <g key={`y-${i}`}>
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
                  {t.label}
                </text>
              </g>
            ))}

            {/* X grid & ticks */}
            {xTicks.map((t, i) => (
              <g key={`x-${i}`}>
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
                  y={height - pad.bottom + 15}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-mono tabular-nums"
                >
                  {t.label}
                </text>
              </g>
            ))}

            {/* Axes Frame & Titles */}
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
              {xAxisTitle}
            </text>
            <text
              x={15}
              y={pad.top + plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90 15 ${pad.top + plotH / 2})`}
              className="fill-slate-400 text-[10.5px] font-sans"
            >
              {yAxisTitle}
            </text>

            {/* Canonical Fleet Mean +/- 1 sigma Envelope */}
            {envelopeBandPath && (
              <path d={envelopeBandPath} fill="rgba(148, 163, 184, 0.12)" stroke="none" />
            )}
            {envelopeMeanPath && (
              <path
                d={envelopeMeanPath}
                fill="none"
                stroke="#94A3B8"
                strokeWidth={1.35}
                strokeDasharray="4 4"
                opacity={0.75}
              />
            )}

            {/* Engine Degradation Paths (render peers first, primary last on top) */}
            {[...overlay.series]
              .sort((a, b) => Number(a.isPrimary) - Number(b.isPrimary))
              .map((s) => {
                const color = seriesColorMap.get(s.engineId) ?? '#94A3B8';
                const isDimmed = focusedEngineId !== null && focusedEngineId !== s.engineId;
                const d = s.points
                  .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${mapX(pt.x).toFixed(1)} ${mapY(pt.y).toFixed(1)}`)
                  .join(' ');
                const lastPt = s.points[s.points.length - 1];

                return (
                  <g key={s.engineId} opacity={isDimmed ? 0.25 : 1}>
                    <path
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeWidth={s.isPrimary ? 2.6 : focusedEngineId === s.engineId ? 2.6 : 1.75}
                    />
                    {lastPt && (
                      <circle
                        cx={mapX(lastPt.x)}
                        cy={mapY(lastPt.y)}
                        r={s.isPrimary ? 3.8 : 2.8}
                        fill={color}
                        stroke="#080B12"
                        strokeWidth={1.2}
                      />
                    )}
                  </g>
                );
              })}

            {/* Hover Crosshair */}
            {hoverX !== null && (
              <g>
                <line
                  x1={mapX(hoverX)}
                  x2={mapX(hoverX)}
                  y1={pad.top}
                  y2={height - pad.bottom}
                  stroke="#64748B"
                  strokeWidth={1}
                />
                {hoverSnapshots.map((snap) => {
                  if (!snap.point) return null;
                  const color = seriesColorMap.get(snap.engineId) ?? '#94A3B8';
                  return (
                    <circle
                      key={`hover-${snap.engineId}`}
                      cx={mapX(snap.point.x)}
                      cy={mapY(snap.point.y)}
                      r={3.5}
                      fill={color}
                      stroke="#080B12"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </g>
            )}
          </svg>

          {/* Floating Hover Tooltip */}
          {hoverX !== null && hoverSnapshots.length > 0 && (
            <div
              role="status"
              className="pointer-events-none hidden sm:block absolute top-2 z-20 w-60 rounded-md border border-slate-700/90 bg-[#080B12]/95 px-3 py-2 text-[11px] shadow-xl"
              style={{
                left: tooltipAlignRight
                  ? `calc(${tooltipLeftPct.toFixed(1)}% - 252px)`
                  : `calc(${tooltipLeftPct.toFixed(1)}% + 12px)`,
              }}
            >
              <div className="border-b border-slate-800 pb-1 font-mono font-semibold text-slate-100">
                {alignment === 'lifecycle_pct'
                  ? `${hoverX.toFixed(1)}% Lifecycle`
                  : alignment === 'cycles_to_failure'
                    ? `${Math.round(hoverX)} cycles before EoL`
                    : `Cycle ${Math.round(hoverX)}`}
              </div>
              <div className="mt-1 space-y-0.5 font-mono tabular-nums">
                {hoverSnapshots.map((snap) => {
                  if (!snap.point) return null;
                  const color = seriesColorMap.get(snap.engineId) ?? '#94A3B8';
                  return (
                    <div key={snap.engineId} className="flex items-center justify-between gap-2">
                      <span style={{ color }}>
                        Unit #{String(snap.engineId).padStart(2, '0')}
                        {snap.isPrimary ? ' (Primary)' : ''}
                      </span>
                      <span className="text-slate-100">
                        {signalMode === 'pred_rul'
                          ? `${snap.point.y.toFixed(1)} cyc`
                          : snap.point.y.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5 pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 leading-snug">
                Compare steepness near 70–100% life to spot early vs. abrupt terminal degradation knees.
              </p>
            </div>
          )}

          {/* Monospace Multi-Engine Hover Readout */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-xs font-mono tabular-nums text-slate-400">
            <span>
              {hoverX !== null
                ? alignment === 'lifecycle_pct'
                  ? `${hoverX.toFixed(1)}% Lifecycle`
                  : alignment === 'cycles_to_failure'
                    ? `${Math.round(hoverX)} cycles before EoL`
                    : `Cycle ${Math.round(hoverX)}`
                : 'Hover overlay or use arrow keys to compare instantaneous degradation values across engines'}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {hoverX !== null &&
                hoverSnapshots.map((snap) => {
                  if (!snap.point) return null;
                  const color = seriesColorMap.get(snap.engineId) ?? '#94A3B8';
                  return (
                    <span key={snap.engineId} style={{ color }}>
                      #{String(snap.engineId).padStart(2, '0')}:{' '}
                      {signalMode === 'pred_rul'
                        ? `${snap.point.y.toFixed(1)}c`
                        : snap.point.y.toFixed(3)}
                    </span>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Degradation Slope Comparison Ledger */}
      <div className="pt-3 border-t border-slate-800/80 overflow-x-auto">
        <table className="w-full text-left text-xs" data-testid="degradation-slope-table">
          <thead className="text-slate-400 border-b border-slate-800/80">
            <tr>
              <th className="py-2 pr-3 font-medium">Unit</th>
              <th className="py-2 px-3 font-medium">Split</th>
              <th className="py-2 px-3 font-medium text-right">Fault Mode</th>
              <th className="py-2 px-3 font-medium text-right">Lifespan</th>
              <th className="py-2 px-3 font-medium text-right">Early Slope (/100c)</th>
              <th className="py-2 px-3 font-medium text-right">Terminal Slope (/100c)</th>
              <th className="py-2 px-3 font-medium text-right">Knee Acceleration</th>
              <th className="py-2 pl-3 font-medium text-right">Playback</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
            {overlay.series.map((s) => {
              const color = seriesColorMap.get(s.engineId) ?? '#94A3B8';
              return (
                <tr
                  key={s.engineId}
                  onMouseEnter={() => setFocusedEngineId(s.engineId)}
                  onMouseLeave={() => setFocusedEngineId(null)}
                  className={s.isPrimary ? 'bg-cyan-500/[0.05]' : 'hover:bg-slate-800/35'}
                >
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-100">
                      <span className="inline-block h-0.5 w-3.5" style={{ backgroundColor: color }} />
                      Unit #{String(s.engineId).padStart(2, '0')}
                      {s.isPrimary && (
                        <span className="text-[10px] font-normal text-cyan-300">Primary</span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-400">{s.split}</td>
                  <td className="py-2 px-3 text-right text-slate-300">Mode {s.faultMode}</td>
                  <td className="py-2 px-3 text-right text-slate-200">{s.failureCycle} cyc</td>
                  <td className="py-2 px-3 text-right text-slate-300">
                    {s.earlySlopePer100 >= 0 ? '+' : ''}
                    {s.earlySlopePer100.toFixed(3)}
                  </td>
                  <td className="py-2 px-3 text-right text-amber-300">
                    {s.terminalSlopePer100 >= 0 ? '+' : ''}
                    {s.terminalSlopePer100.toFixed(3)}
                  </td>
                  <td className="py-2 px-3 text-right text-cyan-300">
                    {s.accelerationRatio.toFixed(1)}×
                  </td>
                  <td className="py-2 pl-3 text-right">
                    {s.isPrimary ? (
                      <span className="text-[11px] text-slate-400">Active</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectPrimaryEngine(s.engineId)}
                        className="text-[11px] font-sans font-medium text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                      >
                        Inspect
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TechnicalInterpretation
        summary="Knee acceleration compares late-life degradation steepness against initial wear"
        whatItShows="Overlaying multiple synthetic engines in Lifecycle % or Failure-Aligned coordinates reveals whether sensor wear stays gradual (low Knee Acceleration) or curves sharply in the final 30% of life. Switching to Predicted RUL compares how early different fault modes cross your maintenance trigger."
        sampleScope={`Comparing ${overlay.series.length} overlaid trajectories against ${fleet.length} synthetic fleet units`}
        metrics={['rul']}
      />
    </section>
  );
};
