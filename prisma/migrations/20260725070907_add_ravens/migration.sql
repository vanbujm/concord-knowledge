-- CreateTable
CREATE TABLE "WindsAnnouncement" (
    "id" TEXT NOT NULL,
    "windsPageId" INTEGER NOT NULL,
    "windsTitle" TEXT NOT NULL,
    "entryTitle" TEXT NOT NULL,
    "season" TEXT,
    "persona" TEXT,
    "matchedScopes" TEXT[],
    "matchedKeywords" TEXT[],
    "announcedAt" TIMESTAMP(3),
    "discordMessageId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WindsAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interest" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WindsAnnouncement_windsPageId_idx" ON "WindsAnnouncement"("windsPageId");

-- CreateIndex
CREATE UNIQUE INDEX "WindsAnnouncement_windsPageId_entryTitle_key" ON "WindsAnnouncement"("windsPageId", "entryTitle");

-- CreateIndex
CREATE INDEX "Interest_guildId_idx" ON "Interest"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Interest_guildId_scope_keyword_key" ON "Interest"("guildId", "scope", "keyword");
