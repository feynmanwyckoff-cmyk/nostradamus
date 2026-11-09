import React, { useEffect, useMemo, useState } from 'react';
import {
  EmitenNewsCategory,
  MarketRegimeStatus,
  NewsSentimentItem,
  StockMetrics
} from '../types/quant';
import {
  buildEmitenCorporateActionRadarBaseline,
  classifyHeadlineSentiment,
  decodeHtmlEntities,
  fetchLiveEmitenSpecificNews
} from '../utils/liveMarketFetcher';
import { EmitenFundamentalInspectorModal } from './EmitenFundamentalInspectorModal';
import {
  ExternalLink,
  Newspaper,
  Globe2,
  MapPin,
  Filter,
  Search,
  RefreshCw,
  Building2,
  Scale,
  ShieldAlert
} from 'lucide-react';

interface MarketNewsSentimentProps {
  news: NewsSentimentItem[];
  isLoadingNews?: boolean;
  stocks?: StockMetrics[];
  regimeStatus?: MarketRegimeStatus;
  onToggleHscFlag?: (ticker: string, currentlyFlagged: boolean) => void;
  onInspectTicker?: (ticker: string) => void;
  onStockSynced?: (updatedStock: StockMetrics) => void;
}

type SentimentFilterType = 'ALL' | NewsSentimentItem['sentiment'];
type EmitenCategoryFilter = 'ALL' | EmitenNewsCategory;

const QUICK_RADAR_TICKERS = [
  'BBCA',
  'BMRI',
  'BBRI',
  'ITMG',
  'ADRO',
  'TLKM',
  'ICBP',
  'SIDO',
  'TRUK',
  'ROCK'
];

export function MarketNewsSentiment({
  news,
  isLoadingNews = false,
  stocks = [],
  regimeStatus = 'WASPADA',
  onToggleHscFlag,
  onInspectTicker,
  onStockSynced
}: MarketNewsSentimentProps) {
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilterType>('ALL');

  // Emiten-specific radar states
  const [selectedEmitenTicker, setSelectedEmitenTicker] = useState<string>('BBCA');
  const [emitenInputQuery, setEmitenInputQuery] = useState<string>('BBCA');
  const [emitenNewsItems, setEmitenNewsItems] = useState<NewsSentimentItem[]>([]);
  const [isLoadingEmitenNews, setIsLoadingEmitenNews] = useState<boolean>(false);
  const [hasUserRequestedLiveEmiten, setHasUserRequestedLiveEmiten] =
    useState<boolean>(false);
  const [emitenCategoryFilter, setEmitenCategoryFilter] =
    useState<EmitenCategoryFilter>('ALL');
  const [inspectedStock, setInspectedStock] = useState<StockMetrics | null>(null);

  const selectedStockObj = useMemo(() => {
    return stocks.find((s) => s.ticker === selectedEmitenTicker) || null;
  }, [stocks, selectedEmitenTicker]);

  // Instantaneous baseline hydration on mount; only fetches live network RSS when user clicks Cek Emiten or a chip
  useEffect(() => {
    let isMounted = true;
    const baseline = buildEmitenCorporateActionRadarBaseline(
      selectedEmitenTicker,
      selectedStockObj?.name || `${selectedEmitenTicker} Tbk`,
      selectedStockObj?.sector || 'Financials',
      selectedStockObj || undefined
    );
    setEmitenNewsItems(baseline);

    if (!hasUserRequestedLiveEmiten) {
      return () => {
        isMounted = false;
      };
    }

    setIsLoadingEmitenNews(true);
    fetchLiveEmitenSpecificNews(
      selectedEmitenTicker,
      selectedStockObj?.name,
      selectedStockObj?.sector,
      selectedStockObj || undefined
    )
      .then((items) => {
        if (isMounted) {
          setEmitenNewsItems(items);
          setIsLoadingEmitenNews(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoadingEmitenNews(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedEmitenTicker, selectedStockObj, hasUserRequestedLiveEmiten]);

  const handleSearchEmitenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = emitenInputQuery
      .trim()
      .toUpperCase()
      .replace(/\.JK$/i, '')
      .replace(/[^A-Z]/g, '')
      .slice(0, 4);
    if (clean.length === 4) {
      setHasUserRequestedLiveEmiten(true);
      setSelectedEmitenTicker(clean);
      setEmitenInputQuery(clean);
    }
  };

  const filteredEmitenNews = useMemo(() => {
    if (emitenCategoryFilter === 'ALL') return emitenNewsItems;
    return emitenNewsItems.filter((item) => item.emitenCategory === emitenCategoryFilter);
  }, [emitenNewsItems, emitenCategoryFilter]);

  const getEmitenCategoryBadge = (cat?: EmitenNewsCategory) => {
    switch (cat) {
      case 'DIVIDEN_RUPS':
        return {
          label: 'DIVIDEN & RUPS',
          cls: 'text-[#0D5C46] border-[#059669]/40 bg-[#059669]/10'
        };
      case 'CORPORATE_ACTION_MA':
        return {
          label: 'CORPORATE ACTION / M&A',
          cls: 'text-[#0284C7] bb-cyan border-[#0284C7]/40 bg-[#0284C7]/10'
        };
      case 'FINANCIAL_EARNINGS':
        return {
          label: 'KINERJA KEUANGAN',
          cls: 'text-[#D97706] bb-amber border-[#F59E0B]/40 bg-[#F59E0B]/10'
        };
      case 'REGULATORY_UMA_ISSUE':
        return {
          label: 'ISU REGULASI / UMA / HSC',
          cls: 'text-[#9E2A2B] border-[#E11D48]/40 bg-[#E11D48]/10'
        };
      default:
        return {
          label: 'BERITA EMITEN',
          cls: 'text-neutral-600 border-neutral-400/40 bg-neutral-500/10'
        };
    }
  };

  // Re-evaluate sentiment objectively using title + summary so no negative or neutral article is ever mislabeled positive
  const objectiveNews = useMemo(() => {
    return news.map((item) => {
      const region: 'DOMESTIC' | 'GLOBAL' =
        item.region === 'DOMESTIC' ? 'DOMESTIC' : 'GLOBAL';
      const cleanTitle = decodeHtmlEntities(item.title || '');
      const cleanSummary = item.summary ? decodeHtmlEntities(item.summary) : undefined;
      const evaluated = classifyHeadlineSentiment(cleanTitle, region, cleanSummary);
      return {
        ...item,
        title: cleanTitle,
        summary: cleanSummary,
        sentiment: evaluated.sentiment,
        impactedSectors:
          item.impactedSectors && item.impactedSectors.length > 0
            ? item.impactedSectors
            : evaluated.impactedSectors
      };
    });
  }, [news]);

  const counts = useMemo(() => {
    return {
      ALL: objectiveNews.length,
      RISK_ON: objectiveNews.filter((n) => n.sentiment === 'RISK_ON').length,
      RISK_OFF: objectiveNews.filter((n) => n.sentiment === 'RISK_OFF').length,
      HAWKISH_RATES: objectiveNews.filter((n) => n.sentiment === 'HAWKISH_RATES').length,
      COMMODITY_BULL: objectiveNews.filter((n) => n.sentiment === 'COMMODITY_BULL').length,
      NEUTRAL: objectiveNews.filter((n) => n.sentiment === 'NEUTRAL').length
    };
  }, [objectiveNews]);

  const filteredNews = useMemo(() => {
    if (sentimentFilter === 'ALL') return objectiveNews;
    return objectiveNews.filter((n) => n.sentiment === sentimentFilter);
  }, [objectiveNews, sentimentFilter]);

  const domesticNews = filteredNews.filter(
    (n) => n.region === 'DOMESTIC' || (!n.region && n.id.startsWith('dom'))
  );
  const globalNews = filteredNews.filter(
    (n) => n.region === 'GLOBAL' || (!n.region && !n.id.startsWith('dom'))
  );

  const getSentimentBadge = (sentiment: NewsSentimentItem['sentiment']) => {
    switch (sentiment) {
      case 'RISK_ON':
        return {
          label: 'SENTIMEN POSITIF // BULLISH',
          color: 'text-[#0D5C46] border-[#059669]/40 bg-[#059669]/10'
        };
      case 'COMMODITY_BULL':
        return {
          label: 'KATALIS KOMODITAS',
          color: 'text-[#0284C7] bb-cyan border-[#0284C7]/40 bg-[#0284C7]/10'
        };
      case 'HAWKISH_RATES':
        return {
          label: 'WASPADA SUKU BUNGA // KURS',
          color: 'text-[#D97706] bb-amber border-[#F59E0B]/40 bg-[#F59E0B]/10'
        };
      case 'RISK_OFF':
        return {
          label: 'SENTIMEN NEGATIF // RISK-OFF',
          color: 'text-[#9E2A2B] border-[#E11D48]/40 bg-[#E11D48]/10'
        };
      case 'NEUTRAL':
      default:
        return {
          label: 'SENTIMEN NETRAL // OBJEKTIF',
          color: 'text-neutral-500 border-neutral-400/40 bg-neutral-500/10'
        };
    }
  };

  const renderNewsCard = (item: NewsSentimentItem) => {
    const badge = getSentimentBadge(item.sentiment);
    return (
      <a
        key={item.id}
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block p-4 bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#F59E0B] rounded-xs transition-all flex flex-col justify-between"
      >
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider mb-2">
            <span className={`px-2 py-0.5 rounded-xs border ${badge.color}`}>
              {badge.label}
            </span>
            <span className="text-neutral-400 tabular-nums">
              {item.source} · {item.publishedAt}
            </span>
          </div>

          <h4 className="text-sm font-bold text-[#111315] group-hover:text-[#D97706] transition-colors leading-snug">
            {item.title}
          </h4>

          {item.summary && (
            <p className="text-xs text-neutral-600 mt-1.5 leading-relaxed line-clamp-2">
              {item.summary}
            </p>
          )}
        </div>

        <div className="mt-3 pt-2.5 border-t border-[#E4E2DD]/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold uppercase text-neutral-400 mr-1">
              Sektor Terdampak:
            </span>
            {item.impactedSectors.map((sec) => (
              <span
                key={sec}
                className="text-[10px] font-bold px-1.5 py-0.5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs text-[#0284C7] bb-cyan"
              >
                {sec}
              </span>
            ))}
          </div>

          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#D97706] bb-amber group-hover:underline">
            <span>Baca Sumber</span>
            <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </a>
    );
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: RADAR BERITA SPESIFIK EMITEN, CORPORATE ACTION & ISU TERKINI */}
      <section className="bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#E4E2DD] pb-3.5">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-[#D97706] bb-amber shrink-0" />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#D97706] bb-amber block">
                EMITEN-SPECIFIC INTELLIGENCE // CORPORATE ACTION, DIVIDEN, RUPS &amp; ISU TERKINI
              </span>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-[#111315]">
                Radar Berita Spesifik Emiten, Aksi Korporasi &amp; Deteksi Isu / UMA (BEI)
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedStockObj && (
              <button
                type="button"
                onClick={() =>
                  onInspectTicker
                    ? onInspectTicker(selectedStockObj.ticker)
                    : setInspectedStock(selectedStockObj)
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#D97706] hover:bg-[#B45309] text-white rounded-xs transition-colors cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Inspect Fundamental &amp; AI ({selectedEmitenTicker})</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Ticker Bar + Quick Ticker Buttons */}
        <div className="p-3.5 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <form
              onSubmit={handleSearchEmitenSubmit}
              className="flex items-center gap-2 flex-1 max-w-md"
            >
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={emitenInputQuery}
                  onChange={(e) => setEmitenInputQuery(e.target.value.toUpperCase())}
                  maxLength={8}
                  placeholder="Ketik kode saham 4 huruf (contoh: BBCA, ITMG, TRUK, ROCK)..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs text-[#111315] focus:outline-none focus:border-[#D97706]"
                />
              </div>
              <button
                type="submit"
                disabled={isLoadingEmitenNews}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#111315] hover:bg-neutral-800 text-white rounded-xs transition-colors cursor-pointer"
              >
                {isLoadingEmitenNews ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>Tarik Berita Emiten</span>
              </button>
            </form>

            {/* Quick Emiten Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-neutral-500 mr-1">
                Pilih Cepat:
              </span>
              {QUICK_RADAR_TICKERS.map((tk) => {
                const st = stocks.find((s) => s.ticker === tk);
                const isHsc = Boolean(st?.isHscFlagged);
                const active = selectedEmitenTicker === tk;
                return (
                  <button
                    key={tk}
                    type="button"
                    onClick={() => {
                      setHasUserRequestedLiveEmiten(true);
                      setSelectedEmitenTicker(tk);
                      setEmitenInputQuery(tk);
                    }}
                    className={`px-2 py-1 text-[11px] font-mono font-bold rounded-xs border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                      active
                        ? 'bg-[#D97706] text-white border-[#D97706]'
                        : isHsc
                        ? 'bg-[#E11D48]/10 text-[#9E2A2B] border-[#E11D48]/40 hover:border-[#E11D48]'
                        : 'bg-[#FFFFFF] text-neutral-700 border-[#E4E2DD] hover:border-[#D97706]'
                    }`}
                  >
                    <span>{tk}</span>
                    {isHsc && <span className="text-[9px] uppercase">HSC</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Emiten Status Strip + Category Filter */}
          <div className="pt-2.5 border-t border-[#E4E2DD] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold font-mono text-[#111315]">
                {selectedEmitenTicker}.JK
              </span>
              {selectedStockObj && (
                <>
                  <span className="text-neutral-500">({selectedStockObj.name})</span>
                  <span className="font-mono font-bold text-[#111315]">
                    Rp {selectedStockObj.lastPrice.toLocaleString('id-ID')}
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      selectedStockObj.change1D >= 0 ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'
                    }`}
                  >
                    ({selectedStockObj.change1D >= 0 ? '+' : ''}
                    {selectedStockObj.change1D.toFixed(2)}%)
                  </span>
                  {selectedStockObj.isHscFlagged && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-[#E11D48]/15 text-[#9E2A2B] border border-[#E11D48]/40 rounded-xs">
                      <ShieldAlert className="w-3 h-3" />
                      <span>TERINDIKASI HSC · BLOKIR TOP BUY</span>
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: 'ALL', label: 'Semua Isu Emiten' },
                  { id: 'DIVIDEN_RUPS', label: 'Dividen & RUPS' },
                  { id: 'CORPORATE_ACTION_MA', label: 'Corporate Action' },
                  { id: 'FINANCIAL_EARNINGS', label: 'Kinerja Keuangan' },
                  { id: 'REGULATORY_UMA_ISSUE', label: 'Isu / UMA / HSC' }
                ] as { id: EmitenCategoryFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEmitenCategoryFilter(tab.id)}
                  className={`px-2 py-1 text-[10px] font-bold uppercase rounded-xs border transition-colors cursor-pointer ${
                    emitenCategoryFilter === tab.id
                      ? 'bg-[#0284C7] text-white border-[#0284C7]'
                      : 'bg-[#FFFFFF] text-neutral-600 border-[#E4E2DD] hover:border-[#0284C7]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Emiten News & Corporate Action Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredEmitenNews.map((item) => {
            const catBadge = getEmitenCategoryBadge(item.emitenCategory);
            const sentBadge = getSentimentBadge(item.sentiment);
            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group p-4 bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#D97706] rounded-xs transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-bold uppercase mb-2">
                    <span className={`px-2 py-0.5 rounded-xs border ${catBadge.cls}`}>
                      {catBadge.label}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-xs border ${sentBadge.color}`}>
                      {item.sentiment === 'RISK_ON'
                        ? 'POSITIF'
                        : item.sentiment === 'RISK_OFF'
                        ? 'NEGATIF / WASPADA'
                        : 'NETRAL'}
                    </span>
                  </div>

                  <h4 className="text-xs sm:text-sm font-bold text-[#111315] group-hover:text-[#D97706] leading-snug">
                    {item.title}
                  </h4>

                  {item.summary && (
                    <p className="text-xs text-neutral-600 mt-1.5 leading-relaxed line-clamp-3">
                      {item.summary}
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-[#E4E2DD]/70 flex items-center justify-between text-[10px] font-bold text-neutral-500">
                  <span className="truncate max-w-[70%]">
                    {item.source} · {item.publishedAt}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#D97706] group-hover:underline shrink-0">
                    <span>Sumber</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: GENERAL DOMESTIC & GLOBAL MACRO NEWS WIRE */}
      <section className="bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs p-5 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E4E2DD] pb-3.5">
          <div className="flex items-center gap-2.5">
            <Newspaper className="w-4 h-4 text-[#D97706] bb-amber shrink-0" />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#D97706] bb-amber block">
                REAL-TIME FINANCIAL NEWS WIRE // DOMESTIC (RI) &amp; INTERNATIONAL
              </span>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-[#111315]">
                Katalis Berita Ekonomi Dalam Negeri &amp; Global (Klasifikasi Sentimen Objektif)
              </h3>
            </div>
          </div>

          <div className="text-[11px] font-bold uppercase tracking-wider text-[#0284C7] bb-cyan">
            {isLoadingNews ? 'MENYINKRONKAN RSS...' : `${objectiveNews.length} BERITA AKTIF`}
          </div>
        </div>

        {/* Objective Sentiment Distribution & Filter Bar */}
        <div className="p-3 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#111315]">
            <Filter className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
            <span>Filter Klasifikasi Objektif:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSentimentFilter('ALL')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer ${
                sentimentFilter === 'ALL'
                  ? 'bg-[#D97706] text-white border-[#D97706] bb-btn-primary'
                  : 'bg-[#FFFFFF] text-neutral-600 border-[#E4E2DD] hover:border-[#F59E0B]'
              }`}
            >
              Semua ({counts.ALL})
            </button>
            <button
              type="button"
              onClick={() => setSentimentFilter('RISK_OFF')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer ${
                sentimentFilter === 'RISK_OFF'
                  ? 'bg-[#E11D48] text-white border-[#E11D48]'
                  : 'bg-[#FFFFFF] text-[#9E2A2B] border-[#E4E2DD] hover:border-[#E11D48]'
              }`}
            >
              Negatif / Risk-Off ({counts.RISK_OFF})
            </button>
            <button
              type="button"
              onClick={() => setSentimentFilter('RISK_ON')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer ${
                sentimentFilter === 'RISK_ON'
                  ? 'bg-[#059669] text-white border-[#059669]'
                  : 'bg-[#FFFFFF] text-[#0D5C46] border-[#E4E2DD] hover:border-[#059669]'
              }`}
            >
              Positif / Bullish ({counts.RISK_ON})
            </button>
            <button
              type="button"
              onClick={() => setSentimentFilter('HAWKISH_RATES')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer ${
                sentimentFilter === 'HAWKISH_RATES'
                  ? 'bg-[#D97706] text-white border-[#D97706]'
                  : 'bg-[#FFFFFF] text-[#D97706] bb-amber border-[#E4E2DD] hover:border-[#F59E0B]'
              }`}
            >
              Waspada Bunga / Kurs ({counts.HAWKISH_RATES})
            </button>
            <button
              type="button"
              onClick={() => setSentimentFilter('COMMODITY_BULL')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer ${
                sentimentFilter === 'COMMODITY_BULL'
                  ? 'bg-[#0284C7] text-white border-[#0284C7]'
                  : 'bg-[#FFFFFF] text-[#0284C7] bb-cyan border-[#E4E2DD] hover:border-[#0284C7]'
              }`}
            >
              Katalis Komoditas ({counts.COMMODITY_BULL})
            </button>
            <button
              type="button"
              onClick={() => setSentimentFilter('NEUTRAL')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer ${
                sentimentFilter === 'NEUTRAL'
                  ? 'bg-neutral-700 text-white border-neutral-700'
                  : 'bg-[#FFFFFF] text-neutral-500 border-[#E4E2DD] hover:border-neutral-400'
              }`}
            >
              Netral / Objektif ({counts.NEUTRAL})
            </button>
          </div>
        </div>

        {/* 2-Column Split: Dalam Negeri (Left) & Luar Negeri (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column 1: Berita Ekonomi & Pasar Modal Dalam Negeri (Indonesia) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E4E2DD]">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0D5C46]">
                <MapPin className="w-3.5 h-3.5" />
                <span>DALAM NEGERI (INDONESIA / BEI / BI)</span>
              </div>
              <span className="text-[10px] font-bold text-neutral-400 uppercase">
                {domesticNews.length} ARTIKEL
              </span>
            </div>

            <div className="space-y-3">
              {domesticNews.length > 0 ? (
                domesticNews.map(renderNewsCard)
              ) : (
                <div className="p-4 text-xs text-neutral-500 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
                  Tidak ada berita domestik pada kategori filter sentimen ini.
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Berita Ekonomi & Makro Luar Negeri (Global) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E4E2DD]">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0284C7] bb-cyan">
                <Globe2 className="w-3.5 h-3.5" />
                <span>LUAR NEGERI (THE FED / WALL STREET / KOMODITAS GLOBAL)</span>
              </div>
              <span className="text-[10px] font-bold text-neutral-400 uppercase">
                {globalNews.length} ARTIKEL
              </span>
            </div>

            <div className="space-y-3">
              {globalNews.length > 0 ? (
                globalNews.map(renderNewsCard)
              ) : (
                <div className="p-4 text-xs text-neutral-500 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs">
                  Tidak ada berita global pada kategori filter sentimen ini.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Emiten Fundamental & AI Inspector Modal */}
      {inspectedStock && (
        <EmitenFundamentalInspectorModal
          stock={inspectedStock}
          regimeStatus={regimeStatus}
          onClose={() => setInspectedStock(null)}
          onToggleHscFlag={onToggleHscFlag}
          onStockSynced={onStockSynced}
        />
      )}
    </div>
  );
}
