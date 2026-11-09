import { useEffect, useRef } from 'react';
import { PrivyProvider, useLogin, usePrivy, useWallets } from '@privy-io/react-auth';
import { avalanche, avalancheFuji } from 'viem/chains';
import { env } from '../../config/env';
import type { InjectedEthereum } from '../../services/blockchain';

export interface PrivyBridgeProps {
  /** `login` opens Privy's sign-in; `restore` only resumes an existing session. */
  mode: 'login' | 'restore';
  onConnected: (provider: InjectedEthereum) => void;
  onStopped: (message: string | null) => void;
  registerLogout: (logout: (() => Promise<void>) | null) => void;
}

const targetChain = env.chainId === avalanche.id ? avalanche : avalancheFuji;

function PrivySession({ mode, onConnected, onStopped, registerLogout }: PrivyBridgeProps) {
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

export function PrivyBridge(props: PrivyBridgeProps) {
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
      <PrivySession {...props} />
    </PrivyProvider>
  );
}
