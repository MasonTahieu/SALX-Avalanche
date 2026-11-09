import { afterEach, describe, expect, it, vi } from 'vitest';
import { needsFunding } from '../../lib/walletFunding';
import {
  connectWallet,
  getWalletProvider,
  setActiveWalletProvider,
  setEmbeddedWalletProvider,
  walletLabel,
  type InjectedEthereum,
} from '../../services/blockchain';

const ADDRESS = '0x39b0F41D10210537b767C8BB5f35548D055D80Ba';

function embeddedProvider() {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === 'eth_chainId') return '0xa869';
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ADDRESS];
    if (method === 'net_version') return '43113';
    return null;
  });
  return { request } as unknown as InjectedEthereum;
}

afterEach(() => {
  setEmbeddedWalletProvider(null);
  setActiveWalletProvider(null, null);
});

describe('email wallet', () => {
  it('asks for sign-in when no embedded wallet is available', async () => {
    await expect(getWalletProvider('privy')).rejects.toThrow();
  });

  it('uses the embedded wallet without looking for a browser extension', async () => {
    const provider = embeddedProvider();
    setEmbeddedWalletProvider(provider);
    await expect(getWalletProvider('privy')).resolves.toBe(provider);
  });

  it('connects through the same path as other wallets', async () => {
    setEmbeddedWalletProvider(embeddedProvider());
    const result = await connectWallet('privy');
    expect(result).toMatchObject({ address: ADDRESS.toLowerCase(), chainId: 43113, kind: 'privy' });
  });

  it('has its own label', () => {
    expect(walletLabel('privy')).toBe('Email wallet');
  });
});

describe('needsFunding', () => {
  it('asks for funds on an empty or nearly empty wallet', () => {
    expect(needsFunding('0.0')).toBe(true);
    expect(needsFunding('0.001')).toBe(true);
  });

  it('stays quiet once the wallet can afford a purchase', () => {
    expect(needsFunding('0.05')).toBe(false);
  });

  it('stays quiet when the balance is unknown', () => {
    expect(needsFunding(null)).toBe(false);
    expect(needsFunding('oops')).toBe(false);
  });
});
