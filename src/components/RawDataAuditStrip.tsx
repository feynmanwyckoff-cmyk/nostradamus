import React from 'react';
import {
  RawTickerData,
  RiskSizingResult,
  SanityReport,
  TacticalOverlay,
  ValuationResult
} from '../types/quant';

export interface RawDataAuditStripProps {
  rawTickerData: RawTickerData;
  sanityReport: SanityReport;
  valuationResult?: ValuationResult;
  tacticalOverlay?: TacticalOverlay;
  riskSizingResult?: RiskSizingResult;
  onAutoSyncSharesMarketCap?: () => void;
  onOpenCalibrator?: () => void;
}

const fmtIdrCompact = (val: number): string => {
  if (!Number.isFinite(val)) return 'Rp 0';
  const abs = Math.abs(val);
  if (abs >= 1e12) {
    return `Rp ${(val / 1e12).toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} T`;
  }
  if (abs >= 1e9) {
    return `Rp ${(val / 1e9).toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} M`;
  }
  if (abs >= 1e6) {
    return `Rp ${(val / 1e6).toLocaleString('id-ID', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} Jt`;
  }
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
};

const fmtShares = (shares: number): string => {
  if (!Number.isFinite(shares)) return '0 lbr';
  if (shares >= 1e9) {
    return `${(shares / 1e9).toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} M lbr`;
  }
  return `${Math.round(shares).toLocaleString('id-ID')} lbr`;
};

export const RawDataAuditStrip: React.FC<RawDataAuditStripProps> = ({
  rawTickerData,
  sanityReport,
  valuationResult,
  tacticalOverlay,
  riskSizingResult,
  onAutoSyncSharesMarketCap,
  onOpenCalibrator
}) => {
  const badgeColor =
    sanityReport.status === 'PASS'
      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
      : sanityReport.status === 'WARN'
      ? 'bg-amber-100 text-amber-900 border-amber-300'
      : 'bg-rose-100 text-rose-900 border-rose-300';

  const dotColor =
    sanityReport.status === 'PASS'
      ? 'bg-emerald-600'
      : sanityReport.status === 'WARN'
      ? 'bg-amber-600'
      : 'bg-rose-600';

  const spotRf10YPct = rawTickerData.spotRf10Y <= 1 ? rawTickerData.spotRf10Y * 100 : rawTickerData.spotRf10Y;
  const rawRoic = rawTickerData.roicTTM ?? 0.14;
  const roicPct = rawRoic <= 1 ? rawRoic * 100 : rawRoic;

  return (
    <div className="mt-5 rounded-lg border border-stone-300 bg-stone-100/90 p-3.5 text-stone-900 shadow-xs">
      {/* Header Row: Audit Strip Title + SANITY_CHECK Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-300 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold tracking-wider text-stone-800 uppercase">
            RAW DATA AUDIT STRIP (P0–P2 INSTITUTIONAL TELEMETRY)
          </span>
          <span className="font-mono text-[10px] text-stone-500">
            · Ticker: {rawTickerData.ticker} · Basis: {sanityReport.valuationBasis}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sanityReport.flags.map((flag) => (
            <span
              key={flag}
              className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-900"
            >
              {flag}
            </span>
          ))}
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-tight ${badgeColor}`}
          >
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            SANITY_CHECK: {sanityReport.status}
          </span>
        </div>
      </div>

      {/* Primary 8 Raw Data Cells (Fira Code Monospace Tabular) */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <div className="rounded border border-stone-200 bg-white px-2.5 py-1.5">
          <div className="font-mono text-[9px] font-semibold tracking-wider text-stone-500 uppercase">
            Shares (Lembar)
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-stone-900 tabular-nums">
            {fmtShares(rawTickerData.sharesOutstanding)}
          </div>
          <div className="font-mono text-[9px] text-stone-500 tabular-nums">
            Δ Implied: {(sanityReport.sharesMismatchPct * 100).toFixed(2)}%
          </div>
        </div>

        <div className="rounded border border-stone-200 bg-white px-2.5 py-1.5">
          <div className="font-mono text-[9px] font-semibold tracking-wider text-stone-500 uppercase">
            MarketCap
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-stone-900 tabular-nums">
            {fmtIdrCompact(rawTickerData.marketCap)}
          </div>
          <div className="font-mono text-[9px] text-stone-500 tabular-nums">
            Px: Rp {rawTickerData.price.toLocaleString('id-ID')}
          </div>
        </div>

        <div className="rounded border border-stone-200 bg-white px-2.5 py-1.5">
          <div className="font-mono text-[9px] font-semibold tracking-wider text-stone-500 uppercase">
            Rev_TTM
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-stone-900 tabular-nums">
            {fmtIdrCompact(rawTickerData.revenueTTM)}
          </div>
          <div className="font-mono text-[9px] text-stone-500 tabular-nums">
            OP YoY: {(rawTickerData.operatingProfitYoYPct ?? 0) >= 0 ? '+' : ''}
            {(rawTickerData.operatingProfitYoYPct ?? 0).toFixed(1)}%
          </div>
        </div>

        <div className="rounded border border-stone-200 bg-white px-2.5 py-1.5">
          <div className="font-mono text-[9px] font-semibold tracking-wider text-stone-500 uppercase">
            NI_TTM
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-stone-900 tabular-nums">
            {fmtIdrCompact(rawTickerData.netIncomeTTM)}
          </div>
          <div className="font-mono text-[9px] text-stone-500 tabular-nums">
            Δ EPS×Shr: {(sanityReport.netIncomeMismatchPct * 100).toFixed(2)}%
          </div>
        </div>

        <div className="rounded border border-stone-200 bg-white px-2.5 py-1.5">
          <div className="font-mono text-[9px] font-semibold tracking-wider text-stone-500 uppercase">
            Equity
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-stone-900 tabular-nums">
            {fmtIdrCompact(rawTickerData.equityAttributable)}
          </div>
          <div className="font-mono text-[9px] text-stone-500 tabular-nums">
            Δ BVPS×Shr: {(sanityReport.equityMismatchPct * 100).toFixed(2)}%
          </div>
        </div>

        <div className="rounded border border-stone-200 bg-white px-2.5 py-1.5">
          <div className="font-mono text-[9px] font-semibold tracking-wider text-stone-500 uppercase">
            Capex_TTM
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-stone-900 tabular-nums">
            {fmtIdrCompact(rawTickerData.capexTTM)}
          </div>
          <div className="font-mono text-[9px] text-stone-500 tabular-nums">
            ROIC: {roicPct.toFixed(1)}%
          </div>
        </div>

        <div className="rounded border border-stone-200 bg-white px-2.5 py-1.5">
          <div className="font-mono text-[9px] font-semibold tracking-wider text-stone-500 uppercase">
            ADTV_20D_IDR
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-stone-900 tabular-nums">
            {fmtIdrCompact(sanityReport.normalizedAdtv20dIDR)}
          </div>
          <div className="font-mono text-[9px] text-stone-500 tabular-nums">
            5% Cap: {fmtIdrCompact(sanityReport.maxDailyAbsorption5PctIDR)}
          </div>
        </div>

        <div className="rounded border border-stone-200 bg-white px-2.5 py-1.5">
          <div className="font-mono text-[9px] font-semibold tracking-wider text-stone-500 uppercase">
            SBN_10Y (Tanggal)
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-stone-900 tabular-nums">
            {spotRf10YPct.toFixed(2)}% ({rawTickerData.rfLastUpdated.slice(0, 10)})
          </div>
          <div className="font-mono text-[9px] text-stone-500 tabular-nums">
            Usia: {sanityReport.rfAgeDays} hr{' '}
            {sanityReport.keSafetyBufferBps > 0 ? `(+${sanityReport.keSafetyBufferBps}bps Ke)` : '(Fresh)'}
          </div>
        </div>
      </div>

      {/* P1 & P2 Guardrail Telemetry Row */}
      {(valuationResult || riskSizingResult || tacticalOverlay) && (
        <div className="mt-2.5 grid grid-cols-1 gap-2 border-t border-stone-200 pt-2.5 md:grid-cols-3">
          {valuationResult && (
            <div className="rounded border border-stone-200 bg-stone-50 px-2.5 py-1.5 font-mono text-[10px]">
              <div className="font-bold text-stone-700 uppercase">
                P1 ValuationLedger ({valuationResult.appliedModule})
              </div>
              <div className="mt-0.5 text-stone-600 tabular-nums">
                Ensemble: Rp {valuationResult.ensembleFairValue.toLocaleString('id-ID')} | Floor
                3-5Y: Rp {valuationResult.standaloneFloor.toLocaleString('id-ID')}{' '}
                {valuationResult.isFloorClamped ? '[CLAMPED ≤90%]' : '[INVARIANT OK]'}
              </div>
              {valuationResult.valuationLedger ? (
                <div className="text-stone-500 tabular-nums">
                  {valuationResult.valuationLedger.components
                    .map(
                      (c) =>
                        `${c.label}: Rp ${c.value.toLocaleString('id-ID')} (${Math.round(
                          c.weight * 100
                        )}%)`
                    )
                    .join(' · ')}
                </div>
              ) : (
                <div className="text-stone-500 tabular-nums">
                  2-Stage RI: g1={(valuationResult.stage1GrowthRate * 100).toFixed(1)}% · gTerm=
                  {(valuationResult.terminalGrowthRate * 100).toFixed(1)}% · Spread=
                  {(valuationResult.terminalSpread * 100).toFixed(1)}%
                </div>
              )}
            </div>
          )}

          {tacticalOverlay && (
            <div className="rounded border border-stone-200 bg-stone-50 px-2.5 py-1.5 font-mono text-[10px]">
              <div className="font-bold text-stone-700 uppercase">
                P1.3 Tactical Overlay (Non-Intrinsic StatArb)
              </div>
              <div className="mt-0.5 text-stone-600 tabular-nums">
                Pair: {tacticalOverlay.pairTicker} (ρ={(tacticalOverlay.correlation ?? 0.85).toFixed(2)}) · Z=
                {tacticalOverlay.zScore >= 0 ? '+' : ''}
                {tacticalOverlay.zScore}σ · Spread 30D: {tacticalOverlay.spreadPct >= 0 ? '+' : ''}
                {tacticalOverlay.spreadPct}%
              </div>
              <div className="text-stone-500">Action: {tacticalOverlay.actionLabel}</div>
            </div>
          )}

          {riskSizingResult && (
            <div className="rounded border border-stone-200 bg-stone-50 px-2.5 py-1.5 font-mono text-[10px]">
              <div className="font-bold text-stone-700 uppercase">
                P2 Risk Sizing, Stop Loss & Dispersion
              </div>
              <div className="mt-0.5 text-stone-600 tabular-nums">
                Max Cap: {riskSizingResult.finalMaxAllocationPct}% (1/β:{' '}
                {riskSizingResult.inverseBetaCapPct}% · 1/Vol:{' '}
                {riskSizingResult.inverseVolatilityCapPct}% · Reg:{' '}
                {riskSizingResult.regimeCapPct}%)
                {valuationResult
                  ? ` | Dispersi: ${(valuationResult.modelDispersion * 100).toFixed(1)}%`
                  : ''}
                {riskSizingResult.dispersionPenaltyPts > 0
                  ? ` (-${riskSizingResult.dispersionPenaltyPts}pts)`
                  : ''}
              </div>
              <div className="text-stone-500 tabular-nums">
                ATR/Vol Stop: Rp {riskSizingResult.stopLossPriceIDR.toLocaleString('id-ID')} (-
                {riskSizingResult.stopLossPct}%) | T1: {riskSizingResult.tranche1AllocationPct}% · T2:{' '}
                {riskSizingResult.tranche2AllocationPct}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* Blocking / Warning Diagnostic Reasons + Quick P0 Reconciliation Actions */}
      {sanityReport.reasons.length > 0 && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50/90 px-2.5 py-2 font-mono text-[10px] text-amber-950 space-y-2">
          <div className="space-y-1">
            {sanityReport.reasons.map((reason, idx) => (
              <div key={idx}>• {reason}</div>
            ))}
          </div>
          {sanityReport.flags.includes('CRITICAL_DATA_MISMATCH') &&
            (onAutoSyncSharesMarketCap || onOpenCalibrator) && (
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-300/70">
                {onAutoSyncSharesMarketCap && (
                  <button
                    type="button"
                    onClick={onAutoSyncSharesMarketCap}
                    className="px-2.5 py-1 rounded bg-[#0D5C46] hover:bg-[#059669] text-white font-mono text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    Sinkronkan P0 Otomatis (Market Cap = Shares × Harga Live)
                  </button>
                )}
                {onOpenCalibrator && (
                  <button
                    type="button"
                    onClick={onOpenCalibrator}
                    className="px-2.5 py-1 rounded bg-white hover:bg-amber-100 text-amber-950 border border-amber-400 font-mono text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    Kalibrasi Manual Shares / Market Cap
                  </button>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
};
