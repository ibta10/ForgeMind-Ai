import React, { useMemo, useState } from 'react';
import { Columns2, Info, LayoutList } from 'lucide-react';
import { ModelAbComparisonView } from '../components/benchmark/ModelAbComparisonView';
import { BenchmarkBarChart } from '../components/charts/BenchmarkBarChart';
import { MetricGlossaryPanel } from '../components/charts/MetricGlossaryPanel';
import { TelemetryChart } from '../components/charts/TelemetryChart';
import { getFleetSplitCounts } from '../engine/metricsCatalog';
import { MODEL_LABELS, MODEL_ORDER, predictEngineRulSeries } from '../engine/models';
import { MODEL_SURROGATE_DETAILS, SURROGATE_BENCHMARK_DISCLOSURE } from '../engine/provenance';
import type {
  EngineTrajectory,
  MaintenanceParams,
  ModelBenchmarkRow,
  ModelId,
  SubsetId,
} from '../engine/types';

interface ModelBenchmarkPageProps {
  subset: SubsetId;
  fleet: EngineTrajectory[];
  benchmarkRows: ModelBenchmarkRow[];
  selectedModel: ModelId;
  onSelectModel: (model: ModelId) => void;
  regimeAware: boolean;
  onToggleRegimeAware: (val: boolean) => void;
  maintenanceParams: MaintenanceParams;
  rulCap: number;
  seed: number;
}

export const ModelBenchmarkPage: React.FC<ModelBenchmarkPageProps> = ({
  subset,
  fleet,
  benchmarkRows,
  selectedModel,
  onSelectModel,
  regimeAware,
  onToggleRegimeAware,
  maintenanceParams,
  rulCap,
  seed,
}) => {
  const [benchmarkView, setBenchmarkView] = useState<'table' | 'ab'>('table');
  const [targetView, setTargetView] = useState<'capped' | 'uncapped'>('capped');

  const evalEngine = useMemo(
    () => fleet.find((e) => e.split === 'evaluation') ?? fleet[0],
    [fleet],
  );
  const splits = useMemo(() => getFleetSplitCounts(fleet), [fleet]);

  const formatFitTime = (sec: number) =>
    sec < 1 ? `${Math.max(1, Math.round(sec * 1000))} ms` : `${sec.toFixed(2)} s`;

  const trajectorySeries = useMemo(() => {
    if (!evalEngine) return [];
    const preds = predictEngineRulSeries(fleet, evalEngine, selectedModel, regimeAware, rulCap, seed);
    return [
      {
        id: 'true',
        label: targetView === 'capped' ? `Target RUL (cap=${rulCap})` : 'Uncapped True RUL',
        color: '#94A3B8',
        dashed: true,
        values: evalEngine.cycles.map((c) => ({
          x: c.cycle,
          y: targetView === 'capped' ? c.cappedRul : c.trueRul,
        })),
      },
      {
        id: 'pred',
        label: `${MODEL_LABELS[selectedModel]} Prediction`,
        color: '#06B6D4',
        values: evalEngine.cycles.map((c, idx) => ({
          x: c.cycle,
          y: preds[idx],
        })),
      },
    ];
  }, [fleet, evalEngine, selectedModel, regimeAware, rulCap, seed, targetView]);

  const rmseBarData = useMemo(
    () =>
      benchmarkRows.map((row) => ({
        id: row.model,
        label: row.modelLabel,
        value: targetView === 'capped' ? row.metrics.cappedRmse : row.metrics.rmse,
        sublabel: `MAE ${(targetView === 'capped' ? row.metrics.cappedMae : row.metrics.mae).toFixed(2)}`,
        color: row.model === selectedModel ? '#06B6D4' : '#475569',
        highlight: row.model === selectedModel,
      })),
    [benchmarkRows, targetView, selectedModel],
  );

  const phmBarData = useMemo(
    () =>
      benchmarkRows.map((row) => ({
        id: row.model,
        label: row.modelLabel,
        value: targetView === 'capped' ? row.metrics.cappedPhm08 : row.metrics.phm08,
        sublabel: `${formatFitTime(row.trainTimeSec)} fit`,
        color: row.model === selectedModel ? '#F59E0B' : '#475569',
        highlight: row.model === selectedModel,
      })),
    [benchmarkRows, targetView, selectedModel],
  );

  return (
    <div className="space-y-6">
      {/* Control Strip */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5 max-w-full"
            role="group"
            aria-label="Benchmark View Mode"
          >
            <button
              type="button"
              aria-pressed={benchmarkView === 'table'}
              onClick={() => setBenchmarkView('table')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                benchmarkView === 'table'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              All-Surrogate Benchmark
            </button>
            <button
              type="button"
              aria-pressed={benchmarkView === 'ab'}
              onClick={() => setBenchmarkView('ab')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                benchmarkView === 'ab'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              Surrogate A/B Comparison
            </button>
          </div>

          {benchmarkView === 'table' && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Select model-family surrogate to inspect">
              <span className="text-xs text-slate-400 mr-1">Inspect Surrogate:</span>
              {MODEL_ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={selectedModel === m}
                  onClick={() => onSelectModel(m)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    selectedModel === m
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {MODEL_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
            role="group"
            aria-label="Target RUL Evaluation Mode"
          >
            <button
              type="button"
              aria-pressed={targetView === 'capped'}
              onClick={() => setTargetView('capped')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                targetView === 'capped' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Capped Target (≤{rulCap})
            </button>
            <button
              type="button"
              aria-pressed={targetView === 'uncapped'}
              onClick={() => setTargetView('uncapped')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                targetView === 'uncapped' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Uncapped RUL Target
            </button>
          </div>

          {benchmarkView === 'table' && (
            <button
              type="button"
              aria-pressed={regimeAware}
              onClick={() => onToggleRegimeAware(!regimeAware)}
              className={`px-3 py-1.5 rounded text-xs font-mono font-medium border transition-colors whitespace-nowrap ${
                regimeAware
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
              }`}
            >
              Scaling: {regimeAware ? 'Regime-Aware' : 'Global'}
            </button>
          )}
        </div>
      </section>

      {/* Surrogate Scope Disclosure */}
      <div
        data-testid="surrogate-benchmark-disclosure"
        className="rounded-lg border border-amber-500/30 bg-[#0E131D] px-4 py-3 flex items-start gap-2.5 text-xs text-slate-300"
      >
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <span className="leading-relaxed">
          <strong className="text-amber-200 font-semibold">Model-Family Surrogate Comparison:</strong>{' '}
          {SURROGATE_BENCHMARK_DISCLOSURE}
        </span>
      </div>

      {benchmarkView === 'ab' ? (
        <ModelAbComparisonView
          subset={subset}
          fleet={fleet}
          selectedModel={selectedModel}
          regimeAware={regimeAware}
          targetView={targetView}
          maintenanceParams={maintenanceParams}
          rulCap={rulCap}
          seed={seed}
        />
      ) : (
        <>
          {/* Benchmark Comparison Table */}
          <section className="rounded-lg border border-slate-800 bg-[#0E131D] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Model-Family Surrogate Comparison ({subset} · {splits.evaluation} Eval Engines)
                </h2>
                <p className="text-xs text-slate-400">
                  In-browser TypeScript surrogates fit on {splits.fit} engines and scored on {splits.evaluation} held-out evaluation trajectories · PHM08 penalizes late predictions exponentially
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">Lower is better across all columns</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">
                  Model-family surrogate benchmark comparison on synthetic {subset} evaluation trajectories
                </caption>
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th scope="col" className="py-2.5 px-4 font-medium">Model-Family Surrogate</th>
                    <th scope="col" className="py-2.5 px-4 font-medium text-right">MAE</th>
                    <th scope="col" className="py-2.5 px-4 font-medium text-right">RMSE</th>
                    <th scope="col" className="py-2.5 px-4 font-medium text-right">MAPE</th>
                    <th scope="col" className="py-2.5 px-4 font-medium text-right">PHM08 Score</th>
                    <th scope="col" className="py-2.5 px-4 font-medium text-right">Browser Fit Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {benchmarkRows.map((row) => {
                    const isSelected = row.model === selectedModel;
                    const mae = targetView === 'capped' ? row.metrics.cappedMae : row.metrics.mae;
                    const rmse = targetView === 'capped' ? row.metrics.cappedRmse : row.metrics.rmse;
                    const phm = targetView === 'capped' ? row.metrics.cappedPhm08 : row.metrics.phm08;
                    return (
                      <tr
                        key={row.model}
                        className={`transition-colors ${
                          isSelected ? 'bg-cyan-500/10 text-slate-100' : 'hover:bg-slate-800/40 text-slate-300'
                        }`}
                      >
                        <td className="py-3 px-4 font-medium">
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => onSelectModel(row.model)}
                            className={`text-left hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400 rounded ${
                              isSelected ? 'text-cyan-300' : 'text-slate-100'
                            }`}
                          >
                            {row.modelLabel}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{mae.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">{rmse.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{row.metrics.mape.toFixed(1)}%</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{phm.toFixed(1)}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">
                          {formatFitTime(row.trainTimeSec)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Bar Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <BenchmarkBarChart
              title="RMSE Comparison (Cycles)"
              subtitle={`${targetView === 'capped' ? `Capped RUL ≤ ${rulCap}` : 'Uncapped RUL'} on ${subset}`}
              sampleScopeLabel={`${splits.evaluation} eval engines`}
              xAxisLabel="Root Mean Squared Error (cycles · lower is better)"
              unit="cyc"
              precision={2}
              data={rmseBarData}
              interpretation={{
                summary:
                  'Compares squared-error sensitivity across all surrogate model families on held-out synthetic units.',
                whatItShows:
                  'RMSE squares per-cycle errors before averaging, highlighting surrogates with large occasional prediction spikes across multi-regime operating shifts.',
                metrics: ['rmse', 'mae', 'rul'],
              }}
            />
            <BenchmarkBarChart
              title="Asymmetric PHM08 Challenge Score"
              subtitle="Asymmetric penalty: exp(-d/13)-1 early vs exp(+d/10)-1 late"
              sampleScopeLabel={`${splits.evaluation} eval engines`}
              xAxisLabel="PHM08 Asymmetric Score (lower is better)"
              precision={1}
              data={phmBarData}
              interpretation={{
                summary:
                  'Measures asymmetric hazard by penalizing dangerous late RUL overestimation exponentially faster than early alerts.',
                whatItShows:
                  'PHM08 heavily penalizes late RUL overestimation (predicting more remaining life than true life), reflecting the asymmetric hazard of unexpected in-flight failure.',
                metrics: ['phm08', 'rmse'],
              }}
            />
          </div>

          {/* Trajectory Prediction View */}
          {evalEngine ? (
            <TelemetryChart
              title={`Synthetic Evaluation Engine #${evalEngine.engineId} — Surrogate Predicted vs. True RUL (${MODEL_LABELS[selectedModel]})`}
              subtitle="Cycle-by-cycle surrogate RUL trajectory compared against true piecewise/uncapped remaining useful life"
              sampleScopeLabel={`${splits.evaluation} held-out eval engines (${fleet.length} total)`}
              yLabel="Remaining Useful Life (cycles)"
              series={trajectorySeries}
              unit="cyc"
              tickPrecision={0}
              valuePrecision={1}
              clampZero
              interpretation={{
                summary:
                  'Inspects cycle-by-cycle tracking accuracy of the selected surrogate against ground-truth RUL.',
                whatItShows:
                  'Hover across operating cycles to inspect where the surrogate departs from the dashed true RUL reference. Closer tracking in the final 40 cycles directly reduces PHM08 penalty.',
                metrics: ['rul', 'mae', 'rmse', 'phm08'],
              }}
            />
          ) : (
            <div
              data-testid="benchmark-trajectory-empty"
              className="rounded-lg border border-dashed border-slate-700 bg-[#0E131D] p-6 text-center text-xs text-slate-400"
            >
              No held-out evaluation trajectories available in the active cohort.
            </div>
          )}

          {/* Browser Surrogate Architecture Reference */}
          <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                What Each Browser Surrogate Actually Computes
              </h3>
              <p className="text-xs text-slate-400">
                Transparent mapping between offline ML model families and the deterministic TypeScript surrogates executed in this app
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {MODEL_ORDER.map((m) => {
                const info = MODEL_SURROGATE_DETAILS[m];
                return (
                  <div
                    key={m}
                    className={`rounded-md border p-3 text-xs space-y-1.5 ${
                      m === selectedModel
                        ? 'border-cyan-500/40 bg-cyan-500/5'
                        : 'border-slate-800 bg-[#080B12]'
                    }`}
                  >
                    <div className="font-semibold text-slate-100">{info.surrogateLabel}</div>
                    <div className="font-mono text-[10px] text-cyan-300 uppercase">
                      Approximates: {info.familyApproximated}
                    </div>
                    <p className="text-slate-400 leading-relaxed">{info.browserImplementation}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <MetricGlossaryPanel
            highlightedMetrics={['mae', 'rmse', 'phm08', 'rul']}
          />
        </>
      )}
    </div>
  );
};

