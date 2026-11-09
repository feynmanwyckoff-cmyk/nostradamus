import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
}

interface MultiSelectDropdownProps {
  label?: string;
  labelPrefix?: string;
  allLabel: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (nextValues: string[]) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  align?: 'left' | 'right';
  className?: string;
}

export function MultiSelectDropdown({
  label,
  labelPrefix,
  allLabel,
  options,
  selectedValues,
  onChange,
  searchable = false,
  searchPlaceholder = 'Cari opsi...',
  align = 'left',
  className = ''
}: MultiSelectDropdownProps) {
  const effectivePrefix = labelPrefix || label || 'Filter';
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) => opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q)
    );
  }, [options, searchQuery]);

  const isAllSelected = selectedValues.length === 0;

  const handleToggleOption = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const handleSelectAllOptions = () => {
    onChange(options.map((o) => o.value));
  };

  const handleResetToAll = () => {
    onChange([]);
  };

  const buttonSummaryText = useMemo(() => {
    if (selectedValues.length === 0 || selectedValues.length === options.length) {
      return allLabel;
    }
    if (selectedValues.length === 1) {
      const found = options.find((o) => o.value === selectedValues[0]);
      return found ? `${effectivePrefix}: ${found.label}` : `${effectivePrefix}: 1 Dipilih`;
    }
    const labels = selectedValues
      .slice(0, 2)
      .map((val) => options.find((o) => o.value === val)?.label || val);
    return `${effectivePrefix}: ${selectedValues.length} Dipilih (${labels.join(', ')}${
      selectedValues.length > 2 ? '…' : ''
    })`;
  }, [selectedValues, options, allLabel, effectivePrefix]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <div className="inline-flex items-center">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`inline-flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-semibold bg-[#FFFFFF] border rounded-xs transition-colors cursor-pointer ${
            selectedValues.length > 0 && selectedValues.length < options.length
              ? 'border-[#D97706] text-[#D97706] bb-amber font-bold'
              : 'border-[#E4E2DD] text-[#111315] hover:border-[#F59E0B]'
          }`}
        >
          <span className="truncate max-w-[210px]">{buttonSummaryText}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform ${
              isOpen ? 'rotate-180 text-[#D97706]' : 'text-neutral-400'
            }`}
          />
        </button>

        {selectedValues.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleResetToAll();
            }}
            title="Reset filter ke Semua"
            className="ml-1 p-1 text-neutral-400 hover:text-[#9E2A2B] bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } top-full mt-1 z-50 w-72 bg-[#FFFFFF] border border-[#E4E2DD] rounded-xs shadow-xl overflow-hidden`}
        >
          {/* Top Action Header */}
          <div className="px-3 py-2 bg-[#FAF9F6] border-b border-[#E4E2DD] flex items-center justify-between text-[11px]">
            <span className="font-bold text-neutral-500">
              {selectedValues.length === 0
                ? 'Menampilkan Semua'
                : `${selectedValues.length} dari ${options.length} dipilih`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllOptions}
                className="font-bold text-[#0284C7] bb-cyan hover:underline cursor-pointer"
              >
                Pilih Semua
              </button>
              <span className="text-neutral-300">·</span>
              <button
                type="button"
                onClick={handleResetToAll}
                className="font-bold text-[#D97706] bb-amber hover:underline cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Optional Search Input */}
          {searchable && (
            <div className="p-2 border-b border-[#E4E2DD] bg-[#FFFFFF]">
              <div className="relative">
                <Search className="w-3 h-3 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-7 pr-2.5 py-1 text-xs bg-[#FAF9F6] border border-[#E4E2DD] rounded-xs focus:outline-none focus:border-[#F59E0B]"
                />
              </div>
            </div>
          )}

          {/* Option List */}
          <div className="max-h-60 overflow-y-auto table-scroll-container divide-y divide-[#E4E2DD]/50">
            <button
              type="button"
              onClick={handleResetToAll}
              className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-[#FAF9F6] transition-colors cursor-pointer ${
                isAllSelected ? 'bg-[#FAF9F6] font-bold text-[#D97706] bb-amber' : 'text-[#111315]'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span
                  className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 ${
                    isAllSelected
                      ? 'bg-[#D97706] border-[#D97706] text-white'
                      : 'border-neutral-400 bg-transparent'
                  }`}
                >
                  {isAllSelected && <Check className="w-2.5 h-2.5" />}
                </span>
                <span className="truncate">{allLabel}</span>
              </div>
            </button>

            {filteredOptions.map((opt) => {
              const checked = selectedValues.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleToggleOption(opt.value)}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-[#FAF9F6] transition-colors cursor-pointer ${
                    checked ? 'bg-[#FAF9F6] font-bold text-[#111315]' : 'text-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 ${
                        checked
                          ? 'bg-[#D97706] border-[#D97706] text-white'
                          : 'border-neutral-400 bg-transparent'
                      }`}
                    >
                      {checked && <Check className="w-2.5 h-2.5" />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </div>
                  {typeof opt.count === 'number' && (
                    <span className="text-[10px] font-semibold text-neutral-400 tabular-nums shrink-0">
                      ({opt.count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
