import React, { useState, useMemo } from 'react';
import { DeMiguelBufferZone, MarketRegimeStatus, StockMetrics } from '../types/quant';
import {
  enrichStockMetrics,
  rankUniverseWithBuffer,
  toggleManualHscTicker
} from '../utils/quantEngine';
import { IDX_SECTOR_CATALOG, fetchLiveIdxTicker } from '../utils/liveMarketFetcher';
import {
  formatIndonesianDecimalInput,
  formatIdrPriceDisplay,
  parseIndonesianNumber
} from '../utils/numberFormat';
import { MetricTooltip } from './MetricTooltip';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { EmitenFundamentalInspectorModal } from './EmitenFundamentalInspectorModal';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Search,
  Trash2,
  Globe,
  BookOpen,
  RefreshCw,
  Layers,
  ChevronLeft,
  ChevronRight,
  Columns,
  CheckSquare,
  Square,
  X,
  Filter,
  ShieldAlert,
  Scale
} from 'lucide-react';

interface ScreeningTableProps {
  stocks: StockMetrics[];
  rebalanceBufferPct?: number;
  regimeStatus?: MarketRegimeStatus;
  onLoadIdx100Universe?: () => void;
  onAddStock: (newStock: StockMetrics) => void;
  onRemoveStock: (ticker: string) => void;
  onResetUniverse: () => void;
  onToggleHscFlag?: (ticker: string, currentlyFlagged: boolean) => void;
  onInspectTicker?: (ticker: string) => void;
}

type SortField =
  | 'dmuCompositeScore'
  | 'dmuLowVolScore'
  | 'dmuMomScore'
  | 'dmuValueScore'
  | 'dmuSizeScore'
  | 'lastPrice'
  | 'volatilityAnn';

export function ScreeningTable({
  stocks,
  rebalanceBufferPct = 40,
  regimeStatus = 'WASPADA',
  onLoadIdx100Universe,
  onAddStock,
  onRemoveStock,
  onResetUniverse,
  onToggleHscFlag,
  onInspectTicker
}: ScreeningTableProps) {
  const [sortField, setSortField] = useState<SortField>('dmuCompositeScore');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Multi-select filter states
  const [selectedZones, setSelectedZones] = useState<DeMiguelBufferZone[]>([]);
  const [selectedQualities, setSelectedQualities] = useState<string[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);

  // Multi-select stock comparison states
  const [selectedCompareTickers, setSelectedCompareTickers] = useState<string[]>([]);
  const [filterOnlyCompared, setFilterOnlyCompared] = useState<boolean>(false);
  const [showCompareMatrix, setShowCompareMatrix] = useState<boolean>(true);

  // HSC & Fundamental Inspector states
  const [hscRevision, setHscRevision] = useState<number>(0);
  const [hscQuickInput, setHscQuickInput] = useState<string>('');
  const [inspectedTicker, setInspectedTicker] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [showSectorCatalog, setShowSectorCatalog] = useState<boolean>(false);
  const [selectedCatalogSectors, setSelectedCatalogSectors] = useState<string[]>([]);

  const [liveTickerQuery, setLiveTickerQuery] = useState<string>('');
  const [isFetchingLiveTicker, setIsFetchingLiveTicker] = useState<boolean>(false);
  const [liveStatusMsg, setLiveStatusMsg] = useState<string | null>(null);

  const [tickerInput, setTickerInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [sectorInput, setSectorInput] = useState('Energy');
  const [priceInput, setPriceInput] = useState('24.475');
  const [betaInput, setBetaInput] = useState('0,84');
  const [roeInput, setRoeInput] = useState('26,8');
  const [derInput, setDerInput] = useState('0,14');
  const [marginInput, setMarginInput] = useState('29,4');

  const rankedStocks = useMemo(
    () => rankUniverseWithBuffer(stocks, rebalanceBufferPct),
    [stocks, rebalanceBufferPct, hscRevision]
  );

  const inspectedStockObj = useMemo(() => {
    if (!inspectedTicker) return null;
    return rankedStocks.find((s) => s.ticker === inspectedTicker) || null;
  }, [rankedStocks, inspectedTicker]);

  const handleToggleHscLocalAndParent = (ticker: string, currentlyFlagged?: boolean) => {
    const target = rankedStocks.find((s) => s.ticker === ticker);
    const activeFlag =
      currentlyFlagged !== undefined ? currentlyFlagged : Boolean(target?.isHscFlagged);
    if (onToggleHscFlag) {
      onToggleHscFlag(ticker, activeFlag);
    } else {
      toggleManualHscTicker(ticker, activeFlag);
    }
    setHscRevision((prev) => prev + 1);
  };

  const handleQuickHscSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = hscQuickInput
      .trim()
      .toUpperCase()
      .replace(/\.JK$/i, '')
      .replace(/[^A-Z]/g, '')
      .slice(0, 4);
    if (clean.length === 4) {
      handleToggleHscLocalAndParent(clean);
      setHscQuickInput('');
    }
  };

  const liveFetchedCount = useMemo(
    () => rankedStocks.filter((s) => s.isLiveFetched).length,
    [rankedStocks]
  );

  const liquidStockCount = useMemo(
    () => rankedStocks.filter((s) => s.isLiquid !== false && s.lastPrice >= 68).length,
    [rankedStocks]
  );

  const dividendStockCount = useMemo(
    () => rankedStocks.filter((s) => (s.dividendYieldPct ?? 0) > 0).length,
    [rankedStocks]
  );

  const illiquidStockCount = useMemo(
    () => rankedStocks.filter((s) => s.isLiquid === false || s.lastPrice < 68).length,
    [rankedStocks]
  );

  const hscFlaggedCount = useMemo(
    () => rankedStocks.filter((s) => s.isHscFlagged).length,
    [rankedStocks]
  );

  const cleanNoHscCount = useMemo(
    () =>
      rankedStocks.filter(
        (s) => s.isLiquid !== false && s.lastPrice >= 68 && !s.isHscFlagged
      ).length,
    [rankedStocks]
  );

  const uniqueCatalogSectors = useMemo(() => {
    const set = new Set(IDX_SECTOR_CATALOG.map((c) => c.sector));
    return Array.from(set);
  }, []);

  const sectorDropdownOptions = useMemo(() => {
    return uniqueCatalogSectors.map((sec) => ({
      value: sec,
      label: sec,
      count: rankedStocks.filter((s) => s.sector === sec).length
    }));
  }, [uniqueCatalogSectors, rankedStocks]);

  const qualityDropdownOptions = useMemo(
    () => [
      {
        value: 'CLEAN_NO_HSC',
        label: 'Bebas Indikasi HSC (Clean Value & Likuid)',
        count: cleanNoHscCount
      },
      {
        value: 'DIVIDEND_ONLY',
        label: 'Pembagi Dividen Rutin (TTM > 0%)',
        count: dividendStockCount
      },
      {
        value: 'LIQUID_ONLY',
        label: 'Saham Likuid Aktif (≥ Rp 68)',
        count: liquidStockCount
      },
      {
        value: 'HSC_FLAGGED_ONLY',
        label: 'Terindikasi / Berlabel HSC (TRUK, ROCK, dll.)',
        count: hscFlaggedCount
      },
      {
        value: 'ILLIQUID_ONLY',
        label: 'Illiquid / Gocap / Suspensi',
        count: illiquidStockCount
      }
    ],
    [cleanNoHscCount, dividendStockCount, liquidStockCount, hscFlaggedCount, illiquidStockCount]
  );

  const zoneDropdownOptions = useMemo(
    () => [
      {
        value: 'TOP_DECILE_BUY',
        label: 'Top Decile Buy',
        count: rankedStocks.filter((s) => s.dmuZone === 'TOP_DECILE_BUY').length
      },
      {
        value: 'BUFFER_HOLD_40',
        label: `Buffer Hold ≤${rebalanceBufferPct}%`,
        count: rankedStocks.filter((s) => s.dmuZone === 'BUFFER_HOLD_40').length
      },
      {
        value: 'ROTATE_OUT',
        label: 'Rotate Out / Blokir',
        count: rankedStocks.filter((s) => s.dmuZone === 'ROTATE_OUT').length
      }
    ],
    [rankedStocks, rebalanceBufferPct]
  );

  const comparedStocksList = useMemo(() => {
    if (selectedCompareTickers.length === 0) return [];
    const map = new Map(rankedStocks.map((s) => [s.ticker, s]));
    return selectedCompareTickers
      .map((t) => map.get(t))
      .filter((s): s is StockMetrics => Boolean(s));
  }, [rankedStocks, selectedCompareTickers]);

  const handleToggleCompareTicker = (ticker: string) => {
    setSelectedCompareTickers((prev) => {
      const exists = prev.includes(ticker);
      const next = exists ? prev.filter((t) => t !== ticker) : [...prev, ticker];
      if (next.length === 0) {
        setFilterOnlyCompared(false);
      } else if (!exists && prev.length === 0) {
        setShowCompareMatrix(true);
      }
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'volatilityAnn');
    }
    setCurrentPage(1);
  };

  const filteredAndSortedStocks = useMemo(() => {
    const compareSet = new Set(selectedCompareTickers);
    return rankedStocks
      .filter((s) => {
        if (filterOnlyCompared && compareSet.size > 0 && !compareSet.has(s.ticker)) {
          return false;
        }
        if (selectedZones.length > 0 && !selectedZones.includes(s.dmuZone)) {
          return false;
        }
        if (selectedQualities.length > 0) {
          const isLiq = s.isLiquid !== false && s.lastPrice >= 68;
          const isDiv = (s.dividendYieldPct ?? 0) > 0;
          const isIlliq = s.isLiquid === false || s.lastPrice < 68;
          const isHsc = Boolean(s.isHscFlagged);
          const isClean = isLiq && !isHsc;
          const matchesAnyQuality =
            (selectedQualities.includes('CLEAN_NO_HSC') && isClean) ||
            (selectedQualities.includes('HSC_FLAGGED_ONLY') && isHsc) ||
            (selectedQualities.includes('LIQUID_ONLY') && isLiq) ||
            (selectedQualities.includes('DIVIDEND_ONLY') && isDiv) ||
            (selectedQualities.includes('ILLIQUID_ONLY') && isIlliq);
          if (!matchesAnyQuality) return false;
        }
        if (selectedSectors.length > 0 && !selectedSectors.includes(s.sector)) {
          return false;
        }
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          return (
            s.ticker.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            s.sector.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const diff = a[sortField] - b[sortField];
        return sortAsc ? diff : -diff;
      });
  }, [
    rankedStocks,
    sortField,
    sortAsc,
    selectedZones,
    selectedQualities,
    selectedSectors,
    searchQuery,
    filterOnlyCompared,
    selectedCompareTickers
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedStocks.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const visibleStocks = useMemo(() => {
    if (pageSize >= filteredAndSortedStocks.length) {
      return filteredAndSortedStocks;
    }
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedStocks.slice(start, start + pageSize);
  }, [filteredAndSortedStocks, pageSize, safePage]);

  const areAllVisibleSelected = useMemo(() => {
    if (visibleStocks.length === 0) return false;
    const sample = visibleStocks.slice(0, 15);
    return sample.every((s) => selectedCompareTickers.includes(s.ticker));
  }, [visibleStocks, selectedCompareTickers]);

  const handleToggleSelectVisibleSample = () => {
    const sampleTickers = visibleStocks.slice(0, 10).map((s) => s.ticker);
    if (areAllVisibleSelected) {
      setSelectedCompareTickers((prev) => prev.filter((t) => !sampleTickers.includes(t)));
    } else {
      setSelectedCompareTickers((prev) => Array.from(new Set([...prev, ...sampleTickers])));
      setShowCompareMatrix(true);
    }
  };

  const handleLiveFetchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveTickerQuery.trim()) return;
    setIsFetchingLiveTicker(true);
    setLiveStatusMsg(null);
    try {
      const fetched = await fetchLiveIdxTicker(liveTickerQuery);
      onAddStock(fetched);
      setLiveTickerQuery('');
      setLiveStatusMsg(
        `${fetched.ticker}.JK berhasil dimuat — Skor Multifaktor ${fetched.dmuCompositeScore.toFixed(2)}/10 · 30D ${fetched.return30D >= 0 ? '+' : ''}${fetched.return30D.toFixed(2)}%`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menarik ticker.';
      setLiveStatusMsg(msg);
    } finally {
      setIsFetchingLiveTicker(false);
    }
  };

  const handleAddFromCatalog = async (ticker: string) => {
    setIsFetchingLiveTicker(true);
    setLiveStatusMsg(null);
    try {
      const fetched = await fetchLiveIdxTicker(ticker);
      onAddStock(fetched);
      setLiveStatusMsg(
        `${fetched.ticker}.JK ditambahkan ke matriks Screener (Skor ${fetched.dmuCompositeScore.toFixed(2)})`
      );
    } catch {
      // handled inside fetchLiveIdxTicker
    } finally {
      setIsFetchingLiveTicker(false);
    }
  };

  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTicker = tickerInput.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (!cleanTicker) return;

    const lastPrice = Math.max(1, parseIndonesianNumber(priceInput) || 1000);
    const beta1Y = parseIndonesianNumber(betaInput) || 1.0;
    const roe = parseIndonesianNumber(roeInput) || 15.0;
    const debtToEquity = parseIndonesianNumber(derInput) || 0.5;
    const operatingMargin = parseIndonesianNumber(marginInput) || 18.0;

    const newStock = enrichStockMetrics({
      ticker: cleanTicker,
      idxTicker: `IDX:${cleanTicker}`,
      yfTicker: `${cleanTicker}.JK`,
      name: nameInput.trim() || `${cleanTicker} Indonesia Tbk`,
      sector: sectorInput,
      lastPrice,
      change1D: 0.55,
      return30D: 2.4,
      beta1Y,
      volatilityAnn: Number((beta1Y * 18.5).toFixed(1)),
      roe,
      debtToEquity,
      operatingMargin,
      isLiveFetched: true,
      isLiquid: lastPrice >= 68,
      lastSyncedAt: new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      })
    });

    onAddStock(newStock);
    setTickerInput('');
    setNameInput('');
    setShowAddForm(false);
  };

  const formatZoneLabel = (stock: StockMetrics) => {
    if (stock.isLiquid === false || stock.lastPrice < 68) {
      return {
        text: 'Illiquid (Blokir)',
        color: 'text-[#9E2A2B] font-bold'
      };
    }
    if (stock.isHscFlagged) {
      return {
        text: `HSC Blokir (${stock.dmuRankPct}%)`,
        color: 'text-[#9E2A2B] font-bold'
      };
    }
    switch (stock.dmuZone) {
      case 'TOP_DECILE_BUY':
        return {
          text: `Top Buy (${stock.dmuRankPct}%)`,
          color: 'text-[#0D5C46] font-bold'
        };
      case 'BUFFER_HOLD_40':
        return {
          text: `Hold ≤${rebalanceBufferPct}% (${stock.dmuRankPct}%)`,
          color: 'text-[#0284C7] bb-cyan font-bold'
        };
      default:
        return {
          text: `Rotate (${stock.dmuRankPct}%)`,
          color: 'text-[#9E2A2B] font-semibold'
        };
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-neutral-400 inline ml-0.5 shrink-0" />;
    }
    return sortAsc ? (
      <ArrowUp className="w-3 h-3 text-[#D97706] bb-amber inline ml-0.5 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#D97706] bb-amber inline ml-0.5 shrink-0" />
    );
  };

  const toggleQuickZone = (zone: DeMiguelBufferZone) => {
    setSelectedZones((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone]
    );
    setCurrentPage(1);
  };

  // Best values in comparison matrix for highlighting
  const bestCompareStats = useMemo(() => {
    if (comparedStocksList.length < 2) return null;
    return {
      maxComposite: Math.max(...comparedStocksList.map((s) => s.dmuCompositeScore)),
      maxLowVol: Math.max(...comparedStocksList.map((s) => s.dmuLowVolScore)),
      maxMom: Math.max(...comparedStocksList.map((s) => s.dmuMomScore)),
      maxVal: Math.max(...comparedStocksList.map((s) => s.dmuValueScore)),
      maxSize: Math.max(...comparedStocksList.map((s) => s.dmuSizeScore)),
      max1D: Math.max(...comparedStocksList.map((s) => s.change1D)),
      max30D: Math.max(...comparedStocksList.map((s) => s.return30D)),
      maxDiv: Math.max(...comparedStocksList.map((s) => s.dividendYieldPct ?? 0)),
      minVol: Math.min(...comparedStocksList.map((s) => s.volatilityAnn)),
      maxRoe: Math.max(...comparedStocksList.map((s) => s.roe))
    };
  }, [comparedStocksList]);

  return (
    <section className="space-y-4">
      {/* Live .JK Ticker Lookup & Full JCI Universe Bar */}
      <div className="p-4 sm:p-5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-[#D97706] bb-amber block">
              Pencarian Ticker Saham BEI (.JK) · Full JCI Universe ({rankedStocks.length} Emiten · {liquidStockCount} Likuid · {dividendStockCount} Pembagi Dividen)
            </span>
            <span className="text-[11px] text-neutral-500">
              Saham tidak likuid / gocap / suspensi ditandai <strong>ILLIQUID</strong> dan otomatis diblokir dari Keranjang 1 &amp; 2.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onLoadIdx100Universe && (
              <button
                type="button"
                onClick={onLoadIdx100Universe}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0D5C46] bg-[#FAF9F6] border border-[#059669]/50 hover:border-[#059669] rounded-xs cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Sync Full JCI ({IDX_SECTOR_CATALOG.length}+ Emiten)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSectorCatalog(!showSectorCatalog)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0284C7] bb-cyan bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#0284C7] rounded-xs cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>
                {showSectorCatalog
                  ? 'Tutup Direktori'
                  : `Direktori JCI (${IDX_SECTOR_CATALOG.length})`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#F59E0B] rounded-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simulasi Kustom</span>
            </button>
          </div>
        </div>

        {/* Full-Width Spacious Search Input Bar */}
        <form onSubmit={handleLiveFetchSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            maxLength={8}
            value={liveTickerQuery}
            onChange={(e) => setLiveTickerQuery(e.target.value)}
            placeholder="Ketik kode saham BEI (contoh: ITMG, BBCA, MEDC, MYOR, CMRY, MIKA, UNTR, BREN)..."
            className="flex-1 min-w-0 px-3.5 py-2 text-xs font-bold uppercase bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
          />
          <button
            type="submit"
            disabled={isFetchingLiveTicker}
            className="bb-btn-primary inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-[#D97706] text-white text-xs font-bold rounded-xs hover:bg-[#B45309] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isFetchingLiveTicker ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            <span>{isFetchingLiveTicker ? 'Menarik Data...' : 'Tarik Ticker (.JK)'}</span>
          </button>
        </form>

        {liveStatusMsg && (
          <div className="text-xs font-bold text-[#0D5C46] pt-0.5">
            {liveStatusMsg}
          </div>
        )}

        {/* Expandable 11-Sector Full JCI Catalog with Multi-Select Sector Filter */}
        {showSectorCatalog && (
          <div className="pt-3.5 border-t border-[#E4E2DD] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#D97706] bb-amber">
                Direktori {IDX_SECTOR_CATALOG.length} Emiten 11 Sektor BEI (Klik untuk memperbarui/menambahkan):
              </span>
              <MultiSelectDropdown
                label="Filter Sektor Direktori"
                allLabel="Semua Sektor Direktori"
                options={sectorDropdownOptions}
                selectedValues={selectedCatalogSectors}
                onChange={setSelectedCatalogSectors}
              />
            </div>

            <div className="table-scroll-container grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-60 overflow-y-auto pr-1">
              {IDX_SECTOR_CATALOG.filter(
                (item) =>
                  selectedCatalogSectors.length === 0 ||
                  selectedCatalogSectors.includes(item.sector)
              )
                .slice(0, 180)
                .map((entry) => {
                  const alreadyAdded = stocks.some((s) => s.ticker === entry.ticker);
                  return (
                    <button
                      key={entry.ticker}
                      type="button"
                      disabled={isFetchingLiveTicker}
                      onClick={() => handleAddFromCatalog(entry.ticker)}
                      className={`p-2.5 text-left border rounded-xs transition-colors cursor-pointer ${
                        alreadyAdded
                          ? 'bg-[#FAF9F6] border-[#059669]'
                          : 'bg-[#FFFFFF] border-[#E4E2DD] hover:border-[#F59E0B]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-[#D97706] bb-amber">{entry.ticker}</span>
                        <RefreshCw className="w-3 h-3 text-[#0D5C46]" />
                      </div>
                      <div className="text-[11px] text-neutral-600 truncate mt-0.5">
                        {entry.name}
                      </div>
                      <div className="text-[10px] text-neutral-500 tabular-nums mt-0.5">
                        ROE {entry.defaultRoe}% · β {entry.approxBeta}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Padded Card Container for Screener Header, Multi-Select Filters & Comparison Controls (Fix Left Spacing) */}
      <div className="p-4 sm:p-5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E4E2DD] pb-3.5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#0284C7] bb-cyan">
              <span>Screener Kuantitatif 4-Faktor BEI (.JK)</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-[#0D5C46] font-bold">
                <RefreshCw className="w-3 h-3" />
                <span>
                  {liveFetchedCount}/{rankedStocks.length} Live Yahoo · {liquidStockCount} Likuid
                </span>
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#111315] mt-0.5">
              Matriks Peringkat Multifaktor &amp; Zona Buffer {rebalanceBufferPct}%
            </h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Centang beberapa saham pada kolom kiri tabel untuk membandingkan metrik secara berdampingan (Multi-Select Stock Comparison).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#FAF9F6] rounded-xs border border-[#E4E2DD]">
              <button
                type="button"
                onClick={() => {
                  setSelectedZones([]);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap cursor-pointer ${
                  selectedZones.length === 0
                    ? 'bg-[#D97706] text-white bb-btn-primary'
                    : 'text-neutral-600 hover:text-[#111315]'
                }`}
              >
                Semua ({rankedStocks.length})
              </button>
              <button
                type="button"
                onClick={() => toggleQuickZone('TOP_DECILE_BUY')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap cursor-pointer ${
                  selectedZones.includes('TOP_DECILE_BUY')
                    ? 'bg-[#059669] text-white'
                    : 'text-neutral-600 hover:text-[#111315]'
                }`}
              >
                Top Buy ({rankedStocks.filter((s) => s.dmuZone === 'TOP_DECILE_BUY').length})
              </button>
              <button
                type="button"
                onClick={() => toggleQuickZone('BUFFER_HOLD_40')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap cursor-pointer ${
                  selectedZones.includes('BUFFER_HOLD_40')
                    ? 'bg-[#0284C7] text-white'
                    : 'text-neutral-600 hover:text-[#111315]'
                }`}
              >
                Buffer ≤{rebalanceBufferPct}% ({rankedStocks.filter((s) => s.dmuZone === 'BUFFER_HOLD_40').length})
              </button>
              <button
                type="button"
                onClick={() => toggleQuickZone('ROTATE_OUT')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-xs transition-colors whitespace-nowrap cursor-pointer ${
                  selectedZones.includes('ROTATE_OUT')
                    ? 'bg-[#E11D48] text-white'
                    : 'text-neutral-600 hover:text-[#111315]'
                }`}
              >
                Rotate Out ({rankedStocks.filter((s) => s.dmuZone === 'ROTATE_OUT').length})
              </button>
            </div>
          </div>
        </div>

        {/* Search & Multi-Select Dropdowns (Likuiditas/Dividen, 11 Sektor BEI, Zona Buffer) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari saham atau sektor..."
                className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
              />
            </div>

            <MultiSelectDropdown
              label="Likuiditas & Dividen"
              allLabel={`Semua Status (${rankedStocks.length})`}
              options={qualityDropdownOptions}
              selectedValues={selectedQualities}
              onChange={(vals) => {
                setSelectedQualities(vals);
                setCurrentPage(1);
              }}
            />

            <MultiSelectDropdown
              label="Sektor BEI"
              allLabel="Semua 11 Sektor BEI"
              options={sectorDropdownOptions}
              selectedValues={selectedSectors}
              onChange={(vals) => {
                setSelectedSectors(vals);
                setCurrentPage(1);
              }}
            />

            <MultiSelectDropdown
              label="Zona Buffer"
              allLabel="Semua Zona Buffer"
              options={zoneDropdownOptions}
              selectedValues={selectedZones}
              onChange={(vals) => {
                setSelectedZones(vals as DeMiguelBufferZone[]);
                setCurrentPage(1);
              }}
            />

            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs font-semibold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
            >
              <option value={100}>100 Emiten / Hal</option>
              <option value={250}>250 Emiten / Hal</option>
              <option value={500}>500 Emiten / Hal</option>
              <option value={2000}>Semua ({filteredAndSortedStocks.length} Emiten)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
            {totalPages > 1 && (
              <div className="inline-flex items-center gap-1.5 bg-[#FAF9F6] border border-[#E4E2DD] px-2 py-1 rounded-xs">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-0.5 hover:text-[#D97706] disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-[#111315] tabular-nums">
                  Hal {safePage}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-0.5 hover:text-[#D97706] disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <span>Bobot Value-First: 35% Value · 28% Low-Vol · 22% Mom · 15% Size</span>
            <span>·</span>
            <button
              type="button"
              onClick={onResetUniverse}
              className="text-[#D97706] bb-amber font-bold hover:underline cursor-pointer"
            >
              Reset Full JCI ({IDX_SECTOR_CATALOG.length} Emiten)
            </button>
          </div>
        </div>

        {/* HSC Labeling & Joeliardi Sunendar Fundamental Inspector Control Strip */}
        <div className="p-3 bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-[#9E2A2B]">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Filter &amp; Label Saham HSC ({hscFlaggedCount} Diblokir ke Rotate Out):</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedQualities((prev) =>
                  prev.includes('CLEAN_NO_HSC')
                    ? prev.filter((q) => q !== 'CLEAN_NO_HSC')
                    : ['CLEAN_NO_HSC']
                );
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer ${
                selectedQualities.includes('CLEAN_NO_HSC')
                  ? 'bg-[#059669] text-white border-[#059669]'
                  : 'bg-[#FFFFFF] text-[#0D5C46] border-[#059669]/40 hover:border-[#059669]'
              }`}
            >
              Hanya Saham Clean / Bebas HSC ({cleanNoHscCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedQualities((prev) =>
                  prev.includes('HSC_FLAGGED_ONLY')
                    ? prev.filter((q) => q !== 'HSC_FLAGGED_ONLY')
                    : ['HSC_FLAGGED_ONLY']
                );
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer ${
                selectedQualities.includes('HSC_FLAGGED_ONLY')
                  ? 'bg-[#E11D48] text-white border-[#E11D48]'
                  : 'bg-[#FFFFFF] text-[#9E2A2B] border-[#E11D48]/40 hover:border-[#E11D48]'
              }`}
            >
              Lihat Daftar HSC ({hscFlaggedCount} termasuk TRUK, ROCK)
            </button>
          </div>

          <form onSubmit={handleQuickHscSubmit} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              maxLength={4}
              value={hscQuickInput}
              onChange={(e) => setHscQuickInput(e.target.value.toUpperCase())}
              placeholder="Kode HSC (mis: TRUK, ROCK)..."
              className="w-44 px-2.5 py-1 text-xs font-mono font-bold uppercase bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#E11D48]"
            />
            <button
              type="submit"
              className="px-3 py-1 text-[11px] font-bold bg-[#9E2A2B] hover:bg-[#7F1D1D] text-white rounded-xs transition-colors cursor-pointer"
            >
              Toggle Label HSC
            </button>
          </form>
        </div>

        {/* Multi-Select Stock Comparison Control Strip */}
        <div className="pt-3 border-t border-[#E4E2DD] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-[#D97706] bb-amber">
              <Columns className="w-3.5 h-3.5" />
              <span>
                Perbandingan Multi-Saham ({selectedCompareTickers.length} dipilih):
              </span>
            </span>

            {selectedCompareTickers.length === 0 ? (
              <span className="text-neutral-500 text-[11px]">
                Centang kotak di sebelah kiri kode saham pada tabel, atau klik tombol cepat:
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                {selectedCompareTickers.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold bg-[#FAF9F6] border border-[#D97706]/50 text-[#D97706] bb-amber rounded-xs"
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleCompareTicker(t)}
                      className="hover:text-[#9E2A2B] cursor-pointer"
                      title={`Hapus ${t} dari perbandingan`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedCompareTickers.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  const top4 = visibleStocks.slice(0, 4).map((s) => s.ticker);
                  setSelectedCompareTickers(top4);
                  setShowCompareMatrix(true);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-[#0284C7] bb-cyan bg-[#FAF9F6] border border-[#E4E2DD] hover:border-[#0284C7] rounded-xs cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Bandingkan Top 4 Saham Teratas</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFilterOnlyCompared((prev) => !prev);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-xs border transition-colors cursor-pointer ${
                    filterOnlyCompared
                      ? 'bg-[#0284C7] text-white border-[#0284C7]'
                      : 'bg-[#FAF9F6] text-[#0284C7] bb-cyan border-[#E4E2DD] hover:border-[#0284C7]'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  <span>
                    {filterOnlyCompared
                      ? `Tampilkan Semua (${rankedStocks.length})`
                      : `Filter Tabel Khusus Terpilih (${selectedCompareTickers.length})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCompareMatrix((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-[#0D5C46] bg-[#FAF9F6] border border-[#059669]/40 hover:border-[#059669] rounded-xs cursor-pointer"
                >
                  <Columns className="w-3 h-3" />
                  <span>
                    {showCompareMatrix
                      ? 'Sembunyikan Matriks Perbandingan'
                      : `Tampilkan Matriks (${selectedCompareTickers.length})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCompareTickers([]);
                    setFilterOnlyCompared(false);
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#9E2A2B] hover:underline cursor-pointer"
                >
                  Reset Pilihan
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Side-by-Side Multi-Select Stock Comparison Matrix Panel */}
      {comparedStocksList.length > 0 && showCompareMatrix && (
        <div className="p-4 sm:p-5 bg-[#FFFFFF] border-2 border-[#D97706]/60 rounded-xs space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E4E2DD] pb-2.5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#D97706] bb-amber">
                MATRIKS PERBANDINGAN MULTIFAKTOR SAHAM TERPILIH ({comparedStocksList.length} EMITEN)
              </span>
              <p className="text-[11px] text-neutral-500">
                Perbandingan head-to-head skor 4-faktor, tren 1D &amp; 30D (1M Yahoo Finance), imbal hasil dividen TTM, serta profil risiko. Angka terbaik disorot hijau.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCompareMatrix(false)}
              className="self-start sm:self-auto px-2.5 py-1 text-[11px] font-semibold text-neutral-500 hover:text-[#111315] border border-[#E4E2DD] rounded-xs cursor-pointer"
            >
              Tutup Panel
            </button>
          </div>

          <div className="table-scroll-container overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs tabular-nums">
              <thead>
                <tr className="border-b border-[#E4E2DD] bg-[#FAF9F6]">
                  <th className="py-2 px-3 font-bold text-neutral-500 min-w-[160px]">
                    Indikator Kuantitatif
                  </th>
                  {comparedStocksList.map((s) => (
                    <th key={s.ticker} className="py-2 px-3 min-w-[140px]">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-[#D97706] bb-amber text-sm">
                          {s.ticker}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onInspectTicker
                                ? onInspectTicker(s.ticker)
                                : setInspectedTicker(s.ticker)
                            }
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-[#D97706]/10 hover:bg-[#D97706] text-[#D97706] hover:text-white border border-[#D97706]/40 rounded-xs transition-colors cursor-pointer"
                            title={`Inspect ${s.ticker}`}
                          >
                            <Scale className="w-2.5 h-2.5" />
                            <span>Inspect</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleCompareTicker(s.ticker)}
                            className="text-neutral-400 hover:text-[#9E2A2B] cursor-pointer"
                            title={`Hapus ${s.ticker}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-[11px] font-medium text-[#111315] truncate max-w-[140px]">
                        {s.name}
                      </div>
                      <div className="text-[10px] font-semibold text-[#0284C7] bb-cyan">
                        {s.sector}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E2DD]">
                <tr>
                  <td className="py-2 px-3 font-semibold text-neutral-600">Harga Terakhir (IDR)</td>
                  {comparedStocksList.map((s) => (
                    <td key={s.ticker} className="py-2 px-3 font-bold text-[#111315]">
                      {s.lastPrice > 0 ? `Rp ${s.lastPrice.toLocaleString('id-ID')}` : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-neutral-600">Perubahan Harian (1D %)</td>
                  {comparedStocksList.map((s) => {
                    const isBest =
                      bestCompareStats && s.change1D === bestCompareStats.max1D;
                    return (
                      <td
                        key={s.ticker}
                        className={`py-2 px-3 font-bold ${
                          s.change1D >= 0 ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'
                        } ${isBest ? 'underline' : ''}`}
                      >
                        {s.change1D >= 0 ? '+' : ''}
                        {s.change1D.toFixed(2)}%
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-neutral-600">
                    Tren 30 Hari (1M Yahoo %)
                  </td>
                  {comparedStocksList.map((s) => {
                    const isBest =
                      bestCompareStats && s.return30D === bestCompareStats.max30D;
                    return (
                      <td
                        key={s.ticker}
                        className={`py-2 px-3 font-bold ${
                          s.return30D >= 0 ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'
                        } ${isBest ? 'underline' : ''}`}
                      >
                        {s.return30D >= 0 ? '+' : ''}
                        {s.return30D.toFixed(2)}%
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-neutral-600">
                    Annual Dividend Yield (TTM %)
                  </td>
                  {comparedStocksList.map((s) => {
                    const div = s.dividendYieldPct ?? 0;
                    const isBest =
                      bestCompareStats && div > 0 && div === bestCompareStats.maxDiv;
                    return (
                      <td
                        key={s.ticker}
                        className={`py-2 px-3 font-bold ${
                          div > 0 ? 'text-[#0D5C46]' : 'text-neutral-400'
                        } ${isBest ? 'underline' : ''}`}
                      >
                        {div > 0 ? `${div.toFixed(2)}%` : '0,00%'}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-[#FAF9F6]">
                  <td className="py-2 px-3 font-bold text-[#111315]">
                    Skor Komposit 4-Faktor
                  </td>
                  {comparedStocksList.map((s) => {
                    const isBest =
                      bestCompareStats &&
                      s.dmuCompositeScore === bestCompareStats.maxComposite;
                    return (
                      <td
                        key={s.ticker}
                        className={`py-2 px-3 font-bold text-sm ${
                          isBest ? 'text-[#0D5C46]' : 'text-[#D97706] bb-amber'
                        }`}
                      >
                        {s.dmuCompositeScore.toFixed(2)} / 10 (Top {s.dmuRankPct}%)
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-neutral-600">
                    Faktor Low-Vol (28%)
                  </td>
                  {comparedStocksList.map((s) => (
                    <td
                      key={s.ticker}
                      className={`py-2 px-3 font-semibold ${
                        bestCompareStats && s.dmuLowVolScore === bestCompareStats.maxLowVol
                          ? 'text-[#0D5C46] font-bold'
                          : 'text-[#111315]'
                      }`}
                    >
                      {s.dmuLowVolScore.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-neutral-600">
                    Faktor Momentum Live (34%)
                  </td>
                  {comparedStocksList.map((s) => (
                    <td
                      key={s.ticker}
                      className={`py-2 px-3 font-semibold ${
                        bestCompareStats && s.dmuMomScore === bestCompareStats.maxMom
                          ? 'text-[#0D5C46] font-bold'
                          : 'text-[#111315]'
                      }`}
                    >
                      {s.dmuMomScore.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-neutral-600">
                    Faktor Value &amp; Dividen (23%)
                  </td>
                  {comparedStocksList.map((s) => (
                    <td
                      key={s.ticker}
                      className={`py-2 px-3 font-semibold ${
                        bestCompareStats && s.dmuValueScore === bestCompareStats.maxVal
                          ? 'text-[#0D5C46] font-bold'
                          : 'text-[#111315]'
                      }`}
                    >
                      {s.dmuValueScore.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-neutral-600">
                    Faktor Size &amp; Likuiditas (15%)
                  </td>
                  {comparedStocksList.map((s) => (
                    <td
                      key={s.ticker}
                      className={`py-2 px-3 font-semibold ${
                        bestCompareStats && s.dmuSizeScore === bestCompareStats.maxSize
                          ? 'text-[#0D5C46] font-bold'
                          : 'text-[#111315]'
                      }`}
                    >
                      {s.dmuSizeScore.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-neutral-600">
                    Profil Risiko (σ Vol · β Beta · ROE)
                  </td>
                  {comparedStocksList.map((s) => (
                    <td key={s.ticker} className="py-2 px-3 text-[11px] text-neutral-600">
                      σ <strong>{s.volatilityAnn}%</strong> · β{' '}
                      <strong>{s.beta1Y.toFixed(2)}x</strong> · ROE{' '}
                      <strong className="text-[#0D5C46]">{s.roe.toFixed(1)}%</strong>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-neutral-600">
                    Zona Buffer {rebalanceBufferPct}%
                  </td>
                  {comparedStocksList.map((s) => {
                    const zm = formatZoneLabel(s);
                    return (
                      <td key={s.ticker} className="py-2 px-3">
                        <span className={zm.color}>{zm.text}</span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Custom Simulation Parameter Form (Indonesian Thousands & Decimal Separator) */}
      {showAddForm && (
        <form
          onSubmit={handleManualAddSubmit}
          className="p-4 sm:p-5 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#D97706] bb-amber">
              Simulasi Input Fundamental &amp; Volatilitas Emiten (Format Indonesia: 24.475,00)
            </h3>
            <span className="text-[11px] text-neutral-500">
              Menghitung otomatis ke-4 skor faktor kuantitatif
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 tabular-nums">
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 mb-1">Ticker</label>
              <input
                type="text"
                required
                maxLength={4}
                placeholder="ITMG"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold uppercase bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-neutral-500 mb-1">Nama Emiten</label>
              <input
                type="text"
                placeholder="Indo Tambangraya Megah Tbk"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 mb-1">Last Px (IDR)</label>
              <input
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => setPriceInput(formatIndonesianDecimalInput(e.target.value, 2))}
                placeholder="24.475"
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 mb-1">1Y Beta</label>
              <input
                type="text"
                inputMode="decimal"
                value={betaInput}
                onChange={(e) => setBetaInput(formatIndonesianDecimalInput(e.target.value, 2))}
                className="w-full px-2.5 py-1.5 text-xs bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 mb-1">ROE (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={roeInput}
                onChange={(e) => setRoeInput(formatIndonesianDecimalInput(e.target.value, 2))}
                className="w-full px-2.5 py-1.5 text-xs bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 mb-1">DER (x)</label>
              <input
                type="text"
                inputMode="decimal"
                value={derInput}
                onChange={(e) => setDerInput(formatIndonesianDecimalInput(e.target.value, 2))}
                className="w-full px-2.5 py-1.5 text-xs bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 mb-1">Op Margin (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={marginInput}
                onChange={(e) => setMarginInput(formatIndonesianDecimalInput(e.target.value, 2))}
                className="w-full px-2.5 py-1.5 text-xs bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:text-[#111315] cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="bb-btn-primary px-4 py-1.5 bg-[#D97706] text-white text-xs font-semibold rounded-xs hover:bg-[#B45309] cursor-pointer"
            >
              Tambahkan ke Screener
            </button>
          </div>
        </form>
      )}

      {/* Auto-Fit Sticky Table with Multi-Select Checkboxes & Dedicated Internal Scrollbar */}
      <div className="border border-[#E4E2DD] rounded-xs bg-[#FFFFFF] overflow-hidden">
        <div className="table-scroll-container min-h-[260px] max-h-[580px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-left border-collapse tabular-nums">
            <thead className="sticky top-0 z-20 bg-[#FAF9F6] shadow-xs">
              <tr className="border-b border-[#E4E2DD] bg-[#FAF9F6] text-[11px] font-bold text-neutral-500 select-none">
                <th className="py-2.5 px-2.5 w-9 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectVisibleSample}
                    title="Pilih / Batal pilih 10 saham teratas di halaman ini untuk dibandingkan"
                    className="inline-flex items-center justify-center text-neutral-500 hover:text-[#D97706] cursor-pointer"
                  >
                    {areAllVisibleSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-[#D97706]" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-2.5 w-[88px]">Ticker</th>
                <th className="py-2.5 px-2.5 min-w-[250px]">
                  <MetricTooltip
                    label="Emiten & Sektor (σ · β · ROE)"
                    title="Profil Risiko, Likuiditas & Dividen Emiten"
                    laymanExplanation="σ (Volatilitas) = guncangan harga tahunan; β (Beta) = kepekaan terhadap IHSG (< 1 lebih tenang, > 1 lebih agresif); ROE = tingkat keuntungan bersih perusahaan. Badge DIV menunjukkan TTM Dividend Yield sesuai Yahoo Finance."
                    practicalGuide="Cari perusahaan Likuid dengan ROE > 15%, pembagian dividen rutin, dan σ yang sesuai profil risiko Anda."
                  />
                </th>
                <th
                  onClick={() => handleSort('lastPrice')}
                  className="py-2.5 px-2.5 text-right cursor-pointer hover:text-[#D97706]"
                >
                  Last Px &amp; Return {renderSortIcon('lastPrice')}
                </th>
                <th
                  onClick={() => handleSort('dmuLowVolScore')}
                  className="py-2.5 px-2 text-center cursor-pointer hover:text-[#D97706]"
                >
                  <MetricTooltip
                    label="Low-Vol"
                    title="Faktor Low-Volatility (Bobot 28%)"
                    laymanExplanation="Skor Ketenangan Harga (1–10): menilai seberapa stabil dan tahan banting saham likuid ini saat IHSG sedang bergejolak."
                    practicalGuide="Skor ≥ 7,5 artinya saham sangat stabil (cocok untuk Keranjang 1). Saham Illiquid/Gocap otomatis dipinalti ke 1,5."
                    align="center"
                  />
                  {renderSortIcon('dmuLowVolScore')}
                </th>
                <th
                  onClick={() => handleSort('dmuMomScore')}
                  className="py-2.5 px-2 text-center cursor-pointer hover:text-[#D97706]"
                >
                  <MetricTooltip
                    label="Mom Live"
                    title="Faktor Momentum Harga Live (Bobot 34%)"
                    laymanExplanation="Skor Tren Kenaikan (1–10): menilai seberapa kuat laju kenaikan harga saham dalam 1 hari & 30 hari (1M Yahoo Finance) terakhir dibanding guncangannya."
                    practicalGuide="Skor ≥ 7,0 menandakan saham sedang dalam tren naik (uptrend) yang kuat."
                    align="center"
                  />
                  {renderSortIcon('dmuMomScore')}
                </th>
                <th
                  onClick={() => handleSort('dmuValueScore')}
                  className="py-2.5 px-2 text-center cursor-pointer hover:text-[#D97706]"
                >
                  <MetricTooltip
                    label="Value"
                    title="Faktor Value, Dividen & Kewajaran Harga (Bobot 23%)"
                    laymanExplanation="Skor Fundamental, Dividen & Diskon Harga (1–10): menilai seberapa tinggi laba perusahaan (ROE & Margin) dan imbal hasil dividen dibandingkan harga sahamnya saat ini."
                    practicalGuide="Semakin tinggi skornya, semakin murah/bernilai saham tersebut dibanding kualitas bisnisnya."
                    align="center"
                  />
                  {renderSortIcon('dmuValueScore')}
                </th>
                <th
                  onClick={() => handleSort('dmuSizeScore')}
                  className="py-2.5 px-2 text-center cursor-pointer hover:text-[#D97706]"
                >
                  <MetricTooltip
                    label="Size/Liq"
                    title="Faktor Kesehatan Neraca & Likuiditas (Bobot 15%)"
                    laymanExplanation="Menilai seberapa sehat rasio utang perusahaan (DER rendah), perputaran modal, serta likuiditas transaksi pasar reguler (1–10)."
                    practicalGuide="Skor ≥ 7,0 berarti beban utang aman dan likuiditas institusional sangat baik."
                    align="center"
                  />
                  {renderSortIcon('dmuSizeScore')}
                </th>
                <th
                  onClick={() => handleSort('dmuCompositeScore')}
                  className="py-2.5 px-2.5 text-center cursor-pointer hover:text-[#D97706] bg-[#FAF9F6]"
                >
                  <MetricTooltip
                    label="Skor Total"
                    title="Skor Rapor Total 4-Faktor (Skala 1–10)"
                    laymanExplanation="Nilai gabungan dari keempat faktor untuk mengurutkan saham terbaik di Bursa Efek Indonesia."
                    practicalGuide="≥ 7,2 = Sangat Unggul (Hijau); 5,5–7,1 = Menengah; < 5,2 = Hindari (Merah)."
                    align="right"
                  />
                  {renderSortIcon('dmuCompositeScore')}
                </th>
                <th className="py-2.5 px-2.5 text-center">
                  <MetricTooltip
                    label={`Buffer ${rebalanceBufferPct}%`}
                    title="Zona Rekomendasi Rebalancing Buffer"
                    laymanExplanation="Panduan tindakan praktis berdasarkan peringkat saham: 'Top Buy' = prioritas beli (wajib bebas HSC & Value tinggi); 'Hold' = tetap simpan; 'Rotate' = kandidat jual/ganti; 'HSC Blokir' = saham spekulatif/cornered yang diblokir otomatis."
                    align="right"
                  />
                </th>
                <th className="py-2.5 px-2.5 text-center w-[150px]">
                  Inspect &amp; Aksi HSC
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E2DD] text-xs">
              {visibleStocks.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-neutral-500 text-xs">
                    Tidak ada saham yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                visibleStocks.map((stock) => {
                  const zoneMeta = formatZoneLabel(stock);
                  const is1DPos = stock.change1D >= 0;
                  const is30DPos = stock.return30D >= 0;
                  const isStockLiquid = stock.isLiquid !== false && stock.lastPrice >= 68;
                  const divYield = stock.dividendYieldPct ?? 0;
                  const isSelectedForCompare = selectedCompareTickers.includes(stock.ticker);

                  return (
                    <tr
                      key={stock.ticker}
                      className={`hover:bg-[#FAF9F6] transition-colors ${
                        !isStockLiquid || stock.isHscFlagged ? 'opacity-80' : ''
                      } ${isSelectedForCompare ? 'bg-[#FAF9F6]/90' : ''}`}
                    >
                      <td className="py-2.5 px-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleCompareTicker(stock.ticker)}
                          title={`Pilih ${stock.ticker} untuk dibandingkan`}
                          className="inline-flex items-center justify-center text-neutral-400 hover:text-[#D97706] cursor-pointer"
                        >
                          {isSelectedForCompare ? (
                            <CheckSquare className="w-4 h-4 text-[#D97706]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      <td className="py-2.5 px-2.5 font-bold text-[#D97706] bb-amber whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span>{stock.ticker}</span>
                          {stock.isHscFlagged && (
                            <span
                              title={
                                stock.hscReason ||
                                'Terindikasi HSC (High Speculative Concentration) — Diblokir dari Top Decile Buy'
                              }
                              className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold text-[#9E2A2B] bg-[#E11D48]/15 border border-[#E11D48]/50 rounded-xs uppercase"
                            >
                              HSC
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] font-semibold text-neutral-400">
                          {stock.yfTicker}
                        </span>
                      </td>

                      {/* Emiten, Sector, Dividend/Illiquid/HSC Badges & Dedicated New Line for σ · β · ROE */}
                      <td className="py-2.5 px-2.5 min-w-[250px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-[#111315] text-xs leading-snug">
                            {stock.name}
                          </span>
                          {divYield > 0 && (
                            <span
                              title={`Emiten Pembagi Dividen Tunai (Annual TTM Yield Yahoo Finance: ${divYield.toFixed(2)}%/thn)`}
                              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-[#0D5C46] bg-[#059669]/10 border border-[#059669]/35 rounded-xs whitespace-nowrap"
                            >
                              DIV {divYield.toFixed(2)}%
                            </span>
                          )}
                          {stock.isHscFlagged && (
                            <span
                              title={stock.hscReason || 'Indikasi HSC / Spekulatif Tinggi'}
                              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-[#9E2A2B] bg-[#E11D48]/10 border border-[#E11D48]/35 rounded-xs whitespace-nowrap"
                            >
                              AVOID HSC
                            </span>
                          )}
                          {!isStockLiquid && (
                            <span
                              title="Saham Tidak Likuid / Stagnan / Gocap / Tidak Aktif di Yahoo Finance — Diblokir dari Keranjang 1 & 2"
                              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-[#9E2A2B] bg-[#E11D48]/10 border border-[#E11D48]/35 rounded-xs whitespace-nowrap"
                            >
                              ILLIQUID
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#0284C7] bb-cyan font-semibold mt-0.5">
                          {stock.sector}
                        </div>
                        <div className="text-[11px] text-neutral-500 whitespace-nowrap mt-0.5">
                          <span>σ {stock.volatilityAnn}%</span>
                          <span> · </span>
                          <span>β {stock.beta1Y.toFixed(2)}x</span>
                          <span> · </span>
                          <span>ROE {stock.roe.toFixed(1)}%</span>
                        </div>
                      </td>

                      {/* Last Px, Compact Professional Sync Icon & Independent 1D vs 30D Colors (2 Decimals) */}
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                        {stock.lastPrice > 0 ? (
                          <>
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[#111315] font-bold">
                                Rp {formatIdrPriceDisplay(stock.lastPrice)}
                              </span>
                              <span
                                title={
                                  stock.isLiveFetched
                                    ? `Data Tersinkronisasi Yahoo Finance (${stock.lastSyncedAt || 'Live'})`
                                    : 'Menunggu Sinkronisasi'
                                }
                                className={`inline-flex items-center justify-center p-1 rounded-xs border ${
                                  stock.isLiveFetched
                                    ? 'text-[#0D5C46] border-[#059669]/40 bg-[#059669]/10'
                                    : 'text-[#D97706] border-[#F59E0B]/40 bg-[#F59E0B]/10'
                                }`}
                              >
                                <RefreshCw className="w-2.5 h-2.5" />
                              </span>
                            </div>
                            <div className="text-[11px] font-bold mt-0.5">
                              <span className={is1DPos ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'}>
                                {is1DPos ? '+' : ''}
                                {stock.change1D.toFixed(2)}%
                              </span>
                              <span className="text-neutral-400"> (30D: </span>
                              <span className={is30DPos ? 'text-[#0D5C46]' : 'text-[#9E2A2B]'}>
                                {is30DPos ? '+' : ''}
                                {stock.return30D.toFixed(2)}%
                              </span>
                              <span className="text-neutral-400">)</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-neutral-400 font-bold">
                                Rp — (Data N/A)
                              </span>
                            </div>
                            <div className="text-[10px] font-semibold text-[#9E2A2B] mt-0.5">
                              Suspensi / Tidak Aktif di YF
                            </div>
                          </>
                        )}
                      </td>

                      {/* Center-Aligned Indicator Values */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap font-semibold text-[#111315]">
                        {stock.dmuLowVolScore.toFixed(1)}
                      </td>

                      <td className="py-2.5 px-2 text-center whitespace-nowrap font-semibold text-[#111315]">
                        {stock.dmuMomScore.toFixed(1)}
                      </td>

                      <td className="py-2.5 px-2 text-center whitespace-nowrap font-semibold text-[#111315]">
                        {stock.dmuValueScore.toFixed(1)}
                      </td>

                      <td className="py-2.5 px-2 text-center whitespace-nowrap font-semibold text-[#111315]">
                        {stock.dmuSizeScore.toFixed(1)}
                      </td>

                      <td className="py-2.5 px-2.5 text-center bg-[#FAF9F6] whitespace-nowrap">
                        <span
                          className={`text-sm font-bold ${
                            stock.dmuCompositeScore >= 7.2
                              ? 'text-[#0D5C46]'
                              : stock.dmuCompositeScore < 5.2
                              ? 'text-[#9E2A2B]'
                              : 'text-[#D97706] bb-amber'
                          }`}
                        >
                          {stock.dmuCompositeScore.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-neutral-400">/10</span>
                      </td>

                      <td className="py-2.5 px-2.5 text-center text-[11px] whitespace-nowrap">
                        <span className={zoneMeta.color}>{zoneMeta.text}</span>
                      </td>

                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onInspectTicker
                                ? onInspectTicker(stock.ticker)
                                : setInspectedTicker(stock.ticker)
                            }
                            title={`Inspect Fundamental (Joeliardi Sunendar & OOS) + Analisis AI & Berita Terkini ${stock.ticker}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-[#D97706]/10 hover:bg-[#D97706] text-[#D97706] hover:text-white border border-[#D97706]/40 rounded-xs transition-colors cursor-pointer"
                          >
                            <Scale className="w-3 h-3" />
                            <span>Inspect</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleToggleHscLocalAndParent(
                                stock.ticker,
                                Boolean(stock.isHscFlagged)
                              )
                            }
                            title={
                              stock.isHscFlagged
                                ? `Lepas label HSC pada ${stock.ticker}`
                                : `Tandai ${stock.ticker} sebagai saham HSC (Blokir ke Rotate Out)`
                            }
                            className={`p-1 rounded-xs border transition-colors cursor-pointer ${
                              stock.isHscFlagged
                                ? 'bg-[#E11D48] text-white border-[#E11D48]'
                                : 'bg-[#FAF9F6] text-neutral-500 border-[#E4E2DD] hover:text-[#9E2A2B] hover:border-[#E11D48]'
                            }`}
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onRemoveStock(stock.ticker)}
                            title={`Hapus ${stock.ticker}`}
                            className="text-neutral-400 hover:text-[#9E2A2B] transition-colors cursor-pointer p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fundamental & AI Conviction Inspector Modal */}
      {inspectedStockObj && (
        <EmitenFundamentalInspectorModal
          stock={inspectedStockObj}
          regimeStatus={regimeStatus}
          onClose={() => setInspectedTicker(null)}
          onToggleHscFlag={(tk, cur) => handleToggleHscLocalAndParent(tk, cur)}
          onStockSynced={onAddStock}
        />
      )}
    </section>
  );
}
