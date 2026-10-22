BEGIN;
-- Additive migration: preserves existing games, accounts and match history.
CREATE TABLE "AppSettings" (
 "id" TEXT NOT NULL DEFAULT 'main',
 "maintenanceEnabled" BOOLEAN NOT NULL DEFAULT false,
 "maintenanceMessage" TEXT NOT NULL DEFAULT 'التطبيق تحت الصيانة، بنرجع لكم قريبًا',
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Game" ADD COLUMN "mainVisible" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "TimelineEvent_kind_createdAt_idx" ON "TimelineEvent"("kind", "createdAt");
CREATE INDEX "Match_createdAt_idx" ON "Match"("createdAt");

ALTER TABLE "TimelineEvent" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "TimelineEvent_dedupeKey_key" ON "TimelineEvent"("dedupeKey");
ALTER TABLE "MonthlyLeaderboardSnapshot" ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "VipPurchase" (
 "id" TEXT NOT NULL,
 "userId" TEXT,
 "isTestAccount" BOOLEAN NOT NULL DEFAULT false,
 "creditsCharged" INTEGER NOT NULL,
 "startsAt" TIMESTAMP(3) NOT NULL,
 "endsAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "VipPurchase_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "VipPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "VipPurchase_createdAt_idx" ON "VipPurchase"("createdAt");
CREATE INDEX "VipPurchase_userId_idx" ON "VipPurchase"("userId");

INSERT INTO "Game" ("id", "name", "category") VALUES
('كوت', 'كوت', 'جنجفة'),
('بلوت', 'بلوت', 'جنجفة'),
('تريكس', 'تريكس', 'جنجفة'),
('هند', 'هند', 'جنجفة'),
('سبيتة', 'سبيتة', 'جنجفة'),
('اونو', 'اونو', 'جنجفة'),
('دفان', 'دفان', 'جنجفة'),
('شطرنج', 'شطرنج', 'ألعاب شعبية'),
('دامه', 'دامه', 'ألعاب شعبية'),
('كيرم', 'كيرم', 'ألعاب شعبية'),
('دومنه', 'دومنه', 'ألعاب شعبية'),
('طاوله', 'طاوله', 'ألعاب شعبية'),
('جاكارو', 'جاكارو', 'ألعاب شعبية'),
('بلياردو', 'بلياردو', 'رياضة'),
('بيبيفوت', 'بيبيفوت', 'رياضة'),
('قدم', 'قدم', 'رياضة'),
('سله', 'سله', 'رياضة'),
('طائره', 'طائره', 'رياضة'),
('بولنج', 'بولنج', 'رياضة'),
('بادل', 'بادل', 'رياضة'),
('تنس طاولة', 'تنس طاولة', 'رياضة'),
('تنس ارضي', 'تنس ارضي', 'رياضة')
ON CONFLICT ("id") DO NOTHING;

COMMIT;
