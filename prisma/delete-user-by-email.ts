import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emailArg = (process.argv[2] || '').trim().toLowerCase();
  if (!emailArg) {
    throw new Error('Usage: npm run delete:user -- <email>');
  }

  const user = await prisma.user.findUnique({
    where: { email: emailArg },
    select: { id: true, email: true, displayName: true },
  });

  if (!user) {
    console.log(`NOT_FOUND: ${emailArg}`);
    return;
  }

  const userId = user.id;
  console.log(`Deleting user ${user.email} (${user.displayName})...`);

  const counts: Record<string, number> = {};

  // Delete hosted rooms safely (and records that can block room deletion).
  const hostedRooms = await prisma.room.findMany({
    where: { hostUserId: userId },
    select: { code: true },
  });
  const hostedCodes = hostedRooms.map((r) => r.code);

  if (hostedCodes.length > 0) {
    counts.hostedRooms = hostedCodes.length;
    counts.matchesByHostedRooms = (
      await prisma.match.deleteMany({
        where: { roomCode: { in: hostedCodes } },
      })
    ).count;
    counts.timelineByHostedRooms = (
      await prisma.timelineEvent.deleteMany({
        where: { roomCode: { in: hostedCodes } },
      })
    ).count;
    counts.votesByHostedRooms = (
      await prisma.roomResultVote.deleteMany({
        where: { roomCode: { in: hostedCodes } },
      })
    ).count;
    counts.stakesByHostedRooms = (
      await prisma.roomStake.deleteMany({
        where: { roomCode: { in: hostedCodes } },
      })
    ).count;
    counts.playersByHostedRooms = (
      await prisma.roomPlayer.deleteMany({
        where: { roomCode: { in: hostedCodes } },
      })
    ).count;
    counts.roomsDeleted = (
      await prisma.room.deleteMany({
        where: { code: { in: hostedCodes } },
      })
    ).count;
  } else {
    counts.hostedRooms = 0;
  }

  // Same cleanup path used in users/me delete flow (plus explicit room votes).
  counts.dewanyah = (
    await prisma.dewanyah.deleteMany({ where: { ownerUserId: userId } })
  ).count;
  counts.dewanyahRequest = (
    await prisma.dewanyahRequest.deleteMany({ where: { userId } })
  ).count;
  counts.dewanyahMember = (
    await prisma.dewanyahMember.deleteMany({ where: { userId } })
  ).count;
  counts.roomPlayer = (await prisma.roomPlayer.deleteMany({ where: { userId } }))
    .count;
  counts.roomStake = (await prisma.roomStake.deleteMany({ where: { userId } }))
    .count;
  counts.roomResultVote = (
    await prisma.roomResultVote.deleteMany({ where: { userId } })
  ).count;
  counts.room = (await prisma.room.deleteMany({ where: { hostUserId: userId } }))
    .count;
  counts.matchParticipant = (
    await prisma.matchParticipant.deleteMany({ where: { userId } })
  ).count;
  counts.timelineEvent = (
    await prisma.timelineEvent.deleteMany({ where: { userId } })
  ).count;
  counts.userItem = (await prisma.userItem.deleteMany({ where: { userId } }))
    .count;
  counts.userSponsor = (await prisma.userSponsor.deleteMany({ where: { userId } }))
    .count;
  counts.userGameStat = (
    await prisma.userGameStat.deleteMany({ where: { userId } })
  ).count;
  counts.userGameWallet = (
    await prisma.userGameWallet.deleteMany({ where: { userId } })
  ).count;
  counts.sponsorGameWallet = (
    await prisma.sponsorGameWallet.deleteMany({ where: { userId } })
  ).count;
  counts.sponsorGameStat = (
    await prisma.sponsorGameStat.deleteMany({ where: { userId } })
  ).count;

  await prisma.user.delete({ where: { id: userId } });
  const result = counts;

  console.log('DELETED', JSON.stringify({ email: emailArg, ...result }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
