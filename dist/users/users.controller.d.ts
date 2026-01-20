import { PrismaService } from '../prisma.service';
export declare class UsersController {
    private prisma;
    constructor(prisma: PrismaService);
    me(req: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        pearls: number;
        gamePearls: Record<string, number>;
        creditPoints: number;
        id: string;
        createdAt: Date;
        email: string;
        displayName: string;
        permanentScore: number;
    }>>;
    search(q: string): Promise<import("../common/api").ApiOk<{
        id: string;
        email: string;
        displayName: string;
    }[]>>;
    stats(id: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        userId: string;
        wins: number;
        losses: number;
        permanentScore: number;
        pearls: number;
        gamePearls: Record<string, number>;
        creditPoints: number;
    }>>;
}
