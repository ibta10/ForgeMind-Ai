import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileCheck2,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  Link2,
  Share2,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import ogBannerImg from '../assets/images/forgemind_linkedin_og_1795283375860.jpg';
import { downloadExperimentPdfReport } from '../engine/pdfReport';
import {
  buildLinkedInProjectSummary,
  buildShareableUrl,
  parseAndValidateExperimentArtifact,
  renderLinkedInCardToCanvas,
} from '../engine/portfolio';
import {
  DATASET_PROVENANCE_CATALOG,
  IMPLEMENTATION_BOUNDARY_ITEMS,
  PROTOTYPE_SAFETY_WARNING,
  RESEARCH_LIMITATIONS,
  SURROGATE_BENCHMARK_DISCLOSURE,
} from '../engine/provenance';
import type {
  ConformalPoint,
  ConformalStudyResult,
  ExperimentArtifact,
  PageId,
} from '../engine/types';

interface ResearchReproPageProps {
  artifact: ExperimentArtifact;
  activePage: PageId;
  conformalStudy?: ConformalStudyResult;
  sampleTrajectory?: ConformalPoint[];
  onExportArtifact: () => void;
  onImportArtifact: (artifact: ExperimentArtifact) => void;
  onClearImported?: () => void;
}

const REFERENCES = [
  {
    id: 1,
    citation:
      'Saxena, A., Goebel, K., Simon, D., Eklund, N. (2008). Damage propagation modeling for aircraft engine run-to-failure simulation. Int. Conf. on Prognostics and Health Management (PHM 2008).',
  },
  {
    id: 2,
    citation:
      'Li, X., Ding, Q., Sun, J.-Q. (2018). Remaining useful life estimation in prognostics using deep convolution neural networks. Reliability Engineering & System Safety, 172, 1–11.',
  },
  {
    id: 3,
    citation:
      'Zheng, S., Ristovski, K., Farahat, A., Gupta, C. (2017). Long short-term memory network for remaining useful life estimation. IEEE ICPHM 2017.',
  },
  {
    id: 4,
    citation:
      'Jardine, A. K. S., Lin, D., Banjevic, D. (2006). A review on machinery diagnostics and prognostics implementing condition-based maintenance. Mechanical Systems and Signal Processing, 20(7), 1483–1510.',
  },
  {
    id: 5,
    citation:
      "Lei, J., G'Sell, M., Rinaldo, A., Tibshirani, R. J., Wasserman, L. (2018). Distribution-free predictive inference for regression. Journal of the American Statistical Association, 113(523), 1094–1111.",
  },
  {
    id: 6,
    citation:
      'Angelopoulos, A. N., Bates, S. (2021). A gentle introduction to conformal prediction and distribution-free uncertainty quantification. arXiv:2107.07511.',
  },
];

export const ResearchReproPage: React.FC<ResearchReproPageProps> = ({
  artifact,
  activePage,
  conformalStudy,
  sampleTrajectory,
  onExportArtifact,
  onImportArtifact,
  onClearImported,
}) => {
  const isImported = artifact.source === 'imported_file';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [ogImgError, setOgImgError] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  const liveShareUrl =
    typeof window !== 'undefined' && window.location.origin
      ? buildShareableUrl(window.location.origin, window.location.pathname, {
          page: activePage === 'research' ? 'simulator' : activePage,
          subset: artifact.subset,
          model: artifact.model,
        })
      : 'https://github.com/Ibtasham/ForgeMind-Ai';

  const linkedInCopy = useMemo(
    () => buildLinkedInProjectSummary(artifact, liveShareUrl),
    [artifact, liveShareUrl],
  );

  useEffect(() => {
    if (previewCanvasRef.current) {
      renderLinkedInCardToCanvas(previewCanvasRef.current, artifact, sampleTrajectory);
    }
  }, [artifact, sampleTrajectory]);

  const seedSignature = `experiment=${artifact.experiment_id} · seed=${artifact.config.seed} · split=45/20/15/20`;

  const yamlConfig = `subset: ${artifact.subset}
model: ${artifact.model}
preprocessing:
  regime_aware: ${artifact.config.regime_aware}
  rul_cap: ${artifact.config.rul_cap}
  rolling_window: ${artifact.config.rolling_window}
uncertainty:
  mode: ${artifact.config.conformal_mode}
  alpha: ${artifact.config.alpha}
maintenance:
  preventive_cost: ${artifact.config.preventive_cost}
  failure_cost: ${artifact.config.failure_cost}
seed: ${artifact.config.seed}`;

  const handleCopyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      setCopiedKey(null);
    }
  };

  const handleDownloadLinkedInCard = () => {
    const canvas = document.createElement('canvas');
    renderLinkedInCardToCanvas(canvas, artifact, sampleTrajectory);
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `forgemind-ai-${artifact.subset.toLowerCase()}-linkedin-card.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadOgBanner = () => {
    const a = document.createElement('a');
    a.href = ogBannerImg;
    a.download = 'forgemind-ai-linkedin-og-banner.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadPdfReport = () => {
    setPdfExporting(true);
    try {
      downloadExperimentPdfReport({
        artifact,
        conformalStudy,
        sampleTrajectory,
      });
    } finally {
      setTimeout(() => setPdfExporting(false), 300);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { artifact: validated, error } = parseAndValidateExperimentArtifact(text);
      if (!validated) {
        setImportError(error ?? 'Invalid ForgeMind experiment artifact JSON.');
        return;
      }
      onImportArtifact(validated);
    } catch {
      setImportError('Could not read the selected JSON file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Research Prototype & Non-Operational Safety Warning */}
      <section
        data-testid="safety-warning-banner"
        role="note"
        className="rounded-lg border border-rose-500/45 bg-rose-950/20 p-4 flex items-start gap-3 text-xs"
      >
        <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <div className="font-display text-sm font-semibold text-rose-200">
            Research Prototype — Not an Industrial Safety or Maintenance Decision System
          </div>
          <p className="text-rose-100/90 leading-relaxed">{PROTOTYPE_SAFETY_WARNING}</p>
        </div>
      </section>

      {/* Data Provenance & Source Transparency */}
      <section
        id="data-provenance"
        data-testid="data-provenance-section"
        className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Scientific Transparency &amp; Data Provenance</span>
            </div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Source, Scope &amp; Limitations of Every Displayed Dataset
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-4xl">
              {SURROGATE_BENCHMARK_DISCLOSURE}
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-mono font-bold uppercase whitespace-nowrap ${
              isImported
                ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                : 'border-amber-500/45 bg-amber-500/15 text-amber-300'
            }`}
          >
            {isImported ? (
              <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {isImported ? 'Active Mode: IMPORTED ARTIFACT' : 'Active Mode: SYNTHETIC SIMULATION'}
          </span>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">
              Data provenance, raw NASA file usage status, sample scope, and limitations for all datasets in ForgeMind AI
            </caption>
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th scope="col" className="py-2.5 px-3.5 font-medium">Displayed Dataset / Layer</th>
                <th scope="col" className="py-2.5 px-3.5 font-medium">Origin</th>
                <th scope="col" className="py-2.5 px-3.5 font-medium">Raw NASA Files?</th>
                <th scope="col" className="py-2.5 px-3.5 font-medium">Scope &amp; Provenance Summary</th>
                <th scope="col" className="py-2.5 px-3.5 font-medium">Known Limitations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {DATASET_PROVENANCE_CATALOG.map((row) => (
                <tr key={row.id} className="align-top hover:bg-slate-800/30">
                  <td className="py-3 px-3.5 font-semibold text-slate-100 whitespace-nowrap">
                    {row.datasetName}
                  </td>
                  <td className="py-3 px-3.5 whitespace-nowrap">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 font-mono text-[10px] ${
                        row.originType === 'literature_reference'
                          ? 'border-slate-700 bg-slate-900 text-slate-300'
                          : row.originType === 'external_import'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {row.originLabel}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 font-mono text-rose-300 whitespace-nowrap">
                    {row.usesRawNasaFiles ? 'Yes' : 'No'}
                  </td>
                  <td className="py-3 px-3.5 text-slate-300 leading-relaxed min-w-[230px]">
                    <div className="font-mono text-[11px] text-cyan-300 mb-0.5">{row.sampleScope}</div>
                    {row.summary}
                  </td>
                  <td className="py-3 px-3.5 text-slate-400 leading-relaxed min-w-[230px]">
                    {row.limitations}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Simulated / Surrogate vs. Genuinely Implemented Mathematical Audit */}
      <section
        data-testid="implemented-vs-simulated"
        className="grid grid-cols-1 xl:grid-cols-2 gap-4"
      >
        <div className="rounded-lg border border-amber-500/35 bg-[#0E131D] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-amber-200 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              What Is Simulated / Surrogate
            </h3>
            <span className="font-mono text-[10px] uppercase rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
              Demo Approximation
            </span>
          </div>
          <div className="space-y-2.5 text-xs">
            {IMPLEMENTATION_BOUNDARY_ITEMS.filter((i) => i.category === 'simulated').map((item) => (
              <div key={item.title} className="rounded border border-slate-800 bg-[#080B12] p-3">
                <div className="font-semibold text-slate-100">{item.title}</div>
                <p className="mt-1 text-slate-400 leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-emerald-500/35 bg-[#0E131D] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
              What Is Genuinely Computed In-Browser
            </h3>
            <span className="font-mono text-[10px] uppercase rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
              Verified Algorithms
            </span>
          </div>
          <div className="space-y-2.5 text-xs">
            {IMPLEMENTATION_BOUNDARY_ITEMS.filter((i) => i.category === 'implemented').map((item) => (
              <div key={item.title} className="rounded border border-slate-800 bg-[#080B12] p-3">
                <div className="font-semibold text-slate-100">{item.title}</div>
                <p className="mt-1 text-slate-400 leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Research Limitations Section */}
      <section
        data-testid="research-limitations-section"
        className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              Research Limitations &amp; Threats to External Validity
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Scope constraints researchers and reviewers should weigh when interpreting simulation outputs
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {RESEARCH_LIMITATIONS.map((lim) => (
            <div key={lim.title} className="rounded-md border border-slate-800 bg-[#080B12] p-3.5 space-y-1.5">
              <div className="text-xs font-semibold text-slate-100">{lim.title}</div>
              <p className="text-xs text-slate-400 leading-relaxed">{lim.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* LinkedIn Project Showcase Kit */}
      <section className="min-w-0 rounded-lg border border-cyan-500/30 bg-[#0E131D] p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
              <Share2 className="w-3.5 h-3.5" />
              <span>LinkedIn Portfolio & Featured Project Kit</span>
            </div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Ready-to-Publish LinkedIn Project Entry, Featured OG Artwork & Live Metrics Cover
            </h2>
            <p className="text-xs text-slate-400">
              Tailored to your active {artifact.subset} run and grounded in repository methodology (no fabricated benchmark claims).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleCopyText('share_url', liveShareUrl)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {copiedKey === 'share_url' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              {copiedKey === 'share_url' ? 'Link Copied' : 'Copy Shareable Link'}
            </button>
            <button
              type="button"
              onClick={handleDownloadLinkedInCard}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Download 1200×627 Cover PNG
            </button>
          </div>
        </div>

        {/* Visual Banners Preview Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="min-w-0 rounded-md border border-slate-800 bg-[#080B12] p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100 truncate">
                  Featured OG Banner (Turbofan Health Graph)
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  OpenGraph card & LinkedIn Featured thumbnail
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownloadOgBanner}
                className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:text-slate-100 hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download OG Banner
              </button>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded border border-slate-800/90 bg-[#080B12]">
              {!ogImgError ? (
                <img
                  src={ogBannerImg}
                  alt="Turbofan engine health graph OpenGraph preview"
                  referrerPolicy="no-referrer"
                  onError={() => setOgImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-mono text-slate-400">
                  Turbofan Health Graph OG Banner
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-md border border-slate-800 bg-[#080B12] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-100">
                  Dynamic Metrics & Conformal Trajectory Card (1200×627)
                </div>
                <div className="text-[11px] text-slate-400">
                  Live-rendered from your active {artifact.subset} · {artifact.model} simulation
                </div>
              </div>
              <span className="text-[11px] font-mono text-cyan-300 whitespace-nowrap">
                PNG Ready
              </span>
            </div>
            <div className="relative aspect-[1200/627] w-full overflow-hidden rounded border border-slate-800/90 bg-[#080B12]">
              <canvas
                ref={previewCanvasRef}
                aria-label="Live preview of 1200 by 627 LinkedIn metrics summary card"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Project Entry Copy */}
          <div className="min-w-0 rounded-md border border-slate-800 bg-[#080B12] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-100">
                LinkedIn Projects Section (Title + Description)
              </span>
              <button
                type="button"
                onClick={() =>
                  handleCopyText(
                    'project_entry',
                    `${linkedInCopy.projectTitle}\n\n${linkedInCopy.projectDescription}`,
                  )
                }
                className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:text-slate-100 whitespace-nowrap"
              >
                {copiedKey === 'project_entry' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedKey === 'project_entry' ? 'Copied' : 'Copy Entry'}
              </button>
            </div>
            <div className="text-xs font-semibold text-cyan-300">{linkedInCopy.projectTitle}</div>
            <pre className="max-h-48 max-w-full overflow-y-auto whitespace-pre-wrap text-xs text-slate-300 font-sans leading-relaxed">
              {linkedInCopy.projectDescription}
            </pre>
            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <span>Skills: {linkedInCopy.skills.join(' · ')}</span>
              <button
                type="button"
                onClick={() => handleCopyText('skills', linkedInCopy.skills.join(', '))}
                className="text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap"
              >
                {copiedKey === 'skills' ? 'Copied skills' : 'Copy skills'}
              </button>
            </div>
          </div>

          {/* LinkedIn Post Draft */}
          <div className="min-w-0 rounded-md border border-slate-800 bg-[#080B12] p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-100">
                  LinkedIn Announcement Post Draft
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyText('post_draft', linkedInCopy.postDraft)}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:text-slate-100 whitespace-nowrap"
                >
                  {copiedKey === 'post_draft' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === 'post_draft' ? 'Copied' : 'Copy Post'}
                </button>
              </div>
              <pre className="max-h-56 max-w-full overflow-y-auto whitespace-pre-wrap text-xs text-slate-300 font-sans leading-relaxed">
                {linkedInCopy.postDraft}
              </pre>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-slate-400">
              <span>Academic BibTeX (CITATION.cff)</span>
              <button
                type="button"
                onClick={() => handleCopyText('bibtex', linkedInCopy.bibtex)}
                className="text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap"
              >
                {copiedKey === 'bibtex' ? 'Copied BibTeX' : 'Copy BibTeX'}
              </button>
            </div>
          </div>
        </div>
        <div className="sr-only" aria-live="polite">
          {copiedKey ? `Copied ${copiedKey} to clipboard` : ''}
        </div>
      </section>

      {/* Artifact Import / Export */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Reproducibility &amp; Metrics Artifact Exchange
            </h2>
            <span
              data-testid="artifact-exchange-source-pill"
              className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                isImported
                  ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                  : 'border-amber-500/45 bg-amber-500/15 text-amber-300'
              }`}
            >
              {isImported ? 'Imported External Artifact' : 'Local Synthetic Simulation'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {isImported
              ? `Currently viewing uploaded artifact ${artifact.experiment_id}. Interactive telemetry/fleet views remain local synthetic data until reverted.`
              : 'Export the active synthetic simulation artifact (includes full provenance metadata) or import an external ForgeMind experiment JSON file.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isImported && onClearImported && (
            <button
              type="button"
              onClick={onClearImported}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/45 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              Revert to Synthetic Simulation
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileUpload}
            className="hidden"
            aria-label="Import results JSON file"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Results JSON
          </button>
          <button
            type="button"
            onClick={onExportArtifact}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Download Artifact JSON
          </button>
          <button
            type="button"
            onClick={handleDownloadPdfReport}
            disabled={pdfExporting}
            className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            {pdfExporting ? 'Generating 3-Page PDF…' : 'Download 3-Page PDF Report'}
          </button>
        </div>
      </section>

      {importError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-200"
        >
          {importError}
        </div>
      )}

      {/* Seed Spec & YAML Config + Equations */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="min-w-0 rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">
              Simulation Seed Spec &amp; YAML Config
            </h3>
            <button
              type="button"
              onClick={() => handleCopyText('yaml', yamlConfig)}
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:text-slate-100 whitespace-nowrap"
            >
              {copiedKey === 'yaml' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === 'yaml' ? 'Copied' : 'Copy YAML'}
            </button>
          </div>

          <pre className="rounded-md border border-slate-800 bg-[#080B12] p-3 text-xs font-mono text-cyan-300 overflow-x-auto max-w-full">
            {seedSignature}
          </pre>

          <pre className="rounded-md border border-slate-800 bg-[#080B12] p-3 text-xs font-mono text-slate-300 overflow-x-auto max-w-full leading-relaxed">
            {yamlConfig}
          </pre>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Mathematical Formulations & Split Discipline
          </h3>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="rounded border border-slate-800/90 bg-[#080B12] p-3">
              <div className="font-semibold text-slate-100 mb-1">1. PHM08 Asymmetric Score</div>
              <p className="font-mono text-slate-300">
                S = Σ [ d &lt; 0 ? exp(-d / 13) - 1 : exp(d / 10) - 1 ], where d = ŷ - y
              </p>
              <p className="mt-1 text-slate-400">
                Late predictions (overestimating RUL, d &gt; 0) incur steeper exponential penalty than early conservative predictions.
              </p>
            </div>

            <div className="rounded border border-slate-800/90 bg-[#080B12] p-3">
              <div className="font-semibold text-slate-100 mb-1">2. Split Conformal Quantile (Binned)</div>
              <p className="font-mono text-slate-300">
                q̂(b) = Quantile( |y - ŷ|_cal∈b , ceil((n_b + 1)(1 - α)) / n_b )
              </p>
              <p className="mt-1 text-slate-400">
                Risk-aware policy triggers preventive swap when lower bound max(0, ŷ - q̂(bin)) ≤ τ.
              </p>
            </div>

            <div className="rounded border border-slate-800/90 bg-[#080B12] p-3">
              <div className="font-semibold text-slate-100 mb-1">3. Cost per Operating Cycle</div>
              <p className="font-mono text-slate-300">
                CPC = ( N_prev · C_p + N_fail · C_f ) / Σ_i operating_cycles_i
              </p>
              <p className="mt-1 text-slate-400">
                Bootstrap 95% confidence intervals resample episode-level costs across disjoint evaluation engines.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Current JSON Artifact Preview */}
      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-slate-100 truncate max-w-full">
              Active Experiment Artifact ({artifact.experiment_id})
            </h3>
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                isImported
                  ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                  : 'border-amber-500/45 bg-amber-500/15 text-amber-300'
              }`}
            >
              {artifact.source === 'imported_file' ? 'source: imported_file' : 'source: synthetic_demo'}
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">{artifact.timestamp}</span>
        </div>
        <pre className="max-h-72 max-w-full overflow-auto rounded-md border border-slate-800 bg-[#080B12] p-3.5 text-xs font-mono text-slate-300">
          {JSON.stringify(artifact, null, 2)}
        </pre>
      </section>

      {/* Literature References */}
      <section className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-100">Verified Literature References</h3>
        <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
          {REFERENCES.map((ref) => (
            <li key={ref.id}>{ref.citation}</li>
          ))}
        </ol>
      </section>
    </div>
  );
};
