-- AlterTable
ALTER TABLE "bonus_month_settings" ADD COLUMN "teamBonusActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bonus_month_settings" ADD COLUMN "salesBonusActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bonus_month_settings" ADD COLUMN "recruitBonusActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bonus_month_settings" ADD COLUMN "attendanceBonusActive" BOOLEAN NOT NULL DEFAULT true;
