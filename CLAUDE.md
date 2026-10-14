<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes - gives risk-scored analysis |
| `get_review_context` | Need source snippets for review - token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

## Database changes: never use `prisma db push`

Use `npx prisma migrate dev --name <what_changed>`, which writes a migration
file. `db push` syncs the dev database **without** creating one, so the change
exists on dev and nowhere else.

This has already caused one production outage. The MMS slice (KYC documents,
KPI tables, `users.walletEnabled`, the `REJECTED` user status and three profile
fields) was pushed rather than migrated. Production only runs `migrate deploy`,
so it never received any of it, and every query that read a full user row died
with `column profiles.passportUrl does not exist` — login included. The repair
is `20261011140000_repair_schema_drift`.

To check dev and the migrations still agree:

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "<a scratch database url>"
```

"This is an empty migration." means no drift. Anything else is a change that
will not reach production.

`backend` runs `prisma generate` on `postinstall`, so `npm install` can no
longer leave a stale client **on disk**. A stale client selects columns the
database does not have, which produces the same 500s as missing migrations.

That only covers the files. A process that was already running keeps the old
client in memory, because nothing watches `node_modules` - so a generate must
always be followed by a restart. See "Restart after `prisma generate`" under
Deploying.

## Deploying

```bash
# Back up first whenever migrations are pending - several include DROP COLUMN.
pg_dump -Fc tbc_db > ~/tbc-$(date +%F-%H%M).dump

cd /var/www/tbc-project && git pull origin main

cd backend
npm install                 # regenerates the Prisma client via postinstall
npx prisma migrate deploy   # only when migrations changed
pm2 restart tbc-api         # ALWAYS, not just on code changes - see below

cd ../frontend
npm install && rm -rf .next out && npm run build
rsync -a --delete out/ /var/www/tbc-project/frontend-dist/
```

**The rsync is not optional.** `npm run build` writes to `frontend/out/`, but
nginx serves `/var/www/tbc-project/frontend-dist`. Skipping it means the build
silently changes nothing on the live site.

**Restart after `prisma generate`, every time.** `postinstall` regenerates the
client into `node_modules`, and neither pm2 nor nodemon watches `node_modules`
- a process started before the generate keeps the old client in memory. It
then selects columns that do not exist, or refuses to select ones that do, and
you get 500s from endpoints whose code is obviously correct. This has already
cost an afternoon locally: `Unknown field 'enquiryEmail' for select statement`
from a process whose files were up to date.

Never run `db:reset` (drops the database) or `db:migrate` (that is
`migrate dev`, which can offer to reset on drift) against production.
`db:deploy` is the production-safe one.

### Environment variables that break things quietly

`backend/.env`:

| Variable | Why it matters |
|---|---|
| `FRONTEND_URL` | The media stream sends `Content-Security-Policy: frame-ancestors 'self' $FRONTEND_URL` and defaults to `http://localhost:3000`. Wrong in production and **every PDF, Word and image viewer renders nothing** while the rest of the portal looks healthy. |
| `SMTP_*` | OTP, approvals, invoices and Connect Now enquiries all go through `services/mailer.js`. |
| `DEFAULT_ENQUIRY_EMAIL` | Fallback recipient for enquiries when no address is configured in Admin → Enquiries. Optional; the code falls back to `codehands12@gmail.com`. |

`frontend` at **build time** (the frontend is a static export, so these are
baked into the bundle - changing them later does nothing until you rebuild):

| Variable | Why it matters |
|---|---|
| `NEXT_PUBLIC_API_URL` | Every API call. Wrong value = a portal that loads and can do nothing. |

### Uploaded media lives outside git and outside nginx

```
backend/storage/project-media/    project images, PDFs, video
backend/storage/company-media/    company logos, banners, gallery, PDFs, Word, video
```

- **Never wipe these.** They hold every project and company upload, and
  nothing else has a copy. Back them up with the database.
- They must be writable by the pm2 user. `ensureDir()` creates them on boot,
  but it cannot fix ownership.
- They are **not** under `/uploads` and are not served by nginx at all -
  company media goes through `/api/companies/:id/media/...`, which the existing
  `/api` proxy already covers. **No nginx change is needed** for either module.
- Each directory holds a `.gitignore` (`*` / `!.gitignore`) so uploads are
  never committed. Keep it. `company-media` was missing one once and 114MB of
  member uploads went into the repo and onto GitHub; removing them needed a
  history rewrite and a force-push.

### Document size limits

`services/uploadLimits.js` is the authority: documents 8MB, images 10MB, video
300MB. `frontend/src/lib/uploadLimits.ts` mirrors the numbers so a file is
refused before it uploads - **change both together.** Multer keeps only the
outer 300MB ceiling, because it applies one limit per request and cannot vary
it by mime type.

### After a history rewrite

If history has been rewritten (it has been once, to purge committed uploads),
every commit SHA changed and `git pull` on the server fails. Use:

```bash
cd /var/www/tbc-project
git fetch origin && git reset --hard origin/main
```

`reset --hard` discards uncommitted local changes, so check `git status` on the
server first if anything was ever hand-edited there.

### After deploying

1. **Admin Panel → Enquiries** - set the enquiry recipient addresses. Several
   are supported; every one receives every enquiry. Changing them emails the
   addresses added and removed.
2. Open a project and a company detail page and check the banner image loads.
   That is the quickest proof `FRONTEND_URL` is right.
3. Send one test enquiry and confirm it arrives.
4. Confirm Projects and Companies appear in the sidebar for an admin *and* for
   a member.

## Private files: two mechanisms, do not mix them

There are **two** separate systems for files that must not be public. Which one
a new file belongs in depends on who may read it, and putting it in the wrong
one either leaks it or makes it unreachable.

| | `/uploads` + `fileAccess` | Ticketed media streaming |
|---|---|---|
| Files | profile photos, KYC and identity documents, CVs | project and company images, PDFs, Word, video |
| On disk | `backend/uploads/` | `backend/storage/{project,company}-media/` |
| Served by | `routes/uploads.js` | `routes/{projects,companies}.js` media endpoints |
| Authorised by | `services/fileAccess.js`, per request, against the database | a short-lived JWT ticket scoped to one document and one viewer |
| Reached from the UI by | `openDocument()`, `useSignedSrc()` | the `streamUrl` the media listing returns |
| Readable by | depends on the `Kind` below | any active member who can see the project or company |

**Choosing between them.** Is the file *about a person* and readable only by
them and admins? That is `/uploads` + `fileAccess`. Is it *material attached to
a project or company*, readable by any member who can open that page but never
downloadable? That is media streaming. A member's passport must never go
through the media endpoints, which would expose it to every other member.

### `/uploads` + `fileAccess`

`/uploads` is served by `routes/uploads.js`, not `express.static`. Identity
documents live in the same directories as profile photos — the admin "Add
Member" flow writes them into `uploads/` beside avatars, and a real trade
licence in production is a `.png` in that root — so path and extension prove
nothing. `services/fileAccess.js` classifies every request against the
database:

| Kind | What | Who can read it |
|------|------|-----------------|
| `PUBLIC`  | profile photos only | everyone |
| `MEMBER`  | post/event/project imagery | any active logged-in member |
| `DOC`     | passport, resident ID, trade licence, CV, KYC scans | the owner or an admin |
| `UNKNOWN` | nothing in the database references it | nobody (404) |

**To add a new private upload of this kind:** store its path on a model, then
add that column to the `DOC` branch of `classifyStoredUrl`. Nothing else is
needed — no route or nginx change. A file no column points at returns 404 to
everyone, including admins, so a "missing" upload usually means an unrecorded
path.

This is **not** where project or company media goes. Those files are never
referenced by a path in a payload at all, so `classifyStoredUrl` would never
see them; registering a column there achieves nothing.

In the UI, open documents with `openDocument()` and render secured images with
`useSignedSrc()`. A plain `<a href>` or `<img src>` gets 403: the browser
cannot attach the Bearer token, so both helpers exchange the path for a
short-lived signed URL first.

nginx must proxy `/uploads` to the API. If it ever serves that path with
`alias` or `root`, every check above is bypassed and the files are public.

### Ticketed media streaming

`controllers/projectMediaController.js` and `controllers/companyMediaController.js`
are the same design twice, deliberately:

- the bytes live in `backend/storage/*-media/`, which **no route serves
  directly** and nginx does not know about;
- the stored filename is random and the stored path **never leaves the server**;
- a media listing returns a `streamUrl` carrying a JWT ticket scoped to one
  document and one viewer, valid for an hour. The session token is never put in
  a URL, where it would leak through logs and referrers;
- the stream always sends `Content-Disposition: inline`, so a browser renders
  the file instead of offering to save it.

An `<img>`, `<video>` or `<iframe>` cannot send an `Authorization` header, which
is the whole reason tickets exist. That is also why the stream routes are
declared **above** `router.use(authenticate)` in both route files — moving them
below it would break every viewer.

**To add a new kind of project or company media:** add its mime type to
`KIND_BY_MIME`, give it a ceiling in `services/uploadLimits.js`, and teach
`SecureViewer` how to render it. Do not add a download endpoint; there is
deliberately none.

Word documents are the one exception to "stream the bytes": no browser renders
`.docx`, and handing the file to Office Online or Google's viewer would mean
publishing it to a third party. So `.docx` is converted to sanitised HTML
server-side with `mammoth` and rendered in the portal. Legacy binary `.doc`
cannot be converted and says so.

Every preview carries a repeated "Trillion Business Community" copyright mark.
There are two viewer components — `components/projects/SecureViewer.tsx` (used
by both the project and company modules) and the deal room's older
`components/community/ProjectMedia.tsx` — and they share the one `.pj-watermark`
rule, so the mark is styled in a single place.

It asserts ownership; it does not protect the file. **Nothing here is DRM** —
the bytes must reach the browser to be displayed, so devtools, the network tab
and a screenshot all remain. The ticketed, permission-checked endpoint is the
part that actually protects the file; the rest removes the download paths a
member would actually use.

## What members may see about each other

`services/memberVisibility.js` holds one deny-by-default projection, used by
every payload that embeds a user (post and comment authors, the directory,
event attendees, project owners, investors, message partners). Members see a
name, a photo and the professional fields they entered themselves. Identity
documents, phone numbers, addresses, VAT number, email, KYC status and the
membership record are never serialised to another member.

Add new user fields to that projection deliberately. Selecting `profile: true`
on a member-facing endpoint is what leaked document URLs and contact details
between accounts before.
