'use client';
// Fetch hook shared by the sections, plus the live-stream reader.
import { useEffect, useRef, useState } from 'react';
import { monitoringAPI } from '@/lib/api';
import { readToken } from '@/lib/tokenStore';
import { Filters, filtersReady, toParams, errText } from './shared';

/**
 * Loads `fetcher(params)` whenever the (debounced) filters or `extra` change.
 * A response that arrives after a newer request was sent is dropped, so a slow
 * query for an old filter can never overwrite a fast one for the current.
 */
export function useMonitoring<T>(
  fetcher: (p: Record<string, string>) => Promise<{ data: T }>,
  filters: Filters,
  extra: Record<string, string> = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const key = JSON.stringify([toParams(filters, extra)]);

  useEffect(() => {
    if (!filtersReady(filters)) { setLoading(false); return undefined; }
    const mine = ++seq.current;
    setLoading(true);
    fetcher(toParams(filters, extra))
      .then((r) => { if (mine === seq.current) { setData(r.data); setError(''); } })
      .catch((e) => { if (mine === seq.current) setError(errText(e)); })
      .finally(() => { if (mine === seq.current) setLoading(false); });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}

export interface LiveSession {
  id: string; kind: 'GUEST' | 'MEMBER'; userId: string | null; name: string | null; email: string | null; ip: string | null;
  country: string | null; countryName: string; city: string | null; device: string; browser: string; os: string | null; source: string | null;
  landingPath: string; currentPath: string; pageViews: number; loggedInAt: string | null; startedAt: string; lastSeenAt: string;
  endedAt: string | null; status: 'LIVE' | 'ENDED'; durationSeconds: number;
}
export interface LiveBoard {
  at: string; counts: { guests: number; members: number; total: number };
  topCountries: Array<{ country: string; count: number }>; sessions: LiveSession[]; truncated: boolean;
}

/**
 * The live board over Server-Sent Events, read with fetch because EventSource
 * cannot send the Authorization header and a token in the URL would end up in
 * logs. If the stream cannot be held open (a proxy that buffers, an old
 * browser) it falls back to polling the same data every 10 seconds, so the
 * board is never simply frozen.
 */
export function useLiveBoard(filters: Filters) {
  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [mode, setMode] = useState<'connecting' | 'stream' | 'polling'>('connecting');
  const [error, setError] = useState('');
  const key = JSON.stringify(toParams({ ...filters, status: '' }));

  useEffect(() => {
    const ctl = new AbortController();
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let stopped = false;
    const params = toParams({ ...filters, status: '' });
    delete params.range; delete params.from; delete params.to;

    const poll = () => monitoringAPI.live(params).then((r) => { setBoard(r.data); setError(''); }).catch((e) => setError(errText(e)));
    const startPolling = () => {
      if (pollTimer || stopped) return;
      setMode('polling'); poll(); pollTimer = setInterval(poll, 10_000);
    };

    const connect = async () => {
      try {
        const token = readToken();
        const res = await fetch(monitoringAPI.streamUrl(params), {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal: ctl.signal,
        });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        failures = 0; setMode('stream'); setError('');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i); buf = buf.slice(i + 2);
            const line = frame.split('\n').find((l) => l.startsWith('data: '));
            if (line) { try { setBoard(JSON.parse(line.slice(6))); } catch { /* a torn frame is skipped */ } }
          }
        }
        throw new Error('closed');
      } catch (e: any) {
        if (stopped || e?.name === 'AbortError') return;
        failures += 1;
        // Two failures in a row means streaming is not going to work here.
        if (failures >= 2) { startPolling(); return; }
        retry = setTimeout(connect, 3000);
      }
    };

    connect();
    return () => { stopped = true; ctl.abort(); if (pollTimer) clearInterval(pollTimer); if (retry) clearTimeout(retry); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { board, mode, error };
}
