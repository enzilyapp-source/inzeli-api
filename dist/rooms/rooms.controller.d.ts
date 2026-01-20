import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
export declare class RoomsController {
    private readonly rooms;
    constructor(rooms: RoomsService);
    create(req: any, dto: CreateRoomDto): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
            team: import(".prisma/client").$Enums.TeamSide | null;
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
    }>>;
    get(code: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
            team: import(".prisma/client").$Enums.TeamSide | null;
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
    }>>;
    join(req: any, dto: JoinRoomDto): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
            team: import(".prisma/client").$Enums.TeamSide | null;
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
    }>>;
    start(req: any, code: string, body: {
        targetWinPoints?: number;
        allowZeroCredit?: boolean;
        timerSec?: number;
    }): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
            team: import(".prisma/client").$Enums.TeamSide | null;
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
    }>>;
    setStake(req: any, code: string, body: {
        amount: number;
    }): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
            team: import(".prisma/client").$Enums.TeamSide | null;
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
    }>>;
    setTeam(req: any, code: string, body: {
        playerUserId: string;
        team: 'A' | 'B';
    }): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
            team: import(".prisma/client").$Enums.TeamSide | null;
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
    }>>;
    setLeader(req: any, code: string, body: {
        team: 'A' | 'B';
        leaderUserId: string;
    }): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
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
            team: import(".prisma/client").$Enums.TeamSide | null;
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
    }>>;
}
