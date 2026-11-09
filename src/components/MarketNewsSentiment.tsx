import { useMemo, useState } from 'react';
import { NewsSentimentItem } from '../types/quant';
import { classifyHeadlineSentiment, decodeHtmlEntities } from '../utils/liveMarketFetcher';
import { ExternalLink, Newspaper, Globe2, MapPin, Filter } from 'lucide-react';

interface MarketNewsSentimentProps {
  news: NewsSentimentItem[];
  isLoadingNews?: boolean;
}

type SentimentFilterType = 'ALL' | NewsSentimentItem['sentiment'];

export function MarketNewsSentiment({
  news,
  isLoadingNews = false
}: MarketNewsSentimentProps) {
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilterType>('ALL');

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
  );
}
