import { PrismaService } from '../prisma.service';
export declare class SponsorsService {
    private prisma;
    constructor(prisma: PrismaService);
    listSponsors(): Promise<{
        name: string;
        code: string;
        active: boolean;
    }[]>;
    listSponsorsWithGames(): Promise<({
        SponsorGame: {
            gameId: string;
            prizeAmount: number;
        }[];
    } & {
        name: string;
        code: string;
        active: boolean;
        imageUrl: string | null;
        themePrimary: string | null;
        themeAccent: string | null;
    })[]>;
    createSponsor(code: string, name: string): Promise<{
        name: string;
        code: string;
        active: boolean;
        imageUrl: string | null;
        themePrimary: string | null;
        themeAccent: string | null;
    }>;
    updateSponsor(code: string, data: {
        name?: string;
        imageUrl?: string;
        themePrimary?: string;
        themeAccent?: string;
    }): Promise<{
        name: string;
        code: string;
        active: boolean;
        imageUrl: string | null;
        themePrimary: string | null;
        themeAccent: string | null;
    }>;
    deleteSponsor(code: string): Promise<{
        name: string;
        code: string;
        active: boolean;
        imageUrl: string | null;
        themePrimary: string | null;
        themeAccent: string | null;
    }>;
    addGameToSponsor(code: string, gameId: string, prizeAmount?: number): Promise<{
        gameId: string;
        sponsorCode: string;
        prizeAmount: number;
    }>;
    getSponsorWithGames(code: string): Promise<{
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
    }>;
    joinSponsor(userId: string, sponsorCode: string): Promise<{
        sponsorCode: string;
    }>;
    userWallets(userId: string, sponsorCode: string): Promise<({
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
    })[]>;
    userAllWallets(userId: string): Promise<({
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
    })[]>;
    sponsorGames(sponsorCode: string): Promise<{
        sponsorCode: string;
        gameId: string;
        prizeAmount: number;
        game: {
            id: string;
            name: string;
            category: string;
        };
    }[]>;
    sponsorGameLeaderboard(args: {
        sponsorCode: string;
        gameId: string;
        limit: number;
    }): Promise<{
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
    }>;
}
