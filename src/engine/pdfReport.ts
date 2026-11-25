import { jsPDF } from 'jspdf';
import { MODEL_LABELS } from './models';
import {
  buildArtifactProvenance,
  DATASET_PROVENANCE_CATALOG,
  PROTOTYPE_SAFETY_WARNING,
  RESEARCH_LIMITATIONS,
  SURROGATE_BENCHMARK_DISCLOSURE,
} from './provenance';
import type { ConformalBinSummary, ConformalPoint, ConformalStudyResult, ExperimentArtifact } from './types';

export interface PdfReportStructuredData {
  filename: string;
  title: string;
  subtitle: string;
  provenanceLabel: string;
  provenanceBadge: 'SYNTHETIC SIMULATION' | 'IMPORTED ARTIFACT';
  safetyWarning: string;
  surrogateDisclosure: string;
  researchQuestion: string;
  configRows: Array<{ label: string; value: string }>;
  metricRows: Array<{ label: string; value: string }>;
  policyRows: Array<{
    label: string;
    costPerCycle: string;
    ci95: string;
    failureRate: string;
    wastedRul: string;
    isHighlight: boolean;
  }>;
  genuinelyImplemented: string[];
  simulatedComponents: string[];
  limitations: string[];
  cliCommand: string;
}

export function buildPdfReportMetadata(artifact: ExperimentArtifact): PdfReportStructuredData {
  const isSynthetic = artifact.source === 'synthetic_demo';
  const provenance = artifact.provenance ?? buildArtifactProvenance(artifact.source, artifact.experiment_id);
  const ratio =
    artifact.config.preventive_cost > 0
      ? (artifact.config.failure_cost / artifact.config.preventive_cost).toFixed(1)
      : '—';

  const filename = `forgemind-ai-${artifact.subset.toLowerCase()}-${artifact.model}-report.pdf`;

  return {
    filename,
    title: 'ForgeMind AI — Experiment Summary Report',
    subtitle: `${artifact.experiment_id} · Generated ${new Date(artifact.timestamp).toISOString().slice(0, 19).replace('T', ' ')} UTC`,
    provenanceLabel: isSynthetic
      ? 'PROVENANCE: SYNTHETIC SIMULATION — Seeded C-MAPSS-shaped trajectories & TypeScript surrogates (not raw NASA data)'
      : `PROVENANCE: IMPORTED EXTERNAL ARTIFACT (${artifact.experiment_id}) — External summary JSON`,
    provenanceBadge: isSynthetic ? 'SYNTHETIC SIMULATION' : 'IMPORTED ARTIFACT',
    safetyWarning: provenance.safety_disclaimer || PROTOTYPE_SAFETY_WARNING,
    surrogateDisclosure: provenance.surrogate_models_note || SURROGATE_BENCHMARK_DISCLOSURE,
    researchQuestion:
      'Under changing operating conditions, can an uncertainty-aware predictive maintenance policy reduce simulated maintenance costs compared with a conventional fixed-threshold policy?',
    configRows: [
      { label: 'Data Source Provenance', value: isSynthetic ? 'Synthetic Cohort (48 units)' : 'Imported JSON Artifact' },
      { label: 'Degradation Regime Profile', value: artifact.subset },
      { label: 'Model-Family Surrogate', value: MODEL_LABELS[artifact.model] },
      {
        label: 'Regime-Aware Scaling',
        value: artifact.config.regime_aware ? 'Enabled (k-means OS1–OS3)' : 'Disabled (Global)',
      },
      { label: 'Piecewise RUL Cap', value: `${artifact.config.rul_cap} cycles` },
      { label: 'Causal Rolling Window', value: `${artifact.config.rolling_window} cycles` },
      {
        label: 'Conformal Mode',
        value:
          artifact.config.conformal_mode === 'rul_binned'
            ? 'RUL-Binned Adaptive'
            : 'Global Quantile',
      },
      {
        label: 'Target Coverage (1 - α)',
        value: `${((1 - artifact.config.alpha) * 100).toFixed(0)}% (α = ${artifact.config.alpha.toFixed(2)})`,
      },
      {
        label: 'Maintenance Cost Ratio',
        value: `Cp = $${artifact.config.preventive_cost} · Cf = $${artifact.config.failure_cost} (${ratio}x)`,
      },
      { label: 'PRNG Seed', value: String(artifact.config.seed) },
    ],
    metricRows: [
      { label: 'Eval MAE (Raw / Capped)', value: `${artifact.metrics.mae.toFixed(2)} / ${artifact.metrics.cappedMae.toFixed(2)} cyc` },
      { label: 'Eval RMSE (Raw / Capped)', value: `${artifact.metrics.rmse.toFixed(2)} / ${artifact.metrics.cappedRmse.toFixed(2)} cyc` },
      { label: 'Eval MAPE', value: `${artifact.metrics.mape.toFixed(2)}%` },
      {
        label: 'PHM08 Asymmetric Score',
        value: `${Math.round(artifact.metrics.phm08).toLocaleString()} (capped: ${Math.round(artifact.metrics.cappedPhm08).toLocaleString()})`,
      },
      {
        label: 'Conformal Coverage',
        value: `${artifact.uncertainty.empirical_coverage.toFixed(1)}% (target ${artifact.uncertainty.nominal_coverage.toFixed(0)}%)`,
      },
      {
        label: 'Mean Interval Width / q̂',
        value: `${artifact.uncertainty.mean_width.toFixed(1)} cyc (global ±${artifact.uncertainty.global_q_hat.toFixed(1)})`,
      },
    ],
    policyRows: artifact.policies.map((p) => ({
      label: p.label,
      costPerCycle: `$${p.cost_per_cycle.toFixed(3)}`,
      ci95: `[$${p.ci_95[0].toFixed(3)}, $${p.ci_95[1].toFixed(3)}]`,
      failureRate: `${p.failure_rate_pct.toFixed(1)}%`,
      wastedRul: `${p.mean_wasted_rul.toFixed(1)} cyc`,
      isHighlight: p.policy === 'risk_aware',
    })),
    genuinelyImplemented: provenance.genuinely_implemented,
    simulatedComponents: provenance.simulated_components,
    limitations:
      provenance.limitations.length > 0
        ? provenance.limitations
        : RESEARCH_LIMITATIONS.map((l) => `${l.title} — ${l.description}`),
    cliCommand: isSynthetic
      ? `?subset=${artifact.subset}&model=${artifact.model} (seed=${artifact.config.seed}, alpha=${artifact.config.alpha.toFixed(2)})`
      : `Artifact ID: ${artifact.experiment_id} · ${artifact.subset} · ${artifact.model}`,
  };
}

function renderTrajectoryChartToDataUrl(points: ConformalPoint[]): string | null {
  if (typeof document === 'undefined' || points.length < 3) return null;
  const w = 1040;
  const h = 340;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  // Title & Legend
  ctx.fillStyle = '#0F172A';
  ctx.font = '600 18px sans-serif';
  ctx.fillText('Evaluation Unit Conformal RUL Trajectory (Point Prediction & Uncertainty Band)', 24, 34);

  const legendItems = [
    { label: 'True RUL', color: '#475569', dashed: true },
    { label: 'Predicted RUL', color: '#0891B2', dashed: false },
    { label: 'Conformal Band', color: '#F59E0B', band: true },
  ];
  let lx = w - 410;
  legendItems.forEach((item) => {
    if (item.band) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
      ctx.fillRect(lx, 21, 18, 12);
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 1;
      ctx.strokeRect(lx, 21, 18, 12);
    } else {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2.5;
      if (item.dashed) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, 27);
      ctx.lineTo(lx + 18, 27);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#334155';
    ctx.font = '500 14px sans-serif';
    ctx.fillText(item.label, lx + 24, 32);
    lx += 132;
  });

  const padL = 66;
  const padR = 26;
  const padT = 56;
  const padB = 46;
  const pw = w - padL - padR;
  const ph = h - padT - padB;

  const maxRul = Math.max(130, ...points.map((p) => p.upper));
  const minCyc = points[0].cycle;
  const maxCyc = Math.max(minCyc + 1, points[points.length - 1].cycle);
  const toX = (c: number) => padL + ((c - minCyc) / (maxCyc - minCyc)) * pw;
  const toY = (v: number) => padT + ph - (Math.max(0, Math.min(maxRul, v)) / maxRul) * ph;

  // Grid & Y labels
  ctx.font = '13px monospace';
  for (let i = 0; i <= 4; i++) {
    const val = (maxRul * i) / 4;
    const y = toY(val);
    ctx.strokeStyle = i === 0 ? '#94A3B8' : '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + pw, y);
    ctx.stroke();
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(val).toString(), padL - 10, y + 4);
  }

  // X labels
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const cyc = Math.round(minCyc + ((maxCyc - minCyc) * i) / 4);
    ctx.fillStyle = '#475569';
    ctx.fillText(String(cyc), toX(cyc), padT + ph + 22);
  }
  ctx.fillStyle = '#64748B';
  ctx.font = '13px sans-serif';
  ctx.fillText('Operating Cycle', padL + pw / 2, h - 8);

  // Shaded conformal band
  ctx.fillStyle = 'rgba(245, 158, 11, 0.24)';
  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = toX(p.cycle);
    const y = toY(p.upper);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = points.length - 1; i >= 0; i--) {
    ctx.lineTo(toX(points[i].cycle), toY(points[i].lower));
  }
  ctx.closePath();
  ctx.fill();

  // True RUL dashed
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = toX(p.cycle);
    const y = toY(p.trueRul);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // Predicted RUL line
  ctx.strokeStyle = '#0891B2';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = toX(p.cycle);
    const y = toY(p.predRul);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

function renderPolicyCostChartToDataUrl(
  policies: ExperimentArtifact['policies'],
): string | null {
  if (typeof document === 'undefined' || policies.length === 0) return null;
  const w = 1040;
  const h = 300;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  ctx.fillStyle = '#0F172A';
  ctx.font = '600 18px sans-serif';
  ctx.fillText('Maintenance Policy Cost per Operating Cycle (with 95% Bootstrap CI)', 24, 34);

  const colors: Record<string, string> = {
    run_to_failure: '#E11D48',
    fixed_interval: '#64748B',
    threshold: '#D97706',
    risk_aware: '#0891B2',
    oracle: '#059669',
  };

  const maxCost = Math.max(
    0.1,
    ...policies.map((p) => Math.max(p.cost_per_cycle, p.ci_95[1])),
  ) * 1.12;

  const padL = 220;
  const padR = 175;
  const padT = 58;
  const rowH = (h - padT - 24) / policies.length;
  const barAreaW = w - padL - padR;

  policies.forEach((p, idx) => {
    const yCenter = padT + idx * rowH + rowH / 2;
    const barH = Math.min(24, rowH * 0.56);
    const barY = yCenter - barH / 2;

    // Label
    ctx.textAlign = 'right';
    ctx.fillStyle = p.policy === 'risk_aware' ? '#0E7490' : '#1E293B';
    ctx.font = p.policy === 'risk_aware' ? '700 15px sans-serif' : '500 15px sans-serif';
    ctx.fillText(p.label, padL - 16, yCenter + 5);

    // Track
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(padL, barY, barAreaW, barH);

    // Bar
    const barW = Math.max(4, (p.cost_per_cycle / maxCost) * barAreaW);
    ctx.fillStyle = colors[p.policy] ?? '#475569';
    ctx.fillRect(padL, barY, barW, barH);

    // Bootstrap CI whisker
    const xLow = padL + (p.ci_95[0] / maxCost) * barAreaW;
    const xHigh = padL + (p.ci_95[1] / maxCost) * barAreaW;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(xLow, yCenter);
    ctx.lineTo(xHigh, yCenter);
    ctx.moveTo(xLow, yCenter - 6);
    ctx.lineTo(xLow, yCenter + 6);
    ctx.moveTo(xHigh, yCenter - 6);
    ctx.lineTo(xHigh, yCenter + 6);
    ctx.stroke();

    // Numeric readout
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = '600 14px monospace';
    ctx.fillText(
      `$${p.cost_per_cycle.toFixed(3)}/cyc (${p.failure_rate_pct.toFixed(0)}% fail)`,
      padL + barAreaW + 14,
      yCenter + 5,
    );
  });

  return canvas.toDataURL('image/png');
}

function renderConformalBinsChartToDataUrl(
  bins: ConformalBinSummary[],
  nominalCoverage: number,
): string | null {
  if (typeof document === 'undefined' || bins.length === 0) return null;
  const w = 1040;
  const h = 250;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  ctx.fillStyle = '#0F172A';
  ctx.font = '600 18px sans-serif';
  ctx.fillText(
    `RUL-Binned Conformal Diagnostics (Target ${nominalCoverage.toFixed(0)}% Coverage vs. Mean Interval Width)`,
    24,
    34,
  );

  const padL = 62;
  const padR = 40;
  const padT = 62;
  const padB = 46;
  const pw = w - padL - padR;
  const ph = h - padT - padB;
  const colW = pw / bins.length;

  // Target coverage dashed line
  const yTarget = padT + ph - (Math.min(100, nominalCoverage) / 100) * ph;
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(padL, yTarget);
  ctx.lineTo(padL + pw, yTarget);
  ctx.stroke();
  ctx.setLineDash([]);

  const maxWidth = Math.max(30, ...bins.map((b) => b.meanWidth));

  bins.forEach((b, idx) => {
    const cx = padL + idx * colW + colW / 2;
    const covH = (Math.min(100, b.empiricalCoverage) / 100) * ph;
    const widthH = (b.meanWidth / maxWidth) * ph * 0.85;

    // Coverage bar
    ctx.fillStyle = '#0891B2';
    ctx.fillRect(cx - 42, padT + ph - covH, 36, covH);

    // Width bar
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(cx + 6, padT + ph - widthH, 36, widthH);

    // Values
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0F172A';
    ctx.font = '600 13px monospace';
    ctx.fillText(`${b.empiricalCoverage.toFixed(1)}%`, cx - 24, padT + ph - covH - 7);
    ctx.fillText(`${b.meanWidth.toFixed(1)}c`, cx + 24, padT + ph - widthH - 7);

    // Bin label
    ctx.fillStyle = '#334155';
    ctx.font = '13px monospace';
    ctx.fillText(`${b.binLabel} (n=${b.sampleCount})`, cx, padT + ph + 24);
  });

  // Legend
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0891B2';
  ctx.fillRect(w - 360, 20, 14, 14);
  ctx.fillStyle = '#334155';
  ctx.font = '500 13px sans-serif';
  ctx.fillText('Coverage (%)', w - 340, 32);

  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(w - 210, 20, 14, 14);
  ctx.fillStyle = '#334155';
  ctx.fillText('Mean Width (cyc)', w - 190, 32);

  return canvas.toDataURL('image/png');
}

export function generateExperimentPdfReport(options: {
  artifact: ExperimentArtifact;
  conformalStudy?: ConformalStudyResult;
  sampleTrajectory?: ConformalPoint[];
}): { doc: jsPDF; filename: string } {
  const { artifact, conformalStudy, sampleTrajectory } = options;
  const meta = buildPdfReportMetadata(artifact);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 595.28
  const pageH = doc.internal.pageSize.getHeight(); // 841.89
  const margin = 40;
  const contentW = pageW - margin * 2;

  const drawHeader = (pageTitle: string) => {
    doc.setFillColor(14, 19, 29);
    doc.rect(0, 0, pageW, 66, 'F');
    doc.setTextColor(6, 182, 212);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(
      artifact.source === 'synthetic_demo'
        ? 'FORGEMIND AI  ·  SYNTHETIC C-MAPSS-SHAPED SIMULATION'
        : 'FORGEMIND AI  ·  EXTERNAL BENCHMARK ARTIFACT REPORT',
      margin,
      24,
    );

    doc.setTextColor(248, 250, 252);
    doc.setFontSize(15);
    doc.text(pageTitle, margin, 44);

    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(meta.subtitle, margin, 57);
  };

  const drawFooter = (pageNum: number, totalPages: number) => {
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, pageH - 36, pageW - margin, pageH - 36);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(
      'Author: MD Ibtashamur Rahman  ·  github.com/Ibtasham/ForgeMind-Ai  ·  MIT License',
      margin,
      pageH - 22,
    );
    doc.text(`Page ${pageNum} of ${totalPages}`, pageW - margin, pageH - 22, { align: 'right' });
  };

  // --- PAGE 1 ---
  drawHeader(meta.title);

  let y = 84;

  // Provenance callout
  const isSynthetic = artifact.source === 'synthetic_demo';
  doc.setFillColor(isSynthetic ? 255 : 236, isSynthetic ? 251 : 253, isSynthetic ? 235 : 245);
  doc.setDrawColor(isSynthetic ? 245 : 16, isSynthetic ? 158 : 185, isSynthetic ? 11 : 129);
  doc.roundedRect(margin, y, contentW, 28, 4, 4, 'FD');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text(doc.splitTextToSize(meta.provenanceLabel, contentW - 18), margin + 9, y + 17);
  y += 38;

  // Research Question
  doc.setTextColor(14, 116, 144);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CORE RESEARCH QUESTION', margin, y);
  y += 13;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const rqLines = doc.splitTextToSize(meta.researchQuestion, contentW);
  doc.text(rqLines, margin, y);
  y += rqLines.length * 13 + 10;

  // 2-column Configuration & Metrics summary
  const colGap = 16;
  const colW = (contentW - colGap) / 2;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Experiment Configuration', margin, y);
  doc.text('Prognostics & Conformal Metrics', margin + colW + colGap, y);
  y += 8;

  const rowH = 19;
  const leftStartY = y;
  meta.configRows.forEach((row, idx) => {
    const ry = leftStartY + idx * rowH;
    doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, ry, colW, rowH, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(row.label, margin + 6, ry + 13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(row.value, margin + colW - 6, ry + 13, { align: 'right' });
  });

  meta.metricRows.forEach((row, idx) => {
    const ry = leftStartY + idx * rowH;
    const rx = margin + colW + colGap;
    doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
    doc.setDrawColor(226, 232, 240);
    doc.rect(rx, ry, colW, rowH, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(row.label, rx + 6, ry + 13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(row.value, rx + colW - 6, ry + 13, { align: 'right' });
  });

  // CLI snippet box under right column
  const cliY = leftStartY + meta.metricRows.length * rowH + 8;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin + colW + colGap, cliY, colW, 48, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(14, 116, 144);
  doc.text(
    artifact.source === 'synthetic_demo' ? 'SIMULATION SEED & URL SPEC' : 'IMPORTED ARTIFACT IDENTIFIER',
    margin + colW + colGap + 8,
    cliY + 14,
  );
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  const cliLines = doc.splitTextToSize(meta.cliCommand, colW - 16);
  doc.text(cliLines, margin + colW + colGap + 8, cliY + 28);

  y = leftStartY + Math.max(meta.configRows.length * rowH, meta.metricRows.length * rowH + 56) + 18;

  // Chart 1: Conformal Trajectory
  const trajPoints = sampleTrajectory ?? conformalStudy?.sampleTrajectory ?? [];
  const trajImg = renderTrajectoryChartToDataUrl(trajPoints);
  if (trajImg) {
    const chartH = 176;
    doc.addImage(trajImg, 'PNG', margin, y, contentW, chartH);
    y += chartH + 14;
  }

  // --- PAGE 2 ---
  doc.addPage();
  drawHeader('ForgeMind AI — Maintenance Decision Study & Diagnostics');

  let y2 = 86;

  // Chart 2: Policy Cost Comparison
  const policyImg = renderPolicyCostChartToDataUrl(artifact.policies);
  if (policyImg) {
    const chart2H = 152;
    doc.addImage(policyImg, 'PNG', margin, y2, contentW, chart2H);
    y2 += chart2H + 18;
  }

  // Policy Ledger Table
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Maintenance Policy Evaluation Ledger', margin, y2);
  y2 += 8;

  const colWidths = [165, 85, 118, 72, contentW - 165 - 85 - 118 - 72];
  const headers = ['Policy', 'Cost / Cycle', '95% Bootstrap CI', 'Failures', 'Mean Wasted RUL'];

  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y2, contentW, 20, 'F');
  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  let cx = margin;
  headers.forEach((hText, i) => {
    const alignRight = i > 0;
    doc.text(hText, alignRight ? cx + colWidths[i] - 6 : cx + 6, y2 + 13, {
      align: alignRight ? 'right' : 'left',
    });
    cx += colWidths[i];
  });
  y2 += 20;

  meta.policyRows.forEach((row, idx) => {
    const rh = 20;
    if (row.isHighlight) {
      doc.setFillColor(236, 254, 255);
    } else {
      doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y2, contentW, rh, 'FD');

    const cells = [row.label, row.costPerCycle, row.ci95, row.failureRate, row.wastedRul];
    let cellX = margin;
    cells.forEach((cellVal, i) => {
      doc.setFont('helvetica', row.isHighlight || i === 1 ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(row.isHighlight ? 14 : 30, row.isHighlight ? 116 : 41, row.isHighlight ? 144 : 59);
      doc.text(cellVal, i > 0 ? cellX + colWidths[i] - 6 : cellX + 6, y2 + 13, {
        align: i > 0 ? 'right' : 'left',
      });
      cellX += colWidths[i];
    });
    y2 += rh;
  });

  y2 += 18;

  // Chart 3: Conformal Bins Breakdown
  if (conformalStudy && conformalStudy.bins.length > 0) {
    const binsImg = renderConformalBinsChartToDataUrl(
      conformalStudy.bins,
      conformalStudy.nominalCoverage,
    );
    if (binsImg) {
      const chart3H = 132;
      doc.addImage(binsImg, 'PNG', margin, y2, contentW, chart3H);
      y2 += chart3H + 16;
    }
  }

  // Methodological Guardrails Note
  if (y2 < pageH - 110) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y2, contentW, 56, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('Methodological Guardrails & Split Discipline', margin + 10, y2 + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(71, 85, 105);
    const guardText =
      'Fit, calibration, tuning, and evaluation engines are strictly partitioned by engine unit ID (45/20/15/20%). Scaling bounds, k-means regime centroids, causal rolling windows, split conformal quantiles, and policy triggers are learned without access to evaluation trajectories.';
    doc.text(doc.splitTextToSize(guardText, contentW - 20), margin + 10, y2 + 30);
  }

  // --- PAGE 3: DATA PROVENANCE, AUDIT & RESEARCH LIMITATIONS ---
  doc.addPage();
  drawHeader('ForgeMind AI — Data Provenance, Methodological Audit & Limitations');

  let y3 = 82;

  // 1. Prototype & Safety Disclaimer Box
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(239, 68, 68);
  const safetyLines = doc.splitTextToSize(meta.safetyWarning, contentW - 20);
  const safetyBoxH = 26 + safetyLines.length * 10.5;
  doc.roundedRect(margin, y3, contentW, safetyBoxH, 4, 4, 'FD');
  doc.setTextColor(153, 27, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('RESEARCH PROTOTYPE & NON-OPERATIONAL SAFETY WARNING', margin + 10, y3 + 15);
  doc.setTextColor(127, 29, 29);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(safetyLines, margin + 10, y3 + 27);
  y3 += safetyBoxH + 14;

  // 2. Surrogate Benchmark Disclosure
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  const surrLines = doc.splitTextToSize(meta.surrogateDisclosure, contentW - 20);
  const surrBoxH = 24 + surrLines.length * 10;
  doc.roundedRect(margin, y3, contentW, surrBoxH, 4, 4, 'FD');
  doc.setTextColor(14, 116, 144);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('MODEL-FAMILY SURROGATE DISCLOSURE', margin + 10, y3 + 14);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(surrLines, margin + 10, y3 + 26);
  y3 += surrBoxH + 16;

  // 3. Data Provenance Table
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Data Provenance & Source Matrix', margin, y3);
  y3 += 8;

  const provColW = [150, 105, contentW - 255];
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y3, contentW, 18, 'F');
  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Dataset / Artifact Component', margin + 6, y3 + 12);
  doc.text('Origin', margin + provColW[0] + 6, y3 + 12);
  doc.text('Scope & Key Limitations', margin + provColW[0] + provColW[1] + 6, y3 + 12);
  y3 += 18;

  DATASET_PROVENANCE_CATALOG.forEach((entry, idx) => {
    const nameLines = doc.splitTextToSize(entry.datasetName, provColW[0] - 10);
    const limLines = doc.splitTextToSize(`${entry.sampleScope}. ${entry.limitations}`, provColW[2] - 10);
    const rh = Math.max(24, Math.max(nameLines.length, limLines.length) * 9.5 + 8);
    doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y3, contentW, rh, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(nameLines, margin + 5, y3 + 11);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(14, 116, 144);
    doc.text(doc.splitTextToSize(entry.originLabel, provColW[1] - 10), margin + provColW[0] + 5, y3 + 11);

    doc.setTextColor(71, 85, 105);
    doc.text(limLines, margin + provColW[0] + provColW[1] + 5, y3 + 11);
    y3 += rh;
  });

  y3 += 14;

  // 4. Simulated vs. Genuinely Implemented Two-Column Breakdown
  const halfW = (contentW - 14) / 2;
  doc.setTextColor(180, 83, 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Simulated / Surrogate Components', margin, y3);
  doc.setTextColor(5, 150, 105);
  doc.text('Genuinely Computed Mathematics', margin + halfW + 14, y3);
  y3 += 8;

  const simListText = meta.simulatedComponents.map((s) => `• ${s}`).join('\n');
  const impListText = meta.genuinelyImplemented.map((s) => `• ${s}`).join('\n');
  const simWrapped = doc.splitTextToSize(simListText, halfW - 12);
  const impWrapped = doc.splitTextToSize(impListText, halfW - 12);
  const auditH = Math.max(simWrapped.length, impWrapped.length) * 9 + 14;

  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(253, 230, 138);
  doc.roundedRect(margin, y3, halfW, auditH, 3, 3, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(120, 53, 15);
  doc.text(simWrapped, margin + 6, y3 + 11);

  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(margin + halfW + 14, y3, halfW, auditH, 3, 3, 'FD');
  doc.setTextColor(6, 78, 59);
  doc.text(impWrapped, margin + halfW + 20, y3 + 11);
  y3 += auditH + 14;

  // 5. Research Limitations
  if (y3 < pageH - 80) {
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Research Limitations', margin, y3);
    y3 += 11;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    const limSummary = RESEARCH_LIMITATIONS.map((l) => `${l.title}: ${l.description}`).join('\n');
    const limWrapped = doc.splitTextToSize(limSummary, contentW);
    doc.text(limWrapped, margin, y3);
  }

  drawFooter(3, 3);
  doc.setPage(2);
  drawFooter(2, 3);
  doc.setPage(1);
  drawFooter(1, 3);

  return { doc, filename: meta.filename };
}

export function downloadExperimentPdfReport(options: {
  artifact: ExperimentArtifact;
  conformalStudy?: ConformalStudyResult;
  sampleTrajectory?: ConformalPoint[];
}): string {
  const { doc, filename } = generateExperimentPdfReport(options);
  doc.save(filename);
  return filename;
}
