/**
 * ============================================================================
 * NOSTRADAMUS QUANT TERMINAL (IHSG) — SECTOR PROFILE CONFIGURATION (SSOT)
 * ============================================================================
 * Single Source of Truth (SSOT) for all sector-specific adjustments across:
 * 1. Metric Routing & Accounting Bypasses (Pillar 1–4)
 * 2. Valuation Module Routing (Compounder / Capex_Aggressor / Pure_Cyclical)
 * 3. Valuation Ensemble Legs & Cluster Correlation Groups
 * 4. Ohlson-Penman Residual Income Persistence (ω), Fade Horizon & Growth Cap (g)
 * 5. Through-the-Cycle Earnings / ROE Normalization Policy
 * 6. Cost of Equity (Ke) SBN Tenor Weights (1Y/5Y/10Y) & Risk Premia
 * 7. Graham-Joeliardi Standalone Floor Policy & Weak-Moat Tolerances
 * 8. Accrual / Leverage Penalty Policy & Pillar Scoring Weights
 * 9. Volatility-Targeted Sizing, Stop-Loss Bands & Statistical Arbitrage Peer Pools
 * 10. Data Requirements & Conservative Fallback Downgrade Rules
 *
 * NOTE: Initial numeric thresholds are marked with [TODO-CALIBRATE: Fase 4]
 * alongside academic/empirical references for formal calibration in Fase 4.
 */

export enum IdxSectorEnum {
  FINANCIALS = 'Financials',
  ENERGY = 'Energy',
  BASIC_MATERIALS = 'Basic Materials',
  CONSUMER_NON_CYCLICALS = 'Consumer Non-Cyclicals',
  CONSUMER_CYCLICALS = 'Consumer Cyclicals',
  HEALTHCARE = 'Healthcare',
  INFRASTRUCTURES = 'Infrastructures',
  INDUSTRIALS = 'Industrials',
  PROPERTIES_REAL_ESTATE = 'Properties & Real Estate',
  TECHNOLOGY = 'Technology',
  TRANSPORTATION_LOGISTICS = 'Transportation & Logistics'
}

export const ALL_IDX_SECTORS: readonly IdxSectorEnum[] = [
  IdxSectorEnum.FINANCIALS,
  IdxSectorEnum.ENERGY,
  IdxSectorEnum.BASIC_MATERIALS,
  IdxSectorEnum.CONSUMER_NON_CYCLICALS,
  IdxSectorEnum.CONSUMER_CYCLICALS,
  IdxSectorEnum.HEALTHCARE,
  IdxSectorEnum.INFRASTRUCTURES,
  IdxSectorEnum.INDUSTRIALS,
  IdxSectorEnum.PROPERTIES_REAL_ESTATE,
  IdxSectorEnum.TECHNOLOGY,
  IdxSectorEnum.TRANSPORTATION_LOGISTICS
] as const;

/**
 * FASE 3 SSOT: Indonesia Equity Risk Premium (ERP) Configuration
 * Replaces hardcoded 5.5% magic number with an auditable, timestamped configuration.
 * [TODO-CALIBRATE: Fase 4] Update dynamically via Damodaran Country Risk / Indonesia 5Y CDS spread.
 */
export const INDONESIA_ERP_CONFIG = {
  baseErpPct: 5.50,
  asOfDate: '2026-11-01',
  source: 'Damodaran Implied Country ERP & Indonesia 5Y Sovereign CDS Calibration [TODO-CALIBRATE: Fase 4]'
} as const;

export enum IdxSubIndustryEnum {
  // 1. Financials
  BANK_KBMI3_4 = 'BANK_KBMI3_4',
  BANK_MICRO_SHARIA = 'BANK_MICRO_SHARIA',
  MULTIFINANCE = 'MULTIFINANCE',
  INSURANCE = 'INSURANCE',
  FINANCIAL_HOLDING_INVESTMENT = 'FINANCIAL_HOLDING_INVESTMENT',

  // 2. Energy & CPO
  COAL_MINING = 'COAL_MINING',
  OIL_GAS_ENERGY = 'OIL_GAS_ENERGY',
  ENERGY_SERVICES_CONTRACTOR = 'ENERGY_SERVICES_CONTRACTOR',

  // 3. Basic Materials
  METALS_MINING_DOWNSTREAM = 'METALS_MINING_DOWNSTREAM',
  CEMENT_CHEMICALS_BASIC = 'CEMENT_CHEMICALS_BASIC',
  PULP_PAPER_PACKAGING = 'PULP_PAPER_PACKAGING',

  // 4. Consumer Non-Cyclicals
  FMCG_FOOD_BEVERAGE = 'FMCG_FOOD_BEVERAGE',
  AGRI_POULTRY_STAPLE = 'AGRI_POULTRY_STAPLE',
  PLANTATION_CPO = 'PLANTATION_CPO',
  STAPLE_RETAIL_DISTRIBUTION = 'STAPLE_RETAIL_DISTRIBUTION',

  // 5. Consumer Cyclicals (SPLIT into 3 distinct sub-industries)
  AUTO_COMPONENTS = 'AUTO_COMPONENTS',
  RETAIL_FNB_LIFESTYLE = 'RETAIL_FNB_LIFESTYLE',
  MEDIA_HOSPITALITY_LEISURE = 'MEDIA_HOSPITALITY_LEISURE',

  // 6. Healthcare (SPLIT into Hospitals vs Pharma)
  HOSPITAL_CLINIC = 'HOSPITAL_CLINIC',
  PHARMA_MEDTECH = 'PHARMA_MEDTECH',

  // 7. Infrastructures
  TELECOM_TOWER_INFRA = 'TELECOM_TOWER_INFRA',
  UTILITIES_TOLL_PORT = 'UTILITIES_TOLL_PORT',
  CONSTRUCTION_EPC = 'CONSTRUCTION_EPC',

  // 8. Industrials
  CONGLOMERATE_HOLDING = 'CONGLOMERATE_HOLDING',
  INDUSTRIAL_MANUFACTURING = 'INDUSTRIAL_MANUFACTURING',

  // 9. Properties & Real Estate
  PROPERTY_DEVELOPER = 'PROPERTY_DEVELOPER',
  INDUSTRIAL_ESTATE = 'INDUSTRIAL_ESTATE',

  // 10. Technology
  TECH_PLATFORM_SOFTWARE = 'TECH_PLATFORM_SOFTWARE',
  TECH_HARDWARE_IT_SERVICES = 'TECH_HARDWARE_IT_SERVICES',

  // 11. Transportation & Logistics
  TRANSPORTATION_LOGISTICS = 'TRANSPORTATION_LOGISTICS'
}

export type SectorArchetypeId =
  | 'BANK_MAJOR_MID'
  | 'BANK_MICRO_SHARIA_MULTIFINANCE'
  | 'INSURANCE'
  | 'ENERGY_COAL_CPO'
  | 'METALS_DOWNSTREAM'
  | 'BASIC_MATERIALS_CYCLICAL'
  | 'PROPERTY_INDUSTRIAL_ESTATE'
  | 'INFRA_TELCO_TOWER_UTILITIES'
  | 'TRANSPORTATION_LOGISTICS'
  | 'CONSUMER_NON_CYCLICAL_FMCG'
  | 'CYCLICAL_AUTO_COMPONENTS'
  | 'CYCLICAL_RETAIL_FNB'
  | 'CYCLICAL_MEDIA_LEISURE'
  | 'HEALTHCARE_HOSPITALS'
  | 'HEALTHCARE_PHARMA'
  | 'INDUSTRIALS_HOLDING'
  | 'TECHNOLOGY'
  | 'CONSERVATIVE_FALLBACK';

export type LegacySectorMethodologyRegime =
  | 'FINANCIALS'
  | 'CYCLICAL_COMMODITIES'
  | 'PROPERTIES_REAL_ESTATE'
  | 'INFRA_TELCO_UTILITIES'
  | 'CORE_CORPORATE'
  | 'TECH_UNPROFITABLE_GROWTH';

export type NormalizationPolicyType =
  | 'TTM'
  | 'MEDIAN_5Y'
  | 'MID_CYCLE_7_10Y'
  | 'MIN_TTM_AVG3Y';

export type ValuationClusterGroup =
  | 'BOOK_RETURN'
  | 'EARNINGS_FLOW'
  | 'ASSET_NAV';

export interface SectorValuationLegConfig {
  id: string;
  label: string;
  shortMetric: string;
  baseWeight: number;
  clusterGroup: ValuationClusterGroup;
  parameterNote: string;
}

export interface SectorProfile {
  archetype: SectorArchetypeId;
  subArchetype: string;
  displayName: string;
  shortBadgeLabel: string;
  legacyRegime: LegacySectorMethodologyRegime;
  valuationRoute: 'STEADY_COMPOUNDER' | 'CAPEX_AGGRESSOR' | 'PURE_CYCLICAL';
  appliedModule: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  /**
   * Closing Finding D: When true, Capex_Aggressor module requires verified real CapEx & D&A
   * plus ROIC > Ke; otherwise downgrades to Pure_Cyclical so synthetic CWIP never inflates FV.
   */
  requiresVerifiedRoicForCapexModule: boolean;
  isCyclicalArchetype: boolean;
  bypassedMetrics: string[];
  requiredMetrics: string[];
  sectorSpecificRequiredMetrics: string[];
  normalizationPolicy: NormalizationPolicyType;
  valuationLegs: SectorValuationLegConfig[];
  /**
   * [TODO-CALIBRATE: Fase 4] Ohlson (1995) & Dechow, Hutton & Sloan (1999) abnormal earnings persistence ω
   */
  omegaRange: {
    min: number;
    base: number;
    max: number;
    fadeYears: number;
    tierLabel: string;
  };
  /**
   * [TODO-CALIBRATE: Fase 4] Sustainable terminal growth cap (%) & minimum Ke - g spread (%)
   */
  gCap: number;
  terminalSpreadMin: number;
  /**
   * [TODO-CALIBRATE: Fase 4] Deterministic SBN tenor weights (1Y/5Y/10Y) eliminating dividend-yield circularity
   */
  keAdjustments: {
    sbnWeights: { w1Y: number; w5Y: number; w10Y: number };
    betaPolicy: 'BLUME' | 'VASICEK';
    betaClamp: [number, number];
    liquidityPremiumBps: number;
    governancePremiumBps: number;
    cyclicalityPremiumBps: number;
  };
  /**
   * [TODO-CALIBRATE: Fase 4] Sector-aware Graham-Joeliardi floor policy
   */
  floorPolicy: {
    mode:
      | 'STANDARD_MOAT'
      | 'BANK_BVPS_JUSTIFIED'
      | 'CYCLICAL_MID_CYCLE_BVPS'
      | 'ASSET_RNAV_DISCOUNT';
    maxRatioToEnsemble: number;
    roeHaircutThresholdPct: number;
    derHaircutThreshold: number | null;
    weakMoatHaircutFactor: number;
  };
  /**
   * [TODO-CALIBRATE: Fase 4] Sector-aware accrual & weak-moat penalty policy
   */
  penaltyPolicy: {
    accrualMode:
      | 'STANDARD_OCF_NI'
      | 'CAPEX_TOLERANT_OCF_NI'
      | 'PSAK72_RELAXED'
      | 'BANK_PROVISION_BYPASS';
    ocfHealthyThreshold: number;
    weakMoatToleranceSpreadPct: number;
    maxDerTolerance: number | null;
  };
  scoringWeights: {
    businessQuality: number;
    balanceSheetHealth: number;
    valuationSafety: number;
    oosRobustness: number;
  };
  sizingParams: {
    maxVolTargetPct: number;
    maxPositionCapPct: number;
    stopBandAtrMult: [number, number];
    stopPctClamp: [number, number];
  };
  liquidityPolicy: {
    minInstitutionalAdtvIdr: number;
    maxAdtvParticipationPct: number;
  };
  /**
   * Strict business-model-matched Statistical Arbitrage peer candidates
   */
  statArbPeerPool: string[];
  dataRequirements: {
    coreFields: string[];
    sectorSpecificFields: string[];
    downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)' | 'C (SPECULATIVE)';
    missingSectorFlagLabel: string;
  };
  academicCitation: string;
}

/**
 * Master Configuration Dictionary of All 18 Sector Profiles (17 Archetypes/Sub-Archetypes + Conservative Fallback)
 */
export const SECTOR_PROFILES: Record<SectorArchetypeId, SectorProfile> = {
  // 1. Bank Besar & Menengah (KBMI 3 & 4)
  BANK_MAJOR_MID: {
    archetype: 'BANK_MAJOR_MID',
    subArchetype: 'BANK_KBMI3_4',
    displayName: 'Perbankan Besar & Menengah (KBMI 3–4)',
    shortBadgeLabel: 'MODE SEKTOR: BANK KBMI 3–4',
    legacyRegime: 'FINANCIALS',
    valuationRoute: 'STEADY_COMPOUNDER',
    appliedModule: 'Compounder',
    requiresVerifiedRoicForCapexModule: false,
    isCyclicalArchetype: false,
    bypassedMetrics: [
      'GP/A (Novy-Marx)',
      'OCF/NI & Sloan Accrual',
      'Corporate Debt-to-Equity (DER)',
      'EV/EBITDA & CapEx/D&A'
    ],
    requiredMetrics: [
      'ROE vs Ke Spread (Excess Return)',
      'True ROA (Net Income / Total Assets)',
      'Justified PBV (Damodaran Gordon)',
      'Multi-Stage Residual Income (RIM)'
    ],
    sectorSpecificRequiredMetrics: ['NIM', 'CoC', 'NPL', 'BOPO', 'CAR', 'LDR_CASA'],
    normalizationPolicy: 'MEDIAN_5Y',
    valuationLegs: [
      {
        id: 'justified_pbv',
        label: 'Damodaran Justified PBV',
        shortMetric: 'Justified PBV',
        baseWeight: 0.45,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '(ROE_norm - g) / (Ke - g)'
      },
      {
        id: 'multistage_rim',
        label: 'Ohlson-Penman Residual Income (RIM)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.35,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '7Y Fade, ω 0.85–0.96'
      },
      {
        id: 'forward_pe_payout',
        label: 'Normalized P/E & Dividend Payout Anchor',
        shortMetric: 'Norm P/E 5Y',
        baseWeight: 0.20,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: '5Y Median P/E & Dividend Yield Anchor'
      }
    ],
    // [TODO-CALIBRATE: Fase 4] Dechow, Hutton & Sloan (1999) high persistence for CASA-moat banks
    omegaRange: {
      min: 0.82,
      base: 0.90,
      max: 0.96,
      fadeYears: 7,
      tierLabel: 'Perbankan KBMI 3–4 Moat CASA (ω 0.82–0.96)'
    },
    gCap: 5.5,
    terminalSpreadMin: 3.5,
    keAdjustments: {
      sbnWeights: { w1Y: 0.25, w5Y: 0.35, w10Y: 0.40 },
      betaPolicy: 'BLUME',
      betaClamp: [0.55, 1.45],
      liquidityPremiumBps: 0,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 0
    },
    floorPolicy: {
      mode: 'BANK_BVPS_JUSTIFIED',
      maxRatioToEnsemble: 0.88,
      roeHaircutThresholdPct: 11.5, // Bank-aware ROE threshold (vs 15% corporate)
      derHaircutThreshold: null, // Bypass corporate DER>1.0 haircut for banks!
      weakMoatHaircutFactor: 0.80
    },
    penaltyPolicy: {
      accrualMode: 'BANK_PROVISION_BYPASS',
      ocfHealthyThreshold: 0.0,
      weakMoatToleranceSpreadPct: -0.75,
      maxDerTolerance: null
    },
    scoringWeights: {
      businessQuality: 0.32,
      balanceSheetHealth: 0.28,
      valuationSafety: 0.22,
      oosRobustness: 0.18
    },
    sizingParams: {
      maxVolTargetPct: 12.5,
      maxPositionCapPct: 12.5,
      stopBandAtrMult: [1.8, 2.5],
      stopPctClamp: [4.5, 11.0]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 15_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['BBCA', 'BMRI', 'BBRI', 'BBNI', 'BNGA', 'NISP', 'BDMN', 'BNLI', 'BBTN'],
    dataRequirements: {
      coreFields: ['netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['nimPct', 'nplPct', 'carPct', 'bopoPct'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA BANK TIDAK LENGKAP'
    },
    academicCitation: 'Damodaran (2013) Valuing Financial Service Firms; Ohlson (1995) EBO'
  },

  // 2. Bank Mikro / Syariah & Multifinance (BTPS, BRIS, BFIN, ADMF, CFIN)
  BANK_MICRO_SHARIA_MULTIFINANCE: {
    archetype: 'BANK_MICRO_SHARIA_MULTIFINANCE',
    subArchetype: 'MICRO_SHARIA_MULTIFINANCE',
    displayName: 'Bank Mikro/Syariah & Multifinance',
    shortBadgeLabel: 'MODE SEKTOR: MIKRO/SYARIAH & MULTIFINANCE',
    legacyRegime: 'FINANCIALS',
    valuationRoute: 'STEADY_COMPOUNDER',
    appliedModule: 'Compounder',
    requiresVerifiedRoicForCapexModule: false,
    isCyclicalArchetype: false,
    bypassedMetrics: [
      'GP/A (Novy-Marx)',
      'OCF/NI & Sloan Accrual',
      'EV/EBITDA & CapEx/D&A'
    ],
    requiredMetrics: [
      'ROE Median 5Y vs Ke Spread',
      'True ROA (NI / Total Assets)',
      'Gearing / Asset Leverage & Cost of Credit Proxy',
      'Justified PBV & RIM'
    ],
    sectorSpecificRequiredMetrics: ['FinancingYield', 'CoC', 'NPF_NPL', 'CAR_Gearing'],
    normalizationPolicy: 'MEDIAN_5Y',
    valuationLegs: [
      {
        id: 'justified_pbv',
        label: 'Normalized PBV-ROE (5Y Median ROE)',
        shortMetric: 'Justified PBV',
        baseWeight: 0.45,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: 'Lower gCap 4.25% for credit-cycle provisioning'
      },
      {
        id: 'multistage_rim',
        label: 'Multi-Stage RIM (Credit-Cycle Adjusted ω)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.35,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '6Y Fade, ω 0.72–0.84'
      },
      {
        id: 'forward_pe_payout',
        label: 'Normalized Earnings & Yield Anchor',
        shortMetric: 'Norm P/E 5Y',
        baseWeight: 0.20,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: '5Y Normalized P/E'
      }
    ],
    // [TODO-CALIBRATE: Fase 4] Lower persistence than KBMI 4 due to micro-credit CoC cyclicality
    omegaRange: {
      min: 0.72,
      base: 0.78,
      max: 0.84,
      fadeYears: 6,
      tierLabel: 'Bank Mikro/Syariah & Multifinance (ω 0.72–0.84)'
    },
    gCap: 4.25,
    terminalSpreadMin: 4.0,
    keAdjustments: {
      sbnWeights: { w1Y: 0.30, w5Y: 0.40, w10Y: 0.30 },
      betaPolicy: 'BLUME',
      betaClamp: [0.65, 1.55],
      liquidityPremiumBps: 25,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 35
    },
    floorPolicy: {
      mode: 'BANK_BVPS_JUSTIFIED',
      maxRatioToEnsemble: 0.86,
      roeHaircutThresholdPct: 11.5,
      derHaircutThreshold: 4.5, // Multifinance gearing limit
      weakMoatHaircutFactor: 0.75
    },
    penaltyPolicy: {
      accrualMode: 'BANK_PROVISION_BYPASS',
      ocfHealthyThreshold: 0.0,
      weakMoatToleranceSpreadPct: -0.5,
      maxDerTolerance: 4.5
    },
    scoringWeights: {
      businessQuality: 0.30,
      balanceSheetHealth: 0.30,
      valuationSafety: 0.22,
      oosRobustness: 0.18
    },
    sizingParams: {
      maxVolTargetPct: 10.5,
      maxPositionCapPct: 11.0,
      stopBandAtrMult: [2.0, 2.8],
      stopPctClamp: [5.0, 12.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 5_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    // Strict business-model peer matching: BTPS pairs with BRIS/BFIN/ADMF, never BBCA
    statArbPeerPool: ['BRIS', 'BTPS', 'BFIN', 'ADMF', 'CFIN', 'ARTO', 'AGRO'],
    dataRequirements: {
      coreFields: ['netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['nimPct', 'nplPct', 'carPct', 'bopoPct'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA BANK TIDAK LENGKAP'
    },
    academicCitation: 'Damodaran (2013) Microfinance & Specialty Lenders; OJK POJK KPMM/NPF'
  },

  // 3. Asuransi (TUGU, LIFE, PNIN, PNLF, ABDA, MREI)
  INSURANCE: {
    archetype: 'INSURANCE',
    subArchetype: 'INSURANCE_UNDERWRITING',
    displayName: 'Asuransi Umum, Jiwa & Reasuransi',
    shortBadgeLabel: 'MODE SEKTOR: ASURANSI',
    legacyRegime: 'FINANCIALS',
    valuationRoute: 'STEADY_COMPOUNDER',
    appliedModule: 'Compounder',
    requiresVerifiedRoicForCapexModule: false,
    isCyclicalArchetype: false,
    bypassedMetrics: [
      'GP/A (Novy-Marx)',
      'OCF/NI & Sloan Accrual',
      'Corporate Debt-to-Equity (DER)',
      'EV/EBITDA'
    ],
    requiredMetrics: [
      'ROE Median 5Y vs Ke Spread',
      'True ROA & Float Leverage',
      'PBV-ROE & Embedded Book Value'
    ],
    sectorSpecificRequiredMetrics: ['CombinedRatio', 'RBC_Solvency'],
    normalizationPolicy: 'MEDIAN_5Y',
    valuationLegs: [
      {
        id: 'justified_pbv',
        label: 'PBV-ROE & Book Float Valuation',
        shortMetric: 'Justified PBV',
        baseWeight: 0.50,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: 'Normalized 5Y ROE on Book Equity'
      },
      {
        id: 'multistage_rim',
        label: 'Residual Income Model (RIM)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.30,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '6Y Fade, ω 0.72–0.82'
      },
      {
        id: 'forward_pe_payout',
        label: 'Normalized Underwriting P/E',
        shortMetric: 'Norm P/E 5Y',
        baseWeight: 0.20,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: '5Y Median P/E'
      }
    ],
    omegaRange: {
      min: 0.70,
      base: 0.76,
      max: 0.82,
      fadeYears: 6,
      tierLabel: 'Asuransi & Float Underwriting (ω 0.70–0.82)'
    },
    gCap: 4.5,
    terminalSpreadMin: 3.8,
    keAdjustments: {
      sbnWeights: { w1Y: 0.20, w5Y: 0.30, w10Y: 0.50 },
      betaPolicy: 'BLUME',
      betaClamp: [0.55, 1.35],
      liquidityPremiumBps: 30,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 0
    },
    floorPolicy: {
      mode: 'BANK_BVPS_JUSTIFIED',
      maxRatioToEnsemble: 0.86,
      roeHaircutThresholdPct: 10.5,
      derHaircutThreshold: null,
      weakMoatHaircutFactor: 0.75
    },
    penaltyPolicy: {
      accrualMode: 'BANK_PROVISION_BYPASS',
      ocfHealthyThreshold: 0.0,
      weakMoatToleranceSpreadPct: -0.75,
      maxDerTolerance: null
    },
    scoringWeights: {
      businessQuality: 0.30,
      balanceSheetHealth: 0.30,
      valuationSafety: 0.25,
      oosRobustness: 0.15
    },
    sizingParams: {
      maxVolTargetPct: 10.5,
      maxPositionCapPct: 10.5,
      stopBandAtrMult: [1.8, 2.5],
      stopPctClamp: [4.5, 11.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 2_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['TUGU', 'PNLF', 'PNIN', 'LIFE', 'ABDA', 'MREI'],
    dataRequirements: {
      coreFields: ['netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: [],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA ASURANSI PARSIAL'
    },
    academicCitation: ' Nissim (2010) Analysis and Valuation of Insurance Companies'
  },

  // 4. Energi / Batu Bara, Migas & CPO Perkebunan (ITMG, ADRO, PTBA, MEDC, LSIP, AALI, TAPG)
  ENERGY_COAL_CPO: {
    archetype: 'ENERGY_COAL_CPO',
    subArchetype: 'COMMODITY_ENERGY_CPO',
    displayName: 'Energi, Batu Bara, Migas & Perkebunan CPO',
    shortBadgeLabel: 'MODE SEKTOR: KOMODITAS & CPO (SIKLIKAL)',
    legacyRegime: 'CYCLICAL_COMMODITIES',
    valuationRoute: 'PURE_CYCLICAL',
    appliedModule: 'Pure_Cyclical',
    requiresVerifiedRoicForCapexModule: true,
    isCyclicalArchetype: true,
    bypassedMetrics: [
      'Peak-Cycle TTM ROE Extrapolation (Diganti Mid-Cycle 5–7Y ROE)'
    ],
    requiredMetrics: [
      'Normalized Mid-Cycle ROE (5–7Y) vs TTM ROE',
      'Normalized P/CF & EV/EBITDA Siklus Komoditas',
      'Net Cash / Net Debt-to-EBITDA & Buffer Royalti/DMO',
      'Total Shareholder Yield (Dividen + Buyback)'
    ],
    sectorSpecificRequiredMetrics: ['NormalizedRoe5Y', 'OcfTTM'],
    normalizationPolicy: 'MID_CYCLE_7_10Y',
    valuationLegs: [
      {
        id: 'normalized_pcf_pe',
        label: 'Normalized Mid-Cycle P/CF & Earnings Power',
        shortMetric: 'Norm P/CF',
        baseWeight: 0.45,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Mid-Cycle 5–7Y Normalized Cash Flow & Earnings'
      },
      {
        id: 'ev_ebitda_midcycle',
        label: 'Normalized EV/EBITDA & Net Cash Reserve Anchor',
        shortMetric: 'EV/EBITDA 5Y',
        baseWeight: 0.35,
        clusterGroup: 'ASSET_NAV',
        parameterNote: 'Through-the-Cycle 4.5x–6.0x EV/EBITDA'
      },
      {
        id: 'multistage_rim_fast_fade',
        label: 'Fast-Fading Residual Income (ω Cepat Luruh)',
        shortMetric: 'RIM Fast-Fade',
        baseWeight: 0.20,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '5Y Fade, ω 0.40–0.58'
      }
    ],
    // [TODO-CALIBRATE: Fase 4] Mean-reverting commodity supercycle persistence
    omegaRange: {
      min: 0.40,
      base: 0.48,
      max: 0.58,
      fadeYears: 5,
      tierLabel: 'Komoditas & CPO Siklikal (ω Cepat Luruh 0.40–0.58)'
    },
    gCap: 3.5,
    terminalSpreadMin: 4.5,
    keAdjustments: {
      sbnWeights: { w1Y: 0.35, w5Y: 0.40, w10Y: 0.25 },
      betaPolicy: 'BLUME',
      betaClamp: [0.65, 1.55],
      liquidityPremiumBps: 0,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 50
    },
    floorPolicy: {
      mode: 'CYCLICAL_MID_CYCLE_BVPS',
      maxRatioToEnsemble: 0.85,
      roeHaircutThresholdPct: 12.0,
      derHaircutThreshold: 1.0,
      weakMoatHaircutFactor: 0.75
    },
    penaltyPolicy: {
      accrualMode: 'STANDARD_OCF_NI',
      ocfHealthyThreshold: 0.80,
      weakMoatToleranceSpreadPct: -1.5, // Tolerates trough ROE dip without permanent moat rejection
      maxDerTolerance: 1.0
    },
    scoringWeights: {
      businessQuality: 0.25,
      balanceSheetHealth: 0.30,
      valuationSafety: 0.25,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 10.5,
      maxPositionCapPct: 11.0,
      stopBandAtrMult: [2.2, 3.0],
      stopPctClamp: [5.5, 13.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 8_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['ITMG', 'ADRO', 'PTBA', 'BSSR', 'GEMS', 'MEDC', 'PGAS', 'LSIP', 'AALI', 'TAPG', 'DSNG'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ocfTTM', 'ebitdaTTM'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA ARUS KAS KOMODITAS PARSIAL'
    },
    academicCitation: 'Damodaran (2009) Valuing Cyclical & Commodity Companies (Mid-Cycle Normalization)'
  },

  // 5. Logam & Hilirisasi (AMMN, ANTM, INCO, MDKA, NCKL, MBMA, TINS)
  METALS_DOWNSTREAM: {
    archetype: 'METALS_DOWNSTREAM',
    subArchetype: 'METALS_SMELTER_DOWNSTREAM',
    displayName: 'Logam, Tambang Mineral & Hilirisasi Smelter',
    shortBadgeLabel: 'MODE SEKTOR: LOGAM & HILIRISASI',
    legacyRegime: 'CYCLICAL_COMMODITIES',
    valuationRoute: 'CAPEX_AGGRESSOR',
    appliedModule: 'Capex_Aggressor',
    // Closing Finding D: Capex_Aggressor ONLY when verified real CapEx/D&A & ROIC > Ke; else Pure_Cyclical
    requiresVerifiedRoicForCapexModule: true,
    isCyclicalArchetype: true,
    bypassedMetrics: [
      'Peak-Cycle TTM ROE Extrapolation'
    ],
    requiredMetrics: [
      'ROIC Proyek vs Ke (Verifikasi Ekspansi Smelter)',
      'CapEx/D&A Aktual (Bukan Imputasi Sintetik CWIP)',
      'Normalized EV/EBITDA & 2-Stage RIM'
    ],
    sectorSpecificRequiredMetrics: ['CapexTTM', 'DaTTM', 'RoicTTM'],
    normalizationPolicy: 'MID_CYCLE_7_10Y',
    valuationLegs: [
      {
        id: 'ev_ebitda_downstream',
        label: 'Normalized EV/EBITDA Hilirisasi',
        shortMetric: 'EV/EBITDA',
        baseWeight: 0.40,
        clusterGroup: 'ASSET_NAV',
        parameterNote: 'Mid-Cycle Smelter EV/EBITDA'
      },
      {
        id: 'multistage_rim_project',
        label: '2-Stage Project ROIC Residual Income',
        shortMetric: '2-Stage RIM',
        baseWeight: 0.35,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '6Y Fade, ω 0.58–0.74 (Verified ROIC > Ke)'
      },
      {
        id: 'normalized_pcf',
        label: 'Normalized Operating Cash Flow Multiple',
        shortMetric: 'Norm P/CF',
        baseWeight: 0.25,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Maintenance-CapEx Adjusted OCF'
      }
    ],
    omegaRange: {
      min: 0.55,
      base: 0.65,
      max: 0.74,
      fadeYears: 6,
      tierLabel: 'Logam & Hilirisasi Smelter (ω 0.55–0.74)'
    },
    gCap: 4.5,
    terminalSpreadMin: 4.0,
    keAdjustments: {
      sbnWeights: { w1Y: 0.20, w5Y: 0.40, w10Y: 0.40 },
      betaPolicy: 'BLUME',
      betaClamp: [0.75, 1.55],
      liquidityPremiumBps: 0,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 45
    },
    floorPolicy: {
      mode: 'CYCLICAL_MID_CYCLE_BVPS',
      maxRatioToEnsemble: 0.85,
      roeHaircutThresholdPct: 11.0,
      derHaircutThreshold: 1.2,
      weakMoatHaircutFactor: 0.75
    },
    penaltyPolicy: {
      accrualMode: 'CAPEX_TOLERANT_OCF_NI',
      ocfHealthyThreshold: 0.50,
      weakMoatToleranceSpreadPct: -1.0,
      maxDerTolerance: 1.25
    },
    scoringWeights: {
      businessQuality: 0.26,
      balanceSheetHealth: 0.28,
      valuationSafety: 0.26,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 10.5,
      maxPositionCapPct: 11.0,
      stopBandAtrMult: [2.2, 3.0],
      stopPctClamp: [5.5, 13.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 10_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['AMMN', 'ANTM', 'INCO', 'NCKL', 'MDKA', 'MBMA', 'TINS'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['capexTTM', 'daTTM'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA CAPEX/D&A HILIRISASI TIDAK LENGKAP'
    },
    academicCitation: 'Koller, Goedhart & Wessels (McKinsey Valuation) Capital-Intensive Cyclicals'
  },

  // 6. Bahan Dasar Siklikal: Semen, Kimia, Pulp & Paper (SMGR, INTP, TPIA, INKP, TKIM, AVIA)
  BASIC_MATERIALS_CYCLICAL: {
    archetype: 'BASIC_MATERIALS_CYCLICAL',
    subArchetype: 'CEMENT_CHEMICALS_PULP',
    displayName: 'Bahan Dasar: Semen, Petrokimia & Pulp/Kertas',
    shortBadgeLabel: 'MODE SEKTOR: BAHAN DASAR SIKLIKAL',
    legacyRegime: 'CYCLICAL_COMMODITIES',
    valuationRoute: 'PURE_CYCLICAL',
    appliedModule: 'Pure_Cyclical',
    requiresVerifiedRoicForCapexModule: true,
    isCyclicalArchetype: true,
    bypassedMetrics: [
      'Peak-Cycle TTM ROE Extrapolation'
    ],
    requiredMetrics: [
      'Normalized Mid-Cycle ROE & Utilization Margin',
      'EV/EBITDA & Replacement Cost Book Value',
      'Net Debt / EBITDA & Free Cash Flow Conversion'
    ],
    sectorSpecificRequiredMetrics: ['EbitdaTTM', 'OcfTTM'],
    normalizationPolicy: 'MID_CYCLE_7_10Y',
    valuationLegs: [
      {
        id: 'ev_ebitda_midcycle',
        label: 'Mid-Cycle EV/EBITDA Multiple',
        shortMetric: 'EV/EBITDA',
        baseWeight: 0.45,
        clusterGroup: 'ASSET_NAV',
        parameterNote: 'Mid-Cycle Industrial Materials EV/EBITDA'
      },
      {
        id: 'normalized_pcf',
        label: 'Normalized P/CF Cash Flow Anchor',
        shortMetric: 'Norm P/CF',
        baseWeight: 0.35,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Operating Cash Flow per Share'
      },
      {
        id: 'multistage_rim',
        label: 'Residual Income Model (Siklikal)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.20,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '5Y Fade, ω 0.45–0.60'
      }
    ],
    omegaRange: {
      min: 0.45,
      base: 0.52,
      max: 0.60,
      fadeYears: 5,
      tierLabel: 'Bahan Dasar Siklikal (ω 0.45–0.60)'
    },
    gCap: 4.0,
    terminalSpreadMin: 4.2,
    keAdjustments: {
      sbnWeights: { w1Y: 0.25, w5Y: 0.40, w10Y: 0.35 },
      betaPolicy: 'BLUME',
      betaClamp: [0.65, 1.50],
      liquidityPremiumBps: 0,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 35
    },
    floorPolicy: {
      mode: 'CYCLICAL_MID_CYCLE_BVPS',
      maxRatioToEnsemble: 0.85,
      roeHaircutThresholdPct: 11.0,
      derHaircutThreshold: 1.1,
      weakMoatHaircutFactor: 0.75
    },
    penaltyPolicy: {
      accrualMode: 'STANDARD_OCF_NI',
      ocfHealthyThreshold: 0.80,
      weakMoatToleranceSpreadPct: -1.0,
      maxDerTolerance: 1.1
    },
    scoringWeights: {
      businessQuality: 0.26,
      balanceSheetHealth: 0.29,
      valuationSafety: 0.25,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 11.0,
      maxPositionCapPct: 11.5,
      stopBandAtrMult: [2.0, 2.8],
      stopPctClamp: [5.0, 12.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 5_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['SMGR', 'INTP', 'INKP', 'TKIM', 'TPIA', 'BRPT', 'ESSA', 'AVIA'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ebitdaTTM', 'ocfTTM'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA BAHAN DASAR PARSIAL'
    },
    academicCitation: 'Damodaran (2009) Valuing Commodity & Basic Material Cyclicals'
  },

  // 7. Properti & Kawasan Industri (CTRA, BSDE, PWON, SMRA, DMAS, PANI)
  PROPERTY_INDUSTRIAL_ESTATE: {
    archetype: 'PROPERTY_INDUSTRIAL_ESTATE',
    subArchetype: 'PROPERTY_DEVELOPER_ESTATE',
    displayName: 'Properti, Developer & Kawasan Industri (PSAK 72)',
    shortBadgeLabel: 'MODE SEKTOR: PROPERTI & KAWASAN INDUSTRI',
    legacyRegime: 'PROPERTIES_REAL_ESTATE',
    valuationRoute: 'PURE_CYCLICAL',
    appliedModule: 'Pure_Cyclical',
    requiresVerifiedRoicForCapexModule: false,
    isCyclicalArchetype: true,
    bypassedMetrics: [
      'GP/A (Novy-Marx — Distorsi Landbank Jangka Panjang)',
      'Strict Quarterly OCF/NI Accrual (Relaksasi Serah Terima PSAK 72)'
    ],
    requiredMetrics: [
      'Discount to RNAV / Implied Book Value & Recurring AFFO',
      'Net Gearing (Net Debt / Equity)',
      'Operating Margin & Cash Buffer terhadap Utang'
    ],
    sectorSpecificRequiredMetrics: ['NetGearing', 'BookValue'],
    normalizationPolicy: 'MEDIAN_5Y',
    valuationLegs: [
      {
        id: 'rnav_affo_book_discount',
        label: 'RNAV / P-AFFO & Landbank Book Discount',
        shortMetric: 'P/AFFO & RNAV',
        baseWeight: 0.55,
        clusterGroup: 'ASSET_NAV',
        parameterNote: 'Discount to Landbank RNAV & Recurring Mall/Hotel AFFO'
      },
      {
        id: 'ev_ebitda_property',
        label: '5Y Historical EV/EBITDA Anchor',
        shortMetric: 'EV/EBITDA 5Y',
        baseWeight: 0.45,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: '5Y Mean EV/EBITDA'
      },
      {
        id: 'multistage_rim_zero',
        label: 'Residual Income (Bypassed 0% on Landbank Property)',
        shortMetric: 'RIM (0%)',
        baseWeight: 0.0,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '0% Weight due to PSAK 72 recognition lag'
      }
    ],
    omegaRange: {
      min: 0.45,
      base: 0.52,
      max: 0.60,
      fadeYears: 5,
      tierLabel: 'Properti & Kawasan Industri (ω 0.45–0.60)'
    },
    gCap: 4.5,
    terminalSpreadMin: 4.0,
    keAdjustments: {
      sbnWeights: { w1Y: 0.20, w5Y: 0.45, w10Y: 0.35 },
      betaPolicy: 'BLUME',
      betaClamp: [0.75, 1.50],
      liquidityPremiumBps: 20,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 30
    },
    floorPolicy: {
      mode: 'ASSET_RNAV_DISCOUNT',
      maxRatioToEnsemble: 0.85,
      roeHaircutThresholdPct: 8.5, // Property ROE is structurally lower due to idle landbank
      derHaircutThreshold: 1.0,
      weakMoatHaircutFactor: 0.78
    },
    penaltyPolicy: {
      accrualMode: 'PSAK72_RELAXED',
      ocfHealthyThreshold: 0.50,
      weakMoatToleranceSpreadPct: -2.0,
      maxDerTolerance: 1.0
    },
    scoringWeights: {
      businessQuality: 0.25,
      balanceSheetHealth: 0.30,
      valuationSafety: 0.27,
      oosRobustness: 0.18
    },
    sizingParams: {
      maxVolTargetPct: 11.0,
      maxPositionCapPct: 11.5,
      stopBandAtrMult: [2.0, 2.8],
      stopPctClamp: [5.0, 12.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 5_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['CTRA', 'BSDE', 'PWON', 'SMRA', 'DMAS', 'JRPT', 'MTLA', 'PANI'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['totalDebt', 'cashAndEquivalents'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA GEARING PROPERTI PARSIAL'
    },
    academicCitation: 'PSAK 72 Revenue Recognition; EPRA / NAREIT AFFO & RNAV Valuation'
  },

  // 8. Infrastruktur, Telco, Tower & Utilitas (TLKM, ISAT, EXCL, TOWR, TBIG, MTEL, JSMR, PGEO, BREN)
  INFRA_TELCO_TOWER_UTILITIES: {
    archetype: 'INFRA_TELCO_TOWER_UTILITIES',
    subArchetype: 'HEAVY_INFRA_TELCO_TOWER',
    displayName: 'Infrastruktur, Telekomunikasi, Menara & Utilitas',
    shortBadgeLabel: 'MODE SEKTOR: INFRA / TELKO / UTILITAS',
    legacyRegime: 'INFRA_TELCO_UTILITIES',
    valuationRoute: 'CAPEX_AGGRESSOR',
    appliedModule: 'Capex_Aggressor',
    requiresVerifiedRoicForCapexModule: false,
    isCyclicalArchetype: false,
    bypassedMetrics: [
      'Unadjusted P/E (Tertekan Beban D&A Non-Kas Menara/Jaringan/Konsesi)',
      'Manufacturing DER Threshold (Diganti Net Debt / EBITDA ≤ 3.5x)'
    ],
    requiredMetrics: [
      'EV/EBITDA & Maintenance-CapEx FCF Yield',
      'EBITDA Margin & OCF / EBITDA Conversion',
      'Net Debt / EBITDA & Interest Coverage'
    ],
    sectorSpecificRequiredMetrics: ['EbitdaTTM', 'NetDebtToEbitda'],
    normalizationPolicy: 'MIN_TTM_AVG3Y',
    valuationLegs: [
      {
        id: 'ev_ebitda_infra',
        label: 'Enterprise Value to EBITDA (EV/EBITDA)',
        shortMetric: 'EV/EBITDA',
        baseWeight: 0.50,
        clusterGroup: 'ASSET_NAV',
        parameterNote: 'Neutralizes non-cash network/concession D&A'
      },
      {
        id: 'multistage_rim_infra',
        label: 'Multi-Stage Residual Income (Regulated Concession)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.30,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '6Y Fade, ω 0.70–0.84, lower gCap 4.25%'
      },
      {
        id: 'fcf_maintenance_capex',
        label: '5Y Historical EV/EBITDA & Maintenance FCF Anchor',
        shortMetric: 'Hist EV/EBITDA',
        baseWeight: 0.20,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'OCF minus Maintenance CapEx'
      }
    ],
    omegaRange: {
      min: 0.70,
      base: 0.76,
      max: 0.84,
      fadeYears: 6,
      tierLabel: 'Infrastruktur, Telko & Utilitas (ω 0.70–0.84)'
    },
    gCap: 4.25,
    terminalSpreadMin: 3.8,
    keAdjustments: {
      sbnWeights: { w1Y: 0.15, w5Y: 0.35, w10Y: 0.50 },
      betaPolicy: 'BLUME',
      betaClamp: [0.55, 1.35],
      liquidityPremiumBps: 0,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 0
    },
    floorPolicy: {
      mode: 'STANDARD_MOAT',
      maxRatioToEnsemble: 0.88,
      roeHaircutThresholdPct: 11.0,
      derHaircutThreshold: 2.8, // Tower & toll-road project finance allows higher DER when Net Debt/EBITDA <= 3.5x
      weakMoatHaircutFactor: 0.78
    },
    penaltyPolicy: {
      accrualMode: 'CAPEX_TOLERANT_OCF_NI',
      ocfHealthyThreshold: 0.50,
      weakMoatToleranceSpreadPct: -0.75,
      maxDerTolerance: 2.8
    },
    scoringWeights: {
      businessQuality: 0.28,
      balanceSheetHealth: 0.28,
      valuationSafety: 0.24,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 12.0,
      maxPositionCapPct: 12.0,
      stopBandAtrMult: [1.8, 2.5],
      stopPctClamp: [4.5, 11.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 8_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['TLKM', 'ISAT', 'EXCL', 'TOWR', 'TBIG', 'MTEL', 'JSMR', 'PGEO', 'POWR'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ebitdaTTM', 'daTTM'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA EBITDA INFRA PARSIAL'
    },
    academicCitation: 'Damodaran (2012) Infrastructure, Telecom & Regulated Concession Valuation'
  },

  // 9. Transportasi & Logistik (ASSA, BIRD, SMDR, TMAS, GIAA, HAIS, ELPI, NELY)
  // Closing Finding B: ASSA deterministically maps here!
  TRANSPORTATION_LOGISTICS: {
    archetype: 'TRANSPORTATION_LOGISTICS',
    subArchetype: 'FLEET_SHIPPING_LOGISTICS',
    displayName: 'Transportasi, Armada Rental, Pelayaran & Logistik',
    shortBadgeLabel: 'MODE SEKTOR: TRANSPORTASI & LOGISTIK',
    legacyRegime: 'INFRA_TELCO_UTILITIES',
    valuationRoute: 'CAPEX_AGGRESSOR',
    appliedModule: 'Capex_Aggressor',
    requiresVerifiedRoicForCapexModule: false,
    isCyclicalArchetype: true,
    bypassedMetrics: [
      'Unadjusted P/E (Distorsi Depresiasi Armada/Kapal)',
      'Strict Retail DER (Diganti Fleet Net Debt / EBITDA)'
    ],
    requiredMetrics: [
      'EV/EBITDA(R) & Fleet Cash Conversion (OCF / EBITDA)',
      'Fleet CapEx / D&A & ROIC vs Ke',
      'Net Debt / EBITDA Armada'
    ],
    sectorSpecificRequiredMetrics: ['EbitdaTTM', 'CapexTTM', 'DaTTM'],
    normalizationPolicy: 'MEDIAN_5Y',
    valuationLegs: [
      {
        id: 'ev_ebitda_fleet',
        label: 'Fleet EV/EBITDA(R) Multiple',
        shortMetric: 'EV/EBITDA',
        baseWeight: 0.45,
        clusterGroup: 'ASSET_NAV',
        parameterNote: 'Captures fleet EBITDA before heavy vehicle/vessel depreciation'
      },
      {
        id: 'multistage_rim_fleet',
        label: 'Multi-Stage Residual Income (Mild Cyclical ω)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.30,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '6Y Fade, ω 0.62–0.74'
      },
      {
        id: 'historical_ev_ebitda_5y',
        label: '5Y Historical Fleet EV/EBITDA Anchor',
        shortMetric: 'Hist EV/EBITDA',
        baseWeight: 0.25,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: '5Y Mean Fleet Multiple'
      }
    ],
    omegaRange: {
      min: 0.62,
      base: 0.68,
      max: 0.74,
      fadeYears: 6,
      tierLabel: 'Transportasi & Armada Logistik (ω 0.62–0.74)'
    },
    gCap: 4.5,
    terminalSpreadMin: 4.0,
    keAdjustments: {
      sbnWeights: { w1Y: 0.25, w5Y: 0.40, w10Y: 0.35 },
      betaPolicy: 'BLUME',
      betaClamp: [0.65, 1.45],
      liquidityPremiumBps: 15,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 25
    },
    floorPolicy: {
      mode: 'STANDARD_MOAT',
      maxRatioToEnsemble: 0.86,
      roeHaircutThresholdPct: 11.0,
      derHaircutThreshold: 1.8, // Fleet leasing carries 1.0x–1.8x DER normally
      weakMoatHaircutFactor: 0.78
    },
    penaltyPolicy: {
      accrualMode: 'CAPEX_TOLERANT_OCF_NI',
      ocfHealthyThreshold: 0.50,
      weakMoatToleranceSpreadPct: -0.75,
      maxDerTolerance: 1.8
    },
    scoringWeights: {
      businessQuality: 0.28,
      balanceSheetHealth: 0.28,
      valuationSafety: 0.24,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 11.0,
      maxPositionCapPct: 11.5,
      stopBandAtrMult: [2.0, 2.8],
      stopPctClamp: [5.0, 12.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 3_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['ASSA', 'BIRD', 'SMDR', 'TMAS', 'HAIS', 'ELPI', 'NELY'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ebitdaTTM', 'daTTM'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA ARMADA LOGISTIK PARSIAL'
    },
    academicCitation: 'PSAK 73 Lease Accounting & Fleet Asset-Heavy Valuation'
  },

  // 10. Consumer Non-Cyclicals / FMCG & Staples (ICBP, INDF, MYOR, CMRY, AMRT, UNVR, CPIN, HMSP)
  CONSUMER_NON_CYCLICAL_FMCG: {
    archetype: 'CONSUMER_NON_CYCLICAL_FMCG',
    subArchetype: 'FMCG_STAPLES_COMPOUNDER',
    displayName: 'Consumer Non-Cyclicals (FMCG & Kebutuhan Pokok)',
    shortBadgeLabel: 'MODE SEKTOR: CONSUMER NON-CYCLICAL (COMPOUNDER)',
    legacyRegime: 'CORE_CORPORATE',
    valuationRoute: 'STEADY_COMPOUNDER',
    appliedModule: 'Compounder',
    requiresVerifiedRoicForCapexModule: false,
    isCyclicalArchetype: false,
    bypassedMetrics: [],
    requiredMetrics: [
      'Gross Profitability to Assets (GP/A Novy-Marx ≥ 20%)',
      'Cash Conversion (OCF / Net Income ≥ 0.85x)',
      'ROIC / ROE vs Cost of Equity (Ke) Spread',
      'Quality-Adjusted P/E & Multi-Stage RIM'
    ],
    sectorSpecificRequiredMetrics: ['GrossProfitabilityToAssets', 'OcfToNetIncome'],
    normalizationPolicy: 'MIN_TTM_AVG3Y',
    valuationLegs: [
      {
        id: 'quality_pe',
        label: 'Quality-Adjusted P/E (Cash Earnings Power)',
        shortMetric: 'Quality P/E',
        baseWeight: 0.45,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Cash-Adjusted EPS × Quality P/E Multiple'
      },
      {
        id: 'multistage_rim_compounder',
        label: 'Multi-Stage Residual Income (High Persistence ω)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.35,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '7Y Fade, ω 0.84–0.96'
      },
      {
        id: 'ev_ebitda_5y',
        label: '5Y Historical EV/EBITDA Anchor',
        shortMetric: 'EV/EBITDA 5Y',
        baseWeight: 0.20,
        clusterGroup: 'ASSET_NAV',
        parameterNote: '5Y Mean FMCG EV/EBITDA'
      }
    ],
    omegaRange: {
      min: 0.84,
      base: 0.90,
      max: 0.96,
      fadeYears: 7,
      tierLabel: 'FMCG & Consumer Compounder (ω 0.84–0.96)'
    },
    gCap: 5.5,
    terminalSpreadMin: 3.5,
    keAdjustments: {
      sbnWeights: { w1Y: 0.15, w5Y: 0.35, w10Y: 0.50 },
      betaPolicy: 'BLUME',
      betaClamp: [0.48, 1.25],
      liquidityPremiumBps: 0,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 0
    },
    floorPolicy: {
      mode: 'STANDARD_MOAT',
      maxRatioToEnsemble: 0.90,
      roeHaircutThresholdPct: 15.0,
      derHaircutThreshold: 1.0,
      weakMoatHaircutFactor: 0.75
    },
    penaltyPolicy: {
      accrualMode: 'STANDARD_OCF_NI',
      ocfHealthyThreshold: 0.80,
      weakMoatToleranceSpreadPct: 0.0,
      maxDerTolerance: 1.0
    },
    scoringWeights: {
      businessQuality: 0.34,
      balanceSheetHealth: 0.24,
      valuationSafety: 0.22,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 12.5,
      maxPositionCapPct: 12.5,
      stopBandAtrMult: [1.8, 2.5],
      stopPctClamp: [4.5, 10.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 8_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['ICBP', 'INDF', 'MYOR', 'CMRY', 'AMRT', 'UNVR', 'CPIN', 'JPFA', 'HMSP', 'GGRM'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ocfTTM', 'totalAssets'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA ARUS KAS FMCG PARSIAL'
    },
    academicCitation: 'Novy-Marx (2013) JFE Gross Profitability; Sloan (1996) Accruals'
  },

  // 11. Consumer Cyclicals — Sub-Archetype A: Otomotif & Komponen (AUTO, DRMA, SMSM, GJTL, MPMX, IMAS, BAUT, VKTR)
  // Closing Finding A: DRMA & AUTO NEVER default to FMCG Compounder! Both module and ω are aligned as Medium-Cyclical OEM Suppliers.
  CYCLICAL_AUTO_COMPONENTS: {
    archetype: 'CYCLICAL_AUTO_COMPONENTS',
    subArchetype: 'AUTO_OEM_COMPONENTS',
    displayName: 'Consumer Cyclicals — Otomotif & Komponen OEM',
    shortBadgeLabel: 'MODE SEKTOR: OTOMOTIF & KOMPONEN (SIKLIKAL)',
    legacyRegime: 'CORE_CORPORATE',
    valuationRoute: 'PURE_CYCLICAL',
    appliedModule: 'Pure_Cyclical',
    requiresVerifiedRoicForCapexModule: true,
    isCyclicalArchetype: true,
    bypassedMetrics: [
      'FMCG Compounder P/E Expansion (Dibatasi Siklus Kredit & Volume 2W/4W OEM)'
    ],
    requiredMetrics: [
      'Normalized 5Y ROE & Margin Siklus Otomotif',
      'OCF / Net Income & Perputaran Modal Kerja OEM',
      'Normalized P/CF & Mid-Cycle EV/EBITDA'
    ],
    sectorSpecificRequiredMetrics: ['NormalizedRoe5Y', 'OcfToNetIncome'],
    normalizationPolicy: 'MEDIAN_5Y',
    valuationLegs: [
      {
        id: 'normalized_auto_pe_pcf',
        label: 'Normalized Mid-Cycle Auto P/CF & P/E',
        shortMetric: 'Norm P/CF',
        baseWeight: 0.45,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Normalized 5Y Auto Component Multiple (9.0x–11.5x)'
      },
      {
        id: 'multistage_rim_auto',
        label: 'Multi-Stage Residual Income (Medium-Cyclical ω)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.30,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '5Y Fade, ω 0.52–0.66 aligned with OEM cycle'
      },
      {
        id: 'ev_ebitda_auto',
        label: '5Y Historical Auto EV/EBITDA Anchor',
        shortMetric: 'EV/EBITDA 5Y',
        baseWeight: 0.25,
        clusterGroup: 'ASSET_NAV',
        parameterNote: '5Y Mean EV/EBITDA'
      }
    ],
    // [TODO-CALIBRATE: Fase 4] Consistent medium-cyclical ω [0.52, 0.66] matching Pure_Cyclical / Mid-Cycle module
    omegaRange: {
      min: 0.52,
      base: 0.58,
      max: 0.66,
      fadeYears: 5,
      tierLabel: 'Otomotif & Komponen OEM Siklikal (ω 0.52–0.66)'
    },
    gCap: 4.5,
    terminalSpreadMin: 4.0,
    keAdjustments: {
      sbnWeights: { w1Y: 0.25, w5Y: 0.40, w10Y: 0.35 },
      betaPolicy: 'BLUME',
      betaClamp: [0.60, 1.40],
      liquidityPremiumBps: 15,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 30
    },
    floorPolicy: {
      mode: 'CYCLICAL_MID_CYCLE_BVPS',
      maxRatioToEnsemble: 0.85,
      roeHaircutThresholdPct: 13.0,
      derHaircutThreshold: 1.0,
      weakMoatHaircutFactor: 0.76
    },
    penaltyPolicy: {
      accrualMode: 'STANDARD_OCF_NI',
      ocfHealthyThreshold: 0.80,
      weakMoatToleranceSpreadPct: -0.75,
      maxDerTolerance: 1.0
    },
    scoringWeights: {
      businessQuality: 0.28,
      balanceSheetHealth: 0.27,
      valuationSafety: 0.25,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 11.0,
      maxPositionCapPct: 11.5,
      stopBandAtrMult: [2.0, 2.8],
      stopPctClamp: [5.0, 12.0]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 3_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['AUTO', 'DRMA', 'SMSM', 'GJTL', 'MPMX', 'ASII', 'IMAS'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ocfTTM', 'totalAssets'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA KOMPONEN OTOMOTIF PARSIAL'
    },
    academicCitation: 'Damodaran (2009) Manufacturing & OEM Cyclicals; Ohlson (1995)'
  },

  // 12. Consumer Cyclicals — Sub-Archetype B: Ritel Modern, F&B & Lifestyle (MAPI, MAPA, ACES, ERAA, LPPF, RALS, FAST)
  CYCLICAL_RETAIL_FNB: {
    archetype: 'CYCLICAL_RETAIL_FNB',
    subArchetype: 'RETAIL_FNB_LEASE_ADJUSTED',
    displayName: 'Consumer Cyclicals — Ritel Modern, F&B & Lifestyle',
    shortBadgeLabel: 'MODE SEKTOR: RITEL & F&B (LEASE-ADJ)',
    legacyRegime: 'CORE_CORPORATE',
    valuationRoute: 'STEADY_COMPOUNDER',
    appliedModule: 'Compounder',
    requiresVerifiedRoicForCapexModule: false,
    isCyclicalArchetype: true,
    bypassedMetrics: [],
    requiredMetrics: [
      'Gross Profitability to Assets (GP/A Novy-Marx & Inventory Turnover)',
      'Lease-Adjusted OCF/NI & Same-Store Cash Generation',
      'Normalized P/E & EV/EBITDA (PSAK 73 Lease-Aware)'
    ],
    sectorSpecificRequiredMetrics: ['GrossProfitabilityToAssets', 'OcfToNetIncome'],
    normalizationPolicy: 'MIN_TTM_AVG3Y',
    valuationLegs: [
      {
        id: 'retail_quality_pe',
        label: 'Lease-Adjusted Retail P/E (Capped vs FMCG)',
        shortMetric: 'Retail P/E',
        baseWeight: 0.45,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Discretionary Retail P/E (10.5x–14.5x)'
      },
      {
        id: 'multistage_rim_retail',
        label: 'Multi-Stage Residual Income (Discretionary ω)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.30,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '6Y Fade, ω 0.64–0.76'
      },
      {
        id: 'ev_ebitda_retail',
        label: '5Y Historical Retail EV/EBITDA Anchor',
        shortMetric: 'EV/EBITDA 5Y',
        baseWeight: 0.25,
        clusterGroup: 'ASSET_NAV',
        parameterNote: '5Y Mean EV/EBITDA'
      }
    ],
    omegaRange: {
      min: 0.64,
      base: 0.70,
      max: 0.76,
      fadeYears: 6,
      tierLabel: 'Ritel Modern & Lifestyle (ω 0.64–0.76)'
    },
    gCap: 4.8,
    terminalSpreadMin: 3.8,
    keAdjustments: {
      sbnWeights: { w1Y: 0.20, w5Y: 0.40, w10Y: 0.40 },
      betaPolicy: 'BLUME',
      betaClamp: [0.65, 1.40],
      liquidityPremiumBps: 10,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 20
    },
    floorPolicy: {
      mode: 'STANDARD_MOAT',
      maxRatioToEnsemble: 0.86,
      roeHaircutThresholdPct: 14.0,
      derHaircutThreshold: 1.2, // PSAK 73 lease liabilities included in totalDebt
      weakMoatHaircutFactor: 0.76
    },
    penaltyPolicy: {
      accrualMode: 'STANDARD_OCF_NI',
      ocfHealthyThreshold: 0.80,
      weakMoatToleranceSpreadPct: -0.5,
      maxDerTolerance: 1.2
    },
    scoringWeights: {
      businessQuality: 0.30,
      balanceSheetHealth: 0.25,
      valuationSafety: 0.25,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 11.5,
      maxPositionCapPct: 11.5,
      stopBandAtrMult: [2.0, 2.7],
      stopPctClamp: [4.8, 12.0]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 5_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['MAPI', 'MAPA', 'ACES', 'ERAA', 'LPPF', 'RALS'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ocfTTM', 'totalAssets'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA RITEL PARSIAL'
    },
    academicCitation: 'PSAK 73 Retail Lease Capitalization; Novy-Marx (2013) GP/A'
  },

  // 13. Consumer Cyclicals — Sub-Archetype C: Media, Perhotelan & Leisure (SCMA, MNCN, FILM, PJAA, KPIG, PANR)
  CYCLICAL_MEDIA_LEISURE: {
    archetype: 'CYCLICAL_MEDIA_LEISURE',
    subArchetype: 'MEDIA_HOSPITALITY_LEISURE',
    displayName: 'Consumer Cyclicals — Media, Perhotelan & Rekreasi',
    shortBadgeLabel: 'MODE SEKTOR: MEDIA & LEISURE (SIKLIKAL)',
    legacyRegime: 'CORE_CORPORATE',
    valuationRoute: 'PURE_CYCLICAL',
    appliedModule: 'Pure_Cyclical',
    requiresVerifiedRoicForCapexModule: true,
    isCyclicalArchetype: true,
    bypassedMetrics: [],
    requiredMetrics: [
      'Normalized 5Y ROE & Audience/Occupancy Margin',
      'EV/EBITDA & Free Cash Flow Conversion',
      'Net Debt / Equity & Content/Hotel CapEx Discipline'
    ],
    sectorSpecificRequiredMetrics: ['EbitdaTTM', 'OcfToNetIncome'],
    normalizationPolicy: 'MEDIAN_5Y',
    valuationLegs: [
      {
        id: 'ev_ebitda_media',
        label: 'Mid-Cycle EV/EBITDA Multiple',
        shortMetric: 'EV/EBITDA',
        baseWeight: 0.45,
        clusterGroup: 'ASSET_NAV',
        parameterNote: 'Media & Hospitality EV/EBITDA'
      },
      {
        id: 'normalized_pcf_media',
        label: 'Normalized P/CF Cash Earnings Multiple',
        shortMetric: 'Norm P/CF',
        baseWeight: 0.35,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: '5Y Median Cash Earnings'
      },
      {
        id: 'multistage_rim_media',
        label: 'Residual Income Model (Siklikal Media/Leisure)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.20,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '5Y Fade, ω 0.48–0.62'
      }
    ],
    omegaRange: {
      min: 0.48,
      base: 0.55,
      max: 0.62,
      fadeYears: 5,
      tierLabel: 'Media, Perhotelan & Leisure (ω 0.48–0.62)'
    },
    gCap: 4.0,
    terminalSpreadMin: 4.2,
    keAdjustments: {
      sbnWeights: { w1Y: 0.25, w5Y: 0.40, w10Y: 0.35 },
      betaPolicy: 'BLUME',
      betaClamp: [0.70, 1.50],
      liquidityPremiumBps: 20,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 30
    },
    floorPolicy: {
      mode: 'CYCLICAL_MID_CYCLE_BVPS',
      maxRatioToEnsemble: 0.85,
      roeHaircutThresholdPct: 12.0,
      derHaircutThreshold: 1.0,
      weakMoatHaircutFactor: 0.75
    },
    penaltyPolicy: {
      accrualMode: 'STANDARD_OCF_NI',
      ocfHealthyThreshold: 0.80,
      weakMoatToleranceSpreadPct: -1.0,
      maxDerTolerance: 1.0
    },
    scoringWeights: {
      businessQuality: 0.26,
      balanceSheetHealth: 0.28,
      valuationSafety: 0.26,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 10.5,
      maxPositionCapPct: 11.0,
      stopBandAtrMult: [2.0, 2.8],
      stopPctClamp: [5.0, 12.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 3_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['SCMA', 'MNCN', 'FILM', 'PJAA', 'PANR', 'KPIG'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ebitdaTTM', 'ocfTTM'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA MEDIA/LEISURE PARSIAL'
    },
    academicCitation: 'Damodaran (2009) Discretionary Leisure & Media Cyclicals'
  },

  // 14. Healthcare — Sub-Archetype A: Rumah Sakit & Klinik (MIKA, HEAL, SILO, PRDA, SAME, BMHS)
  HEALTHCARE_HOSPITALS: {
    archetype: 'HEALTHCARE_HOSPITALS',
    subArchetype: 'HOSPITAL_CAPEX_NETWORK',
    displayName: 'Healthcare — Jaringan Rumah Sakit & Laboratorium Klinik',
    shortBadgeLabel: 'MODE SEKTOR: RUMAH SAKIT (CAPEX NETWORK)',
    legacyRegime: 'CORE_CORPORATE',
    valuationRoute: 'CAPEX_AGGRESSOR',
    appliedModule: 'Capex_Aggressor',
    requiresVerifiedRoicForCapexModule: true,
    isCyclicalArchetype: false,
    bypassedMetrics: [],
    requiredMetrics: [
      'EV/EBITDA & ROIC Ekspansi Rumah Sakit Baru vs Ke',
      'EBITDA Margin & OCF Conversion (Toleransi CapEx Bed Baru)',
      'Net Debt / EBITDA & Kualitas Piutang BPJS/Korporasi'
    ],
    sectorSpecificRequiredMetrics: ['EbitdaTTM', 'CapexTTM', 'DaTTM'],
    normalizationPolicy: 'MIN_TTM_AVG3Y',
    valuationLegs: [
      {
        id: 'ev_ebitda_hospital',
        label: 'Hospital Network EV/EBITDA Multiple',
        shortMetric: 'EV/EBITDA',
        baseWeight: 0.45,
        clusterGroup: 'ASSET_NAV',
        parameterNote: 'Captures hospital expansion before new-building D&A drag'
      },
      {
        id: 'multistage_rim_hospital',
        label: 'Multi-Stage Residual Income (Moat Rumah Sakit)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.35,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '7Y Fade, ω 0.78–0.90'
      },
      {
        id: 'quality_pe_hospital',
        label: 'Quality-Adjusted Hospital P/E Anchor',
        shortMetric: 'Quality P/E',
        baseWeight: 0.20,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Cash-Adjusted EPS Multiple'
      }
    ],
    omegaRange: {
      min: 0.78,
      base: 0.84,
      max: 0.90,
      fadeYears: 7,
      tierLabel: 'Rumah Sakit & Klinik Moat Stabil (ω 0.78–0.90)'
    },
    gCap: 5.25,
    terminalSpreadMin: 3.5,
    keAdjustments: {
      sbnWeights: { w1Y: 0.15, w5Y: 0.35, w10Y: 0.50 },
      betaPolicy: 'BLUME',
      betaClamp: [0.48, 1.20],
      liquidityPremiumBps: 0,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 0
    },
    floorPolicy: {
      mode: 'STANDARD_MOAT',
      maxRatioToEnsemble: 0.88,
      roeHaircutThresholdPct: 12.5,
      derHaircutThreshold: 1.0,
      weakMoatHaircutFactor: 0.78
    },
    penaltyPolicy: {
      accrualMode: 'CAPEX_TOLERANT_OCF_NI',
      ocfHealthyThreshold: 0.55,
      weakMoatToleranceSpreadPct: -0.5,
      maxDerTolerance: 1.0
    },
    scoringWeights: {
      businessQuality: 0.32,
      balanceSheetHealth: 0.25,
      valuationSafety: 0.23,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 12.0,
      maxPositionCapPct: 12.0,
      stopBandAtrMult: [1.8, 2.5],
      stopPctClamp: [4.5, 11.0]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 5_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['MIKA', 'HEAL', 'SILO', 'PRDA', 'SAME', 'BMHS'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ebitdaTTM', 'capexTTM', 'daTTM'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA CAPEX RUMAH SAKIT PARSIAL'
    },
    academicCitation: 'Koller et al. (McKinsey Valuation) Healthcare Provider CapEx & ROIC'
  },

  // 15. Healthcare — Sub-Archetype B: Farmasi, Herbal & Medtech (KLBF, SIDO, TSPC, DVLA, MERK, SOHO, OMED)
  // Closing Finding A: KLBF & SIDO are asset-light Pharma Compounders, NOT forced into Capex_Aggressor!
  HEALTHCARE_PHARMA: {
    archetype: 'HEALTHCARE_PHARMA',
    subArchetype: 'PHARMA_CONSUMER_HEALTH',
    displayName: 'Healthcare — Farmasi, Consumer Health & Alat Kesehatan',
    shortBadgeLabel: 'MODE SEKTOR: FARMASI & MEDTECH (COMPOUNDER)',
    legacyRegime: 'CORE_CORPORATE',
    valuationRoute: 'STEADY_COMPOUNDER',
    appliedModule: 'Compounder',
    requiresVerifiedRoicForCapexModule: false,
    isCyclicalArchetype: false,
    bypassedMetrics: [],
    requiredMetrics: [
      'Gross Profitability to Assets (GP/A Novy-Marx)',
      'Cash Conversion (OCF / Net Income ≥ 0.85x)',
      'ROIC / ROE vs Ke Spread & R&D/Brand Moat',
      'Quality-Adjusted P/E & Multi-Stage RIM'
    ],
    sectorSpecificRequiredMetrics: ['GrossProfitabilityToAssets', 'OcfToNetIncome'],
    normalizationPolicy: 'MIN_TTM_AVG3Y',
    valuationLegs: [
      {
        id: 'quality_pe_pharma',
        label: 'Quality-Adjusted P/E (Pharma Brand Moat)',
        shortMetric: 'Quality P/E',
        baseWeight: 0.45,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Cash-Adjusted EPS × Quality P/E'
      },
      {
        id: 'multistage_rim_pharma',
        label: 'Multi-Stage Residual Income (High Persistence ω)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.35,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '7Y Fade, ω 0.82–0.94'
      },
      {
        id: 'ev_ebitda_pharma',
        label: '5Y Historical Pharma EV/EBITDA Anchor',
        shortMetric: 'EV/EBITDA 5Y',
        baseWeight: 0.20,
        clusterGroup: 'ASSET_NAV',
        parameterNote: '5Y Mean EV/EBITDA'
      }
    ],
    omegaRange: {
      min: 0.82,
      base: 0.88,
      max: 0.94,
      fadeYears: 7,
      tierLabel: 'Farmasi & Consumer Health Moat (ω 0.82–0.94)'
    },
    gCap: 5.25,
    terminalSpreadMin: 3.5,
    keAdjustments: {
      sbnWeights: { w1Y: 0.15, w5Y: 0.35, w10Y: 0.50 },
      betaPolicy: 'BLUME',
      betaClamp: [0.48, 1.18],
      liquidityPremiumBps: 0,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 0
    },
    floorPolicy: {
      mode: 'STANDARD_MOAT',
      maxRatioToEnsemble: 0.90,
      roeHaircutThresholdPct: 14.0,
      derHaircutThreshold: 0.8,
      weakMoatHaircutFactor: 0.75
    },
    penaltyPolicy: {
      accrualMode: 'STANDARD_OCF_NI',
      ocfHealthyThreshold: 0.80,
      weakMoatToleranceSpreadPct: 0.0,
      maxDerTolerance: 0.8
    },
    scoringWeights: {
      businessQuality: 0.34,
      balanceSheetHealth: 0.24,
      valuationSafety: 0.22,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 12.5,
      maxPositionCapPct: 12.5,
      stopBandAtrMult: [1.8, 2.5],
      stopPctClamp: [4.5, 10.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 5_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['KLBF', 'SIDO', 'TSPC', 'DVLA', 'MERK', 'SOHO', 'OMED'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ocfTTM', 'totalAssets'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA FARMASI PARSIAL'
    },
    academicCitation: 'Novy-Marx (2013) JFE Gross Profitability; Ohlson (1995)'
  },

  // 16. Industrials & Konglomerasi/Holding (ASII, UNTR, ARNA, TOTL, MARK, HEXA)
  INDUSTRIALS_HOLDING: {
    archetype: 'INDUSTRIALS_HOLDING',
    subArchetype: 'INDUSTRIAL_CONGLOMERATE_MFG',
    displayName: 'Perindustrian, Alat Berat & Holding Konglomerasi',
    shortBadgeLabel: 'MODE SEKTOR: INDUSTRI & HOLDING (SOTP)',
    legacyRegime: 'CORE_CORPORATE',
    valuationRoute: 'PURE_CYCLICAL',
    appliedModule: 'Pure_Cyclical',
    requiresVerifiedRoicForCapexModule: true,
    isCyclicalArchetype: true,
    bypassedMetrics: [],
    requiredMetrics: [
      'Normalized 5Y ROE & Sum-of-the-Parts (SOTP) Holding Discount (10%–20%)',
      'Normalized P/CF & Mid-Cycle EV/EBITDA',
      'Dividend Payout & Cash Flow Conversion (OCF/NI)'
    ],
    sectorSpecificRequiredMetrics: ['NormalizedRoe5Y', 'OcfToNetIncome'],
    normalizationPolicy: 'MEDIAN_5Y',
    valuationLegs: [
      {
        id: 'normalized_sotp_pcf',
        label: 'Normalized P/CF & SOTP Holding Anchor',
        shortMetric: 'Norm P/CF',
        baseWeight: 0.45,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Includes 10%–15% Conglomerate Holding Discount where applicable'
      },
      {
        id: 'multistage_rim_industrial',
        label: 'Multi-Stage Residual Income (Industrial ω)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.30,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '6Y Fade, ω 0.62–0.76'
      },
      {
        id: 'ev_ebitda_industrial',
        label: '5Y Historical Industrial EV/EBITDA Anchor',
        shortMetric: 'EV/EBITDA 5Y',
        baseWeight: 0.25,
        clusterGroup: 'ASSET_NAV',
        parameterNote: '5Y Mean EV/EBITDA'
      }
    ],
    omegaRange: {
      min: 0.62,
      base: 0.68,
      max: 0.76,
      fadeYears: 6,
      tierLabel: 'Perindustrian & Konglomerasi (ω 0.62–0.76)'
    },
    gCap: 4.5,
    terminalSpreadMin: 4.0,
    keAdjustments: {
      sbnWeights: { w1Y: 0.25, w5Y: 0.40, w10Y: 0.35 },
      betaPolicy: 'BLUME',
      betaClamp: [0.58, 1.35],
      liquidityPremiumBps: 0,
      governancePremiumBps: 15, // Holding discount / conglomerate complexity buffer
      cyclicalityPremiumBps: 20
    },
    floorPolicy: {
      mode: 'CYCLICAL_MID_CYCLE_BVPS',
      maxRatioToEnsemble: 0.86,
      roeHaircutThresholdPct: 12.5,
      derHaircutThreshold: 1.0,
      weakMoatHaircutFactor: 0.78
    },
    penaltyPolicy: {
      accrualMode: 'STANDARD_OCF_NI',
      ocfHealthyThreshold: 0.80,
      weakMoatToleranceSpreadPct: -0.75,
      maxDerTolerance: 1.0
    },
    scoringWeights: {
      businessQuality: 0.28,
      balanceSheetHealth: 0.27,
      valuationSafety: 0.25,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 11.5,
      maxPositionCapPct: 12.0,
      stopBandAtrMult: [1.9, 2.7],
      stopPctClamp: [4.8, 12.0]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 5_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['ASII', 'UNTR', 'HEXA', 'ARNA', 'TOTL', 'MARK', 'ASGR'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['ocfTTM', 'ebitdaTTM'],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'DATA INDUSTRI PARSIAL'
    },
    academicCitation: 'Berger & Ofek (1995) JFE Diversification & Conglomerate Discount'
  },

  // 17. Technology (GOTO, BUKA, BELI, EMTK, DCII, MTDL, MLPT)
  TECHNOLOGY: {
    archetype: 'TECHNOLOGY',
    subArchetype: 'TECH_PLATFORM_IT_SERVICES',
    displayName: 'Teknologi — Platform Digital, Data Center & Solusi IT',
    shortBadgeLabel: 'MODE SEKTOR: TEKNOLOGI & DIGITAL',
    legacyRegime: 'TECH_UNPROFITABLE_GROWTH',
    valuationRoute: 'CAPEX_AGGRESSOR',
    appliedModule: 'Capex_Aggressor',
    requiresVerifiedRoicForCapexModule: true,
    isCyclicalArchetype: false,
    bypassedMetrics: [
      'Traditional P/E & Multi-Stage RIM (Diblokir bila Laba Usaha / Net Income ≤ 0)'
    ],
    requiredMetrics: [
      'Cash Runway (Kas / Burn Rate Tahunan) & Net Cash Position',
      'EV/Revenue, EV/Gross Profit atau EV/EBITDA (bagi IT Profitable)',
      'Operating Margin Path-to-Profitability'
    ],
    sectorSpecificRequiredMetrics: ['CashRunway', 'GrossProfitabilityToAssets'],
    normalizationPolicy: 'TTM',
    valuationLegs: [
      {
        id: 'tech_ev_sales_ebitda',
        label: 'EV/EBITDA (Profitable Tech) atau EV/Gross Profit & Net Cash',
        shortMetric: 'EV/GP & Runway',
        baseWeight: 0.50,
        clusterGroup: 'ASSET_NAV',
        parameterNote: 'Locks to Net Cash + EV/Revenue Floor when NI <= 0'
      },
      {
        id: 'multistage_rim_tech',
        label: 'Multi-Stage RIM (Aktif Hanya Bila Profitable & ROE > Ke)',
        shortMetric: 'RIM EBO',
        baseWeight: 0.30,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '6Y Fade, ω 0.65–0.80'
      },
      {
        id: 'historical_ev_ebitda_tech',
        label: '5Y Historical Multiple Anchor',
        shortMetric: 'Hist Multiple',
        baseWeight: 0.20,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Historical Valuation Anchor'
      }
    ],
    omegaRange: {
      min: 0.65,
      base: 0.72,
      max: 0.80,
      fadeYears: 6,
      tierLabel: 'Teknologi & Infrastruktur Digital (ω 0.65–0.80)'
    },
    gCap: 5.5,
    terminalSpreadMin: 4.0,
    keAdjustments: {
      sbnWeights: { w1Y: 0.15, w5Y: 0.35, w10Y: 0.50 },
      betaPolicy: 'BLUME',
      betaClamp: [0.75, 1.65],
      liquidityPremiumBps: 20,
      governancePremiumBps: 0,
      cyclicalityPremiumBps: 35
    },
    floorPolicy: {
      mode: 'ASSET_RNAV_DISCOUNT',
      maxRatioToEnsemble: 0.82,
      roeHaircutThresholdPct: 12.0,
      derHaircutThreshold: 0.8,
      weakMoatHaircutFactor: 0.70
    },
    penaltyPolicy: {
      accrualMode: 'STANDARD_OCF_NI',
      ocfHealthyThreshold: 0.75,
      weakMoatToleranceSpreadPct: 0.0,
      maxDerTolerance: 0.8
    },
    scoringWeights: {
      businessQuality: 0.30,
      balanceSheetHealth: 0.30,
      valuationSafety: 0.22,
      oosRobustness: 0.18
    },
    sizingParams: {
      maxVolTargetPct: 9.5,
      maxPositionCapPct: 10.0,
      stopBandAtrMult: [2.2, 3.0],
      stopPctClamp: [5.5, 14.0]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 5_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['GOTO', 'BUKA', 'EMTK', 'MTDL', 'DCII', 'MLPT'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: ['cashAndEquivalents', 'ocfTTM'],
      downgradeMaxGradeOnMissingSectorFields: 'C (SPECULATIVE)',
      missingSectorFlagLabel: 'DATA RUNWAY TEKNOLOGI PARSIAL'
    },
    academicCitation: 'Damodaran (2009) Valuing Young, Start-up and Growth Tech Companies'
  },

  // 18. Conservative Fallback Profile (Low Classification Confidence or Missing Mandatory Sector Data)
  // NEVER defaults to Steady Compounder! Uses strict normalization, lower ω, and caps Grade at B.
  CONSERVATIVE_FALLBACK: {
    archetype: 'CONSERVATIVE_FALLBACK',
    subArchetype: 'CONSERVATIVE_DATA_GUARD',
    displayName: 'Profil Konservatif (Data Sektoral Parsial / Confidence Rendah)',
    shortBadgeLabel: 'MODE SEKTOR: KONSERVATIF (FALLBACK)',
    legacyRegime: 'CORE_CORPORATE',
    valuationRoute: 'PURE_CYCLICAL',
    appliedModule: 'Pure_Cyclical',
    requiresVerifiedRoicForCapexModule: true,
    isCyclicalArchetype: true,
    bypassedMetrics: [],
    requiredMetrics: [
      'Conservative ROE Normalization (min(TTM, 3Y/5Y Avg))',
      'Cash Conversion (OCF / Net Income ≥ 0.80x)',
      'Conservative Debt-to-Equity & Book Value Floor'
    ],
    sectorSpecificRequiredMetrics: [],
    normalizationPolicy: 'MIN_TTM_AVG3Y',
    valuationLegs: [
      {
        id: 'conservative_pcf_pe',
        label: 'Conservative Cash-Adjusted P/CF & P/E',
        shortMetric: 'Cons P/CF',
        baseWeight: 0.45,
        clusterGroup: 'EARNINGS_FLOW',
        parameterNote: 'Conservative multiple cap'
      },
      {
        id: 'conservative_rim',
        label: 'Conservative Residual Income (Fast Fade ω)',
        shortMetric: 'Cons RIM',
        baseWeight: 0.30,
        clusterGroup: 'BOOK_RETURN',
        parameterNote: '5Y Fade, ω 0.45–0.60'
      },
      {
        id: 'conservative_ev_ebitda',
        label: 'Conservative EV/EBITDA Anchor',
        shortMetric: 'EV/EBITDA',
        baseWeight: 0.25,
        clusterGroup: 'ASSET_NAV',
        parameterNote: 'Conservative EV/EBITDA'
      }
    ],
    omegaRange: {
      min: 0.45,
      base: 0.52,
      max: 0.60,
      fadeYears: 5,
      tierLabel: 'Profil Konservatif Fallback (ω 0.45–0.60)'
    },
    gCap: 3.5,
    terminalSpreadMin: 4.5,
    keAdjustments: {
      sbnWeights: { w1Y: 0.25, w5Y: 0.40, w10Y: 0.35 },
      betaPolicy: 'BLUME',
      betaClamp: [0.65, 1.50],
      liquidityPremiumBps: 35,
      governancePremiumBps: 25,
      cyclicalityPremiumBps: 25
    },
    floorPolicy: {
      mode: 'CYCLICAL_MID_CYCLE_BVPS',
      maxRatioToEnsemble: 0.82,
      roeHaircutThresholdPct: 15.0,
      derHaircutThreshold: 1.0,
      weakMoatHaircutFactor: 0.72
    },
    penaltyPolicy: {
      accrualMode: 'STANDARD_OCF_NI',
      ocfHealthyThreshold: 0.80,
      weakMoatToleranceSpreadPct: 0.0,
      maxDerTolerance: 1.0
    },
    scoringWeights: {
      businessQuality: 0.25,
      balanceSheetHealth: 0.30,
      valuationSafety: 0.25,
      oosRobustness: 0.20
    },
    sizingParams: {
      maxVolTargetPct: 9.5,
      maxPositionCapPct: 10.0,
      stopBandAtrMult: [2.0, 2.8],
      stopPctClamp: [5.0, 12.5]
    },
    liquidityPolicy: {
      minInstitutionalAdtvIdr: 5_000_000_000,
      maxAdtvParticipationPct: 5.0
    },
    statArbPeerPool: ['ASII', 'TLKM', 'ICBP', 'BMRI'],
    dataRequirements: {
      coreFields: ['revenueTTM', 'netIncomeTTM', 'equityAttributable', 'sharesOutstanding'],
      sectorSpecificFields: [],
      downgradeMaxGradeOnMissingSectorFields: 'B (WATCHLIST / HOLD)',
      missingSectorFlagLabel: 'FALLBACK PROFIL KONSERVATIF'
    },
    academicCitation: 'Graham & Dodd Conservative Margin of Safety Fallback'
  }
};

/**
 * Deterministic Structural Mapping Table: (IdxSubIndustryEnum) -> SectorArchetypeId
 */
export const SUB_INDUSTRY_TO_ARCHETYPE_MAP: Record<IdxSubIndustryEnum, SectorArchetypeId> = {
  // 1. Financials
  [IdxSubIndustryEnum.BANK_KBMI3_4]: 'BANK_MAJOR_MID',
  [IdxSubIndustryEnum.BANK_MICRO_SHARIA]: 'BANK_MICRO_SHARIA_MULTIFINANCE',
  [IdxSubIndustryEnum.MULTIFINANCE]: 'BANK_MICRO_SHARIA_MULTIFINANCE',
  [IdxSubIndustryEnum.INSURANCE]: 'INSURANCE',
  [IdxSubIndustryEnum.FINANCIAL_HOLDING_INVESTMENT]: 'BANK_MICRO_SHARIA_MULTIFINANCE',

  // 2. Energy & CPO
  [IdxSubIndustryEnum.COAL_MINING]: 'ENERGY_COAL_CPO',
  [IdxSubIndustryEnum.OIL_GAS_ENERGY]: 'ENERGY_COAL_CPO',
  [IdxSubIndustryEnum.ENERGY_SERVICES_CONTRACTOR]: 'ENERGY_COAL_CPO',
  [IdxSubIndustryEnum.PLANTATION_CPO]: 'ENERGY_COAL_CPO',

  // 3. Basic Materials
  [IdxSubIndustryEnum.METALS_MINING_DOWNSTREAM]: 'METALS_DOWNSTREAM',
  [IdxSubIndustryEnum.CEMENT_CHEMICALS_BASIC]: 'BASIC_MATERIALS_CYCLICAL',
  [IdxSubIndustryEnum.PULP_PAPER_PACKAGING]: 'BASIC_MATERIALS_CYCLICAL',

  // 4. Consumer Non-Cyclicals
  [IdxSubIndustryEnum.FMCG_FOOD_BEVERAGE]: 'CONSUMER_NON_CYCLICAL_FMCG',
  [IdxSubIndustryEnum.AGRI_POULTRY_STAPLE]: 'CONSUMER_NON_CYCLICAL_FMCG',
  [IdxSubIndustryEnum.STAPLE_RETAIL_DISTRIBUTION]: 'CONSUMER_NON_CYCLICAL_FMCG',

  // 5. Consumer Cyclicals (SPLIT)
  [IdxSubIndustryEnum.AUTO_COMPONENTS]: 'CYCLICAL_AUTO_COMPONENTS',
  [IdxSubIndustryEnum.RETAIL_FNB_LIFESTYLE]: 'CYCLICAL_RETAIL_FNB',
  [IdxSubIndustryEnum.MEDIA_HOSPITALITY_LEISURE]: 'CYCLICAL_MEDIA_LEISURE',

  // 6. Healthcare (SPLIT)
  [IdxSubIndustryEnum.HOSPITAL_CLINIC]: 'HEALTHCARE_HOSPITALS',
  [IdxSubIndustryEnum.PHARMA_MEDTECH]: 'HEALTHCARE_PHARMA',

  // 7. Infrastructures
  [IdxSubIndustryEnum.TELECOM_TOWER_INFRA]: 'INFRA_TELCO_TOWER_UTILITIES',
  [IdxSubIndustryEnum.UTILITIES_TOLL_PORT]: 'INFRA_TELCO_TOWER_UTILITIES',
  [IdxSubIndustryEnum.CONSTRUCTION_EPC]: 'INFRA_TELCO_TOWER_UTILITIES',

  // 8. Industrials
  [IdxSubIndustryEnum.CONGLOMERATE_HOLDING]: 'INDUSTRIALS_HOLDING',
  [IdxSubIndustryEnum.INDUSTRIAL_MANUFACTURING]: 'INDUSTRIALS_HOLDING',

  // 9. Properties & Real Estate
  [IdxSubIndustryEnum.PROPERTY_DEVELOPER]: 'PROPERTY_INDUSTRIAL_ESTATE',
  [IdxSubIndustryEnum.INDUSTRIAL_ESTATE]: 'PROPERTY_INDUSTRIAL_ESTATE',

  // 10. Technology
  [IdxSubIndustryEnum.TECH_PLATFORM_SOFTWARE]: 'TECHNOLOGY',
  [IdxSubIndustryEnum.TECH_HARDWARE_IT_SERVICES]: 'TECHNOLOGY',

  // 11. Transportation & Logistics
  [IdxSubIndustryEnum.TRANSPORTATION_LOGISTICS]: 'TRANSPORTATION_LOGISTICS'
};

/**
 * Default SubIndustry per Official IDX-IC Sector (used when only the 11-sector enum is known)
 */
export const DEFAULT_SUB_INDUSTRY_BY_SECTOR: Record<IdxSectorEnum, IdxSubIndustryEnum> = {
  [IdxSectorEnum.FINANCIALS]: IdxSubIndustryEnum.BANK_KBMI3_4,
  [IdxSectorEnum.ENERGY]: IdxSubIndustryEnum.COAL_MINING,
  [IdxSectorEnum.BASIC_MATERIALS]: IdxSubIndustryEnum.CEMENT_CHEMICALS_BASIC,
  [IdxSectorEnum.CONSUMER_NON_CYCLICALS]: IdxSubIndustryEnum.FMCG_FOOD_BEVERAGE,
  [IdxSectorEnum.CONSUMER_CYCLICALS]: IdxSubIndustryEnum.RETAIL_FNB_LIFESTYLE,
  [IdxSectorEnum.HEALTHCARE]: IdxSubIndustryEnum.PHARMA_MEDTECH,
  [IdxSectorEnum.INFRASTRUCTURES]: IdxSubIndustryEnum.TELECOM_TOWER_INFRA,
  [IdxSectorEnum.INDUSTRIALS]: IdxSubIndustryEnum.INDUSTRIAL_MANUFACTURING,
  [IdxSectorEnum.PROPERTIES_REAL_ESTATE]: IdxSubIndustryEnum.PROPERTY_DEVELOPER,
  [IdxSectorEnum.TECHNOLOGY]: IdxSubIndustryEnum.TECH_PLATFORM_SOFTWARE,
  [IdxSectorEnum.TRANSPORTATION_LOGISTICS]: IdxSubIndustryEnum.TRANSPORTATION_LOGISTICS
};
