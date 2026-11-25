import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Pause, Play, RotateCcw, SkipBack, SkipForward, StepBack, StepForward, TrendingDown } from 'lucide-react';
import { DegradationOverlayChart } from '../components/charts/DegradationOverlayChart';
import { MetricGlossaryPanel } from '../components/charts/MetricGlossaryPanel';
import { RulDistributionHistogram } from '../components/charts/RulDistributionHistogram';
import { RulVolatilityCard } from '../components/charts/RulVolatilityCard';
import { TelemetryChart, type BreachMarker } from '../components/charts/TelemetryChart';
import { REGIME_CENTERS, SENSORS } from '../engine/cmapss';
import { getFleetSplitCounts } from '../engine/metricsCatalog';
import { MODEL_LABELS, MODEL_ORDER } from '../engine/models';
import {
  buildEnginePlaybackTimeline,
  computeRulLinearExtrapolation,
  computeRulVolatility,
  slicePlaybackTimeline,
} from '../engine/playback';
import type { EngineTrajectory, ModelId, SubsetId } from '../engine/types';

interface MachineHealthPageProps {
  subset: SubsetId;
  fleet: EngineTrajectory[];
  selectedEngineId?: number;
  onSelectEngineId?: (id: number) => void;
  selectedModel: ModelId;
  onSelectModel: (model: ModelId) => void;
  regimeAware: boolean;
  onToggleRegimeAware: (val: boolean) => void;
  rulCap: number;
  onChangeRulCap: (val: number) => void;
  rollingWindow: number;
  onChangeRollingWindow: (val: number) => void;
  alpha: number;
  conformalMode: 'global' | 'rul_binned';
  rulThreshold: number;
  onChangeRulThreshold?: (val: number) => void;
  seed: number;
}

const PLAYBACK_SPEEDS = [1, 2, 4, 8] as const;

export const MachineHealthPage: React.FC<MachineHealthPageProps> = ({
  subset,
  fleet,
  selectedEngineId: controlledEngineId,
  onSelectEngineId,
  selectedModel,
  onSelectModel,
  regimeAware,
  onToggleRegimeAware,
  rulCap,
  onChangeRulCap,
  rollingWindow,
  onChangeRollingWindow,
  alpha,
  conformalMode,
  rulThreshold,
  onChangeRulThreshold,
  seed,
}) => {
  const [internalEngineId, setInternalEngineId] = useState<number>(
    () => fleet.find((e) => e.split === 'evaluation')?.engineId ?? fleet[0]?.engineId ?? 1,
  );
  const selectedEngineId = controlledEngineId ?? internalEngineId;
  const setSelectedEngineId = onSelectEngineId ?? setInternalEngineId;
  const [localThreshold, setLocalThreshold] = useState<number>(rulThreshold);
  const effectiveThreshold = onChangeRulThreshold ? rulThreshold : localThreshold;
  const handleChangeThreshold = onChangeRulThreshold ?? setLocalThreshold;
  const [selectedSensorId, setSelectedSensorId] = useState<string>('s4');

  const engine = useMemo(
    () => fleet.find((e) => e.engineId === selectedEngineId) ?? fleet[0],
    [fleet, selectedEngineId],
  );

  const sensor = useMemo(
    () => SENSORS.find((s) => s.id === selectedSensorId) ?? SENSORS[3],
    [selectedSensorId],
  );

  const [cursorCycle, setCursorCycle] = useState<number>(() => engine?.failureCycle ?? 150);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(2);
  const [extrapolateRul, setExtrapolateRul] = useState<boolean>(true);

  // Sync cursor when fleet or selected engine changes
  useEffect(() => {
    if (!engine) return;
    setIsPlaying(false);
    setCursorCycle(engine.failureCycle);
  }, [engine?.engineId, subset]);

  // Smooth playback timer
  useEffect(() => {
    if (!isPlaying || !engine) return;
    const maxCyc = engine.failureCycle;
    const intervalMs = speed === 1 ? 80 : 40;
    const step = speed === 1 ? 1 : speed === 2 ? 1 : speed === 4 ? 2 : 4;

    const timer = window.setInterval(() => {
      setCursorCycle((prev) => {
        if (prev >= maxCyc) {
          setIsPlaying(false);
          return maxCyc;
        }
        const next = Math.min(maxCyc, prev + step);
        if (next >= maxCyc) {
          setIsPlaying(false);
        }
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, speed, engine]);

  const timeline = useMemo(() => {
    if (!engine) return null;
    return buildEnginePlaybackTimeline(
      fleet,
      engine,
      selectedModel,
      regimeAware,
      alpha,
      conformalMode,
      effectiveThreshold,
      rulCap,
      seed,
    );
  }, [fleet, engine, selectedModel, regimeAware, alpha, conformalMode, effectiveThreshold, rulCap, seed]);

  const sliced = useMemo(() => {
    if (!timeline) return null;
    return slicePlaybackTimeline(timeline, cursorCycle);
  }, [timeline, cursorCycle]);

  const physicalYDomain = useMemo<[number, number] | undefined>(() => {
    if (!engine) return undefined;
    const vals = engine.cycles.map((c) => c.sensors[sensor.id]);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = Math.max(1e-3, maxV - minV);
    return [minV - span * 0.08, maxV + span * 0.08];
  }, [engine, sensor.id]);

  const rulYDomain = useMemo<[number, number]>(() => {
    if (!timeline) return [0, rulCap + 25];
    const maxUpper = Math.max(...timeline.frames.map((f) => f.upper), rulCap + 10);
    return [0, Math.ceil(maxUpper * 1.05)];
  }, [timeline, rulCap]);

  const visibleCycles = useMemo(() => {
    if (!engine || !sliced) return [];
    return engine.cycles.slice(0, sliced.visibleFrames.length);
  }, [engine, sliced]);

  const rawAndNormalizedSeries = useMemo(() => {
    return [
      {
        id: 'norm',
        label: regimeAware ? 'Regime-Normalized' : 'Global-Normalized',
        color: '#06B6D4',
        values: visibleCycles.map((c) => ({
          x: c.cycle,
          y: regimeAware ? c.normalizedRegime[sensor.id] : c.normalizedGlobal[sensor.id],
        })),
      },
      {
        id: 'rolling',
        label: `Causal Rolling Mean (w=${rollingWindow})`,
        color: '#F59E0B',
        values: visibleCycles.map((c) => ({
          x: c.cycle,
          y: regimeAware ? c.rollingMean[sensor.id] : c.rollingMeanGlobal[sensor.id],
        })),
      },
    ];
  }, [visibleCycles, sensor.id, regimeAware, rollingWindow]);

  const rawPhysicalSeries = useMemo(() => {
    return [
      {
        id: 'raw',
        label: `${sensor.symbol} Raw (${sensor.unit})`,
        color: '#38BDF8',
        values: visibleCycles.map((c) => ({
          x: c.cycle,
          y: c.sensors[sensor.id],
        })),
      },
    ];
  }, [visibleCycles, sensor]);

  const maxChartHorizonX = useMemo(() => {
    if (!engine) return 220;
    return engine.failureCycle + 60;
  }, [engine]);

  const rulExtrapolation = useMemo(() => {
    if (!sliced) return null;
    return computeRulLinearExtrapolation(sliced.visibleFrames, {
      windowSize: 10,
      maxHorizonX: maxChartHorizonX,
      yCeiling: rulYDomain[1],
    });
  }, [sliced, maxChartHorizonX, rulYDomain]);

  const rulXDomain = useMemo<[number, number]>(() => {
    if (!engine) return [1, 150];
    if (
      extrapolateRul &&
      rulExtrapolation?.isConverging &&
      rulExtrapolation.projectedEolCycle !== null &&
      rulExtrapolation.projectedEolCycle > engine.failureCycle
    ) {
      return [
        1,
        Math.min(maxChartHorizonX, Math.ceil(rulExtrapolation.projectedEolCycle + 4)),
      ];
    }
    return [1, engine.failureCycle];
  }, [engine, extrapolateRul, rulExtrapolation, maxChartHorizonX]);

  const rulEvolutionSeries = useMemo(() => {
    if (!sliced) return [];
    const baseSeries = [
      {
        id: 'capped_rul',
        label: `Target RUL (cap=${rulCap})`,
        color: '#94A3B8',
        dashed: true,
        values: sliced.visibleFrames.map((f) => ({ x: f.cycle, y: f.cappedRul })),
      },
      {
        id: 'pred_rul',
        label: `${MODEL_LABELS[selectedModel]} Prediction`,
        color: '#06B6D4',
        values: sliced.visibleFrames.map((f) => ({ x: f.cycle, y: f.predRul })),
      },
    ];
    if (extrapolateRul && rulExtrapolation && rulExtrapolation.linePoints.length >= 2) {
      baseSeries.push({
        id: 'rul_extrapolation',
        label: '10-pt OLS Extrapolation',
        color: '#A78BFA',
        dashed: true,
        values: rulExtrapolation.linePoints,
      });
    }
    return baseSeries;
  }, [sliced, rulCap, selectedModel, extrapolateRul, rulExtrapolation]);

  const conformalBand = useMemo(() => {
    if (!sliced || !timeline) return undefined;
    return {
      label: `${timeline.nominalCoverage.toFixed(0)}% Conformal Band`,
      color: 'rgba(245, 158, 11, 0.22)',
      points: sliced.visibleFrames.map((f) => ({
        x: f.cycle,
        lower: f.lower,
        upper: f.upper,
      })),
    };
  }, [sliced, timeline]);

  const breachMarkers = useMemo<BreachMarker[]>(() => {
    if (!timeline || !sliced) return [];
    const markers: BreachMarker[] = [];
    const { clampedCycle } = sliced;
    if (
      timeline.firstThresholdTriggerCycle !== null &&
      timeline.firstThresholdTriggerCycle <= clampedCycle
    ) {
      const frame = timeline.frames.find((f) => f.cycle === timeline.firstThresholdTriggerCycle);
      if (frame) {
        markers.push({
          x: frame.cycle,
          y: frame.predRul,
          label: `Breach @ c${frame.cycle} (${frame.predRul.toFixed(1)}c)`,
          color: '#F43F5E',
        });
      }
    }
    if (
      extrapolateRul &&
      rulExtrapolation?.isConverging &&
      rulExtrapolation.projectedEolCycle !== null &&
      rulExtrapolation.projectedEolCycle <= rulXDomain[1] &&
      rulExtrapolation.projectedEolCycle - clampedCycle >= 6
    ) {
      markers.push({
        x: rulExtrapolation.projectedEolCycle,
        y: 0,
        label: `Est. EOL c${rulExtrapolation.projectedEolCycle.toFixed(0)} (${rulExtrapolation.projectedEolShortDate})`,
        color: '#A78BFA',
      });
    }
    return markers;
  }, [timeline, sliced, extrapolateRul, rulExtrapolation, rulXDomain]);

  const rulVolatility = useMemo(() => {
    if (!sliced) return null;
    return computeRulVolatility(sliced.visibleFrames, rollingWindow);
  }, [sliced, rollingWindow]);

  const splits = useMemo(() => getFleetSplitCounts(fleet), [fleet]);

  if (!engine || !timeline || !sliced || !rulVolatility) {
    return (
      <div
        data-testid="machine-health-empty"
        className="rounded-lg border border-dashed border-slate-700 bg-[#0E131D] p-8 text-center space-y-2"
      >
        <div className="text-sm font-medium text-slate-200">No Engine Telemetry Loaded</div>
        <p className="text-xs text-slate-400">
          Select or regenerate a synthetic subset to inspect unit-level degradation trajectories.
        </p>
      </div>
    );
  }

  const { activeFrame, clampedCycle, progressPct } = sliced;
  const activeCycleTelemetry =
    engine.cycles[Math.min(engine.cycles.length - 1, Math.max(0, clampedCycle - 1))];
  const normReading = regimeAware
    ? activeCycleTelemetry.normalizedRegime[sensor.id]
    : activeCycleTelemetry.normalizedGlobal[sensor.id];

  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (clampedCycle >= engine.failureCycle) {
      setCursorCycle(1);
    }
    setIsPlaying(true);
  };

  const handleScrub = (val: number) => {
    setIsPlaying(false);
    setCursorCycle(val);
  };

  const handleStep = (delta: number) => {
    setIsPlaying(false);
    setCursorCycle((prev) => Math.max(1, Math.min(engine.failureCycle, prev + delta)));
  };

  return (
    <div className="space-y-6">
      {/* Parameter Controls Bar */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
        <div>
          <label htmlFor="engine-select" className="block text-xs text-slate-400 mb-1.5">
            Engine Unit ({subset})
          </label>
          <select
            id="engine-select"
            value={engine.engineId}
            onChange={(e) => setSelectedEngineId(Number(e.target.value))}
            className="w-full rounded-md border border-slate-700 bg-[#080B12] px-3 py-2 text-xs font-mono text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {(['evaluation', 'tuning', 'calibration', 'fit'] as const).map((splitName) => {
              const cohort = fleet.filter((e) => e.split === splitName);
              if (cohort.length === 0) return null;
              return (
                <optgroup key={splitName} label={`${splitName.toUpperCase()} Cohort (${cohort.length})`}>
                  {cohort.map((e) => (
                    <option key={e.engineId} value={e.engineId}>
                      Unit #{String(e.engineId).padStart(2, '0')} · {e.failureCycle} cyc ({e.split})
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div>
          <label htmlFor="sensor-select" className="block text-xs text-slate-400 mb-1.5">
            Sensor Channel
          </label>
          <select
            id="sensor-select"
            value={sensor.id}
            onChange={(e) => setSelectedSensorId(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-[#080B12] px-3 py-2 text-xs font-mono text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {SENSORS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.symbol} · {s.description}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="health-model-select" className="block text-xs text-slate-400 mb-1.5">
            RUL Predictor
          </label>
          <select
            id="health-model-select"
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value as ModelId)}
            className="w-full rounded-md border border-slate-700 bg-[#080B12] px-3 py-2 text-xs font-mono text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {MODEL_ORDER.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <label htmlFor="rolling-window">Rolling Window</label>
            <span className="font-mono tabular-nums text-slate-200">{rollingWindow} cycles</span>
          </div>
          <input
            id="rolling-window"
            type="range"
            min={5}
            max={30}
            step={1}
            value={rollingWindow}
            onChange={(e) => onChangeRollingWindow(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-1.5">
            <label htmlFor="rul-cap" className="whitespace-nowrap">RUL Cap</label>
            <span className="font-mono tabular-nums text-slate-200 whitespace-nowrap">{rulCap} cycles</span>
          </div>
          <input
            id="rul-cap"
            type="range"
            min={80}
            max={160}
            step={5}
            value={rulCap}
            onChange={(e) => onChangeRulCap(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-[#080B12] px-3 py-2">
          <span className="text-xs text-slate-300">Regime Scaling</span>
          <button
            type="button"
            role="switch"
            aria-checked={regimeAware}
            onClick={() => onToggleRegimeAware(!regimeAware)}
            className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
              regimeAware
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {regimeAware ? 'ON' : 'OFF'}
          </button>
        </div>
      </section>

      {/* Interactive Degradation & Conformal Playback Deck */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Interactive Degradation Playback — Unit #{engine.engineId} ({subset})
            </h2>
            <p className="text-xs text-slate-400">
              Animate waveforms, RUL point estimates, and {timeline.nominalCoverage.toFixed(0)}% conformal bounds toward end-of-life (cycle {engine.failureCycle})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
            <span className="text-slate-200">
              Cycle <strong className="text-cyan-300">{clampedCycle}</strong> / {engine.failureCycle} ({progressPct.toFixed(1)}%)
            </span>
            <span
              data-testid="health-alert-status"
              className={`px-2.5 py-1 rounded border text-[11px] font-medium ${
                activeFrame.thresholdTriggered
                  ? 'border-rose-500/45 bg-rose-500/15 text-rose-300'
                  : activeFrame.riskTriggered
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                    : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              {activeFrame.thresholdTriggered
                ? `Critical Alert: Pred ${activeFrame.predRul.toFixed(1)} ≤ ${effectiveThreshold} cyc`
                : activeFrame.riskTriggered
                  ? `Conformal Alert: LB ${activeFrame.lower.toFixed(1)} ≤ ${effectiveThreshold} cyc`
                  : `Safe Margin: Pred ${activeFrame.predRul.toFixed(1)} cyc`}
            </span>
          </div>
        </div>

        {/* Alert Threshold Slider & Breach Summary */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <label
                htmlFor="health-alert-threshold"
                className="text-xs font-medium text-slate-200 whitespace-nowrap"
              >
                Alert Threshold (τ)
              </label>
            </div>
            <div className="flex items-center gap-3 flex-1 min-w-[200px] max-w-md">
              <input
                id="health-alert-threshold"
                type="range"
                min={5}
                max={80}
                step={1}
                value={effectiveThreshold}
                onChange={(e) => handleChangeThreshold(Number(e.target.value))}
                className="w-full accent-rose-500"
              />
              <span
                data-testid="health-alert-threshold-value"
                className="font-mono text-xs font-semibold tabular-nums text-rose-300 whitespace-nowrap w-14 text-right"
              >
                {effectiveThreshold} cyc
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums text-slate-300">
            <span>
              Alert Zone:{' '}
              <strong data-testid="health-alert-breach-count" className="text-rose-300">
                {timeline.alertBreachCount}
              </strong>{' '}
              cycles (Pred ≤ {effectiveThreshold}c)
            </span>
            {timeline.firstThresholdTriggerCycle !== null && (
              <button
                type="button"
                onClick={() => handleScrub(timeline.firstThresholdTriggerCycle!)}
                className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors whitespace-nowrap"
                title="Jump to first cycle where predicted RUL enters the critical safety zone"
              >
                Breach @ c{timeline.firstThresholdTriggerCycle}
              </button>
            )}
          </div>
        </div>

        {/* Linear Extrapolation (Last 10 Cycles) Control & EOL Projection Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="text-xs font-medium text-slate-200 whitespace-nowrap">
                Extrapolate RUL (10-pt Linear Regression)
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={extrapolateRul}
              aria-label="Extrapolate RUL"
              data-testid="extrapolate-rul-toggle"
              onClick={() => setExtrapolateRul((v) => !v)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors whitespace-nowrap ${
                extrapolateRul
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/45'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {extrapolateRul ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => handleScrub(Math.max(12, Math.round(engine.failureCycle * 0.72)))}
              className="px-2.5 py-1 rounded border border-slate-700 bg-[#080B12] text-[11px] font-mono text-slate-300 hover:text-violet-300 hover:border-violet-500/40 transition-colors whitespace-nowrap"
              title="Scrub to 72% lifecycle to preview forward end-of-life trajectory projection"
            >
              Preview @ c{Math.max(12, Math.round(engine.failureCycle * 0.72))}
            </button>
          </div>

          {extrapolateRul && rulExtrapolation && (
            <div
              data-testid="extrapolate-rul-readout"
              className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-slate-300"
            >
              <span title="Projected assuming 1 operating cycle equals 1 flight day">
                Est. EOL Date (1 cyc≈1d):{' '}
                <strong data-testid="extrapolate-eol-date" className="text-violet-300">
                  {rulExtrapolation.projectedEolDateLabel}
                </strong>
              </span>
              <span>
                EOL Cycle:{' '}
                <strong data-testid="extrapolate-eol-cycle" className="text-slate-100">
                  {rulExtrapolation.projectedEolCycle !== null
                    ? `c${rulExtrapolation.projectedEolCycle.toFixed(1)} (+${rulExtrapolation.remainingCycles?.toFixed(0)}d)`
                    : 'Non-converging'}
                </strong>
              </span>
              <span className="text-slate-400">
                Slope {rulExtrapolation.slope.toFixed(2)} c/step · R² {rulExtrapolation.rSquared.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Pause' : clampedCycle >= engine.failureCycle ? 'Play from Start' : 'Play'}
            </button>

            <button
              type="button"
              aria-label="Reset playback to cycle 1"
              onClick={() => handleScrub(1)}
              className="p-1.5 rounded border border-slate-700 bg-[#080B12] text-slate-300 hover:bg-slate-800"
              title="Reset to Cycle 1"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Step back 5 cycles"
              onClick={() => handleStep(-5)}
              className="p-1.5 rounded border border-slate-700 bg-[#080B12] text-slate-300 hover:bg-slate-800"
              title="Step -5 cycles"
            >
              <StepBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Step forward 5 cycles"
              onClick={() => handleStep(5)}
              className="p-1.5 rounded border border-slate-700 bg-[#080B12] text-slate-300 hover:bg-slate-800"
              title="Step +5 cycles"
            >
              <StepForward className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Jump to failure cycle"
              onClick={() => handleScrub(engine.failureCycle)}
              className="p-1.5 rounded border border-slate-700 bg-[#080B12] text-slate-300 hover:bg-slate-800"
              title="Jump to End"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            {timeline.firstRiskTriggerCycle !== null && (
              <button
                type="button"
                onClick={() => handleScrub(timeline.firstRiskTriggerCycle!)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-700 bg-[#080B12] text-[11px] font-mono text-amber-300 hover:bg-slate-800 whitespace-nowrap"
                title="Jump to first Conformal Risk-Aware trigger cycle"
              >
                <RotateCcw className="w-3 h-3" />
                Trigger @ c{timeline.firstRiskTriggerCycle}
              </button>
            )}
          </div>

          <div className="flex-1 min-w-[200px] flex items-center gap-2.5">
            <label htmlFor="playback-scrubber" className="sr-only">
              Playback Cycle Scrubber
            </label>
            <input
              id="playback-scrubber"
              type="range"
              min={1}
              max={engine.failureCycle}
              step={1}
              value={clampedCycle}
              onChange={(e) => handleScrub(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>

          <div
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5 shrink-0"
            role="group"
            aria-label="Playback Speed"
          >
            {PLAYBACK_SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                  speed === s
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Live Cycle Telemetry, Conformal Snapshot & RUL Volatility Readout */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Active Cycle &amp; Regime</div>
          <div className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-100">
            Cycle {activeFrame.cycle}{' '}
            <span className="text-xs font-normal text-slate-400">/ {engine.failureCycle}</span>
          </div>
          <div className="mt-1 text-xs font-mono text-slate-400 truncate">
            R{activeFrame.regime + 1}: {REGIME_CENTERS[activeFrame.regime]?.label ?? 'Nominal'} · Mode {engine.faultMode}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Live {sensor.symbol} Reading</div>
          <div className="mt-1 font-mono text-xl font-bold tabular-nums text-cyan-300">
            {activeCycleTelemetry.sensors[sensor.id].toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-400">{sensor.unit}</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            {regimeAware ? 'Regime-norm' : 'Global-norm'}: {normReading.toFixed(3)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">Live RUL Estimate ({MODEL_LABELS[selectedModel]})</div>
          <div
            className={`mt-1 font-mono text-xl font-bold tabular-nums ${
              activeFrame.thresholdTriggered ? 'text-rose-400' : 'text-slate-100'
            }`}
          >
            {activeFrame.predRul.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">cyc</span>
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            True RUL: {activeFrame.trueRul} cyc ·{' '}
            {timeline.firstThresholdTriggerCycle !== null
              ? `Breach c${timeline.firstThresholdTriggerCycle}`
              : 'Above τ'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E131D] p-4">
          <div className="text-xs text-slate-400">
            Conformal Interval ({timeline.nominalCoverage.toFixed(0)}%)
          </div>
          <div className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-300">
            [{activeFrame.lower.toFixed(1)}, {activeFrame.upper.toFixed(1)}]
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-400">
            Width: {activeFrame.width.toFixed(1)} cyc ·{' '}
            {timeline.firstRiskTriggerCycle !== null
              ? `LB Trigger c${timeline.firstRiskTriggerCycle}`
              : 'No LB trigger'}
          </div>
        </div>

        <RulVolatilityCard
          volatility={rulVolatility}
          currentCycle={clampedCycle}
          onJumpToCycle={handleScrub}
        />
      </section>

      {/* Primary Evolving RUL + Conformal Band Plot */}
      <TelemetryChart
        title={`Unit #${engine.engineId} — Live RUL Prediction & ${timeline.nominalCoverage.toFixed(0)}% Conformal Interval Evolution`}
        subtitle="Real-time point RUL curve, calibrated conformal margin [LB, UB], threshold breach marker, and optional 10-pt OLS EOL projection"
        sampleScopeLabel={`${splits.calibration} cal · ${splits.evaluation} eval cohort (${fleet.length} total)`}
        yLabel="Remaining Useful Life (cycles)"
        series={rulEvolutionSeries}
        band={conformalBand}
        thresholdY={effectiveThreshold}
        thresholdLabel={`Alert Threshold τ = ${effectiveThreshold} cyc`}
        highlightBelowThreshold
        criticalZoneLabel={`Critical Safety Zone (RUL ≤ ${effectiveThreshold} cyc)`}
        breachMarkers={breachMarkers}
        height={265}
        unit="cyc"
        tickPrecision={0}
        valuePrecision={1}
        clampZero
        xDomain={rulXDomain}
        yDomain={rulYDomain}
        cursorX={clampedCycle}
        interpretation={{
          summary:
            'Tracks point RUL decay alongside the conformal lower/upper safety envelope and alert threshold τ.',
          whatItShows:
            'The amber shaded ribbon spans the empirical conformal prediction interval [LB, UB] around the cyan RUL curve. Conformal Risk-Aware intervention triggers as soon as the conservative lower bound LB drops below τ, protecting against over-optimistic point errors.',
          conditionGuide: {
            normal: 'Lower bound clears safety threshold (LB > τ)',
            warning: 'Conservative lower bound crossed threshold ahead of point RUL (LB ≤ τ)',
            critical: 'Point RUL entered shaded danger zone (Pred ≤ τ)',
          },
          metrics: ['rul', 'conformal_coverage', 'interval_width'],
        }}
      />

      {/* Dual Animated Sensor Telemetry Plots */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TelemetryChart
          title={`${sensor.symbol} (${sensor.description}) — Scaled & Causal Rolling Signal`}
          subtitle="Normalized feature trajectory paired with causal trailing rolling mean"
          sampleScopeLabel={`${splits.fit} fit normalization reference`}
          yLabel={regimeAware ? 'Per-Regime Min-Max [0, 1]' : 'Global Min-Max [0, 1]'}
          series={rawAndNormalizedSeries}
          tickPrecision={2}
          valuePrecision={3}
          xDomain={[1, engine.failureCycle]}
          yDomain={[0, 1.05]}
          cursorX={clampedCycle}
          interpretation={{
            summary:
              'Compares instantaneous scaled sensor reading against its causal trailing rolling mean.',
            whatItShows:
              'Regime-normalized signals isolate smooth progressive wear from discrete flight-condition jumps on FD002/FD004. The amber trailing rolling mean smooths cycle-to-cycle sensor jitter over the selected rolling window.',
            metrics: ['rul'],
          }}
        />

        <TelemetryChart
          title={`${sensor.symbol} Unnormalized Physical Signal`}
          subtitle="Raw simulated engineering units prior to feature scaling"
          sampleScopeLabel={`Unit #${engine.engineId} (${engine.failureCycle} cyc)`}
          yLabel={`Physical Reading (${sensor.unit})`}
          series={rawPhysicalSeries}
          unit={sensor.unit}
          tickPrecision={1}
          valuePrecision={2}
          xDomain={[1, engine.failureCycle]}
          yDomain={physicalYDomain}
          cursorX={clampedCycle}
        />
      </div>

      {/* Subset-Wide Predicted RUL Distribution Histogram */}
      <RulDistributionHistogram
        subset={subset}
        fleet={fleet}
        primaryEngineId={engine.engineId}
        onSelectEngine={setSelectedEngineId}
        selectedModel={selectedModel}
        regimeAware={regimeAware}
        rulThreshold={effectiveThreshold}
        rulCap={rulCap}
        seed={seed}
        playbackCycle={clampedCycle}
      />

      {/* Comparative Multi-Engine Degradation Slope Overlay */}
      <DegradationOverlayChart
        fleet={fleet}
        primaryEngineId={engine.engineId}
        onSelectPrimaryEngine={setSelectedEngineId}
        sensorId={sensor.id}
        regimeAware={regimeAware}
        selectedModel={selectedModel}
        rulCap={rulCap}
        seed={seed}
      />

      <MetricGlossaryPanel
        highlightedMetrics={['rul', 'conformal_coverage', 'interval_width']}
      />
    </div>
  );
};

