import React, { useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import {
  EmitenNewsCategory,
  MarketRegimeStatus,
  NewsSentimentItem,
  StockMetrics,
  StructuredAiConvictionReport
} from '../types/quant';
import {
  bumpQuantOverrideEpoch,
  computeSbnSpotYieldCurveAndKe,
  enrichStockMetrics,
  evaluateJoeliardiOosFundamental,
  formatAdaptiveIdrValue
} from '../utils/quantEngine';
import {
  getCustomCorporateActionOverrides,
  resetCorporateActionOverride,
  resolveOfficialIdxSharesOutstanding,
  saveCustomCorporateActionOverride
} from '../utils/corporateActionMiddleware';
import {
  clearSyncDiagnostics,
  DataSourceType,
  FieldFreshnessStatus,
  getFundamentalUserOverride,
  getRealtimeWorkerUrl,
  resetFundamentalUserOverride,
  resolveCalibratorFieldProvenanceBadge,
  resolveUiNotificationBadgeMeta,
   sanitizeRealtimeWorkerUrl,
  saveFundamentalUserOverride,
  saveRealtimeWorkerUrl,
  TrackedField
} from '../utils/dataLineageEngine';
import { runQuantValuationInWorkerAsync } from '../utils/quantWorkerBridge';
import { QuantWorkerOutputPayload } from '../workers/quantValuationWorker';
import {
  buildDeepAnalyticalConvictionReport,
  buildEmitenCorporateActionRadarBaseline,
  clearLiveQuoteMemoryCache,
  fetchLiveEmitenSpecificNews,
  fetchLiveIdxTicker,
  loadFundamentalsSnapshot,
  RealtimeWorkerConnectionTestResult,
  requestEmitenAiInspection,
  resolveTickerFundamentalOverlay,
  stripRawMarkdownArtifacts,
  testRealtimeWorkerConnection,
  tryFetchLiveTickerFundamentalsOnDemand
} from '../utils/liveMarketFetcher';
import {
  exportInspectToHdPng,
  exportInspectToPdf
} from '../utils/exportInspectorReport';
import {
  formatKseiFootnoteFullDescription,
  formatKseiFootnoteShortLabel
} from '../data/idxKseiHscRegistry';
import { formatIdrPriceDisplay } from '../utils/numberFormat';
import {
  loadGitHubCloudConfig,
  triggerGitHubActionsFundamentalsSync
} from '../utils/githubCloudSync';
import { MetricTooltip } from './MetricTooltip';
import { RawDataAuditStrip } from './RawDataAuditStrip';
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
  FastForward,
  SlidersHorizontal,
  Database,
  Copy,
  Trash2,
  Terminal,
  ChevronDown,
  ChevronUp,
  Zap
} from 'lucide-react';

interface EmitenFundamentalInspectorModalProps {
  stock: StockMetrics | null;
  regimeStatus?: MarketRegimeStatus;
  availablePortfolioCashIdr?: number;
  onClose: () => void;
  onToggleHscFlag?: (ticker: string, currentlyFlagged: boolean) => void;
  onStockSynced?: (updatedStock: StockMetrics) => void;
}

const DEFAULT_COT_TITLES = [
  '01. Audit Profitabilitas Kas (GP/A & Anti-Junk OCF/NI):',
  '02. Kurva Spot SBN (1Y/5Y/10Y), Ke & Justified PBV:',
  '03. Uji Silang Momentum, Neraca & Value Trap:',
  '04. Sizing 1/β Barbell, Dividen & Likuiditas ADTV:'
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
    const rawHdr = match[1].trim();
    return {
      header: /Hasil Analisis Komite Investasi/i.test(rawHdr)
        ? 'Hasil Analisis Nostradamus'
        : rawHdr,
      body: match[2].trim()
    };
  }
  const genericColon = clean.match(/^([^:]{5,55}):\s*([\s\S]+)$/);
  if (genericColon && !genericColon[1].includes('.')) {
    const rawHdr = genericColon[1].trim();
    return {
      header: /Hasil Analisis Komite Investasi/i.test(rawHdr)
        ? 'Hasil Analisis Nostradamus'
        : rawHdr,
      body: genericColon[2].trim()
    };
  }
  return {
    header: 'Hasil Analisis Nostradamus',
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

const VERDICT_TERMS = [
  'STRONG BUY: ANOMALI ASET DEFENSIF TERDISKON',
  'BUY ON STRENGTH // CATALYST ACTIVE',
  'BUY ON STRENGTH / CATALYST',
  'CATALYST ACTIVE',
  'TERDISKON / MURAH',
  'MAHAL / PREMIUM',
  'UNDERCUT / DEEP DISCOUNT',
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
  'HIGH SHAREHOLDING CONCENTRATION',
  'HIGH SPECULATIVE CONCENTRATION',
  'EARLY WARNING SUSPECT HSC',
  'SUSPECT HSC',
  'CLEAN NON-HSC',
  'BLOKIR HSC',
  'ROTATE OUT'
];
const VERDICT_TERMS_SET = new Set(VERDICT_TERMS);

const METRIC_LABELS = [
  'Hist EV/EBITDA Band 5Y',
  'Hist PBV Band 5Y',
  'ValuationLedger',
  'ROE TTM',
  'EPS TTM',
  'Dynamic Buyback Yield',
  'Buyback Yield',
  'Total Shareholder Yield',
  'TSY',
  'Implied Target Wajar PER',
  'Implied PER',
  'Wajar PER',
  'Fair PER',
  'Quality P/E',
  'P/AFFO',
  'EV/EBITDA',
  'P/CF',
  'PER',
  'Justified PBV',
  'PBV Wajar',
  'Implied PBV',
  'Wajar PBV',
  'Fair PBV',
  'PBV',
  'StatArb Z-Score',
  'Z-Score',
  'Korelasi',
  'Kepemilikan Top-10 KSEI',
  'Top-10 KSEI',
  'KSEI Top-10',
  'Penalti Skor HSC',
  'GP/A (Novy-Marx)',
  'GP/A',
  'OCF/NI',
  'Penalti Akrual',
  'Spot SBN Blended',
  'Kurva Spot SBN',
  'Spot Rf',
  'SBN 1Y',
  'SBN 5Y',
  'SBN 10Y',
  'Dynamic Cost of Equity',
  'Ke',
  'Propensitas 1/β',
  'Cap 1/β',
  '1/β Cap',
  'Batas Alokasi Maks',
  'Forward Dividend Yield (Est)',
  'Forward Dividend Yield',
  'Earnings Yield',
  'Net ERP Spread',
  'Raw Spread',
  'ERP',
  'ADTV 20D',
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

function escapeRegexLiteral(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ESCAPED_VERDICT_TERMS = VERDICT_TERMS.map(escapeRegexLiteral);
const ESCAPED_METRIC_LABELS = METRIC_LABELS.map(escapeRegexLiteral);

const BASE_NARRATIVE_PATTERN_PARTS = [
  `\\b(?:${ESCAPED_VERDICT_TERMS.join('|')})\\b`,
  `\\b(?:${ESCAPED_METRIC_LABELS.join('|')})\\s*~?(?:Rp\\s*)?[+-]?\\d+(?:[.,]\\d+)?(?:%|x|\\/100|\\/10|\\/saham)?`,
  `~?Rp\\s*\\d+(?:[.,]\\d+)*(?:\\/saham)?`,
  `[+-]?\\d+(?:[.,]\\d+)?(?:%|x|\\b\\/100\\b|\\b\\/10\\b)`
];

const narrativeRegexByTickerCache = new Map<string, RegExp>();
const narrativeHighlightNodeCache = new Map<string, React.ReactNode>();
const quantRationaleRegexCache = new Map<string, RegExp>();
const quantRationaleNodeCache = new Map<string, React.ReactNode>();

function renderHighlightedFinancialNarrative(
  text: string,
  ticker?: string
): React.ReactNode {
  if (!text) return null;
  const cleanTicker = (ticker || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cacheKey = `${cleanTicker}::${text}`;
  const cachedNode = narrativeHighlightNodeCache.get(cacheKey);
  if (cachedNode !== undefined) {
    return cachedNode;
  }

  let masterRegex = narrativeRegexByTickerCache.get(cleanTicker);
  if (!masterRegex) {
    const patternParts = [...BASE_NARRATIVE_PATTERN_PARTS];
    if (cleanTicker.length >= 4) {
      patternParts.push(`\\b${cleanTicker}\\b`);
    }
    masterRegex = new RegExp(`(${patternParts.join('|')})`, 'g');
    narrativeRegexByTickerCache.set(cleanTicker, masterRegex);
  }

  const segments = text.split(masterRegex);
  const rendered = segments.map((seg, i) => {
    if (!seg) return null;
    if (i % 2 === 1) {
      const isVerdict = VERDICT_TERMS_SET.has(seg.toUpperCase());
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

  if (narrativeHighlightNodeCache.size > 300) {
    narrativeHighlightNodeCache.clear();
  }
  narrativeHighlightNodeCache.set(cacheKey, rendered);
  return rendered;
}

const BASE_QUANT_RATIONALE_TOKEN_PATTERNS: string[] = [
  `terdiskon\\s+tajam\\s+[+-]?\\d+(?:[.,]\\d+)?%`,
  `(?:diskon|premi)\\s+[+-]?\\d+(?:[.,]\\d+)?%`,
  `Surplus\\s+konversi\\s+kas\\s+riil\\s+sangat\\s+solid`,
  `Anomali\\s+Relative\\s+Value\\s+Terdeteksi`,
  `Ohlson-Penman\\s+RIM(?:\\s*\\([^)]+\\))?`,
  `Multi-Stage\\s+RIM(?:\\s*\\([^)]+\\))?`,
  `(?:OCF\\/NI|GP\\/A(?:\\s+Novy-Marx)?|DER|Forward\\s+ROE|Fwd\\s+ROE|Ke|Z-Score|Spread\\s+1D|Spread\\s+30D|P\\/CF|EV\\/EBITDA|P\\/AFFO|Justified\\s+PBV|Quality\\s+P\\/E|Cash\\s+EPS|EBITDA|AFFO|OCF|EPS|BVPS|ρ|ω)\\s*(?:=\\s*)?~?(?:Rp\\s*)?[+-]?\\d+(?:[.,]\\d+)?(?:%|x|σ|\\/[a-zA-Z]+)?`,
  `[+-]?\\d+(?:[.,]\\d+)?x\\s+vs\\s+(?:Wajar|Justified\\s+PBV)\\s+[+-]?\\d+(?:[.,]\\d+)?x`,
  `[+-]?\\d+(?:[.,]\\d+)?%\\s+excess\\s+return`,
  `~?Rp\\s*\\d+(?:[.,]\\d+)*(?:\\/shm|\\/saham)?`,
  `[+-]?\\d+(?:[.,]\\d+)?(?:%|x|σ)`
];

function renderHighlightedQuantRationale(
  text: string,
  ticker?: string,
  peerTicker?: string
): React.ReactNode {
  if (!text) return null;
  const cleanTicker = (ticker || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanPeer = (peerTicker || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cacheKey = `${cleanTicker}::${cleanPeer}::${text}`;
  const cachedNode = quantRationaleNodeCache.get(cacheKey);
  if (cachedNode !== undefined) {
    return cachedNode;
  }

  // Fast string indexOf split for "Langkah Follow-Up: ..." instead of greedy regex split
  const lowerText = text.toLowerCase();
  const followUpIdx = lowerText.indexOf('langkah follow-up:');
  const mainBody = followUpIdx >= 0 ? text.slice(0, followUpIdx) : text;
  const followUpClause = followUpIdx >= 0 ? text.slice(followUpIdx) : '';

  const regexCacheKey = `${cleanTicker}::${cleanPeer}`;
  let regex = quantRationaleRegexCache.get(regexCacheKey);
  if (!regex) {
    const tokenPatterns = [...BASE_QUANT_RATIONALE_TOKEN_PATTERNS];
    if (cleanTicker.length >= 4) tokenPatterns.push(`\\b${cleanTicker}\\b`);
    if (cleanPeer.length >= 4) tokenPatterns.push(`\\b${cleanPeer}\\b`);
    regex = new RegExp(`(${tokenPatterns.join('|')})`, 'g');
    quantRationaleRegexCache.set(regexCacheKey, regex);
  }

  const highlightTokens = (segmentText: string, keyPrefix: string) => {
    const parts = segmentText.split(regex!);

    return parts.map((part, idx) => {
      if (!part) return null;
      if (idx % 2 === 1) {
        const lower = part.toLowerCase();
        if (
          lower.includes('terdiskon') ||
          lower.includes('diskon') ||
          lower.includes('surplus konversi kas') ||
          lower.includes('excess return') ||
          lower.startsWith('rp ')
        ) {
          return (
            <strong
              key={`${keyPrefix}_${idx}`}
              className="font-extrabold text-[#0D5C46] bg-[#059669]/10 px-1 py-0.2 rounded-2xs"
            >
              {part}
            </strong>
          );
        }
        if (lower.includes('premi') || (lower.includes('z-score') && part.includes('+'))) {
          return (
            <strong
              key={`${keyPrefix}_${idx}`}
              className="font-extrabold text-[#D97706] bb-amber bg-[#D97706]/10 px-1 py-0.2 rounded-2xs"
            >
              {part}
            </strong>
          );
        }
        if (
          lower.includes('ohlson-penman') ||
          lower.includes('multi-stage rim') ||
          lower.includes('vs wajar') ||
          lower.includes('vs justified')
        ) {
          return (
            <strong
              key={`${keyPrefix}_${idx}`}
              className="font-bold text-[#0284C7] bb-cyan underline decoration-[#0284C7]/40 underline-offset-2"
            >
              {part}
            </strong>
          );
        }
        return (
          <strong key={`${keyPrefix}_${idx}`} className="font-bold text-[#111315]">
            {part}
          </strong>
        );
      }
      return <React.Fragment key={`${keyPrefix}_${idx}`}>{part}</React.Fragment>;
    });
  };

  let rendered: React.ReactNode;
  if (!followUpClause) {
    rendered = highlightTokens(mainBody, 'main');
  } else {
    const isBuyFollowUp = /BELI\s*\/\s*AKUMULASI/i.test(followUpClause);
    const isTrimRotateFollowUp = /TAHAN\s+BELI\s+BARU|TRIM|ROTASI\s+KE\s+PAIR/i.test(followUpClause);

    const followUpBody = followUpClause.replace(/^Langkah Follow-Up:\s*/i, '');
    const actionMatch = followUpBody.match(
      /^(BELI\s*\/\s*AKUMULASI\s+[A-Z]{4}|TAHAN\s+BELI\s+BARU\s*\/\s*JUAL\s+SEBAGIAN\s*\(TRIM\)\s+[A-Z]{4}\s*&\s*ROTASI\s+KE\s+PAIR\s+[A-Z]{4}|Pertahankan\s+posisi\s*\(HOLD\)\s+[A-Z]{4}|Hindari\s+arbitrase\s+pasangan\s*\(pair\s+trade\)\s+murni)/i
    );

    rendered = (
      <>
        <span>{highlightTokens(mainBody.trim(), 'main')}</span>
        <span className="block mt-2 pt-1.5 border-t border-[#E4E2DD]/70">
          <strong
            className={`font-extrabold px-1.5 py-0.5 rounded-2xs mr-1.5 inline-block ${
              isBuyFollowUp
                ? 'text-[#0D5C46] bg-[#059669]/15 border border-[#059669]/40'
                : isTrimRotateFollowUp
                ? 'text-[#9E2A2B] bg-[#E11D48]/15 border border-[#E11D48]/40'
                : 'text-[#0284C7] bb-cyan bg-[#0284C7]/15 border border-[#0284C7]/40'
            }`}
          >
            Langkah Follow-Up:
          </strong>
          {actionMatch ? (
            <>
              <strong
                className={`font-extrabold underline underline-offset-2 ${
                  isBuyFollowUp
                    ? 'text-[#0D5C46]'
                    : isTrimRotateFollowUp
                    ? 'text-[#9E2A2B]'
                    : 'text-[#111315]'
                }`}
              >
                {actionMatch[1]}
              </strong>
              {highlightTokens(followUpBody.slice(actionMatch[1].length), 'fu_rest')}
            </>
          ) : (
            highlightTokens(followUpBody, 'fu_all')
          )}
        </span>
      </>
    );
  }

  if (quantRationaleNodeCache.size > 150) {
    quantRationaleNodeCache.clear();
  }
  quantRationaleNodeCache.set(cacheKey, rendered);
  return rendered;
}

export function EmitenFundamentalInspectorModal({
  stock,
  regimeStatus = 'WASPADA',
  availablePortfolioCashIdr,
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

  // Corporate Action, Fundamental USER_OVERRIDE Calibrator & Forensic Lineage Drawer States (Mutually Exclusive)
  const [catalystRevision, setCatalystRevision] = useState<number>(0);
  const [activeToolPanel, setActiveToolPanel] = useState<
    'NONE' | 'CALIBRATION' | 'FORENSIC_LINEAGE'
  >('NONE');
  const showCatalystCalibrator = activeToolPanel === 'CALIBRATION';
  const showForensicLineageDrawer = activeToolPanel === 'FORENSIC_LINEAGE';
  const [isFetchingLiveFundamentals, setIsFetchingLiveFundamentals] = useState<boolean>(false);
  const [isTriggeringGhActionsSync, setIsTriggeringGhActionsSync] = useState<boolean>(false);
  const [ghActionsPollingStep, setGhActionsPollingStep] = useState<string | null>(null);
  const [realtimeWorkerUrlInput, setRealtimeWorkerUrlInput] = useState<string>(() =>
    getRealtimeWorkerUrl()
  );
  const [isTestingWorkerConn, setIsTestingWorkerConn] = useState<boolean>(false);
  const [workerConnTestResult, setWorkerConnTestResult] =
    useState<RealtimeWorkerConnectionTestResult | null>(null);
  const [splitRatioInput, setSplitRatioInput] = useState<string>('1');
  const [buybackNominalInput, setBuybackNominalInput] = useState<string>('0');
  const [quarterlyGrowthInput, setQuarterlyGrowthInput] = useState<string>('0');
  const [sharesMillionInput, setSharesMillionInput] = useState<string>('0');
  const [marketCapTrillionInput, setMarketCapTrillionInput] = useState<string>('0');
  // Expanded Fundamental & Macro USER_OVERRIDE Inputs (in Miliar Rp -> * 1e9 on save)
  const [revenueBillionInput, setRevenueBillionInput] = useState<string>('0');
  const [ebitBillionInput, setEbitBillionInput] = useState<string>('0');
  const [netIncomeBillionInput, setNetIncomeBillionInput] = useState<string>('0');
  const [equityBillionInput, setEquityBillionInput] = useState<string>('0');
  const [ocfBillionInput, setOcfBillionInput] = useState<string>('0');
  const [daBillionInput, setDaBillionInput] = useState<string>('0');
  const [adtvBillionInput, setAdtvBillionInput] = useState<string>('0');
  const [sbn10YInput, setSbn10YInput] = useState<string>('6.75');
  const [workerTelemetry, setWorkerTelemetry] =
    useState<QuantWorkerOutputPayload | null>(null);
  const [hydratedTicker, setHydratedTicker] = useState<string | null>(null);

  const typingTimerRef = useRef<number | null>(null);

  // Two-Frame Instant Modal Shell Architecture:
  // Frame 0 mounts the lightweight modal shell & header (<2ms) so clicking "Inspect" never blocks the main thread;
  // Frame 1 (after browser paint) activates full forensic valuation & worker hydration.
  useEffect(() => {
    if (!stock?.ticker) return;
    let raf2: number | null = null;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setHydratedTicker(stock.ticker);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2 !== null) {
        window.cancelAnimationFrame(raf2);
      }
    };
  }, [stock?.ticker]);

  const isValuationHydrated = Boolean(stock?.ticker && hydratedTicker === stock.ticker);

  // Stabilize incoming stock prop reference against unrelated background universe sync updates
  const stableStock = useMemo(
    () => stock,
    [
      stock?.ticker,
      stock?.lastPrice,
      stock?.change1D,
      stock?.return30D,
      stock?.beta1Y,
      stock?.volatilityAnn,
      stock?.roe,
      stock?.debtToEquity,
      stock?.operatingMargin,
      stock?.revenueTTMIdr,
      stock?.netIncomeTTMIdr,
      stock?.equityAttributableIdr,
      stock?.adtv20dIdr,
      stock?.fundamentalsSource,
      stock?.isHscFlagged,
      stock?.hscTier
    ]
  );

  // Active stock merges initial prop with on-demand live quote, snapshot overlay, and user fundamental overrides
  const activeStock = useMemo(() => {
    if (!stableStock) return null;
    if (!isValuationHydrated) return stableStock;
    const base =
      liveStockOverride && liveStockOverride.ticker === stableStock.ticker
        ? {
            ...stableStock,
            ...liveStockOverride,
            isHscFlagged: stableStock.isHscFlagged,
            hscSource: stableStock.hscSource,
            hscTier: stableStock.hscTier,
            hscReason: stableStock.hscReason,
            kseiHscConcentrationPct: stableStock.kseiHscConcentrationPct,
            kseiHscIsNew: stableStock.kseiHscIsNew,
            kseiHscFootnote: stableStock.kseiHscFootnote,
            kseiHscScorePenaltyPts: stableStock.kseiHscScorePenaltyPts
          }
        : stableStock;
    const overlay = resolveTickerFundamentalOverlay(
      base.ticker,
      {
        defaultRoe: base.trailingRoePct ?? base.roe,
        defaultDer: base.debtToEquity,
        defaultOpMargin: base.operatingMargin
      },
      base.adtv20dIdr,
      base.adtvSource,
      base.adtvAsOfDate || base.priceAsOfDate
    );
    const mergedWithOverlay: StockMetrics = {
      ...base,
      ...(overlay.adtv20dIdr ? { adtv20dIdr: overlay.adtv20dIdr, adtvSource: overlay.adtvSource, adtvAsOfDate: overlay.adtvAsOfDate } : {}),
      ...(overlay.sharesOutstanding ? { sharesOutstanding: overlay.sharesOutstanding } : {}),
      ...(overlay.revenueTTMIdr ? { revenueTTMIdr: overlay.revenueTTMIdr } : {}),
      ...(overlay.latestFullYearRevenueIdr ? { latestFullYearRevenueIdr: overlay.latestFullYearRevenueIdr } : {}),
      ...(overlay.operatingProfitTTMIdr ? { operatingProfitTTMIdr: overlay.operatingProfitTTMIdr } : {}),
      ...(overlay.ebitdaTTMIdr ? { ebitdaTTMIdr: overlay.ebitdaTTMIdr } : {}),
      ...(overlay.netIncomeTTMIdr ? { netIncomeTTMIdr: overlay.netIncomeTTMIdr } : {}),
      ...(overlay.netIncomeYoYPct !== undefined ? { earningsGrowthYoYPct: overlay.netIncomeYoYPct } : {}),
      ...(overlay.operatingProfitYoYPct !== undefined ? { operatingProfitGrowthYoYPct: overlay.operatingProfitYoYPct } : {}),
      ...(overlay.equityAttributableIdr ? { equityAttributableIdr: overlay.equityAttributableIdr } : {}),
      ...(overlay.totalAssetsIdr ? { totalAssetsIdr: overlay.totalAssetsIdr } : {}),
      ...(overlay.totalDebtIdr !== undefined ? { totalDebtIdr: overlay.totalDebtIdr } : {}),
      ...(overlay.cashAndEquivalentsIdr !== undefined ? { cashAndEquivalentsIdr: overlay.cashAndEquivalentsIdr } : {}),
      ...(overlay.ocfTTMIdr !== undefined ? { ocfTTMIdr: overlay.ocfTTMIdr } : {}),
      ...(overlay.capexTTMIdr !== undefined ? { capexTTMIdr: overlay.capexTTMIdr } : {}),
      ...(overlay.daTTMIdr !== undefined ? { daTTMIdr: overlay.daTTMIdr } : {}),
      ...(overlay.roeAvg3YPct !== undefined ? { roeAvg3YPct: overlay.roeAvg3YPct } : {}),
      ...(overlay.roeAvg5YPct !== undefined ? { roeAvg5YPct: overlay.roeAvg5YPct } : {}),
      ...(overlay.beta1Y ? { beta1Y: overlay.beta1Y } : {}),
      ...(overlay.realizedAnnualVol ? { volatilityAnn: overlay.realizedAnnualVol } : {}),
      ...(overlay.atr20Idr ? { atr20Idr: overlay.atr20Idr } : {}),
      ...(overlay.dividendYieldTTM !== undefined ? { dividendYieldPct: overlay.dividendYieldTTM } : {}),
      ...(overlay.daAnomaly !== undefined ? { daAnomaly: overlay.daAnomaly } : {}),
      ...(overlay.daMethodNote ? { daMethodNote: overlay.daMethodNote } : {}),
      ...(overlay.ttmMethod ? { ttmMethod: overlay.ttmMethod } : {}),
      ...(overlay.flowAudit ? { flowAudit: overlay.flowAudit } : {}),
      ...(overlay.missingFundamentalFields ? { missingFundamentalFields: overlay.missingFundamentalFields } : {}),
      ...(overlay.reportingCurrency ? { reportingCurrency: overlay.reportingCurrency } : {}),
      ...(overlay.fxRateUsdIdr ? { fxRateUsdIdr: overlay.fxRateUsdIdr } : {}),
      ...(overlay.computedRoePct ? { roe: overlay.computedRoePct, trailingRoePct: overlay.computedRoePct } : {}),
      ...(overlay.computedOpMarginPct ? { operatingMargin: overlay.computedOpMarginPct } : {}),
      ...(overlay.computedDer !== undefined ? { debtToEquity: overlay.computedDer } : {}),
      ...(overlay.fundamentalsSource ? { fundamentalsSource: overlay.fundamentalsSource } : {}),
      ...(overlay.fundamentalsAsOfDate ? { fundamentalsAsOfDate: overlay.fundamentalsAsOfDate } : {}),
      ...(overlay.fundamentalsFiscalPeriod ? { fundamentalsFiscalPeriod: overlay.fundamentalsFiscalPeriod } : {}),
      ...(overlay.fundamentalsNote ? { fundamentalsNote: overlay.fundamentalsNote } : {})
    };
    return enrichStockMetrics(mergedWithOverlay);
  }, [stableStock, liveStockOverride, catalystRevision, isValuationHydrated]);

  const joeliardiEval = useMemo(() => {
    if (!activeStock || !isValuationHydrated) return null;
    return evaluateJoeliardiOosFundamental(
      activeStock,
      undefined,
      availablePortfolioCashIdr,
      regimeStatus
    );
  }, [activeStock, catalystRevision, availablePortfolioCashIdr, regimeStatus, isValuationHydrated]);

  // Synchronize Corporate Action Calibrator inputs & trigger Web Worker offload when activeStock or live sync changes
  useEffect(() => {
    if (!activeStock || !joeliardiEval) return;
    setSplitRatioInput(String(activeStock.splitRatioDivisor ?? 1));
    const buybackBillion = activeStock.buybackNominalIdr
      ? Math.round(activeStock.buybackNominalIdr / 1_000_000_000)
      : 0;
    setBuybackNominalInput(String(buybackBillion));
    setQuarterlyGrowthInput(
      String(
        activeStock.earningsGrowthYoYPct ??
          Number(
            Math.max(
              0,
              ((joeliardiEval.forwardAnnualizedRoePct ?? activeStock.roe) -
                (joeliardiEval.trailingRoePct ?? activeStock.roe)) *
                2.5
            ).toFixed(1)
          )
      )
    );
    const resolvedShares =
      joeliardiEval.rawTickerData?.sharesOutstanding ??
      activeStock.sharesOutstanding ??
      resolveOfficialIdxSharesOutstanding(activeStock.ticker, activeStock.splitRatioDivisor ?? 1) ??
      Math.round((activeStock.liveMarketCapIdr ?? 1_500_000_000_000) / Math.max(1, activeStock.lastPrice));
    const resolvedMcapIdr =
      joeliardiEval.rawTickerData?.marketCap ??
      joeliardiEval.liveMarketCapIdr ??
      activeStock.liveMarketCapIdr ??
      Math.round(resolvedShares * activeStock.lastPrice);
    setSharesMillionInput((resolvedShares / 1_000_000).toFixed(2));
    setMarketCapTrillionInput((resolvedMcapIdr / 1_000_000_000_000).toFixed(2));

    const userFundOv = getFundamentalUserOverride(activeStock.ticker);
    const rawTkr = joeliardiEval.rawTickerData;
    const revIdr = userFundOv?.revenueTTMIdr ?? rawTkr?.revenueTTM ?? 0;
    const ebitIdr = userFundOv?.operatingProfitTTMIdr ?? rawTkr?.operatingProfitTTM ?? 0;
    const niIdr = userFundOv?.netIncomeTTMIdr ?? rawTkr?.netIncomeTTM ?? 0;
    const eqIdr = userFundOv?.equityAttributableIdr ?? rawTkr?.equityAttributable ?? 0;
    const ocfIdr = userFundOv?.ocfTTMIdr ?? rawTkr?.ocfTTM ?? 0;
    const daIdr = userFundOv?.daTTMIdr ?? rawTkr?.daTTM ?? 0;
    const adtvIdr = userFundOv?.adtv20dIdr ?? joeliardiEval.adtv20dIdr ?? rawTkr?.adtv20dIDR ?? 0;
    const sbn10YPct = userFundOv?.sbn10YOverridePct ?? joeliardiEval.sbnSpot10YPct ?? 6.75;

    setRevenueBillionInput((revIdr / 1_000_000_000).toFixed(2));
    setEbitBillionInput((ebitIdr / 1_000_000_000).toFixed(2));
    setNetIncomeBillionInput((niIdr / 1_000_000_000).toFixed(2));
    setEquityBillionInput((eqIdr / 1_000_000_000).toFixed(2));
    setOcfBillionInput((ocfIdr / 1_000_000_000).toFixed(2));
    setDaBillionInput((daIdr / 1_000_000_000).toFixed(2));
    setAdtvBillionInput((adtvIdr / 1_000_000_000).toFixed(2));
    setSbn10YInput(sbn10YPct.toFixed(2));

    let cancelled = false;
    const boostMult = 1 + (joeliardiEval.catalystValuationBoostPct ?? 0) / 100;
    runQuantValuationInWorkerAsync({
      ticker: activeStock.ticker,
      spotPriceIdr: activeStock.lastPrice,
      bvps0Idr: joeliardiEval.estimatedBvpsIdr,
      forwardRoePct:
        joeliardiEval.forwardAnnualizedRoePct ??
        activeStock.forwardAnnualizedRoePct ??
        activeStock.roe,
      kePct: joeliardiEval.dynamicCostOfEquityPct ?? 12.64,
      dprPct: joeliardiEval.historicalDpr3YPct ?? 45,
      gpaPct:
        joeliardiEval.grossProfitabilityToAssets ??
        activeStock.grossProfitabilityToAssets ??
        activeStock.roe * 0.85,
      ocfToNi:
        joeliardiEval.ocfToNetIncomeRatio ??
        activeStock.ocfToNetIncomeRatio ??
        0.92,
      der: activeStock.debtToEquity,
      accrualPenaltyScore: Number(((joeliardiEval.accrualPenaltyPts ?? 0) / 8.5).toFixed(2)),
      hscDiscountMultiplier: activeStock.isHscFlagged ? 0.65 : 1.0,
      catalystValuationMultiplier: boostMult,
      beta1Y: activeStock.beta1Y,
      volatilityAnn: activeStock.volatilityAnn,
      change1D: activeStock.change1D,
      return30D: activeStock.return30D,
      peerDefaultChange1D: 0.35,
      peerDefaultReturn30D: 2.1,
      peerCorrelation: joeliardiEval.statArbCorrelation ?? 0.86,
      isHscFlagged: Boolean(activeStock.isHscFlagged),
      sectorSpecificFairValueIdr:
        joeliardiEval.sectorSpecificFairValueIdr ?? joeliardiEval.intrinsicValueIdr,
      agnosticPeerFairValueIdr:
        joeliardiEval.agnosticPeerFairValueIdr ?? joeliardiEval.intrinsicValueIdr,
      effectiveModule:
        joeliardiEval.effectiveModule ??
        joeliardiEval.valuationReport?.applied_module ??
        'Compounder',
      ensembleAntiJunkMultiplier: joeliardiEval.ensembleAntiJunkMultiplier ?? 1.0
    }).then((res) => {
      if (!cancelled) {
        setWorkerTelemetry(res);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeStock?.ticker,
    activeStock?.lastPrice,
    activeStock?.roe,
    activeStock?.splitRatioDivisor,
    activeStock?.buybackNominalIdr,
    activeStock?.earningsGrowthYoYPct,
    catalystRevision,
    isValuationHydrated
  ]);

  // Real-Time Live Preview for Calibration Modal before saving (strictly gated when drawer is open)
  const liveCalibrationPreview = useMemo(() => {
    if (!showCatalystCalibrator || !activeStock || !joeliardiEval) return null;
    const px = Math.max(50, activeStock.lastPrice);
    const sharesMil = Math.max(1, Number(sharesMillionInput.replace(',', '.')) || 1);
    const sharesFull = Math.round(sharesMil * 1_000_000);
    const revIdr = Math.max(0, (Number(revenueBillionInput.replace(',', '.')) || 0) * 1_000_000_000);
    const ebitIdr = Math.max(0, (Number(ebitBillionInput.replace(',', '.')) || 0) * 1_000_000_000);
    const niIdr = Math.max(1, (Number(netIncomeBillionInput.replace(',', '.')) || 0) * 1_000_000_000);
    const eqIdr = Math.max(1, (Number(equityBillionInput.replace(',', '.')) || 0) * 1_000_000_000);
    const sbn10Y = Math.max(3.0, Math.min(15.0, Number(sbn10YInput.replace(',', '.')) || 6.75));

    const epsIdr = Math.max(1, Math.round(niIdr / sharesFull));
    const bvpsIdr = Math.max(10, Math.round(eqIdr / sharesFull));
    const impliedPer = Number((px / epsIdr).toFixed(2));
    const impliedPbv = Number((px / bvpsIdr).toFixed(2));
    const roePct = Number(((niIdr / eqIdr) * 100).toFixed(2));
    const opMarginPct = revIdr > 0 ? Number(((ebitIdr / revIdr) * 100).toFixed(2)) : activeStock.operatingMargin;

    const sbnPreview = computeSbnSpotYieldCurveAndKe(
      {
        ...activeStock,
        forwardDividendYieldPct:
          joeliardiEval.forwardDividendYieldPct ?? activeStock.forwardDividendYieldPct
      },
      joeliardiEval.forwardDividendYieldPct ?? activeStock.forwardDividendYieldPct ?? 2.5
    );
    const anchorDelta = sbn10Y - 6.75;
    const sbn1Y = 6.15 + anchorDelta * 0.75;
    const sbn5Y = 6.48 + anchorDelta * 0.90;
    const divYieldForPreview =
      joeliardiEval.forwardDividendYieldPct ?? activeStock.forwardDividendYieldPct ?? 2.5;
    const w1Y = divYieldForPreview >= 4.5 ? 0.28 : divYieldForPreview >= 2.0 ? 0.22 : 0.12;
    const w5Y = divYieldForPreview >= 4.5 ? 0.42 : divYieldForPreview >= 2.0 ? 0.38 : 0.33;
    const w10Y = divYieldForPreview >= 4.5 ? 0.30 : divYieldForPreview >= 2.0 ? 0.40 : 0.55;
    const blendedRf = Number((w1Y * sbn1Y + w5Y * sbn5Y + w10Y * sbn10Y).toFixed(2));
    const adjustedBeta =
      joeliardiEval.decision?.adjustedBeta ??
      Math.max(0.48, Math.min(1.55, 0.67 * Math.max(0.35, Number(activeStock.beta1Y) || 1.0) + 0.33 * 1.0));
    const erpPct = joeliardiEval.decision?.erpBenchmarkPct ?? sbnPreview.erpBenchmarkPct;
    const kePct = Number(Math.max(8.8, Math.min(16.2, blendedRf + adjustedBeta * erpPct)).toFixed(2));

    return {
      sharesFull,
      marketCapTrillion: Number(((sharesFull * px) / 1e12).toFixed(2)),
      epsIdr,
      bvpsIdr,
      impliedPer,
      impliedPbv,
      roePct,
      opMarginPct,
      blendedRf,
      kePct
    };
  }, [
    showCatalystCalibrator,
    activeStock,
    joeliardiEval,
    sharesMillionInput,
    revenueBillionInput,
    ebitBillionInput,
    netIncomeBillionInput,
    equityBillionInput,
    sbn10YInput
  ]);

  const handleSaveCatalystOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStock) return;
    const rawSplit = Number(splitRatioInput.replace(',', '.'));
    const splitVal = Number.isFinite(rawSplit) && rawSplit > 0 ? rawSplit : 1;
    const buybackVal = Math.max(0, Number(buybackNominalInput.replace(',', '.')) || 0);
    const growthVal = Number(quarterlyGrowthInput.replace(',', '.')) || 0;
    const sharesMillionVal = Math.max(1, Number(sharesMillionInput.replace(',', '.')) || 0);
    const fullSharesVal = Math.round(sharesMillionVal * 1_000_000);
    const syncedMcapTrillion = Number(
      ((fullSharesVal * activeStock.lastPrice) / 1_000_000_000_000).toFixed(4)
    );

    // Explicit * 1e9 conversion guardrail from Miliar Rp to Full IDR
    const revBillion = Math.max(0, Number(revenueBillionInput.replace(',', '.')) || 0);
    const ebitBillion = Math.max(0, Number(ebitBillionInput.replace(',', '.')) || 0);
    const niBillion = Math.max(0, Number(netIncomeBillionInput.replace(',', '.')) || 0);
    const eqBillion = Math.max(0, Number(equityBillionInput.replace(',', '.')) || 0);
    const ocfBillion = Math.max(0, Number(ocfBillionInput.replace(',', '.')) || 0);
    const daBillion = Math.max(0, Number(daBillionInput.replace(',', '.')) || 0);
    const adtvBillion = Math.max(0, Number(adtvBillionInput.replace(',', '.')) || 0);
    const sbn10YPct = Math.max(3.0, Math.min(15.0, Number(sbn10YInput.replace(',', '.')) || 6.75));

    const revenueTTMIdr = Math.round(revBillion * 1_000_000_000);
    const operatingProfitTTMIdr = Math.round(ebitBillion * 1_000_000_000);
    const netIncomeTTMIdr = Math.round(niBillion * 1_000_000_000);
    const equityAttributableIdr = Math.round(eqBillion * 1_000_000_000);
    const ocfTTMIdr = Math.round(ocfBillion * 1_000_000_000);
    const daTTMIdr = Math.round(daBillion * 1_000_000_000);
    const adtv20dIdr = Math.round(adtvBillion * 1_000_000_000);

    const computedRoe =
      netIncomeTTMIdr > 0 && equityAttributableIdr > 0
        ? Number(Math.max(0.5, Math.min(65, (netIncomeTTMIdr / equityAttributableIdr) * 100)).toFixed(2))
        : activeStock.trailingRoePct ?? activeStock.roe;

    saveFundamentalUserOverride({
      ticker: activeStock.ticker,
      revenueTTMIdr: revenueTTMIdr > 0 ? revenueTTMIdr : undefined,
      operatingProfitTTMIdr: operatingProfitTTMIdr > 0 ? operatingProfitTTMIdr : undefined,
      netIncomeTTMIdr: netIncomeTTMIdr > 0 ? netIncomeTTMIdr : undefined,
      equityAttributableIdr: equityAttributableIdr > 0 ? equityAttributableIdr : undefined,
      ocfTTMIdr: ocfTTMIdr > 0 ? ocfTTMIdr : undefined,
      daTTMIdr: daTTMIdr > 0 ? daTTMIdr : undefined,
      sharesOutstanding: fullSharesVal > 0 ? fullSharesVal : undefined,
      adtv20dIdr: adtv20dIdr > 0 ? adtv20dIdr : undefined,
      sbn10YOverridePct: sbn10YPct,
      overrideNote: `USER_OVERRIDE (${new Date().toISOString().slice(0, 10)}): Rev Rp ${revBillion.toFixed(2)}M · EBIT Rp ${ebitBillion.toFixed(2)}M · NI Rp ${niBillion.toFixed(2)}M · Equity Rp ${eqBillion.toFixed(2)}M · OCF Rp ${ocfBillion.toFixed(2)}M · D&A Rp ${daBillion.toFixed(2)}M · Shares ${(fullSharesVal / 1e9).toFixed(2)}M lbr · SBN 10Y ${sbn10YPct.toFixed(2)}%`
    });

    saveCustomCorporateActionOverride({
      ticker: activeStock.ticker,
      splitRatioDivisor: splitVal,
      hasActiveBuyback: buybackVal > 0,
      buybackNominalBillionIdr: buybackVal,
      sharesOutstanding: fullSharesVal,
      liveMarketCapTrillionIdr: syncedMcapTrillion,
      earningsGrowthYoYPct: growthVal,
      latestQuarterLabel: 'USER_OVERRIDE (TTM Verified)',
      trailingRoePct: computedRoe,
      forwardAnnualizedRoePct: computedRoe,
      catalystNote: `Kalibrasi USER_OVERRIDE (${activeStock.ticker}): Rev Rp ${(revenueTTMIdr / 1e12).toFixed(2)}T · NI Rp ${(netIncomeTTMIdr / 1e12).toFixed(2)}T · Equity Rp ${(equityAttributableIdr / 1e12).toFixed(2)}T · ROE ${computedRoe.toFixed(2)}% · Shares ${(fullSharesVal / 1e9).toFixed(2)}M lbr · SBN 10Y ${sbn10YPct.toFixed(2)}%.`
    });

    bumpQuantOverrideEpoch();
    setCatalystRevision((r) => r + 1);
    if (onStockSynced) {
      onStockSynced(enrichStockMetrics(activeStock));
    }
    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Override ${activeStock.ticker} Disimpan (USER_OVERRIDE)`,
      text: `ROE ${computedRoe.toFixed(2)}% · PER ${liveCalibrationPreview?.impliedPer ?? '-'}x · PBV ${liveCalibrationPreview?.impliedPbv ?? '-'}x · Ke ${liveCalibrationPreview?.kePct ?? '-'}%`,
      showConfirmButton: false,
      timer: 2600
    });
  };

  const handleAutoSyncP0Sanity = () => {
    if (!activeStock) return;
    const rawSplit = Number(splitRatioInput.replace(',', '.'));
    const splitVal = Number.isFinite(rawSplit) && rawSplit > 0 ? rawSplit : activeStock.splitRatioDivisor ?? 1;
    const parsedInputShares = Math.round((Number(sharesMillionInput.replace(',', '.')) || 0) * 1_000_000);
    const rawTkr = joeliardiEval?.rawTickerData;
    const officialShares =
      (parsedInputShares > 0 ? parsedInputShares : undefined) ??
      rawTkr?.sharesOutstanding ??
      activeStock.sharesOutstanding ??
      resolveOfficialIdxSharesOutstanding(activeStock.ticker, splitVal) ??
      1_000_000_000;
    const syncedMarketCapTrillion = Number(
      ((officialShares * activeStock.lastPrice) / 1_000_000_000_000).toFixed(4)
    );
    setSharesMillionInput((officialShares / 1_000_000).toFixed(2));
    setMarketCapTrillionInput(syncedMarketCapTrillion.toFixed(2));

    // Also reconcile Net Income, Equity, Revenue, EBIT, OCF, and D&A (including USD->IDR scale fix if raw values are in USD)
    const existingFundOv = getFundamentalUserOverride(activeStock.ticker);
    let candRev = existingFundOv?.revenueTTMIdr ?? rawTkr?.revenueTTM ?? 0;
    let candEbit = existingFundOv?.operatingProfitTTMIdr ?? rawTkr?.operatingProfitTTM ?? 0;
    let candNi = existingFundOv?.netIncomeTTMIdr ?? rawTkr?.netIncomeTTM ?? 0;
    let candEq = existingFundOv?.equityAttributableIdr ?? rawTkr?.equityAttributable ?? 0;
    let candOcf = existingFundOv?.ocfTTMIdr ?? rawTkr?.ocfTTM ?? 0;
    let candDa = existingFundOv?.daTTMIdr ?? rawTkr?.daTTM ?? 0;

    let wasUsdScaled = false;
    if (candEq > 0 && officialShares > 50_000_000 && candEq / officialShares < 5.0) {
      const usdIdr = 16250;
      candRev = Math.round(candRev * usdIdr);
      candEbit = Math.round(candEbit * usdIdr);
      candNi = Math.round(candNi * usdIdr);
      candEq = Math.round(candEq * usdIdr);
      candOcf = Math.round(candOcf * usdIdr);
      candDa = Math.round(candDa * usdIdr);
      wasUsdScaled = true;
    }

    if (candEq > 0 && candNi > 0) {
      setRevenueBillionInput((candRev / 1_000_000_000).toFixed(2));
      setEbitBillionInput((candEbit / 1_000_000_000).toFixed(2));
      setNetIncomeBillionInput((candNi / 1_000_000_000).toFixed(2));
      setEquityBillionInput((candEq / 1_000_000_000).toFixed(2));
      if (candOcf > 0) setOcfBillionInput((candOcf / 1_000_000_000).toFixed(2));
      if (candDa > 0) setDaBillionInput((candDa / 1_000_000_000).toFixed(2));

      saveFundamentalUserOverride({
        ...existingFundOv,
        ticker: activeStock.ticker,
        revenueTTMIdr: candRev > 0 ? candRev : existingFundOv?.revenueTTMIdr,
        operatingProfitTTMIdr: candEbit > 0 ? candEbit : existingFundOv?.operatingProfitTTMIdr,
        netIncomeTTMIdr: candNi,
        equityAttributableIdr: candEq,
        ocfTTMIdr: candOcf > 0 ? candOcf : existingFundOv?.ocfTTMIdr,
        daTTMIdr: candDa > 0 ? candDa : existingFundOv?.daTTMIdr,
        sharesOutstanding: officialShares,
        overrideNote: `Auto-Sync P0 Reconciled (${new Date().toISOString().slice(0, 10)})${
          wasUsdScaled ? ' · Normalisasi Skala USD→IDR (@ Rp 16.250)' : ''
        } · Market Cap = Shares × Px (Δ 0,00%)`
      });
    }

    const existingCustom = getCustomCorporateActionOverrides()[activeStock.ticker];
    saveCustomCorporateActionOverride({
      ...existingCustom,
      ticker: activeStock.ticker,
      splitRatioDivisor: splitVal,
      sharesOutstanding: officialShares,
      liveMarketCapTrillionIdr: syncedMarketCapTrillion,
      catalystNote: `Sinkronisasi P0 BEI (${activeStock.ticker}): Saham Beredar Resmi ${officialShares.toLocaleString('id-ID')} lbr × Harga Live Rp ${activeStock.lastPrice.toLocaleString('id-ID')} = Market Cap Rp ${syncedMarketCapTrillion.toFixed(2)} Triliun (Implied Δ 0,00%).`
    });
    bumpQuantOverrideEpoch();
    setCatalystRevision((r) => r + 1);
    if (onStockSynced) {
      onStockSynced(enrichStockMetrics(activeStock));
    }
    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `P0 Sanity ${activeStock.ticker} Tersinkronisasi`,
      text: wasUsdScaled
        ? 'Skala laporan keuangan USD→IDR & Market Cap = Shares × Harga Live berhasil direkonsiliasi (SANITY: PASS).'
        : 'Market Cap = Shares × Harga Live & identitas EPS/BVPS × Shares berhasil diselaraskan (SANITY: PASS).',
      showConfirmButton: false,
      timer: 2600
    });
  };

  const handleResetCatalystOverride = () => {
    if (!activeStock) return;
    resetCorporateActionOverride(activeStock.ticker);
    resetFundamentalUserOverride(activeStock.ticker);
    bumpQuantOverrideEpoch();
    setCatalystRevision((r) => r + 1);
    if (onStockSynced) {
      onStockSynced(enrichStockMetrics(activeStock));
    }
    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title: `Override ${activeStock.ticker} Direset`,
      text: 'Kembali ke sumber snapshot / seed default.',
      showConfirmButton: false,
      timer: 2000
    });
  };

  const handleTryLiveYahooFundamentals = async () => {
    if (!activeStock) return;
    setIsFetchingLiveFundamentals(true);
    try {
      const liveEntry = await tryFetchLiveTickerFundamentalsOnDemand(activeStock.ticker, {
        forceRefresh: true
      });
      if (liveEntry && liveEntry.lastPrice && liveEntry.lastPrice > 0) {
        setLiveStockOverride((prev) => ({
          ...(prev || activeStock),
          lastPrice: liveEntry.lastPrice ?? activeStock.lastPrice,
          previousClose: liveEntry.previousClose ?? activeStock.previousClose,
          change1D: liveEntry.change1D ?? activeStock.change1D,
          adtv20dIdr: liveEntry.adtv20dIdr ?? activeStock.adtv20dIdr,
          adtvSource: 'LIVE_YAHOO_API',
          priceSource: 'LIVE_YAHOO_API',
          priceAsOfDate: liveEntry.asOfDate || new Date().toISOString().slice(0, 10),
          beta1Y: liveEntry.beta1Y ?? activeStock.beta1Y,
          volatilityAnn: liveEntry.realizedAnnualVol ?? activeStock.volatilityAnn,
          atr20Idr: liveEntry.atr20 ?? activeStock.atr20Idr,
          dividendYieldPct: liveEntry.dividendYieldTTM ?? activeStock.dividendYieldPct
        }));
      }
      setCatalystRevision((r) => r + 1);
      if (liveEntry && (liveEntry.revenueTTMIdr || liveEntry.adtv20dIdr)) {
        void Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `Live Sync ${activeStock.ticker} Berhasil`,
          text:
            liveEntry.provenanceMode === 'LIVE_REALTIME_WORKER'
              ? `Laporan Keuangan TTM, Harga, ADTV 20D & SBN ditarik real-time via Cloudflare Worker (${liveEntry.fiscalPeriod || 'TTM'}).`
              : liveEntry.revenueTTMIdr
              ? `Laporan Keuangan & Volume 20D ditarik dari Yahoo API.`
              : `ADTV 20D Live (Rp ${((liveEntry.adtv20dIdr ?? 0) / 1e9).toFixed(2)} M/hr) diperbarui dari Chart v8.`,
          showConfirmButton: false,
          timer: 2800
        });
      }
    } finally {
      setIsFetchingLiveFundamentals(false);
    }
  };

  const handleSaveRealtimeWorkerUrl = async () => {
    const cleaned = sanitizeRealtimeWorkerUrl(realtimeWorkerUrlInput);
    saveRealtimeWorkerUrl(cleaned);
    setRealtimeWorkerUrlInput(cleaned);
    setWorkerConnTestResult(null);
    if (cleaned && activeStock) {
      await handleTryLiveYahooFundamentals();
    } else {
      setCatalystRevision((r) => r + 1);
    }
  };

  const handleTestRealtimeWorkerConnection = async () => {
    const cleaned = sanitizeRealtimeWorkerUrl(realtimeWorkerUrlInput);
    saveRealtimeWorkerUrl(cleaned);
    setRealtimeWorkerUrlInput(cleaned);
    setIsTestingWorkerConn(true);
    try {
      const res = await testRealtimeWorkerConnection(cleaned);
      setWorkerConnTestResult(res);
      if (res.ok && activeStock) {
        await handleTryLiveYahooFundamentals();
      }
    } finally {
      setIsTestingWorkerConn(false);
    }
  };

  const handleClearCacheAndHardResync = async () => {
    if (!activeStock) return;
    resetFundamentalUserOverride(activeStock.ticker);
    resetCorporateActionOverride(activeStock.ticker);
    clearSyncDiagnostics();
    clearLiveQuoteMemoryCache();
    await loadFundamentalsSnapshot(true);
    await handleTryLiveYahooFundamentals();
    await handleManualRefreshSingleTicker();
    setCatalystRevision((r) => r + 1);
    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Hard Resync ${activeStock.ticker} Selesai`,
      text: 'Cache lokal dibersihkan & data ditarik ulang dari endpoint live + snapshot.',
      showConfirmButton: false,
      timer: 2600
    });
  };

  const handleCopyDebugJson = async () => {
    if (!activeStock || !joeliardiEval) return;
    const payload = {
      ticker: activeStock.ticker,
      exportedAt: new Date().toISOString(),
      dataLineage: joeliardiEval.dataLineage,
      rawTickerData: joeliardiEval.rawTickerData,
      sanityReport: joeliardiEval.sanityReport,
      valuationLedger: joeliardiEval.valuationLedger
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      void Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Debug JSON Disalin ke Clipboard',
        text: `DataLineage & RawTickerData (${activeStock.ticker}) siap di-paste.`,
        showConfirmButton: false,
        timer: 2200
      });
    } catch {
      void Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'warning',
        title: 'Gagal Menyalin ke Clipboard',
        text: 'Gunakan window.debugNostradamus("' + activeStock.ticker + '") di Console.',
        showConfirmButton: false,
        timer: 2600
      });
    }
  };

  const handleTriggerGitHubActionsFundamentalsSync = async () => {
    if (!activeStock) return;
    const targetSingleTicker = activeStock.ticker.trim().toUpperCase();
    setIsTriggeringGhActionsSync(true);
    setGhActionsPollingStep(`Menghubungi Yahoo Server via GitHub Actions (${targetSingleTicker})...`);
    try {
      const ghConfig = loadGitHubCloudConfig();
      const res = await triggerGitHubActionsFundamentalsSync(ghConfig, {
        targetTickers: targetSingleTicker
      });
      if (!res.ok) {
        setGhActionsPollingStep(null);
        void Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'warning',
          title: 'GitHub PAT Belum Aktif di Vault',
          text: res.message,
          showConfirmButton: false,
          timer: 4200
        });
        return;
      }

      // Single-Ticker Auto-Polling every 4 seconds (up to 7 polls / ~28 seconds)
      let foundEntry = false;
      for (let attempt = 1; attempt <= 7; attempt++) {
        setGhActionsPollingStep(
          attempt <= 2
            ? `Menghubungi Yahoo Server (${targetSingleTicker}) · Poll ${attempt}/7...`
            : attempt <= 5
            ? `Memproses Laporan Keuangan TTM ${targetSingleTicker} · Poll ${attempt}/7...`
            : `Memuat ulang fundamentals-snapshot.json (${targetSingleTicker}) · Poll ${attempt}/7...`
        );
        await new Promise((r) => setTimeout(r, 4000));
        const refreshedSnap = await loadFundamentalsSnapshot(true);
        const entry = refreshedSnap?.tickers?.[targetSingleTicker];
        if (entry && (entry.revenueTTMIdr || entry.netIncomeTTMIdr || entry.equityAttributableIdr)) {
          foundEntry = true;
          break;
        }
      }

      setCatalystRevision((r) => r + 1);
      setGhActionsPollingStep(null);
      void Swal.fire({
        toast: true,
        position: 'top-end',
        icon: foundEntry ? 'success' : 'info',
        title: foundEntry
          ? `Laporan Keuangan ${targetSingleTicker} Berhasil Dimuat!`
          : `Workflow ${targetSingleTicker} Sedang Berjalan di GitHub`,
        text: foundEntry
          ? `Data fundamental ${targetSingleTicker} telah masuk ke snapshot dan modal diperbarui otomatis.`
          : `GitHub Actions masih memproses ${targetSingleTicker}. Klik Refresh Emiten beberapa saat lagi.`,
        showConfirmButton: false,
        timer: 3800
      });
    } finally {
      setIsTriggeringGhActionsSync(false);
      setGhActionsPollingStep(null);
    }
  };

  const thinkingStages = useMemo(() => {
    if (!activeStock || !joeliardiEval) return [];
    const gpToAssets =
      joeliardiEval.grossProfitabilityToAssets ??
      activeStock.grossProfitabilityToAssets ??
      Number((activeStock.roe * 0.85).toFixed(1));
    const ocfNi =
      joeliardiEval.ocfToNetIncomeRatio ??
      activeStock.ocfToNetIncomeRatio ??
      0.92;
    const dynKe = joeliardiEval.dynamicCostOfEquityPct ?? 12.64;
    const justPbv =
      joeliardiEval.damodaranJustifiedPbv ?? joeliardiEval.joeliardiFairPbv;
    const betaCap = joeliardiEval.betaWeightedSizingCapPct ?? 14.0;
    const secShort = joeliardiEval.sectorPrimaryMetricShort ?? 'PBV';
    const secMult = joeliardiEval.sectorPrimaryImpliedMultiple ?? joeliardiEval.impliedPbv;
    const secFairMult = joeliardiEval.sectorPrimaryFairMultiple ?? justPbv;
    const peerTkr = joeliardiEval.statArbPeerTicker ?? 'PEER';
    const zScore = joeliardiEval.statArbZScore ?? 0;
    return [
      `01/04 · Membedah Profitabilitas Kas ${activeStock.ticker}: GP/A (Novy-Marx) ${gpToAssets.toFixed(1)}% · OCF/NI (Anti-Junk) ${ocfNi.toFixed(2)}x · ROE ${activeStock.roe.toFixed(1)}%...`,
      `02/04 · Menghitung Multi-Metode Harga Wajar (${secShort} ${secMult}x vs Wajar ${secFairMult}x · RIM ${joeliardiEval.rimFadeYears ?? 6}Y · Ke ${dynKe.toFixed(2)}%) → Utama Rp ${formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)}...`,
      `03/04 · Menguji Relative Value / Statistical Arbitrage (${activeStock.ticker} vs ${peerTkr}, Z-Score ${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ) & saringan HSC...`,
      `04/04 · Menghitung porsi 1/β Barbell Position Sizing (Cap ≤${betaCap.toFixed(1)}%, β ${activeStock.beta1Y.toFixed(2)}x) & menyintesis katalis berita emiten...`
    ];
  }, [activeStock, joeliardiEval]);

  // Instant full-report reveal whenever a new structuredReport arrives (eliminates progressive timers and extra re-renders)
  useEffect(() => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
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

    setTypedCharCount(totalChars);
    setVisibleCotCount(totalCot);
    setVisibleSectionCount(totalSecs);
    setIsTypingComplete(true);
  }, [structuredReport, isAnalyzingAi]);

  const handleSkipTypingAnimation = () => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
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

  // Helper to run non-blocking AI inspection without triggering repeated interval re-renders
  const runWithThinkingStages = async <T,>(taskFn: () => Promise<T>): Promise<T> => {
    setThinkingStageIdx(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return await taskFn();
  };

  // Instant Snapshot Synthesis + Lightweight Non-Blocking Background Sync:
  // 1. Immediately renders full Investment Committee Report & Corporate Action Radar from existing snapshot on Frame 1 (<15ms).
  // 2. Quietly syncs Cloudflare Worker (if configured) and RSS news in the background without blocking UI or re-ranking the 975-stock table.
  useEffect(() => {
    if (!stock || !isValuationHydrated) return;
    let isMounted = true;
    setLiveStockOverride(null);

    const baseStock = activeStock || stock;
    const defaultQuestion = `Apakah ${baseStock.ticker} layak dibeli pada harga Rp ${baseStock.lastPrice.toLocaleString('id-ID')} berdasarkan Nilai Intrinsik Wajar & Fundamental Kualitas Moat?`;
    setUserQuestion(defaultQuestion);

    const baselineRadarNews = buildEmitenCorporateActionRadarBaseline(
      baseStock.ticker,
      baseStock.name,
      baseStock.sector,
      baseStock
    );
    setRecentNews(baselineRadarNews);
    setIsLoadingNews(false);

    const initialEval =
      joeliardiEval ||
      evaluateJoeliardiOosFundamental(
        baseStock,
        undefined,
        availablePortfolioCashIdr,
        regimeStatus
      );
    const instantReport = buildDeepAnalyticalConvictionReport({
      stock: baseStock,
      joeliardiEval: initialEval,
      recentNews: baselineRadarNews,
      userQuestion: defaultQuestion,
      regimeStatus,
      availablePortfolioCashIdr
    });
    const instantParsedSummary = parseDirectSummaryHeaderAndBody(
      instantReport.directAnswerSummary || ''
    );
    setStructuredReport(instantReport);
    setTypedCharCount(instantParsedSummary.body.length);
    setVisibleCotCount(instantReport.chainOfThoughtSteps?.length || 0);
    setVisibleSectionCount(instantReport.sections?.length || 0);
    setIsTypingComplete(true);
    setAiAnalysisFallbackText(stripRawMarkdownArtifacts(instantReport.directAnswerSummary));
    setIsAiGenerated(false);
    setAiGeneratedAt(new Date().toISOString());
    setIsAnalyzingAi(false);

    const runLazyOnDemandInspect = async () => {
      // Yield once so Frame 1 + Instant Committee Report finishes painting smoothly first
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (!isMounted) return;

      let currentStock = baseStock;
      let hasMeaningfulChange = false;
      const hasConfiguredWorker = Boolean(getRealtimeWorkerUrl());
      const needsPriceHydration = !currentStock.lastPrice || currentStock.lastPrice <= 0;

      if (hasConfiguredWorker || needsPriceHydration) {
        setIsSyncingOnDemand(true);
        try {
          const workerEntry = await tryFetchLiveTickerFundamentalsOnDemand(stock.ticker, {
            skipRelayChartProbe: !needsPriceHydration
          }).catch(() => null);
          if (!isMounted) return;

          let freshQuote: StockMetrics | null = null;
          if (needsPriceHydration && (!workerEntry || !workerEntry.lastPrice || workerEntry.lastPrice <= 0)) {
            freshQuote = await fetchLiveIdxTicker(stock.ticker).catch(() => null);
          }
          if (!isMounted) return;

          if (freshQuote && freshQuote.lastPrice > 0) {
            currentStock = {
              ...currentStock,
              ...freshQuote,
              isHscFlagged: stock.isHscFlagged,
              hscSource: stock.hscSource,
              hscTier: stock.hscTier,
              hscReason: stock.hscReason,
              kseiHscConcentrationPct: stock.kseiHscConcentrationPct,
              kseiHscIsNew: stock.kseiHscIsNew,
              kseiHscFootnote: stock.kseiHscFootnote,
              kseiHscScorePenaltyPts: stock.kseiHscScorePenaltyPts
            };
          }

          if (workerEntry) {
            const ov = resolveTickerFundamentalOverlay(
              currentStock.ticker,
              {
                defaultRoe: currentStock.trailingRoePct ?? currentStock.roe,
                defaultDer: currentStock.debtToEquity,
                defaultOpMargin: currentStock.operatingMargin
              },
              workerEntry.adtv20dIdr ?? currentStock.adtv20dIdr,
              'LIVE_YAHOO_API',
              workerEntry.asOfDate || new Date().toISOString().slice(0, 10)
            );
            currentStock = enrichStockMetrics({
              ...currentStock,
              ...(workerEntry.lastPrice && workerEntry.lastPrice > 0
                ? {
                    lastPrice: workerEntry.lastPrice,
                    previousClose: workerEntry.previousClose ?? currentStock.previousClose,
                    change1D: workerEntry.change1D ?? currentStock.change1D,
                    priceSource: 'LIVE_YAHOO_API',
                    priceAsOfDate: workerEntry.asOfDate || new Date().toISOString().slice(0, 10)
                  }
                : {}),
              ...(workerEntry.adtv20dIdr && workerEntry.adtv20dIdr > 0
                ? {
                    adtv20dIdr: workerEntry.adtv20dIdr,
                    adtvSource: 'LIVE_YAHOO_API',
                    adtvAsOfDate: workerEntry.asOfDate || new Date().toISOString().slice(0, 10)
                  }
                : {}),
              ...(workerEntry.beta1Y ? { beta1Y: workerEntry.beta1Y } : {}),
              ...(workerEntry.realizedAnnualVol ? { volatilityAnn: workerEntry.realizedAnnualVol } : {}),
              ...(workerEntry.atr20 ? { atr20Idr: workerEntry.atr20 } : {}),
              ...(workerEntry.dividendYieldTTM !== undefined && workerEntry.dividendYieldTTM !== null
                ? { dividendYieldPct: workerEntry.dividendYieldTTM }
                : {}),
              ...(ov.sharesOutstanding ? { sharesOutstanding: ov.sharesOutstanding } : {}),
              ...(ov.revenueTTMIdr ? { revenueTTMIdr: ov.revenueTTMIdr } : {}),
              ...(ov.latestFullYearRevenueIdr ? { latestFullYearRevenueIdr: ov.latestFullYearRevenueIdr } : {}),
              ...(ov.operatingProfitTTMIdr ? { operatingProfitTTMIdr: ov.operatingProfitTTMIdr } : {}),
              ...(ov.ebitdaTTMIdr ? { ebitdaTTMIdr: ov.ebitdaTTMIdr } : {}),
              ...(ov.netIncomeTTMIdr ? { netIncomeTTMIdr: ov.netIncomeTTMIdr } : {}),
              ...(ov.netIncomeYoYPct !== undefined ? { earningsGrowthYoYPct: ov.netIncomeYoYPct } : {}),
              ...(ov.operatingProfitYoYPct !== undefined ? { operatingProfitGrowthYoYPct: ov.operatingProfitYoYPct } : {}),
              ...(ov.equityAttributableIdr ? { equityAttributableIdr: ov.equityAttributableIdr } : {}),
              ...(ov.totalAssetsIdr ? { totalAssetsIdr: ov.totalAssetsIdr } : {}),
              ...(ov.totalDebtIdr !== undefined ? { totalDebtIdr: ov.totalDebtIdr } : {}),
              ...(ov.cashAndEquivalentsIdr !== undefined ? { cashAndEquivalentsIdr: ov.cashAndEquivalentsIdr } : {}),
              ...(ov.ocfTTMIdr !== undefined ? { ocfTTMIdr: ov.ocfTTMIdr } : {}),
              ...(ov.capexTTMIdr !== undefined ? { capexTTMIdr: ov.capexTTMIdr } : {}),
              ...(ov.daTTMIdr !== undefined ? { daTTMIdr: ov.daTTMIdr } : {}),
              ...(ov.roeAvg3YPct !== undefined ? { roeAvg3YPct: ov.roeAvg3YPct } : {}),
              ...(ov.roeAvg5YPct !== undefined ? { roeAvg5YPct: ov.roeAvg5YPct } : {}),
              ...(ov.daAnomaly !== undefined ? { daAnomaly: ov.daAnomaly } : {}),
              ...(ov.daMethodNote ? { daMethodNote: ov.daMethodNote } : {}),
              ...(ov.ttmMethod ? { ttmMethod: ov.ttmMethod } : {}),
              ...(ov.flowAudit ? { flowAudit: ov.flowAudit } : {}),
              ...(ov.missingFundamentalFields ? { missingFundamentalFields: ov.missingFundamentalFields } : {}),
              ...(ov.reportingCurrency ? { reportingCurrency: ov.reportingCurrency } : {}),
              ...(ov.fxRateUsdIdr ? { fxRateUsdIdr: ov.fxRateUsdIdr } : {}),
              ...(ov.computedRoePct ? { roe: ov.computedRoePct, trailingRoePct: ov.computedRoePct } : {}),
              ...(ov.computedOpMarginPct ? { operatingMargin: ov.computedOpMarginPct } : {}),
              ...(ov.computedDer !== undefined ? { debtToEquity: ov.computedDer } : {}),
              ...(ov.fundamentalsSource ? { fundamentalsSource: ov.fundamentalsSource } : {}),
              ...(ov.fundamentalsAsOfDate ? { fundamentalsAsOfDate: ov.fundamentalsAsOfDate } : {}),
              ...(ov.fundamentalsFiscalPeriod ? { fundamentalsFiscalPeriod: ov.fundamentalsFiscalPeriod } : {}),
              ...(ov.fundamentalsNote ? { fundamentalsNote: ov.fundamentalsNote } : {})
            });
          }

          hasMeaningfulChange =
            currentStock.lastPrice !== stock.lastPrice ||
            currentStock.change1D !== stock.change1D ||
            currentStock.revenueTTMIdr !== stock.revenueTTMIdr ||
            currentStock.netIncomeTTMIdr !== stock.netIncomeTTMIdr ||
            currentStock.equityAttributableIdr !== stock.equityAttributableIdr ||
            currentStock.adtv20dIdr !== stock.adtv20dIdr ||
            currentStock.fundamentalsSource !== stock.fundamentalsSource;

          if (hasMeaningfulChange) {
            setLiveStockOverride(currentStock);
          }
        } finally {
          if (isMounted) setIsSyncingOnDemand(false);
        }
      } else {
        setIsSyncingOnDemand(false);
      }

      if (!isMounted) return;

      // 2. Pull live emiten-specific RSS news quietly in the background
      const fetchedNews = await fetchLiveEmitenSpecificNews(
        currentStock.ticker,
        currentStock.name,
        currentStock.sector,
        currentStock
      ).catch(() => baselineRadarNews);
      if (!isMounted) return;

      // 3. Only re-synthesize the report if live Worker metrics changed or new external RSS headlines arrived
      const hasLiveExternalHeadlines = fetchedNews.length > baselineRadarNews.length;
      if (hasMeaningfulChange || hasLiveExternalHeadlines) {
        const evalObj = hasMeaningfulChange
          ? evaluateJoeliardiOosFundamental(
              currentStock,
              undefined,
              availablePortfolioCashIdr,
              regimeStatus
            )
          : initialEval;
        const qText = `Apakah ${currentStock.ticker} layak dibeli pada harga Rp ${currentStock.lastPrice.toLocaleString('id-ID')} berdasarkan Nilai Intrinsik Wajar & Fundamental Kualitas Moat?`;
        const updatedReport = buildDeepAnalyticalConvictionReport({
          stock: currentStock,
          joeliardiEval: evalObj,
          recentNews: fetchedNews.length > 0 ? fetchedNews : baselineRadarNews,
          userQuestion: qText,
          regimeStatus,
          availablePortfolioCashIdr
        });
        if (isMounted) {
          const updatedParsedSummary = parseDirectSummaryHeaderAndBody(
            updatedReport.directAnswerSummary || ''
          );
          if (fetchedNews.length > 0) {
            setRecentNews(fetchedNews);
          }
          setUserQuestion(qText);
          setStructuredReport(updatedReport);
          setTypedCharCount(updatedParsedSummary.body.length);
          setVisibleCotCount(updatedReport.chainOfThoughtSteps?.length || 0);
          setVisibleSectionCount(updatedReport.sections?.length || 0);
          setIsTypingComplete(true);
          setAiAnalysisFallbackText(stripRawMarkdownArtifacts(updatedReport.directAnswerSummary));
        }
      } else if (isMounted && fetchedNews.length > 0 && fetchedNews.length !== baselineRadarNews.length) {
        setRecentNews(fetchedNews);
      }
    };

    void runLazyOnDemandInspect();

    return () => {
      isMounted = false;
    };
  }, [stock?.ticker, isValuationHydrated]);

  if (!activeStock) return null;

  // Frame 0 Instant Modal Shell: paints immediately (<2ms) on click before Frame 1 valuation hydration runs
  if (!joeliardiEval) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
        <div className="bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
          <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#E4E2DD] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xs bg-[#D97706]/10 border border-[#D97706]/30 text-[#D97706] shrink-0">
                <Scale className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bb-amber">
                    NOSTRADAMUS QUANT INSPECTOR
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#0284C7] bg-[#0284C7]/10 border border-[#0284C7]/30 px-2 py-0.5 rounded-xs">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>Memuat Mesin Valuasi {activeStock.ticker}.JK...</span>
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[#111315] flex items-center gap-2 mt-0.5 truncate">
                  <span className="font-mono">{activeStock.ticker}</span>
                  <span className="text-neutral-400 font-normal">·</span>
                  <span className="truncate">{activeStock.name}</span>
                  <span className="text-xs font-normal text-neutral-500">
                    ({activeStock.sector} · Tren IHSG: {regimeStatus})
                  </span>
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xs bg-[#FFFFFF] border border-[#E4E2DD] text-neutral-500 hover:bg-[#E11D48] hover:text-white hover:border-[#E11D48] transition-colors cursor-pointer shrink-0"
              title="Tutup Jendela Inspector (Esc)"
              aria-label="Tutup Inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                `Harga Pasar Live: Rp ${activeStock.lastPrice.toLocaleString('id-ID')}`,
                'Menghitung Nilai Intrinsik Wajar...',
                'Menguji Margin of Safety & State...',
                'Memvalidasi Router Matriks Sektor...'
              ].map((label, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xs bg-[#FAF9F6] border border-[#E4E2DD] animate-pulse"
                >
                  <div className="text-[11px] font-mono font-bold text-neutral-500">{label}</div>
                  <div className="h-6 mt-2 bg-neutral-200/70 rounded-xs w-3/4" />
                </div>
              ))}
            </div>
            <div className="p-5 rounded-xs bg-[#FAF9F6] border border-[#E4E2DD] flex items-center gap-3 text-xs text-neutral-600 font-mono">
              <RefreshCw className="w-4 h-4 text-[#D97706] animate-spin shrink-0" />
              <span>
                Menjalankan Multi-Stage Residual Income (RIM), Capex Aggressor Router &amp; Forensic Lineage {activeStock.ticker}.JK di background thread...
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleManualRefreshSingleTicker = async () => {
    setIsSyncingOnDemand(true);
    setIsLoadingNews(true);
    try {
      const [freshStock, workerEntry, freshNews] = await Promise.all([
        fetchLiveIdxTicker(activeStock.ticker).catch(() => activeStock),
        tryFetchLiveTickerFundamentalsOnDemand(activeStock.ticker, { forceRefresh: true }).catch(
          () => null
        ),
        fetchLiveEmitenSpecificNews(
          activeStock.ticker,
          activeStock.name,
          activeStock.sector,
          activeStock
        ).catch(() => recentNews)
      ]);
      const ov = resolveTickerFundamentalOverlay(
        activeStock.ticker,
        {
          defaultRoe: activeStock.trailingRoePct ?? activeStock.roe,
          defaultDer: activeStock.debtToEquity,
          defaultOpMargin: activeStock.operatingMargin
        },
        workerEntry?.adtv20dIdr ?? freshStock.adtv20dIdr,
        workerEntry?.adtv20dIdr ? 'LIVE_YAHOO_API' : freshStock.adtvSource,
        workerEntry?.asOfDate || freshStock.priceAsOfDate
      );
      const mergedStock: StockMetrics = enrichStockMetrics({
        ...activeStock,
        ...freshStock,
        ...(workerEntry?.lastPrice && workerEntry.lastPrice > 0
          ? {
              lastPrice: workerEntry.lastPrice,
              previousClose: workerEntry.previousClose ?? freshStock.previousClose,
              change1D: workerEntry.change1D ?? freshStock.change1D,
              priceSource: 'LIVE_YAHOO_API',
              priceAsOfDate: workerEntry.asOfDate || new Date().toISOString().slice(0, 10)
            }
          : {}),
        ...(workerEntry?.adtv20dIdr && workerEntry.adtv20dIdr > 0
          ? {
              adtv20dIdr: workerEntry.adtv20dIdr,
              adtvSource: 'LIVE_YAHOO_API',
              adtvAsOfDate: workerEntry.asOfDate || new Date().toISOString().slice(0, 10)
            }
          : {}),
        ...(workerEntry?.beta1Y ? { beta1Y: workerEntry.beta1Y } : {}),
        ...(workerEntry?.realizedAnnualVol ? { volatilityAnn: workerEntry.realizedAnnualVol } : {}),
        ...(workerEntry?.atr20 ? { atr20Idr: workerEntry.atr20 } : {}),
        ...(workerEntry?.dividendYieldTTM !== undefined && workerEntry?.dividendYieldTTM !== null
          ? { dividendYieldPct: workerEntry.dividendYieldTTM }
          : {}),
        ...(ov.sharesOutstanding ? { sharesOutstanding: ov.sharesOutstanding } : {}),
        ...(ov.revenueTTMIdr ? { revenueTTMIdr: ov.revenueTTMIdr } : {}),
        ...(ov.latestFullYearRevenueIdr ? { latestFullYearRevenueIdr: ov.latestFullYearRevenueIdr } : {}),
        ...(ov.operatingProfitTTMIdr ? { operatingProfitTTMIdr: ov.operatingProfitTTMIdr } : {}),
        ...(ov.ebitdaTTMIdr ? { ebitdaTTMIdr: ov.ebitdaTTMIdr } : {}),
        ...(ov.netIncomeTTMIdr ? { netIncomeTTMIdr: ov.netIncomeTTMIdr } : {}),
        ...(ov.netIncomeYoYPct !== undefined ? { earningsGrowthYoYPct: ov.netIncomeYoYPct } : {}),
        ...(ov.operatingProfitYoYPct !== undefined ? { operatingProfitGrowthYoYPct: ov.operatingProfitYoYPct } : {}),
        ...(ov.equityAttributableIdr ? { equityAttributableIdr: ov.equityAttributableIdr } : {}),
        ...(ov.totalAssetsIdr ? { totalAssetsIdr: ov.totalAssetsIdr } : {}),
        ...(ov.totalDebtIdr !== undefined ? { totalDebtIdr: ov.totalDebtIdr } : {}),
        ...(ov.cashAndEquivalentsIdr !== undefined ? { cashAndEquivalentsIdr: ov.cashAndEquivalentsIdr } : {}),
        ...(ov.ocfTTMIdr !== undefined ? { ocfTTMIdr: ov.ocfTTMIdr } : {}),
        ...(ov.capexTTMIdr !== undefined ? { capexTTMIdr: ov.capexTTMIdr } : {}),
        ...(ov.daTTMIdr !== undefined ? { daTTMIdr: ov.daTTMIdr } : {}),
        ...(ov.roeAvg3YPct !== undefined ? { roeAvg3YPct: ov.roeAvg3YPct } : {}),
        ...(ov.roeAvg5YPct !== undefined ? { roeAvg5YPct: ov.roeAvg5YPct } : {}),
        ...(ov.daAnomaly !== undefined ? { daAnomaly: ov.daAnomaly } : {}),
        ...(ov.daMethodNote ? { daMethodNote: ov.daMethodNote } : {}),
        ...(ov.ttmMethod ? { ttmMethod: ov.ttmMethod } : {}),
        ...(ov.flowAudit ? { flowAudit: ov.flowAudit } : {}),
        ...(ov.missingFundamentalFields ? { missingFundamentalFields: ov.missingFundamentalFields } : {}),
        ...(ov.reportingCurrency ? { reportingCurrency: ov.reportingCurrency } : {}),
        ...(ov.fxRateUsdIdr ? { fxRateUsdIdr: ov.fxRateUsdIdr } : {}),
        ...(ov.computedRoePct ? { roe: ov.computedRoePct, trailingRoePct: ov.computedRoePct } : {}),
        ...(ov.computedOpMarginPct ? { operatingMargin: ov.computedOpMarginPct } : {}),
        ...(ov.computedDer !== undefined ? { debtToEquity: ov.computedDer } : {}),
        ...(ov.fundamentalsSource ? { fundamentalsSource: ov.fundamentalsSource } : {}),
        ...(ov.fundamentalsAsOfDate ? { fundamentalsAsOfDate: ov.fundamentalsAsOfDate } : {}),
        ...(ov.fundamentalsFiscalPeriod ? { fundamentalsFiscalPeriod: ov.fundamentalsFiscalPeriod } : {}),
        ...(ov.fundamentalsNote ? { fundamentalsNote: ov.fundamentalsNote } : {}),
        isHscFlagged: activeStock.isHscFlagged,
        hscSource: activeStock.hscSource,
        hscTier: activeStock.hscTier,
        hscReason: activeStock.hscReason,
        kseiHscConcentrationPct: activeStock.kseiHscConcentrationPct,
        kseiHscIsNew: activeStock.kseiHscIsNew,
        kseiHscFootnote: activeStock.kseiHscFootnote,
        kseiHscScorePenaltyPts: activeStock.kseiHscScorePenaltyPts
      });
      setLiveStockOverride(mergedStock);
      setCatalystRevision((r) => r + 1);
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
          regimeStatus,
          availablePortfolioCashIdr
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
        regimeStatus,
        isAiGenerated,
        aiGeneratedAt
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
        regimeStatus,
        isAiGenerated,
        aiGeneratedAt
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

  const finalConvictionScore =
    joeliardiEval.finalConvictionScore ??
    joeliardiEval.riskSizingResult?.adjustedConvictionScore ??
    joeliardiEval.totalConvictionScore;
  const finalConvictionGrade =
    joeliardiEval.riskSizingResult?.finalConvictionGrade ??
    joeliardiEval.convictionGrade;

  const isGradeBlockedModal =
    activeStock.isHscFlagged || Boolean(joeliardiEval.sanityReport?.isGradeABlocked);
  const gradeBadgeCls = isGradeBlockedModal
    ? 'bg-[#E11D48]/15 text-[#9E2A2B] border-[#E11D48]/50'
    : finalConvictionScore >= 75
    ? 'bg-[#059669]/15 text-[#0D5C46] border-[#059669]/50'
    : finalConvictionScore >= 58
    ? 'bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/50'
    : 'bg-[#E11D48]/15 text-[#9E2A2B] border-[#E11D48]/50';

  const parsedDirectSummary = structuredReport
    ? parseDirectSummaryHeaderAndBody(structuredReport.directAnswerSummary)
    : { header: 'Hasil Analisis Nostradamus', body: '' };

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
              <div className="min-w-0 flex-1">
                {/* Strict 1-Line Modal Header Badges (No Wrap) */}
                <div className="flex items-center gap-1.5 flex-nowrap overflow-hidden whitespace-nowrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bb-amber shrink-0">
                    NOSTRADAMUS
                  </span>
                  <span
                    className={`text-[10px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-xs border shrink-0 ${gradeBadgeCls}`}
                    title={`Grade ${finalConvictionGrade} · Skor Komposit Final ${finalConvictionScore}/100`}
                  >
                    {`${finalConvictionGrade} · SKOR ${finalConvictionScore}/100`}
                  </span>
                  <span
                    title={
                      joeliardiEval.isConvictionCappedBySeed
                        ? `${joeliardiEval.seedCapWarningReason || ''} | SANITY: ${joeliardiEval.sanityReport?.status ?? 'SEED_WARN'}`
                        : `SANITY: ${joeliardiEval.sanityReport?.status ?? 'PASS'}${
                            joeliardiEval.sanityReport?.keSafetyBufferBps
                              ? ` (+${joeliardiEval.sanityReport.keSafetyBufferBps}bps Ke)`
                              : ''
                          } | LINEAGE: ${joeliardiEval.dataLineage?.overallStatus ?? 'INSTITUTIONAL_GRADE'} (${
                            joeliardiEval.dataLineage?.freshFieldCount ?? 0
                          } Fresh / ${joeliardiEval.dataLineage?.seedFieldCount ?? 0} Seed)${
                            joeliardiEval.dataLineage?.sbnMacroWarningMessage
                              ? ` | ${joeliardiEval.dataLineage.sbnMacroWarningMessage}`
                              : ''
                          }`
                    }
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs border shrink-0 ${
                      joeliardiEval.compactHeaderDataStatus === 'FRESH' ||
                      joeliardiEval.compactHeaderDataStatus === 'WORKER'
                        ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
                        : joeliardiEval.compactHeaderDataStatus === 'OVERRIDE'
                        ? 'bg-indigo-950/90 text-indigo-300 border-indigo-500/50'
                        : joeliardiEval.compactHeaderDataStatus === 'SEED_WARN'
                        ? 'bg-rose-950/90 text-rose-300 border-rose-500/60'
                        : 'bg-amber-950/90 text-amber-300 border-amber-500/50'
                    }`}
                  >
                    {joeliardiEval.compactHeaderDataBadge || 'DATA: FRESH'}
                  </span>
                  {joeliardiEval.isCatalystActive &&
                    joeliardiEval.sanityReport?.isDualCatalystConfirmed !== false &&
                    joeliardiEval.catalystBadgeLabel && (
                      <span
                        title={
                          joeliardiEval.catalystNarrative ||
                          'Katalis Aktif Terdeteksi (Momentum Laba Kuartalan >20% YoY / Injeksi Buyback Aktif)'
                        }
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-extrabold text-[#FFFFFF] bg-[#0D5C46] border border-[#059669] px-2 py-0.5 rounded-xs shadow-2xs shrink-0"
                      >
                        <Sparkles className="w-2.5 h-2.5 shrink-0" />
                        <span>{joeliardiEval.catalystBadgeLabel}</span>
                      </span>
                    )}
                  {(activeStock.splitRatioDivisor ?? 1) > 1 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#0284C7] bg-[#0284C7]/10 border border-[#0284C7]/40 px-2 py-0.5 rounded-xs shrink-0">
                      <span>SPLIT 1:{activeStock.splitRatioDivisor}</span>
                    </span>
                  )}
                  {isSyncingOnDemand && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#0284C7] bg-[#0284C7]/10 border border-[#0284C7]/30 px-2 py-0.5 rounded-xs shrink-0">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      <span>Sync {activeStock.ticker}.JK...</span>
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[#111315] flex items-center gap-2 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="font-mono">{activeStock.ticker}</span>
                  <span className="text-neutral-400 font-normal">·</span>
                  <span>{activeStock.name}</span>
                  <span className="text-xs font-normal text-neutral-500">
                    ({activeStock.sector} · Tren IHSG: {regimeStatus})
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

          {/* Action Toolbar Row: Strictly Single-Row Layout (Refresh -> Calibrator -> Lineage -> HSC -> Worker -> Export PNG -> Export PDF) */}
          <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-[#E4E2DD]/70 flex-nowrap overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
              <button
                type="button"
                onClick={handleManualRefreshSingleTicker}
                disabled={isSyncingOnDemand}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[#0284C7] bb-cyan bg-[#FFFFFF] border border-[#E4E2DD] hover:border-[#0284C7] rounded-xs transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                title="Perbarui harga pasar live Yahoo Finance & berita terbaru khusus emiten ini"
              >
                <RefreshCw
                  className={`w-3 h-3 shrink-0 ${isSyncingOnDemand ? 'animate-spin' : ''}`}
                />
                <span>Refresh Emiten</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveToolPanel((prev) =>
                    prev === 'CALIBRATION' ? 'NONE' : 'CALIBRATION'
                  )
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showCatalystCalibrator ||
                  Boolean(getCustomCorporateActionOverrides()[activeStock.ticker]) ||
                  Boolean(getFundamentalUserOverride(activeStock.ticker))
                    ? 'bg-[#0D131C] text-emerald-300 border-emerald-500/60'
                    : 'bg-[#FFFFFF] text-[#0D5C46] border-[#059669]/40 hover:bg-[#059669]/10'
                }`}
                title="Kalibrasi Fundamental TTM (Revenue, EBIT, Net Income, Equity, ADTV, SBN 10Y) & Corporate Action (Split, Buyback, ROE)"
              >
                <SlidersHorizontal className="w-3 h-3 shrink-0" />
                <span>
                  {showCatalystCalibrator
                    ? 'Tutup Kalibrator'
                    : 'Kalibrasi Split / Buyback / ROE'}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveToolPanel((prev) =>
                    prev === 'FORENSIC_LINEAGE' ? 'NONE' : 'FORENSIC_LINEAGE'
                  )
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono font-bold rounded-xs border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showForensicLineageDrawer
                    ? 'bg-[#0D131C] text-sky-300 border-sky-500/60'
                    : joeliardiEval.isConvictionCappedBySeed
                    ? 'bg-rose-950/90 text-rose-300 border-rose-500/60 hover:bg-rose-900'
                    : 'bg-[#0D131C] text-slate-200 border-[#222C3C] hover:border-sky-500/50'
                }`}
                title="Buka Forensic Data Lineage & Freshness Debugger (20 TrackedField<T> & Log Jaringan)"
              >
                <Database className="w-3 h-3 shrink-0 text-sky-400" />
                <span>
                  Forensic Lineage ({joeliardiEval.dataLineage?.freshFieldCount ?? 0}F/
                  {joeliardiEval.dataLineage?.seedFieldCount ?? 0}S)
                </span>
                {showForensicLineageDrawer ? (
                  <ChevronUp className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                )}
              </button>

              {onToggleHscFlag && (
                <button
                  type="button"
                  onClick={() =>
                    onToggleHscFlag(activeStock.ticker, Boolean(activeStock.isHscFlagged))
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    activeStock.isHscFlagged
                      ? 'bg-[#E11D48] text-white border-[#E11D48] hover:bg-[#BE123C]'
                      : 'bg-[#FFFFFF] text-[#9E2A2B] border-[#E11D48]/40 hover:bg-[#E11D48]/10'
                  }`}
                  title="Tandai atau lepas label saham HSC (High Speculative Concentration)"
                >
                  <ShieldAlert className="w-3 h-3 shrink-0" />
                  <span>
                    {activeStock.isHscFlagged ? 'Label HSC (Lepas)' : 'Tandai HSC'}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
              <button
                type="button"
                onClick={handleExportPng}
                disabled={isExporting !== null}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[#0D5C46] bg-[#FFFFFF] border border-[#059669]/50 hover:border-[#059669] hover:bg-[#059669]/10 rounded-xs transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                title="Unduh gambar resolusi tinggi (HD PNG) hasil Inspect Emiten — Nostradamus Quant Terminal"
              >
                <ImageDown className="w-3 h-3 shrink-0" />
                <span>
                  {isExporting === 'PNG' ? 'Cetak PNG...' : 'Export PNG'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExporting !== null}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[#D97706] bb-amber bg-[#FFFFFF] border border-[#D97706]/50 hover:border-[#F59E0B] hover:bg-[#D97706]/10 rounded-xs transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                title="Unduh dokumen PDF hasil Inspect Emiten — Nostradamus Quant Terminal"
              >
                <FileDown className="w-3 h-3 shrink-0" />
                <span>{isExporting === 'PDF' ? 'Cetak PDF...' : 'Export PDF'}</span>
              </button>
            </div>
          </div>

          {/* Dark Mode Terminal Calibration Modal (Fundamental USER_OVERRIDE + Corporate Action + Live Preview) */}
          {showCatalystCalibrator && (
            <form
              onSubmit={handleSaveCatalystOverride}
              className="mt-3 p-4 bg-[#0D131C] border border-[#222C3C] rounded-xs text-slate-200 space-y-3 font-mono tabular-nums shadow-xl"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1E2736]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-400">
                      FUNDAMENTAL &amp; CORPORATE ACTION CALIBRATOR ({activeStock.ticker})
                    </span>
                    <span className="px-2 py-0.5 text-[9.5px] font-bold bg-indigo-950/90 text-indigo-300 border border-indigo-500/40 rounded-xs">
                      TAG: USER_OVERRIDE · SATUAN MILIAR RP (× 10⁹ IDR)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                    Override laporan keuangan TTM &amp; kurva SBN di bawah ini akan menggantikan data{' '}
                    <code className="text-rose-300 font-mono">HARDCODED_SEED</code> dengan tag{' '}
                    <code className="text-indigo-300 font-mono">USER_OVERRIDE</code> (status{' '}
                    <code className="text-emerald-300 font-mono">FRESH</code>) dan mencabut batas Grade C.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleTryLiveYahooFundamentals}
                    disabled={isFetchingLiveFundamentals}
                    className="px-2.5 py-1 text-[10.5px] font-mono font-bold text-sky-300 bg-sky-950/70 hover:bg-sky-900/80 border border-sky-500/40 rounded-xs cursor-pointer disabled:opacity-50"
                  >
                    {isFetchingLiveFundamentals ? 'Menarik Yahoo API...' : 'Tarik Live Yahoo API'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetCatalystOverride}
                    className="px-2.5 py-1 text-[10.5px] font-mono font-semibold text-rose-300 hover:bg-rose-950/80 bg-[#131B28] border border-rose-500/40 rounded-xs cursor-pointer"
                  >
                    Reset Override
                  </button>
                </div>
              </div>

              {(() => {
                const lf = joeliardiEval.dataLineage?.fields;
                const corpOv = getCustomCorporateActionOverrides()[activeStock.ticker];
                const fundOv = getFundamentalUserOverride(activeStock.ticker);

                const revBadge = resolveCalibratorFieldProvenanceBadge(
                  lf?.revenueTTMIdr,
                  Boolean(fundOv?.revenueTTMIdr)
                );
                const ebitBadge = resolveCalibratorFieldProvenanceBadge(
                  lf?.operatingProfitTTMIdr,
                  Boolean(fundOv?.operatingProfitTTMIdr)
                );
                const niBadge = resolveCalibratorFieldProvenanceBadge(
                  lf?.netIncomeTTMIdr,
                  Boolean(fundOv?.netIncomeTTMIdr)
                );
                const eqBadge = resolveCalibratorFieldProvenanceBadge(
                  lf?.equityAttributableIdr,
                  Boolean(fundOv?.equityAttributableIdr)
                );
                const ocfBadge = resolveCalibratorFieldProvenanceBadge(
                  lf?.ocfTTMIdr,
                  Boolean(fundOv?.ocfTTMIdr)
                );
                const daBadge = resolveCalibratorFieldProvenanceBadge(
                  lf?.daTTMIdr,
                  Boolean(fundOv?.daTTMIdr)
                );
                const adtvBadge = resolveCalibratorFieldProvenanceBadge(
                  lf?.adtv20dIdr,
                  Boolean(fundOv?.adtv20dIdr)
                );
                const sbnBadge = resolveCalibratorFieldProvenanceBadge(
                  lf?.sbnSpot10YPct,
                  Boolean(fundOv?.sbn10YOverridePct)
                );
                const sharesBadge = resolveCalibratorFieldProvenanceBadge(
                  lf?.sharesOutstanding,
                  Boolean(fundOv?.sharesOutstanding || corpOv?.sharesOutstanding)
                );
                const mcapBadge = resolveCalibratorFieldProvenanceBadge(
                  lf?.marketCapIdr,
                  Boolean(corpOv?.liveMarketCapTrillionIdr)
                );
                const splitBadge = corpOv?.splitRatioDivisor
                  ? {
                      label: 'USER OVERRIDE',
                      className: 'bg-indigo-950/90 text-indigo-300 border-indigo-500/50',
                      tooltip: 'Rasio stock split dikalibrasi manual'
                    }
                  : {
                      label: 'OFFICIAL BEI',
                      className: 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50',
                      tooltip: 'Rasio stock split dari registri aksi korporasi BEI'
                    };
                const buybackBadge =
                  corpOv?.buybackNominalBillionIdr !== undefined
                    ? {
                        label: 'USER OVERRIDE',
                        className: 'bg-indigo-950/90 text-indigo-300 border-indigo-500/50',
                        tooltip: 'Nominal buyback aktif dikalibrasi manual'
                      }
                    : {
                        label: 'OFFICIAL BEI',
                        className: 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50',
                        tooltip: 'Mandat buyback aktif dari keterbukaan informasi BEI'
                      };
                const yoyBadge =
                  corpOv?.earningsGrowthYoYPct !== undefined
                    ? {
                        label: 'USER OVERRIDE',
                        className: 'bg-indigo-950/90 text-indigo-300 border-indigo-500/50',
                        tooltip: 'Pertumbuhan laba YoY dikalibrasi manual'
                      }
                    : lf?.netIncomeTTMIdr && lf.netIncomeTTMIdr.source !== 'HARDCODED_SEED'
                    ? {
                        label:
                          lf.netIncomeTTMIdr.source === 'LIVE_YAHOO_API'
                            ? 'LIVE REALTIME'
                            : 'SYNCED JSON',
                        className:
                          lf.netIncomeTTMIdr.source === 'LIVE_YAHOO_API'
                            ? 'bg-sky-950/90 text-sky-300 border-sky-500/50'
                            : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50',
                        tooltip: 'Pertumbuhan laba YoY dihitung dari laporan keuangan aktual'
                      }
                    : {
                        label: 'HARDCODED SEED',
                        className: 'bg-rose-950/90 text-rose-300 border-rose-500/60',
                        tooltip: 'Estimasi pertumbuhan laba dari katalog seed statis'
                      };

                return (
                  <>
                    {/* Row 1: 7 Uniform Height Cards — Core TTM Statements, Cash Flow, D&A & Liquidity */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 items-stretch">
                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-[#1E293B] rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-slate-300">
                            Revenue TTM (Miliar Rp)
                          </label>
                          <span
                            title={revBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${revBadge.className}`}
                          >
                            {revBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={revenueBillionInput}
                          onChange={(e) => setRevenueBillionInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-[#2A364B] focus:border-emerald-400 rounded-xs text-slate-100"
                          title="Pendapatan TTM dalam Miliar Rupiah (otomatis dikonversi × 1e9 ke Rupiah penuh)"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-[#1E293B] rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-slate-300">
                            EBIT / Laba Usaha (Miliar Rp)
                          </label>
                          <span
                            title={ebitBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${ebitBadge.className}`}
                          >
                            {ebitBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          value={ebitBillionInput}
                          onChange={(e) => setEbitBillionInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-[#2A364B] focus:border-emerald-400 rounded-xs text-slate-100"
                          title="Operating Profit (EBIT) TTM dalam Miliar Rupiah (× 1e9 IDR)"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-emerald-500/30 rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-emerald-300">
                            Net Income TTM (Miliar Rp)
                          </label>
                          <span
                            title={niBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${niBadge.className}`}
                          >
                            {niBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          value={netIncomeBillionInput}
                          onChange={(e) => setNetIncomeBillionInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-emerald-500/50 focus:border-emerald-400 rounded-xs text-emerald-200 font-bold"
                          title="Laba Bersih TTM dalam Miliar Rupiah (menentukan EPS TTM & Implied PER)"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-emerald-500/30 rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-emerald-300">
                            Ekuitas Induk (Miliar Rp)
                          </label>
                          <span
                            title={eqBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${eqBadge.className}`}
                          >
                            {eqBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          value={equityBillionInput}
                          onChange={(e) => setEquityBillionInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-emerald-500/50 focus:border-emerald-400 rounded-xs text-emerald-200 font-bold"
                          title="Total Ekuitas yang Dapat Diatribusikan ke Pemilik Entitas Induk dalam Miliar Rupiah (menentukan BVPS, PBV & ROE)"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-[#1E293B] rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-slate-300">
                            OCF TTM (Miliar Rp)
                          </label>
                          <span
                            title={ocfBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${ocfBadge.className}`}
                          >
                            {ocfBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          value={ocfBillionInput}
                          onChange={(e) => setOcfBillionInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-[#2A364B] focus:border-emerald-400 rounded-xs text-slate-100"
                          title="Arus Kas Operasi (Operating Cash Flow) TTM dalam Miliar Rupiah (× 1e9 IDR)"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-[#1E293B] rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-slate-300">
                            D&amp;A TTM (Miliar Rp)
                          </label>
                          <span
                            title={daBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${daBadge.className}`}
                          >
                            {daBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={daBillionInput}
                          onChange={(e) => setDaBillionInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-[#2A364B] focus:border-emerald-400 rounded-xs text-slate-100"
                          title="Depresiasi & Amortisasi (D&A) TTM dalam Miliar Rupiah (× 1e9 IDR)"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-sky-500/30 rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-sky-300">
                            ADTV 20D (Miliar Rp/Hr)
                          </label>
                          <span
                            title={adtvBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${adtvBadge.className}`}
                          >
                            {adtvBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={adtvBillionInput}
                          onChange={(e) => setAdtvBillionInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-sky-500/40 focus:border-sky-400 rounded-xs text-sky-200"
                          title="Rata-rata Nilai Transaksi Harian 20 Hari (Average Daily Trading Value) dalam Miliar Rupiah"
                        />
                      </div>
                    </div>

                    {/* Row 2: 7 Uniform Height Cards — SBN 10Y, Shares, Market Cap, Split, Buyback, Growth & Submit */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 pt-1 items-stretch">
                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-amber-500/30 rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-amber-300">
                            SBN 10Y Spot (%)
                          </label>
                          <span
                            title={sbnBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${sbnBadge.className}`}
                          >
                            {sbnBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="3.0"
                          max="15.0"
                          value={sbn10YInput}
                          onChange={(e) => setSbn10YInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-amber-500/40 focus:border-amber-400 rounded-xs text-amber-200 font-bold"
                          title="Yield Acuan SBN 10 Tahun Indonesia (%) untuk menghitung Blended Spot Rf & Dynamic Cost of Equity (Ke)"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-[#1E293B] rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-slate-300">
                            Saham Beredar BEI (Juta Lbr)
                          </label>
                          <span
                            title={sharesBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${sharesBadge.className}`}
                          >
                            {sharesBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          value={sharesMillionInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSharesMillionInput(val);
                            const numMillion = Number(val.replace(',', '.'));
                            if (Number.isFinite(numMillion) && numMillion > 0) {
                              const syncedTrillion =
                                (numMillion * 1_000_000 * activeStock.lastPrice) / 1_000_000_000_000;
                              setMarketCapTrillionInput(syncedTrillion.toFixed(2));
                            }
                          }}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-[#2A364B] rounded-xs text-slate-100"
                          title="Jumlah saham tercatat resmi BEI dalam Juta Lembar (× 1e6 lembar)"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-[#1E293B] rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-slate-300">
                            Market Cap Live (Rp Triliun)
                          </label>
                          <span
                            title={mcapBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${mcapBadge.className}`}
                          >
                            {mcapBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.05"
                          value={marketCapTrillionInput}
                          onChange={(e) => setMarketCapTrillionInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-[#2A364B] rounded-xs text-slate-100"
                          title="Kapitalisasi pasar dalam Rp Triliun (P0 Sanity Check lolos bila Δ Implied Shares ≤ 3,0%)"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-[#1E293B] rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-slate-300">
                            Rasio Stock Split (1 : N)
                          </label>
                          <span
                            title={splitBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${splitBadge.className}`}
                          >
                            {splitBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          max="20"
                          value={splitRatioInput}
                          onChange={(e) => setSplitRatioInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-[#2A364B] rounded-xs text-slate-100"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-[#1E293B] rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-slate-300">
                            Buyback Aktif (Miliar Rp)
                          </label>
                          <span
                            title={buybackBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${buybackBadge.className}`}
                          >
                            {buybackBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="10"
                          min="0"
                          value={buybackNominalInput}
                          onChange={(e) => setBuybackNominalInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-[#2A364B] rounded-xs text-slate-100"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-[#1E293B] rounded-xs">
                        <div className="flex items-start justify-between gap-1.5 min-h-[28px] mb-1.5">
                          <label className="text-[9px] font-bold uppercase leading-tight text-slate-300">
                            Lonjakan Laba YoY (%)
                          </label>
                          <span
                            title={yoyBadge.tooltip}
                            className={`px-1.5 py-0.5 text-[7.5px] font-mono font-extrabold uppercase tracking-tight rounded-xs border shrink-0 ${yoyBadge.className}`}
                          >
                            {yoyBadge.label}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.5"
                          value={quarterlyGrowthInput}
                          onChange={(e) => setQuarterlyGrowthInput(e.target.value)}
                          className="mt-auto w-full h-8 px-2.5 text-xs font-mono bg-[#131B28] border border-[#2A364B] rounded-xs text-slate-100"
                        />
                      </div>

                      <div className="flex flex-col justify-between h-full p-2 bg-[#101723] border border-emerald-500/40 rounded-xs gap-1.5">
                        <button
                          type="button"
                          onClick={handleAutoSyncP0Sanity}
                          className="w-full px-2 py-1 text-[9.5px] font-mono font-bold text-sky-300 bg-sky-950/70 hover:bg-sky-900/90 border border-sky-500/40 rounded-xs cursor-pointer transition-colors leading-tight"
                          title="Rekonsiliasi P0 1-Klik: Normalisasi skala USD→IDR (bila terdeteksi) & samakan Market Cap = Shares × Harga Live agar Δ = 0,00% (SANITY: PASS)"
                        >
                          Auto-Sync P0 (Reconcile)
                        </button>
                        <button
                          type="submit"
                          className="mt-auto w-full h-8 px-2.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xs cursor-pointer transition-colors"
                        >
                          Simpan USER_OVERRIDE
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Real-Time Live Preview Bar inside Calibration Modal */}
              {liveCalibrationPreview && (
                <div className="p-2.5 bg-[#090C10] border border-[#1E2736] rounded-xs flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    ⚡ LIVE PREVIEW SEBELUM SIMPAN (@ Px Rp{' '}
                    {formatIdrPriceDisplay(activeStock.lastPrice)}):
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      EPS TTM:{' '}
                      <strong className="text-slate-100">
                        Rp {liveCalibrationPreview.epsIdr.toLocaleString('id-ID')}
                      </strong>
                    </span>
                    <span>
                      BVPS:{' '}
                      <strong className="text-slate-100">
                        Rp {liveCalibrationPreview.bvpsIdr.toLocaleString('id-ID')}
                      </strong>
                    </span>
                    <span>
                      Implied PER:{' '}
                      <strong className="text-emerald-400">
                        {liveCalibrationPreview.impliedPer.toFixed(2)}x
                      </strong>
                    </span>
                    <span>
                      Implied PBV:{' '}
                      <strong className="text-sky-400">
                        {liveCalibrationPreview.impliedPbv.toFixed(2)}x
                      </strong>
                    </span>
                    <span>
                      ROE TTM:{' '}
                      <strong className="text-emerald-400">
                        {liveCalibrationPreview.roePct.toFixed(2)}%
                      </strong>
                    </span>
                    <span>
                      Op Margin:{' '}
                      <strong className="text-slate-200">
                        {liveCalibrationPreview.opMarginPct.toFixed(1)}%
                      </strong>
                    </span>
                    <span>
                      Blended Rf:{' '}
                      <strong className="text-amber-300">
                        {liveCalibrationPreview.blendedRf.toFixed(2)}%
                      </strong>{' '}
                      → Dynamic Ke:{' '}
                      <strong className="text-amber-400">
                        {liveCalibrationPreview.kePct.toFixed(2)}%
                      </strong>
                    </span>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Expandable Dark Mode Terminal Forensic Data Lineage & Freshness Debugger Drawer */}
          {showForensicLineageDrawer && joeliardiEval.dataLineage && (
            <div className="mt-3 p-4 bg-[#090C10] border border-[#222C3C] rounded-xs text-slate-200 space-y-3 font-mono tabular-nums shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#1E2736]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5" />
                      <span>
                        FORENSIC DATA LINEAGE &amp; FRESHNESS DEBUGGER ({activeStock.ticker}.JK)
                      </span>
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[9.5px] font-bold rounded-xs border ${
                        joeliardiEval.dataLineage.overallStatus === 'INSTITUTIONAL_GRADE'
                          ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
                          : joeliardiEval.dataLineage.overallStatus === 'SEED_CAPPED_GRADE_C'
                          ? 'bg-rose-950/90 text-rose-300 border-rose-500/60'
                          : 'bg-amber-950/90 text-amber-300 border-amber-500/50'
                      }`}
                    >
                      STATUS: {joeliardiEval.dataLineage.overallStatus}
                    </span>
                    <span className="px-2 py-0.5 text-[9.5px] font-bold bg-[#131B28] text-slate-300 border border-[#2A364B] rounded-xs">
                      FRESH: {joeliardiEval.dataLineage.freshFieldCount} · STALE:{' '}
                      {joeliardiEval.dataLineage.staleFieldCount} · SEED_WARN:{' '}
                      {joeliardiEval.dataLineage.seedFieldCount}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-sans">
                    {joeliardiEval.dataLineage.seedCapReason ||
                      'Seluruh variabel kunci diaudit dengan metadata sumber (DataSourceType) dan tanggal (asOfDate).'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleTriggerGitHubActionsFundamentalsSync}
                    disabled={isTriggeringGhActionsSync}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[10.5px] font-bold text-indigo-200 bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-400/50 rounded-xs cursor-pointer disabled:opacity-50"
                    title="Trigger workflow_dispatch update-fundamentals.yml di GitHub Actions (Server-Side Fundamentals + ADTV 20D + SBN 1Y/5Y/10Y)"
                  >
                    <Zap
                      className={`w-3 h-3 text-amber-400 ${
                        isTriggeringGhActionsSync ? 'animate-pulse' : ''
                      }`}
                    />
                    <span>⚡ Run GitHub Actions Sync</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTryLiveYahooFundamentals}
                    disabled={isFetchingLiveFundamentals}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[10.5px] font-bold text-sky-300 bg-sky-950/80 hover:bg-sky-900 border border-sky-500/40 rounded-xs cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isFetchingLiveFundamentals ? 'animate-spin' : ''}`}
                    />
                    <span>Pull Live Yahoo API</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCacheAndHardResync}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[10.5px] font-bold text-amber-300 bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 rounded-xs cursor-pointer"
                    title="Bersihkan seluruh cache lokal & override, lalu tarik ulang snapshot + live quote"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear Cache &amp; Hard Resync</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyDebugJson}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[10.5px] font-bold text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 rounded-xs cursor-pointer"
                    title="Salin JSON lengkap DataLineage, RawTickerData, dan SanityReport ke Clipboard"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy Debug JSON</span>
                  </button>
                </div>
              </div>

              {/* On-Demand Cloudflare Worker Realtime Proxy Configuration & Connection Tester */}
              <div className="p-2.5 bg-[#101723] border border-sky-500/40 rounded-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-sky-950 text-sky-300 border border-sky-500/50 rounded-xs">
                      ON-DEMAND REAL-TIME RELAY (1–2 DTK)
                    </span>
                    <span className="text-[10.5px] font-bold text-slate-200">
                      Realtime Proxy Worker URL (Cloudflare Worker · Anti-401/CORS)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-sans">
                    Deploy <code>workers/nostradamus-yahoo-worker.js</code> &amp; tempel URL Worker di bawah:
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="url"
                    value={realtimeWorkerUrlInput}
                    onChange={(e) => setRealtimeWorkerUrlInput(e.target.value)}
                    placeholder="https://nostradamus-yahoo-proxy.<subdomain>.workers.dev"
                    className="flex-1 h-8 px-2.5 text-xs font-mono bg-[#090C10] border border-[#2A364B] focus:border-sky-400 rounded-xs text-slate-100"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleSaveRealtimeWorkerUrl}
                      className="h-8 px-3 text-[10.5px] font-mono font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xs cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Simpan &amp; Sync {activeStock.ticker}
                    </button>
                    <button
                      type="button"
                      onClick={handleTestRealtimeWorkerConnection}
                      disabled={isTestingWorkerConn}
                      className="h-8 px-3 text-[10.5px] font-mono font-bold text-emerald-300 bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/50 rounded-xs cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                      title="Ping ?ticker=BBCA&nocache=1 untuk menguji status HTTP & latensi round-trip Cloudflare Worker"
                    >
                      {isTestingWorkerConn ? 'Menguji...' : 'Tes Koneksi'}
                    </button>
                  </div>
                </div>
                {workerConnTestResult && (
                  <div
                    className={`px-2.5 py-1.5 rounded-xs border text-[10.5px] font-mono flex items-center justify-between gap-2 ${
                      workerConnTestResult.ok
                        ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                        : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                    }`}
                  >
                    <span>{workerConnTestResult.message}</span>
                    <span className="font-bold shrink-0">
                      HTTP {workerConnTestResult.httpStatus ?? '-'} · {workerConnTestResult.latencyMs} ms
                    </span>
                  </div>
                )}
              </div>

              {/* Flow Statement Sync Audit & Period Alignment Telemetry Strip (flowAudit & AUDITED_FY) */}
              {(joeliardiEval.dataLineage.flowAudit ||
                joeliardiEval.dataLineage.ttmMethod ||
                joeliardiEval.dataLineage.daMethodNote) && (
                <div className="p-2.5 bg-[#0D131D] border border-[#1E293B] rounded-xs flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">
                      FLOW STATEMENT AUDIT:
                    </span>
                    <span className="px-2 py-0.5 font-bold rounded-xs bg-sky-950/90 text-sky-300 border border-sky-500/50">
                      METHOD:{' '}
                      {joeliardiEval.dataLineage.flowAudit?.unifiedMethod ||
                        joeliardiEval.dataLineage.ttmMethod ||
                        'TTM_4Q_STANDALONE'}
                    </span>
                    {joeliardiEval.dataLineage.flowAudit && (
                      <span
                        className={`px-2 py-0.5 font-bold rounded-xs border ${
                          joeliardiEval.dataLineage.flowAudit.periodAligned
                            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
                            : 'bg-amber-950/90 text-amber-300 border-amber-500/50'
                        }`}
                      >
                        {joeliardiEval.dataLineage.flowAudit.periodAligned
                          ? 'PERIOD ALIGNED ✓'
                          : 'PERIOD MIXED'}
                      </span>
                    )}
                    {joeliardiEval.dataLineage.daMethodNote && (
                      <span className="px-2 py-0.5 font-bold rounded-xs bg-[#131B28] text-slate-300 border border-[#2A364B]">
                        D&amp;A: {joeliardiEval.dataLineage.daMethodNote}
                      </span>
                    )}
                    {(joeliardiEval.dataLineage.ttmMethod === 'FY_FALLBACK' ||
                      joeliardiEval.dataLineage.flowAudit?.unifiedMethod === 'FY_FALLBACK') && (
                      <span
                        className="px-2 py-0.5 font-bold rounded-xs bg-indigo-950/90 text-indigo-300 border border-indigo-500/50"
                        title="Cross-Statement Sanity Lock memilih laporan tahunan auditan terakhir (FY_FALLBACK) demi menjaga konsistensi periode (NI <= EBIT). Tetap berstatus FRESH tanpa penalti Grade C."
                      >
                        AUDITED_FY · Basis FY Auditan Terakhir — Period Aligned
                      </span>
                    )}
                  </div>
                  {(joeliardiEval.dataLineage.ttmMethod === 'FY_FALLBACK' ||
                    joeliardiEval.dataLineage.flowAudit?.unifiedMethod === 'FY_FALLBACK') && (
                    <button
                      type="button"
                      onClick={() => setActiveToolPanel('CALIBRATION')}
                      className="px-2 py-0.5 text-[9.5px] font-mono font-bold bg-indigo-950/90 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/50 rounded-xs cursor-pointer whitespace-nowrap shrink-0"
                      title="Opsional: Buka panel Kalibrasi Manual jika Anda ingin memasukkan angka kuartal berjalan secara manual"
                    >
                      Perbaiki →
                    </button>
                  )}
                </div>
              )}

              {/* SBN Macro Benchmark Freshness Alert inside Drawer */}
              {(joeliardiEval.dataLineage.isSbnMacroProxy ||
                joeliardiEval.dataLineage.isSbnMacroStale) && (
                <div className="p-2.5 bg-amber-950/50 border border-amber-500/40 rounded-xs text-[11px] text-amber-200 flex items-center justify-between gap-2">
                  <span>{joeliardiEval.dataLineage.sbnMacroWarningMessage}</span>
                  <button
                    type="button"
                    onClick={() => setActiveToolPanel('CALIBRATION')}
                    className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 rounded-xs text-amber-200 shrink-0 cursor-pointer"
                  >
                    Override SBN 10Y Manual
                  </button>
                </div>
              )}

              {/* 20-Field TrackedField<T> Forensic Audit Table */}
              <div className="overflow-x-auto max-h-64 border border-[#1E2736] rounded-xs">
                <table className="w-full text-left border-collapse text-[10.5px]">
                  <thead className="bg-[#131B28] text-slate-300 sticky top-0 z-10 border-b border-[#222C3C]">
                    <tr>
                      <th className="py-1.5 px-2.5 font-bold uppercase">Variabel (TrackedField)</th>
                      <th className="py-1.5 px-2.5 font-bold uppercase text-right">Nilai Aktif</th>
                      <th className="py-1.5 px-2.5 font-bold uppercase">Source Tag</th>
                      <th className="py-1.5 px-2.5 font-bold uppercase">Freshness</th>
                      <th className="py-1.5 px-2.5 font-bold uppercase">As-Of / Periode</th>
                      <th className="py-1.5 px-2.5 font-bold uppercase">Catatan Forensik</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#17202E]">
                    {(
                      Object.entries(joeliardiEval.dataLineage.fields) as [
                        string,
                        TrackedField<number>
                      ][]
                    ).map(([fieldKey, tf]) => {
                      const isBigIdr =
                        Math.abs(tf.value) >= 1_000_000_000 &&
                        !fieldKey.toLowerCase().includes('shares');
                      const formattedVal = isBigIdr
                        ? `Rp ${(tf.value / 1_000_000_000).toLocaleString('id-ID', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })} M`
                        : fieldKey.toLowerCase().includes('shares')
                        ? `${(tf.value / 1_000_000).toLocaleString('id-ID', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })} Jt lbr`
                        : fieldKey.toLowerCase().includes('pct') ||
                          fieldKey.toLowerCase().includes('roe')
                        ? `${tf.value.toFixed(2)}%`
                        : tf.value.toLocaleString('id-ID', {
                            maximumFractionDigits: 2
                          });

                      const srcCls: Record<DataSourceType, string> = {
                        LIVE_YAHOO_API:
                          'bg-emerald-950/90 text-emerald-300 border-emerald-500/50',
                        SNAPSHOT_JSON: 'bg-sky-950/90 text-sky-300 border-sky-500/50',
                        FUNDAMENTALS_JSON:
                          'bg-teal-950/90 text-teal-300 border-teal-500/50',
                        USER_OVERRIDE:
                          'bg-indigo-950/90 text-indigo-300 border-indigo-500/50',
                        PROXY_FORMULA:
                          'bg-amber-950/90 text-amber-300 border-amber-500/50',
                        HARDCODED_SEED:
                          'bg-rose-950/90 text-rose-300 border-rose-500/60'
                      };

                      const statusCls: Record<FieldFreshnessStatus, string> = {
                        FRESH: 'text-emerald-400',
                        STALE: 'text-amber-400',
                        ANOMALY: 'text-amber-300 font-bold',
                        SEED_WARN: 'text-rose-400 font-bold',
                        ERROR: 'text-rose-500 font-bold'
                      };

                      const isAuditedFyRow = Boolean(tf.note?.includes('AUDITED_FY'));

                      return (
                        <tr key={fieldKey} className="hover:bg-[#131B28]/70">
                          <td className="py-1.5 px-2.5 font-semibold text-slate-200">
                            {fieldKey}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-bold text-slate-100">
                            {formattedVal}
                          </td>
                          <td className="py-1.5 px-2.5">
                            <span
                              className={`px-1.5 py-0.5 text-[9px] font-bold rounded-xs border ${
                                srcCls[tf.source]
                              }`}
                            >
                              {tf.source}
                            </span>
                          </td>
                          <td className={`py-1.5 px-2.5 font-bold ${statusCls[tf.status]}`}>
                            <div className="flex items-center gap-1">
                              <span>{tf.status}</span>
                              {isAuditedFyRow && (
                                <span className="px-1 py-0.2 text-[8px] font-mono font-bold bg-indigo-950/90 text-indigo-300 border border-indigo-500/50 rounded-2xs">
                                  AUDITED_FY
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 px-2.5 text-slate-400">
                            {tf.asOfDate || 'N/A'}
                            {tf.fiscalPeriod ? ` (${tf.fiscalPeriod})` : ''}
                          </td>
                          <td className="py-1.5 px-2.5 text-slate-400 font-sans text-[10px]">
                            <div className="flex items-center justify-between gap-2">
                              <span>{tf.note || '-'}</span>
                              {(tf.status === 'SEED_WARN' ||
                                tf.status === 'ANOMALY' ||
                                isAuditedFyRow) && (
                                <button
                                  type="button"
                                  onClick={() => setActiveToolPanel('CALIBRATION')}
                                  className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-indigo-950/90 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/50 rounded-xs cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  Perbaiki →
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Network Sync Diagnostics Log & DevTools Console Hint */}
              <div className="space-y-1.5 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                  <span className="font-bold uppercase text-slate-300">
                    LOG DIAGNOSTIK JARINGAN &amp; CORS RELAY (
                    {joeliardiEval.dataLineage.syncDiagnostics.length} Entri Terakhir)
                  </span>
                  <span className="inline-flex items-center gap-1 text-sky-300 bg-[#131B28] px-2 py-0.5 rounded-xs border border-[#222C3C]">
                    <Terminal className="w-3 h-3" />
                    <span>
                      DevTools Console: <code>window.debugNostradamus(&apos;{activeStock.ticker}&apos;)</code>
                    </span>
                  </span>
                </div>

                {joeliardiEval.dataLineage.syncDiagnostics.length > 0 && (
                  <div className="overflow-x-auto max-h-36 border border-[#1E2736] rounded-xs">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead className="bg-[#131B28] text-slate-400 border-b border-[#222C3C]">
                        <tr>
                          <th className="py-1 px-2">Waktu</th>
                          <th className="py-1 px-2">Endpoint</th>
                          <th className="py-1 px-2">Relay</th>
                          <th className="py-1 px-2">HTTP</th>
                          <th className="py-1 px-2 text-right">Ukuran</th>
                          <th className="py-1 px-2">Status</th>
                          <th className="py-1 px-2">Pesan Diagnostik</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#17202E]">
                        {joeliardiEval.dataLineage.syncDiagnostics.slice(0, 8).map((diag) => (
                          <tr key={diag.id} className="hover:bg-[#131B28]/60">
                            <td className="py-1 px-2 text-slate-400">
                              {diag.timestamp.slice(11, 19)}
                            </td>
                            <td className="py-1 px-2 text-slate-300">{diag.endpoint}</td>
                            <td className="py-1 px-2 text-slate-400">{diag.proxyUsed}</td>
                            <td className="py-1 px-2 text-slate-300">
                              {diag.httpStatus ?? '-'}
                            </td>
                            <td className="py-1 px-2 text-right text-slate-300">
                              {diag.payloadBytes
                                ? `${(diag.payloadBytes / 1024).toFixed(1)} kB`
                                : '-'}
                            </td>
                            <td
                              className={`py-1 px-2 font-bold ${
                                diag.status === 'OK'
                                  ? 'text-emerald-400'
                                  : diag.status === 'FALLBACK_USED'
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {diag.status}
                            </td>
                            <td className="py-1 px-2 text-slate-400 font-sans">
                              {diag.errorMessage || 'OK'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Content Body with Theme-Aware Dark Scrollbar */}
        <div className="p-5 sm:p-6 overflow-y-auto table-scroll-container space-y-6">
          {/* On-Demand Single-Ticker Action Banner when Fundamentals are Missing from Cache/Snapshot */}
          {joeliardiEval.dataLineage?.convictionCappedByLineage && (
            <div className="p-3.5 rounded-xs bg-[#0D131C] border border-amber-500/60 text-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 text-[9.5px] font-mono font-extrabold bg-rose-950 text-rose-300 border border-rose-500/50 rounded-xs">
                    TICKER_NOT_IN_SNAPSHOT · SEED_WARN
                  </span>
                  <span className="text-xs font-bold text-amber-300">
                    Data fundamental {activeStock.ticker} belum tersedia di cache snapshot.
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {ghActionsPollingStep
                    ? `⚡ ${ghActionsPollingStep}`
                    : `Pasang Cloudflare Worker URL (sinkronisasi real-time 1–2 detik untuk seluruh emiten BEI) atau tarik laporan keuangan ${activeStock.ticker} secara on-demand via GitHub Actions.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveToolPanel('FORENSIC_LINEAGE')}
                  className="px-2.5 py-1.5 text-[10.5px] font-mono font-bold text-sky-300 bg-sky-950/90 hover:bg-sky-900 border border-sky-500/50 rounded-xs cursor-pointer whitespace-nowrap shrink-0"
                >
                  ⚙ Pasang Cloudflare Worker URL (1–2 dtk)
                </button>
                <button
                  type="button"
                  onClick={handleTriggerGitHubActionsFundamentalsSync}
                  disabled={isTriggeringGhActionsSync}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10.5px] font-mono font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xs cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Zap
                    className={`w-3.5 h-3.5 ${isTriggeringGhActionsSync ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {isTriggeringGhActionsSync
                      ? ghActionsPollingStep || `Menarik ${activeStock.ticker}...`
                      : `⚡ Tarik Data Real-Time ${activeStock.ticker} Sekarang`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* HSC Warning Banner: Supports Official KSEI HSC (Dividend Penalty vs Hard Block) & Quant Early Warning Suspect */}
          {(activeStock.isHscFlagged || activeStock.hscSource === 'KSEI_OFFICIAL') && (
            <div
              className={`p-3.5 rounded-xs flex items-start gap-3 border ${
                activeStock.hscTier === 'KSEI_DIVIDEND_PENALTY'
                  ? 'bg-[#F59E0B]/10 border-[#F59E0B]/50'
                  : 'bg-[#E11D48]/10 border-[#E11D48]/40'
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  activeStock.hscTier === 'KSEI_DIVIDEND_PENALTY'
                    ? 'text-[#D97706]'
                    : 'text-[#9E2A2B]'
                }`}
              />
              <div
                className={`text-xs space-y-1.5 flex-1 ${
                  activeStock.hscTier === 'KSEI_DIVIDEND_PENALTY'
                    ? 'text-[#92400E]'
                    : 'text-[#9E2A2B]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold uppercase tracking-wider">
                    {activeStock.hscSource === 'KSEI_OFFICIAL' &&
                    activeStock.hscTier === 'KSEI_DIVIDEND_PENALTY'
                      ? `DAFTAR RESMI HSC BEI–KSEI (TOP-10: ${activeStock.kseiHscConcentrationPct
                          ?.toFixed(3)
                          .replace('.', ',')}%) — DIVIDEN KUAT LOLOS BLOKIR (PENALTI SKOR -${(
                          activeStock.kseiHscScorePenaltyPts ?? 0.45
                        )
                          .toFixed(2)
                          .replace('.', ',')} POIN)`
                      : activeStock.hscSource === 'KSEI_OFFICIAL'
                      ? `DAFTAR RESMI HSC BEI–KSEI (TOP-10: ${activeStock.kseiHscConcentrationPct
                          ?.toFixed(3)
                          .replace('.', ',')}%) — DIBLOKIR DARI TOP DECILE BUY`
                      : activeStock.hscTier === 'EARLY_WARNING_SUSPECT'
                      ? 'RADAR EARLY WARNING QUANT: SUSPECT HSC (PRA-RILIS BEI) — DIBLOKIR DARI TOP DECILE BUY'
                      : 'PERINGATAN SAHAM HSC (MANUAL OVERRIDE) — DIBLOKIR DARI TOP DECILE BUY'}
                  </div>

                  {activeStock.hscSource === 'KSEI_OFFICIAL' &&
                    activeStock.kseiHscConcentrationPct && (
                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px]">
                        <span className="px-2 py-0.5 rounded-xs font-bold bg-[#FFFFFF] border border-current">
                          Top-10 KSEI: {activeStock.kseiHscConcentrationPct.toFixed(3).replace('.', ',')}%
                        </span>
                        <span className="px-2 py-0.5 rounded-xs font-bold bg-[#FFFFFF] border border-current">
                          Free Float Publik Maks: ≤
                          {Math.max(0.01, 100 - activeStock.kseiHscConcentrationPct)
                            .toFixed(3)
                            .replace('.', ',')}%
                        </span>
                        <span className="px-2 py-0.5 rounded-xs font-bold bg-[#FFFFFF] border border-current">
                          Status: {activeStock.kseiHscIsNew ? 'BARU (11 Nov 2026)' : 'Eksisting'}
                        </span>
                      </div>
                    )}
                </div>

                <p className="leading-relaxed text-justify">
                  {activeStock.hscReason ||
                    'Saham ini tercatat dalam radar konsentrasi kepemilikan tinggi.'}
                </p>

                {activeStock.kseiHscFootnote && activeStock.kseiHscFootnote !== 'NONE' && (
                  <div className="px-2.5 py-1.5 rounded-xs bg-[#FFFFFF]/80 border border-current/30 font-mono text-[11px] font-semibold">
                    Catatan Khusus Pengumuman BEI–KSEI:{' '}
                    {formatKseiFootnoteFullDescription(activeStock.kseiHscFootnote)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Active Catalyst & Corporate Action Middleware Telemetry Banner */}
          {joeliardiEval.isCatalystActive &&
            joeliardiEval.sanityReport?.isDualCatalystConfirmed !== false && (
            <div className="p-3.5 rounded-xs bg-[#059669]/10 border border-[#059669]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-mono font-extrabold bg-[#0D5C46] text-white rounded-xs">
                    {joeliardiEval.catalystBadgeLabel || 'CATALYST ACTIVE'}
                  </span>
                  <span className="text-xs font-bold text-[#0D5C46]">
                    Basis TTM_DEFAULT Terdekumulasi &amp; Dual-Confirmation Catalyst Aktif
                  </span>
                </div>
                <p className="text-xs text-[#111315] leading-relaxed">
                  {joeliardiEval.catalystNarrative}
                </p>
              </div>
              <div className="shrink-0 font-mono text-[11px] bg-[#FFFFFF] border border-[#059669]/35 px-3 py-2 rounded-xs space-y-0.5">
                <div>
                  ROE TTM:{' '}
                  <strong className="text-[#0D5C46]">
                    {(
                      joeliardiEval.valuationLedger?.roeTTM ??
                      joeliardiEval.trailingRoePct ??
                      activeStock.roe
                    ).toFixed(1)}
                    %
                  </strong>{' '}
                  · NI YoY:{' '}
                  <strong>
                    {(joeliardiEval.valuationLedger?.netIncomeYoYPct ??
                      activeStock.earningsGrowthYoYPct ??
                      0) >= 0
                      ? '+'
                      : ''}
                    {(
                      joeliardiEval.valuationLedger?.netIncomeYoYPct ??
                      activeStock.earningsGrowthYoYPct ??
                      0
                    ).toFixed(1)}
                    %
                  </strong>
                </div>
                <div>
                  Buyback Yield: <strong>+{(joeliardiEval.dynamicBuybackYieldPct ?? 0).toFixed(2)}%</strong> · TSY:{' '}
                  <strong className="text-[#0284C7]">
                    {(joeliardiEval.totalShareholderYieldPct ?? joeliardiEval.forwardDividendYieldPct).toFixed(2)}%
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Concise 1-Line IDX-IC Sector Methodology Notice Strip */}
          {joeliardiEval.sectorMethodologyNotice && (
            <div className="px-3 py-2 bg-[#0D131C] border border-[#222C3C] rounded-xs flex items-center justify-between gap-2 text-[11px] text-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="px-2 py-0.5 text-[9.5px] font-mono font-bold uppercase tracking-wider bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 rounded-xs shrink-0">
                  {joeliardiEval.sectorMethodologyProfile?.regimeBadgeLabel ||
                    `IDX-IC: ${activeStock.sector}`}
                </span>
                <span
                  className="text-[11px] text-slate-200 truncate font-sans"
                  title={joeliardiEval.sectorMethodologyNotice}
                >
                  {joeliardiEval.sectorMethodologyNotice}
                </span>
              </div>
              {joeliardiEval.sectorMethodologyProfile?.isCyclePeakWarning && (
                <span className="px-2 py-0.5 text-[9.5px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-500/50 rounded-xs shrink-0">
                  ⚠ CYCLE PEAK ROE GUARD
                </span>
              )}
            </div>
          )}

          {/* Top Valuation & Intrinsic Value Bar: 3-Box Horizontal Alignment with Fixed 1-Line Title Row & tabular-nums */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-stretch">
            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col justify-between h-full tabular-nums">
              <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500 whitespace-nowrap overflow-hidden">
                <div className="truncate">
                  <MetricTooltip
                    label="HARGA PASAR LIVE (BEI)"
                    title="Kuotasi Harga Pasar Reguler BEI (.JK)"
                    laymanExplanation="Harga transaksi terakhir saham di pasar reguler Bursa Efek Indonesia beserta acuan harga penutupan sesi sebelumnya (Previous Close), persentase perubahan harian (1D), bulanan (30D), dan sepanjang tahun berjalan (YTD)."
                    practicalGuide="Bandingkan harga pasar ini terhadap Nilai Intrinsik Wajar di sebelahnya untuk melihat apakah saham sedang terdiskon atau sudah mahal."
                  />
                </div>
                {joeliardiEval.dataLineage && (
                  <span
                    className={`px-1.5 py-0.2 text-[8.5px] font-mono font-bold rounded-xs border shrink-0 ${
                      joeliardiEval.dataLineage.fields.lastPrice.source === 'LIVE_YAHOO_API'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                        : 'bg-sky-950 text-sky-300 border-sky-500/50'
                    }`}
                    title={`Price Source: ${joeliardiEval.dataLineage.fields.lastPrice.source} (${joeliardiEval.dataLineage.fields.lastPrice.asOfDate || 'N/A'})`}
                  >
                    {joeliardiEval.dataLineage.fields.lastPrice.source === 'LIVE_YAHOO_API'
                      ? 'LIVE_API'
                      : 'SNAPSHOT'}
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between gap-2 my-1">
                <div className="text-lg font-bold font-mono tabular-nums text-[#111315] whitespace-nowrap">
                  Rp {formatIdrPriceDisplay(activeStock.lastPrice)}
                </div>
                {typeof activeStock.previousClose === 'number' && activeStock.previousClose > 0 && (
                  <span className="text-[10.5px] font-mono tabular-nums text-neutral-500 whitespace-nowrap">
                    Prev: Rp {formatIdrPriceDisplay(activeStock.previousClose)}
                  </span>
                )}
              </div>
              {(() => {
                const ytdPct =
                  typeof activeStock.returnYTD === 'number'
                    ? activeStock.returnYTD
                    : Number((activeStock.return30D * 1.45).toFixed(1));
                return (
                  <div className="text-[10.5px] font-bold font-mono tabular-nums flex items-center gap-x-1 whitespace-nowrap overflow-hidden">
                    <span
                      className={
                        activeStock.change1D < 0 ? 'text-[#9E2A2B]' : 'text-[#0D5C46]'
                      }
                    >
                      1D: {activeStock.change1D >= 0 ? '+' : ''}
                      {activeStock.change1D.toFixed(2)}%
                    </span>
                    <span className="text-neutral-400">·</span>
                    <span
                      className={
                        activeStock.return30D < 0 ? 'text-[#9E2A2B]' : 'text-[#0D5C46]'
                      }
                    >
                      30D: {activeStock.return30D >= 0 ? '+' : ''}
                      {activeStock.return30D.toFixed(1)}%
                    </span>
                    <span className="text-neutral-400">·</span>
                    <span
                      className={
                        ytdPct < 0 ? 'text-[#9E2A2B]' : 'text-[#0D5C46]'
                      }
                    >
                      YTD: {ytdPct >= 0 ? '+' : ''}
                      {ytdPct.toFixed(1)}%
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col justify-between h-full tabular-nums">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bb-amber whitespace-nowrap overflow-hidden truncate">
                <MetricTooltip
                  label="NILAI INTRINSIK WAJAR"
                  title="Harga Wajar: Quantedge Dynamic Sector-Adaptive Ensemble + Graham-Joeliardi Floor"
                  laymanExplanation="Dieksekusi melalui router ValuationEngine.calculateFairValue(stock) dan DynamicEnsembleWeighter (mendeteksi penalti outlier >40% dari median, konfidensi OCF & korelasi peer ρ), ditambah benchmark independen Graham-Joeliardi Floor (0% bobot ensemble)."
                  practicalGuide="Gunakan angka utama sebagai patokan nilai intrinsik dan Graham-Joeliardi Floor sebagai batas bawah keamanan (floor value)."
                  className="text-[#D97706] bb-amber"
                />
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-[#111315] my-1 whitespace-nowrap">
                Rp {formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)}
              </div>
              <div className="text-[10px] text-neutral-600 font-mono tabular-nums leading-tight whitespace-nowrap overflow-hidden truncate">
                Floor G-J:{' '}
                <strong className="text-[#0D5C46]">
                  Rp{' '}
                  {formatIdrPriceDisplay(
                    joeliardiEval.grahamJoeliardiBenchmarkIdr ??
                      Math.round(joeliardiEval.intrinsicValueIdr * 0.82)
                  )}
                </strong>{' '}
                · RIM: Rp{' '}
                {formatIdrPriceDisplay(
                  joeliardiEval.rimFairValueIdr ?? joeliardiEval.intrinsicValueIdr
                )}
              </div>
            </div>

            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col justify-between h-full tabular-nums">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 whitespace-nowrap overflow-hidden truncate">
                <MetricTooltip
                  label="MARGIN OF SAFETY & STATE"
                  title="Sabuk Pengaman Valuasi Dinamis (Excess Return) & Guardrail Konflik Aksi"
                  laymanExplanation="Syarat MoS dikompresi ke 0%–10% bila Excess Return (Forward ROE − Ke) > 10% (atau dikunci minimal 25,0% saat IHSG VOLATIL). Aksi Strong Buy / Buy on Strength hanya menyala apabila Sanity PASS, bebas Seed Cap, dan Grade mencapai A/A+ (≥75/100)."
                  practicalGuide="MoS ≥ Syarat Dinamis & Grade A = Akumulasi Rasional; Grade B/C = Watchlist / Hold."
                />
              </div>
              <div
                className={`text-lg font-bold font-mono tabular-nums my-1 whitespace-nowrap ${
                  joeliardiEval.isHighConvictionActionEligible &&
                  (joeliardiEval.marginOfSafetyPct >= 10 ||
                    joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST' ||
                    joeliardiEval.decisionState === 'STRONG_BUY_CYCLICAL_ZSCORE' ||
                    joeliardiEval.decisionState === 'ACCUMULATE_QUALITY_FAIR_VALUE')
                    ? 'text-[#0D5C46]'
                    : joeliardiEval.marginOfSafetyPct >= 0
                    ? 'text-[#D97706]'
                    : 'text-[#9E2A2B]'
                }`}
              >
                {joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}
                {joeliardiEval.marginOfSafetyPct.toFixed(1)}%
              </div>
              <span
                className={`text-[10.5px] font-mono tabular-nums font-bold block truncate ${
                  joeliardiEval.isHighConvictionActionEligible &&
                  (joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST' ||
                    joeliardiEval.decisionState === 'STRONG_BUY_CYCLICAL_ZSCORE')
                    ? 'text-[#0D5C46]'
                    : 'text-neutral-600'
                }`}
                title={joeliardiEval.valuationLabel}
              >
                {joeliardiEval.valuationLabel}
              </span>
            </div>

            <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col justify-between h-full tabular-nums">
              <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500 whitespace-nowrap overflow-hidden">
                <div className="truncate">
                  <MetricTooltip
                    label={`MATRIKS SEKTOR (${joeliardiEval.sectorPrimaryMetricShort ?? 'PBV'}) & PBV`}
                    title={`Matriks Spesifik Sektor (${joeliardiEval.sectorPrimaryMetricLabel ?? 'Justified PBV'}) & Damodaran PBV`}
                    laymanExplanation="Riset analis finansial membuktikan tidak ada satu rasio untuk semua sektor: Energi/Komoditas memakai Normalized P/E & EV/EBITDA, Properti memakai PBV/RNAV, Infrastruktur/Telko memakai EV/EBITDA, dan Perbankan memakai Justified PBV."
                    practicalGuide="Bandingkan rasio sektor aktual terhadap kelipatan wajarnya serta Implied PBV terhadap Justified PBV tunggal."
                    align="right"
                  />
                </div>
                {joeliardiEval.dataLineage && (
                  <span
                    className={`px-1.5 py-0.2 text-[8.5px] font-mono font-bold rounded-xs border shrink-0 ${
                      joeliardiEval.dataLineage.fields.netIncomeTTMIdr.source === 'HARDCODED_SEED'
                        ? 'bg-rose-950 text-rose-300 border-rose-500/60'
                        : joeliardiEval.dataLineage.fields.netIncomeTTMIdr.source === 'USER_OVERRIDE'
                        ? 'bg-indigo-950 text-indigo-300 border-indigo-500/50'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                    }`}
                    title={`Fundamental Source: ${joeliardiEval.dataLineage.fields.netIncomeTTMIdr.source}`}
                  >
                    {joeliardiEval.dataLineage.fields.netIncomeTTMIdr.source === 'HARDCODED_SEED'
                      ? 'SEED_WARN'
                      : joeliardiEval.dataLineage.fields.netIncomeTTMIdr.source === 'USER_OVERRIDE'
                      ? '[USER OVERRIDE]'
                      : joeliardiEval.dataLineage.fields.netIncomeTTMIdr.source === 'LIVE_YAHOO_API'
                      ? '[LIVE CLOUDFLARE WORKER]'
                      : '[VERIFIED SNAPSHOT]'}
                  </span>
                )}
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-[#111315] my-1 whitespace-nowrap overflow-hidden truncate">
                {joeliardiEval.sectorPrimaryMetricShort ?? 'PBV'}{' '}
                {Number(joeliardiEval.sectorPrimaryImpliedMultiple ?? joeliardiEval.impliedPbv).toFixed(2)}x{' '}
                <span className="text-xs font-normal text-[#0D5C46]">
                  (Wajar {Number(joeliardiEval.sectorPrimaryFairMultiple ?? joeliardiEval.joeliardiFairPbv).toFixed(2)}x)
                </span>
              </div>
              <span className="text-[10.5px] font-bold font-mono tabular-nums text-[#0284C7] bb-cyan block whitespace-nowrap overflow-hidden truncate">
                PBV {joeliardiEval.impliedPbv.toFixed(2)}x (Wajar {Number(joeliardiEval.joeliardiFairPbv).toFixed(2)}x) · PER{' '}
                {joeliardiEval.impliedPer.toFixed(2)}x
              </span>
            </div>
          </div>

          {/* 4 Pillar Scores Grid: Strict 1-Line Titles + 3-Box Horizontal Alignment + IDX-IC Sector-Aware Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-stretch">
            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF] flex flex-col justify-between h-full tabular-nums">
              <div>
                <div className="flex items-center justify-between gap-1 text-xs font-bold text-[#111315] mb-1.5 whitespace-nowrap overflow-hidden">
                  <div className="truncate">
                    <MetricTooltip
                      label={
                        joeliardiEval.sectorMethodologyProfile?.pillar1Title ||
                        '1. Gross Profit & Anti-Junk'
                      }
                      title={`Pilar 1: ${
                        joeliardiEval.sectorMethodologyProfile?.pillar1Title ||
                        'Gross Profitability & Anti-Junk'
                      } (${joeliardiEval.sectorMethodologyProfile?.regimeBadgeLabel || activeStock.sector})`}
                      laymanExplanation={
                        joeliardiEval.sectorMethodologyNotice ||
                        'Mengukur kualitas profitabilitas inti emiten sesuai struktur akuntansi sektor IDX-IC.'
                      }
                      practicalGuide="Skor ≥ 70/100 menandakan mesin profitabilitas yang melampaui biaya modal (Cost of Equity)."
                    />
                  </div>
                  <span className="font-mono tabular-nums text-[#0D5C46] shrink-0">
                    {joeliardiEval.businessQualityScore}/100
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#E4E2DD] rounded-xs overflow-hidden mb-2.5">
                  <div
                    className="h-full bg-[#059669]"
                    style={{ width: `${joeliardiEval.businessQualityScore}%` }}
                  />
                </div>
              </div>
              <div className="text-[11px] text-neutral-600 font-mono tabular-nums space-y-1">
                {joeliardiEval.sectorMethodologyProfile?.pillar1Lines ? (
                  joeliardiEval.sectorMethodologyProfile.pillar1Lines.map((line, idx) => (
                    <div key={idx} className="truncate" title={line}>
                      {line}
                    </div>
                  ))
                ) : (
                  <>
                    <div className="truncate">
                      GP/A (Novy-Marx):{' '}
                      <strong className="text-[#0D5C46]">
                        {(
                          joeliardiEval.grossProfitabilityToAssets ??
                          activeStock.grossProfitabilityToAssets ??
                          activeStock.roe * 0.85
                        ).toFixed(1)}
                        %
                      </strong>{' '}
                      (ROE {(joeliardiEval.valuationLedger?.roeTTM ?? activeStock.roe).toFixed(1)}%)
                    </div>
                    <div className="truncate">
                      OCF/NI (Anti-Junk):{' '}
                      <strong
                        className={
                          (joeliardiEval.accrualPenaltyPts ?? 0) > 0
                            ? 'text-[#D97706]'
                            : 'text-[#0D5C46]'
                        }
                      >
                        {(
                          joeliardiEval.ocfToNetIncomeRatio ??
                          activeStock.ocfToNetIncomeRatio ??
                          0.9
                        ).toFixed(2)}
                        x
                      </strong>
                    </div>
                    <div className="truncate">
                      Net Payout:{' '}
                      <strong className="text-[#0D5C46]">
                        {(
                          joeliardiEval.totalShareholderYieldPct ??
                          joeliardiEval.forwardDividendYieldPct
                        ).toFixed(2)}
                        %
                      </strong>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF] flex flex-col justify-between h-full tabular-nums">
              <div>
                <div className="flex items-center justify-between gap-1 text-xs font-bold text-[#111315] mb-1.5 whitespace-nowrap overflow-hidden">
                  <div className="truncate">
                    <MetricTooltip
                      label={
                        joeliardiEval.sectorMethodologyProfile?.pillar2Title ||
                        '2. Kesehatan Neraca'
                      }
                      title={`Pilar 2: ${
                        joeliardiEval.sectorMethodologyProfile?.pillar2Title ||
                        'Solvabilitas & Ketahanan Neraca'
                      }`}
                      laymanExplanation={
                        joeliardiEval.sectorMethodologyProfile?.regime === 'FINANCIALS'
                          ? 'Pada sektor Perbankan/Financials, DPK adalah bahan baku intermediasi sehingga DER korporasi di-bypass dan digantikan dengan Asset-to-Equity Multiplier serta audit konsentrasi HSC.'
                          : 'Menilai ketahanan struktur modal dan solvabilitas perusahaan terhadap beban utang serta memastikan saham bersih dari manipulasi HSC.'
                      }
                      practicalGuide="Struktur modal yang sehat dengan status Bebas HSC melindungi portofolio dari risiko gagal bayar dan gejolak likuiditas."
                    />
                  </div>
                  <span className="font-mono tabular-nums text-[#0284C7] shrink-0">
                    {joeliardiEval.balanceSheetHealthScore}/100
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#E4E2DD] rounded-xs overflow-hidden mb-2.5">
                  <div
                    className="h-full bg-[#0284C7]"
                    style={{ width: `${joeliardiEval.balanceSheetHealthScore}%` }}
                  />
                </div>
              </div>
              <div className="text-[11px] text-neutral-600 font-mono tabular-nums space-y-1">
                {joeliardiEval.sectorMethodologyProfile?.pillar2Lines ? (
                  joeliardiEval.sectorMethodologyProfile.pillar2Lines.map((line, idx) => (
                    <div key={idx} className="truncate" title={line}>
                      {line}
                    </div>
                  ))
                ) : (
                  <>
                    <div className="truncate">
                      DER:{' '}
                      {(joeliardiEval.rawTickerData &&
                      joeliardiEval.rawTickerData.equityAttributable > 0
                        ? (joeliardiEval.rawTickerData.totalDebt ?? 0) /
                          joeliardiEval.rawTickerData.equityAttributable
                        : activeStock.debtToEquity
                      ).toFixed(2)}
                      x
                    </div>
                    <div className="truncate">
                      Status Neraca:{' '}
                      {(joeliardiEval.rawTickerData &&
                      joeliardiEval.rawTickerData.equityAttributable > 0
                        ? (joeliardiEval.rawTickerData.totalDebt ?? 0) /
                          joeliardiEval.rawTickerData.equityAttributable
                        : activeStock.debtToEquity) <= 0.8
                        ? 'Konservatif'
                        : 'Moderat/Tinggi'}
                    </div>
                    <div className="truncate">
                      Status HSC:{' '}
                      {activeStock.isHscFlagged ? (
                        <strong className="text-[#9E2A2B]">Blokir HSC</strong>
                      ) : (
                        <strong className="text-[#0D5C46]">Bebas HSC (&lt;92,5%)</strong>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF] flex flex-col justify-between h-full tabular-nums">
              <div>
                <div className="flex items-center justify-between gap-1 text-xs font-bold text-[#111315] mb-1.5 whitespace-nowrap overflow-hidden">
                  <div className="truncate">
                    <MetricTooltip
                      label={
                        joeliardiEval.sectorMethodologyProfile?.pillar3Title ||
                        '3. Justified PBV & Kurva SBN'
                      }
                      title="Pilar 3: Valuasi Masa Depan Damodaran (2012) & Kurva Spot SBN"
                      laymanExplanation="Menghitung nilai wajar dengan rumus Justified PBV = (ROE − g) ÷ (Ke − g) dengan tingkat diskonto (Ke) dari kurva Spot SBN (1Y/5Y/10Y)."
                      practicalGuide="Skor ≥ 68/100 mengonfirmasi harga beli memberikan Margin of Safety yang memadai terhadap risiko makro."
                    />
                  </div>
                  <span className="font-mono tabular-nums text-[#D97706] shrink-0">
                    {joeliardiEval.valuationSafetyScore}/100
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#E4E2DD] rounded-xs overflow-hidden mb-2.5">
                  <div
                    className="h-full bg-[#D97706]"
                    style={{ width: `${joeliardiEval.valuationSafetyScore}%` }}
                  />
                </div>
              </div>
              <div className="text-[11px] text-neutral-600 font-mono tabular-nums space-y-1">
                <div className="truncate">
                  Justified PBV: {Number(joeliardiEval.joeliardiFairPbv).toFixed(2)}x (g{' '}
                  {(joeliardiEval.sustainableGrowthRatePct ?? 5.5).toFixed(1)}%)
                </div>
                <div className="truncate">
                  Spot SBN Blended: {(joeliardiEval.sbnBlendedSpotRfPct ?? 6.64).toFixed(2)}% -&gt; Ke{' '}
                  {(joeliardiEval.dynamicCostOfEquityPct ?? 12.64).toFixed(2)}%
                </div>
                <div className="truncate" title={joeliardiEval.valuationLabel}>
                  State:{' '}
                  <strong
                    className={
                      joeliardiEval.isHighConvictionActionEligible &&
                      joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST'
                        ? 'text-[#0D5C46]'
                        : 'text-[#111315]'
                    }
                  >
                    {joeliardiEval.isHighConvictionActionEligible &&
                    joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST'
                      ? 'Buy on Strength / Catalyst'
                      : `${joeliardiEval.valuationLabel} (MoS ${
                          joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''
                        }${joeliardiEval.marginOfSafetyPct.toFixed(1)}%)`}
                  </strong>
                </div>
              </div>
            </div>

            <div className="p-3.5 border border-[#E4E2DD] rounded-xs bg-[#FFFFFF] flex flex-col justify-between h-full tabular-nums">
              <div>
                <div className="flex items-center justify-between gap-1 text-xs font-bold text-[#111315] mb-1.5 whitespace-nowrap overflow-hidden">
                  <div className="truncate">
                    <MetricTooltip
                      label={
                        joeliardiEval.sectorMethodologyProfile?.pillar4Title ||
                        '4. 1/β Barbell Position Sizing'
                      }
                      title="Pilar 4: Risk Parity 1/Beta (Qian 2005) & Barbell Antifragile (Taleb 2012)"
                      laymanExplanation="Saham berfundamental prima diberi bobot proporsional 1/Beta dengan batas alokasi maksimum per saham serta validasi kapasitas 5% ADTV."
                      practicalGuide="Beta 1Y dihitung dari regresi return harian saham terhadap ^JKSE."
                      align="right"
                    />
                  </div>
                  <span className="font-mono tabular-nums text-[#0D5C46] shrink-0">
                    {joeliardiEval.oosQuantRobustnessScore}/100
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#E4E2DD] rounded-xs overflow-hidden mb-2.5">
                  <div
                    className="h-full bg-[#059669]"
                    style={{ width: `${joeliardiEval.oosQuantRobustnessScore}%` }}
                  />
                </div>
              </div>
              <div className="text-[11px] text-neutral-600 font-mono tabular-nums space-y-1">
                <div className="truncate">
                  Komposit: {activeStock.dmuCompositeScore.toFixed(2)}/10 (Top{' '}
                  {activeStock.dmuRankPct}%)
                </div>
                <div className="truncate">
                  Propensitas 1/β:{' '}
                  {(
                    activeStock.betaWeightedPropensity ??
                    1 / Math.max(0.45, activeStock.beta1Y)
                  ).toFixed(2)}
                  x (β {activeStock.beta1Y.toFixed(2)}x)
                </div>
                <div className="truncate">
                  Batas Alokasi Maks (1/β Cap):{' '}
                  <strong className="text-[#0284C7]">
                    Maks. {(joeliardiEval.maxBarbellCapPct ?? joeliardiEval.betaWeightedSizingCapPct ?? 14).toFixed(2)}% (T1 {(joeliardiEval.tranche1Pct ?? 8.4).toFixed(2)}% + T2 {(joeliardiEval.tranche2Pct ?? 5.6).toFixed(2)}%)
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Method Fair Value Comparison & Quantedge Statistical Arbitrage (Relative Value) */}
          <div className="p-4 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#E4E2DD] pb-2.5">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0D5C46] block">
                  QUANTEDGE SECTOR-ADAPTIVE ROUTER &amp; DYNAMIC ENSEMBLE
                </span>
                <div className="text-xs sm:text-sm font-bold text-[#111315] mt-0.5">
                  <MetricTooltip
                    label="Komparasi Multi-Metode Harga Wajar & Standalone Floor"
                    title="ValuationEngine Router, DynamicEnsembleWeighter & Graham-Joeliardi Floor"
                    laymanExplanation="Mengarahkan emiten ke 1 dari 3 modul sektoral (Steady Compounder, Capex Aggressor, Pure Cyclical), menyesuaikan bobot secara dinamis (memangkas 50% bobot model yang menyimpang >40% dari median, mematikan P/CF bila OCF<0, atau mematikan RelVal bila ρ<0.70), serta menampilkan Graham-Joeliardi Benchmark sebagai floor independen (0% bobot ensemble)."
                    practicalGuide="Bandingkan Harga Wajar Utama Quantedge terhadap Graham-Joeliardi Floor untuk memverifikasi ketahanan margin of safety."
                  />
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono rounded-xs bg-[#FFFFFF] border border-[#E4E2DD] text-neutral-600">
                  <span className="font-semibold">Matriks Utama Sektor:</span>
                  <span className="px-2 py-0.5 rounded-xs bg-[#D97706]/20 text-[#D97706] bb-amber border border-[#D97706]/50 font-extrabold tracking-tight">
                    {joeliardiEval.sectorPrimaryMetricLabel ?? 'Justified PBV'}
                  </span>
                </div>
                {joeliardiEval.valuationModuleLabel && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono rounded-xs bg-[#059669]/10 border border-[#059669]/40 text-[#0D5C46] font-bold">
                    <span>Router:</span>
                    <span>{joeliardiEval.valuationModuleLabel}</span>
                    {joeliardiEval.valuationReport?.applied_module && (
                      <span className="px-1.5 py-0.5 rounded-xs bg-[#0D5C46] text-white text-[9px] font-extrabold">
                        {joeliardiEval.valuationReport.applied_module}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Pre-Render runFinancialAudit() Guardrail & Auto-Adapt Banner */}
            {joeliardiEval.financialAuditReport && (
              <div
                className={`px-3.5 py-2.5 border rounded-xs flex flex-col gap-1.5 text-[11px] font-mono shadow-2xs ${
                  joeliardiEval.financialAuditReport.auditStatus === 'AUTO_REROUTED' ||
                  joeliardiEval.isQualityCompounderOverride
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                    : joeliardiEval.financialAuditReport.auditStatus === 'AUDIT_WARNING'
                    ? 'bg-amber-50 border-amber-400 text-amber-950'
                    : 'bg-white border-[#E4E2DD] text-[#111315]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-xs text-[9.5px] font-extrabold uppercase tracking-wider ${
                        joeliardiEval.financialAuditReport.auditStatus === 'AUTO_REROUTED' ||
                        joeliardiEval.isQualityCompounderOverride
                          ? 'bg-[#0D5C46] text-white'
                          : joeliardiEval.financialAuditReport.auditStatus === 'AUDIT_WARNING'
                          ? 'bg-[#D97706] text-white'
                          : 'bg-[#059669]/15 text-[#0D5C46] border border-[#059669]/40'
                      }`}
                    >
                      {joeliardiEval.isQualityCompounderOverride
                        ? 'AUTO-ADAPT TIER-2 DNA OVERRIDE → QUALITY COMPOUNDER'
                        : `PRE-RENDER FINANCIAL AUDIT: ${joeliardiEval.financialAuditReport.auditStatus}`}
                    </span>
                    <span className="px-2 py-0.5 rounded-xs text-[9.5px] font-bold bg-[#FAF9F6] border border-[#E4E2DD] text-neutral-700">
                      DATA CONFIDENCE: {joeliardiEval.financialAuditReport.dataConfidenceLevel} ({joeliardiEval.financialAuditReport.dataConfidenceScore}/100)
                    </span>
                    <span className="px-2 py-0.5 rounded-xs text-[9.5px] font-bold bg-[#FAF9F6] border border-[#E4E2DD] text-[#0D5C46]">
                      Implied PER Wajar: {joeliardiEval.financialAuditReport.reconciledFairPer.toFixed(2)}x · Implied PBV Wajar: {joeliardiEval.financialAuditReport.reconciledFairPbv.toFixed(2)}x
                    </span>
                    <span className="px-2 py-0.5 rounded-xs text-[9.5px] font-bold bg-[#FAF9F6] border border-[#E4E2DD] text-neutral-700">
                      TSY: {joeliardiEval.financialAuditReport.verifiedNetPayoutYieldPct.toFixed(2)}% (Zero Double-Counting ✓)
                    </span>
                  </div>
                </div>
                <div className="text-[10.5px] font-semibold leading-relaxed">
                  {joeliardiEval.financialAuditReport.auditSummaryBannerText}
                </div>
              </div>
            )}

            {/* UI Notification Flags Banner (Dynamic Context-Aware Warning Badges) */}
            {(joeliardiEval.valuationReport?.ui_notifications ?? joeliardiEval.uiNotifications ?? []).length > 0 && (
              <div className="space-y-1.5">
                {(joeliardiEval.valuationReport?.ui_notifications ?? joeliardiEval.uiNotifications ?? []).map(
                  (notifMsg, nIdx) => {
                    const badgeMeta = resolveUiNotificationBadgeMeta(notifMsg);
                    return (
                      <div
                        key={nIdx}
                        className={`px-3.5 py-2.5 border rounded-xs flex items-start gap-2.5 text-[11px] font-mono shadow-2xs ${badgeMeta.boxBgClass} ${badgeMeta.boxBorderClass} ${badgeMeta.boxTextClass}`}
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded-xs text-[9px] font-extrabold uppercase tracking-wider shrink-0 mt-0.5 ${badgeMeta.pillBgClass} ${badgeMeta.pillTextClass}`}
                        >
                          {badgeMeta.badgeLabel}
                        </span>
                        <span className={`font-semibold leading-relaxed ${badgeMeta.boxTextClass}`}>
                          {notifMsg}
                        </span>
                      </div>
                    );
                  }
                )}
              </div>
            )}

            {/* Mathematical Formula Calculation Strip (Single Source of Truth ValuationLedger) */}
            {(joeliardiEval.valuationLedger?.formulaAudit || joeliardiEval.ensembleFormulaAudit) && (
              <div className="px-3 py-2 bg-[#FFFFFF] border border-[#D97706]/40 rounded-xs flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                <span className="font-bold text-[#D97706] bb-amber">
                  Perhitungan harga wajar :
                </span>
                <span className="text-[#111315] font-semibold">
                  {joeliardiEval.valuationLedger?.formulaAudit || joeliardiEval.ensembleFormulaAudit}
                </span>
              </div>
            )}

            {/* 4 Valuation Methods Grid (Model Final + 3 Dynamic Ensemble Legs) + Full-Width Standalone Floor Bar Below */}
            {joeliardiEval.valuationMethodsComparison &&
              joeliardiEval.valuationMethodsComparison.length > 0 &&
              (() => {
                const ledger = joeliardiEval.valuationLedger;
                const secLeg = joeliardiEval.valuationMethodsComparison.find(
                  (x) => x.id === 'sector_specific_matrix'
                );
                const rimLeg = joeliardiEval.valuationMethodsComparison.find(
                  (x) => x.id === 'multistage_rim'
                );
                const relLeg = joeliardiEval.valuationMethodsComparison.find(
                  (x) => x.id === 'historical_evebitda_5y' || x.id === 'statarb_relative_peer'
                );

                const secFair =
                  ledger?.components[0]?.value ??
                  secLeg?.fairPriceIdr ??
                  joeliardiEval.sectorSpecificFairValueIdr ??
                  joeliardiEval.intrinsicValueIdr;
                const rimFair =
                  ledger?.components[1]?.value ??
                  rimLeg?.fairPriceIdr ??
                  joeliardiEval.rimFairValueIdr ??
                  joeliardiEval.intrinsicValueIdr;
                const relFair =
                  ledger?.components[2]?.value ??
                  relLeg?.fairPriceIdr ??
                  joeliardiEval.valuationResult?.valuationLedger?.components[2]?.value ??
                  joeliardiEval.statArbImpliedTargetIdr ??
                  joeliardiEval.intrinsicValueIdr;
                const totalModelFinal = Math.max(1, joeliardiEval.intrinsicValueIdr);

                const secWeightDec =
                  ledger?.components[0]?.weight ?? (secLeg?.weightPct ?? 45) / 100;
                const rimWeightDec =
                  ledger?.components[1]?.weight ?? (rimLeg?.weightPct ?? 35) / 100;
                const relWeightDec =
                  ledger?.components[2]?.weight ?? (relLeg?.weightPct ?? 20) / 100;

                const secContribIdr = Math.round(secFair * secWeightDec);
                const rimContribIdr = Math.round(rimFair * rimWeightDec);
                const relContribIdr = Math.max(
                  0,
                  Math.round(relFair * relWeightDec)
                );

                const secSharePct = Math.max(
                  0,
                  Math.min(100, Math.round(secWeightDec * 100))
                );
                const rimSharePct = Math.max(
                  0,
                  Math.min(100, Math.round(rimWeightDec * 100))
                );
                const relSharePct = Math.max(
                  0,
                  100 - secSharePct - rimSharePct
                );

                const ensembleCards = joeliardiEval.valuationMethodsComparison.filter(
                  (m) => !m.isStandaloneBenchmark
                );
                const standaloneFloorMethod = joeliardiEval.valuationMethodsComparison.find(
                  (m) => Boolean(m.isStandaloneBenchmark)
                );

                return (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {ensembleCards.map((m, mIdx) => {
                        const isPrimary = Boolean(m.isPrimaryEnsemble);
                        const cleanMethodName = m.name.replace(/\s*\(Utama\)/i, '');
                        const compContribIdr =
                          m.id === 'sector_specific_matrix'
                            ? secContribIdr
                            : m.id === 'multistage_rim'
                            ? rimContribIdr
                            : m.id === 'historical_evebitda_5y' || m.id === 'statarb_relative_peer'
                            ? relContribIdr
                            : totalModelFinal;
                        const compBarColor =
                          m.id === 'sector_specific_matrix'
                            ? 'bg-[#D97706]'
                            : m.id === 'multistage_rim'
                            ? 'bg-[#059669]'
                            : 'bg-[#0284C7]';
                        const compTextColor =
                          m.id === 'sector_specific_matrix'
                            ? 'text-[#D97706] bb-amber'
                            : m.id === 'multistage_rim'
                            ? 'text-[#0D5C46]'
                            : 'text-[#0284C7] bb-cyan';
                        const compShareOfFinalPct = Math.min(
                          100,
                          Math.max(0, Math.round(m.weightPct ?? 0))
                        );

                        const tooltipConfig =
                          m.id === 'quantedge_ensemble'
                            ? {
                                title:
                                  'Quantedge Sector-Adaptive Ensemble (Model Final — Akumulasi 100%)',
                                laymanExplanation:
                                  'Model Final yang dihitung secara presisi dari akumulasi tertimbang komponen Matriks Sektor, Multi-Stage RIM, dan Relative Value Peer melalui DynamicEnsembleWeighter.',
                                practicalGuide:
                                  'Menjadi patokan utama perhitungan Margin of Safety (MoS) dan zona akumulasi.'
                              }
                            : m.id === 'sector_specific_matrix'
                            ? {
                                title: `Matriks Spesifik Sektor (${joeliardiEval.sectorPrimaryMetricLabel}) — Bobot ${(m.weightPct ?? 45).toFixed(1)}%`,
                                laymanExplanation: `Menggunakan metrik standar institusional yang paling relevan untuk sektor ${activeStock.sector} (${joeliardiEval.sectorPrimaryMetricShort}) sesuai router ${joeliardiEval.valuationModuleLabel ?? 'ValuationEngine'}.`,
                                practicalGuide: `Membandingkan ${joeliardiEval.sectorPrimaryMetricShort} aktual (${joeliardiEval.sectorPrimaryImpliedMultiple}x) terhadap ${joeliardiEval.sectorPrimaryMetricShort} wajar (${joeliardiEval.sectorPrimaryFairMultiple}x).`
                              }
                            : m.id === 'multistage_rim'
                            ? {
                                title: `Multi-Stage Residual Income (Ohlson 1995 & Penman 2020, ω=${(joeliardiEval.rimPersistenceOmega ?? 0.72).toFixed(2)}) — Bobot ${(m.weightPct ?? 35).toFixed(1)}%`,
                                laymanExplanation:
                                  'Menilai saham dari Nilai Buku Ekuitas saat ini (Anchor BVPS) ditambah nilai sekarang (present value) dari Laba Abnormal yang meluruh sesuai faktor elastis sektoral (ω).',
                                practicalGuide:
                                  'Sangat tangguh terhadap fluktuasi siklus jangka pendek karena berjangkar pada ekuitas neraca.'
                              }
                            : {
                                title: `Beta-Adjusted Relative Value & StatArb vs ${joeliardiEval.statArbPeerTicker} — Bobot ${(m.weightPct ?? 20).toFixed(1)}%`,
                                laymanExplanation:
                                  'Mengukur nilai wajar relatif berdasarkan regresi hedonis lintas emiten dan deviasi spread kointegrasi (Z-Score) yang telah dinormalisasi dengan rasio volatilitas Beta (β_A / β_B).',
                                practicalGuide:
                                  'Mendeteksi peluang mean-reversion ketika saham tertinggal secara tidak wajar dibanding peer utamanya.'
                              };

                        return (
                          <div
                            key={m.id}
                            className={`p-3 rounded-xs border transition-colors flex flex-col ${
                              isPrimary
                                ? 'bg-[#FFFFFF] border-[#D97706] shadow-2xs'
                                : 'bg-[#FFFFFF]/80 border-[#E4E2DD]'
                            }`}
                          >
                            <div className="min-h-[48px] flex flex-col justify-start">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                                    isPrimary
                                      ? 'text-[#D97706] bb-amber'
                                      : 'text-neutral-500'
                                  }`}
                                >
                                  {isPrimary ? '★ MODEL FINAL' : 'KOMPONEN ENSEMBLE'}
                                </span>
                                <span className="text-[10px] font-mono font-semibold text-neutral-500 shrink-0 whitespace-nowrap">
                                  Bobot {(m.weightPct ?? 0).toFixed(0)}%
                                </span>
                              </div>
                              <div className="text-[11px] font-bold text-[#111315] mt-1 leading-snug break-words">
                                <MetricTooltip
                                  label={cleanMethodName}
                                  title={tooltipConfig.title}
                                  laymanExplanation={tooltipConfig.laymanExplanation}
                                  practicalGuide={tooltipConfig.practicalGuide}
                                  align={mIdx >= 2 ? 'right' : 'left'}
                                />
                              </div>
                            </div>

                            <div className="mt-2 pt-2 border-t border-[#E4E2DD]/60 flex-1 flex flex-col">
                              <div className="flex items-baseline justify-between gap-2">
                                <div className="text-lg sm:text-xl font-extrabold font-mono text-[#111315] whitespace-nowrap">
                                  Rp {formatIdrPriceDisplay(m.fairPriceIdr)}
                                </div>
                                <span
                                  className={`text-[10.5px] font-mono font-bold whitespace-nowrap ${
                                    m.mosPct >= 10
                                      ? 'text-[#0D5C46]'
                                      : m.mosPct >= 0
                                      ? 'text-[#D97706]'
                                      : 'text-[#9E2A2B]'
                                  }`}
                                >
                                  {m.mosPct >= 0 ? '+' : ''}
                                  {m.mosPct.toFixed(1)}%
                                </span>
                              </div>

                              {/* Visual Accumulation Bar: Stacked Bar on Model Final vs Proportional Contribution Bar on Components */}
                              {isPrimary ? (
                                <div className="mt-1.5 mb-1.5 p-1.5 rounded-2xs bg-[#FAF9F6] border border-[#E4E2DD]">
                                  <div className="flex items-center justify-between gap-1 text-[9px] font-mono text-neutral-600 mb-1 whitespace-nowrap">
                                    <span className="font-bold text-[#111315]">
                                      Akumulasi Dinamis:
                                    </span>
                                    <span className="font-bold text-[#D97706] bb-amber">
                                      100% (Rp {formatIdrPriceDisplay(totalModelFinal)})
                                    </span>
                                  </div>
                                  <div className="w-full h-2 rounded-2xs overflow-hidden flex bg-[#E4E2DD]/70 gap-0.5">
                                    {secSharePct > 0 && (
                                      <div
                                        className="h-full bg-[#D97706]"
                                        style={{ width: `${secSharePct}%` }}
                                        title={`${secSharePct}% Sektor: +Rp ${formatIdrPriceDisplay(secContribIdr)}`}
                                      />
                                    )}
                                    {rimSharePct > 0 && (
                                      <div
                                        className="h-full bg-[#059669]"
                                        style={{ width: `${rimSharePct}%` }}
                                        title={`${rimSharePct}% RIM: +Rp ${formatIdrPriceDisplay(rimContribIdr)}`}
                                      />
                                    )}
                                    {relSharePct > 0 && (
                                      <div
                                        className="h-full bg-[#0284C7]"
                                        style={{ width: `${relSharePct}%` }}
                                        title={`${relSharePct}% RelVal: +Rp ${formatIdrPriceDisplay(relContribIdr)}`}
                                      />
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between text-[9px] font-mono text-neutral-600 mt-1">
                                    <span className="text-[#D97706] bb-amber font-semibold">
                                      +Rp {formatIdrPriceDisplay(secContribIdr)}
                                    </span>
                                    <span>+</span>
                                    <span className="text-[#0D5C46] font-semibold">
                                      Rp {formatIdrPriceDisplay(rimContribIdr)}
                                    </span>
                                    <span>+</span>
                                    <span className="text-[#0284C7] bb-cyan font-semibold">
                                      Rp {formatIdrPriceDisplay(relContribIdr)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-1.5 mb-1.5 p-1.5 rounded-2xs bg-[#FAF9F6] border border-[#E4E2DD]">
                                  <div className="flex items-center justify-between text-[9.5px] font-mono mb-1">
                                    <span className="text-neutral-600">
                                      Kontribusi ({(m.weightPct ?? 0).toFixed(0)}%):
                                    </span>
                                    <span className={`font-extrabold ${compTextColor}`}>
                                      +Rp {formatIdrPriceDisplay(compContribIdr)} ke Final
                                    </span>
                                  </div>
                                  <div className="w-full h-2 rounded-2xs overflow-hidden bg-[#E4E2DD]/70">
                                    <div
                                      className={`h-full ${compBarColor}`}
                                      style={{ width: `${compShareOfFinalPct}%` }}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-[9px] font-mono text-neutral-500 mt-1">
                                    <span>
                                      Rp {formatIdrPriceDisplay(m.fairPriceIdr)} ×{' '}
                                      {(m.weightPct ?? 0).toFixed(0)}%
                                    </span>
                                    <span>
                                      {compShareOfFinalPct}% bobot dinamis
                                    </span>
                                  </div>
                                </div>
                              )}

                              <div className="text-[10px] font-mono text-neutral-600 mt-1 leading-snug break-words">
                                {m.metricBasis}
                              </div>
                              <div className="text-[10px] text-neutral-500 mt-0.5 leading-snug break-words">
                                Aktual: {m.impliedMultipleLabel} · Wajar: {m.fairMultipleLabel}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Full-Width Horizontal Bar for Graham-Joeliardi Standalone Floor Benchmark */}
                    {standaloneFloorMethod && (
                      <div className="w-full p-3 rounded-xs bg-[#FAF9F6] border border-dashed border-[#0D5C46]/50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="min-w-0 lg:w-[34%] shrink-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#0D5C46]">
                              ⚓ FLOOR BENCHMARK
                            </span>
                            <span className="text-[10px] font-mono text-neutral-500">
                              · Standalone (0% Bobot Ensemble)
                            </span>
                          </div>
                          <div className="text-xs font-bold text-[#111315] mt-0.5 leading-snug">
                            <MetricTooltip
                              label={standaloneFloorMethod.name.replace(/\s*\(Utama\)/i, '')}
                              title='Graham-Joeliardi "Moat" Intrinsic Floor Benchmark (Standalone — 0% Bobot Ensemble)'
                              laymanExplanation="Rumus konservatif (EPS × (8.5 + 2g) × 4.4) ÷ SBN 10Y Yield dengan Weak Moat Penalty (-25% bila ROE < 15% atau DER > 1x). Ditampilkan murni sebagai batas bawah keamanan (sanity check floor) dan TIDAK dirata-ratakan ke dalam Harga Wajar Utama Quantedge."
                              practicalGuide="Jika harga pasar berada di dekat atau di bawah lantai Graham-Joeliardi ini, risiko penurunan fundamental jangka panjang sangat terbatas."
                              align="left"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[9.5px] font-mono">
                            <span className="text-[#0D5C46] font-bold">
                              Sanity Check Floor (Tidak Dirata-ratakan):
                            </span>
                            <span className="text-neutral-600 font-semibold">
                              {joeliardiEval.isMoatHaircutApplied
                                ? 'Termasuk Weak Moat Penalty -25% (ROE<15% / DER>1x)'
                                : 'Moat Kuat Terverifikasi (0% Haircut Penalty)'}
                            </span>
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 lg:border-l lg:border-r border-[#E4E2DD] lg:px-3.5 py-0.5">
                          <div className="text-[10px] font-mono text-[#111315] leading-relaxed break-words">
                            {standaloneFloorMethod.metricBasis}
                          </div>
                          <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                            Aktual: {standaloneFloorMethod.impliedMultipleLabel} · Wajar:{' '}
                            {standaloneFloorMethod.fairMultipleLabel}
                          </div>
                        </div>

                        <div className="flex sm:flex-row lg:flex-col items-baseline lg:items-end justify-between gap-2 shrink-0 lg:min-w-[165px]">
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg sm:text-xl font-extrabold font-mono text-[#111315] whitespace-nowrap">
                              Rp {formatIdrPriceDisplay(standaloneFloorMethod.fairPriceIdr)}
                            </span>
                            <span
                              className={`text-[11px] font-mono font-bold whitespace-nowrap ${
                                standaloneFloorMethod.mosPct >= 10
                                  ? 'text-[#0D5C46]'
                                  : standaloneFloorMethod.mosPct >= 0
                                  ? 'text-[#D97706]'
                                  : 'text-[#9E2A2B]'
                              }`}
                            >
                              {standaloneFloorMethod.mosPct >= 0 ? '+' : ''}
                              {standaloneFloorMethod.mosPct.toFixed(1)}%
                            </span>
                          </div>
                          <span className="text-[9.5px] font-mono text-neutral-500">
                            Selisih vs Model Final:{' '}
                            <strong className="text-[#111315]">
                              {standaloneFloorMethod.fairPriceIdr <= totalModelFinal
                                ? `Floor -${Math.round(((totalModelFinal - standaloneFloorMethod.fairPriceIdr) / Math.max(1, totalModelFinal)) * 100)}% di bawah Final`
                                : `Floor +${Math.round(((standaloneFloorMethod.fairPriceIdr - totalModelFinal) / Math.max(1, totalModelFinal)) * 100)}% di atas Final`}
                            </strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* Quantedge Statistical Arbitrage (Relative Value vs Twin Peer) & Sector Rationale Strip */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 pt-1">
              <div className="lg:col-span-7 p-3 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#0284C7] bb-cyan">
                    <MetricTooltip
                      label={`STATISTICAL ARBITRAGE & RELATIVE VALUE (${activeStock.ticker} ↔ ${joeliardiEval.statArbPeerTicker ?? 'N/A'})`}
                      title="Kointegrasi Pairs Trading & Strict Fundamental Peer Filter (Gatev et al. 2006)"
                      laymanExplanation="Pasangan StatArb hanya diaktifkan jika memenuhi 3 syarat wajib: (1) Sub-industri & driver ekonomi sama, (2) Korelasi return historis signifikan (ρ ≥ 0,75), dan (3) Lolos uji kointegrasi. Dilarang memasangkan lintas model bisnis hanya karena kesamaan label sektor induk."
                      practicalGuide="Jika tidak ada peer fundamental yang sejenis di BEI, overlay StatArb dinonaktifkan otomatis agar tidak mencemari sinyal taktis."
                    />
                  </div>
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-mono font-extrabold rounded-xs border ${
                      joeliardiEval.tacticalOverlay?.isStatArbValid === false ||
                      joeliardiEval.statArbPeerTicker === 'N/A'
                        ? 'bg-stone-100 text-stone-700 border-stone-300'
                        : joeliardiEval.statArbSignal === 'MEAN_REVERSION_BUY'
                        ? 'bg-[#059669]/15 text-[#0D5C46] border-[#059669]/50'
                        : joeliardiEval.statArbSignal === 'PAIR_OVEREXTENDED_TRIM'
                        ? 'bg-[#E11D48]/15 text-[#9E2A2B] border-[#E11D48]/50'
                        : joeliardiEval.statArbSignal === 'FUNDAMENTAL_DIVERGENCE'
                        ? 'bg-[#D97706]/15 text-[#D97706] bb-amber border-[#D97706]/50'
                        : 'bg-[#0284C7]/15 text-[#0284C7] bb-cyan border-[#0284C7]/50'
                    }`}
                  >
                    {joeliardiEval.tacticalOverlay?.isStatArbValid === false ||
                    joeliardiEval.statArbPeerTicker === 'N/A'
                      ? 'N/A - Tidak ada peer fundamental yang berkorelasi'
                      : joeliardiEval.statArbSignalLabel ||
                        (joeliardiEval.statArbSignal === 'MEAN_REVERSION_BUY'
                          ? 'LONG SPREAD (MEAN-REVERSION BUY)'
                          : joeliardiEval.statArbSignal === 'PAIR_OVEREXTENDED_TRIM'
                          ? 'SHORT SPREAD (OVEREXTENDED VS PEER)'
                          : 'KOINTEGRASI SEIMBANG (NEUTRAL PAIR)')}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-[#FAF9F6] p-2 rounded-xs border border-[#E4E2DD]/80 mb-2">
                  <div>
                    <span className="text-neutral-500 block text-[9.5px]">PEER TWIN</span>
                    <strong className="text-[#111315]">
                      {joeliardiEval.tacticalOverlay?.isStatArbValid === false ||
                      joeliardiEval.statArbPeerTicker === 'N/A'
                        ? 'N/A - Tidak ada peer fundamental yang berkorelasi'
                        : `${joeliardiEval.statArbPeerTicker} (${joeliardiEval.statArbPeerName})`}
                    </strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[9.5px]">KORELASI HIST (ρ)</span>
                    <strong className="text-[#0D5C46]">
                      {joeliardiEval.tacticalOverlay?.isStatArbValid === false ||
                      joeliardiEval.statArbPeerTicker === 'N/A'
                        ? 'N/A'
                        : (joeliardiEval.statArbCorrelation ?? 0.85).toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[9.5px]">Z-SCORE SPREAD</span>
                    <strong
                      className={
                        joeliardiEval.tacticalOverlay?.isStatArbValid === false ||
                        joeliardiEval.statArbPeerTicker === 'N/A'
                          ? 'text-neutral-500'
                          : (joeliardiEval.statArbZScore ?? 0) <= -1.0
                          ? 'text-[#0D5C46]'
                          : (joeliardiEval.statArbZScore ?? 0) >= 1.25
                          ? 'text-[#9E2A2B]'
                          : 'text-[#111315]'
                      }
                    >
                      {joeliardiEval.tacticalOverlay?.isStatArbValid === false ||
                      joeliardiEval.statArbPeerTicker === 'N/A'
                        ? 'N/A (Nonaktif)'
                        : `${(joeliardiEval.statArbZScore ?? 0) >= 0 ? '+' : ''}${(
                            joeliardiEval.statArbZScore ?? 0
                          ).toFixed(2)}σ (1D ${
                            (joeliardiEval.statArbSpread1DPct ?? 0) >= 0 ? '+' : ''
                          }${(joeliardiEval.statArbSpread1DPct ?? 0).toFixed(2)}%)`}
                    </strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[9.5px]">TARGET KONVERGENSI</span>
                    <strong className="text-[#0284C7] bb-cyan">
                      {joeliardiEval.tacticalOverlay?.isStatArbValid === false ||
                      joeliardiEval.statArbPeerTicker === 'N/A'
                        ? 'N/A (Murni Intrinsik)'
                        : `Rp ${formatIdrPriceDisplay(
                            joeliardiEval.statArbImpliedTargetIdr ??
                              joeliardiEval.intrinsicValueIdr
                          )}`}
                    </strong>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-700 leading-relaxed text-justify">
                  {renderHighlightedQuantRationale(
                    joeliardiEval.statArbRationale || '',
                    activeStock.ticker,
                    joeliardiEval.statArbPeerTicker
                  )}
                </p>
              </div>

              <div className="lg:col-span-5 p-3 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bb-amber block mb-1.5">
                    <MetricTooltip
                      label="RASIONALISASI MATRIKS SEKTOR & MULTI-STAGE RIM"
                      title="Diagnostik Spesifik Emiten, Konversi Kas & Persistensi RIM"
                      laymanExplanation="Membedah posisi valuasi spesifik emiten terhadap siklus sektornya, kualitas konversi laba menjadi kas operasi riil (OCF/NI & GP/A), serta daya tahan excess return pada model Ohlson-Penman RIM."
                      practicalGuide="Pastikan diskon multiple sektoral ditopang oleh OCF/NI ≥ 0,85x dan Forward ROE di atas Cost of Equity (Ke)."
                      align="right"
                    />
                  </div>
                  <p className="text-[11px] text-neutral-700 leading-relaxed text-justify">
                    {renderHighlightedQuantRationale(
                      joeliardiEval.sectorAcademicRationale || '',
                      activeStock.ticker,
                      joeliardiEval.statArbPeerTicker
                    )}
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-[#E4E2DD] flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono text-neutral-600">
                  <span>
                    Anchor BVPS: <strong>Rp {joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')}</strong> · EPS:{' '}
                    <strong>Rp {joeliardiEval.estimatedEpsIdr.toLocaleString('id-ID')}</strong>
                  </span>
                  <span>
                    RIM ω={(joeliardiEval.rimPersistenceOmega ?? 0.72).toFixed(2)} ({joeliardiEval.rimFadeYears ?? 6}Thn):{' '}
                    <strong className="text-[#0D5C46]">
                      Rp {formatIdrPriceDisplay(joeliardiEval.rimFairValueIdr ?? joeliardiEval.intrinsicValueIdr)}
                    </strong>
                  </span>
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
                    INVESTMENT COMMITTEE ENGINE // NOVY-MARX GP/A + DAMODARAN JUSTIFIED PBV + 1/β BARBELL
                  </span>
                  <h4 className="text-sm sm:text-base font-bold text-[#111315]">
                    Komite Investasi AI: Bedah GP/A, Kurva Spot SBN (1Y/5Y/10Y), Justified PBV &amp; Sizing 1/β ({activeStock.ticker})
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

            {/* Quantitative GP/A, SBN Spot Yield Curve, Anti-Junk QMJ & 1/Beta Sizing Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {(() => {
                const safeDer = Math.max(0, activeStock.debtToEquity);
                const eqMult = 1 + safeDer;
                const roaDuPont = activeStock.roe / Math.max(1, eqMult);
                const gpToAssets =
                  joeliardiEval.grossProfitabilityToAssets ??
                  activeStock.grossProfitabilityToAssets ??
                  Number((activeStock.roe * 0.85).toFixed(1));
                const ocfNi =
                  joeliardiEval.ocfToNetIncomeRatio ??
                  activeStock.ocfToNetIncomeRatio ??
                  0.92;
                const accrualPen = joeliardiEval.accrualPenaltyPts ?? 0;
                const sbn1Y = joeliardiEval.sbnSpot1YPct ?? 6.15;
                const sbn5Y = joeliardiEval.sbnSpot5YPct ?? 6.48;
                const sbn10Y = joeliardiEval.sbnSpot10YPct ?? 6.75;
                const sbnBlended = joeliardiEval.sbnBlendedSpotRfPct ?? 6.64;
                const dynKe = joeliardiEval.dynamicCostOfEquityPct ?? 12.64;
                const justPbv = joeliardiEval.joeliardiFairPbv;
                const betaCap = joeliardiEval.betaWeightedSizingCapPct ?? 14.0;
                const secProf = joeliardiEval.sectorMethodologyProfile;

                return (
                  <>
                    <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs flex flex-col justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 whitespace-nowrap overflow-hidden truncate">
                        <MetricTooltip
                          label={
                            secProf?.academicStripCard1.label || 'GP/A (Novy-Marx) & DuPont'
                          }
                          title={
                            secProf?.academicStripCard1.label ||
                            'Gross Profitability to Assets (Laba Kotor ÷ Total Aset) & ROA Murni'
                          }
                          laymanExplanation={
                            joeliardiEval.sectorMethodologyNotice ||
                            'Mengukur profitabilitas inti perusahaan terhadap total aset.'
                          }
                          practicalGuide="Pastikan profitabilitas inti berada di atas biaya modal (Ke)."
                        />
                      </div>
                      <div className="text-xs sm:text-sm font-mono tabular-nums font-bold text-[#0D5C46] mt-1">
                        <div>
                          {secProf?.academicStripCard1.mainVal ||
                            `GP/A ${gpToAssets.toFixed(1)}%`}
                        </div>
                        <span className="block text-[10px] font-normal text-neutral-500 mt-0.5 leading-snug truncate">
                          {secProf?.academicStripCard1.subVal ||
                            `(ROA ${roaDuPont.toFixed(1)}% · Lev ${eqMult.toFixed(2)}x)`}
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs flex flex-col justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 whitespace-nowrap overflow-hidden truncate">
                        <MetricTooltip
                          label="Kurva Spot SBN (1Y/5Y/10Y)"
                          title="Bobot Kombinasi Spot Rate SBN 1Y, 5Y, 10Y (Fabozzi 2012) & Cost of Equity Dinamis"
                          laymanExplanation="Menggunakan kombinasi probabilitas spot rate sepanjang yield curve obligasi pemerintah sesuai durasi arus kas ekuitas untuk menghitung Dynamic Cost of Equity (Ke)."
                          practicalGuide="Semakin tinggi ROE emiten di atas Ke dinamis ini, semakin besar penciptaan nilai intrinsik bagi pemegang saham."
                        />
                      </div>
                      <div className="text-xs sm:text-sm font-mono tabular-nums font-bold text-[#111315] mt-1">
                        <div>Ke {dynKe.toFixed(2)}%</div>
                        <span className="block text-[10px] font-normal text-neutral-500 mt-0.5 leading-snug truncate">
                          (Spot Rf {sbnBlended.toFixed(2)}%: 1Y {sbn1Y}%·5Y {sbn5Y}%·10Y {sbn10Y}%)
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs flex flex-col justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 whitespace-nowrap overflow-hidden truncate">
                        <MetricTooltip
                          label={
                            secProf?.academicStripCard3.label || 'Anti-Junk (QMJ Accrual)'
                          }
                          title={
                            secProf?.academicStripCard3.label ||
                            'Contextual Quality Minus Junk (Asness et al. 2019)'
                          }
                          laymanExplanation={
                            secProf?.regime === 'FINANCIALS'
                              ? 'Pada sektor Perbankan/Financials, OCF/NI & DER korporasi di-bypass otomatis karena struktur DPK dan penyaluran pembiayaan; fokus beralih ke Asset-to-Equity Multiplier.'
                              : 'Mendeteksi selisih laba akuntansi vs arus kas operasi (OCF/NI) secara kontekstual sesuai modul rute aktif.'
                          }
                          practicalGuide="Konversi kas sehat dan leverage terkendali memastikan kualitas laba bebas manipulasi."
                        />
                      </div>
                      <div
                        className={`text-xs sm:text-sm font-mono tabular-nums font-bold mt-1 ${
                          accrualPen === 0 ? 'text-[#0D5C46]' : 'text-[#D97706]'
                        }`}
                      >
                        <div>
                          {secProf?.academicStripCard3.mainVal ||
                            `OCF/NI ${ocfNi.toFixed(2)}x`}
                        </div>
                        <span className="block text-[10px] font-normal text-neutral-500 mt-0.5 leading-snug truncate">
                          {secProf?.academicStripCard3.subVal ||
                            (accrualPen > 0
                              ? `(Penalti Akrual -${accrualPen} pts)`
                              : '(0 Penalti · Kas Sehat)')}
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs flex flex-col justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 whitespace-nowrap overflow-hidden truncate">
                        <MetricTooltip
                          label="Justified PBV & Sizing 1/β"
                          title="Damodaran Justified PBV & Beta-Weighted Position Sizing (Qian 2005 & Taleb 2012)"
                          laymanExplanation="Menampilkan target Justified PBV = (ROE − g) ÷ (Ke − g) beserta batas alokasi maksimum per saham berbasis Inverse Volatility (1/Beta) untuk eksekusi strategi Barbell."
                          practicalGuide="Saham ber-Beta tinggi tetap diizinkan masuk keranjang bila kualitasnya lolos, namun porsi maksimumnya dibatasi otomatis sesuai 1/Beta."
                          align="right"
                        />
                      </div>
                      <div className="text-xs sm:text-sm font-mono tabular-nums font-bold text-[#0284C7] bb-cyan mt-1">
                        <div>PBV Wajar {Number(justPbv).toFixed(2)}x</div>
                        <span className="block text-[10px] font-normal text-neutral-500 mt-0.5 leading-snug truncate">
                          (MoS {joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}
                          {joeliardiEval.marginOfSafetyPct.toFixed(1)}% · Cap 1/β Maks. {(joeliardiEval.maxBarbellCapPct ?? betaCap).toFixed(2)}%)
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
                        {structuredReport.verdictTitle.replace(/^Strong\s+Buy\s*[:—-]\s*/i, '')}
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
                        AI Conviction Score: {finalConvictionScore}/100
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

                {/* 3. Tactical Execution & Position Sizing Strategy Card (Structured Bullet & Key-Value Layout) */}
                {isTypingComplete && (
                  <>
                    <div className="p-4 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-3">
                      <div className="flex items-center justify-between gap-2 border-b border-[#E4E2DD] pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0284C7] bb-cyan">
                          <Target className="w-4 h-4 shrink-0" />
                          <span>Strategi Eksekusi Pra-Beli &amp; Manajemen Risiko Portofolio</span>
                        </div>
                        <span className="text-[10px] font-mono text-neutral-500">
                          Prototipe Eksekusi Institusional (1/β Barbell &amp; 5% ADTV Cap)
                        </span>
                      </div>

                      {(() => {
                        const ex = structuredReport.executionStrategy;
                        const spotIdr = activeStock.lastPrice;
                        const fairIdr = joeliardiEval.intrinsicValueIdr;
                        const mosVal = joeliardiEval.marginOfSafetyPct;
                        const stopPriceIdr =
                          joeliardiEval.riskSizingResult?.stopLossPriceIDR ??
                          Math.round((spotIdr * 0.86) / 5) * 5;
                        const rangeMatch = ex.idealEntryZone.match(/Rp\s*[\d.,]+\s*[–-]\s*Rp\s*[\d.,]+/i);
                        const extractedRange = rangeMatch
                          ? rangeMatch[0]
                          : `Rp ${formatIdrPriceDisplay(Math.round((fairIdr * 0.75) / 5) * 5)} – Rp ${formatIdrPriceDisplay(Math.round((fairIdr * 0.88) / 5) * 5)}`;
                        const stopMatch = ex.InvalidationOrRiskLimit.match(/Rp\s*[\d.,]+/i);
                        const extractedStop = stopMatch
                          ? stopMatch[0]
                          : `Rp ${formatIdrPriceDisplay(stopPriceIdr)}`;
                        const betaProp =
                          activeStock.betaWeightedPropensity ??
                          1 / Math.max(0.45, activeStock.beta1Y);
                        const betaCapPct =
                          joeliardiEval.maxBarbellCapPct ??
                          joeliardiEval.betaWeightedSizingCapPct ??
                          14.0;
                        const t1AllocPct =
                          joeliardiEval.tranche1Pct ??
                          joeliardiEval.riskSizingResult?.tranche1AllocationPct ??
                          Number((betaCapPct * 0.6).toFixed(2));
                        const t2AllocPct =
                          joeliardiEval.tranche2Pct ??
                          joeliardiEval.riskSizingResult?.tranche2AllocationPct ??
                          Number((betaCapPct - t1AllocPct).toFixed(2));
                        const basketLabel =
                          activeStock.beta1Y <= 0.85 ? 'Keranjang 1 (Core Defensif)' : 'Keranjang 2 (Tactical Alpha)';
                        const actionBadge = activeStock.isHscFlagged
                          ? { label: 'AVOID', cls: 'bg-[#E11D48]/15 text-[#9E2A2B] border-[#E11D48]/40' }
                          : joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST'
                          ? { label: 'BUY ON STRENGTH', cls: 'bg-[#059669]/15 text-[#0D5C46] border-[#059669]/40' }
                          : mosVal >= 10
                          ? { label: 'BUY ON WEAKNESS', cls: 'bg-[#059669]/15 text-[#0D5C46] border-[#059669]/40' }
                          : mosVal >= -5
                          ? { label: 'HOLD', cls: 'bg-[#D97706]/15 text-[#D97706] bb-amber border-[#D97706]/40' }
                          : { label: 'WAIT', cls: 'bg-[#D97706]/15 text-[#D97706] bb-amber border-[#D97706]/40' };

                        const zoneStatusBadge = activeStock.isHscFlagged
                          ? { label: 'SPEKULATIF', cls: 'bg-[#E11D48]/15 text-[#9E2A2B] border-[#E11D48]/40' }
                          : ex.isUndercutDeepDiscount || mosVal >= 10
                          ? { label: 'DISKON', cls: 'bg-[#059669]/15 text-[#0D5C46] border-[#059669]/40' }
                          : mosVal >= 0
                          ? { label: 'WAJAR', cls: 'bg-[#0284C7]/15 text-[#0284C7] bb-cyan border-[#0284C7]/40' }
                          : { label: 'PREMIUM', cls: 'bg-[#D97706]/15 text-[#D97706] bb-amber border-[#D97706]/40' };

                        const formattedMaxSafe5PctAdtv =
                          joeliardiEval.decision?.formattedMaxSafe5PctAdtv ??
                          formatAdaptiveIdrValue(joeliardiEval.maxSafeAllocationIdr, '/hr');

                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                            {/* Card 1: Tindakan Utama */}
                            <div className="p-2.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col justify-between space-y-2 min-w-0 overflow-hidden">
                              <div className="space-y-2 min-w-0">
                                <div className="flex items-center justify-between gap-1 border-b border-[#E4E2DD]/80 pb-1.5 min-w-0">
                                  <span className="text-[8.5px] tracking-tight font-bold uppercase text-neutral-500 whitespace-nowrap truncate min-w-0">
                                    1. Tindakan Utama
                                  </span>
                                  <span className={`px-1 py-0.5 text-[7.5px] tracking-tighter font-mono font-bold uppercase border rounded-xs whitespace-nowrap shrink-0 ${actionBadge.cls}`}>
                                    {actionBadge.label}
                                  </span>
                                </div>
                                <div className="font-bold text-[#111315] leading-snug text-[11.5px]">
                                  {(joeliardiEval.primaryExecutionActionLabel || ex.recommendedAction).replace(/^Strong\s+Buy\s*[:—-]\s*/i, '')}
                                </div>
                              </div>
                              <ul className="pt-2 border-t border-[#E4E2DD]/70 space-y-1 text-[10.5px] text-neutral-600">
                                <li className="flex items-start gap-1.5">
                                  <span className="text-[#0D5C46] font-bold">▸</span>
                                  <span>
                                    {activeStock.isHscFlagged
                                      ? 'Jangan alokasikan modal inti pada saham berstatus konsentrasi HSC.'
                                      : joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST'
                                      ? 'Momentum laba/buyback aktif memvalidasi akumulasi bertahap tanpa menunggu diskon dalam.'
                                      : 'Bagi order beli dalam 2 termin (60% Tranche 1 / 40% Tranche 2) untuk mengoptimalkan harga rata-rata.'}
                                  </span>
                                </li>
                              </ul>
                            </div>

                            {/* Card 2: Zona Akumulasi Ideal */}
                            <div className="p-2.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col justify-between space-y-2 min-w-0 overflow-hidden">
                              <div className="space-y-2 min-w-0">
                                <div className="flex items-center justify-between gap-1 border-b border-[#E4E2DD]/80 pb-1.5 min-w-0">
                                  <span className="text-[8.5px] tracking-tight font-bold uppercase text-[#0D5C46] whitespace-nowrap truncate min-w-0">
                                    2. Zona Akumulasi Ideal
                                  </span>
                                  <span className={`px-1 py-0.5 text-[7.5px] tracking-tighter font-mono font-bold uppercase border rounded-xs whitespace-nowrap shrink-0 ${zoneStatusBadge.cls}`}>
                                    {zoneStatusBadge.label}
                                  </span>
                                </div>

                                <div className="space-y-1.5 font-mono tabular-nums text-[9.5px] bg-[#FFFFFF] p-2 rounded-xs border border-[#E4E2DD]/80">
                                  <div className="flex items-center justify-between gap-1 whitespace-nowrap">
                                    <span className="text-neutral-500 text-[9px] shrink-0">Rentang Ideal:</span>
                                    <strong className="text-[#0D5C46] text-[9.5px] shrink-0">{extractedRange}</strong>
                                  </div>
                                  <div className="flex items-center justify-between gap-1 whitespace-nowrap">
                                    <span className="text-neutral-500 text-[9px] shrink-0">Nilai Wajar:</span>
                                    <strong className="text-[#111315] text-[9.5px] shrink-0">Rp {formatIdrPriceDisplay(fairIdr)}</strong>
                                  </div>
                                  <div className="flex items-center justify-between gap-1 whitespace-nowrap">
                                    <span className="text-neutral-500 text-[9px] shrink-0">Margin of Safety (MoS):</span>
                                    <strong className={`text-[9.5px] shrink-0 ${mosVal >= 0 ? 'text-[#0D5C46]' : 'text-[#D97706] bb-amber'}`}>
                                      {mosVal >= 0 ? `+${mosVal.toFixed(1)}%` : `${mosVal.toFixed(1)}%`} (Spot Rp {formatIdrPriceDisplay(spotIdr)})
                                    </strong>
                                  </div>
                                </div>
                              </div>

                              <p className="text-[10.5px] text-neutral-600 leading-snug pt-1">
                                {mosVal >= 10
                                  ? `Harga spot saat ini ${mosVal.toFixed(1)}% di bawah Nilai Wajar; sangat ideal untuk akumulasi bertahap.`
                                  : mosVal >= 0
                                  ? `Harga spot masih berdiskon +${mosVal.toFixed(1)}% terhadap Nilai Wajar; utamakan antre beli di rentang ideal.`
                                  : `Harga spot ${Math.abs(mosVal).toFixed(1)}% di atas Nilai Wajar; disiplin antre pada area support akumulasi.`}
                              </p>
                            </div>

                            {/* Card 3: Dual Stop Loss (ATR/Vol Stop + Tranche Fundamental Invalidation) */}
                            <div className="p-2.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col justify-between space-y-2 min-w-0 overflow-hidden">
                              <div className="space-y-2 min-w-0">
                                <div className="flex items-center justify-between gap-1 border-b border-[#E4E2DD]/80 pb-1.5 min-w-0">
                                  <span className="text-[8.5px] tracking-tight font-bold uppercase text-[#9E2A2B] whitespace-nowrap truncate min-w-0">
                                    3. Dual Stop Loss (ATR/Vol &amp; Tranche)
                                  </span>
                                  <span className="px-1 py-0.5 text-[7.5px] tracking-tighter font-mono font-bold uppercase bg-[#E11D48]/15 text-[#9E2A2B] border border-[#E11D48]/40 rounded-xs whitespace-nowrap shrink-0">
                                    STOP &lt; Rp {formatIdrPriceDisplay(joeliardiEval.riskSizingResult?.stopLossPriceIDR ?? stopPriceIdr)}
                                  </span>
                                </div>

                                <ul className="space-y-1.5 text-[10.5px] text-neutral-700 leading-snug">
                                  <li className="flex items-start gap-1.5">
                                    <span className="text-[#9E2A2B] font-bold">▸</span>
                                    <span>
                                      <strong className="text-[#9E2A2B]">ATR/Vol Stop (12%–18%):</strong>{' '}
                                      <strong className="font-mono text-[#9E2A2B]">
                                        Rp {formatIdrPriceDisplay(joeliardiEval.riskSizingResult?.stopLossPriceIDR ?? stopPriceIdr)} (-{joeliardiEval.riskSizingResult?.stopLossPct ?? 12}%)
                                      </strong>{' '}
                                      (max[2.5xATR20, 1.5xVol_m]).
                                    </span>
                                  </li>
                                  <li className="flex items-start gap-1.5">
                                    <span className="text-[#9E2A2B] font-bold">▸</span>
                                    <span>
                                      <strong className="text-[#111315]">Tranche &amp; Invalidation Stop:</strong>{' '}
                                      T1 ({t1AllocPct.toFixed(2)}%) · T2 ({t2AllocPct.toFixed(2)}%) · Floor G-J Stop:{' '}
                                      <strong className="font-mono text-[#9E2A2B]">
                                        Rp {formatIdrPriceDisplay(joeliardiEval.grahamJoeliardiBenchmarkIdr ?? stopPriceIdr)}
                                      </strong>
                                      .
                                    </span>
                                  </li>
                                  <li className="flex items-start gap-1.5">
                                    <span className="text-[#9E2A2B] font-bold">▸</span>
                                    <span>
                                      <strong className="text-[#111315]">Trigger Moat &amp; Kas:</strong>{' '}
                                      Cut jika <strong className="font-mono">GP/A &lt; 10%</strong> atau{' '}
                                      <strong className="font-mono">OCF/NI &lt; 0,65x</strong> ({extractedStop}).
                                    </span>
                                  </li>
                                </ul>
                              </div>
                            </div>

                            {/* Card 4: Volatility-Targeted Barbell Sizing & Batas ADTV */}
                            <div className="p-2.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col justify-between space-y-2 min-w-0 overflow-hidden">
                              <div className="space-y-2 min-w-0">
                                <div className="flex items-center justify-between gap-1 border-b border-[#E4E2DD]/80 pb-1.5 min-w-0">
                                  <span className="text-[8.5px] tracking-tight font-bold uppercase text-[#0284C7] bb-cyan whitespace-nowrap truncate min-w-0">
                                    4. Vol-Targeted Barbell &amp; ADTV
                                  </span>
                                  <span className="px-1 py-0.5 text-[7.5px] tracking-tighter font-mono font-bold uppercase bg-[#0284C7]/15 text-[#0284C7] bb-cyan border border-[#0284C7]/40 rounded-xs whitespace-nowrap shrink-0">
                                    Maks. {betaCapPct.toFixed(2)}%
                                  </span>
                                </div>

                                <div className="space-y-1.5 font-mono tabular-nums text-[9.5px] bg-[#FFFFFF] p-2 rounded-xs border border-[#E4E2DD]/80">
                                  <div className="flex items-center justify-between gap-1 whitespace-nowrap">
                                    <span className="text-neutral-500 text-[9px] shrink-0">Alokasi:</span>
                                    <strong className="text-[#111315] text-[9px] tracking-tight shrink-0">{basketLabel}</strong>
                                  </div>
                                  <div className="flex items-center justify-between gap-1 whitespace-nowrap">
                                    <span className="text-neutral-500 text-[9px] shrink-0">T1 (60%) + T2 (40%):</span>
                                    <strong className="text-[#0284C7] bb-cyan text-[9px] tracking-tight shrink-0">
                                      {t1AllocPct.toFixed(2)}% + {t2AllocPct.toFixed(2)}% = {betaCapPct.toFixed(2)}%
                                    </strong>
                                  </div>
                                  <div className="flex items-center justify-between gap-1 whitespace-nowrap">
                                    <span className="text-neutral-500 text-[9px] shrink-0">5% ADTV 20D:</span>
                                    <strong className="text-[#0D5C46] text-[9.5px] shrink-0">
                                      Maks. {formattedMaxSafe5PctAdtv}
                                    </strong>
                                  </div>
                                </div>
                              </div>

                              {ex.liquidityWarningBadge && (
                                <div
                                  className={`p-1.5 rounded-xs border text-[9.5px] font-mono font-bold leading-snug ${
                                    ex.isLiquidityCapped
                                      ? 'bg-[#F59E0B]/15 text-[#B45309] border-[#F59E0B]/50'
                                      : 'bg-[#059669]/10 text-[#0D5C46] border-[#059669]/35'
                                  }`}
                                >
                                  {ex.liquidityWarningBadge}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
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

          {/* Mandatory P2.4 Raw Data Audit Strip Footer */}
          {joeliardiEval.rawTickerData && joeliardiEval.sanityReport && (
            <RawDataAuditStrip
              rawTickerData={joeliardiEval.rawTickerData}
              sanityReport={joeliardiEval.sanityReport}
              valuationResult={joeliardiEval.valuationResult}
              tacticalOverlay={joeliardiEval.tacticalOverlay}
              riskSizingResult={joeliardiEval.riskSizingResult}
              dataLineage={joeliardiEval.dataLineage}
              onAutoSyncSharesMarketCap={handleAutoSyncP0Sanity}
              onOpenCalibrator={() => setActiveToolPanel('CALIBRATION')}
              onOpenLineageDrawer={() =>
                setActiveToolPanel((prev) =>
                  prev === 'FORENSIC_LINEAGE' ? 'NONE' : 'FORENSIC_LINEAGE'
                )
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
