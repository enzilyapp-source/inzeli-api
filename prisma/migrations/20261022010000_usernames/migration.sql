-- Additive only: existing account IDs, sessions, rooms and names stay untouched.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
ALTER TABLE "User" ADD CONSTRAINT "User_username_format" CHECK (
  "username" IS NULL OR "username" ~ '^[a-z][a-z0-9_]{2,19}$'
) NOT VALID;
ALTER TABLE "User" VALIDATE CONSTRAINT "User_username_format";
COMMIT;
