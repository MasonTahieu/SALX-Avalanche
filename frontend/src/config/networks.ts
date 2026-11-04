export type NetworkOption = {
  id: number;
  name: string;
  shortName: string;
  symbol: string;
  icon: string;
  accent: string;
  rpcUrl?: string;
  explorerUrl?: string;
};

export const NETWORKS: NetworkOption[] = [
  {
    id: 43113,
    name: 'Avalanche Fuji',
    shortName: 'Fuji',
    symbol: 'AVAX',
    icon: '▲',
    accent: '#e84142',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    explorerUrl: 'https://testnet.snowtrace.io',
  },
  {
    id: 43114,
    name: 'Avalanche C-Chain',
    shortName: 'Avalanche',
    symbol: 'AVAX',
    icon: '▲',
    accent: '#e84142',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
  },
];

export function networkById(chainId: number | null | undefined) {
  return NETWORKS.find((network) => network.id === chainId) || null;
}
