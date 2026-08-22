-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('NONE', 'REGISTERED', 'PLAYER');

-- CreateEnum
CREATE TYPE "EventPhase" AS ENUM ('DECK_COLLECTION', 'RUNNING', 'FINISHED');

-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('UNRESTRICTED', 'DUEL', 'CONQUEST');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('PENDING', 'FINISHED');

-- CreateEnum
CREATE TYPE "GameEndReason" AS ENUM ('NORMAL', 'ENGINE_ERROR', 'SURRENDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "MatchDeckDisableReason" AS ENUM ('DUEL_USED', 'CONQUEST_WINNER_USED', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuthChallengeKind" AS ENUM ('REGISTRATION', 'AUTHENTICATION');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "qq" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chessboardColor" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "competitionStatus" "CompetitionStatus" NOT NULL DEFAULT 'NONE',
    "appliedAt" TIMESTAMP(3),
    "activeMatchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL,
    "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "kind" "AuthChallengeKind" NOT NULL,
    "qq" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "payload" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "cutoffAt" TIMESTAMP(3),
    "limit" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deck" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requiredVersion" INTEGER NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "clientImportKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEvent" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phase" "EventPhase" NOT NULL DEFAULT 'DECK_COLLECTION',
    "deckLimit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "mode" "MatchMode" NOT NULL DEFAULT 'UNRESTRICTED',
    "roomConfig" JSONB NOT NULL,
    "maxGames" INTEGER NOT NULL,
    "winsRequired" INTEGER NOT NULL,
    "winnerUserId" INTEGER,
    "autoCreateGame" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "matchId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "who" INTEGER NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("matchId","userId")
);

-- CreateTable
CREATE TABLE "MatchDeck" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "sourceDeckId" INTEGER,
    "name" TEXT NOT NULL,
    "deckJson" JSONB NOT NULL,
    "code" TEXT NOT NULL,
    "requiredVersion" INTEGER NOT NULL,
    "characterKey" TEXT NOT NULL,
    "usable" BOOLEAN NOT NULL DEFAULT true,
    "disableReason" "MatchDeckDisableReason",
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER,
    "status" "GameStatus" NOT NULL DEFAULT 'PENDING',
    "coreVersion" TEXT NOT NULL,
    "gameVersion" TEXT NOT NULL,
    "stateLog" JSONB,
    "winnerWho" INTEGER,
    "manualWinnerWho" INTEGER,
    "endReason" "GameEndReason",
    "countForStats" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlayer" (
    "gameId" INTEGER NOT NULL,
    "who" INTEGER NOT NULL,
    "userId" INTEGER,
    "deckId" INTEGER,
    "matchDeckId" INTEGER,
    "deckName" TEXT,
    "deckJson" JSONB,
    "characterKey" TEXT,

    CONSTRAINT "GamePlayer_pkey" PRIMARY KEY ("gameId","who")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_qq_key" ON "User"("qq");

-- CreateIndex
CREATE INDEX "User_activeMatchId_idx" ON "User"("activeMatchId");

-- CreateIndex
CREATE INDEX "User_competitionStatus_appliedAt_idx" ON "User"("competitionStatus", "appliedAt");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE INDEX "AuthChallenge_qq_kind_expiresAt_idx" ON "AuthChallenge"("qq", "kind", "expiresAt");

-- CreateIndex
CREATE INDEX "Deck_ownerUserId_updatedAt_idx" ON "Deck"("ownerUserId", "updatedAt");

CREATE UNIQUE INDEX "Deck_ownerUserId_clientImportKey_key" ON "Deck"("ownerUserId", "clientImportKey");

-- CreateIndex
CREATE INDEX "TournamentEvent_phase_idx" ON "TournamentEvent"("phase");

-- CreateIndex
CREATE INDEX "TournamentMatch_eventId_idx" ON "TournamentMatch"("eventId");

-- CreateIndex
CREATE INDEX "TournamentMatch_winnerUserId_idx" ON "TournamentMatch"("winnerUserId");

-- CreateIndex
CREATE INDEX "MatchParticipant_userId_idx" ON "MatchParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_who_key" ON "MatchParticipant"("matchId", "who");

-- CreateIndex
CREATE INDEX "MatchDeck_matchId_userId_usable_idx" ON "MatchDeck"("matchId", "userId", "usable");

-- CreateIndex
CREATE UNIQUE INDEX "MatchDeck_matchId_userId_characterKey_key" ON "MatchDeck"("matchId", "userId", "characterKey");

-- CreateIndex
CREATE UNIQUE INDEX "MatchDeck_matchId_userId_sourceDeckId_key" ON "MatchDeck"("matchId", "userId", "sourceDeckId");

-- CreateIndex
CREATE INDEX "Game_matchId_status_idx" ON "Game"("matchId", "status");

-- CreateIndex
CREATE INDEX "Game_status_countForStats_idx" ON "Game"("status", "countForStats");

-- CreateIndex
CREATE INDEX "GamePlayer_userId_idx" ON "GamePlayer"("userId");

-- CreateIndex
CREATE INDEX "GamePlayer_deckId_idx" ON "GamePlayer"("deckId");

-- CreateIndex
CREATE INDEX "GamePlayer_matchDeckId_idx" ON "GamePlayer"("matchDeckId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeMatchId_fkey" FOREIGN KEY ("activeMatchId") REFERENCES "TournamentMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TournamentEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDeck" ADD CONSTRAINT "MatchDeck_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDeck" ADD CONSTRAINT "MatchDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDeck" ADD CONSTRAINT "MatchDeck_sourceDeckId_fkey" FOREIGN KEY ("sourceDeckId") REFERENCES "Deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_matchDeckId_fkey" FOREIGN KEY ("matchDeckId") REFERENCES "MatchDeck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cross-field and enum-adjacent invariants Prisma cannot express.
ALTER TABLE "RegistrationSetting" ADD CONSTRAINT "RegistrationSetting_singleton_check" CHECK ("id" = 1);
ALTER TABLE "RegistrationSetting" ADD CONSTRAINT "RegistrationSetting_limit_check" CHECK ("limit" >= 0);
ALTER TABLE "TournamentEvent" ADD CONSTRAINT "TournamentEvent_deckLimit_check" CHECK ("deckLimit" >= 0);
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_games_check" CHECK ("maxGames" >= "winsRequired" AND "winsRequired" >= 1);
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_who_check" CHECK ("who" IN (0, 1));
ALTER TABLE "Game" ADD CONSTRAINT "Game_winnerWho_check" CHECK ("winnerWho" IS NULL OR "winnerWho" IN (0, 1));
ALTER TABLE "Game" ADD CONSTRAINT "Game_manualWinnerWho_check" CHECK ("manualWinnerWho" IS NULL OR "manualWinnerWho" IN (0, 1));
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_who_check" CHECK ("who" IN (0, 1));

-- A match has at most one open game. It also serializes automatic and manual
-- scheduling in addition to the transaction-level advisory lock in code.
CREATE UNIQUE INDEX "Game_one_pending_per_match_key"
  ON "Game" ("matchId")
  WHERE "matchId" IS NOT NULL AND "status" = 'PENDING';
