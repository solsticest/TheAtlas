-- Initial, additive schema. Original data/atlas.json and maps/ remain untouched.
CREATE TABLE "AtlasDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "rootExtras" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MarkerType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "raw" TEXT NOT NULL
);
CREATE TABLE "World" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "kmPerPixel" REAL,
    "sortOrder" INTEGER NOT NULL,
    "raw" TEXT NOT NULL
);
CREATE TABLE "MapLayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "bounds" TEXT NOT NULL,
    "rotation" REAL NOT NULL,
    "showAtZoom" REAL NOT NULL,
    "fadeRange" REAL NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "raw" TEXT NOT NULL,
    CONSTRAINT "MapLayer_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MapLayer_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MapLayer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "color" TEXT NOT NULL,
    "minZoom" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "article" TEXT,
    "tags" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "raw" TEXT NOT NULL,
    CONSTRAINT "Location_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Location_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MarkerType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MediaAsset" (
    "path" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "storedPath" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MarkerType_sortOrder_key" ON "MarkerType"("sortOrder");
CREATE UNIQUE INDEX "World_sortOrder_key" ON "World"("sortOrder");
CREATE UNIQUE INDEX "MapLayer_worldId_sortOrder_key" ON "MapLayer"("worldId", "sortOrder");
CREATE INDEX "MapLayer_worldId_parentId_idx" ON "MapLayer"("worldId", "parentId");
CREATE UNIQUE INDEX "Location_worldId_sortOrder_key" ON "Location"("worldId", "sortOrder");
CREATE INDEX "Location_worldId_typeId_idx" ON "Location"("worldId", "typeId");
