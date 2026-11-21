#!/usr/bin/env node
/**
 * Nostradamus Quant Terminal — Automated IDX Fundamentals & 20D ADTV Snapshot Fetcher
 *
 * Features:
 * 1. Yahoo Finance Cookie (fc.yahoo.com) + Crumb (/v1/test/getcrumb) session handshake.
 * 2. Low-concurrency batching (max 3 parallel tickers, 400ms inter-batch delay, exponential backoff)
 *    to prevent HTTP 429 rate-limiting.
 * 3. Strict IDX YTD-to-TTM Decumulator (Anti Linear Annualization):
 *    - Checks if naive 4Q sum exceeds 1.65x latestFullYearRevenue.
 *    - Prioritizes true TTM: (A) FY_prior + YTD_current - YTD_prior, or
 *      (B) cumulative-to-standalone quarterly subtraction within the same fiscal year.
 *    - Falls back to latestFullYear with note 'FY_FALLBACK' if prior-year comparator is unavailable.
 *    - NEVER uses linear multiplication (9M * 4/3 or 6M * 2) as primary TTM.
 * 4. Computes authentic 20-Day ADTV (IDR) from /v8/finance/chart 20-day (close * volume).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.resolve(__dirname, '../public/fundamentals-snapshot.json');

const CORE_IDX_TICKERS = [
  'BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'BYAN', 'TPIA', 'AMMN', 'BREN',
  'ADRO', 'ICBP', 'INDF', 'UNVR', 'KLBF', 'MIKA', 'HEAL', 'SILO', 'GOTO', 'AMRT',
  'ANTM', 'PGAS', 'PTBA', 'ITMG', 'UNTR', 'SMGR', 'INKP', 'TKIM', 'CPIN', 'JPFA',
  'MDKA', 'INCO', 'MEDC', 'AKRA', 'BRPT', 'EXCL', 'ISAT', 'MTEL', 'TOWR', 'TBIG',
  'JSMR', 'BSDE', 'CTRA', 'PWON', 'SMRA', 'MAPI', 'ACES', 'ERAA', 'MYOR', 'SIDO',
  'GGRM', 'HMSP', 'ARTO', 'BRIS', 'BBTN', 'BNGA', 'BDMN', 'NISP', 'PNBN', 'SRTG'
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const MAX_CONCURRENCY = 3;
const INTER_BATCH_DELAY_MS = 400;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json,text/plain,*/*',
          ...(options.headers || {}),
        },
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt < retries) {
          const backoffMs = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
          console.warn(`[HTTP ${response.status}] Rate limited/server busy on ${url}. Retrying in ${backoffMs}ms...`);
          await sleep(backoffMs);
          continue;
        }
      }
      return response;
    } catch (err) {
      if (attempt < retries) {
        const backoffMs = 700 * Math.pow(2, attempt);
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Exhausted retries for ${url}`);
}

async function acquireYahooCrumbSession() {
  try {
    const cookieRes = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'manual',
    });
    const rawSetCookies =
      typeof cookieRes.headers.getSetCookie === 'function'
        ? cookieRes.headers.getSetCookie()
        : [cookieRes.headers.get('set-cookie')].filter(Boolean);

    const cookieHeader = rawSetCookies
      .map((c) => String(c).split(';')[0])
      .filter(Boolean)
      .join('; ');

    if (!cookieHeader) {
      return { cookieHeader: '', crumb: '' };
    }

    const crumbRes = await fetchWithRetry('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { Cookie: cookieHeader },
    });
    if (!crumbRes.ok) {
      return { cookieHeader, crumb: '' };
    }
    const crumb = (await crumbRes.text()).trim();
    return { cookieHeader, crumb };
  } catch (err) {
    console.warn('[YahooAuth] Cookie/crumb handshake failed, proceeding with public timeseries endpoints:', err.message);
    return { cookieHeader: '', crumb: '' };
  }
}

/**
 * Extracts chronological series entries [{ asOfDate, periodType, reportedValue }]
 */
function extractTimeseriesPoints(resultArray, typeName) {
  const block = (resultArray || []).find(
    (item) => Array.isArray(item?.meta?.type) && item.meta.type[0] === typeName
  );
  const rawSeries = block?.[typeName] || [];
  return rawSeries
    .filter((pt) => pt && pt.asOfDate && Number.isFinite(Number(pt?.reportedValue?.raw)))
    .map((pt) => ({
      asOfDate: String(pt.asOfDate),
      periodType: String(pt.periodType || ''),
      currencyCode: String(pt.currencyCode || 'IDR'),
      value: Number(pt.reportedValue.raw),
    }))
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
}

/**
 * IDX YTD-to-TTM Decumulator (Anti Linear Annualization)
 *
 * Rules:
 * 1. If 4-quarter sum <= 1.65x latestFullYear (and > 0.35x latestFullYear), quarterly entries are standalone -> sum 4Q.
 * 2. If 4-quarter sum > 1.65x latestFullYear (IDX cumulative YTD reporting bug on Yahoo):
 *    - Priority A: True TTM via FY_prior + YTD_current - YTD_prior (matching fiscal month/quarter in prior year).
 *    - Priority B: Convert cumulative YTD quarters within each fiscal year into standalone quarters by differencing
 *      (Q1 = YTD_Q1, Q2 = YTD_Q2 - YTD_Q1, Q3 = YTD_Q3 - YTD_Q2) and sum 4 standalone quarters.
 *    - Priority C: Fallback to latestFullYear with method 'FY_FALLBACK' (NEVER linear 9M*4/3 or 6M*2).
 */
function decumulateIdxFlowSeries(quarterlyPoints, annualPoints, isRevenueReference = false, revenueRatioTriggered = false) {
  const latestFY = annualPoints.length > 0 ? annualPoints[annualPoints.length - 1] : null;
  const latestFYVal = latestFY ? latestFY.value : null;

  if (quarterlyPoints.length < 4) {
    if (latestFY) {
      return {
        ttmValue: latestFY.value,
        asOfDate: latestFY.asOfDate,
        fiscalPeriod: `FY (${latestFY.asOfDate})`,
        decumulationMethod: 'FY_FALLBACK',
        raw4QSum: null,
        latestFullYearValue: latestFYVal,
        note: 'FY_FALLBACK: Kuartal < 4 periode, menggunakan angka Full Year terakhir.',
      };
    }
    const latestQ = quarterlyPoints[quarterlyPoints.length - 1];
    return {
      ttmValue: latestQ ? latestQ.value : null,
      asOfDate: latestQ ? latestQ.asOfDate : null,
      fiscalPeriod: latestQ ? `Q (${latestQ.asOfDate})` : 'N/A',
      decumulationMethod: 'INSUFFICIENT_SERIES',
      raw4QSum: null,
      latestFullYearValue: latestFYVal,
      note: 'Data kuartal & tahunan tidak lengkap.',
    };
  }

  const last4Q = quarterlyPoints.slice(-4);
  const raw4QSum = last4Q.reduce((acc, item) => acc + item.value, 0);
  const latestQ = last4Q[last4Q.length - 1];

  const ratioVsFY =
    latestFYVal && Math.abs(latestFYVal) > 0 ? raw4QSum / latestFYVal : 1.0;

  const needsDecumulation =
    revenueRatioTriggered || (isRevenueReference && latestFYVal && ratioVsFY > 1.65);

  if (!needsDecumulation) {
    return {
      ttmValue: Math.round(raw4QSum),
      asOfDate: latestQ.asOfDate,
      fiscalPeriod: `TTM (${latestQ.asOfDate})`,
      decumulationMethod: 'STANDALONE_4Q_SUM',
      raw4QSum: Math.round(raw4QSum),
      latestFullYearValue: latestFYVal,
      ratioVsFY: Number(ratioVsFY.toFixed(2)),
      note: '4Q standalone valid (rasio TTM/FY <= 1.65x).',
    };
  }

  // Priority A: FY_prior + YTD_current - YTD_prior
  const latestMonth = latestQ.asOfDate.slice(5, 7);
  const latestYear = Number(latestQ.asOfDate.slice(0, 4));
  const priorYearMatchingYtd = quarterlyPoints.find(
    (pt) =>
      Number(pt.asOfDate.slice(0, 4)) === latestYear - 1 &&
      pt.asOfDate.slice(5, 7) === latestMonth
  );

  if (latestFY && priorYearMatchingYtd && latestQ.asOfDate > latestFY.asOfDate) {
    const trueTtm = latestFY.value + latestQ.value - priorYearMatchingYtd.value;
    const sanityRatio = latestFY.value > 0 ? trueTtm / latestFY.value : 1.0;
    if (!isRevenueReference || (sanityRatio >= 0.45 && sanityRatio <= 1.65)) {
      return {
        ttmValue: Math.round(trueTtm),
        asOfDate: latestQ.asOfDate,
        fiscalPeriod: `TTM Decumulated (${latestQ.asOfDate})`,
        decumulationMethod: 'TRUE_TTM_FY_PLUS_YTD_DELTA',
        raw4QSum: Math.round(raw4QSum),
        latestFullYearValue: latestFYVal,
        ratioVsFY: Number(sanityRatio.toFixed(2)),
        note: `Decumulated via FY (${latestFY.asOfDate}) + YTD (${latestQ.asOfDate}) - YTD_prior (${priorYearMatchingYtd.asOfDate}).`,
      };
    }
  }

  // Priority B: Convert cumulative YTD quarters within same fiscal year to standalone quarters
  const standaloneQuarters = [];
  for (let i = 0; i < quarterlyPoints.length; i++) {
    const curr = quarterlyPoints[i];
    const prev = i > 0 ? quarterlyPoints[i - 1] : null;
    const currYear = curr.asOfDate.slice(0, 4);
    const prevYear = prev ? prev.asOfDate.slice(0, 4) : null;

    if (prev && currYear === prevYear) {
      standaloneQuarters.push({
        asOfDate: curr.asOfDate,
        value: curr.value - prev.value,
      });
    } else {
      standaloneQuarters.push({
        asOfDate: curr.asOfDate,
        value: curr.value,
      });
    }
  }

  if (standaloneQuarters.length >= 4) {
    const last4StandaloneSum = standaloneQuarters
      .slice(-4)
      .reduce((acc, item) => acc + item.value, 0);
    const standaloneRatio =
      latestFYVal && latestFYVal > 0 ? last4StandaloneSum / latestFYVal : 1.0;
    if (!isRevenueReference || (standaloneRatio >= 0.45 && standaloneRatio <= 1.65)) {
      return {
        ttmValue: Math.round(last4StandaloneSum),
        asOfDate: latestQ.asOfDate,
        fiscalPeriod: `TTM Standalone Diff (${latestQ.asOfDate})`,
        decumulationMethod: 'CUMULATIVE_QUARTER_DIFFERENCE',
        raw4QSum: Math.round(raw4QSum),
        latestFullYearValue: latestFYVal,
        ratioVsFY: Number(standaloneRatio.toFixed(2)),
        note: 'Decumulated via selisih kuartal kumulatif menjadi kuartal standalone.',
      };
    }
  }

  // Priority C: Fallback to latestFullYear (FY_FALLBACK) — NEVER linear 9M*4/3 or 6M*2
  if (latestFY) {
    return {
      ttmValue: Math.round(latestFY.value),
      asOfDate: latestFY.asOfDate,
      fiscalPeriod: `FY Fallback (${latestFY.asOfDate})`,
      decumulationMethod: 'FY_FALLBACK',
      raw4QSum: Math.round(raw4QSum),
      latestFullYearValue: latestFYVal,
      ratioVsFY: 1.0,
      note: `FY_FALLBACK: Raw 4Q sum (${ratioVsFY.toFixed(2)}x FY) terindikasi kumulatif YTD tanpa pembanding valid; menggunakan Full Year terakhir (tanpa annualisasi linier).`,
    };
  }

  return {
    ttmValue: null,
    asOfDate: latestQ.asOfDate,
    fiscalPeriod: 'UNVERIFIED',
    decumulationMethod: 'REJECTED_CUMULATIVE',
    raw4QSum: Math.round(raw4QSum),
    latestFullYearValue: null,
    note: 'Gagal decumulate & tidak ada data FY.',
  };
}

async function fetchTickerChartAndAdtv20d(ticker, session) {
  const symbol = `${ticker}.JK`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  const res = await fetchWithRetry(url, {
    headers: session.cookieHeader ? { Cookie: session.cookieHeader } : {},
  });
  if (!res.ok) {
    throw new Error(`Chart HTTP ${res.status}`);
  }
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = quote.close || [];
  const volumes = quote.volume || [];

  const validDays = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = Number(closes[i]);
    const volume = Number(volumes[i]);
    if (Number.isFinite(close) && close > 0 && Number.isFinite(volume) && volume >= 0) {
      validDays.push({
        date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
        close,
        volume,
        turnoverIdr: close * volume,
      });
    }
  }

  const last20 = validDays.slice(-20);
  const adtv20dIdr =
    last20.length > 0
      ? Math.round(last20.reduce((sum, d) => sum + d.turnoverIdr, 0) / last20.length)
      : null;
  const latestDay = validDays[validDays.length - 1] || null;

  return {
    lastPrice: latestDay ? latestDay.close : null,
    priceAsOfDate: latestDay ? latestDay.date : null,
    adtv20dIdr,
    adtvSampleDays: last20.length,
  };
}

async function fetchTickerFundamentalsTimeseries(ticker, session) {
  const symbol = `${ticker}.JK`;
  const period1 = Math.floor(Date.now() / 1000) - 5 * 365 * 86400;
  const period2 = Math.floor(Date.now() / 1000);
  const types = [
    'quarterlyTotalRevenue',
    'annualTotalRevenue',
    'quarterlyOperatingIncome',
    'annualOperatingIncome',
    'quarterlyNetIncomeCommonStockholders',
    'annualNetIncomeCommonStockholders',
    'quarterlyNetIncome',
    'annualNetIncome',
    'quarterlyStockholdersEquity',
    'annualStockholdersEquity',
    'quarterlyTotalDebt',
    'annualTotalDebt',
    'quarterlyCashAndCashEquivalents',
    'annualCashAndCashEquivalents',
    'quarterlyOrdinarySharesNumber',
    'annualOrdinarySharesNumber',
    'quarterlyOperatingCashFlow',
    'annualOperatingCashFlow',
    'quarterlyCapitalExpenditure',
    'annualCapitalExpenditure',
    'quarterlyDepreciationAndAmortization',
    'annualDepreciationAndAmortization',
  ].join(',');

  const crumbParam = session.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
    symbol
  )}?type=${encodeURIComponent(types)}&period1=${period1}&period2=${period2}${crumbParam}`;

  const res = await fetchWithRetry(url, {
    headers: session.cookieHeader ? { Cookie: session.cookieHeader } : {},
  });
  if (!res.ok) {
    throw new Error(`Timeseries HTTP ${res.status}`);
  }
  const payload = await res.json();
  const result = payload?.timeseries?.result || [];

  const qRev = extractTimeseriesPoints(result, 'quarterlyTotalRevenue');
  const aRev = extractTimeseriesPoints(result, 'annualTotalRevenue');
  const revDecum = decumulateIdxFlowSeries(qRev, aRev, true, false);
  const forceDecum =
    revDecum.decumulationMethod === 'TRUE_TTM_FY_PLUS_YTD_DELTA' ||
    revDecum.decumulationMethod === 'CUMULATIVE_QUARTER_DIFFERENCE' ||
    revDecum.decumulationMethod === 'FY_FALLBACK';

  const qEbit = extractTimeseriesPoints(result, 'quarterlyOperatingIncome');
  const aEbit = extractTimeseriesPoints(result, 'annualOperatingIncome');
  const ebitDecum = decumulateIdxFlowSeries(qEbit, aEbit, false, forceDecum);

  let qNi = extractTimeseriesPoints(result, 'quarterlyNetIncomeCommonStockholders');
  let aNi = extractTimeseriesPoints(result, 'annualNetIncomeCommonStockholders');
  if (qNi.length === 0 && aNi.length === 0) {
    qNi = extractTimeseriesPoints(result, 'quarterlyNetIncome');
    aNi = extractTimeseriesPoints(result, 'annualNetIncome');
  }
  const niDecum = decumulateIdxFlowSeries(qNi, aNi, false, forceDecum);

  const qOcf = extractTimeseriesPoints(result, 'quarterlyOperatingCashFlow');
  const aOcf = extractTimeseriesPoints(result, 'annualOperatingCashFlow');
  const ocfDecum = decumulateIdxFlowSeries(qOcf, aOcf, false, forceDecum);

  const qCapex = extractTimeseriesPoints(result, 'quarterlyCapitalExpenditure');
  const aCapex = extractTimeseriesPoints(result, 'annualCapitalExpenditure');
  const capexDecum = decumulateIdxFlowSeries(qCapex, aCapex, false, forceDecum);

  const qDa = extractTimeseriesPoints(result, 'quarterlyDepreciationAndAmortization');
  const aDa = extractTimeseriesPoints(result, 'annualDepreciationAndAmortization');
  const daDecum = decumulateIdxFlowSeries(qDa, aDa, false, forceDecum);

  // Balance sheet items take latest point (never summed across quarters)
  const pickLatestBalancePoint = (qName, aName) => {
    const qPts = extractTimeseriesPoints(result, qName);
    const aPts = extractTimeseriesPoints(result, aName);
    const all = [...aPts, ...qPts].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
    return all.length > 0 ? all[all.length - 1] : null;
  };

  const eqPt = pickLatestBalancePoint('quarterlyStockholdersEquity', 'annualStockholdersEquity');
  const debtPt = pickLatestBalancePoint('quarterlyTotalDebt', 'annualTotalDebt');
  const cashPt = pickLatestBalancePoint('quarterlyCashAndCashEquivalents', 'annualCashAndCashEquivalents');
  const sharesPt = pickLatestBalancePoint('quarterlyOrdinarySharesNumber', 'annualOrdinarySharesNumber');

  return {
    revenueTTM: revDecum.ttmValue,
    ebitTTM: ebitDecum.ttmValue,
    netIncomeTTM: niDecum.ttmValue,
    equityAttributable: eqPt ? Math.round(eqPt.value) : null,
    totalDebt: debtPt ? Math.round(debtPt.value) : 0,
    cashAndEquivalents: cashPt ? Math.round(cashPt.value) : 0,
    sharesOutstanding: sharesPt ? Math.round(sharesPt.value) : null,
    ocfTTM: ocfDecum.ttmValue,
    capexTTM: capexDecum.ttmValue !== null ? Math.abs(Math.round(capexDecum.ttmValue)) : null,
    daTTM: daDecum.ttmValue !== null ? Math.abs(Math.round(daDecum.ttmValue)) : null,
    asOfDate: revDecum.asOfDate || (eqPt ? eqPt.asOfDate : null),
    fiscalPeriod: revDecum.fiscalPeriod,
    decumulationMethod: revDecum.decumulationMethod,
    raw4QRevenueSum: revDecum.raw4QSum,
    latestFullYearRevenue: revDecum.latestFullYearValue,
    decumulationNote: revDecum.note,
  };
}

async function main() {
  const envTickers = (process.env.TARGET_TICKERS || '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const targetList = envTickers.length > 0 ? envTickers : CORE_IDX_TICKERS;

  let existingSnapshot = {
    provenanceMode: 'BOOTSTRAP_PLACEHOLDER',
    generatedAt: null,
    macroBenchmarks: {
      sbn1YPct: null,
      sbn5YPct: null,
      sbn10YPct: null,
      sbnAsOfDate: null,
      provenanceMode: 'BOOTSTRAP_PLACEHOLDER',
      source: 'PROXY_FORMULA',
      note: 'Kurva SBN belum diisi oleh feed otomatis; menggunakan proksi ^TNX + IDR=X spread (PROXY_FORMULA).',
    },
    tickers: {},
  };

  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8');
    existingSnapshot = JSON.parse(raw);
  } catch {
    // Will create fresh file
  }

  console.log(`[FundamentalsFetcher] Acquiring Yahoo Finance session for ${targetList.length} tickers...`);
  const session = await acquireYahooCrumbSession();
  const nowIso = new Date().toISOString();
  let successCount = 0;

  for (let i = 0; i < targetList.length; i += MAX_CONCURRENCY) {
    const batch = targetList.slice(i, i + MAX_CONCURRENCY);
    console.log(`[Batch ${Math.floor(i / MAX_CONCURRENCY) + 1}] Processing: ${batch.join(', ')}`);

    await Promise.all(
      batch.map(async (ticker) => {
        try {
          const [chartInfo, fundInfo] = await Promise.all([
            fetchTickerChartAndAdtv20d(ticker, session),
            fetchTickerFundamentalsTimeseries(ticker, session),
          ]);

          const hasCoreStatements =
            Number.isFinite(fundInfo.revenueTTM) &&
            fundInfo.revenueTTM > 0 &&
            Number.isFinite(fundInfo.netIncomeTTM) &&
            Number.isFinite(fundInfo.equityAttributable) &&
            fundInfo.equityAttributable > 0;

          if (hasCoreStatements) {
            existingSnapshot.tickers[ticker] = {
              ticker,
              provenanceMode: 'AUTOMATED_FETCH',
              fetchedAt: nowIso,
              asOfDate: fundInfo.asOfDate || chartInfo.priceAsOfDate,
              fiscalPeriod: fundInfo.fiscalPeriod,
              decumulationMethod: fundInfo.decumulationMethod,
              decumulationNote: fundInfo.decumulationNote,
              raw4QRevenueSum: fundInfo.raw4QRevenueSum,
              latestFullYearRevenue: fundInfo.latestFullYearRevenue,
              revenueTTM: fundInfo.revenueTTM,
              ebitTTM: fundInfo.ebitTTM,
              netIncomeTTM: fundInfo.netIncomeTTM,
              equityAttributable: fundInfo.equityAttributable,
              totalDebt: fundInfo.totalDebt,
              cashAndEquivalents: fundInfo.cashAndEquivalents,
              sharesOutstanding: fundInfo.sharesOutstanding,
              ocfTTM: fundInfo.ocfTTM,
              capexTTM: fundInfo.capexTTM,
              daTTM: fundInfo.daTTM,
              adtv20dIdr: chartInfo.adtv20dIdr,
              adtvAsOfDate: chartInfo.priceAsOfDate,
            };
            successCount++;
          } else if (chartInfo.adtv20dIdr) {
            existingSnapshot.tickers[ticker] = {
              ...(existingSnapshot.tickers[ticker] || { ticker, provenanceMode: 'BOOTSTRAP_PLACEHOLDER' }),
              adtv20dIdr: chartInfo.adtv20dIdr,
              adtvAsOfDate: chartInfo.priceAsOfDate,
              adtvProvenanceMode: 'AUTOMATED_FETCH',
              fetchedAt: nowIso,
            };
          }
        } catch (err) {
          console.warn(`[Warn] Failed to fetch ${ticker}: ${err.message}`);
        }
      })
    );

    if (i + MAX_CONCURRENCY < targetList.length) {
      await sleep(INTER_BATCH_DELAY_MS);
    }
  }

  if (successCount > 0) {
    existingSnapshot.provenanceMode = 'AUTOMATED_FETCH';
  }
  existingSnapshot.generatedAt = nowIso;

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(existingSnapshot, null, 2) + '\n', 'utf8');
  console.log(`[FundamentalsFetcher] Completed. Verified AUTOMATED_FETCH tickers: ${successCount}/${targetList.length}`);
}

main().catch((err) => {
  console.error('[FundamentalsFetcher] Fatal error:', err);
  process.exit(1);
});
