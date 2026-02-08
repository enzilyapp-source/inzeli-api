// src/matches/matches.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma, Outcome } from '@prisma/client';
import {
  incGamePearls,
  incSponsorPearls,
  getGamePearls,
  getSponsorPearls,
  decGamePearls,
  decSponsorPearls,
} from '../common/pearls';

@Injectable()
export class MatchesService {
  constructor(private prisma: PrismaService) {}

  async createMatch(input: { roomCode?: string; gameId: string; winners: string[]; losers: string[] }) {
    const { roomCode, gameId } = input;
    const winners = input.winners ?? [];
    const losers = input.losers ?? [];
    const now = Date.now();

    if (winners.length === 0 && losers.length === 0) {
      throw new BadRequestException('EMPTY_MATCH');
    }

    let room:
      | (Prisma.RoomGetPayload<{ include: { players: { select: { userId: true; team: true } } } }>)
      | null = null;

    if (roomCode) {
      room = await this.prisma.room.findUnique({
        where: { code: roomCode },
        include: { players: { select: { userId: true, team: true } } },
      });
      if (!room) throw new NotFoundException('ROOM_NOT_FOUND');

      // ✅ enforce server-side timer: must be started and finished
      if (room.status !== 'running' || !room.startedAt) {
        throw new BadRequestException('ROOM_NOT_STARTED');
      }
      // السماح بحسم النتيجة مباشرة (بدون انتظار العداد)
      // لو احتجنا تفعيل الانتظار لاحقاً، نعيد الشرط التالي:
      // const endAt = room.timerSec ? room.startedAt.getTime() + room.timerSec * 1000 : null;
      // if (endAt && now < endAt) throw new BadRequestException('TIMER_NOT_FINISHED');
    }

    // ✅ sponsorCode لو موجود في الروم
    const sponsorCode: string | null = (room as any)?.sponsorCode ?? null;

    // إنشاء match
    const match = await this.prisma.match.create({
      data: {
        roomCode: roomCode ?? null,
        gameId,
        sponsorCode,
        parts: {
          create: [
            ...winners.map((uid) => ({ userId: uid, outcome: 'WIN' as Outcome })),
            ...losers.map((uid) => ({ userId: uid, outcome: 'LOSS' as Outcome })),
          ],
        },
      },
      include: { parts: true },
    });

    // تسوية اللؤلؤ والنقاط
    await this.prisma.$transaction(async (tx) => {
      // permanentScore
      if (winners.length) {
        await tx.user.updateMany({
          where: { id: { in: winners } },
          data: { permanentScore: { increment: 1 } },
        });
      }
      if (losers.length) {
        await tx.user.updateMany({
          where: { id: { in: losers } },
          data: { permanentScore: { decrement: 1 } },
        });
      }

      if (roomCode) {
        const latestRoom =
          room ?? (await tx.room.findUnique({ where: { code: roomCode } }));

        const sc: string | null = sponsorCode;
        const game = latestRoom!.gameId;

        // خصم 1 لؤلؤة من كل خاسر (إذا عنده)، وجمعها
        let pot = 0;
        for (const lo of losers) {
          try {
            if (sc) {
              const cur = await getSponsorPearls(tx, lo, sc, game);
              if (cur > 0) {
                await decSponsorPearls(tx, lo, sc, game, 1);
                pot += 1;
              }
            } else {
              const cur = await getGamePearls(tx, lo, game);
              if (cur > 0) {
                await decGamePearls(tx, lo, game, 1);
                pot += 1;
              }
            }
          } catch (_) {
            // إذا ما عنده رصيد، تجاهل
          }
        }

        // وزّع الـ pot على الفائزين بالتساوي (باقي الزيادة لأول فائز)
        if (pot > 0 && winners.length > 0) {
          const per = Math.floor(pot / winners.length);
          const rem = pot % winners.length;
          for (let i = 0; i < winners.length; i++) {
            const inc = per + (i === 0 ? rem : 0);
            if (inc > 0) {
              if (sc) await incSponsorPearls(tx, winners[i], sc, game, inc);
              else await incGamePearls(tx, winners[i], game, inc);
            }
          }
        }
      }

      // سجل حدث عام
      await tx.timelineEvent.create({
        data: {
          kind: 'MATCH_FINISHED',
          roomCode: roomCode ?? null,
          gameId,
          meta: {
            winners,
            losers,
            pearlsPot: true,
            refundedWinnerStake: false,
            distributedLoserStake: true,
          },
        },
      });

      // سجل أحداث فردية لكل فائز/خاسر ليظهر في تايملاينهم
      if (winners.length) {
        await tx.timelineEvent.createMany({
          data: winners.map((u) => ({
            userId: u,
            gameId,
            roomCode: roomCode ?? null,
            kind: 'MATCH_WIN',
            meta: { winners, losers },
          })),
        });
      }
      if (losers.length) {
        await tx.timelineEvent.createMany({
          data: losers.map((u) => ({
            userId: u,
            gameId,
            roomCode: roomCode ?? null,
            kind: 'MATCH_LOSS',
            meta: { winners, losers },
          })),
        });
      }

      // أغلق الروم بعد حسم المباراة
      if (roomCode) {
        await tx.room.update({
          where: { code: roomCode },
          data: {
            status: 'finished',
            timerSec: null,
            startedAt: null,
          },
        });

        await tx.timelineEvent.create({
          data: {
            kind: 'ROOM_FINISHED',
            roomCode,
            gameId,
            meta: { winners, losers },
          },
        });
      }
    });

    return match;
  }
}
