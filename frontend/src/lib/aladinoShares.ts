// src/lib/aladinoShares.ts - client for the standalone Aladino Shares page.
//
// Plain fetch on purpose, not the portal's axios instance: that one attaches
// the member's token and bounces a 401 to /login, and this page has neither.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const BASE = `${API_URL}/aladino-shares`;

export interface ShareState {
  visible?: boolean;
  allowLookup: boolean;
  totalShares: number;
  bookedShares: number;
  availableShares: number;
  pricePerShare: number;
  valuation: number;
}

export interface ShareBooking {
  id: string;
  name: string;
  email: string;
  shares: number;
  status: 'active' | 'cancelled';
  createdAt: string;
}

export const DEFAULT_STATE: ShareState = {
  visible: true, allowLookup: true, totalShares: 600, bookedShares: 0,
  availableShares: 600, pricePerShare: 5000, valuation: 38000000,
};

export class ShareApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data?: any) { super(message); this.status = status; this.data = data; }
}

export async function shareFetch<T = any>(
  path: string, opts: { body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.body === undefined ? 'GET' : 'POST',
      headers, cache: 'no-store',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ShareApiError(0, 'Network error — please try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ShareApiError(res.status, data.error || 'Something went wrong.', data);
  return data as T;
}

export async function shareCsv(token: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/export.csv`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ShareApiError(res.status, 'Export failed.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = 'aladino-share-bookings.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export const eur = (n: number) => '€' + Math.round(n).toLocaleString('en-US');
export const eurShort = (n: number) =>
  n >= 1e6 ? '€' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : eur(n);
export const pct = (n: number) => (n === 0 ? '0%' : n.toFixed(n < 0.1 ? 4 : n < 1 ? 3 : 2) + '%');
export const fmtDate = (s: string) =>
  new Date(s).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
