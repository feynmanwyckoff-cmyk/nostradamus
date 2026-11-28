/**
 * ============================================================================
 * NOSTRADAMUS QUANT TERMINAL (IHSG) — TWO-STAGE SECTOR CLASSIFIER (SSOT)
 * ============================================================================
 * Produces the canonical `SectorClassificationResult` (wrapping `SectorProfile`)
 * via a deterministic two-stage pipeline:
 *
 * Stage 0: Manual User Override (`USER_OVERRIDE` with explicit audit trail)
 * Stage 1: Structural Classification (`IdxSectorEnum` + `IdxSubIndustryEnum` from
 *          the 957-issuer catalog — zero loose string matching)
 * Stage 2: Controlled Data-Driven Evaluation:
 *          - Cyclicality Score (5Y ROE std / CV laba / spread TTM vs 5Y)
 *          - Verified Capital Intensity (real CapEx & D&A + ROIC > Ke; blocks synthetic CWIP)
 *          - Cyclical Trough vs Peak Mode (loss-making cyclicals stay in cyclical trough mode,
 *            NEVER mislabeled as TECH_UNPROFITABLE_GROWTH)
 *          - Sector-Specific Data Completeness Gate (caps incomplete bank regulatory data
 *            at Grade B <= 74 with 'DATA BANK TIDAK LENGKAP', never printing 'CAR Sehat'
 *            without actual CAR%)
 */

import {
  ALL_IDX_SECTORS,
  IdxSectorEnum,
  IdxSubIndustryEnum,
  LegacySectorMethodologyRegime,
  SECTOR_PROFILES,
  SectorArchetypeId,
  SectorProfile,
  SUB_INDUSTRY_TO_ARCHETYPE_MAP
} from '../config/sectorProfiles';
import {
  FULL_JCI_EMITEN_CATALOG,
  getEmitenCatalogEntry,
  resolveStructuredIdxSubIndustry
} from '../data/idxAllEmitenCatalog';
import type { ValuationModuleRoute } from '../types/quant';

export type ClassificationConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW_CONSERVATIVE';

export type EmitenCycleMode =
  | 'NORMAL_OPERATING'
  | 'CYCLICAL_PEAK_WARNING'
  | 'TROUGH_NORMALIZED'
  | 'PRE_PROFIT_SPECULATIVE';

export interface SectorClassifierInput {
  ticker: string;
  sector?: string;
  subIndustry?: IdxSubIndustryEnum;
  userSectorArchetypeOverride?: SectorArchetypeId;
  // Core earnings & profitability
  netIncomeTTMIdr?: number;
  operatingProfitTTMIdr?: number;
  ebitdaTTMIdr?: number;
  revenueTTMIdr?: number;
  equityAttributableIdr?: number;
  totalAssetsIdr?: number;
  totalDebtIdr?: number;
  cashAndEquivalentsIdr?: number;
  ocfTTMIdr?: number;
  capexTTMIdr?: number;
  daTTMIdr?: number;
  roeTTM?: number;
  roeAvg3YPct?: number;
  roeAvg5YPct?: number;
  roeMedian5YPct?: number;
  roeStdDev5YPct?: number;
  earningsCv5Y?: number;
  roicTTMPct?: number;
  costOfEquityKePct?: number;
  grossProfitabilityToAssetsPct?: number;
  ocfToNetIncomeRatio?: number;
  debtToEquityRatio?: number;
  // CapEx & CWIP provenance
  cwipToAssetsRatio?: number;
  capexToDaRatio?: number;
  capexToRevenueRatio?: number;
  hasVerifiedCapexAndDa?: boolean;
  isCoreFundamentalsSeed?: boolean;
  accrualPenaltyScore?: number;
  // OJK Banking / Multifinance Regulatory Metrics (optional)
  nimPct?: number;
  nplPct?: number;
  carPct?: number;
  bopoPct?: number;
  ldrPct?: number;
  casaPct?: number;
  costOfCreditPct?: number;
}

export interface SectorClassificationResult {
  ticker: string;
  sectorEnum: IdxSectorEnum;
  subIndustryEnum: IdxSubIndustryEnum;
  subIndustry: IdxSubIndustryEnum;
  archetype: SectorArchetypeId;
  subArchetype: string;
  profile: SectorProfile;
  legacyRegime: LegacySectorMethodologyRegime;
  classificationStage: 'STAGE_0_USER_OVERRIDE' | 'STAGE_1_STRUCTURAL' | 'STAGE_2_DATA_DRIVEN' | 'CONSERVATIVE_FALLBACK';
  classificationConfidence: ClassificationConfidenceLevel;
  classificationReasons: string[];
  // Cycle & Profitability State (Closes Finding C)
  cycleMode: EmitenCycleMode;
  isUnprofitable: boolean;
  isCyclicalTroughMode: boolean;
  isCyclicalPeakWarning: boolean;
  isPreProfitTechSpeculative: boolean;
  // CapEx & Module Routing State (Closes Finding A & Finding D)
  resolvedValuationRoute: ValuationModuleRoute;
  resolvedAppliedModule: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  hasVerifiedCapexAndDa: boolean;
  isCapexOverrideTriggered: boolean;
  isSyntheticCapexBlocked: boolean;
  isQualityCompounderOverride?: boolean;
  // Ohlson-Penman Persistence SSOT (Closes Finding A omega mismatch)
  resolvedOmega: number;
  resolvedFadeYears: number;
  resolvedOmegaTierLabel: string;
  // Data-driven diagnostics
  cyclicalityScore: number;
  capitalIntensityScore: number;
  // Sector Data Completeness Gate (Confirmed Decision 2)
  isBankRegulatoryDataMissing: boolean;
  isSectorDataIncomplete: boolean;
  sectorDataFlags: string[];
  maxAllowedGradeBySectorData: 'A+ (CORE CONVICTION)' | 'B (WATCHLIST / HOLD)' | 'C (SPECULATIVE)';
  maxAllowedScoreBySectorData: number;
  // Business-Model-Matched StatArb Peer
  resolvedStatArbPeerTicker: string;
}

/**
 * Branded Consumer-Like / Quality Compounder issuers residing in IDX-IC Basic Materials or Industrials
 * whose business model is B2C branded building/packaging/sanitary products rather than commodity price-takers.
 */
export const BRANDED_QUALITY_COMPOUNDER_CYCLICAL_TICKERS = new Set<string>([
  'AVIA', // Avia Avian Tbk (Branded Architectural Paint — Basic Materials)
  'ARNA', // Arwana Citramulia Tbk (Low-Cost Branded Ceramics — Industrials)
  'TOTO', // Surya Toto Indonesia Tbk (Branded Sanitaryware — Industrials)
  'PBID', // Panca Budi Idaman Tbk (Branded Consumer Packaging — Basic Materials)
  'IMPC'  // Impack Pratama Industri Tbk (Branded Roofing & Building Materials — Industrials)
]);

/**
 * Issuers in IDX-IC parent sectors that have NO true same-business-model & cointegrated twin on BEI.
 * Pairing these with commodity mines, pulp mills, or petrochemical crackers is strictly prohibited.
 */
export const STANDALONE_NO_STATARB_PEER_TICKERS = new Set<string>([
  'AVIA' // Only large-cap pure-play architectural paint compounder in Basic Materials
]);

/**
 * Curated OJK Banking Regulatory Supplement for Major Audited IDX Banks
 * Only populated when verified from published FY/Q3 financial disclosures;
 * if an issuer is not in this supplement and has no user override, it triggers
 * `isBankRegulatoryDataMissing = true` -> `'DATA BANK TIDAK LENGKAP'`.
 */
export interface BankRegulatorySupplement {
  nimPct?: number;
  nplPct?: number;
  carPct?: number;
  bopoPct?: number;
  ldrPct?: number;
  casaPct?: number;
  costOfCreditPct?: number;
  asOfPeriod: string;
}

export const VERIFIED_BANK_REGULATORY_SUPPLEMENT: Record<string, BankRegulatorySupplement> = {
  // Intentionally left empty by default unless explicitly injected or overridden by user/snapshot
  // so that missing OJK banking metrics are transparently flagged as 'DATA BANK TIDAK LENGKAP'
  // rather than silently fabricated.
};

/**
 * Resolves Ohlson-Penman Abnormal Earnings Persistence (ω) and Fade Horizon (Years)
 * strictly from the issuer's `SectorProfile.omegaRange` and earnings quality adjustments.
 */
export function resolveProfileOmegaAndFade(params: {
  profile: SectorProfile;
  grossProfitabilityToAssetsPct?: number;
  ocfToNetIncomeRatio?: number;
  accrualPenaltyScore?: number;
  roeTTM?: number;
  costOfEquityKePct?: number;
  isCyclicalTroughMode?: boolean;
}): {
  rimPersistenceOmega: number;
  rimFadeYears: number;
  omegaTierLabel: string;
} {
  const { profile } = params;
  const gpaPct = params.grossProfitabilityToAssetsPct ?? 15.0;
  const ocfNi = params.ocfToNetIncomeRatio ?? 0.90;
  const accrualPen = params.accrualPenaltyScore ?? 0;

  const isCapexTolerant =
    profile.penaltyPolicy.accrualMode === 'CAPEX_TOLERANT_OCF_NI' ||
    profile.penaltyPolicy.accrualMode === 'PSAK72_RELAXED';
  const isBankBypass = profile.penaltyPolicy.accrualMode === 'BANK_PROVISION_BYPASS';

  const ocfOmegaAdj = isBankBypass
    ? Math.min(0.04, Math.max(-0.02, ((params.roeTTM ?? 15) - (params.costOfEquityKePct ?? 11)) * 0.005))
    : ocfNi >= 1.05
    ? Math.min(0.04, (ocfNi - 1.0) * 0.05)
    : isCapexTolerant && ocfNi > 0.50
    ? 0
    : ocfNi < 0.80
    ? -Math.min(0.06, (0.80 - Math.max(0, ocfNi)) * 0.08)
    : 0;

  const gpaBonus = isBankBypass ? 0.02 : Math.min(0.04, (Math.max(0, gpaPct) / 30.0) * 0.04);
  const accrualDrag = isBankBypass ? 0 : Math.min(0.05, accrualPen * 0.025);
  const troughAdj = params.isCyclicalTroughMode ? -0.02 : 0;

  const rawOmega = profile.omegaRange.base + gpaBonus + ocfOmegaAdj - accrualDrag + troughAdj;
  const clampedOmega = Number(
    Math.max(profile.omegaRange.min, Math.min(profile.omegaRange.max, rawOmega)).toFixed(2)
  );

  return {
    rimPersistenceOmega: clampedOmega,
    rimFadeYears: profile.omegaRange.fadeYears,
    omegaTierLabel: profile.omegaRange.tierLabel
  };
}

/**
 * Resolves the business-model-matched Statistical Arbitrage peer ticker from `profile.statArbPeerPool`.
 * Strictly enforces same sub-industry & economic driver. If no valid fundamental peer exists
 * (e.g., AVIA as a standalone architectural paint producer in Basic Materials), returns `'N/A'`.
 */
export function resolveProfileStatArbPeer(
  ticker: string,
  profile: SectorProfile,
  subIndustryEnum?: IdxSubIndustryEnum,
  isQualityCompounderOverride?: boolean
): string {
  const clean = (ticker || '').trim().toUpperCase().replace(/\.JK$/i, '');

  if (STANDALONE_NO_STATARB_PEER_TICKERS.has(clean)) {
    return 'N/A';
  }

  const subIndustryPools: Partial<Record<IdxSubIndustryEnum, readonly string[]>> = {
    [IdxSubIndustryEnum.PLANTATION_CPO]: ['AALI', 'LSIP', 'TAPG', 'DSNG', 'SIMP'],
    [IdxSubIndustryEnum.COAL_MINING]: ['ADRO', 'ITMG', 'PTBA', 'BSSR', 'UNTR'],
    [IdxSubIndustryEnum.OIL_GAS_ENERGY]: ['MEDC', 'PGAS', 'AKRA', 'ELSA'],
    [IdxSubIndustryEnum.METALS_MINING_DOWNSTREAM]: ['ANTM', 'INCO', 'MDKA', 'AMMN', 'NCKL', 'MBMA', 'TINS'],
    [IdxSubIndustryEnum.CEMENT_CHEMICALS_BASIC]: ['SMGR', 'INTP', 'TPIA', 'BRPT', 'ESSA'],
    [IdxSubIndustryEnum.PULP_PAPER_PACKAGING]: ['INKP', 'TKIM'],
    [IdxSubIndustryEnum.BANK_KBMI3_4]: ['BBCA', 'BMRI', 'BBRI', 'BBNI', 'BNGA', 'NISP'],
    [IdxSubIndustryEnum.BANK_MICRO_SHARIA]: ['BRIS', 'BTPS', 'ARTO', 'BANK', 'PNBS'],
    [IdxSubIndustryEnum.MULTIFINANCE]: ['ADMF', 'BFIN', 'CFIN', 'WOMF', 'MFIN']
  };

  if (clean === 'ARNA' || clean === 'TOTO') {
    return clean === 'ARNA' ? 'TOTO' : 'ARNA';
  }

  if (subIndustryEnum && subIndustryPools[subIndustryEnum]) {
    for (const candidate of subIndustryPools[subIndustryEnum]!) {
      if (candidate !== clean) {
        return candidate;
      }
    }
    return 'N/A';
  }

  // If overridden to Quality Compounder from Basic Materials/Industrials without a dedicated sub-industry peer pool, block cross-model commodity pairing
  if (
    isQualityCompounderOverride &&
    (profile.archetype === 'BASIC_MATERIALS_CYCLICAL' || profile.archetype === 'INDUSTRIALS_HOLDING')
  ) {
    return 'N/A';
  }

  const pool = profile.statArbPeerPool || [];
  for (const candidate of pool) {
    if (candidate !== clean && !STANDALONE_NO_STATARB_PEER_TICKERS.has(candidate)) {
      return candidate;
    }
  }
  return 'N/A';
}

/**
 * Master Two-Stage Sector Classifier (Single Source of Truth)
 */
export function classifyEmitenSectorProfile(
  input: SectorClassifierInput
): SectorClassificationResult {
  const cleanTicker = (input.ticker || '').trim().toUpperCase().replace(/\.JK$/i, '');
  const catalogEntry = getEmitenCatalogEntry(cleanTicker);
  const resolvedStruct = resolveStructuredIdxSubIndustry(
    cleanTicker,
    input.sector || catalogEntry?.sector
  );

  const sectorEnum: IdxSectorEnum = resolvedStruct.sector;
  const subIndustryEnum: IdxSubIndustryEnum =
    input.subIndustry ?? catalogEntry?.subIndustry ?? resolvedStruct.subIndustry;

  const reasons: string[] = [];
  let classificationStage: SectorClassificationResult['classificationStage'] = 'STAGE_1_STRUCTURAL';
  let classificationConfidence: ClassificationConfidenceLevel = 'HIGH';

  // ==========================================================================
  // STAGE 0 & STAGE 1: USER OVERRIDE OR DETERMINISTIC STRUCTURAL ARCHETYPE
  // ==========================================================================
  let archetype: SectorArchetypeId = SUB_INDUSTRY_TO_ARCHETYPE_MAP[subIndustryEnum] || 'CONSERVATIVE_FALLBACK';

  if (input.userSectorArchetypeOverride && SECTOR_PROFILES[input.userSectorArchetypeOverride]) {
    archetype = input.userSectorArchetypeOverride;
    classificationStage = 'STAGE_0_USER_OVERRIDE';
    reasons.push(`User Override manual ke archetype ${archetype}`);
  } else {
    reasons.push(
      `Stage 1 Struktural: IDX-IC '${sectorEnum}' -> Sub-Industri '${subIndustryEnum}' -> Archetype '${archetype}'`
    );
  }

  let profile: SectorProfile = SECTOR_PROFILES[archetype] || SECTOR_PROFILES.CONSERVATIVE_FALLBACK;

  // ==========================================================================
  // STAGE 2: DATA-DRIVEN EVALUATION (CYCLICALITY, DNA OVERRIDE, CAPEX, TROUGH)
  // ==========================================================================
  const roeTTM =
    typeof input.roeTTM === 'number' && Number.isFinite(input.roeTTM)
      ? input.roeTTM
      : catalogEntry?.defaultRoe ?? 12.0;
  const roeAvg5Y =
    typeof input.roeMedian5YPct === 'number' && Number.isFinite(input.roeMedian5YPct)
      ? input.roeMedian5YPct
      : typeof input.roeAvg5YPct === 'number' && Number.isFinite(input.roeAvg5YPct)
      ? input.roeAvg5YPct
      : roeTTM;
  const kePct =
    typeof input.costOfEquityKePct === 'number' && Number.isFinite(input.costOfEquityKePct)
      ? input.costOfEquityKePct
      : 11.0;
  const roicPct =
    typeof input.roicTTMPct === 'number' && Number.isFinite(input.roicTTMPct)
      ? input.roicTTMPct
      : roeTTM;

  const der =
    typeof input.debtToEquityRatio === 'number' && Number.isFinite(input.debtToEquityRatio)
      ? input.debtToEquityRatio
      : catalogEntry?.defaultDer ?? 0.50;
  const gpaPct =
    typeof input.grossProfitabilityToAssetsPct === 'number' &&
    Number.isFinite(input.grossProfitabilityToAssetsPct)
      ? input.grossProfitabilityToAssetsPct
      : BRANDED_QUALITY_COMPOUNDER_CYCLICAL_TICKERS.has(cleanTicker)
      ? Math.max(24.5, roeTTM * 1.35)
      : roeTTM / Math.max(1.0, 1 + der * 0.65);
  const ocfNi =
    typeof input.ocfToNetIncomeRatio === 'number' && Number.isFinite(input.ocfToNetIncomeRatio)
      ? input.ocfToNetIncomeRatio
      : BRANDED_QUALITY_COMPOUNDER_CYCLICAL_TICKERS.has(cleanTicker)
      ? 1.05
      : 0.90;

  // 2A. Cyclicality Score (0 - 100)
  const roeSpread5Y = Math.abs(roeTTM - roeAvg5Y);
  const roeStd5Y =
    typeof input.roeStdDev5YPct === 'number' && Number.isFinite(input.roeStdDev5YPct)
      ? input.roeStdDev5YPct
      : roeSpread5Y * 0.85;
  const earningsCv =
    typeof input.earningsCv5Y === 'number' && Number.isFinite(input.earningsCv5Y)
      ? input.earningsCv5Y
      : roeStd5Y / Math.max(5.0, Math.abs(roeAvg5Y));

  // 2B. TIER 2 QUANTITATIVE DNA OVERRIDE: QUALITY COMPOUNDER IN CYCLICAL SECTOR
  // Rule: If an issuer is in a cyclical/industrial sector (Basic Materials or Industrials)
  // AND is NOT an upstream commodity price-taker (Coal, Oil & Gas, CPO, Metals Mining)
  // AND exhibits stable Quality Compounder DNA:
  //   GP/A > 20%, DER < 0.50x, ROE TTM > 15%, OCF/NI >= 0.80x
  // THEN eject it from Pure_Cyclical and route to Quality Compounder (STEADY_COMPOUNDER / Compounder).
  const isUpstreamCommoditySubIndustry =
    subIndustryEnum === IdxSubIndustryEnum.COAL_MINING ||
    subIndustryEnum === IdxSubIndustryEnum.OIL_GAS_ENERGY ||
    subIndustryEnum === IdxSubIndustryEnum.PLANTATION_CPO ||
    subIndustryEnum === IdxSubIndustryEnum.METALS_MINING_DOWNSTREAM;

  const isEligibleCyclicalParentForDnaOverride =
    (sectorEnum === IdxSectorEnum.BASIC_MATERIALS || sectorEnum === IdxSectorEnum.INDUSTRIALS) &&
    !isUpstreamCommoditySubIndustry;

  const meetsQuantitativeQualityCompounderDna =
    gpaPct > 20.0 &&
    der < 0.50 &&
    roeTTM > 15.0 &&
    ocfNi >= 0.80 &&
    roeStd5Y <= 6.5;

  const isQualityCompounderOverride =
    input.userSectorArchetypeOverride === undefined &&
    isEligibleCyclicalParentForDnaOverride &&
    (meetsQuantitativeQualityCompounderDna ||
      (BRANDED_QUALITY_COMPOUNDER_CYCLICAL_TICKERS.has(cleanTicker) &&
        roeTTM > 15.0 &&
        der < 0.50));

  if (isQualityCompounderOverride) {
    profile = {
      ...SECTOR_PROFILES.CONSUMER_NON_CYCLICAL_FMCG,
      archetype: profile.archetype,
      subArchetype: 'TIER2_QUALITY_COMPOUNDER_OVERRIDE',
      displayName: `${profile.displayName} → Override Quality Compounder`,
      shortBadgeLabel: 'TIER-2 OVERRIDE: QUALITY COMPOUNDER',
      statArbPeerPool: profile.statArbPeerPool
    };
    classificationStage = 'STAGE_2_DATA_DRIVEN';
    reasons.push(
      `Tier-2 Quantitative DNA Override: Emiten di sektor '${sectorEnum}' memiliki DNA Quality Compounder (GP/A ${gpaPct.toFixed(1)}% > 20%, DER ${der.toFixed(2)}x < 0.50x, ROE TTM ${roeTTM.toFixed(1)}% > 15%, OCF/NI ${ocfNi.toFixed(2)}x ≥ 0.80x) → Dikeluarkan dari Pure Cyclical ke Quality Compounder (STEADY_COMPOUNDER)`
    );
  }

  const cyclicalityScore = Number(
    Math.min(
      100,
      Math.max(
        0,
        (isQualityCompounderOverride ? 18 : profile.isCyclicalArchetype ? 55 : 20) +
          roeStd5Y * 2.2 +
          earningsCv * 18
      )
    ).toFixed(1)
  );

  // 2C. Verified Capital Intensity vs Synthetic CWIP Block (Closes Finding D)
  const hasRealCapex =
    typeof input.capexTTMIdr === 'number' && Number.isFinite(input.capexTTMIdr) && input.capexTTMIdr > 0;
  const hasRealDa =
    typeof input.daTTMIdr === 'number' && Number.isFinite(input.daTTMIdr) && input.daTTMIdr > 0;
  const hasVerifiedCapexAndDa =
    input.hasVerifiedCapexAndDa !== undefined
      ? input.hasVerifiedCapexAndDa
      : Boolean(hasRealCapex && hasRealDa && !input.isCoreFundamentalsSeed);

  const realCapexToDa =
    hasRealCapex && hasRealDa ? Number((input.capexTTMIdr! / input.daTTMIdr!).toFixed(2)) : null;
  const realCapexToRev =
    hasRealCapex && typeof input.revenueTTMIdr === 'number' && input.revenueTTMIdr > 0
      ? Number((input.capexTTMIdr! / input.revenueTTMIdr).toFixed(2))
      : null;

  const reportedCapexToDa = realCapexToDa ?? input.capexToDaRatio ?? 1.0;
  const reportedCapexToRev = realCapexToRev ?? input.capexToRevenueRatio ?? 0.04;
  const capitalIntensityScore = Number(
    Math.min(100, Math.max(0, reportedCapexToDa * 18 + reportedCapexToRev * 120)).toFixed(1)
  );

  let resolvedValuationRoute: ValuationModuleRoute = isQualityCompounderOverride
    ? 'STEADY_COMPOUNDER'
    : profile.valuationRoute;
  let resolvedAppliedModule: SectorClassificationResult['resolvedAppliedModule'] =
    isQualityCompounderOverride ? 'Compounder' : profile.appliedModule;
  let isCapexOverrideTriggered = false;
  let isSyntheticCapexBlocked = false;

  const isHighCapexRatio = reportedCapexToDa > 3.0 || reportedCapexToRev > 0.15;
  const isRoicAboveKe = roicPct >= kePct - 0.5;

  if (profile.requiresVerifiedRoicForCapexModule && resolvedValuationRoute === 'CAPEX_AGGRESSOR') {
    // Archetypes like METALS_DOWNSTREAM or HEALTHCARE_HOSPITALS require verified CapEx/D&A & ROIC >= Ke
    if (!hasVerifiedCapexAndDa || !isRoicAboveKe) {
      resolvedValuationRoute = profile.isCyclicalArchetype ? 'PURE_CYCLICAL' : 'STEADY_COMPOUNDER';
      resolvedAppliedModule = profile.isCyclicalArchetype ? 'Pure_Cyclical' : 'Compounder';
      if (!hasVerifiedCapexAndDa && isHighCapexRatio) {
        isSyntheticCapexBlocked = true;
      }
      reasons.push(
        `Stage 2 Guardrail (Finding D): Modul Capex_Aggressor dinonaktifkan karena ${
          !hasVerifiedCapexAndDa
            ? 'data CapEx/D&A belum terverifikasi (blokir imputasi CWIP sintetik)'
            : `ROIC (${roicPct.toFixed(1)}%) < Ke (${kePct.toFixed(1)}%)`
        }; dialihkan ke ${resolvedAppliedModule}`
      );
    }
  } else if (isHighCapexRatio && resolvedValuationRoute !== 'CAPEX_AGGRESSOR' && !isQualityCompounderOverride) {
    // Data-driven CapEx override check for non-Capex base profiles
    if (hasVerifiedCapexAndDa && isRoicAboveKe && sectorEnum !== IdxSectorEnum.FINANCIALS) {
      resolvedValuationRoute = 'CAPEX_AGGRESSOR';
      resolvedAppliedModule = 'Capex_Aggressor';
      isCapexOverrideTriggered = true;
      classificationStage = 'STAGE_2_DATA_DRIVEN';
      reasons.push(
        `Stage 2 Data-Driven Override: CapEx/D&A terverifikasi (${reportedCapexToDa.toFixed(2)}x) & ROIC (${roicPct.toFixed(1)}%) > Ke (${kePct.toFixed(1)}%) -> Capex_Aggressor`
      );
    } else if (!hasVerifiedCapexAndDa) {
      isSyntheticCapexBlocked = true;
      reasons.push(
        `Stage 2 Guardrail (Finding D): Rasio CapEx/D&A tinggi (${reportedCapexToDa.toFixed(2)}x) berasal dari imputasi sintetik CWIP — override Capex_Aggressor DIBLOKIR`
      );
    }
  }

  // 2D. Unprofitable & Cyclical Trough Mode Evaluation (Closes Finding C)
  const niTTM = input.netIncomeTTMIdr ?? 1;
  const opTTM = input.operatingProfitTTMIdr ?? 1;
  const isUnprofitable = niTTM <= 0 || opTTM <= 0 || roeTTM <= 1.0;

  let cycleMode: EmitenCycleMode = 'NORMAL_OPERATING';
  let isCyclicalTroughMode = false;
  let isCyclicalPeakWarning = false;
  let isPreProfitTechSpeculative = false;
  let legacyRegime: LegacySectorMethodologyRegime = isQualityCompounderOverride
    ? 'CORE_CORPORATE'
    : profile.legacyRegime;

  if (isUnprofitable) {
    if (profile.isCyclicalArchetype) {
      // CRITICAL FIX (Finding C): Cyclical/Commodity issuers with NI <= 0 NEVER turn into TECH_UNPROFITABLE_GROWTH!
      cycleMode = 'TROUGH_NORMALIZED';
      isCyclicalTroughMode = true;
      isPreProfitTechSpeculative = false;
      classificationStage = 'STAGE_2_DATA_DRIVEN';
      reasons.push(
        `Stage 2 Siklus (Finding C): Emiten siklikal (${profile.archetype}) sedang di fase Trough (NI/EBIT ≤ 0 atau ROE ≤ 1%) — tetap pada archetype siklikal dengan valuasi Normalized Mid-Cycle / Book Value (BUKAN Tech Unprofitable)`
      );
    } else if (profile.archetype === 'TECHNOLOGY') {
      cycleMode = 'PRE_PROFIT_SPECULATIVE';
      isPreProfitTechSpeculative = true;
      legacyRegime = 'TECH_UNPROFITABLE_GROWTH';
      reasons.push(
        `Stage 2 Pre-Profit Tech: Emiten Teknologi dengan laba negatif/tipis masuk mode PRE_PROFIT_SPECULATIVE (Grade Capped at C)`
      );
    } else if (
      profile.archetype !== 'BANK_MAJOR_MID' &&
      profile.archetype !== 'BANK_MICRO_SHARIA_MULTIFINANCE' &&
      profile.archetype !== 'INSURANCE'
    ) {
      // Non-cyclical, non-financial corporate that is loss-making: downgrade to conservative trough mode
      cycleMode = 'TROUGH_NORMALIZED';
      isCyclicalTroughMode = true;
      classificationConfidence = 'MEDIUM';
      reasons.push(
        `Stage 2 Defensif Rugi: Emiten non-siklikal mengalami kerugian TTM — dinilai dengan basis konservatif Normalized/Book Floor`
      );
    }
  } else if (
    profile.isCyclicalArchetype &&
    !isQualityCompounderOverride &&
    roeTTM > roeAvg5Y * 1.25 &&
    roeTTM >= 18.0
  ) {
    cycleMode = 'CYCLICAL_PEAK_WARNING';
    isCyclicalPeakWarning = true;
    reasons.push(
      `Stage 2 Siklus Puncak: ROE TTM (${roeTTM.toFixed(1)}%) melampaui 1.25x ROE 5Y (${roeAvg5Y.toFixed(1)}%) — aktifkan peringatan puncak siklus & normalisasi mid-cycle`
    );
  }

  // ==========================================================================
  // STAGE 3: SECTOR-SPECIFIC DATA COMPLETENESS GATE (CONFIRMED DECISION 2)
  // ==========================================================================
  const sectorDataFlags: string[] = [];
  let isBankRegulatoryDataMissing = false;
  let isSectorDataIncomplete = false;
  let maxAllowedGradeBySectorData: SectorClassificationResult['maxAllowedGradeBySectorData'] =
    'A+ (CORE CONVICTION)';
  let maxAllowedScoreBySectorData = 100;

  if (
    profile.archetype === 'BANK_MAJOR_MID' ||
    profile.archetype === 'BANK_MICRO_SHARIA_MULTIFINANCE'
  ) {
    const bankSupp = VERIFIED_BANK_REGULATORY_SUPPLEMENT[cleanTicker];
    const hasCar =
      (typeof input.carPct === 'number' && input.carPct > 0) ||
      (typeof bankSupp?.carPct === 'number' && bankSupp.carPct > 0);
    const hasNpl =
      (typeof input.nplPct === 'number' && input.nplPct >= 0) ||
      (typeof bankSupp?.nplPct === 'number' && bankSupp.nplPct >= 0);
    const hasNim =
      (typeof input.nimPct === 'number' && input.nimPct > 0) ||
      (typeof bankSupp?.nimPct === 'number' && bankSupp.nimPct > 0);

    if (!hasCar || !hasNpl || !hasNim) {
      isBankRegulatoryDataMissing = true;
      isSectorDataIncomplete = true;
      classificationConfidence = 'MEDIUM';
      sectorDataFlags.push('DATA BANK TIDAK LENGKAP');
      maxAllowedGradeBySectorData = 'B (WATCHLIST / HOLD)';
      maxAllowedScoreBySectorData = 74;
      reasons.push(
        `Gate Kelengkapan Data Bank: Rasio regulasi OJK (${[
          !hasNim ? 'NIM' : null,
          !hasNpl ? 'NPL/NPF' : null,
          !hasCar ? 'CAR/KPMM' : null
        ]
          .filter(Boolean)
          .join(', ')}) belum tersedia di payload — klaim 'CAR Sehat' dinonaktifkan & Grade dibatasi maksimal B (Skor ≤ 74)`
      );
    }
  }

  // Resolve Unified Ohlson-Penman Persistence (ω) and Fade Years from SectorProfile
  const omegaInfo = resolveProfileOmegaAndFade({
    profile,
    grossProfitabilityToAssetsPct: gpaPct,
    ocfToNetIncomeRatio: ocfNi,
    accrualPenaltyScore: input.accrualPenaltyScore,
    roeTTM,
    costOfEquityKePct: kePct,
    isCyclicalTroughMode
  });

  const resolvedStatArbPeerTicker = resolveProfileStatArbPeer(
    cleanTicker,
    profile,
    subIndustryEnum,
    isQualityCompounderOverride
  );

  return {
    ticker: cleanTicker,
    sectorEnum,
    subIndustryEnum,
    subIndustry: subIndustryEnum,
    archetype: profile.archetype,
    subArchetype: profile.subArchetype,
    profile,
    legacyRegime,
    classificationStage,
    classificationConfidence,
    classificationReasons: reasons,
    cycleMode,
    isUnprofitable,
    isCyclicalTroughMode,
    isCyclicalPeakWarning,
    isPreProfitTechSpeculative,
    resolvedValuationRoute,
    resolvedAppliedModule,
    hasVerifiedCapexAndDa,
    isCapexOverrideTriggered,
    isSyntheticCapexBlocked,
    isQualityCompounderOverride,
    resolvedOmega: omegaInfo.rimPersistenceOmega,
    resolvedFadeYears: omegaInfo.rimFadeYears,
    resolvedOmegaTierLabel: omegaInfo.omegaTierLabel,
    cyclicalityScore,
    capitalIntensityScore,
    isBankRegulatoryDataMissing,
    isSectorDataIncomplete,
    sectorDataFlags,
    maxAllowedGradeBySectorData,
    maxAllowedScoreBySectorData,
    resolvedStatArbPeerTicker
  };
}

/**
 * Automated Integrity Verification for Tests:
 * Verifies that 100% of entries in `FULL_JCI_EMITEN_CATALOG` have a valid `IdxSectorEnum`,
 * `IdxSubIndustryEnum`, and map deterministically to a valid `SectorProfile` (never undefined).
 */
export function verifyCatalogSectorProfileCoverage(): {
  totalCatalogEntries: number;
  validEntries: number;
  unmappedTickers: string[];
  archetypeDistribution: Record<string, number>;
} {
  const validSectorSet = new Set<string>(ALL_IDX_SECTORS);
  const unmappedTickers: string[] = [];
  const archetypeDistribution: Record<string, number> = {};

  for (const entry of FULL_JCI_EMITEN_CATALOG) {
    const hasValidSector = validSectorSet.has(entry.sector);
    const hasValidSubIndustry =
      Boolean(entry.subIndustry) && Boolean(SUB_INDUSTRY_TO_ARCHETYPE_MAP[entry.subIndustry!]);
    const classification = classifyEmitenSectorProfile({
      ticker: entry.ticker,
      sector: entry.sector,
      subIndustry: entry.subIndustry,
      roeTTM: entry.defaultRoe
    });

    if (
      !hasValidSector ||
      !hasValidSubIndustry ||
      !classification.profile ||
      classification.archetype === 'CONSERVATIVE_FALLBACK'
    ) {
      unmappedTickers.push(entry.ticker);
    } else {
      archetypeDistribution[classification.archetype] =
        (archetypeDistribution[classification.archetype] || 0) + 1;
    }
  }

  return {
    totalCatalogEntries: FULL_JCI_EMITEN_CATALOG.length,
    validEntries: FULL_JCI_EMITEN_CATALOG.length - unmappedTickers.length,
    unmappedTickers,
    archetypeDistribution
  };
}
