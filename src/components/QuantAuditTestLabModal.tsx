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
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-stone-300 bg-[#FAF9F6] text-stone-900 shadow-2xl">
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
                Unit Test Verification Suite — Guardrails P0, Valuasi P1 &amp; Manajemen Risiko P2
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
                  ? 'P0: Data Integrity (4)'
                  : prio === 'P1'
                  ? 'P1: Valuation Architecture (3)'
                  : 'P2: Risk & Dispersion (2)'}
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

        {/* Test Cases List */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
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
