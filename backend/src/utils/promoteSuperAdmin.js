// src/utils/promoteSuperAdmin.js
//
// Grant SUPER_ADMIN to an existing account by email.
//
// This exists because the role is circular: only a super admin can grant it,
// so the first one cannot come from the panel. Run this once per environment
// against a real account, then do everything else from Admin → Super Admin.
//
//   npm run promote:super-admin -- you@example.com
//
// Safe to re-run: promoting an account that already holds the role is a no-op.
// It deliberately will not create an account — the address must already exist,
// so a typo cannot quietly mint a privileged user.

const prisma = require('./prismaClient');

async function main() {
  const email = (process.argv[2] || '').toLowerCase().trim();

  if (!email) {
    console.error('Usage: npm run promote:super-admin -- <email>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where:  { email },
    select: { id: true, name: true, email: true, role: true, status: true, deletedAt: true },
  });

  if (!user) {
    console.error(`✖ No account with the email ${email}.`);
    console.error('  Create or register the account first, then run this again.');
    process.exit(1);
  }
  if (user.deletedAt) {
    console.error(`✖ ${email} is a deleted account. Restore it before promoting it.`);
    process.exit(1);
  }
  if (user.role === 'SUPER_ADMIN') {
    console.log(`✓ ${email} is already a super admin. Nothing to do.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data:  { role: 'SUPER_ADMIN', status: 'ACTIVE' },
  });

  // Logged like any other role change, with no actor: it came from the shell,
  // not from a person acting inside the portal.
  await prisma.adminLog.create({
    data: {
      adminId:  user.id,
      targetId: user.id,
      action:   'SA_BOOTSTRAP_ROLE',
      details:  { from: user.role, to: 'SUPER_ADMIN', via: 'promoteSuperAdmin script' },
    },
  });

  console.log(`✓ ${user.name || email} promoted: ${user.role} → SUPER_ADMIN`);
  if (user.status !== 'ACTIVE') {
    console.log(`  Status was ${user.status}; set to ACTIVE so the account can sign in.`);
  }
}

main()
  .catch((err) => {
    console.error('✖ Promotion failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
