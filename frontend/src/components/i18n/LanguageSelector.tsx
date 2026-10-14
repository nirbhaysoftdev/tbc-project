'use client';
// src/components/i18n/LanguageSelector.tsx
//
// The one language selector, used on the landing page, the login / register /
// password-recovery pages, the authenticated topbar and the community nav
// (requirement §4). There is no second implementation and no per-language
// variant of any page — picking a language re-renders the page you are on.
//
// Accessibility: this is the WAI-ARIA listbox pattern, not a styled <select>,
// because the selected language has to show its own glyph set (Русский, فارسی,
// العربية) and a native <select> cannot be styled to match the design system
// across browsers. Keyboard support is therefore implemented in full:
//
//   Enter / Space / ArrowDown   open, focus the active option
//   ArrowUp / ArrowDown         move between options
//   Home / End                  first / last option
//   Enter / Space               choose the focused option
//   Escape                      close, return focus to the trigger
//   Tab or outside click        close without changing anything
//
// The trigger is a real <button>, options are role="option" with
// aria-selected, and the list is labelled, so a screen reader announces both
// the current language and the choice being made.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useI18n } from '@/i18n/I18nProvider';
import type { LanguageCode } from '@/i18n/languages';

type Variant = 'bar' | 'panel' | 'compact';

interface Props {
  /**
   * `bar`     — inline in a dark navigation bar (landing nav, community nav)
   * `panel`   — on an auth card, where there is no surrounding chrome
   * `compact` — icon + code only, for the narrow authenticated topbar
   */
  variant?: Variant;
  className?: string;
  /** Where the list opens. Defaults to below the trigger. */
  align?: 'start' | 'end';
}

export default function LanguageSelector({
  variant = 'bar',
  className = '',
  align = 'end',
}: Props) {
  const { t } = useTranslation('common');
  const { language, languages, definition, setLanguage, switching } = useI18n();

  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(() =>
    Math.max(0, languages.findIndex((l) => l.code === language)),
  );

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const listboxId = useId();

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const choose = useCallback(
    (code: LanguageCode) => {
      setLanguage(code);
      close(true);
    },
    [setLanguage, close],
  );

  // Keep the highlighted option in sync when the language changes elsewhere
  // (profile load, another selector instance on the same page).
  useEffect(() => {
    const idx = languages.findIndex((l) => l.code === language);
    if (idx >= 0) setFocusIndex(idx);
  }, [language, languages]);

  // Move DOM focus onto the highlighted option so the screen-reader cursor and
  // the visual highlight never disagree.
  useEffect(() => {
    if (!open) return;
    optionRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  // Outside click and Escape close the list. Bound only while open, and
  // `pointerdown` rather than `click` so the list is gone before a click lands
  // on whatever is underneath it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, close]);

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onOptionKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, index: number) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIndex((i) => (i + 1) % languages.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIndex((i) => (i - 1 + languages.length) % languages.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusIndex(languages.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(languages[index].code);
        break;
      case 'Tab':
        // Let focus leave naturally, but do not leave an orphaned open list.
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`lang-select lang-select--${variant} ${className}`.trim()}
      data-open={open || undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        className="lang-select-trigger"
        // Buttons with aria-haspopup="listbox" are how a combobox-like trigger
        // is announced; the label carries the current value so the control is
        // self-describing even when collapsed.
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={t('language.current', { language: definition.nativeName })}
        aria-busy={switching || undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <GlobeIcon />
        <span className="lang-select-value" lang={definition.code}>
          {variant === 'compact' ? definition.code.toUpperCase() : definition.nativeName}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className={`lang-select-list lang-select-list--${align}`}
          aria-label={t('language.selectorLabel')}
          aria-activedescendant={`${listboxId}-${languages[focusIndex]?.code}`}
        >
          {languages.map((l, i) => {
            const selected = l.code === language;
            return (
              <li
                key={l.code}
                id={`${listboxId}-${l.code}`}
                ref={(el) => { optionRefs.current[i] = el; }}
                role="option"
                aria-selected={selected}
                // Only the highlighted option is tabbable, per the listbox
                // pattern — arrow keys move within, Tab leaves the widget.
                tabIndex={i === focusIndex ? 0 : -1}
                className={`lang-select-option${selected ? ' is-selected' : ''}`}
                // `lang` and `dir` per option so a screen reader switches voice
                // and the RTL names render correctly inside an LTR page.
                lang={l.code}
                dir={l.dir}
                onClick={() => choose(l.code)}
                onKeyDown={(e) => onOptionKeyDown(e, i)}
                onMouseEnter={() => setFocusIndex(i)}
              >
                <span className="lang-select-option-name">{l.nativeName}</span>
                {selected && <CheckIcon />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      // A chevron points down/up, not left/right, so it is direction-neutral
      // and must NOT be mirrored in RTL (§10).
      style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.18s ease' }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
