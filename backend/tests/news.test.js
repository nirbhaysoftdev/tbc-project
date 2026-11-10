// tests/news.test.js
//
// The business-news module: the public headline strip must carry nothing but a
// headline, the richer payload must stay behind a session, and the feed parser
// must never store a link that is not http(s).
//
// Real router over real HTTP with real JWTs against the development database,
// like the other suites. Its rows are tagged and removed afterwards. It never
// contacts a publisher: it exercises the parser directly and reads the table.
require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const prisma = require('../src/utils/prismaClient');
const fetcher = require('../src/services/newsFetcher');

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set to run these tests');

const suffix = crypto.randomBytes(5).toString('hex');
const SOURCE = `TestWire-${suffix}`;
let server;
let baseUrl;
let member;
let admin;

const tokenFor = (u) => jwt.sign({ userId: u.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
async function call(path, { user, method = 'GET' } = {}) {
  const res = await fetch(`${baseUrl}${path}`, { method, headers: user ? { Authorization: `Bearer ${tokenFor(user)}` } : {} });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { status: res.status, body };
}
const mkUser = (name, role) => prisma.user.create({
  data: { name: `News ${name}`, email: `tbcnews-${suffix}-${name}@example.test`, role, status: 'ACTIVE', emailVerified: true, accountType: 'PROFESSIONAL' },
  select: { id: true, role: true },
});

test.before(async () => {
  const app = express();
  app.use('/api/news', require('../src/routes/news'));
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/news`;
  member = await mkUser('member', 'MEMBER');
  admin = await mkUser('admin', 'ADMIN');
  // Newer than anything a real feed holds, so they head every listing.
  const base = Date.now() + 60 * 1000;
  await prisma.newsItem.createMany({
    data: [0, 1, 2].map((i) => ({
      url: `https://example.test/${suffix}/${i}`,
      title: `Headline ${i} ${suffix}`,
      summary: `Snippet ${i}`,
      source: SOURCE,
      imageUrl: `https://example.test/${suffix}/${i}.jpg`,
      publishedAt: new Date(base - i * 1000),
    })),
  });
});

test.after(async () => {
  await prisma.newsItem.deleteMany({ where: { source: SOURCE } });
  await prisma.user.deleteMany({ where: { id: { in: [member.id, admin.id] } } });
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

test('public headlines need no session and carry the display fields', async () => {
  const { status, body } = await call('/headlines?limit=3');
  assert.equal(status, 200);
  // Three fixtures share one source, and a source is capped at two.
  assert.equal(body.headlines.filter((h) => h.source === SOURCE).length, 2);
  assert.deepEqual(
    Object.keys(body.headlines[0]).sort(),
    ['category', 'id', 'imageUrl', 'publishedAt', 'source', 'summary', 'title'],
  );
  assert.equal(body.headlines[0].title, `Headline 0 ${suffix}`);
});

test('public headlines never let one source fill the page', async () => {
  const { body } = await call('/headlines?limit=12');
  const per = {};
  for (const h of body.headlines) per[h.source] = (per[h.source] || 0) + 1;
  assert.ok(Math.max(...Object.values(per)) <= 2, JSON.stringify(per));
});

test('public headlines carry no publisher link', async () => {
  const { body } = await call('/headlines?limit=12');
  assert.ok(body.headlines.every((h) => !('url' in h)));
});

test('public headlines clamp the limit', async () => {
  const { body } = await call('/headlines?limit=9999');
  assert.ok(body.headlines.length <= 12);
});

test('the detailed listing requires a session', async () => {
  assert.equal((await call('/')).status, 401);
});

test('a member gets snippet and image, search and source filter work', async () => {
  const all = await call(`/?source=${SOURCE}`, { user: member });
  assert.equal(all.status, 200);
  assert.equal(all.body.total, 3);
  assert.equal(all.body.items[0].summary, 'Snippet 0');
  assert.ok(all.body.items[0].imageUrl);
  assert.ok(all.body.sources.some((s) => s.value === SOURCE));

  const hit = await call(`/?q=${encodeURIComponent(`Headline 1 ${suffix}`)}`, { user: member });
  assert.equal(hit.body.total, 1);
});

test('markets are public and only ever carry real, finite figures', async () => {
  const { status, body } = await call('/markets');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.quotes));
  for (const q of body.quotes) {
    assert.ok(Number.isFinite(q.price) && q.price > 0, `${q.key} price`);
    assert.ok(q.changePct === null || Number.isFinite(q.changePct), `${q.key} change`);
  }
});

test('categories come from the text, and unknown stories are plain Business', () => {
  const { categoryOf, betterImage } = require('../src/services/newsCategory');
  assert.equal(categoryOf('Nvidia hit by lawsuit'), 'Technology');
  assert.equal(categoryOf('Oil prices climb as OPEC meets'), 'Energy');
  assert.equal(categoryOf('Bakery wins award'), 'Business');
  assert.equal(betterImage('https://ichef.bbci.co.uk/ace/standard/240/x.jpg'), 'https://ichef.bbci.co.uk/ace/standard/800/x.jpg');
  assert.equal(betterImage(null), null);
});

test('refresh is admin only', async () => {
  assert.equal((await call('/refresh', { user: member, method: 'POST' })).status, 403);
  assert.equal((await call('/refresh', { method: 'POST' })).status, 401);
});

test('the parser rejects non-http links and strips markup', () => {
  const n = fetcher._normalise;
  assert.equal(n({ title: 'x', link: 'javascript:alert(1)' }, 'S'), null);
  assert.equal(n({ title: 'x', link: 'data:text/html,hi' }, 'S'), null);
  assert.equal(n({ title: '  ', link: 'https://a.test/1' }, 'S'), null);

  const ok = n({
    title: 'Fed &amp; markets',
    link: 'https://a.test/1',
    description: '&lt;p&gt;Rates <b>hold</b>.&lt;/p&gt;',
    pubDate: 'Wed, 01 Jan 2099 00:00:00 GMT',
  }, 'S');
  assert.equal(ok.title, 'Fed & markets');
  assert.equal(ok.summary, 'Rates hold.');
  // A date in the future is clamped so a story cannot pin itself to the top.
  assert.ok(ok.publishedAt.getTime() <= Date.now());
});

test('numeric character references are decoded', () => {
  const r = fetcher._normalise({ title: 'Fed&#x2019;s Waller &#8211; rates', link: 'https://a.test/3' }, 'S');
  assert.equal(r.title, 'Fed\u2019s Waller \u2013 rates');
});

test('a description that repeats the headline is dropped', () => {
  const r = fetcher._normalise({ title: 'Same', description: 'Same', link: 'https://a.test/2' }, 'S');
  assert.equal(r.summary, null);
});
