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
| `FRONTEND_URL` | **A comma-separated list of every origin the portal is served from**, not one URL. The bundle calls the API at one absolute address, so a member who opened a hostname that is not on this list has every request blocked by CORS with no response body — which the UI can only report as a failed login, on one device, while the same credentials work everywhere else. Redirect to one canonical host in nginx as well; this list is what stops a mismatch being total. It is also the media stream's `Content-Security-Policy: frame-ancestors` source, and defaults to `http://localhost:3000`. Wrong in production and **every PDF, Word and image viewer renders nothing** while the rest of the portal looks healthy. |
| `SMTP_*` | OTP, approvals, invoices and Connect Now enquiries all go through `services/mailer.js`. |
| `DEFAULT_ENQUIRY_EMAIL` | Fallback recipient for enquiries when no address is configured in Admin → Enquiries. Optional; the code falls back to `codehands12@gmail.com`. |
| `ADMIN_NOTIFY_EMAIL` | Fallback recipient for new-signup alerts when no address is set in Admin → Super Admin → Notifications. Optional, and unlike enquiries there is **no hardcoded default**: with neither the setting nor this variable, applications arrive with nobody told. The screen says so in red. |

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

**nginx must allow the same ceiling.** `client_max_body_size` defaults to 1MB,
so without it every upload over 1MB dies with a `413 Request Entity Too Large`
from nginx — before Express, so the response is an HTML error page with no
`error` field and the UI only says "Could not save this project." Set
`client_max_body_size 300m;` in the server block to match `MAX_ANY`. This bit
production once with a 1.8MB PDF. If large videos stall rather than 413,
raise `client_body_timeout` and `proxy_read_timeout` too; both default to 60s.

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

## Project lifecycle: launch, then major updates

An admin controls a project's launch separately from its publication status.
Each action has its own endpoint, in `controllers/projectAnnouncementController.js`:

| Action | Endpoint | `launchedAt` | Badge | Email | Community post |
|---|---|---|---|---|---|
| Launch | `POST /projects/:id/launch` | set once | starts 30 days | yes | yes |
| Edit | `PUT /projects/:id` | never | never | no | no |
| Major update | `POST /projects/:id/announcements/major-update` | never | never | yes | yes |
| Restart badge | `POST /projects/:id/promo-restart` | never | starts 30 days | **no** | **no** |

**A project is launched once, and the only announcement after that is a major
update.** There is deliberately no "re-announce": every post-launch message to
the community has to say what changed, which is why the "What's New?" summary
is required, has no default and is never generated. If there is nothing to
report, there is nothing to send. `ProjectAnnouncementType` has three values
(`INITIAL_LAUNCH`, `MAJOR_UPDATE`, `PROMO_RESTART`) and no fourth - don't add
one back without deciding what it would say.

**Editing never announces anything, structurally.** `updateProject` builds its
write from a whitelist and none of the launch columns are on it, so an edit
cannot move a launch date or extend a badge even if the request body asks it
to. There is a test for exactly that request.

`services/projectLaunch.js` is the rules — eligibility, the badge window, who
an announcement goes to, and the one transaction that writes an announcement
together with its send list. `eligibility()` is the single authority: the API
returns it so the panel can draw its buttons, and every endpoint checks it
again. Hiding a button is never what enforces anything.

**Three states, three different questions.** `status` (is it published?),
`launchState` (is there an official launch on record?) and
`newlyLaunchedUntil` (is the promotion running?) are independent, and the
admin panel shows all three. Collapsing them is how someone re-launches a
project that is already live.

**The badge has no scheduled job.** It is derived from `newlyLaunchedUntil` on
every read, so it expires on its own and a server clock is the only authority.

### Announcement emails: a second table-as-queue

`services/announcementWorker.js` is a deliberate second copy of the pattern
`services/i18n/worker.js` already established — queue is a Postgres table,
worker is an interval in the API process, claiming is a conditional UPDATE,
retries back off with jitter then go DEAD. Same reasoning as there: no Redis,
because an announcement is a few admin actions a month.

`project_announcement_recipients` is both the delivery record and the outbox.
The rows are written **in the launch transaction**, so "launched but nothing
queued" is not a state that exists, and a launch survives a dead mail server.

- **A row that reached `SENT` is never claimed again** — not by the worker, not
  by "Retry failed", which only touches `DEAD`. That is what makes a retry safe.
- **`SENT` means a mail server accepted it, not that anyone received it.** SMTP
  gives no delivery confirmation, so the UI says "accepted by the mail server"
  and there is no `delivered` anywhere in the payload. Do not add one.
- `worker.pause()` / `resume()` stops automatic sending during an SMTP
  incident without losing a single queued row.
- The banner is attached to the email as inline bytes, not as a media URL: a
  stream URL carries a ticket scoped to one viewer that expires in an hour, so
  it would be a broken image by the time the mail is opened. Skipped above 2MB,
  because the same bytes go out once per recipient.

Idempotency is the unique index on `project_announcements.idempotencyKey`.
Launch is keyed `launch:<projectId>` so it can only ever happen once; a
major update is keyed by a session id the composer generates once and resends
on retry. A **deliberate** second update is a new composer session, so a new
key — that is the whole distinction between a retry and a new business action.

### Existing projects were classified, not launched

Migration `20261022120000_project_launch_announcements` set
`launchState = 'PRE_FEATURE'` on every ACTIVE/FUNDED/CLOSED project and left
`launchedAt` NULL. It queued no email and published no announcement, because
the queue is the recipient table and it starts empty.

A `PRE_FEATURE` project is surfaced in the panel as needing a decision: launch
it officially now, or `POST /projects/:id/launch-classify` to record that it
was launched before launches were tracked. The second one writes **no date** —
`createdAt` is when the row was made, not when the project launched, and
inventing one is worse than admitting it is unknown. Either way, major updates
can be announced against the project afterwards.

### Running the tests

```bash
cd backend && npm test    # node:test, no new dependency
```

**Serial on purpose** (`--test-concurrency=1`). The suites share one
development database, and several of them assert against figures that count
whatever else is in it — `projectLifecycle` checks how many ACTIVE members an
announcement would go to, while `apiKeys` and `adminAnalytics` create ACTIVE
members of their own. Run in parallel they fail each other at random; run in
order they pass. Do not drop the flag to make the suite faster.

They drive the real router over real HTTP with real JWTs against the
development database, and tear down everything they create. They need
`DATABASE_URL` and `JWT_SECRET`; they never contact an SMTP server, because
`SMTP_TRANSPORT=json` renders every email instead of sending it. That env var
is also useful locally: the API boots and queues mail with no credentials.

New optional variables, all with working defaults:
`ANNOUNCEMENT_WORKER_INTERVAL_MS`, `ANNOUNCEMENT_WORKER_BATCH`,
`ANNOUNCEMENT_STALE_LOCK_MS`, `ANNOUNCEMENT_BACKOFF_BASE_MS`. `FRONTEND_URL`
matters more than before: it is the base of the canonical project URL in every
announcement email, so a wrong value mails the community a link to localhost.

## Portal-wide recipient lists

`services/recipientList.js` is the one implementation behind every "who gets
this mail?" setting: parsing a pasted list, de-duplicating case-insensitively,
capping at 10 addresses, storing it in `SystemConfig` as a comma-separated
string, and reporting what was added and removed so the caller can notify the
mailboxes involved. Two settings use it:

| Setting | Key | Env fallback | Set in |
|---|---|---|---|
| Enquiry recipients | `enquiryRecipientEmail` | `DEFAULT_ENQUIRY_EMAIL` | Admin → Enquiries |
| New-signup alerts | `signupNotifyEmail` | `ADMIN_NOTIFY_EMAIL` | Admin → Super Admin → Notifications |

Both are portal-wide, both deliver every message to every address on the list,
and both refuse an empty list. Reading is open to any admin; writing is super
admin only, because an admin who could redirect the signup alerts could
approve their own invitee unobserved.

Add a third by calling `recipientSetting({ key, fallback })` rather than
re-implementing the parsing. The signup setting was lifted out of
`enquirySettings.js` for exactly this reason: a second copy that stopped
de-duplicating case-insensitively would send `Ops@x.com` and `ops@x.com` two of
everything, and nobody would notice for weeks.

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

## The admin event feed

`services/eventFeed.js` serves the three things an admin has to be told about
as they happen, as **one** time-ordered list:

| Kind | Source table | `amount` | Needs an admin when |
|---|---|---|---|
| `SIGNUP` | `users` (role MEMBER, not soft-deleted) | null | `status = PENDING` |
| `WITHDRAWAL` | `withdraw_requests` | the requested amount | `status = PENDING` |
| `ENQUIRY` | `enquiries` | null | `status = FAILED` |

```
GET /api/admin/events          ?kind= &status= &memberId= &q= &since= &until= &page= &limit=
GET /api/admin/events/counts   same filters, three COUNT(*)s and nothing else
```

Both are `requireAdmin` (`routes/adminEvents.js`, mounted on `/api/admin`
beside `routes/admin.js`). **Nothing in the feed may reach a member**: a signup
event carries the applicant's phone, addresses and identity-document paths, a
withdrawal event carries bank details, an enquiry event carries another
member's message. `services/memberVisibility.js` is what member-facing payloads
use instead.

**This is not the activity log, and it is not a second one.** `activityLog` is
append-only history, frozen at the moment it was written — a signup logged as
PENDING in March still says PENDING forever, correctly. This feed reads the
**source tables**, so every event reports the live status. The log answers
"what happened?"; the feed answers "what is waiting for me?". Neither replaces
the other, and an event is never written here — the flow that owns it
(`authController` register, `withdrawController`, `enquiryController`) is still
the only thing that creates one.

- **`since` is exclusive.** A poller sends back the `latestAt` it was given; an
  inclusive bound would re-deliver the newest event on every tick. `latestAt`
  is the newest event in the whole filtered set, not on the page, and is
  `null` for an empty set — keep the cursor you had rather than resetting to
  now and skipping whatever lands in between.
- **`needsAttention` in `/counts` ignores `since` and `status` deliberately.**
  "3 applications are waiting" is a fact about the table; scoping it to the
  poll window would empty the badge between polls.
- **`status` is matched per kind.** `?status=SENT` returns enquiries and no
  signups, rather than a 400 about a value that is valid for another kind.
- **An enquiry has no amount.** It moves no money. The figures belonging to
  what the member asked about are under `detail.subject`; putting a project's
  target amount in `amount` would read as a sum that member requested.
- Three tables cannot share one `ORDER BY` without a UNION, so each kind is
  read `skip + take` deep and the three lists are merge-sorted. `MAX_SCAN`
  (1000) caps that, and paging past it is a 400 telling the caller to use
  `until=`. Walking history is what `until` is for; `page=400` is not.
- `detail.source` (`SELF` | `ADMIN`) comes from the `SELF_REGISTER` admin-log
  row, because a user row cannot tell a self-registration from an account an
  admin keyed in. Google signups have no such row, so `googleId` counts too.

Tests: `backend/tests/eventFeed.test.js`, same terms as the lifecycle suite —
real router, real HTTP, real JWTs, teardown of everything it creates.

### Machine access: API keys

The feed serves two kinds of caller through one gate,
`middleware/apiKey.js` → `machineOrAdmin(scope)`:

| Presented | Treated as |
|---|---|
| `X-API-Key: tbc_live_…` | a machine caller; the key must hold the scope |
| `Authorization: Bearer tbc_live_…` | the same (a key, not a session) |
| `Authorization: Bearer eyJ…` | the existing `authenticate` + `requireAdmin` |
| `?api_key=…` | **400.** URLs leak through logs and `Referer` |

`routes/adminEvents.js` is mounted **above** `routes/admin.js` in `index.js`,
and that order is load-bearing: `admin.js` gates its whole router with
`router.use(authenticate, requireAdmin)`, which runs for every request that
enters it including paths it does not define. Mounted after it, the feed
answers every key with `401 No token provided`.

| Scope | Grants |
|---|---|
| `events:read` | `GET /admin/events` |
| `events:counts` | `GET /admin/events/counts` (also satisfied by `events:read`) |
| `events:sensitive` | the identifying detail; without it the payload is redacted |

**Redaction is an allowlist** (`redactEvent` in `services/eventFeed.js`), not a
denylist, so a field added to a projection is withheld until somebody adds it
to the allowlist deliberately — the opposite mistake is how `profile: true`
leaked document URLs between accounts. A key without `events:sensitive` gets
counts, kinds, statuses, amounts, timestamps, a member id and name, the bank's
name, and booleans for which documents exist. It cannot obtain an email,
phone, address, VAT number, identity-document path, IBAN, SWIFT, withdrawal
reason or enquiry message text. The response says `redacted: true` so a
consumer knows a missing field was withheld rather than empty. An admin
session is never redacted and is never scoped — a human admin already holds
these rights, and scoping their session would be a second permission system
over the same data.

### Issuing, rotating and revoking

Super admin only (`routes/superAdmin.js`), because a key is a standing grant to
read member data with no session; every action is in the activity log under
`API_KEY_*`.

```
GET    /api/super-admin/api-keys
POST   /api/super-admin/api-keys          { name, scopes[], expiresInDays? }
PUT    /api/super-admin/api-keys/:id      { name?, scopes?, expiresInDays? }
POST   /api/super-admin/api-keys/:id/rotate
DELETE /api/super-admin/api-keys/:id      (revoke)
```

Or from the server shell, which is how the first key is made and how a leaking
one is killed without the portal being up:

```bash
npm run apikey:list
npm run apikey:create -- --name "Marketing site" --scopes events:read --days 90
npm run apikey:create -- --name "Ops dashboard" --scopes events:read,events:sensitive --no-expiry
npm run apikey:revoke -- --id <uuid>
```

- **The key is shown once**, by the `create`/`rotate` response (or the CLI) and
  never again. `api_keys` stores a SHA-256 digest and a 16-character prefix for
  display; a dump of the table cannot call the API. Lost key → rotate.
- **SHA-256, not bcrypt.** Bcrypt slows down guessing *low-entropy* passwords.
  A key is 256 random bits from `crypto.randomBytes(32)`, so there is nothing
  to guess, and a 100ms hash would be paid on every request. The digest is a
  unique index, so authenticating is one lookup.
- **Rotation is additive and that is the point.** `rotate` issues a replacement
  with the same name and scopes and leaves the old key working: the consumer
  deploys the new one, you watch `lastUsedAt` on the old one stop moving, then
  revoke. Revoking first is an outage.
- **Revocation is a timestamp, not a delete** — the row is the record of what
  the key could reach and when it stopped. Revoking twice does not move it.
- Keys expire in 365 days unless `--no-expiry` / `expiresInDays: null` is asked
  for explicitly. `lastUsedAt` is written at most once a minute, so a key
  polling every ten seconds is not an UPDATE every ten seconds.
- Rate limit is **per key** (120/min), falling back to the IP for admin
  sessions: several consumers behind one corporate NAT would otherwise share a
  budget.
- A key reaches the feed and nothing else. `/admin/members`, `/admin/logs` and
  the key-management endpoints themselves do not know what an API key is and
  answer 401.

Tests: `backend/tests/apiKeys.test.js` — including the negative ones that
assert the fixtures' IBAN, passport path and enquiry text appear nowhere in an
unscoped key's response.

### The screen

**Admin → Super Admin → API keys** (`components/admin/ApiKeysTab.tsx`). Super
admin only and structurally so: the page is wrapped in `<ProtectedLayout
requireAdmin requireSuperAdmin>` and every endpoint it calls is behind
`requireSuperAdmin`. Unlike `SignupNotifyTab` there is no read-only mode for an
ADMIN — which integrations can read member data is not an ADMIN-level fact.

- The newly-issued key gets its own panel, with a copy button and a `curl`
  example. It is the only thing on the page that can show a key, nothing
  re-fetches it, and it leaves state when dismissed.
- Ticking `events:sensitive` raises a warning naming what it grants, and the
  list carries a standing count of how many active keys hold it.
- Rotate's confirmation says the old key keeps working and to revoke it once
  "last used" stops moving — that figure is on every row for exactly that
  decision. Revoke names the key and its consequence rather than asking "are
  you sure?", like the Danger zone on the Accounts tab.
- Editing scopes says that the key string does not change, so the consumer
  needs no redeploy.

**Deploying needs one migration**, `20261026090000_add_api_keys`. It is written
by hand because this database carries one deliberate, permanent piece of drift
— `20261006150000_unify_investment_wallet_ledger` left the obsolete, empty
`investment_projects` table in place on purpose — and `migrate dev` responds to
any drift by offering to reset the development database. **Do not let it.**
Generate the SQL instead, drop the `DROP TABLE "investment_projects"` line it
emits, and apply with `migrate deploy`:

```bash
npx prisma migrate diff --from-url "$DATABASE_URL"     --to-schema-datamodel prisma/schema.prisma --script
```

The frontend needs its usual rebuild + rsync because `lib/api.ts` changed.

## The admin Overview

`services/adminAnalytics.js` + `GET /api/admin/analytics` (requireAdmin,
`routes/adminAnalytics.js`) are the figures behind the admin panel's first tab,
`components/admin/OverviewTab.tsx`.

```
GET /api/admin/analytics?range=all|month|quarter|year|custom&from=&to=&granularity=
```

| Figure | Means |
|---|---|
| `assets` | What the portal holds: `portfolio` (**valuation** of live companies `ACTIVE` and projects `ACTIVE`/`FUNDED`, split by industry) + `wallets` (what members' wallets are worth) |
| `investment` | Member capital: opening balances + live `wallet_investments`, net of returns |
| `profit` | Paid to members: opening profit + every `profit_record` |
| `projects` | Counts by status, plus raised against target |
| `transactions` | `COMPLETED` only, count and volume, plus a per-category split |
| `series` | One bucket per period, each holding all of the above that are dated |

**`assets.total` is two halves: `portfolio` + `wallets.value`, and nothing
else.** A valuation is what a company or project would fetch; a wallet balance
is money the portal is holding for a member. No row feeds both, so the two add
up without double-counting.

`wallets.value` is deliberately the simplest thing it can be: `SUM(wallets.
totalBalance)`. That column is `walletService`'s own derived balance, which
`syncWallet` rewrites inside the same transaction as every ledger write, so the
figure is the sum of the balances members themselves see and the Overview does
not re-derive it. It is **not** decomposed into capital and profit — there is no
`wallets.capital` or `wallets.profit` in the payload, and the screen shows one
wallet number. The consequence to know: a ledger row written straight to the
database without calling `syncWallet` does not move this figure. Every real
flow calls it (`investmentEngine`, `withdrawController`, `adminController`,
`superAdminController`, `superAdminAssetsController`); a hand-run SQL INSERT
does not.

**`investment` is still not an asset line.** It is the inflow that produced
part of the wallet half; adding it on top of `wallets.value` counts the same
euros twice. The screen keeps them apart and says so.

**`byIndustry` covers the portfolio half only**, and its `share` is of
`portfolio`, not of `total` — a wallet has no industry and folding it into one
would invent a sector. The donut is drawn against `assets.portfolio`; the
wallet figure is named beside it. A company or project with no `valuation` is
counted and reported (`unvalued`), never treated as worth zero — "€4.2M across
11 of 14" must not read as "€4.2M across 14".

**The dated/undated split is the subtlety.** `wallets.investmentAmount` /
`profitAmount` are the legacy opening balances: real money, no project, **no
date**. So:

- `total` = opening + dated ledger — as of now, ignores the window;
- `inRange` and every point in `series` = dated rows only.

Stamping an opening balance with `createdAt` would invent history and drop a
member's whole balance into the week their row was made. The KPI tiles show
both figures and name the caveat.

Every figure other than the wallet half is derived per request from the same
tables `services/walletService.js` uses, so the Overview cannot drift from a
member's own wallet — which is exactly what a rollup table would eventually do.
The wallet half reads `wallets.totalBalance`, which is the one cache in the
ledger and is maintained transactionally by `syncWallet`; see the assets note
above for what that means in practice.

Buckets are chosen from the width of the window (month→day, quarter→week,
year→month, all→month/quarter) unless `granularity` says otherwise, capped at
`MAX_BUCKETS`. Grouping happens in JS because Prisma cannot group by a
truncated date without a raw query, and at this portal's size one indexed scan
beats a rollup that can disagree with the ledger.

### Charts

`src/lib/viz.ts` holds the palette and is the only place chart colour is
decided. The six hues are a categorical palette whose **ordering is the
colourblind-safety mechanism**, validated as a set against the card surface
(`#131727`): lightness band, chroma floor, adjacent-pair CVD ΔE 8.4, normal
vision ΔE 19.3, contrast ≥ 3:1 — all pass. Two rules follow:

- **Assign in order, never cycle.** A seventh category is not a new hue; it
  folds into the neutral `OTHER` (`topSlices()`), and the full list stays
  readable in the table beside the chart.
- **Colour follows the entity, not its rank.** Capital is always slot 1, profit
  always slot 3.

Form follows the data's job, not decoration: stat tiles for headline numbers
(never a five-bar chart), a donut only because it is part-to-whole at a glance
with ≤ 6 segments, a meter for raised-against-target, and **two charts rather
than one dual-axis chart** — euros and a transaction count do not share a
scale, so volume lives in the bar chart's tooltip instead of on a second y-axis.
Legends are HTML beside the title, so identity never rests on colour alone.

## Navigation

One navigation: the sidebar. `components/layout/Topbar.tsx` deliberately has
**no links** — it used to repeat Dashboard / Portfolio / Transactions / Cards /
Settings, and for an admin it offered the member wallet pages that the sidebar
hides from them. The two dead icon buttons beside the bell went with it.

`components/layout/Sidebar.tsx` is grouped, role-aware and collapsible:

| Viewer | Sections |
|---|---|
| Member | (wallet, unlabelled) · Explore · Account |
| Admin | Administration · Portfolio · Community |

- Admin rows link into the panel's own tabs by **hash** (`/admin#pending`), so
  a queue is one click away. The tab lives in the URL (`lib/useHashTab.ts`),
  which means Back steps between tabs and a pasted link opens where the sender
  meant. It is the hash and not `?tab=` because `useSearchParams()` needs a
  Suspense boundary and breaks the static export.
- **`hashchange` does not fire for `history.pushState`**, and pushState is how
  both halves of that move: a `next/link` clicked while already on `/admin` is
  a client-side navigation, and the panel's own tab buttons push too. So
  `useHashTab.ts` patches `pushState`/`replaceState` once to emit an event,
  and `useLocationHash()` is the single subscription behind both the panel and
  the sidebar highlight. Without it a sidebar row did nothing once the admin
  was already inside the panel — the URL changed and the screen did not.
- **Match routes with the trailing slash normalised.** The export serves
  `/admin/`; comparing it raw against an href of `/admin` means nothing ever
  highlights. That bug was live for exactly one commit.
- A collapsed section **moves its queue badges onto its heading**: folding a
  section away must never hide work that is waiting.
- Super Admin still appears only for a SUPER_ADMIN, and the member wallet pages
  still never appear for an admin.
- **Three bands, and only the middle one moves.** The identity row is pinned at
  the top, `.sidebar-nav` scrolls (`flex: 1; min-height: 0; overflow-y: auto` —
  the `min-height` is what lets a flex child shrink below its content), and
  `.sidebar-footer` is pinned at the bottom with an opaque background, because
  nav rows scroll underneath it. The column used to be `overflow: hidden`, so
  an admin on a short screen simply lost the rows that did not fit — Log Out
  among them. On mobile the panel itself is the scroller, so the footer is
  `position: sticky; bottom: 0` instead.

## Installing the portal as an app (PWA)

The portal installs to a phone's home screen, to an Android launcher and to the
Windows/macOS desktop. It is the same static export — there is no second
codebase, no store listing and no native wrapper. What makes it installable:

| Piece | File | Why it is needed |
|---|---|---|
| Manifest | `frontend/public/manifest.webmanifest` | the name (`TBC` under the icon, `Trillion Business Community` in full), the icons, `display: standalone`, and the navy `#0b1022` the window opens in |
| Service worker | `frontend/public/sw.js` | **a browser will not offer "Install" without one.** It also serves the offline page |
| Offline page | `frontend/public/offline.html` | shown when a navigation cannot reach the server; plain HTML, because by then nothing else can load |
| Icons and launch images | `frontend/public/icons/` | generated from the one logo by `frontend/scripts/pwa-icons.py` |
| Head tags | `frontend/src/app/layout.tsx` | manifest link, `theme-color`, `viewport-fit=cover`, and the iOS `appleWebApp` block |
| The invitation | `frontend/src/components/pwa/InstallPrompt.tsx` | the banner, mounted in `ProtectedLayout` so it only ever appears to a signed-in member |
| Platform rules | `frontend/src/lib/pwa.ts` | which of the four install scripts this browser gets |

### There is no single "install" API, which is why the banner has four scripts

- **Android and desktop Chrome/Edge** fire `beforeinstallprompt`. We keep the
  event and show a real **Install** button that opens the OS dialog.
- **iPhone and iPad (Safari)** have no such event and never will. The banner
  shows the three taps — Share → Add to Home Screen → Add — on **every iOS
  version**, which is the best any site can do.
- **Chrome/Firefox/Edge on iOS** are Safari underneath but have no "Add to
  Home Screen" item, so the steps are preceded by "open this in Safari".
- **Safari on macOS** installs through File → Add to Dock.
- An in-app browser (Instagram, LinkedIn…) cannot install anything, so nothing
  is shown rather than instructions that cannot be followed.

`beforeinstallprompt` fires once, usually before React has mounted, so
`src/lib/pwa.ts` listens at **module scope**. A listener added in a `useEffect`
misses it on a cold load and the Install button never appears.

The banner asks once: "Not now" is remembered for `SNOOZE_DAYS` (14), an
install forever, and it never renders when already running as an app.

### What the service worker must never do

In production `/api` is same-origin (nginx proxies it), so a worker that cached
every GET would write one member's wallet, documents and messages into a cache
the next member on that device could read. `/api` and `/uploads` are skipped
entirely — not cached, not inspected. Everything cached is a public build
artefact.

Navigations are **network-first**, so a redeploy is never hidden behind a stale
shell; only `/_next/static` is cache-first, and that is safe because those
filenames carry a content hash. Bump `VERSION` in `sw.js` when changing it —
`activate` drops every cache that is not the current one.

**The worker is never registered by `next dev`.** Dev chunks live at stable,
unhashed paths (`/_next/static/chunks/app/admin/page.js`), which the worker
would treat as immutable and pin forever — every later edit then recompiles,
reloads and runs the old code, which reads as a bug in whatever you just
changed. In development `registerServiceWorker()` unregisters any worker it
finds and drops the `tbc-*` caches instead, so a browser that picked one up
repairs itself on the next load. If one is somehow still there: DevTools →
Application → Service workers → Unregister, then reload.

### Sessions in the installed app

**Every read and write of the token goes through `lib/tokenStore.ts`.** Not a
style preference: in Samsung Internet's Secret mode, Safari Private Browsing
and anything with "block all cookies" set, touching `localStorage` *throws*
rather than returning null. An unguarded `setItem` in `login()` turned a
successful sign-in — token issued, 200 from the API — into the form's
catch-all "Login failed, please try again", and an unguarded read in the axios
interceptor failed requests before they were sent. The store guards both
stores independently, falls back to memory for the tab when neither works, and
`hasPersistentStore()` reports which happened. The login form now also
distinguishes "no response at all" (connection, blocked origin, blocked
storage) from a rejected password, because the two had one message between
them.

Nothing else changes: the JWT lives in the `tbc_token` cookie and `localStorage`,
and an installed app shares the browser's storage on Android and desktop.
**iOS is the exception** — a home-screen web app has its own storage
container, so a member signs in once inside the app even if they were signed
in in Safari. The session lasts as long as it does anywhere else
(`JWT_EXPIRES_IN`, 7 days, and the cookie matches it); raise both together if
app users should stay signed in longer.

### Deploying

The icons, manifest, worker and offline page are in `frontend/public`, so they
land in `out/` and the usual rsync ships them. Two things nginx has to get
right:

- **HTTPS, or nothing installs.** A service worker is refused outside a secure
  context, and without it there is no install offer. `localhost` is exempt, so
  this works in dev and fails only in production if TLS is missing.
- **Do not cache `/sw.js` long.** The browser re-checks it on navigation; a
  far-future `Cache-Control` on it pins the old worker on every device.

```nginx
location = /sw.js {
  add_header Cache-Control "no-cache, must-revalidate";
}
location = /manifest.webmanifest {
  types { } default_type application/manifest+json;
}
```

No change is needed for `/api` or `/uploads` — the worker deliberately leaves
both alone.

### Changing the logo

Re-run the generator; it rewrites every size, the maskable pair, the Apple
touch icon and all fourteen iOS launch images from the one source:

```bash
cd frontend && python3 scripts/pwa-icons.py      # needs Pillow
```

The launch images are listed by device in `layout.tsx` with their exact media
queries. iOS matches on size alone and shows a blank screen when nothing
matches, so a new device size means a new entry in **both** places.
