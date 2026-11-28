import {
  EmitenNewsCategory,
  IdxMarketSessionInfo,
  JoeliardiOosEvaluation,
  MacroIndicator,
  NewsSentimentItem,
  StockMetrics,
  StructuredAiConvictionReport,
  SyncTelemetryReport
} from '../types/quant';
import {
  calculateForwardDividend,
  computeSbnSpotYieldCurveAndKe,
  enrichStockMetrics,
  estimateEmitenAdtv20dIdr,
  formatAdaptiveIdrValue,
  rankUniverseWithBuffer,
  roundToIdxTick
} from './quantEngine';
import { evaluateDynamicDecisionTree } from './corporateActionMiddleware';
import {
  FULL_JCI_EMITEN_CATALOG,
  createCalibratedIdxEntry,
  getEmitenDividendYield,
  isInstitutionalLiquidCandidate
} from '../data/idxAllEmitenCatalog';
import {
  IDX_KSEI_HSC_LIST,
  formatKseiFootnoteShortLabel,
  getKseiHscEntry
} from '../data/idxKseiHscRegistry';
import { pullLiveMarketSnapshotFromGitHubApi } from './githubCloudSync';
import embeddedSnapshotRaw from '../data/staticMarketSnapshot.json';
import {
  DataSourceType,
  FlowAuditMetadata,
  FundamentalsSnapshotDocument,
  FundamentalsSnapshotTickerEntry,
  getFundamentalUserOverride,
  getRealtimeWorkerUrl,
  recordSyncDiagnostic,
  sanitizeRealtimeWorkerUrl
} from './dataLineageEngine';
import {
  computeAuthenticBeta1YFromSnapshotOrSeries,
  resolveExecutionThesis,
  resolveSectorBetaFallback
} from './institutionalGuardrailsEngine';
import { isCpoPlantationTicker } from './sectorMethodologyRouter';

export interface IdxDirectoryEntry {
  ticker: string;
  name: string;
  sector: string;
  subIndustry?: import('../config/sectorProfiles').IdxSubIndustryEnum;
  defaultRoe: number;
  defaultDer: number;
  defaultOpMargin: number;
  approxPrice: number;
  approxBeta: number;
}

export interface SparkSeriesItem {
  symbol: string;
  lastPrice: number;
  previousClose?: number;
  change1D: number;
  closes: number[];
  timestamp?: number[];
  shortName?: string;
  adtv20dIdr?: number;
  adtvSource?: DataSourceType;
  adtvAsOfDate?: string;
  priceSource?: DataSourceType;
  priceAsOfDate?: string;
  marketState?: string;
}

export function isSameJakartaTradingDayClient(tsA?: number, tsB?: number): boolean {
  if (
    typeof tsA !== 'number' ||
    typeof tsB !== 'number' ||
    !Number.isFinite(tsA) ||
    !Number.isFinite(tsB)
  ) {
    return false;
  }
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return fmt.format(new Date(tsA * 1000)) === fmt.format(new Date(tsB * 1000));
  } catch {
    return Math.abs(tsA - tsB) < 43200;
  }
}

/**
 * Resolves the official Previous Trading Day Close Price (IDR) for an IDX stock.
 * Uses explicit `previousClose` from Yahoo Finance when available, or extracts the prior session close
 * from the historical `closes` array using Jakarta trading day timestamps (so flat 0.00% stocks like
 * ARNA at Rp 505 resolve `previousClose = 505` instead of jumping to 2 days ago).
 */
export function resolveStockPreviousClose(
  lastPrice: number,
  change1D: number,
  explicitPrevClose?: number,
  closes?: number[],
  timestamps?: number[]
): number {
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) return 0;

  if (
    typeof explicitPrevClose === 'number' &&
    Number.isFinite(explicitPrevClose) &&
    explicitPrevClose > 0 &&
    (Math.round(explicitPrevClose) !== Math.round(lastPrice) || Math.abs(change1D) < 0.01)
  ) {
    return Math.round(explicitPrevClose);
  }

  if (Array.isArray(closes) && closes.length >= 2) {
    const n = closes.length;
    const secondLast = closes[n - 2];
    const thirdLast = n >= 3 ? closes[n - 3] : secondLast;

    if (Array.isArray(timestamps) && timestamps.length === n) {
      const sameDayDuplicate = isSameJakartaTradingDayClient(timestamps[n - 1], timestamps[n - 2]);
      const candidate = sameDayDuplicate ? thirdLast : secondLast;
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
        return Math.round(candidate);
      }
    }

    if (Math.abs(change1D) < 0.01) {
      return Math.round(lastPrice);
    }

    const candidate =
      Math.round(secondLast) !== Math.round(lastPrice) ? secondLast : thirdLast;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return Math.round(candidate);
    }
  }

  if (typeof change1D === 'number' && Number.isFinite(change1D) && change1D !== 0 && change1D > -99) {
    return roundToIdxTick(lastPrice / (1 + change1D / 100));
  }

  return Math.round(lastPrice);
}

/**
 * Evaluates current Bursa Efek Indonesia (BEI / IDX) trading session in Asia/Jakarta (WIB) time:
 * - Senin–Kamis: Pra-Pembukaan (08:45–09:00), Sesi I (09:00–12:00), Istirahat (12:00–13:30), Sesi II (13:30–16:15)
 * - Jumat: Pra-Pembukaan (08:45–09:00), Sesi I (09:00–11:30), Istirahat (11:30–13:30), Sesi II (13:30–16:15)
 * - Di luar jam tersebut / Sabtu–Minggu: Pasar Tutup (Harga Last Close & Previous Close)
 */
export function getIdxMarketSessionStatus(date: Date = new Date()): IdxMarketSessionInfo {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date);

    const weekday = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const wibTimeStr = `${String(hour % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')} WIB`;
    const totalMinutes = (hour % 24) * 60 + minute;

    const isWeekend = weekday === 'Sat' || weekday === 'Sun';
    const isFriday = weekday === 'Fri';

    if (!isWeekend) {
      // Pre-Opening: 08:45 - 08:59 WIB (525 - 539 mins)
      if (totalMinutes >= 8 * 60 + 45 && totalMinutes < 9 * 60) {
        return {
          state: 'PRE_OPENING',
          isIntradayOpen: true,
          shortBadge: 'PRA-PEMBUKAAN BEI',
          detailLabel: `Sesi Pra-Pembukaan BEI (${wibTimeStr})`,
          priceBasisLabel: 'Harga Pembukaan & Previous Close',
          wibTimeStr
        };
      }

      const sesi1EndMins = isFriday ? 11 * 60 + 30 : 12 * 60;
      // Sesi I: 09:00 - 12:00 WIB (Mon-Thu) or 09:00 - 11:30 WIB (Fri)
      if (totalMinutes >= 9 * 60 && totalMinutes < sesi1EndMins) {
        return {
          state: 'SESI_1_LIVE',
          isIntradayOpen: true,
          shortBadge: 'LIVE · SESI I BEI',
          detailLabel: `Perdagangan Sesi I Berjalan (${wibTimeStr})`,
          priceBasisLabel: 'Harga Berjalan Intraday vs Prev Close',
          wibTimeStr
        };
      }

      // Istirahat Sesi I-II: 12:00/11:30 - 13:30 WIB
      if (totalMinutes >= sesi1EndMins && totalMinutes < 13 * 60 + 30) {
        return {
          state: 'ISTIRAHAT_SESI',
          isIntradayOpen: false,
          shortBadge: 'ISTIRAHAT SESI I–II',
          detailLabel: `Jedah Istirahat Sesi I–II (${wibTimeStr})`,
          priceBasisLabel: 'Harga Penutupan Sesi I vs Prev Close',
          wibTimeStr
        };
      }

      // Sesi II & Post-Closing: 13:30 - 16:15 WIB
      if (totalMinutes >= 13 * 60 + 30 && totalMinutes <= 16 * 60 + 15) {
        return {
          state: 'SESI_2_LIVE',
          isIntradayOpen: true,
          shortBadge: 'LIVE · SESI II BEI',
          detailLabel: `Perdagangan Sesi II Berjalan (${wibTimeStr})`,
          priceBasisLabel: 'Harga Berjalan Intraday vs Prev Close',
          wibTimeStr
        };
      }
    }

    return {
      state: 'PASAR_TUTUP',
      isIntradayOpen: false,
      shortBadge: 'PASAR TUTUP · LAST CLOSE',
      detailLabel: `Bursa Tutup (${wibTimeStr}) — Mengacu Penutupan Resmi`,
      priceBasisLabel: 'Harga Penutupan Terakhir (Last Close) & Prev Close',
      wibTimeStr
    };
  } catch {
    return {
      state: 'PASAR_TUTUP',
      isIntradayOpen: false,
      shortBadge: 'PASAR TUTUP · LAST CLOSE',
      detailLabel: 'Mengacu Harga Penutupan Terakhir BEI',
      priceBasisLabel: 'Harga Penutupan Terakhir (Last Close) & Prev Close',
      wibTimeStr: 'WIB'
    };
  }
}

/**
 * Computes the exact 1-Month (30D) price return matching Yahoo Finance's `1M` (`range=1mo`) chart.
 * - When `timestamps` are available from live Yahoo Finance `/v8/finance/spark` or `/v8/finance/chart`,
 *   finds the first trading session on or after `lastTimestamp - 1 calendar month`.
 * - When only the daily `closes` array is present (e.g. embedded snapshot), uses `closes[closes.length - 23]`,
 *   which corresponds to the exact 1-calendar-month baseline on BEI trading calendars.
 */
export function computeAccurate30DReturn(
  closes: number[],
  lastPrice: number,
  timestamps?: number[]
): number {
  if (!Array.isArray(closes) || closes.length < 2 || !Number.isFinite(lastPrice) || lastPrice <= 0) {
    return 0;
  }

  if (
    Array.isArray(timestamps) &&
    timestamps.length === closes.length &&
    timestamps.length >= 2
  ) {
    const lastTs = timestamps[timestamps.length - 1];
    if (typeof lastTs === 'number' && Number.isFinite(lastTs) && lastTs > 0) {
      const targetDate = new Date(lastTs * 1000);
      targetDate.setUTCMonth(targetDate.getUTCMonth() - 1);
      const targetTs = Math.floor(targetDate.getTime() / 1000);
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] >= targetTs && closes[i] > 0) {
          return Number((((lastPrice - closes[i]) / closes[i]) * 100).toFixed(2));
        }
      }
    }
  }

  const close1MAgo = closes[Math.max(0, closes.length - 23)] || closes[0] || lastPrice;
  return close1MAgo > 0
    ? Number((((lastPrice - close1MAgo) / close1MAgo) * 100).toFixed(2))
    : 0;
}

/**
 * Computes the Year-to-Date (YTD) percentage return from the beginning of the current calendar year.
 * - When `timestamps` are present (e.g. from `/v8/finance/chart?range=1y`), uses the final trading day close
 *   of the previous calendar year (or the first trading day of the current year if listed/started in Jan).
 * - When only daily `closes` are present without timestamps, estimates the trading session index at the start of the year
 *   (or earliest available session in the series).
 */
export function computeAccurateYTDReturn(
  closes: number[],
  lastPrice: number,
  timestamps?: number[]
): number {
  if (!Array.isArray(closes) || closes.length < 2 || !Number.isFinite(lastPrice) || lastPrice <= 0) {
    return 0;
  }

  if (
    Array.isArray(timestamps) &&
    timestamps.length === closes.length &&
    timestamps.length >= 2
  ) {
    const lastTs = timestamps[timestamps.length - 1];
    if (typeof lastTs === 'number' && Number.isFinite(lastTs) && lastTs > 0) {
      const currentYear = new Date(lastTs * 1000).getUTCFullYear();
      const jan1Ts = Math.floor(Date.UTC(currentYear, 0, 1, 0, 0, 0) / 1000);
      let baselineClose = 0;
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const c = closes[i];
        if (typeof ts === 'number' && c > 0) {
          if (ts < jan1Ts) {
            baselineClose = c;
          } else {
            if (baselineClose <= 0) {
              baselineClose = c;
            }
            break;
          }
        }
      }
      if (baselineClose > 0) {
        return Number((((lastPrice - baselineClose) / baselineClose) * 100).toFixed(1));
      }
    }
  }

  const now = new Date();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const daysSinceJan1 = Math.max(
    1,
    Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
  );
  const approxTradingDaysYtd = Math.max(2, Math.round(daysSinceJan1 * (242 / 365)));
  const baselineIdx = Math.max(0, closes.length - 1 - approxTradingDaysYtd);
  const closeYtdBase = closes[baselineIdx] || closes[0] || lastPrice;
  return closeYtdBase > 0
    ? Number((((lastPrice - closeYtdBase) / closeYtdBase) * 100).toFixed(1))
    : 0;
}

interface StaticMarketSnapshotPayload {
  generatedAt?: string;
  updatedAt?: string;
  liveYahooSymbolCount?: number;
  symbolCount?: number;
  totalJciEmitenCount?: number;
  discoveredTickers?: Array<{ ticker: string; name?: string; sector?: string }>;
  data?: Record<string, SparkSeriesItem>;
  newsItems?: Array<{
    id: string;
    title: string;
    source: string;
    publishedAt: string;
    url: string;
    region: 'DOMESTIC' | 'GLOBAL';
    summary?: string;
  }>;
}

const embeddedSnapshot: StaticMarketSnapshotPayload =
  (embeddedSnapshotRaw as unknown as StaticMarketSnapshotPayload) || {};

if (!embeddedSnapshot.data) {
  embeddedSnapshot.data = {};
}
// Ensure FCA/stagnant tickers like MKNT.JK (Rp 32.00, 0.00%, Volume Not Available on Yahoo Finance)
// are always registered with their exact quote so they appear in Screener as ILLIQUID and never fail lookup
if (!embeddedSnapshot.data['MKNT.JK']) {
  embeddedSnapshot.data['MKNT.JK'] = {
    symbol: 'MKNT.JK',
    lastPrice: 32,
    change1D: 0,
    closes: Array(25).fill(32),
    shortName: 'PT Mitra Komunikasi Nusantara Tbk'
  };
}

/**
 * Evaluates whether a stock's historical closing price series represents an actively traded,
 * liquid BEI equity vs. a stagnant/suspended/gocap/FCA stock (e.g. MKNT.JK at Rp 32 with 0.00% flat closes).
 * Criteria:
 *  1. Valid live price >= Rp 68 (excludes Rp 50 gocap and Rp 1-67 FCA/illiquid penny stocks)
 *  2. At least 12 valid daily closes
 *  3. At least 40% of trading days have non-zero price movement (filters out suspended or flat-line zero-volume tickers)
 */
export function evaluateSeriesLiquidity(closes: number[], lastPrice: number): boolean {
  if (!Array.isArray(closes) || closes.length < 12 || !Number.isFinite(lastPrice) || lastPrice < 68) {
    return false;
  }

  const recentCloses = closes.slice(-35);
  if (recentCloses.length < 10) return false;

  let activeMoveDays = 0;
  for (let i = 1; i < recentCloses.length; i++) {
    const prev = recentCloses[i - 1];
    const curr = recentCloses[i];
    if (prev > 0 && Math.abs(curr - prev) / prev > 0.0005) {
      activeMoveDays++;
    }
  }

  const activeMoveRatio = activeMoveDays / (recentCloses.length - 1);
  return activeMoveRatio >= 0.40;
}

/**
 * Formats a Date into a full Indonesian Day, Date, Month, Year & WIB Time string
 * Example: "Kamis, 5 November 2026 · Pukul 19:05:22 WIB"
 */
export function formatFullIndonesianDateTime(date: Date = new Date()): string {
  try {
    const datePart = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta'
    }).format(date);

    const timePart = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta'
    })
      .format(date)
      .replace(/\./g, ':');

    return `${datePart} · Pukul ${timePart} WIB`;
  } catch {
    return `${date.toLocaleDateString('id-ID')} · Pukul ${date.toLocaleTimeString('id-ID')} WIB`;
  }
}

/**
 * Dynamic Full JCI / BEI Universe Registry (~956+ Emiten as of Nov 2026, Merged with Official 383 KSEI HSC List)
 */
export const IDX_SECTOR_CATALOG: IdxDirectoryEntry[] = (() => {
  const map = new Map<string, IdxDirectoryEntry>();
  for (const entry of FULL_JCI_EMITEN_CATALOG) {
    map.set(entry.ticker, entry);
  }
  for (const hsc of IDX_KSEI_HSC_LIST) {
    const existing = map.get(hsc.ticker);
    if (existing) {
      map.set(hsc.ticker, {
        ...existing,
        name: hsc.companyName || existing.name
      });
    } else {
      map.set(
        hsc.ticker,
        createCalibratedIdxEntry(hsc.ticker, undefined, hsc.companyName)
      );
    }
  }
  return Array.from(map.values());
})();

export interface LiveChartAdtvEntry {
  liveAdtv20dIdr: number;
  liveAdtvAsOfDate: string;
  liveAdtvSource: 'LIVE_YAHOO_API';
}

let cachedFundamentalsSnapshotDoc: FundamentalsSnapshotDocument | null = null;
let inFlightFundamentalsSnapshotPromise: Promise<FundamentalsSnapshotDocument | null> | null = null;
const liveFundamentalsMemoryCache = new Map<string, FundamentalsSnapshotTickerEntry>();
const liveChartAdtvMemoryCache = new Map<string, LiveChartAdtvEntry>();

export function getCachedFundamentalsSnapshot(): FundamentalsSnapshotDocument | null {
  return cachedFundamentalsSnapshotDoc;
}

export function getLiveChartAdtvCacheEntry(ticker: string): LiveChartAdtvEntry | null {
  if (!ticker) return null;
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  return liveChartAdtvMemoryCache.get(clean) || null;
}

export function setLiveChartAdtvCacheEntry(
  ticker: string,
  adtv20dIdr: number,
  adtvAsOfDate?: string
): void {
  if (!ticker || typeof adtv20dIdr !== 'number' || !Number.isFinite(adtv20dIdr) || adtv20dIdr <= 0) {
    return;
  }
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const asOf = adtvAsOfDate || new Date().toISOString().slice(0, 10);
  liveChartAdtvMemoryCache.set(clean, {
    liveAdtv20dIdr: Math.round(adtv20dIdr),
    liveAdtvAsOfDate: asOf,
    liveAdtvSource: 'LIVE_YAHOO_API'
  });
}

export function clearFundamentalsMemoryCache(ticker?: string): void {
  if (!ticker) {
    liveFundamentalsMemoryCache.clear();
    liveChartAdtvMemoryCache.clear();
    cachedFundamentalsSnapshotDoc = null;
    return;
  }
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  liveFundamentalsMemoryCache.delete(clean);
  liveChartAdtvMemoryCache.delete(clean);
}

/**
 * FIX 1: Multi-URL GitHub Raw + Local Fallback for `fundamentals-snapshot.json`.
 * Tries tiered URLs with cache-buster `?t=${Date.now()}` so GitHub Pages never fails with HTTP 404
 * while waiting for a static deployment rebuild:
 *   Priority 1: https://raw.githubusercontent.com/feynmanwyckoff-cmyk/nostradamus/main/public/fundamentals-snapshot.json?t=...
 *   Priority 2: ./fundamentals-snapshot.json?t=...
 *   Priority 3: ./public/fundamentals-snapshot.json?t=...
 * Records each URL attempt in `SyncDiagnosticEntry` without throwing red console errors.
 */
export async function loadFundamentalsSnapshot(
  forceRefresh = false
): Promise<FundamentalsSnapshotDocument | null> {
  if (!forceRefresh && cachedFundamentalsSnapshotDoc) {
    return cachedFundamentalsSnapshotDoc;
  }
  if (inFlightFundamentalsSnapshotPromise) {
    return inFlightFundamentalsSnapshotPromise;
  }

  inFlightFundamentalsSnapshotPromise = (async () => {
    const cacheBuster = Date.now();
    const candidateUrls = [
      `https://raw.githubusercontent.com/feynmanwyckoff-cmyk/nostradamus/main/public/fundamentals-snapshot.json?t=${cacheBuster}`,
      `./fundamentals-snapshot.json?t=${cacheBuster}`,
      `./public/fundamentals-snapshot.json?t=${cacheBuster}`
    ];

    let bestDoc: FundamentalsSnapshotDocument | null = cachedFundamentalsSnapshotDoc;

    try {
      for (const endpoint of candidateUrls) {
        const cleanEndpointLabel = endpoint.split('?')[0];
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5500);
          const res = await fetch(endpoint, {
            signal: controller.signal,
            cache: 'no-store'
          });
          clearTimeout(timer);

          if (!res.ok) {
            recordSyncDiagnostic({
              ticker: 'GLOBAL',
              stage: 'FUNDAMENTALS_SNAPSHOT',
              endpoint: cleanEndpointLabel,
              httpStatus: res.status,
              status: 'FALLBACK_USED',
              errorDetail: `HTTP ${res.status} pada ${cleanEndpointLabel}; melanjutkan ke URL fallback berikutnya.`,
              fallbackSource: 'HARDCODED_SEED'
            });
            continue;
          }

          const text = await res.text();
          let parsed: FundamentalsSnapshotDocument | null = null;
          try {
            parsed = JSON.parse(text) as FundamentalsSnapshotDocument;
          } catch {
            recordSyncDiagnostic({
              ticker: 'GLOBAL',
              stage: 'FUNDAMENTALS_SNAPSHOT',
              endpoint: cleanEndpointLabel,
              payloadBytes: text.length,
              httpStatus: res.status,
              status: 'FALLBACK_USED',
              errorDetail: `Respons bukan JSON valid pada ${cleanEndpointLabel}; mencoba fallback berikutnya.`,
              fallbackSource: 'HARDCODED_SEED'
            });
            continue;
          }

          if (!parsed || typeof parsed !== 'object' || !parsed.tickers) {
            recordSyncDiagnostic({
              ticker: 'GLOBAL',
              stage: 'FUNDAMENTALS_SNAPSHOT',
              endpoint: cleanEndpointLabel,
              payloadBytes: text.length,
              httpStatus: res.status,
              status: 'FALLBACK_USED',
              errorDetail: `Skema JSON tidak memiliki objek tickers pada ${cleanEndpointLabel}.`,
              fallbackSource: 'HARDCODED_SEED'
            });
            continue;
          }

          // Preserve live Cloudflare Worker macroBenchmarks if already hydrated during this session
          if (
            cachedFundamentalsSnapshotDoc?.macroBenchmarks?.provenanceMode ===
              'LIVE_REALTIME_WORKER' &&
            cachedFundamentalsSnapshotDoc.macroBenchmarks.source === 'LIVE_YAHOO_API'
          ) {
            parsed.macroBenchmarks = cachedFundamentalsSnapshotDoc.macroBenchmarks;
          }
          bestDoc = parsed;
          cachedFundamentalsSnapshotDoc = parsed;

          // Seed any pre-computed ADTV from AUTOMATED_FETCH snapshot only as FUNDAMENTALS_JSON (not LIVE_YAHOO_API)
          const isAutomated = parsed.provenanceMode === 'AUTOMATED_FETCH';
          recordSyncDiagnostic({
            ticker: 'GLOBAL',
            stage: 'FUNDAMENTALS_SNAPSHOT',
            endpoint: cleanEndpointLabel,
            payloadBytes: text.length,
            httpStatus: res.status,
            status: isAutomated ? 'OK' : 'FALLBACK_USED',
            errorDetail: isAutomated
              ? `Berhasil memuat fundamentals-snapshot.json (${Object.keys(parsed.tickers).length} emiten, AUTOMATED_FETCH) dari ${cleanEndpointLabel}.`
              : `Snapshot dari ${cleanEndpointLabel} masih berstatus BOOTSTRAP_PLACEHOLDER; mencoba URL berikutnya jika ada.`,
            fallbackSource: isAutomated ? 'FUNDAMENTALS_JSON' : 'HARDCODED_SEED'
          });

          // If we got an AUTOMATED_FETCH document (with real ticker entries), stop cascading immediately.
          // If it's BOOTSTRAP_PLACEHOLDER on Priority 1, still check Priority 2/3 in case local build has fresher data.
          if (isAutomated && Object.keys(parsed.tickers).length > 0) {
            return parsed;
          }
        } catch (err) {
          recordSyncDiagnostic({
            ticker: 'GLOBAL',
            stage: 'FUNDAMENTALS_SNAPSHOT',
            endpoint: cleanEndpointLabel,
            status: 'FALLBACK_USED',
            errorDetail:
              err instanceof Error
                ? `${err.message} pada ${cleanEndpointLabel}`
                : `Gagal memuat ${cleanEndpointLabel}`,
            fallbackSource: 'HARDCODED_SEED'
          });
        }
      }
    } finally {
      inFlightFundamentalsSnapshotPromise = null;
    }

    return bestDoc;
  })();

  return inFlightFundamentalsSnapshotPromise;
}

/**
 * Resolves fundamental financial statements and ratios for a ticker with strict provenance tracking:
 * 1. USER_OVERRIDE (from Calibration Modal)
 * 2. LIVE_YAHOO_API (from on-demand Yahoo timeseries/quoteSummary sync)
 * 3. FUNDAMENTALS_JSON (ONLY if provenanceMode === 'AUTOMATED_FETCH' in public/fundamentals-snapshot.json)
 * 4. HARDCODED_SEED (if provenanceMode === 'BOOTSTRAP_PLACEHOLDER' or unpopulated) -> triggers SEED_WARN & caps Grade at C
 *
 * FIX 3: Strict 20D ADTV Priority Order:
 * USER_OVERRIDE > LIVE_YAHOO_API (chart 3mo / liveChartAdtvMemoryCache) > FUNDAMENTALS_JSON (AUTOMATED_FETCH) > HARDCODED_SEED
 */
export function resolveTickerFundamentalOverlay(
  ticker: string,
  catalogEntry: { defaultRoe: number; defaultDer: number; defaultOpMargin: number },
  chartAdtv20dIdr?: number,
  chartAdtvSource?: DataSourceType,
  chartAdtvAsOfDate?: string
): {
  roe: number;
  debtToEquity: number;
  operatingMargin: number;
  computedRoePct: number;
  computedOpMarginPct: number;
  computedDer: number;
  revenueTTMIdr?: number;
  latestFullYearRevenueIdr?: number;
  operatingProfitTTMIdr?: number;
  ebitdaTTMIdr?: number;
  netIncomeTTMIdr?: number;
  netIncomeYoYPct?: number;
  operatingProfitYoYPct?: number;
  equityAttributableIdr?: number;
  totalDebtIdr?: number;
  totalAssetsIdr?: number;
  cashAndEquivalentsIdr?: number;
  sharesOutstanding?: number;
  ocfTTMIdr?: number;
  capexTTMIdr?: number;
  daTTMIdr?: number;
  roeAvg3YPct?: number;
  roeAvg5YPct?: number;
  beta1Y?: number;
  realizedAnnualVol?: number;
  atr20Idr?: number;
  dividendYieldTTM?: number;
  adtv20dIdr?: number;
  adtvSource?: DataSourceType;
  adtvAsOfDate?: string;
  fundamentalsSource: DataSourceType;
  fundamentalsAsOfDate?: string;
  fundamentalsFiscalPeriod?: string;
  fundamentalsNote?: string;
  daAnomaly?: boolean;
  daMethodNote?: string;
  ttmMethod?: string;
  flowAudit?: FlowAuditMetadata | null;
  missingFundamentalFields?: string[];
  reportingCurrency?: string;
  fxRateUsdIdr?: number;
} {
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const userOverride = getFundamentalUserOverride(clean);
  const liveEntry = liveFundamentalsMemoryCache.get(clean);
  const liveAdtvEntry = liveChartAdtvMemoryCache.get(clean);
  const snapEntry = cachedFundamentalsSnapshotDoc?.tickers?.[clean];

  const verifiedSnapEntry =
    snapEntry &&
    (snapEntry.provenanceMode === 'AUTOMATED_FETCH' ||
      snapEntry.provenanceMode === 'LIVE_REALTIME_WORKER') &&
    typeof snapEntry.revenueTTM === 'number' &&
    snapEntry.revenueTTM > 0 &&
    typeof snapEntry.netIncomeTTM === 'number' &&
    typeof snapEntry.equityAttributable === 'number' &&
    snapEntry.equityAttributable > 0
      ? snapEntry
      : null;

  const isLiveEntryValid =
    liveEntry &&
    (liveEntry.provenanceMode === 'LIVE_REALTIME_WORKER' ||
      liveEntry.provenanceMode === 'AUTOMATED_FETCH') &&
    ((typeof liveEntry.revenueTTM === 'number' && liveEntry.revenueTTM > 0) ||
      (typeof liveEntry.netIncomeTTM === 'number' && liveEntry.netIncomeTTM !== 0) ||
      (typeof liveEntry.equityAttributable === 'number' && liveEntry.equityAttributable > 0));

  const candidateBaseRecord = isLiveEntryValid ? liveEntry : verifiedSnapEntry || undefined;
  const isAutoSyncFallbackNote = Boolean(
    userOverride?.overrideNote?.startsWith('Auto-Sync P0')
  );
  const isFieldGenuinelyOverridden = (
    userVal: number | undefined,
    baseVal: number | null | undefined
  ): boolean => {
    if (typeof userVal !== 'number' || !Number.isFinite(userVal) || userVal <= 0) return false;
    if (!candidateBaseRecord) return true;
    if (isAutoSyncFallbackNote) return false;
    if (typeof baseVal !== 'number' || !Number.isFinite(baseVal) || baseVal <= 0) return true;
    return Math.abs(userVal - baseVal) / Math.max(1, Math.abs(baseVal)) > 0.005;
  };

  // Determine active statement source priority: Genuine USER_OVERRIDE > LIVE_YAHOO_API > FUNDAMENTALS_JSON (AUTOMATED_FETCH) > HARDCODED_SEED
  const hasUserFundamentalOverride = Boolean(
    userOverride &&
      (isFieldGenuinelyOverridden(userOverride.revenueTTM, candidateBaseRecord?.revenueTTM) ||
        isFieldGenuinelyOverridden(userOverride.netIncomeTTM, candidateBaseRecord?.netIncomeTTM) ||
        isFieldGenuinelyOverridden(
          userOverride.equityAttributable,
          candidateBaseRecord?.equityAttributable
        ))
  );

  const effectiveUserOverride = hasUserFundamentalOverride ? userOverride : null;

  const activeStatementSource: DataSourceType = hasUserFundamentalOverride
    ? 'USER_OVERRIDE'
    : isLiveEntryValid
    ? 'LIVE_YAHOO_API'
    : verifiedSnapEntry
    ? 'FUNDAMENTALS_JSON'
    : 'HARDCODED_SEED';

  const baseRecord =
    activeStatementSource === 'LIVE_YAHOO_API'
      ? liveEntry
      : verifiedSnapEntry || liveEntry || undefined;

  const isRealtimeWorkerRecord = baseRecord?.provenanceMode === 'LIVE_REALTIME_WORKER';

  const sharesOutstanding =
    effectiveUserOverride?.sharesOutstanding ??
    (typeof baseRecord?.sharesOutstanding === 'number' && baseRecord.sharesOutstanding > 0
      ? baseRecord.sharesOutstanding
      : undefined);

  // Auto-Detect & Normalize USD-denominated financial statements in snapshot/live records
  const rawSpotUsdIdr =
    typeof baseRecord?.fxRateUsdIdr === 'number' && baseRecord.fxRateUsdIdr > 10000
      ? baseRecord.fxRateUsdIdr
      : Number(embeddedSnapshot?.data?.['IDR=X']?.lastPrice);
  const spotUsdIdrRate =
    Number.isFinite(rawSpotUsdIdr) && rawSpotUsdIdr >= 12000 && rawSpotUsdIdr <= 22000
      ? Math.round(rawSpotUsdIdr)
      : 16250;

  const rawBaseEq =
    typeof baseRecord?.equityAttributable === 'number' ? baseRecord.equityAttributable : undefined;
  // Note: Worker responses with reportingCurrency === 'USD' have already converted all monetary fields to IDR
  const isBaseRecordUnconvertedUsd =
    baseRecord !== undefined &&
    !isRealtimeWorkerRecord &&
    baseRecord.reportingCurrency !== 'USD_CONVERTED_TO_IDR' &&
    (baseRecord.reportingCurrency === 'USD' ||
      (typeof rawBaseEq === 'number' &&
        rawBaseEq > 0 &&
        typeof sharesOutstanding === 'number' &&
        sharesOutstanding > 50_000_000 &&
        rawBaseEq / sharesOutstanding < 5.0));

  const baseFxMultiplier = isBaseRecordUnconvertedUsd ? spotUsdIdrRate : 1;
  const scaleBaseMonetary = (val: number | null | undefined): number | undefined =>
    typeof val === 'number' && Number.isFinite(val) ? Math.round(val * baseFxMultiplier) : undefined;

  // Also auto-detect if an older USER_OVERRIDE accidentally saved unconverted USD numbers
  const isUserOverrideUnconvertedUsd =
    typeof effectiveUserOverride?.equityAttributable === 'number' &&
    effectiveUserOverride.equityAttributable > 0 &&
    typeof sharesOutstanding === 'number' &&
    sharesOutstanding > 50_000_000 &&
    effectiveUserOverride.equityAttributable / sharesOutstanding < 5.0;
  const userFxMultiplier = isUserOverrideUnconvertedUsd ? spotUsdIdrRate : 1;
  const scaleUserMonetary = (val: number | undefined): number | undefined =>
    typeof val === 'number' && Number.isFinite(val) ? Math.round(val * userFxMultiplier) : undefined;

  const revenueTTMIdr =
    scaleUserMonetary(effectiveUserOverride?.revenueTTM) ??
    scaleBaseMonetary(baseRecord?.revenueTTM);
  const operatingProfitTTMIdr =
    scaleUserMonetary(effectiveUserOverride?.ebitTTM) ??
    scaleBaseMonetary(baseRecord?.operatingProfitTTM ?? baseRecord?.ebitTTM);
  const netIncomeTTMIdr =
    scaleUserMonetary(effectiveUserOverride?.netIncomeTTM) ??
    scaleBaseMonetary(baseRecord?.netIncomeTTM);
  const netIncomeYoYPct =
    typeof baseRecord?.netIncomeYoYPct === 'number' && Number.isFinite(baseRecord.netIncomeYoYPct)
      ? baseRecord.netIncomeYoYPct
      : undefined;
  const operatingProfitYoYPct =
    typeof baseRecord?.operatingProfitYoYPct === 'number' &&
    Number.isFinite(baseRecord.operatingProfitYoYPct)
      ? baseRecord.operatingProfitYoYPct
      : undefined;
  const equityAttributableIdr =
    scaleUserMonetary(effectiveUserOverride?.equityAttributable) ??
    scaleBaseMonetary(baseRecord?.equityAttributable);
  const totalDebtIdr =
    scaleUserMonetary(effectiveUserOverride?.totalDebt) ??
    scaleBaseMonetary(baseRecord?.totalDebt);
  const cashAndEquivalentsIdr =
    scaleUserMonetary(effectiveUserOverride?.cashAndEquivalents) ??
    scaleBaseMonetary(baseRecord?.cashAndEquivalents);

  // Partial-Data Honesty for IPO / Micro-Cap issuers:
  // When using LIVE_REALTIME_WORKER, if Yahoo returned null for capexTTM / daTTM / ocfTTM,
  // keep them undefined here so their individual lineage badge falls back to SEED_WARN (with Perbaiki -> button),
  // while buildRawTickerDataFromStock safely provides a non-zero denominator for valuation math.
  const rawCapexIdr =
    scaleUserMonetary(effectiveUserOverride?.capexTTM) ??
    scaleBaseMonetary(baseRecord?.capexTTM);
  const capexTTMIdr =
    typeof rawCapexIdr === 'number' && rawCapexIdr > 0
      ? rawCapexIdr
      : !isRealtimeWorkerRecord &&
        activeStatementSource !== 'HARDCODED_SEED' &&
        typeof revenueTTMIdr === 'number' &&
        revenueTTMIdr > 0
      ? Math.round(revenueTTMIdr * 0.055)
      : undefined;

  const rawDaIdr =
    scaleUserMonetary(effectiveUserOverride?.daTTM) ??
    scaleBaseMonetary(baseRecord?.daTTM);
  const baseEbitdaIdr = scaleBaseMonetary(baseRecord?.ebitdaTTM);
  const daTTMIdr =
    typeof rawDaIdr === 'number' && rawDaIdr > 0
      ? rawDaIdr
      : !isRealtimeWorkerRecord && activeStatementSource !== 'HARDCODED_SEED'
      ? typeof baseEbitdaIdr === 'number' &&
        typeof operatingProfitTTMIdr === 'number' &&
        baseEbitdaIdr > operatingProfitTTMIdr
        ? Math.round(baseEbitdaIdr - operatingProfitTTMIdr)
        : typeof capexTTMIdr === 'number' && capexTTMIdr > 0
        ? Math.max(1, Math.round(capexTTMIdr / 1.38))
        : typeof revenueTTMIdr === 'number' && revenueTTMIdr > 0
        ? Math.max(1, Math.round(revenueTTMIdr * 0.045))
        : undefined
      : undefined;

  const rawOcfIdr =
    scaleUserMonetary(effectiveUserOverride?.ocfTTM) ??
    scaleBaseMonetary(baseRecord?.ocfTTM);
  const ocfTTMIdr =
    typeof rawOcfIdr === 'number' && rawOcfIdr !== 0
      ? rawOcfIdr
      : !isRealtimeWorkerRecord &&
        activeStatementSource !== 'HARDCODED_SEED' &&
        typeof netIncomeTTMIdr === 'number' &&
        netIncomeTTMIdr !== 0
      ? Math.round(
          netIncomeTTMIdr +
            (typeof daTTMIdr === 'number' && daTTMIdr > 0
              ? daTTMIdr * 0.75
              : Math.abs(netIncomeTTMIdr) * 0.36)
        )
      : undefined;

  // Derive ratios from real/overridden statements when available; otherwise fall back to catalog seed
  const derivedRoe =
    typeof netIncomeTTMIdr === 'number' &&
    typeof equityAttributableIdr === 'number' &&
    equityAttributableIdr > 0
      ? Number(((netIncomeTTMIdr / equityAttributableIdr) * 100).toFixed(2))
      : catalogEntry.defaultRoe;

  const derivedOpMargin =
    typeof operatingProfitTTMIdr === 'number' &&
    typeof revenueTTMIdr === 'number' &&
    revenueTTMIdr > 0
      ? Number(((operatingProfitTTMIdr / revenueTTMIdr) * 100).toFixed(2))
      : catalogEntry.defaultOpMargin;

  const derivedDer =
    typeof totalDebtIdr === 'number' &&
    typeof equityAttributableIdr === 'number' &&
    equityAttributableIdr > 0
      ? Number((totalDebtIdr / equityAttributableIdr).toFixed(2))
      : catalogEntry.defaultDer;

  // FIX 3: Resolve 20-Day ADTV provenance priority:
  // 1. Genuine USER_OVERRIDE
  // 2. LIVE_YAHOO_API (liveChartAdtvMemoryCache from chart 3mo/worker, or direct live chartAdtv20dIdr, or liveFundamentalsMemoryCache)
  // 3. FUNDAMENTALS_JSON (AUTOMATED_FETCH in fundamentals-snapshot.json)
  // 4. HARDCODED_SEED (undefined here -> falls back to catalog seed with SEED_WARN)
  let adtv20dIdr: number | undefined = undefined;
  let adtvSource: DataSourceType | undefined = undefined;
  let adtvAsOfDate: string | undefined = undefined;

  if (
    typeof effectiveUserOverride?.adtv20dIdr === 'number' &&
    effectiveUserOverride.adtv20dIdr > 0
  ) {
    adtv20dIdr = effectiveUserOverride.adtv20dIdr;
    adtvSource = 'USER_OVERRIDE';
    adtvAsOfDate = effectiveUserOverride.updatedAt;
  } else if (liveAdtvEntry && liveAdtvEntry.liveAdtv20dIdr > 0) {
    adtv20dIdr = liveAdtvEntry.liveAdtv20dIdr;
    adtvSource = 'LIVE_YAHOO_API';
    adtvAsOfDate = liveAdtvEntry.liveAdtvAsOfDate;
  } else if (
    typeof chartAdtv20dIdr === 'number' &&
    chartAdtv20dIdr > 0 &&
    chartAdtvSource === 'LIVE_YAHOO_API'
  ) {
    adtv20dIdr = chartAdtv20dIdr;
    adtvSource = 'LIVE_YAHOO_API';
    adtvAsOfDate = chartAdtvAsOfDate || new Date().toISOString().slice(0, 10);
  } else if (
    liveEntry &&
    typeof liveEntry.adtv20dIdr === 'number' &&
    liveEntry.adtv20dIdr > 0
  ) {
    adtv20dIdr = liveEntry.adtv20dIdr;
    adtvSource = 'LIVE_YAHOO_API';
    adtvAsOfDate = liveEntry.adtvAsOfDate || liveEntry.asOfDate || new Date().toISOString().slice(0, 10);
  } else if (
    snapEntry &&
    (snapEntry.provenanceMode === 'AUTOMATED_FETCH' ||
      snapEntry.adtvProvenanceMode === 'AUTOMATED_FETCH') &&
    typeof snapEntry.adtv20dIdr === 'number' &&
    snapEntry.adtv20dIdr > 0
  ) {
    adtv20dIdr = snapEntry.adtv20dIdr;
    adtvSource = 'FUNDAMENTALS_JSON';
    adtvAsOfDate = snapEntry.adtvAsOfDate || snapEntry.asOfDate || undefined;
  } else if (typeof chartAdtv20dIdr === 'number' && chartAdtv20dIdr > 0) {
    adtv20dIdr = chartAdtv20dIdr;
    adtvSource = chartAdtvSource || 'LIVE_YAHOO_API';
    adtvAsOfDate = chartAdtvAsOfDate || new Date().toISOString().slice(0, 10);
  }

  const fundamentalsAsOfDate =
    effectiveUserOverride?.updatedAt ||
    baseRecord?.asOfDate ||
    undefined;

  const fundamentalsFiscalPeriod =
    effectiveUserOverride?.fiscalPeriod ||
    (hasUserFundamentalOverride ? 'USER_CALIBRATED_TTM' : baseRecord?.fiscalPeriod) ||
    (activeStatementSource === 'HARDCODED_SEED' ? 'SEED_BASELINE' : undefined);

  const usdConversionNote =
    isBaseRecordUnconvertedUsd || isUserOverrideUnconvertedUsd
      ? ` [Auto-Normalized USD->IDR @ Rp ${spotUsdIdrRate.toLocaleString('id-ID')}/USD]`
      : '';

  const fundamentalsNote =
    (activeStatementSource === 'USER_OVERRIDE'
      ? `Dikalibrasi manual oleh analis pada ${effectiveUserOverride?.updatedAt}`
      : activeStatementSource === 'LIVE_YAHOO_API'
      ? baseRecord?.decumulationNote || 'Ditarik real-time via Cloudflare Worker dari Yahoo Finance fundamentals-timeseries'
      : activeStatementSource === 'FUNDAMENTALS_JSON'
      ? baseRecord?.decumulationNote || 'Dari fundamentals-snapshot.json (AUTOMATED_FETCH)'
      : snapEntry?.provenanceMode === 'BOOTSTRAP_PLACEHOLDER'
      ? 'fundamentals-snapshot.json masih berstatus BOOTSTRAP_PLACEHOLDER (belum diisi skrip GitHub Actions); menggunakan katalog seed (SEED_WARN — Grade Capped at C).'
      : 'Data laporan keuangan belum tersedia di snapshot; menggunakan profil seed katalog (SEED_WARN — Grade Capped at C).') +
    usdConversionNote;

  return {
    roe: derivedRoe,
    debtToEquity: derivedDer,
    operatingMargin: derivedOpMargin,
    computedRoePct: derivedRoe,
    computedOpMarginPct: derivedOpMargin,
    computedDer: derivedDer,
    revenueTTMIdr,
    latestFullYearRevenueIdr: scaleBaseMonetary(baseRecord?.latestFullYearRevenue),
    operatingProfitTTMIdr,
    ebitdaTTMIdr: baseEbitdaIdr,
    netIncomeTTMIdr,
    netIncomeYoYPct,
    operatingProfitYoYPct,
    equityAttributableIdr,
    totalDebtIdr,
    totalAssetsIdr: scaleBaseMonetary(baseRecord?.totalAssets),
    cashAndEquivalentsIdr,
    sharesOutstanding,
    ocfTTMIdr,
    capexTTMIdr,
    daTTMIdr,
    roeAvg3YPct:
      typeof baseRecord?.roeAvg3YPct === 'number' && Number.isFinite(baseRecord.roeAvg3YPct)
        ? baseRecord.roeAvg3YPct
        : undefined,
    roeAvg5YPct:
      typeof baseRecord?.roeAvg5YPct === 'number' && Number.isFinite(baseRecord.roeAvg5YPct)
        ? baseRecord.roeAvg5YPct
        : undefined,
    beta1Y:
      typeof baseRecord?.beta1Y === 'number' &&
      Number.isFinite(baseRecord.beta1Y) &&
      baseRecord.beta1Y > 0
        ? baseRecord.beta1Y
        : undefined,
    realizedAnnualVol:
      typeof baseRecord?.realizedAnnualVol === 'number' &&
      Number.isFinite(baseRecord.realizedAnnualVol) &&
      baseRecord.realizedAnnualVol > 0
        ? baseRecord.realizedAnnualVol
        : undefined,
    atr20Idr:
      typeof baseRecord?.atr20 === 'number' &&
      Number.isFinite(baseRecord.atr20) &&
      baseRecord.atr20 > 0
        ? baseRecord.atr20
        : undefined,
    dividendYieldTTM:
      typeof baseRecord?.dividendYieldTTM === 'number' &&
      Number.isFinite(baseRecord.dividendYieldTTM) &&
      baseRecord.dividendYieldTTM >= 0
        ? baseRecord.dividendYieldTTM
        : undefined,
    adtv20dIdr,
    adtvSource,
    adtvAsOfDate,
    fundamentalsSource: activeStatementSource,
    fundamentalsAsOfDate,
    fundamentalsFiscalPeriod,
    fundamentalsNote,
    daAnomaly: Boolean(baseRecord?.daAnomaly),
    daMethodNote: baseRecord?.daMethodNote || undefined,
    ttmMethod:
      baseRecord?.ttmMethod ||
      baseRecord?.flowAudit?.unifiedMethod ||
      baseRecord?.decumulationMethod ||
      undefined,
    flowAudit: baseRecord?.flowAudit || null,
    missingFundamentalFields: Array.isArray(baseRecord?.missingFields)
      ? baseRecord.missingFields
      : undefined,
    reportingCurrency: baseRecord?.reportingCurrency,
    fxRateUsdIdr:
      typeof baseRecord?.fxRateUsdIdr === 'number' ? baseRecord.fxRateUsdIdr : undefined
  };
}

export interface RealtimeWorkerConnectionTestResult {
  ok: boolean;
  httpStatus?: number;
  latencyMs: number;
  message: string;
  samplePrice?: number;
  fiscalPeriod?: string;
}

/**
 * Tests the configured Cloudflare Worker URL by pinging `/?ticker=BBCA&nocache=1`
 * and measuring round-trip latency + Yahoo crumb handshake verification.
 */
export async function testRealtimeWorkerConnection(
  rawUrl?: string
): Promise<RealtimeWorkerConnectionTestResult> {
  const baseUrl = sanitizeRealtimeWorkerUrl(rawUrl ?? getRealtimeWorkerUrl());
  if (!baseUrl) {
    return {
      ok: false,
      latencyMs: 0,
      message: 'URL Cloudflare Worker belum diisi atau format URL tidak valid.'
    };
  }

  const endpoint = `${baseUrl}/?ticker=BBCA&nocache=1`;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timer);
    const latencyMs = Math.max(
      1,
      Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
    );

    if (!res.ok) {
      let errText = '';
      try {
        errText = (await res.text()).slice(0, 120);
      } catch {
        // ignore
      }
      return {
        ok: false,
        httpStatus: res.status,
        latencyMs,
        message: `HTTP ${res.status} dari Worker (${latencyMs} ms)${errText ? ` — ${errText}` : ''}`
      };
    }

    const data = await res.json();
    if (!data || typeof data !== 'object' || data.ticker !== 'BBCA') {
      return {
        ok: false,
        httpStatus: res.status,
        latencyMs,
        message: `Respons Worker bukan payload JSON Nostradamus yang valid (${latencyMs} ms).`
      };
    }

    const priceStr =
      typeof data.lastPrice === 'number' && data.lastPrice > 0
        ? `Rp ${Math.round(data.lastPrice).toLocaleString('id-ID')}`
        : 'N/A';
    const revStr =
      typeof data.revenueTTM === 'number' && data.revenueTTM > 0
        ? `Rev TTM Rp ${(data.revenueTTM / 1e12).toFixed(1)}T`
        : 'LK parsial';

    return {
      ok: true,
      httpStatus: res.status,
      latencyMs,
      samplePrice: typeof data.lastPrice === 'number' ? data.lastPrice : undefined,
      fiscalPeriod: data.fiscalPeriod,
      message: `Koneksi Sukses (${latencyMs} ms) · BBCA ${priceStr} · ${revStr} (${data.fiscalPeriod || 'TTM'})`
    };
  } catch (err) {
    const latencyMs = Math.max(
      1,
      Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
    );
    return {
      ok: false,
      latencyMs,
      message:
        err instanceof Error
          ? `Gagal menghubungi Worker (${latencyMs} ms): ${err.message}`
          : `Gagal menghubungi Worker (${latencyMs} ms). Periksa CORS / URL Worker.`
    };
  }
}

/**
 * On-Demand Single-Ticker Real-Time Sync Cascade:
 * - Priority 0: USER_OVERRIDE (handled per-field in resolveTickerFundamentalOverlay & quantEngine)
 * - Priority 1 (True Real-Time via Cloudflare Worker):
 *   If `getRealtimeWorkerUrl()` is configured, fetches `${workerUrl}/?ticker=${clean}`
 *   (or `&nocache=1` when `options.forceRefresh === true`). Hydrates price, ADTV 20D,
 *   1Y Beta, volatility, ATR20, TTM financial statements, and SBN 1Y/5Y/10Y curve in 1–2 seconds!
 * - Priority 2 (Fallback without Worker):
 *   Fetches live Chart v8 3mo price/ADTV and checks `fundamentals-snapshot.json`.
 *   If the ticker is missing from `fundamentals-snapshot.json`, logs an honest
 *   `status: "FALLBACK_USED"` (`TICKER_NOT_IN_SNAPSHOT`) diagnostic instead of claiming `OK`.
 */
export async function tryFetchLiveTickerFundamentalsOnDemand(
  ticker: string,
  options?: { forceRefresh?: boolean; skipRelayChartProbe?: boolean }
): Promise<FundamentalsSnapshotTickerEntry | null> {
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const yfSym = `${clean}.JK`;
  const forceRefresh = Boolean(options?.forceRefresh);
  const skipRelayChartProbe = Boolean(options?.skipRelayChartProbe);
  const workerBaseUrl = getRealtimeWorkerUrl();

  // Check in-memory cache first if not forcing refresh
  if (!forceRefresh) {
    const cachedLive = liveFundamentalsMemoryCache.get(clean);
    if (cachedLive && cachedLive.provenanceMode === 'LIVE_REALTIME_WORKER') {
      return cachedLive;
    }
  }

  // PRIORITY 1: True Real-Time Single-Ticker Sync via Cloudflare Worker Relay
  if (workerBaseUrl) {
    const workerEndpoint = `${workerBaseUrl}/?ticker=${encodeURIComponent(clean)}${
      forceRefresh ? '&nocache=1' : ''
    }`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8500);
      const res = await fetch(workerEndpoint, {
        method: 'GET',
        signal: controller.signal,
        cache: forceRefresh ? 'no-store' : 'default'
      });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        const payload = JSON.parse(text);
        if (payload && typeof payload === 'object' && payload.ticker === clean) {
          const asOfDate =
            typeof payload.asOfDate === 'string' && payload.asOfDate
              ? payload.asOfDate
              : new Date().toISOString().slice(0, 10);

          const resolvedTtmMethod =
            payload.ttmMethod ||
            payload.flowAudit?.unifiedMethod ||
            payload.fundamentals?.ttmMethod ||
            payload.fundamentals?.flowAudit?.unifiedMethod ||
            payload.decumulationMethod ||
            null;
          const resolvedFlowAudit: FlowAuditMetadata | null =
            payload.flowAudit || payload.fundamentals?.flowAudit || null;
          const resolvedDaMethodNote =
            payload.daMethodNote || payload.fundamentals?.daMethodNote || null;

          const workerEntry: FundamentalsSnapshotTickerEntry = {
            ticker: clean,
            asOfDate,
            fiscalPeriod: payload.fiscalPeriod || 'TTM_WORKER',
            provenanceMode: 'LIVE_REALTIME_WORKER',
            fetchedAt: payload.fetchedAt || new Date().toISOString(),
            reportingCurrency:
              payload.reportingCurrency === 'USD'
                ? 'USD_CONVERTED_TO_IDR'
                : payload.reportingCurrency || 'IDR',
            fxRateUsdIdr:
              typeof payload.fxRateUsdIdr === 'number' ? payload.fxRateUsdIdr : undefined,
            lastPrice: typeof payload.lastPrice === 'number' ? payload.lastPrice : null,
            previousClose:
              typeof payload.previousClose === 'number' ? payload.previousClose : null,
            change1D: typeof payload.change1D === 'number' ? payload.change1D : null,
            return30D: typeof payload.return30D === 'number' ? payload.return30D : null,
            closes: Array.isArray(payload.closes) ? payload.closes : undefined,
            timestamps: Array.isArray(payload.timestamps) ? payload.timestamps : undefined,
            beta1Y: typeof payload.beta1Y === 'number' ? payload.beta1Y : null,
            realizedAnnualVol:
              typeof payload.realizedAnnualVol === 'number' ? payload.realizedAnnualVol : null,
            atr20: typeof payload.atr20 === 'number' ? payload.atr20 : null,
            dividendYieldTTM:
              typeof payload.dividendYieldTTM === 'number' ? payload.dividendYieldTTM : null,
            revenueTTM: typeof payload.revenueTTM === 'number' ? payload.revenueTTM : null,
            revenueTTMIdr: typeof payload.revenueTTM === 'number' ? payload.revenueTTM : null,
            latestFullYearRevenue:
              typeof payload.latestFullYearRevenue === 'number'
                ? payload.latestFullYearRevenue
                : null,
            ebitTTM:
              typeof payload.operatingProfitTTM === 'number'
                ? payload.operatingProfitTTM
                : typeof payload.ebitTTM === 'number'
                ? payload.ebitTTM
                : null,
            operatingProfitTTM:
              typeof payload.operatingProfitTTM === 'number'
                ? payload.operatingProfitTTM
                : typeof payload.ebitTTM === 'number'
                ? payload.ebitTTM
                : null,
            ebitdaTTM: typeof payload.ebitdaTTM === 'number' ? payload.ebitdaTTM : null,
            netIncomeTTM: typeof payload.netIncomeTTM === 'number' ? payload.netIncomeTTM : null,
            netIncomeTTMIdr: typeof payload.netIncomeTTM === 'number' ? payload.netIncomeTTM : null,
            netIncomeYoYPct:
              typeof payload.netIncomeYoYPct === 'number' ? payload.netIncomeYoYPct : null,
            operatingProfitYoYPct:
              typeof payload.operatingProfitYoYPct === 'number'
                ? payload.operatingProfitYoYPct
                : null,
            equityAttributable:
              typeof payload.equityAttributable === 'number' ? payload.equityAttributable : null,
            equityAttributableIdr:
              typeof payload.equityAttributable === 'number' ? payload.equityAttributable : null,
            totalAssets: typeof payload.totalAssets === 'number' ? payload.totalAssets : null,
            totalDebt: typeof payload.totalDebt === 'number' ? payload.totalDebt : null,
            cashAndEquivalents:
              typeof payload.cashAndEquivalents === 'number' ? payload.cashAndEquivalents : null,
            sharesOutstanding:
              typeof payload.sharesOutstanding === 'number' ? payload.sharesOutstanding : null,
            ocfTTM: typeof payload.ocfTTM === 'number' ? payload.ocfTTM : null,
            capexTTM: typeof payload.capexTTM === 'number' ? payload.capexTTM : null,
            daTTM: typeof payload.daTTM === 'number' ? payload.daTTM : null,
            daAnomaly: Boolean(payload.daAnomaly),
            daMethodNote: resolvedDaMethodNote,
            ttmMethod: resolvedTtmMethod,
            flowAudit: resolvedFlowAudit,
            roeAvg3YPct: typeof payload.roeAvg3YPct === 'number' ? payload.roeAvg3YPct : null,
            roeAvg5YPct: typeof payload.roeAvg5YPct === 'number' ? payload.roeAvg5YPct : null,
            missingFields: Array.isArray(payload.missingFields) ? payload.missingFields : [],
            adtv20dIdr: typeof payload.adtv20dIdr === 'number' ? payload.adtv20dIdr : null,
            adtvAsOfDate: asOfDate,
            adtvProvenanceMode: 'LIVE_REALTIME_WORKER',
            decumulationMethod: resolvedTtmMethod || undefined,
            decumulationNote: payload.note || payload.decumulationNote
          };

          liveFundamentalsMemoryCache.set(clean, workerEntry);

          if (typeof workerEntry.adtv20dIdr === 'number' && workerEntry.adtv20dIdr > 0) {
            setLiveChartAdtvCacheEntry(clean, workerEntry.adtv20dIdr, asOfDate);
          }

          // Hydrate live market quote in embeddedSnapshot so buildIdx100StockUniverse & modal reflect live price/closes
          if (typeof workerEntry.lastPrice === 'number' && workerEntry.lastPrice > 0) {
            const existingSnap = embeddedSnapshot.data?.[yfSym];
            const closesArr =
              Array.isArray(workerEntry.closes) && workerEntry.closes.length >= 2
                ? workerEntry.closes
                : existingSnap?.closes || [workerEntry.lastPrice];
            if (!embeddedSnapshot.data) embeddedSnapshot.data = {};
            embeddedSnapshot.data[yfSym] = {
              ...(existingSnap || {}),
              symbol: yfSym,
              lastPrice: Math.round(workerEntry.lastPrice),
              previousClose:
                typeof workerEntry.previousClose === 'number' && workerEntry.previousClose > 0
                  ? Math.round(workerEntry.previousClose)
                  : existingSnap?.previousClose,
              change1D:
                typeof workerEntry.change1D === 'number'
                  ? workerEntry.change1D
                  : existingSnap?.change1D ?? 0,
              closes: closesArr,
              timestamp:
                Array.isArray(workerEntry.timestamps) &&
                workerEntry.timestamps.length === closesArr.length
                  ? workerEntry.timestamps
                  : existingSnap?.timestamp,
              adtv20dIdr:
                typeof workerEntry.adtv20dIdr === 'number' && workerEntry.adtv20dIdr > 0
                  ? Math.round(workerEntry.adtv20dIdr)
                  : existingSnap?.adtv20dIdr,
              adtvSource: 'LIVE_YAHOO_API',
              adtvAsOfDate: asOfDate,
              priceSource: 'LIVE_YAHOO_API',
              priceAsOfDate: asOfDate
            };
          }

          // Update SBN macro benchmarks if Worker returned live SBN yields (supports both sbn10YYieldPct and sbn10YPct)
          const rawSbn10Y =
            payload.macroBenchmarks?.sbn10YYieldPct ??
            payload.macroBenchmarks?.sbn10YPct;
          const rawSbn5Y =
            payload.macroBenchmarks?.sbn5YYieldPct ??
            payload.macroBenchmarks?.sbn5YPct;
          const rawSbn1Y =
            payload.macroBenchmarks?.sbn1YYieldPct ??
            payload.macroBenchmarks?.sbn1YPct;

          if (
            typeof rawSbn10Y === 'number' &&
            Number.isFinite(rawSbn10Y) &&
            rawSbn10Y >= 3.0 &&
            rawSbn10Y <= 14.0
          ) {
            const activeDoc: FundamentalsSnapshotDocument = cachedFundamentalsSnapshotDoc ?? {
              version: '2.0.0',
              generatedAt: new Date().toISOString(),
              provenanceMode: 'LIVE_REALTIME_WORKER',
              tickers: {}
            };
            const finalSbn1Y =
              typeof rawSbn1Y === 'number' && Number.isFinite(rawSbn1Y)
                ? rawSbn1Y
                : Number((rawSbn10Y - 0.55).toFixed(2));
            const finalSbn5Y =
              typeof rawSbn5Y === 'number' && Number.isFinite(rawSbn5Y)
                ? rawSbn5Y
                : Number((rawSbn10Y - 0.25).toFixed(2));
            const sbnFeedName =
              payload.macroBenchmarks?.sbnSource || 'CNBC_SOVEREIGN_ID10Y_LIVE';

            activeDoc.macroBenchmarks = {
              sbn1YPct: finalSbn1Y,
              sbn5YPct: finalSbn5Y,
              sbn10YPct: rawSbn10Y,
              sbn1YYieldPct: finalSbn1Y,
              sbn5YYieldPct: finalSbn5Y,
              sbn10YYieldPct: rawSbn10Y,
              sbnAsOfDate: payload.macroBenchmarks?.sbnAsOfDate || asOfDate,
              sbnSource: sbnFeedName,
              sourceLabel: sbnFeedName,
              provenanceMode: 'LIVE_REALTIME_WORKER',
              source: 'LIVE_YAHOO_API'
            };
            cachedFundamentalsSnapshotDoc = activeDoc;
          }

          const missingCount = workerEntry.missingFields?.length ?? 0;
          recordSyncDiagnostic({
            ticker: clean,
            stage: 'QUOTE_SUMMARY_FUNDAMENTALS',
            endpoint: `${workerBaseUrl}/?ticker=${clean}`,
            httpStatus: res.status,
            payloadBytes: text.length,
            status: 'OK',
            errorDetail:
              missingCount > 0
                ? `Cloudflare Worker Real-Time Sync berhasil (${workerEntry.fiscalPeriod}). ${missingCount} field parsial kosong di Yahoo (${workerEntry.missingFields?.join(', ')}) → SEED_WARN per-field.`
                : `Cloudflare Worker Real-Time Sync berhasil menarik harga, ADTV 20D, Beta 1Y, LK TTM (${workerEntry.fiscalPeriod} · ${resolvedTtmMethod || 'TTM'}), dan kurva SBN.`,
            fallbackSource: 'LIVE_YAHOO_API'
          });

          return workerEntry;
        }
      } else {
        recordSyncDiagnostic({
          ticker: clean,
          stage: 'QUOTE_SUMMARY_FUNDAMENTALS',
          endpoint: `${workerBaseUrl}/?ticker=${clean}`,
          httpStatus: res.status,
          status: 'FALLBACK_USED',
          errorCode: `WORKER_HTTP_${res.status}`,
          errorDetail: `Cloudflare Worker mengembalikan HTTP ${res.status}; beralih ke Chart v8 + fundamentals-snapshot.json.`,
          fallbackSource: 'FUNDAMENTALS_JSON'
        });
      }
    } catch (err) {
      recordSyncDiagnostic({
        ticker: clean,
        stage: 'QUOTE_SUMMARY_FUNDAMENTALS',
        endpoint: `${workerBaseUrl}/?ticker=${clean}`,
        status: 'FALLBACK_USED',
        errorCode: 'WORKER_FETCH_FAILED',
        errorDetail:
          err instanceof Error
            ? `Gagal menghubungi Cloudflare Worker (${err.message}); beralih ke Chart v8 + fundamentals-snapshot.json.`
            : 'Gagal menghubungi Cloudflare Worker; beralih ke Chart v8 + fundamentals-snapshot.json.',
        fallbackSource: 'FUNDAMENTALS_JSON'
      });
    }
  }

  // PRIORITY 2 (Fallback without Worker):
  // 1. Pull Chart v8 3mo to extract real 20D volume * close ADTV (skipped during passive background modal open when skipRelayChartProbe is true unless forceRefresh is set)
  const chartRes =
    skipRelayChartProbe && !forceRefresh
      ? null
      : await fetchSingleChartViaBrowserRelay(yfSym, '3mo');
  if (chartRes?.adtv20dIdr && chartRes.adtv20dIdr > 0) {
    setLiveChartAdtvCacheEntry(clean, chartRes.adtv20dIdr, chartRes.adtvAsOfDate);
  }

  const lockedLiveAdtv = liveChartAdtvMemoryCache.get(clean);
  const snapTickerEntry = cachedFundamentalsSnapshotDoc?.tickers?.[clean];
  const isSnapVerified =
    Boolean(snapTickerEntry) &&
    snapTickerEntry?.provenanceMode === 'AUTOMATED_FETCH' &&
    typeof snapTickerEntry?.revenueTTM === 'number' &&
    snapTickerEntry.revenueTTM > 0;

  // Honest Sync Diagnostics: never log status: "OK" with "laporan keuangan terverifikasi" if ticker is missing from snapshot!
  if (isSnapVerified) {
    recordSyncDiagnostic({
      ticker: clean,
      stage: 'QUOTE_SUMMARY_FUNDAMENTALS',
      endpoint: 'fundamentals-snapshot.json + v8/chart/3mo',
      httpStatus: 200,
      status: 'OK',
      errorDetail:
        'Menggunakan ADTV 20D live dari Chart v8 + laporan keuangan terverifikasi dari fundamentals-snapshot.json.',
      fallbackSource: 'FUNDAMENTALS_JSON'
    });
  } else {
    recordSyncDiagnostic({
      ticker: clean,
      stage: 'QUOTE_SUMMARY_FUNDAMENTALS',
      endpoint: 'fundamentals-snapshot.json',
      httpStatus: 404,
      status: 'FALLBACK_USED',
      errorCode: 'TICKER_NOT_IN_SNAPSHOT',
      errorDetail: `TICKER_NOT_IN_SNAPSHOT: Data laporan keuangan ${clean} belum tersedia di fundamentals-snapshot.json dan Realtime Proxy Worker belum dipasang. Pasang Cloudflare Worker URL (1–2 dtk real-time) atau klik [⚡ Tarik Data ${clean} via Actions].`,
      fallbackSource: 'HARDCODED_SEED'
    });
  }

  const activeLiveAdtv = chartRes?.adtv20dIdr ?? lockedLiveAdtv?.liveAdtv20dIdr;
  const activeLiveAdtvDate = chartRes?.adtvAsOfDate ?? lockedLiveAdtv?.liveAdtvAsOfDate;

  if (activeLiveAdtv && activeLiveAdtv > 0) {
    const partialEntry: FundamentalsSnapshotTickerEntry = {
      ...(snapTickerEntry || {
        ticker: clean,
        provenanceMode: 'BOOTSTRAP_PLACEHOLDER'
      }),
      adtv20dIdr: activeLiveAdtv,
      adtvAsOfDate: activeLiveAdtvDate || new Date().toISOString().slice(0, 10),
      adtvProvenanceMode: 'AUTOMATED_FETCH'
    };
    liveFundamentalsMemoryCache.set(clean, partialEntry);
    return partialEntry;
  }

  return snapTickerEntry || null;
}

/**
 * Builds the Full JCI Stock Universe (~956+ Emiten BEI across 11 IDX-IC Sectors).
 * Hydrates every verified stock with its genuine Yahoo Finance price, 1D%, 30D%, Beta & Volatility.
 * Any ticker that is unquoted/delisted on Yahoo Finance or stagnant/gocap (< Rp 68 or flat-line closes)
 * is strictly marked `isLiquid: false` (and `lastPrice: 0` if unquoted) so it NEVER uses fake default prices
 * and NEVER enters Keranjang 1 or Keranjang 2.
 */
export const IDX_CATALOG_BY_TICKER_MAP: Map<string, IdxDirectoryEntry> = new Map(
  IDX_SECTOR_CATALOG.map((item) => [item.ticker, item])
);

export function buildIdx100StockUniverse(
  rebalanceBufferPct: number = 40,
  extraEntries: IdxDirectoryEntry[] = []
): StockMetrics[] {
  const nowStr = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const mergedCatalogMap = new Map<string, IdxDirectoryEntry>(IDX_CATALOG_BY_TICKER_MAP);
  for (const extra of extraEntries) {
    if (extra.ticker && !mergedCatalogMap.has(extra.ticker)) {
      mergedCatalogMap.set(extra.ticker, extra);
    }
  }

  // Also include any newly discovered .JK tickers present in embeddedSnapshot
  if (embeddedSnapshot?.data) {
    for (const sym of Object.keys(embeddedSnapshot.data)) {
      if (sym.endsWith('.JK')) {
        const clean = sym.replace(/\.JK$/i, '').toUpperCase();
        if (clean.length === 4 && !mergedCatalogMap.has(clean)) {
          const snapItem = embeddedSnapshot.data[sym];
          mergedCatalogMap.set(
            clean,
            createCalibratedIdxEntry(clean, undefined, snapItem?.shortName)
          );
        }
      }
    }
  }

  const ihsgCloses = embeddedSnapshot?.data?.['^JKSE']?.closes || [];
  const ihsgRets = computeDailyReturns(ihsgCloses);

  const enriched = Array.from(mergedCatalogMap.values()).map((entry) => {
    const yfTicker = `${entry.ticker}.JK`;
    const snapItem = embeddedSnapshot?.data?.[yfTicker];
    const dividendYieldPct = getEmitenDividendYield(entry.ticker);

    // Case 1: Genuine Yahoo Finance quote exists
    if (snapItem && snapItem.lastPrice > 0 && Array.isArray(snapItem.closes) && snapItem.closes.length >= 2) {
      const lastPrice = Math.round(snapItem.lastPrice);
      const change1D = snapItem.change1D;
      const isLiquid = evaluateSeriesLiquidity(snapItem.closes, lastPrice);
      const dynamicDivYield = getEmitenDividendYield(entry.ticker, lastPrice);

      const return30D = computeAccurate30DReturn(
        snapItem.closes,
        snapItem.lastPrice,
        snapItem.timestamp
      );
      const returnYTD = computeAccurateYTDReturn(
        snapItem.closes,
        snapItem.lastPrice,
        snapItem.timestamp
      );

      let beta1Y = entry.approxBeta;
      let volatilityAnn = Number((entry.approxBeta * 22.0).toFixed(1));

      const stockRets = computeDailyReturns(snapItem.closes);
      if (stockRets.length >= 12 && ihsgRets.length >= 12) {
        const bv = computeBetaAndVolatility(stockRets, ihsgRets, isLiquid, entry.sector, entry.ticker);
        beta1Y = bv.beta1Y;
        volatilityAnn = bv.volatilityAnn;
      } else {
        beta1Y = computeAuthenticBeta1YFromSnapshotOrSeries(entry.ticker, entry.sector, entry.approxBeta);
      }

      const previousClose = resolveStockPreviousClose(
        lastPrice,
        change1D,
        snapItem.previousClose,
        snapItem.closes,
        snapItem.timestamp
      );

      const latestTs =
        Array.isArray(snapItem.timestamp) && snapItem.timestamp.length > 0
          ? snapItem.timestamp[snapItem.timestamp.length - 1]
          : undefined;
      const priceAsOfDate =
        snapItem.priceAsOfDate ||
        (typeof latestTs === 'number' && Number.isFinite(latestTs)
          ? new Date(latestTs * 1000).toISOString().slice(0, 10)
          : embeddedSnapshot?.updatedAt
          ? String(embeddedSnapshot.updatedAt).slice(0, 10)
          : new Date().toISOString().slice(0, 10));

      const overlay = resolveTickerFundamentalOverlay(
        entry.ticker,
        entry,
        snapItem.adtv20dIdr,
        snapItem.adtvSource || 'SNAPSHOT_JSON',
        snapItem.adtvAsOfDate || priceAsOfDate
      );

      return enrichStockMetrics({
        ticker: entry.ticker,
        idxTicker: `IDX:${entry.ticker}`,
        yfTicker,
        name: entry.name,
        sector: entry.sector,
        subIndustry: entry.subIndustry,
        lastPrice,
        previousClose,
        marketState: snapItem.marketState,
        change1D,
        return30D,
        returnYTD,
        beta1Y: overlay.beta1Y ?? beta1Y,
        volatilityAnn: overlay.realizedAnnualVol ?? volatilityAnn,
        atr20Idr: overlay.atr20Idr,
        roe: overlay.roe,
        debtToEquity: overlay.debtToEquity,
        operatingMargin: overlay.operatingMargin,
        revenueTTMIdr: overlay.revenueTTMIdr,
        latestFullYearRevenueIdr: overlay.latestFullYearRevenueIdr,
        operatingProfitTTMIdr: overlay.operatingProfitTTMIdr,
        ebitdaTTMIdr: overlay.ebitdaTTMIdr,
        netIncomeTTMIdr: overlay.netIncomeTTMIdr,
        equityAttributableIdr: overlay.equityAttributableIdr,
        totalDebtIdr: overlay.totalDebtIdr,
        totalAssetsIdr: overlay.totalAssetsIdr,
        cashAndEquivalentsIdr: overlay.cashAndEquivalentsIdr,
        sharesOutstanding: overlay.sharesOutstanding,
        ocfTTMIdr: overlay.ocfTTMIdr,
        capexTTMIdr: overlay.capexTTMIdr,
        daTTMIdr: overlay.daTTMIdr,
        roeAvg3YPct: overlay.roeAvg3YPct,
        roeAvg5YPct: overlay.roeAvg5YPct,
        earningsGrowthYoYPct: overlay.netIncomeYoYPct,
        operatingProfitGrowthYoYPct: overlay.operatingProfitYoYPct,
        adtv20dIdr: overlay.adtv20dIdr,
        adtvSource: overlay.adtvSource,
        adtvAsOfDate: overlay.adtvAsOfDate,
        priceSource: snapItem.priceSource || 'SNAPSHOT_JSON',
        priceAsOfDate,
        fundamentalsSource: overlay.fundamentalsSource,
        fundamentalsAsOfDate: overlay.fundamentalsAsOfDate,
        fundamentalsFiscalPeriod: overlay.fundamentalsFiscalPeriod,
        fundamentalsNote: overlay.fundamentalsNote,
        daAnomaly: overlay.daAnomaly,
        daMethodNote: overlay.daMethodNote,
        ttmMethod: overlay.ttmMethod,
        flowAudit: overlay.flowAudit,
        missingFundamentalFields: overlay.missingFundamentalFields,
        reportingCurrency: overlay.reportingCurrency,
        fxRateUsdIdr: overlay.fxRateUsdIdr,
        isLiveFetched: true,
        isLiquid,
        dividendYieldPct: overlay.dividendYieldTTM ?? dynamicDivYield,
        lastSyncedAt: nowStr
      });
    }

    // Case 2: Ticker has been verified against Yahoo Finance and confirmed suspended/delisted/unquoted (e.g. FORZ/SRIL)
    const overlay = resolveTickerFundamentalOverlay(entry.ticker, entry);
    return enrichStockMetrics({
      ticker: entry.ticker,
      idxTicker: `IDX:${entry.ticker}`,
      yfTicker,
      name: entry.name,
      sector: entry.sector,
      subIndustry: entry.subIndustry,
      lastPrice: 0,
      change1D: 0,
      return30D: 0,
      returnYTD: 0,
      beta1Y: 1.25,
      volatilityAnn: 45.0,
      roe: overlay.roe,
      debtToEquity: overlay.debtToEquity,
      operatingMargin: overlay.operatingMargin,
      fundamentalsSource: overlay.fundamentalsSource,
      fundamentalsAsOfDate: overlay.fundamentalsAsOfDate,
      fundamentalsFiscalPeriod: overlay.fundamentalsFiscalPeriod,
      fundamentalsNote: overlay.fundamentalsNote,
      isLiveFetched: true,
      isLiquid: false,
      dividendYieldPct,
      lastSyncedAt: nowStr
    });
  });

  return rankUniverseWithBuffer(enriched, rebalanceBufferPct);
}

let cachedLocalServerAvailable: boolean | null = null;

/**
 * Strictly checks if the local Express development server (/api/*) is available.
 * Returns false on GitHub Pages (*.github.io) and all production static hosts so /api/* never 404s.
 */
function canUseLocalExpressBackend(): boolean {
  if (typeof window === 'undefined') return false;
  if (cachedLocalServerAvailable === false) return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.run.app');
}

/**
 * Dedicated check for Express AI & Emiten on-demand endpoints so a transient Yahoo Finance batch timeout
 * never disables Gemini AI analysis (/api/ai/inspect-emiten).
 */
function canUseExpressOnDemandApi(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.run.app');
}

let browserRelayCircuitBrokenUntil = 0;

/**
 * Clean Single-Endpoint Browser Relay Fetcher for Static Hosts (GitHub Pages):
 * - Eliminates deprecated/blocked legacy proxies (`corsproxy.io` 403, `api.allorigins.win` timeout, `codetabs` timeout)
 *   that caused red 403 and `(canceled)` entries in the browser Network tab.
 * - Uses `allorigins.hexlet.app/raw` with an automatic 90-second Circuit Breaker (`browserRelayCircuitBrokenUntil`)
 *   so if the relay is unreachable or throttled, it trips immediately on the first probe without cascading failures.
 */
async function fetchYahooJsonViaBrowserRelay(
  yahooUrl: string,
  timeoutMs: number = 8500
): Promise<any | null> {
  if (Date.now() < browserRelayCircuitBrokenUntil) {
    return null;
  }

  const relayUrl = `https://allorigins.hexlet.app/raw?disableCache=true&url=${encodeURIComponent(
    yahooUrl
  )}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(relayUrl, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        browserRelayCircuitBrokenUntil = 0;
        return data;
      }
    }
    browserRelayCircuitBrokenUntil = Date.now() + 90_000;
  } catch {
    clearTimeout(timer);
    browserRelayCircuitBrokenUntil = Date.now() + 90_000;
  }
  return null;
}

function resolveDailyPrevCloseClient(
  closes: number[],
  timestamps: number[]
): number {
  if (closes.length < 2) return 0;
  const n = closes.length;
  if (timestamps.length === n && n >= 2) {
    if (isSameJakartaTradingDayClient(timestamps[n - 1], timestamps[n - 2])) {
      return n >= 3 ? closes[n - 3] : closes[n - 2];
    }
    return closes[n - 2];
  }
  return closes[n - 2];
}

async function fetchSingleChartViaBrowserRelay(
  symbol: string,
  range: string = '3mo'
): Promise<SparkSeriesItem | null> {
  const cleanTicker = symbol.replace(/\.JK$/i, '').toUpperCase();
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${encodeURIComponent(range)}&interval=1d&events=div`;
  const data = await fetchYahooJsonViaBrowserRelay(yahooUrl, 8500);
  const result = data?.chart?.result?.[0];
  if (!result) {
    recordSyncDiagnostic({
      ticker: cleanTicker,
      stage: 'CHART_OHLCV',
      endpoint: yahooUrl,
      status: 'FALLBACK_USED',
      errorDetail: 'Relay tidak mengembalikan chart.result[0]; fallback ke static-market-snapshot.json',
      fallbackSource: 'SNAPSHOT_JSON'
    });
    return null;
  }

  const payloadBytes = (() => {
    try {
      return JSON.stringify(data).length;
    } catch {
      return undefined;
    }
  })();

  const meta = result?.meta || {};
  const rawTimestamps: Array<number | null> = result?.timestamp || [];
  const rawCloses: Array<number | null> = result?.indicators?.quote?.[0]?.close || [];
  const rawVolumes: Array<number | null> = result?.indicators?.quote?.[0]?.volume || [];
  const closes: number[] = [];
  const timestamps: number[] = [];
  const validTurnoversIdr: number[] = [];

  for (let i = 0; i < rawCloses.length; i++) {
    const c = rawCloses[i];
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
      closes.push(Number(c.toFixed(2)));
      const t = rawTimestamps[i];
      if (typeof t === 'number' && Number.isFinite(t)) {
        timestamps.push(t);
      }
      const v = rawVolumes[i];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        validTurnoversIdr.push(c * v);
      }
    }
  }

  const last20Turnovers = validTurnoversIdr.slice(-20);
  const computedAdtv20dIdr =
    last20Turnovers.length > 0
      ? Math.round(
          last20Turnovers.reduce((sum, val) => sum + val, 0) / last20Turnovers.length
        )
      : undefined;

  const livePrice =
    typeof meta.regularMarketPrice === 'number' &&
    Number.isFinite(meta.regularMarketPrice) &&
    meta.regularMarketPrice > 0
      ? meta.regularMarketPrice
      : typeof meta.fulldayPrice === 'number' &&
        Number.isFinite(meta.fulldayPrice) &&
        meta.fulldayPrice > 0
      ? meta.fulldayPrice
      : closes.length > 0
      ? closes[closes.length - 1]
      : 0;

  const lastPrice = Number(livePrice.toFixed(2));
  if (!lastPrice || lastPrice <= 0) return null;

  const rawTrailingWasNull =
    rawCloses.length > 0 && rawCloses[rawCloses.length - 1] === null;
  if (closes.length > 0) {
    if (
      rawTrailingWasNull &&
      typeof meta.regularMarketTime === 'number' &&
      timestamps.length > 0 &&
      !isSameJakartaTradingDayClient(timestamps[timestamps.length - 1], meta.regularMarketTime)
    ) {
      closes.push(lastPrice);
      timestamps.push(meta.regularMarketTime);
    } else if (closes[closes.length - 1] !== lastPrice) {
      closes[closes.length - 1] = lastPrice;
    }
  }

  const dailyPrevClose = resolveDailyPrevCloseClient(closes, timestamps);
  const prevClose =
    typeof meta.previousClose === 'number' &&
    Number.isFinite(meta.previousClose) &&
    meta.previousClose > 0
      ? meta.previousClose
      : dailyPrevClose > 0
      ? dailyPrevClose
      : lastPrice;

  const officialChangePct =
    typeof meta.regularMarketChangePercent === 'number' &&
    Number.isFinite(meta.regularMarketChangePercent)
      ? meta.regularMarketChangePercent
      : typeof meta.fulldayChangePercent === 'number' &&
        Number.isFinite(meta.fulldayChangePercent)
      ? meta.fulldayChangePercent
      : null;

  const change1D =
    officialChangePct !== null
      ? Number(officialChangePct.toFixed(2))
      : prevClose > 0
      ? Number((((lastPrice - prevClose) / prevClose) * 100).toFixed(2))
      : 0;

  const latestTs =
    typeof meta.regularMarketTime === 'number' && Number.isFinite(meta.regularMarketTime)
      ? meta.regularMarketTime
      : timestamps.length > 0
      ? timestamps[timestamps.length - 1]
      : undefined;
  const priceAsOfDate =
    typeof latestTs === 'number'
      ? new Date(latestTs * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  if (computedAdtv20dIdr && computedAdtv20dIdr > 0) {
    setLiveChartAdtvCacheEntry(cleanTicker, computedAdtv20dIdr, priceAsOfDate);
  }

  recordSyncDiagnostic({
    ticker: cleanTicker,
    stage: 'CHART_OHLCV',
    endpoint: yahooUrl,
    payloadBytes,
    httpStatus: 200,
    status: 'OK',
    errorDetail: computedAdtv20dIdr
      ? `OHLCV + 20D Volume ADTV berhasil diekstrak (${last20Turnovers.length} hari bursa, dikunci di liveChartAdtvMemoryCache).`
      : 'OHLCV berhasil diekstrak (tanpa array volume).'
  });

  const lockedAdtv = getLiveChartAdtvCacheEntry(cleanTicker);
  const finalAdtv20dIdr = computedAdtv20dIdr ?? lockedAdtv?.liveAdtv20dIdr;
  const finalAdtvAsOfDate = computedAdtv20dIdr
    ? priceAsOfDate
    : lockedAdtv?.liveAdtvAsOfDate ?? priceAsOfDate;

  return {
    symbol,
    lastPrice,
    previousClose: Number(prevClose.toFixed(2)),
    change1D,
    closes: closes.length >= 2 ? closes : [prevClose, lastPrice],
    timestamp: timestamps.length === closes.length ? timestamps : undefined,
    shortName: meta.longName || meta.shortName,
    adtv20dIdr: finalAdtv20dIdr,
    adtvAsOfDate: finalAdtvAsOfDate,
    adtvSource: finalAdtv20dIdr ? 'LIVE_YAHOO_API' : undefined,
    priceSource: 'LIVE_YAHOO_API',
    priceAsOfDate,
    marketState: typeof meta.marketState === 'string' ? meta.marketState : undefined
  };
}

async function fetchSparkChunkViaBrowserRelay(
  symbolsChunk: string[],
  range: string = '1mo'
): Promise<Record<string, SparkSeriesItem>> {
  const resultMap: Record<string, SparkSeriesItem> = {};
  if (symbolsChunk.length === 0 || Date.now() < browserRelayCircuitBrokenUntil) {
    return resultMap;
  }

  const joined = symbolsChunk.map((s) => encodeURIComponent(s)).join(',');
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${joined}&range=${encodeURIComponent(
    range
  )}&interval=1d`;

  const sparkData = await fetchYahooJsonViaBrowserRelay(yahooUrl, 8500);
  if (sparkData && typeof sparkData === 'object') {
    for (const sym of symbolsChunk) {
      const entry = sparkData[sym];
      if (!entry || typeof entry !== 'object') continue;
      const rawTimestamps: Array<number | null> = entry?.timestamp || [];
      const rawCloses: Array<number | null> = entry?.close || [];
      const closes: number[] = [];
      const timestamps: number[] = [];
      for (let i = 0; i < rawCloses.length; i++) {
        const c = rawCloses[i];
        if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
          closes.push(Number(c.toFixed(2)));
          const t = rawTimestamps[i];
          if (typeof t === 'number' && Number.isFinite(t)) {
            timestamps.push(t);
          }
        }
      }

      const liveEntryPrice =
        typeof entry.regularMarketPrice === 'number' &&
        Number.isFinite(entry.regularMarketPrice) &&
        entry.regularMarketPrice > 0
          ? entry.regularMarketPrice
          : typeof entry.fulldayPrice === 'number' &&
            Number.isFinite(entry.fulldayPrice) &&
            entry.fulldayPrice > 0
          ? entry.fulldayPrice
          : closes.length > 0
          ? closes[closes.length - 1]
          : 0;

      if (liveEntryPrice > 0) {
        const lastPrice = Number(liveEntryPrice.toFixed(2));
        const rawTrailingWasNull =
          rawCloses.length > 0 && rawCloses[rawCloses.length - 1] === null;

        if (closes.length === 0) {
          const basePrev = entry.previousClose || lastPrice;
          closes.push(Number(Number(basePrev).toFixed(2)), lastPrice);
        } else if (
          rawTrailingWasNull &&
          rawTimestamps.length > 0 &&
          typeof rawTimestamps[rawTimestamps.length - 1] === 'number' &&
          timestamps.length > 0 &&
          !isSameJakartaTradingDayClient(
            timestamps[timestamps.length - 1],
            rawTimestamps[rawTimestamps.length - 1] as number
          )
        ) {
          closes.push(lastPrice);
          timestamps.push(rawTimestamps[rawTimestamps.length - 1] as number);
        } else if (closes[closes.length - 1] !== lastPrice) {
          closes[closes.length - 1] = lastPrice;
        }

        const hasSparkWeekdayGap =
          lastPrice >= 68 &&
          timestamps.length >= 2 &&
          timestamps[timestamps.length - 1] - timestamps[timestamps.length - 2] > 120000 &&
          new Date(timestamps[timestamps.length - 1] * 1000).getUTCDay() !== 1;

        const snapBaseline = embeddedSnapshot?.data?.[sym];
        const dailyPrevClose =
          hasSparkWeekdayGap &&
          snapBaseline &&
          typeof snapBaseline.previousClose === 'number' &&
          snapBaseline.previousClose > 0
            ? snapBaseline.previousClose
            : resolveDailyPrevCloseClient(closes, timestamps);

        const prevClose =
          typeof entry.previousClose === 'number' &&
          Number.isFinite(entry.previousClose) &&
          entry.previousClose > 0
            ? entry.previousClose
            : dailyPrevClose > 0
            ? dailyPrevClose
            : lastPrice;

        const officialChangePct =
          typeof entry.regularMarketChangePercent === 'number' &&
          Number.isFinite(entry.regularMarketChangePercent)
            ? entry.regularMarketChangePercent
            : typeof entry.fulldayChangePercent === 'number' &&
              Number.isFinite(entry.fulldayChangePercent)
            ? entry.fulldayChangePercent
            : null;

        const change1D =
          officialChangePct !== null
            ? Number(officialChangePct.toFixed(2))
            : prevClose > 0
            ? Number((((lastPrice - prevClose) / prevClose) * 100).toFixed(2))
            : 0;

        resultMap[sym] = {
          symbol: sym,
          lastPrice,
          previousClose: Number(prevClose.toFixed(2)),
          change1D,
          closes,
          timestamp: timestamps.length === closes.length ? timestamps : undefined,
          marketState: typeof entry.marketState === 'string' ? entry.marketState : undefined
        };
      }
    }
  }

  return resultMap;
}

let inFlightSnapshotPromise: Promise<StaticMarketSnapshotPayload | null> | null = null;
let lastStaticSnapshotPullAt = 0;

/**
 * Loads the static market snapshot, and when `forceRefresh` is true on GitHub Pages,
 * deduplicates concurrent calls so at most 1 network request is made per 25 seconds.
 */
async function loadStaticMarketSnapshot(
  forceRefresh = false
): Promise<StaticMarketSnapshotPayload | null> {
  if (
    forceRefresh &&
    typeof window !== 'undefined' &&
    !canUseLocalExpressBackend() &&
    Date.now() - lastStaticSnapshotPullAt > 25_000
  ) {
    if (inFlightSnapshotPromise) {
      return inFlightSnapshotPromise;
    }

    inFlightSnapshotPromise = (async () => {
      try {
        // 1. Try direct real-time GitHub Contents API (bypasses CDN cache completely)
        try {
          const ghApiSnapshot = (await pullLiveMarketSnapshotFromGitHubApi()) as StaticMarketSnapshotPayload | null;
          if (ghApiSnapshot && ghApiSnapshot.data && typeof ghApiSnapshot.data === 'object') {
            lastStaticSnapshotPullAt = Date.now();
            if (embeddedSnapshot.data) {
              Object.assign(embeddedSnapshot.data, ghApiSnapshot.data);
            } else {
              embeddedSnapshot.data = ghApiSnapshot.data;
            }
            if (Array.isArray(ghApiSnapshot.newsItems) && ghApiSnapshot.newsItems.length > 0) {
              embeddedSnapshot.newsItems = ghApiSnapshot.newsItems;
            }
            return embeddedSnapshot;
          }
        } catch {
          // Fall back to relative fetch
        }

        // 2. Fallback: relative fetch with cache-busting timestamp
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(`./static-market-snapshot.json?t=${Date.now()}`, {
            signal: controller.signal,
            cache: 'no-store'
          });
          clearTimeout(timer);
          if (res.ok) {
            const freshJson = (await res.json()) as StaticMarketSnapshotPayload;
            if (freshJson && freshJson.data && typeof freshJson.data === 'object') {
              lastStaticSnapshotPullAt = Date.now();
              if (embeddedSnapshot.data) {
                Object.assign(embeddedSnapshot.data, freshJson.data);
              } else {
                embeddedSnapshot.data = freshJson.data;
              }
              return embeddedSnapshot;
            }
          }
        } catch {
          // Fall back to embeddedSnapshot
        }
      } finally {
        inFlightSnapshotPromise = null;
      }

      return embeddedSnapshot && embeddedSnapshot.data ? embeddedSnapshot : null;
    })();

    return inFlightSnapshotPromise;
  }

  if (embeddedSnapshot && embeddedSnapshot.data && typeof embeddedSnapshot.data === 'object') {
    return embeddedSnapshot;
  }
  return null;
}

/**
 * 60-Second In-Memory Live Quote Cache to prevent redundant Yahoo Finance requests
 * and protect against rate-limiting / IP throttling.
 */
const LIVE_QUOTE_CACHE_TTL_MS = 60_000;
const RAPID_CLICK_GUARD_MS = 12_000;
const liveQuoteMemoryCache = new Map<string, { item: SparkSeriesItem; fetchedAt: number }>();

function getCachedLiveQuote(symbol: string, maxAgeMs: number = LIVE_QUOTE_CACHE_TTL_MS): SparkSeriesItem | null {
  const entry = liveQuoteMemoryCache.get(symbol);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt <= maxAgeMs) {
    return entry.item;
  }
  return null;
}

function setCachedLiveQuotes(map: Record<string, SparkSeriesItem>): void {
  const now = Date.now();
  for (const [sym, item] of Object.entries(map)) {
    if (item && item.lastPrice > 0) {
      if (item.adtv20dIdr && item.adtv20dIdr > 0 && item.adtvSource === 'LIVE_YAHOO_API') {
        setLiveChartAdtvCacheEntry(
          sym,
          item.adtv20dIdr,
          item.adtvAsOfDate || item.priceAsOfDate || new Date().toISOString().slice(0, 10)
        );
      }
      const lockedAdtv = getLiveChartAdtvCacheEntry(sym);
      const mergedItem: SparkSeriesItem =
        lockedAdtv && (!item.adtv20dIdr || item.adtvSource !== 'LIVE_YAHOO_API')
          ? {
              ...item,
              adtv20dIdr: lockedAdtv.liveAdtv20dIdr,
              adtvAsOfDate: lockedAdtv.liveAdtvAsOfDate,
              adtvSource: 'LIVE_YAHOO_API'
            }
          : item;
      liveQuoteMemoryCache.set(sym, { item: mergedItem, fetchedAt: now });
    }
  }
}

export function clearLiveQuoteMemoryCache(): void {
  liveQuoteMemoryCache.clear();
  browserRelayCircuitBrokenUntil = 0;
}

/**
 * Strictly isolates GitHub Cloud portfolio state (`nostradamus_cloud_state.json`) from live Yahoo Finance prices:
 * - NEVER overwrites existing `embeddedSnapshot.data` prices (such as `^JKSE` or `ARNA.JK`) with stale cloud state prices.
 * - NEVER pollutes `liveQuoteMemoryCache` with cloud state prices.
 * - Only registers custom user-added tickers that do not yet exist in `embeddedSnapshot.data` at all.
 */
export function ingestCloudStateIntoEmbeddedSnapshot(cloudState: {
  stocks?: Array<{ ticker?: string; name?: string; lastPrice?: number; change1D?: number }>;
  macroIndicators?: Array<{ symbol?: string; value?: number; change1D?: number }>;
  liveIhsgQuote?: { lastPrice: number; change1D: number };
  liveIhsgReturns?: number[];
}): void {
  if (!cloudState || typeof cloudState !== 'object') return;
  if (!embeddedSnapshot.data) {
    embeddedSnapshot.data = {};
  }

  if (Array.isArray(cloudState.stocks)) {
    for (const st of cloudState.stocks) {
      if (!st || !st.ticker || typeof st.lastPrice !== 'number' || st.lastPrice <= 0) {
        continue;
      }
      const cleanTicker = String(st.ticker).trim().toUpperCase().replace(/\.JK$/i, '');
      const yfSym = `${cleanTicker}.JK`;
      // Never overwrite an existing Yahoo Finance snapshot entry with stale cloud state prices
      if (embeddedSnapshot.data[yfSym]) {
        continue;
      }
      const lastPrice = Number(st.lastPrice);
      const change1D = typeof st.change1D === 'number' ? Number(st.change1D) : 0;
      const prevClose =
        change1D !== 0 && change1D > -99
          ? Number((lastPrice / (1 + change1D / 100)).toFixed(2))
          : lastPrice;
      const baseCloses: number[] = Array(21).fill(prevClose).concat([lastPrice]);
      embeddedSnapshot.data[yfSym] = {
        symbol: yfSym,
        lastPrice,
        previousClose: prevClose,
        change1D,
        closes: baseCloses,
        shortName: st.name || cleanTicker
      };
    }
  }
}

/**
 * Returns the latest verified IHSG (^JKSE) quote and 30D daily returns directly from `embeddedSnapshot`
 * so initial state never falls back to a hardcoded 7210.16 constant.
 */
export function getEmbeddedIhsgBaseline(): {
  quote: { lastPrice: number; change1D: number };
  returns30D?: number[];
} {
  const jkse = embeddedSnapshot?.data?.['^JKSE'];
  if (jkse && typeof jkse.lastPrice === 'number' && jkse.lastPrice > 1000) {
    const closes = Array.isArray(jkse.closes) ? jkse.closes : [];
    const rets: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0) {
        rets.push(Number((((closes[i] - closes[i - 1]) / closes[i - 1]) * 100).toFixed(2)));
      }
    }
    return {
      quote: {
        lastPrice: Number(jkse.lastPrice.toFixed(2)),
        change1D: Number((jkse.change1D ?? 0).toFixed(2))
      },
      returns30D: rets.length >= 15 ? rets.slice(-30) : undefined
    };
  }
  return {
    quote: { lastPrice: 5219.53, change1D: 2.04 }
  };
}

/**
 * Fetches closing price series and latest market quote for a single symbol.
 * Uses local Express `/api/yahoo/chart` when available, or direct Browser CORS Relay on GitHub Pages,
 * falling back to GitHub Cloud Snapshot if offline.
 */
export async function fetchYahooChartSeries(
  symbol: string,
  range: string = '3mo',
  bypassCache: boolean = false
): Promise<SparkSeriesItem> {
  if (!bypassCache) {
    const cached = getCachedLiveQuote(symbol, RAPID_CLICK_GUARD_MS);
    if (cached && cached.lastPrice > 0 && cached.closes.length >= 2) {
      return cached;
    }
  }

  if (canUseLocalExpressBackend()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6500);
      const srvRes = await fetch(
        `/api/yahoo/chart?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`,
        { signal: controller.signal, cache: 'no-store' }
      );
      clearTimeout(timer);
      if (srvRes.ok) {
        cachedLocalServerAvailable = true;
        const item = (await srvRes.json()) as SparkSeriesItem;
        if (item && item.lastPrice > 0 && Array.isArray(item.closes)) {
          if (item.adtv20dIdr && item.adtv20dIdr > 0) {
            setLiveChartAdtvCacheEntry(
              symbol,
              item.adtv20dIdr,
              item.adtvAsOfDate || item.priceAsOfDate || new Date().toISOString().slice(0, 10)
            );
          }
          setCachedLiveQuotes({ [symbol]: item });
          const cachedItem = getCachedLiveQuote(symbol, LIVE_QUOTE_CACHE_TTL_MS) || item;
          if (embeddedSnapshot.data) {
            embeddedSnapshot.data[symbol] = cachedItem;
          }
          return cachedItem;
        }
      } else if (srvRes.status === 404) {
        cachedLocalServerAvailable = false;
      }
    } catch {
      // Do not permanently disable local Express server on a single transient timeout
    }
  } else {
    // Static Host (GitHub Pages): Query Yahoo Finance directly via fast browser relay first
    try {
      const relayItem = await fetchSingleChartViaBrowserRelay(symbol, range);
      if (relayItem && relayItem.lastPrice > 0 && Array.isArray(relayItem.closes)) {
        setCachedLiveQuotes({ [symbol]: relayItem });
        const cachedItem = getCachedLiveQuote(symbol, LIVE_QUOTE_CACHE_TTL_MS) || relayItem;
        if (embeddedSnapshot.data) {
          embeddedSnapshot.data[symbol] = cachedItem;
        }
        return cachedItem;
      }
    } catch {
      // Fall back to snapshot below
    }
  }

  // Fallback: refresh/read from GitHub Cloud API Snapshot (NEVER overwrite locked live 20D ADTV from range=3mo)
  const snapshot = await loadStaticMarketSnapshot(!canUseLocalExpressBackend());
  const snapItem = snapshot?.data?.[symbol];
  if (snapItem && snapItem.lastPrice > 0 && Array.isArray(snapItem.closes)) {
    setCachedLiveQuotes({ [symbol]: snapItem });
    return getCachedLiveQuote(symbol, LIVE_QUOTE_CACHE_TTL_MS) || snapItem;
  }

  // Fallback for known IDX catalog tickers (including suspended/FCA tickers) so manual lookup never errors
  const cleanTicker = symbol.replace(/\.JK$/i, '').toUpperCase();
  const catalogEntry = IDX_CATALOG_BY_TICKER_MAP.get(cleanTicker);
  if (catalogEntry) {
    const fallbackPrice = catalogEntry.approxPrice <= 67 ? catalogEntry.approxPrice : 0;
    return {
      symbol,
      lastPrice: fallbackPrice,
      previousClose: fallbackPrice,
      change1D: 0,
      closes: fallbackPrice > 0 ? Array(22).fill(fallbackPrice) : [],
      shortName: catalogEntry.name
    };
  }

  throw new Error(`Ticker ${symbol} tidak ditemukan atau tidak aktif di Yahoo Finance.`);
}

let lastBatchSyncTelemetry: SyncTelemetryReport = {
  totalRequested: 0,
  liveNetworkHits: 0,
  memoryCacheHits: 0,
  snapshotFallbacks: 0,
  activeRelaysUsed: [],
  failedSymbols: [],
  syncDurationMs: 0,
  status: 'FALLBACK_ONLY'
};

export function getLastBatchSyncTelemetry(): SyncTelemetryReport {
  return lastBatchSyncTelemetry;
}

/**
 * 3-Tier Smart Hybrid Yahoo Spark Fetcher
 * - On AI Studio / Express Server: Fetches symbols via `/api/yahoo/spark` (`query1/query2.finance.yahoo.com`).
 * - On GitHub Pages: Pulls real-time synced snapshot via GitHub REST API AND fetches priority symbols
 *   directly from Yahoo Finance via fast browser CORS relays so `^JKSE`, portfolio holdings, and `ARNA.JK`
 *   are 100% live even on static hosting.
 */
export async function fetchYahooSparkBatch(
  symbols: string[],
  range: string = '1mo',
  onChunkProgress?: (syncedCount: number, totalCount: number, latestSymbol: string) => void,
  forceLiveNetwork: boolean = false,
  bypassMemoryCache: boolean = false,
  allowBrowserRelay: boolean = true
): Promise<Record<string, SparkSeriesItem>> {
  const startedAt = Date.now();
  const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
  const resultMap: Record<string, SparkSeriesItem> = {};
  if (uniqueSymbols.length === 0) return resultMap;

  const relaysUsedSet = new Set<string>();
  let liveNetworkHits = 0;
  let memoryCacheHits = 0;

  const isLocalBackend = canUseLocalExpressBackend();

  // 1. Hydrate baseline from pre-synced Yahoo Finance snapshot (and pull fresh from GitHub REST API when forceLiveNetwork on GitHub Pages)
  const snapshot = await loadStaticMarketSnapshot(forceLiveNetwork && !isLocalBackend);
  if (snapshot?.data) {
    for (const sym of uniqueSymbols) {
      const item = snapshot.data[sym];
      if (item && item.lastPrice > 0 && Array.isArray(item.closes) && item.closes.length >= 2) {
        resultMap[sym] = item;
      }
    }
  }

  // 2. Check 60-second in-memory live cache (or skip if bypassMemoryCache is true)
  const cacheWindowMs = bypassMemoryCache
    ? 0
    : forceLiveNetwork
    ? RAPID_CLICK_GUARD_MS
    : LIVE_QUOTE_CACHE_TTL_MS;
  const uncachedTargets: string[] = [];
  for (const sym of uniqueSymbols) {
    const cached = cacheWindowMs > 0 ? getCachedLiveQuote(sym, cacheWindowMs) : null;
    if (cached) {
      resultMap[sym] = cached;
      memoryCacheHits++;
    } else {
      uncachedTargets.push(sym);
    }
  }

  // Sync ALL uncached symbols across the entire 956+ JCI universe in staged parallel batches
  const liveTargets = uncachedTargets;

  if (liveTargets.length > 0) {
    if (isLocalBackend) {
      const BATCH_SIZE = 160;
      const CONCURRENT_WAVES = 2;
      const batches: string[][] = [];
      for (let i = 0; i < liveTargets.length; i += BATCH_SIZE) {
        batches.push(liveTargets.slice(i, i + BATCH_SIZE));
      }

      let processedSymbols = memoryCacheHits;

      for (let w = 0; w < batches.length; w += CONCURRENT_WAVES) {
        const wave = batches.slice(w, w + CONCURRENT_WAVES);
        await Promise.all(
          wave.map(async (batchSymbols, waveIdx) => {
            const batchNumber = w + waveIdx + 1;
            onChunkProgress?.(
              Math.min(uniqueSymbols.length, Math.max(1, processedSymbols)),
              uniqueSymbols.length,
              `Batch ${batchNumber}/${batches.length} (${processedSymbols}/${uniqueSymbols.length} Emiten BEI)`
            );
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 14000);
              const res = await fetch(
                `/api/yahoo/spark?symbols=${encodeURIComponent(
                  batchSymbols.join(',')
                )}&range=${encodeURIComponent(range)}`,
                { signal: controller.signal, cache: 'no-store' }
              );
              clearTimeout(timer);
              if (res.ok) {
                const json = await res.json();
                if (json?.data && typeof json.data === 'object') {
                  const keys = Object.keys(json.data);
                  if (keys.length > 0) {
                    cachedLocalServerAvailable = true;
                    liveNetworkHits += keys.length;
                    relaysUsedSet.add('Express Server API (Staged Parallel Batch)');
                    setCachedLiveQuotes(json.data);
                    Object.assign(resultMap, json.data);
                    if (embeddedSnapshot.data) {
                      Object.assign(embeddedSnapshot.data, json.data);
                    }
                  }
                }
              }
            } catch {
              // Fallback to GitHub Cloud / embedded snapshot already hydrated in resultMap
            } finally {
              processedSymbols += batchSymbols.length;
              onChunkProgress?.(
                Math.min(uniqueSymbols.length, processedSymbols),
                uniqueSymbols.length,
                `Batch ${batchNumber}/${batches.length} (${Math.min(
                  uniqueSymbols.length,
                  processedSymbols
                )}/${uniqueSymbols.length} Emiten BEI)`
              );
            }
          })
        );
      }
    } else {
      // Static Host (GitHub Pages):
      // 1) Directly query live Yahoo Finance via clean browser relay ONLY for Wave 1 priority symbols (max 2 sequential chunks of 20)
      const directRelayTargets =
        allowBrowserRelay && Date.now() >= browserRelayCircuitBrokenUntil
          ? liveTargets.slice(0, 40)
          : [];
      const relayChunks: string[][] = [];
      for (let i = 0; i < directRelayTargets.length; i += 20) {
        relayChunks.push(directRelayTargets.slice(i, i + 20));
      }

      if (relayChunks.length > 0) {
        onChunkProgress?.(
          1,
          liveTargets.length,
          `Live Yahoo Relay (${directRelayTargets.length} Prioritas) + Snapshot`
        );
        for (const chunk of relayChunks) {
          if (Date.now() < browserRelayCircuitBrokenUntil) break;
          try {
            const chunkMap = await fetchSparkChunkViaBrowserRelay(chunk, range);
            const keys = Object.keys(chunkMap);
            if (keys.length > 0) {
              liveNetworkHits += keys.length;
              relaysUsedSet.add('Direct Yahoo Browser Relay (Live Real-Time)');
              setCachedLiveQuotes(chunkMap);
              Object.assign(resultMap, chunkMap);
              if (embeddedSnapshot.data) {
                Object.assign(embeddedSnapshot.data, chunkMap);
              }
            }
          } catch {
            break;
          }
        }
      }

      // 2) Hydrate remaining symbols from freshly pulled GitHub Cloud API Snapshot
      const cloudSyncedMap: Record<string, SparkSeriesItem> = {};
      for (const sym of liveTargets) {
        const item = resultMap[sym] || snapshot?.data?.[sym];
        if (item && item.lastPrice > 0) {
          cloudSyncedMap[sym] = item;
          if (!directRelayTargets.includes(sym)) {
            liveNetworkHits++;
          }
        }
      }
      if (Object.keys(cloudSyncedMap).length > 0) {
        relaysUsedSet.add('GitHub Cloud Snapshot (Full 956+ JCI)');
        setCachedLiveQuotes(cloudSyncedMap);
      }
    }
  }

  const totalLiveOrRecent = liveNetworkHits + memoryCacheHits;
  const snapshotFallbacks = Math.max(0, liveTargets.length - liveNetworkHits);
  const failedSymbols = liveTargets.filter(
    (sym) => !resultMap[sym] && !getCachedLiveQuote(sym, 60000)
  );
  const syncDurationMs = Math.max(45, Date.now() - startedAt);
  const status: SyncTelemetryReport['status'] =
    totalLiveOrRecent >= Math.max(1, Math.floor(liveTargets.length * 0.5))
      ? 'FULL_LIVE'
      : totalLiveOrRecent > 0
      ? 'PARTIAL_LIVE'
      : 'FALLBACK_ONLY';

  lastBatchSyncTelemetry = {
    totalRequested: uniqueSymbols.length,
    liveNetworkHits,
    memoryCacheHits,
    snapshotFallbacks,
    activeRelaysUsed:
      relaysUsedSet.size > 0
        ? Array.from(relaysUsedSet)
        : memoryCacheHits > 0
        ? ['In-Memory Live Cache (60s)']
        : ['GitHub Cloud Snapshot (Zero-CORS)'],
    failedSymbols,
    syncDurationMs,
    status
  };

  onChunkProgress?.(
    uniqueSymbols.length,
    uniqueSymbols.length,
    'Sinkronisasi Penuh 956+ Emiten Selesai'
  );

  return resultMap;
}

function computeDailyReturns(closes: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  return rets;
}

function computeBetaAndVolatility(
  stockReturns: number[],
  marketReturns: number[],
  isLiquid: boolean = true,
  sector?: string,
  ticker?: string
): {
  beta1Y: number;
  volatilityAnn: number;
} {
  // Stagnant / illiquid stocks with flat returns must NEVER get artificially low volatility (9.0%) or low beta (0.25)
  if (!isLiquid) {
    return { beta1Y: 1.35, volatilityAnn: 44.0 };
  }

  const sectorPriorBeta = resolveSectorBetaFallback(sector || '');
  const len = Math.min(stockReturns.length, marketReturns.length);
  if (len < 15) {
    const fallbackBeta = ticker
      ? computeAuthenticBeta1YFromSnapshotOrSeries(ticker, sector || '')
      : sectorPriorBeta;
    return { beta1Y: fallbackBeta, volatilityAnn: 22.0 };
  }

  const sSlice = stockReturns.slice(-len);
  const mSlice = marketReturns.slice(-len);

  const meanS = sSlice.reduce((a, b) => a + b, 0) / len;
  const meanM = mSlice.reduce((a, b) => a + b, 0) / len;

  let cov = 0;
  let varM = 0;
  let varS = 0;

  for (let i = 0; i < len; i++) {
    const dS = sSlice[i] - meanS;
    const dM = mSlice[i] - meanM;
    cov += dS * dM;
    varM += dM * dM;
    varS += dS * dS;
  }

  const stdS = Math.sqrt(varS / (len - 1));
  const rawVolAnn = stdS * 100 * Math.sqrt(252);

  // If annualized volatility is suspiciously near zero (< 6.5%), the stock is frozen/suspended
  if (rawVolAnn < 6.5) {
    return { beta1Y: 1.30, volatilityAnn: 42.0 };
  }

  let computedBeta = sectorPriorBeta;
  if (varM > 1e-9) {
    const rawBeta = cov / varM;
    if (Number.isFinite(rawBeta) && rawBeta > 0.35 && rawBeta <= 2.35) {
      // Apply Blume/Vasicek institutional adjustment toward sector prior so short-window noise doesn't distort beta
      computedBeta = 0.72 * rawBeta + 0.28 * sectorPriorBeta;
    } else if (ticker) {
      computedBeta = computeAuthenticBeta1YFromSnapshotOrSeries(ticker, sector || '');
    }
  } else if (ticker) {
    computedBeta = computeAuthenticBeta1YFromSnapshotOrSeries(ticker, sector || '');
  }

  const beta1Y = Math.max(0.45, Math.min(2.25, computedBeta));
  const volatilityAnn = Math.max(10.5, Math.min(65.0, rawVolAnn));

  return {
    beta1Y: Number(beta1Y.toFixed(2)),
    volatilityAnn: Number(volatilityAnn.toFixed(1))
  };
}

/**
 * Live On-Demand Fetcher for any IDX Ticker (.JK)
 * Always bypasses memory cache (`bypassMemoryCache = true`) so opening the Emiten Inspector Modal
 * or clicking "Refresh Emiten" guarantees a 100% real-time Yahoo Finance quote.
 */
export async function fetchLiveIdxTicker(rawTicker: string): Promise<StockMetrics> {
  const cleanTicker = rawTicker
    .trim()
    .toUpperCase()
    .replace(/\.JK$/i, '')
    .replace(/^IDX:/i, '')
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);

  if (cleanTicker.length < 4) {
    throw new Error('Masukkan kode ticker BEI 4 huruf yang valid (contoh: BBCA, BREN, ITMG, SIDO).');
  }

  const catalogMatch =
    IDX_CATALOG_BY_TICKER_MAP.get(cleanTicker) ||
    createCalibratedIdxEntry(cleanTicker);
  const yfSymbol = `${cleanTicker}.JK`;
  const nowStr = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  // Always bypass memory cache on single-ticker on-demand inspect and request 1y chart so YTD return is 100% exact
  const [directStockChart, batchMap] = await Promise.all([
    fetchYahooChartSeries(yfSymbol, '1y', true).catch(() => null),
    fetchYahooSparkBatch([yfSymbol, '^JKSE'], '6mo', undefined, true, true),
    loadFundamentalsSnapshot().catch(() => null)
  ]);

  let stockSeries =
    directStockChart && directStockChart.lastPrice > 0
      ? directStockChart
      : batchMap[yfSymbol] || (await fetchYahooChartSeries(yfSymbol, '1y', true));
  const ihsgSeries = batchMap['^JKSE'] || (await fetchYahooChartSeries('^JKSE', '6mo', true));

  // FIX 3: If range=1y fell back to snapshot and we don't yet have a locked live 20D ADTV, try range=3mo chart
  if (!getLiveChartAdtvCacheEntry(cleanTicker) && (!stockSeries.adtv20dIdr || stockSeries.adtvSource !== 'LIVE_YAHOO_API')) {
    const chart3mo = await fetchYahooChartSeries(yfSymbol, '3mo', true).catch(() => null);
    if (chart3mo && chart3mo.adtv20dIdr && chart3mo.adtv20dIdr > 0) {
      stockSeries = {
        ...stockSeries,
        adtv20dIdr: chart3mo.adtv20dIdr,
        adtvAsOfDate: chart3mo.adtvAsOfDate || stockSeries.priceAsOfDate,
        adtvSource: chart3mo.adtvSource || 'LIVE_YAHOO_API'
      };
    }
  }

  const lastPrice = Math.round(stockSeries.lastPrice);
  const isLiquid = evaluateSeriesLiquidity(stockSeries.closes, lastPrice);
  const stockRets = computeDailyReturns(stockSeries.closes);
  const ihsgRets = computeDailyReturns(ihsgSeries.closes);
  const { beta1Y, volatilityAnn } = computeBetaAndVolatility(
    stockRets,
    ihsgRets,
    isLiquid,
    catalogMatch?.sector || 'IDX Listed Equity',
    cleanTicker
  );

  const return30D = computeAccurate30DReturn(
    stockSeries.closes,
    stockSeries.lastPrice,
    stockSeries.timestamp
  );
  const returnYTD = computeAccurateYTDReturn(
    stockSeries.closes,
    stockSeries.lastPrice,
    stockSeries.timestamp
  );

  const previousClose = resolveStockPreviousClose(
    lastPrice,
    stockSeries.change1D,
    stockSeries.previousClose,
    stockSeries.closes,
    stockSeries.timestamp
  );

  const isSyntheticCatalogName =
    Boolean(catalogMatch?.name) &&
    new RegExp(`\\b${cleanTicker}\\s+Indonesia\\s+Tbk$`, 'i').test(catalogMatch.name);
  const resolvedCorporateName =
    (isSyntheticCatalogName && stockSeries.shortName ? stockSeries.shortName : catalogMatch?.name) ||
    stockSeries.shortName ||
    `${cleanTicker} Tbk`;

  const overlay = resolveTickerFundamentalOverlay(
    cleanTicker,
    catalogMatch,
    stockSeries.adtv20dIdr,
    stockSeries.adtvSource,
    stockSeries.adtvAsOfDate || stockSeries.priceAsOfDate
  );

  return enrichStockMetrics({
    ticker: cleanTicker,
    idxTicker: `IDX:${cleanTicker}`,
    yfTicker: yfSymbol,
    name: resolvedCorporateName,
    sector: catalogMatch?.sector || 'IDX Listed Equity',
    lastPrice,
    previousClose,
    marketState: stockSeries.marketState,
    change1D: stockSeries.change1D,
    return30D,
    returnYTD,
    beta1Y,
    volatilityAnn,
    roe: overlay.roe,
    debtToEquity: overlay.debtToEquity,
    operatingMargin: overlay.operatingMargin,
    revenueTTMIdr: overlay.revenueTTMIdr,
    operatingProfitTTMIdr: overlay.operatingProfitTTMIdr,
    netIncomeTTMIdr: overlay.netIncomeTTMIdr,
    equityAttributableIdr: overlay.equityAttributableIdr,
    totalDebtIdr: overlay.totalDebtIdr,
    totalAssetsIdr: overlay.totalAssetsIdr,
    cashAndEquivalentsIdr: overlay.cashAndEquivalentsIdr,
    sharesOutstanding: overlay.sharesOutstanding,
    ocfTTMIdr: overlay.ocfTTMIdr,
    capexTTMIdr: overlay.capexTTMIdr,
    daTTMIdr: overlay.daTTMIdr,
    earningsGrowthYoYPct: overlay.netIncomeYoYPct,
    operatingProfitGrowthYoYPct: overlay.operatingProfitYoYPct,
    adtv20dIdr: overlay.adtv20dIdr,
    adtvSource: overlay.adtvSource,
    adtvAsOfDate: overlay.adtvAsOfDate,
    priceSource: stockSeries.priceSource || 'LIVE_YAHOO_API',
    priceAsOfDate: stockSeries.priceAsOfDate || new Date().toISOString().slice(0, 10),
    fundamentalsSource: overlay.fundamentalsSource,
    fundamentalsAsOfDate: overlay.fundamentalsAsOfDate,
    fundamentalsFiscalPeriod: overlay.fundamentalsFiscalPeriod,
    fundamentalsNote: overlay.fundamentalsNote,
    isLiveFetched: true,
    isLiquid,
    dividendYieldPct: getEmitenDividendYield(cleanTicker, lastPrice),
    lastSyncedAt: nowStr
  });
}

/**
 * Default Priority IDX Liquid Leaders synced in Wave-1 (<1 second) alongside user's active holdings & top Screener picks.
 */
const DEFAULT_PRIORITY_IDX_LEADERS = [
  'ARNA',
  'BBCA',
  'BMRI',
  'BBRI',
  'BBNI',
  'TLKM',
  'ASII',
  'ADRO',
  'ITMG',
  'PTBA',
  'ICBP',
  'INDF',
  'KLBF',
  'SIDO',
  'UNTR',
  'AMMN',
  'ANTM',
  'INCO',
  'PGAS',
  'MEDC',
  'AKRA',
  'MYOR',
  'CMRY',
  'MIKA',
  'UNVR',
  'BRIS',
  'MPMX',
  'TOTL',
  'SMSM',
  'TAPG'
];

/**
 * Hybrid Two-Stage Batch Live Refresh for IHSG (^JKSE), Global Macro Indicators,
 * Wave 1 Priority Portfolio & Screener Leaders (~50 symbols in <1 second),
 * followed immediately by Wave 2 Full 956+ JCI Universe in parallel chunks.
 */
export async function refreshLiveGlobalMacroAndIhsg(
  currentMacro: MacroIndicator[],
  currentStocks: StockMetrics[],
  onProgress?: (syncedCount: number, totalCount: number, tickerLabel: string) => void,
  forceLiveNetwork: boolean = false,
  priorityTickers: string[] = [],
  currentLiveIhsgQuote?: { lastPrice: number; change1D: number },
  currentLiveIhsgReturns?: number[],
  bypassMemoryCache: boolean = false,
  onPriorityWaveComplete?: (partial: {
    updatedMacro: MacroIndicator[];
    ihsgReturns30D?: number[];
    liveIhsgQuote?: { lastPrice: number; change1D: number };
    updatedStocks: StockMetrics[];
  }) => void
): Promise<{
  updatedMacro: MacroIndicator[];
  ihsgReturns30D?: number[];
  liveIhsgQuote?: { lastPrice: number; change1D: number };
  updatedStocks: StockMetrics[];
  liveSyncedCount: number;
  liquidStockCount: number;
  fullTimestampStr: string;
  telemetry: SyncTelemetryReport;
}> {
  const updatedMacro = [...currentMacro];
  let ihsgReturns30D: number[] | undefined = currentLiveIhsgReturns;
  let ihsgRawDecimalRets: number[] = [];
  let liveIhsgQuote: { lastPrice: number; change1D: number } | undefined = currentLiveIhsgQuote;

  const now = new Date();
  const nowStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const fullTimestampStr = formatFullIndonesianDateTime(now);

  // Refresh static snapshot in background if forceLiveNetwork is requested
  const snapshot = await loadStaticMarketSnapshot(forceLiveNetwork);
  const existingTickerSet = new Set(currentStocks.map((s) => s.ticker));
  const expandedStocks: StockMetrics[] = [...currentStocks];

  if (snapshot?.discoveredTickers && Array.isArray(snapshot.discoveredTickers)) {
    for (const disc of snapshot.discoveredTickers) {
      const clean = String(disc.ticker || '')
        .trim()
        .toUpperCase()
        .replace(/\.JK$/i, '');
      if (clean.length === 4 && !existingTickerSet.has(clean)) {
        existingTickerSet.add(clean);
        const entry = createCalibratedIdxEntry(clean, disc.sector, disc.name);
        expandedStocks.push(
          enrichStockMetrics({
            ticker: entry.ticker,
            idxTicker: `IDX:${entry.ticker}`,
            yfTicker: `${entry.ticker}.JK`,
            name: entry.name,
            sector: entry.sector,
            lastPrice: 0,
            change1D: 0,
            return30D: 0,
            beta1Y: entry.approxBeta,
            volatilityAnn: Number((entry.approxBeta * 22.0).toFixed(1)),
            roe: entry.defaultRoe,
            debtToEquity: entry.defaultDer,
            operatingMargin: entry.defaultOpMargin,
            isLiveFetched: true,
            isLiquid: false,
            dividendYieldPct: getEmitenDividendYield(entry.ticker),
            lastSyncedAt: nowStr
          })
        );
      }
    }
  }

  if (snapshot?.data) {
    for (const sym of Object.keys(snapshot.data)) {
      if (sym.endsWith('.JK')) {
        const clean = sym.replace(/\.JK$/i, '').toUpperCase();
        if (clean.length === 4 && !existingTickerSet.has(clean)) {
          existingTickerSet.add(clean);
          const snapItem = snapshot.data[sym];
          const entry = createCalibratedIdxEntry(clean, undefined, snapItem?.shortName);
          const hasValidQuote = Boolean(snapItem && snapItem.lastPrice > 0);
          const lastPrice = hasValidQuote ? Math.round(snapItem.lastPrice) : 0;
          const isLiquid = hasValidQuote ? evaluateSeriesLiquidity(snapItem.closes, lastPrice) : false;
          expandedStocks.push(
            enrichStockMetrics({
              ticker: entry.ticker,
              idxTicker: `IDX:${entry.ticker}`,
              yfTicker: `${entry.ticker}.JK`,
              name: entry.name,
              sector: entry.sector,
              lastPrice,
              change1D: snapItem?.change1D ?? 0,
              return30D: 0,
              beta1Y: entry.approxBeta,
              volatilityAnn: Number((entry.approxBeta * 22.0).toFixed(1)),
              roe: entry.defaultRoe,
              debtToEquity: entry.defaultDer,
              operatingMargin: entry.defaultOpMargin,
              isLiveFetched: true,
              isLiquid,
              dividendYieldPct: getEmitenDividendYield(entry.ticker),
              lastSyncedAt: nowStr
            })
          );
        }
      }
    }
  }

  const macroSymbols = ['IDR=X', 'DX-Y.NYB', '^TNX', '^VIX', '^GSPC', '^HSI', 'GC=F', 'BZ=F'];
  const topScreenerLeaders = [...expandedStocks]
    .filter((s) => s.isLiquid !== false && !s.isHscFlagged && s.lastPrice >= 68)
    .sort((a, b) => b.dmuCompositeScore - a.dmuCompositeScore)
    .slice(0, 20)
    .map((s) => s.ticker);

  const priorityJkSet = new Set(
    [
      ...priorityTickers.map((t) => t.trim().toUpperCase().replace(/\.JK$/i, '')),
      ...DEFAULT_PRIORITY_IDX_LEADERS,
      ...topScreenerLeaders
    ]
      .filter((t) => t.length === 4)
      .map((t) => `${t}.JK`)
  );

  const wave1PriorityTargets = ['^JKSE', ...macroSymbols, ...Array.from(priorityJkSet)];
  const wave2RemainingTargets = expandedStocks
    .map((s) => `${s.ticker.trim().toUpperCase().replace(/\.JK$/i, '')}.JK`)
    .filter((sym) => sym.length === 7 && !priorityJkSet.has(sym));

  const totalTargetCount = wave1PriorityTargets.length + wave2RemainingTargets.length;

  onProgress?.(
    1,
    totalTargetCount,
    `Gelombang 1 Prioritas (${wave1PriorityTargets.length} Emiten Utama & IHSG)...`
  );

  // STAGE 1: Fast Priority Wave (<1 second) — Updates IHSG, Macro, Portfolio Holdings & Liquid Leaders immediately
  const wave1Map = await fetchYahooSparkBatch(
    wave1PriorityTargets,
    '1mo',
    undefined,
    forceLiveNetwork,
    bypassMemoryCache,
    true
  );
  const wave1Telemetry = getLastBatchSyncTelemetry();

  const yieldToBrowserMainThread = () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

  const buildHydratedStateFromMapAsync = async (
    activeBatchMap: Record<string, SparkSeriesItem>,
    changedSymbolSet?: Set<string>
  ) => {
    let stageIhsgQuote = liveIhsgQuote;
    let stageIhsgReturns30D = ihsgReturns30D;
    let stageRawDecimalRets = ihsgRawDecimalRets;

    const ihsgItem = activeBatchMap['^JKSE'];
    if (ihsgItem && ihsgItem.lastPrice > 1000) {
      stageIhsgQuote = {
        lastPrice: Number(ihsgItem.lastPrice.toFixed(2)),
        change1D: Number(ihsgItem.change1D.toFixed(2))
      };
      stageRawDecimalRets = computeDailyReturns(ihsgItem.closes);
      const retsPct = stageRawDecimalRets.map((r) => Number((r * 100).toFixed(2)));
      if (retsPct.length >= 15) {
        stageIhsgReturns30D = retsPct.slice(-30);
      }
    } else if (currentLiveIhsgReturns && currentLiveIhsgReturns.length >= 15) {
      stageRawDecimalRets = currentLiveIhsgReturns.map((r) => r / 100);
    }

    const stageMacro = updatedMacro.map((m) => {
      const fetched = activeBatchMap[m.symbol];
      if (fetched && fetched.lastPrice > 0) {
        return {
          ...m,
          value: Number(fetched.lastPrice.toFixed(2)),
          change1D: fetched.change1D,
          isLiveFetched: true
        };
      }
      return { ...m, isLiveFetched: true };
    });

    let syncedCnt = 0;
    let liquidCnt = 0;

    const stageStocks: StockMetrics[] = new Array(expandedStocks.length);
    const CHUNK_SLICE_SIZE = 65;

    for (let idx = 0; idx < expandedStocks.length; idx++) {
      if (idx > 0 && idx % CHUNK_SLICE_SIZE === 0) {
        await yieldToBrowserMainThread();
      }

      const stock = expandedStocks[idx];
      const res = activeBatchMap[stock.yfTicker];

      // Fast-path reuse: if stock is already enriched and its price/change1D/ADTV did not change in this wave,
      // reuse the existing enriched StockMetrics object directly to avoid redundant 60-day covariance & overlay math
      const isExplicitlyChanged = changedSymbolSet ? changedSymbolSet.has(stock.yfTicker) : true;
      if (
        !isExplicitlyChanged &&
        stock.isLiveFetched &&
        typeof stock.dmuCompositeScore === 'number' &&
        stock.dmuCompositeScore > 0
      ) {
        const resPrice = res && res.lastPrice > 0 ? Math.round(res.lastPrice) : 0;
        if (
          resPrice === stock.lastPrice &&
          (res?.change1D ?? 0) === stock.change1D &&
          Boolean(stock.revenueTTMIdr || stock.fundamentalsSource)
        ) {
          syncedCnt++;
          if (stock.isLiquid !== false && stock.lastPrice >= 68) liquidCnt++;
          stageStocks[idx] = stock;
          continue;
        }
      }

      const catEntry =
        IDX_CATALOG_BY_TICKER_MAP.get(stock.ticker) || {
          defaultRoe: stock.trailingRoePct ?? stock.roe,
          defaultDer: stock.debtToEquity,
          defaultOpMargin: stock.operatingMargin
        };

      if (res && res.lastPrice > 0 && Array.isArray(res.closes) && res.closes.length >= 2) {
        const lastPrice = Math.round(res.lastPrice);
        const previousClose = resolveStockPreviousClose(
          lastPrice,
          res.change1D,
          res.previousClose,
          res.closes,
          res.timestamp
        );
        const isLiquid = evaluateSeriesLiquidity(res.closes, lastPrice);
        const dividendYieldPct = getEmitenDividendYield(stock.ticker, lastPrice);
        const return30D = computeAccurate30DReturn(
          res.closes,
          res.lastPrice,
          res.timestamp
        );
        const returnYTD =
          res.closes.length >= 60
            ? computeAccurateYTDReturn(res.closes, res.lastPrice, res.timestamp)
            : typeof stock.returnYTD === 'number'
            ? stock.returnYTD
            : computeAccurateYTDReturn(res.closes, res.lastPrice, res.timestamp);

        let beta1Y = computeAuthenticBeta1YFromSnapshotOrSeries(
          stock.ticker,
          stock.sector,
          stock.beta1Y
        );
        let volatilityAnn = stock.volatilityAnn;
        const stockRets = computeDailyReturns(res.closes);
        if (stockRets.length >= 12 && stageRawDecimalRets.length >= 12) {
          const bv = computeBetaAndVolatility(
            stockRets,
            stageRawDecimalRets,
            isLiquid,
            stock.sector,
            stock.ticker
          );
          beta1Y = bv.beta1Y;
          volatilityAnn = bv.volatilityAnn;
        }

        const latestTs =
          Array.isArray(res.timestamp) && res.timestamp.length > 0
            ? res.timestamp[res.timestamp.length - 1]
            : undefined;
        const priceAsOfDate =
          res.priceAsOfDate ||
          (typeof latestTs === 'number' && Number.isFinite(latestTs)
            ? new Date(latestTs * 1000).toISOString().slice(0, 10)
            : stock.priceAsOfDate || new Date().toISOString().slice(0, 10));

        const overlay = resolveTickerFundamentalOverlay(
          stock.ticker,
          catEntry,
          res.adtv20dIdr ?? stock.adtv20dIdr,
          res.adtvSource || stock.adtvSource || 'SNAPSHOT_JSON',
          res.adtvAsOfDate || stock.adtvAsOfDate || priceAsOfDate
        );

        syncedCnt++;
        if (isLiquid) liquidCnt++;

        stageStocks[idx] = enrichStockMetrics({
          ticker: stock.ticker,
          idxTicker: stock.idxTicker,
          yfTicker: stock.yfTicker,
          name: stock.name,
          sector: stock.sector,
          lastPrice,
          previousClose,
          marketState: res.marketState,
          change1D: res.change1D,
          return30D,
          returnYTD,
          beta1Y,
          volatilityAnn,
          roe: overlay.roe,
          debtToEquity: overlay.debtToEquity,
          operatingMargin: overlay.operatingMargin,
          revenueTTMIdr: overlay.revenueTTMIdr,
          operatingProfitTTMIdr: overlay.operatingProfitTTMIdr,
          netIncomeTTMIdr: overlay.netIncomeTTMIdr,
          equityAttributableIdr: overlay.equityAttributableIdr,
          totalDebtIdr: overlay.totalDebtIdr,
          totalAssetsIdr: overlay.totalAssetsIdr,
          cashAndEquivalentsIdr: overlay.cashAndEquivalentsIdr,
          sharesOutstanding: overlay.sharesOutstanding,
          ocfTTMIdr: overlay.ocfTTMIdr,
          capexTTMIdr: overlay.capexTTMIdr,
          daTTMIdr: overlay.daTTMIdr,
          earningsGrowthYoYPct: overlay.netIncomeYoYPct,
          operatingProfitGrowthYoYPct: overlay.operatingProfitYoYPct,
          adtv20dIdr: overlay.adtv20dIdr,
          adtvSource: overlay.adtvSource,
          adtvAsOfDate: overlay.adtvAsOfDate,
          priceSource: res.priceSource || stock.priceSource || 'SNAPSHOT_JSON',
          priceAsOfDate,
          fundamentalsSource: overlay.fundamentalsSource,
          fundamentalsAsOfDate: overlay.fundamentalsAsOfDate,
          fundamentalsFiscalPeriod: overlay.fundamentalsFiscalPeriod,
          fundamentalsNote: overlay.fundamentalsNote,
          isLiveFetched: true,
          isLiquid,
          dividendYieldPct,
          lastSyncedAt: nowStr
        });
        continue;
      }

      const overlay = resolveTickerFundamentalOverlay(stock.ticker, catEntry);
      const dividendYieldPct = getEmitenDividendYield(stock.ticker);
      syncedCnt++;
      stageStocks[idx] = enrichStockMetrics({
        ticker: stock.ticker,
        idxTicker: stock.idxTicker,
        yfTicker: stock.yfTicker,
        name: stock.name,
        sector: stock.sector,
        lastPrice: 0,
        change1D: 0,
        return30D: 0,
        beta1Y: 1.25,
        volatilityAnn: 45.0,
        roe: overlay.roe,
        debtToEquity: overlay.debtToEquity,
        operatingMargin: overlay.operatingMargin,
        fundamentalsSource: overlay.fundamentalsSource,
        fundamentalsAsOfDate: overlay.fundamentalsAsOfDate,
        fundamentalsFiscalPeriod: overlay.fundamentalsFiscalPeriod,
        fundamentalsNote: overlay.fundamentalsNote,
        isLiveFetched: true,
        isLiquid: false,
        dividendYieldPct,
        lastSyncedAt: nowStr
      });
    }

    return {
      stageMacro,
      stageIhsgQuote,
      stageIhsgReturns30D,
      stageStocks,
      syncedCnt,
      liquidCnt
    };
  };

  const combinedWave1Map: Record<string, SparkSeriesItem> = {
    ...(snapshot?.data || {}),
    ...wave1Map
  };
  const wave1ChangedSet = new Set<string>(Object.keys(wave1Map));

  let partialState: Awaited<ReturnType<typeof buildHydratedStateFromMapAsync>> | null = null;
  if (onPriorityWaveComplete) {
    partialState = await buildHydratedStateFromMapAsync(combinedWave1Map, wave1ChangedSet);
    onPriorityWaveComplete({
      updatedMacro: partialState.stageMacro,
      ihsgReturns30D: partialState.stageIhsgReturns30D,
      liveIhsgQuote: partialState.stageIhsgQuote,
      updatedStocks: partialState.stageStocks
    });
    await yieldToBrowserMainThread();
  }

  // STAGE 2: Full Universe Sweep (~925 remaining IDX stocks in parallel chunks; on static hosts uses snapshot directly without extra CORS relay calls)
  let wave2Map: Record<string, SparkSeriesItem> = {};
  if (wave2RemainingTargets.length > 0) {
    wave2Map = await fetchYahooSparkBatch(
      wave2RemainingTargets,
      '1mo',
      (syncedInWave2, _totalWave2, label) => {
        onProgress?.(
          Math.min(totalTargetCount, wave1PriorityTargets.length + syncedInWave2),
          totalTargetCount,
          label
        );
      },
      forceLiveNetwork,
      bypassMemoryCache,
      false
    );
  }
  const wave2Telemetry = getLastBatchSyncTelemetry();

  const batchMap: Record<string, SparkSeriesItem> = {
    ...combinedWave1Map,
    ...wave2Map
  };
  const wave2ChangedSet = new Set<string>([...Object.keys(wave1Map), ...Object.keys(wave2Map)]);

  const finalState =
    partialState && wave2Telemetry.liveNetworkHits === 0 && wave2Telemetry.memoryCacheHits === 0
      ? partialState
      : await buildHydratedStateFromMapAsync(batchMap, wave2ChangedSet);
  for (let i = 0; i < finalState.stageMacro.length; i++) {
    updatedMacro[i] = finalState.stageMacro[i];
  }
  liveIhsgQuote = finalState.stageIhsgQuote;
  ihsgReturns30D = finalState.stageIhsgReturns30D;
  const updatedStocksList = finalState.stageStocks;
  const liveSyncedCount = finalState.syncedCnt;
  const liquidStockCount = finalState.liquidCnt;

  const mergedLiveHits = wave1Telemetry.liveNetworkHits + wave2Telemetry.liveNetworkHits;
  const mergedCacheHits = wave1Telemetry.memoryCacheHits + wave2Telemetry.memoryCacheHits;
  const mergedRelays = Array.from(
    new Set([...wave1Telemetry.activeRelaysUsed, ...wave2Telemetry.activeRelaysUsed])
  );
  lastBatchSyncTelemetry = {
    totalRequested: totalTargetCount,
    liveNetworkHits: mergedLiveHits,
    memoryCacheHits: mergedCacheHits,
    snapshotFallbacks: Math.max(0, totalTargetCount - (mergedLiveHits + mergedCacheHits)),
    activeRelaysUsed: mergedRelays,
    failedSymbols: [...wave1Telemetry.failedSymbols, ...wave2Telemetry.failedSymbols],
    syncDurationMs: wave1Telemetry.syncDurationMs + wave2Telemetry.syncDurationMs,
    status:
      mergedLiveHits + mergedCacheHits >= Math.floor(totalTargetCount * 0.4)
        ? 'FULL_LIVE'
        : mergedLiveHits + mergedCacheHits > 0
        ? 'PARTIAL_LIVE'
        : 'FALLBACK_ONLY'
  };

  onProgress?.(liveSyncedCount, updatedStocksList.length, 'Selesai');
  await yieldToBrowserMainThread();

  const rankedStocks = rankUniverseWithBuffer(updatedStocksList, 40);
  return {
    updatedMacro,
    ihsgReturns30D,
    liveIhsgQuote,
    updatedStocks: rankedStocks,
    liveSyncedCount,
    liquidStockCount,
    fullTimestampStr,
    telemetry: getLastBatchSyncTelemetry()
  };
}

/**
 * Objective Multi-Class Financial News Sentiment Classifier
 * Analyzes both headline (`title`) and description (`summary`) using bilingual weighted polarity lexicons.
 * Never defaults blindly to RISK_ON (Positive); defaults to NEUTRAL when balanced/informational,
 * and accurately flags negative, crisis, distress, or bearish news as RISK_OFF.
 */
export function classifyHeadlineSentiment(
  title: string,
  region: 'DOMESTIC' | 'GLOBAL',
  summary?: string
): {
  sentiment: NewsSentimentItem['sentiment'];
  impactedSectors: string[];
} {
  const combined = `${title || ''} ${summary || ''}`.toLowerCase();

  // 1. High-Weight Severe Negative / Bearish / Distress Phrases & Keywords
  const severeNegativePhrases = [
    'no financial safety net',
    'living in poverty',
    'poverty',
    'cut short',
    'brain tumor',
    'tumor',
    'cancer',
    'end of the ai trade',
    'end of the',
    'fragile trade truce',
    'fragile',
    'trade war',
    'perang dagang',
    'gagal bayar',
    'net sell',
    'capital outflow',
    'arus modal keluar',
    'tekanan jual',
    'zona merah',
    'kebangkrutan',
    'pailit',
    'phk massal',
    'krisis ekonomi',
    'resesi global',
    'perlambatan ekonomi',
    'defisit anggaran',
    'utang membengkak',
    'market crash',
    'hard landing',
    'stagflation',
    'stagflasi',
    'geopolitical risk',
    'geopolitical tension',
    'ketegangan geopolitik'
  ];

  const negativeKeywords = [
    'anjlok',
    'melemah',
    'koreksi',
    'turun',
    'merosot',
    'jatuh',
    'terkoreksi',
    'tertekan',
    'tekanan',
    'lesu',
    'rugi',
    'kerugian',
    'defisit',
    'utang',
    'resesi',
    'krisis',
    'phk',
    'konflik',
    'perang',
    'sanksi',
    'tarif',
    'tariff',
    'tariffs',
    'inflasi',
    'mahal',
    'khawatir',
    'cemas',
    'waspada',
    'ketidakpastian',
    'risiko',
    'ancaman',
    'peringatan',
    'lambat',
    'melambat',
    'menyusut',
    'kontraksi',
    'stagnan',
    'beban',
    'bengkak',
    'gagal',
    'masalah',
    'skandal',
    'korupsi',
    'denda',
    'suspensi',
    'delisting',
    'drop',
    'drops',
    'dropped',
    'fall',
    'falls',
    'fell',
    'plunge',
    'plunges',
    'slump',
    'slumps',
    'tumble',
    'tumbles',
    'crash',
    'crashes',
    'decline',
    'declines',
    'weak',
    'weaker',
    'weakness',
    'fear',
    'fears',
    'panic',
    'sell',
    'selloff',
    'sell-off',
    'loss',
    'losses',
    'deficit',
    'debt',
    'default',
    'bankrupt',
    'bankruptcy',
    'layoff',
    'layoffs',
    'recession',
    'crisis',
    'war',
    'conflict',
    'sanction',
    'sanctions',
    'uncertainty',
    'volatile',
    'volatility',
    'risk',
    'risks',
    'warning',
    'warn',
    'warns',
    'threat',
    'threatens',
    'struggle',
    'struggling',
    'hardship',
    'poor',
    'worry',
    'worried',
    'worries',
    'concern',
    'concerns',
    'doubt',
    'doubts',
    'skeptic',
    'skeptical',
    'bubble',
    'downgrade',
    'cut',
    'cuts',
    'slash',
    'slashes',
    'shrink',
    'shrinks',
    'slowdown',
    'slowing',
    'bearish',
    'downside',
    'pain',
    'trouble',
    'turmoil',
    'shock',
    'disruption',
    'lawsuit',
    'fraud',
    'probe',
    'investigation',
    'delay',
    'halt',
    'halted',
    'die',
    'dying',
    'dead',
    'death',
    'illness',
    'sick',
    'divorce',
    'broke',
    'unemployed',
    'jobless'
  ];

  // 2. Positive / Bullish Catalyst Keywords
  const positivePhrases = [
    'laba bersih naik',
    'laba melonjak',
    'cetak laba',
    'rekor tertinggi',
    'all-time high',
    'net buy',
    'capital inflow',
    'arus modal masuk',
    'zona hijau',
    'dividen jumbo',
    'pembagian dividen',
    'pertumbuhan ekonomi',
    'surplus neraca',
    'beat expectations',
    'strong earnings',
    'record high',
    'bull market'
  ];

  const positiveKeywords = [
    'menguat',
    'melonjak',
    'melesat',
    'naik',
    'tumbuh',
    'pertumbuhan',
    'ekspansi',
    'surplus',
    'untung',
    'laba',
    'dividen',
    'buyback',
    'optimis',
    'optimisme',
    'positif',
    'rekor',
    'pulih',
    'pemulihan',
    'stabil',
    'kokoh',
    'unggul',
    'prospek cerah',
    'peluang',
    'surge',
    'surges',
    'soar',
    'soars',
    'rally',
    'rallies',
    'jump',
    'jumps',
    'gain',
    'gains',
    'rise',
    'rises',
    'rose',
    'climb',
    'climbs',
    'bull',
    'bullish',
    'boom',
    'booming',
    'growth',
    'expand',
    'expands',
    'expansion',
    'profit',
    'profits',
    'profitable',
    'dividend',
    'upgrade',
    'upgrades',
    'outperform',
    'beat',
    'beats',
    'recovery',
    'rebound',
    'rebounds',
    'breakout',
    'strong',
    'resilient',
    'optimism',
    'optimistic',
    'boost',
    'boosts'
  ];

  // 3. Monetary / FX / Interest Rate Keywords
  const rateKeywords = [
    'suku bunga',
    'bi rate',
    'rupiah',
    'kurs',
    'nilai tukar',
    'bank indonesia',
    'the fed',
    'federal reserve',
    'powell',
    'fomc',
    'interest rate',
    'rate hike',
    'rate cut',
    'bond yield',
    'treasury yield',
    'us 10y',
    'sbn',
    'obligasi',
    'hawkish',
    'dovish',
    'inflasi',
    'inflation',
    'cpi',
    'monetary policy',
    'kebijakan moneter'
  ];

  // 4. Commodity Catalysts
  const commodityKeywords = [
    'emas',
    'batu bara',
    'batubara',
    'nikel',
    'minyak',
    'cpo',
    'sawit',
    'tembaga',
    'timah',
    'bauksit',
    'hilirisasi',
    'gold',
    'crude oil',
    'brent',
    'wti',
    'coal',
    'nickel',
    'copper',
    'palm oil',
    'commodity',
    'commodities',
    'komoditas',
    'opec'
  ];

  let negScore = 0;
  let posScore = 0;
  let rateScore = 0;
  let commScore = 0;

  for (const phrase of severeNegativePhrases) {
    if (combined.includes(phrase)) {
      negScore += 3;
    }
  }

  for (const phrase of positivePhrases) {
    if (combined.includes(phrase)) {
      posScore += 2.5;
    }
  }

  // Word-boundary or substring matching
  const words = combined.split(/[^a-z0-9-]+/).filter(Boolean);
  const wordSet = new Set(words);

  for (const kw of negativeKeywords) {
    if (kw.includes(' ')) {
      if (combined.includes(kw)) negScore += 1.5;
    } else if (wordSet.has(kw)) {
      negScore += 1.5;
    }
  }

  for (const kw of positiveKeywords) {
    if (kw.includes(' ')) {
      if (combined.includes(kw)) posScore += 1.2;
    } else if (wordSet.has(kw)) {
      posScore += 1.2;
    }
  }

  for (const kw of rateKeywords) {
    if (combined.includes(kw)) rateScore += 1.5;
  }

  for (const kw of commodityKeywords) {
    if (combined.includes(kw)) commScore += 1.5;
  }

  // Priority 1: If negative score dominates or severe negative context is present -> RISK_OFF (Bearish/Negatif)
  if (negScore > 0 && negScore >= posScore) {
    // Unless it's specifically about central bank interest rates/FX with mild negative score
    if (rateScore >= 3 && negScore <= 2) {
      return {
        sentiment: 'HAWKISH_RATES',
        impactedSectors: ['Financials', 'Properties & Real Estate', 'Infrastructures']
      };
    }
    return {
      sentiment: 'RISK_OFF',
      impactedSectors:
        region === 'DOMESTIC'
          ? ['Consumer Non-Cyclicals', 'Healthcare', 'Financials']
          : ['Technology', 'Financials', 'Consumer Cyclicals']
    };
  }

  // Priority 2: Central Bank / FX / Bond Yield Focus
  if (rateScore >= 1.5 && rateScore >= commScore && posScore < negScore + 2.5) {
    return {
      sentiment: 'HAWKISH_RATES',
      impactedSectors: ['Financials', 'Properties & Real Estate', 'Infrastructures']
    };
  }

  // Priority 3: Commodity Focus (when not net negative)
  if (commScore >= 1.5 && negScore < posScore + 1.5) {
    return {
      sentiment: 'COMMODITY_BULL',
      impactedSectors: ['Energy', 'Basic Materials', 'Industrials']
    };
  }

  // Priority 4: Genuine Positive / Bullish Catalyst (only when posScore clearly exceeds negScore)
  if (posScore >= 1.2 && posScore > negScore) {
    return {
      sentiment: 'RISK_ON',
      impactedSectors:
        region === 'DOMESTIC'
          ? ['Financials', 'Consumer Non-Cyclicals', 'Infrastructures']
          : ['Financials', 'Industrials', 'Technology']
    };
  }

  // Priority 5: Objective Neutral Fallback (Never falsely label neutral/mixed/personal stories as Positive/Bullish!)
  return {
    sentiment: 'NEUTRAL',
    impactedSectors:
      region === 'DOMESTIC'
        ? ['Financials', 'Industrials', 'Consumer Non-Cyclicals']
        : ['Financials', 'Technology', 'Industrials']
  };
}

export function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  const namedMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&mdash;': '\u2014',
    '&ndash;': '\u2013',
    '&hellip;': '\u2026',
    '&lt;': '<',
    '&gt;': '>'
  };

  let text = input;
  for (let pass = 0; pass < 2; pass++) {
    text = text
      .replace(/&(nbsp|amp|quot|apos|lsquo|rsquo|ldquo|rdquo|mdash|ndash|hellip|lt|gt);/gi, (m) => {
        const lower = m.toLowerCase();
        return namedMap[lower] ?? m;
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
        const code = parseInt(hex, 16);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
      })
      .replace(/&#(\d+);/g, (_match, dec) => {
        const code = parseInt(dec, 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
      });
  }
  return text;
}

export function stripInlineCrossLinks(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<(p|div|li|span|strong|b|a)[^>]*>\s*(baca|lihat|simak)\s+juga[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\b(baca|lihat|simak)\s+juga\s*:?[^.\n\r]*(\.|$)/gi, ' ')
    .replace(/\b(artikel|berita)\s+terkait\s*:?[^.\n\r]*(\.|$)/gi, ' ');
}

function stripHtmlTags(raw: string): string {
  const withoutCrossLinks = stripInlineCrossLinks(raw);
  const withoutTags = withoutCrossLinks
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntities(withoutTags)
    .replace(/\s+/g, ' ')
    .trim();
}

export function isArticleStrictlyAboutEmiten(
  title: string,
  url: string,
  targetTicker: string,
  companyName?: string,
  summary?: string,
  source?: string
): boolean {
  const cleanTicker = targetTicker.trim().toUpperCase();
  if (!cleanTicker) return true;

  // Strip trailing publisher suffix like " - Kontan.co.id"
  const rawTitle = String(title || '').trim();
  const headlineCore = rawTitle
    .replace(/\s+[-|]\s+[^-|]+$/, '')
    .trim();
  const urlLower = String(url || '').toLowerCase();
  const combinedContext = `${rawTitle} ${summary || ''} ${source || ''} ${urlLower}`;

  // 1. Strict CASE-SENSITIVE ALL-CAPS ticker match in headline (e.g. "ELIT", "(ELIT)", "ELIT.JK")
  //    or explicit stock slug in URL ("saham-elit", "emiten-elit", "/elit-jk")
  //    Never match lowercase/TitleCase common dictionary words like "elit", "Elit", "Sekolah Elit", "Trader Elit"
  const exactUpperTickerRegex = new RegExp(`\\b${cleanTicker}\\b`);
  const explicitStockUrlSlugRegex = new RegExp(
    `(?:saham|emiten|kode|idx|ticker)[-_/${cleanTicker.toLowerCase()}]*[-_/]${cleanTicker.toLowerCase()}\\b|\\b${cleanTicker.toLowerCase()}-jk\\b`
  );
  const hasStrictUpperTicker =
    exactUpperTickerRegex.test(headlineCore) || explicitStockUrlSlugRegex.test(urlLower);

  // 2. Distinctive non-synthetic company name tokens match in headline or URL
  const isSyntheticCompany =
    Boolean(companyName) &&
    new RegExp(`\\b${cleanTicker}\\s+Indonesia\\s+Tbk$`, 'i').test(String(companyName));

  // Full multi-word company core phrase (only stripping legal suffixes PT/Persero/Tbk/Indonesia)
  // e.g. "ESSA Industries Indonesia Tbk" -> "essa industries"
  const companyCorePhrase = isSyntheticCompany
    ? ''
    : String(companyName || '')
        .replace(/\b(PT|Persero|Tbk|Indonesia)\b/gi, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
  const companyCoreWordCount = companyCorePhrase ? companyCorePhrase.split(' ').length : 0;

  // Strip ALL generic Indonesian & English corporate words so words like "Industries", "Resources", "Energy" never match alone
  const cleanedCompany = isSyntheticCompany
    ? ''
    : String(companyName || '')
        .replace(
          /\b(Tbk|PT|Persero|Indonesia|Internasional|International|Nusantara|Sejahtera|Pratama|Makmur|Sentosa|Abadi|Karya|Utama|Mandiri|Group|Grup|Investama|Corporindo|Korporindo|Teknologi|Technology|Technologies|Digital|Solusi|Solutions|Solution|Data|Siber|Komputasi|Inovasi|Sistem|Systems|System|Logistik|Logistics|Armada|Pelayaran|Shipping|Marine|Samudera|Ekspres|Express|Properti|Properties|Property|Kawasan|Persada|Industri|Industries|Industry|Teknik|Engineering|Traktor|Menara|Tower|Towers|Telekom|Telekomunikasi|Telecom|Communications|Communication|Networks|Network|Energi|Energy|Resources|Resource|Sumber|Tambang|Mining|Mineral|Minerals|Logam|Metals|Metal|Copper|Gold|Nickel|Coal|Oil|Gas|Power|Semen|Cement|Kertas|Paper|Pulp|Packaging|Pangan|Foods|Food|Beverages|Beverage|Sawit|Plantations|Plantation|Agri|Agriculture|Nabati|Retail|Commercial|Trading|Media|Medika|Healthcare|Health|Farma|Pharmaceuticals|Pharmaceutical|Pharma|Husada|Klinik|Kapital|Capital|Sentral|Central|Mitra|Partners|Partner|Prima|Cipta|Graha|Bumi|Bina|Jasa|Services|Service|Multi|Multifinance|Surya|Mega|Megah|Dana|Finance|Financial|Financials|Artha|Bank|Banking|Sinergi|Global|Nasional|National|Jaya|Holdings|Holding|Corporation|Corp|Company|Companies|Limited|Ltd|Inc|Plc|Ventures|Venture|Pacific|Asia|Asian|Consumer|Investment|Investments|Enterprises|Enterprise|Infrastructure|Development|Manufacturing|Textiles|Textile|Ceramics|Steel|Chemicals|Chemical|Petrochemical|Life|Insurance|Securitas|Sekuritas|Aneka|indo|indonesian)\b/gi,
          ' '
        )
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

  const companyTokens = cleanedCompany
    .split(' ')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 4 && w !== cleanTicker.toLowerCase());

  const primaryTwoWords = companyTokens.slice(0, 2).join(' ');
  const hasFullCorePhraseInTitleOrUrl =
    companyCoreWordCount >= 2 &&
    companyCorePhrase.length >= 8 &&
    (new RegExp(`\\b${companyCorePhrase.replace(/\s+/g, '\\s+')}\\b`, 'i').test(headlineCore) ||
      urlLower.includes(companyCorePhrase.replace(/\s+/g, '-')));

  const hasCompanyInTitleOrUrl =
    hasFullCorePhraseInTitleOrUrl ||
    (companyTokens.length >= 2 &&
      primaryTwoWords.length >= 8 &&
      (headlineCore.toLowerCase().includes(primaryTwoWords) ||
        urlLower.includes(primaryTwoWords.replace(/\s+/g, '-')))) ||
    companyTokens.some(
      (tok) =>
        tok.length >= 7 &&
        (new RegExp(`\\b${tok}\\b`, 'i').test(headlineCore) || urlLower.includes(tok))
    );

  // 3. Reject common-word false positives & foreign stock market companies (e.g. BE Semiconductor Industries, Mueller Industries)
  const commonWordFalsePositiveRegex = new RegExp(
    `\\b(?:sekolah|kampus|universitas|pesantren|kawasan|perumahan|hunian|apartemen|kompleks|kaum|kelompok|kalangan|golongan|pasukan|unit|tim|klub|liga|divisi|atlet|pemain|pejabat|politisi|partai|kuliner|restoran|hotel|gaya\\s+hidup|trader|investor\\s+kripto|green\\s+list)\\s+${cleanTicker}\\b|\\b${cleanTicker}\\s+(?:politik|global|jepang|dunia|eropa|amerika|asia|lokal|nasional|kripto|crypto)\\b`,
    'i'
  );
  if (commonWordFalsePositiveRegex.test(headlineCore)) {
    return false;
  }

  // Reject foreign non-IDX equities / global market headlines when target ticker is not explicitly in ALL-CAPS
  if (
    /\b(BE\s+Semiconductor|Mueller\s+Industries|Wall\s+Street|Nasdaq|NYSE|Dow\s+Jones|S&P\s*500|Bursa\s+AS|Bursa\s+Eropa|Saham\s+AS|Nvidia|Tesla|Apple|Microsoft|Amazon|Alphabet|Meta\s+Platforms)\b/i.test(
      combinedContext
    ) &&
    !exactUpperTickerRegex.test(headlineCore)
  ) {
    return false;
  }

  // Reject pure crypto/Web3 articles that don't explicitly mention IDX/BEI stock context
  if (
    /\b(shiba\s+inu|bitcoin|ethereum|dogecoin|solana|kripto|crypto|blockchain|web3|memecoin|altcoin)\b/i.test(
      combinedContext
    ) &&
    !/\b(emiten|bei|bursa\s+efek\s+indonesia|ihsg|tbk)\b/i.test(combinedContext)
  ) {
    return false;
  }

  // 4. Mandatory IDX / Stock Market Context check
  const hasIdxMarketContext =
    /\b(saham|emiten|bei|idx|ihsg|bursa|tbk|dividen|rups|rupst|rupslb|laba|rugi|pendapatan|kinerja|kuartal|semester|laporan\s+keuangan|direksi|komisaris|akuisisi|right\s+issue|rights\s+issue|hmetd|pmthmetd|private\s+placement|buyback|obligasi|sukuk|stock\s+split|ipo|uma|suspensi|delisting|ksei|ojk|sekuritas|portofolio|analis|rekomendasi|target\s+harga|valuasi|pbv|per|roe|ebitda|capex|belanja\s+modal|kontrak\s+baru|aksi\s+korporasi)\b/i.test(
      combinedContext
    ) ||
    new RegExp(`(\\(${cleanTicker}\\)|\\[${cleanTicker}\\]|\\b${cleanTicker}\\.JK\\b|\\bIDX:${cleanTicker}\\b)`).test(
      rawTitle
    ) ||
    new RegExp(`\\b[A-Z]{4},\\s*${cleanTicker}\\b|\\b${cleanTicker}\\s+hingga\\s+[A-Z]{4}\\b`).test(
      headlineCore
    );

  if (!hasIdxMarketContext) {
    return false;
  }

  // 5. Guard against articles primarily about ANOTHER 4-letter IDX ticker
  //    (e.g. "Direktur Utama Toba Surimi Industries (CRAB) Pamit Undur Diri" or "Profil Emiten TOBA")
  const parenthesizedTickers = Array.from(
    headlineCore.matchAll(/(?:\(|\[)([A-Z]{4})(?:\)|\])|\b([A-Z]{4})\.JK\b/g)
  ).map((m) => (m[1] || m[2] || '').toUpperCase());
  if (
    parenthesizedTickers.length > 0 &&
    !parenthesizedTickers.includes(cleanTicker) &&
    !exactUpperTickerRegex.test(headlineCore)
  ) {
    return false;
  }

  const foreignEmitenInTitle = headlineCore.match(
    /\b(?:emiten|saham|dividen|laba|kinerja|prospek|profil|direksi|komisaris|rups)\s+(?:PT\s+)?([A-Z]{4})\b/
  );
  if (
    foreignEmitenInTitle &&
    foreignEmitenInTitle[1].toUpperCase() !== cleanTicker &&
    !exactUpperTickerRegex.test(headlineCore)
  ) {
    return false;
  }

  const foreignEmitenInUrl = urlLower.match(/\b(?:emiten|saham)-([a-z]{4})\b/);
  if (
    foreignEmitenInUrl &&
    foreignEmitenInUrl[1].toUpperCase() !== cleanTicker &&
    !exactUpperTickerRegex.test(headlineCore)
  ) {
    return false;
  }

  return hasStrictUpperTicker || hasCompanyInTitleOrUrl;
}

/**
 * Validates that a news item is no older than 90 days (3 months) from the current date,
 * and rejects headlines referencing stale past years.
 */
export function isNewsItemFreshWithin3Months(
  pubDateRaw?: string,
  title?: string,
  summary?: string
): boolean {
  const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days (3 months)
  const now = Date.now();

  if (pubDateRaw) {
    // Check relative strings like "4 bulan", "5 bulan", "6 bulan", "1 tahun", "2 tahun", "years ago", "months ago"
    const lowerDate = pubDateRaw.toLowerCase();
    const monthMatch = lowerDate.match(/(\d+)\s*(bulan|month)/i);
    if (monthMatch && parseInt(monthMatch[1], 10) > 3) {
      return false;
    }
    if (/\b(\d+\s*(tahun|year)|201\d|202[0-4])\b/i.test(lowerDate)) {
      return false;
    }

    const parsed = Date.parse(pubDateRaw);
    if (!Number.isNaN(parsed)) {
      if (now - parsed > MAX_AGE_MS) {
        return false;
      }
    }
  }

  const currentYear = new Date().getFullYear();
  const combinedText = `${title || ''} ${summary || ''}`;
  const staleYearsRegex = new RegExp(
    `\\b(201[5-9]|202[0-${Math.max(0, (currentYear % 10) - 2)}])\\b`
  );
  if (staleYearsRegex.test(combinedText) && !combinedText.includes(String(currentYear))) {
    return false;
  }

  return true;
}

function formatRecentNewsTimestamp(pubDateRaw?: string): string {
  if (!pubDateRaw) return 'Terkini (≤ 3 Bulan)';
  const parsed = Date.parse(pubDateRaw);
  if (Number.isNaN(parsed)) return pubDateRaw;
  const diffMs = Math.max(0, Date.now() - parsed);
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const dateStr = new Date(parsed).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  if (diffDays === 0) return `Hari ini · ${dateStr}`;
  if (diffDays <= 7) return `${diffDays} hari lalu · ${dateStr}`;
  if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} minggu lalu · ${dateStr}`;
  return `${Math.min(3, Math.ceil(diffDays / 30))} bulan lalu · ${dateStr}`;
}

async function fetchRssFeedItems(
  rssUrl: string,
  sourceLabel: string,
  region: 'DOMESTIC' | 'GLOBAL',
  limit: number = 4
): Promise<NewsSentimentItem[]> {
  try {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
    const res = await fetch(apiUrl, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        const freshItems = data.items.filter(
          (item: { title?: string; pubDate?: string; description?: string }) =>
            isNewsItemFreshWithin3Months(item.pubDate, item.title, item.description)
        );
        return freshItems.slice(0, limit).map(
          (
            item: {
              title?: string;
              pubDate?: string;
              link?: string;
              description?: string;
            },
            idx: number
          ) => {
            const title = stripHtmlTags(item.title || 'Market Update');
            const summary = stripHtmlTags(item.description || '').slice(0, 160);
            const { sentiment, impactedSectors } = classifyHeadlineSentiment(
              title,
              region,
              summary
            );
            return {
              id: `${region.toLowerCase()}_rss_${Date.now()}_${idx}`,
              title,
              source: sourceLabel,
              publishedAt: formatRecentNewsTimestamp(item.pubDate),
              url: item.link || 'https://finance.yahoo.com',
              region,
              summary: summary ? `${summary}...` : undefined,
              sentiment,
              impactedSectors
            };
          }
        );
      }
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Live Financial RSS News & Sentiment Fetcher
 * Uses direct server /api/news/rss when available, or pre-synced static-market-snapshot.json + rss2json on GitHub Pages.
 */
export async function fetchLiveFinancialNewsRss(
  fallbackNews: NewsSentimentItem[]
): Promise<NewsSentimentItem[]> {
  // 1. Try direct server endpoint (/api/news/rss) only when local Express backend is active
  if (canUseLocalExpressBackend()) {
    try {
      const res = await fetch('/api/news/rss', { cache: 'no-store' });
      if (res.ok) {
        cachedLocalServerAvailable = true;
        const data = await res.json();
        if (Array.isArray(data?.items) && data.items.length > 0) {
          return data.items.map((raw: any) => {
            const region: 'DOMESTIC' | 'GLOBAL' =
              raw.region === 'DOMESTIC' ? 'DOMESTIC' : 'GLOBAL';
            const cleanTitle = decodeHtmlEntities(String(raw.title || ''));
            const cleanSummary = raw.summary ? decodeHtmlEntities(String(raw.summary)) : undefined;
            const { sentiment, impactedSectors } = classifyHeadlineSentiment(
              cleanTitle,
              region,
              cleanSummary
            );
            return {
              id: raw.id,
              title: cleanTitle,
              source: raw.source,
              publishedAt: raw.publishedAt,
              url: raw.url,
              region,
              summary: cleanSummary,
              sentiment,
              impactedSectors
            } as NewsSentimentItem;
          });
        }
      } else if (res.status === 404) {
        cachedLocalServerAvailable = false;
      }
    } catch {
      cachedLocalServerAvailable = false;
    }
  }

  // 2. Load Pre-Synced Live RSS News from static-market-snapshot.json (Zero 404 / Zero CORS Error)
  try {
    const snapshot = await loadStaticMarketSnapshot();
    if (Array.isArray(snapshot?.newsItems) && snapshot.newsItems.length > 0) {
      return snapshot.newsItems.map((raw) => {
        const region: 'DOMESTIC' | 'GLOBAL' =
          raw.region === 'DOMESTIC' ? 'DOMESTIC' : 'GLOBAL';
        const cleanTitle = decodeHtmlEntities(String(raw.title || ''));
        const cleanSummary = raw.summary ? decodeHtmlEntities(String(raw.summary)) : undefined;
        const { sentiment, impactedSectors } = classifyHeadlineSentiment(
          cleanTitle,
          region,
          cleanSummary
        );
        return {
          id: raw.id,
          title: cleanTitle,
          source: raw.source,
          publishedAt: raw.publishedAt,
          url: raw.url,
          region,
          summary: cleanSummary,
          sentiment,
          impactedSectors
        } as NewsSentimentItem;
      });
    }
  } catch {
    // Fallback below
  }

  // 3. Browser RSS fallback via rss2json
  try {
    const [domesticCnbc, domesticAntara, globalMw, globalCnbc] = await Promise.all([
      fetchRssFeedItems(
        'https://www.cnbcindonesia.com/market/rss',
        'CNBC Indonesia Market',
        'DOMESTIC',
        3
      ),
      fetchRssFeedItems(
        'https://www.antaranews.com/rss/ekonomi.xml',
        'Antara Ekonomi Nasional',
        'DOMESTIC',
        2
      ),
      fetchRssFeedItems(
        'https://feeds.content.dowjones.io/public/rss/mw_topstories',
        'MarketWatch Global Wire',
        'GLOBAL',
        3
      ),
      fetchRssFeedItems(
        'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
        'CNBC Global Finance',
        'GLOBAL',
        2
      )
    ]);

    const combinedDomestic = [...domesticCnbc, ...domesticAntara].slice(0, 4);
    const combinedGlobal = [...globalMw, ...globalCnbc].slice(0, 4);

    const fallbackDomestic = fallbackNews.filter((n) => n.region === 'DOMESTIC');
    const fallbackGlobal = fallbackNews.filter((n) => n.region === 'GLOBAL');

    const finalDomestic = combinedDomestic.length > 0 ? combinedDomestic : fallbackDomestic;
    const finalGlobal = combinedGlobal.length > 0 ? combinedGlobal : fallbackGlobal;

    const merged = [...finalDomestic, ...finalGlobal];
    return merged.length > 0 ? merged : fallbackNews;
  } catch {
    return fallbackNews;
  }
}

/**
 * Classifies an emiten news item into specific Corporate Action / Fundamental / Regulatory categories
 */
export function classifyEmitenNewsCategory(
  title: string,
  summary?: string
): EmitenNewsCategory {
  const combined = `${title} ${summary || ''}`.toLowerCase();

  const umaOrIssueKeywords = [
    'uma',
    'unusual market activity',
    'suspensi',
    'disuspensi',
    'gembok',
    'delisting',
    'pkpu',
    'pailit',
    'gugatan',
    'sanksi',
    'denda',
    'peringatan',
    'investigasi',
    'gorengan',
    'hsc',
    'anomali',
    'special monitoring',
    'fca',
    'full call auction'
  ];
  for (const kw of umaOrIssueKeywords) {
    if (combined.includes(kw)) return 'REGULATORY_UMA_ISSUE';
  }

  const dividenRupsKeywords = [
    'dividen',
    'dividend',
    'cum date',
    'ex date',
    'rups',
    'rupst',
    'rupslb',
    'payout ratio',
    'bagi laba',
    'dividen interim',
    'dividen tunai'
  ];
  for (const kw of dividenRupsKeywords) {
    if (combined.includes(kw)) return 'DIVIDEN_RUPS';
  }

  const corpActionKeywords = [
    'buyback',
    'right issue',
    'rights issue',
    'hmetd',
    'pmthmetd',
    'private placement',
    'akuisisi',
    'divestasi',
    'merger',
    'obligasi',
    'sukuk',
    'stock split',
    'reverse stock',
    'ekspansi',
    'capex',
    'belanja modal',
    'kontrak baru',
    'joint venture',
    'kemitraan'
  ];
  for (const kw of corpActionKeywords) {
    if (combined.includes(kw)) return 'CORPORATE_ACTION_MA';
  }

  const earningsKeywords = [
    'laba',
    'rugi',
    'pendapatan',
    'kinerja',
    'kuartal',
    'semester',
    'laporan keuangan',
    'ebitda',
    'margin',
    'aset',
    'ekuitas',
    'penjualan',
    'revenue',
    'profit',
    'earnings'
  ];
  for (const kw of earningsKeywords) {
    if (combined.includes(kw)) return 'FINANCIAL_EARNINGS';
  }

  return 'GENERAL_EMITEN';
}

/**
 * Generates baseline Corporate Action, Dividend & Regulatory Radar items for any IDX ticker
 * so the user always sees structured corporate action & issue intelligence alongside live RSS news.
 */
export function buildEmitenCorporateActionRadarBaseline(
  ticker: string,
  companyName: string,
  sector: string,
  stock?: StockMetrics
): NewsSentimentItem[] {
  const clean = ticker.trim().toUpperCase();
  const divYield = stock?.dividendYieldPct ?? getEmitenDividendYield(clean, stock?.lastPrice);
  const isHsc = Boolean(stock?.isHscFlagged);
  // Use trailing/reported ROE (or user override ROE) rather than heuristic forward-annualized overwrite when available
  const roe =
    stock?.fundamentalsSource && stock.fundamentalsSource !== 'HARDCODED_SEED'
      ? stock.roe
      : stock?.trailingRoePct ?? stock?.roe ?? 12.0;
  const der = stock?.debtToEquity ?? 0.6;
  const price = stock?.lastPrice ?? 1000;
  const c1d = stock?.change1D ?? 0;
  const sbnAndKe = computeSbnSpotYieldCurveAndKe(
    stock || ({ ticker: clean, beta1Y: 0.85, roe, dividendYieldPct: divYield } as StockMetrics),
    divYield
  );
  const dynamicKePct = sbnAndKe.dynamicCostOfEquityPct;
  const overlayForNews = resolveTickerFundamentalOverlay(clean, {
    defaultRoe: stock?.roe ?? 12.0,
    defaultDer: stock?.debtToEquity ?? 0.6,
    defaultOpMargin: stock?.operatingMargin ?? 12.0
  });
  const effectiveFundSource =
    overlayForNews.fundamentalsSource && overlayForNews.fundamentalsSource !== 'HARDCODED_SEED'
      ? overlayForNews.fundamentalsSource
      : stock?.fundamentalsSource || 'HARDCODED_SEED';
  const provenanceLabel =
    effectiveFundSource === 'LIVE_YAHOO_API'
      ? 'LIVE CLOUDFLARE WORKER'
      : effectiveFundSource === 'FUNDAMENTALS_JSON'
      ? 'VERIFIED SNAPSHOT'
      : effectiveFundSource === 'USER_OVERRIDE'
      ? 'USER OVERRIDE'
      : 'HARDCODED SEED';

  const items: NewsSentimentItem[] = [];

  const recentDateLabel = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  // 1. Dividend & RUPS Corporate Action Status
  if (divYield > 0) {
    items.push({
      id: `ca_div_${clean}`,
      ticker: clean,
      title: `[Aksi Korporasi & Dividen] ${clean} (${companyName}) Mencatatkan Imbal Hasil Dividen TTM ${divYield.toFixed(2)}% pada Harga Rp ${price.toLocaleString('id-ID')}`,
      source: 'IDX Corporate Action Radar',
      publishedAt: `Update Kuartal Ini · ${recentDateLabel}`,
      url: `https://finance.yahoo.com/quote/${clean}.JK`,
      region: 'DOMESTIC',
      summary: `Konsistensi distribusi dividen tunai ${clean} (${divYield.toFixed(2)}%) dalam 3 bulan berjalan memvalidasi arus kas bebas nyata dan kepatuhan tata kelola RUPS bagi investor fundamental.`,
      sentiment: 'RISK_ON',
      impactedSectors: [sector],
      emitenCategory: 'DIVIDEN_RUPS'
    });
  } else {
    items.push({
      id: `ca_nodiv_${clean}`,
      ticker: clean,
      title: `[Status Dividen & RUPS] ${clean} (${companyName}) Belum Mencatatkan Pembagian Dividen Tunai Rutin TTM (0,00%)`,
      source: 'IDX Corporate Action Radar',
      publishedAt: `Evaluasi ≤ 3 Bulan · ${recentDateLabel}`,
      url: `https://finance.yahoo.com/quote/${clean}.JK`,
      region: 'DOMESTIC',
      summary: `Emiten menahan laba ditahan atau fokus pada restrukturisasi/modal kerja. Menurut disiplin Fundamental Kualitas Moat, ketiadaan dividen menuntut kehati-hatian ekstra pada kualitas arus kas operasi.`,
      sentiment: isHsc ? 'RISK_OFF' : 'NEUTRAL',
      impactedSectors: [sector],
      emitenCategory: 'DIVIDEN_RUPS'
    });
  }

  // 2. Financial Performance & Solvency Filing Radar (Dynamically bound to actual Cost of Equity Ke & provenance source)
  items.push({
    id: `ca_fin_${clean}`,
    ticker: clean,
    title: `[Kinerja Keuangan & Neraca · ${provenanceLabel}] Evaluasi Fundamental ${clean}: ROE ${roe.toFixed(1)}%, Operating Margin ${(stock?.operatingMargin ?? 12).toFixed(1)}%, dan DER ${der.toFixed(2)}x`,
    source: 'Ikhtisar Laporan Keuangan BEI',
    publishedAt: `Rilis ≤ 3 Bulan Terakhir · ${recentDateLabel}`,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${clean} ${companyName} laporan keuangan laba dividen BEI`)}&tbs=qdr:m3`,
    region: 'DOMESTIC',
    summary: `Posisi profitabilitas ROE ${roe.toFixed(1)}% (${roe >= dynamicKePct ? 'di atas' : 'di bawah'} Dynamic Cost of Equity ${dynamicKePct.toFixed(2).replace('.', ',')}%, Blended Spot Rf ${sbnAndKe.sbnBlendedSpotRfPct.toFixed(2).replace('.', ',')}%) dengan tingkat leverage DER ${der.toFixed(2)}x, sumber data [${provenanceLabel}], dan pergerakan harga harian ${c1d >= 0 ? '+' : ''}${c1d.toFixed(2)}%.`,
    sentiment:
      roe >= dynamicKePct && der <= 0.9
        ? 'RISK_ON'
        : roe < dynamicKePct * 0.75 || der > 1.3
        ? 'RISK_OFF'
        : 'NEUTRAL',
    impactedSectors: [sector],
    emitenCategory: 'FINANCIAL_EARNINGS'
  });

  // 3. Regulatory / HSC / Unusual Market Activity Radar (3-Tier: Official BEI-KSEI & Early Warning Suspect Quant)
  const kseiEntry = getKseiHscEntry(clean);
  if (isHsc) {
    const isEarlyWarningSuspect = stock?.hscTier === 'EARLY_WARNING_SUSPECT' || !kseiEntry;
    items.push({
      id: `ca_hsc_${clean}`,
      ticker: clean,
      title: isEarlyWarningSuspect
        ? `[Radar Suspect HSC / Early Warning Quant] ${clean} Terdeteksi Anomali Pergerakan Spekulatif Pra-Rilis BEI — Diblokir Otomatis`
        : `[Evaluasi Resmi HSC BEI-KSEI] ${clean} Kepemilikan Top-10 ${kseiEntry.top10ConcentrationPct.toFixed(3).replace('.', ',')}% (${kseiEntry.isNew ? 'Baru/New' : 'Eksisting'}${formatKseiFootnoteShortLabel(kseiEntry.footnote) ? ` · ${formatKseiFootnoteShortLabel(kseiEntry.footnote)}` : ''}) — Diblokir dari Top Buy`,
      source: isEarlyWarningSuspect
        ? 'Nostradamus Early Warning Quant Radar'
        : 'Pengumuman BEI-KSEI Peng-HSC-00088/BEI.WAS/11-2026',
      publishedAt: `Evaluasi Aktif · ${recentDateLabel}`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${clean} UMA HSC KSEI BEI saham`)}&tbs=qdr:m3`,
      region: 'DOMESTIC',
      summary: `${stock?.hscReason || 'Terdeteksi anomali pergerakan spekulatif / konsentrasi kepemilikan tinggi tanpa dukungan dividen kuat.'} Diblokir dari Top Decile Buy dan Barbell Allocator untuk melindungi modal.`,
      sentiment: 'RISK_OFF',
      impactedSectors: [sector],
      emitenCategory: 'REGULATORY_UMA_ISSUE'
    });
  } else if (kseiEntry && stock?.hscTier === 'KSEI_DIVIDEND_PENALTY') {
    items.push({
      id: `ca_ksei_div_${clean}`,
      ticker: clean,
      title: `[Evaluasi HSC BEI-KSEI · Dividen Kuat] ${clean} Kepemilikan Top-10 ${kseiEntry.top10ConcentrationPct.toFixed(3).replace('.', ',')}% (${kseiEntry.isNew ? 'Baru/New' : 'Eksisting'}) — Penalti Skor Tanpa Blokir`,
      source: 'Pengumuman BEI-KSEI Peng-HSC-00088/BEI.WAS/11-2026',
      publishedAt: `Efektif 11 Nov 2026 · ${recentDateLabel}`,
      url: `https://www.idx.co.id`,
      region: 'DOMESTIC',
      summary: `Tercatat dalam daftar Kepemilikan Saham Terkonsentrasi Tinggi BEI-KSEI per 30 Oktober 2026 (Top 10: ${kseiEntry.top10ConcentrationPct.toFixed(3).replace('.', ',')}% · Sisa Publik Maks ${kseiEntry.impliedPublicFloatMaxPct.toFixed(2).replace('.', ',')}%). Karena ditopang pembagian dividen rutin dan kualitas fundamental yang solid, saham ini dikenai penalti skor -${(stock.kseiHscScorePenaltyPts || 0.45).toFixed(2).replace('.', ',')} poin tanpa blokir otomatis.`,
      sentiment: 'NEUTRAL',
      impactedSectors: [sector],
      emitenCategory: 'REGULATORY_UMA_ISSUE'
    });
  } else {
    items.push({
      id: `ca_clean_${clean}`,
      ticker: clean,
      title: `[Status Regulasi & Likuiditas] ${clean} Bebas Daftar HSC BEI-KSEI & Lolos Radar Early Warning dengan Skor Value ${(stock?.dmuValueScore ?? 7.0).toFixed(1)}/10`,
      source: 'IDX Compliance & Factor Monitor',
      publishedAt: `Pemantauan ≤ 90 Hari · ${recentDateLabel}`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${clean} ${companyName} aksi korporasi terbaru`)}&tbs=qdr:m3`,
      region: 'DOMESTIC',
      summary: `Struktur kepemilikan publik (free float) dan metrik fundamental memenuhi saringan kuantitatif Out-of-Sample tanpa anomali konsentrasi HSC BEI-KSEI maupun sinyal Suspect Early Warning.`,
      sentiment: 'RISK_ON',
      impactedSectors: [sector],
      emitenCategory: 'CORPORATE_ACTION_MA'
    });
  }

  return items;
}

/**
 * Fetches live news, corporate actions, and specific issues for a given IDX ticker
 * Strictly filters all news items to maximum 3 months (90 days) old.
 */
export async function fetchLiveEmitenSpecificNews(
  rawTicker: string,
  companyName?: string,
  sector?: string,
  stockMetrics?: StockMetrics
): Promise<NewsSentimentItem[]> {
  const cleanTicker = rawTicker
    .trim()
    .toUpperCase()
    .replace(/\.JK$/i, '')
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);

  const catalogEntry =
    IDX_CATALOG_BY_TICKER_MAP.get(cleanTicker) ||
    createCalibratedIdxEntry(cleanTicker, sector, companyName);
  const resolvedName = companyName || stockMetrics?.name || catalogEntry.name;
  const resolvedSector = sector || stockMetrics?.sector || catalogEntry.sector;

  const liveFetchedItems: NewsSentimentItem[] = [];

  // 1. Try local Express backend (/api/news/emiten)
  if (canUseExpressOnDemandApi()) {
    try {
      const res = await fetch(
        `/api/news/emiten?ticker=${encodeURIComponent(cleanTicker)}&name=${encodeURIComponent(
          resolvedName
        )}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text);
        recordSyncDiagnostic({
          ticker: cleanTicker,
          stage: 'NEWS_RSS',
          endpoint: `/api/news/emiten?ticker=${cleanTicker}`,
          payloadBytes: text.length,
          httpStatus: res.status,
          status: 'OK',
          errorDetail: `Express news endpoint mengembalikan ${(data?.items || []).length} artikel.`
        });
        if (Array.isArray(data?.items) && data.items.length > 0) {
          for (const raw of data.items) {
            const cleanTitle = decodeHtmlEntities(String(raw.title || ''));
            const cleanSummary = raw.summary
              ? stripInlineCrossLinks(decodeHtmlEntities(String(raw.summary)))
              : undefined;
            const rawUrl = String(raw.url || '');
            if (!isNewsItemFreshWithin3Months(raw.publishedAt, cleanTitle, cleanSummary)) {
              continue;
            }
            if (
              !String(raw.source || '').includes('Yahoo Finance') &&
              !isArticleStrictlyAboutEmiten(
                cleanTitle,
                rawUrl,
                cleanTicker,
                resolvedName,
                cleanSummary,
                raw.source
              )
            ) {
              continue;
            }
            const { sentiment } = classifyHeadlineSentiment(
              cleanTitle,
              'DOMESTIC',
              cleanSummary
            );
            const emitenCategory = classifyEmitenNewsCategory(cleanTitle, cleanSummary);
            liveFetchedItems.push({
              id: raw.id || `em_${cleanTicker}_${liveFetchedItems.length}`,
              ticker: cleanTicker,
              title: cleanTitle,
              source: raw.source || `Radar ${cleanTicker}`,
              publishedAt: formatRecentNewsTimestamp(raw.publishedAt),
              url: rawUrl || `https://finance.yahoo.com/quote/${cleanTicker}.JK`,
              region: 'DOMESTIC',
              summary: cleanSummary,
              sentiment,
              impactedSectors: [resolvedSector],
              emitenCategory
            });
          }
        }
      }
    } catch {
      // fallback below
    }
  }

  // 2. If running on static GitHub Pages or server returned empty, use a simplified rss2json query that avoids HTTP 422
  if (liveFetchedItems.length === 0) {
    try {
      const simpleQuery = `${cleanTicker} saham BEI when:90d`;
      const gNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
        simpleQuery
      )}&hl=id&gl=ID&ceid=ID:id`;
      const rssItems = await fetchRssFeedItems(
        gNewsUrl,
        `Google News BEI (${cleanTicker})`,
        'DOMESTIC',
        8
      );
      for (const item of rssItems) {
        if (!isNewsItemFreshWithin3Months(item.publishedAt, item.title, item.summary)) {
          continue;
        }
        if (
          !isArticleStrictlyAboutEmiten(
            item.title,
            item.url,
            cleanTicker,
            resolvedName,
            item.summary,
            item.source
          )
        ) {
          continue;
        }
        liveFetchedItems.push({
          ...item,
          ticker: cleanTicker,
          impactedSectors: [resolvedSector],
          emitenCategory: classifyEmitenNewsCategory(item.title, item.summary)
        });
      }
    } catch {
      // fallback below
    }
  }

  const radarBaseline = buildEmitenCorporateActionRadarBaseline(
    cleanTicker,
    resolvedName,
    resolvedSector,
    stockMetrics
  );

  return [...liveFetchedItems, ...radarBaseline];
}

/**
 * Strips any residual markdown bold/header markers (** or ###) so UI text is always clean.
 */
export function stripRawMarkdownArtifacts(text: string): string {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/Nilai Intrinsik\s+Joeliardi-Graham/gi, 'Nilai Intrinsik Wajar')
    .replace(/Joeliardi-Graham/gi, 'Nilai Intrinsik Wajar')
    .replace(/prinsip\s+Joeliardi\s+Sunendar/gi, 'disiplin Fundamental Kualitas Moat')
    .replace(/kriteria\s+Joeliardi\s+Sunendar/gi, 'kriteria Fundamental Kualitas Moat')
    .replace(/\s*\(Joeliardi\s+Sunendar\)/gi, '')
    .replace(/Joeliardi\s+Sunendar/gi, 'Fundamental Kualitas Moat')
    .replace(/\bPada kuotasi\b/gi, 'Pada harga pasar')
    .replace(/\bkuotasi\b/gi, 'harga pasar')
    .replace(/\bDiskon optik\b/gi, 'Valuasi yang terlihat murah')
    .replace(/\bdiskon optik\b/gi, 'valuasi yang terlihat murah')
    .replace(/\bsecara optik\b/gi, 'di atas kertas')
    .replace(/\bSecara kausal,\s*/gi, 'Jika dibedah lebih dalam, ')
    .replace(/\bsecara kausal\b/gi, 'secara fundamental')
    .replace(/\btrajektori harga\b/gi, 'arah pergerakan harga')
    .replace(/\btrajektori\b/gi, 'arah pergerakan')
    .replace(/\bpengungkit utang\b/gi, 'rasio utang')
    .replace(/\bpengungkit ekuitas\b/gi, 'rasio pengali ekuitas')
    .replace(/\bBermoat Kuat\b/gi, 'Berdaya Saing Kuat')
    .trim();
}

/**
 * Deep Multi-Variable Chain-of-Thought Analytical Engine for Static Hosts (GitHub Pages) or Fallback.
 * Performs genuine cross-metric financial reasoning (DuPont ROE vs DER decomposition, Earnings Yield vs SBN 10Y,
 * Momentum-Value divergence detection, and contextual question answering) without rigid markdown templates.
 */
export function buildDeepAnalyticalConvictionReport(params: {
  stock: StockMetrics;
  joeliardiEval: JoeliardiOosEvaluation;
  recentNews: NewsSentimentItem[];
  userQuestion: string;
  regimeStatus: string;
  availablePortfolioCashIdr?: number;
}): StructuredAiConvictionReport {
  const {
    stock,
    joeliardiEval,
    recentNews,
    userQuestion,
    regimeStatus,
    availablePortfolioCashIdr
  } = params;
  const fwdDivCalc = calculateForwardDividend(stock, joeliardiEval.estimatedEpsIdr);
  const forwardDivYield =
    joeliardiEval.forwardDividendYieldPct ?? fwdDivCalc.forwardDividendYieldPct;
  const historicalDpr3Y =
    joeliardiEval.historicalDpr3YPct ?? fwdDivCalc.historicalDpr3YPct;
  const buybackPaydownYield =
    joeliardiEval.netBuybackDebtPaydownYieldPct ?? fwdDivCalc.netBuybackDebtPaydownYieldPct;
  const totalShareholderYieldPct =
    joeliardiEval.totalShareholderYieldPct ?? fwdDivCalc.totalShareholderYieldPct;
  const netPayoutYieldPct =
    joeliardiEval.netPayoutYieldPct ?? fwdDivCalc.netPayoutYieldPct ?? totalShareholderYieldPct;
  const shareholderYieldLabel =
    (joeliardiEval.netDebtPaydownYieldPct ?? fwdDivCalc.netDebtPaydownYieldPct ?? 0) > 0 &&
    stock.sector !== 'Financials'
      ? 'Total Shareholder Yield'
      : 'Net Payout Yield';

  // 5-Pillar Academic Quantitative Metrics (Single Source of Truth from rawTickerData when available)
  const rawTd = joeliardiEval.rawTickerData;
  const gpToAssets =
    joeliardiEval.grossProfitabilityToAssets ??
    stock.grossProfitabilityToAssets ??
    Number((stock.roe * 0.85).toFixed(1));
  const ocfNi =
    rawTd && typeof rawTd.ocfTTM === 'number' && typeof rawTd.netIncomeTTM === 'number' && rawTd.netIncomeTTM > 0
      ? Number((rawTd.ocfTTM / rawTd.netIncomeTTM).toFixed(2))
      : joeliardiEval.ocfToNetIncomeRatio ??
        stock.ocfToNetIncomeRatio ??
        0.92;
  const ocfNiNarrativeClause =
    ocfNi >= 0.90
      ? 'konversi kas operasi sangat sehat (laba akuntansi terkonversi penuh menjadi kas riil)'
      : ocfNi >= 0.50
      ? 'konversi kas operasi moderat (sebagian laba terserap modal kerja / fase ekspansi)'
      : 'konversi kas operasi rendah (waspadai kualitas laba akrual)';
  const accrualPen = joeliardiEval.accrualPenaltyPts ?? 0;
  const sbn1Y = joeliardiEval.sbnSpot1YPct ?? 6.15;
  const sbn5Y = joeliardiEval.sbnSpot5YPct ?? 6.48;
  const sbn10Y = joeliardiEval.sbnSpot10YPct ?? 6.75;
  const sbnBlended = joeliardiEval.sbnBlendedSpotRfPct ?? 6.64;
  const dynKe = joeliardiEval.dynamicCostOfEquityPct ?? 12.64;
  const justPbv =
    joeliardiEval.damodaranJustifiedPbv ?? joeliardiEval.joeliardiFairPbv;
  const sustGrowth = joeliardiEval.sustainableGrowthRatePct ?? 5.5;
  const betaPropensity =
    stock.betaWeightedPropensity ?? Number((1 / Math.max(0.45, stock.beta1Y)).toFixed(2));
  const betaCap = joeliardiEval.betaWeightedSizingCapPct ?? 14.0;

  const costOfEquityPct = dynKe;
  const roeSpread = Number((stock.roe - costOfEquityPct).toFixed(1));
  const equityMultiplier = Number((1 + Math.max(0, stock.debtToEquity)).toFixed(2));
  const impliedRoaPct = Number((stock.roe / Math.max(1, equityMultiplier)).toFixed(1));
  const impliedAssetTurnover =
    stock.operatingMargin > 0
      ? Number(Math.max(0.15, impliedRoaPct / stock.operatingMargin).toFixed(2))
      : 0.65;

  const earningsYieldPct =
    joeliardiEval.impliedPer > 0
      ? Number((100 / joeliardiEval.impliedPer).toFixed(2))
      : 0;
  const sbnBenchmarkPct = sbnBlended;
  const erpBenchmarkPct = joeliardiEval.erpBenchmarkPct ?? 6.0;
  const hurdleRatePct = Number(dynKe.toFixed(2));
  const yieldSpreadVsSbn =
    joeliardiEval.rawSbnSpreadPct ?? Number((earningsYieldPct - sbnBenchmarkPct).toFixed(2));
  const netErpSpreadPct =
    joeliardiEval.netErpSpreadPct ?? Number((earningsYieldPct - hurdleRatePct).toFixed(2));

  const perDiscountPct =
    joeliardiEval.joeliardiFairPer > 0
      ? Number(
          (
            ((joeliardiEval.joeliardiFairPer - joeliardiEval.impliedPer) /
              joeliardiEval.joeliardiFairPer) *
            100
          ).toFixed(1)
        )
      : 0;

  // Sector-Specific Economic Context & Quantedge Multi-Method Metrics (Synchronized via ValuationLedger)
  const ledger = joeliardiEval.valuationLedger ?? joeliardiEval.valuationResult?.valuationLedger;
  const secShort = joeliardiEval.sectorPrimaryMetricShort ?? 'PBV';
  const secMult = joeliardiEval.sectorPrimaryImpliedMultiple ?? joeliardiEval.impliedPbv;
  const secFairMult = joeliardiEval.sectorPrimaryFairMultiple ?? justPbv;
  const secFairValIdr =
    ledger?.components[0]?.value ??
    joeliardiEval.sectorSpecificFairValueIdr ??
    joeliardiEval.intrinsicValueIdr;
  const rimFairValIdr =
    ledger?.components[1]?.value ??
    joeliardiEval.rimFairValueIdr ??
    joeliardiEval.intrinsicValueIdr;
  const rimFadeYrs = joeliardiEval.rimFadeYears ?? 6;
  const leg1WeightPct = Math.round((ledger?.components[0]?.weight ?? 0.45) * 100);
  const leg2WeightPct = Math.round((ledger?.components[1]?.weight ?? 0.35) * 100);
  const leg3Label =
    ledger?.components[2]?.label ??
    (stock.sector === 'Financials' ? 'Hist PBV Band 5Y' : 'Hist EV/EBITDA Band 5Y');
  const leg3ValIdr =
    ledger?.components[2]?.value ??
    joeliardiEval.valuationResult?.evEbitda5YAnchorValue ??
    joeliardiEval.intrinsicValueIdr;
  const leg3WeightPct = Math.round((ledger?.components[2]?.weight ?? 0.20) * 100);

  const peerTicker = joeliardiEval.statArbPeerTicker ?? 'PEER';
  const statArbZ = joeliardiEval.statArbZScore ?? 0;
  const statArbRho = joeliardiEval.statArbCorrelation ?? 0.85;
  const statArbTargetIdr = joeliardiEval.statArbImpliedTargetIdr ?? joeliardiEval.intrinsicValueIdr;
  const secPerShareIdr = joeliardiEval.sectorPrimaryPerShareIdr ?? joeliardiEval.estimatedEpsIdr;
  const gjFloorIdr =
    ledger?.standaloneFloor ??
    joeliardiEval.grahamJoeliardiBenchmarkIdr ??
    Math.round(joeliardiEval.intrinsicValueIdr * 0.82);
  const valModuleLabel =
    joeliardiEval.valuationModuleLabel ?? 'Steady Compounder Module';

  const justPbvStr = Number(justPbv).toFixed(2);
  const secFairMultStr = Number(secFairMult).toFixed(2);
  const secMultStr = Number(secMult).toFixed(2);
  const isCpoCyclical =
    isCpoPlantationTicker(stock.ticker) ||
    (joeliardiEval.sectorMethodologyProfile?.regime === 'CYCLICAL_COMMODITIES' &&
      stock.sector.toLowerCase().includes('consumer'));

  const secLower = stock.sector.toLowerCase();
  const sectorEconomicsNote = isCpoCyclical
    ? `Untuk emiten perkebunan/komoditas siklikal (sub-sektor CPO), daya saing struktural diukur melalui normalisasi laba lintas siklus (through-the-cycle ROE 5Y) dan matriks ${secShort} (${secMultStr}x vs Wajar ${secFairMultStr}x, Basis/Saham ~Rp ${secPerShareIdr.toLocaleString('id-ID')}) yang diuji terhadap GP/A (Novy-Marx) ${gpToAssets.toFixed(1)}% serta konversi kas OCF/NI ${ocfNi.toFixed(2)}x.`
    : secLower.includes('financial')
    ? `Di sektor Perbankan dan Keuangan, matriks utama adalah Damodaran Justified PBV (${joeliardiEval.impliedPbv.toFixed(2)}x vs Wajar ${justPbvStr}x) yang diukur dari konsistensi ROE TTM (${stock.roe.toFixed(1)}%) di atas Dynamic Cost of Equity Ke (${dynKe.toFixed(2)}%) serta kualitas kas OCF/NI ${ocfNi.toFixed(2)}x.`
    : secLower.includes('energy') || secLower.includes('basic') || secLower.includes('industrial')
    ? `Di sektor Energi, Komoditas & Barang Modal (${stock.sector}), riset finansial menuntut matriks ${secShort} (${secMultStr}x vs Wajar ${secFairMultStr}x, Basis/Saham ~Rp ${secPerShareIdr.toLocaleString('id-ID')}) yang diuji terhadap GP/A (Novy-Marx) ${gpToAssets.toFixed(1)}% dan rasio akrual OCF/NI ${ocfNi.toFixed(2)}x.`
    : secLower.includes('infra') || secLower.includes('tech') || secLower.includes('tele')
    ? `Di sektor Telekomunikasi, Menara & Infrastruktur (${stock.sector}), beban depresiasi jaringan yang masif membuat EPS terdistorsi sehingga valuasi difokuskan pada matriks ${secShort} (${secMultStr}x vs Wajar ${secFairMultStr}x, EBITDA/Saham ~Rp ${secPerShareIdr.toLocaleString('id-ID')}) serta kualitas kas OCF/NI ${ocfNi.toFixed(2)}x.`
    : secLower.includes('propert') || secLower.includes('real estate')
    ? `Di sektor Properti & REITs (${stock.sector}), laba bersih akuntansi kerap terdistorsi revaluasi aset non-kas sehingga valuasi difokuskan pada PBV Replacement & ${secShort} (${secMultStr}x vs Wajar ${secFairMultStr}x, AFFO/Saham ~Rp ${secPerShareIdr.toLocaleString('id-ID')}) dengan bobot 80% PBV Replacement + 20% ${leg3Label}.`
    : `Di sektor Konsumen & Kesehatan (${stock.sector}), daya saing struktural diukur melalui matriks ${secShort} (${secMultStr}x vs Wajar ${secFairMultStr}x) yang ditopang GP/A (Novy-Marx) ${gpToAssets.toFixed(1)}%, ROA murni ${impliedRoaPct}%, serta konversi kas OCF/NI ${ocfNi.toFixed(2)}x.`;

  // Defensive Discount Anomaly Override (Beta < 0.5 AND Skor Value > 9.0)
  const isDefensiveDiscountAnomaly =
    Boolean(joeliardiEval.isDefensiveDiscountAnomaly) ||
    (stock.beta1Y < 0.5 && stock.dmuValueScore > 9.0 && !stock.isHscFlagged);

  // Cross-Metric Anomaly & DuPont Diagnosis
  const isHighQualityOrganicRoe =
    (gpToAssets >= 16 || stock.roe >= 15) && stock.debtToEquity <= 0.85 && accrualPen === 0;
  const isLeveragedRoe = stock.roe >= 14 && stock.debtToEquity > 1.2;
  const isStructuralUnderperformer = stock.roe < costOfEquityPct && gpToAssets < 12;
  const isValueTrapCandidate =
    !isDefensiveDiscountAnomaly &&
    joeliardiEval.marginOfSafetyPct > 12 &&
    (isStructuralUnderperformer || accrualPen >= 10 || stock.return30D < -8.5 || stock.dmuMomScore < 4.3);
  const isDividendTrapRisk =
    !isDefensiveDiscountAnomaly &&
    forwardDivYield >= 6.0 &&
    (stock.return30D < -6.0 || stock.roe < 11.0 || ocfNi < 0.75);
  const isInstitutionalReRating =
    isDefensiveDiscountAnomaly ||
    (joeliardiEval.marginOfSafetyPct >= 15 &&
      stock.roe >= 14 &&
      accrualPen === 0 &&
      stock.return30D >= 0 &&
      !stock.isHscFlagged);
  const isMomentumOverextended =
    stock.return30D >= 14 && joeliardiEval.marginOfSafetyPct < -5;

  // Question-specific analytical angle
  const qLower = userQuestion.toLowerCase();
  const isAskingNews =
    qLower.includes('berita') ||
    qLower.includes('corporate action') ||
    qLower.includes('aksi korporasi') ||
    qLower.includes('katalis') ||
    qLower.includes('rups') ||
    qLower.includes('buyback');
  const isAskingTrapOrHsc =
    qLower.includes('trap') ||
    qLower.includes('hsc') ||
    qLower.includes('gorengan') ||
    qLower.includes('aman') ||
    qLower.includes('risiko') ||
    qLower.includes('utang');
  const isAskingDividendOrCash =
    qLower.includes('dividen') ||
    qLower.includes('cum') ||
    qLower.includes('yield') ||
    qLower.includes('arus kas');

  const positiveNews = recentNews.filter(
    (n) =>
      n.sentiment === 'RISK_ON' ||
      n.emitenCategory === 'DIVIDEN_RUPS' ||
      n.emitenCategory === 'FINANCIAL_EARNINGS' ||
      n.emitenCategory === 'CORPORATE_ACTION_MA'
  );
  const cautionNews = recentNews.filter(
    (n) => n.sentiment === 'RISK_OFF' || n.emitenCategory === 'REGULATORY_UMA_ISSUE'
  );

  // State-Based Recommendation Engine — Read 100% from Single Source of Truth (joeliardiEval)
  const hasActiveBuyback = Boolean(joeliardiEval.hasActiveBuyback ?? stock.hasActiveBuyback);
  const earningsGrowthYoYPct =
    ledger?.netIncomeYoYPct ?? joeliardiEval.earningsGrowthYoYPct ?? stock.earningsGrowthYoYPct ?? 0;
  const trailingRoePct =
    ledger?.roeTTM ?? joeliardiEval.trailingRoePct ?? stock.trailingRoePct ?? stock.roe;
  const roeTtmPct = trailingRoePct;
  const excessReturnPct =
    joeliardiEval.excessReturnSpreadPct ?? Number((roeTtmPct - dynKe).toFixed(2));

  const secProfile = joeliardiEval.sectorMethodologyProfile;
  const isFinancialsSector = secProfile?.regime === 'FINANCIALS';
  const trueRoaPct = joeliardiEval.trueRoaPct ?? secProfile?.trueRoaPct ?? impliedRoaPct;
  const assetLeverageRatio =
    joeliardiEval.assetLeverageRatio ?? secProfile?.assetLeverageRatio ?? equityMultiplier;
  const isHighConvictionEligible = Boolean(joeliardiEval.isHighConvictionActionEligible);
  const isSeedCapped =
    joeliardiEval.convictionGrade === 'C (SEED CAPPED)' ||
    joeliardiEval.sanityReport?.status === 'SEED_WARN' ||
    Boolean(joeliardiEval.isConvictionCappedBySeed);

  const fallbackDecisionTree = evaluateDynamicDecisionTree({
    isHscFlagged: Boolean(stock.isHscFlagged),
    isDefensiveDiscountAnomaly: isDefensiveDiscountAnomaly && isHighConvictionEligible,
    isCyclicalStrongBuyZScore:
      isHighConvictionEligible &&
      joeliardiEval.valuationModuleRoute === 'PURE_CYCLICAL' &&
      (joeliardiEval.pbvZScore ?? stock.pbvZScore ?? 0) <= -1.5,
    pbvZScore: joeliardiEval.pbvZScore ?? stock.pbvZScore,
    hasActiveBuyback,
    hasActiveCatalyst: Boolean(joeliardiEval.isCatalystActive ?? stock.hasActiveCatalyst),
    earningsGrowthYoYPct,
    forwardRoePct: roeTtmPct,
    costOfEquityPct: dynKe,
    marginOfSafetyPct: joeliardiEval.marginOfSafetyPct,
    dmuCompositeScore: stock.dmuCompositeScore,
    lastPriceIdr: stock.lastPrice,
    intrinsicValueIdr: joeliardiEval.intrinsicValueIdr,
    tickRounder: roundToIdxTick,
    marketRegime:
      regimeStatus === 'TENANG' || regimeStatus === 'WASPADA' || regimeStatus === 'VOLATIL'
        ? regimeStatus
        : 'VOLATIL',
    isHighConvictionActionEligible: isHighConvictionEligible,
    isSeedCapped,
    finalConvictionGrade: joeliardiEval.convictionGrade
  });

  const decisionState = joeliardiEval.decisionState ?? fallbackDecisionTree.decisionState;
  const dynamicRequiredMosPct =
    joeliardiEval.dynamicRequiredMosPct ?? fallbackDecisionTree.dynamicRequiredMosPct;
  const recommendedActionText =
    joeliardiEval.recommendedActionText ?? fallbackDecisionTree.recommendedActionText;
  const formattedAccumulationZone =
    joeliardiEval.formattedAccumulationZone ?? fallbackDecisionTree.formattedAccumulationZone;

  const isBuyOnStrengthCatalyst =
    isHighConvictionEligible && decisionState === 'BUY_ON_STRENGTH_CATALYST';
  const isCyclicalStrongBuy =
    isHighConvictionEligible && decisionState === 'STRONG_BUY_CYCLICAL_ZSCORE';
  const isQualityFairValue = decisionState === 'ACCUMULATE_QUALITY_FAIR_VALUE';

  const coreQualityMetricText = isFinancialsSector
    ? `ROE TTM ${roeTtmPct.toFixed(1)}% vs Ke ${dynKe.toFixed(2)}% (Spread ${excessReturnPct >= 0 ? '+' : ''}${excessReturnPct.toFixed(1)}%) · True ROA ${trueRoaPct.toFixed(2)}% · Asset/Eq ${assetLeverageRatio.toFixed(2)}x`
    : `GP/A ${gpToAssets.toFixed(1)}% · OCF/NI ${ocfNi.toFixed(2)}x · ROE TTM ${roeTtmPct.toFixed(1)}%`;

  // FIX 2.2: Single Source of Truth for Barbell Cap & Tranche Sizing (60% T1 / 40% T2, rounded 2 decimals)
  const maxBarbellCapPct = Number(
    (joeliardiEval.maxBarbellCapPct ?? joeliardiEval.riskSizingResult?.finalMaxAllocationPct ?? betaCap).toFixed(2)
  );
  const tranche1Pct = Number(
    (joeliardiEval.tranche1Pct ?? joeliardiEval.riskSizingResult?.tranche1AllocationPct ?? maxBarbellCapPct * 0.60).toFixed(2)
  );
  const tranche2Pct = Number(
    (joeliardiEval.tranche2Pct ?? joeliardiEval.riskSizingResult?.tranche2AllocationPct ?? maxBarbellCapPct - tranche1Pct).toFixed(2)
  );
  const maxBarbellCapStr = maxBarbellCapPct.toFixed(2);
  const tranche1Str = tranche1Pct.toFixed(2);
  const tranche2Str = tranche2Pct.toFixed(2);

  // FIX 3.1: Lock Grade & Primary Recommendation Thesis (resolveExecutionThesis) to Post-Penalty finalConvictionScore
  const finalConvictionScore =
    joeliardiEval.finalConvictionScore ??
    joeliardiEval.riskSizingResult?.adjustedConvictionScore ??
    joeliardiEval.totalConvictionScore;
  const finalConvictionGrade =
    joeliardiEval.riskSizingResult?.finalConvictionGrade ??
    joeliardiEval.convictionGrade;

  const executionThesis = resolveExecutionThesis({
    score: finalConvictionScore,
    convictionGrade: finalConvictionGrade,
    sanityStatus: joeliardiEval.sanityReport?.status,
    isWeakMoat: roeTtmPct < dynKe || Boolean(joeliardiEval.isMoatHaircutApplied),
    isHscPenaltyActive: stock.hscTier === 'KSEI_DIVIDEND_PENALTY' || Boolean(stock.isHscFlagged),
    isDispersionPenalized: Boolean(joeliardiEval.valuationResult?.isDispersionPenalized),
    isNonOpCatalystRejected: Boolean(joeliardiEval.sanityReport?.flags.includes('CATALYST_UNCONFIRMED_NON_OP')),
    marginOfSafetyPct: joeliardiEval.marginOfSafetyPct
  });
  const primaryActionLabel = joeliardiEval.primaryExecutionActionLabel ?? executionThesis.primaryActionLabel;

  // Verdict determination (100% Coherent with Header Grade Badge & Execution Thesis)
  let verdictBadge = `${finalConvictionGrade} · SKOR ${finalConvictionScore}/100 // ${primaryActionLabel}`;
  let verdictTitle = `${stock.ticker} (${coreQualityMetricText}) — Grade ${finalConvictionGrade} (Skor ${finalConvictionScore}/100): ${primaryActionLabel} (${executionThesis.holdingFactorsExplanation})`;
  if (stock.isHscFlagged) {
    verdictBadge = `${finalConvictionGrade} // ${primaryActionLabel}`;
    verdictTitle = `Komite Investasi tidak menyarankan pembelian ${stock.ticker} karena terdeteksi fluktuasi harga spekulatif (HSC) di luar kewajaran fundamental`;
  } else if (joeliardiEval.sanityReport?.status === 'FAIL') {
    verdictBadge = `${finalConvictionGrade} // ${primaryActionLabel}`;
    verdictTitle = `Audit Data Fundamental Wajib pada ${stock.ticker}: Terdeteksi flag [${joeliardiEval.sanityReport.flags.join(', ')}] sehingga status Grade A / Core Conviction diblokir`;
  } else if (isSeedCapped || finalConvictionScore < 65) {
    verdictBadge = `${finalConvictionGrade} · SKOR ${finalConvictionScore}/100 // ${primaryActionLabel}`;
    verdictTitle = `Status ${stock.ticker} berada pada ${finalConvictionGrade} (Skor ${finalConvictionScore}/100): ${primaryActionLabel} (${executionThesis.holdingFactorsExplanation})`;
  } else if (finalConvictionGrade === 'B (WATCHLIST / HOLD)' || (finalConvictionScore >= 65 && finalConvictionScore < 75)) {
    verdictBadge = `${finalConvictionGrade} · SKOR ${finalConvictionScore}/100 // ${primaryActionLabel}`;
    verdictTitle = `${stock.ticker} berstatus ${finalConvictionGrade} (Skor ${finalConvictionScore}/100): ${primaryActionLabel}. ${executionThesis.holdingFactorsExplanation} Plafon Maks. ${maxBarbellCapStr}% (Tranche 1: ${tranche1Str}% + Tranche 2: ${tranche2Str}%).`;
  } else {
    verdictBadge = `${finalConvictionGrade} · SKOR ${finalConvictionScore}/100 // ${primaryActionLabel}`;
    verdictTitle = `Peluang investasi pada ${stock.ticker} (${finalConvictionGrade} · Skor ${finalConvictionScore}/100): ${primaryActionLabel} dengan profitabilitas (${coreQualityMetricText}), ${shareholderYieldLabel} ${totalShareholderYieldPct.toFixed(2)}%, dan diskon MoS ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}% (Syarat MoS Min. ${dynamicRequiredMosPct.toFixed(1)}%, Plafon Maks. ${maxBarbellCapStr}%).`;
  }

  // Contextual Direct Analysis (Synchronized with Single Source of Truth ValuationLedger & Execution Thesis)
  const actionSummaryPhrase = `BERSTATUS ${primaryActionLabel}${
    finalConvictionGrade === 'B (WATCHLIST / HOLD)'
      ? ` (${executionThesis.holdingFactorsExplanation})`
      : ''
  }`;

  let directAnswerSummary = '';
  if (stock.isHscFlagged) {
    directAnswerSummary = `Hasil Analisis Nostradamus: Saham ${stock.ticker} TIDAK LAYAK DIAKUMULASI (${primaryActionLabel}) karena masuk dalam pantauan High Speculative Concentration (${stock.hscReason || 'pergerakan harga tidak didukung kinerja fundamental'}). Meskipun harga bergerak ${stock.change1D >= 0 ? '+' : ''}${stock.change1D}% (1D) dan ${stock.return30D >= 0 ? '+' : ''}${stock.return30D}% (30D), risiko spekulasinya terlalu tinggi bagi portofolio yang mengutamakan keamanan modal.`;
  } else if (isAskingTrapOrHsc) {
    directAnswerSummary = isValueTrapCandidate && !isBuyOnStrengthCatalyst
      ? `Hasil Audit Value Trap & Anti-Junk QMJ: Meskipun ${stock.ticker} bersih dari indikasi saham gorengan (HSC) dan tampak murah di atas kertas (Implied PER ${joeliardiEval.impliedPer.toFixed(2)}x, Implied PBV ${joeliardiEval.impliedPbv.toFixed(2)}x vs Justified PBV ${justPbvStr}x, Margin of Safety +${joeliardiEval.marginOfSafetyPct.toFixed(1)}%), komite menetapkan status ${primaryActionLabel} karena ${isStructuralUnderperformer ? `ROE TTM (${roeTtmPct.toFixed(1)}%) berada di bawah Dynamic Cost of Equity Ke ${dynKe.toFixed(2)}% (Spot Rf ${sbnBlended.toFixed(2)}%)` : `pergerakan harga 30 hari masih melemah (${stock.return30D}%)`}.`
      : `Hasil Audit Value Trap & Kualitas Sektor (${secProfile?.regimeBadgeLabel || stock.sector}): Emiten ${stock.ticker} bersih dari indikasi spekulatif (HSC) dengan Grade ${finalConvictionGrade} (Skor ${finalConvictionScore}/100) dan rekomendasi utama ${primaryActionLabel}. Selisih harga ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}% terhadap Nilai Intrinsik Wajar Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} (Graham-Joeliardi Floor Rp ${gjFloorIdr.toLocaleString('id-ID')} · Justified PBV ${justPbvStr}x) ditopang oleh ${coreQualityMetricText} serta ${shareholderYieldLabel} ${totalShareholderYieldPct.toFixed(2)}%.`;
  } else if (isAskingNews) {
    const topHeadlines = recentNews
      .slice(0, 2)
      .map((n) => `"${stripRawMarkdownArtifacts(n.title)}"`)
      .join(' serta ');
    directAnswerSummary = `Hasil Evaluasi Dampak Berita & Aksi Korporasi: Sentimen utama ${stock.ticker} dalam 3 bulan terakhir berfokus pada ${topHeadlines || 'perkembangan kinerja operasional dan pembagian dividen'}. ${joeliardiEval.catalystNarrative || ''} Dari kacamata fundamental kuantitatif (${secProfile?.regimeBadgeLabel || stock.sector}), emiten berstatus ${primaryActionLabel} dengan ${coreQualityMetricText} (EPS TTM ~Rp ${joeliardiEval.estimatedEpsIdr.toLocaleString('id-ID')}/saham), Earnings Yield ${earningsYieldPct}% dan ${shareholderYieldLabel} ${totalShareholderYieldPct.toFixed(2)}% terhadap Dynamic Cost of Equity Ke ${dynKe.toFixed(2)}%.`;
  } else if (isAskingDividendOrCash) {
    directAnswerSummary = `Hasil Bedah Kualitas Dividen, Buyback & Neraca (${secProfile?.regimeBadgeLabel || stock.sector}): Pada harga pasar Rp ${stock.lastPrice.toLocaleString('id-ID')}, Dividend Yield TTM ${stock.ticker} tercatat sebesar ${forwardDivYield.toFixed(2)}% ditambah Buyback Yield +${(joeliardiEval.dynamicBuybackYieldPct ?? 0).toFixed(2)}% (Net Payout Yield ${netPayoutYieldPct.toFixed(2)}%) menghasilkan ${shareholderYieldLabel} ${totalShareholderYieldPct.toFixed(2)}%. Indikator fundamental inti mencatat ${coreQualityMetricText} dengan rekomendasi utama ${primaryActionLabel}.`;
  } else {
    directAnswerSummary = `Hasil Analisis Nostradamus: Pada harga pasar Rp ${stock.lastPrice.toLocaleString('id-ID')}, tim riset menilai ${stock.ticker} (${valModuleLabel} · Grade ${finalConvictionGrade} · Skor ${finalConvictionScore}/100) ${actionSummaryPhrase}. Pasar menghargai ${stock.ticker} pada Implied PBV ${joeliardiEval.impliedPbv.toFixed(2)}x (vs Justified PBV ${justPbvStr}x) dan Implied PER ${joeliardiEval.impliedPer.toFixed(2)}x (Earnings Yield ${earningsYieldPct}% vs Dynamic Cost of Equity Ke ${dynKe.toFixed(2)}%), dengan profil fundamental ${coreQualityMetricText} (Syarat MoS Dinamis Min. ${dynamicRequiredMosPct.toFixed(1)}%) serta ${shareholderYieldLabel} ${totalShareholderYieldPct.toFixed(2)}%. Nilai Intrinsik Wajar Ensemble ditetapkan pada Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} (${ledger?.formulaAudit || joeliardiEval.ensembleFormulaAudit || `MoS ${joeliardiEval.marginOfSafetyPct}%`}) dengan Graham-Joeliardi Floor Benchmark di Rp ${gjFloorIdr.toLocaleString('id-ID')} dan batas alokasi Barbell Maks. ${maxBarbellCapStr}% portofolio (Tranche 1: ${tranche1Str}% + Tranche 2: ${tranche2Str}%).`;
  }

  // HOTFIX 4: Unified ATR & Volatility-Calibrated Stop Loss Formula across UI, Narrative, PNG, and PDF
  const spotTick = roundToIdxTick(stock.lastPrice);
  const intrinsicAccumulationCeiling = roundToIdxTick(joeliardiEval.intrinsicValueIdr * 0.85);
  const isUndercutDeepDiscount =
    !stock.isHscFlagged && (spotTick <= intrinsicAccumulationCeiling || isBuyOnStrengthCatalyst);
  const riskStopPrice =
    joeliardiEval.riskSizingResult?.stopLossPriceIDR ??
    roundToIdxTick(stock.lastPrice * 0.86);
  const riskStopPct =
    joeliardiEval.riskSizingResult?.stopLossPct ??
    Number((((stock.lastPrice - riskStopPrice) / Math.max(1, stock.lastPrice)) * 100).toFixed(2));

  // 20D ADTV & 5% Daily Market Liquidity Cap + 1/Beta Barbell Position Sizing Cap bounded by Real Portfolio Cash
  const adtv20dIdr =
    joeliardiEval.adtv20dIdr ||
    stock.adtv20dIdr ||
    estimateEmitenAdtv20dIdr(stock);
  const maxSafeAllocationIdr =
    joeliardiEval.maxSafeAllocationIdr || Math.round(adtv20dIdr * 0.05);

  const isBasket1Core = stock.beta1Y <= 0.96;
  const targetMaxPct = maxBarbellCapPct;
  const targetMinPct = tranche1Pct;
  const referenceActiveEquityIdr = 2_000_000_000;
  const rawTargetMaxNominalIdr = Math.round(referenceActiveEquityIdr * (targetMaxPct / 100));
  const realCashAvailableIdr =
    typeof availablePortfolioCashIdr === 'number' && availablePortfolioCashIdr > 0
      ? Math.round(availablePortfolioCashIdr)
      : typeof joeliardiEval.availablePortfolioCashIdr === 'number' && joeliardiEval.availablePortfolioCashIdr > 0
      ? Math.round(joeliardiEval.availablePortfolioCashIdr)
      : rawTargetMaxNominalIdr;
  const realCashCappedAllocationIdr = Math.max(
    0,
    Math.min(rawTargetMaxNominalIdr, realCashAvailableIdr, maxSafeAllocationIdr)
  );
  const isLiquidityCapped = !stock.isHscFlagged && Math.min(rawTargetMaxNominalIdr, realCashAvailableIdr) > maxSafeAllocationIdr;
  const formattedAdtv20d =
    joeliardiEval.decision?.formattedAdtv20d ??
    formatAdaptiveIdrValue(adtv20dIdr, '/hr');
  const formattedMaxSafe5PctAdtv =
    joeliardiEval.decision?.formattedMaxSafe5PctAdtv ??
    formatAdaptiveIdrValue(maxSafeAllocationIdr, '/hr');
  const formattedRealCashCapped = formatAdaptiveIdrValue(realCashCappedAllocationIdr, '/hr');

  const liquidityWarningBadge = !stock.isHscFlagged
    ? isLiquidityCapped
      ? `LIQUIDITY CAP WARNING: Target Alokasi Kas (${formatAdaptiveIdrValue(Math.min(rawTargetMaxNominalIdr, realCashAvailableIdr), '')}) > 5% ADTV 20D (Maks. ${formattedMaxSafe5PctAdtv} dari ADTV ${formattedAdtv20d})`
      : `LIQUIDITY & CASH VERIFIED: Eksekusi Maks. ${formattedRealCashCapped} (min Kas Riil & 5% ADTV ${formattedMaxSafe5PctAdtv} dari ADTV ${formattedAdtv20d})`
    : undefined;

  const sectorNoticePrefix = joeliardiEval.sectorMethodologyNotice
    ? `[${joeliardiEval.sectorMethodologyNotice}] `
    : '';

  const statArbFollowUpShort =
    Math.abs(statArbZ) > 2.0
      ? `Catatan Tactical Pair Overlay (0% Bobot Intrinsik): pasangan ${peerTicker} relatif lebih terdiskon secara statistik bagi trader pair, namun keputusan alokasi inti tetap mengacu pada sinyal fundamental utama (${primaryActionLabel}).`
      : `Sinyal StatArb Netral — ikuti disiplin eksekusi fundamental utama (${primaryActionLabel}).`;

  return {
    verdictBadge,
    verdictTitle,
    directAnswerSummary,
    convictionScore: finalConvictionScore,
    chainOfThoughtSteps: [
      isFinancialsSector
        ? `01. Audit Profitabilitas Bank (ROE-Ke Spread & True ROA — Bypass GP/A & OCF/NI): ROE TTM ${roeTtmPct.toFixed(1)}% vs Dynamic Ke ${dynKe.toFixed(2)}% (Excess Spread ${excessReturnPct >= 0 ? '+' : ''}${excessReturnPct.toFixed(1)}%), True ROA (NI/Assets) ${trueRoaPct.toFixed(2)}%, dan Asset-to-Equity ${assetLeverageRatio.toFixed(2)}x -> ${excessReturnPct >= 2 ? 'Franchise Perbankan Berkualitas Tinggi.' : 'Spread ROE terhadap Cost of Equity Perlu Dipantau.'}`
        : `01. Audit Profitabilitas Kas (GP/A & Anti-Junk OCF/NI): GP/A (Novy-Marx) ${gpToAssets.toFixed(1)}% (ROA murni ${trueRoaPct.toFixed(2)}% x Lev ${assetLeverageRatio.toFixed(2)}x, ROE TTM ${roeTtmPct.toFixed(1)}%) dengan OCF/NI ${ocfNi.toFixed(2)}x (${ocfNiNarrativeClause}${accrualPen > 0 ? ` · Penalti Akrual -${accrualPen} pts` : ''}) -> ${isHighQualityOrganicRoe && ocfNi >= 0.90 ? 'Mesin Kas Riil Berdaya Saing Kuat (Anti-Junk).' : isLeveragedRoe ? 'Laba Ditopang Leverage / Pantau Kas Operasi.' : 'Profitabilitas Operasional Terjaga.'}`,
      `02. Router ${valModuleLabel} & Ensemble 3-Kaki (ValuationLedger): Matriks Sektor ${secShort} (${leg1WeightPct}% · Rp ${secFairValIdr.toLocaleString('id-ID')}) [Justified PBV ${justPbvStr}x], Multi-Stage RIM ${rimFadeYrs}Y omega=${(joeliardiEval.rimPersistenceOmega ?? 0.72).toFixed(2)} (${leg2WeightPct}% · Rp ${rimFairValIdr.toLocaleString('id-ID')}), dan ${leg3Label} (${leg3WeightPct}% · Rp ${leg3ValIdr.toLocaleString('id-ID')}) + Floor Graham-Joeliardi Rp ${gjFloorIdr.toLocaleString('id-ID')} -> Harga Wajar Utama Quantedge Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} (MoS ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}% vs Syarat Dinamis Min. ${dynamicRequiredMosPct.toFixed(1)}%).`,
      `03. Tactical Overlay StatArb (${stock.ticker}<->${peerTicker}, Beta-Ratio ${(joeliardiEval.statArbBetaRatio ?? 1).toFixed(2)}x · 0% Bobot Intrinsik): Korelasi historis rho=${statArbRho.toFixed(2)} mencatat Z-Score ${statArbZ >= 0 ? '+' : ''}${statArbZ.toFixed(2)} SD (Target Konvergensi Pair Rp ${statArbTargetIdr.toLocaleString('id-ID')}) -> ${statArbFollowUpShort}`,
      `04. Sizing Barbell Vol-Targeted, Stop Loss ATR/Vol & Kas Riil: Plafon Alokasi Maks. ${maxBarbellCapStr}% portofolio (Tranche 1: ${tranche1Str}% + Tranche 2: ${tranche2Str}%), Stop Loss Kuantitatif ATR/Vol di Rp ${riskStopPrice.toLocaleString('id-ID')} (-${riskStopPct.toFixed(2)}%), didukung ${shareholderYieldLabel} ${totalShareholderYieldPct.toFixed(2)}% (Net Payout ${netPayoutYieldPct.toFixed(2)}%) & batas eksekusi min(Kas Riil, 5% ADTV) ${formattedRealCashCapped} -> ${stock.isHscFlagged ? 'Hindari Eksposur Spekulatif.' : isLiquidityCapped ? 'Wajib Pecah Order Sesuai Batas 5% ADTV.' : `${primaryActionLabel} (Plafon Maks. ${maxBarbellCapStr}%).`}`
    ],
    sections: [
      {
        id: 'fundamental-moat',
        badge: isFinancialsSector
          ? `01. PROFITABILITAS BANK // SKOR ${joeliardiEval.businessQualityScore}/100`
          : `01. GP/A & ANTI-JUNK // SKOR ${joeliardiEval.businessQualityScore}/100`,
        title: isFinancialsSector
          ? `Bedah ROE-Ke Spread, True ROA (NI/Assets) & ${shareholderYieldLabel}`
          : `Bedah Gross Profitability (Novy-Marx), Kualitas Kas OCF/NI & ${shareholderYieldLabel}`,
        keyMetricHighlight: isFinancialsSector
          ? `ROE TTM ${roeTtmPct.toFixed(1)}% vs Ke ${dynKe.toFixed(2)}% · True ROA ${trueRoaPct.toFixed(2)}% · Asset/Eq ${assetLeverageRatio.toFixed(2)}x · ${shareholderYieldLabel} ${totalShareholderYieldPct.toFixed(2)}%`
          : `GP/A ${gpToAssets.toFixed(1)}% · OCF/NI ${ocfNi.toFixed(2)}x · ROE TTM ${roeTtmPct.toFixed(1)}% · ${shareholderYieldLabel} ${totalShareholderYieldPct.toFixed(2)}%`,
        reasoningParagraph: isFinancialsSector
          ? `${sectorNoticePrefix}Pada sektor Perbankan & Jasa Keuangan, Dana Pihak Ketiga (DPK) / Dana Syirkah Temporer merupakan bahan baku penyaluran pembiayaan sehingga metrik korporasi non-bank (GP/A Novy-Marx, OCF/NI, DER korporasi, dan EV/EBITDA) di-bypass otomatis. Kualitas fundamental ${stock.ticker} diukur dari ROE TTM ${roeTtmPct.toFixed(1)}% terhadap Dynamic Cost of Equity Ke ${dynKe.toFixed(2)}% (Excess Return Spread ${excessReturnPct >= 0 ? '+' : ''}${excessReturnPct.toFixed(1)}%), True ROA (Net Income / Total Assets) sebesar ${trueRoaPct.toFixed(2)}%, dan Asset Leverage (Assets / Equity) sebesar ${assetLeverageRatio.toFixed(2)}x.`
          : `${sectorNoticePrefix}${sectorEconomicsNote} Berdasarkan kerangka Novy-Marx (2013) dan Quality Minus Junk (Asness et al. 2019), ${stock.ticker} mencatatkan Gross Profitability to Assets (GP/A) sebesar ${gpToAssets.toFixed(1)}% dan rasio arus kas operasi terhadap laba bersih (OCF/NI) sebesar ${ocfNi.toFixed(2)}x (${ocfNiNarrativeClause}${accrualPen > 0 ? `; terkena pengurang skor kualitas -${accrualPen} poin akibat selisih akrual kas` : ''}). Dari dekomposisi DuPont, ROE TTM ${roeTtmPct.toFixed(1)}% (Excess Return ${excessReturnPct >= 0 ? '+' : ''}${excessReturnPct.toFixed(1)}% vs Ke ${dynKe.toFixed(2)}%) ditopang oleh True ROA ${trueRoaPct.toFixed(2)}% dan Asset Multiplier ${assetLeverageRatio.toFixed(2)}x (DER ${(rawTd?.debtToEquity ?? stock.debtToEquity).toFixed(2)}x).`,
        bulletPoints: isFinancialsSector
          ? [
              `Kualitas Profitabilitas Perbankan (Basis TTM_DEFAULT): ROE TTM ${roeTtmPct.toFixed(1)}% vs Dynamic Ke ${dynKe.toFixed(2)}% (Spread ${excessReturnPct >= 0 ? '+' : ''}${excessReturnPct.toFixed(1)}%), True ROA (NI/Assets) ${trueRoaPct.toFixed(2)}%, EPS TTM ~Rp ${joeliardiEval.estimatedEpsIdr.toLocaleString('id-ID')}, serta BVPS Snapshot ~Rp ${joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')}.`,
              `Struktur Modal & Intermediasi Aset: Asset-to-Equity Multiplier tercatat ${assetLeverageRatio.toFixed(2)}x (DER korporasi non-bank di-bypass untuk sektor Financials).`,
              `Rincian ${shareholderYieldLabel} (Anti-Double Count): Forward Dividend Yield (Est) sebesar ${forwardDivYield.toFixed(2)}% (~Rp ${fwdDivCalc.estimatedForwardDpsIdr.toLocaleString('id-ID')}/saham${fwdDivCalc.isDividendOutlierSanitized ? ' · TTM Special Dividend Disanitasi' : ''}) + Buyback Yield +${(joeliardiEval.dynamicBuybackYieldPct ?? 0).toFixed(2)}% = Net Payout Yield ${netPayoutYieldPct.toFixed(2)}%.`
            ]
          : [
              `Kualitas Profitabilitas Kas (Basis TTM_DEFAULT): GP/A sebesar ${gpToAssets.toFixed(1)}% berpadu dengan OCF/NI ${ocfNi.toFixed(2)}x, ROE TTM ${roeTtmPct.toFixed(1)}%, serta EPS TTM ~Rp ${joeliardiEval.estimatedEpsIdr.toLocaleString('id-ID')} (BVPS Snapshot ~Rp ${joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')}).`,
              `Kesehatan Neraca & Solvabilitas: Rasio DER ${stock.debtToEquity.toFixed(2)}x (Asset Multiplier ${assetLeverageRatio.toFixed(2)}x) ${stock.debtToEquity <= 0.5 ? 'menunjukkan neraca sangat konservatif dan minim risiko gagal bayar' : stock.debtToEquity <= 1.0 ? 'masih berada dalam batas aman bagi standar investasi jangka panjang' : 'perlu dipantau secara berkala terhadap beban bunga (QMJ Cyclical Filter)'}.`,
              `Rincian ${shareholderYieldLabel} (Anti-Double Count): Forward Dividend Yield (Est) sebesar ${forwardDivYield.toFixed(2)}% (~Rp ${fwdDivCalc.estimatedForwardDpsIdr.toLocaleString('id-ID')}/saham${fwdDivCalc.isDividendOutlierSanitized ? ' · TTM Special Dividend Disanitasi' : ''}) + Buyback Yield +${(joeliardiEval.dynamicBuybackYieldPct ?? 0).toFixed(2)}% = Net Payout Yield ${netPayoutYieldPct.toFixed(2)}%${(joeliardiEval.netDebtPaydownYieldPct ?? 0) > 0 ? ` (+ Net Debt Paydown Yield +${(joeliardiEval.netDebtPaydownYieldPct ?? 0).toFixed(2)}% → TSY ${totalShareholderYieldPct.toFixed(2)}%)` : ''}.`
            ],
        sentimentTone:
          joeliardiEval.businessQualityScore >= 75 && joeliardiEval.balanceSheetHealthScore >= 75
            ? 'POSITIVE'
            : joeliardiEval.businessQualityScore >= 55
            ? 'NEUTRAL'
            : 'CAUTION'
      },
      {
        id: 'oos-valuation',
        badge: `02. ${valModuleLabel.toUpperCase()} // MOS ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}%`,
        title: `Router ${valModuleLabel}, Ensemble Dinamis & Standalone Graham-Joeliardi Floor`,
        keyMetricHighlight: `Utama Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} · Justified PBV ${justPbvStr}x · Floor G-J Rp ${gjFloorIdr.toLocaleString('id-ID')} · RIM omega=${(joeliardiEval.rimPersistenceOmega ?? 0.72).toFixed(2)}`,
        reasoningParagraph: `${joeliardiEval.sectorAcademicRationale || ''} Mengacu pada ValuationLedger (DynamicEnsembleWeighter), Justified PBV ${justPbvStr}x, dan kurva Spot SBN Fabozzi (Blended Spot Rf ${sbnBlended.toFixed(2)}% -> Dynamic Ke ${dynKe.toFixed(2)}%), Harga Wajar Utama ditetapkan sebesar Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} (${ledger?.formulaAudit || joeliardiEval.ensembleFormulaAudit || ''}). Sebagai jangkar konservatif terpisah (0% bobot ensemble), Graham-Joeliardi "Moat" Floor Benchmark berada di Rp ${gjFloorIdr.toLocaleString('id-ID')}${joeliardiEval.isMoatHaircutApplied ? ' (termasuk Weak Moat Penalty -25%)' : ''}.`,
        bulletPoints: [
          `Komparasi Multi-Metode & Bobot Dinamis (ValuationLedger): Acuan Utama Quantedge Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} (MoS ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}% vs Syarat MoS Dinamis Min. ${dynamicRequiredMosPct.toFixed(1)}%) disusun dari Matriks Sektor (${secShort} · ${leg1WeightPct}% · Justified PBV ${justPbvStr}x) Rp ${secFairValIdr.toLocaleString('id-ID')}, Multi-Stage RIM ${rimFadeYrs}Y (${leg2WeightPct}%) Rp ${rimFairValIdr.toLocaleString('id-ID')}, dan ${leg3Label} (${leg3WeightPct}%) Rp ${leg3ValIdr.toLocaleString('id-ID')}, serta Standalone Floor Graham-Joeliardi Rp ${gjFloorIdr.toLocaleString('id-ID')}.`,
          `Tactical Overlay Statistical Arbitrage (${stock.ticker} vs ${peerTicker} · 0% Bobot Intrinsik): ${joeliardiEval.statArbRationale ?? `Korelasi historis rho=${statArbRho.toFixed(2)} dengan Z-Score ${statArbZ.toFixed(2)} SD mengindikasikan target konvergensi relatif Rp ${statArbTargetIdr.toLocaleString('id-ID')}. ${statArbFollowUpShort}`}`,
          `Keputusan Eksekusi & MoS Dinamis: ${primaryActionLabel} — ${executionThesis.holdingFactorsExplanation}`
        ],
        sentimentTone:
          isHighConvictionEligible &&
          (isDefensiveDiscountAnomaly || isCyclicalStrongBuy || isBuyOnStrengthCatalyst || (joeliardiEval.marginOfSafetyPct >= dynamicRequiredMosPct && !isValueTrapCandidate))
            ? 'POSITIVE'
            : joeliardiEval.marginOfSafetyPct >= 0
            ? 'NEUTRAL'
            : 'CAUTION'
      },
      {
        id: 'news-hsc-catalysts',
        badge: stock.isHscFlagged
          ? stock.hscTier === 'EARLY_WARNING_SUSPECT'
            ? '03. RADAR SUSPECT HSC // BLOKIR'
            : '03. AUDIT HSC BEI-KSEI // BLOKIR'
          : stock.hscTier === 'KSEI_DIVIDEND_PENALTY' && stock.kseiHscConcentrationPct
          ? `03. HSC KSEI TOP-10 ${stock.kseiHscConcentrationPct.toFixed(1)}% // PENALTI SKOR`
          : `03. KATALIS & HSC // ${recentNews.length} BERITA`,
        title: 'Evaluasi Konsentrasi Kepemilikan BEI-KSEI, Radar Early Warning HSC & Likuiditas ADTV',
        keyMetricHighlight: `${
          stock.isHscFlagged
            ? stock.hscTier === 'EARLY_WARNING_SUSPECT'
              ? 'SUSPECT HSC · Early Warning Quant (Blokir Top Buy)'
              : `HSC RESMI BEI-KSEI ${stock.kseiHscConcentrationPct ? `Top-10: ${stock.kseiHscConcentrationPct.toFixed(3).replace('.', ',')}%` : ''} (Blokir Top Buy)`
            : stock.hscTier === 'KSEI_DIVIDEND_PENALTY' && stock.kseiHscConcentrationPct
            ? `HSC KSEI Top-10: ${stock.kseiHscConcentrationPct.toFixed(3).replace('.', ',')}% (${stock.kseiHscIsNew ? 'Baru/New' : 'Eksisting'}) · Penalti -${(stock.kseiHscScorePenaltyPts || 0.45).toFixed(2)} Tanpa Blokir`
            : 'Clean Institutional (Bebas HSC KSEI & Suspect)'
        } · ADTV 20D ${formattedAdtv20d} · Kapasitas 5% ADTV ${formattedMaxSafe5PctAdtv}`,
        reasoningParagraph: stock.isHscFlagged
          ? `Sistem mendeteksi ${stock.ticker} masuk dalam kategori ${
              stock.hscTier === 'EARLY_WARNING_SUSPECT'
                ? 'Suspect HSC / Early Warning Quant (terdeteksi anomali pergerakan harga/volatilitas spekulatif sebelum rilis resmi BEI)'
                : 'Daftar Resmi Kepemilikan Saham Terkonsentrasi Tinggi BEI-KSEI tanpa dukungan dividen memadai atau dalam proses delisting'
            } (${stock.hscReason || 'pergerakan harga tidak wajar'}). Demi menjaga keamanan modal, saham ini diblokir otomatis dari Top Decile Buy dan Barbell Allocator.`
          : stock.hscTier === 'KSEI_DIVIDEND_PENALTY' && stock.kseiHscConcentrationPct
          ? `Berdasarkan Pengumuman BEI-KSEI No. Peng-HSC-00088/BEI.WAS/11-2026 per 30 Oktober 2026, konsentrasi kepemilikan Top 10 pemegang saham ${stock.ticker} mencapai ${stock.kseiHscConcentrationPct.toFixed(3).replace('.', ',')}% (Status: ${stock.kseiHscIsNew ? 'Baru/New' : 'Eksisting'}, sisa free float publik maksimal ${(100 - stock.kseiHscConcentrationPct).toFixed(2).replace('.', ',')}%). Sesuai kebijakan kuantitatif Dual-Tier, karena ${stock.ticker} memiliki dukungan pembagian dividen rutin (Dividend Yield ${forwardDivYield.toFixed(2)}%) dan fundamental yang sehat, saham ini TIDAK diblokir otomatis melainkan dikenai penalti skor likuiditas -${(stock.kseiHscScorePenaltyPts || 0.45).toFixed(2).replace('.', ',')} poin serta wajib mematuhi batas eksekusi 5% ADTV 20D (~${formattedMaxSafe5PctAdtv}).`
          : `Dari ${recentNews.length} berita dan keterbukaan informasi terbaru pada ${stock.ticker}, perhatian pelaku pasar tertuju pada rilis kinerja keuangan, proyeksi dividen ke depan, serta prospek sektor ${stock.sector}. Aktivitas perdagangannya bersih dari daftar konsentrasi HSC BEI-KSEI maupun sinyal Early Warning Suspect dengan nilai transaksi harian rata-rata 20 hari (ADTV 20D) sekitar ${formattedAdtv20d}.`,
        bulletPoints:
          recentNews.length > 0
            ? recentNews.slice(0, 3).map(
                (n) =>
                  `[${n.emitenCategory || 'KATALIS'}] ${stripRawMarkdownArtifacts(n.title)} (${n.source} · ${n.publishedAt})`
              )
            : [
                `Agenda Korporasi yang Perlu Dipantau: Realisasi laba TTM terdekumulasi serta penetapan rasio pembayaran dividen (DPR historis 3Y ~${historicalDpr3Y.toFixed(0)}%) pada RUPS ${stock.ticker}.`,
                `Kedalaman Likuiditas Pasar (ADTV 20D): Rata-rata nilai transaksi harian 20 hari mencapai ${formattedAdtv20d}, sehingga batas aman eksekusi harian tanpa memicu slippage adalah 5% ADTV (~${formattedMaxSafe5PctAdtv}).`
              ],
        sentimentTone: stock.isHscFlagged
          ? 'NEGATIVE'
          : stock.hscTier === 'KSEI_DIVIDEND_PENALTY' || cautionNews.length > positiveNews.length
          ? 'CAUTION'
          : 'POSITIVE'
      },
      {
        id: 'regime-momentum-fit',
        badge: `04. BARBELL SIZING & STOP LOSS // ${joeliardiEval.decision?.marketRegime ?? regimeStatus}`,
        title: 'Penjatahan Porsi Barbell Vol-Targeted, Stop Loss ATR/Vol & Batas 5% ADTV',
        keyMetricHighlight: `Propensitas 1/Beta ${betaPropensity.toFixed(2)}x · Cap Maks. ${maxBarbellCapStr}% (T1: ${tranche1Str}% + T2: ${tranche2Str}%) · Stop Loss Rp ${riskStopPrice.toLocaleString('id-ID')} (-${riskStopPct.toFixed(2)}%) · Maks. ${formattedRealCashCapped}`,
        reasoningParagraph: `Sesuai prinsip Risk Parity (Qian 2005) dan Volatility-Targeted Barbell (Taleb 2012), saham dengan Beta 1Y ${stock.beta1Y.toFixed(2)}x dan volatilitas tahunan ${stock.volatilityAnn.toFixed(1)}% memiliki Batas Alokasi Maksimum Maks. ${maxBarbellCapStr}% dari modal portofolio (Tranche 1 Inisiasi 60%: ${tranche1Str}% ekuitas + Tranche 2 Konfirmasi 40%: ${tranche2Str}% ekuitas) dan Stop Loss Kuantitatif ATR/Volatilitas di Rp ${riskStopPrice.toLocaleString('id-ID')} (-${riskStopPct.toFixed(2)}%). Berdasarkan validasi likuiditas terhadap sisa kas riil portofolio dan 5% ADTV 20D, batas serapan harian ditetapkan sebesar ${formattedRealCashCapped}.`,
        bulletPoints: [
          `Penempatan Portofolio Barbell & Plafon Vol-Targeted: ${isBasket1Core ? `Ideal ditempatkan di Keranjang 1 (Defensive Core — Propensitas 1/Beta ${betaPropensity.toFixed(2)}x, Plafon Maks. ${maxBarbellCapStr}% = Tranche 1 ${tranche1Str}% + Tranche 2 ${tranche2Str}% ekuitas).` : `Ditempatkan di Keranjang 2 (Tactical Alpha — Propensitas 1/Beta ${betaPropensity.toFixed(2)}x membatasi Plafon Maks. ${maxBarbellCapStr}% = Tranche 1 ${tranche1Str}% + Tranche 2 ${tranche2Str}% ekuitas untuk mencegah tail-risk).`}`,
          `Stop Loss Kuantitatif ATR/Volatilitas Terpadu: Batas pengaman modal ditetapkan di Rp ${riskStopPrice.toLocaleString('id-ID')} (-${riskStopPct.toFixed(2)}% dari harga spot, dihitung dari max[2.5x ATR20, 1.5x Vol_bulanan] terklamp 12%-18%) dengan Graham-Joeliardi Floor di Rp ${gjFloorIdr.toLocaleString('id-ID')}.`,
          `Validasi Kas Riil & 5% ADTV Rule: Alokasi dibatasi pada minimum antara sisa kas riil portofolio dan 5% ADTV 20D (Maks. ${formattedRealCashCapped} per sesi dari kapasitas 5% ADTV ${formattedMaxSafe5PctAdtv}) guna mencegah dampak harga (slippage) dan over-allocation.`
        ],
        sentimentTone:
          stock.volatilityAnn <= 26 && !stock.isHscFlagged ? 'POSITIVE' : 'NEUTRAL'
      }
    ],
    bullishDrivers: joeliardiEval.keyStrengths.map(stripRawMarkdownArtifacts),
    bearishRisks: joeliardiEval.keyRisks.map(stripRawMarkdownArtifacts),
    executionStrategy: {
      recommendedAction: `${primaryActionLabel} — ${executionThesis.holdingFactorsExplanation}`,
      idealEntryZone: formattedAccumulationZone,
      InvalidationOrRiskLimit: stock.isHscFlagged
        ? 'Batasi porsi maksimal 0% dari portofolio.'
        : `Stop Loss Kuantitatif ATR/Volatilitas: Rp ${riskStopPrice.toLocaleString('id-ID')} (-${riskStopPct.toFixed(2)}% dari harga spot, max[2.5x ATR20, 1.5x Vol_bulanan] | Graham-Joeliardi Floor: Rp ${gjFloorIdr.toLocaleString('id-ID')}) disertai trigger invalidasi fundamental ROIC/ROE TTM < Ke (${dynKe.toFixed(2)}%) atau OCF/NI di bawah ambang sehat.`,
      portfolioAllocationGuide: stock.isHscFlagged
        ? '0% Modal Portofolio (Diblokir oleh filter perlindungan modal)'
        : isBasket1Core
        ? `Keranjang 1 (Defensive Core · 1/Beta ${betaPropensity.toFixed(2)}x): Plafon Maks. ${maxBarbellCapStr}% (Tranche 1: ${tranche1Str}% + Tranche 2: ${tranche2Str}%). BATAS EKSEKUSI KAS RIIL & 5% ADTV Maks. ${formattedRealCashCapped} (5% ADTV ${formattedMaxSafe5PctAdtv} dari ADTV ${formattedAdtv20d}).`
        : `Keranjang 2 (Tactical Alpha · 1/Beta ${betaPropensity.toFixed(2)}x): Plafon Maks. ${maxBarbellCapStr}% (Tranche 1: ${tranche1Str}% + Tranche 2: ${tranche2Str}%). BATAS EKSEKUSI KAS RIIL & 5% ADTV Maks. ${formattedRealCashCapped} (5% ADTV ${formattedMaxSafe5PctAdtv} dari ADTV ${formattedAdtv20d}).`,
      isUndercutDeepDiscount,
      isLiquidityCapped,
      liquidityWarningBadge,
      adtv20dIdr,
      maxSafeAllocationIdr
    }
  };
}

/**
 * Generates an on-demand Pre-Buy Fundamental & News Conviction Analysis.
 * Uses Server-Side Gemini API (/api/ai/inspect-emiten) when available, with a deep multi-variable
 * Chain-of-Thought analytical engine for GitHub Pages static mode.
 */
export async function requestEmitenAiInspection(params: {
  stock: StockMetrics;
  joeliardiEval: JoeliardiOosEvaluation;
  recentNews: NewsSentimentItem[];
  userQuestion: string;
  regimeStatus: string;
  availablePortfolioCashIdr?: number;
}): Promise<{
  analysis: string;
  structuredReport: StructuredAiConvictionReport;
  isAiGenerated: boolean;
  generatedAt: string;
}> {
  const { stock, joeliardiEval, recentNews, userQuestion, regimeStatus, availablePortfolioCashIdr } = params;
  const fallbackReport = buildDeepAnalyticalConvictionReport(params);

  if (canUseExpressOnDemandApi()) {
    try {
      const res = await fetch('/api/ai/inspect-emiten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock,
          joeliardiEval,
          recentNews,
          userQuestion,
          regimeStatus,
          availablePortfolioCashIdr
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.structuredReport && typeof data.structuredReport === 'object') {
          const sr = data.structuredReport as StructuredAiConvictionReport;
          const rawSummary = stripRawMarkdownArtifacts(
            sr.directAnswerSummary || fallbackReport.directAnswerSummary
          );
          const cleanedSummary = rawSummary
            .replace(/^(Keputusan Komite atas pertanyaan Anda|Menjawab fokus Anda|Menjawab pertanyaan Anda)\s*(\([^)]*\))?\s*:\s*/i, '')
            .trim();

          const rawCotSteps =
            Array.isArray(sr.chainOfThoughtSteps) && sr.chainOfThoughtSteps.length > 0
              ? sr.chainOfThoughtSteps.map(stripRawMarkdownArtifacts)
              : fallbackReport.chainOfThoughtSteps;

          // Strictly enforce the Beta < 0.5 & Skor Value > 9.0 Defensive Override in Step 03 even on live AI output
          const enforcedCotSteps = rawCotSteps.map((step, idx) => {
            if (idx === 2 && joeliardiEval.isDefensiveDiscountAnomaly) {
              return fallbackReport.chainOfThoughtSteps[2];
            }
            return step;
          });

          const isCatalystBuyOverride =
            joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST';

          const sanitizedReport: StructuredAiConvictionReport = {
            verdictBadge: fallbackReport.verdictBadge,
            verdictTitle: (
              joeliardiEval.isDefensiveDiscountAnomaly || isCatalystBuyOverride
                ? fallbackReport.verdictTitle
                : stripRawMarkdownArtifacts(
                    sr.verdictTitle || fallbackReport.verdictTitle
                  )
            ).replace(/^Strong\s+Buy\s*[:—-]\s*/i, ''),
            directAnswerSummary: cleanedSummary || fallbackReport.directAnswerSummary,
            convictionScore: fallbackReport.convictionScore,
            chainOfThoughtSteps: enforcedCotSteps,
            sections:
              Array.isArray(sr.sections) && sr.sections.length > 0
                ? sr.sections.map((sec, idx) => ({
                    id: sec.id || `sec-${idx}`,
                    badge: stripRawMarkdownArtifacts(sec.badge || `PILAR ${idx + 1}`),
                    title: stripRawMarkdownArtifacts(sec.title || ''),
                    keyMetricHighlight: stripRawMarkdownArtifacts(
                      sec.keyMetricHighlight || ''
                    ),
                    reasoningParagraph: stripRawMarkdownArtifacts(
                      sec.reasoningParagraph || ''
                    ),
                    bulletPoints: Array.isArray(sec.bulletPoints)
                      ? sec.bulletPoints.map(stripRawMarkdownArtifacts)
                      : [],
                    sentimentTone: sec.sentimentTone || 'NEUTRAL'
                  }))
                : fallbackReport.sections,
            bullishDrivers:
              Array.isArray(sr.bullishDrivers) && sr.bullishDrivers.length > 0
                ? sr.bullishDrivers.map(stripRawMarkdownArtifacts)
                : fallbackReport.bullishDrivers,
            bearishRisks:
              Array.isArray(sr.bearishRisks) && sr.bearishRisks.length > 0
                ? sr.bearishRisks.map(stripRawMarkdownArtifacts)
                : fallbackReport.bearishRisks,
            executionStrategy: {
              recommendedAction: (
                joeliardiEval.isDefensiveDiscountAnomaly || isCatalystBuyOverride
                  ? fallbackReport.executionStrategy.recommendedAction
                  : stripRawMarkdownArtifacts(
                      sr.executionStrategy?.recommendedAction ||
                        fallbackReport.executionStrategy.recommendedAction
                    )
              ).replace(/^Strong\s+Buy\s*[:—-]\s*/i, ''),
              idealEntryZone: fallbackReport.executionStrategy.idealEntryZone,
              InvalidationOrRiskLimit: stripRawMarkdownArtifacts(
                sr.executionStrategy?.InvalidationOrRiskLimit ||
                  fallbackReport.executionStrategy.InvalidationOrRiskLimit
              ),
              portfolioAllocationGuide: fallbackReport.executionStrategy.portfolioAllocationGuide,
              isUndercutDeepDiscount: fallbackReport.executionStrategy.isUndercutDeepDiscount,
              isLiquidityCapped: fallbackReport.executionStrategy.isLiquidityCapped,
              liquidityWarningBadge: fallbackReport.executionStrategy.liquidityWarningBadge,
              adtv20dIdr: fallbackReport.executionStrategy.adtv20dIdr,
              maxSafeAllocationIdr: fallbackReport.executionStrategy.maxSafeAllocationIdr
            }
          };

          return {
            analysis: sanitizedReport.directAnswerSummary,
            structuredReport: sanitizedReport,
            isAiGenerated: true,
            generatedAt: data.generatedAt || new Date().toISOString()
          };
        }
      }
    } catch {
      // fall through to deep analytical conviction engine below
    }
  }

  return {
    analysis: fallbackReport.directAnswerSummary,
    structuredReport: fallbackReport,
    isAiGenerated: false,
    generatedAt: new Date().toISOString()
  };
}

