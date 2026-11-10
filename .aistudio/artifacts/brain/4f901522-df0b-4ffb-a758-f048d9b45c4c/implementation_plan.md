# Rencana Implementasi (Revisi): Smart Live Sync Anti-Block, Perbaikan Login Gate Saat Refresh, Tata Letak Screener, & 3 Upgrade Kuantitatif Akademis

## 1. Arsitektur Smart Tiered Live Sync: Aktual Sesuai Yahoo Finance, Super Ringan, & Anti-Block

### Akar Masalah Sebelumnya
1. **Bias `chartPreviousClose` pada Perhitungan `%1D` (`server.ts`, `liveMarketFetcher.ts`, & `generate-static-market-bundle.mjs`)**:
   - Pada endpoint Yahoo Finance `/v8/finance/spark?range=3mo&interval=1d`, properti `chartPreviousClose` adalah harga penutupan **3 bulan lalu** (awal periode chart), bukan harga penutupan kemarin (`closes[closes.length - 2]`). Selain itu, saat bursa sedang buka (*intraday*), perlu pengecekan tanggal/timestamp candle terakhir agar harga live hari ini dibandingkan secara presisi terhadap penutupan hari bursa sebelumnya.
2. **Saham `.JK` Tidak Ikut Diperbarui Saat Klik "SYNC SEMUA LIVE"**:
   - Sebelumnya, `refreshLiveGlobalMacroAndIhsg` memfilter keluar semua simbol `.JK` (`!sym.endsWith('.JK')`), sehingga harga saham di Portofolio, Keranjang 1 & 2, dan baris teratas Screener tidak berubah saat tombol **SYNC SEMUA LIVE** diklik.

### Solusi: Arsitektur *3-Tier Smart Hybrid Sync* (Aman dari Rate-Limit / Blokir Yahoo & Cepat < 1,5 Detik)
Agar sistem **tidak berat** dan **tidak pernah diblokir oleh Yahoo Finance** (tanpa mem-fetch 957 saham satu per satu dari browser), kita menerapkan mekanisme **Smart Tiered Batching**:
- **Tier 1 — Priority Batch Sync Saat Klik "SYNC SEMUA LIVE" (Hanya 3 Request Batch Paralel)**:
  - **Request 1 (Presisi Indeks & Makro)**: Menarik kuotasi live `^JKSE` (IHSG) via endpoint chart harian/intraday untuk mendapatkan `regularMarketPrice` dan `previousClose` yang 100% identik dengan halaman utama Yahoo Finance, bersama 8 indikator makro global (`IDR=X`, `^TNX`, `^VIX`, `GC=F`, `BZ=F`, dll.).
  - **Request 2 & 3 (Priority Equity Batch — Maks 40–50 Saham Utama dalam 2 Chunk Spark)**: Menggabungkan seluruh saham yang ada di **Portofolio Aktif pengguna**, **Kandidat Keranjang 1 & Keranjang 2**, serta **Top 30–35 Saham Likuid Teratas di Screener** ke dalam 2 request batch `/v8/finance/spark` (20 simbol per request). Hanya butuh ~1 detik dan sangat aman dari batas *rate-limit*.
  - **Sinkronisasi Snapshot Latar Belakang**: Menarik `static-market-snapshot.json` terbaru dari GitHub API/Server (yang diperbarui secara periodik oleh GitHub Actions di sisi server) untuk memperbarui ratusan saham JCI lainnya tanpa membebani jaringan browser pengguna.
- **Tier 2 — On-Demand Micro-Sync pada Pencarian & Tombol Inspect**:
  - Ketika pengguna mengetik kode saham di kolom pencarian Screener, mengklik ikon *refresh* pada baris saham, atau membuka modal **Inspect**, sistem otomatis menarik harga *real-time* terbaru untuk saham tersebut.
- **Tier 3 — In-Memory TTL Cooldown Cache (60 Detik)**:
  - Menyimpan hasil kuotasi live di memori selama 60 detik per ticker sehingga klik berulang atau perpindahan tab tidak memicu request ganda ke Yahoo Finance.

---

## 2. Perbaikan Bug Login Gate (`TerminalSecurityGate`) yang Kadang Terlewati Saat Refresh

### Akar Masalah
1. **Auto-Submit oleh Password Manager / Browser Autofill**:
   - Pada `TerminalSecurityGate.tsx`, penggunaan `<form>` standar dengan `<input type="password" autoComplete="current-password" autoFocus />` membuat ekstensi *password manager* atau fitur *auto-login* browser kadang langsung mengisi sandi (`12345` atau sandi tersimpan) dan men-trigger `submit` otomatis dalam hitungan milidetik saat halaman di-refresh.
2. **Restorasi State dari Browser Back-Forward Cache (BFCache)**:
   - Saat melakukan refresh cepat di beberapa browser modern, state memori halaman sebelumnya dapat dipulihkan dari BFCache jika tidak ada listener `pageshow` / `beforeunload`.
3. **Konsistensi Path Bundle `index.html` vs `docs/index.html`**:
   - Pada `githubCloudSync.ts`, sinkronisasi berkas `docs/index.html` ke root `index.html` berisiko menimpa path `./docs/assets/app.js` menjadi `./assets/app.js`.

### Solusi yang Akan Diterapkan
- **Proteksi Interaksi Manusia Asli (`Human Interaction Guard`) di `TerminalSecurityGate.tsx`**:
  - Memblokir eksekusi *unlock* otomatis jika belum ada interaksi ketikan keyboard (`onKeyDown`) atau klik mouse/sentuhan (`onPointerDown` dengan `event.isTrusted === true`) langsung dari pengguna setelah halaman selesai dimuat.
  - Mengubah atribut input sandi (`autoComplete="off"` dan penanganan form non-autofill) agar ekstensi browser tidak dapat melakukan *silent auto-submit* saat refresh.
- **Reset Paksa pada Event `pageshow` & `beforeunload` di `App.tsx`**:
  - Menambahkan listener `window.addEventListener('pageshow', ...)` yang secara eksplisit mengunci kembali terminal (`setIsTerminalUnlocked(false)` dan `setVaultSession(null)`) setiap kali halaman dimuat ulang atau dipulihkan dari cache browser.
- **Isolasi Path `index.html` Root vs `docs/index.html` & Meta No-Cache**:
  - Memastikan `index.html` dan `docs/index.html` memiliki tag `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />` serta menjaga path bundle masing-masing tetap konsisten.

---

## 3. Tata Letak Baru Tabel Screener (`02. Multifactor Screener`)

- **Bar Pencarian & Dropdown Filter Tepat di Atas Header Tabel**:
  - Memindahkan kolom pencarian (`Cari saham atau sektor...`) dan ke-4 dropdown filter (`Semua Status`, `Semua 11 Sektor BEI`, `Semua Zona Buffer`, dan jumlah emiten per halaman) agar berada **tepat di atas header tabel (`<thead>`)**, yakni di bawah kotak *Filter & Label Saham HSC* serta *Perbandingan Multi-Saham*.
- **Pagination Standar di Bawah Tabel (Footer Tabel)**:
  - Memindahkan tombol navigasi halaman (`< Hal 1/10 >`, tombol *First/Prev/Next/Last*, informasi rentang baris `Menampilkan 1–100 dari 957 emiten`, dan pemilih ukuran halaman) ke **bagian bawah tabel** sebagai footer tabel standar.

---

## 4. Upgrade Mesin Kuantitatif Berbasis 3 Pilar Akademis

### Upgrade 1: Filter Kualitas — Gross Profitability (`GP/A`) & Penalti Akrual Anti-Junk
*Landasan: Novy-Marx (2013) & Asness, Frazzini, Pedersen — AQR QMJ (2019)*
- **Metrik Baru pada `StockMetrics`**:
  - `grossProfitabilityToAssets` (**GP/A** = `Laba Kotor / Total Aset` dalam %) dan `accrualRatioToAssets` (**Akrual** = `(Laba Bersih - Arus Kas Operasi) / Total Aset` dalam %) serta indikator arus kas operasi (`ocfToNetIncomeRatio`).
- **Formula Kualitas & Penalti Pengurang Skor (Tanpa Blokir Otomatis)**:
  - Mengalihkan komponen kualitas utama dari Operating Margin/ROE mentah ke **Gross Profitability to Assets (GP/A)**.
  - Sesuai pilihan Anda, emiten yang mencetak Laba Bersih positif namun Arus Kas Operasi (OCF) negatif atau memiliki akrual tinggi **tidak diblokir otomatis**, melainkan dikenakan **penalti pengurang skor kualitas & Value secara terukur** (mengurangi `dmuValueScore`, `qmjScore`, dan `businessQualityScore`) untuk mencegah *value trap*.

### Upgrade 2: Valuasi Masa Depan — Justified PBV & Kurva Spot Rate SBN (1Y, 5Y, 10Y)
*Landasan: Damodaran (2012) & Fabozzi (2012)*
- **Bobot Kombinasi Spot Rate SBN 1Y, 5Y, dan 10Y (`computeDynamicSbnSpotCurveRate`)**:
  - Menghitung tingkat bebas risiko spot efektif ($R_{f,\text{spot}}$) dari kurva imbal hasil obligasi pemerintah Indonesia tenor **SBN 1Y (jangka pendek), SBN 5Y (menengah), dan SBN 10Y (jangka panjang)** yang dikalibrasi dengan tekanan makro (`^TNX` & `IDR=X`) sesuai durasi arus kas ekuitas.
  - Menghitung **Cost of Equity ($K_e$) Dinamis**: $K_e = R_{f,\text{spot}} + \beta \cdot \text{ERP}$.
- **Nilai Intrinsik Berbasis Justified PBV**:
  - Menggunakan rumus Damodaran:
    $$\text{Justified PBV} = \frac{\text{ROE}_{\text{sustainable}} - g}{K_e - g}$$
  - Menghitung `intrinsicValueIdr = roundToIdxTick(estimatedBvpsIdr * justifiedPbv)` dan memperbarui tampilan rincian kurva SBN 1Y/5Y/10Y, $K_e$, $g$, dan Justified PBV pada modal **Inspect Fundamental**.

### Upgrade 3: Eksekusi Keranjang — Beta-Weighted Position Sizing ($1/\beta$ Barbell)
*Landasan: Qian (2005) & Taleb (2012)*
- **Bobot Proporsional $1/\beta$ untuk Semua Saham Lolos Kualitas dengan Batas Maksimum**:
  - Menghapus blokir kaku berbasis batas Beta/volatilitas pada saham yang lolos seleksi kualitas fundamental.
  - Seluruh kandidat di Keranjang 1 dan Keranjang 2 diberi bobot posisi proporsional terhadap **Inverse Beta ($1/\beta_i$)** yang dikalibrasi dengan skor kualitasnya:
    $$w_i \propto \frac{\text{QualityScore}_i}{\max(0.35, \beta_i)}$$
  - Menerapkan **batas alokasi maksimum per saham (Max Position Cap)** dan batas likuiditas 5% ADTV 20D, sehingga saham ber-Beta tinggi otomatis mendapat porsi terukur yang lebih kecil (menangkap *asymmetric upside* ala Barbell Taleb tanpa risiko kehancuran portofolio), sementara saham ber-Beta rendah memegang bobot jangkar utama.
