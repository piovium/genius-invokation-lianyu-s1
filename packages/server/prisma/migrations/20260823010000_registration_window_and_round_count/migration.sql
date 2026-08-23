-- AlterTable
ALTER TABLE "RegistrationSetting" ADD COLUMN "opensAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Game"
ADD COLUMN "persistenceKey" TEXT,
ADD COLUMN "roundCount" INTEGER;

CREATE UNIQUE INDEX "Game_persistenceKey_key" ON "Game"("persistenceKey");

-- Registration is open only inside a well-ordered window when both bounds exist.
ALTER TABLE "RegistrationSetting"
ADD CONSTRAINT "RegistrationSetting_window_check"
CHECK ("opensAt" IS NULL OR "cutoffAt" IS NULL OR "opensAt" < "cutoffAt");

ALTER TABLE "Game"
ADD CONSTRAINT "Game_roundCount_check"
CHECK ("roundCount" IS NULL OR "roundCount" >= 0);
