-- Add host location + radius to Room for proximity checks
PRAGMA foreign_keys=OFF;
ALTER TABLE "Room" ADD COLUMN "hostLat" REAL;
ALTER TABLE "Room" ADD COLUMN "hostLng" REAL;
ALTER TABLE "Room" ADD COLUMN "radiusMeters" INTEGER DEFAULT 100;
PRAGMA foreign_keys=ON;
