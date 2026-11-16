export type MarketRegimeStatus = 'TENANG' | 'WASPADA' | 'VOLATIL';

export type BarbellRole = 'DEFENSIVE_QUALITY' | 'AGGRESSIVE_GROWTH' | 'NEUTRAL_HOLD' | 'AVOID_JUNK';

export type DeMiguelBufferZone = 'TOP_DECILE_BUY' | 'BUFFER_HOLD_40' | 'ROTATE_OUT';

export type MacroCategory = 'FX_RATES' | 'COMMODITIES' | 'GLOBAL_RISK';

export type WorkspaceTabId = 'command' | 'screener' | 'portfolio' | 'backtest' | 'macro';

export interface MacroIndicator {
  id: string;
  symbol: string;       // Yahoo Finance symbol e.g., "IDR=X", "^TNX", "^VIX", "GC=F"
  label: string;        // e.g., "USD / IDR", "US 10Y Yield", "Newcastle Coal"
  category: MacroCategory;
  value: number;
  unit: string;         // e.g., "Rp", "%", "pts", "USD/t", "USD/oz"
  change1D: number;     // 1D % change
  ihsgImpact: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  transmissionNote: string;
  isLiveFetched?: boolean;
}

export type EmitenNewsCategory =
  | 'DIVIDEN_RUPS'
  | 'CORPORATE_ACTION_MA'
  | 'FINANCIAL_EARNINGS'
  | 'REGULATORY_UMA_ISSUE'
  | 'GENERAL_EMITEN';

export interface NewsSentimentItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  region?: 'DOMESTIC' | 'GLOBAL';
  summary?: string;
  sentiment: 'RISK_ON' | 'RISK_OFF' | 'COMMODITY_BULL' | 'HAWKISH_RATES' | 'NEUTRAL';
  impactedSectors: string[];
  ticker?: string;
  emitenCategory?: EmitenNewsCategory;
}

export type IdxMarketSessionState =
  | 'PRE_OPENING'
  | 'SESI_1_LIVE'
  | 'ISTIRAHAT_SESI'
  | 'SESI_2_LIVE'
  | 'PASAR_TUTUP';

export interface IdxMarketSessionInfo {
  state: IdxMarketSessionState;
  isIntradayOpen: boolean;
  shortBadge: string;
  detailLabel: string;
  priceBasisLabel: string;
  wibTimeStr: string;
}

export interface StockMetrics {
  ticker: string;          // e.g., "BBCA"
  idxTicker: string;       // e.g., "IDX:BBCA"
  yfTicker: string;        // e.g., "BBCA.JK"
  name: string;            // e.g., "Bank Central Asia Tbk"
  sector: string;          // 11 IDX-IC Sectors
  lastPrice: number;       // IDR Price (Intraday Live during market hours, Last Close when market closed)
  previousClose?: number;  // Official Previous Trading Day Close Price (IDR)
  marketState?: string;    // Yahoo Finance marketState ('REGULAR' | 'PRE' | 'POST' | 'CLOSED')
  change1D: number;        // 1-day return percentage vs previousClose
  return30D: number;       // 30-day cumulative return %
  returnYTD?: number;      // Year-to-Date (YTD) cumulative return % from start of current year
  beta1Y: number;          // 1-year rolling historical Beta vs ^JKSE
  volatilityAnn: number;   // Annualized individual volatility %
  roe: number;             // Return on Equity (%)
  debtToEquity: number;    // Debt-to-Equity ratio (x)
  operatingMargin: number; // Operating Margin (%)
  // Novy-Marx (2013) Gross Profitability & Asness/AQR (2019) Anti-Junk Accruals
  grossProfitabilityToAssets?: number; // Gross Profit / Total Assets (%)
  ocfToNetIncomeRatio?: number;        // Operating Cash Flow / Net Income (x)
  accrualRatioToAssets?: number;       // (Net Income - OCF) / Total Assets (%)
  accrualPenaltyScore?: number;        // Quality score deduction for high accruals / negative OCF
  betaWeightedPropensity?: number;     // 1/Beta Risk-Parity Barbell propensity
  // 4-Factor Standardized Scores (1.0 - 10.0)
  dmuMomScore: number;     // Momentum (12-1) factor score (22% weight)
  dmuLowVolScore: number;  // Low-Volatility factor score (28% weight)
  dmuValueScore: number;   // Value / Gross Profitability & Anti-Junk score (35% weight)
  dmuSizeScore: number;    // Size & Liquidity efficiency score (15% weight)
  dmuCompositeScore: number; // 4-Factor Composite Score (1.0 - 10.0)
  dmuRankPct: number;      // Percentile rank in current universe (1% = best, 100% = worst)
  dmuZone: DeMiguelBufferZone; // 'TOP_DECILE_BUY' (<=20%), 'BUFFER_HOLD_40' (20-40%), 'ROTATE_OUT' (>40%)
  qmjScore: number;
  babScore: number;
  hrpPropensity: number;
  role: BarbellRole;
  isLiveFetched?: boolean;
  isLiquid?: boolean;
  dividendYieldPct?: number;
  forwardDividendYieldPct?: number;
  historicalDpr3YPct?: number;
  adtv20dIdr?: number;
  lastSyncedAt?: string;
  isHscFlagged?: boolean;
  hscSource?: 'MANUAL' | 'KSEI_OFFICIAL' | 'AUTO_QUANT' | 'NONE';
  hscTier?: 'HARD_BLOCK' | 'KSEI_DIVIDEND_PENALTY' | 'EARLY_WARNING_SUSPECT' | 'CLEAN';
  hscReason?: string;
  kseiHscConcentrationPct?: number;
  kseiHscIsNew?: boolean;
  kseiHscFootnote?: 'NONE' | 'UNREPORTED_DISTRIBUTION' | 'REPO_TRANSACTION' | 'VOLUNTARY_DELISTING';
  kseiHscScorePenaltyPts?: number;
  // Corporate Action Interceptor & Forward-Looking Annualizer Metadata
  trailingRoePct?: number;             // Historical/Trailing ROE (%) before Forward Annualizer
  forwardAnnualizedRoePct?: number;    // Proportionally annualized ROE (%) from latest quarterly earnings run-rate
  earningsGrowthYoYPct?: number;       // YoY quarterly net income / EPS momentum (%)
  hasActiveBuyback?: boolean;          // True when issuer has an active OJK/RUPS share buyback mandate
  buybackNominalIdr?: number;          // Total active buyback mandate allocation in IDR
  liveMarketCapIdr?: number;           // Live or calibrated market capitalization in IDR
  dynamicBuybackYieldPct?: number;     // (buybackNominalIdr / liveMarketCapIdr) * 100
  splitRatioDivisor?: number;          // Stock split (>1) or reverse split (<1) divisor applied to BVPS/EPS/ADTV
  isCatalystActive?: boolean;          // True when hasActiveBuyback || earningsGrowthYoYPct > 20 || splitRatioDivisor !== 1
  hasActiveCatalyst?: boolean;         // Explicit boolean flag for Catalyst Override in Decision Tree
  catalystBadgeLabel?: string;         // Short badge label e.g. "CATALYST ACTIVE · BUYBACK +4,2% / Q-EPS +34%"
  cwipToAssetsRatio?: number;          // Capital Work in Progress / Total Assets ratio (0.0 - 1.0) for Capex Aggressors
  capexToDaRatio?: number;             // Capex / Depreciation & Amortization ratio (>3.0 triggers Capex Override)
  capexToRevenueRatio?: number;        // Capex / Revenue ratio (>0.15 triggers Capex Override)
  historicalEps7YAvgIdr?: number;      // 7Y-10Y Mid-Cycle Normalized EPS in IDR for Pure Cyclicals
  pbv10YMean?: number;                 // 10-year historical mean PBV multiple
  pbv10YStdDev?: number;               // 10-year historical PBV standard deviation
  pbvZScore?: number;                  // Current PBV Z-Score vs 10-year mean
  longTermDebtPrevYearIdr?: number;    // Prior year long-term debt (IDR) for Net Debt Paydown calculation
  longTermDebtCurrYearIdr?: number;    // Current year long-term debt (IDR) for Net Debt Paydown calculation
  netPayoutYieldPct?: number;          // Pure (Forward Dividend Yield + Buyback Yield) without Debt Paydown
}

export type RecommendationDecisionState =
  | 'AVOID_HSC_BLOCK'
  | 'STRONG_BUY_DEFENSIVE_ANOMALY'
  | 'STRONG_BUY_CYCLICAL_ZSCORE'
  | 'BUY_ON_STRENGTH_CATALYST'
  | 'ACCUMULATE_DEEP_MOS'
  | 'ACCUMULATE_QUALITY_FAIR_VALUE'
  | 'WAIT_FOR_PULLBACK';

export type ValuationModuleRoute =
  | 'STEADY_COMPOUNDER'
  | 'CAPEX_AGGRESSOR'
  | 'PURE_CYCLICAL';

export interface ValuationReport {
  target_price: number;
  applied_module: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  dynamic_weights: { pcf: number; rim: number; relval: number };
  graham_benchmark: number;
  ui_notifications: string[]; // Array of warning strings to display on the dashboard
}

export interface EnsembleValuationLeg {
  id: 'SECTOR_PRIMARY' | 'MULTI_STAGE_RIM' | 'STATARB_RELVAL';
  label: string;
  priceIdr: number;
  weight: number;
  baseWeight?: number;
  isOutlierSlashed?: boolean;
  isDisabledByConfidence?: boolean;
}

export interface CorporateActionOverrideInput {
  ticker: string;
  splitRatioDivisor?: number;
  hasActiveBuyback?: boolean;
  buybackNominalBillionIdr?: number;
  liveMarketCapTrillionIdr?: number;
  latestQuarterLabel?: string;
  trailingRoePct?: number;
  forwardAnnualizedRoePct?: number;
  earningsGrowthYoYPct?: number;
  catalystNote?: string;
  cwipToAssetsRatio?: number;
  hasActiveAcquisition?: boolean;
}

export interface SyncTelemetryReport {
  totalRequested: number;
  liveNetworkHits: number;
  memoryCacheHits: number;
  snapshotFallbacks: number;
  activeRelaysUsed: string[];
  failedSymbols: string[];
  syncDurationMs: number;
  status: 'FULL_LIVE' | 'PARTIAL_LIVE' | 'FALLBACK_ONLY';
}

export type SectorValuationArchetype =
  | 'STEADY_COMPOUNDER_PBV'
  | 'CAPEX_AGGRESSOR_BLENDED'
  | 'PURE_CYCLICAL_NORMALIZED'
  | 'ENERGY_MATERIALS_PCF'
  | 'TELCO_INFRA_EVEBITDA'
  | 'PROPERTY_REIT_PAFFO'
  | 'FINANCIALS_JUSTIFIED_PBV'
  | 'CONSUMER_HEALTH_QUALITY_PE';

export type StatArbSignalType =
  | 'MEAN_REVERSION_BUY'
  | 'PAIR_OVEREXTENDED_TRIM'
  | 'FAIR_COINTEGRATED'
  | 'FUNDAMENTAL_DIVERGENCE';

export interface ValuationMethodComparisonItem {
  id: string;
  name: string;
  shortLabel: string;
  metricBasis: string;
  impliedMultipleLabel: string;
  fairMultipleLabel: string;
  fairPriceIdr: number;
  mosPct: number;
  weightPct: number;
  isPrimaryEnsemble?: boolean;
  isSectorPrimary?: boolean;
  isStandaloneBenchmark?: boolean;
}

export interface JoeliardiOosEvaluation {
  ticker: string;
  name: string;
  sector: string;
  lastPrice: number;
  estimatedEpsIdr: number;
  estimatedBvpsIdr: number;
  impliedPer: number;
  impliedPbv: number;
  joeliardiFairPer: number;
  joeliardiFairPbv: number;
  standaloneFairPer?: number;
  standaloneFairPbv?: number;
  intrinsicValueIdr: number;
  marginOfSafetyPct: number;
  annualizedEpsQ3Idr: number;
  historicalDpr3YPct: number;
  estimatedForwardDpsIdr: number;
  forwardDividendYieldPct: number;
  netPayoutYieldPct?: number;
  netBuybackDebtPaydownYieldPct: number;
  netDebtPaydownYieldPct?: number;
  totalShareholderYieldPct: number;
  isDividendOutlierSanitized?: boolean;
  rawSbnSpreadPct: number;
  erpBenchmarkPct: number;
  netErpSpreadPct: number;
  // Novy-Marx GP/A & AQR QMJ Accrual Reality
  grossProfitabilityToAssets?: number;
  ocfToNetIncomeRatio?: number;
  accrualRatioToAssets?: number;
  accrualPenaltyPts?: number;
  // Damodaran Justified PBV & Fabozzi SBN Multi-Tenor Spot Curve (1Y, 5Y, 10Y)
  sbnSpot1YPct?: number;
  sbnSpot5YPct?: number;
  sbnSpot10YPct?: number;
  sbnBlendedSpotRfPct?: number;
  dynamicCostOfEquityPct?: number;
  sustainableGrowthRatePct?: number;
  damodaranJustifiedPbv?: number;
  betaWeightedSizingCapPct?: number;
  // Multi-Stage Residual Income Model (Ohlson-Penman EBO 5-7Y Dynamic ROE Fade)
  rimFairValueIdr?: number;
  rimFadeYears?: number;
  rimPersistenceOmega?: number;
  rimTerminalRoePct?: number;
  // Modular ValuationEngine Router Telemetry (Steady Compounder, Capex Aggressor, Pure Cyclical)
  valuationModuleRoute?: ValuationModuleRoute;
  valuationModuleLabel?: string;
  cwipToAssetsRatio?: number;
  capexToDaRatio?: number;
  capexToRevenueRatio?: number;
  isCapexOverrideTriggered?: boolean;
  uiNotifications?: string[];
  valuationReport?: ValuationReport;
  normalizedEps7YIdr?: number;
  normalizedRoePct?: number;
  pbv10YMean?: number;
  pbv10YStdDev?: number;
  pbvZScore?: number;
  isCyclicalDerPenalized?: boolean;
  // Standalone Graham-Joeliardi "Moat" Intrinsic Value Benchmark (Floor Value)
  grahamJoeliardiBenchmarkIdr?: number;
  grahamJoeliardiRawIdr?: number;
  isMoatHaircutApplied?: boolean;
  moatHaircutReason?: string;
  // Dynamic Ensemble Weighter Telemetry
  ensembleOutlierPenalizedLeg?: string;
  ensembleConfidenceNotes?: string[];
  // Dynamic MoS & Real Portfolio Cash Sizing
  excessReturnSpreadPct?: number;
  dynamicRequiredMosPct?: number;
  hasActiveCatalyst?: boolean;
  availablePortfolioCashIdr?: number;
  realCashCappedAllocationIdr?: number;
  // Sector-Specific Institutional Valuation Matrix (P/CF, EV/EBITDA, P/AFFO, Justified PBV, Quality P/E)
  sectorValuationArchetype?: SectorValuationArchetype;
  sectorPrimaryMetricShort?: string;       // e.g. 'P/CF', 'EV/EBITDA', 'P/AFFO', 'Justified PBV', 'Quality P/E'
  sectorPrimaryMetricLabel?: string;       // e.g. 'Price-to-Cash Flow (P/CF)'
  sectorPrimaryImpliedMultiple?: number;   // e.g. 5.8 (x)
  sectorPrimaryFairMultiple?: number;      // e.g. 7.6 (x)
  sectorPrimaryPerShareIdr?: number;       // e.g. OCF/sh, EBITDA/sh, AFFO/sh, BVPS, or Cash EPS (IDR)
  sectorPrimaryPerShareLabel?: string;     // e.g. 'OCF/Saham', 'EBITDA/Saham', 'AFFO/Saham'
  sectorSpecificFairValueIdr?: number;
  sectorAcademicRationale?: string;
  // Agnostic Fundamental Cross-Sectional Peer Regression (Bartram & Grinblatt 2018 JFE)
  agnosticPeerFairValueIdr?: number;
  // Quantedge Statistical Arbitrage (Relative Value Pair Mean-Reversion)
  statArbPeerTicker?: string;
  statArbPeerName?: string;
  statArbCorrelation?: number;
  statArbBetaRatio?: number;
  statArbSpread1DPct?: number;
  statArbSpread30DPct?: number;
  statArbZScore?: number;
  statArbSignal?: StatArbSignalType;
  statArbSignalLabel?: string;
  statArbImpliedTargetIdr?: number;
  statArbRationale?: string;
  // Quantedge Systematic Multi-Metric Composite Engine
  quantedgeSystematicScore?: number;
  quantedgeCompositeYieldPct?: number;
  quantedgeAlphaVerdict?: string;
  valuationMethodsComparison?: ValuationMethodComparisonItem[];
  // Corporate Action Interceptor, Forward Annualizer, Type-Safe Ensemble & Dynamic Decision Tree
  trailingRoePct?: number;
  forwardAnnualizedRoePct?: number;
  trailingEpsIdr?: number;
  forwardAnnualizedEpsIdr?: number;
  earningsGrowthYoYPct?: number;
  latestQuarterLabel?: string;
  hasActiveBuyback?: boolean;
  buybackNominalIdr?: number;
  liveMarketCapIdr?: number;
  dynamicBuybackYieldPct?: number;
  splitRatioDivisor?: number;
  catalystValuationBoostPct?: number; // Capped at +15% per user specification
  isCatalystActive?: boolean;
  catalystBadgeLabel?: string;
  catalystNarrative?: string;
  ensembleFormulaAudit?: string; // e.g. "(Rp 1.480 × 45%) + (Rp 1.390 × 35%) + (Rp 1.320 × 20%) = Rp 1.415"
  decisionState?: RecommendationDecisionState;
  decisionActionLabel?: string;
  // KSEI HSC & Early Warning Suspect Telemetry
  hscTier?: 'HARD_BLOCK' | 'KSEI_DIVIDEND_PENALTY' | 'EARLY_WARNING_SUSPECT' | 'CLEAN';
  kseiHscConcentrationPct?: number;
  kseiHscIsNew?: boolean;
  kseiHscFootnote?: 'NONE' | 'UNREPORTED_DISTRIBUTION' | 'REPO_TRANSACTION' | 'VOLUNTARY_DELISTING';
  kseiHscScorePenaltyPts?: number;
  adtv20dIdr: number;
  maxSafeAllocationIdr: number;
  isDefensiveDiscountAnomaly: boolean;
  isUndercutDeepDiscount: boolean;
  valuationVerdict: 'STRONG_UNDERVALUED' | 'FAIR_QUALITY' | 'FULLY_VALUED' | 'OVERVALUED_OR_TRAP';
  valuationLabel: string;
  businessQualityScore: number;   // 0 - 100 (Pillar 1: GP/A, ROE vs Dynamic Ke, Anti-Junk Accruals)
  balanceSheetHealthScore: number; // 0 - 100 (Pillar 2: DER, OCF Conversion, Dividend Reality)
  valuationSafetyScore: number;   // 0 - 100 (Pillar 3: Multi-Method Ensemble MoS, Sector Matrix & SBN Spot Ke)
  oosQuantRobustnessScore: number; // 0 - 100 (Pillar 4: Quantedge StatArb, OOS Cross-Sectional Factor & 1/Beta)
  totalConvictionScore: number;   // 0 - 100
  convictionGrade: 'A+ (CORE CONVICTION)' | 'A (SOLID VALUE)' | 'B (WATCHLIST / HOLD)' | 'C (SPECULATIVE)' | 'D (AVOID / HSC)';
  keyStrengths: string[];
  keyRisks: string[];
}

export interface StructuredAiConvictionSection {
  id: string;
  badge: string;
  title: string;
  keyMetricHighlight: string;
  reasoningParagraph: string;
  bulletPoints: string[];
  sentimentTone: 'POSITIVE' | 'NEUTRAL' | 'CAUTION' | 'NEGATIVE';
}

export interface StructuredAiConvictionReport {
  verdictBadge: string;
  verdictTitle: string;
  directAnswerSummary: string;
  convictionScore: number;
  chainOfThoughtSteps: string[];
  sections: StructuredAiConvictionSection[];
  bullishDrivers: string[];
  bearishRisks: string[];
  executionStrategy: {
    recommendedAction: string;
    idealEntryZone: string;
    InvalidationOrRiskLimit: string;
    portfolioAllocationGuide: string;
    isUndercutDeepDiscount?: boolean;
    adtv20dIdr?: number;
    maxSafeAllocationIdr?: number;
    targetAllocationIdr?: number;
    isLiquidityCapped?: boolean;
    liquidityWarningBadge?: string;
  };
}


export interface MarketRegime {
  ihsgLastPrice: number;
  ihsgChange1D: number;
  dailyStdDev30D: number;       // Daily standard deviation of 30-day returns (%)
  annualizedVol30D: number;     // Annualized 30-day rolling volatility (%) = dailyStdDev * sqrt(252)
  thresholdAnnVol: number;      // Calibrated target volatility c (default 18.0%)
  macroStressScore: number;     // 0 - 100 composite stress from USD/IDR, US10Y, VIX, Commodities
  effectiveRegimeVol: number;   // Blended IHSG Vol + Macro Stress overlay
  status: MarketRegimeStatus;   // 'TENANG', 'WASPADA', or 'VOLATIL'
  defensiveWeight: number;      // Cash / Defensive Buffer (%) when volatility spikes
  aggressiveWeight: number;     // Active Multifactor Equity Exposure (%)
  updatedAt: string;
  ihsg30DSeries: { date: string; close: number; dailyReturn: number }[];
}

export interface HRPAllocationPosition {
  stock: StockMetrics;
  basket: 'DEFENSIVE' | 'AGGRESSIVE';
  intraBasketWeightPct: number;
  totalPortfolioWeightPct: number;
  allocatedIdr: number;
  lots: number;
}

export interface PortfolioAnalyticsSummary {
  positions: HRPAllocationPosition[];
  cashReserveTargetIdr: number;
  cashReserveWeightPct: number;
  equityExposureWeightPct: number;
  portfolioBeta: number;
  portfolioQmj: number;
  expectedAnnVolPct: number;
  monthlyCvar95Pct: number;
  monthlyCvar95Idr: number;
  sharpeEstimate: number;
}

export interface PortfolioHolding {
  ticker: string;
  lots: number;
  avgBuyPrice: number;
  addedAt: string;
  notes?: string;
}

export type RebalanceSignalType =
  | 'ACCUMULATE'
  | 'HOLD_CORE'
  | 'BUFFER_HOLD'
  | 'TRIM_REBALANCE'
  | 'CUT_JUNK_EXIT';

export interface EvaluatedHolding {
  holding: PortfolioHolding;
  stock: StockMetrics;
  investedIdr: number;
  marketValueIdr: number;
  unrealizedPnlIdr: number;
  unrealizedPnlPct: number;
  actualWeightPct: number;
  targetOptimalWeightPct: number;
  weightDriftPct: number;
  signal: RebalanceSignalType;
  signalLabel: string;
  lotDeltaRecommendation: number;
  rationale: string;
}

export interface ActivePortfolioEvaluation {
  holdings: EvaluatedHolding[];
  cashReserveIdr: number;
  totalInvestedIdr: number;
  totalMarketValueIdr: number;
  totalPortfolioEquityIdr: number;
  totalUnrealizedPnlIdr: number;
  totalUnrealizedPnlPct: number;
  actualDefensiveWeightPct: number;
  actualAggressiveWeightPct: number;
  actualPortfolioBeta: number;
  actualPortfolioQmj: number;
  regimeAlignmentScore: number;
}

export type RecommendationStrategyTag =
  | 'DEFENSIVE_SHIELD'
  | 'COMPOUNDER_QUALITY'
  | 'ASYMMETRIC_ALPHA'
  | 'SECTOR_DIVERSIFIER';

export interface CandidateRecommendation {
  stock: StockMetrics;
  strategyTag: RecommendationStrategyTag;
  strategyLabel: string;
  suggestedWeightPct: number;
  suggestedLots: number;
  betaImpact: string;
  qmjImpact: string;
  thesis: string;
}

export interface GitHubCloudConfig {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  patToken: string;
  autoSyncOnEdit: boolean;
  lastSyncedSha?: string;
  lastSyncedAt?: string;
}

export interface EncryptedPortfolioVault {
  version: 1;
  saltBase64: string;
  verifierHashBase64: string;
  ivBase64: string;
  cipherTextBase64: string;
  updatedAt: string;
  scopeHash?: string;
  originHash?: string;
  repoScope?: string;
  isDefaultPassphrase?: boolean;
}

export interface CloudStateBundle {
  schemaVersion: '3.0-DEMIGUEL-MF24';
  updatedAt: string;
  strategyName: string;
  rebalanceBufferPct: number;
  thresholdAnnVol: number;
  capitalIdr: number;
  cashReserveIdr: number;
  holdings: PortfolioHolding[];
  stocks: StockMetrics[];
  macroIndicators: MacroIndicator[];
  liveIhsgQuote: { lastPrice: number; change1D: number };
  liveIhsgReturns: number[];
  encryptedVault?: EncryptedPortfolioVault;
}

