import React, { useMemo } from 'react';
import { MetricGlossaryPanel } from '../components/charts/MetricGlossaryPanel';
import { TelemetryChart } from '../components/charts/TelemetryChart';
import { runConformalStudy } from '../engine/conformal';
import { getFleetSplitCounts } from '../engine/metricsCatalog';
import { MODEL_LABELS } from '../engine/models';
import type { ConformalStudyResult, EngineTrajectory, ModelId, SubsetId } from '../engine/types';

interface UncertaintyPageProps {
  subset: SubsetId;
  fleet: EngineTrajectory[];
  selectedModel: ModelId;
  alpha: number;
  onChangeAlpha: (alpha: number) => void;
  conformalMode: 'global' | 'rul_binned';
  onChangeConformalMode: (mode: 'global' | 'rul_binned') => void;
  regimeAware: boolean;
  onToggleRegimeAware: (val: boolean) => void;
  conformalStudy: ConformalStudyResult;
  rulCap: number;
  seed: number;
}

export const UncertaintyPage: React.FC<UncertaintyPageProps> = ({
  subset,
  fleet,
  selectedModel,
  alpha,
  onChangeAlpha,
  conformalMode,
  onChangeConformalMode,
  regimeAware,
  onToggleRegimeAware,
  conformalStudy,
  rulCap,
  seed,
}) => {
  const baselineGlobalStudy = useMemo(
    () =>
      runConformalStudy(fleet, subset, selectedModel, alpha, conformalMode, false, rulCap, seed),
    [fleet, subset, selectedModel, alpha, conformalMode, rulCap, seed],
  );

  const regimeAwareStudy = useMemo(
    () =>
      runConformalStudy(fleet, subset, selectedModel, alpha, conformalMode, true, rulCap, seed),
    [fleet, subset, selectedModel, alpha, conformalMode, rulCap, seed],
  );

  const trajectorySeries = useMemo(
    () => [
      {
        id: 'true',
        label: `True RUL (cap=${rulCap})`,
        color: '#E2E8F0',
        dashed: true,
        values: conformalStudy.sampleTrajectory.map((p) => ({ x: p.cycle, y: p.trueRul })),
      },
      {
        id: 'pred',
        label: 'Point Prediction',
        color: '#06B6D4',
        values: conformalStudy.sampleTrajectory.map((p) => ({ x: p.cycle, y: p.predRul })),
      },
    ],
    [conformalStudy.sampleTrajectory, rulCap],
  );

  const conformalBand = useMemo(
    () => ({
      label: `${conformalStudy.nominalCoverage.toFixed(0)}% Conformal Interval`,
      color: 'rgba(245, 158, 11, 0.18)',
      points: conformalStudy.sampleTrajectory.map((p) => ({
        x: p.cycle,
        lower: p.lower,
        upper: p.upper,
      })),
    }),
    [conformalStudy],
  );

  const coverageGap = conformalStudy.empiricalCoverage - conformalStudy.nominalCoverage;
  const splits = useMemo(() => getFleetSplitCounts(fleet), [fleet]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <label htmlFor="alpha-slider">Target Coverage (1 − α)</label>
            <span className="font-mono tabular-nums text-cyan-300 font-semibold">
              {((1 - alpha) * 100).toFixed(0)}% (α = {alpha.toFixed(2)})
            </span>
          </div>
          <input
            id="alpha-slider"
            type="range"
            min={0.02}
            max={0.25}
            step={0.01}
            value={alpha}
            onChange={(e) => onChangeAlpha(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
        </div>

        <div>
          <div className="text-xs text-slate-400 mb-1.5">Conformal Calibration Mode</div>
          <div
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
            role="group"
            aria-label="Conformal Calibration Mode"
          >
            <button
              type="button"
              aria-pressed={conformalMode === 'global'}
              onClick={() => onChangeConformalMode('global')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                conformalMode === 'global'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Global Quantile
            </button>
            <button
              type="button"
              aria-pressed={conformalMode === 'rul_binned'}
              onClick={() => onChangeConformalMode('rul_binned')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                conformalMode === 'rul_binned'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RUL-Binned Adaptive
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-400 mb-1.5">Operating Regime Normalization</div>
          <div
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5"
            role="group"
            aria-label="Operating Regime Normalization"
          >
            <button
              type="button"
              aria-pressed={!regimeAware}
              onClick={() => onToggleRegimeAware(false)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                !regimeAware ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Unnormalized (Global)
            </button>
            <button
              type="button"
              aria-pressed={regimeAware}
              onClick={() => onToggleRegimeAware(true)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                regimeAware ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Regime-Aware
            </button>
          </div>
        </div>
      </section>

      {/* KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Empirical Eval Coverage</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-400">
            {conformalStudy.empiricalCoverage.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            Delta vs target: {coverageGap >= 0 ? `+${coverageGap.toFixed(1)}` : coverageGap.toFixed(1)} pp
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Mean Interval Width</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-amber-300">
            {conformalStudy.meanWidth.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">cycles</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Mode: {conformalMode === 'rul_binned' ? 'Conditioned on predicted RUL' : 'Constant half-width'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Global Calibrated q̂</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-100">
            ±{conformalStudy.globalQHat.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">cycles</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Calibrated on {splits.calibration} cal · Scored on {splits.evaluation} eval engines
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Regime-Aware Width Reduction</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-cyan-300">
            {baselineGlobalStudy.meanWidth > 0
              ? `-${Math.max(
                  0,
                  ((baselineGlobalStudy.meanWidth - regimeAwareStudy.meanWidth) /
                    baselineGlobalStudy.meanWidth) *
                    100,
                ).toFixed(1)}%`
              : '0.0%'}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            {baselineGlobalStudy.meanWidth.toFixed(1)} → {regimeAwareStudy.meanWidth.toFixed(1)} cyc
          </div>
        </div>
      </section>

      {/* Main Conformal Band Trajectory */}
      <TelemetryChart
        title={`Split Conformal Prediction Band on Disjoint Evaluation Unit (${subset} · ${MODEL_LABELS[selectedModel]})`}
        subtitle={`Empirical ${conformalStudy.nominalCoverage.toFixed(0)}% prediction band [LB, UB] constructed via ${conformalMode === 'rul_binned' ? 'RUL-binned adaptive quantiles' : 'global split-conformal quantile ±q̂'}`}
        sampleScopeLabel={`${splits.calibration} cal · ${splits.evaluation} eval engines`}
        yLabel="Remaining Useful Life (cycles)"
        series={trajectorySeries}
        band={conformalBand}
        unit="cyc"
        tickPrecision={0}
        valuePrecision={1}
        clampZero
        interpretation={{
          summary:
            'Visualizes calibrated prediction uncertainty around point RUL across an unseen evaluation trajectory.',
          whatItShows:
            'Hover across cycles to inspect the exact prediction band [LB, UB] and half-width ±q̂. When True RUL stays inside the shaded amber band, conformal coverage holds. RUL-binned calibration tightens bands near failure where absolute errors naturally shrink.',
          metrics: ['conformal_coverage', 'interval_width', 'rul'],
        }}
      />

      {/* Bin-Conditioned Diagnostics Table */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Coverage &amp; Interval Width Across Predicted RUL Lifecycle Bins ({splits.evaluation} Eval Engines)
            </h3>
            <p className="text-xs text-slate-400">
              Near-failure cycles (0–25 cyc) exhibit tighter residuals under RUL-binned calibration, avoiding excessive early replacements
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Target coverage: {conformalStudy.nominalCoverage.toFixed(1)}%
          </span>
        </div>

        {conformalStudy.bins.length === 0 ? (
          <div
            data-testid="conformal-bins-empty"
            className="p-6 text-center text-xs text-slate-400"
          >
            No calibration or evaluation RUL bins available for the active subset.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Predicted RUL Bin</th>
                  <th className="py-2.5 px-4 font-medium text-right">Eval Samples</th>
                  <th className="py-2.5 px-4 font-medium text-right">Calibrated q̂</th>
                  <th className="py-2.5 px-4 font-medium text-right">Mean Width</th>
                  <th className="py-2.5 px-4 font-medium text-right">Empirical Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {conformalStudy.bins.map((b) => {
                  const hasSamples = b.sampleCount > 0;
                  const meetsTarget = hasSamples && b.empiricalCoverage >= conformalStudy.nominalCoverage - 4;
                  return (
                    <tr key={b.binLabel} className="hover:bg-slate-800/35">
                      <td className="py-3 px-4 font-mono font-medium text-slate-100">{b.binLabel}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                        {b.sampleCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                        ±{b.qHat.toFixed(1)} cyc
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-300">
                        {b.meanWidth.toFixed(1)} cyc
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                          !hasSamples
                            ? 'text-slate-400'
                            : meetsTarget
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                        }`}
                      >
                        {hasSamples ? `${b.empiricalCoverage.toFixed(1)}%` : '— (fallback ±q̂)'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <MetricGlossaryPanel
        highlightedMetrics={['conformal_coverage', 'interval_width', 'rul']}
      />
    </div>
  );
};
