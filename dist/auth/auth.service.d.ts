import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private prisma;
    private jwt;
    constructor(prisma: PrismaService, jwt: JwtService);
    private toSafeUser;
    private loadPearlsSnapshot;
    register(dto: RegisterDto): Promise<{
        user: {
            gamePearls?: Record<string, number> | undefined;
            id: any;
            email: any;
            displayName: any;
            permanentScore: any;
            creditPoints: any;
            pearls: any;
            creditBalance: any;
            themeId: any;
            frameId: any;
            cardId: any;
        };
        token: string;
    }>;
    login(dto: LoginDto): Promise<{
        user: {
            gamePearls?: Record<string, number> | undefined;
            id: any;
            email: any;
            displayName: any;
            permanentScore: any;
            creditPoints: any;
            pearls: any;
            creditBalance: any;
            themeId: any;
            frameId: any;
            cardId: any;
        };
        token: string;
    }>;
    getProfile(userId: string): Promise<{
        gamePearls?: Record<string, number> | undefined;
        id: any;
        email: any;
        displayName: any;
        permanentScore: any;
        creditPoints: any;
        pearls: any;
        creditBalance: any;
        themeId: any;
        frameId: any;
        cardId: any;
    }>;
}
