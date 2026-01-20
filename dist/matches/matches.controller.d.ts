import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
export declare class MatchesController {
    private readonly matches;
    constructor(matches: MatchesService);
    /**
     * POST /api/matches
     * body:
     * {
     *   roomCode?: string,
     *   gameId: string,
     *   winners: string[],
     *   losers: string[],
     *   sponsorCode?: string
     * }
     */
    create(_req: any, dto: CreateMatchDto): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
    }>>;
}
