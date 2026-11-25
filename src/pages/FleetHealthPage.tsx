import React, { useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { CriticalUncertaintyAlertPanel } from '../components/fleet/CriticalUncertaintyAlertPanel';
import { EngineSparkline } from '../components/fleet/EngineSparkline';
import { FleetRulHeatmap } from '../components/fleet/FleetRulHeatmap';
import { FleetStressScatterPlot } from '../components/fleet/FleetStressScatterPlot';
import { MetricGlossaryPanel } from '../components/charts/MetricGlossaryPanel';
import {
  computeFleetHealthOverview,
  type CriticalityLevel,
  type FleetEngineHealthCard,
} from '../engine/fleetHealth';
import { getFleetSplitCounts } from '../engine/metricsCatalog';
import { MODEL_LABELS, MODEL_ORDER } from '../engine/models';
import type { EngineTrajectory, ModelId, SubsetId } from '../engine/types';

interface FleetHealthPageProps {
  subset: SubsetId;
  fleet: EngineTrajectory[];
  selectedModel: ModelId;
  onSelectModel: (model: ModelId) => void;
  regimeAware: boolean;
  alpha: number;
  rulThreshold: number;
  onChangeRulThreshold: (thr: number) => void;
  rulCap: number;
  seed: number;
  onInspectEngine: (engineId: number) => void;
}

type FilterCriticality = 'all' | CriticalityLevel;
type SortMode = 'criticality' | 'engine_id' | 'life_pct' | 'split';

const CRITICALITY_STYLES: Record<
  CriticalityLevel,
  {
    card: string;
    badge: string;
    label: string;
    rulText: string;
  }
> = {
  critical: {
    card: 'border-rose-500/45 bg-rose-500/[0.06] hover:border-rose-400',
    badge: 'text-rose-400',
    label: 'CRITICAL',
    rulText: 'text-rose-300',
  },
  warning: {
    card: 'border-amber-500/35 bg-amber-500/[0.04] hover:border-amber-400',
    badge: 'text-amber-300',
    label: 'WATCH',
    rulText: 'text-amber-300',
  },
  healthy: {
    card: 'border-slate-800 bg-[#0E131D] hover:border-cyan-500/45',
    badge: 'text-emerald-400',
    label: 'HEALTHY',
    rulText: 'text-emerald-300',
  },
};

export const FleetHealthPage: React.FC<FleetHealthPageProps> = ({
  subset,
  fleet,
  selectedModel,
  onSelectModel,
  regimeAware,
  alpha,
  rulThreshold,
  onChangeRulThreshold,
  rulCap,
  seed,
  onInspectEngine,
}) => {
  const [snapshotMode, setSnapshotMode] = useState<'mixed_fleet' | 'uniform_cycle'>('mixed_fleet');
  const [uniformCycle, setUniformCycle] = useState<number>(145);
  const [sparkMode, setSparkMode] = useState<'rul' | 'sensor'>('rul');
  const [filterCrit, setFilterCrit] = useState<FilterCriticality>('all');
  const [sortMode, setSortMode] = useState<SortMode>('criticality');

  const overview = useMemo(
    () =>
      computeFleetHealthOverview(fleet, subset, selectedModel, regimeAware, alpha, rulThreshold, {
        snapshotMode,
        uniformCycle,
        rulCap,
        seed,
      }),
    [fleet, subset, selectedModel, regimeAware, alpha, rulThreshold, snapshotMode, uniformCycle, rulCap, seed],
  );

  const visibleCards = useMemo(() => {
    const filtered =
      filterCrit === 'all'
        ? overview.cards
        : overview.cards.filter((c) => c.criticality === filterCrit);

    const sorted = [...filtered];
    const critRank: Record<CriticalityLevel, number> = {
      critical: 0,
      warning: 1,
      healthy: 2,
    };
    const splitRank: Record<FleetEngineHealthCard['split'], number> = {
      evaluation: 0,
      tuning: 1,
      calibration: 2,
      fit: 3,
    };

    sorted.sort((a, b) => {
      if (sortMode === 'criticality') {
        const cr = critRank[a.criticality] - critRank[b.criticality];
        if (cr !== 0) return cr;
        return a.conformalLowerAtObserved - b.conformalLowerAtObserved;
      }
      if (sortMode === 'life_pct') {
        return (
          b.observedCycle / Math.max(1, b.failureCycle) -
          a.observedCycle / Math.max(1, a.failureCycle)
        );
      }
      if (sortMode === 'split') {
        const sr = splitRank[a.split] - splitRank[b.split];
        return sr !== 0 ? sr : a.engineId - b.engineId;
      }
      return a.engineId - b.engineId;
    });

    return sorted;
  }, [overview.cards, filterCrit, sortMode]);

  const { counts } = overview;
  const splits = useMemo(() => getFleetSplitCounts(fleet), [fleet]);

  return (
    <div className="space-y-6">
      {/* Fleet Controls Bar */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Fleet Health Overview — {counts.total} Turbofan Units ({subset})
            </h2>
            <p className="text-xs text-slate-400">
              {splits.fit} fit · {splits.calibration} cal · {splits.tuning} tuning · {splits.evaluation} eval · Color-coded by {((1 - alpha) * 100).toFixed(0)}% conformal lower bound vs. trigger τ = {rulThreshold} cyc
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex flex-wrap items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5 max-w-full"
              role="group"
              aria-label="Sparkline Signal Mode"
            >
              <button
                type="button"
                aria-pressed={sparkMode === 'rul'}
                onClick={() => setSparkMode('rul')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  sparkMode === 'rul'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sparkline: RUL
              </button>
              <button
                type="button"
                aria-pressed={sparkMode === 'sensor'}
                onClick={() => setSparkMode('sensor')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  sparkMode === 'sensor'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sparkline: T50 Sensor
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-800/80 items-end">
          <div>
            <label htmlFor="fleet-model-select" className="block text-xs text-slate-400 mb-1.5">
              RUL Predictor
            </label>
            <select
              id="fleet-model-select"
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value as ModelId)}
              className="w-full rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1.5 text-xs font-mono text-slate-100"
            >
              {MODEL_ORDER.map((m) => (
                <option key={m} value={m}>
                  {MODEL_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-1.5">
              <label htmlFor="fleet-threshold" className="whitespace-nowrap">
                Criticality Threshold (τ)
              </label>
              <span className="font-mono tabular-nums text-rose-300 whitespace-nowrap">
                {rulThreshold} cyc
              </span>
            </div>
            <input
              id="fleet-threshold"
              type="range"
              min={5}
              max={45}
              step={1}
              value={rulThreshold}
              onChange={(e) => onChangeRulThreshold(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>

          <div>
            <span className="block text-xs text-slate-400 mb-1.5">Fleet Time Snapshot</span>
            <div
              className="grid grid-cols-2 rounded-md border border-slate-700 bg-[#080B12] p-0.5"
              role="group"
              aria-label="Fleet Snapshot Mode"
            >
              <button
                type="button"
                aria-pressed={snapshotMode === 'mixed_fleet'}
                onClick={() => setSnapshotMode('mixed_fleet')}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  snapshotMode === 'mixed_fleet'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mixed Fleet
              </button>
              <button
                type="button"
                aria-pressed={snapshotMode === 'uniform_cycle'}
                onClick={() => setSnapshotMode('uniform_cycle')}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                  snapshotMode === 'uniform_cycle'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cycle Sweep
              </button>
            </div>
          </div>

          {snapshotMode === 'uniform_cycle' ? (
            <div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-1.5">
                <label htmlFor="fleet-uniform-cycle" className="whitespace-nowrap">
                  Fleet Operating Cycle
                </label>
                <span className="font-mono tabular-nums text-cyan-300 whitespace-nowrap">
                  c{uniformCycle}
                </span>
              </div>
              <input
                id="fleet-uniform-cycle"
                type="range"
                min={20}
                max={240}
                step={5}
                value={uniformCycle}
                onChange={(e) => setUniformCycle(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="fleet-sort-select" className="block text-xs text-slate-400 mb-1.5">
                Grid Sort Order
              </label>
              <select
                id="fleet-sort-select"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="w-full rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1.5 text-xs font-mono text-slate-100"
              >
                <option value="criticality">Most Critical First (Lowest LB)</option>
                <option value="engine_id">Unit ID (#01–#48)</option>
                <option value="life_pct">Highest Lifecycle %</option>
                <option value="split">Pipeline Split Cohort</option>
              </select>
            </div>
          )}
        </div>
      </section>

      {/* 4-Column Criticality Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-lg border border-rose-500/35 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Critical Units (LB ≤ {rulThreshold} cyc)</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-rose-400">
            {counts.critical}{' '}
            <span className="text-xs font-normal text-slate-400">/ {counts.total} units</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            {((counts.critical / Math.max(1, counts.total)) * 100).toFixed(1)}% immediate action required
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">
            Watchlist ({rulThreshold} &lt; LB ≤ {rulThreshold + 25} cyc)
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-amber-300">
            {counts.warning}{' '}
            <span className="text-xs font-normal text-slate-400">/ {counts.total} units</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            Approaching preventive maintenance window
          </div>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Healthy Nominal Units</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-400">
            {counts.healthy}{' '}
            <span className="text-xs font-normal text-slate-400">/ {counts.total} units</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            Operating safely above conformal margin
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Mean Fleet Predicted RUL</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-cyan-300">
            {overview.meanPredRul.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">cycles</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {MODEL_LABELS[selectedModel]} · {regimeAware ? 'Regime-Aware' : 'Global'}
          </div>
        </div>
      </section>

      {/* Critical Engine Alert Panel (High Conformal Uncertainty Outliers) */}
      <CriticalUncertaintyAlertPanel
        subset={subset}
        selectedModel={selectedModel}
        regimeAware={regimeAware}
        alpha={alpha}
        rulThreshold={rulThreshold}
        cards={overview.cards}
        onInspectEngine={onInspectEngine}
      />

      {/* 6x8 Fleet RUL Heatmap Matrix */}
      <FleetRulHeatmap
        cards={overview.cards}
        rulThreshold={rulThreshold}
        rulCap={rulCap}
        activeFilter={filterCrit}
        onInspectEngine={onInspectEngine}
      />

      {/* Fleet Stress Scatter Plot (RUL vs. Operational Cycles) */}
      <FleetStressScatterPlot
        cards={overview.cards}
        alpha={alpha}
        rulThreshold={rulThreshold}
        rulCap={rulCap}
        activeFilter={filterCrit}
        onResetFilter={() => setFilterCrit('all')}
        onInspectEngine={onInspectEngine}
      />

      {/* Filter Tabs + Secondary Sort when in uniform cycle mode */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter Fleet by Criticality"
        >
          {(
            [
              { id: 'all', label: `All Engines (${counts.total})`, activeCls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
              { id: 'critical', label: `Critical (${counts.critical})`, activeCls: 'bg-rose-500/20 text-rose-300 border-rose-500/45' },
              { id: 'warning', label: `Watch (${counts.warning})`, activeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
              { id: 'healthy', label: `Healthy (${counts.healthy})`, activeCls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
            ] as const
          ).map((tab) => {
            const active = filterCrit === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilterCrit(tab.id)}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? tab.activeCls
                    : 'border-slate-800 bg-[#0E131D] text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <span className="text-xs font-mono text-slate-400">
          Showing {visibleCards.length} of {counts.total} units · Dashed line = τ ({rulThreshold}c)
        </span>
      </section>

      {/* 48-Engine Sparkline Grid or Empty Filter Guard */}
      {visibleCards.length === 0 ? (
        <section
          data-testid="fleet-cards-empty"
          className="rounded-lg border border-dashed border-slate-700 bg-[#0E131D] p-6 text-center space-y-2.5"
        >
          <div className="text-sm font-medium text-slate-200">
            No Engines Match Criticality Filter &ldquo;{filterCrit}&rdquo;
          </div>
          <p className="text-xs text-slate-400">
            All {counts.total} synthetic engines in this snapshot fall outside the selected criticality tier.
          </p>
          <button
            type="button"
            onClick={() => setFilterCrit('all')}
            className="px-3 py-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/15 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 transition-colors"
          >
            Reset Filter to All Engines ({counts.total})
          </button>
        </section>
      ) : (
        <section
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3"
          aria-label="Fleet Health Sparkline Grid"
        >
          {visibleCards.map((card) => {
            const st = CRITICALITY_STYLES[card.criticality];
            const series = sparkMode === 'rul' ? card.rulSparkline : card.sensorSparkline;

            return (
              <button
                key={card.engineId}
                type="button"
                onClick={() => onInspectEngine(card.engineId)}
                aria-label={`Inspect Unit ${card.engineId}, ${card.criticality}, predicted RUL ${card.predRulAtObserved.toFixed(1)} cycles, lower bound ${card.conformalLowerAtObserved.toFixed(1)} cycles`}
                className={`group text-left rounded-lg border p-3 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${st.card}`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-mono text-xs font-semibold text-slate-100 tabular-nums">
                    Unit #{String(card.engineId).padStart(2, '0')}
                  </span>
                  <span className={`font-mono text-[10px] font-bold tracking-wide ${st.badge}`}>
                    {st.label}
                  </span>
                </div>

                <div className="mt-2 mb-1.5">
                  <EngineSparkline
                    values={series}
                    criticality={card.criticality}
                    mode={sparkMode}
                    thresholdY={rulThreshold}
                    maxY={rulCap + 20}
                    engineId={card.engineId}
                  />
                </div>

                <div className="flex items-baseline justify-between gap-1 font-mono tabular-nums text-[11px]">
                  <span className={`font-semibold ${st.rulText}`}>
                    {sparkMode === 'rul'
                      ? `${card.predRulAtObserved.toFixed(1)}c RUL`
                      : `T50 ${card.currentSensorNorm.toFixed(2)}`}
                  </span>
                  <span className="text-slate-400">LB {card.conformalLowerAtObserved.toFixed(1)}c</span>
                </div>

                <div className="mt-1 pt-1 border-t border-slate-800/70 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
                  <span>
                    c{card.observedCycle}/{card.failureCycle} · {card.split}
                  </span>
                  <ArrowUpRight className="w-3 h-3 text-slate-400 group-hover:text-cyan-300 transition-colors" />
                </div>
              </button>
            );
          })}
        </section>
      )}

      <MetricGlossaryPanel
        highlightedMetrics={['rul', 'conformal_coverage', 'interval_width']}
      />
    </div>
  );
};
