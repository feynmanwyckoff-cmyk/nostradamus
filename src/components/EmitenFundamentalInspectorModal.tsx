import React, { useEffect, useMemo, useState } from 'react';
import {
  EmitenNewsCategory,
  MarketRegimeStatus,
  NewsSentimentItem,
  StockMetrics
} from '../types/quant';
import { evaluateJoeliardiOosFundamental } from '../utils/quantEngine';
import {
  fetchLiveEmitenSpecificNews,
  requestEmitenAiInspection
} from '../utils/liveMarketFetcher';
import { formatIdrPriceDisplay } from '../utils/numberFormat';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Newspaper,
  Scale,
  TrendingUp,
  Award,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  BookOpen
} from 'lucide-react';

interface EmitenFundamentalInspectorModalProps {
  stock: StockMetrics | null;
  regimeStatus?: MarketRegimeStatus;
  onClose: () => void;
  onToggleHscFlag?: (ticker: string, currentlyFlagged: boolean) => void;
}

export function EmitenFundamentalInspectorModal({
  stock,
  regimeStatus = 'WASPADA',
  onClose,
  onToggleHscFlag
}: EmitenFundamentalInspectorModalProps) {
  const [recentNews, setRecentNews] = useState<NewsSentimentItem[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState<boolean>(false);
  const [userQuestion, setUserQuestion] = useState<string>('');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiGenerated, setIsAiGenerated] = useState<boolean>(false);
  const [aiGeneratedAt, setAiGeneratedAt] = useState<string | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);

  const joeliardiEval = useMemo(() => {
    if (!stock) return null;
    return evaluateJoeliardiOosFundamental(stock);
  }, [stock]);

  useEffect(() => {
    if (!stock) return;
    let isMounted = true;
    setIsLoadingNews(true);
    setAiAnalysis(null);
    setUserQuestion('');

    fetchLiveEmitenSpecificNews(stock.ticker, stock.name, stock.sector, stock)
      .then((items) => {
        if (isMounted) {
          setRecentNews(items);
          setIsLoadingNews(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoadingNews(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [stock]);

  if (!stock || !joeliardiEval) return null;

  const handleRunAiAnalysis = async (customPromptOverride?: string) => {
    const activeQuestion =
      customPromptOverride !== undefined ? customPromptOverride : userQuestion;
    if (customPromptOverride !== undefined) {
      setUserQuestion(customPromptOverride);
    }

    setIsAnalyzingAi(true);
    try {
      const result = await requestEmitenAiInspection({
        stock,
        joeliardiEval,
        recentNews,
        userQuestion: activeQuestion,
        regimeStatus
      });
      setAiAnalysis(result.analysis);
      setIsAiGenerated(result.isAiGenerated);
      setAiGeneratedAt(result.generatedAt);
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const getCategoryBadge = (cat?: EmitenNewsCategory) => {
    switch (cat) {
      case 'DIVIDEN_RUPS':
        return {
          label: 'DIVIDEN & RUPS',
          cls: 'text-[#0D5C46] bg-[#059669]/10 border-[#059669]/40'
        };
      case 'CORPORATE_ACTION_MA':
        return {
          label: 'CORPORATE ACTION / M&A',
          cls: 'text-[#0284C7] bg-[#0284C7]/10 border-[#0284C7]/40'
        };
      case 'FINANCIAL_EARNINGS':
        return {
          label: 'KINERJA KEUANGAN',
          cls: 'text-[#D97706] bg-[#F59E0B]/10 border-[#F59E0B]/40'
        };
      case 'REGULATORY_UMA_ISSUE':
        return {
          label: 'ISU REGULASI / UMA / HSC',
          cls: 'text-[#9E2A2B] bg-[#E11D48]/10 border-[#E11D48]/40'
        };
      default:
        return {
          label: 'BERITA EMITEN',
          cls: 'text-neutral-600 bg-neutral-500/10 border-neutral-400/40'
        };
    }
  };

  const gradeBadgeCls = stock.isHscFlagged
    ? 'bg-[#E11D48]/15 text-[#9E2A2B] border-[#E11D48]/50'
    : joeliardiEval.totalConvictionScore >= 75
    ? 'bg-[#059669]/15 text-[#0D5C46] border-[#059669]/50'
    : joeliardiEval.totalConvictionScore >= 58
    ? 'bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/50'
    : 'bg-[#E11D48]/15 text-[#9E2A2B] border-[#E11D48]/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="px-5 py-4 bg-[#FAF9F6] border-b border-[#E4E2DD] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xs bg-[#D97706]/10 border border-[#D97706]/30 text-[#D97706]">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bb-amber">
                  PRE-BUY FUNDAMENTAL &amp; OOS QUANT INSPECTOR // PRINSIP JOELIARDI SUNENDAR
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-xs border ${gradeBadgeCls}`}
                >
                  {joeliardiEval.convictionGrade} · SKOR {joeliardiEval.totalConvictionScore}/100
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#111315] flex flex-wrap items-center gap-2 mt-0.5">
                <span className="font-mono">{stock.ticker}</span>
                <span className="text-neutral-400 font-normal">·</span>
                <span>{stock.name}</span>
                <span className="text-xs font-normal text-neutral-500">
                  ({stock.sector})
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onToggleHscFlag && (
              <button
                type="button"
                onClick={() => onToggleHscFlag(stock.ticker, Boolean(stock.isHscFlagged))}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xs border transition-colors cursor-pointer ${
                  stock.isHscFlagged
                    ? 'bg-[#E11D48] text-white border-[#E11D48] hover:bg-[#BE123C]'
                    : 'bg-[#FFFFFF] text-[#9E2A2B] border-[#E11D48]/40 hover:bg-[#E11D48]/10'
                }`}
                title="Tandai atau lepas label saham HSC (High Speculative Concentration)"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>
                  {stock.isHscFlagged ? 'Berlabel HSC (Klik Lepas)' : 'Tandai sebagai HSC'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xs border border-[#E4E2DD] text-neutral-500 hover:text-[#111315] hover:border-neutral-400 cursor-pointer"
              aria-label="Tutup Inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* HSC Warning Banner if Flagged */}
          {stock.isHscFlagged && (
            <div className="p-3.5 bg-[#E11D48]/10 border border-[#E11D48]/40 rounded-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#9E2A2B] shrink-0 mt-0.5" />
              <div className="text-xs text-[#9E2A2B] space-y-1">
                <div className="font-bold uppercase tracking-wider">
                  PERINGATAN SAHAM HSC (HIGH SPECULATIVE / CORNERED RISK) — DIBLOKIR DARI TOP DECILE BUY
                </div>
                <p className="leading-relaxed">
                  {stock.hscReason ||
                    'Saham ini terindikasi memiliki karakteristik spekulatif tinggi atau fundamental yang tidak mendukung reli harga.'}{' '}
                  Sesuai prinsip perlindungan modal Joeliardi Sunendar &amp; filter Out-of-Sample DeMiguel, emiten ini dikunci pada zona <strong>Rotate Out</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Top Valuation & Intrinsic Value Bar (Joeliardi-Graham Model) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                HARGA PASAR LIVE (BEI)
              </span>
              <div className="text-lg font-bold font-mono text-[#111315] mt-1">
                Rp {formatIdrPriceDisplay(stock.lastPrice)}
              </div>
              <span
                className={`text-[11px] font-bold font-mono ${
                  stock.change1D >= 0 ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'
                }`}
              >
                1D: {stock.change1D >= 0 ? '+' : ''}
                {stock.change1D.toFixed(2)}% · 30D: {stock.return30D >= 0 ? '+' : ''}
                {stock.return30D.toFixed(1)}%
              </span>
            </div>

            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bb-amber block">
                NILAI INTRINSIK (JOELIARDI-GRAHAM)
              </span>
              <div className="text-lg font-bold font-mono text-[#111315] mt-1">
                Rp {formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)}
              </div>
              <span className="text-[11px] text-neutral-500 font-mono">
                EPS ~Rp {joeliardiEval.estimatedEpsIdr.toLocaleString('id-ID')} · BVPS ~Rp{' '}
                {joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                MARGIN OF SAFETY (MOS)
              </span>
              <div
                className={`text-lg font-bold font-mono mt-1 ${
                  joeliardiEval.marginOfSafetyPct >= 10
                    ? 'text-[#0D5C46]'
                    : joeliardiEval.marginOfSafetyPct >= 0
                    ? 'text-[#D97706]'
                    : 'text-[#9E2A2B]'
                }`}
              >
                {joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}
                {joeliardiEval.marginOfSafetyPct.toFixed(1)}%
              </div>
              <span className="text-[11px] font-bold text-neutral-600 block truncate">
                {joeliardiEval.valuationLabel}
              </span>
            </div>

            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                VALUASI MULTIPEL (IMPLIED VS WAJAR)
              </span>
              <div className="text-sm font-bold font-mono text-[#111315] mt-1">
                PER {joeliardiEval.impliedPer}x{' '}
                <span className="text-xs font-normal text-neutral-500">
                  (Wajar {joeliardiEval.joeliardiFairPer}x)
                </span>
              </div>
              <span className="text-xs font-bold font-mono text-[#0284C7] bb-cyan block mt-0.5">
                PBV {joeliardiEval.impliedPbv}x{' '}
                <span className="text-[11px] font-normal text-neutral-500">
                  (Wajar {joeliardiEval.joeliardiFairPbv}x)
                </span>
              </span>
            </div>
          </div>

          {/* 4 Pillar Scores Grid: Joeliardi Sunendar + Out-of-Sample (OOS) Quant */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF]">
              <div className="flex items-center justify-between text-xs font-bold text-[#111315] mb-1">
                <span>1. Kualitas Bisnis &amp; Moat</span>
                <span className="font-mono text-[#0D5C46]">
                  {joeliardiEval.businessQualityScore}/100
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#E4E2DD] rounded-xs overflow-hidden mb-2">
                <div
                  className="h-full bg-[#059669]"
                  style={{ width: `${joeliardiEval.businessQualityScore}%` }}
                />
              </div>
              <div className="text-[11px] text-neutral-600 font-mono space-y-0.5">
                <div>ROE: {stock.roe.toFixed(1)}% (vs Ke 10,5%)</div>
                <div>Op. Margin: {stock.operatingMargin.toFixed(1)}%</div>
                <div>Div. Yield TTM: {(stock.dividendYieldPct ?? 0).toFixed(2)}%</div>
              </div>
            </div>

            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF]">
              <div className="flex items-center justify-between text-xs font-bold text-[#111315] mb-1">
                <span>2. Kesehatan Neraca</span>
                <span className="font-mono text-[#0284C7]">
                  {joeliardiEval.balanceSheetHealthScore}/100
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#E4E2DD] rounded-xs overflow-hidden mb-2">
                <div
                  className="h-full bg-[#0284C7]"
                  style={{ width: `${joeliardiEval.balanceSheetHealthScore}%` }}
                />
              </div>
              <div className="text-[11px] text-neutral-600 font-mono space-y-0.5">
                <div>DER: {stock.debtToEquity.toFixed(2)}x</div>
                <div>
                  Status Neraca: {stock.debtToEquity <= 0.8 ? 'Konservatif' : 'Moderat/Tinggi'}
                </div>
                <div>
                  Saringan HSC: {stock.isHscFlagged ? 'Terindikasi HSC' : 'Bebas HSC'}
                </div>
              </div>
            </div>

            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF]">
              <div className="flex items-center justify-between text-xs font-bold text-[#111315] mb-1">
                <span>3. Keamanan Valuasi</span>
                <span className="font-mono text-[#D97706]">
                  {joeliardiEval.valuationSafetyScore}/100
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#E4E2DD] rounded-xs overflow-hidden mb-2">
                <div
                  className="h-full bg-[#D97706]"
                  style={{ width: `${joeliardiEval.valuationSafetyScore}%` }}
                />
              </div>
              <div className="text-[11px] text-neutral-600 font-mono space-y-0.5">
                <div>Skor Faktor Value: {stock.dmuValueScore.toFixed(1)}/10</div>
                <div>Margin of Safety: {joeliardiEval.marginOfSafetyPct}%</div>
                <div>Bobot Value OOS: 35% (Prioritas #1)</div>
              </div>
            </div>

            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF]">
              <div className="flex items-center justify-between text-xs font-bold text-[#111315] mb-1">
                <span>4. Ketahanan OOS Quant</span>
                <span className="font-mono text-[#0D5C46]">
                  {joeliardiEval.oosQuantRobustnessScore}/100
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#E4E2DD] rounded-xs overflow-hidden mb-2">
                <div
                  className="h-full bg-[#059669]"
                  style={{ width: `${joeliardiEval.oosQuantRobustnessScore}%` }}
                />
              </div>
              <div className="text-[11px] text-neutral-600 font-mono space-y-0.5">
                <div>
                  Komposit: {stock.dmuCompositeScore.toFixed(2)}/10 (Top {stock.dmuRankPct}%)
                </div>
                <div>
                  Low-Vol: {stock.dmuLowVolScore.toFixed(1)} · Mom: {stock.dmuMomScore.toFixed(1)}
                </div>
                <div>
                  Volatilitas: {stock.volatilityAnn.toFixed(1)}% (β {stock.beta1Y.toFixed(2)}x)
                </div>
              </div>
            </div>
          </div>

          {/* Strengths & Risks Summary (Joeliardi Sunendar Checklist) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0D5C46]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Kekuatan Fundamental &amp; Kuantitatif OOS</span>
              </div>
              <ul className="space-y-1.5 text-xs text-neutral-700 leading-relaxed">
                {joeliardiEval.keyStrengths.map((str, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[#0D5C46] font-bold">•</span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#9E2A2B]">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Catatan Risiko, Valuasi &amp; Disiplin Eksekusi</span>
              </div>
              <ul className="space-y-1.5 text-xs text-neutral-700 leading-relaxed">
                {joeliardiEval.keyRisks.map((risk, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[#9E2A2B] font-bold">•</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Interactive AI Fundamental & News Analysis Section */}
          <div className="p-4 sm:p-5 bg-[#FAF9F6] border-2 border-[#D97706]/40 rounded-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#D97706] bb-amber shrink-0" />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bb-amber block">
                    CONVICTION ENGINE // JOELIARDI SUNENDAR FUNDAMENTAL + OOS QUANT + LIVE NEWS
                  </span>
                  <h4 className="text-sm font-bold text-[#111315]">
                    Analisis AI Kesehatan Fundamental &amp; Berita Terkini Sebelum Membeli ({stock.ticker})
                  </h4>
                </div>
              </div>
              {aiGeneratedAt && (
                <span className="text-[10px] font-mono text-neutral-500">
                  {isAiGenerated ? 'Gemini AI Live Synthesis' : 'Quant-Fundamental Synthesis'} ·{' '}
                  {new Date(aiGeneratedAt).toLocaleTimeString('id-ID')}
                </span>
              )}
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-neutral-500 mr-1">
                Pertanyaan Cepat:
              </span>
              {[
                `Apakah ${stock.ticker} layak dibeli pada harga Rp ${stock.lastPrice.toLocaleString('id-ID')} menurut prinsip Joeliardi Sunendar?`,
                `Bagaimana dampak berita dan corporate action terbaru terhadap prospek ${stock.ticker}?`,
                `Apakah ${stock.ticker} aman dari jebakan value trap atau indikasi HSC?`
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleRunAiAnalysis(preset)}
                  disabled={isAnalyzingAi}
                  className="px-2.5 py-1 text-[11px] bg-[#FFFFFF] border border-[#E4E2DD] hover:border-[#D97706] text-neutral-700 rounded-xs transition-colors cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Custom User Request Input */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={userQuestion}
                onChange={(e) => setUserQuestion(e.target.value)}
                placeholder={`Tulis fokus analisis untuk ${stock.ticker} (contoh: Evaluasi kelayakan beli sebelum cum dividen / cek kesehatan arus kas)...`}
                className="flex-1 px-3 py-2 text-xs bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs text-[#111315] focus:outline-none focus:border-[#D97706]"
              />
              <button
                type="button"
                onClick={() => handleRunAiAnalysis()}
                disabled={isAnalyzingAi}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#D97706] hover:bg-[#B45309] text-white rounded-xs transition-colors cursor-pointer shrink-0 disabled:opacity-60"
              >
                {isAnalyzingAi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menganalisis Fundamental &amp; Berita...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Buat Analisis AI Pra-Beli</span>
                  </>
                )}
              </button>
            </div>

            {/* Rendered AI Conviction Report */}
            {aiAnalysis ? (
              <div className="p-4 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-2.5 text-xs text-[#111315] leading-relaxed whitespace-pre-line font-sans">
                {aiAnalysis}
              </div>
            ) : (
              <div className="p-3.5 bg-[#FFFFFF]/80 border border-dashed border-[#E4E2DD] rounded-xs text-xs text-neutral-500 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#D97706] shrink-0" />
                <span>
                  Klik tombol <strong>Buat Analisis AI Pra-Beli</strong> atau pilih salah satu pertanyaan cepat di atas untuk membedah kesehatan fundamental {stock.ticker} berdasarkan prinsip Joeliardi Sunendar, validasi OOS, dan berita terkini.
                </span>
              </div>
            )}
          </div>

          {/* Emiten-Specific News, Corporate Actions & Issues Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#E4E2DD] pb-2">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[#0284C7] bb-cyan" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
                  Berita Terkini, Corporate Action &amp; Radar Isu Spesifik Emiten ({stock.ticker})
                </h4>
              </div>
              <span className="text-[11px] font-bold text-[#0284C7] bb-cyan">
                {isLoadingNews ? 'Menarik RSS Emiten...' : `${recentNews.length} Item Terkait`}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recentNews.map((item) => {
                const catBadge = getCategoryBadge(item.emitenCategory);
                return (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#D97706] rounded-xs transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-bold uppercase mb-1.5">
                        <span className={`px-2 py-0.5 rounded-xs border ${catBadge.cls}`}>
                          {catBadge.label}
                        </span>
                        <span className="text-neutral-400 font-mono">
                          {item.source} · {item.publishedAt}
                        </span>
                      </div>
                      <h5 className="text-xs font-bold text-[#111315] group-hover:text-[#D97706] leading-snug">
                        {item.title}
                      </h5>
                      {item.summary && (
                        <p className="text-[11px] text-neutral-600 mt-1 line-clamp-2 leading-relaxed">
                          {item.summary}
                        </p>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-[#E4E2DD]/60 flex items-center justify-between text-[10px] font-bold text-[#D97706]">
                      <span>Sektor: {stock.sector}</span>
                      <span className="inline-flex items-center gap-1 group-hover:underline">
                        <span>Buka Sumber</span>
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
