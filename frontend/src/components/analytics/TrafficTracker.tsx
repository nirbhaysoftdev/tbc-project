'use client';
// src/components/analytics/TrafficTracker.tsx
//
// Mounted once in the root layout. Renders nothing; reports each page shown, a
// beat every BEAT_MS while the tab is visible, and the end of the visit. See
// src/lib/tracker.ts for what is and is not sent.
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { BEAT_MS, sendBeat, trackingAllowed } from '@/lib/tracker';

export default function TrafficTracker() {
  const pathname = usePathname() || '/';
  const current = useRef(pathname);
  current.current = pathname;

  // A page view per navigation. The first one opens the session server-side.
  useEffect(() => { sendBeat('view', pathname); }, [pathname]);

  useEffect(() => {
    if (!trackingAllowed()) return undefined;
    // Beats only from a visible tab: a forgotten background tab is not a
    // person "currently browsing", and would hold the live count up forever.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') sendBeat('beat', current.current);
    }, BEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') sendBeat('beat', current.current); };
    const onHide = () => sendBeat('end', current.current);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  return null;
}
