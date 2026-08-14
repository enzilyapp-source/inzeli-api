ALTER TABLE "Sponsor"
ADD COLUMN IF NOT EXISTS "anchorLat" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "anchorLng" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "locationLock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "radiusMeters" INTEGER;

CREATE TABLE IF NOT EXISTS "MonthlyLeaderboardSnapshot" (
  "id" TEXT NOT NULL,
  "scope" "BadgeScope" NOT NULL,
  "seasonYm" INTEGER NOT NULL,
  "sponsorCode" TEXT,
  "sponsorName" TEXT,
  "dewanyahId" TEXT,
  "dewanyahName" TEXT,
  "gameId" TEXT NOT NULL,
  "leaderUserId" TEXT,
  "leaderName" TEXT,
  "leaderEmail" TEXT,
  "pearls" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "playedCount" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyLeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MonthlyLeaderboardSnapshot_seasonYm_idx"
  ON "MonthlyLeaderboardSnapshot"("seasonYm");

CREATE INDEX IF NOT EXISTS "MonthlyLeaderboardSnapshot_scope_sponsorCode_idx"
  ON "MonthlyLeaderboardSnapshot"("scope", "sponsorCode");

CREATE INDEX IF NOT EXISTS "MonthlyLeaderboardSnapshot_scope_dewanyahId_idx"
  ON "MonthlyLeaderboardSnapshot"("scope", "dewanyahId");

CREATE INDEX IF NOT EXISTS "MonthlyLeaderboardSnapshot_scope_gameId_idx"
  ON "MonthlyLeaderboardSnapshot"("scope", "gameId");
