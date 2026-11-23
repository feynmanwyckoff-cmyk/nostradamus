/**
 * Nostradamus Quant Terminal — Forensic Data Lineage & Provenance Engine (`DataLineage`)
 *
 * Wraps every valuation and guardrail input variable in `TrackedField<T>` metadata so that
 * stale, proxy, or hardcoded seed values can never masquerade as live institutional data.
 */

export type DataSourceType =
  | 'LIVE_YAHOO_API'       // Baru ditarik langsung saat sesi berjalan
  | 'SNAPSHOT_JSON'        // Dari static-market-snapshot.json (GitHub Actions)
  | 'FUNDAMENTALS_JSON'    // Dari fundamentals-snapshot.json (GitHub Actions - AUTOMATED_FETCH)
  | 'USER_OVERRIDE'        // Diinput manual lewat tombol Kalibrasi / cloud state
  | 'PROXY_FORMULA'        // Dihitung dari proksi (misal SBN dari ^TNX + spread)
  | 'HARDCODED_SEED';      // Data statis bawaan kode / BOOTSTRAP_PLACEHOLDER (WAJIB DIBERI WARNING)

export type FieldFreshnessStatus = 'FRESH' | 'STALE' | 'SEED_WARN' | 'ANOMALY' | 'ERROR';

export type SnapshotProvenanceMode =
  | 'AUTOMATED_FETCH'
  | 'BOOTSTRAP_PLACEHOLDER'
  | 'LIVE_REALTIME_WORKER';

export interface TrackedField<T> {
  value: T;
  rawInput?: unknown;          // Nilai mentah sebelum normalisasi/decumulate
  source: DataSourceType;
  asOfDate: string | null;     // ISO YYYY-MM-DD
  fiscalPeriod?: string;       // Misal: "9M26 TTM", "FY25", "20D Avg"
  fetchedAt?: string;          // ISO timestamp
  status: FieldFreshnessStatus;
  category?: string;
  note?: string;               // Alasan jika STALE / fallback
}

export interface SyncDiagnosticEntry {
  id: string;
  timestamp: string;
  ticker: string;
  stage:
    | 'CHART_OHLCV'
    | 'QUOTE_SUMMARY_FUNDAMENTALS'
    | 'FUNDAMENTALS_SNAPSHOT'
    | 'MACRO_SBN'
    | 'NEWS_RSS';
  endpoint: string;
  proxyUsed?: string;
  payloadBytes?: number;
  httpStatus?: number;
  status: 'OK' | 'FALLBACK_USED' | 'ERROR';
  errorCode?: string;
  errorDetail?: string;
  errorMessage?: string;
  fallbackSource?: DataSourceType;
}

export interface FundamentalUserOverride {
  ticker: string;
  updatedAt?: string;          // ISO YYYY-MM-DD (auto-populated on save if omitted)
  fiscalPeriod?: string;
  overrideNote?: string;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  revenueTTM?: number;
  revenueTTMIdr?: number;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  ebitTTM?: number;
  operatingProfitTTMIdr?: number;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  netIncomeTTM?: number;
  netIncomeTTMIdr?: number;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  equityAttributable?: number;
  equityAttributableIdr?: number;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  totalDebt?: number;
  totalDebtIdr?: number;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  cashAndEquivalents?: number;
  cashAndEquivalentsIdr?: number;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  ocfTTM?: number;
  ocfTTMIdr?: number;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  capexTTM?: number;
  capexTTMIdr?: number;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  daTTM?: number;
  daTTMIdr?: number;
  /** Stored in FULL shares */
  sharesOutstanding?: number;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  adtv20dIdr?: number;
  /** Optional SBN 10Y benchmark override (%) */
  sbn10YPct?: number;
  sbn10YOverridePct?: number;
}

export interface FlowAuditMetadata {
  unifiedMethod: string;
  revMethod: string;
  ebitMethod: string;
  niMethod: string;
  ocfMethod?: string;
  capexMethod?: string;
  daMethod?: string;
  periodAligned: boolean;
  crossStatementLockTriggered?: boolean;
}

export interface FundamentalsSnapshotTickerEntry {
  ticker: string;
  provenanceMode: SnapshotProvenanceMode;
  fetchedAt?: string;
  asOfDate?: string | null;
  fiscalPeriod?: string;
  reportingCurrency?: string;
  usdIdrRateApplied?: number | null;
  ttmMethod?: string | null;
  flowAudit?: FlowAuditMetadata | null;
  decumulationMethod?: string;
  decumulationNote?: string;
  raw4QRevenueSum?: number | null;
  latestFullYearRevenue?: number | null;
  revenueTTM?: number | null;
  ebitTTM?: number | null;
  operatingProfitTTM?: number | null;
  ebitdaTTM?: number | null;
  netIncomeTTM?: number | null;
  netIncomeTTMIdr?: number | null;
  netIncomeYoYPct?: number | null;
  operatingProfitYoYPct?: number | null;
  equityAttributable?: number | null;
  equityAttributableIdr?: number | null;
  totalDebt?: number | null;
  totalAssets?: number | null;
  cashAndEquivalents?: number | null;
  sharesOutstanding?: number | null;
  ocfTTM?: number | null;
  capexTTM?: number | null;
  daTTM?: number | null;
  adtv20dIdr?: number | null;
  adtvAsOfDate?: string | null;
  adtvProvenanceMode?: SnapshotProvenanceMode;
  revenueTTMIdr?: number | null;
  daAnomaly?: boolean;
  daMethodNote?: string | null;
  missingFields?: string[];
  fxRateUsdIdr?: number | null;
  lastPrice?: number | null;
  previousClose?: number | null;
  change1D?: number | null;
  return30D?: number | null;
  closes?: number[];
  timestamps?: number[];
  beta1Y?: number | null;
  realizedAnnualVol?: number | null;
  atr20?: number | null;
  dividendYieldTTM?: number | null;
  roeAvg3YPct?: number | null;
  roeAvg5YPct?: number | null;
}

export interface FundamentalsSnapshotDocument {
  version?: string;
  schemaVersion?: string;
  provenanceMode: SnapshotProvenanceMode;
  generatedAt: string | null;
  macroBenchmarks?: {
    sbn1YPct?: number | null;
    sbn5YPct?: number | null;
    sbn10YPct?: number | null;
    sbn1YYieldPct?: number | null;
    sbn5YYieldPct?: number | null;
    sbn10YYieldPct?: number | null;
    sbnAsOfDate?: string | null;
    sbnSource?: string;
    provenanceMode?: SnapshotProvenanceMode;
    source?: DataSourceType;
    sourceLabel?: string;
    note?: string;
  };
  tickers: Record<string, FundamentalsSnapshotTickerEntry>;
}

export interface TickerDataLineageFields {
  lastPrice: TrackedField<number>;
  adtv20dIdr: TrackedField<number>;
  sharesOutstanding: TrackedField<number>;
  marketCapIdr: TrackedField<number>;
  revenueTTMIdr: TrackedField<number>;
  operatingProfitTTMIdr: TrackedField<number>;
  ebitdaTTMIdr: TrackedField<number>;
  netIncomeTTMIdr: TrackedField<number>;
  equityAttributableIdr: TrackedField<number>;
  totalDebtIdr: TrackedField<number>;
  cashAndEquivalentsIdr: TrackedField<number>;
  ocfTTMIdr: TrackedField<number>;
  capexTTMIdr: TrackedField<number>;
  daTTMIdr: TrackedField<number>;
  epsTTMIdr: TrackedField<number>;
  bvpsIdr: TrackedField<number>;
  roeTTMPct: TrackedField<number>;
  sbnSpot10YPct: TrackedField<number>;
  sbnBlendedSpotRfPct: TrackedField<number>;
  dynamicCostOfEquityPct: TrackedField<number>;
}

export interface TickerDataLineageReport {
  ticker: string;
  generatedAtIso: string;
  overallStatus: 'INSTITUTIONAL_GRADE' | 'PARTIAL_HYBRID' | 'SEED_CAPPED_GRADE_C';
  overallIntegrityStatus:
    | 'INSTITUTIONAL_GRADE'
    | 'PARTIAL_HYBRID'
    | 'SEED_FALLBACK_CAPPED';
  seedFieldCount: number;
  staleFieldCount: number;
  freshFieldCount: number;
  convictionCappedByLineage: boolean;
  convictionCapReason?: string;
  seedCapReason?: string;
  isSbnMacroProxy: boolean;
  isSbnMacroStale: boolean;
  sbnAgeDays: number | null;
  sbnMacroWarningMessage?: string;
  sbnMacroStatus: {
    isStaleOrProxy: boolean;
    ageDays: number | null;
    source: DataSourceType;
    asOfDate: string | null;
    warningBadgeText: string;
  };
  fields: TickerDataLineageFields;
  syncDiagnostics: SyncDiagnosticEntry[];
  ttmMethod?: string | null;
  daMethodNote?: string | null;
  flowAudit?: FlowAuditMetadata | null;
}

const FUNDAMENTAL_USER_OVERRIDES_STORAGE_KEY = 'nostradamus_fundamental_user_overrides_v1';
const MACRO_SBN_OVERRIDE_STORAGE_KEY = 'nostradamus_macro_sbn_override_v1';
const REALTIME_WORKER_URL_STORAGE_KEY = 'nostradamus_realtime_worker_url_v1';

/**
 * Permanent Default Production Cloudflare Worker URL for On-Demand Single-Ticker Real-Time Sync.
 * Ensures zero-config out-of-the-box execution across GitHub Pages, AI Studio Preview, and localhost.
 */
export const DEFAULT_REALTIME_WORKER_URL =
  'https://nostradamus-yahoo-proxy.feynman-wyckoff.workers.dev';

/**
 * Sanitizes a user-provided Cloudflare Worker URL:
 * - Trims whitespace
 * - Removes accidental query parameters (e.g., `/?ticker=LSIP` or `?ticker=BBCA`)
 * - Removes trailing slashes
 */
export function sanitizeRealtimeWorkerUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let cleaned = rawUrl.trim();
  if (!cleaned) return '';

  // Strip query parameters or hash if user pasted full test URL like https://...workers.dev/?ticker=LSIP
  const qIndex = cleaned.indexOf('?');
  if (qIndex !== -1) {
    cleaned = cleaned.slice(0, qIndex);
  }
  const hIndex = cleaned.indexOf('#');
  if (hIndex !== -1) {
    cleaned = cleaned.slice(0, hIndex);
  }
  cleaned = cleaned.replace(/\/+$/, '').trim();
  return cleaned;
}

/**
 * Resolves the Cloudflare Realtime Proxy Worker URL using strict 3-tier priority:
 * - Priority 1: `localStorage` override set by user in Settings / Forensic Drawer
 * - Priority 2: `import.meta.env.VITE_REALTIME_WORKER_URL`
 * - Priority 3: Permanent default fallback `'https://nostradamus-yahoo-proxy.feynman-wyckoff.workers.dev'`
 */
export function getRealtimeWorkerUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(REALTIME_WORKER_URL_STORAGE_KEY);
      if (stored && stored.trim()) {
        const sanitizedStored = sanitizeRealtimeWorkerUrl(stored);
        if (sanitizedStored) return sanitizedStored;
      }
    } catch {
      // ignore storage errors
    }
  }
  const envUrl =
    (import.meta as unknown as { env?: Record<string, string | undefined> })?.env
      ?.VITE_REALTIME_WORKER_URL || '';
  const sanitizedEnv = sanitizeRealtimeWorkerUrl(envUrl);
  if (sanitizedEnv) {
    return sanitizedEnv;
  }
  return DEFAULT_REALTIME_WORKER_URL;
}

/**
 * Persists the Cloudflare Realtime Proxy Worker URL to localStorage (sanitized).
 */
export function saveRealtimeWorkerUrl(rawUrl: string): string {
  const sanitized = sanitizeRealtimeWorkerUrl(rawUrl);
  if (typeof window !== 'undefined') {
    try {
      if (sanitized) {
        window.localStorage.setItem(REALTIME_WORKER_URL_STORAGE_KEY, sanitized);
      } else {
        window.localStorage.removeItem(REALTIME_WORKER_URL_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }
  return sanitized;
}

const syncDiagnosticsRegistry: SyncDiagnosticEntry[] = [];
const MAX_DIAGNOSTIC_ENTRIES = 180;

const latestLineageReportRegistry: Record<string, TickerDataLineageReport> = {};

/**
 * Records a structured network/parser sync diagnostic entry so no try/catch block
 * ever silently swallows an error again.
 */
export function recordSyncDiagnostic(
  entry: Omit<SyncDiagnosticEntry, 'id' | 'timestamp'>
): SyncDiagnosticEntry {
  const fullEntry: SyncDiagnosticEntry = {
    ...entry,
    ticker: (entry.ticker || 'GLOBAL').toUpperCase(),
    proxyUsed: entry.proxyUsed || (entry.endpoint.includes('allorigins') ? 'allorigins.hexlet' : 'direct/static'),
    errorMessage: entry.errorMessage || entry.errorDetail,
    errorDetail: entry.errorDetail || entry.errorMessage,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  syncDiagnosticsRegistry.unshift(fullEntry);
  if (syncDiagnosticsRegistry.length > MAX_DIAGNOSTIC_ENTRIES) {
    syncDiagnosticsRegistry.length = MAX_DIAGNOSTIC_ENTRIES;
  }
  return fullEntry;
}

export function getSyncDiagnosticsForTicker(ticker?: string): SyncDiagnosticEntry[] {
  if (!ticker) return [...syncDiagnosticsRegistry];
  const clean = ticker.trim().toUpperCase();
  return syncDiagnosticsRegistry.filter(
    (item) => item.ticker === clean || item.ticker === 'GLOBAL'
  );
}

export function clearSyncDiagnostics(ticker?: string): void {
  if (!ticker) {
    syncDiagnosticsRegistry.length = 0;
    return;
  }
  const clean = ticker.trim().toUpperCase();
  for (let i = syncDiagnosticsRegistry.length - 1; i >= 0; i--) {
    if (syncDiagnosticsRegistry[i].ticker === clean) {
      syncDiagnosticsRegistry.splice(i, 1);
    }
  }
}

function normalizeUserOverrideRecord(raw: FundamentalUserOverride): FundamentalUserOverride {
  const rev = raw.revenueTTMIdr ?? raw.revenueTTM;
  const ebit = raw.operatingProfitTTMIdr ?? raw.ebitTTM;
  const ni = raw.netIncomeTTMIdr ?? raw.netIncomeTTM;
  const eq = raw.equityAttributableIdr ?? raw.equityAttributable;
  const debt = raw.totalDebtIdr ?? raw.totalDebt;
  const cash = raw.cashAndEquivalentsIdr ?? raw.cashAndEquivalents;
  const ocf = raw.ocfTTMIdr ?? raw.ocfTTM;
  const capex = raw.capexTTMIdr ?? raw.capexTTM;
  const da = raw.daTTMIdr ?? raw.daTTM;
  const sbn = raw.sbn10YOverridePct ?? raw.sbn10YPct;
  return {
    ...raw,
    revenueTTM: rev,
    revenueTTMIdr: rev,
    ebitTTM: ebit,
    operatingProfitTTMIdr: ebit,
    netIncomeTTM: ni,
    netIncomeTTMIdr: ni,
    equityAttributable: eq,
    equityAttributableIdr: eq,
    totalDebt: debt,
    totalDebtIdr: debt,
    cashAndEquivalents: cash,
    cashAndEquivalentsIdr: cash,
    ocfTTM: ocf,
    ocfTTMIdr: ocf,
    capexTTM: capex,
    capexTTMIdr: capex,
    daTTM: da,
    daTTMIdr: da,
    sbn10YPct: sbn,
    sbn10YOverridePct: sbn,
  };
}

export interface UiNotificationBadgeMeta {
  badgeLabel: string;
  cleanMessage: string;
  pillBgHex: string;
  pillTextHex: string;
  boxBgHex: string;
  boxBorderHex: string;
  textHex: string;
  pillBgClass: string;
  pillTextClass: string;
  boxBgClass: string;
  boxBorderClass: string;
  boxTextClass: string;
  canvasBoxFillRgba: string;
  canvasBoxStrokeRgba: string;
  canvasTextHex: string;
}

/**
 * Dynamically maps each valuation / guardrail notification string to a distinct,
 * context-accurate badge label and color scheme (used across both React UI and Canvas PNG/PDF exports).
 */
export function resolveUiNotificationBadgeMeta(rawMessage: string): UiNotificationBadgeMeta {
  const msg = String(rawMessage || '').trim();
  const upper = msg.toUpperCase();

  if (upper.includes('GUARDRAIL PROVENANCE SEED_WARN')) {
    return {
      badgeLabel: 'PROVENANCE GUARD',
      cleanMessage: msg,
      pillBgHex: '#BE123C',
      pillTextHex: '#FFFFFF',
      boxBgHex: '#FFF1F2',
      boxBorderHex: '#E11D48',
      textHex: '#881337',
      pillBgClass: 'bg-[#BE123C]',
      pillTextClass: 'text-white',
      boxBgClass: 'bg-[#FFF1F2]',
      boxBorderClass: 'border-[#E11D48]/60',
      boxTextClass: 'text-[#881337]',
      canvasBoxFillRgba: 'rgba(225, 29, 72, 0.16)',
      canvasBoxStrokeRgba: 'rgba(244, 63, 94, 0.72)',
      canvasTextHex: '#FECDD3',
    };
  }

  if (upper.includes('CAPEX ANOMALY') || upper.includes('CAPEX OVERRIDE')) {
    return {
      badgeLabel: 'CAPEX OVERRIDE',
      cleanMessage: msg,
      pillBgHex: '#D97706',
      pillTextHex: '#FFFFFF',
      boxBgHex: '#FFFBEB',
      boxBorderHex: '#D97706',
      textHex: '#78350F',
      pillBgClass: 'bg-[#D97706]',
      pillTextClass: 'text-white',
      boxBgClass: 'bg-[#FFFBEB]',
      boxBorderClass: 'border-[#D97706]/60',
      boxTextClass: 'text-[#78350F]',
      canvasBoxFillRgba: 'rgba(245, 158, 11, 0.15)',
      canvasBoxStrokeRgba: 'rgba(245, 158, 11, 0.72)',
      canvasTextHex: '#FDE68A',
    };
  }

  if (upper.includes('SEED_DATA_ACTIVE')) {
    return {
      badgeLabel: 'SEED DATA WARN',
      cleanMessage: msg,
      pillBgHex: '#B45309',
      pillTextHex: '#FFFFFF',
      boxBgHex: '#FFFBEB',
      boxBorderHex: '#D97706',
      textHex: '#78350F',
      pillBgClass: 'bg-[#B45309]',
      pillTextClass: 'text-white',
      boxBgClass: 'bg-[#FFFBEB]',
      boxBorderClass: 'border-[#D97706]/60',
      boxTextClass: 'text-[#78350F]',
      canvasBoxFillRgba: 'rgba(217, 119, 6, 0.16)',
      canvasBoxStrokeRgba: 'rgba(245, 158, 11, 0.72)',
      canvasTextHex: '#FDE68A',
    };
  }

  if (upper.includes('FLOOR_INVARIANT_CLAMPED')) {
    return {
      badgeLabel: 'FLOOR CLAMPED',
      cleanMessage: msg,
      pillBgHex: '#0369A1',
      pillTextHex: '#FFFFFF',
      boxBgHex: '#F0F9FF',
      boxBorderHex: '#0284C7',
      textHex: '#0C4A6E',
      pillBgClass: 'bg-[#0369A1]',
      pillTextClass: 'text-white',
      boxBgClass: 'bg-[#F0F9FF]',
      boxBorderClass: 'border-[#0284C7]/60',
      boxTextClass: 'text-[#0C4A6E]',
      canvasBoxFillRgba: 'rgba(14, 165, 233, 0.15)',
      canvasBoxStrokeRgba: 'rgba(56, 189, 248, 0.72)',
      canvasTextHex: '#BAE6FD',
    };
  }

  if (upper.includes('CRITICAL_DATA_MISMATCH')) {
    return {
      badgeLabel: 'DATA MISMATCH P0',
      cleanMessage: msg,
      pillBgHex: '#E11D48',
      pillTextHex: '#FFFFFF',
      boxBgHex: '#FFF1F2',
      boxBorderHex: '#E11D48',
      textHex: '#881337',
      pillBgClass: 'bg-[#E11D48]',
      pillTextClass: 'text-white',
      boxBgClass: 'bg-[#FFF1F2]',
      boxBorderClass: 'border-[#E11D48]/60',
      boxTextClass: 'text-[#881337]',
      canvasBoxFillRgba: 'rgba(225, 29, 72, 0.18)',
      canvasBoxStrokeRgba: 'rgba(244, 63, 94, 0.78)',
      canvasTextHex: '#FECDD3',
    };
  }

  if (upper.includes('YTD_CUMULATIVE_SUM_SUSPECT')) {
    return {
      badgeLabel: 'YTD DECUM GUARD',
      cleanMessage: msg,
      pillBgHex: '#C2410C',
      pillTextHex: '#FFFFFF',
      boxBgHex: '#FFF7ED',
      boxBorderHex: '#EA580C',
      textHex: '#7C2D12',
      pillBgClass: 'bg-[#C2410C]',
      pillTextClass: 'text-white',
      boxBgClass: 'bg-[#FFF7ED]',
      boxBorderClass: 'border-[#EA580C]/60',
      boxTextClass: 'text-[#7C2D12]',
      canvasBoxFillRgba: 'rgba(234, 88, 12, 0.16)',
      canvasBoxStrokeRgba: 'rgba(249, 115, 22, 0.72)',
      canvasTextHex: '#FED7AA',
    };
  }

  if (upper.includes('BALANCE_SHEET_ANOMALY')) {
    return {
      badgeLabel: 'NERACA ANOMALY',
      cleanMessage: msg,
      pillBgHex: '#BE123C',
      pillTextHex: '#FFFFFF',
      boxBgHex: '#FFF1F2',
      boxBorderHex: '#E11D48',
      textHex: '#881337',
      pillBgClass: 'bg-[#BE123C]',
      pillTextClass: 'text-white',
      boxBgClass: 'bg-[#FFF1F2]',
      boxBorderClass: 'border-[#E11D48]/60',
      boxTextClass: 'text-[#881337]',
      canvasBoxFillRgba: 'rgba(225, 29, 72, 0.16)',
      canvasBoxStrokeRgba: 'rgba(244, 63, 94, 0.72)',
      canvasTextHex: '#FECDD3',
    };
  }

  if (upper.includes('ADTV_UNIT_ANOMALY')) {
    return {
      badgeLabel: 'ADTV ANOMALY',
      cleanMessage: msg,
      pillBgHex: '#B45309',
      pillTextHex: '#FFFFFF',
      boxBgHex: '#FFFBEB',
      boxBorderHex: '#D97706',
      textHex: '#78350F',
      pillBgClass: 'bg-[#B45309]',
      pillTextClass: 'text-white',
      boxBgClass: 'bg-[#FFFBEB]',
      boxBorderClass: 'border-[#D97706]/60',
      boxTextClass: 'text-[#78350F]',
      canvasBoxFillRgba: 'rgba(245, 158, 11, 0.15)',
      canvasBoxStrokeRgba: 'rgba(245, 158, 11, 0.72)',
      canvasTextHex: '#FDE68A',
    };
  }

  if (upper.includes('CATALYST_UNCONFIRMED_NON_OP') || upper.includes('CATALYST REJECTED')) {
    return {
      badgeLabel: 'CATALYST GUARD',
      cleanMessage: msg,
      pillBgHex: '#6D28D9',
      pillTextHex: '#FFFFFF',
      boxBgHex: '#F5F3FF',
      boxBorderHex: '#7C3AED',
      textHex: '#4C1D95',
      pillBgClass: 'bg-[#6D28D9]',
      pillTextClass: 'text-white',
      boxBgClass: 'bg-[#F5F3FF]',
      boxBorderClass: 'border-[#7C3AED]/60',
      boxTextClass: 'text-[#4C1D95]',
      canvasBoxFillRgba: 'rgba(139, 92, 246, 0.15)',
      canvasBoxStrokeRgba: 'rgba(167, 139, 250, 0.72)',
      canvasTextHex: '#DDD6FE',
    };
  }

  if (upper.includes('SBN') || upper.includes('RISK-FREE') || upper.includes('PROXY_FORMULA')) {
    return {
      badgeLabel: 'MACRO SBN WARN',
      cleanMessage: msg,
      pillBgHex: '#B45309',
      pillTextHex: '#FFFFFF',
      boxBgHex: '#FFFBEB',
      boxBorderHex: '#D97706',
      textHex: '#78350F',
      pillBgClass: 'bg-[#B45309]',
      pillTextClass: 'text-white',
      boxBgClass: 'bg-[#FFFBEB]',
      boxBorderClass: 'border-[#D97706]/60',
      boxTextClass: 'text-[#78350F]',
      canvasBoxFillRgba: 'rgba(245, 158, 11, 0.15)',
      canvasBoxStrokeRgba: 'rgba(245, 158, 11, 0.72)',
      canvasTextHex: '#FDE68A',
    };
  }

  return {
    badgeLabel: 'QUANT GUARDRAIL',
    cleanMessage: msg,
    pillBgHex: '#D97706',
    pillTextHex: '#FFFFFF',
    boxBgHex: '#FFFBEB',
    boxBorderHex: '#D97706',
    textHex: '#78350F',
    pillBgClass: 'bg-[#D97706]',
    pillTextClass: 'text-white',
    boxBgClass: 'bg-[#FFFBEB]',
    boxBorderClass: 'border-[#D97706]/60',
    boxTextClass: 'text-[#78350F]',
    canvasBoxFillRgba: 'rgba(245, 158, 11, 0.15)',
    canvasBoxStrokeRgba: 'rgba(245, 158, 11, 0.72)',
    canvasTextHex: '#FDE68A',
  };
}

export function resolveCalibratorFieldProvenanceBadge(
  field?: TrackedField<number> | null,
  hasExplicitUserOverride?: boolean
): {
  label: string;
  isRealtimeOrFresh: boolean;
  className: string;
  tooltip: string;
} {
  if (hasExplicitUserOverride || field?.source === 'USER_OVERRIDE') {
    return {
      label: 'USER OVERRIDE',
      isRealtimeOrFresh: true,
      className: 'bg-indigo-950/90 text-indigo-300 border-indigo-500/50',
      tooltip: field?.note || 'Data telah dikalibrasi manual oleh analis (status FRESH)',
    };
  }
  if (field?.status === 'ANOMALY') {
    return {
      label: 'ANOMALY GUARD',
      isRealtimeOrFresh: false,
      className: 'bg-amber-950/90 text-amber-300 border-amber-500/60',
      tooltip:
        field?.note ||
        'Anomali rasio akuntansi terdeteksi (mis. D&A > 18% Revenue) — klik Perbaiki untuk kalibrasi',
    };
  }
  if (field?.source === 'LIVE_YAHOO_API') {
    return {
      label: 'LIVE REALTIME',
      isRealtimeOrFresh: true,
      className: 'bg-sky-950/90 text-sky-300 border-sky-500/50',
      tooltip: field?.note || 'Data real-time langsung dari Yahoo Finance API (status FRESH)',
    };
  }
  if (field?.source === 'FUNDAMENTALS_JSON' || field?.source === 'SNAPSHOT_JSON') {
    return {
      label: 'SYNCED JSON',
      isRealtimeOrFresh: true,
      className: 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50',
      tooltip: field?.note || 'Data aktual tersinkronisasi dari snapshot JSON (status FRESH)',
    };
  }
  if (field?.source === 'PROXY_FORMULA') {
    return {
      label: 'MACRO PROXY',
      isRealtimeOrFresh: false,
      className: 'bg-amber-950/90 text-amber-300 border-amber-500/50',
      tooltip: field?.note || 'Dihitung menggunakan formula proksi makro (^TNX + spread)',
    };
  }
  return {
    label: 'HARDCODED SEED',
    isRealtimeOrFresh: false,
    className: 'bg-rose-950/90 text-rose-300 border-rose-500/60',
    tooltip: field?.note || 'Masih berasal dari katalog seed statis (SEED_WARN — perlu sync / override)',
  };
}

export function loadFundamentalUserOverrides(): Record<string, FundamentalUserOverride> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(FUNDAMENTAL_USER_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, FundamentalUserOverride> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v === 'object') {
        out[k] = normalizeUserOverrideRecord(v as FundamentalUserOverride);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function getFundamentalUserOverride(ticker: string): FundamentalUserOverride | null {
  if (!ticker) return null;
  const all = loadFundamentalUserOverrides();
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  return all[clean] || null;
}

export function saveFundamentalUserOverride(override: FundamentalUserOverride): void {
  if (typeof window === 'undefined') return;
  const clean = override.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const all = loadFundamentalUserOverrides();
  const normalized = normalizeUserOverrideRecord({
    ...all[clean],
    ...override,
    ticker: clean,
    updatedAt: override.updatedAt || new Date().toISOString().slice(0, 10),
  });
  all[clean] = normalized;
  try {
    window.localStorage.setItem(FUNDAMENTAL_USER_OVERRIDES_STORAGE_KEY, JSON.stringify(all));
    const sbnVal = normalized.sbn10YOverridePct ?? normalized.sbn10YPct;
    if (typeof sbnVal === 'number' && Number.isFinite(sbnVal) && sbnVal > 0) {
      saveMacroSbnUserOverride(sbnVal);
    }
  } catch {
    // ignore storage quota errors
  }
}

export function clearFundamentalUserOverride(ticker?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!ticker) {
      window.localStorage.removeItem(FUNDAMENTAL_USER_OVERRIDES_STORAGE_KEY);
      window.localStorage.removeItem(MACRO_SBN_OVERRIDE_STORAGE_KEY);
      return;
    }
    const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
    const all = loadFundamentalUserOverrides();
    delete all[clean];
    window.localStorage.setItem(FUNDAMENTAL_USER_OVERRIDES_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export const resetFundamentalUserOverride = clearFundamentalUserOverride;

export interface MacroSbnUserOverride {
  sbn10YPct: number;
  updatedAt: string; // YYYY-MM-DD
}

export function loadMacroSbnUserOverride(): MacroSbnUserOverride | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MACRO_SBN_OVERRIDE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.sbn10YPct === 'number' && Number.isFinite(parsed.sbn10YPct)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveMacroSbnUserOverride(sbn10YPct: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(sbn10YPct) || sbn10YPct <= 0) return;
  try {
    const payload: MacroSbnUserOverride = {
      sbn10YPct: Number(sbn10YPct.toFixed(2)),
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    window.localStorage.setItem(MACRO_SBN_OVERRIDE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/**
 * Calculates calendar days elapsed since an ISO date string (YYYY-MM-DD or full ISO).
 */
export function computeDaysSinceIsoDate(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return null;
  const diffMs = Date.now() - parsed;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Evaluates SBN Yield Curve freshness according to Rule #3:
 * - If user overridden via Calibration Modal -> USER_OVERRIDE (FRESH if <= 7 days, else STALE)
 * - If macroBenchmarks in fundamentals-snapshot.json has provenanceMode === 'AUTOMATED_FETCH' and sbnAsOfDate <= 7 days -> FUNDAMENTALS_JSON (FRESH)
 * - If sbnAsOfDate > 7 days -> STALE (Amber Warning Badge)
 * - If derived from ^TNX + IDR=X spread -> PROXY_FORMULA / STALE (Amber Warning Badge)
 */
export function evaluateSbnMacroFreshness(
  snapshotDoc?: FundamentalsSnapshotDocument | null,
  tickerOverrideSbn10Y?: number | null,
  tickerOverrideDate?: string | null
): {
  source: DataSourceType;
  status: FieldFreshnessStatus;
  asOfDate: string | null;
  sbn10YOverridePct: number | null;
  isWarning: boolean;
  isStaleOrProxy: boolean;
  ageDays: number | null;
  badgeLabel: string;
  warningBadgeText: string;
  note: string;
} {
  const globalSbnOverride = loadMacroSbnUserOverride();
  const effectiveUserSbn10Y =
    typeof tickerOverrideSbn10Y === 'number' && Number.isFinite(tickerOverrideSbn10Y) && tickerOverrideSbn10Y > 0
      ? tickerOverrideSbn10Y
      : globalSbnOverride?.sbn10YPct ?? null;
  const effectiveUserDate =
    tickerOverrideDate || globalSbnOverride?.updatedAt || new Date().toISOString().slice(0, 10);

  if (effectiveUserSbn10Y !== null) {
    const days = computeDaysSinceIsoDate(effectiveUserDate);
    const isStale = days !== null && days > 7;
    const badgeLabel = isStale
      ? `USER_OVERRIDE · STALE (${days}d > 7d)`
      : `USER_OVERRIDE · SBN 10Y ${effectiveUserSbn10Y.toFixed(2)}%`;
    return {
      source: 'USER_OVERRIDE',
      status: isStale ? 'STALE' : 'FRESH',
      asOfDate: effectiveUserDate,
      sbn10YOverridePct: effectiveUserSbn10Y,
      isWarning: isStale,
      isStaleOrProxy: isStale,
      ageDays: days,
      badgeLabel,
      warningBadgeText: badgeLabel,
      note: isStale
        ? `Override manual SBN 10Y (${effectiveUserSbn10Y.toFixed(2)}%) berusia ${days} hari (> batas 7 hari).`
        : `Kurva SBN dikalibrasi manual oleh analis (SBN 10Y = ${effectiveUserSbn10Y.toFixed(2)}%) pada ${effectiveUserDate}.`,
    };
  }

  const macro = snapshotDoc?.macroBenchmarks;
  const resolvedMacroSbn10Y =
    typeof macro?.sbn10YYieldPct === 'number' && Number.isFinite(macro.sbn10YYieldPct)
      ? macro.sbn10YYieldPct
      : typeof macro?.sbn10YPct === 'number' && Number.isFinite(macro.sbn10YPct)
      ? macro.sbn10YPct
      : null;
  if (
    macro &&
    (macro.provenanceMode === 'AUTOMATED_FETCH' ||
      macro.provenanceMode === 'LIVE_REALTIME_WORKER') &&
    resolvedMacroSbn10Y !== null &&
    macro.sbnAsOfDate
  ) {
    const days = computeDaysSinceIsoDate(macro.sbnAsOfDate);
    const isStale = days === null || days > 7;
    const isLiveWorker =
      macro.provenanceMode === 'LIVE_REALTIME_WORKER' || macro.source === 'LIVE_YAHOO_API';
    const feedName = macro.sbnSource || macro.sourceLabel || 'CNBC_SOVEREIGN_ID10Y_LIVE';
    const badgeLabel = isStale
      ? `SBN STALE (${days ?? '?'}d > 7d)`
      : isLiveWorker
      ? `SBN LIVE · ${resolvedMacroSbn10Y.toFixed(2)}% (${macro.sbnAsOfDate})`
      : `SBN SNAPSHOT (${macro.sbnAsOfDate})`;
    return {
      source: isLiveWorker ? 'LIVE_YAHOO_API' : 'FUNDAMENTALS_JSON',
      status: isStale ? 'STALE' : 'FRESH',
      asOfDate: macro.sbnAsOfDate,
      sbn10YOverridePct: resolvedMacroSbn10Y,
      isWarning: isStale,
      isStaleOrProxy: isStale,
      ageDays: days,
      badgeLabel,
      warningBadgeText: badgeLabel,
      note: isStale
        ? `Kurva SBN snapshot tertanggal ${macro.sbnAsOfDate} (${days ?? '?'} hari > batas maksimal 7 hari).`
        : isLiveWorker
        ? `Kurva SBN real-time via Cloudflare Worker (${feedName}: 10Y ${resolvedMacroSbn10Y.toFixed(2)}%) tertanggal ${macro.sbnAsOfDate}.`
        : `Kurva SBN benchmark resmi tertanggal ${macro.sbnAsOfDate}.`,
    };
  }

  const fallbackDate = macro?.sbnAsOfDate ?? null;
  const fallbackDays = computeDaysSinceIsoDate(fallbackDate);
  const badgeLabel = 'PROXY_FORMULA · ^TNX + SPREAD';
  return {
    source: 'PROXY_FORMULA',
    status: 'STALE',
    asOfDate: fallbackDate,
    sbn10YOverridePct: null,
    isWarning: true,
    isStaleOrProxy: true,
    ageDays: fallbackDays,
    badgeLabel,
    warningBadgeText: badgeLabel,
    note:
      'Kurva SBN dihitung dari formula proksi (^TNX US 10Y + IDR=X FX risk shift + baseline tenor 6.15%/6.48%/6.75%), bukan feed spot IBPA langsung.',
  };
}

export function createTrackedField<T>(params: {
  value: T;
  rawInput?: unknown;
  source: DataSourceType;
  asOfDate: string | null;
  fiscalPeriod?: string;
  fetchedAt?: string;
  maxAgeDays?: number;
  category?: string;
  statusOverride?: FieldFreshnessStatus;
  note?: string;
}): TrackedField<T> {
  const {
    value,
    rawInput,
    source,
    asOfDate,
    fiscalPeriod,
    fetchedAt,
    maxAgeDays = 180,
    category,
    statusOverride,
    note,
  } = params;

  // Audited full-year statements (FY_FALLBACK) or live Yahoo fundamentals remain valid for up to 450 days
  // so period-aligned FY statements (e.g. FY2025 on LSIP/ADMR) are never falsely penalized as STALE or SEED_WARN.
  const effectiveMaxAgeDays =
    source === 'LIVE_YAHOO_API' ||
    source === 'FUNDAMENTALS_JSON' ||
    (fiscalPeriod && /FY/i.test(fiscalPeriod))
      ? Math.max(maxAgeDays, 450)
      : maxAgeDays;

  let status: FieldFreshnessStatus = 'FRESH';

  if (statusOverride) {
    status = statusOverride;
  } else if (source === 'HARDCODED_SEED') {
    status = 'SEED_WARN';
  } else if (source === 'PROXY_FORMULA') {
    const days = computeDaysSinceIsoDate(asOfDate);
    status = days !== null && days <= effectiveMaxAgeDays ? 'FRESH' : 'STALE';
  } else {
    const days = computeDaysSinceIsoDate(asOfDate);
    if (days !== null && days > effectiveMaxAgeDays) {
      status = 'STALE';
    }
  }

  return {
    value,
    rawInput: rawInput !== undefined ? rawInput : value,
    source,
    asOfDate,
    fiscalPeriod,
    fetchedAt,
    status,
    category,
    note,
  };
}

export function registerLineageReportForDebugger(report: TickerDataLineageReport): void {
  if (!report || !report.ticker) return;
  latestLineageReportRegistry[report.ticker.toUpperCase()] = report;
}

export function getRegisteredLineageReport(ticker: string): TickerDataLineageReport | null {
  if (!ticker) return null;
  return latestLineageReportRegistry[ticker.trim().toUpperCase().replace(/\.JK$/i, '')] || null;
}

/**
 * Registers `window.debugNostradamus(ticker)` in the browser console.
 */
export function installWindowNostradamusDebugger(
  onInspectTicker?: (ticker: string) => TickerDataLineageReport | null
): void {
  if (typeof window === 'undefined') return;
  const win = window as unknown as Record<string, unknown>;
  win.debugNostradamus = (rawTicker = 'MIKA') => {
    const clean = String(rawTicker || 'MIKA').trim().toUpperCase().replace(/\.JK$/i, '');
    const report =
      (onInspectTicker ? onInspectTicker(clean) : null) ||
      getRegisteredLineageReport(clean);

    if (!report) {
      console.warn(
        `[Nostradamus Forensic Debugger] Belum ada report aktif untuk ${clean}. Buka modal inspeksi ${clean} atau panggil setelah universe dimuat.`
      );
      const diag = getSyncDiagnosticsForTicker(clean);
      if (diag.length > 0) {
        console.table(diag);
      }
      return null;
    }

    console.group(
      `%c[NOSTRADAMUS FORENSIC DATA LINEAGE] ${report.ticker} — Overall: ${report.overallStatus}`,
      'color: #38bdf8; font-weight: bold; font-size: 13px;'
    );
    console.log(
      `Summary: FRESH=${report.freshFieldCount} | STALE=${report.staleFieldCount} | SEED_WARN=${report.seedFieldCount} | Conviction Capped=${report.convictionCappedByLineage}`
    );
    if (report.convictionCapReason) {
      console.warn(`Conviction Cap Guardrail: ${report.convictionCapReason}`);
    }

    const tableRows = Object.entries(report.fields).map(([fieldKey, tf]) => ({
      field: fieldKey,
      value: tf.value,
      rawInput: typeof tf.rawInput === 'object' ? JSON.stringify(tf.rawInput) : tf.rawInput,
      source: tf.source,
      status: tf.status,
      asOfDate: tf.asOfDate || '-',
      fiscalPeriod: tf.fiscalPeriod || '-',
      note: tf.note || '-',
    }));
    console.table(tableRows);

    if (report.syncDiagnostics.length > 0) {
      console.log('%c[Sync & Network Diagnostics Log]', 'color: #fbbf24; font-weight: bold;');
      console.table(
        report.syncDiagnostics.map((d) => ({
          timestamp: d.timestamp,
          stage: d.stage,
          status: d.status,
          httpStatus: d.httpStatus ?? '-',
          payloadKB: d.payloadBytes ? `${(d.payloadBytes / 1024).toFixed(2)} kB` : '-',
          fallbackSource: d.fallbackSource || '-',
          endpoint: d.endpoint,
          errorDetail: d.errorDetail || d.errorMessage || '-',
        }))
      );
    }
    console.groupEnd();
    return report;
  };
}
