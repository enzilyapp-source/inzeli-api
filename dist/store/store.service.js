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
exports.StoreService = void 0;
// src/store/store.service.ts
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let StoreService = class StoreService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list() {
        return this.prisma.storeItem.findMany({
            where: { active: true },
            orderBy: [{ kind: 'asc' }, { price: 'asc' }],
        });
    }
    async myItems(userId) {
        return this.prisma.userItem.findMany({
            where: { userId },
            include: { item: true },
            orderBy: [{ item: { kind: 'asc' } }],
        });
    }
    async buy(userId, itemId) {
        const item = await this.prisma.storeItem.findUnique({ where: { id: itemId } });
        if (!item || !item.active)
            throw new common_1.NotFoundException('ITEM_NOT_FOUND');
        const owned = await this.prisma.userItem.findUnique({
            where: { userId_itemId: { userId, itemId } },
        });
        if (owned)
            return { alreadyOwned: true, balance: await this.balance(userId) };
        const result = await this.prisma.$transaction(async (tx) => {
            var _a, _b;
            const u = await tx.user.findUnique({
                where: { id: userId },
                select: { creditBalance: true },
            });
            if (!u)
                throw new common_1.NotFoundException('USER_NOT_FOUND');
            if (((_a = u.creditBalance) !== null && _a !== void 0 ? _a : 0) < item.price) {
                throw new common_1.BadRequestException('NOT_ENOUGH_CREDIT');
            }
            await tx.user.update({
                where: { id: userId },
                data: { creditBalance: { decrement: item.price } },
            });
            await tx.userItem.create({
                data: { userId, itemId },
            });
            const updated = await tx.user.findUnique({
                where: { id: userId },
                select: { creditBalance: true },
            });
            return { balance: (_b = updated === null || updated === void 0 ? void 0 : updated.creditBalance) !== null && _b !== void 0 ? _b : 0 };
        });
        return { itemId, balance: result.balance };
    }
    async apply(userId, data) {
        const updates = {};
        const checkOwnership = async (itemId) => {
            if (!itemId)
                return false;
            const owned = await this.prisma.userItem.findUnique({
                where: { userId_itemId: { userId, itemId } },
            });
            if (!owned)
                throw new common_1.BadRequestException('ITEM_NOT_OWNED');
            return true;
        };
        if (data.themeId !== undefined) {
            if (data.themeId === null || data.themeId === '')
                updates.themeId = null;
            else if (await checkOwnership(data.themeId))
                updates.themeId = data.themeId;
        }
        if (data.frameId !== undefined) {
            if (data.frameId === null || data.frameId === '')
                updates.frameId = null;
            else if (await checkOwnership(data.frameId))
                updates.frameId = data.frameId;
        }
        if (data.cardId !== undefined) {
            if (data.cardId === null || data.cardId === '')
                updates.cardId = null;
            else if (await checkOwnership(data.cardId))
                updates.cardId = data.cardId;
        }
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: updates,
            select: {
                id: true,
                themeId: true,
                frameId: true,
                cardId: true,
                creditBalance: true,
            },
        });
        return user;
    }
    async balance(userId) {
        var _a;
        const u = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { creditBalance: true },
        });
        if (!u)
            throw new common_1.NotFoundException('USER_NOT_FOUND');
        return (_a = u.creditBalance) !== null && _a !== void 0 ? _a : 0;
    }
};
exports.StoreService = StoreService;
exports.StoreService = StoreService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StoreService);
//# sourceMappingURL=store.service.js.map