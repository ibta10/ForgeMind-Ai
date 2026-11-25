import React, { useMemo } from 'react';
import { CorrelationHeatmap } from '../components/charts/CorrelationHeatmap';
import { TechnicalInterpretation } from '../components/charts/TechnicalInterpretation';
import { computeCorrelationMatrix, SENSORS } from '../engine/cmapss';
import { formatPearsonR, getFleetSplitCounts } from '../engine/metricsCatalog';
import type { EngineTrajectory, FeatureDiagnostic, SubsetId } from '../engine/types';

interface FeatureAnalyticsPageProps {
  subset: SubsetId;
  fleet: EngineTrajectory[];
  diagnostics: FeatureDiagnostic[];
  regimeAware: boolean;
  onToggleRegimeAware: (val: boolean) => void;
}

export const FeatureAnalyticsPage: React.FC<FeatureAnalyticsPageProps> = ({
  subset,
  fleet,
  diagnostics,
  regimeAware,
  onToggleRegimeAware,
}) => {
  const activeSensors = useMemo(() => {
    const activeIds = new Set(diagnostics.filter((d) => !d.isConstant).map((d) => d.sensorId));
    return SENSORS.filter((s) => activeIds.has(s.id));
  }, [diagnostics]);

  const corrMatrix = useMemo(
    () =>
      computeCorrelationMatrix(
        fleet,
        activeSensors.map((s) => s.id),
        regimeAware,
      ),
    [fleet, activeSensors, regimeAware],
  );

  const sortedDiagnostics = useMemo(
    () => [...diagnostics].sort((a, b) => b.importanceScore - a.importanceScore),
    [diagnostics],
  );

  const constantCount = diagnostics.filter((d) => d.isConstant).length;
  const splits = useMemo(() => getFleetSplitCounts(fleet), [fleet]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-100">
            Sensor Screening & Correlation Analysis ({subset})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Active sensors retained: <span className="font-mono text-slate-200">{activeSensors.length}</span> · Constant channels dropped:{' '}
            <span className="font-mono text-slate-200">{constantCount}</span> · Evaluated across <span className="font-mono text-slate-200">{splits.fit} fit</span> / {fleet.length} total synthetic units
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Scaling Basis:</span>
          <div
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
            role="group"
            aria-label="Scaling Basis"
          >
            <button
              type="button"
              aria-pressed={!regimeAware}
              onClick={() => onToggleRegimeAware(false)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                !regimeAware ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Global Scaling
            </button>
            <button
              type="button"
              aria-pressed={regimeAware}
              onClick={() => onToggleRegimeAware(true)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                regimeAware ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Regime-Aware Scaling
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Heatmap */}
        <div className="xl:col-span-7 min-w-0">
          <CorrelationHeatmap
            sensors={activeSensors}
            matrix={corrMatrix}
            sampleScopeLabel={`${splits.fit} fit-split synthetic engines`}
            interpretation={{
              summary:
                'Highlights redundant thermal and pressure sensor covariance clusters under active scaling.',
              whatItShows:
                'Strong positive or negative off-diagonal clusters identify redundant thermal or pressure channels moving together as compressor efficiency drops. Switch between Global and Regime-Aware scaling to verify whether multi-regime flight shifts were dominating sensor covariance.',
              metrics: ['rul'],
            }}
          />
        </div>

        {/* Sensor Ranking Table */}
        <div className="xl:col-span-5 min-w-0 rounded-lg border border-slate-800 bg-[#0E131D] overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-slate-100">
              Channel Importance &amp; Screening Table ({fleet.length} Engines)
            </h3>
            <p className="text-xs text-slate-400">
              r vs RUL: Pearson correlation against remaining cycles · Norm Var: within-regime normalized variance · Imp.: composite diagnostic rank
            </p>
          </div>

          <div className="max-h-[460px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2.5 font-medium">Channel</th>
                  <th className="py-2 px-2.5 font-medium text-right whitespace-nowrap">r vs RUL</th>
                  <th className="py-2 px-2.5 font-medium text-right whitespace-nowrap">Norm Var</th>
                  <th className="py-2 px-2.5 font-medium text-right whitespace-nowrap">Imp.</th>
                  <th className="py-2 px-2.5 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {sortedDiagnostics.map((d) => (
                  <tr key={d.sensorId} className="hover:bg-slate-800/35">
                    <td className="py-2 px-2.5">
                      <div className="font-mono font-semibold text-slate-100">{d.symbol}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[115px]">
                        {d.description}
                      </div>
                    </td>
                    <td
                      className={`py-2 px-2.5 text-right font-mono tabular-nums ${
                        d.isConstant
                          ? 'text-slate-400'
                          : d.correlationWithRul < 0
                            ? 'text-amber-300'
                            : 'text-cyan-300'
                      }`}
                    >
                      {d.isConstant ? '0.000' : formatPearsonR(d.correlationWithRul)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-300">
                      {d.withinRegimeVariance.toFixed(4)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-200">
                      {d.importanceScore.toFixed(3)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono text-[11px] whitespace-nowrap">
                      {d.isConstant ? (
                        <span className="text-slate-400">Dropped</span>
                      ) : (
                        <span className="text-emerald-400">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <TechnicalInterpretation
              title="Sensor Screening & Regime Normalization"
              summary="Drops zero-variance channels and ranks remaining sensors by correlation with remaining useful life."
              whatItShows="Constant channels carry zero variance and are dropped automatically prior to regression. Negative Pearson r means sensor reading climbs as RUL falls (e.g., EGT / T50 thermal rise); positive r means reading drops as wear progresses (e.g., HPC static pressure Ps30)."
              sampleScope={`${splits.fit} model-fit engines (${fleet.length} total)`}
              metrics={['rul']}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
