-- Additive marker type presentation settings. Existing legacy rows keep their symbol.
ALTER TABLE "MarkerType" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#d6b77a';
ALTER TABLE "MarkerType" ADD COLUMN "iconSvg" TEXT;
