-- Mythos v1: pantheons, deities, their domains, and multi-world affiliations.
CREATE TABLE "MythosPantheon" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "worldId" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'gm',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MythosPantheon_worldId_fkey" FOREIGN KEY ("worldId")
    REFERENCES "World" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MythosPantheon_worldId_name_idx" ON "MythosPantheon"("worldId","name");
CREATE INDEX "MythosPantheon_visibility_name_idx" ON "MythosPantheon"("visibility","name");

CREATE TABLE "MythosDeity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "epithet" TEXT NOT NULL DEFAULT '',
  "summary" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "symbol" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '#d6b77a',
  "rank" TEXT NOT NULL DEFAULT 'deity',
  "domains" TEXT NOT NULL DEFAULT '[]',
  "visibility" TEXT NOT NULL DEFAULT 'gm',
  "pantheonId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MythosDeity_pantheonId_fkey" FOREIGN KEY ("pantheonId")
    REFERENCES "MythosPantheon" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "MythosDeity_pantheonId_name_idx" ON "MythosDeity"("pantheonId","name");
CREATE INDEX "MythosDeity_visibility_name_idx" ON "MythosDeity"("visibility","name");

CREATE TABLE "MythosDeityWorld" (
  "deityId" TEXT NOT NULL,
  "worldId" TEXT NOT NULL,
  PRIMARY KEY ("deityId","worldId"),
  CONSTRAINT "MythosDeityWorld_deityId_fkey" FOREIGN KEY ("deityId")
    REFERENCES "MythosDeity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MythosDeityWorld_worldId_fkey" FOREIGN KEY ("worldId")
    REFERENCES "World" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MythosDeityWorld_worldId_deityId_idx" ON "MythosDeityWorld"("worldId","deityId");
