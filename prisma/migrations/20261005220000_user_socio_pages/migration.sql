-- AlterTable
ALTER TABLE "users" ADD COLUMN "allowedPages" TEXT[] DEFAULT ARRAY[]::TEXT[];
