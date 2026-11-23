# Nostradamus Real-Time Yahoo Finance Cloudflare Worker Relay

Relay ringan tanpa dependensi (**100% Pure ES Module, Zero NPM Dependencies**) untuk menarik data **On-Demand Single-Ticker Real-Time** (`1–2 detik`) langsung saat Anda mengklik **Inspect** pada emiten mana pun di **Nostradamus Quant Terminal** (`BBCA`, `LSIP`, `ADMR`, `DRMA`, `MIKA`, dll.) — bebas error `401 Unauthorized` dan bebas blokir `CORS`.

---

## Panduan 3 Langkah Deploy Gratis di Cloudflare Dashboard

### Langkah 1: Buat Worker Baru
1. Masuk ke [Cloudflare Dashboard](https://dash.cloudflare.com/) → pilih menu **Workers & Pages** di sidebar kiri.
2. Klik **Create** → klik **Create Worker**.
3. Beri nama Worker Anda (misal: `nostradamus-yahoo-worker`), lalu klik **Deploy**.

### Langkah 2: Copy-Paste Kode `nostradamus-yahoo-worker.js`
1. Klik tombol **Edit code** di pojok kanan atas halaman Worker yang baru dibuat.
2. Hapus seluruh isi kode contoh di editor web Cloudflare, lalu **Copy-Paste** seluruh isi file [`workers/nostradamus-yahoo-worker.js`](./nostradamus-yahoo-worker.js).
3. Klik tombol **Deploy** di pojok kanan atas.
4. Salin URL Worker Anda (contoh: `https://nostradamus-yahoo-worker.<username>.workers.dev`).

### Langkah 3: Tempel URL Worker di Nostradamus Quant Terminal
1. Buka aplikasi **Nostradamus Quant Terminal**, lalu klik **Inspect** pada emiten mana pun.
2. Buka panel **Forensic Lineage** (atau banner konfigurasi di bagian atas modal).
3. Tempel URL Worker Anda ke kolom **`Realtime Proxy Worker URL`**, klik **Simpan**, lalu klik **Tes Koneksi**.
4. Selesai! Setiap kali Anda membuka modal emiten apa pun, sistem otomatis menarik:
   - Harga spot, `change1D`, `ADTV 20D (Rp)`, `Beta 1Y (vs ^JKSE)`, `Realized Annual Vol`, `ATR 20D`, dan `Dividend Yield TTM`.
   - Laporan Keuangan TTM terdekumulasi (`IDX YTD-to-TTM Decumulator` anti-inflasi 2x & tanpa perkalian linier `9M*4/3`), lengkap dengan normalisasi otomatis `USD → IDR` (`IDR=X` live) untuk emiten berdenominasi USD (`ADMR`, `ADRO`, `ITMG`, `MDKA`, dll.) serta guardrail kewajaran `D&A / Revenue`.
   - Kurva imbal hasil **SBN 1Y / 5Y / 10Y** aktual (di-cache 6 jam di Cloudflare Cache API).

---

## Contoh Endpoint & Parameter

- **Inspect Real-Time (dengan Edge Cache 5 menit harga / 6 jam LK):**
  ```
  GET https://nostradamus-yahoo-worker.<username>.workers.dev/?ticker=LSIP
  ```
- **Force Refresh / Bypass Cache:**
  ```
  GET https://nostradamus-yahoo-worker.<username>.workers.dev/?ticker=LSIP&nocache=1
  ```
- **Mengunci CORS di Produksi (Opsional):**
  Ubah konstanta `ALLOWED_ORIGINS` di baris paling atas `nostradamus-yahoo-worker.js`:
  ```js
  const ALLOWED_ORIGINS = 'https://feynmanwyckoff-cmyk.github.io,http://localhost:5173';
  ```
