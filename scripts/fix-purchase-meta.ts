// scripts/fix-purchase-meta.ts
import "dotenv/config";

function toInt(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : 0;
}

async function getPrisma() {
  // tenta src/lib/prisma
  try {
    const m: any = await import("../src/lib/prisma");
    if (m?.prisma) return m.prisma;
  } catch {}

  // tenta lib/prisma
  try {
    const m: any = await import("../lib/prisma");
    if (m?.prisma) return m.prisma;
  } catch {}

  throw new Error(
    "Não encontrei export `prisma`. Verifique se existe `src/lib/prisma.ts` ou `lib/prisma.ts` exportando `prisma`."
  );
}

async function main() {
  const prisma = await getPrisma();

  const compras = await prisma.purchase.findMany({
    where: { status: "CLOSED" },
    select: {
      id: true,
      numero: true,
      custoMilheiroCents: true,
      metaMarkupCents: true,
      metaMilheiroCents: true,
    },
    take: 5000,
  });

  let corrigidas = 0;

  for (const c of compras) {
    const custo = toInt(c.custoMilheiroCents);
    const markup = toInt(c.metaMarkupCents);
    const metaAtual = toInt(c.metaMilheiroCents);

    const metaCorreta = custo + markup;

    if (metaAtual !== metaCorreta) {
      corrigidas++;
      await prisma.purchase.update({
        where: { id: c.id },
        data: { metaMilheiroCents: metaCorreta },
      });

      console.log(
        `[OK] ${c.numero}: meta ${metaAtual} -> ${metaCorreta} (custo=${custo} + markup=${markup})`
      );
    }
  }

  console.log(`\nFeito. Verificadas: ${compras.length}. Corrigidas: ${corrigidas}.`);

  // se teu prisma exporta .$disconnect (normalmente sim)
  if (typeof prisma?.$disconnect === "function") await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Erro:", e);
  process.exitCode = 1;
});
