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
exports.UsersController = void 0;
// src/users/users.controller.ts
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const prisma_service_1 = require("../prisma.service");
const api_1 = require("../common/api");
const pearls_1 = require("../common/pearls");
let UsersController = class UsersController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async me(req) {
        try {
            const userId = req.user.userId;
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    email: true,
                    displayName: true,
                    permanentScore: true,
                    createdAt: true,
                },
            });
            if (!user)
                return (0, api_1.err)('USER_NOT_FOUND', 'USER_NOT_FOUND');
            const gamePearls = await (0, pearls_1.ensureAllGameWallets)(this.prisma, userId);
            const pearls = await (0, pearls_1.getPearls)(this.prisma, userId);
            return (0, api_1.ok)('Me', Object.assign(Object.assign({}, user), { pearls,
                gamePearls, creditPoints: pearls }));
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    async search(q) {
        const query = q.trim();
        if (!query)
            return (0, api_1.ok)('Users', []);
        const where = {
            OR: [
                { email: { contains: query } },
                { displayName: { contains: query } },
                { id: { contains: query } },
            ],
        };
        const users = await this.prisma.user.findMany({
            where,
            take: 20,
            select: { id: true, email: true, displayName: true },
            orderBy: { createdAt: 'desc' },
        });
        return (0, api_1.ok)('Users', users);
    }
    async stats(id) {
        var _a;
        try {
            const wins = await this.prisma.matchParticipant.count({
                where: { userId: id, outcome: 'WIN' },
            });
            const losses = await this.prisma.matchParticipant.count({
                where: { userId: id, outcome: 'LOSS' },
            });
            const user = await this.prisma.user.findUnique({
                where: { id },
                select: { id: true, permanentScore: true },
            });
            if (!user)
                return (0, api_1.err)('USER_NOT_FOUND', 'USER_NOT_FOUND');
            const gamePearls = await (0, pearls_1.ensureAllGameWallets)(this.prisma, id);
            const pearls = await (0, pearls_1.getPearls)(this.prisma, id);
            return (0, api_1.ok)('Stats', {
                userId: id,
                wins,
                losses,
                permanentScore: (_a = user.permanentScore) !== null && _a !== void 0 ? _a : 0,
                pearls,
                gamePearls,
                creditPoints: pearls,
            });
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "me", null);
__decorate([
    (0, common_1.Get)('search/:q'),
    __param(0, (0, common_1.Param)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(':id/stats'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "stats", null);
exports.UsersController = UsersController = __decorate([
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersController);
//# sourceMappingURL=users.controller.js.map