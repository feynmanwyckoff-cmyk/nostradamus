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

function stripTags(raw: string): string {
  const withoutCdataAndTags = raw
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
    return itemMatches.slice(0, limit).map((itemXml, idx) => {
      const title = extractXmlTag(itemXml, 'title') || 'Market Update';
      const link = extractXmlTag(itemXml, 'link') || 'https://www.idx.co.id';
      const pubDate = (extractXmlTag(itemXml, 'pubDate') || 'Hari ini · Live RSS').slice(0, 22);
      const desc = extractXmlTag(itemXml, 'description').slice(0, 175);
      return {
        id: `${region.toLowerCase()}_srv_${Date.now()}_${idx}`,
        title,
        source: sourceLabel,
        publishedAt: pubDate,
        url: link,
        region,
        summary: desc ? `${desc}...` : undefined
      };
    });
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
        .replace(/\b(Tbk|PT|Persero|Indonesia)\b/gi, '')
        .trim();
      const queryTerm = cleanCompanyShort
        ? `"${rawTicker}" OR "${cleanCompanyShort}" saham BEI dividen aksi korporasi`
        : `"${rawTicker}" saham BEI emiten`;

      const googleNewsRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
        queryTerm
      )}&hl=id&gl=ID&ceid=ID:id`;
      const yahooTickerRssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
        `${rawTicker}.JK`
      )}&region=US&lang=en-US`;

      const [gNewsItems, yfItems] = await Promise.all([
        fetchRssXmlDirect(googleNewsRssUrl, `Radar Emiten ${rawTicker} (ID)`, 'DOMESTIC', 8),
        fetchRssXmlDirect(yahooTickerRssUrl, `Yahoo Finance ${rawTicker}.JK`, 'DOMESTIC', 4)
      ]);

      const merged = [...gNewsItems, ...yfItems].map((item, idx) => ({
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
Lakukan penalaran Komite Investasi mendalam (Deep Causal Quantitative & Fundamental Audit) untuk saham BEI berikut:

DATA FUNDAMENTAL & KUANTITATIF LIVE EMITEN:
- Emiten: ${stock.ticker} (${stock.name}) | Sektor IDX-IC: ${stock.sector}
- Kuotasi Pasar Live: Rp ${Number(stock.lastPrice).toLocaleString('id-ID')} | Perubahan 1D: ${stock.change1D}% | Return 30D (1M): ${stock.return30D}%
- Profitabilitas & Efisiensi Modal (DuPont): ROE ${stock.roe}% (Benchmark Cost of Equity RI: 10,5%, Spread ROE: ${(Number(stock.roe) - 10.5).toFixed(1)}%) | Operating Margin: ${stock.operatingMargin}% | Dividend Yield TTM: ${stock.dividendYieldPct || 0}%
- Struktur Neraca & Risiko: DER ${stock.debtToEquity}x | Beta 1Y: ${stock.beta1Y}x | Volatilitas Tahunan: ${stock.volatilityAnn}% | Likuiditas: ${stock.isLiquid !== false && stock.lastPrice >= 68 ? 'Likuid Aktif Institusional' : 'Tidak Likuid / Gocap'}
- Peringkat 4-Faktor Out-of-Sample (OOS DeMiguel): Skor Komposit ${stock.dmuCompositeScore}/10 (Peringkat Top ${stock.dmuRankPct}%, Zona Buffer: ${stock.dmuZone})
  * Rincian Faktor: Value ${stock.dmuValueScore}/10 (bobot 35%), Low-Vol ${stock.dmuLowVolScore}/10 (bobot 28%), Momentum ${stock.dmuMomScore}/10 (bobot 22%), Size/Liq ${stock.dmuSizeScore}/10 (bobot 15%)
- Status Saringan Risiko HSC (Gorengan/Cornered): ${stock.isHscFlagged ? `TERINDIKASI HSC (${stock.hscReason || 'Anomali Spekulatif'})` : 'BEBAS INDIKASI HSC (Clean Institutional/Fundamental)'}
- Kalibrasi Valuasi Intrinsik Joeliardi-Graham:
  * Estimasi Nilai Intrinsik: Rp ${Number(joeliardiEval?.intrinsicValueIdr || stock.lastPrice).toLocaleString('id-ID')}
  * Margin of Safety (MoS): ${joeliardiEval?.marginOfSafetyPct ?? 0}% (${joeliardiEval?.valuationLabel || '-'})
  * Implied PER: ${joeliardiEval?.impliedPer ?? '-'}x (Earnings Yield: ${joeliardiEval?.impliedPer ? (100 / Number(joeliardiEval.impliedPer)).toFixed(2) : '-'}% vs SBN 10Y 6,75%) | Fair PER Joeliardi: ${joeliardiEval?.joeliardiFairPer ?? '-'}x
  * Implied PBV: ${joeliardiEval?.impliedPbv ?? '-'}x vs Fair PBV Joeliardi: ${joeliardiEval?.joeliardiFairPbv ?? '-'}x
  * Estimasi EPS: Rp ${joeliardiEval?.estimatedEpsIdr ?? '-'} | Estimasi BVPS: Rp ${joeliardiEval?.estimatedBvpsIdr ?? '-'}
  * Skor 4 Pilar Joeliardi: Kualitas Bisnis ${joeliardiEval?.businessQualityScore ?? 0}/100, Kesehatan Neraca ${joeliardiEval?.balanceSheetHealthScore ?? 0}/100, Keamanan Valuasi ${joeliardiEval?.valuationSafetyScore ?? 0}/100, Ketahanan OOS ${joeliardiEval?.oosQuantRobustnessScore ?? 0}/100
- Rezim Pasar IHSG Saat Ini: ${regimeStatus || 'WASPADA'}

RADAR BERITA TERKINI & AKSI KORPORASI (${stock.ticker}):
${newsContext}

PERTANYAAN / FOKUS UTAMA INVESTOR:
"${activePromptFocus}"

INSTRUKSI PENALARAN KOMITE INVESTASI WAJIB (ANTI-TEMPLATE & BEBAS SIMBOL MARKDOWN **):
1. Berpikirlah secara kausal dan kritis layaknya Chief Investment Officer: bedah hubungan sebab-akibat antar metrik spesifik sektor ${stock.sector}. Jelaskan apakah ROE ${stock.roe}% berasal dari keunggulan margin operasional (${stock.operatingMargin}%) atau sekadar daya ungkit utang (DER ${stock.debtToEquity}x).
2. Uji hipotesis Value Trap vs Diskon Asimetris: bandingkan Earnings Yield terhadap imbal hasil bebas risiko SBN 10Y (6,75%), dan jelaskan mengapa pasar saat ini menghargai ${stock.ticker} pada PER ${joeliardiEval?.impliedPer ?? '-'}x / PBV ${joeliardiEval?.impliedPbv ?? '-'}x dengan tren 30 hari ${stock.return30D}%.
3. Jawab pertanyaan spesifik investor ("${activePromptFocus}") secara langsung, tajam, dan terukur pada directAnswerSummary.
4. Jangan pernah menulis simbol bintang ganda (**) atau sintaks markdown mentah di dalam nilai string JSON.
`.trim();

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: promptText,
        config: {
          systemInstruction:
            'Anda adalah Kepala Komite Investasi Kuantitatif & Fundamental Pasar Modal Indonesia (BEI) yang memadukan prinsip nilai intrinsik Joeliardi Sunendar, dekomposisi DuPont, dan disiplin faktor Out-of-Sample (OOS) DeMiguel. Analisis Anda bersifat kausal, spesifik terhadap dinamika sektor emiten, membongkar kontradiksi antara harga dan fundamental, serta bebas dari template generik maupun simbol markdown mentah (**).',
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
                description: 'Judul kesimpulan utama satu kalimat tajam tentang tesis investasi saham ini'
              },
              directAnswerSummary: {
                type: Type.STRING,
                description: 'Jawaban analitis mendalam 3-4 kalimat atas pertanyaan spesifik pengguna dengan penalaran kausal lintas-metrik (tanpa simbol **)'
              },
              convictionScore: {
                type: Type.NUMBER,
                description: 'Skor keyakinan akhir 0-100 berdasarkan sintesis komite investasi'
              },
              chainOfThoughtSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '4 langkah deduksi kausal berurutan: (1) Audit DuPont & Kualitas Arus Kas, (2) Uji Valuasi vs SBN 10Y & Deteksi Value Trap, (3) Evaluasi Katalis Berita & Struktur Likuiditas/HSC, (4) Keputusan Sizing & Eksekusi'
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
