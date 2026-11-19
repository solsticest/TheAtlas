-- Mythos v2: graph relations, primary domains, myths, beliefs, sacred geography,
-- Chronicle links and a separate editable cosmology graph.

ALTER TABLE "MythosDeity" ADD COLUMN "primaryDomains" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "MythosDeity" ADD COLUMN "graphX" REAL NOT NULL DEFAULT 50;
ALTER TABLE "MythosDeity" ADD COLUMN "graphY" REAL NOT NULL DEFAULT 50;

CREATE TABLE "MythosRelation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'other',
  "label" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "startDay" INTEGER,
  "endDay" INTEGER,
  "visibility" TEXT NOT NULL DEFAULT 'gm',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MythosRelation_sourceId_fkey" FOREIGN KEY ("sourceId")
    REFERENCES "MythosDeity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MythosRelation_targetId_fkey" FOREIGN KEY ("targetId")
    REFERENCES "MythosDeity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MythosRelation_sourceId_targetId_idx" ON "MythosRelation"("sourceId","targetId");
CREATE INDEX "MythosRelation_category_type_idx" ON "MythosRelation"("category","type");
CREATE INDEX "MythosRelation_startDay_endDay_idx" ON "MythosRelation"("startDay","endDay");

CREATE TABLE "MythosMyth" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "visibility" TEXT NOT NULL DEFAULT 'gm',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "MythosMythParticipant" (
  "mythId" TEXT NOT NULL,
  "deityId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("mythId","deityId"),
  CONSTRAINT "MythosMythParticipant_mythId_fkey" FOREIGN KEY ("mythId")
    REFERENCES "MythosMyth" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MythosMythParticipant_deityId_fkey" FOREIGN KEY ("deityId")
    REFERENCES "MythosDeity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MythosMythParticipant_deityId_mythId_idx"
  ON "MythosMythParticipant"("deityId","mythId");

CREATE TABLE "MythosBelief" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deityId" TEXT,
  "worldId" TEXT,
  "culture" TEXT NOT NULL,
  "publicName" TEXT NOT NULL,
  "doctrine" TEXT NOT NULL DEFAULT '',
  "identity" TEXT NOT NULL DEFAULT 'unknown',
  "visibility" TEXT NOT NULL DEFAULT 'gm',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MythosBelief_deityId_fkey" FOREIGN KEY ("deityId")
    REFERENCES "MythosDeity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MythosBelief_worldId_fkey" FOREIGN KEY ("worldId")
    REFERENCES "World" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MythosBelief_deityId_culture_idx" ON "MythosBelief"("deityId","culture");
CREATE INDEX "MythosBelief_worldId_culture_idx" ON "MythosBelief"("worldId","culture");

CREATE TABLE "MythosSacredSite" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deityId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "importance" TEXT NOT NULL DEFAULT 'site',
  "visibility" TEXT NOT NULL DEFAULT 'gm',
  CONSTRAINT "MythosSacredSite_deityId_fkey" FOREIGN KEY ("deityId")
    REFERENCES "MythosDeity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MythosSacredSite_locationId_fkey" FOREIGN KEY ("locationId")
    REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MythosSacredSite_deityId_locationId_idx" ON "MythosSacredSite"("deityId","locationId");
CREATE INDEX "MythosSacredSite_locationId_deityId_idx" ON "MythosSacredSite"("locationId","deityId");

CREATE TABLE "MythosChronicleLink" (
  "deityId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("deityId","eventId"),
  CONSTRAINT "MythosChronicleLink_deityId_fkey" FOREIGN KEY ("deityId")
    REFERENCES "MythosDeity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MythosChronicleLink_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "ChronicleEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MythosChronicleLink_eventId_deityId_idx" ON "MythosChronicleLink"("eventId","deityId");

CREATE TABLE "MythosCosmicNode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'realm',
  "description" TEXT NOT NULL DEFAULT '',
  "symbol" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '#7f8da8',
  "x" REAL NOT NULL DEFAULT 50,
  "y" REAL NOT NULL DEFAULT 50,
  "worldId" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'gm',
  CONSTRAINT "MythosCosmicNode_worldId_fkey" FOREIGN KEY ("worldId")
    REFERENCES "World" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MythosCosmicNode_worldId_kind_idx" ON "MythosCosmicNode"("worldId","kind");

CREATE TABLE "MythosCosmicLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'path',
  "label" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "visibility" TEXT NOT NULL DEFAULT 'gm',
  CONSTRAINT "MythosCosmicLink_sourceId_fkey" FOREIGN KEY ("sourceId")
    REFERENCES "MythosCosmicNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MythosCosmicLink_targetId_fkey" FOREIGN KEY ("targetId")
    REFERENCES "MythosCosmicNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MythosCosmicLink_sourceId_targetId_idx" ON "MythosCosmicLink"("sourceId","targetId");
