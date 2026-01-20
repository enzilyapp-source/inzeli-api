-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditPoints" INTEGER NOT NULL DEFAULT 5,
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "permanentScore" INTEGER NOT NULL DEFAULT 0,
    "pearls" INTEGER NOT NULL DEFAULT 5,
    "pearlsSeasonYm" INTEGER,
    "themeId" TEXT,
    "frameId" TEXT,
    "cardId" TEXT
);

-- CreateTable
CREATE TABLE "StoreItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "description" TEXT,
    "preview" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "UserItem" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ownedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "itemId"),
    CONSTRAINT "UserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Room" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "sponsorCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetWinPoints" INTEGER,
    "allowZeroCredit" BOOLEAN NOT NULL DEFAULT false,
    "timerSec" INTEGER,
    "startedAt" DATETIME,
    CONSTRAINT "Room_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Room_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Room_sponsorCode_fkey" FOREIGN KEY ("sponsorCode") REFERENCES "Sponsor" ("code") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoomPlayer" (
    "roomCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "team" TEXT DEFAULT 'A',
    "isLeader" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("roomCode", "userId"),
    CONSTRAINT "RoomPlayer_roomCode_fkey" FOREIGN KEY ("roomCode") REFERENCES "Room" ("code") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoomStake" (
    "roomCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("roomCode", "userId"),
    CONSTRAINT "RoomStake_roomCode_fkey" FOREIGN KEY ("roomCode") REFERENCES "Room" ("code") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomStake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "themePrimary" TEXT,
    "themeAccent" TEXT
);

-- CreateTable
CREATE TABLE "UserSponsor" (
    "userId" TEXT NOT NULL,
    "sponsorCode" TEXT NOT NULL,
    "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "sponsorCode"),
    CONSTRAINT "UserSponsor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSponsor_sponsorCode_fkey" FOREIGN KEY ("sponsorCode") REFERENCES "Sponsor" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomCode" TEXT,
    "gameId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sponsorCode" TEXT,
    CONSTRAINT "Match_sponsorCode_fkey" FOREIGN KEY ("sponsorCode") REFERENCES "Sponsor" ("code") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_roomCode_fkey" FOREIGN KEY ("roomCode") REFERENCES "Room" ("code") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,

    PRIMARY KEY ("matchId", "userId"),
    CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "roomCode" TEXT,
    "gameId" TEXT,
    "kind" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_roomCode_fkey" FOREIGN KEY ("roomCode") REFERENCES "Room" ("code") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SponsorGame" (
    "sponsorCode" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "prizeAmount" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("sponsorCode", "gameId"),
    CONSTRAINT "SponsorGame_sponsorCode_fkey" FOREIGN KEY ("sponsorCode") REFERENCES "Sponsor" ("code") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SponsorGameWallet" (
    "userId" TEXT NOT NULL,
    "sponsorCode" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "pearls" INTEGER NOT NULL DEFAULT 5,
    "seasonYm" INTEGER,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "sponsorCode", "gameId"),
    CONSTRAINT "SponsorGameWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorGameWallet_sponsorCode_fkey" FOREIGN KEY ("sponsorCode") REFERENCES "Sponsor" ("code") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorGameWallet_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserGameWallet" (
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "pearls" INTEGER NOT NULL DEFAULT 5,
    "seasonYm" INTEGER,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "gameId"),
    CONSTRAINT "UserGameWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserGameWallet_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserGameStat" (
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "gameId"),
    CONSTRAINT "UserGameStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserGameStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SponsorGameStat" (
    "sponsorCode" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("sponsorCode", "gameId", "userId"),
    CONSTRAINT "SponsorGameStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorGameStat_sponsorCode_fkey" FOREIGN KEY ("sponsorCode") REFERENCES "Sponsor" ("code") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorGameStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dewanyah" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "ownerName" TEXT,
    "imageUrl" TEXT,
    "themePrimary" TEXT,
    "themeAccent" TEXT,
    "note" TEXT,
    "locationLock" BOOLEAN NOT NULL DEFAULT false,
    "radiusMeters" INTEGER,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DewanyahGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dewanyahId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DewanyahGame_dewanyahId_fkey" FOREIGN KEY ("dewanyahId") REFERENCES "Dewanyah" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DewanyahGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DewanyahMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dewanyahId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    CONSTRAINT "DewanyahMember_dewanyahId_fkey" FOREIGN KEY ("dewanyahId") REFERENCES "Dewanyah" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DewanyahMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DewanyahRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "gameId" TEXT,
    "note" TEXT,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "locationLock" BOOLEAN NOT NULL DEFAULT false,
    "radiusMeters" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "DewanyahRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserItem_userId_idx" ON "UserItem"("userId");

-- CreateIndex
CREATE INDEX "SponsorGameWallet_sponsorCode_gameId_idx" ON "SponsorGameWallet"("sponsorCode", "gameId");

-- CreateIndex
CREATE INDEX "SponsorGameWallet_userId_idx" ON "SponsorGameWallet"("userId");

-- CreateIndex
CREATE INDEX "UserGameWallet_gameId_idx" ON "UserGameWallet"("gameId");

-- CreateIndex
CREATE INDEX "UserGameWallet_userId_idx" ON "UserGameWallet"("userId");

-- CreateIndex
CREATE INDEX "UserGameStat_gameId_idx" ON "UserGameStat"("gameId");

-- CreateIndex
CREATE INDEX "SponsorGameStat_sponsorCode_gameId_idx" ON "SponsorGameStat"("sponsorCode", "gameId");

-- CreateIndex
CREATE INDEX "SponsorGameStat_userId_idx" ON "SponsorGameStat"("userId");

-- CreateIndex
CREATE INDEX "DewanyahGame_dewanyahId_gameId_idx" ON "DewanyahGame"("dewanyahId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "DewanyahGame_dewanyahId_gameId_key" ON "DewanyahGame"("dewanyahId", "gameId");

-- CreateIndex
CREATE INDEX "DewanyahMember_userId_idx" ON "DewanyahMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DewanyahMember_dewanyahId_userId_key" ON "DewanyahMember"("dewanyahId", "userId");

-- CreateIndex
CREATE INDEX "DewanyahRequest_status_idx" ON "DewanyahRequest"("status");

-- CreateIndex
CREATE INDEX "DewanyahRequest_userId_idx" ON "DewanyahRequest"("userId");

