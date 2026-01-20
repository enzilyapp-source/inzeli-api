import { PrismaService } from '../prisma.service';
export declare class DewanyahService {
    private prisma;
    constructor(prisma: PrismaService);
    createRequest(params: {
        userId: string;
        name: string;
        contact: string;
        gameId?: string;
        note?: string;
        requireApproval?: boolean;
        locationLock?: boolean;
        radiusMeters?: number;
    }): Promise<{
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
    }>;
    listRequests(): Promise<{
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
    }[]>;
    listDewanyahs(): Promise<({
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
    })[]>;
    listAllAdmin(): Promise<({
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
    })[]>;
    approveRequest(requestId: string, adminUserId?: string): Promise<{
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
    }>;
    updateDewanyah(id: string, data: {
        name?: string;
        ownerName?: string;
        ownerEmail?: string;
        note?: string;
        imageUrl?: string;
        themePrimary?: string;
        themeAccent?: string;
    }): Promise<{
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
    }>;
    deleteDewanyah(id: string): Promise<{
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
    }>;
    getOwnerDewanyah(dewanyahId: string, ownerUserId: string): Promise<{
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
    }>;
    addGameToDewanyah(dewanyahId: string, gameId: string): Promise<{
        id: string;
        gameId: string;
        createdAt: Date;
        dewanyahId: string;
    }>;
    requestJoin(dewanyahId: string, userId: string): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        userId: string;
        dewanyahId: string;
        approvedAt: Date | null;
    }>;
    setMemberStatus(dewanyahId: string, userId: string, status: string): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        userId: string;
        dewanyahId: string;
        approvedAt: Date | null;
    }>;
    listMembersForOwner(dewanyahId: string, ownerUserId: string): Promise<({
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
    })[]>;
    leaderboard(dewanyahId: string, limit?: number): Promise<{
        userId: string;
        displayName: string;
        email: string;
        pearls: number;
        status: string;
        joinedAt: Date;
    }[]>;
    createDewanyahManual(data: {
        name: string;
        ownerName?: string;
        ownerEmail?: string;
        ownerUserId?: string;
        note?: string;
        gameId: string;
        requireApproval?: boolean;
        locationLock?: boolean;
        radiusMeters?: number;
        imageUrl?: string;
        themePrimary?: string;
        themeAccent?: string;
    }): Promise<{
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
    }>;
}
