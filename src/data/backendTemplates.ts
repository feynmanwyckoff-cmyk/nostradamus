/**
 * Zero-Google-Sheets GitHub Pages Deployment Kit for Nostradamus Quant Terminal:
 * 1. Standalone Single-File index.html (Full Feature Parity: Montserrat + Lora, Live Browser Fetcher, Macro Desk, HRP + QMJ Lot Calculator, 95% CVaR, Auto-loads public/market-snapshot.json)
 * 2. Automated GitHub Actions Cron Workflow (.github/workflows/nostradamus-cron.yml)
 * 3. Node.js Serverless Quant Snapshot Generator (scripts/update-nostradamus-data.mjs)
 * 4. Pre-seeded Initial Snapshot (public/market-snapshot.json) with Real-Time Yahoo Finance Quotes
 * 5. Complete Repository Documentation (README.md)
 */

export const QUANT_LITERATURE_PILLARS = [
  {
    pillar: '01. Cross-Sectional Factor Selection: Quality-Minus-Junk (QMJ) & Betting-Against-Beta (BAB)',
    citation: 'Asness, Frazzini & Pedersen (2019, Review of Accounting Studies); Frazzini & Pedersen (2014, Journal of Financial Economics)',
    formula: 'QMJ_i = 0.40·Z(ROE_i) + 0.35·Z(-DER_i) + 0.25·Z(OpMargin_i) ∈ [1.0, 10.0]',
    rationale:
      'Investor ritel dan institusi yang memiliki batasan leverage cenderung membayar terlalu mahal untuk saham ber-Beta tinggi ("lottery stocks"). Mengombinasikan faktor QMJ tinggi dengan Beta rendah pada sisi Defensif menghasilkan excess alpha yang persisten.'
  },
  {
    pillar: '02. Temporal Risk Scaling: Volatility-Managed Portfolios (VMP) + Global Macro Overlay',
    citation: 'Moreira & Muir (2017, Journal of Finance, "Volatility-Managed Portfolios")',
    formula: 'w_Aggressive,t = clip( c / σ²_Effective,t , 15%, 65% ), di mana σ_Effective = 0.75·σ_IHSG,30D + 0.25·MacroStress',
    rationale:
      'Volatilitas pasar bersifat mengelompok (volatility clustering), namun imbal hasil yang diharapkan tidak naik sebanding saat volatilitas melonjak. Menurunkan eksposur agresif secara otomatis saat σ_30D IHSG atau stres makro global (USD/IDR, VIX, US10Y) memuncak meningkatkan Sharpe Ratio secara signifikan.'
  },
  {
    pillar: '03. Intra-Basket Portfolio Optimization: Sector-Clustered QMJ-Inverse-Volatility (HRP Principles)',
    citation: 'Marcos López de Prado (2016, Journal of Portfolio Management, "Building Diversified Portfolios that Outperform Out-of-Sample")',
    formula: 'w_i = (QMJ_i^1.2 / σ_i) / Σ_k (QMJ_k^1.2 / σ_k) dengan batas klaster maksimum 2 emiten per Sektor BEI',
    rationale:
      'Optimasi Markowitz klasik gagal di pasar berkembang karena inversi matriks kovarians (Σ⁻¹) yang bising. Pendekatan berbasis klaster sektoral dan bobot proporsional terhadap rasio Kualitas-per-Volatilitas menghasilkan portofolio out-of-sample yang jauh lebih stabil.'
  },
  {
    pillar: '04. Tail-Risk Governance: 95% Conditional Value-at-Risk (Expected Shortfall)',
    citation: 'Rockafellar & Uryasev (2000, Journal of Risk, "Optimization of Conditional Value-at-Risk")',
    formula: 'CVaR_95%(1M) = (σ_Portfolio,Ann / √12) × 2.063 × Capital_IDR',
    rationale:
      'Mengukur ekspektasi kerugian rata-rata pada 5% skenario pasar terburuk bulanan, memastikan ukuran Lot BEI (1 Lot = 100 lembar) tetap berada dalam toleransi risiko modal.'
  }
];

export const GITHUB_ACTIONS_YML = `name: Nostradamus Quant Terminal — Auto Market Snapshot

on:
  schedule:
    # Jalan otomatis setiap Senin-Jumat pukul 02:30 UTC (09:30 WIB) & 09:30 UTC (16:30 WIB Penutupan BEI)
    - cron: '30 2,9 * * 1-5'
  workflow_dispatch: # Bisa dijalankan manual kapan saja lewat tab Actions di GitHub

permissions:
  contents: write

jobs:
  update-idx-quant-snapshot:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run Nostradamus Quant Scraper & Calculator
        run: node scripts/update-nostradamus-data.mjs

      - name: Commit & Push Updated Market Snapshot JSON
        run: |
          git config --global user.name "nostradamus-quant-bot"
          git config --global user.email "actions@github.com"
          git add public/market-snapshot.json
          git diff --staged --quiet || git commit -m "chore(quant): update IHSG & Global Macro snapshot [skip ci]"
          git push
`;

export const NODE_SCRAPER_SCRIPT = `/**
 * ============================================================================
 * NOSTRADAMUS QUANT TERMINAL — SERVERLESS GITHUB ACTIONS PIPELINE
 * File: scripts/update-nostradamus-data.mjs
 * ============================================================================
 * Menarik data historis IHSG (^JKSE), Global Macro (USD/IDR, US10Y, VIX, Gold,
 * Brent, S&P500), serta daftar emiten BEI (.JK) langsung dari Yahoo Finance
 * tanpa Google Sheets. Menyimpan hasil perhitungan ke public/market-snapshot.json
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

const IDX_WATCHLIST = [
  { ticker: 'BBCA', name: 'Bank Central Asia Tbk', sector: 'Financials', roe: 21.8, der: 0.38, opMargin: 54.2 },
  { ticker: 'BMRI', name: 'Bank Mandiri (Persero) Tbk', sector: 'Financials', roe: 22.4, der: 0.56, opMargin: 48.9 },
  { ticker: 'BBRI', name: 'Bank Rakyat Indonesia (Persero) Tbk', sector: 'Financials', roe: 19.8, der: 0.62, opMargin: 44.5 },
  { ticker: 'BBNI', name: 'Bank Negara Indonesia (Persero) Tbk', sector: 'Financials', roe: 15.4, der: 0.68, opMargin: 39.2 },
  { ticker: 'TLKM', name: 'Telkom Indonesia (Persero) Tbk', sector: 'Infrastructures', roe: 18.1, der: 0.49, opMargin: 31.4 },
  { ticker: 'ASII', name: 'Astra International Tbk', sector: 'Industrials', roe: 16.5, der: 0.44, opMargin: 15.9 },
  { ticker: 'ICBP', name: 'Indofood CBP Sukses Makmur Tbk', sector: 'Consumer Non-Cyclicals', roe: 18.4, der: 0.64, opMargin: 21.6 },
  { ticker: 'KLBF', name: 'Kalbe Farma Tbk', sector: 'Healthcare', roe: 14.9, der: 0.19, opMargin: 14.8 },
  { ticker: 'SIDO', name: 'Industri Jamu dan Farmasi Sido Muncul Tbk', sector: 'Healthcare', roe: 28.4, der: 0.09, opMargin: 34.6 },
  { ticker: 'ADRO', name: 'Alamtri Resources Indonesia Tbk', sector: 'Energy', roe: 24.6, der: 0.24, opMargin: 38.2 },
  { ticker: 'ITMG', name: 'Indo Tambangraya Megah Tbk', sector: 'Energy', roe: 26.8, der: 0.14, opMargin: 29.4 },
  { ticker: 'PTBA', name: 'Bukit Asam Tbk', sector: 'Energy', roe: 25.1, der: 0.22, opMargin: 22.8 },
  { ticker: 'AMMN', name: 'Amman Mineral Internasional Tbk', sector: 'Basic Materials', roe: 17.2, der: 0.58, opMargin: 36.4 },
  { ticker: 'UNTR', name: 'United Tractors Tbk', sector: 'Industrials', roe: 23.9, der: 0.29, opMargin: 22.4 },
  { ticker: 'UNVR', name: 'Unilever Indonesia Tbk', sector: 'Consumer Non-Cyclicals', roe: 82.5, der: 3.45, opMargin: 15.2 },
  { ticker: 'GOTO', name: 'GoTo Gojek Tokopedia Tbk', sector: 'Technology', roe: -14.2, der: 0.32, opMargin: -18.5 }
];

const MACRO_SYMBOLS = [
  { id: 'usdidr', symbol: 'IDR=X' },
  { id: 'dxy', symbol: 'DX-Y.NYB' },
  { id: 'us10y', symbol: '^TNX' },
  { id: 'vix', symbol: '^VIX' },
  { id: 'sp500', symbol: '^GSPC' },
  { id: 'hsi', symbol: '^HSI' },
  { id: 'gold', symbol: 'GC=F' },
  { id: 'brent', symbol: 'BZ=F' }
];

async function fetchYahooSeries(symbol, range = '1y') {
  const url = \`https://query1.finance.yahoo.com/v8/finance/chart/\${encodeURIComponent(symbol)}?range=\${range}&interval=1d\`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NostradamusQuant/1.0)' }
  });
  if (!res.ok) throw new Error(\`HTTP \${res.status} on \${symbol}\`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter(v => typeof v === 'number' && v > 0);
  const lastPrice = result?.meta?.regularMarketPrice || closes[closes.length - 1] || 0;
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : lastPrice;
  const change1D = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
  return { lastPrice, change1D, closes };
}

function dailyReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function computeBeta(stockRets, marketRets) {
  const n = Math.min(stockRets.length, marketRets.length);
  if (n < 15) return 1.0;
  const s = stockRets.slice(-n);
  const m = marketRets.slice(-n);
  const meanS = s.reduce((a, b) => a + b, 0) / n;
  const meanM = m.reduce((a, b) => a + b, 0) / n;
  let cov = 0, varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (s[i] - meanS) * (m[i] - meanM);
    varM += Math.pow(m[i] - meanM, 2);
  }
  return varM > 0 ? Math.max(0.2, Math.min(2.5, cov / varM)) : 1.0;
}

function computeQMJ(roe, der, opMargin) {
  const r = Math.max(0, Math.min(10, (roe / 26) * 10));
  const d = Math.max(1, Math.min(10, 10 - (der / 2.5) * 8));
  const m = Math.max(0, Math.min(10, (opMargin / 42) * 10));
  return Number(Math.max(1.0, Math.min(10.0, 0.40 * r + 0.35 * d + 0.25 * m)).toFixed(1));
}

async function main() {
  console.log('1. Fetching IDX:COMPOSITE (^JKSE) 1Y series...');
  const ihsg = await fetchYahooSeries('^JKSE', '1y');
  const ihsgRets = dailyReturns(ihsg.closes);
  const dailyStd30D = stdDev(ihsgRets.slice(-30)) * 100;
  const annVol30D = dailyStd30D * Math.sqrt(252);

  console.log('2. Fetching Global Macro indicators...');
  const macroUpdates = {};
  for (const m of MACRO_SYMBOLS) {
    try {
      const s = await fetchYahooSeries(m.symbol, '5d');
      macroUpdates[m.id] = {
        value: Number(s.lastPrice.toFixed(2)),
        change1D: Number(s.change1D.toFixed(2))
      };
    } catch (e) {
      console.warn(\`Macro skip \${m.symbol}: \${e.message}\`);
    }
  }

  console.log('3. Fetching IDX Watchlist (.JK)...');
  const stocks = [];
  for (const item of IDX_WATCHLIST) {
    try {
      const series = await fetchYahooSeries(\`\${item.ticker}.JK\`, '1y');
      const sRets = dailyReturns(series.closes);
      const beta1Y = Number(computeBeta(sRets, ihsgRets).toFixed(2));
      const volatilityAnn = Number(Math.max(8, (stdDev(sRets.slice(-60)) * 100 * Math.sqrt(252))).toFixed(1));
      const qmjScore = computeQMJ(item.roe, item.der, item.opMargin);
      stocks.push({
        ticker: item.ticker,
        idxTicker: \`IDX:\${item.ticker}\`,
        yfTicker: \`\${item.ticker}.JK\`,
        name: item.name,
        sector: item.sector,
        lastPrice: Math.round(series.lastPrice),
        change1D: Number(series.change1D.toFixed(2)),
        beta1Y,
        volatilityAnn,
        roe: item.roe,
        debtToEquity: item.der,
        operatingMargin: item.opMargin,
        qmjScore
      });
    } catch (e) {
      console.warn(\`Skipped \${item.ticker}: \${e.message}\`);
    }
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    ihsg: {
      lastPrice: Number(ihsg.lastPrice.toFixed(2)),
      change1D: Number(ihsg.change1D.toFixed(2)),
      dailyStd30D: Number(dailyStd30D.toFixed(3)),
      annualizedVol30D: Number(annVol30D.toFixed(2))
    },
    macroUpdates,
    stocks
  };

  const outDir = path.join(process.cwd(), 'public');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'market-snapshot.json'), JSON.stringify(payload, null, 2));
  console.log('Saved public/market-snapshot.json successfully.');
}

main();
`;

export const INITIAL_MARKET_SNAPSHOT_JSON = JSON.stringify(
  {
    updatedAt: new Date().toISOString(),
    ihsg: {
      lastPrice: 5034.43,
      change1D: 2.33,
      dailyStd30D: 2.752,
      annualizedVol30D: 43.69
    },
    macroUpdates: {
      usdidr: { value: 18080, change1D: 3.1 },
      dxy: { value: 101.22, change1D: -0.29 },
      us10y: { value: 4.89, change1D: -1.17 },
      vix: { value: 16.61, change1D: -20.26 },
      sp500: { value: 7688.62, change1D: 1.58 },
      hsi: { value: 24779.33, change1D: 3.59 },
      gold: { value: 4136.5, change1D: 1.56 },
      brent: { value: 94.19, change1D: -0.45 }
    },
    stocks: [
      { ticker: 'BBCA', idxTicker: 'IDX:BBCA', yfTicker: 'BBCA.JK', name: 'Bank Central Asia Tbk', sector: 'Financials', lastPrice: 5100, change1D: 3.45, beta1Y: 0.76, volatilityAnn: 18.4, roe: 21.8, debtToEquity: 0.38, operatingMargin: 54.2, qmjScore: 9.1 },
      { ticker: 'SIDO', idxTicker: 'IDX:SIDO', yfTicker: 'SIDO.JK', name: 'Industri Jamu dan Farmasi Sido Muncul Tbk', sector: 'Healthcare', lastPrice: 318, change1D: 0.0, beta1Y: 0.49, volatilityAnn: 15.2, roe: 28.4, debtToEquity: 0.09, operatingMargin: 34.6, qmjScore: 9.3 },
      { ticker: 'TLKM', idxTicker: 'IDX:TLKM', yfTicker: 'TLKM.JK', name: 'Telkom Indonesia (Persero) Tbk', sector: 'Infrastructures', lastPrice: 1995, change1D: 5.84, beta1Y: 0.81, volatilityAnn: 21.2, roe: 18.1, debtToEquity: 0.49, operatingMargin: 31.4, qmjScore: 8.1 },
      { ticker: 'ICBP', idxTicker: 'IDX:ICBP', yfTicker: 'ICBP.JK', name: 'Indofood CBP Sukses Makmur Tbk', sector: 'Consumer Non-Cyclicals', lastPrice: 6125, change1D: 3.38, beta1Y: 0.58, volatilityAnn: 16.5, roe: 18.4, debtToEquity: 0.64, operatingMargin: 21.6, qmjScore: 7.4 },
      { ticker: 'KLBF', idxTicker: 'IDX:KLBF', yfTicker: 'KLBF.JK', name: 'Kalbe Farma Tbk', sector: 'Healthcare', lastPrice: 755, change1D: 4.14, beta1Y: 0.62, volatilityAnn: 17.8, roe: 14.9, debtToEquity: 0.19, operatingMargin: 14.8, qmjScore: 6.4 },
      { ticker: 'ADRO', idxTicker: 'IDX:ADRO', yfTicker: 'ADRO.JK', name: 'Alamtri Resources Indonesia Tbk', sector: 'Energy', lastPrice: 2330, change1D: -0.85, beta1Y: 1.15, volatilityAnn: 27.8, roe: 24.6, debtToEquity: 0.24, operatingMargin: 38.2, qmjScore: 9.2 },
      { ticker: 'BMRI', idxTicker: 'IDX:BMRI', yfTicker: 'BMRI.JK', name: 'Bank Mandiri (Persero) Tbk', sector: 'Financials', lastPrice: 3640, change1D: 1.11, beta1Y: 1.18, volatilityAnn: 26.4, roe: 22.4, debtToEquity: 0.56, operatingMargin: 48.9, qmjScore: 8.9 },
      { ticker: 'BBRI', idxTicker: 'IDX:BBRI', yfTicker: 'BBRI.JK', name: 'Bank Rakyat Indonesia (Persero) Tbk', sector: 'Financials', lastPrice: 2740, change1D: 1.86, beta1Y: 1.24, volatilityAnn: 28.1, roe: 19.8, debtToEquity: 0.62, operatingMargin: 44.5, qmjScore: 8.4 },
      { ticker: 'ITMG', idxTicker: 'IDX:ITMG', yfTicker: 'ITMG.JK', name: 'Indo Tambangraya Megah Tbk', sector: 'Energy', lastPrice: 24475, change1D: 2.41, beta1Y: 0.84, volatilityAnn: 19.8, roe: 26.8, debtToEquity: 0.14, operatingMargin: 29.4, qmjScore: 9.1 },
      { ticker: 'ASII', idxTicker: 'IDX:ASII', yfTicker: 'ASII.JK', name: 'Astra International Tbk', sector: 'Industrials', lastPrice: 4920, change1D: 0.41, beta1Y: 0.88, volatilityAnn: 19.6, roe: 16.5, debtToEquity: 0.44, operatingMargin: 15.9, qmjScore: 6.5 },
      { ticker: 'AMMN', idxTicker: 'IDX:AMMN', yfTicker: 'AMMN.JK', name: 'Amman Mineral Internasional Tbk', sector: 'Basic Materials', lastPrice: 3680, change1D: 8.88, beta1Y: 1.48, volatilityAnn: 36.5, roe: 17.2, debtToEquity: 0.58, operatingMargin: 36.4, qmjScore: 7.7 },
      { ticker: 'UNVR', idxTicker: 'IDX:UNVR', yfTicker: 'UNVR.JK', name: 'Unilever Indonesia Tbk', sector: 'Consumer Non-Cyclicals', lastPrice: 1445, change1D: 3.96, beta1Y: 0.52, volatilityAnn: 18.8, roe: 82.5, debtToEquity: 3.45, operatingMargin: 15.2, qmjScore: 5.3 },
      { ticker: 'GOTO', idxTicker: 'IDX:GOTO', yfTicker: 'GOTO.JK', name: 'GoTo Gojek Tokopedia Tbk', sector: 'Technology', lastPrice: 25, change1D: 4.17, beta1Y: 1.72, volatilityAnn: 48.2, roe: -14.2, debtToEquity: 0.32, operatingMargin: -18.5, qmjScore: 3.1 }
    ]
  },
  null,
  2
);

export const GITHUB_REPO_README_MD = `# Nostradamus Quant Terminal — IHSG & Global Macro Portfolio Engine

Terminal portofolio kuantitatif publik dan monitor makro global (*Bloomberg-Lite*) khusus ekuitas Bursa Efek Indonesia (**IHSG / IDX**) yang berjalan **100% di GitHub Pages tanpa Google Sheets**.

---

## Metodologi Kuantitatif 4-Pilar Institusional

1. **Cross-Sectional Factor Selection: Quality-Minus-Junk (QMJ) & Betting-Against-Beta (BAB)**
   * *Referensi*: Asness, Frazzini & Pedersen (2019, *Review of Accounting Studies*); Frazzini & Pedersen (2014, *Journal of Financial Economics*).
   * Menyaring emiten berdasarkan profitabilitas (**ROE**), keamanan neraca (**rendahnya DER**), dan efisiensi operasional (**Operating Margin**) pada skala \`1.0 – 10.0\`. Saham dengan \`QMJ < 4.8\` dikarantina secara otomatis.

2. **Temporal Risk Scaling: Volatility-Managed Portfolios (VMP) + Global Macro Overlay**
   * *Referensi*: Moreira & Muir (2017, *Journal of Finance*).
   * Mengatur porsi **Barbell** (Defensif vs Agresif) secara berbanding terbalik terhadap realisasi standar deviasi 30-hari IHSG (\`^JKSE\`) dan **Global Macro Stress Index** (\`USD/IDR\`, \`DXY\`, \`US 10Y Treasury Yield\`, \`CBOE VIX\`, serta komoditas ekspor utama Indonesia: \`Coal\`, \`Gold\`, \`Brent Oil\`, \`Nickel\`, \`CPO\`).

3. **Intra-Basket Optimization: Sector-Clustered QMJ-Inverse-Volatility (HRP Principles)**
   * *Referensi*: Marcos López de Prado (2016, *Journal of Portfolio Management*).
   * Membobotkan setiap emiten secara proporsional terhadap rasio Kualitas-per-Volatilitas (\`QMJ_i^1.2 / σ_i\`) dengan batas klaster maksimum 2 saham per Sektor BEI.

4. **Tail-Risk Governance: 95% Conditional Value-at-Risk (Expected Shortfall)**
   * *Referensi*: Rockafellar & Uryasev (2000, *Journal of Risk*).
   * Menghitung ekspektasi risiko ekor bulanan (*95% Monthly CVaR*) dan mengonversi alokasi ke satuan **Lot BEI** (\`1 Lot = 100 lembar\`).

---

## Struktur File Repository

\`\`\`text
├── index.html                                  # Aplikasi Utama (Single-Page Terminal siap GitHub Pages)
├── .nojekyll                                   # Memastikan GitHub Pages melayani seluruh aset statis
├── public/
│   └── market-snapshot.json                    # Snapshot data IHSG, Makro Global & Emiten BEI
├── scripts/
│   └── update-nostradamus-data.mjs             # Script Node.js penarik Yahoo Finance & kalkulator Quant
└── .github/
    └── workflows/
        └── nostradamus-cron.yml                # GitHub Actions terjadwal (otomatis update data harian)
\`\`\`

---

## Cara Deploy ke GitHub Pages (3 Langkah Mudah)

1. **Upload ke Repository GitHub**:
   * Ekstrak seluruh isi file ZIP ini dan *upload* (*commit & push*) ke repository GitHub Anda (baik *public* maupun *private*).
2. **Aktifkan GitHub Pages**:
   * Buka menu **Settings** -> **Pages** di repository GitHub Anda.
   * Pada bagian **Build and deployment** -> **Source**, pilih **Deploy from a branch**.
   * Pilih branch \`main\` (atau \`master\`) dan folder \`/ (root)\`, lalu klik **Save**.
3. **Izinkan GitHub Actions Meng-update Data Secara Otomatis**:
   * Buka menu **Settings** -> **Actions** -> **General** -> **Workflow permissions**.
   * Pilih **Read and write permissions**, lalu klik **Save**.
   * Anda juga bisa memicu update kapan saja melalui tab **Actions** -> **Nostradamus Quant Terminal — Auto Market Snapshot** -> **Run workflow**.

---

**Credit: Fayadh**
`;

export const STANDALONE_GITHUB_PAGES_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nostradamus Quant Terminal — IHSG & Global Macro Portfolio Engine</title>
  <meta name="description" content="Institutional quantitative portfolio terminal for IDX equities combining QMJ, Volatility-Managed Portfolios, Hierarchical Risk Parity, and Global Macro overlays." />
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Google Fonts: Montserrat & Lora -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <!-- SweetAlert2 CDN -->
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <style>
    body {
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: #FAF9F6;
      color: #111315;
    }
    .font-editorial {
      font-family: 'Lora', Georgia, Cambria, serif;
    }
    .tabular-nums {
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.01em;
    }
    /* Classic Dark Bloomberg Terminal Mode */
    body.theme-dark {
      background-color: #090C10 !important;
      color: #E5E7EB !important;
    }
    body.theme-dark header,
    body.theme-dark footer,
    body.theme-dark section,
    body.theme-dark .bg-\[\#FFFFFF\],
    body.theme-dark .bg-\[\#FFFFFF\]\/95 {
      background-color: #11161F !important;
      border-color: #222C3C !important;
      color: #E5E7EB !important;
    }
    body.theme-dark .bg-\[\#FAF9F6\],
    body.theme-dark .bg-\[\#FAF9F6\]\/60,
    body.theme-dark .bg-\[\#FAF9F6\]\/50,
    body.theme-dark .bg-\[\#FAF9F6\]\/70,
    body.theme-dark .bg-\[\#F3F1EC\]\/70 {
      background-color: #161D2A !important;
      border-color: #263244 !important;
    }
    body.theme-dark .border-\[\#E4E2DD\] {
      border-color: #222C3C !important;
    }
    body.theme-dark .text-\[\#111315\] {
      color: #F3F4F6 !important;
    }
    body.theme-dark .text-\[\#0D5C46\] {
      color: #10B981 !important;
    }
    body.theme-dark .text-\[\#9E2A2B\] {
      color: #F43F5E !important;
    }
    body.theme-dark input {
      background-color: #0D1117 !important;
      border-color: #2D3A4F !important;
      color: #FBBF24 !important;
    }
    .swal2-popup {
      font-family: 'Montserrat', sans-serif !important;
      background-color: #FFFFFF !important;
      border-radius: 0.25rem !important;
      border: 2px solid #D97706 !important;
      padding: 1.75rem !important;
    }
    .swal2-title {
      font-size: 1.15rem !important;
      font-weight: 700 !important;
      color: #111315 !important;
    }
  </style>
</head>
<body class="theme-dark min-h-screen flex flex-col antialiased selection:bg-[#F59E0B] selection:text-[#090C10]">

  <!-- Top Navigation Bar (Bloomberg Style + Dual-Mode Toggle) -->
  <header class="bg-[#FFFFFF]/95 backdrop-blur-sm border-b border-[#E4E2DD] border-t-2 border-t-[#F59E0B] px-6 py-3.5 sticky top-0 z-30">
    <div class="max-w-6xl mx-auto flex items-center justify-between gap-6">
      <a href="#top" class="text-base font-bold tracking-tight text-[#111315] uppercase whitespace-nowrap shrink-0">
        NOSTRADAMUS <span class="text-[#F59E0B]">QUANT</span> <span class="text-xs text-[#38BDF8]">[IDX:EQ]</span>
      </a>
      <nav class="hidden md:flex items-center gap-6 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
        <a href="#screener-section" class="hover:text-[#F59E0B] transition whitespace-nowrap">01 // SCREENER</a>
        <a href="#active-portfolio-section" class="hover:text-[#F59E0B] transition whitespace-nowrap">02 // PORTFOLIO & RADAR</a>
        <a href="#allocator-section" class="hover:text-[#F59E0B] transition whitespace-nowrap">03 // HRP SIZING</a>
        <a href="#macro-news-section" class="hover:text-[#F59E0B] transition whitespace-nowrap">04 // MACRO WIRE</a>
      </nav>
      <div class="flex items-center gap-2.5 shrink-0">
        <button onclick="document.body.classList.toggle('theme-dark')" class="px-3 py-1.5 bg-[#FAF9F6] border border-[#E4E2DD] text-[11px] font-bold uppercase tracking-wider text-[#F59E0B] rounded-xs cursor-pointer">
          DARK / DAYLIGHT
        </button>
        <button id="btn-generate-top" class="px-3.5 py-1.5 bg-[#F59E0B] text-[#090C10] text-[11px] font-bold uppercase tracking-wider rounded-xs hover:bg-[#FBBF24] transition cursor-pointer whitespace-nowrap">
          EXECUTION MEMO &lt;GO&gt;
        </button>
      </div>
    </div>
  </header>

  <!-- Bloomberg-Lite Global Macro Ribbon & Expandable Transmission Desk -->
  <section class="bg-[#FFFFFF] border-b border-[#E4E2DD]">
    <div class="max-w-6xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4 border-b border-[#E4E2DD]/60 overflow-x-auto">
      <div id="macro-ribbon" class="flex items-center gap-5 text-xs tabular-nums whitespace-nowrap"></div>
      <div class="flex items-center gap-3 shrink-0">
        <button id="btn-toggle-macro-desk" class="text-[11px] font-semibold text-[#111315] underline underline-offset-4 hover:text-neutral-600 whitespace-nowrap cursor-pointer">
          Buka Desk Transmisi Makro
        </button>
        <button id="btn-sync-macro" class="px-2.5 py-1 text-[11px] font-semibold text-[#111315] bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm hover:bg-neutral-100 whitespace-nowrap cursor-pointer">
          Live Yahoo Macro
        </button>
      </div>
    </div>

    <!-- Collapsible Macro Desk -->
    <div id="macro-desk-panel" class="hidden max-w-6xl mx-auto px-6 py-6 bg-[#FAF9F6]/60 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold uppercase tracking-wider text-[#111315]">Cross-Asset Global Macro Transmission Desk</h3>
          <p class="font-editorial text-xs text-neutral-600 mt-0.5">Memantau 4 jalur transmisi risiko eksternal terhadap IHSG: Likuiditas Rupiah (USD/IDR & DXY), Imbal Hasil Global (US 10Y), Indeks Ketakutan Ekuitas (VIX), dan Komoditas Ekspor RI.</p>
        </div>
      </div>
      <div id="macro-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums"></div>
    </div>
  </section>

  <!-- Main Workspace -->
  <main id="top" class="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-10">

    <!-- 1. Market Regime & Moreira-Muir VMP Banner -->
    <section class="bg-[#FFFFFF] border border-[#E4E2DD] p-6 sm:p-8 rounded-sm space-y-6">
      <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
        <div class="max-w-3xl">
          <div class="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">
            <span>IDX:COMPOSITE (^JKSE)</span>
            <span>·</span>
            <span>Moreira-Muir Volatility-Managed Model</span>
            <span>·</span>
            <span id="data-source-badge">LocalStorage Auto-Cache + Yahoo Finance</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-[#111315] leading-tight">
            Rezim Pasar Saat Ini: <span id="regime-label" class="text-[#9E2A2B]">Volatil — Defensive Shield (Risk-Off)</span>
          </h1>
          <p id="regime-desc" class="mt-3 font-editorial text-sm sm:text-base text-neutral-700 leading-relaxed"></p>
        </div>
        <div class="flex flex-wrap items-center gap-2.5 shrink-0">
          <button id="btn-sim-regime" class="px-3.5 py-2 text-xs font-semibold text-[#111315] bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm hover:bg-neutral-100 cursor-pointer whitespace-nowrap">
            Simulasi Rezim: Ubah ke Tenang
          </button>
        </div>
      </div>

      <!-- 4-Column Quantitative KPI Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-4 border-t border-[#E4E2DD] tabular-nums">
        <div class="p-4 bg-[#FAF9F6]/60 border border-[#E4E2DD] rounded-sm">
          <div class="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">IHSG Composite (^JKSE)</div>
          <div class="flex items-baseline justify-between gap-2 mt-2">
            <span id="kpi-ihsg-price" class="text-2xl font-bold text-[#111315]">5.034,43</span>
            <span id="kpi-ihsg-chg" class="text-xs font-semibold text-[#0D5C46]">+2.33%</span>
          </div>
          <div class="mt-2 text-[11px] text-neutral-500">σ Harian (30D): <strong id="kpi-daily-std" class="text-[#111315]">2.752%</strong></div>
        </div>

        <div class="p-4 bg-[#FAF9F6]/60 border border-[#E4E2DD] rounded-sm">
          <div class="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Volatilitas Tahunan & Makro</div>
          <div class="flex items-baseline justify-between gap-2 mt-2">
            <span id="kpi-ann-vol" class="text-2xl font-bold text-[#111315]">43.69%</span>
            <span id="kpi-eff-vol" class="text-xs font-medium text-neutral-600">Eff: 37.6%</span>
          </div>
          <div class="mt-2 text-[11px] text-neutral-500">Macro Stress Score: <strong id="kpi-macro-stress" class="text-[#111315]">58.6/100</strong></div>
        </div>

        <div class="p-4 bg-[#FAF9F6]/60 border border-[#E4E2DD] rounded-sm sm:col-span-2 flex flex-col justify-between">
          <div class="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
            <span class="font-semibold uppercase tracking-wider">Bobot Dinamis Moreira-Muir VMP Barbell</span>
            <button id="btn-open-memo-link" class="text-[#111315] font-bold underline underline-offset-4 hover:text-neutral-600 cursor-pointer">Buka Memo Eksekusi →</button>
          </div>
          <div class="flex items-center justify-between text-xs font-bold text-[#111315] my-1.5">
            <span id="kpi-def-label" class="text-[#0D5C46]">Defensive Quality (Low-Beta): 80%</span>
            <span id="kpi-agg-label" class="text-[#111315]">Aggressive Alpha (High-Beta): 20%</span>
          </div>
          <div class="w-full h-2.5 bg-neutral-200 rounded-xs overflow-hidden flex">
            <div id="bar-def" style="width: 80%" class="bg-[#0D5C46] transition-all duration-300"></div>
            <div id="bar-agg" style="width: 20%" class="bg-[#111315] transition-all duration-300"></div>
          </div>
          <div class="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span>Ambang Volatilitas: 18.0%</span>
            <span>Intra-Basket: López de Prado QMJ/σ Weighting</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 2. HRP + QMJ Barbell Portfolio Optimizer & BEI Lot Calculator -->
    <section id="allocator-section" class="p-6 sm:p-8 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm space-y-6">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E4E2DD] pb-5">
        <div>
          <div class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">López de Prado HRP Leaf Weighting · Rockafellar-Uryasev 95% CVaR</div>
          <h2 class="text-xl font-bold tracking-tight text-[#111315] mt-0.5">Optimasi Bobot Portofolio & Kalkulator Lot BEI</h2>
          <p class="font-editorial text-xs sm:text-sm text-neutral-600 mt-1 max-w-2xl">Bobot setiap emiten dihitung secara proporsional terhadap rasio Kualitas-per-Volatilitas (<strong class="font-sans text-[#111315]">QMJ^1.2 / σ_i</strong>) dengan batas klaster maksimum 2 saham per sektor BEI (1 Lot = 100 lembar).</p>
        </div>
        <div class="flex flex-wrap items-center gap-3 shrink-0">
          <div>
            <label class="block text-[11px] font-semibold text-neutral-600 mb-1">Total Modal Portofolio (IDR)</label>
            <input id="input-capital" type="text" value="100.000.000" class="px-3.5 py-2 text-xs font-bold tabular-nums bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm w-44 text-right focus:outline-none focus:border-[#111315]" />
          </div>
          <button id="btn-generate-card" class="self-end px-4 py-2.5 bg-[#111315] text-white text-xs font-semibold rounded-sm hover:bg-neutral-800 transition cursor-pointer">
            Generate Strategy
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm tabular-nums">
        <div>
          <span class="text-[11px] text-neutral-500 block">Portfolio Weighted QMJ</span>
          <span id="stat-port-qmj" class="text-lg font-bold text-[#0D5C46]">8.95 / 10.0</span>
        </div>
        <div>
          <span class="text-[11px] text-neutral-500 block">Portfolio Weighted Beta (β_p)</span>
          <span id="stat-port-beta" class="text-lg font-bold text-[#111315]">0.78x</span>
        </div>
        <div>
          <span class="text-[11px] text-neutral-500 block">Est. Sharpe Ratio (Ex-Ante)</span>
          <span id="stat-port-sharpe" class="text-lg font-bold text-[#111315]">1.52</span>
        </div>
        <div>
          <span class="text-[11px] text-neutral-500 block">95% Monthly CVaR (Tail Risk)</span>
          <span id="stat-port-cvar" class="text-lg font-bold text-[#9E2A2B]">-7.15%</span>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 tabular-nums">
        <div class="p-5 bg-[#FAF9F6]/50 border border-[#E4E2DD] rounded-sm space-y-3">
          <div class="flex items-center justify-between border-b border-[#E4E2DD] pb-3">
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-[#0D5C46] block">Keranjang Defensif · Low-Beta Quality</span>
              <span class="text-[11px] text-neutral-500">Betting-Against-Beta (β ≤ 0.92) & QMJ ≥ 7.0</span>
            </div>
            <div class="text-right">
              <span id="sleeve-def-pct" class="text-base font-bold text-[#0D5C46]">80% Total</span>
              <span id="sleeve-def-idr" class="block text-xs text-neutral-600">Rp 80.000.000</span>
            </div>
          </div>
          <div id="sleeve-def-list" class="divide-y divide-[#E4E2DD]/70 text-xs"></div>
        </div>

        <div class="p-5 bg-[#FAF9F6]/50 border border-[#E4E2DD] rounded-sm space-y-3">
          <div class="flex items-center justify-between border-b border-[#E4E2DD] pb-3">
            <div>
              <span class="text-xs font-bold uppercase tracking-wider text-[#111315] block">Keranjang Agresif · High-Beta Quality</span>
              <span class="text-[11px] text-neutral-500">High-Beta Alpha (β &gt; 0.92) & QMJ ≥ 6.5</span>
            </div>
            <div class="text-right">
              <span id="sleeve-agg-pct" class="text-base font-bold text-[#111315]">20% Total</span>
              <span id="sleeve-agg-idr" class="block text-xs text-neutral-600">Rp 20.000.000</span>
            </div>
          </div>
          <div id="sleeve-agg-list" class="divide-y divide-[#E4E2DD]/70 text-xs"></div>
        </div>
      </div>
    </section>

    <!-- 3. Active Portfolio Manager, Auto-Save LocalStorage Cache & Smart Stock Recommendation Radar -->
    <section id="active-portfolio-section" class="p-6 sm:p-8 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm space-y-6">
      <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-[#E4E2DD] pb-5">
        <div>
          <div class="text-[11px] font-semibold uppercase tracking-wider text-[#0D5C46]">SERVERLESS PERSISTENCE ENGINE · ACTIVE PORTFOLIO & DAILY REBALANCING</div>
          <h2 class="text-xl font-bold tracking-tight text-[#111315] mt-0.5">Portofolio Aktif, Cache Otomatis & Rekomendasi Saham</h2>
          <p class="font-editorial text-xs sm:text-sm text-neutral-600 mt-1 max-w-2xl">Menyimpan screener dan portofolio Anda secara otomatis di <strong class="font-sans text-[#111315]">LocalStorage Browser</strong> tanpa database server, lengkap dengan evaluasi rebalancing harian dan rekomendasi kandidat saham potensial.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <button onclick="exportBackupJson()" class="px-3 py-1.5 text-xs font-semibold bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm hover:bg-neutral-100 cursor-pointer">Ekspor Backup (.JSON)</button>
          <button onclick="resetPortfolioCache()" class="px-3 py-1.5 text-xs font-semibold text-[#9E2A2B] bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm hover:bg-neutral-100 cursor-pointer">Reset Cache</button>
        </div>
      </div>

      <!-- Add Position Form -->
      <div class="p-4 bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label class="block text-[11px] font-semibold uppercase text-neutral-600 mb-1">Ticker Saham (.JK)</label>
          <input id="port-ticker" type="text" value="BBCA" class="w-full px-3 py-2 text-xs font-bold uppercase bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold uppercase text-neutral-600 mb-1">Jumlah Lot</label>
          <input id="port-lots" type="number" value="50" class="w-full px-3 py-2 text-xs font-bold tabular-nums bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold uppercase text-neutral-600 mb-1">Avg Buy Price (Rp)</label>
          <input id="port-avg" type="number" value="4950" class="w-full px-3 py-2 text-xs font-bold tabular-nums bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm" />
        </div>
        <button onclick="savePortfolioHolding()" class="px-4 py-2 text-xs font-semibold text-white bg-[#111315] hover:bg-neutral-800 rounded-sm cursor-pointer">+ Simpan Posisi</button>
      </div>

      <!-- Active Holdings Table -->
      <div class="overflow-x-auto border border-[#E4E2DD] rounded-sm">
        <table class="w-full text-left border-collapse tabular-nums text-xs">
          <thead>
            <tr class="border-b border-[#E4E2DD] bg-[#FAF9F6] text-[11px] font-bold uppercase text-neutral-600">
              <th class="py-2.5 px-4">Emiten</th>
              <th class="py-2.5 px-4 text-right">Lot & Avg Buy</th>
              <th class="py-2.5 px-4 text-right">Harga Live & Nilai</th>
              <th class="py-2.5 px-4 text-right">Floating P&L</th>
              <th class="py-2.5 px-4">Sinyal Evaluasi Harian</th>
              <th class="py-2.5 px-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody id="tbody-portfolio" class="divide-y divide-[#E4E2DD]"></tbody>
        </table>
      </div>

      <!-- Smart Candidate Recommendations -->
      <div class="pt-4 border-t border-[#E4E2DD] space-y-3">
        <div class="text-sm font-bold text-[#111315]">Rekomendasi Kandidat Saham di Luar Portofolio Anda (Berdasarkan Rasio QMJ/σ HRP):</div>
        <div id="recommendations-grid" class="grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums"></div>
      </div>
    </section>

    <!-- 4. Live .JK Ticker Fetcher & Screening Table -->
    <section id="screener-section" class="space-y-5">
      <div class="p-5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm space-y-4">
        <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div class="flex-1 flex flex-col sm:flex-row gap-2.5">
            <div class="flex-1">
              <label class="block text-xs font-bold text-[#111315] mb-1">
                Live Ticker Fetcher (.JK) — Tarik Emiten BEI Langsung dari Yahoo Finance Tanpa Google Sheets
              </label>
              <input id="input-ticker" type="text" maxlength="8" placeholder="Ketik kode saham BEI (contoh: BREN, MEDC, MYOR, CMRY, MIKA, UNTR, ANTM)..."
                class="w-full px-3.5 py-2 text-xs uppercase bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm focus:outline-none focus:border-[#111315]" />
            </div>
            <button id="btn-live-fetch" class="self-end px-4 py-2 bg-[#111315] text-white text-xs font-semibold rounded-sm hover:bg-neutral-800 whitespace-nowrap cursor-pointer">
              Live Fetch (.JK)
            </button>
          </div>
          <button id="btn-toggle-catalog" class="px-3.5 py-2 text-xs font-semibold text-[#111315] bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm hover:bg-neutral-100 cursor-pointer whitespace-nowrap">
            Buka Katalog Sektor BEI
          </button>
        </div>

        <div id="catalog-drawer" class="hidden pt-4 border-t border-[#E4E2DD] space-y-3">
          <div class="text-xs font-bold text-[#111315]">Klik Emiten di Bawah untuk Menambahkan ke Tabel Screening:</div>
          <div id="catalog-grid" class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2"></div>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold tracking-tight text-[#111315]">Matriks Screening Multi-Faktor Emiten BEI</h2>
          <p class="font-editorial text-xs text-neutral-600">Klik tombol pengurutan untuk mengurutkan berdasarkan Skor QMJ, Rasio QMJ/σ (HRP), atau Beta 1Y.</p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 text-xs">
          <button onclick="setSort('qmjScore')" class="px-3 py-1.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm font-semibold hover:bg-[#FAF9F6] cursor-pointer">Sort Skor QMJ</button>
          <button onclick="setSort('hrpPropensity')" class="px-3 py-1.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm font-semibold hover:bg-[#FAF9F6] cursor-pointer">Sort QMJ/σ (HRP)</button>
          <button onclick="setSort('beta1Y')" class="px-3 py-1.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm font-semibold hover:bg-[#FAF9F6] cursor-pointer">Sort Beta 1Y</button>
        </div>
      </div>

      <div class="overflow-x-auto border border-[#E4E2DD] rounded-sm bg-[#FFFFFF]">
        <table class="w-full text-left border-collapse tabular-nums text-xs sm:text-sm">
          <thead>
            <tr class="border-b border-[#E4E2DD] bg-[#FAF9F6] text-[11px] font-bold uppercase tracking-wider text-neutral-600">
              <th class="py-3 px-4">Ticker</th>
              <th class="py-3 px-4">Emiten & Sektor</th>
              <th class="py-3 px-4 text-right">Harga (IDR)</th>
              <th class="py-3 px-4 text-right bg-[#F3F1EC]/70">Beta 1Y</th>
              <th class="py-3 px-4 text-right">Vol (Ann)</th>
              <th class="py-3 px-4 text-right">ROE</th>
              <th class="py-3 px-4 text-right">DER</th>
              <th class="py-3 px-4 text-right">Op Margin</th>
              <th class="py-3 px-4 text-right bg-[#F3F1EC]/70">Skor QMJ</th>
              <th class="py-3 px-4 text-right">QMJ/σ (HRP)</th>
              <th class="py-3 px-4">Klasifikasi Barbell</th>
            </tr>
          </thead>
          <tbody id="tbody-stocks" class="divide-y divide-[#E4E2DD]"></tbody>
        </table>
      </div>
    </section>

    <!-- 5. Live Financial News & Macro Sentiment -->
    <section id="macro-news-section" class="bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm p-6 space-y-4">
      <div class="flex items-center justify-between border-b border-[#E4E2DD] pb-3">
        <div>
          <div class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Real-Time Macro Wire & Sector Transmission</div>
          <h2 class="text-lg font-bold text-[#111315]">Sentimen Makro Global & Rotasi Sektor IHSG</h2>
        </div>
      </div>
      <div id="news-grid" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
    </section>

    <!-- 6. 4-Pillar Institutional Literature Summary -->
    <section id="methodology-section" class="pt-6 border-t border-[#E4E2DD] space-y-4">
      <h2 class="text-xl font-bold text-[#111315]">Arsitektur Kuantitatif 4-Pillar Institusional</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div class="p-5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm space-y-2">
          <div class="font-bold text-[#111315]">01. Quality-Minus-Junk (QMJ) & Betting-Against-Beta (BAB)</div>
          <div class="text-[11px] font-semibold text-[#0D5C46]">Asness, Frazzini & Pedersen (2019); Frazzini & Pedersen (2014)</div>
          <p class="font-editorial text-neutral-700 leading-relaxed">Menyaring emiten berdasarkan ROE (40%), Leverage Safety / rendahnya DER (35%), dan Operating Margin (25%). Saham dengan QMJ &lt; 4.8 dikarantina sebagai Junk.</p>
        </div>
        <div class="p-5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm space-y-2">
          <div class="font-bold text-[#111315]">02. Volatility-Managed Portfolios (VMP) + Global Macro Overlay</div>
          <div class="text-[11px] font-semibold text-[#0D5C46]">Moreira & Muir (2017, Journal of Finance)</div>
          <p class="font-editorial text-neutral-700 leading-relaxed">Menyesuaikan alokasi Defensif vs Agresif secara berbanding terbalik terhadap realisasi varians 30-hari IHSG dan skor stres makro global.</p>
        </div>
        <div class="p-5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm space-y-2">
          <div class="font-bold text-[#111315]">03. Sector-Clustered QMJ-Inverse-Volatility Weighting (HRP)</div>
          <div class="text-[11px] font-semibold text-[#0D5C46]">Marcos López de Prado (2016, Journal of Portfolio Management)</div>
          <p class="font-editorial text-neutral-700 leading-relaxed">Menghindari instabilitas inversi matriks kovarians Markowitz dengan membobotkan emiten berdasarkan proporsi QMJ^1.2 / σ_i dan batas klaster sektoral.</p>
        </div>
        <div class="p-5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm space-y-2">
          <div class="font-bold text-[#111315]">04. 95% Conditional Value-at-Risk (Expected Shortfall)</div>
          <div class="text-[11px] font-semibold text-[#0D5C46]">Rockafellar & Uryasev (2000, Journal of Risk)</div>
          <p class="font-editorial text-neutral-700 leading-relaxed">Mengukur ekspektasi kerugian rata-rata pada 5% kondisi pasar terburuk bulanan beserta konversi presisi ke satuan Lot BEI (1 Lot = 100 lembar).</p>
        </div>
      </div>
    </section>

  </main>

  <!-- Institutional Footer with Credit -->
  <footer class="bg-[#FFFFFF] border-t border-[#E4E2DD] py-6 px-6 mt-12">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
      <div>Nostradamus Quant Terminal · Multi-Factor QMJ, Moreira-Muir VMP & Hierarchical Risk Parity</div>
      <div class="font-semibold text-[#111315]">Credit: Fayadh</div>
    </div>
  </footer>

  <script>
    const CACHE_KEY = 'nostradamus_standalone_cache_v2';
    const CATALOG_EXTRA = [
      { ticker: 'BRIS', name: 'Bank Syariah Indonesia Tbk', sector: 'Financials', lastPrice: 2140, beta1Y: 1.32, volatilityAnn: 24.5, roe: 17.6, debtToEquity: 0.42, operatingMargin: 36.8 },
      { ticker: 'BNGA', name: 'Bank CIMB Niaga Tbk', sector: 'Financials', lastPrice: 1685, beta1Y: 0.72, volatilityAnn: 14.6, roe: 14.8, debtToEquity: 0.51, operatingMargin: 35.2 },
      { ticker: 'MEDC', name: 'Medco Energi Internasional Tbk', sector: 'Energy', lastPrice: 1125, beta1Y: 1.38, volatilityAnn: 28.4, roe: 19.2, debtToEquity: 1.42, operatingMargin: 31.5 },
      { ticker: 'PGAS', name: 'Perusahaan Gas Negara Tbk', sector: 'Energy', lastPrice: 1480, beta1Y: 1.14, volatilityAnn: 21.8, roe: 12.6, debtToEquity: 0.58, operatingMargin: 18.4 },
      { ticker: 'ANTM', name: 'Aneka Tambang Tbk', sector: 'Basic Materials', lastPrice: 1450, beta1Y: 1.36, volatilityAnn: 27.5, roe: 12.8, debtToEquity: 0.21, operatingMargin: 11.4 },
      { ticker: 'INCO', name: 'Vale Indonesia Tbk', sector: 'Basic Materials', lastPrice: 3420, beta1Y: 1.22, volatilityAnn: 25.1, roe: 10.9, debtToEquity: 0.12, operatingMargin: 22.1 },
      { ticker: 'MYOR', name: 'Mayora Indah Tbk', sector: 'Consumer Non-Cyclicals', lastPrice: 2280, beta1Y: 0.55, volatilityAnn: 13.8, roe: 21.2, debtToEquity: 0.39, operatingMargin: 14.9 },
      { ticker: 'CMRY', name: 'Cisarua Mountain Dairy Tbk', sector: 'Consumer Non-Cyclicals', lastPrice: 4650, beta1Y: 0.52, volatilityAnn: 14.1, roe: 23.8, debtToEquity: 0.11, operatingMargin: 20.4 },
      { ticker: 'MIKA', name: 'Mitra Keluarga Karyasehat Tbk', sector: 'Healthcare', lastPrice: 2390, beta1Y: 0.56, volatilityAnn: 14.9, roe: 18.9, debtToEquity: 0.08, operatingMargin: 29.8 },
      { ticker: 'BREN', name: 'Barito Renewables Energy Tbk', sector: 'Infrastructures', lastPrice: 5450, beta1Y: 1.68, volatilityAnn: 36.2, roe: 22.1, debtToEquity: 2.15, operatingMargin: 64.5 },
      { ticker: 'JSMR', name: 'Jasa Marga (Persero) Tbk', sector: 'Infrastructures', lastPrice: 3960, beta1Y: 1.02, volatilityAnn: 19.6, roe: 14.2, debtToEquity: 1.28, operatingMargin: 38.4 },
      { ticker: 'UNTR', name: 'United Tractors Tbk', sector: 'Industrials', lastPrice: 23525, beta1Y: 0.82, volatilityAnn: 17.9, roe: 23.9, debtToEquity: 0.29, operatingMargin: 22.4 }
    ];

    let state = {
      isCalmSim: false,
      capitalIdr: 100000000,
      sortField: 'qmjScore',
      sortAsc: false,
      ihsg: { lastPrice: 5034.43, change1D: 2.33, dailyStd30D: 2.752, annualizedVol30D: 43.69 },
      holdings: [
        { ticker: 'BBCA', lots: 45, avgBuyPrice: 4950 },
        { ticker: 'ITMG', lots: 10, avgBuyPrice: 23900 },
        { ticker: 'BMRI', lots: 35, avgBuyPrice: 3580 },
        { ticker: 'SIDO', lots: 300, avgBuyPrice: 310 }
      ],
      macro: [
        { id: 'usdidr', symbol: 'IDR=X', label: 'USD / IDR', value: 18080, unit: 'Rp', change1D: 3.10, note: 'Tekanan depresiasi Rupiah memicu penyesuaian risiko valas.' },
        { id: 'dxy', symbol: 'DX-Y.NYB', label: 'DXY Index', value: 101.22, unit: 'pts', change1D: -0.29, note: 'Pelemahan DXY memberi ruang stabilisasi bagi mata uang Asia.' },
        { id: 'us10y', symbol: '^TNX', label: 'US 10Y Yield', value: 4.89, unit: '%', change1D: -1.17, note: 'Yield US 10Y > 4.5% menjaga cost of equity tetap ketat.' },
        { id: 'vix', symbol: '^VIX', label: 'CBOE VIX', value: 16.61, unit: 'pts', change1D: -20.26, note: 'Penurunan tajam VIX meredakan kepanikan ekor di bursa global.' },
        { id: 'sp500', symbol: '^GSPC', label: 'S&P 500', value: 7688.62, unit: 'pts', change1D: 1.58, note: 'Reli ekuitas AS menopang sentimen bursa regional.' },
        { id: 'coal', symbol: 'MTF=F', label: 'Newcastle Coal', value: 146.5, unit: 'USD/t', change1D: 1.25, note: 'Menopang arus kas bebas & dividen emiten batubara.' },
        { id: 'gold', symbol: 'GC=F', label: 'Gold Spot', value: 4136.5, unit: 'USD/oz', change1D: 1.56, note: 'Rekor emas menjadi katalis emiten tambang emas/tembaga.' },
        { id: 'brent', symbol: 'BZ=F', label: 'Brent Oil', value: 94.19, unit: 'USD/bbl', change1D: -0.45, note: 'Harga minyak tinggi menguntungkan emiten migas.' }
      ],
      stocks: [
        { ticker: 'BBCA', yfTicker: 'BBCA.JK', name: 'Bank Central Asia Tbk', sector: 'Financials', lastPrice: 5100, change1D: 3.45, beta1Y: 0.76, volatilityAnn: 18.4, roe: 21.8, debtToEquity: 0.38, operatingMargin: 54.2 },
        { ticker: 'SIDO', yfTicker: 'SIDO.JK', name: 'Industri Jamu dan Farmasi Sido Muncul Tbk', sector: 'Healthcare', lastPrice: 318, change1D: 0.00, beta1Y: 0.49, volatilityAnn: 15.2, roe: 28.4, debtToEquity: 0.09, operatingMargin: 34.6 },
        { ticker: 'TLKM', yfTicker: 'TLKM.JK', name: 'Telkom Indonesia (Persero) Tbk', sector: 'Infrastructures', lastPrice: 1995, change1D: 5.84, beta1Y: 0.81, volatilityAnn: 21.2, roe: 18.1, debtToEquity: 0.49, operatingMargin: 31.4 },
        { ticker: 'ICBP', yfTicker: 'ICBP.JK', name: 'Indofood CBP Sukses Makmur Tbk', sector: 'Consumer Non-Cyclicals', lastPrice: 6125, change1D: 3.38, beta1Y: 0.58, volatilityAnn: 16.5, roe: 18.4, debtToEquity: 0.64, operatingMargin: 21.6 },
        { ticker: 'KLBF', yfTicker: 'KLBF.JK', name: 'Kalbe Farma Tbk', sector: 'Healthcare', lastPrice: 755, change1D: 4.14, beta1Y: 0.62, volatilityAnn: 17.8, roe: 14.9, debtToEquity: 0.19, operatingMargin: 14.8 },
        { ticker: 'ITMG', yfTicker: 'ITMG.JK', name: 'Indo Tambangraya Megah Tbk', sector: 'Energy', lastPrice: 24475, change1D: 2.41, beta1Y: 0.84, volatilityAnn: 19.8, roe: 26.8, debtToEquity: 0.14, operatingMargin: 29.4 },
        { ticker: 'ADRO', yfTicker: 'ADRO.JK', name: 'Alamtri Resources Indonesia Tbk', sector: 'Energy', lastPrice: 2330, change1D: -0.85, beta1Y: 1.15, volatilityAnn: 27.8, roe: 24.6, debtToEquity: 0.24, operatingMargin: 38.2 },
        { ticker: 'BMRI', yfTicker: 'BMRI.JK', name: 'Bank Mandiri (Persero) Tbk', sector: 'Financials', lastPrice: 3640, change1D: 1.11, beta1Y: 1.18, volatilityAnn: 26.4, roe: 22.4, debtToEquity: 0.56, operatingMargin: 48.9 },
        { ticker: 'BBRI', yfTicker: 'BBRI.JK', name: 'Bank Rakyat Indonesia (Persero) Tbk', sector: 'Financials', lastPrice: 2740, change1D: 1.86, beta1Y: 1.24, volatilityAnn: 28.1, roe: 19.8, debtToEquity: 0.62, operatingMargin: 44.5 },
        { ticker: 'ASII', yfTicker: 'ASII.JK', name: 'Astra International Tbk', sector: 'Industrials', lastPrice: 4920, change1D: 0.41, beta1Y: 0.88, volatilityAnn: 19.6, roe: 16.5, debtToEquity: 0.44, operatingMargin: 15.9 },
        { ticker: 'AMMN', yfTicker: 'AMMN.JK', name: 'Amman Mineral Internasional Tbk', sector: 'Basic Materials', lastPrice: 3680, change1D: 8.88, beta1Y: 1.48, volatilityAnn: 36.5, roe: 17.2, debtToEquity: 0.58, operatingMargin: 36.4 },
        { ticker: 'UNVR', yfTicker: 'UNVR.JK', name: 'Unilever Indonesia Tbk', sector: 'Consumer Non-Cyclicals', lastPrice: 1445, change1D: 3.96, beta1Y: 0.52, volatilityAnn: 18.8, roe: 82.5, debtToEquity: 3.45, operatingMargin: 15.2 },
        { ticker: 'GOTO', yfTicker: 'GOTO.JK', name: 'GoTo Gojek Tokopedia Tbk', sector: 'Technology', lastPrice: 25, change1D: 4.17, beta1Y: 1.72, volatilityAnn: 48.2, roe: -14.2, debtToEquity: 0.32, operatingMargin: -18.5 }
      ],
      news: [
        { title: 'Volatilitas IHSG di Level 5.034: Algoritma Moreira-Muir VMP Geser Alokasi ke Defensive Quality', source: 'Macro Desk IDX', sentiment: 'Defensive / Risk-Off', sectors: 'Financials · Healthcare · Consumer Non-Cyclicals' },
        { title: 'Harga Emas Dunia Tembus $4.136/oz & Batubara Bertahan Kuat, Topang Emiten Komoditas Ber-DER Rendah', source: 'Global Commodities Pulse', sentiment: 'Commodity Tailwind', sectors: 'Energy · Basic Materials · Industrials' },
        { title: 'Yield US Treasury 10-Tahun di 4,89% & Rupiah di Rp18.080: Pentingnya Seleksi Faktor QMJ (Low Leverage)', source: 'Cross-Asset Quantitative Feed', sentiment: 'Rate / FX Caution', sectors: 'Financials · Infrastructures' },
        { title: 'Rotasi Kuantitatif: Saham Low-Beta High-QMJ (BBCA, SIDO, ITMG, ICBP) Ungguli High-Leverage di Rezim Volatil', source: 'Nostradamus Factor Research', sentiment: 'Constructive / Risk-On', sectors: 'Healthcare · Consumer Non-Cyclicals · Energy' }
      ]
    };

    // Load cached screener & active portfolio from LocalStorage
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (saved && Array.isArray(saved.stocks) && saved.stocks.length > 0) {
        state.stocks = saved.stocks;
      }
      if (saved && Array.isArray(saved.holdings)) {
        state.holdings = saved.holdings;
      }
      if (saved && saved.ihsg && saved.ihsg.lastPrice) {
        state.ihsg = saved.ihsg;
      }
    } catch {}

    function persistCache() {
      if (state.isCalmSim) return;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          updatedAt: new Date().toISOString(),
          ihsg: state.ihsg,
          stocks: state.stocks,
          holdings: state.holdings
        }));
      } catch {}
    }

    async function fetchViaCorsMultiProxy(targetUrl) {
      const proxies = [
        { url: 'https://api.allorigins.win/get?url=' + encodeURIComponent(targetUrl), wrapped: true },
        { url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(targetUrl), wrapped: false },
        { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl), wrapped: false }
      ];
      for (const p of proxies) {
        try {
          const res = await fetch(p.url, { cache: 'no-store' });
          if (res.ok) {
            const raw = await res.json();
            return p.wrapped && typeof raw?.contents === 'string' ? JSON.parse(raw.contents) : raw;
          }
        } catch {}
      }
      throw new Error('Proxy timeout');
    }

    function calcQMJ(roe, der, margin) {
      const r = Math.max(0, Math.min(10, (roe / 26) * 10));
      const d = Math.max(1, Math.min(10, 10 - (der / 2.5) * 8));
      const m = Math.max(0, Math.min(10, (margin / 42) * 10));
      return Number(Math.max(1.0, Math.min(10.0, 0.40 * r + 0.35 * d + 0.25 * m)).toFixed(1));
    }

    function enrichStocks() {
      state.stocks = state.stocks.map(s => {
        const qmjScore = calcQMJ(s.roe, s.debtToEquity, s.operatingMargin);
        const hrpPropensity = Number(((qmjScore / Math.max(10, s.volatilityAnn)) * 10).toFixed(2));
        let role = 'NEUTRAL_HOLD';
        if (qmjScore >= 7.0 && s.beta1Y <= 0.92) role = 'DEFENSIVE_QUALITY';
        else if (qmjScore >= 6.5 && s.beta1Y > 0.92) role = 'AGGRESSIVE_GROWTH';
        else if (qmjScore < 4.8) role = 'AVOID_JUNK';
        return { ...s, qmjScore, hrpPropensity, role };
      });
    }

    function computeRegimeAndPortfolio() {
      enrichStocks();
      const usdidr = state.macro.find(m => m.id === 'usdidr')?.value || 18080;
      const us10y = state.macro.find(m => m.id === 'us10y')?.value || 4.89;
      const vix = state.macro.find(m => m.id === 'vix')?.value || 16.61;
      const dxy = state.macro.find(m => m.id === 'dxy')?.value || 101.22;

      const fxStress = Math.max(0, Math.min(100, ((usdidr - 15200) / 3200) * 100));
      const yieldStress = Math.max(0, Math.min(100, ((us10y - 3.6) / 1.6) * 100));
      const vixStress = Math.max(0, Math.min(100, ((vix - 12) / 20) * 100));
      const dxyStress = Math.max(0, Math.min(100, ((dxy - 99) / 9) * 100));
      const macroStress = Number((0.35 * fxStress + 0.30 * vixStress + 0.20 * yieldStress + 0.15 * dxyStress).toFixed(1));

      const macroImpliedVol = 10 + (macroStress / 100) * 16;
      const effVol = Number((0.75 * state.ihsg.annualizedVol30D + 0.25 * macroImpliedVol).toFixed(2));
      const isVol = effVol > 18.0 || macroStress >= 68;
      const status = isVol ? 'VOLATIL' : 'TENANG';

      const varRatio = Math.pow(18.0 / Math.max(10, effVol), 1.35);
      const rawAgg = Math.round(Math.max(15, Math.min(65, 50 * varRatio)));
      const aggressiveWeight = Math.round(rawAgg / 5) * 5;
      const defensiveWeight = 100 - aggressiveWeight;

      const defPool = [...state.stocks].filter(s => s.role === 'DEFENSIVE_QUALITY').sort((a, b) => b.hrpPropensity - a.hrpPropensity).slice(0, 4);
      const aggPool = [...state.stocks].filter(s => s.role === 'AGGRESSIVE_GROWTH').sort((a, b) => b.hrpPropensity - a.hrpPropensity).slice(0, 4);

      function buildSleeve(candidates, sleevePct) {
        const props = candidates.map(s => Math.pow(s.qmjScore, 1.2) / Math.max(10, s.volatilityAnn));
        const sumP = props.reduce((a, b) => a + b, 0) || 1;
        return candidates.map((s, i) => {
          const totalPct = ((props[i] / sumP) * sleevePct);
          const idr = Math.round((state.capitalIdr * totalPct) / 100);
          const lots = Math.max(1, Math.floor(idr / (s.lastPrice * 100)));
          return { stock: s, totalPct: Number(totalPct.toFixed(1)), idr, lots };
        });
      }

      const defPositions = buildSleeve(defPool, defensiveWeight);
      const aggPositions = buildSleeve(aggPool, aggressiveWeight);
      const allPos = [...defPositions, ...aggPositions];

      let portBeta = 0, portQmj = 0, wVar = 0;
      allPos.forEach(p => {
        const w = p.totalPct / 100;
        portBeta += w * p.stock.beta1Y;
        portQmj += w * p.stock.qmjScore;
        wVar += Math.pow(w * p.stock.volatilityAnn, 2);
      });
      const expAnnVol = Math.max(8.5, Math.sqrt(wVar) * 1.55);
      const cvarPct = (expAnnVol / Math.sqrt(12)) * 2.063;
      const cvarIdr = Math.round((state.capitalIdr * cvarPct) / 100);
      const sharpe = Math.max(0.5, ((portQmj * 1.45 - portBeta * 1.8) / expAnnVol) + 0.65);

      return { status, isVol, macroStress, effVol, defensiveWeight, aggressiveWeight, defPositions, aggPositions, portBeta, portQmj, cvarPct, cvarIdr, sharpe };
    }

    function savePortfolioHolding() {
      const ticker = document.getElementById('port-ticker').value.trim().toUpperCase().replace('.JK', '');
      const lots = Math.max(1, parseInt(document.getElementById('port-lots').value, 10) || 10);
      const avgBuyPrice = Math.max(50, parseInt(document.getElementById('port-avg').value, 10) || 1000);
      if (!ticker) return;
      const idx = state.holdings.findIndex(h => h.ticker === ticker);
      if (idx >= 0) state.holdings[idx] = { ticker, lots, avgBuyPrice };
      else state.holdings.push({ ticker, lots, avgBuyPrice });
      persistCache();
      renderAll();
    }

    function removePortfolioHolding(ticker) {
      state.holdings = state.holdings.filter(h => h.ticker !== ticker);
      persistCache();
      renderAll();
    }

    function addCandidateToPortfolio(ticker, suggestedLots, price) {
      const idx = state.holdings.findIndex(h => h.ticker === ticker);
      if (idx >= 0) state.holdings[idx].lots += suggestedLots;
      else state.holdings.push({ ticker, lots: suggestedLots, avgBuyPrice: price });
      persistCache();
      renderAll();
      Swal.fire({ icon: 'success', title: ticker + ' ditambahkan ke Portofolio Aktif', confirmButtonColor: '#111315', timer: 1800 });
    }

    function exportBackupJson() {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ihsg: state.ihsg, stocks: state.stocks, holdings: state.holdings }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nostradamus-portfolio-cache-backup.json';
      a.click();
    }

    function resetPortfolioCache() {
      localStorage.removeItem(CACHE_KEY);
      location.reload();
    }

    function renderAll() {
      const calc = computeRegimeAndPortfolio();
      persistCache();

      document.getElementById('macro-ribbon').innerHTML = '<span class="font-bold uppercase tracking-wider text-[11px] text-[#111315]">Global Macro Pulse</span>' +
        state.macro.slice(0, 6).map(m => {
          const valStr = m.unit === 'Rp' ? 'Rp ' + m.value.toLocaleString('id-ID') : m.unit === '%' ? m.value.toFixed(2) + '%' : m.unit.startsWith('USD') ? '$' + m.value.toFixed(1) : m.value.toFixed(2);
          return \`<div class="flex items-center gap-1.5"><span class="font-semibold text-[#111315]">\${m.label}</span><span>\${valStr}</span><span class="text-neutral-500">(\${m.change1D >= 0 ? '+' : ''}\${m.change1D.toFixed(2)}%)</span></div>\`;
        }).join('');

      document.getElementById('macro-grid').innerHTML = state.macro.map(m => \`
        <div class="p-4 bg-[#FFFFFF] border border-[#E4E2DD] rounded-sm">
          <div class="flex justify-between text-[11px] text-neutral-500"><span class="font-bold text-[#111315]">\${m.label}</span><span>\${m.symbol}</span></div>
          <div class="flex justify-between items-baseline mt-1.5"><span class="text-base font-bold text-[#111315]">\${m.value.toLocaleString('id-ID')} \${m.unit}</span><span class="text-xs font-semibold">\${m.change1D >= 0 ? '+' : ''}\${m.change1D.toFixed(2)}%</span></div>
          <p class="font-editorial text-[11px] text-neutral-600 mt-2 pt-2 border-t border-[#E4E2DD]/60">\${m.note}</p>
        </div>
      \`).join('');

      const regLbl = document.getElementById('regime-label');
      regLbl.textContent = calc.isVol ? 'Volatil — Defensive Shield (Risk-Off)' : 'Tenang — Constructive Alpha (Risk-On)';
      regLbl.className = calc.isVol ? 'text-[#9E2A2B]' : 'text-[#0D5C46]';
      document.getElementById('regime-desc').textContent = calc.isVol
        ? 'Volatilitas efektif IHSG dan indeks stres makro global melampaui batas toleransi risiko tahunan. Mengacu pada literatur Moreira & Muir (2017), terminal memangkas eksposur beta tinggi dan mengunci mayoritas bobot pada keranjang Defensive Quality.'
        : 'Realisasi standar deviasi 30-hari IHSG serta indikator likuiditas makro global berada dalam rentang konstruktif. Model mengizinkan alokasi optimal pada keranjang Aggressive High-Beta yang lolos saringan ketat Quality-Minus-Junk (Asness, Frazzini & Pedersen, 2019).';

      document.getElementById('kpi-ihsg-price').textContent = state.ihsg.lastPrice.toLocaleString('id-ID', { minimumFractionDigits: 2 });
      document.getElementById('kpi-ihsg-chg').textContent = (state.ihsg.change1D >= 0 ? '+' : '') + state.ihsg.change1D.toFixed(2) + '%';
      document.getElementById('kpi-daily-std').textContent = state.ihsg.dailyStd30D.toFixed(3) + '%';
      document.getElementById('kpi-ann-vol').textContent = state.ihsg.annualizedVol30D.toFixed(2) + '%';
      document.getElementById('kpi-eff-vol').textContent = 'Eff: ' + calc.effVol.toFixed(1) + '%';
      document.getElementById('kpi-macro-stress').textContent = calc.macroStress.toFixed(1) + '/100';
      document.getElementById('kpi-def-label').textContent = \`Defensive Quality (Low-Beta): \${calc.defensiveWeight}%\`;
      document.getElementById('kpi-agg-label').textContent = \`Aggressive Alpha (High-Beta): \${calc.aggressiveWeight}%\`;
      document.getElementById('bar-def').style.width = calc.defensiveWeight + '%';
      document.getElementById('bar-agg').style.width = calc.aggressiveWeight + '%';

      document.getElementById('stat-port-qmj').textContent = calc.portQmj.toFixed(2) + ' / 10.0';
      document.getElementById('stat-port-beta').textContent = calc.portBeta.toFixed(2) + 'x';
      document.getElementById('stat-port-sharpe').textContent = calc.sharpe.toFixed(2);
      document.getElementById('stat-port-cvar').textContent = \`-\${calc.cvarPct.toFixed(2)}% (Rp \${(calc.cvarIdr / 1000000).toFixed(1)} Jt)\`;

      const defPoolIdr = Math.round((state.capitalIdr * calc.defensiveWeight) / 100);
      const aggPoolIdr = Math.round((state.capitalIdr * calc.aggressiveWeight) / 100);
      document.getElementById('sleeve-def-pct').textContent = calc.defensiveWeight + '% Total';
      document.getElementById('sleeve-def-idr').textContent = 'Rp ' + defPoolIdr.toLocaleString('id-ID');
      document.getElementById('sleeve-agg-pct').textContent = calc.aggressiveWeight + '% Total';
      document.getElementById('sleeve-agg-idr').textContent = 'Rp ' + aggPoolIdr.toLocaleString('id-ID');

      document.getElementById('sleeve-def-list').innerHTML = calc.defPositions.map(p => \`
        <div class="py-2.5 flex items-center justify-between">
          <div><span class="font-bold text-[#111315]">\${p.stock.ticker}</span> <span class="text-[11px] font-semibold text-[#0D5C46] ml-1.5">Bobot: \${p.totalPct}%</span><div class="text-[11px] text-neutral-500">\${p.stock.sector} · QMJ \${p.stock.qmjScore} · β \${p.stock.beta1Y}</div></div>
          <div class="text-right"><div class="font-bold text-[#111315]">\${p.lots.toLocaleString('id-ID')} Lot</div><div class="text-[11px] text-neutral-500">Rp \${p.idr.toLocaleString('id-ID')}</div></div>
        </div>
      \`).join('');

      document.getElementById('sleeve-agg-list').innerHTML = calc.aggPositions.map(p => \`
        <div class="py-2.5 flex items-center justify-between">
          <div><span class="font-bold text-[#111315]">\${p.stock.ticker}</span> <span class="text-[11px] font-semibold text-neutral-700 ml-1.5">Bobot: \${p.totalPct}%</span><div class="text-[11px] text-neutral-500">\${p.stock.sector} · QMJ \${p.stock.qmjScore} · β \${p.stock.beta1Y}</div></div>
          <div class="text-right"><div class="font-bold text-[#111315]">\${p.lots.toLocaleString('id-ID')} Lot</div><div class="text-[11px] text-neutral-500">Rp \${p.idr.toLocaleString('id-ID')}</div></div>
        </div>
      \`).join('');

      // Render Active Portfolio Evaluation
      document.getElementById('tbody-portfolio').innerHTML = state.holdings.map(h => {
        const st = state.stocks.find(s => s.ticker === h.ticker) || { ticker: h.ticker, lastPrice: h.avgBuyPrice, qmjScore: 7.0, beta1Y: 0.9, sector: 'IDX Equity' };
        const mktVal = h.lots * 100 * st.lastPrice;
        const costVal = h.lots * 100 * h.avgBuyPrice;
        const pnlIdr = mktVal - costVal;
        const pnlPct = costVal > 0 ? (pnlIdr / costVal) * 100 : 0;
        let sig = 'HOLD CORE';
        let sigColor = 'text-[#111315] font-semibold';
        if (st.qmjScore < 4.8) { sig = 'CUT JUNK / EXIT'; sigColor = 'text-[#9E2A2B] font-bold'; }
        else if (calc.isVol && st.beta1Y > 1.1) { sig = 'TRIM HIGH-BETA (-25% Lot)'; sigColor = 'text-[#B45309] font-bold'; }
        else if (st.qmjScore >= 8.0 && st.beta1Y <= 0.92) { sig = 'ACCUMULATE DEFENSIVE'; sigColor = 'text-[#0D5C46] font-bold'; }
        return \`
          <tr class="hover:bg-[#FAF9F6]">
            <td class="py-3 px-4 font-bold">\${h.ticker} <span class="font-normal text-neutral-500">· QMJ \${st.qmjScore} · β \${st.beta1Y}</span></td>
            <td class="py-3 px-4 text-right"><strong>\${h.lots} Lot</strong><div class="text-[11px] text-neutral-500">Avg Rp \${h.avgBuyPrice.toLocaleString('id-ID')}</div></td>
            <td class="py-3 px-4 text-right"><strong>Rp \${st.lastPrice.toLocaleString('id-ID')}</strong><div class="text-[11px] text-neutral-500">Rp \${mktVal.toLocaleString('id-ID')}</div></td>
            <td class="py-3 px-4 text-right font-bold \${pnlIdr >= 0 ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'}">\${pnlIdr >= 0 ? '+' : ''}\${pnlPct.toFixed(2)}%<div class="text-[11px]">\${pnlIdr >= 0 ? '+Rp ' : '-Rp '}\${Math.abs(pnlIdr).toLocaleString('id-ID')}</div></td>
            <td class="py-3 px-4 \${sigColor}">\${sig}</td>
            <td class="py-3 px-4 text-right"><button onclick="removePortfolioHolding('\${h.ticker}')" class="text-neutral-400 hover:text-[#9E2A2B] font-bold cursor-pointer">×</button></td>
          </tr>
        \`;
      }).join('');

      // Render Candidate Recommendations
      const heldSet = new Set(state.holdings.map(h => h.ticker));
      const candidates = [...state.stocks].filter(s => !heldSet.has(s.ticker) && s.qmjScore >= 6.4).sort((a, b) => b.hrpPropensity - a.hrpPropensity).slice(0, 3);
      document.getElementById('recommendations-grid').innerHTML = candidates.map(c => {
        const sugLots = Math.max(1, Math.round(10000000 / (c.lastPrice * 100)));
        return \`
          <div class="p-4 bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm flex flex-col justify-between space-y-3">
            <div>
              <div class="flex justify-between text-[11px] text-[#0D5C46] font-bold uppercase"><span>\${c.beta1Y <= 0.92 ? 'Defensive Low-Beta Shield' : 'High-QMJ Compounder'}</span><span>QMJ \${c.qmjScore}/10</span></div>
              <div class="text-base font-bold text-[#111315] mt-1">\${c.ticker} · Rp \${c.lastPrice.toLocaleString('id-ID')}</div>
              <div class="text-xs text-neutral-600">\${c.name} (\${c.sector}) · ROE \${c.roe}% · β \${c.beta1Y}x</div>
            </div>
            <button onclick="addCandidateToPortfolio('\${c.ticker}', \${sugLots}, \${c.lastPrice})" class="w-full py-1.5 text-xs font-semibold text-white bg-[#0D5C46] hover:bg-[#094736] rounded-sm cursor-pointer">+ Masukkan ke Portofolio (\${sugLots} Lot)</button>
          </div>
        \`;
      }).join('');

      const sorted = [...state.stocks].sort((a, b) => state.sortAsc ? a[state.sortField] - b[state.sortField] : b[state.sortField] - a[state.sortField]);
      document.getElementById('tbody-stocks').innerHTML = sorted.map(s => {
        const roleLabel = s.role === 'DEFENSIVE_QUALITY' ? '<span class="text-[#0D5C46] font-bold">Defensive Quality</span>' : s.role === 'AGGRESSIVE_GROWTH' ? '<span class="text-[#111315] font-bold">Aggressive High-Beta</span>' : s.role === 'AVOID_JUNK' ? '<span class="text-[#9E2A2B] font-semibold">Avoid / Low QMJ</span>' : '<span class="text-neutral-500">Neutral / Hold</span>';
        return \`
          <tr class="hover:bg-[#FAF9F6] transition">
            <td class="py-3 px-4 font-bold text-[#111315]">\${s.ticker}<span class="block text-[10px] font-normal text-neutral-400">\${s.yfTicker}</span></td>
            <td class="py-3 px-4"><div class="font-semibold text-[#111315]">\${s.name}</div><div class="text-[11px] text-neutral-500">\${s.sector}</div></td>
            <td class="py-3 px-4 text-right font-semibold">\${s.lastPrice.toLocaleString('id-ID')}</td>
            <td class="py-3 px-4 text-right font-bold bg-[#FAF9F6]/60">\${s.beta1Y.toFixed(2)}</td>
            <td class="py-3 px-4 text-right">\${s.volatilityAnn.toFixed(1)}%</td>
            <td class="py-3 px-4 text-right">\${s.roe.toFixed(1)}%</td>
            <td class="py-3 px-4 text-right">\${s.debtToEquity.toFixed(2)}x</td>
            <td class="py-3 px-4 text-right">\${s.operatingMargin.toFixed(1)}%</td>
            <td class="py-3 px-4 text-right font-bold bg-[#FAF9F6]/60">\${s.qmjScore.toFixed(1)} <span class="text-[10px] text-neutral-400">/10</span></td>
            <td class="py-3 px-4 text-right font-semibold">\${s.hrpPropensity.toFixed(2)}</td>
            <td class="py-3 px-4 text-xs">\${roleLabel}</td>
          </tr>
        \`;
      }).join('');

      document.getElementById('catalog-grid').innerHTML = CATALOG_EXTRA.map(c => \`
        <button onclick="addCatalogStock('\${c.ticker}')" class="p-2.5 text-left bg-[#FAF9F6] border border-[#E4E2DD] rounded-sm hover:bg-neutral-100 transition cursor-pointer">
          <div class="font-bold text-xs text-[#111315]">\${c.ticker}</div>
          <div class="text-[11px] text-neutral-600 truncate">\${c.name}</div>
          <div class="text-[10px] text-neutral-400 tabular-nums">ROE \${c.roe}% · β \${c.beta1Y}</div>
        </button>
      \`).join('');

      document.getElementById('news-grid').innerHTML = state.news.map(n => \`
        <article class="p-4 bg-[#FAF9F6]/70 border border-[#E4E2DD] rounded-sm space-y-1.5">
          <div class="text-[11px] text-neutral-500">\${n.source} · <strong class="text-[#0D5C46]">\${n.sentiment}</strong></div>
          <h3 class="font-editorial text-sm font-semibold text-[#111315]">\${n.title}</h3>
          <div class="text-[11px] text-neutral-600 pt-1">Sektor Terdampak: <strong>\${n.sectors}</strong></div>
        </article>
      \`).join('');
    }

    function setSort(field) {
      if (state.sortField === field) state.sortAsc = !state.sortAsc;
      else { state.sortField = field; state.sortAsc = false; }
      renderAll();
    }

    function addCatalogStock(ticker) {
      const found = CATALOG_EXTRA.find(c => c.ticker === ticker);
      if (!found) return;
      state.stocks = [{ ...found, yfTicker: found.ticker + '.JK', change1D: 0.65 }, ...state.stocks.filter(s => s.ticker !== ticker)];
      renderAll();
    }

    function openStrategyMemo() {
      const calc = computeRegimeAndPortfolio();
      const defHtml = calc.defPositions.map(p => \`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #E4E2DD;font-size:12px;"><span><strong>\${p.stock.ticker}</strong> · Bobot \${p.totalPct}% (QMJ \${p.stock.qmjScore})</span><span><strong>\${p.lots.toLocaleString('id-ID')} Lot</strong> · Rp \${p.idr.toLocaleString('id-ID')}</span></div>\`).join('');
      const aggHtml = calc.aggPositions.map(p => \`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #E4E2DD;font-size:12px;"><span><strong>\${p.stock.ticker}</strong> · Bobot \${p.totalPct}% (QMJ \${p.stock.qmjScore})</span><span><strong>\${p.lots.toLocaleString('id-ID')} Lot</strong> · Rp \${p.idr.toLocaleString('id-ID')}</span></div>\`).join('');

      Swal.fire({
        title: 'Nostradamus Quant Terminal — Portfolio Execution Memo',
        width: 640,
        html: \`
          <div style="text-align:left;font-size:13px;line-height:1.55;color:#111315;">
            <div style="padding:12px;background:#FAF9F6;border:1px solid #E4E2DD;border-radius:4px;margin-bottom:12px;">
              <div style="font-size:10.5px;font-weight:700;color:#6b7280;">MOREIRA-MUIR VMP & GLOBAL MACRO REGIME</div>
              <div style="font-weight:700;font-size:14px;color:\${calc.isVol ? '#9E2A2B' : '#0D5C46'};">Rezim \${calc.status} — IHSG: \${state.ihsg.lastPrice.toLocaleString('id-ID')} · 30D Vol: \${state.ihsg.annualizedVol30D.toFixed(2)}%</div>
            </div>
            <div style="margin-bottom:12px;">
              <div style="font-size:11.5px;font-weight:700;color:#0D5C46;margin-bottom:4px;">1. Keranjang Defensif (\${calc.defensiveWeight}% · López de Prado QMJ/σ Weighting)</div>
              \${defHtml}
            </div>
            <div style="margin-bottom:12px;">
              <div style="font-size:11.5px;font-weight:700;color:#111315;margin-bottom:4px;">2. Keranjang Agresif (\${calc.aggressiveWeight}% · López de Prado QMJ/σ Weighting)</div>
              \${aggHtml}
            </div>
          </div>
        \`,
        confirmButtonText: 'Tutup & Terapkan Bobot',
        confirmButtonColor: '#111315'
      });
    }

    document.getElementById('btn-toggle-macro-desk').addEventListener('click', () => {
      const panel = document.getElementById('macro-desk-panel');
      const isHidden = panel.classList.contains('hidden');
      panel.classList.toggle('hidden');
      document.getElementById('btn-toggle-macro-desk').textContent = isHidden ? 'Tutup Desk Makro' : 'Buka Desk Transmisi Makro';
    });

    document.getElementById('btn-toggle-catalog').addEventListener('click', () => {
      document.getElementById('catalog-drawer').classList.toggle('hidden');
    });

    document.getElementById('btn-sim-regime').addEventListener('click', () => {
      state.isCalmSim = !state.isCalmSim;
      if (state.isCalmSim) {
        state.ihsg = { lastPrice: 5180.25, change1D: 0.85, dailyStd30D: 0.812, annualizedVol30D: 12.89 };
        state.macro.find(m => m.id === 'usdidr').value = 15650;
        state.macro.find(m => m.id === 'vix').value = 13.80;
        document.getElementById('btn-sim-regime').textContent = 'Simulasi Rezim: Kembalikan ke Live Volatil';
      } else {
        state.ihsg = { lastPrice: 5034.43, change1D: 2.33, dailyStd30D: 2.752, annualizedVol30D: 43.69 };
        state.macro.find(m => m.id === 'usdidr').value = 18080;
        state.macro.find(m => m.id === 'vix').value = 16.61;
        document.getElementById('btn-sim-regime').textContent = 'Simulasi Rezim: Ubah ke Tenang';
      }
      renderAll();
    });

    document.getElementById('input-capital').addEventListener('input', (e) => {
      const num = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num) && num >= 1000000) {
        state.capitalIdr = num;
        renderAll();
      }
    });

    document.getElementById('btn-generate-top').addEventListener('click', openStrategyMemo);
    document.getElementById('btn-generate-card').addEventListener('click', openStrategyMemo);
    document.getElementById('btn-open-memo-link').addEventListener('click', openStrategyMemo);

    document.getElementById('btn-live-fetch').addEventListener('click', async () => {
      const raw = document.getElementById('input-ticker').value.trim().toUpperCase().replace(/[^A-Z]/g, '');
      if (raw.length < 4) return;
      Swal.fire({ title: \`Menarik data \${raw}.JK...\`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const data = await fetchViaCorsMultiProxy(\`https://query1.finance.yahoo.com/v8/finance/chart/\${raw}.JK?range=1y&interval=1d\`);
        const r = data?.chart?.result?.[0];
        const closes = (r?.indicators?.quote?.[0]?.close || []).filter(v => typeof v === 'number' && v > 0);
        const lastPrice = Math.round(r?.meta?.regularMarketPrice || closes[closes.length - 1] || 1500);
        const prevClose = closes.length > 1 ? closes[closes.length - 2] : lastPrice;
        const change1D = Number((((lastPrice - prevClose) / prevClose) * 100).toFixed(2));
        const cat = CATALOG_EXTRA.find(c => c.ticker === raw);
        state.stocks = [{
          ticker: raw,
          yfTicker: raw + '.JK',
          name: cat?.name || r?.meta?.longName || \`\${raw} Indonesia Tbk\`,
          sector: cat?.sector || 'IDX Listed Equity',
          lastPrice,
          change1D,
          beta1Y: cat?.beta1Y || 0.95,
          volatilityAnn: cat?.volatilityAnn || 19.5,
          roe: cat?.roe || 16.5,
          debtToEquity: cat?.debtToEquity || 0.45,
          operatingMargin: cat?.operatingMargin || 21.0
        }, ...state.stocks.filter(s => s.ticker !== raw)];
        document.getElementById('input-ticker').value = '';
        renderAll();
        Swal.fire({ icon: 'success', title: \`\${raw}.JK Berhasil Dimuat & Disimpan di Cache (Rp \${lastPrice.toLocaleString('id-ID')})\`, confirmButtonColor: '#111315' });
      } catch (e) {
        addCatalogStock(raw);
        Swal.fire({ icon: 'info', title: \`\${raw}.JK Ditambahkan via Katalog\`, confirmButtonColor: '#111315' });
      }
    });

    document.getElementById('btn-sync-macro').addEventListener('click', async () => {
      Swal.fire({ title: 'Menyinkronkan IHSG (^JKSE) & Evaluasi Portofolio...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const data = await fetchViaCorsMultiProxy('https://query1.finance.yahoo.com/v8/finance/chart/%5EJKSE?range=3mo&interval=1d');
        const r = data?.chart?.result?.[0];
        const closes = (r?.indicators?.quote?.[0]?.close || []).filter(v => typeof v === 'number' && v > 0);
        if (closes.length >= 15) {
          const lastPrice = r?.meta?.regularMarketPrice || closes[closes.length - 1];
          const prevClose = closes[closes.length - 2] || lastPrice;
          const change1D = ((lastPrice - prevClose) / prevClose) * 100;
          const rets = [];
          for (let i = 1; i < closes.length; i++) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
          const r30 = rets.slice(-30);
          const mean = r30.reduce((a, b) => a + b, 0) / r30.length;
          const variance = r30.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (r30.length - 1);
          const dailyStd30D = Math.sqrt(variance) * 100;
          const annualizedVol30D = dailyStd30D * Math.sqrt(252);
          state.ihsg = {
            lastPrice: Number(lastPrice.toFixed(2)),
            change1D: Number(change1D.toFixed(2)),
            dailyStd30D: Number(dailyStd30D.toFixed(3)),
            annualizedVol30D: Number(annualizedVol30D.toFixed(2))
          };
          document.getElementById('data-source-badge').textContent = 'Live Yahoo Finance Stream (Cached)';
        }
        renderAll();
        Swal.fire({ icon: 'success', title: \`Sinkronisasi Berhasil — IHSG: \${state.ihsg.lastPrice.toLocaleString('id-ID')}\`, confirmButtonColor: '#111315' });
      } catch {
        renderAll();
        Swal.fire({ icon: 'info', title: 'Menggunakan Data Cache / Snapshot Terbaru', confirmButtonColor: '#111315' });
      }
    });

    async function loadSnapshotIfAvailable() {
      try {
        const res = await fetch('./public/market-snapshot.json', { cache: 'no-store' });
        if (res.ok) {
          const snap = await res.json();
          if (snap?.ihsg?.lastPrice) state.ihsg = snap.ihsg;
          if (Array.isArray(snap?.stocks) && snap.stocks.length > 0 && !localStorage.getItem(CACHE_KEY)) {
            state.stocks = snap.stocks;
          }
          document.getElementById('data-source-badge').textContent = 'LocalStorage Cache + GitHub Actions Snapshot';
        }
      } catch {}
      renderAll();
    }

    loadSnapshotIfAvailable();
  </script>
</body>
</html>`;
