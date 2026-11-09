# Rencana Implementasi: Pelabelan HSC, Radar Berita/Corporate Action Emiten, & Inspector Fundamental AI (Prinsip Joeliardi Sunendar + OOS Quant)

## 1. Pelabelan Saham HSC & Prioritas Faktor Value pada Top Decile Buy
1. **Deteksi Otomatis Kuantitatif + Tombol Toggle Manual HSC (`isHscFlagged` & `hscReason`)**:
   - **Pre-seeded & Heuristik HSC**: Menandai otomatis saham terindikasi **HSC (High Speculative / Cornered / Konsentrasi Tinggi)** seperti `TRUK`, `ROCK`, dan saham non-institusional yang mengalami lonjakan harga ekstrem atau volatilitas tinggi tanpa dukungan kualitas fundamental (`dmuValueScore` rendah, ROE lemah, tanpa dividen).
   - **Tombol Label Manual HSC (1-Klik)**: Pengguna dapat menandai atau melepas label **HSC** pada emiten mana pun langsung dari tabel Screener maupun panel daftar HSC, tersimpan permanen di `localStorage`.
2. **Pemblokiran HSC ke `ROTATE_OUT` & Peningkatan Bobot Faktor Value**:
   - Saham berlabel HSC otomatis dikunci ke zona **`ROTATE_OUT`** (`AVOID_JUNK`) sehingga tidak pernah masuk ke **Top Decile Buy (≤20%)**, Keranjang 1/2, maupun Rekomendasi Portofolio.
   - Bobot **Faktor Value (`dmuValueScore`)** dinaikkan menjadi komponen utama (**35%**) dengan *Value-Gated Momentum Cap* agar saham spekulatif berfundamental lemah tidak dapat mendominasi peringkat atas.

---

## 2. Radar Berita Spesifik Emiten, Corporate Action & Isu Terkini di Menu Macro & News Wire
1. **Pencarian & Filter Berita Spesifik Emiten (`MarketNewsSentiment.tsx` & `liveMarketFetcher.ts`)**:
   - Menambahkan panel **Radar Emiten & Corporate Action** di menu **Macro & News Wire** di mana pengguna dapat memilih atau mengetik kode saham BEI (misal: `BBCA`, `BMRI`, `ITMG`, `ADRO`, `TRUK`, `ROCK`, dll.).
   - Mengambil berita terbaru spesifik emiten secara *live* (melalui feed RSS Google News Indonesia / CNBC Indonesia / Yahoo Finance berdasarkan kode ticker & nama perusahaan).
2. **Klasifikasi Otomatis Corporate Action & Isu Emiten**:
   - Setiap berita spesifik emiten diklasifikasikan ke dalam tag aksi korporasi & isu krusial:
     - **`DIVIDEN & RUPS`** (pembagian dividen interim/final, cum date, hasil RUPS)
     - **`AKSI KORPORASI / M&A`** (buyback, right issue, private placement, akuisisi, divestasi, obligasi)
     - **`KINERJA KEUANGAN`** (rilis laporan keuangan kuartalan/tahunan, pertumbuhan laba/pendapatan)
     - **`ISU REGULASI / UMA / SUSPENSI`** (peringatan BEI, Unusual Market Activity, gugatan hukum, isu tata kelola/HSC)

---

## 3. Fitur "Inspect Emiten" & Analisis AI Fundamental Terkini di Multifactor Screener
1. **Panel / Modal "Inspect Fundamental & Valuasi Emiten" (`EmitenFundamentalInspectorModal.tsx`)**:
   - Menambahkan tombol **`Inspect`** pada setiap baris emiten di tabel **Multifactor Screener**.
   - Menyajikan bedah indikator fundamental berbasis **Prinsip Bapak Fundamental Indonesia (Joeliardi Sunendar)** yang dipadukan dengan **Out-of-Sample (OOS) Quantitative Cross-Sectional Validation**:
     - **Pilar 1: Kualitas Bisnis & Profitabilitas (Joeliardi Core Quality)**: Evaluasi ROE vs Cost of Equity Indonesia (~10.5%), Operating Margin, konsistensi arus kas, dan status pembagian dividen nyata (`dividendYieldPct`).
     - **Pilar 2: Kesehatan Neraca & Ketahanan Risiko (Prudent Balance Sheet)**: Rasio Utang terhadap Ekuitas (`DER`), *Solvency Stress Check*, serta deteksi bebas indikasi **HSC / Cornered Stock**.
     - **Pilar 3: Valuasi Nilai Intrinsik & Margin of Safety (MoS)**: Estimasi **Harga Wajar (Fair Value Rp)** dan **Implied PER / PBV** menggunakan pendekatan *Joeliardi ROE-Adjusted Graham & Sustainable Earnings/Dividend Valuation*, lengkap dengan persentase **Margin of Safety (%)** dan status valuasi (*Undervalued / Fairly Valued / Overvalued / Speculative Trap*).
     - **Pilar 4: Out-of-Sample (OOS) Quantitative Robustness**: Skor 4-Faktor DeMiguel (Value 35%, Low-Vol 28%, Momentum 22%, Size/Liquidity 15%), persentil lintas-emiten BEI, dan ketahanan drawdown terhadap rezim volatilitas IHSG.
2. **Analisis AI On-Demand Berbasis Request User & Berita Terkini (`/api/ai/inspect-emiten` + Server-Side Gemini API)**:
   - Di dalam jendela **Inspect Emiten**, pengguna dapat menekan tombol **"Jalankan Analisis AI (Fundamental + Berita Terkini)"** serta menuliskan fokus pertanyaan khusus (misal: *"Apakah layak diakumulasi sebelum cum dividen?"* atau *"Bagaimana dampak isu terbaru terhadap kesehatan fundamentalnya?"*).
   - Sistem secara otomatis menarik berita & aksi korporasi terbaru emiten tersebut, lalu mengirimkannya bersama metrik fundamental Joeliardi Sunendar + OOS Quant ke endpoint `/api/ai/inspect-emiten` (`@google/genai` dengan model `gemini-3.8-flash` dan fallback analisis kuantitatif terstruktur saat berjalan di mode statis GitHub Pages).
   - Menghasilkan laporan komprehensif sebelum beli (*Pre-Buy Conviction Report*) yang mencakup:
     1. **Bedah Kesehatan Fundamental (Gaya Joeliardi Sunendar & OOS Quant)**
     2. **Dampak Berita Terkini, Corporate Action & Isu Spesifik Emiten**
     3. **Evaluasi Valuasi, Margin of Safety & Risiko Ekor / HSC**
     4. **Keputusan & Panduan Eksekusi Pra-Beli (Conviction Verdict)**
