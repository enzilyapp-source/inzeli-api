import { PrismaService } from '../prisma.service';
export declare class StoreService {
    private prisma;
    constructor(prisma: PrismaService);
    list(): Promise<{
        id: string;
        name: string;
        kind: import(".prisma/client").$Enums.StoreKind;
        active: boolean;
        price: number;
        description: string | null;
        preview: string | null;
    }[]>;
    myItems(userId: string): Promise<({
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
    })[]>;
    buy(userId: string, itemId: string): Promise<{
        alreadyOwned: boolean;
        balance: number;
        itemId?: undefined;
    } | {
        itemId: string;
        balance: number;
        alreadyOwned?: undefined;
    }>;
    apply(userId: string, data: {
        themeId?: string | null;
        frameId?: string | null;
        cardId?: string | null;
    }): Promise<{
        id: string;
        creditBalance: number;
        themeId: string | null;
        frameId: string | null;
        cardId: string | null;
    }>;
    balance(userId: string): Promise<number>;
}
