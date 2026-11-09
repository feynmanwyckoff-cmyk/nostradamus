# Penyempurnaan Arsitektur Kuantitatif: Rekonsiliasi Valuasi, Forward Dividend, Override Defensif & Batas Likuiditas ADTV

Menutup tujuh celah analitis dan operasional pada sistem *Quantitative Terminal* (backend & frontend) terkait sinkronisasi multipel wajar, penghapusan *double counting* imbal hasil, proyeksi dividen masa depan (*Forward Dividend Yield*), kalibrasi *Equity Risk Premium* (ERP), *override* sinyal aset defensif ber-Beta rendah, penyesuaian fraksi harga dinamis BEI, serta pembatas likuiditas eksekusi (*ADTV 20D Liquidity Constraint*).

## User Review & Critical Decisions

> [!IMPORTANT]
> Seluruh tujuh spesifikasi teknis dari hasil audit kuantitatif telah terintegrasi ke dalam cetak biru arsitektur ini dan siap dieksekusi:

- **Confirmed Decision 1 — Rekonsiliasi Wajar PER & Wajar PBV terhadap Nilai Intrinsik Blended**:
  - Mengikat (*pegging*) nilai akhir `joeliardiFairPer = round2(intrinsicValueIdr / estimatedEpsIdr)` dan `joeliardiFairPbv = round2(intrinsicValueIdr / estimatedBvpsIdr)` setelah `intrinsicValueIdr` dihitung dari formula *blended* (45% PBV + 35% PER + 20% Graham) dan dibulatkan ke fraksi resmi BEI (`roundToIdxTick`).
- **Confirmed Decision 2 — Fungsi `calculateForwardDividend()` & Label `'Forward Dividend Yield (Est)'`**:
  - Membangun fungsi `calculateForwardDividend()` pada backend dan mesin kuantitatif yang menghitung **Annualized EPS** (berdasarkan kinerja laba Kuartal III-2026 yang disetahunkan) dikalikan dengan **Dividend Payout Ratio (DPR) rata-rata historis 3 tahun terakhir** emiten (mis. DPR 3Y ARNA ~68%–70%).
  - Mengganti seluruh label `'Div. Yield TTM'` menjadi **`'Forward Dividend Yield (Est)'`** di antarmuka Tailwind CSS, prompt AI, dan laporan ekspor.
- **Confirmed Decision 3 — Eliminasi *Double Counting* pada Total Shareholder Yield**:
  - Menghapus penjumlahan ganda `Earnings Yield + Dividend Yield`.
  - Menghitung **Total Shareholder Yield** secara valid menggunakan **Forward Dividend Yield (Est)** ditambah **Implied Net Buyback & Debt Paydown Yield** (diturunkan dari efisiensi kas bebas dan *de-leveraging* neraca tanpa menghitung laba dua kali).
- **Confirmed Decision 4 — Override Parameter Defensif pada Modul `'Uji Silang Momentum & Value Trap'`**:
  - Merevisi logika `if-else` pada modul **Uji Silang Momentum & Value Trap** (baik pada backend/GAS maupun engine frontend): menambahkan kondisi *override* **`if (stock.beta1Y < 0.5 && stock.dmuValueScore > 9.0)`** yang mengabaikan tekanan harga 30D negatif, membatalkan status *Value Trap*, dan mengubah output teks narasinya secara eksak menjadi:
    **`"Strong Buy: Anomali Aset Defensif Terdiskon"`** (menggantikan status `'Harga Masih Tertekan / Tunggu Konfirmasi Akumulasi'`).
- **Confirmed Decision 5 — Integrasi ADTV 20 Hari & Algoritma *Liquidity Constraint* (Maksimal 5% ADTV) pada `'Panduan Porsi Keranjang'`**:
  - Menarik dan mengkalibrasi variabel **Average Daily Trading Volume / Value (ADTV) 20 Hari Terakhir (`adtv20dIdr`)** dari endpoint data pasar live (Yahoo Finance / bursa).
  - Memperbarui modul **Panduan Porsi Keranjang** dengan algoritma pembatas likuiditas (*liquidity constraint*): nilai nominal Rupiah dari target alokasi `6%–12%` modal ekuitas aktif (`targetAllocationIdr`) **tidak boleh melebihi 5% dari ADTV 20D emiten (`maxSafeExecutionIdr = adtv20dIdr * 0.05`)**.
  - Menampilkan **Warning Badge visual** (`⚠️ LIQUIDITY CAP WARNING: Target Alokasi > 5% ADTV 20D`) di UI modal dan laporan ekspor apabila alokasi melampaui batas kedalaman pasar harian, disertai rekomendasi pemecahan order (*split order / TWAP*) atau pemangkasan porsi maksimal ke batas 5% ADTV.
- **Confirmed Decision 6 — Zona Akumulasi Ideal Dinamis Berbasis Fraksi BEI & Notifikasi *Undercut / Deep Discount***:
  - Menerapkan tabel fraksi harga resmi BEI (`roundToIdxTick`) agar harga `Rp 498` tidak terbulatkan menjadi `Rp 500`.
  - Apabila harga spot saat ini sudah lebih murah dari batas bawah akumulasi intrinsik (`lastPrice <= intrinsicValueIdr * 0.85`), rentang zona akumulasi otomatis menyesuaikan secara *floating* di `Rp [Spot × 0.96] – Rp [Spot]` dengan notifikasi **`UNDERCUT / DEEP DISCOUNT (Spot Sudah di Bawah Batas Akumulasi Wajar)`**.
- **Confirmed Decision 7 — Integrasi Equity Risk Premium (ERP) pada Spread Valuasi SBN 10Y**:
  - Memasukkan **Equity Risk Premium (ERP) Indonesia (~6,0%)** ke dalam evaluasi *Earnings Yield Spread* terhadap SBN 10Y (`6,75%`), sehingga sistem menyajikan *Raw Spread vs SBN 10Y* sekaligus **Net ERP-Adjusted Spread** (terhadap tuntutan imbal hasil ekuitas `Ke = SBN 10Y + ERP`).

---

## 1. Overview & Core Concept

- **What It Does**: Mengangkat standar *Quantitative Fundamental & OOS Conviction Inspector* menjadi mesin analitik setara institusional yang menggabungkan valuasi multipel terkunci (*pegged*), proyeksi dividen ke depan (*forward-looking*), deteksi anomali defensif ber-Beta rendah, serta manajemen risiko likuiditas buku order (*ADTV market depth*).
- **Target Audience / Persona**: Manajer portofolio kuantitatif dan komite investasi saham BEI yang mengeksekusi modal terukur tanpa terjebak bias *trailing dividend*, *double counting*, maupun *slippage* likuiditas.
- **Key Value**: Presisi matematis dan keamanan eksekusi dari hulu (API backend & mesin kuantitatif) hingga hilir (UI modal Tailwind CSS dan laporan ekspor).

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Inspeksi Emiten Defensif Terdiskon (Kasus ARNA)**:
     - Saat membuka inspektor `ARNA` (`Beta 0.32x`, `Skor Value > 9.0`, `30D -3.3%`), langkah **03. Uji Silang Momentum & Value Trap** langsung mengeksekusi *override* dan menampilkan status tegas: **`Strong Buy: Anomali Aset Defensif Terdiskon`**.
     - Kartu **Pilar 1** dan strip **Total Shareholder Yield** menampilkan **`Forward Dividend Yield (Est)`** yang dihitung dari *Annualized EPS Q3-2026 × DPR 3Y*, bukan lagi *Div. Yield TTM* masa lalu.
  2. **Verifikasi Kedalaman Likuiditas (ADTV 20D) & Porsi Keranjang**:
     - Pada kartu **Rencana Eksekusi & Panduan Porsi Keranjang**, sistem menampilkan nilai **ADTV 20D (Rp)** dan **Batas Aman Eksekusi Harian (5% ADTV)**.
     - Jika nominal alokasi `6%–12%` dari modal aktif pengguna melebihi `5% × ADTV 20D`, muncul **Warning Badge** berwarna amber/merah yang memperingatkan risiko *slippage* dan mencantumkan batas nominal maksimal per hari.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Desain *light-mode* bersih dan fungsional dengan tipografi `Fira Code` (`font-mono tabular-nums`) untuk seluruh tabel angka, rasio multipel, dan kalkulasi ADTV.
  - *Component Styling & Layout*: Peringatan likuiditas (*Liquidity Warning Badge*) dan penanda *Undercut/Deep Discount* diintegrasikan secara rapi pada grid **Rencana Eksekusi & Manajemen Risiko Posisi** tanpa merusak keseimbangan tata letak.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Arsitektur `calculateForwardDividend()` (Backend + Shared Engine)**
  - *Chosen Approach*: Membuat fungsi `calculateForwardDividend(stock, estimatedEpsIdr)` yang mengestimasi *Annualized EPS* berbasis pertumbuhan laba berjalan Kuartal III-2026 serta mengalikan dengan *3-Year Historical DPR* per emiten/sektor, lalu menyuplai hasilnya ke endpoint backend (`/api/ai/inspect-emiten`, `/api/market/live` & skrip GAS) serta kalkulator frontend.
  - *Why*: Menjaga konsistensi nilai *Forward Dividend Yield (Est)* baik saat aplikasi berjalan dengan backend aktif maupun mode statis GitHub Pages.
- **Decision 2: Algoritma Pembatas Likuiditas 5% ADTV 20D (`Liquidity Constraint`)**
  - *Chosen Approach*: Menarik volume rata-rata 20 hari dari kuotasi bursa (`averageDailyVolume20Day` / `averageVolume` dikalikan harga pasar, dengan *fallback* kalibrasi kapitalisasi & likuiditas emiten BEI) untuk memperoleh `adtv20dIdr`. Membandingkan nominal alokasi `6%–12%` modal portofolio terhadap `0.05 * adtv20dIdr`.
  - *Why*: Standar eksekusi institusional membatasi partisipasi harian maksimal 5% dari ADTV agar order beli/jual tidak menggerakkan harga pasar secara merugikan (*market impact slippage*).

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 Backend API & Google Apps Script (GAS) Layer                 │
│  • Endpoint Bursa Live: Tarik Harga, Volume & ADTV 20 Hari (adtv20dIdr)      │
│  • calculateForwardDividend(): Annualized EPS Q3-2026 × Historical 3Y DPR    │
│  • Uji Silang Momentum & Value Trap Override:                                │
│      if (Beta < 0.5 && ValueScore > 9.0)                                     │
│        -> "Strong Buy: Anomali Aset Defensif Terdiskon"                      │
└──────────────────────┬───────────────────────────────────┬───────────────────┘
                       │                                   │
                       ▼                                   ▼
┌──────────────────────────────────────────┐ ┌─────────────────────────────────┐
│    Quantitative Engine & Liquidity Cap   │ │  Tailwind UI & Export Renderer  │
│ • Pegged Fair PER & Fair PBV             │ │ • Label: Forward Dividend       │
│ • Total SY = Forward Div + Buyback/Debt  │ │   Yield (Est)                   │
│ • ERP-Adjusted Yield Spread (SBN + ERP)  │ │ • Dynamic Buy Zone (Undercut)   │
│ • Liquidity Constraint:                  │ │ • Warning Badge Visual jika     │
│   Nominal Alokasi (6%-12%) <= 5% ADTV    │ │   Alokasi > 5% ADTV 20D         │
└──────────────────────────────────────────┘ └─────────────────────────────────┘
```

- **Data Model & State**:
  - Menambahkan properti `forwardDividendYieldPct`, `estimatedForwardDpsIdr`, `historicalDpr3YPct`, `adtv20dIdr`, `maxSafeAllocationIdr` (5% ADTV), dan `isLiquidityCapped` pada objek hasil evaluasi (`JoeliardiOosEvaluation` / `StockMetrics`) serta struktur laporan Komite Investasi.
- **Interactive Component & State Mapping**:
  - **Modul Uji Silang Momentum & Value Trap**: Mengevaluasi kondisi `stock.beta1Y < 0.5 && stock.dmuValueScore > 9.0` lebih dulu sebelum mengecek `return30D`. Jika terpenuhi, menonaktifkan bendera `isValueTrapCandidate` dan mencetak string `'Strong Buy: Anomali Aset Defensif Terdiskon'`.
  - **Modul Panduan Porsi Keranjang & Modal Inspector**: Menghitung nominal Rupiah dari alokasi `6%–12%` terhadap modal portofolio aktif pengguna, membandingkannya dengan `5% × ADTV 20D`, membatasi rekomendasi nominal pada plafon `5% ADTV`, dan merender *Warning Badge* visual apabila terlampaui.
