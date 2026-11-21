import {
  MarketRegimeStatus,
  RawTickerData,
  RiskSizingResult,
  SanityCheckStatus,
  SanityFlag,
  SanityReport,
  StatArbSignalType,
  StockMetrics,
  TacticalOverlay,
  ValuationResult
} from '../types/quant';

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
 * P0: DATA INTEGRITY GUARDRAILS (PRE-PROCESSING LAYER)
 * ============================================================================
 * Mandatory pre-processing validation executed BEFORE conviction scores and
 * intrinsic valuations are computed:
 * 1. Cross-Check Shares Outstanding, EPS, and BVPS:
 *    - Validation 1: impliedShares = marketCap / price. If |impliedShares - sharesOutstanding| / sharesOutstanding > 0.03 (>3%),
 *      flag CRITICAL_DATA_MISMATCH.
 *    - Validation 2: Check consistency of (epsTTM * sharesOutstanding) vs netIncomeTTM (tolerance <= 5%),
 *      and (bvps * sharesOutstanding) vs equityAttributable (tolerance <= 5%).
 *    - If validation fails, block Grade A / Core Conviction ranking (max status DATA_AUDIT_REQUIRED)
 *      and output specific mismatch reasons.
 * 2. ADTV Unit Normalizer (Lot vs Shares & Thousands vs Full IDR):
 *    - Explicitly normalizes trading volume to shares (Lot * 100) and currency to full IDR.
 *    - Sanity trap: If marketCap >= 1e12 (Rp 1 Trillion) and adtv20dIDR < 50e6 (Rp 50 Million/day),
 *      throw warning ADTV_UNIT_ANOMALY so daily 5% ADTV absorption cap is not paralyzed.
 * 3. Default TTM Valuation Basis & Dual-Confirmation Catalyst:
 *    - Enforces TTM (Trailing Twelve Months) as default basis for EPS, ROE, and primary intrinsic valuation
 *      (stops aggressive linear annualization such as 9M * 1.33x for main intrinsic value).
 *    - CATALYST ACTIVE only activates if passing Dual Confirmation: YoY Net Income growth (>= 15%)
 *      MUST be confirmed by YoY Operating Profit growth (>= 10%) in the same period.
 * 4. SBN 10Y Risk-Free Rate Curve Freshness Check:
 *    - Tracks metadata rfLastUpdated for spotRf10Y.
 *    - If SBN data age > 7 days, activates STALE_RF_DATA flag, adds +50 bps safety buffer to Ke,
 *      and downgrades conviction badge eligibility until the SBN curve is refreshed.
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
    // Apply explicit currency scale and lot multiplier if raw feed passed lot-based value
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
  const sanitizedEpsTTM = epsTTM;
  const sanitizedRoeTTM = toDecimalRate(
    raw.roeTTM,
    equityAttributable > 0 ? netIncomeTTM / equityAttributable : 0.12
  );

  if (
    typeof raw.forwardAnnualizedEps === 'number' &&
    raw.forwardAnnualizedEps > sanitizedEpsTTM * 1.05
  ) {
    flags.push('LINEAR_ANNUALIZATION_BLOCKED');
  }

  const niYoYDecimal = toDecimalRate(raw.netIncomeYoYPct, 0);
  const opProfitYoYDecimal = toDecimalRate(raw.operatingProfitYoYPct, 0);

  // Dual Confirmation Rule: NI YoY >= 15% MUST be confirmed by Operating Profit YoY >= 10%
  const isNiSurge = niYoYDecimal >= 0.15;
  const isOpProfitConfirmed = opProfitYoYDecimal >= 0.10;
  const isDualCatalystConfirmed = isNiSurge && isOpProfitConfirmed;

  let catalystConfirmationNote = '';
  if (isDualCatalystConfirmed) {
    catalystConfirmationNote = `CATALYST ACTIVE (Dual-Confirmed): Laba Bersih YoY +${(niYoYDecimal * 100).toFixed(1)}% (≥15%) terkonfirmasi searah oleh Laba Usaha (Operating Profit) YoY +${(opProfitYoYDecimal * 100).toFixed(1)}% (≥10%).`;
  } else if (isNiSurge && !isOpProfitConfirmed) {
    flags.push('CATALYST_UNCONFIRMED_NON_OP');
    catalystConfirmationNote = `CATALYST REJECTED (Non-Operating Spike): Laba Bersih YoY +${(niYoYDecimal * 100).toFixed(1)}% (≥15%) TIDAK terkonfirmasi oleh Laba Usaha YoY (${(opProfitYoYDecimal * 100).toFixed(1)}% < +10%). Sinyal Catalyst Active diblokir untuk mencegah distorsi laba non-operasional.`;
    reasons.push(`[CATALYST_UNCONFIRMED_NON_OP] ${catalystConfirmationNote}`);
  } else {
    catalystConfirmationNote = `Basis TTM Standar: Pertumbuhan Laba Bersih YoY ${(niYoYDecimal * 100).toFixed(1)}% & Laba Usaha YoY ${(opProfitYoYDecimal * 100).toFixed(1)}% berada di bawah ambang Dual-Confirmation Catalyst (NI ≥15% & EBIT ≥10%).`;
  }

  // -------------------------------------------------------------------------
  // 4. FRESHNESS CHECK KURVA SBN 10Y (RISK-FREE RATE)
  // -------------------------------------------------------------------------
  const spotRf10Y = toDecimalRate(raw.spotRf10Y, 0.0675);
  const nowMs = raw.referenceNowDate ? Date.parse(raw.referenceNowDate) : Date.now();
  const rfUpdatedMs = raw.rfLastUpdated ? Date.parse(raw.rfLastUpdated) : NaN;

  let rfAgeDays = 0;
  let isRfStale = false;
  if (Number.isFinite(rfUpdatedMs) && Number.isFinite(nowMs)) {
    rfAgeDays = Math.max(0, Math.floor((nowMs - rfUpdatedMs) / (1000 * 60 * 60 * 24)));
    if (rfAgeDays > 7) {
      isRfStale = true;
    }
  } else {
    rfAgeDays = 999;
    isRfStale = true;
  }

  const keSafetyBufferBps = isRfStale ? 50 : 0; // +50 bps (+0.50%) automatic Ke buffer when SBN curve > 7 days old
  const convictionBadgeDowngraded = isRfStale;

  if (isRfStale) {
    flags.push('STALE_RF_DATA');
    reasons.push(
      `[STALE_RF_DATA] Kurva SBN 10Y (${(spotRf10Y * 100).toFixed(2)}%, tanggal: ${raw.rfLastUpdated || 'N/A'}) berusia ${rfAgeDays} hari (> batas 7 hari). Ditambahkan safety buffer otomatis +50 bps pada Cost of Equity (Ke) dan penurunan badge keyakinan.`
    );
  }

  // -------------------------------------------------------------------------
  // AGGREGATE SANITY STATUS & GRADE A BLOCKING
  // -------------------------------------------------------------------------
  const status: SanityCheckStatus = isCriticalMismatch
    ? 'FAIL'
    : isAdtvAnomaly || isRfStale || flags.includes('CATALYST_UNCONFIRMED_NON_OP')
    ? 'WARN'
    : 'PASS';

  const isGradeABlocked = isCriticalMismatch;
  const maxAllowedStatus: SanityReport['maxAllowedStatus'] = isGradeABlocked
    ? 'DATA_AUDIT_REQUIRED'
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
    rfLastUpdated: raw.rfLastUpdated || 'N/A',
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

  const defaultSector5YEvEbitda =
    params.sector === 'Healthcare'
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
      tranche1ScalingFactor: 0.55
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
    tranche1ScalingFactor: isDispersionPenalized ? 0.35 : 0.55,
    penaltyReason
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
    penaltyReasons.push(
      `[STALE_RF_DATA] Kurva SBN 10Y berusia ${input.sanityReport.rfAgeDays} hari (>7 hari): Cost of Equity (Ke) ditambah +50 bps dan skor keyakinan dikurangi -${staleRfPenaltyPts} poin (maksimal Grade A, blokir A+).`
    );
  }

  if (input.sanityReport.isGradeABlocked) {
    penaltyReasons.push(
      `[CRITICAL_DATA_MISMATCH] Rekonsiliasi Shares/EPS/BVPS gagal: Peringkat Grade A / Core Conviction diblokir otomatis → Status dikunci ke DATA_AUDIT_REQUIRED.`
    );
  }

  const adjustedConvictionScore = Math.max(
    10,
    Math.min(
      100,
      input.dispersionPenalty.adjustedConvictionScore - staleRfPenaltyPts
    )
  );

  let finalConvictionGrade: RiskSizingResult['finalConvictionGrade'];
  if (input.isHscFlagged) {
    finalConvictionGrade = 'D (AVOID / HSC)';
  } else if (input.sanityReport.isGradeABlocked) {
    // P0.1 Guardrail: Block Grade A / Core Conviction if CRITICAL_DATA_MISMATCH
    finalConvictionGrade = 'DATA_AUDIT_REQUIRED';
  } else if (adjustedConvictionScore >= 82 && !input.sanityReport.isRfStale) {
    finalConvictionGrade = 'A+ (CORE CONVICTION)';
  } else if (adjustedConvictionScore >= 72) {
    // Stale RF (>7d) downgrades A+ (CORE CONVICTION) to A (SOLID VALUE)
    finalConvictionGrade = 'A (SOLID VALUE)';
  } else if (adjustedConvictionScore >= 58) {
    finalConvictionGrade = 'B (WATCHLIST / HOLD)';
  } else {
    finalConvictionGrade = 'C (SPECULATIVE)';
  }

  const isCoreOrSolidGrade =
    finalConvictionGrade === 'A+ (CORE CONVICTION)' ||
    finalConvictionGrade === 'A (SOLID VALUE)';

  const stopLossMode: RiskSizingResult['stopLossMode'] = isCoreOrSolidGrade
    ? 'DUAL_CORE_CONVICTION_TRANCHE_AND_ATR'
    : 'ATR_VOL_CALIBRATED';

  const kePctLabel = ((input.effectiveCostOfEquity ?? 0.115) * 100).toFixed(2);
  const fundamentalInvalidationStopTriggers: string[] = [
    `Invalidasi ROIC/ROE: ROIC TTM atau ROE TTM turun di bawah Effective Cost of Equity (Ke ${kePctLabel}%) selama 2 kuartal berturut-turut.`,
    `Invalidasi Neraca & Kas: Rasio OCF/NI jatuh di bawah ambang batas sehat atau Net DER melompat > 1,20x tanpa ekspansi aset produktif.`,
    `Invalidasi Integritas Data: Status SANITY_CHECK berubah menjadi FAIL (CRITICAL_DATA_MISMATCH) atau muncul indikasi distribusi tidak wajar KSEI.`
  ];

  const trancheExecutionGuide = `Tranche 1 (Inisiasi): ${tranche1AllocationPct.toFixed(
    1
  )}% ekuitas${
    input.dispersionPenalty.isDispersionPenalized ? ' [Dibatasi Penalti Dispersi >40%]' : ''
  } · Tranche 2 (Konfirmasi Laba/Support): +${tranche2AllocationPct.toFixed(
    1
  )}% (Total Plafon Maks ${finalMaxAllocationPct.toFixed(1)}%).`;

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
    marketRegime = 'TENANG'
  } = params;

  const sharesOutstanding =
    paramSharesOutstanding && paramSharesOutstanding > 0
      ? Math.round(paramSharesOutstanding)
      : stock.sharesOutstanding && stock.sharesOutstanding > 0
      ? Math.round(stock.sharesOutstanding)
      : Math.max(100_000_000, Math.round(liveMarketCapIdr / Math.max(1, price)));

  const calibratedMarketCap =
    liveMarketCapIdr && liveMarketCapIdr > 0
      ? Math.round(liveMarketCapIdr)
      : stock.liveMarketCapIdr && stock.liveMarketCapIdr > 0
      ? Math.round(stock.liveMarketCapIdr)
      : Math.round(sharesOutstanding * price);

  const epsTTM = Math.max(1, Math.round(trailingEpsIdr));
  const bvps = Math.max(10, Math.round(estimatedBvpsIdr));

  const netIncomeTTM =
    stock.netIncomeTTMIdr &&
    stock.netIncomeTTMIdr > 0 &&
    Math.abs(epsTTM * sharesOutstanding - stock.netIncomeTTMIdr) / stock.netIncomeTTMIdr <= 0.05
      ? Math.round(stock.netIncomeTTMIdr)
      : Math.round(epsTTM * sharesOutstanding);

  const equityAttributable =
    stock.equityAttributableIdr &&
    stock.equityAttributableIdr > 0 &&
    Math.abs(bvps * sharesOutstanding - stock.equityAttributableIdr) / stock.equityAttributableIdr <= 0.05
      ? Math.round(stock.equityAttributableIdr)
      : Math.round(bvps * sharesOutstanding);

  const opMarginDecimal = Math.max(0.04, Math.min(0.65, (stock.operatingMargin || 15) / 100));
  const netMarginDecimal = Math.max(0.03, opMarginDecimal * 0.76);

  const revenueTTM =
    stock.revenueTTMIdr && stock.revenueTTMIdr > 0
      ? Math.round(stock.revenueTTMIdr)
      : Math.round(netIncomeTTM / netMarginDecimal);

  const operatingProfitTTM =
    stock.operatingProfitTTMIdr && stock.operatingProfitTTMIdr > 0
      ? Math.round(stock.operatingProfitTTMIdr)
      : Math.round(revenueTTM * opMarginDecimal);

  const capexRatio = Math.max(0.03, Math.min(0.42, capexToRevenueRatio || 0.08));
  const capexTTM =
    stock.capexTTMIdr && stock.capexTTMIdr > 0
      ? Math.round(stock.capexTTMIdr)
      : Math.round(revenueTTM * capexRatio);

  const daTTM = Math.max(1, Math.round(capexTTM / Math.max(0.8, capexToDaRatio || 1.5)));
  const ebitdaTTM = operatingProfitTTM + daTTM;
  const ocfTTM = Math.round(netIncomeTTM * ocfToNetIncomeRatio);

  const der = Math.max(0.02, stock.debtToEquity || 0.5);
  const totalDebt = Math.round(equityAttributable * der);
  const cashAndEquivalents = Math.round(equityAttributable * 0.22);
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

  // Default SBN 10Y last updated timestamp (fresh today unless overridden)
  const rfLastUpdated =
    stock.rfLastUpdated || new Date().toISOString().slice(0, 10);

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
    netIncomeTTM,
    revenueTTM,
    operatingProfitTTM,
    ebitdaTTM,
    equityAttributable,
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
    beta1Y: stock.beta1Y,
    realizedAnnualVol: (stock.volatilityAnn || 24) / 100,
    atr20,
    marketRegime
  };
}
