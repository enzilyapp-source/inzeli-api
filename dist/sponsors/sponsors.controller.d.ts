import { SponsorsService } from './sponsors.service';
export declare class SponsorsController {
    private readonly sponsors;
    constructor(sponsors: SponsorsService);
    list(): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        name: string;
        code: string;
        active: boolean;
    }[]>>;
    detail(code: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        sponsor: {
            name: string;
            code: string;
            active: boolean;
        };
        games: ({
            game: {
                id: string;
                name: string;
                category: string;
            };
        } & {
            gameId: string;
            sponsorCode: string;
            prizeAmount: number;
        })[];
    }>>;
    join(req: any, code: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        sponsorCode: string;
    }>>;
    myWallets(req: any, code: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<({
        game: {
            id: string;
            name: string;
            category: string;
        };
    } & {
        gameId: string;
        sponsorCode: string;
        pearls: number;
        userId: string;
        seasonYm: number | null;
        updatedAt: Date;
    })[]>>;
    allMyWallets(req: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<({
        game: {
            id: string;
            name: string;
        };
        sponsor: {
            name: string;
            code: string;
        };
    } & {
        gameId: string;
        sponsorCode: string;
        pearls: number;
        userId: string;
        seasonYm: number | null;
        updatedAt: Date;
    })[]>>;
    sponsorLeaderboard(sponsorCode: string, gameId?: string, limit?: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        sponsor: {
            name: string;
            code: string;
        };
        gameId: string;
        rows: {
            rank: number;
            userId: string;
            displayName: string;
            email: string;
            pearls: number;
            wins: number;
            losses: number;
            streak: number;
            fire: boolean;
        }[];
    }>>;
    sponsorGames(sponsorCode: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        sponsorCode: string;
        gameId: string;
        prizeAmount: number;
        game: {
            id: string;
            name: string;
            category: string;
        };
    }[]>>;
}
