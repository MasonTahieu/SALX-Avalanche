import { describe, expect, it } from 'vitest';
import { formatFee, proofActionLabel } from '../../lib/proofFormat';

describe('formatFee', () => {
  it('shows a dash when the fee is unknown', () => {
    expect(formatFee(null, 'AVAX')).toBe('—');
    expect(formatFee('not a number', 'AVAX')).toBe('—');
  });

  it('keeps three significant digits', () => {
    expect(formatFee('0.00012345', 'AVAX')).toBe('0.000123 AVAX');
  });

  it('never rounds a tiny fee down to zero', () => {
    expect(formatFee('0.0000000000200536', 'AVAX')).toBe('0.0000000000201 AVAX');
  });

  it('shows an actual zero as zero', () => {
    expect(formatFee('0.0', 'AVAX')).toBe('0 AVAX');
  });
});

describe('proofActionLabel', () => {
  it('names known actions and passes through anything else', () => {
    expect(proofActionLabel('BUY')).toBe('Buy SAL');
    expect(proofActionLabel('OTHER')).toBe('OTHER');
  });
});
