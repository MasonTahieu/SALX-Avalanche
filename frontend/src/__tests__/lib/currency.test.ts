import { describe, it, expect } from 'vitest';
import {
  AVAX_TO_USDC,
  AVAX_TO_VND,
  formatEstimatedUSDC,
  formatEstimatedVND,
  getCurrencyEstimates,
} from '../../lib/currency';

describe('currency conversion estimates', () => {
  it('has expected reference exchange rates', () => {
    expect(AVAX_TO_USDC).toBe(25);
    expect(AVAX_TO_VND).toBe(635_000);
  });

  it('formats USDC estimates accurately', () => {
    expect(formatEstimatedUSDC(0)).toBe('$0.00');
    expect(formatEstimatedUSDC(null)).toBe('$0.00');
    // 0.0025 AVAX * 25 = 0.0625 USDC -> ~$0.06 USDC
    expect(formatEstimatedUSDC(0.0025)).toBe('~$0.06 USDC');
    // 0.0015 AVAX * 25 = 0.0375 USDC -> ~$0.04 USDC
    expect(formatEstimatedUSDC(0.0015)).toBe('~$0.04 USDC');
    // 1 AVAX * 25 = 25 USDC -> ~$25.00 USDC
    expect(formatEstimatedUSDC(1)).toBe('~$25.00 USDC');
  });

  it('formats VNĐ estimates accurately', () => {
    expect(formatEstimatedVND(0)).toBe('0 VNĐ');
    expect(formatEstimatedVND(null)).toBe('0 VNĐ');
    // 0.0025 AVAX * 635,000 = 1,587.5 VNĐ -> ~1,588 VNĐ
    expect(formatEstimatedVND(0.0025)).toBe('~1,588 VNĐ');
    // 0.0015 AVAX * 635,000 = 952.5 VNĐ -> ~953 VNĐ
    expect(formatEstimatedVND(0.0015)).toBe('~953 VNĐ');
    // 1 AVAX * 635,000 = 635,000 VNĐ -> ~635,000 VNĐ
    expect(formatEstimatedVND(1)).toBe('~635,000 VNĐ');
  });

  it('combines USDC and VNĐ in getCurrencyEstimates', () => {
    const estimates = getCurrencyEstimates(0.0025);
    expect(estimates.usdc).toBe('~$0.06 USDC');
    expect(estimates.vnd).toBe('~1,588 VNĐ');
    expect(estimates.label).toBe('~$0.06 USDC / ~1,588 VNĐ');
  });
});
