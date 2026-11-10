import { useState } from 'react';
import { MarketRegime } from '../types/quant';
import { SimRegimeMode } from '../utils/quantEngine';
import { MetricTooltip } from './MetricTooltip';
import { SlidersHorizontal, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';

interface MarketRegimeBannerProps {
  regime: MarketRegime;
  simRegimeMode: SimRegimeMode;
  dataSourceLabel: string;
  rebalanceBufferPct: number;
  isIhsgSynced?: boolean;
  isRefreshingIhsg?: boolean;
  onRefreshIhsg?: () => void;
  onUpdateRebalanceBuffer: (nextBuffer: number) => void;
  onSelectSimRegime: (mode: SimRegimeMode) => void;
  onUpdateThreshold: (newThreshold: number) => void;
  onOpenStrategyModal: () => void;
}

export function MarketRegimeBanner({
  regime,
  simRegimeMode,
  dataSourceLabel,
  rebalanceBufferPct,
  isIhsgSynced = true,
  isRefreshingIhsg = false,
  onRefreshIhsg,
  onUpdateRebalanceBuffer,
  onSelectSimRegime,
  onUpdateThreshold,
  onOpenStrategyModal
}: MarketRegimeBannerProps) {
  const [showCalibration, setShowCalibration] = useState(false);

  const isVolatile = regime.status === 'VOLATIL';
  const isCaution = regime.status === 'WASPADA';

  const getSentimentTitleAndColor = () => {
    if (isVolatile) {
      return {
        label: 'Sentimen Volatil — Skala Eksposur Ekuitas Diturunkan',
        color: 'text-[#9E2A2B]'
      };
    }
    if (isCaution) {
      return {
        label: 'Sentimen Waspada — Transisi Skala Volatilitas',
        color: 'text-[#D97706] bb-amber'
      };
    }
    return {
      label: 'Sentimen Tenang — Eksposur Multifaktor Penuh',
      color: 'text-[#0D5C46]'
    };
  };

  const sentimentDisplay = getSentimentTitleAndColor();

  return (
    <section className="bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs p-5 sm:p-6 space-y-5">
      {/* Top Institutional Kicker & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold mb-1.5">
            <span className="text-[#D97706] bb-amber">
              Monitor Sentimen &amp; Skala Eksposur Pasar BEI
            </span>
            <span className="text-neutral-400">·</span>
            <MetricTooltip
              label={`Rebalancing Buffer ${rebalanceBufferPct}% (Stockbit 0,15%/0,25%)`}
              title="Rebalancing Buffer & Efisiensi Biaya Stockbit Sekuritas"
              laymanExplanation="Zona toleransi ±40% agar portofolio tidak melakukan jual-beli mikro akibat fluktuasi harian kecil. Di Stockbit Sekuritas, biaya beli adalah 0,15% dan jual 0,25% (total round-trip 0,40%) ditambah Bea Materai Rp 10.000 untuk Trade Confirmation (TC) harian > Rp 10 juta."
              practicalGuide="Dengan Buffer 40%, posisi yang bergeser tipis ditahan (HOLD), menghemat friksi round-trip 0,40% dan mencegah penerbitan TC harian berulang di atas Rp 10 juta."
              className="text-[#0284C7] bb-cyan"
            />
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-500">{dataSourceLabel}</span>
            <span className="text-neutral-400">·</span>
            <span className="text-[11px] text-neutral-400 italic">
              (Arahkan kursor / hover pada metrik untuk definisi indikator)
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111315]">
            Sentimen Pasar: <span className={sentimentDisplay.color}>{sentimentDisplay.label}</span>
          </h1>

          <p className="mt-1.5 text-xs sm:text-sm text-neutral-600 leading-relaxed">
            {isVolatile
              ? `Volatilitas realisasi 30D IHSG (${regime.annualizedVol30D.toFixed(1)}%) & tekanan makro (${regime.macroStressScore.toFixed(1)}/100) melampaui batas toleransi c (${regime.thresholdAnnVol.toFixed(1)}%). Eksposur ekuitas multifaktor diturunkan ke ${regime.aggressiveWeight}% dan ${regime.defensiveWeight}% diamankan di kas/pasar uang.`
              : isCaution
              ? `Volatilitas efektif (${regime.effectiveRegimeVol.toFixed(1)}%) & indeks tekanan makro (${regime.macroStressScore.toFixed(1)}/100) berada di zona transisi Waspada terhadap target c (${regime.thresholdAnnVol.toFixed(1)}%). Model menyeimbangkan ${regime.aggressiveWeight}% ekuitas multifaktor berkualitas dan ${regime.defensiveWeight}% perisai kas/RDPU.`
              : `Volatilitas realisasi 30D IHSG (${regime.annualizedVol30D.toFixed(1)}%) terkendali di bawah batas ${regime.thresholdAnnVol.toFixed(1)}%. Model mengalokasikan ${regime.aggressiveWeight}% pada saham Top Multifaktor (Low-Vol, Momentum 12-1, Value, Size) dengan Rebalancing Buffer ${rebalanceBufferPct}%.`}
          </p>
        </div>

        {/* Action Buttons: 3-Mode Sentiment Simulation Switch + Calibration */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs p-0.5 gap-0.5">
            <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Simulasi:
            </span>
            <button
              type="button"
              onClick={() => onSelectSimRegime('LIVE')}
              title="Gunakan data pasar IHSG & Makro Live Real-Time"
              className={`px-2.5 py-1 text-xs font-bold rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
                simRegimeMode === 'LIVE'
                  ? 'bg-[#0284C7] text-white'
                  : 'text-neutral-500 hover:text-[#111315]'
              }`}
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => onSelectSimRegime('TENANG')}
              title="Simulasikan rezim pasar Tenang (Volatilitas rendah, eksposur ekuitas maksimal)"
              className={`px-2.5 py-1 text-xs font-bold rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
                simRegimeMode === 'TENANG'
                  ? 'bg-[#059669] text-white'
                  : 'text-neutral-500 hover:text-[#0D5C46]'
              }`}
            >
              Tenang
            </button>
            <button
              type="button"
              onClick={() => onSelectSimRegime('WASPADA')}
              title="Simulasikan rezim pasar Waspada (Transisi skala volatilitas & selektivitas sektoral)"
              className={`px-2.5 py-1 text-xs font-bold rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
                simRegimeMode === 'WASPADA'
                  ? 'bg-[#D97706] text-white'
                  : 'text-neutral-500 hover:text-[#D97706]'
              }`}
            >
              Waspada
            </button>
            <button
              type="button"
              onClick={() => onSelectSimRegime('VOLATIL')}
              title="Simulasikan rezim pasar Volatil (Uji stres guncangan makro & pemangkasan eksposur)"
              className={`px-2.5 py-1 text-xs font-bold rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
                simRegimeMode === 'VOLATIL'
                  ? 'bg-[#E11D48] text-white'
                  : 'text-neutral-500 hover:text-[#9E2A2B]'
              }`}
            >
              Volatil
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCalibration(!showCalibration)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0284C7] bb-cyan bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#0284C7] rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Kalibrasi Vol (8%–60%) &amp; Buffer</span>
          </button>
        </div>
      </div>

      {/* Collapsible Volatility & Rebalancing Buffer Calibration */}
      {showCalibration && (
        <div className="p-4 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold">
              <MetricTooltip
                label="Target Volatilitas Tahunan (Konstanta c · 8%–60%)"
                title="Target Kalibrasi Volatilitas Tahunan (c)"
                laymanExplanation="Batas toleransi guncangan tahunan yang Anda anggap wajar untuk pasar saham berkembang (BEI/IHSG). Berbeda dengan S&P 500 (~15–20%), saham komoditas dan second-liner BEI sering memiliki volatilitas 28%–55%."
                practicalGuide="15%–20% = Konservatif/Moderat; 22%–35% = Agresif BEI; 36%–60% = Toleransi Penuh Emerging Market."
                className="text-[#D97706] bb-amber"
              />
              <div className="inline-flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  min={8}
                  max={60}
                  step={0.5}
                  value={regime.thresholdAnnVol}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      onUpdateThreshold(Math.max(8, Math.min(60, val)));
                    }
                  }}
                  className="w-16 px-1.5 py-0.5 text-xs font-bold tabular-nums text-right bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
                />
                <span className="tabular-nums font-bold text-[#D97706] bb-amber">%</span>
              </div>
            </div>
            <input
              type="range"
              min="8"
              max="60"
              step="0.5"
              value={regime.thresholdAnnVol}
              onChange={(e) => onUpdateThreshold(parseFloat(e.target.value))}
              className="w-full accent-[#D97706] cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10px] text-neutral-400 font-semibold tabular-nums">
              <span>8% (Defensif Ketat)</span>
              <span>18% (Default Institusi)</span>
              <span>35% (Agresif BEI)</span>
              <span>60% (Max Emerging)</span>
            </div>
            <p className="text-[11px] text-neutral-500">
              Menentukan rasio penskalaan eksposur ekuitas ($c / \sigma_t$). Diperluas hingga <strong>60%</strong> agar dapat mengakomodasi lonjakan volatilitas indeks negara berkembang (BEI/IHSG).
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <MetricTooltip
                label="No-Trade Rebalancing Buffer (Peredam Fee Stockbit)"
                title="No-Trade Rebalancing Buffer vs Fee Stockbit Sekuritas"
                laymanExplanation="Sabuk pengaman agar portofolio tidak bongkar-pasang akibat noise harga harian. Mencegah biaya round-trip Stockbit Sekuritas sebesar 0,40% (0,15% Beli + 0,25% Jual) serta Bea Materai Rp 10.000 pada Trade Confirmation (TC) > Rp 10 juta."
                practicalGuide="Default Top 40% terbukti paling optimal menjaga net alpha setelah dipotong fee sekuritas, PPh Final 0,1%, dan Bea Materai."
                className="text-[#0284C7] bb-cyan"
              />
              <span className="tabular-nums font-bold text-[#0284C7] bb-cyan">Top {rebalanceBufferPct}%</span>
            </div>
            <input
              type="range"
              min="20"
              max="50"
              step="5"
              value={rebalanceBufferPct}
              onChange={(e) => onUpdateRebalanceBuffer(parseInt(e.target.value, 10))}
              className="w-full accent-[#0284C7] cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10px] text-neutral-400 font-semibold tabular-nums">
              <span>20% (Ketat)</span>
              <span>35%</span>
              <span>40% (Optimal Stockbit)</span>
              <span>50% (Longgar)</span>
            </div>
            <p className="text-[11px] text-neutral-500">
              Menahan jual-beli selama peringkat saham bertahan di Top {rebalanceBufferPct}% &amp; deviasi lot dalam ±{rebalanceBufferPct}% (menghemat fee Stockbit 0,15% beli / 0,25% jual &amp; konsolidasi TC &gt; Rp 10 juta).
            </p>
          </div>
        </div>
      )}

      {/* 4-Column Quantitative KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-[#E4E2DD] tabular-nums">
        {/* KPI 1: IHSG Spot */}
        <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
          <div className="flex items-center justify-between text-xs font-semibold">
            <MetricTooltip
              label="IDX Composite (^JKSE)"
              title="Indeks Harga Saham Gabungan (IHSG)"
              laymanExplanation="Barometer utama seluruh saham di Bursa Efek Indonesia (BEI). Menunjukkan arah rata-rata pasar saham Indonesia hari ini."
              practicalGuide="Hijau (+) berarti rata-rata pasar menguat; Merah (-) berarti pasar sedang terkoreksi."
              className="text-[#D97706] bb-amber"
            />
            <button
              type="button"
              onClick={onRefreshIhsg}
              disabled={isRefreshingIhsg}
              title="Klik untuk menyegarkan kuotasi IHSG (^JKSE) & Volatilitas 30D Live sekarang"
              className={`inline-flex items-center p-1 rounded-xs border transition-colors cursor-pointer disabled:opacity-60 ${
                isIhsgSynced
                  ? 'text-[#0D5C46] border-[#059669]/40 bg-[#059669]/10 hover:bg-[#059669]/20'
                  : 'text-[#D97706] border-[#F59E0B]/40 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20'
              }`}
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isRefreshingIhsg ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-1.5">
            <span className="text-2xl font-bold text-[#111315]">
              {regime.ihsgLastPrice.toLocaleString('id-ID', { minimumFractionDigits: 2 })}
            </span>
            <span
              className={`inline-flex items-center text-xs font-bold ${
                regime.ihsgChange1D >= 0 ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'
              }`}
            >
              {regime.ihsgChange1D >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              )}
              {regime.ihsgChange1D >= 0 ? '+' : ''}
              {regime.ihsgChange1D.toFixed(2)}%
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-neutral-500">
            <MetricTooltip
              label={
                <span>
                  Daily σ (30D): <strong className="text-[#111315]">{regime.dailyStdDev30D.toFixed(3)}%</strong>
                </span>
              }
              title="Simpangan Baku Harian / Daily σ (30 Hari)"
              laymanExplanation="Rata-rata lebar ayunan naik-turun IHSG setiap harinya selama 1 bulan terakhir."
              practicalGuide="Di bawah 1,0% artinya pasar tenang; di atas 1,5% artinya pasar sedang bergejolak tajam dari hari ke hari."
            />
          </div>
        </div>

        {/* KPI 2: Realized & Effective Volatility */}
        <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
          <div className="text-xs font-semibold text-[#0284C7] bb-cyan">
            <MetricTooltip
              label="Realized 30D Volatility"
              title="Volatilitas Realisasi 30 Hari (Disetahunkan)"
              laymanExplanation="Ukuran seberapa liar guncangan naik-turun pasar saham dalam 30 hari terakhir jika diproyeksikan setahun."
              practicalGuide="≤ 18% = Pasar Tenang (aman masuk saham penuh); > 18% = Pasar Bergelombang (amankan sebagian modal ke uang tunai)."
              className="text-[#0284C7] bb-cyan"
            />
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-1.5">
            <span className="text-2xl font-bold text-[#111315]">
              {regime.annualizedVol30D.toFixed(2)}%
            </span>
            <MetricTooltip
              label={`Eff: ${regime.effectiveRegimeVol.toFixed(1)}%`}
              title="Effective Volatility (Gabungan IHSG + Makro)"
              laymanExplanation="Angka guncangan total setelah menggabungkan gejolak IHSG (75%) dan tekanan ekonomi luar negeri seperti kurs Rupiah & bunga AS (25%)."
              practicalGuide="Angka inilah yang dipakai sistem untuk menentukan berapa persen uang yang boleh masuk ke saham hari ini."
              align="right"
              className="text-xs font-bold text-[#0284C7] bb-cyan"
            />
          </div>
          <div className="mt-1.5 text-[11px] text-neutral-500">
            <MetricTooltip
              label={
                <span>
                  Macro Stress: <strong className="text-[#D97706] bb-amber">{regime.macroStressScore.toFixed(1)}/100</strong>
                </span>
              }
              title="Indeks Tekanan Makroekonomi (0–100)"
              laymanExplanation="Indikator cuaca ekonomi dari 4 faktor luar: Kurs Rupiah (USD/IDR), Bunga Obligasi AS (US 10Y), Indeks Dolar (DXY), dan Indeks Ketakutan Global (VIX)."
              practicalGuide="0–45 = Cuaca Cerah; 46–65 = Berawan/Waspada; > 65 = Badai Makro (waspadai arus modal asing keluar)."
            />
          </div>
        </div>

        {/* KPI 3 & 4 Combined: Dynamic Exposure Split */}
        <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs sm:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs mb-1">
            <MetricTooltip
              label="Proporsi Eksposur Ekuitas Multifaktor vs Kas"
              title="Rem & Gas Otomatis (Volatility-Managed Scaling)"
              laymanExplanation="Pengatur porsi modal otomatis: saat pasar tenang sistem menginjak gas (porsi saham besar), dan saat pasar badai sistem menginjak rem (porsi kas diperbesar)."
              practicalGuide="Ikuti persentase ini agar modal Anda terlindungi dari kejatuhan pasar yang dalam (market crash)."
              align="right"
              className="font-semibold text-[#111315]"
            />
            <button
              type="button"
              onClick={onOpenStrategyModal}
              className="text-[#D97706] bb-amber font-bold hover:underline cursor-pointer"
            >
              Buka Memo Eksekusi →
            </button>
          </div>

          <div className="flex items-center justify-between text-xs font-bold my-1.5">
            <MetricTooltip
              label={`Active Multifactor Equity: ${regime.aggressiveWeight}%`}
              title="Porsi Saham Aktif (Active Equity)"
              laymanExplanation="Persentase dari total uang Anda yang disarankan untuk dibelikan saham-saham pilihan di Keranjang 1 dan Keranjang 2 saat ini."
              className="text-[#0284C7] bb-cyan"
            />
            <MetricTooltip
              label={`Cash / Money Market Shield: ${regime.defensiveWeight}%`}
              title="Pelindung Uang Tunai / Pasar Uang (Cash Shield)"
              laymanExplanation="Persentase uang yang disarankan tetap disimpan dalam bentuk kas/RDPU (Reksa Dana Pasar Uang) sebagai pelindung dan amunisi beli saat pasar diskon."
              align="right"
              className="text-[#0D5C46]"
            />
          </div>

          <div className="w-full h-2.5 bg-neutral-300/50 rounded-xs overflow-hidden flex">
            <div
              style={{ width: `${regime.aggressiveWeight}%` }}
              className="bg-[#0284C7] transition-all duration-200"
            />
            <div
              style={{ width: `${regime.defensiveWeight}%` }}
              className="bg-[#059669] transition-all duration-200"
            />
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[11px] text-neutral-500">
            <span>Faktor: 28% Low-Vol · 34% Mom Live · 23% Value · 15% Size</span>
            <span>Buffer: Top {rebalanceBufferPct}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
