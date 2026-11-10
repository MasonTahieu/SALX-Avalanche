import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  connectWallet,
  getBrowserProvider,
  getWalletProvider,
  restoreWalletProvider,
  setActiveWalletProvider,
  setEmbeddedWalletProvider,
  switchToNetwork,
  nativeBalance,
  type InjectedEthereum,
  type WalletKind,
} from '../services/blockchain';
import { env } from '../config/env';
import { errorMessage } from '../lib/errors';
import { isPrivyOAuthReturn } from '../lib/privyRedirect';
import { PrivyHost } from '../components/wallet/PrivyHost';

interface WalletState {
  address: string | null;
  chainId: number | null;
  walletKind: WalletKind | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  modalOpen: boolean;
  /** True only when opened from the header; an action on a page skips the role step. */
  modalAsksRole: boolean;
  accountMenuOpen: boolean;
  nativeBalance: string | null;
  role: 'user' | 'validator';
  setRole: (r: 'user' | 'validator') => void;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => void;
  openWalletModal: () => void;
  openRoleModal: () => void;
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
  return saved === 'core' || saved === 'metamask' || saved === 'coin98' || saved === 'privy' ? saved : null;
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
  const [modalAsksRole, setModalAsksRole] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [role, setRoleState] = useState<'user' | 'validator'>(savedRole);
  // Privy stays mounted while its wallet is in use, because it handles the signing.
  const [privyMode, setPrivyMode] = useState<'login' | 'restore' | 'resume' | null>(null);
  const [privyAttempt, setPrivyAttempt] = useState(0);
  const privyLogout = useRef<(() => Promise<void>) | null>(null);

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
    // Back from Google: the page reloaded mid sign-in, so start Privy at once
    // and let it finish. Only buyers can choose email or Google sign-in.
    if (env.privyAppId && isPrivyOAuthReturn(window.location.search)) {
      setRole('user');
      setConnecting(true);
      setPrivyMode('resume');
      return;
    }
    const kind = walletKind || savedWalletKind();
    // Only auto-restore if the user explicitly connected in this browser session.
    // Without this gate, eth_accounts silently reconnects on every page load
    // using previously-stored permission without any extension popup.
    if (!kind || !sessionStorage.getItem(SESSION_KEY)) return;
    if (kind === 'privy') {
      setPrivyMode('restore');
      return;
    }
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
  }, [walletKind, setRole]);

  const adoptConnection = useCallback(async (result: Awaited<ReturnType<typeof connectWallet>>) => {
    setAddress(result.address);
    setChainId(result.chainId);
    setWalletKind(result.kind);
    setActiveInjectedProviderState(result.provider);
    localStorage.setItem('salx.walletKind', result.kind);
    sessionStorage.setItem(SESSION_KEY, '1');
    try { setBalance(await nativeBalance(result.address)); } catch { setBalance(null); }
    setModalOpen(false);
    setAccountMenuOpen(false);
  }, []);

  const handlePrivyConnected = useCallback(async (provider: InjectedEthereum) => {
    try {
      setEmbeddedWalletProvider(provider);
      await adoptConnection(await connectWallet('privy'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  }, [adoptConnection]);

  const handlePrivyStopped = useCallback((message: string | null) => {
    setPrivyMode(null);
    setConnecting(false);
    setEmbeddedWalletProvider(null);
    if (message) setError(message);
    // A saved email session that has ended must not be retried on every load.
    if (localStorage.getItem('salx.walletKind') === 'privy') {
      localStorage.removeItem('salx.walletKind');
      sessionStorage.removeItem(SESSION_KEY);
      setWalletKind(null);
    }
  }, []);

  const registerPrivyLogout = useCallback((logout: (() => Promise<void>) | null) => {
    privyLogout.current = logout;
  }, []);

  const connect = useCallback(async (kind: WalletKind) => {
    setConnecting(true);
    setError(null);
    if (kind === 'privy') {
      setPrivyAttempt(n => n + 1);
      setPrivyMode('login');
      return;
    }
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

      await adoptConnection(await connectWallet(kind));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  }, [adoptConnection]);

  const disconnect = useCallback(() => {
    const logout = privyLogout.current;
    if (logout) void logout().catch(() => {}).finally(() => setPrivyMode(null));
    else setPrivyMode(null);
    setEmbeddedWalletProvider(null);
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
    modalAsksRole,
    accountMenuOpen,
    nativeBalance: balance,
    role,
    setRole,
    connect,
    disconnect,
    openWalletModal: () => { setModalAsksRole(false); setModalOpen(true); },
    openRoleModal: () => { setModalAsksRole(true); setModalOpen(true); },
    closeWalletModal: () => setModalOpen(false),
    openAccountMenu: () => setAccountMenuOpen(true),
    closeAccountMenu: () => setAccountMenuOpen(false),
    switchNetwork,
    refresh,
    refreshBalance,
  }), [address, chainId, walletKind, connecting, error, modalOpen, modalAsksRole, accountMenuOpen, balance, role, setRole, connect, disconnect, switchNetwork, refresh, refreshBalance]);

  return (
    <WalletContext.Provider value={value}>
      {children}
      {privyMode && (
        <PrivyHost
          mode={privyMode}
          attempt={privyAttempt}
          onConnected={handlePrivyConnected}
          onStopped={handlePrivyStopped}
          registerLogout={registerPrivyLogout}
        />
      )}
    </WalletContext.Provider>
  );
}

export const useWallet = () => {
  const value = useContext(WalletContext);
  if (!value) throw new Error('useWallet must be used inside WalletProvider');
  return value;
};
