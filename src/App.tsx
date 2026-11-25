import { useEffect, useMemo, useState } from 'react';
import machinesBackdropImg from './assets/images/industrial_machines_backdrop_1795597406779.jpg';
import { GuidedDemoBar } from './components/layout/GuidedDemoBar';
import { NoticeBanner } from './components/layout/NoticeBanner';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { analyzeFeatures, generateSyntheticFleet } from './engine/cmapss';
import { runConformalStudy } from './engine/conformal';
import {
  buildScenarioWorkbenchState,
  DEFAULT_WORKBENCH_STATE,
  GUIDED_TOUR_STEPS,
  isDefaultWorkbenchState,
  type WorkbenchSimulationState,
} from './engine/guidedDemo';
import { runMaintenanceDecisionStudy } from './engine/maintenance';
import { runModelBenchmark } from './engine/models';
import { parseUrlState, REVIEWER_SCENARIOS, type ReviewerScenario } from './engine/portfolio';
import { buildArtifactProvenance } from './engine/provenance';
import type {
  ExperimentArtifact,
  MaintenanceParams,
  ModelId,
  PageId,
  SubsetId,
} from './engine/types';
import { DatasetExplorerPage } from './pages/DatasetExplorerPage';
import { DecisionSimulatorPage } from './pages/DecisionSimulatorPage';
import { FeatureAnalyticsPage } from './pages/FeatureAnalyticsPage';
import { FleetHealthPage } from './pages/FleetHealthPage';
import { MachineHealthPage } from './pages/MachineHealthPage';
import { ModelBenchmarkPage } from './pages/ModelBenchmarkPage';
import { OverviewPage } from './pages/OverviewPage';
import { ResearchReproPage } from './pages/ResearchReproPage';
import { SensitivityAnalysisPage } from './pages/SensitivityAnalysisPage';
import { UncertaintyPage } from './pages/UncertaintyPage';

export default function App() {
  const initialUrlState = useMemo(
    () =>
      typeof window !== 'undefined' ? parseUrlState(window.location.search) : {},
    [],
  );

  const [activePage, setActivePage] = useState<PageId>(initialUrlState.page ?? 'overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [subset, setSubset] = useState<SubsetId>(
    initialUrlState.subset ?? DEFAULT_WORKBENCH_STATE.subset,
  );
  const [selectedModel, setSelectedModel] = useState<ModelId>(
    initialUrlState.model ?? DEFAULT_WORKBENCH_STATE.selectedModel,
  );
  const [regimeAware, setRegimeAware] = useState<boolean>(DEFAULT_WORKBENCH_STATE.regimeAware);
  const [rulCap, setRulCap] = useState<number>(DEFAULT_WORKBENCH_STATE.rulCap);
  const [rollingWindow, setRollingWindow] = useState<number>(DEFAULT_WORKBENCH_STATE.rollingWindow);
  const [alpha, setAlpha] = useState<number>(DEFAULT_WORKBENCH_STATE.alpha);
  const [conformalMode, setConformalMode] = useState<'global' | 'rul_binned'>(
    DEFAULT_WORKBENCH_STATE.conformalMode,
  );
  const [seed, setSeed] = useState<number>(DEFAULT_WORKBENCH_STATE.seed);

  const [maintConfig, setMaintConfig] = useState(DEFAULT_WORKBENCH_STATE.maintConfig);

  const [importedArtifact, setImportedArtifact] = useState<ExperimentArtifact | null>(null);
  const [inspectedEngineId, setInspectedEngineId] = useState<number>(40);
  const [tourStepIndex, setTourStepIndex] = useState<number | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  const activeScenario = useMemo(
    () => REVIEWER_SCENARIOS.find((s) => s.id === activeScenarioId) ?? null,
    [activeScenarioId],
  );

  const currentWorkbenchState: WorkbenchSimulationState = useMemo(
    () => ({
      subset,
      selectedModel,
      regimeAware,
      rulCap,
      rollingWindow,
      alpha,
      conformalMode,
      seed,
      maintConfig,
    }),
    [subset, selectedModel, regimeAware, rulCap, rollingWindow, alpha, conformalMode, seed, maintConfig],
  );

  const canResetDemo =
    tourStepIndex !== null ||
    activeScenarioId !== null ||
    importedArtifact !== null ||
    !isDefaultWorkbenchState(currentWorkbenchState);

  const applyWorkbenchState = (next: WorkbenchSimulationState) => {
    setSubset(next.subset);
    setSelectedModel(next.selectedModel);
    setRegimeAware(next.regimeAware);
    setRulCap(next.rulCap);
    setRollingWindow(next.rollingWindow);
    setAlpha(next.alpha);
    setConformalMode(next.conformalMode);
    setSeed(next.seed);
    setMaintConfig(next.maintConfig);
  };

  const handleSelectTourStep = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(GUIDED_TOUR_STEPS.length - 1, nextIdx));
    const step = GUIDED_TOUR_STEPS[clamped];
    setActiveScenarioId(null);
    setTourStepIndex(clamped);
    setActivePage(step.targetPage);
    if (step.recommendedSubset) {
      setImportedArtifact(null);
      setSubset(step.recommendedSubset);
    }
    if (step.recommendedModel) {
      setSelectedModel(step.recommendedModel);
    }
  };

  const handleStartGuidedDemo = () => {
    handleSelectTourStep(0);
  };

  const handleApplyScenario = (scenario: ReviewerScenario) => {
    setImportedArtifact(null);
    setTourStepIndex(null);
    setActiveScenarioId(scenario.id);
    applyWorkbenchState(buildScenarioWorkbenchState(scenario, currentWorkbenchState));
    setActivePage(scenario.targetPage);
  };

  const handleRestoreScenarioBaseline = () => {
    if (!activeScenario) return;
    setImportedArtifact(null);
    applyWorkbenchState(buildScenarioWorkbenchState(activeScenario, DEFAULT_WORKBENCH_STATE));
  };

  const handleResetDemo = () => {
    setTourStepIndex(null);
    setActiveScenarioId(null);
    setImportedArtifact(null);
    setInspectedEngineId(40);
    applyWorkbenchState(DEFAULT_WORKBENCH_STATE);
    setActivePage('overview');
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activePage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (activePage === 'overview') params.delete('page');
    else params.set('page', activePage);
    params.set('subset', subset);
    params.set('model', selectedModel);
    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [activePage, subset, selectedModel]);

  const fleet = useMemo(
    () =>
      generateSyntheticFleet(subset, {
        numEngines: 48,
        rulCap,
        rollingWindow,
        seed,
      }),
    [subset, rulCap, rollingWindow, seed],
  );

  const featureDiagnostics = useMemo(
    () => analyzeFeatures(fleet, regimeAware),
    [fleet, regimeAware],
  );

  const benchmarkRows = useMemo(
    () => runModelBenchmark(fleet, subset, regimeAware, rulCap, seed),
    [fleet, subset, regimeAware, rulCap, seed],
  );

  const conformalStudy = useMemo(
    () =>
      runConformalStudy(
        fleet,
        subset,
        selectedModel,
        alpha,
        conformalMode,
        regimeAware,
        rulCap,
        seed,
      ),
    [fleet, subset, selectedModel, alpha, conformalMode, regimeAware, rulCap, seed],
  );

  const maintenanceParams: MaintenanceParams = useMemo(
    () => ({
      subset,
      model: selectedModel,
      preventiveCost: maintConfig.preventiveCost,
      failureCost: maintConfig.failureCost,
      alpha,
      fixedInterval: maintConfig.fixedInterval,
      rulThreshold: maintConfig.rulThreshold,
      riskMultiplier: maintConfig.riskMultiplier,
      regimeAware,
      autoTune: maintConfig.autoTune,
      seed,
    }),
    [subset, selectedModel, maintConfig, alpha, regimeAware, seed],
  );

  const maintenanceStudy = useMemo(
    () => runMaintenanceDecisionStudy(fleet, maintenanceParams, rulCap),
    [fleet, maintenanceParams, rulCap],
  );

  const activeArtifact: ExperimentArtifact = useMemo(() => {
    if (importedArtifact) return importedArtifact;
    const selectedRow =
      benchmarkRows.find((r) => r.model === selectedModel) ?? benchmarkRows[0];

    // Deterministic synthetic run stamp derived from seed + active parameters (avoids re-render jitter)
    const deterministicStamp = `2026-01-01T${String(seed % 24).padStart(2, '0')}:${String(
      (rulCap + rollingWindow) % 60,
    ).padStart(2, '0')}:${String(Math.round(alpha * 100) % 60).padStart(2, '0')}.000Z`;

    return {
      experiment_id: `forgemind_${subset.toLowerCase()}_${selectedModel}_s${seed}`,
      timestamp: deterministicStamp,
      source: 'synthetic_demo',
      subset,
      model: selectedModel,
      config: {
        rul_cap: rulCap,
        rolling_window: rollingWindow,
        regime_aware: regimeAware,
        conformal_mode: conformalMode,
        alpha,
        preventive_cost: maintConfig.preventiveCost,
        failure_cost: maintConfig.failureCost,
        seed,
      },
      metrics: selectedRow.metrics,
      uncertainty: {
        nominal_coverage: conformalStudy.nominalCoverage,
        empirical_coverage: conformalStudy.empiricalCoverage,
        mean_width: conformalStudy.meanWidth,
        global_q_hat: conformalStudy.globalQHat,
      },
      policies: maintenanceStudy.summaries.map((p) => ({
        policy: p.policy,
        label: p.label,
        cost_per_cycle: p.meanCostPerCycle,
        ci_95: [p.ciLower, p.ciUpper],
        failure_rate_pct: p.failureRatePct,
        mean_wasted_rul: p.meanWastedRul,
      })),
      provenance: buildArtifactProvenance('synthetic_demo'),
    };
  }, [
    importedArtifact,
    benchmarkRows,
    selectedModel,
    subset,
    seed,
    rulCap,
    rollingWindow,
    regimeAware,
    conformalMode,
    alpha,
    maintConfig,
    conformalStudy,
    maintenanceStudy,
  ]);

  const handleExportArtifact = () => {
    const blob = new Blob([JSON.stringify(activeArtifact, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeArtifact.experiment_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUpdateMaintParams = (next: Partial<MaintenanceParams>) => {
    if (next.model) setSelectedModel(next.model);
    if (typeof next.alpha === 'number') setAlpha(next.alpha);
    if (typeof next.regimeAware === 'boolean') setRegimeAware(next.regimeAware);
    setMaintConfig((prev) => ({
      preventiveCost: next.preventiveCost ?? prev.preventiveCost,
      failureCost: next.failureCost ?? prev.failureCost,
      fixedInterval: next.fixedInterval ?? prev.fixedInterval,
      rulThreshold: next.rulThreshold ?? prev.rulThreshold,
      riskMultiplier: next.riskMultiplier ?? prev.riskMultiplier,
      autoTune: typeof next.autoTune === 'boolean' ? next.autoTune : prev.autoTune,
    }));
  };

  return (
    <div className="relative min-h-screen flex bg-[#080B12] text-slate-100 overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
      >
        <img
          src={machinesBackdropImg}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover object-center opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080B12]/72 via-[#080B12]/58 to-[#080B12]/84" />
      </div>

      <Sidebar
        activePage={activePage}
        onSelectPage={setActivePage}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        rulCap={rulCap}
        tourActive={tourStepIndex !== null}
        tourStepNumber={tourStepIndex !== null ? tourStepIndex + 1 : undefined}
        totalTourSteps={GUIDED_TOUR_STEPS.length}
        canResetDemo={canResetDemo}
        onStartGuidedDemo={handleStartGuidedDemo}
        onResetDemo={handleResetDemo}
      />

      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        <TopBar
          activePage={activePage}
          subset={subset}
          onSelectSubset={(nextSubset) => {
            setSubset(nextSubset);
            setImportedArtifact(null);
          }}
          artifactSource={activeArtifact.source}
          importedExperimentId={importedArtifact?.experiment_id}
          onExportArtifact={handleExportArtifact}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onNavigateOverview={() => setActivePage('overview')}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">
          <NoticeBanner
            importedArtifact={importedArtifact}
            onClearImported={() => setImportedArtifact(null)}
            onJumpToResearch={() => setActivePage('research')}
          />

          <GuidedDemoBar
            tourStepIndex={tourStepIndex}
            activeScenario={activeScenario}
            workbenchState={currentWorkbenchState}
            onSelectTourStep={handleSelectTourStep}
            onExitTour={() => setTourStepIndex(null)}
            onApplyScenario={handleApplyScenario}
            onRestoreScenarioBaseline={handleRestoreScenarioBaseline}
            onSelectSubset={(nextSubset) => {
              setSubset(nextSubset);
              setImportedArtifact(null);
            }}
            onResetDemo={handleResetDemo}
          />

          {activePage === 'overview' && (
            <OverviewPage
              subset={subset}
              benchmarkRows={benchmarkRows}
              conformalStudy={conformalStudy}
              policySummaries={maintenanceStudy.summaries}
              importedArtifact={importedArtifact}
              activeScenarioId={activeScenarioId}
              canResetDemo={canResetDemo}
              onNavigate={setActivePage}
              onApplyScenario={handleApplyScenario}
              onStartGuidedDemo={handleStartGuidedDemo}
              onResetDemo={handleResetDemo}
            />
          )}

          {activePage === 'datasets' && (
            <DatasetExplorerPage
              subset={subset}
              onSelectSubset={(nextSubset) => {
                setSubset(nextSubset);
                setImportedArtifact(null);
              }}
              fleet={fleet}
            />
          )}

          {activePage === 'fleet' && (
            <FleetHealthPage
              subset={subset}
              fleet={fleet}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              regimeAware={regimeAware}
              alpha={alpha}
              rulThreshold={maintConfig.rulThreshold}
              onChangeRulThreshold={(thr) =>
                setMaintConfig((prev) => ({ ...prev, rulThreshold: thr, autoTune: false }))
              }
              rulCap={rulCap}
              seed={seed}
              onInspectEngine={(engineId) => {
                setInspectedEngineId(engineId);
                setActivePage('health');
              }}
            />
          )}

          {activePage === 'health' && (
            <MachineHealthPage
              subset={subset}
              fleet={fleet}
              selectedEngineId={inspectedEngineId}
              onSelectEngineId={setInspectedEngineId}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              regimeAware={regimeAware}
              onToggleRegimeAware={setRegimeAware}
              rulCap={rulCap}
              onChangeRulCap={setRulCap}
              rollingWindow={rollingWindow}
              onChangeRollingWindow={setRollingWindow}
              alpha={alpha}
              conformalMode={conformalMode}
              rulThreshold={maintConfig.rulThreshold}
              onChangeRulThreshold={(thr) =>
                setMaintConfig((prev) => ({ ...prev, rulThreshold: thr, autoTune: false }))
              }
              seed={seed}
            />
          )}

          {activePage === 'features' && (
            <FeatureAnalyticsPage
              subset={subset}
              fleet={fleet}
              diagnostics={featureDiagnostics}
              regimeAware={regimeAware}
              onToggleRegimeAware={setRegimeAware}
            />
          )}

          {activePage === 'benchmark' && (
            <ModelBenchmarkPage
              subset={subset}
              fleet={fleet}
              benchmarkRows={benchmarkRows}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              regimeAware={regimeAware}
              onToggleRegimeAware={setRegimeAware}
              maintenanceParams={maintenanceParams}
              rulCap={rulCap}
              seed={seed}
            />
          )}

          {activePage === 'uncertainty' && (
            <UncertaintyPage
              subset={subset}
              fleet={fleet}
              selectedModel={selectedModel}
              alpha={alpha}
              onChangeAlpha={setAlpha}
              conformalMode={conformalMode}
              onChangeConformalMode={setConformalMode}
              regimeAware={regimeAware}
              onToggleRegimeAware={setRegimeAware}
              conformalStudy={conformalStudy}
              rulCap={rulCap}
              seed={seed}
            />
          )}

          {activePage === 'simulator' && (
            <DecisionSimulatorPage
              subset={subset}
              fleet={fleet}
              params={maintenanceParams}
              onUpdateParams={handleUpdateMaintParams}
              summaries={maintenanceStudy.summaries}
              tunedParams={maintenanceStudy.tunedParams}
              onRerunWithNewSeed={() => setSeed((s) => (s >= 999 ? 42 : s + 17))}
              rulCap={rulCap}
            />
          )}

          {activePage === 'sensitivity' && (
            <SensitivityAnalysisPage
              subset={subset}
              fleet={fleet}
              params={maintenanceParams}
              onUpdateParams={handleUpdateMaintParams}
              onApplyOperatingPoint={(preventiveCost, rulThreshold) => {
                setMaintConfig((prev) => ({
                  ...prev,
                  preventiveCost,
                  rulThreshold,
                  autoTune: false,
                }));
                setActivePage('simulator');
              }}
              rulCap={rulCap}
            />
          )}

          {activePage === 'research' && (
            <ResearchReproPage
              artifact={activeArtifact}
              activePage={activePage}
              conformalStudy={conformalStudy}
              sampleTrajectory={conformalStudy.sampleTrajectory}
              onExportArtifact={handleExportArtifact}
              onClearImported={() => setImportedArtifact(null)}
              onImportArtifact={(art) => {
                setImportedArtifact(art);
                setSubset(art.subset);
                setSelectedModel(art.model);
                setRulCap(Math.min(300, Math.max(25, Math.round(art.config.rul_cap))));
                setRollingWindow(Math.min(60, Math.max(2, Math.round(art.config.rolling_window))));
                setRegimeAware(art.config.regime_aware);
                setConformalMode(art.config.conformal_mode);
                setAlpha(Math.min(0.45, Math.max(0.01, art.config.alpha)));
                setSeed(Math.round(art.config.seed));
                setMaintConfig((prev) => ({
                  ...prev,
                  preventiveCost: art.config.preventive_cost,
                  failureCost: art.config.failure_cost,
                }));
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
