-- Comissão vendedor padrão nas compras (100 bps = 1%)
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "vendorCommissionBps" INTEGER NOT NULL DEFAULT 100;
