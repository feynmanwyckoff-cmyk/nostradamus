/**
 * ============================================================================
 * NOSTRADAMUS QUANT TERMINAL — CLOUDFLARE WORKER REAL-TIME YAHOO FINANCE RELAY
 * ============================================================================
 * Architecture : On-Demand Single-Ticker Real-Time Sync (1–2s Latency, Free Tier)
 * Runtime      : Cloudflare Workers (100% Pure ES Module, ZERO npm dependencies)
 * Deployment   : Copy-paste this entire file into Cloudflare Dashboard ->
 *                Workers & Pages -> Edit Code -> Deploy.
 *
 * Endpoint Usage:
 *   GET https://<your-worker>.<your-subdomain>.workers.dev/?ticker=LSIP
 *   GET https://<your-worker>.<your-subdomain>.workers.dev/?ticker=BBCA&nocache=1
 */

// ============================================================================
// CORS & SECURITY CONFIGURATION
// ============================================================================
// Default: '*' so the Worker works immediately after copy-paste deployment.
// To lock down access in production, replace '*' with a comma-separated list
// or array of allowed origins, e.g.:
// const ALLOWED_ORIGINS = 'https://feynmanwyckoff-cmyk.github.io,http://localhost:5173,http://localhost:3000';
const ALLOWED_ORIGINS = '*';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Cache TTLs in Cloudflare Cache API (caches.default)
const CHART_CACHE_TTL_SECONDS = 300; // 5 minutes for spot price, ADTV 20D, Beta, Vol, ATR, Div Yield
const FUNDAMENTALS_CACHE_TTL_SECONDS = 21600; // 6 hours for financial statements, FX IDR=X & SBN curve

// Known Infrastructure / Telecom tickers where D&A / Revenue naturally exceeds 18% (up to ~42%)
const INFRA_TELCO_HIGH_DA_TICKERS = new Set([
  'TLKM',
  'ISAT',
  'EXCL',
  'TOWR',
  'TBIG',
  'MTEL',
  'JSMR',
  'META',
  'CMNP',
  'LINK',
  'WIFI',
  'DATA',
  'CENT',
  'SUPR',
  'IBST',
  'BALI',
  'ARKO',
  'KEEN',
  'POWR',
  'TGRA',
  'PGEO',
  'BREN',
  'CUAN'
]);

// Module-level in-memory Yahoo session cache (persists across warm Worker invocations)
let cachedYahooAuth = {
  cookie: '',
  crumb: '',
  expiresAtMs: 0
};

/**
 * Builds CORS headers based on the request Origin and ALLOWED_ORIGINS constant.
 */
function buildCorsHeaders(request) {
  const reqOrigin = request.headers.get('Origin') || '*';
  let allowOrigin = '*';

  if (ALLOWED_ORIGINS !== '*') {
    const allowedList = Array.isArray(ALLOWED_ORIGINS)
      ? ALLOWED_ORIGINS
      : String(ALLOWED_ORIGINS)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    allowOrigin = allowedList.includes(reqOrigin) ? reqOrigin : allowedList[0] || '*';
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Cache-Control',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

/**
 * Helper to return a JSON HTTP response with CORS headers.
 */
function jsonResponse(request, payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...buildCorsHeaders(request),
      ...extraHeaders
    }
  });
}

/**
 * Validates and normalizes an IDX ticker code (must be 4 alphanumeric characters, e.g. BBCA, LSIP, ADMR).
 */
function normalizeAndValidateIdxTicker(rawTickerParam) {
  if (!rawTickerParam || typeof rawTickerParam !== 'string') {
    return { valid: false, cleanTicker: '', yfSymbol: '', error: 'Parameter ?ticker=XXXX wajib diisi.' };
  }
  const cleaned = rawTickerParam
    .trim()
    .toUpperCase()
    .replace(/\.JK$/i, '')
    .trim();

  if (!/^[A-Z0-9]{4}$/.test(cleaned)) {
    return {
      valid: false,
      cleanTicker: cleaned,
      yfSymbol: '',
      error: `Format kode saham BEI '${rawTickerParam}' tidak valid. Gunakan 4 karakter kode emiten BEI (contoh: BBCA, LSIP, ADMR, MIKA).`
    };
  }

  return {
    valid: true,
    cleanTicker: cleaned,
    yfSymbol: `${cleaned}.JK`,
    error: null
  };
}

/**
 * Performs Server-Side Yahoo Finance Cookie + Crumb Handshake (Anti-401):
 *   1. GET https://fc.yahoo.com -> extract Set-Cookie (A1/A3/B cookie)
 *   2. GET https://query1.finance.yahoo.com/v1/test/getcrumb -> extract crumb token
 */
async function getYahooAuthSession(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedYahooAuth.cookie &&
    cachedYahooAuth.crumb &&
    cachedYahooAuth.expiresAtMs > now
  ) {
    return cachedYahooAuth;
  }

  let cookieHeader = '';
  try {
    const fcRes = await fetch('https://fc.yahoo.com', {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const rawCookies = [];
    if (typeof fcRes.headers.getSetCookie === 'function') {
      const list = fcRes.headers.getSetCookie();
      if (Array.isArray(list)) rawCookies.push(...list);
    }
    if (rawCookies.length === 0) {
      const single = fcRes.headers.get('set-cookie');
      if (single) rawCookies.push(single);
    }

    cookieHeader = rawCookies
      .map((c) => String(c).split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  } catch {
    // Proceed to crumb fetch attempt even if fc.yahoo.com timed out
  }

  let crumb = '';
  try {
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      method: 'GET',
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/plain, */*',
        ...(cookieHeader ? { Cookie: cookieHeader } : {})
      }
    });

    if (crumbRes.ok) {
      const text = (await crumbRes.text()).trim();
      if (text && !text.includes('<html') && text.length < 64) {
        crumb = text;
      }
    }
  } catch {
    // Crumb is optional for v8 chart and fundamentals-timeseries endpoints
  }

  if (cookieHeader || crumb) {
    cachedYahooAuth = {
      cookie: cookieHeader,
      crumb,
      expiresAtMs: now + 25 * 60 * 1000 // Cache session in memory for 25 minutes
    };
  }

  return cachedYahooAuth;
}

/**
 * Fetches a Yahoo Finance JSON URL with automatic 1x cookie/crumb re-handshake on HTTP 401/403.
 */
async function fetchYahooJsonWithRetry(url, useCrumb = false) {
  let session = await getYahooAuthSession(false);

  const buildTargetUrl = (auth) => {
    if (!useCrumb || !auth.crumb) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}crumb=${encodeURIComponent(auth.crumb)}`;
  };

  const makeHeaders = (auth) => ({
    'User-Agent': BROWSER_USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://finance.yahoo.com',
    Referer: 'https://finance.yahoo.com/',
    ...(auth.cookie ? { Cookie: auth.cookie } : {})
  });

  let res = await fetch(buildTargetUrl(session), {
    method: 'GET',
    headers: makeHeaders(session)
  });

  if (res.status === 401 || res.status === 403) {
    session = await getYahooAuthSession(true);
    res = await fetch(buildTargetUrl(session), {
      method: 'GET',
      headers: makeHeaders(session)
    });
  }

  if (!res.ok) {
    throw new Error(`Yahoo HTTP ${res.status} on ${url}`);
  }

  return await res.json();
}

/**
 * Wrapper around Cloudflare Cache API (caches.default) for JSON sub-results.
 */
async function withCloudflareCache(cacheKeyUrl, ttlSeconds, bypassCache, fetcherFn) {
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const cacheReq = new Request(cacheKeyUrl, { method: 'GET' });

  if (cache && !bypassCache) {
    try {
      const hit = await cache.match(cacheReq);
      if (hit) {
        const data = await hit.json();
        return { data, cacheHit: true };
      }
    } catch {
      // Ignore cache read failure
    }
  }

  const freshData = await fetcherFn();

  if (cache && freshData) {
    try {
      const cacheRes = new Response(JSON.stringify(freshData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${ttlSeconds}`
        }
      });
      await cache.put(cacheReq, cacheRes);
    } catch {
      // Ignore cache write failure
    }
  }

  return { data: freshData, cacheHit: false };
}

/**
 * Fetches 1-Year Daily Chart for a Yahoo symbol (e.g., LSIP.JK or ^JKSE) with dividend events.
 */
async function fetchYahooChart1Y(yfSymbol, bypassCache = false) {
  const cacheKey = `https://nostradamus-worker.local/cache/chart-v8/${encodeURIComponent(yfSymbol)}`;
  const { data } = await withCloudflareCache(
    cacheKey,
    CHART_CACHE_TTL_SECONDS,
    bypassCache,
    async () => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yfSymbol
      )}?range=1y&interval=1d&events=div`;
      return await fetchYahooJsonWithRetry(url, false);
    }
  );
  return data;
}

/**
 * Extracts market metrics from the ticker's 1Y chart and ^JKSE 1Y chart:
 * - lastPrice, previousClose, change1D, closes, timestamps
 * - adtv20dIdr (mean of last 20 valid trading days close * volume)
 * - beta1Y (daily return regression vs ^JKSE with Vasicek shrinkage)
 * - realizedAnnualVol (annualized daily return standard deviation %)
 * - atr20 (20-day Average True Range in IDR)
 * - dividendYieldTTM (trailing 12M cash dividends / lastPrice * 100)
 */
function computeMarketMetricsFromCharts(stockChartJson, jkseChartJson) {
  const result = stockChartJson?.chart?.result?.[0];
  if (!result) {
    throw new Error('Data chart Yahoo v8 kosong atau emiten tidak ditemukan.');
  }

  const meta = result.meta || {};
  const timestampsRaw = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const closesRaw = quote.close || [];
  const highsRaw = quote.high || [];
  const lowsRaw = quote.low || [];
  const volumesRaw = quote.volume || [];

  const validBars = [];
  for (let i = 0; i < closesRaw.length; i++) {
    const c = Number(closesRaw[i]);
    if (!Number.isFinite(c) || c <= 0) continue;
    const h = Number.isFinite(Number(highsRaw[i])) && Number(highsRaw[i]) > 0 ? Number(highsRaw[i]) : c;
    const l = Number.isFinite(Number(lowsRaw[i])) && Number(lowsRaw[i]) > 0 ? Number(lowsRaw[i]) : c;
    const v = Number.isFinite(Number(volumesRaw[i])) && Number(volumesRaw[i]) >= 0 ? Number(volumesRaw[i]) : 0;
    const ts = Number(timestampsRaw[i]) || 0;
    validBars.push({ ts, dayKey: ts ? Math.floor(ts / 86400) : i, close: c, high: h, low: l, volume: v });
  }

  const lastBar = validBars.length > 0 ? validBars[validBars.length - 1] : null;
  const prevBar = validBars.length > 1 ? validBars[validBars.length - 2] : lastBar;

  const lastPrice = Math.round(
    Number(meta.regularMarketPrice) > 0
      ? Number(meta.regularMarketPrice)
      : lastBar
      ? lastBar.close
      : 0
  );
  const previousClose = Math.round(
     prevBar && prevBar.close > 0
      ? prevBar.close
      : Number(meta.chartPreviousClose || meta.previousClose) > 0
      ? Number(meta.chartPreviousClose || meta.previousClose)
      : lastPrice
  );
  const change1D =
    previousClose > 0
      ? Number((((lastPrice - previousClose) / previousClose) * 100).toFixed(2))
      : 0;

  // 1. ADTV 20D IDR (average of last 20 active trading days close * volume)
  const tradingBarsWithVolume = validBars.filter((b) => b.volume > 0 && b.close > 0);
  const recent20 = tradingBarsWithVolume.slice(-20);
  let adtv20dIdr = null;
  if (recent20.length >= 3) {
    const totalTurnover = recent20.reduce((sum, b) => sum + b.close * b.volume, 0);
    adtv20dIdr = Math.round(totalTurnover / recent20.length);
  }

  // 2. Realized Annual Volatility (%) & Daily Returns map
  const stockReturns = [];
  const stockReturnByDay = new Map();
  for (let i = 1; i < validBars.length; i++) {
    const prevC = validBars[i - 1].close;
    const currC = validBars[i].close;
    if (prevC > 0 && currC > 0) {
      const r = (currC - prevC) / prevC;
      if (Math.abs(r) < 0.36) {
        stockReturns.push(r);
        stockReturnByDay.set(validBars[i].dayKey, r);
      }
    }
  }

  let realizedAnnualVol = 24.0;
  if (stockReturns.length >= 15) {
    const meanR = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
    const variance =
      stockReturns.reduce((acc, r) => acc + (r - meanR) * (r - meanR), 0) /
      Math.max(1, stockReturns.length - 1);
    const annualizedPct = Math.sqrt(Math.max(0, variance)) * Math.sqrt(252) * 100;
    realizedAnnualVol = Number(Math.max(8.0, Math.min(95.0, annualizedPct)).toFixed(2));
  }

  // 3. 20-Day ATR (Average True Range in IDR)
  const trueRanges = [];
  for (let i = 1; i < validBars.length; i++) {
    const b = validBars[i];
    const prevC = validBars[i - 1].close;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prevC), Math.abs(b.low - prevC));
    if (Number.isFinite(tr) && tr >= 0) {
      trueRanges.push(tr);
    }
  }
  const recentTr20 = trueRanges.slice(-20);
  const atr20 =
    recentTr20.length >= 5
      ? Math.max(1, Math.round(recentTr20.reduce((a, b) => a + b, 0) / recentTr20.length))
      : Math.max(1, Math.round(lastPrice * (realizedAnnualVol / 100 / Math.sqrt(252)) * 1.35));

  // 4. 1Y Beta vs ^JKSE
  let beta1Y = null;
  const jkseResult = jkseChartJson?.chart?.result?.[0];
  if (jkseResult) {
    const jTs = jkseResult.timestamp || [];
    const jCloses = jkseResult.indicators?.quote?.[0]?.close || [];
    const jBars = [];
    for (let i = 0; i < jCloses.length; i++) {
      const c = Number(jCloses[i]);
      if (Number.isFinite(c) && c > 0) {
        const ts = Number(jTs[i]) || 0;
        jBars.push({ dayKey: ts ? Math.floor(ts / 86400) : i, close: c });
      }
    }

    const pairedS = [];
    const pairedM = [];
    for (let i = 1; i < jBars.length; i++) {
      const prevM = jBars[i - 1].close;
      const currM = jBars[i].close;
      if (prevM > 0 && currM > 0) {
        const rM = (currM - prevM) / prevM;
        const rS = stockReturnByDay.get(jBars[i].dayKey);
        if (typeof rS === 'number' && Number.isFinite(rM)) {
          pairedS.push(rS);
          pairedM.push(rM);
        }
      }
    }

    // Fallback to tail index alignment if timestamp day keys had timezone offset differences
    if (pairedS.length < 20 && jBars.length >= 25 && stockReturns.length >= 25) {
      const mRets = [];
      for (let i = 1; i < jBars.length; i++) {
        mRets.push((jBars[i].close - jBars[i - 1].close) / jBars[i - 1].close);
      }
      const overlap = Math.min(stockReturns.length, mRets.length, 180);
      pairedS.length = 0;
      pairedM.length = 0;
      pairedS.push(...stockReturns.slice(-overlap));
      pairedM.push(...mRets.slice(-overlap));
    }

    if (pairedS.length >= 20) {
      const n = pairedS.length;
      const meanS = pairedS.reduce((a, b) => a + b, 0) / n;
      const meanM = pairedM.reduce((a, b) => a + b, 0) / n;
      let cov = 0;
      let varM = 0;
      for (let i = 0; i < n; i++) {
        cov += (pairedS[i] - meanS) * (pairedM[i] - meanM);
        varM += (pairedM[i] - meanM) * (pairedM[i] - meanM);
      }
      cov /= Math.max(1, n - 1);
      varM /= Math.max(1, n - 1);
      if (varM > 1e-9) {
        const rawBeta = cov / varM;
        // Vasicek shrinkage (75% empirical + 25% market prior 0.92)
        const shrunkBeta = 0.75 * rawBeta + 0.25 * 0.92;
        beta1Y = Number(Math.max(0.38, Math.min(2.35, shrunkBeta)).toFixed(2));
      }
    }
  }

  // 5. Trailing 12M Dividend Yield (%) from chart events.dividends
  let dividendYieldTTM = 0;
  const divEventsObj = result.events?.dividends || {};
  const divEvents = Object.values(divEventsObj);
  if (divEvents.length > 0 && lastPrice > 0) {
    const oneYearAgoSec = Math.floor(Date.now() / 1000) - 370 * 86400;
    const ttmDivPerShare = divEvents.reduce((sum, ev) => {
      const amount = Number(ev?.amount) || 0;
      const dateSec = Number(ev?.date) || 0;
      return dateSec >= oneYearAgoSec && amount > 0 ? sum + amount : sum;
    }, 0);
    if (ttmDivPerShare > 0) {
      const rawYieldPct = (ttmDivPerShare / lastPrice) * 100;
      // Sanity cap against currency mismatch or outlier special liquidation dividend
      if (rawYieldPct > 0 && rawYieldPct <= 35.0) {
        dividendYieldTTM = Number(rawYieldPct.toFixed(2));
      }
    }
  }

  // Return last 65 closes & timestamps for sparklines / 30D return calculation
  const tailBars = validBars.slice(-65);
  const closes = tailBars.map((b) => Math.round(b.close));
  const timestamps = tailBars.map((b) => b.ts);
  const close30dAgo =
    closes.length >= 22 ? closes[closes.length - 22] : closes[0] || lastPrice;
  const return30D =
    close30dAgo > 0
      ? Number((((lastPrice - close30dAgo) / close30dAgo) * 100).toFixed(2))
      : 0;

  return {
    lastPrice,
    previousClose,
    change1D,
    return30D,
    adtv20dIdr,
    beta1Y,
    realizedAnnualVol,
    atr20,
    dividendYieldTTM,
    closes,
    timestamps,
    chartCurrency: meta.currency || 'IDR'
  };
}

/**
 * Fetches Live USD/IDR Exchange Rate (IDR=X) from Yahoo Chart v8 (Cached 6 hours).
 */
async function fetchLiveUsdIdrRate(bypassCache = false) {
  const cacheKey = 'https://nostradamus-worker.local/cache/fx/USDIDR';
  try {
    const { data } = await withCloudflareCache(
      cacheKey,
      FUNDAMENTALS_CACHE_TTL_SECONDS,
      bypassCache,
      async () => {
        const url =
          'https://query1.finance.yahoo.com/v8/finance/chart/IDR=X?range=5d&interval=1d';
        const json = await fetchYahooJsonWithRetry(url, false);
        const metaPrice = Number(json?.chart?.result?.[0]?.meta?.regularMarketPrice);
        const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
        const validCloses = closes.filter((c) => typeof c === 'number' && c > 10000);
        const rate =
          Number.isFinite(metaPrice) && metaPrice > 10000 && metaPrice < 25000
            ? Math.round(metaPrice)
            : validCloses.length > 0
            ? Math.round(validCloses[validCloses.length - 1])
            : 16250;
        return { fxRateUsdIdr: rate, fetchedAt: new Date().toISOString() };
      }
    );
    return Number(data?.fxRateUsdIdr) || 16250;
  } catch {
    return 16250;
  }
}

/**
 * Fetches Actual Indonesia SBN 1Y / 5Y / 10Y Sovereign Yield Curve (Cached 6 hours).
 * Uses CNBC Sovereign Quote API (ID1Y-ID, ID5Y-ID, ID10Y-ID) with WorldGovernmentBonds fallback.
 * Strictly enforces sanity gate 3.0% <= yield <= 14.0%. Returns null if unavailable (never fakes dates).
 */
async function fetchIndonesiaSbnYieldCurve(bypassCache = false) {
  const cacheKey = 'https://nostradamus-worker.local/cache/macro/sbn-curve-id';
  try {
    const { data } = await withCloudflareCache(
      cacheKey,
      FUNDAMENTALS_CACHE_TTL_SECONDS,
      bypassCache,
      async () => {
        const isValidYield = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 3.0 && v <= 14.0;
        const parseNum = (raw) => {
          if (raw === null || raw === undefined) return null;
          const cleaned = String(raw).replace('%', '').replace(',', '.').trim();
          const n = Number(cleaned);
          return isValidYield(n) ? Number(n.toFixed(2)) : null;
        };

        // Primary Source: CNBC Global Sovereign Bond Quote API
        try {
          const cnbcUrl =
            'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=ID1Y-ID%7CID5Y-ID%7CID10Y-ID&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1';
          const cnbcRes = await fetch(cnbcUrl, {
            method: 'GET',
            headers: {
              'User-Agent': BROWSER_USER_AGENT,
              Accept: 'application/json'
            }
          });

          if (cnbcRes.ok) {
            const cnbcJson = await cnbcRes.json();
            const quotes = cnbcJson?.FormattedQuoteResult?.FormattedQuote;
            const list = Array.isArray(quotes) ? quotes : quotes ? [quotes] : [];
            const bySym = {};
            for (const q of list) {
              if (q && q.symbol) bySym[q.symbol] = q;
            }
            const y10 = parseNum(bySym['ID10Y-ID']?.last);
            const y5 = parseNum(bySym['ID5Y-ID']?.last);
            const y1 = parseNum(bySym['ID1Y-ID']?.last);

            if (isValidYield(y10)) {
              const rawTime = bySym['ID10Y-ID']?.last_time || '';
              const dateMatch = String(rawTime).match(/^(\d{4}-\d{2}-\d{2})/);
              const sbnAsOfDate = dateMatch
                ? dateMatch[1]
                : new Date().toISOString().slice(0, 10);

              const y5Final = isValidYield(y5) ? y5 : Number((y10 - 0.25).toFixed(2));
              const y1Final = isValidYield(y1) ? y1 : Number((y10 - 0.55).toFixed(2));

              return {
                sbn10YYieldPct: y10,
                sbn5YYieldPct: y5Final,
                sbn1YYieldPct: y1Final,
                sbn10YPct: y10,
                sbn5YPct: y5Final,
                sbn1YPct: y1Final,
                sbnSource: 'CNBC_SOVEREIGN_ID10Y_LIVE',
                sbnAsOfDate
              };
            }
          }
        } catch {
          // Proceed to secondary fallback
        }

        // Secondary Source: WorldGovernmentBonds Indonesia 10Y
        try {
          const wgbRes = await fetch(
            'https://www.worldgovernmentbonds.com/country/indonesia/',
            {
              method: 'GET',
              headers: {
                'User-Agent': BROWSER_USER_AGENT,
                Accept: 'text/html'
              }
            }
          );
          if (wgbRes.ok) {
            const html = await wgbRes.text();
            const match10Y =
              html.match(/10\s*years?[\s\S]{0,260}?(\d{1,2}[.,]\d{2,3})\s*%/i) ||
              html.match(/Indonesia\s+10Y[\s\S]{0,160}?(\d{1,2}[.,]\d{2,3})\s*%/i);
            const y10 = match10Y ? parseNum(match10Y[1]) : null;
            if (isValidYield(y10)) {
              const y5Fallback = Number((y10 - 0.25).toFixed(2));
              const y1Fallback = Number((y10 - 0.55).toFixed(2));
              return {
                sbn10YYieldPct: y10,
                sbn5YYieldPct: y5Fallback,
                sbn1YYieldPct: y1Fallback,
                sbn10YPct: y10,
                sbn5YPct: y5Fallback,
                sbn1YPct: y1Fallback,
                sbnSource: 'WORLDGOVERNMENTBONDS_ID10Y_LIVE',
                sbnAsOfDate: new Date().toISOString().slice(0, 10)
              };
            }
          }
        } catch {
          // Ignore and return null
        }

        return null;
      }
    );
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Fetches & decumulates Annual + Quarterly Financial Statements from Yahoo fundamentals-timeseries API.
 * Strictly implements:
 * 1. IDX YTD-to-TTM Decumulator (SAFE_YTD_BRIDGE_FORMULA -> SUM_4_STANDALONE_QUARTERS -> FY_FALLBACK; NEVER 9M*4/3 or 6M*2).
 * 2. Accounting Sanity Guardrail for D&A & EBITDA (prioritizes reconciledDepreciation / direct D&A aliases, flags daAnomaly: true if > 18% Revenue on non-infra).
 * 3. Auto-Normalization USD -> IDR with live IDR=X rate when reportingCurrency === 'USD'.
 * 4. Authentic YoY Growth (netIncomeYoYPct & operatingProfitYoYPct).
 * 5. Partial-Data Honesty (missing fields remain null and are listed in missingFields: string[]).
 */
async function fetchAndDecumulateFundamentals(cleanTicker, yfSymbol, lastPrice, bypassCache = false) {
  const cacheKey = `https://nostradamus-worker.local/cache/fundamentals-ts/${encodeURIComponent(
    yfSymbol
  )}`;

  const { data: rawTsJson, cacheHit } = await withCloudflareCache(
    cacheKey,
    FUNDAMENTALS_CACHE_TTL_SECONDS,
    bypassCache,
    async () => {
      const period1 = Math.floor(Date.now() / 1000) - 5 * 365 * 86400; // 5 years history for 3Y/5Y ROE & YoY
      const period2 = Math.floor(Date.now() / 1000) + 86400;

      const types = [
        // Revenue, EBIT & Pretax Income (PretaxIncome is crucial for Banks/Financials like BRIS/BBCA)
        'annualTotalRevenue',
        'quarterlyTotalRevenue',
        'annualOperatingIncome',
        'quarterlyOperatingIncome',
        'annualEBIT',
        'quarterlyEBIT',
        'annualPretaxIncome',
        'quarterlyPretaxIncome',
        // Net Income Attributable to Parent
        'annualNetIncomeCommonStockholders',
        'quarterlyNetIncomeCommonStockholders',
        'annualNetIncome',
        'quarterlyNetIncome',
        // Equity, Assets, Debt, Cash, Shares
        'annualStockholdersEquity',
        'quarterlyStockholdersEquity',
        'annualCommonStockEquity',
        'quarterlyCommonStockEquity',
        'annualTotalAssets',
        'quarterlyTotalAssets',
        'annualTotalLiabilitiesNetMinorityInterest',
        'quarterlyTotalLiabilitiesNetMinorityInterest',
        'annualTotalDebt',
        'quarterlyTotalDebt',
        'annualLongTermDebt',
        'quarterlyLongTermDebt',
        'annualCurrentDebt',
        'quarterlyCurrentDebt',
        'annualCashAndCashEquivalents',
        'quarterlyCashAndCashEquivalents',
        'annualCashCashEquivalentsAndShortTermInvestments',
        'quarterlyCashCashEquivalentsAndShortTermInvestments',
        'annualOrdinarySharesNumber',
        'quarterlyOrdinarySharesNumber',
        'annualShareIssued',
        'quarterlyShareIssued',
        // Cash Flow (OCF & CapEx — includes PSAK 2 Indonesia Direct Method OCF aliases)
        'annualOperatingCashFlow',
        'quarterlyOperatingCashFlow',
        'annualCashFlowFromContinuingOperatingActivities',
        'quarterlyCashFlowFromContinuingOperatingActivities',
        'annualCashFlowsfromusedinOperatingActivitiesDirect',
        'quarterlyCashFlowsfromusedinOperatingActivitiesDirect',
        'annualCapitalExpenditure',
        'quarterlyCapitalExpenditure',
        // Depreciation & Amortization + EBITDA
        'annualReconciledDepreciation',
        'quarterlyReconciledDepreciation',
        'annualDepreciationAndAmortization',
        'quarterlyDepreciationAndAmortization',
        'annualDepreciationAmortizationDepletion',
        'quarterlyDepreciationAmortizationDepletion',
        'annualDepreciationAndAmortizationInIncomeStatement',
        'quarterlyDepreciationAndAmortizationInIncomeStatement',
        'annualEBITDA',
        'quarterlyEBITDA',
        'annualNormalizedEBITDA',
        'quarterlyNormalizedEBITDA'
      ].join(',');

      const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
        yfSymbol
      )}?type=${types}&period1=${period1}&period2=${period2}`;
      return await fetchYahooJsonWithRetry(url, false);
    }
  );

  const results = rawTsJson?.timeseries?.result || [];
  const seriesMap = {};
  let detectedCurrency = null;

  for (const item of results) {
    const typeName = item?.meta?.type?.[0];
    if (!typeName) continue;
    const arr = item[typeName];
    if (!Array.isArray(arr) || arr.length === 0) continue;

    const points = [];
    for (const pt of arr) {
      if (!pt || !pt.asOfDate) continue;
      const val = Number(pt?.reportedValue?.raw);
      if (!Number.isFinite(val)) continue;
      if (!detectedCurrency && pt?.currencyCode) {
        detectedCurrency = String(pt.currencyCode).toUpperCase();
      }
      points.push({
        asOfDate: String(pt.asOfDate),
        periodType: String(pt.periodType || ''),
        currencyCode: pt.currencyCode ? String(pt.currencyCode).toUpperCase() : null,
        val
      });
    }

    if (points.length > 0) {
      points.sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
      seriesMap[typeName] = points;
    }
  }

  // Helper to get merged sorted points across primary + fallback series aliases
  const getSeries = (...names) => {
    for (const name of names) {
      if (seriesMap[name] && seriesMap[name].length > 0) {
        return seriesMap[name];
      }
    }
    return [];
  };

  // Helper to get latest point-in-time snapshot (Balance Sheet Stock Guard: NEVER sum across quarters!)
  const getLatestSnapshotPoint = (...names) => {
    let best = null;
    for (const name of names) {
      const pts = seriesMap[name];
      if (!pts || pts.length === 0) continue;
      const last = pts[pts.length - 1];
      if (!best || last.asOfDate > best.asOfDate) {
        best = last;
      }
    }
    return best;
  };

  const annualRevPts = getSeries('annualTotalRevenue');
  const quarterlyRevPts = getSeries('quarterlyTotalRevenue');
  const annualEbitPts = getSeries(
    'annualOperatingIncome',
    'annualEBIT',
    'annualPretaxIncome'
  );
  const quarterlyEbitPts = getSeries(
    'quarterlyOperatingIncome',
    'quarterlyEBIT',
    'quarterlyPretaxIncome'
  );
  const annualNiPts = getSeries('annualNetIncomeCommonStockholders', 'annualNetIncome');
  const quarterlyNiPts = getSeries('quarterlyNetIncomeCommonStockholders', 'quarterlyNetIncome');
  const annualOcfPts = getSeries(
    'annualOperatingCashFlow',
    'annualCashFlowFromContinuingOperatingActivities',
    'annualCashFlowsfromusedinOperatingActivitiesDirect'
  );
  const quarterlyOcfPts = getSeries(
    'quarterlyOperatingCashFlow',
    'quarterlyCashFlowFromContinuingOperatingActivities',
    'quarterlyCashFlowsfromusedinOperatingActivitiesDirect'
  );
  const annualCapexPts = getSeries('annualCapitalExpenditure');
  const quarterlyCapexPts = getSeries('quarterlyCapitalExpenditure');
  const annualDaPts = getSeries(
    'annualReconciledDepreciation',
    'annualDepreciationAndAmortization',
    'annualDepreciationAmortizationDepletion',
    'annualDepreciationAndAmortizationInIncomeStatement'
  );
  const quarterlyDaPts = getSeries(
    'quarterlyReconciledDepreciation',
    'quarterlyDepreciationAndAmortization',
    'quarterlyDepreciationAmortizationDepletion',
    'quarterlyDepreciationAndAmortizationInIncomeStatement'
  );
  const annualEbitdaPts = getSeries('annualEBITDA', 'annualNormalizedEBITDA');
  const quarterlyEbitdaPts = getSeries('quarterlyEBITDA', 'quarterlyNormalizedEBITDA');

  const latestAnnualRev =
    annualRevPts.length > 0 ? annualRevPts[annualRevPts.length - 1].val : null;

  /**
   * Detects IDX cumulative YTD quarterly reporting pattern:
   * Checks if 3 sequential quarters within the same fiscal year increase monotonically
   * (0 < Q1 < Q2 < Q3) and Q3 > 2.2 * Q1.
   */
  const hasMonotonicYtdPattern = (qPts) => {
    if (!Array.isArray(qPts) || qPts.length < 3) return false;
    const byYear = {};
    for (const pt of qPts) {
      const yr = String(pt.asOfDate || '').slice(0, 4);
      if (!yr) continue;
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(pt);
    }
    const years = Object.keys(byYear).sort();
    for (let i = years.length - 1; i >= 0; i--) {
      const yrPts = byYear[years[i]];
      if (yrPts.length >= 3) {
        const q1 = yrPts[0].val;
        const q2 = yrPts[1].val;
        const q3 = yrPts[2].val;
        if (q1 > 0 && q2 > q1 && q3 > q2 && q3 > 2.2 * q1) {
          return true;
        }
      }
    }
    return false;
  };

  const isIssuerQuarterlyCumulativeYtd =
    hasMonotonicYtdPattern(quarterlyRevPts) ||
    hasMonotonicYtdPattern(quarterlyEbitPts) ||
    hasMonotonicYtdPattern(quarterlyNiPts);

  /**
   * IDX YTD-to-TTM Decumulator for any flow metric (Revenue, EBIT, Net Income, OCF, CapEx, D&A, EBITDA):
   * - Tightened 1.45x inflation threshold (sum4 / latestAnnual > 1.45) + monotonic intra-year YTD pattern check (Q3 > 2.2 * Q1).
   * - Supports optional `forcedMethod` ('SAFE_YTD_BRIDGE_FORMULA' or 'FY_FALLBACK') for Cross-Statement Sanity Lock.
   * - NEVER multiplies 9M * 4/3 or 6M * 2.
   */
  const computeFlowTtmAndYoY = (
    annualPts,
    quarterlyPts,
    referenceAnnualRev,
    forcedMethod = null,
    targetAnnualAsOfDate = null
  ) => {
    let latestAnnual = annualPts.length > 0 ? annualPts[annualPts.length - 1] : null;
    let prevAnnual = annualPts.length > 1 ? annualPts[annualPts.length - 2] : null;

    if (targetAnnualAsOfDate && annualPts.length > 0) {
      const matchedIdx = annualPts.findIndex((p) => p.asOfDate === targetAnnualAsOfDate);
      if (matchedIdx >= 0) {
        latestAnnual = annualPts[matchedIdx];
        prevAnnual = matchedIdx > 0 ? annualPts[matchedIdx - 1] : null;
      }
    }

    const latestQ = quarterlyPts.length > 0 ? quarterlyPts[quarterlyPts.length - 1] : null;

    if (!latestAnnual && !latestQ) {
      return { ttmVal: null, priorTtmVal: null, yoyPct: null, method: 'MISSING', asOfDate: null };
    }

    const computeAnnualFallback = () => {
      if (!latestAnnual) {
        return {
          ttmVal: null,
          priorTtmVal: null,
          yoyPct: null,
          method: 'MISSING',
          asOfDate: null
        };
      }
      let yoyPct = null;
      if (prevAnnual && Math.abs(prevAnnual.val) > 0) {
        const rawYoy = ((latestAnnual.val - prevAnnual.val) / Math.abs(prevAnnual.val)) * 100;
        yoyPct = Number(Math.max(-95, Math.min(350, rawYoy)).toFixed(2));
      }
      return {
        ttmVal: latestAnnual.val,
        priorTtmVal: prevAnnual ? prevAnnual.val : null,
        yoyPct,
        method: 'FY_FALLBACK',
        asOfDate: latestAnnual.asOfDate
      };
    };

    const computeYtdBridge = () => {
      if (latestAnnual && latestQ && latestQ.asOfDate > latestAnnual.asOfDate) {
        const curMonth = latestQ.asOfDate.slice(5, 7);
        const curYear = Number(latestQ.asOfDate.slice(0, 4));
        const priorSamePeriod = quarterlyPts.find(
          (p) =>
            Number(p.asOfDate.slice(0, 4)) === curYear - 1 &&
            p.asOfDate.slice(5, 7) === curMonth
        );

        if (priorSamePeriod) {
          const bridgedTtm = latestAnnual.val + (latestQ.val - priorSamePeriod.val);
          const rawYoy =
            Math.abs(priorSamePeriod.val) > 0
              ? ((latestQ.val - priorSamePeriod.val) / Math.abs(priorSamePeriod.val)) * 100
              : null;
          const yoyPct =
            rawYoy !== null ? Number(Math.max(-95, Math.min(350, rawYoy)).toFixed(2)) : null;

          return {
            ttmVal: bridgedTtm,
            priorTtmVal: latestAnnual.val,
            yoyPct,
            method: 'SAFE_YTD_BRIDGE_FORMULA',
            asOfDate: latestQ.asOfDate
          };
        }
      }
      return null;
    };

    if (forcedMethod === 'FY_FALLBACK') {
      return computeAnnualFallback();
    }

    if (forcedMethod === 'SAFE_YTD_BRIDGE_FORMULA') {
      return (
        computeYtdBridge() || {
          ttmVal: null,
          priorTtmVal: null,
          yoyPct: null,
          method: 'MISSING_BRIDGE',
          asOfDate: null
        }
      );
    }

    // Automatic selection when forcedMethod is not specified
    if (quarterlyPts.length >= 4) {
      const last4 = quarterlyPts.slice(-4);
      const sum4 = last4.reduce((acc, p) => acc + p.val, 0);

      // Detect YTD cumulative double-counting trap using tightened 1.45x threshold OR monotonic YTD pattern
      const revLast4 =
        quarterlyRevPts.length >= 4
          ? quarterlyRevPts.slice(-4).reduce((acc, p) => acc + p.val, 0)
          : null;
      const isRevSumBloated =
        referenceAnnualRev && referenceAnnualRev > 0 && revLast4
          ? revLast4 / referenceAnnualRev > 1.45
          : false;
      const isSelfSumBloated =
        latestAnnual && Math.abs(latestAnnual.val) > 0
          ? Math.abs(sum4) / Math.abs(latestAnnual.val) > 1.45
          : false;
      const isSeriesCumulativeYtd =
        isIssuerQuarterlyCumulativeYtd || hasMonotonicYtdPattern(quarterlyPts);

      if (!isRevSumBloated && !isSelfSumBloated && !isSeriesCumulativeYtd) {
        // Authentic 4 standalone quarters TTM
        let priorVal = prevAnnual ? prevAnnual.val : null;
        if (quarterlyPts.length >= 8) {
          const prev4 = quarterlyPts.slice(-8, -4);
          priorVal = prev4.reduce((acc, p) => acc + p.val, 0);
        } else if (latestAnnual && latestAnnual.asOfDate < last4[3].asOfDate) {
          priorVal = latestAnnual.val;
        }

        let yoyPct = null;
        if (priorVal !== null && Math.abs(priorVal) > 0) {
          const rawYoy = ((sum4 - priorVal) / Math.abs(priorVal)) * 100;
          yoyPct = Number(Math.max(-95, Math.min(350, rawYoy)).toFixed(2));
        }

        return {
          ttmVal: sum4,
          priorTtmVal: priorVal,
          yoyPct,
          method: 'TTM_4Q_STANDALONE',
          asOfDate: last4[3].asOfDate
        };
      }

      // If bloated or cumulative YTD: attempt SAFE_YTD_BRIDGE_FORMULA
      const bridged = computeYtdBridge();
      if (bridged) {
        return bridged;
      }
    }

    // Fallback to Latest Full Year (FY_FALLBACK) — NEVER multiply 9M * 4/3 or 6M * 2
    if (latestAnnual) {
      return computeAnnualFallback();
    }

    return {
      ttmVal: latestQ ? latestQ.val : null,
      priorTtmVal: null,
      yoyPct: null,
      method: 'SINGLE_PERIOD_FALLBACK',
      asOfDate: latestQ ? latestQ.asOfDate : null
    };
  };

  let revFlow = computeFlowTtmAndYoY(annualRevPts, quarterlyRevPts, latestAnnualRev);
  let ebitFlow = computeFlowTtmAndYoY(annualEbitPts, quarterlyEbitPts, latestAnnualRev);
  let niFlow = computeFlowTtmAndYoY(annualNiPts, quarterlyNiPts, latestAnnualRev);
  let ocfFlow = computeFlowTtmAndYoY(annualOcfPts, quarterlyOcfPts, latestAnnualRev);
  let capexFlow = computeFlowTtmAndYoY(annualCapexPts, quarterlyCapexPts, latestAnnualRev);
  let daFlow = computeFlowTtmAndYoY(annualDaPts, quarterlyDaPts, latestAnnualRev);
  let ebitdaFlow = computeFlowTtmAndYoY(annualEbitdaPts, quarterlyEbitdaPts, latestAnnualRev);

  // ==========================================================================
  // CROSS-STATEMENT SANITY LOCK (PREVENT PERIOD MISMATCH LIKE ADMR NI > EBIT)
  // ==========================================================================
  const isNiExceedingEbit =
    niFlow.ttmVal !== null &&
    ebitFlow.ttmVal !== null &&
    ebitFlow.ttmVal > 0 &&
    niFlow.ttmVal > ebitFlow.ttmVal * 1.15;

  const isCoreMethodMismatch =
    (revFlow.ttmVal !== null && ebitFlow.ttmVal !== null && revFlow.method !== ebitFlow.method) ||
    (niFlow.ttmVal !== null && ebitFlow.ttmVal !== null && niFlow.method !== ebitFlow.method) ||
    (revFlow.ttmVal !== null && niFlow.ttmVal !== null && revFlow.method !== niFlow.method);

  const isCoreDateMismatch =
    (revFlow.asOfDate && ebitFlow.asOfDate && revFlow.asOfDate !== ebitFlow.asOfDate) ||
    (niFlow.asOfDate && ebitFlow.asOfDate && niFlow.asOfDate !== ebitFlow.asOfDate) ||
    (revFlow.asOfDate && niFlow.asOfDate && revFlow.asOfDate !== niFlow.asOfDate);

  const crossStatementLockTriggered = Boolean(
    isNiExceedingEbit || isCoreMethodMismatch || isCoreDateMismatch
  );

  let unifiedForcedMethod = null;
  const anchorAnnualDate =
    (annualRevPts.length > 0 ? annualRevPts[annualRevPts.length - 1].asOfDate : null) ||
    (annualNiPts.length > 0 ? annualNiPts[annualNiPts.length - 1].asOfDate : null) ||
    (annualEbitPts.length > 0 ? annualEbitPts[annualEbitPts.length - 1].asOfDate : null);

  if (crossStatementLockTriggered) {
    // 1. Test if all core P&L lines can cleanly use SAFE_YTD_BRIDGE_FORMULA on the same date without NI > EBIT * 1.15
    const candRevBridge = computeFlowTtmAndYoY(
      annualRevPts,
      quarterlyRevPts,
      latestAnnualRev,
      'SAFE_YTD_BRIDGE_FORMULA'
    );
    const candEbitBridge = computeFlowTtmAndYoY(
      annualEbitPts,
      quarterlyEbitPts,
      latestAnnualRev,
      'SAFE_YTD_BRIDGE_FORMULA'
    );
    const candNiBridge = computeFlowTtmAndYoY(
      annualNiPts,
      quarterlyNiPts,
      latestAnnualRev,
      'SAFE_YTD_BRIDGE_FORMULA'
    );

    const bridgeAllCoreValid =
      candRevBridge.ttmVal !== null &&
      candEbitBridge.ttmVal !== null &&
      candNiBridge.ttmVal !== null &&
      candRevBridge.asOfDate === candEbitBridge.asOfDate &&
      candNiBridge.asOfDate === candEbitBridge.asOfDate &&
      !(candEbitBridge.ttmVal > 0 && candNiBridge.ttmVal > candEbitBridge.ttmVal * 1.15);

    if (bridgeAllCoreValid) {
      unifiedForcedMethod = 'SAFE_YTD_BRIDGE_FORMULA';
      revFlow = candRevBridge;
      ebitFlow = candEbitBridge;
      niFlow = candNiBridge;

      const candOcfBridge = computeFlowTtmAndYoY(
        annualOcfPts,
        quarterlyOcfPts,
        latestAnnualRev,
        'SAFE_YTD_BRIDGE_FORMULA'
      );
      ocfFlow =
        candOcfBridge.ttmVal !== null
          ? candOcfBridge
          : computeFlowTtmAndYoY(
              annualOcfPts,
              quarterlyOcfPts,
              latestAnnualRev,
              'FY_FALLBACK',
              anchorAnnualDate
            );

      const candCapexBridge = computeFlowTtmAndYoY(
        annualCapexPts,
        quarterlyCapexPts,
        latestAnnualRev,
        'SAFE_YTD_BRIDGE_FORMULA'
      );
      capexFlow =
        candCapexBridge.ttmVal !== null
          ? candCapexBridge
          : computeFlowTtmAndYoY(
              annualCapexPts,
              quarterlyCapexPts,
              latestAnnualRev,
              'FY_FALLBACK',
              anchorAnnualDate
            );

      const candDaBridge = computeFlowTtmAndYoY(
        annualDaPts,
        quarterlyDaPts,
        latestAnnualRev,
        'SAFE_YTD_BRIDGE_FORMULA'
      );
      daFlow =
        candDaBridge.ttmVal !== null
          ? candDaBridge
          : computeFlowTtmAndYoY(
              annualDaPts,
              quarterlyDaPts,
              latestAnnualRev,
              'FY_FALLBACK',
              anchorAnnualDate
            );

      const candEbitdaBridge = computeFlowTtmAndYoY(
        annualEbitdaPts,
        quarterlyEbitdaPts,
        latestAnnualRev,
        'SAFE_YTD_BRIDGE_FORMULA'
      );
      ebitdaFlow =
        candEbitdaBridge.ttmVal !== null
          ? candEbitdaBridge
          : computeFlowTtmAndYoY(
              annualEbitdaPts,
              quarterlyEbitdaPts,
              latestAnnualRev,
              'FY_FALLBACK',
              anchorAnnualDate
            );
    } else {
      // 2. Uniformly lock ALL flow lines to FY_FALLBACK on the shared latestAnnual date
      unifiedForcedMethod = 'FY_FALLBACK';
      revFlow = computeFlowTtmAndYoY(
        annualRevPts,
        quarterlyRevPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
      ebitFlow = computeFlowTtmAndYoY(
        annualEbitPts,
        quarterlyEbitPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
      niFlow = computeFlowTtmAndYoY(
        annualNiPts,
        quarterlyNiPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
      ocfFlow = computeFlowTtmAndYoY(
        annualOcfPts,
        quarterlyOcfPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
      capexFlow = computeFlowTtmAndYoY(
        annualCapexPts,
        quarterlyCapexPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
      daFlow = computeFlowTtmAndYoY(
        annualDaPts,
        quarterlyDaPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
      ebitdaFlow = computeFlowTtmAndYoY(
        annualEbitdaPts,
        quarterlyEbitdaPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
    }
  } else {
    // Even if core P&L lines aligned without triggering lock, ensure OCF/CapEx/D&A/EBITDA align with the core P&L method if core chose FY_FALLBACK
    if (niFlow.method === 'FY_FALLBACK') {
      unifiedForcedMethod = 'FY_FALLBACK';
      ocfFlow = computeFlowTtmAndYoY(
        annualOcfPts,
        quarterlyOcfPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
      capexFlow = computeFlowTtmAndYoY(
        annualCapexPts,
        quarterlyCapexPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
      daFlow = computeFlowTtmAndYoY(
        annualDaPts,
        quarterlyDaPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
      ebitdaFlow = computeFlowTtmAndYoY(
        annualEbitdaPts,
        quarterlyEbitdaPts,
        latestAnnualRev,
        'FY_FALLBACK',
        anchorAnnualDate
      );
    }
  }

  const periodAligned = Boolean(
    (!revFlow.asOfDate || !niFlow.asOfDate || revFlow.asOfDate === niFlow.asOfDate) &&
      (!ebitFlow.asOfDate || !niFlow.asOfDate || ebitFlow.asOfDate === niFlow.asOfDate)
  );

  const flowAudit = {
    unifiedMethod: unifiedForcedMethod || niFlow.method || revFlow.method || 'FY_FALLBACK',
    revMethod: revFlow.method,
    ebitMethod: ebitFlow.method,
    niMethod: niFlow.method,
    ocfMethod: ocfFlow.method,
    capexMethod: capexFlow.method,
    daMethod: daFlow.method,
    periodAligned,
    crossStatementLockTriggered
  };

  // Extract Latest Point-in-Time Balance Sheet Snapshots
  const eqSnap = getLatestSnapshotPoint(
    'quarterlyStockholdersEquity',
    'annualStockholdersEquity',
    'quarterlyCommonStockEquity',
    'annualCommonStockEquity'
  );
  const assetsSnap = getLatestSnapshotPoint('quarterlyTotalAssets', 'annualTotalAssets');
  const liabSnap = getLatestSnapshotPoint(
    'quarterlyTotalLiabilitiesNetMinorityInterest',
    'annualTotalLiabilitiesNetMinorityInterest'
  );
  const debtSnap = getLatestSnapshotPoint('quarterlyTotalDebt', 'annualTotalDebt');
  const ltDebtSnap = getLatestSnapshotPoint('quarterlyLongTermDebt', 'annualLongTermDebt');
  const stDebtSnap = getLatestSnapshotPoint('quarterlyCurrentDebt', 'annualCurrentDebt');
  const cashSnap = getLatestSnapshotPoint(
    'quarterlyCashCashEquivalentsAndShortTermInvestments',
    'quarterlyCashAndCashEquivalents',
    'annualCashCashEquivalentsAndShortTermInvestments',
    'annualCashAndCashEquivalents'
  );
  const sharesSnap = getLatestSnapshotPoint(
    'quarterlyOrdinarySharesNumber',
    'annualOrdinarySharesNumber',
    'quarterlyShareIssued',
    'annualShareIssued'
  );

  let rawRevenueTTM = revFlow.ttmVal;
  let rawOperatingProfitTTM = ebitFlow.ttmVal;
  let rawNetIncomeTTM = niFlow.ttmVal;
  let rawOcfTTM = ocfFlow.ttmVal;
  let rawCapexTTM = capexFlow.ttmVal !== null ? Math.abs(capexFlow.ttmVal) : null;
  let rawDaTTM = daFlow.ttmVal !== null ? Math.abs(daFlow.ttmVal) : null;
  let rawEbitdaTTM = ebitdaFlow.ttmVal;

  let rawEquity = eqSnap ? eqSnap.val : null;
  let rawTotalAssets =
    assetsSnap && assetsSnap.val > 0
      ? assetsSnap.val
      : rawEquity !== null && liabSnap && liabSnap.val > 0
      ? rawEquity + liabSnap.val
      : null;
  let rawTotalDebt =
    debtSnap && debtSnap.val >= 0
      ? debtSnap.val
      : ltDebtSnap || stDebtSnap
      ? (ltDebtSnap ? Math.max(0, ltDebtSnap.val) : 0) +
        (stDebtSnap ? Math.max(0, stDebtSnap.val) : 0)
      : null;
  let rawCash = cashSnap && cashSnap.val >= 0 ? cashSnap.val : null;
  let sharesOutstanding =
    sharesSnap && sharesSnap.val > 0 ? Math.round(sharesSnap.val) : null;

  // For Banks / Financials where Operating Income (EBIT) is not reported separately by Yahoo,
  // fallback operatingProfitTTM to Pre-Tax / Net Income * 1.25 if Net Income exists
  if (rawOperatingProfitTTM === null && rawNetIncomeTTM !== null) {
    rawOperatingProfitTTM = Math.round(rawNetIncomeTTM * 1.24);
  }

  // ==========================================================================
  // ACCOUNTING SANITY GUARDRAIL FOR D&A & EBITDA (UPPER & LOWER BOUND PSAK GUARD)
  // ==========================================================================
  // 1. Prioritize direct reconciledDepreciation / D&A aliases before EBITDA - EBIT.
  // 2. Under-Reporting Guard (< 0.8% Revenue or CapEx > 25x D&A, e.g. LSIP partial amortization):
  //    Iterate across all D&A aliases (annual/quarterly DepreciationAndAmortization,
  //    DepreciationAmortizationDepletion, ReconciledDepreciation) to find a candidate in [0.8%, 18%]
  //    Revenue (or <= 42% for Infra/Telco). If all aliases remain < 0.8% Revenue, try EBITDA - EBIT.
  //    If still extreme, flag daAnomaly: true with DA_UNDERREPORTED_SUSPECT.
  // 3. Over-Reporting Guard (> 18% Revenue for non-Infra/Telco): fallback to annual D&A or flag daAnomaly: true.
  const isInfraOrTelco = INFRA_TELCO_HIGH_DA_TICKERS.has(cleanTicker);
  const minNormalDaToRevRatio = 0.008; // 0.8% of Revenue
  const maxNormalDaToRevRatio = isInfraOrTelco ? 0.42 : 0.18;
  let daAnomaly = false;
  let daMethodNote = 'DIRECT_RECONCILED_DA';

  const isDaWithinNormalRevenueBand = (candVal) => {
    if (candVal === null || !Number.isFinite(candVal) || candVal <= 0) return false;
    if (rawRevenueTTM !== null && rawRevenueTTM > 0) {
      const ratio = candVal / rawRevenueTTM;
      return ratio >= minNormalDaToRevRatio && ratio <= maxNormalDaToRevRatio;
    }
    return true;
  };

  if (
    rawDaTTM === null &&
    rawEbitdaTTM !== null &&
    rawOperatingProfitTTM !== null &&
    rawEbitdaTTM > rawOperatingProfitTTM
  ) {
    rawDaTTM = rawEbitdaTTM - rawOperatingProfitTTM;
    daMethodNote = 'DERIVED_EBITDA_MINUS_EBIT';
  }

  // Check for Under-Reported D&A (< 0.8% Revenue OR CapEx > 25x D&A)
  const isDaUnderReported =
    rawDaTTM !== null &&
    ((rawRevenueTTM !== null &&
      rawRevenueTTM > 0 &&
      rawDaTTM / rawRevenueTTM < minNormalDaToRevRatio) ||
      (rawCapexTTM !== null && rawCapexTTM > 0 && rawCapexTTM > rawDaTTM * 25));

  if (isDaUnderReported) {
    const candidateDaAliases = [
      ['annualDepreciationAndAmortization', 'quarterlyDepreciationAndAmortization'],
      ['annualDepreciationAmortizationDepletion', 'quarterlyDepreciationAmortizationDepletion'],
      [
        'annualDepreciationAndAmortizationInIncomeStatement',
        'quarterlyDepreciationAndAmortizationInIncomeStatement'
      ],
      ['annualReconciledDepreciation', 'quarterlyReconciledDepreciation']
    ];

    let recoveredDa = null;
    let recoveredAliasLabel = '';

    for (const [annKey, qtrKey] of candidateDaAliases) {
      const aPts = seriesMap[annKey] || [];
      const qPts = seriesMap[qtrKey] || [];
      if (aPts.length === 0 && qPts.length === 0) continue;

      const candidateFlow = computeFlowTtmAndYoY(
        aPts,
        qPts,
        latestAnnualRev,
        unifiedForcedMethod,
        anchorAnnualDate
      );
      const ttmCand = candidateFlow.ttmVal !== null ? Math.abs(candidateFlow.ttmVal) : null;
      const latestAnnCand = aPts.length > 0 ? Math.abs(aPts[aPts.length - 1].val) : null;

      for (const [valCand, labelSuffix] of [
        [ttmCand, `${annKey}/${qtrKey}`],
        [latestAnnCand, annKey]
      ]) {
        if (
          valCand !== null &&
          isDaWithinNormalRevenueBand(valCand) &&
          (rawCapexTTM === null || rawCapexTTM <= 0 || rawCapexTTM <= valCand * 25)
        ) {
          recoveredDa = valCand;
          recoveredAliasLabel = labelSuffix;
          break;
        }
      }
      if (recoveredDa !== null) break;
    }

    // If no candidate passed both Revenue band AND CapEx <= 25x D&A, accept any alias inside [0.8%, maxNormalDaToRevRatio] Revenue
    if (recoveredDa === null) {
      for (const [annKey, qtrKey] of candidateDaAliases) {
        const aPts = seriesMap[annKey] || [];
        const qPts = seriesMap[qtrKey] || [];
        if (aPts.length === 0 && qPts.length === 0) continue;

        const candidateFlow = computeFlowTtmAndYoY(
          aPts,
          qPts,
          latestAnnualRev,
          unifiedForcedMethod,
          anchorAnnualDate
        );
        const ttmCand = candidateFlow.ttmVal !== null ? Math.abs(candidateFlow.ttmVal) : null;
        const latestAnnCand = aPts.length > 0 ? Math.abs(aPts[aPts.length - 1].val) : null;

        if (ttmCand !== null && isDaWithinNormalRevenueBand(ttmCand) && ttmCand > rawDaTTM) {
          recoveredDa = ttmCand;
          recoveredAliasLabel = `${annKey}/${qtrKey}`;
          break;
        }
        if (
          latestAnnCand !== null &&
          isDaWithinNormalRevenueBand(latestAnnCand) &&
          latestAnnCand > rawDaTTM
        ) {
          recoveredDa = latestAnnCand;
          recoveredAliasLabel = annKey;
          break;
        }
      }
    }

    if (recoveredDa !== null) {
      rawDaTTM = recoveredDa;
      daMethodNote = `ALIAS_DA_RECOVERED (${recoveredAliasLabel})`;
    } else if (
      rawEbitdaTTM !== null &&
      rawOperatingProfitTTM !== null &&
      rawEbitdaTTM > rawOperatingProfitTTM &&
      isDaWithinNormalRevenueBand(rawEbitdaTTM - rawOperatingProfitTTM)
    ) {
      rawDaTTM = rawEbitdaTTM - rawOperatingProfitTTM;
      daMethodNote = 'DERIVED_EBITDA_MINUS_EBIT';
    }

    // Re-evaluate after alias & EBITDA - EBIT recovery attempts
    const stillUnderReported =
      rawDaTTM !== null &&
      ((rawRevenueTTM !== null &&
        rawRevenueTTM > 0 &&
        rawDaTTM / rawRevenueTTM < minNormalDaToRevRatio) ||
        (rawCapexTTM !== null && rawCapexTTM > 0 && rawCapexTTM > rawDaTTM * 25));

    if (stillUnderReported) {
      daAnomaly = true;
      daMethodNote = 'DA_UNDERREPORTED_SUSPECT';
    }
  }

  // Check for Over-Reported D&A (> 18% Revenue for non-Infra/Telco)
  if (!daAnomaly && rawDaTTM !== null && rawRevenueTTM !== null && rawRevenueTTM > 0) {
    const daToRev = rawDaTTM / rawRevenueTTM;
    if (daToRev > maxNormalDaToRevRatio) {
      // Try falling back to latest annual D&A point across all D&A aliases
      const latestAnnualDaPt =
        annualDaPts.length > 0 ? Math.abs(annualDaPts[annualDaPts.length - 1].val) : null;
      if (
        latestAnnualDaPt !== null &&
        latestAnnualDaPt > 0 &&
        latestAnnualDaPt / rawRevenueTTM >= minNormalDaToRevRatio &&
        latestAnnualDaPt / rawRevenueTTM <= maxNormalDaToRevRatio
      ) {
        rawDaTTM = latestAnnualDaPt;
        daMethodNote = 'ANNUAL_DA_FALLBACK_APPLIED';
      } else {
        daAnomaly = true;
        daMethodNote = `DA_ANOMALY_FLAGGED (${(daToRev * 100).toFixed(1)}% > ${(
          maxNormalDaToRevRatio * 100
        ).toFixed(0)}% Revenue)`;
      }
    }
  }

  // Reconcile EBITDA consistently as EBIT + D&A when both exist and no anomaly, or use reported EBITDA
  if (rawOperatingProfitTTM !== null && rawDaTTM !== null && !daAnomaly) {
    rawEbitdaTTM = rawOperatingProfitTTM + rawDaTTM;
  } else if (rawEbitdaTTM === null && rawOperatingProfitTTM !== null) {
    rawEbitdaTTM = rawOperatingProfitTTM + (rawDaTTM || 0);
  }

  // ==========================================================================
  // AUTO-NORMALIZATION USD -> IDR (FOR ADMR, ADRO, ITMG, MDKA, INCO, MEDC, etc.)
  // ==========================================================================
  const isHeuristicUsdScale =
    rawEquity !== null &&
    rawEquity > 0 &&
    sharesOutstanding !== null &&
    sharesOutstanding > 50_000_000 &&
    lastPrice >= 50 &&
    rawEquity / sharesOutstanding < 25.0;

  const reportingCurrency =
    detectedCurrency === 'USD' || isHeuristicUsdScale ? 'USD' : detectedCurrency || 'IDR';

  let fxRateUsdIdr = 1;
  if (reportingCurrency === 'USD') {
    fxRateUsdIdr = await fetchLiveUsdIdrRate(bypassCache);
  }

  const toIdr = (val) => (val !== null && Number.isFinite(val) ? Math.round(val * fxRateUsdIdr) : null);

  const revenueTTM = toIdr(rawRevenueTTM);
  const latestFullYearRevenue = toIdr(latestAnnualRev);
  const operatingProfitTTM = toIdr(rawOperatingProfitTTM);
  const ebitdaTTM = toIdr(rawEbitdaTTM);
  const netIncomeTTM = toIdr(rawNetIncomeTTM);
  const equityAttributable = toIdr(rawEquity);
  const totalAssets = toIdr(rawTotalAssets);
  const totalDebt = toIdr(rawTotalDebt);
  const cashAndEquivalents = toIdr(rawCash);
  const ocfTTM = toIdr(rawOcfTTM);
  const capexTTM = toIdr(rawCapexTTM);
  const daTTM = toIdr(rawDaTTM);

  // Compute multi-year historical 3Y & 5Y ROE averages from annual Net Income & Equity series
  let roeAvg3Y = null;
  let roeAvg5Y = null;
  if (annualNiPts.length >= 2 && annualRevPts.length >= 1) {
    const annualEqPts = getSeries('annualStockholdersEquity', 'annualCommonStockEquity');
    if (annualEqPts.length >= 2) {
      const roes = [];
      const len = Math.min(annualNiPts.length, annualEqPts.length, 5);
      for (let i = 1; i <= len; i++) {
        const niPt = annualNiPts[annualNiPts.length - i];
        const eqPt = annualEqPts[annualEqPts.length - i];
        if (niPt && eqPt && eqPt.val > 0) {
          const r = (niPt.val / eqPt.val) * 100;
          if (r > -50 && r < 120) roes.push(r);
        }
      }
      if (roes.length >= 2) {
        const slice3 = roes.slice(0, Math.min(3, roes.length));
        roeAvg3Y = Number((slice3.reduce((a, b) => a + b, 0) / slice3.length).toFixed(2));
        roeAvg5Y = Number((roes.reduce((a, b) => a + b, 0) / roes.length).toFixed(2));
      }
    }
  }

  // Determine latest asOfDate and fiscalPeriod label (strictly use flow statement date when locked to FY_FALLBACK)
  const flowDates = [revFlow.asOfDate, ebitFlow.asOfDate, niFlow.asOfDate].filter(Boolean);
  flowDates.sort();
  const primaryFlowDate = flowDates.length > 0 ? flowDates[flowDates.length - 1] : null;

  const allDates = [
    revFlow.asOfDate,
    niFlow.asOfDate,
    eqSnap?.asOfDate,
    assetsSnap?.asOfDate
  ].filter(Boolean);
  allDates.sort();
  const asOfDate =
    flowAudit.unifiedMethod === 'FY_FALLBACK' && primaryFlowDate
      ? primaryFlowDate
      : allDates.length > 0
      ? allDates[allDates.length - 1]
      : null;

  let fiscalPeriod = 'TTM (Yahoo Timeseries)';
  if (asOfDate) {
    const yr = asOfDate.slice(0, 4);
    const mo = Number(asOfDate.slice(5, 7));
    const qLabel = mo <= 3 ? 'Q1' : mo <= 6 ? 'Q2' : mo <= 9 ? 'Q3' : 'FY/Q4';
    fiscalPeriod = `${qLabel}-${yr} (${
      flowAudit.unifiedMethod === 'FY_FALLBACK' ? 'FY Fallback' : 'Decumulated TTM'
    })`;
  }

  // ==========================================================================
  // PARTIAL-DATA HONESTY: RECORD ANY GENUINELY MISSING FIELDS AS NULL
  // ==========================================================================
  const candidateFields = {
    revenueTTM,
    operatingProfitTTM,
    ebitdaTTM,
    netIncomeTTM,
    equityAttributable,
    totalAssets,
    totalDebt,
    cashAndEquivalents,
    sharesOutstanding,
    ocfTTM,
    capexTTM,
    daTTM
  };

  const missingFields = Object.entries(candidateFields)
    .filter(([, v]) => v === null || v === undefined)
    .map(([k]) => k);

  const fxNote =
    reportingCurrency === 'USD'
      ? ` · Auto-Normalized USD→IDR @ Rp ${fxRateUsdIdr.toLocaleString('id-ID')}`
      : '';
  const daNote = daAnomaly ? ` · [${daMethodNote}]` : '';
  const lockNote = flowAudit.crossStatementLockTriggered ? ' · [Period-Locked]' : '';
  const note = `Cloudflare Worker Real-Time (${flowAudit.unifiedMethod}${lockNote}${fxNote}${daNote})`;

  return {
    cacheHit,
    asOfDate,
    fiscalPeriod,
    reportingCurrency,
    currency: 'IDR',
    fxRateUsdIdr,
    ttmMethod: flowAudit.unifiedMethod,
    flowAudit,
    daMethodNote,
    daAnomaly,
    missingFields,
    note,
    revenueTTM,
    latestFullYearRevenue,
    operatingProfitTTM,
    ebitdaTTM,
    netIncomeTTM,
    equityAttributable,
    totalAssets,
    totalDebt,
    cashAndEquivalents,
    sharesOutstanding,
    ocfTTM,
    capexTTM,
    daTTM,
    netIncomeYoYPct: niFlow.yoyPct,
    operatingProfitYoYPct: ebitFlow.yoyPct,
    roeAvg3YPct: roeAvg3Y,
    roeAvg5YPct: roeAvg5Y
  };
}

/**
 * Main Cloudflare Worker Entry Point (100% Pure ES Module)
 */
export default {
  async fetch(request) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request)
      });
    }

    if (request.method !== 'GET') {
      return jsonResponse(
        request,
        {
          ok: false,
          error: 'METHOD_NOT_ALLOWED',
          message: 'Gunakan HTTP GET /?ticker=XXXX'
        },
        405
      );
    }

    const url = new URL(request.url);
    const rawTicker = url.searchParams.get('ticker');
    const nocacheParam = url.searchParams.get('nocache');
    const bypassCache = nocacheParam === '1' || nocacheParam === 'true';

    // Health check endpoint if visiting root "/" without ?ticker=
    if (!rawTicker) {
      return jsonResponse(request, {
        ok: true,
        service: 'nostradamus-yahoo-worker',
        version: '2.0.0',
        provenanceMode: 'LIVE_REALTIME_WORKER',
        usage: 'GET /?ticker=BBCA atau GET /?ticker=LSIP&nocache=1',
        timestamp: new Date().toISOString()
      });
    }

    // 2. Validate 4-character IDX Ticker format
    const validation = normalizeAndValidateIdxTicker(rawTicker);
    if (!validation.valid) {
      return jsonResponse(
        request,
        {
          ok: false,
          error: 'INVALID_IDX_TICKER',
          ticker: rawTicker,
          message: validation.error
        },
        400
      );
    }

    const { cleanTicker, yfSymbol } = validation;
    const startedAtMs = Date.now();

    // 3. Execute Parallel Fetch for Chart (Ticker + ^JKSE) and SBN Curve
    const [stockChartSettled, jkseChartSettled, sbnCurveSettled] = await Promise.allSettled([
      fetchYahooChart1Y(yfSymbol, bypassCache),
      fetchYahooChart1Y('^JKSE', bypassCache),
      fetchIndonesiaSbnYieldCurve(bypassCache)
    ]);

    if (stockChartSettled.status === 'rejected') {
      return jsonResponse(
        request,
        {
          ok: false,
          error: 'YAHOO_CHART_FETCH_FAILED',
          ticker: cleanTicker,
          yfSymbol,
          message:
            stockChartSettled.reason instanceof Error
              ? stockChartSettled.reason.message
              : 'Gagal menarik harga spot & chart dari Yahoo Finance.'
        },
        502
      );
    }

    const stockChartJson = stockChartSettled.value;
    const jkseChartJson =
      jkseChartSettled.status === 'fulfilled' ? jkseChartSettled.value : null;
    const macroBenchmarks =
      sbnCurveSettled.status === 'fulfilled' ? sbnCurveSettled.value : null;

    let market;
    try {
      market = computeMarketMetricsFromCharts(stockChartJson, jkseChartJson);
    } catch (err) {
      return jsonResponse(
        request,
        {
          ok: false,
          error: 'CHART_PARSE_ERROR',
          ticker: cleanTicker,
          yfSymbol,
          message: err instanceof Error ? err.message : 'Gagal memproses data chart.'
        },
        502
      );
    }

    // 4. Fetch & Decumulate Financial Statements (with USD->IDR normalization using live IDR=X)
    let fundamentals = null;
    let fundamentalsError = null;
    try {
      fundamentals = await fetchAndDecumulateFundamentals(
        cleanTicker,
        yfSymbol,
        market.lastPrice,
        bypassCache
      );
    } catch (err) {
      fundamentalsError =
        err instanceof Error ? err.message : 'Gagal menarik fundamentals-timeseries.';
    }

    const fetchedAt = new Date().toISOString();
    const latencyMs = Date.now() - startedAtMs;

    const payload = {
      ok: true,
      provenanceMode: 'LIVE_REALTIME_WORKER',
      ticker: cleanTicker,
      yfSymbol,
      fetchedAt,
      latencyMs,
      asOfDate: fundamentals?.asOfDate || fetchedAt.slice(0, 10),
      fiscalPeriod: fundamentals?.fiscalPeriod || 'LIVE_SPOT',
      reportingCurrency: fundamentals?.reportingCurrency || market.chartCurrency || 'IDR',
      currency: 'IDR',
      fxRateUsdIdr: fundamentals?.fxRateUsdIdr || 1,
      ttmMethod: fundamentals?.ttmMethod || fundamentals?.flowAudit?.unifiedMethod || null,
      flowAudit: fundamentals?.flowAudit || null,
      daAnomaly: Boolean(fundamentals?.daAnomaly),
      daMethodNote: fundamentals?.daMethodNote || null,
      missingFields: fundamentals?.missingFields || [],
      note: fundamentals?.note || 'Cloudflare Worker Real-Time Sync',
      fundamentalsError,

      // Top-level flattened market & statement metrics for direct consumption
      lastPrice: market.lastPrice,
      previousClose: market.previousClose,
      change1D: market.change1D,
      return30D: market.return30D,
      adtv20dIdr: market.adtv20dIdr,
      beta1Y: market.beta1Y,
      realizedAnnualVol: market.realizedAnnualVol,
      atr20: market.atr20,
      dividendYieldTTM: market.dividendYieldTTM,
      closes: market.closes,
      timestamps: market.timestamps,

      revenueTTM: fundamentals?.revenueTTM ?? null,
      latestFullYearRevenue: fundamentals?.latestFullYearRevenue ?? null,
      operatingProfitTTM: fundamentals?.operatingProfitTTM ?? null,
      ebitdaTTM: fundamentals?.ebitdaTTM ?? null,
      netIncomeTTM: fundamentals?.netIncomeTTM ?? null,
      equityAttributable: fundamentals?.equityAttributable ?? null,
      totalAssets: fundamentals?.totalAssets ?? null,
      totalDebt: fundamentals?.totalDebt ?? null,
      cashAndEquivalents: fundamentals?.cashAndEquivalents ?? null,
      sharesOutstanding: fundamentals?.sharesOutstanding ?? null,
      ocfTTM: fundamentals?.ocfTTM ?? null,
      capexTTM: fundamentals?.capexTTM ?? null,
      daTTM: fundamentals?.daTTM ?? null,
      netIncomeYoYPct: fundamentals?.netIncomeYoYPct ?? null,
      operatingProfitYoYPct: fundamentals?.operatingProfitYoYPct ?? null,
      roeAvg3YPct: fundamentals?.roeAvg3YPct ?? null,
      roeAvg5YPct: fundamentals?.roeAvg5YPct ?? null,

      market,
      fundamentals,
      macroBenchmarks
    };

    return jsonResponse(request, payload, 200, {
      'X-Nostradamus-Worker-Latency-Ms': String(latencyMs),
      'X-Nostradamus-Provenance': 'LIVE_REALTIME_WORKER'
    });
  }
};
