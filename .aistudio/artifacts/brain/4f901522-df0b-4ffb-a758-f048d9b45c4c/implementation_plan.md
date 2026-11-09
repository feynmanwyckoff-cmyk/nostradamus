# Pembersihan Penyebutan Nama, Standarisasi Terminologi Fundamental & Pembaruan Kredit Footer (`Made with 🤖 by Fayadh`)

Menghapus seluruh penyebutan nama "Joeliardi Sunendar" dan "Joeliardi-Graham" dari seluruh elemen antarmuka (UI), *tooltip*, *chip* pertanyaan cepat, mesin narasi Komite Investasi AI, radar aksi korporasi, hingga hasil *export* laporan (HD PNG & PDF) dengan menggantinya menjadi **Nilai Intrinsik Wajar** dan **Fundamental Kualitas Moat**, serta mengganti ikon api berdenyut (`🔥`) pada *footer* menjadi emot robot bergerak (`Made with 🤖 by Fayadh`).

## User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan konfirmasi dan revisi Anda, seluruh referensi nama individu dihapus total (0 kemunculan), digantikan dengan terminologi institusional, serta kredit *footer* diperbarui menjadi **`Made with 🤖 by Fayadh`** lengkap dengan animasi gerak robot yang halus.

- **Keputusan Terkonfirmasi 1 (Cakupan Penghapusan)**: Hapus total seluruh penyebutan "Joeliardi Sunendar" dan "Joeliardi-Graham" dari semua tampilan aplikasi, *tooltip*, narasi AI, dan *footer*/dokumen *export*.
- **Keputusan Terkonfirmasi 2 (Terminologi Pengganti)**: Gunakan istilah **Nilai Intrinsik Wajar** (untuk valuasi harga wajar & *Margin of Safety*) serta **Fundamental Kualitas Moat** (untuk evaluasi kualitas laba, ROE vs *Cost of Equity*, dan kesehatan neraca).
- **Keputusan Terkonfirmasi 3 (Kredit Footer Robot AI)**: Ganti emot api berdenyut (`Made with 🔥 by Fayadh`) menjadi emot robot bergerak (**`Made with 🤖 by Fayadh`**) pada *sticky footer* aplikasi utama maupun pada *footer* dokumen hasil *export* (HD PNG & PDF).

---

## 1. Overview & Core Concept

- **What It Does**: Menyajikan laporan inspeksi fundamental emiten, kartu Komite Investasi AI, tabel penyaringan saham, dan dokumen *export* (PNG/PDF) yang bersih dan berstandar institusional tanpa pengulangan atribusi nama tokoh, disertai *signature footer* **`Made with 🤖 by Fayadh`** yang merefleksikan rekayasa berbasis AI.
- **Target Audience / Persona**: Investor kuantitatif dan fundamental di Bursa Efek Indonesia (BEI) yang mengutamakan kejelasan metrik (**Nilai Intrinsik Wajar**, **Dekomposisi DuPont ROE**, **Fundamental Kualitas Moat**, dan **4-Faktor Out-of-Sample**).
- **Key Value**: Menghilangkan kesan repetitif (*clutter*) pada *header*, *badge*, *tooltip*, *prompt* pertanyaan, serta narasi hasil analisis, sekaligus menyelaraskan identitas visual *footer* dengan kapabilitas AI terminal.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Tabel Screening Saham**: Saat kursor diarahkan ke tombol *Inspect*, *tooltip* menampilkan *"Inspect Fundamental Kualitas Moat & OOS + Analisis AI & Berita Terkini"* tanpa atribusi nama.
  2. **Header & Kartu Valuasi Modal Inspector**: *Kicker* bagian atas menampilkan `ON-DEMAND FUNDAMENTAL & AI INSPECTOR // FUNDAMENTAL KUALITAS MOAT`, dan kartu kedua bertajuk **`NILAI INTRINSIK WAJAR`** (lengkap dengan penjelasan *tooltip* berbasis EPS, BVPS, dan ROE vs biaya modal).
  3. **Pertanyaan Cepat & Narasi Komite Investasi AI**: *Chip* pertanyaan *default* menjadi *"Apakah [TICKER] layak dibeli pada harga Rp [HARGA] berdasarkan Nilai Intrinsik Wajar & Kualitas Moat?"*, dan seluruh narasi hasil analisis maupun kartu pilar (`01. DUPONT & MOAT`) bersih dari nama tokoh.
  4. **Footer Aplikasi & Export HD Image (PNG) / PDF**:
     - Pada *sticky footer* bawah layar, teks **`Made with 🤖 by Fayadh`** menampilkan emot robot `🤖` dengan animasi gerak mekanis/mengangguk halus (`animate-robot`) dan pendaran cahaya *cyan/amber* khas AI.
     - Pada *footer* dokumen hasil *export* (PNG/PDF), bagian kiri menampilkan `© 2026 NOSTRADAMUS QUANT TERMINAL · FUNDAMENTAL KUALITAS MOAT & DEMIGUEL OOS QUANT` dan bagian kanan menampilkan `Made with 🤖 by Fayadh`.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: *Clean Institutional Quant Terminal* (mendukung mode terang *Editorial Daylight* dan mode gelap *Bloomberg Amber-Cyan*).
  - *Interactive Feedback & Motion*: Animasi CSS `@keyframes robotPulse` (kombinasi gerakan *float/tilt* halus dan efek *glow* lembut) pada emot `🤖` di *footer*.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Standarisasi Istilah Valuasi & Moat di Seluruh Lapisan (UI, AI Prompt, & Export)**
  - *Chosen Approach*: Mengganti semua label `"Nilai Intrinsik (Joeliardi-Graham)"` menjadi **`"Nilai Intrinsik Wajar"`** dan `"Prinsip Joeliardi Sunendar"` menjadi **`"Fundamental Kualitas Moat"`**, termasuk pada *system instruction* AI di server agar respons LLM tidak lagi memunculkan nama tersebut secara otomatis.
  - *Why*: Menjamin konsistensi 100% baik ketika pengguna menjalankan analisis melalui server AI maupun mesin analitik statis.
- **Decision 2: Animasi Emot Robot (`🤖`) pada Footer**
  - *Chosen Approach*: Mengganti `🔥` dengan `🤖` menggunakan animasi CSS khusus (gerak melayang dan goyangan kepala robotik halus) di *footer* web serta memperbarui teks kanvas *export* PNG/PDF menjadi `Made with 🤖 by Fayadh`.
  - *Why*: Ringan (murni CSS `@keyframes` tanpa beban *library* tambahan), ekspresif, dan langsung menonjolkan identitas aplikasi berbasis AI.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                 PEMBARUAN IDENTITAS & TERMINOLOGI TERMINAL               │
│   "Nilai Intrinsik Wajar" · "Fundamental Kualitas Moat" · "Made with 🤖"  │
└───────────────────┬──────────────────────────────────┬───────────────────┘
                    │                                  │
                    ▼                                  ▼
┌───────────────────────────────────────┐  ┌───────────────────────────────┐
│     Antarmuka & Komponen Visual       │  │   Mesin Analitik & Server AI  │
├───────────────────────────────────────┤  ├───────────────────────────────┤
│ • Sticky Footer Utama:                │  │ • Prompt & System Instruction │
│   "Made with 🤖 (animate) by Fayadh"  │  │   Komite Investasi AI         │
│ • Tabel Screening (Tooltip Inspect)   │  │ • Narasi Sintesis Komite &    │
│ • Header & Kartu Nilai Intrinsik Wajar│  │   4 Kartu Pilar Fundamental   │
│ • Tooltip Metrik & Peringatan HSC     │  │ • Evaluasi Kekuatan/Risiko &  │
│ • Generator Canvas Export PNG & PDF   │  │   Radar Berita Korporasi      │
│   (Header, Kartu Valuasi, & Footer 🤖) │  │                               │
└───────────────────────────────────────┘  └───────────────────────────────┘
```

- **Data Model & State**:
  - Struktur data evaluasi fundamental tetap mempertahankan properti kalkulasi (`intrinsicValueIdr`, `marginOfSafetyPct`, `businessQualityScore`, `balanceSheetHealthScore`, `valuationSafetyScore`, `oosQuantRobustnessScore`) tanpa perubahan yang merusak kompatibilitas *state*.
- **Interactive Component & State Mapping**:
  - Seluruh alur *Inspect Emiten*, *chip* pertanyaan cepat, *Bedah Komite AI*, *sticky footer*, dan unduhan *Export PNG / PDF* secara konsisten menampilkan terminologi baru dan kredit **`Made with 🤖 by Fayadh`**.
