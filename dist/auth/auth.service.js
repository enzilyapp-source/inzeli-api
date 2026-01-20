"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
// src/auth/auth.service.ts
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const pearls_1 = require("../common/pearls");
function isBcryptHash(s) {
    return typeof s === 'string' && (s.startsWith('$2a$') || s.startsWith('$2b$'));
}
let AuthService = class AuthService {
    constructor(prisma, jwt) {
        this.prisma = prisma;
        this.jwt = jwt;
    }
    // نحول المستخدم لشكل آمن ومتوافق مع Flutter
    toSafeUser(user, extras) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const pearls = (_c = (_b = (_a = extras === null || extras === void 0 ? void 0 : extras.pearls) !== null && _a !== void 0 ? _a : user.pearls) !== null && _b !== void 0 ? _b : user.creditPoints) !== null && _c !== void 0 ? _c : 0;
        return Object.assign({ id: user.id, email: user.email, displayName: user.displayName, permanentScore: (_d = user.permanentScore) !== null && _d !== void 0 ? _d : 0, 
            // Flutter يتوقع "creditPoints" → نربطه بالـ pearls من الداتا بيز
            creditPoints: pearls, pearls, creditBalance: (_e = user.creditBalance) !== null && _e !== void 0 ? _e : 0, themeId: (_f = user.themeId) !== null && _f !== void 0 ? _f : null, frameId: (_g = user.frameId) !== null && _g !== void 0 ? _g : null, cardId: (_h = user.cardId) !== null && _h !== void 0 ? _h : null }, ((extras === null || extras === void 0 ? void 0 : extras.gamePearls) ? { gamePearls: extras.gamePearls } : {}));
    }
    async loadPearlsSnapshot(userId) {
        const gamePearls = await (0, pearls_1.ensureAllGameWallets)(this.prisma, userId);
        const values = Object.values(gamePearls !== null && gamePearls !== void 0 ? gamePearls : {});
        const pearls = values.length ? Math.max(...values) : 0;
        return { pearls, gamePearls };
    }
    async register(dto) {
        const email = dto.email.toLowerCase().trim();
        const exists = await this.prisma.user.findUnique({ where: { email } });
        if (exists)
            throw new common_1.BadRequestException('EMAIL_EXISTS');
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const user = await this.prisma.user.create({
            data: {
                email,
                displayName: dto.displayName.trim(),
                passwordHash,
                // pearls default = 5 من schema.prisma
            },
        });
        const pearlsSnapshot = await this.loadPearlsSnapshot(user.id);
        const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
        return { user: this.toSafeUser(Object.assign(Object.assign({}, user), { pearls: pearlsSnapshot.pearls }), pearlsSnapshot), token };
    }
    async login(dto) {
        var _a;
        const email = dto.email.toLowerCase().trim();
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user)
            throw new common_1.UnauthorizedException('INVALID_CREDENTIALS');
        const stored = (_a = user.passwordHash) !== null && _a !== void 0 ? _a : '';
        let passOk = false;
        if (isBcryptHash(stored)) {
            passOk = await bcrypt.compare(dto.password, stored);
        }
        else {
            // legacy: باسورد قديم plain
            passOk = stored === dto.password;
            if (passOk) {
                const newHash = await bcrypt.hash(dto.password, 10);
                await this.prisma.user.update({
                    where: { id: user.id },
                    data: { passwordHash: newHash },
                });
            }
        }
        if (!passOk)
            throw new common_1.UnauthorizedException('INVALID_CREDENTIALS');
        const pearlsSnapshot = await this.loadPearlsSnapshot(user.id);
        const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
        return { user: this.toSafeUser(Object.assign(Object.assign({}, user), { pearls: pearlsSnapshot.pearls }), pearlsSnapshot), token };
    }
    async getProfile(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.UnauthorizedException('USER_NOT_FOUND');
        const pearlsSnapshot = await this.loadPearlsSnapshot(userId);
        return this.toSafeUser(Object.assign(Object.assign({}, user), { pearls: pearlsSnapshot.pearls }), pearlsSnapshot);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map