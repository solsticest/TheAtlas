-- Persistent LIFO edit history for contextual editor Undo/Redo.
CREATE TABLE "EditHistory" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "entityKind" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "beforeJson" TEXT,
  "afterJson" TEXT,
  "applied" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EditHistory_applied_id_idx" ON "EditHistory"("applied", "id");
