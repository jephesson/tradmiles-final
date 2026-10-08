-- Move unpaid CPF cancel fines from Dívidas a receber onto the sale receivable.

UPDATE receivables r
SET
  status = 'OPEN',
  "totalCents" = s."cancelFineCents",
  "receivedCents" = 0,
  "balanceCents" = s."cancelFineCents"
FROM sales s
INNER JOIN dividas_a_receber d ON d.id = s."cancelFineDividaId"
WHERE r.id = s."receivableId"
  AND s."paymentStatus" = 'CANCELED'
  AND COALESCE(s."cancelFineCents", 0) > 0
  AND d.status IN ('OPEN', 'PARTIAL');

INSERT INTO receivables (
  id,
  title,
  description,
  "totalCents",
  "receivedCents",
  "balanceCents",
  status,
  "createdAt",
  "updatedAt"
)
SELECT
  'cnc_' || s.id,
  'Multa CPF ' || s.numero,
  'Multa de cancelamento vinculada ao localizador.',
  s."cancelFineCents",
  0,
  s."cancelFineCents",
  'OPEN',
  NOW(),
  NOW()
FROM sales s
INNER JOIN dividas_a_receber d ON d.id = s."cancelFineDividaId"
WHERE s."receivableId" IS NULL
  AND s."paymentStatus" = 'CANCELED'
  AND COALESCE(s."cancelFineCents", 0) > 0
  AND d.status IN ('OPEN', 'PARTIAL')
  AND NOT EXISTS (SELECT 1 FROM receivables r WHERE r.id = 'cnc_' || s.id);

UPDATE sales s
SET "receivableId" = 'cnc_' || s.id
WHERE s."receivableId" IS NULL
  AND s."paymentStatus" = 'CANCELED'
  AND COALESCE(s."cancelFineCents", 0) > 0
  AND EXISTS (SELECT 1 FROM receivables r WHERE r.id = 'cnc_' || s.id);

UPDATE dividas_a_receber d
SET status = 'CANCELED'
FROM sales s
WHERE d.id = s."cancelFineDividaId"
  AND d.status IN ('OPEN', 'PARTIAL')
  AND COALESCE(s."cancelFineCents", 0) > 0
  AND s."receivableId" IS NOT NULL;
