import type { VoarFacilLeg, VoarFacilOrderData, VoarFacilPassenger } from "@/lib/voarfacil/order";

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
function text(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (ENT[e]) return ENT[e];
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
}
function attrs(tag: string) {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:-][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out[m[1].toLowerCase()] = m[3] ?? m[4] ?? "";
  }
  return out;
}
const iata = (s: string) => {
  const all = [...String(s || "").matchAll(/\b([A-Z]{3})\b/g)];
  return all.length ? all[all.length - 1][1] : "";
};
const brToIso = (s: string) => {
  const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const intBr = (s: string) => Number(String(s || "").replace(/\D/g, "")) || 0;
const moneyCents = (s: string) => {
  const n = Number(String(s || "").replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Lê o HTML da página de emissão do Voar Fácil (voos, passageiros por faixa, limites). */
export function parseVoarFacilOrderHtml(html: string, url: string): VoarFacilOrderData | null {
  const code = (new URL(url).pathname.match(/[0-9a-f]{32}/i) || [])[0]?.toLowerCase() || "";
  if (!code) return null;
  const h1 = text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
  const pedido = (h1.match(/Pedido\s+(\d+)/i) || [])[1] || "";

  const dl: Record<string, string> = {};
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    dl[text(m[1]).toLowerCase()] = text(m[2]);
  }

  const legs: VoarFacilLeg[] = [];
  const passengers: VoarFacilPassenger[] = [];
  for (const tm of html.matchAll(/<table([^>]*)>([\s\S]*?)<\/table>/gi)) {
    const cls = attrs(`<t ${tm[1]}>`).class || "";
    if (!/flight-table/.test(cls) || /form-table/.test(cls)) continue;
    const rows = [...tm[2].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
      [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => text(c[1]))
    );
    const head = rows[0]?.[0] || "";
    if (/^PASSAGEIROS/i.test(head)) {
      for (const r of rows.slice(2)) {
        if (r.length < 6) continue;
        const doc = r[5].replace(/\D/g, "");
        passengers.push({
          firstName: r[0],
          lastName: r[1],
          faixa: r[2],
          birth: r[3],
          sex: r[4],
          document: doc.length === 11 ? doc : r[5],
        });
      }
      continue;
    }
    const direction = /^VOLTA/i.test(head) ? "VOLTA" : /^IDA/i.test(head) ? "IDA" : null;
    if (!direction) continue;
    const segments: VoarFacilLeg["segments"] = [];
    let miles = 0;
    for (const r of rows.slice(2)) {
      const off = r.length >= 8 ? 1 : 0;
      const flight = r[off] || "";
      if (!/^[A-Z0-9]{2}\d{2,5}$/.test(flight)) continue;
      segments.push({ flight, date: brToIso(r[off + 3]), from: iata(r[off + 4]), to: iata(r[off + 5]) });
      if (r.length >= 8) miles = intBr(r[7]) || miles;
    }
    if (segments.length) {
      legs.push({
        direction,
        from: segments[0].from,
        to: segments[segments.length - 1].to,
        date: segments[0].date,
        miles,
        segments,
      });
    }
  }

  const counts = { adt: 0, chd: 0, inf: 0 };
  for (const p of passengers) {
    if (/beb/i.test(p.faixa)) counts.inf++;
    else if (/crian/i.test(p.faixa)) counts.chd++;
    else counts.adt++;
  }

  const milesByFaixa: Record<string, number> = {};
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (!a["data-milhas"]) continue;
    milesByFaixa[`${a["data-milhas"]}:${a["data-faixa"] || "Adulto"}`] = Number(a.value || 0) || 0;
  }

  if (!legs.length || !passengers.length) return null;
  return {
    code,
    pedido,
    url,
    title: h1,
    limitTaxCents: moneyCents(dl["taxas"] || ""),
    limitMiles: intBr(dl["milhas"] || ""),
    trip: legs.some((l) => l.direction === "VOLTA") ? "IDA_VOLTA" : "IDA",
    legs,
    passengers,
    counts,
    milesByFaixa,
  };
}
