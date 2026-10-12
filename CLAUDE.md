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
longer leave a stale client behind. A stale client selects columns the database
does not have, which produces the same 500s as missing migrations.

## Deploying

```bash
cd /var/www/tbc-project && git pull origin main

cd backend
npm install                 # regenerates the Prisma client via postinstall
npx prisma migrate deploy   # only when migrations changed
pm2 restart tbc-api

cd ../frontend
npm install && rm -rf .next out && npm run build
rsync -a --delete out/ /var/www/tbc-project/frontend-dist/
```

**The rsync is not optional.** `npm run build` writes to `frontend/out/`, but
nginx serves `/var/www/tbc-project/frontend-dist`. Skipping it means the build
silently changes nothing on the live site.

Never run `db:reset` (drops the database) or `db:migrate` (that is
`migrate dev`, which can offer to reset on drift) against production.
`db:deploy` is the production-safe one.

## Uploads are authorised, never static

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

**To add a new private upload:** store its path on a model, then add that
column to the `DOC` branch of `classifyStoredUrl`. Nothing else is needed — no
route or nginx change. A file no column points at returns 404 to everyone,
including admins, so a "missing" upload usually means an unrecorded path.

In the UI, open documents with `openDocument()` and render secured images with
`useSignedSrc()`. A plain `<a href>` or `<img src>` gets 403: the browser
cannot attach the Bearer token, so both helpers exchange the path for a
short-lived signed URL first.

nginx must proxy `/uploads` to the API. If it ever serves that path with
`alias` or `root`, every check above is bypassed and the files are public.

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
