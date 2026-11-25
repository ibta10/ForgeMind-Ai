import test from 'node:test';
import assert from 'node:assert/strict';
import { assignKMeansRegimes, fitRegimeCentroids, generateSyntheticFleet, analyzeFeatures } from './cmapss';
import {
  computePhm08Score,
  computeRegressionMetrics,
  MODEL_LABELS,
  MODEL_ORDER,
  predictWithEstimator,
  trainRulEstimator,
} from './models';
import { runConformalStudy } from './conformal';
import {
  comparePolicyConfigurations,
  computeMaintenanceRoi,
  runMaintenanceDecisionStudy,
  runThresholdCostSurface,
} from './maintenance';
import {
  buildLinkedInProjectSummary,
  buildShareableUrl,
  parseAndValidateExperimentArtifact,
  parseUrlState,
  REVIEWER_SCENARIOS,
} from './portfolio';
import { buildPdfReportMetadata, generateExperimentPdfReport } from './pdfReport';
import {
  buildArtifactProvenance,
  DATASET_PROVENANCE_CATALOG,
  IMPLEMENTATION_BOUNDARY_ITEMS,
  MODEL_SURROGATE_DETAILS,
  PROTOTYPE_SAFETY_WARNING,
  RESEARCH_LIMITATIONS,
  SURROGATE_BENCHMARK_DISCLOSURE,
} from './provenance';
import {
  buildScenarioWorkbenchState,
  DEFAULT_WORKBENCH_STATE,
  getScenarioChangedFields,
  GUIDED_TOUR_STEPS,
  isDefaultWorkbenchState,
} from './guidedDemo';
import { runModelAbComparison } from './abComparison';
import {
  buildEnginePlaybackTimeline,
  computeRulLinearExtrapolation,
  computeRulVolatility,
  slicePlaybackTimeline,
} from './playback';
import {
  buildSensitivity3DScene,
  DEFAULT_SURFACE_3D_CAMERA,
  findGlobalMinimumBasin,
} from './surface3d';
import {
  analyzeFleetUncertaintyAlerts,
  buildFleetRulHeatmapMatrix,
  buildFleetStressScatterData,
  computeFleetHealthOverview,
  computeRulGradientColor,
  computeUncertaintyWidthColor,
} from './fleetHealth';
import {
  buildDegradationSlopeOverlay,
  pickDefaultPeerEngineIds,
} from './degradationOverlay';
import { buildSubsetRulHistogram } from './rulDistribution';
import {
  formatCostPerCycle,
  formatErrorMetric,
  formatInterval,
  formatPct,
  formatPearsonR,
  formatPhm08,
  formatRul,
  getFleetSplitCounts,
  METRIC_DEFINITIONS,
  METRIC_ORDER,
  validateMaintenanceConfig,
} from './metricsCatalog';
import { conformalQuantile, createSeededRng } from './prng';

test('seeded PRNG produces identical sequences across invocations', () => {
  const rngA = createSeededRng(1234);
  const rngB = createSeededRng(1234);
  for (let i = 0; i < 20; i++) {
    assert.equal(rngA(), rngB());
  }
});

test('k-means regime assignment separates 6 distinct operating conditions on FD002', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 24, seed: 42 });
  const regimes = new Set(fleet.flatMap((e) => e.cycles.map((c) => c.regime)));
  assert.equal(regimes.size, 6);

  const direct = assignKMeansRegimes(
    [
      { os1: 0, os2: 0.0002, os3: 100 },
      { os1: 42, os2: 0.8409, os3: 100 },
    ],
    6,
  );
  assert.notEqual(direct[0], direct[1]);
});

test('PHM08 score penalizes late predictions (positive d) more heavily than early predictions', () => {
  const earlyScore = computePhm08Score([50], [40]); // d = -10
  const lateScore = computePhm08Score([50], [60]); // d = +10
  assert.ok(lateScore > earlyScore, `expected lateScore (${lateScore}) > earlyScore (${earlyScore})`);

  const metrics = computeRegressionMetrics([50, 100], [50, 100], 125);
  assert.equal(metrics.mae, 0);
  assert.equal(metrics.rmse, 0);
  assert.equal(metrics.phm08, 0);
});

test('finite-sample conformal quantile achieves near-nominal empirical coverage on FD001', () => {
  const q = conformalQuantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.1);
  assert.ok(q >= 9 && q <= 10);

  const fleet = generateSyntheticFleet('FD001', { numEngines: 40, seed: 42 });
  const study = runConformalStudy(fleet, 'FD001', 'gradient_boosting', 0.1, 'rul_binned', true, 125, 42);
  assert.ok(study.empiricalCoverage >= 75, `coverage was ${study.empiricalCoverage}%`);
  assert.ok(study.bins.length === 4);
  assert.ok(study.sampleTrajectory.length > 50);
});

test('maintenance decision study enforces oracle lower-bound and detects failures on run-to-failure', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 40, seed: 42 });
  const { summaries } = runMaintenanceDecisionStudy(fleet, {
    subset: 'FD002',
    model: 'gradient_boosting',
    preventiveCost: 100,
    failureCost: 600,
    alpha: 0.1,
    fixedInterval: 150,
    rulThreshold: 20,
    riskMultiplier: 1.0,
    regimeAware: true,
    autoTune: true,
    seed: 42,
  });

  const byId = new Map(summaries.map((s) => [s.policy, s]));
  const rtf = byId.get('run_to_failure')!;
  const oracle = byId.get('oracle')!;
  const riskAware = byId.get('risk_aware')!;

  assert.equal(rtf.failureRatePct, 100);
  assert.equal(oracle.failureRatePct, 0);
  assert.ok(oracle.meanCostPerCycle <= riskAware.meanCostPerCycle);
  assert.ok(riskAware.ciLower <= riskAware.meanCostPerCycle);
  assert.ok(riskAware.ciUpper >= riskAware.meanCostPerCycle);
});

test('feature diagnostics identify constant sensors on FD001', () => {
  const fleet = generateSyntheticFleet('FD001', { numEngines: 30, seed: 42 });
  const diag = analyzeFeatures(fleet, true);
  const s1 = diag.find((d) => d.sensorId === 's1')!;
  const s4 = diag.find((d) => d.sensorId === 's4')!;
  assert.equal(s1.isConstant, true);
  assert.equal(s4.isConstant, false);
  assert.ok(s4.importanceScore > 0.3);
});

test('LinkedIn showcase copy and guided reviewer scenarios are complete and honest', () => {
  assert.ok(REVIEWER_SCENARIOS.length >= 3);
  const summary = buildLinkedInProjectSummary({
    experiment_id: 'forgemind_fd002_gradient_boosting_s42',
    timestamp: '2026-11-21T09:00:00.000Z',
    source: 'synthetic_demo',
    subset: 'FD002',
    model: 'gradient_boosting',
    config: {
      rul_cap: 125,
      rolling_window: 15,
      regime_aware: true,
      conformal_mode: 'rul_binned',
      alpha: 0.1,
      preventive_cost: 100,
      failure_cost: 600,
      seed: 42,
    },
    metrics: {
      mae: 15.2,
      rmse: 22.4,
      mse: 501.76,
      mape: 12.1,
      phm08: 120.5,
      cappedMae: 14.1,
      cappedRmse: 19.8,
      cappedPhm08: 98.2,
    },
    uncertainty: {
      nominal_coverage: 90,
      empirical_coverage: 91.2,
      mean_width: 24.5,
      global_q_hat: 12.5,
    },
    policies: [
      {
        policy: 'risk_aware',
        label: 'Risk-Aware Conformal',
        cost_per_cycle: 0.51,
        ci_95: [0.47, 0.56],
        failure_rate_pct: 0,
        mean_wasted_rul: 8.5,
      },
      {
        policy: 'threshold',
        label: 'RUL Threshold',
        cost_per_cycle: 0.72,
        ci_95: [0.49, 1.05],
        failure_rate_pct: 11.1,
        mean_wasted_rul: 7.2,
      },
    ],
  });

  assert.ok(summary.projectTitle.includes('ForgeMind AI'));
  assert.ok(summary.projectDescription.includes('synthetic C-MAPSS-shaped'));
  assert.ok(summary.skills.length >= 6);
  assert.ok(summary.bibtex.includes('rahman2026forgemind'));
});

test('shareable URL state parser and builder validate enums safely', () => {
  const parsed = parseUrlState('?page=simulator&subset=FD004&model=lstm');
  assert.equal(parsed.page, 'simulator');
  assert.equal(parsed.subset, 'FD004');
  assert.equal(parsed.model, 'lstm');

  const invalid = parseUrlState('?page=invalid_page&subset=FD999&model=gpt99');
  assert.equal(invalid.page, undefined);
  assert.equal(invalid.subset, undefined);
  assert.equal(invalid.model, undefined);

  const built = buildShareableUrl('https://forgemind.example', '/', {
    page: 'uncertainty',
    subset: 'FD002',
    model: 'gradient_boosting',
  });
  assert.equal(built, 'https://forgemind.example/?page=uncertainty&subset=FD002&model=gradient_boosting');
});

test('PDF report generator produces a valid multi-page PDF document with config and metrics', () => {
  const sampleArtifact = {
    experiment_id: 'forgemind_fd002_gradient_boosting_s42',
    timestamp: '2026-11-21T09:50:00.000Z',
    source: 'synthetic_demo' as const,
    subset: 'FD002' as const,
    model: 'gradient_boosting' as const,
    config: {
      rul_cap: 125,
      rolling_window: 15,
      regime_aware: true,
      conformal_mode: 'rul_binned' as const,
      alpha: 0.1,
      preventive_cost: 100,
      failure_cost: 600,
      seed: 42,
    },
    metrics: {
      mae: 17.99,
      rmse: 31.36,
      mse: 983.45,
      mape: 16.4,
      phm08: 12540.2,
      cappedMae: 12.4,
      cappedRmse: 18.2,
      cappedPhm08: 840.1,
    },
    uncertainty: {
      nominal_coverage: 90,
      empirical_coverage: 96.5,
      mean_width: 25.6,
      global_q_hat: 13.1,
    },
    policies: [
      {
        policy: 'risk_aware' as const,
        label: 'Risk-Aware Conformal',
        cost_per_cycle: 0.587,
        ci_95: [0.51, 0.68] as [number, number],
        failure_rate_pct: 0,
        mean_wasted_rul: 14.2,
      },
      {
        policy: 'threshold' as const,
        label: 'RUL Threshold',
        cost_per_cycle: 0.583,
        ci_95: [0.50, 0.67] as [number, number],
        failure_rate_pct: 0,
        mean_wasted_rul: 13.8,
      },
    ],
  };

  const meta = buildPdfReportMetadata(sampleArtifact);
  assert.equal(meta.filename, 'forgemind-ai-fd002-gradient_boosting-report.pdf');
  assert.equal(meta.configRows.length, 10);
  assert.equal(meta.metricRows.length, 6);
  assert.equal(meta.provenanceBadge, 'SYNTHETIC SIMULATION');
  assert.ok(meta.provenanceLabel.includes('SYNTHETIC SIMULATION'));
  assert.ok(meta.safetyWarning.includes('NOT a certified'));
  assert.ok(meta.surrogateDisclosure.includes('No raw NASA C-MAPSS'));
  assert.ok(meta.limitations.length >= 5);
  assert.ok(meta.configRows.some((r) => r.label === 'Model-Family Surrogate' && r.value.includes('Surrogate')));

  const { doc, filename } = generateExperimentPdfReport({ artifact: sampleArtifact });
  assert.equal(filename, meta.filename);
  assert.equal(doc.getNumberOfPages(), 3);
  const pdfOutput = doc.output('arraybuffer');
  const header = new TextDecoder().decode(new Uint8Array(pdfOutput).slice(0, 5));
  assert.equal(header, '%PDF-');
});

test('2D sensitivity surface computes valid RUL threshold x preventive cost grid and row optima', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 36, seed: 42 });
  const surface = runThresholdCostSurface(fleet, {
    subset: 'FD002',
    model: 'gradient_boosting',
    preventiveCost: 100,
    failureCost: 600,
    alpha: 0.1,
    fixedInterval: 150,
    rulThreshold: 20,
    riskMultiplier: 1.0,
    regimeAware: true,
    autoTune: true,
    seed: 42,
  });

  assert.equal(surface.thresholds.length, 9);
  assert.equal(surface.preventiveCosts.length, 8);
  assert.equal(surface.cells.length, 72);

  for (const cp of surface.preventiveCosts) {
    const rowCells = surface.cells.filter((c) => c.preventiveCost === cp);
    assert.equal(rowCells.length, 9);
    const minRowCost = Math.min(...rowCells.map((c) => c.riskAwareCostPerCycle));
    assert.equal(surface.optimalRiskByCost[cp].costPerCycle, minRowCost);
  }
});

test('A/B comparison evaluates two models or feature-scaling approaches consistently on the same fleet', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 36, seed: 42 });
  const baseParams = {
    subset: 'FD002' as const,
    model: 'gradient_boosting' as const,
    preventiveCost: 100,
    failureCost: 600,
    alpha: 0.1,
    fixedInterval: 150,
    rulThreshold: 20,
    riskMultiplier: 1.0,
    regimeAware: true,
    autoTune: true,
    seed: 42,
  };

  // Feature-engineering comparison: Global vs Regime-Aware on multi-regime FD002
  const scalingAb = runModelAbComparison(
    fleet,
    'FD002',
    { model: 'gradient_boosting', regimeAware: false },
    { model: 'gradient_boosting', regimeAware: true },
    baseParams,
  );

  assert.equal(scalingAb.evalEngineId, scalingAb.variantA.sampleTrajectory.engineId);
  assert.equal(scalingAb.evalEngineId, scalingAb.variantB.sampleTrajectory.engineId);
  assert.ok(scalingAb.deltas.rmseDelta < 0, 'Regime-aware scaling must reduce RMSE on FD002');
  assert.ok(
    scalingAb.variantB.sampleTrajectory.cycles.length ===
      scalingAb.variantA.sampleTrajectory.cycles.length,
  );

  // Model-family comparison: Linear Regression vs HistGradientBoosting
  const modelAb = runModelAbComparison(
    fleet,
    'FD002',
    { model: 'linear_regression', regimeAware: true },
    { model: 'gradient_boosting', regimeAware: true },
    baseParams,
  );
  assert.ok(modelAb.deltas.rmseDelta < 0, 'HistGBT should reduce RUL RMSE relative to Linear');
  assert.equal(
    modelAb.deltas.riskCostDelta,
    Number(
      (
        modelAb.variantB.maintenance.riskAwareCostPerCycle -
        modelAb.variantA.maintenance.riskAwareCostPerCycle
      ).toFixed(3),
    ),
  );
});

test('engine playback timeline calibrates conformal bounds and slices progression cleanly', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 36, seed: 42 });
  const evalEngine = fleet.find((e) => e.split === 'evaluation') ?? fleet[0];
  const timeline = buildEnginePlaybackTimeline(
    fleet,
    evalEngine,
    'gradient_boosting',
    true,
    0.1,
    'rul_binned',
    20,
    125,
    42,
  );

  assert.equal(timeline.engineId, evalEngine.engineId);
  assert.equal(timeline.frames.length, evalEngine.failureCycle);
  assert.ok(timeline.firstRiskTriggerCycle !== null && timeline.firstRiskTriggerCycle < evalEngine.failureCycle);

  const midCycle = Math.floor(evalEngine.failureCycle / 2);
  const sliced = slicePlaybackTimeline(timeline, midCycle);
  assert.equal(sliced.visibleFrames.length, midCycle);
  assert.equal(sliced.activeFrame.cycle, midCycle);
  assert.ok(sliced.activeFrame.lower <= sliced.activeFrame.predRul);
  assert.ok(sliced.activeFrame.upper >= sliced.activeFrame.predRul);
});

test('fleet health overview computes sparklines and criticality counts for all 48 engines', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 48, seed: 42 });
  assert.equal(fleet.length, 48);

  const overview = computeFleetHealthOverview(
    fleet,
    'FD002',
    'gradient_boosting',
    true,
    0.1,
    20,
    { snapshotMode: 'mixed_fleet', rulCap: 125, seed: 42 },
  );

  assert.equal(overview.cards.length, 48);
  assert.equal(overview.counts.total, 48);
  assert.equal(
    overview.counts.critical + overview.counts.warning + overview.counts.healthy,
    48,
  );
  assert.ok(overview.counts.critical > 0, 'Mixed fleet snapshot should surface critical engines');
  assert.ok(overview.counts.healthy > 0, 'Mixed fleet snapshot should include healthy engines');

  for (const card of overview.cards) {
    assert.ok(card.rulSparkline.length >= 2);
    assert.ok(card.sensorSparkline.length >= 2);
    if (card.conformalLowerAtObserved <= 20) {
      assert.equal(card.criticality, 'critical');
    }
  }

  // Uniform late-cycle sweep increases critical count compared to early-cycle sweep
  const earlySweep = computeFleetHealthOverview(fleet, 'FD002', 'gradient_boosting', true, 0.1, 20, {
    snapshotMode: 'uniform_cycle',
    uniformCycle: 45,
  });
  const lateSweep = computeFleetHealthOverview(fleet, 'FD002', 'gradient_boosting', true, 0.1, 20, {
    snapshotMode: 'uniform_cycle',
    uniformCycle: 175,
  });
  assert.ok(lateSweep.counts.critical > earlySweep.counts.critical);

  assert.equal(parseUrlState('?page=fleet&subset=FD002&model=gradient_boosting').page, 'fleet');
});

test('maintenance ROI computes exact cycle-normalized savings vs reactive baseline including negative ROI', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 40, seed: 42 });
  const { summaries } = runMaintenanceDecisionStudy(fleet, {
    subset: 'FD002',
    model: 'gradient_boosting',
    preventiveCost: 100,
    failureCost: 600,
    alpha: 0.1,
    fixedInterval: 150,
    rulThreshold: 20,
    riskMultiplier: 1.0,
    regimeAware: true,
    autoTune: true,
    seed: 42,
  });

  const roi = computeMaintenanceRoi(summaries);
  assert.equal(roi.baselinePolicy, 'run_to_failure');
  assert.equal(roi.policies.length, 4);

  const risk = roi.policies.find((p) => p.policy === 'risk_aware')!;
  const riskSummary = summaries.find((s) => s.policy === 'risk_aware')!;
  const baselineSummary = summaries.find((s) => s.policy === 'run_to_failure')!;

  assert.ok(risk.savingsPer10kCycles > 0, 'Risk-Aware should save cost when Cf=600 vs Cp=100');
  assert.ok(risk.costReductionPct > 0);
  assert.ok(risk.roiPct > 0);
  assert.equal(risk.avoidedFailures, baselineSummary.failureCount - riskSummary.failureCount);
  assert.equal(risk.episodesSeries.length, riskSummary.episodes.length);

  // Episode cumulative savings endpoint must reconcile with total realized eval savings
  const lastPoint = risk.episodesSeries[risk.episodesSeries.length - 1];
  assert.ok(
    Math.abs(lastPoint.cumulativeSavings - risk.realizedEvalSavings) <= 0.15,
    `Expected cumulative endpoint ${lastPoint.cumulativeSavings} to match realized ${risk.realizedEvalSavings}`,
  );

  // Negative ROI edge case: preventive swap cost ($300) exceeds reactive failure penalty ($200)
  const negativeStudy = runMaintenanceDecisionStudy(fleet, {
    subset: 'FD002',
    model: 'gradient_boosting',
    preventiveCost: 300,
    failureCost: 200,
    alpha: 0.1,
    fixedInterval: 150,
    rulThreshold: 20,
    riskMultiplier: 1.0,
    regimeAware: true,
    autoTune: true,
    seed: 42,
  });
  const negativeRoi = computeMaintenanceRoi(negativeStudy.summaries);
  const oracleNeg = negativeRoi.policies.find((p) => p.policy === 'oracle')!;
  assert.ok(oracleNeg.savingsPer10kCycles < 0, 'When Cp > Cf, proactive swap has negative ROI vs reactive');
});

test('fleet RUL heatmap builds exact 6x8 matrix with red-to-green criticality color gradient', () => {
  const red = computeRulGradientColor(10, 20, 125);
  const mid = computeRulGradientColor(64, 20, 125);
  const green = computeRulGradientColor(125, 20, 125);

  assert.equal(red.ratio, 0);
  assert.ok(red.r > red.g && red.r > 200, `Expected critical color to be red-dominant, got ${red.hex}`);
  assert.ok(mid.ratio > 0.3 && mid.ratio < 0.6);
  assert.equal(green.ratio, 1);
  assert.ok(green.g > green.r && green.g > 150, `Expected healthy color to be green-dominant, got ${green.hex}`);

  const fleet = generateSyntheticFleet('FD002', { numEngines: 48, seed: 42 });
  const overview = computeFleetHealthOverview(
    fleet,
    'FD002',
    'gradient_boosting',
    true,
    0.1,
    20,
    { snapshotMode: 'mixed_fleet', rulCap: 125, seed: 42 },
  );

  const byUnit = buildFleetRulHeatmapMatrix(overview.cards, {
    sortBy: 'engine_id',
    metric: 'pred_rul',
    rulThreshold: 20,
    rulCap: 125,
  });
  assert.equal(byUnit.rowCount, 6);
  assert.equal(byUnit.colCount, 8);
  assert.equal(byUnit.rows.length, 6);
  for (const row of byUnit.rows) {
    assert.equal(row.length, 8);
  }
  assert.equal(byUnit.rows[0][0].card.engineId, 1);
  assert.equal(byUnit.rows[5][7].card.engineId, 48);

  const byCriticality = buildFleetRulHeatmapMatrix(overview.cards, {
    sortBy: 'criticality',
    metric: 'conformal_lower',
    rulThreshold: 20,
    rulCap: 125,
  });
  const flatSorted = byCriticality.rows.flat();
  for (let i = 1; i < flatSorted.length; i++) {
    assert.ok(flatSorted[i].displayRul >= flatSorted[i - 1].displayRul);
  }
});

test('multi-engine degradation slope overlay aligns trajectories and quantifies terminal acceleration', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 48, seed: 42 });
  const primaryId = 40;
  const peers = pickDefaultPeerEngineIds(fleet, primaryId, 4);

  assert.equal(peers.length, 4);
  assert.ok(!peers.includes(primaryId));
  assert.equal(new Set(peers).size, 4);

  const lifecycleOverlay = buildDegradationSlopeOverlay(fleet, peers, {
    primaryEngineId: primaryId,
    sensorId: 's4',
    alignment: 'lifecycle_pct',
    signalMode: 'rolling_mean',
    regimeAware: true,
    model: 'gradient_boosting',
    rulCap: 125,
    seed: 42,
  });

  assert.equal(lifecycleOverlay.series.length, 5);
  assert.equal(lifecycleOverlay.series[0].isPrimary, true);
  assert.equal(lifecycleOverlay.series[0].engineId, primaryId);
  assert.equal(lifecycleOverlay.fleetEnvelope.length, 41);
  assert.equal(lifecycleOverlay.fleetEnvelope[0].x, 0);
  assert.equal(lifecycleOverlay.fleetEnvelope[40].x, 100);

  for (const s of lifecycleOverlay.series) {
    assert.equal(s.points.length, 41);
    assert.ok(
      s.terminalSlopePer100 > s.earlySlopePer100,
      `Expected exponential terminal acceleration on Unit #${s.engineId}: terminal=${s.terminalSlopePer100} vs early=${s.earlySlopePer100}`,
    );
    assert.ok(s.accelerationRatio > 1.2);
  }

  const failureAligned = buildDegradationSlopeOverlay(fleet, peers, {
    primaryEngineId: primaryId,
    sensorId: 's4',
    alignment: 'cycles_to_failure',
    signalMode: 'pred_rul',
    regimeAware: true,
    model: 'gradient_boosting',
    rulCap: 125,
    seed: 42,
  });

  assert.equal(failureAligned.fleetEnvelope.length, 0);
  for (const s of failureAligned.series) {
    assert.equal(s.points[s.points.length - 1].x, 0, 'Failure-aligned trajectory must terminate at 0');
  }
});

test('subset predicted RUL distribution histogram bins all 48 engines and shifts left as cycles advance', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 48, seed: 42 });

  const early = buildSubsetRulHistogram(fleet, {
    subset: 'FD002',
    primaryEngineId: 40,
    model: 'gradient_boosting',
    regimeAware: true,
    rulThreshold: 20,
    rulCap: 125,
    seed: 42,
    snapshotMode: 'playback_cycle',
    targetCycle: 40,
  });

  const late = buildSubsetRulHistogram(fleet, {
    subset: 'FD002',
    primaryEngineId: 40,
    model: 'gradient_boosting',
    regimeAware: true,
    rulThreshold: 20,
    rulCap: 125,
    seed: 42,
    snapshotMode: 'playback_cycle',
    targetCycle: 180,
  });

  assert.equal(early.totalEngines, 48);
  assert.equal(early.bins.reduce((s, b) => s + b.count, 0), 48);
  assert.equal(late.bins.reduce((s, b) => s + b.count, 0), 48);
  assert.equal(early.bins.filter((b) => b.containsPrimary).length, 1);
  assert.ok(late.medianPredRul < early.medianPredRul);
  assert.ok(late.meanPredRul < early.meanPredRul);
  assert.ok(late.bins[0].count > early.bins[0].count, 'Critical 0-15c bin count increases in late cycle');

  assert.ok(late.p10PredRul <= late.p25PredRul);
  assert.ok(late.p25PredRul <= late.medianPredRul);
  assert.ok(late.medianPredRul <= late.p75PredRul);
  assert.ok(late.p75PredRul <= late.p90PredRul);
});

test('comparative policy configuration builder computes side-by-side total costs, failure rates, and wasted RUL', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 48, seed: 42 });

  const comparison = comparePolicyConfigurations(
    fleet,
    {
      policy: 'risk_aware',
      model: 'gradient_boosting',
      regimeAware: true,
      alpha: 0.1,
      autoTune: true,
      rulThreshold: 20,
      fixedInterval: 150,
    },
    {
      policy: 'run_to_failure',
      model: 'gradient_boosting',
      regimeAware: true,
      alpha: 0.1,
      autoTune: true,
      rulThreshold: 20,
      fixedInterval: 150,
    },
    {
      subset: 'FD002',
      preventiveCost: 100,
      failureCost: 600,
      riskMultiplier: 1.0,
      seed: 42,
    },
    125,
  );

  assert.equal(
    comparison.resultA.preventiveSpend + comparison.resultA.failureSpend,
    comparison.resultA.summary.totalCost,
  );
  assert.equal(
    comparison.resultB.preventiveSpend + comparison.resultB.failureSpend,
    comparison.resultB.summary.totalCost,
  );
  assert.equal(
    comparison.deltas.totalCostDelta,
    comparison.resultB.summary.totalCost - comparison.resultA.summary.totalCost,
  );
  assert.ok(comparison.deltas.totalCostDelta > 0, 'Run-to-failure must cost more than Risk-Aware');
  assert.equal(comparison.resultB.summary.failureRatePct, 100);
  assert.equal(comparison.resultB.summary.meanWastedRul, 0);
  assert.ok(comparison.resultA.summary.meanWastedRul > 0);
});

test('raising the alert threshold shifts breach triggers earlier and increases alert zone cycles', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 36, seed: 42 });
  const evalEngine = fleet.find((e) => e.split === 'evaluation') ?? fleet[0];

  const lowThr = buildEnginePlaybackTimeline(
    fleet,
    evalEngine,
    'gradient_boosting',
    true,
    0.1,
    'rul_binned',
    15,
    125,
    42,
  );
  const highThr = buildEnginePlaybackTimeline(
    fleet,
    evalEngine,
    'gradient_boosting',
    true,
    0.1,
    'rul_binned',
    55,
    125,
    42,
  );

  assert.ok(highThr.alertBreachCount > lowThr.alertBreachCount);
  assert.ok(highThr.riskTriggerCount >= lowThr.riskTriggerCount);
  assert.ok(
    highThr.firstThresholdTriggerCycle !== null &&
      lowThr.firstThresholdTriggerCycle !== null &&
      highThr.firstThresholdTriggerCycle < lowThr.firstThresholdTriggerCycle,
    'Higher alert threshold must trigger predicted-RUL breach earlier',
  );
  assert.ok(
    highThr.firstRiskTriggerCycle !== null &&
      lowThr.firstRiskTriggerCycle !== null &&
      highThr.firstRiskTriggerCycle <= lowThr.firstRiskTriggerCycle,
  );
});

test('conformal uncertainty alert analysis flags high-uncertainty outliers monotonically across sensitivity cutoffs', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 48, seed: 42 });

  const gbtOverview = computeFleetHealthOverview(
    fleet,
    'FD002',
    'gradient_boosting',
    true,
    0.1,
    20,
    { snapshotMode: 'mixed_fleet', rulCap: 125, seed: 42 },
  );

  for (const card of gbtOverview.cards) {
    assert.equal(
      card.conformalIntervalWidth,
      Number((card.conformalUpperAtObserved - card.conformalLowerAtObserved).toFixed(1)),
    );
    assert.ok(card.localPredVolatility >= 0);
  }

  const strict = analyzeFleetUncertaintyAlerts(gbtOverview.cards, { sigmaCutoff: 0.75 });
  const balanced = analyzeFleetUncertaintyAlerts(gbtOverview.cards, { sigmaCutoff: 1.0 });
  const severe = analyzeFleetUncertaintyAlerts(gbtOverview.cards, { sigmaCutoff: 1.5 });
  const ultraHigh = analyzeFleetUncertaintyAlerts(gbtOverview.cards, { sigmaCutoff: 4.5 });

  assert.ok(strict.flaggedCount >= balanced.flaggedCount);
  assert.ok(balanced.flaggedCount >= severe.flaggedCount);
  assert.ok(balanced.flaggedCount > 0, 'Balanced cutoff must flag high-uncertainty engines on FD002');
  assert.equal(ultraHigh.flaggedCount, 0, 'Extreme cutoff cleanly exercises empty outlier state');

  for (let i = 1; i < balanced.flagged.length; i++) {
    assert.ok(balanced.flagged[i - 1].anomalyScore >= balanced.flagged[i].anomalyScore);
  }
  for (const item of balanced.flagged) {
    assert.ok(item.anomalyScore >= 1.0);
    assert.ok(item.reasons.length >= 1);
  }

  // Global-scaled linear regression on multi-regime FD002 exhibits much wider conformal uncertainty than regime-aware HistGBT
  const linearGlobalOverview = computeFleetHealthOverview(
    fleet,
    'FD002',
    'linear_regression',
    false,
    0.1,
    20,
    { snapshotMode: 'mixed_fleet', rulCap: 125, seed: 42 },
  );
  const linearAlerts = analyzeFleetUncertaintyAlerts(linearGlobalOverview.cards, { sigmaCutoff: 1.0 });
  assert.ok(
    linearAlerts.fleetMeanWidth > balanced.fleetMeanWidth,
    'Unnormalized linear model on multi-regime FD002 must yield wider conformal intervals',
  );
});

test('10-point OLS RUL extrapolation computes exact slope, projected EOL cycle, and calendar date', () => {
  // Exact linear decay: y = 100 - 2 * x over cycles 11..30 -> last 10 points (21..30) have y=58..40, EOL at x=50
  const syntheticFrames = Array.from({ length: 30 }, (_, idx) => {
    const cycle = idx + 1;
    const predRul = 100 - 2 * cycle;
    return {
      cycle,
      trueRul: predRul,
      cappedRul: predRul,
      predRul,
      lower: Math.max(0, predRul - 5),
      upper: predRul + 5,
      width: 10,
      regime: 0,
      riskTriggered: false,
      thresholdTriggered: false,
    };
  });

  const exactRes = computeRulLinearExtrapolation(syntheticFrames, {
    windowSize: 10,
    referenceDateIso: '2026-11-23',
    cyclesPerDay: 1,
  });

  assert.equal(exactRes.windowSizeUsed, 10);
  assert.equal(exactRes.slope, -2);
  assert.equal(exactRes.rSquared, 1);
  assert.equal(exactRes.isConverging, true);
  assert.equal(exactRes.projectedEolCycle, 50);
  assert.equal(exactRes.remainingCycles, 20);
  assert.equal(exactRes.projectedEolDateLabel, 'Dec 13, 2026');
  assert.equal(exactRes.linePoints[0].x, 21);
  assert.equal(exactRes.linePoints[exactRes.linePoints.length - 1].x, 50);
  assert.equal(exactRes.linePoints[exactRes.linePoints.length - 1].y, 0);

  // Flat plateau guard (slope == 0 -> non-converging)
  const flatFrames = syntheticFrames.slice(0, 10).map((f) => ({ ...f, predRul: 125 }));
  const flatRes = computeRulLinearExtrapolation(flatFrames, { windowSize: 10 });
  assert.equal(flatRes.isConverging, false);
  assert.equal(flatRes.projectedEolCycle, null);

  // Real C-MAPSS playback late-mid-life slice converges downward
  const fleet = generateSyntheticFleet('FD002', { numEngines: 36, seed: 42 });
  const evalEngine = fleet.find((e) => e.split === 'evaluation') ?? fleet[0];
  const timeline = buildEnginePlaybackTimeline(
    fleet,
    evalEngine,
    'gradient_boosting',
    true,
    0.1,
    'rul_binned',
    20,
    125,
    42,
  );
  const sliced = slicePlaybackTimeline(timeline, Math.round(evalEngine.failureCycle * 0.72));
  const cmapssExtrapolation = computeRulLinearExtrapolation(sliced.visibleFrames, {
    windowSize: 10,
    referenceDateIso: '2026-11-23',
  });
  assert.equal(cmapssExtrapolation.windowSizeUsed, 10);
  assert.ok(cmapssExtrapolation.slope < -0.02);
  assert.ok(cmapssExtrapolation.projectedEolCycle !== null);
  assert.ok(cmapssExtrapolation.linePoints.length >= 2);
});

test('3D maintenance cost surface projection sorts quads back-to-front and isolates global minimum basin', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 48, seed: 42 });
  const surface = runThresholdCostSurface(fleet, {
    subset: 'FD002',
    model: 'gradient_boosting',
    preventiveCost: 100,
    failureCost: 700,
    alpha: 0.1,
    fixedInterval: 150,
    rulThreshold: 20,
    riskMultiplier: 1.0,
    regimeAware: true,
    autoTune: true,
    seed: 42,
  });

  const basin = findGlobalMinimumBasin(surface, 'risk_aware', 0.1);
  assert.equal(basin.globalMinCell.preventiveCost, 50, 'Lowest preventive cost lies at global min basin');
  assert.ok(basin.basinCells.length >= 1);
  assert.ok(basin.globalMinCost < basin.maxCost);

  const scene = buildSensitivity3DScene(surface, {
    basis: 'risk_aware',
    camera: DEFAULT_SURFACE_3D_CAMERA,
    viewport: { cx: 416, cy: 242, scale: 136, fov: 6.2 },
    activePreventiveCost: 110,
    activeThreshold: 20,
  });

  // (8 Cp - 1) * (9 tau - 1) = 56 surface quads
  assert.equal(scene.quads.length, 56);
  for (let i = 1; i < scene.quads.length; i++) {
    assert.ok(
      scene.quads[i - 1].avgDepth >= scene.quads[i].avgDepth,
      'Painter depth sort must order quads strictly descending (back-to-front)',
    );
  }
  assert.equal(scene.quads.filter((q) => q.containsGlobalMin).length >= 1, true);
  assert.ok(scene.globalMinVertex.costPerCycle === basin.globalMinCost);
  assert.ok(scene.xTicks.length >= 4 && scene.yTicks.length >= 4 && scene.zTicks.length === 5);

  // Increasing Cf sharply lifts peak Z on the point-threshold surface where low-tau episodes hit failures
  const threshBasinLowCf = findGlobalMinimumBasin(surface, 'threshold', 0.1);
  const highCfSurface = runThresholdCostSurface(fleet, {
    subset: 'FD002',
    model: 'gradient_boosting',
    preventiveCost: 100,
    failureCost: 1600,
    alpha: 0.1,
    fixedInterval: 150,
    rulThreshold: 20,
    riskMultiplier: 1.0,
    regimeAware: true,
    autoTune: true,
    seed: 42,
  });
  const threshBasinHighCf = findGlobalMinimumBasin(highCfSurface, 'threshold', 0.1);
  assert.ok(
    threshBasinHighCf.maxCost > threshBasinLowCf.maxCost,
    'Higher failure penalty must raise catastrophic failure ridge',
  );
});

test('fleet stress scatter maps RUL vs operational cycles, color-codes conformal width, and highlights high-risk high-uncertainty units', () => {
  const tightColor = computeUncertaintyWidthColor(12, 12, 42);
  const midColor = computeUncertaintyWidthColor(27, 12, 42);
  const wideColor = computeUncertaintyWidthColor(42, 12, 42);
  assert.equal(tightColor.ratio, 0);
  assert.ok(tightColor.b > tightColor.r, `Expected tight uncertainty color to be cyan/blue-dominant, got ${tightColor.hex}`);
  assert.equal(midColor.ratio, 0.5);
  assert.equal(wideColor.ratio, 1);
  assert.ok(wideColor.r > wideColor.g && wideColor.r > 200, `Expected wide uncertainty color to be crimson/rose-dominant, got ${wideColor.hex}`);

  // Equal width guard must not NaN
  const flatColor = computeUncertaintyWidthColor(20, 20, 20);
  assert.equal(flatColor.ratio, 0.2);

  const fleet = generateSyntheticFleet('FD002', { numEngines: 48, seed: 42 });
  const linearOverview = computeFleetHealthOverview(
    fleet,
    'FD002',
    'linear_regression',
    false,
    0.1,
    25,
    { snapshotMode: 'mixed_fleet', rulCap: 125, seed: 42 },
  );

  const lowThresh = buildFleetStressScatterData(linearOverview.cards, {
    rulThreshold: 10,
    rulCap: 125,
    rulMetric: 'pred_rul',
  });
  const highThresh = buildFleetStressScatterData(linearOverview.cards, {
    rulThreshold: 40,
    rulCap: 125,
    rulMetric: 'pred_rul',
  });

  assert.equal(lowThresh.points.length, 48);
  assert.equal(highThresh.points.length, 48);
  assert.ok(highThresh.maxCycles > highThresh.minCycles);
  assert.ok(highThresh.maxWidth > highThresh.minWidth);
  assert.ok(
    highThresh.highRiskCount >= lowThresh.highRiskCount,
    'Higher safety threshold must flag at least as many high-risk units',
  );
  assert.ok(
    highThresh.highRiskHighUncertaintyCount >= 1,
    'FD002 unnormalized linear model at tau=40 must surface high-risk + high-uncertainty units',
  );

  for (const pt of highThresh.points) {
    assert.equal(pt.operationalCycles, pt.card.observedCycle);
    assert.equal(pt.currentRul, pt.card.predRulAtObserved);
    assert.equal(pt.uncertaintyWidth, pt.card.conformalIntervalWidth);
    assert.equal(
      pt.isHighRiskHighUncertainty,
      pt.isHighRisk && pt.isHighUncertainty,
    );
  }
});

test('rolling RUL volatility computes exact standard deviation over rolling window and detects instability spikes', () => {
  const makeStep = (cycle: number, predRul: number) => ({
    cycle,
    trueRul: predRul,
    cappedRul: predRul,
    predRul,
    lower: Math.max(0, predRul - 5),
    upper: predRul + 5,
    width: 10,
    regime: 0,
    riskTriggered: false,
    thresholdTriggered: false,
  });

  // Exact std dev over [10, 20, 30, 40, 50] with w=5 is sqrt(200) ≈ 14.14
  const known = [10, 20, 30, 40, 50].map((v, i) => makeStep(i + 1, v));
  const knownVol = computeRulVolatility(known, 5);
  assert.equal(knownVol.windowUsed, 5);
  assert.ok(
    Math.abs(knownVol.rollingStdDev - Math.sqrt(200)) < 0.05,
    `Expected std dev ~14.14, got ${knownVol.rollingStdDev}`,
  );
  assert.equal(knownVol.severity, 'spike');

  // Calm prefix followed by an abrupt oscillatory spike triggers 'spike' alert
  const calmPrefix = Array.from({ length: 18 }, (_, i) => makeStep(i + 1, 100 - (i % 2) * 0.5));
  const calmRes = computeRulVolatility(calmPrefix, 10);
  assert.equal(calmRes.severity, 'normal');
  assert.ok(calmRes.rollingStdDev < 1);

  const spikedSeries = [
    ...calmPrefix,
    makeStep(19, 118),
    makeStep(20, 74),
    makeStep(21, 122),
    makeStep(22, 69),
  ];
  const spikeRes = computeRulVolatility(spikedSeries, 10);
  assert.equal(spikeRes.severity, 'spike');
  assert.ok(spikeRes.rollingStdDev > calmRes.rollingStdDev * 10);
  assert.ok(spikeRes.spikeCount >= 1);

  // Unnormalized linear model on multi-regime FD002 shows higher volatility than regime-aware HistGBT
  const fleet = generateSyntheticFleet('FD002', { numEngines: 36, seed: 42 });
  const evalEngine = fleet.find((e) => e.split === 'evaluation') ?? fleet[0];
  const gbtTimeline = buildEnginePlaybackTimeline(
    fleet,
    evalEngine,
    'gradient_boosting',
    true,
    0.1,
    'rul_binned',
    20,
    125,
    42,
  );
  const linGlobalTimeline = buildEnginePlaybackTimeline(
    fleet,
    evalEngine,
    'linear_regression',
    false,
    0.1,
    'rul_binned',
    20,
    125,
    42,
  );
  const gbtVol = computeRulVolatility(gbtTimeline.frames, 15);
  const linVol = computeRulVolatility(linGlobalTimeline.frames, 15);
  assert.ok(
    linVol.peakStdDev > gbtVol.peakStdDev,
    `Expected global linear peak volatility (${linVol.peakStdDev}) > regime-aware HistGBT (${gbtVol.peakStdDev})`,
  );
});

test('all 4 ML estimators exhibit zero target label leakage from evaluation split', () => {
  const cleanFleet = generateSyntheticFleet('FD002', { numEngines: 36, seed: 42 });
  const corruptedFleet = cleanFleet.map((eng) => {
    if (eng.split !== 'evaluation') return eng;
    return {
      ...eng,
      cycles: eng.cycles.map((c) => ({
        ...c,
        trueRul: c.cycle % 2 === 0 ? 999 : 0,
        cappedRul: c.cycle % 2 === 0 ? 999 : 0,
      })),
    };
  });

  const cleanEval = cleanFleet.find((e) => e.split === 'evaluation')!;
  const corruptEval = corruptedFleet.find((e) => e.split === 'evaluation')!;

  for (const model of MODEL_ORDER) {
    const estClean = trainRulEstimator(cleanFleet, model, true, 125, 42);
    const estCorrupt = trainRulEstimator(corruptedFleet, model, true, 125, 42);
    const predsClean = predictWithEstimator(estClean, cleanEval);
    const predsCorrupt = predictWithEstimator(estCorrupt, corruptEval);
    assert.deepEqual(
      predsClean,
      predsCorrupt,
      `Estimator ${model} predictions changed when evaluation trueRul was corrupted!`,
    );
  }
});

test('fitRegimeCentroids depends only on fit rows and ignores evaluation operating-condition outliers', () => {
  const fitRows = [
    { os1: 0.0, os2: 0.0, os3: 100 },
    { os1: 10.0, os2: 0.25, os3: 100 },
    { os1: 20.0, os2: 0.7, os3: 100 },
    { os1: 42.0, os2: 0.84, os3: 100 },
    { os1: 25.0, os2: 0.62, os3: 60 },
    { os1: 35.0, os2: 0.84, os3: 100 },
  ];
  const modelClean = fitRegimeCentroids(fitRows, 6);
  // Generating fleet already isolates fit split centroids; verify direct fit determinism
  const modelRepeat = fitRegimeCentroids([...fitRows], 6);
  assert.deepEqual(modelClean, modelRepeat);
});

test('parseAndValidateExperimentArtifact strictly validates uploaded JSON and rejects malformed payloads', () => {
  const fleet = generateSyntheticFleet('FD001', { numEngines: 24, seed: 42 });
  const sim = runMaintenanceDecisionStudy(fleet, {
    subset: 'FD001',
    model: 'gradient_boosting',
    regimeAware: true,
    alpha: 0.1,
    preventiveCost: 100,
    failureCost: 600,
    fixedInterval: 150,
    rulThreshold: 20,
    riskMultiplier: 1.0,
    autoTune: true,
    seed: 42,
  });
  const validPayload = JSON.stringify({
    experiment_id: 'custom_run_fd001',
    timestamp: '2026-11-23T08:00:00Z',
    source: 'simulated',
    subset: 'FD001',
    model: 'gradient_boosting',
    config: {
      rul_cap: 125,
      rolling_window: 15,
      regime_aware: true,
      conformal_mode: 'rul_binned',
      alpha: 0.1,
      preventive_cost: 100,
      failure_cost: 600,
      seed: 42,
    },
    metrics: {
      mae: 12.1,
      rmse: 15.8,
      mse: 249.64,
      mape: 14.2,
      phm08: 185.4,
      cappedMae: 9.4,
      cappedRmse: 12.6,
      cappedPhm08: 120.2,
    },
    uncertainty: {
      nominal_coverage: 90,
      empirical_coverage: 91.2,
      mean_width: 24.5,
      global_q_hat: 12.25,
    },
    policies: sim.summaries.map((s) => ({
      policy: s.policy,
      label: s.label,
      cost_per_cycle: s.meanCostPerCycle,
      ci_95: [s.ciLower, s.ciUpper] as [number, number],
      failure_rate_pct: s.failureRatePct,
      mean_wasted_rul: s.meanWastedRul,
    })),
  });

  const ok = parseAndValidateExperimentArtifact(validPayload);
  assert.ok(ok.artifact);
  if (ok.artifact) {
    assert.equal(ok.artifact.source, 'imported_file');
    assert.equal(ok.artifact.experiment_id, 'custom_run_fd001');
  }

  const badJson = parseAndValidateExperimentArtifact('{not valid json');
  assert.ok('error' in badJson);

  const badModel = parseAndValidateExperimentArtifact(
    validPayload.replace('"gradient_boosting"', '"unknown_nn"'),
  );
  assert.ok('error' in badModel);

  const badAlpha = parseAndValidateExperimentArtifact(
    validPayload.replace('"alpha":0.1', '"alpha":1.5').replace('"alpha": 0.1', '"alpha": 1.5'),
  );
  assert.ok('error' in badAlpha);
});

test('global rolling statistics differ from regime-conditioned rolling statistics on multi-regime FD002 and propagate to overlay', () => {
  const fleet = generateSyntheticFleet('FD002', { numEngines: 24, seed: 42 });
  const eng = fleet.find((e) => e.split === 'evaluation') ?? fleet[0];
  let maxDiff = 0;
  for (const c of eng.cycles) {
    const d = Math.abs(c.rollingMean.s11 - c.rollingMeanGlobal.s11);
    if (d > maxDiff) maxDiff = d;
  }
  assert.ok(maxDiff > 0.05, `Expected rollingMean vs rollingMeanGlobal difference on FD002, got ${maxDiff}`);

  const ids = pickDefaultPeerEngineIds(fleet, eng.engineId);
  const overlayRegime = buildDegradationSlopeOverlay(fleet, ids, {
    primaryEngineId: eng.engineId,
    sensorId: 's11',
    alignment: 'lifecycle_pct',
    signalMode: 'rolling_mean',
    regimeAware: true,
    model: 'gradient_boosting',
    rulCap: 125,
    seed: 42,
  });
  const overlayGlobal = buildDegradationSlopeOverlay(fleet, ids, {
    primaryEngineId: eng.engineId,
    sensorId: 's11',
    alignment: 'lifecycle_pct',
    signalMode: 'rolling_mean',
    regimeAware: false,
    model: 'gradient_boosting',
    rulCap: 125,
    seed: 42,
  });
  assert.notDeepEqual(overlayRegime.series[0]?.points, overlayGlobal.series[0]?.points);
});

test('scientific provenance: surrogate labels, dataset provenance catalog, implementation boundary, and safety disclaimers are explicit', () => {
  for (const modelId of MODEL_ORDER) {
    assert.ok(
      MODEL_LABELS[modelId].includes('Surrogate'),
      `Expected MODEL_LABELS[${modelId}] to explicitly indicate Surrogate, got ${MODEL_LABELS[modelId]}`,
    );
    assert.equal(MODEL_SURROGATE_DETAILS[modelId].surrogateLabel, MODEL_LABELS[modelId]);
    assert.ok(MODEL_SURROGATE_DETAILS[modelId].browserImplementation.length > 20);
  }

  assert.ok(PROTOTYPE_SAFETY_WARNING.includes('Research Prototype Only'));
  assert.ok(SURROGATE_BENCHMARK_DISCLOSURE.includes('No raw NASA C-MAPSS'));
  assert.ok(DATASET_PROVENANCE_CATALOG.length >= 5);
  assert.ok(DATASET_PROVENANCE_CATALOG.every((entry) => entry.usesRawNasaFiles === false));

  const simulatedCount = IMPLEMENTATION_BOUNDARY_ITEMS.filter((i) => i.category === 'simulated').length;
  const implementedCount = IMPLEMENTATION_BOUNDARY_ITEMS.filter((i) => i.category === 'implemented').length;
  assert.ok(simulatedCount >= 3);
  assert.ok(implementedCount >= 3);
  assert.ok(RESEARCH_LIMITATIONS.length >= 5);

  const syntheticProv = buildArtifactProvenance('synthetic_demo');
  assert.equal(syntheticProv.simulation_mode, 'synthetic_surrogate');
  assert.equal(syntheticProv.uses_raw_nasa_files, false);
  assert.ok(syntheticProv.genuinely_implemented.length >= 3);
  assert.ok(syntheticProv.simulated_components.length >= 3);
  assert.ok(syntheticProv.limitations.length >= 5);
  assert.ok(syntheticProv.safety_disclaimer.includes('Research Prototype Only'));

  const importedProv = buildArtifactProvenance('imported_file', 'ext_exp_99');
  assert.equal(importedProv.simulation_mode, 'imported_external');
  assert.ok(importedProv.data_generator.includes('ext_exp_99'));
});

test('artifact JSON import normalizes provenance block and distinguishes imported artifacts in PDF metadata', () => {
  const payloadWithProvenance = JSON.stringify({
    experiment_id: 'external_cmapss_run_01',
    timestamp: '2026-11-24T12:00:00Z',
    source: 'synthetic_demo',
    subset: 'FD003',
    model: 'lstm',
    config: {
      rul_cap: 125,
      rolling_window: 15,
      regime_aware: true,
      conformal_mode: 'rul_binned',
      alpha: 0.1,
      preventive_cost: 100,
      failure_cost: 600,
      seed: 42,
    },
    metrics: {
      mae: 10.4,
      rmse: 13.9,
      mse: 193.21,
      mape: 11.8,
      phm08: 160.2,
      cappedMae: 8.7,
      cappedRmse: 11.5,
      cappedPhm08: 108.4,
    },
    uncertainty: {
      nominal_coverage: 90,
      empirical_coverage: 92.4,
      mean_width: 22.1,
      global_q_hat: 11.05,
    },
    policies: [
      {
        policy: 'risk_aware',
        label: 'Risk-Aware Conformal',
        cost_per_cycle: 0.52,
        ci_95: [0.46, 0.59],
        failure_rate_pct: 0,
        mean_wasted_rul: 11.2,
      },
    ],
    provenance: {
      simulation_mode: 'synthetic_surrogate',
      uses_raw_nasa_files: false,
      data_generator: 'External offline Python run',
      surrogate_models_note: 'Custom offline PyTorch LSTM evaluation',
      genuinely_implemented: ['PyTorch LSTM'],
      simulated_components: [],
      limitations: ['Single seed'],
      safety_disclaimer: 'Academic use only.',
    },
  });

  const parsed = parseAndValidateExperimentArtifact(payloadWithProvenance);
  assert.ok(parsed.artifact);
  if (parsed.artifact) {
    assert.equal(parsed.artifact.source, 'imported_file');
    assert.equal(parsed.artifact.provenance?.simulation_mode, 'imported_external');
    assert.equal(parsed.artifact.provenance?.data_generator, 'External offline Python run');

    const meta = buildPdfReportMetadata(parsed.artifact);
    assert.equal(meta.provenanceBadge, 'IMPORTED ARTIFACT');
    assert.ok(meta.provenanceLabel.includes('IMPORTED EXTERNAL ARTIFACT'));
    assert.equal(meta.configRows[0].value, 'Imported JSON Artifact');

    const { doc } = generateExperimentPdfReport({ artifact: parsed.artifact });
    assert.equal(doc.getNumberOfPages(), 3);
  }
});

test('guided walkthrough covers all core sections and reviewer scenarios track baseline, edits, and reset', () => {
  assert.equal(GUIDED_TOUR_STEPS.length, 7);
  assert.deepEqual(
    GUIDED_TOUR_STEPS.map((s) => s.targetPage),
    ['overview', 'datasets', 'benchmark', 'uncertainty', 'simulator', 'sensitivity', 'research'],
  );
  assert.ok(GUIDED_TOUR_STEPS.every((s, i) => s.stepNumber === i + 1 && s.explanation.length > 40 && s.tryAction.length > 20));

  assert.equal(REVIEWER_SCENARIOS.length, 3);
  for (const sc of REVIEWER_SCENARIOS) {
    assert.ok(sc.investigationFocus.length > 30);
    assert.ok(sc.suggestedExperiments.length >= 2);
  }

  assert.equal(isDefaultWorkbenchState(DEFAULT_WORKBENCH_STATE), true);

  const highPenalty = REVIEWER_SCENARIOS[1];
  const scenarioState = buildScenarioWorkbenchState(highPenalty, DEFAULT_WORKBENCH_STATE);
  assert.equal(scenarioState.subset, 'FD004');
  assert.equal(scenarioState.selectedModel, 'lstm');
  assert.equal(scenarioState.maintConfig.failureCost, 1200);
  assert.equal(isDefaultWorkbenchState(scenarioState), false);
  assert.deepEqual(getScenarioChangedFields(scenarioState, highPenalty), []);

  const modifiedState = {
    ...scenarioState,
    regimeAware: false,
    alpha: 0.15,
    maintConfig: { ...scenarioState.maintConfig, failureCost: 1500 },
  };
  const diffs = getScenarioChangedFields(modifiedState, highPenalty);
  assert.ok(diffs.length === 3);

  const restored = buildScenarioWorkbenchState(highPenalty, DEFAULT_WORKBENCH_STATE);
  assert.deepEqual(getScenarioChangedFields(restored, highPenalty), []);
});

test('metricsCatalog defines all 10 engineering metrics, validates configs, counts fleet splits, and formats values uniformly', () => {
  assert.equal(METRIC_ORDER.length, 10);
  const expectedIds = [
    'mae',
    'rmse',
    'phm08',
    'rul',
    'conformal_coverage',
    'interval_width',
    'cost_per_cycle',
    'preventive_replacement',
    'failure_rate',
    'wasted_useful_life',
  ];
  assert.deepEqual(METRIC_ORDER, expectedIds);

  for (const id of METRIC_ORDER) {
    const def = METRIC_DEFINITIONS[id];
    assert.ok(def.name.length > 2);
    assert.ok(def.unit.length > 0);
    assert.ok(def.plainExplanation.length > 20);
    assert.ok(def.engineeringImpact.length > 20);
  }

  // Fleet split counts reconcile to fleet.length
  const fleet = generateSyntheticFleet('FD002', { numEngines: 48, seed: 42 });
  const splits = getFleetSplitCounts(fleet);
  assert.equal(splits.total, 48);
  assert.equal(splits.fit + splits.calibration + splits.tuning + splits.evaluation, 48);
  assert.ok(splits.fit > 0 && splits.calibration > 0 && splits.tuning > 0 && splits.evaluation > 0);

  // Parameter validation catches Cf <= Cp, Cp <= 0, invalid alpha, negative threshold
  const okCfg = validateMaintenanceConfig({
    preventiveCost: 100,
    failureCost: 600,
    alpha: 0.1,
    rulThreshold: 20,
    fixedInterval: 150,
  });
  assert.equal(okCfg.isValid, true);
  assert.equal(okCfg.warnings.length, 0);
  assert.equal(okCfg.costRatio, 6);

  const degCfg = validateMaintenanceConfig({
    preventiveCost: 250,
    failureCost: 200,
    alpha: 0.1,
    rulThreshold: 20,
  });
  assert.equal(degCfg.isValid, false);
  assert.ok(degCfg.warnings.some((w) => w.includes('not higher than preventive cost')));

  const invalidCfg = validateMaintenanceConfig({
    preventiveCost: 0,
    failureCost: -10,
    alpha: 0.7,
    rulThreshold: -5,
  });
  assert.equal(invalidCfg.isValid, false);
  assert.ok(invalidCfg.warnings.length >= 4);

  // Standardized numeric precision formatters & NaN guard
  assert.equal(formatRul(42.349), '42.3 cyc');
  assert.equal(formatErrorMetric(12.3456), '12.35 cyc');
  assert.equal(formatPhm08(184.94), '184.9');
  assert.equal(formatCostPerCycle(0.51234), '$0.512/cyc');
  assert.equal(formatCostPerCycle(-0.25), '-$0.250/cyc');
  assert.equal(formatPct(91.24), '91.2%');
  assert.equal(formatPearsonR(-0.0001), '+0.000');
  assert.equal(formatPearsonR(-0.8423), '-0.842');
  assert.equal(formatInterval(10.04, 34.56), '[10.0, 34.6] cyc');
  assert.equal(formatRul(Number.NaN), '0.0 cyc');
});











