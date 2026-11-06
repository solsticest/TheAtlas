
-- Additive timeline/event and admin session tables. Legacy source rows are not modified.
CREATE TABLE "Timeline" (
 "id" TEXT NOT NULL PRIMARY KEY, "worldId" TEXT NOT NULL,
 "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
 "sortOrder" INTEGER NOT NULL DEFAULT 0, "isDefault" BOOLEAN NOT NULL DEFAULT false,
 "status" TEXT NOT NULL DEFAULT 'draft',
 CONSTRAINT "Timeline_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "Era" (
 "id" TEXT NOT NULL PRIMARY KEY, "timelineId" TEXT NOT NULL,
 "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
 "dateLabel" TEXT NOT NULL DEFAULT '', "sortOrder" INTEGER NOT NULL DEFAULT 0,
 "image" TEXT,
 CONSTRAINT "Era_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "Timeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "Event" (
 "id" TEXT NOT NULL PRIMARY KEY, "eraId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "summary" TEXT NOT NULL DEFAULT '', "article" TEXT NOT NULL DEFAULT '',
 "type" TEXT NOT NULL DEFAULT '', "tags" TEXT NOT NULL DEFAULT '[]',
 "dateLabel" TEXT NOT NULL DEFAULT '', "sortOrder" INTEGER NOT NULL DEFAULT 0,
 "locationId" TEXT, "x" REAL, "y" REAL, "image" TEXT,
 "status" TEXT NOT NULL DEFAULT 'draft',
 CONSTRAINT "Event_eraId_fkey" FOREIGN KEY ("eraId") REFERENCES "Era"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "Event_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "AdminSession" (
 "idHash" TEXT NOT NULL PRIMARY KEY,
 "csrfHash" TEXT NOT NULL,
 "expiresAt" DATETIME NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Timeline_worldId_sortOrder_idx" ON "Timeline"("worldId", "sortOrder");
CREATE INDEX "Era_timelineId_sortOrder_idx" ON "Era"("timelineId", "sortOrder");
CREATE INDEX "Event_eraId_status_sortOrder_idx" ON "Event"("eraId", "status", "sortOrder");
