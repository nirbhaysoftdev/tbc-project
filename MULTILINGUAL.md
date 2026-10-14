# Multilingual system

Five languages — English (`en`), Italian (`it`), Russian (`ru`), Persian (`fa`),
Arabic (`ar`) — across one set of pages and one set of components. There are no
per-language routes, no duplicated components and no copies of the site.
Switching language re-renders the page you are on; the URL never changes.

English is the default and the fallback everywhere.

---

## How it fits together

Two mechanisms, because the two kinds of text have different problems.

**Static interface text** — buttons, labels, headings, validation messages,
navigation, the landing page copy — ships as i18next resource files in
`frontend/src/i18n/resources/<lang>/`. It costs nothing to run, needs no
network call, and switches instantly.

**Dynamic database content** — deal-room project titles and descriptions,
events, feed posts, milestones, notifications — is translated by a backend
service and stored in the `translations` table, keyed to the exact English text
it was made from. The API serves the requested language and falls back to
English whenever a translation is missing, outdated or failed.

```
                        ┌───────────────────────────────┐
  static UI text ──────▶│ i18next bundles (committed)   │──▶ instant, free
                        └───────────────────────────────┘
                        ┌───────────────────────────────┐
  admin saves content ─▶│ content_versions → jobs       │
                        │ → worker → translations table │──▶ served per request
                        └───────────────────────────────┘
```

---

## Cost

**The default configuration costs nothing.** `TRANSLATION_PROVIDER=stub` makes
no network call to any provider.

In that mode the five-language UI is fully working — every button, label,
message and the whole landing page are translated, because those translations
are committed to the repo. Only *database content an admin typed* stays
English. Jobs are still queued and recorded, so the admin stats endpoint shows
exactly what would be translated once a provider is configured.

To get real translation of database content:

| Provider | Cost | Notes |
|---|---|---|
| `stub` | **free** | Default. No network, no translation of DB content. |
| `libretranslate` | **free** | Self-hosted. Recommended free option. Lower quality than the paid ones, weakest on Persian. |
| `google` | paid, per character | Google Cloud Translation v2. Supports all four targets. |
| `deepl` | paid (free tier) | Best for Italian/Russian. **Does not support Persian** — `fa` jobs fail permanently and stay English. |

Free self-hosted setup:

```bash
docker run -d --name libretranslate -p 5050:5000 \
  libretranslate/libretranslate --load-only en,it,ru,fa,ar
```

then in `backend/.env`:

```
TRANSLATION_PROVIDER=libretranslate
LIBRETRANSLATE_URL=http://localhost:5050
```

Provider credentials are read only on the server. The frontend has no idea
which provider is configured.

---

## Language coverage, by design

| Namespace | en | it | ru | fa | ar |
|---|---|---|---|---|---|
| `common`, `validation`, `nav`, `auth`, `dashboard`, `community`, `landing` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | — | — | — |

**The admin console is maintained in English and Italian only.** This is a
product decision, not an incomplete translation. A Russian, Persian or Arabic
admin sees the console in English through the normal fallback chain — nothing
breaks and no raw keys appear. The surrounding chrome (navigation, selector,
dates, currency) is still fully localised, and direction still applies: an
Arabic admin gets a right-to-left layout with English console text.

To add a missing language later: translate `en/admin.json` into
`<lang>/admin.json`. No code change — the file is already imported.

---

## How a language is chosen

Decided in one place, `frontend/src/i18n/preference.ts`. Strongest wins:

1. **Selector click in this session** — beats everything, including a profile
   value that arrives afterwards from a slow `/auth/me`.
2. **Signed-in user's saved `locale`** — follows them across devices.
3. **An explicit selector click from a previous visit** (localStorage).
4. **Browser language** (`navigator.languages`, in the user's own order).
5. **A previously detected (not chosen) language.**
6. **IP country** — a *suggestion* only, and only when nothing above is known.
7. **English.**

The rule that matters: automatic detection can never overwrite a manual
choice. localStorage records whether a language was *chosen* or merely
*detected*, and once chosen it stays chosen.

### IP detection

`GET /api/i18n/suggest` reads the country from proxy headers the stack already
receives (`CF-IPCountry`, `X-Vercel-IP-Country`, `X-Geo-Country`,
`X-Country-Code`) and maps it to a language. There is **no geolocation
provider, no API key and no per-request lookup**. If no header is present the
answer is "no suggestion" and browser detection takes over. VPNs, proxies, Tor
(`T1`), unknown countries (`XX`) and request failures all produce the same
harmless null. The result is cached in `sessionStorage`, so it is called at
most once per session, is never awaited before first paint, and cannot block
or break the app.

### Where it is stored

| Where | What | Why |
|---|---|---|
| `localStorage.tbc_i18n` | `{lang, explicit}` | the chosen-vs-detected distinction |
| cookie `tbc_lang` | the bare code | so the API can read a language even without a header |
| `users.locale` | the code | follows the member across devices |

Nothing beyond a two-letter code is stored.

---

## Right-to-left

Persian and Arabic render right-to-left; English, Italian and Russian
left-to-right. `I18nProvider` sets `lang`, `dir` and `data-lang` on `<html>` in
one effect — **there is no direction logic in any page or component**, and no
RTL-specific component anywhere.

Layout follows from that single `dir` attribute because the CSS uses logical
properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`)
rather than physical ones.

Two helper classes exist for what logical properties cannot express:

- `.rtl-mirror` — for genuinely directional **icons** (forward arrows, back
  chevrons, the send arrow). Never put this on an element containing text; it
  would mirror the text too.
- `.ltr-embed` — for Latin-script runs that must keep their own order inside
  RTL prose: **IBANs, SWIFT codes, email addresses, phone numbers, currency
  amounts, reference codes, masked card numbers**. A bidi-reordered IBAN is a
  failed payment.

Logos, charts, maps, brand marks and `<canvas>` are explicitly opted out of
mirroring.

**Numerals** are Western digits in all five languages (`-u-nu-latn` for `fa`
and `ar`). This is deliberate: the product is euro-denominated finance whose
figures sit beside IBANs and reference codes that are themselves Latin-script,
and mixing numeral systems inside one balance table makes amounts hard to
compare. Surrounding prose is still fully translated and still reads RTL.
Change `NUMBERING_OVERRIDE` in `frontend/src/i18n/format.ts` to reverse this.

---

## Database

One migration: `backend/prisma/migrations/20261013120000_add_translation_store`.

Purely additive — one nullable column and three new tables. No existing column
is altered, renamed or dropped, and no existing row changes meaning, so it is
safe to apply to production with live data. Every statement is guarded
(`IF NOT EXISTS`, `DO` blocks for the enums) so a re-run cannot fail.

| Object | Purpose |
|---|---|
| `users.locale` | saved UI language. Nullable, **no default** — NULL means "never chosen", which keeps browser detection in play. |
| `translations` | the current translation of one field of one record into one language |
| `translation_jobs` | pending translation work (this is the queue) |
| `content_versions` | the English source version and per-field hashes of a record |

No business model gains a per-language column and no record is duplicated per
language. Translations live beside the data in one polymorphic table keyed by
`(entityType, entityId, field, language)`. That shape was chosen over
`title_it` / `title_ru` columns because the set of translatable *fields*
changes far more often than the set of languages, and a new translatable model
then needs no migration at all — only an entry in
`backend/src/services/i18n/translatable.js`.

The trade-off is deliberate: `entityId` cannot be a foreign key across six
tables, so orphans are swept by `pruneOrphans()` (hourly, and safe to run by
hand) rather than by a cascade.

### Applying it

```bash
cd backend
npx prisma migrate deploy      # production-safe
```

Per this repo's `CLAUDE.md`: never `db push`, never `db:reset`, never
`db:migrate` against production.

> **Note:** the dev database has a pre-existing drift unrelated to this work —
> an empty, unreferenced `investment_projects` table that no migration created.
> It was left untouched. `prisma migrate dev` will want to reset the database
> because of it; use `migrate deploy` instead, as above.

### Reverting

Prisma does not generate down-migrations, so the rollback SQL is recorded in a
comment at the end of the migration file. It drops only what the migration
creates. Dropping `users.locale` discards saved preferences; members simply
fall back to browser detection.

---

## Translation jobs

**There is no Redis and no separate worker process.** The queue is a Postgres
table and the worker is an interval inside the API process. The workload does
not justify more: rows only arrive when an admin saves content.

### When English content is saved

```
1. the English row is committed            ← always succeeds first
2. registerSource() hashes every translatable field
3. it compares against the previous version's hashes
4. the source version is incremented if anything changed
5. translations of the CHANGED fields are marked OUTDATED
6. one job per (changed field × target language) is queued
7. the worker translates and stores the result against that source version
```

**An admin save can never fail because of translation.** `registerSource()`
catches everything and degrades to "English only".

A save that changes nothing relevant — a status flip, a `raisedAmount` update —
queues nothing. A save that edits only the title does not re-translate a
4,000-character description.

### Guarantees

- **An older job cannot overwrite a newer translation.** Each job carries the
  source version it was made for; a result for an older version is discarded.
- **A machine job never overwrites human-reviewed text.**
- **Retrying cannot duplicate a row.** The write is an upsert against a unique
  index on `(entityType, entityId, field, language)`.
- **Concurrent requests for the same content collapse onto one job**, via a
  unique index that includes the source hash.
- **Stale translations are never served.** The read path re-hashes the live
  English text and compares; a mismatch serves English even if the job that
  should have marked it outdated never ran.
- **Retries are bounded** — exponential backoff with jitter, then `DEAD`. A
  permanent error (bad credentials, unsupported language) goes straight to
  `DEAD` instead of burning five attempts.
- **A killed process strands nothing** — a job held `RUNNING` past
  `TRANSLATION_STALE_LOCK_MS` is reclaimed.
- **Identifiers are never translated.** URLs, email addresses, enum values,
  reference codes, UUIDs, numbers and empty strings are filtered out before
  any provider call.
- **Private data is never sent to a provider.** Member-to-member messages,
  transactions, withdrawals, KYC documents and contact details are excluded
  from the registry entirely.
- **Logs carry no content** — entity id, field, language, provider, attempt
  and error only.

### Rich text

`services/i18n/html.js` extracts and restores text nodes rather than passing
markup to the provider. Tags, attributes, `href` values, embedded media and
entities are byte-identical to the English source *by construction* — they are
never sent out. The result is sanitised with `sanitize-html` against a small
allowlist before storage (no `<script>`, no inline styles, no event handlers,
safe link schemes only, `rel="noopener noreferrer"` forced on `target=_blank`).

The app currently stores plain text in every rich field, so this path is
dormant; it exists so adding a WYSIWYG editor later needs no pipeline change.

### Operating it

```bash
# queue depth and coverage per language   (admin only)
GET  /api/i18n/admin/stats

# re-queue dead jobs, optionally narrowed  (admin only)
POST /api/i18n/admin/retry
     { "entityType": "Project", "entityId": "...", "language": "it" }

# record a human-reviewed translation      (admin only)
PUT  /api/i18n/admin/review
     { "entityType": "Project", "entityId": "...",
       "field": "title", "language": "it", "value": "..." }
```

A `HUMAN_REVIEWED` translation is never overwritten by a later machine job,
which is what makes review durable for legal and financial copy.

---

## API

Language comes from `Accept-Language` (quality values honoured), or `?lang=`,
or the `tbc_lang` cookie, resolved once by `middleware/language.js` onto
`req.language`. Every value is validated against the allowlist. Responses carry
`Content-Language` and `Vary: Accept-Language`, so a proxy cannot serve an
Italian body to a Russian request.

The frontend's axios interceptor sends the language i18next has actually
activated, so the header and the on-screen UI can never disagree.

Response shapes are unchanged — translated fields are substituted in place.
Localised payloads carry an extra `_i18n` descriptor so a client can tell what
it is looking at:

```json
"_i18n": {
  "language": "it",
  "complete": false,
  "translated": true,
  "machine": true,
  "fields": { "title": "translated", "description": "english" }
}
```

Authorisation runs before any of this; a member's notifications are localised
for that member only and nothing is cached across users.

New endpoints:

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/i18n/suggest` | public, rate-limited | country → language hint |
| `GET /api/i18n/languages` | public | the catalogue |
| `PATCH /api/profile/language` | member | save own preference |
| `GET /api/i18n/admin/stats` | admin | queue depth and coverage |
| `POST /api/i18n/admin/retry` | admin | re-queue dead jobs |
| `PUT /api/i18n/admin/review` | admin | record a reviewed translation |

`PATCH /api/profile/language` lives on the existing profile resource rather
than a new one: it is one more field on the caller's own record. It can only
ever write the caller's row — there is no `:id`.

---

## Working on the translations

```
frontend/src/i18n/
  languages.ts          the five languages — the single source of truth
  index.ts              i18next config, namespaces, lazy loading
  preference.ts         storage and the precedence rules
  format.ts             locale-aware currency / number / date formatting
  I18nProvider.tsx      language state, document lang + dir
  resources/
    README.md           coverage policy and plural-form notes
    en/ it/ ru/ fa/ ar/ one JSON per namespace
```

English is bundled statically — `fallbackLng` only works if the fallback is
already in memory. The other four languages are **code-split and fetched on
demand**: switching to Italian loads one chunk once, and until it arrives
i18next serves English, so the UI is never blank and never shows raw keys. A
failed chunk load is swallowed and leaves the page in English.

Adding a string:

1. add the key to `en/<namespace>.json`
2. add it to the other languages (`it` only, for `admin`)
3. use it: `t('namespace:some.key')`

**Plural forms** use ICU category suffixes, not `_plural`:
`en`/`it`/`fa` need `_one` and `_other`; `ru` needs `_one`, `_few`, `_many`,
`_other`; `ar` needs up to six. i18next picks the form through
`Intl.PluralRules`, so `{{count}}` is correct in every language without
English-shaped `count === 1 ? … : …` logic in components.

**Never translate:** enum values, status tokens, category strings, routes, API
field names, asset paths, company and brand names, IBANs, SWIFT codes, email
addresses, URLs, reference codes. Several of these are compared for equality in
code; translating the stored value breaks filters and admin views. The pattern
throughout is that `value=` stays the raw enum and only the visible label is
translated.

### Checking consistency

```bash
cd frontend/src/i18n/resources
python3 - <<'PY'
import json, pathlib
def flat(d,p=''):
    o={}
    for k,v in d.items():
        key=f'{p}{k}'
        o.update(flat(v,key+'.')) if isinstance(v,dict) else o.__setitem__(key,v)
    return o
def norm(s):
    for suf in ('_zero','_one','_two','_few','_many','_other'):
        if s.endswith(suf): return s[:-len(suf)]
    return s
for ns in ['common','validation','nav','auth','dashboard','community','admin','landing']:
    en={norm(k) for k in flat(json.loads((pathlib.Path('en')/f'{ns}.json').read_text()))}
    for lng in ['it','ru','fa','ar']:
        if ns=='admin' and lng!='it': continue
        d=flat(json.loads((pathlib.Path(lng)/f'{ns}.json').read_text())); d.pop('_comment',None)
        miss=en-{norm(k) for k in d}
        print(f'{lng}/{ns}: {"OK" if not miss else f"MISSING {sorted(miss)[:5]}"}')
PY
```

---

## Deploying

No change to the deploy procedure beyond the migration. The existing steps in
`CLAUDE.md` still apply in full — including the rsync, which is not optional:

```bash
cd /var/www/tbc-project && git pull origin main

cd backend
npm install
npx prisma migrate deploy        # applies the translation store
pm2 restart tbc-api

cd ../frontend
npm install && rm -rf .next out && npm run build
rsync -a --delete out/ /var/www/tbc-project/frontend-dist/
```

Set `TRANSLATION_PROVIDER` in `backend/.env`. Leaving it unset is fine and
costs nothing — see **Cost** above.

---

## Dependencies added

| Package | Where | Why |
|---|---|---|
| `i18next` | frontend | the translation engine |
| `react-i18next` | frontend | React bindings, re-render on language change |
| `i18next-browser-languagedetector` | frontend | browser-language input to the precedence chain |
| `sanitize-html` | backend | sanitises translated rich text before storage |

No Redis, no queue library, no geolocation SDK, no provider SDK — the
providers are plain `fetch` calls.

---

## Known limitations

- **Database content is not translated in the default configuration.** With
  `TRANSLATION_PROVIDER=stub` the static UI is fully multilingual but
  admin-authored content stays English. Configure a provider to change that.
- **The admin console is English + Italian only**, by decision. See the
  coverage table.
- **DeepL cannot do Persian.** If you select DeepL, `fa` content stays English.
- **Static export means no server-rendered `lang`/`dir`.** The prerendered HTML
  ships `lang="en" dir="ltr"` and `I18nProvider` corrects it on mount. There is
  a brief first paint in English before the stored preference applies. Fixing
  that properly would mean giving up `output: 'export'`.
- **The landing page's marketing copy is static resources, not database
  content.** It is translated and committed, but an admin edits it by editing
  `en/landing.json` (as they previously edited `landing-data.ts`), not through
  an admin screen.
- **No automated tests.** The test suite was explicitly descoped. What was
  verified is listed in the handover notes.
- **`ADVANTAGE_COUNTRIES` is not translated** — only its `.length` is ever
  rendered.
