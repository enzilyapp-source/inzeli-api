import { PrismaService } from '../prisma.service';
export declare class MatchesService {
    private prisma;
    constructor(prisma: PrismaService);
    createMatch(input: {
        roomCode?: string;
        gameId: string;
        winners: string[];
        losers: string[];
    }): Promise<{
        parts: {
            userId: string;
            outcome: import(".prisma/client").$Enums.Outcome;
            matchId: string;
        }[];
    } & {
        id: string;
        gameId: string;
        sponsorCode: string | null;
        createdAt: Date;
        roomCode: string | null;
    }>;
}
