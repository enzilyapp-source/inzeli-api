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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineController = void 0;
// src/timeline/timeline.controller.ts
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
const passport_1 = require("@nestjs/passport");
const api_1 = require("../common/api");
function getReqUserId(req) {
    var _a, _b, _c, _d;
    return ((_a = req === null || req === void 0 ? void 0 : req.user) === null || _a === void 0 ? void 0 : _a.userId) || ((_b = req === null || req === void 0 ? void 0 : req.user) === null || _b === void 0 ? void 0 : _b.id) || ((_c = req === null || req === void 0 ? void 0 : req.user) === null || _c === void 0 ? void 0 : _c.sub) || ((_d = req === null || req === void 0 ? void 0 : req.user) === null || _d === void 0 ? void 0 : _d.uid);
}
let TimelineController = class TimelineController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(req, limit, gameId) {
        try {
            const userId = getReqUserId(req);
            if (!userId)
                throw new Error('AUTH_USER_ID_MISSING');
            const n = Math.min(Math.max(Number(limit !== null && limit !== void 0 ? limit : 50), 1), 200);
            const events = await this.prisma.timelineEvent.findMany({
                where: Object.assign({ userId }, (gameId ? { gameId } : {})),
                orderBy: { createdAt: 'desc' },
                take: n,
            });
            return (0, api_1.ok)('Timeline', events.map((e) => ({
                id: e.id,
                userId: e.userId,
                roomCode: e.roomCode,
                gameId: e.gameId,
                kind: e.kind,
                meta: e.meta,
                ts: e.createdAt,
            })));
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Timeline failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
};
exports.TimelineController = TimelineController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('gameId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], TimelineController.prototype, "list", null);
exports.TimelineController = TimelineController = __decorate([
    (0, common_1.Controller)('timeline'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TimelineController);
//# sourceMappingURL=timeline.controller.js.map