import { prisma } from "@/lib/prisma";

/** Marca o e-mail como redirecionado (idempotente). byUserId null = automático (Gmail). */
export async function markEmailRedirecionado(
  cedenteId: string,
  opts?: { byUserId?: string | null; onlyIfPending?: boolean }
) {
  const onlyIfPending = opts?.onlyIfPending !== false;
  const byUserId =
    opts?.byUserId === undefined ? null : opts.byUserId;

  if (onlyIfPending) {
    const current = await prisma.cedente.findUnique({
      where: { id: cedenteId },
      select: { emailRedirecionado: true },
    });
    if (!current || current.emailRedirecionado) {
      return { updated: false, alreadyDone: Boolean(current?.emailRedirecionado) };
    }
  }

  await prisma.cedente.update({
    where: { id: cedenteId },
    data: {
      emailRedirecionado: true,
      emailRedirecionadoAt: new Date(),
      emailRedirecionadoById: byUserId,
    },
  });

  return { updated: true, alreadyDone: false };
}
