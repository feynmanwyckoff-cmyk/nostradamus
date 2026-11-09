import React, { useState, useEffect } from 'react';
import { GitHubCloudConfig } from '../types/quant';
import {
  Cloud,
  CheckCircle2,
  DownloadCloud,
  UploadCloud,
  X,
  ExternalLink,
  ShieldCheck,
  Zap,
  KeyRound,
  Eye,
  EyeOff,
  GitMerge
} from 'lucide-react';

interface GitHubCloudSyncModalProps {
  isOpen: boolean;
  config: GitHubCloudConfig;
  isSyncing: boolean;
  onClose: () => void;
  onSaveConfig: (nextConfig: GitHubCloudConfig) => void;
  onPullNow: (customConfig?: GitHubCloudConfig) => void;
  onPushNow: (customConfig?: GitHubCloudConfig) => void;
  onTestAndInit?: (customConfig: GitHubCloudConfig) => void;
  onTriggerWorkflow?: (customConfig: GitHubCloudConfig) => void;
  onSyncForkAndRebuildUi?: (customConfig: GitHubCloudConfig) => void;
}

export function GitHubCloudSyncModal({
  isOpen,
  config,
  isSyncing,
  onClose,
  onSaveConfig,
  onPullNow,
  onPushNow,
  onTestAndInit,
  onTriggerWorkflow,
  onSyncForkAndRebuildUi
}: GitHubCloudSyncModalProps) {
  const [owner, setOwner] = useState(config.owner || '');
  const [repo, setRepo] = useState(config.repo || 'nostradamus');
  const [branch, setBranch] = useState(config.branch || 'main');
  const [filePath, setFilePath] = useState(
    config.filePath || 'data/nostradamus_cloud_state.json'
  );
  const [patToken, setPatToken] = useState(config.patToken || '');
  const [showPatToken, setShowPatToken] = useState(false);
  const [autoSyncOnEdit, setAutoSyncOnEdit] = useState(
    config.autoSyncOnEdit ?? true
  );

  useEffect(() => {
    if (isOpen) {
      setOwner(config.owner || '');
      setRepo(config.repo || 'nostradamus');
      setBranch(config.branch || 'main');
      setFilePath(config.filePath || 'data/nostradamus_cloud_state.json');
      setPatToken(config.patToken || '');
      setShowPatToken(false);
      setAutoSyncOnEdit(config.autoSyncOnEdit ?? true);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const buildCurrentDraft = (): GitHubCloudConfig => ({
    owner: owner.trim(),
    repo: repo.trim() || 'nostradamus',
    branch: branch.trim() || 'main',
    filePath: filePath.trim() || 'data/nostradamus_cloud_state.json',
    patToken: patToken.trim(),
    autoSyncOnEdit,
    lastSyncedSha: config.lastSyncedSha,
    lastSyncedAt: config.lastSyncedAt
  });

  const handleSaveClick = () => {
    const draft = buildCurrentDraft();
    onSaveConfig(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-xl my-auto">
        <div className="flex items-start justify-between gap-4 border-b border-[#E4E2DD] pb-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#D97706] bb-amber">
              <Cloud className="w-4 h-4" />
              <span>
                GitHub Cloud Real-Time Sync · Repo: {owner ? `${owner}/${repo || 'nostradamus'}` : repo || 'nostradamus'}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-[#111315] mt-0.5">
              Sinkronisasi Cloud Real-Time (Portofolio, Kas, Screener &amp; Live Market API)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-[#111315] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive 3-Step Setup Guide */}
        <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs text-xs text-neutral-700 space-y-2.5 leading-relaxed">
          <div className="font-bold text-[#111315] flex flex-wrap items-center justify-between gap-2">
            <span>Panduan 3 Langkah Setup GitHub Cloud Real-Time (Siap Fork / Multi-User):</span>
            {config.lastSyncedAt && (
              <span className="text-[11px] font-semibold text-[#0D5C46]">
                ✓ Tersinkron: {config.lastSyncedAt}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-1.5">
              <div className="font-bold text-[#D97706] bb-amber flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Langkah 1: Buat Token PAT</span>
              </div>
              <p className="text-[11px] text-neutral-500">
                Klik tombol di bawah untuk membuat token GitHub dengan izin baca/tulis repo &amp; workflow otomatis:
              </p>
              <div className="flex flex-col gap-1 pt-0.5">
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=Nostradamus+Quant+Terminal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-between px-2 py-1 text-[11px] font-bold bg-[#D97706] text-white rounded-xs hover:bg-[#B45309]"
                >
                  <span>Buat Token (Otomatis)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-between px-2 py-0.5 text-[10px] font-semibold text-[#0284C7] bb-cyan hover:underline"
                >
                  <span>Atau Fine-Grained PAT</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-1">
              <div className="font-bold text-[#0284C7] bb-cyan">
                Langkah 2: Isi Username &amp; Token
              </div>
              <p className="text-[11px] text-neutral-500">
                Isi <strong>Username GitHub</strong> akun Anda sendiri (otomatis terdeteksi jika diakses dari <code className="font-mono">&lt;username&gt;.github.io</code>) dan tempelkan kode token <code className="font-mono">ghp_...</code> Anda.
              </p>
            </div>

            <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-1">
              <div className="font-bold text-[#0D5C46]">
                Langkah 3: Test &amp; Inisialisasi
              </div>
              <p className="text-[11px] text-neutral-500">
                Klik <strong>Test Koneksi &amp; Inisialisasi Cloud</strong> di bawah. File <code className="font-mono">nostradamus_cloud_state.json</code> akan otomatis disinkronkan di repo Anda!
              </p>
            </div>
          </div>
        </div>

        {/* Non-form container so browser Password Manager never prompts "Save password?" */}
        <div
          className="space-y-3.5"
          role="region"
          aria-label="Pengaturan Koneksi API GitHub Cloud"
          data-form-type="other"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">
                GitHub Username / Owner <span className="text-[#9E2A2B]">*</span>
              </label>
              <input
                type="text"
                name="nostradamus_gh_repo_owner"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                placeholder="Ketik username GitHub Anda"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-bold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">
                Repository Name (Default: nostradamus) <span className="text-[#9E2A2B]">*</span>
              </label>
              <input
                type="text"
                name="nostradamus_gh_repo_name"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                placeholder="nostradamus"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-bold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">
                Branch
              </label>
              <input
                type="text"
                name="nostradamus_gh_branch"
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-bold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-neutral-600 mb-1">
                Path File JSON Cloud di Repository
              </label>
              <input
                type="text"
                name="nostradamus_gh_filepath"
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                placeholder="data/nostradamus_cloud_state.json"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-bold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              GitHub Personal Access Token (Classic <code className="font-mono">ghp_...</code> atau Fine-Grained <code className="font-mono">github_pat_...</code>) <span className="text-[#9E2A2B]">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                name="nostradamus_api_key_token"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx atau github_pat_11A..."
                value={patToken}
                onChange={(e) => setPatToken(e.target.value)}
                style={
                  !showPatToken && patToken
                    ? ({ WebkitTextSecurity: 'disc' } as React.CSSProperties)
                    : undefined
                }
                className="w-full pl-3 pr-9 py-1.5 text-xs font-mono bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
              />
              <button
                type="button"
                onClick={() => setShowPatToken((prev) => !prev)}
                title={showPatToken ? 'Sembunyikan Token PAT' : 'Tampilkan Token PAT'}
                className="absolute right-2.5 p-1 text-neutral-400 hover:text-[#D97706] cursor-pointer"
              >
                {showPatToken ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <span className="block text-[11px] text-neutral-500 mt-1">
              Token disimpan privat di penyimpanan lokal browser perangkat Anda (bebas popup <em>Save Password</em> browser) untuk koneksi langsung ke <code className="font-mono">api.github.com</code>.
            </span>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-[#111315] cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={autoSyncOnEdit}
              onChange={(e) => setAutoSyncOnEdit(e.target.checked)}
              className="accent-[#D97706]"
            />
            <span>
              Auto-Push ke GitHub setiap kali saya mengubah Portofolio, Kas, Screener, atau selesai Sync Live
            </span>
          </label>

          {/* Cloud Action Bar */}
          <div className="p-3 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs space-y-2.5">
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Aksi Cloud Real-Time, Sinkronisasi UI Fork &amp; Update Harga Server GitHub:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onTestAndInit && (
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => {
                    const draft = buildCurrentDraft();
                    onSaveConfig(draft);
                    onTestAndInit(draft);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#0D5C46] hover:bg-[#064E3B] rounded-xs cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Test Koneksi &amp; Inisialisasi Cloud</span>
                </button>
              )}

              {onSyncForkAndRebuildUi && (
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => {
                    const draft = buildCurrentDraft();
                    onSaveConfig(draft);
                    onSyncForkAndRebuildUi(draft);
                  }}
                  className="bb-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#D97706] hover:bg-[#B45309] rounded-xs cursor-pointer disabled:opacity-50"
                  title="Tarik update kode UI terbaru dari repo utama (upstream) ke repo hasil fork Anda (tanpa konflik data) dan jalankan build ulang GitHub Pages"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>1-Click Sync Fork &amp; Rebuild UI</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSyncing}
                onClick={() => {
                  const draft = buildCurrentDraft();
                  onSaveConfig(draft);
                  onPullNow(draft);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0284C7] bb-cyan bg-[#FFFFFF] border border-[#E4E2DD] hover:border-[#0284C7] rounded-xs cursor-pointer disabled:opacity-50"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                <span>Pull dari GitHub</span>
              </button>

              <button
                type="button"
                disabled={isSyncing}
                onClick={() => {
                  const draft = buildCurrentDraft();
                  onSaveConfig(draft);
                  onPushNow(draft);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0D5C46] bg-[#FFFFFF] border border-[#E4E2DD] hover:border-[#059669] rounded-xs cursor-pointer disabled:opacity-50"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Push State Sekarang</span>
              </button>

              {onTriggerWorkflow && (
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => {
                    const draft = buildCurrentDraft();
                    onSaveConfig(draft);
                    onTriggerWorkflow(draft);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#D97706] bb-amber bg-[#FFFFFF] border border-[#E4E2DD] hover:border-[#D97706] rounded-xs cursor-pointer disabled:opacity-50"
                  title="Memicu GitHub Actions (deploy-pages.yml & sync-idx-market.yml) untuk menarik harga Yahoo Finance langsung dari server GitHub"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Trigger Server Sync (GitHub Actions)</span>
                </button>
              )}

              {owner.trim() && (
                <a
                  href={`https://github.com/${encodeURIComponent(
                    owner.trim()
                  )}/${encodeURIComponent(repo.trim() || 'nostradamus')}/actions`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-neutral-600 bg-[#FFFFFF] border border-[#E4E2DD] hover:border-[#0284C7] hover:text-[#0284C7] rounded-xs"
                  title="Buka tab GitHub Actions (Untuk mengaktifkan workflow pertama kali pada Repo Hasil Fork)"
                >
                  <span>Tab Actions Repo</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="text-[11px] text-neutral-500 leading-relaxed pt-1 border-t border-[#E4E2DD]/70">
              <strong>Tips Repo Hasil Fork:</strong> Jika tampilan GitHub Pages pada repo fork Anda belum menampilkan layar login sandi (<code className="font-mono">12345</code>), tombol <strong>Ubah Sandi</strong>, atau tombol lipat panel Cloud, klik <strong>1-Click Sync Fork &amp; Rebuild UI</strong> agar repo fork menarik kode UI terbaru dari repo induk sekaligus memicu <em>deploy</em> GitHub Pages.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E4E2DD]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:text-[#111315] cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSaveClick}
              className="bb-btn-primary inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-[#B45309] rounded-xs cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Simpan Konfigurasi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

