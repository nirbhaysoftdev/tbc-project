// src/lib/uploadLimits.ts
//
// How large an upload may be, per kind of file.
//
// A mirror of backend/src/services/uploadLimits.js. The server is the one that
// decides — this copy exists so an admin who picks an 80MB PDF is told
// immediately, instead of waiting for 80MB to upload and then being refused.
// If the two ever disagree the server wins, and the member sees its message.
//
// Keep the numbers in step with the backend file. They are duplicated rather
// than fetched because a size check has to be synchronous, at the moment a
// file is chosen.

const MB = 1024 * 1024;

export const MAX_BY_KIND = {
  DOCUMENT: 8 * MB,    // PDF, .doc, .docx
  IMAGE:    10 * MB,
  VIDEO:    300 * MB,
} as const;

type Kind = keyof typeof MAX_BY_KIND;

const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Which ceiling applies to a file the user just chose. */
export function kindOfFile(file: File): Kind {
  if (file.type.startsWith('image/')) return 'IMAGE';
  if (file.type.startsWith('video/')) return 'VIDEO';
  if (DOCUMENT_TYPES.includes(file.type)) return 'DOCUMENT';
  // An unknown type is held to the document limit — the strictest sensible
  // default, and the server will reject the type itself anyway.
  return 'DOCUMENT';
}

/** "8 MB", "1.5 MB" — for a message someone has to act on. */
export const humanSize = (bytes: number) => {
  const mb = bytes / MB;
  if (mb >= 1) return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const LABEL: Record<Kind, string> = {
  DOCUMENT: 'Documents',
  IMAGE: 'Images',
  VIDEO: 'Videos',
};

/**
 * Check a set of chosen files against their ceilings.
 *
 * Returns a message naming every file that is too large, or null when they all
 * pass. The whole selection is reported at once: telling someone about the
 * first of four oversized files just makes them try again three more times.
 */
export function checkFileSizes(files: File[] | FileList | null): string | null {
  if (!files) return null;
  const problems: string[] = [];

  for (const file of Array.from(files)) {
    const kind = kindOfFile(file);
    const max = MAX_BY_KIND[kind];
    if (file.size > max) {
      problems.push(`“${file.name}” is ${humanSize(file.size)} — `
        + `${LABEL[kind].toLowerCase()} must be ${humanSize(max)} or smaller.`);
    }
  }

  return problems.length > 0 ? problems.join(' ') : null;
}

/** "PDF and Word files up to 8 MB" — for a hint beside an upload control. */
export const documentLimitHint = `up to ${humanSize(MAX_BY_KIND.DOCUMENT)}`;
export const imageLimitHint    = `up to ${humanSize(MAX_BY_KIND.IMAGE)}`;
export const videoLimitHint    = `up to ${humanSize(MAX_BY_KIND.VIDEO)}`;
