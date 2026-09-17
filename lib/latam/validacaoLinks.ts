const UNICO_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUnicoHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "cadastro.unico.app" ||
    host === "id.unico.io" ||
    /(?:^|\.)unico\.(app|io)$/.test(host)
  );
}

function unicoProcessLinkFromId(id: string) {
  return `https://cadastro.unico.app/process/${id}?collect-data=true`;
}

export function extractLatamOrderId(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const url = new URL(s);
    const fromParam = url.searchParams.get("orderId") || url.searchParams.get("orderid");
    if (fromParam && /^LA[A-Z0-9]+$/i.test(fromParam.trim())) {
      return fromParam.trim().toUpperCase();
    }
  } catch {
    // fall through
  }
  const fromQuery = s.match(/orderId=([A-Za-z0-9]+)/i);
  if (fromQuery?.[1] && /^LA[A-Z0-9]+$/i.test(fromQuery[1])) {
    return fromQuery[1].toUpperCase();
  }
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (/^LA[A-Z0-9]+$/.test(cleaned)) return cleaned;
  return null;
}

export function buildLatamPagamentoLink(orderId: string) {
  return `https://www.latamairlines.com/br/pt/v2/pagamentos/?orderId=${encodeURIComponent(
    orderId
  )}&flow=BOOKING-REDEMPTION`;
}

/** Qualquer link Unico com ?id=uuid → process. Aceita intro, /process/{id} ou UUID puro. */
export function normalizeUnicoBiometriaLink(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;

  if (UNICO_UUID_RE.test(s)) return unicoProcessLinkFromId(s);

  try {
    const url = new URL(s);
    if (!isUnicoHost(url.hostname)) {
      const id = String(url.searchParams.get("id") || "").trim();
      if (UNICO_UUID_RE.test(id)) return unicoProcessLinkFromId(id);
      return null;
    }

    const processMatch = url.pathname.match(
      /^\/process\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i
    );
    if (processMatch?.[1]) return unicoProcessLinkFromId(processMatch[1]);

    const id = String(url.searchParams.get("id") || "").trim();
    if (UNICO_UUID_RE.test(id)) return unicoProcessLinkFromId(id);
  } catch {
    const idMatch = s.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (idMatch?.[1] && UNICO_UUID_RE.test(idMatch[1])) {
      return unicoProcessLinkFromId(idMatch[1]);
    }
  }
  return null;
}
