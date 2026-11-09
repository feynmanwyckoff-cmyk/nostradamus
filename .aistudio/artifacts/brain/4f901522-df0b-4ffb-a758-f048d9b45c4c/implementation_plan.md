# Perbaikan Ekstraksi Harga Live Intraday Yahoo Finance & Sinkronisasi Snapshot

Memperbaiki logika pengambilan data Yahoo Finance di seluruh lapisan sistem agar selalu mengutamakan harga *live intraday* (`regularMarketPrice` dan `fulldayPrice`) beserta persentase perubahan harian resminya (`regularMarketChangePercent` dan `fulldayChangePercent`), memperbarui *snapshot* pasar ke harga perdagangan hari ini, serta merapatkan jadwal otomatisasi GitHub Actions selama jam bursa BEI.

## User Review & Critical Decisions

> [!IMPORTANT]
> Seluruh preferensi dari sesi klarifikasi telah dikunci ke dalam rencana eksekusi ini.

- **Prioritas Field Harga Terkini**: Mengutamakan `meta.regularMarketPrice` dan `fulldayPrice` (serta `regularMarketChangePercent` / `fulldayChangePercent` resmi dari Yahoo Finance) di atas elemen terakhir array `close` harian (`closes[closes.length - 1]`), sehingga harga saham tidak pernah tertahan di penutupan hari sebelumnya (`previousClose`).
- **Pembaruan Snapshot Live & Cloud State**: Menjalankan ulang skrip pengambil data live Yahoo Finance sekarang juga untuk memperbarui seluruh file *snapshot* (`public/static-market-snapshot.json`, `src/data/staticMarketSnapshot.json`, `static-market-snapshot.json`) dan menyinkronkan harga saham terbaru ke dalam `data/nostradamus_cloud_state.json` (dengan tetap menjaga keutuhan portofolio & `encryptedVault`).
- **Penguatan Cron GitHub Actions**: Merapatkan jadwal *cron* selama jam perdagangan BEI (Senin sampai Jumat) dan memastikan semua file *snapshot* ikut tersimpan ke repositori.

## 1. Overview & Core Concept

- **What It Does**: Memastikan harga saham BEI (`.JK`), IHSG (`^JKSE`), dan indikator makro global yang tampil di terminal selalu mencerminkan harga transaksi terakhir (*regularMarketPrice* / *fulldayPrice*) saat jam bursa berlangsung, bukan harga penutupan hari bursa sebelumnya.
- **Target Audience / Persona**: Pengguna terminal kuantitatif yang memantau pergerakan harga saham BEI dan alokasi portofolio secara *intraday* maupun *end-of-day*.
- **Key Value**: Menghilangkan *lag* harga hari Jumat pada perdagangan hari Senin (dan hari-hari bursa berikutnya), baik saat diakses melalui server lokal maupun GitHub Pages.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. Pengguna membuka terminal atau menekan tombol **SYNC SEMUA LIVE**.
  2. Sistem mengambil data kuotasi dari Yahoo Finance, mengekstrak `regularMarketPrice` / `fulldayPrice` beserta `regularMarketChangePercent` / `fulldayChangePercent`, dan langsung menampilkan harga *intraday* terkini (contoh: `BBCA` di harga *live* hari ini, bukan harga penutupan Jumat).
  3. Saat fitur **GitHub Cloud Sync** melakukan *Pull* otomatis saat aplikasi dibuka, harga saham tetap menggunakan kuotasi terbaru tanpa tertimpa harga lama dari file cloud.
- **Visual Identity & Theme**:
  - Tidak mengubah tata letak UI yang sudah ada; pembaruan berfokus pada akurasi angka harga (`lastPrice`), persentase perubahan harian (`change1D`), dan *return* 30 hari (`return30D`) di seluruh tabel dan kartu indikator.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Ekstraksi Eksplisit `regularMarketPrice` & `fulldayPrice` pada Endpoint Spark dan Chart**
  - *Chosen Approach*: Pada respons `/v8/finance/spark`, `/v7/finance/spark`, dan `/v8/finance/chart`, sistem membaca `meta.regularMarketPrice ?? entry.fulldayPrice ?? entry.regularMarketPrice` sebagai sumber utama `lastPrice`, serta menyisipkan harga *live* tersebut ke elemen terakhir deret `closes` apabila candle harian terbaru belum masuk ke array `close`. Untuk perubahan 1 hari (`change1D`), sistem mengutamakan `meta.regularMarketChangePercent ?? entry.fulldayChangePercent` dengan *fallback* perhitungan terhadap `previousClose`.
  - *Why*: Pada sesi *intraday*, elemen terakhir array `close` harian (`interval=1d`) sering kali masih `null` atau belum diperbarui, sedangkan `regularMarketPrice` dan `fulldayPrice` sudah memuat harga transaksi terakhir yang sebenarnya.
- **Decision 2: Pembaruan Harga di Dalam `nostradamus_cloud_state.json` Saat Build Snapshot**
  - *Chosen Approach*: Skrip pembuat *snapshot* pasar juga memperbarui daftar harga `stocks`, `liveIhsgQuote`, dan `macroIndicators` di dalam `data/nostradamus_cloud_state.json` tanpa mengubah `holdings`, `cashReserveIdr`, atau `encryptedVault`.
  - *Why*: Mencegah proses *auto-pull* GitHub Cloud mengembalikan harga saham ke posisi hari Jumat setelah *snapshot* diperbarui.
- **Decision 3: Peningkatan Frekuensi Cron GitHub Actions Jam Bursa BEI**
  - *Chosen Approach*: Menjadwalkan *cron* pada `sync-idx-market.yml` dan `deploy-pages.yml` sebanyak 6 kali sehari pada hari kerja bursa BEI (Sesi 1, Jeda Siang, Sesi 2, dan Pasca-Penutupan BEI).
  - *Why*: Menjaga kesegaran data *snapshot* di GitHub Pages sepanjang hari perdagangan tanpa menunggu hingga sore hari.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 ALUR EKSTRAKSI HARGA INTRADAY YAHOO FINANCE                  │
├──────────────────────────────────────────────────────────────────────────────┤
│  Respons Yahoo Finance (/v8/finance/spark, /v7/finance/spark, /v8/chart)     │
│        │                                                                     │
│        ├──► 1. Harga Terkini (lastPrice):                                    │
│        │       meta.regularMarketPrice ──► entry.fulldayPrice ──► close[-1]  │
│        │                                                                     │
│        ├──► 2. Perubahan 1 Hari (change1D):                                  │
│        │       meta.regularMarketChangePercent ──► entry.fulldayChangePercent│
│        │       ──► Fallback: ((lastPrice - previousClose) / previousClose)   │
│        │                                                                     │
│        └──► 3. Sinkronisasi Deret Close Intraday:                            │
│                Jika close[-1] masih di harga penutupan kemarin,              │
│                tambahkan/perbarui titik terakhir dengan lastPrice live       │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Sinkronisasi Lintas Lapisan**:
  - **Parser Frontend (`liveMarketFetcher.ts`)**: Memperbarui `parseYahooSparkPayload` dan `fetchYahooChartSingleViaBrowserCors` agar membaca `regularMarketPrice`/`fulldayPrice` dan `regularMarketChangePercent`/`fulldayChangePercent`, serta memperkuat *timeout* dan multi-relay CORS pada `fetchYahooSparkViaBrowserCors`.
  - **Proxy Backend Lokal (`server.ts`)**: Memperbarui `fetchSparkBatchChunk` dan `fetchSingleChartDirect` dengan prioritas field *intraday* yang identik.
  - **Generator Snapshot & Cloud State (`generate-static-market-bundle.mjs`)**: Memperbarui `fetchSparkChunk` dan `fetchSingleChart`, menyinkronkan harga saham terbaru ke `data/nostradamus_cloud_state.json`, lalu mengeksekusi skrip untuk menarik harga *live* hari ini.
  - **GitHub Actions Workflows (`sync-idx-market.yml` & `deploy-pages.yml`)**: Memperluas jadwal *cron* jam bursa BEI dan menyertakan seluruh file *snapshot* pada langkah *auto-commit*.
