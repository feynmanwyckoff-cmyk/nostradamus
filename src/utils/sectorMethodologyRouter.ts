/**
 * MODUL 1: MULTI-SECTOR FUNDAMENTAL & VALUATION ROUTER (IDX-IC SECTOR-AWARE ENGINE)
 *
 * Maps every IDX issuer by `sector` (IDX-IC) and `subSector`/`ticker` into 1 of 6 accounting & valuation regimes:
 * 1. FINANCIALS (Perbankan, Multifinance, Asuransi — e.g., BRIS, BBCA, BBRI, BMRI, BBNI, BFIN, BNGA, NISP, BTPS, BDMN, BNLI, BBTN, BJBR, BJTM, PNBN, ARTO)
 * 2. CYCLICAL_COMMODITIES (Energy & Basic Materials — Batu Bara, Nikel, Migas, Pulp, Semen)
 * 3. PROPERTIES_REAL_ESTATE (Developer & Kawasan Industri — PSAK 72 seasonal recognition)
 * 4. INFRA_TELCO_UTILITIES (Heavy-Asset / High D&A — Telko, Menara, Tol, Utilitas)
 * 5. CORE_CORPORATE (Healthcare, Consumer Non-Cyclicals, Consumer Cyclicals & Industrials)
 * 6. TECH_UNPROFITABLE_GROWTH (Technology or Unprofitable Growth with negative/thin operating or net profit)
 *
 * Outputs a transparent `sectorMethodologyNotice`, active vs. bypassed metrics, dynamic Pillar 1-4 titles and formatted lines,
 * and sector-adjusted fundamental scores so UI Modal, 2x Retina PNG Export, and Multi-Page Institutional PDF Export are 100% synchronized.
 */

export type SectorMethodologyRegime =
  | 'FINANCIALS'
  | 'CYCLICAL_COMMODITIES'
  | 'PROPERTIES_REAL_ESTATE'
  | 'INFRA_TELCO_UTILITIES'
  | 'CORE_CORPORATE'
  | 'TECH_UNPROFITABLE_GROWTH';

export interface SectorMethodologyInput {
  ticker: string;
  sector: string;
  subSector?: string;
  roeTTM: number; // % (e.g., 16.5)
  roeAvg5YPct: number; // % (e.g., 14.2)
  costOfEquityKePct: number; // % (e.g., 11.45)
  roicTTMPct: number; // % (e.g., 15.0)
  netIncomeTTMIdr: number;
  operatingProfitTTMIdr: number;
  ebitdaTTMIdr: number;
  revenueTTMIdr: number;
  equityAttributableIdr: number;
  totalAssetsIdr: number;
  totalDebtIdr: number;
  cashAndEquivalentsIdr: number;
  ocfTTMIdr: number;
  capexTTMIdr: number;
  daTTMIdr: number;
  grossProfitabilityToAssetsPct: number;
  ocfToNetIncomeRatio: number;
  debtToEquityRatio: number;
  capexToDaRatio: number;
  totalShareholderYieldPct: number;
  forwardDividendYieldPct: number;
  dynamicBuybackYieldPct: number;
  netDebtPaydownYieldPct: number;
  isHscFlagged: boolean;
  hscStatusLine: string;
  isInstitutionalLiquid: boolean;
  isDualConfirmedCatalystActive: boolean;
  rawAccrualPenaltyPts: number;
  effectiveModule?: string;
}

export interface SectorMethodologyProfile {
  regime: SectorMethodologyRegime;
  regimeShortLabel: string;
  regimeBadgeLabel: string;
  sectorMethodologyNotice: string;
  bypassedMetrics: string[];
  activeMetrics: string[];
  isGpaBypassed: boolean;
  isOcfNiAccrualBypassed: boolean;
  isCorporateDerBypassed: boolean;
  isEvEbitdaBypassed: boolean;
  isRoicCapexBypassed: boolean;
  isPeAndRimBlockedByNegativeProfit: boolean;
  isGradeCappedAtCByUnprofitableTech: boolean;
  isCyclePeakWarning: boolean;
  cyclePeakWarningText?: string;
  isPsak72AccrualRelaxed: boolean;
  effectiveAccrualPenaltyPts: number;
  trueRoaPct: number;
  assetLeverageRatio: number;
  netDebtIdr: number;
  netDebtToEquityRatio: number;
  netDebtToEbitdaRatio: number;
  ocfToEbitdaRatio: number;
  cashRunwayYears: number;
  pillar1Title: string;
  pillar2Title: string;
  pillar3Title: string;
  pillar4Title: string;
  pillar1PrimaryMetricLabel: string;
  pillar1Lines: [string, string, string];
  pillar2PrimaryMetricLabel: string;
  pillar2Lines: [string, string, string];
  academicStripCard1: {
    label: string;
    mainVal: string;
    subVal: string;
  };
  academicStripCard3: {
    label: string;
    mainVal: string;
    subVal: string;
  };
  adjustedBusinessQualityScore?: number;
  adjustedBalanceSheetHealthScore?: number;
}

const KNOWN_FINANCIAL_TICKERS = new Set([
  'BBCA',
  'BBRI',
  'BMRI',
  'BBNI',
  'BRIS',
  'BFIN',
  'BDMN',
  'BNGA',
  'NISP',
  'BTPS',
  'BBTN',
  'BNLI',
  'BJBR',
  'BJTM',
  'PNBN',
  'ARTO',
  'BBYB',
  'ADMF',
  'CFIN',
  'WOMF',
  'TUGU',
  'PNLF',
  'PNIN',
  'MEGA',
  'MAYA',
  'BBKP',
  'AGRO',
  'BANK',
  'BMAS',
  'BSIM',
  'BTPN',
  'SDRA'
]);

const KNOWN_TECH_TICKERS = new Set([
  'GOTO',
  'BUKA',
  'BELI',
  'DCII',
  'EMTK',
  'MTDL',
  'MLPT',
  'WIFI',
  'WIRG',
  'DIVA',
  'MCAS',
  'TFAS',
  'NFCX',
  'KIOS',
  'EDGE',
  'ATIC'
]);

/**
 * IDX Palm Oil (CPO) & Agribusiness Plantation Issuers:
 * Classified under IDX-IC 'Consumer Non-Cyclicals', but economically operate as cyclical commodities.
 * Routed to CYCLICAL_COMMODITIES (3-5Y through-the-cycle ROE normalization & ~5.0x-6.0x EV/EBITDA anchor).
 */
export const KNOWN_CPO_PLANTATION_TICKERS = new Set([
  'LSIP',
  'AALI',
  'TAPG',
  'DSNG',
  'SSMS',
  'SMAR',
  'SIMP',
  'STAA',
  'SGRO',
  'BWPT',
  'CSRA',
  'ANJT',
  'TBLA',
  'GZCO',
  'JAWA',
  'PALM',
  'FAPA',
  'MGRO',
  'NSSS',
  'PGUN'
]);

export function isCpoPlantationTicker(ticker: string): boolean {
  if (!ticker) return false;
  const clean = ticker.replace(/\.JK$/i, '').trim().toUpperCase();
  return KNOWN_CPO_PLANTATION_TICKERS.has(clean);
}

/**
 * Resolves the authentic Total Assets for an issuer.
 * For Financials (Banks/Multifinance), NEVER synthesize Total Assets as `equity + debt`
 * because Customer Deposits (DPK / Dana Syirkah Temporer) are excluded from corporate debt.
 */
export function resolveAuthenticTotalAssetsIdr(params: {
  ticker: string;
  sector: string;
  explicitTotalAssetsIdr?: number;
  equityAttributableIdr: number;
  totalDebtIdr: number;
}): number {
  const cleanTicker = params.ticker.replace(/\.JK$/i, '').trim().toUpperCase();
  const isFinancial =
    params.sector === 'Financials' || KNOWN_FINANCIAL_TICKERS.has(cleanTicker);

  const equity = Math.max(1, params.equityAttributableIdr);
  const explicitAssets = params.explicitTotalAssetsIdr ?? 0;

  if (isFinancial) {
    // Banks typically carry 5.5x - 9.0x Asset-to-Equity leverage due to customer deposits (DPK).
    // If explicitTotalAssetsIdr is missing or accidentally equals equity + corporate debt (< 3.0x equity for banks),
    // restore authentic banking asset base from calibrated bank asset leverage.
    if (explicitAssets >= equity * 3.2) {
      return explicitAssets;
    }
    const calibratedBankLeverageMap: Record<string, number> = {
      BBCA: 5.75,
      BBRI: 6.25,
      BMRI: 7.85,
      BBNI: 6.95,
      BRIS: 8.15,
      BTN: 11.2,
      BBTN: 11.2,
      BNGA: 6.65,
      NISP: 6.85,
      BDMN: 4.55,
      BNLI: 6.15,
      BTPS: 2.65,
      BFIN: 2.45,
      ADMF: 2.85,
      BJBR: 11.4,
      BJTM: 9.2,
      PNBN: 4.3,
      ARTO: 2.55
    };
    const bankMult = calibratedBankLeverageMap[cleanTicker] ?? 7.2;
    return Math.round(equity * bankMult);
  }

  if (explicitAssets > equity) {
    return explicitAssets;
  }
  return Math.round(equity + Math.max(0, params.totalDebtIdr) + equity * 0.22);
}

/**
 * Determines the IDX-IC Sector Methodology Regime for any issuer
 */
export function detectSectorMethodologyRegime(params: {
  ticker: string;
  sector: string;
  subSector?: string;
  netIncomeTTMIdr: number;
  operatingProfitTTMIdr: number;
  roeTTM: number;
}): SectorMethodologyRegime {
  const cleanTicker = params.ticker.replace(/\.JK$/i, '').trim().toUpperCase();
  const sec = (params.sector || '').trim();
  const sub = (params.subSector || '').toLowerCase();

  // 1. Financials (Banks, Multifinance, Insurance)
  if (
    sec === 'Financials' ||
    KNOWN_FINANCIAL_TICKERS.has(cleanTicker) ||
    sub.includes('bank') ||
    sub.includes('finance') ||
    sub.includes('insurance')
  ) {
    return 'FINANCIALS';
  }

  // 6. Technology / Unprofitable Growth (Negative or near-zero Net Income / Operating Profit, or Tech sector with weak earnings)
  const isUnprofitable =
    params.netIncomeTTMIdr <= 0 ||
    params.operatingProfitTTMIdr <= 0 ||
    params.roeTTM <= 1.0;
  if (
    isUnprofitable ||
    ((sec === 'Technology' || KNOWN_TECH_TICKERS.has(cleanTicker)) && params.roeTTM < 6.0)
  ) {
    return 'TECH_UNPROFITABLE_GROWTH';
  }

  // 2. Energy, Basic Materials & CPO/Agri Plantations (Cyclical Commodities)
  if (
    sec === 'Energy' ||
    sec === 'Basic Materials' ||
    KNOWN_CPO_PLANTATION_TICKERS.has(cleanTicker) ||
    sub.includes('plantation') ||
    sub.includes('cpo') ||
    sub.includes('palm') ||
    sub.includes('coal') ||
    sub.includes('mining') ||
    sub.includes('metal') ||
    sub.includes('oil') ||
    sub.includes('pulp') ||
    sub.includes('cement')
  ) {
    return 'CYCLICAL_COMMODITIES';
  }

  // 3. Properties & Real Estate (PSAK 72 Developers & Industrial Estates)
  if (
    sec === 'Properties & Real Estate' ||
    sub.includes('property') ||
    sub.includes('real estate') ||
    sub.includes('industrial estate')
  ) {
    return 'PROPERTIES_REAL_ESTATE';
  }

  // 4. Infrastructure, Utilities & Telecommunications (Heavy-Asset / High D&A)
  if (
    sec === 'Infrastructures' ||
    sec === 'Infrastructure' ||
    sec === 'Transportation & Logistic' ||
    sub.includes('telecom') ||
    sub.includes('tower') ||
    sub.includes('toll') ||
    sub.includes('utilities')
  ) {
    return 'INFRA_TELCO_UTILITIES';
  }

  // 5. Healthcare, Consumer Non-Cyclicals, Consumer Cyclicals, Industrials & profitable Tech (Core Corporate)
  return 'CORE_CORPORATE';
}

/**
 * Master IDX-IC Sector-Aware Fundamental & Valuation Methodology Router
 */
export function resolveSectorMethodologyProfile(
  input: SectorMethodologyInput
): SectorMethodologyProfile {
  const regime = detectSectorMethodologyRegime({
    ticker: input.ticker,
    sector: input.sector,
    subSector: input.subSector,
    netIncomeTTMIdr: input.netIncomeTTMIdr,
    operatingProfitTTMIdr: input.operatingProfitTTMIdr,
    roeTTM: input.roeTTM
  });

  const authenticTotalAssetsIdr = resolveAuthenticTotalAssetsIdr({
    ticker: input.ticker,
    sector: input.sector,
    explicitTotalAssetsIdr: input.totalAssetsIdr,
    equityAttributableIdr: input.equityAttributableIdr,
    totalDebtIdr: input.totalDebtIdr
  });

  const equity = Math.max(1, input.equityAttributableIdr);
  const ebitda = Math.max(1, input.ebitdaTTMIdr);
  const trueRoaPct = Number(
    ((input.netIncomeTTMIdr / Math.max(1, authenticTotalAssetsIdr)) * 100).toFixed(2)
  );
  const assetLeverageRatio = Number((authenticTotalAssetsIdr / equity).toFixed(2));
  const netDebtIdr = input.totalDebtIdr - input.cashAndEquivalentsIdr;
  const netDebtToEquityRatio = Number((Math.max(0, netDebtIdr) / equity).toFixed(2));
  const netDebtToEbitdaRatio = Number((Math.max(0, netDebtIdr) / ebitda).toFixed(2));
  const ocfToEbitdaRatio = Number((input.ocfTTMIdr / ebitda).toFixed(2));

  const annualCashBurnIdr =
    input.ocfTTMIdr < 0
      ? Math.abs(input.ocfTTMIdr)
      : Math.max(1, input.capexTTMIdr * 0.65);
  const cashRunwayYears = Number(
    Math.min(15, Math.max(0.5, input.cashAndEquivalentsIdr / annualCashBurnIdr)).toFixed(1)
  );

  const buybackPart =
    input.dynamicBuybackYieldPct > 0
      ? ` + Buyback ${input.dynamicBuybackYieldPct.toFixed(2)}%`
      : '';
  const debtPayPart =
    input.netDebtPaydownYieldPct > 0 && regime !== 'FINANCIALS'
      ? ` + DebtPay ${input.netDebtPaydownYieldPct.toFixed(2)}%`
      : '';
  const tsyOrNetPayoutLabel =
    input.netDebtPaydownYieldPct > 0 && regime !== 'FINANCIALS' ? 'TSY' : 'Net Payout';
  const payoutLine = `${tsyOrNetPayoutLabel}: ${input.totalShareholderYieldPct.toFixed(2)}% (Div ${input.forwardDividendYieldPct.toFixed(2)}%${buybackPart}${debtPayPart})`;

  // ============================================================================
  // REGIME 1: FINANCIALS (PERBANKAN, MULTIFINANCE, ASURANSI)
  // ============================================================================
  if (regime === 'FINANCIALS') {
    const roeKeSpread = Number((input.roeTTM - input.costOfEquityKePct).toFixed(2));
    const spreadSign = roeKeSpread >= 0 ? '+' : '';

    // Bank Business Quality Score: Driven by ROE vs Ke Spread, True ROA (NI/Assets), and Payout/Moat (0 Accrual Penalty)
    const bankRoeScore = Math.min(48, (Math.max(0, input.roeTTM) / 21) * 46);
    const bankRoaScore = Math.min(28, (Math.max(0, trueRoaPct) / 2.6) * 26);
    const spreadBonus = roeKeSpread >= 4.0 ? 12 : roeKeSpread >= 1.5 ? 8 : roeKeSpread >= 0 ? 4 : -6;
    const instMoatBonus =
      (input.isInstitutionalLiquid ? 8 : 3) +
      (input.totalShareholderYieldPct >= 3.0 ? 6 : input.totalShareholderYieldPct > 0 ? 3 : 0);
    const adjustedBusinessQualityScore = Math.round(
      Math.max(20, Math.min(98, bankRoeScore + bankRoaScore + spreadBonus + instMoatBonus))
    );

    // Bank Capital Structure Score: Driven by Healthy Asset-to-Equity Leverage (4x-9.5x normal for banks) & HSC status
    const leverageHealthScore =
      assetLeverageRatio <= 8.5
        ? 54
        : assetLeverageRatio <= 10.5
        ? 46
        : 36;
    const payoutCapitalBonus =
      input.totalShareholderYieldPct >= 4.5
        ? 22
        : input.totalShareholderYieldPct >= 2.0
        ? 16
        : 10;
    const hscBonus = input.isHscFlagged ? -25 : input.isInstitutionalLiquid ? 14 : 8;
    const adjustedBalanceSheetHealthScore = Math.round(
      Math.max(18, Math.min(98, leverageHealthScore + payoutCapitalBonus + hscBonus))
    );

    const leverageStatusLabel =
      assetLeverageRatio <= 8.5
        ? 'Permodalan Kuat (CAR Sehat)'
        : assetLeverageRatio <= 11.0
        ? 'Leverage Perbankan Normal'
        : 'Leverage Aset Tinggi';

    return {
      regime: 'FINANCIALS',
      regimeShortLabel: 'FINANCIALS (BANK & KEUANGAN)',
      regimeBadgeLabel: 'MODE SEKTOR: FINANCIALS',
      sectorMethodologyNotice:
        'Mode Sektor Financials: GP/A, OCF/NI, DER korporasi, & EV/EBITDA dinonaktifkan karena struktur DPK/kredit perbankan; kualitas diukur via ROE-Ke Spread & True ROA (NI/Assets).',
      bypassedMetrics: [
        'GP/A (Novy-Marx)',
        'OCF/NI Accrual',
        'DER Korporasi',
        'CapEx/D&A',
        'ROIC',
        'EV/EBITDA'
      ],
      activeMetrics: [
        'ROE vs Dynamic Ke Spread',
        'True ROA (NI / Total Assets)',
        'Asset Leverage (Assets / Equity)',
        'Justified PBV + Multi-Stage RIM + Hist PBV 5Y'
      ],
      isGpaBypassed: true,
      isOcfNiAccrualBypassed: true,
      isCorporateDerBypassed: true,
      isEvEbitdaBypassed: true,
      isRoicCapexBypassed: true,
      isPeAndRimBlockedByNegativeProfit: false,
      isGradeCappedAtCByUnprofitableTech: false,
      isCyclePeakWarning: false,
      isPsak72AccrualRelaxed: false,
      effectiveAccrualPenaltyPts: 0,
      trueRoaPct,
      assetLeverageRatio,
      netDebtIdr,
      netDebtToEquityRatio,
      netDebtToEbitdaRatio,
      ocfToEbitdaRatio,
      cashRunwayYears,
      pillar1Title: '1. Profitabilitas Bank',
      pillar2Title: '2. Struktur Modal',
      pillar3Title: '3. Justified PBV & Kurva SBN',
      pillar4Title: '4. 1/β Barbell Position Sizing',
      pillar1PrimaryMetricLabel: `ROE TTM ${input.roeTTM.toFixed(1)}% (Spread ${spreadSign}${roeKeSpread.toFixed(1)}%)`,
      pillar1Lines: [
        `ROE vs Ke: ${input.roeTTM.toFixed(1)}% vs ${input.costOfEquityKePct.toFixed(1)}% (${spreadSign}${roeKeSpread.toFixed(1)}%)`,
        `True ROA (NI/Assets): ${trueRoaPct.toFixed(2)}% (Bypass OCF/NI & GP/A)`,
        payoutLine
      ],
      pillar2PrimaryMetricLabel: `Assets/Equity ${assetLeverageRatio.toFixed(2)}x`,
      pillar2Lines: [
        `Asset-to-Equity: ${assetLeverageRatio.toFixed(2)}x (Bypass DER Korporasi)`,
        `Kualitas Modal: ${leverageStatusLabel}`,
        input.hscStatusLine
      ],
      academicStripCard1: {
        label: 'PROFITABILITAS BANK & TRUE ROA',
        mainVal: `True ROA ${trueRoaPct.toFixed(2)}%`,
        subVal: `(ROE ${input.roeTTM.toFixed(1)}% · Spread ${spreadSign}${roeKeSpread.toFixed(1)}%)`
      },
      academicStripCard3: {
        label: 'STRUKTUR DPK & MODAL BANK',
        mainVal: `Assets/Eq ${assetLeverageRatio.toFixed(2)}x`,
        subVal: '(0 Penalti · Bypass OCF/NI & DER)'
      },
      adjustedBusinessQualityScore,
      adjustedBalanceSheetHealthScore
    };
  }

  // ============================================================================
  // REGIME 2: ENERGY, BASIC MATERIALS & CPO/PLANTATIONS (KOMODITAS & SIKLIKAL)
  // ============================================================================
  if (regime === 'CYCLICAL_COMMODITIES') {
    const isCpo = isCpoPlantationTicker(input.ticker);
    const roeAvg5Y = Math.max(1, input.roeAvg5YPct || input.roeTTM * 0.85);
    const isCyclePeakWarning = input.roeTTM > roeAvg5Y * 1.35;
    const cyclePeakWarningText = isCyclePeakWarning
      ? `CYCLE PEAK WARNING: ROE TTM (${input.roeTTM.toFixed(1)}%) melampaui 1.35× ROE Rata-Rata 5Y (${roeAvg5Y.toFixed(1)}%) — valuasi menggunakan normalisasi Through-the-Cycle untuk mencegah Value Trap puncak komoditas.`
      : undefined;

    return {
      regime: 'CYCLICAL_COMMODITIES',
      regimeShortLabel: isCpo ? 'CPO & AGRI (SIKLIKAL/KOMODITAS)' : 'CYCLICAL / KOMODITAS',
      regimeBadgeLabel: 'MODE SEKTOR: SIKLIKAL/KOMODITAS',
      sectorMethodologyNotice: isCpo
        ? `Mode Sektor Siklikal/Komoditas (Sub-Sektor CPO/Perkebunan): Meski tercatat di Consumer Non-Cyclicals IDX-IC, emiten sawit/CPO (${input.ticker}) dinilai dengan normalisasi ROE 3–5 tahun (through-the-cycle) & jangkar EV/EBITDA komoditas (~5.0x–6.0x, bukan 11.8x FMCG).`
        : 'Mode Sektor Siklikal/Komoditas: Valuasi menggunakan normalisasi laba 3–5 tahun (through-the-cycle) & jangkar EV/EBITDA untuk mencegah jebakan laba puncak siklus.',
      bypassedMetrics: ['Peak-Cycle Unadjusted P/E Extrapolation'],
      activeMetrics: [
        'Normalized 3-5Y Through-the-Cycle ROE & EPS',
        'Historical EV/EBITDA Band 5Y',
        'Net Debt / EBITDA',
        'Net Payout / FCF Yield'
      ],
      isGpaBypassed: false,
      isOcfNiAccrualBypassed: false,
      isCorporateDerBypassed: false,
      isEvEbitdaBypassed: false,
      isRoicCapexBypassed: false,
      isPeAndRimBlockedByNegativeProfit: false,
      isGradeCappedAtCByUnprofitableTech: false,
      isCyclePeakWarning,
      cyclePeakWarningText,
      isPsak72AccrualRelaxed: false,
      effectiveAccrualPenaltyPts: input.rawAccrualPenaltyPts,
      trueRoaPct,
      assetLeverageRatio,
      netDebtIdr,
      netDebtToEquityRatio,
      netDebtToEbitdaRatio,
      ocfToEbitdaRatio,
      cashRunwayYears,
      pillar1Title: '1. Kualitas Siklus & Kas',
      pillar2Title: '2. Kesehatan Neraca',
      pillar3Title: '3. Justified PBV & Kurva SBN',
      pillar4Title: '4. 1/β Barbell Position Sizing',
      pillar1PrimaryMetricLabel: `Norm. ROE 5Y ${roeAvg5Y.toFixed(1)}% (TTM ${input.roeTTM.toFixed(1)}%)`,
      pillar1Lines: [
        `Norm ROE 5Y: ${roeAvg5Y.toFixed(1)}% · TTM ${input.roeTTM.toFixed(1)}%${isCyclePeakWarning ? ' [PEAK WARN]' : ''}`,
        `OCF/NI (Kas Siklus): ${input.ocfToNetIncomeRatio.toFixed(2)}x (GP/A ${input.grossProfitabilityToAssetsPct.toFixed(1)}%)`,
        payoutLine
      ],
      pillar2PrimaryMetricLabel: `Net Debt/EBITDA ${netDebtToEbitdaRatio.toFixed(2)}x`,
      pillar2Lines: [
        `Net Debt/EBITDA: ${netDebtToEbitdaRatio.toFixed(2)}x (DER ${input.debtToEquityRatio.toFixed(2)}x)`,
        `Status Neraca: ${netDebtToEbitdaRatio <= 1.5 ? 'Kas Kuat / Rendah Utang' : 'Leverage Siklikal Moderat'}`,
        input.hscStatusLine
      ],
      academicStripCard1: {
        label: 'THROUGH-THE-CYCLE & GP/A',
        mainVal: `Norm ROE ${roeAvg5Y.toFixed(1)}%`,
        subVal: `(TTM ${input.roeTTM.toFixed(1)}% · GP/A ${input.grossProfitabilityToAssetsPct.toFixed(1)}%)`
      },
      academicStripCard3: {
        label: 'KAS KOMODITAS & LEVERAGE',
        mainVal: `OCF/NI ${input.ocfToNetIncomeRatio.toFixed(2)}x`,
        subVal: `(NetDebt/EBITDA ${netDebtToEbitdaRatio.toFixed(2)}x)`
      }
    };
  }

  // ============================================================================
  // REGIME 3: PROPERTIES & REAL ESTATE (DEVELOPER & KAWASAN INDUSTRI)
  // ============================================================================
  if (regime === 'PROPERTIES_REAL_ESTATE') {
    const isPsak72AccrualRelaxed = netDebtToEquityRatio < 0.75;
    const effectiveAccrualPenaltyPts = isPsak72AccrualRelaxed
      ? Math.round(input.rawAccrualPenaltyPts * 0.25)
      : input.rawAccrualPenaltyPts;

    // Boost balance sheet score when Net Debt / Equity < 0.75x (healthy landbank solvency)
    const propSolvencyScore =
      netDebtToEquityRatio < 0.45
        ? 54
        : netDebtToEquityRatio < 0.75
        ? 48
        : 34;
    const propCashScore = cashRunwayYears >= 3.0 ? 24 : 16;
    const hscBonus = input.isHscFlagged ? -25 : input.isInstitutionalLiquid ? 12 : 6;
    const adjustedBalanceSheetHealthScore = Math.round(
      Math.max(20, Math.min(96, propSolvencyScore + propCashScore + hscBonus - effectiveAccrualPenaltyPts * 0.4))
    );

    return {
      regime: 'PROPERTIES_REAL_ESTATE',
      regimeShortLabel: 'PROPERTIES (PSAK 72)',
      regimeBadgeLabel: 'MODE SEKTOR: PROPERTI (PSAK 72)',
      sectorMethodologyNotice:
        'Mode Sektor Properti: Pengakuan pendapatan PSAK 72 bersifat musiman; valuasi diprioritaskan pada PBV/aset & ketahanan kas dibanding P/E kuartalan.',
      bypassedMetrics: ['Quarterly P/E Volatility', 'Strict Short-Term OCF/NI Penalty (when Net Debt/Eq < 0.75x)'],
      activeMetrics: [
        'PBV / RNAV Proxy',
        'Historical PBV Band 5Y',
        'Net Debt / Equity (< 0.75x Solvency)',
        'Cash Runway & Landbank Buffer'
      ],
      isGpaBypassed: false,
      isOcfNiAccrualBypassed: isPsak72AccrualRelaxed,
      isCorporateDerBypassed: false,
      isEvEbitdaBypassed: false,
      isRoicCapexBypassed: false,
      isPeAndRimBlockedByNegativeProfit: false,
      isGradeCappedAtCByUnprofitableTech: false,
      isCyclePeakWarning: false,
      isPsak72AccrualRelaxed,
      effectiveAccrualPenaltyPts,
      trueRoaPct,
      assetLeverageRatio,
      netDebtIdr,
      netDebtToEquityRatio,
      netDebtToEbitdaRatio,
      ocfToEbitdaRatio,
      cashRunwayYears,
      pillar1Title: '1. Kualitas Aset & Margin',
      pillar2Title: '2. Solvabilitas & Kas',
      pillar3Title: '3. Justified PBV & Kurva SBN',
      pillar4Title: '4. 1/β Barbell Position Sizing',
      pillar1PrimaryMetricLabel: `ROE TTM ${input.roeTTM.toFixed(1)}% · ROA ${trueRoaPct.toFixed(1)}%`,
      pillar1Lines: [
        `ROE TTM: ${input.roeTTM.toFixed(1)}% (True ROA ${trueRoaPct.toFixed(1)}% · GP/A ${input.grossProfitabilityToAssetsPct.toFixed(1)}%)`,
        `OCF/NI (PSAK 72): ${input.ocfToNetIncomeRatio.toFixed(2)}x ${isPsak72AccrualRelaxed ? '(Relaksasi NetDebt/Eq <0,75x)' : ''}`,
        payoutLine
      ],
      pillar2PrimaryMetricLabel: `Net Debt/Eq ${netDebtToEquityRatio.toFixed(2)}x`,
      pillar2Lines: [
        `Net Debt/Equity: ${netDebtToEquityRatio.toFixed(2)}x (Gross DER ${input.debtToEquityRatio.toFixed(2)}x)`,
        `Cash Runway: ~${cashRunwayYears.toFixed(1)} Thn (${netDebtToEquityRatio < 0.75 ? 'Solvabilitas Sehat' : 'Leverage Moderat'})`,
        input.hscStatusLine
      ],
      academicStripCard1: {
        label: 'KUALITAS ASET PROPERTI',
        mainVal: `ROA ${trueRoaPct.toFixed(1)}% · ROE ${input.roeTTM.toFixed(1)}%`,
        subVal: `(GP/A ${input.grossProfitabilityToAssetsPct.toFixed(1)}% · Lev ${assetLeverageRatio.toFixed(2)}x)`
      },
      academicStripCard3: {
        label: 'PSAK 72 & NET DEBT/EQUITY',
        mainVal: `NetDebt/Eq ${netDebtToEquityRatio.toFixed(2)}x`,
        subVal: isPsak72AccrualRelaxed
          ? '(Relaksasi Akrual PSAK 72 <0,75x)'
          : `(OCF/NI ${input.ocfToNetIncomeRatio.toFixed(2)}x)`
      },
      adjustedBalanceSheetHealthScore
    };
  }

  // ============================================================================
  // REGIME 4: INFRASTRUCTURE, UTILITIES & TELECOMMUNICATIONS (HEAVY-ASSET / HIGH D&A)
  // ============================================================================
  if (regime === 'INFRA_TELCO_UTILITIES') {
    // Evaluate balance sheet via Net Debt / EBITDA and OCF / EBITDA conversion rather than penalizing corporate DER harshly
    const ndEbitdaScore =
      netDebtToEbitdaRatio <= 2.0
        ? 52
        : netDebtToEbitdaRatio <= 3.2
        ? 44
        : netDebtToEbitdaRatio <= 4.2
        ? 34
        : 22;
    const ocfEbitdaBonus =
      ocfToEbitdaRatio >= 0.75 ? 24 : ocfToEbitdaRatio >= 0.55 ? 18 : 8;
    const hscBonus = input.isHscFlagged ? -25 : input.isInstitutionalLiquid ? 12 : 6;
    const adjustedBalanceSheetHealthScore = Math.round(
      Math.max(18, Math.min(98, ndEbitdaScore + ocfEbitdaBonus + hscBonus))
    );

    return {
      regime: 'INFRA_TELCO_UTILITIES',
      regimeShortLabel: 'INFRA / TELKO (HIGH D&A)',
      regimeBadgeLabel: 'MODE SEKTOR: INFRASTRUKTUR/TELKO',
      sectorMethodologyNotice:
        'Mode Sektor Infrastruktur/Telko: Depresiasi tinggi mendistorsi P/E; valuasi dan leverage diukur menggunakan EV/EBITDA & Net Debt/EBITDA.',
      bypassedMetrics: ['Unadjusted P/E Distortion from High D&A', 'Manufacturing-Style Strict DER Penalty'],
      activeMetrics: [
        'Historical EV/EBITDA Band 5Y',
        'OCF / EBITDA Cash Conversion',
        'Net Debt / EBITDA Leverage',
        'Multi-Stage RIM'
      ],
      isGpaBypassed: false,
      isOcfNiAccrualBypassed: false,
      isCorporateDerBypassed: false,
      isEvEbitdaBypassed: false,
      isRoicCapexBypassed: false,
      isPeAndRimBlockedByNegativeProfit: false,
      isGradeCappedAtCByUnprofitableTech: false,
      isCyclePeakWarning: false,
      isPsak72AccrualRelaxed: false,
      effectiveAccrualPenaltyPts: Math.round(input.rawAccrualPenaltyPts * 0.5),
      trueRoaPct,
      assetLeverageRatio,
      netDebtIdr,
      netDebtToEquityRatio,
      netDebtToEbitdaRatio,
      ocfToEbitdaRatio,
      cashRunwayYears,
      pillar1Title: '1. Konversi Kas & EBITDA',
      pillar2Title: '2. Leverage Infrastruktur',
      pillar3Title: '3. EV/EBITDA & Justified PBV',
      pillar4Title: '4. 1/β Barbell Position Sizing',
      pillar1PrimaryMetricLabel: `OCF/EBITDA ${(ocfToEbitdaRatio * 100).toFixed(0)}% (ROE ${input.roeTTM.toFixed(1)}%)`,
      pillar1Lines: [
        `OCF/EBITDA: ${ocfToEbitdaRatio.toFixed(2)}x (OCF/NI ${input.ocfToNetIncomeRatio.toFixed(2)}x)`,
        `GP/A: ${input.grossProfitabilityToAssetsPct.toFixed(1)}% · ROE TTM ${input.roeTTM.toFixed(1)}%`,
        payoutLine
      ],
      pillar2PrimaryMetricLabel: `Net Debt/EBITDA ${netDebtToEbitdaRatio.toFixed(2)}x`,
      pillar2Lines: [
        `Net Debt/EBITDA: ${netDebtToEbitdaRatio.toFixed(2)}x (DER ${input.debtToEquityRatio.toFixed(2)}x)`,
        `Kapasitas Utang: ${netDebtToEbitdaRatio <= 2.5 ? 'Investment Grade Sehat' : 'Leverage Infra Moderat'}`,
        input.hscStatusLine
      ],
      academicStripCard1: {
        label: 'KONVERSI KAS EBITDA (HIGH D&A)',
        mainVal: `OCF/EBITDA ${ocfToEbitdaRatio.toFixed(2)}x`,
        subVal: `(ROE ${input.roeTTM.toFixed(1)}% · ROA ${trueRoaPct.toFixed(1)}%)`
      },
      academicStripCard3: {
        label: 'LEVERAGE INFRA (NET DEBT/EBITDA)',
        mainVal: `ND/EBITDA ${netDebtToEbitdaRatio.toFixed(2)}x`,
        subVal: `(OCF/NI ${input.ocfToNetIncomeRatio.toFixed(2)}x · DER ${input.debtToEquityRatio.toFixed(2)}x)`
      },
      adjustedBalanceSheetHealthScore
    };
  }

  // ============================================================================
  // REGIME 6: TECHNOLOGY / UNPROFITABLE GROWTH (LABA BERSIH NEGATIF ATAU TIPIS)
  // ============================================================================
  if (regime === 'TECH_UNPROFITABLE_GROWTH') {
    const isOperatingProfitNegative =
      input.operatingProfitTTMIdr <= 0 || input.netIncomeTTMIdr <= 0;

    return {
      regime: 'TECH_UNPROFITABLE_GROWTH',
      regimeShortLabel: 'GROWTH / TECH (SURVIVAL MODE)',
      regimeBadgeLabel: 'MODE SEKTOR: GROWTH/TECH',
      sectorMethodologyNotice:
        'Mode Growth/Tech (Laba Negatif): Model P/E & RIM diblokir; fokus beralih ke ketahanan kas (runway) dan jalur menuju profitabilitas operasional.',
      bypassedMetrics: ['Negative P/E Multiple', 'Negative Justified PBV / RIM Extrapolation'],
      activeMetrics: [
        'Cash Runway & Balance Sheet Survival',
        'Net Cash / Book Value Floor',
        'Operating Profit Breakeven Path'
      ],
      isGpaBypassed: false,
      isOcfNiAccrualBypassed: false,
      isCorporateDerBypassed: false,
      isEvEbitdaBypassed: true,
      isRoicCapexBypassed: true,
      isPeAndRimBlockedByNegativeProfit: isOperatingProfitNegative,
      isGradeCappedAtCByUnprofitableTech: isOperatingProfitNegative,
      isCyclePeakWarning: false,
      isPsak72AccrualRelaxed: false,
      effectiveAccrualPenaltyPts: input.rawAccrualPenaltyPts,
      trueRoaPct,
      assetLeverageRatio,
      netDebtIdr,
      netDebtToEquityRatio,
      netDebtToEbitdaRatio,
      ocfToEbitdaRatio,
      cashRunwayYears,
      pillar1Title: '1. Jalur Profitabilitas',
      pillar2Title: '2. Cash Runway & Neraca',
      pillar3Title: '3. Book Floor & Survival',
      pillar4Title: '4. 1/β Barbell Position Sizing',
      pillar1PrimaryMetricLabel: `ROE TTM ${input.roeTTM.toFixed(1)}% · GP/A ${input.grossProfitabilityToAssetsPct.toFixed(1)}%`,
      pillar1Lines: [
        `Status EBIT: ${input.operatingProfitTTMIdr > 0 ? 'Operasional Positif' : 'Rugi Operasional (Cap Grade C)'}`,
        `GP/A: ${input.grossProfitabilityToAssetsPct.toFixed(1)}% · OCF/NI ${input.ocfToNetIncomeRatio.toFixed(2)}x`,
        payoutLine
      ],
      pillar2PrimaryMetricLabel: `Cash Runway ~${cashRunwayYears.toFixed(1)} Thn`,
      pillar2Lines: [
        `Cash Runway: ~${cashRunwayYears.toFixed(1)} Tahun (DER ${input.debtToEquityRatio.toFixed(2)}x)`,
        `Ketahanan Kas: ${cashRunwayYears >= 3.0 ? 'Cadangan Kas Aman' : 'Waspada Burn Rate'}`,
        input.hscStatusLine
      ],
      academicStripCard1: {
        label: 'JALUR PROFITABILITAS TECH',
        mainVal: `GP/A ${input.grossProfitabilityToAssetsPct.toFixed(1)}%`,
        subVal: `(ROA ${trueRoaPct.toFixed(1)}% · ROE ${input.roeTTM.toFixed(1)}%)`
      },
      academicStripCard3: {
        label: 'CASH RUNWAY & SURVIVAL',
        mainVal: `Runway ~${cashRunwayYears.toFixed(1)} Thn`,
        subVal: '(P/E & RIM Negatif Diblokir · Cap Grade C)'
      }
    };
  }

  // ============================================================================
  // REGIME 5: CORE CORPORATE (HEALTHCARE, CONSUMER NON-CYCLICALS, CYCLICALS, INDUSTRIALS)
  // ============================================================================
  const is2StageCapexActive =
    input.capexToDaRatio > 1.5 && input.roicTTMPct > input.costOfEquityKePct;
  const ocfRuleTag =
    input.rawAccrualPenaltyPts > 0
      ? `(Penalti -${input.rawAccrualPenaltyPts} pts)`
      : is2StageCapexActive || input.effectiveModule === 'Capex_Aggressor'
      ? '(Lolos Rule B >0,50x)'
      : '(Kas Riil Sehat >0,80x)';

  return {
    regime: 'CORE_CORPORATE',
    regimeShortLabel: 'KORPORASI INTI (CORE CORPORATE)',
    regimeBadgeLabel: 'MODE SEKTOR: KORPORASI INTI',
    sectorMethodologyNotice:
      'Mode Korporasi Inti: Menggunakan GP/A Novy-Marx, validasi kas OCF/NI, serta evaluasi ekspansi 2-Stage RI bila ROIC > Ke.',
    bypassedMetrics: [],
    activeMetrics: [
      'Novy-Marx GP/A',
      'OCF/NI Anti-Junk',
      'DER & Cash Buffer',
      'Quality P/E + Justified PBV + EV/EBITDA Band 5Y',
      ...(is2StageCapexActive ? ['2-Stage Capex Aggressor RI (CapEx/D&A > 1.5x & ROIC > Ke)'] : [])
    ],
    isGpaBypassed: false,
    isOcfNiAccrualBypassed: false,
    isCorporateDerBypassed: false,
    isEvEbitdaBypassed: false,
    isRoicCapexBypassed: false,
    isPeAndRimBlockedByNegativeProfit: false,
    isGradeCappedAtCByUnprofitableTech: false,
    isCyclePeakWarning: false,
    isPsak72AccrualRelaxed: false,
    effectiveAccrualPenaltyPts: input.rawAccrualPenaltyPts,
    trueRoaPct,
    assetLeverageRatio,
    netDebtIdr,
    netDebtToEquityRatio,
    netDebtToEbitdaRatio,
    ocfToEbitdaRatio,
    cashRunwayYears,
    pillar1Title: '1. Gross Profit & Anti-Junk',
    pillar2Title: '2. Kesehatan Neraca',
    pillar3Title: '3. Justified PBV & Kurva SBN',
    pillar4Title: '4. 1/β Barbell Position Sizing',
    pillar1PrimaryMetricLabel: `GP/A ${input.grossProfitabilityToAssetsPct.toFixed(1)}% · ROE ${input.roeTTM.toFixed(1)}%`,
    pillar1Lines: [
      `GP/A (Novy-Marx): ${input.grossProfitabilityToAssetsPct.toFixed(1)}% (ROE TTM ${input.roeTTM.toFixed(1)}%)`,
      `OCF/NI (Anti-Junk): ${input.ocfToNetIncomeRatio.toFixed(2)}x ${ocfRuleTag}`,
      payoutLine
    ],
    pillar2PrimaryMetricLabel: `DER ${input.debtToEquityRatio.toFixed(2)}x`,
    pillar2Lines: [
      `DER: ${input.debtToEquityRatio.toFixed(2)}x (True ROA ${trueRoaPct.toFixed(1)}%)`,
      `Status Neraca: ${input.debtToEquityRatio <= 0.8 ? 'Konservatif' : 'Moderat/Tinggi'}`,
      input.hscStatusLine
    ],
    academicStripCard1: {
      label: 'GP/A (NOVY-MARX) & DUPONT',
      mainVal: `GP/A ${input.grossProfitabilityToAssetsPct.toFixed(1)}%`,
      subVal: `(ROA ${trueRoaPct.toFixed(1)}% · Lev ${assetLeverageRatio.toFixed(2)}x)`
    },
    academicStripCard3: {
      label: 'ANTI-JUNK (QMJ ACCRUAL)',
      mainVal: `OCF/NI ${input.ocfToNetIncomeRatio.toFixed(2)}x`,
      subVal:
        input.rawAccrualPenaltyPts > 0
          ? `(Penalti Akrual -${input.rawAccrualPenaltyPts} pts)`
          : is2StageCapexActive || input.effectiveModule === 'Capex_Aggressor'
          ? '(0 Penalti · Rule B Capex >0,50x)'
          : '(0 Penalti · Rule A Kas >0,80x)'
    }
  };
}
