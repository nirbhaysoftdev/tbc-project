'use client';
// src/components/pwa/ServiceWorkerRegistrar.tsx
//
// Renders nothing. It exists so that importing src/lib/pwa.ts happens on the
// very first client render of every page, which is what arms the
// `beforeinstallprompt` listener before the browser fires it, and so that the
// service worker is registered once for the whole application rather than per
// page. It sits in the root layout for both reasons.
import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pwa';

export default function ServiceWorkerRegistrar() {
  useEffect(() => { registerServiceWorker(); }, []);
  return null;
}
