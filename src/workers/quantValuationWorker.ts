/**
 * Dedicated Web Worker for Offloading Multi-Stage Residual Income Model (RIM) Iterations
 * and Statistical Arbitrage (StatArb) Pair Cointegration Z-Score Regressions.
 * Keeps the main browser UI thread at a smooth 60fps during fundamental inspection & batch screening.
 */

export interface QuantWorkerInputPayload {
  requestId: string;
  ticker: string;
  spotPriceIdr: number;
  bvps0Idr: number;
  forwardRoePct: number;
  kePct: number;
  dprPct: number;
  gpaPct: number;
  ocfToNi: number;
  der: number;
  accrualPenaltyScore: number;
  hscDiscountMultiplier: number;
  catalystValuationMultiplier: number;
  beta1Y: number;
  volatilityAnn: number;
  change1D: number;
  return30D: number;
  peerDefaultChange1D: number;
  peerDefaultReturn30D: number;
  peerCorrelation: number;
  isHscFlagged: boolean;
  sectorSpecificFairValueIdr: number;
  agnosticPeerFairValueIdr: number;
  effectiveModule?: 'Compounder' | 'Capex_Aggressor' | 'Pure_Cyclical';
  ensembleAntiJunkMultiplier?: number;
}

export interface QuantWorkerOutputPayload {
  requestId: string;
  ticker: string;
  rimFairValueIdr: number;
  rimFadeYears: number;
  rimPersistenceOmega: number;
  rimTerminalRoePct: number;
  statArbSpread1DPct: number;
  statArbSpread30DPct: number;
  statArbZScore: number;
  statArbImpliedTargetIdr: number;
  ensembleFairValueIdr: number;
  ensembleFormulaAudit: string;
  computeDurationMs: number;
}

function roundToIdxTickWorker(rawPrice: number): number {
  const safe = Math.max(50, Math.round(Number(rawPrice) || 50));
  if (safe < 200) return safe;
  if (safe < 500) return Math.round(safe / 2) * 2;
  if (safe < 2000) return Math.round(safe / 5) * 5;
  if (safe < 5000) return Math.round(safe / 10) * 10;
  return Math.round(safe / 25) * 25;
}

export function executeQuantRimAndStatArbKernel(
  payload: QuantWorkerInputPayload
): QuantWorkerOutputPayload {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const {
    requestId,
    ticker,
    spotPriceIdr,
    bvps0Idr,
    forwardRoePct,
    kePct,
    dprPct,
    gpaPct,
    ocfToNi,
    der,
    accrualPenaltyScore,
    hscDiscountMultiplier,
    catalystValuationMultiplier,
    beta1Y,
    volatilityAnn,
    change1D,
    return30D,
    peerDefaultChange1D,
    peerDefaultReturn30D,
    peerCorrelation,
    isHscFlagged,
    sectorSpecificFairValueIdr,
    agnosticPeerFairValueIdr,
    effectiveModule = 'Compounder',
    ensembleAntiJunkMultiplier = 1.0
  } = payload;

  const isCapexTolerant = effectiveModule === 'Capex_Aggressor';
  const minHealthyOcf = isCapexTolerant ? 0.50 : 0.80;

  // 1. Multi-Stage Residual Income Model (Ohlson 1995; Gebhardt, Lee & Swaminathan 2001)
  // Driven by Forward Annualized ROE (latest quarterly run-rate) & Contextual OCF/NI Rule A/B
  const rimFadeYears =
    gpaPct >= 19.0 && ocfToNi >= (isCapexTolerant ? 0.75 : 0.96) && der <= 0.95
      ? 7
      : gpaPct >= 13.5 && ocfToNi > minHealthyOcf
      ? 6
      : 5;

  const ocfOmegaContribution = isCapexTolerant
    ? ocfToNi >= 0.85
      ? 0.08
      : ocfToNi > 0.50
      ? 0.04
      : -0.05
    : ocfToNi >= 1.0
    ? 0.08
    : ocfToNi > 0.80
    ? 0.03
    : -0.06;

  const rawOmega =
    0.62 +
    Math.min(0.16, (gpaPct / 30.0) * 0.14) +
    ocfOmegaContribution -
    Math.min(0.14, accrualPenaltyScore * 0.06);
  const rimPersistenceOmega = Number(Math.max(0.56, Math.min(0.88, rawOmega)).toFixed(2));

  const cashQualityAdj =
    isCapexTolerant && ocfToNi > 0.50
      ? Math.max(0.98, Math.min(1.08, 0.94 + ocfToNi * 0.14))
      : Math.max(
          0.78,
          Math.min(1.08, 0.88 + ocfToNi * 0.12 - accrualPenaltyScore * 0.05)
        );
  const startRoePct = Math.max(2.0, Math.min(36.0, forwardRoePct * cashQualityAdj));
  const rimTerminalRoePct = Number(
    Math.max(
      kePct * 0.85,
      Math.min(kePct + 5.5, 0.55 * kePct + 0.45 * Math.min(22.0, startRoePct))
    ).toFixed(2)
  );

  const keDec = kePct / 100;
  const retentionRatio = Math.max(0.15, Math.min(0.8, 1 - dprPct / 100));

  let currentBvps = bvps0Idr;
  let pvExplicitResidualIncome = 0;
  let lastResidualIncome = 0;

  for (let t = 1; t <= rimFadeYears; t++) {
    const fadeProgress = t / rimFadeYears;
    const roeT =
      startRoePct * Math.pow(rimPersistenceOmega, t * 0.45) * (1 - fadeProgress * 0.35) +
      rimTerminalRoePct * (1 - Math.pow(rimPersistenceOmega, t * 0.45) * (1 - fadeProgress * 0.35));
    const roeTDec = roeT / 100;
    const epsT = currentBvps * roeTDec;
    const residualIncomeT = (roeTDec - keDec) * currentBvps;
    const discountFactor = Math.pow(1 + keDec, t);

    pvExplicitResidualIncome += residualIncomeT / discountFactor;
    lastResidualIncome = residualIncomeT;
    currentBvps = Math.max(bvps0Idr * 0.5, currentBvps + epsT * retentionRatio);
  }

  const pvTerminalResidualIncome =
    (lastResidualIncome * rimPersistenceOmega) /
    ((1 + keDec - rimPersistenceOmega) * Math.pow(1 + keDec, rimFadeYears));

  const rawRimValue =
    (bvps0Idr + pvExplicitResidualIncome + pvTerminalResidualIncome) *
    catalystValuationMultiplier *
    hscDiscountMultiplier;
  const rimFairValueIdr = roundToIdxTickWorker(Math.max(50, rawRimValue));

  // 2. Post-Corporate Action Calibrated Statistical Arbitrage Pair Regression
  const betaPair = Math.max(0.65, Math.min(1.35, beta1Y / 0.95));
  const statArbSpread1DPct = Number((change1D - peerDefaultChange1D * 0.85).toFixed(2));
  const statArbSpread30DPct = Number((return30D - peerDefaultReturn30D * betaPair).toFixed(2));

  const pairSpreadSigma1D = Math.max(
    1.35,
    (volatilityAnn / Math.sqrt(252)) * Math.sqrt(1 - Math.pow(peerCorrelation, 2)) * 1.65
  );
  const pairSpreadSigma30D = Math.max(3.8, pairSpreadSigma1D * Math.sqrt(20) * 0.78);

  const z1D = statArbSpread1DPct / pairSpreadSigma1D;
  const z30D = statArbSpread30DPct / pairSpreadSigma30D;
  const statArbZScore = Number(Math.max(-3.5, Math.min(3.5, 0.55 * z1D + 0.45 * z30D)).toFixed(2));

  const expectedConvergencePct =
    !isHscFlagged && ocfToNi > minHealthyOcf
      ? Math.max(-8.0, Math.min(16.0, -statArbZScore * pairSpreadSigma30D * 0.65))
      : 0;
  const rawStatArbTarget =
    0.6 * (spotPriceIdr * (1 + expectedConvergencePct / 100)) + 0.4 * agnosticPeerFairValueIdr;
  const statArbImpliedTargetIdr = roundToIdxTickWorker(Math.max(50, rawStatArbTarget));

  // 3. Pure .reduce() Ensemble Aggregator over the 3 displayed comparator prices
  const legs = [
    { priceIdr: sectorSpecificFairValueIdr, weight: 0.45 },
    { priceIdr: rimFairValueIdr, weight: 0.35 },
    { priceIdr: statArbImpliedTargetIdr, weight: 0.2 }
  ] as const;

  const rawEnsemble = legs.reduce((sum, leg) => sum + leg.priceIdr * leg.weight, 0);
  const ensembleFairValueIdr = roundToIdxTickWorker(
    Math.max(50, rawEnsemble * hscDiscountMultiplier * ensembleAntiJunkMultiplier)
  );
  const ensembleFormulaAudit = `(Rp ${sectorSpecificFairValueIdr.toLocaleString('id-ID')} × 45%) + (Rp ${rimFairValueIdr.toLocaleString('id-ID')} × 35%) + (Rp ${statArbImpliedTargetIdr.toLocaleString('id-ID')} × 20%)${
    ensembleAntiJunkMultiplier < 0.999 ? ` × QMJ ${ensembleAntiJunkMultiplier.toFixed(2)}` : ''
  } = Rp ${ensembleFairValueIdr.toLocaleString('id-ID')}`;

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    requestId,
    ticker,
    rimFairValueIdr,
    rimFadeYears,
    rimPersistenceOmega,
    rimTerminalRoePct,
    statArbSpread1DPct,
    statArbSpread30DPct,
    statArbZScore,
    statArbImpliedTargetIdr,
    ensembleFairValueIdr,
    ensembleFormulaAudit,
    computeDurationMs: Number(Math.max(0.05, t1 - t0).toFixed(2))
  };
}

// Web Worker message listener ONLY when running inside a dedicated Worker context (never on main window)
if (
  typeof window === 'undefined' &&
  typeof self !== 'undefined' &&
  typeof (self as unknown as Worker).postMessage === 'function'
) {
  self.onmessage = (event: MessageEvent<QuantWorkerInputPayload>) => {
    try {
      const payload = event.data;
      if (payload && payload.requestId) {
        const result = executeQuantRimAndStatArbKernel(payload);
        (self as unknown as Worker).postMessage(result);
      }
    } catch {
      // ignore malformed messages
    }
  };
}
