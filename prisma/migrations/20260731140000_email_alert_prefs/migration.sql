-- Preferências compartilhadas dos alertas de e-mail
CREATE TABLE IF NOT EXISTS "email_alert_prefs" (
  "id" TEXT NOT NULL,
  "alertFilterIds" JSONB NOT NULL DEFAULT '[]',
  "alertFilters" JSONB NOT NULL DEFAULT '[]',
  "actionConfigs" JSONB NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,

  CONSTRAINT "email_alert_prefs_pkey" PRIMARY KEY ("id")
);
