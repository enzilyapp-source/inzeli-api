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
exports.DewanyahService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let DewanyahService = class DewanyahService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createRequest(params) {
        const { userId, name, contact, gameId, note, requireApproval, locationLock, radiusMeters } = params;
        return this.prisma.dewanyahRequest.create({
            data: {
                userId,
                name,
                contact,
                gameId,
                note,
                requireApproval: requireApproval !== null && requireApproval !== void 0 ? requireApproval : true,
                locationLock: locationLock !== null && locationLock !== void 0 ? locationLock : false,
                radiusMeters,
            },
        });
    }
    async listRequests() {
        const reqs = await this.prisma.dewanyahRequest.findMany({
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, email: true, displayName: true } } },
        });
        // enrich with user info for the admin UI
        return reqs.map((r) => {
            var _a, _b;
            return (Object.assign(Object.assign({}, r), { ownerEmail: (_a = r.user) === null || _a === void 0 ? void 0 : _a.email, owner: (_b = r.user) === null || _b === void 0 ? void 0 : _b.displayName }));
        });
    }
    async listDewanyahs() {
        return this.prisma.dewanyah.findMany({
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            include: {
                games: { select: { gameId: true } },
                _count: { select: { members: true } },
            },
        });
    }
    async listAllAdmin() {
        return this.prisma.dewanyah.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                games: { select: { gameId: true } },
                _count: { select: { members: true } },
            },
        });
    }
    async approveRequest(requestId, adminUserId) {
        const req = await this.prisma.dewanyahRequest.findUnique({ where: { id: requestId } });
        if (!req)
            throw new Error('Request not found');
        if (req.status === 'approved')
            return req;
        const dew = await this.prisma.dewanyah.create({
            data: {
                name: req.name,
                ownerUserId: req.userId,
                ownerEmail: undefined,
                ownerName: undefined,
                note: req.note,
                locationLock: req.locationLock,
                radiusMeters: req.radiusMeters,
                requireApproval: req.requireApproval,
                members: {
                    create: [
                        {
                            userId: req.userId,
                            status: 'approved',
                            approvedAt: new Date(),
                        },
                    ],
                },
                games: req.gameId
                    ? {
                        create: [
                            {
                                gameId: req.gameId,
                            },
                        ],
                    }
                    : undefined,
            },
        });
        await this.prisma.dewanyahRequest.update({
            where: { id: requestId },
            data: { status: 'approved', reviewedAt: new Date() },
        });
        return dew;
    }
    async updateDewanyah(id, data) {
        return this.prisma.dewanyah.update({
            where: { id },
            data,
        });
    }
    async deleteDewanyah(id) {
        return this.prisma.dewanyah.delete({ where: { id } });
    }
    async getOwnerDewanyah(dewanyahId, ownerUserId) {
        const dew = await this.prisma.dewanyah.findUnique({ where: { id: dewanyahId } });
        if (!dew)
            throw new Error('Dewanyah not found');
        if (dew.ownerUserId && dew.ownerUserId !== ownerUserId) {
            throw new Error('NOT_OWNER');
        }
        return dew;
    }
    async addGameToDewanyah(dewanyahId, gameId) {
        return this.prisma.dewanyahGame.upsert({
            where: {
                dewanyahId_gameId: {
                    dewanyahId,
                    gameId,
                },
            },
            update: {},
            create: { dewanyahId, gameId },
        });
    }
    async requestJoin(dewanyahId, userId) {
        const dew = await this.prisma.dewanyah.findUnique({ where: { id: dewanyahId } });
        if (!dew)
            throw new Error('Dewanyah not found');
        const status = dew.requireApproval ? 'pending' : 'approved';
        return this.prisma.dewanyahMember.upsert({
            where: {
                dewanyahId_userId: { dewanyahId, userId },
            },
            update: { status, approvedAt: status === 'approved' ? new Date() : null },
            create: {
                dewanyahId,
                userId,
                status,
                approvedAt: status === 'approved' ? new Date() : null,
            },
        });
    }
    async setMemberStatus(dewanyahId, userId, status) {
        return this.prisma.dewanyahMember.update({
            where: {
                dewanyahId_userId: { dewanyahId, userId },
            },
            data: {
                status,
                approvedAt: status === 'approved' ? new Date() : null,
            },
        });
    }
    async listMembersForOwner(dewanyahId, ownerUserId) {
        await this.getOwnerDewanyah(dewanyahId, ownerUserId);
        return this.prisma.dewanyahMember.findMany({
            where: { dewanyahId },
            include: { user: { select: { id: true, displayName: true, email: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }
    async leaderboard(dewanyahId, limit = 100) {
        const n = Math.max(1, Math.min(100, limit));
        const members = await this.prisma.dewanyahMember.findMany({
            where: { dewanyahId, status: 'approved' },
            orderBy: { approvedAt: 'desc' },
            take: n,
            include: {
                user: {
                    select: { id: true, displayName: true, email: true, pearls: true },
                },
            },
        });
        return members.map((m) => {
            var _a, _b, _c, _d, _e;
            return ({
                userId: m.userId,
                displayName: (_b = (_a = m.user) === null || _a === void 0 ? void 0 : _a.displayName) !== null && _b !== void 0 ? _b : 'لاعب',
                email: (_c = m.user) === null || _c === void 0 ? void 0 : _c.email,
                pearls: (_e = (_d = m.user) === null || _d === void 0 ? void 0 : _d.pearls) !== null && _e !== void 0 ? _e : 0,
                status: m.status,
                joinedAt: m.createdAt,
            });
        });
    }
    // Admin: create dewanyah directly
    async createDewanyahManual(data) {
        const { name, ownerName, ownerEmail, ownerUserId, note, gameId, requireApproval, locationLock, radiusMeters, imageUrl, themePrimary, themeAccent, } = data;
        let ownerId = ownerUserId;
        if (!ownerId && ownerEmail) {
            const user = await this.prisma.user.findUnique({ where: { email: ownerEmail } });
            if (user)
                ownerId = user.id;
        }
        const fallbackOwner = ownerId !== null && ownerId !== void 0 ? ownerId : 'admin';
        const payload = {
            name,
            ownerName,
            ownerEmail,
            ownerUserId: fallbackOwner,
            note,
            requireApproval: requireApproval !== null && requireApproval !== void 0 ? requireApproval : true,
            locationLock: locationLock !== null && locationLock !== void 0 ? locationLock : false,
            radiusMeters,
            games: { create: [{ gameId }] },
            members: ownerUserId != null
                ? { create: [{ userId: ownerUserId, status: 'approved', approvedAt: new Date() }] }
                : undefined,
        };
        if (imageUrl != null)
            payload.imageUrl = imageUrl;
        if (themePrimary != null)
            payload.themePrimary = themePrimary;
        if (themeAccent != null)
            payload.themeAccent = themeAccent;
        return this.prisma.dewanyah.create({ data: payload });
    }
};
exports.DewanyahService = DewanyahService;
exports.DewanyahService = DewanyahService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DewanyahService);
//# sourceMappingURL=dewanyah.service.js.map