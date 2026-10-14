// src/services/richText.js
//
// The project detail body is authored in a WYSIWYG editor and rendered with
// dangerouslySetInnerHTML, so it is stored HTML — the one place in this API
// where a client sends markup that another member's browser will execute.
//
// It is sanitised here, on write, rather than on render:
//   - an admin pasting from Word brings `<script>`, `<o:p>`, style blocks and
//     event handlers along with the text;
//   - sanitising on render would mean every read paying for it, and would
//     leave the dangerous version sitting in the database;
//   - the editor is admin-only today, but "only admins can reach it" is an
//     authorisation fact that must not be what keeps stored XSS out.
//
// The allowlist covers what the editor's toolbar can produce — headings, bold,
// italic, underline, lists, tables, links, images, quotes, code — and nothing
// else. Anything outside it is dropped, tags and attributes alike.
const sanitizeHtml = require('sanitize-html');

// Images in the body are project media, which is served by the authenticated
// streaming endpoint. A `data:` image is allowed because that is what a paste
// from the clipboard produces before it is uploaded; everything else, notably
// `javascript:`, is refused by the scheme allowlist below.
const OPTIONS = {
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'mark', 'small',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  ],
  allowedAttributes: {
    a:   ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    td:  ['colspan', 'rowspan', 'style'],
    th:  ['colspan', 'rowspan', 'scope', 'style'],
    table: ['style'],
    col: ['span', 'style'],
    '*': ['style'],
  },
  // Inline styles are how the editor records alignment and simple table
  // borders. Only these properties survive, with values matched against a
  // pattern, so `style` cannot carry `url(...)`, `expression(...)` or a
  // `position: fixed` overlay onto the page around it.
  allowedStyles: {
    '*': {
      'text-align':       [/^(left|right|center|justify|start|end)$/],
      'font-weight':      [/^(normal|bold|[1-9]00)$/],
      'font-style':       [/^(normal|italic)$/],
      'text-decoration':  [/^(none|underline|line-through)$/],
      'color':            [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, /^rgba?\(\s*[\d.,\s%]+\)$/],
      'background-color': [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, /^rgba?\(\s*[\d.,\s%]+\)$/],
      'width':            [/^\d{1,3}(?:\.\d+)?(?:%|px)$/],
      'border':           [/^[\w\s#().,%-]{0,40}$/],
      'border-collapse':  [/^(collapse|separate)$/],
      'padding':          [/^[\d.\spx%]{1,20}$/],
      'margin-left':      [/^\d{1,3}(?:px|em)$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  // A link out of the portal opens in a new tab and must not hand the opener
  // window to the destination.
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: 'a',
      attribs: attribs.href
        ? { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' }
        : attribs,
    }),
    // The editor emits <font> on some browsers for colour changes; keep the
    // text, drop the deprecated tag.
    font: 'span',
  },
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
};

/**
 * Sanitise editor HTML for storage.
 * Returns null for anything that carries no content, so "the admin cleared the
 * editor" and "the admin never filled it in" are the same stored value rather
 * than an empty `<p><br></p>` that renders as a stray blank line.
 */
function sanitizeRichText(html) {
  if (html === null || html === undefined) return null;
  if (typeof html !== 'string') return null;

  const clean = sanitizeHtml(html, OPTIONS).trim();
  if (!clean) return null;

  // Markup with no words and no media in it is empty for our purposes.
  const hasText  = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} })
                     .replace(/&nbsp;|\s/g, '')
                     .length > 0;
  const hasMedia = /<(img|table|hr)\b/i.test(clean);
  return hasText || hasMedia ? clean : null;
}

/**
 * Plain text from stored HTML, for the listing's short description, search and
 * the translation registry — none of which should carry markup.
 */
function richTextToPlain(html, { limit } = {}) {
  if (!html) return '';
  const text = sanitizeHtml(String(html), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limit || text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

module.exports = { sanitizeRichText, richTextToPlain };
