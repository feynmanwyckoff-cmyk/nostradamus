import { useState, useMemo, useEffect } from 'react';
import { MarketRegime, StockMetrics } from '../types/quant';
import {
  BasketSelectionMode,
  computeOptimalHRPBarbellPortfolio,
  computeSleeveSpecificScore,
  getBasketSelectionReason
} from '../utils/quantEngine';
import { MetricTooltip } from './MetricTooltip';
import {
  formatIndonesianIntegerInput,
  parseIndonesianNumber
} from '../utils/numberFormat';
import { Calculator, SlidersHorizontal, RefreshCw, Scale } from 'lucide-react';

interface BarbellAllocatorCardProps {
  regime: MarketRegime;
  stocks: StockMetrics[];
  capitalIdr: number;
  actualPortfolioNavIdr?: number;
  onChangeCapital: (capital: number) => void;
  onLoadIdx100Universe?: () => void;
  onInspectTicker?: (ticker: string) => void;
  onTriggerSweetAlert: (
    capital: number,
    picksPerSleeve?: number,
    selectionMode?: BasketSelectionMode
  ) => void;
}

export function BarbellAllocatorCard({
  regime,
  stocks,
  capitalIdr,
  actualPortfolioNavIdr,
  onChangeCapital,
  onInspectTicker,
  onTriggerSweetAlert
}: BarbellAllocatorCardProps) {
  const [rawInput, setRawInput] = useState(() =>
    formatIndonesianIntegerInput(String(Math.round(capitalIdr)))
  );
  const [picksPerSleeve, setPicksPerSleeve] = useState<number>(4);
  const [selectionMode, setSelectionMode] =
    useState<BasketSelectionMode>('LIVE_FACTOR_LEADER');

  useEffect(() => {
    setRawInput(formatIndonesianIntegerInput(String(Math.round(capitalIdr))));
  }, [capitalIdr]);

  const analytics = useMemo(
    () =>
      computeOptimalHRPBarbellPortfolio(
        stocks,
        regime,
        capitalIdr,
        picksPerSleeve,
        selectionMode
      ),
    [stocks, regime, capitalIdr, picksPerSleeve, selectionMode]
  );

  const lowVolCorePositions = analytics.positions.filter((p) => p.basket === 'DEFENSIVE');
  const momentumValuePositions = analytics.positions.filter((p) => p.basket === 'AGGRESSIVE');

  const activeEquityPoolIdr = Math.round((capitalIdr * analytics.equityExposureWeightPct) / 100);
  const cashShieldPoolIdr = analytics.cashReserveTargetIdr;

  const liveFetchedCount = useMemo(
    () => stocks.filter((s) => s.isLiveFetched).length,
    [stocks]
  );

  const liquidStockCount = useMemo(
    () => stocks.filter((s) => s.isLiquid !== false && s.lastPrice >= 68).length,
    [stocks]
  );

  const handleCapitalChange = (val: string) => {
    const formatted = formatIndonesianIntegerInput(val);
    setRawInput(formatted);
    const num = Math.round(parseIndonesianNumber(formatted));
    if (Number.isFinite(num) && num >= 100000) {
      onChangeCapital(num);
    }
  };

  return (
    <section className="p-5 sm:p-6 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-5">
      {/* Header & Capital Input */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E4E2DD] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="text-[#D97706] bb-amber">
              Alokasi Portofolio Dinamis Live · 40% No-Trade Rebalancing Buffer
            </span>
            <span className="text-neutral-400">·</span>
            <span
              title="Emiten likuid aktif dari seluruh emiten JCI telah tersinkronisasi ke dalam kalkulator keranjang"
              className="inline-flex items-center gap-1 text-[#0D5C46] font-bold"
            >
              <RefreshCw className="w-3 h-3" />
              <span>
                {liquidStockCount} Likuid ({liveFetchedCount}/{stocks.length} JCI)
              </span>
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#111315] mt-0.5">
            Kalkulator Alokasi Multifaktor &amp; Ukuran Lot BEI (1 Lot = 100 Lembar)
          </h2>
          <p className="text-xs text-neutral-600 mt-0.5">
            Hanya menyaring <strong>{liquidStockCount} saham likuid aktif</strong> dari{' '}
            <strong>{stocks.length} emiten JCI (.JK)</strong> — saham tidak likuid/gocap diblokir otomatis (
            <span className="font-bold text-[#0284C7] bb-cyan">
              {analytics.equityExposureWeightPct}% Ekuitas Multifaktor : {analytics.cashReserveWeightPct}% Kas Pasar Uang
            </span>
            ).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block text-[10px] font-bold text-neutral-500">
                Modal Portofolio Aktual (IDR)
              </label>
              {typeof actualPortfolioNavIdr === 'number' &&
                actualPortfolioNavIdr > 0 &&
                Math.abs(actualPortfolioNavIdr - capitalIdr) > 1000 && (
                  <button
                    type="button"
                    onClick={() => onChangeCapital(Math.round(actualPortfolioNavIdr))}
                    className="text-[10px] font-bold text-[#0284C7] bb-cyan hover:underline cursor-pointer"
                    title="Samakan dengan Total Nilai Saham + Cadangan Kas Aktual di Tab 03"
                  >
                    Sync NAV Aktual
                  </button>
                )}
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={rawInput}
              onChange={(e) => handleCapitalChange(e.target.value)}
              placeholder="100.000.000"
              className="px-3 py-1.5 text-xs font-bold tabular-nums bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs w-48 text-right focus:outline-none focus:border-[#F59E0B]"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              onTriggerSweetAlert(capitalIdr, picksPerSleeve, selectionMode)
            }
            className="bb-btn-primary self-end inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#D97706] text-white text-xs font-semibold rounded-xs hover:bg-[#B45309] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Memo Eksekusi</span>
          </button>
        </div>
      </div>

      {/* Interactive Basket Selection Mode & Formula Transparency Bar */}
      <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#D97706] shrink-0" />
            <div>
              <span className="text-xs font-bold text-[#111315] block">
                Dasar Pengambilan &amp; Mode Seleksi Keranjang 1 vs Keranjang 2
              </span>
              <span className="text-[11px] text-neutral-500">
                Wajib Likuid &amp; Harga Live Valid (≥ Rp 80) · Prioritas Dividen Tunai di Keranjang 1 · Akselerasi Harga Live di Keranjang 2.
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selection Mode Buttons */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs">
              <button
                type="button"
                onClick={() => setSelectionMode('LIVE_FACTOR_LEADER')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-xs transition-colors cursor-pointer ${
                  selectionMode === 'LIVE_FACTOR_LEADER'
                    ? 'bg-[#D97706] text-white bb-btn-primary'
                    : 'text-neutral-600 hover:text-[#111315]'
                }`}
              >
                Skor Faktor Live
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode('TOP_GAINERS_MOMENTUM')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-xs transition-colors cursor-pointer ${
                  selectionMode === 'TOP_GAINERS_MOMENTUM'
                    ? 'bg-[#059669] text-white'
                    : 'text-neutral-600 hover:text-[#111315]'
                }`}
              >
                Fokus Top Gainers Live
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode('SECTOR_ROTATION')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-xs transition-colors cursor-pointer ${
                  selectionMode === 'SECTOR_ROTATION'
                    ? 'bg-[#0284C7] text-white'
                    : 'text-neutral-600 hover:text-[#111315]'
                }`}
              >
                Lintas Sektor (1/Sektor)
              </button>
            </div>

            {/* Picks per Basket Selector */}
            <div className="flex items-center gap-1 p-1 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs">
              {[3, 4, 5, 6].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setPicksPerSleeve(cnt)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-xs transition-colors cursor-pointer ${
                    picksPerSleeve === cnt
                      ? 'bg-[#111315] text-white'
                      : 'text-neutral-500 hover:text-[#111315]'
                  }`}
                >
                  {cnt} Saham
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Formula Comparison Strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-[#E4E2DD]/80 text-[11px]">
          <div className="px-2.5 py-1.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs">
            <span className="font-bold text-[#0D5C46]">Keranjang 1 (Defensive &amp; GP/A Quality Core · 1/β Sizing): </span>
            <span className="text-neutral-600">
              Lolos Kualitas (<code className="font-bold">GP/A Novy-Marx &amp; Bebas HSC</code>) · Pembobotan{' '}
              <strong>Proporsional 1/Beta (Risk Parity Qian 2005)</strong> dengan batas alokasi maksimum per saham
              {selectionMode === 'SECTOR_ROTATION' ? ' (Maks 1 saham/sektor).' : ' (Maks 2 saham/sektor).'}
            </span>
          </div>
          <div className="px-2.5 py-1.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs">
            <span className="font-bold text-[#0284C7] bb-cyan">Keranjang 2 (Asymmetric Barbell Alpha · Taleb 2012): </span>
            <span className="text-neutral-600">
              Semua saham lolos kualitas (termasuk Beta tinggi) diberi bobot{' '}
              <strong>1/Beta Terukur (Inverse Volatility)</strong> untuk menangkap upside asimetris tanpa risiko total ruin.
            </span>
          </div>
        </div>
      </div>

      {/* Portfolio-Level Risk & Factor Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs tabular-nums">
        <div className="px-2 text-center">
          <div className="text-[11px] font-semibold text-neutral-500">
            <MetricTooltip
              label="Skor Komposit Multifaktor"
              title="Skor Komposit Multifaktor (Skala 1–10)"
              laymanExplanation="Nilai rapor rata-rata dari seluruh saham pilihan di Keranjang 1 & 2, dihitung dari ketenangan harga, tren kenaikan, murahnya harga dibanding laba, dan kesehatan utang."
              practicalGuide="Di atas 7,0 = Portofolio sangat berkualitas; di bawah 5,5 = Banyak saham yang sedang melemah."
              align="center"
            />
          </div>
          <span className="text-lg font-bold text-[#0D5C46] block mt-0.5">
            {analytics.portfolioQmj.toFixed(2)} / 10.0
          </span>
        </div>
        <div className="px-2 border-l border-[#E4E2DD] text-center">
          <div className="text-[11px] font-semibold text-neutral-500">
            <MetricTooltip
              label="Eksposur Ekuitas vs Kas"
              title="Pembagian Modal Saham vs Kas"
              laymanExplanation="Perbandingan antara uang yang dibelikan saham aktif vs uang yang disimpan sebagai cadangan kas aman."
              practicalGuide="Misal 45% / 55% berarti dari Rp 100 Juta, Rp 45 Juta dibelikan saham dan Rp 55 Juta disimpan di kas/pasar uang."
              align="center"
            />
          </div>
          <span className="text-lg font-bold text-[#0284C7] bb-cyan block mt-0.5">
            {analytics.equityExposureWeightPct}% / {analytics.cashReserveWeightPct}%
          </span>
        </div>
        <div className="px-2 border-l border-[#E4E2DD] text-center">
          <div className="text-[11px] font-semibold text-neutral-500">
            <MetricTooltip
              label="Estimasi OOS Net Sharpe"
              title="Out-of-Sample Net Sharpe Ratio"
              laymanExplanation="Ukuran seberapa sepadan potensi keuntungan yang didapat dibandingkan risiko guncangannya, setelah dikurangi biaya beli-jual sekuritas BEI."
              practicalGuide="Semakin tinggi semakin bagus. Angka ≥ 0,50 menandakan imbal hasil jauh lebih unggul dibanding sekadar menabung."
              align="right"
            />
          </div>
          <span className="text-lg font-bold text-[#D97706] bb-amber block mt-0.5">
            {analytics.sharpeEstimate.toFixed(2)} (Net Fee BEI)
          </span>
        </div>
        <div className="px-2 border-l border-[#E4E2DD] text-center">
          <div className="text-[11px] font-semibold text-neutral-500">
            <MetricTooltip
              label="Cadangan Kas Vol-Scaling"
              title="Cadangan Kas Pelindung (Vol-Scaling)"
              laymanExplanation="Nominal uang tunai (Rupiah) yang wajib disisihkan saat ini agar nilai portofolio Anda tidak anjlok dalam ketika IHSG sedang bergejolak."
              practicalGuide="Dapat ditempatkan di RDN berbunga atau Reksa Dana Pasar Uang agar tetap menghasilkan bunga harian."
              align="right"
            />
          </div>
          <span className="text-lg font-bold text-[#0D5C46] block mt-0.5">
            Rp {(cashShieldPoolIdr / 1_000_000).toFixed(1)} Jt
          </span>
        </div>
      </div>

      {/* Two-Sided Multifactor Sleeves */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 tabular-nums">
        {/* Left Sleeve: Low-Volatility, Dividend & Value Factor Core */}
        <div className="p-4 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#E4E2DD] pb-2.5">
            <div>
              <div className="text-xs font-bold text-[#0D5C46]">
                <MetricTooltip
                  label={`Keranjang 1 · Low-Volatility & Dividend Core (${lowVolCorePositions.length} Saham)`}
                  title="Keranjang 1: Pelindung Nilai, Ketenangan & Dividen (55% Porsi Saham)"
                  laymanExplanation="Berisi saham-saham likuid berfundamental kuat yang gerak harganya relatif tenang (Beta ≤ 0,96), rutin membagikan dividen tunai, dan harganya masih wajar dibanding labanya."
                  practicalGuide="Saham tidak likuid/gocap diblokir otomatis dari keranjang ini."
                  className="text-[#0D5C46]"
                />
              </div>
              <span className="text-[11px] text-neutral-500 block mt-0.5">
                Kriteria: Likuid Institusional · β ≤ 0.96 · Prioritas Pembagi Dividen
              </span>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-[#0D5C46]">
                {Math.round(analytics.equityExposureWeightPct * 0.55)}% Porsi Modal
              </span>
              <span className="block text-xs font-semibold text-[#111315]">
                Rp {Math.round(activeEquityPoolIdr * 0.55).toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          <div className="divide-y divide-[#E4E2DD]/70 text-xs">
            {lowVolCorePositions.map((pos, idx) => {
              const is1DPos = pos.stock.change1D >= 0;
              const is30DPos = pos.stock.return30D >= 0;
              const divYield = pos.stock.dividendYieldPct ?? 0;
              const sleeveScore = computeSleeveSpecificScore(
                pos.stock,
                'DEFENSIVE',
                selectionMode
              );
              const reasonText = getBasketSelectionReason(
                pos.stock,
                'DEFENSIVE',
                selectionMode
              );

              return (
                <div
                  key={pos.stock.ticker}
                  className="py-2.5 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-neutral-400">
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-[#D97706] bb-amber">
                        {pos.stock.ticker}
                      </span>
                      <span className="font-bold text-[#111315]">
                        @ Rp {pos.stock.lastPrice.toLocaleString('id-ID')}
                      </span>
                      <span
                        className={`text-[11px] font-bold ${
                          is1DPos ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'
                        }`}
                      >
                        ({is1DPos ? '+' : ''}
                        {pos.stock.change1D.toFixed(2)}%)
                      </span>
                      <span
                        className={`text-[11px] font-bold ${
                          is30DPos ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'
                        }`}
                      >
                        [30D: {is30DPos ? '+' : ''}
                        {pos.stock.return30D.toFixed(2)}%]
                      </span>
                      {divYield > 0 && (
                        <span
                          title={`Emiten Pembagi Dividen Tunai (TTM Yield Yahoo Finance ~${divYield.toFixed(2)}%/thn)`}
                          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-[#0D5C46] bg-[#059669]/10 border border-[#059669]/35 rounded-xs"
                        >
                          DIV {divYield.toFixed(2)}%
                        </span>
                      )}
                      <span
                        title={
                          pos.stock.isLiveFetched
                            ? 'Data Tersinkronisasi Live'
                            : 'Menunggu Sinkronisasi'
                        }
                        className={`inline-flex items-center justify-center p-1 rounded-xs border ${
                          pos.stock.isLiveFetched
                            ? 'text-[#0D5C46] border-[#059669]/40 bg-[#059669]/10'
                            : 'text-[#D97706] border-[#F59E0B]/40 bg-[#F59E0B]/10'
                        }`}
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {pos.stock.name} · {pos.stock.sector} · Bobot 1/β{' '}
                      <strong>{pos.totalPortfolioWeightPct.toFixed(1)}%</strong> (β {pos.stock.beta1Y.toFixed(2)}x · GP/A{' '}
                      {(pos.stock.grossProfitabilityToAssets ?? pos.stock.roe * 0.85).toFixed(1)}%) · Skor Defensif{' '}
                      <strong className="text-[#0D5C46]">{sleeveScore.toFixed(2)}</strong>
                    </div>
                    <div className="text-[10px] font-semibold text-[#0D5C46] mt-0.5">
                      Dasar: {reasonText}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <div>
                      <div className="font-bold text-[#111315]">
                        {pos.lots.toLocaleString('id-ID')} Lot
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        Rp {pos.allocatedIdr.toLocaleString('id-ID')}
                      </div>
                    </div>
                    {onInspectTicker && (
                      <button
                        type="button"
                        onClick={() => onInspectTicker(pos.stock.ticker)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-[#D97706] bb-amber bg-[#FFFFFF] border border-[#D97706]/50 hover:bg-[#D97706] hover:text-white rounded-xs transition-colors cursor-pointer"
                        title={`Inspect Fundamental Joeliardi, Berita & AI untuk ${pos.stock.ticker}`}
                      >
                        <Scale className="w-2.5 h-2.5" />
                        <span>Inspect</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sleeve: Momentum (12-1) & Size Multifactor Sleeve */}
        <div className="p-4 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#E4E2DD] pb-2.5">
            <div>
              <div className="text-xs font-bold text-[#0284C7] bb-cyan">
                <MetricTooltip
                  label={`Keranjang 2 · Momentum Live & Barbell 1/β Alpha (${momentumValuePositions.length} Saham)`}
                  title="Keranjang 2: Akselerasi Momentum & Upside Asimetris (45% Porsi Saham)"
                  laymanExplanation="Berisi saham-saham berkualitas tinggi (termasuk bervolatilitas/Beta tinggi) dengan alokasi proporsional 1/Beta dan batas maksimum per saham sesuai pendekatan Barbell Taleb (2012)."
                  practicalGuide="Berfungsi sebagai mesin pendongkrak keuntungan (alpha) dengan ukuran posisi yang dikendalikan secara matematis oleh 1/Beta."
                  align="right"
                  className="text-[#0284C7] bb-cyan"
                />
              </div>
              <span className="text-[11px] text-neutral-500 block mt-0.5">
                Kriteria: Lolos Kualitas GP/A · Sizing Proporsional 1/β dengan Batas Alokasi Maksimum
              </span>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-[#0284C7] bb-cyan">
                {analytics.equityExposureWeightPct -
                  Math.round(analytics.equityExposureWeightPct * 0.55)}
                % Porsi Modal
              </span>
              <span className="block text-xs font-semibold text-[#111315]">
                Rp {Math.round(activeEquityPoolIdr * 0.45).toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          <div className="divide-y divide-[#E4E2DD]/70 text-xs">
            {momentumValuePositions.map((pos, idx) => {
              const is1DPos = pos.stock.change1D >= 0;
              const is30DPos = pos.stock.return30D >= 0;
              const divYield = pos.stock.dividendYieldPct ?? 0;
              const sleeveScore = computeSleeveSpecificScore(
                pos.stock,
                'AGGRESSIVE',
                selectionMode
              );
              const reasonText = getBasketSelectionReason(
                pos.stock,
                'AGGRESSIVE',
                selectionMode
              );

              return (
                <div
                  key={pos.stock.ticker}
                  className="py-2.5 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-neutral-400">
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-[#D97706] bb-amber">
                        {pos.stock.ticker}
                      </span>
                      <span className="font-bold text-[#111315]">
                        @ Rp {pos.stock.lastPrice.toLocaleString('id-ID')}
                      </span>
                      <span
                        className={`text-[11px] font-bold ${
                          is1DPos ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'
                        }`}
                      >
                        ({is1DPos ? '+' : ''}
                        {pos.stock.change1D.toFixed(2)}%)
                      </span>
                      <span
                        className={`text-[11px] font-bold ${
                          is30DPos ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'
                        }`}
                      >
                        [30D: {is30DPos ? '+' : ''}
                        {pos.stock.return30D.toFixed(2)}%]
                      </span>
                      {divYield > 0 && (
                        <span
                          title={`Emiten Pembagi Dividen Tunai (TTM Yield Yahoo Finance ~${divYield.toFixed(2)}%/thn)`}
                          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-[#0D5C46] bg-[#059669]/10 border border-[#059669]/35 rounded-xs"
                        >
                          DIV {divYield.toFixed(2)}%
                        </span>
                      )}
                      <span
                        title={
                          pos.stock.isLiveFetched
                            ? 'Data Tersinkronisasi Live'
                            : 'Menunggu Sinkronisasi'
                        }
                        className={`inline-flex items-center justify-center p-1 rounded-xs border ${
                          pos.stock.isLiveFetched
                            ? 'text-[#0D5C46] border-[#059669]/40 bg-[#059669]/10'
                            : 'text-[#D97706] border-[#F59E0B]/40 bg-[#F59E0B]/10'
                        }`}
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {pos.stock.name} · {pos.stock.sector} · Bobot 1/β{' '}
                      <strong>{pos.totalPortfolioWeightPct.toFixed(1)}%</strong> (β {pos.stock.beta1Y.toFixed(2)}x · GP/A{' '}
                      {(pos.stock.grossProfitabilityToAssets ?? pos.stock.roe * 0.85).toFixed(1)}%) · Skor Momentum{' '}
                      <strong className="text-[#0284C7] bb-cyan">{sleeveScore.toFixed(2)}</strong>
                    </div>
                    <div className="text-[10px] font-semibold text-[#0284C7] bb-cyan mt-0.5">
                      Dasar: {reasonText}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <div>
                      <div className="font-bold text-[#111315]">
                        {pos.lots.toLocaleString('id-ID')} Lot
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        Rp {pos.allocatedIdr.toLocaleString('id-ID')}
                      </div>
                    </div>
                    {onInspectTicker && (
                      <button
                        type="button"
                        onClick={() => onInspectTicker(pos.stock.ticker)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-[#D97706] bb-amber bg-[#FFFFFF] border border-[#D97706]/50 hover:bg-[#D97706] hover:text-white rounded-xs transition-colors cursor-pointer"
                        title={`Inspect Fundamental Joeliardi, Berita & AI untuk ${pos.stock.ticker}`}
                      >
                        <Scale className="w-2.5 h-2.5" />
                        <span>Inspect</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
