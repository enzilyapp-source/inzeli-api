import { StoreService } from './store.service';
export declare class StoreController {
    private readonly store;
    constructor(store: StoreService);
    list(): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        id: string;
        name: string;
        kind: import(".prisma/client").$Enums.StoreKind;
        active: boolean;
        price: number;
        description: string | null;
        preview: string | null;
    }[]>>;
    myItems(req: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<({
        item: {
            id: string;
            name: string;
            kind: import(".prisma/client").$Enums.StoreKind;
            active: boolean;
            price: number;
            description: string | null;
            preview: string | null;
        };
    } & {
        userId: string;
        itemId: string;
        ownedAt: Date;
    })[]>>;
    buy(req: any, id: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        alreadyOwned: boolean;
        balance: number;
        itemId?: undefined;
    } | {
        itemId: string;
        balance: number;
        alreadyOwned?: undefined;
    }>>;
    apply(req: any, body: {
        themeId?: string | null;
        frameId?: string | null;
        cardId?: string | null;
    }): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        id: string;
        creditBalance: number;
        themeId: string | null;
        frameId: string | null;
        cardId: string | null;
    }>>;
}
