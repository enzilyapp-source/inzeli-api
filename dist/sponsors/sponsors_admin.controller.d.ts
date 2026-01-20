import { SponsorsService } from './sponsors.service';
export declare class SponsorsAdminController {
    private readonly sponsors;
    constructor(sponsors: SponsorsService);
    list(): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<({
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
    })[]>>;
    create(body: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        name: string;
        code: string;
        active: boolean;
        imageUrl: string | null;
        themePrimary: string | null;
        themeAccent: string | null;
    }>>;
    update(code: string, body: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        name: string;
        code: string;
        active: boolean;
        imageUrl: string | null;
        themePrimary: string | null;
        themeAccent: string | null;
    }>>;
    delete(code: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        code: string;
    }>>;
    addGame(code: string, body: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        gameId: string;
        sponsorCode: string;
        prizeAmount: number;
    }>>;
}
