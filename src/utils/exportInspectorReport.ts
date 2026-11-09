import {
  JoeliardiOosEvaluation,
  MarketRegimeStatus,
  NewsSentimentItem,
  StockMetrics,
  StructuredAiConvictionReport
} from '../types/quant';
import { formatIdrPriceDisplay } from './numberFormat';

export interface InspectorExportPayload {
  stock: StockMetrics;
  joeliardiEval: JoeliardiOosEvaluation;
  structuredReport: StructuredAiConvictionReport | null;
  recentNews: NewsSentimentItem[];
  regimeStatus: MarketRegimeStatus;
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
 * Renders the full Emiten Fundamental & AI Committee Inspection Report onto a 2x Retina HD Canvas
 * with official Nostradamus Quant Terminal watermarks (diagonal + header + footer).
 */
export function renderInspectorReportCanvas(
  payload: InspectorExportPayload
): HTMLCanvasElement {
  const { stock, joeliardiEval, structuredReport, recentNews, regimeStatus } = payload;

  const LOGICAL_WIDTH = 1200;
  const SCALE = 2; // 2400px Ultra-HD Retina resolution

  // Measure dynamic height needed for AI summary, CoT steps, and news
  const scratch = document.createElement('canvas');
  const sCtx = scratch.getContext('2d')!;
  sCtx.font = '500 13px Montserrat, sans-serif';

  const rawSummaryText =
    structuredReport?.directAnswerSummary ||
    `Hasil Analisis Komite Investasi: Pada harga Rp ${formatIdrPriceDisplay(stock.lastPrice)}, ${stock.ticker} memiliki Nilai Intrinsik Rp ${formatIdrPriceDisplay(joeliardiEval.intrinsicValueIdr)} (MoS ${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}%) dengan Skor Keyakinan ${joeliardiEval.totalConvictionScore}/100.`;

  const summaryHeaderMatch = rawSummaryText.match(
    /^((?:Hasil|Kesimpulan|Keputusan|Evaluasi|Audit)\s+[^:]{3,75}):\s*([\s\S]*)$/i
  );
  const summaryBoxHeader = summaryHeaderMatch
    ? summaryHeaderMatch[1].trim().toUpperCase()
    : 'HASIL ANALISIS KOMITE INVESTASI';
  const summaryBodyText = summaryHeaderMatch
    ? summaryHeaderMatch[2].trim()
    : rawSummaryText.trim();

  const summaryLines = wrapCanvasText(sCtx, summaryBodyText, LOGICAL_WIDTH - 120);
  const cotSteps = structuredReport?.chainOfThoughtSteps || [];
  const topNews = recentNews.slice(0, 4);

  const LOGICAL_HEIGHT =
    812 +
    summaryLines.length * 20 +
    (cotSteps.length > 0 ? Math.ceil(cotSteps.length / 2) * 72 + 40 : 0) +
    (structuredReport ? 115 : 0) +
    (topNews.length > 0 ? Math.ceil(topNews.length / 2) * 78 + 56 : 0) +
    75;

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

  // 3. Top Header Banner
  ctx.fillStyle = '#11161F';
  ctx.fillRect(17, 17, LOGICAL_WIDTH - 34, 92);
  ctx.strokeStyle = '#222C3C';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(17, 109);
  ctx.lineTo(LOGICAL_WIDTH - 17, 109);
  ctx.stroke();

  // Brand Icon Box
  drawRoundedRect(ctx, 38, 35, 42, 42, 4);
  ctx.fillStyle = 'rgba(217, 119, 6, 0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
  ctx.stroke();
  ctx.fillStyle = '#F59E0B';
  ctx.font = '800 20px Montserrat, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', 59, 63);
  ctx.textAlign = 'left';

  // Kicker
  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 11px Montserrat, sans-serif';
  ctx.fillText(
    'NOSTRADAMUS QUANT TERMINAL // ON-DEMAND FUNDAMENTAL & AI INSPECTOR (FUNDAMENTAL KUALITAS MOAT)',
    94,
    46
  );

  // Main Emiten Title
  ctx.fillStyle = '#F9FAFB';
  ctx.font = '800 22px Montserrat, sans-serif';
  ctx.fillText(`${stock.ticker} · ${stock.name}`, 94, 74);

  ctx.fillStyle = '#9CA3AF';
  ctx.font = '600 12px Montserrat, sans-serif';
  ctx.fillText(
    `Sektor IDX-IC: ${stock.sector}   |   Rezim IHSG: ${regimeStatus}   |   Dicetak: ${new Date().toLocaleString('id-ID')}`,
    94,
    94
  );

  // Right Grade Badge in Header
  const gradeText = `${joeliardiEval.convictionGrade} · SKOR ${joeliardiEval.totalConvictionScore}/100`;
  ctx.font = '700 12px Montserrat, sans-serif';
  const gradeW = ctx.measureText(gradeText).width + 28;
  const gradeX = LOGICAL_WIDTH - 40 - gradeW;
  drawRoundedRect(ctx, gradeX, 36, gradeW, 32, 4);
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
  ctx.fillText(gradeText, gradeX + 14, 56);

  let curY = 128;

  // 4. Optional HSC Alert Box
  if (stock.isHscFlagged) {
    drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, 54, 4);
    ctx.fillStyle = 'rgba(225, 29, 72, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
    ctx.stroke();
    ctx.fillStyle = '#FB7185';
    ctx.font = '700 11.5px Montserrat, sans-serif';
    ctx.fillText(
      'PERINGATAN SAHAM HSC (HIGH SPECULATIVE / CORNERED RISK) — DIBLOKIR DARI TOP DECILE BUY',
      54,
      curY + 22
    );
    ctx.fillStyle = '#FECDD3';
    ctx.font = '500 11px Montserrat, sans-serif';
    ctx.fillText(
      `${stock.hscReason || 'Anomali spekulatif terdeteksi.'} Dikunci pada zona Rotate Out sesuai filter perlindungan modal Fundamental Kualitas Moat.`,
      54,
      curY + 41
    );
    curY += 68;
  }

  // 5. Row 1: 4 Valuation & Intrinsic Cards
  const cardGap = 14;
  const cardW = (LOGICAL_WIDTH - 76 - cardGap * 3) / 4;
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
      sub: joeliardiEval.valuationLabel.slice(0, 38),
      subColor: '#D1D5DB'
    },
    {
      label: 'VALUASI MULTIPEL (IMPLIED VS WAJAR)',
      labelColor: '#9CA3AF',
      main: `PER ${joeliardiEval.impliedPer}x (Wajar ${joeliardiEval.joeliardiFairPer}x)`,
      mainColor: '#F9FAFB',
      sub: `PBV ${joeliardiEval.impliedPbv}x (Wajar ${joeliardiEval.joeliardiFairPbv}x)`,
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
    ctx.font = '700 10px Montserrat, sans-serif';
    ctx.fillText(c.label, x + 14, curY + 22);

    ctx.fillStyle = c.mainColor;
    ctx.font = idx === 3 ? '700 14px Montserrat, sans-serif' : '800 19px Montserrat, sans-serif';
    ctx.fillText(c.main, x + 14, curY + 49);

    ctx.fillStyle = c.subColor;
    ctx.font = '600 11px Montserrat, sans-serif';
    ctx.fillText(c.sub, x + 14, curY + 71);
  });

  curY += 102;

  // 6. Row 2: 4 Pillar Scores (Joeliardi + OOS Quant)
  const pillars = [
    {
      title: '1. Kualitas Bisnis & Moat',
      score: joeliardiEval.businessQualityScore,
      color: '#10B981',
      lines: [
        `ROE: ${stock.roe.toFixed(1)}% (vs Ke 10,5%)`,
        `Op. Margin: ${stock.operatingMargin.toFixed(1)}%`,
        `Div. Yield TTM: ${(stock.dividendYieldPct ?? 0).toFixed(2)}%`
      ]
    },
    {
      title: '2. Kesehatan Neraca',
      score: joeliardiEval.balanceSheetHealthScore,
      color: '#38BDF8',
      lines: [
        `DER: ${stock.debtToEquity.toFixed(2)}x`,
        `Status: ${stock.debtToEquity <= 0.8 ? 'Konservatif' : 'Moderat/Tinggi'}`,
        `Saringan HSC: ${stock.isHscFlagged ? 'Terindikasi HSC' : 'Bebas HSC'}`
      ]
    },
    {
      title: '3. Keamanan Valuasi',
      score: joeliardiEval.valuationSafetyScore,
      color: '#F59E0B',
      lines: [
        `Skor Faktor Value: ${stock.dmuValueScore.toFixed(1)}/10`,
        `Margin of Safety: ${joeliardiEval.marginOfSafetyPct}%`,
        `Bobot Value OOS: 35% (Prioritas #1)`
      ]
    },
    {
      title: '4. Ketahanan OOS Quant',
      score: joeliardiEval.oosQuantRobustnessScore,
      color: '#10B981',
      lines: [
        `Komposit: ${stock.dmuCompositeScore.toFixed(2)}/10 (Top ${stock.dmuRankPct}%)`,
        `Low-Vol: ${stock.dmuLowVolScore.toFixed(1)} · Mom: ${stock.dmuMomScore.toFixed(1)}`,
        `Volatilitas: ${stock.volatilityAnn.toFixed(1)}% (Beta ${stock.beta1Y.toFixed(2)}x)`
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
    ctx.font = '700 12px Montserrat, sans-serif';
    ctx.fillText(p.title, x + 14, curY + 23);

    ctx.fillStyle = p.color;
    ctx.textAlign = 'right';
    ctx.fillText(`${p.score}/100`, x + cardW - 14, curY + 23);
    ctx.textAlign = 'left';

    // Progress Bar Track
    drawRoundedRect(ctx, x + 14, curY + 32, cardW - 28, 6, 2);
    ctx.fillStyle = '#222C3C';
    ctx.fill();

    // Progress Bar Fill
    const fillW = Math.max(4, ((cardW - 28) * Math.min(100, Math.max(0, p.score))) / 100);
    drawRoundedRect(ctx, x + 14, curY + 32, fillW, 6, 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '500 11px Montserrat, sans-serif';
    p.lines.forEach((ln, lIdx) => {
      ctx.fillText(ln, x + 14, curY + 57 + lIdx * 18);
    });
  });

  curY += 132;

  // 7. Row 3: DuPont ROE Decomposition & SBN 10Y Spread Strip
  const safeDer = Math.max(0, stock.debtToEquity);
  const eqMult = 1 + safeDer;
  const roaDuPont = stock.roe / Math.max(1, eqMult);
  const earningsYield = joeliardiEval.impliedPer > 0 ? (1 / joeliardiEval.impliedPer) * 100 : 0;
  const sbnSpread = earningsYield - 6.75;
  const divYield = Math.max(0, stock.dividendYieldPct ?? 0);
  const totalYield = earningsYield + divYield;

  const dupontStrip = [
    {
      label: 'ROA MURNI (DUPONT)',
      val: `${roaDuPont.toFixed(1)}% (ROE ${stock.roe.toFixed(1)}% / ${eqMult.toFixed(2)}x)`,
      color: '#F3F4F6'
    },
    {
      label: 'EARNINGS YIELD VS SBN 10Y',
      val: `${earningsYield.toFixed(2)}% (${sbnSpread >= 0 ? '+' : ''}${sbnSpread.toFixed(2)}% vs 6,75%)`,
      color: sbnSpread >= 0 ? '#34D399' : '#FB7185'
    },
    {
      label: 'TOTAL SHAREHOLDER YIELD',
      val: `${totalYield.toFixed(2)}% (Div ${divYield.toFixed(2)}%)`,
      color: '#38BDF8'
    },
    {
      label: 'SPREAD NILAI INTRINSIK',
      val: `${joeliardiEval.marginOfSafetyPct >= 0 ? '+' : ''}${joeliardiEval.marginOfSafetyPct.toFixed(1)}% (Rp ${joeliardiEval.intrinsicValueIdr.toLocaleString('id-ID')})`,
      color: joeliardiEval.marginOfSafetyPct >= 0 ? '#34D399' : '#FB7185'
    }
  ];

  dupontStrip.forEach((d, idx) => {
    const x = 38 + idx * (cardW + cardGap);
    drawRoundedRect(ctx, x, curY, cardW, 56, 4);
    ctx.fillStyle = '#141B26';
    ctx.fill();
    ctx.strokeStyle = '#243044';
    ctx.stroke();

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '700 9.5px Montserrat, sans-serif';
    ctx.fillText(d.label, x + 12, curY + 21);

    ctx.fillStyle = d.color;
    ctx.font = '700 12.5px Montserrat, sans-serif';
    ctx.fillText(d.val, x + 12, curY + 42);
  });

  curY += 74;

  // 8. AI Investment Committee Synthesis Box
  const aiBoxH =
    136 +
    summaryLines.length * 20 +
    (cotSteps.length > 0 ? Math.ceil(cotSteps.length / 2) * 72 + 38 : 0) +
    (structuredReport ? 105 : 0);

  drawRoundedRect(ctx, 38, curY, LOGICAL_WIDTH - 76, aiBoxH, 4);
  ctx.fillStyle = '#11161F';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.stroke();

  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 10.5px Montserrat, sans-serif';
  ctx.fillText(
    'KOMITE INVESTASI AI // BEDAH DUPONT ROE, SPREAD SBN 10Y & KEPUTUSAN PRA-BELI',
    56,
    curY + 24
  );

  const verdictBadge = structuredReport?.verdictBadge || joeliardiEval.convictionGrade;
  const verdictTitle =
    structuredReport?.verdictTitle ||
    `Evaluasi Fundamental & Kuantitatif OOS untuk ${stock.ticker}`;

  ctx.fillStyle = '#F9FAFB';
  ctx.font = '700 14px Montserrat, sans-serif';
  ctx.fillText(`[${verdictBadge}]  ${verdictTitle}`, 56, curY + 48);

  // Boxed Bold Header for "HASIL ANALISIS KOMITE INVESTASI"
  ctx.font = '800 11.5px Montserrat, sans-serif';
  const hdrBoxW = ctx.measureText(summaryBoxHeader).width + 28;
  drawRoundedRect(ctx, 56, curY + 60, hdrBoxW, 24, 3);
  ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
  ctx.stroke();
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(summaryBoxHeader, 70, curY + 76);

  // New-line narrative discussion body below the boxed header
  let textY = curY + 104;
  ctx.fillStyle = '#E5E7EB';
  ctx.font = '500 12.5px Montserrat, sans-serif';
  summaryLines.forEach((line) => {
    ctx.fillText(line, 56, textY);
    textY += 20;
  });

  if (cotSteps.length > 0) {
    textY += 10;
    ctx.fillStyle = '#F59E0B';
    ctx.font = '700 10.5px Montserrat, sans-serif';
    ctx.fillText('ALUR PENALARAN KUANTITATIF-FUNDAMENTAL (CHAIN-OF-THOUGHT):', 56, textY);
    textY += 14;

    const halfW = (LOGICAL_WIDTH - 126) / 2;
    for (let i = 0; i < cotSteps.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = 56 + col * (halfW + 14);
      const by = textY + row * 72;

      drawRoundedRect(ctx, bx, by, halfW, 64, 3);
      ctx.fillStyle = '#161D2A';
      ctx.fill();
      ctx.strokeStyle = '#263244';
      ctx.stroke();

      const rawStep = String(cotSteps[i] || '').trim();
      const colonIdx = rawStep.indexOf(':');
      const stepHeader =
        colonIdx > 0 && colonIdx <= 68
          ? rawStep.slice(0, colonIdx + 1).trim()
          : `0${i + 1}. Analisis Faktor:`;
      const stepBody =
        colonIdx > 0 && colonIdx <= 68
          ? rawStep.slice(colonIdx + 1).trim()
          : rawStep;

      // Bold Title on Top Line
      ctx.fillStyle = '#F9FAFB';
      ctx.font = '700 11px Montserrat, sans-serif';
      ctx.fillText(stepHeader, bx + 12, by + 18);

      // Discussion on New Line with space
      ctx.fillStyle = '#D1D5DB';
      ctx.font = '500 10px Montserrat, sans-serif';
      const stepLines = wrapCanvasText(ctx, stepBody, halfW - 24).slice(0, 2);
      stepLines.forEach((sl, sIdx) => {
        ctx.fillText(sl, bx + 12, by + 37 + sIdx * 15);
      });
    }
    textY += Math.ceil(cotSteps.length / 2) * 72 + 14;
  }

  if (structuredReport?.executionStrategy) {
    const ex = structuredReport.executionStrategy;
    const exCols = [
      { label: 'TINDAKAN UTAMA', val: ex.recommendedAction, color: '#F3F4F6' },
      { label: 'ZONA AKUMULASI IDEAL', val: ex.idealEntryZone, color: '#34D399' },
      { label: 'BATAS RISIKO / INVALIDATION', val: ex.InvalidationOrRiskLimit, color: '#FB7185' },
      { label: 'PANDUAN PORSI KERANJANG', val: ex.portfolioAllocationGuide, color: '#38BDF8' }
    ];
    const exW = (LOGICAL_WIDTH - 112 - 12 * 3) / 4;
    exCols.forEach((ec, idx) => {
      const exX = 56 + idx * (exW + 12);
      drawRoundedRect(ctx, exX, textY, exW, 78, 3);
      ctx.fillStyle = '#161D2A';
      ctx.fill();
      ctx.strokeStyle = '#263244';
      ctx.stroke();

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '700 9.5px Montserrat, sans-serif';
      ctx.fillText(ec.label, exX + 10, textY + 18);

      ctx.fillStyle = ec.color;
      ctx.font = '600 10.5px Montserrat, sans-serif';
      const exLines = wrapCanvasText(ctx, ec.val, exW - 20).slice(0, 3);
      exLines.forEach((el, eIdx) => {
        ctx.fillText(el, exX + 10, textY + 36 + eIdx * 15);
      });
    });
  }

  curY += aiBoxH + 18;

  // 9. Recent News & Corporate Action Radar (<= 3 Months)
  if (topNews.length > 0) {
    ctx.fillStyle = '#38BDF8';
    ctx.font = '700 11.5px Montserrat, sans-serif';
    ctx.fillText(
      `BERITA TERKINI, CORPORATE ACTION & RADAR ISU SPESIFIK EMITEN (${stock.ticker} · MAKSIMAL 3 BULAN TERAKHIR)`,
      38,
      curY + 14
    );
    curY += 26;

    const newsColW = (LOGICAL_WIDTH - 76 - 14) / 2;
    topNews.forEach((n, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const nx = 38 + col * (newsColW + 14);
      const ny = curY + row * 74;

      drawRoundedRect(ctx, nx, ny, newsColW, 64, 4);
      ctx.fillStyle = '#141B26';
      ctx.fill();
      ctx.strokeStyle = '#243044';
      ctx.stroke();

      ctx.fillStyle = '#F59E0B';
      ctx.font = '700 9.5px Montserrat, sans-serif';
      ctx.fillText(`${n.source} · ${n.publishedAt}`, nx + 12, ny + 18);

      ctx.fillStyle = '#F3F4F6';
      ctx.font = '600 11px Montserrat, sans-serif';
      const nLines = wrapCanvasText(ctx, n.title, newsColW - 24).slice(0, 2);
      nLines.forEach((nl, nIdx) => {
        ctx.fillText(nl, nx + 12, ny + 36 + nIdx * 16);
      });
    });

    curY += Math.ceil(topNews.length / 2) * 74 + 12;
  }

  // 10. Institutional Footer Bar (Without "WATERMARK RESMI")
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
  ctx.fillText(
    '© 2026 NOSTRADAMUS QUANT TERMINAL · FUNDAMENTAL KUALITAS MOAT & DEMIGUEL OOS QUANT',
    38,
    footerY + 24
  );

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
