ALTER TABLE "UserGameWallet"
ADD COLUMN IF NOT EXISTS "badgeScore" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS "badgeLossCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SponsorGameWallet"
ADD COLUMN IF NOT EXISTS "badgeScore" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS "badgeLossCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DewanyahGameWallet"
ADD COLUMN IF NOT EXISTS "badgeScore" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS "badgeLossCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "UserGameWallet"
SET "badgeScore" = "pearls"
WHERE "badgeScore" = 5 AND "pearls" <> 5;

UPDATE "SponsorGameWallet"
SET "badgeScore" = "pearls"
WHERE "badgeScore" = 5 AND "pearls" <> 5;

UPDATE "DewanyahGameWallet"
SET "badgeScore" = "pearls"
WHERE "badgeScore" = 5 AND "pearls" <> 5;
