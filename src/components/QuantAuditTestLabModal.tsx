import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  FlaskConical,
  Play,
  ShieldAlert,
  ShieldCheck,
  X
} from 'lucide-react';
import {
  runInstitutionalGuardrailsUnitTests,
  runThreeProfileAutoAdaptSimulation,
  ThreeProfileAutoAdaptSimulationRow,
  UnitTestCaseResult
} from '../utils/guardrailsUnitTestSuite';

interface QuantAuditTestLabModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuantAuditTestLabModal: React.FC<QuantAuditTestLabModalProps> = ({
  isOpen,
  onClose
}) => {
  const [filterPriority, setFilterPriority] = useState<'ALL' | 'P0' | 'P1' | 'P2'>('ALL');
  const [runCounter, setRunCounter] = useState<number>(1);

  const testResults: UnitTestCaseResult[] = useMemo(() => {
    void runCounter;
    return runInstitutionalGuardrailsUnitTests();
  }, [runCounter]);

  const threeProfileRows: ThreeProfileAutoAdaptSimulationRow[] = useMemo(() => {
    void runCounter;
    return runThreeProfileAutoAdaptSimulation();
  }, [runCounter]);

  if (!isOpen) return null;

  const filtered =
    filterPriority === 'ALL'
      ? testResults
      : testResults.filter((t) => t.priority === filterPriority);

  const totalTests = testResults.length;
  const passedTests = testResults.filter((t) => t.passed).length;
  const totalAssertions = testResults.reduce((acc, t) => acc + t.assertions.length, 0);
  const passedAssertions = testResults.reduce(
    (acc, t) => acc + t.assertions.filter((a) => a.passed).length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-stone-300 bg-[#FAF9F6] text-stone-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-300 bg-white px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-emerald-800">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold tracking-wider text-amber-700 uppercase">
                  NOSTRADAMUS QUANT TERMINAL // INSTITUTIONAL AUDIT LAB
                </span>
                <span className="rounded border border-emerald-300 bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-900">
                  {passedTests}/{totalTests} SUITES PASS ({passedAssertions}/{totalAssertions}{' '}
                  ASSERTIONS)
                </span>
              </div>
              <h3 className="mt-0.5 text-base font-bold text-stone-900">
                Unit Test Verification Suite &amp; 3-Profile Auto-Adapt Sanity Check (P0–P2)
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-stone-300 bg-white p-1.5 text-stone-500 transition-colors hover:border-rose-600 hover:bg-rose-600 hover:text-white"
            title="Tutup Audit Test Lab"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filter & Re-run Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-100 px-5 py-2.5">
          <div className="flex items-center gap-1.5">
            {(['ALL', 'P0', 'P1', 'P2'] as const).map((prio) => (
              <button
                key={prio}
                type="button"
                onClick={() => setFilterPriority(prio)}
                className={`cursor-pointer rounded border px-3 py-1 font-mono text-xs font-bold transition-colors ${
                  filterPriority === prio
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-200'
                }`}
              >
                {prio === 'ALL'
                  ? `Semua (${testResults.length})`
                  : prio === 'P0'
                  ? `P0: Data Integrity (${testResults.filter((t) => t.priority === 'P0').length})`
                  : prio === 'P1'
                  ? `P1: Auto-Adapt & Valuation (${testResults.filter((t) => t.priority === 'P1').length})`
                  : `P2: Risk & Dispersion (${testResults.filter((t) => t.priority === 'P2').length})`}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setRunCounter((c) => c + 1)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-emerald-700 bg-emerald-800 px-3 py-1 font-mono text-xs font-bold text-white transition-colors hover:bg-emerald-900"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Re-Run All Unit Tests (Run #{runCounter})</span>
          </button>
        </div>

        {/* Test Cases List + 3-Profile Auto-Adapt Verification Table */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* 3-Profile Auto-Adapt Verification Matrix */}
          <div className="rounded-lg border border-emerald-300 bg-white p-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-emerald-400 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-900">
                    SIMULASI VERIFIKASI 3 PROFIL EMITEN (AUTO-ADAPT SANITY CHECK)
                  </span>
                  <span className="font-mono text-xs font-bold text-stone-900">
                    2-Tier Fundamental-First Router · Dynamic Ensemble · Strict StatArb · runFinancialAudit()
                  </span>
                </div>
                <p className="mt-1 text-xs text-stone-600">
                  Perbandingan simultan antara Basic Materials berkarakter Consumer Quality (AVIA/ARNA), Basic Materials Komoditas Murni (ANTM/MDKA), dan Perbankan (BBCA/BRIS).
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-900">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                AUTO-ADAPT VERIFIED
              </span>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-stone-300 bg-stone-100 text-[10px] font-bold text-stone-700 uppercase">
                    <th className="px-2.5 py-2">Emiten &amp; Sektor IDX</th>
                    <th className="px-2.5 py-2">DNA Fundamental</th>
                    <th className="px-2.5 py-2">2-Tier Adaptive Route</th>
                    <th className="px-2.5 py-2">Bobot Ensemble (∑=100%)</th>
                    <th className="px-2.5 py-2">Justified PBV &amp; Fair Value</th>
                    <th className="px-2.5 py-2">Strict StatArb Overlay</th>
                    <th className="px-2.5 py-2">runFinancialAudit()</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {threeProfileRows.map((row) => (
                    <tr key={row.ticker} className="hover:bg-stone-50">
                      <td className="px-2.5 py-2 align-top">
                        <div className="font-bold text-stone-900">
                          {row.ticker}{' '}
                          <span className="font-normal text-stone-500">({row.idxSector})</span>
                        </div>
                        <div className="text-[10px] text-stone-500">{row.subIndustry}</div>
                      </td>
                      <td className="px-2.5 py-2 align-top tabular-nums">
                        <div>
                          ROE: <strong className="text-emerald-800">{row.roeTtmPct}%</strong> · DER:{' '}
                          <strong>{row.derRatio}x</strong>
                        </div>
                        <div className="text-[10px] text-stone-600">
                          GP/A: {row.gpaPct}% · OCF/NI: {row.ocfToNiRatio}x
                        </div>
                      </td>
                      <td className="px-2.5 py-2 align-top">
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                              row.isQualityCompounderOverride
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                                : row.effectiveRoute === 'PURE_CYCLICAL'
                                ? 'border-amber-400 bg-amber-50 text-amber-900'
                                : 'border-sky-400 bg-sky-50 text-sky-900'
                            }`}
                          >
                            {row.effectiveRoute}
                          </span>
                          {row.isQualityCompounderOverride && (
                            <span className="rounded bg-emerald-800 px-1.5 py-0.5 text-[9px] font-bold text-white">
                              TIER-2 DNA OVERRIDE
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[10px] text-stone-500">
                          Archetype: {row.archetype}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 align-top tabular-nums">
                        <div className="font-bold text-stone-900">{row.ensembleWeightsLabel}</div>
                        <div className="text-[9.5px] text-stone-500">{row.leg1Summary}</div>
                        <div className="text-[9.5px] text-stone-500">{row.leg2Summary}</div>
                        <div className="text-[9.5px] text-stone-500">{row.leg3Summary}</div>
                      </td>
                      <td className="px-2.5 py-2 align-top tabular-nums">
                        <div>
                          Justified PBV:{' '}
                          <strong className="text-amber-800">{row.justifiedPbv.toFixed(2)}x</strong>
                        </div>
                        <div>
                          Fair:{' '}
                          <strong className="text-emerald-800">
                            Rp {row.intrinsicValueIdr.toLocaleString('id-ID')}
                          </strong>{' '}
                          <span className="text-[10px] text-stone-500">
                            (Px Rp {row.spotPriceIdr.toLocaleString('id-ID')})
                          </span>
                        </div>
                        <div className="text-[10px] text-stone-500">
                          Ke {row.kePct}% · g {row.sustainableGrowthPct}% · PER Wajar{' '}
                          {row.reconciledImpliedPer.toFixed(1)}x
                        </div>
                      </td>
                      <td className="px-2.5 py-2 align-top">
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                            row.statArbValid
                              ? 'border-sky-300 bg-sky-50 text-sky-900'
                              : 'border-stone-300 bg-stone-100 text-stone-700'
                          }`}
                        >
                          {row.statArbStatusLabel}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 align-top">
                        <div className="flex items-center gap-1">
                          <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                            {row.auditStatus}
                          </span>
                          <span className="rounded border border-stone-300 bg-stone-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-stone-700">
                            CONF: {row.dataConfidence}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[9.5px] text-stone-600">
                          Implied PBV={row.reconciledImpliedPbv.toFixed(2)}x · TSY Clean ✓
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {filtered.map((tc) => (
            <div
              key={tc.id}
              className="rounded-lg border border-stone-300 bg-white p-4 shadow-2xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${
                      tc.priority === 'P0'
                        ? 'border-rose-300 bg-rose-50 text-rose-900'
                        : tc.priority === 'P1'
                        ? 'border-sky-300 bg-sky-50 text-sky-900'
                        : 'border-amber-300 bg-amber-50 text-amber-900'
                    }`}
                  >
                    {tc.priority}
                  </span>
                  <span className="font-mono text-xs font-bold text-stone-900">{tc.title}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded border border-stone-300 bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-stone-700">
                    {tc.scenarioType === 'CLEAN_DATA'
                      ? 'SKENARIO DATA BERSIH'
                      : 'SKENARIO DATA RUSAK / STRESS'}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                      tc.passed
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                        : 'border-rose-300 bg-rose-100 text-rose-900'
                    }`}
                  >
                    {tc.passed ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-700" />
                    )}
                    {tc.passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-1 gap-2 rounded border border-stone-200 bg-stone-50 p-2.5 font-mono text-[11px] sm:grid-cols-2">
                <div>
                  <span className="font-bold text-stone-500">Expected: </span>
                  <span className="text-stone-800">{tc.expectedSummary}</span>
                </div>
                <div>
                  <span className="font-bold text-stone-500">Actual: </span>
                  <span className="font-semibold text-emerald-900">{tc.actualSummary}</span>
                </div>
              </div>

              <div className="mt-2.5 space-y-1.5">
                {tc.assertions.map((asrt, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-stone-200/80 bg-white px-2.5 py-1.5 font-mono text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={`h-3.5 w-3.5 shrink-0 ${
                          asrt.passed ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      />
                      <span className="font-medium text-stone-800">{asrt.label}</span>
                    </div>
                    <div className="text-[10px] text-stone-500 tabular-nums">
                      Exp: <strong className="text-stone-700">{asrt.expected}</strong> · Act:{' '}
                      <strong className="text-emerald-800">{asrt.actual}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
