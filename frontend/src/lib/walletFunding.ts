// The contest's own faucet takes a pasted address and sends 0.05 test AVAX.
export const TEST_AVAX_FAUCET_URL = 'https://team1vn.xyz/faucet.html';

// Enough for one purchase and one retirement at the current listing prices.
const MINIMUM_USABLE_BALANCE = 0.005;

export const needsFunding = (balance: string | null | undefined) => {
  if (balance == null) return false;
  const value = Number(balance);
  return Number.isFinite(value) && value < MINIMUM_USABLE_BALANCE;
};
