import {
  CorporateActionOverrideInput,
  EnsembleValuationLeg,
  MarketRegimeStatus,
  RecommendationDecisionState,
  StockMetrics
} from '../types/quant';
import { getFundamentalUserOverride } from './dataLineageEngine';

export interface BuiltInCorporateActionCatalogEntry {
  ticker: string;
  splitRatioDivisor: number; // 1 = no unadjusted split; >1 = stock split ratio divisor (e.g. 2 for 1:2, 5 for 1:5); <1 = reverse split
  hasActiveBuyback: boolean;
  buybackNominalBillionIdr: number; // Active OJK/RUPS share buyback mandate in Billion IDR (Rp Miliar)
  liveMarketCapTrillionIdr: number; // Calibrated reference Market Cap in Trillion IDR (Rp Triliun) at baseline price
  baselineRefPriceIdr: number; // Reference price for scaling Live Market Cap dynamically with live spot price
  latestQuarterLabel: string; // e.g., "Q3-2026 (9M26 Annualized)"
  trailingRoePct: number; // Historical trailing 12M ROE (%)
  latestQuarterAnnualizedRoePct: number; // Proportionally annualized ROE (%) from latest quarterly earnings run-rate
  earningsGrowthYoYPct: number; // Latest quarterly Net Income / EPS YoY growth (%)
  catalystSummary: string;
}

/**
 * Built-in Registry of Verified IDX Corporate Actions (Buybacks, Stock Splits) & Latest Quarterly Earnings Surges.
 * Specifically addresses lagging trailing ROE biases on breakout/catalyst issuers (e.g., LSIP, PRDA, ADRO, BBRI, TAPG, etc.).
 */
export const IDX_CORPORATE_ACTION_CATALYST_REGISTRY: Record<
  string,
  BuiltInCorporateActionCatalogEntry
> = {
  LSIP: {
    ticker: 'LSIP',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 350,
    liveMarketCapTrillionIdr: 8.15,
    baselineRefPriceIdr: 1195,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 11.4,
    latestQuarterAnnualizedRoePct: 16.4,
    earningsGrowthYoYPct: 43.8,
    catalystSummary:
      'Lonjakan Laba Kuartal Berjalan +43,8% YoY (Harga CPO & Efisiensi Kebun Inti + Kas Bersih Tebal & Mandat Buyback)'
  },
  PRDA: {
    ticker: 'PRDA',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 200,
    liveMarketCapTrillionIdr: 3.05,
    baselineRefPriceIdr: 3250,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 12.4,
    latestQuarterAnnualizedRoePct: 16.1,
    earningsGrowthYoYPct: 29.8,
    catalystSummary:
      'Akselerasi Laba Kuartal Berjalan +29,8% YoY (Tes Esoterik & Klinik Prodia) + Price Floor Mandat Share Buyback Rp 200 Miliar'
  },
  TAPG: {
    ticker: 'TAPG',
    splitRatioDivisor: 1,
    hasActiveBuyback: false,
    buybackNominalBillionIdr: 0,
    liveMarketCapTrillionIdr: 16.8,
    baselineRefPriceIdr: 845,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 18.5,
    latestQuarterAnnualizedRoePct: 23.4,
    earningsGrowthYoYPct: 38.5,
    catalystSummary:
      'Breakout Laba Kuartal III +38,5% YoY dari Produktivitas Usia Tanaman Prima & Yield Dividen Kas Tinggi'
  },
  ADRO: {
    ticker: 'ADRO',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 4000,
    liveMarketCapTrillionIdr: 112.0,
    baselineRefPriceIdr: 3640,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 21.8,
    latestQuarterAnnualizedRoePct: 24.6,
    earningsGrowthYoYPct: 21.5,
    catalystSummary:
      'Injeksi Likuiditas Buyback Jumbo Rp 4,0 Triliun & Spinoff/Dividen Spesial Menjaga Price Floor Institusional'
  },
  BBRI: {
    ticker: 'BBRI',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 3000,
    liveMarketCapTrillionIdr: 685.0,
    baselineRefPriceIdr: 4520,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 19.6,
    latestQuarterAnnualizedRoePct: 21.2,
    earningsGrowthYoYPct: 14.2,
    catalystSummary:
      'Mandat Buyback Aktif Rp 3,0 Triliun & Pemulihan NIM/CoC Segmen Mikro Kuartal Berjalan'
  },
  BMRI: {
    ticker: 'BMRI',
    splitRatioDivisor: 1,
    hasActiveBuyback: false,
    buybackNominalBillionIdr: 0,
    liveMarketCapTrillionIdr: 615.0,
    baselineRefPriceIdr: 6575,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 21.2,
    latestQuarterAnnualizedRoePct: 23.5,
    earningsGrowthYoYPct: 22.4,
    catalystSummary:
      'Pertumbuhan Laba Kuartal Berjalan +22,4% YoY Ditopang Ekspansi Kredit Korporasi & CASA Kopra/Livin'
  },
  BBNI: {
    ticker: 'BBNI',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 905,
    liveMarketCapTrillionIdr: 192.0,
    baselineRefPriceIdr: 5150,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 14.8,
    latestQuarterAnnualizedRoePct: 16.5,
    earningsGrowthYoYPct: 16.8,
    catalystSummary:
      'Program Buyback Saham Rp 905 Miliar & Perbaikan Kualitas Aset Perbankan Korporasi'
  },
  BRIS: {
    ticker: 'BRIS',
    splitRatioDivisor: 1,
    hasActiveBuyback: false,
    buybackNominalBillionIdr: 0,
    liveMarketCapTrillionIdr: 132.0,
    baselineRefPriceIdr: 2860,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 16.4,
    latestQuarterAnnualizedRoePct: 19.2,
    earningsGrowthYoYPct: 29.4,
    catalystSummary:
      'Lonjakan Laba Bersih Syariah +29,4% YoY dari Pembiayaan Emas & Payroll Aparatur Negara'
  },
  ITMG: {
    ticker: 'ITMG',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 480,
    liveMarketCapTrillionIdr: 28.5,
    baselineRefPriceIdr: 25200,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 24.5,
    latestQuarterAnnualizedRoePct: 26.8,
    earningsGrowthYoYPct: 21.2,
    catalystSummary:
      'Mandat Buyback & Neraca Zero-Debt dengan Volume Produksi Kuartal III Melampaui Target'
  },
  UNTR: {
    ticker: 'UNTR',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 2000,
    liveMarketCapTrillionIdr: 98.0,
    baselineRefPriceIdr: 26300,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 22.4,
    latestQuarterAnnualizedRoePct: 24.8,
    earningsGrowthYoYPct: 20.6,
    catalystSummary:
      'Buyback Saham Rp 2,0 Triliun & Kontribusi Kas Tambang Emas/Nikel + Kontraktor Pama'
  },
  MAPI: {
    ticker: 'MAPI',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 300,
    liveMarketCapTrillionIdr: 26.5,
    baselineRefPriceIdr: 1595,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 18.2,
    latestQuarterAnnualizedRoePct: 21.4,
    earningsGrowthYoYPct: 24.8,
    catalystSummary:
      'Ekspansi Gerai Regional & Rebound Margin Ritel Kuartal III (+24,8% YoY) Didukung Mandat Buyback'
  },
  MEDC: {
    ticker: 'MEDC',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 800,
    liveMarketCapTrillionIdr: 33.2,
    baselineRefPriceIdr: 1320,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 17.5,
    latestQuarterAnnualizedRoePct: 21.2,
    earningsGrowthYoYPct: 28.5,
    catalystSummary:
      'Program Buyback Berkelanjutan Rp 800 Miliar & Lonjakan Laba Kuartal Berjalan +28,5% YoY'
  },
  TLKM: {
    ticker: 'TLKM',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 3000,
    liveMarketCapTrillionIdr: 282.0,
    baselineRefPriceIdr: 2850,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 18.4,
    latestQuarterAnnualizedRoePct: 19.8,
    earningsGrowthYoYPct: 14.5,
    catalystSummary:
      'Injeksi Likuiditas Buyback Rp 3,0 Triliun & Konsolidasi FMC Telkomsel-IndiHome Menjaga Floor Harga'
  },
  KLBF: {
    ticker: 'KLBF',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 1000,
    liveMarketCapTrillionIdr: 68.5,
    baselineRefPriceIdr: 1460,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 14.2,
    latestQuarterAnnualizedRoePct: 16.5,
    earningsGrowthYoYPct: 21.8,
    catalystSummary:
      'Mandat Buyback Rp 1,0 Triliun & Pemulihan Margin Bahan Baku Farmasi Kuartal III (+21,8% YoY)'
  },
  SIDO: {
    ticker: 'SIDO',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 300,
    liveMarketCapTrillionIdr: 18.6,
    baselineRefPriceIdr: 620,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 28.5,
    latestQuarterAnnualizedRoePct: 32.4,
    earningsGrowthYoYPct: 25.4,
    catalystSummary:
      'Laba Kuartal Berjalan +25,4% YoY (Ekspor Herbal & F&B) + Mandat Buyback Rp 300 Miliar'
  },
  CMRY: {
    ticker: 'CMRY',
    splitRatioDivisor: 1,
    hasActiveBuyback: false,
    buybackNominalBillionIdr: 0,
    liveMarketCapTrillionIdr: 41.5,
    baselineRefPriceIdr: 5225,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 21.4,
    latestQuarterAnnualizedRoePct: 25.8,
    earningsGrowthYoYPct: 27.5,
    catalystSummary:
      'Akselerasi Laba Kuartal Berjalan +27,5% YoY dari Penetrasi Produk Dairy & Consumer Foods'
  },
  JPFA: {
    ticker: 'JPFA',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 350,
    liveMarketCapTrillionIdr: 19.2,
    baselineRefPriceIdr: 1640,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 14.5,
    latestQuarterAnnualizedRoePct: 19.8,
    earningsGrowthYoYPct: 46.0,
    catalystSummary:
      'Turnaround Laba Bersih Kuartal Berjalan +46,0% YoY (Stabilisasi Harga DOC/Broiler & Pakan) + Buyback'
  },
  TOTL: {
    ticker: 'TOTL',
    splitRatioDivisor: 1,
    hasActiveBuyback: false,
    buybackNominalBillionIdr: 0,
    liveMarketCapTrillionIdr: 2.35,
    baselineRefPriceIdr: 690,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 15.8,
    latestQuarterAnnualizedRoePct: 20.4,
    earningsGrowthYoYPct: 31.5,
    catalystSummary:
      'Lonjakan Laba Konstruksi Gedung Swasta/Data Center +31,5% YoY dengan Kas Bersih & Dividen Rutin'
  },
  MARK: {
    ticker: 'MARK',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 80,
    liveMarketCapTrillionIdr: 3.65,
    baselineRefPriceIdr: 960,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 18.0,
    latestQuarterAnnualizedRoePct: 23.2,
    earningsGrowthYoYPct: 33.0,
    catalystSummary:
      'Rebound Permintaan Cetakan Sarung Tangan Global (+33,0% YoY) & Buyback Saham Aktif'
  },
  ARNA: {
    ticker: 'ARNA',
    splitRatioDivisor: 1,
    hasActiveBuyback: true,
    buybackNominalBillionIdr: 150,
    liveMarketCapTrillionIdr: 4.85,
    baselineRefPriceIdr: 660,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 24.2,
    latestQuarterAnnualizedRoePct: 26.5,
    earningsGrowthYoYPct: 21.0,
    catalystSummary:
      'Efisiensi Pabrik Keramik Plant 5C & Mandat Buyback Rp 150 Miliar Menjaga Price Floor Dividen'
  },
  ADMR: {
    ticker: 'ADMR',
    splitRatioDivisor: 1,
    hasActiveBuyback: false,
    buybackNominalBillionIdr: 0,
    liveMarketCapTrillionIdr: 56.4,
    baselineRefPriceIdr: 1380,
    latestQuarterLabel: 'Q3-2026 (9M26 Annualized)',
    trailingRoePct: 26.4,
    latestQuarterAnnualizedRoePct: 29.2,
    earningsGrowthYoYPct: 24.5,
    catalystSummary:
      'Ekspansi Coking Coal & Fase Konstruksi Smelter Aluminium (CWIP > 25% Aset) Memicu Step-Function Growth'
  }
};

const CUSTOM_CORP_ACTION_STORAGE_KEY = 'nostradamus_corp_action_overrides_v1';
let cachedCustomCorpActionOverrides: Record<string, CorporateActionOverrideInput> | null = null;

/**
 * Loads user-configured Corporate Action & Quarterly Catalyst overrides from localStorage (with in-memory cache).
 */
export function getCustomCorporateActionOverrides(): Record<string, CorporateActionOverrideInput> {
  if (cachedCustomCorpActionOverrides !== null) {
    return cachedCustomCorpActionOverrides;
  }
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CUSTOM_CORP_ACTION_STORAGE_KEY);
    if (!raw) {
      cachedCustomCorpActionOverrides = {};
      return cachedCustomCorpActionOverrides;
    }
    const parsed = JSON.parse(raw);
    const resolved: Record<string, CorporateActionOverrideInput> =
      parsed && typeof parsed === 'object' ? parsed : {};
    cachedCustomCorpActionOverrides = resolved;
    return resolved;
  } catch {
    cachedCustomCorpActionOverrides = {};
    return cachedCustomCorpActionOverrides;
  }
}

/**
 * Saves or updates a user-configured Corporate Action & Quarterly Catalyst override for a ticker.
 */
export function saveCustomCorporateActionOverride(input: CorporateActionOverrideInput): void {
  if (typeof window === 'undefined') return;
  const clean = input.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  if (!clean) return;
  try {
    const current = { ...getCustomCorporateActionOverrides() };
    current[clean] = {
      ...current[clean],
      ...input,
      ticker: clean
    };
    cachedCustomCorpActionOverrides = current;
    window.localStorage.setItem(CUSTOM_CORP_ACTION_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Removes a custom override for a ticker, restoring the built-in IDX registry or live heuristic.
 */
export function resetCorporateActionOverride(ticker: string): void {
  if (typeof window === 'undefined') return;
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  try {
    const current = { ...getCustomCorporateActionOverrides() };
    if (current[clean]) {
      delete current[clean];
      cachedCustomCorpActionOverrides = current;
      window.localStorage.setItem(CUSTOM_CORP_ACTION_STORAGE_KEY, JSON.stringify(current));
    }
  } catch {
    // ignore
  }
}

export interface InterceptedCorporateActionState {
  ticker: string;
  splitRatioDivisor: number;
  adjustedAnchorPriceIdr: number;
  adjustedAdtv20dIdr: number;
  hasActiveBuyback: boolean;
  buybackNominalIdr: number;
  sharesOutstanding: number;
  liveMarketCapIdr: number;
  dynamicBuybackYieldPct: number;
  trailingRoePct: number;
  forwardAnnualizedRoePct: number;
  earningsGrowthYoYPct: number;
  latestQuarterLabel: string;
  detectedQuarter: 1 | 2 | 3 | 4;
  annualizationFactor: number;
  catalystValuationBoostPct: number; // Capped at +15.0% per architectural policy
  catalystValuationMultiplier: number; // 1.00 to 1.15
  isCatalystActive: boolean;
  hasActiveCatalyst: boolean; // Triggered by buyback, earnings surge >20%, or acquisition
  catalystBadgeLabel?: string;
  catalystNarrative: string;
  isManualOverride: boolean;
}

/**
 * Official IDX / KSEI Listed Shares Outstanding Registry (Jumlah Saham Tercatat Resmi BEI dalam lembar penuh).
 * Used as the primary deterministic baseline for Market Cap = Shares Outstanding × Live Price
 * so P0 Data Integrity Guardrails (Implied Shares vs Shares Outstanding) remain 100% reconciled.
 */
export const IDX_OFFICIAL_SHARES_OUTSTANDING_REGISTRY: Record<string, number> = {
  // Financials
  BBCA: 123_275_050_000,
  BBRI: 151_559_001_604,
  BMRI: 93_333_333_332,
  BBNI: 37_297_300_424,
  BRIS: 46_129_260_138,
  BNGA: 25_131_606_843,
  NISP: 22_945_296_979,
  BTPS: 7_703_700_000,
  BDMN: 9_773_552_870,
  BNLI: 36_181_359_920,
  BBTN: 14_034_412_110,
  BJBR: 10_521_279_279,
  BJTM: 15_015_498_082,
  PNBN: 24_087_645_998,
  ARTO: 13_856_250_000,
  BBYB: 12_038_814_481,
  BFIN: 15_967_115_620,
  ADMF: 1_000_000_000,
  // Energy
  ADRO: 30_758_665_900,
  ITMG: 1_129_925_000,
  PTBA: 11_520_659_250,
  PGAS: 24_241_508_196,
  MEDC: 25_136_231_252,
  AKRA: 20_073_474_600,
  HRUM: 13_518_120_000,
  INDY: 5_210_192_000,
  BUMI: 371_320_733_776,
  ELSA: 7_298_500_000,
  RAJA: 4_227_082_500,
  TOBA: 8_252_645_144,
  DEWA: 21_853_733_792,
  DOID: 8_618_719_650,
  MBMA: 107_995_419_900,
  // Basic Materials
  AMMN: 72_518_217_600,
  ANTM: 24_030_764_725,
  INCO: 10_539_784_534,
  MDKA: 24_472_983_771,
  NCKL: 63_098_600_000,
  SMGR: 6_751_540_089,
  INTP: 3_681_231_699,
  TPIA: 86_511_545_192,
  BRPT: 93_747_218_044,
  INKP: 5_470_982_941,
  TKIM: 3_113_223_570,
  TINS: 7_447_753_454,
  ESSA: 17_226_975_700,
  AVIA: 61_953_555_600,
  // Consumer Non-Cyclicals
  ICBP: 11_661_908_000,
  INDF: 8_780_426_500,
  MYOR: 22_358_699_725,
  CMRY: 7_934_686_500,
  AMRT: 41_524_501_700,
  CPIN: 16_398_000_000,
  TAPG: 19_852_545_000,
  UNVR: 38_150_000_000,
  JPFA: 11_726_575_201,
  GGRM: 1_924_088_000,
  HMSP: 116_318_076_900,
  LSIP: 6_822_863_965,
  AALI: 1_924_688_333,
  SSMS: 9_525_000_000,
  // Healthcare
  KLBF: 46_875_122_110,
  SIDO: 30_000_000_000,
  MIKA: 14_246_349_500,
  HEAL: 15_365_813_250,
  SILO: 13_006_125_000,
  TSPC: 4_509_864_300,
  PRDA: 937_500_000,
  SAME: 17_115_362_326,
  // Infrastructures
  TLKM: 99_062_216_600,
  ISAT: 32_250_810_957,
  EXCL: 13_128_430_665,
  JSMR: 7_257_871_200,
  BREN: 133_786_220_000,
  PGEO: 41_495_047_624,
  TOWR: 51_014_625_000,
  TBIG: 22_656_999_445,
  MTEL: 83_559_626_344,
  ADHI: 8_407_608_879,
  // Industrials
  ASII: 40_483_553_140,
  UNTR: 3_730_135_136,
  ARNA: 7_341_430_900,
  TOTL: 3_410_000_000,
  MARK: 3_800_000_310,
  HEXA: 840_000_000,
  // Consumer Cyclicals
  ACES: 17_150_000_000,
  MAPI: 16_600_000_000,
  MAPA: 28_504_000_000,
  ERAA: 15_950_000_000,
  AUTO: 4_819_733_000,
  DRMA: 4_705_882_300,
  // Properties & Real Estate
  CTRA: 18_535_695_255,
  BSDE: 21_171_365_812,
  PWON: 48_159_602_400,
  SMRA: 16_508_568_358,
  PANI: 16_883_647_500,
  // Technology & Logistics
  GOTO: 1_201_409_662_836,
  EMTK: 61_395_725_848,
  BUKA: 103_109_256_342,
  MKNT: 5_000_000_000,
  ASSA: 3_691_218_669
};

export function resolveOfficialIdxSharesOutstanding(
  ticker: string,
  splitRatioDivisor = 1
): number | undefined {
  const clean = ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const baseShares = IDX_OFFICIAL_SHARES_OUTSTANDING_REGISTRY[clean];
  if (!baseShares || baseShares <= 0) return undefined;
  const builtInSplit = IDX_CORPORATE_ACTION_CATALYST_REGISTRY[clean]?.splitRatioDivisor ?? 1;
  const effectiveMultiplier =
    splitRatioDivisor > 0 && Math.abs(splitRatioDivisor - builtInSplit) > 1e-4
      ? splitRatioDivisor / builtInSplit
      : 1;
  return Math.max(1, Math.round(baseShares * effectiveMultiplier));
}

/**
 * Helper middleware that divides static per-share variables (BVPS, EPS, Target Price, and ADTV)
 * by the dynamic stock split (>1) or reverse split (0 < ratio < 1) divisor before valuation execution.
 */
export function applyDynamicCorporateActionDivisor(params: {
  rawBvpsIdr: number;
  rawEpsIdr: number;
  rawTargetPriceIdr: number;
  rawAdtv20dIdr: number;
  splitRatioDivisor: number;
}): {
  bvpsIdr: number;
  epsIdr: number;
  targetPriceIdr: number;
  adtv20dIdr: number;
} {
  const { rawBvpsIdr, rawEpsIdr, rawTargetPriceIdr, rawAdtv20dIdr, splitRatioDivisor } = params;
  const ratio = Number(splitRatioDivisor) > 0 ? Number(splitRatioDivisor) : 1;

  if (Math.abs(ratio - 1) < 1e-4) {
    return {
      bvpsIdr: Math.max(10, Math.round(rawBvpsIdr)),
      epsIdr: Math.max(1, Math.round(rawEpsIdr)),
      targetPriceIdr: Math.max(50, Math.round(rawTargetPriceIdr)),
      adtv20dIdr: Math.max(250_000_000, Math.round(rawAdtv20dIdr))
    };
  }

  // Divide static per-share metrics (BVPS, EPS, Target Price) and calibrate ADTV capacity by split ratio
  return {
    bvpsIdr: Math.max(10, Math.round(rawBvpsIdr / ratio)),
    epsIdr: Math.max(1, Math.round(rawEpsIdr / ratio)),
    targetPriceIdr: Math.max(50, Math.round(rawTargetPriceIdr / ratio)),
    adtv20dIdr: Math.max(250_000_000, Math.round(rawAdtv20dIdr / Math.pow(ratio, 0.35)))
  };
}

/**
 * 1. CORPORATE ACTION INTERCEPTOR & 2. FORWARD-LOOKING ANNUALIZER (Pure Functional Middleware)
 * Intercepts stock metrics and baseline anchors BEFORE they enter the valuation models:
 * - Applies stock split or reverse split divisor (`splitRatioDivisor`) to historical anchor prices, BVPS, EPS, and ADTV limits.
 * - Computes dynamic Buyback Yield (`Nominal Buyback / Live Market Cap`) for full pass-through into TSY.
 * - Intercepts quarterly YTD earnings (Q1 x4/1, Q2 x4/2, Q3 x4/3) to produce `forwardAnnualizedRoePct` and `earningsGrowthYoYPct`.
 * - Caps the direct valuation multiple boost from buybacks & quarterly earnings acceleration at +15% (`1.15x`).
 */
export function interceptCorporateActionAndAnnualize(params: {
  stock: StockMetrics;
  rawAnchorPriceIdr: number;
  rawAdtv20dIdr: number;
}): InterceptedCorporateActionState {
  const { stock, rawAnchorPriceIdr, rawAdtv20dIdr } = params;
  const clean = stock.ticker.trim().toUpperCase().replace(/\.JK$/i, '');
  const spotPrice = Math.max(50, stock.lastPrice || rawAnchorPriceIdr || 50);

  const customOverrides = getCustomCorporateActionOverrides();
  const custom = customOverrides[clean];
  const builtIn = IDX_CORPORATE_ACTION_CATALYST_REGISTRY[clean];
  const userFundOverride = getFundamentalUserOverride(clean);
  const hasRealOrOverriddenFundamentals =
    Boolean(
      (userFundOverride?.netIncomeTTMIdr && userFundOverride?.equityAttributableIdr) ||
        (stock.fundamentalsSource && stock.fundamentalsSource !== 'HARDCODED_SEED')
    );

  // Heuristic detection if a stock is not in the explicit registry/override:
  // Detects automatic stock split (>1) or reverse split (<1) unit scale mismatch
  let autoSplitDivisor = 1;
  if (!custom?.splitRatioDivisor && !builtIn?.splitRatioDivisor) {
    if (rawAnchorPriceIdr > spotPrice * 2.15) {
      const rawRatio = rawAnchorPriceIdr / spotPrice;
      const candidateRatios = [2, 4, 5, 10];
      for (const r of candidateRatios) {
        if (Math.abs(rawRatio - r) / r <= 0.28) {
          autoSplitDivisor = r;
          break;
        }
      }
    } else if (spotPrice > rawAnchorPriceIdr * 2.15) {
      // Reverse split heuristic (e.g. 1:5 reverse split -> divisor 0.2)
      const invRatio = spotPrice / Math.max(50, rawAnchorPriceIdr);
      const candidateReverse = [2, 4, 5, 10];
      for (const r of candidateReverse) {
        if (Math.abs(invRatio - r) / r <= 0.25) {
          autoSplitDivisor = Number((1 / r).toFixed(4));
          break;
        }
      }
    }
  }

  const rawDivisor = Number(
    custom?.splitRatioDivisor ?? builtIn?.splitRatioDivisor ?? stock.splitRatioDivisor ?? autoSplitDivisor
  );
  const splitRatioDivisor = rawDivisor > 0 ? rawDivisor : 1;

  // Divide historical anchor price & ADTV by splitRatioDivisor (supports both split >1 and reverse split <1)
  const adjustedAnchorPriceIdr =
    Math.abs(splitRatioDivisor - 1) > 1e-4
      ? Math.max(50, Math.round(rawAnchorPriceIdr / splitRatioDivisor))
      : Math.max(50, rawAnchorPriceIdr);

  const adjustedAdtv20dIdr =
    userFundOverride?.adtv20dIdr && userFundOverride.adtv20dIdr > 0
      ? Math.round(userFundOverride.adtv20dIdr)
      : Math.abs(splitRatioDivisor - 1) > 1e-4
      ? Math.max(250_000_000, Math.round(rawAdtv20dIdr / Math.pow(splitRatioDivisor, 0.35)))
      : rawAdtv20dIdr;

  const overrideComputedRoePct =
    userFundOverride?.netIncomeTTMIdr &&
    userFundOverride?.equityAttributableIdr &&
    userFundOverride.equityAttributableIdr > 0
      ? Number(
          Math.max(
            0.5,
            Math.min(65, (userFundOverride.netIncomeTTMIdr / userFundOverride.equityAttributableIdr) * 100)
          ).toFixed(2)
        )
      : undefined;

  // Resolve Trailing ROE vs Forward Annualized ROE (latest quarterly run-rate)
  const trailingRoePct = Math.max(
    0.5,
    Number(
      (
        overrideComputedRoePct ??
        custom?.trailingRoePct ??
        (hasRealOrOverriddenFundamentals ? stock.roe : undefined) ??
        builtIn?.trailingRoePct ??
        stock.trailingRoePct ??
        stock.roe
      ).toFixed(2)
    )
  );

  // Live quarterly feed & momentum heuristic when not explicitly overridden:
  const heuristicQuarterlyGrowthPct = (() => {
    if (stock.isHscFlagged) return 0;
    const opMargin = stock.operatingMargin || 12;
    const ret30 = stock.return30D || 0;
    const der = stock.debtToEquity || 0.6;
    if (ret30 >= 8.5 && trailingRoePct >= 11 && opMargin >= 14 && der <= 0.9) {
      return Number(Math.min(32.0, 14.0 + ret30 * 0.85).toFixed(1));
    }
    if (trailingRoePct >= 18 && opMargin >= 18 && der <= 0.65) {
      return 12.5;
    }
    return 6.0;
  })();

  const earningsGrowthYoYPct = Number(
    (
      custom?.earningsGrowthYoYPct ??
      stock.earningsGrowthYoYPct ??
      builtIn?.earningsGrowthYoYPct ??
      heuristicQuarterlyGrowthPct
    ).toFixed(1)
  );

  const latestQuarterLabel =
    stock.fundamentalsFiscalPeriod ||
    custom?.latestQuarterLabel ||
    builtIn?.latestQuarterLabel ||
    'Q3-2026 (9M26 Annualized)';

  // Detect Quarter (Q1/Q2/Q3/Q4) and apply (4 / Quarter) annualizer multiplier
  const upperQ = latestQuarterLabel.toUpperCase();
  const detectedQuarter: 1 | 2 | 3 | 4 = upperQ.includes('Q1') || upperQ.includes('3M')
    ? 1
    : upperQ.includes('Q2') || upperQ.includes('6M') || upperQ.includes('1H')
    ? 2
    : upperQ.includes('Q4') || upperQ.includes('FY') || upperQ.includes('TTM')
    ? 4
    : 3;
  const annualizationFactor = Number((4 / detectedQuarter).toFixed(4));

  // Proportionally annualize the latest quarter YTD earnings into Forward ROE (Q3 * 4/3, Q2 * 4/2, Q1 * 4/1)
  const ytdRunRateRoe =
    (trailingRoePct * (detectedQuarter / 4)) *
    (earningsGrowthYoYPct > 0
      ? 1 + Math.min(0.48, (earningsGrowthYoYPct / 100) * 0.78)
      : 1);
  const derivedForwardRoeFromAnnualizer = Number(
    Math.min(38.0, ytdRunRateRoe * annualizationFactor).toFixed(2)
  );

  const forwardAnnualizedRoePct = Math.max(
    0.5,
    Number(
      (
        overrideComputedRoePct ??
        custom?.forwardAnnualizedRoePct ??
        (hasRealOrOverriddenFundamentals ? trailingRoePct : undefined) ??
        builtIn?.latestQuarterAnnualizedRoePct ??
        stock.forwardAnnualizedRoePct ??
        derivedForwardRoeFromAnnualizer
      ).toFixed(2)
    )
  );

  // Resolve Share Buyback, Official IDX Shares Outstanding & Live Market Cap (IDR)
  // FIX 1.2: Eliminate Ghost Buyback when data originates from LIVE_REALTIME_WORKER (LIVE_YAHOO_API) or FUNDAMENTALS_JSON
  // unless the user explicitly inputs a buyback override in the Calibration Modal (custom?.hasActiveBuyback).
  const isLiveOrSnapshotSource =
    stock.fundamentalsSource === 'LIVE_YAHOO_API' ||
    stock.fundamentalsSource === 'FUNDAMENTALS_JSON';
  const hasExplicitUserBuybackOverride =
    custom?.hasActiveBuyback !== undefined ||
    (typeof custom?.buybackNominalBillionIdr === 'number' && custom.buybackNominalBillionIdr > 0);

  const hasActiveBuyback = Boolean(
    hasExplicitUserBuybackOverride
      ? (custom?.hasActiveBuyback ?? true)
      : isLiveOrSnapshotSource
      ? false
      : builtIn?.hasActiveBuyback ?? stock.hasActiveBuyback ?? false
  );

  const buybackNominalBillionIdr = hasActiveBuyback
    ? Math.max(
        0,
        Number(
          hasExplicitUserBuybackOverride
            ? custom?.buybackNominalBillionIdr ?? 0
            : builtIn?.buybackNominalBillionIdr ??
              (stock.buybackNominalIdr ? stock.buybackNominalIdr / 1_000_000_000 : 0)
        )
      )
    : 0;
  const buybackNominalIdr = Math.round(buybackNominalBillionIdr * 1_000_000_000);

  // Resolve Official IDX Shares Outstanding first, then compute Market Cap = Shares × Live Spot Price
  const officialIdxShares = resolveOfficialIdxSharesOutstanding(clean, splitRatioDivisor);
  const fallbackAdtvMarketCapIdr = Math.max(
    1_500_000_000_000,
    Math.round(adjustedAdtv20dIdr * 185)
  );
  const builtInImpliedShares = builtIn
    ? Math.round(
        (builtIn.liveMarketCapTrillionIdr * 1_000_000_000_000) /
          Math.max(50, builtIn.baselineRefPriceIdr / splitRatioDivisor)
      )
    : undefined;

  const sharesOutstanding =
    userFundOverride?.sharesOutstanding && userFundOverride.sharesOutstanding > 0
      ? Math.round(userFundOverride.sharesOutstanding)
      : custom?.sharesOutstanding && custom.sharesOutstanding > 0
      ? Math.round(custom.sharesOutstanding)
      : hasRealOrOverriddenFundamentals && stock.sharesOutstanding && stock.sharesOutstanding > 0
      ? Math.round(stock.sharesOutstanding)
      : officialIdxShares && officialIdxShares > 0
      ? officialIdxShares
      : stock.sharesOutstanding && stock.sharesOutstanding > 0
      ? Math.round(stock.sharesOutstanding)
      : builtInImpliedShares && builtInImpliedShares > 0
      ? builtInImpliedShares
      : custom?.liveMarketCapTrillionIdr && custom.liveMarketCapTrillionIdr > 0
      ? Math.max(
          10_000_000,
          Math.round((custom.liveMarketCapTrillionIdr * 1_000_000_000_000) / Math.max(1, spotPrice))
        )
      : Math.max(100_000_000, Math.round(fallbackAdtvMarketCapIdr / Math.max(1, spotPrice)));

  const liveMarketCapIdr =
    custom?.liveMarketCapTrillionIdr && custom.liveMarketCapTrillionIdr > 0 && !userFundOverride?.sharesOutstanding
      ? Math.max(10_000_000_000, Math.round(custom.liveMarketCapTrillionIdr * 1_000_000_000_000))
      : Math.max(10_000_000_000, Math.round(sharesOutstanding * spotPrice));

  // Dynamic Buyback Yield = (Nominal Buyback / Live Market Cap) * 100 (Full pass-through to TSY)
  const dynamicBuybackYieldPct =
    hasActiveBuyback && buybackNominalIdr > 0 && liveMarketCapIdr > 0
      ? Number(Math.min(14.5, (buybackNominalIdr / liveMarketCapIdr) * 100).toFixed(2))
      : 0;

  const hasActiveAcquisition = Boolean(custom?.hasActiveAcquisition);

  // Dual-Confirmation check for operational earnings surge (NI YoY >= 15% & OP YoY >= 10%)
  const estimatedOpProfitYoYPct =
    stock.operatingProfitGrowthYoYPct ??
    Number(
      (stock.operatingMargin >= 12 ? earningsGrowthYoYPct * 0.85 : earningsGrowthYoYPct * 0.45).toFixed(1)
    );
  const isDualConfirmedEarningsCatalyst =
    earningsGrowthYoYPct >= 15.0 && estimatedOpProfitYoYPct >= 10.0;

  // Explicit Catalyst Override Flag (triggered by buyback, Dual-Confirmed earnings surge, split/reverse-split, or acquisition)
  const hasActiveCatalyst =
    !stock.isHscFlagged &&
    (hasActiveBuyback ||
      isDualConfirmedEarningsCatalyst ||
      hasActiveAcquisition ||
      Math.abs(splitRatioDivisor - 1) > 1e-4);

  const isCatalystActive = hasActiveCatalyst;

  // Valuation Boost Multiplier capped strictly at +15% (1.15x) per user architecture specification
  const rawBuybackBoostPct = hasActiveBuyback ? Math.min(8.5, Math.max(2.0, dynamicBuybackYieldPct * 1.45)) : 0;
  const rawEarningsMomentumBoostPct = isDualConfirmedEarningsCatalyst
    ? earningsGrowthYoYPct > 20.0
      ? Math.min(9.5, (earningsGrowthYoYPct - 15.0) * 0.32)
      : Math.min(3.5, (earningsGrowthYoYPct - 10.0) * 0.2)
    : 0;

  const catalystValuationBoostPct = stock.isHscFlagged
    ? 0
    : Number(Math.min(15.0, rawBuybackBoostPct + rawEarningsMomentumBoostPct).toFixed(2));
  const catalystValuationMultiplier = Number((1 + catalystValuationBoostPct / 100).toFixed(4));

  // Build concise badge & narrative strictly on TTM Default Basis (no linear annualizer leakage)
  const badgeParts: string[] = [];
  if (hasActiveBuyback) {
    badgeParts.push(
      dynamicBuybackYieldPct > 0
        ? `BUYBACK +${dynamicBuybackYieldPct.toFixed(2)}%`
        : 'BUYBACK AKTIF'
    );
  }
  if (isDualConfirmedEarningsCatalyst) {
    badgeParts.push(
      `LABA TTM +${earningsGrowthYoYPct.toFixed(1)}% YoY (EBIT +${estimatedOpProfitYoYPct.toFixed(1)}%)`
    );
  }
  if (splitRatioDivisor > 1) {
    badgeParts.push(`SPLIT 1:${splitRatioDivisor}`);
  } else if (splitRatioDivisor < 1) {
    badgeParts.push(`REV SPLIT ${Math.round(1 / splitRatioDivisor)}:1`);
  }
  if (hasActiveAcquisition) {
    badgeParts.push('AKUISISI STRATEGIS');
  }

  const catalystBadgeLabel = isCatalystActive
    ? `CATALYST ACTIVE · ${badgeParts.join(' · ')}`
    : undefined;

  const catalystNarrative =
    custom?.catalystNote ||
    builtIn?.catalystSummary ||
    (isCatalystActive
      ? `Terdeteksi katalis aktif terkonfirmasi (${badgeParts.join(', ')}) dengan ROE TTM ${trailingRoePct.toFixed(1)}% (Basis TTM_DEFAULT terdekumulasi tanpa penyetahunan linier).`
      : `Kinerja fundamental berjalan stabil pada Basis TTM_DEFAULT dengan ROE TTM ${trailingRoePct.toFixed(1)}% (Laba Bersih YoY ${earningsGrowthYoYPct >= 0 ? '+' : ''}${earningsGrowthYoYPct.toFixed(1)}%).`);

  return {
    ticker: clean,
    splitRatioDivisor,
    adjustedAnchorPriceIdr,
    adjustedAdtv20dIdr,
    hasActiveBuyback,
    buybackNominalIdr,
    sharesOutstanding,
    liveMarketCapIdr,
    dynamicBuybackYieldPct,
    trailingRoePct,
    forwardAnnualizedRoePct,
    earningsGrowthYoYPct,
    latestQuarterLabel,
    detectedQuarter,
    annualizationFactor,
    catalystValuationBoostPct,
    catalystValuationMultiplier,
    isCatalystActive,
    hasActiveCatalyst,
    catalystBadgeLabel,
    catalystNarrative,
    isManualOverride: Boolean(custom)
  };
}

/**
 * 3. TYPE-SAFE ENSEMBLE VALUATION AGGREGATOR (.reduce() Enforcement)
 * Supports dynamic weights from DynamicEnsembleWeighter while guaranteeing that the printed
 * Primary Ensemble Fair Value matches the exact mathematical weighted average on the UI card.
 */
export function computeTypeSafeEnsembleFairValue(
  legs: readonly [EnsembleValuationLeg, EnsembleValuationLeg, EnsembleValuationLeg],
  hscDiscountMultiplier: number = 1.0,
  tickRounder: (rawPrice: number) => number,
  ensembleAntiJunkMultiplier: number = 1.0
): {
  rawWeightedSumIdr: number;
  intrinsicValueIdr: number;
  ensembleFormulaAudit: string;
} {
  const totalWeight = legs.reduce((acc, leg) => acc + leg.weight, 0);
  const normalizedWeightFactor = totalWeight > 0 ? 1 / totalWeight : 1;

  const rawWeightedSumIdr = legs.reduce(
    (sum, leg) => sum + leg.priceIdr * (leg.weight * normalizedWeightFactor),
    0
  );

  const discountedRaw =
    rawWeightedSumIdr * hscDiscountMultiplier * ensembleAntiJunkMultiplier;
  const intrinsicValueIdr = tickRounder(Math.max(50, discountedRaw));

  const formulaParts = legs
    .filter((leg) => leg.weight * normalizedWeightFactor > 0.001)
    .map(
      (leg) =>
        `(Rp ${leg.priceIdr.toLocaleString('id-ID')} × ${Math.round(
          leg.weight * normalizedWeightFactor * 100
        )}%)`
    );
  const ensembleFormulaAudit = `${formulaParts.join(' + ')}${
    ensembleAntiJunkMultiplier < 0.999
      ? ` × QMJ ${ensembleAntiJunkMultiplier.toFixed(2)}`
      : ''
  }${
    hscDiscountMultiplier < 0.999 ? ` × HSC ${hscDiscountMultiplier.toFixed(2)}` : ''
  } = Rp ${intrinsicValueIdr.toLocaleString('id-ID')}`;

  return {
    rawWeightedSumIdr: Math.round(rawWeightedSumIdr),
    intrinsicValueIdr,
    ensembleFormulaAudit
  };
}

/**
 * 4. STATE-BASED RECOMMENDATION ENGINE (Dynamic Decision Tree, Dynamic MoS & Catalyst Override)
 * Implements:
 * - Dynamic Margin of Safety (MoS) Tolerance: Links required MoS to Excess Return (Forward ROE - Cost of Equity).
 *   If Excess Return > 10%, compresses required MoS threshold to 0% - 10% (premium compounder at Fair Value = rational accumulate).
 * - Catalyst Override Flag (`hasActiveCatalyst`): Triggered by buyback program, earnings surge > 20%, or acquisition.
 *   If true, reactively switches status from "Tunggu Koreksi Wajar" to "Buy on Strength" and shifts accumulation zone to spot price floor.
 * - Pure Cyclical PBV Z-Score Anchor: Triggers "STRONG BUY" if Current PBV Z-Score <= -1.5σ.
 */
export function evaluateDynamicDecisionTree(params: {
  isHscFlagged: boolean;
  isDefensiveDiscountAnomaly: boolean;
  isCyclicalStrongBuyZScore?: boolean;
  pbvZScore?: number;
  hasActiveBuyback: boolean;
  hasActiveCatalyst?: boolean;
  earningsGrowthYoYPct: number;
  forwardRoePct?: number;
  costOfEquityPct?: number;
  marginOfSafetyPct: number;
  dmuCompositeScore: number;
  lastPriceIdr: number;
  intrinsicValueIdr: number;
  marketRegime?: MarketRegimeStatus;
  isHighConvictionActionEligible?: boolean;
  isSeedCapped?: boolean;
  finalConvictionGrade?: string;
  tickRounder: (rawPrice: number) => number;
}): {
  decisionState: RecommendationDecisionState;
  decisionActionLabel: string;
  recommendedActionText: string;
  idealBuyLowIdr: number;
  idealBuyHighIdr: number;
  formattedAccumulationZone: string;
  dynamicRequiredMosPct: number;
  excessReturnSpreadPct: number;
} {
  const {
    isHscFlagged,
    isDefensiveDiscountAnomaly,
    isCyclicalStrongBuyZScore = false,
    pbvZScore,
    hasActiveBuyback,
    hasActiveCatalyst: explicitCatalystFlag,
    earningsGrowthYoYPct,
    forwardRoePct = 15.0,
    costOfEquityPct = 11.5,
    marginOfSafetyPct,
    dmuCompositeScore,
    lastPriceIdr,
    intrinsicValueIdr,
    marketRegime = 'TENANG',
    isHighConvictionActionEligible = true,
    isSeedCapped = false,
    finalConvictionGrade,
    tickRounder
  } = params;

  // Dynamic Margin of Safety (MoS) Compression linked to Excess Return (Forward ROE - Cost of Equity)
  // Guardrail: Lock floor at >= 25.0% whenever IHSG market regime is VOLATIL
  const excessReturnSpreadPct = Number((forwardRoePct - costOfEquityPct).toFixed(2));
  const rawDynamicMosPct =
    excessReturnSpreadPct > 10.0
      ? Math.max(0.0, Math.min(10.0, 10.0 - (excessReturnSpreadPct - 10.0) * 0.8))
      : excessReturnSpreadPct >= 5.0
      ? 12.0
      : 20.0;
  const dynamicRequiredMosPct = Number(
    (marketRegime === 'VOLATIL' ? Math.max(25.0, rawDynamicMosPct) : rawDynamicMosPct).toFixed(1)
  );

  if (isHscFlagged) {
    return {
      decisionState: 'AVOID_HSC_BLOCK',
      decisionActionLabel: 'AVOID // HSC RISK BLOCK',
      recommendedActionText:
        'Hindari pembelian baru (Block Buy) & alihkan modal ke saham berfundamental sehat.',
      idealBuyLowIdr: 0,
      idealBuyHighIdr: 0,
      formattedAccumulationZone: 'Tidak direkomendasikan (Blokir HSC — risiko spekulasi tinggi)',
      dynamicRequiredMosPct,
      excessReturnSpreadPct
    };
  }

  const intrinsicAccumulationCeiling = tickRounder(
    intrinsicValueIdr * (1 - dynamicRequiredMosPct / 100)
  );
  const pullbackLow = tickRounder(intrinsicValueIdr * 0.82);
  const pullbackHigh = Math.max(pullbackLow, intrinsicAccumulationCeiling);

  // MODUL 2 ACTION LOCK GUARDRAIL:
  // If sanityStatus === 'SEED_WARN' or convictionCappedByLineage === true (C · SEED CAPPED),
  // strictly lock action to WATCHLIST / HOLD (C · SEED CAPPED) and forbid Strong Buy / Buy on Strength.
  if (isSeedCapped || finalConvictionGrade === 'C (SEED CAPPED)') {
    return {
      decisionState: 'WAIT_FOR_PULLBACK',
      decisionActionLabel: 'SPECULATIVE WATCHLIST / TUNGGU AUDIT DATA',
      recommendedActionText: `SPECULATIVE WATCHLIST / TUNGGU AUDIT DATA (C · SEED CAPPED — SANITY: SEED_WARN) — Aksi agresif dikunci hingga laporan keuangan TTM terverifikasi live atau dikalibrasi manual; akumulasi bertahap hanya jika harga terkoreksi memenuhi syarat MoS Dinamis Min. ${dynamicRequiredMosPct.toFixed(1)}%.`,
      idealBuyLowIdr: pullbackLow,
      idealBuyHighIdr: pullbackHigh,
      formattedAccumulationZone: `Rentang Akumulasi Konservatif (Syarat MoS Min. ${dynamicRequiredMosPct.toFixed(1)}%): Rp ${pullbackLow.toLocaleString('id-ID')} - Rp ${pullbackHigh.toLocaleString('id-ID')} | Nilai Wajar Ensemble (TTM): Rp ${intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${lastPriceIdr.toLocaleString('id-ID')}): WATCHLIST / SEED CAPPED (MoS ${marginOfSafetyPct >= 0 ? '+' : ''}${marginOfSafetyPct.toFixed(1)}%, Syarat MoS Min. ${dynamicRequiredMosPct.toFixed(1)}%)`,
      dynamicRequiredMosPct,
      excessReturnSpreadPct
    };
  }

  const hasActiveCatalyst =
    isHighConvictionActionEligible &&
    (explicitCatalystFlag !== undefined
      ? explicitCatalystFlag
      : hasActiveBuyback || earningsGrowthYoYPct > 20.0);

  // Branch 1: Pure Cyclical PBV Z-Score <= -1.5σ Strong Buy Anchor (ONLY when isHighConvictionActionEligible === true)
  if (isHighConvictionActionEligible && isCyclicalStrongBuyZScore) {
    const low = tickRounder(lastPriceIdr * 0.97);
    const high = tickRounder(Math.max(lastPriceIdr * 1.03, Math.min(intrinsicValueIdr * 0.90, lastPriceIdr * 1.08)));
    return {
      decisionState: 'STRONG_BUY_CYCLICAL_ZSCORE',
      decisionActionLabel: 'LAYAK AKUMULASI BERTAHAP (CORE CONVICTION)',
      recommendedActionText: `LAYAK AKUMULASI BERTAHAP (CORE CONVICTION) — Siklikal di dasar siklus valuasi buku (PBV Z-Score ${pbvZScore?.toFixed(2) ?? '-1.50'} SD Maks. -1.5 SD dari rata-rata 10 tahun) dengan neraca sehat (DER Maks. 1.0x).`,
      idealBuyLowIdr: Math.min(low, high),
      idealBuyHighIdr: Math.max(low, high),
      formattedAccumulationZone: `Rentang Beli Siklikal (Z Maks. -1.5 SD): Rp ${Math.min(low, high).toLocaleString('id-ID')} - Rp ${Math.max(low, high).toLocaleString('id-ID')} | Nilai Wajar Siklus: Rp ${intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${lastPriceIdr.toLocaleString('id-ID')}): LAYAK AKUMULASI BERTAHAP (MoS ${marginOfSafetyPct >= 0 ? '+' : ''}${marginOfSafetyPct.toFixed(1)}%)`,
      dynamicRequiredMosPct,
      excessReturnSpreadPct
    };
  }

  // Branch 2: Defensive Discount Anomaly (Beta < 0.5 & Skor Value > 9.0) (ONLY when isHighConvictionActionEligible === true)
  if (isHighConvictionActionEligible && isDefensiveDiscountAnomaly) {
    const ceiling = tickRounder(Math.max(lastPriceIdr, intrinsicValueIdr * 0.88));
    const low = tickRounder(lastPriceIdr * 0.96);
    const high = Math.max(low, ceiling);
    return {
      decisionState: 'STRONG_BUY_DEFENSIVE_ANOMALY',
      decisionActionLabel: 'STRONG BUY // DEFENSIVE DISCOUNT ANOMALY',
      recommendedActionText:
        'Anomali Aset Defensif Terdiskon — Akumulasi Bertahap (Buy on Weakness 2–3 Tahap) pada harga spot yang sudah berada di zona diskon dalam.',
      idealBuyLowIdr: low,
      idealBuyHighIdr: high,
      formattedAccumulationZone: `Rentang Beli Ideal: Rp ${low.toLocaleString('id-ID')} – Rp ${high.toLocaleString('id-ID')} | Nilai Wajar: Rp ${intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${lastPriceIdr.toLocaleString('id-ID')}): ANOMALI DISKON DEFENSIF (MoS ${marginOfSafetyPct >= 0 ? '+' : ''}${marginOfSafetyPct.toFixed(1)}%)`,
      dynamicRequiredMosPct,
      excessReturnSpreadPct
    };
  }

  // Branch 3: Active Catalyst Intervention (ONLY when isHighConvictionActionEligible === true: PASS + !seed + Score >= 75 Grade A/A+)
  if (isHighConvictionActionEligible && hasActiveCatalyst && marginOfSafetyPct >= -10.0) {
    const spotFloorLow = tickRounder(lastPriceIdr);
    const spotFloorHigh = tickRounder(
      Math.max(lastPriceIdr * 1.03, Math.min(intrinsicValueIdr, lastPriceIdr * 1.06))
    );
    const catalystReasons: string[] = [];
    if (hasActiveBuyback) catalystReasons.push('Price Floor Buyback Aktif');
    if (earningsGrowthYoYPct > 20.0) {
      catalystReasons.push(`Lonjakan Laba Kuartal +${earningsGrowthYoYPct.toFixed(1)}% YoY`);
    }
    if (catalystReasons.length === 0) {
      catalystReasons.push('Katalis Korporasi Aktif');
    }

    return {
      decisionState: 'BUY_ON_STRENGTH_CATALYST',
      decisionActionLabel: 'Buy on Strength',
      recommendedActionText: `Buy on Strength (${catalystReasons.join(' + ')}) — Status "Tunggu Koreksi Wajar" diubah reaktif menjadi "Buy on Strength" dengan zona akumulasi digeser ke harga pasar spot saat ini (Rp ${spotFloorLow.toLocaleString('id-ID')}) sebagai price floor.`,
      idealBuyLowIdr: Math.min(spotFloorLow, spotFloorHigh),
      idealBuyHighIdr: Math.max(spotFloorLow, spotFloorHigh),
      formattedAccumulationZone: `Zona Akumulasi Price Floor Spot (Buy on Strength): Rp ${Math.min(spotFloorLow, spotFloorHigh).toLocaleString('id-ID')} – Rp ${Math.max(spotFloorLow, spotFloorHigh).toLocaleString('id-ID')} | Nilai Wajar Ensemble (TTM): Rp ${intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${lastPriceIdr.toLocaleString('id-ID')}): BUY ON STRENGTH (${catalystReasons.join(' · ')}, MoS ${marginOfSafetyPct >= 0 ? '+' : ''}${marginOfSafetyPct.toFixed(1)}%)`,
      dynamicRequiredMosPct,
      excessReturnSpreadPct
    };
  }

  // Branch 4: Dynamic Margin of Safety (MoS) Compression for High Excess Return (>10% Excess Return -> 0%-10% MoS threshold)
  const isUndercutDeepDiscount = lastPriceIdr <= intrinsicAccumulationCeiling;

  if (
    isHighConvictionActionEligible &&
    excessReturnSpreadPct > 10.0 &&
    marginOfSafetyPct >= dynamicRequiredMosPct &&
    dmuCompositeScore >= 6.2
  ) {
    const low = tickRounder(lastPriceIdr * 0.98);
    const high = tickRounder(Math.max(lastPriceIdr * 1.02, intrinsicValueIdr));
    return {
      decisionState: 'ACCUMULATE_QUALITY_FAIR_VALUE',
      decisionActionLabel:
        finalConvictionGrade === 'A- (SOLID VALUE)' || finalConvictionGrade === 'A (SOLID VALUE)'
          ? 'AKUMULASI SELEKTIF DI ZONA DISKON'
          : 'LAYAK AKUMULASI BERTAHAP (CORE CONVICTION)',
      recommendedActionText: `Akumulasi Rasional di Nilai Wajar — Excess Return tinggi (+${excessReturnSpreadPct.toFixed(1)}% di atas Ke ${costOfEquityPct.toFixed(2)}%) mengompresi syarat batas aman MoS menjadi ${dynamicRequiredMosPct.toFixed(1)}%. Emiten compounder premium pada Fair Value adalah sinyal akumulasi rasional.`,
      idealBuyLowIdr: Math.min(low, high),
      idealBuyHighIdr: Math.max(low, high),
      formattedAccumulationZone: `Rentang Akumulasi Fair Value (Syarat MoS Min. ${dynamicRequiredMosPct.toFixed(1)}%): Rp ${Math.min(low, high).toLocaleString('id-ID')} - Rp ${Math.max(low, high).toLocaleString('id-ID')} | Nilai Wajar: Rp ${intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${lastPriceIdr.toLocaleString('id-ID')}): AKUMULASI RASIONAL (Excess Return +${excessReturnSpreadPct.toFixed(1)}%, MoS ${marginOfSafetyPct >= 0 ? '+' : ''}${marginOfSafetyPct.toFixed(1)}%)`,
      dynamicRequiredMosPct,
      excessReturnSpreadPct
    };
  }

  // Branch 5: Standard Deep Margin of Safety Accumulation
  if (marginOfSafetyPct >= Math.max(12.0, dynamicRequiredMosPct) && dmuCompositeScore >= 6.5) {
    const low = isUndercutDeepDiscount
      ? tickRounder(lastPriceIdr * 0.96)
      : tickRounder(Math.min(lastPriceIdr * 0.98, intrinsicAccumulationCeiling * 0.96));
    const high = isUndercutDeepDiscount
      ? Math.max(low, intrinsicAccumulationCeiling)
      : Math.max(low, tickRounder(Math.min(lastPriceIdr, intrinsicAccumulationCeiling)));

    const isSpeculativeGrade = finalConvictionGrade === 'C (SPECULATIVE)';
    const isWatchlistGrade =
      !isHighConvictionActionEligible ||
      finalConvictionGrade === 'B (WATCHLIST / HOLD)' ||
      isSpeculativeGrade;

    return {
      decisionState: isWatchlistGrade ? 'WAIT_FOR_PULLBACK' : 'ACCUMULATE_DEEP_MOS',
      decisionActionLabel: isSpeculativeGrade
        ? 'SPECULATIVE WATCHLIST / TUNGGU AUDIT DATA'
        : isWatchlistGrade
        ? 'WATCHLIST / HOLD — TUNGGU KONFIRMASI SKOR ATAU DISKON LEBIH DALAM'
        : finalConvictionGrade === 'A- (SOLID VALUE)' || finalConvictionGrade === 'A (SOLID VALUE)'
        ? 'AKUMULASI SELEKTIF DI ZONA DISKON'
        : 'LAYAK AKUMULASI BERTAHAP (CORE CONVICTION)',
      recommendedActionText: isSpeculativeGrade
        ? `SPECULATIVE WATCHLIST / TUNGGU AUDIT DATA — Skor konviksi masih di bawah ambang institusional 65/100; tahan alokasi modal baru.`
        : isWatchlistGrade
        ? `WATCHLIST / HOLD — TUNGGU KONFIRMASI SKOR ATAU DISKON LEBIH DALAM — Harga spot berada ${marginOfSafetyPct.toFixed(1)}% di bawah Nilai Wajar (melampaui syarat MoS dinamis ${dynamicRequiredMosPct.toFixed(1)}%), namun peringkat ${finalConvictionGrade || 'B (WATCHLIST / HOLD)'} menahan sinyal akumulasi penuh.`
        : finalConvictionGrade === 'A- (SOLID VALUE)' || finalConvictionGrade === 'A (SOLID VALUE)'
        ? 'AKUMULASI SELEKTIF DI ZONA DISKON — Akumulasi bertahap (Tranche 1: 60% / Tranche 2: 40%) di area diskon nilai wajar.'
        : 'LAYAK AKUMULASI BERTAHAP (CORE CONVICTION) — Akumulasi bertahap (Tranche 1: 60% / Tranche 2: 40%) di area diskon nilai wajar.',
      idealBuyLowIdr: low,
      idealBuyHighIdr: high,
      formattedAccumulationZone: `Rentang Beli Ideal: Rp ${low.toLocaleString('id-ID')} - Rp ${high.toLocaleString('id-ID')} | Nilai Wajar: Rp ${intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${lastPriceIdr.toLocaleString('id-ID')}): ${isWatchlistGrade ? 'WATCHLIST / HOLD' : 'TERDISKON / MURAH'} (Harga saat ini ${marginOfSafetyPct.toFixed(1)}% di bawah Nilai Wajar, syarat MoS Min. ${dynamicRequiredMosPct.toFixed(1)}%)`,
      dynamicRequiredMosPct,
      excessReturnSpreadPct
    };
  }

  // Branch 6: Wait for Pullback / Hold Watchlist (No Active High-Conviction Catalyst or MoS below dynamic threshold)
  const isSpeculativeFallback = finalConvictionGrade === 'C (SPECULATIVE)';
  return {
    decisionState: 'WAIT_FOR_PULLBACK',
    decisionActionLabel: isSpeculativeFallback
      ? 'SPECULATIVE WATCHLIST / TUNGGU AUDIT DATA'
      : 'WATCHLIST / HOLD — TUNGGU KONFIRMASI SKOR ATAU DISKON LEBIH DALAM',
    recommendedActionText: isSpeculativeFallback
      ? 'SPECULATIVE WATCHLIST / TUNGGU AUDIT DATA — Tahan alokasi modal baru hingga kualitas fundamental dan diskon valuasi terkonfirmasi.'
      : 'WATCHLIST / HOLD — TUNGGU KONFIRMASI SKOR ATAU DISKON LEBIH DALAM agar mendapatkan ruang Margin of Safety yang memenuhi syarat MoS Dinamis.',
    idealBuyLowIdr: pullbackLow,
    idealBuyHighIdr: pullbackHigh,
    formattedAccumulationZone:
      marginOfSafetyPct >= 0
        ? `Rentang Beli Ideal: Rp ${pullbackLow.toLocaleString('id-ID')} - Rp ${pullbackHigh.toLocaleString('id-ID')} | Nilai Wajar: Rp ${intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${lastPriceIdr.toLocaleString('id-ID')}): WATCHLIST / HOLD (MoS +${marginOfSafetyPct.toFixed(1)}% < syarat MoS dinamis Min. ${dynamicRequiredMosPct.toFixed(1)}%, tunggu koreksi ke rentang akumulasi)`
        : `Rentang Beli Ideal: Rp ${pullbackLow.toLocaleString('id-ID')} - Rp ${pullbackHigh.toLocaleString('id-ID')} | Nilai Wajar: Rp ${intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${lastPriceIdr.toLocaleString('id-ID')}): MAHAL / PREMIUM (Harga saat ini ${Math.abs(marginOfSafetyPct).toFixed(1)}% di atas Nilai Wajar, tunggu koreksi ke rentang beli ideal)`,
    dynamicRequiredMosPct,
    excessReturnSpreadPct
  };
}
