import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

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
                  `${i + 1}. [${n.emitenCategory || 'BERITA'}] ${n.title} (${n.source} - ${n.publishedAt})`
              )
              .join('\n')
          : 'Tidak ada berita anomali spesifik terbaru; gunakan evaluasi aksi korporasi & fundamental terkini.';

      const promptText = `
Anda adalah Analis Ekuitas Kuantitatif & Fundamental Senior Pasar Modal Indonesia (BEI / IHSG).
Lakukan bedah mendalam pra-beli (Pre-Buy Conviction Analysis) untuk emiten berikut dengan menggabungkan:
1. Prinsip Bapak Fundamental Indonesia (Joeliardi Sunendar):
   - Kualitas Bisnis & Economic Moat (ROE vs Cost of Equity Indonesia ~10,5%, Operating Margin, daya tahan laba).
   - Kesehatan Neraca (Debt-to-Equity Ratio / DER, risiko solvabilitas, kualitas kas nyata & dividen).
   - Valuasi Nilai Intrinsik & Margin of Safety (Harga Pasar vs Nilai Intrinsik Joeliardi-Graham, Implied PER & PBV vs Fair PER & PBV).
2. Prinsip Kuantitatif Out-of-Sample (OOS) 4-Faktor DeMiguel:
   - Skor Value (bobot 35%), Low-Volatility (28%), Momentum (22%), dan Size/Liquidity (15%).
   - Deteksi risiko HSC (High Speculative Concentration / Cornered / Gorengan) dan ketahanan terhadap rezim IHSG saat ini (${regimeStatus || 'WASPADA'}).
3. Berita Terkini, Corporate Action & Isu Spesifik Emiten:
${newsContext}

DATA FUNDAMENTAL & KUANTITATIF LIVE EMITEN:
- Ticker: ${stock.ticker} (${stock.name}) | Sektor: ${stock.sector}
- Harga Pasar Terkini: Rp ${Number(stock.lastPrice).toLocaleString('id-ID')} (Perubahan 1D: ${stock.change1D}%, 30D: ${stock.return30D}%)
- ROE: ${stock.roe}% | Operating Margin: ${stock.operatingMargin}% | DER: ${stock.debtToEquity}x | Dividend Yield TTM: ${stock.dividendYieldPct || 0}%
- Beta 1Y: ${stock.beta1Y}x | Volatilitas Tahunan: ${stock.volatilityAnn}%
- Skor 4-Faktor OOS: Komposit ${stock.dmuCompositeScore}/10 (Rank Top ${stock.dmuRankPct}%, Zona: ${stock.dmuZone}) | Value: ${stock.dmuValueScore}/10 | Low-Vol: ${stock.dmuLowVolScore}/10 | Momentum: ${stock.dmuMomScore}/10 | Size: ${stock.dmuSizeScore}/10
- Status Indikasi HSC: ${stock.isHscFlagged ? `TERINDIKASI HSC (${stock.hscReason || 'Risiko Spekulatif Tinggi'})` : 'BEBAS INDIKASI HSC (Clean)'}
- Valuasi Joeliardi-Graham: Nilai Intrinsik Rp ${Number(joeliardiEval?.intrinsicValueIdr || stock.lastPrice).toLocaleString('id-ID')} | Margin of Safety: ${joeliardiEval?.marginOfSafetyPct ?? 0}% | Implied PER: ${joeliardiEval?.impliedPer ?? '-'}x (Fair PER: ${joeliardiEval?.joeliardiFairPer ?? '-'}x) | Implied PBV: ${joeliardiEval?.impliedPbv ?? '-'}x (Fair PBV: ${joeliardiEval?.joeliardiFairPbv ?? '-'}x) | Conviction Grade: ${joeliardiEval?.convictionGrade ?? '-'}

FOKUS PERTANYAAN / PERMINTAAN KHUSUS USER:
"${userQuestion ? String(userQuestion).trim() : 'Evaluasi kesehatan fundamental terkini, dampak berita/corporate action terbaru, dan apakah saham ini layak dibeli pada harga sekarang.'}"

Format jawaban Anda dalam Bahasa Indonesia yang tajam, objektif, bebas basa-basi, dan terstruktur dalam 4 bagian ringkas (gunakan sekitar 250-350 kata):
1. **Bedah Kualitas Fundamental & Neraca (Prinsip Joeliardi Sunendar)**
2. **Validasi Kuantitatif Out-of-Sample (OOS) & Valuasi Margin of Safety**
3. **Evaluasi Berita Terkini, Corporate Action & Risiko Isu/HSC**
4. **Kesimpulan Pra-Beli (Verdict & Strategi Eksekusi bagi User)**
`.trim();

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: promptText,
        config: {
          systemInstruction:
            'Anda adalah analis fundamental (gaya Joeliardi Sunendar) dan kuantitatif Out-of-Sample (OOS) pasar saham Indonesia (BEI). Berikan analisis yang jujur, skeptis terhadap saham gorengan/HSC, mengutamakan Margin of Safety dan arus kas/dividen nyata, serta hindari penggunaan tanda pisah em-dash berlebihan.'
        }
      });

      const analysisText = (response.text ?? '').trim();
      res.json({
        ticker: stock.ticker,
        analysis: analysisText,
        generatedAt: new Date().toISOString()
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Gagal menghasilkan analisis AI emiten.';
      res.status(500).json({ error: message, fallbackRequired: true });
    }
  });

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
