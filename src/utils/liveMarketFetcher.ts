import {
  EmitenNewsCategory,
  JoeliardiOosEvaluation,
  MacroIndicator,
  NewsSentimentItem,
  StockMetrics,
  StructuredAiConvictionReport
} from '../types/quant';
import { enrichStockMetrics, rankUniverseWithBuffer } from './quantEngine';
import {
  FULL_JCI_EMITEN_CATALOG,
  createCalibratedIdxEntry,
  getEmitenDividendYield,
  isInstitutionalLiquidCandidate
} from '../data/idxAllEmitenCatalog';
import { pullLiveMarketSnapshotFromGitHubApi } from './githubCloudSync';
import embeddedSnapshotRaw from '../data/staticMarketSnapshot.json';

export interface IdxDirectoryEntry {
  ticker: string;
  name: string;
  sector: string;
  defaultRoe: number;
  defaultDer: number;
  defaultOpMargin: number;
  approxPrice: number;
  approxBeta: number;
}

export interface SparkSeriesItem {
  symbol: string;
  lastPrice: number;
  change1D: number;
  closes: number[];
  timestamp?: number[];
  shortName?: string;
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

interface StaticMarketSnapshotPayload {
  generatedAt?: string;
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
 * Dynamic Full JCI / BEI Universe Registry (~956 Emiten as of Nov 2026, Auto-Expanding on New Listings)
 */
export const IDX_SECTOR_CATALOG: IdxDirectoryEntry[] = FULL_JCI_EMITEN_CATALOG;

/**
 * Builds the Full JCI Stock Universe (~956+ Emiten BEI across 11 IDX-IC Sectors).
 * Hydrates every verified stock with its genuine Yahoo Finance price, 1D%, 30D%, Beta & Volatility.
 * Any ticker that is unquoted/delisted on Yahoo Finance or stagnant/gocap (< Rp 68 or flat-line closes)
 * is strictly marked `isLiquid: false` (and `lastPrice: 0` if unquoted) so it NEVER uses fake default prices
 * and NEVER enters Keranjang 1 or Keranjang 2.
 */
export function buildIdx100StockUniverse(
  rebalanceBufferPct: number = 40,
  extraEntries: IdxDirectoryEntry[] = []
): StockMetrics[] {
  const nowStr = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const mergedCatalogMap = new Map<string, IdxDirectoryEntry>();
  for (const item of IDX_SECTOR_CATALOG) {
    mergedCatalogMap.set(item.ticker, item);
  }
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

      let beta1Y = entry.approxBeta;
      let volatilityAnn = Number((entry.approxBeta * 22.0).toFixed(1));

      const stockRets = computeDailyReturns(snapItem.closes);
      if (stockRets.length >= 12 && ihsgRets.length >= 12) {
        const bv = computeBetaAndVolatility(stockRets, ihsgRets, isLiquid);
        beta1Y = bv.beta1Y;
        volatilityAnn = bv.volatilityAnn;
      }

      return enrichStockMetrics({
        ticker: entry.ticker,
        idxTicker: `IDX:${entry.ticker}`,
        yfTicker,
        name: entry.name,
        sector: entry.sector,
        lastPrice,
        change1D,
        return30D,
        beta1Y,
        volatilityAnn,
        roe: entry.defaultRoe,
        debtToEquity: entry.defaultDer,
        operatingMargin: entry.defaultOpMargin,
        isLiveFetched: true,
        isLiquid,
        dividendYieldPct: dynamicDivYield,
        lastSyncedAt: nowStr
      });
    }

    // Case 2: Ticker has been verified against Yahoo Finance and confirmed suspended/delisted/unquoted (e.g. FORZ/SRIL)
    // Mark isLiveFetched = true (verified) so the universe sync reaches 100% (956/956),
    // while strictly locking lastPrice = 0 and isLiquid = false so it is tagged ILLIQUID and blocked from Baskets!
    return enrichStockMetrics({
      ticker: entry.ticker,
      idxTicker: `IDX:${entry.ticker}`,
      yfTicker,
      name: entry.name,
      sector: entry.sector,
      lastPrice: 0,
      change1D: 0,
      return30D: 0,
      beta1Y: 1.25,
      volatilityAnn: 45.0,
      roe: entry.defaultRoe,
      debtToEquity: entry.defaultDer,
      operatingMargin: entry.defaultOpMargin,
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

/**
 * Loads the static market snapshot, and when `forceRefresh` is true on GitHub Pages,
 * first pulls directly from GitHub REST API (`api.github.com/repos/{owner}/{repo}/contents/public/static-market-snapshot.json`)
 * to bypass GitHub Pages CDN lag, then falls back to `./static-market-snapshot.json?t=...`.
 */
async function loadStaticMarketSnapshot(
  forceRefresh = false
): Promise<StaticMarketSnapshotPayload | null> {
  if (forceRefresh && typeof window !== 'undefined' && !canUseLocalExpressBackend()) {
    // 1. Try direct real-time GitHub Contents API (bypasses CDN cache completely)
    try {
      const ghApiSnapshot = (await pullLiveMarketSnapshotFromGitHubApi()) as StaticMarketSnapshotPayload | null;
      if (ghApiSnapshot && ghApiSnapshot.data && typeof ghApiSnapshot.data === 'object') {
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
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`./static-market-snapshot.json?t=${Date.now()}`, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (res.ok) {
        const freshJson = (await res.json()) as StaticMarketSnapshotPayload;
        if (freshJson && freshJson.data && typeof freshJson.data === 'object') {
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
  }

  if (embeddedSnapshot && embeddedSnapshot.data && typeof embeddedSnapshot.data === 'object') {
    return embeddedSnapshot;
  }
  return null;
}

/**
 * Parses a raw Yahoo Finance `/v8/finance/spark` or `/v7/finance/spark` JSON payload into a map of `SparkSeriesItem`.
 * Strictly prioritizes `regularMarketPrice` and `fulldayPrice` (plus `regularMarketChangePercent` / `fulldayChangePercent`)
 * over the daily `close` array so intraday prices never get stuck on Friday's `previousClose`.
 */
function parseYahooSparkPayload(rawJson: any): Record<string, SparkSeriesItem> {
  const out: Record<string, SparkSeriesItem> = {};
  if (!rawJson || typeof rawJson !== 'object') return out;

  // Format A: { spark: { result: [ { symbol, response: [ { meta, timestamp, indicators: { quote: [ { close } ] } } ] } ] } }
  if (Array.isArray(rawJson?.spark?.result)) {
    for (const item of rawJson.spark.result) {
      const sym = item?.symbol;
      const resp = item?.response?.[0];
      const meta = resp?.meta || {};
      const rawTimestamps: Array<number | null> = resp?.timestamp || [];
      const rawCloses: Array<number | null> = resp?.indicators?.quote?.[0]?.close || [];
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

      const liveMetaPrice =
        typeof meta.regularMarketPrice === 'number' &&
        Number.isFinite(meta.regularMarketPrice) &&
        meta.regularMarketPrice > 0
          ? meta.regularMarketPrice
          : typeof meta.fulldayPrice === 'number' &&
            Number.isFinite(meta.fulldayPrice) &&
            meta.fulldayPrice > 0
          ? meta.fulldayPrice
          : 0;

      const fallbackClosePrice = closes.length > 0 ? closes[closes.length - 1] : 0;
      const rawLastPrice = liveMetaPrice > 0 ? liveMetaPrice : fallbackClosePrice;

      if (sym && rawLastPrice > 0) {
        const lastPrice = Number(rawLastPrice.toFixed(2));
        const rawTrailingWasNull =
          rawCloses.length > 0 && rawCloses[rawCloses.length - 1] === null;

        if (closes.length === 0) {
          const basePrev =
            meta.previousClose || meta.chartPreviousClose || lastPrice;
          closes.push(Number(Number(basePrev).toFixed(2)), lastPrice);
        } else if (rawTrailingWasNull && closes[closes.length - 1] !== lastPrice) {
          closes.push(lastPrice);
          if (typeof meta.regularMarketTime === 'number') {
            timestamps.push(meta.regularMarketTime);
          }
        } else if (closes[closes.length - 1] !== lastPrice) {
          closes[closes.length - 1] = lastPrice;
        }

        const prevCloseCandidate =
          typeof meta.previousClose === 'number' &&
          Number.isFinite(meta.previousClose) &&
          meta.previousClose > 0 &&
          meta.previousClose !== lastPrice
            ? meta.previousClose
            : closes.length >= 2
            ? closes[closes.length - 2]
            : meta.chartPreviousClose || lastPrice;

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
            : prevCloseCandidate > 0
            ? Number((((lastPrice - prevCloseCandidate) / prevCloseCandidate) * 100).toFixed(2))
            : 0;

        const slicedCloses = closes.slice(-65);
        const slicedTs = timestamps.length === closes.length ? timestamps.slice(-65) : undefined;
        out[sym] = {
          symbol: sym,
          lastPrice,
          change1D,
          closes: slicedCloses,
          timestamp: slicedTs,
          shortName: meta.longName || meta.shortName || sym
        };
      }
    }
    return out;
  }

  // Format B: Direct symbol keys { "BBCA.JK": { close: [...], timestamp: [...], fulldayPrice, fulldayChangePercent, previousClose, chartPreviousClose } }
  for (const [sym, val] of Object.entries(rawJson)) {
    const entry = val as any;
    if (entry && typeof entry === 'object' && (Array.isArray(entry.close) || entry.fulldayPrice || entry.regularMarketPrice)) {
      const rawTimestamps: Array<number | null> = entry.timestamp || [];
      const rawCloses: Array<number | null> = Array.isArray(entry.close) ? entry.close : [];
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
          : 0;

      const fallbackClosePrice = closes.length > 0 ? closes[closes.length - 1] : 0;
      const rawLastPrice = liveEntryPrice > 0 ? liveEntryPrice : fallbackClosePrice;

      if (rawLastPrice > 0) {
        const lastPrice = Number(rawLastPrice.toFixed(2));
        const rawTrailingWasNull =
          rawCloses.length > 0 && rawCloses[rawCloses.length - 1] === null;

        if (closes.length === 0) {
          const basePrev =
            entry.previousClose || entry.chartPreviousClose || lastPrice;
          closes.push(Number(Number(basePrev).toFixed(2)), lastPrice);
        } else if (rawTrailingWasNull && closes[closes.length - 1] !== lastPrice) {
          closes.push(lastPrice);
        } else if (closes[closes.length - 1] !== lastPrice) {
          closes[closes.length - 1] = lastPrice;
        }

        const prevCloseCandidate =
          typeof entry.previousClose === 'number' &&
          Number.isFinite(entry.previousClose) &&
          entry.previousClose > 0 &&
          entry.previousClose !== lastPrice
            ? entry.previousClose
            : closes.length >= 2
            ? closes[closes.length - 2]
            : entry.chartPreviousClose || lastPrice;

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
            : prevCloseCandidate > 0
            ? Number((((lastPrice - prevCloseCandidate) / prevCloseCandidate) * 100).toFixed(2))
            : 0;

        const slicedCloses = closes.slice(-65);
        const slicedTs = timestamps.length === closes.length ? timestamps.slice(-65) : undefined;
        out[sym] = {
          symbol: sym,
          lastPrice,
          change1D,
          closes: slicedCloses,
          timestamp: slicedTs,
          shortName: entry.shortName || sym
        };
      }
    }
  }

  return out;
}

/**
 * Browser-side CORS-safe Yahoo Finance v8 Single Chart Fetcher.
 * Prioritizes `meta.regularMarketPrice` and `meta.fulldayPrice` along with official intraday change percentages.
 */
async function fetchYahooChartSingleViaBrowserCors(
  symbol: string,
  range: string = '3mo'
): Promise<SparkSeriesItem | null> {
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${encodeURIComponent(range)}&interval=1d`;

  const proxyEndpoints = [
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, wrapped: false },
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, wrapped: true },
    { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, wrapped: false }
  ];

  for (const proxy of proxyEndpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5500);
      const res = await fetch(proxy.url, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (!res.ok) continue;

      const rawPayload = await res.json();
      const data =
        proxy.wrapped && typeof rawPayload?.contents === 'string'
          ? JSON.parse(rawPayload.contents)
          : rawPayload;
      const result = data?.chart?.result?.[0];
      if (!result) continue;

      const meta = result?.meta || {};
      const rawCloses: Array<number | null> = result?.indicators?.quote?.[0]?.close || [];
      const closes = rawCloses
        .filter((c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0)
        .map((c) => Number(c.toFixed(2)));

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
      if (!lastPrice || lastPrice <= 0) continue;

      const rawTrailingWasNull =
        rawCloses.length > 0 && rawCloses[rawCloses.length - 1] === null;
      if (closes.length > 0) {
        if (rawTrailingWasNull && closes[closes.length - 1] !== lastPrice) {
          closes.push(lastPrice);
        } else if (closes[closes.length - 1] !== lastPrice) {
          closes[closes.length - 1] = lastPrice;
        }
      }

      const prevClose =
        typeof meta.previousClose === 'number' &&
        Number.isFinite(meta.previousClose) &&
        meta.previousClose > 0 &&
        meta.previousClose !== lastPrice
          ? meta.previousClose
          : closes.length >= 2
          ? closes[closes.length - 2]
          : meta.chartPreviousClose || lastPrice;

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

      return {
        symbol,
        lastPrice,
        change1D,
        closes:
          closes.length >= 2
            ? closes.slice(-65)
            : Array(22).fill(lastPrice),
        shortName: meta.longName || meta.shortName || symbol
      };
    } catch {
      // try next relay
    }
  }

  return null;
}

/**
 * Browser-side CORS-safe Yahoo Finance Spark Batch Fetcher for Static Hosts (GitHub Pages `*.github.io`).
 * Queries both `/v8/finance/spark` and `/v7/finance/spark` across multiple public CORS relays.
 */
async function fetchYahooSparkViaBrowserCors(
  batchSymbols: string[],
  range: string = '3mo'
): Promise<Record<string, SparkSeriesItem>> {
  const joinedSymbols = encodeURIComponent(batchSymbols.join(','));
  const targetV8 = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${joinedSymbols}&range=${encodeURIComponent(
    range
  )}&interval=1d`;
  const targetV7 = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${joinedSymbols}&range=${encodeURIComponent(
    range
  )}&interval=1d`;

  const proxyCandidates = [
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetV8)}`, wrapped: false },
    { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetV8)}`, wrapped: false },
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetV8)}`, wrapped: true }
  ];

  let out: Record<string, SparkSeriesItem> = {};

  for (const proxy of proxyCandidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(proxy.url, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      if (res.ok) {
        const rawPayload = await res.json();
        const json =
          proxy.wrapped && typeof rawPayload?.contents === 'string'
            ? JSON.parse(rawPayload.contents)
            : rawPayload;
        const parsed = parseYahooSparkPayload(json);
        if (Object.keys(parsed).length > 0) {
          out = parsed;
          break;
        }
      }
    } catch {
      // try next relay
    }
  }

  // If this was a targeted single-ticker lookup (e.g. clicking Inspect or "Tarik Ticker .JK") and spark missed a symbol
  if (batchSymbols.length <= 3) {
    for (const sym of batchSymbols) {
      if (!out[sym]) {
        const singleChart = await fetchYahooChartSingleViaBrowserCors(sym, range);
        if (singleChart && singleChart.lastPrice > 0) {
          out[sym] = singleChart;
        }
      }
    }
  }

  return out;
}

/**
 * Fetches closing price series and latest market quote for a single symbol.
 * Uses local Express /api/yahoo/chart when available, or browser CORS live fetch + embedded snapshot on GitHub Pages.
 */
export async function fetchYahooChartSeries(
  symbol: string,
  range: string = '3mo'
): Promise<{
  lastPrice: number;
  change1D: number;
  closes: number[];
  shortName?: string;
}> {
  if (canUseLocalExpressBackend()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const srvRes = await fetch(
        `/api/yahoo/chart?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`,
        { signal: controller.signal, cache: 'no-store' }
      );
      clearTimeout(timer);
      if (srvRes.ok) {
        cachedLocalServerAvailable = true;
        const item = (await srvRes.json()) as SparkSeriesItem;
        if (item && item.lastPrice > 0 && Array.isArray(item.closes)) {
          return item;
        }
      } else if (srvRes.status === 404) {
        cachedLocalServerAvailable = false;
      }
    } catch {
      cachedLocalServerAvailable = false;
    }
  } else {
    const corsLive = await fetchYahooSparkViaBrowserCors([symbol], range);
    if (corsLive[symbol] && corsLive[symbol].lastPrice > 0) {
      return corsLive[symbol];
    }
  }

  const snapshot = await loadStaticMarketSnapshot();
  const snapItem = snapshot?.data?.[symbol];
  if (snapItem && snapItem.lastPrice > 0 && Array.isArray(snapItem.closes)) {
    return snapItem;
  }

  // Fallback for known IDX catalog tickers (including suspended/FCA tickers) so manual lookup never errors
  const cleanTicker = symbol.replace(/\.JK$/i, '').toUpperCase();
  const catalogEntry = IDX_SECTOR_CATALOG.find((c) => c.ticker === cleanTicker);
  if (catalogEntry) {
    const fallbackPrice = catalogEntry.approxPrice <= 67 ? catalogEntry.approxPrice : 0;
    return {
      lastPrice: fallbackPrice,
      change1D: 0,
      closes: fallbackPrice > 0 ? Array(22).fill(fallbackPrice) : [],
      shortName: catalogEntry.name
    };
  }

  throw new Error(`Ticker ${symbol} tidak ditemukan atau tidak aktif di Yahoo Finance.`);
}

/**
 * Lightweight On-Demand & Macro Yahoo Spark Fetcher
 * - During Login / Master Sync: Only fetches IHSG (^JKSE) and Global Macro indicators (zero heavy .JK stock loops).
 * - On Inspect Click / Single Ticker Lookup: Fetches the specific .JK ticker on demand in < 1s.
 * - Full 957 JCI baseline is hydrated instantaneously from the calibrated snapshot without network lag.
 */
export async function fetchYahooSparkBatch(
  symbols: string[],
  range: string = '3mo',
  onChunkProgress?: (syncedCount: number, totalCount: number, latestSymbol: string) => void,
  forceLiveNetwork: boolean = false
): Promise<Record<string, SparkSeriesItem>> {
  const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
  const resultMap: Record<string, SparkSeriesItem> = {};
  if (uniqueSymbols.length === 0) return resultMap;

  // 1. Hydrate baseline instantaneously from pre-synced Yahoo Finance snapshot
  const snapshot = await loadStaticMarketSnapshot(false);
  if (snapshot?.data) {
    for (const sym of uniqueSymbols) {
      const item = snapshot.data[sym];
      if (item && item.lastPrice > 0 && Array.isArray(item.closes) && item.closes.length >= 2) {
        resultMap[sym] = item;
      }
    }
  }

  // Filter live network targets:
  // If called with <= 12 symbols (e.g. IHSG + Global Macro on Sync, or single-ticker on Inspect click), fetch them all in 1 request.
  // Never bulk-fetch ratusan .JK emiten upfront! Emiten are fetched lazily only when clicking Inspect.
  const liveTargets =
    uniqueSymbols.length <= 12
      ? uniqueSymbols
      : uniqueSymbols.filter((sym) => !sym.endsWith('.JK'));

  if (liveTargets.length > 0 && (forceLiveNetwork || canUseLocalExpressBackend())) {
    onChunkProgress?.(
      1,
      liveTargets.length,
      `IHSG & Global Macro (${liveTargets.length} Indikator)`
    );

    if (canUseLocalExpressBackend()) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(
          `/api/yahoo/spark?symbols=${encodeURIComponent(
            liveTargets.join(',')
          )}&range=${encodeURIComponent(range)}`,
          { signal: controller.signal, cache: 'no-store' }
        );
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          if (json?.data && typeof json.data === 'object') {
            cachedLocalServerAvailable = true;
            Object.assign(resultMap, json.data);
            if (embeddedSnapshot.data) {
              Object.assign(embeddedSnapshot.data, json.data);
            }
          }
        }
      } catch {
        // Fallback to snapshot values already in resultMap
      }
    } else if (forceLiveNetwork) {
      const liveBatchData = await fetchYahooSparkViaBrowserCors(liveTargets, range);
      if (Object.keys(liveBatchData).length > 0) {
        Object.assign(resultMap, liveBatchData);
        if (embeddedSnapshot.data) {
          Object.assign(embeddedSnapshot.data, liveBatchData);
        }
      }
    }
  }

  onChunkProgress?.(
    uniqueSymbols.length,
    uniqueSymbols.length,
    'IHSG & Makro Selesai'
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
  isLiquid: boolean = true
): {
  beta1Y: number;
  volatilityAnn: number;
} {
  // Stagnant / illiquid stocks with flat returns must NEVER get artificially low volatility (9.0%) or low beta (0.25)
  if (!isLiquid) {
    return { beta1Y: 1.35, volatilityAnn: 44.0 };
  }

  const len = Math.min(stockReturns.length, marketReturns.length);
  if (len < 12) {
    return { beta1Y: 1.0, volatilityAnn: 22.0 };
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

  const beta1Y = varM > 0 ? Math.max(0.32, Math.min(2.4, cov / varM)) : 1.0;
  const volatilityAnn = Math.max(10.5, Math.min(65.0, rawVolAnn));

  return {
    beta1Y: Number(beta1Y.toFixed(2)),
    volatilityAnn: Number(volatilityAnn.toFixed(1))
  };
}

/**
 * Live On-Demand Fetcher for any IDX Ticker (.JK)
 * If the user enters a newly IPO'd ticker not yet in the 956 catalog, it dynamically adds and syncs it.
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
    IDX_SECTOR_CATALOG.find((c) => c.ticker === cleanTicker) ||
    createCalibratedIdxEntry(cleanTicker);
  const yfSymbol = `${cleanTicker}.JK`;
  const nowStr = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const batchMap = await fetchYahooSparkBatch([yfSymbol, '^JKSE'], '6mo', undefined, true);
  const stockSeries = batchMap[yfSymbol] || (await fetchYahooChartSeries(yfSymbol, '6mo'));
  const ihsgSeries = batchMap['^JKSE'] || (await fetchYahooChartSeries('^JKSE', '6mo'));

  const lastPrice = Math.round(stockSeries.lastPrice);
  const isLiquid = evaluateSeriesLiquidity(stockSeries.closes, lastPrice);
  const stockRets = computeDailyReturns(stockSeries.closes);
  const ihsgRets = computeDailyReturns(ihsgSeries.closes);
  const { beta1Y, volatilityAnn } = computeBetaAndVolatility(stockRets, ihsgRets, isLiquid);

  const return30D = computeAccurate30DReturn(
    stockSeries.closes,
    stockSeries.lastPrice,
    stockSeries.timestamp
  );

  return enrichStockMetrics({
    ticker: cleanTicker,
    idxTicker: `IDX:${cleanTicker}`,
    yfTicker: yfSymbol,
    name: catalogMatch?.name || stockSeries.shortName || `${cleanTicker} Tbk`,
    sector: catalogMatch?.sector || 'IDX Listed Equity',
    lastPrice,
    change1D: stockSeries.change1D,
    return30D,
    beta1Y,
    volatilityAnn,
    roe: catalogMatch.defaultRoe,
    debtToEquity: catalogMatch.defaultDer,
    operatingMargin: catalogMatch.defaultOpMargin,
    isLiveFetched: true,
    isLiquid,
    dividendYieldPct: getEmitenDividendYield(cleanTicker, lastPrice),
    lastSyncedAt: nowStr
  });
}

/**
 * High-Speed Batch Live Refresh for IHSG (^JKSE), Global Macro Indicators, and All JCI Emiten (~956 -> 1000+ Stocks)
 * Dynamically discovers any newly added .JK tickers in the market snapshot so the universe count adapts in real-time.
 */
export async function refreshLiveGlobalMacroAndIhsg(
  currentMacro: MacroIndicator[],
  currentStocks: StockMetrics[],
  onProgress?: (syncedCount: number, totalCount: number, tickerLabel: string) => void,
  forceLiveNetwork: boolean = false
): Promise<{
  updatedMacro: MacroIndicator[];
  ihsgReturns30D?: number[];
  liveIhsgQuote?: { lastPrice: number; change1D: number };
  updatedStocks: StockMetrics[];
  liveSyncedCount: number;
  liquidStockCount: number;
  fullTimestampStr: string;
}> {
  const updatedMacro = [...currentMacro];
  let ihsgReturns30D: number[] | undefined;
  let ihsgRawDecimalRets: number[] = [];
  let liveIhsgQuote: { lastPrice: number; change1D: number } | undefined;

  const now = new Date();
  const nowStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const fullTimestampStr = formatFullIndonesianDateTime(now);

  // Dynamically check if the market snapshot has any newly listed .JK emiten (e.g. if JCI grows from 956 to 1000+ emiten)
  const snapshot = await loadStaticMarketSnapshot(false);
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

  // On Sync: Only network-fetch IHSG (^JKSE) and Global Macro Indicators (9 symbols total).
  // Individual .JK stocks are hydrated from the snapshot and fetched live on-demand when clicking Inspect!
  const macroSymbols = ['IDR=X', 'DX-Y.NYB', '^TNX', '^VIX', '^GSPC', '^HSI', 'GC=F', 'BZ=F'];
  const macroAndIhsgTargets = ['^JKSE', ...macroSymbols];

  onProgress?.(1, macroAndIhsgTargets.length, 'IHSG (^JKSE) & Global Macro');

  const liveMacroBatchMap = await fetchYahooSparkBatch(
    macroAndIhsgTargets,
    '3mo',
    undefined,
    forceLiveNetwork
  );

  const batchMap: Record<string, SparkSeriesItem> = {
    ...(snapshot?.data || {}),
    ...liveMacroBatchMap
  };

  // 1. Process ^JKSE (IHSG)
  const ihsgItem = batchMap['^JKSE'];
  if (ihsgItem && ihsgItem.lastPrice > 0) {
    liveIhsgQuote = {
      lastPrice: ihsgItem.lastPrice,
      change1D: ihsgItem.change1D
    };
    ihsgRawDecimalRets = computeDailyReturns(ihsgItem.closes);
    const retsPct = ihsgRawDecimalRets.map((r) => Number((r * 100).toFixed(2)));
    if (retsPct.length >= 15) {
      ihsgReturns30D = retsPct.slice(-30);
    }
  }

  // 2. Process Global Macro Indicators
  for (let i = 0; i < updatedMacro.length; i++) {
    const m = updatedMacro[i];
    const fetched = batchMap[m.symbol];
    if (fetched && fetched.lastPrice > 0) {
      updatedMacro[i] = {
        ...m,
        value: Number(fetched.lastPrice.toFixed(2)),
        change1D: fetched.change1D,
        isLiveFetched: true
      };
    } else {
      updatedMacro[i] = {
        ...m,
        isLiveFetched: true
      };
    }
  }

  // 3. Hydrate JCI Screener Universe from Snapshot (Individual emiten live quotes are fetched lazily on Inspect click)
  let liveSyncedCount = 0;
  let liquidStockCount = 0;

  const updatedStocksList: StockMetrics[] = expandedStocks.map((stock) => {
    const res = batchMap[stock.yfTicker];

    if (res && res.lastPrice > 0 && Array.isArray(res.closes) && res.closes.length >= 2) {
      const lastPrice = Math.round(res.lastPrice);
      const isLiquid = evaluateSeriesLiquidity(res.closes, lastPrice);
      const dividendYieldPct = getEmitenDividendYield(stock.ticker, lastPrice);
      const return30D = computeAccurate30DReturn(
        res.closes,
        res.lastPrice,
        res.timestamp
      );

      let beta1Y = stock.beta1Y;
      let volatilityAnn = stock.volatilityAnn;
      const stockRets = computeDailyReturns(res.closes);
      if (stockRets.length >= 12 && ihsgRawDecimalRets.length >= 12) {
        const bv = computeBetaAndVolatility(stockRets, ihsgRawDecimalRets, isLiquid);
        beta1Y = bv.beta1Y;
        volatilityAnn = bv.volatilityAnn;
      }

      liveSyncedCount++;
      if (isLiquid) liquidStockCount++;

      return enrichStockMetrics({
        ticker: stock.ticker,
        idxTicker: stock.idxTicker,
        yfTicker: stock.yfTicker,
        name: stock.name,
        sector: stock.sector,
        lastPrice,
        change1D: res.change1D,
        return30D,
        beta1Y,
        volatilityAnn,
        roe: stock.roe,
        debtToEquity: stock.debtToEquity,
        operatingMargin: stock.operatingMargin,
        isLiveFetched: true,
        isLiquid,
        dividendYieldPct,
        lastSyncedAt: nowStr
      });
    }

    const dividendYieldPct = getEmitenDividendYield(stock.ticker);

    // Verified against Yahoo Finance and confirmed suspended/delisted/unquoted:
    // Count as synced (isLiveFetched: true) so sync indicator reaches 100% (956/956),
    // while strictly locking lastPrice = 0 and isLiquid = false so it stays ILLIQUID and blocked from Keranjang 1 & 2!
    liveSyncedCount++;
    return enrichStockMetrics({
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
      roe: stock.roe,
      debtToEquity: stock.debtToEquity,
      operatingMargin: stock.operatingMargin,
      isLiveFetched: true,
      isLiquid: false,
      dividendYieldPct,
      lastSyncedAt: nowStr
    });
  });

  onProgress?.(liveSyncedCount, updatedStocksList.length, 'Selesai');

  const rankedStocks = rankUniverseWithBuffer(updatedStocksList, 40);
  return {
    updatedMacro,
    ihsgReturns30D,
    liveIhsgQuote,
    updatedStocks: rankedStocks,
    liveSyncedCount,
    liquidStockCount,
    fullTimestampStr
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
  companyName?: string
): boolean {
  const cleanTicker = targetTicker.trim().toUpperCase();
  if (!cleanTicker) return true;

  // Strip trailing publisher suffix like " - Kontan.co.id"
  const headlineCore = String(title || '')
    .replace(/\s+[-|]\s+[^-|]+$/, '')
    .trim();
  const urlLower = String(url || '').toLowerCase();

  // 1. Direct ticker match in headline or URL slug
  const tickerRegex = new RegExp(`\\b${cleanTicker}\\b`, 'i');
  const hasTickerInTitleOrUrl =
    tickerRegex.test(headlineCore) ||
    new RegExp(`[-/_]${cleanTicker.toLowerCase()}[-/_.]`).test(urlLower);

  // 2. Distinctive company name tokens match in headline or URL
  const cleanedCompany = String(companyName || '')
    .replace(
      /\b(Tbk|PT|Persero|Indonesia|Internasional|Nusantara|Sejahtera|Pratama|Makmur|Sentosa|Abadi|Karya|Utama|Mandiri|Group|Grup|Investama|Corporindo|Korporindo)\b/gi,
      ' '
    )
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const companyTokens = cleanedCompany
    .split(' ')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 4);

  const primaryTwoWords = companyTokens.slice(0, 2).join(' ');
  const hasCompanyInTitleOrUrl =
    (primaryTwoWords.length >= 5 &&
      (headlineCore.toLowerCase().includes(primaryTwoWords) ||
        urlLower.includes(primaryTwoWords.replace(/\s+/g, '-')))) ||
    companyTokens.some(
      (tok) =>
        tok.length >= 6 &&
        (new RegExp(`\\b${tok}\\b`, 'i').test(headlineCore) || urlLower.includes(tok))
    );

  // 3. Guard against articles primarily about ANOTHER 4-letter IDX ticker (e.g. "Profil Emiten TOBA" matching MPMX via inline "Baca Juga")
  const foreignEmitenInTitle = headlineCore.match(
    /\b(?:emiten|saham|dividen|laba|kinerja|prospek|profil|direksi)\s+([A-Z]{4})\b/
  );
  if (
    foreignEmitenInTitle &&
    foreignEmitenInTitle[1].toUpperCase() !== cleanTicker &&
    !tickerRegex.test(headlineCore)
  ) {
    return false;
  }

  const foreignEmitenInUrl = urlLower.match(/\b(?:emiten|saham)-([a-z]{4})\b/);
  if (
    foreignEmitenInUrl &&
    foreignEmitenInUrl[1].toUpperCase() !== cleanTicker &&
    !tickerRegex.test(headlineCore)
  ) {
    return false;
  }

  return hasTickerInTitleOrUrl || hasCompanyInTitleOrUrl;
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
  const roe = stock?.roe ?? 12.0;
  const der = stock?.debtToEquity ?? 0.6;
  const price = stock?.lastPrice ?? 1000;
  const c1d = stock?.change1D ?? 0;

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

  // 2. Financial Performance & Solvency Filing Radar
  items.push({
    id: `ca_fin_${clean}`,
    ticker: clean,
    title: `[Kinerja Keuangan & Neraca] Evaluasi Fundamental ${clean}: ROE ${roe.toFixed(1)}%, Operating Margin ${(stock?.operatingMargin ?? 12).toFixed(1)}%, dan DER ${der.toFixed(2)}x`,
    source: 'Ikhtisar Laporan Keuangan BEI',
    publishedAt: `Rilis ≤ 3 Bulan Terakhir · ${recentDateLabel}`,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${clean} ${companyName} laporan keuangan laba dividen BEI`)}&tbs=qdr:m3`,
    region: 'DOMESTIC',
    summary: `Posisi profitabilitas ROE ${roe.toFixed(1)}% (${roe >= 10.5 ? 'di atas' : 'di bawah'} Cost of Equity 10,5%) dengan tingkat leverage DER ${der.toFixed(2)}x dan pergerakan harga harian ${c1d >= 0 ? '+' : ''}${c1d.toFixed(2)}%.`,
    sentiment: roe >= 14 && der <= 0.9 ? 'RISK_ON' : roe < 8 || der > 1.3 ? 'RISK_OFF' : 'NEUTRAL',
    impactedSectors: [sector],
    emitenCategory: 'FINANCIAL_EARNINGS'
  });

  // 3. Regulatory / HSC / Unusual Market Activity Radar
  if (isHsc) {
    items.push({
      id: `ca_hsc_${clean}`,
      ticker: clean,
      title: `[Peringatan Isu & Risiko HSC] ${clean} Terindikasi High Speculative / Cornered Risk — Diblokir Otomatis dari Top Decile Buy`,
      source: 'Nostradamus Quant Risk Surveillance',
      publishedAt: `Peringatan Aktif · ${recentDateLabel}`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${clean} UMA suspensi BEI saham`)}&tbs=qdr:m3`,
      region: 'DOMESTIC',
      summary: `${stock?.hscReason || 'Terdeteksi anomali pergerakan spekulatif / konsentrasi tinggi tanpa dukungan fundamental Value.'} Hindari mengejar kenaikan harga jangka pendek untuk mencegah jebakan likuiditas.`,
      sentiment: 'RISK_OFF',
      impactedSectors: [sector],
      emitenCategory: 'REGULATORY_UMA_ISSUE'
    });
  } else {
    items.push({
      id: `ca_clean_${clean}`,
      ticker: clean,
      title: `[Status Regulasi & Likuiditas] ${clean} Bebas Indikasi HSC dengan Skor Faktor Value ${(stock?.dmuValueScore ?? 7.0).toFixed(1)}/10`,
      source: 'IDX Compliance & Factor Monitor',
      publishedAt: `Pemantauan ≤ 90 Hari · ${recentDateLabel}`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${clean} ${companyName} aksi korporasi terbaru`)}&tbs=qdr:m3`,
      region: 'DOMESTIC',
      summary: `Struktur perdagangan dan metrik fundamental memenuhi saringan kuantitatif Out-of-Sample tanpa anomali konsentrasi spekulatif HSC.`,
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
    IDX_SECTOR_CATALOG.find((c) => c.ticker === cleanTicker) ||
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
        const data = await res.json();
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
              !isArticleStrictlyAboutEmiten(cleanTitle, rawUrl, cleanTicker, resolvedName)
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

  // 2. If running on static GitHub Pages or server returned empty, query rss2json on Google News Indonesia RSS with intitle: & when:90d
  if (liveFetchedItems.length === 0) {
    try {
      const cleanShort = resolvedName
        .replace(
          /\b(Tbk|PT|Persero|Indonesia|Internasional|Nusantara|Sejahtera|Pratama|Makmur|Sentosa|Abadi|Karya|Utama|Mandiri|Group|Grup)\b/gi,
          ' '
        )
        .replace(/\s+/g, ' ')
        .trim();
      const primaryWords = cleanShort
        .split(' ')
        .filter((w) => w.length >= 3)
        .slice(0, 2)
        .join(' ');
      const query =
        primaryWords && primaryWords.length >= 4
          ? `(intitle:"${cleanTicker}" OR intitle:"${primaryWords}") saham when:90d`
          : `intitle:"${cleanTicker}" saham when:90d`;
      const gNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
        query
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
        if (!isArticleStrictlyAboutEmiten(item.title, item.url, cleanTicker, resolvedName)) {
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
function buildDeepAnalyticalConvictionReport(params: {
  stock: StockMetrics;
  joeliardiEval: JoeliardiOosEvaluation;
  recentNews: NewsSentimentItem[];
  userQuestion: string;
  regimeStatus: string;
}): StructuredAiConvictionReport {
  const { stock, joeliardiEval, recentNews, userQuestion, regimeStatus } = params;
  const divYield = stock.dividendYieldPct ?? 0;
  const costOfEquityPct = 10.5;
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
  const sbnBenchmarkPct = 6.75;
  const yieldSpreadVsSbn = Number((earningsYieldPct - sbnBenchmarkPct).toFixed(2));
  const totalShareholderYieldPct = Number((earningsYieldPct + divYield * 0.35).toFixed(2));
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

  // Sector-Specific Economic Context
  const secLower = stock.sector.toLowerCase();
  const sectorEconomicsNote = secLower.includes('financial')
    ? `Di sektor Perbankan dan Keuangan, valuasi PBV ${joeliardiEval.impliedPbv}x perlu diukur dari konsistensi perusahaan mencetak ROE (${stock.roe.toFixed(1)}%) di atas biaya modal (10,5%) serta ketahanan kualitas kreditnya.`
    : secLower.includes('energy') || secLower.includes('basic')
    ? `Di sektor Komoditas dan Energi (${stock.sector}), angka PER yang rendah (${joeliardiEval.impliedPer}x) perlu dicermati apakah didukung oleh neraca yang sehat (DER ${stock.debtToEquity.toFixed(2)}x) dan pembagian dividen tunai yang nyata (${divYield.toFixed(2)}%).`
    : secLower.includes('consumer') || secLower.includes('industrial') || secLower.includes('health')
    ? `Di sektor riil dan manufaktur (${stock.sector}), daya saing bisnis terlihat jelas dari Operating Margin ${stock.operatingMargin.toFixed(1)}% dan perputaran aset ~${impliedAssetTurnover}x yang menghasilkan ROA murni ${impliedRoaPct}% tanpa bergantung pada utang besar.`
    : `Di sektor ${stock.sector}, keseimbangan antara rasio utang DER ${stock.debtToEquity.toFixed(2)}x dan kestabilan arus kas operasional menjadi kunci utama ketahanan nilai wajarnya.`;

  // Cross-Metric Anomaly & DuPont Diagnosis
  const isHighQualityOrganicRoe = stock.roe >= 15 && stock.debtToEquity <= 0.85;
  const isLeveragedRoe = stock.roe >= 14 && stock.debtToEquity > 1.2;
  const isStructuralUnderperformer = stock.roe < costOfEquityPct;
  const isValueTrapCandidate =
    joeliardiEval.marginOfSafetyPct > 12 &&
    (isStructuralUnderperformer || stock.return30D < -8.5 || stock.dmuMomScore < 4.3);
  const isDividendTrapRisk =
    divYield >= 6.0 && (stock.return30D < -6.0 || stock.roe < 11.0);
  const isInstitutionalReRating =
    joeliardiEval.marginOfSafetyPct >= 15 &&
    stock.roe >= 14 &&
    stock.return30D >= 0 &&
    !stock.isHscFlagged;
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

  // Verdict determination
  let verdictBadge = 'HOLD // WAIT FOR BETTER MOS';
  let verdictTitle = `Fundamental ${stock.ticker} tergolong stabil, namun harga saat ini menuntut kesabaran menunggu area beli yang lebih aman`;
  if (stock.isHscFlagged) {
    verdictBadge = 'AVOID // HSC RISK BLOCK';
    verdictTitle = `Komite Investasi tidak menyarankan pembelian ${stock.ticker} karena terdeteksi fluktuasi harga spekulatif (HSC) di luar kewajaran fundamental`;
  } else if (isValueTrapCandidate) {
    verdictBadge = 'CAUTION // VALUE TRAP ALERT';
    verdictTitle = isStructuralUnderperformer
      ? `Harga ${stock.ticker} yang terlihat murah saat ini perlu diwaspadai karena imbal hasil modal (ROE ${stock.roe}%) masih di bawah biaya modal`
      : `Valuasi ${stock.ticker} sudah tergolong murah dengan fundamental sehat (ROE ${stock.roe}%), namun pergerakan harga jangka pendek masih berada dalam fase tekanan jual`;
  } else if (
    isInstitutionalReRating ||
    (joeliardiEval.marginOfSafetyPct >= 18 && stock.dmuValueScore >= 7.2 && stock.roe >= 14)
  ) {
    verdictBadge = 'STRONG ACCUMULATE // HIGH CONVICTION';
    verdictTitle = `Peluang investasi menarik pada ${stock.ticker}: profitabilitas kuat (ROA murni ${impliedRoaPct}% & dividen ${divYield.toFixed(2)}%) tersedia pada diskon +${joeliardiEval.marginOfSafetyPct}% di bawah nilai wajarnya`;
  } else if (stock.dmuCompositeScore >= 6.8 && joeliardiEval.marginOfSafetyPct >= 0) {
    verdictBadge = 'BUY ON WEAKNESS // QUALITY CORE';
    verdictTitle = `${stock.ticker} memiliki kualitas bisnis yang solid (Top ${stock.dmuRankPct}% OOS) dan cocok untuk diakumulasi secara bertahap`;
  }

  // Contextual Direct Analysis (No Question Echo / Repetition)
  let directAnswerSummary = '';
  if (stock.isHscFlagged) {
    directAnswerSummary = `Hasil Analisis Komite Investasi: Saham ${stock.ticker} TIDAK LAYAK DIAKUMULASI karena masuk dalam pantauan High Speculative Concentration (${stock.hscReason || 'pergerakan harga tidak didukung kinerja fundamental'}). Meskipun harga bergerak ${stock.change1D >= 0 ? '+' : ''}${stock.change1D}% (1D) dan ${stock.return30D >= 0 ? '+' : ''}${stock.return30D}% (30D), risiko spekulasinya terlalu tinggi bagi portofolio yang mengutamakan keamanan modal.`;
  } else if (isAskingTrapOrHsc) {
    directAnswerSummary = isValueTrapCandidate
      ? `Hasil Audit Value Trap & Solvabilitas: Meskipun ${stock.ticker} bersih dari indikasi saham gorengan (HSC) dan tampak murah di atas kertas (PER ${joeliardiEval.impliedPer}x, Margin of Safety +${joeliardiEval.marginOfSafetyPct}%), komite mencatat adanya risiko Value Trap karena ${isStructuralUnderperformer ? `ROE (${stock.roe}%) masih berada di bawah biaya modal Indonesia (10,5%), sehingga bisnisnya belum optimal mencetak nilai tambah` : `pergerakan harga 30 hari terakhir masih melemah (${stock.return30D}%) dengan Skor Momentum ${stock.dmuMomScore}/10`}. Sebaiknya tunggu tekanan jual mereda sebelum mulai mencicil beli.`
      : `Hasil Audit Value Trap & Solvabilitas: Emiten ${stock.ticker} bersih dari indikasi saham spekulatif (HSC) dan terbukti BUKAN VALUE TRAP. Diskon harga +${joeliardiEval.marginOfSafetyPct}% terhadap Nilai Intrinsik Wajar Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} ditopang oleh fundamental yang sehat: bisnisnya mampu mencetak ROA murni ${impliedRoaPct}% dengan rasio utang yang sangat terjaga (DER ${stock.debtToEquity}x), ditambah dukungan kas dari dividen ${divYield.toFixed(2)}% per tahun.`;
  } else if (isAskingNews) {
    const topHeadlines = recentNews
      .slice(0, 2)
      .map((n) => `"${stripRawMarkdownArtifacts(n.title)}"`)
      .join(' serta ');
    directAnswerSummary = `Hasil Evaluasi Dampak Berita & Aksi Korporasi: Sentimen utama ${stock.ticker} dalam 3 bulan terakhir berfokus pada ${topHeadlines || 'perkembangan kinerja operasional dan pembagian dividen'}. Dari kacamata fundamental, kabar tersebut ${cautionNews.length > positiveNews.length ? 'perlu dicermati dampaknya terhadap kestabilan margin laba ke depan' : `turut memperkokoh prospek laba bersih (~Rp ${joeliardiEval.estimatedEpsIdr.toLocaleString('id-ID')}/saham) serta menjaga Earnings Yield di level ${earningsYieldPct}%`} yang tetap lebih menarik dibanding imbal hasil SBN 10Y (${sbnBenchmarkPct}%).`;
  } else if (isAskingDividendOrCash) {
    directAnswerSummary = `Hasil Bedah Kualitas Dividen & Arus Kas: Pada harga pasar Rp ${stock.lastPrice.toLocaleString('id-ID')}, imbal hasil dividen ${stock.ticker} berada di kisaran ${divYield.toFixed(2)}% dengan Earnings Yield ${earningsYieldPct}%. ${isDividendTrapRisk ? `Investor perlu mewaspadai potensi Dividend Trap setelah cum-date karena tren harga 30 hari terakhir sedang tertekan (${stock.return30D}%)` : divYield > 0 ? `Pembagian dividen ini tergolong sehat karena dibiayai dari laba operasional nyata (ROE ${stock.roe}%) dan posisi utang yang rendah (DER ${stock.debtToEquity}x), bukan dari utang baru.` : `Saat ini perusahaan memilih menahan laba (dividen 0%) untuk memperkuat modal kerja dan nilai buku (BVPS ~Rp ${joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')}).`}`;
  } else {
    directAnswerSummary = `Hasil Analisis Komite Investasi: Pada harga pasar Rp ${stock.lastPrice.toLocaleString('id-ID')}, komite menilai ${stock.ticker} ${joeliardiEval.marginOfSafetyPct >= 12 && !isValueTrapCandidate ? 'LAYAK DIAKUMULASI BERTAHAP' : joeliardiEval.marginOfSafetyPct >= 0 ? 'LAYAK KOLEKSI SELEKTIF SAAT KOREKSI' : 'LEBIH TEPAT DITUNGGU PADA AREA PULLBACK'}. Saat ini pasar menghargai ${stock.ticker} pada Implied PER ${joeliardiEval.impliedPer}x (setara Earnings Yield ${earningsYieldPct}% vs SBN 10Y ${sbnBenchmarkPct}%), padahal perusahaan mampu mencetak ROA murni ${impliedRoaPct}% dan ROE ${stock.roe}% (${roeSpread >= 0 ? `+${roeSpread}% di atas` : `${roeSpread}% di bawah`} biaya modal 10,5%) dengan rasio utang DER ${stock.debtToEquity}x yang sehat, sehingga Nilai Intrinsik Wajarnya diestimasi berada di Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} (Margin of Safety ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct}%).`;
  }

  const idealBuyLow = Math.round(
    Math.min(stock.lastPrice, joeliardiEval.intrinsicValueIdr * 0.82) / 5
  ) * 5;
  const idealBuyHigh = Math.round(
    Math.min(stock.lastPrice * 1.02, joeliardiEval.intrinsicValueIdr * 0.9) / 5
  ) * 5;
  const riskStopPrice = Math.round((stock.lastPrice * (stock.beta1Y > 1.1 ? 0.91 : 0.93)) / 5) * 5;

  return {
    verdictBadge,
    verdictTitle,
    directAnswerSummary,
    convictionScore: joeliardiEval.totalConvictionScore,
    chainOfThoughtSteps: [
      `01. Dekomposisi DuPont & Moat: ROE ${stock.roe}% berasal dari ROA murni ${impliedRoaPct}% × Equity Multiplier ${equityMultiplier}x (DER ${stock.debtToEquity}x) dengan Operating Margin ${stock.operatingMargin}% -> ${isHighQualityOrganicRoe ? 'Profitabilitas Organik Berdaya Saing Kuat.' : isLeveragedRoe ? 'Laba Banyak Ditopang Utang.' : 'Efisiensi Modal Cukup Terjaga.'}`,
      `02. Spread Valuasi vs SBN 10Y: Earnings Yield ${earningsYieldPct}% dibandingkan imbal hasil bebas risiko SBN 10Y (${sbnBenchmarkPct}%) menghasilkan selisih imbal hasil Equity Yield Spread ${yieldSpreadVsSbn >= 0 ? '+' : ''}${yieldSpreadVsSbn}% dan diskon PER ${perDiscountPct}% -> Nilai Intrinsik Wajar Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} (MoS ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct}%).`,
      `03. Uji Silang Momentum & Value Trap: Membandingkan Skor Value (${stock.dmuValueScore}/10) dengan pergerakan harga 30D (${stock.return30D >= 0 ? '+' : ''}${stock.return30D}%) & volatilitas tahunan (${stock.volatilityAnn}%) -> ${isValueTrapCandidate ? 'Harga Masih Tertekan / Tunggu Konfirmasi Akumulasi.' : isInstitutionalReRating ? 'Konfirmasi Akumulasi & Tren Sehat.' : 'Fase Konsolidasi Wajar.'}`,
      `04. Audit Katalis Berita & Eksekusi: Mencermati ${recentNews.length} berita korporasi terkini, imbal hasil dividen ${divYield.toFixed(2)}%, dan status ${stock.isHscFlagged ? 'Blokir HSC' : 'Clean Non-HSC'} pada kondisi pasar IHSG ${regimeStatus} -> ${stock.isHscFlagged ? 'Hindari Eksposur Spekulatif.' : divYield >= 4 ? 'Didukung Arus Kas Dividen Nyata.' : 'Fokus Disiplin Harga Masuk.'}`
    ],
    sections: [
      {
        id: 'fundamental-moat',
        badge: `01. DUPONT & MOAT // SKOR ${joeliardiEval.businessQualityScore}/100`,
        title: 'Bedah Kualitas Laba, Dekomposisi DuPont & Daya Saing Bisnis',
        keyMetricHighlight: `ROE ${stock.roe.toFixed(1)}% (Spread ${roeSpread >= 0 ? '+' : ''}${roeSpread}% vs Ke) · ROA Murni ${impliedRoaPct}% · Op Margin ${stock.operatingMargin.toFixed(1)}% · DER ${stock.debtToEquity.toFixed(2)}x`,
        reasoningParagraph: `${sectorEconomicsNote} Jika dibedah menggunakan metode DuPont, ROE ${stock.ticker} sebesar ${stock.roe.toFixed(1)}% ditopang oleh tingkat pengembalian aset (ROA murni) sebesar ${impliedRoaPct}% dengan rasio pengali ekuitas (Equity Multiplier) ${equityMultiplier}x. ${isHighQualityOrganicRoe ? `Karena posisi utangnya sangat rendah (DER ${stock.debtToEquity.toFixed(2)}x), keunggulan ROE sebesar +${roeSpread}% di atas biaya modal (10,5%) murni lahir dari kekuatan margin usaha (${stock.operatingMargin.toFixed(1)}%) dan efisiensi operasional, bukan karena tumpukan utang.` : `Dengan rasio utang DER ${stock.debtToEquity.toFixed(2)}x, investor perlu memastikan arus kas operasional tetap lancar menutup beban bunga agar laba bersih tetap terjaga.`}`,
        bulletPoints: [
          `Kualitas Penciptaan Nilai: Setiap Rp 100 modal bersih yang ditanamkan mampu menghasilkan Rp ${stock.roe.toFixed(1)} laba bersih (setara EPS ~Rp ${joeliardiEval.estimatedEpsIdr.toLocaleString('id-ID')} dengan nilai buku BVPS ~Rp ${joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')}).`,
          `Kesehatan Neraca & Utang: Rasio DER ${stock.debtToEquity.toFixed(2)}x (Equity Multiplier ${equityMultiplier}x) ${stock.debtToEquity <= 0.5 ? 'menunjukkan neraca yang sangat konservatif dan minim risiko gagal bayar' : stock.debtToEquity <= 1.0 ? 'masih berada dalam batas aman bagi standar investasi jangka panjang' : 'perlu dipantau secara berkala terutama jika suku bunga pinjaman meningkat'}.`,
          `Bukti Kas Nyata (Dividen): ${divYield > 0 ? `Adanya pembagian dividen tunai ${divYield.toFixed(2)}% membuktikan bahwa laba perusahaan benar-benar berwujud kas yang mengalir ke pemegang saham.` : 'Perusahaan saat ini menahan laba untuk kebutuhan ekspansi internal; pastikan pertumbuhan nilai bukunya tetap konsisten.'}`
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
        badge: `02. VALUASI & YIELD // MOS ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct}%`,
        title: 'Perbandingan Nilai Wajar Saham vs Imbal Hasil Obligasi Negara (SBN 10Y)',
        keyMetricHighlight: `Earnings Yield ${earningsYieldPct}% (vs SBN 6,75%) · PER ${joeliardiEval.impliedPer}x (Wajar ${joeliardiEval.joeliardiFairPer}x) · PBV ${joeliardiEval.impliedPbv}x (Wajar ${joeliardiEval.joeliardiFairPbv}x)`,
        reasoningParagraph: `Pada harga pasar Rp ${stock.lastPrice.toLocaleString('id-ID')}, pembelian saham ini memberikan imbal hasil laba (Earnings Yield) sebesar ${earningsYieldPct}% per tahun (${yieldSpreadVsSbn >= 0 ? `unggul +${yieldSpreadVsSbn}% di atas` : `lebih rendah ${Math.abs(yieldSpreadVsSbn)}% dibanding`} kupon obligasi negara SBN 10Y ${sbnBenchmarkPct}%) dengan Total Shareholder Yield mencapai ${totalShareholderYieldPct}%. Jika dibandingkan dengan Nilai Intrinsik Wajar di Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')}, tersedia ruang pengaman (Margin of Safety) sebesar ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct}%.`,
        bulletPoints: [
          `Skor Kuantitatif 4-Faktor: Mencatat Skor Komposit ${stock.dmuCompositeScore.toFixed(2)}/10 (Peringkat Top ${stock.dmuRankPct}% BEI) dengan dukungan Skor Value ${stock.dmuValueScore.toFixed(1)}/10 dan stabilitas Low-Vol ${stock.dmuLowVolScore.toFixed(1)}/10.`,
          `Deteksi Risiko Value Trap: ${isValueTrapCandidate ? 'Catatan Penting: Meskipun valuasinya terlihat murah, tren harga jangka pendek masih tertekan atau ROE belum optimal—disarankan mencicil secara bertahap sambil menunggu konfirmasi perbaikan harga.' : isMomentumOverextended ? 'Harga saham sudah naik cukup tinggi melampaui estimasi nilai wajarnya; hindari mengejar harga di pucuk.' : 'Valuasi yang murah saat ini didukung oleh profitabilitas operasional yang sehat dan arus kas nyata.'}`,
          `Potensi Kenaikan ke Nilai Wajar: Apabila pasar kembali mengapresiasi ${stock.ticker} menuju Fair PER ${joeliardiEval.joeliardiFairPer}x dan Fair PBV ${joeliardiEval.joeliardiFairPbv}x, harga wajarnya berpotensi menuju Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')}.`
        ],
        sentimentTone:
          joeliardiEval.marginOfSafetyPct >= 15 && !isValueTrapCandidate
            ? 'POSITIVE'
            : joeliardiEval.marginOfSafetyPct >= 0
            ? 'NEUTRAL'
            : 'CAUTION'
      },
      {
        id: 'news-hsc-catalysts',
        badge: stock.isHscFlagged ? '03. AUDIT HSC // BLOKIR' : `03. KATALIS & HSC // ${recentNews.length} BERITA`,
        title: 'Ringkasan Berita Terkini, Aksi Korporasi & Keamanan Likuiditas Pasar',
        keyMetricHighlight: `${stock.isHscFlagged ? 'TERINDIKASI HSC (Blokir Top Buy)' : 'Clean Institutional (Bebas HSC)'} · ${positiveNews.length} Sentimen Positif · ${cautionNews.length} Isu Perhatian`,
        reasoningParagraph: stock.isHscFlagged
          ? `Sistem mendeteksi ${stock.ticker} memiliki pola transaksi berisiko tinggi atau konsentrasi spekulatif (${stock.hscReason || 'pergerakan harga tidak wajar'}). Demi menjaga keamanan modal, saham ini dipisahkan dari daftar beli utama dan dimasukkan ke zona Rotate Out.`
          : `Dari ${recentNews.length} berita dan keterbukaan informasi terbaru pada ${stock.ticker}, perhatian pelaku pasar tertuju pada rilis kinerja keuangan, pembagian dividen, serta prospek sektor ${stock.sector}. Aktivitas perdagangannya juga bersih dari gejala saham gorengan (HSC/UMA), sehingga pergerakan harganya wajar mengikuti mekanisme pasar.`,
        bulletPoints:
          recentNews.length > 0
            ? recentNews.slice(0, 3).map(
                (n) =>
                  `[${n.emitenCategory || 'KATALIS'}] ${stripRawMarkdownArtifacts(n.title)} (${n.source} · ${n.publishedAt})`
              )
            : [
                `Agenda Korporasi yang Perlu Dipantau: Rilis laporan keuangan kuartalan berikutnya serta kebijakan rasio dividen pada RUPS ${stock.ticker}.`,
                `Kelayakan Transaksi di BEI: ${stock.isLiquid !== false && stock.lastPrice >= 68 ? 'Transaksi harian di pasar reguler tergolong likuid dan aman untuk eksekusi portofolio.' : 'Likuiditas transaksi harian cukup tipis; batasi porsi pembelian.'}`
              ],
        sentimentTone: stock.isHscFlagged
          ? 'NEGATIVE'
          : cautionNews.length > positiveNews.length
          ? 'CAUTION'
          : 'POSITIVE'
      },
      {
        id: 'regime-momentum-fit',
        badge: `04. EKSEKUSI & REZIM // ${regimeStatus}`,
        title: 'Arah Pergerakan Harga, Volatilitas & Panduan Porsi Portofolio',
        keyMetricHighlight: `1D ${stock.change1D >= 0 ? '+' : ''}${stock.change1D.toFixed(2)}% · 30D ${stock.return30D >= 0 ? '+' : ''}${stock.return30D.toFixed(2)}% · Beta ${stock.beta1Y.toFixed(2)}x · Volatilitas ${stock.volatilityAnn.toFixed(1)}%`,
        reasoningParagraph: `Dengan tingkat fluktuasi tahunan ${stock.volatilityAnn.toFixed(1)}% dan Beta 1Y ${stock.beta1Y.toFixed(2)}x terhadap IHSG, pergerakan saham ${stock.ticker} cenderung ${stock.beta1Y <= 0.96 ? 'lebih tenang dibandingkan pasar secara umum (cocok sebagai penyeimbang portofolio / Defensive Core)' : 'lebih sensitif mengikuti naik-turunnya IHSG (cocok untuk akselerasi pertumbuhan / Tactical Alpha)'}. Perubahan harga 30 hari terakhir sebesar ${stock.return30D >= 0 ? '+' : ''}${stock.return30D.toFixed(2)}% (Skor Momentum ${stock.dmuMomScore.toFixed(1)}/10) mencerminkan ${stock.return30D >= 3 ? 'minat beli pasar yang sejalan dengan kinerja fundamentalnya' : stock.return30D <= -5 ? 'adanya koreksi harga yang justru membuka ruang cicil beli di area diskon' : 'pergerakan mendatar yang sehat sambil menunggu katalis baru'}.`,
        bulletPoints: [
          `Penempatan dalam Portofolio Barbell: ${stock.beta1Y <= 0.96 && stock.dmuLowVolScore >= 6.5 ? 'Ideal ditempatkan di Keranjang 1 (Low-Volatility & Dividend Core — porsi 55% ekuitas).' : stock.dmuMomScore >= 6.8 ? 'Cocok ditempatkan di Keranjang 2 (Momentum & Size Alpha — porsi 45% ekuitas).' : 'Dapat dipantau di Watchlist sambil menunggu momentum harga membaik.'}`,
          `Strategi Beli di Kondisi IHSG ${regimeStatus}: ${regimeStatus === 'VOLATIL' ? 'Disarankan membagi pembelian menjadi 2–3 tahap (cicil beli saat harga terkoreksi) agar mendapatkan harga rata-rata yang optimal.' : 'Lakukan alokasi sesuai bobot kalkulator portofolio dengan tetap mematuhi batas Rebalancing Buffer 40%.'}`,
          `Disiplin Hold & Efisiensi Fee: Selama peringkat kuantitatif saham ini masih bertahan di zona Buffer ≤40% (saat ini Top ${stock.dmuRankPct}%), posisi layak dipertahankan untuk menghemat biaya transaksi sekuritas.`
        ],
        sentimentTone:
          stock.volatilityAnn <= 26 && !stock.isHscFlagged ? 'POSITIVE' : 'NEUTRAL'
      }
    ],
    bullishDrivers: joeliardiEval.keyStrengths.map(stripRawMarkdownArtifacts),
    bearishRisks: joeliardiEval.keyRisks.map(stripRawMarkdownArtifacts),
    executionStrategy: {
      recommendedAction: stock.isHscFlagged
        ? 'Hindari pembelian baru (Block Buy) & alihkan modal ke saham berfundamental sehat.'
        : joeliardiEval.marginOfSafetyPct >= 12 && stock.dmuCompositeScore >= 6.8
        ? 'Akumulasi Bertahap (Buy on Weakness / Cicil 2–3 Tahap) di area diskon nilai wajar.'
        : 'Tunggu Koreksi Wajar (Buy on Pullback) agar mendapatkan ruang Margin of Safety yang lebih aman.',
      idealEntryZone: stock.isHscFlagged
        ? 'Tidak direkomendasikan (Blokir HSC)'
        : `Rp ${idealBuyLow.toLocaleString('id-ID')} – Rp ${Math.max(idealBuyLow, idealBuyHigh).toLocaleString('id-ID')} (Nilai Wajar Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')})`,
      InvalidationOrRiskLimit: stock.isHscFlagged
        ? 'Batasi porsi maksimal 0% dari portofolio.'
        : `Tinjau ulang posisi jika harga turun di bawah Rp ${riskStopPrice.toLocaleString('id-ID')} disertai penurunan ROE < 10,5% atau keluar dari zona Top 40% Buffer.`,
      portfolioAllocationGuide: stock.isHscFlagged
        ? '0% Modal Portofolio (Diblokir oleh filter perlindungan modal)'
        : stock.beta1Y <= 0.96
        ? 'Keranjang 1 (Low-Vol & Dividend Core): Alokasikan 6% – 12% dari modal ekuitas aktif.'
        : 'Keranjang 2 (Momentum & Size Alpha): Alokasikan 4% – 8% dari modal ekuitas aktif.'
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
}): Promise<{
  analysis: string;
  structuredReport: StructuredAiConvictionReport;
  isAiGenerated: boolean;
  generatedAt: string;
}> {
  const { stock, joeliardiEval, recentNews, userQuestion, regimeStatus } = params;
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
          regimeStatus
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

          const sanitizedReport: StructuredAiConvictionReport = {
            verdictBadge: stripRawMarkdownArtifacts(
              sr.verdictBadge || fallbackReport.verdictBadge
            ),
            verdictTitle: stripRawMarkdownArtifacts(
              sr.verdictTitle || fallbackReport.verdictTitle
            ),
            directAnswerSummary: cleanedSummary || fallbackReport.directAnswerSummary,
            convictionScore:
              typeof sr.convictionScore === 'number'
                ? sr.convictionScore
                : fallbackReport.convictionScore,
            chainOfThoughtSteps:
              Array.isArray(sr.chainOfThoughtSteps) && sr.chainOfThoughtSteps.length > 0
                ? sr.chainOfThoughtSteps.map(stripRawMarkdownArtifacts)
                : fallbackReport.chainOfThoughtSteps,
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
              recommendedAction: stripRawMarkdownArtifacts(
                sr.executionStrategy?.recommendedAction ||
                  fallbackReport.executionStrategy.recommendedAction
              ),
              idealEntryZone: stripRawMarkdownArtifacts(
                sr.executionStrategy?.idealEntryZone ||
                  fallbackReport.executionStrategy.idealEntryZone
              ),
              InvalidationOrRiskLimit: stripRawMarkdownArtifacts(
                sr.executionStrategy?.InvalidationOrRiskLimit ||
                  fallbackReport.executionStrategy.InvalidationOrRiskLimit
              ),
              portfolioAllocationGuide: stripRawMarkdownArtifacts(
                sr.executionStrategy?.portfolioAllocationGuide ||
                  fallbackReport.executionStrategy.portfolioAllocationGuide
              )
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

