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
exports.MatchesService = void 0;
// src/matches/matches.service.ts
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
const pearls_1 = require("../common/pearls");
let MatchesService = class MatchesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createMatch(input) {
        var _a, _b, _c;
        const { roomCode, gameId } = input;
        const winners = (_a = input.winners) !== null && _a !== void 0 ? _a : [];
        const losers = (_b = input.losers) !== null && _b !== void 0 ? _b : [];
        const now = Date.now();
        if (winners.length === 0 && losers.length === 0) {
            throw new common_1.BadRequestException('EMPTY_MATCH');
        }
        let room = null;
        if (roomCode) {
            room = await this.prisma.room.findUnique({
                where: { code: roomCode },
                include: { players: { select: { userId: true, team: true } } },
            });
            if (!room)
                throw new common_1.NotFoundException('ROOM_NOT_FOUND');
            // ✅ enforce server-side timer: must be started and finished
            if (room.status !== 'running' || !room.startedAt) {
                throw new common_1.BadRequestException('ROOM_NOT_STARTED');
            }
            // السماح بحسم النتيجة مباشرة (بدون انتظار العداد)
            // لو احتجنا تفعيل الانتظار لاحقاً، نعيد الشرط التالي:
            // const endAt = room.timerSec ? room.startedAt.getTime() + room.timerSec * 1000 : null;
            // if (endAt && now < endAt) throw new BadRequestException('TIMER_NOT_FINISHED');
        }
        // ✅ sponsorCode لو موجود في الروم
        const sponsorCode = (_c = room === null || room === void 0 ? void 0 : room.sponsorCode) !== null && _c !== void 0 ? _c : null;
        // إنشاء match
        const match = await this.prisma.match.create({
            data: {
                roomCode: roomCode !== null && roomCode !== void 0 ? roomCode : null,
                gameId,
                sponsorCode,
                parts: {
                    create: [
                        ...winners.map((uid) => ({ userId: uid, outcome: 'WIN' })),
                        ...losers.map((uid) => ({ userId: uid, outcome: 'LOSS' })),
                    ],
                },
            },
            include: { parts: true },
        });
        // تسوية اللؤلؤ والنقاط
        await this.prisma.$transaction(async (tx) => {
            // permanentScore
            if (winners.length) {
                await tx.user.updateMany({
                    where: { id: { in: winners } },
                    data: { permanentScore: { increment: 1 } },
                });
            }
            if (losers.length) {
                await tx.user.updateMany({
                    where: { id: { in: losers } },
                    data: { permanentScore: { decrement: 1 } },
                });
            }
            if (roomCode) {
                const latestRoom = room !== null && room !== void 0 ? room : (await tx.room.findUnique({ where: { code: roomCode } }));
                const sc = sponsorCode;
                const game = latestRoom.gameId;
                // خصم 1 لؤلؤة من كل خاسر (إذا عنده)، وجمعها
                let pot = 0;
                for (const lo of losers) {
                    try {
                        if (sc) {
                            const cur = await (0, pearls_1.getSponsorPearls)(tx, lo, sc, game);
                            if (cur > 0) {
                                await (0, pearls_1.decSponsorPearls)(tx, lo, sc, game, 1);
                                pot += 1;
                            }
                        }
                        else {
                            const cur = await (0, pearls_1.getGamePearls)(tx, lo, game);
                            if (cur > 0) {
                                await (0, pearls_1.decGamePearls)(tx, lo, game, 1);
                                pot += 1;
                            }
                        }
                    }
                    catch (_) {
                        // إذا ما عنده رصيد، تجاهل
                    }
                }
                // وزّع الـ pot على الفائزين بالتساوي (باقي الزيادة لأول فائز)
                if (pot > 0 && winners.length > 0) {
                    const per = Math.floor(pot / winners.length);
                    const rem = pot % winners.length;
                    for (let i = 0; i < winners.length; i++) {
                        const inc = per + (i === 0 ? rem : 0);
                        if (inc > 0) {
                            if (sc)
                                await (0, pearls_1.incSponsorPearls)(tx, winners[i], sc, game, inc);
                            else
                                await (0, pearls_1.incGamePearls)(tx, winners[i], game, inc);
                        }
                    }
                }
            }
            await tx.timelineEvent.create({
                data: {
                    kind: 'MATCH_FINISHED',
                    roomCode: roomCode !== null && roomCode !== void 0 ? roomCode : null,
                    gameId,
                    meta: {
                        winners,
                        losers,
                        pearlsPot: true,
                        refundedWinnerStake: false,
                        distributedLoserStake: true,
                    },
                },
            });
            // أغلق الروم بعد حسم المباراة
            if (roomCode) {
                await tx.room.update({
                    where: { code: roomCode },
                    data: {
                        status: 'finished',
                        timerSec: null,
                        startedAt: null,
                    },
                });
                await tx.timelineEvent.create({
                    data: {
                        kind: 'ROOM_FINISHED',
                        roomCode,
                        gameId,
                        meta: { winners, losers },
                    },
                });
            }
        });
        return match;
    }
};
exports.MatchesService = MatchesService;
exports.MatchesService = MatchesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MatchesService);
//# sourceMappingURL=matches.service.js.map