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
exports.AdminDewanyahController = void 0;
const common_1 = require("@nestjs/common");
const dewanyah_service_1 = require("./dewanyah.service");
const api_1 = require("../common/api");
const passport_1 = require("@nestjs/passport");
let AdminDewanyahController = class AdminDewanyahController {
    constructor(dewanyah) {
        this.dewanyah = dewanyah;
    }
    // List all dewanyahs (admin)
    async listAll() {
        try {
            return (0, api_1.ok)('Dewanyahs', await this.dewanyah.listAllAdmin());
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    // List creation requests (pending/approved)
    async listRequests() {
        try {
            return (0, api_1.ok)('Requests', await this.dewanyah.listRequests());
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    // Approve & create dewanyah board
    async approve(req, id) {
        var _a;
        try {
            const adminUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
            const data = await this.dewanyah.approveRequest(id, adminUserId);
            return (0, api_1.ok)('Approved', data);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    // Add game to existing dewanyah
    async addGame(id, body) {
        var _a;
        try {
            const gameId = ((_a = body === null || body === void 0 ? void 0 : body.gameId) !== null && _a !== void 0 ? _a : '').trim();
            if (!gameId)
                return (0, api_1.err)('gameId required', 'VALIDATION');
            const data = await this.dewanyah.addGameToDewanyah(id, gameId);
            return (0, api_1.ok)('Game added', data);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    // Create dewanyah directly (admin)
    async createDirect(body) {
        var _a, _b, _c;
        try {
            const name = ((_a = body === null || body === void 0 ? void 0 : body.name) !== null && _a !== void 0 ? _a : '').trim();
            const gameId = ((_b = body === null || body === void 0 ? void 0 : body.gameId) !== null && _b !== void 0 ? _b : '').trim();
            if (!name || !gameId)
                return (0, api_1.err)('name/gameId required', 'VALIDATION');
            const data = await this.dewanyah.createDewanyahManual({
                name,
                ownerName: body === null || body === void 0 ? void 0 : body.owner,
                ownerEmail: body === null || body === void 0 ? void 0 : body.ownerEmail,
                ownerUserId: body === null || body === void 0 ? void 0 : body.ownerUserId,
                note: body === null || body === void 0 ? void 0 : body.note,
                gameId,
                requireApproval: body === null || body === void 0 ? void 0 : body.requireApproval,
                locationLock: body === null || body === void 0 ? void 0 : body.locationLock,
                radiusMeters: (_c = body === null || body === void 0 ? void 0 : body.lockRadius) !== null && _c !== void 0 ? _c : body === null || body === void 0 ? void 0 : body.radiusMeters,
                imageUrl: body === null || body === void 0 ? void 0 : body.imageUrl,
                themePrimary: body === null || body === void 0 ? void 0 : body.themePrimary,
                themeAccent: body === null || body === void 0 ? void 0 : body.themeAccent,
            });
            return (0, api_1.ok)('Created dewanyah', data);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    // Update dewanyah
    async update(id, body) {
        try {
            const data = {
                name: body === null || body === void 0 ? void 0 : body.name,
                ownerName: body === null || body === void 0 ? void 0 : body.ownerName,
                ownerEmail: body === null || body === void 0 ? void 0 : body.ownerEmail,
                note: body === null || body === void 0 ? void 0 : body.note,
                imageUrl: body === null || body === void 0 ? void 0 : body.imageUrl,
                themePrimary: body === null || body === void 0 ? void 0 : body.themePrimary,
                themeAccent: body === null || body === void 0 ? void 0 : body.themeAccent,
            };
            const r = await this.dewanyah.updateDewanyah(id, data);
            return (0, api_1.ok)('Updated dewanyah', r);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    // Delete dewanyah
    async delete(id) {
        try {
            await this.dewanyah.deleteDewanyah(id);
            return (0, api_1.ok)('Deleted dewanyah', { id });
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
};
exports.AdminDewanyahController = AdminDewanyahController;
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminDewanyahController.prototype, "listAll", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Get)('requests'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminDewanyahController.prototype, "listRequests", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Patch)('requests/:id/approve'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminDewanyahController.prototype, "approve", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Post)(':id/games'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminDewanyahController.prototype, "addGame", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminDewanyahController.prototype, "createDirect", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminDewanyahController.prototype, "update", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminDewanyahController.prototype, "delete", null);
exports.AdminDewanyahController = AdminDewanyahController = __decorate([
    (0, common_1.Controller)('admin/dewanyah'),
    __metadata("design:paramtypes", [dewanyah_service_1.DewanyahService])
], AdminDewanyahController);
//# sourceMappingURL=dewanyah_admin.controller.js.map