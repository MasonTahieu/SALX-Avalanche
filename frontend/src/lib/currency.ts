/**
 * currency.ts
 *
 * Reference exchange rates and formatting helpers for estimated currency conversions.
 * Rates: 1 AVAX ≈ 25 USDC ≈ 635,000 VNĐ (reference only).
 */

export const AVAX_TO_USDC = 25;      // 1 AVAX ≈ $25 USDC (reference only)
export const AVAX_TO_VND  = 635_000; // 1 AVAX ≈ 635,000 VNĐ (reference only)

export interface CurrencyEstimate {
  usdc: string;
  vnd: string;
  /** Combined label, e.g. "~$0.06 USDC / ~1,588 VNĐ" */
  label: string;
}

/**
 * Formats estimated USDC value from AVAX amount.
 * Example: 0.0025 AVAX -> "~$0.06 USDC"
 */
export function formatEstimatedUSDC(avaxAmount: number | string | null | undefined): string {
  const val = Number(avaxAmount) || 0;
  const usdc = val * AVAX_TO_USDC;
  if (usdc <= 0) return '$0.00';
  if (usdc < 0.0001) return '<$0.0001 USDC';
  if (usdc < 0.01) {
    return `~$${usdc.toFixed(4)} USDC`;
  }
  return `~$${usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
}

/**
 * Formats estimated VNĐ value from AVAX amount.
 * Example: 0.0025 AVAX -> "~1,588 VNĐ"
 */
export function formatEstimatedVND(avaxAmount: number | string | null | undefined): string {
  const val = Number(avaxAmount) || 0;
  const vnd = val * AVAX_TO_VND;
  if (vnd <= 0) return '0 VNĐ';
  return `~${Math.round(vnd).toLocaleString('en-US')} VNĐ`;
}

/**
 * Returns formatted estimate strings for USDC and VNĐ.
 */
export function getCurrencyEstimates(avaxAmount: number | string | null | undefined): CurrencyEstimate {
  const usdc = formatEstimatedUSDC(avaxAmount);
  const vnd = formatEstimatedVND(avaxAmount);
  return {
    usdc,
    vnd,
    label: `${usdc} / ${vnd}`,
  };
}
