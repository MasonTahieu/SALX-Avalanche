// SALX has no Solana wallets. Privy's docs recommend this stand-in so Vite can
// build its optional Solana code path, which never runs here.
export const getTransferSolInstruction = () => {
  throw new Error('@solana-program/system is not installed. SALX does not use Solana wallets.');
};
