import {
  ActivePortfolioEvaluation,
  BarbellRole,
  CandidateRecommendation,
  DeMiguelBufferZone,
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
  StockMetrics
} from '../types/quant';
import {
  getEmitenDividendYield,
  isInstitutionalLiquidCandidate
} from '../data/idxAllEmitenCatalog';

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
>;

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
  divYield: number
): {
  isHscFlagged: boolean;
  hscSource: 'MANUAL' | 'AUTO_QUANT' | 'NONE';
  hscReason?: string;
} {
  const clean = item.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const overrides = getHscManualOverrides();

  if (overrides.removed.includes(clean)) {
    return { isHscFlagged: false, hscSource: 'NONE' };
  }

  if (overrides.added.includes(clean)) {
    return {
      isHscFlagged: true,
      hscSource: 'MANUAL',
      hscReason: 'Label Manual HSC oleh Pengguna (Diblokir dari Top Decile Buy)'
    };
  }

  if (PRE_SEEDED_HSC_TICKERS.has(clean)) {
    return {
      isHscFlagged: true,
      hscSource: 'MANUAL',
      hscReason: 'Watchlist Indikasi HSC / Cornered & Spekulatif Tinggi (TRUK, ROCK, dll.)'
    };
  }

  const isInst = isInstitutionalLiquidCandidate(clean);
  if (!isInst) {
    // Heuristic 1: Speculative price spike / ARA anomaly without fundamental Value or Dividend backing
    if (
      (Math.abs(item.change1D) >= 8.5 || item.return30D >= 22.0) &&
      (dmuValueScore < 6.4 || item.roe < 10.5) &&
      divYield <= 0
    ) {
      return {
        isHscFlagged: true,
        hscSource: 'AUTO_QUANT',
        hscReason: 'Auto HSC: Lonjakan harga spekulatif tanpa dukungan Value & Dividen'
      };
    }

    // Heuristic 2: Extreme annualized volatility on non-institutional stock with weak Value score
    if (item.volatilityAnn >= 40.0 && dmuValueScore < 6.2 && divYield <= 0) {
      return {
        isHscFlagged: true,
        hscSource: 'AUTO_QUANT',
        hscReason: 'Auto HSC: Volatilitas ekstrem (>40%) non-institusional ber-Value rendah'
      };
    }

    // Heuristic 3: Weak fundamental third-liner with low ROE & high leverage
    if (
      (item.roe < 8.0 && item.debtToEquity >= 1.1 && divYield <= 0) ||
      (dmuValueScore < 5.0 && divYield <= 0)
    ) {
      return {
        isHscFlagged: true,
        hscSource: 'AUTO_QUANT',
        hscReason: 'Auto HSC: Fundamental lemah (ROE rendah / DER tinggi) non-institusional'
      };
    }
  }

  return { isHscFlagged: false, hscSource: 'NONE' };
}

export function computeDeMiguelFourFactors(item: RawStockInput): {
  dmuMomScore: number;
  dmuLowVolScore: number;
  dmuValueScore: number;
  dmuSizeScore: number;
  dmuCompositeScore: number;
  isHscFlagged: boolean;
  hscSource: 'MANUAL' | 'AUTO_QUANT' | 'NONE';
  hscReason?: string;
} {
  const isLiquid = item.isLiquid !== false && item.lastPrice >= 68;
  const divYield =
    item.lastPrice > 0
      ? getEmitenDividendYield(item.ticker, item.lastPrice) || item.dividendYieldPct || 0
      : item.dividendYieldPct ?? getEmitenDividendYield(item.ticker);

  // If stock is illiquid, stagnant/suspended, gocap (< Rp 68), or unverified on Yahoo Finance:
  // Penalize Low-Vol, Size/Liq, and Composite Score so it NEVER masquerades as a Low-Volatility leader!
  if (!isLiquid) {
    const roeComp = Math.max(0, Math.min(10, (Math.min(32, item.roe) / 24) * 9.2));
    const marginComp = Math.max(0, Math.min(10, (item.operatingMargin / 38) * 9.5));
    const deComp = Math.max(1, Math.min(10, 10 - (item.debtToEquity / 2.2) * 8));
    const dmuValueScore = Number(
      Math.max(1.0, Math.min(5.5, (0.42 * roeComp + 0.30 * marginComp + 0.28 * deComp) * 0.65)).toFixed(1)
    );
    const hscEval = evaluateHscIndication(item, dmuValueScore, divYield);
    return {
      dmuLowVolScore: 1.5,
      dmuMomScore: 1.8,
      dmuValueScore,
      dmuSizeScore: 1.4,
      dmuCompositeScore: Number(Math.min(2.65, 0.25 * dmuValueScore + 1.4).toFixed(2)),
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

  // 3. Dynamic Value & Dividend Yield Score (Prioritizes Joeliardi Sunendar ROE, Margin, Prudent DER & Dividend Yield)
  const anchorPrice = BASELINE_PRICE_ANCHORS[item.ticker] || item.lastPrice;
  const liveValuationMultiplier =
    item.lastPrice > 0
      ? Math.max(0.84, Math.min(1.24, anchorPrice / item.lastPrice))
      : 1.0;

  const roeComp = Math.max(0, Math.min(10, (Math.min(32, item.roe) / 23) * 9.4));
  const marginComp = Math.max(0, Math.min(10, (item.operatingMargin / 36) * 9.5));
  const deComp = Math.max(1, Math.min(10, 10 - (item.debtToEquity / 2.1) * 8));
  const divBonus = divYield > 0 ? Math.min(1.35, divYield * 0.18) : 0;
  const rawValue =
    (0.44 * roeComp + 0.28 * marginComp + 0.28 * deComp) * liveValuationMultiplier + divBonus;
  const dmuValueScore = Number(Math.max(1.0, Math.min(9.9, rawValue)).toFixed(1));

  // 4. Capital Efficiency & Institutional Liquidity Score
  const isInst = isInstitutionalLiquidCandidate(item.ticker);
  const instLiqBonus = isInst ? 0.75 : 0;
  const dmuSizeScore = Number(
    Math.max(
      1.0,
      Math.min(
        9.9,
        0.50 * deComp + 0.32 * roeComp + (item.change1D >= 0 ? 0.5 : 0.1) + instLiqBonus
      )
    ).toFixed(1)
  );

  // Evaluate HSC (High Speculative Concentration / Cornered Risk)
  const hscEval = evaluateHscIndication(item, dmuValueScore, divYield);

  // Value-Gated Momentum Cap: Non-institutional stocks with weak Value cannot use sudden price spikes to game composite rank
  const effectiveMomScore =
    !isInst && dmuValueScore < 6.2 && divYield <= 0
      ? Math.min(dmuMomScore, 5.6)
      : dmuMomScore;

  // Overall 4-Factor Composite Score (Value-Prioritized: 35% Value, 28% Low-Vol, 22% Momentum, 15% Size/Liquidity)
  const rawComposite =
    0.35 * dmuValueScore +
    0.28 * dmuLowVolScore +
    0.22 * effectiveMomScore +
    0.15 * dmuSizeScore;

  const dmuCompositeScore = hscEval.isHscFlagged
    ? Number(Math.max(1.2, Math.min(3.45, rawComposite * 0.52)).toFixed(2))
    : Number(Math.max(1.0, Math.min(9.9, rawComposite)).toFixed(2));

  return {
    dmuMomScore,
    dmuLowVolScore,
    dmuValueScore,
    dmuSizeScore,
    dmuCompositeScore,
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
          instBoost
        ).toFixed(2)
      );
    }
    // Default Defensive Core: 45% Low-Vol + 38% Live-Adjusted Value + 17% Trend Stability + Dividend Yield Priority
    return Number(
      (
        0.45 * stock.dmuLowVolScore +
        0.38 * stock.dmuValueScore +
        0.17 * stock.dmuMomScore +
        stock.change1D * 0.15 +
        divBoost +
        instBoost
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
        instBoost * 0.7
      ).toFixed(2)
    );
  }

  // Default Momentum Alpha: 45% Live Price Action + 30% Value Quality + 25% Size
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
      instBoost * 0.7
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
  const divPart =
    (stock.dividendYieldPct ?? 0) > 0
      ? ` · DIV ${(stock.dividendYieldPct ?? 0).toFixed(2)}%`
      : '';

  if (basket === 'DEFENSIVE') {
    if (mode === 'TOP_GAINERS_MOMENTUM') {
      return `Low-Beta Gainer: 1D ${c1d} · 30D ${r30} · β ${stock.beta1Y.toFixed(2)}x${divPart}`;
    }
    return `Low-Vol ${stock.dmuLowVolScore.toFixed(1)} · Val ${stock.dmuValueScore.toFixed(1)} · Vol ${stock.volatilityAnn.toFixed(1)}% (β ${stock.beta1Y.toFixed(2)})${divPart}`;
  }

  if (mode === 'TOP_GAINERS_MOMENTUM') {
    return `Breakout Live: 1D ${c1d} · 30D ${r30} · Val ${stock.dmuValueScore.toFixed(1)}${divPart}`;
  }
  return `Val ${stock.dmuValueScore.toFixed(1)} · Mom ${stock.dmuMomScore.toFixed(1)} · 30D ${r30} · 1D ${c1d}${divPart}`;
}

export function classifyBarbellRole(beta1Y: number, dmuCompositeScore: number): BarbellRole {
  if (dmuCompositeScore >= 6.6 && beta1Y <= 0.95) {
    return 'DEFENSIVE_QUALITY';
  }
  if (dmuCompositeScore >= 6.2 && beta1Y > 0.95) {
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

  const normalizedInput: RawStockInput = {
    ...item,
    isLiquid,
    dividendYieldPct
  };

  const factors = computeDeMiguelFourFactors(normalizedInput);
  const isCleanAndLiquid = isLiquid && !factors.isHscFlagged;

  const hrpPropensity = isCleanAndLiquid
    ? Number(((factors.dmuCompositeScore / Math.max(11, item.volatilityAnn)) * 10).toFixed(2))
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
    ...factors,
    dmuRankPct,
    dmuZone,
    qmjScore: Number(factors.dmuCompositeScore.toFixed(1)),
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
 * Joeliardi Sunendar ("Bapak Fundamental Indonesia") + Out-of-Sample (OOS) Quantitative Fundamental Evaluator
 * Computes Business Moat Quality, Balance Sheet Solvency, Intrinsic Fair Value (Graham-Joeliardi ROE-Adjusted Model),
 * Margin of Safety (%), and OOS Cross-Sectional Robustness for Pre-Buy Conviction Inspection.
 */
export function evaluateJoeliardiOosFundamental(stock: StockMetrics): JoeliardiOosEvaluation {
  const price = Math.max(50, stock.lastPrice);
  const roe = Math.max(0.5, stock.roe);
  const der = Math.max(0.05, stock.debtToEquity);
  const opMargin = Math.max(0.5, stock.operatingMargin);
  const divYield = stock.dividendYieldPct ?? 0;
  const isInst = isInstitutionalLiquidCandidate(stock.ticker);

  // Sector-calibrated market PBV baseline adjusted by live price vs anchor
  const anchorPrice = BASELINE_PRICE_ANCHORS[stock.ticker] || price;
  const priceRatio = price / Math.max(50, anchorPrice);

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

  const impliedPbv = Number(
    Math.max(0.45, Math.min(8.5, baseSectorPbv * priceRatio * (roe / 16.5) * 0.88)).toFixed(2)
  );
  const estimatedBvpsIdr = Math.max(25, Math.round(price / impliedPbv));
  const estimatedEpsIdr = Math.max(2, Math.round((estimatedBvpsIdr * roe) / 100));
  const impliedPer = Number(Math.max(2.5, Math.min(65, price / estimatedEpsIdr)).toFixed(2));

  // Joeliardi Sunendar Fair Multiple Calibration (Indonesian Cost of Equity Ke = 10.5%, Sustainable g = 4.5%)
  // Justified PBV = (Sustainable ROE - g) / (Ke - g), blended with Benjamin Graham 22.5x anchor
  const sustainableRoe = Math.min(26.5, roe);
  const justifiedPbvRaw = Math.max(0.55, (sustainableRoe - 4.0) / (10.5 - 4.0));
  const derPenaltyMultiplier = der <= 0.6 ? 1.05 : der <= 1.2 ? 0.95 : 0.78;
  const divQualityMultiplier = divYield >= 4.0 ? 1.12 : divYield > 0 ? 1.05 : 0.88;
  const hscDiscountMultiplier = stock.isHscFlagged ? 0.55 : 1.0;

  const joeliardiFairPbv = Number(
    Math.max(
      0.5,
      Math.min(4.8, justifiedPbvRaw * derPenaltyMultiplier * divQualityMultiplier * hscDiscountMultiplier)
    ).toFixed(2)
  );
  const joeliardiFairPer = Number(
    Math.max(
      5.5,
      Math.min(
        22.5,
        (9.5 + Math.max(0, sustainableRoe - 10) * 0.48 + divYield * 0.42) *
          derPenaltyMultiplier *
          hscDiscountMultiplier
      )
    ).toFixed(2)
  );

  // Graham Number & Joeliardi Blended Intrinsic Value
  const grahamIntrinsic = Math.sqrt(22.5 * estimatedEpsIdr * estimatedBvpsIdr);
  const joeliardiPbvIntrinsic = estimatedBvpsIdr * joeliardiFairPbv;
  const joeliardiPerIntrinsic = estimatedEpsIdr * joeliardiFairPer;

  const rawIntrinsic =
    0.45 * joeliardiPbvIntrinsic + 0.35 * joeliardiPerIntrinsic + 0.20 * grahamIntrinsic;
  const intrinsicValueIdr = Math.max(50, Math.round(rawIntrinsic / 5) * 5);

  const marginOfSafetyPct = Number(
    (((intrinsicValueIdr - price) / Math.max(1, intrinsicValueIdr)) * 100).toFixed(1)
  );

  // Pillar 1: Business Quality & Economic Moat (0 - 100)
  const roeScore = Math.min(45, (roe / 20) * 40);
  const marginScore = Math.min(30, (opMargin / 28) * 26);
  const moatBonus = (isInst ? 15 : 4) + (divYield > 0 ? 10 : 0);
  const businessQualityScore = Math.round(Math.max(15, Math.min(98, roeScore + marginScore + moatBonus)));

  // Pillar 2: Balance Sheet Health & Cashflow Reality (0 - 100)
  const derScore = Math.max(10, Math.min(55, 55 - der * 22));
  const cashDivScore = divYield >= 5 ? 30 : divYield >= 2 ? 22 : divYield > 0 ? 15 : 5;
  const hscSolvencyBonus = stock.isHscFlagged ? -25 : isInst ? 15 : 8;
  const balanceSheetHealthScore = Math.round(
    Math.max(12, Math.min(98, derScore + cashDivScore + hscSolvencyBonus))
  );

  // Pillar 3: Valuation & Margin of Safety (0 - 100)
  const mosScore = Math.max(10, Math.min(65, 38 + marginOfSafetyPct * 1.15));
  const valueFactorContribution = (stock.dmuValueScore / 10) * 35;
  const valuationSafetyScore = Math.round(
    Math.max(10, Math.min(98, mosScore + valueFactorContribution - (stock.isHscFlagged ? 25 : 0)))
  );

  // Pillar 4: Out-of-Sample (OOS) Quantitative Robustness (0 - 100)
  const oosCompositePart = (stock.dmuCompositeScore / 10) * 50;
  const oosLowVolPart = (stock.dmuLowVolScore / 10) * 30;
  const oosSizePart = (stock.dmuSizeScore / 10) * 20;
  const oosQuantRobustnessScore = Math.round(
    Math.max(10, Math.min(98, oosCompositePart + oosLowVolPart + oosSizePart))
  );

  const totalConvictionScore = Math.round(
    0.30 * businessQualityScore +
      0.25 * balanceSheetHealthScore +
      0.25 * valuationSafetyScore +
      0.20 * oosQuantRobustnessScore
  );

  let valuationVerdict: JoeliardiOosEvaluation['valuationVerdict'] = 'FAIR_QUALITY';
  let valuationLabel = 'Wajar Berkualitas (Fairly Valued Compounder)';
  if (stock.isHscFlagged || totalConvictionScore < 45) {
    valuationVerdict = 'OVERVALUED_OR_TRAP';
    valuationLabel = stock.isHscFlagged
      ? 'Peringatan Indikasi HSC / Spekulatif (Hindari)'
      : 'Mahal / Risiko Value Trap (Margin of Safety Negatif)';
  } else if (marginOfSafetyPct >= 15 && stock.dmuValueScore >= 6.8) {
    valuationVerdict = 'STRONG_UNDERVALUED';
    valuationLabel = `Diskon Nilai Intrinsik (MoS +${marginOfSafetyPct}%)`;
  } else if (marginOfSafetyPct < -12) {
    valuationVerdict = 'FULLY_VALUED';
    valuationLabel = 'Premium / Di Atas Nilai Intrinsik Konservatif';
  }

  const convictionGrade: JoeliardiOosEvaluation['convictionGrade'] = stock.isHscFlagged
    ? 'D (AVOID / HSC)'
    : totalConvictionScore >= 82
    ? 'A+ (CORE CONVICTION)'
    : totalConvictionScore >= 72
    ? 'A (SOLID VALUE)'
    : totalConvictionScore >= 58
    ? 'B (WATCHLIST / HOLD)'
    : 'C (SPECULATIVE)';

  const keyStrengths: string[] = [];
  const keyRisks: string[] = [];

  if (roe >= 15) {
    keyStrengths.push(
      `ROE ${roe.toFixed(1)}% melampaui Cost of Equity RI (10,5%), mencerminkan keunggulan kompetitif (Moat) sesuai kriteria Joeliardi Sunendar.`
    );
  }
  if (der <= 0.65) {
    keyStrengths.push(
      `Struktur neraca konservatif dengan DER ${der.toFixed(2)}x, meminimalkan risiko beban bunga dan gagal bayar.`
    );
  }
  if (divYield > 0) {
    keyStrengths.push(
      `Membagikan dividen tunai nyata (${divYield.toFixed(2)}% TTM), memvalidasi kualitas laba dan kas riil (bukan laba akuntansi semu).`
    );
  }
  if (marginOfSafetyPct >= 10 && !stock.isHscFlagged) {
    keyStrengths.push(
      `Diperdagangkan di bawah estimasi Nilai Intrinsik Rp ${intrinsicValueIdr.toLocaleString('id-ID')} (Margin of Safety +${marginOfSafetyPct}%).`
    );
  }
  if (stock.dmuLowVolScore >= 7.0) {
    keyStrengths.push(
      `Stabilitas OOS Low-Volatility tinggi (${stock.dmuLowVolScore.toFixed(1)}/10, Beta ${stock.beta1Y.toFixed(2)}x), tahan banting saat IHSG bergejolak.`
    );
  }
  if (keyStrengths.length === 0) {
    keyStrengths.push(
      `Likuiditas perdagangan tercatat pada harga Rp ${price.toLocaleString('id-ID')} di sektor ${stock.sector}.`
    );
  }

  if (stock.isHscFlagged) {
    keyRisks.push(
      `${stock.hscReason || 'Terindikasi HSC (High Speculative Concentration)'}. Diblokir otomatis dari Top Decile Buy.`
    );
  }
  if (roe < 10.5) {
    keyRisks.push(
      `ROE (${roe.toFixed(1)}%) berada di bawah Cost of Equity wajar (10,5%), efisiensi penciptaan nilai ekuitas belum optimal.`
    );
  }
  if (der > 1.1) {
    keyRisks.push(
      `Leverage neraca relatif tinggi (DER ${der.toFixed(2)}x), sensitif terhadap kenaikan suku bunga.`
    );
  }
  if (marginOfSafetyPct < 0) {
    keyRisks.push(
      `Harga pasar saat ini berada ${Math.abs(marginOfSafetyPct).toFixed(1)}% di atas nilai intrinsik konservatif Joeliardi-Graham.`
    );
  }
  if (stock.volatilityAnn >= 32) {
    keyRisks.push(
      `Volatilitas tahunan tinggi (${stock.volatilityAnn.toFixed(1)}%), menuntut disiplin ukuran posisi (position sizing) yang ketat.`
    );
  }
  if (keyRisks.length === 0) {
    keyRisks.push(
      `Pantau dinamika makro sektoral (${stock.sector}) dan realisasi laporan keuangan kuartalan berikutnya.`
    );
  }

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
    intrinsicValueIdr,
    marginOfSafetyPct,
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
 * Portfolio Optimizer & BEI Lot-100 Calculator
 * Strictly blocks illiquid, stagnant/suspended (gocap), HSC-flagged, and unverified Yahoo Finance stocks
 * from entering Keranjang 1 or Keranjang 2, and prioritizes Value & dividend-paying quality issuers.
 */
export function computeOptimalHRPBarbellPortfolio(
  stocks: StockMetrics[],
  regime: MarketRegime,
  capitalIdr: number,
  maxPicksPerSleeve: number = 4,
  selectionMode: BasketSelectionMode = 'LIVE_FACTOR_LEADER'
): PortfolioAnalyticsSummary {
  const refreshedStocks = rankUniverseWithBuffer(stocks, 40);
  // Strictly require live-fetched, liquid, non-HSC stocks with solid Value score
  const institutionalLiquidPool = refreshedStocks.filter(
    (s) =>
      s.isLiveFetched === true &&
      s.isLiquid !== false &&
      !s.isHscFlagged &&
      s.lastPrice >= 80 &&
      s.dmuValueScore >= 6.0 &&
      isInstitutionalLiquidCandidate(s.ticker)
  );
  const fallbackLiquidPool = refreshedStocks.filter(
    (s) =>
      s.isLiveFetched === true &&
      s.isLiquid !== false &&
      !s.isHscFlagged &&
      s.lastPrice >= 80 &&
      s.dmuValueScore >= 5.8
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

  // 1. Select Keranjang 1 (Low-Volatility, Dividend & Value Core: Liquid, Beta <= 0.96, Positive ROE)
  const defCandidates = selectSleeveCandidates(
    (s) =>
      s.isLiquid !== false &&
      s.lastPrice >= 80 &&
      s.roe >= 8 &&
      s.beta1Y <= 0.96 &&
      s.dmuLowVolScore >= 5.5,
    'DEFENSIVE',
    maxPicksPerSleeve
  );
  const selectedDefTickers = new Set(defCandidates.map((s) => s.ticker));

  // 2. Select Keranjang 2 (Momentum & Size Alpha: Liquid Non-Keranjang 1 candidates with strong live momentum/beta)
  const aggCandidates = selectSleeveCandidates(
    (s) =>
      !selectedDefTickers.has(s.ticker) &&
      s.isLiquid !== false &&
      s.lastPrice >= 80 &&
      s.roe >= 5 &&
      (selectionMode === 'TOP_GAINERS_MOMENTUM'
        ? s.change1D >= -1.0
        : s.beta1Y > 0.78 || s.return30D > 0 || s.change1D > 0.5),
    'AGGRESSIVE',
    maxPicksPerSleeve
  );

  const activeEquityWeightPct = regime.aggressiveWeight;
  const cashReserveWeightPct = regime.defensiveWeight;
  const lowVolCoreSleevePct = Math.round(activeEquityWeightPct * 0.55);
  const momAlphaSleevePct = activeEquityWeightPct - lowVolCoreSleevePct;

  const buildSleevePositions = (
    candidates: StockMetrics[],
    basketType: 'DEFENSIVE' | 'AGGRESSIVE',
    sleeveWeightPct: number
  ): HRPAllocationPosition[] => {
    if (candidates.length === 0) return [];

    const propensities = candidates.map((s) => {
      const sleeveScore = computeSleeveSpecificScore(s, basketType, selectionMode);
      return Math.pow(Math.max(1, sleeveScore), 1.4) / Math.max(10, s.volatilityAnn);
    });
    const sumPropensity = propensities.reduce((a, b) => a + b, 0) || 1;

    return candidates.map((stock, idx) => {
      const intraWeight = (propensities[idx] / sumPropensity) * 100;
      const totalWeight = (intraWeight * sleeveWeightPct) / 100;
      const allocatedIdr = Math.round((capitalIdr * totalWeight) / 100);
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

  const eligibleHoldings = resolvedPairs.filter(
    (p) => p.stock.dmuRankPct <= effectiveBufferPct && p.stock.dmuCompositeScore >= 5.2
  );
  const propSum =
    eligibleHoldings.reduce((acc, p) => acc + p.stock.hrpPropensity, 0) || 1;

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

    let targetOptimalWeightPct = 0;
    const isInsideBuffer =
      stock.dmuRankPct <= effectiveBufferPct && stock.dmuCompositeScore >= 5.2;

    if (isInsideBuffer) {
      targetOptimalWeightPct = Number(
        ((stock.hrpPropensity / propSum) * regime.aggressiveWeight).toFixed(1)
      );
    }

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
