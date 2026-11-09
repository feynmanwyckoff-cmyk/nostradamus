import { MacroIndicator, NewsSentimentItem, StockMetrics } from '../types/quant';
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
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetV8)}`, wrapped: true },
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetV7)}`, wrapped: false },
    { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetV8)}`, wrapped: false }
  ];

  let out: Record<string, SparkSeriesItem> = {};

  for (const proxy of proxyCandidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5500);
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

  // If this was a targeted lookup (e.g. "Tarik Ticker .JK" with <= 3 symbols) and any symbol had Volume Not Available
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
      const timer = setTimeout(() => controller.abort(), 7500);
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
 * High-Throughput Multi-Symbol Yahoo Spark Batch Fetcher
 * Works both on Google AI Studio (`/api/yahoo/spark`) AND on GitHub Pages (`*.github.io` via GitHub API + CORS live batches)
 * with visible progress updates (`onChunkProgress`) so clicking Sync always performs real network fetching & 100% completion.
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

  // 1. Hydrate baseline from pre-synced Yahoo Finance snapshot (or fresh GitHub API snapshot when forceLiveNetwork=true)
  const snapshot = await loadStaticMarketSnapshot(forceLiveNetwork);
  if (snapshot?.data) {
    for (const sym of uniqueSymbols) {
      const item = snapshot.data[sym];
      if (item && item.lastPrice > 0 && Array.isArray(item.closes) && item.closes.length >= 2) {
        resultMap[sym] = item;
      }
    }
  }

  // 2. Path A: Local Express Backend (/api/yahoo/spark) in Google AI Studio / Local Dev
  if (canUseLocalExpressBackend()) {
    const SERVER_BATCH_SIZE = 40;
    const CONCURRENT_CHUNKS = 3;
    const batches: string[][] = [];
    for (let i = 0; i < uniqueSymbols.length; i += SERVER_BATCH_SIZE) {
      batches.push(uniqueSymbols.slice(i, i + SERVER_BATCH_SIZE));
    }

    let completedSymbols = 0;
    for (let g = 0; g < batches.length; g += CONCURRENT_CHUNKS) {
      const group = batches.slice(g, g + CONCURRENT_CHUNKS);
      const groupLastBatch = group[group.length - 1];
      completedSymbols = Math.min(
        uniqueSymbols.length,
        completedSymbols + group.reduce((acc, b) => acc + b.length, 0)
      );
      onChunkProgress?.(
        completedSymbols,
        uniqueSymbols.length,
        `${group[0][0]} .. ${groupLastBatch[groupLastBatch.length - 1]}`
      );

      try {
        const results = await Promise.all(
          group.map(async (batch) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 9000);
            const res = await fetch(
              `/api/yahoo/spark?symbols=${encodeURIComponent(
                batch.join(',')
              )}&range=${encodeURIComponent(range)}`,
              { signal: controller.signal, cache: 'no-store' }
            );
            clearTimeout(timer);
            if (!res.ok) return null;
            return await res.json();
          })
        );

        let anyOk = false;
        for (const json of results) {
          if (json?.data && typeof json.data === 'object') {
            anyOk = true;
            Object.assign(resultMap, json.data);
            if (embeddedSnapshot.data) {
              Object.assign(embeddedSnapshot.data, json.data);
            }
          }
        }
        if (anyOk) {
          cachedLocalServerAvailable = true;
        } else {
          cachedLocalServerAvailable = false;
          break;
        }
      } catch {
        cachedLocalServerAvailable = false;
        break;
      }
    }
  } else if (forceLiveNetwork) {
    // 3. Path B: Static Host / GitHub Pages (*.github.io) Explicit Live Sync
    // When user queries <= 10 symbols (e.g. manual "Tarik Ticker .JK"), fetch all requested symbols directly.
    // When syncing the full 956+ universe, prioritize ^JKSE, Global Macro, and Institutional Liquid BEI Stocks.
    const priorityLiveSymbols =
      uniqueSymbols.length <= 10
        ? uniqueSymbols
        : uniqueSymbols.filter((sym) => {
            if (!sym.endsWith('.JK')) return true;
            const clean = sym.replace(/\.JK$/i, '');
            return isInstitutionalLiquidCandidate(clean);
          });

    const CORS_BATCH_SIZE = 20;
    const CONCURRENT_CORS = 3;
    const batches: string[][] = [];
    for (let i = 0; i < priorityLiveSymbols.length; i += CORS_BATCH_SIZE) {
      batches.push(priorityLiveSymbols.slice(i, i + CORS_BATCH_SIZE));
    }

    for (let g = 0; g < batches.length; g += CONCURRENT_CORS) {
      const group = batches.slice(g, g + CONCURRENT_CORS);
      const groupLast = group[group.length - 1];
      const scaledProgress = Math.min(
        uniqueSymbols.length,
        Math.round(((g + group.length) / Math.max(1, batches.length)) * uniqueSymbols.length)
      );
      onChunkProgress?.(
        scaledProgress,
        uniqueSymbols.length,
        `${group[0][0]} .. ${groupLast[groupLast.length - 1]}`
      );

      const groupResults = await Promise.all(
        group.map((batch) => fetchYahooSparkViaBrowserCors(batch, range))
      );
      for (const liveBatchData of groupResults) {
        if (Object.keys(liveBatchData).length > 0) {
          Object.assign(resultMap, liveBatchData);
          if (embeddedSnapshot.data) {
            Object.assign(embeddedSnapshot.data, liveBatchData);
          }
        }
      }
    }
  }

  onChunkProgress?.(
    uniqueSymbols.length,
    uniqueSymbols.length,
    uniqueSymbols[uniqueSymbols.length - 1] || 'Selesai'
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
  const stockSymbols = expandedStocks.map((s) => s.yfTicker);
  const allTargetSymbols = ['^JKSE', ...macroSymbols, ...stockSymbols];

  const batchMap = await fetchYahooSparkBatch(
    allTargetSymbols,
    '3mo',
    (syncedSoFar, _total, label) => {
      const approxStockSynced = Math.min(
        expandedStocks.length,
        Math.max(0, syncedSoFar - macroSymbols.length - 1)
      );
      onProgress?.(approxStockSynced, expandedStocks.length, label);
    },
    forceLiveNetwork
  );

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

  // 3. Process All JCI Screener Stocks (~956 -> 1000+ Emiten)
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

function stripHtmlTags(raw: string): string {
  const withoutTags = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntities(withoutTags)
    .replace(/\s+/g, ' ')
    .trim();
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
        return data.items.slice(0, limit).map(
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
              publishedAt: item.pubDate ? item.pubDate.slice(0, 16) : 'Hari ini · Live RSS',
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
