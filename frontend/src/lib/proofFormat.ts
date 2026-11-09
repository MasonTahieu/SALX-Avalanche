const ACTION_LABELS: Record<string, string> = {
  MINT: 'Mint SAL',
  BUY: 'Buy SAL',
  RETIRE: 'Retire SAL',
};

export const proofActionLabel = (type: string) => ACTION_LABELS[type] ?? type;

/** Network fees on Fuji can be tiny, so the digits that matter are always shown. */
export const formatFee = (fee: string | null | undefined, symbol: string) => {
  if (fee == null) return '—';
  const value = Number(fee);
  if (!Number.isFinite(value)) return '—';
  const digits = value.toLocaleString('en-US', { maximumSignificantDigits: 3, maximumFractionDigits: 20 });
  return `${digits} ${symbol}`;
};
