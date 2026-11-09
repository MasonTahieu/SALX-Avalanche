const numberEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Mặc định: Avalanche Fuji C-Chain testnet.
export const env = {
  apiUrl: (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, ''),
  chainId: numberEnv(import.meta.env.VITE_CHAIN_ID, 43113),
  chainName: import.meta.env.VITE_CHAIN_NAME || 'Avalanche Fuji',
  nativeSymbol: import.meta.env.VITE_NATIVE_SYMBOL || 'AVAX',
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc',
  blockExplorerUrl: (import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://testnet.snowtrace.io').replace(/\/$/, ''),
  // Gateway of the IPFS provider the backend pins to (Filebase), so document
  // links don't depend on a third-party public gateway.
  ipfsGatewayUrl: (import.meta.env.VITE_IPFS_GATEWAY_URL || 'https://ipfs.filebase.io/ipfs').replace(/\/$/, ''),
  marketplaceAddress: import.meta.env.VITE_MARKETPLACE_CONTRACT_ADDRESS || '',
  sal1155Address: import.meta.env.VITE_SAL1155_CONTRACT_ADDRESS || '',
  certificateAddress: import.meta.env.VITE_CERTIFICATE_SBT_CONTRACT_ADDRESS || '',
  // Email and Google sign-in stay hidden until an app ID is configured.
  privyAppId: import.meta.env.VITE_PRIVY_APP_ID || '',
  privyClientId: import.meta.env.VITE_PRIVY_CLIENT_ID || '',
};

export const assertPublicContractConfig = () => {
  const missing = [
    ['VITE_MARKETPLACE_CONTRACT_ADDRESS', env.marketplaceAddress],
    ['VITE_SAL1155_CONTRACT_ADDRESS', env.sal1155Address],
    ['VITE_CERTIFICATE_SBT_CONTRACT_ADDRESS', env.certificateAddress],
  ].filter(([, value]) => !value || value === '0x...');

  if (missing.length) {
    throw new Error(`Thiếu cấu hình frontend: ${missing.map(([key]) => key).join(', ')}`);
  }
};
