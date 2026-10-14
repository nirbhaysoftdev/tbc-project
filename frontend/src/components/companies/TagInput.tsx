'use client';
// src/components/companies/TagInput.tsx
//
// A free-text multi-value input, used for a company's locations.
//
// Not MemberSelect: locations are typed, not searched, and they are plain
// strings rather than people. It borrows MemberSelect's token styling so the
// two look like one control family.
import React, { useState } from 'react';

export default function TagInput({
  value, onChange, placeholder = 'Type and press Enter…', id, max = 30,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    // A pasted "Milan, Dubai, Rome" becomes three tags rather than one.
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const part of parts) {
      if (next.length >= max) break;
      // Case-insensitive de-dupe: "milan" and "Milan" are one location, and
      // the first spelling entered is the one kept.
      if (next.some((v) => v.toLowerCase() === part.toLowerCase())) continue;
      next.push(part.slice(0, 160));
    }
    onChange(next);
    setDraft('');
  };

  const remove = (tag: string) => onChange(value.filter((v) => v !== tag));

  return (
    <div>
      <input
        id={id}
        className="pj-input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            remove(value[value.length - 1]);
          }
        }}
        // Committed on blur as well as on Enter: a half-typed value that
        // silently disappears when the admin clicks Save is a bug report.
        onBlur={() => add(draft)}
      />

      {value.length > 0 && (
        <div className="pj-picker-selected">
          {value.map((tag) => (
            <span className="pj-token" key={tag}>
              <span>{tag}</span>
              <button type="button" aria-label={`Remove ${tag}`} onClick={() => remove(tag)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
