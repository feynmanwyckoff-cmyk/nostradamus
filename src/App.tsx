import { useState, useEffect, useCallback, useMemo } from 'react';
import Swal from 'sweetalert2';
import {
  CloudStateBundle,
  EncryptedPortfolioVault,
  GitHubCloudConfig,
  MacroIndicator,
  MarketRegime,
  NewsSentimentItem,
  PortfolioHolding,
  StockMetrics,
  WorkspaceTabId
} from './types/quant';
import {
  buildQuantStockList,
  CALM_GLOBAL_MACRO,
  CALM_IHSG_30D_RETURNS,
  CAUTION_GLOBAL_MACRO,
  CAUTION_IHSG_30D_RETURNS,
  computeMarketRegime,
  computeOptimalHRPBarbellPortfolio,
  DEFAULT_GLOBAL_MACRO,
  DEFAULT_NEWS_SENTIMENT,
  DEFAULT_USER_PORTFOLIO_HOLDINGS,
  rankUniverseWithBuffer,
  REAL_IHSG_30D_RETURNS,
  SimRegimeMode,
  toggleManualHscTicker,
  VOLATILE_GLOBAL_MACRO
} from './utils/quantEngine';
import {
  buildIdx100StockUniverse,
  fetchLiveFinancialNewsRss,
  formatFullIndonesianDateTime,
  refreshLiveGlobalMacroAndIhsg
} from './utils/liveMarketFetcher';
import {
  getActiveRepoScope,
  isGitHubCloudConfigured,
  loadGitHubCloudConfig,
  pullStateFromGitHubRepo,
  pushStateToGitHubRepo,
  saveGitHubCloudConfig,
  syncForkUpstreamAndRebuildPages,
  triggerGitHubActionsMarketSync,
  verifyGitHubRepoConnection
} from './utils/githubCloudSync';
import {
  ActiveVaultSession,
  encryptPortfolioWithSession,
  isVaultMatchingRepoScope,
  loadLocalSecurityVault,
  saveLocalSecurityVault
} from './utils/securityVault';
import { Header } from './components/Header';
import { GlobalMacroPulse } from './components/GlobalMacroPulse';
import { MarketRegimeBanner } from './components/MarketRegimeBanner';
import { BarbellAllocatorCard } from './components/BarbellAllocatorCard';
import { ActivePortfolioManager } from './components/ActivePortfolioManager';
import { ScreeningTable } from './components/ScreeningTable';
import { MarketNewsSentiment } from './components/MarketNewsSentiment';
import { SkepticalBacktestLab } from './components/SkepticalBacktestLab';
import { ArchitectureVault } from './components/ArchitectureVault';
import { GitHubCloudSyncModal } from './components/GitHubCloudSyncModal';
import {
  TerminalSecurityGate,
  ChangePassphraseModal
} from './components/TerminalSecurityGate';
import { EmitenFundamentalInspectorModal } from './components/EmitenFundamentalInspectorModal';
import { Sun, Moon, Cloud, RefreshCw, Lock, KeyRound } from 'lucide-react';

const SCREENER_CACHE_KEY = 'nostradamus_dmu24_screener_v12_hsc_value';
const PORTFOLIO_CACHE_KEY = 'nostradamus_dmu24_portfolio_v4';
const THEME_CACHE_KEY = 'nostradamus_theme_mode_v1';

interface ScreenerCachePayload {
  savedAt: string;
  fullDateTimeStr?: string;
  stocks: StockMetrics[];
  macroIndicators: MacroIndicator[];
  liveIhsgQuote: { lastPrice: number; change1D: number };
  liveIhsgReturns: number[];
}

interface PortfolioCachePayload {
  savedAt: string;
  holdings: PortfolioHolding[];
  cashReserveIdr: number;
  rebalanceBufferPct?: number;
  capitalIdr?: number;
}

function loadScreenerCache(): ScreenerCachePayload | null {
  try {
    const raw = localStorage.getItem(SCREENER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScreenerCachePayload;
    if (
      Array.isArray(parsed.stocks) &&
      parsed.stocks.length >= 900 &&
      typeof parsed.stocks[0].dmuCompositeScore === 'number' &&
      parsed.liveIhsgQuote?.lastPrice
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function loadPortfolioCache(): PortfolioCachePayload | null {
  try {
    const raw = localStorage.getItem(PORTFOLIO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortfolioCachePayload;
    if (Array.isArray(parsed.holdings)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function loadInitialTheme(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem(THEME_CACHE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore
  }
  return 'dark';
}

export default function App() {
  const initialScreenerCache = loadScreenerCache();
  const initialPortfolioCache = loadPortfolioCache();

  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(loadInitialTheme);
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('command');
  const [showDeployKitModal, setShowDeployKitModal] = useState<boolean>(false);
  const [activeVaultTab, setActiveVaultTab] = useState<'methodology' | 'github' | 'pipeline'>(
    'methodology'
  );

  // Zero-Knowledge Security Gate State (Strictly In-Memory -> Always Locks on Refresh/Close)
  const [isTerminalUnlocked, setIsTerminalUnlocked] = useState<boolean>(false);
  const [vaultSession, setVaultSession] = useState<ActiveVaultSession | null>(null);
  const [securityVault, setSecurityVault] = useState<EncryptedPortfolioVault | null>(() =>
    loadLocalSecurityVault(getActiveRepoScope(loadGitHubCloudConfig()))
  );
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState<boolean>(false);

  // Multifactor + 40% Rebalancing Buffer State
  const [simRegimeMode, setSimRegimeMode] = useState<SimRegimeMode>('LIVE');
  const [thresholdAnnVol, setThresholdAnnVol] = useState<number>(18.0);
  const [rebalanceBufferPct, setRebalanceBufferPct] = useState<number>(
    () => initialPortfolioCache?.rebalanceBufferPct ?? 40
  );
  const [capitalIdr, setCapitalIdr] = useState<number>(
    () => initialPortfolioCache?.capitalIdr ?? 100000000
  );

  const [macroIndicators, setMacroIndicators] = useState<MacroIndicator[]>(
    () => initialScreenerCache?.macroIndicators || DEFAULT_GLOBAL_MACRO
  );
  const [liveIhsgQuote, setLiveIhsgQuote] = useState<{ lastPrice: number; change1D: number }>(
    () =>
      initialScreenerCache?.liveIhsgQuote || {
        lastPrice: 5034.43,
        change1D: 2.33
      }
  );
  const [liveIhsgReturns, setLiveIhsgReturns] = useState<number[]>(
    () => initialScreenerCache?.liveIhsgReturns || REAL_IHSG_30D_RETURNS
  );
  const [regime, setRegime] = useState<MarketRegime>(() =>
    computeMarketRegime(
      initialScreenerCache?.liveIhsgReturns || REAL_IHSG_30D_RETURNS,
      18.0,
      initialScreenerCache?.macroIndicators || DEFAULT_GLOBAL_MACRO,
      initialScreenerCache?.liveIhsgQuote || {
        lastPrice: 5034.43,
        change1D: 2.33
      }
    )
  );
  const [stocks, setStocks] = useState<StockMetrics[]>(
    () => initialScreenerCache?.stocks || buildIdx100StockUniverse(40)
  );
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(
    () => initialPortfolioCache?.holdings || DEFAULT_USER_PORTFOLIO_HOLDINGS
  );
  const [cashReserveIdr, setCashReserveIdr] = useState<number>(
    () => initialPortfolioCache?.cashReserveIdr ?? 15000000
  );
  const [lastCacheSavedAt, setLastCacheSavedAt] = useState<string>(() => {
    const cached =
      initialPortfolioCache?.savedAt || initialScreenerCache?.fullDateTimeStr;
    if (cached && cached.includes('Pukul')) {
      return cached;
    }
    return formatFullIndonesianDateTime(new Date());
  });
  const [lastFullSyncDateTime, setLastFullSyncDateTime] = useState<string>(
    () => initialScreenerCache?.fullDateTimeStr || formatFullIndonesianDateTime(new Date())
  );

  // GitHub Repository JSON + PAT Cloud Sync State
  const [githubConfig, setGithubConfig] = useState<GitHubCloudConfig>(loadGitHubCloudConfig);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState<boolean>(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);

  const activeRepoScope = useMemo(
    () => getActiveRepoScope(githubConfig),
    [githubConfig]
  );

  const [newsItems, setNewsItems] = useState<NewsSentimentItem[]>(DEFAULT_NEWS_SENTIMENT);
  const [dataSourceLabel, setDataSourceLabel] = useState<string>(
    isGitHubCloudConfigured(loadGitHubCloudConfig())
      ? 'Cloud: GitHub Repo JSON'
      : 'Feed: Yahoo Finance Spark Batch'
  );
  const [isMasterSyncing, setIsMasterSyncing] = useState<boolean>(false);
  const [syncStatusLabel, setSyncStatusLabel] = useState<string | null>(null);
  const [isLoadingNews, setIsLoadingNews] = useState<boolean>(false);
  const [globalInspectedTicker, setGlobalInspectedTicker] = useState<string | null>(null);

  const globalInspectedStockObj = useMemo(() => {
    if (!globalInspectedTicker) return null;
    const clean = globalInspectedTicker.trim().toUpperCase();
    return stocks.find((s) => s.ticker.toUpperCase() === clean) || null;
  }, [stocks, globalInspectedTicker]);

  const liveSyncedStockCount = useMemo(
    () => stocks.filter((s) => s.isLiveFetched).length,
    [stocks]
  );

  // Compute actual Portfolio Market Value + Cash Reserve (NAV Aktual) and auto-sync to Allocator Capital
  const actualPortfolioNavIdr = useMemo(() => {
    const stockMap = new Map(stocks.map((s) => [s.ticker.toUpperCase(), s]));
    const holdingsMarketVal = holdings.reduce((sum, h) => {
      const st = stockMap.get(h.ticker.toUpperCase());
      const px = st && st.lastPrice > 0 ? st.lastPrice : h.avgBuyPrice;
      return sum + h.lots * 100 * px;
    }, 0);
    return Math.round(holdingsMarketVal + cashReserveIdr);
  }, [holdings, cashReserveIdr, stocks]);

  useEffect(() => {
    if (actualPortfolioNavIdr > 0) {
      setCapitalIdr(actualPortfolioNavIdr);
    }
  }, [actualPortfolioNavIdr]);

  const handleToggleTheme = () => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    try {
      localStorage.setItem(THEME_CACHE_KEY, next);
    } catch {
      // ignore
    }
  };

  // Build current CloudStateBundle for GitHub Repo JSON persistence
  const buildCloudBundle = useCallback(
    (
      overrideHoldings?: PortfolioHolding[],
      overrideCash?: number,
      overrideStocks?: StockMetrics[],
      overrideBuffer?: number,
      overrideVault?: EncryptedPortfolioVault | null,
      overrideMacro?: MacroIndicator[],
      overrideIhsgQuote?: { lastPrice: number; change1D: number },
      overrideIhsgReturns?: number[]
    ): CloudStateBundle => ({
      schemaVersion: '3.0-DEMIGUEL-MF24',
      updatedAt: new Date().toISOString(),
      strategyName: 'Vol-Managed Multifactor + 40% Buffer',
      rebalanceBufferPct: overrideBuffer ?? rebalanceBufferPct,
      thresholdAnnVol,
      capitalIdr,
      cashReserveIdr: overrideCash ?? cashReserveIdr,
      holdings: overrideHoldings ?? holdings,
      stocks: overrideStocks ?? stocks,
      macroIndicators: overrideMacro ?? macroIndicators,
      liveIhsgQuote: overrideIhsgQuote ?? liveIhsgQuote,
      liveIhsgReturns: overrideIhsgReturns ?? liveIhsgReturns,
      encryptedVault: (overrideVault ?? securityVault) || undefined
    }),
    [
      rebalanceBufferPct,
      thresholdAnnVol,
      capitalIdr,
      cashReserveIdr,
      holdings,
      stocks,
      macroIndicators,
      liveIhsgQuote,
      liveIhsgReturns,
      securityVault
    ]
  );

  // Push (commit) state to GitHub Repository JSON
  const handlePushToGitHub = useCallback(
    async (
      customCfg?: GitHubCloudConfig,
      customBundle?: CloudStateBundle,
      silent: boolean = false
    ) => {
      const cfg = customCfg ?? githubConfig;
      if (!isGitHubCloudConfigured(cfg)) {
        if (!silent) {
          setIsCloudModalOpen(true);
        }
        return;
      }

      setIsSyncingCloud(true);
      try {
        const bundleToPush = customBundle ?? buildCloudBundle();
        const { sha, syncedAt } = await pushStateToGitHubRepo(cfg, bundleToPush);
        const updatedCfg: GitHubCloudConfig = {
          ...cfg,
          lastSyncedSha: sha,
          lastSyncedAt: syncedAt
        };
        setGithubConfig(updatedCfg);
        saveGitHubCloudConfig(updatedCfg);
        setLastCacheSavedAt(`${syncedAt} (GitHub Cloud)`);
        setDataSourceLabel(`GitHub Cloud: ${cfg.owner}/${cfg.repo}`);

        if (!silent) {
          Swal.fire({
            icon: 'success',
            title: 'Tersimpan di GitHub Cloud Real-Time',
            text: `State Portofolio, Kas & Screener (${bundleToPush.stocks.length} emiten) berhasil di-commit ke ${cfg.owner}/${cfg.repo}/${cfg.filePath}.`,
            confirmButtonColor: '#D97706'
          });
        }
      } catch (err: unknown) {
        if (!silent) {
          const msg = err instanceof Error ? err.message : 'Gagal melakukan commit ke GitHub.';
          Swal.fire({
            icon: 'error',
            title: 'GitHub Push Error',
            text: msg,
            confirmButtonColor: '#D97706'
          });
        }
      } finally {
        setIsSyncingCloud(false);
      }
    },
    [githubConfig, buildCloudBundle]
  );

  // Pull state from GitHub Repository JSON (with automatic initialization if file doesn't exist yet)
  const handlePullFromGitHub = useCallback(
    async (customCfg?: GitHubCloudConfig, silent: boolean = false) => {
      const cfg = customCfg ?? githubConfig;
      if (!isGitHubCloudConfigured(cfg)) {
        if (!silent) {
          setIsCloudModalOpen(true);
        }
        return;
      }

      setIsSyncingCloud(true);
      try {
        const { bundle, sha } = await pullStateFromGitHubRepo(cfg);
        const targetBuffer =
          typeof bundle.rebalanceBufferPct === 'number' ? bundle.rebalanceBufferPct : 40;
        const freshBaseUniverse = buildIdx100StockUniverse(targetBuffer);
        if (Array.isArray(bundle.stocks) && bundle.stocks.length > 0) {
          const freshTickerSet = new Set(freshBaseUniverse.map((s) => s.ticker));
          const customUserStocks = bundle.stocks.filter(
            (s) => s && s.ticker && !freshTickerSet.has(s.ticker)
          );
          setStocks(
            rankUniverseWithBuffer([...customUserStocks, ...freshBaseUniverse], targetBuffer)
          );
        } else {
          setStocks(freshBaseUniverse);
        }
        if (Array.isArray(bundle.holdings)) {
          setHoldings(bundle.holdings);
        }
        if (typeof bundle.cashReserveIdr === 'number') {
          setCashReserveIdr(bundle.cashReserveIdr);
        }
        if (typeof bundle.rebalanceBufferPct === 'number') {
          setRebalanceBufferPct(bundle.rebalanceBufferPct);
        }
        if (typeof bundle.capitalIdr === 'number') {
          setCapitalIdr(bundle.capitalIdr);
        }

        const nextQuote =
          bundle.liveIhsgQuote && bundle.liveIhsgQuote.lastPrice > 0
            ? bundle.liveIhsgQuote
            : liveIhsgQuote;
        const nextRets =
          Array.isArray(bundle.liveIhsgReturns) && bundle.liveIhsgReturns.length >= 15
            ? bundle.liveIhsgReturns
            : liveIhsgReturns;
        const nextMacro =
          Array.isArray(bundle.macroIndicators) && bundle.macroIndicators.length > 0
            ? bundle.macroIndicators
            : macroIndicators;
        const nextThreshold =
          typeof bundle.thresholdAnnVol === 'number' && bundle.thresholdAnnVol >= 8
            ? bundle.thresholdAnnVol
            : thresholdAnnVol;

        setLiveIhsgQuote(nextQuote);
        setLiveIhsgReturns(nextRets);
        setMacroIndicators(nextMacro);
        if (typeof bundle.thresholdAnnVol === 'number' && bundle.thresholdAnnVol >= 8) {
          setThresholdAnnVol(bundle.thresholdAnnVol);
        }
        setRegime(
          computeMarketRegime(nextRets, nextThreshold, nextMacro, nextQuote, 'LIVE')
        );
        const cfgScope = getActiveRepoScope(cfg);
        if (isVaultMatchingRepoScope(bundle.encryptedVault, cfgScope)) {
          setSecurityVault(bundle.encryptedVault!);
          saveLocalSecurityVault(bundle.encryptedVault!, cfgScope);
        } else if (bundle.encryptedVault && !isVaultMatchingRepoScope(bundle.encryptedVault, cfgScope)) {
          // Inherited vault from parent repo before fork: ignore parent lock so fork defaults to 12345
          const localForkVault = loadLocalSecurityVault(cfgScope);
          if (!localForkVault && !isTerminalUnlocked) {
            setSecurityVault(null);
          }
        }

        const nowFullStr = formatFullIndonesianDateTime(new Date());
        const updatedCfg: GitHubCloudConfig = {
          ...cfg,
          lastSyncedSha: sha,
          lastSyncedAt: nowFullStr
        };
        setGithubConfig(updatedCfg);
        saveGitHubCloudConfig(updatedCfg);
        setLastCacheSavedAt(nowFullStr);
        setDataSourceLabel(`GitHub Cloud: ${cfg.owner}/${cfg.repo}`);

        if (!silent) {
          Swal.fire({
            icon: 'success',
            title: 'Data Diunduh dari GitHub Repo JSON',
            text: `Portofolio (${bundle.holdings?.length ?? 0} posisi) & Screener (${bundle.stocks?.length ?? 0} saham) berhasil disinkronkan dari ${cfg.owner}/${cfg.repo}.`,
            confirmButtonColor: '#D97706'
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Gagal menarik data dari GitHub.';
        if (msg.includes('FILE_NOT_INITIALIZED')) {
          try {
            const initialBundle = buildCloudBundle();
            const { sha, syncedAt } = await pushStateToGitHubRepo(cfg, initialBundle);
            const updatedCfg: GitHubCloudConfig = {
              ...cfg,
              lastSyncedSha: sha,
              lastSyncedAt: syncedAt
            };
            setGithubConfig(updatedCfg);
            saveGitHubCloudConfig(updatedCfg);
            setLastCacheSavedAt(`${syncedAt} (GitHub Cloud)`);
            setDataSourceLabel(`GitHub Cloud: ${cfg.owner}/${cfg.repo}`);

            if (!silent) {
              Swal.fire({
                icon: 'success',
                title: 'File Cloud Berhasil Diinisialisasi!',
                text: `File ${cfg.filePath} belum ada sebelumnya dan kini otomatis dibuat di ${cfg.owner}/${cfg.repo}. Sinkronisasi Cloud Real-Time sudah aktif!`,
                confirmButtonColor: '#D97706'
              });
            }
          } catch (pushErr: unknown) {
            if (!silent) {
              Swal.fire({
                icon: 'error',
                title: 'Gagal Inisialisasi File Cloud',
                text: pushErr instanceof Error ? pushErr.message : 'Periksa izin Write pada PAT Anda.',
                confirmButtonColor: '#D97706'
              });
            }
          }
        } else if (!silent) {
          Swal.fire({
            icon: 'warning',
            title: 'GitHub Pull Info',
            text: msg,
            confirmButtonColor: '#D97706'
          });
        }
      } finally {
        setIsSyncingCloud(false);
      }
    },
    [githubConfig, buildCloudBundle]
  );

  // Test Connection & Initialize Cloud JSON in 1 Click
  const handleTestAndInitGitHubCloud = useCallback(
    async (draftCfg: GitHubCloudConfig) => {
      if (!isGitHubCloudConfigured(draftCfg)) {
        Swal.fire({
          icon: 'warning',
          title: 'Lengkapi Username & Token PAT',
          text: 'Masukkan GitHub Username, nama repository (nostradamus), dan Personal Access Token terlebih dahulu.',
          confirmButtonColor: '#D97706'
        });
        return;
      }

      setIsSyncingCloud(true);
      try {
        const check = await verifyGitHubRepoConnection(draftCfg);
        if (!check.ok) {
          Swal.fire({
            icon: 'error',
            title: 'Koneksi GitHub Gagal',
            text: check.message,
            confirmButtonColor: '#D97706'
          });
          return;
        }

        const bundleToPush = buildCloudBundle();
        const { sha, syncedAt } = await pushStateToGitHubRepo(draftCfg, bundleToPush);
        const updatedCfg: GitHubCloudConfig = {
          ...draftCfg,
          lastSyncedSha: sha,
          lastSyncedAt: syncedAt
        };
        setGithubConfig(updatedCfg);
        saveGitHubCloudConfig(updatedCfg);
        setLastCacheSavedAt(`${syncedAt} (GitHub Cloud)`);
        setDataSourceLabel(`GitHub Cloud: ${draftCfg.owner}/${draftCfg.repo}`);

        Swal.fire({
          icon: 'success',
          title: 'GitHub Cloud Real-Time Aktif!',
          html: `
            <div style="text-align:left;font-size:12.5px;line-height:1.6;color:#374151;">
              <div><strong>Status Repo:</strong> ${check.message}</div>
              <div><strong>File Cloud State:</strong> <code>${draftCfg.filePath}</code> berhasil di-commit (${syncedAt})</div>
              <div><strong>Cakupan Sinkronisasi:</strong> Portofolio (${bundleToPush.holdings.length} posisi), Kas (Rp ${bundleToPush.cashReserveIdr.toLocaleString('id-ID')}), &amp; Screener (${bundleToPush.stocks.length} emiten JCI).</div>
            </div>
          `,
          confirmButtonColor: '#D97706'
        });
      } catch (err: unknown) {
        Swal.fire({
          icon: 'error',
          title: 'Gagal Inisialisasi Cloud',
          text: err instanceof Error ? err.message : 'Terjadi kesalahan saat menghubungi GitHub API.',
          confirmButtonColor: '#D97706'
        });
      } finally {
        setIsSyncingCloud(false);
      }
    },
    [buildCloudBundle]
  );

  // Trigger GitHub Actions server-side Yahoo Finance sync (sync-idx-market.yml)
  const handleTriggerGitHubWorkflow = useCallback(async (draftCfg: GitHubCloudConfig) => {
    if (!isGitHubCloudConfigured(draftCfg)) {
      Swal.fire({
        icon: 'warning',
        title: 'Konfigurasi GitHub Cloud Diperlukan',
        text: 'Isi GitHub Username dan Token PAT terlebih dahulu untuk memicu GitHub Actions.',
        confirmButtonColor: '#D97706'
      });
      return;
    }

    setIsSyncingCloud(true);
    try {
      const res = await triggerGitHubActionsMarketSync(draftCfg);
      if (res.ok) {
        Swal.fire({
          icon: 'success',
          title: 'GitHub Actions Market Sync Dipicu!',
          text: res.message,
          confirmButtonColor: '#D97706'
        });
      } else {
        Swal.fire({
          icon: 'warning',
          title: 'Info Trigger Workflow (Repo Fork / Actions)',
          html: `
            <div style="text-align:left;font-size:12.5px;line-height:1.6;color:#374151;">
              <p style="margin-bottom:10px;">${res.message}</p>
              <div style="padding:10px 12px;background:#FAF9F6;border:1px solid #E4E2DD;border-radius:2px;margin-bottom:10px;">
                <div style="font-weight:700;color:#111315;margin-bottom:4px;">Solusi Cepat Repo Hasil Fork (Hanya 1x Klik):</div>
                <ol style="margin:0;padding-left:18px;font-size:12px;">
                  <li>Buka tab <strong>Actions</strong> pada repo hasil fork Anda melalui tombol di bawah.</li>
                  <li>Jika muncul tombol hijau <strong>"I understand my workflows, go ahead and enable them"</strong>, klik tombol tersebut.</li>
                  <li>Pastikan Token PAT Anda memiliki centang izin <code>workflow</code> (Classic) atau <code>Actions: Read &amp; Write</code> (Fine-Grained).</li>
                </ol>
              </div>
              <div style="text-align:center;margin-top:8px;">
                <a
                  href="${res.actionsUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="display:inline-block;padding:7px 14px;background:#0284C7;color:#FFFFFF;font-weight:700;font-size:12px;border-radius:2px;text-decoration:none;"
                >
                  Buka Tab GitHub Actions (${draftCfg.owner.trim()}/${draftCfg.repo.trim() || 'nostradamus'}) ↗
                </a>
              </div>
            </div>
          `,
          confirmButtonColor: '#D97706'
        });
      }
    } catch (err: unknown) {
      Swal.fire({
        icon: 'warning',
        title: 'Info Trigger Workflow',
        text:
          err instanceof Error
            ? err.message
            : 'Pastikan Token PAT Anda memiliki izin "workflow" (Classic) atau "Actions: Read and write" (Fine-Grained).',
        confirmButtonColor: '#D97706'
      });
    } finally {
      setIsSyncingCloud(false);
    }
  }, []);

  // 1-Click Sync Fork Upstream & Rebuild UI (Syncs latest UI from parent repo while keeping fork's own portfolio & default 12345 security gate)
  const handleSyncForkAndRebuildUi = useCallback(
    async (customCfg?: GitHubCloudConfig) => {
      const cfg = customCfg ?? githubConfig;
      if (!isGitHubCloudConfigured(cfg)) {
        setIsCloudModalOpen(true);
        Swal.fire({
          icon: 'warning',
          title: 'Lengkapi Username & Token PAT Fork Anda',
          text: 'Masukkan GitHub Username repo hasil fork (misal: feynmanwyckoff-cmyk), nama repo (nostradamus), dan Token PAT dengan izin repo + workflow.',
          confirmButtonColor: '#D97706'
        });
        return;
      }

      setIsSyncingCloud(true);
      try {
        const res = await syncForkUpstreamAndRebuildPages(cfg);
        Swal.fire({
          icon: res.ok ? 'success' : 'warning',
          title: res.ok
            ? '✓ Sinkronisasi UI Fork & Rebuild Pages Dipicu!'
            : 'Info Sinkronisasi Repo Fork',
          width: 620,
          html: `
            <div style="text-align:left;font-size:12.5px;line-height:1.6;color:#374151;">
              <div style="margin-bottom:8px;"><strong>Target Repository:</strong> <code>${cfg.owner.trim()}/${cfg.repo.trim() || 'nostradamus'}</code> (${cfg.branch.trim() || 'main'})</div>
              <div style="margin-bottom:8px;"><strong>Repo Induk (Upstream):</strong> <code>${res.parentFullName}</code></div>
              <p style="margin-bottom:10px;">${res.message}</p>
              <div style="padding:10px 12px;background:#FAF9F6;border:1px solid #E4E2DD;border-radius:2px;margin-bottom:10px;font-size:11.5px;">
                <div style="font-weight:700;color:#0D5C46;margin-bottom:3px;">✓ Isolasi Sandi &amp; Data Portofolio Fork Aman:</div>
                <div>• Data portofolio (<code class="font-mono">${cfg.filePath}</code>) dan domain (<code class="font-mono">CNAME</code>) di repo fork Anda <strong>tetap terjaga</strong> dan tidak tertimpa data repo utama.</div>
                <div>• Setelah GitHub Actions selesai mem-build halaman (~1 menit), buka ulang situs GitHub Pages Anda: layar <strong>Login Sandi (Default: 12345)</strong>, tombol <strong>Ubah Sandi &amp; Kunci</strong>, serta tombol <strong>Tampilkan/Sembunyikan Panel Cloud Sync</strong> akan langsung aktif.</div>
              </div>
              <div style="text-align:center;margin-top:8px;">
                <a
                  href="${res.actionsUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="display:inline-block;padding:7px 14px;background:#0284C7;color:#FFFFFF;font-weight:700;font-size:12px;border-radius:2px;text-decoration:none;"
                >
                  Pantau Build GitHub Pages di Tab Actions (${cfg.owner.trim()}/${cfg.repo.trim() || 'nostradamus'}) ↗
                </a>
              </div>
            </div>
          `,
          confirmButtonColor: '#D97706'
        });
      } finally {
        setIsSyncingCloud(false);
      }
    },
    [githubConfig]
  );

  // Keep instant local fallback synced with full Indonesian Date + Time (HH:MM:SS WIB)
  useEffect(() => {
    if (simRegimeMode !== 'LIVE') return;
    try {
      const nowFullStr = formatFullIndonesianDateTime(new Date());
      const payload: ScreenerCachePayload = {
        savedAt: nowFullStr,
        fullDateTimeStr: lastFullSyncDateTime,
        stocks,
        macroIndicators,
        liveIhsgQuote,
        liveIhsgReturns
      };
      localStorage.setItem(SCREENER_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [stocks, macroIndicators, liveIhsgQuote, liveIhsgReturns, simRegimeMode, lastFullSyncDateTime]);

  useEffect(() => {
    try {
      const nowFullStr = formatFullIndonesianDateTime(new Date());
      const payload: PortfolioCachePayload = {
        savedAt: nowFullStr,
        holdings,
        cashReserveIdr,
        rebalanceBufferPct,
        capitalIdr
      };
      localStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }

    // Automatically re-encrypt portfolio into AES-256-GCM vault whenever unlocked holdings/cash change
    if (isTerminalUnlocked && vaultSession) {
      encryptPortfolioWithSession(
        vaultSession,
        {
          holdings,
          cashReserveIdr,
          capitalIdr
        },
        activeRepoScope
      )
        .then((nextVault) => {
          setSecurityVault(nextVault);
          saveLocalSecurityVault(nextVault, activeRepoScope);
        })
        .catch(() => {
          // ignore
        });
    }
  }, [
    holdings,
    cashReserveIdr,
    rebalanceBufferPct,
    capitalIdr,
    isTerminalUnlocked,
    vaultSession,
    activeRepoScope
  ]);

  // Handlers that update portfolio/screener and auto-push to GitHub if enabled
  const handleUpdateHoldingsWithCloud = (nextHoldings: PortfolioHolding[]) => {
    setHoldings(nextHoldings);
    setLastCacheSavedAt(formatFullIndonesianDateTime(new Date()));
    if (isGitHubCloudConfigured(githubConfig) && githubConfig.autoSyncOnEdit) {
      const bundle = buildCloudBundle(nextHoldings, undefined, undefined, undefined);
      handlePushToGitHub(githubConfig, bundle, true);
    }
  };

  const handleUpdateCashWithCloud = (nextCash: number) => {
    setCashReserveIdr(nextCash);
    setLastCacheSavedAt(formatFullIndonesianDateTime(new Date()));
    if (isGitHubCloudConfigured(githubConfig) && githubConfig.autoSyncOnEdit) {
      const bundle = buildCloudBundle(undefined, nextCash, undefined, undefined);
      handlePushToGitHub(githubConfig, bundle, true);
    }
  };

  const handleUpdateRebalanceBuffer = (nextBuffer: number) => {
    setRebalanceBufferPct(nextBuffer);
    const reranked = rankUniverseWithBuffer(stocks, nextBuffer);
    setStocks(reranked);
    setLastCacheSavedAt(formatFullIndonesianDateTime(new Date()));
    if (isGitHubCloudConfigured(githubConfig) && githubConfig.autoSyncOnEdit) {
      const bundle = buildCloudBundle(undefined, undefined, reranked, nextBuffer);
      handlePushToGitHub(githubConfig, bundle, true);
    }
  };

  // Switch between Live Real-Time and 3 Simulated Market Regimes (TENANG, WASPADA, VOLATIL)
  const handleSelectSimulatedRegime = (nextMode: SimRegimeMode) => {
    setSimRegimeMode(nextMode);
    const nextMacro =
      nextMode === 'TENANG'
        ? CALM_GLOBAL_MACRO
        : nextMode === 'WASPADA'
        ? CAUTION_GLOBAL_MACRO
        : nextMode === 'VOLATIL'
        ? VOLATILE_GLOBAL_MACRO
        : DEFAULT_GLOBAL_MACRO;

    const nextRets =
      nextMode === 'TENANG'
        ? CALM_IHSG_30D_RETURNS
        : nextMode === 'WASPADA'
        ? CAUTION_IHSG_30D_RETURNS
        : nextMode === 'VOLATIL'
        ? REAL_IHSG_30D_RETURNS
        : liveIhsgReturns;

    const nextQuote =
      nextMode === 'TENANG'
        ? { lastPrice: 5180.25, change1D: 0.85 }
        : nextMode === 'WASPADA'
        ? { lastPrice: 5095.60, change1D: -0.24 }
        : nextMode === 'VOLATIL'
        ? { lastPrice: 4890.15, change1D: -2.18 }
        : liveIhsgQuote;

    setMacroIndicators(nextMacro);
    const nextRegime = computeMarketRegime(
      nextRets,
      thresholdAnnVol,
      nextMacro,
      nextQuote,
      nextMode
    );
    setRegime(nextRegime);
    setDataSourceLabel(
      nextMode === 'TENANG'
        ? 'Mode: Simulasi Sentimen Tenang'
        : nextMode === 'WASPADA'
        ? 'Mode: Simulasi Sentimen Waspada'
        : nextMode === 'VOLATIL'
        ? 'Mode: Simulasi Uji Stres Volatil'
        : isGitHubCloudConfigured(githubConfig)
        ? `GitHub Cloud: ${githubConfig.owner}/${githubConfig.repo}`
        : 'Feed: Yahoo Finance Spark Batch'
    );
  };

  const handleUpdateThreshold = (newThreshold: number) => {
    setThresholdAnnVol(newThreshold);
    const nextRets =
      simRegimeMode === 'TENANG'
        ? CALM_IHSG_30D_RETURNS
        : simRegimeMode === 'WASPADA'
        ? CAUTION_IHSG_30D_RETURNS
        : simRegimeMode === 'VOLATIL'
        ? REAL_IHSG_30D_RETURNS
        : liveIhsgReturns;
    const nextQuote =
      simRegimeMode === 'TENANG'
        ? { lastPrice: 5180.25, change1D: 0.85 }
        : simRegimeMode === 'WASPADA'
        ? { lastPrice: 5095.60, change1D: -0.24 }
        : simRegimeMode === 'VOLATIL'
        ? { lastPrice: 4890.15, change1D: -2.18 }
        : liveIhsgQuote;
    const nextRegime = computeMarketRegime(
      nextRets,
      newThreshold,
      macroIndicators,
      nextQuote,
      simRegimeMode
    );
    setRegime(nextRegime);
  };

  /**
   * Unified Single Master Sync Button Handler
   * 3-Tier Smart Hybrid Sync Architecture:
   * - Fetches IHSG (^JKSE), 8 Global Macro indicators, active portfolio holdings, and top liquid Screener/Barbell leaders
   *   in 2–3 polite Yahoo Spark batch requests (< 1.5s, 60s TTL cache, 100% anti-block).
   * - Any additional single ticker is micro-synced on-demand on search, row refresh, or Inspect click.
   */
  const handleMasterSyncAll = async (
    silent: boolean = false,
    overrideStockList?: StockMetrics[]
  ) => {
    const targetStocks = overrideStockList ?? stocks;
    const priorityHoldingTickers = holdings.map((h) => h.ticker);
    setIsMasterSyncing(true);
    setIsLoadingNews(true);
    setSyncStatusLabel('Syncing IHSG (^JKSE), Makro & Saham Utama...');

    try {
      const [marketResult, liveNews] = await Promise.all([
        refreshLiveGlobalMacroAndIhsg(
          macroIndicators,
          targetStocks,
          (_syncedCount, _totalCount, tickerLabel) => {
            setSyncStatusLabel(`Syncing ${tickerLabel}...`);
          },
          true,
          priorityHoldingTickers,
          liveIhsgQuote,
          liveIhsgReturns
        ),
        fetchLiveFinancialNewsRss(DEFAULT_NEWS_SENTIMENT)
      ]);

      const {
        updatedMacro,
        ihsgReturns30D,
        liveIhsgQuote: fetchedQuote,
        updatedStocks,
        fullTimestampStr
      } = marketResult;

      const rerankedStocks = rankUniverseWithBuffer(updatedStocks, rebalanceBufferPct);
      setMacroIndicators(updatedMacro);
      setStocks(rerankedStocks);
      setNewsItems(liveNews);

      const activeQuote = fetchedQuote || liveIhsgQuote;
      const activeRets = ihsgReturns30D || liveIhsgReturns;
      setLiveIhsgQuote(activeQuote);
      setLiveIhsgReturns(activeRets);
      setSimRegimeMode('LIVE');

      const nextRegime = computeMarketRegime(
        activeRets,
        thresholdAnnVol,
        updatedMacro,
        activeQuote,
        'LIVE'
      );
      setRegime(nextRegime);

      setLastCacheSavedAt(fullTimestampStr);
      setLastFullSyncDateTime(fullTimestampStr);

      if (isGitHubCloudConfigured(githubConfig) && githubConfig.autoSyncOnEdit) {
        const nextBundle = buildCloudBundle(
          undefined,
          undefined,
          rerankedStocks,
          undefined,
          undefined,
          updatedMacro,
          activeQuote,
          activeRets
        );
        handlePushToGitHub(githubConfig, nextBundle, true);
      }

      if (!silent) {
        const activeQuotedCount = rerankedStocks.filter((s) => s.lastPrice > 0).length;
        const liquidCount = rerankedStocks.filter(
          (s) => s.isLiquid !== false && s.lastPrice >= 68
        ).length;
        const illiquidCount = rerankedStocks.length - liquidCount;
        Swal.fire({
          icon: 'success',
          title: '✓ Sinkronisasi Live Yahoo Finance Selesai (3-Tier Smart Sync)',
          html: `
            <div style="text-align:left;font-size:12.5px;line-height:1.65;color:#374151;">
              <div><strong>Waktu Update Sistem:</strong> ${fullTimestampStr}</div>
              <div><strong>IHSG (^JKSE):</strong> ${activeQuote.lastPrice.toLocaleString('id-ID', {
                minimumFractionDigits: 2
              })} (${activeQuote.change1D >= 0 ? '+' : ''}${activeQuote.change1D.toFixed(2)}%)</div>
              <div><strong>Cakupan 3-Tier Smart Sync:</strong> ✓ <strong>IHSG (^JKSE) + 8 Indikator Makro</strong> · ✓ <strong>Portofolio &amp; Top 36 Saham Utama Live</strong> · ✓ <strong>${rerankedStocks.length} Emiten JCI Siap</strong></div>
              <div><strong>Status Likuiditas Universe:</strong> ${activeQuotedCount} Aktif · <strong>${liquidCount} Saham Likuid</strong> · <span style="color:#9E2A2B;font-weight:700;">${illiquidCount} Saham Gocap/Suspensi Diblokir</span></div>
              <div style="margin-top:6px;padding:6px 8px;background:#FAF9F6;border:1px solid #E4E2DD;border-radius:2px;font-size:11.5px;color:#0D5C46;">
                ⚡ <strong>Anti-Block &amp; On-Demand Micro-Sync Aktif:</strong> Dilengkapi cache memori 60 detik serta penarikan instan per-ticker saat Anda mencari kode saham 4 huruf, menekan ikon refresh baris (↻), atau membuka <strong>Inspect</strong>.
              </div>
            </div>
          `,
          confirmButtonColor: '#D97706'
        });
      }
    } finally {
      setIsMasterSyncing(false);
      setIsLoadingNews(false);
      setSyncStatusLabel(null);
    }
  };

  // Load Full BEI Universe instantaneously without heavy network batching
  const handleLoadIdx100Universe = () => {
    const idx100 = buildIdx100StockUniverse(rebalanceBufferPct);
    setStocks(idx100);
    setLastCacheSavedAt(formatFullIndonesianDateTime(new Date()));
  };

  // Enforce Security Gate lock if browser restores page from Back-Forward Cache (BFCache)
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setVaultSession(null);
        setIsTerminalUnlocked(false);
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // On initial mount: hydrate from GitHub Cloud / static snapshot, then immediately run lightweight Tier-1 live sync
  // so IHSG (^JKSE) and priority stocks always reflect actual Yahoo Finance live prices.
  useEffect(() => {
    const initSync = async () => {
      const cfg = loadGitHubCloudConfig();
      const scope = getActiveRepoScope(cfg);
      if (isGitHubCloudConfigured(cfg)) {
        await handlePullFromGitHub(cfg, true);
      } else {
        const candidatePaths = [
          `./data/nostradamus_cloud_state.json?t=${Date.now()}`,
          `./static-market-snapshot.json?t=${Date.now()}`
        ];
        for (const path of candidatePaths) {
          try {
            const res = await fetch(path, { cache: 'no-store' });
            if (res.ok) {
              const snap = (await res.json()) as { encryptedVault?: EncryptedPortfolioVault };
              if (snap?.encryptedVault && isVaultMatchingRepoScope(snap.encryptedVault, scope)) {
                setSecurityVault((prev) => {
                  if (!prev || prev.isDefaultPassphrase === true) {
                    saveLocalSecurityVault(snap.encryptedVault!, scope);
                    return snap.encryptedVault!;
                  }
                  return prev;
                });
                break;
              }
            }
          } catch {
            // ignore static snapshot fetch fallback error
          }
        }
      }
      // Run background Tier-1 live sync so IHSG (^JKSE) and priority stocks never stay on stale cached prices
      await handleMasterSyncAll(true);
    };
    initSync();
  }, []);

  const handleAddStock = (newStock: StockMetrics) => {
    setStocks((prev) => {
      const filtered = prev.filter((s) => s.ticker !== newStock.ticker);
      const next = rankUniverseWithBuffer([newStock, ...filtered], rebalanceBufferPct);
      if (isGitHubCloudConfigured(githubConfig) && githubConfig.autoSyncOnEdit) {
        const bundle = buildCloudBundle(undefined, undefined, next, undefined);
        handlePushToGitHub(githubConfig, bundle, true);
      }
      return next;
    });
  };

  const handleRemoveStock = (ticker: string) => {
    setStocks((prev) => {
      const next = rankUniverseWithBuffer(
        prev.filter((s) => s.ticker !== ticker),
        rebalanceBufferPct
      );
      if (isGitHubCloudConfigured(githubConfig) && githubConfig.autoSyncOnEdit) {
        const bundle = buildCloudBundle(undefined, undefined, next, undefined);
        handlePushToGitHub(githubConfig, bundle, true);
      }
      return next;
    });
  };

  const handleResetUniverse = () => {
    const defaultList = buildIdx100StockUniverse(rebalanceBufferPct);
    setStocks(defaultList);
    handleMasterSyncAll(true, defaultList);
  };

  const handleToggleHscFlag = (ticker: string, currentlyFlagged: boolean) => {
    toggleManualHscTicker(ticker, currentlyFlagged);
    setStocks((prev) => {
      const next = rankUniverseWithBuffer(prev, rebalanceBufferPct);
      if (isGitHubCloudConfigured(githubConfig) && githubConfig.autoSyncOnEdit) {
        const bundle = buildCloudBundle(undefined, undefined, next, undefined);
        handlePushToGitHub(githubConfig, bundle, true);
      }
      return next;
    });
  };

  const handleExportBackupJson = () => {
    const bundle = buildCloudBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nostradamus_cloud_state_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportBackupJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result || '{}'));
        const nextStocks = parsed.stocks || parsed.screenerCache?.stocks;
        const nextHoldings = parsed.holdings || parsed.activePortfolio?.holdings;
        const nextCash =
          parsed.cashReserveIdr ?? parsed.activePortfolio?.cashReserveIdr;

        if (Array.isArray(nextStocks) && nextStocks.length > 0) {
          setStocks(rankUniverseWithBuffer(nextStocks, rebalanceBufferPct));
        }
        if (Array.isArray(nextHoldings)) {
          setHoldings(nextHoldings);
        }
        if (typeof nextCash === 'number') {
          setCashReserveIdr(nextCash);
        }
        Swal.fire({
          icon: 'success',
          title: 'File JSON Berhasil Dimuat',
          text: 'Data Screener & Portofolio berhasil dipulihkan.',
          confirmButtonColor: '#D97706'
        });
      } catch {
        Swal.fire({
          icon: 'error',
          title: 'Format JSON Tidak Valid',
          text: 'Pastikan file .JSON berasal dari Nostradamus Quant Terminal.',
          confirmButtonColor: '#D97706'
        });
      }
    };
    reader.readAsText(file);
  };

  const handleResetCacheAndPortfolio = () => {
    localStorage.removeItem(SCREENER_CACHE_KEY);
    localStorage.removeItem(PORTFOLIO_CACHE_KEY);
    const defaultList = buildIdx100StockUniverse(40);
    setStocks(defaultList);
    setHoldings(DEFAULT_USER_PORTFOLIO_HOLDINGS);
    setCashReserveIdr(15000000);
    setRebalanceBufferPct(40);
    handleMasterSyncAll(true, defaultList);
    Swal.fire({
      icon: 'info',
      title: 'Portofolio & Screener Direset',
      text: 'Data dikembalikan ke konfigurasi awal + Buffer 40% dan disinkronkan ulang.',
      confirmButtonColor: '#D97706'
    });
  };

  // Strategy Execution Memo Modal
  const handleGenerateStrategyModal = (
    customCap?: number,
    picksPerSleeve: number = 4,
    selectionMode: 'LIVE_FACTOR_LEADER' | 'TOP_GAINERS_MOMENTUM' | 'SECTOR_ROTATION' = 'LIVE_FACTOR_LEADER'
  ) => {
    const activeCap = customCap ?? capitalIdr;
    const isVol = regime.status === 'VOLATIL';

    const analytics = computeOptimalHRPBarbellPortfolio(
      stocks,
      regime,
      activeCap,
      picksPerSleeve,
      selectionMode
    );
    const defPositions = analytics.positions.filter((p) => p.basket === 'DEFENSIVE');
    const aggPositions = analytics.positions.filter((p) => p.basket === 'AGGRESSIVE');

    const defRowsHtml = defPositions
      .map(
        (pos) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #E4E2DD;font-size:12px;font-variant-numeric:tabular-nums;">
          <span><strong style="color:#D97706;">${pos.stock.ticker}</strong> @ Rp ${pos.stock.lastPrice.toLocaleString('id-ID')} · Bobot ${pos.totalPortfolioWeightPct.toFixed(1)}% (<span style="color:${pos.stock.change1D >= 0 ? '#0D5C46' : '#9E2A2B'};font-weight:700;">1D ${pos.stock.change1D >= 0 ? '+' : ''}${pos.stock.change1D.toFixed(2)}%</span> · <span style="color:${pos.stock.return30D >= 0 ? '#0D5C46' : '#9E2A2B'};font-weight:700;">30D ${pos.stock.return30D >= 0 ? '+' : ''}${pos.stock.return30D.toFixed(2)}%</span>)</span>
          <span><strong>${pos.lots.toLocaleString('id-ID')} Lot</strong> · Rp ${pos.allocatedIdr.toLocaleString('id-ID')}</span>
        </div>`
      )
      .join('');

    const aggRowsHtml = aggPositions
      .map(
        (pos) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #E4E2DD;font-size:12px;font-variant-numeric:tabular-nums;">
          <span><strong style="color:#D97706;">${pos.stock.ticker}</strong> @ Rp ${pos.stock.lastPrice.toLocaleString('id-ID')} · Bobot ${pos.totalPortfolioWeightPct.toFixed(1)}% (<span style="color:${pos.stock.change1D >= 0 ? '#0D5C46' : '#9E2A2B'};font-weight:700;">1D ${pos.stock.change1D >= 0 ? '+' : ''}${pos.stock.change1D.toFixed(2)}%</span> · <span style="color:${pos.stock.return30D >= 0 ? '#0D5C46' : '#9E2A2B'};font-weight:700;">30D ${pos.stock.return30D >= 0 ? '+' : ''}${pos.stock.return30D.toFixed(2)}%</span>)</span>
          <span><strong>${pos.lots.toLocaleString('id-ID')} Lot</strong> · Rp ${pos.allocatedIdr.toLocaleString('id-ID')}</span>
        </div>`
      )
      .join('');

    Swal.fire({
      title: `Memo Eksekusi Portofolio Multifaktor + Buffer ${rebalanceBufferPct}%`,
      width: 650,
      html: `
        <div style="text-align:left;font-size:12.5px;line-height:1.5;color:#111315;">
          <div style="padding:12px;background:#FAF9F6;border:1px solid #E4E2DD;margin-bottom:12px;">
            <div style="font-size:10px;font-weight:700;color:#6b7280;">
              KEPUTUSAN ALOKASI BERBASIS SENTIMEN & SKALA VOLATILITAS (${lastFullSyncDateTime})
            </div>
            <div style="font-weight:700;font-size:14px;color:${isVol ? '#9E2A2B' : '#0D5C46'};margin-top:2px;">
              Sentimen ${regime.status} · IHSG ${regime.ihsgLastPrice.toLocaleString('id-ID')} · Vol 30D ${regime.annualizedVol30D.toFixed(2)}%
            </div>
            <div style="font-size:11.5px;color:#4b5563;margin-top:4px;">
              Skala Eksposur Ekuitas: <strong>${analytics.equityExposureWeightPct}% Saham Multifaktor</strong> vs <strong>${analytics.cashReserveWeightPct}% Cadangan Kas (Rp ${analytics.cashReserveTargetIdr.toLocaleString('id-ID')})</strong>
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-size:11px;font-weight:700;color:#0D5C46;margin-bottom:4px;">
              1. Keranjang Low-Volatility & Value Core (55% dari Porsi Ekuitas)
            </div>
            ${defRowsHtml}
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-size:11px;font-weight:700;color:#0284C7;margin-bottom:4px;">
              2. Keranjang Momentum Live & Size Alpha (45% dari Porsi Ekuitas)
            </div>
            ${aggRowsHtml}
          </div>

          <div style="padding:8px 12px;background:#EFF6FF;border:1px solid #BAE6FD;font-size:11px;color:#0284C7;">
            <strong>Aturan Rebalancing Buffer ${rebalanceBufferPct}%:</strong> Jangan menjual saham yang sudah ada di portofolio Anda selama peringkat komposit 4-faktornya masih berada di Top ${rebalanceBufferPct}% untuk menghemat komisi broker BEI.
          </div>
        </div>
      `,
      confirmButtonText: 'Tutup Memo',
      confirmButtonColor: '#D97706'
    });
  };

  const cloudConfigured = isGitHubCloudConfigured(githubConfig);

  if (!isTerminalUnlocked) {
    return (
      <TerminalSecurityGate
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        existingVault={securityVault}
        repoScope={activeRepoScope}
        initialSensitivePayload={{
          holdings,
          cashReserveIdr,
          capitalIdr
        }}
        onUnlockSuccess={(decryptedPayload, session, vault) => {
          setHoldings(decryptedPayload.holdings);
          setCashReserveIdr(decryptedPayload.cashReserveIdr);
          setCapitalIdr(decryptedPayload.capitalIdr);
          setVaultSession(session);
          setSecurityVault(vault);
          saveLocalSecurityVault(vault, activeRepoScope);
          setIsTerminalUnlocked(true);
        }}
      />
    );
  }

  return (
    <div
      className={
        themeMode === 'dark'
          ? 'theme-dark min-h-screen flex flex-col bg-[#090C10] text-[#E5E7EB]'
          : 'theme-light min-h-screen flex flex-col bg-[#F4F5F7] text-[#111315]'
      }
    >
      {/* Unified Sticky Top Shell: Header + Global Macro Wire + Sticky Sub-Toolbar (Sentimen Pasar .. Daylight/Dark Mode) */}
      <div className="sticky top-0 z-40 w-full">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6">
          <div className="shadow-xs">
            <Header
              activeTab={activeTab}
              onSelectTab={(tab) => {
                setActiveTab(tab);
                setShowDeployKitModal(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenCloudModal={() => setIsCloudModalOpen(true)}
              isCloudConfigured={cloudConfigured}
              lastFullSyncDateTime={lastFullSyncDateTime}
              syncedCount={liveSyncedStockCount}
              totalStockCount={stocks.length}
              isMasterSyncing={isMasterSyncing}
              syncStatusLabel={syncStatusLabel}
              onMasterSyncAll={() => handleMasterSyncAll(false)}
            />

            {/* Running Text Global Macro Ticker Tape (Zero Horizontal Scrollbar) */}
            <GlobalMacroPulse
              indicators={macroIndicators}
              macroStressScore={regime.macroStressScore}
            />

            {/* Sticky Workspace Sub-Toolbar: Sentimen Pasar .. Daylight Mode / Dark Terminal */}
            <div className="px-4 sm:px-5 py-2 bg-[#FAF9F6] border-x border-b border-[#E4E2DD] rounded-b-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <span className="font-bold text-[#D97706] bb-amber">
                  Sentimen Pasar: {regime.status}
                </span>
                <span>·</span>
                <span>Rebalancing Buffer {rebalanceBufferPct}%</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-[#0D5C46] font-bold">
                  <RefreshCw className="w-3 h-3" />
                  <span>
                    {liveSyncedStockCount}/{stocks.length} Emiten JCI
                  </span>
                </span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setIsCloudModalOpen(true)}
                  className="inline-flex items-center gap-1 font-semibold text-[#0284C7] bb-cyan hover:underline cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>
                    {cloudConfigured
                      ? `GitHub Cloud: ${githubConfig.owner}/${githubConfig.repo}`
                      : 'Setup GitHub Repo JSON Sync'}
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsChangePassModalOpen(true)}
                  title="Ubah Sandi Terminal & Enkripsi Ulang Portofolio (AES-256)"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs hover:border-[#F59E0B] transition-colors cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#D97706] bb-amber" />
                  <span>Ubah Sandi</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setVaultSession(null);
                    setIsTerminalUnlocked(false);
                  }}
                  title="Kunci Terminal Sekarang (Wajib Verifikasi Sandi Kembali)"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[#9E2A2B] bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs hover:border-[#E11D48] transition-colors cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Kunci</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleTheme}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs hover:border-[#F59E0B] transition-colors cursor-pointer"
                >
                  {themeMode === 'dark' ? (
                    <>
                      <Sun className="w-3.5 h-3.5 text-[#F59E0B]" />
                      <span className="text-[#F59E0B]">Daylight Mode</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-3.5 h-3.5 text-[#D97706]" />
                      <span className="text-[#111315]">Dark Terminal</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Container: Renders ONLY the Active Workspace Tab (Compact 8px-12px Bottom Gap to Footer) */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4 pb-2 space-y-4">
        {showDeployKitModal ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[#FFFFFF] border border-[#E4E2DD] p-4 rounded-xs">
              <div>
                <div className="text-xs font-bold text-[#D97706] bb-amber">
                  Dokumentasi Arsitektur &amp; Otomasi GitHub Actions
                </div>
                <div className="text-xs text-neutral-500">
                  Panduan teknis cron job harian &amp; unduhan paket kode sumber.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeployKitModal(false)}
                className="px-3 py-1.5 text-xs font-semibold bg-[#D97706] text-white rounded-xs cursor-pointer"
              >
                ← Kembali ke Terminal
              </button>
            </div>
            <ArchitectureVault
              activeTab={activeVaultTab}
              onSelectTab={setActiveVaultTab}
            />
          </div>
        ) : (
          <>
            {/* TAB 01: COMMAND & MULTIFACTOR ALLOCATOR */}
            {activeTab === 'command' && (
              <div className="space-y-6">
                <MarketRegimeBanner
                  regime={regime}
                  simRegimeMode={simRegimeMode}
                  dataSourceLabel={dataSourceLabel}
                  rebalanceBufferPct={rebalanceBufferPct}
                  isIhsgSynced={liveSyncedStockCount > 0}
                  isRefreshingIhsg={isMasterSyncing}
                  onRefreshIhsg={() => handleMasterSyncAll(false)}
                  onUpdateRebalanceBuffer={handleUpdateRebalanceBuffer}
                  onSelectSimRegime={handleSelectSimulatedRegime}
                  onUpdateThreshold={handleUpdateThreshold}
                  onOpenStrategyModal={() => handleGenerateStrategyModal()}
                />

                <BarbellAllocatorCard
                  regime={regime}
                  stocks={stocks}
                  capitalIdr={capitalIdr}
                  actualPortfolioNavIdr={actualPortfolioNavIdr}
                  onChangeCapital={setCapitalIdr}
                  onLoadIdx100Universe={handleLoadIdx100Universe}
                  onInspectTicker={(tk) => setGlobalInspectedTicker(tk)}
                  onTriggerSweetAlert={(cap, picks, mode) =>
                    handleGenerateStrategyModal(cap, picks, mode)
                  }
                />
              </div>
            )}

            {/* TAB 02: 4-FACTOR SCREENER (.JK) */}
            {activeTab === 'screener' && (
              <ScreeningTable
                stocks={stocks}
                rebalanceBufferPct={rebalanceBufferPct}
                regimeStatus={regime.status}
                onLoadIdx100Universe={handleLoadIdx100Universe}
                onAddStock={handleAddStock}
                onRemoveStock={handleRemoveStock}
                onResetUniverse={handleResetUniverse}
                onToggleHscFlag={handleToggleHscFlag}
                onInspectTicker={(tk) => setGlobalInspectedTicker(tk)}
              />
            )}

            {/* TAB 03: ACTIVE PORTFOLIO & GITHUB CLOUD SYNC */}
            {activeTab === 'portfolio' && (
              <ActivePortfolioManager
                stocks={stocks}
                regime={regime}
                holdings={holdings}
                cashReserveIdr={cashReserveIdr}
                rebalanceBufferPct={rebalanceBufferPct}
                lastCacheSavedAt={lastCacheSavedAt}
                githubConfig={githubConfig}
                isSyncingCloud={isSyncingCloud}
                onOpenCloudConfigModal={() => setIsCloudModalOpen(true)}
                onPullFromGitHub={() => handlePullFromGitHub(githubConfig, false)}
                onPushToGitHub={() => handlePushToGitHub(githubConfig, undefined, false)}
                onSyncForkAndRebuildUi={() => handleSyncForkAndRebuildUi(githubConfig)}
                onUpdateHoldings={handleUpdateHoldingsWithCloud}
                onUpdateCashReserve={handleUpdateCashWithCloud}
                onExportBackupJson={handleExportBackupJson}
                onImportBackupJson={handleImportBackupJson}
                onResetCacheAndPortfolio={handleResetCacheAndPortfolio}
                onInspectTicker={(tk) => setGlobalInspectedTicker(tk)}
              />
            )}

            {/* TAB 04: WALK-FORWARD OUT-OF-SAMPLE AUDIT & COLAB PYTHON */}
            {activeTab === 'backtest' && <SkepticalBacktestLab />}

            {/* TAB 05: GLOBAL MACRO & NEWS WIRE */}
            {activeTab === 'macro' && (
              <MarketNewsSentiment
                news={newsItems}
                isLoadingNews={isLoadingNews}
                stocks={stocks}
                regimeStatus={regime.status}
                onToggleHscFlag={handleToggleHscFlag}
                onInspectTicker={(tk) => setGlobalInspectedTicker(tk)}
                onStockSynced={handleAddStock}
              />
            )}
          </>
        )}
      </main>

      {/* Global On-Demand Fundamental & AI Conviction Inspector Modal (Accessible from All Tabs) */}
      {globalInspectedStockObj && (
        <EmitenFundamentalInspectorModal
          stock={globalInspectedStockObj}
          regimeStatus={regime.status}
          onClose={() => setGlobalInspectedTicker(null)}
          onToggleHscFlag={handleToggleHscFlag}
          onStockSynced={handleAddStock}
        />
      )}

      {/* GitHub Repository JSON + PAT Cloud Configuration Modal */}
      <GitHubCloudSyncModal
        isOpen={isCloudModalOpen}
        config={githubConfig}
        isSyncing={isSyncingCloud}
        onClose={() => setIsCloudModalOpen(false)}
        onSaveConfig={(nextCfg) => {
          const prevScope = getActiveRepoScope(githubConfig);
          const nextScope = getActiveRepoScope(nextCfg);
          setGithubConfig(nextCfg);
          saveGitHubCloudConfig(nextCfg);
          if (prevScope !== nextScope) {
            const scopedVault = loadLocalSecurityVault(nextScope);
            if (!scopedVault && vaultSession) {
              encryptPortfolioWithSession(
                vaultSession,
                { holdings, cashReserveIdr, capitalIdr },
                nextScope
              )
                .then((reboundVault) => {
                  setSecurityVault(reboundVault);
                  saveLocalSecurityVault(reboundVault, nextScope);
                })
                .catch(() => {
                  // ignore
                });
            } else {
              setSecurityVault(scopedVault);
            }
          }
        }}
        onPullNow={(draftCfg) => handlePullFromGitHub(draftCfg, false)}
        onPushNow={(draftCfg) => handlePushToGitHub(draftCfg, undefined, false)}
        onTestAndInit={(draftCfg) => handleTestAndInitGitHubCloud(draftCfg)}
        onTriggerWorkflow={(draftCfg) => handleTriggerGitHubWorkflow(draftCfg)}
        onSyncForkAndRebuildUi={(draftCfg) => handleSyncForkAndRebuildUi(draftCfg)}
      />

      {/* Change Passphrase Modal (Re-encrypts AES-256-GCM Portfolio Vault) */}
      <ChangePassphraseModal
        isOpen={isChangePassModalOpen}
        existingVault={securityVault}
        repoScope={activeRepoScope}
        currentPayload={{ holdings, cashReserveIdr, capitalIdr }}
        onClose={() => setIsChangePassModalOpen(false)}
        onPassphraseUpdated={(newVault, newSession) => {
          setSecurityVault(newVault);
          setVaultSession(newSession);
          saveLocalSecurityVault(newVault, activeRepoScope);
          setIsChangePassModalOpen(false);
          if (isGitHubCloudConfigured(githubConfig) && githubConfig.autoSyncOnEdit) {
            const bundle = buildCloudBundle(undefined, undefined, undefined, undefined, newVault);
            handlePushToGitHub(githubConfig, bundle, true);
          }
          Swal.fire({
            icon: 'success',
            title: 'Sandi Terminal & Brankas AES-256 Diperbarui',
            text: 'Sandi baru Anda telah aktif dan seluruh data portofolio telah dienkripsi ulang dengan kunci baru.',
            confirmButtonColor: '#D97706'
          });
        }}
      />

      {/* Compact Sticky Bottom Footer Bar: Proportional 8px-12px Distance from Main Container */}
      <footer className="sticky bottom-0 z-30 w-full mt-1 bg-transparent">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6">
          <div className="h-9 px-4 sm:px-5 bg-[#FFFFFF] border-x border-t border-[#E4E2DD] rounded-t-xs flex items-center justify-between gap-3 text-[11px] text-neutral-500 shadow-xs">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-[#111315] truncate">
                &copy; 2026 Nostradamus Quant Terminal
              </span>
            </div>
            <div className="inline-flex items-center gap-1 font-bold text-[#D97706] bb-amber whitespace-nowrap shrink-0">
              <span>Made with</span>
              <span
                className="inline-block animate-robot text-xs leading-none"
                role="img"
                aria-label="AI robot"
              >
                🤖
              </span>
              <span>by Fayadh</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
