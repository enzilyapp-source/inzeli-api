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
exports.RoomsService = void 0;
// src/rooms/rooms.service.ts
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
const pearls_1 = require("../common/pearls");
const STAKE = 0; // لا نسحب لؤلؤ عند الإنشاء/الانضمام (يتم الخصم فقط عند الخسارة)
const DEFAULT_RADIUS_METERS = 100;
function haversineMeters(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
let RoomsService = class RoomsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    // ---------- helpers ----------
    newCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let s = '';
        for (let i = 0; i < 6; i++)
            s += chars[Math.floor(Math.random() * chars.length)];
        return s;
    }
    endsAt(room) {
        if (!room.startedAt || !room.timerSec)
            return null;
        return new Date(room.startedAt.getTime() + room.timerSec * 1000);
    }
    isLocked(room) {
        const end = this.endsAt(room);
        return !!end && new Date() < end;
    }
    remaining(room) {
        const end = this.endsAt(room);
        if (!end)
            return 0;
        return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 1000));
    }
    buildTeamQuorum(room) {
        const calc = (team) => {
            const list = (room.players || []).filter((p) => p.team === team);
            const required = list.length;
            const available = list.reduce((sum, p) => { var _a, _b; return sum + ((_b = (_a = p.user) === null || _a === void 0 ? void 0 : _a.permanentScore) !== null && _b !== void 0 ? _b : 0); }, 0);
            const quorumMet = required > 0 && available >= required;
            return { required, available, quorumMet };
        };
        return { A: calc('A'), B: calc('B') };
    }
    // ---------- core ----------
    async createRoom(gameId, hostId, sponsorCode, lat, lng, radiusMeters) {
        // ensure game exists
        await this.prisma.game.upsert({
            where: { id: gameId },
            update: {},
            create: { id: gameId, name: gameId, category: 'عام' },
        });
        // unique code
        let code = this.newCode();
        while (await this.prisma.room.findUnique({ where: { code } }))
            code = this.newCode();
        const room = await this.prisma.$transaction(async (tx) => {
            // no pearl deduction on create; stakes stay 0
            const hostStake = 0;
            const r = await tx.room.create({
                data: Object.assign(Object.assign({ code,
                    gameId, hostUserId: hostId, hostLat: lat !== null && lat !== void 0 ? lat : null, hostLng: lng !== null && lng !== void 0 ? lng : null, radiusMeters: radiusMeters !== null && radiusMeters !== void 0 ? radiusMeters : DEFAULT_RADIUS_METERS, status: 'waiting', allowZeroCredit: true }, (sponsorCode ? { sponsorCode } : {})), { players: { create: { userId: hostId } }, stakes: { create: { userId: hostId, amount: hostStake } } }),
                include: {
                    players: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    displayName: true,
                                    email: true,
                                    pearls: true,
                                    creditPoints: true,
                                    permanentScore: true,
                                },
                            },
                        },
                    },
                    stakes: true,
                },
            });
            await tx.timelineEvent.create({
                data: {
                    kind: 'ROOM_CREATED',
                    roomCode: code,
                    gameId,
                    userId: hostId,
                    meta: { stake: hostStake, sponsorCode: sponsorCode !== null && sponsorCode !== void 0 ? sponsorCode : null },
                },
            });
            return r;
        });
        const locked = this.isLocked(room);
        const remainingSec = this.remaining(room);
        const teamQuorum = this.buildTeamQuorum(room);
        return Object.assign(Object.assign({}, room), { locked, remainingSec, teamQuorum });
    }
    async getByCode(code) {
        const room = await this.prisma.room.findUnique({
            where: { code },
            include: {
                players: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                displayName: true,
                                email: true,
                                pearls: true,
                                creditPoints: true,
                                permanentScore: true,
                            },
                        },
                    },
                },
                stakes: true,
            },
        });
        if (!room)
            throw new common_1.NotFoundException('ROOM_NOT_FOUND');
        const locked = this.isLocked(room);
        const remainingSec = this.remaining(room);
        const teamQuorum = this.buildTeamQuorum(room);
        return Object.assign(Object.assign({}, room), { locked, remainingSec, teamQuorum });
    }
    async join(code, userId, lat, lng) {
        var _a, _b;
        const room = (await this.prisma.room.findUnique({ where: { code } }));
        if (!room)
            throw new common_1.NotFoundException('ROOM_NOT_FOUND');
        // لا يسمح بالانضمام بعد بدء العداد/الروم
        if (room.status !== 'waiting') {
            throw new common_1.BadRequestException('ROOM_NOT_JOINABLE');
        }
        if (this.isLocked(room)) {
            throw new common_1.BadRequestException('ROOM_LOCKED');
        }
        // تحقق القرب (إن توفر موقع المضيف)
        if (room.hostLat != null && room.hostLng != null) {
            if (lat == null || lng == null) {
                throw new common_1.BadRequestException('NEED_LOCATION');
            }
            const dist = haversineMeters(room.hostLat, room.hostLng, lat, lng);
            const radius = (_a = room.radiusMeters) !== null && _a !== void 0 ? _a : DEFAULT_RADIUS_METERS;
            if (dist > radius) {
                throw new common_1.BadRequestException('TOO_FAR');
            }
        }
        // read sponsorCode safely
        const sponsorCode = (_b = room === null || room === void 0 ? void 0 : room.sponsorCode) !== null && _b !== void 0 ? _b : null;
        await this.prisma.$transaction(async (tx) => {
            const exists = await tx.roomPlayer.findUnique({
                where: { roomCode_userId: { roomCode: code, userId } },
            });
            if (exists)
                return;
            // no pearl deduction on join
            const stake = 0;
            await tx.roomStake.create({
                data: { roomCode: code, userId, amount: stake },
            });
            await tx.roomPlayer.create({
                data: { roomCode: code, userId },
            });
            await tx.timelineEvent.create({
                data: {
                    kind: 'ROOM_JOINED',
                    roomCode: code,
                    userId,
                    meta: { charged: stake, sponsorCode },
                },
            });
        });
        return this.getByCode(code);
    }
    async start(code, hostId, params) {
        var _a, _b, _c, _d;
        const room = await this.prisma.room.findUnique({
            where: { code },
            include: {
                players: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                displayName: true,
                                email: true,
                                pearls: true,
                                creditPoints: true,
                                permanentScore: true,
                            },
                        },
                    },
                },
                stakes: true,
            },
        });
        if (!room)
            throw new common_1.NotFoundException('ROOM_NOT_FOUND');
        if (room.hostUserId !== hostId)
            throw new common_1.ForbiddenException('ONLY_HOST_CAN_START');
        if (room.status !== 'waiting')
            throw new common_1.BadRequestException('ALREADY_STARTED');
        if (((_b = (_a = room.players) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) < 2)
            throw new common_1.BadRequestException('NEED_TWO_PLAYERS');
        const target = (_c = params.targetWinPoints) !== null && _c !== void 0 ? _c : null;
        const sec = (_d = params.timerSec) !== null && _d !== void 0 ? _d : 600;
        const updated = await this.prisma.room.update({
            where: { code },
            data: {
                status: 'running',
                targetWinPoints: target,
                allowZeroCredit: false,
                timerSec: sec,
                startedAt: new Date(),
            },
            include: {
                players: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                displayName: true,
                                email: true,
                                permanentScore: true,
                            },
                        },
                    },
                },
                stakes: true,
            },
        });
        await this.prisma.timelineEvent.create({
            data: {
                kind: 'ROOM_STARTED',
                roomCode: code,
                userId: hostId,
                meta: { targetWinPoints: target, timerSec: sec },
            },
        });
        const locked = this.isLocked(updated);
        const remainingSec = this.remaining(updated);
        const teamQuorum = this.buildTeamQuorum(updated);
        return Object.assign(Object.assign({}, updated), { locked, remainingSec, teamQuorum });
    }
    // Optional: allow changing stake before start (keeps your existing endpoint shape)
    async setStake(code, userId, amount) {
        var _a;
        if (amount < 0)
            throw new common_1.BadRequestException('INVALID_STAKE');
        const room = await this.prisma.room.findUnique({ where: { code } });
        if (!room)
            throw new common_1.NotFoundException('ROOM_NOT_FOUND');
        if (room.status !== 'waiting')
            throw new common_1.BadRequestException('STAKE_ONLY_BEFORE_START');
        const sponsorCode = (_a = room === null || room === void 0 ? void 0 : room.sponsorCode) !== null && _a !== void 0 ? _a : null;
        await this.prisma.$transaction(async (tx) => {
            // refund old stake
            const old = await tx.roomStake.findUnique({
                where: { roomCode_userId: { roomCode: code, userId } },
            });
            if (old) {
                if (sponsorCode)
                    await (0, pearls_1.incSponsorPearls)(tx, userId, sponsorCode, room.gameId, old.amount);
                else
                    await (0, pearls_1.incGamePearls)(tx, userId, room.gameId, old.amount);
                await tx.roomStake.delete({
                    where: { roomCode_userId: { roomCode: code, userId } },
                });
            }
            // take new stake
            if (sponsorCode) {
                const p = await (0, pearls_1.getSponsorPearls)(tx, userId, sponsorCode, room.gameId);
                if (p < amount)
                    throw new common_1.BadRequestException('NOT_ENOUGH_PEARLS_SPONSOR');
                await (0, pearls_1.decSponsorPearls)(tx, userId, sponsorCode, room.gameId, amount);
            }
            else {
                const p = await (0, pearls_1.getGamePearls)(tx, userId, room.gameId);
                if (p < amount)
                    throw new common_1.BadRequestException('NOT_ENOUGH_PEARLS');
                if (amount > 0)
                    await (0, pearls_1.decGamePearls)(tx, userId, room.gameId, amount);
            }
            await tx.roomStake.create({
                data: { roomCode: code, userId, amount },
            });
            await tx.timelineEvent.create({
                data: {
                    kind: 'STAKE_SET',
                    roomCode: code,
                    userId,
                    meta: { amount, sponsorCode },
                },
            });
        });
        return this.getByCode(code);
    }
    // ---------- teams / leaders ----------
    async setPlayerTeam(code, actorUserId, playerUserId, team) {
        const room = await this.prisma.room.findUnique({
            where: { code },
            select: { hostUserId: true, status: true },
        });
        if (!room)
            throw new common_1.NotFoundException('ROOM_NOT_FOUND');
        if (room.hostUserId !== actorUserId)
            throw new common_1.ForbiddenException('ONLY_HOST_CAN_SET_TEAM');
        if (room.status !== 'waiting')
            throw new common_1.BadRequestException('TEAM_ONLY_BEFORE_START');
        // ensure player exists in room
        const exists = await this.prisma.roomPlayer.findUnique({
            where: { roomCode_userId: { roomCode: code, userId: playerUserId } },
        });
        if (!exists)
            throw new common_1.NotFoundException('PLAYER_NOT_IN_ROOM');
        await this.prisma.roomPlayer.update({
            where: { roomCode_userId: { roomCode: code, userId: playerUserId } },
            data: { team },
        });
        await this.prisma.timelineEvent.create({
            data: {
                kind: 'TEAM_SET',
                roomCode: code,
                userId: actorUserId,
                meta: { playerUserId, team },
            },
        });
        return this.getByCode(code);
    }
    async setTeamLeader(code, actorUserId, team, leaderUserId) {
        const room = await this.prisma.room.findUnique({
            where: { code },
            select: { hostUserId: true, status: true },
        });
        if (!room)
            throw new common_1.NotFoundException('ROOM_NOT_FOUND');
        if (room.hostUserId !== actorUserId)
            throw new common_1.ForbiddenException('ONLY_HOST_CAN_SET_LEADER');
        if (room.status !== 'waiting')
            throw new common_1.BadRequestException('LEADER_ONLY_BEFORE_START');
        // ensure leader is in the room on same team
        const player = await this.prisma.roomPlayer.findUnique({
            where: { roomCode_userId: { roomCode: code, userId: leaderUserId } },
            select: { team: true },
        });
        if (!player)
            throw new common_1.NotFoundException('PLAYER_NOT_IN_ROOM');
        if (player.team && player.team !== team) {
            // align player team with chosen team
            await this.prisma.roomPlayer.update({
                where: { roomCode_userId: { roomCode: code, userId: leaderUserId } },
                data: { team },
            });
        }
        // unset other leaders for that team, then set chosen leader
        await this.prisma.$transaction([
            this.prisma.roomPlayer.updateMany({
                where: { roomCode: code, team },
                data: { isLeader: false },
            }),
            this.prisma.roomPlayer.update({
                where: { roomCode_userId: { roomCode: code, userId: leaderUserId } },
                data: { isLeader: true },
            }),
        ]);
        await this.prisma.timelineEvent.create({
            data: {
                kind: 'TEAM_LEADER_SET',
                roomCode: code,
                userId: actorUserId,
                meta: { team, leaderUserId },
            },
        });
        return this.getByCode(code);
    }
};
exports.RoomsService = RoomsService;
exports.RoomsService = RoomsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RoomsService);
//# sourceMappingURL=rooms.service.js.map