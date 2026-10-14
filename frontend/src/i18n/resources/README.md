# Translation resources

English (`en/`) is the source of truth and the fallback. Any key missing from
another language resolves to the English string, so a partial translation is a
safe, intentional state — never a broken screen or a visible raw key.

## Coverage, by design

| Namespace    | en | it | ru | fa | ar | Note |
|--------------|----|----|----|----|----|------|
| `common`     | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `validation` | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `nav`        | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `auth`       | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `dashboard`  | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `community`  | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `landing`    | ✅ | ✅ | ✅ | ✅ | ✅ | public marketing page |
| `admin`      | ✅ | ✅ | —  | —  | —  | **English + Italian only, deliberately** |

### Why `admin` is English and Italian only

This was an explicit product decision, not an incomplete translation. The admin
console is used by a small internal team working in English and Italian, so the
other three languages are not maintained for it. A Russian, Persian or Arabic
admin sees the console in English via the normal fallback chain — the app does
not break, nothing shows a raw key, and the surrounding chrome (navigation,
language selector, dates, currency) is still fully localised.

Note that direction still applies: an admin using Arabic or Persian gets
`dir="rtl"` on the whole document, so the English admin console is laid out
right-to-left. That is intentional and correct — the chrome around it is RTL.

To add one of the missing languages later, translate `en/admin.json` into
`<lang>/admin.json`. No code change is needed; the file is already imported by
`<lang>/index.ts`.

## Plural forms

i18next v23 resolves plurals through `Intl.PluralRules`, so plural keys use ICU
category suffixes, **not** the older `_plural` suffix:

- `en`, `it`, `fa` — `_one`, `_other`
- `ru` — `_one`, `_few`, `_many`, `_other`
- `ar` — `_zero`, `_one`, `_two`, `_few`, `_many`, `_other`

A language only needs the categories its own rules can produce. Supplying
`_other` alone is valid and will be used for every count.

## What is never translated

Enum values, status tokens, category strings, routes, API field names, IBANs,
SWIFT codes, email addresses, URLs, reference codes and masked card numbers.
These are data, and several of them are compared for equality in code — see
`backend/src/services/i18n/translatable.js` for the server-side counterpart.
