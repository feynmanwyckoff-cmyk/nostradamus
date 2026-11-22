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
import { resolveUiNotificationBadgeMeta } from './dataLineageEngine';

export interface InspectorExportPayload {
  stock: StockMetrics;
  joeliardiEval: JoeliardiOosEvaluation;
  structuredReport: StructuredAiConvictionReport | null;
  recentNews: NewsSentimentItem[];
  regimeStatus: MarketRegimeStatus;
  isAiGenerated?: boolean;
  aiGeneratedAt?: string | null;
}

interface RichWordToken {
  word: string;
  style: 'normal' | 'bold' | 'verdict';
}

const VERDICT_TERMS = [
  'STRONG BUY: ANOMALI ASET DEFENSIF TERDISKON',
  'BUY ON STRENGTH // CATALYST ACTIVE',
  'BUY ON STRENGTH / CATALYST',
  'CATALYST ACTIVE',
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
  'Hist EV/EBITDA Band 5Y',
  'Hist PBV Band 5Y',
  'ValuationLedger',
  'ROE TTM',
  'EPS TTM',
  'Dynamic Buyback Yield',
  'Buyback Yield',
  'Total Shareholder Yield',
  'TSY',
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

const DEFAULT_COT_TITLES = [
  '01. Audit Profitabilitas Kas (GP/A & Anti-Junk OCF/NI):',
  '02. Kurva Spot SBN (1Y/5Y/10Y), Ke & Justified PBV:',
  '03. Uji Silang Momentum, Neraca & Value Trap:',
  '04. Sizing 1/β Barbell, Dividen & Likuiditas ADTV:'
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
  ctx.fillText(text, x, y, Math.max(10, maxWidth));
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

function getExportSentimentToneStyle(
  tone?: 'POSITIVE' | 'NEUTRAL' | 'CAUTION' | 'NEGATIVE'
): {
  borderColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  bulletColor: string;
} {
  switch (tone) {
    case 'POSITIVE':
      return {
        borderColor: 'rgba(16, 185, 129, 0.48)',
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        badgeBorder: 'rgba(16, 185, 129, 0.45)',
        badgeText: '#34D399',
        bulletColor: '#34D399'
      };
    case 'CAUTION':
      return {
        borderColor: 'rgba(245, 158, 11, 0.52)',
        badgeBg: 'rgba(245, 158, 11, 0.15)',
        badgeBorder: 'rgba(245, 158, 11, 0.45)',
        badgeText: '#FBBF24',
        bulletColor: '#FBBF24'
      };
    case 'NEGATIVE':
      return {
        borderColor: 'rgba(244, 63, 94, 0.52)',
        badgeBg: 'rgba(244, 63, 94, 0.15)',
        badgeBorder: 'rgba(244, 63, 94, 0.45)',
        badgeText: '#FB7185',
        bulletColor: '#FB7185'
      };
    default:
      return {
        borderColor: 'rgba(56, 189, 248, 0.48)',
        badgeBg: 'rgba(56, 189, 248, 0.15)',
        badgeBorder: 'rgba(56, 189, 248, 0.45)',
        badgeText: '#38BDF8',
        bulletColor: '#38BDF8'
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

function splitExportTitledStep(
  stepText: string,
  fallbackIndex?: number
): {
  header: string | null;
  body: string;
  conclusion: string | null;
} {
  const cleaned = String(stepText || '').trim();
  const colonIdx = cleaned.indexOf(':');
  let header: string | null = null;
  let remainder = cleaned;

  if (colonIdx > 0 && colonIdx <= 68) {
    header = cleaned.slice(0, colonIdx + 1).trim();
    remainder = cleaned.slice(colonIdx + 1).trim();
  } else if (typeof fallbackIndex === 'number' && DEFAULT_COT_TITLES[fallbackIndex]) {
    header = DEFAULT_COT_TITLES[fallbackIndex];
  }

  const arrowParts = remainder.split(/\s*(?:->|→)\s*/);
  if (arrowParts.length > 1) {
    return {
      header,
      body: arrowParts.slice(0, -1).join(' → ').trim(),
      conclusion: arrowParts[arrowParts.length - 1].trim() || null
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

/**
 * Wraps text into at most `maxLines` lines within `maxWidth`, automatically stepping down
 * font size from `initialFontSize` to `minFontSize` if needed so long formulas/titles fit
 * cleanly on 2-3 lines inside a card without overflowing or colliding.
 */
function drawWrappedTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  lineHeight: number,
  weight: number | string,
  initialFontSize: number,
  minFontSize = 7.2,
  fontFamily = 'Montserrat, sans-serif'
): number {
  const safeMaxW = Math.max(20, maxWidth);
  let fontSize = initialFontSize;
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  let wrapped = wrapCanvasText(ctx, text, safeMaxW);

  while (wrapped.length > maxLines && fontSize > minFontSize) {
    fontSize = Number((fontSize - 0.25).toFixed(2));
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    wrapped = wrapCanvasText(ctx, text, safeMaxW);
  }

  let linesToDraw: string[];
  if (wrapped.length <= maxLines) {
    linesToDraw = wrapped;
  } else {
    linesToDraw = wrapped.slice(0, maxLines - 1);
    const tailCombined = wrapped.slice(maxLines - 1).join(' ');
    linesToDraw.push(tailCombined);
  }

  linesToDraw.forEach((lineStr, idx) => {
    const lineY = y + idx * lineHeight;
    drawTextAutoFit(
      ctx,
      lineStr,
      x,
      lineY,
      safeMaxW,
      weight,
      fontSize,
      Math.max(6.2, minFontSize - 0.8),
      fontFamily
    );
  });

  return linesToDraw.length;
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
  drawRoundedRect(ctx, boxX, boxY, boxSize, boxSize, 6);
  ctx.fillStyle = '#151C28';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.save();
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

  // 4. Primary 4-Point Cardinal Compass Needles
  drawPoly([[32, 4], [32, 32], [26.5, 26.5]], '#FDE68A');
  drawPoly([[32, 4], [37.5, 26.5], [32, 32]], '#D97706');
  drawPoly([[32, 60], [32, 32], [37.5, 37.5]], '#FBBF24');
  drawPoly([[32, 60], [26.5, 37.5], [32, 32]], '#92400E');
  drawPoly([[60, 32], [32, 32], [37.5, 26.5]], '#FDE68A');
  drawPoly([[60, 32], [37.5, 37.5], [32, 32]], '#B45309');
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

  ctx.beginPath();
  ctx.moveTo(x + 6, y);
  ctx.lineTo(x + 12, y + 3.2);
  ctx.lineTo(x + 6, y + 6.4);
  ctx.lineTo(x, y + 3.2);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y + 6.4);
  ctx.lineTo(x + 6, y + 9.6);
  ctx.lineTo(x + 12, y + 6.4);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y + 9.6);
  ctx.lineTo(x + 6, y + 12.8);
  ctx.lineTo(x + 12, y + 9.6);
  ctx.stroke();

  ctx.restore();
}

/**
 * Renders the full Emiten Fundamental & Nostradamus Inspection Report onto a 2x Retina HD Canvas
 * synchronized 1:1 with the latest EmitenFundamentalInspectorModal UI in Institutional Dark Theme.
 */
export function renderInspectorReportCanvas(
  payload: InspectorExportPayload
): HTMLCanvasElement {
  const {
    stock,
    joeliardiEval,
    structuredReport,
    recentNews,
    regimeStatus,
    isAiGenerated,
    aiGeneratedAt
  } = payload;

  const LOGICAL_WIDTH = 1200;
  const SCALE = 2; // 2400px Ultra-HD Retina resolution

  const scratch = document.createElement('canvas');
  const sCtx = scratch.getContext('2d')!;

  // Extract core academic & valuation metrics
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
  const justPbv = joeliardiEval.joeliardiFairPbv;
  const sustGrowth = joeliardiEval.sustainableGrowthRatePct ?? 5.5;
  const betaPropensity =
    stock.betaWeightedPropensity ?? 1 / Math.max(0.45, stock.beta1Y);
  const betaCap = joeliardiEval.betaWeightedSizingCapPct ?? 14.0;
  const secProfile = joeliardiEval.sectorMethodologyProfile;
  const hasSectorNoticeBanner = Boolean(joeliardiEval.sectorMethodologyNotice);
  const sectorNoticeBannerTotalH = hasSectorNoticeBanner ? 44 : 0;

  // 1. Pre-measure Optional HSC Banner
  const hasHscBanner = Boolean(stock.isHscFlagged || stock.hscSource === 'KSEI_OFFICIAL');
  const hasKseiFootnote = Boolean(
    stock.kseiHscFootnote && stock.kseiHscFootnote !== 'NONE'
  );
  const hscBannerBoxH = hasHscBanner ? (hasKseiFootnote ? 78 : 58) : 0;
  const hscBannerTotalH = hasHscBanner ? hscBannerBoxH + 14 : 0;

  // 2. Pre-measure Optional Active Catalyst & Corporate Action Middleware Telemetry Banner
  const hasCatalystBanner = Boolean(joeliardiEval.isCatalystActive);
  const catalystLeftMaxW = LOGICAL_WIDTH - 76 - 290;
  sCtx.font = '500 10.5px Montserrat, sans-serif';
  const catalystNarrativeLines = hasCatalystBanner
    ? wrapCanvasText(
        sCtx,
        joeliardiEval.catalystNarrative ||
          'Katalis aktif terdeteksi melalui Forward-Looking Annualizer & Corporate Action Interceptor.',
        catalystLeftMaxW
      )
    : [];
  const catalystBannerBoxH = hasCatalystBanner
    ? Math.max(62, 34 + catalystNarrativeLines.length * 15 + 10)
    : 0;
  const catalystBannerTotalH = hasCatalystBanner ? catalystBannerBoxH + 14 : 0;

  // 3. Pre-measure Multi-Method Fair Value Comparison, Dynamic Ensemble, Standalone Floor Bar & StatArb
  const ensembleCards = (joeliardiEval.valuationMethodsComparison || []).filter(
    (m) => !m.isStandaloneBenchmark
  );
  const standaloneFloorMethod = (joeliardiEval.valuationMethodsComparison || []).find(
    (m) => Boolean(m.isStandaloneBenchmark)
  );
  const hasStandaloneFloorBar = Boolean(standaloneFloorMethod);
  const standaloneFloorBarH = hasStandaloneFloorBar ? 96 : 0;

  const uiNotificationList =
    joeliardiEval.valuationReport?.ui_notifications ?? joeliardiEval.uiNotifications ?? [];
  sCtx.font = '600 9.5px "Fira Code", monospace';
  const preparedUiNotifications = uiNotificationList.map((msg) => {
    const badgeMeta = resolveUiNotificationBadgeMeta(msg);
    const wrappedLines = wrapCanvasText(sCtx, msg, LOGICAL_WIDTH - 76 - 154);
    const boxH = Math.max(34, 14 + wrappedLines.length * 14);
    return { msg, badgeMeta, wrappedLines, boxH };
  });
  const uiNotificationsTotalH =
    preparedUiNotifications.length > 0
      ? preparedUiNotifications.reduce((acc, item) => acc + item.boxH + 6, 0) + 2
      : 0;

  const statArbBoxW = Math.round((LOGICAL_WIDTH - 76 - 14) * 0.58);
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
    (statArbFollowUpRichLines.length > 0 ? 12 + statArbFollowUpRichLines.length * 14.5 : 0);
  const statArbAndRatRowH = Math.max(
    138,
    Math.max(82 + totalStatArbTextH + 10, 42 + secRatRichLines.length * 14.5 + 28)
  );

  const multiMethodCardsH = 192;
  const multiMethodSectionH =
    66 + // 2-Row Header (Title Row + Dedicated Sector & Router Badges Sub-Row)
    uiNotificationsTotalH + // Optional Capex Override / UI Notifications Alert Banner
    38 + // Formula calculation strip
    multiMethodCardsH + // 4 Ensemble cards (with 2-line word wrapping)
    (hasStandaloneFloorBar ? 10 + standaloneFloorBarH : 0) + // Standalone Graham-Joeliardi Floor bar
    12 +
    statArbAndRatRowH +
    16;

  // 4. Pre-measure AI Investment Committee Section (Header + 4-Col Academic Strip + Verdict/CoT + 2x2 Deep Sections + 4 Execution Cards + Bullish/Bearish Checklist)
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

  const summaryRichTokens = tokenizeFinancialNarrative(summaryBodyText, stock.ticker);
  const summaryRichLines = wrapRichTokens(
    sCtx,
    summaryRichTokens,
    LOGICAL_WIDTH - 136,
    12.5
  );
  const summaryLineH = 20.5;

  // Chain-of-Thought cards (2x2 grid)
  const cotSteps = structuredReport?.chainOfThoughtSteps || [];
  const halfInnerW = (LOGICAL_WIDTH - 112 - 14) / 2;
  const parsedCotCards = cotSteps.map((stepStr, idx) => {
    const parsed = splitExportTitledStep(stepStr, idx);
    const bodyTokens = tokenizeFinancialNarrative(parsed.body, stock.ticker);
    const bodyLines = wrapRichTokens(sCtx, bodyTokens, halfInnerW - 28, 11.0);
    sCtx.font = '700 11px Montserrat, sans-serif';
    const conclusionLines = parsed.conclusion
      ? wrapCanvasText(sCtx, `→ ${parsed.conclusion}`, halfInnerW - 28)
      : [];
    const cardContentH =
      44 +
      bodyLines.length * 17 +
      (conclusionLines.length > 0 ? 6 + conclusionLines.length * 16 : 0) +
      14;
    return {
      header: parsed.header || DEFAULT_COT_TITLES[idx] || `0${idx + 1}. Analisis Faktor:`,
      bodyLines,
      conclusionLines,
      cardContentH: Math.max(100, cardContentH)
    };
  });

  const cotRowHeights: number[] = [];
  for (let r = 0; r < Math.ceil(parsedCotCards.length / 2); r++) {
    const leftCard = parsedCotCards[r * 2];
    const rightCard = parsedCotCards[r * 2 + 1];
    cotRowHeights.push(
      Math.max(
        leftCard ? leftCard.cardContentH : 100,
        rightCard ? rightCard.cardContentH : 100
      )
    );
  }
  const totalCotGridH =
    cotRowHeights.reduce((acc, h) => acc + h, 0) +
    Math.max(0, cotRowHeights.length - 1) * 12;

  const verdictBadge = structuredReport?.verdictBadge || joeliardiEval.convictionGrade;
  const verdictTitle = (
    structuredReport?.verdictTitle ||
    `Evaluasi Fundamental & Kuantitatif OOS untuk ${stock.ticker}`
  ).replace(/^Strong\s+Buy\s*[:—-]\s*/i, '');
  sCtx.font = '800 14.5px Montserrat, sans-serif';
  const verdictTitleLines = wrapCanvasText(sCtx, verdictTitle, LOGICAL_WIDTH - 136);

  const verdictAndCotBoxH =
    54 +
    verdictTitleLines.length * 20 +
    42 + // Boxed header [ ■ HASIL ANALISIS NOSTRADAMUS ]
    summaryRichLines.length * summaryLineH +
    (parsedCotCards.length > 0 ? 44 + totalCotGridH : 0) +
    18;

  // 2x2 Deep Analytical Pillar Cards (structuredReport.sections)
  const rawSections = structuredReport?.sections || [];
  const parsedSectionCards = rawSections.map((sec) => {
    const toneStyle = getExportSentimentToneStyle(sec.sentimentTone);
    sCtx.font = '700 12.5px Montserrat, sans-serif';
    const titleLines = wrapCanvasText(sCtx, sec.title || '', halfInnerW - 28);

    sCtx.font = '700 10px "Fira Code", monospace';
    const keyHighlightLines = sec.keyMetricHighlight
      ? wrapCanvasText(sCtx, sec.keyMetricHighlight, halfInnerW - 44)
      : [];
    const keyHighlightBoxH =
      keyHighlightLines.length > 0 ? keyHighlightLines.length * 14.5 + 12 : 0;

    const reasoningTokens = tokenizeFinancialNarrative(sec.reasoningParagraph || '', stock.ticker);
    const reasoningLines = wrapRichTokens(sCtx, reasoningTokens, halfInnerW - 28, 10.5);

    const parsedBullets = (sec.bulletPoints || []).map((pt) => {
      const sp = splitExportTitledStep(pt);
      const bTokens = tokenizeFinancialNarrative(sp.body, stock.ticker);
      const bLines = wrapRichTokens(sCtx, bTokens, halfInnerW - 44, 10.0);
      sCtx.font = '700 10px Montserrat, sans-serif';
      const cLines = sp.conclusion
        ? wrapCanvasText(sCtx, `→ ${sp.conclusion}`, halfInnerW - 44)
        : [];
      const bulletH =
        (sp.header ? 15 : 0) +
        bLines.length * 14.5 +
        (cLines.length > 0 ? cLines.length * 14.5 : 0) +
        6;
      return {
        header: sp.header,
        bLines,
        cLines,
        bulletH
      };
    });

    const totalBulletsH =
      parsedBullets.length > 0
        ? 14 + parsedBullets.reduce((acc, b) => acc + b.bulletH, 0)
        : 0;

    const cardH =
      36 + // Badge row
      titleLines.length * 17 +
      (keyHighlightBoxH > 0 ? 8 + keyHighlightBoxH : 0) +
      10 +
      reasoningLines.length * 15.5 +
      totalBulletsH +
      16;

    return {
      sec,
      toneStyle,
      titleLines,
      keyHighlightLines,
      keyHighlightBoxH,
      reasoningLines,
      parsedBullets,
      cardH: Math.max(150, cardH)
    };
  });

  const sectionRowHeights: number[] = [];
  for (let r = 0; r < Math.ceil(parsedSectionCards.length / 2); r++) {
    const leftCard = parsedSectionCards[r * 2];
    const rightCard = parsedSectionCards[r * 2 + 1];
    sectionRowHeights.push(
      Math.max(
        leftCard ? leftCard.cardH : 150,
        rightCard ? rightCard.cardH : 150
      )
    );
  }
  const totalSectionsGridH =
    parsedSectionCards.length > 0
      ? sectionRowHeights.reduce((acc, h) => acc + h, 0) +
        Math.max(0, sectionRowHeights.length - 1) * 12
      : 0;

  // 4 Structured Execution Strategy Cards
  const ex = structuredReport?.executionStrategy;
  const exW = (LOGICAL_WIDTH - 112 - 12 * 3) / 4;
  let exSectionTotalH = 0;
  let exCardH = 0;

  const spotIdr = stock.lastPrice;
  const fairIdr = joeliardiEval.intrinsicValueIdr;
  const mosVal = joeliardiEval.marginOfSafetyPct;
  const stopPriceIdr =
    joeliardiEval.riskSizingResult?.stopLossPriceIDR ??
    Math.round((spotIdr * 0.86) / 5) * 5;
  const rangeMatch = ex?.idealEntryZone?.match(/Rp\s*[\d.,]+\s*[–-]\s*Rp\s*[\d.,]+/i);
  const extractedRange = rangeMatch
    ? rangeMatch[0]
    : `Rp ${formatIdrPriceDisplay(Math.round((fairIdr * 0.75) / 5) * 5)} – Rp ${formatIdrPriceDisplay(Math.round((fairIdr * 0.88) / 5) * 5)}`;
  const stopMatch = ex?.InvalidationOrRiskLimit?.match(/Rp\s*[\d.,]+/i);
  const extractedStop = stopMatch ? stopMatch[0] : `Rp ${formatIdrPriceDisplay(stopPriceIdr)}`;
  const betaProp = stock.betaWeightedPropensity ?? 1 / Math.max(0.45, stock.beta1Y);
  const betaCapPct = joeliardiEval.betaWeightedSizingCapPct ?? 14.0;
  const minAllocPct = Number(Math.max(2.0, betaCapPct * 0.5).toFixed(1));
  const basketLabel =
    stock.beta1Y <= 0.85 ? 'Keranjang 1 (Core Defensif)' : 'Keranjang 2 (Tactical Alpha)';

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
          kvRows: [] as Array<{ k: string; v: string; vColor: string }>,
          lines: [
            ex.recommendedAction.replace(/^Strong\s+Buy\s*[:—-]\s*/i, ''),
            stock.isHscFlagged
              ? '▸ Jangan alokasikan modal inti pada saham berstatus konsentrasi HSC.'
              : joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST'
              ? '▸ Momentum laba/buyback aktif memvalidasi akumulasi bertahap tanpa menunggu diskon dalam.'
              : '▸ Bagi order beli dalam 2–3 termin untuk mengoptimalkan harga rata-rata (average cost).'
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
          kvRows: [
            { k: 'Rentang Ideal:', v: extractedRange, vColor: '#34D399' },
            { k: 'Nilai Wajar:', v: `Rp ${formatIdrPriceDisplay(fairIdr)}`, vColor: '#F9FAFB' },
            {
              k: 'Spot vs Wajar:',
              v: `Rp ${formatIdrPriceDisplay(spotIdr)} (${mosVal >= 0 ? '+' : ''}${mosVal.toFixed(1)}%)`,
              vColor: mosVal >= 0 ? '#34D399' : '#FBBF24'
            }
          ],
          lines: [
            mosVal >= 10
              ? `Harga spot saat ini ${mosVal.toFixed(1)}% di bawah Nilai Wajar; sangat ideal untuk akumulasi bertahap.`
              : mosVal >= 0
              ? `Harga spot masih berdiskon +${mosVal.toFixed(1)}% terhadap Nilai Wajar; utamakan antre beli di rentang ideal.`
              : `Harga spot ${Math.abs(mosVal).toFixed(1)}% di atas Nilai Wajar; disiplin antre pada area support akumulasi.`
          ],
          color: '#D1D5DB'
        },
        {
          label: '3. DUAL STOP LOSS (ATR & TRANCHE)',
          badge: `STOP < Rp ${formatIdrPriceDisplay(joeliardiEval.riskSizingResult?.stopLossPriceIDR ?? stopPriceIdr)}`,
          badgeColor: '#FB7185',
          kvRows: [] as Array<{ k: string; v: string; vColor: string }>,
          lines: [
            `▸ ATR/Vol Stop: Rp ${formatIdrPriceDisplay(joeliardiEval.riskSizingResult?.stopLossPriceIDR ?? stopPriceIdr)} (-${joeliardiEval.riskSizingResult?.stopLossPct ?? 12}%, max[2.5×ATR20, 1.5×σ_m]).`,
            `▸ Tranche & Floor: T1 (${joeliardiEval.riskSizingResult?.tranche1AllocationPct ?? 3.5}%) · T2 (${joeliardiEval.riskSizingResult?.tranche2AllocationPct ?? 2.8}%) · Floor Stop Rp ${formatIdrPriceDisplay(joeliardiEval.grahamJoeliardiBenchmarkIdr ?? stopPriceIdr)}.`,
            `▸ Trigger Moat & Kas: Cut jika GP/A < 10% atau OCF/NI < 0,65x (${extractedStop}).`
          ],
          color: '#F3F4F6'
        },
        {
          label: '4. VOL-TARGETED BARBELL & ADTV',
          badge: `Max Cap ≤${betaCapPct.toFixed(1)}%`,
          badgeColor: '#38BDF8',
          kvRows: [
            { k: 'Alokasi:', v: basketLabel, vColor: '#F9FAFB' },
            {
              k: 'min(1/β,1/Vol,Reg):',
              v: `${minAllocPct}% – ${betaCapPct.toFixed(1)}% (1/β ${betaProp.toFixed(2)}x)`,
              vColor: '#38BDF8'
            },
            {
              k: '5% ADTV 20D:',
              v: `≤ Rp ${safeAdtvMillionsExportStr} Jt/hr`,
              vColor: '#34D399'
            }
          ],
          lines: [
            ex.liquidityWarningBadge || '✓ LIQUIDITY VERIFIED: Kapasitas 5% ADTV Aman'
          ],
          color: ex.isLiquidityCapped ? '#FBBF24' : '#34D399'
        }
      ].map((col) => {
        sCtx.font = '600 9.5px Montserrat, sans-serif';
        const wrapped: string[] = [];
        col.lines.forEach((ln) => {
          const wLines = wrapCanvasText(sCtx, ln, exW - 22);
          wrapped.push(...wLines);
        });
        const kvH = col.kvRows.length > 0 ? col.kvRows.length * 16 + 12 : 0;
        const neededH = 38 + kvH + wrapped.length * 14.5 + 14;
        return { ...col, wrapped, kvH, neededH };
      })
    : [];

  if (exCols.length > 0) {
    exCardH = Math.max(132, ...exCols.map((c) => c.neededH));
    exSectionTotalH = 38 + exCardH + 16; // Includes Execution Strategy Container Header + 4 Cards
  }

  // Bullish Catalysts vs Bearish Risks 2-Column Checklist
  const bullishList = structuredReport?.bullishDrivers || [];
  const bearishList = structuredReport?.bearishRisks || [];
  const hasBullBearGrid = bullishList.length > 0 || bearishList.length > 0;

  const measureChecklistCard = (items: string[]) => {
    const parsedItems = items.map((str) => {
      const sp = splitExportTitledStep(str);
      const bTokens = tokenizeFinancialNarrative(sp.body, stock.ticker);
      const bLines = wrapRichTokens(sCtx, bTokens, halfInnerW - 42, 10.0);
      const itemH = (sp.header ? 15 : 0) + bLines.length * 14.5 + 7;
      return {
        header: sp.header,
        bLines,
        itemH
      };
    });
    const totalH =
      38 + parsedItems.reduce((acc, it) => acc + it.itemH, 0) + 12;
    return { parsedItems, totalH: Math.max(108, totalH) };
  };

  const measuredBullish = measureChecklistCard(bullishList);
  const measuredBearish = measureChecklistCard(bearishList);
  const bullBearGridH = hasBullBearGrid
    ? Math.max(measuredBullish.totalH, measuredBearish.totalH)
    : 0;

  // Total AI Committee Box Height
  const aiBoxH =
    54 + // Top AI Committee Header
    76 + // 4-Column Academic Quantitative Strip inside AI Box
    verdictAndCotBoxH +
    (totalSectionsGridH > 0 ? 14 + totalSectionsGridH : 0) +
    (exSectionTotalH > 0 ? 14 + exSectionTotalH : 0) +
    (bullBearGridH > 0 ? 14 + bullBearGridH : 0) +
    20;

  // 5. Pre-measure Recent News Section
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
      36 +
      titleLines.length * 16 +
      (snippetLines.length > 0 ? 6 + snippetLines.length * 14.5 : 0) +
      32;

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
    newsRowHeights.push(
      Math.max(
        leftCard ? leftCard.cardH : 108,
        rightCard ? rightCard.cardH : 108
      )
    );
  }

  const totalNewsSectionH =
    preparedNewsCards.length > 0
      ? 36 +
        newsRowHeights.reduce((acc, h) => acc + h, 0) +
        Math.max(0, newsRowHeights.length - 1) * 12 +
        14
      : 0;

  const rawAuditStripH = joeliardiEval.rawTickerData && joeliardiEval.sanityReport ? 146 : 0;

  const LOGICAL_HEIGHT =
    124 + // Top Header + initial gap
    hscBannerTotalH +
    catalystBannerTotalH +
    sectorNoticeBannerTotalH +
    102 + // Row 1: 4 Valuation Cards
    130 + // Row 2: 4 Pillar Score Cards
    multiMethodSectionH + // Multi-Method Ensemble + Standalone Floor + StatArb
    aiBoxH + // Complete Investment Committee AI Section
    18 +
    totalNewsSectionH +
    (rawAuditStripH > 0 ? rawAuditStripH + 14 : 0) +
    72; // Footer

  const canvas = document.createElement('canvas');
  canvas.width = LOGICAL_WIDTH * SCALE;
  canvas.height = LOGICAL_HEIGHT * SCALE;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // 1. Dark Institutional Background
  ctx.fillStyle = '#0B0F17';
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  // 2. Diagonal Repeating Background Watermark ("NOSTRADAMUS QUANT TERMINAL")
  ctx.save();
  ctx.translate(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
  ctx.rotate((-24 * Math.PI) / 180);
  ctx.font = '800 34px Montserrat, sans-serif';
  ctx.fillStyle = 'rgba(245, 158, 11, 0.036)';
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

  // 3. Top Header Banner (y = 17..109)
  ctx.fillStyle = '#11161F';
  ctx.fillRect(17, 17, LOGICAL_WIDTH - 34, 92);
  ctx.strokeStyle = '#222C3C';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(17, 109);
  ctx.lineTo(LOGICAL_WIDTH - 17, 109);
  ctx.stroke();

  drawNostradamusCompassLogo(ctx, 36, 36, 54);

  const headerTextX = 104;
  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 10.5px Montserrat, sans-serif';
  ctx.fillText('NOSTRADAMUS', headerTextX, 42);

  // Strict 1-Line Compact Header Badges next to Kicker (Grade, Data Status, Catalyst, Split)
  let kickerBadgeX = headerTextX + ctx.measureText('NOSTRADAMUS').width + 10;

  const compactGradeStr =
    joeliardiEval.compactHeaderGradeBadge ||
    `${joeliardiEval.convictionGrade} · ${joeliardiEval.totalConvictionScore}/100`;
  ctx.font = '700 9.0px "Fira Code", monospace';
  const cgW = ctx.measureText(compactGradeStr).width + 14;
  drawRoundedRect(ctx, kickerBadgeX, 29, cgW, 18, 3);
  const isGradeBlockedKicker =
    stock.isHscFlagged || Boolean(joeliardiEval.sanityReport?.isGradeABlocked);
  ctx.fillStyle = isGradeBlockedKicker
    ? 'rgba(225, 29, 72, 0.22)'
    : joeliardiEval.totalConvictionScore >= 75
    ? 'rgba(16, 185, 129, 0.22)'
    : joeliardiEval.totalConvictionScore >= 58
    ? 'rgba(245, 158, 11, 0.22)'
    : 'rgba(225, 29, 72, 0.22)';
  ctx.fill();
  ctx.strokeStyle = isGradeBlockedKicker
    ? '#F43F5E'
    : joeliardiEval.totalConvictionScore >= 75
    ? '#10B981'
    : joeliardiEval.totalConvictionScore >= 58
    ? '#F59E0B'
    : '#F43F5E';
  ctx.stroke();
  ctx.fillStyle = isGradeBlockedKicker
    ? '#FB7185'
    : joeliardiEval.totalConvictionScore >= 75
    ? '#34D399'
    : joeliardiEval.totalConvictionScore >= 58
    ? '#FBBF24'
    : '#FB7185';
  ctx.fillText(compactGradeStr, kickerBadgeX + 7, 41);
  kickerBadgeX += cgW + 6;

  const compactDataStr = joeliardiEval.compactHeaderDataBadge || 'DATA: FRESH';
  const cdW = ctx.measureText(compactDataStr).width + 14;
  drawRoundedRect(ctx, kickerBadgeX, 29, cdW, 18, 3);
  ctx.fillStyle =
    joeliardiEval.compactHeaderDataStatus === 'FRESH'
      ? 'rgba(16, 185, 129, 0.20)'
      : joeliardiEval.compactHeaderDataStatus === 'OVERRIDE'
      ? 'rgba(99, 102, 241, 0.22)'
      : joeliardiEval.compactHeaderDataStatus === 'SEED_WARN'
      ? 'rgba(225, 29, 72, 0.22)'
      : 'rgba(245, 158, 11, 0.22)';
  ctx.fill();
  ctx.strokeStyle =
    joeliardiEval.compactHeaderDataStatus === 'FRESH'
      ? '#10B981'
      : joeliardiEval.compactHeaderDataStatus === 'OVERRIDE'
      ? '#818CF8'
      : joeliardiEval.compactHeaderDataStatus === 'SEED_WARN'
      ? '#F43F5E'
      : '#F59E0B';
  ctx.stroke();
  ctx.fillStyle =
    joeliardiEval.compactHeaderDataStatus === 'FRESH'
      ? '#34D399'
      : joeliardiEval.compactHeaderDataStatus === 'OVERRIDE'
      ? '#A5B4FC'
      : joeliardiEval.compactHeaderDataStatus === 'SEED_WARN'
      ? '#FDA4AF'
      : '#FCD34D';
  ctx.fillText(compactDataStr, kickerBadgeX + 7, 41);
  kickerBadgeX += cdW + 6;

  if (joeliardiEval.isCatalystActive) {
    const catLabel = `✦ ${joeliardiEval.catalystBadgeLabel || 'CATALYST ACTIVE'}`;
    ctx.font = '700 9.0px "Fira Code", monospace';
    const catW = ctx.measureText(catLabel).width + 14;
    drawRoundedRect(ctx, kickerBadgeX, 29, catW, 18, 3);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#10B981';
    ctx.stroke();
    ctx.fillStyle = '#34D399';
    ctx.fillText(catLabel, kickerBadgeX + 7, 41);
    kickerBadgeX += catW + 6;
  }
  if ((stock.splitRatioDivisor ?? 1) > 1) {
    const splitLabel = `SPLIT 1:${stock.splitRatioDivisor}`;
    ctx.font = '700 9.0px "Fira Code", monospace';
    const spW = ctx.measureText(splitLabel).width + 14;
    drawRoundedRect(ctx, kickerBadgeX, 29, spW, 18, 3);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.stroke();
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(splitLabel, kickerBadgeX + 7, 41);
  }

  // Main Emiten Title
  ctx.fillStyle = '#F9FAFB';
  ctx.font = '800 21px Montserrat, sans-serif';
  drawTextAutoFit(
    ctx,
    `${stock.ticker} · ${stock.name}`,
    headerTextX,
    68,
    LOGICAL_WIDTH - headerTextX - 310,
    800,
    21,
    14
  );

  // Subtitle with "Tren IHSG" and full Indonesian print date
  ctx.fillStyle = '#9CA3AF';
  const subtitleText = `Sektor IDX-IC: ${stock.sector}   |   Tren IHSG: ${regimeStatus}   |   Dicetak: ${formatIndonesianPrintTimestamp()}`;
  drawTextAutoFit(ctx, subtitleText, headerTextX, 91, LOGICAL_WIDTH - headerTextX - 40, 600, 11.2, 8.8);

  // Right Grade Badge in Header (Synchronized with Post-Penalty Score & Sanity Audit Block)
  const isGradeBlockedExport =
    stock.isHscFlagged || Boolean(joeliardiEval.sanityReport?.isGradeABlocked);
  const gradeText = `${joeliardiEval.convictionGrade} · SKOR ${joeliardiEval.totalConvictionScore}/100`;
  ctx.font = '700 11.5px Montserrat, sans-serif';
  const gradeW = ctx.measureText(gradeText).width + 26;
  const gradeX = LOGICAL_WIDTH - 38 - gradeW;
  const gradeY = 47;
  drawRoundedRect(ctx, gradeX, gradeY, gradeW, 32, 4);
  ctx.fillStyle = isGradeBlockedExport
    ? 'rgba(225, 29, 72, 0.2)'
    : joeliardiEval.totalConvictionScore >= 75
    ? 'rgba(16, 185, 129, 0.18)'
    : joeliardiEval.totalConvictionScore >= 58
    ? 'rgba(245, 158, 11, 0.18)'
    : 'rgba(225, 29, 72, 0.2)';
  ctx.fill();
  ctx.strokeStyle = isGradeBlockedExport
    ? '#F43F5E'
    : joeliardiEval.totalConvictionScore >= 75
    ? '#10B981'
    : joeliardiEval.totalConvictionScore >= 58
    ? '#F59E0B'
    : '#F43F5E';
  ctx.stroke();
  ctx.fillStyle = isGradeBlockedExport
    ? '#FB7185'
    : joeliardiEval.totalConvictionScore >= 75
    ? '#34D399'
    : joeliardiEval.totalConvictionScore >= 58
    ? '#FBBF24'
    : '#FB7185';
  ctx.fillText(gradeText, gradeX + 13, gradeY + 20);

  let curY = 124;

  // 4A. Optional HSC Alert Box (With KSEI Pills & Footnote Box)
  if (hasHscBanner) {
    const isDivPenalty = stock.hscTier === 'KSEI_DIVIDEND_PENALTY';
    drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, hscBannerBoxH, 4);
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

    const bannerHeader =
      stock.hscSource === 'KSEI_OFFICIAL' && isDivPenalty
        ? `DAFTAR RESMI HSC BEI–KSEI (TOP-10: ${kseiPctText}) — DIVIDEN KUAT LOLOS BLOKIR (PENALTI SKOR -${(
            stock.kseiHscScorePenaltyPts ?? 0.45
          )
            .toFixed(2)
            .replace('.', ',')} POIN)`
        : stock.hscSource === 'KSEI_OFFICIAL'
        ? `DAFTAR RESMI HSC BEI–KSEI (TOP-10: ${kseiPctText}) — DIBLOKIR DARI TOP DECILE BUY`
        : stock.hscTier === 'EARLY_WARNING_SUSPECT'
        ? 'RADAR EARLY WARNING QUANT: SUSPECT HSC (PRA-RILIS BEI) — DIBLOKIR DARI TOP DECILE BUY'
        : 'PERINGATAN SAHAM HSC (MANUAL OVERRIDE) — DIBLOKIR DARI TOP DECILE BUY';

    const kseiRightPillText =
      stock.hscSource === 'KSEI_OFFICIAL' && stock.kseiHscConcentrationPct
        ? `Top-10 KSEI: ${kseiPctText}  |  Free Float Maks: ≤${Math.max(
            0.01,
            100 - stock.kseiHscConcentrationPct
          )
            .toFixed(3)
            .replace('.', ',')}%  |  Status: ${kseiNewTag}`
        : '';

    const headerAvailW = kseiRightPillText ? LOGICAL_WIDTH - 108 - 380 : LOGICAL_WIDTH - 108;
    drawTextAutoFit(ctx, bannerHeader, 52, curY + 20, headerAvailW, 700, 10.8, 8.2);

    if (kseiRightPillText) {
      ctx.font = '700 8.8px "Fira Code", monospace';
      const pillW = Math.min(370, ctx.measureText(kseiRightPillText).width + 16);
      const pillX = LOGICAL_WIDTH - 50 - pillW;
      drawRoundedRect(ctx, pillX, curY + 7, pillW, 18, 3);
      ctx.fillStyle = '#11161F';
      ctx.fill();
      ctx.strokeStyle = isDivPenalty ? '#FBBF24' : '#FB7185';
      ctx.stroke();
      ctx.fillStyle = isDivPenalty ? '#FDE68A' : '#FECDD3';
      drawTextAutoFit(
        ctx,
        kseiRightPillText,
        pillX + 8,
        curY + 19,
        pillW - 16,
        700,
        8.8,
        7.2,
        '"Fira Code", monospace'
      );
    }

    ctx.fillStyle = isDivPenalty ? '#FDE68A' : '#FECDD3';
    const subReasonText =
      stock.hscReason || 'Saham ini tercatat dalam radar konsentrasi kepemilikan tinggi.';
    drawTextAutoFit(ctx, subReasonText, 52, curY + 40, LOGICAL_WIDTH - 104, 500, 10.0, 8.0);

    if (hasKseiFootnote && stock.kseiHscFootnote) {
      const fnText = `Catatan Khusus Pengumuman BEI–KSEI: ${formatKseiFootnoteFullDescription(
        stock.kseiHscFootnote
      )}`;
      ctx.fillStyle = '#F9FAFB';
      drawTextAutoFit(
        ctx,
        fnText,
        52,
        curY + 61,
        LOGICAL_WIDTH - 104,
        600,
        9.5,
        7.8,
        '"Fira Code", monospace'
      );
    }

    curY += hscBannerTotalH;
  }

  // 4B. Optional Active Catalyst & Corporate Action Middleware Telemetry Banner
  if (hasCatalystBanner) {
    drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, catalystBannerBoxH, 4);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.48)';
    ctx.stroke();

    const badgeStr = joeliardiEval.catalystBadgeLabel || 'CATALYST ACTIVE';
    ctx.font = '700 9.0px "Fira Code", monospace';
    const bW = ctx.measureText(badgeStr).width + 14;
    drawRoundedRect(ctx, 50, curY + 9, bW, 18, 3);
    ctx.fillStyle = '#0D5C46';
    ctx.fill();
    ctx.strokeStyle = '#10B981';
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(badgeStr, 57, curY + 21);

    ctx.fillStyle = '#34D399';
    drawTextAutoFit(
      ctx,
      'Basis TTM_DEFAULT Terdekumulasi & Dual-Confirmation Catalyst Aktif',
      50 + bW + 10,
      curY + 21,
      catalystLeftMaxW - bW - 14,
      700,
      10.8,
      8.5
    );

    ctx.fillStyle = '#E5E7EB';
    ctx.font = '500 10.2px Montserrat, sans-serif';
    catalystNarrativeLines.forEach((ln, idx) => {
      drawTextAutoFit(ctx, ln, 50, curY + 41 + idx * 15, catalystLeftMaxW, 500, 10.2, 8.2);
    });

    // Right Telemetry Box inside Catalyst Banner
    const rBoxW = 266;
    const rBoxX = LOGICAL_WIDTH - 50 - rBoxW;
    const rBoxY = curY + Math.max(9, Math.round((catalystBannerBoxH - 44) / 2));
    drawRoundedRect(ctx, rBoxX, rBoxY, rBoxW, 44, 3);
    ctx.fillStyle = '#11161F';
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
    ctx.stroke();

    const roeTtmDisplay = (
      joeliardiEval.valuationLedger?.roeTTM ??
      joeliardiEval.trailingRoePct ??
      stock.roe
    ).toFixed(1);
    const niYoYDisplay = (
      joeliardiEval.valuationLedger?.netIncomeYoYPct ??
      stock.earningsGrowthYoYPct ??
      0
    ).toFixed(1);
    const bbYield = (joeliardiEval.dynamicBuybackYieldPct ?? 0).toFixed(2);
    const tsyVal = (
      joeliardiEval.totalShareholderYieldPct ?? joeliardiEval.forwardDividendYieldPct
    ).toFixed(2);

    ctx.fillStyle = '#F9FAFB';
    drawTextAutoFit(
      ctx,
      `ROE TTM: ${roeTtmDisplay}% · NI YoY: ${Number(niYoYDisplay) >= 0 ? '+' : ''}${niYoYDisplay}%`,
      rBoxX + 10,
      rBoxY + 17,
      rBoxW - 20,
      700,
      9.8,
      8.0,
      '"Fira Code", monospace'
    );
    ctx.fillStyle = '#38BDF8';
    drawTextAutoFit(
      ctx,
      `Buyback Yield: +${bbYield}% · TSY: ${tsyVal}%`,
      rBoxX + 10,
      rBoxY + 34,
      rBoxW - 20,
      700,
      9.8,
      8.0,
      '"Fira Code", monospace'
    );

    curY += catalystBannerTotalH;
  }

  // 4C. Concise 1-Line IDX-IC Sector Methodology Notice Strip (Synchronized with UI Modal)
  if (hasSectorNoticeBanner && joeliardiEval.sectorMethodologyNotice) {
    drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, 32, 4);
    ctx.fillStyle = '#0D131C';
    ctx.fill();
    ctx.strokeStyle = '#222C3C';
    ctx.stroke();

    const secBadgeText =
      secProfile?.regimeBadgeLabel || `IDX-IC: ${stock.sector.toUpperCase()}`;
    ctx.font = '700 8.8px "Fira Code", monospace';
    const sbW = ctx.measureText(secBadgeText).width + 14;
    drawRoundedRect(ctx, 48, curY + 7, sbW, 18, 3);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.20)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
    ctx.stroke();
    ctx.fillStyle = '#34D399';
    ctx.fillText(secBadgeText, 55, curY + 19);

    ctx.fillStyle = '#E2E8F0';
    drawTextAutoFit(
      ctx,
      joeliardiEval.sectorMethodologyNotice,
      48 + sbW + 10,
      curY + 20,
      LOGICAL_WIDTH - 76 - sbW - 34,
      500,
      9.8,
      7.6
    );

    curY += sectorNoticeBannerTotalH;
  }

  // 5. Row 1: 4 Valuation & Intrinsic Cards (Synchronized with Prev Close, Floor G-J, & State)
  const cardGap = 14;
  const cardW = (LOGICAL_WIDTH - 76 - cardGap * 3) / 4;
  const innerCardMaxW = cardW - 24;
  const ytdExportPct =
    typeof stock.returnYTD === 'number'
      ? stock.returnYTD
      : Number((stock.return30D * 1.45).toFixed(1));
  const floorGjIdr =
    joeliardiEval.grahamJoeliardiBenchmarkIdr ??
    Math.round(joeliardiEval.intrinsicValueIdr * 0.82);
  const rimOmegaStr = (joeliardiEval.rimPersistenceOmega ?? 0.72).toFixed(2);
  const rimFairIdr = joeliardiEval.rimFairValueIdr ?? joeliardiEval.intrinsicValueIdr;
  const isMosStatePositive =
    Boolean(joeliardiEval.isHighConvictionActionEligible) &&
    (joeliardiEval.marginOfSafetyPct >= 10 ||
      joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST' ||
      joeliardiEval.decisionState === 'STRONG_BUY_CYCLICAL_ZSCORE' ||
      joeliardiEval.decisionState === 'ACCUMULATE_QUALITY_FAIR_VALUE');

  const valCards: Array<{
    label: string;
    labelColor: string;
    main: string;
    mainColor: string;
    rightMainAux?: string;
    sub: string;
    subColor: string;
    subSegments?: Array<{ text: string; color: string }>;
  }> = [
    {
      label: 'HARGA PASAR LIVE (BEI)',
      labelColor: '#9CA3AF',
      main: `Rp ${formatIdrPriceDisplay(stock.lastPrice)}`,
      mainColor: '#F9FAFB',
      rightMainAux:
        typeof stock.previousClose === 'number' && stock.previousClose > 0
          ? `Prev: Rp ${formatIdrPriceDisplay(stock.previousClose)}`
          : undefined,
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
      sub: `Floor G-J: Rp ${formatIdrPriceDisplay(floorGjIdr)} · RIM ω=${rimOmegaStr}: Rp ${formatIdrPriceDisplay(rimFairIdr)}`,
      subColor: '#9CA3AF',
      subSegments: [
        { text: 'Floor G-J: ', color: '#9CA3AF' },
        { text: `Rp ${formatIdrPriceDisplay(floorGjIdr)}`, color: '#34D399' },
        {
          text: ` · RIM: Rp ${formatIdrPriceDisplay(rimFairIdr)}`,
          color: '#9CA3AF'
        }
      ]
    },
    {
      label: 'MARGIN OF SAFETY & STATE',
      labelColor: '#9CA3AF',
      main: `${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}%`,
      mainColor: isMosStatePositive
        ? '#34D399'
        : joeliardiEval.marginOfSafetyPct >= 0
        ? '#FBBF24'
        : '#FB7185',
      sub: joeliardiEval.valuationLabel,
      subColor:
        joeliardiEval.isHighConvictionActionEligible &&
        (joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST' ||
          joeliardiEval.decisionState === 'STRONG_BUY_CYCLICAL_ZSCORE')
          ? '#34D399'
          : '#D1D5DB'
    },
    {
      label: `MATRIKS SEKTOR (${joeliardiEval.sectorPrimaryMetricShort ?? 'PBV'}) & PBV`,
      labelColor: '#9CA3AF',
      main: `${joeliardiEval.sectorPrimaryMetricShort ?? 'PBV'} ${
        joeliardiEval.sectorPrimaryImpliedMultiple ?? joeliardiEval.impliedPbv
      }x (Wajar ${joeliardiEval.sectorPrimaryFairMultiple ?? justPbv}x)`,
      mainColor: '#F9FAFB',
      sub: `PBV ${joeliardiEval.impliedPbv}x (Wajar ${justPbv}x) · PER ${joeliardiEval.impliedPer}x`,
      subColor: '#38BDF8'
    }
  ];

  valCards.forEach((c, idx) => {
    const x = 38 + idx * (cardW + cardGap);
    drawRoundedRect(ctx, x, curY, cardW, 88, 4);
    ctx.fillStyle = '#141B26';
    ctx.fill();
    ctx.strokeStyle = '#243044';
    ctx.stroke();

    ctx.fillStyle = c.labelColor;
    drawTextAutoFit(ctx, c.label, x + 12, curY + 22, innerCardMaxW, 700, 10, 8.0);

    ctx.fillStyle = c.mainColor;
    const mainMaxW = c.rightMainAux ? innerCardMaxW - 95 : innerCardMaxW;
    drawTextAutoFit(
      ctx,
      c.main,
      x + 12,
      curY + 49,
      mainMaxW,
      idx === 3 ? 700 : 800,
      idx === 3 ? 13.5 : 18.5,
      11.0,
      '"Fira Code", monospace'
    );

    if (c.rightMainAux) {
      ctx.fillStyle = '#9CA3AF';
      ctx.textAlign = 'right';
      drawTextAutoFit(
        ctx,
        c.rightMainAux,
        x + cardW - 12,
        curY + 48,
        92,
        600,
        9.5,
        7.5,
        '"Fira Code", monospace'
      );
      ctx.textAlign = 'left';
    }

    if (c.subSegments && c.subSegments.length > 0) {
      let fontSize = 9.8;
      const minSize = 7.2;
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
        ctx.fillText(seg.text, segX, curY + 72);
        segX += ctx.measureText(seg.text).width;
      }
    } else {
      ctx.fillStyle = c.subColor;
      drawTextAutoFit(
        ctx,
        c.sub,
        x + 12,
        curY + 72,
        innerCardMaxW,
        600,
        10.2,
        7.5,
        '"Fira Code", monospace'
      );
    }
  });

  curY += 102;

  // 6. Row 2: 4 Academic Pillar Scores (Synchronized with ROE TTM, TSY/Net Payout breakdown, & Decision State)
  const roeTtmVal =
    joeliardiEval.valuationLedger?.roeTTM ??
    joeliardiEval.trailingRoePct ??
    stock.roe;
  const tsyOrNetPayoutLabel =
    (joeliardiEval.netDebtPaydownYieldPct ?? 0) > 0 && stock.sector !== 'Financials'
      ? 'TSY'
      : 'Net Payout';
  const totalTsyPct =
    joeliardiEval.totalShareholderYieldPct ?? joeliardiEval.forwardDividendYieldPct;
  const buybackPart =
    (joeliardiEval.dynamicBuybackYieldPct ?? 0) > 0
      ? ` + Buyback ${(joeliardiEval.dynamicBuybackYieldPct ?? 0).toFixed(2)}%`
      : '';
  const debtPayPart =
    (joeliardiEval.netDebtPaydownYieldPct ?? 0) > 0
      ? ` + DebtPay ${(joeliardiEval.netDebtPaydownYieldPct ?? 0).toFixed(2)}%`
      : '';

  const pillars = [
    {
      title: secProfile?.pillar1Title || '1. Gross Profit & Anti-Junk',
      score: joeliardiEval.businessQualityScore,
      color: '#10B981',
      lines: secProfile?.pillar1Lines ?? [
        `GP/A (Novy-Marx): ${gpToAssets.toFixed(1)}% (ROE TTM ${roeTtmVal.toFixed(1)}%)`,
        `OCF/NI (Anti-Junk): ${ocfNi.toFixed(2)}x ${
          accrualPen > 0
            ? `(Penalti -${accrualPen} pts)`
            : (joeliardiEval.effectiveModule ?? joeliardiEval.valuationReport?.applied_module) === 'Capex_Aggressor'
            ? '(Lolos Rule B >0,50x)'
            : '(Kas Riil Sehat >0,80x)'
        }`,
        `${tsyOrNetPayoutLabel}: ${totalTsyPct.toFixed(2)}% (Div ${joeliardiEval.forwardDividendYieldPct.toFixed(2)}%${buybackPart}${debtPayPart})`
      ]
    },
    {
      title: secProfile?.pillar2Title || '2. Kesehatan Neraca',
      score: joeliardiEval.balanceSheetHealthScore,
      color: '#38BDF8',
      lines: secProfile?.pillar2Lines ?? [
        `DER: ${stock.debtToEquity.toFixed(2)}x`,
        `Status Neraca: ${stock.debtToEquity <= 0.8 ? 'Konservatif' : 'Moderat/Tinggi'}`,
        stock.hscSource === 'KSEI_OFFICIAL' && stock.kseiHscConcentrationPct
          ? `Status HSC: KSEI ${stock.kseiHscConcentrationPct.toFixed(2).replace('.', ',')}%${
              stock.kseiHscIsNew ? ' (BARU)' : ''
            }${
              stock.kseiHscFootnote && stock.kseiHscFootnote !== 'NONE'
                ? ' ' + formatKseiFootnoteShortLabel(stock.kseiHscFootnote)
                : ''
            }`
          : stock.hscTier === 'EARLY_WARNING_SUSPECT'
          ? 'Status HSC: Suspect HSC (Early Warning)'
          : stock.isHscFlagged
          ? 'Status HSC: Manual HSC Blokir'
          : 'Status HSC: Bebas HSC (<92,5%)'
      ]
    },
    {
      title: secProfile?.pillar3Title || '3. Justified PBV & Kurva SBN',
      score: joeliardiEval.valuationSafetyScore,
      color: '#F59E0B',
      lines: [
        `Justified PBV: ${justPbv}x (g ${sustGrowth.toFixed(1)}%)`,
        `Spot SBN Blended: ${sbnBlended.toFixed(2)}% → Ke ${dynKe.toFixed(2)}%`,
        `State: ${
          joeliardiEval.isHighConvictionActionEligible &&
          joeliardiEval.decisionState === 'BUY_ON_STRENGTH_CATALYST'
            ? 'Buy on Strength / Catalyst'
            : `${joeliardiEval.valuationLabel} (MoS ${
                joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''
              }${joeliardiEval.marginOfSafetyPct.toFixed(1)}%)`
        }`
      ]
    },
    {
      title: secProfile?.pillar4Title || '4. 1/β Barbell Position Sizing',
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
    ctx.font = '700 11.5px "Fira Code", monospace';
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

    ctx.fillStyle = '#D1D5DB';
    p.lines.forEach((ln, lIdx) => {
      drawTextAutoFit(
        ctx,
        ln,
        x + 12,
        curY + 57 + lIdx * 18,
        innerCardMaxW,
        500,
        10.0,
        7.5,
        '"Fira Code", monospace'
      );
    });
  });

  curY += 130;

  // 7. Multi-Method Fair Value Comparison, Dynamic Ensemble, Standalone Floor Bar & StatArb
  const secShortLabel = joeliardiEval.sectorPrimaryMetricShort ?? 'PBV';
  const secFullLabel = joeliardiEval.sectorPrimaryMetricLabel ?? 'Damodaran Justified PBV';
  const secFairIdr = joeliardiEval.sectorSpecificFairValueIdr ?? joeliardiEval.intrinsicValueIdr;
  const statArbFairIdr = joeliardiEval.statArbImpliedTargetIdr ?? joeliardiEval.intrinsicValueIdr;
  const peerTkr = joeliardiEval.statArbPeerTicker ?? 'PEER';
  const zScoreVal = joeliardiEval.statArbZScore ?? 0;
  const rhoVal = joeliardiEval.statArbCorrelation ?? 0.85;

  // Section Header Row (Row 1: Title, Row 2: Dedicated Sector & Router Badges Sub-Row)
  ctx.fillStyle = '#10B981';
  ctx.font = '700 9.5px Montserrat, sans-serif';
  ctx.fillText('QUANTEDGE SECTOR-ADAPTIVE ROUTER & DYNAMIC ENSEMBLE', 38, curY + 12);

  ctx.fillStyle = '#F9FAFB';
  ctx.font = '700 13px Montserrat, sans-serif';
  ctx.fillText('Komparasi Multi-Metode Harga Wajar & Standalone Floor', 38, curY + 29);

  // Row 2 Sub-Header: Matriks Utama Sektor & Router Module Badges (No horizontal collision with title)
  let badgeRowX = 38;
  const badgeRowY = curY + 37;
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '600 9.2px "Fira Code", monospace';
  const secPrefixStr = 'Matriks Utama Sektor:';
  ctx.fillText(secPrefixStr, badgeRowX, badgeRowY + 14);
  badgeRowX += ctx.measureText(secPrefixStr).width + 8;

  ctx.font = '700 9.0px "Fira Code", monospace';
  const maxSecBadgeW = Math.min(430, ctx.measureText(secFullLabel).width + 16);
  drawRoundedRect(ctx, badgeRowX, badgeRowY, maxSecBadgeW, 20, 3);
  ctx.fillStyle = 'rgba(217, 119, 6, 0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
  ctx.stroke();
  ctx.fillStyle = '#FBBF24';
  drawTextAutoFit(
    ctx,
    secFullLabel,
    badgeRowX + 8,
    badgeRowY + 13.5,
    maxSecBadgeW - 16,
    700,
    9.0,
    7.4,
    '"Fira Code", monospace'
  );
  badgeRowX += maxSecBadgeW + 10;

  if (joeliardiEval.valuationModuleLabel) {
    const appliedModSuffix = joeliardiEval.valuationReport?.applied_module
      ? ` [${joeliardiEval.valuationReport.applied_module}]`
      : '';
    const routerText = `Router: ${joeliardiEval.valuationModuleLabel}${appliedModSuffix}`;
    ctx.font = '700 9.0px "Fira Code", monospace';
    const availRouterW = Math.max(160, LOGICAL_WIDTH - 38 - badgeRowX);
    const rBadgeW = Math.min(availRouterW, ctx.measureText(routerText).width + 16);
    drawRoundedRect(ctx, badgeRowX, badgeRowY, rBadgeW, 20, 3);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
    ctx.stroke();
    ctx.fillStyle = '#34D399';
    drawTextAutoFit(
      ctx,
      routerText,
      badgeRowX + 8,
      badgeRowY + 13.5,
      rBadgeW - 16,
      700,
      9.0,
      7.2,
      '"Fira Code", monospace'
    );
  }

  curY += 66;

  // Optional UI Notifications Alert Banner (Dynamic Context-Aware Warning Badges)
  if (preparedUiNotifications.length > 0) {
    preparedUiNotifications.forEach((notifItem) => {
      const { badgeMeta } = notifItem;
      drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, notifItem.boxH, 4);
      ctx.fillStyle = badgeMeta.canvasBoxFillRgba;
      ctx.fill();
      ctx.strokeStyle = badgeMeta.canvasBoxStrokeRgba;
      ctx.stroke();

      // Left Pill Badge
      ctx.font = '800 8.2px "Fira Code", monospace';
      const pillW = 122;
      drawRoundedRect(ctx, 50, curY + 8, pillW, 18, 3);
      ctx.fillStyle = badgeMeta.pillBgHex;
      ctx.fill();
      ctx.fillStyle = badgeMeta.pillTextHex;
      drawTextAutoFit(
        ctx,
        badgeMeta.badgeLabel,
        56,
        curY + 20,
        pillW - 12,
        800,
        8.2,
        7.0,
        '"Fira Code", monospace'
      );

      // Wrapped Warning Lines
      ctx.fillStyle = badgeMeta.canvasTextHex;
      notifItem.wrappedLines.forEach((ln, lIdx) => {
        drawTextAutoFit(
          ctx,
          ln,
          182,
          curY + 19 + lIdx * 14,
          LOGICAL_WIDTH - 76 - 154,
          600,
          9.5,
          7.8,
          '"Fira Code", monospace'
        );
      });

      curY += notifItem.boxH + 6;
    });
    curY += 2;
  }

  // Formula Calculation Strip ("Perhitungan harga wajar :")
  drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, 30, 4);
  ctx.fillStyle = '#141B26';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.stroke();

  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 10.5px "Fira Code", monospace';
  ctx.fillText('Perhitungan harga wajar :', 50, curY + 19);

  const ledger = joeliardiEval.valuationLedger;
  const histLegCard = ensembleCards.find(
    (x) => x.id === 'historical_evebitda_5y' || x.id === 'statarb_relative_peer'
  );
  const leg1Idr = ledger?.components[0]?.value ?? secFairIdr;
  const leg2Idr = ledger?.components[1]?.value ?? rimFairIdr;
  const leg3Idr =
    ledger?.components[2]?.value ??
    histLegCard?.fairPriceIdr ??
    joeliardiEval.valuationResult?.valuationLedger?.components[2]?.value ??
    statArbFairIdr;
  const leg3Label =
    ledger?.components[2]?.label ??
    histLegCard?.shortLabel ??
    (stock.sector === 'Financials' ? 'Hist PBV Band 5Y' : 'Hist EV/EBITDA Band 5Y');

  const formulaStr =
    ledger?.formulaAudit ||
    joeliardiEval.ensembleFormulaAudit ||
    `(Rp ${formatIdrPriceDisplay(leg1Idr)} × 45%) + (Rp ${formatIdrPriceDisplay(leg2Idr)} × 35%) + (Rp ${formatIdrPriceDisplay(leg3Idr)} × 20%) = Rp ${formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)}`;
  ctx.fillStyle = '#F9FAFB';
  drawTextAutoFit(
    ctx,
    formulaStr,
    224,
    curY + 19,
    LOGICAL_WIDTH - 274,
    700,
    10.5,
    8.2,
    '"Fira Code", monospace'
  );

  curY += 38;

  // Dynamic Weights & Contributions from Single Source of Truth ValuationLedger
  const secLeg = ensembleCards.find((x) => x.id === 'sector_specific_matrix');
  const rimLeg = ensembleCards.find((x) => x.id === 'multistage_rim');
  const relLeg = histLegCard;

  const secWeightDec =
    ledger?.components[0]?.weight ?? (secLeg?.weightPct ?? 45) / 100;
  const rimWeightDec =
    ledger?.components[1]?.weight ?? (rimLeg?.weightPct ?? 35) / 100;
  const relWeightDec =
    ledger?.components[2]?.weight ?? (relLeg?.weightPct ?? 20) / 100;

  const totalModelFinalIdr = Math.max(1, joeliardiEval.intrinsicValueIdr);
  const secContribIdr = Math.round(leg1Idr * secWeightDec);
  const rimContribIdr = Math.round(leg2Idr * rimWeightDec);
  const relContribIdr = Math.max(0, Math.round(leg3Idr * relWeightDec));

  const secSharePct = Math.max(0, Math.min(100, Math.round(secWeightDec * 100)));
  const rimSharePct = Math.max(0, Math.min(100, Math.round(rimWeightDec * 100)));
  const relSharePct = Math.max(0, 100 - secSharePct - rimSharePct);

  const calcMethodMos = (fIdr: number) =>
    Number((((fIdr - stock.lastPrice) / Math.max(1, fIdr)) * 100).toFixed(1));

  const cardsToRender =
    ensembleCards.length >= 4
      ? ensembleCards.slice(0, 4)
      : [
          {
            id: 'quantedge_ensemble',
            name: 'Quantedge Sector-Adaptive Ensemble',
            shortLabel: 'Quantedge Ensemble',
            metricBasis: `${secSharePct}% ${secShortLabel} + ${rimSharePct}% RIM (${joeliardiEval.rimFadeYears ?? 6}Y) + ${relSharePct}% ${leg3Label}`,
            impliedMultipleLabel: `PBV ${joeliardiEval.impliedPbv}x`,
            fairMultipleLabel: `Just. ${justPbv}x`,
            fairPriceIdr: joeliardiEval.intrinsicValueIdr,
            mosPct: joeliardiEval.marginOfSafetyPct,
            weightPct: 100,
            isPrimaryEnsemble: true
          },
          {
            id: 'sector_specific_matrix',
            name: `Matriks Spesifik Sektor: ${secFullLabel}`,
            shortLabel: secShortLabel,
            metricBasis: `${secShortLabel} Aktual vs Wajar Sektor`,
            impliedMultipleLabel: `${joeliardiEval.sectorPrimaryImpliedMultiple ?? joeliardiEval.impliedPbv}x`,
            fairMultipleLabel: `${joeliardiEval.sectorPrimaryFairMultiple ?? justPbv}x`,
            fairPriceIdr: leg1Idr,
            mosPct: calcMethodMos(leg1Idr),
            weightPct: secSharePct
          },
          {
            id: 'multistage_rim',
            name: `Multi-Stage Residual Income (Ohlson-Penman ${joeliardiEval.rimFadeYears ?? 6}Y)`,
            shortLabel: 'Multi-Stage RIM',
            metricBasis: `BVPS Rp ${joeliardiEval.estimatedBvpsIdr.toLocaleString('id-ID')} · ROE TTM ${roeTtmVal.toFixed(1)}% · ω=${rimOmegaStr}`,
            impliedMultipleLabel: `PBV ${joeliardiEval.impliedPbv}x`,
            fairMultipleLabel: `RIM ${justPbv}x`,
            fairPriceIdr: leg2Idr,
            mosPct: calcMethodMos(leg2Idr),
            weightPct: rimSharePct
          },
          {
            id: 'historical_evebitda_5y',
            name: `Historical 5Y Multiple Band (${leg3Label})`,
            shortLabel: leg3Label,
            metricBasis: `Mean-Reversion Band 5Y vs Sektor ${stock.sector}`,
            impliedMultipleLabel: `PER ${joeliardiEval.impliedPer}x`,
            fairMultipleLabel: `PBV ${justPbv}x`,
            fairPriceIdr: leg3Idr,
            mosPct: calcMethodMos(leg3Idr),
            weightPct: relSharePct
          }
        ];

  cardsToRender.forEach((m, idx) => {
    const x = 38 + idx * (cardW + cardGap);
    const isPrimary = Boolean(m.isPrimaryEnsemble);
    const cleanMethodName = m.name.replace(/\s*\(Utama\)/i, '');

    drawRoundedRect(ctx, x, curY, cardW, multiMethodCardsH, 4);
    ctx.fillStyle = isPrimary ? '#172030' : '#11161F';
    ctx.fill();
    ctx.strokeStyle = isPrimary ? '#F59E0B' : '#243044';
    ctx.stroke();

    // Kicker + Dynamic Weight
    ctx.fillStyle = isPrimary ? '#F59E0B' : '#9CA3AF';
    drawTextAutoFit(
      ctx,
      isPrimary ? '★ MODEL FINAL' : 'KOMPONEN ENSEMBLE',
      x + 12,
      curY + 16,
      innerCardMaxW - 65,
      700,
      8.5,
      7.2
    );

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 8.5px "Fira Code", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`Bobot ${(m.weightPct ?? 0).toFixed(0)}%`, x + cardW - 12, curY + 16);
    ctx.textAlign = 'left';

    // Method Title (Wrapped up to 2 clean lines inside card)
    ctx.fillStyle = '#F9FAFB';
    drawWrappedTextBlock(
      ctx,
      cleanMethodName,
      x + 12,
      curY + 31,
      innerCardMaxW,
      2,
      12.0,
      700,
      9.3,
      7.6,
      'Montserrat, sans-serif'
    );

    // Fair Price + MoS%
    ctx.fillStyle = '#F9FAFB';
    drawTextAutoFit(
      ctx,
      `Rp ${formatIdrPriceDisplay(m.fairPriceIdr)}`,
      x + 12,
      curY + 66,
      innerCardMaxW - 58,
      800,
      15.5,
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
      curY + 65
    );
    ctx.textAlign = 'left';

    // Contribution Inner Box (Matches Web UI)
    const contribBoxY = curY + 75;
    drawRoundedRect(ctx, x + 10, contribBoxY, cardW - 20, 44, 3);
    ctx.fillStyle = '#141B26';
    ctx.fill();
    ctx.strokeStyle = '#1F2A3C';
    ctx.stroke();

    const barTrackX = x + 16;
    const barTrackY = contribBoxY + 19;
    const barTrackW = cardW - 32;
    const barTrackH = 5.5;

    if (isPrimary) {
      ctx.fillStyle = '#E5E7EB';
      ctx.font = '700 8.2px "Fira Code", monospace';
      ctx.fillText('Akumulasi Dinamis:', barTrackX, contribBoxY + 12);
      ctx.fillStyle = '#FBBF24';
      ctx.textAlign = 'right';
      ctx.fillText(
        `100% (Rp ${formatIdrPriceDisplay(totalModelFinalIdr)})`,
        barTrackX + barTrackW,
        contribBoxY + 12
      );
      ctx.textAlign = 'left';

      drawRoundedRect(ctx, barTrackX, barTrackY, barTrackW, barTrackH, 2);
      ctx.fillStyle = '#222C3C';
      ctx.fill();

      const w1 = secSharePct > 0 ? Math.max(6, Math.round((barTrackW * secSharePct) / 100)) : 0;
      const w2 = rimSharePct > 0 ? Math.max(6, Math.round((barTrackW * rimSharePct) / 100)) : 0;
      const w3 = relSharePct > 0 ? Math.max(0, barTrackW - w1 - w2 - 2) : 0;
      let curBarX = barTrackX;
      if (w1 > 0) {
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(curBarX, barTrackY, w1, barTrackH);
        curBarX += w1 + 1;
      }
      if (w2 > 0) {
        ctx.fillStyle = '#10B981';
        ctx.fillRect(curBarX, barTrackY, w2, barTrackH);
        curBarX += w2 + 1;
      }
      if (w3 > 0) {
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(curBarX, barTrackY, w3, barTrackH);
      }

      const sumBreakStr = `+Rp ${formatIdrPriceDisplay(secContribIdr)} + Rp ${formatIdrPriceDisplay(rimContribIdr)} + Rp ${formatIdrPriceDisplay(relContribIdr)}`;
      ctx.fillStyle = '#D1D5DB';
      drawTextAutoFit(
        ctx,
        sumBreakStr,
        barTrackX,
        contribBoxY + 37,
        barTrackW,
        600,
        8.0,
        6.8,
        '"Fira Code", monospace'
      );
    } else {
      const compContribIdr =
        m.id === 'sector_specific_matrix'
          ? secContribIdr
          : m.id === 'multistage_rim'
          ? rimContribIdr
          : relContribIdr;
      const compColor =
        m.id === 'sector_specific_matrix'
          ? '#FBBF24'
          : m.id === 'multistage_rim'
          ? '#34D399'
          : '#38BDF8';
      const compSharePct = Math.min(100, Math.max(0, Math.round(m.weightPct ?? 0)));

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '600 8.2px "Fira Code", monospace';
      ctx.fillText(`Kontribusi (${(m.weightPct ?? 0).toFixed(0)}%):`, barTrackX, contribBoxY + 12);

      ctx.fillStyle = compColor;
      ctx.textAlign = 'right';
      ctx.font = '700 8.2px "Fira Code", monospace';
      ctx.fillText(
        `+Rp ${formatIdrPriceDisplay(compContribIdr)} ke Final`,
        barTrackX + barTrackW,
        contribBoxY + 12
      );
      ctx.textAlign = 'left';

      drawRoundedRect(ctx, barTrackX, barTrackY, barTrackW, barTrackH, 2);
      ctx.fillStyle = '#222C3C';
      ctx.fill();

      if (compSharePct > 0) {
        const fillW = Math.max(6, Math.round((barTrackW * compSharePct) / 100));
        drawRoundedRect(ctx, barTrackX, barTrackY, fillW, barTrackH, 2);
        ctx.fillStyle = compColor;
        ctx.fill();
      }

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '500 8.0px "Fira Code", monospace';
      ctx.fillText(
        `Rp ${formatIdrPriceDisplay(m.fairPriceIdr)} × ${(m.weightPct ?? 0).toFixed(0)}%`,
        barTrackX,
        contribBoxY + 37
      );
      ctx.textAlign = 'right';
      ctx.fillText(`${compSharePct}% bobot dinamis`, barTrackX + barTrackW, contribBoxY + 37);
      ctx.textAlign = 'left';
    }

    // Bottom blocks: metricBasis (up to 2 lines) & Aktual vs Wajar (up to 2 lines)
    ctx.fillStyle = '#D1D5DB';
    drawWrappedTextBlock(
      ctx,
      m.metricBasis,
      x + 12,
      curY + 135,
      innerCardMaxW,
      2,
      11.8,
      500,
      8.2,
      7.0,
      '"Fira Code", monospace'
    );

    ctx.fillStyle = '#9CA3AF';
    drawWrappedTextBlock(
      ctx,
      `Aktual: ${m.impliedMultipleLabel} · Wajar: ${m.fairMultipleLabel}`,
      x + 12,
      curY + 163,
      innerCardMaxW,
      2,
      11.8,
      500,
      8.1,
      7.0,
      '"Fira Code", monospace'
    );
  });

  curY += multiMethodCardsH;

  // 7B. Full-Width Horizontal Bar for Graham-Joeliardi Standalone Floor Benchmark
  if (hasStandaloneFloorBar && standaloneFloorMethod) {
    curY += 10;
    const floorBoxX = 38;
    const floorBoxW = LOGICAL_WIDTH - 76;
    drawRoundedRect(ctx, floorBoxX, curY, floorBoxW, standaloneFloorBarH, 4);
    ctx.fillStyle = '#131B27';
    ctx.fill();
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    const col1W = Math.round(floorBoxW * 0.35);
    const col2W = Math.round(floorBoxW * 0.42);
    const col3W = floorBoxW - col1W - col2W;
    const col1X = floorBoxX + 14;
    const col2X = floorBoxX + col1W + 14;
    const col3X = floorBoxX + col1W + col2W + 14;

    // Column 1: Kicker, Name (up to 2 lines), Moat Sanity Check (up to 2 lines)
    ctx.fillStyle = '#34D399';
    ctx.font = '700 8.8px Montserrat, sans-serif';
    ctx.fillText('⚓ FLOOR BENCHMARK', col1X, curY + 18);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 8.6px "Fira Code", monospace';
    drawTextAutoFit(
      ctx,
      '· Standalone (0% Bobot Ensemble)',
      col1X + ctx.measureText('⚓ FLOOR BENCHMARK').width + 10,
      curY + 18,
      col1W - ctx.measureText('⚓ FLOOR BENCHMARK').width - 32,
      600,
      8.6,
      7.2,
      '"Fira Code", monospace'
    );

    ctx.fillStyle = '#F9FAFB';
    drawWrappedTextBlock(
      ctx,
      standaloneFloorMethod.name.replace(/\s*\(Utama\)/i, ''),
      col1X,
      curY + 35,
      col1W - 26,
      2,
      12.5,
      700,
      10.2,
      8.2,
      'Montserrat, sans-serif'
    );

    const moatNote = joeliardiEval.isMoatHaircutApplied
      ? 'Sanity Check Floor: Weak Moat Penalty -25% (ROE<15% / DER>1x)'
      : 'Sanity Check Floor: Moat Kuat Terverifikasi (0% Haircut Penalty)';
    ctx.fillStyle = '#34D399';
    drawWrappedTextBlock(
      ctx,
      moatNote,
      col1X,
      curY + 65,
      col1W - 26,
      2,
      11.8,
      600,
      8.4,
      7.2,
      '"Fira Code", monospace'
    );

    // Vertical Divider 1
    ctx.strokeStyle = '#243044';
    ctx.beginPath();
    ctx.moveTo(floorBoxX + col1W, curY + 12);
    ctx.lineTo(floorBoxX + col1W, curY + standaloneFloorBarH - 12);
    ctx.stroke();

    // Column 2: Metric Basis (wrapped up to 3 lines) & Aktual vs Wajar (wrapped up to 2 lines)
    ctx.fillStyle = '#E5E7EB';
    drawWrappedTextBlock(
      ctx,
      standaloneFloorMethod.metricBasis,
      col2X,
      curY + 22,
      col2W - 28,
      3,
      12.8,
      600,
      8.8,
      7.4,
      '"Fira Code", monospace'
    );
    ctx.fillStyle = '#9CA3AF';
    drawWrappedTextBlock(
      ctx,
      `Aktual: ${standaloneFloorMethod.impliedMultipleLabel} · Wajar: ${standaloneFloorMethod.fairMultipleLabel}`,
      col2X,
      curY + 67,
      col2W - 28,
      2,
      11.8,
      500,
      8.5,
      7.2,
      '"Fira Code", monospace'
    );

    // Vertical Divider 2
    ctx.strokeStyle = '#243044';
    ctx.beginPath();
    ctx.moveTo(floorBoxX + col1W + col2W, curY + 12);
    ctx.lineTo(floorBoxX + col1W + col2W, curY + standaloneFloorBarH - 12);
    ctx.stroke();

    // Column 3: Floor Price, MoS% & Diff vs Model Final (strictly bounded inside Column 3)
    const rightEdgeX = floorBoxX + floorBoxW - 14;
    const col3InnerW = col3W - 28;
    const flMos = standaloneFloorMethod.mosPct;
    const flMosStr = `${flMos >= 0 ? '+' : ''}${flMos.toFixed(1)}%`;
    ctx.font = '700 10.5px "Fira Code", monospace';
    const flMosW = ctx.measureText(flMosStr).width;

    ctx.fillStyle = flMos >= 10 ? '#34D399' : flMos >= 0 ? '#FBBF24' : '#FB7185';
    ctx.textAlign = 'right';
    ctx.fillText(flMosStr, rightEdgeX, curY + 34);

    ctx.fillStyle = '#F9FAFB';
    drawTextAutoFit(
      ctx,
      `Rp ${formatIdrPriceDisplay(standaloneFloorMethod.fairPriceIdr)}`,
      rightEdgeX - flMosW - 8,
      curY + 35,
      Math.max(70, col3InnerW - flMosW - 10),
      800,
      16.0,
      11.5,
      '"Fira Code", monospace'
    );
    ctx.textAlign = 'left';

    const diffPct =
      standaloneFloorMethod.fairPriceIdr <= totalModelFinalIdr
        ? `Selisih vs Final: Floor -${Math.round(
            ((totalModelFinalIdr - standaloneFloorMethod.fairPriceIdr) /
              Math.max(1, totalModelFinalIdr)) *
              100
          )}% di bawah Final`
        : `Selisih vs Final: Floor +${Math.round(
            ((standaloneFloorMethod.fairPriceIdr - totalModelFinalIdr) /
              Math.max(1, totalModelFinalIdr)) *
              100
          )}% di atas Final`;
    ctx.fillStyle = '#9CA3AF';
    drawWrappedTextBlock(
      ctx,
      diffPct,
      col3X,
      curY + 58,
      col3InnerW,
      2,
      12.2,
      600,
      8.5,
      7.2,
      '"Fira Code", monospace'
    );

    curY += standaloneFloorBarH;
  }

  curY += 12;

  // 7C. Draw 2-Column StatArb Box (Left) & Sector/RIM Rationale Box (Right)
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
    statArbBoxW - 265,
    700,
    9.5,
    8.0
  );

  const saSignal = joeliardiEval.statArbSignal;
  const saBadgeText =
    joeliardiEval.statArbSignalLabel ||
    `Kointegrasi Seimbang vs ${peerTkr} (Z = ${zScoreVal >= 0 ? '+' : ''}${zScoreVal.toFixed(2)}σ)`;
  ctx.font = '700 8.5px "Fira Code", monospace';
  const saBadgeW = Math.min(250, ctx.measureText(saBadgeText).width + 16);
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

  // 4-Column StatArb Metric Strip (Matches Web UI: PEER TWIN, KORELASI HIST, Z-SCORE SPREAD, TARGET KONVERGENSI)
  drawRoundedRect(ctx, 50, curY + 29, statArbBoxW - 24, 36, 3);
  ctx.fillStyle = '#141B26';
  ctx.fill();
  ctx.strokeStyle = '#1F2A3C';
  ctx.stroke();

  const saColW = (statArbBoxW - 24) / 4;
  const spread1DStr = `${(joeliardiEval.statArbSpread1DPct ?? 0) >= 0 ? '+' : ''}${(
    joeliardiEval.statArbSpread1DPct ?? 0
  ).toFixed(2)}%`;
  const saGridCols = [
    {
      lbl: 'PEER TWIN',
      val: `${peerTkr} (${joeliardiEval.statArbPeerName ?? peerTkr})`,
      col: '#F9FAFB'
    },
    {
      lbl: 'KORELASI HIST (ρ)',
      val: rhoVal.toFixed(2),
      col: '#34D399'
    },
    {
      lbl: 'Z-SCORE SPREAD',
      val: `${zScoreVal >= 0 ? '+' : ''}${zScoreVal.toFixed(2)}σ (1D ${spread1DStr})`,
      col: zScoreVal <= -1.0 ? '#34D399' : zScoreVal >= 1.25 ? '#FB7185' : '#F9FAFB'
    },
    {
      lbl: 'TARGET KONVERGENSI',
      val: `Rp ${formatIdrPriceDisplay(statArbFairIdr)}`,
      col: '#38BDF8'
    }
  ];

  saGridCols.forEach((sc, sIdx) => {
    const sx = 50 + sIdx * saColW + 8;
    ctx.fillStyle = '#9CA3AF';
    drawTextAutoFit(ctx, sc.lbl, sx, curY + 42, saColW - 12, 600, 7.8, 6.8, '"Fira Code", monospace');
    ctx.fillStyle = sc.col;
    drawTextAutoFit(ctx, sc.val, sx, curY + 57, saColW - 12, 700, 9.2, 7.2, '"Fira Code", monospace');
  });

  const afterStatArbMainY = drawRichTokenLines(
    ctx,
    statArbMainRichLines,
    50,
    curY + 81,
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

  // Right Box: Sector Matrix & Multi-Stage RIM Rationale
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
    `RIM ω=${rimOmegaStr} (${joeliardiEval.rimFadeYears ?? 6}Thn): Rp ${formatIdrPriceDisplay(rimFairIdr)}`,
    secRatX + secRatBoxW - 12,
    rimFooterY + 15,
    secRatBoxW * 0.42,
    700,
    9.0,
    7.5,
    '"Fira Code", monospace'
  );
  ctx.textAlign = 'left';

  curY += statArbAndRatRowH + 16;

  // 8. Complete AI Investment Committee Container (Matches Web UI 1:1)
  drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, aiBoxH, 5);
  ctx.fillStyle = '#11161F';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.48)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  let aiY = curY + 16;

  // 8A. AI Committee Header + Engine Timestamp Badge
  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 9.0px Montserrat, sans-serif';
  ctx.fillText(
    'INVESTMENT COMMITTEE ENGINE // NOVY-MARX GP/A + DAMODARAN JUSTIFIED PBV + 1/β BARBELL',
    56,
    aiY + 8
  );

  ctx.fillStyle = '#F9FAFB';
  drawTextAutoFit(
    ctx,
    `Komite Investasi AI: Bedah GP/A, Kurva Spot SBN (1Y/5Y/10Y), Justified PBV & Sizing 1/β (${stock.ticker})`,
    56,
    aiY + 26,
    LOGICAL_WIDTH - 420,
    700,
    13.0,
    10.0
  );

  const engineTimeStr = aiGeneratedAt
    ? new Date(aiGeneratedAt).toLocaleTimeString('id-ID')
    : new Date().toLocaleTimeString('id-ID');
  const engineBadgeStr = `✦ ${
    isAiGenerated
      ? 'Gemini 3.8 Flash Committee Engine'
      : 'Investment Committee Analytical Engine'
  } · ${engineTimeStr}`;
  ctx.font = '700 9.0px "Fira Code", monospace';
  const engBadgeW = ctx.measureText(engineBadgeStr).width + 18;
  const engBadgeX = LOGICAL_WIDTH - 56 - engBadgeW;
  drawRoundedRect(ctx, engBadgeX, aiY + 4, engBadgeW, 22, 3);
  ctx.fillStyle = '#141B26';
  ctx.fill();
  ctx.strokeStyle = '#243044';
  ctx.stroke();
  ctx.fillStyle = '#D1D5DB';
  ctx.fillText(engineBadgeStr, engBadgeX + 9, aiY + 18);

  // Header Bottom Divider
  ctx.strokeStyle = '#1F2A3C';
  ctx.beginPath();
  ctx.moveTo(56, aiY + 36);
  ctx.lineTo(LOGICAL_WIDTH - 56, aiY + 36);
  ctx.stroke();

  aiY += 46;

  // 8B. 4-Column Academic Quantitative Strip inside AI Committee Box (Matches Web UI position)
  const aiInnerW = LOGICAL_WIDTH - 112;
  const acGap = 12;
  const acCardW = (aiInnerW - acGap * 3) / 4;
  const academicStrip = [
    {
      label: (secProfile?.academicStripCard1.label || 'GP/A (NOVY-MARX) & DUPONT').toUpperCase(),
      mainVal: secProfile?.academicStripCard1.mainVal || `GP/A ${gpToAssets.toFixed(1)}%`,
      subVal:
        secProfile?.academicStripCard1.subVal ||
        `(ROA ${roaDuPont.toFixed(1)}% · Lev ${eqMult.toFixed(2)}x)`,
      color: '#34D399'
    },
    {
      label: 'KURVA SPOT SBN (1Y/5Y/10Y)',
      mainVal: `Ke ${dynKe.toFixed(2)}%`,
      subVal: `(Spot Rf ${sbnBlended.toFixed(2)}%: 1Y ${sbn1Y}%·5Y ${sbn5Y}%·10Y ${sbn10Y}%)`,
      color: '#F3F4F6'
    },
    {
      label: (secProfile?.academicStripCard3.label || 'ANTI-JUNK (QMJ ACCRUAL)').toUpperCase(),
      mainVal: secProfile?.academicStripCard3.mainVal || `OCF/NI ${ocfNi.toFixed(2)}x`,
      subVal:
        secProfile?.academicStripCard3.subVal ||
        (accrualPen > 0
          ? `(Penalti Akrual -${accrualPen} pts)`
          : (joeliardiEval.effectiveModule ?? joeliardiEval.valuationReport?.applied_module) === 'Capex_Aggressor'
          ? '(0 Penalti · Rule B Capex >0,50x)'
          : '(0 Penalti · Rule A Kas >0,80x)'),
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
    const x = 56 + idx * (acCardW + acGap);
    drawRoundedRect(ctx, x, aiY, acCardW, 62, 4);
    ctx.fillStyle = '#141B26';
    ctx.fill();
    ctx.strokeStyle = '#243044';
    ctx.stroke();

    ctx.fillStyle = '#9CA3AF';
    drawTextAutoFit(ctx, d.label, x + 10, aiY + 17, acCardW - 20, 700, 9.0, 7.5);

    ctx.fillStyle = d.color;
    drawTextAutoFit(
      ctx,
      d.mainVal,
      x + 10,
      aiY + 36,
      acCardW - 20,
      700,
      11.5,
      9.0,
      '"Fira Code", monospace'
    );

    ctx.fillStyle = '#9CA3AF';
    drawTextAutoFit(
      ctx,
      d.subVal,
      x + 10,
      aiY + 51,
      acCardW - 20,
      500,
      8.8,
      7.2,
      '"Fira Code", monospace'
    );
  });

  aiY += 74;

  // 8C. Executive Verdict, Direct Analytical Conclusion & 4 Chain-of-Thought Cards Box
  drawRoundedRect(ctx, 56, aiY, aiInnerW, verdictAndCotBoxH, 4);
  ctx.fillStyle = '#141B26';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.42)';
  ctx.stroke();

  let vY = aiY + 14;

  const isDangerBadge =
    verdictBadge.includes('AVOID') ||
    verdictBadge.includes('HSC') ||
    verdictBadge.includes('SPECULATIVE');
  const isPositiveBadge =
    verdictBadge.includes('ACCUMULATE') || verdictBadge.includes('BUY');

  ctx.font = '700 10px "Fira Code", monospace';
  const vBadgeW = ctx.measureText(verdictBadge).width + 20;
  drawRoundedRect(ctx, 68, vY, vBadgeW, 22, 3);
  ctx.fillStyle = isDangerBadge
    ? 'rgba(225, 29, 72, 0.18)'
    : isPositiveBadge
    ? 'rgba(16, 185, 129, 0.16)'
    : 'rgba(245, 158, 11, 0.16)';
  ctx.fill();
  ctx.strokeStyle = isDangerBadge
    ? 'rgba(244, 63, 94, 0.55)'
    : isPositiveBadge
    ? 'rgba(16, 185, 129, 0.5)'
    : 'rgba(245, 158, 11, 0.5)';
  ctx.stroke();

  ctx.fillStyle = isDangerBadge ? '#FB7185' : isPositiveBadge ? '#34D399' : '#FBBF24';
  ctx.fillText(verdictBadge, 78, vY + 15);

  // Right-aligned AI Conviction Score
  const convScore = structuredReport?.convictionScore ?? joeliardiEval.totalConvictionScore;
  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 11.5px "Fira Code", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`AI Conviction Score: ${convScore}/100`, LOGICAL_WIDTH - 68, vY + 15);
  ctx.textAlign = 'left';

  vY += 36;

  // Verdict Title Lines
  ctx.fillStyle = '#F9FAFB';
  ctx.font = '800 14.5px Montserrat, sans-serif';
  verdictTitleLines.forEach((vLine) => {
    ctx.fillText(vLine, 68, vY);
    vY += 20;
  });

  vY += 4;

  // Boxed Header [ ■ HASIL ANALISIS NOSTRADAMUS ]
  ctx.font = '800 11.5px Montserrat, sans-serif';
  const hdrBoxW = ctx.measureText(summaryBoxHeader).width + 42;
  drawRoundedRect(ctx, 68, vY, hdrBoxW, 28, 3);
  ctx.fillStyle = 'rgba(217, 119, 6, 0.14)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.65)';
  ctx.stroke();

  drawRoundedRect(ctx, 79, vY + 9.5, 8.5, 8.5, 2);
  ctx.fillStyle = '#F59E0B';
  ctx.fill();

  ctx.fillStyle = '#F59E0B';
  ctx.fillText(summaryBoxHeader, 94, vY + 18.5);

  vY += 44;

  // Rich-Text Narrative Summary Paragraph
  vY = drawRichTokenLines(
    ctx,
    summaryRichLines,
    68,
    vY,
    summaryLineH,
    12.5,
    '#D1D5DB',
    '#F9FAFB',
    '#F59E0B'
  );

  // Chain-of-Thought 2x2 Grid inside Verdict Box
  if (parsedCotCards.length > 0) {
    vY += 6;
    ctx.strokeStyle = '#1F2A3C';
    ctx.beginPath();
    ctx.moveTo(68, vY);
    ctx.lineTo(LOGICAL_WIDTH - 68, vY);
    ctx.stroke();

    vY += 20;
    drawLayersIcon(ctx, 68, vY - 11);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '700 10px Montserrat, sans-serif';
    ctx.fillText(
      'ALUR PENALARAN KUANTITATIF-FUNDAMENTAL (CHAIN-OF-THOUGHT):',
      86,
      vY
    );
    vY += 12;

    const cotCardW = (aiInnerW - 24 - 12) / 2;
    let cotRowY = vY;
    for (let r = 0; r < cotRowHeights.length; r++) {
      const rowH = cotRowHeights[r];
      for (let col = 0; col < 2; col++) {
        const cardIdx = r * 2 + col;
        if (cardIdx >= parsedCotCards.length) continue;
        const card = parsedCotCards[cardIdx];
        const bx = 68 + col * (cotCardW + 12);
        const by = cotRowY;

        drawRoundedRect(ctx, bx, by, cotCardW, rowH, 4);
        ctx.fillStyle = '#11161F';
        ctx.fill();
        ctx.strokeStyle = '#243044';
        ctx.stroke();

        ctx.fillStyle = '#F9FAFB';
        drawTextAutoFit(ctx, card.header, bx + 12, by + 20, cotCardW - 24, 700, 11.2, 9.0);

        ctx.strokeStyle = '#1F2A3C';
        ctx.beginPath();
        ctx.moveTo(bx + 12, by + 28);
        ctx.lineTo(bx + cotCardW - 12, by + 28);
        ctx.stroke();

        const afterBodyY = drawRichTokenLines(
          ctx,
          card.bodyLines,
          bx + 12,
          by + 45,
          17,
          11.0,
          '#D1D5DB',
          '#F9FAFB',
          '#F59E0B'
        );

        if (card.conclusionLines.length > 0) {
          ctx.fillStyle = '#F59E0B';
          ctx.font = '700 11px Montserrat, sans-serif';
          card.conclusionLines.forEach((cLine, cIdx) => {
            drawTextAutoFit(
              ctx,
              cLine,
              bx + 12,
              afterBodyY + 4 + cIdx * 16,
              cotCardW - 24,
              700,
              11.0,
              9.0
            );
          });
        }
      }
      cotRowY += rowH + 12;
    }
  }

  aiY += verdictAndCotBoxH;

  // 8D. 2x2 Grid of Deep Analytical Pillar Cards (structuredReport.sections)
  if (parsedSectionCards.length > 0) {
    aiY += 14;
    let secRowY = aiY;
    for (let r = 0; r < sectionRowHeights.length; r++) {
      const rowH = sectionRowHeights[r];
      for (let col = 0; col < 2; col++) {
        const idx = r * 2 + col;
        if (idx >= parsedSectionCards.length) continue;
        const sc = parsedSectionCards[idx];
        const sx = 56 + col * (halfInnerW + 14);
        const sy = secRowY;

        drawRoundedRect(ctx, sx, sy, halfInnerW, rowH, 4);
        ctx.fillStyle = '#141B26';
        ctx.fill();
        ctx.strokeStyle = sc.toneStyle.borderColor;
        ctx.stroke();

        // Top Badge
        ctx.font = '700 9.0px "Fira Code", monospace';
        const bW = ctx.measureText(sc.sec.badge).width + 16;
        drawRoundedRect(ctx, sx + 14, sy + 12, bW, 19, 3);
        ctx.fillStyle = sc.toneStyle.badgeBg;
        ctx.fill();
        ctx.strokeStyle = sc.toneStyle.badgeBorder;
        ctx.stroke();
        ctx.fillStyle = sc.toneStyle.badgeText;
        ctx.fillText(sc.sec.badge, sx + 22, sy + 25);

        let innerSecY = sy + 46;

        // Section Title
        ctx.fillStyle = '#F9FAFB';
        ctx.font = '700 12.5px Montserrat, sans-serif';
        sc.titleLines.forEach((tl) => {
          ctx.fillText(tl, sx + 14, innerSecY);
          innerSecY += 17;
        });

        // Key Metric Highlight Box
        if (sc.keyHighlightBoxH > 0) {
          innerSecY += 2;
          drawRoundedRect(ctx, sx + 14, innerSecY - 10, halfInnerW - 28, sc.keyHighlightBoxH, 3);
          ctx.fillStyle = '#11161F';
          ctx.fill();
          ctx.strokeStyle = '#243044';
          ctx.stroke();

          ctx.fillStyle = '#F9FAFB';
          sc.keyHighlightLines.forEach((kl, kIdx) => {
            drawTextAutoFit(
              ctx,
              kl,
              sx + 22,
              innerSecY + 4 + kIdx * 14.5,
              halfInnerW - 44,
              700,
              10.0,
              8.0,
              '"Fira Code", monospace'
            );
          });
          innerSecY += sc.keyHighlightBoxH + 8;
        } else {
          innerSecY += 4;
        }

        // Reasoning Paragraph
        innerSecY = drawRichTokenLines(
          ctx,
          sc.reasoningLines,
          sx + 14,
          innerSecY,
          15.5,
          10.5,
          '#D1D5DB',
          '#F9FAFB',
          '#F59E0B'
        );

        // Bullet Points
        if (sc.parsedBullets.length > 0) {
          innerSecY += 4;
          ctx.strokeStyle = '#1F2A3C';
          ctx.beginPath();
          ctx.moveTo(sx + 14, innerSecY - 6);
          ctx.lineTo(sx + halfInnerW - 14, innerSecY - 6);
          ctx.stroke();

          innerSecY += 8;
          sc.parsedBullets.forEach((bItem) => {
            ctx.fillStyle = sc.toneStyle.bulletColor;
            ctx.font = '700 10.5px Montserrat, sans-serif';
            ctx.fillText('▸', sx + 14, innerSecY);

            const bulletTextX = sx + 28;
            if (bItem.header) {
              ctx.fillStyle = '#F9FAFB';
              drawTextAutoFit(
                ctx,
                bItem.header,
                bulletTextX,
                innerSecY,
                halfInnerW - 44,
                700,
                10.2,
                8.5
              );
              innerSecY += 15;
            }

            innerSecY = drawRichTokenLines(
              ctx,
              bItem.bLines,
              bulletTextX,
              innerSecY,
              14.5,
              10.0,
              '#D1D5DB',
              '#F9FAFB',
              '#F59E0B'
            );

            if (bItem.cLines.length > 0) {
              ctx.fillStyle = '#FBBF24';
              bItem.cLines.forEach((cl) => {
                drawTextAutoFit(
                  ctx,
                  cl,
                  bulletTextX,
                  innerSecY,
                  halfInnerW - 44,
                  700,
                  10.0,
                  8.2
                );
                innerSecY += 14.5;
              });
            }
            innerSecY += 6;
          });
        }
      }
      secRowY += rowH + 12;
    }
    aiY += totalSectionsGridH;
  }

  // 8E. Tactical Execution & Position Sizing Strategy Card (With Header + 4 Structured Cards)
  if (exCols.length > 0) {
    aiY += 14;
    drawRoundedRect(ctx, 56, aiY, aiInnerW, exSectionTotalH, 4);
    ctx.fillStyle = '#141B26';
    ctx.fill();
    ctx.strokeStyle = '#243044';
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.font = '700 10.5px Montserrat, sans-serif';
    ctx.fillText(
      '◎ STRATEGI EKSEKUSI PRA-BELI & MANAJEMEN RISIKO PORTOFOLIO',
      70,
      aiY + 21
    );

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 9.2px "Fira Code", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      'Prototipe Eksekusi Institusional (1/β Barbell & 5% ADTV Cap)',
      56 + aiInnerW - 14,
      aiY + 21
    );
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#1F2A3C';
    ctx.beginPath();
    ctx.moveTo(70, aiY + 30);
    ctx.lineTo(56 + aiInnerW - 14, aiY + 30);
    ctx.stroke();

    const innerExW = (aiInnerW - 28 - 10 * 3) / 4;
    const cardTopY = aiY + 38;

    exCols.forEach((ec, idx) => {
      const exX = 70 + idx * (innerExW + 10);
      drawRoundedRect(ctx, exX, cardTopY, innerExW, exCardH, 4);
      ctx.fillStyle = '#11161F';
      ctx.fill();
      ctx.strokeStyle = '#243044';
      ctx.stroke();

      ctx.fillStyle =
        idx === 1 ? '#34D399' : idx === 2 ? '#FB7185' : idx === 3 ? '#38BDF8' : '#9CA3AF';
      drawTextAutoFit(ctx, ec.label, exX + 10, cardTopY + 17, innerExW - 94, 700, 8.6, 7.2);

      if (ec.badge) {
        ctx.font = '700 7.8px "Fira Code", monospace';
        const bW = Math.min(88, ctx.measureText(ec.badge).width + 10);
        const bX = exX + innerExW - 8 - bW;
        drawRoundedRect(ctx, bX, cardTopY + 5, bW, 15, 2);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
        ctx.fill();
        ctx.strokeStyle = ec.badgeColor;
        ctx.stroke();
        ctx.fillStyle = ec.badgeColor;
        drawTextAutoFit(
          ctx,
          ec.badge,
          bX + 5,
          cardTopY + 15.5,
          bW - 10,
          700,
          7.8,
          6.5,
          '"Fira Code", monospace'
        );
      }

      ctx.strokeStyle = '#1F2A3C';
      ctx.beginPath();
      ctx.moveTo(exX + 10, cardTopY + 25);
      ctx.lineTo(exX + innerExW - 10, cardTopY + 25);
      ctx.stroke();

      let curExLineY = cardTopY + 40;

      // Key-Value Inner Sub-Box for Cards 2 & 4
      if (ec.kvRows.length > 0) {
        const kvBoxH = ec.kvRows.length * 15.5 + 8;
        drawRoundedRect(ctx, exX + 9, curExLineY - 10, innerExW - 18, kvBoxH, 3);
        ctx.fillStyle = '#141B26';
        ctx.fill();
        ctx.strokeStyle = '#1F2A3C';
        ctx.stroke();

        ec.kvRows.forEach((kv, kIdx) => {
          const rY = curExLineY + 2 + kIdx * 15.5;
          ctx.fillStyle = '#9CA3AF';
          ctx.font = '600 8.5px "Fira Code", monospace';
          ctx.fillText(kv.k, exX + 14, rY);

          ctx.fillStyle = kv.vColor;
          ctx.textAlign = 'right';
          drawTextAutoFit(
            ctx,
            kv.v,
            exX + innerExW - 14,
            rY,
            innerExW - 92,
            700,
            8.6,
            7.0,
            '"Fira Code", monospace'
          );
          ctx.textAlign = 'left';
        });

        curExLineY += kvBoxH + 6;
      }

      ctx.fillStyle = ec.color;
      ec.wrapped.forEach((el) => {
        drawTextAutoFit(ctx, el, exX + 10, curExLineY, innerExW - 20, 600, 9.2, 7.2);
        curExLineY += 14.2;
      });
    });

    aiY += exSectionTotalH;
  }

  // 8F. Bullish Catalysts vs Bearish Risks 2-Column Checklist
  if (hasBullBearGrid) {
    aiY += 14;
    const drawChecklistColumn = (
      x: number,
      title: string,
      titleColor: string,
      borderColor: string,
      bulletColor: string,
      measured: ReturnType<typeof measureChecklistCard>
    ) => {
      drawRoundedRect(ctx, x, aiY, halfInnerW, bullBearGridH, 4);
      ctx.fillStyle = '#141B26';
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.stroke();

      ctx.fillStyle = titleColor;
      drawTextAutoFit(ctx, title, x + 14, aiY + 21, halfInnerW - 28, 700, 10.5, 8.5);

      ctx.strokeStyle = '#1F2A3C';
      ctx.beginPath();
      ctx.moveTo(x + 14, aiY + 29);
      ctx.lineTo(x + halfInnerW - 14, aiY + 29);
      ctx.stroke();

      let itemY = aiY + 45;
      measured.parsedItems.forEach((it) => {
        ctx.fillStyle = bulletColor;
        ctx.font = '700 11px Montserrat, sans-serif';
        ctx.fillText('•', x + 14, itemY);

        const textX = x + 26;
        if (it.header) {
          ctx.fillStyle = '#F9FAFB';
          drawTextAutoFit(ctx, it.header, textX, itemY, halfInnerW - 40, 700, 10.2, 8.5);
          itemY += 15;
        }
        itemY = drawRichTokenLines(
          ctx,
          it.bLines,
          textX,
          itemY,
          14.5,
          10.0,
          '#D1D5DB',
          '#F9FAFB',
          '#F59E0B'
        );
        itemY += 7;
      });
    };

    drawChecklistColumn(
      56,
      `✓ KATALIS POSITIF & KEKUATAN FUNDAMENTAL (${stock.ticker})`,
      '#34D399',
      'rgba(16, 185, 129, 0.42)',
      '#34D399',
      measuredBullish
    );

    drawChecklistColumn(
      56 + halfInnerW + 14,
      '⚠ FAKTOR RISIKO, VALUASI & DISIPLIN EKSEKUSI',
      '#FB7185',
      'rgba(244, 63, 94, 0.42)',
      '#FB7185',
      measuredBearish
    );

    aiY += bullBearGridH;
  }

  curY += aiBoxH + 18;

  // 9. Full Recent News, Corporate Action & Radar Section (With Active 90-Day Filter Pill)
  if (preparedNewsCards.length > 0) {
    ctx.fillStyle = '#38BDF8';
    ctx.font = '700 11.5px Montserrat, sans-serif';
    ctx.fillText(
      `BERITA TERKINI, CORPORATE ACTION & RADAR ISU SPESIFIK EMITEN (${stock.ticker})`,
      38,
      curY + 17
    );

    // Right-aligned Filter Pill + Item Count (Matches Web UI)
    const countStr = `${preparedNewsCards.length} Item Terkait`;
    ctx.font = '700 10px Montserrat, sans-serif';
    const countW = ctx.measureText(countStr).width;
    ctx.fillStyle = '#38BDF8';
    ctx.textAlign = 'right';
    ctx.fillText(countStr, LOGICAL_WIDTH - 38, curY + 17);
    ctx.textAlign = 'left';

    const filterPillStr = '✓ Filter Aktif: Maks. 3 Bulan Terakhir (≤ 90 Hari)';
    ctx.font = '700 9.0px "Fira Code", monospace';
    const fPillW = ctx.measureText(filterPillStr).width + 16;
    const fPillX = LOGICAL_WIDTH - 38 - countW - 12 - fPillW;
    drawRoundedRect(ctx, fPillX, curY + 3, fPillW, 19, 3);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.stroke();
    ctx.fillStyle = '#34D399';
    ctx.fillText(filterPillStr, fPillX + 8, curY + 16);

    curY += 36;

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
          7.8,
          '"Fira Code", monospace'
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

        // Bottom Card Divider + Sector & Source Footer
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

  // 9B. Mandatory P2.4 Raw Data Audit Strip (Synchronized with PNG & PDF Exports)
  if (joeliardiEval.rawTickerData && joeliardiEval.sanityReport) {
    const raw = joeliardiEval.rawTickerData;
    const sanity = joeliardiEval.sanityReport;
    const valRes = joeliardiEval.valuationResult;
    const tac = joeliardiEval.tacticalOverlay;
    const risk = joeliardiEval.riskSizingResult;

    const stripX = 38;
    const stripW = LOGICAL_WIDTH - 76;
    const stripY = curY + 6;

    drawRoundedRect(ctx, stripX, stripY, stripW, rawAuditStripH, 5);
    ctx.fillStyle = '#11161F';
    ctx.fill();
    ctx.strokeStyle =
      sanity.status === 'PASS'
        ? 'rgba(16, 185, 129, 0.45)'
        : sanity.status === 'WARN'
        ? 'rgba(245, 158, 11, 0.55)'
        : 'rgba(244, 63, 94, 0.65)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Header Row
    const dl = joeliardiEval.dataLineage;
    const dlTag = dl
      ? ` · LINEAGE: ${dl.overallIntegrityStatus} (FRESH:${dl.freshFieldCount} STALE:${dl.staleFieldCount} SEED:${dl.seedFieldCount})`
      : '';
    ctx.fillStyle = '#F59E0B';
    ctx.font = '700 10px "Fira Code", monospace';
    drawTextAutoFit(
      ctx,
      `RAW DATA AUDIT STRIP (P0–P3 PROVENANCE) · ${raw.ticker} · BASIS: TTM_DEFAULT${dlTag}`,
      stripX + 14,
      stripY + 20,
      stripW - 470,
      700,
      10,
      7.5,
      '"Fira Code", monospace'
    );

    const sbnWarnFlag = dl?.sbnMacroStatus.isStaleOrProxy
      ? dl.sbnMacroStatus.source === 'PROXY_FORMULA'
        ? 'SBN_PROXY_TNX'
        : `SBN_STALE_${dl.sbnMacroStatus.ageDays}D`
      : null;
    const allFlags = [...sanity.flags];
    if (sbnWarnFlag && !allFlags.includes(sbnWarnFlag as never)) {
      allFlags.push(sbnWarnFlag as never);
    }
    if (dl?.convictionCappedByLineage) {
      allFlags.push('GRADE_C_CAP_SEED' as never);
    }

    const statusBadgeText = `SANITY: ${sanity.status}${
      allFlags.length > 0 ? ` [${allFlags.join(', ')}]` : ''
    }`;
    ctx.font = '700 9.5px "Fira Code", monospace';
    const sbW = Math.min(440, ctx.measureText(statusBadgeText).width + 18);
    const sbX = stripX + stripW - 14 - sbW;
    drawRoundedRect(ctx, sbX, stripY + 6, sbW, 20, 3);
    const isWarnOrSeed =
      sanity.status === 'WARN' || Boolean(dl?.sbnMacroStatus.isStaleOrProxy) || Boolean(dl?.convictionCappedByLineage);
    ctx.fillStyle =
      sanity.status === 'FAIL'
        ? 'rgba(244, 63, 94, 0.2)'
        : isWarnOrSeed
        ? 'rgba(245, 158, 11, 0.18)'
        : 'rgba(16, 185, 129, 0.16)';
    ctx.fill();
    ctx.strokeStyle =
      sanity.status === 'FAIL' ? '#F43F5E' : isWarnOrSeed ? '#F59E0B' : '#10B981';
    ctx.stroke();
    ctx.fillStyle =
      sanity.status === 'FAIL' ? '#FB7185' : isWarnOrSeed ? '#FBBF24' : '#34D399';
    drawTextAutoFit(
      ctx,
      statusBadgeText,
      sbX + 9,
      stripY + 19,
      sbW - 18,
      700,
      9.5,
      7.5,
      '"Fira Code", monospace'
    );

    ctx.strokeStyle = '#1F2A3C';
    ctx.beginPath();
    ctx.moveTo(stripX + 14, stripY + 30);
    ctx.lineTo(stripX + stripW - 14, stripY + 30);
    ctx.stroke();

    const fmtCompactIdr = (v: number): string => {
      const a = Math.abs(v);
      if (a >= 1e12) return `Rp ${(v / 1e12).toFixed(2)} T`;
      if (a >= 1e9) return `Rp ${(v / 1e9).toFixed(2)} M`;
      if (a >= 1e6) return `Rp ${(v / 1e6).toFixed(1)} Jt`;
      return `Rp ${Math.round(v).toLocaleString('id-ID')}`;
    };

    const spotRf10YPct = raw.spotRf10Y <= 1 ? raw.spotRf10Y * 100 : raw.spotRf10Y;
    const rawRoic = raw.roicTTM ?? 0.14;
    const roicPct = rawRoic <= 1 ? rawRoic * 100 : rawRoic;

    const auditCells = [
      {
        label: `SHARES [${dl?.fields.sharesOutstanding.source === 'USER_OVERRIDE' ? 'OVERRIDE' : dl?.fields.sharesOutstanding.status ?? 'RAW'}]`,
        val:
          raw.sharesOutstanding >= 1e9
            ? `${(raw.sharesOutstanding / 1e9).toFixed(2)} M lbr`
            : `${Math.round(raw.sharesOutstanding).toLocaleString('id-ID')} lbr`,
        sub: `Δ Implied: ${(sanity.sharesMismatchPct * 100).toFixed(2)}%`
      },
      {
        label: `MARKETCAP [${dl?.fields.lastPrice.source === 'LIVE_YAHOO_API' ? 'LIVE' : 'SNAP'}]`,
        val: fmtCompactIdr(raw.marketCap),
        sub: `Px: Rp ${raw.price.toLocaleString('id-ID')}`
      },
      {
        label: `REV_TTM [${dl?.fields.revenueTTMIdr.source === 'USER_OVERRIDE' ? 'OVERRIDE' : dl?.fields.revenueTTMIdr.status ?? 'RAW'}]`,
        val: fmtCompactIdr(raw.revenueTTM),
        sub: `OP YoY: ${(raw.operatingProfitYoYPct ?? 0) >= 0 ? '+' : ''}${(raw.operatingProfitYoYPct ?? 0).toFixed(1)}%`
      },
      {
        label: `NI_TTM [${dl?.fields.netIncomeTTMIdr.source === 'USER_OVERRIDE' ? 'OVERRIDE' : dl?.fields.netIncomeTTMIdr.status ?? 'RAW'}]`,
        val: fmtCompactIdr(raw.netIncomeTTM),
        sub: `Δ EPS×Shr: ${(sanity.netIncomeMismatchPct * 100).toFixed(2)}%`
      },
      {
        label: `EQUITY [${dl?.fields.equityAttributableIdr.source === 'USER_OVERRIDE' ? 'OVERRIDE' : dl?.fields.equityAttributableIdr.status ?? 'RAW'}]`,
        val: fmtCompactIdr(raw.equityAttributable),
        sub: `Δ BVPS×Shr: ${(sanity.equityMismatchPct * 100).toFixed(2)}%`
      },
      {
        label: `CAPEX_TTM [${dl?.fields.capexTTMIdr.status ?? 'RAW'}]`,
        val: fmtCompactIdr(raw.capexTTM),
        sub: `ROIC: ${roicPct.toFixed(1)}%`
      },
      {
        label: `ADTV_20D [${dl?.fields.adtv20dIdr.source === 'LIVE_YAHOO_API' ? 'LIVE_VOL' : dl?.fields.adtv20dIdr.status ?? 'RAW'}]`,
        val: fmtCompactIdr(sanity.normalizedAdtv20dIDR),
        sub: `5% Cap: ${fmtCompactIdr(sanity.maxDailyAbsorption5PctIDR)}`
      },
      {
        label: `SBN_10Y [${dl?.sbnMacroStatus.isStaleOrProxy || sanity.isRfStale ? 'STALE/PROXY' : 'FRESH'}]`,
        val: `${spotRf10YPct.toFixed(2)}% (${(dl?.sbnMacroStatus.asOfDate || raw.rfLastUpdated)?.slice(0, 10) || 'PROXY'})`,
        sub:
          dl?.sbnMacroStatus.isStaleOrProxy || sanity.isRfStale
            ? `${dl?.sbnMacroStatus.source === 'PROXY_FORMULA' || sanity.rfAgeDays === null ? 'PROXY ^TNX' : `STALE ${dl?.sbnMacroStatus.ageDays ?? sanity.rfAgeDays}hr`} ${sanity.keSafetyBufferBps > 0 ? `(+${sanity.keSafetyBufferBps}bps)` : ''}`
            : `Usia: ${sanity.rfAgeDays ?? 0}hr (Fresh)`
      }
    ];

    const cellGap = 8;
    const cellW = (stripW - 28 - cellGap * 7) / 8;
    const cellY = stripY + 38;
    const cellH = 56;

    auditCells.forEach((cell, idx) => {
      const cx = stripX + 14 + idx * (cellW + cellGap);
      drawRoundedRect(ctx, cx, cellY, cellW, cellH, 3);
      ctx.fillStyle = '#141B26';
      ctx.fill();
      ctx.strokeStyle = '#243044';
      ctx.stroke();

      ctx.fillStyle = '#9CA3AF';
      drawTextAutoFit(
        ctx,
        cell.label,
        cx + 7,
        cellY + 14,
        cellW - 14,
        700,
        7.8,
        6.5,
        '"Fira Code", monospace'
      );

      ctx.fillStyle = '#F9FAFB';
      drawTextAutoFit(
        ctx,
        cell.val,
        cx + 7,
        cellY + 31,
        cellW - 14,
        700,
        9.6,
        7.5,
        '"Fira Code", monospace'
      );

      ctx.fillStyle = '#38BDF8';
      drawTextAutoFit(
        ctx,
        cell.sub,
        cx + 7,
        cellY + 46,
        cellW - 14,
        500,
        7.8,
        6.5,
        '"Fira Code", monospace'
      );
    });

    // Bottom P1 & P2 Summary Telemetry Line inside RawDataAuditStrip
    const p1Summary = valRes
      ? `P1: Ensemble Rp ${valRes.ensembleFairValue.toLocaleString('id-ID')} | Floor 3-5Y Rp ${valRes.standaloneFloor.toLocaleString('id-ID')} (${valRes.isFloorClamped ? 'CLAMPED ≤90%' : 'INVARIANT OK'}) | 2-Stage RI g1=${(valRes.stage1GrowthRate * 100).toFixed(1)}%·gT=${(valRes.terminalGrowthRate * 100).toFixed(1)}%`
      : '';
    const p2Summary = risk
      ? `P2: MaxCap ${risk.finalMaxAllocationPct}% (1/β ${risk.inverseBetaCapPct}%·1/Vol ${risk.inverseVolatilityCapPct}%·Reg ${risk.regimeCapPct}%) | ATR/Vol Stop Rp ${risk.stopLossPriceIDR.toLocaleString('id-ID')} (-${risk.stopLossPct}%) | T1 ${risk.tranche1AllocationPct}% · T2 ${risk.tranche2AllocationPct}%${valRes ? ` | Dispersi ${(valRes.modelDispersion * 100).toFixed(1)}%` : ''}${risk.dispersionPenaltyPts > 0 ? ` (-${risk.dispersionPenaltyPts}pts)` : ''}`
      : '';
    const tacSummary = tac
      ? `Tactical Overlay: ${tac.pairTicker} (Z=${tac.zScore >= 0 ? '+' : ''}${tac.zScore}σ · ${tac.action})`
      : '';

    ctx.fillStyle = '#D1D5DB';
    drawTextAutoFit(
      ctx,
      `${p1Summary}   ||   ${tacSummary}`,
      stripX + 14,
      stripY + 113,
      stripW - 28,
      600,
      8.6,
      7.0,
      '"Fira Code", monospace'
    );

    ctx.fillStyle = '#34D399';
    drawTextAutoFit(
      ctx,
      p2Summary,
      stripX + 14,
      stripY + 131,
      stripW - 28,
      600,
      8.6,
      7.0,
      '"Fira Code", monospace'
    );

    curY = stripY + rawAuditStripH + 8;
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
 * on a single continuous proportional page and triggers a direct file download (.pdf).
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
  // Standard PDF page width = 842 pt, continuous single-page proportional height
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
