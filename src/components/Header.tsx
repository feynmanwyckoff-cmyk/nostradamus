import { WorkspaceTabId } from '../types/quant';
import { getIdxMarketSessionStatus } from '../utils/liveMarketFetcher';
import { NostradamusLogo } from './NostradamusLogo';
import { RefreshCw, Clock, Cloud, Compass } from 'lucide-react';

interface HeaderProps {
  activeTab: WorkspaceTabId;
  onSelectTab: (tab: WorkspaceTabId) => void;
  onOpenCloudModal: () => void;
  isCloudConfigured: boolean;
  lastFullSyncDateTime: string;
  syncedCount: number;
  totalStockCount: number;
  isMasterSyncing: boolean;
  syncStatusLabel?: string | null;
  onMasterSyncAll: () => void;
}

export function Header({
  activeTab,
  onSelectTab,
  onOpenCloudModal,
  isCloudConfigured,
  lastFullSyncDateTime,
  syncedCount,
  totalStockCount,
  isMasterSyncing,
  syncStatusLabel,
  onMasterSyncAll
}: HeaderProps) {
  const allSynced = totalStockCount > 0 && syncedCount >= totalStockCount;
  const sessionInfo = getIdxMarketSessionStatus();

  const workspaceTabs: { id: WorkspaceTabId; label: string; shortDesc: string }[] = [
    { id: 'command', label: '01. Command & Allocator', shortDesc: 'Sentimen & Keranjang 1–2' },
    {
      id: 'screener',
      label: '02. Multifactor Screener',
      shortDesc: `Full JCI (${totalStockCount} Saham BEI)`
    },
    { id: 'portfolio', label: '03. Portfolio & Cloud', shortDesc: 'Evaluasi & GitHub Sync' },
    { id: 'backtest', label: '04. Walk-Forward Audit', shortDesc: 'Uji Historis & Python' },
    { id: 'macro', label: '05. Macro & News Wire', shortDesc: 'Berita RI & Global Live' }
  ];

  return (
    <header className="bg-[#FFFFFF] border-x border-b border-[#E4E2DD]">
      {/* ROW 1: Brand Identity + Last Updated Timestamp (Left) & Master Sync Actions (Right) */}
      <div className="px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="#command"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('command');
            }}
            className="flex items-center gap-3 group cursor-pointer min-w-0"
          >
            <NostradamusLogo className="w-10 h-10 shrink-0 transition-transform duration-300 group-hover:rotate-12" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base sm:text-lg font-bold tracking-tight text-[#111315] whitespace-nowrap">
                  NOSTRADAMUS <span className="text-[#D97706] bb-amber">QUANT</span>
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-[#FAF9F6] border border-[#E4E2DD] text-[#0284C7] bb-cyan rounded-xs">
                  <Compass className="w-3 h-3" />
                  <span>FAYADH IDX TERMINAL</span>
                </span>
                <span
                  title={`${sessionInfo.detailLabel} — ${sessionInfo.priceBasisLabel}`}
                  className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 border rounded-xs ${
                    sessionInfo.isIntradayOpen
                      ? 'bg-[#059669]/10 border-[#059669]/40 text-[#0D5C46]'
                      : sessionInfo.state === 'ISTIRAHAT_SESI'
                      ? 'bg-[#F59E0B]/10 border-[#F59E0B]/40 text-[#D97706]'
                      : 'bg-[#FAF9F6] border-[#E4E2DD] text-neutral-600'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      sessionInfo.isIntradayOpen
                        ? 'bg-[#059669] animate-pulse'
                        : sessionInfo.state === 'ISTIRAHAT_SESI'
                        ? 'bg-[#D97706]'
                        : 'bg-neutral-400'
                    }`}
                  />
                  <span>{sessionInfo.shortBadge}</span>
                </span>
              </div>

              {/* System Price Last Updated Notification Directly Below App Title */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums mt-0.5">
                <Clock className="w-3 h-3 text-[#D97706] bb-amber shrink-0" />
                <span className="text-neutral-500 font-medium">
                  Update Harga Terakhir:
                </span>
                <span className="font-bold text-[#111315]">
                  {lastFullSyncDateTime}
                </span>
                <span className="text-neutral-400">·</span>
                <span
                  title="Seluruh 956+ emiten JCI disinkronkan secara paralel bertahap"
                  className={`inline-flex items-center gap-1 font-bold ${
                    allSynced ? 'text-[#0D5C46]' : 'text-[#D97706] bb-amber'
                  }`}
                >
                  <RefreshCw className="w-3 h-3 shrink-0" />
                  <span>
                    {isMasterSyncing && syncStatusLabel
                      ? syncStatusLabel
                      : `${syncedCount}/${totalStockCount} Emiten JCI`}
                  </span>
                </span>
              </div>
            </div>
          </a>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onMasterSyncAll}
            disabled={isMasterSyncing}
            title={`Sinkronkan seluruh ${totalStockCount} harga saham BEI/JCI, Previous Close, IHSG, Global Macro, dan Berita RSS Live secara paralel`}
            className="bb-btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#D97706] hover:bg-[#B45309] rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isMasterSyncing ? 'animate-spin' : ''}`}
            />
            <span>
              {isMasterSyncing
                ? 'SYNCING 956+ EMITEN...'
                : `SYNC ${totalStockCount} EMITEN LIVE`}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCloudModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0284C7] bb-cyan bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#0284C7] rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>
              {isCloudConfigured ? 'GitHub Cloud: Aktif' : 'GitHub Cloud'}
            </span>
          </button>
        </div>
      </div>

      {/* ROW 2: Auto-Fit 5-Column Menu Bar Below Header (Zero Horizontal Scrollbar) */}
      <div className="border-t border-[#E4E2DD] bg-[#FAF9F6]">
        <div className="px-4 sm:px-5 py-2">
          <nav
            aria-label="Menu Utama Terminal Quant"
            className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 w-full"
          >
            {workspaceTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  className={`w-full px-2.5 py-1.5 rounded-xs text-left transition-all cursor-pointer border min-w-0 ${
                    isActive
                      ? 'bg-[#D97706] text-white border-[#D97706] bb-btn-primary shadow-xs'
                      : 'bg-[#FFFFFF] text-neutral-600 border-[#E4E2DD] hover:border-[#F59E0B] hover:text-[#111315]'
                  }`}
                >
                  <div className="text-[11px] sm:text-xs font-bold truncate">
                    {tab.label}
                  </div>
                  <div
                    className={`text-[10px] truncate mt-0.5 ${
                      isActive ? 'text-white/90 font-medium' : 'text-neutral-400'
                    }`}
                  >
                    {tab.shortDesc}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
