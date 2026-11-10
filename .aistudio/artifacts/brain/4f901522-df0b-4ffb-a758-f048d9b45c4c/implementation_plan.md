# Rencana Implementasi: Perbaikan Sinkronisasi Live `IDX Composite (^JKSE)` & Pembaruan Matriks Ekspor PNG/PDF

## 1. Gambaran Umum & Tujuan Utama
Rencana ini mencakup dua perbaikan krusial agar seluruh terminal dan dokumen ekspor bekerja secara akurat dan konsisten:
1. **Perbaikan Kartu `IDX Composite (^JKSE)` & Volatilitas 30D yang Stagnan (`5.073,77` / `+0.46%`)**: Memperbaiki jalur sinkronisasi harga indeks `^JKSE`, imbal hasil 30 hari, serta perhitungan *Market Regime* agar tombol **SYNC SEMUA LIVE**, tombol *refresh* pada kartu `^JKSE`, dan sinkronisasi **GitHub Cloud (`feynmanwyckoff-cmyk/nostradamus`)** selalu memperbarui harga IHSG dan volatilitas realisasi ke data pasar terbaru tanpa tertimpa *snapshot* statis lama.
2. **Sinkronisasi Matriks Kuantitatif Baru & Narasi Komite AI pada Ekspor PNG/PDF**: Memperbarui mesin perender kanvas ekspor (`PNG 2x Retina` & `PDF A4 Landscape`) serta generator narasi *Chain-of-Thought* Komite Investasi AI agar 100% selaras dengan 5 pilar kuantitatif akademik terbaru pada tampilan aplikasi.

---

## 2. Diagnosis Akar Masalah & Solusi: Kartu `IDX Composite (^JKSE)` Stagnan

### Akar Masalah Mengapa `^JKSE` Tertahan di `5.073,77 (+0.46%)`
Berdasarkan audit alur data dan tangkapan layar terminal:
1. **Penimpaan oleh Snapshot Statis Lama saat Relay CORS Publik Timeout**:
   - Berkas bundel statis bawaan menyimpan data `^JKSE` lama (`lastPrice: 5073.77`, `change1D: +0.46%`, `Daily σ: 2.812%`, `Realized 30D Volatility: 44.64%`).
   - Saat dijalankan di GitHub Pages (tanpa server lokal), pemanggil batch Yahoo Spark mengisi nilai awal dengan *snapshot* statis (`5073.77`), lalu mencoba memanggil *proxy* CORS publik (`allorigins` / `codetabs`). Karena karakter *caret* (`^JKSE` / `%5EJKSE`) sering terkena *Cloudflare Timeout 522* pada *relay* publik, fungsi *fallback* mengembalikan objek kosong sehingga nilai lama `5073.77` dari *snapshot* statis justru dipakai untuk menimpa *state* `liveIhsgQuote` dan `regime`.
2. **State `regime` Tidak Dihitung Ulang saat Pull dari GitHub Cloud**:
   - Ketika menarik data terbaru dari repositori GitHub (`nostradamus_cloud_state.json` yang sebenarnya sudah memiliki kuotasi IHSG lebih baru), fungsi *pull* memperbarui `liveIhsgQuote`, tetapi **tidak memanggil pembaruan `regime`** (`computeMarketRegime(...)`) dan tidak menyinkronkan `liveIhsgReturns`. Karena kartu `IDX Composite (^JKSE)` dan `Realized 30D Volatility` merender nilai dari objek `regime`, angka di layar tetap membeku di `5.073,77 (+0.46%)`.
3. **Closure State Lama saat Auto-Push ke GitHub Cloud**:
   - Seusai `SYNC SEMUA LIVE`, fungsi pembuat bundel *cloud* membaca variabel `liveIhsgQuote` dan `liveIhsgReturns` dari *closure render* React sebelum *state* baru selesai di-*commit*, sehingga nilai lama `5073.77` ikut terdorong kembali ke repositori GitHub.
4. **Tombol Ikon Refresh Hijau pada Kartu `IDX Composite (^JKSE)` Belum Terhubung ke Handler Refresh Indeks**:
   - Ikon *refresh* di sudut kanan atas kartu `IDX Composite (^JKSE)` belum memicu pembaruan instan kuotasi indeks dan rezim volatilitas.

### Solusi Arsitektur Sinkronisasi `^JKSE` & Market Regime
- **Perlindungan Anti-Downgrade Kuotasi Indeks**: Saat melakukan `SYNC SEMUA LIVE`, jika *relay* CORS browser gagal menjangkau `^JKSE`, sistem tidak boleh menimpa kuotasi `^JKSE` yang sudah lebih baru di memori atau di *cloud state* GitHub dengan angka *snapshot* statis lama (`5073.77`).
- **Integrasi Fallback GitHub Cloud State & Relay Tambahan**: Menambahkan pembacaan langsung `nostradamus_cloud_state.json` dari repositori GitHub pengguna/upstream serta memperluas jalur *relay* untuk simbol berawalan `^` (`^JKSE`, `^VIX`, `^TNX`, `^GSPC`, `^HSI`) agar pengambilan kuotasi indeks di GitHub Pages tetap berhasil meskipun salah satu *proxy* publik mengalami gangguan.
- **Re-komputasi Rezim Otomatis pada GitHub Pull & Master Sync**:
  - Memastikan setiap proses *Pull from GitHub* langsung memperbarui `liveIhsgQuote`, `liveIhsgReturns`, `macroIndicators`, dan memanggil `setRegime(computeMarketRegime(...))` secara sinkron.
  - Memperbarui fungsi pembuat bundel GitHub Cloud agar menerima parameter eksplisit (`activeQuote`, `activeRets`, `updatedMacro`) hasil *sync* terbaru, mencegah pengiriman *closure state* basi ke GitHub.
- **Aktivasi Tombol Refresh Cepat pada Kartu `IDX Composite (^JKSE)`**: Menghubungkan tombol ikon *refresh* hijau di kartu `^JKSE` agar pengguna dapat menyegarkan kuotasi IHSG, volatilitas 30D, dan status sentimen pasar kapan saja dengan satu klik.
- **Pembaruan Bundel Snapshot Pasar Terkini**: Menjalankan pembaruan *snapshot* pasar statis dan menyertakannya ke dalam sinkronisasi GitHub Pages agar data dasar `^JKSE` dan seluruh emiten BEI langsung memuat kuotasi live terbaru.

---

## 3. Arsitektur Alur Data & Perenderan Ekspor Matriks Baru

```
+-----------------------------------------------------------------------------------+
|                        TERMINAL & CLOUD SYNC PIPELINE                             |
|                                                                                   |
|  [Yahoo Live / Express API / Multi-Relay CORS / GitHub Cloud State JSON]          |
|         │                                                                         |
|         ▼                                                                         |
|  [Anti-Downgrade Guard: Cegah Snapshot Lama 5.073,77 Menimpa Kuotasi Baru]        |
|         │                                                                         |
|         ├──► Update liveIhsgQuote + liveIhsgReturns + macroIndicators             |
|         ├──► Recompute computeMarketRegime() ──► Kartu IDX Composite (^JKSE) Live |
|         └──► Explicit Cloud Bundle Override  ──► Push Akurat ke GitHub Repo       |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                     ENGINE KUANTITATIF & KOMITE AI (5 PILAR)                      |
|                                                                                   |
|  • Novy-Marx Gross Profitability (GP/A) & DuPont Decomposition                    |
|  • AQR Anti-Junk QMJ Accrual Ratio (OCF / Net Income)                             |
|  • Kurva Spot SBN (1Y / 5Y / 10Y) & Dynamic Cost of Equity (Ke Fabozzi)           |
|  • Damodaran Justified PBV = (ROE - g) / (Ke - g) & Fair PER                      |
|  • Qian / Taleb 1/β Inverse-Beta Barbell Position Sizing & Max Cap (%)            |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                LAPORAN EKSPOR 1 HALAMAN RINGKAS (PNG 2x & PDF A4)                 |
|                                                                                   |
|  [Header]      Kicker Matriks Akademik Baru + Harga Live, Target, Upside, Skor    |
|  [Baris 1]     4 Kartu Valuasi (Termasuk Justified PBV & PER Damodaran + Ke)      |
|  [Baris 2]     4 Pilar Skor (GP/A & Anti-Junk, Neraca, Justified PBV, 1/β Sizing) |
|  [Baris 3]     4 Strip Akademik (GP/A, Kurva SBN 1Y/5Y/10Y, OCF/NI, Sizing 1/β)   |
|  [Panel Kiri]  Verdict AI + 4 Tahap Chain-of-Thought + 4 Kotak Eksekusi 1/β       |
|  [Panel Kanan] Top 4 Berita & Sentimen Live Emiten                                |
+-----------------------------------------------------------------------------------+
```

---

## 4. Spesifikasi Pembaruan Matriks pada Ekspor PNG & PDF

Tata letak kanvas ekspor tetap mempertahankan **format ringkas satu halaman beresolusi tinggi (1600px @ 2x Retina untuk PNG dan A4 Landscape untuk PDF)** dengan pembaruan penuh pada seluruh sel matriks:

### A. Header Laporan & Baris 1 (4 Kartu Valuasi Inti)
- **Sub-header Kicker**: Diperbarui menjadi `DEEP FUNDAMENTAL INSPECTOR · GP/A · SBN CURVE KE · ANTI-JUNK OCF/NI · JUSTIFIED PBV · 1/β BARBELL`.
- **Kartu 1–3**: Tetap menampilkan **Nilai Intrinsik (Graham & DCF)**, **Batas Beli Aman (MoS 20%–30%)**, dan **Target Harga Wajar (12M)** beserta persentase *upside/downside*.
- **Kartu 4 (`JUSTIFIED PBV & PER (DAMODARAN)`)**: Menggantikan kartu valuasi multipel lama dengan:
  - Nilai utama: `PBV {impliedPbv}x (Justified {damodaranJustifiedPbv}x)`
  - Sub-label: `PER {impliedPer}x (Wajar {joeliardiFairPer}x · Ke {dynamicCostOfEquityPct}%)`

### B. Baris 2: 4 Kartu Pilar Skor Fundamental (Skor 0–100)
1. **Pilar 1 — `1. Gross Profit & Anti-Junk`**:
   - `GP/A (Novy-Marx): {gpa}% · ROE: {roe}%`
   - `OCF/NI (Accrual): {ocfToNetIncome}x ({accrualLabel})`
   - `Fwd Div Yield: {dividendYield}% (Payout {payoutRatio}%)`
2. **Pilar 2 — `2. Kesehatan Neraca`**:
   - `DER: {der}x (Net {netGear}x)` (atau `CASA & Likuiditas` untuk Perbankan)
   - `Altman Z: {altmanZ} · Piotroski F: {piotroskiF}/9`
   - `Beneish M-Score: {beneishM} ({status Manipulator / Non-Manipulator})`
3. **Pilar 3 — `3. Justified PBV & Kurva SBN`**:
   - `PBV: {impliedPbv}x vs Justified {damodaranJustifiedPbv}x`
   - `Spot SBN Blended: {sbnSpotBlendedPct}% → Ke: {dynamicCostOfEquityPct}%`
   - `Margin of Safety: {marginOfSafetyPct}%`
4. **Pilar 4 — `4. 1/β Barbell Position Sizing`**:
   - `Komposit: {compositeScore}/100 ({confidenceLabel})`
   - `Propensitas 1/β: {inverseBetaWeight}x (Beta {beta})`
   - `Batas Alokasi Maks: ≤{maxPortfolioWeightCapPct}% Portofolio`

### C. Baris 3: 4 Strip Kuantitatif Akademik
Menggantikan strip DuPont lama dengan 4 kotak metrik akademik baru:
1. **`GP/A (NOVY-MARX) & DUPONT`**: Menampilkan `{gpa}%` dengan sub-baris `Margin {netMargin}% × Turnover {assetTurnover}x · ROE {roe}%`.
2. **`KURVA SPOT SBN (1Y/5Y/10Y) & KE`**: Menampilkan `Ke {dynamicCostOfEquityPct}%` (hijau jika `EY >= Ke`, merah jika di bawah) dengan sub-baris `SBN 1Y {1Y}% · 5Y {5Y}% · 10Y {10Y}%`.
3. **`ANTI-JUNK (QMJ ACCRUAL)`**: Menampilkan `OCF/NI {ocfToNetIncome}x` dengan lencana kualitas kas (`KAS SOLID (ANTI-JUNK)`, `AKRUAL WAJAR`, atau `RAWAN AKRUAL / JUNK`).
4. **`JUSTIFIED PBV & SIZING 1/β`**: Menampilkan `Justified {damodaranJustifiedPbv}x` dengan sub-baris `Implied {impliedPbv}x · Propensitas 1/β: {inverseBetaWeight}x (Cap ≤{maxPortfolioWeightCapPct}%)`.

### D. Panel Kiri Bawah: Sinkronisasi Narasi Komite AI & 4 Tahap Chain-of-Thought
- **Pembaruan 4 Tahap Chain-of-Thought (Server, Fallback Deterministik, & Kanvas Ekspor)**:
  1. `1. Audit Profitabilitas Kas (GP/A Novy-Marx & QMJ Accrual OCF/NI)`
  2. `2. Audit Ketahanan Neraca, Likuiditas & Risiko Manipulasi Akuntansi`
  3. `3. Audit Valuasi Intrinsik, Kurva Spot SBN (1Y/5Y/10Y) & Justified PBV`
  4. `4. Sintesis Kuantitatif OOS, Rezim Volatilitas & 1/β Barbell Sizing`
- **Sinkronisasi Angka Alokasi**: Kotak **Alokasi Portofolio** pada kartu strategi eksekusi dan narasi AI menggunakan plafon dinamis `1/β Barbell Sizing (Maks ≤{maxPortfolioWeightCapPct}% Portofolio, Beta {beta}x)` serta menyorot kata kunci metrik baru (`GP/A`, `OCF/NI`, `Justified PBV`, `Kurva Spot SBN`, `Ke`, `Propensitas 1/β`) pada perender teks kaya (*rich-text*) di kanvas ekspor.

---

## 5. Verifikasi & Kriteria Keberhasilan
1. **Uji Sinkronisasi Live `^JKSE`**: Menjalankan pembaruan data pasar dan memverifikasi bahwa kartu `IDX Composite (^JKSE)` serta `Realized 30D Volatility` langsung berubah dari angka statis lama `5.073,77 (+0.46%)` ke kuotasi *live* terbaru, baik saat menekan **SYNC SEMUA LIVE**, tombol *refresh* pada kartu `^JKSE`, maupun saat *Pull/Push* GitHub Cloud.
2. **Uji Konsistensi Ekspor PNG & PDF**: Memastikan gambar PNG dan dokumen PDF yang diunduh menampilkan 4 kartu valuasi, 4 pilar skor, 4 strip akademik, dan narasi Komite AI yang 100% identik dengan modal inspektor tanpa teks terpotong.
3. **Verifikasi Build & Lint**: Memastikan kompilasi TypeScript, *linter*, dan bundel statis berjalan bersih tanpa *error*.
