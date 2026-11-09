# Nostradamus Quant Terminal (IHSG)

> *"Di pasar yang penuh derau dan spekulasi, disiplin matematis bukan sekadar alat ukur, melainkan kompas untuk bertahan dan menang secara sistematis."*
> **Fayadh**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Security Vault](https://img.shields.io/badge/Vault-AES--256--GCM_%2B_PBKDF2-10B981)](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)
[![Universe](https://img.shields.io/badge/IDX_Universe-956%2B_Emiten-0F172A)](https://www.idx.co.id/)

**Nostradamus Quant Terminal (IHSG)** adalah mesin *Quantitative Portfolio Allocation*, *Multifactor Equity Screener* (mencakup **956+ emiten Bursa Efek Indonesia / IDX**), dan *Zero-Knowledge Cloud Portfolio Manager* yang dirancang dengan arsitektur *hybrid static-serverless* di atas **GitHub Pages**, **GitHub Actions**, serta **GitHub Contents REST API**.

Mengadopsi estetika editorial *light-mode* terinspirasi dari **Medium.com** (tipografi serif untuk judul naratif, sans-serif untuk *interface*, dan monospasi **Fira Code** untuk tabel data kuantitatif serta kode), terminal ini memadukan riset akademik kuantitatif (**DeMiguel 4-Factor**, **Asness Quality-Minus-Junk / QMJ**, **Frazzini Betting-Against-Beta / BAB**, dan **López de Prado Hierarchical Risk Parity / HRP**) dengan realitas mikrostruktur pasar modal Indonesia (satuan **1 Lot = 100 lembar**, *auto-filter* saham *gocap* atau suspensi, dan friksi komisi transaksi *round-trip* **0,40%**).

---

## Daftar Isi

1. [Fitur Utama (Key Capabilities)](#1-fitur-utama-key-capabilities)
2. [Arsitektur Sistem & Alur Sinkronisasi Cloud / GitHub Pages](#2-arsitektur-sistem--alur-sinkronisasi-cloud--github-pages)
3. [Metodologi Kuantitatif: Barbell, QMJ, HRP & DeMiguel 4-Factor](#3-metodologi-kuantitatif-barbell-qmj-hrp--demiguel-4-factor)
4. [Dokumentasi Keamanan Zero-Knowledge Encrypted Vault](#4-dokumentasi-keamanan-zero-knowledge-encrypted-vault)
5. [Panduan Instalasi Lokal & Deployment GitHub Pages](#5-panduan-instalasi-lokal--deployment-github-pages)
6. [Struktur Repositori](#6-struktur-repositori)
7. [Disclaimer Kuantitatif](#7-disclaimer-kuantitatif)

---

## 1. Fitur Utama (*Key Capabilities*)

- **Full-Universe IDX Multifactor Screener (956+ Emiten)**
  Memindai seluruh emiten terdaftar di Bursa Efek Indonesia secara *real-time* maupun melalui *automated snapshot*, lengkap dengan *Multi-Criterion Filter*, *Institutional Liquidity Filter*, dan penalti otomatis untuk saham tidak likuid atau *gocap* (`< Rp68 sampai Rp80`).
- **Market Regime & Global Macro Stress Detector**
  Mengukur volatilitas tahunan IHSG 30-hari (*30D Annualized Volatility*) yang dikombinasikan dengan **11 Indikator Makro Global** (`USD/IDR`, `DXY`, `US 10Y Yield`, `CBOE VIX`, `S&P 500`, `Hang Seng`, `Newcastle Coal`, `Gold XAU`, `Brent Crude`, `LME Nickel`, `CPO BMD`) untuk menentukan rezim pasar (`TENANG`, `WASPADA`, `VOLATIL`) dan rasio *Active Equity vs. Cash Buffer* secara dinamis.
- **Two-Sleeve Barbell HRP Portfolio Optimizer**
  Membagi modal secara optimal ke dalam dua keranjang komplementer:
  - **Keranjang 1 (*Defensive Low-Vol, Value & Dividend Core*)**: Emiten likuid ber-beta rendah ($\beta \le 0.96$), ROE kuat, dan *dividend yield* tinggi sebagai jangkar stabilitas.
  - **Keranjang 2 (*Momentum & Size Alpha Sleeve*)**: Emiten likuid dengan akselerasi harga *live* (`1D` & `30D`) dan *risk-adjusted momentum* tinggi untuk menangkap ekspansi siklus IHSG.
- **Active Portfolio Manager & DeMiguel Rebalancing Buffer**
  Mengevaluasi portofolio aktual pengguna dengan tiga pilihan horizon (**Harian / Daily**, **Mingguan / Weekly**, **Bulanan / Monthly**) menggunakan **Zona Buffer Hemat Biaya (25% sampai 40%)** agar investor tidak terjebak *over-trading* akibat biaya broker BEI (`0,15%` beli / `0,25%` jual).
- **Skeptical Walk-Forward Backtest Lab**
  Laboratorium *backtesting* bebas bias (*out-of-sample walk-forward*) yang membandingkan kinerja *Barbell Multifactor* terhadap indeks acuan IHSG setelah dikurangi friksi *slippage* dan komisi broker.
- **Zero-Knowledge AES-256-GCM Security Vault & GitHub Cloud Sync**
  Menyimpan kepemilikan portofolio, *average buy price*, dan kas secara terenkripsi di sisi browser (*client-side encryption*) menggunakan **Web Crypto API (`PBKDF2-SHA256` + `AES-256-GCM`)**, serta menyinkronkannya lintas perangkat (laptop, ponsel, tablet) langsung ke repositori GitHub pribadi pengguna.

---

## 2. Arsitektur Sistem & Alur Sinkronisasi Cloud / GitHub Pages

Sistem ini dirancang agar dapat berjalan **100% gratis tanpa biaya server bulanan** di GitHub Pages maupun di lingkungan *local development* (`Express + Vite`).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     NOSTRADAMUS QUANT TERMINAL (IHSG)                        │
│         React 19 + TypeScript + Tailwind CSS + Web Crypto AES-256-GCM        │
└───────────────┬──────────────────────────────────────────────┬───────────────┘
                │                                              │
                ▼                                              ▼
┌──────────────────────────────────────┐      ┌────────────────────────────────┐
│   LIVE MARKET & MACRO DATA LAYER     │      │  ZERO-KNOWLEDGE CLOUD STATE    │
│ ──────────────────────────────────── │      │ ────────────────────────────── │
│ • Yahoo Finance v8 Chart/Quote API   │      │ • PBKDF2-SHA256 (100,000 iter) │
│ • 956+ Emiten BEI + 11 Global Macro  │      │ • AES-256-GCM Client Vault     │
│ • Multi-Source News RSS Sentiment    │      │ • SHA-256 Repo & Origin Scope  │
│ • GitHub Actions Cron (3x/Hari BEI)  │      │ • GitHub Contents REST API     │
│ • Multi-Proxy Live Browser Fallback  │      │ • 1-Click Fork Upstream Sync   │
└───────────────┬──────────────────────┘      └────────────────┬───────────────┘
                │                                              │
                └──────────────────────┬───────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         QUANTITATIVE ENGINE CORE                             │
│ ──────────────────────────────────────────────────────────────────────────── │
│ 1. Market Regime Detector : Annualized Vol 30D (75%) + Macro Stress (25%)    │
│ 2. DeMiguel 4-Factor      : Low-Vol (28%) · Mom (34%) · Val (23%) · Liq (15%)│
│ 3. Barbell HRP Optimizer  : Keranjang 1 (Defensive) + Keranjang 2 (Momentum) │
│ 4. Active Portfolio Eval  : Daily (25%) / Weekly (35%) / Monthly (40% Buffer)│
│ 5. Skeptical Backtest Lab : Walk-Forward Validation + BEI Fee Friction (0.4%)│
└──────────────────────────────────────────────────────────────────────────────┘
```

### Alur Data Pasar Berlapis (*Multi-Tier Market Fetcher*)

Ketika pengguna membuka terminal atau menekan tombol **SYNC SEMUA LIVE**, sistem menjalankan strategi pengambilan data berlapis:

1. **Tier 1 (Server-Side Express Proxy `/api/idx/live`)**: Saat dijalankan secara lokal (`npm run dev`), server Express mengambil data kuotasi *real-time* dari Yahoo Finance v8 Chart dan Spark API untuk seluruh emiten, indeks makro global, serta *feed* berita RSS finansial tanpa kendala CORS.
2. **Tier 2 (GitHub REST API Raw Snapshot Bypass `api.github.com`)**: Saat diakses melalui GitHub Pages, browser memanggil endpoint `contents/public/static-market-snapshot.json` menggunakan header `Accept: application/vnd.github.raw+json` untuk melewati *CDN cache* GitHub Pages dan memperoleh *snapshot* pasar terbaru hasil *cron job* GitHub Actions.
3. **Tier 3 (Browser Multi-Proxy Live Fallback & Embedded Bundle)**: Jika pengguna memicu pembaruan langsung dari browser statis, *live market fetcher* melakukan *batch request* paralel teroptimasi dengan *fallback* ke `static-market-snapshot.json`.

### Otomatisasi GitHub Actions (3x Sehari Jam Bursa BEI)

Dua *workflow* otomatis di dalam `.github/workflows/` menjaga kesegaran data dan aplikasi:
- **`sync-idx-market.yml`**: Berjalan otomatis sesuai jadwal perdagangan BEI (`09:15`, `12:15`, dan `16:15 WIB` setiap Senin sampai Jumat melalui cron `'15 2,5,9 * * 1-5'`) maupun secara manual (`workflow_dispatch`). Menjalankan `scripts/generate-static-market-bundle.mjs` untuk memperbarui harga 956+ saham, indikator makro, dan sentimen berita, lalu melakukan *auto-commit* ke repositori.
- **`deploy-pages.yml`**: Membangun ulang *production bundle* (`dist/`) dengan data *snapshot* terbaru dan men-deploy ke **GitHub Pages**.

### Sinkronisasi Cloud Lintas Perangkat & *1-Click Fork Upstream Sync*

Melalui panel **GitHub Cloud Sync**:
- **Push & Pull State (`data/nostradamus_cloud_state.json`)**: Menggunakan GitHub Contents REST API (`PUT /repos/{owner}/{repo}/contents/{path}`) dengan resolusi `SHA` otomatis sehingga perubahan portofolio dari ponsel atau laptop langsung tersimpan di repositori tanpa konflik (`409 Conflict` dihindari secara otomatis).
- **1-Click Sync Fork Upstream & Rebuild UI**: Bagi pengguna yang melakukan **Fork** dari repositori utama, tersedia tombol untuk menarik pembaruan kode UI dan fitur terbaru dari *upstream* (`merge-upstream` dengan *fallback Git Tree merge* bebas konflik) sambil **tetap mempertahankan** file `data/nostradamus_cloud_state.json` dan `CNAME` milik *fork* tersebut.

---

## 3. Metodologi Kuantitatif: Barbell, QMJ, HRP & DeMiguel 4-Factor

### 3.1. Deteksi Rezim Volatilitas IHSG & *Global Macro Stress Score*

Terminal menghitung simpangan baku harian (*daily standard deviation*) dari 30 hari bursa terakhir dan menyetahunkannya (*annualized volatility*):

$$\sigma_{\text{30D, Ann}} = \sigma_{\text{daily, 30D}} \times \sqrt{252}$$

Untuk mengantisipasi guncangan eksternal sebelum tercermin penuh pada harga historis, dihitung **Macro Stress Score** ($S_{\text{macro}} \in [5, 98]$) dari 4 variabel transmisi utama:

$$S_{\text{macro}} = 0.35 \cdot \text{Stress}_{\text{USD/IDR}} + 0.30 \cdot \text{Stress}_{\text{VIX}} + 0.20 \cdot \text{Stress}_{\text{US10Y}} + 0.15 \cdot \text{Stress}_{\text{DXY}}$$

Volatilitas rezim efektif ($\sigma_{\text{eff}}$) dihitung sebagai kombinasi:

$$\sigma_{\text{eff}} = 0.75 \cdot \sigma_{\text{30D, Ann}} + 0.25 \cdot \left(10 + 0.16 \cdot S_{\text{macro}}\right)$$

| Status Rezim | Kriteria Kuantitatif | Alokasi Ekuitas Aktif | Alokasi Kas & Buffer Defensif |
| :--- | :--- | :--- | :--- |
| **TENANG** | $\sigma_{\text{eff}} \le \sigma_{\text{target}} - 2.2\%$ dan $S_{\text{macro}} < 52$ | **75% - 90%** | **10% - 25%** |
| **WASPADA** | $\sigma_{\text{eff}} > \sigma_{\text{target}} - 2.2\%$ atau $S_{\text{macro}} \ge 52$ | **55% - 75%** | **25% - 45%** |
| **VOLATIL** | $\sigma_{\text{eff}} > \sigma_{\text{target}}$ (default $18\%$) atau $S_{\text{macro}} \ge 68$ | **35% - 55%** | **45% - 65%** |

---

### 3.2. Model *DeMiguel 4-Factor Composite Scoring* (DMU) & *Quality-Minus-Junk* (QMJ)

Setiap emiten dinilai pada skala `1.0 - 9.9` berdasarkan 4 faktor ortogonal yang dikalibrasi untuk pasar Indonesia:

1. **Low-Volatility & Beta Stability (`dmuLowVolScore`, Bobot 28%)**
   Mengukur keamanan volatilitas tahunan ($\sigma_{\text{Ann}}$), stabilitas beta 1-tahun ($\beta_{\text{1Y}}$) terhadap IHSG, serta ketahanan *drawdown* 30-hari (terinspirasi dari faktor *Betting-Against-Beta* Frazzini & Pedersen).
2. **Risk-Adjusted Price Momentum (`dmuMomScore`, Bobot 34%)**
   Mengukur akselerasi tren harga (`return30D` dan `change1D`) yang dinormalisasi terhadap volatilitas emiten agar lonjakan spekulatif berisiko tinggi tidak mendistorsi skor momentum murni.
3. **Dynamic Value, Profitability & Dividend Yield (`dmuValueScore`, Bobot 23%)**
   Menggabungkan kualitas fundamental *Quality-Minus-Junk* (**ROE**, **Operating Margin**, dan rendahnya **Debt-to-Equity Ratio**) yang disesuaikan dengan rasio harga aktual terhadap *valuation anchor* serta bonus **Dividend Yield**.
4. **Capital Efficiency & Institutional Liquidity (`dmuSizeScore`, Bobot 15%)**
   Memprioritaskan efisiensi struktur modal dan likuiditas institusional agar portofolio bebas dari jebakan likuiditas (*illiquidity trap*).

$$\text{DMU Composite Score} = 0.28 \cdot \text{LowVol} + 0.34 \cdot \text{Mom} + 0.23 \cdot \text{Value} + 0.15 \cdot \text{Size}$$

> [!IMPORTANT]
> **Anti-Gocap & Illiquidity Guardrail**: Emiten yang terdeteksi tidak likuid (`isLiquid === false`), harga di bawah batas pengaman (`< Rp68 sampai Rp80`), atau stagnan/suspensi secara otomatis dikenakan penalti keras (`dmuLowVolScore = 1.5`, `dmuCompositeScore <= 2.65`, dan `role = AVOID_JUNK`) sehingga **tidak akan pernah** masuk ke dalam Keranjang Defensif maupun Momentum.

---

### 3.3. Optimasi *Two-Sleeve Barbell HRP* & Kalkulator Lot-100 BEI

Dari porsi ekuitas aktif yang diizinkan oleh rezim pasar:
- **55% dialokasikan ke Keranjang 1 (*Defensive Core*)**: Menyaring saham likuid dengan $\text{ROE} \ge 8\%$, $\beta_{\text{1Y}} \le 0.96$, dan `dmuLowVolScore >= 5.5`. Bobot internal ditentukan menggunakan skor spesifik defensif (`50% Low-Vol + 30% Value + 20% Momentum + Dividend Yield Boost`).
- **45% dialokasikan ke Keranjang 2 (*Momentum Alpha*)**: Menyaring saham likuid di luar Keranjang 1 dengan momentum harga kuat (`40% Momentum + 25% Live Surge + 20% Size + 15% Value`).
- **Pembobotan *Inverse-Volatility Propensity* (HRP)**:
  Setiap kandidat diberi bobot proporsional terhadap $\frac{(\text{SleeveScore})^{1.4}}{\max(10, \sigma_{\text{Ann}})}$, kemudian dikonversi langsung menjadi satuan **Lot BEI (1 Lot = 100 lembar saham)** sesuai modal Rupiah pengguna.

---

### 3.4. Zona Buffer Rebalancing DeMiguel (Penghematan Friksi Transaksi BEI)

Berdasarkan riset DeMiguel et al. mengenai portofolio multifaktor dengan biaya transaksi, melakukan *rebalancing* penuh setiap kali peringkat saham bergeser sedikit akan menggerus *alpha* akibat biaya broker BEI (`0,15%` beli + `0,25%` jual = `0,40%` *round-trip*).

| Horizon Evaluasi | Batas *No-Trade Buffer Zone* | Toleransi *Weight Drift* | Karakteristik Eksekusi |
| :--- | :--- | :--- | :--- |
| **Harian (`DAILY`)** | **Top 25%** Universe | $\pm 4.5\%$ | Taktis, merespons *breakout* & pergeseran cepat |
| **Mingguan (`WEEKLY`)** | **Top 35%** Universe | $\pm 6.5\%$ | *Swing allocation*, keseimbangan *turnover* & tren |
| **Bulanan (`MONTHLY`)** | **Top 40%** Universe | $\pm 8.0\%$ | Institusional DeMiguel, meminimalkan biaya komisi BEI |

- **`TOP_DECILE_BUY` (Top 20%)**: Kandidat utama untuk akumulasi baru (`HOLD_CORE` / `ACCUMULATE`).
- **`BUFFER_HOLD_40` (Rank 21% sampai 40%)**: Selama saham yang sudah dimiliki masih berada di dalam zona buffer dan *drift* bobotnya di bawah batas toleransi, sistem memberikan sinyal **`BUFFER_HOLD`** (tahan posisi untuk menghemat komisi transaksi).
- **`ROTATE_OUT` (Rank > Buffer atau Skor < 5.0)**: Sinyal **`CUT_JUNK_EXIT`** untuk merotasi modal ke kandidat *Top-Decile*.

---

## 4. Dokumentasi Keamanan *Zero-Knowledge Encrypted Vault*

Karena aplikasi dapat di-host secara publik di **GitHub Pages** dan menyimpan *state* di repositori GitHub (`data/nostradamus_cloud_state.json`), seluruh data sensitif portofolio (**daftar saham dimiliki, jumlah lot, harga beli rata-rata, cadangan kas, dan total modal**) dilindungi dengan arsitektur **Zero-Knowledge Client-Side Encryption** di dalam `src/utils/securityVault.ts`.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   ZERO-KNOWLEDGE ENCRYPTED VAULT FLOW                      │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  [Passphrase Pengguna] + [128-bit Random Salt]                             │
│             │                                                              │
│             ▼                                                              │
│   Web Crypto PBKDF2-SHA256 (100,000 Iterations) ──► 512-bit Derived Bits   │
│             │                                                              │
│             ├──────────────────────────────┐                               │
│             ▼ (Bits 0..255)                ▼ (Bits 256..511)               │
│   [256-bit AES-GCM Key]          [256-bit Verifier Raw Bytes]              │
│     (In-Memory Only)                       │                               │
│             │                              ▼ SHA-256 Digest                │
│             ▼                    [verifierHashBase64]                      │
│   AES-256-GCM Encrypt/Decrypt     (Disimpan untuk validasi cepat)          │
│   + 96-bit Random IV                                                       │
│             │                                                              │
│             ▼                                                              │
│   [cipherTextBase64] + [scopeHash (FIPS 180-4 SHA-256)] + [originHash]     │
└────────────────────────────────────────────────────────────────────────────┘
```

### Spesifikasi Kriptografi

1. **Key Derivation (`PBKDF2-SHA256`, 100.000 Iterasi)**
   Sandi (*passphrase*) pengguna tidak pernah disimpan dalam bentuk teks biasa (*plaintext*) di `localStorage` maupun di GitHub. Sistem menurunkan `512 bit` dari sandi dan `128-bit cryptographic salt`:
   - `256 bit` pertama diimpor sebagai kunci `CryptoKey` **AES-256-GCM** (`extractable: false`) yang hanya hidup di memori RAM browser selama sesi terbuka.
   - `256 bit` kedua di-*hash* satu arah menggunakan `SHA-256` menjadi `verifierHashBase64` untuk memvalidasi kebenaran sandi sebelum dekripsi.
2. **Authenticated Encryption (`AES-256-GCM`)**
   Setiap kali portofolio disimpan atau disinkronkan ke cloud, *payload* JSON dienkripsi menggunakan algoritma **AES-256-GCM** dengan *Initialization Vector* (`IV`) acak sepanjang `96-bit (12 byte)` dari `window.crypto.getRandomValues()`.
3. **Cryptographic Scope & Origin Binding (`FIPS 180-4 SHA-256`)**
   Setiap *vault* diikat secara kriptografis menggunakan fungsi hash satu arah `sha256HexSync` terhadap:
   - `scopeHash`: Hash SHA-256 dari identitas repositori aktif.
   - `originHash`: Hash SHA-256 dari domain atau origin browser aktif.
   Dengan demikian, nama domain kustom maupun identitas repositori tidak perlu diekspos secara *plaintext* di dalam metadata kriptografi.
4. **Isolasi Otomatis untuk Repositori Hasil *Fork* (`Default Passphrase: 12345`)**
   - Pemilik repositori utama dapat mengubah sandi melalui tombol **Ubah Sandi** di header terminal, dan *vault* terenkripsi akan mengunci domain serta repositori pemilik tersebut dengan sandi pribadinya.
   - Jika pengguna lain melakukan **Fork** atau menjalankan repositori di domain berbeda, fungsi `isVaultMatchingRepoScope()` mendeteksi ketidakcocokan `scopeHash` atau `originHash` dan secara otomatis mengisolasi *fork* baru tersebut ke brankas kosong dengan **sandi awal bawaan `12345`**. Data portofolio pemilik asli tetap terenkripsi dengan `AES-256-GCM` dan tidak dapat dibuka tanpa sandi pemilik asli.

---

## 5. Panduan Instalasi Lokal & Deployment GitHub Pages

### 5.1. Instalasi & Menjalankan Secara Lokal

Pastikan Anda telah menginstal **Node.js v20+** (direkomendasikan **Node.js v22 LTS**).

```bash
# 1. Clone repositori
git clone https://github.com/<username-anda>/nostradamus.git
cd nostradamus

# 2. Instal seluruh dependensi
npm install

# 3. Salin konfigurasi environment (opsional)
cp .env.example .env

# 4. Jalankan server pengembangan (Express API Proxy + Vite pada port 3000)
npm run dev
```

Akses terminal di browser pada alamat `http://localhost:3000`.
- **Sandi Awal (*Default Passphrase*)**: `12345` (dapat segera diubah melalui menu **Ubah Sandi** di bagian kanan atas terminal).

### Perintah Skrip Penting (`package.json`)

| Perintah | Deskripsi |
| :--- | :--- |
| `npm run dev` | Menjalankan server *full-stack* `server.ts` (Express + Vite middleware) di port `3000`. |
| `node scripts/generate-static-market-bundle.mjs` | Mengambil data terbaru 956+ saham BEI, makro global, dan berita RSS dari Yahoo Finance ke `public/static-market-snapshot.json`. |
| `npm run build` | Membangun *production static bundle* ke direktori `dist/` untuk GitHub Pages. |
| `npm run lint` | Memvalidasi tipe TypeScript (`tsc --noEmit`) tanpa galat. |

---

### 5.2. Konfigurasi GitHub Cloud Sync & GitHub Pages

Agar fitur **Push/Pull Cloud Sync**, **Trigger GitHub Actions**, dan **1-Click Fork Sync** berfungsi penuh dari antarmuka web:

1. **Aktifkan GitHub Pages di Repositori Anda**:
   - Buka repositori Anda di GitHub $\rightarrow$ **Settings** $\rightarrow$ **Pages**.
   - Pada bagian **Build and deployment**, pilih **Source: GitHub Actions**.
2. **Buat Personal Access Token (PAT) GitHub**:
   - Buka **GitHub Settings** $\rightarrow$ **Developer settings** $\rightarrow$ **Personal access tokens**.
   - Jika menggunakan **Fine-Grained PAT** (*direkomendasikan*):
     - Pilih **Repository access**: *Only select repositories* $\rightarrow$ pilih repositori `nostradamus` Anda.
     - Berikan izin **Repository permissions**:
       - `Contents`: **Read and write** (untuk membaca dan menyimpan `data/nostradamus_cloud_state.json`).
       - `Actions`: **Read and write** (untuk memicu pembaruan data pasar *workflow_dispatch*).
       - `Pages`: **Read and write** (opsional, untuk pengelolaan *build* Pages).
   - Jika menggunakan **Tokens (Classic)**:
     - Centang *scope* `repo` dan `workflow`.
3. **Hubungkan di Terminal Nostradamus**:
   - Buka kunci terminal, lalu klik tombol **GitHub Cloud** di *header*.
   - Masukkan **GitHub Username**, **Nama Repository** (`nostradamus`), **Branch** (`main`), dan **Token PAT** Anda, lalu klik **Uji Koneksi** dan **Simpan & Push ke GitHub**.

---

## 6. Struktur Repositori

```text
├── .github/workflows/
│   ├── deploy-pages.yml                 # CI/CD otomatis build & deploy ke GitHub Pages
│   └── sync-idx-market.yml              # Cron job 3x/hari bursa untuk sinkronisasi 956+ saham BEI
├── data/
│   └── nostradamus_cloud_state.json     # State cloud portofolio (Zero-Knowledge AES-256-GCM Vault)
├── public/
│   └── static-market-snapshot.json      # Snapshot publik harga pasar, makro global & sentimen RSS
├── scripts/
│   └── generate-static-market-bundle.mjs# Scraper batch paralel Yahoo Finance v8 & kalkulator metrik
├── src/
│   ├── components/
│   │   ├── ActivePortfolioManager.tsx   # Evaluasi portofolio aktif, sinyal Buffer & rekomendasi
│   │   ├── ArchitectureVault.tsx        # Dokumentasi arsitektur kuantitatif & paket deployment
│   │   ├── BarbellAllocatorCard.tsx     # Simulator & pengatur alokasi Barbell HRP + Lot BEI
│   │   ├── GitHubCloudSyncModal.tsx     # Panel konfigurasi GitHub PAT, Push/Pull & 1-Click Fork Sync
│   │   ├── GlobalMacroPulse.tsx         # Monitor 11 indikator makro global & transmisi IHSG
│   │   ├── MarketNewsSentiment.tsx      # Agregasi berita RSS pasar modal & skor sentimen
│   │   ├── MarketRegimeBanner.tsx       # Visualisasi rezim volatilitas IHSG 30D & kurva historis
│   │   ├── ScreeningTable.tsx           # Tabel screener 956+ emiten BEI dengan filter multifaktor
│   │   ├── SkepticalBacktestLab.tsx     # Walk-forward backtesting dengan simulasi komisi broker
│   │   └── TerminalSecurityGate.tsx     # Layar kunci autentikasi & modal ubah sandi AES-256-GCM
│   ├── data/
│   │   ├── idxAllEmitenCatalog.ts       # Katalog lengkap 956+ emiten BEI, sektor & kalibrasi dividen
│   │   └── staticMarketSnapshot.json    # Fallback snapshot terintegrasi saat build
│   ├── types/
│   │   └── quant.ts                     # Definisi kontrak tipe data TypeScript kuantitatif & vault
│   └── utils/
│       ├── githubCloudSync.ts           # Integrasi GitHub Contents REST API & Fork Upstream Sync
│       ├── liveMarketFetcher.ts         # Multi-tier fetcher Yahoo Finance, makro & parser RSS
│       ├── quantEngine.ts               # Mesin perhitungan DeMiguel 4-Factor, QMJ, BAB & HRP
│       ├── securityVault.ts             # Implementasi Web Crypto PBKDF2, AES-256-GCM & SHA-256 Scope
│       └── zipExporter.ts               # Eksportir paket kode mandiri (.ZIP)
└── server.ts                            # Server Express lokal & proxy API bebas CORS
```

---

## 7. Disclaimer Kuantitatif

Seluruh model matematis, skor faktor (**DeMiguel 4-Factor**, **QMJ**, **BAB**, **HRP**), sinyal *rebalancing*, dan simulasi *backtest* di dalam **Nostradamus Quant Terminal (IHSG)** disediakan murni untuk tujuan **riset kuantitatif, edukasi rekayasa finansial, dan alat bantu analisis sistematis**. Sistem ini bukan merupakan nasihat investasi atau ajakan membeli maupun menjual efek. Keputusan eksekusi transaksi di Bursa Efek Indonesia sepenuhnya menjadi tanggung jawab independen masing-masing investor.
