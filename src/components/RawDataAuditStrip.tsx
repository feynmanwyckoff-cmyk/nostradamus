import React from 'react';
import {
  RawTickerData,
  RiskSizingResult,
  SanityReport,
  TacticalOverlay,
  ValuationResult
} from '../types/quant';
import {
  DataSourceType,
  FieldFreshnessStatus,
  TickerDataLineageReport
} from '../utils/dataLineageEngine';

export interface RawDataAuditStripProps {
  rawTickerData: RawTickerData;
  sanityReport: SanityReport;
  valuationResult?: ValuationResult;
  tacticalOverlay?: TacticalOverlay;
  riskSizingResult?: RiskSizingResult;
  dataLineage?: TickerDataLineageReport;
  onAutoSyncSharesMarketCap?: () => void;
  onOpenCalibrator?: () => void;
  onOpenLineageDrawer?: () => void;
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

const renderMiniProvenanceBadge = (
  source?: DataSourceType,
  status?: FieldFreshnessStatus
): React.ReactNode => {
  if (!source) return null;
  if (status === 'ANOMALY') {
    return (
      <span className="rounded border border-amber-500/60 bg-amber-500/20 px-1 py-0.2 font-mono text-[8.5px] font-bold text-amber-300">
        ANOMALY
      </span>
    );
  }
  if (status === 'SEED_WARN') {
    return (
      <span className="rounded border border-rose-500/50 bg-rose-500/15 px-1 py-0.2 font-mono text-[8.5px] font-bold text-rose-300">
        SEED_WARN
      </span>
    );
  }
  if (source === 'USER_OVERRIDE') {
    return (
      <span className="rounded border border-indigo-500/50 bg-indigo-500/15 px-1 py-0.2 font-mono text-[8.5px] font-bold text-indigo-300">
        OVERRIDE
      </span>
    );
  }
  if (source === 'LIVE_YAHOO_API') {
    return (
      <span className="rounded border border-emerald-500/50 bg-emerald-500/15 px-1 py-0.2 font-mono text-[8.5px] font-bold text-emerald-300">
        LIVE WORKER
      </span>
    );
  }
  if (source === 'FUNDAMENTALS_JSON' || source === 'SNAPSHOT_JSON') {
    const isStale = status === 'STALE';
    return (
      <span
        className={`rounded border px-1 py-0.2 font-mono text-[8.5px] font-bold ${
          isStale
            ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
            : 'border-sky-500/50 bg-sky-500/15 text-sky-300'
        }`}
      >
        {source === 'FUNDAMENTALS_JSON' ? 'FUND_JSON' : 'SNAP_JSON'}
        {isStale ? '·STALE' : ''}
      </span>
    );
  }
  if (source === 'PROXY_FORMULA') {
    return (
      <span className="rounded border border-amber-500/50 bg-amber-500/15 px-1 py-0.2 font-mono text-[8.5px] font-bold text-amber-300">
        PROXY
      </span>
    );
  }
  return (
    <span className="rounded border border-rose-500/50 bg-rose-500/15 px-1 py-0.2 font-mono text-[8.5px] font-bold text-rose-300">
      SEED_WARN
    </span>
  );
};

export const RawDataAuditStrip: React.FC<RawDataAuditStripProps> = ({
  rawTickerData,
  sanityReport,
  valuationResult,
  tacticalOverlay,
  riskSizingResult,
  dataLineage,
  onAutoSyncSharesMarketCap,
  onOpenCalibrator,
  onOpenLineageDrawer
}) => {
  const badgeColor =
    sanityReport.status === 'PASS'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : sanityReport.status === 'WARN'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
      : sanityReport.status === 'SEED_WARN'
      ? 'bg-rose-500/15 text-rose-300 border-rose-500/50'
      : 'bg-rose-600/20 text-rose-200 border-rose-500/60';

  const dotColor =
    sanityReport.status === 'PASS'
      ? 'bg-emerald-400'
      : sanityReport.status === 'WARN'
      ? 'bg-amber-400'
      : 'bg-rose-400';

  const spotRf10YPct =
    rawTickerData.spotRf10Y <= 1 ? rawTickerData.spotRf10Y * 100 : rawTickerData.spotRf10Y;
  const rawRoic = rawTickerData.roicTTM ?? 0.14;
  const roicPct = rawRoic <= 1 ? rawRoic * 100 : rawRoic;
  const f = dataLineage?.fields;

  return (
    <div className="mt-5 rounded-xs border border-[#222C3C] bg-[#0D131C] p-3.5 text-slate-200 shadow-lg">
      {/* Header Row: Audit Strip Title + Provenance Summary + SANITY_CHECK Badge */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-b border-[#222C3C] pb-2.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="font-mono text-[11px] font-bold tracking-wider text-amber-400 uppercase">
            RAW DATA AUDIT STRIP (P0–P3 PROVENANCE &amp; FRESHNESS TELEMETRY)
          </span>
          <span className="font-mono text-[10px] text-slate-300 font-semibold pr-2">
            · Ticker: {rawTickerData.ticker} · Basis: {sanityReport.valuationBasis} · MktCap {fmtIdrCompact(rawTickerData.marketCap)} · Rev {fmtIdrCompact(rawTickerData.revenueTTM)} · NI {fmtIdrCompact(rawTickerData.netIncomeTTM)} · ADTV {fmtIdrCompact(sanityReport.normalizedAdtv20dIDR)}/hr
          </span>
          {dataLineage && (
            <button
              type="button"
              onClick={onOpenLineageDrawer}
              className={`inline-flex items-center gap-1 rounded-xs border px-2 py-0.5 font-mono text-[10px] font-bold cursor-pointer transition-colors ${
                dataLineage.convictionCappedByLineage
                  ? 'border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                  : dataLineage.staleFieldCount > 0 || dataLineage.sbnMacroStatus.isStaleOrProxy
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                  : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              }`}
              title="Klik untuk membuka Forensic Data Lineage & Freshness Debugger Drawer"
            >
              <span>
                LINEAGE: {dataLineage.overallIntegrityStatus} (FRESH:{dataLineage.freshFieldCount} ·
                STALE:{dataLineage.staleFieldCount} · SEED:{dataLineage.seedFieldCount})
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dataLineage?.sbnMacroStatus.isStaleOrProxy && (
            <span
              className="rounded-xs border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300"
              title="Kurva SBN 10Y berusia > 7 hari atau dihitung menggunakan formula proksi ^TNX"
            >
              ⚠ {dataLineage.sbnMacroStatus.warningBadgeText || 'SBN 10Y STALE / PROXY'}
            </span>
          )}
          {sanityReport.flags.map((flag) => {
            const compactFlagMap: Record<string, string> = {
              LINEAR_ANNUALIZATION_BLOCKED: 'LIN_ANN_BLOCKED',
              YTD_CUMULATIVE_SUM_SUSPECT: 'YTD_SUM_SUSPECT',
              CATALYST_UNCONFIRMED_NON_OP: 'CAT_NON_OP_BLOCK',
              CRITICAL_DATA_MISMATCH: 'DATA_MISMATCH',
              BALANCE_SHEET_ANOMALY: 'BS_ANOMALY',
              ADTV_UNIT_ANOMALY: 'ADTV_UNIT_WARN',
              SBN_PROXY_OR_STALE: 'SBN_PROXY_STALE',
              STALE_RF_DATA: 'RF_STALE'
            };
            const shortLabel = compactFlagMap[flag] || flag;
            return (
              <span
                key={flag}
                title={flag}
                className="rounded-xs border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300"
              >
                {shortLabel}
              </span>
            );
          })}
          <span
            className={`inline-flex items-center gap-1.5 rounded-xs border px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-tight ${badgeColor}`}
          >
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            SANITY_CHECK: {sanityReport.status}
          </span>
        </div>
      </div>

      {/* Primary 8 Raw Data Cells (Fira Code Monospace Tabular) */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <div className="rounded-xs border border-[#222C3C] bg-[#11161F] px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-semibold tracking-wider text-slate-400 uppercase">
              Shares
            </span>
            {renderMiniProvenanceBadge(
              f?.sharesOutstanding.source,
              f?.sharesOutstanding.status
            )}
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums">
            {fmtShares(rawTickerData.sharesOutstanding)}
          </div>
          <div className="font-mono text-[9px] text-slate-400 tabular-nums">
            Δ Implied: {(sanityReport.sharesMismatchPct * 100).toFixed(2)}%
          </div>
        </div>

        <div className="rounded-xs border border-[#222C3C] bg-[#11161F] px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-semibold tracking-wider text-slate-400 uppercase">
              MarketCap
            </span>
            {renderMiniProvenanceBadge(f?.lastPrice.source, f?.lastPrice.status)}
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums">
            {fmtIdrCompact(rawTickerData.marketCap)}
          </div>
          <div className="font-mono text-[9px] text-slate-400 tabular-nums">
            Px: Rp {rawTickerData.price.toLocaleString('id-ID')}
          </div>
        </div>

        <div className="rounded-xs border border-[#222C3C] bg-[#11161F] px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-semibold tracking-wider text-slate-400 uppercase">
              Rev_TTM
            </span>
            {renderMiniProvenanceBadge(f?.revenueTTMIdr.source, f?.revenueTTMIdr.status)}
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums">
            {fmtIdrCompact(rawTickerData.revenueTTM)}
          </div>
          <div className="font-mono text-[9px] text-slate-400 tabular-nums">
            EBIT: {fmtIdrCompact(rawTickerData.operatingProfitTTM)}
          </div>
        </div>

        <div className="rounded-xs border border-[#222C3C] bg-[#11161F] px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-semibold tracking-wider text-slate-400 uppercase">
              NI_TTM
            </span>
            {renderMiniProvenanceBadge(
              f?.netIncomeTTMIdr.source,
              f?.netIncomeTTMIdr.status
            )}
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums">
            {fmtIdrCompact(rawTickerData.netIncomeTTM)}
          </div>
          <div className="font-mono text-[9px] text-slate-400 tabular-nums">
            EPS: Rp {rawTickerData.epsTTM.toLocaleString('id-ID')}/shm
          </div>
        </div>

        <div className="rounded-xs border border-[#222C3C] bg-[#11161F] px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-semibold tracking-wider text-slate-400 uppercase">
              Equity
            </span>
            {renderMiniProvenanceBadge(
              f?.equityAttributableIdr.source,
              f?.equityAttributableIdr.status
            )}
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums">
            {fmtIdrCompact(rawTickerData.equityAttributable)}
          </div>
          <div className="font-mono text-[9px] text-slate-400 tabular-nums">
            BVPS: Rp {rawTickerData.bvps.toLocaleString('id-ID')}/shm
          </div>
        </div>

        <div className="rounded-xs border border-[#222C3C] bg-[#11161F] px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-semibold tracking-wider text-slate-400 uppercase">
              Capex_TTM
            </span>
            {renderMiniProvenanceBadge(f?.capexTTMIdr.source, f?.capexTTMIdr.status)}
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums">
            {fmtIdrCompact(rawTickerData.capexTTM)}
          </div>
          <div className="font-mono text-[9px] text-slate-400 tabular-nums">
            ROIC: {roicPct.toFixed(1)}%
          </div>
        </div>

        <div className="rounded-xs border border-[#222C3C] bg-[#11161F] px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-semibold tracking-wider text-slate-400 uppercase">
              ADTV_20D
            </span>
            {renderMiniProvenanceBadge(f?.adtv20dIdr.source, f?.adtv20dIdr.status)}
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums">
            {fmtIdrCompact(sanityReport.normalizedAdtv20dIDR)}
          </div>
          <div className="font-mono text-[9px] text-slate-400 tabular-nums">
            5% Cap: {fmtIdrCompact(sanityReport.maxDailyAbsorption5PctIDR)}
          </div>
        </div>

        <div
          className={`rounded-xs border px-2.5 py-1.5 ${
            dataLineage?.sbnMacroStatus.isStaleOrProxy
              ? 'border-amber-500/60 bg-amber-950/20'
              : 'border-[#222C3C] bg-[#11161F]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-semibold tracking-wider text-slate-400 uppercase">
              SBN_10Y
            </span>
            {renderMiniProvenanceBadge(f?.sbnSpot10YPct.source, f?.sbnSpot10YPct.status)}
          </div>
          <div className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums">
            {spotRf10YPct.toFixed(2)}% (
            {(dataLineage?.sbnMacroStatus.asOfDate || rawTickerData.rfLastUpdated)?.slice(0, 10) ||
              'PROXY / N/A'}
            )
          </div>
          <div
            className={`font-mono text-[9px] tabular-nums ${
              dataLineage?.sbnMacroStatus.isStaleOrProxy || sanityReport.isRfStale
                ? 'text-amber-300 font-bold'
                : 'text-slate-400'
            }`}
          >
            {dataLineage?.sbnMacroStatus.isStaleOrProxy || sanityReport.isRfStale
              ? dataLineage?.sbnMacroStatus.source === 'PROXY_FORMULA' ||
                sanityReport.rfAgeDays === null
                ? 'Proksi ^TNX (Override SBN)'
                : `Stale ${dataLineage?.sbnMacroStatus.ageDays ?? sanityReport.rfAgeDays} hr`
              : `Usia: ${sanityReport.rfAgeDays ?? 0} hr (Fresh)`}
          </div>
        </div>
      </div>

      {/* P1 & P2 Guardrail Telemetry Row */}
      {(valuationResult || riskSizingResult || tacticalOverlay) && (
        <div className="mt-2.5 grid grid-cols-1 gap-2 border-t border-[#222C3C] pt-2.5 md:grid-cols-3">
          {valuationResult && (
            <div className="rounded-xs border border-[#222C3C] bg-[#11161F] px-2.5 py-1.5 font-mono text-[10px]">
              <div className="font-bold text-amber-400 uppercase">
                P1 ValuationLedger ({valuationResult.appliedModule})
              </div>
              <div className="mt-0.5 text-slate-200 tabular-nums">
                Ensemble: Rp {valuationResult.ensembleFairValue.toLocaleString('id-ID')} | Floor
                3-5Y: Rp {valuationResult.standaloneFloor.toLocaleString('id-ID')}{' '}
                {valuationResult.isFloorClamped ? '[CLAMPED ≤90%]' : '[INVARIANT OK]'}
              </div>
              {valuationResult.valuationLedger ? (
                <div className="text-slate-400 tabular-nums">
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
                <div className="text-slate-400 tabular-nums">
                  2-Stage RI: g1={(valuationResult.stage1GrowthRate * 100).toFixed(1)}% · gTerm=
                  {(valuationResult.terminalGrowthRate * 100).toFixed(1)}% · Spread=
                  {(valuationResult.terminalSpread * 100).toFixed(1)}%
                </div>
              )}
            </div>
          )}

          {tacticalOverlay && (
            <div className="rounded-xs border border-[#222C3C] bg-[#11161F] px-2.5 py-1.5 font-mono text-[10px]">
              <div className="font-bold text-sky-400 uppercase">
                P1.3 Tactical Overlay (Non-Intrinsic StatArb)
              </div>
              <div className="mt-0.5 text-slate-200 tabular-nums">
                Pair: {tacticalOverlay.pairTicker} (ρ={(tacticalOverlay.correlation ?? 0.85).toFixed(2)}) · Z=
                {tacticalOverlay.zScore >= 0 ? '+' : ''}
                {tacticalOverlay.zScore}σ · Spread 30D: {tacticalOverlay.spreadPct >= 0 ? '+' : ''}
                {tacticalOverlay.spreadPct}%
              </div>
              <div className="text-slate-400">Action: {tacticalOverlay.actionLabel}</div>
            </div>
          )}

          {riskSizingResult && (
            <div className="rounded-xs border border-[#222C3C] bg-[#11161F] px-2.5 py-1.5 font-mono text-[10px]">
              <div className="font-bold text-emerald-400 uppercase">
                P2 Risk Sizing, Stop Loss &amp; Dispersion
              </div>
              <div className="mt-0.5 text-slate-200 tabular-nums">
                Max Cap: {riskSizingResult.finalMaxAllocationPct.toFixed(2)}% (1/β:{' '}
                {riskSizingResult.inverseBetaCapPct.toFixed(2)}% · 1/Vol:{' '}
                {riskSizingResult.inverseVolatilityCapPct.toFixed(2)}% · Reg:{' '}
                {riskSizingResult.regimeCapPct.toFixed(2)}%)
                {valuationResult
                  ? ` | Dispersi: ${(valuationResult.modelDispersion * 100).toFixed(1)}%`
                  : ''}
                {riskSizingResult.dispersionPenaltyPts > 0
                  ? ` (-${riskSizingResult.dispersionPenaltyPts}pts)`
                  : ''}
              </div>
              <div className="text-slate-400 tabular-nums">
                ATR/Vol Stop: Rp {riskSizingResult.stopLossPriceIDR.toLocaleString('id-ID')} (-
                {riskSizingResult.stopLossPct}%) | T1: {riskSizingResult.tranche1AllocationPct.toFixed(2)}% · T2:{' '}
                {riskSizingResult.tranche2AllocationPct.toFixed(2)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* Blocking / Warning Diagnostic Reasons + Quick P0 Reconciliation Actions */}
      {(sanityReport.reasons.length > 0 || dataLineage?.convictionCapReason) && (
        <div className="mt-2 rounded-xs border border-amber-500/40 bg-amber-950/25 px-2.5 py-2 font-mono text-[10px] text-amber-200 space-y-2">
          <div className="space-y-1">
            {dataLineage?.convictionCapReason && (
              <div className="text-rose-300 font-bold">• {dataLineage.convictionCapReason}</div>
            )}
            {sanityReport.reasons.map((reason, idx) => (
              <div key={idx}>• {reason}</div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/30">
            {sanityReport.flags.includes('CRITICAL_DATA_MISMATCH') && onAutoSyncSharesMarketCap && (
              <button
                type="button"
                onClick={onAutoSyncSharesMarketCap}
                title="Rekonsiliasi 1-klik: Menyelaraskan skala mata uang (USD→IDR bila terdeteksi), EPS×Shares, BVPS×Shares, dan Market Cap = Shares × Harga Live"
                className="px-2.5 py-1 rounded-xs bg-emerald-700 hover:bg-emerald-600 text-white font-mono text-[10px] font-bold cursor-pointer transition-colors"
              >
                Sinkronkan &amp; Rekonsiliasi P0 Otomatis (Skala USD→IDR &amp; Market Cap = Shares × Harga Live)
              </button>
            )}
            {onOpenCalibrator && (
              <button
                type="button"
                onClick={onOpenCalibrator}
                className="px-2.5 py-1 rounded-xs bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-400/50 font-mono text-[10px] font-bold cursor-pointer transition-colors"
              >
                Kalibrasi &amp; Override Fundamental (Revenue / NI / Equity / Shares / SBN)
              </button>
            )}
            {onOpenLineageDrawer && (
              <button
                type="button"
                onClick={onOpenLineageDrawer}
                className="px-2.5 py-1 rounded-xs bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-mono text-[10px] font-bold cursor-pointer transition-colors"
              >
                Buka Forensic Data Lineage Drawer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

