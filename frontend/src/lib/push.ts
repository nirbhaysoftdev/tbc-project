// src/lib/push.ts
//
// Opting this device in or out of push. The browser, not us, owns the
// permission: we can only ask, and a "Block" is final until the member changes
// it in site settings - which is why the prompt asks once, on a tap, never on
// page load.
//
// iOS only supports push from a web app that has been added to the Home
// Screen (16.4+). In a normal Safari tab `PushManager` does not exist and
// pushSupport() says so, so the UI can point at "Add to Home Screen" instead.
import { pushAPI } from '@/lib/api';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'supported';
}

export const pushPermission = (): NotificationPermission | 'unsupported' =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
  return navigator.serviceWorker.ready;
}

export async function isSubscribed(): Promise<boolean> {
  if (pushSupport() !== 'supported') return false;
  try { return !!(await (await registration()).pushManager.getSubscription()); } catch { return false; }
}

/** Ask permission, subscribe this browser, and tell the server. Throws on refusal. */
export async function enablePush(): Promise<void> {
  if (pushSupport() !== 'supported') throw new Error('Push is not supported on this device');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were blocked');

  const reg = await registration();
  const { data } = await pushAPI.getKey();
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(data.publicKey) });
  await pushAPI.subscribe(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  await pushAPI.unsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}

/**
 * Re-send the existing subscription to the server. Cheap, and it re-links the
 * browser to whoever is signed in now - a shared device otherwise keeps
 * delivering the previous member's alerts.
 */
export async function syncPush(): Promise<void> {
  if (pushSupport() !== 'supported' || Notification.permission !== 'granted') return;
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) await pushAPI.subscribe(sub.toJSON());
  } catch { /* best effort */ }
}
