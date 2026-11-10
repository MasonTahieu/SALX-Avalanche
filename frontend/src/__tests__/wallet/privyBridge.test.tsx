import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const privy = vi.hoisted(() => ({
  ready: false,
  authenticated: false,
  walletsReady: false,
  wallets: [] as unknown[],
  login: vi.fn(),
  logout: vi.fn(async () => {}),
}));

vi.mock('@privy-io/react-auth', () => ({
  PrivyProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  usePrivy: () => ({ ready: privy.ready, authenticated: privy.authenticated, logout: privy.logout }),
  useWallets: () => ({ ready: privy.walletsReady, wallets: privy.wallets }),
  useLogin: () => ({ login: privy.login }),
}));

import { PrivyBridge, type PrivyBridgeProps } from '../../components/wallet/PrivyBridge';
import { isPrivyOAuthReturn } from '../../lib/privyRedirect';

const PROVIDER = { request: vi.fn() };

function signedInWithWallet() {
  Object.assign(privy, {
    ready: true,
    authenticated: true,
    walletsReady: true,
    wallets: [{
      walletClientType: 'privy',
      address: '0xa4d0580d325142f75d5061e2d253fbb5ee7e7725',
      switchChain: vi.fn(async () => {}),
      getEthereumProvider: vi.fn(async () => PROVIDER),
    }],
  });
}

function props(overrides: Partial<PrivyBridgeProps> = {}): PrivyBridgeProps {
  return {
    mode: 'login',
    attempt: 1,
    onConnected: vi.fn(),
    onStopped: vi.fn(),
    registerLogout: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  Object.assign(privy, { ready: false, authenticated: false, walletsReady: false, wallets: [] });
  privy.login.mockClear();
});

describe('isPrivyOAuthReturn', () => {
  it('recognises the page Google sends the visitor back to', () => {
    expect(isPrivyOAuthReturn('?privy_oauth_state=s&privy_oauth_provider=google&privy_oauth_code=c')).toBe(true);
  });

  it('ignores ordinary pages and partial parameters', () => {
    expect(isPrivyOAuthReturn('')).toBe(false);
    expect(isPrivyOAuthReturn('?tab=market')).toBe(false);
    expect(isPrivyOAuthReturn('?privy_oauth_code=c&privy_oauth_provider=google')).toBe(false);
  });
});

describe('PrivyBridge', () => {
  it('opens sign-in once for a signed-out visitor', () => {
    privy.ready = true;
    const view = render(<PrivyBridge {...props()} />);
    view.rerender(<PrivyBridge {...props()} />);
    expect(privy.login).toHaveBeenCalledTimes(1);
  });

  it('waits for Privy to finish a Google redirect instead of opening sign-in again', () => {
    privy.ready = true;
    const handlers = props({ mode: 'resume' });
    render(<PrivyBridge {...handlers} />);
    expect(privy.login).not.toHaveBeenCalled();
    expect(handlers.onStopped).not.toHaveBeenCalled();
  });

  it('connects the wallet once the Google redirect has signed the visitor in', async () => {
    signedInWithWallet();
    const handlers = props({ mode: 'resume' });
    render(<PrivyBridge {...handlers} />);
    await waitFor(() => expect(handlers.onConnected).toHaveBeenCalledWith(PROVIDER));
  });

  it('hands the wallet over again when the visitor retries', async () => {
    signedInWithWallet();
    const handlers = props();
    const view = render(<PrivyBridge {...handlers} />);
    await waitFor(() => expect(handlers.onConnected).toHaveBeenCalledTimes(1));
    view.rerender(<PrivyBridge {...handlers} attempt={2} />);
    await waitFor(() => expect(handlers.onConnected).toHaveBeenCalledTimes(2));
  });
});
