-- Add phone verification support and OTP challenge storage
ALTER TABLE "User"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "isTestAccount" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

CREATE TABLE "AuthOtpChallenge" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "usedAt" TIMESTAMP(3),
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthOtpChallenge_phone_purpose_createdAt_idx"
  ON "AuthOtpChallenge"("phone", "purpose", "createdAt");

CREATE INDEX "AuthOtpChallenge_expiresAt_idx"
  ON "AuthOtpChallenge"("expiresAt");
