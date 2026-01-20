"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAllGameWallets = ensureAllGameWallets;
exports.getGamePearls = getGamePearls;
exports.getPearls = getPearls;
exports.incGamePearls = incGamePearls;
exports.decGamePearls = decGamePearls;
exports.takeGamePearlsOrZero = takeGamePearlsOrZero;
exports.getSponsorPearls = getSponsorPearls;
exports.incSponsorPearls = incSponsorPearls;
exports.decSponsorPearls = decSponsorPearls;
const SEASON_START_PEARLS = 5;
const DEFAULT_GAMES = [
    'كوت',
    'بلوت',
    'تريكس',
    'هند',
    'سبيتة',
    'شطرنج',
    'دامه',
    'كيرم',
    'دومنه',
    'طاولة',
    'بيبيفوت',
    'قدم',
    'سله',
    'طائره',
    'بولنج',
    'بادل',
    'تنس طاولة',
    'تنس أرضي',
    'بلياردو',
];
function seasonYm(d = new Date()) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return y * 100 + m; // YYYYMM
}
// ---------- helpers ----------
async function ensureDefaultGames(tx) {
    const client = tx;
    await Promise.all(DEFAULT_GAMES.map((id) => client.game.upsert({
        where: { id },
        update: {},
        create: { id, name: id, category: 'عام' },
    })));
}
async function listGameIds(tx) {
    const client = tx;
    // make sure the base catalog exists (cheap idempotent upserts)
    await ensureDefaultGames(tx);
    const games = await client.game.findMany({ select: { id: true } });
    return games.map((g) => g.id);
}
async function ensureUserGameWallet(tx, userId, gameId) {
    var _a, _b, _c;
    const client = tx;
    const nowYm = seasonYm();
    const w = await client.userGameWallet.upsert({
        where: { userId_gameId: { userId, gameId } },
        update: {},
        create: { userId, gameId, pearls: SEASON_START_PEARLS, seasonYm: nowYm },
        select: { pearls: true, seasonYm: true },
    });
    const currentYm = ((_a = w === null || w === void 0 ? void 0 : w.seasonYm) !== null && _a !== void 0 ? _a : 0);
    if (currentYm !== nowYm) {
        const updated = await client.userGameWallet.update({
            where: { userId_gameId: { userId, gameId } },
            data: { pearls: SEASON_START_PEARLS, seasonYm: nowYm },
            select: { pearls: true },
        });
        return ((_b = updated === null || updated === void 0 ? void 0 : updated.pearls) !== null && _b !== void 0 ? _b : 0);
    }
    return ((_c = w === null || w === void 0 ? void 0 : w.pearls) !== null && _c !== void 0 ? _c : 0);
}
async function ensureAllGameWallets(tx, userId) {
    const balances = {};
    const ids = await listGameIds(tx);
    for (const gameId of ids) {
        balances[gameId] = await ensureUserGameWallet(tx, userId, gameId);
    }
    return balances;
}
// -------------------- REGULAR (User per-game pearls) --------------------
async function getGamePearls(tx, userId, gameId) {
    return ensureUserGameWallet(tx, userId, gameId);
}
// Legacy accessor kept for compatibility with older callers:
// returns the highest per-game balance after ensuring monthly wallets.
async function getPearls(tx, userId) {
    const balances = await ensureAllGameWallets(tx, userId);
    const vals = Object.values(balances);
    if (!vals.length)
        return 0;
    return Math.max(...vals);
}
async function incGamePearls(tx, userId, gameId, amount = 1) {
    if (amount <= 0)
        return;
    const client = tx;
    const nowYm = seasonYm();
    // ensure season reset first
    await ensureUserGameWallet(tx, userId, gameId);
    await client.userGameWallet.update({
        where: { userId_gameId: { userId, gameId } },
        data: { pearls: { increment: amount }, seasonYm: nowYm },
    });
}
async function decGamePearls(tx, userId, gameId, amount = 1) {
    if (amount <= 0)
        return;
    const client = tx;
    const nowYm = seasonYm();
    const current = await ensureUserGameWallet(tx, userId, gameId);
    if (current < amount)
        throw new Error('NOT_ENOUGH_PEARLS');
    await client.userGameWallet.update({
        where: { userId_gameId: { userId, gameId } },
        data: { pearls: { decrement: amount }, seasonYm: nowYm },
    });
}
// Graceful "stake if you can, otherwise zero" helper for room creation/join
async function takeGamePearlsOrZero(tx, userId, gameId, amount = 1) {
    const current = await getGamePearls(tx, userId, gameId);
    const charged = Math.min(current, amount);
    if (charged > 0) {
        await decGamePearls(tx, userId, gameId, charged);
    }
    return { charged, remaining: current - charged };
}
// -------------------- SPONSOR (SponsorGameWallet.pearls) --------------------
async function getSponsorPearls(tx, userId, sponsorCode, gameId) {
    var _a, _b, _c;
    const client = tx;
    const nowYm = seasonYm();
    // ensure wallet exists
    const w = await client.sponsorGameWallet.upsert({
        where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
        update: {},
        create: { userId, sponsorCode, gameId, pearls: SEASON_START_PEARLS, seasonYm: nowYm },
        select: { pearls: true, seasonYm: true },
    });
    const currentYm = ((_a = w === null || w === void 0 ? void 0 : w.seasonYm) !== null && _a !== void 0 ? _a : 0);
    if (currentYm !== nowYm) {
        const updated = await client.sponsorGameWallet.update({
            where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
            data: { pearls: SEASON_START_PEARLS, seasonYm: nowYm },
            select: { pearls: true },
        });
        return ((_b = updated === null || updated === void 0 ? void 0 : updated.pearls) !== null && _b !== void 0 ? _b : 0);
    }
    return ((_c = w === null || w === void 0 ? void 0 : w.pearls) !== null && _c !== void 0 ? _c : 0);
}
async function incSponsorPearls(tx, userId, sponsorCode, gameId, amount = 1) {
    if (amount <= 0)
        return;
    const client = tx;
    const nowYm = seasonYm();
    // ensure season reset first
    await getSponsorPearls(tx, userId, sponsorCode, gameId);
    await client.sponsorGameWallet.update({
        where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
        data: { pearls: { increment: amount }, seasonYm: nowYm },
    });
}
async function decSponsorPearls(tx, userId, sponsorCode, gameId, amount = 1) {
    if (amount <= 0)
        return;
    const client = tx;
    const nowYm = seasonYm();
    const current = await getSponsorPearls(tx, userId, sponsorCode, gameId);
    if (current < amount)
        throw new Error('NOT_ENOUGH_PEARLS_SPONSOR');
    await client.sponsorGameWallet.update({
        where: { userId_sponsorCode_gameId: { userId, sponsorCode, gameId } },
        data: { pearls: { decrement: amount }, seasonYm: nowYm },
    });
}
//# sourceMappingURL=pearls.js.map