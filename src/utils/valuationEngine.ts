import {
  EnsembleComponent,
  EnsembleValuationLeg,
  SectorValuationArchetype,
  StockMetrics,
  ValuationLedger,
  ValuationModuleRoute,
  ValuationReport
} from '../types/quant';
import {
  applyDispersionPenalty,
  buildRawTickerDataFromStock,
  buildTacticalOverlayFromStatArb,
  calculateHistoricalEvEbitda5YAnchor,
  calculateInvariantGrahamJoeliardiFloor,
  calculateTwoStageCapexAggressorRI,
  calculateVolatilityTargetedSizingAndStop,
  computeIdxTtmAndSnapshotFromQuarters,
  decumulateIDXQuarters,
  validateFundamentalSanity
} from './institutionalGuardrailsEngine';
import { classifyEmitenSectorProfile } from './sectorClassifier';

export {
  applyDispersionPenalty,
  buildRawTickerDataFromStock,
  buildTacticalOverlayFromStatArb,
  calculateHistoricalEvEbitda5YAnchor,
  calculateInvariantGrahamJoeliardiFloor,
  calculateTwoStageCapexAggressorRI,
  calculateVolatilityTargetedSizingAndStop,
  computeIdxTtmAndSnapshotFromQuarters,
  decumulateIDXQuarters,
  validateFundamentalSanity
};

export const CAPEX_ANOMALY_NOTIFICATION_TEXT =
  "⚠️ CAPEX ANOMALY DETECTED: Rasio belanja modal (Capex/D&A) melebihi batas normal (>3.0x). Sistem otomatis memindahkan emiten ini dari 'Pure Cyclical' ke modul 'Capex Aggressor' untuk memvaluasi proyeksi laba dari aset baru.";

/**
 * Calibrated Capital Work in Progress (CWIP / Total Assets) Registry for Capex Aggressors
 * Identifies issuers building smelters, downstream industrial facilities, hospitals, or fiber/tower networks.
 */
export const CALIBRATED_CWIP_TO_ASSETS_MAP: Record<string, number> = {
  ADMR: 0.28, // Aluminium smelter & coking coal infrastructure expansion
  AMMN: 0.31, // Copper smelter & Elang project CapEx phase
  NCKL: 0.24, // HPAL & RKEF rotary kiln nickel smelter expansion
  INCO: 0.22, // Sorowako, Bahodopi & Pomalaa HPAL smelter projects
  MDKA: 0.26, // Pani Gold Project & acid iron metal HPAL CapEx
  MBMA: 0.27, // Nickel matte & HPAL industrial park CapEx
  BRMS: 0.21, // Poboya underground gold mill expansion
  ANTM: 0.17, // Ferronickel & EV battery ecosystem joint ventures
  BRPT: 0.19, // Petrochemical & geothermal expansion
  TPIA: 0.25, // CAP2 chlor-alkali & ethylene cracker complex
  ESSA: 0.16, // Blue ammonia & downstream chemical optimization
  HEAL: 0.18, // Greenfield hospital network expansion across Indonesia
  MIKA: 0.16, // New hospital wings & oncology/radiotherapy centers
  SILO: 0.16, // Tier-1 specialist hospital equipment & bed capacity CapEx
  PRDA: 0.15, // Esoteric molecular lab & digital clinic rollout
  TLKM: 0.16, // Data center (NeutraDC) & FMC fiber backbone CapEx
  ISAT: 0.17, // 5G spectrum & AI data center infrastructure
  EXCL: 0.17, // Fixed-mobile convergence (FMC) fiber rollout
  TOWR: 0.18, // Fiber-to-the-tower (FTTT) expansion
  TBIG: 0.17, // Telecom tower & fiber optic co-location rollout
  MTEL: 0.16, // Rural telecom tower acquisition & fiberization
  JSMR: 0.23, // Trans-Java & Jabodetabek toll road concessions under construction
  PANI: 0.29  // PIK 2 mega-township landbank & commercial development
};

/**
 * Calibrated 10-Year Historical PBV Mean & Standard Deviation for Pure Cyclicals & Property
 * Used to compute PBV Z-Score and trigger "STRONG BUY" only when Current PBV Z-Score <= -1.5σ.
 */
export const CALIBRATED_CYCLICAL_10Y_PBV_STATS: Record<
  string,
  { meanPbv10Y: number; stdDevPbv10Y: number; normalizedMidCycleRoePct: number }
> = {
  ADRO: { meanPbv10Y: 1.38, stdDevPbv10Y: 0.36, normalizedMidCycleRoePct: 16.5 },
  ITMG: { meanPbv10Y: 1.52, stdDevPbv10Y: 0.42, normalizedMidCycleRoePct: 18.2 },
  PTBA: { meanPbv10Y: 1.65, stdDevPbv10Y: 0.45, normalizedMidCycleRoePct: 17.0 },
  HRUM: { meanPbv10Y: 1.48, stdDevPbv10Y: 0.44, normalizedMidCycleRoePct: 14.5 },
  INDY: { meanPbv10Y: 0.92, stdDevPbv10Y: 0.32, normalizedMidCycleRoePct: 11.2 },
  BUMI: { meanPbv10Y: 1.15, stdDevPbv10Y: 0.48, normalizedMidCycleRoePct: 10.5 },
  MBAP: { meanPbv10Y: 1.60, stdDevPbv10Y: 0.46, normalizedMidCycleRoePct: 16.8 },
  PGAS: { meanPbv10Y: 1.18, stdDevPbv10Y: 0.34, normalizedMidCycleRoePct: 12.4 },
  MEDC: { meanPbv10Y: 1.24, stdDevPbv10Y: 0.38, normalizedMidCycleRoePct: 14.8 },
  ELSA: { meanPbv10Y: 0.96, stdDevPbv10Y: 0.26, normalizedMidCycleRoePct: 11.8 },
  AKRA: { meanPbv10Y: 2.15, stdDevPbv10Y: 0.45, normalizedMidCycleRoePct: 17.5 },
  UNTR: { meanPbv10Y: 1.58, stdDevPbv10Y: 0.38, normalizedMidCycleRoePct: 17.8 },
  TAPG: { meanPbv10Y: 1.62, stdDevPbv10Y: 0.36, normalizedMidCycleRoePct: 17.4 },
  LSIP: { meanPbv10Y: 1.08, stdDevPbv10Y: 0.28, normalizedMidCycleRoePct: 11.8 },
  AALI: { meanPbv10Y: 1.12, stdDevPbv10Y: 0.31, normalizedMidCycleRoePct: 10.8 },
  DSNG: { meanPbv10Y: 1.32, stdDevPbv10Y: 0.35, normalizedMidCycleRoePct: 14.2 },
  SSMS: { meanPbv10Y: 1.75, stdDevPbv10Y: 0.42, normalizedMidCycleRoePct: 16.0 },
  INKP: { meanPbv10Y: 0.95, stdDevPbv10Y: 0.28, normalizedMidCycleRoePct: 12.8 },
  TKIM: { meanPbv10Y: 1.05, stdDevPbv10Y: 0.32, normalizedMidCycleRoePct: 12.2 },
  CTRA: { meanPbv10Y: 1.28, stdDevPbv10Y: 0.34, normalizedMidCycleRoePct: 11.5 },
  BSDE: { meanPbv10Y: 0.98, stdDevPbv10Y: 0.28, normalizedMidCycleRoePct: 10.2 },
  PWON: { meanPbv10Y: 1.45, stdDevPbv10Y: 0.36, normalizedMidCycleRoePct: 12.8 },
  SMRA: { meanPbv10Y: 1.35, stdDevPbv10Y: 0.38, normalizedMidCycleRoePct: 10.6 },
  DMAS: { meanPbv10Y: 1.42, stdDevPbv10Y: 0.32, normalizedMidCycleRoePct: 15.2 },
  ANTM: { meanPbv10Y: 1.48, stdDevPbv10Y: 0.42, normalizedMidCycleRoePct: 11.8 },
  INCO: { meanPbv10Y: 1.35, stdDevPbv10Y: 0.38, normalizedMidCycleRoePct: 11.2 },
  MDKA: { meanPbv10Y: 2.85, stdDevPbv10Y: 0.72, normalizedMidCycleRoePct: 10.5 },
  TINS: { meanPbv10Y: 1.26, stdDevPbv10Y: 0.44, normalizedMidCycleRoePct: 10.8 },
  NCKL: { meanPbv10Y: 1.85, stdDevPbv10Y: 0.45, normalizedMidCycleRoePct: 18.5 },
  MBMA: { meanPbv10Y: 1.92, stdDevPbv10Y: 0.48, normalizedMidCycleRoePct: 12.0 },
  AMMN: { meanPbv10Y: 3.40, stdDevPbv10Y: 0.85, normalizedMidCycleRoePct: 15.4 },
  ADMR: { meanPbv10Y: 2.65, stdDevPbv10Y: 0.62, normalizedMidCycleRoePct: 22.0 },
  BSSR: { meanPbv10Y: 2.10, stdDevPbv10Y: 0.52, normalizedMidCycleRoePct: 24.0 },
  SMGR: { meanPbv10Y: 1.25, stdDevPbv10Y: 0.35, normalizedMidCycleRoePct: 9.8 },
  INTP: { meanPbv10Y: 1.55, stdDevPbv10Y: 0.40, normalizedMidCycleRoePct: 11.2 }
};

const KBMI4_AND_CONSUMER_MONOPOLY_TICKERS = new Set([
  'BBCA',
  'BBRI',
  'BMRI',
  'BBNI',
  'ICBP',
  'INDF',
  'MYOR',
  'AMRT',
  'CMRY',
  'UNVR',
  'SIDO',
  'KLBF',
  'GGRM',
  'HMSP',
  'MLBI',
  'DLTA'
]);

const CPO_AGRI_TICKERS = new Set([
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
  'PGUN',
  'JARR'
]);

const METALS_HILIRISASI_TICKERS = new Set([
  'ADMR',
  'AMMN',
  'INCO',
  'MDKA',
  'NCKL',
  'MBMA',
  'BRMS',
  'ANTM',
  'TINS',
  'PSAB',
  'BRPT',
  'TPIA',
  'ESSA',
  'NICL',
  'DKFT',
  'IFSH'
]);

/**
 * 1. INTERCEPTOR PENYETAHUNAN LABA (Earnings Annualizer)
 * Intercepts YTD quarterly net income / EPS (Q1/Q2/Q3/Q4).
 * - Q1 (3M) -> multiplies YTD EPS by 4/1 (4.00x)
 * - Q2 (6M) -> multiplies YTD EPS by 4/2 (2.00x)
 * - Q3 (9M) -> multiplies YTD EPS by 4/3 (1.3333x)
 * - Q4 (12M) -> multiplies by 4/4 (1.00x)
 * Computes Forward EPS, Forward ROE, and forward growth rate (g) so breakout issuers
 * are not dragged down by lagging trailing metrics.
 */
export function annualizeQuarterlyEarnings(params: {
  quarterLabel?: string;
  ytdCumulativeEpsIdr?: number;
  trailingEpsIdr: number;
  bvpsIdr: number;
  trailingRoePct: number;
  earningsGrowthYoYPct: number;
  historicalDprPct: number;
  costOfEquityPct: number;
}): {
  detectedQuarter: 1 | 2 | 3 | 4;
  annualizationFactor: number; // 4/1, 4/2, 4/3, or 1
  forwardEpsIdr: number;
  forwardRoePct: number;
  forwardSustainableGrowthPct: number;
} {
  const {
    quarterLabel = 'Q3-2026 (9M26 Annualized)',
    ytdCumulativeEpsIdr,
    trailingEpsIdr,
    bvpsIdr,
    trailingRoePct,
    earningsGrowthYoYPct,
    historicalDprPct,
    costOfEquityPct
  } = params;

  const upperLabel = quarterLabel.toUpperCase();
  let detectedQuarter: 1 | 2 | 3 | 4 = 3;
  if (upperLabel.includes('Q1') || upperLabel.includes('3M')) {
    detectedQuarter = 1;
  } else if (upperLabel.includes('Q2') || upperLabel.includes('6M') || upperLabel.includes('1H')) {
    detectedQuarter = 2;
  } else if (upperLabel.includes('Q4') || upperLabel.includes('FY') || upperLabel.includes('12M')) {
    detectedQuarter = 4;
  } else {
    detectedQuarter = 3;
  }

  // Exact quarterly multiplier: Q1 -> 4/1, Q2 -> 4/2, Q3 -> 4/3, Q4 -> 4/4
  const annualizationFactor = 4 / detectedQuarter;
  const safeBvps = Math.max(10, bvpsIdr);

  let forwardEpsIdr: number;
  if (typeof ytdCumulativeEpsIdr === 'number' && ytdCumulativeEpsIdr > 0) {
    forwardEpsIdr = Math.max(2, Math.round(ytdCumulativeEpsIdr * annualizationFactor));
  } else {
    // Derive cumulative YTD EPS from trailing baseline + YoY quarterly momentum, then multiply by (4 / Quarter)
    const momentumBlend =
      earningsGrowthYoYPct > 0
        ? 1 + Math.min(0.48, (earningsGrowthYoYPct / 100) * 0.78)
        : 1 + Math.max(-0.25, (earningsGrowthYoYPct / 100) * 0.5);
    const estimatedYtdEps = (trailingEpsIdr * (detectedQuarter / 4)) * momentumBlend;
    forwardEpsIdr = Math.max(2, Math.round(estimatedYtdEps * annualizationFactor));
  }

  const rawForwardRoe = (forwardEpsIdr / safeBvps) * 100;
  const forwardRoePct = Number(
    Math.max(0.5, Math.min(38.0, rawForwardRoe || trailingRoePct)).toFixed(2)
  );

  const retentionRatio = Math.max(0.15, Math.min(0.85, 1 - historicalDprPct / 100));
  const rawGrowth = forwardRoePct * retentionRatio * 0.48;
  const forwardSustainableGrowthPct = Number(
    Math.max(2.0, Math.min(6.8, Math.min(rawGrowth, costOfEquityPct - 2.2))).toFixed(2)
  );

  return {
    detectedQuarter,
    annualizationFactor: Number(annualizationFactor.toFixed(4)),
    forwardEpsIdr,
    forwardRoePct,
    forwardSustainableGrowthPct
  };
}

export interface ContextualOcfNiPolicyResult {
  effective_module: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  ocfHealthyThreshold: number;
  isPassingOcfThreshold: boolean;
  accrualPenaltyScore: number;
  accrualQualityMultiplier: number;
  ensembleAntiJunkMultiplier: number;
  policyRuleLabel: string;
}

/**
 * 6. CONTEXTUAL ANTI-JUNK (OCF/NI) PENALTY ADJUSTMENT
 * Context-aware Quality-Minus-Junk (QMJ) accrual penalty based on active routing module (`effective_module`):
 * - Rule A (Strict): If `effective_module` === 'Compounder' OR 'Pure_Cyclical', strictly maintain the
 *   healthy OCF/NI threshold at > 0.8x to 1.0x. If they fail (<= 0.80x), apply a heavy graduated valuation
 *   penalty to both the valuation legs and the Dynamic Ensemble target price.
 * - Rule B (Tolerant): If `effective_module` === 'Capex_Aggressor', lower the healthy OCF/NI threshold to > 0.5x
 *   (zero penalty above 0.5x, penalize only at or below 0.5x), because heavy construction phases naturally have
 *   earnings that have not yet fully converted to operational free cash flow.
 */
export function resolveContextualOcfNiPolicy(params: {
  effectiveModule: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  ocfToNetIncomeRatio: number;
  accrualRatioToAssets?: number;
  roePct?: number;
}): ContextualOcfNiPolicyResult {
  const {
    effectiveModule,
    ocfToNetIncomeRatio,
    accrualRatioToAssets = 0,
    roePct = 15
  } = params;

  // Rule B (Tolerant): Capex_Aggressor -> healthy OCF/NI threshold > 0.50x (zero penalty above 0.50x)
  if (effectiveModule === 'Capex_Aggressor') {
    const ocfHealthyThreshold = 0.50;
    if (ocfToNetIncomeRatio > ocfHealthyThreshold) {
      return {
        effective_module: 'Capex_Aggressor',
        ocfHealthyThreshold,
        isPassingOcfThreshold: true,
        accrualPenaltyScore: 0,
        accrualQualityMultiplier: 1.0,
        ensembleAntiJunkMultiplier: 1.0,
        policyRuleLabel: `Rule B Toleran (Capex Aggressor): OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x > 0,50x (0 Penalti Junk)`
      };
    }

    // Penalize only when OCF/NI <= 0.50x for Capex_Aggressor
    let accrualPenaltyScore = 0;
    if (roePct > 0 && ocfToNetIncomeRatio < 0) {
      accrualPenaltyScore = Math.min(2.4, 1.35 + Math.abs(ocfToNetIncomeRatio) * 0.85);
    } else {
      const shortfallPenalty = Math.max(0.15, (0.50 - ocfToNetIncomeRatio) * 2.4);
      const accrualExcessPenalty = Math.max(0, (accrualRatioToAssets - 2.5) * 0.14);
      accrualPenaltyScore = Math.min(2.1, shortfallPenalty + accrualExcessPenalty);
    }
    accrualPenaltyScore = Number(accrualPenaltyScore.toFixed(2));
    const accrualQualityMultiplier = Number(
      Math.max(0.76, 1 - accrualPenaltyScore * 0.08).toFixed(4)
    );
    const ensembleAntiJunkMultiplier = Number(
      Math.max(0.80, Math.min(0.94, 0.94 - (0.50 - Math.max(-0.4, ocfToNetIncomeRatio)) * 0.16)).toFixed(4)
    );

    return {
      effective_module: 'Capex_Aggressor',
      ocfHealthyThreshold,
      isPassingOcfThreshold: false,
      accrualPenaltyScore,
      accrualQualityMultiplier,
      ensembleAntiJunkMultiplier,
      policyRuleLabel: `Rule B Capex Aggressor Gagal: OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x ≤ 0,50x (Penalti Ensemble ×${ensembleAntiJunkMultiplier.toFixed(2)})`
    };
  }

  // Rule A (Strict): Compounder OR Pure_Cyclical -> healthy OCF/NI threshold > 0.80x to 1.00x
  const ocfHealthyThreshold = 0.80;
  if (ocfToNetIncomeRatio > ocfHealthyThreshold) {
    // Within > 0.80x to 1.00x+ healthy band: zero Ensemble haircut; zero accrual penalty at >= 0.88x
    let accrualPenaltyScore = 0;
    if (ocfToNetIncomeRatio < 0.88 || accrualRatioToAssets > 1.8) {
      const mildShortfall = Math.max(0, (0.88 - ocfToNetIncomeRatio) * 1.5);
      const mildAccrual = Math.max(0, (accrualRatioToAssets - 1.8) * 0.12);
      accrualPenaltyScore = Number(Math.min(0.35, mildShortfall + mildAccrual).toFixed(2));
    }
    const accrualQualityMultiplier = Number(
      Math.max(0.96, 1 - accrualPenaltyScore * 0.06).toFixed(4)
    );
    return {
      effective_module: effectiveModule,
      ocfHealthyThreshold,
      isPassingOcfThreshold: true,
      accrualPenaltyScore,
      accrualQualityMultiplier,
      ensembleAntiJunkMultiplier: 1.0,
      policyRuleLabel: `Rule A Ketat (${effectiveModule}): OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x > 0,80x (Lolos Ambang Kas 0,8x–1,0x)`
    };
  }

  // Fails Rule A (OCF/NI <= 0.80x): Apply heavy graduated valuation penalty to both legs and Ensemble target price
  let accrualPenaltyScore = 0;
  if (roePct > 0 && ocfToNetIncomeRatio < 0) {
    accrualPenaltyScore = Math.min(2.4, 1.55 + Math.abs(ocfToNetIncomeRatio) * 0.85);
  } else {
    const shortfallPenalty = Math.max(0.35, (0.88 - ocfToNetIncomeRatio) * 2.35);
    const accrualExcessPenalty = Math.max(0, (accrualRatioToAssets - 1.5) * 0.18);
    accrualPenaltyScore = Math.min(2.2, shortfallPenalty + accrualExcessPenalty);
  }
  accrualPenaltyScore = Number(accrualPenaltyScore.toFixed(2));
  const accrualQualityMultiplier = Number(
    Math.max(0.74, 1 - accrualPenaltyScore * 0.09).toFixed(4)
  );
  const ensembleAntiJunkMultiplier = Number(
    Math.max(0.78, Math.min(0.92, 0.92 - (0.80 - Math.max(-0.4, ocfToNetIncomeRatio)) * 0.15)).toFixed(4)
  );

  return {
    effective_module: effectiveModule,
    ocfHealthyThreshold,
    isPassingOcfThreshold: false,
    accrualPenaltyScore,
    accrualQualityMultiplier,
    ensembleAntiJunkMultiplier,
    policyRuleLabel: `Rule A Ketat (${effectiveModule}) Gagal: OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x ≤ 0,80x (Penalti Berat Valuasi Ensemble ×${ensembleAntiJunkMultiplier.toFixed(2)})`
  };
}

/**
 * 2. FAKTOR PELEMAHAN RIM YANG ELASTIS (Dynamic ω Fade Factor)
 * Sectoral Dictionary / Switch-Case in TypeScript:
 * - Perbankan KBMI 4 & Monopoli Konsumen: ω in [0.90, 1.00] (very slow decay due to strong economic moat).
 * - Komoditas & Siklikal: ω in [0.40, 0.60] (earnings mean-revert rapidly after boom cycle).
 * - Healthcare, Infrastructure & Mid-Tier Compounders: ω in [0.70, 0.86].
 */
export function resolveSectorOmegaFadeFactor(params: {
  ticker: string;
  sector: string;
  subIndustry?: import('../config/sectorProfiles').IdxSubIndustryEnum;
  gpaPct: number;
  ocfToNi: number;
  accrualPenaltyScore: number;
  effectiveModule?: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  roeTTM?: number;
  costOfEquityKePct?: number;
}): {
  rimPersistenceOmega: number;
  rimFadeYears: number;
  omegaTierLabel: string;
} {
  const classification = classifyEmitenSectorProfile({
    ticker: params.ticker,
    sector: params.sector,
    subIndustry: params.subIndustry,
    grossProfitabilityToAssetsPct: params.gpaPct,
    ocfToNetIncomeRatio: params.ocfToNi,
    accrualPenaltyScore: params.accrualPenaltyScore,
    roeTTM: params.roeTTM,
    costOfEquityKePct: params.costOfEquityKePct
  });

  return {
    rimPersistenceOmega: classification.resolvedOmega,
    rimFadeYears: classification.resolvedFadeYears,
    omegaTierLabel: classification.resolvedOmegaTierLabel
  };
}

export interface RoutedValuationModuleOutput extends ValuationReport {
  route: ValuationModuleRoute;
  moduleLabel: string;
  sectorValuationArchetype: SectorValuationArchetype;
  sectorPrimaryMetricShort: string;
  sectorPrimaryMetricLabel: string;
  sectorPrimaryImpliedMultiple: number;
  sectorPrimaryFairMultiple: number;
  sectorPrimaryPerShareIdr: number;
  sectorPrimaryPerShareLabel: string;
  sectorSpecificFairValueIdr: number;
  sectorAcademicRationale: string;
  cwipToAssetsRatio: number;
  capexToDaRatio: number;
  capexToRevenueRatio: number;
  isCapexOverrideTriggered: boolean;
  valuationReport: ValuationReport;
  normalizedEps7YIdr: number;
  historicalNormalizedYears?: number;
  normalizedRoePct: number;
  pbv10YMean?: number;
  pbv10YStdDev?: number;
  pbvZScore?: number;
  isCyclicalStrongBuyZScore: boolean;
  isCyclicalDerPenalized: boolean;
  basisEpsForBenchmarkIdr: number;
  adjustedGrowthRatePct: number;
}

/**
 * 3. ROUTER UTAMA: ValuationEngine.calculateFairValue(stock)
 * Directs each stock into one of three specialized sector/cycle modules:
 * - Module 1: The Steady Compounder Module (Financials, FMCG / Consumer Non-Cyclicals)
 * - Module 2: The Capex Aggressor / Step-Function Growth Module (Capex/D&A > 3.0 OR Capex/Revenue > 0.15, Healthcare, Infra, Basic Materials Metals)
 * - Module 3: The Pure Cyclical Module (Energy/Coal, Agri/CPO, Cyclical Property & Materials)
 */
export const ValuationEngine = {
  resolveRoute(
    stock: StockMetrics,
    customCwipRatio?: number,
    extraMetrics?: {
      grossProfitabilityToAssetsPct?: number;
      ocfToNetIncomeRatio?: number;
      debtToEquityRatio?: number;
      forceRouteOverride?: ValuationModuleRoute;
    }
  ): {
    route: ValuationModuleRoute;
    applied_module: ValuationReport['applied_module'];
    cwipToAssetsRatio: number;
    capexToDaRatio: number;
    capexToRevenueRatio: number;
    isCapexOverrideTriggered: boolean;
    isSyntheticCapexBlocked?: boolean;
    isQualityCompounderOverride?: boolean;
    ui_notifications: string[];
  } {
    const clean = stock.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
    const cwipToAssetsRatio = Number(
      (
        customCwipRatio ??
        stock.cwipToAssetsRatio ??
        CALIBRATED_CWIP_TO_ASSETS_MAP[clean] ??
        0.04
      ).toFixed(2)
    );

    const hasRealCapex =
      typeof stock.capexTTMIdr === 'number' &&
      Number.isFinite(stock.capexTTMIdr) &&
      stock.capexTTMIdr > 0;
    const hasRealDa =
      typeof stock.daTTMIdr === 'number' &&
      Number.isFinite(stock.daTTMIdr) &&
      stock.daTTMIdr > 0;
    const hasRealRev =
      typeof stock.revenueTTMIdr === 'number' &&
      Number.isFinite(stock.revenueTTMIdr) &&
      stock.revenueTTMIdr > 0;

    // Closing Finding D: Only trust CapEx/D&A and CapEx/Revenue when backed by real CapEx & D&A
    // (or explicit verified ratio not imputed from synthetic CWIP).
    const isSyntheticCwipOnly =
      customCwipRatio !== undefined ||
      (!hasRealCapex && !hasRealDa && stock.capexToDaRatio === undefined);

    const hasVerifiedCapexAndDa =
      !isSyntheticCwipOnly &&
      ((hasRealCapex && hasRealDa && stock.fundamentalsSource !== 'HARDCODED_SEED') ||
        (typeof stock.capexToDaRatio === 'number' &&
          stock.capexToDaRatio > 0 &&
          stock.fundamentalsSource !== 'HARDCODED_SEED'));

    const capexToRevenueRatio = Number(
      (
        hasRealCapex && hasRealRev
          ? stock.capexTTMIdr! / stock.revenueTTMIdr!
          : stock.capexToRevenueRatio ?? cwipToAssetsRatio
      ).toFixed(2)
    );
    const capexToDaRatio = Number(
      (
        hasRealCapex && hasRealDa
          ? stock.capexTTMIdr! / stock.daTTMIdr!
          : stock.capexToDaRatio ??
            (cwipToAssetsRatio > 0.15
              ? 3.15 + (cwipToAssetsRatio - 0.15) * 9.5
              : 0.9 + cwipToAssetsRatio * 12.0)
      ).toFixed(2)
    );

    const classification = classifyEmitenSectorProfile({
      ticker: stock.ticker,
      sector: stock.sector,
      subIndustry: stock.subIndustry,
      userSectorArchetypeOverride: stock.userSectorArchetypeOverride,
      netIncomeTTMIdr: stock.netIncomeTTMIdr,
      operatingProfitTTMIdr: stock.operatingProfitTTMIdr,
      revenueTTMIdr: stock.revenueTTMIdr,
      capexTTMIdr: stock.capexTTMIdr,
      daTTMIdr: stock.daTTMIdr,
      roeTTM: stock.roe,
      roeAvg5YPct: stock.roeAvg5YPct,
      roicTTMPct: stock.roicTTMPct ?? stock.roe,
      debtToEquityRatio: extraMetrics?.debtToEquityRatio ?? stock.debtToEquity,
      grossProfitabilityToAssetsPct: extraMetrics?.grossProfitabilityToAssetsPct,
      ocfToNetIncomeRatio: extraMetrics?.ocfToNetIncomeRatio,
      cwipToAssetsRatio,
      capexToDaRatio,
      capexToRevenueRatio,
      hasVerifiedCapexAndDa,
      isCoreFundamentalsSeed:
        !stock.fundamentalsSource || stock.fundamentalsSource === 'HARDCODED_SEED'
    });

    const ui_notifications: string[] = [];
    if (classification.isCapexOverrideTriggered) {
      ui_notifications.push(CAPEX_ANOMALY_NOTIFICATION_TEXT);
    }
    if (classification.isQualityCompounderOverride) {
      ui_notifications.push(
        `✅ TIER-2 QUANTITATIVE DNA OVERRIDE: Emiten ${stock.ticker} berada di sektor '${stock.sector}' namun memiliki DNA bisnis stabil (GP/A > 20%, DER < 0.50x, ROE TTM > 15%, OCF/NI ≥ 0.80x). Dikeluarkan dari modul Pure Cyclical ke Quality Compounder (Core Fundamental).`
      );
    }

    const resolvedRoute: ValuationModuleRoute =
      extraMetrics?.forceRouteOverride ?? classification.resolvedValuationRoute;
    const resolvedModule: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical' =
      resolvedRoute === 'CAPEX_AGGRESSOR'
        ? 'Capex_Aggressor'
        : resolvedRoute === 'PURE_CYCLICAL'
        ? 'Pure_Cyclical'
        : 'Compounder';

    return {
      route: resolvedRoute,
      applied_module: resolvedModule,
      cwipToAssetsRatio,
      capexToDaRatio,
      capexToRevenueRatio,
      isCapexOverrideTriggered: classification.isCapexOverrideTriggered,
      isSyntheticCapexBlocked: classification.isSyntheticCapexBlocked,
      isQualityCompounderOverride:
        Boolean(classification.isQualityCompounderOverride) ||
        extraMetrics?.forceRouteOverride === 'STEADY_COMPOUNDER',
      ui_notifications
    };
  },

  packageValuationReport(params: {
    target_price: number;
    route: ValuationModuleRoute;
    dynamic_weights: { pcf: number; rim: number; relval: number };
    graham_benchmark: number;
    ui_notifications: string[];
    ocf_healthy_threshold?: number;
    ensemble_anti_junk_multiplier?: number;
  }): ValuationReport {
    const applied_module: ValuationReport['applied_module'] =
      params.route === 'CAPEX_AGGRESSOR'
        ? 'Capex_Aggressor'
        : params.route === 'PURE_CYCLICAL'
        ? 'Pure_Cyclical'
        : 'Compounder';
    return {
      target_price: params.target_price,
      applied_module,
      effective_module: applied_module,
      ocf_healthy_threshold:
        params.ocf_healthy_threshold ?? (applied_module === 'Capex_Aggressor' ? 0.50 : 0.80),
      ensemble_anti_junk_multiplier: params.ensemble_anti_junk_multiplier ?? 1.0,
      dynamic_weights: params.dynamic_weights,
      graham_benchmark: params.graham_benchmark,
      ui_notifications: [...params.ui_notifications]
    };
  },

  calculateFairValue(params: {
    stock: StockMetrics;
    price: number;
    ttmEpsIdr: number;
    forwardEpsIdr: number;
    currentBvpsIdr: number;
    ttmRoePct: number;
    forwardRoePct: number;
    ocfToNetIncomeRatio: number;
    grossProfitabilityToAssets: number;
    dynamicCostOfEquityPct: number;
    baseGrowthRatePct: number;
    derPenaltyMultiplier: number;
    accrualQualityMultiplier: number;
    hscDiscountMultiplier: number;
    catalystValuationMultiplier: number;
    rimFairValueIdr: number;
    rimFadeYears: number;
    rimPersistenceOmega: number;
    sbn10YYieldPct?: number;
    forceRouteOverride?: ValuationModuleRoute;
    tickRounder: (rawPrice: number) => number;
  }): RoutedValuationModuleOutput {
    const {
      stock,
      price,
      ttmEpsIdr,
      currentBvpsIdr,
      ttmRoePct,
      forwardRoePct,
      ocfToNetIncomeRatio,
      grossProfitabilityToAssets,
      dynamicCostOfEquityPct,
      baseGrowthRatePct,
      accrualQualityMultiplier: rawAccrualQualityMultiplier,
      hscDiscountMultiplier,
      catalystValuationMultiplier,
      rimFairValueIdr,
      rimFadeYears,
      rimPersistenceOmega,
      sbn10YYieldPct = 6.75,
      forceRouteOverride,
      tickRounder
    } = params;

    const clean = stock.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
    const der = Math.max(0.05, stock.debtToEquity);
    const {
      route,
      applied_module,
      cwipToAssetsRatio,
      capexToDaRatio,
      capexToRevenueRatio,
      isCapexOverrideTriggered,
      isQualityCompounderOverride,
      ui_notifications
    } = ValuationEngine.resolveRoute(stock, undefined, {
      grossProfitabilityToAssetsPct: grossProfitabilityToAssets,
      ocfToNetIncomeRatio,
      debtToEquityRatio: stock.debtToEquity,
      forceRouteOverride
    });

    // Contextual Anti-Junk (OCF/NI) Penalty Policy based on effective_module (`applied_module`)
    const contextualOcfPolicy = resolveContextualOcfNiPolicy({
      effectiveModule: applied_module,
      ocfToNetIncomeRatio,
      accrualRatioToAssets: stock.accrualRatioToAssets ?? 0,
      roePct: forwardRoePct
    });
    const accrualQualityMultiplier =
      applied_module === 'Capex_Aggressor' && ocfToNetIncomeRatio > 0.50
        ? 1.0
        : Math.min(rawAccrualQualityMultiplier, contextualOcfPolicy.accrualQualityMultiplier);

    const buildDefaultReport = (
      targetPriceIdr: number,
      basisEpsIdr: number,
      growthPct: number,
      roeForBenchmark: number
    ): ValuationReport => {
      const defaultWeights =
        stock.sector === 'Financials'
          ? { pcf: 0.45, rim: 0.35, relval: 0.20 }
          : stock.sector === 'Properties & Real Estate'
          ? { pcf: 0.50, rim: 0.15, relval: 0.35 }
          : route === 'PURE_CYCLICAL'
          ? { pcf: 0.45, rim: 0.20, relval: 0.35 }
          : { pcf: 0.45, rim: 0.35, relval: 0.20 };
      const gj = calculateGrahamJoeliardiBenchmark({
        basisEpsIdr,
        growthRatePct: growthPct,
        sbn10YYieldPct,
        roePct: roeForBenchmark,
        derRatio: der,
        tickRounder
      });
      return {
        target_price: targetPriceIdr,
        applied_module,
        effective_module: applied_module,
        ocf_healthy_threshold: contextualOcfPolicy.ocfHealthyThreshold,
        ensemble_anti_junk_multiplier: contextualOcfPolicy.ensembleAntiJunkMultiplier,
        dynamic_weights: defaultWeights,
        graham_benchmark: gj.grahamJoeliardiBenchmarkIdr,
        ui_notifications: [...ui_notifications]
      };
    };

    // =========================================================================
    // MODULE 1: THE STEADY COMPOUNDER MODULE (Financials, FMCG & Tier-2 Quality Compounder Override)
    // Trigger: Sector == Financials OR Consumer_Non_Cyclical OR Tier-2 Quality Compounder DNA Override
    // P0.3 Guardrail: Strict TTM default basis (no linear 9M * 1.33x annualization in primary intrinsic value)
    // Anchor: Justified PBV = (ROE_TTM - g) / (Ke - g) -> Target Price = Justified PBV * Current BVPS
    // =========================================================================
    if (route === 'STEADY_COMPOUNDER') {
      const effectiveRoe = Math.max(
        6.0,
        Math.min(32.0, ttmRoePct)
      );
      const g = Math.min(6.0, Math.min(baseGrowthRatePct, dynamicCostOfEquityPct - 4.0));
      const rawJustifiedPbv =
        (effectiveRoe - g) / Math.max(2.0, dynamicCostOfEquityPct - g);

      const upperClamp = effectiveRoe < dynamicCostOfEquityPct ? 0.99 : 6.50;
      const justifiedPbv = Number(
        Math.max(
          0.35,
          Math.min(
            upperClamp,
            rawJustifiedPbv
          )
        ).toFixed(2)
      );

      const impliedPbv = Number((price / Math.max(1, currentBvpsIdr)).toFixed(2));
      const pbvTargetPriceIdr = currentBvpsIdr * justifiedPbv;

      // For Non-Financial Quality Compounders (FMCG or Tier-2 DNA Override like AVIA / ARNA),
      // blend Justified PBV with TTM Cash-Adjusted Quality P/E
      if (stock.sector !== 'Financials') {
        const moatMultiplier =
          grossProfitabilityToAssets >= 22.0
            ? 1.12
            : grossProfitabilityToAssets >= 15.0
            ? 1.04
            : 0.96;
        const cashEpsIdr = Math.max(
          2,
          Math.round(ttmEpsIdr * Math.max(0.82, Math.min(1.16, 0.86 + ocfToNetIncomeRatio * 0.14)))
        );
        const impliedQualityPe = Number((price / Math.max(1, cashEpsIdr)).toFixed(2));
        const fairQualityPe = Number(
          Math.max(
            7.5,
            Math.min(
              24.5,
              (100 / Math.max(7.2, dynamicCostOfEquityPct - g * 0.58)) *
                moatMultiplier *
                accrualQualityMultiplier *
                hscDiscountMultiplier
            )
          ).toFixed(2)
        );
        const qualityPePriceIdr = cashEpsIdr * fairQualityPe;
        const blendedCompounderPrice = tickRounder(
          Math.max(50, 0.55 * qualityPePriceIdr + 0.45 * pbvTargetPriceIdr)
        );
        const valuationReport = buildDefaultReport(blendedCompounderPrice, ttmEpsIdr, g, effectiveRoe);

        const moduleTitle = isQualityCompounderOverride
          ? 'Quality Compounder Override (TTM Quality P/E & Justified PBV)'
          : 'Steady Compounder (TTM Quality P/E & Justified PBV)';

        return {
          ...valuationReport,
          valuationReport,
          route: 'STEADY_COMPOUNDER',
          moduleLabel: moduleTitle,
          sectorValuationArchetype: 'CONSUMER_HEALTH_QUALITY_PE',
          sectorPrimaryMetricShort: 'Quality P/E & PBV',
          sectorPrimaryMetricLabel: isQualityCompounderOverride
            ? 'Quality Compounder (Tier-2 DNA Override): TTM Quality P/E & Justified PBV'
            : 'Steady Compounder: TTM Quality P/E & Justified PBV',
          sectorPrimaryImpliedMultiple: impliedQualityPe,
          sectorPrimaryFairMultiple: fairQualityPe,
          sectorPrimaryPerShareIdr: cashEpsIdr,
          sectorPrimaryPerShareLabel: 'TTM Cash EPS',
          sectorSpecificFairValueIdr: blendedCompounderPrice,
          sectorAcademicRationale: `[Modul 1: ${isQualityCompounderOverride ? 'Tier-2 Quality Compounder Override' : 'Steady Compounder — FMCG'} (Basis TTM Default)] Menggunakan jangkar ROE TTM berkelanjutan ${effectiveRoe.toFixed(1)}% (g ${g.toFixed(1)}%, Ke ${dynamicCostOfEquityPct.toFixed(2)}%) tanpa kompresi siklikal dengan Justified PBV ${justifiedPbv}x (Rp ${Math.round(pbvTargetPriceIdr).toLocaleString('id-ID')}) dan Quality P/E ${fairQualityPe}x atas TTM Cash EPS Rp ${cashEpsIdr.toLocaleString('id-ID')}/shm (GP/A ${grossProfitabilityToAssets.toFixed(1)}%, DER ${stock.debtToEquity.toFixed(2)}x, OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x, ω=${rimPersistenceOmega.toFixed(2)}).`,
          cwipToAssetsRatio,
          capexToDaRatio,
          capexToRevenueRatio,
          isCapexOverrideTriggered,
          normalizedEps7YIdr: ttmEpsIdr,
          normalizedRoePct: effectiveRoe,
          isCyclicalStrongBuyZScore: false,
          isCyclicalDerPenalized: false,
          basisEpsForBenchmarkIdr: ttmEpsIdr,
          adjustedGrowthRatePct: g
        };
      }

      const targetPriceIdr = tickRounder(Math.max(50, pbvTargetPriceIdr));
      const roeSpreadPct = Number((effectiveRoe - dynamicCostOfEquityPct).toFixed(2));
      const valuationReport = buildDefaultReport(targetPriceIdr, ttmEpsIdr, g, effectiveRoe);

      return {
        ...valuationReport,
        valuationReport,
        route: 'STEADY_COMPOUNDER',
        moduleLabel: 'Steady Compounder (TTM Justified PBV Anchor)',
        sectorValuationArchetype: 'FINANCIALS_JUSTIFIED_PBV',
        sectorPrimaryMetricShort: 'Justified PBV',
        sectorPrimaryMetricLabel: 'Steady Compounder: Damodaran TTM Justified PBV',
        sectorPrimaryImpliedMultiple: impliedPbv,
        sectorPrimaryFairMultiple: justifiedPbv,
        sectorPrimaryPerShareIdr: currentBvpsIdr,
        sectorPrimaryPerShareLabel: 'BVPS Saat Ini',
        sectorSpecificFairValueIdr: targetPriceIdr,
        sectorAcademicRationale: `[Modul 1: Steady Compounder — Financials (Basis TTM Default)] Jangkar Justified PBV = (ROE_TTM ${effectiveRoe.toFixed(1)}% − g ${g.toFixed(1)}%) ÷ (Ke ${dynamicCostOfEquityPct.toFixed(2)}% − g) menghasilkan PBV Wajar ${justifiedPbv}x (vs Implied ${impliedPbv}x) × BVPS Rp ${currentBvpsIdr.toLocaleString('id-ID')} = Rp ${targetPriceIdr.toLocaleString('id-ID')}. Excess Return ${roeSpreadPct >= 0 ? '+' : ''}${roeSpreadPct}% dengan persistensi moat ω=${rimPersistenceOmega.toFixed(2)} (${rimFadeYears}Y RIM Rp ${rimFairValueIdr.toLocaleString('id-ID')}).`,
        cwipToAssetsRatio,
        capexToDaRatio,
        capexToRevenueRatio,
        isCapexOverrideTriggered,
        normalizedEps7YIdr: ttmEpsIdr,
        normalizedRoePct: effectiveRoe,
        isCyclicalStrongBuyZScore: false,
        isCyclicalDerPenalized: false,
        basisEpsForBenchmarkIdr: ttmEpsIdr,
        adjustedGrowthRatePct: g
      };
    }

    // =========================================================================
    // MODULE 2: THE CAPEX AGGRESSOR / 2-STAGE RESIDUAL INCOME MODULE (P1.1 REFACTORED)
    // Trigger: (Capex/D&A > 3.0 OR Capex/Revenue > 0.15) OR Healthcare / Infrastructure / Basic_Materials_Metals
    // P1.1 Architecture:
    // - REMOVED permanent +2% Capex Premium in single-stage perpetuity (Ke - g_adj)
    // - REPLACED with 2-Stage Residual Income Model (5-Year Explicit + Terminal Value):
    //   * Expansion bonus gatekeeper: ROIC > Ke (or Incremental_ROIC > Ke)
    //   * Stage 1 (Years 1-5): g_high = Math.min(baseG + 0.02, 0.12) ONLY IF ROIC > Ke
    //   * Terminal Stage (Year 6+): g_terminal <= 0.06 AND minimum spread (Ke - g_terminal) >= 0.04
    // =========================================================================
    if (route === 'CAPEX_AGGRESSOR') {
      const estimatedRoicPct =
        stock.roicTTMPct ??
        Number(
          Math.max(
            4.5,
            Math.min(30.0, (ttmRoePct / (1 + der * 0.55)) + (grossProfitabilityToAssets >= 18 ? 1.5 : 0))
          ).toFixed(2)
        );
      const estimatedIncrementalRoicPct =
        stock.incrementalRoicPct ??
        Number(
          (cwipToAssetsRatio >= 0.15 && ocfToNetIncomeRatio > 0.50
            ? estimatedRoicPct * 1.10
            : estimatedRoicPct
          ).toFixed(2)
        );

      const twoStageRI = calculateTwoStageCapexAggressorRI({
        bvps0: currentBvpsIdr,
        roeTTM: ttmRoePct / 100,
        roicTTM: estimatedRoicPct / 100,
        incrementalRoic: estimatedIncrementalRoicPct / 100,
        costOfEquityKe: dynamicCostOfEquityPct / 100,
        baseGrowthRate: baseGrowthRatePct / 100,
        persistenceOmega: rimPersistenceOmega,
        qualityMultiplier: accrualQualityMultiplier * hscDiscountMultiplier,
        tickRounder
      });

      const leg1TwoStageRIPriceIdr = twoStageRI.intrinsicValuePerShareIDR;

      // Leg 2 (Normalized TTM Earnings Power - 50%): Uses TTM EPS basis (not aggressive linear annualization)
      const targetSectorPe = Number(
        (stock.sector === 'Healthcare'
          ? grossProfitabilityToAssets >= 20
            ? 17.5
            : 14.8
          : stock.sector === 'Infrastructures'
          ? stock.operatingMargin >= 28
            ? 11.8
            : 9.8
          : grossProfitabilityToAssets >= 18
          ? 10.0
          : 8.8
        ).toFixed(2)
      );
      const leg2EarningsPowerPriceIdr =
        ttmEpsIdr * targetSectorPe * hscDiscountMultiplier * catalystValuationMultiplier;

      // Blended 50% 2-Stage Residual Income + 50% Normalized TTM Earnings Power
      const blendedCapexFairValueIdr = tickRounder(
        Math.max(50, 0.50 * leg1TwoStageRIPriceIdr + 0.50 * leg2EarningsPowerPriceIdr)
      );

      const impliedTtmPe = Number(
        Math.max(2.0, Math.min(65.0, price / Math.max(1, ttmEpsIdr))).toFixed(2)
      );
      const gTerminalPct = Number((twoStageRI.terminalGrowthRate * 100).toFixed(2));
      const gStage1Pct = Number((twoStageRI.stage1GrowthRate * 100).toFixed(2));

      // P1.2: Strictly pass TTM EPS & TTM ROE (never Forward Annualized EPS) to Graham-Joeliardi Floor
      const valuationReport = buildDefaultReport(
        blendedCapexFairValueIdr,
        ttmEpsIdr,
        gTerminalPct,
        ttmRoePct
      );

      return {
        ...valuationReport,
        valuationReport,
        route: 'CAPEX_AGGRESSOR',
        moduleLabel: `Capex Aggressor 2-Stage RI (Capex/D&A ${capexToDaRatio.toFixed(1)}x · CWIP ${(cwipToAssetsRatio * 100).toFixed(0)}% · ROIC ${estimatedRoicPct.toFixed(1)}%)`,
        sectorValuationArchetype: 'CAPEX_AGGRESSOR_BLENDED',
        sectorPrimaryMetricShort: '2-Stage RI + PE',
        sectorPrimaryMetricLabel: 'Capex Aggressor Blended (50% 2-Stage RI + 50% TTM Earnings Power)',
        sectorPrimaryImpliedMultiple: impliedTtmPe,
        sectorPrimaryFairMultiple: targetSectorPe,
        sectorPrimaryPerShareIdr: ttmEpsIdr,
        sectorPrimaryPerShareLabel: 'EPS TTM',
        sectorSpecificFairValueIdr: blendedCapexFairValueIdr,
        sectorAcademicRationale: `[Modul 2: Capex Aggressor — 2-Stage Residual Income (P1.1 Refactored)] Mengeliminasi ledakan perpetuitas single-stage. Syarat ekspansi: ROIC ${estimatedRoicPct.toFixed(1)}% (Inc. ROIC ${estimatedIncrementalRoicPct.toFixed(1)}%) ${twoStageRI.isRoicAboveKe ? '>' : '≤'} Ke ${dynamicCostOfEquityPct.toFixed(2)}% (${twoStageRI.isRoicAboveKe ? 'Bonus Fase-1 Aktif' : 'Value-Destroying Guard: Tanpa Bonus'}). Fase 1 (Thn 1–5): g_high = ${gStage1Pct.toFixed(1)}% (≤12%). Fase Terminal (Thn 6+): g_terminal = ${gTerminalPct.toFixed(1)}% (≤6,0%) dengan spread (Ke − g_term) = ${(twoStageRI.terminalSpread * 100).toFixed(2)}% (≥4,0%). Menggabungkan 50% 2-Stage RI (Rp ${leg1TwoStageRIPriceIdr.toLocaleString('id-ID')}) + 50% TTM Earnings Power (PE ${targetSectorPe}x × EPS_TTM Rp ${ttmEpsIdr.toLocaleString('id-ID')} = Rp ${Math.round(leg2EarningsPowerPriceIdr).toLocaleString('id-ID')}) → Rp ${blendedCapexFairValueIdr.toLocaleString('id-ID')} [${contextualOcfPolicy.policyRuleLabel}].`,
        cwipToAssetsRatio,
        capexToDaRatio,
        capexToRevenueRatio,
        isCapexOverrideTriggered,
        normalizedEps7YIdr: ttmEpsIdr,
        normalizedRoePct: ttmRoePct,
        isCyclicalStrongBuyZScore: false,
        isCyclicalDerPenalized: false,
        basisEpsForBenchmarkIdr: ttmEpsIdr,
        adjustedGrowthRatePct: gTerminalPct
      };
    }

    // =========================================================================
    // MODULE 3: THE PURE CYCLICAL MODULE (Upstream Coal, CPO, Metals, Cyclical Property)
    // Trigger: Verified Price-Taker Commodity / Cyclical Asset-Heavy Issuer
    // Logic: Focus on Multi-Year Mid-Cycle Normalized Earnings and Book Value Stability
    //        + Issuer-Own Historical PBV Z-Score: (Current_PBV - Mean_Historical_PBV) / StdDev_Historical_PBV
    //        NEVER compare against generic parent sector average, and NEVER invert sign.
    // =========================================================================
    const cycStats = CALIBRATED_CYCLICAL_10Y_PBV_STATS[clean];
    const actualNormalizedYears =
      typeof stock.historicalEps7YAvgIdr === 'number' && stock.historicalEps7YAvgIdr > 0
        ? 7
        : typeof stock.epsAvg5YIdr === 'number' && stock.epsAvg5YIdr > 0
        ? 5
        : typeof stock.epsAvg3YIdr === 'number' && stock.epsAvg3YIdr > 0
        ? 3
        : cycStats
        ? 7
        : 5;

    // Normalized Multi-Year Mid-Cycle ROE & EPS:
    // Avoid double-compression when `ttmRoePct` passed in is already normalized or moderate (< 20%)
    const midCycleNormalizedRoePct = Number(
      (
        cycStats?.normalizedMidCycleRoePct ??
        stock.roeAvg5YPct ??
        stock.roeAvg3YPct ??
        (ttmRoePct > 22.0
          ? Math.max(10.0, Math.min(20.0, ttmRoePct * 0.72 + 12.5 * 0.28))
          : Math.max(6.5, Math.min(20.0, ttmRoePct)))
      ).toFixed(2)
    );
    const normalizedEps7YIdr = Math.max(
      2,
      Math.round(
        stock.historicalEps7YAvgIdr ??
          stock.epsAvg5YIdr ??
          stock.epsAvg3YIdr ??
          (currentBvpsIdr * midCycleNormalizedRoePct) / 100
      )
    );
    const normalizedRoePct = Number(
      Math.max(4.0, Math.min(24.0, (normalizedEps7YIdr / Math.max(1, currentBvpsIdr)) * 100)).toFixed(2)
    );

    // QMJ Hard-Filter for Cyclicals: Heavy penalty if DER > 1.0x, bonus for low-cost high GP/A producers
    const isCyclicalDerPenalized = der > 1.0;

    const cyclicalGrowthPct = Number(Math.min(5.5, baseGrowthRatePct).toFixed(2));
    const rawCyclicalJustifiedPbv =
      (normalizedRoePct - cyclicalGrowthPct) /
      Math.max(2.0, dynamicCostOfEquityPct - cyclicalGrowthPct);

    // Mathematical Invariant: If Normalized ROE < Ke, Justified PBV MUST be < 1.00x
    const cyclicalUpperClamp = normalizedRoePct < dynamicCostOfEquityPct ? 0.99 : 6.50;
    const normalizedFairPbv = Number(
      Math.max(
        0.35,
        Math.min(
          cyclicalUpperClamp,
          rawCyclicalJustifiedPbv
        )
      ).toFixed(2)
    );

    // Issuer-Own Historical Mean & StdDev PBV (NEVER parent sector generic mean):
    // Priority: 1) stock.pbv10YMean, 2) calibrated issuer 10Y PBV stats, 3) issuer's own historical ROE-derived fair PBV trajectory
    const issuerOwnHistoricalMeanPbv = Number(
      (
        stock.pbv10YMean ??
        cycStats?.meanPbv10Y ??
        Math.max(0.55, Math.min(4.5, normalizedFairPbv * 1.05))
      ).toFixed(2)
    );
    const issuerOwnHistoricalStdDevPbv = Number(
      (
        stock.pbv10YStdDev ??
        cycStats?.stdDevPbv10Y ??
        Math.max(0.22, Number((issuerOwnHistoricalMeanPbv * 0.26).toFixed(2)))
      ).toFixed(2)
    );
    const pbv10YMean = issuerOwnHistoricalMeanPbv;
    const pbv10YStdDev = issuerOwnHistoricalStdDevPbv;

    const impliedPbv = Number((price / Math.max(1, currentBvpsIdr)).toFixed(2));
    // Strict Z-Score formula: (Current_PBV - Mean_Historical_PBV) / StdDev_Historical_PBV
    // Invariant: If Current_PBV < Mean_Historical_PBV, Z-Score is strictly NEGATIVE (< 0).
    const rawPbvDiff = impliedPbv - pbv10YMean;
    const rawZ = rawPbvDiff / Math.max(0.10, pbv10YStdDev);
    const pbvZScore = Number(
      (rawPbvDiff < 0 ? -Math.abs(rawZ) : rawPbvDiff > 0 ? Math.abs(rawZ) : 0).toFixed(2)
    );
    const isCyclicalStrongBuyZScore =
      !stock.isHscFlagged && !isCyclicalDerPenalized && pbvZScore <= -1.5;

    const cyclicalTargetPriceIdr = tickRounder(
      Math.max(50, currentBvpsIdr * normalizedFairPbv)
    );
    const valuationReport = buildDefaultReport(
      cyclicalTargetPriceIdr,
      normalizedEps7YIdr,
      cyclicalGrowthPct,
      normalizedRoePct
    );

    return {
      ...valuationReport,
      valuationReport,
      route: 'PURE_CYCLICAL',
      moduleLabel: `Pure Cyclical (Normalized ${actualNormalizedYears}Y EPS & PBV Z=${pbvZScore >= 0 ? '+' : ''}${pbvZScore}σ)`,
      sectorValuationArchetype: 'PURE_CYCLICAL_NORMALIZED',
      sectorPrimaryMetricShort: 'Norm PBV',
      sectorPrimaryMetricLabel: 'Pure Cyclical: Mid-Cycle Normalized PBV & Replacement Cost',
      sectorPrimaryImpliedMultiple: impliedPbv,
      sectorPrimaryFairMultiple: normalizedFairPbv,
      sectorPrimaryPerShareIdr: currentBvpsIdr,
      sectorPrimaryPerShareLabel: 'BVPS Siklus',
      sectorSpecificFairValueIdr: cyclicalTargetPriceIdr,
      sectorAcademicRationale: `[Modul 3: Pure Cyclical — Anti-Value Trap] Mematikan P/E & EPS TTM puncak siklus. Menggunakan Normalized ${actualNormalizedYears}Y EPS Rp ${normalizedEps7YIdr.toLocaleString('id-ID')}/shm (Normalized ROE ${normalizedRoePct.toFixed(1)}%, ω=${rimPersistenceOmega.toFixed(2)}) dan BVPS Rp ${currentBvpsIdr.toLocaleString('id-ID')} menghasilkan Normalized Justified PBV ${normalizedFairPbv}x (Target Rp ${cyclicalTargetPriceIdr.toLocaleString('id-ID')}). Saat ini PBV ${impliedPbv}x berada pada Z-Score ${pbvZScore >= 0 ? '+' : ''}${pbvZScore}σ vs Mean Historis Emiten ${pbv10YMean}x (σ=${pbv10YStdDev}x)${isCyclicalStrongBuyZScore ? ' (≤ -1.5σ → Sinyal STRONG BUY Siklikal Aktif)' : ''}${isCyclicalDerPenalized ? ` [Penalti QMJ: DER ${der.toFixed(2)}x > 1.0x]` : ' [QMJ Lolos: Produsen Biaya Rendah & Neraca Kuat]'}.`,
      cwipToAssetsRatio,
      capexToDaRatio,
      capexToRevenueRatio,
      isCapexOverrideTriggered,
      normalizedEps7YIdr,
      historicalNormalizedYears: actualNormalizedYears,
      normalizedRoePct,
      pbv10YMean,
      pbv10YStdDev,
      pbvZScore,
      isCyclicalStrongBuyZScore,
      isCyclicalDerPenalized,
      basisEpsForBenchmarkIdr: normalizedEps7YIdr,
      adjustedGrowthRatePct: cyclicalGrowthPct
    };
  }
};

export interface DynamicEnsembleWeightingResult {
  legs: readonly [EnsembleValuationLeg, EnsembleValuationLeg, EnsembleValuationLeg];
  components: readonly [EnsembleComponent, EnsembleComponent, EnsembleComponent];
  medianPriceIdr: number;
  intrinsicValueIdr: number;
  ensembleFormulaAudit: string;
  outlierPenalizedLeg?: string;
  confidenceNotes: string[];
  effectiveModule: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  ocfHealthyThreshold: number;
  ensembleAntiJunkMultiplier: number;
  modelDispersion: number;
  isDispersionPenalized: boolean;
}

/**
 * 4. DYNAMIC ENSEMBLE WEIGHTING MODULE (DynamicEnsembleWeighter — Auto-Adapt Refactored)
 * Pure Intrinsic Valuation Engine (StatArb 100% removed to TacticalOverlay):
 * - Combines 3 pure fundamental intrinsic methods:
 *   1. Sector Primary / Normalized Earnings Power (`SECTOR_PRIMARY`)
 *   2. 2-Stage / Multi-Stage Residual Income Model (`MULTI_STAGE_RIM`)
 *   3. Historical 5Y EV/EBITDA Band Anchor (`HISTORICAL_EVEBITDA_5Y`)
 * - Dynamic Regime-Matched Weighting (Zero 80% Single-Model Concentration):
 *   * Financials: 45% Damodaran Justified PBV, 35% Multi-Stage RIM, 20% Hist PBV Band 5Y.
 *   * Pure Cyclicals (Upstream Commodities): 45% Norm PBV & Cash Flow, 20% Fast-Fade RIM, 35% Hist EV/EBITDA 5Y.
 *   * Properties & Real Estate: 50% RNAV / P-AFFO Book Discount, 15% RIM, 35% Hist EV/EBITDA 5Y.
 *   * Quality Compounders (Consumer/Healthcare/Tier-2 Override): 45% Quality P/E & Justified PBV, 35% Multi-Stage RIM, 20% Hist EV/EBITDA 5Y.
 *   * Capex Aggressors: 45% 2-Stage RI + Earnings Power Blended, 35% Multi-Stage RIM, 20% Hist EV/EBITDA Band 5Y.
 * - Outlier Slashing (>40% deviation from consensus):
 *   * Slashes outlier leg weight strictly to 5% (0.05) and redistributes 95% proportionally across consistent models.
 */
export const DynamicEnsembleWeighter = {
  computeWeights(params: {
    sector: string;
    route: ValuationModuleRoute;
    effectiveModule?: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
    sectorLabel: string;
    sectorPriceIdr: number;
    rimLabel: string;
    rimPriceIdr: number;
    relValLabel: string; // Kept param name for backward compatibility; represents 3rd Intrinsic Anchor (Hist EV/EBITDA 5Y)
    relValPriceIdr: number;
    ocfToNetIncomeRatio: number;
    peerCorrelation?: number;
    hscDiscountMultiplier?: number;
    profileValuationLegs?: readonly import('../config/sectorProfiles').SectorValuationLegConfig[];
    tickRounder: (rawPrice: number) => number;
  }): DynamicEnsembleWeightingResult {
    const {
      sector,
      route,
      effectiveModule: explicitModule,
      sectorLabel,
      sectorPriceIdr,
      rimLabel,
      rimPriceIdr,
      relValLabel,
      relValPriceIdr,
      ocfToNetIncomeRatio,
      hscDiscountMultiplier = 1.0,
      profileValuationLegs,
      tickRounder
    } = params;

    const effectiveModule: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical' =
      explicitModule ??
      (route === 'CAPEX_AGGRESSOR'
        ? 'Capex_Aggressor'
        : route === 'PURE_CYCLICAL'
        ? 'Pure_Cyclical'
        : 'Compounder');

    const ocfPolicy = resolveContextualOcfNiPolicy({
      effectiveModule,
      ocfToNetIncomeRatio
    });

    const confidenceNotes: string[] = [];

    // Step 1: Dynamic Regime-Matched Base Weights from SectorProfile.valuationLegs (or balanced archetype fallback)
    let wSector = 0.45;
    let wRim = 0.35;
    let wEvEbitda5Y = 0.20;

    if (profileValuationLegs && profileValuationLegs.length >= 3) {
      wSector = profileValuationLegs[0].baseWeight;
      wRim = profileValuationLegs[1].baseWeight;
      wEvEbitda5Y = profileValuationLegs[2].baseWeight;
      confidenceNotes.push(
        `SectorProfile Ensemble (${profileValuationLegs[0].shortMetric} ${Math.round(wSector * 100)}% [${profileValuationLegs[0].clusterGroup}] · ${profileValuationLegs[1].shortMetric} ${Math.round(wRim * 100)}% [${profileValuationLegs[1].clusterGroup}] · ${profileValuationLegs[2].shortMetric} ${Math.round(wEvEbitda5Y * 100)}% [${profileValuationLegs[2].clusterGroup}])`
      );
    } else if (sector === 'Financials') {
      wSector = 0.45;
      wRim = 0.35;
      wEvEbitda5Y = 0.20;
      confidenceNotes.push('Sektor Finansial (Dynamic Balanced): 45% Justified PBV · 35% Multi-Stage RIM · 20% Hist PBV Band 5Y');
    } else if (sector === 'Properties & Real Estate') {
      wSector = 0.50;
      wRim = 0.15;
      wEvEbitda5Y = 0.35;
      confidenceNotes.push('Sektor Properti & Kawasan (Dynamic Balanced): 50% RNAV/Book Discount · 15% RIM · 35% Hist EV/EBITDA 5Y');
    } else if (route === 'PURE_CYCLICAL') {
      wSector = 0.45;
      wRim = 0.20;
      wEvEbitda5Y = 0.35;
      confidenceNotes.push('Sektor Komoditas Siklikal (Dynamic Balanced): 45% Norm PBV & Cash Flow · 20% Fast-Fade RIM · 35% Hist EV/EBITDA 5Y');
    } else if (effectiveModule === 'Compounder') {
      wSector = 0.45;
      wRim = 0.35;
      wEvEbitda5Y = 0.20;
      confidenceNotes.push('Quality Compounder (Dynamic Balanced): 45% Quality P/E & Justified PBV · 35% Multi-Stage RIM · 20% Hist EV/EBITDA 5Y');
    } else {
      wSector = 0.45;
      wRim = 0.35;
      wEvEbitda5Y = 0.20;
      confidenceNotes.push('Capex Aggressor (Dynamic Balanced): 45% 2-Stage RI Blended · 35% Multi-Stage RIM · 20% Hist EV/EBITDA Band 5Y');
    }

    // FASE 3 Cluster Correlation Anti-Double-Counting:
    // If two legs share the BOOK_RETURN cluster group while the 3rd leg is an independent cluster,
    // cap combined BOOK_RETURN weight at 80% so correlated book-return assumptions do not crowd out independent anchors.
    if (
      profileValuationLegs &&
      profileValuationLegs.length >= 3 &&
      profileValuationLegs[0].clusterGroup === 'BOOK_RETURN' &&
      profileValuationLegs[1].clusterGroup === 'BOOK_RETURN' &&
      profileValuationLegs[2].clusterGroup !== 'BOOK_RETURN' &&
      wSector + wRim > 0.80
    ) {
      const bookSum = wSector + wRim;
      wSector = Number(((wSector / bookSum) * 0.80).toFixed(4));
      wRim = Number(((wRim / bookSum) * 0.80).toFixed(4));
      wEvEbitda5Y = 0.20;
      confidenceNotes.push('Cluster Correlation Cap: Kombinasi 2 leg BOOK_RETURN dibatasi ≤ 80% untuk mencegah bobot ganda asumsi ROE.');
    }

    confidenceNotes.push('P1.3 Guardrail: StatArb dikeluarkan 100% dari Ensemble Fair Value ke Tactical Overlay.');
    confidenceNotes.push(ocfPolicy.policyRuleLabel);

    const baseSectorWeight = wSector;
    const baseRimWeight = wRim;
    const baseEvEbitdaWeight = wEvEbitda5Y;

    // Step 2: Data Confidence Triggers
    let sectorDisabled = false;
    let rimDisabled = wRim === 0;
    const evEbitdaDisabled = false;

    if (ocfToNetIncomeRatio <= 0 && sector !== 'Properties & Real Estate' && route !== 'PURE_CYCLICAL') {
      wSector = 0;
      sectorDisabled = true;
      confidenceNotes.push('Trigger Data: OCF Negatif (OCF/NI ≤ 0) → Bobot P/CF dikunci ke 0%');
    }

    if (wSector + wRim + wEvEbitda5Y <= 0) {
      wSector = 0.50;
      wRim = 0.50;
      rimDisabled = false;
    }

    // Step 3: Symmetric Outlier Filter (>40% deviation -> slash outlier weight to 5% and redistribute 95% proportionally)
    const activeCandidatePrices = [
      wSector > 0 ? sectorPriceIdr : null,
      wRim > 0 ? rimPriceIdr : null,
      wEvEbitda5Y > 0 ? relValPriceIdr : null
    ].filter((v): v is number => typeof v === 'number' && v > 0);

    const sortedPrices = (
      activeCandidatePrices.length >= 2
        ? activeCandidatePrices
        : [sectorPriceIdr, rimPriceIdr, relValPriceIdr]
    )
      .slice()
      .sort((a, b) => a - b);

    const midIdx = Math.floor(sortedPrices.length / 2);
    const medianPriceIdr = Math.max(
      50,
      sortedPrices.length % 2 === 1
        ? sortedPrices[midIdx]
        : Math.round((sortedPrices[midIdx - 1] + sortedPrices[midIdx]) / 2)
    );

    const minModelVal = sortedPrices[0] || medianPriceIdr;
    const maxModelVal = sortedPrices[sortedPrices.length - 1] || medianPriceIdr;
    const modelDispersion = Number(
      ((maxModelVal - minModelVal) / Math.max(1, medianPriceIdr)).toFixed(4)
    );

    const devSector = Math.abs(sectorPriceIdr - medianPriceIdr) / medianPriceIdr;
    const devRim = Math.abs(rimPriceIdr - medianPriceIdr) / medianPriceIdr;
    const devEvEbitda = Math.abs(relValPriceIdr - medianPriceIdr) / medianPriceIdr;

    const sectorSlashed = wSector > 0 && devSector > 0.40;
    const rimSlashed = wRim > 0 && devRim > 0.40;
    const evEbitdaSlashed = wEvEbitda5Y > 0 && devEvEbitda > 0.40;

    const outlierNames: string[] = [];
    if (sectorSlashed) {
      outlierNames.push(`${sectorLabel} (deviasi ${(devSector * 100).toFixed(0)}% > 40% → dipangkas ke 5%)`);
    }
    if (rimSlashed) {
      outlierNames.push(`${rimLabel} (deviasi ${(devRim * 100).toFixed(0)}% > 40% → dipangkas ke 5%)`);
    }
    if (evEbitdaSlashed) {
      outlierNames.push(`${relValLabel} (deviasi ${(devEvEbitda * 100).toFixed(0)}% > 40% → dipangkas ke 5%)`);
    }

    const outlierCount =
      (sectorSlashed ? 1 : 0) + (rimSlashed ? 1 : 0) + (evEbitdaSlashed ? 1 : 0);
    const nonOutlierActiveSum =
      (!sectorSlashed ? wSector : 0) +
      (!rimSlashed ? wRim : 0) +
      (!evEbitdaSlashed ? wEvEbitda5Y : 0);

    let normSector: number;
    let normRim: number;
    let normEvEbitda: number;

    if (outlierCount > 0 && nonOutlierActiveSum > 0) {
      // Strictly cap each outlier model at 5% (0.05) and redistribute the remaining (1 - 0.05 * outlierCount) proportionally
      const remainingPool = Math.max(0.10, 1.0 - 0.05 * outlierCount);
      normSector = sectorSlashed
        ? 0.05
        : Number(((wSector / nonOutlierActiveSum) * remainingPool).toFixed(4));
      normRim = rimSlashed
        ? 0.05
        : Number(((wRim / nonOutlierActiveSum) * remainingPool).toFixed(4));
      normEvEbitda = Number(Math.max(0, 1.0 - normSector - normRim).toFixed(4));
    } else {
      const rawSum = wSector + wRim + wEvEbitda5Y || 1;
      normSector = Number((wSector / rawSum).toFixed(4));
      normRim = Number((wRim / rawSum).toFixed(4));
      normEvEbitda = Number(Math.max(0, 1.0 - normSector - normRim).toFixed(4));
    }

    const outlierPenalizedLeg = outlierNames.length > 0 ? outlierNames.join(', ') : undefined;
    if (outlierPenalizedLeg) {
      confidenceNotes.push(
        `Audit Epistemic Dispersion (Outlier >40% → Bobot Dipangkas ke 5% & Redistribusi Proporsional 95%): ${outlierPenalizedLeg}`
      );
    }

    // FASE 3: Continuous dispersion penalty starts at delta > 0.15; outlier flag alone never forces a cliff penalty
    const continuousDispersionPts = Math.round(
      Math.min(15.0, Math.max(0, (modelDispersion - 0.15) * 31.5))
    );
    const isDispersionPenalized = continuousDispersionPts > 0;
    if (isDispersionPenalized) {
      confidenceNotes.push(
        `P2.3 Continuous Epistemic Uncertainty: Dispersi Model ${(modelDispersion * 100).toFixed(1)}% → Penalti Kontinu -${continuousDispersionPts} pts`
      );
    }

    const legs: readonly [EnsembleValuationLeg, EnsembleValuationLeg, EnsembleValuationLeg] = [
      {
        id: 'SECTOR_PRIMARY',
        label: sectorLabel,
        priceIdr: sectorPriceIdr,
        weight: normSector,
        baseWeight: baseSectorWeight,
        isOutlierSlashed: sectorSlashed,
        isDisabledByConfidence: sectorDisabled
      },
      {
        id: 'MULTI_STAGE_RIM',
        label: rimLabel,
        priceIdr: rimPriceIdr,
        weight: normRim,
        baseWeight: baseRimWeight,
        isOutlierSlashed: rimSlashed,
        isDisabledByConfidence: rimDisabled
      },
      {
        id: 'HISTORICAL_EVEBITDA_5Y',
        label: relValLabel,
        priceIdr: relValPriceIdr,
        weight: normEvEbitda,
        baseWeight: baseEvEbitdaWeight,
        isOutlierSlashed: evEbitdaSlashed,
        isDisabledByConfidence: evEbitdaDisabled
      }
    ];

    const components: readonly [EnsembleComponent, EnsembleComponent, EnsembleComponent] = [
      {
        id: 'SECTOR_2STAGE_RI',
        label: sectorLabel,
        value: sectorPriceIdr,
        weight: normSector
      },
      {
        id: 'MULTISTAGE_RIM',
        label: rimLabel,
        value: rimPriceIdr,
        weight: normRim
      },
      {
        id: 'HIST_EVEBITDA_BAND',
        label: relValLabel,
        value: relValPriceIdr,
        weight: normEvEbitda
      }
    ];

    const ensembleAntiJunkMultiplier = ocfPolicy.ensembleAntiJunkMultiplier;
    const combinedDiscountMultiplier = Number(
      (hscDiscountMultiplier * ensembleAntiJunkMultiplier).toFixed(4)
    );
    const rawWeightedSumIdr = legs.reduce((acc, leg) => acc + leg.priceIdr * leg.weight, 0);
    const intrinsicValueIdr = tickRounder(
      Math.max(50, rawWeightedSumIdr * combinedDiscountMultiplier)
    );

    const activeFormulaParts = legs
      .filter((leg) => leg.weight > 0.001)
      .map(
        (leg) =>
          `(Rp ${leg.priceIdr.toLocaleString('id-ID')} × ${Math.round(leg.weight * 100)}%)`
      );
    const ensembleFormulaAudit = `${activeFormulaParts.join(' + ')}${
      ensembleAntiJunkMultiplier < 0.999
        ? ` × QMJ ${ensembleAntiJunkMultiplier.toFixed(2)}`
        : ''
    }${
      hscDiscountMultiplier < 0.999 ? ` × HSC ${hscDiscountMultiplier.toFixed(2)}` : ''
    } = Rp ${intrinsicValueIdr.toLocaleString('id-ID')}`;

    return {
      legs,
      components,
      medianPriceIdr,
      intrinsicValueIdr,
      ensembleFormulaAudit,
      outlierPenalizedLeg,
      confidenceNotes,
      effectiveModule,
      ocfHealthyThreshold: ocfPolicy.ocfHealthyThreshold,
      ensembleAntiJunkMultiplier,
      modelDispersion,
      isDispersionPenalized
    };
  }
};

/**
 * HOTFIX 2: Builds the Single Source of Truth `ValuationLedger` guaranteeing that
 * the 3 Ensemble components (`SECTOR_2STAGE_RI`, `MULTISTAGE_RIM`, `HIST_EVEBITDA_BAND`),
 * their normalized weights (sum === 1.0), final `ensembleFairValue`, `standaloneFloor`,
 * and TTM fundamental metrics (`roeTTM`, `epsTTM`, `bvps`) are identical across the
 * UI modal, Chain-of-Thought narrative, catalyst header, PNG, and PDF exports.
 */
export function buildValuationLedger(params: {
  ticker: string;
  components: readonly [EnsembleComponent, EnsembleComponent, EnsembleComponent];
  ensembleFairValue: number;
  standaloneFloor: number;
  formulaAudit: string;
  epsTTM: number;
  bvps: number;
  roeTTM: number;
  netIncomeYoYPct: number;
  operatingProfitYoYPct: number;
  isDualCatalystConfirmed: boolean;
}): ValuationLedger {
  const rawWeightSum =
    params.components[0].weight +
    params.components[1].weight +
    params.components[2].weight || 1;

  const w0 = Number((params.components[0].weight / rawWeightSum).toFixed(4));
  const w1 = Number((params.components[1].weight / rawWeightSum).toFixed(4));
  const w2 = Number(Math.max(0, 1 - w0 - w1).toFixed(4));

  const normalizedComponents: readonly [
    EnsembleComponent,
    EnsembleComponent,
    EnsembleComponent
  ] = [
    { ...params.components[0], weight: w0 },
    { ...params.components[1], weight: w1 },
    { ...params.components[2], weight: w2 }
  ];

  return {
    ticker: params.ticker,
    valuationBasis: 'TTM_DEFAULT',
    components: normalizedComponents,
    totalWeight: Number((w0 + w1 + w2).toFixed(4)),
    ensembleFairValue: params.ensembleFairValue,
    standaloneFloor: params.standaloneFloor,
    formulaAudit: params.formulaAudit,
    epsTTM: params.epsTTM,
    bvps: params.bvps,
    roeTTM: Number(params.roeTTM.toFixed(2)),
    netIncomeYoYPct: Number(params.netIncomeYoYPct.toFixed(2)),
    operatingProfitYoYPct: Number(params.operatingProfitYoYPct.toFixed(2)),
    isDualCatalystConfirmed: params.isDualCatalystConfirmed
  };
}

export interface GrahamJoeliardiBenchmarkResult {
  grahamJoeliardiRawIdr: number;
  grahamJoeliardiBenchmarkIdr: number;
  normalizedBasisEpsIdr: number;
  normalizedBasisRoePct: number;
  isMoatHaircutApplied: boolean;
  moatHaircutMultiplier: number; // 0.75 if ROE < threshold or DER > threshold, else 1.00
  moatHaircutReason?: string;
  isFloorClamped: boolean;
  floorClampDiagnosticLog?: string;
  formulaAudit: string;
}

/**
 * 5. GRAHAM-JOELIARDI "MOAT" INTRINSIC VALUE BENCHMARK (Standalone Floor Value — P1.2 & FASE 3 Refactored)
 * Standalone conservative sanity check (floor value) displayed on the UI,
 * NEVER averaged into the main Quantedge Ensemble target price:
 *   Intrinsic Value = (Norm_EPS * (8.5 + (2 * g)) * 4.4) / current_SBN_10Y_Yield
 * - P1.2 Guardrail 1: Strictly uses 3–5 Year Historical Normalized EPS & ROE (`Math.min(TTM, Avg3Y)`).
 *   NEVER uses Forward Annualized EPS.
 * - FASE 3 Guardrail 2 (Always-On <= 90% Hard Invariant & Sector-Aware Weak-Moat):
 *   Always clamps `standaloneFloor <= maxRatioToEnsemble (90%) * ensembleFairValue`
 *   and uses sector-aware `roeHaircutThresholdPct` & `derHaircutThreshold` (`null` for Financials/Banks).
 */
export function calculateGrahamJoeliardiBenchmark(params: {
  basisEpsIdr: number;
  epsAvg3YIdr?: number;
  epsAvg5YIdr?: number;
  growthRatePct: number;
  sbn10YYieldPct: number;
  roePct: number;
  roeAvg3YPct?: number;
  roeAvg5YPct?: number;
  derRatio: number;
  ensembleFairValueIdr?: number;
  maxRatioToEnsemble?: number;
  roeHaircutThresholdPct?: number;
  derHaircutThreshold?: number | null;
  weakMoatHaircutFactor?: number;
  effectiveModule?: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  isQualityCompounderOverride?: boolean;
  tickRounder: (rawPrice: number) => number;
}): GrahamJoeliardiBenchmarkResult {
  const {
    basisEpsIdr,
    epsAvg3YIdr,
    epsAvg5YIdr,
    growthRatePct,
    sbn10YYieldPct,
    roePct,
    roeAvg3YPct,
    roeAvg5YPct,
    derRatio,
    ensembleFairValueIdr,
    maxRatioToEnsemble,
    roeHaircutThresholdPct,
    derHaircutThreshold,
    weakMoatHaircutFactor,
    effectiveModule,
    isQualityCompounderOverride,
    tickRounder
  } = params;

  const invariantFloor = calculateInvariantGrahamJoeliardiFloor({
    epsTTM: basisEpsIdr,
    epsAvg3Y: epsAvg3YIdr,
    epsAvg5Y: epsAvg5YIdr,
    roeTTM: roePct,
    roeAvg3Y: roeAvg3YPct,
    roeAvg5Y: roeAvg5YPct,
    debtToEquity: derRatio,
    growthRate: growthRatePct,
    spotRf10Y: sbn10YYieldPct,
    ensembleFairValue: ensembleFairValueIdr ?? Number.MAX_SAFE_INTEGER,
    maxRatioToEnsemble,
    roeHaircutThresholdPct,
    derHaircutThreshold,
    weakMoatHaircutFactor,
    effectiveModule,
    isQualityCompounderOverride,
    tickRounder
  });

  return {
    grahamJoeliardiRawIdr: invariantFloor.rawStandaloneFloor,
    grahamJoeliardiBenchmarkIdr: invariantFloor.standaloneFloor,
    normalizedBasisEpsIdr: invariantFloor.normalizedBasisEps,
    normalizedBasisRoePct: invariantFloor.normalizedBasisRoePct,
    isMoatHaircutApplied: invariantFloor.isMoatHaircutApplied,
    moatHaircutMultiplier: invariantFloor.moatHaircutMultiplier,
    moatHaircutReason: invariantFloor.moatHaircutReason,
    isFloorClamped: invariantFloor.isFloorClamped,
    floorClampDiagnosticLog: invariantFloor.floorClampDiagnosticLog,
    formulaAudit: invariantFloor.formulaAudit
  };
}

