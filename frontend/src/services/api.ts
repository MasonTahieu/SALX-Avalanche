import { env } from '../config/env';
import { trackRequest } from './serverStatus';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, data: any) {
    super(data?.error || data?.message || `HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

// GET requests already in flight, by URL. Pages and panels that mount together
// often ask for the same data (approved projects, a wallet's certificates);
// they share one network request instead of each sending their own.
const inflight = new Map<string, Promise<unknown>>();

async function send<T>(url: string, options: RequestInit & { adminKey?: string }): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (options.adminKey) headers.set('x-admin-key', options.adminKey);

  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!response.ok) throw new ApiError(response.status, data);
  return data as T;
}

export async function api<T>(
  path: string,
  options: RequestInit & { adminKey?: string } = {},
): Promise<T> {
  const url = `${env.apiUrl}${path}`;
  const method = (options.method || 'GET').toUpperCase();
  // Only plain public reads are shared; anything with a body, an admin key or
  // an abort signal belongs to its caller alone.
  const shareable = method === 'GET' && !options.adminKey && !options.signal && !options.body;
  if (!shareable) return trackRequest(send<T>(url, options));

  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const request = trackRequest(send<T>(url, options)).finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}
