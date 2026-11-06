import { useSyncExternalStore } from 'react';
import { env } from '../config/env';

// The backend runs on Render's free tier, which sleeps when idle. The first
// request after a sleep waits up to a minute while the instance boots. This
// store tracks requests that are taking that long, so the shell can tell the
// visitor the server is starting instead of leaving a page blank.

const SLOW_AFTER_MS = 5000;

let slowRequests = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());

/** Wraps a request; while it runs past SLOW_AFTER_MS it counts as "waking". */
export function trackRequest<T>(request: Promise<T>): Promise<T> {
  let slow = false;
  const timer = window.setTimeout(() => {
    slow = true;
    slowRequests += 1;
    emit();
  }, SLOW_AFTER_MS);

  const settle = () => {
    window.clearTimeout(timer);
    if (slow) {
      slowRequests -= 1;
      emit();
    }
  };
  request.then(settle, settle);
  return request;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** True while at least one API request is waiting on a booting server. */
export function useServerWaking() {
  return useSyncExternalStore(subscribe, () => slowRequests > 0, () => false);
}

let warmUpSent = false;

/**
 * Starts waking the backend as soon as the app loads, so a sleeping instance
 * boots while the visitor reads the landing page rather than after they open
 * the marketplace. It also opens the connection the later API calls reuse.
 */
export function warmUpBackend() {
  if (warmUpSent) return;
  warmUpSent = true;
  fetch(`${env.apiUrl}/api/health/live`, { cache: 'no-store' }).catch(() => {});
}
