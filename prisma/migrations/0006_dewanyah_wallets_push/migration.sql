ALTER TABLE "Room"
ADD COLUMN IF NOT EXISTS "dewanyahId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Room_dewanyahId_fkey'
  ) THEN
    ALTER TABLE "Room"
    ADD CONSTRAINT "Room_dewanyahId_fkey"
    FOREIGN KEY ("dewanyahId") REFERENCES "Dewanyah"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Room_dewanyahId_idx" ON "Room"("dewanyahId");

CREATE TABLE IF NOT EXISTS "DewanyahGameWallet" (
  "userId" TEXT NOT NULL,
  "dewanyahId" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "pearls" INTEGER NOT NULL DEFAULT 5,
  "seasonYm" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DewanyahGameWallet_pkey" PRIMARY KEY ("userId","dewanyahId","gameId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DewanyahGameWallet_userId_fkey'
  ) THEN
    ALTER TABLE "DewanyahGameWallet"
    ADD CONSTRAINT "DewanyahGameWallet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DewanyahGameWallet_dewanyahId_fkey'
  ) THEN
    ALTER TABLE "DewanyahGameWallet"
    ADD CONSTRAINT "DewanyahGameWallet_dewanyahId_fkey"
    FOREIGN KEY ("dewanyahId") REFERENCES "Dewanyah"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DewanyahGameWallet_gameId_fkey'
  ) THEN
    ALTER TABLE "DewanyahGameWallet"
    ADD CONSTRAINT "DewanyahGameWallet_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES "Game"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DewanyahGameWallet_dewanyahId_gameId_idx"
ON "DewanyahGameWallet"("dewanyahId","gameId");

CREATE INDEX IF NOT EXISTS "DewanyahGameWallet_userId_idx"
ON "DewanyahGameWallet"("userId");
