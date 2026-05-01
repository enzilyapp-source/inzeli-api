CREATE TYPE "BadgeScope" AS ENUM ('GENERAL', 'SPONSOR', 'DEWANYAH');

CREATE TABLE "UserBadge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "threshold" INTEGER NOT NULL,
  "scope" "BadgeScope" NOT NULL DEFAULT 'GENERAL',
  "contextKey" TEXT NOT NULL,
  "gameId" TEXT,
  "sponsorCode" TEXT,
  "dewanyahId" TEXT,
  "count" INTEGER NOT NULL DEFAULT 0,
  "firstEarnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastEarnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserBadgeAward" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "threshold" INTEGER NOT NULL,
  "scope" "BadgeScope" NOT NULL DEFAULT 'GENERAL',
  "contextKey" TEXT NOT NULL,
  "gameId" TEXT,
  "sponsorCode" TEXT,
  "dewanyahId" TEXT,
  "seasonYm" INTEGER NOT NULL,
  "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserBadgeAward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBadge_userId_scope_contextKey_label_key"
  ON "UserBadge"("userId", "scope", "contextKey", "label");

CREATE INDEX "UserBadge_userId_idx"
  ON "UserBadge"("userId");

CREATE INDEX "UserBadge_scope_contextKey_idx"
  ON "UserBadge"("scope", "contextKey");

CREATE UNIQUE INDEX "UserBadgeAward_userId_scope_contextKey_label_seasonYm_key"
  ON "UserBadgeAward"("userId", "scope", "contextKey", "label", "seasonYm");

CREATE INDEX "UserBadgeAward_userId_idx"
  ON "UserBadgeAward"("userId");

CREATE INDEX "UserBadgeAward_seasonYm_idx"
  ON "UserBadgeAward"("seasonYm");

CREATE INDEX "UserBadgeAward_scope_contextKey_idx"
  ON "UserBadgeAward"("scope", "contextKey");

ALTER TABLE "UserBadge"
  ADD CONSTRAINT "UserBadge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBadgeAward"
  ADD CONSTRAINT "UserBadgeAward_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
