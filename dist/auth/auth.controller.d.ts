import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthController {
    private readonly auth;
    constructor(auth: AuthService);
    register(dto: RegisterDto): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
    }>>;
    login(dto: LoginDto): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
    }>>;
    me(req: any): Promise<import("../common/api").ApiOk<{
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
    }>>;
}
