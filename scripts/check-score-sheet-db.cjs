// Read-only readiness check. Never prints DATABASE_URL or player data.
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const rows = await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'RoomScoreSheet'`);
  const names = new Set(rows.map(r => r.column_name));
  const missing = ['roomCode','revision','snapshot','updatedAt'].filter(name => !names.has(name));
  console.log(JSON.stringify({scoreSheetReady: missing.length === 0, missingColumns: missing}));
  if(missing.length)process.exitCode=1;
})().catch(() => { console.error('Could not check database readiness.');process.exitCode=1; }).finally(() => db.$disconnect());
