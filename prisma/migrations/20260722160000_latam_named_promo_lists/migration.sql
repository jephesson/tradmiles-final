-- Migrate Latam promo lists from date-based lists to named lists.
-- Existing promo list items are dropped (user requested to clear all lists).

-- 1) Remove all existing promo list items (date-based data is discarded).
DELETE FROM "latam_promo_list_items";

-- 2) Create the named-list table.
CREATE TABLE "latam_promo_lists" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "latam_promo_lists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "latam_promo_lists_team_createdAt_idx"
ON "latam_promo_lists"("team", "createdAt");

CREATE INDEX "latam_promo_lists_createdById_idx"
ON "latam_promo_lists"("createdById");

ALTER TABLE "latam_promo_lists"
ADD CONSTRAINT "latam_promo_lists_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) Rework the items table: drop the date-based indexes/columns, add listId.
DROP INDEX "latam_promo_list_items_team_listDate_cedenteId_key";
DROP INDEX "latam_promo_list_items_team_listDate_status_idx";

ALTER TABLE "latam_promo_list_items" DROP COLUMN "listDate";
ALTER TABLE "latam_promo_list_items" ADD COLUMN "listId" TEXT NOT NULL;

CREATE UNIQUE INDEX "latam_promo_list_items_listId_cedenteId_key"
ON "latam_promo_list_items"("listId", "cedenteId");

CREATE INDEX "latam_promo_list_items_listId_status_idx"
ON "latam_promo_list_items"("listId", "status");

CREATE INDEX "latam_promo_list_items_team_idx"
ON "latam_promo_list_items"("team");

ALTER TABLE "latam_promo_list_items"
ADD CONSTRAINT "latam_promo_list_items_listId_fkey"
FOREIGN KEY ("listId") REFERENCES "latam_promo_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
