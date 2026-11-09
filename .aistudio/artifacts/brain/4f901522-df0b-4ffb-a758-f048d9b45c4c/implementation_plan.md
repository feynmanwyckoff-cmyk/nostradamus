# Rencana Implementasi: Optimasi Lazy-Load Inspect & Redesign Komite Investasi AI

## 1. Ringkasan Masalah & Tujuan Utama
Berdasarkan evaluasi terhadap perilaku aplikasi saat ini dan umpan balik Anda:
1. **Beban Jaringan Berat Saat Login / Sync (`app.js` Batch Proxy Loop)**:
   - Saat ini, pemanggilan `fetchYahooSparkBatch` masih memicu antrean request ke berbagai CORS proxy publik (`api.allorigins.win`, `api.codetabs.com`) untuk ratusan saham sekaligus ketika sinkronisasi dijalankan, sehingga membebani tab Network dan memperlambat respons awal.
   - Selain itu, bundle statis di `docs/assets/app.js` (yang digunakan oleh GitHub Pages) perlu diperbarui dan disinkronkan agar repositori hasil fork (`feynmanwyckoff-cmyk/nostradamus`) tidak lagi menjalankan kode lama (`Syncing 571/957`).
2. **Tombol `Inspect` Harus Selalu Aktif & Menarik Data Emiten Secara *Lazy / On-Demand***:
   - Saat pengguna login atau menekan tombol **Sync**, aplikasi **hanya** akan menarik data **IHSG (`^JKSE`), Indikator Makro Global, dan RSS Berita Pasar Umum**.
   - Tombol **Inspect** pada seluruh tab tidak boleh pernah dimatikan (*disabled*). Saat tombol **Inspect** diklik pada suatu saham, barulah aplikasi menarik data harga live terbaru (`.JK`), imbal hasil dividen, berita spesifik emiten, dan analisis AI secara instan untuk saham tersebut.
3. **Peningkatan Kedalaman Penalaran AI & Tampilan *Structured Investment Committee Cards***:
   - Tampilan analisis AI di dalam modal Inspect saat ini masih berupa blok teks bernomor dengan tanda bintang markdown mentah (`**...**`) yang tampak kaku seperti *template*.
   - Akan dirombak menjadi antarmuka **Komite Investasi Terstruktur (*Structured Investment Committee Cards*)** dengan penalaran finansial mendalam (*deep causal reasoning*) yang menghubungkan kualitas laba (dekomposisi ROE DuPont & prinsip Joeliardi Sunendar), pendeteksian *Value Trap* vs diskon intrinsik, dampak katalis berita terkini, serta rencana eksekusi taktis (*Bull/Bear Case, Entry Zone, Sizing, & Invalidation Risk*).

---

## 2. Arsitektur Perubahan Teknis

### A. Optimasi Sinkronisasi Ringan (IHSG & Makro Saja Saat Sync, Emiten Saat Klik Inspect)
- **File Target**: `/src/App.tsx`, `/src/utils/liveMarketFetcher.ts`, `/src/components/ScreeningTable.tsx`, `/src/components/BarbellAllocatorCard.tsx`, `/src/components/ActivePortfolioManager.tsx`
- **Perubahan Spesifik**:
  1. **Zero Batch Emiten Fetch pada Login & Master Sync**:
     - Memastikan `handleMasterSyncAll` di `/src/App.tsx` hanya memanggil sinkronisasi **IHSG (`^JKSE`) + 10 Indikator Makro Global** (`refreshLiveGlobalMacroAndIhsg`) dan **Berita Pasar (`fetchLiveMarketNewsAndSentiment`)**, selesai dalam `< 1.5 detik` tanpa memicu loop ratusan saham ke CORS proxy.
     - Menonaktifkan pemanggilan jaringan massal di `fetchYahooSparkBatch` saat inisialisasi atau reset katalog JCI; data dasar 957 saham langsung dimuat secara instan (0ms) dari *snapshot* terkurasi (`public/static-market-snapshot.json` & katalog sektor BEI).
  2. **On-Demand Emiten Sync Saat Klik `Inspect`**:
     - Memastikan seluruh tombol **Inspect** di `BarbellAllocatorCard`, `ScreeningTable` (baik di tabel utama maupun matriks komparasi), `ActivePortfolioManager`, dan `MarketNewsSentiment` selalu aktif (`disabled={false}`).
     - Ketika pengguna mengklik **Inspect** pada emiten mana pun, `EmitenFundamentalInspectorModal` langsung terbuka tanpa jeda dan secara paralel melakukan *single-ticker live fetch* (`fetchLiveIdxTicker`), menarik berita terbaru emiten tersebut (`fetchLiveEmitenSpecificNews`), memperbarui state harga saham di aplikasi, serta menyusun analisis mendalam Komite Investasi AI.
  3. **Sinkronisasi Bundle Terbaru ke GitHub Pages (`docs/assets/app.js`)**:
     - Memperbarui `/src/utils/githubCloudSync.ts` (`syncForkUpstreamAndRebuildPages`) agar ketika pengguna menekan tombol **Sync Fork & Update UI** atau **Push ke GitHub**, aplikasi juga dapat menyinkronkan file bundle statis terbaru (`index.html`, `docs/index.html`, `docs/assets/app.js`, `docs/assets/index.css`) sehingga halaman GitHub Pages milik pengguna langsung menjalankan versi terbaru tanpa tertinggal di versi lama.

### B. Redesign *AI Pre-Buy Conviction Engine* (Structured Investment Committee Cards & Deep Reasoning)
- **File Target**: `/server.ts`, `/src/utils/liveMarketFetcher.ts`, `/src/components/EmitenFundamentalInspectorModal.tsx`, `/src/types/quant.ts`
- **Perubahan Spesifik**:
  1. **Pembaruan Model Gemini Server-Side & Struktur Output JSON Terstruktur**:
     - Mengubah model pada endpoint `/api/ai/inspect-emiten` di `/server.ts` menjadi `'gemini-3.8-flash'` dengan `responseSchema` terstruktur untuk menghasilkan analisis Komite Investasi yang tajam, kontekstual terhadap pertanyaan pengguna, dan mengkritisi hubungan antar-metrik.
  2. **Mesin Sintesis Komite Investasi Dual-Mode (Server Gemini + Deep Reasoning Client Engine)**:
     - Membangun struktur data `StructuredCommitteeAnalysis` di `/src/utils/liveMarketFetcher.ts` yang bekerja baik di AI Studio (via Gemini API) maupun di GitHub Pages statis (melalui mesin *deep quantitative-fundamental synthesis* yang menganalisis kausalitas rasio spesifik emiten, rezim pasar saat ini, anomali antara valuasi vs momentum, dan substansi berita aktual).
  3. **Antarmuka *Structured Investment Committee Cards* di `EmitenFundamentalInspectorModal.tsx`**:
     - Menghilangkan teks mentah bertanda `**...**` dan menggantinya dengan tata letak kartu eksekutif:
       - **Header Keputusan Komite (*Executive Verdict Banner*)**: Menampilkan *Conviction Grade* (`A+` s/d `F`), Skor Keyakinan (`0–100`), Rekomendasi Tindakan, dan **Jawaban Langsung atas Pertanyaan Spesifik Pengguna**.
       - **Kartu 01 — Bedah Kualitas Laba & DuPont ROE (Prinsip Joeliardi Sunendar)**: Analisis kausalitas antara *Operating Margin*, *Debt-to-Equity (DER)*, dan *ROE* terhadap *Cost of Equity* Indonesia (`10,5%`), serta daya tahan arus kas dividen.
       - **Kartu 02 — Uji Valuasi Intrinsik vs Risiko *Value Trap***: Membedah selisih Harga Pasar vs Nilai Intrinsik Joeliardi-Graham (*Implied PER/PBV* vs *Fair PER/PBV*, *Margin of Safety*) yang dikalibrasi dengan tren harga 1D/30D dan volatilitas tahunan untuk membedakan saham *undervalued* sejati dari *value trap*.
       - **Kartu 03 — Sintesis Katalis Berita, Aksi Korporasi & Struktur Mikro/HSC**: Mengevaluasi dampak berita terkini (Laba, Dividen/RUPS, Buyback/Ekspansi) serta audit kebersihan saham dari indikasi manipulasi/HSC.
       - **Kartu 04 — Skenario *Bull vs. Bear* & Strategi Eksekusi Taktis**: Menyajikan skenario optimis (*Bull Catalyst*), risiko pembatalan tesis (*Bear / Invalidation Trigger*), rentang harga akumulasi ideal (IDR), serta panduan porsi alokasi di Keranjang 1 atau Keranjang 2.

---

## 3. Verifikasi & Pengujian
1. **Audit Jaringan (Network Tab)**: Memastikan saat login dan saat tombol `SYNC LIVE` diklik, hanya request IHSG + Makro Global + RSS Berita yang berjalan (0 antrean request batch saham `.JK` yang menggantung di konsol Network).
2. **Uji Responsivitas Tombol Inspect**: Memastikan tombol `Inspect` di seluruh tab selalu aktif dan langsung membuka modal serta menarik data *live* emiten yang dipilih.
3. **Uji Visual & Kompilasi**: Menjalankan `compile_applet` dan `lint_applet` untuk memastikan tidak ada galat TypeScript/ESLint dan bundle statis `docs/assets/app.js` serta `docs/assets/index.css` terkompilasi dengan bersih.
