# Penyempurnaan UI/UX, Komite AI Bertahap, Ekspor Laporan Ber-Watermark & Simulasi 3 Rezim Pasar — Nostradamus Quant Terminal

Rencana pembaruan terarah untuk menyempurnakan antarmuka, ketajaman analisis Komite Investasi AI, validitas waktu berita emiten, fitur ekspor laporan ber-watermark, serta kontrol simulasi rezim pasar pada **Nostradamus Quant Terminal**.

---

## User Review & Critical Decisions

* **Confirmed Requirements**:
  * **Ekspor Laporan Hasil Inspect Emiten**: Menyediakan **kedua tombol** sekaligus di bilah atas jendela *Fundamental & AI Inspector*, yaitu **Export HD Image (PNG)** dan **Export PDF**, lengkap dengan *watermark* resmi **Nostradamus Quant Terminal**.
  * **Kontrol Simulasi Sentimen Pasar**: Menggunakan **Segmented Button 3 Mode Langsung** (`Tenang`, `Waspada`, `Volatil`) berdampingan dengan tombol kembali ke **`Live Real-Time`** pada *Market Regime Banner*.
  * **Halaman Login Minimalis**: Menghapus *header* dan *footer* penuh pada `TerminalSecurityGate` sehingga layar kunci tampil fokus di tengah layar, dengan tombol pengubah tema (*Daylight/Dark*) ringkas di sudut kartu.
  * **Posisi Tombol Tutup (`X`) & Scrollbar Tema Gelap**: Memisahkan tata letak tombol tutup (`X`) agar selalu terkunci di pojok kanan atas jendela modal (seperti jendela aplikasi desktop standar) dan menyesuaikan warna *scrollbar* modal agar mengikuti tema gelap (`theme-dark`).
  * **Komite AI Tanpa Pengulangan Pertanyaan + Animasi Berpikir & Typing**: Menghapus kalimat pembuka yang mengulang pertanyaan pengguna, serta menambahkan tahapan visualisasi berpikir (*multi-step quantitative synthesis*) yang diikuti efek ketikan bertahap (*typewriter animation*).
  * **Filter Berita Maksimal 3 Bulan (90 Hari)**: Menyaring tanggal publikasi RSS (`pubDate` dan `when:90d`) baik di sisi klien maupun server agar berita yang kadaluarsa (> 90 hari) otomatis tereliminasi.
  * **Tooltip Indikator & Kontras Kotak Pra-Analisis**: Menambahkan `MetricTooltip` pada seluruh metrik di jendela *Emiten Inspector* dan memperbaiki kontras kotak informasi sebelum tombol *Bedah Komite AI* ditekan pada mode gelap.

---

## 1. Overview & Core Concept

Pembaruan ini berfokus pada peningkatan ergonomi terminal kuantitatif dan kredibilitas penyajian data riset emiten:

1. **Ergonomi Jendela & Fokus Visual**: Memastikan halaman *Security Gate* bebas dari distraksi navigasi utama, mengunci tombol tutup (`X`) di sudut kanan atas jendela *Inspector*, menghitamkan *scrollbar* pada mode gelap, serta memperbaiki keterbacaan kotak panduan pra-analisis Komite AI.
2. **Pengalaman Komite Investasi AI yang Hidup & Langsung ke Inti**: Menghilangkan kalimat pengulangan pertanyaan yang kaku dan menghadirkan transisi *Chain-of-Thought Thinking* ke *Progressive Typing Effect* sehingga pengguna merasakan proses sintesis data fundamental, *spread* SBN 10Y, dan berita secara cerdas.
3. **Integritas Data & Portabilitas Riset Institusional**: Memastikan seluruh berita emiten berusia maksimal 3 bulan terakhir ($\le 90\text{ hari}$), melengkapi setiap indikator di modal *Inspector* dengan *tooltip* penjelasan rumus/makna, menyediakan simulasi lengkap 3 rezim pasar (`Tenang`, `Waspada`, `Volatil`), dan memungkinkan ekspor riset ke **HD PNG** maupun **PDF** ber-*watermark*.

---

## 2. User Experience & Visual Design

* **Halaman Login (`TerminalSecurityGate`)**:
  * Hanya menampilkan kartu otentikasi terpusat di tengah layar (`min-h-screen flex items-center justify-center`) tanpa *top header bar* maupun *bottom footer*. Tombol *toggle* tema diletakkan secara elegan di pojok kanan atas kartu login.
* **Header Modal Inspect Emiten & Dark Scrollbar**:
  * Tombol tutup (`X`) diposisikan secara permanen di pojok kanan atas *header* modal (`top-right corner`), terpisah dari baris tombol aksi (`Refresh Emiten`, `Export HD PNG`, `Export PDF`, `Label HSC`) sehingga tidak pernah turun ke baris bawah di sebelah kiri.
  * Kontainer gulir (*scroll container*) modal menggunakan gaya *dark scrollbar* khusus pada `.theme-dark` (latar *track* `#0E1117` dan *thumb* `#2D3545` dengan *hover* `#475569`).
* **Animasi Berpikir & Efek Mengetik Komite AI**:
  * Saat modal dibuka atau tombol **Bedah Komite AI** diklik, sistem menampilkan tahapan berpikir aktif (*"01. Membedah dekomposisi DuPont ROE & ROA murni..."* $\rightarrow$ *"02. Mengukur spread Earnings Yield vs SBN 10Y..."* $\rightarrow$ *"03. Memverifikasi saringan OOS & berita 90 hari terakhir..."*) sebelum merender teks kesimpulan dan poin penalaran dengan animasi *typing* bertahap yang dilengkapi tombol *Skip Animasi* jika pengguna ingin langsung melihat seluruh teks.
* **Kotak Informasi Pra-Analisis (Perbaikan Lampiran 3)**:
  * Mengganti kelas latar `bg-[#FFFFFF]/80` yang sebelumnya luput dari aturan `.theme-dark` menjadi permukaan adaptif ber-kontras tinggi (`bg-[#FAF9F6]` dengan teks `#111315` di mode terang, dan `#161B26` dengan teks `#E2E8F0` di mode gelap) agar terbaca jelas sebelum pengguna menekan tombol **Bedah Komite AI**.
* **Tooltip Indikator Lengkap di Modal Inspector**:
  * Menambahkan ikon informasi dan `MetricTooltip` interaktif pada:
    1. Empat kartu utama: *Harga Pasar Live (BEI)*, *Nilai Intrinsik (Joeliardi-Graham)*, *Margin of Safety (MoS)*, dan *Valuasi Multipel (Implied PER & PBV vs Wajar)*.
    2. Empat skor pilar: *1. Kualitas Bisnis & Moat*, *2. Kesehatan Neraca*, *3. Keamanan Valuasi*, dan *4. Ketahanan OOS Quant*.
    3. Empat metrik *strip* Komite AI: *ROA Murni (DuPont)*, *Earnings Yield vs SBN 10Y*, *Total Shareholder Yield*, dan *Spread Nilai Intrinsik*.
* **Segmented Control Simulasi 3 Rezim Pasar**:
  * Pada `MarketRegimeBanner`, tombol simulasi tunggal diganti dengan kontrol bersegmen 4 status: **`Live Real-Time`**, **`Simulasi: Tenang`**, **`Simulasi: Waspada`**, dan **`Simulasi: Volatil`**, lengkap dengan warna aksen semantik (Hijau *Emerald* untuk Tenang, Kuning *Amber* untuk Waspada, Merah *Rose* untuk Volatil).

---

## 3. Key Product Decisions & Trade-Offs

* **Render Ekspor HD Image (PNG) & PDF Ber-Watermark Secara Native di Klien**:
  * *Keputusan*: Membangun mesin *renderer* kanvas resolusi tinggi (`2x Retina scale` via HTML5 Canvas 2D + pembungkus PDF vektor/raster presisi) yang menggambar seluruh metrik fundamental emiten, 4 pilar Joeliardi, dekomposisi DuPont, kesimpulan Komite AI, serta *watermark* diagonal dan *footer* resmi **Nostradamus Quant Terminal**.
  * *Alasan*: Menghindari masalah pemotongan area gulir (*scroll clipping*) pada modal panjang, menjamin kecepatan ekspor instan tanpa ketergantungan *headless browser* eksternal, serta menghasilkan tata letak laporan riset institusional yang rapi dan siap dibagikan.
* **Validasi Ganda Kesegaran Berita ($\le 90\text{ Hari}$)**:
  * *Keputusan*: Menambahkan parameter pencarian `when:90d` pada kueri Google News RSS sekaligus menerapkan fungsi validator tanggal `isWithinThreeMonths(pubDate)` yang membuang artikel dengan usia $> 90\text{ hari}$ dari tanggal saat ini, serta memperbarui *timestamp* item radar aksi korporasi agar mencerminkan periode kuartal berjalan.
  * *Alasan*: Menjamin tidak ada berita usang dari tahun-tahun sebelumnya yang masuk ke *Radar Berita & Isu Spesifik Emiten*.

---

## 4. Technical Architecture & Data Strategy

```
+-----------------------------------------------------------------------------------+
|                           NOSTRADAMUS QUANT TERMINAL                              |
+-----------------------------------------------------------------------------------+
         |                                  |                                 |
         v                                  v                                 v
+------------------------+     +----------------------------+    +--------------------------+
|  Market Regime Engine  |     | Emiten Inspector & AI Flow |    | HD PNG & PDF Exporter    |
|------------------------|     |----------------------------|    |--------------------------|
| Mode:                  |     | 1. 90-Day News Filter      |    | - High-DPI Canvas (2x)   |
| - LIVE (Actual Market) |     |    (when:90d + Date Check) |    | - Diagonal & Header/     |
| - TENANG (Vol ~11.5%)  |     | 2. Strip Question Prefix   |    |   Footer Watermark:      |
| - WASPADA (Vol ~16.8%) |     |    (Direct Causal Summary) |    |   "NOSTRADAMUS QUANT     |
| - VOLATIL (Vol ~34.5%) |     | 3. Staged Thinking Stepper |    |    TERMINAL"             |
|                        |     |    + Progressive Typing    |    | - Direct PNG Download    |
| Dynamically updates    |     | 4. MetricTooltip on all    |    | - Multi-Section A4 PDF   |
| Equity/SBN/Cash split  |     |    12 Inspector Indicators |    |   Generator              |
+------------------------+     +----------------------------+    +--------------------------+
```

1. **State Rezim Pasar (`SimRegimeMode`)**:
   * Mengubah *state* boolean `isCalmSim` menjadi tipe terstruktur `'LIVE' | 'TENANG' | 'WASPADA' | 'VOLATIL'`.
   * Menambahkan profil kalibrasi `CAUTION_GLOBAL_MACRO` dan `CAUTION_IHSG_30D_RETURNS` pada mesin kuantitatif sehingga mode `WASPADA` menghasilkan volatilitas IHSG di rentang moderat ($\sim 16{,}8\%$, di atas ambang tenang $14{,}2\%$ namun di bawah batas krisis) dengan alokasi ekuitas berimbang.
2. **Pembersihan Kalimat Pengulangan & Mesin Animasi Ketikan**:
   * Menghapus awalan `"Keputusan Komite atas pertanyaan Anda (...):"` dan `"Menjawab fokus Anda (...):"` baik pada *engine* analitis lokal maupun instruksi *prompt* server Gemini, serta menambahkan pembersih *regex* otomatis agar `directAnswerSummary` langsung menampilkan substansi analisis.
   * Mengimplementasikan *hook/state* animasi berpikir multi-tahap (`thinkingStageIndex`) dan *progressive text reveal* (`typedCharCount`) yang berjalan mulus saat analisis dimuat.
3. **Filter Tanggal Berita Maksimal 3 Bulan (`90 Hari`)**:
   * Pada `server.ts` dan `liveMarketFetcher.ts`, kueri RSS dilengkapi `when:90d` dan setiap item diuji selisih waktunya (`Date.now() - Date.parse(pubDate) <= 90 * 24 * 60 * 60 * 1000`). Selain itu, judul/ringkasan diperiksa agar tidak memuat referensi tahun lampau yang sudah kadaluarsa.
