import {
  EnsembleValuationLeg,
  SectorValuationArchetype,
  StockMetrics,
  ValuationModuleRoute,
  ValuationReport
} from '../types/quant';

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
  DMAS: { meanPbv10Y: 1.42, stdDevPbv10Y: 0.32, normalizedMidCycleRoePct: 15.2 }
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
  'TAPG',
  'LSIP',
  'AALI',
  'DSNG',
  'SSMS',
  'SIMP',
  'BWPT',
  'SGRO',
  'TBLA',
  'STAA',
  'CSRA',
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
  gpaPct: number;
  ocfToNi: number;
  accrualPenaltyScore: number;
  effectiveModule?: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
}): {
  rimPersistenceOmega: number;
  rimFadeYears: number;
  omegaTierLabel: string;
} {
  const { ticker, sector, gpaPct, ocfToNi, accrualPenaltyScore, effectiveModule } = params;
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');

  const isCapexTolerant =
    effectiveModule === 'Capex_Aggressor' ||
    (!effectiveModule &&
      (sector === 'Healthcare' ||
        sector === 'Infrastructures' ||
        METALS_HILIRISASI_TICKERS.has(clean)));

  const ocfOmegaAdj = isCapexTolerant
    ? ocfToNi >= 0.85
      ? 0.03
      : ocfToNi > 0.50
      ? 0.01
      : -0.03
    : ocfToNi >= 1.0
    ? 0.03
    : ocfToNi > 0.80
    ? 0.01
    : -0.03;

  const qualityDelta =
    Math.min(0.06, (gpaPct / 30.0) * 0.05) +
    ocfOmegaAdj -
    Math.min(0.05, accrualPenaltyScore * 0.025);

  // Case 1: KBMI 4 Banks & Consumer Monopolies -> ω in [0.90, 0.98]
  if (
    KBMI4_AND_CONSUMER_MONOPOLY_TICKERS.has(clean) ||
    (sector === 'Consumer Non-Cyclicals' && !CPO_AGRI_TICKERS.has(clean) && gpaPct >= 20)
  ) {
    const omega = Number(Math.max(0.90, Math.min(0.98, 0.92 + qualityDelta)).toFixed(2));
    return {
      rimPersistenceOmega: omega,
      rimFadeYears: 7,
      omegaTierLabel: 'KBMI 4 / Monopoli Konsumen (ω Elastis 0.90–1.00)'
    };
  }

  // Case 2: Commodities & Cyclicals (Coal, Oil & Gas, CPO, Basic Materials, Property, Consumer Cyclicals) -> ω in [0.40, 0.60]
  if (
    !isCapexTolerant &&
    (sector === 'Energy' ||
      CPO_AGRI_TICKERS.has(clean) ||
      (sector === 'Basic Materials' && !METALS_HILIRISASI_TICKERS.has(clean)) ||
      sector === 'Properties & Real Estate' ||
      sector === 'Consumer Cyclicals')
  ) {
    const omega = Number(Math.max(0.40, Math.min(0.60, 0.48 + qualityDelta)).toFixed(2));
    return {
      rimPersistenceOmega: omega,
      rimFadeYears: 5,
      omegaTierLabel: 'Komoditas & Siklikal (ω Cepat Luruh 0.40–0.60)'
    };
  }

  // Case 3: Mid-Tier Financials, Healthcare, Infrastructures & Capex Aggressors -> ω in [0.70, 0.86]
  switch (sector) {
    case 'Financials':
    case 'Healthcare': {
      const omega = Number(Math.max(0.76, Math.min(0.88, 0.80 + qualityDelta)).toFixed(2));
      return {
        rimPersistenceOmega: omega,
        rimFadeYears: 6,
        omegaTierLabel: 'Finansial / Kesehatan Moat Stabil (ω 0.76–0.88)'
      };
    }
    case 'Infrastructures':
    case 'Technology':
    case 'Basic Materials':
    case 'Energy': {
      const omega = Number(Math.max(0.68, Math.min(0.84, 0.74 + qualityDelta)).toFixed(2));
      return {
        rimPersistenceOmega: omega,
        rimFadeYears: 6,
        omegaTierLabel: 'Infrastruktur & Hilirisasi Capex (ω 0.68–0.84)'
      };
    }
    default: {
      const omega = Number(Math.max(0.62, Math.min(0.82, 0.70 + qualityDelta)).toFixed(2));
      return {
        rimPersistenceOmega: omega,
        rimFadeYears: 6,
        omegaTierLabel: 'Industri Umum (ω 0.62–0.82)'
      };
    }
  }
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
  resolveRoute(stock: StockMetrics, customCwipRatio?: number): {
    route: ValuationModuleRoute;
    applied_module: ValuationReport['applied_module'];
    cwipToAssetsRatio: number;
    capexToDaRatio: number;
    capexToRevenueRatio: number;
    isCapexOverrideTriggered: boolean;
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

    const capexToRevenueRatio = Number(
      (stock.capexToRevenueRatio ?? cwipToAssetsRatio).toFixed(2)
    );
    const capexToDaRatio = Number(
      (
        stock.capexToDaRatio ??
        (cwipToAssetsRatio > 0.15
          ? 3.15 + (cwipToAssetsRatio - 0.15) * 9.5
          : 0.9 + cwipToAssetsRatio * 12.0)
      ).toFixed(2)
    );

    const ui_notifications: string[] = [];

    // Capex Override Logic: If (Capex/D&A > 3.0 OR Capex/Revenue > 0.15) is met,
    // override Pure Cyclical / standard routing into 'Capex Aggressor' and push the warning flag.
    const isCapexOverrideMet = capexToDaRatio > 3.0 || capexToRevenueRatio > 0.15;
    if (isCapexOverrideMet) {
      ui_notifications.push(CAPEX_ANOMALY_NOTIFICATION_TEXT);
      return {
        route: 'CAPEX_AGGRESSOR',
        applied_module: 'Capex_Aggressor',
        cwipToAssetsRatio,
        capexToDaRatio,
        capexToRevenueRatio,
        isCapexOverrideTriggered: true,
        ui_notifications
      };
    }

    // Pure Cyclical Trigger: Energy / Coal, Agri CPO, or Cyclical Property
    if (
      stock.sector === 'Energy' ||
      CPO_AGRI_TICKERS.has(clean) ||
      stock.sector === 'Properties & Real Estate'
    ) {
      return {
        route: 'PURE_CYCLICAL',
        applied_module: 'Pure_Cyclical',
        cwipToAssetsRatio,
        capexToDaRatio,
        capexToRevenueRatio,
        isCapexOverrideTriggered: false,
        ui_notifications
      };
    }

    // Capex Aggressor Sectoral Trigger: Healthcare / Infrastructures / Basic_Materials_Metals
    if (
      stock.sector === 'Healthcare' ||
      stock.sector === 'Infrastructures' ||
      METALS_HILIRISASI_TICKERS.has(clean)
    ) {
      return {
        route: 'CAPEX_AGGRESSOR',
        applied_module: 'Capex_Aggressor',
        cwipToAssetsRatio,
        capexToDaRatio,
        capexToRevenueRatio,
        isCapexOverrideTriggered: false,
        ui_notifications
      };
    }

    // Steady Compounder Trigger: Financials OR Consumer Non-Cyclicals
    if (stock.sector === 'Financials' || stock.sector === 'Consumer Non-Cyclicals') {
      return {
        route: 'STEADY_COMPOUNDER',
        applied_module: 'Compounder',
        cwipToAssetsRatio,
        capexToDaRatio,
        capexToRevenueRatio,
        isCapexOverrideTriggered: false,
        ui_notifications
      };
    }

    // Fallback routing for Industrials / General Cyclicals
    if (stock.sector === 'Basic Materials' || stock.sector === 'Industrials') {
      return {
        route: 'PURE_CYCLICAL',
        applied_module: 'Pure_Cyclical',
        cwipToAssetsRatio,
        capexToDaRatio,
        capexToRevenueRatio,
        isCapexOverrideTriggered: false,
        ui_notifications
      };
    }

    return {
      route: 'STEADY_COMPOUNDER',
      applied_module: 'Compounder',
      cwipToAssetsRatio,
      capexToDaRatio,
      capexToRevenueRatio,
      isCapexOverrideTriggered: false,
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
    tickRounder: (rawPrice: number) => number;
  }): RoutedValuationModuleOutput {
    const {
      stock,
      price,
      ttmEpsIdr,
      forwardEpsIdr,
      currentBvpsIdr,
      ttmRoePct,
      forwardRoePct,
      ocfToNetIncomeRatio,
      grossProfitabilityToAssets,
      dynamicCostOfEquityPct,
      baseGrowthRatePct,
      derPenaltyMultiplier,
      accrualQualityMultiplier: rawAccrualQualityMultiplier,
      hscDiscountMultiplier,
      catalystValuationMultiplier,
      rimFairValueIdr,
      rimFadeYears,
      rimPersistenceOmega,
      sbn10YYieldPct = 6.75,
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
      ui_notifications
    } = ValuationEngine.resolveRoute(stock);

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
          ? { pcf: 0.10, rim: 0.70, relval: 0.20 }
          : stock.sector === 'Properties & Real Estate' || route === 'PURE_CYCLICAL'
          ? { pcf: 0.80, rim: 0.00, relval: 0.20 }
          : stock.sector === 'Healthcare' || stock.sector === 'Consumer Non-Cyclicals'
          ? { pcf: 0.55, rim: 0.30, relval: 0.15 }
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
    // MODULE 1: THE STEADY COMPOUNDER MODULE (Financials, FMCG)
    // Trigger: Sector == Financials OR Consumer_Non_Cyclical
    // Logic: Traditional approach using TTM/Sustainable EPS & ROE
    // Anchor: Justified PBV = (ROE - g) / (Ke - g) -> Target Price = Justified PBV * Current BVPS
    // =========================================================================
    if (route === 'STEADY_COMPOUNDER') {
      const effectiveRoe = Math.max(
        6.0,
        Math.min(32.0, stock.sector === 'Financials' ? ttmRoePct * 0.65 + forwardRoePct * 0.35 : forwardRoePct)
      );
      const g = Math.min(baseGrowthRatePct, dynamicCostOfEquityPct - 2.0);
      const rawJustifiedPbv =
        (effectiveRoe - g) / Math.max(2.0, dynamicCostOfEquityPct - g);

      const moatMultiplier =
        KBMI4_AND_CONSUMER_MONOPOLY_TICKERS.has(clean)
          ? 1.12
          : grossProfitabilityToAssets >= 20
          ? 1.08
          : 1.0;

      const justifiedPbv = Number(
        Math.max(
          0.55,
          Math.min(
            5.6,
            rawJustifiedPbv *
              moatMultiplier *
              derPenaltyMultiplier *
              accrualQualityMultiplier *
              hscDiscountMultiplier *
              catalystValuationMultiplier
          )
        ).toFixed(2)
      );

      const impliedPbv = Number((price / Math.max(1, currentBvpsIdr)).toFixed(2));
      const pbvTargetPriceIdr = currentBvpsIdr * justifiedPbv;

      // For Consumer Non-Cyclicals, blend Justified PBV with Cash-Adjusted Quality P/E
      if (stock.sector !== 'Financials') {
        const cashEpsIdr = Math.max(
          2,
          Math.round(forwardEpsIdr * Math.max(0.82, Math.min(1.16, 0.86 + ocfToNetIncomeRatio * 0.14)))
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

        return {
          ...valuationReport,
          valuationReport,
          route: 'STEADY_COMPOUNDER',
          moduleLabel: 'Steady Compounder (FMCG Quality P/E & Justified PBV)',
          sectorValuationArchetype: 'CONSUMER_HEALTH_QUALITY_PE',
          sectorPrimaryMetricShort: 'Quality P/E',
          sectorPrimaryMetricLabel: 'Steady Compounder: Quality P/E & Justified PBV',
          sectorPrimaryImpliedMultiple: impliedQualityPe,
          sectorPrimaryFairMultiple: fairQualityPe,
          sectorPrimaryPerShareIdr: cashEpsIdr,
          sectorPrimaryPerShareLabel: 'Cash EPS',
          sectorSpecificFairValueIdr: blendedCompounderPrice,
          sectorAcademicRationale: `[Modul 1: Steady Compounder — FMCG] Menggunakan jangkar ROE berkelanjutan ${effectiveRoe.toFixed(1)}% (g ${g.toFixed(1)}%, Ke ${dynamicCostOfEquityPct.toFixed(2)}%) dengan Justified PBV ${justifiedPbv}x (Rp ${Math.round(pbvTargetPriceIdr).toLocaleString('id-ID')}) dan Quality P/E ${fairQualityPe}x atas Cash EPS Rp ${cashEpsIdr.toLocaleString('id-ID')}/shm (GP/A ${grossProfitabilityToAssets.toFixed(1)}%, OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x, ω=${rimPersistenceOmega.toFixed(2)}).`,
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
        moduleLabel: 'Steady Compounder (Justified PBV Anchor)',
        sectorValuationArchetype: 'FINANCIALS_JUSTIFIED_PBV',
        sectorPrimaryMetricShort: 'Justified PBV',
        sectorPrimaryMetricLabel: 'Steady Compounder: Damodaran Justified PBV',
        sectorPrimaryImpliedMultiple: impliedPbv,
        sectorPrimaryFairMultiple: justifiedPbv,
        sectorPrimaryPerShareIdr: currentBvpsIdr,
        sectorPrimaryPerShareLabel: 'BVPS Saat Ini',
        sectorSpecificFairValueIdr: targetPriceIdr,
        sectorAcademicRationale: `[Modul 1: Steady Compounder — Financials] Jangkar Justified PBV = (ROE ${effectiveRoe.toFixed(1)}% − g ${g.toFixed(1)}%) ÷ (Ke ${dynamicCostOfEquityPct.toFixed(2)}% − g) menghasilkan PBV Wajar ${justifiedPbv}x (vs Implied ${impliedPbv}x) × BVPS Rp ${currentBvpsIdr.toLocaleString('id-ID')} = Rp ${targetPriceIdr.toLocaleString('id-ID')}. Excess Return ${roeSpreadPct >= 0 ? '+' : ''}${roeSpreadPct}% dengan persistensi moat ω=${rimPersistenceOmega.toFixed(2)} (${rimFadeYears}Y RIM Rp ${rimFairValueIdr.toLocaleString('id-ID')}).`,
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
    // MODULE 2: THE CAPEX AGGRESSOR / STEP-FUNCTION GROWTH MODULE
    // Trigger: (Capex/D&A > 3.0 OR Capex/Revenue > 0.15) OR Healthcare / Infrastructure / Basic_Materials_Metals
    // Logic: Bypass TTM. Market prices in new smelter/hospital/network capacity coming online.
    // Approach: Blended Valuation (50% Residual Income Justified PBV + 50% Forward Earnings Power)
    // =========================================================================
    if (route === 'CAPEX_AGGRESSOR') {
      // Conservative Forward EPS extrapolation when CWIP capacity ramps up
      const cwipStepUpMultiplier =
        cwipToAssetsRatio > 0.15
          ? 1 + Math.min(0.28, (cwipToAssetsRatio - 0.10) * 0.95)
          : 1.08;
      const effectiveForwardEpsIdr = Math.max(
        forwardEpsIdr,
        Math.round(ttmEpsIdr * cwipStepUpMultiplier)
      );

      // Expected BVPS incorporating retained forward earnings
      const expectedBvpsIdr = Math.max(
        25,
        Math.round(currentBvpsIdr + effectiveForwardEpsIdr * 0.55)
      );

      // Normalized Forward ROE = Forward_EPS / Expected BVPS (capped strictly at max 28-30%)
      const rawForwardRoe = (effectiveForwardEpsIdr / expectedBvpsIdr) * 100;
      const normalizedForwardRoePct = Number(
        Math.max(8.0, Math.min(29.5, Math.max(forwardRoePct, rawForwardRoe))).toFixed(2)
      );

      // Adjusted Growth Rate: g_adj = base_g + 2.0% (Capex premium), bounded below Ke
      const gAdjPct = Number(
        Math.min(dynamicCostOfEquityPct - 1.8, baseGrowthRatePct + 2.0).toFixed(2)
      );

      // Leg 1 (Residual Income - 50%): Justified PBV = (Normalized Forward ROE - g_adj) / (Ke - g_adj)
      const capexJustifiedPbv = Number(
        Math.max(
          0.75,
          Math.min(
            5.2,
            ((normalizedForwardRoePct - gAdjPct) /
              Math.max(1.8, dynamicCostOfEquityPct - gAdjPct)) *
              accrualQualityMultiplier *
              hscDiscountMultiplier
          )
        ).toFixed(2)
      );
      const leg1ResidualIncomePriceIdr = expectedBvpsIdr * capexJustifiedPbv;

      // Leg 2 (Earnings Power - 50%): Target Price = Forward_EPS * Target_Sector_PE
      // Metals/Smelters: 8x - 10x; Infrastructure/Towers: 9.5x - 12.5x; Healthcare: 14x - 18.5x
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
        effectiveForwardEpsIdr * targetSectorPe * hscDiscountMultiplier * catalystValuationMultiplier;

      // Blended 50% Residual Income + 50% Earnings Power
      const blendedCapexFairValueIdr = tickRounder(
        Math.max(50, 0.50 * leg1ResidualIncomePriceIdr + 0.50 * leg2EarningsPowerPriceIdr)
      );

      const impliedForwardPe = Number(
        Math.max(2.0, Math.min(65.0, price / Math.max(1, effectiveForwardEpsIdr))).toFixed(2)
      );
      const valuationReport = buildDefaultReport(
        blendedCapexFairValueIdr,
        effectiveForwardEpsIdr,
        gAdjPct,
        normalizedForwardRoePct
      );

      return {
        ...valuationReport,
        valuationReport,
        route: 'CAPEX_AGGRESSOR',
        moduleLabel: `Capex Aggressor / Step-Function Growth (Capex/D&A ${capexToDaRatio.toFixed(1)}x · CWIP ${(cwipToAssetsRatio * 100).toFixed(0)}%)`,
        sectorValuationArchetype: 'CAPEX_AGGRESSOR_BLENDED',
        sectorPrimaryMetricShort: 'Fwd P/E + RIM',
        sectorPrimaryMetricLabel: 'Capex Aggressor Blended (50% Fwd RIM + 50% Earnings Power)',
        sectorPrimaryImpliedMultiple: impliedForwardPe,
        sectorPrimaryFairMultiple: targetSectorPe,
        sectorPrimaryPerShareIdr: effectiveForwardEpsIdr,
        sectorPrimaryPerShareLabel: 'Forward EPS',
        sectorSpecificFairValueIdr: blendedCapexFairValueIdr,
        sectorAcademicRationale: `[Modul 2: Capex Aggressor / Step-Function Growth] Memotong bias TTM karena ekspansi aset produktif (Capex/D&A ${capexToDaRatio.toFixed(2)}x, CWIP/Assets ${(cwipToAssetsRatio * 100).toFixed(0)}%). Menggunakan Forward EPS Rp ${effectiveForwardEpsIdr.toLocaleString('id-ID')}/shm, Normalized Forward ROE ${normalizedForwardRoePct.toFixed(1)}% (dipagari ≤30%), dan g_adj ${gAdjPct.toFixed(2)}% (base_g + 2% Capex Premium). Menggabungkan 50% Leg 1 Residual Income (Justified PBV ${capexJustifiedPbv}x → Rp ${Math.round(leg1ResidualIncomePriceIdr).toLocaleString('id-ID')}) + 50% Leg 2 Earnings Power (Target PE ${targetSectorPe}x → Rp ${Math.round(leg2EarningsPowerPriceIdr).toLocaleString('id-ID')}) = Rp ${blendedCapexFairValueIdr.toLocaleString('id-ID')} [${contextualOcfPolicy.policyRuleLabel}].`,
        cwipToAssetsRatio,
        capexToDaRatio,
        capexToRevenueRatio,
        isCapexOverrideTriggered,
        normalizedEps7YIdr: effectiveForwardEpsIdr,
        normalizedRoePct: normalizedForwardRoePct,
        isCyclicalStrongBuyZScore: false,
        isCyclicalDerPenalized: false,
        basisEpsForBenchmarkIdr: effectiveForwardEpsIdr,
        adjustedGrowthRatePct: gAdjPct
      };
    }

    // =========================================================================
    // MODULE 3: THE PURE CYCLICAL MODULE (Coal, CPO, Energy, Cyclical Property)
    // Trigger: Sector == Energy_Coal OR Agri_CPO OR Cyclical Property/Materials
    // Logic: Turn off P/E and TTM EPS entirely. Focus on 7Y-10Y Mid-Cycle Normalized Earnings
    //        and Book Value Stability + 10Y PBV Standard Deviation Z-Score.
    // QMJ Hard-Filter: Penalize/drop if Net DER > 1.0x.
    // Buy Signal Anchor: Trigger "STRONG BUY" if Current PBV Z-Score <= -1.5σ.
    // =========================================================================
    const cycStats = CALIBRATED_CYCLICAL_10Y_PBV_STATS[clean];
    const pbv10YMean = Number((stock.pbv10YMean ?? cycStats?.meanPbv10Y ?? 1.32).toFixed(2));
    const pbv10YStdDev = Number((stock.pbv10YStdDev ?? cycStats?.stdDevPbv10Y ?? 0.35).toFixed(2));

    // Normalized 7Y-10Y Mid-Cycle ROE & EPS (prevents buying at peak commodity earnings)
    const midCycleNormalizedRoePct = Number(
      (
        cycStats?.normalizedMidCycleRoePct ??
        Math.max(8.5, Math.min(18.5, ttmRoePct * 0.55 + 12.0 * 0.45))
      ).toFixed(2)
    );
    const normalizedEps7YIdr = Math.max(
      2,
      Math.round(
        stock.historicalEps7YAvgIdr ?? (currentBvpsIdr * midCycleNormalizedRoePct) / 100
      )
    );
    const normalizedRoePct = Number(
      Math.max(4.0, Math.min(24.0, (normalizedEps7YIdr / Math.max(1, currentBvpsIdr)) * 100)).toFixed(2)
    );

    // QMJ Hard-Filter for Cyclicals: Heavy penalty if DER > 1.0x, bonus for low-cost high GP/A producers
    const isCyclicalDerPenalized = der > 1.0;
    const cyclicalQmjMultiplier = isCyclicalDerPenalized
      ? Math.max(0.58, 0.78 - (der - 1.0) * 0.18)
      : grossProfitabilityToAssets >= 18
      ? 1.08
      : 1.0;

    const cyclicalGrowthPct = Number(Math.min(3.5, baseGrowthRatePct * 0.65).toFixed(2));
    const rawCyclicalJustifiedPbv =
      (normalizedRoePct - cyclicalGrowthPct) /
      Math.max(2.2, dynamicCostOfEquityPct - cyclicalGrowthPct);

    // Blend Normalized Justified PBV with 10Y Mean Replacement PBV
    const normalizedFairPbv = Number(
      Math.max(
        0.48,
        Math.min(
          3.4,
          (0.60 * rawCyclicalJustifiedPbv + 0.40 * pbv10YMean) *
            cyclicalQmjMultiplier *
            accrualQualityMultiplier *
            hscDiscountMultiplier *
            catalystValuationMultiplier
        )
      ).toFixed(2)
    );

    const impliedPbv = Number((price / Math.max(1, currentBvpsIdr)).toFixed(2));
    const pbvZScore = Number(
      ((impliedPbv - pbv10YMean) / Math.max(0.12, pbv10YStdDev)).toFixed(2)
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
      moduleLabel: `Pure Cyclical (Normalized 7Y EPS & PBV Z=${pbvZScore >= 0 ? '+' : ''}${pbvZScore}σ)`,
      sectorValuationArchetype: 'PURE_CYCLICAL_NORMALIZED',
      sectorPrimaryMetricShort: 'Norm PBV',
      sectorPrimaryMetricLabel: 'Pure Cyclical: Mid-Cycle Normalized PBV & Replacement Cost',
      sectorPrimaryImpliedMultiple: impliedPbv,
      sectorPrimaryFairMultiple: normalizedFairPbv,
      sectorPrimaryPerShareIdr: currentBvpsIdr,
      sectorPrimaryPerShareLabel: 'BVPS Siklus',
      sectorSpecificFairValueIdr: cyclicalTargetPriceIdr,
      sectorAcademicRationale: `[Modul 3: Pure Cyclical — Anti-Value Trap] Mematikan P/E & EPS TTM puncak siklus. Menggunakan 7Y Normalized EPS Rp ${normalizedEps7YIdr.toLocaleString('id-ID')}/shm (Normalized ROE ${normalizedRoePct.toFixed(1)}%, ω=${rimPersistenceOmega.toFixed(2)}) dan BVPS Rp ${currentBvpsIdr.toLocaleString('id-ID')} menghasilkan Normalized Justified PBV ${normalizedFairPbv}x (Target Rp ${cyclicalTargetPriceIdr.toLocaleString('id-ID')}). Saat ini PBV ${impliedPbv}x berada pada Z-Score ${pbvZScore >= 0 ? '+' : ''}${pbvZScore}σ vs Mean 10Y ${pbv10YMean}x${isCyclicalStrongBuyZScore ? ' (≤ -1.5σ → Sinyal STRONG BUY Siklikal Aktif)' : ''}${isCyclicalDerPenalized ? ` [Penalti QMJ: DER ${der.toFixed(2)}x > 1.0x]` : ' [QMJ Lolos: Produsen Biaya Rendah & Neraca Kuat]'}.`,
      cwipToAssetsRatio,
      capexToDaRatio,
      capexToRevenueRatio,
      isCapexOverrideTriggered,
      normalizedEps7YIdr,
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
  medianPriceIdr: number;
  intrinsicValueIdr: number;
  ensembleFormulaAudit: string;
  outlierPenalizedLeg?: string;
  confidenceNotes: string[];
  effectiveModule: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  ocfHealthyThreshold: number;
  ensembleAntiJunkMultiplier: number;
}

/**
 * 4. DYNAMIC ENSEMBLE WEIGHTING MODULE (DynamicEnsembleWeighter)
 * Replaces static 45/35/20 weights with sector-aligned, confidence-triggered, outlier-penalized,
 * and Contextual Anti-Junk (OCF/NI) adjusted weights:
 * - Sector Alignment:
 *   * Financials: 70% RIM / Justified PBV, 10% Sector/P/CF, 20% RelVal.
 *   * Properties & Pure Cyclicals: 80% PBV Replacement / Cyclical Normalized Book, 0% RIM (disabled), 20% RelVal (per user confirmation).
 *   * Healthcare & Consumer Non-Cyclicals: 55% Quality P/E & Cash Return, 30% RIM, 15% RelVal.
 *   * Capex Aggressors / Others: 45% Sector Blended, 35% RIM, 20% RelVal.
 * - Contextual Anti-Junk (OCF/NI) Penalty Adjustment:
 *   * Rule A (Strict): If `effective_module` === 'Compounder' OR 'Pure_Cyclical', maintain healthy OCF/NI threshold at > 0.8x to 1.0x.
 *     If they fail (<= 0.80x), apply the heavy valuation penalty (`ensembleAntiJunkMultiplier`) to the ensemble.
 *   * Rule B (Tolerant): If `effective_module` === 'Capex_Aggressor', lower healthy OCF/NI threshold to > 0.5x
 *     (zero penalty above 0.5x so heavy construction phases are not flagged as Junk).
 * - Data Confidence Trigger:
 *   * If OCF < 0 (ocfToNetIncomeRatio <= 0), force P/CF / Sector cashflow weight to 0%.
 *   * If RelVal Peer correlation (ρ) < 0.70, force RelVal weight to 0%.
 * - Outlier Penalty:
 *   * Calculate median of the 3 valuation outputs. If one model's output deviates by > 40% from the median,
 *     slash its weight by half (50%) and redistribute proportionally.
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
    relValLabel: string;
    relValPriceIdr: number;
    ocfToNetIncomeRatio: number;
    peerCorrelation: number;
    hscDiscountMultiplier?: number;
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
      peerCorrelation,
      hscDiscountMultiplier = 1.0,
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

    // Step 1: Sector Alignment Base Weights
    let wSector = 0.45;
    let wRim = 0.35;
    let wRelVal = 0.20;

    if (sector === 'Financials') {
      // Financials: RIM / BVPS anchor raised to 70%, P/CF reduced to 10%, RelVal 20%
      wSector = 0.10;
      wRim = 0.70;
      wRelVal = 0.20;
      confidenceNotes.push('Sektor Finansial: Bobot RIM/BVPS 70% · Sektor 10% · RelVal 20%');
    } else if (sector === 'Properties & Real Estate' || route === 'PURE_CYCLICAL') {
      // Confirmed User Decision: 80% PBV Replacement / Cyclical Normalized Book + 20% RelVal (0% RIM)
      wSector = 0.80;
      wRim = 0.00;
      wRelVal = 0.20;
      confidenceNotes.push('Sektor Siklikal/Properti: 80% PBV Replacement · 0% RIM (Dimatikan) · 20% RelVal');
    } else if (
      (sector === 'Healthcare' || sector === 'Consumer Non-Cyclicals') &&
      effectiveModule !== 'Capex_Aggressor'
    ) {
      // Maximize Quality-Adjusted P/E & Cash Return for Steady Compounders
      wSector = 0.55;
      wRim = 0.30;
      wRelVal = 0.15;
      confidenceNotes.push('Sektor Kesehatan/Konsumen: 55% Quality P/E & Cash Return · 30% RIM · 15% RelVal');
    } else {
      confidenceNotes.push('Capex Aggressor / Step-Function: 45% Blended Sektor · 35% RIM · 20% RelVal');
    }

    // Record Contextual Anti-Junk (OCF/NI) Rule A / Rule B status
    confidenceNotes.push(ocfPolicy.policyRuleLabel);

    const baseSectorWeight = wSector;
    const baseRimWeight = wRim;
    const baseRelValWeight = wRelVal;

    // Step 2: Data Confidence Triggers
    let sectorDisabled = false;
    let rimDisabled = wRim === 0;
    let relValDisabled = false;

    if (ocfToNetIncomeRatio <= 0 && sector !== 'Properties & Real Estate' && route !== 'PURE_CYCLICAL') {
      wSector = 0;
      sectorDisabled = true;
      confidenceNotes.push('Trigger Data: OCF Negatif (OCF/NI ≤ 0) → Bobot P/CF dikunci ke 0%');
    }

    if (peerCorrelation < 0.70) {
      wRelVal = 0;
      relValDisabled = true;
      confidenceNotes.push(`Trigger Data: Korelasi Peer ρ=${peerCorrelation.toFixed(2)} < 0.70 → Bobot RelVal dikunci ke 0%`);
    }

    // Ensure at least one leg has positive weight if both triggers fired
    if (wSector + wRim + wRelVal <= 0) {
      wSector = 0.50;
      wRim = 0.50;
      rimDisabled = false;
    }

    // Step 3: Outlier Penalty (> 40% deviation from median of the 3 valuation outputs)
    const sortedPrices = [sectorPriceIdr, rimPriceIdr, relValPriceIdr].slice().sort((a, b) => a - b);
    const medianPriceIdr = Math.max(50, sortedPrices[1]);

    const devSector = Math.abs(sectorPriceIdr - medianPriceIdr) / medianPriceIdr;
    const devRim = Math.abs(rimPriceIdr - medianPriceIdr) / medianPriceIdr;
    const devRelVal = Math.abs(relValPriceIdr - medianPriceIdr) / medianPriceIdr;

    let sectorSlashed = false;
    let rimSlashed = false;
    let relValSlashed = false;
    const outlierNames: string[] = [];

    if (wSector > 0 && devSector > 0.40) {
      wSector *= 0.5;
      sectorSlashed = true;
      outlierNames.push(`${sectorLabel} (deviasi ${(devSector * 100).toFixed(0)}% > 40%)`);
    }
    if (wRim > 0 && devRim > 0.40) {
      wRim *= 0.5;
      rimSlashed = true;
      outlierNames.push(`${rimLabel} (deviasi ${(devRim * 100).toFixed(0)}% > 40%)`);
    }
    if (wRelVal > 0 && devRelVal > 0.40) {
      wRelVal *= 0.5;
      relValSlashed = true;
      outlierNames.push(`${relValLabel} (deviasi ${(devRelVal * 100).toFixed(0)}% > 40%)`);
    }

    const outlierPenalizedLeg = outlierNames.length > 0 ? outlierNames.join(', ') : undefined;
    if (outlierPenalizedLeg) {
      confidenceNotes.push(`Penalti Outlier (-50% Bobot): ${outlierPenalizedLeg}`);
    }

    // Step 4: Proportional Redistribution so active weights sum strictly to 1.00 (100%)
    const rawSum = wSector + wRim + wRelVal || 1;
    const normSector = Number((wSector / rawSum).toFixed(4));
    const normRim = Number((wRim / rawSum).toFixed(4));
    const normRelVal = Number(Math.max(0, 1 - normSector - normRim).toFixed(4));

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
        id: 'STATARB_RELVAL',
        label: relValLabel,
        priceIdr: relValPriceIdr,
        weight: normRelVal,
        baseWeight: baseRelValWeight,
        isOutlierSlashed: relValSlashed,
        isDisabledByConfidence: relValDisabled
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
      medianPriceIdr,
      intrinsicValueIdr,
      ensembleFormulaAudit,
      outlierPenalizedLeg,
      confidenceNotes,
      effectiveModule,
      ocfHealthyThreshold: ocfPolicy.ocfHealthyThreshold,
      ensembleAntiJunkMultiplier
    };
  }
};

export interface GrahamJoeliardiBenchmarkResult {
  grahamJoeliardiRawIdr: number;
  grahamJoeliardiBenchmarkIdr: number;
  isMoatHaircutApplied: boolean;
  moatHaircutMultiplier: number; // 0.75 if ROE < 15% or DER > 1x, else 1.00
  moatHaircutReason?: string;
  formulaAudit: string;
}

/**
 * 5. GRAHAM-JOELIARDI "MOAT" INTRINSIC VALUE BENCHMARK (Standalone Floor Value)
 * Standalone conservative sanity check (floor value) displayed on the UI,
 * NEVER averaged into the main Quantedge Ensemble target price:
 *   Intrinsic Value = (EPS * (8.5 + (2 * g)) * 4.4) / current_SBN_10Y_Yield
 * - Inputs: Normalized_EPS for Cyclicals, Forward_EPS for Capex Aggressors, or TTM_EPS for Steady Compounders.
 * - Moat Haircut Logic: If ROE < 15% OR DER > 1.0x, applies a 25% "Weak Moat Penalty" (multiply by 0.75).
 */
export function calculateGrahamJoeliardiBenchmark(params: {
  basisEpsIdr: number;
  growthRatePct: number;
  sbn10YYieldPct: number;
  roePct: number;
  derRatio: number;
  tickRounder: (rawPrice: number) => number;
}): GrahamJoeliardiBenchmarkResult {
  const { basisEpsIdr, growthRatePct, sbn10YYieldPct, roePct, derRatio, tickRounder } = params;

  const safeEps = Math.max(2, basisEpsIdr);
  // Bound growth g in Graham formula to conservative [0%, 8.5%] so floor remains disciplined
  const safeG = Math.max(0, Math.min(8.5, growthRatePct));
  const safeSbn10Y = Math.max(5.0, Math.min(10.5, sbn10YYieldPct || 6.75));

  // Classic Graham-Joeliardi Formula adapted to Indonesia SBN 10Y Yield
  const rawFormulaValue = (safeEps * (8.5 + 2 * safeG) * 4.4) / safeSbn10Y;
  const grahamJoeliardiRawIdr = tickRounder(Math.max(50, rawFormulaValue));

  // Moat Haircut Logic: ROE < 15% OR DER > 1.0x -> 25% Weak Moat Penalty (x0.75)
  const isLowRoe = roePct < 15.0;
  const isHighDer = derRatio > 1.0;
  const isMoatHaircutApplied = isLowRoe || isHighDer;
  const moatHaircutMultiplier = isMoatHaircutApplied ? 0.75 : 1.0;

  const grahamJoeliardiBenchmarkIdr = tickRounder(
    Math.max(50, rawFormulaValue * moatHaircutMultiplier)
  );

  const haircutReasons: string[] = [];
  if (isLowRoe) haircutReasons.push(`ROE ${roePct.toFixed(1)}% < 15%`);
  if (isHighDer) haircutReasons.push(`DER ${derRatio.toFixed(2)}x > 1,0x`);

  const moatHaircutReason = isMoatHaircutApplied
    ? `Weak Moat Penalty -25% (×0,75 karena ${haircutReasons.join(' & ')})`
    : 'Moat Kuat Terverifikasi (ROE ≥ 15% & DER ≤ 1,0x · Tanpa Potongan Haircut)';

  const formulaAudit = `(EPS Rp ${safeEps.toLocaleString('id-ID')} × (8,5 + 2×${safeG.toFixed(1)}) × 4,4 ÷ SBN10Y ${safeSbn10Y.toFixed(2)}%)${
    isMoatHaircutApplied ? ' × 0,75 (Weak Moat Haircut)' : ''
  } = Rp ${grahamJoeliardiBenchmarkIdr.toLocaleString('id-ID')}`;

  return {
    grahamJoeliardiRawIdr,
    grahamJoeliardiBenchmarkIdr,
    isMoatHaircutApplied,
    moatHaircutMultiplier,
    moatHaircutReason,
    formulaAudit
  };
}
