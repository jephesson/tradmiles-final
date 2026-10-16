import { prisma } from "@/lib/prisma";
import { employeePixDestino, type PixDestino } from "@/lib/inter/destino";
import { EMPTY_CREDITOR_KEY } from "@/lib/debts/allocate";
import { normalizePixKey, pixKeyLooksValid } from "@/lib/inter/pix-key";

function personPixDestino(
  nome: string,
  pixTipo: string | null | undefined,
  chavePix: string | null | undefined,
  source: string
): PixDestino | null {
  if (!pixTipo || !chavePix) return null;
  const pixKey = normalizePixKey(pixTipo, chavePix);
  if (!pixKeyLooksValid(pixTipo, pixKey)) return null;
  return {
    nome,
    cpf: null,
    banco: null,
    pixTipo,
    pixKey,
    source,
    cpfMatchesKey: null,
  };
}

export async function personDebtPixDestino(groupKey: string): Promise<PixDestino> {
  const name = groupKey === EMPTY_CREDITOR_KEY ? null : groupKey;
  const sample = await prisma.debt.findFirst({
    where: name
      ? { creditorName: name }
      : { OR: [{ creditorName: null }, { creditorName: "" }] },
    select: { linkedUserId: true, creditorName: true },
    orderBy: { updatedAt: "desc" },
  });
  if (sample?.linkedUserId) {
    try {
      const destino = await employeePixDestino(sample.linkedUserId);
      return { ...destino, source: `cadastro (${destino.nome})` };
    } catch {
      /* cai no PIX salvo na pessoa da dívida */
    }
  }
  if (name) {
    const person = await prisma.personDebtCreditor.findUnique({
      where: { name },
      select: { name: true, pixTipo: true, chavePix: true },
    });
    const fromPerson = personPixDestino(person?.name || name, person?.pixTipo, person?.chavePix, "PIX da pessoa");
    if (fromPerson) return fromPerson;

    const card = await prisma.cardDebtCreditor.findFirst({
      where: { name },
      select: { name: true, pixTipo: true, chavePix: true, ownerId: true },
    });
    if (card?.ownerId) {
      try {
        return await employeePixDestino(card.ownerId);
      } catch {
        /* cai no PIX do cartão */
      }
    }
    const fromCard = personPixDestino(card?.name || name, card?.pixTipo, card?.chavePix, "Dívida cartões");
    if (fromCard) return fromCard;
  }
  throw new Error("Cadastre o PIX nesta pessoa (abaixo) para pagar via PIX.");
}
