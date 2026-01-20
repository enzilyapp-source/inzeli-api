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
exports.StoreController = void 0;
// src/store/store.controller.ts
const common_1 = require("@nestjs/common");
const store_service_1 = require("./store.service");
const api_1 = require("../common/api");
const passport_1 = require("@nestjs/passport");
let StoreController = class StoreController {
    constructor(store) {
        this.store = store;
    }
    async list() {
        try {
            return (0, api_1.ok)('Store items', await this.store.list());
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    async myItems(req) {
        try {
            const userId = req.user.userId;
            return (0, api_1.ok)('My items', await this.store.myItems(userId));
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    async buy(req, id) {
        try {
            const userId = req.user.userId;
            return (0, api_1.ok)('Purchased', await this.store.buy(userId, id));
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Purchase failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    async apply(req, body) {
        try {
            const userId = req.user.userId;
            return (0, api_1.ok)('Applied', await this.store.apply(userId, body !== null && body !== void 0 ? body : {}));
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Apply failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
};
exports.StoreController = StoreController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StoreController.prototype, "list", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StoreController.prototype, "myItems", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Post)(':id/buy'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], StoreController.prototype, "buy", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Post)('apply'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StoreController.prototype, "apply", null);
exports.StoreController = StoreController = __decorate([
    (0, common_1.Controller)('store'),
    __metadata("design:paramtypes", [store_service_1.StoreService])
], StoreController);
//# sourceMappingURL=store.controller.js.map