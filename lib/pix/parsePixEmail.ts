import type { ParsedPixEmail } from "./types";

const COMPANY_CNPJ = "63817773000185";

function parseBrMoneyToCents(raw: string): number | null {
  const s = String(raw || "").trim();
  const m = s.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
  if (!m) return null;
  const intPart = m[1].replace(/\./g, "");
  const n = Number(`${intPart}.${m[2]}`);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function detectBank(text: string): ParsedPixEmail["bank"] {
  const t = text.toLowerCase();
  if (t.includes("inter") || t.includes("bancointer")) return "INTER";
  if (t.includes("nubank") || t.includes("nu pagamentos")) return "NUBANK";
  return "OTHER";
}

function cleanPayerName(raw: string) {
  return String(raw || "")
    .replace(/^r\$\s*[\d.]+,\d{2}\s*(de\s+)?/i, "")
    .replace(/,?\s*na conta.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parser regex — Inter e padrões comuns de Pix recebido. */
export function parsePixEmailText(subject: string, body: string): ParsedPixEmail | null {
  const text = `${subject}\n${body}`.replace(/\s+/g, " ");
  const lower = text.toLowerCase();

  const isPix =
    lower.includes("pix") ||
    lower.includes("transferencia") ||
    lower.includes("transferência");
  if (!isPix) return null;

  const isOut =
    /pix enviado|enviamos o valor|voce enviou|você enviou|debitado|pagamento pix realizado|foi realizado um pagamento|realizado um pagamento da sua conta|dados de destino/i.test(
      text
    );
  const isIn = /pix recebido|recebemos o valor|voce recebeu|você recebeu|creditado/i.test(text);
  const direction: ParsedPixEmail["direction"] = isOut && !isIn ? "OUT" : isIn ? "IN" : isOut ? "OUT" : "IN";

  let amountCents: number | null = null;
  const amountPatterns = [
    /recebemos o valor de\s*r\$\s*([\d.]+,\d{2})/i,
    /valor de\s*r\$\s*([\d.]+,\d{2})/i,
    /r\$\s*([\d.]+,\d{2})/i,
  ];
  for (const re of amountPatterns) {
    const m = text.match(re);
    if (m?.[1]) {
      amountCents = parseBrMoneyToCents(m[1]);
      if (amountCents != null) break;
    }
  }
  if (amountCents == null) return null;

  let payerName: string | null = null;
  if (direction === "OUT") {
    const payeePatterns = [
      /dados de destino[\s\S]*?nome:\s*(.+?)(?:\s*cpf|\s*cnpj|$)/i,
      /\bnome:\s*(.+?)(?:\s*cpf\/cnpj|\s*cnpj|\s*cpf|$)/i,
    ];
    for (const re of payeePatterns) {
      const m = text.match(re);
      if (m?.[1]) {
        payerName = cleanPayerName(m[1]);
        if (payerName && payerName.length >= 3) break;
        payerName = null;
      }
    }
  } else {
    const payerPatterns = [
      /recebemos o valor de\s*r\$\s*[\d.,]+\s+de\s+(.+?),\s*na conta/i,
      /recebemos o valor de\s*r\$\s*[\d.,]+\s+de\s+(.+?)(?:\.|$)/i,
      /valor de\s*r\$\s*[\d.,]+\s+de\s+(.+?)(?:,\s*na conta|\.|$)/i,
      /r\$\s*[\d.]+,\d{2}\s+de\s+(.+?)(?:,\s*na conta|\.|$)/i,
      /de\s+(.+?),\s*na conta\s+\d/i,
      /pix recebido de\s+(.+?)(?:\.|,|$)/i,
    ];
    for (const re of payerPatterns) {
      const m = text.match(re);
      if (m?.[1]) {
        payerName = cleanPayerName(m[1]);
        if (payerName && payerName.length >= 3) break;
        payerName = null;
      }
    }
  }

  let payeeAccount: string | null = null;
  const accM = text.match(/na conta\s+(\d{4,})/i);
  if (accM?.[1]) payeeAccount = accM[1];

  // Alertas só para Pix recebido — saídas não entram na fila.
  if (direction === "OUT") return null;

  return {
    bank: detectBank(text),
    direction,
    amountCents,
    payerName,
    payeeAccount,
    confidence: payerName ? "high" : "medium",
    source: "regex",
  };
}

export function isBankPixSender(fromAddress: string, fromName: string, subject: string) {
  const hay = `${fromAddress} ${fromName} ${subject}`.toLowerCase();
  return (
    hay.includes("inter.co") ||
    hay.includes("bancointer") ||
    hay.includes("nubank") ||
    /pagamento pix/i.test(subject)
  );
}

export const BANK_PIX_GMAIL_QUERY =
  'from:(inter.co OR bancointer.com.br OR nubank.com.br OR notify.nubank.com.br) (pix OR "pagamento pix")';
