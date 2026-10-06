import { prisma } from "@/lib/prisma";
import { employeePixDestino, type PixDestino } from "@/lib/inter/destino";
import { EMPTY_CREDITOR_KEY } from "@/lib/debts/allocate";

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
    const destino = await employeePixDestino(sample.linkedUserId);
    return { ...destino, source: `cadastro (${destino.nome})` };
  }
  if (name) {
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
    if (card?.pixTipo && card.chavePix) {
      return {
        nome: card.name,
        cpf: null,
        banco: null,
        pixTipo: card.pixTipo,
        pixKey: card.chavePix,
        source: "Dívida cartões",
        cpfMatchesKey: null,
      };
    }
  }
  throw new Error("Cadastre o PIX no funcionário/sócio vinculado, ou na Dívida cartões.");
}
