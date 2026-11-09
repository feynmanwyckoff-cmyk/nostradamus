import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

interface MetricTooltipProps {
  label: React.ReactNode;
  title?: string;
  laymanExplanation: string;
  practicalGuide?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  showIcon?: boolean;
}

/**
 * Interactive Hover Tooltip that translates Quantitative Metrics into Plain Everyday Language (Bahasa Awam).
 * Uses a fixed-position document.body Portal so tooltips inside overflow-auto tables (even 1-row tables)
 * are never clipped and never trigger unwanted table scrollbars.
 */
export function MetricTooltip({
  label,
  title,
  laymanExplanation,
  practicalGuide,
  align = 'left',
  className = '',
  showIcon = true
}: MetricTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement | null>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = 310;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let left = rect.left;
    if (align === 'center') {
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (align === 'right') {
      left = rect.right - tooltipWidth;
    }

    // Clamp horizontally within viewport margins
    left = Math.max(12, Math.min(left, viewportW - tooltipWidth - 12));

    // Place below trigger by default; flip above if too close to bottom of viewport
    const estimatedHeight = practicalGuide ? 155 : 110;
    let top = rect.bottom + 8;
    if (top + estimatedHeight > viewportH - 16 && rect.top - estimatedHeight - 8 > 12) {
      top = rect.top - estimatedHeight - 8;
    }

    setCoords({ top, left });
  }, [align, practicalGuide]);

  const handleMouseEnter = () => {
    updatePosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleScrollOrResize = () => {
      updatePosition();
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  return (
    <span
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      className={`relative inline-flex items-center gap-1 group cursor-help border-b border-dotted border-neutral-400/70 hover:border-[#F59E0B] transition-colors ${className}`}
    >
      <span>{label}</span>
      {showIcon && (
        <HelpCircle className="w-3 h-3 text-[#D97706] bb-amber opacity-80 group-hover:opacity-100 shrink-0" />
      )}

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: '310px',
              zIndex: 9999
            }}
            className="pointer-events-none p-3 rounded-xs shadow-2xl border border-[#F59E0B]/70 bg-[#111315] text-[#F9FAFB] text-left font-normal normal-case tracking-normal leading-relaxed"
          >
            {title && (
              <span className="block text-[11px] font-bold text-[#FBBF24] uppercase tracking-wider mb-1">
                {title}
              </span>
            )}
            <span className="block text-xs text-neutral-100 font-medium">
              <strong className="text-[#34D399]">Definisi : </strong>
              {laymanExplanation}
            </span>
            {practicalGuide && (
              <span className="block text-[11px] text-neutral-300 mt-1.5 pt-1.5 border-t border-neutral-700">
                <strong className="text-[#38BDF8]">Cara Baca: </strong>
                {practicalGuide}
              </span>
            )}
          </span>,
          document.body
        )}
    </span>
  );
}
