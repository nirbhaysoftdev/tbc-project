// src/lib/useSignedSrc.ts
//
// Every upload except a profile photo is authorised server-side, and an <img>
// cannot send a Bearer token. This hook trades a stored /uploads/... path for a
// short-lived signed URL that an <img>, <video> or <iframe> can load.
//
// Profile photos need none of this — the sign endpoint hands their plain path
// straight back, so the hook is safe to use uniformly.
//
//   const src = useSignedSrc(project.imageUrl);
//   return src ? <img src={src} alt="" /> : <div className="skeleton" />;
import { useEffect, useState } from 'react';
import { filesAPI } from './api';

const FILE_BASE = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

export function useSignedSrc(storedPath?: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!storedPath) { setSrc(null); return; }

    // An absolute URL is already hosted elsewhere (e.g. a Google avatar).
    if (/^https?:\/\//.test(storedPath)) { setSrc(storedPath); return; }

    let active = true;
    filesAPI.sign(storedPath)
      .then(({ data }) => { if (active) setSrc(`${FILE_BASE}${data.url}`); })
      .catch(() => { if (active) setSrc(null); });

    return () => { active = false; };
  }, [storedPath]);

  return src;
}
