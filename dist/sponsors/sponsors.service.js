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
exports.SponsorsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let SponsorsService = class SponsorsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listSponsors() {
        return this.prisma.sponsor.findMany({
            where: { active: true },
            orderBy: { name: 'asc' },
            select: { code: true, name: true, active: true },
        });
    }
    // Admin list with games
    async listSponsorsWithGames() {
        return this.prisma.sponsor.findMany({
            orderBy: { name: 'asc' },
            include: {
                SponsorGame: { select: { gameId: true, prizeAmount: true } },
            },
        });
    }
    // Admin: create sponsor
    async createSponsor(code, name) {
        return this.prisma.sponsor.upsert({
            where: { code },
            update: { name, active: true },
            create: { code, name, active: true },
        });
    }
    async updateSponsor(code, data) {
        return this.prisma.sponsor.update({
            where: { code },
            data: data,
        });
    }
    async deleteSponsor(code) {
        return this.prisma.sponsor.delete({ where: { code } });
    }
    // Admin: add game to sponsor with optional prize
    async addGameToSponsor(code, gameId, prizeAmount) {
        // ensure game exists
        const game = await this.prisma.game.findUnique({ where: { id: gameId } });
        if (!game)
            throw new common_1.NotFoundException('GAME_NOT_FOUND');
        await this.prisma.sponsor.upsert({
            where: { code },
            update: {},
            create: { code, name: code, active: true },
        });
        return this.prisma.sponsorGame.upsert({
            where: { sponsorCode_gameId: { sponsorCode: code, gameId } },
            update: { prizeAmount },
            create: { sponsorCode: code, gameId, prizeAmount },
        });
    }
    // Returns { sponsor, games } with prizeAmount
    async getSponsorWithGames(code) {
        const sponsor = await this.prisma.sponsor.findUnique({
            where: { code },
            select: { code: true, name: true, active: true },
        });
        if (!sponsor)
            throw new common_1.NotFoundException('SPONSOR_NOT_FOUND');
        const games = await this.prisma.sponsorGame.findMany({
            where: { sponsorCode: code },
            include: {
                game: { select: { id: true, name: true, category: true } },
            },
            orderBy: { gameId: 'asc' },
        });
        return { sponsor, games };
    }
    // ✅ Called by POST /sponsors/:code/join
    // Seed wallets with 5 pearls per game supported by sponsor
    async joinSponsor(userId, sponsorCode) {
        const sponsor = await this.prisma.sponsor.findUnique({
            where: { code: sponsorCode },
            select: { code: true, active: true },
        });
        if (!sponsor || !sponsor.active)
            throw new common_1.NotFoundException('SPONSOR_NOT_FOUND');
        // ensure relation (UserSponsor)
        await this.prisma.userSponsor.upsert({
            where: { userId_sponsorCode: { userId, sponsorCode } },
            update: {},
            create: { userId, sponsorCode },
        });
        // seed wallets for all sponsor games
        const sponsorGames = await this.prisma.sponsorGame.findMany({
            where: { sponsorCode },
            select: { gameId: true },
        });
        // create wallets if missing
        await this.prisma.$transaction(sponsorGames.map((g) => this.prisma.sponsorGameWallet.upsert({
            where: {
                userId_sponsorCode_gameId: {
                    userId,
                    sponsorCode,
                    gameId: g.gameId,
                },
            },
            update: {},
            create: {
                userId,
                sponsorCode,
                gameId: g.gameId,
                pearls: 5,
            },
        })));
        return { sponsorCode };
    }
    async userWallets(userId, sponsorCode) {
        // ensure sponsor exists
        const sponsor = await this.prisma.sponsor.findUnique({
            where: { code: sponsorCode },
            select: { code: true, active: true },
        });
        if (!sponsor || !sponsor.active)
            throw new common_1.NotFoundException('SPONSOR_NOT_FOUND');
        // ensure relation + wallets (same seeding as joinSponsor)
        await this.prisma.userSponsor.upsert({
            where: { userId_sponsorCode: { userId, sponsorCode } },
            update: {},
            create: { userId, sponsorCode },
        });
        const sponsorGames = await this.prisma.sponsorGame.findMany({
            where: { sponsorCode },
            select: { gameId: true },
        });
        await this.prisma.$transaction(sponsorGames.map((g) => this.prisma.sponsorGameWallet.upsert({
            where: {
                userId_sponsorCode_gameId: {
                    userId,
                    sponsorCode,
                    gameId: g.gameId,
                },
            },
            update: {},
            create: { userId, sponsorCode, gameId: g.gameId, pearls: 5 },
        })));
        // return wallets with game info
        return this.prisma.sponsorGameWallet.findMany({
            where: { userId, sponsorCode },
            include: {
                game: { select: { id: true, name: true, category: true } },
            },
            orderBy: { gameId: 'asc' },
        });
    }
    async userAllWallets(userId) {
        return this.prisma.sponsorGameWallet.findMany({
            where: { userId },
            include: {
                sponsor: { select: { code: true, name: true } },
                game: { select: { id: true, name: true } },
            },
            orderBy: [{ sponsorCode: 'asc' }, { gameId: 'asc' }],
        });
    }
    // ✅ NEW: list sponsor games with prizeAmount (clean payload for Flutter)
    async sponsorGames(sponsorCode) {
        const sponsor = await this.prisma.sponsor.findUnique({
            where: { code: sponsorCode },
            select: { code: true },
        });
        if (!sponsor)
            throw new common_1.NotFoundException('SPONSOR_NOT_FOUND');
        const games = await this.prisma.sponsorGame.findMany({
            where: { sponsorCode },
            include: { game: { select: { id: true, name: true, category: true } } },
            orderBy: { gameId: 'asc' },
        });
        // Normalize shape for Flutter:
        // { sponsorCode, gameId, prizeAmount, game: {id,name,category} }
        return games.map((g) => {
            var _a;
            return ({
                sponsorCode: g.sponsorCode,
                gameId: g.gameId,
                prizeAmount: (_a = g.prizeAmount) !== null && _a !== void 0 ? _a : 0,
                game: g.game,
            });
        });
    }
    // ✅ NEW: leaderboard per sponsor+game
    // - pearls: from SponsorGameWallet
    // - wins/losses: from MatchParticipant within sponsor scope and gameId
    // - streak: computed (simple recent streak from last N matches)
    async sponsorGameLeaderboard(args) {
        const { sponsorCode, gameId, limit } = args;
        // Ensure sponsor & game exist (optional strictness)
        const sponsor = await this.prisma.sponsor.findUnique({
            where: { code: sponsorCode },
            select: { code: true, name: true },
        });
        if (!sponsor)
            throw new common_1.NotFoundException('SPONSOR_NOT_FOUND');
        // Base: wallets = who is active in this sponsor game
        const wallets = await this.prisma.sponsorGameWallet.findMany({
            where: { sponsorCode, gameId },
            include: {
                user: { select: { id: true, displayName: true, email: true } },
            },
            orderBy: [{ pearls: 'desc' }, { updatedAt: 'desc' }],
            take: limit,
        });
        const userIds = wallets.map((w) => w.userId);
        // Aggregate wins/losses from matches for those users
        // We count outcomes where Match.sponsorCode=sponsorCode and Match.gameId=gameId
        const parts = await this.prisma.matchParticipant.findMany({
            where: {
                userId: { in: userIds },
                match: { sponsorCode, gameId },
            },
            select: {
                userId: true,
                outcome: true,
                match: { select: { createdAt: true } },
            },
            orderBy: { match: { createdAt: 'desc' } },
            take: 4000, // enough for streak calc
        });
        // Build stats
        const stats = new Map();
        for (const uid of userIds) {
            stats.set(uid, { wins: 0, losses: 0, recent: [] });
        }
        for (const p of parts) {
            const s = stats.get(p.userId);
            if (!s)
                continue;
            if (p.outcome === 'WIN')
                s.wins += 1;
            else
                s.losses += 1;
            // recent streak (keep last 10 outcomes)
            if (s.recent.length < 10)
                s.recent.push(p.outcome);
        }
        // streak: number of consecutive WIN from most recent
        const computeStreak = (recent) => {
            let k = 0;
            for (const r of recent) {
                if (r === 'WIN')
                    k += 1;
                else
                    break;
            }
            return k;
        };
        return {
            sponsor,
            gameId,
            rows: wallets.map((w, idx) => {
                var _a, _b, _c, _d, _e, _f;
                const s = (_a = stats.get(w.userId)) !== null && _a !== void 0 ? _a : { wins: 0, losses: 0, recent: [] };
                const streak = computeStreak(s.recent);
                return {
                    rank: idx + 1,
                    userId: w.userId,
                    displayName: (_c = (_b = w.user) === null || _b === void 0 ? void 0 : _b.displayName) !== null && _c !== void 0 ? _c : '',
                    email: (_e = (_d = w.user) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '',
                    pearls: (_f = w.pearls) !== null && _f !== void 0 ? _f : 0,
                    wins: s.wins,
                    losses: s.losses,
                    streak,
                    fire: streak >= 3, // 🔥 show fire if streak >= 3
                };
            }),
        };
    }
};
exports.SponsorsService = SponsorsService;
exports.SponsorsService = SponsorsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SponsorsService);
//# sourceMappingURL=sponsors.service.js.map