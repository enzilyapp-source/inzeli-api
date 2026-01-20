"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let LeaderboardService = class LeaderboardService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async globalLeaderboard(limit = 50) {
        const users = await this.prisma.user.findMany({
            orderBy: [{ permanentScore: 'desc' }, { createdAt: 'asc' }],
            take: limit,
            select: {
                id: true,
                displayName: true,
                email: true,
                permanentScore: true,
                pearls: true,
            },
        });
        return {
            scope: 'GLOBAL',
            rows: users.map((u, i) => {
                var _a, _b;
                return ({
                    rank: i + 1,
                    userId: u.id,
                    displayName: u.displayName,
                    email: u.email,
                    permanentScore: (_a = u.permanentScore) !== null && _a !== void 0 ? _a : 0,
                    pearls: (_b = u.pearls) !== null && _b !== void 0 ? _b : 0,
                });
            }),
        };
    }
    async gameLeaderboard(gameId, limit = 50) {
        var _a, _b, _c, _d, _e;
        // ensure game exists (seed if needed)
        await this.prisma.game.upsert({
            where: { id: gameId },
            update: {},
            create: { id: gameId, name: gameId, category: 'عام' },
        });
        const FALLBACK_PEARLS = 5;
        const wallets = await this.prisma.userGameWallet.findMany({
            where: { gameId },
            include: { user: { select: { id: true, displayName: true, email: true } } },
            orderBy: [{ pearls: 'desc' }, { updatedAt: 'desc' }],
        });
        const walletMap = new Map();
        for (const w of wallets) {
            walletMap.set(w.userId, {
                pearls: (_a = w.pearls) !== null && _a !== void 0 ? _a : 0,
                displayName: (_c = (_b = w.user) === null || _b === void 0 ? void 0 : _b.displayName) !== null && _c !== void 0 ? _c : '',
                email: (_e = (_d = w.user) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '',
            });
        }
        const everyone = await this.prisma.user.findMany({
            select: { id: true, displayName: true, email: true },
        });
        const rows = everyone.map((u) => {
            var _a, _b, _c;
            const base = (_a = walletMap.get(u.id)) === null || _a === void 0 ? void 0 : _a.pearls;
            return {
                userId: u.id,
                displayName: (_b = u.displayName) !== null && _b !== void 0 ? _b : '',
                email: (_c = u.email) !== null && _c !== void 0 ? _c : '',
                pearls: base == null ? FALLBACK_PEARLS : base,
            };
        });
        rows.sort((a, b) => {
            var _a, _b;
            const p = ((_a = b.pearls) !== null && _a !== void 0 ? _a : 0) - ((_b = a.pearls) !== null && _b !== void 0 ? _b : 0);
            if (p !== 0)
                return p;
            return a.displayName.localeCompare(b.displayName);
        });
        const limited = rows.slice(0, Math.max(0, limit));
        return {
            scope: 'GAME',
            gameId,
            rows: limited.map((w, i) => {
                var _a;
                return ({
                    rank: i + 1,
                    userId: w.userId,
                    displayName: w.displayName,
                    email: w.email,
                    pearls: (_a = w.pearls) !== null && _a !== void 0 ? _a : 0,
                });
            }),
        };
    }
    async sponsorGameLeaderboard(sponsorCode, gameId, limit = 50) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        const sponsor = await this.prisma.sponsor.findUnique({
            where: { code: sponsorCode },
            select: { code: true, name: true, active: true },
        });
        if (!sponsor)
            throw new common_1.NotFoundException('SPONSOR_NOT_FOUND');
        const FALLBACK_PEARLS = 5; // الظهور الأولي بدون محفظة/مشاركة
        // 1) اجمع كل من عنده محفظة + كل من لعب مباراة لهذا السبونسر/اللعبة
        const wallets = await this.prisma.sponsorGameWallet.findMany({
            where: { sponsorCode, gameId },
            include: { user: { select: { id: true, displayName: true, email: true } } },
        });
        const walletMap = new Map();
        for (const w of wallets) {
            walletMap.set(w.userId, {
                pearls: (_a = w.pearls) !== null && _a !== void 0 ? _a : 0,
                displayName: (_c = (_b = w.user) === null || _b === void 0 ? void 0 : _b.displayName) !== null && _c !== void 0 ? _c : '',
                email: (_e = (_d = w.user) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '',
            });
        }
        const participants = await this.prisma.matchParticipant.findMany({
            where: { match: { sponsorCode, gameId } },
            select: {
                userId: true,
                user: { select: { displayName: true, email: true } },
                match: { select: { createdAt: true } },
            },
            orderBy: { match: { createdAt: 'desc' } },
            take: 1000,
        });
        const users = new Map();
        // add wallets
        for (const [uid, info] of walletMap.entries()) {
            users.set(uid, {
                displayName: info.displayName,
                email: info.email,
                pearls: info.pearls,
            });
        }
        // add participants (حتى لو ما عنده محفظة)
        for (const p of participants) {
            if (users.has(p.userId))
                continue;
            const base = (_f = walletMap.get(p.userId)) === null || _f === void 0 ? void 0 : _f.pearls;
            users.set(p.userId, {
                displayName: (_h = (_g = p.user) === null || _g === void 0 ? void 0 : _g.displayName) !== null && _h !== void 0 ? _h : '',
                email: (_k = (_j = p.user) === null || _j === void 0 ? void 0 : _j.email) !== null && _k !== void 0 ? _k : '',
                pearls: base == null ? FALLBACK_PEARLS : base,
            });
        }
        // add all users (حتى لو ما اشترك أو لعب) — يظهر برصيد 0
        const everyone = await this.prisma.user.findMany({
            select: { id: true, displayName: true, email: true },
        });
        for (const u of everyone) {
            if (users.has(u.id))
                continue;
            const base = (_l = walletMap.get(u.id)) === null || _l === void 0 ? void 0 : _l.pearls;
            users.set(u.id, {
                displayName: (_m = u.displayName) !== null && _m !== void 0 ? _m : '',
                email: (_o = u.email) !== null && _o !== void 0 ? _o : '',
                pearls: base == null ? FALLBACK_PEARLS : base,
            });
        }
        const rows = Array.from(users.entries()).map(([userId, info]) => {
            var _a, _b;
            return ({
                userId,
                displayName: info.displayName || info.email || userId,
                email: (_a = info.email) !== null && _a !== void 0 ? _a : '',
                pearls: (_b = info.pearls) !== null && _b !== void 0 ? _b : 0,
            });
        });
        rows.sort((a, b) => {
            var _a, _b;
            const p = ((_a = b.pearls) !== null && _a !== void 0 ? _a : 0) - ((_b = a.pearls) !== null && _b !== void 0 ? _b : 0);
            if (p !== 0)
                return p;
            return a.displayName.localeCompare(b.displayName);
        });
        const limited = rows.slice(0, Math.max(0, limit));
        return {
            sponsor,
            gameId,
            rows: limited.map((r, i) => {
                var _a;
                return ({
                    rank: i + 1,
                    userId: r.userId,
                    displayName: r.displayName,
                    email: r.email,
                    pearls: (_a = r.pearls) !== null && _a !== void 0 ? _a : 0,
                });
            }),
        };
    }
};
exports.LeaderboardService = LeaderboardService;
exports.LeaderboardService = LeaderboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LeaderboardService);
//# sourceMappingURL=leaderboard.service.js.map