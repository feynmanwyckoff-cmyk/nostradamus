import {
  EnsembleComponent,
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
  const yfSym = `${cleanTicker}.JK`;
  const snapData = (
    embeddedSnapshot as unknown as {
      data?: Record<string, { closes?: number[]; timestamps?: number[] }>;
    }
  )?.data;

  const stockEntry = snapData?.[yfSym];
  const jkseEntry = snapData?.['^JKSE'];
  const stockCloses = (stockEntry?.closes ?? []).filter((c) => Number.isFinite(c) && c > 0);
  const jkseCloses = (jkseEntry?.closes ?? []).filter((c) => Number.isFinite(c) && c > 0);

  if (stockCloses.length >= 15 && jkseCloses.length >= 15) {
    const sRet: number[] = [];
    for (let i = 1; i < stockCloses.length; i++) {
      sRet.push((stockCloses[i] - stockCloses[i - 1]) / stockCloses[i - 1]);
    }
    const mRet: number[] = [];
    for (let i = 1; i < jkseCloses.length; i++) {
      mRet.push((jkseCloses[i] - jkseCloses[i - 1]) / jkseCloses[i - 1]);
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
          return Number(Math.max(0.42, Math.min(2.25, vasicekBeta)).toFixed(2));
        }
      }
    }
  }

  return Number(resolveSectorBetaFallback(sector).toFixed(2));
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

  // Bound growth g in Graham formula to conservative [0%, 6.0%]
  const safeG = Math.max(0, Math.min(6.0, toPercentValue(params.growthRate, 4.5)));
  const safeSbn10YPct = Math.max(5.0, Math.min(10.5, toPercentValue(params.spotRf10Y, 6.75)));

  const rawFormula = (normalizedBasisEps * (8.5 + 2 * safeG) * 4.4) / safeSbn10YPct;

  // Moat Haircut: Normalized ROE < 15% OR DER > 1.0x -> 25% haircut (x0.75)
  const isLowRoe = normalizedBasisRoePct < 15.0;
  const isHighDer = params.debtToEquity > 1.0;
  const isMoatHaircutApplied = isLowRoe || isHighDer;
  const moatHaircutMultiplier = isMoatHaircutApplied ? 0.75 : 1.0;

  const rawStandaloneFloor = tickRounder(Math.max(50, rawFormula * moatHaircutMultiplier));

  // Enforce Hard Invariant: standaloneFloor <= ensembleFairValue
  const safeEnsemble = Math.max(50, Number(params.ensembleFairValue) || rawStandaloneFloor);
  let standaloneFloor = rawStandaloneFloor;
  let isFloorClamped = false;
  let floorClampDiagnosticLog: string | undefined;

  if (rawStandaloneFloor > safeEnsemble) {
    isFloorClamped = true;
    standaloneFloor = tickRounder(Math.max(50, Math.min(rawStandaloneFloor, safeEnsemble * 0.90)));
    floorClampDiagnosticLog = `[FLOOR_INVARIANT_CLAMPED] Raw Graham-Joeliardi Floor (Rp ${rawStandaloneFloor.toLocaleString(
      'id-ID'
    )}) melampaui Ensemble Fair Value (Rp ${safeEnsemble.toLocaleString(
      'id-ID'
    )}). Di-clamp ke 90% Ensemble (Rp ${standaloneFloor.toLocaleString(
      'id-ID'
    )}) untuk menjaga invarian standaloneFloor ≤ ensembleFairValue.`;
  }

  const haircutReasons: string[] = [];
  if (isLowRoe) haircutReasons.push(`Norm ROE ${normalizedBasisRoePct.toFixed(1)}% < 15%`);
  if (isHighDer) haircutReasons.push(`DER ${params.debtToEquity.toFixed(2)}x > 1,0x`);

  const moatHaircutReason = isMoatHaircutApplied
    ? `Weak Moat Penalty -25% (×0,75 karena ${haircutReasons.join(' & ')})`
    : 'Moat Historis Kuat (Norm ROE ≥ 15% & DER ≤ 1,0x)';

  const formulaAudit = `(Norm EPS min(TTM,Avg3Y) Rp ${normalizedBasisEps.toLocaleString(
    'id-ID'
  )} × (8,5 + 2×${safeG.toFixed(1)}) × 4,4 ÷ SBN10Y ${safeSbn10YPct.toFixed(2)}%)${
    isMoatHaircutApplied ? ' × 0,75' : ''
  }${
    isFloorClamped
      ? ` → Clamped 90% Ensemble (Rp ${standaloneFloor.toLocaleString('id-ID')})`
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
    correlation = 0.82,
    betaRatio = 1.0,
    zScore,
    spread30DPct,
    spread1DPct = 0,
    impliedPairTargetIDR,
    statArbSignal,
    rationale
  } = params;

  let action: TacticalOverlay['action'] = 'HOLD_COINTEGRATED_EQUILIBRIUM';
  let actionLabel = 'Ekuilibrium Kointegrasi (Netral — Ikuti Harga Intrinsik)';

  if (statArbSignal === 'MEAN_REVERSION_BUY' || zScore <= -1.25) {
    action = 'TACTICAL_ENTRY_FAVORABLE';
    actionLabel = `Entry Timing Favorable: Laggard vs ${pairTicker} (Z=${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ)`;
  } else if (statArbSignal === 'PAIR_OVEREXTENDED_TRIM' || zScore >= 1.35) {
    action = 'ROTATE_TO_PAIR_WARNING';
    actionLabel = `Saran Rotasi Pasangan / Tunda Kejar Harga vs ${pairTicker} (Z=+${zScore.toFixed(2)}σ)`;
  } else if (statArbSignal === 'FUNDAMENTAL_DIVERGENCE' || correlation < 0.70) {
    action = 'FUNDAMENTAL_DIVERGENCE_WAIT';
    actionLabel = `Kointegrasi Lemah (ρ=${correlation.toFixed(2)}) — Abaikan Pair Trade`;
  }

  return {
    pairTicker: pairTicker || 'IDX-PEER',
    pairName,
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
 * P2.3: EPISTEMIC UNCERTAINTY PENALTY (MODEL DISPERSION PENALTY)
 * ============================================================================
 * - Calculates dispersion across intrinsic valuation methods:
 *   `modelDispersion = (maxVal - minVal) / medianVal`
 * - If `modelDispersion > 0.40` (or `isOutlierEnsembleActive === true`),
 *   automatically deducts 10–15 points from `convictionScore`, restricts
 *   initial position sizing (Tranche 1), and logs the penalty reason.
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
  dispersionPenaltyPts: number;   // 10 - 15 points when triggered, else 0
  adjustedConvictionScore: number;
  tranche1ScalingFactor: number;  // 0.35 (35% of max allocation) when penalized, else 0.55
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
      adjustedConvictionScore: input.rawConvictionScore,
      tranche1ScalingFactor: 0.60
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
  const isDispersionPenalized =
    modelDispersion > 0.40 || Boolean(input.isOutlierEnsembleActive);

  let dispersionPenaltyPts = 0;
  let penaltyReason: string | undefined;

  if (isDispersionPenalized) {
    // Scale penalty between 10 and 15 points based on dispersion excess above 0.40
    const excessRatio = Math.max(0, modelDispersion - 0.40);
    dispersionPenaltyPts = Math.min(15, Math.max(10, Math.round(10 + excessRatio * 12.5)));
    penaltyReason = `[EPISTEMIC_DISPERSION_PENALTY] Dispersi antar-model valuasi intrinsik sebesar ${(
      modelDispersion * 100
    ).toFixed(1)}% (> ambang 40,0%; Rentang Rp ${Math.round(minVal).toLocaleString(
      'id-ID'
    )} – Rp ${Math.round(maxVal).toLocaleString('id-ID')}, Median Rp ${Math.round(
      medianVal
    ).toLocaleString('id-ID')}). Skor konviksi dipotong otomatis -${dispersionPenaltyPts} poin dan porsi masuk awal (Tranche 1) dibatasi maksimal 35% dari plafon posisi.`;
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
    adjustedConvictionScore,
    tranche1ScalingFactor: isDispersionPenalized ? 0.35 : 0.60,
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
    isNonOpCatalystRejected
  } = params;

  if (convictionGrade === 'D (AVOID / HSC)') {
    return {
      primaryActionLabel: 'HINDARI / JANGAN AKUMULASI (HARD BLOCK HSC)',
      holdingFactorsExplanation: 'Terdeteksi risiko tata kelola / konsentrasi kepemilikan ekstrem KSEI (High Shareholder Concentration).',
      narrativeExecutionSentence: 'HINDARI / JANGAN AKUMULASI (HARD BLOCK HSC) — terdeteksi risiko konsentrasi kepemilikan ekstrem KSEI.'
    };
  }

  if (convictionGrade === 'DATA_AUDIT_REQUIRED' || sanityStatus === 'FAIL') {
    return {
      primaryActionLabel: 'TUNDA EKSEKUSI — WAJIB AUDIT DATA FUNDAMENTAL',
      holdingFactorsExplanation: 'Ditemukan anomali rekonsiliasi data fundamental (CRITICAL_DATA_MISMATCH / YTD_CUMULATIVE_SUM_SUSPECT).',
      narrativeExecutionSentence: 'TUNDA EKSEKUSI — WAJIB AUDIT DATA FUNDAMENTAL sebelum alokasi modal.'
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
        'SPECULATIVE WATCHLIST / TUNGGU AUDIT DATA — tahan alokasi modal baru hingga kualitas fundamental dan diskon valuasi terkonfirmasi.'
    };
  }

  if (convictionGrade === 'B (WATCHLIST / HOLD)' || (score >= 65 && score < 75)) {
    const factors: string[] = [];
    if (isWeakMoat) factors.push('Weak Moat Penalty (ROE/ROIC di bawah Cost of Equity)');
    if (isHscPenaltyActive) factors.push('HSC Concentration Penalty');
    if (isDispersionPenalized) factors.push('Epistemic Dispersion (>40% antar-model valuasi)');
    if (isNonOpCatalystRejected) factors.push('Guardrail Kualitas Laba (Katalis Non-Operasional Ditolak)');
    if (factors.length === 0) {
      factors.push('Skor konviksi berada di pita transisi 65-74/100 atau Margin of Safety moderat');
    }
    const factorStr = factors.join(', ');
    return {
      primaryActionLabel: 'WATCHLIST / HOLD — TUNGGU KONFIRMASI SKOR ATAU DISKON LEBIH DALAM',
      holdingFactorsExplanation: `Faktor penahan utama: ${factorStr}.`,
      narrativeExecutionSentence: `WATCHLIST / HOLD — TUNGGU KONFIRMASI SKOR ATAU DISKON LEBIH DALAM (Faktor penahan: ${factorStr}).`
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
      narrativeExecutionSentence: 'AKUMULASI SELEKTIF DI ZONA DISKON melalui pembagian Tranche 1 (60%) dan Tranche 2 (40%).'
    };
  }

  return {
    primaryActionLabel: 'LAYAK AKUMULASI BERTAHAP (CORE CONVICTION)',
    holdingFactorsExplanation: 'Kualitas bisnis, neraca, dan Margin of Safety memenuhi standar tertinggi Core Conviction (Skor Min. 80/100).',
    narrativeExecutionSentence: 'LAYAK AKUMULASI BERTAHAP (CORE CONVICTION) dengan disiplin pembagian Tranche 1 (60%) dan Tranche 2 (40%).'
  };
}

/**
 * ============================================================================
 * P2.1 & P2.2: VOLATILITY-TARGETED BARBELL SIZING & ATR / TRANCHE STOP LOSS
 * ============================================================================
 * 1. Volatility-Targeted Barbell Sizing (Overcoming 1/Beta Blindness):
 *    - `finalMaxAllocation = Math.min(inverseBetaCap, inverseVolatilityCap, regimeCap)`
 *    - Volatility Scalar: If `realizedAnnualVol > 35%` OR IHSG market regime === `'VOLATIL'`,
 *      slashes maximum allocation ceiling into the **8%–12%** band (never allowing 18% even if Beta is low).
 * 2. ATR / Volatility-Calibrated Stop Loss & Dual Core Conviction Mode:
 *    - `stopDistance = Math.max(2.5 * ATR_20, price * 1.5 * (realizedAnnualVol / Math.sqrt(12)))`
 *      bounded within reasonable [12%, 18%] below entry price.
 *    - Displays both ATR/Vol Calibrated Stop AND `Tranche Entry + Fundamental Invalidation Stop`
 *      for Core Conviction candidates.
 */
export interface VolatilitySizingAndStopInput {
  price: number;
  beta1Y: number;
  realizedAnnualVol: number;      // Decimal (e.g. 0.38) or percentage (38.0)
  atr20: number;                  // 20-Day ATR in IDR
  marketRegime: MarketRegimeStatus;
  rawConvictionScore: number;
  dispersionPenalty: DispersionPenaltyOutput;
  sanityReport: SanityReport;
  isHscFlagged?: boolean;
  effectiveCostOfEquity?: number; // Decimal
  debtToEquity?: number;
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

  // 2. Inverse Volatility Cap (Volatility Scalar):
  // If realizedAnnualVol > 35% (0.35), cap max allocation strictly within 8.0% - 12.0%
  const isHighStockVol = realizedVolDecimal > 0.35;
  let inverseVolatilityCapPct = 18.0;
  if (isHighStockVol) {
    // Linearly scale from 12.0% at 35% vol down to 8.0% at >=60% vol
    const volExcess = Math.min(0.25, realizedVolDecimal - 0.35);
    inverseVolatilityCapPct = Number((12.0 - (volExcess / 0.25) * 4.0).toFixed(2));
  } else {
    // Below 35% vol: scale smoothly between 12.5% and 18.0%
    inverseVolatilityCapPct = Number(
      Math.max(12.5, Math.min(18.0, (0.22 / realizedVolDecimal) * 14.5)).toFixed(2)
    );
  }

  // 3. Market Regime Cap:
  // If IHSG market regime is VOLATIL, cap max allocation strictly within 8.0% - 12.0% (e.g. 10.0%)
  const isVolatileRegime = input.marketRegime === 'VOLATIL';
  const regimeCapPct = isVolatileRegime
    ? realizedVolDecimal > 0.35
      ? 8.5
      : 10.5
    : input.marketRegime === 'WASPADA'
    ? 14.0
    : 18.0;

  const isVolatilityScalarTriggered = isHighStockVol || isVolatileRegime;

  // Final Barbell Position Ceiling: Math.min(inverseBetaCap, inverseVolatilityCap, regimeCap)
  let finalMaxAllocationPct = Number(
    Math.min(inverseBetaCapPct, inverseVolatilityCapPct, regimeCapPct).toFixed(2)
  );

  // Enforce strict 8% - 12% upper ceiling guarantee whenever Volatility Scalar is triggered
  if (isVolatilityScalarTriggered) {
    finalMaxAllocationPct = Number(
      Math.max(8.0, Math.min(12.0, finalMaxAllocationPct)).toFixed(2)
    );
  }

  // Tranche Sizing (Tranche 1 restricted if Epistemic Dispersion Penalty > 0.40 is active)
  const t1Factor = input.dispersionPenalty.tranche1ScalingFactor;
  const tranche1AllocationPct = Number((finalMaxAllocationPct * t1Factor).toFixed(2));
  const tranche2AllocationPct = Number(
    Math.max(0, finalMaxAllocationPct - tranche1AllocationPct).toFixed(2)
  );

  // -------------------------------------------------------------------------
  // ATR / VOLATILITY-CALIBRATED STOP LOSS (BOUNDED 12% - 18% BELOW ENTRY)
  // Formula: stopDistance = Math.max(2.5 * ATR_20, price * 1.5 * (realizedAnnualVol / Math.sqrt(12)))
  // -------------------------------------------------------------------------
  const atrMultipleStopDistanceIDR = 2.5 * atr20IDR;
  const volMonthlyStopDistanceIDR = price * 1.5 * (realizedVolDecimal / Math.sqrt(12));
  const rawStopDistanceIDR = Math.max(atrMultipleStopDistanceIDR, volMonthlyStopDistanceIDR);

  const minAllowedStopIDR = price * 0.12; // 12.0% minimum distance to avoid daily noise whipsaw
  const maxAllowedStopIDR = price * 0.18; // 18.0% maximum hard capital protection bound
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

  const stopLossMode: RiskSizingResult['stopLossMode'] = isCoreOrSolidGrade
    ? 'DUAL_CORE_CONVICTION_TRANCHE_AND_ATR'
    : 'ATR_VOL_CALIBRATED';

  const kePctLabel = ((input.effectiveCostOfEquity ?? 0.115) * 100).toFixed(2);
  const fundamentalInvalidationStopTriggers: string[] = [
    `Invalidasi ROIC/ROE: ROIC TTM atau ROE TTM turun di bawah Effective Cost of Equity (Ke ${kePctLabel}%) selama 2 kuartal berturut-turut.`,
    `Invalidasi Neraca & Kas: Rasio OCF/NI jatuh di bawah ambang batas sehat atau Net DER melompat > 1,20x tanpa ekspansi aset produktif.`,
    `Invalidasi Integritas Data: Status SANITY_CHECK berubah menjadi FAIL (CRITICAL_DATA_MISMATCH / YTD_CUMULATIVE_SUM_SUSPECT) atau muncul indikasi distribusi tidak wajar KSEI.`
  ];

  const trancheExecutionGuide = `Tranche 1 (Inisiasi ${input.dispersionPenalty.isDispersionPenalized ? '35%' : '60%'}): ${tranche1AllocationPct.toFixed(
    2
  )}% ekuitas${
    input.dispersionPenalty.isDispersionPenalized ? ' [Dibatasi Penalti Dispersi >40%]' : ''
  } · Tranche 2 (Konfirmasi Laba/Support ${input.dispersionPenalty.isDispersionPenalized ? '65%' : '40%'}): +${tranche2AllocationPct.toFixed(
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
