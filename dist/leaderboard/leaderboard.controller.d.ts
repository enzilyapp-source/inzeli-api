import { LeaderboardService } from './leaderboard.service';
export declare class LeaderboardController {
    private readonly lb;
    constructor(lb: LeaderboardService);
    global(limit?: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        scope: string;
        rows: {
            rank: number;
            userId: string;
            displayName: string;
            email: string;
            permanentScore: number;
            pearls: number;
        }[];
    }>>;
    game(gameId?: string, limit?: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        scope: string;
        gameId: string;
        rows: {
            rank: number;
            userId: string;
            displayName: string;
            email: string;
            pearls: number;
        }[];
    }>>;
    sponsor(sponsorCode?: string, gameId?: string, limit?: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
    }>>;
}
