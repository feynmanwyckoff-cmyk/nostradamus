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

import {
  IdxSubIndustryEnum,
  SectorArchetypeId
} from '../config/sectorProfiles';
import {
  classifyEmitenSectorProfile,
  SectorClassificationResult
} from './sectorClassifier';

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
  subIndustry?: IdxSubIndustryEnum;
  userSectorArchetypeOverride?: SectorArchetypeId;
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
  hasVerifiedCapexAndDa?: boolean;
  isCoreFundamentalsSeed?: boolean;
  nimPct?: number;
  nplPct?: number;
  carPct?: number;
  bopoPct?: number;
}

export interface SectorMethodologyProfile {
  regime: SectorMethodologyRegime;
  archetype?: SectorArchetypeId;
  subArchetype?: string;
  classification?: SectorClassificationResult;
  isSectorDataIncomplete?: boolean;
  sectorDataFlags?: string[];
  maxAllowedGradeBySectorData?: 'A+ (CORE CONVICTION)' | 'B (WATCHLIST / HOLD)' | 'C (SPECULATIVE)';
  maxAllowedScoreBySectorData?: number;
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
 * Determines the IDX-IC Sector Methodology Regime for any issuer via the Two-Stage SectorClassifier SSOT.
 * Closes Finding B (ASSA -> INFRA_TELCO_UTILITIES / TRANSPORTATION_LOGISTICS) and
 * Finding C (Cyclical/Commodity issuers with NI <= 0 stay in CYCLICAL_COMMODITIES Trough Mode,
 * NEVER mislabeled as TECH_UNPROFITABLE_GROWTH).
 */
export function detectSectorMethodologyRegime(params: {
  ticker: string;
  sector: string;
  subSector?: string;
  subIndustry?: IdxSubIndustryEnum;
  netIncomeTTMIdr: number;
  operatingProfitTTMIdr: number;
  roeTTM: number;
}): SectorMethodologyRegime {
  const classification = classifyEmitenSectorProfile({
    ticker: params.ticker,
    sector: params.sector,
    subIndustry: params.subIndustry,
    netIncomeTTMIdr: params.netIncomeTTMIdr,
    operatingProfitTTMIdr: params.operatingProfitTTMIdr,
    roeTTM: params.roeTTM
  });
  return classification.legacyRegime;
}

/**
 * Master IDX-IC Sector-Aware Fundamental & Valuation Methodology Router (Consuming SectorProfile SSOT)
 */
export function resolveSectorMethodologyProfile(
  input: SectorMethodologyInput
): SectorMethodologyProfile {
  const classification = classifyEmitenSectorProfile({
    ticker: input.ticker,
    sector: input.sector,
    subIndustry: input.subIndustry,
    userSectorArchetypeOverride: input.userSectorArchetypeOverride,
    netIncomeTTMIdr: input.netIncomeTTMIdr,
    operatingProfitTTMIdr: input.operatingProfitTTMIdr,
    ebitdaTTMIdr: input.ebitdaTTMIdr,
    revenueTTMIdr: input.revenueTTMIdr,
    equityAttributableIdr: input.equityAttributableIdr,
    totalAssetsIdr: input.totalAssetsIdr,
    totalDebtIdr: input.totalDebtIdr,
    cashAndEquivalentsIdr: input.cashAndEquivalentsIdr,
    ocfTTMIdr: input.ocfTTMIdr,
    capexTTMIdr: input.capexTTMIdr,
    daTTMIdr: input.daTTMIdr,
    roeTTM: input.roeTTM,
    roeAvg5YPct: input.roeAvg5YPct,
    roicTTMPct: input.roicTTMPct,
    costOfEquityKePct: input.costOfEquityKePct,
    grossProfitabilityToAssetsPct: input.grossProfitabilityToAssetsPct,
    ocfToNetIncomeRatio: input.ocfToNetIncomeRatio,
    debtToEquityRatio: input.debtToEquityRatio,
    capexToDaRatio: input.capexToDaRatio,
    hasVerifiedCapexAndDa: input.hasVerifiedCapexAndDa,
    isCoreFundamentalsSeed: input.isCoreFundamentalsSeed,
    nimPct: input.nimPct,
    nplPct: input.nplPct,
    carPct: input.carPct,
    bopoPct: input.bopoPct
  });
  const regime = classification.legacyRegime;
  const baseFields = {
    archetype: classification.archetype,
    subArchetype: classification.subArchetype,
    classification,
    isSectorDataIncomplete: classification.isSectorDataIncomplete,
    sectorDataFlags: classification.sectorDataFlags,
    maxAllowedGradeBySectorData: classification.maxAllowedGradeBySectorData,
    maxAllowedScoreBySectorData: classification.maxAllowedScoreBySectorData
  };

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

    // Confirmed Decision 2: NEVER print "Permodalan Kuat (CAR Sehat)" when explicit CAR% is missing!
    const hasExplicitCar = typeof input.carPct === 'number' && input.carPct > 0;
    const hasExplicitNpl = typeof input.nplPct === 'number' && input.nplPct >= 0;
    const leverageStatusLabel = hasExplicitCar
      ? `CAR ${input.carPct!.toFixed(1)}%${hasExplicitNpl ? ` · NPL ${input.nplPct!.toFixed(1)}%` : ''}`
      : classification.isBankRegulatoryDataMissing
      ? `Leverage Aset ${assetLeverageRatio.toFixed(2)}x [DATA BANK TIDAK LENGKAP: CAR/NPL/NIM belum tersedia]`
      : assetLeverageRatio <= 8.5
      ? 'Leverage Aset Perbankan Konservatif'
      : assetLeverageRatio <= 11.0
      ? 'Leverage Perbankan Normal'
      : 'Leverage Aset Tinggi';

    return {
      ...baseFields,
      regime: 'FINANCIALS',
      regimeShortLabel: classification.profile.displayName.toUpperCase(),
      regimeBadgeLabel: classification.profile.shortBadgeLabel,
      sectorMethodologyNotice:
        `Mode Sektor ${classification.profile.displayName}: GP/A, OCF/NI, DER korporasi, & EV/EBITDA dinonaktifkan karena struktur DPK/kredit perbankan; kualitas diukur via ROE-Ke Spread & True ROA (NI/Assets).${
          classification.isBankRegulatoryDataMissing
            ? ' [CATATAN: Rasio regulasi OJK NIM/NPL/CAR belum tersedia di feed Yahoo — Grade dibatasi maks B]'
            : ''
        }`,
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
        subVal: classification.isBankRegulatoryDataMissing
          ? '(DATA BANK TIDAK LENGKAP · Cap Grade B)'
          : '(0 Penalti · Bypass OCF/NI & DER)'
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
    const roeAvg5Y = Math.max(1, input.roeAvg5YPct || Math.max(8.0, input.roeTTM * 0.85));
    const isCyclePeakWarning = classification.isCyclicalPeakWarning || input.roeTTM > roeAvg5Y * 1.35;
    const isTroughMode = classification.isCyclicalTroughMode;
    const cyclePeakWarningText = isCyclePeakWarning
      ? `CYCLE PEAK WARNING: ROE TTM (${input.roeTTM.toFixed(1)}%) melampaui 1.35× ROE Rata-Rata 5Y (${roeAvg5Y.toFixed(1)}%) — valuasi menggunakan normalisasi Through-the-Cycle untuk mencegah Value Trap puncak komoditas.`
      : isTroughMode
      ? `CYCLICAL TROUGH MODE: Emiten komoditas/siklikal sedang berada di titik bawah siklus (TTM NI/ROE tertekan) — dinilai dengan Normalized Mid-Cycle ROE (${roeAvg5Y.toFixed(1)}%) & Book Value, bukan Tech Unprofitable.`
      : undefined;

    return {
      ...baseFields,
      regime: 'CYCLICAL_COMMODITIES',
      regimeShortLabel: isCpo
        ? 'CPO & AGRI (SIKLIKAL/KOMODITAS)'
        : classification.profile.displayName.toUpperCase(),
      regimeBadgeLabel: classification.profile.shortBadgeLabel,
      sectorMethodologyNotice: isCpo
        ? `Mode Sektor Siklikal/Komoditas (Sub-Sektor CPO/Perkebunan): Meski tercatat di Consumer Non-Cyclicals IDX-IC, emiten sawit/CPO (${input.ticker}) dinilai dengan normalisasi ROE 3–5 tahun (through-the-cycle) & jangkar EV/EBITDA komoditas (~5.0x–6.0x, bukan 11.8x FMCG).`
        : isTroughMode
        ? `Mode Trough Siklikal (${classification.profile.displayName}): Laba TTM sedang berada di bawah siklus; valuasi menggunakan normalisasi laba mid-cycle (ROE 5Y ${roeAvg5Y.toFixed(1)}%) & Book Value Floor.`
        : `Mode Sektor ${classification.profile.displayName}: Valuasi menggunakan normalisasi laba 3–5 tahun (through-the-cycle) & jangkar EV/EBITDA untuk mencegah jebakan laba puncak siklus.`,
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
        `Norm ROE 5Y: ${roeAvg5Y.toFixed(1)}% · TTM ${input.roeTTM.toFixed(1)}%${isCyclePeakWarning ? ' [PEAK WARN]' : isTroughMode ? ' [TROUGH MODE]' : ''}`,
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
      ...baseFields,
      regime: 'PROPERTIES_REAL_ESTATE',
      regimeShortLabel: 'PROPERTIES (PSAK 72)',
      regimeBadgeLabel: classification.profile.shortBadgeLabel,
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
  // REGIME 4: INFRASTRUCTURE, UTILITIES, TELECOM & TRANSPORTATION/LOGISTICS
  // ============================================================================
  if (regime === 'INFRA_TELCO_UTILITIES') {
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

    const isTransport = classification.archetype === 'TRANSPORTATION_LOGISTICS';

    return {
      ...baseFields,
      regime: 'INFRA_TELCO_UTILITIES',
      regimeShortLabel: isTransport
        ? 'TRANSPORTASI & LOGISTIK (FLEET)'
        : 'INFRA / TELKO (HIGH D&A)',
      regimeBadgeLabel: classification.profile.shortBadgeLabel,
      sectorMethodologyNotice: isTransport
        ? 'Mode Sektor Transportasi & Logistik: Depresiasi armada/kapal tinggi mendistorsi P/E; valuasi dan leverage diukur menggunakan Fleet EV/EBITDA(R), OCF/EBITDA & Net Debt/EBITDA.'
        : 'Mode Sektor Infrastruktur/Telko: Depresiasi tinggi mendistorsi P/E; valuasi dan leverage diukur menggunakan EV/EBITDA & Net Debt/EBITDA.',
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
  // REGIME 6: TECHNOLOGY / UNPROFITABLE GROWTH (ONLY FOR TECH / PRE-PROFIT)
  // ============================================================================
  if (regime === 'TECH_UNPROFITABLE_GROWTH') {
    const isOperatingProfitNegative =
      classification.isPreProfitTechSpeculative ||
      input.operatingProfitTTMIdr <= 0 ||
      input.netIncomeTTMIdr <= 0;

    return {
      ...baseFields,
      regime: 'TECH_UNPROFITABLE_GROWTH',
      regimeShortLabel: 'GROWTH / TECH (SURVIVAL MODE)',
      regimeBadgeLabel: classification.profile.shortBadgeLabel,
      sectorMethodologyNotice:
        'Mode Growth/Tech: Evaluasi berfokus pada ketahanan kas (runway), efisiensi GP/A, dan jalur menuju profitabilitas operasional.',
      bypassedMetrics: ['Negative P/E Multiple', 'Negative Justified PBV / RIM Extrapolation'],
      activeMetrics: [
        'Cash Runway & Balance Sheet Survival',
        'Net Cash / Book Value Floor',
        'Operating Profit Breakeven Path'
      ],
      isGpaBypassed: false,
      isOcfNiAccrualBypassed: false,
      isCorporateDerBypassed: false,
      isEvEbitdaBypassed: isOperatingProfitNegative,
      isRoicCapexBypassed: isOperatingProfitNegative,
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
        subVal: isOperatingProfitNegative
          ? '(P/E & RIM Negatif Diblokir · Cap Grade C)'
          : `(OCF/NI ${input.ocfToNetIncomeRatio.toFixed(2)}x)`
      }
    };
  }

  // ============================================================================
  // REGIME 5: CORE CORPORATE (FMCG, PHARMA, HOSPITALS, AUTO/RETAIL/MEDIA, INDUSTRIALS)
  // ============================================================================
  const is2StageCapexActive =
    classification.resolvedAppliedModule === 'Capex_Aggressor';
  const ocfRuleTag =
    input.rawAccrualPenaltyPts > 0
      ? `(Penalti -${input.rawAccrualPenaltyPts} pts)`
      : is2StageCapexActive
      ? '(Lolos Rule B >0,50x)'
      : '(Kas Riil Sehat >0,80x)';

  return {
    ...baseFields,
    regime: 'CORE_CORPORATE',
    regimeShortLabel: classification.profile.displayName.toUpperCase(),
    regimeBadgeLabel: classification.profile.shortBadgeLabel,
    sectorMethodologyNotice: `Mode ${classification.profile.displayName}: Modul valuasi '${classification.resolvedAppliedModule}' (ω=${classification.resolvedOmega.toFixed(2)}, ${classification.resolvedFadeYears}Y Fade) dengan validasi GP/A Novy-Marx & kas OCF/NI.`,
    bypassedMetrics: classification.profile.bypassedMetrics,
    activeMetrics: [
      ...classification.profile.requiredMetrics,
      ...(is2StageCapexActive ? ['2-Stage Capex Aggressor RI (Verified CapEx/D&A & ROIC > Ke)'] : [])
    ],
    isGpaBypassed: false,
    isOcfNiAccrualBypassed: false,
    isCorporateDerBypassed: false,
    isEvEbitdaBypassed: false,
    isRoicCapexBypassed: false,
    isPeAndRimBlockedByNegativeProfit: false,
    isGradeCappedAtCByUnprofitableTech: false,
    isCyclePeakWarning: classification.isCyclicalPeakWarning,
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
          : is2StageCapexActive
          ? '(0 Penalti · Rule B Capex >0,50x)'
          : '(0 Penalti · Rule A Kas >0,80x)'
    }
  };
}
