import { useState } from 'react';
import { MacroCategory, MacroIndicator } from '../types/quant';
import { ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';

interface GlobalMacroPulseProps {
  indicators: MacroIndicator[];
  macroStressScore: number;
}

export function GlobalMacroPulse({
  indicators,
  macroStressScore
}: GlobalMacroPulseProps) {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | MacroCategory>('ALL');
  const [expandedDetail, setExpandedDetail] = useState<boolean>(false);

  const filtered = indicators.filter(
    (m) => selectedCategory === 'ALL' || m.category === selectedCategory
  );

  const formatValue = (item: MacroIndicator) => {
    if (item.unit === 'Rp') {
      return `Rp ${item.value.toLocaleString('id-ID')}`;
    }
    if (item.unit === '%') {
      return `${item.value.toFixed(2)}%`;
    }
    if (item.unit.startsWith('USD')) {
      return `$${item.value.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      })}`;
    }
    if (item.unit.startsWith('MYR')) {
      return `RM ${item.value.toLocaleString('en-US')}`;
    }
    return item.value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Duplicate indicators array so the CSS marquee loops seamlessly without any gap or scrollbar
  const marqueeItems = [...indicators, ...indicators];

  return (
    <section className="bg-[#FFFFFF] border-x border-b border-[#E4E2DD]">
      {/* Running Text Global Macro Wire (Zero Horizontal Scrollbar) */}
      <div className="px-4 sm:px-5 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
          <span className="font-bold uppercase tracking-wider text-[11px] text-[#D97706] bb-amber shrink-0 pr-2 border-r border-[#E4E2DD]">
            GLOBAL MACRO WIRE //
          </span>

          {/* Continuous Marquee Viewport */}
          <div className="relative flex-1 overflow-hidden">
            <div className="animate-macro-marquee gap-7 text-xs tabular-nums whitespace-nowrap">
              {marqueeItems.map((item, idx) => {
                const isPositive = item.change1D >= 0;
                const isInverseRisk = ['usdidr', 'dxy', 'us10y', 'vix'].includes(item.id);
                const semanticColor = isInverseRisk
                  ? isPositive
                    ? 'text-[#9E2A2B]'
                    : 'text-[#0D5C46]'
                  : isPositive
                  ? 'text-[#0D5C46]'
                  : 'text-[#9E2A2B]';

                return (
                  <div
                    key={`${item.id}-${idx}`}
                    className="inline-flex items-center gap-1.5 pr-2"
                  >
                    <span className="font-bold text-[#0284C7] bb-cyan">
                      {item.label}
                    </span>
                    <span className="font-semibold text-[#111315]">
                      {formatValue(item)}
                    </span>
                    <span className={`font-bold ${semanticColor}`}>
                      ({isPositive ? '+' : ''}
                      {item.change1D.toFixed(2)}%)
                    </span>
                    <span
                      title="Data Makro Tersinkronisasi Live"
                      className={`inline-flex items-center ${
                        item.isLiveFetched ? 'text-[#0D5C46]' : 'text-[#D97706]'
                      }`}
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 pl-2 border-l border-[#E4E2DD]">
          <button
            type="button"
            onClick={() => setExpandedDetail(!expandedDetail)}
            className="text-[11px] font-bold uppercase tracking-wider text-[#0284C7] bb-cyan hover:underline whitespace-nowrap cursor-pointer"
          >
            {expandedDetail ? '[TUTUP PANEL MAKRO]' : '[PANEL MAKRO +]'}
          </button>
        </div>
      </div>

      {/* Expandable Cross-Asset Macro Transmission Desk */}
      {expandedDetail && (
        <div className="px-4 sm:px-5 py-5 border-t border-[#E4E2DD]/70 bg-[#FAF9F6]/60 space-y-4 max-h-[55vh] overflow-y-auto table-scroll-container">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#D97706] bb-amber">
                CROSS-ASSET MACRO TRANSMISSION MATRIX
              </h3>
              <p className="text-xs text-neutral-600 mt-0.5">
                Transmisi likuiditas valas, imbal hasil obligasi AS, VIX, dan harga komoditas ekspor utama Indonesia terhadap sentimen IHSG.
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs self-start">
              {(
                [
                  { id: 'ALL', label: `ALL (${indicators.length})` },
                  { id: 'FX_RATES', label: 'FX & YIELDS' },
                  { id: 'COMMODITIES', label: 'COMMODITIES' },
                  { id: 'GLOBAL_RISK', label: 'GLOBAL RISK' }
                ] as { id: 'ALL' | MacroCategory; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`px-2.5 py-1 text-[11px] font-bold uppercase rounded-xs transition-colors cursor-pointer ${
                    selectedCategory === tab.id
                      ? 'bg-[#D97706] text-white bb-btn-primary'
                      : 'text-neutral-600 hover:text-[#111315]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {filtered.map((item) => {
              const isPos = item.change1D >= 0;
              return (
                <div
                  key={item.id}
                  className="p-3.5 bg-[#FFFFFF] border border-[#E4E2DD] border-l-2 border-l-[#0284C7] rounded-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-[#D97706] bb-amber uppercase">
                        {item.label}
                      </span>
                      <span
                        title="Data Makro Tersinkronisasi Live"
                        className={`inline-flex items-center p-1 rounded-xs border ${
                          item.isLiveFetched
                            ? 'text-[#0D5C46] border-[#059669]/40 bg-[#059669]/10'
                            : 'text-[#D97706] border-[#F59E0B]/40 bg-[#F59E0B]/10'
                        }`}
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-1.5 tabular-nums">
                      <span className="text-base font-bold text-[#111315]">
                        {formatValue(item)}
                      </span>
                      <span
                        className={`inline-flex items-center text-xs font-bold ${
                          item.ihsgImpact === 'BULLISH'
                            ? 'text-[#0D5C46]'
                            : item.ihsgImpact === 'BEARISH'
                            ? 'text-[#9E2A2B]'
                            : 'text-neutral-600'
                        }`}
                      >
                        {isPos ? (
                          <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                        )}
                        {isPos ? '+' : ''}
                        {item.change1D.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-neutral-600 mt-2 pt-2 border-t border-[#E4E2DD]/60 leading-snug">
                    {item.transmissionNote}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500 pt-1">
            <span>
              MACRO STRESS INDEX:{' '}
              <strong className="tabular-nums text-[#D97706] bb-amber">
                {macroStressScore.toFixed(1)} / 100
              </strong>
            </span>
            <span>FEED: YAHOO FINANCE MULTI-SYMBOL SPARK STREAM</span>
          </div>
        </div>
      )}
    </section>
  );
}
