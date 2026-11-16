import {
  ActivePortfolioEvaluation,
  BarbellRole,
  CandidateRecommendation,
  DeMiguelBufferZone,
  EnsembleValuationLeg,
  EvaluatedHolding,
  HRPAllocationPosition,
  JoeliardiOosEvaluation,
  MacroIndicator,
  MarketRegime,
  MarketRegimeStatus,
  NewsSentimentItem,
  PortfolioAnalyticsSummary,
  PortfolioHolding,
  RebalanceSignalType,
  RecommendationStrategyTag,
  SectorValuationArchetype,
  StatArbSignalType,
  StockMetrics,
  ValuationMethodComparisonItem
} from '../types/quant';
import {
  FULL_JCI_EMITEN_CATALOG,
  getEmitenDividendYield,
  isInstitutionalLiquidCandidate
} from '../data/idxAllEmitenCatalog';
import {
  formatKseiFootnoteShortLabel,
  getKseiHscEntry
} from '../data/idxKseiHscRegistry';
import {
  applyDynamicCorporateActionDivisor,
  computeTypeSafeEnsembleFairValue,
  evaluateDynamicDecisionTree,
  interceptCorporateActionAndAnnualize
} from './corporateActionMiddleware';
import {
  calculateHybridShareholderYield
} from './tsyCalculator';
import {
  annualizeQuarterlyEarnings,
  calculateGrahamJoeliardiBenchmark,
  DynamicEnsembleWeighter,
  resolveContextualOcfNiPolicy,
  resolveSectorOmegaFadeFactor,
  ValuationEngine
} from './valuationEngine';

export type RawStockInput = Omit<
  StockMetrics,
  | 'dmuMomScore'
  | 'dmuLowVolScore'
  | 'dmuValueScore'
  | 'dmuSizeScore'
  | 'dmuCompositeScore'
  | 'dmuRankPct'
  | 'dmuZone'
  | 'qmjScore'
  | 'babScore'
  | 'hrpPropensity'
  | 'role'
  | 'grossProfitabilityToAssets'
  | 'ocfToNetIncomeRatio'
  | 'accrualRatioToAssets'
  | 'accrualPenaltyScore'
  | 'betaWeightedPropensity'
> & {
  grossProfitabilityToAssets?: number;
  ocfToNetIncomeRatio?: number;
  accrualRatioToAssets?: number;
  accrualPenaltyScore?: number;
  betaWeightedPropensity?: number;
};

/**
 * Real-Time Calibrated Global Macro Indicators impacting IDX:COMPOSITE
 */
export const DEFAULT_GLOBAL_MACRO: MacroIndicator[] = [
  {
    id: 'usdidr',
    symbol: 'IDR=X',
    label: 'USD / IDR Spot',
    category: 'FX_RATES',
    value: 18080,
    unit: 'Rp',
    change1D: 3.10,
    ihsgImpact: 'BEARISH',
    transmissionNote: 'Tekanan depresiasi Rupiah memicu penyesuaian eksposur ekuitas ke cadangan kas.'
  },
  {
    id: 'dxy',
    symbol: 'DX-Y.NYB',
    label: 'US Dollar Index (DXY)',
    category: 'FX_RATES',
    value: 101.22,
    unit: 'pts',
    change1D: -0.29,
    ihsgImpact: 'BULLISH',
    transmissionNote: 'Pelemahan indeks DXY memberi ruang stabilisasi bagi mata uang Asia.'
  },
  {
    id: 'us10y',
    symbol: '^TNX',
    label: 'US 10Y Treasury Yield',
    category: 'FX_RATES',
    value: 4.89,
    unit: '%',
    change1D: -1.17,
    ihsgImpact: 'BEARISH',
    transmissionNote: 'Yield US 10Y di atas 4.5% menjaga cost of equity pasar berkembang tetap ketat.'
  },
  {
    id: 'vix',
    symbol: '^VIX',
    label: 'CBOE VIX Volatility',
    category: 'GLOBAL_RISK',
    value: 16.61,
    unit: 'pts',
    change1D: -20.26,
    ihsgImpact: 'BULLISH',
    transmissionNote: 'Penurunan tajam VIX meredakan kepanikan ekor (tail-risk) di bursa global.'
  },
  {
    id: 'sp500',
    symbol: '^GSPC',
    label: 'S&P 500 Index',
    category: 'GLOBAL_RISK',
    value: 7688.62,
    unit: 'pts',
    change1D: 1.58,
    ihsgImpact: 'BULLISH',
    transmissionNote: 'Reli ekuitas AS memberikan dukungan sentimen jangka pendek ke bursa regional.'
  },
  {
    id: 'hsi',
    symbol: '^HSI',
    label: 'Hang Seng Index',
    category: 'GLOBAL_RISK',
    value: 24779.33,
    unit: 'pts',
    change1D: 3.59,
    ihsgImpact: 'BULLISH',
    transmissionNote: 'Penguatan bursa Asia Timur menopang permintaan komoditas ekspor Indonesia.'
  },
  {
    id: 'coal',
    symbol: 'MTF=F',
    label: 'Newcastle Coal',
    category: 'COMMODITIES',
    value: 146.50,
    unit: 'USD/t',
    change1D: 1.25,
    ihsgImpact: 'BULLISH',
    transmissionNote: 'Menopang faktor Value & arus kas bebas emiten batubara (ITMG, PTBA, ADRO).'
  },
  {
    id: 'gold',
    symbol: 'GC=F',
    label: 'Gold Spot (XAU)',
    category: 'COMMODITIES',
    value: 4136.50,
    unit: 'USD/oz',
    change1D: 1.56,
    ihsgImpact: 'BULLISH',
    transmissionNote: 'Rekor harga emas menjadi lindung nilai & katalis emiten tambang emas/tembaga (AMMN, ANTM).'
  },
  {
    id: 'brent',
    symbol: 'BZ=F',
    label: 'Brent Crude Oil',
    category: 'COMMODITIES',
    value: 94.19,
    unit: 'USD/bbl',
    change1D: -0.45,
    ihsgImpact: 'NEUTRAL',
    transmissionNote: 'Harga minyak tinggi menguntungkan MEDC/AKRA namun perlu dipantau terhadap inflasi.'
  },
  {
    id: 'nickel',
    symbol: 'NICKEL',
    label: 'LME Nickel 3M',
    category: 'COMMODITIES',
    value: 16840,
    unit: 'USD/t',
    change1D: 0.95,
    ihsgImpact: 'BULLISH',
    transmissionNote: 'Mendukung margin emiten hilirisasi nikel (INCO, NCKL, ANTM).'
  },
  {
    id: 'cpo',
    symbol: 'CPO',
    label: 'Crude Palm Oil (BMD)',
    category: 'COMMODITIES',
    value: 4790,
    unit: 'MYR/t',
    change1D: 1.40,
    ihsgImpact: 'BULLISH',
    transmissionNote: 'Mandatori biodiesel B40 menopang harga jual rata-rata (ASP) emiten sawit (TAPG).'
  }
];

export type SimRegimeMode = 'LIVE' | 'TENANG' | 'WASPADA' | 'VOLATIL';

export const CALM_GLOBAL_MACRO: MacroIndicator[] = DEFAULT_GLOBAL_MACRO.map((item) => {
  if (item.id === 'usdidr') {
    return {
      ...item,
      value: 15650,
      change1D: -0.35,
      ihsgImpact: 'BULLISH',
      transmissionNote: 'Stabilitas Rupiah di bawah Rp15.800 mendukung sentimen konstruktif pasar.'
    };
  }
  if (item.id === 'us10y') {
    return {
      ...item,
      value: 4.05,
      change1D: -0.12,
      ihsgImpact: 'BULLISH',
      transmissionNote: 'Penurunan yield US 10Y melonggarkan kondisi finansial pasar berkembang.'
    };
  }
  if (item.id === 'vix') {
    return {
      ...item,
      value: 13.80,
      change1D: -4.20,
      ihsgImpact: 'BULLISH',
      transmissionNote: 'VIX < 15 mengonfirmasi sentimen pasar tenang.'
    };
  }
  return item;
});

export const CAUTION_GLOBAL_MACRO: MacroIndicator[] = DEFAULT_GLOBAL_MACRO.map((item) => {
  if (item.id === 'usdidr') {
    return {
      ...item,
      value: 16580,
      change1D: 0.42,
      ihsgImpact: 'NEUTRAL',
      transmissionNote: 'Fluktuasi moderat Rupiah di kisaran Rp16.500 menuntut disiplin selektivitas sektoral.'
    };
  }
  if (item.id === 'us10y') {
    return {
      ...item,
      value: 4.48,
      change1D: 0.15,
      ihsgImpact: 'BEARISH',
      transmissionNote: 'Yield US 10Y mendekati 4,5% menahan ekspansi multipel valuasi secara agresif.'
    };
  }
  if (item.id === 'vix') {
    return {
      ...item,
      value: 19.40,
      change1D: 2.10,
      ihsgImpact: 'NEUTRAL',
      transmissionNote: 'VIX di zona 18–21 mencerminkan fase transisi / kewaspadaan terukur.'
    };
  }
  if (item.id === 'dxy') {
    return {
      ...item,
      value: 103.85,
      change1D: 0.25,
      ihsgImpact: 'BEARISH',
      transmissionNote: 'Penguatan terbatas DXY memicu rotasi sebagian ke saham defensif berdividen.'
    };
  }
  return item;
});

export const VOLATILE_GLOBAL_MACRO: MacroIndicator[] = DEFAULT_GLOBAL_MACRO.map((item) => {
  if (item.id === 'usdidr') {
    return {
      ...item,
      value: 18150,
      change1D: 1.85,
      ihsgImpact: 'BEARISH',
      transmissionNote: 'Tekanan depresiasi Rupiah memicu penyesuaian eksposur ekuitas ke cadangan kas.'
    };
  }
  if (item.id === 'us10y') {
    return {
      ...item,
      value: 4.95,
      change1D: 0.85,
      ihsgImpact: 'BEARISH',
      transmissionNote: 'Lonjakan yield US 10Y memperketat likuiditas global & memicu arus keluar EM.'
    };
  }
  if (item.id === 'vix') {
    return {
      ...item,
      value: 26.80,
      change1D: 12.40,
      ihsgImpact: 'BEARISH',
      transmissionNote: 'VIX > 25 menandakan rezim volatilitas tinggi; skala risiko wajib diturunkan.'
    };
  }
  return item;
});

export const REAL_IHSG_30D_RETURNS = [
  -0.90, -1.51, -0.43, -0.83, -1.02, 0.46, 1.36, 1.21, -0.75, -1.88,
  1.04, -2.59, -0.17, 0.29, -1.33, -11.57, -3.64, 5.65, 0.94, 1.12,
  0.95, -1.22, -1.99, 0.31, -3.49, -0.80, 0.79, -3.78, 0.32, 2.23
];

export const CAUTION_IHSG_30D_RETURNS = [
  0.85, -1.12, 0.64, -0.95, 1.18, -0.78, 0.42, -1.34, 0.91, -0.88,
  1.05, -1.22, 0.55, -0.92, 1.30, -1.45, 0.76, -0.84, 1.12, -1.08,
  0.68, -1.15, 0.94, -0.72, 1.02, -1.28, 0.81, -0.96, 0.74, -0.65
];

export const CALM_IHSG_30D_RETURNS = [
  0.42, -0.31, 0.18, 0.65, -0.22, 0.11, -0.48, 0.35, 0.29, -0.15,
  0.54, -0.38, 0.09, 0.41, -0.62, 0.27, 0.19, -0.25, 0.44, -0.12,
  0.31, -0.51, 0.22, 0.38, -0.19, 0.14, -0.28, 0.49, -0.11, 0.33
];

export function computeMacroStressScore(macroList: MacroIndicator[]): number {
  const usdidr = macroList.find((m) => m.id === 'usdidr')?.value ?? 18080;
  const us10y = macroList.find((m) => m.id === 'us10y')?.value ?? 4.89;
  const vix = macroList.find((m) => m.id === 'vix')?.value ?? 16.61;
  const dxy = macroList.find((m) => m.id === 'dxy')?.value ?? 101.22;

  const fxStress = Math.max(0, Math.min(100, ((usdidr - 15200) / 3200) * 100));
  const yieldStress = Math.max(0, Math.min(100, ((us10y - 3.6) / 1.6) * 100));
  const vixStress = Math.max(0, Math.min(100, ((vix - 12) / 20) * 100));
  const dxyStress = Math.max(0, Math.min(100, ((dxy - 99) / 9) * 100));

  const composite = 0.35 * fxStress + 0.30 * vixStress + 0.20 * yieldStress + 0.15 * dxyStress;
  return Number(Math.max(5, Math.min(98, composite)).toFixed(1));
}

export function computeMarketRegime(
  customDailyReturns?: number[],
  thresholdAnnVol: number = 18.0,
  macroIndicators: MacroIndicator[] = DEFAULT_GLOBAL_MACRO,
  liveIhsgQuote?: { lastPrice: number; change1D: number },
  forcedSimRegime: SimRegimeMode = 'LIVE'
): MarketRegime {
  const returns =
    customDailyReturns && customDailyReturns.length >= 5
      ? customDailyReturns
      : REAL_IHSG_30D_RETURNS;

  const n = returns.length;
  const mean = returns.reduce((acc, r) => acc + r, 0) / n;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / (n - 1);
  const dailyStdDev30D = Math.sqrt(variance);
  const annualizedVol30D = dailyStdDev30D * Math.sqrt(252);

  const macroStressScore = computeMacroStressScore(macroIndicators);
  const macroImpliedVol = 10 + (macroStressScore / 100) * 16;
  const effectiveRegimeVol = Number((0.75 * annualizedVol30D + 0.25 * macroImpliedVol).toFixed(2));

  let status: MarketRegimeStatus = 'TENANG';
  if (forcedSimRegime === 'TENANG' || forcedSimRegime === 'WASPADA' || forcedSimRegime === 'VOLATIL') {
    status = forcedSimRegime;
  } else if (effectiveRegimeVol > thresholdAnnVol || macroStressScore >= 68) {
    status = 'VOLATIL';
  } else if (effectiveRegimeVol > thresholdAnnVol - 2.2 || macroStressScore >= 52) {
    status = 'WASPADA';
  }

  let rawScaleRatio = Math.min(
    1.0,
    Math.max(0.35, thresholdAnnVol / Math.max(10, effectiveRegimeVol))
  );
  if (forcedSimRegime === 'TENANG') {
    rawScaleRatio = Math.max(0.85, rawScaleRatio);
  } else if (forcedSimRegime === 'WASPADA') {
    rawScaleRatio = Math.min(0.75, Math.max(0.60, rawScaleRatio));
  } else if (forcedSimRegime === 'VOLATIL') {
    rawScaleRatio = Math.min(0.50, Math.max(0.35, rawScaleRatio));
  }

  const activeEquityPct = Math.round((rawScaleRatio * 100) / 5) * 5;
  const clampedEquityPct = Math.max(35, Math.min(90, activeEquityPct));
  const cashAndLowVolBufferPct = 100 - clampedEquityPct;

  const targetLastPrice = liveIhsgQuote?.lastPrice ?? 5034.43;
  const targetChange1D = liveIhsgQuote?.change1D ?? returns[returns.length - 1] ?? 2.33;

  const closesReverse: number[] = new Array(n);
  closesReverse[n - 1] = targetLastPrice;
  for (let i = n - 1; i > 0; i--) {
    const r = returns[i] / 100;
    closesReverse[i - 1] = closesReverse[i] / (1 + r);
  }

  const series = returns.map((ret, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - idx));
    return {
      date: d.toISOString().split('T')[0],
      close: Number(closesReverse[idx].toFixed(2)),
      dailyReturn: Number(ret.toFixed(2))
    };
  });

  return {
    ihsgLastPrice: Number(targetLastPrice.toFixed(2)),
    ihsgChange1D: Number(targetChange1D.toFixed(2)),
    dailyStdDev30D: Number(dailyStdDev30D.toFixed(3)),
    annualizedVol30D: Number(annualizedVol30D.toFixed(2)),
    thresholdAnnVol,
    macroStressScore,
    effectiveRegimeVol,
    status,
    defensiveWeight: cashAndLowVolBufferPct,
    aggressiveWeight: clampedEquityPct,
    updatedAt: new Date().toISOString(),
    ihsg30DSeries: series
  };
}

export type BasketSelectionMode =
  | 'LIVE_FACTOR_LEADER'
  | 'TOP_GAINERS_MOMENTUM'
  | 'SECTOR_ROTATION';

const BASELINE_PRICE_ANCHORS: Record<string, number> = {
  BBCA: 5100,
  BMRI: 3640,
  BBRI: 2740,
  BBNI: 3270,
  BRIS: 2140,
  ADRO: 2330,
  ITMG: 24475,
  PTBA: 2970,
  PGAS: 1480,
  MEDC: 1125,
  AKRA: 1190,
  AMMN: 3680,
  ANTM: 1450,
  INCO: 3420,
  ICBP: 6125,
  INDF: 5950,
  MYOR: 2280,
  CMRY: 4650,
  AMRT: 2480,
  KLBF: 755,
  SIDO: 318,
  MIKA: 2390,
  TLKM: 1995,
  ISAT: 1820,
  JSMR: 3960,
  ASII: 4920,
  UNTR: 23525,
  UNVR: 1445
};

const HSC_MANUAL_STORAGE_KEY = 'nostradamus_hsc_manual_overrides_v1';

/**
 * Pre-seeded watchlist of IDX tickers with High Speculative Concentration / Cornered / Gorengan profile
 * Explicitly includes TRUK, ROCK, and similar high-anomaly third-liner tickers.
 */
export const PRE_SEEDED_HSC_TICKERS = new Set<string>([
  'TRUK',
  'ROCK',
  'MINA',
  'REAL',
  'KARW',
  'TCPI',
  'APEX',
  'ZINC',
  'HKMU',
  'TRAM',
  'MYRX',
  'IIKP',
  'HOME',
  'RIMO',
  'PCAR',
  'BEBS',
  'WMUU',
  'KPIG',
  'STRK',
  'TGUK',
  'NASI',
  'BOSS',
  'FIRE',
  'PURE',
  'ENVY',
  'FORU',
  'PACK',
  'FUTR',
  'CBRE',
  'BAJA',
  'JSKY',
  'POSA',
  'NATO',
  'TAMA',
  'KOTA'
]);

export interface HscManualOverrides {
  added: string[];
  removed: string[];
}

export function getHscManualOverrides(): HscManualOverrides {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { added: [], removed: [] };
    }
    const raw = window.localStorage.getItem(HSC_MANUAL_STORAGE_KEY);
    if (!raw) return { added: [], removed: [] };
    const parsed = JSON.parse(raw);
    return {
      added: Array.isArray(parsed?.added)
        ? parsed.added.map((t: string) => String(t).trim().toUpperCase()).filter(Boolean)
        : [],
      removed: Array.isArray(parsed?.removed)
        ? parsed.removed.map((t: string) => String(t).trim().toUpperCase()).filter(Boolean)
        : []
    };
  } catch {
    return { added: [], removed: [] };
  }
}

export function saveHscManualOverrides(overrides: HscManualOverrides): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      HSC_MANUAL_STORAGE_KEY,
      JSON.stringify({
        added: Array.from(new Set(overrides.added)),
        removed: Array.from(new Set(overrides.removed))
      })
    );
  } catch {
    // ignore storage errors
  }
}

export function toggleManualHscTicker(
  ticker: string,
  currentlyFlagged?: boolean
): HscManualOverrides {
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const current = getHscManualOverrides();
  const addedSet = new Set(current.added);
  const removedSet = new Set(current.removed);

  const isCurrentlyHsc =
    currentlyFlagged !== undefined
      ? currentlyFlagged
      : addedSet.has(clean) || (PRE_SEEDED_HSC_TICKERS.has(clean) && !removedSet.has(clean));

  if (isCurrentlyHsc) {
    addedSet.delete(clean);
    removedSet.add(clean);
  } else {
    removedSet.delete(clean);
    addedSet.add(clean);
  }

  const next = {
    added: Array.from(addedSet),
    removed: Array.from(removedSet)
  };
  saveHscManualOverrides(next);
  return next;
}

export function evaluateHscIndication(
  item: RawStockInput,
  dmuValueScore: number,
  divYield: number,
  ocfToNetIncomeRatio: number = 1.0,
  grossProfitabilityToAssets: number = 16.0,
  accrualPenaltyScore: number = 0,
  effectiveModule?: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical'
): {
  isHscFlagged: boolean;
  hscSource: 'MANUAL' | 'KSEI_OFFICIAL' | 'AUTO_QUANT' | 'NONE';
  hscTier: 'HARD_BLOCK' | 'KSEI_DIVIDEND_PENALTY' | 'EARLY_WARNING_SUSPECT' | 'CLEAN';
  hscReason?: string;
  kseiHscConcentrationPct?: number;
  kseiHscIsNew?: boolean;
  kseiHscFootnote?: 'NONE' | 'UNREPORTED_DISTRIBUTION' | 'REPO_TRANSACTION' | 'VOLUNTARY_DELISTING';
  kseiHscScorePenaltyPts?: number;
} {
  const clean = item.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const overrides = getHscManualOverrides();
  const kseiEntry = getKseiHscEntry(clean);

  if (overrides.removed.includes(clean)) {
    return {
      isHscFlagged: false,
      hscSource: 'NONE',
      hscTier: 'CLEAN',
      kseiHscConcentrationPct: kseiEntry?.top10ConcentrationPct,
      kseiHscIsNew: kseiEntry?.isNew,
      kseiHscFootnote: kseiEntry?.footnote,
      kseiHscScorePenaltyPts: 0
    };
  }

  if (overrides.added.includes(clean)) {
    return {
      isHscFlagged: true,
      hscSource: 'MANUAL',
      hscTier: 'HARD_BLOCK',
      hscReason: 'Label Manual HSC oleh Pengguna (Diblokir dari Top Decile Buy)',
      kseiHscConcentrationPct: kseiEntry?.top10ConcentrationPct,
      kseiHscIsNew: kseiEntry?.isNew,
      kseiHscFootnote: kseiEntry?.footnote,
      kseiHscScorePenaltyPts: 1.5
    };
  }

  const isInst = isInstitutionalLiquidCandidate(clean);

  // Lapis 1: Daftar Resmi Evaluasi HSC BEI-KSEI (Peng-HSC-00088/BEI.WAS/11-2026 — 383 Emiten)
  if (kseiEntry) {
    const top10Str = kseiEntry.top10ConcentrationPct.toFixed(3).replace('.', ',');
    const statusStr = kseiEntry.isNew ? 'Baru/New' : 'Eksisting';
    const fnShort = formatKseiFootnoteShortLabel(kseiEntry.footnote);
    const fnSuffix = fnShort ? ` · ${fnShort}` : '';

    // 1. Disqualifying KSEI footnotes (*** Voluntary Delisting or ** Repo) or pre-seeded speculative cornered list
    if (
      kseiEntry.footnote === 'VOLUNTARY_DELISTING' ||
      kseiEntry.footnote === 'REPO_TRANSACTION' ||
      PRE_SEEDED_HSC_TICKERS.has(clean)
    ) {
      return {
        isHscFlagged: true,
        hscSource: 'KSEI_OFFICIAL',
        hscTier: 'HARD_BLOCK',
        hscReason: `HSC Resmi BEI-KSEI (Top-10: ${top10Str}% · ${statusStr}${fnSuffix}) — Blokir Otomatis (${
          kseiEntry.footnote === 'VOLUNTARY_DELISTING'
            ? 'Proses Voluntary Delisting ***'
            : kseiEntry.footnote === 'REPO_TRANSACTION'
            ? 'Anomali Repo Saham **'
            : 'Risiko Spekulatif Cornered'
        })`,
        kseiHscConcentrationPct: kseiEntry.top10ConcentrationPct,
        kseiHscIsNew: kseiEntry.isNew,
        kseiHscFootnote: kseiEntry.footnote,
        kseiHscScorePenaltyPts: 1.5
      };
    }

    // 2. Tier 1A: Saham HSC BEI-KSEI dengan Dividen & Fundamental Kuat -> Penalti Skor Tanpa Blokir Otomatis
    const hasStrongDividendAndQuality =
      (divYield >= 2.0 || (isInst && divYield >= 1.2 && item.roe >= 10.0)) &&
      dmuValueScore >= 5.8 &&
      item.debtToEquity < 2.2 &&
      kseiEntry.top10ConcentrationPct < 99.65;

    if (hasStrongDividendAndQuality) {
      const penaltyPts = Number(
        Math.min(
          0.95,
          0.30 + (Math.max(0, kseiEntry.top10ConcentrationPct - 92.5) / 7.5) * 0.65
        ).toFixed(2)
      );
      return {
        isHscFlagged: false, // Tidak diblokir otomatis karena pembagi dividen & value kuat
        hscSource: 'KSEI_OFFICIAL',
        hscTier: 'KSEI_DIVIDEND_PENALTY',
        hscReason: `HSC Resmi BEI-KSEI (Top-10: ${top10Str}% · ${statusStr}${fnSuffix}) — Penalti Skor -${penaltyPts
          .toFixed(2)
          .replace('.', ',')} Poin Tanpa Blokir (Dividen Kuat ${divYield.toFixed(2).replace('.', ',')}%)`,
        kseiHscConcentrationPct: kseiEntry.top10ConcentrationPct,
        kseiHscIsNew: kseiEntry.isNew,
        kseiHscFootnote: kseiEntry.footnote,
        kseiHscScorePenaltyPts: penaltyPts
      };
    }

    // 3. Tier 1B: Saham HSC BEI-KSEI Non-Dividen / Konsentrasi Ekstrem (>=99.65%) / Fundamental Lemah -> Blokir Otomatis
    return {
      isHscFlagged: true,
      hscSource: 'KSEI_OFFICIAL',
      hscTier: 'HARD_BLOCK',
      hscReason: `HSC Resmi BEI-KSEI (Top-10: ${top10Str}% · ${statusStr}${fnSuffix}) — Diblokir Otomatis (Free Float Publik Maks ${kseiEntry.impliedPublicFloatMaxPct
        .toFixed(2)
        .replace('.', ',')}% Tanpa Dukungan Dividen Kuat)`,
      kseiHscConcentrationPct: kseiEntry.top10ConcentrationPct,
      kseiHscIsNew: kseiEntry.isNew,
      kseiHscFootnote: kseiEntry.footnote,
      kseiHscScorePenaltyPts: 1.25
    };
  }

  // Lapis 2: Radar Deteksi Dini / Suspect & Early Warning HSC Kuantitatif (Belum Rilis Resmi BEI-KSEI)
  if (PRE_SEEDED_HSC_TICKERS.has(clean)) {
    return {
      isHscFlagged: true,
      hscSource: 'AUTO_QUANT',
      hscTier: 'EARLY_WARNING_SUSPECT',
      hscReason:
        'Suspect HSC (Early Warning Quant): Watchlist Anomali Pergerakan Cornered & Spekulatif Tinggi (Pra-Rilis BEI)',
      kseiHscScorePenaltyPts: 1.35
    };
  }

  if (!isInst) {
    const minSuspectOcfThreshold = effectiveModule === 'Capex_Aggressor' ? 0.50 : 0.68;
    // Signal 1: Speculative price spike / ARA anomaly without cashflow (OCF/NI) or dividend backing
    if (
      (Math.abs(item.change1D) >= 7.5 || item.return30D >= 18.0) &&
      (dmuValueScore < 6.4 || item.roe < 10.5 || ocfToNetIncomeRatio <= minSuspectOcfThreshold) &&
      divYield < 1.5
    ) {
      return {
        isHscFlagged: true,
        hscSource: 'AUTO_QUANT',
        hscTier: 'EARLY_WARNING_SUSPECT',
        hscReason: `Suspect HSC (Early Warning Quant): Lonjakan harga spekulatif (1D ${
          item.change1D >= 0 ? '+' : ''
        }${item.change1D.toFixed(1)}% / 30D ${
          item.return30D >= 0 ? '+' : ''
        }${item.return30D.toFixed(1)}%) tanpa dukungan Kas OCF/NI (${ocfToNetIncomeRatio.toFixed(2)}x) & Dividen`,
        kseiHscScorePenaltyPts: 1.25
      };
    }

    // Signal 2: Extreme annualized volatility (>38%) with weak Novy-Marx GP/A or Value score
    if (
      item.volatilityAnn >= 38.0 &&
      (dmuValueScore < 6.2 || grossProfitabilityToAssets < 14.0) &&
      divYield < 1.5
    ) {
      return {
        isHscFlagged: true,
        hscSource: 'AUTO_QUANT',
        hscTier: 'EARLY_WARNING_SUSPECT',
        hscReason: `Suspect HSC (Early Warning Quant): Volatilitas ekstrem (${item.volatilityAnn.toFixed(
          1
        )}%) dengan GP/A rendah (${grossProfitabilityToAssets.toFixed(1)}%) — Indikasi Cornered Pra-Rilis BEI`,
        kseiHscScorePenaltyPts: 1.2
      };
    }

    // Signal 3: Weak fundamental third-liner with low ROE, high leverage, or high accrual manipulation
    if (
      (item.roe < 8.0 && item.debtToEquity >= 1.1 && divYield <= 0) ||
      (dmuValueScore < 5.0 && divYield <= 0) ||
      (accrualPenaltyScore >= 1.35 && divYield <= 0)
    ) {
      return {
        isHscFlagged: true,
        hscSource: 'AUTO_QUANT',
        hscTier: 'EARLY_WARNING_SUSPECT',
        hscReason:
          'Suspect HSC (Early Warning Quant): Kerapuhan Neraca / Akrual Tinggi Non-Institusional Tanpa Dividen',
        kseiHscScorePenaltyPts: 1.15
      };
    }
  }

  return {
    isHscFlagged: false,
    hscSource: 'NONE',
    hscTier: 'CLEAN',
    kseiHscScorePenaltyPts: 0
  };
}

/**
 * Novy-Marx (2013) Gross Profitability to Assets (GP/A = Gross Profit / Total Assets)
 * & Asness, Frazzini, Pedersen (2019) Contextual Quality Minus Junk (QMJ) Accrual Penalty Calculator.
 * Context-aware based on `effective_module`:
 * - Rule A (Strict: 'Compounder' | 'Pure_Cyclical'): Healthy OCF/NI > 0.80x to 1.00x.
 * - Rule B (Tolerant: 'Capex_Aggressor'): Healthy OCF/NI > 0.50x (zero penalty above 0.50x).
 */
export function computeGrossProfitabilityAndAccruals(
  item: RawStockInput,
  divYield: number = 0,
  effectiveModule?: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical'
): {
  grossProfitabilityToAssets: number;
  ocfToNetIncomeRatio: number;
  accrualRatioToAssets: number;
  accrualPenaltyScore: number;
  effectiveModule: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  ocfHealthyThreshold: number;
} {
  const roe = Number(item.roe || 0);
  const der = Math.max(0.05, Number(item.debtToEquity || 0.4));
  const opMargin = Number(item.operatingMargin || 12);
  const clean = item.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const isInst = isInstitutionalLiquidCandidate(clean);

  const resolvedEffectiveModule: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical' =
    effectiveModule ?? ValuationEngine.resolveRoute(item as unknown as StockMetrics).applied_module;

  // Unlevered Return on Assets (DuPont ROA = ROE / (1 + DER), adjusted for financial vs non-financial asset structure)
  const effectiveAssetLeverage =
    item.sector === 'Financials' ? Math.max(2.2, 1 + der * 3.8) : Math.max(1.08, 1 + der * 0.85);
  const roaPct = roe / effectiveAssetLeverage;

  // Sector-calibrated Gross-to-Net & Asset Turnover multiplier for GP/A (Laba Kotor / Total Aset)
  const sectorAssetTurnover =
    item.sector === 'Consumer Non-Cyclicals' || item.sector === 'Consumer Cyclicals'
      ? 1.38
      : item.sector === 'Healthcare' || item.sector === 'Energy'
      ? 1.18
      : item.sector === 'Industrials' || item.sector === 'Basic Materials'
      ? 1.05
      : item.sector === 'Financials'
      ? 0.68
      : 0.92;

  const grossMarginEstPct =
    item.sector === 'Financials'
      ? Math.max(12, Math.min(68, opMargin * 1.15))
      : Math.max(8, Math.min(65, opMargin * 1.48 + 4.5));

  const computedGpa =
    typeof item.grossProfitabilityToAssets === 'number' &&
    Number.isFinite(item.grossProfitabilityToAssets) &&
    item.grossProfitabilityToAssets > 0
      ? item.grossProfitabilityToAssets
      : Math.max(
          1.2,
          Math.min(
            52.0,
            0.55 * ((grossMarginEstPct * sectorAssetTurnover) / 1.8) + 0.45 * Math.max(0, roaPct * 1.55)
          )
        );

  const grossProfitabilityToAssets = Number(computedGpa.toFixed(1));

  // Cashflow Conversion Ratio (Operating Cash Flow / Net Income) & Accruals ((NI - OCF) / Assets)
  let ocfToNetIncomeRatio =
    typeof item.ocfToNetIncomeRatio === 'number' && Number.isFinite(item.ocfToNetIncomeRatio)
      ? item.ocfToNetIncomeRatio
      : 1.08;

  if (typeof item.ocfToNetIncomeRatio !== 'number') {
    const baseConversion =
      divYield >= 4.0
        ? 1.24
        : divYield > 0
        ? 1.14
        : isInst && der <= 0.8
        ? 1.04
        : der > 1.35
        ? 0.62
        : !isInst && divYield <= 0 && roe > 14
        ? 0.54 // Suspect high accounting profit without dividend/cash backing
        : 0.88;
    const marginStabilityAdj = opMargin >= 18 ? 0.08 : opMargin < 7 ? -0.22 : 0;
    const leverageDrag = der > 1.1 ? -Math.min(0.45, (der - 1.0) * 0.28) : 0.04;
    ocfToNetIncomeRatio = Number(
      Math.max(-0.45, Math.min(1.65, baseConversion + marginStabilityAdj + leverageDrag)).toFixed(2)
    );
  }

  // Accrual Ratio to Assets (%) = (Net Income - OCF) / Total Assets = ROA * (1 - OCF/NI)
  const rawAccrualToAssets =
    typeof item.accrualRatioToAssets === 'number' && Number.isFinite(item.accrualRatioToAssets)
      ? item.accrualRatioToAssets
      : roaPct > 0
      ? roaPct * (1 - ocfToNetIncomeRatio)
      : Math.max(0, (1 - ocfToNetIncomeRatio) * 4.5);
  const accrualRatioToAssets = Number(rawAccrualToAssets.toFixed(2));

  // Contextual Anti-Junk Penalty (Rule A Strict >0.80x vs Rule B Tolerant >0.50x):
  const contextualPolicy = resolveContextualOcfNiPolicy({
    effectiveModule: resolvedEffectiveModule,
    ocfToNetIncomeRatio,
    accrualRatioToAssets,
    roePct: roe
  });
  const accrualPenaltyScore = contextualPolicy.accrualPenaltyScore;

  return {
    grossProfitabilityToAssets,
    ocfToNetIncomeRatio,
    accrualRatioToAssets,
    accrualPenaltyScore,
    effectiveModule: resolvedEffectiveModule,
    ocfHealthyThreshold: contextualPolicy.ocfHealthyThreshold
  };
}

export function computeDeMiguelFourFactors(item: RawStockInput): {
  dmuMomScore: number;
  dmuLowVolScore: number;
  dmuValueScore: number;
  dmuSizeScore: number;
  dmuCompositeScore: number;
  grossProfitabilityToAssets: number;
  ocfToNetIncomeRatio: number;
  accrualRatioToAssets: number;
  accrualPenaltyScore: number;
  effectiveModule: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  ocfHealthyThreshold: number;
  isHscFlagged: boolean;
  hscSource: 'MANUAL' | 'KSEI_OFFICIAL' | 'AUTO_QUANT' | 'NONE';
  hscTier: 'HARD_BLOCK' | 'KSEI_DIVIDEND_PENALTY' | 'EARLY_WARNING_SUSPECT' | 'CLEAN';
  hscReason?: string;
  kseiHscConcentrationPct?: number;
  kseiHscIsNew?: boolean;
  kseiHscFootnote?: 'NONE' | 'UNREPORTED_DISTRIBUTION' | 'REPO_TRANSACTION' | 'VOLUNTARY_DELISTING';
  kseiHscScorePenaltyPts?: number;
} {
  const isLiquid = item.isLiquid !== false && item.lastPrice >= 68;
  const divYield =
    item.lastPrice > 0
      ? getEmitenDividendYield(item.ticker, item.lastPrice) || item.dividendYieldPct || 0
      : item.dividendYieldPct ?? getEmitenDividendYield(item.ticker);

  const routeInfo = ValuationEngine.resolveRoute(item as unknown as StockMetrics);
  const effectiveModule = routeInfo.applied_module;

  const gpAccrual = computeGrossProfitabilityAndAccruals(item, divYield, effectiveModule);
  const {
    grossProfitabilityToAssets,
    ocfToNetIncomeRatio,
    accrualRatioToAssets,
    accrualPenaltyScore,
    ocfHealthyThreshold
  } = gpAccrual;

  // If stock is illiquid, stagnant/suspended, gocap (< Rp 68), or unverified on Yahoo Finance:
  // Penalize Low-Vol, Size/Liq, and Composite Score so it NEVER masquerades as a Low-Volatility leader!
  if (!isLiquid) {
    const gpaComp = Math.max(0, Math.min(10, (grossProfitabilityToAssets / 26) * 9.4));
    const unleveredRoa = Math.max(0, item.roe / Math.max(1, 1 + item.debtToEquity * 0.75));
    const roaComp = Math.max(0, Math.min(10, (unleveredRoa / 16) * 9.0));
    const deComp = Math.max(1, Math.min(10, 10 - (item.debtToEquity / 2.2) * 8));
    const dmuValueScore = Number(
      Math.max(
        1.0,
        Math.min(5.5, (0.50 * gpaComp + 0.25 * roaComp + 0.25 * deComp) * 0.65 - accrualPenaltyScore * 0.5)
      ).toFixed(1)
    );
    const hscEval = evaluateHscIndication(
      item,
      dmuValueScore,
      divYield,
      ocfToNetIncomeRatio,
      grossProfitabilityToAssets,
      accrualPenaltyScore,
      effectiveModule
    );
    return {
      dmuLowVolScore: 1.5,
      dmuMomScore: 1.8,
      dmuValueScore,
      dmuSizeScore: 1.4,
      dmuCompositeScore: Number(Math.min(2.65, 0.25 * dmuValueScore + 1.4).toFixed(2)),
      grossProfitabilityToAssets,
      ocfToNetIncomeRatio,
      accrualRatioToAssets,
      accrualPenaltyScore,
      effectiveModule,
      ocfHealthyThreshold,
      ...hscEval
    };
  }

  // 1. Live Low-Volatility & Beta Stability Score (Sensitive to live 30D realized vol & 1Y beta)
  const volSafety = Math.max(1, Math.min(10, 10 - (item.volatilityAnn - 12.5) * 0.27));
  const betaSafety = Math.max(1, Math.min(10, 10 - (item.beta1Y - 0.45) * 5.6));
  const drawdownStability = item.return30D >= -2.5 ? 0.45 : item.return30D < -8 ? -0.45 : 0;
  const dmuLowVolScore = Number(
    Math.max(1.0, Math.min(9.9, 0.58 * volSafety + 0.42 * betaSafety + drawdownStability)).toFixed(1)
  );

  // 2. Live Price Action & Risk-Adjusted Momentum Score (Driven by live 30D return & 1D breakout)
  const riskAdjTrend =
    ((item.return30D + item.change1D * 1.8) / Math.max(12, item.volatilityAnn)) * 2.4;
  const relMomRaw = 5.4 + item.return30D * 0.38 + item.change1D * 0.48 + riskAdjTrend;
  const dmuMomScore = Number(Math.max(1.0, Math.min(9.9, relMomRaw)).toFixed(1));

  // 3. Gross Profitability (Novy-Marx GP/A) & Anti-Junk QMJ Value Score (Asness et al. 2019)
  const anchorPrice = BASELINE_PRICE_ANCHORS[item.ticker] || item.lastPrice;
  const liveValuationMultiplier =
    item.lastPrice > 0
      ? Math.max(0.84, Math.min(1.24, anchorPrice / item.lastPrice))
      : 1.0;

  const gpaComp = Math.max(0, Math.min(10, (Math.min(38, grossProfitabilityToAssets) / 23.5) * 9.6));
  const unleveredRoa = Math.max(0, item.roe / Math.max(1, 1 + item.debtToEquity * 0.7));
  const roaComp = Math.max(0, Math.min(10, (Math.min(24, unleveredRoa) / 14.5) * 9.4));
  const deComp = Math.max(1, Math.min(10, 10 - (item.debtToEquity / 2.1) * 8));
  const divBonus = divYield > 0 ? Math.min(1.35, divYield * 0.18) : 0;
  const ocfQualityBonus =
    effectiveModule === 'Capex_Aggressor'
      ? ocfToNetIncomeRatio >= 0.70
        ? 0.35
        : ocfToNetIncomeRatio > 0.50
        ? 0.18
        : 0
      : ocfToNetIncomeRatio >= 1.1
      ? 0.35
      : 0;

  const rawValue =
    (0.50 * gpaComp + 0.25 * roaComp + 0.25 * deComp) * liveValuationMultiplier +
    divBonus +
    ocfQualityBonus -
    accrualPenaltyScore;
  const dmuValueScore = Number(Math.max(1.0, Math.min(9.9, rawValue)).toFixed(1));

  // Evaluate 3-Tier HSC (Official BEI-KSEI Registry + Calibrated Early Warning Suspect Quant)
  const hscEval = evaluateHscIndication(
    item,
    dmuValueScore,
    divYield,
    ocfToNetIncomeRatio,
    grossProfitabilityToAssets,
    accrualPenaltyScore,
    effectiveModule
  );

  // 4. Capital Efficiency & Institutional Liquidity Score (incorporating KSEI HSC free-float penalty)
  const isInst = isInstitutionalLiquidCandidate(item.ticker);
  const instLiqBonus = isInst ? 0.75 : 0;
  const kseiSizeDrag =
    hscEval.hscTier === 'KSEI_DIVIDEND_PENALTY'
      ? (hscEval.kseiHscScorePenaltyPts || 0.45)
      : hscEval.isHscFlagged
      ? 1.4
      : 0;
  const dmuSizeScore = Number(
    Math.max(
      1.0,
      Math.min(
        9.9,
        0.48 * deComp +
          0.34 * gpaComp +
          (item.change1D >= 0 ? 0.5 : 0.1) +
          instLiqBonus -
          accrualPenaltyScore * 0.35 -
          kseiSizeDrag
      )
    ).toFixed(1)
  );

  // Value-Gated Momentum Cap: Non-institutional stocks with weak Value cannot use sudden price spikes to game composite rank
  const effectiveMomScore =
    !isInst && dmuValueScore < 6.2 && divYield <= 0
      ? Math.min(dmuMomScore, 5.6)
      : dmuMomScore;

  // Overall 4-Factor Composite Score (Value/GP-A Prioritized: 35% Value/GP-A, 28% Low-Vol, 22% Momentum, 15% Size/Liquidity)
  const kseiCompositeDrag =
    hscEval.hscTier === 'KSEI_DIVIDEND_PENALTY'
      ? (hscEval.kseiHscScorePenaltyPts || 0.45) * 0.42
      : 0;
  const rawComposite =
    0.35 * dmuValueScore +
    0.28 * dmuLowVolScore +
    0.22 * effectiveMomScore +
    0.15 * dmuSizeScore -
    kseiCompositeDrag;

  const dmuCompositeScore = hscEval.isHscFlagged
    ? Number(Math.max(1.2, Math.min(3.45, rawComposite * 0.52)).toFixed(2))
    : Number(Math.max(1.0, Math.min(9.9, rawComposite)).toFixed(2));

  return {
    dmuMomScore,
    dmuLowVolScore,
    dmuValueScore,
    dmuSizeScore,
    dmuCompositeScore,
    grossProfitabilityToAssets,
    ocfToNetIncomeRatio,
    accrualRatioToAssets,
    accrualPenaltyScore,
    effectiveModule,
    ocfHealthyThreshold,
    ...hscEval
  };
}

export function computeSleeveSpecificScore(
  stock: StockMetrics,
  basket: 'DEFENSIVE' | 'AGGRESSIVE',
  mode: BasketSelectionMode = 'LIVE_FACTOR_LEADER'
): number {
  if (
    stock.isLiquid === false ||
    stock.lastPrice < 68 ||
    stock.isLiveFetched === false ||
    stock.isHscFlagged === true
  ) {
    return -99;
  }

  const divYield = stock.dividendYieldPct ?? 0;
  const divBoost = divYield > 0 ? Math.min(1.35, divYield * 0.18) : 0;
  const instBoost = isInstitutionalLiquidCandidate(stock.ticker) ? 0.65 : 0;
  const gpaBoost = Math.min(0.85, (stock.grossProfitabilityToAssets || 15) / 32);
  const accrualDrag = (stock.accrualPenaltyScore || 0) * 0.45;

  if (basket === 'DEFENSIVE') {
    if (mode === 'TOP_GAINERS_MOMENTUM') {
      return Number(
        (
          0.42 * stock.dmuLowVolScore +
          0.35 * stock.dmuValueScore +
          0.23 * stock.dmuMomScore +
          stock.change1D * 0.65 +
          stock.return30D * 0.20 +
          divBoost +
          instBoost +
          gpaBoost -
          accrualDrag
        ).toFixed(2)
      );
    }
    // Default Defensive Core: 45% Low-Vol + 38% GP/A Value + 17% Trend Stability + Dividend Yield Priority
    return Number(
      (
        0.45 * stock.dmuLowVolScore +
        0.38 * stock.dmuValueScore +
        0.17 * stock.dmuMomScore +
        stock.change1D * 0.15 +
        divBoost +
        instBoost +
        gpaBoost -
        accrualDrag
      ).toFixed(2)
    );
  }

  // Keranjang 2 (AGGRESSIVE / MOMENTUM ALPHA SLEEVE):
  if (mode === 'TOP_GAINERS_MOMENTUM') {
    return Number(
      (
        0.40 * stock.dmuMomScore +
        0.25 * stock.dmuValueScore +
        stock.change1D * 1.15 +
        stock.return30D * 0.38 +
        0.15 * stock.dmuSizeScore +
        instBoost * 0.7 +
        gpaBoost -
        accrualDrag
      ).toFixed(2)
    );
  }

  // Default Momentum Alpha: 45% Live Price Action + 30% GP/A Value Quality + 25% Size
  const liveSurgeComponent = Math.max(
    1,
    Math.min(10, 5.5 + stock.change1D * 0.75 + stock.return30D * 0.30)
  );
  return Number(
    (
      0.32 * stock.dmuMomScore +
      0.20 * liveSurgeComponent +
      0.28 * stock.dmuValueScore +
      0.20 * stock.dmuSizeScore +
      instBoost * 0.7 +
      gpaBoost -
      accrualDrag
    ).toFixed(2)
  );
}

export function getBasketSelectionReason(
  stock: StockMetrics,
  basket: 'DEFENSIVE' | 'AGGRESSIVE',
  mode: BasketSelectionMode = 'LIVE_FACTOR_LEADER'
): string {
  const c1d = `${stock.change1D >= 0 ? '+' : ''}${stock.change1D.toFixed(2)}%`;
  const r30 = `${stock.return30D >= 0 ? '+' : ''}${stock.return30D.toFixed(2)}%`;
  const gpaPart = `GP/A ${(stock.grossProfitabilityToAssets ?? 18).toFixed(1)}%`;
  const divPart =
    (stock.dividendYieldPct ?? 0) > 0
      ? ` · DIV ${(stock.dividendYieldPct ?? 0).toFixed(2)}%`
      : '';

  if (basket === 'DEFENSIVE') {
    if (mode === 'TOP_GAINERS_MOMENTUM') {
      return `1/β Core: 1D ${c1d} · ${gpaPart} · β ${stock.beta1Y.toFixed(2)}x${divPart}`;
    }
    return `${gpaPart} · Low-Vol ${stock.dmuLowVolScore.toFixed(1)} · 1/β ${(1 / Math.max(0.35, stock.beta1Y)).toFixed(2)}x (β ${stock.beta1Y.toFixed(2)})${divPart}`;
  }

  if (mode === 'TOP_GAINERS_MOMENTUM') {
    return `Barbell Alpha: 1D ${c1d} · 30D ${r30} · ${gpaPart} · β ${stock.beta1Y.toFixed(2)}x${divPart}`;
  }
  return `${gpaPart} · Mom ${stock.dmuMomScore.toFixed(1)} · 1/β Sizing (β ${stock.beta1Y.toFixed(2)}x) · 1D ${c1d}${divPart}`;
}

export function classifyBarbellRole(beta1Y: number, dmuCompositeScore: number): BarbellRole {
  if (dmuCompositeScore >= 6.6 && beta1Y <= 0.95) {
    return 'DEFENSIVE_QUALITY';
  }
  if (dmuCompositeScore >= 6.0 && beta1Y > 0.95) {
    return 'AGGRESSIVE_GROWTH';
  }
  if (dmuCompositeScore < 4.8) {
    return 'AVOID_JUNK';
  }
  return 'NEUTRAL_HOLD';
}

export function enrichStockMetrics(item: RawStockInput): StockMetrics {
  const calibratedDiv =
    item.lastPrice > 0
      ? getEmitenDividendYield(item.ticker, item.lastPrice)
      : getEmitenDividendYield(item.ticker);
  const dividendYieldPct = calibratedDiv > 0 ? calibratedDiv : item.dividendYieldPct ?? 0;
  const isLiquid =
    item.isLiquid !== undefined
      ? item.isLiquid
      : item.lastPrice >= 68 && item.isLiveFetched !== false;

  const resolvedPrevClose =
    typeof item.previousClose === 'number' &&
    Number.isFinite(item.previousClose) &&
    item.previousClose > 0
      ? Math.round(item.previousClose)
      : item.lastPrice > 0 && item.change1D !== 0 && item.change1D > -99
      ? roundToIdxTick(item.lastPrice / (1 + item.change1D / 100))
      : item.lastPrice > 0
      ? Math.round(item.lastPrice)
      : undefined;

  // Intercept Corporate Actions (Split, Buyback) & Forward Annualized ROE before factor scoring
  const rawAnchor = resolveFundamentalAnchorPrice(item.ticker, Math.max(50, item.lastPrice || 50));
  const intercepted = interceptCorporateActionAndAnnualize({
    stock: {
      ...(item as unknown as StockMetrics),
      isLiquid,
      dividendYieldPct
    },
    rawAnchorPriceIdr: rawAnchor,
    rawAdtv20dIdr: item.adtv20dIdr || 1_500_000_000
  });

  const normalizedInput: RawStockInput = {
    ...item,
    roe: intercepted.forwardAnnualizedRoePct,
    trailingRoePct: intercepted.trailingRoePct,
    forwardAnnualizedRoePct: intercepted.forwardAnnualizedRoePct,
    earningsGrowthYoYPct: intercepted.earningsGrowthYoYPct,
    hasActiveBuyback: intercepted.hasActiveBuyback,
    buybackNominalIdr: intercepted.buybackNominalIdr,
    liveMarketCapIdr: intercepted.liveMarketCapIdr,
    dynamicBuybackYieldPct: intercepted.dynamicBuybackYieldPct,
    splitRatioDivisor: intercepted.splitRatioDivisor,
    isCatalystActive: intercepted.isCatalystActive,
    catalystBadgeLabel: intercepted.catalystBadgeLabel,
    previousClose: resolvedPrevClose,
    isLiquid,
    dividendYieldPct: Number((dividendYieldPct + intercepted.dynamicBuybackYieldPct * 0.5).toFixed(2))
  };

  const factors = computeDeMiguelFourFactors(normalizedInput);
  const isCleanAndLiquid = isLiquid && !factors.isHscFlagged;

  // Beta-Weighted Propensity (Qian 2005 Risk Parity & Taleb 2012 Barbell 1/Beta Sizing)
  const effectiveBeta = Math.max(0.35, Number(item.beta1Y) || 1.0);
  const betaWeightedPropensity = isCleanAndLiquid
    ? Number((factors.dmuCompositeScore / effectiveBeta).toFixed(2))
    : 0.1;

  const hrpPropensity = isCleanAndLiquid
    ? Number(((factors.dmuCompositeScore / effectiveBeta) * 1.25).toFixed(2))
    : 0.1;
  const role: BarbellRole = isCleanAndLiquid
    ? classifyBarbellRole(item.beta1Y, factors.dmuCompositeScore)
    : 'AVOID_JUNK';

  const dmuRankPct = !isCleanAndLiquid
    ? 95
    : factors.dmuCompositeScore >= 7.4 && factors.dmuValueScore >= 6.0
    ? 12
    : factors.dmuCompositeScore >= 6.4
    ? 32
    : 72;
  const dmuZone: DeMiguelBufferZone = !isCleanAndLiquid
    ? 'ROTATE_OUT'
    : dmuRankPct <= 20 && factors.dmuValueScore >= 6.0
    ? 'TOP_DECILE_BUY'
    : dmuRankPct <= 40
    ? 'BUFFER_HOLD_40'
    : 'ROTATE_OUT';

  return {
    ...normalizedInput,
    dividendYieldPct,
    ...factors,
    isCatalystActive: !factors.isHscFlagged && intercepted.isCatalystActive,
    catalystBadgeLabel: !factors.isHscFlagged ? intercepted.catalystBadgeLabel : undefined,
    betaWeightedPropensity,
    dmuRankPct,
    dmuZone,
    qmjScore: Number(Math.max(1.0, factors.dmuCompositeScore - factors.accrualPenaltyScore * 0.25).toFixed(1)),
    babScore: factors.dmuLowVolScore,
    hrpPropensity,
    role
  };
}

export function rankUniverseWithBuffer(
  list: StockMetrics[],
  rebalanceBufferPct: number = 40
): StockMetrics[] {
  // Re-evaluate HSC & 4-Factor scores so any manual HSC toggle immediately reflects in rankings
  const refreshedList = list.map((s) => enrichStockMetrics(s));

  const sorted = [...refreshedList].sort((a, b) => {
    const aClean = a.isLiquid !== false && a.lastPrice >= 68 && !a.isHscFlagged ? 1 : 0;
    const bClean = b.isLiquid !== false && b.lastPrice >= 68 && !b.isHscFlagged ? 1 : 0;
    if (aClean !== bClean) return bClean - aClean;
    return b.dmuCompositeScore - a.dmuCompositeScore;
  });
  const n = Math.max(1, sorted.length);
  const rankMap = new Map<string, { rankPct: number; zone: DeMiguelBufferZone }>();

  sorted.forEach((s, idx) => {
    const rawRankPct = Math.round(((idx + 1) / n) * 100);
    const topCutoff = Math.min(22, Math.round(rebalanceBufferPct * 0.5));
    const isStockLiquid = s.isLiquid !== false && s.lastPrice >= 68;
    const isHsc = Boolean(s.isHscFlagged);
    const rankPct = !isStockLiquid || isHsc ? Math.max(88, rawRankPct) : rawRankPct;

    // Top Decile Buy strictly requires non-HSC, liquid stock AND strong Value score (dmuValueScore >= 6.0)
    const zone: DeMiguelBufferZone =
      !isStockLiquid || isHsc
        ? 'ROTATE_OUT'
        : rankPct <= topCutoff && s.dmuValueScore >= 6.0
        ? 'TOP_DECILE_BUY'
        : rankPct <= rebalanceBufferPct
        ? 'BUFFER_HOLD_40'
        : 'ROTATE_OUT';
    rankMap.set(s.ticker, { rankPct, zone });
  });

  return refreshedList.map((s) => {
    const r = rankMap.get(s.ticker);
    if (!r) return s;
    return {
      ...s,
      dmuRankPct: r.rankPct,
      dmuZone: r.zone
    };
  });
}

/**
 * Official BEI / IDX Price Tick Rounding (Fraksi Harga Saham BEI):
 * - < Rp 200        -> tick Rp 1
 * - Rp 200 – 499    -> tick Rp 2
 * - Rp 500 – 1.999  -> tick Rp 5
 * - Rp 2.000 – 4.999-> tick Rp 10
 * - >= Rp 5.000     -> tick Rp 25
 */
export function roundToIdxTick(rawPrice: number): number {
  const safe = Math.max(50, Math.round(Number(rawPrice) || 50));
  if (safe < 200) return safe;
  if (safe < 500) return Math.round(safe / 2) * 2;
  if (safe < 2000) return Math.round(safe / 5) * 5;
  if (safe < 5000) return Math.round(safe / 10) * 10;
  return Math.round(safe / 25) * 25;
}

/**
 * 3-Year Historical Average Dividend Payout Ratio (DPR %) Map for IDX Dividend Payers
 */
const HISTORICAL_3Y_DPR_MAP: Record<string, number> = {
  ARNA: 70.0,
  ITMG: 72.0,
  PTBA: 75.0,
  ADRO: 65.0,
  BSSR: 78.0,
  MBAP: 74.0,
  GEMS: 76.0,
  UNTR: 60.0,
  ASII: 55.0,
  BBCA: 62.0,
  BBRI: 80.0,
  BMRI: 60.0,
  BBNI: 50.0,
  BBTN: 25.0,
  BRIS: 25.0,
  BJBR: 65.0,
  BJTM: 66.0,
  BNGA: 60.0,
  BDMN: 45.0,
  NISP: 48.0,
  BTPS: 52.0,
  TLKM: 72.0,
  ISAT: 55.0,
  EXCL: 50.0,
  MTEL: 70.0,
  TOWR: 45.0,
  TBIG: 42.0,
  SIDO: 85.0,
  KLBF: 52.0,
  TSPC: 60.0,
  DVLA: 58.0,
  MERK: 68.0,
  ICBP: 48.0,
  INDF: 45.0,
  MYOR: 42.0,
  ULTJ: 35.0,
  ROTI: 80.0,
  DLTA: 88.0,
  MLBI: 86.0,
  TAPG: 75.0,
  LSIP: 45.0,
  AALI: 48.0,
  SSMS: 55.0,
  TOTL: 78.0,
  MARK: 72.0,
  SMSM: 68.0,
  MPMX: 82.0,
  ACES: 65.0,
  AUTO: 52.0,
  DRMA: 48.0,
  SPTO: 70.0,
  TOTO: 65.0,
  ASGR: 72.0,
  DMAS: 88.0,
  POWR: 80.0,
  IPCC: 75.0,
  IPCM: 72.0,
  NRCA: 68.0,
  PBSA: 70.0,
  MTDL: 45.0,
  MSTI: 65.0,
  ASSA: 50.0,
  BIRD: 65.0
};

/**
 * Calibrated Institutional 20-Day Average Daily Trading Value (ADTV 20D in IDR)
 * Used when raw exchange 20D volume is not present on the quote payload.
 */
const CALIBRATED_ADTV_20D_IDR_MAP: Record<string, number> = {
  BBCA: 685_000_000_000,
  BBRI: 740_000_000_000,
  BMRI: 620_000_000_000,
  BBNI: 295_000_000_000,
  TLKM: 340_000_000_000,
  ASII: 285_000_000_000,
  AMMN: 260_000_000_000,
  BREN: 240_000_000_000,
  TPIA: 185_000_000_000,
  ADRO: 210_000_000_000,
  UNTR: 145_000_000_000,
  BRIS: 135_000_000_000,
  GOTO: 165_000_000_000,
  ANTM: 125_000_000_000,
  MDKA: 115_000_000_000,
  PGAS: 95_000_000_000,
  PTBA: 82_000_000_000,
  ITMG: 68_000_000_000,
  INDF: 74_000_000_000,
  ICBP: 66_000_000_000,
  KLBF: 62_000_000_000,
  MEDC: 72_000_000_000,
  AKRA: 54_000_000_000,
  INCO: 58_000_000_000,
  INKP: 52_000_000_000,
  CPIN: 48_000_000_000,
  JPFA: 36_000_000_000,
  MAPI: 42_000_000_000,
  ACES: 32_000_000_000,
  CTRA: 38_000_000_000,
  BSDE: 34_000_000_000,
  PWON: 29_000_000_000,
  SMRA: 27_000_000_000,
  SIDO: 24_000_000_000,
  MPMX: 6_800_000_000,
  ARNA: 4_850_000_000,
  TOTL: 5_400_000_000,
  SMSM: 7_900_000_000,
  TAPG: 14_500_000_000,
  BNGA: 16_200_000_000,
  NISP: 11_800_000_000,
  BJBR: 8_400_000_000,
  BJTM: 7_600_000_000,
  DMAS: 9_200_000_000,
  SPTO: 2_800_000_000,
  MARK: 3_600_000_000
};

/**
 * Estimates or retrieves the 20-Day Average Daily Trading Value (ADTV 20D in IDR).
 */
export function estimateEmitenAdtv20dIdr(stock: StockMetrics): number {
  if (typeof stock.adtv20dIdr === 'number' && Number.isFinite(stock.adtv20dIdr) && stock.adtv20dIdr > 0) {
    return Math.round(stock.adtv20dIdr);
  }
  const clean = stock.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  if (CALIBRATED_ADTV_20D_IDR_MAP[clean]) {
    return CALIBRATED_ADTV_20D_IDR_MAP[clean];
  }
  if (stock.isLiquid === false || stock.lastPrice < 68) {
    return 180_000_000; // Rp 180 Juta/hari for illiquid/gocap
  }
  const isInst = isInstitutionalLiquidCandidate(clean);
  const sizeFactor = Math.max(1.5, stock.dmuSizeScore || 4.5);
  const baseAdtv = isInst
    ? Math.round(sizeFactor * 3_200_000_000)
    : Math.round(sizeFactor * 650_000_000);
  return Math.max(250_000_000, baseAdtv);
}

/**
 * Forward Dividend & Valid Shareholder Yield Calculator (calculateForwardDividend)
 * Computes Annualized EPS based on Q3-2026 earnings run-rate & organic profitability,
 * then multiplies by 3-Year Historical Average Dividend Payout Ratio (DPR).
 * Also computes Net Buyback & Debt Paydown Yield so Total Shareholder Yield NEVER double-counts Earnings Yield + Dividend Yield.
 */
export function calculateForwardDividend(
  stock: StockMetrics,
  estimatedEpsIdr?: number,
  estimatedBvpsIdr?: number,
  dynamicBuybackYieldOverridePct?: number,
  buybackNominalOverrideIdr?: number,
  liveMarketCapOverrideIdr?: number
): {
  annualizedEpsQ3Idr: number;
  historicalDpr3YPct: number;
  estimatedForwardDpsIdr: number;
  forwardDividendYieldPct: number;
  netPayoutYieldPct: number;
  netDebtPaydownYieldPct: number;
  netBuybackDebtPaydownYieldPct: number;
  totalShareholderYieldPct: number;
  isDividendOutlierSanitized: boolean;
  sanitizationReason?: string;
} {
  const price = Math.max(50, stock.lastPrice);
  const roe = Math.max(0.5, stock.forwardAnnualizedRoePct ?? stock.roe);
  const der = Math.max(0.05, stock.debtToEquity);
  const opMargin = Math.max(0.5, stock.operatingMargin);
  const clean = stock.ticker.trim().toUpperCase().replace(/\.JK$/i, '');

  const baseEps =
    typeof estimatedEpsIdr === 'number' && estimatedEpsIdr > 0
      ? estimatedEpsIdr
      : Math.max(2, Math.round(((price / 1.55) * roe) / 100));

  // Q3-2026 Annualized Run-Rate Adjustment Factor based on operating margin, ROE resilience & YoY quarterly surge
  const earningsSurgeFactor =
    (stock.earningsGrowthYoYPct ?? 0) > 20
      ? Math.min(1.08, 1 + ((stock.earningsGrowthYoYPct ?? 0) - 18) * 0.0025)
      : 1.0;

  const q3RunRateMultiplier =
    (roe >= 18 && opMargin >= 18 && der <= 0.65
      ? 1.04
      : roe >= 14 && opMargin >= 12
      ? 1.01
      : roe < 8
      ? 0.92
      : 0.99) * earningsSurgeFactor;

  const annualizedEpsQ3Idr = Math.max(2, Math.round(baseEps * q3RunRateMultiplier));

  const ttmDivYield = stock.dividendYieldPct ?? 0;
  const impliedEarningsYield = (annualizedEpsQ3Idr / price) * 100;

  let historicalDpr3YPct = HISTORICAL_3Y_DPR_MAP[clean] ?? stock.historicalDpr3YPct ?? 0;
  if (historicalDpr3YPct <= 0 && ttmDivYield > 0) {
    // Derive realistic 3Y DPR from historical payout ratio, bounded to sustainable [20%, 85%]
    const rawImpliedDpr = impliedEarningsYield > 0 ? (ttmDivYield / impliedEarningsYield) * 100 : 45;
    historicalDpr3YPct = Number(Math.max(20, Math.min(85, rawImpliedDpr)).toFixed(1));
  }

  const estimatedForwardDpsIdr =
    historicalDpr3YPct > 0
      ? Number(((annualizedEpsQ3Idr * historicalDpr3YPct) / 100).toFixed(2))
      : 0;

  const rawProjectedForwardDivYieldPct =
    estimatedForwardDpsIdr > 0
      ? Number(((estimatedForwardDpsIdr / price) * 100).toFixed(2))
      : 0;

  const resolvedMarketCapIdr =
    liveMarketCapOverrideIdr ??
    stock.liveMarketCapIdr ??
    Math.max(100_000_000_000, estimateEmitenAdtv20dIdr(stock) * 185);

  const resolvedBuybackNominalIdr =
    typeof buybackNominalOverrideIdr === 'number'
      ? buybackNominalOverrideIdr
      : typeof dynamicBuybackYieldOverridePct === 'number' && dynamicBuybackYieldOverridePct > 0
      ? Math.round((dynamicBuybackYieldOverridePct / 100) * resolvedMarketCapIdr)
      : stock.buybackNominalIdr ?? 0;

  // Delegate to TSY_Calculator (Sanitizes >5% special dividend outliers & eliminates EPS double-counting)
  const hybridTsy = calculateHybridShareholderYield({
    stock,
    projectedForwardDividendYieldPct: rawProjectedForwardDivYieldPct,
    normalDprPct: historicalDpr3YPct || 45,
    buybackNominalIdr: resolvedBuybackNominalIdr,
    liveMarketCapIdr: resolvedMarketCapIdr
  });

  const forwardDividendYieldPct = hybridTsy.forwardDividendYieldPct;
  const netPayoutYieldPct = hybridTsy.netPayoutYieldPct;
  const netDebtPaydownYieldPct = hybridTsy.netDebtPaydownYieldPct;
  const netBuybackDebtPaydownYieldPct = Number(
    (hybridTsy.dynamicBuybackYieldPct + hybridTsy.netDebtPaydownYieldPct).toFixed(2)
  );
  const totalShareholderYieldPct = hybridTsy.totalShareholderYieldPct;

  void estimatedBvpsIdr;

  return {
    annualizedEpsQ3Idr,
    historicalDpr3YPct,
    estimatedForwardDpsIdr,
    forwardDividendYieldPct,
    netPayoutYieldPct,
    netDebtPaydownYieldPct,
    netBuybackDebtPaydownYieldPct,
    totalShareholderYieldPct,
    isDividendOutlierSanitized: hybridTsy.isDividendOutlierSanitized,
    sanitizationReason: hybridTsy.sanitizationReason
  };
}

/**
 * Fabozzi (2012) Multi-Tenor SBN Government Bond Spot Yield Curve (1Y, 5Y, 10Y)
 * & Damodaran (2012) Duration-Matched Dynamic Cost of Equity (Ke) Calculator.
 * Per user preference: Uses a weighted combination of SBN 1Y, 5Y, and 10Y spot rates matched to equity cashflow duration.
 */
export function computeSbnSpotYieldCurveAndKe(
  stock: StockMetrics,
  forwardDividendYieldPct: number = 0,
  macroIndicators: MacroIndicator[] = DEFAULT_GLOBAL_MACRO
): {
  sbnSpot1YPct: number;
  sbnSpot5YPct: number;
  sbnSpot10YPct: number;
  sbnBlendedSpotRfPct: number;
  erpBenchmarkPct: number;
  dynamicCostOfEquityPct: number;
} {
  const us10y = macroIndicators.find((m) => m.id === 'us10y')?.value ?? 4.89;
  const usdidr = macroIndicators.find((m) => m.id === 'usdidr')?.value ?? 18080;

  // Dynamic macro shift on Indonesian SBN Spot Curve based on US 10Y Treasury & Rupiah FX stress
  const globalRateShift = Math.max(-0.45, Math.min(0.65, (us10y - 4.45) * 0.35));
  const fxRiskShift = Math.max(-0.20, Math.min(0.45, ((usdidr - 16200) / 4000) * 0.35));
  const curveShift = Number((globalRateShift + fxRiskShift).toFixed(2));

  // Indonesian Government Bond (SBN) Spot Curve Tenors (1Y, 5Y, 10Y)
  const sbnSpot1YPct = Number((6.15 + curveShift * 0.75).toFixed(2));
  const sbnSpot5YPct = Number((6.48 + curveShift * 0.90).toFixed(2));
  const sbnSpot10YPct = Number((6.75 + curveShift * 1.00).toFixed(2));

  // Equity Duration Weighting (Fabozzi 2012):
  // High-dividend / mature cashflow compounders have shorter Macaulay equity duration (higher 1Y & 5Y weight),
  // whereas low-payout growth stocks have longer cashflow duration (higher 5Y & 10Y weight).
  let w1Y = 0.20;
  let w5Y = 0.35;
  let w10Y = 0.45;
  if (forwardDividendYieldPct >= 4.5) {
    w1Y = 0.28;
    w5Y = 0.42;
    w10Y = 0.30;
  } else if (forwardDividendYieldPct >= 2.0) {
    w1Y = 0.22;
    w5Y = 0.38;
    w10Y = 0.40;
  } else {
    w1Y = 0.12;
    w5Y = 0.33;
    w10Y = 0.55;
  }

  const sbnBlendedSpotRfPct = Number(
    (w1Y * sbnSpot1YPct + w5Y * sbnSpot5YPct + w10Y * sbnSpot10YPct).toFixed(2)
  );

  // Blume-Adjusted Beta toward market mean (0.67 * rawBeta + 0.33 * 1.0), bounded [0.48, 1.55]
  const rawBeta = Math.max(0.35, Number(stock.beta1Y) || 1.0);
  const blumeBeta = Math.max(0.48, Math.min(1.55, 0.67 * rawBeta + 0.33 * 1.0));
  const erpBenchmarkPct = 5.5; // Damodaran Implied Country ERP for Indonesia

  const rawKe = sbnBlendedSpotRfPct + blumeBeta * erpBenchmarkPct;
  const dynamicCostOfEquityPct = Number(Math.max(8.8, Math.min(16.2, rawKe)).toFixed(2));

  return {
    sbnSpot1YPct,
    sbnSpot5YPct,
    sbnSpot10YPct,
    sbnBlendedSpotRfPct,
    erpBenchmarkPct,
    dynamicCostOfEquityPct
  };
}

/**
 * Fast Lookup Map for Catalog Fundamental Anchor Prices across all 956+ IDX Emiten
 * Breaks price circularity so estimated BVPS and EPS do not blindly chase daily spot fluctuations.
 */
const CATALOG_FUNDAMENTAL_ANCHOR_MAP: Map<string, {
  approxPrice: number;
  defaultRoe: number;
  defaultDer: number;
  defaultOpMargin: number;
  name: string;
  sector: string;
}> = new Map(
  FULL_JCI_EMITEN_CATALOG.map((entry) => [
    entry.ticker.toUpperCase(),
    {
      approxPrice: entry.approxPrice,
      defaultRoe: entry.defaultRoe,
      defaultDer: entry.defaultDer,
      defaultOpMargin: entry.defaultOpMargin,
      name: entry.name,
      sector: entry.sector
    }
  ])
);

function resolveFundamentalAnchorPrice(ticker: string, fallbackSpotPrice: number): number {
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  if (BASELINE_PRICE_ANCHORS[clean]) {
    return BASELINE_PRICE_ANCHORS[clean];
  }
  const cat = CATALOG_FUNDAMENTAL_ANCHOR_MAP.get(clean);
  if (cat && cat.approxPrice >= 50) {
    // Blend 75% catalog fundamental anchor + 25% spot level to prevent unit scale mismatch after splits while breaking daily circularity
    return Math.max(50, Math.round(0.75 * cat.approxPrice + 0.25 * fallbackSpotPrice));
  }
  return Math.max(50, fallbackSpotPrice);
}

/**
 * Canonical High-Correlation Intra-Sector Pair Twins for Statistical Arbitrage (Relative Value Mean-Reversion)
 */
const CANONICAL_STATARB_PEERS: Record<
  string,
  { peerTicker: string; peerName: string; correlation: number; defaultChange1D: number; defaultReturn30D: number }
> = {
  BBCA: { peerTicker: 'BMRI', peerName: 'Bank Mandiri (Persero) Tbk', correlation: 0.91, defaultChange1D: 1.11, defaultReturn30D: -5.4 },
  BMRI: { peerTicker: 'BBCA', peerName: 'Bank Central Asia Tbk', correlation: 0.91, defaultChange1D: 1.45, defaultReturn30D: -3.8 },
  BBRI: { peerTicker: 'BBNI', peerName: 'Bank Negara Indonesia (Persero) Tbk', correlation: 0.89, defaultChange1D: 1.25, defaultReturn30D: -6.2 },
  BBNI: { peerTicker: 'BMRI', peerName: 'Bank Mandiri (Persero) Tbk', correlation: 0.90, defaultChange1D: 1.11, defaultReturn30D: -5.4 },
  BRIS: { peerTicker: 'BMRI', peerName: 'Bank Mandiri (Persero) Tbk', correlation: 0.84, defaultChange1D: 1.11, defaultReturn30D: -5.4 },
  BNGA: { peerTicker: 'NISP', peerName: 'Bank OCBC NISP Tbk', correlation: 0.88, defaultChange1D: 0.85, defaultReturn30D: -1.8 },
  NISP: { peerTicker: 'BNGA', peerName: 'Bank CIMB Niaga Tbk', correlation: 0.88, defaultChange1D: 0.92, defaultReturn30D: -1.5 },
  BJBR: { peerTicker: 'BJTM', peerName: 'BPD Jawa Timur Tbk', correlation: 0.87, defaultChange1D: 0.55, defaultReturn30D: -2.1 },
  BJTM: { peerTicker: 'BJBR', peerName: 'BPD Jawa Barat dan Banten Tbk', correlation: 0.87, defaultChange1D: 0.62, defaultReturn30D: -2.4 },
  ADRO: { peerTicker: 'ITMG', peerName: 'Indo Tambangraya Megah Tbk', correlation: 0.88, defaultChange1D: 1.4, defaultReturn30D: -1.9 },
  ITMG: { peerTicker: 'PTBA', peerName: 'Bukit Asam Tbk', correlation: 0.89, defaultChange1D: -0.65, defaultReturn30D: 1.1 },
  PTBA: { peerTicker: 'ITMG', peerName: 'Indo Tambangraya Megah Tbk', correlation: 0.89, defaultChange1D: 1.4, defaultReturn30D: -1.9 },
  PGAS: { peerTicker: 'AKRA', peerName: 'AKR Corporindo Tbk', correlation: 0.82, defaultChange1D: 0.85, defaultReturn30D: -1.4 },
  MEDC: { peerTicker: 'ELSA', peerName: 'Elnusa Tbk', correlation: 0.84, defaultChange1D: 0.95, defaultReturn30D: -1.8 },
  AKRA: { peerTicker: 'PGAS', peerName: 'Perusahaan Gas Negara Tbk', correlation: 0.82, defaultChange1D: 0.75, defaultReturn30D: -2.1 },
  AMMN: { peerTicker: 'MDKA', peerName: 'Merdeka Copper Gold Tbk', correlation: 0.83, defaultChange1D: 1.65, defaultReturn30D: -6.4 },
  ANTM: { peerTicker: 'INCO', peerName: 'Vale Indonesia Tbk', correlation: 0.86, defaultChange1D: 1.15, defaultReturn30D: -2.8 },
  INCO: { peerTicker: 'ANTM', peerName: 'Aneka Tambang Tbk', correlation: 0.86, defaultChange1D: 1.25, defaultReturn30D: -3.1 },
  INKP: { peerTicker: 'TKIM', peerName: 'Pabrik Kertas Tjiwi Kimia Tbk', correlation: 0.92, defaultChange1D: 0.8, defaultReturn30D: -2.2 },
  TKIM: { peerTicker: 'INKP', peerName: 'Indah Kiat Pulp & Paper Tbk', correlation: 0.92, defaultChange1D: 0.95, defaultReturn30D: -1.9 },
  SMGR: { peerTicker: 'INTP', peerName: 'Indocement Tunggal Prakarsa Tbk', correlation: 0.89, defaultChange1D: 0.65, defaultReturn30D: -3.2 },
  INTP: { peerTicker: 'SMGR', peerName: 'Semen Indonesia (Persero) Tbk', correlation: 0.89, defaultChange1D: 0.5, defaultReturn30D: -3.8 },
  ICBP: { peerTicker: 'MYOR', peerName: 'Mayora Indah Tbk', correlation: 0.88, defaultChange1D: 1.33, defaultReturn30D: 2.1 },
  INDF: { peerTicker: 'ICBP', peerName: 'Indofood CBP Sukses Makmur Tbk', correlation: 0.91, defaultChange1D: 1.85, defaultReturn30D: -2.1 },
  MYOR: { peerTicker: 'ICBP', peerName: 'Indofood CBP Sukses Makmur Tbk', correlation: 0.88, defaultChange1D: 1.85, defaultReturn30D: -2.1 },
  CMRY: { peerTicker: 'MYOR', peerName: 'Mayora Indah Tbk', correlation: 0.85, defaultChange1D: 1.33, defaultReturn30D: 2.1 },
  AMRT: { peerTicker: 'MIDI', peerName: 'Midi Utama Indonesia Tbk', correlation: 0.89, defaultChange1D: 0.95, defaultReturn30D: 1.2 },
  TAPG: { peerTicker: 'LSIP', peerName: 'PP London Sumatra Indonesia Tbk', correlation: 0.87, defaultChange1D: 1.1, defaultReturn30D: 1.8 },
  LSIP: { peerTicker: 'TAPG', peerName: 'Triputra Agro Persada Tbk', correlation: 0.87, defaultChange1D: 1.35, defaultReturn30D: 2.4 },
  CPIN: { peerTicker: 'JPFA', peerName: 'Japfa Comfeed Indonesia Tbk', correlation: 0.90, defaultChange1D: 1.15, defaultReturn30D: 0.8 },
  JPFA: { peerTicker: 'CPIN', peerName: 'Charoen Pokphand Indonesia Tbk', correlation: 0.90, defaultChange1D: 0.85, defaultReturn30D: -0.9 },
  KLBF: { peerTicker: 'SIDO', peerName: 'Industri Jamu dan Farmasi Sido Muncul Tbk', correlation: 0.85, defaultChange1D: 0.45, defaultReturn30D: -1.8 },
  SIDO: { peerTicker: 'KLBF', peerName: 'Kalbe Farma Tbk', correlation: 0.85, defaultChange1D: 1.4, defaultReturn30D: -2.5 },
  MIKA: { peerTicker: 'SILO', peerName: 'Siloam International Hospitals Tbk', correlation: 0.87, defaultChange1D: 0.9, defaultReturn30D: 1.4 },
  HEAL: { peerTicker: 'MIKA', peerName: 'Mitra Keluarga Karyasehat Tbk', correlation: 0.86, defaultChange1D: 0.84, defaultReturn30D: 1.4 },
  TLKM: { peerTicker: 'ISAT', peerName: 'Indosat Tbk', correlation: 0.86, defaultChange1D: 1.45, defaultReturn30D: -2.2 },
  ISAT: { peerTicker: 'TLKM', peerName: 'Telkom Indonesia (Persero) Tbk', correlation: 0.86, defaultChange1D: 1.8, defaultReturn30D: -3.5 },
  EXCL: { peerTicker: 'ISAT', peerName: 'Indosat Tbk', correlation: 0.88, defaultChange1D: 1.45, defaultReturn30D: -2.2 },
  TOWR: { peerTicker: 'TBIG', peerName: 'Tower Bersama Infrastructure Tbk', correlation: 0.91, defaultChange1D: 0.65, defaultReturn30D: -2.4 },
  TBIG: { peerTicker: 'TOWR', peerName: 'Sarana Menara Nusantara Tbk', correlation: 0.91, defaultChange1D: 0.75, defaultReturn30D: -2.1 },
  MTEL: { peerTicker: 'TOWR', peerName: 'Sarana Menara Nusantara Tbk', correlation: 0.89, defaultChange1D: 0.75, defaultReturn30D: -2.1 },
  ASII: { peerTicker: 'UNTR', peerName: 'United Tractors Tbk', correlation: 0.88, defaultChange1D: 1.62, defaultReturn30D: 0.8 },
  UNTR: { peerTicker: 'ASII', peerName: 'Astra International Tbk', correlation: 0.88, defaultChange1D: 0.41, defaultReturn30D: -1.2 },
  CTRA: { peerTicker: 'PWON', peerName: 'Pakuwon Jati Tbk', correlation: 0.90, defaultChange1D: 0.85, defaultReturn30D: -1.9 },
  BSDE: { peerTicker: 'CTRA', peerName: 'Ciputra Development Tbk', correlation: 0.91, defaultChange1D: 1.1, defaultReturn30D: -1.4 },
  PWON: { peerTicker: 'BSDE', peerName: 'Bumi Serpong Damai Tbk', correlation: 0.90, defaultChange1D: 0.95, defaultReturn30D: -1.8 },
  SMRA: { peerTicker: 'CTRA', peerName: 'Ciputra Development Tbk', correlation: 0.89, defaultChange1D: 1.1, defaultReturn30D: -1.4 },
  DMAS: { peerTicker: 'PWON', peerName: 'Pakuwon Jati Tbk', correlation: 0.83, defaultChange1D: 0.85, defaultReturn30D: -1.9 },
  ARNA: { peerTicker: 'TOTO', peerName: 'Surya Toto Indonesia Tbk', correlation: 0.84, defaultChange1D: 0.65, defaultReturn30D: 0.9 },
  MPMX: { peerTicker: 'ASII', peerName: 'Astra International Tbk', correlation: 0.82, defaultChange1D: 0.41, defaultReturn30D: -1.2 },
  ACES: { peerTicker: 'MAPI', peerName: 'Mitra Adiperkasa Tbk', correlation: 0.85, defaultChange1D: 1.05, defaultReturn30D: -1.1 },
  MAPI: { peerTicker: 'ACES', peerName: 'Aspirasi Hidup Indonesia Tbk', correlation: 0.85, defaultChange1D: 0.9, defaultReturn30D: -1.5 }
};

const SECTOR_DEFAULT_BENCHMARK_PEER: Record<
  string,
  { peerTicker: string; peerName: string; correlation: number; defaultChange1D: number; defaultReturn30D: number }
> = {
  Financials: { peerTicker: 'BMRI', peerName: 'Bank Mandiri (Persero) Tbk', correlation: 0.85, defaultChange1D: 1.11, defaultReturn30D: -5.4 },
  Energy: { peerTicker: 'ITMG', peerName: 'Indo Tambangraya Megah Tbk', correlation: 0.84, defaultChange1D: 1.4, defaultReturn30D: -1.9 },
  'Basic Materials': { peerTicker: 'ANTM', peerName: 'Aneka Tambang Tbk', correlation: 0.82, defaultChange1D: 1.25, defaultReturn30D: -3.1 },
  Industrials: { peerTicker: 'UNTR', peerName: 'United Tractors Tbk', correlation: 0.84, defaultChange1D: 1.62, defaultReturn30D: 0.8 },
  'Consumer Non-Cyclicals': { peerTicker: 'ICBP', peerName: 'Indofood CBP Sukses Makmur Tbk', correlation: 0.84, defaultChange1D: 1.85, defaultReturn30D: -2.1 },
  'Consumer Cyclicals': { peerTicker: 'MAPI', peerName: 'Mitra Adiperkasa Tbk', correlation: 0.81, defaultChange1D: 1.05, defaultReturn30D: -1.1 },
  Healthcare: { peerTicker: 'KLBF', peerName: 'Kalbe Farma Tbk', correlation: 0.83, defaultChange1D: 1.4, defaultReturn30D: -2.5 },
  Infrastructures: { peerTicker: 'TLKM', peerName: 'Telkom Indonesia (Persero) Tbk', correlation: 0.85, defaultChange1D: 1.8, defaultReturn30D: -3.5 },
  'Properties & Real Estate': { peerTicker: 'CTRA', peerName: 'Ciputra Development Tbk', correlation: 0.86, defaultChange1D: 1.1, defaultReturn30D: -1.4 },
  Technology: { peerTicker: 'MTDL', peerName: 'Metrodata Electronics Tbk', correlation: 0.79, defaultChange1D: 0.95, defaultReturn30D: -1.2 },
  'Transportation & Logistics': { peerTicker: 'BIRD', peerName: 'Blue Bird Tbk', correlation: 0.81, defaultChange1D: 0.8, defaultReturn30D: -1.0 }
};

/**
 * Method 1: Multi-Stage Residual Income Model (Ohlson 1995; Gebhardt, Lee & Swaminathan 2001; Penman 2020)
 * Uses a dynamic 5-to-7 Year ROE Fade Horizon (`rimFadeYears`) and Persistence Parameter (`omega`)
 * calibrated from Novy-Marx Gross Profitability (GP/A) and Asness QMJ Accrual Quality (OCF/NI).
 */
function computeMultiStageResidualIncomeValue(params: {
  ticker?: string;
  sector?: string;
  bvps0: number;
  roePct: number;
  kePct: number;
  dprPct: number;
  gpaPct: number;
  ocfToNi: number;
  der: number;
  accrualPenaltyScore: number;
  hscDiscountMultiplier: number;
  effectiveModule?: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
}): {
  rimFairValueIdr: number;
  rimFadeYears: number;
  rimPersistenceOmega: number;
  rimTerminalRoePct: number;
} {
  const {
    ticker = 'IDX',
    sector = 'Financials',
    bvps0,
    roePct,
    kePct,
    dprPct,
    gpaPct,
    ocfToNi,
    der,
    accrualPenaltyScore,
    hscDiscountMultiplier,
    effectiveModule
  } = params;

  // Dynamic Sectoral Omega Fade Factor (KBMI 4 & Consumer Monopolies: 0.90-1.00; Commodities & Cyclicals: 0.40-0.60)
  const sectorOmega = resolveSectorOmegaFadeFactor({
    ticker,
    sector,
    gpaPct,
    ocfToNi,
    accrualPenaltyScore,
    effectiveModule
  });
  const rimFadeYears = sectorOmega.rimFadeYears;
  const rimPersistenceOmega = sectorOmega.rimPersistenceOmega;
  void der;

  // Context-aware cash-adjusted sustainable starting ROE and terminal equilibrium ROE:
  // For Capex_Aggressor (Rule B), if OCF/NI > 0.50x, do not penalize starting ROE for heavy construction CapEx.
  const cashQualityAdj =
    effectiveModule === 'Capex_Aggressor' && ocfToNi > 0.50
      ? Math.max(0.98, Math.min(1.08, 0.94 + ocfToNi * 0.14))
      : Math.max(0.78, Math.min(1.08, 0.88 + ocfToNi * 0.12 - accrualPenaltyScore * 0.05));
  const startRoePct = Math.max(2.0, Math.min(34.0, roePct * cashQualityAdj));
  const rimTerminalRoePct = Number(
    Math.max(
      kePct * 0.85,
      Math.min(kePct + 5.5, 0.55 * kePct + 0.45 * Math.min(22.0, startRoePct))
    ).toFixed(2)
  );

  const keDec = kePct / 100;
  const retentionRatio = Math.max(0.15, Math.min(0.80, 1 - dprPct / 100));

  let currentBvps = bvps0;
  let pvExplicitResidualIncome = 0;
  let lastResidualIncome = 0;

  for (let t = 1; t <= rimFadeYears; t++) {
    const fadeProgress = t / rimFadeYears;
    // Smooth exponential-linear decay from startRoePct toward rimTerminalRoePct governed by sectoral omega
    const roeT =
      startRoePct * Math.pow(rimPersistenceOmega, t * 0.45) * (1 - fadeProgress * 0.35) +
      rimTerminalRoePct * (1 - Math.pow(rimPersistenceOmega, t * 0.45) * (1 - fadeProgress * 0.35));
    const roeTDec = roeT / 100;
    const epsT = currentBvps * roeTDec;
    const residualIncomeT = (roeTDec - keDec) * currentBvps;
    const discountFactor = Math.pow(1 + keDec, t);

    pvExplicitResidualIncome += residualIncomeT / discountFactor;
    lastResidualIncome = residualIncomeT;
    currentBvps = Math.max(bvps0 * 0.5, currentBvps + epsT * retentionRatio);
  }

  // Terminal Value of Residual Income with persistence factor omega (Ohlson 1995 EBO formulation)
  const pvTerminalResidualIncome =
    (lastResidualIncome * rimPersistenceOmega) /
    ((1 + keDec - rimPersistenceOmega) * Math.pow(1 + keDec, rimFadeYears));

  const rawRimValue = (bvps0 + pvExplicitResidualIncome + pvTerminalResidualIncome) * hscDiscountMultiplier;
  const rimFairValueIdr = roundToIdxTick(Math.max(50, rawRimValue));

  return {
    rimFairValueIdr,
    rimFadeYears,
    rimPersistenceOmega,
    rimTerminalRoePct
  };
}

/**
 * Method 2: Sector-Specific Institutional Valuation Matrix
 * Implements academic & practitioner industry-standard multiples per sector:
 * - Energy, Basic Materials & Industrials -> Price-to-Cash Flow (P/CF)
 * - Telecommunications, Towers & Infrastructures -> EV/EBITDA
 * - Properties, Real Estate & REITs -> Price-to-AFFO (Adjusted Funds from Operations)
 * - Financials & Banking -> Damodaran Justified PBV & Excess Return
 * - Consumer & Healthcare -> Quality-Adjusted P/E (Novy-Marx GP/A Moat)
 */
function computeSectorSpecificValuation(params: {
  stock: StockMetrics;
  price: number;
  estimatedEpsIdr: number;
  estimatedBvpsIdr: number;
  ocfToNetIncomeRatio: number;
  grossProfitabilityToAssets: number;
  dynamicCostOfEquityPct: number;
  sustainableGrowthRatePct: number;
  standaloneFairPbv: number;
  standaloneFairPer: number;
  derPenaltyMultiplier: number;
  accrualQualityMultiplier: number;
  hscDiscountMultiplier: number;
  rimFairValueIdr?: number;
  rimFadeYears?: number;
  rimPersistenceOmega?: number;
}): {
  sectorValuationArchetype: SectorValuationArchetype;
  sectorPrimaryMetricShort: string;
  sectorPrimaryMetricLabel: string;
  sectorPrimaryImpliedMultiple: number;
  sectorPrimaryFairMultiple: number;
  sectorPrimaryPerShareIdr: number;
  sectorPrimaryPerShareLabel: string;
  sectorSpecificFairValueIdr: number;
  sectorAcademicRationale: string;
} {
  const {
    stock,
    price,
    estimatedEpsIdr,
    estimatedBvpsIdr,
    ocfToNetIncomeRatio,
    grossProfitabilityToAssets,
    dynamicCostOfEquityPct,
    sustainableGrowthRatePct,
    standaloneFairPbv,
    standaloneFairPer,
    derPenaltyMultiplier,
    accrualQualityMultiplier,
    hscDiscountMultiplier,
    rimFairValueIdr,
    rimFadeYears = 6,
    rimPersistenceOmega = 0.75
  } = params;

  const sec = stock.sector;
  const cleanTicker = stock.ticker.toUpperCase().replace(/\.JK$/i, '');
  const der = Math.max(0.05, stock.debtToEquity);
  const roeSpreadPct = Number((stock.roe - dynamicCostOfEquityPct).toFixed(2));
  const rimValText = rimFairValueIdr
    ? `Rp ${rimFairValueIdr.toLocaleString('id-ID')}`
    : `Rp ${Math.round(estimatedBvpsIdr * standaloneFairPbv).toLocaleString('id-ID')}`;

  // 1. ENERGY, BASIC MATERIALS & CAPITAL GOODS (INDUSTRIALS) -> Price-to-Cash Flow (P/CF)
  if (sec === 'Energy' || sec === 'Basic Materials' || sec === 'Industrials') {
    const ddaAddbackMultiplier = sec === 'Energy' || sec === 'Basic Materials' ? 1.24 : 1.18;
    const effectiveCashConversion = Math.max(0.55, Math.min(1.65, ocfToNetIncomeRatio));
    const ocfPerShareIdr = Math.max(
      4,
      Math.round(estimatedEpsIdr * effectiveCashConversion * ddaAddbackMultiplier)
    );
    const impliedPcf = Number(Math.max(1.8, Math.min(45.0, price / ocfPerShareIdr)).toFixed(2));

    const baseTargetPcf =
      (100 / Math.max(9.2, dynamicCostOfEquityPct + 0.8)) * (sec === 'Industrials' ? 1.05 : 0.96);
    const gpaBonus = Math.max(0.88, Math.min(1.22, 0.86 + (grossProfitabilityToAssets / 24) * 0.28));
    const fairPcf = Number(
      Math.max(
        4.2,
        Math.min(
          14.5,
          baseTargetPcf * gpaBonus * derPenaltyMultiplier * accrualQualityMultiplier * hscDiscountMultiplier
        )
      ).toFixed(2)
    );
    const sectorSpecificFairValueIdr = roundToIdxTick(Math.max(50, ocfPerShareIdr * fairPcf));

    const pcfSpreadPct = Number((((fairPcf - impliedPcf) / Math.max(0.1, fairPcf)) * 100).toFixed(1));
    const cyclePositionLabel =
      pcfSpreadPct >= 20
        ? `terdiskon tajam ${pcfSpreadPct}% di bawah ekuilibrium siklusnya (${impliedPcf}x vs Wajar ${fairPcf}x)`
        : pcfSpreadPct >= 5
        ? `diperdagangkan pada diskon moderat ${pcfSpreadPct}% (${impliedPcf}x vs Wajar ${fairPcf}x)`
        : pcfSpreadPct >= -8
        ? `berada di ekuilibrium siklus wajar (${impliedPcf}x vs Wajar ${fairPcf}x)`
        : `diperdagangkan pada premi siklikal ${Math.abs(pcfSpreadPct)}% di atas rata-rata historis (${impliedPcf}x vs Wajar ${fairPcf}x)`;

    const subSectorContext = ['ADRO', 'AADI', 'ITMG', 'PTBA', 'HRUM', 'INDY', 'BUMI', 'MBAP', 'TOBA'].includes(cleanTicker)
      ? 'emiten batu bara & transisi energi dengan struktur biaya tambang (stripping ratio) yang menghasilkan depresiasi/deplesi non-kas besar'
      : ['ESSA', 'BRPT', 'TPIA', 'AKRA', 'MEDC', 'ELSA', 'PGAS', 'RAJA'].includes(cleanTicker)
      ? 'emiten hilirisasi amonia/petrokimia & migas dengan utilisasi pabrik padat modal (plant amortization tinggi)'
      : ['ANTM', 'INCO', 'MDKA', 'MBMA', 'NCKL', 'AMMN', 'TINS', 'BRMS', 'PSAB'].includes(cleanTicker)
      ? 'emiten pemurnian mineral/smelter & logam mulia dengan intensitas CapEx pengolahan bijih yang masif'
      : ['INKP', 'TKIM', 'SMGR', 'INTP', 'AVIA'].includes(cleanTicker)
      ? 'emiten industri dasar & manufaktur hulu dengan beban penyusutan fasilitas pabrik berkapasitas besar'
      : sec === 'Industrials'
      ? 'emiten alat berat & konglomerasi industri dengan siklus belanja modal armada (fleet depreciation) tinggi'
      : `emiten ${sec} padat modal dengan amortisasi hak konsesi & aset tetap signifikan`;

    const cashQualityDiag =
      ocfToNetIncomeRatio >= 1.05
        ? `Surplus konversi kas riil sangat solid (OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x; OCF Rp ${ocfPerShareIdr.toLocaleString('id-ID')}/shm > EPS Rp ${estimatedEpsIdr.toLocaleString('id-ID')}/shm)`
        : ocfToNetIncomeRatio >= 0.85
        ? `Kualitas konversi kas sehat (OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x; OCF Rp ${ocfPerShareIdr.toLocaleString('id-ID')}/shm sejalan EPS Rp ${estimatedEpsIdr.toLocaleString('id-ID')}/shm)`
        : `Terdapat serapan modal kerja/akrual (OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x; OCF Rp ${ocfPerShareIdr.toLocaleString('id-ID')}/shm di bawah EPS Rp ${estimatedEpsIdr.toLocaleString('id-ID')}/shm)`;

    return {
      sectorValuationArchetype: 'ENERGY_MATERIALS_PCF',
      sectorPrimaryMetricShort: 'P/CF',
      sectorPrimaryMetricLabel: 'Price-to-Cash Flow (P/CF)',
      sectorPrimaryImpliedMultiple: impliedPcf,
      sectorPrimaryFairMultiple: fairPcf,
      sectorPrimaryPerShareIdr: ocfPerShareIdr,
      sectorPrimaryPerShareLabel: 'OCF/Saham',
      sectorSpecificFairValueIdr,
      sectorAcademicRationale: `Diagnostik ${cleanTicker} (${subSectorContext}): Saat ini P/CF ${cleanTicker} ${cyclePositionLabel}. ${cashQualityDiag} dengan efisiensi aset GP/A ${grossProfitabilityToAssets.toFixed(1)}% dan leverage DER ${der.toFixed(2)}x. Pada model Ohlson-Penman RIM (${rimFadeYears}Y Fade, ω=${rimPersistenceOmega.toFixed(2)}), selisih Forward ROE ${stock.roe.toFixed(1)}% vs Ke ${dynamicCostOfEquityPct.toFixed(2)}% (${roeSpreadPct >= 0 ? '+' : ''}${roeSpreadPct}% excess return) mengunci nilai intrinsik jangka menengah di ${rimValText}.`
    };
  }

  // 2. TELECOMMUNICATIONS, TOWERS & INFRASTRUCTURES -> EV/EBITDA
  if (
    sec === 'Infrastructures' ||
    sec === 'Technology' ||
    ['TLKM', 'ISAT', 'EXCL', 'TOWR', 'TBIG', 'MTEL', 'JSMR', 'LINK', 'WIFI', 'DATA'].includes(cleanTicker)
  ) {
    const infraDepreciationFactor =
      ['TOWR', 'TBIG', 'MTEL', 'TLKM', 'ISAT', 'EXCL', 'JSMR'].includes(cleanTicker) || sec === 'Infrastructures'
        ? 1.72
        : 1.48;
    const ebitdaPerShareIdr = Math.max(
      5,
      Math.round(
        estimatedEpsIdr *
          infraDepreciationFactor *
          Math.max(0.75, Math.min(1.35, ocfToNetIncomeRatio * 0.95))
      )
    );
    const netDebtPerShareIdr = Math.round(
      estimatedBvpsIdr * Math.max(0, der - 0.18) * 0.58
    );
    const enterpriseValuePerShareIdr = price + netDebtPerShareIdr;
    const impliedEvEbitda = Number(
      Math.max(2.2, Math.min(38.0, enterpriseValuePerShareIdr / ebitdaPerShareIdr)).toFixed(2)
    );

    const baseFairEvEbitda =
      (100 / Math.max(9.5, dynamicCostOfEquityPct + 0.5)) *
      (stock.operatingMargin >= 28 ? 1.08 : 0.94);
    const fairEvEbitda = Number(
      Math.max(
        4.5,
        Math.min(
          13.5,
          baseFairEvEbitda * accrualQualityMultiplier * hscDiscountMultiplier
        )
      ).toFixed(2)
    );
    const fairEnterpriseValuePerShare = ebitdaPerShareIdr * fairEvEbitda;
    const rawEquityFairValue = Math.max(
      estimatedEpsIdr * standaloneFairPer * 0.72,
      fairEnterpriseValuePerShare - netDebtPerShareIdr
    );
    const sectorSpecificFairValueIdr = roundToIdxTick(Math.max(50, rawEquityFairValue));

    const evSpreadPct = Number((((fairEvEbitda - impliedEvEbitda) / Math.max(0.1, fairEvEbitda)) * 100).toFixed(1));
    const infraProfile = ['TOWR', 'TBIG', 'MTEL'].includes(cleanTicker)
      ? 'infrastruktur menara telekomunikasi dengan kontrak sewa jangka panjang (tenancy ratio) & beban depresiasi menara tinggi'
      : ['TLKM', 'ISAT', 'EXCL', 'WIFI', 'LINK', 'DATA'].includes(cleanTicker)
      ? 'operator jaringan telekomunikasi & serat optik dengan amortisasi spektrum frekuensi dan belanja modal jaringan masif'
      : ['JSMR', 'CMNP', 'META'].includes(cleanTicker)
      ? 'operator konsesi jalan tol & infrastruktur transportasi dengan amortisasi hak konsesi jangka panjang'
      : `emiten ${sec} dengan struktur modal berbasis utang proyek & depresiasi jaringan`;

    return {
      sectorValuationArchetype: 'TELCO_INFRA_EVEBITDA',
      sectorPrimaryMetricShort: 'EV/EBITDA',
      sectorPrimaryMetricLabel: 'Enterprise Value to EBITDA (EV/EBITDA)',
      sectorPrimaryImpliedMultiple: impliedEvEbitda,
      sectorPrimaryFairMultiple: fairEvEbitda,
      sectorPrimaryPerShareIdr: ebitdaPerShareIdr,
      sectorPrimaryPerShareLabel: 'EBITDA/Saham',
      sectorSpecificFairValueIdr,
      sectorAcademicRationale: `Diagnostik ${cleanTicker} (${infraProfile}): EV/EBITDA aktual ${impliedEvEbitda}x vs Wajar ${fairEvEbitda}x (${evSpreadPct >= 0 ? `diskon ${evSpreadPct}%` : `premi ${Math.abs(evSpreadPct)}%`}) menetralisir distorsi penyusutan non-kas dan memperhitungkan Net Debt ~Rp ${netDebtPerShareIdr.toLocaleString('id-ID')}/shm (DER ${der.toFixed(2)}x). Kapasitas kas operasional EBITDA Rp ${ebitdaPerShareIdr.toLocaleString('id-ID')}/shm (OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x, GP/A ${grossProfitabilityToAssets.toFixed(1)}%) ditopang oleh nilai intrinsik RIM (${rimFadeYears}Y, ω=${rimPersistenceOmega.toFixed(2)}) sebesar ${rimValText}.`
    };
  }

  // 3. PROPERTIES, REAL ESTATE & INDUSTRIAL ESTATES / REITs -> Price-to-AFFO (P/AFFO)
  if (
    sec === 'Properties & Real Estate' ||
    ['CTRA', 'BSDE', 'PWON', 'SMRA', 'DMAS', 'JRPT', 'PLIN', 'PANI', 'MKPI', 'LPKR', 'ASRI'].includes(cleanTicker)
  ) {
    const affoPerShareIdr = Math.max(
      3,
      Math.round(
        estimatedEpsIdr * Math.max(0.62, Math.min(1.30, ocfToNetIncomeRatio * 0.90)) +
          estimatedBvpsIdr * 0.022
      )
    );
    const impliedPaffo = Number(Math.max(2.5, Math.min(48.0, price / affoPerShareIdr)).toFixed(2));

    const baseFairPaffo =
      (100 / Math.max(8.8, dynamicCostOfEquityPct - 1.2)) *
      (der <= 0.65 ? 1.06 : 0.92);
    const fairPaffo = Number(
      Math.max(
        5.5,
        Math.min(
          15.5,
          baseFairPaffo * accrualQualityMultiplier * hscDiscountMultiplier
        )
      ).toFixed(2)
    );
    const paffoValue = affoPerShareIdr * fairPaffo;
    const rnavBookAnchor = estimatedBvpsIdr * standaloneFairPbv;
    const sectorSpecificFairValueIdr = roundToIdxTick(
      Math.max(50, 0.70 * paffoValue + 0.30 * rnavBookAnchor)
    );

    const affoSpreadPct = Number((((fairPaffo - impliedPaffo) / Math.max(0.1, fairPaffo)) * 100).toFixed(1));

    return {
      sectorValuationArchetype: 'PROPERTY_REIT_PAFFO',
      sectorPrimaryMetricShort: 'P/AFFO',
      sectorPrimaryMetricLabel: 'Price-to-AFFO (Adjusted Funds From Operations)',
      sectorPrimaryImpliedMultiple: impliedPaffo,
      sectorPrimaryFairMultiple: fairPaffo,
      sectorPrimaryPerShareIdr: affoPerShareIdr,
      sectorPrimaryPerShareLabel: 'AFFO/Saham',
      sectorSpecificFairValueIdr,
      sectorAcademicRationale: `Diagnostik ${cleanTicker} (Siklus Properti & Landbank): P/AFFO aktual ${impliedPaffo}x vs Wajar ${fairPaffo}x (${affoSpreadPct >= 0 ? `diskon ${affoSpreadPct}%` : `premi ${Math.abs(affoSpreadPct)}%`}) menyaring distorsi pengakuan laba serah-terima (handover) & revaluasi non-kas. Arus kas berulang AFFO Rp ${affoPerShareIdr.toLocaleString('id-ID')}/shm (OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x, DER ${der.toFixed(2)}x) dipadukan dengan jangkar nilai buku RNAV/RIM (${rimFadeYears}Y, ω=${rimPersistenceOmega.toFixed(2)}) di ${rimValText}.`
    };
  }

  // 4. FINANCIALS & BANKING -> Damodaran Justified PBV & Excess Return
  if (sec === 'Financials') {
    const impliedPbv = Number((price / Math.max(1, estimatedBvpsIdr)).toFixed(2));
    const sectorSpecificFairValueIdr = roundToIdxTick(
      Math.max(50, estimatedBvpsIdr * standaloneFairPbv)
    );
    const pbvSpreadPct = Number((((standaloneFairPbv - impliedPbv) / Math.max(0.1, standaloneFairPbv)) * 100).toFixed(1));
    const bankTierDesc = ['BBCA', 'BMRI', 'BBRI', 'BBNI'].includes(cleanTicker)
      ? 'perbankan KBMI 4 pemilik waralaba dana murah (CASA) & efisiensi biaya dana struktural'
      : ['BRIS', 'BTPS', 'BNGA', 'BDMN', 'NISP', 'BJBR', 'BJTM'].includes(cleanTicker)
      ? 'perbankan menengah/syariah dengan ekspansi pembiayaan selektif & kualitas pencadangan terjaga'
      : 'institusi keuangan dengan modal inti produktif & sensitivitas kurva imbal hasil SBN';

    return {
      sectorValuationArchetype: 'FINANCIALS_JUSTIFIED_PBV',
      sectorPrimaryMetricShort: 'Justified PBV',
      sectorPrimaryMetricLabel: 'Damodaran Justified PBV & Excess Return',
      sectorPrimaryImpliedMultiple: impliedPbv,
      sectorPrimaryFairMultiple: standaloneFairPbv,
      sectorPrimaryPerShareIdr: estimatedBvpsIdr,
      sectorPrimaryPerShareLabel: 'BVPS Ekuitas',
      sectorSpecificFairValueIdr,
      sectorAcademicRationale: `Diagnostik ${cleanTicker} (${bankTierDesc}): PBV aktual ${impliedPbv}x vs Justified PBV ${standaloneFairPbv}x (${pbvSpreadPct >= 0 ? `diskon ${pbvSpreadPct}%` : `premi ${Math.abs(pbvSpreadPct)}%`}) dihitung dari rumus Damodaran (Fwd ROE ${stock.roe.toFixed(1)}% − g ${sustainableGrowthRatePct.toFixed(1)}%) ÷ (Ke ${dynamicCostOfEquityPct.toFixed(2)}% − g). Dengan Excess Return ${roeSpreadPct >= 0 ? '+' : ''}${roeSpreadPct}% di atas Ke kurva SBN dan kualitas laba kas OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x, model Multi-Stage RIM (${rimFadeYears}Y, ω=${rimPersistenceOmega.toFixed(2)}) menghasilkan nilai wajar ${rimValText}.`
    };
  }

  // 5. CONSUMER, HEALTHCARE & GENERAL COMPOUNDERS -> Quality-Adjusted P/E (Cash Earnings Power)
  const cashAdjustedEpsIdr = Math.max(
    2,
    Math.round(estimatedEpsIdr * Math.max(0.78, Math.min(1.16, 0.85 + ocfToNetIncomeRatio * 0.15)))
  );
  const impliedQualityPe = Number(Math.max(2.5, Math.min(60.0, price / cashAdjustedEpsIdr)).toFixed(2));
  const moatPremium = grossProfitabilityToAssets >= 22 ? 1.12 : grossProfitabilityToAssets >= 16 ? 1.05 : 0.96;
  const fairQualityPe = Number(
    Math.max(6.0, Math.min(24.5, standaloneFairPer * moatPremium)).toFixed(2)
  );
  const sectorSpecificFairValueIdr = roundToIdxTick(
    Math.max(50, cashAdjustedEpsIdr * fairQualityPe)
  );
  const peSpreadPct = Number((((fairQualityPe - impliedQualityPe) / Math.max(0.1, fairQualityPe)) * 100).toFixed(1));
  const moatStrengthDesc =
    grossProfitabilityToAssets >= 22
      ? 'moat penetapan harga (pricing power) & perputaran aset superior'
      : grossProfitabilityToAssets >= 15
      ? 'efisiensi margin kotor & perputaran modal kerja yang solid'
      : 'struktur margin kompetitif yang menuntut disiplin perputaran kas';

  return {
    sectorValuationArchetype: 'CONSUMER_HEALTH_QUALITY_PE',
    sectorPrimaryMetricShort: 'Quality P/E',
    sectorPrimaryMetricLabel: 'Quality-Adjusted P/E (Cash Earnings Power)',
    sectorPrimaryImpliedMultiple: impliedQualityPe,
    sectorPrimaryFairMultiple: fairQualityPe,
    sectorPrimaryPerShareIdr: cashAdjustedEpsIdr,
    sectorPrimaryPerShareLabel: 'Cash EPS',
    sectorSpecificFairValueIdr,
    sectorAcademicRationale: `Diagnostik ${cleanTicker} (${sec} — ${moatStrengthDesc}): Quality P/E aktual ${impliedQualityPe}x vs Wajar ${fairQualityPe}x (${peSpreadPct >= 0 ? `diskon ${peSpreadPct}%` : `premi ${Math.abs(peSpreadPct)}%`}) bertumpu pada Cash EPS Rp ${cashAdjustedEpsIdr.toLocaleString('id-ID')}/shm (OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x, GP/A Novy-Marx ${grossProfitabilityToAssets.toFixed(1)}%, DER ${der.toFixed(2)}x). Persistensi laba abnormal Ohlson-Penman (ω=${rimPersistenceOmega.toFixed(2)} selama ${rimFadeYears} tahun, Fwd ROE ${stock.roe.toFixed(1)}% vs Ke ${dynamicCostOfEquityPct.toFixed(2)}%) mengonfirmasi nilai wajar RIM di ${rimValText}.`
  };
}

/**
 * Method 3 & 4: Agnostic Cross-Sectional Peer Valuation (Bartram & Grinblatt 2018 JFE)
 * & Quantedge Statistical Arbitrage (Relative Value Pair Mean-Reversion Engine).
 * Detects short-term price dislocations between high-correlation intra-sector twins (e.g., BBCA vs BMRI)
 * caused by institutional liquidity shocks / forced selling without fundamental deterioration.
 */
function computeStatArbAndAgnosticPeerValuation(params: {
  stock: StockMetrics;
  price: number;
  estimatedEpsIdr: number;
  estimatedBvpsIdr: number;
  ocfToNetIncomeRatio: number;
  grossProfitabilityToAssets: number;
  forwardDividendYieldPct: number;
  sectorSpecificFairValueIdr: number;
  rimFairValueIdr: number;
  effectiveModule?: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
}): {
  agnosticPeerFairValueIdr: number;
  statArbPeerTicker: string;
  statArbPeerName: string;
  statArbCorrelation: number;
  statArbBetaRatio: number;
  statArbSpread1DPct: number;
  statArbSpread30DPct: number;
  statArbZScore: number;
  statArbSignal: StatArbSignalType;
  statArbSignalLabel: string;
  statArbImpliedTargetIdr: number;
  statArbRationale: string;
} {
  const {
    stock,
    price,
    estimatedEpsIdr,
    estimatedBvpsIdr,
    ocfToNetIncomeRatio,
    grossProfitabilityToAssets,
    forwardDividendYieldPct,
    sectorSpecificFairValueIdr,
    rimFairValueIdr,
    effectiveModule
  } = params;

  const clean = stock.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const peerInfo =
    CANONICAL_STATARB_PEERS[clean] ||
    SECTOR_DEFAULT_BENCHMARK_PEER[stock.sector] || {
      peerTicker: 'IHSG-SEC',
      peerName: `Indeks Sektor ${stock.sector}`,
      correlation: 0.82,
      defaultChange1D: 0.65,
      defaultReturn30D: -1.8
    };

  // If the stock happens to match the default sector benchmark ticker, swap to the secondary twin
  const resolvedPeer =
    peerInfo.peerTicker === clean
      ? CANONICAL_STATARB_PEERS[clean] || {
          peerTicker: 'BBCA',
          peerName: 'Bank Central Asia Tbk',
          correlation: 0.88,
          defaultChange1D: 1.45,
          defaultReturn30D: -3.8
        }
      : peerInfo;

  // Bartram & Grinblatt (2018) Agnostic Fundamental Cross-Sectional Peer Hedonic Value:
  // Linear combination of cross-sectional peer multiples on Book Value, Operating Cash Flow, and Earnings + Dividend
  const sectorPeerMedianPer =
    stock.sector === 'Consumer Non-Cyclicals' || stock.sector === 'Healthcare'
      ? 15.8
      : stock.sector === 'Financials'
      ? 12.6
      : stock.sector === 'Infrastructures' || stock.sector === 'Technology'
      ? 14.2
      : stock.sector === 'Properties & Real Estate'
      ? 10.8
      : 8.8;
  const sectorPeerMedianPbv =
    stock.sector === 'Financials'
      ? 2.05
      : stock.sector === 'Consumer Non-Cyclicals' || stock.sector === 'Healthcare'
      ? 2.65
      : 1.45;

  const effectiveOcfForPeer =
    effectiveModule === 'Capex_Aggressor' && ocfToNetIncomeRatio > 0.50
      ? Math.max(0.90, ocfToNetIncomeRatio)
      : ocfToNetIncomeRatio;

  const qualityRelativeMultiplier = Math.max(
    0.72,
    Math.min(
      1.28,
      0.78 +
        (grossProfitabilityToAssets / 22.0) * 0.24 +
        Math.min(0.18, effectiveOcfForPeer * 0.12) +
        (forwardDividendYieldPct >= 3.0 ? 0.08 : 0) -
        (stock.isHscFlagged ? 0.35 : 0)
    )
  );

  const peerHedonicEpsPart = estimatedEpsIdr * sectorPeerMedianPer * qualityRelativeMultiplier;
  const peerHedonicBvpsPart = estimatedBvpsIdr * sectorPeerMedianPbv * qualityRelativeMultiplier;
  const rawAgnosticPeer =
    0.45 * peerHedonicEpsPart +
    0.35 * peerHedonicBvpsPart +
    0.20 * ((sectorSpecificFairValueIdr + rimFairValueIdr) / 2);
  const agnosticPeerFairValueIdr = roundToIdxTick(Math.max(50, rawAgnosticPeer));

  // Beta-Adjusted Statistical Arbitrage Pair Spread & Z-Score Calculation:
  // If Stock A has beta_A = 1.2 and Peer B has beta_B = 0.8, daily & 30D fluctuations are normalized
  // by the exact beta ratio (beta_A / beta_B) so IHSG market swings never print false convergence signals.
  const peerBetaLookup: Record<string, number> = {
    BBCA: 0.76,
    BMRI: 1.18,
    BBRI: 1.14,
    BBNI: 1.16,
    ITMG: 0.82,
    PTBA: 0.86,
    ADRO: 0.94,
    ANTM: 1.28,
    INCO: 1.24,
    MDKA: 1.35,
    ICBP: 0.58,
    INDF: 0.64,
    MYOR: 0.62,
    KLBF: 0.62,
    SIDO: 0.55,
    TLKM: 0.81,
    ISAT: 0.96,
    TOWR: 0.74,
    TBIG: 0.78,
    ASII: 0.92,
    UNTR: 0.86,
    CTRA: 1.15,
    BSDE: 1.12,
    PWON: 1.08,
    MAPI: 0.98
  };
  const stockBeta = Math.max(0.35, Number(stock.beta1Y) || 1.0);
  const peerBeta = Math.max(0.35, peerBetaLookup[resolvedPeer.peerTicker] ?? 0.95);
  const statArbBetaRatio = Number(Math.max(0.45, Math.min(2.25, stockBeta / peerBeta)).toFixed(2));

  const statArbSpread1DPct = Number(
    (stock.change1D - resolvedPeer.defaultChange1D * statArbBetaRatio).toFixed(2)
  );
  const statArbSpread30DPct = Number(
    (stock.return30D - resolvedPeer.defaultReturn30D * statArbBetaRatio).toFixed(2)
  );

  // Pair daily tracking sigma scaled by beta-adjusted volatility
  const pairSpreadSigma1D = Math.max(
    1.35,
    (stock.volatilityAnn / Math.sqrt(252)) *
      Math.sqrt(1 - Math.pow(resolvedPeer.correlation, 2)) *
      Math.sqrt((1 + statArbBetaRatio) / 2) *
      1.65
  );
  const pairSpreadSigma30D = Math.max(3.8, pairSpreadSigma1D * Math.sqrt(20) * 0.78);

  const z1D = statArbSpread1DPct / pairSpreadSigma1D;
  const z30D = statArbSpread30DPct / pairSpreadSigma30D;
  const statArbZScore = Number(
    Math.max(-3.5, Math.min(3.5, 0.55 * z1D + 0.45 * z30D)).toFixed(2)
  );

  // Context-aware healthy OCF/NI threshold for StatArb convergence:
  // Rule B ('Capex_Aggressor'): > 0.50x; Rule A ('Compounder' | 'Pure_Cyclical'): > 0.80x
  const minHealthyOcfForStatArb = effectiveModule === 'Capex_Aggressor' ? 0.50 : 0.80;

  // Mean-Reversion Target Price: If stock diverged negatively vs its high-correlation twin while fundamentals are intact,
  // calculate the cointegrated convergence price once the institutional flow shock mean-reverts.
  const expectedConvergencePct =
    !stock.isHscFlagged && ocfToNetIncomeRatio > minHealthyOcfForStatArb
      ? Math.max(-8.0, Math.min(16.0, -statArbZScore * pairSpreadSigma30D * 0.65))
      : 0;
  const rawStatArbTarget =
    0.55 * (price * (1 + expectedConvergencePct / 100)) +
    0.45 * agnosticPeerFairValueIdr;
  const statArbImpliedTargetIdr = roundToIdxTick(Math.max(50, rawStatArbTarget));

  const isCleanFundamental =
    !stock.isHscFlagged &&
    ocfToNetIncomeRatio > minHealthyOcfForStatArb &&
    grossProfitabilityToAssets >= 11.0 &&
    stock.roe >= 9.0;

  let statArbSignal: StatArbSignalType = 'FAIR_COINTEGRATED';
  let statArbSignalLabel = `Kointegrasi Seimbang vs ${resolvedPeer.peerTicker} (Z = ${statArbZScore >= 0 ? '+' : ''}${statArbZScore}σ · β-Ratio ${statArbBetaRatio}x)`;
  let statArbRationale = `Pergerakan relatif ${clean} terhadap pasangan berkorelasi tinggi ${resolvedPeer.peerTicker} (ρ = ${resolvedPeer.correlation.toFixed(2)}, Rasio β = ${stockBeta.toFixed(2)}/${peerBeta.toFixed(2)} = ${statArbBetaRatio}x) berada dalam koridor ekuilibrium wajar (Spread Beta-Adjusted 1D ${statArbSpread1DPct >= 0 ? '+' : ''}${statArbSpread1DPct}%, 30D ${statArbSpread30DPct >= 0 ? '+' : ''}${statArbSpread30DPct}%). Langkah Follow-Up: Pertahankan posisi (HOLD) ${clean} sesuai sinyal fundamental utama; belum diperlukan rotasi pasangan terhadap ${resolvedPeer.peerTicker}.`;

  if (!isCleanFundamental || stock.isHscFlagged) {
    statArbSignal = 'FUNDAMENTAL_DIVERGENCE';
    statArbSignalLabel = `Divergensi Fundamental / Non-Arbitrase (Z = ${statArbZScore >= 0 ? '+' : ''}${statArbZScore}σ)`;
    statArbRationale = `Selisih harga terhadap ${resolvedPeer.peerTicker} dipengaruhi perbedaan kualitas fundamental/kas (OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x) atau risiko konsentrasi HSC, sehingga tidak boleh diperlakukan sebagai mean-reversion murni. Langkah Follow-Up: Hindari arbitrase pasangan (pair trade) murni antara ${clean} dan ${resolvedPeer.peerTicker}; fokus pada evaluasi fundamental mandiri.`;
  } else if (statArbZScore <= -0.80 || (stock.change1D <= -1.5 && statArbSpread1DPct <= -2.0)) {
    statArbSignal = 'MEAN_REVERSION_BUY';
    statArbSignalLabel = `StatArb Long / Mean-Reversion Buy vs ${resolvedPeer.peerTicker} (Z = ${statArbZScore}σ · β-Ratio ${statArbBetaRatio}x)`;
    statArbRationale = `Anomali Relative Value Terdeteksi: Secara historis korelasi ${clean}–${resolvedPeer.peerTicker} sangat kuat (ρ = ${resolvedPeer.correlation.toFixed(2)}, dinormalisasi Rasio β ${statArbBetaRatio}x), namun ${clean} tertinggal (Spread 1D ${statArbSpread1DPct >= 0 ? '+' : ''}${statArbSpread1DPct}% · 30D ${statArbSpread30DPct >= 0 ? '+' : ''}${statArbSpread30DPct}% · Z-Score ${statArbZScore}σ) tanpa penurunan kualitas kas (OCF/NI ${ocfToNetIncomeRatio.toFixed(2)}x) dengan target konvergensi Rp ${statArbImpliedTargetIdr.toLocaleString('id-ID')}. Langkah Follow-Up: BELI / AKUMULASI ${clean} (atau lakukan rotasi taktis dari ${resolvedPeer.peerTicker} ke ${clean}) untuk menangkap potensi mean-reversion menuju Rp ${statArbImpliedTargetIdr.toLocaleString('id-ID')}.`;
  } else if (statArbZScore >= 1.25) {
    statArbSignal = 'PAIR_OVEREXTENDED_TRIM';
    statArbSignalLabel = `Relative Overextended vs ${resolvedPeer.peerTicker} (Z = +${statArbZScore}σ · β-Ratio ${statArbBetaRatio}x)`;
    statArbRationale = `${clean} telah berlari melampaui pasangan kointegrasinya ${resolvedPeer.peerTicker} (ρ = ${resolvedPeer.correlation.toFixed(2)}, Rasio β ${statArbBetaRatio}x) dengan Z-Score +${statArbZScore}σ (Spread 30D ${statArbSpread30DPct >= 0 ? '+' : ''}${statArbSpread30DPct}%). Secara Statistical Arbitrage, ruang upside relatif jangka pendek mulai menyempit dibanding ${resolvedPeer.peerTicker}. Langkah Follow-Up: TAHAN BELI BARU / JUAL SEBAGIAN (TRIM) ${clean} & ROTASI KE PAIR ${resolvedPeer.peerTicker} yang secara relatif lebih murah, atau tunggu harga ${clean} kembali ke area konvergensi Rp ${statArbImpliedTargetIdr.toLocaleString('id-ID')}.`;
  }

  return {
    agnosticPeerFairValueIdr,
    statArbPeerTicker: resolvedPeer.peerTicker,
    statArbPeerName: resolvedPeer.peerName,
    statArbCorrelation: resolvedPeer.correlation,
    statArbBetaRatio,
    statArbSpread1DPct,
    statArbSpread30DPct,
    statArbZScore,
    statArbSignal,
    statArbSignalLabel,
    statArbImpliedTargetIdr,
    statArbRationale
  };
}

/**
 * Quantedge Systematic Multi-Method Valuation + Sector-Adaptive Matrix + Statistical Arbitrage Evaluator
 * Computes:
 * 1. Primary Fair Value (`intrinsicValueIdr` — displayed in LARGEST font): Quantedge Sector-Adaptive Ensemble
 * 2. Comparator Method A: Sector-Specific Institutional Multiple (P/CF for Energy/Materials, EV/EBITDA for Telco/Infra, P/AFFO for Property/REITs, Justified PBV for Financials, Quality P/E for Consumer/Health)
 * 3. Comparator Method B: Multi-Stage Residual Income Model (Ohlson-Penman EBO with Dynamic 5-7Y ROE Fade based on GP/A & OCF/NI)
 * 4. Comparator Method C: Relative Value & Agnostic Peer Regression (Bartram-Grinblatt & Statistical Arbitrage Pair Convergence)
 */
export function evaluateJoeliardiOosFundamental(
  stock: StockMetrics,
  macroIndicators: MacroIndicator[] = DEFAULT_GLOBAL_MACRO,
  availablePortfolioCashIdr?: number
): JoeliardiOosEvaluation {
  const price = Math.max(50, stock.lastPrice);
  const der = Math.max(0.05, stock.debtToEquity);
  const opMargin = Math.max(0.5, stock.operatingMargin);
  const isInst = isInstitutionalLiquidCandidate(stock.ticker);

  // 1. CORPORATE ACTION INTERCEPTOR & FORWARD-LOOKING ANNUALIZER MIDDLEWARE
  // Intercepts stock splits/reverse splits, dynamic buybacks (Nominal / Market Cap), and latest quarterly earnings run-rates
  // BEFORE computing BVPS, EPS, Justified PBV, or Multi-Stage RIM.
  const rawAnchorPrice = resolveFundamentalAnchorPrice(stock.ticker, price);
  const rawAdtv20dIdr = estimateEmitenAdtv20dIdr(stock);
  const corpIntercept = interceptCorporateActionAndAnnualize({
    stock,
    rawAnchorPriceIdr: rawAnchorPrice,
    rawAdtv20dIdr
  });

  const anchorPrice = corpIntercept.adjustedAnchorPriceIdr;
  const trailingRoePct = corpIntercept.trailingRoePct;
  const forwardRoePct = corpIntercept.forwardAnnualizedRoePct;
  const roe = Math.max(0.5, forwardRoePct); // Forward ROE drives growth & forward valuation

  const preRouteInfo = ValuationEngine.resolveRoute(stock);
  const effectiveModule = preRouteInfo.applied_module;

  const gpAccrual = computeGrossProfitabilityAndAccruals(
    { ...stock, roe: forwardRoePct },
    stock.dividendYieldPct ?? 0,
    effectiveModule
  );
  const grossProfitabilityToAssets =
    stock.grossProfitabilityToAssets ?? gpAccrual.grossProfitabilityToAssets;
  const ocfToNetIncomeRatio = stock.ocfToNetIncomeRatio ?? gpAccrual.ocfToNetIncomeRatio;
  const accrualRatioToAssets = stock.accrualRatioToAssets ?? gpAccrual.accrualRatioToAssets;

  // Contextual Anti-Junk (OCF/NI) Penalty Policy based on effectiveModule:
  // Rule A ('Compounder' | 'Pure_Cyclical'): > 0.80x to 1.00x; Rule B ('Capex_Aggressor'): > 0.50x
  const contextualOcfPolicy = resolveContextualOcfNiPolicy({
    effectiveModule,
    ocfToNetIncomeRatio,
    accrualRatioToAssets,
    roePct: forwardRoePct
  });
  const accrualPenaltyScore = contextualOcfPolicy.accrualPenaltyScore;
  const accrualPenaltyPts = Math.round(accrualPenaltyScore * 8.5); // 0 - 20 pts on 0-100 fundamental scale

  const baseSectorPbv =
    stock.sector === 'Financials'
      ? roe >= 18
        ? 2.25
        : 1.15
      : stock.sector === 'Consumer Non-Cyclicals' || stock.sector === 'Healthcare'
      ? 2.45
      : stock.sector === 'Energy'
      ? 1.35
      : stock.sector === 'Basic Materials'
      ? 1.55
      : 1.45;

  // Fundamental BVPS & EPS anchored on split-adjusted baseline via applyDynamicCorporateActionDivisor
  const anchorFairPbvBaseline = Math.max(
    0.45,
    Math.min(7.5, baseSectorPbv * (Math.max(10.5, trailingRoePct) / 16.5) * 0.88)
  );
  const unadjustedBvpsIdr = Math.max(25, Math.round(rawAnchorPrice / anchorFairPbvBaseline));
  const unadjustedTrailingEpsIdr = Math.max(2, Math.round((unadjustedBvpsIdr * trailingRoePct) / 100));

  const splitAdjustedStatic = applyDynamicCorporateActionDivisor({
    rawBvpsIdr: unadjustedBvpsIdr,
    rawEpsIdr: unadjustedTrailingEpsIdr,
    rawTargetPriceIdr: rawAnchorPrice,
    rawAdtv20dIdr,
    splitRatioDivisor: corpIntercept.splitRatioDivisor
  });

  const estimatedBvpsIdr = splitAdjustedStatic.bvpsIdr;
  const trailingEpsIdr = splitAdjustedStatic.epsIdr;
  const adtv20dIdr = splitAdjustedStatic.adtv20dIdr;
  void anchorPrice;

  // Multi-Tenor SBN Spot Curve (1Y, 5Y, 10Y) & Dynamic Cost of Equity (Ke)
  const prelimDivYield = stock.forwardDividendYieldPct ?? stock.dividendYieldPct ?? 2.5;
  const sbnCurve = computeSbnSpotYieldCurveAndKe(stock, prelimDivYield, macroIndicators);
  const {
    sbnSpot1YPct,
    sbnSpot5YPct,
    sbnSpot10YPct,
    sbnBlendedSpotRfPct,
    erpBenchmarkPct,
    dynamicCostOfEquityPct
  } = sbnCurve;

  // Quarterly Earnings Annualizer (Q1 * 4/1, Q2 * 4/2, Q3 * 4/3, Q4 * 1)
  const annualizedEarnings = annualizeQuarterlyEarnings({
    quarterLabel: corpIntercept.latestQuarterLabel,
    trailingEpsIdr,
    bvpsIdr: estimatedBvpsIdr,
    trailingRoePct,
    earningsGrowthYoYPct: corpIntercept.earningsGrowthYoYPct,
    historicalDprPct: stock.historicalDpr3YPct ?? 45,
    costOfEquityPct: dynamicCostOfEquityPct
  });

  const estimatedEpsIdr = Math.max(
    2,
    Math.round((estimatedBvpsIdr * roe) / 100) || annualizedEarnings.forwardEpsIdr
  );
  const impliedPbv = Number(Math.max(0.35, Math.min(12.5, price / estimatedBvpsIdr)).toFixed(2));
  const impliedPer = Number(Math.max(2.0, Math.min(75.0, price / estimatedEpsIdr)).toFixed(2));

  // Forward Dividend, Net Payout Yield & Hybrid TSY (Sanitizes >5% special dividend outliers & eliminates EPS double-counting)
  const forwardDivData = calculateForwardDividend(
    stock,
    estimatedEpsIdr,
    estimatedBvpsIdr,
    corpIntercept.dynamicBuybackYieldPct,
    corpIntercept.buybackNominalIdr,
    corpIntercept.liveMarketCapIdr
  );
  const {
    annualizedEpsQ3Idr,
    historicalDpr3YPct,
    estimatedForwardDpsIdr,
    forwardDividendYieldPct,
    netPayoutYieldPct,
    netDebtPaydownYieldPct,
    netBuybackDebtPaydownYieldPct,
    totalShareholderYieldPct,
    isDividendOutlierSanitized
  } = forwardDivData;

  // Damodaran (2012) Forward Valuation: Justified PBV = (Forward_ROE_sustainable - g) / (Ke - g)
  // Parameter Growth (g) strictly pulls from Forward Annualized ROE (`roe`)
  const sustainableRoe = Math.min(30.5, roe * (grossProfitabilityToAssets >= 20 ? 1.04 : 0.99));
  const retentionRatio = Math.max(0.15, 1 - historicalDpr3YPct / 100);
  const rawGrowth = sustainableRoe * retentionRatio * 0.48;
  const sustainableGrowthRatePct = Number(
    Math.max(2.0, Math.min(6.8, Math.min(rawGrowth, dynamicCostOfEquityPct - 2.2))).toFixed(2)
  );

  const damodaranJustifiedPbv = Number(
    Math.max(
      0.45,
      Math.min(
        5.5,
        ((sustainableRoe - sustainableGrowthRatePct) /
          Math.max(2.1, dynamicCostOfEquityPct - sustainableGrowthRatePct)) *
          corpIntercept.catalystValuationMultiplier
      )
    ).toFixed(2)
  );

  const derPenaltyMultiplier = der <= 0.6 ? 1.05 : der <= 1.2 ? 0.95 : 0.78;
  const divQualityMultiplier =
    totalShareholderYieldPct >= 4.5
      ? 1.12
      : forwardDividendYieldPct > 0 || corpIntercept.hasActiveBuyback
      ? 1.05
      : 0.9;
  const accrualQualityMultiplier = contextualOcfPolicy.accrualQualityMultiplier;
  const hscDiscountMultiplier = stock.isHscFlagged ? 0.55 : 1.0;

  const standaloneFairPbv = Number(
    Math.max(
      0.5,
      Math.min(
        5.2,
        damodaranJustifiedPbv *
          derPenaltyMultiplier *
          divQualityMultiplier *
          accrualQualityMultiplier *
          hscDiscountMultiplier
      )
    ).toFixed(2)
  );
  const standaloneFairPer = Number(
    Math.max(
      5.5,
      Math.min(
        24.0,
        (100 / Math.max(7.2, dynamicCostOfEquityPct - sustainableGrowthRatePct * 0.58) +
          totalShareholderYieldPct * 0.35) *
          corpIntercept.catalystValuationMultiplier *
          derPenaltyMultiplier *
          accrualQualityMultiplier *
          hscDiscountMultiplier
      )
    ).toFixed(2)
  );

  // METHOD 1: Multi-Stage Residual Income Model (Ohlson-Penman EBO with Sectoral Dynamic ω Fade Factor)
  const rimResult = computeMultiStageResidualIncomeValue({
    ticker: stock.ticker,
    sector: stock.sector,
    bvps0: estimatedBvpsIdr,
    roePct: roe, // Forward Annualized ROE
    kePct: dynamicCostOfEquityPct,
    dprPct: historicalDpr3YPct,
    gpaPct: grossProfitabilityToAssets,
    ocfToNi: ocfToNetIncomeRatio,
    der,
    accrualPenaltyScore,
    hscDiscountMultiplier: hscDiscountMultiplier * corpIntercept.catalystValuationMultiplier,
    effectiveModule
  });
  const { rimFairValueIdr, rimFadeYears, rimPersistenceOmega, rimTerminalRoePct } = rimResult;

  // METHOD 2: Modular ValuationEngine Router (Steady Compounder, Capex Aggressor, or Pure Cyclical)
  const routedValResult = ValuationEngine.calculateFairValue({
    stock: { ...stock, roe, accrualRatioToAssets },
    price,
    ttmEpsIdr: trailingEpsIdr,
    forwardEpsIdr: estimatedEpsIdr,
    currentBvpsIdr: estimatedBvpsIdr,
    ttmRoePct: trailingRoePct,
    forwardRoePct: roe,
    ocfToNetIncomeRatio,
    grossProfitabilityToAssets,
    dynamicCostOfEquityPct,
    baseGrowthRatePct: sustainableGrowthRatePct,
    derPenaltyMultiplier,
    accrualQualityMultiplier,
    hscDiscountMultiplier,
    catalystValuationMultiplier: corpIntercept.catalystValuationMultiplier,
    rimFairValueIdr,
    rimFadeYears,
    rimPersistenceOmega,
    sbn10YYieldPct: sbnSpot10YPct || 6.75,
    tickRounder: roundToIdxTick
  });

  // Also run legacy sector matrix for supplementary diagnostic comparison if needed
  const legacySectorResult = computeSectorSpecificValuation({
    stock: { ...stock, roe },
    price,
    estimatedEpsIdr,
    estimatedBvpsIdr,
    ocfToNetIncomeRatio,
    grossProfitabilityToAssets,
    dynamicCostOfEquityPct,
    sustainableGrowthRatePct,
    standaloneFairPbv,
    standaloneFairPer,
    derPenaltyMultiplier: derPenaltyMultiplier * corpIntercept.catalystValuationMultiplier,
    accrualQualityMultiplier,
    hscDiscountMultiplier,
    rimFairValueIdr,
    rimFadeYears,
    rimPersistenceOmega
  });
  void legacySectorResult;

  const {
    route: valuationModuleRoute,
    moduleLabel: valuationModuleLabel,
    sectorValuationArchetype,
    sectorPrimaryMetricShort,
    sectorPrimaryMetricLabel,
    sectorPrimaryImpliedMultiple,
    sectorPrimaryFairMultiple,
    sectorPrimaryPerShareIdr,
    sectorPrimaryPerShareLabel,
    sectorSpecificFairValueIdr,
    sectorAcademicRationale,
    cwipToAssetsRatio,
    capexToDaRatio,
    capexToRevenueRatio,
    isCapexOverrideTriggered,
    ui_notifications: routedUiNotifications,
    normalizedEps7YIdr,
    normalizedRoePct,
    pbv10YMean,
    pbv10YStdDev,
    pbvZScore,
    isCyclicalStrongBuyZScore,
    isCyclicalDerPenalized,
    basisEpsForBenchmarkIdr,
    adjustedGrowthRatePct
  } = routedValResult;

  // METHOD 3 & 4: Agnostic Cross-Sectional Peer Valuation & Beta-Adjusted Statistical Arbitrage
  const splitCalibratedStock: StockMetrics =
    Math.abs(corpIntercept.splitRatioDivisor - 1) > 1e-4 && stock.return30D < -35
      ? { ...stock, return30D: Number((stock.change1D * 3.5).toFixed(2)) }
      : stock;

  const statArbResult = computeStatArbAndAgnosticPeerValuation({
    stock: splitCalibratedStock,
    price,
    estimatedEpsIdr,
    estimatedBvpsIdr,
    ocfToNetIncomeRatio,
    grossProfitabilityToAssets,
    forwardDividendYieldPct: totalShareholderYieldPct,
    sectorSpecificFairValueIdr,
    rimFairValueIdr,
    effectiveModule
  });
  const {
    agnosticPeerFairValueIdr,
    statArbPeerTicker,
    statArbPeerName,
    statArbCorrelation,
    statArbBetaRatio,
    statArbSpread1DPct,
    statArbSpread30DPct,
    statArbZScore,
    statArbSignal,
    statArbSignalLabel,
    statArbImpliedTargetIdr,
    statArbRationale
  } = statArbResult;

  // STANDALONE GRAHAM-JOELIARDI "MOAT" INTRINSIC VALUE BENCHMARK (Floor Value, NEVER averaged into main Ensemble)
  const grahamBenchmark = calculateGrahamJoeliardiBenchmark({
    basisEpsIdr: basisEpsForBenchmarkIdr,
    growthRatePct: adjustedGrowthRatePct,
    sbn10YYieldPct: sbnSpot10YPct || 6.75,
    roePct: valuationModuleRoute === 'PURE_CYCLICAL' ? normalizedRoePct : roe,
    derRatio: der,
    tickRounder: roundToIdxTick
  });

  // DYNAMIC ENSEMBLE WEIGHTING MODULE (DynamicEnsembleWeighter):
  // Adjusts weights by sector alignment, Contextual Anti-Junk (OCF/NI) Rule A/B thresholds,
  // Data Confidence Triggers (OCF < 0 -> P/CF 0%; Peer ρ < 0.70 -> RelVal 0%),
  // and Outlier Penalty (> 40% deviation from median -> slash weight by 50%).
  const dynamicEnsemble = DynamicEnsembleWeighter.computeWeights({
    sector: stock.sector,
    route: valuationModuleRoute,
    effectiveModule,
    sectorLabel: `Modul Sektor (${sectorPrimaryMetricShort})`,
    sectorPriceIdr: sectorSpecificFairValueIdr,
    rimLabel: `RIM ${rimFadeYears}Y (ω=${rimPersistenceOmega})`,
    rimPriceIdr: rimFairValueIdr,
    relValLabel: `RelVal vs ${statArbPeerTicker}`,
    relValPriceIdr: statArbImpliedTargetIdr,
    ocfToNetIncomeRatio,
    peerCorrelation: statArbCorrelation,
    hscDiscountMultiplier: 1.0, // Already applied inside each leg
    tickRounder: roundToIdxTick
  });

  const ensembleAgg = computeTypeSafeEnsembleFairValue(
    dynamicEnsemble.legs,
    1.0,
    roundToIdxTick,
    dynamicEnsemble.ensembleAntiJunkMultiplier
  );
  const intrinsicValueIdr = ensembleAgg.intrinsicValueIdr;
  const ensembleFormulaAudit = ensembleAgg.ensembleFormulaAudit;

  // Package final comprehensive ValuationReport object (including Capex Override ui_notifications & Contextual OCF/NI metadata)
  const finalValuationReport = ValuationEngine.packageValuationReport({
    target_price: intrinsicValueIdr,
    route: valuationModuleRoute,
    dynamic_weights: {
      pcf: Number(dynamicEnsemble.legs[0].weight.toFixed(4)),
      rim: Number(dynamicEnsemble.legs[1].weight.toFixed(4)),
      relval: Number(dynamicEnsemble.legs[2].weight.toFixed(4))
    },
    graham_benchmark: grahamBenchmark.grahamJoeliardiBenchmarkIdr,
    ui_notifications: routedUiNotifications,
    ocf_healthy_threshold: dynamicEnsemble.ocfHealthyThreshold,
    ensemble_anti_junk_multiplier: dynamicEnsemble.ensembleAntiJunkMultiplier
  });

  // Pegged Fair Multiples: Strictly synchronized with final Quantedge Ensemble Intrinsic Value
  const joeliardiFairPer = Number((intrinsicValueIdr / Math.max(1, estimatedEpsIdr)).toFixed(2));
  const joeliardiFairPbv = Number((intrinsicValueIdr / Math.max(1, estimatedBvpsIdr)).toFixed(2));

  const marginOfSafetyPct = Number(
    (((intrinsicValueIdr - price) / Math.max(1, intrinsicValueIdr)) * 100).toFixed(1)
  );

  // Build Structured Multi-Method Valuation Comparison Array (Primary Ensemble + 3 Dynamic Legs + Standalone Graham-Joeliardi Benchmark Floor)
  const calcMos = (fairIdr: number) =>
    Number((((fairIdr - price) / Math.max(1, fairIdr)) * 100).toFixed(1));

  const wSecPct = Math.round(dynamicEnsemble.legs[0].weight * 100);
  const wRimPct = Math.round(dynamicEnsemble.legs[1].weight * 100);
  const wRelPct = Math.round(dynamicEnsemble.legs[2].weight * 100);

  const valuationMethodsComparison: ValuationMethodComparisonItem[] = [
    {
      id: 'quantedge_ensemble',
      name: `Quantedge Dynamic Ensemble (${valuationModuleLabel})`,
      shortLabel: 'Quantedge Ensemble',
      metricBasis: `${wSecPct}% ${sectorPrimaryMetricShort} + ${wRimPct}% RIM (${rimFadeYears}Y, ω=${rimPersistenceOmega}) + ${wRelPct}% RelVal (${ensembleFormulaAudit})`,
      impliedMultipleLabel: `PER ${impliedPer}x · PBV ${impliedPbv}x`,
      fairMultipleLabel: `Wajar PER ${joeliardiFairPer}x · PBV ${joeliardiFairPbv}x`,
      fairPriceIdr: intrinsicValueIdr,
      mosPct: marginOfSafetyPct,
      weightPct: 100,
      isPrimaryEnsemble: true
    },
    {
      id: 'sector_specific_matrix',
      name: `${sectorPrimaryMetricLabel}`,
      shortLabel: `Modul (${sectorPrimaryMetricShort})`,
      metricBasis: `${sectorPrimaryPerShareLabel}: Rp ${sectorPrimaryPerShareIdr.toLocaleString('id-ID')}/shm${dynamicEnsemble.legs[0].isOutlierSlashed ? ' [Outlier -50% Bobot]' : ''}`,
      impliedMultipleLabel: `Implied ${sectorPrimaryMetricShort} ${sectorPrimaryImpliedMultiple}x`,
      fairMultipleLabel: `Wajar ${sectorPrimaryMetricShort} ${sectorPrimaryFairMultiple}x`,
      fairPriceIdr: sectorSpecificFairValueIdr,
      mosPct: calcMos(sectorSpecificFairValueIdr),
      weightPct: wSecPct,
      isSectorPrimary: true
    },
    {
      id: 'multistage_rim',
      name: `Multi-Stage Residual Income (Ohlson-Penman ${rimFadeYears}Y · ω=${rimPersistenceOmega})`,
      shortLabel: `RIM ${rimFadeYears}Y Fade`,
      metricBasis: `BVPS Rp ${estimatedBvpsIdr.toLocaleString('id-ID')} · Fwd ROE ${roe.toFixed(1)}% · ω=${rimPersistenceOmega}${wRimPct === 0 ? ' [Dimatikan pada Siklikal/Properti]' : dynamicEnsemble.legs[1].isOutlierSlashed ? ' [Outlier -50% Bobot]' : ''}`,
      impliedMultipleLabel: `Implied PBV ${impliedPbv}x`,
      fairMultipleLabel: `Justified PBV ${damodaranJustifiedPbv}x`,
      fairPriceIdr: rimFairValueIdr,
      mosPct: calcMos(rimFairValueIdr),
      weightPct: wRimPct
    },
    {
      id: 'statarb_relative_peer',
      name: `Beta-Adjusted StatArb vs ${statArbPeerTicker} (ρ=${statArbCorrelation.toFixed(2)} · β-Ratio ${statArbBetaRatio}x)`,
      shortLabel: `RelVal vs ${statArbPeerTicker}`,
      metricBasis: `Z-Score ${statArbZScore >= 0 ? '+' : ''}${statArbZScore}σ · Peer Hedonic Rp ${agnosticPeerFairValueIdr.toLocaleString('id-ID')}${wRelPct === 0 ? ' [ρ < 0.70 → Bobot 0%]' : dynamicEnsemble.legs[2].isOutlierSlashed ? ' [Outlier -50% Bobot]' : ''}`,
      impliedMultipleLabel: `Spread 1D ${statArbSpread1DPct >= 0 ? '+' : ''}${statArbSpread1DPct}%`,
      fairMultipleLabel: `Spread 30D ${statArbSpread30DPct >= 0 ? '+' : ''}${statArbSpread30DPct}%`,
      fairPriceIdr: statArbImpliedTargetIdr,
      mosPct: calcMos(statArbImpliedTargetIdr),
      weightPct: wRelPct
    },
    {
      id: 'graham_joeliardi_benchmark',
      name: `Graham-Joeliardi "Moat" Benchmark (Standalone Floor Value)`,
      shortLabel: `Graham-Joeliardi Floor`,
      metricBasis: `${grahamBenchmark.formulaAudit} — ${grahamBenchmark.moatHaircutReason}`,
      impliedMultipleLabel: `SBN 10Y ${sbnSpot10YPct.toFixed(2)}%`,
      fairMultipleLabel: grahamBenchmark.isMoatHaircutApplied ? `Haircut -25% (×0,75)` : `Full Moat (×1,00)`,
      fairPriceIdr: grahamBenchmark.grahamJoeliardiBenchmarkIdr,
      mosPct: calcMos(grahamBenchmark.grahamJoeliardiBenchmarkIdr),
      weightPct: 0,
      isStandaloneBenchmark: true
    }
  ];

  // Earnings Yield & Quantedge Composite Multi-Metric Yield vs Blended SBN Spot Rate (1Y/5Y/10Y) & Dynamic Ke
  const earningsYieldPct = impliedPer > 0 ? 100 / impliedPer : 0;
  const sectorPrimaryYieldPct =
    sectorPrimaryImpliedMultiple > 0 ? 100 / sectorPrimaryImpliedMultiple : earningsYieldPct;
  const quantedgeCompositeYieldPct = Number(
    (
      0.45 * sectorPrimaryYieldPct +
      0.30 * earningsYieldPct +
      0.25 * totalShareholderYieldPct
    ).toFixed(2)
  );
  const rawSbnSpreadPct = Number((earningsYieldPct - sbnBlendedSpotRfPct).toFixed(2));
  const netErpSpreadPct = Number((earningsYieldPct - dynamicCostOfEquityPct).toFixed(2));

  // 20-Day ADTV & 5% Daily Liquidity Cap + Beta-Weighted Position Sizing Cap (1/Beta Barbell)
  // Validated against real remaining portfolio cash (`availablePortfolioCashIdr`) per confirmed user rule:
  // Real Allocation = min(Target 1/Beta Cap IDR, availablePortfolioCashIdr, 5% ADTV 20D)
  const maxSafeAllocationIdr = Math.round(adtv20dIdr * 0.05);
  const effectiveBeta = Math.max(0.35, Number(stock.beta1Y) || 1.0);
  const betaWeightedSizingCapPct = Number(
    Math.max(3.5, Math.min(18.0, 12.5 / effectiveBeta)).toFixed(1)
  );
  const referenceCapitalIdr =
    typeof availablePortfolioCashIdr === 'number' && availablePortfolioCashIdr > 0
      ? availablePortfolioCashIdr
      : 2_000_000_000;
  const targetBetaNominalIdr = Math.round(referenceCapitalIdr * (betaWeightedSizingCapPct / 100));
  const realCashCappedAllocationIdr =
    typeof availablePortfolioCashIdr === 'number' && availablePortfolioCashIdr > 0
      ? Math.min(targetBetaNominalIdr, Math.round(availablePortfolioCashIdr), maxSafeAllocationIdr)
      : Math.min(targetBetaNominalIdr, maxSafeAllocationIdr);

  // Defensive Discount Anomaly Override (Beta < 0.5 AND Value Score > 9.0)
  const isDefensiveDiscountAnomaly =
    !stock.isHscFlagged && stock.beta1Y < 0.5 && stock.dmuValueScore > 9.0;

  // STATE-BASED RECOMMENDATION ENGINE (Dynamic Decision Tree, Dynamic MoS & Catalyst Override Flag)
  const decisionTree = evaluateDynamicDecisionTree({
    isHscFlagged: Boolean(stock.isHscFlagged),
    isDefensiveDiscountAnomaly,
    isCyclicalStrongBuyZScore,
    pbvZScore,
    hasActiveBuyback: corpIntercept.hasActiveBuyback,
    hasActiveCatalyst: corpIntercept.hasActiveCatalyst,
    earningsGrowthYoYPct: corpIntercept.earningsGrowthYoYPct,
    forwardRoePct: roe,
    costOfEquityPct: dynamicCostOfEquityPct,
    marginOfSafetyPct,
    dmuCompositeScore: stock.dmuCompositeScore,
    lastPriceIdr: price,
    intrinsicValueIdr,
    tickRounder: roundToIdxTick
  });

  // Undercut / Deep Discount Detection
  const intrinsicAccumCeiling = roundToIdxTick(
    intrinsicValueIdr * (1 - decisionTree.dynamicRequiredMosPct / 100)
  );
  const isUndercutDeepDiscount =
    !stock.isHscFlagged &&
    (price <= intrinsicAccumCeiling ||
      decisionTree.decisionState === 'BUY_ON_STRENGTH_CATALYST' ||
      decisionTree.decisionState === 'STRONG_BUY_CYCLICAL_ZSCORE' ||
      decisionTree.decisionState === 'ACCUMULATE_QUALITY_FAIR_VALUE');

  // Pillar 1: Business Quality & Gross Profitability Moat (Novy-Marx GP/A + Forward ROE - Accrual Penalty) (0 - 100)
  const gpaScore = Math.min(48, (grossProfitabilityToAssets / 24) * 44);
  const roeScore = Math.min(28, (roe / 20) * 24);
  const moatBonus =
    (isInst ? 14 : 4) +
    (totalShareholderYieldPct > 0 ? 10 : 0) +
    (corpIntercept.isCatalystActive ? 5 : 0);
  const businessQualityScore = Math.round(
    Math.max(15, Math.min(98, gpaScore + roeScore + moatBonus - accrualPenaltyPts * 0.6))
  );

  // Pillar 2: Balance Sheet Health & Anti-Junk Cashflow Reality (Asness QMJ OCF/NI & DER) (0 - 100)
  const cyclicalDerPenaltyPts = isCyclicalDerPenalized ? 14 : 0;
  const derScore = Math.max(10, Math.min(48, 48 - der * 20 - cyclicalDerPenaltyPts));
  const ocfConversionBonus =
    effectiveModule === 'Capex_Aggressor'
      ? ocfToNetIncomeRatio >= 0.85
        ? 22
        : ocfToNetIncomeRatio > 0.50
        ? 16
        : ocfToNetIncomeRatio >= 0
        ? 4
        : -12
      : ocfToNetIncomeRatio >= 1.0
      ? 22
      : ocfToNetIncomeRatio > 0.80
      ? 14
      : ocfToNetIncomeRatio >= 0
      ? -4
      : -16;
  const cashDivScore =
    totalShareholderYieldPct >= 5
      ? 22
      : totalShareholderYieldPct >= 2
      ? 16
      : totalShareholderYieldPct > 0
      ? 10
      : 3;
  const kseiDividendPenaltyPts =
    stock.hscTier === 'KSEI_DIVIDEND_PENALTY'
      ? Math.round((stock.kseiHscScorePenaltyPts || 0.45) * 9)
      : 0;
  const hscSolvencyBonus = stock.isHscFlagged
    ? -25
    : stock.hscTier === 'KSEI_DIVIDEND_PENALTY'
    ? -kseiDividendPenaltyPts
    : isInst
    ? 10
    : 5;
  const balanceSheetHealthScore = Math.round(
    Math.max(
      12,
      Math.min(
        98,
        derScore + ocfConversionBonus + cashDivScore + hscSolvencyBonus - accrualPenaltyPts * 0.5
      )
    )
  );

  // Pillar 3: Multi-Method Ensemble Valuation & Sector-Specific Margin of Safety (0 - 100)
  const mosScore = Math.max(
    10,
    Math.min(
      65,
      38 +
        marginOfSafetyPct * 1.15 +
        (decisionTree.decisionState === 'BUY_ON_STRENGTH_CATALYST' ||
        decisionTree.decisionState === 'STRONG_BUY_CYCLICAL_ZSCORE'
          ? 8
          : 0)
    )
  );
  const valueFactorContribution = (stock.dmuValueScore / 10) * 35;
  const valuationSafetyScore = Math.round(
    Math.max(10, Math.min(98, mosScore + valueFactorContribution - (stock.isHscFlagged ? 25 : 0)))
  );

  // Pillar 4: Out-of-Sample (OOS) Quant & Statistical Arbitrage Robustness (0 - 100)
  const oosCompositePart = (stock.dmuCompositeScore / 10) * 46;
  const oosLowVolPart = (stock.dmuLowVolScore / 10) * 28;
  const oosSizePart = (stock.dmuSizeScore / 10) * 18;
  const statArbBonus =
    statArbSignal === 'MEAN_REVERSION_BUY'
      ? 8
      : statArbSignal === 'FAIR_COINTEGRATED'
      ? 4
      : statArbSignal === 'PAIR_OVEREXTENDED_TRIM'
      ? -2
      : -8;
  const oosQuantRobustnessScore = Math.round(
    Math.max(
      10,
      Math.min(
        98,
        oosCompositePart + oosLowVolPart + oosSizePart + statArbBonus - kseiDividendPenaltyPts * 0.5
      )
    )
  );

  const totalConvictionScore = Math.round(
    0.30 * businessQualityScore +
      0.25 * balanceSheetHealthScore +
      0.25 * valuationSafetyScore +
      0.20 * oosQuantRobustnessScore
  );

  // Quantedge Systematic Score & Verdict
  const quantedgeSystematicScore = Math.round(
    Math.max(
      12,
      Math.min(
        99,
        0.35 * valuationSafetyScore +
          0.35 * businessQualityScore +
          0.30 * oosQuantRobustnessScore
      )
    )
  );
  const quantedgeAlphaVerdict =
    stock.isHscFlagged
      ? 'AVOID / HSC MICROSTRUCTURE RISK'
      : decisionTree.decisionState === 'STRONG_BUY_CYCLICAL_ZSCORE'
      ? `STRONG BUY CYCLICAL FLOOR: PBV Z-SCORE ${pbvZScore}σ ≤ -1.5σ vs 10Y MEAN (${pbv10YMean}x)`
      : decisionTree.decisionState === 'BUY_ON_STRENGTH_CATALYST'
      ? `BUY ON STRENGTH: ${corpIntercept.catalystBadgeLabel || 'MOMENTUM FUNDAMENTAL AKTIF'} (Fwd ROE ${roe.toFixed(1)}% · TSY ${totalShareholderYieldPct.toFixed(2)}%)`
      : statArbSignal === 'MEAN_REVERSION_BUY' && marginOfSafetyPct >= 8
      ? `QUANTEDGE HIGH-ALPHA: DISLOKASI STAT-ARB (${statArbZScore}σ vs ${statArbPeerTicker}) + DISKON ${sectorPrimaryMetricShort}`
      : quantedgeSystematicScore >= 78
      ? `QUANTEDGE TOP SYSTEMATIC COMPOUNDER (${valuationModuleRoute} · ω=${rimPersistenceOmega})`
      : quantedgeSystematicScore >= 62
      ? `QUANTEDGE FAIR RELATIVE EQUILIBRIUM (KOINTEGRASI ${statArbPeerTicker})`
      : 'QUANTEDGE DEFENSIVE WATCH / TUNGGU MEAN-REVERSION';

  let valuationVerdict: JoeliardiOosEvaluation['valuationVerdict'] = 'FAIR_QUALITY';
  let valuationLabel = `Wajar Berkualitas (${sectorPrimaryMetricShort} ${sectorPrimaryImpliedMultiple}x vs Wajar ${sectorPrimaryFairMultiple}x)`;
  if (stock.isHscFlagged || totalConvictionScore < 45) {
    valuationVerdict = 'OVERVALUED_OR_TRAP';
    valuationLabel = stock.isHscFlagged
      ? stock.hscTier === 'EARLY_WARNING_SUSPECT'
        ? 'Peringatan Suspect HSC / Early Warning Quant (Hindari)'
        : 'Peringatan Indikasi HSC BEI-KSEI / Spekulatif (Hindari)'
      : 'Mahal / Risiko Value Trap (Margin of Safety Negatif)';
  } else if (isCyclicalStrongBuyZScore) {
    valuationVerdict = 'STRONG_UNDERVALUED';
    valuationLabel = `Strong Buy Siklikal: PBV Z-Score ${pbvZScore}σ ≤ -1.5σ (MoS +${marginOfSafetyPct}%)`;
  } else if (isDefensiveDiscountAnomaly) {
    valuationVerdict = 'STRONG_UNDERVALUED';
    valuationLabel = `Strong Buy: Anomali Aset Defensif Terdiskon (MoS +${marginOfSafetyPct}%)`;
  } else if (decisionTree.decisionState === 'BUY_ON_STRENGTH_CATALYST') {
    valuationVerdict = marginOfSafetyPct >= 8 ? 'STRONG_UNDERVALUED' : 'FAIR_QUALITY';
    valuationLabel = `Buy on Strength (${corpIntercept.hasActiveBuyback ? `Buyback +${corpIntercept.dynamicBuybackYieldPct}%` : `Laba Q +${corpIntercept.earningsGrowthYoYPct}%`} · MoS ${marginOfSafetyPct >= 0 ? '+' : ''}${marginOfSafetyPct}%)`;
  } else if (decisionTree.decisionState === 'ACCUMULATE_QUALITY_FAIR_VALUE') {
    valuationVerdict = 'STRONG_UNDERVALUED';
    valuationLabel = `Akumulasi Compounder di Fair Value (Excess Return +${decisionTree.excessReturnSpreadPct}% · MoS +${marginOfSafetyPct}%)`;
  } else if (statArbSignal === 'MEAN_REVERSION_BUY' && marginOfSafetyPct >= 8) {
    valuationVerdict = 'STRONG_UNDERVALUED';
    valuationLabel = `StatArb Mean-Reversion Buy vs ${statArbPeerTicker} (Z=${statArbZScore}σ · MoS +${marginOfSafetyPct}%)`;
  } else if (marginOfSafetyPct >= 15 && stock.dmuValueScore >= 6.8) {
    valuationVerdict = 'STRONG_UNDERVALUED';
    valuationLabel = `Diskon Ensemble ${sectorPrimaryMetricShort} & RIM ${rimFadeYears}Y (MoS +${marginOfSafetyPct}%)`;
  } else if (marginOfSafetyPct < -12) {
    valuationVerdict = 'FULLY_VALUED';
    valuationLabel = `Premium / Di Atas Nilai Intrinsik Ensemble (${sectorPrimaryMetricShort} ${sectorPrimaryImpliedMultiple}x)`;
  }

  const convictionGrade: JoeliardiOosEvaluation['convictionGrade'] = stock.isHscFlagged
    ? 'D (AVOID / HSC)'
    : totalConvictionScore >= 82 ||
      isDefensiveDiscountAnomaly ||
      isCyclicalStrongBuyZScore ||
      (decisionTree.decisionState === 'BUY_ON_STRENGTH_CATALYST' && totalConvictionScore >= 74)
    ? 'A+ (CORE CONVICTION)'
    : totalConvictionScore >= 72
    ? 'A (SOLID VALUE)'
    : totalConvictionScore >= 58
    ? 'B (WATCHLIST / HOLD)'
    : 'C (SPECULATIVE)';

  const keyStrengths: string[] = [];
  const keyRisks: string[] = [];

  keyStrengths.push(
    `Router ValuationEngine [${valuationModuleLabel}]: Bobot Ensemble Dinamis (${wSecPct}% Sektor + ${wRimPct}% RIM ω=${rimPersistenceOmega} + ${wRelPct}% RelVal) menghasilkan Nilai Intrinsik Rp ${intrinsicValueIdr.toLocaleString('id-ID')} | Floor Mandiri Graham-Joeliardi: Rp ${grahamBenchmark.grahamJoeliardiBenchmarkIdr.toLocaleString('id-ID')} (${grahamBenchmark.isMoatHaircutApplied ? 'Haircut -25%' : 'Full Moat'}).`
  );

  if (corpIntercept.isCatalystActive) {
    keyStrengths.push(
      `Katalis Fundamental & Korporasi Aktif (${corpIntercept.latestQuarterLabel}, Annualizer Q${corpIntercept.detectedQuarter} ×${corpIntercept.annualizationFactor.toFixed(2)}): ${corpIntercept.catalystNarrative} Forward Annualized ROE naik dari ${trailingRoePct.toFixed(1)}% (Trailing) menjadi ${forwardRoePct.toFixed(1)}% (Forward EPS Rp ${estimatedEpsIdr.toLocaleString('id-ID')}/saham).`
    );
  }
  if (corpIntercept.hasActiveBuyback && corpIntercept.dynamicBuybackYieldPct > 0) {
    keyStrengths.push(
      `Injeksi Likuiditas Share Buyback Aktif: Mandat buyback Rp ${(corpIntercept.buybackNominalIdr / 1_000_000_000).toLocaleString('id-ID')} Miliar terhadap Market Cap Rp ${(corpIntercept.liveMarketCapIdr / 1_000_000_000_000).toFixed(2)} Triliun menyumbang Buyback Yield +${corpIntercept.dynamicBuybackYieldPct.toFixed(2)}% ke dalam Net Payout Yield (${netPayoutYieldPct.toFixed(2)}%) & TSY (${totalShareholderYieldPct.toFixed(2)}%).`
    );
  }
  if (isCyclicalStrongBuyZScore) {
    keyStrengths.push(
      `Strong Buy Siklikal (PBV Z-Score ${pbvZScore}σ ≤ -1,5σ): Diperdagangkan jauh di bawah rata-rata PBV 10 tahun (${pbv10YMean}x) dengan Normalized 7Y EPS Rp ${normalizedEps7YIdr.toLocaleString('id-ID')}/shm dan neraca sehat (DER ${der.toFixed(2)}x ≤ 1,0x).`
    );
  }
  if (isDefensiveDiscountAnomaly) {
    keyStrengths.push(
      `Strong Buy — Anomali Aset Defensif Terdiskon: Kombinasi Beta sangat rendah (${stock.beta1Y.toFixed(2)}x) dan Skor Value/GP-A tinggi (${stock.dmuValueScore.toFixed(1)}/10) mengonfirmasi koreksi jangka pendek sebagai peluang akumulasi utama.`
    );
  }
  if (statArbSignal === 'MEAN_REVERSION_BUY') {
    keyStrengths.push(
      `Sinyal Beta-Adjusted Statistical Arbitrage (Relative Value vs ${statArbPeerTicker}, ρ = ${statArbCorrelation.toFixed(2)}, β-Ratio = ${statArbBetaRatio}x): Terdeteksi dislokasi Z-Score ${statArbZScore}σ (Spread 1D ${statArbSpread1DPct >= 0 ? '+' : ''}${statArbSpread1DPct}%, 30D ${statArbSpread30DPct >= 0 ? '+' : ''}${statArbSpread30DPct}%) tanpa penurunan fundamental, membuka potensi konvergensi ke Rp ${statArbImpliedTargetIdr.toLocaleString('id-ID')}.`
    );
  }
  if (roe >= dynamicCostOfEquityPct) {
    keyStrengths.push(
      `Excess Return Positif (+${decisionTree.excessReturnSpreadPct}%): Forward ROE ${roe.toFixed(1)}% melampaui Dynamic Cost of Equity RI (${dynamicCostOfEquityPct.toFixed(2)}%), mengompresi syarat batas aman MoS ke ${decisionTree.dynamicRequiredMosPct}% dan menghasilkan Justified PBV ${damodaranJustifiedPbv.toFixed(2)}x.`
    );
  }
  if (totalShareholderYieldPct > 0) {
    keyStrengths.push(
      `Imbal Hasil Pemegang Saham Hibrida (Tanpa Double-Counting EPS): Net Payout Yield ${netPayoutYieldPct.toFixed(2)}% (Forward Div ${forwardDividendYieldPct.toFixed(2)}% + Buyback ${corpIntercept.dynamicBuybackYieldPct.toFixed(2)}%)${netDebtPaydownYieldPct > 0 ? ` + Net Debt Paydown Yield ${netDebtPaydownYieldPct.toFixed(2)}% = TSY ${totalShareholderYieldPct.toFixed(2)}%` : ''}.`
    );
  }

  if (isDividendOutlierSanitized && forwardDivData.sanitizationReason) {
    keyRisks.push(forwardDivData.sanitizationReason);
  }
  if (grahamBenchmark.isMoatHaircutApplied && grahamBenchmark.moatHaircutReason) {
    keyRisks.push(
      `Graham-Joeliardi Floor Benchmark (Rp ${grahamBenchmark.grahamJoeliardiBenchmarkIdr.toLocaleString('id-ID')}): Dikenakan ${grahamBenchmark.moatHaircutReason}.`
    );
  }
  if (dynamicEnsemble.outlierPenalizedLeg) {
    keyRisks.push(
      `Filter Outlier Ensemble Aktif: Bobot model ${dynamicEnsemble.outlierPenalizedLeg} dipangkas 50% karena menyimpang >40% dari median tiga metode (Rp ${dynamicEnsemble.medianPriceIdr.toLocaleString('id-ID')}).`
    );
  }
  if (stock.isHscFlagged) {
    keyRisks.push(
      `${stock.hscReason || 'Terindikasi HSC (High Speculative Concentration)'}. Diblokir otomatis dari Top Decile Buy.`
    );
  } else if (stock.hscTier === 'KSEI_DIVIDEND_PENALTY' && stock.kseiHscConcentrationPct) {
    keyRisks.push(
      `Peringatan Konsentrasi Kepemilikan BEI-KSEI (Peng-HSC-00088/BEI.WAS/11-2026): Top 10 pemegang saham menguasai ${stock.kseiHscConcentrationPct.toFixed(3).replace('.', ',')}% (Status: ${stock.kseiHscIsNew ? 'Baru/New' : 'Eksisting'} · Sisa Free Float Maks ${(100 - stock.kseiHscConcentrationPct).toFixed(2).replace('.', ',')}%). Dikenakan penalti skor -${(stock.kseiHscScorePenaltyPts || 0.45).toFixed(2).replace('.', ',')} poin tanpa blokir otomatis karena didukung pembagian dividen rutin.`
    );
  }
  if (statArbSignal === 'PAIR_OVEREXTENDED_TRIM') {
    keyRisks.push(
      `Peringatan Relative Value (StatArb Z-Score +${statArbZScore}σ vs ${statArbPeerTicker}, β-Ratio ${statArbBetaRatio}x): Harga telah naik melampaui pasangan kointegrasinya (Spread 30D +${statArbSpread30DPct}%), waspadai potensi mean-reversion jangka pendek.`
    );
  }
  if (effectiveModule === 'Capex_Aggressor' && ocfToNetIncomeRatio > 0.50) {
    keyStrengths.push(
      `Toleransi QMJ Kontekstual (Rule B Capex Aggressor): Konversi kas OCF/NI (${ocfToNetIncomeRatio.toFixed(2)}x > 0,50x) dinyatakan sehat untuk fase konstruksi/ekspansi kapasitas baru (CWIP ${(cwipToAssetsRatio * 100).toFixed(0)}%, Capex/D&A ${capexToDaRatio.toFixed(1)}x) — bebas penalti Junk pada Dynamic Ensemble.`
    );
  }
  if (accrualPenaltyScore > 0) {
    const ruleTag =
      effectiveModule === 'Capex_Aggressor'
        ? `Rule B Capex Aggressor (OCF/NI ≤ 0,50x, Ensemble ×${dynamicEnsemble.ensembleAntiJunkMultiplier.toFixed(2)})`
        : `Rule A Strict ${effectiveModule} (Ambang Sehat > 0,80x–1,00x${
            dynamicEnsemble.ensembleAntiJunkMultiplier < 0.999
              ? `, Penalti Ensemble ×${dynamicEnsemble.ensembleAntiJunkMultiplier.toFixed(2)}`
              : ''
          })`;
    keyRisks.push(
      `Penalti Anti-Junk [${ruleTag}] (QMJ Accrual -${accrualPenaltyScore.toFixed(2)} poin): Konversi OCF/Laba Bersih (${ocfToNetIncomeRatio.toFixed(2)}x, Akrual/Aset ${accrualRatioToAssets.toFixed(1)}%) mendiskon valuasi kaki & mempercepat peluruhan ROE pada model Residual Income.`
    );
  }
  if (roe < dynamicCostOfEquityPct) {
    keyRisks.push(
      `Forward ROE (${roe.toFixed(1)}%) berada di bawah Dynamic Cost of Equity (${dynamicCostOfEquityPct.toFixed(2)}%), membatasi Residual Income dan Justified PBV (${damodaranJustifiedPbv.toFixed(2)}x).`
    );
  }
  if (der > 1.0) {
    keyRisks.push(
      `Leverage neraca (DER ${der.toFixed(2)}x > 1,0x)${isCyclicalDerPenalized ? ' memicu penalti QMJ Hard-Filter Siklikal dan' : ''} memotong 25% nilai dasar Graham-Joeliardi Benchmark.`
    );
  }
  if (marginOfSafetyPct < 0) {
    keyRisks.push(
      `Harga pasar saat ini berada ${Math.abs(marginOfSafetyPct).toFixed(1)}% di atas estimasi Nilai Intrinsik Wajar Quantedge Ensemble${decisionTree.decisionState === 'BUY_ON_STRENGTH_CATALYST' ? ' (masih dalam batas toleransi ≤10% Buy on Strength)' : ''}.`
    );
  }
  if (adtv20dIdr < 10_000_000_000) {
    keyRisks.push(
      `Kedalaman Likuiditas (ADTV 20D ~Rp ${(adtv20dIdr / 1_000_000_000).toFixed(2)} Miliar/hari): Batasi eksekusi harian maksimal 5% ADTV (~Rp ${(maxSafeAllocationIdr / 1_000_000).toFixed(0)} Juta) untuk menghindari slippage.`
    );
  }
  if (stock.beta1Y >= 1.15 || stock.volatilityAnn >= 30) {
    keyRisks.push(
      `Beta (${stock.beta1Y.toFixed(2)}x) / Volatilitas (${stock.volatilityAnn.toFixed(1)}%) tinggi: Porsi keranjang dikecilkan proporsional dengan 1/Beta (Maks ${betaWeightedSizingCapPct}% ekuitas, dibatasi sisa kas riil & 5% ADTV) sesuai strategi Barbell Antifragile.`
    );
  }
  if (keyRisks.length === 0) {
    keyRisks.push(
      `Pantau dinamika kurva imbal hasil SBN (${sbnSpot1YPct}%–${sbnSpot10YPct}%), rasio sektoral ${sectorPrimaryMetricShort}, serta kointegrasi relatif terhadap ${statArbPeerTicker}.`
    );
  }
  void opMargin;

  return {
    ticker: stock.ticker,
    name: stock.name,
    sector: stock.sector,
    lastPrice: price,
    estimatedEpsIdr,
    estimatedBvpsIdr,
    impliedPer,
    impliedPbv,
    joeliardiFairPer,
    joeliardiFairPbv,
    standaloneFairPer,
    standaloneFairPbv,
    intrinsicValueIdr,
    marginOfSafetyPct,
    annualizedEpsQ3Idr,
    historicalDpr3YPct,
    estimatedForwardDpsIdr,
    forwardDividendYieldPct,
    netPayoutYieldPct,
    netBuybackDebtPaydownYieldPct,
    netDebtPaydownYieldPct,
    totalShareholderYieldPct,
    isDividendOutlierSanitized,
    rawSbnSpreadPct,
    erpBenchmarkPct,
    netErpSpreadPct,
    grossProfitabilityToAssets,
    ocfToNetIncomeRatio,
    accrualRatioToAssets,
    accrualPenaltyPts,
    effectiveModule,
    ocfHealthyThreshold: contextualOcfPolicy.ocfHealthyThreshold,
    ensembleAntiJunkMultiplier: dynamicEnsemble.ensembleAntiJunkMultiplier,
    sbnSpot1YPct,
    sbnSpot5YPct,
    sbnSpot10YPct,
    sbnBlendedSpotRfPct,
    dynamicCostOfEquityPct,
    sustainableGrowthRatePct,
    damodaranJustifiedPbv,
    betaWeightedSizingCapPct,
    rimFairValueIdr,
    rimFadeYears,
    rimPersistenceOmega,
    rimTerminalRoePct,
    valuationModuleRoute,
    valuationModuleLabel,
    cwipToAssetsRatio,
    capexToDaRatio,
    capexToRevenueRatio,
    isCapexOverrideTriggered,
    uiNotifications: finalValuationReport.ui_notifications,
    valuationReport: finalValuationReport,
    normalizedEps7YIdr,
    normalizedRoePct,
    pbv10YMean,
    pbv10YStdDev,
    pbvZScore,
    isCyclicalDerPenalized,
    grahamJoeliardiBenchmarkIdr: grahamBenchmark.grahamJoeliardiBenchmarkIdr,
    grahamJoeliardiRawIdr: grahamBenchmark.grahamJoeliardiRawIdr,
    isMoatHaircutApplied: grahamBenchmark.isMoatHaircutApplied,
    moatHaircutReason: grahamBenchmark.moatHaircutReason,
    ensembleOutlierPenalizedLeg: dynamicEnsemble.outlierPenalizedLeg,
    ensembleConfidenceNotes: dynamicEnsemble.confidenceNotes,
    excessReturnSpreadPct: decisionTree.excessReturnSpreadPct,
    dynamicRequiredMosPct: decisionTree.dynamicRequiredMosPct,
    hasActiveCatalyst: corpIntercept.hasActiveCatalyst,
    availablePortfolioCashIdr,
    realCashCappedAllocationIdr,
    sectorValuationArchetype,
    sectorPrimaryMetricShort,
    sectorPrimaryMetricLabel,
    sectorPrimaryImpliedMultiple,
    sectorPrimaryFairMultiple,
    sectorPrimaryPerShareIdr,
    sectorPrimaryPerShareLabel,
    sectorSpecificFairValueIdr,
    sectorAcademicRationale,
    agnosticPeerFairValueIdr,
    statArbPeerTicker,
    statArbPeerName,
    statArbCorrelation,
    statArbBetaRatio,
    statArbSpread1DPct,
    statArbSpread30DPct,
    statArbZScore,
    statArbSignal,
    statArbSignalLabel,
    statArbImpliedTargetIdr,
    statArbRationale,
    quantedgeSystematicScore,
    quantedgeCompositeYieldPct,
    quantedgeAlphaVerdict,
    valuationMethodsComparison,
    trailingRoePct,
    forwardAnnualizedRoePct: forwardRoePct,
    trailingEpsIdr,
    forwardAnnualizedEpsIdr: estimatedEpsIdr,
    earningsGrowthYoYPct: corpIntercept.earningsGrowthYoYPct,
    latestQuarterLabel: corpIntercept.latestQuarterLabel,
    hasActiveBuyback: corpIntercept.hasActiveBuyback,
    buybackNominalIdr: corpIntercept.buybackNominalIdr,
    liveMarketCapIdr: corpIntercept.liveMarketCapIdr,
    dynamicBuybackYieldPct: corpIntercept.dynamicBuybackYieldPct,
    splitRatioDivisor: corpIntercept.splitRatioDivisor,
    catalystValuationBoostPct: corpIntercept.catalystValuationBoostPct,
    isCatalystActive: corpIntercept.isCatalystActive,
    catalystBadgeLabel: corpIntercept.catalystBadgeLabel,
    catalystNarrative: corpIntercept.catalystNarrative,
    ensembleFormulaAudit,
    decisionState: decisionTree.decisionState,
    decisionActionLabel: decisionTree.decisionActionLabel,
    hscTier: stock.hscTier,
    kseiHscConcentrationPct: stock.kseiHscConcentrationPct,
    kseiHscIsNew: stock.kseiHscIsNew,
    kseiHscFootnote: stock.kseiHscFootnote,
    kseiHscScorePenaltyPts: stock.kseiHscScorePenaltyPts,
    adtv20dIdr,
    maxSafeAllocationIdr,
    isDefensiveDiscountAnomaly,
    isUndercutDeepDiscount,
    valuationVerdict,
    valuationLabel,
    businessQualityScore,
    balanceSheetHealthScore,
    valuationSafetyScore,
    oosQuantRobustnessScore,
    totalConvictionScore,
    convictionGrade,
    keyStrengths,
    keyRisks
  };
}

/**
 * Helper: Applies 1/Beta Proportional Risk Parity Weighting with a strict Per-Stock Maximum Allocation Cap
 * (Qian 2005 Risk Parity & Taleb 2012 Antifragile Barbell Position Sizing).
 * Iteratively redistributes excess weight above `maxIntraSleeveWeightPct` across uncapped candidates.
 */
function computeCappedInverseBetaWeights(
  rawPropensities: number[],
  maxIntraSleeveWeightPct: number = 34.0
): number[] {
  const n = rawPropensities.length;
  if (n === 0) return [];
  if (n === 1) return [100];

  const effectiveCap = Math.max(100 / n + 2, maxIntraSleeveWeightPct);
  const sumRaw = rawPropensities.reduce((a, b) => a + b, 0) || 1;
  const weights = rawPropensities.map((p) => (p / sumRaw) * 100);
  const cappedFlags = new Array(n).fill(false);

  for (let iter = 0; iter < 5; iter++) {
    let excess = 0;
    let uncappedSum = 0;
    for (let i = 0; i < n; i++) {
      if (!cappedFlags[i] && weights[i] > effectiveCap) {
        excess += weights[i] - effectiveCap;
        weights[i] = effectiveCap;
        cappedFlags[i] = true;
      } else if (!cappedFlags[i]) {
        uncappedSum += weights[i];
      }
    }
    if (excess <= 1e-4 || uncappedSum <= 1e-4) break;
    for (let i = 0; i < n; i++) {
      if (!cappedFlags[i]) {
        weights[i] += excess * (weights[i] / uncappedSum);
      }
    }
  }
  return weights;
}

/**
 * Portfolio Optimizer & BEI Lot-100 Calculator (1/Beta Barbell Position Sizing — Qian 2005 & Taleb 2012)
 * Per confirmed user decision: Position sizing is strictly bounded by the minimum of
 * Target 1/Beta Cap, actual remaining portfolio cash (`availableCashIdr`), and 5% ADTV 20D.
 */
export function computeOptimalHRPBarbellPortfolio(
  stocks: StockMetrics[],
  regime: MarketRegime,
  capitalIdr: number,
  maxPicksPerSleeve: number = 4,
  selectionMode: BasketSelectionMode = 'LIVE_FACTOR_LEADER',
  availableCashIdr?: number
): PortfolioAnalyticsSummary {
  const refreshedStocks = rankUniverseWithBuffer(stocks, 40);
  // Require live-fetched, liquid, non-HSC stocks passing GP/A & Value quality filter
  const institutionalLiquidPool = refreshedStocks.filter(
    (s) =>
      s.isLiveFetched === true &&
      s.isLiquid !== false &&
      !s.isHscFlagged &&
      s.lastPrice >= 80 &&
      s.dmuValueScore >= 5.8 &&
      (s.grossProfitabilityToAssets ?? 12) >= 7.5 &&
      isInstitutionalLiquidCandidate(s.ticker)
  );
  const fallbackLiquidPool = refreshedStocks.filter(
    (s) =>
      s.isLiveFetched === true &&
      s.isLiquid !== false &&
      !s.isHscFlagged &&
      s.lastPrice >= 80 &&
      s.dmuValueScore >= 5.6
  );
  const baseUniverse =
    institutionalLiquidPool.length >= 8
      ? institutionalLiquidPool
      : fallbackLiquidPool.length >= 4
      ? fallbackLiquidPool
      : refreshedStocks.filter((s) => s.lastPrice >= 80 && !s.isHscFlagged);

  const rankedStocks = rankUniverseWithBuffer(baseUniverse, 40);
  const maxPerSector = selectionMode === 'SECTOR_ROTATION' ? 1 : 2;

  const selectSleeveCandidates = (
    filterFn: (s: StockMetrics) => boolean,
    basket: 'DEFENSIVE' | 'AGGRESSIVE',
    limit: number
  ): StockMetrics[] => {
    const pool = rankedStocks
      .filter(filterFn)
      .sort(
        (a, b) =>
          computeSleeveSpecificScore(b, basket, selectionMode) -
          computeSleeveSpecificScore(a, basket, selectionMode)
      );

    const selected: StockMetrics[] = [];
    const sectorCounts: Record<string, number> = {};

    for (const candidate of pool) {
      if (selected.length >= limit) break;
      const currentSectorCount = sectorCounts[candidate.sector] || 0;
      if (currentSectorCount < maxPerSector) {
        selected.push(candidate);
        sectorCounts[candidate.sector] = currentSectorCount + 1;
      }
    }

    if (selected.length < limit) {
      for (const candidate of pool) {
        if (selected.length >= limit) break;
        if (!selected.some((s) => s.ticker === candidate.ticker)) {
          selected.push(candidate);
        }
      }
    }
    return selected;
  };

  // 1. Select Keranjang 1 (Defensive Core Compounders: Low-Beta Anchor of Barbell)
  const defCandidates = selectSleeveCandidates(
    (s) =>
      s.isLiquid !== false &&
      s.lastPrice >= 80 &&
      s.roe >= 7 &&
      s.beta1Y <= 1.02 &&
      s.dmuValueScore >= 5.8,
    'DEFENSIVE',
    maxPicksPerSleeve
  );
  const selectedDefTickers = new Set(defCandidates.map((s) => s.ticker));

  // 2. Select Keranjang 2 (Asymmetric Growth & Momentum Barbell Sleeve)
  const aggCandidates = selectSleeveCandidates(
    (s) =>
      !selectedDefTickers.has(s.ticker) &&
      s.isLiquid !== false &&
      s.lastPrice >= 80 &&
      s.roe >= 5 &&
      s.dmuValueScore >= 5.6 &&
      (selectionMode === 'TOP_GAINERS_MOMENTUM'
        ? s.change1D >= -1.5
        : s.beta1Y > 0.72 || s.return30D > -3.0 || s.change1D >= 0),
    'AGGRESSIVE',
    maxPicksPerSleeve
  );

  const activeEquityWeightPct = regime.aggressiveWeight;
  const cashReserveWeightPct = regime.defensiveWeight;
  const lowVolCoreSleevePct = Math.round(activeEquityWeightPct * 0.55);
  const momAlphaSleevePct = activeEquityWeightPct - lowVolCoreSleevePct;

  const MAX_PORTFOLIO_STOCK_CAP_PCT = 18.0; // Absolute max 18% of total portfolio equity per stock
  const effectiveAvailableCashIdr =
    typeof availableCashIdr === 'number' && availableCashIdr > 0
      ? availableCashIdr
      : capitalIdr;

  const buildSleevePositions = (
    candidates: StockMetrics[],
    basketType: 'DEFENSIVE' | 'AGGRESSIVE',
    sleeveWeightPct: number
  ): HRPAllocationPosition[] => {
    if (candidates.length === 0) return [];

    // 1/Beta Proportional Risk Parity Weighting (Qian 2005 & Taleb 2012):
    // Weight_i ∝ (QualityConviction_i) * (1 / max(0.35, Beta_i))
    const rawInverseBetaPropensities = candidates.map((s) => {
      const sleeveScore = Math.max(1.5, computeSleeveSpecificScore(s, basketType, selectionMode));
      const effectiveBeta = Math.max(0.35, Number(s.beta1Y) || 1.0);
      return sleeveScore / effectiveBeta;
    });

    const maxIntraCapForSleeve =
      sleeveWeightPct > 0
        ? Math.min(36.0, (MAX_PORTFOLIO_STOCK_CAP_PCT / sleeveWeightPct) * 100)
        : 34.0;
    const cappedIntraWeights = computeCappedInverseBetaWeights(
      rawInverseBetaPropensities,
      maxIntraCapForSleeve
    );

    return candidates.map((stock, idx) => {
      const intraWeight = cappedIntraWeights[idx];
      const rawTotalWeight = (intraWeight * sleeveWeightPct) / 100;
      const effectiveBeta = Math.max(0.35, Number(stock.beta1Y) || 1.0);
      const betaCapPct = Math.max(3.5, Math.min(MAX_PORTFOLIO_STOCK_CAP_PCT, 12.5 / effectiveBeta));
      const totalWeight = Math.min(MAX_PORTFOLIO_STOCK_CAP_PCT, betaCapPct, rawTotalWeight);

      const rawAllocatedIdr = Math.round((capitalIdr * totalWeight) / 100);
      const maxAdtv5PctIdr = Math.round(estimateEmitenAdtv20dIdr(stock) * 0.05);
      // Confirmed User Decision: Bound position allocation by min(Target 1/Beta Cap, Real Available Cash, 5% ADTV)
      const allocatedIdr = Math.max(
        stock.lastPrice * 100,
        Math.min(rawAllocatedIdr, effectiveAvailableCashIdr, maxAdtv5PctIdr)
      );
      const lots = Math.max(1, Math.floor(allocatedIdr / (stock.lastPrice * 100)));

      return {
        stock,
        basket: basketType,
        intraBasketWeightPct: Number(intraWeight.toFixed(1)),
        totalPortfolioWeightPct: Number(totalWeight.toFixed(2)),
        allocatedIdr,
        lots
      };
    });
  };

  const defPositions = buildSleevePositions(defCandidates, 'DEFENSIVE', lowVolCoreSleevePct);
  const aggPositions = buildSleevePositions(aggCandidates, 'AGGRESSIVE', momAlphaSleevePct);
  const allPositions = [...defPositions, ...aggPositions];

  let portfolioBeta = 0;
  let portfolioQmj = 0;
  let weightedVar = 0;

  for (const pos of allPositions) {
    const w = pos.totalPortfolioWeightPct / 100;
    portfolioBeta += w * pos.stock.beta1Y;
    portfolioQmj += w * pos.stock.dmuCompositeScore;
    weightedVar += Math.pow(w * pos.stock.volatilityAnn, 2);
  }

  const investedFraction = Math.max(0.35, activeEquityWeightPct / 100);
  const normalizedQmj = portfolioQmj / investedFraction;

  const diversificationFactor = 1.45;
  const expectedAnnVolPct = Number(
    Math.max(7.5, Math.sqrt(weightedVar) * diversificationFactor).toFixed(2)
  );

  const monthlyVolPct = expectedAnnVolPct / Math.sqrt(12);
  const monthlyCvar95Pct = Number((monthlyVolPct * 2.063).toFixed(2));
  const monthlyCvar95Idr = Math.round((capitalIdr * monthlyCvar95Pct) / 100);

  const sharpeEstimate = Number(
    Math.max(0.28, Math.min(0.85, (normalizedQmj - 5.2) / Math.max(10, expectedAnnVolPct) + 0.24)).toFixed(2)
  );

  return {
    positions: allPositions,
    cashReserveTargetIdr: Math.round((capitalIdr * cashReserveWeightPct) / 100),
    cashReserveWeightPct,
    equityExposureWeightPct: activeEquityWeightPct,
    portfolioBeta: Number(portfolioBeta.toFixed(2)),
    portfolioQmj: Number(normalizedQmj.toFixed(2)),
    expectedAnnVolPct,
    monthlyCvar95Pct,
    monthlyCvar95Idr,
    sharpeEstimate
  };
}

export const DEFAULT_USER_PORTFOLIO_HOLDINGS: PortfolioHolding[] = [
  {
    ticker: 'BBCA',
    lots: 60,
    avgBuyPrice: 4920,
    addedAt: '2026-10-15',
    notes: 'Top Decile Low-Vol & Quality Core'
  },
  {
    ticker: 'ITMG',
    lots: 8,
    avgBuyPrice: 23800,
    addedAt: '2026-10-18',
    notes: 'High Value & Cashflow Yield'
  },
  {
    ticker: 'BMRI',
    lots: 50,
    avgBuyPrice: 3750,
    addedAt: '2026-10-20',
    notes: '40% Rebalancing Buffer Hold'
  },
  {
    ticker: 'SIDO',
    lots: 350,
    avgBuyPrice: 305,
    addedAt: '2026-10-25',
    notes: 'Low-Volatility Factor Leader'
  }
];

export type EvaluationHorizon = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export function evaluateActivePortfolio(
  holdings: PortfolioHolding[],
  cashReserveIdr: number,
  stocks: StockMetrics[],
  regime: MarketRegime,
  rebalanceBufferPct: number = 40,
  horizon: EvaluationHorizon = 'MONTHLY'
): ActivePortfolioEvaluation {
  // Horizon-specific buffer & drift calibration:
  // DAILY (Harian): tighter tactical buffer (25%) & drift threshold (4.5%)
  // WEEKLY (Mingguan): medium swing buffer (35%) & drift threshold (6.5%)
  // MONTHLY (Bulanan): full institutional DeMiguel buffer (rebalanceBufferPct, default 40%) & drift threshold (8.0%)
  const effectiveBufferPct =
    horizon === 'DAILY'
      ? Math.min(rebalanceBufferPct, 25)
      : horizon === 'WEEKLY'
      ? Math.min(rebalanceBufferPct, 35)
      : rebalanceBufferPct;

  const driftTolerancePct =
    horizon === 'DAILY' ? 4.5 : horizon === 'WEEKLY' ? 6.5 : 8.0;
  const accumulateDriftThreshold =
    horizon === 'DAILY' ? -2.5 : horizon === 'WEEKLY' ? -3.5 : -4.5;
  const horizonTag =
    horizon === 'DAILY' ? 'Harian' : horizon === 'WEEKLY' ? 'Mingguan' : 'Bulanan';

  const rankedUniverse = rankUniverseWithBuffer(stocks, effectiveBufferPct);

  const resolvedPairs = holdings.map((h) => {
    const found = rankedUniverse.find((s) => s.ticker === h.ticker);
    const fallbackStock: StockMetrics =
      found ||
      enrichStockMetrics({
        ticker: h.ticker,
        idxTicker: `IDX:${h.ticker}`,
        yfTicker: `${h.ticker}.JK`,
        name: `${h.ticker} Indonesia Tbk`,
        sector: 'IDX Listed Equity',
        lastPrice: h.avgBuyPrice,
        change1D: 0,
        return30D: 0,
        beta1Y: 1.0,
        volatilityAnn: 22.0,
        roe: 15.0,
        debtToEquity: 0.5,
        operatingMargin: 18.0
      });

    const investedIdr = Math.round(h.lots * 100 * h.avgBuyPrice);
    const marketValueIdr = Math.round(h.lots * 100 * fallbackStock.lastPrice);
    return { holding: h, stock: fallbackStock, investedIdr, marketValueIdr };
  });

  const totalInvestedIdr = resolvedPairs.reduce((acc, p) => acc + p.investedIdr, 0);
  const totalMarketValueIdr = resolvedPairs.reduce((acc, p) => acc + p.marketValueIdr, 0);
  const totalPortfolioEquityIdr = totalMarketValueIdr + Math.max(0, cashReserveIdr);
  const totalUnrealizedPnlIdr = totalMarketValueIdr - totalInvestedIdr;
  const totalUnrealizedPnlPct =
    totalInvestedIdr > 0
      ? Number(((totalUnrealizedPnlIdr / totalInvestedIdr) * 100).toFixed(2))
      : 0;

  // 1/Beta Proportional Sizing for all quality-passing holdings with per-stock max cap
  const eligibleHoldings = resolvedPairs.filter(
    (p) => !p.stock.isHscFlagged && p.stock.dmuCompositeScore >= 4.8
  );
  const rawEligibleProps = eligibleHoldings.map(
    (p) => p.stock.betaWeightedPropensity || p.stock.hrpPropensity || 1
  );
  const cappedEligibleShares = computeCappedInverseBetaWeights(rawEligibleProps, 36.0);
  const targetWeightMap = new Map<string, number>();
  eligibleHoldings.forEach((p, idx) => {
    const w = Math.min(22.0, (cappedEligibleShares[idx] * regime.aggressiveWeight) / 100);
    targetWeightMap.set(p.holding.ticker, Number(w.toFixed(1)));
  });

  let weightedBeta = 0;
  let weightedDmu = 0;

  const evaluatedHoldings: EvaluatedHolding[] = resolvedPairs.map((pair) => {
    const { holding, stock, investedIdr, marketValueIdr } = pair;
    const unrealizedPnlIdr = marketValueIdr - investedIdr;
    const unrealizedPnlPct =
      investedIdr > 0 ? Number(((unrealizedPnlIdr / investedIdr) * 100).toFixed(2)) : 0;

    const actualWeightPct =
      totalPortfolioEquityIdr > 0
        ? Number(((marketValueIdr / totalPortfolioEquityIdr) * 100).toFixed(1))
        : 0;

    if (totalPortfolioEquityIdr > 0) {
      const wTotal = marketValueIdr / totalPortfolioEquityIdr;
      weightedBeta += wTotal * stock.beta1Y;
    }
    if (totalMarketValueIdr > 0) {
      const wEq = marketValueIdr / totalMarketValueIdr;
      weightedDmu += wEq * stock.dmuCompositeScore;
    }

    const isQualityEligible = !stock.isHscFlagged && stock.dmuCompositeScore >= 4.8;
    const isInsideBuffer =
      isQualityEligible && (stock.dmuRankPct <= effectiveBufferPct || stock.dmuValueScore >= 6.2);
    const targetOptimalWeightPct = isQualityEligible
      ? targetWeightMap.get(holding.ticker) ?? 0
      : 0;

    const weightDriftPct = Number((actualWeightPct - targetOptimalWeightPct).toFixed(1));
    const targetValueIdr = (totalPortfolioEquityIdr * targetOptimalWeightPct) / 100;
    const valueDiffIdr = targetValueIdr - marketValueIdr;
    const rawLotDelta = Math.round(valueDiffIdr / (stock.lastPrice * 100));

    let signal: RebalanceSignalType = 'HOLD_CORE';
    let signalLabel = `HOLD · TOP MULTIFACTOR (${horizonTag.toUpperCase()})`;
    let lotDeltaRecommendation = 0;
    let rationale = `[Evaluasi ${horizonTag}] Peringkat Top ${stock.dmuRankPct}% (Skor ${stock.dmuCompositeScore.toFixed(2)}/10). Pertahankan posisi inti.`;

    if (!isInsideBuffer || stock.dmuCompositeScore < 5.0) {
      signal = 'CUT_JUNK_EXIT';
      signalLabel = `ROTATE OUT (RANK ${stock.dmuRankPct}% > ${effectiveBufferPct}%)`;
      lotDeltaRecommendation = -holding.lots;
      rationale = `[Evaluasi ${horizonTag}] Skor komposit (${stock.dmuCompositeScore.toFixed(2)}) turun ke peringkat ${stock.dmuRankPct}% (di luar batas Buffer ${effectiveBufferPct}%). Likuidasi untuk rotasi ke Top-Decile.`;
    } else if (stock.dmuRankPct > 20 && stock.dmuRankPct <= effectiveBufferPct) {
      if (Math.abs(weightDriftPct) <= driftTolerancePct) {
        signal = 'BUFFER_HOLD';
        signalLabel = `BUFFER HOLD (ZONA HEMAT BIAYA ≤${effectiveBufferPct}%)`;
        lotDeltaRecommendation = 0;
        rationale = `[Evaluasi ${horizonTag}] Berada di Zona Buffer ${effectiveBufferPct}% (Rank ${stock.dmuRankPct}%, Drift ${weightDriftPct >= 0 ? '+' : ''}${weightDriftPct}% ≤ ±${driftTolerancePct}%). Tidak perlu dijual demi menghemat komisi beli/jual BEI (0,40% round-trip).`;
      } else if (weightDriftPct > driftTolerancePct) {
        signal = 'TRIM_REBALANCE';
        signalLabel = `VOL-SCALE TRIM (${rawLotDelta} Lot)`;
        lotDeltaRecommendation = rawLotDelta;
        rationale = `[Evaluasi ${horizonTag}] Eksposur (${actualWeightPct}%) melampaui batas toleransi drift ${horizonTag} (${targetOptimalWeightPct}% + ${driftTolerancePct}%). Kurangi sebagian ke kas.`;
      } else if (weightDriftPct < -driftTolerancePct && rawLotDelta > 0) {
        signal = 'ACCUMULATE';
        signalLabel = `REBALANCE ADD (+${rawLotDelta} Lot)`;
        lotDeltaRecommendation = rawLotDelta;
        rationale = `[Evaluasi ${horizonTag}] Posisi masih di bawah bobot target (${targetOptimalWeightPct}%) melampaui batas drift ${horizonTag}. Tambah bertahap.`;
      }
    } else if (weightDriftPct > driftTolerancePct - 0.5 && rawLotDelta < 0) {
      signal = 'TRIM_REBALANCE';
      signalLabel = `VOL-SCALE TRIM (${rawLotDelta} Lot)`;
      lotDeltaRecommendation = rawLotDelta;
      rationale = `[Evaluasi ${horizonTag}] Sentimen pasar (${regime.annualizedVol30D.toFixed(1)}% vol) menuntut penurunan eksposur ekuitas ke ${regime.aggressiveWeight}%. Amankan sebagian ke kas.`;
    } else if (
      stock.dmuRankPct <= 20 &&
      weightDriftPct < accumulateDriftThreshold &&
      rawLotDelta > 0
    ) {
      signal = 'ACCUMULATE';
      signalLabel = `TOP-DECILE ADD (+${rawLotDelta} Lot)`;
      lotDeltaRecommendation = rawLotDelta;
      rationale = `[Evaluasi ${horizonTag}] Kandidat Top-Decile (Rank ${stock.dmuRankPct}%, Skor ${stock.dmuCompositeScore.toFixed(2)}) masih di bawah bobot target (${targetOptimalWeightPct}%).`;
    }

    return {
      holding,
      stock,
      investedIdr,
      marketValueIdr,
      unrealizedPnlIdr,
      unrealizedPnlPct,
      actualWeightPct,
      targetOptimalWeightPct,
      weightDriftPct,
      signal,
      signalLabel,
      lotDeltaRecommendation,
      rationale
    };
  });

  const actualEquityWeightPct =
    totalPortfolioEquityIdr > 0
      ? Number(((totalMarketValueIdr / totalPortfolioEquityIdr) * 100).toFixed(1))
      : 0;
  const actualCashWeightPct = Number((100 - actualEquityWeightPct).toFixed(1));

  const exposureGap = Math.abs(actualEquityWeightPct - regime.aggressiveWeight);
  const dmuBonus = Math.min(15, Math.max(0, (weightedDmu - 6.8) * 6));
  const regimeAlignmentScore = Math.round(
    Math.max(20, Math.min(99, 90 - exposureGap * 0.8 + dmuBonus))
  );

  return {
    holdings: evaluatedHoldings,
    cashReserveIdr,
    totalInvestedIdr,
    totalMarketValueIdr,
    totalPortfolioEquityIdr,
    totalUnrealizedPnlIdr,
    totalUnrealizedPnlPct,
    actualDefensiveWeightPct: actualCashWeightPct,
    actualAggressiveWeightPct: actualEquityWeightPct,
    actualPortfolioBeta: Number(weightedBeta.toFixed(2)),
    actualPortfolioQmj: Number(weightedDmu.toFixed(2)),
    regimeAlignmentScore
  };
}

export function generateCandidateRecommendations(
  currentHoldings: PortfolioHolding[],
  allStocks: StockMetrics[],
  regime: MarketRegime,
  totalEquityIdr: number,
  strategyFilter: 'ALL' | RecommendationStrategyTag | RecommendationStrategyTag[] = 'ALL',
  availableCashIdr?: number,
  horizon: EvaluationHorizon = 'MONTHLY'
): CandidateRecommendation[] {
  const effectiveBuffer =
    horizon === 'DAILY' ? 25 : horizon === 'WEEKLY' ? 35 : 40;
  const rankedStocks = rankUniverseWithBuffer(allStocks, effectiveBuffer);
  const heldTickers = new Set(currentHoldings.map((h) => h.ticker));
  const heldSectors = new Set(
    currentHoldings
      .map((h) => rankedStocks.find((s) => s.ticker === h.ticker)?.sector)
      .filter(Boolean)
  );

  const candidates = rankedStocks.filter(
    (s) =>
      !heldTickers.has(s.ticker) &&
      s.isLiquid !== false &&
      s.isLiveFetched !== false &&
      !s.isHscFlagged &&
      s.lastPrice >= 80 &&
      s.dmuValueScore >= 6.0 &&
      isInstitutionalLiquidCandidate(s.ticker) &&
      s.dmuCompositeScore >= 6.2
  );

  const recs: CandidateRecommendation[] = candidates.map((stock) => {
    let strategyTag: RecommendationStrategyTag = 'COMPOUNDER_QUALITY';
    let strategyLabel = 'Top Multifactor Candidate';
    let thesis = '';

    if (horizon === 'DAILY' && (stock.change1D >= 1.0 || stock.dmuMomScore >= 7.2)) {
      strategyTag = 'ASYMMETRIC_ALPHA';
      strategyLabel = 'Tactical Daily Momentum Leader';
      thesis = `[Horizon Harian] Akselerasi harga 1D (${stock.change1D >= 0 ? '+' : ''}${stock.change1D.toFixed(2)}%) & 30D (${stock.return30D >= 0 ? '+' : ''}${stock.return30D.toFixed(2)}%) dengan Skor Momentum ${stock.dmuMomScore.toFixed(1)}/10.`;
    } else if (stock.dmuLowVolScore >= 7.5 && stock.beta1Y <= 0.85) {
      strategyTag = 'DEFENSIVE_SHIELD';
      strategyLabel = 'Low-Volatility Factor Anchor';
      thesis = `Skor Faktor Low-Vol ${stock.dmuLowVolScore.toFixed(1)}/10 (σ ${stock.volatilityAnn}%, β ${stock.beta1Y}x). Penopang utama saat sentimen pasar bergejolak.`;
    } else if (!heldSectors.has(stock.sector) && stock.dmuCompositeScore >= 6.8) {
      strategyTag = 'SECTOR_DIVERSIFIER';
      strategyLabel = `Diversifikasi Sektor (${stock.sector})`;
      thesis = `Memperluas eksposur ke sektor ${stock.sector} dengan Skor Komposit ${stock.dmuCompositeScore.toFixed(2)}/10 (Rank Top ${stock.dmuRankPct}%).`;
    } else if (stock.dmuValueScore >= 7.5) {
      strategyTag = 'COMPOUNDER_QUALITY';
      strategyLabel = 'Value & Cashflow Yield Leader';
      thesis = `Unggul pada Faktor Value (${stock.dmuValueScore.toFixed(1)}/10) dengan ROE ${stock.roe}%${(stock.dividendYieldPct ?? 0) > 0 ? `, Dividen ${(stock.dividendYieldPct ?? 0).toFixed(2)}%,` : ''} dan DER rendah ${stock.debtToEquity}x.`;
    } else {
      strategyTag = 'ASYMMETRIC_ALPHA';
      strategyLabel = 'Momentum (12-1) Factor Leader';
      thesis = `Didorong Faktor Momentum (${stock.dmuMomScore.toFixed(1)}/10) & Likuiditas (${stock.dmuSizeScore.toFixed(1)}/10) untuk menangkap ekspansi siklus IHSG.`;
    }

    const suggestedWeightPct =
      regime.status === 'VOLATIL'
        ? stock.beta1Y <= 0.9
          ? 12.0
          : 6.0
        : horizon === 'DAILY'
        ? 8.0
        : horizon === 'WEEKLY'
        ? 10.0
        : 12.0;

    const idealAllocIdr = Math.max(1500000, (totalEquityIdr * suggestedWeightPct) / 100);
    const oneLotGrossIdr = stock.lastPrice * 100;
    const oneLotWithFeeIdr = oneLotGrossIdr * 1.0015; // Stockbit 0.15% buy fee

    let suggestedLots = Math.max(1, Math.floor(idealAllocIdr / oneLotGrossIdr));
    if (typeof availableCashIdr === 'number' && availableCashIdr > 0) {
      const maxAffordableLots = Math.floor(availableCashIdr / oneLotWithFeeIdr);
      if (maxAffordableLots >= 1) {
        suggestedLots = Math.max(1, Math.min(suggestedLots, maxAffordableLots));
      } else {
        suggestedLots = 1;
      }
    }

    const actualSuggestedWeightPct =
      totalEquityIdr > 0
        ? Number((((suggestedLots * oneLotGrossIdr) / totalEquityIdr) * 100).toFixed(1))
        : suggestedWeightPct;

    const betaImpact = `Low-Vol ${stock.dmuLowVolScore.toFixed(1)} · Mom ${stock.dmuMomScore.toFixed(1)}`;
    const qmjImpact = `Skor ${stock.dmuCompositeScore.toFixed(2)} (Top ${stock.dmuRankPct}%)`;

    return {
      stock,
      strategyTag,
      strategyLabel,
      suggestedWeightPct: actualSuggestedWeightPct,
      suggestedLots,
      betaImpact,
      qmjImpact,
      thesis
    };
  });

  const activeFilterSet =
    Array.isArray(strategyFilter) && strategyFilter.length > 0
      ? new Set(strategyFilter)
      : strategyFilter !== 'ALL' && typeof strategyFilter === 'string'
      ? new Set([strategyFilter])
      : null;

  return recs
    .filter((r) => !activeFilterSet || activeFilterSet.has(r.strategyTag))
    .sort((a, b) => {
      if (typeof availableCashIdr === 'number' && availableCashIdr > 0) {
        const aAffordable = a.stock.lastPrice * 100 * 1.0015 <= availableCashIdr ? 1 : 0;
        const bAffordable = b.stock.lastPrice * 100 * 1.0015 <= availableCashIdr ? 1 : 0;
        if (aAffordable !== bAffordable) return bAffordable - aAffordable;
      }
      if (horizon === 'DAILY') {
        const aScore = a.stock.dmuCompositeScore + a.stock.change1D * 0.18 + a.stock.return30D * 0.04;
        const bScore = b.stock.dmuCompositeScore + b.stock.change1D * 0.18 + b.stock.return30D * 0.04;
        return bScore - aScore;
      }
      if (horizon === 'WEEKLY') {
        const aScore = a.stock.dmuCompositeScore + a.stock.return30D * 0.06;
        const bScore = b.stock.dmuCompositeScore + b.stock.return30D * 0.06;
        return bScore - aScore;
      }
      return b.stock.dmuCompositeScore - a.stock.dmuCompositeScore;
    });
}

export const INITIAL_LQ45_UNIVERSE: RawStockInput[] = [
  {
    ticker: 'BBCA',
    idxTicker: 'IDX:BBCA',
    yfTicker: 'BBCA.JK',
    name: 'Bank Central Asia Tbk',
    sector: 'Financials',
    lastPrice: 5100,
    change1D: 3.45,
    return30D: -4.20,
    beta1Y: 0.76,
    volatilityAnn: 18.4,
    roe: 21.8,
    debtToEquity: 0.38,
    operatingMargin: 54.2
  },
  {
    ticker: 'ICBP',
    idxTicker: 'IDX:ICBP',
    yfTicker: 'ICBP.JK',
    name: 'Indofood CBP Sukses Makmur Tbk',
    sector: 'Consumer Non-Cyclicals',
    lastPrice: 6125,
    change1D: 3.38,
    return30D: -2.10,
    beta1Y: 0.58,
    volatilityAnn: 16.5,
    roe: 18.4,
    debtToEquity: 0.64,
    operatingMargin: 21.6
  },
  {
    ticker: 'KLBF',
    idxTicker: 'IDX:KLBF',
    yfTicker: 'KLBF.JK',
    name: 'Kalbe Farma Tbk',
    sector: 'Healthcare',
    lastPrice: 755,
    change1D: 4.14,
    return30D: -3.50,
    beta1Y: 0.62,
    volatilityAnn: 17.8,
    roe: 14.9,
    debtToEquity: 0.19,
    operatingMargin: 14.8
  },
  {
    ticker: 'TLKM',
    idxTicker: 'IDX:TLKM',
    yfTicker: 'TLKM.JK',
    name: 'Telkom Indonesia (Persero) Tbk',
    sector: 'Infrastructures',
    lastPrice: 1995,
    change1D: 5.84,
    return30D: -5.10,
    beta1Y: 0.81,
    volatilityAnn: 21.2,
    roe: 18.1,
    debtToEquity: 0.49,
    operatingMargin: 31.4
  },
  {
    ticker: 'BMRI',
    idxTicker: 'IDX:BMRI',
    yfTicker: 'BMRI.JK',
    name: 'Bank Mandiri (Persero) Tbk',
    sector: 'Financials',
    lastPrice: 3640,
    change1D: 1.11,
    return30D: -8.40,
    beta1Y: 1.18,
    volatilityAnn: 26.4,
    roe: 22.4,
    debtToEquity: 0.56,
    operatingMargin: 48.9
  },
  {
    ticker: 'BBRI',
    idxTicker: 'IDX:BBRI',
    yfTicker: 'BBRI.JK',
    name: 'Bank Rakyat Indonesia (Persero) Tbk',
    sector: 'Financials',
    lastPrice: 2740,
    change1D: 1.86,
    return30D: -9.80,
    beta1Y: 1.24,
    volatilityAnn: 28.1,
    roe: 19.8,
    debtToEquity: 0.62,
    operatingMargin: 44.5
  },
  {
    ticker: 'ADRO',
    idxTicker: 'IDX:ADRO',
    yfTicker: 'ADRO.JK',
    name: 'Alamtri Resources Indonesia Tbk',
    sector: 'Energy',
    lastPrice: 2330,
    change1D: -0.85,
    return30D: -3.20,
    beta1Y: 1.15,
    volatilityAnn: 27.8,
    roe: 24.6,
    debtToEquity: 0.24,
    operatingMargin: 38.2
  },
  {
    ticker: 'ITMG',
    idxTicker: 'IDX:ITMG',
    yfTicker: 'ITMG.JK',
    name: 'Indo Tambangraya Megah Tbk',
    sector: 'Energy',
    lastPrice: 24475,
    change1D: 2.41,
    return30D: -1.90,
    beta1Y: 0.84,
    volatilityAnn: 19.8,
    roe: 26.8,
    debtToEquity: 0.14,
    operatingMargin: 29.4
  },
  {
    ticker: 'ASII',
    idxTicker: 'IDX:ASII',
    yfTicker: 'ASII.JK',
    name: 'Astra International Tbk',
    sector: 'Industrials',
    lastPrice: 4920,
    change1D: 0.41,
    return30D: -1.20,
    beta1Y: 0.88,
    volatilityAnn: 19.6,
    roe: 16.5,
    debtToEquity: 0.44,
    operatingMargin: 15.9
  },
  {
    ticker: 'BBNI',
    idxTicker: 'IDX:BBNI',
    yfTicker: 'BBNI.JK',
    name: 'Bank Negara Indonesia (Persero) Tbk',
    sector: 'Financials',
    lastPrice: 3270,
    change1D: 3.15,
    return30D: -7.60,
    beta1Y: 1.29,
    volatilityAnn: 27.9,
    roe: 15.4,
    debtToEquity: 0.68,
    operatingMargin: 39.2
  },
  {
    ticker: 'AMMN',
    idxTicker: 'IDX:AMMN',
    yfTicker: 'AMMN.JK',
    name: 'Amman Mineral Internasional Tbk',
    sector: 'Basic Materials',
    lastPrice: 3680,
    change1D: 8.88,
    return30D: -11.40,
    beta1Y: 1.48,
    volatilityAnn: 36.5,
    roe: 17.2,
    debtToEquity: 0.58,
    operatingMargin: 36.4
  },
  {
    ticker: 'PTBA',
    idxTicker: 'IDX:PTBA',
    yfTicker: 'PTBA.JK',
    name: 'Bukit Asam Tbk',
    sector: 'Energy',
    lastPrice: 2970,
    change1D: -1.66,
    return30D: 1.10,
    beta1Y: 0.79,
    volatilityAnn: 19.4,
    roe: 25.1,
    debtToEquity: 0.22,
    operatingMargin: 22.8
  },
  {
    ticker: 'SIDO',
    idxTicker: 'IDX:SIDO',
    yfTicker: 'SIDO.JK',
    name: 'Industri Jamu dan Farmasi Sido Muncul Tbk',
    sector: 'Healthcare',
    lastPrice: 318,
    change1D: 0.00,
    return30D: -2.80,
    beta1Y: 0.49,
    volatilityAnn: 15.2,
    roe: 28.4,
    debtToEquity: 0.09,
    operatingMargin: 34.6
  },
  {
    ticker: 'UNTR',
    idxTicker: 'IDX:UNTR',
    yfTicker: 'UNTR.JK',
    name: 'United Tractors Tbk',
    sector: 'Industrials',
    lastPrice: 23525,
    change1D: 1.62,
    return30D: 0.80,
    beta1Y: 0.82,
    volatilityAnn: 18.2,
    roe: 23.9,
    debtToEquity: 0.29,
    operatingMargin: 22.4
  },
  {
    ticker: 'MYOR',
    idxTicker: 'IDX:MYOR',
    yfTicker: 'MYOR.JK',
    name: 'Mayora Indah Tbk',
    sector: 'Consumer Non-Cyclicals',
    lastPrice: 2280,
    change1D: 1.33,
    return30D: 2.10,
    beta1Y: 0.55,
    volatilityAnn: 14.5,
    roe: 21.2,
    debtToEquity: 0.39,
    operatingMargin: 14.9
  },
  {
    ticker: 'CMRY',
    idxTicker: 'IDX:CMRY',
    yfTicker: 'CMRY.JK',
    name: 'Cisarua Mountain Dairy Tbk',
    sector: 'Consumer Non-Cyclicals',
    lastPrice: 4650,
    change1D: 1.97,
    return30D: 4.50,
    beta1Y: 0.52,
    volatilityAnn: 14.2,
    roe: 23.8,
    debtToEquity: 0.11,
    operatingMargin: 20.4
  },
  {
    ticker: 'MIKA',
    idxTicker: 'IDX:MIKA',
    yfTicker: 'MIKA.JK',
    name: 'Mitra Keluarga Karyasehat Tbk',
    sector: 'Healthcare',
    lastPrice: 2390,
    change1D: 0.84,
    return30D: 1.40,
    beta1Y: 0.56,
    volatilityAnn: 14.9,
    roe: 18.9,
    debtToEquity: 0.08,
    operatingMargin: 29.8
  },
  {
    ticker: 'UNVR',
    idxTicker: 'IDX:UNVR',
    yfTicker: 'UNVR.JK',
    name: 'Unilever Indonesia Tbk',
    sector: 'Consumer Non-Cyclicals',
    lastPrice: 1445,
    change1D: 3.96,
    return30D: -6.20,
    beta1Y: 0.52,
    volatilityAnn: 18.8,
    roe: 82.5,
    debtToEquity: 3.45,
    operatingMargin: 15.2
  },
  {
    ticker: 'GOTO',
    idxTicker: 'IDX:GOTO',
    yfTicker: 'GOTO.JK',
    name: 'GoTo Gojek Tokopedia Tbk',
    sector: 'Technology',
    lastPrice: 25,
    change1D: 4.17,
    return30D: -14.80,
    beta1Y: 1.72,
    volatilityAnn: 48.2,
    roe: -14.2,
    debtToEquity: 0.32,
    operatingMargin: -18.5
  }
];

export function buildQuantStockList(
  rawList: RawStockInput[] = INITIAL_LQ45_UNIVERSE
): StockMetrics[] {
  const enriched = rawList.map(enrichStockMetrics);
  return rankUniverseWithBuffer(enriched, 40);
}

/**
 * Curated Domestic (Dalam Negeri) & International (Luar Negeri) Financial News with Direct Clickable Links
 */
export const DEFAULT_NEWS_SENTIMENT: NewsSentimentItem[] = [
  {
    id: 'dom_1',
    title: 'Pergerakan IHSG & Arus Modal Asing di Bursa Efek Indonesia: Rotasi ke Saham Berfundamental Kuat',
    source: 'CNBC Indonesia Market',
    publishedAt: 'Hari ini · Dalam Negeri',
    url: 'https://www.cnbcindonesia.com/market',
    region: 'DOMESTIC',
    summary: 'Investor institusi mencermati rilis kinerja kuartalan perbankan big-caps dan emiten komoditas ber-utang rendah di BEI.',
    sentiment: 'RISK_OFF',
    impactedSectors: ['Financials', 'Healthcare', 'Consumer Non-Cyclicals']
  },
  {
    id: 'dom_2',
    title: 'Kebijakan Moneter Bank Indonesia & Stabilitas Nilai Tukar Rupiah terhadap Likuiditas Pasar Saham',
    source: 'Kontan Investasi Nasional',
    publishedAt: 'Hari ini · Dalam Negeri',
    url: 'https://investasi.kontan.co.id/',
    region: 'DOMESTIC',
    summary: 'Langkah stabilisasi nilai tukar Rupiah dan imbal hasil SBN menjadi jangkar utama bagi sektor perbankan dan infrastruktur domestik.',
    sentiment: 'HAWKISH_RATES',
    impactedSectors: ['Financials', 'Infrastructures', 'Properties & Real Estate']
  },
  {
    id: 'dom_3',
    title: 'Prospek Dividen Emiten Energi, Batubara, dan Hilirisasi Mineral di Bursa Efek Indonesia',
    source: 'Bisnis Indonesia Market',
    publishedAt: 'Hari ini · Dalam Negeri',
    url: 'https://market.bisnis.com/',
    region: 'DOMESTIC',
    summary: 'Arus kas bebas yang tebal menjaga rasio pembagian dividen emiten energi dan tambang tetap menarik di tengah fluktuasi global.',
    sentiment: 'COMMODITY_BULL',
    impactedSectors: ['Energy', 'Basic Materials', 'Industrials']
  },
  {
    id: 'glb_1',
    title: 'US Treasury 10-Year Yield & Federal Reserve Rate Path: Implications for Emerging Asian Markets',
    source: 'MarketWatch Global Wire',
    publishedAt: 'Hari ini · Luar Negeri',
    url: 'https://www.marketwatch.com/markets',
    region: 'GLOBAL',
    summary: 'Global bond yields and US Dollar Index (DXY) movements continue to dictate cross-border institutional flows into ASEAN equities.',
    sentiment: 'HAWKISH_RATES',
    impactedSectors: ['Financials', 'Technology', 'Infrastructures']
  },
  {
    id: 'glb_2',
    title: 'Global Gold & Energy Commodities Surge Amid Geopolitical Hedging and Supply Discipline',
    source: 'Yahoo Finance Global',
    publishedAt: 'Hari ini · Luar Negeri',
    url: 'https://finance.yahoo.com/commodities/',
    region: 'GLOBAL',
    summary: 'Safe-haven demand for gold and resilient seaborne thermal coal pricing provide strong export tailwinds for resource-rich economies.',
    sentiment: 'COMMODITY_BULL',
    impactedSectors: ['Energy', 'Basic Materials']
  },
  {
    id: 'glb_3',
    title: 'Wall Street S&P 500, CBOE VIX Volatility & Hang Seng Index Cross-Asset Risk Appetite',
    source: 'CNBC Global Markets',
    publishedAt: 'Hari ini · Luar Negeri',
    url: 'https://www.cnbc.com/world-markets/',
    region: 'GLOBAL',
    summary: 'Moderation in the CBOE VIX index alongside East Asian equity recovery supports selective risk-taking in quality factor portfolios.',
    sentiment: 'RISK_ON',
    impactedSectors: ['Financials', 'Consumer Non-Cyclicals', 'Industrials']
  }
];
