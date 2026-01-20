import { PrismaService } from '../prisma.service';
export declare class TimelineController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(req: any, limit?: string, gameId?: string): Promise<import("../common/api").ApiErr | import("../common/api").ApiOk<{
        id: string;
        userId: string | null;
        roomCode: string | null;
        gameId: string | null;
        kind: string;
        meta: import("@prisma/client/runtime/library").JsonValue;
        ts: Date;
    }[]>>;
}
