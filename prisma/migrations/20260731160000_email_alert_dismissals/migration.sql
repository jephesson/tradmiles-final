-- Ignorar/tratar alerta por funcionário (compartilhado entre dispositivos)
ALTER TABLE "email_alert_prefs"
ADD COLUMN IF NOT EXISTS "dismissedByUser" JSONB NOT NULL DEFAULT '{}';
