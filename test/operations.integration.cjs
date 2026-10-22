// Run after npm run build, against an EMPTY, migrated LOCAL test database only.
// DATABASE_URL=postgresql://...@127.0.0.1:55439/enzily_operations_test node test/operations.integration.cjs
const assert = require('node:assert/strict');
const url = new URL(process.env.DATABASE_URL || '');
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.includes('_test'), 'LOCAL *_test database required');
process.env.JWT_SECRET = 'operations-integration-test-secret';
process.env.ADMIN_EMAILS = 'admin@qa.invalid';
process.env.AUTO_MONTHLY_SEASON_RESET = 'false';
process.env.ONESIGNAL_APP_ID = 'qa-only';
process.env.ONESIGNAL_REST_API_KEY = 'qa-only';
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { MonthlyAwardsService } = require('../dist/users/monthly_awards.service');
const { StoreService } = require('../dist/store/store.service');
const { RoomsService } = require('../dist/rooms/rooms.service');
const { reportMonth } = require('../dist/operations/reports.controller');

async function main() {
  const db = new PrismaClient();
  assert.equal(await db.user.count(), 0, 'Use an empty test DB');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const api = request(app.getHttpServer());
  const token = (id, email) => jwt.sign({ sub: id, email }, process.env.JWT_SECRET);
  const admin = token('admin', 'admin@qa.invalid');
  const host = token('qa-host', 'host@qa.invalid');
  const headers = t => ({ Authorization: `Bearer ${t}` });
  try {
    await db.user.createMany({ data: [
      { id: 'qa-host', email: 'host@qa.invalid', displayName: 'Host', creditBalance: 1000, createdAt: new Date('2026-09-30T21:30:00Z') },
      { id: 'qa-guest', email: 'guest@qa.invalid', displayName: 'Guest', createdAt: new Date('2026-09-30T20:30:00Z') },
      { id: 'qa-test', email: 'test@qa.invalid', displayName: 'Test', isTestAccount: true },
    ] });
    assert.equal((await api.get('/api/admin/reports/monthly')).status, 401);
    assert.equal((await api.get('/api/admin/reports/monthly').set(headers(host))).status, 401);
    assert.equal((await api.get('/api/admin/reports/monthly?month=2026-13').set(headers(admin))).status, 400);
    assert.equal(reportMonth('2026-10').gte.toISOString(), '2026-09-30T21:00:00.000Z');
    assert.equal(reportMonth('2026-12').lt.toISOString(), '2026-12-31T21:00:00.000Z');

    let r = await api.patch('/api/admin/operations/maintenance').set(headers(admin)).send({ enabled: true, message: 'QA maintenance' });
    assert.equal(r.body.data.maintenanceEnabled, true);
    assert.equal((await api.get('/api/app-settings')).body.data.maintenanceMessage, 'QA maintenance');
    await assert.rejects(() => app.get(RoomsService).createRoom('كوت', 'qa-host'), /QA maintenance/);
    assert.equal((await api.patch('/api/admin/operations/maintenance').set(headers(host)).send({ enabled: false })).status, 401);
    await api.patch('/api/admin/operations/maintenance').set(headers(admin)).send({ enabled: false });
    await api.patch(`/api/admin/operations/games/${encodeURIComponent('كوت')}`).set(headers(admin)).send({ visible: false });
    await assert.rejects(() => app.get(RoomsService).createRoom('كوت', 'qa-host'), /GAME_HIDDEN/);
    assert((await api.get('/api/app-settings')).body.data.hiddenGameIds.includes('كوت'));
    await api.patch(`/api/admin/operations/games/${encodeURIComponent('كوت')}`).set(headers(admin)).send({ visible: true });

    r = await api.post('/api/admin/sponsors').set(headers(admin)).send({ code: 'QA-SP', name: 'Venue', locationLock: true, lockLat: 29.3, lockLng: 47.9, lockRadius: 100, themePrimary: '#112233' });
    assert.equal(r.body.ok, true);
    await api.post('/api/admin/sponsors/QA-SP/games').set(headers(admin)).send({ gameId: 'كوت' });
    const rooms = app.get(RoomsService);
    await assert.rejects(() => rooms.createRoom('كوت', 'qa-host', 'QA-SP'), /NEED_LOCATION/);
    await assert.rejects(() => rooms.createRoom('كوت', 'qa-host', 'QA-SP', undefined, 30, 48), /TOO_FAR/);
    const venueRoom = await rooms.createRoom('كوت', 'qa-host', 'QA-SP', undefined, 29.3, 47.9);
    await assert.rejects(() => rooms.join(venueRoom.code, 'qa-guest'), /NEED_LOCATION/);
    await assert.rejects(() => rooms.join(venueRoom.code, 'qa-guest', 30, 48), /TOO_FAR/);
    await rooms.join(venueRoom.code, 'qa-guest', 29.3, 47.9);
    await api.patch('/api/admin/operations/maintenance').set(headers(admin)).send({ enabled: true });
    await assert.rejects(() => rooms.start(venueRoom.code, 'qa-host', { timerSec: 60 }), /QA maintenance/);
    await assert.rejects(() => rooms.submitResult(venueRoom.code, 'qa-host', { winners: ['qa-host'], losers: ['qa-guest'] }), /QA maintenance/);
    await assert.rejects(() => rooms.voteResult(venueRoom.code, 'qa-guest', true), /QA maintenance/);
    await api.patch('/api/admin/operations/maintenance').set(headers(admin)).send({ enabled: false });
    await db.room.update({ where: { code: venueRoom.code }, data: { status: 'ended' } });
    r = await api.post('/api/admin/dewanyah').set(headers(admin)).send({ name: 'QA Dew', gameId: 'كوت', ownerUserId: 'qa-host', themePrimary: '#884422', themeAccent: '#33aa66' });
    assert.equal(r.body.ok, true);
    const dewId = r.body.data.id;
    await api.patch(`/api/admin/dewanyah/${dewId}`).set(headers(admin)).send({ themePrimary: '#123ABC', themeAccent: '#456DEF' });
    assert.equal((await db.dewanyah.findUnique({ where: { id: dewId } })).themePrimary, '#123ABC');
    assert((await api.get('/api/dewanyah')).body.data.some(d => d.id === dewId && d.themeAccent === '#456DEF'));

    const now = new Date(), old = new Date(now.getTime() - 25 * 3600000);
    await db.timelineEvent.createMany({ data: [
      { id: 'qa-inbox-global', kind: 'APP_NOTIFICATION', meta: { titleAr: 'Global' } },
      { id: 'qa-inbox-mine', userId: 'qa-host', kind: 'APP_NOTIFICATION', meta: { titleAr: 'Mine' } },
      { id: 'qa-inbox-private', userId: 'qa-guest', kind: 'APP_NOTIFICATION', meta: { titleAr: 'Private' } },
      { id: 'qa-inbox-expired', kind: 'APP_NOTIFICATION', createdAt: old, meta: { titleAr: 'Expired' } },
    ] });
    r = await api.get('/api/notifications').set(headers(host));
    assert.deepEqual(r.body.data.map(n => n.id).sort(), ['qa-inbox-global', 'qa-inbox-mine']);
    const broadcastFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({ errors: ['unavailable'] }), { status: 503 });
    try {
      const broadcast = await api.post('/api/admin/notifications/broadcast').set(headers(admin)).send({ titleAr: 'تنبيه اختبار', messageAr: 'يحفظ حتى لو فشل Push' });
      assert.equal(broadcast.body.ok, true);
      assert.equal(broadcast.body.data.push.sent, false);
      assert(await db.timelineEvent.findUnique({ where: { id: broadcast.body.data.inAppNotificationId } }));
    } finally { global.fetch = broadcastFetch; }

    const date = new Date('2026-09-15T12:00:00Z');
    await db.dewanyahMember.upsert({ where: { dewanyahId_userId: { dewanyahId: dewId, userId: 'qa-guest' } }, update: { status: 'approved' }, create: { dewanyahId: dewId, userId: 'qa-guest', status: 'approved' } });
    for (const [i, userId] of ['qa-host', 'qa-guest'].entries()) {
      await db.dewanyahGameWallet.upsert({ where: { userId_dewanyahId_gameId: { userId, dewanyahId: dewId, gameId: 'كوت' } }, update: { seasonYm: 202609, pearls: 12 - i }, create: { userId, dewanyahId: dewId, gameId: 'كوت', seasonYm: 202609, pearls: 12 - i } });
      await db.userGameWallet.upsert({ where: { userId_gameId: { userId, gameId: 'كوت' } }, update: { seasonYm: 202609, pearls: 8 - i }, create: { userId, gameId: 'كوت', seasonYm: 202609, pearls: 8 - i } });
      await db.sponsorGameWallet.upsert({ where: { userId_sponsorCode_gameId: { userId, sponsorCode: 'QA-SP', gameId: 'كوت' } }, update: { seasonYm: 202609, pearls: 9 - i }, create: { userId, sponsorCode: 'QA-SP', gameId: 'كوت', seasonYm: 202609, pearls: 9 - i } });
    }
    for (const scope of ['general', 'sponsor', 'dew']) {
      const room = await db.room.create({ data: { code: `qa-${scope}`, gameId: 'كوت', hostUserId: 'qa-host', status: 'ended', ...(scope === 'dew' ? { dewanyahId: dewId } : {}), ...(scope === 'sponsor' ? { sponsorCode: 'QA-SP' } : {}) } });
      await db.match.create({ data: { gameId: 'كوت', roomCode: room.code, createdAt: date, sponsorCode: scope === 'sponsor' ? 'QA-SP' : null, parts: { create: [{ userId: 'qa-host', outcome: 'WIN' }, { userId: 'qa-guest', outcome: 'LOSS' }] } } });
    }
    // Simulate an early app open that lazily resets balances before the scheduled reset.
    const pearls = require('../dist/common/pearls');
    await pearls.getGamePearls(db, 'qa-host', 'كوت');
    await pearls.getSponsorPearls(db, 'qa-host', 'QA-SP', 'كوت');
    await pearls.getDewanyahPearls(db, 'qa-host', dewId, 'كوت');
    assert.equal(await db.timelineEvent.count({ where: { kind: 'SEASON_WALLET_ARCHIVE' } }), 3);
    let pushes = 0;
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      assert(String(url).startsWith('https://api.onesignal.com/'));
      const payload = JSON.parse(options.body);
      assert.equal(payload.ttl, 86400);
      assert(payload.contents.ar.includes('الفوز:'));
      pushes++;
      return new Response(JSON.stringify({ id: `qa-${pushes}` }), { status: 200 });
    };
    try {
      const awards = app.get(MonthlyAwardsService);
      const a = await awards.dispatch({ seasonYm: 202609 });
      assert.equal(a.awards, 6);
      assert.equal(a.pushesSent, 6);
      const runnerUp = await db.monthlyLeaderboardSnapshot.findFirst({ where: { scope: 'GENERAL', seasonYm: 202609, rank: 2 } });
      assert.equal(runnerUp.pearls, 7, 'Use real saved balances, not wins minus losses');
      const champion = await db.monthlyLeaderboardSnapshot.findFirst({ where: { scope: 'GENERAL', seasonYm: 202609, rank: 1 } });
      assert.equal(champion.leaderUserId, 'qa-host');
      assert.equal(champion.pearls, 8, 'Opening the app in a new month must preserve the old final score');
      const b = await awards.dispatch({ seasonYm: 202609 });
      assert.equal(b.eventsCreated, 0);
      assert.equal(pushes, 6, 'Repeated sends must not notify winners again');
    } finally { global.fetch = originalFetch; }

    const before = await db.user.findUnique({ where: { id: 'qa-host' } });
    await Promise.all([app.get(StoreService).buy('qa-host', 'vip_monthly'), app.get(StoreService).buy('qa-host', 'vip_monthly')]);
    const purchases = await db.vipPurchase.findMany({ where: { userId: 'qa-host' }, orderBy: { startsAt: 'asc' } });
    assert.equal(purchases.length, 2);
    assert.equal(purchases[0].endsAt.getTime(), purchases[1].startsAt.getTime(), 'Concurrent renewal periods must not overlap');
    const after = await db.user.findUnique({ where: { id: 'qa-host' } });
    assert.equal(before.creditBalance - after.creditBalance, purchases.reduce((s,p) => s + p.creditsCharged, 0));
    r = await api.get('/api/admin/reports/monthly?month=2026-10').set(headers(admin));
    assert.equal(r.body.data.summary.registeredUsers, 2);
    assert.equal(r.body.data.summary.newUsers, 1, 'Kuwait month boundary');
    assert.equal(r.body.data.summary.subscriptionPurchases, 2);
    r = await api.get('/api/admin/reports/monthly?month=2026-09').set(headers(admin));
    assert.equal(r.body.data.summary.monthlyPlayers, 2);
    assert.equal(r.body.data.summary.matches, 3);
    assert.equal(r.body.data.users.find(u => u.id === 'qa-host').wins, 3);
    const { SeasonResetService } = require('../dist/users/season_reset.service');
    await db.userGameWallet.update({ where: { userId_gameId: { userId: 'qa-host', gameId: 'كوت' } }, data: { pearls: 14, seasonYm: 202610 } });
    await app.get(SeasonResetService).runMonthlySeasonReset({ sendPush: false });
    assert.equal((await db.userGameWallet.findUnique({ where: { userId_gameId: { userId: 'qa-host', gameId: 'كوت' } } })).pearls, 14, 'Scheduled reset must preserve points already earned in the new season');
    const timeline = await api.get('/api/timeline?scope=all').set(headers(host));
    assert(timeline.body.data.every(e => e.kind !== 'SEASON_WALLET_ARCHIVE' && e.kind !== 'APP_NOTIFICATION'));
    // Adding purchase history must not break the existing account-deletion flow.
    await db.user.create({ data: { id: 'qa-delete', email: 'delete@qa.invalid', displayName: 'Delete', creditBalance: 1000 } });
    await app.get(StoreService).buy('qa-delete', 'vip_monthly');
    const deleting = token('qa-delete', 'delete@qa.invalid');
    const deleted = await api.delete('/api/users/me').set(headers(deleting));
    assert.equal(deleted.body.ok, true);
    assert.equal(await db.vipPurchase.count({ where: { userId: null } }), 1, 'Retain anonymous accounting without retaining the deleted account');
    console.log('PASS: admin authorization, Kuwait month boundaries, maintenance, game visibility, sponsor geofence create/join, dewanyah colors, inbox privacy/expiry, all 3 leaderboard scopes, duplicate sends, concurrent VIP renewal and monthly reports.');
  } finally { await app.close(); await db.$disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
