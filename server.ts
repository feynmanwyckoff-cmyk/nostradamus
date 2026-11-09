import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface SparkSeriesItem {
  symbol: string;
  lastPrice: number;
  change1D: number;
  closes: number[];
  timestamp?: number[];
  shortName?: string;
}

async function fetchYahooJsonDirect(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json,text/plain,*/*'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSingleChartDirect(
  symbol: string,
  range: string = '3mo',
  hostIdx: number = 0
): Promise<SparkSeriesItem | null> {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (let attempt = 0; attempt < 2; attempt++) {
    const host = hosts[(hostIdx + attempt) % hosts.length];
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?range=${encodeURIComponent(range)}&interval=1d&events=div`;
    try {
      const data = await fetchYahooJsonDirect(url, 7000);
      const result = data?.chart?.result?.[0];
      if (!result) continue;

      const meta = result?.meta || {};
      const rawTimestamps: Array<number | null> = result?.timestamp || [];
      const rawCloses: Array<number | null> =
        result?.indicators?.quote?.[0]?.close || [];
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
          if (typeof meta.regularMarketTime === 'number') {
            timestamps.push(meta.regularMarketTime);
          }
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
        closes: closes.length >= 2 ? closes : [prevClose, lastPrice],
        timestamp: timestamps.length === closes.length ? timestamps : undefined,
        shortName: meta.longName || meta.shortName
      };
    } catch {
      // try alternate host
    }
  }
  return null;
}

async function fetchSparkBatchChunk(
  symbolsChunk: string[],
  range: string = '3mo',
  chunkIdx: number = 0
): Promise<Record<string, SparkSeriesItem>> {
  const resultMap: Record<string, SparkSeriesItem> = {};
  if (symbolsChunk.length === 0) return resultMap;

  const host =
    chunkIdx % 2 === 0 ? 'query1.finance.yahoo.com' : 'query2.finance.yahoo.com';
  const joined = symbolsChunk.map((s) => encodeURIComponent(s)).join(',');
  const sparkUrl = `https://${host}/v8/finance/spark?symbols=${joined}&range=${encodeURIComponent(
    range
  )}&interval=1d`;

  try {
    const sparkData = await fetchYahooJsonDirect(sparkUrl, 8500);
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
            const basePrev =
              entry.previousClose || entry.chartPreviousClose || lastPrice;
            closes.push(Number(Number(basePrev).toFixed(2)), lastPrice);
          } else if (rawTrailingWasNull && closes[closes.length - 1] !== lastPrice) {
            closes.push(lastPrice);
          } else if (closes[closes.length - 1] !== lastPrice) {
            closes[closes.length - 1] = lastPrice;
          }

          const prevClose =
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
              : prevClose > 0
              ? Number((((lastPrice - prevClose) / prevClose) * 100).toFixed(2))
              : 0;

          resultMap[sym] = {
            symbol: sym,
            lastPrice,
            change1D,
            closes,
            timestamp: timestamps.length === closes.length ? timestamps : undefined
          };
        }
      }
    }
  } catch {
    // Fallback below will fetch any missing symbols via /v8/finance/chart
  }

  // Fallback for any symbol in the chunk not returned by spark
  const missingSymbols = symbolsChunk.filter((s) => !resultMap[s]);
  if (missingSymbols.length > 0) {
    await Promise.all(
      missingSymbols.map(async (sym, idx) => {
        const single = await fetchSingleChartDirect(sym, range, chunkIdx + idx);
        if (single) {
          resultMap[sym] = single;
        }
      })
    );
  }

  return resultMap;
}

function decodeHtmlEntitiesServer(input: string): string {
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
  // Pass twice in case of double-encoded entities (&amp;#x2018;)
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

function stripInlineCrossLinksServer(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<(p|div|li|span|strong|b|a)[^>]*>\s*(baca|lihat|simak)\s+juga[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\b(baca|lihat|simak)\s+juga\s*:?[^.\n\r]*(\.|$)/gi, ' ')
    .replace(/\b(artikel|berita)\s+terkait\s*:?[^.\n\r]*(\.|$)/gi, ' ');
}

function stripTags(raw: string): string {
  const withoutCrossLinks = stripInlineCrossLinksServer(raw);
  const withoutCdataAndTags = withoutCrossLinks
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntitiesServer(withoutCdataAndTags)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractXmlTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  return match ? stripTags(match[1]) : '';
}

function isArticleStrictlyAboutEmitenServer(
  title: string,
  url: string,
  targetTicker: string,
  companyName: string
): boolean {
  const cleanTicker = targetTicker.trim().toUpperCase();
  if (!cleanTicker) return true;

  // Strip publisher suffix like " - Kontan.co.id" or " - CNBC Indonesia"
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

  // 3. Guard against articles primarily about ANOTHER 4-letter IDX ticker (e.g., "Profil Emiten TOBA" matching MPMX via inline "Baca Juga")
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

  const foreignEmitenInUrl = urlLower.match(
    /\b(?:emiten|saham)-([a-z]{4})\b/
  );
  if (
    foreignEmitenInUrl &&
    foreignEmitenInUrl[1].toUpperCase() !== cleanTicker &&
    !tickerRegex.test(headlineCore)
  ) {
    return false;
  }

  // Require the headline or URL slug itself to reference the target ticker or distinctive company name
  return hasTickerInTitleOrUrl || hasCompanyInTitleOrUrl;
}

function isNewsItemWithin90DaysServer(pubDateRaw: string, title: string, desc: string): boolean {
  const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days (3 months)
  const now = Date.now();
  if (pubDateRaw) {
    const parsed = Date.parse(pubDateRaw);
    if (!Number.isNaN(parsed)) {
      if (now - parsed > MAX_AGE_MS) {
        return false;
      }
    }
  }
  const currentYear = new Date().getFullYear();
  const staleYearsRegex = new RegExp(`\\b(201[5-9]|202[0-${Math.max(0, (currentYear % 10) - 2)}])\\b`);
  if (staleYearsRegex.test(title) && !title.includes(String(currentYear))) {
    return false;
  }
  return true;
}

function formatRecentPubDateServer(pubDateRaw: string): string {
  if (!pubDateRaw) return 'Terkini (≤ 3 Bulan)';
  const parsed = Date.parse(pubDateRaw);
  if (Number.isNaN(parsed)) return pubDateRaw.slice(0, 22);
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

async function fetchRssXmlDirect(
  rssUrl: string,
  sourceLabel: string,
  region: 'DOMESTIC' | 'GLOBAL',
  limit: number = 4
) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const res = await fetch(rssUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const xml = await res.text();
    const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
    const validItems: Array<{
      id: string;
      title: string;
      source: string;
      publishedAt: string;
      url: string;
      region: 'DOMESTIC' | 'GLOBAL';
      summary?: string;
    }> = [];

    for (let idx = 0; idx < itemMatches.length; idx++) {
      if (validItems.length >= limit) break;
      const itemXml = itemMatches[idx];
      const title = extractXmlTag(itemXml, 'title') || 'Market Update';
      const link = extractXmlTag(itemXml, 'link') || 'https://www.idx.co.id';
      const rawPubDate = extractXmlTag(itemXml, 'pubDate');
      const desc = stripInlineCrossLinksServer(extractXmlTag(itemXml, 'description')).slice(0, 175);

      if (!isNewsItemWithin90DaysServer(rawPubDate, title, desc)) {
        continue;
      }

      validItems.push({
        id: `${region.toLowerCase()}_srv_${Date.now()}_${idx}`,
        title,
        source: sourceLabel,
        publishedAt: formatRecentPubDateServer(rawPubDate),
        url: link,
        region,
        summary: desc ? `${desc}...` : undefined
      });
    }
    return validItems;
  } catch {
    return [];
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // 1. High-Throughput Multi-Symbol Batch Spark Endpoint (Supports 100+ Symbols in Parallel Chunks of 15)
  app.get('/api/yahoo/spark', async (req, res) => {
    try {
      const rawSymbols = String(req.query.symbols || '').trim();
      const range = String(req.query.range || '3mo').trim();
      if (!rawSymbols) {
        res.status(400).json({ error: 'Missing symbols query parameter' });
        return;
      }

      const symbols = Array.from(
        new Set(
          rawSymbols
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      );

      const CHUNK_SIZE = 15;
      const chunks: string[][] = [];
      for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
        chunks.push(symbols.slice(i, i + CHUNK_SIZE));
      }

      const chunkResults = await Promise.all(
        chunks.map((chunk, idx) => fetchSparkBatchChunk(chunk, range, idx))
      );

      const combined: Record<string, SparkSeriesItem> = {};
      for (const map of chunkResults) {
        Object.assign(combined, map);
      }

      res.json({
        syncedAt: new Date().toISOString(),
        requestedCount: symbols.length,
        syncedCount: Object.keys(combined).length,
        data: combined
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Spark batch error';
      res.status(500).json({ error: message });
    }
  });

  // 2. Single-Ticker Chart Endpoint
  app.get('/api/yahoo/chart', async (req, res) => {
    try {
      const symbol = String(req.query.symbol || '').trim();
      const range = String(req.query.range || '6mo').trim();
      if (!symbol) {
        res.status(400).json({ error: 'Missing symbol parameter' });
        return;
      }
      const item = await fetchSingleChartDirect(symbol, range, 0);
      if (!item) {
        res.status(404).json({ error: `Ticker ${symbol} not found` });
        return;
      }
      res.json(item);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chart fetch error';
      res.status(500).json({ error: message });
    }
  });

  // 3. Direct Domestic & Global Financial News RSS Aggregator
  app.get('/api/news/rss', async (_req, res) => {
    try {
      const [cnbcId, antaraId, mwGlobal, cnbcGlobal] = await Promise.all([
        fetchRssXmlDirect(
          'https://www.cnbcindonesia.com/market/rss',
          'CNBC Indonesia Market',
          'DOMESTIC',
          4
        ),
        fetchRssXmlDirect(
          'https://www.antaranews.com/rss/ekonomi.xml',
          'Antara Ekonomi Nasional',
          'DOMESTIC',
          3
        ),
        fetchRssXmlDirect(
          'https://feeds.content.dowjones.io/public/rss/mw_topstories',
          'MarketWatch Global Wire',
          'GLOBAL',
          4
        ),
        fetchRssXmlDirect(
          'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
          'CNBC Global Finance',
          'GLOBAL',
          3
        )
      ]);

      res.json({
        items: [...cnbcId, ...antaraId, ...mwGlobal, ...cnbcGlobal]
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'News RSS error';
      res.status(500).json({ error: message, items: [] });
    }
  });

  // 4. Emiten-Specific News, Corporate Actions & Issue Radar (Google News Indonesia RSS + Yahoo Finance RSS)
  app.get('/api/news/emiten', async (req, res) => {
    try {
      const rawTicker = String(req.query.ticker || '')
        .trim()
        .toUpperCase()
        .replace(/\.JK$/i, '')
        .replace(/[^A-Z]/g, '')
        .slice(0, 4);
      const rawName = String(req.query.name || '').trim();

      if (!rawTicker) {
        res.status(400).json({ error: 'Missing ticker parameter', items: [] });
        return;
      }

      const cleanCompanyShort = rawName
        .replace(
          /\b(Tbk|PT|Persero|Indonesia|Internasional|Nusantara|Sejahtera|Pratama|Makmur|Sentosa|Abadi|Karya|Utama|Mandiri|Group|Grup)\b/gi,
          ' '
        )
        .replace(/\s+/g, ' ')
        .trim();
      const primaryWords = cleanCompanyShort
        .split(' ')
        .filter((w) => w.length >= 3)
        .slice(0, 2)
        .join(' ');

      // Use intitle: to prevent matching inline "Baca Juga: ..." links inside articles about other stocks
      const queryTerm =
        primaryWords && primaryWords.length >= 4
          ? `(intitle:"${rawTicker}" OR intitle:"${primaryWords}") saham when:90d`
          : `intitle:"${rawTicker}" saham when:90d`;

      const googleNewsRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
        queryTerm
      )}&hl=id&gl=ID&ceid=ID:id`;
      const yahooTickerRssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
        `${rawTicker}.JK`
      )}&region=US&lang=en-US`;

      const [gNewsItems, yfItems] = await Promise.all([
        fetchRssXmlDirect(googleNewsRssUrl, `Radar Emiten ${rawTicker} (ID)`, 'DOMESTIC', 10),
        fetchRssXmlDirect(yahooTickerRssUrl, `Yahoo Finance ${rawTicker}.JK`, 'DOMESTIC', 4)
      ]);

      const verifiedGNews = gNewsItems.filter((item) =>
        isArticleStrictlyAboutEmitenServer(item.title, item.url, rawTicker, rawName)
      );

      const merged = [...verifiedGNews, ...yfItems]
        .slice(0, 8)
        .map((item, idx) => ({
          ...item,
          id: `emiten_${rawTicker}_${Date.now()}_${idx}`,
          ticker: rawTicker
        }));

      res.json({
        ticker: rawTicker,
        items: merged
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Emiten news error';
      res.status(500).json({ error: message, items: [] });
    }
  });

  // 5. Server-Side Gemini AI Fundamental & Latest News Inspector (Joeliardi Sunendar + OOS Quantitative Framework)
  app.post('/api/ai/inspect-emiten', async (req, res) => {
    try {
      const {
        stock,
        joeliardiEval,
        recentNews,
        userQuestion,
        regimeStatus
      } = req.body || {};

      if (!stock || !stock.ticker) {
        res.status(400).json({ error: 'Data emiten tidak lengkap.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error: 'GEMINI_API_KEY belum terkonfigurasi di server.',
          fallbackRequired: true
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const newsContext =
        Array.isArray(recentNews) && recentNews.length > 0
          ? recentNews
              .slice(0, 6)
              .map(
                (n: any, i: number) =>
                  `${i + 1}. [${n.emitenCategory || 'BERITA'} | Sentimen: ${n.sentiment || 'NEUTRAL'}] ${n.title} (${n.source} - ${n.publishedAt})${n.summary ? ` -> Ringkasan: ${n.summary}` : ''}`
              )
              .join('\n')
          : 'Tidak ada berita anomali spesifik terbaru; gunakan evaluasi aksi korporasi & fundamental terkini.';

      const activePromptFocus = userQuestion && String(userQuestion).trim()
        ? String(userQuestion).trim()
        : `Evaluasi mendalam kelayakan beli ${stock.ticker} pada harga Rp ${Number(stock.lastPrice).toLocaleString('id-ID')}, uji potensi value trap vs katalis pertumbuhan, dan berikan strategi eksekusi lot terbaik.`;

      const promptText = `
Lakukan analisis Komite Investasi mendalam (Fundamental & Kuantitatif) untuk saham BEI berikut:

DATA FUNDAMENTAL & KUANTITATIF LIVE EMITEN:
- Emiten: ${stock.ticker} (${stock.name}) | Sektor IDX-IC: ${stock.sector}
- Harga Pasar Live: Rp ${Number(stock.lastPrice).toLocaleString('id-ID')} | Perubahan 1D: ${stock.change1D}% | Pergerakan 30 Hari (1M): ${stock.return30D}%
- Profitabilitas & Efisiensi Modal (DuPont): ROE ${stock.roe}% (Batas wajar biaya modal RI: 10,5%, Selisih ROE: ${(Number(stock.roe) - 10.5).toFixed(1)}%) | Margin Usaha (Operating Margin): ${stock.operatingMargin}% | Dividend Yield TTM: ${stock.dividendYieldPct || 0}%
- Struktur Neraca & Risiko: DER ${stock.debtToEquity}x | Beta 1Y: ${stock.beta1Y}x | Volatilitas Tahunan: ${stock.volatilityAnn}% | Likuiditas: ${stock.isLiquid !== false && stock.lastPrice >= 68 ? 'Likuid Aktif Institusional' : 'Tidak Likuid / Gocap'}
- Peringkat 4-Faktor Out-of-Sample (OOS DeMiguel): Skor Komposit ${stock.dmuCompositeScore}/10 (Peringkat Top ${stock.dmuRankPct}%, Zona Buffer: ${stock.dmuZone})
  * Rincian Faktor: Value ${stock.dmuValueScore}/10 (bobot 35%), Low-Vol ${stock.dmuLowVolScore}/10 (bobot 28%), Momentum ${stock.dmuMomScore}/10 (bobot 22%), Size/Liq ${stock.dmuSizeScore}/10 (bobot 15%)
- Status Saringan Risiko HSC (Gorengan/Cornered): ${stock.isHscFlagged ? `TERINDIKASI HSC (${stock.hscReason || 'Anomali Spekulatif'})` : 'BEBAS INDIKASI HSC (Clean Institutional/Fundamental)'}
- Kalibrasi Nilai Intrinsik Wajar & Fundamental Kualitas Moat:
  * Estimasi Nilai Intrinsik Wajar: Rp ${Number(joeliardiEval?.intrinsicValueIdr || stock.lastPrice).toLocaleString('id-ID')}
  * Margin of Safety (MoS): ${joeliardiEval?.marginOfSafetyPct ?? 0}% (${joeliardiEval?.valuationLabel || '-'})
  * Implied PER: ${joeliardiEval?.impliedPer ?? '-'}x (Earnings Yield: ${joeliardiEval?.impliedPer ? (100 / Number(joeliardiEval.impliedPer)).toFixed(2) : '-'}% vs SBN 10Y 6,75%) | Fair PER Wajar: ${joeliardiEval?.joeliardiFairPer ?? '-'}x
  * Implied PBV: ${joeliardiEval?.impliedPbv ?? '-'}x vs Fair PBV Wajar: ${joeliardiEval?.joeliardiFairPbv ?? '-'}x
  * Estimasi EPS: Rp ${joeliardiEval?.estimatedEpsIdr ?? '-'} | Estimasi BVPS: Rp ${joeliardiEval?.estimatedBvpsIdr ?? '-'}
  * Skor 4 Pilar Fundamental: Kualitas Bisnis & Moat ${joeliardiEval?.businessQualityScore ?? 0}/100, Kesehatan Neraca ${joeliardiEval?.balanceSheetHealthScore ?? 0}/100, Keamanan Valuasi ${joeliardiEval?.valuationSafetyScore ?? 0}/100, Ketahanan OOS ${joeliardiEval?.oosQuantRobustnessScore ?? 0}/100
- Rezim Pasar IHSG Saat Ini: ${regimeStatus || 'WASPADA'}

RADAR BERITA TERKINI & AKSI KORPORASI (${stock.ticker}):
${newsContext}

PERTANYAAN / FOKUS UTAMA INVESTOR:
"${activePromptFocus}"

INSTRUKSI GAYA BAHASA & PENALARAN KOMITE INVESTASI WAJIB (HUMANIS, LUGAS & BEBAS KATA KAKU):
1. Gunakan gaya bahasa analis investasi senior Indonesia yang lugas, natural, humanis, dan enak dibaca. DILARANG KERAS menggunakan kata-kata terjemahan kaku atau teknis yang janggal seperti "kuotasi", "diskon optik", "secara optik", "secara kausal", "trajektori", "pengungkit utang", atau "bermoat". Gunakan padanan yang wajar seperti "Di harga Rp ...", "terlihat murah di atas kertas", "dari sisi fundamental", "pergerakan harga", "rasio utang", dan "berdaya saing kuat".
2. Bedah kualitas bisnis di sektor ${stock.sector} secara jernih: jelaskan apakah ROE ${stock.roe}% ditopang oleh margin usaha yang sehat (${stock.operatingMargin}%) dengan beban utang yang terjaga (DER ${stock.debtToEquity}x), atau justru banyak bertumpu pada utang. Jangan pernah menulis bahwa efisiensi modal belum terkonfirmasi jika ROE sudah tinggi di atas 15%.
3. Bandingkan imbal hasil laba (Earnings Yield) terhadap bunga SBN 10Y (6,75%), dan jelaskan secara mengalir mengapa saham ${stock.ticker} saat ini dihargai pada PER ${joeliardiEval?.impliedPer ?? '-'}x / PBV ${joeliardiEval?.impliedPbv ?? '-'}x di tengah pergerakan harga 30 hari terakhir (${stock.return30D}%).
4. Jawab fokus analisis secara langsung, mengalir, dan terukur pada directAnswerSummary dengan awalan "Hasil Analisis Komite Investasi: " TANPA mengulang kalimat pertanyaan pengguna.
5. Jangan pernah menulis simbol bintang ganda (**), sintaks markdown mentah, atau menyebut nama tokoh individu di dalam nilai string JSON. Gunakan istilah "Nilai Intrinsik Wajar" dan "Fundamental Kualitas Moat".
`.trim();

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: promptText,
        config: {
          systemInstruction:
            'Anda adalah Kepala Komite Investasi Pasar Modal Indonesia (BEI) yang berpengalaman. Gaya penulisan Anda seperti analis senior yang berbicara langsung kepada investor: lugas, natural, humanis, mengalir, dan mudah dipahami. Hindari istilah terjemahan kaku atau robotik seperti "kuotasi", "diskon optik", "secara optik", "secara kausal", "trajektori", atau "pengungkit". Sajikan kesimpulan analisis yang tajam dengan mengaitkan harga pasar, efisiensi laba (ROE & ROA), kesehatan neraca (DER), serta perbandingan imbal hasil terhadap SBN 10Y tanpa simbol markdown mentah (**).',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdictBadge: {
                type: Type.STRING,
                description: 'Keputusan singkat kapital, misal: STRONG ACCUMULATE, SELECTIVE BUY, HOLD / WAIT PULLBACK, atau AVOID / HSC BLOCK'
              },
              verdictTitle: {
                type: Type.STRING,
                description: 'Judul kesimpulan utama satu kalimat yang natural, lugas, dan humanis tentang kondisi fundamental dan harga saham ini'
              },
              directAnswerSummary: {
                type: Type.STRING,
                description: 'Hasil analisis mendalam 3-4 kalimat dengan bahasa Indonesia yang natural dan enak dibaca (tanpa kata kaku seperti kuotasi/optik/kausal dan tanpa simbol **)'
              },
              convictionScore: {
                type: Type.NUMBER,
                description: 'Skor keyakinan akhir 0-100 berdasarkan sintesis komite investasi'
              },
              chainOfThoughtSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '4 langkah penalaran berurutan dengan format "01. Judul: Penjelasan singkat -> Kesimpulan singkat": (1) Bedah DuPont & Kualitas Laba, (2) Perbandingan Valuasi vs SBN 10Y, (3) Evaluasi Tren Harga & Risiko Value Trap, (4) Tinjuauan Katalis Berita & Dividen'
              },
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    badge: { type: Type.STRING },
                    title: { type: Type.STRING },
                    keyMetricHighlight: { type: Type.STRING },
                    reasoningParagraph: { type: Type.STRING },
                    bulletPoints: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    sentimentTone: {
                      type: Type.STRING,
                      description: 'Salah satu dari: POSITIVE, NEUTRAL, CAUTION, NEGATIVE'
                    }
                  },
                  required: [
                    'id',
                    'badge',
                    'title',
                    'keyMetricHighlight',
                    'reasoningParagraph',
                    'bulletPoints',
                    'sentimentTone'
                  ]
                },
                description: '4 kartu komite investasi: (1) 01. Audit Kualitas Laba & DuPont ROE, (2) 02. Valuasi Intrinsik vs Risiko Value Trap, (3) 03. Dampak Berita, Dividen & Saringan HSC, (4) 04. Dinamika Momentum & Kesesuaian Rezim Pasar'
              },
              bullishDrivers: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3-4 katalis penggerak positif spesifik dan terukur untuk emiten ini'
              },
              bearishRisks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3-4 risiko spesifik atau pemicu pembatalan tesis (invalidation triggers)'
              },
              executionStrategy: {
                type: Type.OBJECT,
                properties: {
                  recommendedAction: { type: Type.STRING },
                  idealEntryZone: { type: Type.STRING },
                  InvalidationOrRiskLimit: { type: Type.STRING },
                  portfolioAllocationGuide: { type: Type.STRING }
                },
                required: [
                  'recommendedAction',
                  'idealEntryZone',
                  'InvalidationOrRiskLimit',
                  'portfolioAllocationGuide'
                ]
              }
            },
            required: [
              'verdictBadge',
              'verdictTitle',
              'directAnswerSummary',
              'convictionScore',
              'chainOfThoughtSteps',
              'sections',
              'bullishDrivers',
              'bearishRisks',
              'executionStrategy'
            ]
          }
        }
      });

      const rawText = (response.text ?? '').trim();
      let structuredReport: any = null;
      try {
        structuredReport = JSON.parse(rawText);
      } catch {
        structuredReport = null;
      }

      res.json({
        ticker: stock.ticker,
        analysis: structuredReport?.directAnswerSummary || rawText,
        structuredReport,
        generatedAt: new Date().toISOString()
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Gagal menghasilkan analisis AI emiten.';
      res.status(500).json({ error: message, fallbackRequired: true });
    }
  });

  // Serve pre-compiled GitHub Pages static bundle (/docs) so client-side GitHub Fork Sync can push the latest assets
  app.use('/docs', express.static(path.join(__dirname, 'docs')));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nostradamus Quant Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
