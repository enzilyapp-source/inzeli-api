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
exports.SponsorsAdminController = void 0;
const common_1 = require("@nestjs/common");
const sponsors_service_1 = require("./sponsors.service");
const api_1 = require("../common/api");
const passport_1 = require("@nestjs/passport");
let SponsorsAdminController = class SponsorsAdminController {
    constructor(sponsors) {
        this.sponsors = sponsors;
    }
    async list() {
        try {
            return (0, api_1.ok)('Sponsors', await this.sponsors.listSponsorsWithGames());
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed');
        }
    }
    async create(body) {
        var _a, _b;
        try {
            const code = ((_a = body === null || body === void 0 ? void 0 : body.code) !== null && _a !== void 0 ? _a : '').trim();
            const name = ((_b = body === null || body === void 0 ? void 0 : body.name) !== null && _b !== void 0 ? _b : '').trim();
            if (!code || !name)
                return (0, api_1.err)('code/name required', 'VALIDATION');
            const s = await this.sponsors.createSponsor(code, name);
            return (0, api_1.ok)('Created sponsor', s);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed');
        }
    }
    async update(code, body) {
        try {
            const data = {
                name: body === null || body === void 0 ? void 0 : body.name,
                imageUrl: body === null || body === void 0 ? void 0 : body.imageUrl,
                themePrimary: body === null || body === void 0 ? void 0 : body.themePrimary,
                themeAccent: body === null || body === void 0 ? void 0 : body.themeAccent,
            };
            const s = await this.sponsors.updateSponsor(code, data);
            return (0, api_1.ok)('Updated sponsor', s);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed');
        }
    }
    async delete(code) {
        try {
            await this.sponsors.deleteSponsor(code);
            return (0, api_1.ok)('Deleted sponsor', { code });
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed');
        }
    }
    async addGame(code, body) {
        var _a;
        try {
            const gameId = ((_a = body === null || body === void 0 ? void 0 : body.gameId) !== null && _a !== void 0 ? _a : '').trim();
            const prizeAmount = body === null || body === void 0 ? void 0 : body.prizeAmount;
            if (!gameId)
                return (0, api_1.err)('gameId required', 'VALIDATION');
            const g = await this.sponsors.addGameToSponsor(code, gameId, prizeAmount);
            return (0, api_1.ok)('Game added', g);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed');
        }
    }
};
exports.SponsorsAdminController = SponsorsAdminController;
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SponsorsAdminController.prototype, "list", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SponsorsAdminController.prototype, "create", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Patch)(':code'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SponsorsAdminController.prototype, "update", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Delete)(':code'),
    __param(0, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SponsorsAdminController.prototype, "delete", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Post)(':code/games'),
    __param(0, (0, common_1.Param)('code')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SponsorsAdminController.prototype, "addGame", null);
exports.SponsorsAdminController = SponsorsAdminController = __decorate([
    (0, common_1.Controller)('admin/sponsors'),
    __metadata("design:paramtypes", [sponsors_service_1.SponsorsService])
], SponsorsAdminController);
//# sourceMappingURL=sponsors_admin.controller.js.map