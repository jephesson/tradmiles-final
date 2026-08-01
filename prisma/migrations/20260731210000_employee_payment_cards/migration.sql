-- Cartões de pagamento dos funcionários / empresa (sem CVV)
CREATE TABLE IF NOT EXISTS "employee_payment_cards" (
  "id" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "userId" TEXT,
  "label" TEXT NOT NULL,
  "holderName" TEXT NOT NULL,
  "brand" TEXT,
  "last4" TEXT NOT NULL,
  "expMonth" INTEGER NOT NULL,
  "expYear" INTEGER NOT NULL,
  "panCipher" TEXT NOT NULL,
  "panIv" TEXT NOT NULL,
  "zip" TEXT,
  "street" TEXT,
  "number" TEXT,
  "complement" TEXT,
  "district" TEXT,
  "city" TEXT,
  "state" TEXT,
  "isDefaultBoarding" BOOLEAN NOT NULL DEFAULT false,
  "isCompany" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_payment_cards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "employee_payment_cards_team_userId_idx" ON "employee_payment_cards"("team", "userId");
CREATE INDEX IF NOT EXISTS "employee_payment_cards_team_isCompany_idx" ON "employee_payment_cards"("team", "isCompany");

ALTER TABLE "employee_payment_cards"
  ADD CONSTRAINT "employee_payment_cards_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
