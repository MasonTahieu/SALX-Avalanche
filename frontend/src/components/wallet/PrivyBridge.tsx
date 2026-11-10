import { useEffect, useRef } from 'react';
import { PrivyProvider, useLogin, usePrivy, useWallets } from '@privy-io/react-auth';
import { avalanche, avalancheFuji } from 'viem/chains';
import { env } from '../../config/env';
import type { InjectedEthereum } from '../../services/blockchain';

export interface PrivyBridgeProps {
  /**
   * `login` opens Privy's sign-in; `restore` only resumes an existing session;
   * `resume` lets Privy finish a Google sign-in after the redirect back to the site.
   */
  mode: 'login' | 'restore' | 'resume';
  /** Changes on every sign-in click, so a retry starts from a clean state. */
  attempt: number;
  onConnected: (provider: InjectedEthereum) => void;
  onStopped: (message: string | null) => void;
  registerLogout: (logout: (() => Promise<void>) | null) => void;
}

type PrivySessionProps = Omit<PrivyBridgeProps, 'attempt'>;

const targetChain = env.chainId === avalanche.id ? avalanche : avalancheFuji;

function PrivySession({ mode, onConnected, onStopped, registerLogout }: PrivySessionProps) {
  const { ready, authenticated, logout } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const loginAsked = useRef(false);
  const deliveredAddress = useRef<string | null>(null);

  const { login } = useLogin({
    onError: (error) => {
      onStopped(error === 'exited_auth_flow' ? null : 'Could not sign in. Please try again.');
    },
  });

  useEffect(() => {
    registerLogout(logout);
    return () => registerLogout(null);
  }, [logout, registerLogout]);

  useEffect(() => {
    if (!ready || authenticated) return;
    if (mode === 'restore') {
      onStopped(null);
      return;
    }
    // Privy shows its own progress and error screens for the redirect, and
    // reports a failed or abandoned sign-in through onError.
    if (mode === 'resume') return;
    if (!loginAsked.current) {
      loginAsked.current = true;
      login();
    }
  }, [ready, authenticated, mode, login, onStopped]);

  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

  useEffect(() => {
    if (!authenticated || !walletsReady || !embeddedWallet) return;
    if (deliveredAddress.current === embeddedWallet.address) return;
    deliveredAddress.current = embeddedWallet.address;

    (async () => {
      try {
        await embeddedWallet.switchChain(env.chainId);
        onConnected(await embeddedWallet.getEthereumProvider() as InjectedEthereum);
      } catch {
        deliveredAddress.current = null;
        onStopped('Could not open your wallet. Please try again.');
      }
    })();
  }, [authenticated, walletsReady, embeddedWallet, onConnected, onStopped]);

  return null;
}

export function PrivyBridge({ attempt, ...session }: PrivyBridgeProps) {
  return (
    <PrivyProvider
      appId={env.privyAppId}
      clientId={env.privyClientId || undefined}
      config={{
        loginMethods: ['google', 'email'],
        appearance: { theme: 'dark', accentColor: '#2dc922' },
        embeddedWallets: { ethereum: { createOnLogin: 'all-users' } },
        defaultChain: targetChain,
        supportedChains: [targetChain],
      }}
    >
      <PrivySession key={attempt} {...session} />
    </PrivyProvider>
  );
}
