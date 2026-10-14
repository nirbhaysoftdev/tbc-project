// src/services/uploadLimits.js
//
// How large an upload may be, per kind of file.
//
// One place for these numbers because the project and company media modules
// both enforce them, and two copies of a limit is how they end up disagreeing.
// The frontend has a matching copy in src/lib/uploadLimits.ts for immediate
// feedback — THIS file is the one that decides.
//
// Documents are capped far lower than video on purpose. A pitch deck or a
// trade licence is a few megabytes; an 80MB PDF is a scanned document nobody
// can read comfortably in a browser viewer anyway, and it costs that much
// again in storage, backup and every stream of it.

const MB = 1024 * 1024;

/**
 * Per-kind ceilings, keyed by the `kind` the media controllers derive from the
 * mime type. Anything absent falls back to MAX_ANY.
 */
const MAX_BY_KIND = {
  PDF:   8  * MB,   // documents: 8 MB
  DOC:   8  * MB,   // .doc / .docx: the same
  IMAGE: 10 * MB,   // generous for a banner; a photo this big is unoptimised
  VIDEO: 300 * MB,  // a presentation video genuinely needs the headroom
};

// The multer ceiling: the largest any single file may be. Multer applies one
// limit to the whole request and cannot vary it by mime type, so it is set to
// the most permissive kind and the per-kind caps above are applied once the
// file's kind is known.
const MAX_ANY = 300 * MB;

const limitFor = (kind) => MAX_BY_KIND[kind] ?? MAX_ANY;

/** "8 MB" — for an error message a person has to act on. */
const humanLimit = (bytes) => {
  const mb = bytes / MB;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
};

/**
 * Check one uploaded file against its kind's ceiling.
 * Returns null when it is fine, or a message naming the file and the limit.
 */
function checkSize(file, kind) {
  const max = limitFor(kind);
  if (file.size <= max) return null;
  return `“${file.originalname}” is ${humanLimit(file.size)}. `
       + `${kind === 'PDF' || kind === 'DOC' ? 'Documents' : `${kind} files`} `
       + `must be ${humanLimit(max)} or smaller.`;
}

module.exports = { MB, MAX_BY_KIND, MAX_ANY, limitFor, humanLimit, checkSize };
