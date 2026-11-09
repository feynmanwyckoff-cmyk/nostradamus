/**
 * Indonesian Number & Currency Formatting Utilities
 * Format standard: period ('.') for thousands separator, comma (',') for decimal separator.
 * Example: 1.250,02 or 100.000.000
 */

/**
 * Formats a raw user-typed string into Indonesian integer format with '.' thousands separators.
 * Example: "15000000" -> "15.000.000"
 */
export function formatIndonesianIntegerInput(raw: string): string {
  const digitsOnly = String(raw || '').replace(/[^0-9]/g, '');
  if (!digitsOnly) return '';
  const strippedLeading = digitsOnly.replace(/^0+(?=\d)/, '');
  return strippedLeading.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Formats a raw user-typed string into Indonesian decimal format with '.' thousands and ',' decimal (up to maxDecimals).
 * Supports Stockbit-style 2 decimal average buy prices such as "144,02" or "4.920,50".
 */
export function formatIndonesianDecimalInput(raw: string, maxDecimals: number = 2): string {
  if (!raw) return '';

  // Keep only digits, commas, and dots
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  if (!cleaned) return '';

  // In Indonesian input, comma ',' is the explicit decimal separator.
  // All dots '.' are treated as thousands separators and stripped before re-grouping.
  const commaParts = cleaned.split(',');
  const rawIntPart = commaParts[0].replace(/\./g, '');
  const hasComma = commaParts.length > 1;
  const rawDecPart = hasComma ? commaParts.slice(1).join('').replace(/\./g, '').slice(0, maxDecimals) : '';

  const normalizedInt = rawIntPart ? rawIntPart.replace(/^0+(?=\d)/, '') : hasComma ? '0' : '';
  const formattedInt = normalizedInt.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (hasComma) {
    return `${formattedInt},${rawDecPart}`;
  }
  return formattedInt;
}

/**
 * Parses an Indonesian-formatted string (e.g., "1.250,02" or "144,02" or "15.000.000") into a JavaScript number.
 */
export function parseIndonesianNumber(formatted: string | number): number {
  if (typeof formatted === 'number') {
    return Number.isFinite(formatted) ? formatted : 0;
  }
  if (!formatted) return 0;
  const normalized = String(formatted)
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Converts a numeric value into an Indonesian-formatted input string (e.g. 144.02 -> "144,02", 4920 -> "4.920").
 */
export function formatNumberToIndonesianInput(num: number, maxDecimals: number = 2): string {
  if (!Number.isFinite(num) || num <= 0) return '';
  const rounded = Number(num.toFixed(maxDecimals));
  const hasDecimals = Math.abs(rounded - Math.trunc(rounded)) > 1e-6;
  return rounded.toLocaleString('id-ID', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: maxDecimals
  });
}

/**
 * Formats an IDR price (such as Average Buy Price or Last Price) in Indonesian locale,
 * automatically displaying 2 decimal places when fractional cents exist (e.g. 144,02).
 */
export function formatIdrPriceDisplay(num: number): string {
  if (!Number.isFinite(num)) return '0';
  const rounded = Number(num.toFixed(2));
  const hasDecimals = Math.abs(rounded - Math.trunc(rounded)) > 1e-6;
  return rounded.toLocaleString('id-ID', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  });
}
