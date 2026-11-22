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

export type FieldFreshnessStatus = 'FRESH' | 'STALE' | 'SEED_WARN' | 'ERROR';

export type SnapshotProvenanceMode = 'AUTOMATED_FETCH' | 'BOOTSTRAP_PLACEHOLDER';

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
  /** Stored in FULL shares */
  sharesOutstanding?: number;
  /** Stored in FULL IDR (converted from Miliar Rp via * 1e9 on save) */
  adtv20dIdr?: number;
  /** Optional SBN 10Y benchmark override (%) */
  sbn10YPct?: number;
  sbn10YOverridePct?: number;
}

export interface FundamentalsSnapshotTickerEntry {
  ticker: string;
  provenanceMode: SnapshotProvenanceMode;
  fetchedAt?: string;
  asOfDate?: string | null;
  fiscalPeriod?: string;
  decumulationMethod?: string;
  decumulationNote?: string;
  raw4QRevenueSum?: number | null;
  latestFullYearRevenue?: number | null;
  revenueTTM?: number | null;
  ebitTTM?: number | null;
  netIncomeTTM?: number | null;
  netIncomeYoYPct?: number | null;
  operatingProfitYoYPct?: number | null;
  equityAttributable?: number | null;
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
}

export interface FundamentalsSnapshotDocument {
  schemaVersion?: string;
  provenanceMode: SnapshotProvenanceMode;
  generatedAt: string | null;
  macroBenchmarks?: {
    sbn1YPct?: number | null;
    sbn5YPct?: number | null;
    sbn10YPct?: number | null;
    sbnAsOfDate?: string | null;
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
}

const FUNDAMENTAL_USER_OVERRIDES_STORAGE_KEY = 'nostradamus_fundamental_user_overrides_v1';
const MACRO_SBN_OVERRIDE_STORAGE_KEY = 'nostradamus_macro_sbn_override_v1';

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
    sbn10YPct: sbn,
    sbn10YOverridePct: sbn,
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
  if (
    macro &&
    macro.provenanceMode === 'AUTOMATED_FETCH' &&
    typeof macro.sbn10YPct === 'number' &&
    Number.isFinite(macro.sbn10YPct) &&
    macro.sbnAsOfDate
  ) {
    const days = computeDaysSinceIsoDate(macro.sbnAsOfDate);
    const isStale = days === null || days > 7;
    const badgeLabel = isStale
      ? `SBN STALE (${days ?? '?'}d > 7d)`
      : `SBN SNAPSHOT (${macro.sbnAsOfDate})`;
    return {
      source: 'FUNDAMENTALS_JSON',
      status: isStale ? 'STALE' : 'FRESH',
      asOfDate: macro.sbnAsOfDate,
      sbn10YOverridePct: macro.sbn10YPct,
      isWarning: isStale,
      isStaleOrProxy: isStale,
      ageDays: days,
      badgeLabel,
      warningBadgeText: badgeLabel,
      note: isStale
        ? `Kurva SBN snapshot tertanggal ${macro.sbnAsOfDate} (${days ?? '?'} hari > batas maksimal 7 hari).`
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

  let status: FieldFreshnessStatus = 'FRESH';

  if (statusOverride) {
    status = statusOverride;
  } else if (source === 'HARDCODED_SEED') {
    status = 'SEED_WARN';
  } else if (source === 'PROXY_FORMULA') {
    const days = computeDaysSinceIsoDate(asOfDate);
    status = days !== null && days <= maxAgeDays ? 'FRESH' : 'STALE';
  } else {
    const days = computeDaysSinceIsoDate(asOfDate);
    if (days !== null && days > maxAgeDays) {
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
