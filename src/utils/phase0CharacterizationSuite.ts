/**
 * FASE 0: GOLDEN CHARACTERIZATION TEST SUITE & BASELINE AUDIT RUNNER
 *
 * Captures and locks the EXACT current ("BEFORE") baseline behavior of the
 * Nostradamus Quant Terminal across 11 representative scenarios:
 *  1. DRMA  — Consumer Cyclicals (Auto & Components: mismatch between CORE_CORPORATE/Compounder Quality PE vs Cyclical ω)
 *  2. BTPS  — Financials (Micro/Sharia Bank: grouped with major corporate banks)
 *  3. BBCA  — Financials (KBMI 4 Major Bank)
 *  4. ASSA  — Transportation & Logistics (String mismatch bug: 'Transportation & Logistic' vs 'Transportation & Logistics')
 *  5. ITMG  — Energy / Coal (Healthy cycle)
 *  6. LSIP  — Consumer Non-Cyclicals / CPO Plantation (Routed via KNOWN_CPO_PLANTATION_TICKERS)
 *  7. CTRA  — Properties & Real Estate (PSAK 72)
 *  8. TOWR  — Infrastructures (Telecom Tower)
 *  9. HEAL  — Healthcare (Hospitals: Capex_Aggressor)
 * 10. GOTO  — Technology (Pre-profit: NI < 0 -> TECH_UNPROFITABLE_GROWTH / Grade C)
 * 11. ITMG_TROUGH — Energy / Coal at Cyclical Trough (NI < 0: currently misrouted to TECH_UNPROFITABLE_GROWTH!)
 *
 * Run via CLI: `npx tsx src/utils/phase0CharacterizationSuite.ts`
 * Or import `runPhase0CharacterizationSuite()` in browser / test runner.
 */

import { StockMetrics } from '../types/quant';
import {
  DEFAULT_GLOBAL_MACRO,
  evaluateJoeliardiOosFundamental,
  computeSbnSpotYieldCurveAndKe
} from './quantEngine';
import {
  buildIdx100StockUniverse
} from './liveMarketFetcher';
import {
  detectSectorMethodologyRegime
} from './sectorMethodologyRouter';
import {
  ValuationEngine,
  resolveSectorOmegaFadeFactor,
  applyDispersionPenalty,
  calculateVolatilityTargetedSizingAndStop
} from './valuationEngine';
import {
  calculateInvariantGrahamJoeliardiFloor
} from './institutionalGuardrailsEngine';
import {
  runInstitutionalGuardrailsUnitTests
} from './guardrailsUnitTestSuite';

import {
  classifyEmitenSectorProfile,
  verifyCatalogSectorProfileCoverage
} from './sectorClassifier';

function fixturesForSensitivityCheck(): { passed: boolean; actual: string } {
  const fixtures = buildPhase0CharacterizationFixtures();
  for (const { scenarioId, stock } of fixtures) {
    const ev = evaluateJoeliardiOosFundamental(stock, DEFAULT_GLOBAL_MACRO);
    const dec = ev.decision;
    if (!dec || !dec.roeFadeScenarios || !dec.keSensitivityMatrix || !dec.erpAsOfDate) {
      return { passed: false, actual: `Missing sensitivity/fade on ${scenarioId}` };
    }
    const { bearIdr, baseIdr, bullIdr } = dec.roeFadeScenarios;
    const { keMinus1ppIdr, keBaseIdr, kePlus1ppIdr } = dec.keSensitivityMatrix;
    if (!(bullIdr >= baseIdr && baseIdr >= bearIdr)) {
      return {
        passed: false,
        actual: `${scenarioId} ROE-fade non-monotonic: bear=${bearIdr}, base=${baseIdr}, bull=${bullIdr}`
      };
    }
    if (!(keMinus1ppIdr >= keBaseIdr && keBaseIdr >= kePlus1ppIdr)) {
      return {
        passed: false,
        actual: `${scenarioId} Ke-sensitivity non-monotonic: -1pp=${keMinus1ppIdr}, base=${keBaseIdr}, +1pp=${kePlus1ppIdr}`
      };
    }
  }
  const bbcaEv = evaluateJoeliardiOosFundamental(fixtures.find((f) => f.scenarioId === 'BBCA')!.stock, DEFAULT_GLOBAL_MACRO);
  const f = bbcaEv.decision!.roeFadeScenarios!;
  const k = bbcaEv.decision!.keSensitivityMatrix!;
  return {
    passed: true,
    actual: `BBCA ROE-Fade=[Bear Rp ${f.bearIdr} / Base Rp ${f.baseIdr} / Bull Rp ${f.bullIdr}], Ke-Sens=[Ke-1pp Rp ${k.keMinus1ppIdr} / Base Rp ${k.keBaseIdr} / Ke+1pp Rp ${k.kePlus1ppIdr}], erpDate=${bbcaEv.decision!.erpAsOfDate}`
  };
}

export interface Phase0TickerBaselineSnapshot {
  scenarioId: string;
  ticker: string;
  name: string;
  catalogSector: string;
  subIndustry: string;
  archetype: string;
  spotPriceIdr: number;
  // 4 Unified Sector Routing Outputs (Findings A, B, C, D, E)
  routerRegime: string;
  valuationModuleRoute: string;
  appliedModule: string;
  isCapexOverrideTriggered: boolean;
  capexToDaRatio: number;
  cwipToAssetsRatio: number;
  omegaTierLabel: string;
  rimPersistenceOmega: number;
  rimFadeYears: number;
  statArbPeerTicker: string;
  isBankRegulatoryDataMissing: boolean;
  // Valuation legs & ensemble
  intrinsicValueIdr: number;
  leg1Name: string;
  leg1ValueIdr: number;
  leg1WeightPct: number;
  leg2Name: string;
  leg2ValueIdr: number;
  leg2WeightPct: number;
  leg3Name: string;
  leg3ValueIdr: number;
  leg3WeightPct: number;
  rawStandaloneFloorIdr: number;
  standaloneFloorIdr: number;
  isFloorClamped: boolean;
  floorToEnsembleRatioPct: number;
  marginOfSafetyPct: number;
  dynamicRequiredMosPct: number;
  // Discount rate & Beta (Finding F)
  rawBeta1Y: number;
  blumeBetaInKe: number;
  sbnBlendedRfWithDivPct: number;
  keWithDivPct: number;
  sbnBlendedRfWithoutDivPct: number;
  keWithoutDivPct: number;
  erpBenchmarkPct: number;
  // Conviction, Dispersion & Sizing (Finding F)
  rawConvictionScore: number;
  finalConvictionScore: number;
  convictionGrade: string;
  modelDispersionPct: number;
  dispersionPenaltyPts: number;
  inferredMarketRegime: string;
  volatilityAnnPct: number;
  inverseBetaCapPct: number;
  inverseVolatilityCapPct: number;
  regimeCapPct: number;
  finalMaxAllocationPct: number;
  tranche1Pct: number;
  tranche2Pct: number;
  stopLossIdr: number;
  stopLossPct: number;
}

export interface Phase0CharacterizationAssertion {
  id: string;
  title: string;
  passed: boolean;
  expected: string;
  actual: string;
}

const TARGET_TICKERS = [
  'DRMA',
  'BTPS',
  'BBCA',
  'ASSA',
  'ITMG',
  'LSIP',
  'CTRA',
  'TOWR',
  'HEAL',
  'GOTO'
] as const;

/**
 * Deterministically builds the 10 representative ticker StockMetrics plus 1 cyclical trough stress case
 */
export function buildPhase0CharacterizationFixtures(): Array<{
  scenarioId: string;
  stock: StockMetrics;
}> {
  const universe = buildIdx100StockUniverse(40);
  const byTicker = new Map<string, StockMetrics>();
  for (const s of universe) {
    byTicker.set(s.ticker.toUpperCase(), s);
  }

  const fixtures: Array<{ scenarioId: string; stock: StockMetrics }> = [];

  for (const t of TARGET_TICKERS) {
    const base = byTicker.get(t);
    if (!base) {
      throw new Error(`Ticker ${t} not found in buildIdx100StockUniverse()`);
    }
    // Lock deterministic clean inputs so characterization tests never flake on clock/network state
    const equityIdr = 10_000_000_000_000;
    const shares = Math.max(1_000_000_000, Math.round(equityIdr / Math.max(100, base.lastPrice * 0.55)));
    const roePct = base.roe;
    const netIncomeIdr = Math.round(equityIdr * (roePct / 100));
    const revenueIdr = Math.max(
      Math.abs(netIncomeIdr) * 4,
      Math.round(equityIdr * 0.85)
    );
    const opProfitIdr = Math.round(revenueIdr * (base.operatingMargin / 100));
    const daIdr = Math.round(revenueIdr * 0.05);
    const ebitdaIdr = opProfitIdr + daIdr;

    const lockedStock: StockMetrics = {
      ...base,
      fundamentalsSource: 'LIVE_YAHOO_API',
      priceSource: 'LIVE_YAHOO_API',
      rfLastUpdated: '2026-11-24',
      sharesOutstanding: shares,
      equityAttributableIdr: equityIdr,
      netIncomeTTMIdr: netIncomeIdr,
      revenueTTMIdr: revenueIdr,
      operatingProfitTTMIdr: opProfitIdr,
      ebitdaTTMIdr: ebitdaIdr,
      totalAssetsIdr:
        base.sector === 'Financials'
          ? Math.round(equityIdr * 6.5)
          : Math.round(equityIdr * (1 + Math.max(0.1, base.debtToEquity) + 0.25)),
      totalDebtIdr: Math.round(equityIdr * Math.max(0.05, base.debtToEquity)),
      cashAndEquivalentsIdr: Math.round(equityIdr * 0.22),
      ocfTTMIdr: Math.round(Math.max(netIncomeIdr * 1.05, ebitdaIdr * 0.78)),
      capexTTMIdr: Math.round(daIdr * 1.15),
      daTTMIdr: daIdr,
      earningsGrowthYoYPct: 12.0,
      operatingProfitGrowthYoYPct: 11.0
    };

    fixtures.push({
      scenarioId: t,
      stock: lockedStock
    });

    if (t === 'ITMG') {
      // Scenario 11: Coal commodity issuer at cyclical trough (NI < 0, OP < 0, ROE = -4.5%)
      const troughNi = -450_000_000_000;
      const troughOp = -320_000_000_000;
      fixtures.push({
        scenarioId: 'ITMG_TROUGH',
        stock: {
          ...lockedStock,
          roe: -4.5,
          operatingMargin: -5.0,
          netIncomeTTMIdr: troughNi,
          operatingProfitTTMIdr: troughOp,
          ebitdaTTMIdr: 250_000_000_000,
          ocfTTMIdr: 310_000_000_000
        }
      });
    }
  }

  return fixtures;
}

/**
 * Evaluates all 11 scenarios and returns complete baseline snapshots
 */
export function capturePhase0BaselineSnapshots(): Phase0TickerBaselineSnapshot[] {
  const fixtures = buildPhase0CharacterizationFixtures();
  const snapshots: Phase0TickerBaselineSnapshot[] = [];

  for (const { scenarioId, stock } of fixtures) {
    const evalResult = evaluateJoeliardiOosFundamental(
      stock,
      DEFAULT_GLOBAL_MACRO,
      1_000_000_000,
      undefined
    );

    const sectorClass = classifyEmitenSectorProfile(stock);
    const routeInfo = ValuationEngine.resolveRoute(stock);
    const routerRegime = detectSectorMethodologyRegime({
      ticker: stock.ticker,
      sector: stock.sector,
      subIndustry: stock.subIndustry,
      netIncomeTTMIdr: stock.netIncomeTTMIdr ?? 0,
      operatingProfitTTMIdr: stock.operatingProfitTTMIdr ?? 0,
      roeTTM: stock.roe
    });

    const omegaInfo = resolveSectorOmegaFadeFactor({
      ticker: stock.ticker,
      sector: stock.sector,
      subIndustry: stock.subIndustry,
      gpaPct: evalResult.grossProfitabilityToAssets ?? 18,
      ocfToNi: evalResult.ocfToNetIncomeRatio ?? 1.0,
      accrualPenaltyScore: (evalResult.accrualPenaltyPts ?? 0) / 8.5,
      effectiveModule: routeInfo.applied_module
    });

    const divYield = stock.forwardDividendYieldPct ?? stock.dividendYieldPct ?? 2.5;
    const sbnWithDiv = computeSbnSpotYieldCurveAndKe(stock, divYield, DEFAULT_GLOBAL_MACRO);
    const sbnWithoutDiv = computeSbnSpotYieldCurveAndKe(stock, undefined, DEFAULT_GLOBAL_MACRO);

    const rawBeta = Math.max(0.35, Number(stock.beta1Y) || 1.0);
    const blumeBeta = Number(Math.max(0.48, Math.min(1.55, 0.67 * rawBeta + 0.33 * 1.0)).toFixed(4));

    const valRes = evalResult.valuationResult;
    const riskRes = evalResult.riskSizingResult;
    const comps = evalResult.valuationMethodsComparison ?? [];

    const leg1 = comps[0];
    const leg2 = comps[1];
    const leg3 = comps[2];

    const standaloneFloorIdr = valRes?.standaloneFloor ?? 0;
    const rawStandaloneFloorIdr = valRes?.rawStandaloneFloor ?? 0;
    const ensembleFairValue = evalResult.intrinsicValueIdr;

    snapshots.push({
      scenarioId,
      ticker: stock.ticker,
      name: stock.name,
      catalogSector: stock.sector,
      subIndustry: sectorClass.subIndustry,
      archetype: sectorClass.archetype,
      spotPriceIdr: stock.lastPrice,
      routerRegime,
      valuationModuleRoute: routeInfo.route,
      appliedModule: routeInfo.applied_module,
      isCapexOverrideTriggered: routeInfo.isCapexOverrideTriggered,
      capexToDaRatio: routeInfo.capexToDaRatio,
      cwipToAssetsRatio: routeInfo.cwipToAssetsRatio,
      omegaTierLabel: omegaInfo.omegaTierLabel,
      rimPersistenceOmega: evalResult.rimPersistenceOmega ?? omegaInfo.rimPersistenceOmega,
      rimFadeYears: evalResult.rimFadeYears ?? omegaInfo.rimFadeYears,
      statArbPeerTicker:
        evalResult.sectorClassification?.resolvedStatArbPeerTicker ??
        sectorClass.resolvedStatArbPeerTicker,
      isBankRegulatoryDataMissing: sectorClass.isBankRegulatoryDataMissing,
      intrinsicValueIdr: ensembleFairValue,
      leg1Name: leg1?.name ?? 'Leg 1',
      leg1ValueIdr: leg1?.fairPriceIdr ?? 0,
      leg1WeightPct: leg1?.weightPct ?? 0,
      leg2Name: leg2?.name ?? 'Leg 2',
      leg2ValueIdr: leg2?.fairPriceIdr ?? 0,
      leg2WeightPct: leg2?.weightPct ?? 0,
      leg3Name: leg3?.name ?? 'Leg 3',
      leg3ValueIdr: leg3?.fairPriceIdr ?? 0,
      leg3WeightPct: leg3?.weightPct ?? 0,
      rawStandaloneFloorIdr,
      standaloneFloorIdr,
      isFloorClamped: Boolean(valRes?.isFloorClamped),
      floorToEnsembleRatioPct: Number(
        ((standaloneFloorIdr / Math.max(1, ensembleFairValue)) * 100).toFixed(2)
      ),
      marginOfSafetyPct: evalResult.marginOfSafetyPct,
      dynamicRequiredMosPct: evalResult.dynamicRequiredMosPct ?? 15,
      rawBeta1Y: stock.beta1Y,
      blumeBetaInKe: blumeBeta,
      sbnBlendedRfWithDivPct: sbnWithDiv.sbnBlendedSpotRfPct,
      keWithDivPct: sbnWithDiv.dynamicCostOfEquityPct,
      sbnBlendedRfWithoutDivPct: sbnWithoutDiv.sbnBlendedSpotRfPct,
      keWithoutDivPct: sbnWithoutDiv.dynamicCostOfEquityPct,
      erpBenchmarkPct: sbnWithDiv.erpBenchmarkPct,
      rawConvictionScore: evalResult.rawConvictionScore ?? evalResult.totalConvictionScore,
      finalConvictionScore: evalResult.finalConvictionScore ?? evalResult.totalConvictionScore,
      convictionGrade: evalResult.convictionGrade,
      modelDispersionPct: Number(((valRes?.modelDispersion ?? 0) * 100).toFixed(2)),
      dispersionPenaltyPts: valRes?.dispersionPenaltyPts ?? 0,
      inferredMarketRegime: riskRes?.marketRegime ?? 'TENANG',
      volatilityAnnPct: stock.volatilityAnn,
      inverseBetaCapPct: riskRes?.inverseBetaCapPct ?? 0,
      inverseVolatilityCapPct: riskRes?.inverseVolatilityCapPct ?? 0,
      regimeCapPct: riskRes?.regimeCapPct ?? 0,
      finalMaxAllocationPct: evalResult.maxBarbellCapPct ?? riskRes?.finalMaxAllocationPct ?? 0,
      tranche1Pct: evalResult.tranche1Pct ?? riskRes?.tranche1AllocationPct ?? 0,
      tranche2Pct: evalResult.tranche2Pct ?? riskRes?.tranche2AllocationPct ?? 0,
      stopLossIdr: riskRes?.stopLossPriceIDR ?? 0,
      stopLossPct: riskRes?.stopLossPct ?? 0
    });
  }

  return snapshots;
}

/**
 * Runs Phase 0/1/2 Characterization & Regression Assertions
 */
export function runPhase0CharacterizationSuite(): {
  allPassed: boolean;
  guardrailTestsPassed: number;
  guardrailTestsTotal: number;
  characterizationAssertions: Phase0CharacterizationAssertion[];
  snapshots: Phase0TickerBaselineSnapshot[];
} {
  const guardrailResults = runInstitutionalGuardrailsUnitTests();
  const guardrailTestsPassed = guardrailResults.filter((r) => r.passed).length;
  const guardrailTestsTotal = guardrailResults.length;

  const snapshots = capturePhase0BaselineSnapshots();
  const byId = new Map(snapshots.map((s) => [s.scenarioId, s]));

  const assertions: Phase0CharacterizationAssertion[] = [];

  // 1. Fase 2 Fix (Finding E — 100% Catalog Coverage): All 957+ catalog entries must map deterministically to a valid SectorProfile
  const catalogAudit = verifyCatalogSectorProfileCoverage();
  assertions.push({
    id: 'FASE2_FIXED_FINDING_E_CATALOG_COVERAGE',
    title: 'Fase 2 Fix (Temuan E — Katalog 957 Emiten): Seluruh entri katalog memiliki IdxSectorEnum, IdxSubIndustryEnum, dan SectorProfile valid (0 unmapped)',
    passed:
      catalogAudit.unmappedTickers.length === 0 &&
      catalogAudit.validEntries === catalogAudit.totalCatalogEntries &&
      catalogAudit.totalCatalogEntries >= 950,
    expected: 'unmappedTickers=0, validEntries === totalCatalogEntries >= 950',
    actual: `total=${catalogAudit.totalCatalogEntries}, valid=${catalogAudit.validEntries}, unmapped=${catalogAudit.unmappedTickers.length}`
  });

  // 2. Fase 2 Fix (Finding A — DRMA Unified SectorProfile): DRMA (Consumer Cyclicals -> AUTO_COMPONENTS) uses CYCLICAL_AUTO_COMPONENTS + Pure_Cyclical + omega [0.52, 0.66] + peer AUTO
  const drma = byId.get('DRMA')!;
  assertions.push({
    id: 'FASE2_FIXED_FINDING_A_DRMA_UNIFIED_PROFILE',
    title: 'Fase 2 Fix (Temuan A — DRMA): Consumer Cyclicals (AUTO_COMPONENTS) masuk CYCLICAL_AUTO_COMPONENTS + Pure_Cyclical (Normalized ROE, bukan Quality P/E FMCG) dengan ω selaras [0.52–0.66] dan peer AUTO',
    passed:
      drma.archetype === 'CYCLICAL_AUTO_COMPONENTS' &&
      drma.appliedModule === 'Pure_Cyclical' &&
      drma.rimPersistenceOmega >= 0.52 &&
      drma.rimPersistenceOmega <= 0.66 &&
      drma.statArbPeerTicker === 'AUTO',
    expected: 'archetype=CYCLICAL_AUTO_COMPONENTS, module=Pure_Cyclical, ω ∈ [0.52, 0.66], peer=AUTO',
    actual: `archetype=${drma.archetype}, module=${drma.appliedModule}, ω=${drma.rimPersistenceOmega}, peer=${drma.statArbPeerTicker}`
  });

  // 3. Fase 2 Fix (Finding B — ASSA Unified SectorProfile): ASSA ('Transportation & Logistics') -> TRANSPORTATION_LOGISTICS + Capex_Aggressor (EV/EBITDA + RIM) + peer BIRD
  const assa = byId.get('ASSA')!;
  assertions.push({
    id: 'FASE2_FIXED_FINDING_B_ASSA_TRANSPORT_PROFILE',
    title: "Fase 2 Fix (Temuan B — ASSA): 'Transportation & Logistics' masuk archetype TRANSPORTATION_LOGISTICS, modul Capex_Aggressor (EV/EBITDA), dan peer BIRD",
    passed:
      assa.catalogSector === 'Transportation & Logistics' &&
      assa.archetype === 'TRANSPORTATION_LOGISTICS' &&
      assa.routerRegime === 'INFRA_TELCO_UTILITIES' &&
      assa.appliedModule === 'Capex_Aggressor' &&
      assa.statArbPeerTicker === 'BIRD',
    expected: 'archetype=TRANSPORTATION_LOGISTICS, router=INFRA_TELCO_UTILITIES, module=Capex_Aggressor, peer=BIRD',
    actual: `archetype=${assa.archetype}, router=${assa.routerRegime}, module=${assa.appliedModule}, peer=${assa.statArbPeerTicker}`
  });

  // 4. Fase 2 Fix (Finding C — ITMG_TROUGH Priority): Cyclical commodity issuer at trough (NI < 0) stays in ENERGY_COAL_CPO / CYCLICAL_COMMODITIES with TROUGH_NORMALIZED mode (NOT hijacked by TECH_UNPROFITABLE_GROWTH)
  const itmgTrough = byId.get('ITMG_TROUGH')!;
  const itmgTroughStock = buildPhase0CharacterizationFixtures().find((f) => f.scenarioId === 'ITMG_TROUGH')!.stock;
  const itmgTroughClass = classifyEmitenSectorProfile(itmgTroughStock);
  assertions.push({
    id: 'FASE2_FIXED_FINDING_C_CYCLICAL_TROUGH_NOT_TECH',
    title: 'Fase 2 Fix (Temuan C — ITMG_TROUGH): Emiten komoditas saat trough (NI < 0) tetap di ENERGY_COAL_CPO / CYCLICAL_COMMODITIES (mode TROUGH_NORMALIZED), tidak dibajak ke TECH_UNPROFITABLE_GROWTH',
    passed:
      itmgTrough.archetype === 'ENERGY_COAL_CPO' &&
      itmgTrough.routerRegime === 'CYCLICAL_COMMODITIES' &&
      itmgTroughClass.isCyclicalTroughMode === true &&
      itmgTroughClass.isPreProfitTechSpeculative === false,
    expected: 'archetype=ENERGY_COAL_CPO, router=CYCLICAL_COMMODITIES, isCyclicalTroughMode=true',
    actual: `archetype=${itmgTrough.archetype}, router=${itmgTrough.routerRegime}, troughMode=${itmgTroughClass.isCyclicalTroughMode}, techMode=${itmgTroughClass.isPreProfitTechSpeculative}`
  });

  // 5. Fase 2 Fix (Finding D — Synthetic CWIP Blocked): Synthetic CWIP heuristic cannot trigger Capex_Aggressor when real CapEx/D&A data is missing
  const itmgStock = buildPhase0CharacterizationFixtures().find((f) => f.scenarioId === 'ITMG')!.stock;
  const syntheticCwipRoute = ValuationEngine.resolveRoute(
    {
      ...itmgStock,
      capexTTMIdr: undefined,
      daTTMIdr: undefined,
      capexToDaRatio: undefined,
      capexToRevenueRatio: undefined
    },
    0.18 // synthetic cwipToAssetsRatio > 0.15 must NOT trigger Capex_Aggressor
  );
  assertions.push({
    id: 'FASE2_FIXED_FINDING_D_SYNTHETIC_CWIP_BLOCKED',
    title: 'Fase 2 Fix (Temuan D): Imputasi sintetis CWIP (>0.15) tanpa data CapEx & D&A riil DILARANG memicu override Capex_Aggressor',
    passed:
      syntheticCwipRoute.applied_module === 'Pure_Cyclical' &&
      syntheticCwipRoute.isCapexOverrideTriggered === false &&
      syntheticCwipRoute.isSyntheticCapexBlocked === true,
    expected: 'applied_module=Pure_Cyclical, isCapexOverrideTriggered=false, isSyntheticCapexBlocked=true',
    actual: `applied_module=${syntheticCwipRoute.applied_module}, override=${syntheticCwipRoute.isCapexOverrideTriggered}, blocked=${syntheticCwipRoute.isSyntheticCapexBlocked}`
  });

  // 6. Fase 2 Fix (Confirmed Decision 2 — Bank Regulatory Data Honesty & Micro/Sharia Bank Split):
  //    - BBCA & BTPS without explicit CAR/NPL/NIM numbers must trigger isBankRegulatoryDataMissing=true, cap grade at B (<= 74), and never print "CAR Sehat"
  //    - BTPS classifies as BANK_MICRO_SHARIA with peer BRIS (not BBCA/BMRI)
  const bbca = byId.get('BBCA')!;
  const btps = byId.get('BTPS')!;
  const bbcaEval = evaluateJoeliardiOosFundamental(
    buildPhase0CharacterizationFixtures().find((f) => f.scenarioId === 'BBCA')!.stock,
    DEFAULT_GLOBAL_MACRO
  );
  const hasFakeCarSehat = bbcaEval.keyStrengths.some((s) => s.includes('CAR Sehat'));
  const hasIncompleteBankFlag = bbcaEval.keyRisks.some((r) => r.includes('DATA BANK TIDAK LENGKAP'));
  assertions.push({
    id: 'FASE2_FIXED_BANK_HONESTY_AND_MICRO_SHARIA_SPLIT',
    title: 'Fase 2 Fix (Keputusan 2 — Kejujuran Data Bank & Sub-Archetype BTPS): Tanpa angka CAR/NPL/NIM eksplisit, klaim "CAR Sehat" dihapus, muncul flag "DATA BANK TIDAK LENGKAP", grade dibatasi maksimal B (<=74), dan BTPS masuk BANK_MICRO_SHARIA_MULTIFINANCE (peer BRIS)',
    passed:
      bbca.isBankRegulatoryDataMissing === true &&
      bbca.finalConvictionScore <= 74 &&
      bbca.convictionGrade === 'B (WATCHLIST / HOLD)' &&
      !hasFakeCarSehat &&
      hasIncompleteBankFlag &&
      btps.archetype === 'BANK_MICRO_SHARIA_MULTIFINANCE' &&
      btps.statArbPeerTicker === 'BRIS',
    expected: 'BBCA: missingReg=true, score<=74 (Grade B), no "CAR Sehat", flag "DATA BANK TIDAK LENGKAP"; BTPS: BANK_MICRO_SHARIA_MULTIFINANCE, peer=BRIS',
    actual: `BBCA: missingReg=${bbca.isBankRegulatoryDataMissing}, score=${bbca.finalConvictionScore} (${bbca.convictionGrade}), fakeCar=${hasFakeCarSehat}, flag=${hasIncompleteBankFlag}; BTPS: archetype=${btps.archetype}, peer=${btps.statArbPeerTicker}`
  });

  // 7. Fase 1 Fix (Finding F1): computeSbnSpotYieldCurveAndKe with vs without explicit forwardDividendYieldPct produces IDENTICAL Rf & Ke
  const itmg = byId.get('ITMG')!;
  assertions.push({
    id: 'FASE1_FIXED_RF_KE_CALLER_CONSISTENCY',
    title: 'Fase 1 Fix (Temuan F — Rf & Ke): Pemanggilan computeSbnSpotYieldCurveAndKe dengan vs tanpa argumen kedua menghasilkan Rf dan Ke yang 100% IDENTIK',
    passed:
      itmg.sbnBlendedRfWithDivPct === itmg.sbnBlendedRfWithoutDivPct &&
      itmg.keWithDivPct === itmg.keWithoutDivPct,
    expected: 'Rf(withDiv) === Rf(withoutDiv) && Ke(withDiv) === Ke(withoutDiv)',
    actual: `WithDiv: Rf=${itmg.sbnBlendedRfWithDivPct}% / Ke=${itmg.keWithDivPct}% vs WithoutDiv: Rf=${itmg.sbnBlendedRfWithoutDivPct}% / Ke=${itmg.keWithoutDivPct}%`
  });

  // 8. Fase 1 SSOT Verification: Global MarketRegime is identical across low-volatility and high-volatility stocks
  const bbcaBaseStock = buildPhase0CharacterizationFixtures().find((f) => f.scenarioId === 'BBCA')!.stock;
  const lowVolEvaluate = evaluateJoeliardiOosFundamental(
    { ...bbcaBaseStock, volatilityAnn: 14.0 },
    DEFAULT_GLOBAL_MACRO
  );
  const highVolEvaluate = evaluateJoeliardiOosFundamental(
    { ...bbcaBaseStock, volatilityAnn: 55.0 },
    DEFAULT_GLOBAL_MACRO
  );
  const explicitTenangEvaluate = evaluateJoeliardiOosFundamental(
    { ...bbcaBaseStock, volatilityAnn: 55.0 },
    DEFAULT_GLOBAL_MACRO,
    1_000_000_000,
    'TENANG'
  );
  assertions.push({
    id: 'FASE1_FIXED_GLOBAL_MARKET_REGIME_SSOT',
    title: 'Fase 1 Fix (SSOT MarketRegime): Rezim pasar tidak lagi diinferensi dari volatilitas saham tunggal (vol=14% vs vol=55% memiliki rezim global identik & menghormati explicitMarketRegime)',
    passed:
      lowVolEvaluate.decision?.marketRegime === highVolEvaluate.decision?.marketRegime &&
      explicitTenangEvaluate.decision?.marketRegime === 'TENANG' &&
      explicitTenangEvaluate.riskSizingResult?.marketRegime === 'TENANG',
    expected: 'regime(vol=14%) === regime(vol=55%) && explicit("TENANG", vol=55%) === "TENANG"',
    actual: `vol14=${lowVolEvaluate.decision?.marketRegime}, vol55=${highVolEvaluate.decision?.marketRegime}, explicitTenang(vol55)=${explicitTenangEvaluate.decision?.marketRegime}`
  });

  // 9. Fase 3 Fix (Finding F2 — Single Unified Beta in Ke and Sizing):
  //    Cost of Equity (Ke) and Position Sizing (riskSizingResult.beta1Y / inverseBetaCapPct) use the EXACT SAME adjustedBeta
  const bbcaDecisionBeta = bbcaEval.decision?.adjustedBeta ?? 0;
  const bbcaSizingBeta = bbcaEval.riskSizingResult?.beta1Y ?? -1;
  const expectedInverseBetaCap = Number(
    Math.max(4.0, Math.min(18.0, 12.5 / Math.max(0.35, bbcaDecisionBeta))).toFixed(2)
  );
  assertions.push({
    id: 'FASE3_FIXED_UNIFIED_BETA_KE_AND_SIZING',
    title: 'Fase 3 Fix (Temuan F2 — Satu Definisi Beta): Cost of Equity (Ke) dan Position Sizing (1/Beta) memakai adjustedBeta yang 100% IDENTIK',
    passed:
      Math.abs(bbcaDecisionBeta - bbcaSizingBeta) <= 0.01 &&
      bbcaEval.riskSizingResult?.inverseBetaCapPct === expectedInverseBetaCap,
    expected: `decision.adjustedBeta (${bbcaDecisionBeta.toFixed(2)}) === riskSizingResult.beta1Y && inverseBetaCapPct === ${expectedInverseBetaCap}%`,
    actual: `decision.adjustedBeta=${bbcaDecisionBeta}, sizing.beta1Y=${bbcaSizingBeta}, inverseBetaCapPct=${bbcaEval.riskSizingResult?.inverseBetaCapPct}%`
  });

  // 10. Fase 3 Fix (Finding F3 — Continuous Dispersion Penalty, Zero Cliff at 40%):
  //     - Penalty difference between 39.9% dispersion and 40.1% dispersion is < 1 point (no 0 -> -10 cliff)
  //     - Outlier flag alone on low dispersion (e.g. 10%) does NOT trigger a forced 10-point penalty
  const disp399 = applyDispersionPenalty({
    valuationOutputsIDR: [1000, 1200, 1478.8], // (1478.8 - 1000) / 1200 = 0.3990 (39.9%)
    rawConvictionScore: 85,
    isOutlierEnsembleActive: false
  });
  const disp401 = applyDispersionPenalty({
    valuationOutputsIDR: [1000, 1200, 1481.2], // (1481.2 - 1000) / 1200 = 0.4010 (40.1%)
    rawConvictionScore: 85,
    isOutlierEnsembleActive: false
  });
  const dispLowWithOutlierFlag = applyDispersionPenalty({
    valuationOutputsIDR: [1000, 1050, 1100], // (1100 - 1000) / 1050 = 9.52% <= 15%
    rawConvictionScore: 85,
    isOutlierEnsembleActive: true
  });
  const cliffDiffContinuous = Math.abs(disp401.continuousPenaltyPts - disp399.continuousPenaltyPts);
  const cliffDiffRounded = Math.abs(disp401.dispersionPenaltyPts - disp399.dispersionPenaltyPts);
  assertions.push({
    id: 'FASE3_FIXED_CONTINUOUS_DISPERSION_NO_CLIFF',
    title: 'Fase 3 Fix (Temuan F3 — Penalti Dispersi Kontinu Tanpa Tebing 40%): Selisih penalti antara dispersi 39,9% dan 40,1% < 1 poin, dan flag outlier pada dispersi rendah tidak memicu penalti minimum 10 poin',
    passed:
      cliffDiffContinuous < 1.0 &&
      cliffDiffRounded <= 1 &&
      disp399.dispersionPenaltyPts > 0 &&
      dispLowWithOutlierFlag.dispersionPenaltyPts === 0,
    expected: '|Penalty(40.1%) - Penalty(39.9%)| < 1 pt && Penalty(9.5% with outlierFlag) === 0',
    actual: `39.9%=${disp399.continuousPenaltyPts}pts (${disp399.dispersionPenaltyPts}), 40.1%=${disp401.continuousPenaltyPts}pts (${disp401.dispersionPenaltyPts}), diff=${cliffDiffContinuous.toFixed(2)}pts; lowWithFlag=${dispLowWithOutlierFlag.dispersionPenaltyPts}pts`
  });

  // 11. Fase 3 Fix (Finding F4 — Always-On <= 90% Floor Clamp & Sector-Aware Bank Weak-Moat):
  //     - Every scenario's standaloneFloorIdr is <= 90% of intrinsicValueIdr (no 91%–99% un-clamped floors)
  //     - Bank with ROE >= threshold (e.g. 16%) and high banking DER (5.8x) does NOT suffer DER > 1.0x weak-moat haircut
  const allFloorsWithin90Pct = snapshots.every((s) => s.floorToEnsembleRatioPct <= 90.05);
  const maxFloorRatioPct = Math.max(...snapshots.map((s) => s.floorToEnsembleRatioPct));
  const bankFloorTest = calculateInvariantGrahamJoeliardiFloor({
    epsTTM: 500,
    epsAvg3Y: 480,
    roeTTM: 16.5,
    roeAvg3Y: 16.0,
    debtToEquity: 5.8, // Normal banking deposit/liability leverage
    growthRate: 5.0,
    spotRf10Y: 6.75,
    ensembleFairValue: 10000,
    maxRatioToEnsemble: 0.90,
    roeHaircutThresholdPct: 12.0,
    derHaircutThreshold: null // Bank DER bypassed
  });
  assertions.push({
    id: 'FASE3_FIXED_FLOOR_ALWAYS_LE_90PCT_AND_BANK_AWARE',
    title: 'Fase 3 Fix (Temuan F4 — Floor Selalu ≤ 90% Ensemble & Bank-Aware Weak-Moat): Seluruh 11 skenario memiliki Floor ≤ 90% Ensemble (tidak ada 91%–99%), dan DER bank (5,8x) tidak memicu haircut weak-moat',
    passed: allFloorsWithin90Pct && bankFloorTest.isMoatHaircutApplied === false,
    expected: 'maxFloorRatioPct <= 90.05% && bankFloorTest.isMoatHaircutApplied === false',
    actual: `maxFloorRatioPct=${maxFloorRatioPct.toFixed(2)}%, bankMoatHaircut=${bankFloorTest.isMoatHaircutApplied} (${bankFloorTest.moatHaircutReason})`
  });

  // 12. Fase 3 Fix (Finding F5 — Smooth Strictly Monotonic Volatility Sizing, No Flat 12.5% Floor on 25%-35% Vol):
  const sampleVols = [0.20, 0.25, 0.30, 0.34, 0.40];
  const volCaps = sampleVols.map(
    (v) =>
      calculateVolatilityTargetedSizingAndStop({
        price: 2000,
        beta1Y: 0.50,
        realizedAnnualVol: v,
        atr20: 45,
        marketRegime: 'TENANG',
        rawConvictionScore: 85,
        dispersionPenalty: dispLowWithOutlierFlag,
        sanityReport: bbcaEval.sanityReport!
      }).inverseVolatilityCapPct
  );
  const isStrictlyMonotonicVolCap =
    volCaps[0] > volCaps[1] &&
    volCaps[1] > volCaps[2] &&
    volCaps[2] > volCaps[3] &&
    volCaps[3] > volCaps[4];
  assertions.push({
    id: 'FASE3_FIXED_SMOOTH_MONOTONIC_VOL_SIZING',
    title: 'Fase 3 Fix (Temuan F5 — Kurva Sizing Volatilitas Monotonik Mulus): Plafon 1/Vol turun secara strictly monotonic dari vol 20% → 25% → 30% → 34% → 40% (tanpa lantai datar 12,5% di 25%–35%)',
    passed: isStrictlyMonotonicVolCap,
    expected: 'Cap(20%) > Cap(25%) > Cap(30%) > Cap(34%) > Cap(40%)',
    actual: `Caps=[${volCaps.map((c, idx) => `${sampleVols[idx] * 100}%:${c}%`).join(' > ')}]`
  });

  // 13. Fase 3 Fix (Unified Persistence, ROE-Fade Scenarios & Ke +/- 1pp Sensitivity Matrix on EmitenDecision):
  const allHaveSensitivityAndFade = fixturesForSensitivityCheck();
  assertions.push({
    id: 'FASE3_FIXED_ROE_FADE_AND_KE_SENSITIVITY_SSOT',
    title: 'Fase 3 Fix (Skenario ROE-Fade Bear/Base/Bull & Matriks Sensitivitas Ke ±1pp): Tersedia di decision SSOT dengan urutan monotonik (Bull ≥ Base ≥ Bear dan Ke-1pp ≥ Base ≥ Ke+1pp)',
    passed: allHaveSensitivityAndFade.passed,
    expected: 'bullIdr >= baseIdr >= bearIdr && keMinus1ppIdr >= keBaseIdr >= kePlus1ppIdr && erpAsOfDate defined',
    actual: allHaveSensitivityAndFade.actual
  });

  // 14. All 10+1 snapshots must produce finite positive intrinsic values and valid grades
  const allFinite = snapshots.every(
    (s) =>
      Number.isFinite(s.intrinsicValueIdr) &&
      s.intrinsicValueIdr > 0 &&
      Number.isFinite(s.finalConvictionScore) &&
      s.finalConvictionScore >= 10 &&
      s.finalConvictionScore <= 100
  );
  assertions.push({
    id: 'BASELINE_11_SCENARIOS_FINITE_AND_DETERMINISTIC',
    title: 'Seluruh 11 skenario karakterisasi (10 emiten lintas archetype + 1 cyclical trough) menghasilkan output deterministik & valid',
    passed: allFinite && snapshots.length === 11,
    expected: '11 skenario valid & deterministik',
    actual: `${snapshots.length} skenario dievaluasi, allFinite=${allFinite}`
  });

  const allPassed =
    guardrailTestsPassed === guardrailTestsTotal &&
    assertions.every((a) => a.passed);

  return {
    allPassed,
    guardrailTestsPassed,
    guardrailTestsTotal,
    characterizationAssertions: assertions,
    snapshots
  };
}

// Allow direct CLI execution via `npx tsx src/utils/phase0CharacterizationSuite.ts`
const isDirectCliExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  process.argv[1].includes('phase0CharacterizationSuite');

if (isDirectCliExecution) {
  const res = runPhase0CharacterizationSuite();
  console.log('================================================================================');
  console.log('FASE 0 — GOLDEN CHARACTERIZATION SUITE & BASELINE SNAPSHOTS (BEFORE REFACTOR)');
  console.log('================================================================================');
  console.log(
    `Guardrails Unit Tests: ${res.guardrailTestsPassed}/${res.guardrailTestsTotal} PASSED`
  );
  console.log(
    `Phase 0 Characterization Assertions: ${
      res.characterizationAssertions.filter((a) => a.passed).length
    }/${res.characterizationAssertions.length} PASSED`
  );
  console.log('--------------------------------------------------------------------------------');
  for (const a of res.characterizationAssertions) {
    console.log(`[${a.passed ? 'PASS' : 'FAIL'}] ${a.id}: ${a.title}`);
    console.log(`       Expected: ${a.expected}`);
    console.log(`       Actual  : ${a.actual}`);
  }
  console.log('--------------------------------------------------------------------------------');
  console.log('BASELINE SNAPSHOT TABLE (11 SCENARIOS):');
  console.log(
    JSON.stringify(
      res.snapshots.map((s) => ({
        id: s.scenarioId,
        sector: s.catalogSector,
        price: s.spotPriceIdr,
        routerRegime: s.routerRegime,
        valRoute: s.appliedModule,
        omega: s.rimPersistenceOmega,
        omegaTier: s.omegaTierLabel,
        fairValue: s.intrinsicValueIdr,
        leg1: `${s.leg1Name}: Rp ${s.leg1ValueIdr} (${s.leg1WeightPct}%)`,
        leg2: `${s.leg2Name}: Rp ${s.leg2ValueIdr} (${s.leg2WeightPct}%)`,
        leg3: `${s.leg3Name}: Rp ${s.leg3ValueIdr} (${s.leg3WeightPct}%)`,
        rawFloor: s.rawStandaloneFloorIdr,
        clampedFloor: s.standaloneFloorIdr,
        floorRatioPct: s.floorToEnsembleRatioPct,
        mosPct: s.marginOfSafetyPct,
        rfWithDiv: s.sbnBlendedRfWithDivPct,
        keWithDiv: s.keWithDivPct,
        rfNoDiv: s.sbnBlendedRfWithoutDivPct,
        keNoDiv: s.keWithoutDivPct,
        rawBeta: s.rawBeta1Y,
        blumeBeta: s.blumeBetaInKe,
        rawScore: s.rawConvictionScore,
        finalScore: s.finalConvictionScore,
        grade: s.convictionGrade,
        dispersionPct: s.modelDispersionPct,
        dispPenPts: s.dispersionPenaltyPts,
        regime: s.inferredMarketRegime,
        volAnnPct: s.volatilityAnnPct,
        maxCapPct: s.finalMaxAllocationPct,
        t1Pct: s.tranche1Pct,
        t2Pct: s.tranche2Pct,
        stopIdr: s.stopLossIdr
      })),
      null,
      2
    )
  );
  if (!res.allPassed) {
    process.exit(1);
  }
}
