/**
 * Nacionalidade e documento de viagem (passaporte / identidade) do passageiro.
 * Sem menção a nacionalidade → brasileiro (null), e a LATAM segue com CPF.
 */

export type TravelDocType = "PASSPORT" | "ID";

export type TravelDocument = {
  /** ISO-2 (ex.: "DE"). null = brasileiro / não informado. */
  nationality: string | null;
  /** Nome do país em pt-BR, para casar com o Select da LATAM se o código falhar. */
  nationalityLabel: string | null;
  documentType: TravelDocType | null;
  documentNumber: string | null;
};

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** [ISO, nome pt-BR, ...gentílicos/variações sem acento] */
const COUNTRIES: [string, string, ...string[]][] = [
  ["BR", "Brasil", "brasil", "brazil", "brasileiro", "brasileira", "brazilian"],
  ["AR", "Argentina", "argentina", "argentino", "argentine"],
  ["UY", "Uruguai", "uruguai", "uruguay", "uruguaio", "uruguaia", "uruguayo", "uruguaya"],
  ["PY", "Paraguai", "paraguai", "paraguay", "paraguaio", "paraguaia", "paraguayo", "paraguaya"],
  ["CL", "Chile", "chile", "chileno", "chilena"],
  ["PE", "Peru", "peru", "peruano", "peruana"],
  ["BO", "Bolívia", "bolivia", "boliviano", "boliviana"],
  ["CO", "Colômbia", "colombia", "colombiano", "colombiana"],
  ["VE", "Venezuela", "venezuela", "venezuelano", "venezuelana", "venezolano", "venezolana"],
  ["EC", "Equador", "equador", "ecuador", "equatoriano", "equatoriana", "ecuatoriano", "ecuatoriana"],
  ["MX", "México", "mexico", "mexicano", "mexicana"],
  ["CU", "Cuba", "cuba", "cubano", "cubana"],
  ["HT", "Haiti", "haiti", "haitiano", "haitiana"],
  ["US", "Estados Unidos", "estados unidos", "eua", "usa", "united states", "americano", "americana", "norte-americano", "norte-americana", "norte americano", "norte americana", "estadunidense"],
  ["CA", "Canadá", "canada", "canadense", "canadian"],
  ["PT", "Portugal", "portugal", "portugues", "portuguesa"],
  ["ES", "Espanha", "espanha", "spain", "espana", "espanhol", "espanhola"],
  ["FR", "França", "franca", "france", "frances", "francesa"],
  ["DE", "Alemanha", "alemanha", "germany", "deutschland", "alemao", "alema", "german"],
  ["IT", "Itália", "italia", "italy", "italiano", "italiana"],
  ["GB", "Reino Unido", "reino unido", "inglaterra", "uk", "united kingdom", "ingles", "inglesa", "britanico", "britanica", "british"],
  ["IE", "Irlanda", "irlanda", "ireland", "irlandes", "irlandesa"],
  ["NL", "Países Baixos", "paises baixos", "holanda", "netherlands", "holandes", "holandesa"],
  ["BE", "Bélgica", "belgica", "belgium", "belga"],
  ["CH", "Suíça", "suica", "switzerland", "suico", "suica"],
  ["AT", "Áustria", "austria", "austriaco", "austriaca"],
  ["SE", "Suécia", "suecia", "sweden", "sueco", "sueca"],
  ["NO", "Noruega", "noruega", "norway", "noruegues", "norueguesa"],
  ["DK", "Dinamarca", "dinamarca", "denmark", "dinamarques", "dinamarquesa"],
  ["FI", "Finlândia", "finlandia", "finland", "finlandes", "finlandesa"],
  ["PL", "Polônia", "polonia", "poland", "polones", "polonesa"],
  ["CZ", "República Tcheca", "republica tcheca", "tchequia", "tcheco", "tcheca"],
  ["HU", "Hungria", "hungria", "hungary", "hungaro", "hungara"],
  ["RO", "Romênia", "romenia", "romania", "romeno", "romena"],
  ["GR", "Grécia", "grecia", "greece", "grego", "grega"],
  ["UA", "Ucrânia", "ucrania", "ukraine", "ucraniano", "ucraniana"],
  ["RU", "Rússia", "russia", "russo", "russa"],
  ["TR", "Turquia", "turquia", "turkey", "turco", "turca"],
  ["IL", "Israel", "israel", "israelense", "israelita"],
  ["LB", "Líbano", "libano", "lebanon", "libanes", "libanesa"],
  ["JP", "Japão", "japao", "japan", "japones", "japonesa"],
  ["CN", "China", "china", "chines", "chinesa"],
  ["KR", "Coreia do Sul", "coreia do sul", "coreia", "south korea", "coreano", "coreana", "sul-coreano", "sul-coreana"],
  ["IN", "Índia", "india", "indiano", "indiana"],
  ["AU", "Austrália", "australia", "australiano", "australiana"],
  ["NZ", "Nova Zelândia", "nova zelandia", "new zealand", "neozelandes", "neozelandesa"],
  ["ZA", "África do Sul", "africa do sul", "south africa", "sul-africano", "sul-africana", "sul africano", "sul africana"],
  ["AO", "Angola", "angola", "angolano", "angolana"],
  ["MZ", "Moçambique", "mocambique", "mozambique", "mocambicano", "mocambicana"],
  ["CV", "Cabo Verde", "cabo verde", "cabo-verdiano", "cabo-verdiana", "cabo verdiano", "cabo verdiana"],
];

const BY_ALIAS = new Map<string, [string, string]>();
for (const [iso, label, ...aliases] of COUNTRIES) {
  for (const a of aliases) BY_ALIAS.set(norm(a), [iso, label]);
  BY_ALIAS.set(iso.toLowerCase(), [iso, label]);
}

export function labelForNationality(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const hit = COUNTRIES.find((c) => c[0] === iso.toUpperCase());
  return hit ? hit[1] : null;
}

/** "Alemã", "alemanha", "DE" → ["DE", "Alemanha"]; desconhecido → [null, texto]. */
export function resolveNationality(raw: string | null | undefined): {
  iso: string | null;
  label: string | null;
} {
  const s = String(raw || "").trim();
  if (!s) return { iso: null, label: null };
  const n = norm(s);
  const direct = BY_ALIAS.get(n);
  if (direct) return { iso: direct[0], label: direct[1] };
  // "alemã (passaporte)", "nacionalidade argentina"
  for (const token of n.split(" ")) {
    const hit = BY_ALIAS.get(token);
    if (hit && token.length > 2) return { iso: hit[0], label: hit[1] };
  }
  for (const [alias, hit] of BY_ALIAS) {
    if (alias.includes(" ") && n.includes(alias)) return { iso: hit[0], label: hit[1] };
  }
  return { iso: null, label: s.slice(0, 40) };
}

/** Linha que é só o país/gentílico ("COLOMBIANA", "Argentina") → ISO; senão null. */
export function bareNationalityIso(line: string | null | undefined): string | null {
  const n = norm(String(line || ""));
  if (!n || n.split(" ").length > 3) return null;
  return BY_ALIAS.get(n)?.[0] ?? null;
}

const NATIONALITY_LINE_RE =
  /^\s*(?:nacionalidade|nationality|nacionalidad)\s*[:\-–=.]?\s*(.+?)\s*$/im;
/** "Estrangeiro (argentino)", "estrangeira - alemã" */
const FOREIGNER_RE = /\bestrangeir[oa]\b\s*[:\-–(]?\s*([^\n)]*)/i;

const PASSPORT_RE =
  /\b(?:passaporte|passport|pasaporte|passap\.?)\s*(?:n[º°.]\s*|no\s+)?[:\-–=.]?\s*([A-Z0-9][A-Z0-9.\-]*(?:\s\d[\d.\-]*)?)/i;
const ID_RE =
  /\b(?:rg|idt|identidade|cedula(?:\s+de\s+identidade)?|cédula(?:\s+de\s+identidade)?|cie|rne|dni)\s*(?:n[º°.]\s*|no\s+)?[:\-–=.]?\s*([A-Z0-9][A-Z0-9.\-]*(?:\s\d[\d.\-]*)?)/i;

function cleanDocNumber(raw: string | undefined): string | null {
  const s = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (s.length < 5 || s.length > 20) return null;
  if (!/\d/.test(s)) return null;
  return s;
}

export function extractTravelDocument(text: string | null | undefined): TravelDocument {
  const src = String(text || "");
  let nationality: string | null = null;
  let nationalityLabel: string | null = null;

  const natLine = src.match(NATIONALITY_LINE_RE)?.[1];
  if (natLine?.trim()) {
    const r = resolveNationality(natLine);
    nationality = r.iso;
    nationalityLabel = r.label;
  } else {
    const foreigner = src.match(FOREIGNER_RE);
    if (foreigner) {
      const r = resolveNationality(foreigner[1]);
      // "estrangeiro" sem país reconhecível: marca, e o país fica para escolher à mão
      nationality = r.iso;
      nationalityLabel = r.iso ? r.label : "Estrangeiro";
    }
  }
  if (nationality === "BR") {
    nationality = null;
    nationalityLabel = null;
  }

  let documentType: TravelDocType | null = null;
  let documentNumber: string | null = null;
  const passport = cleanDocNumber(src.match(PASSPORT_RE)?.[1]);
  if (passport) {
    documentType = "PASSPORT";
    documentNumber = passport;
  } else {
    const id = cleanDocNumber(src.match(ID_RE)?.[1]);
    if (id) {
      documentType = "ID";
      documentNumber = id;
    }
  }

  return { nationality, nationalityLabel, documentType, documentNumber };
}

/** Estrangeiro = nacionalidade diferente de BR (ou "estrangeiro" sem país). */
export function isForeignPassenger(p: {
  nationality?: string | null;
  nationalityLabel?: string | null;
}) {
  if (p.nationality) return p.nationality.toUpperCase() !== "BR";
  return Boolean(p.nationalityLabel);
}

/** Linhas para o texto de passageiros (formatParsedPassengerText) — relidas pelo parser. */
export function formatTravelDocumentLines(p: Partial<TravelDocument>): string[] {
  const out: string[] = [];
  if (p.nationality && p.nationality !== "BR") {
    out.push(`Nacionalidade: ${labelForNationality(p.nationality) || p.nationality}`);
  } else if (p.nationalityLabel) {
    out.push(`Nacionalidade: ${p.nationalityLabel}`);
  }
  if (p.documentNumber) {
    out.push(
      `${p.documentType === "ID" ? "Identidade" : "Passaporte"}: ${p.documentNumber}`
    );
  }
  return out;
}
