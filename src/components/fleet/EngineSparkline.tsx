import React from 'react';
import type { CriticalityLevel } from '../../engine/fleetHealth';

interface EngineSparklineProps {
  values: number[];
  criticality: CriticalityLevel;
  mode: 'rul' | 'sensor';
  thresholdY?: number;
  maxY?: number;
  engineId: number;
}

const STROKE_COLORS: Record<CriticalityLevel, string> = {
  critical: '#F43F5E',
  warning: '#F59E0B',
  healthy: '#10B981',
};

const FILL_COLORS: Record<CriticalityLevel, string> = {
  critical: 'rgba(244, 63, 94, 0.16)',
  warning: 'rgba(245, 158, 11, 0.14)',
  healthy: 'rgba(16, 185, 129, 0.12)',
};

export const EngineSparkline: React.FC<EngineSparklineProps> = ({
  values,
  criticality,
  mode,
  thresholdY,
  maxY = 145,
  engineId,
}) => {
  const width = 160;
  const height = 40;
  const padX = 3;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const minVal = 0;
  const maxVal = mode === 'rul' ? maxY : Math.max(1.05, ...values);
  const span = Math.max(1e-3, maxVal - minVal);

  const mapX = (idx: number, len: number) =>
    len <= 1 ? padX + innerW / 2 : padX + (idx / (len - 1)) * innerW;
  const mapY = (v: number) =>
    padY + (1 - Math.max(0, Math.min(1, (v - minVal) / span))) * innerH;

  const points = values.map((v, idx) => ({
    x: mapX(idx, values.length),
    y: mapY(v),
  }));

  const linePath =
    points.length > 0
      ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      : '';

  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(height - padY).toFixed(1)} L ${points[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`
      : '';

  const stroke = STROKE_COLORS[criticality];
  const fill = FILL_COLORS[criticality];
  const lastPt = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-10 overflow-visible select-none"
      role="img"
      aria-label={`Unit #${engineId} ${mode === 'rul' ? 'RUL' : 'sensor'} sparkline (${criticality})`}
    >
      {mode === 'rul' && typeof thresholdY === 'number' && (
        <line
          x1={padX}
          x2={width - padX}
          y1={mapY(thresholdY)}
          y2={mapY(thresholdY)}
          stroke="#475569"
          strokeWidth={0.9}
          strokeDasharray="2 2"
        />
      )}
      {areaPath && <path d={areaPath} fill={fill} stroke="none" />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {lastPt && (
        <circle
          cx={lastPt.x}
          cy={lastPt.y}
          r={2.6}
          fill={stroke}
          stroke="#080B12"
          strokeWidth={1}
        />
      )}
    </svg>
  );
};
