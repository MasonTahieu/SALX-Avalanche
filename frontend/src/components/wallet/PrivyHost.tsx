import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { PrivyBridgeProps } from './PrivyBridge';

// The Privy SDK is heavy, so it loads only when someone chooses email sign-in
// or returns to an email wallet session. Other visitors never download it.
const PrivyBridge = lazy(() => import('./PrivyBridge').then(m => ({ default: m.PrivyBridge })));

const LOAD_FAILED = 'Email sign-in is unavailable right now. You can still connect a browser wallet.';

class PrivyBoundary extends Component<{ onFailed: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailed();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A failure here, such as a blocked chunk or bad app ID, must never take the site down. */
export function PrivyHost(props: PrivyBridgeProps) {
  return (
    <PrivyBoundary onFailed={() => props.onStopped(LOAD_FAILED)}>
      <Suspense fallback={null}>
        <PrivyBridge {...props} />
      </Suspense>
    </PrivyBoundary>
  );
}
