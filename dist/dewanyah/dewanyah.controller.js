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
exports.DewanyahController = void 0;
const common_1 = require("@nestjs/common");
const dewanyah_service_1 = require("./dewanyah.service");
const api_1 = require("../common/api");
const passport_1 = require("@nestjs/passport");
let DewanyahController = class DewanyahController {
    constructor(dewanyah) {
        this.dewanyah = dewanyah;
    }
    async createRequest(req, body) {
        var _a, _b;
        try {
            const userId = req.user.userId;
            const name = ((_a = body === null || body === void 0 ? void 0 : body.name) !== null && _a !== void 0 ? _a : '').trim();
            const contact = ((_b = body === null || body === void 0 ? void 0 : body.contact) !== null && _b !== void 0 ? _b : '').trim();
            if (!name || !contact)
                return (0, api_1.err)('name/contact required', 'VALIDATION');
            const data = await this.dewanyah.createRequest({
                userId,
                name,
                contact,
                gameId: body === null || body === void 0 ? void 0 : body.gameId,
                note: body === null || body === void 0 ? void 0 : body.note,
                requireApproval: body === null || body === void 0 ? void 0 : body.requireApproval,
                locationLock: body === null || body === void 0 ? void 0 : body.locationLock,
                radiusMeters: body === null || body === void 0 ? void 0 : body.radiusMeters,
            });
            return (0, api_1.ok)('Request stored', data);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    async list() {
        try {
            return (0, api_1.ok)('Dewanyah list', await this.dewanyah.listDewanyahs());
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    async join(req, id) {
        try {
            const userId = req.user.userId;
            const data = await this.dewanyah.requestJoin(id, userId);
            return (0, api_1.ok)('Join recorded', data);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    async leaderboard(id, limit) {
        try {
            const n = Math.max(1, Math.min(100, Number(limit !== null && limit !== void 0 ? limit : 100) || 100));
            const data = await this.dewanyah.leaderboard(id, n);
            return (0, api_1.ok)('Leaderboard', data);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    // Owner: list members (pending/approved)
    async members(req, id) {
        try {
            const userId = req.user.userId;
            const data = await this.dewanyah.listMembersForOwner(id, userId);
            return (0, api_1.ok)('Members', data);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    // Owner: set member status
    async setMemberStatus(req, id, memberId, body) {
        var _a;
        try {
            const userId = req.user.userId;
            await this.dewanyah.getOwnerDewanyah(id, userId);
            const status = ((_a = body === null || body === void 0 ? void 0 : body.status) !== null && _a !== void 0 ? _a : '').toString();
            if (status.isEmpty)
                return (0, api_1.err)('status required', 'VALIDATION');
            const data = await this.dewanyah.setMemberStatus(id, memberId, status);
            return (0, api_1.ok)('Status updated', data);
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
};
exports.DewanyahController = DewanyahController;
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Post)('requests'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DewanyahController.prototype, "createRequest", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DewanyahController.prototype, "list", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Post)(':id/join'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], DewanyahController.prototype, "join", null);
__decorate([
    (0, common_1.Get)(':id/leaderboard'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DewanyahController.prototype, "leaderboard", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Get)(':id/members'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], DewanyahController.prototype, "members", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Patch)(':id/members/:userId/status'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('userId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], DewanyahController.prototype, "setMemberStatus", null);
exports.DewanyahController = DewanyahController = __decorate([
    (0, common_1.Controller)('dewanyah'),
    __metadata("design:paramtypes", [dewanyah_service_1.DewanyahService])
], DewanyahController);
//# sourceMappingURL=dewanyah.controller.js.map