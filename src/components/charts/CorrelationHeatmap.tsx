import React, { useState } from 'react';
import { formatPearsonR } from '../../engine/metricsCatalog';
import type { SensorMeta } from '../../engine/types';
import {
  TechnicalInterpretation,
  type TechnicalInterpretationProps,
} from './TechnicalInterpretation';

interface CorrelationHeatmapProps {
  sensors: SensorMeta[];
  matrix: number[][];
  sampleScopeLabel?: string;
  interpretation?: TechnicalInterpretationProps;
}

function correlationColor(val: number): string {
  const clamped = Math.max(-1, Math.min(1, val));
  if (clamped >= 0) {
    const alpha = 0.12 + clamped * 0.78;
    return `rgba(6, 182, 212, ${alpha.toFixed(2)})`;
  }
  const alpha = 0.12 + Math.abs(clamped) * 0.78;
  return `rgba(245, 158, 11, ${alpha.toFixed(2)})`;
}

function describePearsonStrength(r: number, sameSensor: boolean): string {
  if (sameSensor) return 'Identity diagonal (self-correlation = +1.000).';
  const absR = Math.abs(r);
  const dir = r >= 0 ? 'co-move upward together' : 'drift in opposite directions';
  if (absR >= 0.75) {
    return `Strong multicollinearity (${dir}): tree surrogates often distribute split importance across this pair.`;
  }
  if (absR >= 0.4) {
    return `Moderate coupling (${dir}): shared wear progression with distinct physical noise.`;
  }
  return 'Weak linear coupling: captures complementary degradation or operating variance.';
}

export const CorrelationHeatmap: React.FC<CorrelationHeatmapProps> = ({
  sensors,
  matrix,
  sampleScopeLabel,
  interpretation,
}) => {
  const [selected, setSelected] = useState<{ r: number; c: number }>({ r: 0, c: 1 });

  const activeR = sensors.length > 0 ? Math.min(selected.r, sensors.length - 1) : 0;
  const activeC = sensors.length > 0 ? Math.min(selected.c, sensors.length - 1) : 0;
  const activeVal = matrix[activeR]?.[activeC] ?? 0;

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-sm font-semibold text-slate-100">
              Active Sensor Pearson Correlation Matrix (r ∈ [−1, +1])
            </h3>
            {sampleScopeLabel && (
              <span className="font-mono text-[11px] text-cyan-300/90 tabular-nums">
                · {sampleScopeLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Pairwise linear correlation across fit-split cycles after selected scaling · Hover any cell to inspect coupling
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-500/80" />
            −1.0 Inverse
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-slate-800 border border-slate-700" />
            0.0 Orthogonal
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-cyan-500/85" />
            +1.0 Co-drift
          </span>
        </div>
      </div>

      {sensors.length === 0 ? (
        <div
          data-testid="correlation-heatmap-empty"
          className="rounded-md border border-dashed border-slate-800 bg-[#080B12] px-4 py-12 text-center text-xs text-slate-400"
        >
          No active non-constant sensor channels available to construct a correlation matrix.
        </div>
      ) : (
        <>
          <div className="text-center text-[10px] font-mono uppercase tracking-wider text-slate-400">
            X-Axis: Active Sensor Channel (j) · Y-Axis: Active Sensor Channel (i)
          </div>

          <div className="overflow-x-auto pb-2">
            <div
              className="inline-grid gap-[2px]"
              style={{
                gridTemplateColumns: `56px repeat(${sensors.length}, minmax(28px, 1fr))`,
              }}
            >
              <div className="text-right pr-2 text-[9px] font-mono text-slate-500 self-end pb-1">
                i \ j
              </div>
              {sensors.map((s) => (
                <div
                  key={s.id}
                  className="text-center text-[10px] font-mono text-slate-400 pb-1 truncate"
                  title={`${s.symbol} (${s.description}, ${s.unit})`}
                >
                  {s.symbol}
                </div>
              ))}

              {sensors.map((rowSensor, rIdx) => (
                <React.Fragment key={rowSensor.id}>
                  <div
                    className="flex items-center justify-end pr-2 text-[10px] font-mono text-slate-400 truncate"
                    title={`${rowSensor.symbol} (${rowSensor.description}, ${rowSensor.unit})`}
                  >
                    {rowSensor.symbol}
                  </div>
                  {sensors.map((colSensor, cIdx) => {
                    const rawVal = matrix[rIdx]?.[cIdx] ?? 0;
                    const val = Math.abs(rawVal) < 0.005 ? 0 : rawVal;
                    const isSelected = rIdx === activeR && cIdx === activeC;
                    return (
                      <button
                        key={colSensor.id}
                        type="button"
                        onMouseEnter={() => setSelected({ r: rIdx, c: cIdx })}
                        onFocus={() => setSelected({ r: rIdx, c: cIdx })}
                        onClick={() => setSelected({ r: rIdx, c: cIdx })}
                        aria-label={`${rowSensor.symbol} vs ${colSensor.symbol}: Pearson r = ${formatPearsonR(rawVal)}`}
                        className={`h-7 min-w-[28px] rounded-[2px] text-[9px] font-mono tabular-nums transition-transform focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                          isSelected ? 'ring-1 ring-white scale-105 z-10' : ''
                        }`}
                        style={{
                          backgroundColor: correlationColor(rawVal),
                          color: Math.abs(rawVal) > 0.55 ? '#F8FAFC' : '#CBD5E1',
                        }}
                      >
                        {val.toFixed(1)}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          {sensors[activeR] && sensors[activeC] && (
            <div className="pt-2.5 border-t border-slate-800/80 space-y-1 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-slate-300">
                  <span className="font-mono font-semibold text-slate-100">
                    {sensors[activeR].symbol}
                  </span>{' '}
                  ({sensors[activeR].description}) ×{' '}
                  <span className="font-mono font-semibold text-slate-100">
                    {sensors[activeC].symbol}
                  </span>{' '}
                  ({sensors[activeC].description})
                </div>
                <div className="font-mono tabular-nums font-semibold text-cyan-300">
                  r = {formatPearsonR(activeVal)}
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                {describePearsonStrength(activeVal, activeR === activeC)}
              </p>
            </div>
          )}
        </>
      )}

      {interpretation && <TechnicalInterpretation {...interpretation} />}
    </div>
  );
};
