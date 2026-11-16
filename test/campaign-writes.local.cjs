// Run only AFTER campaign-load.local.cjs, against that same local synthetic DB.
// Exercise simultaneous final approvals and double taps, never real players.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const jwt = require('jsonwebtoken');
const { env, PrismaClient, request, playerId, roomCode, secret, root, sleep, agent } = require('./campaign-load.local.cjs');

async function main() {
  const db = new PrismaClient();
  let child;
  const report = { productionTouched: false, startedAt: new Date().toISOString(), rooms: [] };
  try {
    assert.equal(await db.user.count(), 500, 'Expected untouched synthetic fixtures');
    assert.equal(await db.user.count({ where: { email: { endsWith: '@load.invalid' } } }), 500);
    assert.equal(await db.match.count({ where: { roomCode: { not: null } } }), 0, 'Run once on fresh load fixtures');
    const log = fs.openSync('/private/tmp/enzily-campaign-writes-server.log', 'w', 0o600);
    child = spawn(process.execPath, ['--max-old-space-size=1024', path.join(__dirname, 'campaign-load.local.cjs'), '--server'], {
      cwd: root, env, stdio: ['ignore', log, log, 'ipc'],
    });
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local write server did not start')), 30000);
      child.once('message', m => { clearTimeout(timer); resolve(m.port); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Local server exited: ${code}`)); });
    });
    const actors = Array.from({ length: 40 }, (_, i) => ({ i,
      token: jwt.sign({ sub: playerId(i), email: `user${i}@load.invalid` }, secret, { expiresIn: '15m' }),
    }));
    await Promise.all(Array.from({ length: 10 }, async (_, roomIndex) => {
      const players = actors.slice(roomIndex * 4, roomIndex * 4 + 4);
      const code = roomCode(players[0].i);
      const winners = players.slice(0, 2).map(a => playerId(a.i));
      const losers = players.slice(2).map(a => playerId(a.i));
      const submission = await request(port, 'POST', `/api/rooms/${code}/result`, players[0], 8, 20000, { winners, losers });
      assert(submission.ok, 'Valid synthetic result submission failed');
      // Three voters approve at once. One also retries immediately as a real
      // mobile client can after a slow response or a double tap.
      const voters = roomIndex < 5 ? players.slice(1) : [...players.slice(1), players[3]];
      const votes = await Promise.all(voters.map(a =>
        request(port, 'POST', `/api/rooms/${code}/result/vote`, a, 8, 20000, { approve: true })));
      const [matches, room, users] = await Promise.all([
        db.match.findMany({ where: { roomCode: code }, select: { id: true, _count: { select: { parts: true } } } }),
        db.room.findUnique({ where: { code }, select: { status: true, resultStatus: true } }),
        db.user.findMany({ where: { id: { in: [...winners, ...losers] } }, select: { id: true, permanentScore: true, creditBalance: true } }),
      ]);
      const correctScores = users.every(u => u.permanentScore === (winners.includes(u.id) ? 12 : 10) && u.creditBalance === 1000);
      report.rooms.push({ code, scenario: roomIndex < 5 ? 'simultaneous-approvals' : 'simultaneous-approvals-with-retry',
        matchCount: matches.length, participantCounts: matches.map(m => m._count.parts),
        correctScores, finished: room.status === 'finished' && room.resultStatus === 'approved',
        votes: votes.map(v => ({ ok: v.ok, status: v.status, code: v.code })),
        pass: matches.length === 1 && matches[0]._count.parts === 4 && correctScores && room.status === 'finished' && room.resultStatus === 'approved' });
    }));
    report.rooms.sort((a, b) => a.code.localeCompare(b.code));
    report.passed = report.rooms.filter(r => r.pass).length;
    report.failed = report.rooms.filter(r => !r.pass).length;
    // Exercise real hashing, unique checks, account creation and wallet setup.
    // Explicit synthetic review-account bypass avoids all real SMS/OTP delivery.
    const registration = await Promise.all(Array.from({ length: 100 }, (_, i) =>
      request(port, 'POST', '/api/auth/register/v2/request-otp', actors[i % 40], 10, 30000, {
        email: `new${i}@load.invalid`, username: `new_load_${i}`, phone: `+965${60000000 + i}`,
        displayName: `Synthetic New ${i}`, password: 'local-load-only-password',
      })));
    const times = registration.map(r => r.ms).sort((a, b) => a - b);
    report.registrationBurst = { concurrentRequests: 100, succeeded: registration.filter(r => r.ok).length,
      p95Ms: Math.round(times[Math.ceil(times.length * .95) - 1]),
      errors: registration.filter(r => !r.ok).map(r => ({ status: r.status, code: r.code })),
      createdSyntheticAccounts: await db.user.count({ where: { email: { startsWith: 'new', endsWith: '@load.invalid' }, isTestAccount: true } }),
      externalOtpSent: false, note: 'Synthetic allowlisted account bypass; real delivery provider is NOT load-tested' };
    report.finishedAt = new Date().toISOString();
    const file = path.join(root, 'output', 'performance', 'campaign-write-integrity-20261026.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    console.log('Report: ' + file);
    if (report.failed || report.registrationBurst.succeeded !== 100)
      process.exitCode = 2;
  } finally {
    agent.destroy(); await db.$disconnect();
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(10000)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
