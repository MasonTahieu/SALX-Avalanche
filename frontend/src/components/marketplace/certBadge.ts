export interface CertBadge { label: string; bg: string; color: string }

// Badge on project cards (marketplace and the home page editions).
export function certBadge(methodology: string): CertBadge {
  return methodology.toLowerCase().includes('gold')
    ? { label: 'GOLD STANDARD', bg: '#e7c765', color: '#3a2c05' }
    : { label: 'VCS VERIFIED', bg: '#2dc922', color: '#08150e' };
}
