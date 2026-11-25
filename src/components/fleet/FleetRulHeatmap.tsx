import React, { useMemo, useState } from 'react';
import {
  buildFleetRulHeatmapMatrix,
  type CriticalityLevel,
  type FleetEngineHealthCard,
} from '../../engine/fleetHealth';
import { TechnicalInterpretation } from '../charts/TechnicalInterpretation';

interface FleetRulHeatmapProps {
  cards: FleetEngineHealthCard[];
  rulThreshold: number;
  rulCap: number;
  activeFilter: 'all' | CriticalityLevel;
  onInspectEngine: (engineId: number) => void;
}

const CRIT_SHORT: Record<CriticalityLevel, { label: string; textCls: string }> = {
  critical: { label: 'CRIT', textCls: 'text-rose-200' },
  warning: { label: 'WATCH', textCls: 'text-amber-200' },
  healthy: { label: 'OK', textCls: 'text-emerald-200' },
};

export const FleetRulHeatmap: React.FC<FleetRulHeatmapProps> = ({
  cards,
  rulThreshold,
  rulCap,
  activeFilter,
  onInspectEngine,
}) => {
  const [metric, setMetric] = useState<'pred_rul' | 'conformal_lower'>('pred_rul');
  const [sortBy, setSortBy] = useState<'engine_id' | 'criticality'>('engine_id');
  const [hoveredEngineId, setHoveredEngineId] = useState<number | null>(null);

  const matrix = useMemo(
    () =>
      buildFleetRulHeatmapMatrix(cards, {
        sortBy,
        metric,
        rulThreshold,
        rulCap,
      }),
    [cards, sortBy, metric, rulThreshold, rulCap],
  );

  const inspectedCard = useMemo(() => {
    if (hoveredEngineId !== null) {
      return cards.find((c) => c.engineId === hoveredEngineId) ?? null;
    }
    // Default to the lowest-LB critical unit for quick diagnostic context
    return [...cards].sort(
      (a, b) => a.conformalLowerAtObserved - b.conformalLowerAtObserved,
    )[0] ?? null;
  }, [cards, hoveredEngineId]);

  const watchMax = Math.min(rulCap, rulThreshold + 25);
  const matchingCount = useMemo(
    () =>
      activeFilter === 'all'
        ? cards.length
        : cards.filter((c) => c.criticality === activeFilter).length,
    [cards, activeFilter],
  );

  if (cards.length === 0) {
    return (
      <section
        data-testid="fleet-rul-heatmap-empty"
        className="rounded-lg border border-dashed border-slate-700 bg-[#0E131D] p-6 text-center space-y-1.5"
      >
        <div className="text-sm font-medium text-slate-200">No Fleet Engines Available</div>
        <p className="text-xs text-slate-400">
          Load or generate a synthetic fleet dataset to populate the RUL matrix heatmap.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4"
      aria-labelledby="fleet-rul-heatmap-heading"
    >
      {/* Header & Heatmap Mode Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="fleet-rul-heatmap-heading"
            className="font-display text-base font-semibold text-slate-100"
          >
            Fleet RUL Heatmap ({matrix.rowCount}×{matrix.colCount} Matrix)
          </h3>
          <p className="text-xs text-slate-400">
            Showing {matchingCount} matching / {cards.length} engines · Color-graded from critical (≤ {rulThreshold}c) to healthy ({rulCap}c) · Click any cell to inspect
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Heatmap RUL Metric"
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
          >
            <button
              type="button"
              onClick={() => setMetric('pred_rul')}
              aria-pressed={metric === 'pred_rul'}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                metric === 'pred_rul'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Predicted RUL
            </button>
            <button
              type="button"
              onClick={() => setMetric('conformal_lower')}
              aria-pressed={metric === 'conformal_lower'}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                metric === 'conformal_lower'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Conformal LB
            </button>
          </div>

          <div
            role="group"
            aria-label="Heatmap Matrix Order"
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
          >
            <button
              type="button"
              onClick={() => setSortBy('engine_id')}
              aria-pressed={sortBy === 'engine_id'}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                sortBy === 'engine_id'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Unit #01–#48
            </button>
            <button
              type="button"
              onClick={() => setSortBy('criticality')}
              aria-pressed={sortBy === 'criticality'}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                sortBy === 'criticality'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Critical → Healthy
            </button>
          </div>
        </div>
      </div>

      {/* Continuous Red-to-Green Gradient Scale Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80 text-xs">
        <div className="flex items-center gap-3 min-w-[260px] flex-1 max-w-md">
          <span className="font-mono text-[11px] text-rose-400 whitespace-nowrap tabular-nums">
            ≤{rulThreshold}c Critical
          </span>
          <div
            className="h-2.5 flex-1 rounded-xs border border-slate-700/80"
            style={{
              background:
                'linear-gradient(90deg, #EF4444 0%, #F59E0B 42%, #10B981 100%)',
            }}
            aria-hidden="true"
          />
          <span className="font-mono text-[11px] text-emerald-400 whitespace-nowrap tabular-nums">
            {rulCap}c Healthy
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-slate-400">
          <span>Watch: {rulThreshold}–{watchMax}c</span>
          <span>Min: <strong className="text-rose-300">{matrix.minRul.toFixed(1)}c</strong></span>
          <span>Mean: <strong className="text-slate-200">{matrix.meanRul.toFixed(1)}c</strong></span>
          <span>Max: <strong className="text-emerald-300">{matrix.maxRul.toFixed(1)}c</strong></span>
        </div>
      </div>

      {/* 6x8 RUL Matrix Grid */}
      <div className="overflow-x-auto pb-1">
        <div
          className="grid gap-1.5 min-w-[580px]"
          style={{
            gridTemplateColumns: '28px repeat(8, minmax(64px, 1fr))',
          }}
          data-testid="fleet-rul-heatmap-grid"
        >
          {/* Column Headers (C1 - C8) */}
          <div />
          {Array.from({ length: matrix.colCount }, (_, colIdx) => (
            <div
              key={`col-${colIdx}`}
              className="text-center text-[10px] font-mono text-slate-400 pb-0.5 tabular-nums"
            >
              C{colIdx + 1}
            </div>
          ))}

          {/* 6 Rows x 8 Columns */}
          {matrix.rows.map((rowCells, rowIdx) => (
            <React.Fragment key={`row-${rowIdx}`}>
              <div className="flex items-center justify-end pr-1.5 text-[10px] font-mono text-slate-400 tabular-nums">
                R{rowIdx + 1}
              </div>
              {rowCells.map((cell) => {
                const { card, displayRul, color } = cell;
                const matchesFilter =
                  activeFilter === 'all' || card.criticality === activeFilter;
                const isHovered = hoveredEngineId === card.engineId;
                const critMeta = CRIT_SHORT[card.criticality];

                return (
                  <button
                    key={card.engineId}
                    type="button"
                    data-testid={`heatmap-cell-${card.engineId}`}
                    data-criticality={card.criticality}
                    onClick={() => onInspectEngine(card.engineId)}
                    onMouseEnter={() => setHoveredEngineId(card.engineId)}
                    onMouseLeave={() => setHoveredEngineId(null)}
                    onFocus={() => setHoveredEngineId(card.engineId)}
                    aria-label={`Heatmap Unit ${card.engineId}, ${card.criticality}, ${
                      metric === 'conformal_lower' ? 'conformal lower bound' : 'predicted RUL'
                    } ${displayRul.toFixed(1)} cycles`}
                    className={`rounded-md px-2 py-1.5 text-left transition-transform focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                      isHovered ? 'scale-[1.03] z-10 ring-1 ring-white' : ''
                    } ${matchesFilter ? 'opacity-100' : 'opacity-25'}`}
                    style={{
                      backgroundColor: color.fillRgba,
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: isHovered ? '#F8FAFC' : color.borderRgba,
                    }}
                  >
                    <div className="flex items-center justify-between gap-1 font-mono text-[10px] tabular-nums">
                      <span className="text-slate-200 font-semibold">
                        #{String(card.engineId).padStart(2, '0')}
                      </span>
                      <span className={`text-[9px] font-bold ${critMeta.textCls}`}>
                        {critMeta.label}
                      </span>
                    </div>

                    <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-white leading-tight">
                      {displayRul.toFixed(0)}c
                    </div>

                    <div className="mt-0.5 font-mono text-[9px] tabular-nums text-slate-300/90 truncate">
                      {metric === 'pred_rul'
                        ? `LB ${card.conformalLowerAtObserved.toFixed(0)}c · c${card.observedCycle}`
                        : `Pred ${card.predRulAtObserved.toFixed(0)}c · c${card.observedCycle}`}
                    </div>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Live Inspected Cell Readout Bar */}
      {inspectedCard && (
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-300">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-slate-100 font-semibold">
              {hoveredEngineId !== null ? 'Focused' : 'Highest Risk'}: Unit #
              {String(inspectedCard.engineId).padStart(2, '0')}
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span>Pred RUL: <strong className="text-white">{inspectedCard.predRulAtObserved.toFixed(1)} cyc</strong></span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span>Conformal Interval: [{inspectedCard.conformalLowerAtObserved.toFixed(1)}, {inspectedCard.conformalUpperAtObserved.toFixed(1)}] cyc</span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span>Cycle {inspectedCard.observedCycle}/{inspectedCard.failureCycle} ({inspectedCard.split})</span>
          </div>
          <span className={CRIT_SHORT[inspectedCard.criticality].textCls}>
            {inspectedCard.criticality.toUpperCase()}
          </span>
        </div>
      )}

      <TechnicalInterpretation
        title="Fleet RUL Matrix"
        summary="Compares point RUL vs conservative conformal lower bound across all units"
        whatItShows="Switch between Predicted RUL (point estimate) and Conformal LB (conservative lower prediction bound) to identify units whose uncertainty band already crosses the maintenance threshold τ despite nominal point predictions."
        sampleScope={`${cards.length} monitored synthetic units (${matchingCount} matching active filter)`}
        conditionGuide={{
          normal: 'OK (> τ + 25 cyc): Safe operational margin above maintenance trigger.',
          warning: 'WATCH (τ to τ + 25 cyc): Approaching scheduled shop intervention window.',
          critical: 'CRIT (≤ τ): At or below the maintenance trigger threshold τ.',
        }}
        metrics={['rul', 'interval_width']}
      />
    </section>
  );
};
