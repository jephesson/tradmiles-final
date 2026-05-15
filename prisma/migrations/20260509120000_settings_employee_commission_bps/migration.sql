-- Comissões de funcionários (C1 e bônus sobre excedente da meta): configuráveis em bps.
ALTER TABLE "settings" ADD COLUMN "employeeC1Bps" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "settings" ADD COLUMN "employeeBonusAboveMetaBps" INTEGER NOT NULL DEFAULT 3000;
