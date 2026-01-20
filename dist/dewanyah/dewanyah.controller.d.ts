import { DewanyahService } from './dewanyah.service';
export declare class DewanyahController {
    private readonly dewanyah;
    constructor(dewanyah: DewanyahService);
    createRequest(req: any, body: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
    }>>;
    list(): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<({
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
    join(req: any, id: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        id: string;
        status: string;
        createdAt: Date;
        userId: string;
        dewanyahId: string;
        approvedAt: Date | null;
    }>>;
    leaderboard(id: string, limit?: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        userId: string;
        displayName: string;
        email: string;
        pearls: number;
        status: string;
        joinedAt: Date;
    }[]>>;
    members(req: any, id: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<({
        user: {
            id: string;
            email: string;
            displayName: string;
        };
    } & {
        id: string;
        status: string;
        createdAt: Date;
        userId: string;
        dewanyahId: string;
        approvedAt: Date | null;
    })[]>>;
    setMemberStatus(req: any, id: string, memberId: string, body: any): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        id: string;
        status: string;
        createdAt: Date;
        userId: string;
        dewanyahId: string;
        approvedAt: Date | null;
    }>>;
}
