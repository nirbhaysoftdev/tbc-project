// src/lib/openDocument.ts
// Opens a private upload (identity document, KYC scan) in a new tab.
//
// These files are authorised server-side, so the raw /uploads/... path returns
// 403 on its own. We exchange it for a short-lived signed URL first.
import { filesAPI } from './api';

const FILE_BASE = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

export async function openDocument(storedPath?: string | null) {
  if (!storedPath) return;

  // An absolute URL is already hosted elsewhere and has nothing to sign — a
  // Google account's avatar (`payload.picture`, stored verbatim on signup) is
  // the case that happens. Signing it would 400 with "path must be an
  // /uploads/... URL", which is what the admin Documents list used to show for
  // the Photo row of every member who signed up with Google.
  //
  // useSignedSrc() has had the same guard all along; only this helper was
  // missing it.
  if (/^https?:\/\//.test(storedPath)) {
    window.open(storedPath, '_blank', 'noopener,noreferrer');
    return;
  }

  // Open the tab synchronously, before awaiting: a window.open() after an
  // await is treated as an unrequested popup and gets blocked.
  const tab = window.open('', '_blank');

  try {
    const { data } = await filesAPI.sign(storedPath);
    const url = `${FILE_BASE}${data.url}`;
    if (tab) tab.location.href = url;
    else window.location.href = url;   // popup blocked: navigate instead
  } catch (e: any) {
    const msg = e?.response?.data?.error || 'This document could not be opened.';
    if (tab) tab.close();
    alert(msg);
  }
}
