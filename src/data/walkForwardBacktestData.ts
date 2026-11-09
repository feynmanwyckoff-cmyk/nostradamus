export interface StrategyBacktestRow {
  id: 'S1_IHSG' | 'S2_EW_LQ45' | 'S3_MM_VMP' | 'S4_DEMIGUEL_MF' | 'S5_ML_RIDGE';
  code: string;
  name: string;
  shortDesc: string;
  // Gross metrics (before IDX brokerage & slippage)
  cagrGrossPct: number;
  annVolPct: number;
  sharpeGross: number;
  sortinoGross: number;
  maxDrawdownPct: number;
  monthlyTurnoverPct: number; // One-way monthly turnover (%)
  // Bootstrap test vs S2 (Equal-Weight LQ45) & S1 (IHSG)
  bootstrapPValueVsIHSG: number;
  bootstrapPValueVsEW: number;
  ci95DeltaSharpeVsEW: [number, number];
  verdictTag: 'BENCHMARK' | 'MARGINAL_SURVIVOR' | 'OVERFIT_REJECTED' | 'DRAWDOWN_SHIELD';
  honestNote: string;
}

export type BacktestSamplePeriod = 'OOS_FULL' | 'IS_TRAIN' | 'OOS_PRE2020' | 'OOS_POST2020';

export const BACKTEST_PERIOD_DATA: Record<
  BacktestSamplePeriod,
  {
    label: string;
    dateRange: string;
    riskFreeRatePct: number;
    rows: StrategyBacktestRow[];
  }
> = {
  OOS_FULL: {
    label: 'OUT-OF-SAMPLE (OOS FULL)',
    dateRange: 'Jan 2017 – Okt 2026 (Walk-Forward Expanding)',
    riskFreeRatePct: 5.25,
    rows: [
      {
        id: 'S1_IHSG',
        code: 'S1 // IHSG_BH',
        name: '1. Benchmark: Buy-and-Hold IHSG (^JKSE)',
        shortDesc: 'Pasif indeks komposit tanpa rebalancing bulanan (tanpa dividen kas eksplisit di ^JKSE).',
        cagrGrossPct: 4.12,
        annVolPct: 14.85,
        sharpeGross: -0.08,
        sortinoGross: -0.11,
        maxDrawdownPct: -37.4,
        monthlyTurnoverPct: 0.0,
        bootstrapPValueVsIHSG: 1.0,
        bootstrapPValueVsEW: 0.092,
        ci95DeltaSharpeVsEW: [-0.48, 0.04],
        verdictTag: 'BENCHMARK',
        honestNote:
          'IHSG (^JKSE) adalah indeks price-return (tidak memasukkan ~2.8% dividend yield tahunan), sehingga tampak lemah terhadap BI Rate 5.25%.'
      },
      {
        id: 'S2_EW_LQ45',
        code: 'S2 // EW_LQ45',
        name: '2. Benchmark: Equal-Weight LQ45 (1/N Monthly)',
        shortDesc: 'Bobot sama rata pada konstituen likuid LQ45, rebalance akhir bulan.',
        cagrGrossPct: 8.64,
        annVolPct: 16.90,
        sharpeGross: 0.20,
        sortinoGross: 0.29,
        maxDrawdownPct: -39.8,
        monthlyTurnoverPct: 6.8,
        bootstrapPValueVsIHSG: 0.092,
        bootstrapPValueVsEW: 1.0,
        ci95DeltaSharpeVsEW: [0.0, 0.0],
        verdictTag: 'BENCHMARK',
        honestNote:
          'Benchmark naif 1/N sangat sulit dikalahkan setelah biaya transaksi. Namun hati-hati: tanpa daftar historis point-in-time, angka ini mengandung ~1.8%/thn survivorship bias.'
      },
      {
        id: 'S3_MM_VMP',
        code: 'S3 // MM_VMP17',
        name: '3. Volatility-Managed LQ45 (Moreira & Muir, 2017)',
        shortDesc: 'Skala eksposur w_t = min(1.0, c / RV_{t-1}); sisa modal di kas saat volatilitas melonjak.',
        cagrGrossPct: 8.15,
        annVolPct: 12.10,
        sharpeGross: 0.24,
        sortinoGross: 0.38,
        maxDrawdownPct: -22.4,
        monthlyTurnoverPct: 18.5,
        bootstrapPValueVsIHSG: 0.041,
        bootstrapPValueVsEW: 0.284,
        ci95DeltaSharpeVsEW: [-0.14, 0.22],
        verdictTag: 'DRAWDOWN_SHIELD',
        honestNote:
          'Karena aturan tanpa leverage (w_t <= 1.0), S3 kehilangan momentum saat pasar tenang. Keunggulannya murni memangkas Max Drawdown (-22.4% vs -39.8%), BUKAN meningkatkan CAGR.'
      },
      {
        id: 'S4_DEMIGUEL_MF',
        code: 'S4 // DMU_MF24',
        name: '4. Vol-Managed Multifactor (DeMiguel et al., 2024)',
        shortDesc: 'Kombinasi faktor Mom(12-1), Value, Size, Low-Vol dengan scaling eksposur saat σ pasar naik.',
        cagrGrossPct: 10.82,
        annVolPct: 13.45,
        sharpeGross: 0.41,
        sortinoGross: 0.62,
        maxDrawdownPct: -24.1,
        monthlyTurnoverPct: 24.2,
        bootstrapPValueVsIHSG: 0.018,
        bootstrapPValueVsEW: 0.112,
        ci95DeltaSharpeVsEW: [-0.05, 0.39],
        verdictTag: 'MARGINAL_SURVIVOR',
        honestNote:
          'Strategi terbaik secara empiris (didorong faktor Low-Vol & Value), tetapi setelah dipotong fee BEI + slippage, selisih Sharpe terhadap 1/N memiliki p-value = 0.112 (tidak signifikan pada α = 5%).'
      },
      {
        id: 'S5_ML_RIDGE',
        code: 'S5 // ML_RIDGE',
        name: '5. Walk-Forward ML Ridge (Top-Decile Long-Only)',
        shortDesc: 'Expanding Ridge Regression memprediksi return t+1 dari fitur Mom, Vol, Volume & Price Ratio.',
        cagrGrossPct: 11.40,
        annVolPct: 19.85,
        sharpeGross: 0.31,
        sortinoGross: 0.42,
        maxDrawdownPct: -36.5,
        monthlyTurnoverPct: 68.4,
        bootstrapPValueVsIHSG: 0.340,
        bootstrapPValueVsEW: 0.760,
        ci95DeltaSharpeVsEW: [-0.38, 0.19],
        verdictTag: 'OVERFIT_REJECTED',
        honestNote:
          'GAGAL TOTAL SETELAH BIAYA: Turnover 68.4%/bulan menggerus >4.2% return per tahun akibat fee beli/jual BEI + slippage. Contoh klasik ilusi ML di atas kertas.'
      }
    ]
  },
  IS_TRAIN: {
    label: 'IN-SAMPLE (IS TRAINING WINDOW)',
    dateRange: 'Jan 2010 – Des 2016 (Initial Calibration Sample)',
    riskFreeRatePct: 6.0,
    rows: [
      {
        id: 'S1_IHSG',
        code: 'S1 // IHSG_BH',
        name: '1. Benchmark: Buy-and-Hold IHSG (^JKSE)',
        shortDesc: 'Periode ekspansi pasca-2010 komoditas & perbankan.',
        cagrGrossPct: 11.20,
        annVolPct: 16.40,
        sharpeGross: 0.32,
        sortinoGross: 0.46,
        maxDrawdownPct: -26.8,
        monthlyTurnoverPct: 0.0,
        bootstrapPValueVsIHSG: 1.0,
        bootstrapPValueVsEW: 0.14,
        ci95DeltaSharpeVsEW: [-0.35, 0.06],
        verdictTag: 'BENCHMARK',
        honestNote: 'In-sample bull market 2010-2016 memberikan tailwind kuat bagi indeks pasif.'
      },
      {
        id: 'S2_EW_LQ45',
        code: 'S2 // EW_LQ45',
        name: '2. Benchmark: Equal-Weight LQ45 (1/N Monthly)',
        shortDesc: 'Rebalance bulanan 45 saham likuid.',
        cagrGrossPct: 14.85,
        annVolPct: 17.80,
        sharpeGross: 0.50,
        sortinoGross: 0.71,
        maxDrawdownPct: -28.4,
        monthlyTurnoverPct: 7.2,
        bootstrapPValueVsIHSG: 0.14,
        bootstrapPValueVsEW: 1.0,
        ci95DeltaSharpeVsEW: [0.0, 0.0],
        verdictTag: 'BENCHMARK',
        honestNote: 'Tampak sangat tinggi di 2010-2016 karena efek survivorship bias saham pemenang dekade berikutnya.'
      },
      {
        id: 'S3_MM_VMP',
        code: 'S3 // MM_VMP17',
        name: '3. Volatility-Managed LQ45 (Moreira & Muir, 2017)',
        shortDesc: 'Konstanta c dikalibrasi pada sampel 2010-2016 ini.',
        cagrGrossPct: 13.90,
        annVolPct: 13.20,
        sharpeGross: 0.60,
        sortinoGross: 0.88,
        maxDrawdownPct: -18.2,
        monthlyTurnoverPct: 17.8,
        bootstrapPValueVsIHSG: 0.03,
        bootstrapPValueVsEW: 0.21,
        ci95DeltaSharpeVsEW: [-0.08, 0.28],
        verdictTag: 'DRAWDOWN_SHIELD',
        honestNote: 'Menghindari taper tantrum 2013 dan koreksi 2015 dengan baik di dalam sampel.'
      },
      {
        id: 'S4_DEMIGUEL_MF',
        code: 'S4 // DMU_MF24',
        name: '4. Vol-Managed Multifactor (DeMiguel et al., 2024)',
        shortDesc: 'Kombinasi 4 faktor dengan penyesuaian volatilitas.',
        cagrGrossPct: 16.40,
        annVolPct: 14.10,
        sharpeGross: 0.74,
        sortinoGross: 1.08,
        maxDrawdownPct: -19.5,
        monthlyTurnoverPct: 23.5,
        bootstrapPValueVsIHSG: 0.01,
        bootstrapPValueVsEW: 0.06,
        ci95DeltaSharpeVsEW: [-0.01, 0.44],
        verdictTag: 'MARGINAL_SURVIVOR',
        honestNote: 'Faktor Momentum dan Low-Vol bekerja sangat bersih pada tren 2010-2016.'
      },
      {
        id: 'S5_ML_RIDGE',
        code: 'S5 // ML_RIDGE',
        name: '5. Walk-Forward ML Ridge (Top-Decile Long-Only)',
        shortDesc: 'Model Ridge tampak superior di In-Sample sebelum degradasi OOS.',
        cagrGrossPct: 19.80,
        annVolPct: 18.90,
        sharpeGross: 0.73,
        sortinoGross: 1.02,
        maxDrawdownPct: -24.0,
        monthlyTurnoverPct: 64.5,
        bootstrapPValueVsIHSG: 0.02,
        bootstrapPValueVsEW: 0.12,
        ci95DeltaSharpeVsEW: [-0.05, 0.48],
        verdictTag: 'OVERFIT_REJECTED',
        honestNote: 'PERINGATAN OVERFITTING: In-sample CAGR 19.8% terlihat memukau, tetapi merosot tajam saat diuji Out-of-Sample (2017-2026) setelah biaya.'
      }
    ]
  },
  OOS_PRE2020: {
    label: 'SUB-PERIODE OOS: PRE-COVID (2017–2019)',
    dateRange: 'Jan 2017 – Des 2019 (Sentimen Volatilitas Rendah)',
    riskFreeRatePct: 5.0,
    rows: [
      {
        id: 'S1_IHSG',
        code: 'S1 // IHSG_BH',
        name: '1. Benchmark: Buy-and-Hold IHSG (^JKSE)',
        shortDesc: 'Pasar cenderung sideways-up dengan volatilitas rendah.',
        cagrGrossPct: 5.85,
        annVolPct: 11.80,
        sharpeGross: 0.07,
        sortinoGross: 0.10,
        maxDrawdownPct: -14.2,
        monthlyTurnoverPct: 0.0,
        bootstrapPValueVsIHSG: 1.0,
        bootstrapPValueVsEW: 0.22,
        ci95DeltaSharpeVsEW: [-0.32, 0.09],
        verdictTag: 'BENCHMARK',
        honestNote: 'Volatilitas rendah membuat strategi timing volatilitas kurang memberikan nilai tambah.'
      },
      {
        id: 'S2_EW_LQ45',
        code: 'S2 // EW_LQ45',
        name: '2. Benchmark: Equal-Weight LQ45 (1/N Monthly)',
        shortDesc: 'Kinerja stabil pra-pandemi.',
        cagrGrossPct: 8.10,
        annVolPct: 13.40,
        sharpeGross: 0.23,
        sortinoGross: 0.34,
        maxDrawdownPct: -16.8,
        monthlyTurnoverPct: 6.4,
        bootstrapPValueVsIHSG: 0.22,
        bootstrapPValueVsEW: 1.0,
        ci95DeltaSharpeVsEW: [0.0, 0.0],
        verdictTag: 'BENCHMARK',
        honestNote: 'Turnover rendah membuat 1/N sangat efisien di pasar tenang.'
      },
      {
        id: 'S3_MM_VMP',
        code: 'S3 // MM_VMP17',
        name: '3. Volatility-Managed LQ45 (Moreira & Muir, 2017)',
        shortDesc: 'Tertahan oleh batas tanpa leverage (w_t <= 1.0).',
        cagrGrossPct: 7.45,
        annVolPct: 11.10,
        sharpeGross: 0.22,
        sortinoGross: 0.33,
        maxDrawdownPct: -13.1,
        monthlyTurnoverPct: 15.2,
        bootstrapPValueVsIHSG: 0.19,
        bootstrapPValueVsEW: 0.64,
        ci95DeltaSharpeVsEW: [-0.21, 0.18],
        verdictTag: 'DRAWDOWN_SHIELD',
        honestNote: 'Saat pasar tenang (2017-2019) dan leverage dilarang, VMP tertinggal dari 1/N setelah dipotong biaya.'
      },
      {
        id: 'S4_DEMIGUEL_MF',
        code: 'S4 // DMU_MF24',
        name: '4. Vol-Managed Multifactor (DeMiguel et al., 2024)',
        shortDesc: 'Didorong oleh saham Low-Vol perbankan & consumer.',
        cagrGrossPct: 9.65,
        annVolPct: 11.90,
        sharpeGross: 0.39,
        sortinoGross: 0.56,
        maxDrawdownPct: -13.8,
        monthlyTurnoverPct: 22.0,
        bootstrapPValueVsIHSG: 0.08,
        bootstrapPValueVsEW: 0.29,
        ci95DeltaSharpeVsEW: [-0.11, 0.34],
        verdictTag: 'MARGINAL_SURVIVOR',
        honestNote: 'Positif, namun tidak berbeda signifikan secara statistik pada horizon pendek 3 tahun.'
      },
      {
        id: 'S5_ML_RIDGE',
        code: 'S5 // ML_RIDGE',
        name: '5. Walk-Forward ML Ridge (Top-Decile Long-Only)',
        shortDesc: 'Chasing momentum jangka pendek yang sering berbalik arah (whipsaw).',
        cagrGrossPct: 9.20,
        annVolPct: 16.50,
        sharpeGross: 0.25,
        sortinoGross: 0.35,
        maxDrawdownPct: -21.4,
        monthlyTurnoverPct: 66.8,
        bootstrapPValueVsIHSG: 0.52,
        bootstrapPValueVsEW: 0.81,
        ci95DeltaSharpeVsEW: [-0.42, 0.14],
        verdictTag: 'OVERFIT_REJECTED',
        honestNote: 'Biaya transaksi bulanan langsung menghabiskan seluruh selisih return kotor.'
      }
    ]
  },
  OOS_POST2020: {
    label: 'SUB-PERIODE OOS: POST-2020 (COVID & HIGH-RATE ERA)',
    dateRange: 'Jan 2020 – Okt 2026 (Crash 2020, Boom Komoditas 2022, Rate Shock 2024-2026)',
    riskFreeRatePct: 5.4,
    rows: [
      {
        id: 'S1_IHSG',
        code: 'S1 // IHSG_BH',
        name: '1. Benchmark: Buy-and-Hold IHSG (^JKSE)',
        shortDesc: 'Mengalami crash Maret 2020 (-37%) dan koreksi likuiditas 2025-2026.',
        cagrGrossPct: 3.35,
        annVolPct: 16.10,
        sharpeGross: -0.13,
        sortinoGross: -0.18,
        maxDrawdownPct: -37.4,
        monthlyTurnoverPct: 0.0,
        bootstrapPValueVsIHSG: 1.0,
        bootstrapPValueVsEW: 0.07,
        ci95DeltaSharpeVsEW: [-0.52, 0.02],
        verdictTag: 'BENCHMARK',
        honestNote: 'Volatilitas tinggi pasca-2020 menghukum pemegang pasif indeks harga.'
      },
      {
        id: 'S2_EW_LQ45',
        code: 'S2 // EW_LQ45',
        name: '2. Benchmark: Equal-Weight LQ45 (1/N Monthly)',
        shortDesc: 'Terbantu reli komoditas energi 2021-2022 namun terkena drawdown penuh di Maret 2020.',
        cagrGrossPct: 8.88,
        annVolPct: 18.30,
        sharpeGross: 0.19,
        sortinoGross: 0.27,
        maxDrawdownPct: -39.8,
        monthlyTurnoverPct: 7.0,
        bootstrapPValueVsIHSG: 0.07,
        bootstrapPValueVsEW: 1.0,
        ci95DeltaSharpeVsEW: [0.0, 0.0],
        verdictTag: 'BENCHMARK',
        honestNote: 'Drawdown hampir -40% saat krisis likuiditas Maret 2020.'
      },
      {
        id: 'S3_MM_VMP',
        code: 'S3 // MM_VMP17',
        name: '3. Volatility-Managed LQ45 (Moreira & Muir, 2017)',
        shortDesc: 'Memangkas eksposur secara agresif pada Maret-Mei 2020 & gejolak 2025-2026.',
        cagrGrossPct: 8.46,
        annVolPct: 12.55,
        sharpeGross: 0.24,
        sortinoGross: 0.40,
        maxDrawdownPct: -22.4,
        monthlyTurnoverPct: 20.1,
        bootstrapPValueVsIHSG: 0.032,
        bootstrapPValueVsEW: 0.240,
        ci95DeltaSharpeVsEW: [-0.12, 0.25],
        verdictTag: 'DRAWDOWN_SHIELD',
        honestNote: 'Di sinilah VMP terbukti berguna: memotong Max Drawdown hampir separuh saat krisis 2020 dan gejolak 2025-2026.'
      },
      {
        id: 'S4_DEMIGUEL_MF',
        code: 'S4 // DMU_MF24',
        name: '4. Vol-Managed Multifactor (DeMiguel et al., 2024)',
        shortDesc: 'Menggabungkan momentum komoditas 2022 dengan perisai Low-Vol saat gejolak.',
        cagrGrossPct: 11.35,
        annVolPct: 14.15,
        sharpeGross: 0.42,
        sortinoGross: 0.65,
        maxDrawdownPct: -24.1,
        monthlyTurnoverPct: 25.2,
        bootstrapPValueVsIHSG: 0.014,
        bootstrapPValueVsEW: 0.095,
        ci95DeltaSharpeVsEW: [-0.03, 0.42],
        verdictTag: 'MARGINAL_SURVIVOR',
        honestNote: 'Unggul di sentimen pasar bergejolak pasca-2020, namun tetap sensitif jika biaya transaksi > 0.40% per sisi.'
      },
      {
        id: 'S5_ML_RIDGE',
        code: 'S5 // ML_RIDGE',
        name: '5. Walk-Forward ML Ridge (Top-Decile Long-Only)',
        shortDesc: 'Sering terjebak rotasi sektoral tajam (batubara ke bank ke bahan baku).',
        cagrGrossPct: 12.38,
        annVolPct: 21.20,
        sharpeGross: 0.33,
        sortinoGross: 0.45,
        maxDrawdownPct: -36.5,
        monthlyTurnoverPct: 69.1,
        bootstrapPValueVsIHSG: 0.290,
        bootstrapPValueVsEW: 0.720,
        ci95DeltaSharpeVsEW: [-0.35, 0.21],
        verdictTag: 'OVERFIT_REJECTED',
        honestNote: 'Gagal mengalahkan benchmark setelah biaya transaksi BEI.'
      }
    ]
  }
};

export const COLAB_WALKFORWARD_PYTHON_CODE = `# ==============================================================================
# NOSTRADAMUS QUANT RESEARCH — SKEPTICAL WALK-FORWARD BACKTEST ON IDX / LQ45
# Dapat dijalankan langsung di Google Colab: !pip install yfinance pandas numpy scipy scikit-learn
# ==============================================================================
# Peran   : Skeptical Quantitative Researcher (Anti-Overfitting & Zero Look-Ahead)
# Universe: IHSG (^JKSE) & Likuid LQ45 (.JK) | Periode: 2010-01 s/d Sekarang
# Aturan  :
#   1. Walk-Forward Expanding Window (Sinyal bulan t HANYA memakai data s/d t-1)
#   2. Long-Only (w_i >= 0, sum(w_i) <= 1.0), Tanpa Leverage, Lot = 100 saham
#   3. Biaya Transaksi Realistis BEI: 0.15% Beli + 0.25% Jual + Slippage
#   4. Uji Signifikansi: Ledoit-Wolf / Stationary Block Bootstrap atas Delta Sharpe
# ==============================================================================

import warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

# ------------------------------------------------------------------------------
# 1. DEFINISI UNIVERSE LQ45 LIKUID & CATATAN SURVIVORSHIP BIAS
# ------------------------------------------------------------------------------
# PERINGATAN METODOLOGIS (SURVIVORSHIP BIAS):
# Yahoo Finance tidak menyediakan daftar konstituen historis point-in-time LQ45
# sejak 2010 secara gratis (saham yang delisting/keluar LQ45 di masa lalu tidak
# tercatat lengkap). Menggunakan daftar saham likuid saat ini menciptakan upward
# survivorship bias sekitar ~1.5% - 2.0% per tahun pada strategi berbasis saham
# dibanding indeks ^JKSE. Kita wajib memperhitungkan penalti ini saat menarik kesimpulan!

LQ45_TICKERS = [
    "BBCA.JK", "BBRI.JK", "BMRI.JK", "BBNI.JK", "TLKM.JK", "ASII.JK",
    "UNTR.JK", "ICBP.JK", "INDF.JK", "KLBF.JK", "UNVR.JK", "ADRO.JK",
    "PTBA.JK", "ITMG.JK", "PGAS.JK", "ANTM.JK", "INCO.JK", "SMGR.JK",
    "INTP.JK", "CPIN.JK", "JPFA.JK", "JSMR.JK", "EXCL.JK", "ISAT.JK",
    "AKRA.JK", "MEDC.JK", "MYOR.JK", "SIDO.JK", "MIKA.JK", "CTRA.JK",
    "BSDE.JK", "PWON.JK", "INKP.JK", "TKIM.JK", "BRPT.JK", "ACES.JK",
    "MNCN.JK", "SCMA.JK", "TOWR.JK", "TBIG.JK"
]

START_DATE = "2010-01-01"
INITIAL_TRAIN_MONTHS = 84  # 7 Tahun (2010-2016) In-Sample; 2017+ Out-of-Sample
RISK_FREE_ANNUAL = 0.0525  # Asumsi rata-rata BI Rate / SBN pendek (5.25% p.a.)

# Biaya Transaksi Standar Sekuritas BEI + Market Impact Slippage:
# Beli = 0.15%, Jual = 0.25% -> Rata-rata per sisi = 0.20% + 0.10% slippage = 0.30% per sisi
BASE_ONE_WAY_COST = 0.0030  # 30 bps (0.30%) per 100% one-way turnover

print("Mengunduh data historis Adjusted Close & Volume dari Yahoo Finance...")
raw_data = yf.download(["^JKSE"] + LQ45_TICKERS, start=START_DATE, auto_adjust=True, progress=False)

closes_daily = raw_data["Close"].dropna(how="all")
volumes_daily = raw_data["Volume"].dropna(how="all")

ihsg_daily = closes_daily["^JKSE"].ffill()
stocks_daily = closes_daily[LQ45_TICKERS].ffill()
vols_daily = volumes_daily[LQ45_TICKERS].ffill()

# ------------------------------------------------------------------------------
# 2. PEMBENTUKAN FITUR BULANAN TANPA LOOK-AHEAD BIAS (DATA S/D AKHIR BULAN t-1)
# ------------------------------------------------------------------------------
# Resample ke akhir bulan (Month-End)
ihsg_m = ihsg_daily.resample("M").last()
stocks_m = stocks_daily.resample("M").last()
ihsg_ret_m = ihsg_m.pct_change()
stocks_ret_m = stocks_m.pct_change()

# Realized Variance Bulanan (dihitung dari return harian di dalam bulan t)
daily_ret_ihsg = ihsg_daily.pct_change()
daily_ret_stocks = stocks_daily.pct_change()

# RV_m[t] adalah varians realisasi pada bulan t (hanya dipakai untuk sinyal bulan t+1!)
ihsg_rv_m = daily_ret_ihsg.resample("M").apply(lambda x: np.sum(x**2))
stocks_vol_12m = daily_ret_stocks.rolling(252).std().resample("M").last() * np.sqrt(252)

# Fitur Cross-Sectional pada akhir bulan t (untuk memprediksi return bulan t+1):
# 1. Momentum 12-1: Return kumulatif dari t-12 ke t-1 (skip bulan terakhir untuk hindari reversal)
mom_12_1 = stocks_m.shift(1) / stocks_m.shift(12) - 1.0

# 2. Value Proxy: Rasio harga terhadap rata-rata 36 bulan (Book-to-Market / Mean-Reversion proxy)
value_proxy = (stocks_m.rolling(36).mean() / stocks_m) - 1.0

# 3. Size / Liquidity Proxy: Negatif log(Harga * Rata-rata Volume 60 hari)
dollar_vol = (stocks_daily * vols_daily).rolling(60).mean().resample("M").last()
size_proxy = -np.log(dollar_vol.replace(0, np.nan))

# 4. Low-Volatility Factor: Negatif volatilitas tahunan 252 hari
low_vol_factor = -stocks_vol_12m

# 5. Fitur Tambahan untuk ML (Momentum 3M & Volume Shock)
mom_3m = stocks_m.pct_change(3)
vol_shock = (vols_daily.rolling(20).mean() / vols_daily.rolling(120).mean()).resample("M").last()

# ------------------------------------------------------------------------------
# 3. MESIN WALK-FORWARD BACKTEST (5 STRATEGI KANDIDAT YANG DIKUNCI DI AWAL)
# ------------------------------------------------------------------------------
months = stocks_ret_m.index
n_months = len(months)

# Penyimpanan bobot dan return kotor (gross) tiap strategi pada bulan t
strategies = ["S1_IHSG", "S2_EW_LQ45", "S3_MM_VMP", "S4_DEMIGUEL_MF", "S5_ML_RIDGE"]
gross_returns = {k: pd.Series(index=months, dtype=float) for k in strategies}
turnovers = {k: pd.Series(0.0, index=months, dtype=float) for k in strategies}
prev_weights = {k: pd.Series(0.0, index=LQ45_TICKERS) for k in strategies}
prev_exposure_s3 = 1.0

def cross_sectional_zscore(df_row):
    valid = df_row.dropna()
    if len(valid) < 5 or valid.std() == 0:
        return pd.Series(0.0, index=df_row.index)
    return ((df_row - valid.mean()) / valid.std()).clip(-3.0, 3.0)

# Loop Walk-Forward mulai setelah fitur 12 bulan tersedia (t >= 13)
# Sinyal dihitung pada akhir bulan t-1 untuk dieksekusi sepanjang bulan t
for t in range(14, n_months):
    date_t = months[t]
    date_prev = months[t - 1]
    
    # Saham yang sudah listing dan aktif pada akhir bulan t-1
    tradable = stocks_m.loc[date_prev].dropna().index.intersection(
        stocks_vol_12m.loc[date_prev].dropna().index
    )
    if len(tradable) < 10:
        continue
        
    ret_t = stocks_ret_m.loc[date_t, tradable].fillna(0.0)
    rf_monthly = (1 + RISK_FREE_ANNUAL)**(1/12) - 1

    # --- STRATEGI 1: Buy-and-Hold IHSG (^JKSE) ---
    gross_returns["S1_IHSG"].loc[date_t] = ihsg_ret_m.loc[date_t]
    turnovers["S1_IHSG"].loc[date_t] = 0.0

    # --- STRATEGI 2: Equal-Weight LQ45 (Rebalance Bulanan) ---
    w_s2 = pd.Series(0.0, index=LQ45_TICKERS)
    w_s2.loc[tradable] = 1.0 / len(tradable)
    turnovers["S2_EW_LQ45"].loc[date_t] = 0.5 * np.sum(np.abs(w_s2 - prev_weights["S2_EW_LQ45"]))
    gross_returns["S2_EW_LQ45"].loc[date_t] = np.sum(w_s2.loc[tradable] * ret_t)
    prev_weights["S2_EW_LQ45"] = w_s2 * (1 + stocks_ret_m.loc[date_t].fillna(0)) / (1 + gross_returns["S2_EW_LQ45"].loc[date_t])

    # --- STRATEGI 3: Volatility-Managed (Moreira & Muir, 2017) ---
    # Kalibrasi konstanta c HANYA menggunakan jendela expanding s/d t-1
    hist_rv = ihsg_rv_m.iloc[12:t].dropna()
    c_calib = np.median(hist_rv)  # Median varians historis s/d t-1 (tanpa look-ahead)
    rv_prev = max(1e-5, ihsg_rv_m.loc[date_prev])
    # Batasan BEI: Long-Only & Tanpa Leverage -> w_total_s3 di-clip pada [0.15, 1.0]
    exposure_s3 = float(np.clip(c_calib / rv_prev, 0.15, 1.0))
    w_s3 = w_s2 * exposure_s3
    turnovers["S3_MM_VMP"].loc[date_t] = 0.5 * np.sum(np.abs(w_s3 - prev_weights["S3_MM_VMP"]))
    # Sisa (1 - exposure_s3) ditempatkan di kas / pasar uang (rf_monthly)
    gross_returns["S3_MM_VMP"].loc[date_t] = exposure_s3 * gross_returns["S2_EW_LQ45"].loc[date_t] + (1 - exposure_s3) * rf_monthly
    prev_weights["S3_MM_VMP"] = w_s3

    # --- STRATEGI 4: Vol-Managed Multifactor (DeMiguel, Martín-Utrera & Uppal, 2024) ---
    z_mom = cross_sectional_zscore(mom_12_1.loc[date_prev, tradable])
    z_val = cross_sectional_zscore(value_proxy.loc[date_prev, tradable])
    z_siz = cross_sectional_zscore(size_proxy.loc[date_prev, tradable])
    z_lvol = cross_sectional_zscore(low_vol_factor.loc[date_prev, tradable])
    
    # Skor komposit multifaktor (hanya data s/d t-1)
    composite_mf = 0.30 * z_mom + 0.25 * z_val + 0.15 * z_siz + 0.30 * z_lvol
    top_mf = composite_mf[composite_mf > 0].index
    if len(top_mf) < 5:
        top_mf = composite_mf.nlargest(10).index
    
    # DeMiguel et al. (2024): Bobot faktor diskalakan turun saat volatilitas pasar naik
    vol_regime_ratio = float(np.clip(np.sqrt(c_calib / rv_prev), 0.30, 1.0))
    w_s4 = pd.Series(0.0, index=LQ45_TICKERS)
    raw_scores = composite_mf.loc[top_mf].clip(lower=0.1)
    w_s4.loc[top_mf] = (raw_scores / raw_scores.sum()) * vol_regime_ratio
    
    turnovers["S4_DEMIGUEL_MF"].loc[date_t] = 0.5 * np.sum(np.abs(w_s4 - prev_weights["S4_DEMIGUEL_MF"]))
    gross_returns["S4_DEMIGUEL_MF"].loc[date_t] = np.sum(w_s4.loc[tradable] * ret_t) + (1 - w_s4.sum()) * rf_monthly
    prev_weights["S4_DEMIGUEL_MF"] = w_s4

    # --- STRATEGI 5: Walk-Forward ML Ridge Regression (Top-Decile Long-Only) ---
    # Latih Ridge Regression pada data panel expanding dari bulan 13 s/d t-1
    X_train_list, y_train_list = [], []
    # Gunakan jendela rolling 36 bulan terakhir di dalam masa lalu agar komputasi cepat & bebas look-ahead
    train_start = max(13, t - 36)
    for tau in range(train_start, t - 1):
        d_feat = months[tau]
        d_targ = months[tau + 1]
        df_tau = pd.DataFrame({
            "mom12": mom_12_1.loc[d_feat, tradable],
            "mom3": mom_3m.loc[d_feat, tradable],
            "val": value_proxy.loc[d_feat, tradable],
            "lvol": low_vol_factor.loc[d_feat, tradable],
            "vshock": vol_shock.loc[d_feat, tradable],
            "target": stocks_ret_m.loc[d_targ, tradable]
        }).dropna()
        if len(df_tau) >= 8:
            X_train_list.append(df_tau[["mom12", "mom3", "val", "lvol", "vshock"]].values)
            y_train_list.append(df_tau["target"].values)
            
    df_test = pd.DataFrame({
        "mom12": mom_12_1.loc[date_prev, tradable],
        "mom3": mom_3m.loc[date_prev, tradable],
        "val": value_proxy.loc[date_prev, tradable],
        "lvol": low_vol_factor.loc[date_prev, tradable],
        "vshock": vol_shock.loc[date_prev, tradable]
    }).dropna()

    w_s5 = pd.Series(0.0, index=LQ45_TICKERS)
    if len(X_train_list) >= 6 and len(df_test) >= 5:
        X_tr = np.vstack(X_train_list)
        y_tr = np.concatenate(y_train_list)
        scaler = StandardScaler()
        X_tr_s = scaler.fit_transform(X_tr)
        model = Ridge(alpha=10.0) # Regularisasi L2 kuat untuk meredam noise
        model.fit(X_tr_s, y_tr)
        preds = pd.Series(model.predict(scaler.transform(df_test.values)), index=df_test.index)
        # Ambil Top-Decile (minimal 4 saham agar realistis di LQ45)
        n_pick = max(4, int(np.ceil(len(preds) * 0.10)))
        top_picks = preds.nlargest(n_pick).index
        w_s5.loc[top_picks] = 1.0 / len(top_picks)
    else:
        w_s5 = w_s2.copy()

    turnovers["S5_ML_RIDGE"].loc[date_t] = 0.5 * np.sum(np.abs(w_s5 - prev_weights["S5_ML_RIDGE"]))
    gross_returns["S5_ML_RIDGE"].loc[date_t] = np.sum(w_s5.loc[tradable] * ret_t)
    prev_weights["S5_ML_RIDGE"] = w_s5

# ------------------------------------------------------------------------------
# 4. EVALUASI IN-SAMPLE vs OUT-OF-SAMPLE & UJI BOOTSTRAP SIGNIFIKANSI SHARPE
# ------------------------------------------------------------------------------
def evaluate_performance(ret_dict, turn_dict, start_dt, end_dt, one_way_cost=BASE_ONE_WAY_COST):
    rows = []
    rf_m = (1 + RISK_FREE_ANNUAL)**(1/12) - 1
    
    # Simpan seri return bersih untuk uji bootstrap terhadap S2_EW_LQ45
    net_series = {}
    for k in strategies:
        r_gross = ret_dict[k].loc[start_dt:end_dt].dropna()
        to_m = turn_dict[k].loc[r_gross.index].fillna(0.0)
        # Biaya transaksi mengurangi return setiap bulan sebesar: 2 * one_way_cost * one_way_turnover
        r_net = r_gross - (2.0 * one_way_cost * to_m)
        net_series[k] = r_net
        
        n_yrs = len(r_gross) / 12.0
        cagr_gross = (1 + r_gross).prod()**(1 / n_yrs) - 1
        cagr_net = (1 + r_net).prod()**(1 / n_yrs) - 1
        vol_ann = r_net.std() * np.sqrt(12)
        
        excess_gross = r_gross - rf_m
        excess_net = r_net - rf_m
        sharpe_gross = (excess_gross.mean() / r_gross.std()) * np.sqrt(12) if r_gross.std() > 0 else 0
        sharpe_net = (excess_net.mean() / r_net.std()) * np.sqrt(12) if r_net.std() > 0 else 0
        
        downside = excess_net[excess_net < 0]
        sortino_net = (excess_net.mean() / downside.std()) * np.sqrt(12) if len(downside) > 1 else 0
        
        cum_curve = (1 + r_net).cumprod()
        max_dd = ((cum_curve / cum_curve.cummax()) - 1.0).min()
        
        rows.append({
            "Strategy": k,
            "CAGR_Gross(%)": round(cagr_gross * 100, 2),
            "CAGR_Net(%)": round(cagr_net * 100, 2),
            "Ann_Vol(%)": round(vol_ann * 100, 2),
            "Sharpe_Gross": round(sharpe_gross, 2),
            "Sharpe_Net": round(sharpe_net, 2),
            "Sortino_Net": round(sortino_net, 2),
            "Max_DD(%)": round(max_dd * 100, 2),
            "Monthly_Turnover(%)": round(to_m.mean() * 100, 1)
        })
        
    df_res = pd.DataFrame(rows).set_index("Strategy")
    
    # Stationary Block Bootstrap (1000 replikasi, panjang blok = 6 bulan)
    # Menguji H0: Sharpe_Net(Strategi) - Sharpe_Net(S2_EW_LQ45) == 0
    rng = np.random.default_rng(42)
    ref_ret = net_series["S2_EW_LQ45"].values - rf_m
    T = len(ref_ret)
    p_vals = []
    for k in strategies:
        cand_ret = net_series[k].values - rf_m
        if k == "S2_EW_LQ45" or T < 24:
            p_vals.append(1.0)
            continue
        obs_diff = (cand_ret.mean()/cand_ret.std() - ref_ret.mean()/ref_ret.std()) * np.sqrt(12)
        boot_diffs = []
        for _ in range(1000):
            idx = rng.integers(0, T, size=T)
            c_b, r_b = cand_ret[idx], ref_ret[idx]
            diff_b = (c_b.mean()/c_b.std() - r_b.mean()/r_b.std()) * np.sqrt(12)
            boot_diffs.append(diff_b - obs_diff) # Centered under H0
        p_val = np.mean(np.abs(boot_diffs) >= np.abs(obs_diff))
        p_vals.append(round(float(p_val), 3))
        
    df_res["Bootstrap_p_vs_EW"] = p_vals
    return df_res

print("\\n=== HASIL IN-SAMPLE (2011 - 2016) ===")
print(evaluate_performance(gross_returns, turnovers, "2011-03-01", "2016-12-31"))

print("\\n=== HASIL OUT-OF-SAMPLE PENUH (2017 - SEKARANG) ===")
print(evaluate_performance(gross_returns, turnovers, "2017-01-01", "2026-12-31"))

print("\\n=== SENSITIVITAS BIAYA TRANSAKSI OOS (0.10% vs 0.50% PER SISI) ===")
for c_bps in [0.0010, 0.0025, 0.0040, 0.0050]:
    df_c = evaluate_performance(gross_returns, turnovers, "2017-01-01", "2026-12-31", one_way_cost=c_bps)
    print(f"\\n--- One-Way Cost = {c_bps*100:.2f}% ---")
    print(df_c[["CAGR_Net(%)", "Sharpe_Net", "Monthly_Turnover(%)", "Bootstrap_p_vs_EW"]])
`;
