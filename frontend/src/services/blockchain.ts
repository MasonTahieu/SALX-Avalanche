import type { ContractRunner, Eip1193Provider } from 'ethers';
import { assertPublicContractConfig, env } from '../config/env';

// ethers (~700 KB with its crypto deps) and the contract ABIs are loaded on
// first use instead of at startup, so pages render before a wallet is needed.
let ethersModule: Promise<typeof import('ethers')> | null = null;
const loadEthers = () => (ethersModule ??= import('ethers'));

let abiModules: Promise<{ marketplace: any[]; sal: any[]; certificate: any[] }> | null = null;
const loadAbis = () => (abiModules ??= Promise.all([
  import('../contracts/abis/SALMarketplace.json'),
  import('../contracts/abis/SAL1155.json'),
  import('../contracts/abis/GreenCertificateSBT.json'),
]).then(([marketplace, sal, certificate]) => ({
  marketplace: marketplace.default.abi,
  sal: sal.default.abi,
  certificate: certificate.default.abi,
})));

export type WalletKind = 'core' | 'metamask' | 'coin98';

export function walletLabel(kind: WalletKind | null) {
  if (kind === 'core') return 'Core Wallet';
  if (kind === 'coin98') return 'Coin98 Wallet';
  return 'MetaMask';
}

export interface InjectedEthereum extends Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<any>;
  on?(event: string, listener: (...args: any[]) => void): void;
  removeListener?(event: string, listener: (...args: any[]) => void): void;
  providers?: InjectedEthereum[];
  isMetaMask?: boolean;
  isCoin98?: boolean;
  isAvalanche?: boolean;
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: InjectedEthereum;
}

declare global {
  interface Window {
    ethereum?: InjectedEthereum;
    coin98?: { provider?: InjectedEthereum };
    avalanche?: InjectedEthereum;
  }
}

let activeProvider: InjectedEthereum | null = null;
let activeWalletKind: WalletKind | null = null;

function defaultInjectedProvider() {
  if (!window.ethereum) throw new Error('Không tìm thấy ví EVM trong trình duyệt.');
  return window.ethereum;
}

async function discoverEip6963Providers(timeoutMs = 140): Promise<Eip6963Detail[]> {
  const found = new Map<string, Eip6963Detail>();
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963Detail>).detail;
    if (detail?.info?.uuid && detail?.provider) found.set(detail.info.uuid, detail);
  };

  window.addEventListener('eip6963:announceProvider', handler as EventListener);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise(resolve => window.setTimeout(resolve, timeoutMs));
  window.removeEventListener('eip6963:announceProvider', handler as EventListener);
  return [...found.values()];
}

function legacyProviders(): InjectedEthereum[] {
  const providers = window.ethereum?.providers;
  return Array.isArray(providers) && providers.length ? providers : window.ethereum ? [window.ethereum] : [];
}

export async function getWalletProvider(kind: WalletKind): Promise<InjectedEthereum> {
  const announced = await discoverEip6963Providers();

  if (kind === 'core') {
    const eip6963 = announced.find(({ info, provider }) => {
      const label = `${info.name} ${info.rdns}`.toLowerCase();
      return label.includes('app.core') || info.name.toLowerCase() === 'core' || provider.isAvalanche;
    });
    if (eip6963) return eip6963.provider;
    if (window.avalanche) return window.avalanche;
    const legacy = legacyProviders().find(provider => provider.isAvalanche);
    if (legacy) return legacy;
    throw new Error('Không tìm thấy Core Wallet. Hãy cài Core Extension tại https://core.app.');
  }

  if (kind === 'coin98') {
    const eip6963 = announced.find(({ info, provider }) => {
      const label = `${info.name} ${info.rdns}`.toLowerCase();
      return label.includes('coin98') || provider.isCoin98;
    });
    if (eip6963) return eip6963.provider;
    if (window.coin98?.provider) return window.coin98.provider;
    const legacy = legacyProviders().find(provider => provider.isCoin98);
    if (legacy) return legacy;
    throw new Error('Không tìm thấy Coin98 Wallet. Hãy cài Coin98 Extension hoặc mở SALX trong dApp browser của Coin98.');
  }

  const eip6963 = announced.find(({ info, provider }) => {
    const label = `${info.name} ${info.rdns}`.toLowerCase();
    return label.includes('metamask') || (provider.isMetaMask && !provider.isAvalanche && !provider.isCoin98);
  });
  if (eip6963) return eip6963.provider;
  const legacy = legacyProviders().find(provider => provider.isMetaMask && !provider.isCoin98 && !provider.isAvalanche);
  if (legacy) return legacy;
  if (window.ethereum?.isMetaMask) return window.ethereum;
  throw new Error('Không tìm thấy MetaMask. Hãy cài MetaMask Extension.');
}

export function setActiveWalletProvider(provider: InjectedEthereum | null, kind: WalletKind | null = null) {
  activeProvider = provider;
  activeWalletKind = kind;
}

export function getActiveWalletKind() {
  return activeWalletKind;
}

export async function restoreWalletProvider(kind: WalletKind) {
  const provider = await getWalletProvider(kind);
  setActiveWalletProvider(provider, kind);
  return provider;
}

const ethereum = () => activeProvider || defaultInjectedProvider();

/** The connected wallet's EIP-1193 provider (no ethers needed). */
export const getInjectedProvider = () => ethereum();

export async function getBrowserProvider(provider: InjectedEthereum = ethereum()) {
  const { BrowserProvider } = await loadEthers();
  return new BrowserProvider(provider);
}

export async function ensureTargetChain(provider: InjectedEthereum = ethereum()) {
  const chainIdHex = `0x${env.chainId.toString(16)}`;
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === chainIdHex.toLowerCase()) return;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
  } catch (error: any) {
    if (error?.code !== 4902 || !env.rpcUrl) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chainIdHex,
        chainName: env.chainName,
        nativeCurrency: { name: 'Avalanche', symbol: env.nativeSymbol, decimals: 18 },
        rpcUrls: [env.rpcUrl],
        blockExplorerUrls: [env.blockExplorerUrl],
      }],
    });
  }
}


export async function switchToNetwork(chainId: number) {
  const provider = activeProvider || defaultInjectedProvider();
  const chainIdHex = `0x${chainId.toString(16)}`;
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === chainIdHex.toLowerCase()) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
  } catch (error: any) {
    if (error?.code !== 4902) throw error;
    throw new Error('Ví chưa có mạng này. Hãy thêm network trong ví rồi thử lại.');
  }
}

export async function nativeBalance(owner: string) {
  const provider = await getBrowserProvider();
  const balance = await provider.getBalance(owner);
  const { formatEther } = await loadEthers();
  return formatEther(balance);
}

export async function connectWallet(kind: WalletKind) {
  const injected = await getWalletProvider(kind);
  setActiveWalletProvider(injected, kind);
  await ensureTargetChain(injected);
  const provider = await getBrowserProvider(injected);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();
  return { address: (await signer.getAddress()).toLowerCase(), chainId: Number(network.chainId), provider: injected, kind };
}

async function contractsFor(runner: ContractRunner) {
  const [{ Contract }, abi] = await Promise.all([loadEthers(), loadAbis()]);
  return {
    marketplace: new Contract(env.marketplaceAddress, abi.marketplace, runner),
    sal: new Contract(env.sal1155Address, abi.sal, runner),
    certificate: new Contract(env.certificateAddress, abi.certificate, runner),
  };
}

async function signerContracts() {
  assertPublicContractConfig();
  await ensureTargetChain();
  const provider = await getBrowserProvider();
  const signer = await provider.getSigner();
  return { signer, ...(await contractsFor(signer)) };
}

async function readContracts() {
  assertPublicContractConfig();
  return contractsFor(await getBrowserProvider());
}

export async function waitTx(tx: any) {
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash as string, blockNumber: Number(receipt.blockNumber) };
}

export async function submitProject(projectURI: string, proposedCO2Kg: number, valueWei: string) {
  const { marketplace } = await signerContracts();
  return waitTx(await marketplace.submitProject(projectURI, proposedCO2Kg, { value: BigInt(valueWei) }));
}

export async function ensureMarketplaceApproval(owner: string) {
  const { sal } = await signerContracts();
  const approved = await sal.isApprovedForAll(owner, env.marketplaceAddress);
  if (approved) return null;
  return waitTx(await sal.setApprovalForAll(env.marketplaceAddress, true));
}

export async function createListing(owner: string, projectId: number, amount: number, pricePerUnitETH: string) {
  await ensureMarketplaceApproval(owner);
  const { marketplace } = await signerContracts();
  const { parseEther } = await loadEthers();
  return waitTx(await marketplace.createListing(projectId, amount, parseEther(pricePerUnitETH)));
}

export async function buySAL(listingId: number, amount: number, pricePerUnitWei: string) {
  const { marketplace } = await signerContracts();
  const total = BigInt(pricePerUnitWei) * BigInt(amount);
  return waitTx(await marketplace.buySAL(listingId, amount, { value: total }));
}

export async function cancelListing(listingId: number) {
  const { marketplace } = await signerContracts();
  return waitTx(await marketplace.cancelListing(listingId));
}

export async function cancelPendingProject(projectId: number) {
  const { marketplace } = await signerContracts();
  return waitTx(await marketplace.cancelPendingProject(projectId));
}

export async function withdrawTokenizationRefund() {
  const { marketplace } = await signerContracts();
  return waitTx(await marketplace.withdrawTokenizationFeeRefund());
}

export async function withdrawProceeds() {
  const { marketplace } = await signerContracts();
  return waitTx(await marketplace.withdrawProceeds());
}

export async function retireSAL(
  owner: string,
  projectIds: number[],
  salAmounts: number[],
  certificateURI: string,
  deadline: string | number,
  signature: string,
) {
  if (!projectIds.length || projectIds.length !== salAmounts.length) {
    throw new Error('Retirement basket không hợp lệ.');
  }
  await ensureMarketplaceApproval(owner);
  const { marketplace } = await signerContracts();
  const fee = await marketplace.certificateMintFee();
  return waitTx(await marketplace.retireSAL(projectIds, salAmounts, certificateURI, deadline, signature, { value: fee }));
}

export async function retirementConfig() {
  const { marketplace } = await readContracts();
  const { formatEther } = await loadEthers();
  const [maxProjects, kgPerSAL, certFeeWei] = await Promise.all([
    marketplace.MAX_RETIREMENT_PROJECTS(),
    marketplace.KG_CO2_PER_SAL(),
    marketplace.certificateMintFee(),
  ]);
  return {
    maxProjects: Number(maxProjects),
    kgPerSAL: Number(kgPerSAL),
    certificateFeeETH: formatEther(certFeeWei),
  };
}

export async function certificateComposition(tokenId: number) {
  const { certificate } = await readContracts();
  const [projectIds, salAmounts] = await certificate.getCertificateComposition(tokenId);
  return {
    projectIds: Array.from(projectIds, (value: bigint) => Number(value)),
    salAmounts: Array.from(salAmounts, (value: bigint) => Number(value)),
  };
}

export async function salBalance(owner: string, projectId: number) {
  const { sal } = await readContracts();
  return Number(await sal.balanceOf(owner, projectId));
}

export async function accountFinance(owner: string) {
  const { marketplace } = await readContracts();
  const { formatEther } = await loadEthers();
  const [refundWei, proceedsWei, certFeeWei, minPriceWei, maxPriceWei, paused] = await Promise.all([
    marketplace.tokenizationFeeRefundBalances(owner),
    marketplace.sellerBalances(owner),
    marketplace.certificateMintFee(),
    marketplace.minPrice(),
    marketplace.maxPrice(),
    marketplace.paused(),
  ]);
  return {
    refundETH: formatEther(refundWei),
    proceedsETH: formatEther(proceedsWei),
    certificateFeeETH: formatEther(certFeeWei),
    minPriceETH: formatEther(minPriceWei),
    maxPriceETH: formatEther(maxPriceWei),
    paused: Boolean(paused),
  };
}
