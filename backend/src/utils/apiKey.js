#!/usr/bin/env node
// src/utils/apiKey.js
//
// Issue, list and revoke API keys from the server shell.
//
// WHY THIS EXISTS when the endpoints already do it: the first key has to be
// created before anything can call the API, and on a fresh deployment there
// may be no super admin session to hand (and no panel screen built yet). It is
// also the right tool during an incident - revoking a leaking key over SSH
// does not depend on the portal being up.
//
//   npm run apikey:list
//   npm run apikey:create -- --name "Marketing site" --scopes events:read
//   npm run apikey:create -- --name "Dashboard" --scopes events:read,events:sensitive --days 90
//   npm run apikey:create -- --name "Status board" --scopes events:counts --no-expiry
//   npm run apikey:revoke -- --id <uuid>
//
// The key is printed ONCE, here, and cannot be retrieved afterwards. It is
// written to stdout and nowhere else: do not redirect this into a file that
// ends up in the repository.
require('dotenv').config();

const prisma = require('./prismaClient');
const apiKeys = require('../services/apiKeys');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[name] = true;
    } else {
      args[name] = next;
      i += 1;
    }
  }
  return args;
}

const usage = () => {
  console.log(`
Usage:
  node src/utils/apiKey.js list
  node src/utils/apiKey.js create --name "<name>" --scopes <a,b> [--days N | --no-expiry]
  node src/utils/apiKey.js revoke --id <uuid>

Scopes:
${Object.entries(apiKeys.SCOPES).map(([s, d]) => `  ${s.padEnd(18)} ${d}`).join('\n')}
`);
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!command || command === 'help' || args.help) {
    usage();
    return;
  }

  if (command === 'list') {
    const keys = await apiKeys.listApiKeys();
    if (!keys.length) {
      console.log('No API keys. Create one with: npm run apikey:create -- --name "…" --scopes events:read');
      return;
    }
    for (const k of keys) {
      console.log([
        k.status.padEnd(8),
        `${k.keyPrefix}…`.padEnd(20),
        k.name.padEnd(28),
        k.scopes.join(','),
        `last used ${k.lastUsedAt ? k.lastUsedAt.toISOString() : 'never'}`,
        k.expiresAt ? `expires ${k.expiresAt.toISOString().slice(0, 10)}` : 'no expiry',
        k.id,
      ].join('  '));
    }
    return;
  }

  if (command === 'create') {
    if (!args.name || args.name === true) throw new Error('--name is required');
    if (!args.scopes || args.scopes === true) {
      throw new Error(`--scopes is required, one or more of: ${apiKeys.SCOPE_NAMES.join(', ')}`);
    }

    const { key, apiKey } = await apiKeys.createApiKey({
      name:   args.name,
      scopes: String(args.scopes).split(','),
      // `--no-expiry` has to be typed out. A key that never expires is a
      // decision, not something you get by leaving a flag off.
      expiresInDays: args['no-expiry'] ? null : (args.days ? Number(args.days) : undefined),
      // No session here, so no creator to record. The activity log is written
      // by the endpoints; a key created on the server shell shows `createdBy`
      // as null, which is itself the signal that it was made out of band.
      createdById: null,
    });

    console.log(`\n  ${apiKey.name}`);
    console.log(`  scopes:  ${apiKey.scopes.join(', ')}`);
    console.log(`  expires: ${apiKey.expiresAt ? apiKey.expiresAt.toISOString() : 'never'}`);
    console.log(`  id:      ${apiKey.id}\n`);
    console.log(`  ${key}\n`);
    console.log('  ^ shown once. Store it now - it cannot be recovered, only rotated.\n');
    console.log('  Use it as:  curl -H "X-API-Key: <key>" "$API/api/admin/events?kind=SIGNUP"\n');
    return;
  }

  if (command === 'revoke') {
    if (!args.id || args.id === true) throw new Error('--id is required (see: npm run apikey:list)');
    const revoked = await apiKeys.revokeApiKey(args.id, { revokedById: null });
    if (!revoked) throw new Error(`No API key with id ${args.id}`);
    console.log(`Revoked ${revoked.keyPrefix}… (${revoked.name}). It stops working on its next request.`);
    return;
  }

  usage();
  throw new Error(`Unknown command "${command}"`);
}

main()
  .catch((err) => {
    console.error(`\n  ${err.invalid ? `Unknown scope: ${err.invalid.join(', ')}` : err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
