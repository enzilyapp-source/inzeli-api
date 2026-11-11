-- Additive only: existing rooms and match/pearl records are unchanged.
-- Abort quickly rather than hold up players if the Room table is busy.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS "RoomScoreSheet" (
    "roomCode" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomScoreSheet_pkey" PRIMARY KEY ("roomCode"),
    CONSTRAINT "RoomScoreSheet_roomCode_fkey" FOREIGN KEY ("roomCode") REFERENCES "Room"("code") ON DELETE CASCADE ON UPDATE CASCADE
);

COMMIT;
