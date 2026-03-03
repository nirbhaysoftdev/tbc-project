// src/utils/seed.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { Pool }       = require('pg');
const bcrypt         = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function main() {
  console.log('🌱 Seeding database...');

  const now = new Date();

  // ── Admin ─────────────────────────────────────────────
  const adminPass = await bcrypt.hash('Admin@123', 12);
  await query(`
    INSERT INTO users (id, name, email, "passwordHash", role, status, "createdAt", "updatedAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  `, [uuidv4(), 'TBC Admin', 'admin@trillionbc.com', adminPass, 'ADMIN', 'ACTIVE', now, now]);
  console.log('✅ Admin created: admin@trillionbc.com');

  // ── Member ────────────────────────────────────────────
  const memberPass = await bcrypt.hash('Member@123', 12);
  await query(`
    INSERT INTO users (id, name, email, "passwordHash", role, status, "createdAt", "updatedAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  `, [uuidv4(), 'Antonino Salafia', 'antonino@trillionbc.com', memberPass, 'MEMBER', 'ACTIVE', now, now]);
  console.log('✅ Member created: antonino@trillionbc.com');

  const [member] = await query(`SELECT id FROM users WHERE email = $1`, ['antonino@trillionbc.com']);

  // ── Wallet ────────────────────────────────────────────
  await query(`
    INSERT INTO wallets (id, "userId", "investmentAmount", "profitAmount", "totalBalance", currency, "lastUpdated", frozen)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT ("userId") DO UPDATE
      SET "investmentAmount" = EXCLUDED."investmentAmount",
          "profitAmount"     = EXCLUDED."profitAmount",
          "totalBalance"     = EXCLUDED."totalBalance"
  `, [uuidv4(), member.id, 110000, 33000, 143000, 'EUR', now, false]);
  console.log('✅ Wallet created: €143,000');

  // ── Transactions ──────────────────────────────────────
  const txns = [
    { type: 'CREDIT', description: 'Initial Investment',     amount: 110000, status: 'COMPLETED', date: '2024-01-15' },
    { type: 'CREDIT', description: 'Q1 Profit Distribution', amount: 11000,  status: 'COMPLETED', date: '2024-04-01' },
    { type: 'CREDIT', description: 'Q2 Profit Distribution', amount: 11000,  status: 'COMPLETED', date: '2024-07-01' },
    { type: 'CREDIT', description: 'Q3 Profit Distribution', amount: 11000,  status: 'COMPLETED', date: '2024-10-01' },
    { type: 'DEBIT',  description: 'Withdrawal Request',      amount: 2000,   status: 'COMPLETED', date: '2024-11-15' },
    { type: 'CREDIT', description: 'Bonus Allocation',        amount: 3000,   status: 'COMPLETED', date: '2024-12-01' },
    { type: 'CREDIT', description: 'Year-End Profit',         amount: 5000,   status: 'PENDING',   date: '2025-01-01' },
  ];

  for (const tx of txns) {
    const ref = 'SEED-' + tx.description.replace(/\s+/g, '-').toUpperCase();
    await query(`
      INSERT INTO transactions (id, "userId", type, description, amount, status, reference, "createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (reference) DO NOTHING
    `, [uuidv4(), member.id, tx.type, tx.description, tx.amount, tx.status, ref, new Date(tx.date)]);
  }
  console.log('✅ Transactions seeded');

  // ── Dev notice ────────────────────────────────────────
  await query(`
    INSERT INTO system_config (id, key, value, "updatedAt")
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [uuidv4(), 'dev_notice', '⚠️  Development Mode — Full feature available in next release.', now]);
  console.log('✅ Dev notice seeded');

  console.log('\n🎉 Seed complete!');
  console.log('   Admin:  admin@trillionbc.com  /  Admin@123');
  console.log('   Member: antonino@trillionbc.com  /  Member@123\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => pool.end());