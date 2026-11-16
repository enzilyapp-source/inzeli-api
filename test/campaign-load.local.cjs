// LOCAL ONLY. Never reads .env, accepts a remote URL, or sends real OTP/Push.
// Build first; use a fresh *_test PostgreSQL DB with the current schema.
// RUN_LOCAL_CAMPAIGN_LOAD=1 DATABASE_URL=postgresql://...@127.0.0.1/..._test node test/campaign-load.local.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
assert.equal(process.env.RUN_LOCAL_CAMPAIGN_LOAD, '1', 'Explicit LOCAL test opt-in required');
const database = new URL(process.env.DATABASE_URL || '');
assert.equal(database.hostname, '127.0.0.1', 'Only IPv4 loopback databases allowed');
assert(database.pathname.endsWith('_test'), 'A dedicated *_test database is required');
assert(!database.password, 'Use the local test cluster, never production credentials');
const secret = 'campaign-local-synthetic-users-only';
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'LOAD_STAGE_SECONDS'].includes(key)));
Object.assign(env, {
  RUN_LOCAL_CAMPAIGN_LOAD: '1', DATABASE_URL: database.toString(),
  NODE_ENV: 'test', JWT_SECRET: secret, ADMIN_EMAILS: 'admin@load.invalid',
  AUTO_MONTHLY_SEASON_RESET: 'false', UPLOADS_DIR: '/private/tmp/enzily-campaign-uploads',
  AUTH_TEST_ACCOUNT_EMAILS: Array.from({ length: 100 }, (_, i) => `new${i}@load.invalid`).join(','),
});
// Apply the same sanitized environment in both parent and child. Clearing all
// provider keys also protects against invoking this script from a signed-in shell.
for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
Object.assign(process.env, env);
// Prisma can auto-discover the project's .env even without a dotenv import.
// Hide env files before loading Prisma so production provider keys are never read.
const originalExists = fs.existsSync, originalRead = fs.readFileSync;
const isEnvFile = file => /^\.env(?:\.|$)/.test(path.basename(String(file)));
fs.existsSync = file => isEnvFile(file) ? false : originalExists(file);
fs.readFileSync = (file, ...args) => {
  if (isEnvFile(file)) throw new Error('ENV_FILE_ACCESS_DISABLED_IN_LOCAL_LOAD_TEST');
  return originalRead(file, ...args);
};
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const game = 'شطرنج';
const playerId = i => `load-user-${i}`;
const roomCode = i => `LOAD${String(Math.floor(i / 4)).padStart(4, '0')}`;
const stageSeconds = Number(process.env.LOAD_STAGE_SECONDS || 60);
const actorCount = 500;
const reportFile = path.join(root, 'output', 'performance', 'campaign-baseline-20261026.json');

async function server() {
  // Block accidental outbound side effects, even if future app code adds a job.
  global.fetch = async () => { throw new Error('EXTERNAL_HTTP_DISABLED_IN_LOCAL_LOAD_TEST'); };
  const { NestFactory } = require('@nestjs/core');
  const { ModulesContainer } = require('@nestjs/core');
  const { ValidationPipe } = require('@nestjs/common');
  const { AppModule } = require('../dist/app.module');
  const { rateLimitMiddleware } = require('../dist/common/rate-limit.middleware');
  const { RoomsService } = require('../dist/rooms/rooms.service');
  const { PrismaService } = require('../dist/prisma.service');
  const app = await NestFactory.create(AppModule, { logger: false });
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', 1);
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  let lastCpu = process.cpuUsage(), lastAt = performance.now();
  express.get('/__local_metrics', (_req, res) => {
    const elapsed = performance.now() - lastAt;
    const cpu = process.cpuUsage(lastCpu);
    res.json({ rssMb: Math.round(process.memoryUsage().rss / 1048576),
      cpuOneCorePercent: Math.round((cpu.user + cpu.system) / (elapsed * 10)),
      eventLoopP99Ms: Math.round(loop.percentile(99) / 1e6) });
    lastCpu = process.cpuUsage(); lastAt = performance.now(); loop.reset();
  });
  app.use(require('helmet')());
  app.use(rateLimitMiddleware);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  // The real recurring reminder scan must not send notifications during a test.
  const rooms = app.get(RoomsService);
  if (rooms.reminderTicker) clearInterval(rooms.reminderTicker);
  const port = app.getHttpServer().address().port;
  if (process.send) process.send({ port });
  const close = async () => {
    loop.disable();
    await app.close();
    const clients = new Set();
    for (const mod of app.get(ModulesContainer).values())
      for (const wrapper of mod.providers.values())
        if (wrapper.instance instanceof PrismaService) clients.add(wrapper.instance);
    await Promise.all([...clients].map(client => client.$disconnect()));
    process.exit(0);
  };
  process.on('SIGTERM', () => void close());
}

async function seed(db) {
  assert.equal(await db.user.count(), 0, 'Use a NEW empty local DB; existing data is never deleted');
  const catalog = require('../dist/operations/main-games').MAIN_GAME_IDS;
  const now = new Date(), ym = now.getFullYear() * 100 + now.getMonth() + 1;
  await db.game.createMany({ data: catalog.map(id => ({ id, name: id, category: 'LOAD QA' })) });
  await db.user.createMany({ data: Array.from({ length: actorCount }, (_, i) => ({
    id: playerId(i), publicId: `load-public-${i}`, email: `user${i}@load.invalid`,
    username: `load_user_${i}`, displayName: `Synthetic Player ${i}`, pearls: 5,
    creditPoints: 5, permanentScore: 11, creditBalance: 1000, pearlsSeasonYm: ym,
  })) });
  for (let i = 0; i < actorCount; i += 50)
    await db.userGameWallet.createMany({ data: Array.from({ length: 50 }, (_, j) =>
      catalog.map(gameId => ({ userId: playerId(i + j), gameId, pearls: 5,
        badgeScore: 5, badgeLossCount: 0, seasonYm: ym }))).flat() });
  await db.room.createMany({ data: Array.from({ length: 125 }, (_, i) => ({
    code: roomCode(i * 4), gameId: game, hostUserId: playerId(i * 4),
    status: 'running', startedAt: now, timerSec: 3600,
  })) });
  await db.roomPlayer.createMany({ data: Array.from({ length: actorCount }, (_, i) => ({
    roomCode: roomCode(i), userId: playerId(i), team: i % 4 < 2 ? 'A' : 'B',
    isLeader: i % 4 === 0 || i % 4 === 2,
  })) });
  // Larger than the current live match history, but not a forecast of real growth.
  for (let offset = 0; offset < 3000; offset += 250) {
    const matches = Array.from({ length: 250 }, (_, j) => ({
      id: `load-match-${offset + j}`, gameId: game,
      createdAt: new Date(now.getTime() - (offset + j) * 60000),
    }));
    await db.match.createMany({ data: matches });
    await db.matchParticipant.createMany({ data: matches.flatMap((m, j) =>
      Array.from({ length: 4 }, (_, k) => ({ matchId: m.id,
        userId: playerId(((offset + j) % 125) * 4 + k), outcome: k < 2 ? 'WIN' : 'LOSS' }))) });
  }
  for (let offset = 0; offset < 25000; offset += 1000)
    await db.timelineEvent.createMany({ data: Array.from({ length: 1000 }, (_, j) => ({
      id: `load-event-${offset + j}`, userId: playerId((offset + j) % actorCount),
      gameId: game, kind: (offset + j) % 5 ? 'MATCH_RECORDED' : 'APP_NOTIFICATION',
      createdAt: new Date(now.getTime() - (offset + j) * 1000),
      meta: { titleAr: 'اختبار محلي', messageAr: 'بيانات وهمية' },
    })) });
  return { users: actorCount, rooms: 125, matches: 3000, participants: 12000,
    events: 25000, gameWallets: actorCount * catalog.length };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]);
}
const agent = new http.Agent({ keepAlive: true, maxSockets: 1200, maxFreeSockets: 100 });
function request(port, method, route, actor, stage, timeout = 12000, body) {
  assert(Number.isInteger(port) && port > 0);
  const started = performance.now();
  return new Promise(resolve => {
    let done = false;
    const finish = result => { if (!done) { done = true; resolve({ ...result, ms: performance.now() - started }); } };
    const encoded = body === undefined ? '' : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, agent,
      headers: { Authorization: `Bearer ${actor.token}`,
        'x-forwarded-for': actor.ip || `10.${stage}.${Math.floor(actor.i / 250)}.${actor.i % 250 + 1}`,
        ...(method === 'POST' ? { 'Content-Length': Buffer.byteLength(encoded),
          'Content-Type': 'application/json' } : {}) },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try { const data = JSON.parse(Buffer.concat(chunks));
          finish({ status: res.statusCode, ok: res.statusCode < 400 && data.ok !== false,
            code: data.code, data: route.startsWith('/__local_') ? data : undefined });
        } catch { finish({ status: res.statusCode, ok: false, code: 'INVALID_JSON' }); }
      });
      res.on('error', () => finish({ status: 0, ok: false, code: 'RESPONSE_ERROR' }));
    });
    const timer = setTimeout(() => req.destroy(new Error('DEADLINE')), timeout);
    req.on('close', () => clearTimeout(timer));
    req.on('error', e => finish({ status: 0, ok: false, code: e.message === 'DEADLINE' ? 'TIMEOUT' : e.code || 'NETWORK_ERROR' }));
    req.end(encoded);
  });
}

async function fingerprint(db) {
  // Hash only synthetic account identity/balances and room participation; no values leave the DB.
  return db.$queryRawUnsafe(`SELECT 'users' AS kind, count(*)::int AS count,
    md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY t.id)) AS hash
    FROM (SELECT id,"publicId",username,email,"creditBalance",pearls,"permanentScore" FROM "User") t
    UNION ALL SELECT 'rooms', count(*)::int, md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY t.code))
    FROM (SELECT code,"hostUserId",status,"resultStatus","resultPayload" FROM "Room") t
    UNION ALL SELECT 'players', count(*)::int, md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY t."roomCode",t."userId"))
    FROM (SELECT "roomCode","userId",team FROM "RoomPlayer") t
    ORDER BY kind`);
}

async function loadStage(port, count, index, actors) {
  const stats = {}, pending = new Set();
  let peakInflight = 0, scheduledCycles = 0;
  const add = (label, result) => {
    const s = stats[label] ||= { latencies: [], successfulLatencies: [], errors: {}, total: 0, success: 0 };
    s.total++; s.latencies.push(result.ms);
    if (result.ok) { s.success++; s.successfulLatencies.push(result.ms); }
    else { const key = `${result.status}:${result.code || 'ERROR'}`; s.errors[key] = (s.errors[key] || 0) + 1; }
  };
  const send = async (label, method, route, actor) => {
    const result = await request(port, method, route, actor, index); add(label, result); return result;
  };
  const tasks = [];
  const duration = stageSeconds * 1000;
  await request(port, 'GET', '/__local_metrics', actors[0], index);
  const started = performance.now();
  const schedule = (delay, action) => tasks.push(new Promise(resolve => {
    setTimeout(() => {
      const p = Promise.resolve().then(action).finally(() => { pending.delete(p); resolve(); });
      pending.add(p); peakInflight = Math.max(peakInflight, pending.size);
    }, delay);
  }));
  for (const actor of actors.slice(0, count)) {
    const phase = actor.i * 3000 / count;
    for (let at = phase; at < duration; at += 3000) schedule(at, async () => {
      scheduledCycles++;
      const room = await send('room', 'GET', `/api/rooms/${roomCode(actor.i)}`, actor);
      if (room.ok) await send('roomState', 'GET', `/api/rooms/${roomCode(actor.i)}/state`, actor);
    });
    for (let at = phase; at < duration; at += 30000) schedule(at, () => Promise.all([
      send('settings', 'GET', '/api/app-settings', actor),
      send('inbox', 'GET', '/api/notifications', actor),
    ]));
    if (actor.i % 10 === 0)
      for (let at = phase; at < duration; at += 15000)
        schedule(at, () => send('leaderboard', 'GET', `/api/leaderboard/game?gameId=${encodeURIComponent(game)}&limit=50`, actor));
    // Once per actor, spread across the first 10s, including the real session hydration.
    schedule(actor.i * 10000 / count, () => send('sessionRefresh', 'POST', '/api/auth/refresh', actor));
  }
  await Promise.all(tasks);
  const elapsed = performance.now() - started;
  const metrics = await request(port, 'GET', '/__local_metrics', actors[0], index);
  const result = { virtualUsers: count, offeredDurationSeconds: stageSeconds,
    actualElapsedSeconds: Math.round(elapsed / 100) / 10, scheduledRoomCycles: scheduledCycles,
    peakInflightCycles: peakInflight, server: metrics.data, endpoints: {} };
  for (const [label, s] of Object.entries(stats)) result.endpoints[label] = {
    requests: s.total, success: s.success, errors: s.errors,
    p50Ms: percentile(s.latencies, .5), p95Ms: percentile(s.latencies, .95),
    p99Ms: percentile(s.latencies, .99), successfulP95Ms: percentile(s.successfulLatencies, .95),
  };
  console.log(JSON.stringify({ event: 'stage-complete', ...result }));
  return result;
}

async function main() {
  const db = new PrismaClient();
  let child;
  const report = { startedAt: new Date().toISOString(), productionTouched: false,
    limitations: ['Local machine, not Render/Neon performance certification',
      'No mobile UI or real OTP/Push provider load', 'No CPU cgroup limit; Node heap capped at 1 GB',
      'Session refresh exercises existing users; new registration surge needs separate validation',
      'Short synthetic stages; not a long-duration soak test'],
    host: { platform: process.platform, cpuCount: os.cpus().length, cpu: os.cpus()[0]?.model,
      totalMemoryGb: Math.round(os.totalmem() / 1073741824), node: process.version },
    database: { host: database.hostname, name: database.pathname.slice(1),
      connectionsPerPrismaClient: database.searchParams.get('connection_limit') }, stages: [] };
  try {
    report.fixtures = await seed(db);
    console.log(JSON.stringify({ event: 'fixtures-ready', ...report.fixtures }));
    const before = await fingerprint(db);
    const log = fs.openSync('/private/tmp/enzily-campaign-server.log', 'w', 0o600);
    child = spawn(process.execPath, ['--max-old-space-size=1024', __filename, '--server'], {
      cwd: root, env, stdio: ['ignore', log, log, 'ipc'],
    });
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local server did not start')), 30000);
      child.once('message', m => { clearTimeout(timer); resolve(m.port); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Local server exited: ${code}`)); });
    });
    const actors = Array.from({ length: actorCount }, (_, i) => ({ i,
      token: jwt.sign({ sub: playerId(i), email: `user${i}@load.invalid` }, secret, { expiresIn: '1h' }),
    }));
    for (const [index, count] of [100, 250, 500].entries()) {
      console.log(JSON.stringify({ event: 'stage-start', virtualUsers: count, seconds: stageSeconds }));
      report.stages.push(await loadStage(port, count, index + 1, actors));
      await sleep(2000);
    }
    // Verify the real limiter over HTTP with a shared Wi-Fi IP, without an external target.
    const wifi = [];
    for (let cycle = 0; cycle < 20; cycle++)
      for (const actor of actors.slice(0, 5))
        for (const suffix of ['', '/state']) wifi.push(await request(port, 'GET',
          `/api/rooms/${roomCode(actor.i)}${suffix}`, { ...actor, ip: '192.0.2.45' }, 9));
    report.sharedWifi = { players: 5, requests: wifi.length,
      rejected429: wifi.filter(r => r.status === 429).length,
      failuresOther: wifi.filter(r => !r.ok && r.status !== 429).length,
      note: 'One-minute request volume compressed into sequential requests inside the same limiter window' };
    const after = await fingerprint(db);
    report.syntheticReadIntegrity = { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) };
    assert(report.syntheticReadIntegrity.unchanged, 'Unexpected mutation of synthetic identities, balances or rooms');
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ event: 'complete', sharedWifi: report.sharedWifi,
      unchanged: report.syntheticReadIntegrity.unchanged, reportFile }));
  } finally {
    agent.destroy();
    await db.$disconnect();
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(10000)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
}

module.exports = { env, PrismaClient, request, playerId, roomCode, secret, root, sleep, agent };
if (require.main === module)
  (process.argv.includes('--server') ? server() : main()).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
