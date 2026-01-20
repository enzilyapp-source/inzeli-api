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
exports.LeaderboardController = void 0;
const common_1 = require("@nestjs/common");
const leaderboard_service_1 = require("./leaderboard.service");
const api_1 = require("../common/api");
let LeaderboardController = class LeaderboardController {
    constructor(lb) {
        this.lb = lb;
    }
    async global(limit) {
        try {
            return (0, api_1.ok)('Global leaderboard', await this.lb.globalLeaderboard(Number(limit !== null && limit !== void 0 ? limit : 50)));
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    // Regular (per-game) leaderboard using userGameWallet
    async game(gameId, limit) {
        try {
            if (!gameId)
                return (0, api_1.err)('Missing gameId', 'BAD_REQUEST');
            return (0, api_1.ok)('Game leaderboard', await this.lb.gameLeaderboard(gameId, Number(limit !== null && limit !== void 0 ? limit : 50)));
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
    async sponsor(sponsorCode, gameId, limit) {
        try {
            if (!sponsorCode || !gameId)
                return (0, api_1.err)('Missing sponsorCode/gameId', 'BAD_REQUEST');
            return (0, api_1.ok)('Sponsor leaderboard', await this.lb.sponsorGameLeaderboard(sponsorCode, gameId, Number(limit !== null && limit !== void 0 ? limit : 50)));
        }
        catch (e) {
            return (0, api_1.err)((e === null || e === void 0 ? void 0 : e.message) || 'Failed', e === null || e === void 0 ? void 0 : e.message);
        }
    }
};
exports.LeaderboardController = LeaderboardController;
__decorate([
    (0, common_1.Get)('global'),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LeaderboardController.prototype, "global", null);
__decorate([
    (0, common_1.Get)('game'),
    __param(0, (0, common_1.Query)('gameId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], LeaderboardController.prototype, "game", null);
__decorate([
    (0, common_1.Get)('sponsor'),
    __param(0, (0, common_1.Query)('sponsorCode')),
    __param(1, (0, common_1.Query)('gameId')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], LeaderboardController.prototype, "sponsor", null);
exports.LeaderboardController = LeaderboardController = __decorate([
    (0, common_1.Controller)('leaderboard'),
    __metadata("design:paramtypes", [leaderboard_service_1.LeaderboardService])
], LeaderboardController);
//src/auth/leaderboard/leaderboard.controller.ts 
//# sourceMappingURL=leaderboard.controller.js.map