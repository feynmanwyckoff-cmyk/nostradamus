# Penyempurnaan Export PDF/PNG Inspector, Narasi Humanis & Identitas Visual Nostradamus

Rencana ini menyelaraskan kualitas visual laporan hasil *Export PDF* dan *HD Image (PNG)* agar identik dengan tampilan web (Lampiran 1), menyempurnakan gaya bahasa narasi Komite Investasi AI menjadi lebih mengalir dan manusiawi layaknya riset analis senior, mengganti kotak huruf "N" polos pada header laporan dengan logo **Kompas Pelaut Nostradamus**, serta merapikan teks *footer* sebelah kiri sesuai Lampiran 3.

## User Review & Critical Decisions

> [!IMPORTANT]
> Keputusan berikut telah dikonfirmasi bersama pengguna dan menjadi acuan utama implementasi:

- **Confirmed Decision 1 — Gaya Bahasa Narasi Analis Senior yang Lugas & Natural**: Menghilangkan istilah terjemahan kaku atau terlalu mekanis seperti *"kuotasi"*, *"diskon optik"*, *"secara kausal"*, *"pengungkit"*, dan *"trajektori"*. Narasi ditulis ulang dengan bahasa Indonesia finansial yang wajar, komunikatif, dan enak dibaca (misalnya *"Pada harga pasar Rp..."*, *"Harga saham yang terlihat murah saat ini..."*, *"Dari sisi fundamental..."*, *"rasio utang DER..."*, dan *"pergerakan harga 30 hari terakhir..."*).
- **Confirmed Decision 2 — Keselarasan Visual Export PDF/PNG dengan Lampiran 1**: Kotak **Komite Investasi AI** pada hasil cetak PDF/PNG akan menampilkan *layout*, tipografi *rich-text* (cetak tebal otomatis pada angka/metrik kunci dan garis bawah *amber* pada rekomendasi utama), lencana status berbingkai, serta 4 kartu *Chain-of-Thought* dengan garis pemisah judul dan kesimpulan berwarna *amber* (`→ ...`) di baris tersendiri persis seperti tampilan web pada Lampiran 1.
- **Confirmed Decision 3 — Logo Kompas Nostradamus & Penyederhanaan Footer**:
  - Mengganti kotak huruf `"N"` polos di sudut kiri atas header PDF/PNG dengan ilustrasi vektor **Kompas Pelaut Nostradamus** (*8-Point Mariner's Compass Rose*).
  - Menyederhanakan teks *footer* sebelah kiri menjadi tepat `© 2026 NOSTRADAMUS QUANT TERMINAL` sesuai Lampiran 3.

---

## 1. Overview & Core Concept

- **What It Does**: Meningkatkan keterbacaan laporan analisis fundamental & kuantitatif emiten baik di layar web maupun saat diunduh sebagai dokumen PDF atau gambar beresolusi tinggi (PNG).
- **Target Audience / Persona**: Investor dan pengelola portofolio yang membutuhkan laporan *due diligence* saham BEI yang berwibawa, mudah dicerna, dan siap dibagikan tanpa istilah robotik atau teks yang terpotong.
- **Key Value**:
  1. Bahasa analisis terasa ditulis langsung oleh analis riset berpengalaman, bukan terjemahan mesin.
  2. Dokumen PDF/PNG memiliki hierarki visual yang tajam—angka penting langsung menonjol (*bold*), kesimpulan tiap langkah penalaran terpisah jelas di bagian bawah kartu, dan tidak ada kalimat yang terpotong pada kotak strategi eksekusi.
  3. Identitas visual laporan lebih berkelas berkat logo kompas khas Nostradamus di bagian header dan *footer* yang bersih.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. Pengguna membuka jendela **Inspect Fundamental & AI** pada saham pilihan (mis. ARNA).
  2. Pengguna membaca ringkasan **Hasil Analisis Komite Investasi** yang kini menggunakan bahasa mengalir dan humanis, lengkap dengan penekanan tebal (*bold*) pada metrik kunci dan rekomendasi utama.
  3. Pengguna menekan tombol **Export PDF** atau **Export HD Image (PNG)** dan memperoleh dokumen dengan tata letak kartu, lencana status, *highlight* angka, logo kompas header, dan *footer* yang rapi.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: *Institutional Editorial Dark Slate* pada dokumen cetak PDF/PNG dan *Clean Financial Editorial* pada modal web.
  - *Color Palette & Mood*: Latar utama dokumen cetak `#0B0F17`, permukaan kartu `#11161F` dan `#161D2A`, aksen emas/amber `#F59E0B` untuk penekanan keputusan komite, hijau zamrud `#10B981` untuk indikator sehat/positif, dan merah koral `#F43F5E` untuk peringatan risiko.
  - *Typography & Hierarchy*: Menggunakan `Montserrat` dengan perpaduan bobot *Regular/Medium* (`500`) untuk teks naratif dan *Bold/ExtraBold* (`700`–`800`) untuk metrik finansial, harga saham (`Rp ...`), persentase, serta kesimpulan utama.
  - *Component Styling & Layout*:
    - **Header Laporan**: Menampilkan logo **Kompas Pelaut Nostradamus** berukuran proporsional di sisi kiri judul emiten.
    - **Kotak Komite Investasi AI**: Lencana status (`CAUTION // VALUE TRAP ALERT`, dll.) berada di baris atas dengan bingkai berwarna sesuai sentimen, diikuti judul utama di bawahnya, skor keyakinan (`AI Conviction Score: XX/100`), lencana kotak `■ HASIL ANALISIS KOMITE INVESTASI`, dan paragraf narasi dengan *inline bold* pada angka/rekomendasi.
    - **4 Kartu Chain-of-Thought (01–04)**: Setiap kartu memiliki judul tebal di bagian atas dengan garis pemisah horizontal tipis, isi penjelasan dengan angka tercetak tebal, serta baris kesimpulan (`→ ...`) berwarna *amber* di bagian bawah kartu.
    - **4 Kartu Strategi Eksekusi Pra-Beli**: Tinggi kartu disesuaikan secara dinamis agar seluruh teks (termasuk batas risiko/invalidation) tampil utuh tanpa terpotong.
    - **Footer Laporan**: Sisi kiri hanya menampilkan `© 2026 NOSTRADAMUS QUANT TERMINAL` dan sisi kanan `Made with 🤖 by Fayadh`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Mesin Perender Rich-Text & Inline Highlight pada Canvas 2D**
  - *Chosen Approach*: Membangun fungsi pembungkus dan perender teks kaya (*rich-text token wrapper*) pada Canvas 2D yang mengenali token metrik finansial (`Rp ...`, `ROE ...%`, `PER ...x`, `PBV ...x`, nama ticker, serta frasa keputusan seperti `LAYAK KOLEKSI SELEKTIF SAAT KOREKSI`) untuk digambar dengan font tebal (`700`/`800`) dan warna/garis bawah yang selaras dengan tampilan web.
  - *Why*: Sebelumnya Canvas 2D menggambar seluruh kalimat sebagai satu string polos sehingga tampak datar dan sulit dipindai mata dibandingkan tampilan web di Lampiran 1.
  - *Alternatives Considered*: Merender DOM menggunakan pustaka tangkapan layar pihak ketiga—tidak dipilih karena sering gagal memuat font eksternal dan menghasilkan artefak kabur pada berbagai ukuran layar.
- **Decision 2: Penyempurnaan Bahasa Narasi & Instruksi Prompt AI**
  - *Chosen Approach*: Memperbarui mesin analisis internal dan *system prompt* server AI agar menggunakan kosakata analis pasar modal Indonesia yang natural, lugas, dan humanis (mengganti *"kuotasi"* menjadi *"harga pasar"* atau *"level harga"*, *"diskon optik"* menjadi *"valuasi yang terlihat murah di permukaan"*, *"secara kausal"* menjadi *"jika dibedah lebih dalam"* atau *"secara fundamental"*, *"pengungkit"* menjadi *"rasio utang"*, dan *"trajektori"* menjadi *"arah pergerakan"*), ditambah filter normalisasi otomatis untuk membersihkan kata-kata kaku jika muncul dari respons model.
  - *Why*: Menjamin baik mode AI maupun mesin analitik mandiri selalu menghasilkan kalimat yang nyaman dibaca oleh investor manusia.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   EMITEN FUNDAMENTAL & AI INSPECTOR                        │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┴─────────────────────────────┐
        ▼                                                           ▼
┌───────────────────────────────────────┐   ┌───────────────────────────────────────┐
│   Humanized Narrative & AI Engine     │   │   HD Canvas & PDF 1.4 Export Engine   │
│ ───────────────────────────────────── │   │ ───────────────────────────────────── │
│ • Gaya bahasa analis senior natural   │   │ • Vektor Logo Kompas Nostradamus      │
│ • Bebas istilah kaku ("kuotasi",      │   │ • Layout Kotak AI = Lampiran 1 Web    │
│   "diskon optik", "secara kausal")    │   │ • Inline Bold Metrics & Amber Verdict │
│ • Normalisasi istilah otomatis        │   │ • Kartu CoT dengan Garis & Baris "→"  │
│   untuk output AI maupun fallback     │   │ • Footer: © 2026 NOSTRADAMUS QUANT    │
│                                       │   │   TERMINAL                            │
└───────────────────────────────────────┘   └───────────────────────────────────────┘
```

- **Data Model & State**:
  - Struktur data laporan (`StructuredAiConvictionReport`) tetap kompatibel penuh, dengan pembaruan pada teks `verdictTitle`, `directAnswerSummary`, `chainOfThoughtSteps`, dan `sections` agar menggunakan narasi yang lebih komunikatif.
- **Interactive Component & State Mapping**:
  - Saat pengguna menekan tombol **Export HD Image (PNG)** atau **Export PDF**, kanvas mengukur tinggi dinamis setiap blok teks (narasi utama, 4 kartu *Chain-of-Thought* beserta baris kesimpulan `→`, 4 kartu strategi eksekusi tanpa pemotongan kalimat, dan daftar berita) sehingga tidak ada teks yang bertabrakan atau terpotong.
