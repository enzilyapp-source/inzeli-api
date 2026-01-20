import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
export type TxLike = PrismaService | Prisma.TransactionClient;
export declare function ensureAllGameWallets(tx: TxLike, userId: string): Promise<Record<string, number>>;
export declare function getGamePearls(tx: TxLike, userId: string, gameId: string): Promise<number>;
export declare function getPearls(tx: TxLike, userId: string): Promise<number>;
export declare function incGamePearls(tx: TxLike, userId: string, gameId: string, amount?: number): Promise<void>;
export declare function decGamePearls(tx: TxLike, userId: string, gameId: string, amount?: number): Promise<void>;
export declare function takeGamePearlsOrZero(tx: TxLike, userId: string, gameId: string, amount?: number): Promise<{
    charged: number;
    remaining: number;
}>;
export declare function getSponsorPearls(tx: TxLike, userId: string, sponsorCode: string, gameId: string): Promise<number>;
export declare function incSponsorPearls(tx: TxLike, userId: string, sponsorCode: string, gameId: string, amount?: number): Promise<void>;
export declare function decSponsorPearls(tx: TxLike, userId: string, sponsorCode: string, gameId: string, amount?: number): Promise<void>;
