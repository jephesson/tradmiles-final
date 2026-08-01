-- Dados de cobrança LATAM no cartão (e-mail, CPF, nascimento)
ALTER TABLE "employee_payment_cards" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "employee_payment_cards" ADD COLUMN IF NOT EXISTS "cpf" TEXT;
ALTER TABLE "employee_payment_cards" ADD COLUMN IF NOT EXISTS "birthDate" TEXT;
