import type { PendingSaleLite } from "./matchPixToPendingSales";
import type { ParsedPixEmail, PixMatchResult, PixMatchSale } from "./types";

type EmployeeLite = { id: string; name: string };

const SYSTEM = `Você classifica Pix recebidos para uma agência de milhas aéreas no Brasil.
Responda SOMENTE JSON válido:
{
  "classification": "CLIENT_PAYMENT" | "EMPLOYEE" | "COMPANY_INTERNAL" | "UNKNOWN",
  "label": string,
  "employeeName": string | null,
  "suggestedSaleIds": string[]
}
Regras:
- CLIENT_PAYMENT: pagador provavelmente é cliente pagando venda pendente (valor igual ou próximo, nome relacionado).
- EMPLOYEE: pagador é claramente um funcionário da lista (primeiro nome bate, não só sobrenome).
- COMPANY_INTERNAL: pix da própria empresa ou saída.
- UNKNOWN: teste simbólico (ex. R$ 0,01), pagador sem relação clara, ou dúvida.
- suggestedSaleIds: ids das vendas mais prováveis. Se várias vendas do MESMO cliente somam o valor do Pix, retorne TODAS elas.
- Não confunda sobrenomes iguais (ex. Floriano) com match de funcionário se o primeiro nome for diferente.
- Ignore palavras genéricas (Milhas, Ltda, Plus, Flash) ao comparar nomes.`;

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mapSale(s: PendingSaleLite, pixAmount: number, reason: string): PixMatchSale {
  return {
    saleId: s.id,
    numero: s.numero,
    locator: s.locator,
    totalCents: s.totalCents,
    clienteId: s.clienteId,
    clienteNome: s.clienteNome,
    date: s.date.toISOString(),
    program: s.program,
    amountDiffCents: pixAmount - s.totalCents,
    reason,
  };
}

export function shouldUseAiMatch(match: PixMatchResult, parsed: ParsedPixEmail) {
  if (match.classification === "UNKNOWN") return true;
  if (match.classification === "EMPLOYEE" && parsed.amountCents < 500) return true;
  if (match.matchKind === "probable" && !match.suggestedSales.length) return true;
  return false;
}

export async function classifyPixWithAI(args: {
  parsed: ParsedPixEmail;
  pendingSales: PendingSaleLite[];
  employees: EmployeeLite[];
}): Promise<PixMatchResult | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  if (!apiKey) return null;

  const { parsed, pendingSales, employees } = args;
  const model = process.env.OPENAI_PIX_MODEL || process.env.OPENAI_DOCUMENT_MODEL || "gpt-4o-mini";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  // Inclui mais vendas e ordena por cliente para a IA enxergar agrupamentos
  const salesPayload = [...pendingSales]
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome) || b.totalCents - a.totalCents)
    .slice(0, 40)
    .map((s) => ({
      id: s.id,
      clienteId: s.clienteId,
      cliente: s.clienteNome,
      valor: fmtMoney(s.totalCents),
      valorCentavos: s.totalCents,
      numero: s.numero,
    }));

  const userContent = JSON.stringify({
    pagador: parsed.payerName,
    valor: fmtMoney(parsed.amountCents),
    valorCentavos: parsed.amountCents,
    direcao: parsed.direction,
    vendasPendentes: salesPayload,
    funcionarios: employees.map((e) => e.name),
  });

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) return null;

  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) return null;

  try {
    const data = JSON.parse(String(raw));
    const classification = data.classification as PixMatchResult["classification"];
    if (!["CLIENT_PAYMENT", "EMPLOYEE", "COMPANY_INTERNAL", "UNKNOWN"].includes(classification)) {
      return null;
    }

    const saleIds: string[] = Array.isArray(data.suggestedSaleIds)
      ? data.suggestedSaleIds.map((id: unknown) => String(id))
      : [];
    const suggestedSales = saleIds
      .map((id) => pendingSales.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => mapSale(s!, parsed.amountCents, "sugestão IA"));

    const matchedTotalCents = suggestedSales.reduce((a, s) => a + s.totalCents, 0);
    const sameCliente =
      suggestedSales.length >= 2 &&
      suggestedSales.every((s) => s.clienteId === suggestedSales[0]!.clienteId);
    const groupHits =
      sameCliente && Math.abs(matchedTotalCents - parsed.amountCents) <= 200;

    return {
      classification,
      classificationLabel: String(
        data.label ||
          (groupHits
            ? `Pix agrupado · ${suggestedSales[0]!.clienteNome} (${suggestedSales.length} vendas)`
            : "Classificado pela IA")
      ),
      suggestedSales: groupHits
        ? suggestedSales.map((s) => ({ ...s, amountDiffCents: 0, reason: "agrupada · sugestão IA" }))
        : suggestedSales,
      matchKind: groupHits ? "grouped" : suggestedSales[0] ? "probable" : "none",
      matchedTotalCents: groupHits ? matchedTotalCents : suggestedSales[0]?.totalCents ?? 0,
      amountDiffCents: groupHits
        ? parsed.amountCents - matchedTotalCents
        : suggestedSales[0]
          ? parsed.amountCents - suggestedSales[0].totalCents
          : parsed.amountCents,
      employeeName: data.employeeName ? String(data.employeeName) : null,
    };
  } catch {
    return null;
  }
}
