import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { RulVolatilityMetrics, RulVolatilitySeverity } from '../../engine/playback';

interface RulVolatilityCardProps {
  volatility: RulVolatilityMetrics;
  currentCycle: number;
  onJumpToCycle?: (cycle: number) => void;
}

const SEVERITY_STYLES: Record<
  RulVolatilitySeverity,
  {
    container: string;
    labelText: string;
    valueText: string;
    strokeHex: string;
    statusLabel: string;
  }
> = {
  spike: {
    container: 'border-rose-500/50 bg-rose-500/[0.07]',
    labelText: 'text-rose-300',
    valueText: 'text-rose-300',
    strokeHex: '#FB7185',
    statusLabel: 'SPIKE ALERT',
  },
  elevated: {
    container: 'border-amber-500/40 bg-amber-500/[0.05]',
    labelText: 'text-amber-300',
    valueText: 'text-amber-300',
    strokeHex: '#FBBF24',
    statusLabel: 'ELEVATED',
  },
  normal: {
    container: 'border-slate-800 bg-[#0E131D]',
    labelText: 'text-emerald-400',
    valueText: 'text-slate-100',
    strokeHex: '#22D3EE',
    statusLabel: 'STABLE',
  },
};

export const RulVolatilityCard: React.FC<RulVolatilityCardProps> = ({
  volatility,
  currentCycle,
  onJumpToCycle,
}) => {
  const st = SEVERITY_STYLES[volatility.severity];

  const sparkSvg = useMemo(() => {
    const pts = volatility.history;
    const w = 180;
    const h = 24;
    if (pts.length < 2) {
      return { path: '', cutoffY: h * 0.35, lastX: w, lastY: h * 0.5 };
    }
    const maxY = Math.max(
      volatility.spikeCutoff * 1.15,
      volatility.peakStdDev * 1.1,
      6,
    );
    const stepX = w / (pts.length - 1);
    const coords = pts.map((p, idx) => {
      const x = Number((idx * stepX).toFixed(1));
      const y = Number((h - 2 - (p.rollingStdDev / maxY) * (h - 4)).toFixed(1));
      return { x, y };
    });
    const path = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x},${c.y}`)
      .join(' ');
    const cutoffY = Number(
      Math.max(2, Math.min(h - 2, h - 2 - (volatility.spikeCutoff / maxY) * (h - 4))).toFixed(1),
    );
    const last = coords[coords.length - 1];
    return { path, cutoffY, lastX: last.x, lastY: last.y };
  }, [volatility]);

  const showPeakJump =
    onJumpToCycle &&
    volatility.peakStdDev > 0 &&
    volatility.peakCycle !== currentCycle &&
    (volatility.spikeCount > 0 || volatility.severity !== 'normal');

  const isWarmingUp = volatility.history.length < 2;

  return (
    <div
      data-testid="rul-volatility-card"
      data-volatility-status={volatility.severity}
      role={volatility.severity === 'spike' ? 'status' : undefined}
      title="Rolling standard deviation of predicted RUL over the active window. Spikes indicate jitter from operating-regime jumps or sensor noise."
      className={`rounded-lg border p-4 flex flex-col justify-between transition-colors ${st.container}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-400 whitespace-nowrap">
            RUL Volatility (σ)
          </span>
          <span
            data-testid="rul-volatility-status"
            className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-wide whitespace-nowrap ${st.labelText}`}
          >
            {volatility.severity !== 'normal' && (
              <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
            )}
            {isWarmingUp ? 'WARM-UP' : st.statusLabel}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <div
            data-testid="rul-volatility-value"
            className={`font-mono text-xl font-bold tabular-nums whitespace-nowrap ${st.valueText}`}
          >
            {isWarmingUp ? '—' : `±${volatility.rollingStdDev.toFixed(2)}`}{' '}
            <span className="text-xs font-normal text-slate-400">cyc</span>
          </div>
          <span className="font-mono text-[10px] tabular-nums text-slate-400 whitespace-nowrap">
            w={volatility.windowSize} · Med ±{volatility.baselineStdDev.toFixed(2)}c
          </span>
        </div>
      </div>

      {/* Compact Rolling Volatility Sparkline */}
      {isWarmingUp ? (
        <div className="mt-1.5 mb-1 text-[10px] font-mono text-slate-500">
          Need ≥2 cycles for rolling σ trace
        </div>
      ) : (
        sparkSvg.path && (
          <div className="mt-1.5 mb-1">
            <svg
              viewBox="0 0 180 24"
              className="w-full h-6 block overflow-visible"
              role="img"
              aria-label={`Rolling RUL standard deviation sparkline, current ${volatility.rollingStdDev.toFixed(
                2,
              )} cycles, spike threshold ${volatility.spikeCutoff.toFixed(2)} cycles`}
            >
              <line
                x1={0}
                y1={sparkSvg.cutoffY}
                x2={180}
                y2={sparkSvg.cutoffY}
                stroke="#FB7185"
                strokeWidth={0.9}
                strokeDasharray="3 3"
                strokeOpacity={0.55}
              />
              <path
                d={sparkSvg.path}
                fill="none"
                stroke={st.strokeHex}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
              <circle
                cx={sparkSvg.lastX}
                cy={sparkSvg.lastY}
                r={2.2}
                fill={st.strokeHex}
              />
            </svg>
          </div>
        )
      )}

      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
        <span
          data-testid="rul-volatility-alert-text"
          className={`min-w-0 leading-snug ${
            volatility.severity === 'spike'
              ? 'text-rose-200 font-medium'
              : volatility.severity === 'elevated'
                ? 'text-amber-200'
                : 'text-slate-400'
          }`}
          title={volatility.alertMessage}
        >
          {isWarmingUp
            ? 'Advance cycle cursor to measure stability'
            : volatility.severity !== 'normal'
              ? volatility.alertMessage
              : `Peak ±${volatility.peakStdDev.toFixed(2)}c @ c${volatility.peakCycle}`}
        </span>
        {showPeakJump && !isWarmingUp && (
          <button
            type="button"
            onClick={() => onJumpToCycle(volatility.peakCycle)}
            className="shrink-0 text-[10px] font-mono text-cyan-300 hover:text-cyan-200 hover:underline whitespace-nowrap"
            title={`Jump playback cursor to peak instability cycle c${volatility.peakCycle}`}
          >
            @c{volatility.peakCycle}
          </button>
        )}
      </div>
    </div>
  );
};
