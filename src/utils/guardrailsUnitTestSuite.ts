import { QuarterlyRawRow, RawTickerData, StockMetrics } from '../types/quant';
import {
  applyDispersionPenalty,
  buildTacticalOverlayFromStatArb,
  calculateInvariantGrahamJoeliardiFloor,
  calculateTwoStageCapexAggressorRI,
  calculateVolatilityTargetedSizingAndStop,
  computeIdxTtmAndSnapshotFromQuarters,
  decumulateIDXQuarters,
  runFinancialAudit,
  validateFundamentalSanity
} from './institutionalGuardrailsEngine';
import { buildValuationLedger, DynamicEnsembleWeighter } from './valuationEngine';
import {
  DEFAULT_GLOBAL_MACRO,
  evaluateJoeliardiOosFundamental
} from './quantEngine';
import { buildIdx100StockUniverse } from './liveMarketFetcher';

export interface ThreeProfileAutoAdaptSimulationRow {
  profileGroup:
    | 'BASIC_MATERIALS_CONSUMER_QUALITY'
    | 'BASIC_MATERIALS_PURE_COMMODITY'
    | 'FINANCIALS_BANKING';
  profileGroupLabel: string;
  ticker: string;
  name: string;
  idxSector: string;
  subIndustry: string;
  archetype: string;
  effectiveRoute: string;
  appliedModule: string;
  isQualityCompounderOverride: boolean;
  roeTtmPct: number;
  gpaPct: number;
  derRatio: number;
  ocfToNiRatio: number;
  kePct: number;
  sustainableGrowthPct: number;
  justifiedPbv: number;
  spotPriceIdr: number;
  intrinsicValueIdr: number;
  mosPct: number;
  ensembleWeightsLabel: string;
  leg1Summary: string;
  leg2Summary: string;
  leg3Summary: string;
  statArbPeerTicker: string;
  statArbValid: boolean;
  statArbStatusLabel: string;
  auditStatus: string;
  dataConfidence: string;
  reconciledImpliedPer: number;
  reconciledImpliedPbv: number;
  auditSummary: string;
}

/**
 * Runs a simultaneous 3-Profile Auto-Adapt Sanity Check across:
 * 1. Basic Materials / Industrials with Consumer-like Quality DNA (AVIA, ARNA)
 * 2. Basic Materials Pure Upstream/Midstream Commodity (ANTM, MDKA)
 * 3. Financials / Banking (BBCA, BRIS)
 */
export function runThreeProfileAutoAdaptSimulation(): ThreeProfileAutoAdaptSimulationRow[] {
  const universe = buildIdx100StockUniverse(40);
  const byTicker = new Map<string, StockMetrics>();
  for (const s of universe) {
    byTicker.set(s.ticker.toUpperCase(), s);
  }
  const fallbackBase = universe[0];

  const buildDeterministicProfileStock = (
    ticker: string,
    overrides: Partial<StockMetrics>
  ): StockMetrics => {
    const base = byTicker.get(ticker) ?? {
      ...fallbackBase,
      ticker,
      idxTicker: `IDX:${ticker}`,
      yfTicker: `${ticker}.JK`,
      name: `${ticker} Tbk`,
      sector: 'Basic Materials'
    };

    const merged: StockMetrics = {
      ...base,
      ...overrides,
      fundamentalsSource: 'LIVE_YAHOO_API',
      priceSource: 'LIVE_YAHOO_API',
      rfLastUpdated: new Date().toISOString().slice(0, 10)
    };
    return merged;
  };

  // Profile 1A: AVIA — Avia Avian Tbk (Basic Materials -> Specialty Chemicals / Architectural Paint)
  // Consumer-like Quality Compounder DNA: ROE 19.3%, DER 0.04x, GP/A 28.5%, OCF/NI 1.12x, Net Payout ~5.2%
  const aviaStock = buildDeterministicProfileStock('AVIA', {
    ticker: 'AVIA',
    name: 'Avia Avian Tbk',
    sector: 'Basic Materials',
    lastPrice: 480,
    sharesOutstanding: 61_953_000_000,
    equityAttributableIdr: 9_920_000_000_000, // BVPS ~Rp 160
    netIncomeTTMIdr: 1_915_000_000_000, // EPS ~Rp 30.9, ROE ~19.3%
    revenueTTMIdr: 7_450_000_000_000,
    operatingProfitTTMIdr: 2_210_000_000_000,
    ebitdaTTMIdr: 2_480_000_000_000,
    totalAssetsIdr: 11_200_000_000_000,
    totalDebtIdr: 396_000_000_000, // DER ~0.04x
    cashAndEquivalentsIdr: 2_350_000_000_000,
    ocfTTMIdr: 2_145_000_000_000, // OCF/NI ~1.12x
    capexTTMIdr: 260_000_000_000,
    daTTMIdr: 270_000_000_000,
    roe: 19.3,
    debtToEquity: 0.04,
    operatingMargin: 29.66,
    grossProfitabilityToAssets: 28.5,
    ocfToNetIncomeRatio: 1.12,
    dividendYieldPct: 4.8,
    forwardDividendYieldPct: 4.8,
    beta1Y: 0.72,
    volatilityAnn: 19.5,
    earningsGrowthYoYPct: 9.5,
    operatingProfitGrowthYoYPct: 8.8
  });

  // Profile 1B: ARNA — Arwana Citramulia Tbk (Industrials/Ceramics with Consumer Quality DNA)
  const arnaStock = buildDeterministicProfileStock('ARNA', {
    ticker: 'ARNA',
    name: 'Arwana Citramulia Tbk',
    sector: 'Industrials',
    lastPrice: 715,
    sharesOutstanding: 7_341_000_000,
    equityAttributableIdr: 1_890_000_000_000, // BVPS ~Rp 257
    netIncomeTTMIdr: 445_000_000_000, // EPS ~Rp 60.6, ROE ~23.5%
    revenueTTMIdr: 2_580_000_000_000,
    operatingProfitTTMIdr: 580_000_000_000,
    ebitdaTTMIdr: 695_000_000_000,
    totalAssetsIdr: 2_620_000_000_000,
    totalDebtIdr: 225_000_000_000, // DER ~0.12x
    cashAndEquivalentsIdr: 540_000_000_000,
    ocfTTMIdr: 510_000_000_000, // OCF/NI ~1.15x
    capexTTMIdr: 120_000_000_000,
    daTTMIdr: 115_000_000_000,
    roe: 23.54,
    debtToEquity: 0.12,
    operatingMargin: 22.48,
    grossProfitabilityToAssets: 31.4,
    ocfToNetIncomeRatio: 1.15,
    dividendYieldPct: 5.8,
    forwardDividendYieldPct: 5.8,
    beta1Y: 0.75,
    volatilityAnn: 20.5,
    earningsGrowthYoYPct: 11.2,
    operatingProfitGrowthYoYPct: 10.4
  });

  // Profile 2A: ANTM — Aneka Tambang Tbk (Basic Materials -> Pure Commodity Metals & Mining)
  const antmStock = buildDeterministicProfileStock('ANTM', {
    ticker: 'ANTM',
    name: 'Aneka Tambang Tbk',
    sector: 'Basic Materials',
    lastPrice: 1520,
    sharesOutstanding: 24_030_764_725,
    equityAttributableIdr: 29_800_000_000_000, // BVPS ~Rp 1,240
    netIncomeTTMIdr: 3_080_000_000_000, // ROE ~10.3%
    revenueTTMIdr: 43_200_000_000_000,
    operatingProfitTTMIdr: 3_950_000_000_000,
    ebitdaTTMIdr: 5_350_000_000_000,
    totalAssetsIdr: 41_500_000_000_000,
    totalDebtIdr: 4_800_000_000_000, // DER ~0.16x
    cashAndEquivalentsIdr: 8_200_000_000_000,
    ocfTTMIdr: 3_600_000_000_000,
    capexTTMIdr: 1_550_000_000_000,
    daTTMIdr: 1_400_000_000_000,
    roe: 10.34,
    debtToEquity: 0.16,
    operatingMargin: 9.14,
    grossProfitabilityToAssets: 14.2,
    ocfToNetIncomeRatio: 1.17,
    dividendYieldPct: 3.5,
    forwardDividendYieldPct: 3.5,
    beta1Y: 1.18,
    volatilityAnn: 33.5
  });

  // Profile 2B: MDKA — Merdeka Copper Gold Tbk (Basic Materials -> Smelter & Upstream Mining Expansion)
  const mdkaStock = buildDeterministicProfileStock('MDKA', {
    ticker: 'MDKA',
    name: 'Merdeka Copper Gold Tbk',
    sector: 'Basic Materials',
    lastPrice: 2350,
    sharesOutstanding: 24_472_983_771,
    equityAttributableIdr: 16_500_000_000_000, // BVPS ~Rp 674
    netIncomeTTMIdr: 980_000_000_000, // ROE ~5.9%
    revenueTTMIdr: 28_400_000_000_000,
    operatingProfitTTMIdr: 2_650_000_000_000,
    ebitdaTTMIdr: 5_150_000_000_000,
    totalAssetsIdr: 74_000_000_000_000,
    totalDebtIdr: 28_500_000_000_000, // DER ~1.73x
    cashAndEquivalentsIdr: 6_800_000_000_000,
    ocfTTMIdr: 3_400_000_000_000,
    capexTTMIdr: 6_200_000_000_000,
    daTTMIdr: 2_500_000_000_000,
    roe: 5.94,
    debtToEquity: 1.73,
    operatingMargin: 9.33,
    grossProfitabilityToAssets: 8.4,
    ocfToNetIncomeRatio: 3.47,
    dividendYieldPct: 0.0,
    forwardDividendYieldPct: 0.0,
    beta1Y: 1.32,
    volatilityAnn: 38.0
  });

  // Profile 3A: BBCA — Bank Central Asia Tbk (Financials -> KBMI 4 Major Bank)
  const bbcaStock = buildDeterministicProfileStock('BBCA', {
    ticker: 'BBCA',
    name: 'Bank Central Asia Tbk',
    sector: 'Financials',
    lastPrice: 10000,
    sharesOutstanding: 123_275_050_000,
    equityAttributableIdr: 265_041_357_500_000, // BVPS Rp 2,150
    netIncomeTTMIdr: 54_857_397_250_000, // EPS Rp 445, ROE 20.7%
    revenueTTMIdr: 108_500_000_000_000,
    operatingProfitTTMIdr: 68_400_000_000_000,
    ebitdaTTMIdr: 72_600_000_000_000,
    totalAssetsIdr: 1_450_000_000_000_000,
    totalDebtIdr: 65_000_000_000_000,
    cashAndEquivalentsIdr: 110_000_000_000_000,
    ocfTTMIdr: 62_000_000_000_000,
    capexTTMIdr: 4_200_000_000_000,
    daTTMIdr: 2_800_000_000_000,
    roe: 20.7,
    debtToEquity: 4.4,
    operatingMargin: 63.0,
    dividendYieldPct: 2.9,
    forwardDividendYieldPct: 2.9,
    beta1Y: 0.78,
    volatilityAnn: 18.5,
    carPct: 29.4,
    nplPct: 1.9,
    nimPct: 5.8
  });

  // Profile 3B: BRIS — Bank Syariah Indonesia Tbk (Financials -> Sharia Bank)
  const brisStock = buildDeterministicProfileStock('BRIS', {
    ticker: 'BRIS',
    name: 'Bank Syariah Indonesia Tbk',
    sector: 'Financials',
    lastPrice: 2850,
    sharesOutstanding: 46_129_260_000,
    equityAttributableIdr: 43_822_797_000_000, // BVPS Rp 950
    netIncomeTTMIdr: 7_380_681_600_000, // EPS Rp 160, ROE 16.84%
    revenueTTMIdr: 24_800_000_000_000,
    operatingProfitTTMIdr: 9_650_000_000_000,
    ebitdaTTMIdr: 10_400_000_000_000,
    totalAssetsIdr: 365_000_000_000_000,
    totalDebtIdr: 18_000_000_000_000,
    cashAndEquivalentsIdr: 32_000_000_000_000,
    ocfTTMIdr: 8_500_000_000_000,
    capexTTMIdr: 950_000_000_000,
    daTTMIdr: 750_000_000_000,
    roe: 16.84,
    debtToEquity: 6.2,
    operatingMargin: 38.9,
    dividendYieldPct: 1.5,
    forwardDividendYieldPct: 1.5,
    beta1Y: 1.05,
    volatilityAnn: 27.5,
    carPct: 21.2,
    nplPct: 2.0,
    nimPct: 5.6
  });

  const profiles: Array<{
    group: ThreeProfileAutoAdaptSimulationRow['profileGroup'];
    groupLabel: string;
    stock: StockMetrics;
  }> = [
    {
      group: 'BASIC_MATERIALS_CONSUMER_QUALITY',
      groupLabel: '1. Basic Materials / Industrials — Consumer-Like Quality DNA',
      stock: aviaStock
    },
    {
      group: 'BASIC_MATERIALS_CONSUMER_QUALITY',
      groupLabel: '1. Basic Materials / Industrials — Consumer-Like Quality DNA',
      stock: arnaStock
    },
    {
      group: 'BASIC_MATERIALS_PURE_COMMODITY',
      groupLabel: '2. Basic Materials — Pure Commodity & Upstream Mining',
      stock: antmStock
    },
    {
      group: 'BASIC_MATERIALS_PURE_COMMODITY',
      groupLabel: '2. Basic Materials — Pure Commodity & Upstream Mining',
      stock: mdkaStock
    },
    {
      group: 'FINANCIALS_BANKING',
      groupLabel: '3. Financials / Perbankan — Justified PBV (ROE & CoE)',
      stock: bbcaStock
    },
    {
      group: 'FINANCIALS_BANKING',
      groupLabel: '3. Financials / Perbankan — Justified PBV (ROE & CoE)',
      stock: brisStock
    }
  ];

  return profiles.map(({ group, groupLabel, stock }) => {
    const ev = evaluateJoeliardiOosFundamental(stock, DEFAULT_GLOBAL_MACRO);
    const sc = ev.sectorClassification;
    const comps = ev.valuationLedger?.components ?? [];
    const l1 = comps[0];
    const l2 = comps[1];
    const l3 = comps[2];
    const audit = ev.financialAuditReport;
    const tac = ev.tacticalOverlay;

    const w1Pct = Math.round((l1?.weight ?? 0.45) * 100);
    const w2Pct = Math.round((l2?.weight ?? 0.35) * 100);
    const w3Pct = Math.max(0, 100 - w1Pct - w2Pct);

    return {
      profileGroup: group,
      profileGroupLabel: groupLabel,
      ticker: stock.ticker,
      name: stock.name,
      idxSector: stock.sector,
      subIndustry: sc?.subIndustry ?? 'UNKNOWN',
      archetype: sc?.archetype ?? 'UNKNOWN',
      effectiveRoute: ev.valuationModuleRoute ?? sc?.resolvedValuationRoute ?? 'STEADY_COMPOUNDER',
      appliedModule: ev.valuationReport?.applied_module ?? sc?.resolvedAppliedModule ?? 'Compounder',
      isQualityCompounderOverride: Boolean(ev.isQualityCompounderOverride),
      roeTtmPct: Number(stock.roe.toFixed(2)),
      gpaPct: Number((ev.grossProfitabilityToAssets ?? 0).toFixed(1)),
      derRatio: Number(stock.debtToEquity.toFixed(2)),
      ocfToNiRatio: Number((ev.ocfToNetIncomeRatio ?? 1.0).toFixed(2)),
      kePct: Number((ev.dynamicCostOfEquityPct ?? 11.5).toFixed(2)),
      sustainableGrowthPct: Number((ev.sustainableGrowthRatePct ?? 5.0).toFixed(2)),
      justifiedPbv: Number((ev.damodaranJustifiedPbv ?? ev.joeliardiFairPbv).toFixed(2)),
      spotPriceIdr: stock.lastPrice,
      intrinsicValueIdr: ev.intrinsicValueIdr,
      mosPct: Number(ev.marginOfSafetyPct.toFixed(1)),
      ensembleWeightsLabel: `${w1Pct}% / ${w2Pct}% / ${w3Pct}%`,
      leg1Summary: `${l1?.label ?? 'Leg 1'}: Rp ${(l1?.value ?? 0).toLocaleString('id-ID')} (${w1Pct}%)`,
      leg2Summary: `${l2?.label ?? 'Leg 2'}: Rp ${(l2?.value ?? 0).toLocaleString('id-ID')} (${w2Pct}%)`,
      leg3Summary: `${l3?.label ?? 'Leg 3'}: Rp ${(l3?.value ?? 0).toLocaleString('id-ID')} (${w3Pct}%)`,
      statArbPeerTicker: ev.statArbPeerTicker ?? 'N/A',
      statArbValid: tac?.isStatArbValid ?? ev.statArbPeerTicker !== 'N/A',
      statArbStatusLabel:
        tac?.isStatArbValid === false
          ? tac.actionLabel
          : `${ev.statArbPeerTicker} (ρ=${(ev.statArbCorrelation ?? 0.85).toFixed(2)}, Z=${(ev.statArbZScore ?? 0).toFixed(2)}σ)`,
      auditStatus: audit?.auditStatus ?? 'PASS',
      dataConfidence: audit?.dataConfidenceLevel ?? 'HIGH',
      reconciledImpliedPer: audit?.reconciledFairPer ?? ev.joeliardiFairPer,
      reconciledImpliedPbv: audit?.reconciledFairPbv ?? ev.joeliardiFairPbv,
      auditSummary: audit?.auditSummaryBannerText ?? 'Audit Pre-Render PASS'
    };
  });
}


export interface UnitTestCaseResult {
  id: string;
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  scenarioType: 'CLEAN_DATA' | 'CORRUPTED_OR_STRESS_DATA';
  passed: boolean;
  expectedSummary: string;
  actualSummary: string;
  assertions: Array<{
    label: string;
    passed: boolean;
    expected: string;
    actual: string;
  }>;
}

export function createBaseCleanRawTickerData(): RawTickerData {
  const nowIso = new Date().toISOString().slice(0, 10);
  return {
    ticker: 'BBCA',
    name: 'Bank Central Asia Tbk',
    sector: 'Financials',
    price: 10000,
    marketCap: 1_232_750_000_000_000, // 123.275B shares * Rp 10,000
    sharesOutstanding: 123_275_000_000,
    epsTTM: 445,
    forwardAnnualizedEps: 495,
    epsAvg3Y: 410,
    epsAvg5Y: 380,
    netIncomeTTM: 54_857_375_000_000, // 445 * 123.275B
    revenueTTM: 108_500_000_000_000,
    operatingProfitTTM: 68_400_000_000_000,
    ebitdaTTM: 72_600_000_000_000,
    netIncomeYoYPct: 18.5,
    operatingProfitYoYPct: 14.2,
    bvps: 2150,
    equityAttributable: 265_041_250_000_000, // 2150 * 123.275B
    totalDebt: 50_000_000_000_000,
    cashAndEquivalents: 80_000_000_000_000,
    capexTTM: 4_200_000_000_000,
    daTTM: 2_800_000_000_000,
    cwipToAssetsRatio: 0.04,
    ocfTTM: 60_000_000_000_000,
    roeTTM: 0.207,
    roeAvg3Y: 0.198,
    roeAvg5Y: 0.191,
    roicTTM: 0.165,
    incrementalRoic: 0.18,
    debtToEquity: 0.25,
    adtv20dIDR: 680_000_000_000,
    adtvVolumeUnit: 'SHARES',
    adtvCurrencyScale: 'FULL_IDR',
    spotRf10Y: 0.0665,
    rfLastUpdated: nowIso,
    referenceNowDate: nowIso,
    baseCostOfEquity: 0.11,
    baseGrowthRate: 0.055,
    evToEbitda5YMean: 12.5,
    atr20: 220,
    realizedAnnualVol: 0.195,
    beta1Y: 0.78,
    marketRegime: 'TENANG'
  };
}

/**
 * Executes the complete P0–P2 Institutional Guardrails Unit Test Suite
 * comparing Clean Data vs Corrupted/Distorted Data scenarios.
 */
export function runInstitutionalGuardrailsUnitTests(): UnitTestCaseResult[] {
  const results: UnitTestCaseResult[] = [];
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString().slice(0, 10);

  // ==========================================================================
  // TEST 1 (P0.1 - CLEAN vs CORRUPTED): Cross-Check Shares, EPS*Shares vs NI, BVPS*Shares vs Equity
  // ==========================================================================
  {
    const cleanRaw = createBaseCleanRawTickerData();
    const cleanSanity = validateFundamentalSanity(cleanRaw);

    const corruptedRaw: RawTickerData = {
      ...cleanRaw,
      ticker: 'DISTORT1',
      // 14.8% shares mismatch (impliedShares = 123.275B, reported = 105B -> >3% threshold)
      sharesOutstanding: 105_000_000_000,
      // EPS * Shares = 445 * 105B = 46.725T vs NI_TTM = 54.857T (~14.8% mismatch > 5%)
      netIncomeTTM: 54_857_375_000_000
    };
    const corruptSanity = validateFundamentalSanity(corruptedRaw);

    const baseDispersion = applyDispersionPenalty({
      valuationOutputsIDR: [11500, 11800, 12100],
      rawConvictionScore: 88,
      isOutlierEnsembleActive: false
    });

    const riskOnCorrupt = calculateVolatilityTargetedSizingAndStop({
      price: corruptedRaw.price,
      beta1Y: 0.78,
      realizedAnnualVol: 0.20,
      atr20: 220,
      marketRegime: 'TENANG',
      rawConvictionScore: 88,
      dispersionPenalty: baseDispersion,
      sanityReport: corruptSanity
    });

    const assertions = [
      {
        label: 'Data Bersih lolos status PASS & isGradeABlocked = false',
        passed: cleanSanity.status === 'PASS' && cleanSanity.isGradeABlocked === false,
        expected: 'PASS & isGradeABlocked=false',
        actual: `${cleanSanity.status} & isGradeABlocked=${cleanSanity.isGradeABlocked}`
      },
      {
        label: 'Mismatch Shares > 3% & EPS*Shares > 5% memicu CRITICAL_DATA_MISMATCH (FAIL)',
        passed:
          corruptSanity.status === 'FAIL' &&
          corruptSanity.flags.includes('CRITICAL_DATA_MISMATCH'),
        expected: 'FAIL [CRITICAL_DATA_MISMATCH]',
        actual: `${corruptSanity.status} [${corruptSanity.flags.join(', ')}]`
      },
      {
        label: 'Blokir Grade A / Core Conviction menjadi DATA_AUDIT_REQUIRED',
        passed:
          corruptSanity.isGradeABlocked === true &&
          riskOnCorrupt.finalConvictionGrade === 'DATA_AUDIT_REQUIRED',
        expected: 'DATA_AUDIT_REQUIRED',
        actual: riskOnCorrupt.finalConvictionGrade
      }
    ];

    results.push({
      id: 'P0.1_SHARES_EPS_BVPS_CROSSCHECK',
      priority: 'P0',
      title: 'P0.1 Cross-Check Shares Outstanding (>3%), EPS×Shares vs NI_TTM (>5%), & Blokir Grade A',
      scenarioType: 'CORRUPTED_OR_STRESS_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'CRITICAL_DATA_MISMATCH memblokir Grade A -> DATA_AUDIT_REQUIRED',
      actualSummary: `Status: ${corruptSanity.status} | Grade: ${riskOnCorrupt.finalConvictionGrade} | ΔShares: ${(corruptSanity.sharesMismatchPct * 100).toFixed(2)}%`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 2 (P0.2): ADTV Unit Normalizer (Lot x 100 & Ribuan) + Sanity Trap (MarketCap >= 1T & ADTV < 50M)
  // ==========================================================================
  {
    const lotThousandsRaw: RawTickerData = {
      ...createBaseCleanRawTickerData(),
      ticker: 'LOTTEST',
      price: 10000,
      adtv20dIDR: 250_000_000, // Rp 250 Juta dalam satuan THOUSAND_IDR -> * 1.000 = Rp 250 Miliar
      adtv20dVolumeRaw: 250_000, // 250.000 LOT -> * 100 = 25.000.000 lembar
      adtvVolumeUnit: 'LOT',
      adtvCurrencyScale: 'THOUSAND_IDR'
    };
    const lotSanity = validateFundamentalSanity(lotThousandsRaw);

    const anomalyRaw: RawTickerData = {
      ...createBaseCleanRawTickerData(),
      ticker: 'ADTVTRAP',
      marketCap: 5_000_000_000_000, // Rp 5 Triliun (>= 1e12)
      sharesOutstanding: 500_000_000,
      price: 10000,
      epsTTM: 800,
      netIncomeTTM: 400_000_000_000,
      bvps: 5000,
      equityAttributable: 2_500_000_000_000,
      adtv20dIDR: 12_000_000, // Hanya Rp 12 Juta/hari (< Rp 50 Juta) karena salah satuan
      adtvVolumeUnit: 'SHARES',
      adtvCurrencyScale: 'FULL_IDR'
    };
    const anomalySanity = validateFundamentalSanity(anomalyRaw);

    const assertions = [
      {
        label: 'Konversi Lot (×100 lembar) dan Ribuan IDR (×1.000) ke Rupiah penuh bekerja akurat',
        passed:
          lotSanity.normalizedAdtv20dShares === 25_000_000 &&
          lotSanity.normalizedAdtv20dIDR === 250_000_000_000,
        expected: '25.000.000 lbr & Rp 250.000.000.000',
        actual: `${lotSanity.normalizedAdtv20dShares.toLocaleString('id-ID')} lbr & Rp ${lotSanity.normalizedAdtv20dIDR.toLocaleString('id-ID')}`
      },
      {
        label: 'Sanity Trap: MarketCap >= Rp 1T tetapi ADTV < Rp 50 Juta melempar ADTV_UNIT_ANOMALY',
        passed:
          anomalySanity.flags.includes('ADTV_UNIT_ANOMALY') && anomalySanity.status === 'WARN',
        expected: 'WARN [ADTV_UNIT_ANOMALY]',
        actual: `${anomalySanity.status} [${anomalySanity.flags.join(', ')}]`
      }
    ];

    results.push({
      id: 'P0.2_ADTV_NORMALIZER_AND_TRAP',
      priority: 'P0',
      title: 'P0.2 ADTV Unit Normalizer (Lot×100 & Full IDR) & Sanity Trap (MCap ≥ 1T & ADTV < 50Jt)',
      scenarioType: 'CORRUPTED_OR_STRESS_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'Normalisasi Lot×100 = 25Jt lbr (Rp 250M) & Trap ADTV_UNIT_ANOMALY aktif',
      actualSummary: `Norm ADTV: Rp ${(lotSanity.normalizedAdtv20dIDR / 1e9).toFixed(0)}M | Trap: ${anomalySanity.flags.join(', ')}`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 3 (P0.3): Dual-Confirmation Catalyst (NI YoY >= 15% AND Operating Profit YoY >= 10%)
  // ==========================================================================
  {
    const dualConfirmedRaw = createBaseCleanRawTickerData(); // NI +18.5%, OP +14.2%
    const dualSanity = validateFundamentalSanity(dualConfirmedRaw);

    const fakeOneOffSpikeRaw: RawTickerData = {
      ...createBaseCleanRawTickerData(),
      ticker: 'FAKECAT',
      netIncomeYoYPct: 32.0, // NI melonjak +32% karena laba kurs/penjualan aset non-operasional
      operatingProfitYoYPct: 4.5 // Laba Usaha hanya +4.5% (< 10%)
    };
    const fakeSanity = validateFundamentalSanity(fakeOneOffSpikeRaw);

    const assertions = [
      {
        label: 'NI YoY (+18.5% >= 15%) & OP YoY (+14.2% >= 10%) mengaktifkan Dual-Confirmation Catalyst',
        passed: dualSanity.isDualCatalystConfirmed === true,
        expected: 'isDualCatalystConfirmed = true',
        actual: `isDualCatalystConfirmed = ${dualSanity.isDualCatalystConfirmed}`
      },
      {
        label: 'Lonjakan NI YoY (+32%) tanpa dukungan OP YoY (+4.5% < 10%) ditolak (CATALYST_UNCONFIRMED_NON_OP)',
        passed:
          fakeSanity.isDualCatalystConfirmed === false &&
          fakeSanity.flags.includes('CATALYST_UNCONFIRMED_NON_OP'),
        expected: 'false [CATALYST_UNCONFIRMED_NON_OP]',
        actual: `${fakeSanity.isDualCatalystConfirmed} [${fakeSanity.flags.join(', ')}]`
      }
    ];

    results.push({
      id: 'P0.3_DUAL_CONFIRMATION_CATALYST',
      priority: 'P0',
      title: 'P0.3 Basis TTM Default & Dual-Confirmation Catalyst (NI YoY ≥ 15% + Laba Usaha YoY ≥ 10%)',
      scenarioType: 'CORRUPTED_OR_STRESS_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'Sinyal katalis palsu non-operating ditolak otomatis',
      actualSummary: `DualPass: ${dualSanity.isDualCatalystConfirmed} | SingleLegRejected: ${!fakeSanity.isDualCatalystConfirmed}`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 4 (P0.4): SBN 10Y Freshness Check (> 7 Days -> STALE_RF_DATA, +50 bps Ke & Badge Downgrade)
  // ==========================================================================
  {
    const staleDateIso = new Date(nowMs - 11 * 86_400_000).toISOString().slice(0, 10); // 11 hari lalu (> 7 hari)
    const staleRfRaw: RawTickerData = {
      ...createBaseCleanRawTickerData(),
      rfLastUpdated: staleDateIso,
      referenceNowDate: nowIso
    };
    const staleSanity = validateFundamentalSanity(staleRfRaw);

    const baseDisp = applyDispersionPenalty({
      valuationOutputsIDR: [11600, 12000, 12400],
      rawConvictionScore: 86,
      isOutlierEnsembleActive: false
    });

    const riskWithStaleRf = calculateVolatilityTargetedSizingAndStop({
      price: 10000,
      beta1Y: 0.8,
      realizedAnnualVol: 0.19,
      atr20: 210,
      marketRegime: 'TENANG',
      rawConvictionScore: 86,
      dispersionPenalty: baseDisp,
      sanityReport: staleSanity
    });

    const assertions = [
      {
        label: 'Usia kurva SBN 11 hari (> 7 hari) menyalakan flag STALE_RF_DATA',
        passed:
          staleSanity.isRfStale === true && staleSanity.flags.includes('STALE_RF_DATA'),
        expected: 'isRfStale=true [STALE_RF_DATA]',
        actual: `isRfStale=${staleSanity.isRfStale} [${staleSanity.flags.join(', ')}]`
      },
      {
        label: 'Safety buffer otomatis +50 bps ditambahkan pada Cost of Equity (Ke)',
        passed: staleSanity.keSafetyBufferBps === 50,
        expected: '+50 bps',
        actual: `+${staleSanity.keSafetyBufferBps} bps`
      },
      {
        label: 'Badge keyakinan diturunkan 1 tingkat (A+ -> A) sampai kurva SBN diperbarui',
        passed:
          staleSanity.convictionBadgeDowngraded === true &&
          riskWithStaleRf.finalConvictionGrade === 'A (SOLID VALUE)',
        expected: 'A (SOLID VALUE)',
        actual: riskWithStaleRf.finalConvictionGrade
      }
    ];

    results.push({
      id: 'P0.4_SBN_FRESHNESS_GUARDRAIL',
      priority: 'P0',
      title: 'P0.4 Freshness Check Kurva SBN 10Y (> 7 Hari -> STALE_RF_DATA, +50 bps Ke & Downgrade Badge)',
      scenarioType: 'CORRUPTED_OR_STRESS_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'STALE_RF_DATA aktif, +50 bps Ke, dan downgrade A+ ke A',
      actualSummary: `Age: ${staleSanity.rfAgeDays}d | Buffer: +${staleSanity.keSafetyBufferBps}bps | Grade: ${riskWithStaleRf.finalConvictionGrade}`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 5 (P1.1): 2-Stage Residual Income Capex Aggressor (ROIC > Ke Gatekeeper & Terminal Spread >= 4%)
  // ==========================================================================
  {
    // Case A: Value-Creating Capex (ROIC 16.5% > Ke 11.5%)
    const valueCreatingRI = calculateTwoStageCapexAggressorRI({
      bvps0: 2000,
      roeTTM: 0.18,
      roicTTM: 0.165,
      incrementalRoic: 0.172,
      costOfEquityKe: 0.115,
      baseGrowthRate: 0.065
    });

    // Case B: Value-Destroying Capex (ROIC 8.0% <= Ke 9.2%) with extreme low Ke test to verify spread >= 4%
    const valueDestroyingRI = calculateTwoStageCapexAggressorRI({
      bvps0: 2000,
      roeTTM: 0.095,
      roicTTM: 0.08,
      incrementalRoic: 0.075,
      costOfEquityKe: 0.092, // Ke = 9.2% -> g_terminal must be capped at 9.2% - 4.0% = 5.2% (<= 6.0%)
      baseGrowthRate: 0.07
    });

    const assertions = [
      {
        label: 'ROIC (16.5%) > Ke (11.5%) membuka kunci bonus g_high = min(baseG + 2%, 12%) = 8.5%',
        passed:
          valueCreatingRI.isRoicAboveKe === true &&
          Math.abs(valueCreatingRI.stage1GrowthRate * 100 - 8.5) < 0.01,
        expected: 'Unlocked, g_high = 8.5%',
        actual: `Unlocked=${valueCreatingRI.isRoicAboveKe}, g_high=${(valueCreatingRI.stage1GrowthRate * 100).toFixed(2)}%`
      },
      {
        label: 'Value-Destroying Capex (ROIC 8.0% <= Ke 9.2%) memblokir premi ekspansi +2%',
        passed: valueDestroyingRI.isRoicAboveKe === false,
        expected: 'isRoicAboveKe = false',
        actual: `isRoicAboveKe = ${valueDestroyingRI.isRoicAboveKe}`
      },
      {
        label: 'Terminal Growth terkunci <= 6.0% DAN spread minimum (Ke - g_terminal) >= 4.0% terjaga',
        passed:
          valueCreatingRI.terminalGrowthRate <= 0.06001 &&
          valueCreatingRI.terminalSpread >= 0.03999 &&
          valueDestroyingRI.terminalGrowthRate <= 0.05201 &&
          valueDestroyingRI.terminalSpread >= 0.03999,
        expected: 'g_term <= 6.0% & (Ke - g_term) >= 4.0%',
        actual: `CaseA: gT=${(valueCreatingRI.terminalGrowthRate * 100).toFixed(2)}%, Spread=${(valueCreatingRI.terminalSpread * 100).toFixed(2)}% | CaseB: gT=${(valueDestroyingRI.terminalGrowthRate * 100).toFixed(2)}%, Spread=${(valueDestroyingRI.terminalSpread * 100).toFixed(2)}%`
      }
    ];

    results.push({
      id: 'P1.1_TWO_STAGE_CAPEX_AGGRESSOR_RI',
      priority: 'P1',
      title: 'P1.1 2-Stage Residual Income Capex Aggressor (Syarat ROIC > Ke, g_term ≤ 6%, Spread ≥ 4%)',
      scenarioType: 'CLEAN_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'Tidak ada ledakan penyebut perpetuitas; ROIC > Ke & Spread >= 4% dipatuhi',
      actualSummary: `2-Stage Fair: Rp ${valueCreatingRI.intrinsicValuePerShareIDR.toLocaleString('id-ID')} | g1=${(valueCreatingRI.stage1GrowthRate * 100).toFixed(1)}% | gT=${(valueCreatingRI.terminalGrowthRate * 100).toFixed(1)}%`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 6 (P1.2): Hard Invariant pada Standalone Floor Graham-Joeliardi (Floor <= Ensemble Fair Value)
  // ==========================================================================
  {
    const floorResult = calculateInvariantGrahamJoeliardiFloor({
      epsTTM: 500, // TTM EPS tinggi
      epsAvg3Y: 400, // Normalized 3Y/5Y lebih konservatif -> wajib pakai min(TTM, Avg3Y, Avg(3Y,5Y)) = 390
      epsAvg5Y: 380,
      growthRate: 0.06,
      spotRf10Y: 0.065,
      roeTTM: 0.18,
      roeAvg3Y: 0.165,
      roeAvg5Y: 0.16,
      debtToEquity: 0.4,
      ensembleFairValue: 4500, // Raw Graham floor (~Rp 5.515) melampaui Ensemble Rp 4.500 -> wajib di-clamp ke 90% Ensemble (Rp 4.050)
      tickRounder: (v) => Math.round(v)
    });

    const assertions = [
      {
        label: 'Menggunakan Normalized EPS historis min(TTM 500, Avg3Y 400, Blend3Y5Y 390) = Rp 390 (Bukan Forward EPS)',
        passed: floorResult.normalizedBasisEps === 390,
        expected: 'Rp 390',
        actual: `Rp ${floorResult.normalizedBasisEps}`
      },
      {
        label: 'Hard Invariant: Jika Raw Floor > Ensemble Fair Value, clamp ke 90% Ensemble (standaloneFloor <= ensembleFairValue)',
        passed:
          floorResult.isFloorClamped === true &&
          floorResult.standaloneFloor <= 4500 &&
          floorResult.standaloneFloor === 4050,
        expected: 'Clamped = true, Floor = Rp 4.050 (<= Rp 4.500)',
        actual: `Clamped = ${floorResult.isFloorClamped}, Floor = Rp ${floorResult.standaloneFloor}`
      }
    ];

    results.push({
      id: 'P1.2_GRAHAM_FLOOR_HARD_INVARIANT',
      priority: 'P1',
      title: 'P1.2 Hard Invariant Standalone Floor Graham-Joeliardi (Normalized 3-5Y & Clamping ≤ 90% Ensemble)',
      scenarioType: 'CORRUPTED_OR_STRESS_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'Floor memakai EPS 3-5Y Rp 390 dan di-clamp pada Rp 4.050 (<= Ensemble Rp 4.500)',
      actualSummary: `NormEPS: Rp ${floorResult.normalizedBasisEps} | RawFloor: Rp ${floorResult.rawStandaloneFloor} -> Clamped: Rp ${floorResult.standaloneFloor}`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 7 (P1.3): Pisahkan StatArb dari Nilai Intrinsik (Intrinsic Engine vs Tactical Overlay)
  // ==========================================================================
  {
    const ensembleWeights = DynamicEnsembleWeighter.computeWeights({
      sector: 'Healthcare',
      route: 'CAPEX_AGGRESSOR',
      effectiveModule: 'Capex_Aggressor',
      sectorLabel: '2-Stage Capex RI',
      sectorPriceIdr: 3200,
      rimLabel: 'Multi-Stage RIM',
      rimPriceIdr: 3100,
      relValLabel: 'Historical EV/EBITDA 5Y Band',
      relValPriceIdr: 3300,
      ocfToNetIncomeRatio: 0.95,
      peerCorrelation: 0.85,
      hscDiscountMultiplier: 1.0,
      tickRounder: (v) => Math.round(v)
    });

    const tacticalOverlay = buildTacticalOverlayFromStatArb({
      pairTicker: 'MIKA',
      pairName: 'Mitra Keluarga Karyasehat Tbk',
      correlation: 0.84,
      betaRatio: 1.05,
      zScore: -1.85,
      spread1DPct: -1.4,
      spread30DPct: -7.8,
      impliedPairTargetIDR: 3950, // Angka StatArb tinggi TIDAK boleh masuk ke Ensemble Fair Value
      statArbSignal: 'MEAN_REVERSION_BUY',
      rationale: 'Spread diskon -1.85 sigma terhadap MIKA'
    });

    const legIds = ensembleWeights.legs.map((l) => l.id);

    const assertions = [
      {
        label: 'Ketiga kaki Ensemble murni metode fundamental intrinsik (termasuk HISTORICAL_EVEBITDA_5Y)',
        passed:
          legIds.includes('SECTOR_PRIMARY') &&
          legIds.includes('MULTI_STAGE_RIM') &&
          legIds.includes('HISTORICAL_EVEBITDA_5Y'),
        expected: 'SECTOR_PRIMARY, MULTI_STAGE_RIM, HISTORICAL_EVEBITDA_5Y',
        actual: legIds.join(', ')
      },
      {
        label: 'Target StatArb (Rp 3.950) diisolasi di objek tacticalOverlay dengan sinyal TACTICAL_ENTRY_FAVORABLE',
        passed:
          tacticalOverlay.pairTicker === 'MIKA' &&
          tacticalOverlay.action === 'TACTICAL_ENTRY_FAVORABLE' &&
          tacticalOverlay.impliedPairTargetIDR === 3950,
        expected: 'MIKA | TACTICAL_ENTRY_FAVORABLE | Target Rp 3.950',
        actual: `${tacticalOverlay.pairTicker} | ${tacticalOverlay.action} | Target Rp ${tacticalOverlay.impliedPairTargetIDR}`
      }
    ];

    results.push({
      id: 'P1.3_STATARB_SEPARATED_TO_TACTICAL_OVERLAY',
      priority: 'P1',
      title: 'P1.3 Pemisahan StatArb ke TacticalOverlay & Kaki ke-3 Historical EV/EBITDA Band 5Y',
      scenarioType: 'CLEAN_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'Ensemble bebas pencemaran harga relatif StatArb; TacticalOverlay berdiri mandiri',
      actualSummary: `Legs: [${legIds.join(', ')}] | Overlay: ${tacticalOverlay.pairTicker} (${tacticalOverlay.zScore}σ -> ${tacticalOverlay.action})`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 8 (P2.1 & P2.2): Volatility-Targeted Barbell Sizing & ATR/Vol Calibrated Stop Loss
  // ==========================================================================
  {
    const cleanSanity = validateFundamentalSanity(createBaseCleanRawTickerData());
    const cleanDisp = applyDispersionPenalty({
      valuationOutputsIDR: [2450, 2600, 2750],
      rawConvictionScore: 84,
      isOutlierEnsembleActive: false
    });

    // Saham Beta rendah (0.45 -> 1/Beta Cap = 18%), TETAPI realizedAnnualVol = 42% (> 35%) dan rezim VOLATIL
    const riskResult = calculateVolatilityTargetedSizingAndStop({
      price: 2000,
      beta1Y: 0.45, // 1/Beta murni akan memberi 18.0%
      realizedAnnualVol: 0.42, // > 35% -> wajib dipangkas ke 8% - 12%
      atr20: 65,
      marketRegime: 'VOLATIL',
      rawConvictionScore: 84,
      dispersionPenalty: cleanDisp,
      sanityReport: cleanSanity
    });

    const assertions = [
      {
        label: 'Volatility Scalar memangkas plafon 1/Beta (18.0%) ke rentang 8%–12% saat Vol > 35% atau Rezim VOLATIL',
        passed:
          riskResult.inverseBetaCapPct === 18.0 &&
          riskResult.isVolatilityScalarTriggered === true &&
          riskResult.finalMaxAllocationPct >= 8.0 &&
          riskResult.finalMaxAllocationPct <= 12.0,
        expected: '1/Beta=18.0% -> FinalMaxAllocation dalam 8.0%–12.0%',
        actual: `1/Beta=${riskResult.inverseBetaCapPct}% -> Final=${riskResult.finalMaxAllocationPct}%`
      },
      {
        label: 'Stop Loss ATR/Vol dikalibrasi pada rentang wajar 12%–18% di bawah harga masuk + mode Tranche Invalidation',
        passed:
          riskResult.stopLossPct >= 12.0 &&
          riskResult.stopLossPct <= 18.0 &&
          riskResult.stopLossPriceIDR < 2000 &&
          riskResult.fundamentalInvalidationStopTriggers.length >= 2,
        expected: 'StopLoss 12%–18% & Tranche Invalidation Stop tersedia',
        actual: `Stop=-${riskResult.stopLossPct}% (Rp ${riskResult.stopLossPriceIDR}) | T1=${riskResult.tranche1AllocationPct}%`
      }
    ];

    results.push({
      id: 'P2.1_P2.2_VOL_TARGETED_SIZING_AND_ATR_STOP',
      priority: 'P2',
      title: 'P2.1 & P2.2 Volatility-Targeted Barbell Sizing (Mengatasi Kebutaan 1/Beta) & Kalibrasi ATR/Vol Stop',
      scenarioType: 'CORRUPTED_OR_STRESS_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'Beta 0.45 dengan Vol 42% dipangkas dari 18% ke <=10%; Stop Loss 12%-18%',
      actualSummary: `FinalCap: ${riskResult.finalMaxAllocationPct}% (vs 1/β ${riskResult.inverseBetaCapPct}%) | Stop: -${riskResult.stopLossPct}% (Rp ${riskResult.stopLossPriceIDR})`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 9 (P2.3): Epistemic Uncertainty Penalty (Model Dispersion > 0.40 -> Potong 10-15 Poin & Batasi Tranche 1)
  // ==========================================================================
  {
    // Metode 1: Rp 2.000, Metode 2: Rp 3.000 (median), Metode 3: Rp 3.600 -> Dispersi = (3600 - 2000)/3000 = 0.5333 (> 0.40)
    const dispersionRes = applyDispersionPenalty({
      valuationOutputsIDR: [2000, 3000, 3600],
      rawConvictionScore: 85,
      isOutlierEnsembleActive: true
    });

    const assertions = [
      {
        label: 'Dispersi model 53.3% (> 40%) mengaktifkan Epistemic Uncertainty Penalty sebesar 10–15 poin',
        passed:
          dispersionRes.isDispersionPenalized === true &&
          dispersionRes.dispersionPenaltyPts >= 10 &&
          dispersionRes.dispersionPenaltyPts <= 15 &&
          dispersionRes.adjustedConvictionScore === 85 - dispersionRes.dispersionPenaltyPts,
        expected: 'Penalti 10–15 poin (Skor 85 -> 70..75)',
        actual: `Penalti -${dispersionRes.dispersionPenaltyPts} poin (Skor 85 -> ${dispersionRes.adjustedConvictionScore})`
      },
      {
        label: 'Ukuran posisi awal (Tranche 1) dibatasi ke 35% (tranche1ScalingFactor = 0.35)',
        passed: dispersionRes.tranche1ScalingFactor === 0.35,
        expected: 'tranche1ScalingFactor = 0.35',
        actual: `tranche1ScalingFactor = ${dispersionRes.tranche1ScalingFactor}`
      }
    ];

    results.push({
      id: 'P2.3_EPISTEMIC_DISPERSION_PENALTY',
      priority: 'P2',
      title: 'P2.3 Epistemic Uncertainty Penalty (Dispersi Model > 40% -> Potong 10–15 Poin & Batasi Tranche 1)',
      scenarioType: 'CORRUPTED_OR_STRESS_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'Dispersi 53.3% memotong skor keyakinan 12 poin dan membatasi Tranche 1 ke 35%',
      actualSummary: `Dispersi: ${(dispersionRes.modelDispersion * 100).toFixed(1)}% | Penalti: -${dispersionRes.dispersionPenaltyPts} pts | Skor Akhir: ${dispersionRes.adjustedConvictionScore}/100`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 10 (HOTFIX 1): IDX YTD-to-TTM Decumulator, Balance Sheet Snapshot Guard & Double-Counting Trap
  // ==========================================================================
  {
    const sampleYtdRows: QuarterlyRawRow[] = [
      {
        fiscalYear: 2025,
        quarter: 4,
        reportType: 'YTD',
        revenue: 100_000_000_000_000, // FY25 12M = 100T (Q1=24T, Q2=25T, Q3=25T, Q4=26T)
        operatingProfit: 40_000_000_000_000,
        netIncome: 30_000_000_000_000,
        ebitda: 44_000_000_000_000,
        ocf: 33_000_000_000_000,
        capex: 4_000_000_000_000,
        equityAttributable: 200_000_000_000_000,
        totalAssets: 800_000_000_000_000,
        cash: 60_000_000_000_000,
        totalDebt: 50_000_000_000_000,
        sharesOutstanding: 100_000_000_000
      },
      {
        fiscalYear: 2025,
        quarter: 3,
        reportType: 'YTD',
        revenue: 74_000_000_000_000, // 9M25 = 74T -> Q4_2025 standalone = 100T - 74T = 26T
        operatingProfit: 29_500_000_000_000,
        netIncome: 22_000_000_000_000,
        ebitda: 32_500_000_000_000,
        ocf: 24_000_000_000_000,
        capex: 3_000_000_000_000,
        equityAttributable: 192_000_000_000_000,
        totalAssets: 780_000_000_000_000,
        cash: 58_000_000_000_000,
        totalDebt: 50_000_000_000_000,
        sharesOutstanding: 100_000_000_000
      },
      {
        fiscalYear: 2026,
        quarter: 1,
        reportType: 'YTD',
        revenue: 27_000_000_000_000, // 3M26 = 27T -> Q1_2026 standalone = 27T
        operatingProfit: 11_000_000_000_000,
        netIncome: 8_500_000_000_000,
        ebitda: 12_000_000_000_000,
        ocf: 9_000_000_000_000,
        capex: 1_100_000_000_000,
        equityAttributable: 208_000_000_000_000,
        totalAssets: 820_000_000_000_000,
        cash: 62_000_000_000_000,
        totalDebt: 48_000_000_000_000,
        sharesOutstanding: 100_000_000_000
      },
      {
        fiscalYear: 2026,
        quarter: 2,
        reportType: 'YTD',
        revenue: 55_000_000_000_000, // 6M26 = 55T -> Q2_2026 standalone = 55T - 27T = 28T
        operatingProfit: 22_500_000_000_000,
        netIncome: 17_200_000_000_000,
        ebitda: 24_500_000_000_000,
        ocf: 18_500_000_000_000,
        capex: 2_200_000_000_000,
        equityAttributable: 215_000_000_000_000,
        totalAssets: 840_000_000_000_000,
        cash: 65_000_000_000_000,
        totalDebt: 47_000_000_000_000,
        sharesOutstanding: 100_000_000_000
      },
      {
        fiscalYear: 2026,
        quarter: 3,
        reportType: 'YTD',
        revenue: 84_000_000_000_000, // 9M26 = 84T -> Q3_2026 standalone = 84T - 55T = 29T
        operatingProfit: 34_500_000_000_000,
        netIncome: 26_200_000_000_000,
        ebitda: 37_500_000_000_000,
        ocf: 28_000_000_000_000,
        capex: 3_300_000_000_000,
        equityAttributable: 224_000_000_000_000, // Latest snapshot = 224T
        totalAssets: 860_000_000_000_000,
        cash: 68_000_000_000_000,
        totalDebt: 45_000_000_000_000,
        sharesOutstanding: 100_000_000_000
      }
    ];

    const standalone = decumulateIDXQuarters(sampleYtdRows);
    const ttmAndSnap = computeIdxTtmAndSnapshotFromQuarters(sampleYtdRows);

    // Double-Counting Trap & Balance Sheet Anomaly Test
    const ytdBugRaw: RawTickerData = {
      ...createBaseCleanRawTickerData(),
      ticker: 'YTDBUG',
      revenueTTM: 215_000_000_000_000, // 2.15x of FY revenue (100T) -> > 1.65x threshold
      latestFullYearRevenue: 100_000_000_000_000,
      hasAcquisitionOrCorpAction: false,
      equityAttributable: 400_000_000_000_000,
      totalAssets: 350_000_000_000_000, // Equity > Total Assets anomaly!
      bvps: 3239.88,
      priorYearBvps: 1800, // +80% jump without rights issue
      hasRightsIssue: false
    };
    const ytdBugSanity = validateFundamentalSanity(ytdBugRaw);

    // Expected TTM Revenue = Q4_25 (26T) + Q1_26 (27T) + Q2_26 (28T) + Q3_26 (29T) = 110T (NOT raw sum 266T!)
    const ttmRevActual = ttmAndSnap?.revenueTTM ?? 0;
    const snapEqActual = ttmAndSnap?.equityAttributable ?? 0;
    const snapAssetsActual = ttmAndSnap?.totalAssets ?? 0;

    const assertions = [
      {
        label: 'decumulateIDXQuarters mengubah YTD (Q1=27T, Q2=55T, Q3=84T) menjadi Standalone (27T, 28T, 29T) & TTM = 110T',
        passed:
          standalone.length === 5 &&
          ttmRevActual === 110_000_000_000_000,
        expected: 'TTM Revenue = Rp 110 Triliun (bukan penjumlahan mentah YTD Rp 266T)',
        actual: `TTM Revenue = Rp ${(ttmRevActual / 1e12).toFixed(1)} Triliun`
      },
      {
        label: 'Snapshot Neraca (Equity = Rp 224T, Assets = Rp 860T) diambil murni dari 1 kuartal terbaru tanpa dijumlahkan',
        passed:
          snapEqActual === 224_000_000_000_000 &&
          snapAssetsActual === 860_000_000_000_000,
        expected: 'Equity = Rp 224T & Assets = Rp 860T (Latest Snapshot Q3 2026)',
        actual: `Equity = Rp ${(snapEqActual / 1e12).toFixed(0)}T & Assets = Rp ${(snapAssetsActual / 1e12).toFixed(0)}T`
      },
      {
        label: 'Double-Counting Trap (RevTTM/FY > 1.65) & Balance Sheet Guard melempar YTD_CUMULATIVE_SUM_SUSPECT & BALANCE_SHEET_ANOMALY (FAIL)',
        passed:
          ytdBugSanity.status === 'FAIL' &&
          ytdBugSanity.isGradeABlocked === true &&
          ytdBugSanity.flags.includes('YTD_CUMULATIVE_SUM_SUSPECT') &&
          ytdBugSanity.flags.includes('BALANCE_SHEET_ANOMALY'),
        expected: 'FAIL [YTD_CUMULATIVE_SUM_SUSPECT, BALANCE_SHEET_ANOMALY]',
        actual: `${ytdBugSanity.status} [${ytdBugSanity.flags.join(', ')}]`
      }
    ];

    results.push({
      id: 'HOTFIX_1_IDX_YTD_DECUMULATOR_AND_BS_GUARD',
      priority: 'P0',
      title: 'Hotfix 1: IDX YTD-to-TTM Decumulator, Balance Sheet Snapshot Guard & Double-Counting Trap',
      scenarioType: 'CORRUPTED_OR_STRESS_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'YTD didekumulasi presisi ke Standalone TTM 110T; lonjakan YTD >1.65x & anomali neraca diblokir (FAIL)',
      actualSummary: `TTM Rev: Rp ${(ttmRevActual / 1e12).toFixed(0)}T | Snapshot Eq: Rp ${(snapEqActual / 1e12).toFixed(0)}T | Flags: ${ytdBugSanity.flags.join(', ')}`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 11 (HOTFIX 2, 3, 4): Single Source of Truth ValuationLedger, Post-Penalty Grade & Unified ATR/Vol Stop
  // ==========================================================================
  {
    const ensembleWeights = DynamicEnsembleWeighter.computeWeights({
      sector: 'Industrials',
      route: 'STEADY_COMPOUNDER',
      effectiveModule: 'Compounder',
      sectorLabel: 'Quality P/E',
      sectorPriceIdr: 6200,
      rimLabel: 'Multi-Stage RIM (6Y)',
      rimPriceIdr: 5900,
      relValLabel: 'Hist EV/EBITDA Band 5Y',
      relValPriceIdr: 5750,
      ocfToNetIncomeRatio: 1.05,
      peerCorrelation: 0.86,
      hscDiscountMultiplier: 1.0,
      tickRounder: (v) => Math.round(v / 25) * 25
    });

    const ledger = buildValuationLedger({
      ticker: 'ASII',
      components: ensembleWeights.components,
      ensembleFairValue: ensembleWeights.intrinsicValueIdr,
      standaloneFloor: 4950,
      formulaAudit: ensembleWeights.ensembleFormulaAudit,
      epsTTM: 580,
      bvps: 3100,
      roeTTM: 18.7,
      netIncomeYoYPct: 19.4,
      operatingProfitYoYPct: 14.8,
      isDualCatalystConfirmed: true
    });

    // Hotfix 3 & 4: Score 77 after penalty MUST map to 'A (SOLID VALUE)' (never overridden to 'A+')
    const disp77 = applyDispersionPenalty({
      valuationOutputsIDR: [5750, 5900, 6200],
      rawConvictionScore: 77,
      isOutlierEnsembleActive: false
    });
    const cleanSanity = validateFundamentalSanity(createBaseCleanRawTickerData());
    const risk77 = calculateVolatilityTargetedSizingAndStop({
      price: 5000,
      beta1Y: 0.85,
      realizedAnnualVol: 0.24,
      atr20: 130,
      marketRegime: 'TENANG',
      rawConvictionScore: 77,
      dispersionPenalty: disp77,
      sanityReport: cleanSanity
    });

    const assertions = [
      {
        label: 'ValuationLedger memiliki 3 komponen murni dengan totalWeight === 1.0 dan kaki ke-3 HIST_EVEBITDA_BAND',
        passed:
          ledger.components.length === 3 &&
          Math.abs(ledger.totalWeight - 1.0) < 0.0001 &&
          ledger.components[2].id === 'HIST_EVEBITDA_BAND' &&
          ledger.components[2].value === 5750,
        expected: '3 komponen, totalWeight = 1.0, leg[2] = HIST_EVEBITDA_BAND (Rp 5.750)',
        actual: `${ledger.components.length} komponen, totalWeight = ${ledger.totalWeight}, leg[2] = ${ledger.components[2].id} (Rp ${ledger.components[2].value})`
      },
      {
        label: 'Hotfix 3: Skor konviksi 77/100 (< 82) dipetakan murni ke A (SOLID VALUE) tanpa override ke A+',
        passed:
          risk77.adjustedConvictionScore === 77 &&
          risk77.finalConvictionGrade === 'A (SOLID VALUE)',
        expected: 'A (SOLID VALUE)',
        actual: `${risk77.finalConvictionGrade} (Skor ${risk77.adjustedConvictionScore}/100)`
      },
      {
        label: 'Hotfix 4: Satu rumus Stop Loss ATR/Vol menghasilkan stopLossPriceIDR konsisten dalam pita 12%–18%',
        passed:
          risk77.stopLossPct >= 12.0 &&
          risk77.stopLossPct <= 18.0 &&
          risk77.stopLossPriceIDR === Math.round((5000 * (1 - risk77.stopLossPct / 100)) / 5) * 5,
        expected: 'StopLoss dalam 12%–18% & sinkron dengan stopLossPriceIDR',
        actual: `Stop Rp ${risk77.stopLossPriceIDR.toLocaleString('id-ID')} (-${risk77.stopLossPct}%)`
      }
    ];

    results.push({
      id: 'HOTFIX_2_3_4_LEDGER_GRADE_AND_UNIFIED_STOP',
      priority: 'P1',
      title: 'Hotfix 2–4: Single Source ValuationLedger (∑w=1.0), Strict Grade Mapping (<82 ≠ A+), & Unified ATR/Vol Stop',
      scenarioType: 'CLEAN_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'ValuationLedger ∑w=1.0, Skor 77 -> A (SOLID VALUE), dan ATR/Vol Stop tersinkronisasi',
      actualSummary: `Ledger: ${ledger.formulaAudit} | Grade(77): ${risk77.finalConvictionGrade} | Stop: Rp ${risk77.stopLossPriceIDR}`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 12 (P1.4): 2-Tier Auto-Adapt Router, 5% Outlier Slashing, Strict StatArb & runFinancialAudit()
  // ==========================================================================
  {
    const simRows = runThreeProfileAutoAdaptSimulation();
    const aviaSim = simRows.find((r) => r.ticker === 'AVIA')!;
    const arnaSim = simRows.find((r) => r.ticker === 'ARNA')!;
    const antmSim = simRows.find((r) => r.ticker === 'ANTM')!;
    const bbcaSim = simRows.find((r) => r.ticker === 'BBCA')!;

    // Test 5% Outlier Slashing & 95% Proportional Redistribution on >40% model divergence
    const outlierEnsemble = DynamicEnsembleWeighter.computeWeights({
      sector: 'Basic Materials',
      route: 'STEADY_COMPOUNDER',
      effectiveModule: 'Compounder',
      sectorLabel: 'Quality P/E & Justified PBV',
      sectorPriceIdr: 620,
      rimLabel: 'Multi-Stage RIM (7Y)',
      rimPriceIdr: 600,
      relValLabel: 'Hist EV/EBITDA Band 5Y',
      relValPriceIdr: 290, // >40% deviation from median Rp 600 -> must be slashed to 5% (0.05)
      ocfToNetIncomeRatio: 1.12,
      peerCorrelation: 0.85,
      hscDiscountMultiplier: 1.0,
      tickRounder: (v) => Math.round(v)
    });
    const slashedOutlierLeg = outlierEnsemble.components[2];
    const remainingWeightSum =
      outlierEnsemble.components[0].weight + outlierEnsemble.components[1].weight;

    // Test runFinancialAudit() Quality-Valuation Contradiction Auto-Reroute
    const contradictionAudit = runFinancialAudit({
      ticker: 'AVIA',
      sector: 'Basic Materials',
      price: 480,
      intrinsicValueIdr: 230, // artificially crushed -52.1% (>30% overvalued) while still on Pure_Cyclical
      epsTTM: 30.9,
      bvps: 160.1,
      ocfTTMIdr: 2_145_000_000_000,
      roeTTMPct: 19.3,
      debtToEquity: 0.04,
      ocfToNetIncomeRatio: 1.12,
      netPayoutYieldPct: 5.4,
      dividendYieldPct: 4.8,
      buybackYieldPct: 0.6,
      earningsYieldPct: 6.44,
      earningsGrowthYoYPct: 9.5,
      currentRoute: 'PURE_CYCLICAL',
      reportedFairPer: 7.44,
      reportedFairPbv: 1.44
    });

    const assertions = [
      {
        label: 'Tier-2 Quantitative DNA Override: AVIA & ARNA (GP/A>20%, DER<0.5x, ROE>15%, OCF/NI>=0.8x) otomatis di-override ke STEADY_COMPOUNDER (Quality Compounder) dengan Justified PBV >= 2.0x',
        passed:
          aviaSim.effectiveRoute === 'STEADY_COMPOUNDER' &&
          aviaSim.appliedModule === 'Compounder' &&
          aviaSim.isQualityCompounderOverride === true &&
          aviaSim.justifiedPbv >= 2.0 &&
          arnaSim.effectiveRoute === 'STEADY_COMPOUNDER' &&
          arnaSim.isQualityCompounderOverride === true &&
          arnaSim.justifiedPbv >= 2.0,
        expected: 'AVIA & ARNA -> STEADY_COMPOUNDER (Override=true) & Justified PBV >= 2.0x (bukan ~1.21x)',
        actual: `AVIA: ${aviaSim.effectiveRoute} (PBV ${aviaSim.justifiedPbv}x, Weights ${aviaSim.ensembleWeightsLabel}) | ARNA: ${arnaSim.effectiveRoute} (PBV ${arnaSim.justifiedPbv}x)`
      },
      {
        label: 'Auto-Adapt Separation: ANTM tetap di PURE_CYCLICAL (peer INCO, Override=false) & BBCA di FINANCIALS Justified PBV (peer BMRI, Justified PBV >= 2.1x)',
        passed:
          antmSim.effectiveRoute === 'PURE_CYCLICAL' &&
          antmSim.isQualityCompounderOverride === false &&
          antmSim.statArbPeerTicker === 'INCO' &&
          bbcaSim.effectiveRoute === 'STEADY_COMPOUNDER' &&
          bbcaSim.statArbPeerTicker === 'BMRI' &&
          bbcaSim.justifiedPbv >= 2.1,
        expected: 'ANTM=PURE_CYCLICAL (peer INCO) & BBCA=STEADY_COMPOUNDER Financials (peer BMRI, PBV>=2.1x)',
        actual: `ANTM: ${antmSim.effectiveRoute} (peer ${antmSim.statArbPeerTicker}, w=${antmSim.ensembleWeightsLabel}) | BBCA: ${bbcaSim.effectiveRoute} (peer ${bbcaSim.statArbPeerTicker}, PBV ${bbcaSim.justifiedPbv}x)`
      },
      {
        label: 'Strict StatArb Filter: AVIA tidak dipasangkan dengan tambang/semen Basic Materials -> Status "N/A - Tidak ada peer fundamental yang berkorelasi"',
        passed:
          aviaSim.statArbPeerTicker === 'N/A' &&
          aviaSim.statArbValid === false &&
          aviaSim.statArbStatusLabel === 'N/A - Tidak ada peer fundamental yang berkorelasi',
        expected: 'peer="N/A", valid=false, label="N/A - Tidak ada peer fundamental yang berkorelasi"',
        actual: `peer="${aviaSim.statArbPeerTicker}", valid=${aviaSim.statArbValid}, label="${aviaSim.statArbStatusLabel}"`
      },
      {
        label: 'Outlier Down-Weighting (>40% deviasi dari median): Bobot model outlier dipangkas ke 5% (0.05) & sisa 95% diredistribusi proporsional',
        passed:
          Boolean(outlierEnsemble.outlierPenalizedLeg) &&
          Math.abs(slashedOutlierLeg.weight - 0.05) < 0.001 &&
          Math.abs(remainingWeightSum - 0.95) < 0.001,
        expected: 'Outlier weight = 5% (0.05) & Sisa 2 model konsisten = 95% (0.95)',
        actual: `Outlier weight = ${(slashedOutlierLeg.weight * 100).toFixed(1)}% & Sisa = ${(remainingWeightSum * 100).toFixed(1)}%`
      },
      {
        label: 'runFinancialAudit() Pre-Render Guardrail: Mendeteksi Quality-Valuation Contradiction & memicu AUTO_REROUTED_TO_QUALITY_COMPOUNDER',
        passed:
          contradictionAudit.isQualityValuationContradiction === true &&
          contradictionAudit.isAutoReroutedToCompounder === true &&
          contradictionAudit.flags.includes('AUTO_REROUTED_TO_QUALITY_COMPOUNDER') &&
          contradictionAudit.isYieldConsistentNoDoubleCount === true,
        expected: 'isContradiction=true, isAutoRerouted=true, TSY Clean=true',
        actual: `status=${contradictionAudit.auditStatus}, autoReroute=${contradictionAudit.isAutoReroutedToCompounder}, flags=[${contradictionAudit.flags.join(', ')}]`
      }
    ];

    results.push({
      id: 'P1.4_AUTO_ADAPT_2TIER_ROUTER_AND_FINANCIAL_AUDIT',
      priority: 'P1',
      title: 'P1.4 2-Tier Adaptive Router (Quality Override), 5% Outlier Slashing, Strict StatArb & runFinancialAudit()',
      scenarioType: 'CLEAN_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'AVIA/ARNA auto-override ke Quality Compounder, Outlier dipangkas ke 5%, StatArb lintas bisnis diblokir, & runFinancialAudit aktif',
      actualSummary: `AVIA: ${aviaSim.effectiveRoute} (PBV ${aviaSim.justifiedPbv}x, StatArb ${aviaSim.statArbPeerTicker}) | ANTM: ${antmSim.effectiveRoute} | BBCA: ${bbcaSim.effectiveRoute} (PBV ${bbcaSim.justifiedPbv}x)`,
      assertions
    });
  }

  // ==========================================================================
  // TEST 13 (P1.5): 5-Point Mathematical & UX Synchronization Audit
  // (1. PBV Z-Score & Dynamic Window Label, 2. Upside/Downside vs MoS,
  //  3. Standby Allocation 0% vs Proyeksi Plafon & Tranche Sync,
  //  4. Single Source of Truth Conviction Score, 5. Post-Override Graham-Joeliardi Floor)
  // ==========================================================================
  {
    const universe = buildIdx100StockUniverse(40);
    const antmBase = universe.find((s) => s.ticker === 'ANTM') ?? universe[0];

    // 1. Test Pure Cyclical issuer-specific PBV Z-Score (Current PBV < Historical Mean -> strictly negative Z)
    // and dynamic window label (3Y when only epsAvg3YIdr is provided)
    const antmBelowMeanStock: StockMetrics = {
      ...antmBase,
      ticker: 'ANTM',
      name: 'Aneka Tambang Tbk',
      sector: 'Basic Materials',
      lastPrice: 1200, // With BVPS ~1240 -> Current PBV ~0.97x (< ANTM 10Y Mean 1.48x -> Z MUST be negative!)
      sharesOutstanding: 24_030_764_725,
      equityAttributableIdr: 29_800_000_000_000,
      netIncomeTTMIdr: 2_800_000_000_000,
      roe: 9.4,
      debtToEquity: 0.16,
      grossProfitabilityToAssets: 13.5,
      ocfToNetIncomeRatio: 1.1,
      historicalEps7YAvgIdr: undefined,
      epsAvg5YIdr: undefined,
      epsAvg3YIdr: 125 // Only 3Y historical EPS provided -> label must adapt to "Normalized 3Y EPS"
    };
    const antmEval = evaluateJoeliardiOosFundamental(antmBelowMeanStock, DEFAULT_GLOBAL_MACRO);

    // 2. Test Upside/Downside vs Margin of Safety mathematical separation
    // Overvalued / Hold stock where FairValue < MarketPrice
    const holdStock: StockMetrics = {
      ...antmBase,
      ticker: 'AVIA',
      name: 'Avia Avian Tbk',
      sector: 'Basic Materials',
      lastPrice: 780, // High market price so recommendation becomes WATCHLIST/HOLD
      sharesOutstanding: 61_953_000_000,
      equityAttributableIdr: 9_920_000_000_000,
      netIncomeTTMIdr: 1_915_000_000_000,
      revenueTTMIdr: 7_450_000_000_000,
      operatingProfitTTMIdr: 2_210_000_000_000,
      ebitdaTTMIdr: 2_480_000_000_000,
      totalAssetsIdr: 11_200_000_000_000,
      totalDebtIdr: 396_000_000_000,
      ocfTTMIdr: 2_145_000_000_000,
      roe: 19.3,
      debtToEquity: 0.04,
      grossProfitabilityToAssets: 28.5,
      ocfToNetIncomeRatio: 1.12,
      dividendYieldPct: 4.8,
      forwardDividendYieldPct: 4.8,
      beta1Y: 0.72,
      volatilityAnn: 19.5,
      fundamentalsSource: 'LIVE_YAHOO_API',
      priceSource: 'LIVE_YAHOO_API'
    };
    const holdEval = evaluateJoeliardiOosFundamental(holdStock, DEFAULT_GLOBAL_MACRO);
    const expectedUpsidePct = Number(
      (
        ((holdEval.intrinsicValueIdr - holdStock.lastPrice) /
          Math.max(1, holdStock.lastPrice)) *
        100
      ).toFixed(1)
    );
    const expectedMosPct = Number(
      (
        ((holdEval.intrinsicValueIdr - holdStock.lastPrice) /
          Math.max(1, holdEval.intrinsicValueIdr)) *
        100
      ).toFixed(1)
    );

    // 5. Compare Post-Override Graham-Joeliardi Floor (Quality Compounder) vs Cyclical Penalty Floor
    const floorCompounder = calculateInvariantGrahamJoeliardiFloor({
      epsTTM: 30.9,
      epsAvg3Y: 28.5,
      epsAvg5Y: 27.5,
      growthRate: 0.02, // Even if raw cyclical growth passed was 2.0%, post-override compounder boosts sustainable g
      spotRf10Y: 0.0675,
      roeTTM: 0.193,
      roeAvg3Y: 0.14, // Below 15% 3Y avg, which on cyclical would trigger -25% weak moat penalty
      roeAvg5Y: 0.14,
      debtToEquity: 0.04,
      ensembleFairValue: 900,
      effectiveModule: 'Compounder',
      isQualityCompounderOverride: true,
      tickRounder: (v) => Math.round(v)
    });
    const floorCyclicalPenalized = calculateInvariantGrahamJoeliardiFloor({
      epsTTM: 30.9,
      epsAvg3Y: 28.5,
      epsAvg5Y: 27.5,
      growthRate: 0.02,
      spotRf10Y: 0.0675,
      roeTTM: 0.193,
      roeAvg3Y: 0.14,
      roeAvg5Y: 0.14,
      debtToEquity: 0.04,
      ensembleFairValue: 900,
      effectiveModule: 'Pure_Cyclical',
      isQualityCompounderOverride: false,
      tickRounder: (v) => Math.round(v)
    });

    const antmPbvZScore = antmEval.pbvZScore ?? 0;

    const assertions = [
      {
        label: '1. PBV Z-Score menggunakan mean/stdDev historis emiten sendiri (PBV di bawah rata-rata wajib bertanda negatif) & label window Normalized EPS dinamis (3Y)',
        passed:
          antmPbvZScore < 0 &&
          antmEval.historicalNormalizedYears === 3 &&
          Boolean(antmEval.valuationModuleLabel?.includes('Normalized 3Y EPS')),
        expected: 'PBV Z-Score < 0 (saat PBV < Mean 10Y) & Label "Normalized 3Y EPS"',
        actual: `Z=${antmPbvZScore}σ | Years=${antmEval.historicalNormalizedYears}Y | Label="${antmEval.valuationModuleLabel}"`
      },
      {
        label: '2. Pemisahan tegas Upside/Downside = ((FV - Price)/Price)*100 vs Margin of Safety = ((FV - Price)/FV)*100',
        passed:
          holdEval.upsideDownsidePct === expectedUpsidePct &&
          holdEval.marginOfSafetyPct === expectedMosPct &&
          holdEval.upsideDownsidePct !== holdEval.marginOfSafetyPct &&
          holdEval.decision?.upsideDownsidePct === expectedUpsidePct,
        expected: `Upside/Downside = ${expectedUpsidePct}% vs MoS = ${expectedMosPct}%`,
        actual: `Upside/Downside = ${holdEval.upsideDownsidePct}% vs MoS = ${holdEval.marginOfSafetyPct}%`
      },
      {
        label: '3. Saat rekomendasi WATCHLIST/HOLD atau AVOID, Active Allocation = 0% (Standby), Plafon Barbell = Proyeksi Plafon, & Tranche Share % sinkron',
        passed:
          holdEval.isStandbyAllocation === true &&
          holdEval.activeAllocationPct === 0 &&
          (holdEval.projectedBarbellCapPct ?? 0) > 0 &&
          (holdEval.tranche1SharePct ?? 0) + (holdEval.tranche2SharePct ?? 0) === 100 &&
          Boolean(
            holdEval.decision?.narrativeExecutionSentence?.includes('Active Allocation: 0% (Standby)') ||
              holdEval.keyStrengths.some((s) => s.includes('Active Allocation: 0% (Standby)'))
          ) &&
          Boolean(
            holdEval.decision?.narrativeExecutionSentence?.includes('Proyeksi Plafon Jika Trigger Terpenuhi') ||
              holdEval.keyStrengths.some((s) => s.includes('Proyeksi Plafon Jika Trigger Terpenuhi'))
          ),
        expected: 'isStandby=true, Active=0%, Proyeksi Plafon > 0%, T1%+T2%=100%',
        actual: `isStandby=${holdEval.isStandbyAllocation}, Active=${holdEval.activeAllocationPct}%, Plafon=${holdEval.projectedBarbellCapPct}%, Split=${holdEval.tranche1SharePct}%/${holdEval.tranche2SharePct}%`
      },
      {
        label: '4. Single Source of Truth Conviction Score: joeliardiEval.finalConvictionScore === decision.finalConvictionScore === riskSizingResult.adjustedConvictionScore',
        passed:
          typeof holdEval.finalConvictionScore === 'number' &&
          holdEval.finalConvictionScore === holdEval.decision?.finalConvictionScore &&
          holdEval.finalConvictionScore === holdEval.riskSizingResult?.adjustedConvictionScore,
        expected: 'Satu variabel skor final identik di seluruh objek evaluasi & keputusan',
        actual: `eval=${holdEval.finalConvictionScore} | decision=${holdEval.decision?.finalConvictionScore} | risk=${holdEval.riskSizingResult?.adjustedConvictionScore}`
      },
      {
        label: '5. Graham-Joeliardi Moat Floor memakai archetype post-override (Quality Compounder bebas penalti cap siklikal & bebas weak-moat haircut)',
        passed:
          floorCompounder.isMoatHaircutApplied === false &&
          floorCyclicalPenalized.isMoatHaircutApplied === true &&
          floorCompounder.standaloneFloor > floorCyclicalPenalized.standaloneFloor,
        expected: 'Compounder Floor > Cyclical Penalized Floor (Haircut false vs true)',
        actual: `Compounder Floor: Rp ${floorCompounder.standaloneFloor} (haircut=${floorCompounder.isMoatHaircutApplied}) vs Cyclical: Rp ${floorCyclicalPenalized.standaloneFloor} (haircut=${floorCyclicalPenalized.isMoatHaircutApplied})`
      }
    ];

    results.push({
      id: 'P1.5_FIVE_POINT_MATH_AND_UX_SYNCHRONIZATION',
      priority: 'P1',
      title: 'P1.5 Audit 5 Celah Matematis & UX (PBV Z-Score, Upside vs MoS, Standby 0%, Single Conviction Score & G-J Floor Sync)',
      scenarioType: 'CLEAN_DATA',
      passed: assertions.every((a) => a.passed),
      expectedSummary: 'Seluruh 5 celah matematis & UX (Z-Score, Upside vs MoS, Standby 0%, Skor Tunggal, G-J Floor Override) lolos 100%',
      actualSummary: `Z=${antmPbvZScore}σ (${antmEval.historicalNormalizedYears}Y) | Upside=${holdEval.upsideDownsidePct}% vs MoS=${holdEval.marginOfSafetyPct}% | Active=${holdEval.activeAllocationPct}% | Score=${holdEval.finalConvictionScore}/100 | G-J Floor=Rp ${floorCompounder.standaloneFloor}`,
      assertions
    });
  }

  return results;
}


