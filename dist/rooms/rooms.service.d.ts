import { PrismaService } from '../prisma.service';
import { $Enums } from '@prisma/client';
export declare class RoomsService {
    private prisma;
    constructor(prisma: PrismaService);
    private newCode;
    private endsAt;
    private isLocked;
    private remaining;
    private buildTeamQuorum;
    createRoom(gameId: string, hostId: string, sponsorCode?: string, lat?: number, lng?: number, radiusMeters?: number): Promise<{
        locked: boolean;
        remainingSec: number;
        teamQuorum: {
            A: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
            B: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
        };
        players: ({
            user: {
                id: string;
                email: string;
                displayName: string;
                creditPoints: number;
                permanentScore: number;
                pearls: number;
            };
        } & {
            roomCode: string;
            userId: string;
            joinedAt: Date;
            team: $Enums.TeamSide | null;
            isLeader: boolean;
        })[];
        stakes: {
            roomCode: string;
            userId: string;
            amount: number;
            reservedAt: Date;
        }[];
        code: string;
        gameId: string;
        hostUserId: string;
        sponsorCode: string | null;
        status: string;
        createdAt: Date;
        targetWinPoints: number | null;
        allowZeroCredit: boolean;
        timerSec: number | null;
        startedAt: Date | null;
        hostLat: number | null;
        hostLng: number | null;
        radiusMeters: number | null;
    }>;
    getByCode(code: string): Promise<{
        locked: boolean;
        remainingSec: number;
        teamQuorum: {
            A: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
            B: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
        };
        players: ({
            user: {
                id: string;
                email: string;
                displayName: string;
                creditPoints: number;
                permanentScore: number;
                pearls: number;
            };
        } & {
            roomCode: string;
            userId: string;
            joinedAt: Date;
            team: $Enums.TeamSide | null;
            isLeader: boolean;
        })[];
        stakes: {
            roomCode: string;
            userId: string;
            amount: number;
            reservedAt: Date;
        }[];
        code: string;
        gameId: string;
        hostUserId: string;
        sponsorCode: string | null;
        status: string;
        createdAt: Date;
        targetWinPoints: number | null;
        allowZeroCredit: boolean;
        timerSec: number | null;
        startedAt: Date | null;
        hostLat: number | null;
        hostLng: number | null;
        radiusMeters: number | null;
    }>;
    join(code: string, userId: string, lat?: number, lng?: number): Promise<{
        locked: boolean;
        remainingSec: number;
        teamQuorum: {
            A: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
            B: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
        };
        players: ({
            user: {
                id: string;
                email: string;
                displayName: string;
                creditPoints: number;
                permanentScore: number;
                pearls: number;
            };
        } & {
            roomCode: string;
            userId: string;
            joinedAt: Date;
            team: $Enums.TeamSide | null;
            isLeader: boolean;
        })[];
        stakes: {
            roomCode: string;
            userId: string;
            amount: number;
            reservedAt: Date;
        }[];
        code: string;
        gameId: string;
        hostUserId: string;
        sponsorCode: string | null;
        status: string;
        createdAt: Date;
        targetWinPoints: number | null;
        allowZeroCredit: boolean;
        timerSec: number | null;
        startedAt: Date | null;
        hostLat: number | null;
        hostLng: number | null;
        radiusMeters: number | null;
    }>;
    start(code: string, hostId: string, params: {
        targetWinPoints?: number;
        allowZeroCredit?: boolean;
        timerSec?: number;
    }): Promise<{
        locked: boolean;
        remainingSec: number;
        teamQuorum: {
            A: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
            B: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
        };
        players: ({
            user: {
                id: string;
                email: string;
                displayName: string;
                permanentScore: number;
            };
        } & {
            roomCode: string;
            userId: string;
            joinedAt: Date;
            team: $Enums.TeamSide | null;
            isLeader: boolean;
        })[];
        stakes: {
            roomCode: string;
            userId: string;
            amount: number;
            reservedAt: Date;
        }[];
        code: string;
        gameId: string;
        hostUserId: string;
        sponsorCode: string | null;
        status: string;
        createdAt: Date;
        targetWinPoints: number | null;
        allowZeroCredit: boolean;
        timerSec: number | null;
        startedAt: Date | null;
        hostLat: number | null;
        hostLng: number | null;
        radiusMeters: number | null;
    }>;
    setStake(code: string, userId: string, amount: number): Promise<{
        locked: boolean;
        remainingSec: number;
        teamQuorum: {
            A: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
            B: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
        };
        players: ({
            user: {
                id: string;
                email: string;
                displayName: string;
                creditPoints: number;
                permanentScore: number;
                pearls: number;
            };
        } & {
            roomCode: string;
            userId: string;
            joinedAt: Date;
            team: $Enums.TeamSide | null;
            isLeader: boolean;
        })[];
        stakes: {
            roomCode: string;
            userId: string;
            amount: number;
            reservedAt: Date;
        }[];
        code: string;
        gameId: string;
        hostUserId: string;
        sponsorCode: string | null;
        status: string;
        createdAt: Date;
        targetWinPoints: number | null;
        allowZeroCredit: boolean;
        timerSec: number | null;
        startedAt: Date | null;
        hostLat: number | null;
        hostLng: number | null;
        radiusMeters: number | null;
    }>;
    setPlayerTeam(code: string, actorUserId: string, playerUserId: string, team: $Enums.TeamSide): Promise<{
        locked: boolean;
        remainingSec: number;
        teamQuorum: {
            A: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
            B: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
        };
        players: ({
            user: {
                id: string;
                email: string;
                displayName: string;
                creditPoints: number;
                permanentScore: number;
                pearls: number;
            };
        } & {
            roomCode: string;
            userId: string;
            joinedAt: Date;
            team: $Enums.TeamSide | null;
            isLeader: boolean;
        })[];
        stakes: {
            roomCode: string;
            userId: string;
            amount: number;
            reservedAt: Date;
        }[];
        code: string;
        gameId: string;
        hostUserId: string;
        sponsorCode: string | null;
        status: string;
        createdAt: Date;
        targetWinPoints: number | null;
        allowZeroCredit: boolean;
        timerSec: number | null;
        startedAt: Date | null;
        hostLat: number | null;
        hostLng: number | null;
        radiusMeters: number | null;
    }>;
    setTeamLeader(code: string, actorUserId: string, team: $Enums.TeamSide, leaderUserId: string): Promise<{
        locked: boolean;
        remainingSec: number;
        teamQuorum: {
            A: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
            B: {
                required: number;
                available: number;
                quorumMet: boolean;
            };
        };
        players: ({
            user: {
                id: string;
                email: string;
                displayName: string;
                creditPoints: number;
                permanentScore: number;
                pearls: number;
            };
        } & {
            roomCode: string;
            userId: string;
            joinedAt: Date;
            team: $Enums.TeamSide | null;
            isLeader: boolean;
        })[];
        stakes: {
            roomCode: string;
            userId: string;
            amount: number;
            reservedAt: Date;
        }[];
        code: string;
        gameId: string;
        hostUserId: string;
        sponsorCode: string | null;
        status: string;
        createdAt: Date;
        targetWinPoints: number | null;
        allowZeroCredit: boolean;
        timerSec: number | null;
        startedAt: Date | null;
        hostLat: number | null;
        hostLng: number | null;
        radiusMeters: number | null;
    }>;
}
