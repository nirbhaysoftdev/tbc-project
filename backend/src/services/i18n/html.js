// src/services/i18n/html.js
//
// Rich-text-aware translation (requirement §9).
//
// The problem: passing a whole HTML document to a plain-text translation
// operation and trusting the result is unsafe and lossy. Providers reorder or
// drop tags, mangle attributes, translate URLs inside href, and — worse —
// whatever comes back is attacker-influenced markup that would be rendered.
//
// The approach here is "extract and restore text nodes", the second option §9
// allows, which keeps the document structure entirely under our control:
//
//   1  segment()   splits the source into tag tokens and text tokens
//   2  only text tokens that shouldTranslate() accepts are sent out
//   3  restore()   puts the returned strings back in the same slots
//   4  sanitizeRichText() runs over the result before it is ever stored
//
// Tags, attributes, href values, embedded media, entities and whitespace are
// therefore byte-identical to the English source by construction — they are
// never handed to the provider at all. The English source is never modified.
//
// This project currently stores plain text in every rich field (there is no
// WYSIWYG editor yet), so in practice `isHtml()` is false and the whole file
// short-circuits to a single string. It exists so that adding an editor later
// does not require revisiting the translation pipeline.

const sanitizeHtml = require('sanitize-html');
const { shouldTranslate } = require('./content');

/**
 * The application's sanitisation policy for translated rich text.
 *
 * There was no existing policy to inherit (nothing in the codebase renders raw
 * HTML today), so this is a deliberately small allowlist covering what a
 * business-content editor produces: formatting, headings, lists, tables,
 * links and images. No <script>, <style>, <iframe>, <object>, no event
 * handlers, no inline styles, and links are forced to safe schemes.
 */
const SANITIZE_POLICY = {
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel', 'dir', 'lang'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    col: ['span'],
    // `dir` and `lang` are allowed everywhere because they are exactly what
    // mixed-direction content needs: an English quotation inside an Arabic
    // paragraph is marked up, not restyled.
    '*': ['dir', 'lang'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  // Keeps relative /uploads/... image paths working, which is how this
  // application already references its own files.
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  // A target="_blank" without this is a tabnabbing vector.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
  disallowedTagsMode: 'discard',
};

/** Cheap structural test: does this value contain markup we must preserve? */
function isHtml(value) {
  return typeof value === 'string' && /<[a-z!/][^>]*>/i.test(value);
}

/**
 * Split HTML into an ordered token list.
 *
 * Tokens are either {tag} — everything from `<` to the matching `>`, including
 * comments and doctypes — or {text}. Reassembling the tokens in order
 * reproduces the input exactly, which is the property the restore step relies
 * on.
 *
 * A regex is sufficient and appropriate here precisely BECAUSE this is not
 * parsing: it never interprets nesting, never builds a tree and never makes a
 * security decision. sanitizeRichText() does that, with a real parser.
 */
function segment(html) {
  const tokens = [];
  const re = /<[^>]*>/g;
  let last = 0;
  let match;

  while ((match = re.exec(html)) !== null) {
    if (match.index > last) {
      tokens.push({ type: 'text', value: html.slice(last, match.index) });
    }
    tokens.push({ type: 'tag', value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < html.length) {
    tokens.push({ type: 'text', value: html.slice(last) });
  }
  return tokens;
}

/**
 * The translatable text slices of an HTML document, with their token indexes.
 *
 * Leading and trailing whitespace is held back in `prefix`/`suffix` rather than
 * sent to the provider, because providers routinely trim and that would silently
 * close up the space between two inline elements.
 */
function extractTextNodes(html) {
  const tokens = segment(html);
  const nodes = [];

  tokens.forEach((token, index) => {
    if (token.type !== 'text') return;
    const value = token.value;
    if (!shouldTranslate(value)) return;

    const leading = value.match(/^\s*/)[0];
    const trailing = value.match(/\s*$/)[0];
    nodes.push({
      index,
      text: value.slice(leading.length, value.length - trailing.length),
      prefix: leading,
      suffix: trailing,
    });
  });

  return { tokens, nodes };
}

/**
 * Rebuild the document with translated text in place of the originals.
 *
 * `translations` is positional: translations[i] belongs to nodes[i]. A null,
 * undefined or empty entry leaves that node's English text untouched, so a
 * partially translated document degrades to mixed English rather than losing
 * content.
 */
function restoreTextNodes(tokens, nodes, translations) {
  const out = tokens.map((t) => t.value);
  nodes.forEach((node, i) => {
    const translated = translations[i];
    if (typeof translated !== 'string' || !translated.trim()) return;
    out[node.index] = `${node.prefix}${translated}${node.suffix}`;
  });
  return out.join('');
}

/** Apply the policy above. Always called before a rich value is stored. */
function sanitizeRichText(html) {
  if (typeof html !== 'string' || !html) return '';
  return sanitizeHtml(html, SANITIZE_POLICY);
}

/**
 * Translate one value, preserving structure if it has any.
 *
 * `translateBatch` is injected (it is the provider's batch method) so this
 * module stays free of provider knowledge and is trivially testable with a
 * fake.
 *
 * Plain text takes the fast path: one string in, one string out, no
 * sanitisation, because it is not markup and will not be rendered as such.
 */
async function translateValue({ value, format, targetLanguage, translateBatch }) {
  if (typeof value !== 'string' || !value.trim()) return value;

  const treatAsHtml = format === 'html' && isHtml(value);

  if (!treatAsHtml) {
    if (!shouldTranslate(value)) return value;
    const [translated] = await translateBatch([value], targetLanguage, 'text');
    return typeof translated === 'string' && translated.trim() ? translated : value;
  }

  const { tokens, nodes } = extractTextNodes(value);
  // Markup with no translatable prose (an image-only figure, a bare table
  // skeleton) needs no provider call at all.
  if (!nodes.length) return sanitizeRichText(value);

  const translated = await translateBatch(
    nodes.map((n) => n.text),
    targetLanguage,
    'text',
  );

  const rebuilt = restoreTextNodes(tokens, nodes, translated);
  return sanitizeRichText(rebuilt);
}

module.exports = {
  isHtml,
  segment,
  extractTextNodes,
  restoreTextNodes,
  sanitizeRichText,
  translateValue,
  SANITIZE_POLICY,
};
