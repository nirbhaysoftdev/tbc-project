'use client';
// src/components/projects/RichTextEditor.tsx
//
// The WYSIWYG editor behind a project's details: headings, bold, italic,
// underline, strikethrough, ordered and unordered lists, indentation,
// alignment, blockquote, code, links, tables, images and horizontal rules.
//
// Built on `contenteditable` + `document.execCommand` rather than an editor
// library, for two reasons that matter here:
//
//   - the frontend is a static export with no build-time editor plugin chain,
//     and adding a 300kB editor to the bundle for one admin-only screen is a
//     poor trade;
//   - execCommand is deprecated but is implemented by every browser this
//     portal supports, and nothing newer is as widely available.
//
// What that costs us, and how it is handled:
//
//   - execCommand emits browser-specific markup. It is normalised on the way
//     out, and sanitised again server-side on save (backend
//     services/richText.js), which is the authority - this component's output
//     is never trusted.
//   - `contenteditable` loses the caret if React re-renders the surface, so the
//     surface is written to EXACTLY ONCE per document (see `loadedFor`) and
//     every keystroke after that is reported upward without React touching the
//     DOM again.
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  /** Changes when a different document is loaded, forcing a re-seed. */
  documentKey?: string;
  placeholder?: string;
  /** Called when the admin inserts an image; resolves to a viewable URL. */
  onRequestImage?: () => Promise<string | null>;
}

const BLOCKS = [
  { value: 'p',  label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
  { value: 'blockquote', label: 'Quote' },
  { value: 'pre', label: 'Code block' },
];

// Toolbar buttons that are a single execCommand with no argument. `state` is
// the queryCommandState name used to light the button up when the caret is
// inside that formatting.
const SIMPLE_TOOLS: { cmd: string; label: string; title: string; state?: string }[] = [
  { cmd: 'bold',          label: 'B',  title: 'Bold (Ctrl+B)',      state: 'bold' },
  { cmd: 'italic',        label: 'I',  title: 'Italic (Ctrl+I)',    state: 'italic' },
  { cmd: 'underline',     label: 'U',  title: 'Underline (Ctrl+U)', state: 'underline' },
  { cmd: 'strikeThrough', label: 'S',  title: 'Strikethrough',      state: 'strikeThrough' },
];

const LIST_TOOLS = [
  { cmd: 'insertUnorderedList', label: '• List',  title: 'Bulleted list', state: 'insertUnorderedList' },
  { cmd: 'insertOrderedList',   label: '1. List', title: 'Numbered list', state: 'insertOrderedList' },
];

const ALIGN_TOOLS = [
  { cmd: 'justifyLeft',   label: '⇤', title: 'Align left' },
  { cmd: 'justifyCenter', label: '↔', title: 'Align centre' },
  { cmd: 'justifyRight',  label: '⇥', title: 'Align right' },
];

/** `<table>` markup for the table tool, styled to match `.pj-rich`. */
const tableHtml = (rows: number, cols: number) => {
  const head = `<tr>${'<th>Heading</th>'.repeat(cols)}</tr>`;
  const body = `<tr>${'<td>&nbsp;</td>'.repeat(cols)}</tr>`.repeat(Math.max(0, rows - 1));
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table><p><br></p>`;
};

export default function RichTextEditor({
  value, onChange, documentKey = 'new', placeholder = 'Describe the project…', onRequestImage,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // Which document the surface currently holds. Seeding is keyed on this
  // rather than on `value`, so typing never re-writes the DOM under the caret.
  const loadedFor = useRef<string | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [block, setBlock] = useState('p');
  const [busy, setBusy] = useState(false);

  // ── Seed the surface, once per document ─────
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    if (loadedFor.current === documentKey) return;
    el.innerHTML = value || '';
    loadedFor.current = documentKey;
    el.setAttribute('data-empty', String(!el.textContent?.trim() && !el.querySelector('img,table,hr')));
  }, [documentKey, value]);

  /** Read the surface and report it upward, normalised. */
  const publish = useCallback(() => {
    const el = surfaceRef.current;
    if (!el) return;
    el.setAttribute('data-empty', String(!el.textContent?.trim() && !el.querySelector('img,table,hr')));
    const html = el.innerHTML;
    // An empty contenteditable still contains `<br>` or an empty paragraph;
    // report that as empty so a cleared editor saves as cleared.
    onChange(/^(<br\s*\/?>|<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>|\s)*$/i.test(html) ? '' : html);
  }, [onChange]);

  /** Refresh which toolbar buttons are lit for the caret's position. */
  const syncToolbar = useCallback(() => {
    if (typeof document === 'undefined') return;
    const next: Record<string, boolean> = {};
    [...SIMPLE_TOOLS, ...LIST_TOOLS].forEach(({ state }) => {
      if (!state) return;
      try { next[state] = document.queryCommandState(state); } catch { /* unsupported */ }
    });
    setActive(next);
    try {
      const current = document.queryCommandValue('formatBlock').toLowerCase();
      setBlock(BLOCKS.some((b) => b.value === current) ? current : 'p');
    } catch { /* unsupported */ }
  }, []);

  useEffect(() => {
    const onSelection = () => {
      // Only react while the caret is actually inside this editor.
      const sel = window.getSelection();
      if (sel && surfaceRef.current?.contains(sel.anchorNode)) syncToolbar();
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [syncToolbar]);

  /**
   * Run a command against the surface.
   *
   * The surface is focused first: a toolbar button steals focus on mousedown
   * in some browsers, and execCommand against an unfocused element silently
   * does nothing.
   */
  const run = useCallback((cmd: string, arg?: string) => {
    const el = surfaceRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand(cmd, false, arg);
    } catch {
      /* A command this browser does not implement is a no-op, not a crash. */
    }
    publish();
    syncToolbar();
  }, [publish, syncToolbar]);

  const applyBlock = (tag: string) => run('formatBlock', tag === 'p' ? '<p>' : `<${tag}>`);

  const addLink = () => {
    const sel = window.getSelection();
    const selected = sel ? sel.toString() : '';
    const href = window.prompt('Link URL', 'https://');
    if (!href) return;
    // http(s) and mailto only. A `javascript:` href typed in here would be
    // stripped server-side on save, but it must not be live in the editor
    // either.
    if (!/^(https?:\/\/|mailto:)/i.test(href)) {
      window.alert('Links must start with http://, https:// or mailto:');
      return;
    }
    if (selected) {
      run('createLink', href);
    } else {
      // Nothing selected: insert the URL as its own link rather than creating
      // an empty anchor the admin cannot see or click.
      run('insertHTML', `<a href="${href.replace(/"/g, '&quot;')}">${href.replace(/</g, '&lt;')}</a>`);
    }
  };

  const addTable = () => {
    const cols = parseInt(window.prompt('Columns', '3') || '', 10);
    const rows = parseInt(window.prompt('Rows (including the header)', '3') || '', 10);
    if (!cols || !rows || cols < 1 || rows < 1) return;
    run('insertHTML', tableHtml(Math.min(rows, 30), Math.min(cols, 10)));
  };

  const addImage = async () => {
    if (!onRequestImage) {
      const src = window.prompt('Image URL', 'https://');
      if (src && /^https?:\/\//i.test(src)) run('insertHTML', `<img src="${src.replace(/"/g, '&quot;')}" alt="" />`);
      return;
    }
    setBusy(true);
    try {
      const src = await onRequestImage();
      if (src) run('insertHTML', `<img src="${src.replace(/"/g, '&quot;')}" alt="" />`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Paste as plain text.
   *
   * A paste from Word or a web page brings its own fonts, colours, class names
   * and occasionally scripts. The sanitiser on the server would strip the
   * dangerous parts, but the surviving inline styles would still look wrong
   * against this palette, so the markup is dropped here and the text kept.
   * Paragraph breaks are preserved.
   */
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const html = text
      .split(/\n{2,}/)
      .map((para) => `<p>${para
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')}</p>`)
      .join('');
    run('insertHTML', html);
  };

  // Ctrl/Cmd+B, I and U are handled natively by contenteditable; Tab has to be
  // taken over, or it leaves the editor instead of indenting a list.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      run(e.shiftKey ? 'outdent' : 'indent');
    }
  };

  return (
    <div className="pj-editor">
      <div className="pj-editor-toolbar">
        <select
          className="pj-tool-select"
          value={block}
          onChange={(e) => applyBlock(e.target.value)}
          title="Paragraph style"
          aria-label="Paragraph style"
        >
          {BLOCKS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>

        <span className="pj-tool-sep" />

        {SIMPLE_TOOLS.map((tool) => (
          <button
            key={tool.cmd}
            type="button"
            title={tool.title}
            aria-label={tool.title}
            aria-pressed={Boolean(tool.state && active[tool.state])}
            className={`pj-tool${tool.state && active[tool.state] ? ' active' : ''}`}
            // onMouseDown, not onClick: the default mousedown would move focus
            // out of the surface and collapse the selection before the command
            // could run.
            onMouseDown={(e) => { e.preventDefault(); run(tool.cmd); }}
            style={{
              fontWeight: tool.cmd === 'bold' ? 800 : 500,
              fontStyle: tool.cmd === 'italic' ? 'italic' : 'normal',
              textDecoration: tool.cmd === 'underline' ? 'underline'
                : tool.cmd === 'strikeThrough' ? 'line-through' : 'none',
            }}
          >
            {tool.label}
          </button>
        ))}

        <span className="pj-tool-sep" />

        {LIST_TOOLS.map((tool) => (
          <button
            key={tool.cmd}
            type="button"
            title={tool.title}
            aria-label={tool.title}
            aria-pressed={Boolean(tool.state && active[tool.state])}
            className={`pj-tool${tool.state && active[tool.state] ? ' active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); run(tool.cmd); }}
          >
            {tool.label}
          </button>
        ))}

        <button type="button" className="pj-tool" title="Decrease indent" aria-label="Decrease indent"
          onMouseDown={(e) => { e.preventDefault(); run('outdent'); }}>⇤|</button>
        <button type="button" className="pj-tool" title="Increase indent" aria-label="Increase indent"
          onMouseDown={(e) => { e.preventDefault(); run('indent'); }}>|⇥</button>

        <span className="pj-tool-sep" />

        {ALIGN_TOOLS.map((tool) => (
          <button key={tool.cmd} type="button" className="pj-tool" title={tool.title} aria-label={tool.title}
            onMouseDown={(e) => { e.preventDefault(); run(tool.cmd); }}>
            {tool.label}
          </button>
        ))}

        <span className="pj-tool-sep" />

        <button type="button" className="pj-tool" title="Insert link" aria-label="Insert link"
          onMouseDown={(e) => { e.preventDefault(); addLink(); }}>🔗</button>
        <button type="button" className="pj-tool" title="Remove link" aria-label="Remove link"
          onMouseDown={(e) => { e.preventDefault(); run('unlink'); }}>⛓</button>
        <button type="button" className="pj-tool" title="Insert table" aria-label="Insert table"
          onMouseDown={(e) => { e.preventDefault(); addTable(); }}>▦</button>
        <button type="button" className="pj-tool" title="Insert image" aria-label="Insert image"
          disabled={busy}
          onMouseDown={(e) => { e.preventDefault(); addImage(); }}>{busy ? '…' : '🖼'}</button>
        <button type="button" className="pj-tool" title="Horizontal rule" aria-label="Horizontal rule"
          onMouseDown={(e) => { e.preventDefault(); run('insertHorizontalRule'); }}>―</button>
        <button type="button" className="pj-tool" title="Inline code" aria-label="Inline code"
          onMouseDown={(e) => {
            e.preventDefault();
            const sel = window.getSelection();
            const text = sel ? sel.toString() : '';
            run('insertHTML', `<code>${(text || 'code').replace(/</g, '&lt;')}</code>`);
          }}>{'</>'}</button>

        <span className="pj-tool-sep" />

        <button type="button" className="pj-tool" title="Clear formatting" aria-label="Clear formatting"
          onMouseDown={(e) => { e.preventDefault(); run('removeFormat'); }}>✕ƒ</button>
      </div>

      <div
        ref={surfaceRef}
        className="pj-editor-surface pj-rich"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Project details"
        data-placeholder={placeholder}
        onInput={publish}
        onBlur={publish}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onMouseUp={syncToolbar}
        onKeyUp={syncToolbar}
      />
    </div>
  );
}
