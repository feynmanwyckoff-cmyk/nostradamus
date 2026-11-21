import { QuarterlyRawRow, RawTickerData } from '../types/quant';
import {
  applyDispersionPenalty,
  buildTacticalOverlayFromStatArb,
  calculateInvariantGrahamJoeliardiFloor,
  calculateTwoStageCapexAggressorRI,
  calculateVolatilityTargetedSizingAndStop,
  computeIdxTtmAndSnapshotFromQuarters,
  decumulateIDXQuarters,
  validateFundamentalSanity
} from './institutionalGuardrailsEngine';
import { buildValuationLedger, DynamicEnsembleWeighter } from './valuationEngine';

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

  return results;
}
