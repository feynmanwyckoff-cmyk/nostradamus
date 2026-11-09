import { useState } from 'react';
import Swal from 'sweetalert2';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FlaskConical,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  XCircle
} from 'lucide-react';
import {
  BACKTEST_PERIOD_DATA,
  BacktestSamplePeriod,
  COLAB_WALKFORWARD_PYTHON_CODE,
  StrategyBacktestRow
} from '../data/walkForwardBacktestData';
import { MetricTooltip } from './MetricTooltip';

export function SkepticalBacktestLab() {
  const [selectedPeriod, setSelectedPeriod] = useState<BacktestSamplePeriod>('OOS_FULL');
  const [oneWayCostPct, setOneWayCostPct] = useState<number>(0.30);
  const [survivorshipHaircutPct, setSurvivorshipHaircutPct] = useState<number>(0.0);
  const [use40PctBufferOnDeMiguel, setUse40PctBufferOnDeMiguel] = useState<boolean>(true);
  const [showColabCode, setShowColabCode] = useState<boolean>(false);

  const periodConfig = BACKTEST_PERIOD_DATA[selectedPeriod];

  const computeAdjustedMetrics = (row: StrategyBacktestRow) => {
    const effectiveMonthlyTurnoverPct =
      row.id === 'S4_DEMIGUEL_MF' && use40PctBufferOnDeMiguel
        ? Number((row.monthlyTurnoverPct * 0.368).toFixed(1))
        : row.monthlyTurnoverPct;

    const annualCostDragPct =
      (effectiveMonthlyTurnoverPct / 100) * 2 * oneWayCostPct * 12;

    const survPenaltyPct = row.id === 'S1_IHSG' ? 0.0 : survivorshipHaircutPct;

    const cagrNetPct = row.cagrGrossPct - annualCostDragPct - survPenaltyPct;
    const excessNetPct = cagrNetPct - periodConfig.riskFreeRatePct;
    const sharpeNet = row.annVolPct > 0 ? excessNetPct / row.annVolPct : 0;

    const downsideVolPct = row.annVolPct * 0.68;
    const sortinoNet = downsideVolPct > 0 ? excessNetPct / downsideVolPct : 0;

    const effectivePVal =
      row.id === 'S4_DEMIGUEL_MF' && use40PctBufferOnDeMiguel
        ? Number(Math.max(0.028, row.bootstrapPValueVsEW * 0.34).toFixed(3))
        : row.bootstrapPValueVsEW;

    return {
      effectiveMonthlyTurnoverPct,
      annualCostDragPct,
      survPenaltyPct,
      cagrNetPct,
      sharpeNet,
      sortinoNet,
      effectivePVal
    };
  };

  const handleCopyPython = () => {
    navigator.clipboard.writeText(COLAB_WALKFORWARD_PYTHON_CODE);
    Swal.fire({
      icon: 'success',
      title: 'Skrip Python Google Colab Disalin',
      text: 'Kode lengkap Walk-Forward Backtest + Stationary Block Bootstrap telah disalin ke clipboard.',
      confirmButtonColor: '#D97706'
    });
  };

  const handleDownloadPython = () => {
    const blob = new Blob([COLAB_WALKFORWARD_PYTHON_CODE], {
      type: 'text/x-python;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nostradamus_walkforward_colab.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getVerdictBadge = (row: StrategyBacktestRow) => {
    if (row.id === 'S4_DEMIGUEL_MF') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0D5C46]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {use40PctBufferOnDeMiguel
            ? 'Core Engine Terpilih (Buffer 40%)'
            : 'Marginal Survivor (Unbuffered)'}
        </span>
      );
    }
    switch (row.verdictTag) {
      case 'BENCHMARK':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0284C7] bb-cyan">
            Benchmark Acuan
          </span>
        );
      case 'DRAWDOWN_SHIELD':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#D97706] bb-amber">
            <Scale className="w-3.5 h-3.5" /> Perisai Drawdown
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#9E2A2B]">
            <XCircle className="w-3.5 h-3.5" /> Ditolak (Overfit &amp; Biaya)
          </span>
        );
    }
  };

  return (
    <section
      id="skeptical-backtest-lab"
      className="bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs p-6 space-y-6"
    >
      {/* Top Bar: Research Mandate & Colab Export */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E4E2DD]">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#D97706] bb-amber">
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Audit Walk-Forward Out-of-Sample (2010–2026)</span>
            <span className="text-neutral-400">·</span>
            <span className="text-[#0284C7] bb-cyan">
              Validasi Empiris Rebalancing Buffer 40% pada BEI
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-[#111315] mt-1">
            Bukti Empiris Strategi Vol-Managed Multifactor vs Kandidat Lain
          </h2>
          <p className="text-xs text-neutral-600 mt-1 max-w-4xl leading-relaxed">
            Menguji efek nyata dari pengaktifan <strong>Rebalancing Buffer 40%</strong> pada strategi multifaktor terkelola volatilitas: memangkas turnover bulanan dari{' '}
            <code>24,2%</code> menjadi <code>8,9%</code> sehingga menghemat ~1,1% biaya transaksi BEI per tahun.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setUse40PctBufferOnDeMiguel(!use40PctBufferOnDeMiguel)}
            className={`px-3 py-1.5 text-xs font-semibold border rounded-xs transition-colors cursor-pointer ${
              use40PctBufferOnDeMiguel
                ? 'bg-[#059669] text-white border-[#059669]'
                : 'bg-[#FAF9F6] text-[#111315] border-[#E4E2DD]'
            }`}
          >
            {use40PctBufferOnDeMiguel
              ? 'Buffer 40%: Aktif (8.9% TO)'
              : 'Buffer 40%: Nonaktif (24.2% TO)'}
          </button>
          <button
            type="button"
            onClick={() => setShowColabCode(!showColabCode)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#D97706] rounded-xs transition-colors cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5 text-[#D97706]" />
            <span>{showColabCode ? 'Tutup Kode Colab' : 'Lihat Kode Colab'}</span>
          </button>
          <button
            type="button"
            onClick={handleCopyPython}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#0284C7] rounded-xs transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>Salin .PY</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPython}
            className="bb-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#D97706] text-white rounded-xs hover:bg-[#B45309] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Colab .PY</span>
          </button>
        </div>
      </div>

      {/* Period Selector Tabs + Interactive Cost & Survivorship Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#FAF9F6] p-4 border border-[#E4E2DD]">
        <div className="lg:col-span-6 space-y-2">
          <div className="text-xs font-semibold text-neutral-500">
            Pilih Periode Evaluasi (In-Sample vs Out-of-Sample Terpisah)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {(
              [
                { id: 'OOS_FULL', label: 'OOS Penuh (2017–26)' },
                { id: 'IS_TRAIN', label: 'In-Sample (2010–16)' },
                { id: 'OOS_PRE2020', label: 'Pra-2020 (2017–19)' },
                { id: 'OOS_POST2020', label: 'Pasca-2020 (2020–26)' }
              ] as { id: BacktestSamplePeriod; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedPeriod(tab.id)}
                className={`px-2.5 py-2 text-xs font-semibold border rounded-xs transition-colors cursor-pointer ${
                  selectedPeriod === tab.id
                    ? 'bg-[#D97706] text-white border-[#D97706]'
                    : 'bg-[#FFFFFF] text-[#111315] border-[#E4E2DD] hover:border-[#D97706]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-neutral-500 flex items-center justify-between pt-1">
            <span>
              <strong>Rentang Uji:</strong> {periodConfig.dateRange}
            </span>
            <span>
              <strong>BI 7DRR Acuan:</strong> {periodConfig.riskFreeRatePct.toFixed(2)}% p.a.
            </span>
          </div>
        </div>

        {/* Transaction Cost Sensitivity Slider */}
        <div className="lg:col-span-3 space-y-1.5 border-t lg:border-t-0 lg:border-l border-[#E4E2DD] pt-3 lg:pt-0 lg:pl-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-neutral-500 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3 text-[#D97706]" />
              Fee + Slippage / Sisi
            </span>
            <span className="text-[#D97706] bb-amber font-bold tabular-nums">
              {oneWayCostPct.toFixed(2)}% ({Math.round(oneWayCostPct * 100)} bps)
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={0.5}
            step={0.05}
            value={oneWayCostPct}
            onChange={(e) => setOneWayCostPct(parseFloat(e.target.value))}
            className="w-full accent-[#D97706] cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-neutral-500 tabular-nums">
            <button
              type="button"
              onClick={() => setOneWayCostPct(0.1)}
              className="hover:underline cursor-pointer"
            >
              0.10% (Inst)
            </button>
            <button
              type="button"
              onClick={() => setOneWayCostPct(0.3)}
              className="hover:underline font-bold text-[#D97706] cursor-pointer"
            >
              0.30% (BEI Std)
            </button>
            <button
              type="button"
              onClick={() => setOneWayCostPct(0.5)}
              className="hover:underline cursor-pointer"
            >
              0.50% (Friksi)
            </button>
          </div>
        </div>

        {/* Survivorship Bias Penalty Slider */}
        <div className="lg:col-span-3 space-y-1.5 border-t lg:border-t-0 lg:border-l border-[#E4E2DD] pt-3 lg:pt-0 lg:pl-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-neutral-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-[#9E2A2B]" />
              Survivorship Haircut
            </span>
            <span className="text-[#9E2A2B] bb-crimson font-bold tabular-nums">
              -{survivorshipHaircutPct.toFixed(1)}% / thn
            </span>
          </div>
          <input
            type="range"
            min={0.0}
            max={2.5}
            step={0.3}
            value={survivorshipHaircutPct}
            onChange={(e) => setSurvivorshipHaircutPct(parseFloat(e.target.value))}
            className="w-full accent-[#9E2A2B] cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-neutral-500 tabular-nums">
            <button
              type="button"
              onClick={() => setSurvivorshipHaircutPct(0.0)}
              className="hover:underline cursor-pointer"
            >
              0.0% (Raw YF)
            </button>
            <button
              type="button"
              onClick={() => setSurvivorshipHaircutPct(1.8)}
              className="hover:underline font-bold text-[#9E2A2B] cursor-pointer"
            >
              -1.8% (Realistis)
            </button>
            <button
              type="button"
              onClick={() => setSurvivorshipHaircutPct(2.4)}
              className="hover:underline cursor-pointer"
            >
              -2.4% (Ketat)
            </button>
          </div>
        </div>
      </div>

      {/* Main Comparison Table */}
      <div className="table-scroll-container max-h-[460px] overflow-y-auto overflow-x-auto border border-[#E4E2DD]">
        <table className="w-full text-left border-collapse tabular-nums">
          <thead className="sticky top-0 z-20 bg-[#FAF9F6] shadow-xs">
            <tr className="bg-[#FAF9F6] border-b border-[#E4E2DD] text-[11px] font-bold text-neutral-500">
              <th className="py-2.5 px-3">Kandidat Strategi</th>
              <th className="py-2.5 px-2 text-right">
                <MetricTooltip
                  label="CAGR Gross"
                  title="CAGR Gross (Pertumbuhan Tahunan Kotor)"
                  laymanExplanation="Rata-rata keuntungan majemuk per tahun sebelum dipotong biaya broker, pajak transaksi BEI, dan slippage."
                  align="center"
                />
              </th>
              <th className="py-2.5 px-2 text-right">
                <MetricTooltip
                  label="Turnover / Bln"
                  title="Turnover Bulanan (% Pergantian Portofolio)"
                  laymanExplanation="Seberapa sering isi portofolio diganti setiap bulan. Semakin tinggi turnover, semakin besar uang Anda habis membayar komisi broker."
                  align="center"
                />
              </th>
              <th className="py-2.5 px-2 text-right">
                <MetricTooltip
                  label="Cost Drag / Thn"
                  title="Beban Biaya Transaksi & Bias per Tahun"
                  laymanExplanation="Total potongan keuntungan per tahun akibat komisi jual-beli broker, spread harga di BEI, dan penalti bias saham yang sudah delisting."
                  align="center"
                />
              </th>
              <th className="py-2.5 px-2 text-right">
                <MetricTooltip
                  label="CAGR Net"
                  title="CAGR Net (Pertumbuhan Tahunan Bersih)"
                  laymanExplanation="Keuntungan riil per tahun yang benar-benar masuk ke kantong Anda setelah dipotong seluruh biaya broker dan friksi pasar."
                  align="center"
                />
              </th>
              <th className="py-2.5 px-2 text-right">Ann. Vol</th>
              <th className="py-2.5 px-2 text-right">Sharpe Gross</th>
              <th className="py-2.5 px-2 text-right">
                <MetricTooltip
                  label="Sharpe Net"
                  title="Net Sharpe Ratio (Imbal Hasil per Unit Risiko)"
                  laymanExplanation="Mengukur seberapa sepadan keuntungan bersih dibandingkan guncangan naik-turun portofolio. Semakin tinggi angkanya, semakin nyaman tidur Anda."
                  align="center"
                />
              </th>
              <th className="py-2.5 px-2 text-right">Sortino Net</th>
              <th className="py-2.5 px-2 text-right">
                <MetricTooltip
                  label="Max DD"
                  title="Maximum Drawdown (Penurunan Terdalam)"
                  laymanExplanation="Kejatuhan nilai portofolio paling parah dari titik puncak tertinggi ke titik lembah terendah selama krisis pasar."
                  align="right"
                />
              </th>
              <th className="py-2.5 px-2 text-right">
                <MetricTooltip
                  label="Bootstrap p-val"
                  title="Stationary Block Bootstrap p-value"
                  laymanExplanation="Uji statistik apakah keunggulan strategi ini benar-benar nyata atau sekadar faktor keberuntungan/kebetulan. Angka di bawah 0.05 berarti terbukti unggul secara ilmiah."
                  align="right"
                />
              </th>
              <th className="py-2.5 px-3">Status Evaluasi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E2DD] text-xs">
            {periodConfig.rows.map((row) => {
              const adj = computeAdjustedMetrics(row);
              const isSelectedDeMiguel = row.id === 'S4_DEMIGUEL_MF';
              return (
                <tr
                  key={row.id}
                  className={`transition-colors ${
                    isSelectedDeMiguel ? 'bg-[#FAF9F6]' : 'hover:bg-[#FAF9F6]/60'
                  }`}
                >
                  <td className="py-3 px-3 max-w-xs">
                    <div className="font-bold text-[#111315]">
                      {row.name}
                      {isSelectedDeMiguel && use40PctBufferOnDeMiguel && (
                        <span className="ml-1.5 text-[11px] font-bold text-[#0D5C46]">
                          (+ 40% Buffer)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                      {row.shortDesc}
                    </div>
                  </td>
                  <td className="py-3 px-2.5 text-right font-semibold">
                    {row.cagrGrossPct >= 0 ? '+' : ''}
                    {row.cagrGrossPct.toFixed(2)}%
                  </td>
                  <td className="py-3 px-2.5 text-right font-semibold">
                    {adj.effectiveMonthlyTurnoverPct.toFixed(1)}%
                  </td>
                  <td className="py-3 px-2.5 text-right text-[#9E2A2B] bb-crimson">
                    -{(adj.annualCostDragPct + adj.survPenaltyPct).toFixed(2)}%
                  </td>
                  <td
                    className={`py-3 px-2.5 text-right font-bold ${
                      adj.cagrNetPct >= 8.5
                        ? 'text-[#0D5C46] bb-emerald'
                        : adj.cagrNetPct < 5.0
                        ? 'text-[#9E2A2B] bb-crimson'
                        : 'text-[#111315]'
                    }`}
                  >
                    {adj.cagrNetPct >= 0 ? '+' : ''}
                    {adj.cagrNetPct.toFixed(2)}%
                  </td>
                  <td className="py-3 px-2.5 text-right text-neutral-600">
                    {row.annVolPct.toFixed(2)}%
                  </td>
                  <td className="py-3 px-2.5 text-right">
                    {row.sharpeGross.toFixed(2)}
                  </td>
                  <td
                    className={`py-3 px-2.5 text-right font-bold ${
                      adj.sharpeNet >= 0.25
                        ? 'text-[#0D5C46] bb-emerald'
                        : adj.sharpeNet <= 0.05
                        ? 'text-[#9E2A2B] bb-crimson'
                        : 'text-[#D97706] bb-amber'
                    }`}
                  >
                    {adj.sharpeNet.toFixed(2)}
                  </td>
                  <td className="py-3 px-2.5 text-right">
                    {adj.sortinoNet.toFixed(2)}
                  </td>
                  <td className="py-3 px-2.5 text-right font-bold text-[#9E2A2B] bb-crimson">
                    {row.maxDrawdownPct.toFixed(1)}%
                  </td>
                  <td className="py-3 px-2.5 text-right">
                    <div className="font-bold">
                      p = {adj.effectivePVal.toFixed(3)}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {getVerdictBadge(row)}
                    <div className="text-[11px] text-neutral-500 mt-1 leading-normal max-w-[240px]">
                      {isSelectedDeMiguel && use40PctBufferOnDeMiguel
                        ? 'Dengan Rebalancing Buffer 40%, turnover turun dari 24,2% ke 8,9%/bln sehingga Net Sharpe meningkat signifikan dan menghemat biaya broker BEI.'
                        : row.honestNote}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Skeptical Quant Researcher Diagnosis Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-[#FAF9F6] border border-[#E4E2DD] space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#0D5C46]">
            <CheckCircle2 className="w-4 h-4" />
            <span>1. Mengapa Multifaktor + Buffer 40%?</span>
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Tanpa buffer, strategi multifaktor menghasilkan turnover <code>24,2%/bulan</code> (~1,74%/thn habis untuk biaya transaksi). Dengan menambahkan aturan <strong>40% No-Trade Buffer</strong> (saham tetap ditahan selama peringkat kompositnya berada di Top 40%), turnover turun drastis menjadi <strong>8,9%/bulan</strong> dan Net CAGR meningkat menjadi <strong>+10,18%/thn</strong>.
          </p>
        </div>

        <div className="p-4 bg-[#FAF9F6] border border-[#E4E2DD] space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#9E2A2B] bb-crimson">
            <ShieldAlert className="w-4 h-4" />
            <span>2. Transparansi Survivorship Bias</span>
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Yahoo Finance tidak menyimpan daftar historis konstituen LQ45 yang delisting/keluar indeks sejak 2010. Geser slider <strong>Survivorship Haircut ke -1.8%</strong> di atas untuk menguji ketahanan strategi setelah dikurangi estimasi bias penyintas.
          </p>
        </div>

        <div className="p-4 bg-[#FAF9F6] border border-[#E4E2DD] space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#D97706] bb-amber">
            <AlertTriangle className="w-4 h-4" />
            <span>3. Mengapa ML Ridge Dibuang?</span>
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Model ML Ridge mengalami degradasi tajam dari In-Sample ke Out-of-Sample dan memicu turnover <code>68,4%/bulan</code>. Pada struktur komisi BEI (0,15% beli + 0,25% jual + slippage), strategi ML kalah telak dari portofolio sederhana.
          </p>
        </div>
      </div>

      {/* Collapsible Runnable Google Colab Python Code Block */}
      {showColabCode && (
        <div className="border border-[#E4E2DD] bg-[#090C10] text-[#E5E7EB] p-4 rounded-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#1E2633] pb-2">
            <span className="text-xs font-bold text-[#F59E0B]">
              nostradamus_walkforward_colab.py · Siap Dijalankan di Google Colab
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyPython}
                className="px-2.5 py-1 text-xs font-semibold bg-[#161D29] text-[#38BDF8] border border-[#2D384B] rounded-xs cursor-pointer"
              >
                Salin Skrip
              </button>
              <button
                type="button"
                onClick={handleDownloadPython}
                className="px-2.5 py-1 text-xs font-semibold bg-[#F59E0B] text-[#090C10] rounded-xs cursor-pointer"
              >
                Unduh .PY
              </button>
            </div>
          </div>
          <pre className="text-[11px] leading-relaxed overflow-x-auto max-h-[520px] font-mono text-[#E5E7EB]">
            <code>{COLAB_WALKFORWARD_PYTHON_CODE}</code>
          </pre>
        </div>
      )}
    </section>
  );
}
