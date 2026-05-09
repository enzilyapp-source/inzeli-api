CREATE TABLE "AuthOtpDelivery" (
  "id" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "messageSid" TEXT,
  "channel" TEXT NOT NULL,
  "status" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "fallbackSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthOtpDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthOtpDelivery_messageSid_key"
  ON "AuthOtpDelivery"("messageSid");

CREATE INDEX "AuthOtpDelivery_challengeId_idx"
  ON "AuthOtpDelivery"("challengeId");

CREATE INDEX "AuthOtpDelivery_messageSid_idx"
  ON "AuthOtpDelivery"("messageSid");

CREATE INDEX "AuthOtpDelivery_channel_status_idx"
  ON "AuthOtpDelivery"("channel", "status");

ALTER TABLE "AuthOtpDelivery"
  ADD CONSTRAINT "AuthOtpDelivery_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "AuthOtpChallenge"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
