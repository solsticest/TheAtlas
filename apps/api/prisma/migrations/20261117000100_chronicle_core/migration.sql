-- Chronicle is deliberately separate from Atlas Timeline/Era/Event.
-- It uses one absolute day axis and explicit many-to-many world/tag links.
CREATE TABLE "ChronicleTag" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#8f744e',
  "icon" TEXT,
  "description" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ChronicleTag_normalizedName_key"
ON "ChronicleTag"("normalizedName");

CREATE TABLE "ChronicleEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "article" TEXT NOT NULL DEFAULT '',
  "kind" TEXT NOT NULL DEFAULT 'point',
  "startDay" INTEGER,
  "endDay" INTEGER,
  "startPrecision" TEXT NOT NULL DEFAULT 'exact',
  "earliestDay" INTEGER,
  "latestDay" INTEGER,
  "endPrecision" TEXT,
  "significance" TEXT NOT NULL DEFAULT 'normal',
  "visibility" TEXT NOT NULL DEFAULT 'gm',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ChronicleEvent_startDay_endDay_idx"
ON "ChronicleEvent"("startDay","endDay");

CREATE INDEX "ChronicleEvent_visibility_startDay_idx"
ON "ChronicleEvent"("visibility","startDay");

CREATE TABLE "ChronicleEventWorld" (
  "eventId" TEXT NOT NULL,
  "worldId" TEXT NOT NULL,
  PRIMARY KEY ("eventId","worldId"),
  CONSTRAINT "ChronicleEventWorld_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "ChronicleEvent" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChronicleEventWorld_worldId_fkey"
    FOREIGN KEY ("worldId") REFERENCES "World" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ChronicleEventWorld_worldId_eventId_idx"
ON "ChronicleEventWorld"("worldId","eventId");

CREATE TABLE "ChronicleEventTag" (
  "eventId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  PRIMARY KEY ("eventId","tagId"),
  CONSTRAINT "ChronicleEventTag_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "ChronicleEvent" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChronicleEventTag_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "ChronicleTag" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ChronicleEventTag_tagId_eventId_idx"
ON "ChronicleEventTag"("tagId","eventId");
