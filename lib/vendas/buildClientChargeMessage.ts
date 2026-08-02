/** Mensagem de cobrança enviada ao cliente após emitir a passagem. */

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.floor(Number(n) || 0)));
}

function fmtMoneyBR(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((Number(cents) || 0) / 100);
}

function toBRDate(iso: string) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return iso;
}

function cap1(s?: string | null) {
  const v = (s || "").trim();
  if (!v) return "";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export type ClientChargeMessageInput = {
  dateISO: string;
  vendedorNome?: string | null;
  clienteNome?: string | null;
  program: string;
  pointsTotal: number;
  passengers: number;
  milheiroCents: number;
  pointsValueCents: number;
  embarqueFeeCents: number;
  totalCents: number;
  feeCardLabel?: string | null;
  locator?: string | null;
};

export function buildClientChargeMessage(args: ClientChargeMessageInput): string {
  const lines: string[] = [];

  lines.push("Parabéns — sua passagem foi emitida com sucesso!");
  lines.push("");
  lines.push("Resumo da emissão:");
  lines.push("");

  lines.push(`📅 Data da emissão: ${toBRDate(args.dateISO)}`);

  if (args.vendedorNome) lines.push(`👤 Vendedor(a): ${cap1(args.vendedorNome)}`);
  if (args.clienteNome) lines.push(`🧾 Cliente: ${args.clienteNome}`);

  lines.push(`✈️ Programa: ${args.program}`);
  lines.push(`🎯 Pontos: ${fmtInt(args.pointsTotal)}`);
  lines.push(`👥 Passageiros (PAX): ${fmtInt(args.passengers)}`);
  lines.push(`💸 Milheiro: ${fmtMoneyBR(args.milheiroCents)}`);
  lines.push(`🧮 Valor dos pontos: ${fmtMoneyBR(args.pointsValueCents)}`);
  lines.push(`🛄 Taxa de embarque: ${fmtMoneyBR(args.embarqueFeeCents)}`);
  lines.push(`💰 Total: ${fmtMoneyBR(args.totalCents)}`);
  lines.push(`💳 Cartão usado: ${args.feeCardLabel?.trim() || "—"}`);

  if (args.locator?.trim()) lines.push(`🔎 Localizador: ${args.locator.trim()}`);

  lines.push("");
  lines.push("Pagamento");
  lines.push("Pix: 63817773000185 (CNPJ)");
  lines.push("Nome: Vias Aereas");
  lines.push("Banco: Inter");
  lines.push(`Valor a pagar: ${fmtMoneyBR(args.totalCents)}`);
  lines.push("");
  lines.push("⚠️ Antes de viajar");
  lines.push(
    "Confira datas, horários e os dados dos passageiros. Em caso de divergência, avise em até 24 horas após a emissão. Depois desse prazo, ajustes podem gerar taxa administrativa de R$ 30,00."
  );

  const program = String(args.program || "").toUpperCase();
  if (program === "LATAM" || program === "SMILES") {
    const perCpfCents = program === "LATAM" ? 15_000 : 10_000;
    const pax = Math.max(0, Math.floor(Number(args.passengers) || 0));
    const totalCancelCents = perCpfCents * pax;
    const prog = program === "LATAM" ? "LATAM" : "Smiles";
    lines.push("");
    lines.push(`🎫 Cancelamento da passagem (${prog})`);
    lines.push(
      program === "LATAM"
        ? `Em caso de cancelamento, a taxa é de ${fmtMoneyBR(perCpfCents)} por CPF (por passageiro) na LATAM.`
        : `Em caso de cancelamento, a taxa é de ${fmtMoneyBR(perCpfCents)} por CPF (por passageiro) na Smiles.`
    );
    if (pax > 0) {
      lines.push(
        `Nesta emissão: ${fmtInt(pax)} ${pax === 1 ? "passageiro" : "passageiros"} → total estimado da taxa em cancelamento: ${fmtMoneyBR(totalCancelCents)}.`
      );
    } else {
      lines.push(
        `Total estimado da taxa em cancelamento: ${fmtMoneyBR(totalCancelCents)} (conferir número de passageiros na reserva).`
      );
    }
  }

  lines.push("");
  lines.push(
    "📌 Atenção: emissões com menos de 24 horas de antecedência ou com voo em até 7 dias podem estar sujeitas a taxas adicionais (Resolução ANAC nº 400)."
  );
  lines.push("");
  lines.push("Qualquer dúvida, fale conosco. Boa viagem! ✈️");

  return lines.join("\n");
}

/** Monta a mensagem a partir de uma linha de venda do painel. */
export function buildClientChargeMessageFromSale(sale: {
  date: string;
  program: string;
  points: number;
  passengers: number;
  milheiroCents: number;
  pointsValueCents?: number | null;
  embarqueFeeCents?: number | null;
  totalCents: number;
  feeCardLabel?: string | null;
  locator?: string | null;
  cliente?: { nome?: string | null } | null;
  seller?: { name?: string | null } | null;
}): string {
  const points = Math.max(0, Math.floor(Number(sale.points) || 0));
  const milheiroCents = Math.max(0, Math.floor(Number(sale.milheiroCents) || 0));
  let pointsValueCents = Math.max(0, Math.floor(Number(sale.pointsValueCents) || 0));
  if (pointsValueCents <= 0 && points > 0 && milheiroCents > 0) {
    pointsValueCents = Math.round((points / 1000) * milheiroCents);
  }

  return buildClientChargeMessage({
    dateISO: sale.date,
    vendedorNome: sale.seller?.name || null,
    clienteNome: sale.cliente?.nome || null,
    program: sale.program,
    pointsTotal: points,
    passengers: Math.max(0, Math.floor(Number(sale.passengers) || 0)),
    milheiroCents,
    pointsValueCents,
    embarqueFeeCents: Math.max(0, Math.floor(Number(sale.embarqueFeeCents) || 0)),
    totalCents: Math.max(0, Math.floor(Number(sale.totalCents) || 0)),
    feeCardLabel: sale.feeCardLabel || "—",
    locator: sale.locator || null,
  });
}
