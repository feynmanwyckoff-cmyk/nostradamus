import { StockMetrics } from '../types/quant';

/**
 * Calibrated Multi-Year Long-Term Debt Deleveraging Registry (IDR Billions)
 * Used when explicit prior-year vs current-year long-term debt balance sheet lines are not overridden.
 * Positive delta (PrevYear > CurrYear) indicates genuine balance-sheet deleveraging.
 * Negative delta (PrevYear < CurrYear) indicates productive CapEx expansion (clamped to 0% penalty).
 */
export const CALIBRATED_LONG_TERM_DEBT_B_IDR_MAP: Record<
  string,
  { prevYearDebtBillionIdr: number; currYearDebtBillionIdr: number }
> = {
  ADRO: { prevYearDebtBillionIdr: 22400, currYearDebtBillionIdr: 18900 },
  ITMG: { prevYearDebtBillionIdr: 1200, currYearDebtBillionIdr: 450 },
  PTBA: { prevYearDebtBillionIdr: 3400, currYearDebtBillionIdr: 2650 },
  PGAS: { prevYearDebtBillionIdr: 42500, currYearDebtBillionIdr: 36800 },
  MEDC: { prevYearDebtBillionIdr: 51200, currYearDebtBillionIdr: 46900 },
  UNTR: { prevYearDebtBillionIdr: 16800, currYearDebtBillionIdr: 14200 },
  ASII: { prevYearDebtBillionIdr: 89500, currYearDebtBillionIdr: 84200 },
  ICBP: { prevYearDebtBillionIdr: 48600, currYearDebtBillionIdr: 44800 },
  INDF: { prevYearDebtBillionIdr: 64200, currYearDebtBillionIdr: 59500 },
  MYOR: { prevYearDebtBillionIdr: 5400, currYearDebtBillionIdr: 4650 },
  TLKM: { prevYearDebtBillionIdr: 68400, currYearDebtBillionIdr: 65200 },
  ISAT: { prevYearDebtBillionIdr: 49800, currYearDebtBillionIdr: 46100 },
  EXCL: { prevYearDebtBillionIdr: 41200, currYearDebtBillionIdr: 39400 },
  TOWR: { prevYearDebtBillionIdr: 44500, currYearDebtBillionIdr: 42900 },
  TBIG: { prevYearDebtBillionIdr: 28900, currYearDebtBillionIdr: 27800 },
  CTRA: { prevYearDebtBillionIdr: 9200, currYearDebtBillionIdr: 7950 },
  BSDE: { prevYearDebtBillionIdr: 12400, currYearDebtBillionIdr: 10800 },
  PWON: { prevYearDebtBillionIdr: 6500, currYearDebtBillionIdr: 5600 },
  TAPG: { prevYearDebtBillionIdr: 1850, currYearDebtBillionIdr: 1150 },
  LSIP: { prevYearDebtBillionIdr: 120, currYearDebtBillionIdr: 80 },
  KLBF: { prevYearDebtBillionIdr: 1450, currYearDebtBillionIdr: 980 },
  SIDO: { prevYearDebtBillionIdr: 90, currYearDebtBillionIdr: 60 },
  PRDA: { prevYearDebtBillionIdr: 240, currYearDebtBillionIdr: 150 },
  MAPI: { prevYearDebtBillionIdr: 6800, currYearDebtBillionIdr: 6100 },
  JPFA: { prevYearDebtBillionIdr: 11800, currYearDebtBillionIdr: 10600 },
  CPIN: { prevYearDebtBillionIdr: 9400, currYearDebtBillionIdr: 8700 },
  SMGR: { prevYearDebtBillionIdr: 17500, currYearDebtBillionIdr: 14900 },
  INTP: { prevYearDebtBillionIdr: 1600, currYearDebtBillionIdr: 1250 },
  INKP: { prevYearDebtBillionIdr: 56000, currYearDebtBillionIdr: 53400 },
  TKIM: { prevYearDebtBillionIdr: 19200, currYearDebtBillionIdr: 17800 },
  // Productive CapEx Aggressors expanding smelters / facilities (CurrYear > PrevYear -> Clamped to 0% Debt Paydown)
  ADMR: { prevYearDebtBillionIdr: 6200, currYearDebtBillionIdr: 9800 },
  AMMN: { prevYearDebtBillionIdr: 44000, currYearDebtBillionIdr: 56500 },
  MDKA: { prevYearDebtBillionIdr: 24500, currYearDebtBillionIdr: 29200 },
  NCKL: { prevYearDebtBillionIdr: 11200, currYearDebtBillionIdr: 14600 },
  INCO: { prevYearDebtBillionIdr: 2800, currYearDebtBillionIdr: 5400 },
  MBMA: { prevYearDebtBillionIdr: 5800, currYearDebtBillionIdr: 8900 },
  HEAL: { prevYearDebtBillionIdr: 3600, currYearDebtBillionIdr: 4450 }
};

export interface DividendOutlierSanitizationResult {
  effectiveDividendYieldPct: number;
  trailingTtmYieldPct: number;
  projectedForwardYieldPct: number;
  yieldDivergenceSpreadPct: number;
  isDividendOutlierSanitized: boolean;
  sanitizationReason?: string;
}

/**
 * 1. FILTER ANOMALI DIVIDEN (Outlier Sanitization)
 * Detects one-off special dividends or cyclical peak payouts.
 * If Trailing Dividend Yield (TTM) diverges sharply (> 5.0% absolute spread) from projected Forward Yield
 * based on normal Dividend Payout Ratio (DPR), forces the system to use Forward Yield to prevent dividend traps.
 */
export function sanitizeDividendYieldOutlier(params: {
  trailingTtmYieldPct: number;
  projectedForwardYieldPct: number;
  normalDprPct: number;
  outlierSpreadThresholdPct?: number;
}): DividendOutlierSanitizationResult {
  const {
    trailingTtmYieldPct,
    projectedForwardYieldPct,
    normalDprPct,
    outlierSpreadThresholdPct = 5.0
  } = params;

  const cleanTtm = Math.max(0, Number(trailingTtmYieldPct) || 0);
  const cleanForward = Math.max(0, Number(projectedForwardYieldPct) || 0);
  const yieldDivergenceSpreadPct = Number(Math.abs(cleanTtm - cleanForward).toFixed(2));

  // Trigger sanitization when TTM yield diverges > 5.0% from normalized DPR forward yield
  const isDividendOutlierSanitized =
    cleanTtm > 0 && yieldDivergenceSpreadPct > outlierSpreadThresholdPct;

  const effectiveDividendYieldPct = isDividendOutlierSanitized
    ? cleanForward
    : cleanForward > 0
    ? cleanForward
    : cleanTtm;

  const sanitizationReason = isDividendOutlierSanitized
    ? `Anomali Dividen Spesial Terdeteksi: TTM Yield (${cleanTtm.toFixed(2)}%) berselisih ${yieldDivergenceSpreadPct.toFixed(2)}% (> ${outlierSpreadThresholdPct.toFixed(1)}%) terhadap Forward Yield berbasis DPR normal (${normalDprPct.toFixed(0)}% → ${cleanForward.toFixed(2)}%). Sistem memaksa penggunaan Forward Yield (${cleanForward.toFixed(2)}%) guna mencegah Dividend Trap.`
    : undefined;

  return {
    effectiveDividendYieldPct: Number(effectiveDividendYieldPct.toFixed(2)),
    trailingTtmYieldPct: Number(cleanTtm.toFixed(2)),
    projectedForwardYieldPct: Number(cleanForward.toFixed(2)),
    yieldDivergenceSpreadPct,
    isDividendOutlierSanitized,
    sanitizationReason
  };
}

export interface HybridShareholderYieldResult {
  forwardDividendYieldPct: number;
  dynamicBuybackYieldPct: number;
  netPayoutYieldPct: number;          // Strictly (Forward Dividend Yield + Buyback Yield)
  netDebtPaydownIdr: number;          // Max(0, LongTermDebt_PrevYear - LongTermDebt_CurrYear)
  netDebtPaydownYieldPct: number;     // 0% for Financials or when expanding debt; >0% for deleveraging non-Financials
  totalShareholderYieldPct: number;   // Hybrid TSY: Net Payout Yield + Sector-Filtered Net Debt Paydown Yield
  isDividendOutlierSanitized: boolean;
  sanitizationReason?: string;
  nomenclatureLabel: 'Net Payout Yield' | 'Total Shareholder Yield (TSY)';
}

/**
 * 2. NORMALISASI TOTAL SHAREHOLDER YIELD (TSY) & ATURAN HIBRIDA SEKTORAL
 * Strictly prevents double-counting between Earnings Yield (EPS) and Dividend Yield:
 * - Buyback Yield = (Nominal Rupiah Buyback / Live Market Cap Aktual) * 100%
 * - Net Payout Yield = Forward Dividend Yield + Buyback Yield
 * - Sectoral Hybrid Filter for Total Shareholder Yield (TSY):
 *   * if (sector === 'Financials'): TSY = Forward Dividend Yield + Buyback Yield (ignores customer deposit/debt noise)
 *   * if (sector !== 'Financials'): Net Debt Paydown = (LongTermDebt_PrevYear - LongTermDebt_CurrYear).
 *     If positive, adds (Net Debt Paydown / Market Cap) * 100% to TSY.
 *     If negative (company adding debt for productive growth), locks at 0 (Zero) so growth issuers are never penalized.
 */
export function calculateHybridShareholderYield(params: {
  stock: StockMetrics;
  projectedForwardDividendYieldPct: number;
  normalDprPct: number;
  buybackNominalIdr: number;
  liveMarketCapIdr: number;
}): HybridShareholderYieldResult {
  const {
    stock,
    projectedForwardDividendYieldPct,
    normalDprPct,
    buybackNominalIdr,
    liveMarketCapIdr
  } = params;

  const cleanTicker = stock.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const marketCapIdr = Math.max(
    100_000_000_000,
    Number(liveMarketCapIdr) || Number(stock.liveMarketCapIdr) || 1_000_000_000_000
  );

  // Step 1: Sanitize Dividend Yield against Special Dividend Traps (> 5% spread vs TTM)
  const sanitizedDiv = sanitizeDividendYieldOutlier({
    trailingTtmYieldPct: stock.dividendYieldPct ?? projectedForwardDividendYieldPct,
    projectedForwardYieldPct: projectedForwardDividendYieldPct,
    normalDprPct
  });
  const forwardDividendYieldPct = stock.isHscFlagged ? 0 : sanitizedDiv.effectiveDividendYieldPct;

  // Step 2: Strict Buyback Yield = (Nominal Rupiah Buyback / Live Market Cap Aktual) * 100%
  const cleanBuybackIdr = Math.max(0, Number(buybackNominalIdr) || Number(stock.buybackNominalIdr) || 0);
  const dynamicBuybackYieldPct =
    !stock.isHscFlagged && cleanBuybackIdr > 0 && marketCapIdr > 0
      ? Number(Math.min(14.5, (cleanBuybackIdr / marketCapIdr) * 100).toFixed(2))
      : 0;

  // Step 3: Academic Net Payout Yield = Forward Dividend Yield + Buyback Yield (Pure Cash Returned to Shareholders)
  const netPayoutYieldPct = Number((forwardDividendYieldPct + dynamicBuybackYieldPct).toFixed(2));

  // Step 4: Sectoral Hybrid Filter for Net Debt Paydown Yield (No EPS overlap!)
  const isFinancialSector = stock.sector === 'Financials';
  let netDebtPaydownIdr = 0;
  let netDebtPaydownYieldPct = 0;

  if (!isFinancialSector && !stock.isHscFlagged) {
    const calibratedDebt = CALIBRATED_LONG_TERM_DEBT_B_IDR_MAP[cleanTicker];
    const prevDebtIdr =
      typeof stock.longTermDebtPrevYearIdr === 'number'
        ? stock.longTermDebtPrevYearIdr
        : calibratedDebt
        ? calibratedDebt.prevYearDebtBillionIdr * 1_000_000_000
        : 0;
    const currDebtIdr =
      typeof stock.longTermDebtCurrYearIdr === 'number'
        ? stock.longTermDebtCurrYearIdr
        : calibratedDebt
        ? calibratedDebt.currYearDebtBillionIdr * 1_000_000_000
        : 0;

    const rawDebtDeltaIdr = prevDebtIdr - currDebtIdr;
    if (rawDebtDeltaIdr > 0) {
      // Positive debt reduction (deleveraging turnaround signal)
      netDebtPaydownIdr = Math.round(rawDebtDeltaIdr);
      netDebtPaydownYieldPct = Number(
        Math.min(4.5, (netDebtPaydownIdr / marketCapIdr) * 100).toFixed(2)
      );
    } else {
      // Negative debt delta (company adding debt for productive CapEx expansion) -> Clamp strictly to 0%
      netDebtPaydownIdr = 0;
      netDebtPaydownYieldPct = 0;
    }
  }

  const totalShareholderYieldPct = Number(
    (netPayoutYieldPct + netDebtPaydownYieldPct).toFixed(2)
  );

  const nomenclatureLabel: 'Net Payout Yield' | 'Total Shareholder Yield (TSY)' =
    isFinancialSector || netDebtPaydownYieldPct === 0
      ? 'Net Payout Yield'
      : 'Total Shareholder Yield (TSY)';

  return {
    forwardDividendYieldPct,
    dynamicBuybackYieldPct,
    netPayoutYieldPct,
    netDebtPaydownIdr,
    netDebtPaydownYieldPct,
    totalShareholderYieldPct,
    isDividendOutlierSanitized: sanitizedDiv.isDividendOutlierSanitized,
    sanitizationReason: sanitizedDiv.sanitizationReason,
    nomenclatureLabel
  };
}
