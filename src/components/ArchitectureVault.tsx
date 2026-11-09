import { useState } from 'react';
import {
  QUANT_LITERATURE_PILLARS,
  GITHUB_ACTIONS_YML,
  NODE_SCRAPER_SCRIPT,
  STANDALONE_GITHUB_PAGES_HTML,
  INITIAL_MARKET_SNAPSHOT_JSON,
  GITHUB_REPO_README_MD
} from '../data/backendTemplates';
import { downloadGitHubRepoZip } from '../utils/zipExporter';
import {
  Check,
  Copy,
  Download,
  BookOpen,
  Globe,
  Workflow,
  FolderArchive,
  FileText
} from 'lucide-react';

interface ArchitectureVaultProps {
  activeTab: 'methodology' | 'github' | 'pipeline';
  onSelectTab: (tab: 'methodology' | 'github' | 'pipeline') => void;
}

export function ArchitectureVault({ activeTab, onSelectTab }: ArchitectureVaultProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGeneratingZip, setIsGeneratingZip] = useState<boolean>(false);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    setIsGeneratingZip(true);
    try {
      await downloadGitHubRepoZip();
    } finally {
      setIsGeneratingZip(false);
    }
  };

  return (
    <section id="architecture-vault" className="pt-8 border-t border-[#E4E2DD] space-y-6">
      {/* Prominent 1-Click ZIP Download Banner */}
      <div className="p-6 bg-[#FFFFFF] border-2 border-[#111315] rounded-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#0D5C46]">
            Ready-to-Upload GitHub Pages Repository Bundle (.ZIP)
          </div>
          <h2 className="text-xl font-bold tracking-tight text-[#111315]">
            Unduh Paket Lengkap Nostradamus Quant Terminal (.ZIP)
          </h2>
          <p className="font-editorial text-xs sm:text-sm text-neutral-700 leading-relaxed">
            Berisi struktur direktori lengkap yang siap di-upload langsung ke repository GitHub Anda: <strong className="font-sans text-[#111315]">index.html</strong>, <strong className="font-sans text-[#111315]">public/market-snapshot.json</strong>, <strong className="font-sans text-[#111315]">scripts/update-nostradamus-data.mjs</strong>, <strong className="font-sans text-[#111315]">.github/workflows/nostradamus-cron.yml</strong>, <strong className="font-sans text-[#111315]">.nojekyll</strong>, dan <strong className="font-sans text-[#111315]">README.md</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={isGeneratingZip}
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#111315] text-white text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <FolderArchive className="w-4 h-4" />
            <span>
              {isGeneratingZip
                ? 'Membuat File ZIP...'
                : 'Download Repository (.ZIP)'}
            </span>
          </button>
        </div>
      </div>

      {/* Section Header & Tab Navigation */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
            Zero-Sheets Public Architecture · Institutional Literature & Source Files
          </div>
          <h3 className="text-xl font-bold tracking-tight text-[#111315]">
            Inspeksi Kode Sumber & Metodologi Kuantitatif
          </h3>
        </div>

        {/* Interactive Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm self-start">
          <button
            type="button"
            onClick={() => onSelectTab('methodology')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'methodology'
                ? 'bg-[#111315] text-white'
                : 'text-neutral-600 hover:text-[#111315]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>1. Literatur 4-Pilar Quant</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('github')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'github'
                ? 'bg-[#111315] text-white'
                : 'text-neutral-600 hover:text-[#111315]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>2. Standalone index.html</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('pipeline')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'pipeline'
                ? 'bg-[#111315] text-white'
                : 'text-neutral-600 hover:text-[#111315]'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>3. GitHub Actions & Snapshot</span>
          </button>
        </div>
      </div>

      {/* TAB 1: 4-PILLAR INSTITUTIONAL QUANT METHODOLOGY */}
      {activeTab === 'methodology' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {QUANT_LITERATURE_PILLARS.map((item) => (
            <div
              key={item.pillar}
              className="p-6 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-[#111315] leading-snug">
                  {item.pillar}
                </h3>
                <div className="text-[11px] font-semibold text-[#0D5C46]">
                  Referensi: {item.citation}
                </div>
                <p className="font-editorial text-xs sm:text-sm text-neutral-700 leading-relaxed pt-1">
                  {item.rationale}
                </p>
              </div>

              <div className="p-3 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs text-xs font-semibold text-[#111315] tabular-nums">
                {item.formula}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: STANDALONE INDEX.HTML FOR GITHUB PAGES */}
      {activeTab === 'github' && (
        <div className="border border-[#E4E2DD] rounded-sm overflow-hidden bg-[#FFFFFF]">
          <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#E4E2DD] flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-[#111315]">index.html</span>
              <span className="text-xs text-neutral-500 ml-2">
                Single-File GitHub Pages Terminal · Montserrat + Lora · Tanpa Google Sheets · Live .JK Fetcher
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(STANDALONE_GITHUB_PAGES_HTML, 'index_html')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111315] bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm hover:bg-neutral-100 cursor-pointer"
              >
                {copiedId === 'index_html' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#0D5C46]" />
                    <span>Berhasil Disalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin index.html</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadFile(STANDALONE_GITHUB_PAGES_HTML, 'index.html')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111315] rounded-sm hover:bg-neutral-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh index.html</span>
              </button>
            </div>
          </div>
          <pre className="p-5 text-xs text-neutral-800 bg-[#FFFFFF] overflow-x-auto leading-relaxed max-h-[520px]">
            <code>{STANDALONE_GITHUB_PAGES_HTML}</code>
          </pre>
        </div>
      )}

      {/* TAB 3: GITHUB ACTIONS WORKFLOW, NODE.JS SCRAPER, SNAPSHOT JSON & README */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          <div className="border border-[#E4E2DD] rounded-sm overflow-hidden bg-[#FFFFFF]">
            <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#E4E2DD] flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-[#111315]">
                  .github/workflows/nostradamus-cron.yml
                </span>
                <span className="text-xs text-neutral-500 ml-2">
                  Menjalankan penarikan data IHSG & Makro otomatis setiap hari bursa di server GitHub
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(GITHUB_ACTIONS_YML, 'gh_yml')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111315] bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm hover:bg-neutral-100 cursor-pointer"
              >
                {copiedId === 'gh_yml' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#0D5C46]" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Workflow YML</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-5 text-xs text-neutral-800 bg-[#FFFFFF] overflow-x-auto leading-relaxed">
              <code>{GITHUB_ACTIONS_YML}</code>
            </pre>
          </div>

          <div className="border border-[#E4E2DD] rounded-sm overflow-hidden bg-[#FFFFFF]">
            <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#E4E2DD] flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-[#111315]">
                  scripts/update-nostradamus-data.mjs
                </span>
                <span className="text-xs text-neutral-500 ml-2">
                  Script Node.js tanpa dependency eksternal untuk menghitung Beta, Volatilitas 30D, dan QMJ
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(NODE_SCRAPER_SCRIPT, 'node_mjs')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111315] bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm hover:bg-neutral-100 cursor-pointer"
              >
                {copiedId === 'node_mjs' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#0D5C46]" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Script Node.js</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-5 text-xs text-neutral-800 bg-[#FFFFFF] overflow-x-auto leading-relaxed max-h-[380px]">
              <code>{NODE_SCRAPER_SCRIPT}</code>
            </pre>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-[#E4E2DD] rounded-sm overflow-hidden bg-[#FFFFFF]">
              <div className="px-4 py-3 bg-[#FAF9F6] border-b border-[#E4E2DD] flex items-center justify-between">
                <span className="text-xs font-bold text-[#111315]">
                  public/market-snapshot.json
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(INITIAL_MARKET_SNAPSHOT_JSON, 'snap_json')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#111315] bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs hover:bg-neutral-100 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedId === 'snap_json' ? 'Tersalin' : 'Copy JSON'}</span>
                </button>
              </div>
              <pre className="p-4 text-[11px] text-neutral-700 overflow-x-auto max-h-64">
                <code>{INITIAL_MARKET_SNAPSHOT_JSON}</code>
              </pre>
            </div>

            <div className="border border-[#E4E2DD] rounded-sm overflow-hidden bg-[#FFFFFF]">
              <div className="px-4 py-3 bg-[#FAF9F6] border-b border-[#E4E2DD] flex items-center justify-between">
                <span className="text-xs font-bold text-[#111315] inline-flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>README.md</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(GITHUB_REPO_README_MD, 'readme_md')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#111315] bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs hover:bg-neutral-100 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedId === 'readme_md' ? 'Tersalin' : 'Copy README'}</span>
                </button>
              </div>
              <pre className="p-4 text-[11px] text-neutral-700 overflow-x-auto max-h-64">
                <code>{GITHUB_REPO_README_MD}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
