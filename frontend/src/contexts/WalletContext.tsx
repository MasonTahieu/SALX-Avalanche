import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  connectWallet,
  getBrowserProvider,
  getWalletProvider,
  restoreWalletProvider,
  setActiveWalletProvider,
  switchToNetwork,
  nativeBalance,
  type InjectedEthereum,
  type WalletKind,
} from '../services/blockchain';
import { env } from '../config/env';
import { errorMessage } from '../lib/errors';

interface WalletState {
  address: string | null;
  chainId: number | null;
  walletKind: WalletKind | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  modalOpen: boolean;
  accountMenuOpen: boolean;
  nativeBalance: string | null;
  role: 'user' | 'validator';
  setRole: (r: 'user' | 'validator') => void;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => void;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  openAccountMenu: () => void;
  closeAccountMenu: () => void;
  switchNetwork: (chainId: number) => Promise<void>;
  refresh: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

// Tracks that the user explicitly connected in this browser session.
// sessionStorage is cleared when the tab is closed, so auto-restore via
// eth_accounts only happens within the same session as the explicit connect.
const SESSION_KEY = 'salx.session';

function savedWalletKind(): WalletKind | null {
  const saved = localStorage.getItem('salx.walletKind');
  return saved === 'core' || saved === 'metamask' || saved === 'coin98' ? saved : null;
}

function savedRole(): 'user' | 'validator' {
  const saved = localStorage.getItem('salx.role');
  return saved === 'validator' ? 'validator' : 'user';
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletKind, setWalletKind] = useState<WalletKind | null>(savedWalletKind);
  const [activeInjectedProvider, setActiveInjectedProviderState] = useState<InjectedEthereum | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [role, setRoleState] = useState<'user' | 'validator'>(savedRole);

  const setRole = useCallback((r: 'user' | 'validator') => {
    setRoleState(r);
    localStorage.setItem('salx.role', r);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!address || !activeInjectedProvider) return;
    try {
      setBalance(await nativeBalance(address));
    } catch {
      setBalance(null);
    }
  }, [address, activeInjectedProvider]);

  const refresh = useCallback(async () => {
    const kind = walletKind || savedWalletKind();
    // Only auto-restore if the user explicitly connected in this browser session.
    // Without this gate, eth_accounts silently reconnects on every page load
    // using previously-stored permission without any extension popup.
    if (!kind || !sessionStorage.getItem(SESSION_KEY)) return;
    try {
      const injected = await restoreWalletProvider(kind);
      setActiveInjectedProviderState(injected);
      const accounts = await injected.request({ method: 'eth_accounts' }) as string[];
      const provider = await getBrowserProvider(injected);
      const network = await provider.getNetwork();
      const nextAddress = accounts[0]?.toLowerCase() || null;
      setAddress(nextAddress);
      setChainId(Number(network.chainId));
      setWalletKind(kind);
      if (nextAddress) {
        try { setBalance(await nativeBalance(nextAddress)); } catch { setBalance(null); }
      }
    } catch {
      setAddress(null);
      setChainId(null);
      setBalance(null);
    }
  }, [walletKind]);

  const connect = useCallback(async (kind: WalletKind) => {
    setConnecting(true);
    setError(null);
    try {
      const injected = await getWalletProvider(kind);

      // Revoke first so MetaMask treats the next request as a fresh connection
      // and always shows the full account checklist (Chỉnh sửa tài khoản).
      // Without revoke, wallet_requestPermissions shows a simplified confirm
      // screen when the site already has connected accounts.
      try {
        await injected.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
      } catch {
        // Older MetaMask / Coin98 may not support this — continue
      }

      // 4001 = user rejected → rethrow. Unsupported → fall through.
      try {
        await injected.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
      } catch (permErr: any) {
        if (permErr?.code === 4001) throw permErr;
      }

      await (await getBrowserProvider(injected)).send('eth_requestAccounts', []);

      const result = await connectWallet(kind);
      setAddress(result.address);
      setChainId(result.chainId);
      setWalletKind(kind);
      setActiveInjectedProviderState(result.provider);
      localStorage.setItem('salx.walletKind', kind);
      sessionStorage.setItem(SESSION_KEY, '1');
      try { setBalance(await nativeBalance(result.address)); } catch { setBalance(null); }
      setModalOpen(false);
      setAccountMenuOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setWalletKind(null);
    setActiveInjectedProviderState(null);
    setActiveWalletProvider(null, null);
    setBalance(null);
    localStorage.removeItem('salx.walletKind');
    sessionStorage.removeItem(SESSION_KEY);
    setModalOpen(false);
    setAccountMenuOpen(false);
    setError(null);
  }, []);

  const switchNetwork = useCallback(async (nextChainId: number) => {
    if (!activeInjectedProvider) {
      setModalOpen(true);
      return;
    }
    setError(null);
    try {
      await switchToNetwork(nextChainId);
      const provider = await getBrowserProvider(activeInjectedProvider);
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));
      await refreshBalance();
      setAccountMenuOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [activeInjectedProvider, refreshBalance]);

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    const injected = activeInjectedProvider;
    if (!injected) return;
    const onAccounts = async (accounts: string[]) => {
      const next = accounts[0]?.toLowerCase() || null;
      setAddress(next);
      if (next) {
        try { setBalance(await nativeBalance(next)); } catch { setBalance(null); }
      } else {
        setBalance(null);
      }
    };
    const onChain = async (id: string) => {
      const nextChain = Number.parseInt(id, 16);
      setChainId(nextChain);
      await refreshBalance();
    };
    injected.on?.('accountsChanged', onAccounts);
    injected.on?.('chainChanged', onChain);
    return () => {
      injected.removeListener?.('accountsChanged', onAccounts);
      injected.removeListener?.('chainChanged', onChain);
    };
  }, [activeInjectedProvider, refreshBalance]);

  const value = useMemo(() => ({
    address,
    chainId,
    walletKind,
    connected: Boolean(address) && chainId === env.chainId,
    connecting,
    error,
    modalOpen,
    accountMenuOpen,
    nativeBalance: balance,
    role,
    setRole,
    connect,
    disconnect,
    openWalletModal: () => setModalOpen(true),
    closeWalletModal: () => setModalOpen(false),
    openAccountMenu: () => setAccountMenuOpen(true),
    closeAccountMenu: () => setAccountMenuOpen(false),
    switchNetwork,
    refresh,
    refreshBalance,
  }), [address, chainId, walletKind, connecting, error, modalOpen, accountMenuOpen, balance, role, setRole, connect, disconnect, switchNetwork, refresh, refreshBalance]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export const useWallet = () => {
  const value = useContext(WalletContext);
  if (!value) throw new Error('useWallet must be used inside WalletProvider');
  return value;
};
