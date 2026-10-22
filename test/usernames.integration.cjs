// DATABASE_URL must point to an isolated LOCAL *_test database with both updates.
const assert = require('node:assert/strict');
const url = new URL(process.env.DATABASE_URL || '');
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.endsWith('_test'));
process.env.JWT_SECRET = 'username-integration-only';
process.env.AUTO_MONTHLY_SEASON_RESET = 'false';
process.env.AUTH_TEST_ACCOUNT_EMAILS = 'v2@qa.invalid,legacy-app@qa.invalid';
process.env.ADMIN_EMAILS = 'admin@qa.invalid';
delete process.env.ONESIGNAL_APP_ID;
delete process.env.ONESIGNAL_REST_API_KEY;
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { PrismaClient } = require('@prisma/client');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { AppModule } = require('../dist/app.module');
const { AuthService } = require('../dist/auth/auth.service');
const { RoomsService } = require('../dist/rooms/rooms.service');

async function main() {
  const db = new PrismaClient();
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const api = request(app.getHttpServer());
  const headers = id => ({ Authorization: `Bearer ${jwt.sign({ sub: id, email: `${id}@qa.invalid` }, process.env.JWT_SECRET)}` });
  const registration = (email, phone, username) => ({ email, phone, password: 'QA-password-123', displayName: 'لاعب', ...(username === undefined ? {} : { username }) });
  try {
    // This user was inserted BEFORE the username migration was applied.
    const existing = await db.user.findUnique({ where: { id: 'legacy-user' } });
    assert.equal(existing.username, null);
    assert.equal(existing.publicId, 'legacy-public-id');
    assert.equal(existing.permanentScore, 11);
    await db.user.create({ data: { id: 'peer-user', email: 'peer-user@qa.invalid', displayName: 'لاعب' } });
    await db.room.create({ data: { code: 'QAUSER', gameId: 'شطرنج', hostUserId: existing.id, status: 'running', startedAt: new Date(Date.now() - 120000), timerSec: 60, players: { create: [{ userId: existing.id }, { userId: 'peer-user' }] } } });
    await db.userGameWallet.create({ data: { userId: existing.id, gameId: 'شطرنج', pearls: 17, seasonYm: 202610 } });

    assert.equal((await api.patch('/api/users/me/username').send({ username: 'unauth' })).status, 401);
    let response = await api.patch('/api/users/me/username').set(headers('legacy-user')).send({ username: '  @Ali_92  ' });
    assert.equal(response.body.ok, true);
    assert.equal(response.body.data.username, 'ali_92');
    assert.equal(response.body.data.id, existing.id);
    assert.equal(response.body.data.publicId, existing.publicId);
    assert.equal(response.body.data.displayName, existing.displayName);
    assert.equal(response.body.data.permanentScore, 11);
    assert.equal((await db.userGameWallet.findUnique({ where: { userId_gameId: { userId: existing.id, gameId: 'شطرنج' } } })).pearls, 17);
    assert.equal((await api.get('/api/users/me').set(headers(existing.id))).body.data.username, 'ali_92', 'Old JWT remains valid');
    const beforeFinish = await db.room.findUnique({ where: { code: 'QAUSER' }, include: { players: true } });
    assert.equal(beforeFinish.status, 'running');
    assert.equal(beforeFinish.hostUserId, existing.id);
    assert.deepEqual(beforeFinish.players.map(p => p.userId).sort(), ['legacy-user', 'peer-user']);

    response = await api.get('/api/auth/usernames/ALI_92');
    assert.equal(response.body.data.available, false);
    response = await api.get('/api/users/search/%40ALI_92');
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].id, existing.id);
    for (const username of ['ab', '1alice', 'ali.name', 'علي', 'a'.repeat(21), '', null]) {
      const invalid = await api.patch('/api/users/me/username').set(headers(existing.id)).send({ username });
      assert.equal(invalid.body.ok, false);
    }
    assert.equal((await api.patch('/api/users/me/username').set(headers(existing.id)).send({ username: 'SUPPORT' })).body.code, 'USERNAME_RESERVED');
    const races = await Promise.all(['legacy-user', 'peer-user'].map(id => api.patch('/api/users/me/username').set(headers(id)).send({ username: 'shared_handle' })));
    assert.equal(races.filter(r => r.body.ok).length, 1);
    assert.equal(races.filter(r => r.body.code === 'USERNAME_TAKEN').length, 1);
    assert.equal(await db.user.count({ where: { username: 'shared_handle' } }), 1);

    response = await api.post('/api/auth/register/v2/request-otp').send(registration('missing@qa.invalid', '+96560000001'));
    assert.equal(response.body.code, 'USERNAME_REQUIRED');
    response = await api.post('/api/auth/register/v2/request-otp').send(registration('v2@qa.invalid', '+96560000002', 'New_Player'));
    assert.equal(response.body.ok, true);
    assert.equal(response.body.data.user.username, 'new_player');
    response = await api.post('/api/auth/register/request-otp').send(registration('legacy-app@qa.invalid', '+96560000003'));
    assert.equal(response.body.ok, true, 'Released app registrations still work');
    assert.match(response.body.data.user.username, /^u_[a-f0-9]{18}$/);

    const auth = app.get(AuthService);
    const passwordHash = await bcrypt.hash('QA-password-123', 4);
    async function challenge(id, username) {
      const phone = id === 'otp-ok' ? '+96560000004' : id === 'otp-conflict' ? '+96560000005' : '+96560000006';
      await db.authOtpChallenge.create({ data: { id, phone, purpose: 'register', codeHash: auth.hashOtp(phone, 'register', '123456'), expiresAt: new Date(Date.now() + 300000), payload: { email: `${id}@qa.invalid`, phone, displayName: 'لاعب', passwordHash, otpVerifier: 'local', ...(username ? { username } : {}) } } });
    }
    await challenge('otp-ok', 'otp_player');
    response = await api.post('/api/auth/register/verify-otp').send({ requestId: 'otp-ok', code: '123456' });
    assert.equal(response.body.ok, true);
    assert.equal(response.body.data.user.username, 'otp_player');
    await challenge('otp-conflict', 'shared_handle');
    response = await api.post('/api/auth/register/verify-otp').send({ requestId: 'otp-conflict', code: '123456' });
    assert.equal(response.body.code, 'USERNAME_TAKEN');
    assert.equal((await db.authOtpChallenge.findUnique({ where: { id: 'otp-conflict' } })).usedAt, null, 'Handle conflict rolls back OTP consumption');
    assert.equal(await db.user.count({ where: { email: 'otp-conflict@qa.invalid' } }), 0);
    await challenge('otp-legacy');
    response = await api.post('/api/auth/register/verify-otp').send({ requestId: 'otp-legacy', code: '123456' });
    assert.equal(response.body.ok, true, 'OTP requested by an old app can still complete');
    assert.match(response.body.data.user.username, /^u_[a-f0-9]{18}$/);

    // A running match can finish after the player changes their public handle.
    const rooms = app.get(RoomsService);
    await rooms.submitResult('QAUSER', existing.id, { winners: [existing.id], losers: ['peer-user'] });
    await rooms.voteResult('QAUSER', 'peer-user', true);
    const match = await db.match.findFirst({ where: { roomCode: 'QAUSER' }, include: { parts: true } });
    assert(match);
    assert.deepEqual(match.parts.map(p => p.userId).sort(), ['legacy-user', 'peer-user']);
    assert.equal(match.parts.find(p => p.userId === existing.id).outcome, 'WIN');
    assert.equal((await db.user.findUnique({ where: { id: existing.id } })).publicId, 'legacy-public-id');
    console.log('PASS: pre-update accounts, unchanged IDs/scores/rooms/JWTs, running match completion, case-insensitive unique claims, concurrent claim race, search, new v2 signup, released-client signup, pending legacy OTP and OTP conflict rollback.');
  } finally { await app.close(); await db.$disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
