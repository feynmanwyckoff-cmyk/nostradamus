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
  'Langkah Follow-Up:',
  'BELI / AKUMULASI',
  'TAHAN BELI BARU / JUAL SEBAGIAN (TRIM)',
  'ROTASI KE PAIR',
  'Pertahankan posisi (HOLD)',
  'Hindari arbitrase pasangan (pair trade) murni',
  'Anomali Relative Value Terdeteksi:',
  'Surplus konversi kas riil sangat solid',
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
  'Ohlson-Penman RIM',
  'Multi-Stage RIM',
  'Forward Annualized ROE',
  'Forward ROE',
  'Fwd ROE',
  'terdiskon tajam',
  'excess return',
  'Spread 30D',
  'Spread 1D',
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
  'OCF',
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
    `Langkah\\s+Follow-Up:`,
    `BELI\\s*\\/\\s*AKUMULASI(?:\\s+[A-Z]{4})?`,
    `TAHAN\\s+BELI\\s+BARU\\s*\\/\\s*JUAL\\s+SEBAGIAN\\s*\\(TRIM\\)(?:\\s+[A-Z]{4})?`,
    `ROTASI\\s+KE\\s+PAIR(?:\\s+[A-Z]{4})?`,
    `Pertahankan\\s+posisi\\s*\\(HOLD\\)(?:\\s+[A-Z]{4})?`,
    `\\b(?:${VERDICT_TERMS.join('|')})\\b`,
    `\\b(?:${METRIC_LABELS.join('|')})\\s*~?(?:Rp\\s*)?[+-]?\\d+(?:[.,]\\d+)?(?:%|x|σ|\\/100|\\/10|\\/shm|\\/saham)?`,
    `[+-]?\\d+(?:[.,]\\d+)?x\\s+vs\\s+(?:Wajar|Justified\\s+PBV)\\s+[+-]?\\d+(?:[.,]\\d+)?x`,
    `~?Rp\\s*\\d+(?:[.,]\\d+)*(?:\\/shm|\\/saham)?`,
    `[+-]?\\d+(?:[.,]\\d+)?(?:%|x|σ|\\b\\/100\\b|\\b\\/10\\b)`
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
      const isActionHighlight =
        /LANGKAH FOLLOW-UP|BELI \/ AKUMULASI|TAHAN BELI BARU|ROTASI KE PAIR|PERTAHANKAN POSISI/i.test(
          upper
        ) || VERDICT_TERMS.some((v) => v.toUpperCase() === upper);
      style = isActionHighlight ? 'verdict' : 'bold';
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

  // Pre-measure Structured Execution Strategy 4 cards so no text is ever cut off
  const ex = structuredReport?.executionStrategy;
  const exW = (LOGICAL_WIDTH - 112 - 12 * 3) / 4;
  let exCardH = 0;

  const spotIdr = stock.lastPrice;
  const fairIdr = joeliardiEval.intrinsicValueIdr;
  const mosVal = joeliardiEval.marginOfSafetyPct;
  const stopPriceIdr = Math.round((Math.min(spotIdr, fairIdr) * 0.91) / 5) * 5;
  const rangeMatch = ex?.idealEntryZone?.match(/Rp\s*[\d.,]+\s*[–-]\s*Rp\s*[\d.,]+/i);
  const extractedRange = rangeMatch
    ? rangeMatch[0]
    : `Rp ${formatIdrPriceDisplay(Math.round((fairIdr * 0.75) / 5) * 5)} – Rp ${formatIdrPriceDisplay(Math.round((fairIdr * 0.88) / 5) * 5)}`;
  const stopMatch = ex?.InvalidationOrRiskLimit?.match(/Rp\s*[\d.,]+/i);
  const extractedStop = stopMatch ? stopMatch[0] : `Rp ${formatIdrPriceDisplay(stopPriceIdr)}`;
  const betaProp = stock.betaWeightedPropensity ?? 1 / Math.max(0.45, stock.beta1Y);
  const betaCapPct = joeliardiEval.betaWeightedSizingCapPct ?? 14.0;
  const minAllocPct = Number(Math.max(2.0, betaCapPct * 0.5).toFixed(1));
  const basketLabel = stock.beta1Y <= 0.85 ? 'Keranjang 1 (Core Defensif)' : 'Keranjang 2 (Tactical Alpha)';

  const safeAdtvMillionsExportStr =
    joeliardiEval.maxSafeAllocationIdr >= 1_000_000
      ? (joeliardiEval.maxSafeAllocationIdr / 1_000_000).toLocaleString('id-ID', {
          maximumFractionDigits: 1
        })
      : joeliardiEval.maxSafeAllocationIdr.toLocaleString('id-ID');

  const exCols = ex
    ? [
        {
          label: '1. TINDAKAN UTAMA',
          badge: stock.isHscFlagged
            ? 'AVOID'
            : joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST'
            ? 'BUY ON STRENGTH'
            : mosVal >= 10
            ? 'BUY ON WEAKNESS'
            : mosVal >= -5
            ? 'HOLD'
            : 'WAIT',
          badgeColor: stock.isHscFlagged
            ? '#FB7185'
            : joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST' || mosVal >= 10
            ? '#34D399'
            : '#FBBF24',
          lines: [
            ex.recommendedAction.replace(/^Strong\s+Buy\s*[:—-]\s*/i, ''),
            stock.isHscFlagged
              ? '▸ Hindari alokasi modal inti pada saham HSC.'
              : joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST'
              ? '▸ Katalis aktif memvalidasi akumulasi momentum.'
              : '▸ Bagi order beli dalam 2–3 termin bertahap.'
          ],
          color: '#F3F4F6'
        },
        {
          label: '2. ZONA AKUMULASI IDEAL',
          badge: stock.isHscFlagged
            ? 'SPEKULATIF'
            : ex.isUndercutDeepDiscount || mosVal >= 10
            ? 'DISKON'
            : mosVal >= 0
            ? 'WAJAR'
            : 'PREMIUM',
          badgeColor: stock.isHscFlagged
            ? '#FB7185'
            : ex.isUndercutDeepDiscount || mosVal >= 10
            ? '#34D399'
            : mosVal >= 0
            ? '#38BDF8'
            : '#FBBF24',
          lines: [
            `▸ Rentang Ideal: ${extractedRange}`,
            `▸ Nilai Wajar: Rp ${formatIdrPriceDisplay(fairIdr)}`,
            `▸ Spot vs Wajar: Rp ${formatIdrPriceDisplay(spotIdr)} (${mosVal >= 0 ? '+' : ''}${mosVal.toFixed(1)}%)`,
            mosVal >= 10
              ? 'Diskon sangat ideal untuk akumulasi bertahap.'
              : mosVal >= 0
              ? 'Masih di bawah Nilai Wajar; cicil di rentang ideal.'
              : 'Di atas Nilai Wajar; disiplin antre saat koreksi.'
          ],
          color: '#34D399'
        },
        {
          label: '3. BATAS INVALIDATION',
          badge: `STOP < ${extractedStop}`,
          badgeColor: '#FB7185',
          lines: [
            `▸ Trigger Harga: Tutup di bawah ${extractedStop}`,
            '▸ Trigger Moat: GP/A < 10% atau OCF/NI < 0,65x',
            '▸ Rotasi Quant: Keluar dari zona Top 40% Buffer'
          ],
          color: '#FB7185'
        },
        {
          label: '4. PORSI 1/β & ADTV',
          badge: `1/β Cap ≤${betaCapPct.toFixed(1)}%`,
          badgeColor: '#38BDF8',
          lines: [
            `▸ Alokasi: ${basketLabel}`,
            `▸ Porsi Ideal: ${minAllocPct}% – ${betaCapPct.toFixed(1)}% (1/β ${betaProp.toFixed(2)}x)`,
            `▸ 5% ADTV 20D: ≤ Rp ${safeAdtvMillionsExportStr} Jt/hr`,
            ex.liquidityWarningBadge || '✓ LIQUIDITY VERIFIED: Kapasitas 5% ADTV Aman'
          ],
          color: ex.isLiquidityCapped ? '#FBBF24' : '#38BDF8'
        }
      ].map((col) => {
        sCtx.font = '600 9.5px Montserrat, sans-serif';
        const wrapped: string[] = [];
        col.lines.forEach((ln) => {
          if (ln.startsWith('▸ Rentang Ideal:') || ln.startsWith('▸ Nilai Wajar:') || ln.startsWith('▸ Spot vs Wajar:') || ln.startsWith('▸ Alokasi:') || ln.startsWith('▸ Porsi Ideal:') || ln.startsWith('▸ 5% ADTV 20D:')) {
            wrapped.push(ln);
          } else {
            const wLines = wrapCanvasText(sCtx, ln, exW - 22);
            wrapped.push(...wLines);
          }
        });
        return { ...col, wrapped };
      })
    : [];

  if (exCols.length > 0) {
    const maxExLines = Math.max(...exCols.map((c) => c.wrapped.length));
    exCardH = Math.max(104, 40 + maxExLines * 14.5 + 12);
  }

  // Pre-measure StatArb & Sector Rationale boxes in Row 3B using rich token wrapping (with Follow-Up on new paragraph)
  const statArbBoxW = Math.round((LOGICAL_WIDTH - 76 - 14) * 0.56);
  const secRatBoxW = LOGICAL_WIDTH - 76 - 14 - statArbBoxW;
  const rawStatArbText = joeliardiEval.statArbRationale || '';
  const statArbFollowUpParts = rawStatArbText.split(/(Langkah Follow-Up:\s*[\s\S]*)$/i);
  const statArbMainText = (statArbFollowUpParts[0] || '').trim();
  const statArbFollowUpText = (statArbFollowUpParts[1] || '').trim();

  const statArbMainRichTokens = tokenizeFinancialNarrative(statArbMainText, stock.ticker);
  const statArbMainRichLines = wrapRichTokens(sCtx, statArbMainRichTokens, statArbBoxW - 24, 9.8);
  const statArbFollowUpRichTokens = statArbFollowUpText
    ? tokenizeFinancialNarrative(statArbFollowUpText, stock.ticker)
    : [];
  const statArbFollowUpRichLines = statArbFollowUpText
    ? wrapRichTokens(sCtx, statArbFollowUpRichTokens, statArbBoxW - 24, 9.8)
    : [];

  const secRatRichTokens = tokenizeFinancialNarrative(
    joeliardiEval.sectorAcademicRationale || '',
    stock.ticker
  );
  const secRatRichLines = wrapRichTokens(sCtx, secRatRichTokens, secRatBoxW - 24, 9.8);
  const totalStatArbTextH =
    statArbMainRichLines.length * 14.5 +
    (statArbFollowUpRichLines.length > 0 ? 10 + statArbFollowUpRichLines.length * 14.5 : 0);
  const statArbAndRatRowH = Math.max(
    128,
    Math.max(68 + totalStatArbTextH + 8, 42 + secRatRichLines.length * 14.5 + 26)
  );
  const multiMethodSectionH = 34 + 38 + 114 + 10 + statArbAndRatRowH + 14;

  // Measure verdictTitle wrapping (strip redundant Strong Buy: prefix)
  const verdictBadge = structuredReport?.verdictBadge || joeliardiEval.convictionGrade;
  const verdictTitle = (
    structuredReport?.verdictTitle ||
    `Evaluasi Fundamental & Kuantitatif OOS untuk ${stock.ticker}`
  ).replace(/^Strong\s+Buy\s*[:—-]\s*/i, '');
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
    80 + // Row 3 Academic Strip
    multiMethodSectionH + // Row 3B Full Multi-Method Fair Value, Formula Bar, StatArb & Sector Rationale
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
  const ytdExportPct =
    typeof stock.returnYTD === 'number'
      ? stock.returnYTD
      : Number((stock.return30D * 1.45).toFixed(1));
  const valCards: Array<{
    label: string;
    labelColor: string;
    main: string;
    mainColor: string;
    sub: string;
    subColor: string;
    subSegments?: Array<{ text: string; color: string }>;
  }> = [
    {
      label: 'HARGA PASAR LIVE (BEI)',
      labelColor: '#9CA3AF',
      main: `Rp ${formatIdrPriceDisplay(stock.lastPrice)}`,
      mainColor: '#F9FAFB',
      sub: `1D: ${stock.change1D >= 0 ? '+' : ''}${stock.change1D.toFixed(2)}% · 30D: ${stock.return30D >= 0 ? '+' : ''}${stock.return30D.toFixed(1)}% · YTD: ${ytdExportPct >= 0 ? '+' : ''}${ytdExportPct.toFixed(1)}%`,
      subColor: stock.change1D >= 0 ? '#34D399' : '#FB7185',
      subSegments: [
        {
          text: `1D: ${stock.change1D >= 0 ? '+' : ''}${stock.change1D.toFixed(2)}%`,
          color: stock.change1D < 0 ? '#FB7185' : '#34D399'
        },
        { text: ' · ', color: '#6B7280' },
        {
          text: `30D: ${stock.return30D >= 0 ? '+' : ''}${stock.return30D.toFixed(1)}%`,
          color: stock.return30D < 0 ? '#FB7185' : '#34D399'
        },
        { text: ' · ', color: '#6B7280' },
        {
          text: `YTD: ${ytdExportPct >= 0 ? '+' : ''}${ytdExportPct.toFixed(1)}%`,
          color: ytdExportPct < 0 ? '#FB7185' : '#34D399'
        }
      ]
    },
    {
      label: 'NILAI INTRINSIK WAJAR',
      labelColor: '#F59E0B',
      main: `Rp ${formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)}`,
      mainColor: '#F9FAFB',
      sub: `${joeliardiEval.sectorPrimaryMetricShort ?? 'Sektor'}: Rp ${formatIdrPriceDisplay(
        joeliardiEval.sectorSpecificFairValueIdr ?? joeliardiEval.intrinsicValueIdr
      )} · RIM ${joeliardiEval.rimFadeYears ?? 6}Y: Rp ${formatIdrPriceDisplay(
        joeliardiEval.rimFairValueIdr ?? joeliardiEval.intrinsicValueIdr
      )} · RelVal: Rp ${formatIdrPriceDisplay(
        joeliardiEval.statArbImpliedTargetIdr ?? joeliardiEval.intrinsicValueIdr
      )}`,
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
      label: `MATRIKS SEKTOR (${joeliardiEval.sectorPrimaryMetricShort ?? 'PBV'}) & PBV`,
      labelColor: '#9CA3AF',
      main: `${joeliardiEval.sectorPrimaryMetricShort ?? 'PBV'} ${
        joeliardiEval.sectorPrimaryImpliedMultiple ?? joeliardiEval.impliedPbv
      }x (Wajar ${joeliardiEval.sectorPrimaryFairMultiple ?? justPbv}x)`,
      mainColor: '#F9FAFB',
      sub: `PBV ${joeliardiEval.impliedPbv}x (Just. ${justPbv}x) · PER ${joeliardiEval.impliedPer}x · Ke ${dynKe.toFixed(2)}%`,
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

    if (c.subSegments && c.subSegments.length > 0) {
      let fontSize = 10.0;
      const minSize = 7.5;
      const fullSubText = c.subSegments.map((s) => s.text).join('');
      while (fontSize > minSize) {
        ctx.font = `600 ${fontSize}px "Fira Code", monospace`;
        if (ctx.measureText(fullSubText).width <= innerCardMaxW) break;
        fontSize -= 0.25;
      }
      ctx.font = `600 ${fontSize}px "Fira Code", monospace`;
      let segX = x + 12;
      for (const seg of c.subSegments) {
        ctx.fillStyle = seg.color;
        ctx.fillText(seg.text, segX, curY + 71);
        segX += ctx.measureText(seg.text).width;
      }
    } else {
      ctx.fillStyle = c.subColor;
      drawTextAutoFit(ctx, c.sub, x + 12, curY + 71, innerCardMaxW, 600, 10.5, 7.8);
    }
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

  // 7. Row 3: 4-Column Academic Quantitative Strip (Main value on Line 1, parenthetical subtitle on New Line 2)
  const academicStrip = [
    {
      label: 'GP/A (NOVY-MARX) & DUPONT',
      mainVal: `GP/A ${gpToAssets.toFixed(1)}%`,
      subVal: `(ROA ${roaDuPont.toFixed(1)}% · Lev ${eqMult.toFixed(2)}x)`,
      color: '#34D399'
    },
    {
      label: 'KURVA SPOT SBN (1Y/5Y/10Y)',
      mainVal: `Ke ${dynKe.toFixed(2)}%`,
      subVal: `(Spot Rf ${sbnBlended.toFixed(2)}%: 1Y ${sbn1Y}%·5Y ${sbn5Y}%·10Y ${sbn10Y}%)`,
      color: '#F3F4F6'
    },
    {
      label: 'ANTI-JUNK (QMJ ACCRUAL)',
      mainVal: `OCF/NI ${ocfNi.toFixed(2)}x`,
      subVal: accrualPen > 0 ? `(Penalti Akrual -${accrualPen} pts)` : '(0 Penalti · Kas Riil Valid)',
      color: accrualPen === 0 ? '#34D399' : '#FBBF24'
    },
    {
      label: 'JUSTIFIED PBV & SIZING 1/β',
      mainVal: `PBV Wajar ${justPbv}x`,
      subVal: `(MoS ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}% · Cap 1/β ≤${betaCap.toFixed(1)}%)`,
      color: '#38BDF8'
    }
  ];

  academicStrip.forEach((d, idx) => {
    const x = 38 + idx * (cardW + cardGap);
    drawRoundedRect(ctx, x, curY, cardW, 64, 4);
    ctx.fillStyle = '#141B26';
    ctx.fill();
    ctx.strokeStyle = '#243044';
    ctx.stroke();

    ctx.fillStyle = '#9CA3AF';
    drawTextAutoFit(ctx, d.label, x + 12, curY + 18, innerCardMaxW, 700, 9.5, 8.0);

    ctx.fillStyle = d.color;
    drawTextAutoFit(
      ctx,
      d.mainVal,
      x + 12,
      curY + 37,
      innerCardMaxW,
      700,
      12.0,
      9.5,
      '"Fira Code", monospace'
    );

    ctx.fillStyle = '#9CA3AF';
    drawTextAutoFit(
      ctx,
      d.subVal,
      x + 12,
      curY + 53,
      innerCardMaxW,
      500,
      9.2,
      7.5,
      '"Fira Code", monospace'
    );
  });

  curY += 80;

  // 7B. Row 3B: Multi-Method Fair Value Comparison, Formula Calculation Strip, StatArb & Sector Rationale
  const secShortLabel = joeliardiEval.sectorPrimaryMetricShort ?? 'PBV';
  const secFullLabel = joeliardiEval.sectorPrimaryMetricLabel ?? 'Damodaran Justified PBV';
  const secFairIdr = joeliardiEval.sectorSpecificFairValueIdr ?? joeliardiEval.intrinsicValueIdr;
  const rimFairIdr = joeliardiEval.rimFairValueIdr ?? joeliardiEval.intrinsicValueIdr;
  const statArbFairIdr = joeliardiEval.statArbImpliedTargetIdr ?? joeliardiEval.intrinsicValueIdr;
  const peerTkr = joeliardiEval.statArbPeerTicker ?? 'PEER';
  const zScoreVal = joeliardiEval.statArbZScore ?? 0;
  const rhoVal = joeliardiEval.statArbCorrelation ?? 0.85;

  // Section Header Row: QUANTEDGE MULTI-MODEL VALUATION & Single-Line Title "Komparasi Multi-Metode Harga Wajar"
  ctx.fillStyle = '#10B981';
  ctx.font = '700 9.5px Montserrat, sans-serif';
  ctx.fillText('QUANTEDGE MULTI-MODEL VALUATION', 38, curY + 11);

  ctx.fillStyle = '#F9FAFB';
  ctx.font = '700 13px Montserrat, sans-serif';
  ctx.fillText('Komparasi Multi-Metode Harga Wajar', 38, curY + 27);

  // Right-aligned Highlighted Badge for Selected Sector Primary Metric
  ctx.font = '700 9.5px "Fira Code", monospace';
  const secMetricBadgeW = ctx.measureText(secFullLabel).width + 16;
  const secMetricBadgeX = LOGICAL_WIDTH - 38 - secMetricBadgeW;
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'right';
  ctx.fillText('Matriks Utama Sektor:', secMetricBadgeX - 8, curY + 22);
  ctx.textAlign = 'left';

  drawRoundedRect(ctx, secMetricBadgeX, curY + 8, secMetricBadgeW, 20, 3);
  ctx.fillStyle = 'rgba(217, 119, 6, 0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
  ctx.stroke();
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(secFullLabel, secMetricBadgeX + 8, curY + 21.5);

  curY += 34;

  // Formula Calculation Strip ("Perhitungan harga wajar :")
  drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, 30, 4);
  ctx.fillStyle = '#141B26';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.stroke();

  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 10.5px "Fira Code", monospace';
  ctx.fillText('Perhitungan harga wajar :', 50, curY + 19);

  const formulaStr =
    joeliardiEval.ensembleFormulaAudit ||
    `(Rp ${formatIdrPriceDisplay(secFairIdr)} × 45%) + (Rp ${formatIdrPriceDisplay(rimFairIdr)} × 35%) + (Rp ${formatIdrPriceDisplay(statArbFairIdr)} × 20%) = Rp ${formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)}`;
  ctx.fillStyle = '#F9FAFB';
  drawTextAutoFit(
    ctx,
    formulaStr,
    224,
    curY + 19,
    LOGICAL_WIDTH - 274,
    700,
    10.5,
    8.5,
    '"Fira Code", monospace'
  );

  curY += 38;

  const calcMethodMos = (fIdr: number) =>
    Number((((fIdr - stock.lastPrice) / Math.max(1, fIdr)) * 100).toFixed(1));

  const totalModelFinalIdr = Math.max(1, joeliardiEval.intrinsicValueIdr);
  const secContribIdr = Math.round(secFairIdr * 0.45);
  const rimContribIdr = Math.round(rimFairIdr * 0.35);
  const relContribIdr = Math.max(0, totalModelFinalIdr - secContribIdr - rimContribIdr);

  const secSharePct = Math.max(8, Math.min(80, Math.round((secContribIdr / totalModelFinalIdr) * 100)));
  const rimSharePct = Math.max(8, Math.min(80, Math.round((rimContribIdr / totalModelFinalIdr) * 100)));
  const relSharePct = Math.max(6, 100 - secSharePct - rimSharePct);

  const multiMethodStrip = [
    {
      kicker: '★ MODEL FINAL · 100%',
      title: 'Quantedge Sector-Adaptive Ensemble',
      main: `Rp ${formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)}`,
      mosPct: joeliardiEval.marginOfSafetyPct,
      contribText: `Akumulasi: +Rp ${formatIdrPriceDisplay(secContribIdr)} + Rp ${formatIdrPriceDisplay(rimContribIdr)} + Rp ${formatIdrPriceDisplay(relContribIdr)}`,
      contribSharePct: 100,
      barColor: '#F59E0B',
      sub: `45% ${secShortLabel} + 35% RIM (${joeliardiEval.rimFadeYears ?? 6}Y) + 20% RelVal`,
      color: '#FBBF24',
      isPrimary: true
    },
    {
      kicker: 'KOMPONEN ENSEMBLE · BOBOT 45%',
      title: `Matriks Spesifik Sektor: ${secFullLabel}`,
      main: `Rp ${formatIdrPriceDisplay(secFairIdr)}`,
      mosPct: calcMethodMos(secFairIdr),
      contribText: `Kontribusi (45%): +Rp ${formatIdrPriceDisplay(secContribIdr)} ke Model Final`,
      contribSharePct: secSharePct,
      barColor: '#F59E0B',
      sub: `${secShortLabel} Aktual ${joeliardiEval.sectorPrimaryImpliedMultiple ?? joeliardiEval.impliedPbv}x vs Wajar ${joeliardiEval.sectorPrimaryFairMultiple ?? justPbv}x`,
      color: '#F9FAFB',
      isPrimary: false
    },
    {
      kicker: 'KOMPONEN ENSEMBLE · BOBOT 35%',
      title: `Multi-Stage Residual Income (Ohlson-Penman ${joeliardiEval.rimFadeYears ?? 6}Y)`,
      main: `Rp ${formatIdrPriceDisplay(rimFairIdr)}`,
      mosPct: calcMethodMos(rimFairIdr),
      contribText: `Kontribusi (35%): +Rp ${formatIdrPriceDisplay(rimContribIdr)} ke Model Final`,
      contribSharePct: rimSharePct,
      barColor: '#10B981',
      sub: `BVPS Rp ${joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')} · Fwd ROE ${(joeliardiEval.forwardAnnualizedRoePct ?? stock.roe).toFixed(1)}% · ω=${(joeliardiEval.rimPersistenceOmega ?? 0.72).toFixed(2)}`,
      color: '#F9FAFB',
      isPrimary: false
    },
    {
      kicker: 'KOMPONEN ENSEMBLE · BOBOT 20%',
      title: `Relative Value & StatArb vs ${peerTkr} (ρ=${rhoVal.toFixed(2)})`,
      main: `Rp ${formatIdrPriceDisplay(statArbFairIdr)}`,
      mosPct: calcMethodMos(statArbFairIdr),
      contribText: `Kontribusi (20%): +Rp ${formatIdrPriceDisplay(relContribIdr)} ke Model Final`,
      contribSharePct: relSharePct,
      barColor: '#38BDF8',
      sub: `Z-Score ${zScoreVal >= 0 ? '+' : ''}${zScoreVal.toFixed(2)}σ · Peer Hedonic Rp ${formatIdrPriceDisplay(joeliardiEval.agnosticPeerFairValueIdr ?? statArbFairIdr)}`,
      color: '#F9FAFB',
      isPrimary: false
    }
  ];

  multiMethodStrip.forEach((m, idx) => {
    const x = 38 + idx * (cardW + cardGap);
    drawRoundedRect(ctx, x, curY, cardW, 114, 4);
    ctx.fillStyle = m.isPrimary ? '#172030' : '#11161F';
    ctx.fill();
    ctx.strokeStyle = m.isPrimary ? '#F59E0B' : '#243044';
    ctx.stroke();

    ctx.fillStyle = m.isPrimary ? '#F59E0B' : '#9CA3AF';
    drawTextAutoFit(ctx, m.kicker, x + 12, curY + 16, innerCardMaxW, 700, 8.5, 7.2);

    // Full Non-Truncated Model Name
    ctx.fillStyle = '#F9FAFB';
    drawTextAutoFit(ctx, m.title, x + 12, curY + 31, innerCardMaxW, 700, 10.0, 7.8);

    // Uniform Large Bold Price Font on All 4 Cards (Model Final & Ensemble Components)
    ctx.fillStyle = '#F9FAFB';
    drawTextAutoFit(
      ctx,
      m.main,
      x + 12,
      curY + 54,
      innerCardMaxW - 58,
      800,
      16.0,
      11.5,
      '"Fira Code", monospace'
    );

    const mosColor = m.mosPct >= 10 ? '#34D399' : m.mosPct >= 0 ? '#FBBF24' : '#FB7185';
    ctx.fillStyle = mosColor;
    ctx.font = '700 10px "Fira Code", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `${m.mosPct >= 0 ? '+' : ''}${m.mosPct.toFixed(1)}%`,
      x + cardW - 12,
      curY + 53
    );
    ctx.textAlign = 'left';

    // Visual Contribution Bar (Stacked 3-Segment Bar on Model Final, Proportional Bar on Components)
    const barTrackX = x + 12;
    const barTrackY = curY + 62;
    const barTrackW = innerCardMaxW;
    const barTrackH = 6;

    drawRoundedRect(ctx, barTrackX, barTrackY, barTrackW, barTrackH, 2);
    ctx.fillStyle = '#222C3C';
    ctx.fill();

    if (m.isPrimary) {
      const w1 = Math.max(8, Math.round((barTrackW * secSharePct) / 100));
      const w2 = Math.max(8, Math.round((barTrackW * rimSharePct) / 100));
      const w3 = Math.max(6, barTrackW - w1 - w2 - 2);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(barTrackX, barTrackY, w1, barTrackH);
      ctx.fillStyle = '#10B981';
      ctx.fillRect(barTrackX + w1 + 1, barTrackY, w2, barTrackH);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(barTrackX + w1 + w2 + 2, barTrackY, w3, barTrackH);
    } else {
      const fillW = Math.max(8, Math.round((barTrackW * m.contribSharePct) / 100));
      drawRoundedRect(ctx, barTrackX, barTrackY, fillW, barTrackH, 2);
      ctx.fillStyle = m.barColor;
      ctx.fill();
    }

    ctx.fillStyle = m.isPrimary ? '#FBBF24' : m.barColor;
    drawTextAutoFit(
      ctx,
      m.contribText,
      x + 12,
      curY + 81,
      innerCardMaxW,
      700,
      8.6,
      7.0,
      '"Fira Code", monospace'
    );

    ctx.fillStyle = '#9CA3AF';
    drawTextAutoFit(
      ctx,
      m.sub,
      x + 12,
      curY + 99,
      innerCardMaxW,
      600,
      8.8,
      7.2,
      '"Fira Code", monospace'
    );
  });

  curY += 124;

  // Draw 2-Column StatArb Box (Left) & Sector/RIM Rationale Box (Right)
  drawRoundedRect(ctx, 38, curY, statArbBoxW, statArbAndRatRowH, 4);
  ctx.fillStyle = '#11161F';
  ctx.fill();
  ctx.strokeStyle = '#243044';
  ctx.stroke();

  ctx.fillStyle = '#38BDF8';
  drawTextAutoFit(
    ctx,
    `STATISTICAL ARBITRAGE & RELATIVE VALUE (${stock.ticker} ↔ ${peerTkr})`,
    50,
    curY + 19,
    statArbBoxW - 260,
    700,
    9.5,
    8.0
  );

  // High-Contrast StatArb Signal Badge (Readable in all states including Neutral Equilibrium)
  const saSignal = joeliardiEval.statArbSignal;
  const saBadgeText =
    joeliardiEval.statArbSignalLabel ||
    `Kointegrasi Seimbang vs ${peerTkr} (Z = ${zScoreVal >= 0 ? '+' : ''}${zScoreVal.toFixed(2)}σ)`;
  ctx.font = '700 8.5px "Fira Code", monospace';
  const saBadgeW = Math.min(245, ctx.measureText(saBadgeText).width + 16);
  const saBadgeX = 38 + statArbBoxW - 12 - saBadgeW;
  drawRoundedRect(ctx, saBadgeX, curY + 6, saBadgeW, 18, 3);
  ctx.fillStyle =
    saSignal === 'MEAN_REVERSION_BUY'
      ? 'rgba(16, 185, 129, 0.18)'
      : saSignal === 'PAIR_OVEREXTENDED_TRIM'
      ? 'rgba(225, 29, 72, 0.18)'
      : saSignal === 'FUNDAMENTAL_DIVERGENCE'
      ? 'rgba(245, 158, 11, 0.18)'
      : 'rgba(2, 132, 199, 0.22)';
  ctx.fill();
  ctx.strokeStyle =
    saSignal === 'MEAN_REVERSION_BUY'
      ? '#10B981'
      : saSignal === 'PAIR_OVEREXTENDED_TRIM'
      ? '#F43F5E'
      : saSignal === 'FUNDAMENTAL_DIVERGENCE'
      ? '#F59E0B'
      : '#38BDF8';
  ctx.stroke();
  ctx.fillStyle =
    saSignal === 'MEAN_REVERSION_BUY'
      ? '#34D399'
      : saSignal === 'PAIR_OVEREXTENDED_TRIM'
      ? '#FB7185'
      : saSignal === 'FUNDAMENTAL_DIVERGENCE'
      ? '#FBBF24'
      : '#38BDF8';
  drawTextAutoFit(
    ctx,
    saBadgeText,
    saBadgeX + 8,
    curY + 18,
    saBadgeW - 16,
    700,
    8.5,
    7.2,
    '"Fira Code", monospace'
  );

  // Compact Metric Strip inside StatArb Box
  drawRoundedRect(ctx, 50, curY + 29, statArbBoxW - 24, 24, 3);
  ctx.fillStyle = '#141B26';
  ctx.fill();
  ctx.strokeStyle = '#1F2A3C';
  ctx.stroke();
  const saMetricSummary = `Peer Twin: ${peerTkr} (${joeliardiEval.statArbPeerName ?? peerTkr})  |  Korelasi ρ = ${rhoVal.toFixed(2)}  |  Z-Score: ${zScoreVal >= 0 ? '+' : ''}${zScoreVal.toFixed(2)}σ  |  Target: Rp ${formatIdrPriceDisplay(statArbFairIdr)}`;
  ctx.fillStyle = '#E5E7EB';
  drawTextAutoFit(
    ctx,
    saMetricSummary,
    58,
    curY + 44,
    statArbBoxW - 40,
    600,
    9.5,
    7.8,
    '"Fira Code", monospace'
  );

  const afterStatArbMainY = drawRichTokenLines(
    ctx,
    statArbMainRichLines,
    50,
    curY + 69,
    14.5,
    9.8,
    '#D1D5DB',
    '#F9FAFB',
    saSignal === 'MEAN_REVERSION_BUY'
      ? '#34D399'
      : saSignal === 'PAIR_OVEREXTENDED_TRIM'
      ? '#FB7185'
      : '#38BDF8'
  );

  if (statArbFollowUpRichLines.length > 0) {
    ctx.strokeStyle = '#1F2A3C';
    ctx.beginPath();
    ctx.moveTo(50, afterStatArbMainY - 4);
    ctx.lineTo(38 + statArbBoxW - 12, afterStatArbMainY - 4);
    ctx.stroke();

    drawRichTokenLines(
      ctx,
      statArbFollowUpRichLines,
      50,
      afterStatArbMainY + 10,
      14.5,
      9.8,
      '#D1D5DB',
      '#F9FAFB',
      saSignal === 'MEAN_REVERSION_BUY'
        ? '#34D399'
        : saSignal === 'PAIR_OVEREXTENDED_TRIM'
        ? '#FB7185'
        : '#38BDF8'
    );
  }

  // Right Box: Enriched Sector Matrix & Multi-Stage RIM Rationale with Bold & Highlight Typography
  const secRatX = 38 + statArbBoxW + 14;
  drawRoundedRect(ctx, secRatX, curY, secRatBoxW, statArbAndRatRowH, 4);
  ctx.fillStyle = '#11161F';
  ctx.fill();
  ctx.strokeStyle = '#243044';
  ctx.stroke();

  ctx.fillStyle = '#F59E0B';
  drawTextAutoFit(
    ctx,
    'RASIONALISASI MATRIKS SEKTOR & MULTI-STAGE RIM',
    secRatX + 12,
    curY + 19,
    secRatBoxW - 24,
    700,
    9.5,
    8.0
  );

  drawRichTokenLines(
    ctx,
    secRatRichLines,
    secRatX + 12,
    curY + 38,
    14.5,
    9.8,
    '#D1D5DB',
    '#F9FAFB',
    '#34D399'
  );

  const rimFooterY = curY + statArbAndRatRowH - 22;
  ctx.strokeStyle = '#1F2A3C';
  ctx.beginPath();
  ctx.moveTo(secRatX + 12, rimFooterY);
  ctx.lineTo(secRatX + secRatBoxW - 12, rimFooterY);
  ctx.stroke();

  ctx.fillStyle = '#9CA3AF';
  drawTextAutoFit(
    ctx,
    `Anchor BVPS: Rp ${joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')} · EPS: Rp ${joeliardiEval.estimatedEpsIdr.toLocaleString('id-ID')}`,
    secRatX + 12,
    rimFooterY + 15,
    secRatBoxW * 0.56,
    600,
    9.0,
    7.5,
    '"Fira Code", monospace'
  );
  ctx.fillStyle = '#34D399';
  ctx.textAlign = 'right';
  drawTextAutoFit(
    ctx,
    `RIM ω=${(joeliardiEval.rimPersistenceOmega ?? 0.72).toFixed(2)} (${joeliardiEval.rimFadeYears ?? 6}Thn): Rp ${formatIdrPriceDisplay(rimFairIdr)}`,
    secRatX + secRatBoxW - 12,
    rimFooterY + 15,
    secRatBoxW * 0.42,
    700,
    9.0,
    7.5,
    '"Fira Code", monospace'
  );
  ctx.textAlign = 'left';

  curY += statArbAndRatRowH + 14;

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

  // 4 Structured Execution Strategy Cards (Full text, badge + structured rows, no truncation)
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
      drawTextAutoFit(ctx, ec.label, exX + 11, textY + 18, exW - 96, 700, 9.0, 7.5);

      if (ec.badge) {
        ctx.font = '700 8.0px "Fira Code", monospace';
        const bW = Math.min(92, ctx.measureText(ec.badge).width + 10);
        const bX = exX + exW - 10 - bW;
        drawRoundedRect(ctx, bX, textY + 6, bW, 15, 2);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
        ctx.fill();
        ctx.strokeStyle = ec.badgeColor;
        ctx.stroke();
        ctx.fillStyle = ec.badgeColor;
        drawTextAutoFit(ctx, ec.badge, bX + 5, textY + 16.5, bW - 10, 700, 8.0, 6.8, '"Fira Code", monospace');
      }

      // Subtle card header separator
      ctx.strokeStyle = '#1F2A3C';
      ctx.beginPath();
      ctx.moveTo(exX + 11, textY + 26);
      ctx.lineTo(exX + exW - 11, textY + 26);
      ctx.stroke();

      ctx.fillStyle = ec.color;
      ec.wrapped.forEach((el, eIdx) => {
        drawTextAutoFit(ctx, el, exX + 11, textY + 41 + eIdx * 14.5, exW - 22, 600, 9.5, 7.2);
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
