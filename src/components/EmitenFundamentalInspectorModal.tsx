import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EmitenNewsCategory,
  MarketRegimeStatus,
  NewsSentimentItem,
  StockMetrics,
  StructuredAiConvictionReport
} from '../types/quant';
import { evaluateJoeliardiOosFundamental } from '../utils/quantEngine';
import {
  fetchLiveEmitenSpecificNews,
  fetchLiveIdxTicker,
  requestEmitenAiInspection,
  stripRawMarkdownArtifacts
} from '../utils/liveMarketFetcher';
import {
  exportInspectToHdPng,
  exportInspectToPdf
} from '../utils/exportInspectorReport';
import { formatIdrPriceDisplay } from '../utils/numberFormat';
import { MetricTooltip } from './MetricTooltip';
import {
  X,
  ShieldAlert,
  Sparkles,
  Newspaper,
  Scale,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  BrainCircuit,
  Target,
  Layers,
  ImageDown,
  FileDown,
  FastForward
} from 'lucide-react';

interface EmitenFundamentalInspectorModalProps {
  stock: StockMetrics | null;
  regimeStatus?: MarketRegimeStatus;
  onClose: () => void;
  onToggleHscFlag?: (ticker: string, currentlyFlagged: boolean) => void;
  onStockSynced?: (updatedStock: StockMetrics) => void;
}

const DEFAULT_COT_TITLES = [
  '01. Dekomposisi DuPont & Moat:',
  '02. Spread Valuasi vs SBN 10Y:',
  '03. Uji Silang Momentum & Value Trap:',
  '04. Audit Katalis Berita & Eksekusi:'
];

function parseDirectSummaryHeaderAndBody(rawSummary: string): {
  header: string;
  body: string;
} {
  const clean = String(rawSummary || '').trim();
  const match = clean.match(
    /^((?:Hasil|Kesimpulan|Keputusan|Evaluasi|Audit)\s+[^:]{3,75}):\s*([\s\S]*)$/i
  );
  if (match) {
    return {
      header: match[1].trim(),
      body: match[2].trim()
    };
  }
  const genericColon = clean.match(/^([^:]{5,55}):\s*([\s\S]+)$/);
  if (genericColon && !genericColon[1].includes('.')) {
    return {
      header: genericColon[1].trim(),
      body: genericColon[2].trim()
    };
  }
  return {
    header: 'Hasil Analisis Komite Investasi',
    body: clean
  };
}

function parseTitledCardStep(
  rawText: string,
  fallbackIndex?: number
): {
  header: string | null;
  body: string;
  conclusion: string | null;
} {
  const clean = String(rawText || '').trim();
  let header: string | null = null;
  let remainder = clean;

  const colonIdx = clean.indexOf(':');
  if (colonIdx > 0 && colonIdx <= 68) {
    header = clean.slice(0, colonIdx + 1).trim();
    remainder = clean.slice(colonIdx + 1).trim();
  } else if (typeof fallbackIndex === 'number' && DEFAULT_COT_TITLES[fallbackIndex]) {
    header = DEFAULT_COT_TITLES[fallbackIndex];
  }

  const arrowMatch = remainder.split(/\s*(?:->|→)\s*/);
  if (arrowMatch.length > 1) {
    const bodyPart = arrowMatch.slice(0, -1).join(' → ').trim();
    const conclusionPart = arrowMatch[arrowMatch.length - 1].trim();
    return {
      header,
      body: bodyPart,
      conclusion: conclusionPart || null
    };
  }

  return {
    header,
    body: remainder,
    conclusion: null
  };
}

function renderHighlightedFinancialNarrative(
  text: string,
  ticker?: string
): React.ReactNode {
  if (!text) return null;
  const cleanTicker = (ticker || '').trim().toUpperCase();
  const escapedTicker = cleanTicker.replace(/[^A-Z0-9]/g, '');

  const verdictTerms = [
    'LAYAK DIAKUMULASI BERTAHAP',
    'LAYAK KOLEKSI SELEKTIF SAAT KOREKSI',
    'LEBIH TEPAT DITUNGGU PADA AREA PULLBACK',
    'TIDAK LAYAK DIAKUMULASI',
    'STRONG ACCUMULATE',
    'SELECTIVE BUY',
    'BUY ON WEAKNESS',
    'BUKAN VALUE TRAP',
    'VALUE TRAP',
    'DIVIDEND TRAP',
    'HIGH SPECULATIVE CONCENTRATION',
    'CLEAN NON-HSC',
    'BLOKIR HSC',
    'ROTATE OUT'
  ];

  const metricLabels = [
    'Implied PER',
    'Fair PER',
    'PER',
    'Implied PBV',
    'Fair PBV',
    'PBV',
    'Earnings Yield',
    'SBN 10Y',
    'ROA murni',
    'ROA',
    'ROE organik',
    'ROE',
    'Equity Multiplier',
    'DER',
    'Operating Margin',
    'Op Margin',
    'Margin of Safety',
    'MoS',
    'Equity Yield Spread',
    'Total Shareholder Yield',
    'Skor Value',
    'Skor Komposit',
    'Skor Momentum',
    'Low-Vol',
    'Beta 1Y',
    'Beta',
    'BVPS',
    'EPS',
    'biaya modal',
    'Cost of Equity',
    'Nilai Intrinsik Wajar',
    'Nilai Wajar',
    'margin usaha'
  ];

  const patternParts: string[] = [
    `\\b(?:${verdictTerms.join('|')})\\b`,
    `\\b(?:${metricLabels.join('|')})\\s*~?(?:Rp\\s*)?[+-]?\\d+(?:[.,]\\d+)?(?:%|x|\\/100|\\/10|\\/saham)?`,
    `~?Rp\\s*\\d+(?:[.,]\\d+)*(?:\\/saham)?`,
    `[+-]?\\d+(?:[.,]\\d+)?(?:%|x|\\b\\/100\\b|\\b\\/10\\b)`
  ];

  if (escapedTicker.length >= 4) {
    patternParts.push(`\\b${escapedTicker}\\b`);
  }

  const masterRegex = new RegExp(`(${patternParts.join('|')})`, 'g');
  const segments = text.split(masterRegex);

  return segments.map((seg, i) => {
    if (!seg) return null;
    if (i % 2 === 1) {
      const isVerdict = verdictTerms.some((v) => seg.toUpperCase() === v);
      if (isVerdict) {
        return (
          <strong
            key={i}
            className="font-extrabold text-[#D97706] bb-amber underline decoration-[#D97706]/50 underline-offset-2"
          >
            {seg}
          </strong>
        );
      }
      return (
        <strong key={i} className="font-bold text-[#111315]">
          {seg}
        </strong>
      );
    }
    return <React.Fragment key={i}>{seg}</React.Fragment>;
  });
}

export function EmitenFundamentalInspectorModal({
  stock,
  regimeStatus = 'WASPADA',
  onClose,
  onToggleHscFlag,
  onStockSynced
}: EmitenFundamentalInspectorModalProps) {
  const [liveStockOverride, setLiveStockOverride] = useState<StockMetrics | null>(null);
  const [isSyncingOnDemand, setIsSyncingOnDemand] = useState<boolean>(false);
  const [recentNews, setRecentNews] = useState<NewsSentimentItem[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState<boolean>(false);
  const [userQuestion, setUserQuestion] = useState<string>('');
  const [structuredReport, setStructuredReport] =
    useState<StructuredAiConvictionReport | null>(null);
  const [aiAnalysisFallbackText, setAiAnalysisFallbackText] = useState<string | null>(null);
  const [isAiGenerated, setIsAiGenerated] = useState<boolean>(false);
  const [aiGeneratedAt, setAiGeneratedAt] = useState<string | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);

  // Thinking & Progressive Typing Animation States
  const [thinkingStageIdx, setThinkingStageIdx] = useState<number>(0);
  const [typedCharCount, setTypedCharCount] = useState<number>(0);
  const [visibleCotCount, setVisibleCotCount] = useState<number>(0);
  const [visibleSectionCount, setVisibleSectionCount] = useState<number>(0);
  const [isTypingComplete, setIsTypingComplete] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<'PNG' | 'PDF' | null>(null);

  const typingTimerRef = useRef<number | null>(null);

  // Active stock merges initial prop with on-demand live quote fetched when modal opens
  const activeStock = useMemo(() => {
    if (!stock) return null;
    if (liveStockOverride && liveStockOverride.ticker === stock.ticker) {
      return {
        ...stock,
        ...liveStockOverride,
        isHscFlagged: stock.isHscFlagged,
        hscSource: stock.hscSource,
        hscReason: stock.hscReason
      };
    }
    return stock;
  }, [stock, liveStockOverride]);

  const joeliardiEval = useMemo(() => {
    if (!activeStock) return null;
    return evaluateJoeliardiOosFundamental(activeStock);
  }, [activeStock]);

  const thinkingStages = useMemo(() => {
    if (!activeStock || !joeliardiEval) return [];
    const safeDer = Math.max(0, activeStock.debtToEquity);
    const eqMult = 1 + safeDer;
    const roaDuPont = activeStock.roe / Math.max(1, eqMult);
    const earningsYield =
      joeliardiEval.impliedPer > 0 ? (1 / joeliardiEval.impliedPer) * 100 : 0;
    return [
      `01/04 · Membedah dekomposisi DuPont ${activeStock.ticker}: ROE ${activeStock.roe.toFixed(1)}% → ROA Murni ${roaDuPont.toFixed(1)}% × Equity Multiplier ${eqMult.toFixed(2)}x...`,
      `02/04 · Menguji Spread Valuasi: Earnings Yield ${earningsYield.toFixed(2)}% vs SBN 10Y (6,75%) & Nilai Intrinsik Rp ${formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)}...`,
      `03/04 · Memverifikasi 4-Faktor Out-of-Sample DeMiguel (Skor ${activeStock.dmuCompositeScore.toFixed(2)}/10) & deteksi anomali HSC...`,
      `04/04 · Menyintesis katalis berita emiten (≤ 3 bulan terakhir) & merumuskan strategi eksekusi Komite AI...`
    ];
  }, [activeStock, joeliardiEval]);

  // Trigger progressive typing animation whenever a new structuredReport arrives
  useEffect(() => {
    if (typingTimerRef.current) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    if (!structuredReport || isAnalyzingAi) {
      setTypedCharCount(0);
      setVisibleCotCount(0);
      setVisibleSectionCount(0);
      setIsTypingComplete(false);
      return;
    }

    const parsedSummary = parseDirectSummaryHeaderAndBody(
      structuredReport.directAnswerSummary || ''
    );
    const totalChars = parsedSummary.body.length;
    const totalCot = structuredReport.chainOfThoughtSteps?.length || 0;
    const totalSecs = structuredReport.sections?.length || 0;

    setTypedCharCount(0);
    setVisibleCotCount(0);
    setVisibleSectionCount(0);
    setIsTypingComplete(false);

    let currentChars = 0;
    let currentCot = 0;
    let currentSec = 0;

    typingTimerRef.current = window.setInterval(() => {
      if (currentChars < totalChars) {
        // Type 5 characters per 18ms tick (~275 chars/sec) for a brisk, intelligent streaming feel
        currentChars = Math.min(totalChars, currentChars + 5);
        setTypedCharCount(currentChars);

        // Progressively reveal Chain-of-Thought steps as summary types out
        const progressRatio = totalChars > 0 ? currentChars / totalChars : 1;
        const targetCot = Math.min(totalCot, Math.floor(progressRatio * (totalCot + 1)));
        if (targetCot > currentCot) {
          currentCot = targetCot;
          setVisibleCotCount(currentCot);
        }
      } else if (currentCot < totalCot) {
        currentCot += 1;
        setVisibleCotCount(currentCot);
      } else if (currentSec < totalSecs) {
        currentSec += 1;
        setVisibleSectionCount(currentSec);
      } else {
        setIsTypingComplete(true);
        if (typingTimerRef.current) {
          window.clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
        }
      }
    }, 20);

    return () => {
      if (typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, [structuredReport, isAnalyzingAi]);

  const handleSkipTypingAnimation = () => {
    if (typingTimerRef.current) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (structuredReport) {
      const parsed = parseDirectSummaryHeaderAndBody(
        structuredReport.directAnswerSummary || ''
      );
      setTypedCharCount(parsed.body.length);
      setVisibleCotCount(structuredReport.chainOfThoughtSteps?.length || 0);
      setVisibleSectionCount(structuredReport.sections?.length || 0);
      setIsTypingComplete(true);
    }
  };

  // Helper to run multi-step thinking animation during AI inspection
  const runWithThinkingStages = async <T,>(taskFn: () => Promise<T>): Promise<T> => {
    setThinkingStageIdx(0);
    const stageInterval = window.setInterval(() => {
      setThinkingStageIdx((prev) => (prev < 3 ? prev + 1 : prev));
    }, 420);

    const minThinkingDelay = new Promise((resolve) => setTimeout(resolve, 1650));
    try {
      const [result] = await Promise.all([taskFn(), minThinkingDelay]);
      return result;
    } finally {
      window.clearInterval(stageInterval);
    }
  };

  // Lazy On-Demand Fetch: Pulls live quote, <=3m news, and runs staged thinking + typing AI synthesis
  useEffect(() => {
    if (!stock) return;
    let isMounted = true;
    setLiveStockOverride(null);
    setIsSyncingOnDemand(true);
    setIsLoadingNews(true);
    setStructuredReport(null);
    setAiAnalysisFallbackText(null);
    const defaultQuestion = `Apakah ${stock.ticker} layak dibeli pada harga Rp ${stock.lastPrice.toLocaleString('id-ID')} berdasarkan Nilai Intrinsik Wajar & Fundamental Kualitas Moat?`;
    setUserQuestion(defaultQuestion);

    const runLazyOnDemandInspect = async () => {
      let currentStock = stock;

      // 1. Pull fresh single-ticker quote on demand
      const quotePromise = fetchLiveIdxTicker(stock.ticker)
        .then((fresh) => {
          if (isMounted && fresh && fresh.lastPrice > 0) {
            currentStock = {
              ...stock,
              ...fresh,
              isHscFlagged: stock.isHscFlagged,
              hscSource: stock.hscSource,
              hscReason: stock.hscReason
            };
            setLiveStockOverride(currentStock);
            onStockSynced?.(currentStock);
          }
        })
        .catch(() => {
          // Keep existing snapshot metrics if offline
        })
        .finally(() => {
          if (isMounted) setIsSyncingOnDemand(false);
        });

      // 2. Pull emiten-specific news & corporate actions (filtered to <= 3 months)
      const newsPromise = fetchLiveEmitenSpecificNews(
        stock.ticker,
        stock.name,
        stock.sector,
        stock
      )
        .then((items) => {
          if (isMounted) {
            setRecentNews(items);
            setIsLoadingNews(false);
          }
          return items;
        })
        .catch(() => {
          if (isMounted) {
            setIsLoadingNews(false);
          }
          return [] as NewsSentimentItem[];
        });

      const [, fetchedNews] = await Promise.all([quotePromise, newsPromise]);
      if (!isMounted) return;

      // 3. Run multi-stage thinking animation then progressive typing AI conviction analysis
      setIsAnalyzingAi(true);
      try {
        const evalObj = evaluateJoeliardiOosFundamental(currentStock);
        const qText = `Apakah ${currentStock.ticker} layak dibeli pada harga Rp ${currentStock.lastPrice.toLocaleString('id-ID')} berdasarkan Nilai Intrinsik Wajar & Fundamental Kualitas Moat?`;
        setUserQuestion(qText);
        const aiRes = await runWithThinkingStages(() =>
          requestEmitenAiInspection({
            stock: currentStock,
            joeliardiEval: evalObj,
            recentNews: fetchedNews,
            userQuestion: qText,
            regimeStatus
          })
        );
        if (isMounted) {
          setStructuredReport(aiRes.structuredReport);
          setAiAnalysisFallbackText(stripRawMarkdownArtifacts(aiRes.analysis));
          setIsAiGenerated(aiRes.isAiGenerated);
          setAiGeneratedAt(aiRes.generatedAt);
        }
      } finally {
        if (isMounted) {
          setIsAnalyzingAi(false);
        }
      }
    };

    runLazyOnDemandInspect();

    return () => {
      isMounted = false;
    };
  }, [stock?.ticker]);

  if (!activeStock || !joeliardiEval) return null;

  const handleManualRefreshSingleTicker = async () => {
    setIsSyncingOnDemand(true);
    setIsLoadingNews(true);
    try {
      const [freshStock, freshNews] = await Promise.all([
        fetchLiveIdxTicker(activeStock.ticker).catch(() => activeStock),
        fetchLiveEmitenSpecificNews(
          activeStock.ticker,
          activeStock.name,
          activeStock.sector,
          activeStock
        ).catch(() => recentNews)
      ]);
      const mergedStock: StockMetrics = {
        ...activeStock,
        ...freshStock,
        isHscFlagged: activeStock.isHscFlagged,
        hscSource: activeStock.hscSource,
        hscReason: activeStock.hscReason
      };
      setLiveStockOverride(mergedStock);
      setRecentNews(freshNews);
      onStockSynced?.(mergedStock);
    } finally {
      setIsSyncingOnDemand(false);
      setIsLoadingNews(false);
    }
  };

  const handleRunAiAnalysis = async (customPromptOverride?: string) => {
    const activeQuestion =
      customPromptOverride !== undefined ? customPromptOverride : userQuestion;
    if (customPromptOverride !== undefined) {
      setUserQuestion(customPromptOverride);
    }

    setIsAnalyzingAi(true);
    try {
      const result = await runWithThinkingStages(() =>
        requestEmitenAiInspection({
          stock: activeStock,
          joeliardiEval,
          recentNews,
          userQuestion: activeQuestion,
          regimeStatus
        })
      );
      setStructuredReport(result.structuredReport);
      setAiAnalysisFallbackText(stripRawMarkdownArtifacts(result.analysis));
      setIsAiGenerated(result.isAiGenerated);
      setAiGeneratedAt(result.generatedAt);
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const handleExportPng = () => {
    setIsExporting('PNG');
    try {
      exportInspectToHdPng({
        stock: activeStock,
        joeliardiEval,
        structuredReport,
        recentNews,
        regimeStatus
      });
    } finally {
      setTimeout(() => setIsExporting(null), 400);
    }
  };

  const handleExportPdf = () => {
    setIsExporting('PDF');
    try {
      exportInspectToPdf({
        stock: activeStock,
        joeliardiEval,
        structuredReport,
        recentNews,
        regimeStatus
      });
    } finally {
      setTimeout(() => setIsExporting(null), 400);
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
          label: 'BERITA EMITEN (≤ 3 BULAN)',
          cls: 'text-neutral-600 bg-neutral-500/10 border-neutral-400/40'
        };
    }
  };

  const getToneStyles = (
    tone?: 'POSITIVE' | 'NEUTRAL' | 'CAUTION' | 'NEGATIVE'
  ) => {
    switch (tone) {
      case 'POSITIVE':
        return {
          border: 'border-[#059669]/40',
          badgeBg: 'bg-[#059669]/15 text-[#0D5C46] border-[#059669]/40',
          accentText: 'text-[#0D5C46]',
          bulletColor: 'text-[#059669]'
        };
      case 'CAUTION':
        return {
          border: 'border-[#F59E0B]/50',
          badgeBg: 'bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/40',
          accentText: 'text-[#D97706]',
          bulletColor: 'text-[#D97706]'
        };
      case 'NEGATIVE':
        return {
          border: 'border-[#E11D48]/50',
          badgeBg: 'bg-[#E11D48]/15 text-[#9E2A2B] border-[#E11D48]/40',
          accentText: 'text-[#9E2A2B]',
          bulletColor: 'text-[#E11D48]'
        };
      default:
        return {
          border: 'border-[#0284C7]/40',
          badgeBg: 'bg-[#0284C7]/15 text-[#0284C7] border-[#0284C7]/40',
          accentText: 'text-[#0284C7]',
          bulletColor: 'text-[#0284C7]'
        };
    }
  };

  const gradeBadgeCls = activeStock.isHscFlagged
    ? 'bg-[#E11D48]/15 text-[#9E2A2B] border-[#E11D48]/50'
    : joeliardiEval.totalConvictionScore >= 75
    ? 'bg-[#059669]/15 text-[#0D5C46] border-[#059669]/50'
    : joeliardiEval.totalConvictionScore >= 58
    ? 'bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/50'
    : 'bg-[#E11D48]/15 text-[#9E2A2B] border-[#E11D48]/50';

  const parsedDirectSummary = structuredReport
    ? parseDirectSummaryHeaderAndBody(structuredReport.directAnswerSummary)
    : { header: 'Hasil Analisis Komite Investasi', body: '' };

  const displayedDirectBody = parsedDirectSummary.body.slice(0, typedCharCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Window Header: Close 'X' Pinned Strictly at Top-Right Corner like Standard Windows */}
        <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#E4E2DD] space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-xs bg-[#D97706]/10 border border-[#D97706]/30 text-[#D97706] shrink-0 mt-0.5">
                <Scale className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bb-amber">
                    ON-DEMAND FUNDAMENTAL &amp; AI INSPECTOR // FUNDAMENTAL KUALITAS MOAT
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-xs border ${gradeBadgeCls}`}
                  >
                    {joeliardiEval.convictionGrade} · SKOR {joeliardiEval.totalConvictionScore}/100
                  </span>
                  {isSyncingOnDemand ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#0284C7] bg-[#0284C7]/10 border border-[#0284C7]/30 px-2 py-0.5 rounded-xs">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      <span>Memperbarui Data Live {activeStock.ticker}.JK...</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#0D5C46] bg-[#059669]/10 border border-[#059669]/30 px-2 py-0.5 rounded-xs">
                      <span>✓ Live On-Demand Active</span>
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[#111315] flex flex-wrap items-center gap-2 mt-0.5">
                  <span className="font-mono">{activeStock.ticker}</span>
                  <span className="text-neutral-400 font-normal">·</span>
                  <span>{activeStock.name}</span>
                  <span className="text-xs font-normal text-neutral-500">
                    ({activeStock.sector})
                  </span>
                </h3>
              </div>
            </div>

            {/* Windows-Style Top-Right Close ('X') Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xs bg-[#FFFFFF] border border-[#E4E2DD] text-neutral-500 hover:bg-[#E11D48] hover:text-white hover:border-[#E11D48] transition-colors cursor-pointer shrink-0 ml-auto"
              title="Tutup Jendela Inspector (Esc)"
              aria-label="Tutup Inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action Toolbar Row: Refresh, Export HD PNG, Export PDF, and HSC Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E4E2DD]/70">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleManualRefreshSingleTicker}
                disabled={isSyncingOnDemand}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-[#0284C7] bb-cyan bg-[#FFFFFF] border border-[#E4E2DD] hover:border-[#0284C7] rounded-xs transition-colors cursor-pointer disabled:opacity-60"
                title="Perbarui harga pasar live Yahoo Finance & berita terbaru khusus emiten ini"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncingOnDemand ? 'animate-spin' : ''}`}
                />
                <span>Refresh Emiten</span>
              </button>

              {onToggleHscFlag && (
                <button
                  type="button"
                  onClick={() =>
                    onToggleHscFlag(activeStock.ticker, Boolean(activeStock.isHscFlagged))
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xs border transition-colors cursor-pointer ${
                    activeStock.isHscFlagged
                      ? 'bg-[#E11D48] text-white border-[#E11D48] hover:bg-[#BE123C]'
                      : 'bg-[#FFFFFF] text-[#9E2A2B] border-[#E11D48]/40 hover:bg-[#E11D48]/10'
                  }`}
                  title="Tandai atau lepas label saham HSC (High Speculative Concentration)"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>
                    {activeStock.isHscFlagged
                      ? 'Berlabel HSC (Klik Lepas)'
                      : 'Tandai sebagai HSC'}
                  </span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportPng}
                disabled={isExporting !== null}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-[#0D5C46] bg-[#FFFFFF] border border-[#059669]/50 hover:border-[#059669] hover:bg-[#059669]/10 rounded-xs transition-colors cursor-pointer disabled:opacity-60"
                title="Unduh gambar resolusi tinggi (HD PNG) hasil Inspect Emiten — Nostradamus Quant Terminal"
              >
                <ImageDown className="w-3.5 h-3.5" />
                <span>
                  {isExporting === 'PNG' ? 'Mencetak HD PNG...' : 'Export HD Image (PNG)'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExporting !== null}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-[#D97706] bb-amber bg-[#FFFFFF] border border-[#D97706]/50 hover:border-[#F59E0B] hover:bg-[#D97706]/10 rounded-xs transition-colors cursor-pointer disabled:opacity-60"
                title="Unduh dokumen PDF hasil Inspect Emiten — Nostradamus Quant Terminal"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{isExporting === 'PDF' ? 'Menyusun PDF...' : 'Export PDF'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content Body with Theme-Aware Dark Scrollbar */}
        <div className="p-5 sm:p-6 overflow-y-auto table-scroll-container space-y-6">
          {/* HSC Warning Banner if Flagged */}
          {activeStock.isHscFlagged && (
            <div className="p-3.5 bg-[#E11D48]/10 border border-[#E11D48]/40 rounded-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#9E2A2B] shrink-0 mt-0.5" />
              <div className="text-xs text-[#9E2A2B] space-y-1">
                <div className="font-bold uppercase tracking-wider">
                  PERINGATAN SAHAM HSC (HIGH SPECULATIVE / CORNERED RISK) — DIBLOKIR DARI TOP DECILE BUY
                </div>
                <p className="leading-relaxed text-justify">
                  {activeStock.hscReason ||
                    'Saham ini terindikasi memiliki karakteristik spekulatif tinggi atau fundamental yang tidak mendukung reli harga.'}{' '}
                  Sesuai disiplin perlindungan modal Fundamental Kualitas Moat &amp; filter Out-of-Sample DeMiguel, emiten ini dikunci pada zona <strong>Rotate Out</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Top Valuation & Intrinsic Value Bar with MetricTooltips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <MetricTooltip
                  label="HARGA PASAR LIVE (BEI)"
                  title="Kuotasi Harga Pasar Reguler BEI (.JK)"
                  laymanExplanation="Harga transaksi terakhir saham di pasar reguler Bursa Efek Indonesia beserta persentase perubahan harian (1D) dan bulanan (30D)."
                  practicalGuide="Bandingkan harga pasar ini terhadap Nilai Intrinsik Wajar di sebelahnya untuk melihat apakah saham sedang terdiskon atau sudah mahal."
                />
              </div>
              <div className="text-lg font-bold font-mono text-[#111315] mt-1">
                Rp {formatIdrPriceDisplay(activeStock.lastPrice)}
              </div>
              <span
                className={`text-[11px] font-bold font-mono ${
                  activeStock.change1D >= 0 ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'
                }`}
              >
                1D: {activeStock.change1D >= 0 ? '+' : ''}
                {activeStock.change1D.toFixed(2)}% · 30D: {activeStock.return30D >= 0 ? '+' : ''}
                {activeStock.return30D.toFixed(1)}%
              </span>
            </div>

            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bb-amber">
                <MetricTooltip
                  label="NILAI INTRINSIK WAJAR"
                  title="Estimasi Nilai Intrinsik Wajar (Fundamental Kualitas Moat)"
                  laymanExplanation="Perkiraan harga wajar saham berdasarkan kemampuan perusahaan mencetak laba bersih per saham (EPS), nilai buku ekuitas (BVPS), dan keunggulan ROE dibanding biaya modal (10,5%)."
                  practicalGuide="Jika Nilai Intrinsik Wajar lebih tinggi dari Harga Pasar Live, berarti saham sedang diperdagangkan di bawah nilai fundamentalnya."
                  className="text-[#D97706] bb-amber"
                />
              </div>
              <div className="text-lg font-bold font-mono text-[#111315] mt-1">
                Rp {formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)}
              </div>
              <span className="text-[11px] text-neutral-500 font-mono">
                EPS ~Rp {joeliardiEval.estimatedEpsIdr.toLocaleString('id-ID')} · BVPS ~Rp{' '}
                {joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <MetricTooltip
                  label="MARGIN OF SAFETY (MOS)"
                  title="Sabuk Pengaman Valuasi / Margin of Safety (%)"
                  laymanExplanation="Selisih diskon antara Nilai Intrinsik terhadap Harga Pasar saat ini. Semakin positif angkanya, semakin besar bantal pengaman Anda dari risiko salah beli."
                  practicalGuide="MoS ≥ +15% = Diskon Kuat (Zona Akumulasi); 0% s/d +14% = Wajar Berkualitas; < 0% = Sudah Premium/Mahal."
                />
              </div>
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
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <MetricTooltip
                  label="VALUASI MULTIPEL (IMPLIED VS WAJAR)"
                  title="Rasio PER & PBV Saat Ini vs Multipel Intrinsik Wajar"
                  laymanExplanation="Membandingkan berapa kali lipat laba (PER) dan modal bersih (PBV) yang Anda bayar di harga sekarang dibandingkan batas wajarnya menurut kualitas ROE dan neraca perusahaan."
                  practicalGuide="PER dan PBV yang lebih rendah dari angka 'Wajar'-nya menandakan valuasi yang murah secara fundamental."
                  align="right"
                />
              </div>
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

          {/* 4 Pillar Scores Grid: Fundamental Kualitas Moat + Out-of-Sample (OOS) Quant with MetricTooltips */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF]">
              <div className="flex items-center justify-between text-xs font-bold text-[#111315] mb-1">
                <MetricTooltip
                  label="1. Kualitas Bisnis & Moat"
                  title="Pilar 1: Kualitas Bisnis & Keunggulan Kompetitif (Economic Moat)"
                  laymanExplanation="Mengukur kemampuan perusahaan mencetak laba tinggi secara konsisten di atas biaya modal Indonesia (ROE vs Cost of Equity 10,5%), ketebalan margin operasi, dan bukti kas nyata lewat dividen."
                  practicalGuide="Skor ≥ 70/100 menandakan bisnis ber-moat kuat yang mampu menggandakan modal pemegang saham (compounder)."
                />
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
                <div>ROE: {activeStock.roe.toFixed(1)}% (vs Ke 10,5%)</div>
                <div>Op. Margin: {activeStock.operatingMargin.toFixed(1)}%</div>
                <div>Div. Yield TTM: {(activeStock.dividendYieldPct ?? 0).toFixed(2)}%</div>
              </div>
            </div>

            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF]">
              <div className="flex items-center justify-between text-xs font-bold text-[#111315] mb-1">
                <MetricTooltip
                  label="2. Kesehatan Neraca"
                  title="Pilar 2: Solvabilitas & Ketahanan Neraca (DER & Filter HSC)"
                  laymanExplanation="Menilai seberapa aman perusahaan dari beban utang (Debt-to-Equity Ratio) serta memastikan saham bersih dari manipulasi spekulatif / gorengan (HSC)."
                  practicalGuide="DER ≤ 0,80x dengan status Bebas HSC menghasilkan neraca tangguh yang tahan terhadap gejolak suku bunga tinggi."
                />
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
                <div>DER: {activeStock.debtToEquity.toFixed(2)}x</div>
                <div>
                  Status Neraca:{' '}
                  {activeStock.debtToEquity <= 0.8 ? 'Konservatif' : 'Moderat/Tinggi'}
                </div>
                <div>
                  Saringan HSC: {activeStock.isHscFlagged ? 'Terindikasi HSC' : 'Bebas HSC'}
                </div>
              </div>
            </div>

            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF]">
              <div className="flex items-center justify-between text-xs font-bold text-[#111315] mb-1">
                <MetricTooltip
                  label="3. Keamanan Valuasi"
                  title="Pilar 3: Keamanan Valuasi & Faktor Value (Bobot 35%)"
                  laymanExplanation="Menggabungkan Margin of Safety Nilai Intrinsik Wajar dengan Skor Faktor Value Out-of-Sample agar Anda tidak membeli bisnis bagus di harga yang kelewat mahal."
                  practicalGuide="Skor ≥ 68/100 mengonfirmasi harga beli memberikan asimetri imbal hasil terhadap risiko yang menguntungkan."
                />
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
                <div>Skor Faktor Value: {activeStock.dmuValueScore.toFixed(1)}/10</div>
                <div>Margin of Safety: {joeliardiEval.marginOfSafetyPct}%</div>
                <div>Bobot Value OOS: 35% (Prioritas #1)</div>
              </div>
            </div>

            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF]">
              <div className="flex items-center justify-between text-xs font-bold text-[#111315] mb-1">
                <MetricTooltip
                  label="4. Ketahanan OOS Quant"
                  title="Pilar 4: Ketahanan Faktor Out-of-Sample (DeMiguel et al.)"
                  laymanExplanation="Mengukur daya tahan statistik saham berdasarkan peringkat komposit 4-Faktor (Value, Low-Volatility, Momentum, Size/Likuiditas) terhadap ratusan emiten BEI lainnya."
                  practicalGuide="Peringkat Top 20% (Top Decile) hingga Top 40% (Buffer Hold) layak menjadi penghuni portofolio inti."
                  align="right"
                />
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
                  Komposit: {activeStock.dmuCompositeScore.toFixed(2)}/10 (Top{' '}
                  {activeStock.dmuRankPct}%)
                </div>
                <div>
                  Low-Vol: {activeStock.dmuLowVolScore.toFixed(1)} · Mom:{' '}
                  {activeStock.dmuMomScore.toFixed(1)}
                </div>
                <div>
                  Volatilitas: {activeStock.volatilityAnn.toFixed(1)}% (β{' '}
                  {activeStock.beta1Y.toFixed(2)}x)
                </div>
              </div>
            </div>
          </div>

          {/* Interactive AI Fundamental & News Analysis Section (Structured Investment Committee Cards) */}
          <div className="p-4 sm:p-5 bg-[#FAF9F6] border border-[#D97706]/50 rounded-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E4E2DD] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-xs bg-[#D97706]/15 border border-[#D97706]/40 text-[#D97706]">
                  <BrainCircuit className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bb-amber block">
                    INVESTMENT COMMITTEE ENGINE // DUPONT ROE DECOMPOSITION + OOS QUANT + LIVE NEWS
                  </span>
                  <h4 className="text-sm sm:text-base font-bold text-[#111315]">
                    Komite Investasi AI: Bedah DuPont ROE, Spread SBN 10Y &amp; Strategi Pra-Beli ({activeStock.ticker})
                  </h4>
                </div>
              </div>
              {aiGeneratedAt && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono tabular-nums font-bold bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs text-neutral-600">
                  <Sparkles className="w-3 h-3 text-[#D97706]" />
                  <span>
                    {isAiGenerated
                      ? 'Gemini 3.8 Flash Committee Engine'
                      : 'Investment Committee Analytical Engine'}{' '}
                    · {new Date(aiGeneratedAt).toLocaleTimeString('id-ID')}
                  </span>
                </span>
              )}
            </div>

            {/* Quantitative DuPont & Risk-Free Spread Strip with MetricTooltips */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {(() => {
                const safeDer = Math.max(0, activeStock.debtToEquity);
                const eqMult = 1 + safeDer;
                const roaDuPont = activeStock.roe / Math.max(1, eqMult);
                const earningsYield =
                  joeliardiEval.impliedPer > 0 ? (1 / joeliardiEval.impliedPer) * 100 : 0;
                const sbnSpread = earningsYield - 6.75;
                const divYield = Math.max(0, activeStock.dividendYieldPct ?? 0);
                const totalYield = earningsYield + divYield;

                return (
                  <>
                    <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        <MetricTooltip
                          label="ROA Murni (DuPont)"
                          title="Return on Assets (ROA) Murni Hasil Dekomposisi DuPont"
                          laymanExplanation="Menguji apakah ROE tinggi perusahaan berasal dari kehebatan mesin bisnis murni (ROA = ROE ÷ [1 + DER]) atau sekadar didongkrak oleh tumpukan utang."
                          practicalGuide="ROA Murni ≥ 8% (non-bank) atau ≥ 2,5% (perbankan) menandakan profitabilitas berkualitas tinggi tanpa rekayasa leverage."
                        />
                      </div>
                      <div className="text-xs sm:text-sm font-mono tabular-nums font-bold text-[#111315] mt-0.5">
                        {roaDuPont.toFixed(1)}%{' '}
                        <span className="text-[10px] font-normal text-neutral-500">
                          (ROE {activeStock.roe.toFixed(1)}% / {eqMult.toFixed(2)}x)
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        <MetricTooltip
                          label="Earnings Yield vs SBN 10Y"
                          title="Imbal Hasil Laba Saham (1/PER) vs Obligasi Negara SBN 10Y (6,75%)"
                          laymanExplanation="Membandingkan tingkat imbal hasil laba tahunan saham ini (100% dibagi PER) terhadap bunga obligasi negara bebas risiko SBN 10 Tahun (6,75%)."
                          practicalGuide="Spread positif (+2% atau lebih di atas SBN 6,75%) berarti investor saham mendapatkan kompensasi premi risiko yang layak."
                        />
                      </div>
                      <div
                        className={`text-xs sm:text-sm font-mono tabular-nums font-bold mt-0.5 ${
                          sbnSpread >= 2
                            ? 'text-[#0D5C46]'
                            : sbnSpread >= 0
                            ? 'text-[#D97706]'
                            : 'text-[#9E2A2B]'
                        }`}
                      >
                        {earningsYield.toFixed(2)}%{' '}
                        <span className="text-[10px] font-normal text-neutral-500">
                          ({sbnSpread >= 0 ? '+' : ''}
                          {sbnSpread.toFixed(2)}% vs 6,75%)
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        <MetricTooltip
                          label="Total Shareholder Yield"
                          title="Total Imbal Hasil Pemegang Saham (Earnings Yield + Dividend Yield)"
                          laymanExplanation="Akumulasi keuntungan fundamental tahunan yang mengalir ke pemegang saham, baik dari laba bersih per saham (Earnings Yield) maupun kas dividen tunai (Dividend Yield)."
                          practicalGuide="Semakin tinggi di atas 10%–12%, semakin cepat modal investasi Anda kembali secara fundamental."
                        />
                      </div>
                      <div className="text-xs sm:text-sm font-mono tabular-nums font-bold text-[#0284C7] bb-cyan mt-0.5">
                        {totalYield.toFixed(2)}%{' '}
                        <span className="text-[10px] font-normal text-neutral-500">
                          (Div {divYield.toFixed(2)}%)
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        <MetricTooltip
                          label="Spread Nilai Intrinsik"
                          title="Spread Diskon / Premium terhadap Nilai Intrinsik Wajar"
                          laymanExplanation="Persentase jarak antara harga pasar saat ini menuju target Nilai Intrinsik Wajarnya (Rp)."
                          practicalGuide="Positif (+) berarti ruang kenaikan menuju harga wajar; Negatif (-) berarti harga pasar sudah melampaui nilai intrinsik konservatif."
                          align="right"
                        />
                      </div>
                      <div
                        className={`text-xs sm:text-sm font-mono tabular-nums font-bold mt-0.5 ${
                          joeliardiEval.marginOfSafetyPct >= 15
                            ? 'text-[#0D5C46]'
                            : joeliardiEval.marginOfSafetyPct >= 0
                            ? 'text-[#D97706]'
                            : 'text-[#9E2A2B]'
                        }`}
                      >
                        {joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}
                        {joeliardiEval.marginOfSafetyPct.toFixed(1)}%{' '}
                        <span className="text-[10px] font-normal text-neutral-500">
                          (Rp {joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')})
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-neutral-500 mr-1">
                Sudut Bedah Komite:
              </span>
              {[
                `Apakah ${activeStock.ticker} layak dibeli pada harga Rp ${activeStock.lastPrice.toLocaleString('id-ID')} berdasarkan Nilai Intrinsik Wajar & Fundamental Kualitas Moat?`,
                `Bagaimana dampak berita dan corporate action terbaru terhadap prospek ${activeStock.ticker}?`,
                `Apakah ${activeStock.ticker} aman dari jebakan value trap atau indikasi HSC?`
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleRunAiAnalysis(preset)}
                  disabled={isAnalyzingAi}
                  className="px-2.5 py-1 text-[11px] bg-[#FFFFFF] border border-[#E4E2DD] hover:border-[#D97706] text-neutral-700 rounded-xs transition-colors cursor-pointer disabled:opacity-60"
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isAnalyzingAi) {
                    e.preventDefault();
                    handleRunAiAnalysis();
                  }
                }}
                placeholder={`Tulis fokus analisis untuk ${activeStock.ticker} (contoh: Bedah arus kas, dividen, atau valuasi vs SBN)...`}
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
                    <span>Menyintesis Data...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Bedah Komite AI</span>
                  </>
                )}
              </button>
            </div>

            {/* Multi-Stage Quantitative Thinking Animation OR Progressive Typing Output */}
            {isAnalyzingAi ? (
              <div className="p-5 bg-[#FFFFFF] border border-[#D97706]/50 rounded-xs space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <RefreshCw className="w-4 h-4 text-[#D97706] animate-spin shrink-0" />
                    <span className="text-xs font-bold text-[#111315]">
                      Komite Investasi AI Sedang Menyintesis Data Fundamental &amp; Kuantitatif ({activeStock.ticker})...
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-[#D97706] bb-amber">
                    Tahap {thinkingStageIdx + 1}/4
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-[#E4E2DD] rounded-xs overflow-hidden">
                  <div
                    className="h-full bg-[#D97706] transition-all duration-300"
                    style={{ width: `${((thinkingStageIdx + 1) / 4) * 100}%` }}
                  />
                </div>

                {/* Step-by-Step Thinking Checklist */}
                <div className="space-y-1.5 pt-1">
                  {thinkingStages.map((stageText, sIdx) => {
                    const isDone = sIdx < thinkingStageIdx;
                    const isCurrent = sIdx === thinkingStageIdx;
                    return (
                      <div
                        key={sIdx}
                        className={`px-3 py-1.5 rounded-xs border text-[11px] font-mono flex items-center gap-2 transition-all ${
                          isCurrent
                            ? 'bg-[#FAF9F6] border-[#D97706]/60 text-[#111315] font-bold'
                            : isDone
                            ? 'bg-[#FAF9F6] border-[#E4E2DD] text-[#0D5C46]'
                            : 'bg-[#FAF9F6] border-[#E4E2DD] text-neutral-500 opacity-60'
                        }`}
                      >
                        <span>{isDone ? '✓' : isCurrent ? '▸' : '○'}</span>
                        <span>{stageText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : structuredReport ? (
              <div className="space-y-4">
                {/* 1. Executive Verdict & Direct Analytical Conclusion (With Typing Effect & Zero Question Repetition) */}
                <div className="p-4 bg-[#FFFFFF] border border-[#D97706]/50 rounded-xs space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 text-[10px] font-mono tabular-nums font-bold uppercase tracking-wider rounded-xs border ${gradeBadgeCls}`}
                      >
                        {structuredReport.verdictBadge}
                      </span>
                      <span className="text-xs font-bold text-[#111315]">
                        {structuredReport.verdictTitle}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isTypingComplete && (
                        <button
                          type="button"
                          onClick={handleSkipTypingAnimation}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-[#0284C7] bb-cyan bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#0284C7] rounded-xs cursor-pointer"
                          title="Tampilkan seluruh hasil analisis sekaligus"
                        >
                          <FastForward className="w-3 h-3" />
                          <span>Tampilkan Langsung</span>
                        </button>
                      )}
                      <span className="text-xs font-mono tabular-nums font-bold text-[#D97706] bb-amber">
                        AI Conviction Score: {structuredReport.convictionScore}/100
                      </span>
                    </div>
                  </div>

                  {/* Boxed Bold Header for "Hasil Analisis Komite Investasi" + New-Line Justified Narrative with Bold Metrics */}
                  <div className="pt-1.5 space-y-2.5">
                    <div>
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xs bg-[#D97706]/15 border-2 border-[#D97706]/60 text-[#D97706] bb-amber text-xs sm:text-sm font-extrabold uppercase tracking-wider shadow-2xs">
                        <span className="w-2 h-2 rounded-xs bg-[#D97706] shrink-0" />
                        <span>{parsedDirectSummary.header}</span>
                      </span>
                    </div>

                    <p className="text-xs sm:text-[13px] text-neutral-700 leading-relaxed text-justify">
                      {renderHighlightedFinancialNarrative(
                        displayedDirectBody,
                        activeStock.ticker
                      )}
                      {!isTypingComplete && (
                        <span className="inline-block ml-1 text-[#D97706] animate-pulse font-mono font-bold">
                          ▍
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Chain of Thought Reasoning Steps (Revealed Progressively with Bold Title + Newline Discussion) */}
                  {structuredReport.chainOfThoughtSteps &&
                    structuredReport.chainOfThoughtSteps.length > 0 &&
                    visibleCotCount > 0 && (
                      <div className="pt-3 mt-2.5 border-t border-[#E4E2DD] space-y-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                          <Layers className="w-3.5 h-3.5 text-[#D97706]" />
                          <span>Alur Penalaran Kuantitatif-Fundamental (Chain-of-Thought):</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {structuredReport.chainOfThoughtSteps
                            .slice(0, visibleCotCount)
                            .map((step, idx) => {
                              const parsedStep = parseTitledCardStep(step, idx);
                              return (
                                <div
                                  key={idx}
                                  className="p-3 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col justify-between"
                                >
                                  {parsedStep.header && (
                                    <div className="text-xs font-extrabold text-[#111315] pb-1.5 mb-2 border-b border-[#E4E2DD]/80 tracking-tight">
                                      {parsedStep.header}
                                    </div>
                                  )}
                                  <div className="text-[11px] font-mono tabular-nums text-neutral-700 leading-relaxed text-justify">
                                    {renderHighlightedFinancialNarrative(
                                      parsedStep.body,
                                      activeStock.ticker
                                    )}
                                    {parsedStep.conclusion && (
                                      <span className="font-bold text-[#D97706] bb-amber block mt-1.5">
                                        → {parsedStep.conclusion}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                </div>

                {/* 2. 2x2 Grid of Deep Analytical Pillar Cards (Revealed Progressively) */}
                {visibleSectionCount > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {structuredReport.sections.slice(0, visibleSectionCount).map((sec) => {
                      const tone = getToneStyles(sec.sentimentTone);
                      return (
                        <div
                          key={sec.id}
                          className={`p-4 bg-[#FFFFFF] border ${tone.border} rounded-xs flex flex-col justify-between space-y-2.5`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-xs border ${tone.badgeBg}`}
                              >
                                {sec.badge}
                              </span>
                            </div>

                            <h5 className="text-xs sm:text-sm font-bold text-[#111315] leading-snug">
                              {sec.title}
                            </h5>

                            {sec.keyMetricHighlight && (
                              <div className="px-2.5 py-1.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs text-[11px] font-mono font-bold text-[#111315]">
                                {sec.keyMetricHighlight}
                              </div>
                            )}

                            <p className="text-xs text-neutral-700 leading-relaxed text-justify">
                              {renderHighlightedFinancialNarrative(
                                sec.reasoningParagraph,
                                activeStock.ticker
                              )}
                            </p>
                          </div>

                          {sec.bulletPoints && sec.bulletPoints.length > 0 && (
                            <ul className="pt-2.5 border-t border-[#E4E2DD]/80 space-y-2 text-[11px] text-neutral-600">
                              {sec.bulletPoints.map((pt, idx) => {
                                const parsedBullet = parseTitledCardStep(pt);
                                return (
                                  <li
                                    key={idx}
                                    className="flex items-start gap-2 leading-relaxed"
                                  >
                                    <span className={`font-bold mt-0.5 ${tone.bulletColor}`}>
                                      ▸
                                    </span>
                                    <div className="flex-1 text-justify">
                                      {parsedBullet.header ? (
                                        <>
                                          <span className="font-bold text-[#111315] block mb-0.5">
                                            {parsedBullet.header}
                                          </span>
                                          <span className="block text-neutral-700">
                                            {renderHighlightedFinancialNarrative(
                                              parsedBullet.body,
                                              activeStock.ticker
                                            )}
                                            {parsedBullet.conclusion && (
                                              <span className="font-bold text-[#D97706] bb-amber">
                                                {' '}
                                                → {parsedBullet.conclusion}
                                              </span>
                                            )}
                                          </span>
                                        </>
                                      ) : (
                                        <span>
                                          {renderHighlightedFinancialNarrative(
                                            pt,
                                            activeStock.ticker
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 3. Tactical Execution & Position Sizing Strategy Card */}
                {isTypingComplete && (
                  <>
                    <div className="p-4 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0284C7] bb-cyan">
                        <Target className="w-4 h-4 shrink-0" />
                        <span>Strategi Eksekusi Pra-Beli &amp; Manajemen Risiko Portofolio</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div className="p-2.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
                          <span className="text-[10px] font-bold uppercase text-neutral-500 block">
                            Tindakan Utama
                          </span>
                          <div className="font-bold text-[#111315] mt-1 leading-snug text-justify">
                            {structuredReport.executionStrategy.recommendedAction}
                          </div>
                        </div>

                        <div className="p-2.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
                          <span className="text-[10px] font-bold uppercase text-[#0D5C46] block">
                            Zona Akumulasi Ideal
                          </span>
                          <div className="font-mono font-bold text-[#0D5C46] mt-1 leading-snug">
                            {structuredReport.executionStrategy.idealEntryZone}
                          </div>
                        </div>

                        <div className="p-2.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
                          <span className="text-[10px] font-bold uppercase text-[#9E2A2B] block">
                            Batas Invalidation / Risiko
                          </span>
                          <div className="font-bold text-[#9E2A2B] mt-1 leading-snug text-justify">
                            {structuredReport.executionStrategy.InvalidationOrRiskLimit}
                          </div>
                        </div>

                        <div className="p-2.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
                          <span className="text-[10px] font-bold uppercase text-[#0284C7] bb-cyan block">
                            Panduan Porsi Keranjang
                          </span>
                          <div className="font-bold text-[#111315] mt-1 leading-snug text-justify">
                            {structuredReport.executionStrategy.portfolioAllocationGuide}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 4. Bullish Catalysts vs Bearish Risks Checklist */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div className="p-3.5 bg-[#FFFFFF] border border-[#059669]/35 rounded-xs space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0D5C46]">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Katalis Positif &amp; Kekuatan Fundamental ({activeStock.ticker})</span>
                        </div>
                        <ul className="space-y-2 text-xs text-neutral-700 leading-relaxed">
                          {structuredReport.bullishDrivers.map((str, i) => {
                            const parsedStr = parseTitledCardStep(str);
                            return (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-[#0D5C46] font-bold">•</span>
                                <div className="flex-1 text-justify">
                                  {parsedStr.header ? (
                                    <>
                                      <span className="font-bold text-[#111315] block mb-0.5">
                                        {parsedStr.header}
                                      </span>
                                      <span className="block">
                                        {renderHighlightedFinancialNarrative(
                                          parsedStr.body,
                                          activeStock.ticker
                                        )}
                                      </span>
                                    </>
                                  ) : (
                                    <span>
                                      {renderHighlightedFinancialNarrative(
                                        str,
                                        activeStock.ticker
                                      )}
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      <div className="p-3.5 bg-[#FFFFFF] border border-[#E11D48]/35 rounded-xs space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#9E2A2B]">
                          <ShieldAlert className="w-4 h-4 shrink-0" />
                          <span>Faktor Risiko, Valuasi &amp; Disiplin Eksekusi</span>
                        </div>
                        <ul className="space-y-2 text-xs text-neutral-700 leading-relaxed">
                          {structuredReport.bearishRisks.map((risk, i) => {
                            const parsedRisk = parseTitledCardStep(risk);
                            return (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-[#9E2A2B] font-bold">•</span>
                                <div className="flex-1 text-justify">
                                  {parsedRisk.header ? (
                                    <>
                                      <span className="font-bold text-[#111315] block mb-0.5">
                                        {parsedRisk.header}
                                      </span>
                                      <span className="block">
                                        {renderHighlightedFinancialNarrative(
                                          parsedRisk.body,
                                          activeStock.ticker
                                        )}
                                      </span>
                                    </>
                                  ) : (
                                    <span>
                                      {renderHighlightedFinancialNarrative(
                                        risk,
                                        activeStock.ticker
                                      )}
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : aiAnalysisFallbackText ? (
              <div className="p-4 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-2.5 text-xs text-[#111315] leading-relaxed text-justify whitespace-pre-line font-sans">
                {aiAnalysisFallbackText}
              </div>
            ) : (
              /* Fixed High-Contrast Pre-Analysis Info Box (Readable in both Dark & Light Modes) */
              <div className="p-4 bg-[#FFFFFF] border border-[#D97706]/50 rounded-xs text-xs text-[#111315] flex items-start gap-3">
                <div className="p-1.5 rounded-xs bg-[#D97706]/15 border border-[#D97706]/40 text-[#D97706] shrink-0 mt-0.5">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="space-y-1 leading-relaxed">
                  <div className="font-bold text-[#D97706] bb-amber">
                    Siap Membedah Fundamental &amp; Tesis Investasi {activeStock.ticker}
                  </div>
                  <p className="text-[#111315] text-justify">
                    Klik tombol <strong>Bedah Komite AI</strong> di kanan atas atau pilih salah satu pertanyaan cepat untuk menjalankan audit dekomposisi DuPont ROE, spread SBN 10Y, validasi 4-Faktor OOS, dan berita terkini {activeStock.ticker}.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Emiten-Specific News, Corporate Actions & Issues Section (Filtered <= 3 Months) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E2DD] pb-2">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[#0284C7] bb-cyan" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
                  Berita Terkini, Corporate Action &amp; Radar Isu Spesifik Emiten ({activeStock.ticker})
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold text-[#0D5C46] bg-[#059669]/10 border border-[#059669]/30 rounded-xs">
                  ✓ Filter Aktif: Maks. 3 Bulan Terakhir (≤ 90 Hari)
                </span>
                <span className="text-[11px] font-bold text-[#0284C7] bb-cyan">
                  {isLoadingNews ? 'Menarik RSS Emiten...' : `${recentNews.length} Item Terkait`}
                </span>
              </div>
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
                        <p className="text-[11px] text-neutral-600 mt-1 line-clamp-2 leading-relaxed text-justify">
                          {item.summary}
                        </p>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-[#E4E2DD]/60 flex items-center justify-between text-[10px] font-bold text-[#D97706]">
                      <span>Sektor: {activeStock.sector}</span>
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
