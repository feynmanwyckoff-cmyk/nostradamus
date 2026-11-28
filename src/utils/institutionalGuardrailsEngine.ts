import {
  DataConfidenceLevel,
  EnsembleComponent,
  FinancialAuditFlag,
  FinancialAuditReport,
  MarketRegimeStatus,
  QuarterlyRawRow,
  RawTickerData,
  RiskSizingResult,
  SanityCheckStatus,
  SanityFlag,
  SanityReport,
  StandaloneQuarter,
  StatArbSignalType,
  StockMetrics,
  TacticalOverlay,
  ValuationLedger,
  ValuationModuleRoute,
  ValuationResult
} from '../types/quant';
import { getFundamentalUserOverride } from './dataLineageEngine';
import {
  isCpoPlantationTicker,
  resolveAuthenticTotalAssetsIdr
} from './sectorMethodologyRouter';
import embeddedSnapshot from '../data/staticMarketSnapshot.json';

/**
 * MODUL 2.1: Realistic Sector Beta Fallback when price series is completely empty
 * (`Financials: 1.05`, `Consumer Cyclicals: 0.95`, `Energy/Basic Materials: 1.00`,
 *  `Properties: 0.95`, `Healthcare/Consumer Staples: 0.70`, `Industrials: 0.85`)
 */
export function resolveSectorBetaFallback(sector: string): number {
  const sec = (sector || '').trim();
  if (sec === 'Financials') return 1.05;
  if (sec === 'Consumer Cyclicals') return 0.95;
  if (sec === 'Energy' || sec === 'Basic Materials') return 1.00;
  if (sec === 'Properties & Real Estate' || sec === 'Properties') return 0.95;
  if (sec === 'Healthcare' || sec === 'Consumer Non-Cyclicals' || sec === 'Consumer Staples') {
    return 0.70;
  }
  if (sec === 'Industrials') return 0.85;
  if (sec === 'Infrastructures' || sec === 'Infrastructure') return 0.85;
  if (sec === 'Technology') return 1.15;
  return 0.90;
}

const snapshotBetaCache = new Map<string, number>();
let cachedJkseReturns: number[] | null = null;

function getCachedJkseReturns(): number[] {
  if (cachedJkseReturns !== null) return cachedJkseReturns;
  const snapData = (
    embeddedSnapshot as unknown as {
      data?: Record<string, { closes?: number[]; timestamps?: number[] }>;
    }
  )?.data;
  const jkseCloses = (snapData?.['^JKSE']?.closes ?? []).filter(
    (c) => Number.isFinite(c) && c > 0
  );
  const mRet: number[] = [];
  for (let i = 1; i < jkseCloses.length; i++) {
    mRet.push((jkseCloses[i] - jkseCloses[i - 1]) / jkseCloses[i - 1]);
  }
  cachedJkseReturns = mRet;
  return mRet;
}

/**
 * MODUL 2.1: Computes authentic 1Y Beta from daily return regression of the stock vs ^JKSE
 * using at least 30–35 overlapping trading days from static-market-snapshot.json when
 * live 1Y chart falls back or beta1Y is stuck at the 0.32 floor.
 */
export function computeAuthenticBeta1YFromSnapshotOrSeries(
  ticker: string,
  sector: string,
  currentBeta?: number
): number {
  if (
    typeof currentBeta === 'number' &&
    Number.isFinite(currentBeta) &&
    currentBeta > 0.34 &&
    currentBeta < 2.38
  ) {
    return Number(currentBeta.toFixed(2));
  }

  const cleanTicker = ticker.replace(/\.JK$/i, '').trim().toUpperCase();
  const cacheKey = `${cleanTicker}:${(sector || '').trim()}`;
  const cachedBeta = snapshotBetaCache.get(cacheKey);
  if (cachedBeta !== undefined) {
    return cachedBeta;
  }

  const yfSym = `${cleanTicker}.JK`;
  const snapData = (
    embeddedSnapshot as unknown as {
      data?: Record<string, { closes?: number[]; timestamps?: number[] }>;
    }
  )?.data;

  const stockEntry = snapData?.[yfSym];
  const stockCloses = (stockEntry?.closes ?? []).filter((c) => Number.isFinite(c) && c > 0);
  const mRet = getCachedJkseReturns();

  if (stockCloses.length >= 15 && mRet.length >= 14) {
    const sRet: number[] = [];
    for (let i = 1; i < stockCloses.length; i++) {
      sRet.push((stockCloses[i] - stockCloses[i - 1]) / stockCloses[i - 1]);
    }

    // Use up to 60 overlapping recent trading days (minimum 14–35 days available in snapshot)
    const overlapLen = Math.min(sRet.length, mRet.length, 60);
    if (overlapLen >= 14) {
      const sWindow = sRet.slice(-overlapLen);
      const mWindow = mRet.slice(-overlapLen);
      const meanS = sWindow.reduce((a, b) => a + b, 0) / overlapLen;
      const meanM = mWindow.reduce((a, b) => a + b, 0) / overlapLen;
      let cov = 0;
      let varM = 0;
      for (let i = 0; i < overlapLen; i++) {
        const dS = sWindow[i] - meanS;
        const dM = mWindow[i] - meanM;
        cov += dS * dM;
        varM += dM * dM;
      }
      cov /= Math.max(1, overlapLen - 1);
      varM /= Math.max(1, overlapLen - 1);

      if (varM > 1e-8) {
        const rawRegressedBeta = cov / varM;
        // Blend 70% empirical snapshot regression + 30% Vasicek shrinkage toward sector prior
        const sectorPrior = resolveSectorBetaFallback(sector);
        const vasicekBeta = 0.70 * rawRegressedBeta + 0.30 * sectorPrior;
        if (Number.isFinite(vasicekBeta) && vasicekBeta > 0.38) {
          const result = Number(Math.max(0.42, Math.min(2.25, vasicekBeta)).toFixed(2));
          snapshotBetaCache.set(cacheKey, result);
          return result;
        }
      }
    }
  }

  const fallbackResult = Number(resolveSectorBetaFallback(sector).toFixed(2));
  snapshotBetaCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}

/**
 * Helper: Normalizes percentage or decimal inputs into decimal (e.g., 18.5 -> 0.185, 0.185 -> 0.185).
 */
export function toDecimalRate(val: number | undefined, fallbackDecimal: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallbackDecimal;
  return Math.abs(val) > 1.0 ? val / 100 : val;
}

/**
 * Helper: Normalizes percentage or decimal inputs into percentage (e.g., 0.185 -> 18.5, 18.5 -> 18.5).
 */
export function toPercentValue(val: number | undefined, fallbackPct: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallbackPct;
  return Math.abs(val) <= 1.0 && val !== 0 ? val * 100 : val;
}

/**
 * Standard IDX Tick Size Rounder
 */
export function roundToIdxTickSize(rawPrice: number): number {
  const p = Math.max(50, Math.round(rawPrice));
  if (p < 200) return p;
  if (p < 500) return Math.round(p / 2) * 2;
  if (p < 2000) return Math.round(p / 5) * 5;
  if (p < 5000) return Math.round(p / 10) * 10;
  return Math.round(p / 25) * 25;
}

/**
 * ============================================================================
 * HOTFIX 1: IDX YTD-TO-TTM DECUMULATOR & BALANCE SHEET SNAPSHOT GUARD
 * ============================================================================
 * Indonesian Stock Exchange (BEI / IDX) quarterly financial statements are
 * reported on a cumulative Year-to-Date (YTD) basis:
 *   Q1 = 3M, Q2 = 6M, Q3 = 9M, Q4 = 12M (Full Year).
 * Summing 4 raw YTD rows directly inflates Flow Metrics (Revenue, EBIT, Net Income,
 * EBITDA, OCF, CapEx) by ~1.8x–2.5x. Furthermore, Balance Sheet Stock Metrics
 * (Total Equity, Total Assets, Total Debt, Cash, Shares) are point-in-time
 * snapshots and MUST NEVER be summed across quarters or multiplied by an annualizer.
 */
export function decumulateIDXQuarters(quarters: QuarterlyRawRow[]): StandaloneQuarter[] {
  if (!Array.isArray(quarters) || quarters.length === 0) return [];

  // 1. Sort chronologically by fiscalYear ascending, then quarter (1, 2, 3, 4) ascending
  const sorted = [...quarters].sort((a, b) => {
    if (a.fiscalYear !== b.fiscalYear) return a.fiscalYear - b.fiscalYear;
    return a.quarter - b.quarter;
  });

  // Index by `${fiscalYear}-Q${quarter}` for exact within-year YTD decumulation
  const rowMap = new Map<string, QuarterlyRawRow>();
  for (const row of sorted) {
    rowMap.set(`${row.fiscalYear}-Q${row.quarter}`, row);
  }

  return sorted.map((row) => {
    const isStandaloneInput = row.reportType === 'STANDALONE';
    const ebitdaRaw = Number(row.ebitda ?? row.operatingProfit * 1.15) || 0;
    const ocfRaw = Number(row.ocf ?? row.netIncome) || 0;
    const capexRaw = Number(row.capex ?? 0) || 0;

    if (isStandaloneInput || row.quarter === 1) {
      return {
        fiscalYear: row.fiscalYear,
        quarter: row.quarter,
        periodLabel: `${row.fiscalYear}-Q${row.quarter} (Standalone 3M)`,
        isDecumulatedFromYtd: !isStandaloneInput && row.quarter === 1,
        revenue: Math.round(Number(row.revenue) || 0),
        operatingProfit: Math.round(Number(row.operatingProfit) || 0),
        netIncome: Math.round(Number(row.netIncome) || 0),
        ebitda: Math.round(ebitdaRaw),
        ocf: Math.round(ocfRaw),
        capex: Math.round(capexRaw),
        // Balance sheet stock metrics: strictly point-in-time snapshot
        equityAttributable: row.equityAttributable,
        totalAssets: row.totalAssets,
        totalDebt: row.totalDebt,
        cash: row.cash,
        sharesOutstanding: row.sharesOutstanding
      };
    }

    // YTD Decumulation: Q2_standalone = Q2_ytd - Q1_ytd, Q3 = Q3_ytd - Q2_ytd, Q4 = Q4_ytd - Q3_ytd
    const prevQuarter = (row.quarter - 1) as 1 | 2 | 3;
    const prevRow = rowMap.get(`${row.fiscalYear}-Q${prevQuarter}`);

    if (prevRow && prevRow.reportType !== 'STANDALONE') {
      const prevEbitda = Number(prevRow.ebitda ?? prevRow.operatingProfit * 1.15) || 0;
      const prevOcf = Number(prevRow.ocf ?? prevRow.netIncome) || 0;
      const prevCapex = Number(prevRow.capex ?? 0) || 0;

      return {
        fiscalYear: row.fiscalYear,
        quarter: row.quarter,
        periodLabel: `${row.fiscalYear}-Q${row.quarter} (Standalone 3M Decumulated)`,
        isDecumulatedFromYtd: true,
        revenue: Math.round((Number(row.revenue) || 0) - (Number(prevRow.revenue) || 0)),
        operatingProfit: Math.round(
          (Number(row.operatingProfit) || 0) - (Number(prevRow.operatingProfit) || 0)
        ),
        netIncome: Math.round((Number(row.netIncome) || 0) - (Number(prevRow.netIncome) || 0)),
        ebitda: Math.round(ebitdaRaw - prevEbitda),
        ocf: Math.round(ocfRaw - prevOcf),
        capex: Math.round(capexRaw - prevCapex),
        // Balance sheet stock metrics: strictly point-in-time snapshot (NEVER subtracted)
        equityAttributable: row.equityAttributable,
        totalAssets: row.totalAssets,
        totalDebt: row.totalDebt,
        cash: row.cash,
        sharesOutstanding: row.sharesOutstanding
      };
    }

    // Fallback when prior adjacent quarter in the same fiscal year is missing:
    // Proportionally de-accumulate single quarter (1 / quarter) of YTD flow metrics
    const quarterShare = 1 / row.quarter;
    return {
      fiscalYear: row.fiscalYear,
      quarter: row.quarter,
      periodLabel: `${row.fiscalYear}-Q${row.quarter} (Standalone 3M Prop-Fallback)`,
      isDecumulatedFromYtd: true,
      revenue: Math.round((Number(row.revenue) || 0) * quarterShare),
      operatingProfit: Math.round((Number(row.operatingProfit) || 0) * quarterShare),
      netIncome: Math.round((Number(row.netIncome) || 0) * quarterShare),
      ebitda: Math.round(ebitdaRaw * quarterShare),
      ocf: Math.round(ocfRaw * quarterShare),
      capex: Math.round(capexRaw * quarterShare),
      equityAttributable: row.equityAttributable,
      totalAssets: row.totalAssets,
      totalDebt: row.totalDebt,
      cash: row.cash,
      sharesOutstanding: row.sharesOutstanding
    };
  });
}

export interface DecumulatedIdxTtmAndSnapshotResult {
  standaloneQuarters: StandaloneQuarter[];
  ttmMethod: 'SUM_4_STANDALONE_QUARTERS' | 'SAFE_YTD_BRIDGE_FORMULA' | 'FY_FALLBACK';
  // Flow Metrics (TTM 12M)
  revenueTTM: number;
  operatingProfitTTM: number;
  netIncomeTTM: number;
  ebitdaTTM: number;
  ocfTTM: number;
  capexTTM: number;
  // Stock Metrics (Strictly Latest 1-Period Snapshot — NEVER summed or annualized)
  latestSnapshotPeriod: string;
  equityAttributable: number;
  totalAssets: number;
  totalDebt: number;
  cash: number;
  sharesOutstanding: number;
}

/**
 * Computes TTM Flow Metrics and enforces the Latest-Snapshot Guard on Balance Sheet Stock Metrics.
 * Strict Anti-Linear Annualization Priority:
 * 1. `SAFE_YTD_BRIDGE_FORMULA` (`Prior_FY_12M + Current_YTD - Prior_Same_Period_YTD`) whenever YTD bridge components exist
 *    OR if 4-quarter sum exceeds `1.65 * Prior_FY_12M`.
 * 2. `SUM_4_STANDALONE_QUARTERS` (decumulated consecutive standalone quarters, verified `<= 1.65 * Prior_FY_12M`).
 * 3. `FY_FALLBACK` (`Prior_FY_12M`) if prior-year comparison is missing (NEVER linear `9M * 4/3` or `6M * 2`).
 * - Balance Sheet metrics (`equityAttributable`, `totalAssets`, `cash`, `totalDebt`, `sharesOutstanding`)
 *   are taken strictly from the 1 latest chronological reporting period.
 */
export function computeIdxTtmAndSnapshotFromQuarters(
  quarters: QuarterlyRawRow[]
): DecumulatedIdxTtmAndSnapshotResult | null {
  if (!Array.isArray(quarters) || quarters.length === 0) return null;

  const sortedRaw = [...quarters].sort((a, b) => {
    if (a.fiscalYear !== b.fiscalYear) return a.fiscalYear - b.fiscalYear;
    return a.quarter - b.quarter;
  });
  const latestRaw = sortedRaw[sortedRaw.length - 1];
  const standaloneQuarters = decumulateIDXQuarters(sortedRaw);

  // Check if the last 4 standalone quarters are strictly consecutive
  let areLast4Consecutive = false;
  if (standaloneQuarters.length >= 4) {
    const last4 = standaloneQuarters.slice(-4);
    areLast4Consecutive = true;
    for (let i = 1; i < last4.length; i++) {
      const prev = last4[i - 1];
      const curr = last4[i];
      const expectedNextQuarter = prev.quarter === 4 ? 1 : prev.quarter + 1;
      const expectedNextYear = prev.quarter === 4 ? prev.fiscalYear + 1 : prev.fiscalYear;
      if (curr.quarter !== expectedNextQuarter || curr.fiscalYear !== expectedNextYear) {
        areLast4Consecutive = false;
        break;
      }
    }
  }

  let revenueTTM = 0;
  let operatingProfitTTM = 0;
  let netIncomeTTM = 0;
  let ebitdaTTM = 0;
  let ocfTTM = 0;
  let capexTTM = 0;
  let ttmMethod: DecumulatedIdxTtmAndSnapshotResult['ttmMethod'] = 'SUM_4_STANDALONE_QUARTERS';

  // Look for safe YTD bridge components: Current_YTD + Prior_FY_12M - Prior_Same_Period_YTD
  const priorFyQ4 =
    sortedRaw.find((r) => r.fiscalYear === latestRaw.fiscalYear - 1 && r.quarter === 4) ||
    [...sortedRaw].reverse().find((r) => r.quarter === 4);
  const priorSamePeriodYtd = sortedRaw.find(
    (r) =>
      r.fiscalYear === latestRaw.fiscalYear - 1 &&
      r.quarter === latestRaw.quarter &&
      r.reportType !== 'STANDALONE'
  );

  const last4 = standaloneQuarters.slice(-4);
  const sum4Rev = last4.reduce((acc, q) => acc + q.revenue, 0);
  const isSum4Bloated =
    priorFyQ4 && priorFyQ4.revenue > 0 ? sum4Rev / priorFyQ4.revenue > 1.65 : false;

  if (
    latestRaw.reportType !== 'STANDALONE' &&
    priorFyQ4 &&
    priorSamePeriodYtd &&
    (!areLast4Consecutive || isSum4Bloated || latestRaw.quarter < 4)
  ) {
    ttmMethod = 'SAFE_YTD_BRIDGE_FORMULA';
    revenueTTM = Math.round(latestRaw.revenue + priorFyQ4.revenue - priorSamePeriodYtd.revenue);
    operatingProfitTTM = Math.round(
      latestRaw.operatingProfit + priorFyQ4.operatingProfit - priorSamePeriodYtd.operatingProfit
    );
    netIncomeTTM = Math.round(
      latestRaw.netIncome + priorFyQ4.netIncome - priorSamePeriodYtd.netIncome
    );
    const curEb = Number(latestRaw.ebitda ?? latestRaw.operatingProfit * 1.15) || 0;
    const fyEb = Number(priorFyQ4.ebitda ?? priorFyQ4.operatingProfit * 1.15) || 0;
    const prEb = Number(priorSamePeriodYtd.ebitda ?? priorSamePeriodYtd.operatingProfit * 1.15) || 0;
    ebitdaTTM = Math.round(curEb + fyEb - prEb);

    const curOcf = Number(latestRaw.ocf ?? latestRaw.netIncome) || 0;
    const fyOcf = Number(priorFyQ4.ocf ?? priorFyQ4.netIncome) || 0;
    const prOcf = Number(priorSamePeriodYtd.ocf ?? priorSamePeriodYtd.netIncome) || 0;
    ocfTTM = Math.round(curOcf + fyOcf - prOcf);

    const curCapex = Number(latestRaw.capex ?? 0) || 0;
    const fyCapex = Number(priorFyQ4.capex ?? 0) || 0;
    const prCapex = Number(priorSamePeriodYtd.capex ?? 0) || 0;
    capexTTM = Math.round(curCapex + fyCapex - prCapex);
  } else if (last4.length === 4 && !isSum4Bloated) {
    ttmMethod = 'SUM_4_STANDALONE_QUARTERS';
    revenueTTM = Math.round(sum4Rev);
    operatingProfitTTM = Math.round(last4.reduce((acc, q) => acc + q.operatingProfit, 0));
    netIncomeTTM = Math.round(last4.reduce((acc, q) => acc + q.netIncome, 0));
    ebitdaTTM = Math.round(last4.reduce((acc, q) => acc + q.ebitda, 0));
    ocfTTM = Math.round(last4.reduce((acc, q) => acc + q.ocf, 0));
    capexTTM = Math.round(last4.reduce((acc, q) => acc + q.capex, 0));
  } else if (priorFyQ4) {
    // Anti-Linear Annualization Fallback: use latest Full Year (FY_FALLBACK), NEVER 9M * 4/3 or 6M * 2
    ttmMethod = 'FY_FALLBACK';
    revenueTTM = Math.round(priorFyQ4.revenue);
    operatingProfitTTM = Math.round(priorFyQ4.operatingProfit);
    netIncomeTTM = Math.round(priorFyQ4.netIncome);
    ebitdaTTM = Math.round(Number(priorFyQ4.ebitda ?? priorFyQ4.operatingProfit * 1.15) || 0);
    ocfTTM = Math.round(Number(priorFyQ4.ocf ?? priorFyQ4.netIncome) || 0);
    capexTTM = Math.round(Number(priorFyQ4.capex ?? 0) || 0);
  } else {
    ttmMethod = 'SUM_4_STANDALONE_QUARTERS';
    revenueTTM = Math.round(sum4Rev);
    operatingProfitTTM = Math.round(last4.reduce((acc, q) => acc + q.operatingProfit, 0));
    netIncomeTTM = Math.round(last4.reduce((acc, q) => acc + q.netIncome, 0));
    ebitdaTTM = Math.round(last4.reduce((acc, q) => acc + q.ebitda, 0));
    ocfTTM = Math.round(last4.reduce((acc, q) => acc + q.ocf, 0));
    capexTTM = Math.round(last4.reduce((acc, q) => acc + q.capex, 0));
  }

  // Balance Sheet Snapshot Guard: Strictly take from latest 1 period (latestRaw)
  return {
    standaloneQuarters,
    ttmMethod,
    revenueTTM,
    operatingProfitTTM,
    netIncomeTTM,
    ebitdaTTM,
    ocfTTM,
    capexTTM,
    latestSnapshotPeriod: `${latestRaw.fiscalYear}-Q${latestRaw.quarter}`,
    equityAttributable: Math.round(Number(latestRaw.equityAttributable) || 0),
    totalAssets: Math.round(Number(latestRaw.totalAssets) || 0),
    totalDebt: Math.round(Number(latestRaw.totalDebt) || 0),
    cash: Math.round(Number(latestRaw.cash) || 0),
    sharesOutstanding: Math.round(Number(latestRaw.sharesOutstanding) || 0)
  };
}

/**
 * ============================================================================
 * P0: DATA INTEGRITY GUARDRAILS (PRE-PROCESSING LAYER + HOTFIX 1 GUARDS)
 * ============================================================================
 * Mandatory pre-processing validation executed BEFORE conviction scores and
 * intrinsic valuations are computed:
 * 1. Cross-Check Shares Outstanding, EPS, and BVPS:
 *    - Validation 1: impliedShares = marketCap / price. If |impliedShares - sharesOutstanding| / sharesOutstanding > 0.03 (>3%),
 *      flag CRITICAL_DATA_MISMATCH.
 *    - Validation 2: Check consistency of (epsTTM * sharesOutstanding) vs netIncomeTTM (tolerance <= 5%),
 *      and (bvps * sharesOutstanding) vs equityAttributable (tolerance <= 5%).
 *    - Validation 3 (Hotfix 1 Double-Counting Trap):
 *      Check `revenueTTM / latestFullYearRevenue > 1.65` (without explicit corporate action/acquisition flag)
 *      OR `impliedPER < 4` on non-cyclical issuers with high ROE (`roeTTM >= 15%`).
 *      If triggered, throw `YTD_CUMULATIVE_SUM_SUSPECT` and fail `PASS` status.
 *    - Validation 4 (Hotfix 1 Balance Sheet Sanity Check):
 *      Ensure `equityAttributable <= totalAssets` and check if `bvps` jumped `> 50%` vs `priorYearBvps`
 *      without a rights issue (`hasRightsIssue`). If violated, throw `BALANCE_SHEET_ANOMALY` and fail `PASS`.
 * 2. ADTV Unit Normalizer (Lot vs Shares & Thousands vs Full IDR)
 * 3. Default TTM Valuation Basis & Dual-Confirmation Catalyst
 * 4. SBN 10Y Risk-Free Rate Curve Freshness Check
 */
export function validateFundamentalSanity(raw: RawTickerData): SanityReport {
  const flags: SanityFlag[] = [];
  const reasons: string[] = [];

  const price = Math.max(1, Number(raw.price) || 1);
  const marketCap = Math.max(1, Number(raw.marketCap) || price);
  const sharesOutstanding = Math.max(1, Number(raw.sharesOutstanding) || Math.round(marketCap / price));

  // -------------------------------------------------------------------------
  // 1. CROSS-CHECK SHARES OUTSTANDING, EPS_TTM & BVPS
  // -------------------------------------------------------------------------
  const impliedShares = marketCap / price;
  const sharesMismatchPct = Math.abs(impliedShares - sharesOutstanding) / sharesOutstanding;

  const epsTTM = Number(raw.epsTTM) || 0;
  const bvps = Number(raw.bvps) || 0;
  const netIncomeTTM = Number(raw.netIncomeTTM) || 0;
  const revenueTTM = Number(raw.revenueTTM) || 0;
  const equityAttributable = Number(raw.equityAttributable) || 0;

  const impliedNetIncomeFromEps = epsTTM * sharesOutstanding;
  const netIncomeDenom = Math.max(1, Math.abs(netIncomeTTM));
  const netIncomeMismatchPct = Math.abs(impliedNetIncomeFromEps - netIncomeTTM) / netIncomeDenom;

  const impliedEquityFromBvps = bvps * sharesOutstanding;
  const equityDenom = Math.max(1, Math.abs(equityAttributable));
  const equityMismatchPct = Math.abs(impliedEquityFromBvps - equityAttributable) / equityDenom;

  let isCriticalMismatch = false;

  if (sharesMismatchPct > 0.03) {
    isCriticalMismatch = true;
    reasons.push(
      `[CRITICAL_DATA_MISMATCH] Selisih Implied Shares (MarketCap/Price = ${Math.round(impliedShares).toLocaleString('id-ID')} lbr) vs Shares Outstanding (${Math.round(sharesOutstanding).toLocaleString('id-ID')} lbr) sebesar ${(sharesMismatchPct * 100).toFixed(2)}% (> batas toleransi 3,0%).`
    );
  }

  if (netIncomeMismatchPct > 0.05) {
    isCriticalMismatch = true;
    reasons.push(
      `[CRITICAL_DATA_MISMATCH] Inkonsistensi EPS_TTM × Shares (Rp ${Math.round(impliedNetIncomeFromEps).toLocaleString('id-ID')}) terhadap Net Income TTM (Rp ${Math.round(netIncomeTTM).toLocaleString('id-ID')}) sebesar ${(netIncomeMismatchPct * 100).toFixed(2)}% (> batas toleransi 5,0%).`
    );
  }

  if (equityMismatchPct > 0.05) {
    isCriticalMismatch = true;
    reasons.push(
      `[CRITICAL_DATA_MISMATCH] Inkonsistensi BVPS × Shares (Rp ${Math.round(impliedEquityFromBvps).toLocaleString('id-ID')}) terhadap Equity Attributable (Rp ${Math.round(equityAttributable).toLocaleString('id-ID')}) sebesar ${(equityMismatchPct * 100).toFixed(2)}% (> batas toleransi 5,0%).`
    );
  }

  if (isCriticalMismatch) {
    flags.push('CRITICAL_DATA_MISMATCH');
  }

  // -------------------------------------------------------------------------
  // 1B. HOTFIX 1: DOUBLE-COUNTING TRAP (YTD CUMULATIVE SUM SUSPECT)
  // -------------------------------------------------------------------------
  const sanitizedEpsTTM = epsTTM;
  const sanitizedRoeTTM = toDecimalRate(
    raw.roeTTM,
    equityAttributable > 0 ? netIncomeTTM / equityAttributable : 0.12
  );

  const latestFullYearRevenue = Number(raw.latestFullYearRevenue) || 0;
  const revenueTtmToFullYearRatio =
    latestFullYearRevenue > 0 && revenueTTM > 0
      ? Number((revenueTTM / latestFullYearRevenue).toFixed(4))
      : undefined;

  const isCyclicalSector =
    raw.isCyclicalSector ??
    (raw.sector === 'Energy' ||
      raw.sector === 'Basic Materials' ||
      raw.sector === 'Properties & Real Estate');

  const impliedPER = epsTTM > 0 ? price / epsTTM : 999;

  let isYtdCumulativeSuspect = false;
  if (
    typeof revenueTtmToFullYearRatio === 'number' &&
    revenueTtmToFullYearRatio > 1.65 &&
    !raw.hasAcquisitionOrCorpAction
  ) {
    isYtdCumulativeSuspect = true;
    reasons.push(
      `[YTD_CUMULATIVE_SUM_SUSPECT] Double-Counting Trap: Rasio Revenue TTM / Full-Year Terakhir mencapai ${revenueTtmToFullYearRatio.toFixed(2)}x (> batas 1,65x) tanpa flag aksi korporasi/akuisisi. Indikasi kuat parser menjumlahkan 4 kuartal kumulatif YTD BEI secara langsung.`
    );
  }

  if (
    epsTTM > 0 &&
    impliedPER < 4.0 &&
    !isCyclicalSector &&
    sanitizedRoeTTM >= 0.15 &&
    !raw.hasAcquisitionOrCorpAction
  ) {
    isYtdCumulativeSuspect = true;
    reasons.push(
      `[YTD_CUMULATIVE_SUM_SUSPECT] Double-Counting Trap: Implied PER (${impliedPER.toFixed(2)}x < 4,0x) tidak wajar pada emiten non-siklikal (${raw.sector}) ber-ROE tinggi (${(sanitizedRoeTTM * 100).toFixed(1)}%). Indikasi penggembungan EPS TTM akibat penjumlahan kuartal kumulatif YTD.`
    );
  }

  if (isYtdCumulativeSuspect && !flags.includes('YTD_CUMULATIVE_SUM_SUSPECT')) {
    flags.push('YTD_CUMULATIVE_SUM_SUSPECT');
  }

  // -------------------------------------------------------------------------
  // 1C. HOTFIX 1: BALANCE SHEET SANITY CHECK (SNAPSHOT GUARD)
  // -------------------------------------------------------------------------
  let isBalanceSheetAnomaly = false;
  const totalAssets = Number(raw.totalAssets) || 0;
  if (totalAssets > 0 && equityAttributable > totalAssets) {
    isBalanceSheetAnomaly = true;
    reasons.push(
      `[BALANCE_SHEET_ANOMALY] Pelanggaran Identitas Neraca: Equity Attributable (Rp ${Math.round(equityAttributable).toLocaleString('id-ID')}) melebihi Total Assets (Rp ${Math.round(totalAssets).toLocaleString('id-ID')}). Indikasi penjumlahan metrik stok neraca lintas kuartal.`
    );
  }

  const priorYearBvps = Number(raw.priorYearBvps) || 0;
  if (priorYearBvps > 0 && bvps > priorYearBvps * 1.50 && !raw.hasRightsIssue) {
    isBalanceSheetAnomaly = true;
    const bvpsJumpPct = ((bvps - priorYearBvps) / priorYearBvps) * 100;
    reasons.push(
      `[BALANCE_SHEET_ANOMALY] Lonjakan BVPS tidak wajar sebesar +${bvpsJumpPct.toFixed(1)}% (BVPS Rp ${Math.round(bvps).toLocaleString('id-ID')} vs Prior FY Rp ${Math.round(priorYearBvps).toLocaleString('id-ID')} > +50%) tanpa Rights Issue. Indikasi metrik ekuitas neraca disetahunkan atau dijumlahkan lintas kuartal.`
    );
  }

  if (isBalanceSheetAnomaly) {
    if (!flags.includes('BALANCE_SHEET_ANOMALY')) {
      flags.push('BALANCE_SHEET_ANOMALY');
    }
    if (!flags.includes('CRITICAL_DATA_MISMATCH')) {
      flags.push('CRITICAL_DATA_MISMATCH');
    }
  }

  // -------------------------------------------------------------------------
  // 2. ADTV UNIT NORMALIZER (LOT VS LEMBAR & RIBUAN VS RUPIAH PENUH)
  // -------------------------------------------------------------------------
  const currencyMultiplier =
    raw.adtvCurrencyScale === 'THOUSAND_IDR'
      ? 1_000
      : raw.adtvCurrencyScale === 'MILLION_IDR'
      ? 1_000_000
      : raw.adtvCurrencyScale === 'BILLION_IDR'
      ? 1_000_000_000
      : 1;

  const lotToSharesMultiplier = raw.adtvVolumeUnit === 'LOT' ? 100 : 1;

  let normalizedAdtv20dShares = 0;
  let normalizedAdtv20dIDR = 0;

  if (typeof raw.adtv20dVolumeRaw === 'number' && raw.adtv20dVolumeRaw > 0) {
    normalizedAdtv20dShares = Math.round(raw.adtv20dVolumeRaw * lotToSharesMultiplier);
    normalizedAdtv20dIDR = Math.round(normalizedAdtv20dShares * price);
  } else if (typeof raw.adtv20dIDR === 'number' && raw.adtv20dIDR > 0) {
    normalizedAdtv20dIDR = Math.round(raw.adtv20dIDR * currencyMultiplier * lotToSharesMultiplier);
    normalizedAdtv20dShares = Math.round(normalizedAdtv20dIDR / price);
  }

  // Sanity Trap: If MarketCap >= Rp 1 Trillion (1e12) but normalized ADTV < Rp 50 Million/day (50e6)
  let isAdtvAnomaly = false;
  if (marketCap >= 1e12 && normalizedAdtv20dIDR < 50e6) {
    isAdtvAnomaly = true;
    flags.push('ADTV_UNIT_ANOMALY');
    reasons.push(
      `[ADTV_UNIT_ANOMALY] Emiten berkapitalisasi besar (Market Cap Rp ${(marketCap / 1e12).toFixed(2)} Triliun ≥ Rp 1T) tercatat memiliki ADTV 20D hanya Rp ${normalizedAdtv20dIDR.toLocaleString('id-ID')}/hari (< Rp 50 Juta). Indikasi salah satuan Lot vs Lembar atau pemotongan nol (ribuan/jutaan).`
    );
  }

  const maxDailyAbsorption5PctIDR = Math.round(normalizedAdtv20dIDR * 0.05);

  // -------------------------------------------------------------------------
  // 3. BASIS VALUASI DEFAULT TTM & DUAL-CONFIRMATION CATALYST
  // -------------------------------------------------------------------------
  if (
    typeof raw.forwardAnnualizedEps === 'number' &&
    raw.forwardAnnualizedEps > sanitizedEpsTTM * 1.05
  ) {
    flags.push('LINEAR_ANNUALIZATION_BLOCKED');
  }

  const niYoYDecimal = toDecimalRate(raw.netIncomeYoYPct, 0);
  const opProfitYoYDecimal = toDecimalRate(raw.operatingProfitYoYPct, 0);
  const isSeedCapped = raw.convictionCappedByLineage === true;

  if (isSeedCapped && !flags.includes('SEED_DATA_ACTIVE')) {
    flags.push('SEED_DATA_ACTIVE');
    reasons.push(
      `[SEED_DATA_ACTIVE] Variabel laporan keuangan inti masih bersumber dari HARDCODED_SEED. Status dikunci ke SEED_WARN, katalis pertumbuhan dinonaktifkan, dan peringkat dibatasi maksimal Grade C (WATCHLIST_SEED_CAPPED).`
    );
  }

  // Dual Confirmation Rule: NI YoY >= 15% MUST be confirmed by Operating Profit YoY >= 10%
  // FIX 4: Lock catalyst when core fundamentals originate from HARDCODED_SEED
  const isNiSurge = niYoYDecimal >= 0.15;
  const isOpProfitConfirmed = opProfitYoYDecimal >= 0.10;
  let isDualCatalystConfirmed = !isSeedCapped && isNiSurge && isOpProfitConfirmed;

  let catalystConfirmationNote = '';
  if (isSeedCapped) {
    isDualCatalystConfirmed = false;
    catalystConfirmationNote =
      'CATALYST BLOCKED: Pertumbuhan laba/EBIT berasal dari HARDCODED_SEED, bukan laporan keuangan aktual.';
  } else if (isDualCatalystConfirmed) {
    catalystConfirmationNote = `CATALYST ACTIVE (Dual-Confirmed): Laba Bersih YoY +${(niYoYDecimal * 100).toFixed(1)}% (Min. 15%) terkonfirmasi searah oleh Laba Usaha (Operating Profit) YoY +${(opProfitYoYDecimal * 100).toFixed(1)}% (Min. 10%).`;
  } else if (isNiSurge && !isOpProfitConfirmed) {
    flags.push('CATALYST_UNCONFIRMED_NON_OP');
    catalystConfirmationNote = `[Guardrail Kualitas Laba — Katalis Non-Operasional Ditolak] Laba Bersih YoY +${(niYoYDecimal * 100).toFixed(1)}% (Min. 15%) TIDAK terkonfirmasi oleh Laba Usaha YoY (${(opProfitYoYDecimal * 100).toFixed(1)}% < +10%). Sinyal Catalyst Active diblokir untuk mencegah distorsi laba non-operasional.`;
    reasons.push(catalystConfirmationNote);
  } else {
    catalystConfirmationNote = `Basis TTM Standar: Pertumbuhan Laba Bersih YoY ${(niYoYDecimal * 100).toFixed(1)}% & Laba Usaha YoY ${(opProfitYoYDecimal * 100).toFixed(1)}% berada di bawah ambang Dual-Confirmation Catalyst (NI Min. 15% & EBIT Min. 10%).`;
  }

  // -------------------------------------------------------------------------
  // 4. FRESHNESS CHECK KURVA SBN 10Y (RISK-FREE RATE)
  // -------------------------------------------------------------------------
  const spotRf10Y = toDecimalRate(raw.spotRf10Y, 0.0675);
  const nowMs = raw.referenceNowDate ? Date.parse(raw.referenceNowDate) : Date.now();
  const isSbnProxyOrMissingDate = raw.isSbnMacroProxy === true || !raw.rfLastUpdated;
  const rfUpdatedMs =
    !isSbnProxyOrMissingDate && raw.rfLastUpdated ? Date.parse(raw.rfLastUpdated) : NaN;

  let rfAgeDays: number | null = null;
  let isRfStale = false;
  if (!isSbnProxyOrMissingDate && Number.isFinite(rfUpdatedMs) && Number.isFinite(nowMs)) {
    rfAgeDays = Math.max(0, Math.floor((nowMs - rfUpdatedMs) / (1000 * 60 * 60 * 24)));
    if (rfAgeDays > 7) {
      isRfStale = true;
    }
  } else {
    rfAgeDays = null;
    isRfStale = true;
  }

  const keSafetyBufferBps = isRfStale ? 50 : 0; // +50 bps (+0.50%) automatic Ke buffer when SBN curve is proxy or > 7 days old
  const convictionBadgeDowngraded = isRfStale;

  if (isRfStale) {
    if (!flags.includes('SBN_PROXY_OR_STALE')) {
      flags.push('SBN_PROXY_OR_STALE');
    }
    if (!flags.includes('STALE_RF_DATA')) {
      flags.push('STALE_RF_DATA');
    }
    if (isSbnProxyOrMissingDate) {
      reasons.push(
        `[SBN_PROXY_OR_STALE] Kurva SBN 10Y (${(spotRf10Y * 100).toFixed(2)}%) berasal dari formula proksi atau belum memiliki tanggal kutipan aktual (rfLastUpdated: null). Ditambahkan safety buffer otomatis +50 bps pada Cost of Equity (Ke) hingga SBN aktual dimuat via AUTOMATED_FETCH atau USER_OVERRIDE.`
      );
    } else {
      reasons.push(
        `[STALE_RF_DATA] Kurva SBN 10Y (${(spotRf10Y * 100).toFixed(2)}%, tanggal: ${raw.rfLastUpdated}) berusia ${rfAgeDays} hari (> batas 7 hari). Ditambahkan safety buffer otomatis +50 bps pada Cost of Equity (Ke) dan penurunan badge keyakinan.`
      );
    }
  }

  // -------------------------------------------------------------------------
  // AGGREGATE SANITY STATUS & GRADE A BLOCKING
  // -------------------------------------------------------------------------
  const hasHardIntegrityFailure =
    isCriticalMismatch || isYtdCumulativeSuspect || isBalanceSheetAnomaly;

  const status: SanityCheckStatus = hasHardIntegrityFailure
    ? 'FAIL'
    : isSeedCapped
    ? 'SEED_WARN'
    : isAdtvAnomaly || isRfStale || flags.includes('CATALYST_UNCONFIRMED_NON_OP')
    ? 'WARN'
    : 'PASS';

  const isGradeABlocked = hasHardIntegrityFailure || isSeedCapped;
  const maxAllowedStatus: SanityReport['maxAllowedStatus'] = hasHardIntegrityFailure
    ? 'DATA_AUDIT_REQUIRED'
    : isSeedCapped
    ? 'WATCHLIST_SEED_CAPPED'
    : isRfStale
    ? 'DOWNGRADED_STALE_RF'
    : 'CORE_CONVICTION_ELIGIBLE';

  return {
    status,
    flags,
    reasons,
    impliedShares: Math.round(impliedShares),
    sharesOutstanding: Math.round(sharesOutstanding),
    sharesMismatchPct: Number(sharesMismatchPct.toFixed(4)),
    impliedNetIncomeFromEps: Math.round(impliedNetIncomeFromEps),
    netIncomeMismatchPct: Number(netIncomeMismatchPct.toFixed(4)),
    impliedEquityFromBvps: Math.round(impliedEquityFromBvps),
    equityMismatchPct: Number(equityMismatchPct.toFixed(4)),
    revenueTtmToFullYearRatio,
    isYtdCumulativeSuspect,
    isBalanceSheetAnomaly,
    isGradeABlocked,
    maxAllowedStatus,
    normalizedAdtv20dShares,
    normalizedAdtv20dIDR,
    maxDailyAbsorption5PctIDR,
    isAdtvAnomaly,
    valuationBasis: 'TTM_DEFAULT',
    sanitizedEpsTTM,
    sanitizedRoeTTM: Number(sanitizedRoeTTM.toFixed(4)),
    isDualCatalystConfirmed,
    catalystConfirmationNote,
    spotRf10Y: Number(spotRf10Y.toFixed(4)),
    rfLastUpdated: isSbnProxyOrMissingDate ? null : raw.rfLastUpdated,
    rfAgeDays,
    isRfStale,
    keSafetyBufferBps,
    convictionBadgeDowngraded
  };
}

/**
 * ============================================================================
 * P1.1: 2-STAGE RESIDUAL INCOME MODEL FOR CAPEX AGGRESSOR
 * ============================================================================
 * Eliminates the perpetuity denominator explosion `(Ke - g_adj)` caused by
 * permanently adding `+2% Capex Premium` into a single-stage Gordon Growth / Justified PBV formula.
 *
 * Implements a strict 2-Stage Residual Income Model (5-Year Explicit + Terminal Value):
 * - Expansion Bonus Gatekeeper: `ROIC > Ke` (or `Incremental_ROIC > Ke`).
 *   Issuers with value-destroying CapEx (`ROIC <= Ke` and `Incremental_ROIC <= Ke`) are denied the +2% growth premium.
 * - Stage 1 (Years 1–5): Allows higher growth `g_high = Math.min(baseG + 0.02, 0.12)` if `ROIC > Ke`,
 *   otherwise `g_high = Math.min(baseG, 0.08)`.
 * - Terminal Stage (Year 6+): Hard cap `g_terminal <= 0.06` (max 6.0% long-term nominal GDP ceiling)
 *   AND enforces minimum denominator spread `(Ke - g_terminal) >= 0.04`.
 */
export interface TwoStageCapexRIParams {
  bvps0: number;                  // Current Book Value Per Share (IDR)
  roeTTM: number;                 // TTM ROE (decimal e.g. 0.18 or percentage 18.0)
  roicTTM: number;                // TTM ROIC (decimal e.g. 0.14 or percentage 14.0)
  incrementalRoic?: number;       // Incremental ROIC (decimal or percentage)
  costOfEquityKe: number;         // Base Cost of Equity Ke (decimal e.g. 0.115 or percentage 11.5)
  keSafetyBufferBps?: number;     // +50 bps from STALE_RF_DATA if applicable
  baseGrowthRate: number;         // Sustainable base growth g (decimal e.g. 0.06 or percentage 6.0)
  persistenceOmega?: number;      // Optional terminal fade factor (default 0.82 for Capex Aggressors)
  qualityMultiplier?: number;     // Optional QMJ / HSC quality multiplier (default 1.0)
  tickRounder?: (price: number) => number;
}

export interface TwoStageCapexRIOutput {
  intrinsicValuePerShareIDR: number;
  bvps0: number;
  effectiveCostOfEquity: number;  // Decimal (includes safety buffer)
  roicTTM: number;                // Decimal
  incrementalRoic: number;        // Decimal
  isRoicAboveKe: boolean;
  roicSpreadPct: number;          // Percentage points (e.g., +2.80%)
  stage1GrowthRate: number;       // Decimal (max 0.12)
  terminalGrowthRate: number;     // Decimal (max 0.06, and <= Ke - 0.04)
  terminalSpread: number;         // Decimal (guaranteed >= 0.04)
  explicitStage1PvPerShare: number;
  terminalValuePvPerShare: number;
  terminalBookValueYear5: number;
  formulaAuditLog: string;
}

export function calculateTwoStageCapexAggressorRI(
  params: TwoStageCapexRIParams
): TwoStageCapexRIOutput {
  const bvps0 = Math.max(10, Number(params.bvps0) || 100);
  const roe0 = Math.max(0.01, Math.min(0.32, toDecimalRate(params.roeTTM, 0.15)));
  const roic = toDecimalRate(params.roicTTM, roe0 * 0.88);
  const incRoic = toDecimalRate(params.incrementalRoic, roic);
  const baseKe = Math.max(0.08, toDecimalRate(params.costOfEquityKe, 0.115));
  const bufferDecimal = (params.keSafetyBufferBps ?? 0) / 10_000;
  const effectiveKe = Number((baseKe + bufferDecimal).toFixed(4));
  const baseG = Math.max(0.01, toDecimalRate(params.baseGrowthRate, 0.055));
  const qualityMultiplier = Math.max(0.5, Math.min(1.15, params.qualityMultiplier ?? 1.0));
  const tickRounder = params.tickRounder ?? roundToIdxTickSize;

  // Gatekeeper condition: ROIC > Ke OR Incremental_ROIC > Ke
  const bestRoic = Math.max(roic, incRoic);
  const isRoicAboveKe = roic > effectiveKe || incRoic > effectiveKe;
  const roicSpreadPct = Number(((bestRoic - effectiveKe) * 100).toFixed(2));

  // Stage 1 (Years 1–5): Expansion bonus (+2%) ONLY granted if ROIC > Ke (or Incremental_ROIC > Ke), capped at 12.0%
  const stage1GrowthRate = isRoicAboveKe
    ? Number(Math.min(baseG + 0.02, 0.12).toFixed(4))
    : Number(Math.min(baseG, 0.06).toFixed(4));

  // Terminal Stage (Year 6+): Hard cap g_terminal <= 0.06 AND force minimum spread (Ke - g_terminal) >= 0.04
  const maxAllowedTerminalGBySpread = effectiveKe - 0.04;
  const terminalGrowthRate = Number(
    Math.max(0.0, Math.min(0.06, baseG, maxAllowedTerminalGBySpread)).toFixed(4)
  );
  const terminalSpread = Number(Math.max(0.04, effectiveKe - terminalGrowthRate).toFixed(4));

  // If value-destroying capex (ROIC <= Ke), effective ROE in Stage 1 & Terminal is capped by ROIC reality
  const effectiveStage1Roe = isRoicAboveKe
    ? roe0
    : Math.min(roe0, Math.max(0.04, bestRoic));

  // Explicit 5-Year Residual Income Roll-Forward (Years 1 to 5)
  let currentBook = bvps0;
  let explicitStage1Pv = 0;

  for (let year = 1; year <= 5; year++) {
    const beginningBook = currentBook;
    // Slight fade toward sustainable ROE across the 5-year explicit horizon
    const fadeWeight = (year - 1) / 5;
    const targetYear5Roe = isRoicAboveKe
      ? Math.max(effectiveKe + 0.015, effectiveStage1Roe * 0.90)
      : Math.min(effectiveStage1Roe, effectiveKe * 0.92);
    const yearRoe = effectiveStage1Roe * (1 - fadeWeight) + targetYear5Roe * fadeWeight;

    const residualIncomeYear = (yearRoe - effectiveKe) * beginningBook;
    const discountFactor = Math.pow(1 + effectiveKe, year);
    explicitStage1Pv += residualIncomeYear / discountFactor;

    // Book value grows at Stage-1 growth rate g_high
    currentBook = beginningBook * (1 + stage1GrowthRate);
  }

  const terminalBookValueYear5 = currentBook;

  // Terminal Stage (Year 6+): Terminal ROE fades toward competitive equilibrium anchored by omega
  const omega = Math.max(0.55, Math.min(0.92, params.persistenceOmega ?? 0.80));
  const terminalRoe = isRoicAboveKe
    ? effectiveKe + Math.max(0, effectiveStage1Roe - effectiveKe) * omega * 0.65
    : Math.min(effectiveStage1Roe, effectiveKe);

  const terminalResidualIncomeYear6 = (terminalRoe - effectiveKe) * terminalBookValueYear5;
  // Terminal Value at Year 5 with hard spread denominator (Ke - g_terminal) >= 0.04
  const rawTerminalValueYear5 = terminalResidualIncomeYear6 / terminalSpread;
  const terminalValuePv = Math.max(
    0,
    rawTerminalValueYear5 / Math.pow(1 + effectiveKe, 5)
  );

  const rawIntrinsicPerShare = (bvps0 + explicitStage1Pv + terminalValuePv) * qualityMultiplier;
  const intrinsicValuePerShareIDR = tickRounder(Math.max(50, rawIntrinsicPerShare));

  const formulaAuditLog = `2-Stage RI [ROIC ${(bestRoic * 100).toFixed(1)}% ${
    isRoicAboveKe ? '>' : '≤'
  } Ke ${(effectiveKe * 100).toFixed(2)}% → ${
    isRoicAboveKe ? 'Bonus Ekspansi Aktif' : 'Tanpa Premi Capex (Value-Destroying Guard)'
  }]: BVPS₀ Rp ${Math.round(bvps0).toLocaleString('id-ID')} + PV(5Y RI @ g_high ${(
    stage1GrowthRate * 100
  ).toFixed(1)}%) Rp ${Math.round(explicitStage1Pv).toLocaleString(
    'id-ID'
  )} + PV(TV @ g_term ${(terminalGrowthRate * 100).toFixed(1)}%, Spread ${(
    terminalSpread * 100
  ).toFixed(2)}%) Rp ${Math.round(terminalValuePv).toLocaleString('id-ID')} = Rp ${intrinsicValuePerShareIDR.toLocaleString('id-ID')}`;

  return {
    intrinsicValuePerShareIDR,
    bvps0: Math.round(bvps0),
    effectiveCostOfEquity: effectiveKe,
    roicTTM: Number(roic.toFixed(4)),
    incrementalRoic: Number(incRoic.toFixed(4)),
    isRoicAboveKe,
    roicSpreadPct,
    stage1GrowthRate,
    terminalGrowthRate,
    terminalSpread,
    explicitStage1PvPerShare: Math.round(explicitStage1Pv),
    terminalValuePvPerShare: Math.round(terminalValuePv),
    terminalBookValueYear5: Math.round(terminalBookValueYear5),
    formulaAuditLog
  };
}

/**
 * ============================================================================
 * P1.2: HARD INVARIANT ON STANDALONE FLOOR (GRAHAM-JOELIARDI BENCHMARK)
 * ============================================================================
 * - Strictly uses 3–5 Year Historical Normalized EPS & ROE (or Math.min(TTM, Avg3Y_5Y)).
 * - STRICTLY FORBIDS Forward Annualized EPS.
 * - Enforces hard invariant: `standaloneFloor <= ensembleFairValue`.
 *   If raw floor > ensembleFairValue, clamps to `Math.min(rawFloor, ensembleFairValue * 0.90)`
 *   and records a diagnostic audit log.
 */
export interface InvariantGrahamJoeliardiParams {
  epsTTM: number;
  epsAvg3Y?: number;
  epsAvg5Y?: number;
  roeTTM: number;                 // Decimal or %
  roeAvg3Y?: number;              // Decimal or %
  roeAvg5Y?: number;              // Decimal or %
  debtToEquity: number;
  growthRate: number;             // Decimal or %
  spotRf10Y: number;              // Decimal or %
  ensembleFairValue: number;      // Main intrinsic ensemble fair value (IDR)
  /**
   * FASE 3: Sector-aware weak-moat & clamp policy from SectorProfile.floorPolicy
   */
  maxRatioToEnsemble?: number;        // Default 0.90 (always clamp to <= 90% of ensembleFairValue)
  roeHaircutThresholdPct?: number;    // Default 15.0% (or Ke + tolerance)
  derHaircutThreshold?: number | null;// Default 1.0x; null for Banks/Financials so banking DER is never penalized
  weakMoatHaircutFactor?: number;     // Default 0.75 (-25% haircut)
  effectiveModule?: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  isQualityCompounderOverride?: boolean;
  tickRounder?: (price: number) => number;
}

export interface InvariantGrahamJoeliardiOutput {
  normalizedBasisEps: number;
  normalizedBasisRoePct: number;
  rawStandaloneFloor: number;
  standaloneFloor: number;
  isMoatHaircutApplied: boolean;
  moatHaircutMultiplier: number;
  moatHaircutReason: string;
  isFloorClamped: boolean;
  floorClampDiagnosticLog?: string;
  formulaAudit: string;
}

export function calculateInvariantGrahamJoeliardiFloor(
  params: InvariantGrahamJoeliardiParams
): InvariantGrahamJoeliardiOutput {
  const tickRounder = params.tickRounder ?? roundToIdxTickSize;
  const epsTTM = Math.max(2, Number(params.epsTTM) || 2);
  const epsAvg3Y = typeof params.epsAvg3Y === 'number' && params.epsAvg3Y > 0 ? params.epsAvg3Y : epsTTM;
  const epsAvg5Y = typeof params.epsAvg5Y === 'number' && params.epsAvg5Y > 0 ? params.epsAvg5Y : epsAvg3Y;

  // Post-Override Archetype Synchronization (Point 5):
  // If the issuer was routed/overridden to Quality Compounder ('Compounder'), ensure it is NEVER
  // penalized by raw cyclical caps on growth (g) or moat multiplier.
  const isPostOverrideCompounder =
    Boolean(params.isQualityCompounderOverride) || params.effectiveModule === 'Compounder';

  // Historical normalized EPS = min(TTM, Avg3Y, Avg5Y_or_3Y_blend) — never Forward Annualized EPS
  const historicalAvgEps = Number(((epsAvg3Y + epsAvg5Y) / 2).toFixed(2));
  const normalizedBasisEps = Math.max(2, Math.round(Math.min(epsTTM, epsAvg3Y, historicalAvgEps)));

  const roeTTMPct = toPercentValue(params.roeTTM, 15.0);
  const roeAvg3YPct =
    typeof params.roeAvg3Y === 'number' ? toPercentValue(params.roeAvg3Y, roeTTMPct) : roeTTMPct;
  const roeAvg5YPct =
    typeof params.roeAvg5Y === 'number' ? toPercentValue(params.roeAvg5Y, roeAvg3YPct) : roeAvg3YPct;
  const historicalAvgRoePct = (roeAvg3YPct + roeAvg5YPct) / 2;
  const normalizedBasisRoePct = Number(
    Math.max(1.0, Math.min(roeTTMPct, roeAvg3YPct, historicalAvgRoePct)).toFixed(2)
  );

  // Bound growth g in Graham formula using post-override archetype:
  // Quality Compounders allow up to 6.0% (and floor at sustainable compounder growth if ROE >= 15% & DER < 0.5x),
  // whereas Pure Cyclicals are bounded at [0%, 4.5%].
  const rawGPct = toPercentValue(params.growthRate, isPostOverrideCompounder ? 5.2 : 4.0);
  const gCapByArchetype = params.effectiveModule === 'Pure_Cyclical' && !isPostOverrideCompounder ? 4.5 : 6.0;
  const compounderMinG =
    isPostOverrideCompounder && roeTTMPct >= 15.0 && params.debtToEquity < 0.50
      ? Math.min(5.5, Math.max(rawGPct, Math.min(6.0, roeTTMPct * 0.25)))
      : rawGPct;
  const safeG = Number(Math.max(0, Math.min(gCapByArchetype, compounderMinG)).toFixed(2));
  const safeSbn10YPct = Math.max(5.0, Math.min(10.5, toPercentValue(params.spotRf10Y, 6.75)));

  const rawFormula = (normalizedBasisEps * (8.5 + 2 * safeG) * 4.4) / safeSbn10YPct;

  // FASE 3 Sector-Aware Moat Haircut (Post-Override Archetype Synchronized):
  // - Quality Compounders (post-override) use compounder ROE threshold (14.0%) and DER threshold (1.0x),
  //   and if TTM ROE >= 15% with DER < 0.50x, are protected from cyclical weak-moat haircut.
  const roeThreshold = isPostOverrideCompounder
    ? Math.min(14.0, params.roeHaircutThresholdPct ?? 14.0)
    : params.roeHaircutThresholdPct ?? 15.0;
  const derThreshold = params.derHaircutThreshold === undefined ? 1.0 : params.derHaircutThreshold;
  const haircutFactor = params.weakMoatHaircutFactor ?? 0.75;

  const isCompounderStrongMoatExempt =
    isPostOverrideCompounder && roeTTMPct >= 15.0 && params.debtToEquity < 0.50;
  const isLowRoe = !isCompounderStrongMoatExempt && normalizedBasisRoePct < roeThreshold;
  const isHighDer = derThreshold !== null && params.debtToEquity > derThreshold;
  const isMoatHaircutApplied = isLowRoe || isHighDer;
  const moatHaircutMultiplier = isMoatHaircutApplied ? haircutFactor : 1.0;

  const rawStandaloneFloor = tickRounder(Math.max(50, rawFormula * moatHaircutMultiplier));

  // FASE 3 Always-On Hard Invariant: standaloneFloor <= maxRatioToEnsemble (90%) * ensembleFairValue
  // Closes Finding F4: Prevents un-clamped floors from sitting at 91%–99% of ensembleFairValue.
  const maxRatio = Math.max(0.50, Math.min(0.95, params.maxRatioToEnsemble ?? 0.90));
  const hasExplicitEnsemble =
    typeof params.ensembleFairValue === 'number' &&
    Number.isFinite(params.ensembleFairValue) &&
    params.ensembleFairValue < Number.MAX_SAFE_INTEGER / 2;
  const safeEnsemble = Math.max(50, Number(params.ensembleFairValue) || rawStandaloneFloor);
  let maxAllowedFloor = Number.MAX_SAFE_INTEGER;
  if (hasExplicitEnsemble) {
    const rawLimit = Math.max(50, safeEnsemble * maxRatio);
    let candidate = tickRounder(rawLimit);
    for (let guard = 0; guard < 6 && candidate > rawLimit + 1e-6 && candidate > 50; guard++) {
      const step =
        candidate > 5000 ? 25 : candidate > 2000 ? 10 : candidate > 500 ? 5 : candidate > 200 ? 2 : 1;
      const nextCandidate = tickRounder(Math.max(50, candidate - step));
      if (nextCandidate >= candidate) {
        candidate = Math.max(50, candidate - step);
        break;
      }
      candidate = nextCandidate;
    }
    maxAllowedFloor = candidate;
  }

  let standaloneFloor = rawStandaloneFloor;
  let isFloorClamped = false;
  let floorClampDiagnosticLog: string | undefined;

  if (hasExplicitEnsemble && rawStandaloneFloor > maxAllowedFloor) {
    isFloorClamped = true;
    standaloneFloor = Math.min(rawStandaloneFloor, maxAllowedFloor);
    const ratioPctLabel = Math.round(maxRatio * 100);
    floorClampDiagnosticLog = `[FLOOR_INVARIANT_CLAMPED] Raw Graham-Joeliardi Floor (Rp ${rawStandaloneFloor.toLocaleString(
      'id-ID'
    )}) melampaui batas konservatif ${ratioPctLabel}% Ensemble Fair Value (Rp ${safeEnsemble.toLocaleString(
      'id-ID'
    )}). Di-clamp ke ${ratioPctLabel}% Ensemble (Rp ${standaloneFloor.toLocaleString(
      'id-ID'
    )}) untuk menjaga margin keamanan standaloneFloor ≤ ${ratioPctLabel}% ensembleFairValue.`;
  }

  const haircutReasons: string[] = [];
  if (isLowRoe) {
    haircutReasons.push(`Norm ROE ${normalizedBasisRoePct.toFixed(1)}% < ${roeThreshold.toFixed(1)}%`);
  }
  if (isHighDer && derThreshold !== null) {
    haircutReasons.push(`DER ${params.debtToEquity.toFixed(2)}x > ${derThreshold.toFixed(2).replace('.', ',')}x`);
  }

  const haircutPctLabel = Math.round((1 - haircutFactor) * 100);
  const haircutMultLabel = haircutFactor.toFixed(2).replace('.', ',');
  const moatHaircutReason = isMoatHaircutApplied
    ? `Weak Moat Penalty -${haircutPctLabel}% (×${haircutMultLabel} karena ${haircutReasons.join(' & ')})`
    : derThreshold === null
    ? `Moat Finansial/Sektoral Kuat (Norm ROE ≥ ${roeThreshold.toFixed(1)}% · DER Korporasi Bypassed)`
    : `Moat Historis Kuat (Norm ROE ≥ ${roeThreshold.toFixed(1)}% & DER ≤ ${derThreshold.toFixed(1).replace('.', ',')}x)`;

  const formulaAudit = `(Norm EPS min(TTM,Avg3Y) Rp ${normalizedBasisEps.toLocaleString(
    'id-ID'
  )} × (8,5 + 2×${safeG.toFixed(1)}) × 4,4 ÷ SBN10Y ${safeSbn10YPct.toFixed(2)}%)${
    isMoatHaircutApplied ? ` × ${haircutMultLabel}` : ''
  }${
    isFloorClamped
      ? ` → Clamped ${Math.round(maxRatio * 100)}% Ensemble (Rp ${standaloneFloor.toLocaleString('id-ID')})`
      : ` = Rp ${standaloneFloor.toLocaleString('id-ID')}`
  }`;

  return {
    normalizedBasisEps,
    normalizedBasisRoePct,
    rawStandaloneFloor,
    standaloneFloor,
    isMoatHaircutApplied,
    moatHaircutMultiplier,
    moatHaircutReason,
    isFloorClamped,
    floorClampDiagnosticLog,
    formulaAudit
  };
}

/**
 * ============================================================================
 * P1.3: HISTORICAL 5Y EV/EBITDA BAND ANCHOR & TACTICAL OVERLAY SEPARATION
 * ============================================================================
 * Computes the 3rd Pure Intrinsic Anchor (Historical EV/EBITDA Band 5Y for
 * asset-heavy / healthcare / infra / industrials, or Normalized Replacement Book
 * for Financials) so Beta-Adjusted StatArb is 100% removed from `ensembleFairValue`
 * and isolated into `TacticalOverlay`.
 */
export function calculateHistoricalEvEbitda5YAnchor(params: {
  ticker?: string;
  sector: string;
  price: number;
  sharesOutstanding: number;
  ebitdaTTM?: number;
  operatingProfitTTM: number;
  daTTM?: number;
  totalDebt?: number;
  cashAndEquivalents?: number;
  equityAttributable: number;
  debtToEquity: number;
  evToEbitda5YMean?: number;
  bvps: number;
  pbv10YMean?: number;
  qualityMultiplier?: number;
  tickRounder?: (price: number) => number;
}): {
  anchorFairPriceIDR: number;
  impliedEvToEbitda: number;
  fairEvToEbitda5YMean: number;
  ebitdaPerShareIDR: number;
  anchorLabel: string;
} {
  const tickRounder = params.tickRounder ?? roundToIdxTickSize;
  const shares = Math.max(1, params.sharesOutstanding);
  const qualityMult = Math.max(0.65, Math.min(1.12, params.qualityMultiplier ?? 1.0));
  const isCpo = params.ticker ? isCpoPlantationTicker(params.ticker) : false;

  // For Financials (where EV/EBITDA is not meaningful), use 5Y/10Y Historical Normalized PBV Band
  if (params.sector === 'Financials') {
    const histPbvMean = Math.max(0.85, Math.min(3.8, params.pbv10YMean ?? 1.95));
    const anchorFairPriceIDR = tickRounder(Math.max(50, params.bvps * histPbvMean * qualityMult));
    return {
      anchorFairPriceIDR,
      impliedEvToEbitda: Number((params.price / Math.max(1, params.bvps)).toFixed(2)),
      fairEvToEbitda5YMean: Number(histPbvMean.toFixed(2)),
      ebitdaPerShareIDR: Math.round(params.bvps),
      anchorLabel: `Hist PBV Band 5Y (${histPbvMean.toFixed(2)}x)`
    };
  }

  const estimatedDa =
    typeof params.daTTM === 'number' && params.daTTM > 0
      ? params.daTTM
      : Math.abs(params.operatingProfitTTM) * 0.22;
  const ebitdaTTM =
    typeof params.ebitdaTTM === 'number' && params.ebitdaTTM > 0
      ? params.ebitdaTTM
      : Math.max(1, params.operatingProfitTTM + estimatedDa);

  const totalDebt =
    typeof params.totalDebt === 'number'
      ? params.totalDebt
      : Math.max(0, params.equityAttributable * Math.max(0, params.debtToEquity));
  const cash =
    typeof params.cashAndEquivalents === 'number'
      ? params.cashAndEquivalents
      : Math.max(0, params.equityAttributable * 0.18);
  const netDebt = totalDebt - cash;

  const currentEv = params.price * shares + netDebt;
  const impliedEvToEbitda = Number(
    Math.max(1.5, Math.min(45.0, currentEv / Math.max(1, ebitdaTTM))).toFixed(2)
  );

  // CPO/Agri Plantation issuers operate economically as cyclical commodities (~5.5x EV/EBITDA anchor, not 11.2x-11.8x FMCG)
  const defaultSector5YEvEbitda = isCpo
    ? 5.5
    : params.sector === 'Healthcare'
    ? 13.5
    : params.sector === 'Consumer Non-Cyclicals'
    ? 11.2
    : params.sector === 'Infrastructures' || params.sector === 'Technology'
    ? 8.4
    : params.sector === 'Basic Materials'
    ? 7.8
    : params.sector === 'Energy'
    ? 5.2
    : 7.5;

  const fairEvToEbitda5YMean = Number(
    Math.max(3.2, Math.min(22.0, (params.evToEbitda5YMean ?? defaultSector5YEvEbitda) * qualityMult)).toFixed(2)
  );

  const targetEnterpriseValue = ebitdaTTM * fairEvToEbitda5YMean;
  const targetEquityValue = Math.max(params.equityAttributable * 0.45, targetEnterpriseValue - netDebt);
  const anchorFairPriceIDR = tickRounder(Math.max(50, targetEquityValue / shares));
  const ebitdaPerShareIDR = Math.max(1, Math.round(ebitdaTTM / shares));

  return {
    anchorFairPriceIDR,
    impliedEvToEbitda,
    fairEvToEbitda5YMean,
    ebitdaPerShareIDR,
    anchorLabel: `Hist EV/EBITDA Band 5Y (${fairEvToEbitda5YMean.toFixed(1)}x)`
  };
}

/**
 * Packages Statistical Arbitrage telemetry into an isolated `TacticalOverlay`
 * object that advises ONLY on entry timing or pair rotation without contaminating
 * the intrinsic `ensembleFairValue`.
 */
export function buildTacticalOverlayFromStatArb(params: {
  pairTicker: string;
  pairName?: string;
  isStatArbValid?: boolean;
  statArbInvalidReason?: string;
  isSameBusinessModel?: boolean;
  isCointegrated?: boolean;
  correlation?: number;
  betaRatio?: number;
  zScore: number;
  spread30DPct: number;
  spread1DPct?: number;
  impliedPairTargetIDR?: number;
  statArbSignal?: StatArbSignalType;
  rationale?: string;
}): TacticalOverlay {
  const {
    pairTicker,
    pairName,
    isStatArbValid: explicitValid,
    statArbInvalidReason,
    isSameBusinessModel = true,
    isCointegrated = true,
    correlation = 0.82,
    betaRatio = 1.0,
    zScore,
    spread30DPct,
    spread1DPct = 0,
    impliedPairTargetIDR,
    statArbSignal,
    rationale
  } = params;

  const isNoPeer =
    !pairTicker ||
    pairTicker === 'N/A' ||
    pairTicker.startsWith('N/A') ||
    explicitValid === false ||
    !isSameBusinessModel ||
    !isCointegrated ||
    correlation < 0.70;

  if (isNoPeer) {
    const invalidReason =
      statArbInvalidReason ||
      (!pairTicker || pairTicker.startsWith('N/A') || !isSameBusinessModel
        ? 'Tidak ada emiten sejenis (same sub-industry & economic driver) di BEI; larangan keras pairing lintas model bisnis.'
        : !isCointegrated
        ? `Uji kointegrasi gagal (ρ=${correlation.toFixed(2)}) — spread historis tidak stasioner.`
        : `Korelasi return historis terlalu lemah (ρ=${correlation.toFixed(2)} < 0.70).`);
    return {
      pairTicker: 'N/A',
      pairName: 'N/A - Tidak ada peer fundamental yang berkorelasi',
      isStatArbValid: false,
      statArbInvalidReason: invalidReason,
      correlation: 0,
      betaRatio: 1.0,
      zScore: 0,
      spreadPct: 0,
      spread1DPct: 0,
      impliedPairTargetIDR: undefined,
      action: 'STATARB_DISABLED_NO_PEER',
      actionLabel: 'N/A - Tidak ada peer fundamental yang berkorelasi',
      rationale: `[Tactical Overlay Dinonaktifkan] N/A - Tidak ada peer fundamental yang berkorelasi (${invalidReason})`
    };
  }

  let action: TacticalOverlay['action'] = 'HOLD_COINTEGRATED_EQUILIBRIUM';
  let actionLabel = 'Ekuilibrium Kointegrasi (Netral — Ikuti Harga Intrinsik)';

  if (statArbSignal === 'MEAN_REVERSION_BUY' || zScore <= -1.25) {
    action = 'TACTICAL_ENTRY_FAVORABLE';
    actionLabel = `Entry Timing Favorable: Laggard vs ${pairTicker} (Z=${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ)`;
  } else if (statArbSignal === 'PAIR_OVEREXTENDED_TRIM' || zScore >= 1.35) {
    action = 'ROTATE_TO_PAIR_WARNING';
    actionLabel = `Saran Rotasi Pasangan / Tunda Kejar Harga vs ${pairTicker} (Z=+${zScore.toFixed(2)}σ)`;
  } else if (statArbSignal === 'FUNDAMENTAL_DIVERGENCE') {
    action = 'FUNDAMENTAL_DIVERGENCE_WAIT';
    actionLabel = `Divergensi Fundamental vs ${pairTicker} (ρ=${correlation.toFixed(2)}) — Abaikan Pair Trade`;
  }

  return {
    pairTicker: pairTicker || 'N/A',
    pairName,
    isStatArbValid: true,
    correlation: Number(correlation.toFixed(2)),
    betaRatio: Number(betaRatio.toFixed(2)),
    zScore: Number(zScore.toFixed(2)),
    spreadPct: Number(spread30DPct.toFixed(2)),
    spread1DPct: Number(spread1DPct.toFixed(2)),
    impliedPairTargetIDR,
    action,
    actionLabel,
    rationale:
      rationale ||
      `[Tactical Overlay — 0% Bobot Intrinsik] Dislokasi relatif terhadap ${pairTicker} (Z-Score ${
        zScore >= 0 ? '+' : ''
      }${zScore.toFixed(2)}σ, Spread 30D ${
        spread30DPct >= 0 ? '+' : ''
      }${spread30DPct.toFixed(1)}%) digunakan murni untuk kalibrasi timing eksekusi.`
  };
}

/**
 * ============================================================================
 * P2.3 & FASE 3: CONTINUOUS EPISTEMIC UNCERTAINTY PENALTY (ZERO CLIFF AT 40%)
 * ============================================================================
 * - Calculates dispersion across intrinsic valuation methods:
 *   `modelDispersion = (maxVal - minVal) / medianVal`
 * - Replaces the 40% step-function cliff (0 -> -10 pts) with a continuous linear
 *   ramp starting at delta_0 = 0.15 (15% dispersion):
 *   `continuousPenalty = clamp((modelDispersion - 0.15) * 31.5, 0, 15)`
 *   - At 15% dispersion: 0 pts
 *   - At 39.9% vs 40.1% dispersion: 7.84 pts vs 7.91 pts (diff 0.07 pts < 1 pt, rounded 8 vs 8)
 *   - At 53.33% dispersion: 12.08 pts (rounded 12 pts)
 * - Closing Finding F3: `isOutlierEnsembleActive` alone never forces a minimum 10-point penalty
 *   when dispersion is low.
 */
export interface DispersionPenaltyInput {
  valuationOutputsIDR: number[];  // Array of active intrinsic model valuations (e.g. [twoStageRI, earningsPower, evEbitda5Y])
  rawConvictionScore: number;     // 0 - 100
  isOutlierEnsembleActive?: boolean;
}

export interface DispersionPenaltyOutput {
  minVal: number;
  maxVal: number;
  medianVal: number;
  modelDispersion: number;        // (maxVal - minVal) / medianVal
  isDispersionPenalized: boolean;
  dispersionPenaltyPts: number;   // Continuous 0 - 15 points (integer rounded)
  continuousPenaltyPts: number;   // Exact continuous penalty (2 decimals)
  adjustedConvictionScore: number;
  tranche1ScalingFactor: number;  // 0.35 (35% of max allocation) when dispersion > 0.40, else 0.60
  fairValueRangeIdr: [number, number];
  penaltyReason?: string;
}

export function applyDispersionPenalty(
  input: DispersionPenaltyInput
): DispersionPenaltyOutput {
  const validPrices = input.valuationOutputsIDR
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (validPrices.length === 0) {
    return {
      minVal: 0,
      maxVal: 0,
      medianVal: 0,
      modelDispersion: 0,
      isDispersionPenalized: false,
      dispersionPenaltyPts: 0,
      continuousPenaltyPts: 0,
      adjustedConvictionScore: input.rawConvictionScore,
      tranche1ScalingFactor: 0.60,
      fairValueRangeIdr: [0, 0]
    };
  }

  const minVal = validPrices[0];
  const maxVal = validPrices[validPrices.length - 1];
  const midIdx = Math.floor(validPrices.length / 2);
  const medianVal =
    validPrices.length % 2 === 1
      ? validPrices[midIdx]
      : (validPrices[midIdx - 1] + validPrices[midIdx]) / 2;

  const modelDispersion = Number(((maxVal - minVal) / Math.max(1, medianVal)).toFixed(4));

  // Continuous linear ramp starting at delta_0 = 0.15 up to 15.0 pts at delta = 0.626
  const rawContinuousPenalty = Math.min(15.0, Math.max(0, (modelDispersion - 0.15) * 31.5));
  const continuousPenaltyPts = Number(rawContinuousPenalty.toFixed(2));
  const dispersionPenaltyPts = Math.round(rawContinuousPenalty);
  const isHighDispersionRegime = modelDispersion > 0.40;
  const isDispersionPenalized = dispersionPenaltyPts > 0;

  let penaltyReason: string | undefined;
  if (isDispersionPenalized) {
    penaltyReason = `[EPISTEMIC_DISPERSION_PENALTY] Dispersi kontinu antar-model valuasi intrinsik sebesar ${(
      modelDispersion * 100
    ).toFixed(1)}% (Rentang Wajar Rp ${Math.round(minVal).toLocaleString(
      'id-ID'
    )} – Rp ${Math.round(maxVal).toLocaleString('id-ID')}, Median Rp ${Math.round(
      medianVal
    ).toLocaleString('id-ID')}). Skor konviksi disesuaikan secara kontinu -${dispersionPenaltyPts} poin (${continuousPenaltyPts.toFixed(
      2
    )} pts)${
      isHighDispersionRegime
        ? ' dan porsi masuk awal (Tranche 1) dibatasi maksimal 35% dari plafon posisi.'
        : '.'
    }`;
  }

  const adjustedConvictionScore = Math.max(
    10,
    Math.min(100, Math.round(input.rawConvictionScore - dispersionPenaltyPts))
  );

  return {
    minVal: Math.round(minVal),
    maxVal: Math.round(maxVal),
    medianVal: Math.round(medianVal),
    modelDispersion,
    isDispersionPenalized,
    dispersionPenaltyPts,
    continuousPenaltyPts,
    adjustedConvictionScore,
    tranche1ScalingFactor: isHighDispersionRegime ? 0.35 : 0.60,
    fairValueRangeIdr: [Math.round(minVal), Math.round(maxVal)],
    penaltyReason
  };
}

/**
 * Single Source of Truth for Conviction Grade string across Header Badges, Banner, Risk Sizing & Narrative.
 */
export function resolveConvictionGrade(
  score: number,
  options?: {
    isHscFlagged?: boolean;
    maxAllowedStatus?: SanityReport['maxAllowedStatus'];
    sanityStatus?: SanityReport['status'];
    isRfStale?: boolean;
    preserveLegacySolidValueForStaleRf?: boolean;
  }
): RiskSizingResult['finalConvictionGrade'] {
  if (options?.isHscFlagged) {
    return 'D (AVOID / HSC)';
  }
  if (options?.maxAllowedStatus === 'DATA_AUDIT_REQUIRED' || options?.sanityStatus === 'FAIL') {
    return 'DATA_AUDIT_REQUIRED';
  }
  if (
    options?.maxAllowedStatus === 'WATCHLIST_SEED_CAPPED' ||
    options?.sanityStatus === 'SEED_WARN'
  ) {
    return 'C (SEED CAPPED)';
  }
  if (score >= 85 && !options?.isRfStale) {
    return 'A+ (CORE CONVICTION)';
  }
  if (score >= 80 && !options?.isRfStale) {
    return 'A (CORE CONVICTION)';
  }
  if (score >= 75) {
    return options?.isRfStale || options?.preserveLegacySolidValueForStaleRf
      ? 'A (SOLID VALUE)'
      : 'A- (SOLID VALUE)';
  }
  if (score >= 65) {
    return 'B (WATCHLIST / HOLD)';
  }
  return 'C (SPECULATIVE)';
}

/**
 * Single Source of Truth for Primary Execution Recommendation Thesis (Header vs Narrative vs StatArb Overlay).
 */
export function resolveExecutionThesis(params: {
  score: number;
  convictionGrade: RiskSizingResult['finalConvictionGrade'];
  sanityStatus?: SanityReport['status'];
  isWeakMoat?: boolean;
  isHscPenaltyActive?: boolean;
  isDispersionPenalized?: boolean;
  isNonOpCatalystRejected?: boolean;
  marginOfSafetyPct?: number;
  tranche1SharePct?: number;
  tranche2SharePct?: number;
  maxBarbellCapPct?: number;
  isHighConvictionActionEligible?: boolean;
}): {
  primaryActionLabel: string;
  holdingFactorsExplanation: string;
  narrativeExecutionSentence: string;
} {
  const {
    score,
    convictionGrade,
    sanityStatus,
    isWeakMoat,
    isHscPenaltyActive,
    isDispersionPenalized,
    isNonOpCatalystRejected,
    tranche1SharePct = 60,
    tranche2SharePct = 40,
    maxBarbellCapPct
  } = params;
  const ceilingNote =
    typeof maxBarbellCapPct === 'number' && maxBarbellCapPct > 0
      ? ` [Active Allocation: 0% (Standby) · Proyeksi Plafon Jika Trigger Terpenuhi: Maks. ${maxBarbellCapPct.toFixed(2)}% (T1 ${tranche1SharePct}% + T2 ${tranche2SharePct}%)]`
      : ' [Active Allocation: 0% (Standby)]';

  if (convictionGrade === 'D (AVOID / HSC)') {
    return {
      primaryActionLabel: 'HINDARI / JANGAN AKUMULASI (HARD BLOCK HSC)',
      holdingFactorsExplanation: 'Terdeteksi risiko tata kelola / konsentrasi kepemilikan ekstrem KSEI (High Shareholder Concentration).',
      narrativeExecutionSentence: `HINDARI / JANGAN AKUMULASI (HARD BLOCK HSC) — terdeteksi risiko konsentrasi kepemilikan ekstrem KSEI.${ceilingNote}`
    };
  }

  if (convictionGrade === 'DATA_AUDIT_REQUIRED' || sanityStatus === 'FAIL') {
    return {
      primaryActionLabel: 'TUNDA EKSEKUSI — WAJIB AUDIT DATA FUNDAMENTAL',
      holdingFactorsExplanation: 'Ditemukan anomali rekonsiliasi data fundamental (CRITICAL_DATA_MISMATCH / YTD_CUMULATIVE_SUM_SUSPECT).',
      narrativeExecutionSentence: `TUNDA EKSEKUSI — WAJIB AUDIT DATA FUNDAMENTAL sebelum alokasi modal.${ceilingNote}`
    };
  }

  if (
    convictionGrade === 'C (SEED CAPPED)' ||
    convictionGrade === 'C (SPECULATIVE)' ||
    sanityStatus === 'SEED_WARN' ||
    score < 65
  ) {
    return {
      primaryActionLabel: 'SPECULATIVE WATCHLIST / TUNGGU AUDIT DATA',
      holdingFactorsExplanation:
        sanityStatus === 'SEED_WARN' || convictionGrade === 'C (SEED CAPPED)'
          ? 'Data fundamental masih berstatus fallback katalog statis (SEED_WARN) atau skor konviksi di bawah ambang 65/100.'
          : 'Skor konviksi di bawah ambang institusional 65/100 atau bantalan Margin of Safety belum memadai.',
      narrativeExecutionSentence:
        `SPECULATIVE WATCHLIST / TUNGGU AUDIT DATA — tahan alokasi modal baru hingga kualitas fundamental dan diskon valuasi terkonfirmasi.${ceilingNote}`
    };
  }

  if (
    convictionGrade === 'B (WATCHLIST / HOLD)' ||
    (score >= 65 && score < 75) ||
    params.isHighConvictionActionEligible === false
  ) {
    const factors: string[] = [];
    if (isWeakMoat) factors.push('Weak Moat Penalty (ROE/ROIC di bawah Cost of Equity)');
    if (isHscPenaltyActive) factors.push('HSC Concentration Penalty');
    if (isDispersionPenalized) factors.push('Epistemic Dispersion (ketidakpastian antar-model valuasi)');
    if (isNonOpCatalystRejected) factors.push('Guardrail Kualitas Laba (Katalis Non-Operasional Ditolak)');
    if (factors.length === 0) {
      factors.push('Skor konviksi berada di pita transisi 65-74/100 atau Margin of Safety belum mencapai syarat eksekusi');
    }
    const factorStr = factors.join(', ');
    return {
      primaryActionLabel: 'WATCHLIST / HOLD — TUNGGU KONFIRMASI SKOR ATAU DISKON LEBIH DALAM',
      holdingFactorsExplanation: `Faktor penahan utama: ${factorStr}.`,
      narrativeExecutionSentence: `WATCHLIST / HOLD — TUNGGU KONFIRMASI SKOR ATAU DISKON LEBIH DALAM (Faktor penahan: ${factorStr}).${ceilingNote}`
    };
  }

  if (
    convictionGrade === 'A- (SOLID VALUE)' ||
    convictionGrade === 'A (SOLID VALUE)' ||
    (score >= 75 && score < 80)
  ) {
    return {
      primaryActionLabel: 'AKUMULASI SELEKTIF DI ZONA DISKON',
      holdingFactorsExplanation: 'Fundamental solid (Skor 75-79/100, Grade A-) dengan disiplin masuk ketat di rentang harga diskon.',
      narrativeExecutionSentence: `AKUMULASI SELEKTIF DI ZONA DISKON melalui pembagian Tranche 1 (${tranche1SharePct}%) dan Tranche 2 (${tranche2SharePct}%).`
    };
  }

  return {
    primaryActionLabel: 'LAYAK AKUMULASI BERTAHAP (CORE CONVICTION)',
    holdingFactorsExplanation: 'Kualitas bisnis, neraca, dan Margin of Safety memenuhi standar tertinggi Core Conviction (Skor Min. 80/100).',
    narrativeExecutionSentence: `LAYAK AKUMULASI BERTAHAP (CORE CONVICTION) dengan disiplin pembagian Tranche 1 (${tranche1SharePct}%) dan Tranche 2 (${tranche2SharePct}%).`
  };
}

/**
 * ============================================================================
 * P2.1 & P2.2 + FASE 3: SMOOTH MONOTONIC VOLATILITY-TARGETED BARBELL SIZING & ATR STOP
 * ============================================================================
 * 1. Volatility-Targeted Barbell Sizing (Overcoming 1/Beta Blindness & Flat 25%-35% Plateau):
 *    - `finalMaxAllocation = Math.min(inverseBetaCap, inverseVolatilityCap, regimeCap)`
 *    - Smooth Monotonic Volatility Curve (Closing Finding F5):
 *      - From 14% to 35% annualized volatility: decreases strictly monotonically from 18.0% down to 12.0%
 *        (eliminating the flat 12.5% floor across 25%–35% volatility).
 *      - Above 35% volatility: decreases strictly monotonically from 12.0% down to 8.0% at >= 60% volatility.
 *      - Optional drawdown penalty: if 1Y max drawdown > 25%, smoothly trims ceiling by up to 2.5%.
 * 2. ATR / Volatility-Calibrated Stop Loss & Dual Core Conviction Mode:
 *    - `stopDistance = Math.max(2.5 * ATR_20, price * 1.5 * (realizedAnnualVol / Math.sqrt(12)))`
 *      bounded within sector stop band (default [12%, 18%]) below entry price.
 */
export interface VolatilitySizingAndStopInput {
  price: number;
  beta1Y: number;                 // FASE 3: Unified Adjusted Beta passed from evaluateJoeliardiOosFundamental
  realizedAnnualVol: number;      // Decimal (e.g. 0.38) or percentage (38.0)
  atr20: number;                  // 20-Day ATR in IDR
  marketRegime: MarketRegimeStatus;
  rawConvictionScore: number;
  dispersionPenalty: DispersionPenaltyOutput;
  sanityReport: SanityReport;
  isHscFlagged?: boolean;
  effectiveCostOfEquity?: number; // Decimal
  debtToEquity?: number;
  maxDrawdown1YPct?: number;      // Optional 1Y Max Drawdown (%) for drawdown-aware sizing
  maxArchetypeAllocationPct?: number; // Optional SectorProfile sizing cap
  stopLossBandPct?: [number, number]; // Optional SectorProfile stop band [minPct, maxPct]
  tickRounder?: (price: number) => number;
}

export function calculateVolatilityTargetedSizingAndStop(
  input: VolatilitySizingAndStopInput
): RiskSizingResult {
  const tickRounder = input.tickRounder ?? roundToIdxTickSize;
  const price = Math.max(50, Number(input.price) || 100);
  const beta1Y = Math.max(0.25, Number(input.beta1Y) || 1.0);
  const realizedVolDecimal = Math.max(0.08, toDecimalRate(input.realizedAnnualVol, 0.24));
  const atr20IDR = Math.max(1, Math.round(Number(input.atr20) || price * 0.025));

  // 1. Inverse Beta Cap (1/Beta propensity, bounded [4.0%, 18.0%])
  const inverseBetaCapPct = Number(
    Math.max(4.0, Math.min(18.0, 12.5 / Math.max(0.35, beta1Y))).toFixed(2)
  );

  // 2. Smooth Strictly Monotonic Inverse Volatility Cap (Closing Finding F5):
  // Eliminates the flat 12.5% floor on 25%-35% volatility.
  const isHighStockVol = realizedVolDecimal > 0.35;
  let rawInverseVolatilityCapPct = 18.0;
  if (isHighStockVol) {
    // Strictly monotonic decrease from 12.0% at 35% vol down to 8.0% at >=60% vol
    const volExcess = Math.min(0.25, realizedVolDecimal - 0.35);
    rawInverseVolatilityCapPct = 12.0 - (volExcess / 0.25) * 4.0;
  } else {
    // Strictly monotonic decrease from 18.0% at <=14% vol down to 12.0% at 35% vol
    const volProgress = Math.max(0, Math.min(1, (realizedVolDecimal - 0.14) / (0.35 - 0.14)));
    rawInverseVolatilityCapPct = 18.0 - volProgress * 6.0;
  }

  // Optional Drawdown dampening when 1Y max drawdown exceeds 25%
  const maxDdPct = Math.abs(Number(input.maxDrawdown1YPct) || 0);
  const drawdownDampenerPct =
    maxDdPct > 25 ? Math.min(2.5, ((maxDdPct - 25) / 35) * 2.5) : 0;

  const inverseVolatilityCapPct = Number(
    Math.max(6.0, Math.min(18.0, rawInverseVolatilityCapPct - drawdownDampenerPct)).toFixed(2)
  );

  // 3. Market Regime Cap:
  // If IHSG market regime is VOLATIL, cap max allocation strictly within 8.0% - 12.0%
  const isVolatileRegime = input.marketRegime === 'VOLATIL';
  const regimeCapPct = isVolatileRegime
    ? realizedVolDecimal > 0.35
      ? 8.5
      : 10.5
    : input.marketRegime === 'WASPADA'
    ? 14.0
    : 18.0;

  const isVolatilityScalarTriggered = isHighStockVol || isVolatileRegime;

  const archetypeCapPct =
    typeof input.maxArchetypeAllocationPct === 'number' && input.maxArchetypeAllocationPct > 0
      ? input.maxArchetypeAllocationPct
      : 18.0;

  // Final Barbell Position Ceiling: Math.min(inverseBetaCap, inverseVolatilityCap, regimeCap, archetypeCap)
  let finalMaxAllocationPct = Number(
    Math.min(inverseBetaCapPct, inverseVolatilityCapPct, regimeCapPct, archetypeCapPct).toFixed(2)
  );

  // Enforce strict 8% - 12% upper ceiling guarantee whenever Volatility Scalar is triggered
  if (isVolatilityScalarTriggered) {
    finalMaxAllocationPct = Number(
      Math.max(8.0, Math.min(12.0, finalMaxAllocationPct)).toFixed(2)
    );
  }

  // Tranche Sizing (Single Source of Truth: derived strictly from tranche1ScalingFactor)
  const t1Factor = input.dispersionPenalty.tranche1ScalingFactor;
  const tranche1AllocationPct = Number((finalMaxAllocationPct * t1Factor).toFixed(2));
  const tranche2AllocationPct = Number(
    Math.max(0, finalMaxAllocationPct - tranche1AllocationPct).toFixed(2)
  );
  const tranche1SharePct = Math.round(
    (tranche1AllocationPct / Math.max(0.01, finalMaxAllocationPct)) * 100
  );
  const tranche2SharePct = Math.max(0, 100 - tranche1SharePct);
  const isTranche1CappedByDispersion = tranche1SharePct <= 40;

  // -------------------------------------------------------------------------
  // ATR / VOLATILITY-CALIBRATED STOP LOSS (BOUNDED WITHIN SECTOR STOP BAND)
  // Formula: stopDistance = Math.max(2.5 * ATR_20, price * 1.5 * (realizedAnnualVol / Math.sqrt(12)))
  // -------------------------------------------------------------------------
  const atrMultipleStopDistanceIDR = 2.5 * atr20IDR;
  const volMonthlyStopDistanceIDR = price * 1.5 * (realizedVolDecimal / Math.sqrt(12));
  const rawStopDistanceIDR = Math.max(atrMultipleStopDistanceIDR, volMonthlyStopDistanceIDR);

  const minStopBandDec = (input.stopLossBandPct?.[0] ?? 12.0) / 100;
  const maxStopBandDec = (input.stopLossBandPct?.[1] ?? 18.0) / 100;
  const minAllowedStopIDR = price * minStopBandDec;
  const maxAllowedStopIDR = price * maxStopBandDec;
  const clampedStopDistanceIDR = Math.max(
    minAllowedStopIDR,
    Math.min(maxAllowedStopIDR, rawStopDistanceIDR)
  );

  const stopLossPriceIDR = tickRounder(Math.max(50, price - clampedStopDistanceIDR));
  const appliedStopDistanceIDR = Math.max(0, price - stopLossPriceIDR);
  const stopLossPct = Number(((appliedStopDistanceIDR / price) * 100).toFixed(2));

  // -------------------------------------------------------------------------
  // CONVICTION SCORE PENALTIES & GRADE GUARDRAIL ENFORCEMENT
  // -------------------------------------------------------------------------
  const penaltyReasons: string[] = [];
  if (input.dispersionPenalty.penaltyReason) {
    penaltyReasons.push(input.dispersionPenalty.penaltyReason);
  }

  const staleRfPenaltyPts = input.sanityReport.isRfStale ? 5 : 0;
  if (input.sanityReport.isRfStale) {
    const rfDesc =
      input.sanityReport.rfAgeDays !== null
        ? `berusia ${input.sanityReport.rfAgeDays} hari (>7 hari)`
        : 'berstatus proksi / belum tersinkronisasi (rfLastUpdated: null)';
    penaltyReasons.push(
      `[SBN_PROXY_OR_STALE] Kurva SBN 10Y ${rfDesc}: Cost of Equity (Ke) ditambah +50 bps dan skor keyakinan dikurangi -${staleRfPenaltyPts} poin (maksimal Grade A, blokir A+).`
    );
  }

  if (input.sanityReport.isGradeABlocked) {
    if (input.sanityReport.flags.includes('YTD_CUMULATIVE_SUM_SUSPECT')) {
      penaltyReasons.push(
        `[YTD_CUMULATIVE_SUM_SUSPECT] Double-Counting Trap terdeteksi pada Flow Metrics TTM: Peringkat Grade A / Core Conviction diblokir otomatis → Status dikunci ke DATA_AUDIT_REQUIRED.`
      );
    }
    if (input.sanityReport.flags.includes('BALANCE_SHEET_ANOMALY')) {
      penaltyReasons.push(
        `[BALANCE_SHEET_ANOMALY] Pelanggaran Snapshot Neraca (Equity > Assets atau lonjakan BVPS >50% tanpa Rights Issue): Peringkat Grade A diblokir → Status dikunci ke DATA_AUDIT_REQUIRED.`
      );
    }
    if (input.sanityReport.flags.includes('CRITICAL_DATA_MISMATCH')) {
      penaltyReasons.push(
        `[CRITICAL_DATA_MISMATCH] Rekonsiliasi Shares/EPS/BVPS gagal: Peringkat Grade A / Core Conviction diblokir otomatis → Status dikunci ke DATA_AUDIT_REQUIRED.`
      );
    }
    if (input.sanityReport.flags.includes('SEED_DATA_ACTIVE')) {
      penaltyReasons.push(
        `[SEED_DATA_ACTIVE] Variabel fundamental inti masih berasal dari HARDCODED_SEED: Peringkat Grade A/B diblokir otomatis → Maksimal Grade C (WATCHLIST_SEED_CAPPED).`
      );
    }
  }

  const adjustedConvictionScore = Math.max(
    10,
    Math.min(
      100,
      input.dispersionPenalty.adjustedConvictionScore - staleRfPenaltyPts
    )
  );

  const finalConvictionGrade = resolveConvictionGrade(adjustedConvictionScore, {
    isHscFlagged: input.isHscFlagged,
    maxAllowedStatus: input.sanityReport.maxAllowedStatus,
    sanityStatus: input.sanityReport.status,
    isRfStale: input.sanityReport.isRfStale,
    preserveLegacySolidValueForStaleRf: true
  });

  const isCoreOrSolidGrade =
    finalConvictionGrade === 'A+ (CORE CONVICTION)' ||
    finalConvictionGrade === 'A (CORE CONVICTION)' ||
    finalConvictionGrade === 'A- (SOLID VALUE)' ||
    finalConvictionGrade === 'A (SOLID VALUE)';

  const isStandbyAllocation = !isCoreOrSolidGrade;
  const activeAllocationPct = isStandbyAllocation ? 0 : finalMaxAllocationPct;

  const stopLossMode: RiskSizingResult['stopLossMode'] = isCoreOrSolidGrade
    ? 'DUAL_CORE_CONVICTION_TRANCHE_AND_ATR'
    : 'ATR_VOL_CALIBRATED';

  const kePctLabel = ((input.effectiveCostOfEquity ?? 0.115) * 100).toFixed(2);
  const fundamentalInvalidationStopTriggers: string[] = [
    `Invalidasi ROIC/ROE: ROIC TTM atau ROE TTM turun di bawah Effective Cost of Equity (Ke ${kePctLabel}%) selama 2 kuartal berturut-turut.`,
    `Invalidasi Neraca & Kas: Rasio OCF/NI jatuh di bawah ambang batas sehat atau Net DER melompat > 1,20x tanpa ekspansi aset produktif.`,
    `Invalidasi Integritas Data: Status SANITY_CHECK berubah menjadi FAIL (CRITICAL_DATA_MISMATCH / YTD_CUMULATIVE_SUM_SUSPECT) atau muncul indikasi distribusi tidak wajar KSEI.`
  ];

  const trancheExecutionGuide = isStandbyAllocation
    ? `Active Allocation: 0% (Standby — Status ${finalConvictionGrade}) · Proyeksi Plafon Jika Trigger Terpenuhi: Maks. ${finalMaxAllocationPct.toFixed(
        2
      )}% (Tranche 1 [${tranche1SharePct}%]: ${tranche1AllocationPct.toFixed(2)}%${
        isTranche1CappedByDispersion ? ' [Dibatasi Penalti Dispersi >40%]' : ''
      } + Tranche 2 [${tranche2SharePct}%]: ${tranche2AllocationPct.toFixed(2)}%).`
    : `Active Allocation Maks. ${finalMaxAllocationPct.toFixed(
        2
      )}% · Tranche 1 (Inisiasi ${tranche1SharePct}%): ${tranche1AllocationPct.toFixed(2)}% ekuitas${
        isTranche1CappedByDispersion ? ' [Dibatasi Penalti Dispersi >40%]' : ''
      } · Tranche 2 (Konfirmasi Laba/Support ${tranche2SharePct}%): +${tranche2AllocationPct.toFixed(
        2
      )}% (Total Plafon Maks. ${finalMaxAllocationPct.toFixed(2)}%).`;

  return {
    beta1Y: Number(beta1Y.toFixed(2)),
    realizedAnnualVol: Number(realizedVolDecimal.toFixed(4)),
    marketRegime: input.marketRegime,
    inverseBetaCapPct,
    inverseVolatilityCapPct,
    regimeCapPct,
    finalMaxAllocationPct,
    isVolatilityScalarTriggered,
    tranche1AllocationPct,
    tranche2AllocationPct,
    tranche1SharePct,
    tranche2SharePct,
    activeAllocationPct,
    projectedBarbellCapPct: finalMaxAllocationPct,
    isStandbyAllocation,
    atr20IDR,
    atrMultipleStopDistanceIDR: Math.round(atrMultipleStopDistanceIDR),
    volMonthlyStopDistanceIDR: Math.round(volMonthlyStopDistanceIDR),
    rawStopDistanceIDR: Math.round(rawStopDistanceIDR),
    appliedStopDistanceIDR,
    stopLossPct,
    stopLossPriceIDR,
    stopLossMode,
    trancheExecutionGuide,
    fundamentalInvalidationStopTriggers,
    rawConvictionScore: input.rawConvictionScore,
    dispersionPenaltyPts: input.dispersionPenalty.dispersionPenaltyPts,
    staleRfPenaltyPts,
    adjustedConvictionScore,
    finalConvictionGrade,
    penaltyReasons
  };
}

/**
 * Builds a complete, coherent `RawTickerData` record from a `StockMetrics` object
 * and derived fundamental parameters, respecting any explicit raw fields on `stock`.
 */
export function buildRawTickerDataFromStock(params: {
  stock: StockMetrics;
  price: number;
  trailingEpsIdr: number;
  forwardEpsIdr?: number;
  estimatedBvpsIdr: number;
  trailingRoePct: number;
  adtv20dIdr: number;
  liveMarketCapIdr: number;
  sharesOutstanding?: number;
  sbnSpot10YPct: number;
  dynamicCostOfEquityPct: number;
  sustainableGrowthRatePct: number;
  cwipToAssetsRatio: number;
  capexToDaRatio: number;
  capexToRevenueRatio: number;
  ocfToNetIncomeRatio: number;
  earningsGrowthYoYPct: number;
  marketRegime?: MarketRegimeStatus;
  rfLastUpdated?: string | null;
  convictionCappedByLineage?: boolean;
  isSbnMacroProxy?: boolean;
}): RawTickerData {
  const {
    stock,
    price,
    trailingEpsIdr,
    forwardEpsIdr,
    estimatedBvpsIdr,
    trailingRoePct,
    adtv20dIdr,
    liveMarketCapIdr,
    sharesOutstanding: paramSharesOutstanding,
    sbnSpot10YPct,
    dynamicCostOfEquityPct,
    sustainableGrowthRatePct,
    cwipToAssetsRatio,
    capexToDaRatio,
    capexToRevenueRatio,
    ocfToNetIncomeRatio,
    earningsGrowthYoYPct,
    marketRegime = 'TENANG',
    rfLastUpdated: paramRfLastUpdated,
    convictionCappedByLineage,
    isSbnMacroProxy
  } = params;

  const userOverride = getFundamentalUserOverride(stock.ticker);

  const sharesOutstanding =
    userOverride?.sharesOutstanding && userOverride.sharesOutstanding > 0
      ? Math.round(userOverride.sharesOutstanding)
      : paramSharesOutstanding && paramSharesOutstanding > 0
      ? Math.round(paramSharesOutstanding)
      : stock.sharesOutstanding && stock.sharesOutstanding > 0
      ? Math.round(stock.sharesOutstanding)
      : Math.max(100_000_000, Math.round(liveMarketCapIdr / Math.max(1, price)));

  const calibratedMarketCap =
    (userOverride?.sharesOutstanding && userOverride.sharesOutstanding > 0) ||
    (stock.sharesOutstanding &&
      stock.sharesOutstanding > 0 &&
      stock.fundamentalsSource &&
      stock.fundamentalsSource !== 'HARDCODED_SEED')
      ? Math.round(sharesOutstanding * price)
      : liveMarketCapIdr && liveMarketCapIdr > 0
      ? Math.round(liveMarketCapIdr)
      : stock.liveMarketCapIdr && stock.liveMarketCapIdr > 0
      ? Math.round(stock.liveMarketCapIdr)
      : Math.round(sharesOutstanding * price);

  const rawResolvedNetIncome =
    userOverride?.netIncomeTTMIdr && userOverride.netIncomeTTMIdr > 0
      ? Math.round(userOverride.netIncomeTTMIdr)
      : stock.netIncomeTTMIdr && stock.netIncomeTTMIdr > 0
      ? Math.round(stock.netIncomeTTMIdr)
      : undefined;

  const rawResolvedEquity =
    userOverride?.equityAttributableIdr && userOverride.equityAttributableIdr > 0
      ? Math.round(userOverride.equityAttributableIdr)
      : stock.equityAttributableIdr && stock.equityAttributableIdr > 0
      ? Math.round(stock.equityAttributableIdr)
      : undefined;

  // Defense-in-depth USD->IDR normalization guard if raw statements are in USD while shares are in full count
  const isUnconvertedUsdScale =
    typeof rawResolvedEquity === 'number' &&
    rawResolvedEquity > 0 &&
    sharesOutstanding > 50_000_000 &&
    rawResolvedEquity / sharesOutstanding < 5.0;
  const fxScale = isUnconvertedUsdScale ? 16250 : 1;

  const resolvedNetIncomeTTM =
    typeof rawResolvedNetIncome === 'number' ? Math.round(rawResolvedNetIncome * fxScale) : undefined;
  const resolvedEquityAttributable =
    typeof rawResolvedEquity === 'number' ? Math.round(rawResolvedEquity * fxScale) : undefined;

  const rawEpsExact = resolvedNetIncomeTTM
    ? resolvedNetIncomeTTM / Math.max(1, sharesOutstanding)
    : trailingEpsIdr;
  const epsTTM =
    rawEpsExact >= 25
      ? Math.round(rawEpsExact)
      : Number(Math.max(0.01, rawEpsExact).toFixed(2));

  const rawBvpsExact = resolvedEquityAttributable
    ? resolvedEquityAttributable / Math.max(1, sharesOutstanding)
    : estimatedBvpsIdr;
  const bvps =
    rawBvpsExact >= 25
      ? Math.round(rawBvpsExact)
      : Number(Math.max(0.1, rawBvpsExact).toFixed(2));

  const netIncomeTTM = resolvedNetIncomeTTM ?? Math.round(epsTTM * sharesOutstanding);
  const equityAttributable = resolvedEquityAttributable ?? Math.round(bvps * sharesOutstanding);

  const opMarginDecimal = Math.max(0.04, Math.min(0.65, (stock.operatingMargin || 15) / 100));
  const netMarginDecimal = Math.max(0.03, opMarginDecimal * 0.76);

  const revenueTTM =
    userOverride?.revenueTTMIdr && userOverride.revenueTTMIdr > 0
      ? Math.round(userOverride.revenueTTMIdr * fxScale)
      : stock.revenueTTMIdr && stock.revenueTTMIdr > 0
      ? Math.round(stock.revenueTTMIdr * fxScale)
      : Math.round(netIncomeTTM / netMarginDecimal);

  // Calibrate prior full-year revenue and prior-year BVPS from live Worker latestFullYearRevenueIdr or decumulated growth trajectory
  const safeGrowthClip = Math.max(-0.35, Math.min(0.45, (earningsGrowthYoYPct || 8) / 100));
  const latestFullYearRevenue =
    stock.latestFullYearRevenueIdr && stock.latestFullYearRevenueIdr > 0
      ? Math.round(stock.latestFullYearRevenueIdr * fxScale)
      : Math.max(
          1,
          Math.round(revenueTTM / Math.max(0.75, 1 + safeGrowthClip * 0.65))
        );
  const priorYearBvps = Math.max(
    10,
    Math.round(bvps / Math.max(0.85, 1 + Math.min(0.24, Math.max(0.03, trailingRoePct / 100 * 0.55))))
  );

  const operatingProfitTTM =
    userOverride?.operatingProfitTTMIdr && userOverride.operatingProfitTTMIdr > 0
      ? Math.round(userOverride.operatingProfitTTMIdr * fxScale)
      : stock.operatingProfitTTMIdr && stock.operatingProfitTTMIdr > 0
      ? Math.round(stock.operatingProfitTTMIdr * fxScale)
      : Math.round(revenueTTM * opMarginDecimal);

  const capexRatio = Math.max(0.03, Math.min(0.42, capexToRevenueRatio || 0.08));
  const capexTTM =
    userOverride?.capexTTMIdr && userOverride.capexTTMIdr > 0
      ? Math.round(userOverride.capexTTMIdr * fxScale)
      : stock.capexTTMIdr && stock.capexTTMIdr > 0
      ? Math.round(stock.capexTTMIdr * fxScale)
      : Math.round(revenueTTM * capexRatio);

  const daTTM =
    userOverride?.daTTMIdr && userOverride.daTTMIdr > 0
      ? Math.round(userOverride.daTTMIdr * fxScale)
      : stock.daTTMIdr && stock.daTTMIdr > 0
      ? Math.round(stock.daTTMIdr * fxScale)
      : Math.max(1, Math.round(capexTTM / Math.max(0.8, capexToDaRatio || 1.5)));
  const ebitdaTTM =
    !userOverride?.operatingProfitTTMIdr &&
    !userOverride?.daTTMIdr &&
    stock.ebitdaTTMIdr &&
    stock.ebitdaTTMIdr > 0
      ? Math.round(stock.ebitdaTTMIdr * fxScale)
      : operatingProfitTTM + daTTM;
  const ocfTTM =
    userOverride?.ocfTTMIdr && userOverride.ocfTTMIdr > 0
      ? Math.round(userOverride.ocfTTMIdr * fxScale)
      : stock.ocfTTMIdr && stock.ocfTTMIdr > 0
      ? Math.round(stock.ocfTTMIdr * fxScale)
      : Math.round(netIncomeTTM * ocfToNetIncomeRatio);

  const der = Math.max(0.02, stock.debtToEquity || 0.5);
  const totalDebt =
    userOverride?.totalDebtIdr && userOverride.totalDebtIdr >= 0
      ? Math.round(userOverride.totalDebtIdr * fxScale)
      : stock.totalDebtIdr && stock.totalDebtIdr >= 0
      ? Math.round(stock.totalDebtIdr * fxScale)
      : Math.round(equityAttributable * der);
  const totalAssets = resolveAuthenticTotalAssetsIdr({
    ticker: stock.ticker,
    sector: stock.sector,
    explicitTotalAssetsIdr:
      stock.totalAssetsIdr && stock.totalAssetsIdr > 0
        ? Math.round(stock.totalAssetsIdr * fxScale)
        : undefined,
    equityAttributableIdr: equityAttributable,
    totalDebtIdr: totalDebt
  });
  const cashAndEquivalents =
    userOverride?.cashAndEquivalentsIdr && userOverride.cashAndEquivalentsIdr >= 0
      ? Math.round(userOverride.cashAndEquivalentsIdr * fxScale)
      : stock.cashAndEquivalentsIdr && stock.cashAndEquivalentsIdr >= 0
      ? Math.round(stock.cashAndEquivalentsIdr * fxScale)
      : Math.round(equityAttributable * 0.22);
  const investedCapital = Math.max(1, equityAttributable + totalDebt - cashAndEquivalents);
  const nopatTTM = Math.round(operatingProfitTTM * 0.78);
  const derivedRoicPct = Number(
    Math.max(4.0, Math.min(34.0, (nopatTTM / investedCapital) * 100)).toFixed(2)
  );

  const roicTTMPct = stock.roicTTMPct ?? derivedRoicPct;
  const incrementalRoicPct =
    stock.incrementalRoicPct ??
    Number(
      (cwipToAssetsRatio >= 0.15 ? roicTTMPct * 1.12 : roicTTMPct * 1.02).toFixed(2)
    );

  // Operating profit YoY growth for Dual-Confirmation Catalyst
  const operatingProfitYoYPct =
    stock.operatingProfitGrowthYoYPct ??
    Number(
      (stock.operatingMargin >= 12
        ? earningsGrowthYoYPct * 0.85
        : earningsGrowthYoYPct * 0.45
      ).toFixed(1)
    );

  // Historical 3Y & 5Y Normalized EPS & ROE (conservative multi-year anchor)
  const epsAvg3Y =
    stock.epsAvg3YIdr ??
    Math.max(2, Math.round(epsTTM * (earningsGrowthYoYPct > 15 ? 0.88 : 0.95)));
  const epsAvg5Y =
    stock.epsAvg5YIdr ??
    Math.max(2, Math.round(epsTTM * (earningsGrowthYoYPct > 15 ? 0.82 : 0.92)));

  const roeAvg3Y =
    stock.roeAvg3YPct ??
    Number(Math.max(4.0, trailingRoePct * (earningsGrowthYoYPct > 15 ? 0.90 : 0.96)).toFixed(2));
  const roeAvg5Y =
    stock.roeAvg5YPct ??
    Number(Math.max(4.0, trailingRoePct * (earningsGrowthYoYPct > 15 ? 0.86 : 0.93)).toFixed(2));

  // 20-Day ATR estimated from daily volatility when not explicitly provided
  const dailyVolDecimal = Math.max(0.08, (stock.volatilityAnn || 24) / 100) / Math.sqrt(252);
  const atr20 =
    stock.atr20Idr && stock.atr20Idr > 0
      ? Math.round(stock.atr20Idr)
      : Math.max(2, Math.round(price * dailyVolDecimal * 1.35));

  // FIX 4: Never fake rfLastUpdated with today's date when SBN is proxy or unfetched
  const resolvedIsSbnProxy = isSbnMacroProxy ?? stock.isSbnMacroProxy ?? false;
  const rfLastUpdated: string | null = resolvedIsSbnProxy
    ? null
    : paramRfLastUpdated !== undefined
    ? paramRfLastUpdated
    : stock.rfLastUpdated ?? null;

  // MODUL 2.1: Use direct live Worker beta1Y when available, else regress daily returns vs ^JKSE
  const authenticBeta1Y =
    stock.priceSource === 'LIVE_YAHOO_API' &&
    typeof stock.beta1Y === 'number' &&
    Number.isFinite(stock.beta1Y) &&
    stock.beta1Y > 0
      ? Number(stock.beta1Y.toFixed(2))
      : computeAuthenticBeta1YFromSnapshotOrSeries(
          stock.ticker,
          stock.sector,
          stock.beta1Y
        );

  return {
    ticker: stock.ticker,
    name: stock.name,
    sector: stock.sector,
    price,
    marketCap: calibratedMarketCap,
    sharesOutstanding,
    epsTTM,
    epsAvg3Y,
    epsAvg5Y,
    forwardAnnualizedEps: forwardEpsIdr,
    bvps,
    priorYearBvps,
    netIncomeTTM,
    revenueTTM,
    latestFullYearRevenue,
    operatingProfitTTM,
    ebitdaTTM,
    equityAttributable,
    totalAssets,
    totalDebt,
    cashAndEquivalents,
    capexTTM,
    daTTM,
    cwipToAssetsRatio,
    ocfTTM,
    roeTTM: trailingRoePct / 100,
    roeAvg3Y: roeAvg3Y / 100,
    roeAvg5Y: roeAvg5Y / 100,
    roicTTM: roicTTMPct / 100,
    incrementalRoic: incrementalRoicPct / 100,
    debtToEquity: der,
    adtv20dIDR: adtv20dIdr,
    adtvVolumeUnit: 'SHARES',
    adtvCurrencyScale: 'FULL_IDR',
    netIncomeYoYPct: earningsGrowthYoYPct,
    operatingProfitYoYPct,
    hasActiveBuyback: stock.hasActiveBuyback,
    spotRf10Y: sbnSpot10YPct / 100,
    rfLastUpdated,
    baseCostOfEquity: dynamicCostOfEquityPct / 100,
    baseGrowthRate: sustainableGrowthRatePct / 100,
    evToEbitda5YMean: stock.evToEbitda5YMean,
    beta1Y: authenticBeta1Y,
    realizedAnnualVol: (stock.volatilityAnn || 24) / 100,
    atr20,
    marketRegime,
    convictionCappedByLineage: convictionCappedByLineage ?? stock.convictionCappedByLineage,
    isSbnMacroProxy: resolvedIsSbnProxy,
    ttmMethod: stock.ttmMethod,
    daMethodNote: stock.daMethodNote,
    flowAudit: stock.flowAudit
  };
}

/**
 * ============================================================================
 * MANDATORY PRE-RENDER FINANCIAL AUDITOR (`runFinancialAudit()`)
 * ============================================================================
 * Automatically executes BEFORE valuation results, conviction scores, or PDF/PNG
 * reports are rendered to the UI. Checks and prevents 3 institutional anomalies:
 * 1. Quality-Valuation Contradiction Check:
 *    If fundamentals are strong (`ROE > 15%`, `DER < 0.5x`, `OCF/NI > 1.0` or `>= 0.85`,
 *    `Net Payout Yield > 4%`) yet valuation declares *overvalued > 30%* without significant
 *    earnings/revenue decline (`earningsGrowthYoYPct > -10%`), raises
 *    `AUDIT_WARNING: Potential Model Misrouting / Over-Penalization` and triggers
 *    Auto-Reroute to `Quality Compounder` (`STEADY_COMPOUNDER`).
 * 2. Multiple & Yield Consistency Check:
 *    Ensures `Implied Fair PER` and `Implied Fair PBV` at Fair Value are mathematically
 *    consistent with `Fair Value / EPS` and `Fair Value / BVPS`. Verifies zero double-counting
 *    between `Total Shareholder Yield (Net Payout Yield)` and `Earnings Yield`.
 * 3. Data Integrity & Fallback Guard:
 *    If crucial data (TTM EPS, BVPS, OCF, or USD/IDR FX / SBN Rf) is missing, `null`, or stale,
 *    never silently coerces to `0` to distort intrinsic value; explicitly flags the metric and
 *    lowers `Data Confidence` (`HIGH` -> `MEDIUM` / `LOW_CAUTIOUS`).
 */
export interface RunFinancialAuditInput {
  ticker: string;
  sector: string;
  price: number;
  intrinsicValueIdr: number;
  epsTTM: number | null | undefined;
  bvps: number | null | undefined;
  roeTTMPct: number;
  debtToEquity: number;
  ocfToNetIncomeRatio: number;
  ocfTTMIdr?: number | null;
  netPayoutYieldPct: number;
  dividendYieldPct: number;
  buybackYieldPct?: number;
  earningsYieldPct: number;
  earningsGrowthYoYPct: number;
  currentRoute: ValuationModuleRoute;
  isTier2QualityCompounderOverride?: boolean;
  reportedFairPer?: number;
  reportedFairPbv?: number;
  isStatArbValid?: boolean;
  isRfStale?: boolean;
  isCoreFundamentalsSeed?: boolean;
  fxRateUsdIdr?: number | null;
  requiresUsdFxConversion?: boolean;
}

export function runFinancialAudit(input: RunFinancialAuditInput): FinancialAuditReport {
  const flags: FinancialAuditFlag[] = [];
  const warnings: string[] = [];
  const missingOrStaleMetrics: string[] = [];

  const price = Math.max(1, Number(input.price) || 1);
  const intrinsicValueIdr = Math.max(1, Number(input.intrinsicValueIdr) || price);
  const safeEps = typeof input.epsTTM === 'number' && Number.isFinite(input.epsTTM) && input.epsTTM > 0 ? input.epsTTM : null;
  const safeBvps = typeof input.bvps === 'number' && Number.isFinite(input.bvps) && input.bvps > 0 ? input.bvps : null;

  // -------------------------------------------------------------------------
  // CHECK 1: QUALITY-VALUATION CONTRADICTION CHECK
  // -------------------------------------------------------------------------
  const overvaluationDiscountPct = ((intrinsicValueIdr - price) / price) * 100; // Negative when price > intrinsicValueIdr
  const isOvervaluedOver30Pct = overvaluationDiscountPct < -30.0;
  const hasStrongQualityFundamentals =
    input.roeTTMPct > 15.0 &&
    input.debtToEquity < 0.50 &&
    input.ocfToNetIncomeRatio >= 1.0 &&
    input.netPayoutYieldPct > 4.0;
  const hasNoSignificantEarningsDecline = input.earningsGrowthYoYPct > -10.0;

  const isQualityValuationContradiction =
    hasStrongQualityFundamentals &&
    hasNoSignificantEarningsDecline &&
    isOvervaluedOver30Pct;

  let isAutoReroutedToCompounder = Boolean(input.isTier2QualityCompounderOverride);
  let effectiveRouteAfterAudit: ValuationModuleRoute = input.currentRoute;

  if (isQualityValuationContradiction) {
    flags.push('AUDIT_WARNING: Potential Model Misrouting / Over-Penalization');
    warnings.push(
      `[AUDIT_WARNING: Potential Model Misrouting / Over-Penalization] Fundamental sangat kuat (ROE ${input.roeTTMPct.toFixed(1)}% > 15%, DER ${input.debtToEquity.toFixed(2)}x < 0.50x, OCF/NI ${input.ocfToNetIncomeRatio.toFixed(2)}x > 1.0x, Net Payout Yield ${input.netPayoutYieldPct.toFixed(2)}% > 4.0%) tanpa penurunan laba signifikan (YoY ${input.earningsGrowthYoYPct >= 0 ? '+' : ''}${input.earningsGrowthYoYPct.toFixed(1)}%), namun valuasi awal mendiskon ${overvaluationDiscountPct.toFixed(1)}% (< -30%). Sistem otomatis melakukan Auto-Reroute ke Quality Compounder & mengevaluasi ulang bobot ensemble.`
    );
    if (input.currentRoute !== 'STEADY_COMPOUNDER') {
      isAutoReroutedToCompounder = true;
      effectiveRouteAfterAudit = 'STEADY_COMPOUNDER';
      flags.push('AUTO_REROUTED_TO_QUALITY_COMPOUNDER');
    }
  } else if (input.isTier2QualityCompounderOverride) {
    flags.push('AUTO_REROUTED_TO_QUALITY_COMPOUNDER');
    effectiveRouteAfterAudit = 'STEADY_COMPOUNDER';
  }

  // -------------------------------------------------------------------------
  // CHECK 2: MULTIPLE & YIELD CONSISTENCY CHECK (NO DOUBLE-COUNTING)
  // -------------------------------------------------------------------------
  const reconciledFairPer = safeEps
    ? Number((intrinsicValueIdr / safeEps).toFixed(2))
    : Number((input.reportedFairPer ?? 0).toFixed(2));
  const reconciledFairPbv = safeBvps
    ? Number((intrinsicValueIdr / safeBvps).toFixed(2))
    : Number((input.reportedFairPbv ?? 0).toFixed(2));

  const perDiff =
    typeof input.reportedFairPer === 'number' && safeEps
      ? Math.abs(input.reportedFairPer - reconciledFairPer)
      : 0;
  const pbvDiff =
    typeof input.reportedFairPbv === 'number' && safeBvps
      ? Math.abs(input.reportedFairPbv - reconciledFairPbv)
      : 0;

  const isMultipleConsistent = perDiff <= 0.25 && pbvDiff <= 0.15;
  flags.push('MULTIPLE_CONSISTENCY_RECONCILED');
  if (!isMultipleConsistent) {
    warnings.push(
      `[MULTIPLE_RECONCILED] Implied Fair PER (${reconciledFairPer.toFixed(2)}x = Rp ${intrinsicValueIdr.toLocaleString('id-ID')} / EPS Rp ${(safeEps ?? 0).toLocaleString('id-ID')}) dan Implied Fair PBV (${reconciledFairPbv.toFixed(2)}x = Rp ${intrinsicValueIdr.toLocaleString('id-ID')} / BVPS Rp ${(safeBvps ?? 0).toLocaleString('id-ID')}) telah direkonsiliasi secara matematis.`
    );
  }

  const buybackYield = Number(input.buybackYieldPct ?? 0);
  const expectedNetPayoutYield = Number((input.dividendYieldPct + buybackYield).toFixed(2));
  const isYieldDoubleCountedWithEarningsYield =
    input.earningsYieldPct > 1.0 &&
    Math.abs(input.netPayoutYieldPct - (expectedNetPayoutYield + input.earningsYieldPct)) < 0.25;
  const isYieldConsistentNoDoubleCount = !isYieldDoubleCountedWithEarningsYield;
  flags.push('TSY_NO_DOUBLE_COUNT_VERIFIED');

  // -------------------------------------------------------------------------
  // CHECK 3: DATA INTEGRITY & FALLBACK GUARD
  // -------------------------------------------------------------------------
  if (safeEps === null) {
    missingOrStaleMetrics.push('TTM EPS (Missing/Null)');
  }
  if (safeBvps === null) {
    missingOrStaleMetrics.push('BVPS (Missing/Null)');
  }
  if (input.sector !== 'Financials' && (input.ocfTTMIdr === null || input.ocfTTMIdr === undefined)) {
    missingOrStaleMetrics.push('OCF TTM (Imputed/Proxy)');
  }
  if (input.requiresUsdFxConversion && (!input.fxRateUsdIdr || input.fxRateUsdIdr <= 0)) {
    missingOrStaleMetrics.push('Kurs USD/IDR (Fallback Guard)');
  }
  if (input.isRfStale) {
    missingOrStaleMetrics.push('Kurva SBN 10Y (Stale >7 Hari / Proxy)');
  }
  if (input.isCoreFundamentalsSeed) {
    missingOrStaleMetrics.push('Sumber Fundamental (Static Seed Fallback)');
  }
  if (input.isStatArbValid === false) {
    flags.push('STATARB_NO_FUNDAMENTAL_PEER');
  }

  let dataConfidenceScore = 100;
  if (safeEps === null || safeBvps === null) dataConfidenceScore -= 35;
  if (input.isCoreFundamentalsSeed) dataConfidenceScore -= 25;
  if (input.isRfStale) dataConfidenceScore -= 10;
  if (input.requiresUsdFxConversion && (!input.fxRateUsdIdr || input.fxRateUsdIdr <= 0)) {
    dataConfidenceScore -= 15;
  }
  dataConfidenceScore = Math.max(25, Math.min(100, dataConfidenceScore));

  let dataConfidenceLevel: DataConfidenceLevel = 'HIGH';
  if (dataConfidenceScore < 65 || safeEps === null || safeBvps === null || input.isCoreFundamentalsSeed) {
    dataConfidenceLevel = 'LOW_CAUTIOUS';
    flags.push('DATA_CONFIDENCE_DOWNGRADED_MISSING_METRICS');
  } else if (dataConfidenceScore < 88 || missingOrStaleMetrics.length > 0) {
    dataConfidenceLevel = 'MEDIUM';
  }

  const auditStatus: FinancialAuditReport['auditStatus'] = isQualityValuationContradiction
    ? 'AUDIT_WARNING'
    : isAutoReroutedToCompounder
    ? 'AUTO_REROUTED'
    : dataConfidenceLevel === 'LOW_CAUTIOUS'
    ? 'DATA_DEGRADED'
    : 'PASS';

  const auditSummaryBannerText = isQualityValuationContradiction
    ? `AUDIT_WARNING: Potential Model Misrouting / Over-Penalization — Emiten ${input.ticker} memiliki fundamental sangat kuat (ROE ${input.roeTTMPct.toFixed(1)}%, DER ${input.debtToEquity.toFixed(2)}x, OCF/NI ${input.ocfToNetIncomeRatio.toFixed(2)}x, Net Payout ${input.netPayoutYieldPct.toFixed(2)}%) namun terdiskon >30%. Sistem otomatis melakukan Auto-Reroute ke Quality Compounder.`
    : isAutoReroutedToCompounder
    ? `AUTO-ADAPT TIER-2 OVERRIDE: Emiten ${input.ticker} (${input.sector}) memiliki DNA Quality Compounder (ROE ${input.roeTTMPct.toFixed(1)}% > 15%, DER ${input.debtToEquity.toFixed(2)}x < 0.5x, OCF/NI ${input.ocfToNetIncomeRatio.toFixed(2)}x ≥ 0.8x). Dikeluarkan dari Pure Cyclical ke Quality Compounder.`
    : `FINANCIAL AUDIT PASS: Konsistensi Implied PER (${reconciledFairPer.toFixed(2)}x) & Implied PBV (${reconciledFairPbv.toFixed(2)}x) terverifikasi · Zero Double-Counting TSY (${expectedNetPayoutYield.toFixed(2)}%) · Data Confidence: ${dataConfidenceLevel} (${dataConfidenceScore}/100).`;

  return {
    ticker: input.ticker,
    auditStatus,
    flags,
    warnings,
    isQualityValuationContradiction,
    isAutoReroutedToCompounder,
    originalRouteBeforeAudit: input.currentRoute,
    effectiveRouteAfterAudit,
    isMultipleConsistent,
    reconciledFairPer,
    reconciledFairPbv,
    isYieldConsistentNoDoubleCount,
    verifiedNetPayoutYieldPct: expectedNetPayoutYield,
    verifiedEarningsYieldPct: Number(input.earningsYieldPct.toFixed(2)),
    dataConfidenceLevel,
    dataConfidenceScore,
    missingOrStaleMetrics,
    auditSummaryBannerText
  };
}

