import React, { useMemo } from 'react';
import { RegimeScatterChart } from '../components/charts/RegimeScatterChart';
import { SUBSET_SPECS } from '../engine/cmapss';
import type { EngineTrajectory, SubsetId } from '../engine/types';

interface DatasetExplorerPageProps {
  subset: SubsetId;
  onSelectSubset: (subset: SubsetId) => void;
  fleet: EngineTrajectory[];
}

const SUBSETS: SubsetId[] = ['FD001', 'FD002', 'FD003', 'FD004'];

export const DatasetExplorerPage: React.FC<DatasetExplorerPageProps> = ({
  subset,
  onSelectSubset,
  fleet,
}) => {
  const spec = SUBSET_SPECS[subset];

  const scatterPoints = useMemo(() => {
    const pts: Array<{ os1: number; os2: number; os3: number; regime: number }> = [];
    for (const eng of fleet.slice(0, 12)) {
      for (let i = 0; i < eng.cycles.length; i += 6) {
        const c = eng.cycles[i];
        pts.push({ os1: c.os1, os2: c.os2, os3: c.os3, regime: c.regime });
      }
    }
    return pts;
  }, [fleet]);

  const splitBreakdown = useMemo(() => {
    const counts = { fit: 0, calibration: 0, tuning: 0, evaluation: 0 };
    for (const eng of fleet) {
      counts[eng.split] += 1;
    }
    return [
      { key: 'fit', label: 'Model Fit Split', count: counts.fit, share: '45%', purpose: 'Train RUL estimator & fit regime scaler' },
      { key: 'calibration', label: 'Conformal Calibration', count: counts.calibration, share: '20%', purpose: 'Compute finite-sample residual quantiles' },
      { key: 'tuning', label: 'Policy Tuning Split', count: counts.tuning, share: '15%', purpose: 'Grid-search fixed interval & RUL thresholds' },
      { key: 'evaluation', label: 'Disjoint Evaluation', count: counts.evaluation, share: '20%', purpose: 'Score coverage & maintenance episode cost' },
    ];
  }, [fleet]);

  const lifeHistogram = useMemo(() => {
    const buckets = [
      { label: '120–169', min: 0, max: 170, count: 0 },
      { label: '170–209', min: 170, max: 210, count: 0 },
      { label: '210–249', min: 210, max: 250, count: 0 },
      { label: '250–289', min: 250, max: 290, count: 0 },
      { label: '290+', min: 290, max: 999, count: 0 },
    ];
    for (const eng of fleet) {
      const b = buckets.find((x) => eng.failureCycle >= x.min && eng.failureCycle < x.max);
      if (b) b.count += 1;
    }
    const maxCount = Math.max(1, ...buckets.map((b) => b.count));
    return buckets.map((b) => ({ ...b, pct: (b.count / maxCount) * 100 }));
  }, [fleet]);

  return (
    <div className="space-y-6">
      {/* Official NASA Reference vs Synthetic Generator Provenance */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-100">
              Official NASA C-MAPSS Reference Metadata
            </span>
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-300 uppercase">
              Literature Reference
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Train/test unit counts (100–260 engines), regime counts (1 or 6), fault modes, and run-to-failure life bounds cite Saxena et al. (PHM 2008). Raw NASA <code className="font-mono text-slate-300">.txt</code> sensor files are <strong className="text-slate-200">not</strong> loaded or evaluated in-browser.
          </p>
        </div>

        <div className="rounded-lg border border-amber-500/35 bg-[#0E131D] p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-amber-200">
              Active In-Browser Synthetic Cohort ({fleet.length} Units)
            </span>
            <span className="rounded border border-amber-500/45 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300 uppercase">
              Generated Demo Data
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            All plotted operating regimes, sensor curves (<code className="font-mono text-slate-200">s1–s21</code>), and life histograms below come from <code className="font-mono text-amber-200">generateSyntheticFleet()</code> (deterministic seeded simulation, 48 engines/subset).
          </p>
        </div>
      </section>

      {/* Subset Comparison Matrix */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Official NASA Reference Specs vs. Active Synthetic Simulation ({subset})
            </h2>
            <p className="text-xs text-slate-400">
              Literature unit counts shown for structural reference only; browser simulation generates {fleet.length} seeded units per subset
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">Select a subset button to switch</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">
              Official NASA C-MAPSS reference subset specifications compared with the in-browser synthetic cohort size
            </caption>
            <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th scope="col" className="py-2.5 px-4 font-medium">Subset</th>
                <th scope="col" className="py-2.5 px-4 font-medium text-right">NASA Ref. Train</th>
                <th scope="col" className="py-2.5 px-4 font-medium text-right">NASA Ref. Test</th>
                <th scope="col" className="py-2.5 px-4 font-medium text-right">Browser Sim Units</th>
                <th scope="col" className="py-2.5 px-4 font-medium text-right">Conditions</th>
                <th scope="col" className="py-2.5 px-4 font-medium text-right">Fault Modes</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Operating Profile</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Degradation Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {SUBSETS.map((id) => {
                const s = SUBSET_SPECS[id];
                const isActive = id === subset;
                return (
                  <tr
                    key={id}
                    className={`transition-colors ${
                      isActive ? 'bg-cyan-500/10 text-slate-100' : 'hover:bg-slate-800/40 text-slate-300'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-cyan-300">
                      <button
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => onSelectSubset(id)}
                        className="text-left hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400 rounded"
                      >
                        {s.id}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">{s.trainEngines}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">{s.testEngines}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-300">{fleet.length} sim</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{s.conditions}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{s.faultModes}</td>
                    <td className="py-3 px-4">{s.operatingProfile}</td>
                    <td className="py-3 px-4 text-slate-400">{s.faultDescription}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Operating Regimes + Engine Life Distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RegimeScatterChart
          points={scatterPoints}
          conditions={spec.conditions}
          fleetEngineCount={fleet.length}
          interpretation={{
            summary:
              spec.conditions === 1
                ? 'Single nominal sea-level cluster (R1) isolates sensor drift from flight-condition variance.'
                : 'Six altitude/Mach/TRA regimes (R1–R6) require per-regime scaling prior to RUL estimation.',
            whatItShows:
              spec.conditions === 1
                ? 'All operating points cluster in a single nominal sea-level regime (R1), keeping sensor variance directly coupled to mechanical wear.'
                : 'Points span 6 distinct altitude/Mach/TRA regimes (R1–R6). Regime-aware scaling centers each sensor within its nearest K-Means cluster before RUL estimation.',
          }}
        />

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 flex flex-col justify-between space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Simulated Engine Run-to-Failure Distribution ({spec.id})
            </h3>
            <p className="text-xs text-slate-400">
              {fleet.length} synthetic trajectories generated with median life ~{spec.medianLife} cycles · Y: Failure Life Bin (cyc), X: Engine Count (units)
            </p>
          </div>

          {fleet.length === 0 ? (
            <div
              data-testid="dataset-life-empty"
              className="rounded border border-dashed border-slate-700 p-4 text-center text-xs text-slate-400"
            >
              No synthetic engine trajectories generated.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-[72px_1fr_42px] items-center gap-3 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <span>Life (cyc)</span>
                <span>Relative Cohort Share</span>
                <span className="text-right">Units</span>
              </div>
            {lifeHistogram.map((bucket) => (
              <div key={bucket.label} className="grid grid-cols-[72px_1fr_42px] items-center gap-3 text-xs">
                <span className="font-mono tabular-nums text-slate-400">{bucket.label}</span>
                <div className="h-4 rounded bg-slate-900 border border-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-cyan-500/75 transition-all duration-300"
                    style={{ width: `${bucket.pct}%` }}
                  />
                </div>
                <span className="text-right font-mono tabular-nums text-slate-200">{bucket.count}</span>
              </div>
            ))}
            </div>
          )}

          <div className="border-t border-slate-800 pt-4">
            <h4 className="text-xs font-semibold text-slate-200 mb-2.5">
              Engine-Disjoint Pipeline Partition ({fleet.length} demo units)
            </h4>
            <div className="grid grid-cols-2 gap-2.5">
              {splitBreakdown.map((sp) => (
                <div
                  key={sp.key}
                  className="rounded border border-slate-800/90 bg-slate-900/50 p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between font-mono tabular-nums">
                    <span className="text-slate-200 font-medium">{sp.label}</span>
                    <span className="text-cyan-300">{sp.count} units</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{sp.purpose}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
