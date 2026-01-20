import { PrismaService } from '../prisma.service';
export declare class LeaderboardService {
    private prisma;
    constructor(prisma: PrismaService);
    globalLeaderboard(limit?: number): Promise<{
        scope: string;
        rows: {
            rank: number;
            userId: string;
            displayName: string;
            email: string;
            permanentScore: number;
            pearls: number;
        }[];
    }>;
    gameLeaderboard(gameId: string, limit?: number): Promise<{
        scope: string;
        gameId: string;
        rows: {
            rank: number;
            userId: string;
            displayName: string;
            email: string;
            pearls: number;
        }[];
    }>;
    sponsorGameLeaderboard(sponsorCode: string, gameId: string, limit?: number): Promise<{
        sponsor: {
            name: string;
            code: string;
            active: boolean;
        };
        gameId: string;
        rows: {
            rank: number;
            userId: string;
            displayName: string;
            email: string;
            pearls: number;
        }[];
    }>;
}
