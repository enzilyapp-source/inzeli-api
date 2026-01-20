import { DewanyahService } from './dewanyah.service';
export declare class AdminDewanyahController {
    private readonly dewanyah;
    constructor(dewanyah: DewanyahService);
    listAll(): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<({
        _count: {
            members: number;
        };
        games: {
            gameId: string;
        }[];
    } & {
        id: string;
        name: string;
        status: string;
        createdAt: Date;
        radiusMeters: number | null;
        updatedAt: Date;
        imageUrl: string | null;
        themePrimary: string | null;
        themeAccent: string | null;
        note: string | null;
        requireApproval: boolean;
        locationLock: boolean;
        ownerUserId: string;
        ownerEmail: string | null;
        ownerName: string | null;
    })[]>>;
    listRequests(): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        ownerEmail: string;
        owner: string;
        user: {
            id: string;
            email: string;
            displayName: string;
        };
        id: string;
        name: string;
        gameId: string | null;
        status: string;
        createdAt: Date;
        radiusMeters: number | null;
        userId: string;
        contact: string;
        note: string | null;
        requireApproval: boolean;
        locationLock: boolean;
        reviewedAt: Date | null;
    }[]>>;
    approve(req: any, id: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        id: string;
        name: string;
        gameId: string | null;
        status: string;
        createdAt: Date;
        radiusMeters: number | null;
        userId: string;
        contact: string;
        note: string | null;
        requireApproval: boolean;
        locationLock: boolean;
        reviewedAt: Date | null;
    } | {
        id: string;
        name: string;
        status: string;
        createdAt: Date;
        radiusMeters: number | null;
        updatedAt: Date;
        imageUrl: string | null;
        themePrimary: string | null;
        themeAccent: string | null;
        note: string | null;
        requireApproval: boolean;
        locationLock: boolean;
        ownerUserId: string;
        ownerEmail: string | null;
        ownerName: string | null;
    }>>;
    addGame(id: string, body: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        id: string;
        gameId: string;
        createdAt: Date;
        dewanyahId: string;
    }>>;
    createDirect(body: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        id: string;
        name: string;
        status: string;
        createdAt: Date;
        radiusMeters: number | null;
        updatedAt: Date;
        imageUrl: string | null;
        themePrimary: string | null;
        themeAccent: string | null;
        note: string | null;
        requireApproval: boolean;
        locationLock: boolean;
        ownerUserId: string;
        ownerEmail: string | null;
        ownerName: string | null;
    }>>;
    update(id: string, body: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        id: string;
        name: string;
        status: string;
        createdAt: Date;
        radiusMeters: number | null;
        updatedAt: Date;
        imageUrl: string | null;
        themePrimary: string | null;
        themeAccent: string | null;
        note: string | null;
        requireApproval: boolean;
        locationLock: boolean;
        ownerUserId: string;
        ownerEmail: string | null;
        ownerName: string | null;
    }>>;
    delete(id: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        id: string;
    }>>;
}
