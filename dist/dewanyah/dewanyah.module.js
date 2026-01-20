"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DewanyahModule = void 0;
const common_1 = require("@nestjs/common");
const dewanyah_service_1 = require("./dewanyah.service");
const dewanyah_controller_1 = require("./dewanyah.controller");
const dewanyah_admin_controller_1 = require("./dewanyah_admin.controller");
const prisma_service_1 = require("../prisma.service");
let DewanyahModule = class DewanyahModule {
};
exports.DewanyahModule = DewanyahModule;
exports.DewanyahModule = DewanyahModule = __decorate([
    (0, common_1.Module)({
        controllers: [dewanyah_controller_1.DewanyahController, dewanyah_admin_controller_1.AdminDewanyahController],
        providers: [dewanyah_service_1.DewanyahService, prisma_service_1.PrismaService],
        exports: [dewanyah_service_1.DewanyahService],
    })
], DewanyahModule);
//# sourceMappingURL=dewanyah.module.js.map