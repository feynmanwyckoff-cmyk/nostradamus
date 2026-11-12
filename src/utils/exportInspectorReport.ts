import {
  EmitenNewsCategory,
  JoeliardiOosEvaluation,
  MarketRegimeStatus,
  NewsSentimentItem,
  StockMetrics,
  StructuredAiConvictionReport
} from '../types/quant';
import {
  formatKseiFootnoteFullDescription,
  formatKseiFootnoteShortLabel
} from '../data/idxKseiHscRegistry';
import { formatIdrPriceDisplay } from './numberFormat';

export interface InspectorExportPayload {
  stock: StockMetrics;
  joeliardiEval: JoeliardiOosEvaluation;
  structuredReport: StructuredAiConvictionReport | null;
  recentNews: NewsSentimentItem[];
  regimeStatus: MarketRegimeStatus;
}

interface RichWordToken {
  word: string;
  style: 'normal' | 'bold' | 'verdict';
}

const VERDICT_TERMS = [
  'STRONG BUY: ANOMALI ASET DEFENSIF TERDISKON',
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

const METRIC_LABELS = [
  'Implied Target Wajar PER',
  'Implied PER',
  'Wajar PER',
  'Fair PER',
  'PER',
  'Justified PBV',
  'PBV Wajar',
  'Implied PBV',
  'Wajar PBV',
  'Fair PBV',
  'PBV',
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
  'margin usaha',
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
  'Nilai Wajar'
];

/**
 * Formats print timestamp in full Indonesian format, e.g.:
 * "Kamis, 12 November 2026 pukul 09:15 WIB"
 */
export function formatIndonesianPrintTimestamp(date: Date = new Date()): string {
  try {
    const datePart = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta'
    }).format(date);
    const timePart = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta'
    })
      .format(date)
      .replace('.', ':');
    return `${datePart} pukul ${timePart} WIB`;
  } catch {
    return `${date.toLocaleDateString('id-ID')} WIB`;
  }
}

/**
 * Draws single-line text that automatically shrinks its font size down to `minFontSize`
 * if the measured width exceeds `maxWidth`, preventing text from clipping or overflowing card borders.
 */
function drawTextAutoFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  weight: number | string,
  initialFontSize: number,
  minFontSize = 8.0,
  fontFamily = 'Montserrat, sans-serif'
): void {
  let fontSize = initialFontSize;
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  while (ctx.measureText(text).width > maxWidth && fontSize > minFontSize) {
    fontSize = Number((fontSize - 0.25).toFixed(2));
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  }
  ctx.fillText(text, x, y);
}

function getExportNewsCategoryStyle(cat?: EmitenNewsCategory): {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
} {
  switch (cat) {
    case 'DIVIDEN_RUPS':
      return {
        label: 'DIVIDEN & RUPS',
        textColor: '#34D399',
        bgColor: 'rgba(16, 185, 129, 0.14)',
        borderColor: 'rgba(16, 185, 129, 0.45)'
      };
    case 'CORPORATE_ACTION_MA':
      return {
        label: 'CORPORATE ACTION / M&A',
        textColor: '#38BDF8',
        bgColor: 'rgba(56, 189, 248, 0.14)',
        borderColor: 'rgba(56, 189, 248, 0.45)'
      };
    case 'FINANCIAL_EARNINGS':
      return {
        label: 'KINERJA KEUANGAN',
        textColor: '#FBBF24',
        bgColor: 'rgba(245, 158, 11, 0.14)',
        borderColor: 'rgba(245, 158, 11, 0.45)'
      };
    case 'REGULATORY_UMA_ISSUE':
      return {
        label: 'ISU REGULASI / UMA / HSC',
        textColor: '#FB7185',
        bgColor: 'rgba(244, 63, 94, 0.15)',
        borderColor: 'rgba(244, 63, 94, 0.45)'
      };
    default:
      return {
        label: 'BERITA EMITEN (≤ 3 BULAN)',
        textColor: '#D1D5DB',
        bgColor: 'rgba(156, 163, 175, 0.12)',
        borderColor: 'rgba(156, 163, 175, 0.35)'
      };
  }
}

function tokenizeFinancialNarrative(text: string, ticker?: string): RichWordToken[] {
  const cleanedText = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleanedText) return [];

  const cleanTicker = (ticker || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  const patternParts: string[] = [
    `\\b(?:${VERDICT_TERMS.join('|')})\\b`,
    `\\b(?:${METRIC_LABELS.join('|')})\\s*~?(?:Rp\\s*)?[+-]?\\d+(?:[.,]\\d+)?(?:%|x|\\/100|\\/10|\\/saham)?`,
    `~?Rp\\s*\\d+(?:[.,]\\d+)*(?:\\/saham)?`,
    `[+-]?\\d+(?:[.,]\\d+)?(?:%|x|\\b\\/100\\b|\\b\\/10\\b)`
  ];

  if (cleanTicker.length >= 4) {
    patternParts.push(`\\b${cleanTicker}\\b`);
  }

  const masterRegex = new RegExp(`(${patternParts.join('|')})`, 'g');
  const segments = cleanedText.split(masterRegex);

  const tokens: RichWordToken[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;

    const isMatched = i % 2 === 1;
    let style: 'normal' | 'bold' | 'verdict' = 'normal';
    if (isMatched) {
      const upper = seg.trim().toUpperCase();
      style = VERDICT_TERMS.some((v) => v === upper) ? 'verdict' : 'bold';
    }

    const words = seg.split(/\s+/).filter(Boolean);
    for (const w of words) {
      tokens.push({ word: w, style });
    }
  }

  return tokens;
}

function wrapRichTokens(
  ctx: CanvasRenderingContext2D,
  tokens: RichWordToken[],
  maxWidth: number,
  fontSizePx: number
): RichWordToken[][] {
  if (tokens.length === 0) return [];
  const lines: RichWordToken[][] = [];
  let currentLine: RichWordToken[] = [];
  let currentWidth = 0;

  ctx.font = `500 ${fontSizePx}px Montserrat, sans-serif`;
  const spaceW = ctx.measureText(' ').width;

  for (const token of tokens) {
    ctx.font = `${token.style === 'normal' ? '500' : '700'} ${fontSizePx}px Montserrat, sans-serif`;
    const wordW = ctx.measureText(token.word).width;
    const neededW = currentLine.length > 0 ? spaceW + wordW : wordW;

    if (currentWidth + neededW > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [token];
      currentWidth = wordW;
    } else {
      currentLine.push(token);
      currentWidth += neededW;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

function drawRichTokenLines(
  ctx: CanvasRenderingContext2D,
  lines: RichWordToken[][],
  startX: number,
  startY: number,
  lineHeight: number,
  fontSizePx: number,
  normalColor = '#D1D5DB',
  boldColor = '#F9FAFB',
  verdictColor = '#F59E0B'
): number {
  ctx.font = `500 ${fontSizePx}px Montserrat, sans-serif`;
  const spaceW = ctx.measureText(' ').width;

  lines.forEach((lineTokens, rowIdx) => {
    let curX = startX;
    const y = startY + rowIdx * lineHeight;

    lineTokens.forEach((tok, tokIdx) => {
      const isNormal = tok.style === 'normal';
      const isVerdict = tok.style === 'verdict';
      ctx.font = `${isNormal ? '500' : '700'} ${fontSizePx}px Montserrat, sans-serif`;
      ctx.fillStyle = isVerdict ? verdictColor : isNormal ? normalColor : boldColor;

      ctx.fillText(tok.word, curX, y);
      const wordW = ctx.measureText(tok.word).width;

      if (isVerdict) {
        const nextIsVerdict =
          tokIdx + 1 < lineTokens.length && lineTokens[tokIdx + 1].style === 'verdict';
        const underlineW = nextIsVerdict ? wordW + spaceW : wordW;
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(curX, y + 3);
        ctx.lineTo(curX + underlineW, y + 3);
        ctx.stroke();
        ctx.restore();
      }

      curX += wordW + spaceW;
    });
  });

  return startY + lines.length * lineHeight;
}

function splitExportCoTStep(stepText: string, index: number): {
  header: string;
  body: string;
  conclusion: string | null;
} {
  const cleaned = String(stepText || '').trim();
  const colonIdx = cleaned.indexOf(':');
  const header =
    colonIdx > 0 && colonIdx <= 68
      ? cleaned.slice(0, colonIdx + 1).trim()
      : `0${index + 1}. Analisis Faktor:`;
  const remainder =
    colonIdx > 0 && colonIdx <= 68 ? cleaned.slice(colonIdx + 1).trim() : cleaned;

  const arrowMatch = remainder.match(/([\s\S]*?)\s*(?:->|→)\s*([\s\S]+)$/);
  if (arrowMatch) {
    return {
      header,
      body: arrowMatch[1].trim(),
      conclusion: arrowMatch[2].trim()
    };
  }
  return {
    header,
    body: remainder,
    conclusion: null
  };
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [''];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Draws the official Nostradamus 8-Point Mariner's Compass Rose emblem onto a 2D canvas
 * inside the top-left header box, vertically centered with the header typography.
 */
function drawNostradamusCompassLogo(
  ctx: CanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxSize: number
) {
  // Subtle rounded container frame
  drawRoundedRect(ctx, boxX, boxY, boxSize, boxSize, 6);
  ctx.fillStyle = '#151C28';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.save();
  // Map 64x64 coordinate space from NostradamusLogo.tsx into the target box
  const scale = (boxSize - 4) / 64;
  ctx.translate(boxX + 2, boxY + 2);
  ctx.scale(scale, scale);

  // 1. Outer Astrolabe Brass Bezel Ring
  ctx.beginPath();
  ctx.arc(32, 32, 29, 0, Math.PI * 2);
  ctx.fillStyle = '#0F1520';
  ctx.fill();
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // 2. Inner Degree Ring (Dashed)
  ctx.save();
  ctx.beginPath();
  ctx.arc(32, 32, 23, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.stroke();
  ctx.restore();

  // 3. Intercardinal 4-Point Star (NE, SE, SW, NW)
  const drawPoly = (pts: [number, number][], fill: string, stroke?: string, lw = 0.6) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  };

  drawPoly(
    [
      [32, 26],
      [47, 17],
      [38, 32],
      [47, 47],
      [32, 38],
      [17, 47],
      [26, 32],
      [17, 17]
    ],
    'rgba(56, 189, 248, 0.25)',
    '#38BDF8',
    1.1
  );

  // 4. Primary 4-Point Cardinal Compass Needles (Two-tone 3D bevels)
  // North Needle
  drawPoly([[32, 4], [32, 32], [26.5, 26.5]], '#FDE68A');
  drawPoly([[32, 4], [37.5, 26.5], [32, 32]], '#D97706');
  // South Needle
  drawPoly([[32, 60], [32, 32], [37.5, 37.5]], '#FBBF24');
  drawPoly([[32, 60], [26.5, 37.5], [32, 32]], '#92400E');
  // East Needle
  drawPoly([[60, 32], [32, 32], [37.5, 26.5]], '#FDE68A');
  drawPoly([[60, 32], [37.5, 37.5], [32, 32]], '#B45309');
  // West Needle
  drawPoly([[4, 32], [32, 32], [26.5, 37.5]], '#FBBF24');
  drawPoly([[4, 32], [26.5, 26.5], [32, 32]], '#92400E');

  // 5. Center Quant Core Pivot
  ctx.beginPath();
  ctx.arc(32, 32, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = '#11161F';
  ctx.fill();
  ctx.strokeStyle = '#FDE68A';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(32, 32, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = '#10B981';
  ctx.fill();

  ctx.restore();
}

/**
 * Draws the small 3-layer stack icon next to ALUR PENALARAN KUANTITATIF-FUNDAMENTAL
 */
function drawLayersIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';

  // Top diamond
  ctx.beginPath();
  ctx.moveTo(x + 6, y);
  ctx.lineTo(x + 12, y + 3.2);
  ctx.lineTo(x + 6, y + 6.4);
  ctx.lineTo(x, y + 3.2);
  ctx.closePath();
  ctx.stroke();

  // Middle chevron
  ctx.beginPath();
  ctx.moveTo(x, y + 6.4);
  ctx.lineTo(x + 6, y + 9.6);
  ctx.lineTo(x + 12, y + 6.4);
  ctx.stroke();

  // Bottom chevron
  ctx.beginPath();
  ctx.moveTo(x, y + 9.6);
  ctx.lineTo(x + 6, y + 12.8);
  ctx.lineTo(x + 12, y + 9.6);
  ctx.stroke();

  ctx.restore();
}

/**
 * Normalizes any legacy accumulation zone text so it always uses a clear range, fair value,
 * and explicit valuation status (TERDISKON / MURAH, WAJAR, or MAHAL / PREMIUM).
 */
function normalizeExportAccumulationZone(
  rawZone: string,
  stock: StockMetrics,
  joeliardiEval: JoeliardiOosEvaluation
): string {
  if (!rawZone || /di bawah batas akumulasi|UNDERCUT \/ DEEP DISCOUNT:/i.test(rawZone)) {
    if (stock.isHscFlagged) {
      return 'Tidak direkomendasikan (Blokir HSC — risiko spekulasi tinggi)';
    }
    const intrinsicCeiling = Math.round((joeliardiEval.intrinsicValueIdr * 0.85) / 5) * 5;
    const isDeepDiscount = stock.lastPrice <= intrinsicCeiling;
    const lowPrice = isDeepDiscount
      ? Math.round((stock.lastPrice * 0.96) / 5) * 5
      : Math.round((Math.min(stock.lastPrice * 0.98, intrinsicCeiling * 0.96)) / 5) * 5;
    const highPrice = isDeepDiscount
      ? intrinsicCeiling
      : Math.round((Math.min(stock.lastPrice, intrinsicCeiling)) / 5) * 5;
    const rLow = Math.min(lowPrice, highPrice);
    const rHigh = Math.max(lowPrice, highPrice);

    if (isDeepDiscount) {
      return `Rentang Beli Ideal: Rp ${rLow.toLocaleString('id-ID')} – Rp ${rHigh.toLocaleString('id-ID')} | Nilai Wajar: Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${stock.lastPrice.toLocaleString('id-ID')}): TERDISKON / MURAH (Harga saat ini ${joeliardiEval.marginOfSafetyPct.toFixed(1)}% di bawah Nilai Wajar, sangat wajar untuk akumulasi bertahap)`;
    }
    if (joeliardiEval.marginOfSafetyPct >= 0) {
      return `Rentang Beli Ideal: Rp ${rLow.toLocaleString('id-ID')} – Rp ${rHigh.toLocaleString('id-ID')} | Nilai Wajar: Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${stock.lastPrice.toLocaleString('id-ID')}): WAJAR (Harga saat ini masih di bawah Nilai Wajar dengan diskon +${joeliardiEval.marginOfSafetyPct.toFixed(1)}%, idealnya cicil beli di rentang akumulasi)`;
    }
    const pullbackLow = Math.round((joeliardiEval.intrinsicValueIdr * 0.8) / 5) * 5;
    return `Rentang Beli Ideal: Rp ${pullbackLow.toLocaleString('id-ID')} – Rp ${intrinsicCeiling.toLocaleString('id-ID')} | Nilai Wajar: Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')} — Status Harga Spot (Rp ${stock.lastPrice.toLocaleString('id-ID')}): MAHAL / PREMIUM (Harga saat ini ${Math.abs(joeliardiEval.marginOfSafetyPct).toFixed(1)}% di atas Nilai Wajar, tunggu koreksi ke rentang beli ideal)`;
  }
  return rawZone;
}

/**
 * Renders the full Emiten Fundamental & Nostradamus Inspection Report onto a 2x Retina HD Canvas
 * with official Nostradamus Quant Terminal watermarks (diagonal + header + footer).
 */
export function renderInspectorReportCanvas(
  payload: InspectorExportPayload
): HTMLCanvasElement {
  const { stock, joeliardiEval, structuredReport, recentNews, regimeStatus } = payload;

  const LOGICAL_WIDTH = 1200;
  const SCALE = 2; // 2400px Ultra-HD Retina resolution

  const scratch = document.createElement('canvas');
  const sCtx = scratch.getContext('2d')!;

  const rawSummaryText =
    structuredReport?.directAnswerSummary ||
    `Hasil Analisis Nostradamus: Di harga Rp ${formatIdrPriceDisplay(stock.lastPrice)}, ${stock.ticker} memiliki Nilai Intrinsik Wajar Rp ${formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)} (MoS ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}%) dengan Skor Keyakinan ${joeliardiEval.totalConvictionScore}/100.`;

  const summaryHeaderMatch = rawSummaryText.match(
    /^((?:Hasil|Kesimpulan|Keputusan|Evaluasi|Audit)\s+[^:]{3,75}):\s*([\s\S]*)$/i
  );
  const matchedHeaderUpper = summaryHeaderMatch
    ? summaryHeaderMatch[1].trim().toUpperCase()
    : 'HASIL ANALISIS NOSTRADAMUS';
  const summaryBoxHeader =
    matchedHeaderUpper === 'HASIL ANALISIS KOMITE INVESTASI'
      ? 'HASIL ANALISIS NOSTRADAMUS'
      : matchedHeaderUpper;
  const summaryBodyText = summaryHeaderMatch
    ? summaryHeaderMatch[2].trim()
    : rawSummaryText.trim();

  // Pre-wrap rich narrative tokens for the main summary
  const summaryRichTokens = tokenizeFinancialNarrative(summaryBodyText, stock.ticker);
  const summaryRichLines = wrapRichTokens(
    sCtx,
    summaryRichTokens,
    LOGICAL_WIDTH - 116,
    13
  );
  const summaryLineH = 22;

  // Pre-parse and measure 4 Chain-of-Thought cards
  const cotSteps = structuredReport?.chainOfThoughtSteps || [];
  const halfCotW = (LOGICAL_WIDTH - 126) / 2;

  const parsedCotCards = cotSteps.map((stepStr, idx) => {
    const parsed = splitExportCoTStep(stepStr, idx);
    const bodyTokens = tokenizeFinancialNarrative(parsed.body, stock.ticker);
    const bodyLines = wrapRichTokens(sCtx, bodyTokens, halfCotW - 28, 11.5);
    sCtx.font = '700 11.5px Montserrat, sans-serif';
    const conclusionLines = parsed.conclusion
      ? wrapCanvasText(sCtx, `→ ${parsed.conclusion}`, halfCotW - 28)
      : [];
    const cardContentH =
      46 +
      bodyLines.length * 18 +
      (conclusionLines.length > 0 ? 8 + conclusionLines.length * 17 : 0) +
      14;
    return {
      ...parsed,
      bodyLines,
      conclusionLines,
      cardContentH: Math.max(106, cardContentH)
    };
  });

  // Compute row heights for the 2-column CoT grid
  const cotRowHeights: number[] = [];
  for (let r = 0; r < Math.ceil(parsedCotCards.length / 2); r++) {
    const leftCard = parsedCotCards[r * 2];
    const rightCard = parsedCotCards[r * 2 + 1];
    const rowH = Math.max(
      leftCard ? leftCard.cardContentH : 106,
      rightCard ? rightCard.cardContentH : 106
    );
    cotRowHeights.push(rowH);
  }
  const totalCotGridH =
    cotRowHeights.reduce((acc, h) => acc + h, 0) +
    Math.max(0, cotRowHeights.length - 1) * 12;

  // Pre-measure Execution Strategy 4 cards so no text is ever cut off
  const ex = structuredReport?.executionStrategy;
  const exW = (LOGICAL_WIDTH - 112 - 12 * 3) / 4;
  let exCardH = 0;
  const exCols = ex
    ? [
        { label: 'TINDAKAN UTAMA', val: ex.recommendedAction, color: '#F3F4F6' },
        {
          label: 'ZONA AKUMULASI IDEAL',
          val: normalizeExportAccumulationZone(ex.idealEntryZone, stock, joeliardiEval),
          color: '#34D399'
        },
        {
          label: 'BATAS RISIKO / INVALIDATION',
          val: ex.InvalidationOrRiskLimit,
          color: '#FB7185'
        },
        {
          label: 'PANDUAN PORSI KERANJANG & ADTV',
          val: ex.liquidityWarningBadge
            ? `${ex.portfolioAllocationGuide} — ${ex.liquidityWarningBadge}`
            : ex.portfolioAllocationGuide,
          color: ex.isLiquidityCapped ? '#FBBF24' : '#38BDF8'
        }
      ].map((col) => {
        sCtx.font = '600 10.5px Montserrat, sans-serif';
        const wrapped = wrapCanvasText(sCtx, col.val, exW - 22);
        return { ...col, wrapped };
      })
    : [];

  if (exCols.length > 0) {
    const maxExLines = Math.max(...exCols.map((c) => c.wrapped.length));
    exCardH = Math.max(86, 36 + maxExLines * 15.5 + 12);
  }

  // Measure verdictTitle wrapping
  const verdictBadge = structuredReport?.verdictBadge || joeliardiEval.convictionGrade;
  const verdictTitle =
    structuredReport?.verdictTitle ||
    `Evaluasi Fundamental & Kuantitatif OOS untuk ${stock.ticker}`;
  sCtx.font = '800 15px Montserrat, sans-serif';
  const verdictTitleLines = wrapCanvasText(sCtx, verdictTitle, LOGICAL_WIDTH - 116);

  const aiBoxH =
    66 +
    verdictTitleLines.length * 21 +
    24 + // AI Conviction Score line
    44 + // Boxed header
    summaryRichLines.length * summaryLineH +
    (parsedCotCards.length > 0 ? 48 + totalCotGridH : 0) +
    (exCols.length > 0 ? 18 + exCardH : 0) +
    24;

  // Pre-measure ALL recentNews items (with category badge, full title, summary snippet & sector footer)
  const allNews = recentNews;
  const newsColW = (LOGICAL_WIDTH - 76 - 14) / 2;
  const preparedNewsCards = allNews.map((item) => {
    const catStyle = getExportNewsCategoryStyle(item.emitenCategory);
    sCtx.font = '700 11.5px Montserrat, sans-serif';
    const titleLines = wrapCanvasText(sCtx, item.title || '', newsColW - 26).slice(0, 2);

    sCtx.font = '500 10px Montserrat, sans-serif';
    const rawSnippet = String(item.summary || '').trim();
    const snippetLines = rawSnippet
      ? wrapCanvasText(sCtx, rawSnippet, newsColW - 26).slice(0, 3)
      : [];

    const cardH =
      36 + // Top category badge & source/date row
      titleLines.length * 16 +
      (snippetLines.length > 0 ? 6 + snippetLines.length * 14.5 : 0) +
      32; // Bottom divider & sector/source row

    return {
      item,
      catStyle,
      titleLines,
      snippetLines,
      cardH: Math.max(108, cardH)
    };
  });

  const newsRowHeights: number[] = [];
  for (let r = 0; r < Math.ceil(preparedNewsCards.length / 2); r++) {
    const leftCard = preparedNewsCards[r * 2];
    const rightCard = preparedNewsCards[r * 2 + 1];
    const rowH = Math.max(
      leftCard ? leftCard.cardH : 108,
      rightCard ? rightCard.cardH : 108
    );
    newsRowHeights.push(rowH);
  }

  const totalNewsSectionH =
    preparedNewsCards.length > 0
      ? 32 +
        newsRowHeights.reduce((acc, h) => acc + h, 0) +
        Math.max(0, newsRowHeights.length - 1) * 12 +
        14
      : 0;

  const hasHscBanner = Boolean(stock.isHscFlagged || stock.hscSource === 'KSEI_OFFICIAL');

  const LOGICAL_HEIGHT =
    128 +
    (hasHscBanner ? 68 : 0) +
    102 +
    132 +
    80 + // Row 3 Academic Strip (slightly taller for clean 2-line / fitted metrics)
    aiBoxH +
    18 +
    totalNewsSectionH +
    72;

  const canvas = document.createElement('canvas');
  canvas.width = LOGICAL_WIDTH * SCALE;
  canvas.height = LOGICAL_HEIGHT * SCALE;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // 1. Dark Institutional Background
  ctx.fillStyle = '#0B0F17';
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  // 2. Diagonal Repeating Background Pattern ("NOSTRADAMUS QUANT TERMINAL")
  ctx.save();
  ctx.translate(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
  ctx.rotate((-24 * Math.PI) / 180);
  ctx.font = '800 34px Montserrat, sans-serif';
  ctx.fillStyle = 'rgba(245, 158, 11, 0.038)';
  ctx.textAlign = 'center';
  for (let wy = -LOGICAL_HEIGHT; wy <= LOGICAL_HEIGHT; wy += 190) {
    for (let wx = -LOGICAL_WIDTH; wx <= LOGICAL_WIDTH; wx += 620) {
      ctx.fillText('NOSTRADAMUS QUANT TERMINAL', wx, wy);
    }
  }
  ctx.restore();

  // Outer Frame Border
  ctx.strokeStyle = '#222C3C';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, LOGICAL_WIDTH - 32, LOGICAL_HEIGHT - 32);

  // 3. Top Header Banner (y = 17..109, vertical center = 63)
  ctx.fillStyle = '#11161F';
  ctx.fillRect(17, 17, LOGICAL_WIDTH - 34, 92);
  ctx.strokeStyle = '#222C3C';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(17, 109);
  ctx.lineTo(LOGICAL_WIDTH - 17, 109);
  ctx.stroke();

  // Nostradamus Mariner's Compass Rose Logo in Header — Vertically Centered (y = 36..90, midpoint = 63)
  drawNostradamusCompassLogo(ctx, 36, 36, 54);

  // Shortened Kicker ("NOSTRADAMUS QUANT TERMINAL")
  const headerTextX = 104;
  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 11px Montserrat, sans-serif';
  ctx.fillText('NOSTRADAMUS QUANT TERMINAL', headerTextX, 43);

  // Main Emiten Title (Vertically aligned with logo center)
  ctx.fillStyle = '#F9FAFB';
  ctx.font = '800 22px Montserrat, sans-serif';
  ctx.fillText(`${stock.ticker} · ${stock.name}`, headerTextX, 69);

  // Subtitle with "Tren IHSG" and full Indonesian print date ("Kamis, 12 November 2026 pukul 09:15 WIB")
  ctx.fillStyle = '#9CA3AF';
  const subtitleText = `Sektor IDX-IC: ${stock.sector}   |   Tren IHSG: ${regimeStatus}   |   Dicetak: ${formatIndonesianPrintTimestamp()}`;
  drawTextAutoFit(ctx, subtitleText, headerTextX, 91, LOGICAL_WIDTH - headerTextX - 40, 600, 11.5, 9.0);

  // Right Grade Badge in Header (Vertically centered in header bar at y = 47..79, midpoint = 63)
  const gradeText = `${joeliardiEval.convictionGrade} · SKOR ${joeliardiEval.totalConvictionScore}/100`;
  ctx.font = '700 12px Montserrat, sans-serif';
  const gradeW = ctx.measureText(gradeText).width + 28;
  const gradeX = LOGICAL_WIDTH - 38 - gradeW;
  const gradeY = 47;
  drawRoundedRect(ctx, gradeX, gradeY, gradeW, 32, 4);
  ctx.fillStyle = stock.isHscFlagged
    ? 'rgba(225, 29, 72, 0.2)'
    : joeliardiEval.totalConvictionScore >= 72
    ? 'rgba(16, 185, 129, 0.18)'
    : 'rgba(245, 158, 11, 0.18)';
  ctx.fill();
  ctx.strokeStyle = stock.isHscFlagged
    ? '#F43F5E'
    : joeliardiEval.totalConvictionScore >= 72
    ? '#10B981'
    : '#F59E0B';
  ctx.stroke();
  ctx.fillStyle = stock.isHscFlagged
    ? '#FB7185'
    : joeliardiEval.totalConvictionScore >= 72
    ? '#34D399'
    : '#FBBF24';
  ctx.fillText(gradeText, gradeX + 14, gradeY + 20);

  let curY = 128;

  // 4. Optional HSC Alert Box (Supports Official KSEI HSC Dividend Penalty, KSEI Hard Block & Quant Suspect HSC)
  if (hasHscBanner) {
    const isDivPenalty = stock.hscTier === 'KSEI_DIVIDEND_PENALTY';
    drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, 54, 4);
    ctx.fillStyle = isDivPenalty
      ? 'rgba(245, 158, 11, 0.13)'
      : 'rgba(225, 29, 72, 0.12)';
    ctx.fill();
    ctx.strokeStyle = isDivPenalty
      ? 'rgba(245, 158, 11, 0.55)'
      : 'rgba(244, 63, 94, 0.45)';
    ctx.stroke();

    ctx.fillStyle = isDivPenalty ? '#FBBF24' : '#FB7185';
    const kseiPctText = stock.kseiHscConcentrationPct
      ? `${stock.kseiHscConcentrationPct.toFixed(3).replace('.', ',')}%`
      : '';
    const kseiNewTag = stock.kseiHscIsNew ? 'BARU (11 Nov 2026)' : 'Eksisting';
    const kseiFnText =
      stock.kseiHscFootnote && stock.kseiHscFootnote !== 'NONE'
        ? ` · ${formatKseiFootnoteFullDescription(stock.kseiHscFootnote)}`
        : '';

    const bannerHeader =
      stock.hscSource === 'KSEI_OFFICIAL' && isDivPenalty
        ? `DAFTAR RESMI HSC BEI–KSEI (KEPEMILIKAN TOP-10: ${kseiPctText} · STATUS: ${kseiNewTag.toUpperCase()}) — DIVIDEN KUAT LOLOS BLOKIR (PENALTI SKOR -${(
            stock.kseiHscScorePenaltyPts ?? 0.45
          )
            .toFixed(2)
            .replace('.', ',')} POIN)`
        : stock.hscSource === 'KSEI_OFFICIAL'
        ? `DAFTAR RESMI HSC BEI–KSEI (KEPEMILIKAN TOP-10: ${kseiPctText} · STATUS: ${kseiNewTag.toUpperCase()}) — DIBLOKIR DARI TOP DECILE BUY`
        : stock.hscTier === 'EARLY_WARNING_SUSPECT'
        ? 'RADAR EARLY WARNING QUANT: SUSPECT HSC (PRA-RILIS BEI) — DIBLOKIR DARI TOP DECILE BUY'
        : 'PERINGATAN SAHAM HSC (MANUAL OVERRIDE) — DIBLOKIR DARI TOP DECILE BUY';

    drawTextAutoFit(ctx, bannerHeader, 54, curY + 21, LOGICAL_WIDTH - 108, 700, 11.5, 8.5);

    ctx.fillStyle = isDivPenalty ? '#FDE68A' : '#FECDD3';
    const subReasonText = `${stock.hscReason || 'Konsentrasi kepemilikan tinggi.'}${kseiFnText}`;
    drawTextAutoFit(ctx, subReasonText, 54, curY + 41, LOGICAL_WIDTH - 108, 500, 10.5, 8.0);
    curY += 68;
  }

  // Extract 5-Pillar Academic Metrics (Novy-Marx GP/A, QMJ Accrual OCF/NI, Fabozzi SBN Curve Ke, Damodaran Justified PBV, 1/Beta Barbell)
  const safeDer = Math.max(0, stock.debtToEquity);
  const eqMult = 1 + safeDer;
  const roaDuPont = stock.roe / Math.max(1, eqMult);
  const gpToAssets =
    joeliardiEval.grossProfitabilityToAssets ??
    stock.grossProfitabilityToAssets ??
    Number((stock.roe * 0.85).toFixed(1));
  const ocfNi =
    joeliardiEval.ocfToNetIncomeRatio ??
    stock.ocfToNetIncomeRatio ??
    0.92;
  const accrualPen = joeliardiEval.accrualPenaltyPts ?? 0;
  const sbn1Y = joeliardiEval.sbnSpot1YPct ?? 6.15;
  const sbn5Y = joeliardiEval.sbnSpot5YPct ?? 6.48;
  const sbn10Y = joeliardiEval.sbnSpot10YPct ?? 6.75;
  const sbnBlended = joeliardiEval.sbnBlendedSpotRfPct ?? 6.64;
  const dynKe = joeliardiEval.dynamicCostOfEquityPct ?? 12.64;
  const justPbv =
    joeliardiEval.damodaranJustifiedPbv ?? joeliardiEval.joeliardiFairPbv;
  const sustGrowth = joeliardiEval.sustainableGrowthRatePct ?? 5.5;
  const betaPropensity =
    stock.betaWeightedPropensity ?? 1 / Math.max(0.45, stock.beta1Y);
  const betaCap = joeliardiEval.betaWeightedSizingCapPct ?? 14.0;

  // 5. Row 1: 4 Valuation & Intrinsic Cards (Auto-fitted so no text ever clips or overflows)
  const cardGap = 14;
  const cardW = (LOGICAL_WIDTH - 76 - cardGap * 3) / 4;
  const innerCardMaxW = cardW - 24;
  const valCards = [
    {
      label: 'HARGA PASAR LIVE (BEI)',
      labelColor: '#9CA3AF',
      main: `Rp ${formatIdrPriceDisplay(stock.lastPrice)}`,
      mainColor: '#F9FAFB',
      sub: `1D: ${stock.change1D >= 0 ? '+' : ''}${stock.change1D.toFixed(2)}% · 30D: ${stock.return30D >= 0 ? '+' : ''}${stock.return30D.toFixed(1)}%`,
      subColor: stock.change1D >= 0 ? '#34D399' : '#FB7185'
    },
    {
      label: 'NILAI INTRINSIK WAJAR',
      labelColor: '#F59E0B',
      main: `Rp ${formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)}`,
      mainColor: '#F9FAFB',
      sub: `EPS ~Rp ${joeliardiEval.estimatedEpsIdr.toLocaleString('id-ID')} · BVPS ~Rp ${joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')}`,
      subColor: '#9CA3AF'
    },
    {
      label: 'MARGIN OF SAFETY (MOS)',
      labelColor: '#9CA3AF',
      main: `${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}%`,
      mainColor:
        joeliardiEval.marginOfSafetyPct >= 10
          ? '#34D399'
          : joeliardiEval.marginOfSafetyPct >= 0
          ? '#FBBF24'
          : '#FB7185',
      sub: joeliardiEval.valuationLabel,
      subColor: '#D1D5DB'
    },
    {
      label: 'JUSTIFIED PBV & PER (DAMODARAN)',
      labelColor: '#9CA3AF',
      main: `PBV ${joeliardiEval.impliedPbv}x (Justified ${justPbv}x)`,
      mainColor: '#F9FAFB',
      sub: `PER ${joeliardiEval.impliedPer}x (Wajar ${joeliardiEval.joeliardiFairPer}x · Ke ${dynKe.toFixed(2)}%)`,
      subColor: '#38BDF8'
    }
  ];

  valCards.forEach((c, idx) => {
    const x = 38 + idx * (cardW + cardGap);
    drawRoundedRect(ctx, x, curY, cardW, 86, 4);
    ctx.fillStyle = '#141B26';
    ctx.fill();
    ctx.strokeStyle = '#243044';
    ctx.stroke();

    ctx.fillStyle = c.labelColor;
    drawTextAutoFit(ctx, c.label, x + 12, curY + 22, innerCardMaxW, 700, 10, 8.0);

    ctx.fillStyle = c.mainColor;
    drawTextAutoFit(
      ctx,
      c.main,
      x + 12,
      curY + 49,
      innerCardMaxW,
      idx === 3 ? 700 : 800,
      idx === 3 ? 13.5 : 19,
      11.0
    );

    ctx.fillStyle = c.subColor;
    drawTextAutoFit(ctx, c.sub, x + 12, curY + 71, innerCardMaxW, 600, 10.5, 7.8);
  });

  curY += 102;

  // 6. Row 2: 4 Academic Pillar Scores (Auto-fitted lines inside each card)
  const pillars = [
    {
      title: '1. Gross Profit & Anti-Junk',
      score: joeliardiEval.businessQualityScore,
      color: '#10B981',
      lines: [
        `GP/A (Novy-Marx): ${gpToAssets.toFixed(1)}% (ROE ${stock.roe.toFixed(1)}%)`,
        `OCF/NI (Anti-Junk): ${ocfNi.toFixed(2)}x ${accrualPen > 0 ? `(Penalti -${accrualPen} pts)` : '(Kas Riil Sehat)'}`,
        `Fwd Div Yield: ${joeliardiEval.forwardDividendYieldPct.toFixed(2)}% (DPR ${joeliardiEval.historicalDpr3YPct.toFixed(0)}%)`
      ]
    },
    {
      title: '2. Kesehatan Neraca',
      score: joeliardiEval.balanceSheetHealthScore,
      color: '#38BDF8',
      lines: [
        `DER: ${stock.debtToEquity.toFixed(2)}x`,
        `Status Neraca: ${stock.debtToEquity <= 0.8 ? 'Konservatif' : 'Moderat/Tinggi'}`,
        stock.hscSource === 'KSEI_OFFICIAL' && stock.kseiHscConcentrationPct
          ? `KSEI Top-10: ${stock.kseiHscConcentrationPct.toFixed(2).replace('.', ',')}%${
              stock.kseiHscIsNew ? ' (BARU)' : ''
            }${
              stock.kseiHscFootnote && stock.kseiHscFootnote !== 'NONE'
                ? ' ' + formatKseiFootnoteShortLabel(stock.kseiHscFootnote)
                : ''
            }`
          : stock.hscTier === 'EARLY_WARNING_SUSPECT'
          ? 'HSC: Suspect HSC (Early Warning)'
          : stock.isHscFlagged
          ? 'HSC: Manual HSC Blokir'
          : 'HSC: Bebas HSC (<92,5% KSEI)'
      ]
    },
    {
      title: '3. Justified PBV & Kurva SBN',
      score: joeliardiEval.valuationSafetyScore,
      color: '#F59E0B',
      lines: [
        `Justified PBV: ${justPbv}x (g ${sustGrowth.toFixed(1)}%)`,
        `Spot SBN Blended: ${sbnBlended.toFixed(2)}% → Ke ${dynKe.toFixed(2)}%`,
        `Margin of Safety: ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}%`
      ]
    },
    {
      title: '4. 1/β Barbell Position Sizing',
      score: joeliardiEval.oosQuantRobustnessScore,
      color: '#10B981',
      lines: [
        `Komposit: ${stock.dmuCompositeScore.toFixed(2)}/10 (Top ${stock.dmuRankPct}%)`,
        `Propensitas 1/β: ${betaPropensity.toFixed(2)}x (β ${stock.beta1Y.toFixed(2)}x)`,
        `Batas Alokasi Maks (1/β Cap): ≤${betaCap.toFixed(1)}%`
      ]
    }
  ];

  pillars.forEach((p, idx) => {
    const x = 38 + idx * (cardW + cardGap);
    drawRoundedRect(ctx, x, curY, cardW, 114, 4);
    ctx.fillStyle = '#11161F';
    ctx.fill();
    ctx.strokeStyle = '#222C3C';
    ctx.stroke();

    ctx.fillStyle = '#F3F4F6';
    drawTextAutoFit(ctx, p.title, x + 12, curY + 23, cardW - 72, 700, 11.5, 8.5);

    ctx.fillStyle = p.color;
    ctx.font = '700 11.5px Montserrat, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${p.score}/100`, x + cardW - 12, curY + 23);
    ctx.textAlign = 'left';

    // Progress Bar Track
    drawRoundedRect(ctx, x + 12, curY + 32, cardW - 24, 6, 2);
    ctx.fillStyle = '#222C3C';
    ctx.fill();

    // Progress Bar Fill
    const fillW = Math.max(4, ((cardW - 24) * Math.min(100, Math.max(0, p.score))) / 100);
    drawRoundedRect(ctx, x + 12, curY + 32, fillW, 6, 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    ctx.fillStyle = '#9CA3AF';
    p.lines.forEach((ln, lIdx) => {
      drawTextAutoFit(ctx, ln, x + 12, curY + 57 + lIdx * 18, innerCardMaxW, 500, 10.5, 8.0);
    });
  });

  curY += 132;

  // 7. Row 3: 4-Column Academic Quantitative Strip (Auto-fitted / wrapped inside card boundaries)
  const academicStrip = [
    {
      label: 'GP/A (NOVY-MARX) & DUPONT',
      val: `GP/A ${gpToAssets.toFixed(1)}% (ROA ${roaDuPont.toFixed(1)}% · Lev ${eqMult.toFixed(2)}x)`,
      color: '#34D399'
    },
    {
      label: 'KURVA SPOT SBN (1Y/5Y/10Y) & KE',
      val: `Ke ${dynKe.toFixed(2)}% (Rf ${sbnBlended.toFixed(2)}%: 1Y ${sbn1Y}% · 5Y ${sbn5Y}% · 10Y ${sbn10Y}%)`,
      color: '#F3F4F6'
    },
    {
      label: 'ANTI-JUNK (QMJ ACCRUAL)',
      val: `OCF/NI ${ocfNi.toFixed(2)}x ${accrualPen > 0 ? `(Penalti Akrual -${accrualPen} pts)` : '(0 Penalti · Kas Riil Valid)'}`,
      color: accrualPen === 0 ? '#34D399' : '#FBBF24'
    },
    {
      label: 'JUSTIFIED PBV & SIZING 1/β',
      val: `PBV Wajar ${justPbv}x (MoS ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}% · Cap 1/β ≤${betaCap.toFixed(1)}%)`,
      color: '#38BDF8'
    }
  ];

  academicStrip.forEach((d, idx) => {
    const x = 38 + idx * (cardW + cardGap);
    drawRoundedRect(ctx, x, curY, cardW, 62, 4);
    ctx.fillStyle = '#141B26';
    ctx.fill();
    ctx.strokeStyle = '#243044';
    ctx.stroke();

    ctx.fillStyle = '#9CA3AF';
    drawTextAutoFit(ctx, d.label, x + 12, curY + 20, innerCardMaxW, 700, 9.5, 8.0);

    ctx.fillStyle = d.color;
    ctx.font = '700 10.5px Montserrat, sans-serif';
    if (ctx.measureText(d.val).width <= innerCardMaxW) {
      ctx.fillText(d.val, x + 12, curY + 43);
    } else {
      // Check if slight auto-fit keeps it on 1 crisp line (>= 8.8px), otherwise wrap onto 2 lines
      ctx.font = '700 9.0px Montserrat, sans-serif';
      if (ctx.measureText(d.val).width <= innerCardMaxW) {
        drawTextAutoFit(ctx, d.val, x + 12, curY + 43, innerCardMaxW, 700, 10.5, 8.8);
      } else {
        ctx.font = '700 9.5px Montserrat, sans-serif';
        const wrappedStrip = wrapCanvasText(ctx, d.val, innerCardMaxW).slice(0, 2);
        wrappedStrip.forEach((sLine, sIdx) => {
          drawTextAutoFit(
            ctx,
            sLine,
            x + 12,
            curY + 37 + sIdx * 13.5,
            innerCardMaxW,
            700,
            9.5,
            8.0
          );
        });
      }
    }
  });

  curY += 80;

  // 8. Nostradamus Synthesis Box (Matches Web UI Layout)
  drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, aiBoxH, 5);
  ctx.fillStyle = '#11161F';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.42)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  let textY = curY + 22;

  // Top Bordered Status Badge
  const isDangerBadge =
    verdictBadge.includes('AVOID') ||
    verdictBadge.includes('HSC') ||
    verdictBadge.includes('SPECULATIVE');
  const isPositiveBadge =
    verdictBadge.includes('ACCUMULATE') || verdictBadge.includes('BUY');

  ctx.font = '700 10.5px Montserrat, sans-serif';
  const vBadgeW = ctx.measureText(verdictBadge).width + 24;
  drawRoundedRect(ctx, 56, textY, vBadgeW, 24, 3);
  ctx.fillStyle = isDangerBadge
    ? 'rgba(225, 29, 72, 0.16)'
    : isPositiveBadge
    ? 'rgba(16, 185, 129, 0.14)'
    : 'rgba(16, 185, 129, 0.12)';
  ctx.fill();
  ctx.strokeStyle = isDangerBadge
    ? 'rgba(244, 63, 94, 0.55)'
    : isPositiveBadge
    ? 'rgba(16, 185, 129, 0.5)'
    : 'rgba(16, 185, 129, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = isDangerBadge
    ? '#FB7185'
    : isPositiveBadge
    ? '#34D399'
    : '#34D399';
  ctx.fillText(verdictBadge, 68, textY + 16);

  textY += 44;

  // Bold Verdict Title on its own dedicated line
  ctx.fillStyle = '#F9FAFB';
  ctx.font = '800 15px Montserrat, sans-serif';
  verdictTitleLines.forEach((vLine) => {
    ctx.fillText(vLine, 56, textY);
    textY += 21;
  });

  // AI Conviction Score in Bold Amber below Verdict Title
  const convScore =
    structuredReport?.convictionScore ?? joeliardiEval.totalConvictionScore;
  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 12.5px Montserrat, sans-serif';
  ctx.fillText(`AI Conviction Score: ${convScore}/100`, 56, textY + 2);

  textY += 18;

  // Boxed Bold Header with Amber Square Dot: [ ■ HASIL ANALISIS NOSTRADAMUS ]
  ctx.font = '800 12px Montserrat, sans-serif';
  const hdrBoxW = ctx.measureText(summaryBoxHeader).width + 44;
  drawRoundedRect(ctx, 56, textY, hdrBoxW, 30, 3);
  ctx.fillStyle = 'rgba(217, 119, 6, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.65)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Small Amber Square Indicator inside Header Box
  drawRoundedRect(ctx, 68, textY + 10, 9, 9, 2);
  ctx.fillStyle = '#F59E0B';
  ctx.fill();

  ctx.fillStyle = '#F59E0B';
  ctx.fillText(summaryBoxHeader, 84, textY + 19.5);

  textY += 50;

  // Rich-Text Narrative Summary Paragraph (Bold numbers/metrics + Amber Underlined Verdict)
  textY = drawRichTokenLines(
    ctx,
    summaryRichLines,
    56,
    textY,
    summaryLineH,
    13,
    '#D1D5DB',
    '#F9FAFB',
    '#F59E0B'
  );

  // 4 Chain-of-Thought Cards Section
  if (parsedCotCards.length > 0) {
    textY += 6;
    // Subtle Horizontal Divider Line
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(56, textY);
    ctx.lineTo(LOGICAL_WIDTH - 56, textY);
    ctx.stroke();

    textY += 22;
    drawLayersIcon(ctx, 56, textY - 11);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '700 10.5px Montserrat, sans-serif';
    ctx.fillText(
      'ALUR PENALARAN KUANTITATIF-FUNDAMENTAL (CHAIN-OF-THOUGHT):',
      74,
      textY
    );
    textY += 14;

    let rowStartY = textY;
    for (let r = 0; r < cotRowHeights.length; r++) {
      const rowH = cotRowHeights[r];

      for (let col = 0; col < 2; col++) {
        const cardIdx = r * 2 + col;
        if (cardIdx >= parsedCotCards.length) continue;
        const card = parsedCotCards[cardIdx];
        const bx = 56 + col * (halfCotW + 14);
        const by = rowStartY;

        drawRoundedRect(ctx, bx, by, halfCotW, rowH, 4);
        ctx.fillStyle = '#141B26';
        ctx.fill();
        ctx.strokeStyle = '#243044';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Bold Step Header
        ctx.fillStyle = '#F9FAFB';
        drawTextAutoFit(ctx, card.header, bx + 14, by + 22, halfCotW - 28, 700, 12, 9.5);

        // Subtle Header Bottom Border inside Card
        ctx.strokeStyle = '#1F2A3C';
        ctx.beginPath();
        ctx.moveTo(bx + 14, by + 31);
        ctx.lineTo(bx + halfCotW - 14, by + 31);
        ctx.stroke();

        // Rich-Text Body with Bold Financial Metrics
        const afterBodyY = drawRichTokenLines(
          ctx,
          card.bodyLines,
          bx + 14,
          by + 50,
          18,
          11.5,
          '#9CA3AF',
          '#F9FAFB',
          '#F59E0B'
        );

        // Dedicated Amber Conclusion Line (`→ ...`) at bottom of Card
        if (card.conclusionLines.length > 0) {
          ctx.fillStyle = '#F59E0B';
          ctx.font = '700 11.5px Montserrat, sans-serif';
          card.conclusionLines.forEach((cLine, cIdx) => {
            ctx.fillText(cLine, bx + 14, afterBodyY + 6 + cIdx * 17);
          });
        }
      }

      rowStartY += rowH + 12;
    }

    textY = rowStartY - 12;
  }

  // 4 Execution Strategy Cards (Full text, no truncation)
  if (exCols.length > 0) {
    textY += 16;
    exCols.forEach((ec, idx) => {
      const exX = 56 + idx * (exW + 12);
      drawRoundedRect(ctx, exX, textY, exW, exCardH, 4);
      ctx.fillStyle = '#141B26';
      ctx.fill();
      ctx.strokeStyle = '#243044';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#9CA3AF';
      drawTextAutoFit(ctx, ec.label, exX + 11, textY + 19, exW - 22, 700, 9.5, 8.0);

      ctx.fillStyle = ec.color;
      ctx.font = '600 10.5px Montserrat, sans-serif';
      ec.wrapped.forEach((el, eIdx) => {
        ctx.fillText(el, exX + 11, textY + 37 + eIdx * 15.5);
      });
    });
  }

  curY += aiBoxH + 18;

  // 9. Full Recent News, Corporate Action & Radar Section (All items with Category Badge & Snippet)
  if (preparedNewsCards.length > 0) {
    ctx.fillStyle = '#38BDF8';
    ctx.font = '700 11.5px Montserrat, sans-serif';
    ctx.fillText(
      `BERITA TERKINI, CORPORATE ACTION & RADAR ISU SPESIFIK EMITEN (${stock.ticker} · ${preparedNewsCards.length} ITEM TERKAIT ≤ 3 BULAN)`,
      38,
      curY + 16
    );
    curY += 32;

    let newsRowY = curY;
    for (let r = 0; r < newsRowHeights.length; r++) {
      const rowH = newsRowHeights[r];

      for (let col = 0; col < 2; col++) {
        const cardIdx = r * 2 + col;
        if (cardIdx >= preparedNewsCards.length) continue;
        const nc = preparedNewsCards[cardIdx];
        const nx = 38 + col * (newsColW + 14);
        const ny = newsRowY;

        drawRoundedRect(ctx, nx, ny, newsColW, rowH, 4);
        ctx.fillStyle = '#141B26';
        ctx.fill();
        ctx.strokeStyle = '#243044';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Category Badge Pill on top-left
        ctx.font = '700 8.5px Montserrat, sans-serif';
        const badgeW = ctx.measureText(nc.catStyle.label).width + 14;
        drawRoundedRect(ctx, nx + 12, ny + 10, badgeW, 18, 3);
        ctx.fillStyle = nc.catStyle.bgColor;
        ctx.fill();
        ctx.strokeStyle = nc.catStyle.borderColor;
        ctx.stroke();

        ctx.fillStyle = nc.catStyle.textColor;
        ctx.fillText(nc.catStyle.label, nx + 19, ny + 22);

        // Source & Published Date on top-right
        ctx.fillStyle = '#9CA3AF';
        ctx.textAlign = 'right';
        const metaStr = `${nc.item.source} · ${nc.item.publishedAt}`;
        drawTextAutoFit(
          ctx,
          metaStr,
          nx + newsColW - 12,
          ny + 22,
          newsColW - badgeW - 36,
          600,
          9.5,
          7.8
        );
        ctx.textAlign = 'left';

        // News Title (up to 2 lines)
        let innerY = ny + 44;
        ctx.fillStyle = '#F9FAFB';
        ctx.font = '700 11.5px Montserrat, sans-serif';
        nc.titleLines.forEach((tLine) => {
          drawTextAutoFit(ctx, tLine, nx + 12, innerY, newsColW - 24, 700, 11.5, 9.5);
          innerY += 16;
        });

        // News Content Snippet (up to 3 lines)
        if (nc.snippetLines.length > 0) {
          innerY += 4;
          ctx.fillStyle = '#9CA3AF';
          ctx.font = '500 10px Montserrat, sans-serif';
          nc.snippetLines.forEach((sLine) => {
            drawTextAutoFit(ctx, sLine, nx + 12, innerY, newsColW - 24, 500, 10, 8.5);
            innerY += 14.5;
          });
        }

        // Bottom Card Divider + Sector & Source Footer (matching Web UI card style)
        const cardFooterY = ny + rowH - 26;
        ctx.strokeStyle = '#1F2A3C';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nx + 12, cardFooterY);
        ctx.lineTo(nx + newsColW - 12, cardFooterY);
        ctx.stroke();

        ctx.fillStyle = '#F59E0B';
        ctx.font = '700 9.5px Montserrat, sans-serif';
        ctx.fillText(`Sektor: ${stock.sector}`, nx + 12, cardFooterY + 16);

        ctx.textAlign = 'right';
        ctx.fillText('Buka Sumber ↗', nx + newsColW - 12, cardFooterY + 16);
        ctx.textAlign = 'left';
      }

      newsRowY += rowH + 12;
    }

    curY = newsRowY + 2;
  }

  // 10. Institutional Footer Bar
  const footerY = LOGICAL_HEIGHT - 56;
  ctx.fillStyle = '#11161F';
  ctx.fillRect(17, footerY, LOGICAL_WIDTH - 34, 39);
  ctx.strokeStyle = '#222C3C';
  ctx.beginPath();
  ctx.moveTo(17, footerY);
  ctx.lineTo(LOGICAL_WIDTH - 17, footerY);
  ctx.stroke();

  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 11px Montserrat, sans-serif';
  ctx.fillText('© 2026 NOSTRADAMUS QUANT TERMINAL', 38, footerY + 24);

  ctx.fillStyle = '#9CA3AF';
  ctx.font = '600 11px Montserrat, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Made with 🤖 by Fayadh', LOGICAL_WIDTH - 38, footerY + 24);
  ctx.textAlign = 'left';

  return canvas;
}

/**
 * Downloads the High-Definition PNG Image with Nostradamus Quant Terminal watermark
 */
export function exportInspectToHdPng(payload: InspectorExportPayload): void {
  const canvas = renderInspectorReportCanvas(payload);
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const dateTag = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.download = `Nostradamus_Quant_Inspect_${payload.stock.ticker}_${dateTag}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generates a standalone, standards-compliant PDF 1.4 file containing the High-DPI watermarked report
 * and triggers a direct file download (.pdf) without relying on popup windows.
 */
export function exportInspectToPdf(payload: InspectorExportPayload): void {
  const canvas = renderInspectorReportCanvas(payload);
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const base64Data = jpegDataUrl.split(',')[1];
  const binaryStr = atob(base64Data);
  const imgBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    imgBytes[i] = binaryStr.charCodeAt(i);
  }

  const imgW = canvas.width;
  const imgH = canvas.height;
  // Standard PDF page width = 842 pt (A4 landscape width), proportional height
  const pdfW = 842;
  const pdfH = Math.round((imgH / imgW) * pdfW);

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let byteLength = 0;

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    byteLength += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    byteLength += bytes.length;
  };

  const startObj = (id: number) => {
    offsets[id] = byteLength;
    pushStr(`${id} 0 obj\n`);
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  startObj(2);
  pushStr('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3: Page
  startObj(3);
  pushStr(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfW} ${pdfH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  // 4: Image XObject (DCTDecode JPEG)
  startObj(4);
  pushStr(
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`
  );
  pushBytes(imgBytes);
  pushStr('\nendstream\nendobj\n');

  // 5: Page Content Stream
  const contentStream = `q\n${pdfW} 0 0 ${pdfH} 0 0 cm\n/Im0 Do\nQ\n`;
  startObj(5);
  pushStr(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

  // Cross-reference table (xref)
  const xrefOffset = byteLength;
  pushStr('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    const padded = String(offsets[i]).padStart(10, '0');
    pushStr(`${padded} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  const mergedBuffer = new ArrayBuffer(byteLength);
  const mergedView = new Uint8Array(mergedBuffer);
  let cursor = 0;
  for (const chunk of chunks) {
    mergedView.set(chunk, cursor);
    cursor += chunk.length;
  }

  const pdfBlob = new Blob([mergedBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(pdfBlob);
  const dateTag = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Nostradamus_Quant_Inspect_${payload.stock.ticker}_${dateTag}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
