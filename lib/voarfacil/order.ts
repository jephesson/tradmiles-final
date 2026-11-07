/** Pedido lido da página emissao-externa.voarfacil.net pela extensão. */
export type VoarFacilSegment = { flight: string; date: string; from: string; to: string };
export type VoarFacilLeg = {
  direction: "IDA" | "VOLTA";
  from: string;
  to: string;
  date: string;
  miles: number;
  segments: VoarFacilSegment[];
};
export type VoarFacilPassenger = {
  firstName: string;
  lastName: string;
  faixa: string;
  birth: string;
  sex: string;
  document: string;
};
export type VoarFacilOrderData = {
  code: string;
  pedido: string;
  url: string;
  title?: string;
  limitTaxCents: number;
  limitMiles: number;
  trip: "IDA" | "IDA_VOLTA";
  legs: VoarFacilLeg[];
  passengers: VoarFacilPassenger[];
  counts: { adt: number; chd: number; inf: number };
  milesByFaixa: Record<string, number>;
};

export type VoarFacilFill = {
  saleId: string;
  saleNumero: string;
  locator: string;
  purchaseCode: string;
  taxIdaPerPaxCents: number;
  taxVoltaPerPaxCents: number | null;
  fonte: { nome: string; cpf: string; email: string; birthIso: string };
  etickets?: Record<string, string>;
};

export type VoarFacilOrderLite = {
  id: string;
  code: string;
  pedido: string | null;
  url: string;
  data: VoarFacilOrderData;
  saleId: string | null;
  hasFill: boolean;
  updatedAt: string;
};

/** Texto de passageiros no formato que o leitor do TradeMiles entende. */
export function voarFacilPassengerText(order: Pick<VoarFacilOrderData, "passengers">) {
  return order.passengers
    .map((p) => {
      // Nome + Sobrenome separados: mantém a divisão do parceiro (vai assim para a LATAM)
      const lines = p.lastName
        ? [`Nome: ${p.firstName}`, `Sobrenome: ${p.lastName}`]
        : [`Nome completo: ${p.firstName}`];
      if (p.birth) lines.push(`Data de nascimento: ${p.birth}`);
      const doc = String(p.document || "").replace(/\D/g, "");
      if (doc.length === 11) lines.push(`CPF: ${doc}`);
      else if (p.document) lines.push(`Passaporte: ${p.document}`);
      if (/^f/i.test(p.sex)) lines.push("Sexo: Feminino");
      else if (/^m/i.test(p.sex)) lines.push("Sexo: Masculino");
      return lines.join("\n");
    })
    .join("\n\n");
}

/** Milhas totais por trecho (soma de faixas × passageiros da faixa). */
export function voarFacilLegTotals(order: VoarFacilOrderData) {
  const byFaixaCount: Record<string, number> = {};
  for (const p of order.passengers) {
    const f = /beb/i.test(p.faixa) ? "Bebê" : /crian/i.test(p.faixa) ? "Criança" : "Adulto";
    byFaixaCount[f] = (byFaixaCount[f] || 0) + 1;
  }
  const total = (dir: "IDA" | "VOLTA") => {
    let sum = 0;
    let any = false;
    for (const [k, v] of Object.entries(order.milesByFaixa || {})) {
      const [d, faixaRaw] = k.split(":");
      if (d !== dir) continue;
      const f = /beb/i.test(faixaRaw) ? "Bebê" : /crian/i.test(faixaRaw) ? "Criança" : "Adulto";
      any = true;
      sum += Number(v || 0) * (byFaixaCount[f] || 0);
    }
    if (any) return sum;
    const leg = order.legs.find((l) => l.direction === dir);
    return leg ? leg.miles * Math.max(1, order.counts.adt + order.counts.chd) : 0;
  };
  return { ida: total("IDA"), volta: order.trip === "IDA_VOLTA" ? total("VOLTA") : 0 };
}
