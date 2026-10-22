// Read-only deployment preflight. Never prints DATABASE_URL or credentials.
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const columns = await tx.$queryRaw`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN
      ('AppSettings', 'Game', 'TimelineEvent', 'MonthlyLeaderboardSnapshot', 'VipPurchase', 'User')`;
    const has = (table, column) => columns.some(c => c.table_name === table && c.column_name === column);
    return {
      maintenance: has('AppSettings', 'maintenanceEnabled'),
      gameVisibility: has('Game', 'mainVisible'),
      notificationDeduplication: has('TimelineEvent', 'dedupeKey'),
      archivedRanks: has('MonthlyLeaderboardSnapshot', 'rank'),
      subscriptionLedger: has('VipPurchase', 'creditsCharged'),
      usernames: has('User', 'username'),
    };
  });
  console.log(JSON.stringify(result, null, 2));
  if (Object.values(result).some(v => !v)) {
    console.log('Operations schema is pending. Follow DEVELOPER_HANDOVER.md before deploying the new API.');
    process.exitCode = 2;
  }
})().catch(e => { console.error(e.code || 'DB_CHECK_FAILED'); process.exitCode = 1; })
  .finally(() => db.$disconnect());
