// src/components/CedentesImporter.tsx
"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";
import { type Cedente } from "@/lib/storage";
import { loadFuncionarios, type Funcionario } from "@/lib/staff";

/* =========================
   Tipos utilitários
========================= */
type Cell = string | number | boolean | null | undefined;
type Row = Cell[];
type SheetData = { name: string; rows: Row[] };

type ProgramKey = "latam" | "esfera" | "livelo" | "smiles";
type ProgramConfig = {
  key: ProgramKey;
  label: string;
  sheet: string;
  colName: string;
  colPoints: string;
  stats: { matched: number; notFound: number };
};

type RespConfig = {
  sheet: string;
  colCedente: string; // coluna com o cedente (nome/ID) para casar
  colResp: string; // coluna com o responsável (id/slug/nome/login)
  approximate: boolean;
  stats: { matched: number; notFound: number };
};

/* API response types (sem any) */
type ApiOk = { ok: true };
type ApiErr = { ok: false; error?: string };
type ApiSaveResp = (ApiOk & { data?: unknown }) | ApiErr;
type ApiLoadData = { listaCedentes?: unknown; savedAt?: unknown };
type ApiLoadResp = (ApiOk & { data?: unknown }) | ApiErr;

/* Staff com campos extras opcionais (login/email/slug) */
type Staff = Funcionario & {
  slug?: string;
  login?: string;
  email?: string;
};

/* =========================
   Utils (sem \p{…})
========================= */
function stripDiacritics(str: string) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]+/g, "")
    .replace(/[^A-Za-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function toTitleCase(str: string) {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
function safeString(v: unknown) {
  return v == null ? "" : String(v);
}
function keyName(v: unknown) {
  const s = safeString(v);
  if (!s) return "";
  return stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();
}
function norm(s: string) {
  return stripDiacritics(s).toLowerCase().trim();
}
function cleanRespRef(raw: string) {
  // normaliza entradas da planilha: "@login", "login@dominio", "Nome (obs)" etc.
  let s = raw.trim();
  s = s.replace(/^@+/, "");
  s = s.replace(/\(.*?\)$/g, "").trim();
  if (s.includes("@")) s = s.split("@")[0];
  return s;
}
function firstName(full: string) {
  const t = (full || "").trim().split(/\s+/);
  return t[0] || "";
}
function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= n; j++) {
      const cost = ai === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function similarity(a: unknown, b: unknown) {
  const s1 = keyName(a),
    s2 = keyName(b);
  if (!s1 || !s2) return 0;
  const dist = levenshtein(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - dist / maxLen;
}
function makeIdentifier(name: string, index: number) {
  const cleaned = stripDiacritics(name).toUpperCase();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const base = (tokens[0] || "CED").replace(/[^A-Z0-9]/g, "");
  const prefix = (base.slice(0, 3) || "CED").padEnd(3, "X");
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}
function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Type guards básicos */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isCedenteArray(v: unknown): v is Cedente[] {
  return (
    Array.isArray(v) &&
    v.every((o) => isRecord(o) && typeof (o as Record<string, unknown>).nome_completo === "string")
  );
}
function isApiErr(v: unknown): v is ApiErr {
  return isRecord(v) && (v as Record<string, unknown>).ok === false;
}

/** Normaliza entradas numéricas e retorna pontos inteiros (≥ 0). */
function parsePoints(input: Cell): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number" && Number.isFinite(input)) return Math.max(0, Math.round(input));
  const raw = String(input).trim();
  if (!raw) return 0;

  let s = raw.replace(/\s+/g, "");
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
    const v = Number(s);
    return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  }
  if (!hasDot && hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length === 2) {
      const v = Number(parts[0] + "." + parts[1]);
      return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    }
    const v = Number(s.replace(/,/g, ""));
    return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  }
  if (hasDot && !hasComma) {
    if (/\.\d{3}(\.|$)/.test(s)) {
      const v = Number(s.replace(/\./g, ""));
      return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    }
    const v = Number(s);
    return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  }

  const onlyDigits = s.replace(/[^\d]/g, "");
  return onlyDigits ? Math.max(0, Math.round(Number(onlyDigits))) : 0;
}

/* =========================
   Componente
========================= */
export default function CedentesImporter() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Arquivo/Abas
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [namesSheet, setNamesSheet] = useState<string>("");

  // Etapa 1 — Nomes
  const [colNome, setColNome] = useState("A");
  const [threshold, setThreshold] = useState(0.9);
  const [dedupedNames, setDedupedNames] = useState<string[]>([]);
  const [listaCedentes, setListaCedentes] = useState<Cedente[]>([]);

  // Etapa 2 — Pontos por programa
  const [approximatePoints, setApproximatePoints] = useState(false);
  const [programs, setPrograms] = useState<ProgramConfig[]>([
    { key: "latam", label: "Latam", sheet: "", colName: "", colPoints: "", stats: { matched: 0, notFound: 0 } },
    { key: "esfera", label: "Esfera", sheet: "", colName: "", colPoints: "", stats: { matched: 0, notFound: 0 } },
    { key: "livelo", label: "Livelo", sheet: "", colName: "", colPoints: "", stats: { matched: 0, notFound: 0 } },
    { key: "smiles", label: "Smiles", sheet: "", colName: "", colPoints: "", stats: { matched: 0, notFound: 0 } },
  ]);

  // Etapa 3 — Responsáveis
  const [respCfg, setRespCfg] = useState<RespConfig>({
    sheet: "",
    colCedente: "",
    colResp: "",
    approximate: true,
    stats: { matched: 0, notFound: 0 },
  });

  // Funcionários locais
  const [funcionarios] = useState<Staff[]>(() => {
    try {
      const raw = loadFuncionarios();
      return Array.isArray(raw)
        ? raw.filter(
            (f): f is Staff =>
              isRecord(f) && typeof (f as Staff).id === "string" && typeof (f as Staff).nome === "string",
          )
        : [];
    } catch (e) {
      console.error("[CedentesImporter] loadFuncionarios error:", e);
      return [];
    }
  });

  /* ---------- Helpers de coluna ---------- */
  function colLetterToIndex(col: string) {
    if (!col) return 0;
    let idx = 0;
    const up = col.toUpperCase().replace(/[^A-Z]/g, "");
    for (let i = 0; i < up.length; i++) idx = idx * 26 + (up.charCodeAt(i) - 64);
    return Math.max(0, idx - 1);
  }
  function indexToColLetter(idx: number) {
    let s = "";
    idx = Math.max(0, idx) + 1;
    while (idx > 0) {
      const rem = (idx - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      idx = Math.floor((idx - 1) / 26);
    }
    return s || "A";
  }

  const respColsFor = useCallback(
    (sheetName: string) => {
      const sh = sheets.find((s) => s.name === sheetName);
      if (!sh) return ["A"];
      const rows = sh.rows.slice(0, 32);
      const maxLen = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)), 1);
      return Array.from({ length: maxLen }, (_, i) => indexToColLetter(i));
    },
    [sheets],
  );

  /* ---------- Abrir arquivo ---------- */
  function parseWorkbook(file: File) {
    try {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const buf = evt.target?.result;
          if (!(buf instanceof ArrayBuffer)) return;
          const data = new Uint8Array(buf);
          const wb = XLSX.read(data, { type: "array" });
          const parsed: SheetData[] = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as Row[];
            return { name, rows };
          });
          setSheets(parsed);

          const first = parsed[0]?.name || "";
          setNamesSheet(first);
          setColNome("A");
          setDedupedNames([]);
          setListaCedentes([]);

          setPrograms((prev) =>
            prev.map((p) => ({ ...p, sheet: first, colName: "", colPoints: "", stats: { matched: 0, notFound: 0 } })),
          );

          setRespCfg({
            sheet: first,
            colCedente: "",
            colResp: "",
            approximate: true,
            stats: { matched: 0, notFound: 0 },
          });
        } catch (e) {
          console.error("[CedentesImporter] reader.onload error:", e);
          alert("Erro ao ler o Excel.");
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (e) {
      console.error("[CedentesImporter] parseWorkbook error:", e);
      alert("Erro ao abrir o arquivo.");
    }
  }

  /* ---------- Options de colunas ---------- */
  const namesSheetObj = useMemo(() => sheets.find((s) => s.name === namesSheet), [sheets, namesSheet]);

  const availableColumnsOnNames = useMemo(() => {
    if (!namesSheetObj) return ["A"];
    const rows = namesSheetObj.rows.slice(0, 32);
    const maxLen = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)), 1);
    return Array.from({ length: maxLen }, (_, i) => indexToColLetter(i));
  }, [namesSheetObj]);

  function availableColumnsOn(sheetName: string) {
    const sh = sheets.find((s) => s.name === sheetName);
    if (!sh) return ["A"];
    const rows = sh.rows.slice(0, 32);
    const maxLen = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)), 1);
    return Array.from({ length: maxLen }, (_, i) => indexToColLetter(i));
  }

  const firstRowsPreview = useMemo(() => {
    if (!namesSheetObj) return [] as string[];
    const idx = colLetterToIndex(colNome);
    return namesSheetObj.rows.slice(0, 8).map((r) => {
      const cell = Array.isArray(r) ? r[idx] : undefined;
      return typeof cell === "string" ? cell : "";
    });
  }, [namesSheetObj, colNome]);

  /* ---------- Etapa 1 ---------- */
  function processNames() {
    if (!namesSheetObj) return;

    const idx = colLetterToIndex(colNome);
    const names: string[] = [];
    for (const row of namesSheetObj.rows) {
      const r = Array.isArray(row) ? row : [];
      const cell = r[idx];
      if (typeof cell === "string" && cell.trim()) names.push(toTitleCase(cell.trim()));
    }

    const cleaned = names
      .map((n) => toTitleCase(stripDiacritics(n)))
      .filter((n) => n && n.length > 1);
    const unique = Array.from(new Set(cleaned));
    const deduped: string[] = [];
    for (const name of unique) {
      const isDup = deduped.some((n) => similarity(n, name) >= threshold);
      if (!isDup) deduped.push(name);
    }
    deduped.sort((a, b) => a.localeCompare(b, "pt-BR"));
    setDedupedNames(deduped);

    const base: Cedente[] = deduped.map((n, i) => ({
      identificador: makeIdentifier(n, i),
      nome_completo: toTitleCase(n),
      latam: 0,
      esfera: 0,
      livelo: 0,
      smiles: 0,
      responsavelId: "",
      responsavelNome: "",
    }));
    setListaCedentes(base);

    setPrograms((prev) => prev.map((p) => ({ ...p, stats: { matched: 0, notFound: 0 } })));
    setRespCfg((prev) => ({ ...prev, stats: { matched: 0, notFound: 0 } }));
  }

  /* ---------- Etapa 2 ---------- */
  function applyPointsForProgram(p: ProgramConfig) {
    const sheetObj = sheets.find((s) => s.name === p.sheet);
    if (!sheetObj || !p.colName || !p.colPoints) return;

    const nameIdx = colLetterToIndex(p.colName);
    const pointsIdx = colLetterToIndex(p.colPoints);

    const mapExact = new Map<string, number>();
    const namesInSheet: Array<{ orig: string; key: string }> = [];

    for (const row of sheetObj.rows) {
      const r = Array.isArray(row) ? row : [];
      const n = r[nameIdx];
      if (typeof n !== "string" || !n.trim()) continue;
      const key = keyName(n);
      namesInSheet.push({ orig: n, key });
      const pts = parsePoints(r[pointsIdx]);
      mapExact.set(key, (mapExact.get(key) ?? 0) + pts);
    }

    const base = listaCedentes.map((c) => ({ ...c, [p.key]: 0 })) as Cedente[];

    let matched = 0,
      notFound = 0;

    const updated = base.map((c) => {
      const k = keyName(c.nome_completo);
      let val = mapExact.get(k);

      if (val == null && approximatePoints && namesInSheet.length) {
        let best: { idx: number; score: number } | null = null;
        for (let i = 0; i < namesInSheet.length; i++) {
          const cand = namesInSheet[i];
          const sc = similarity(cand.key, k);
          if (!best || sc > best.score) best = { idx: i, score: sc };
        }
        if (best && best.score >= 0.9) {
          const chosen = namesInSheet[best.idx];
          val = mapExact.get(chosen.key);
        }
      }

      if (val != null) {
        matched++;
        return { ...c, [p.key]: val } as Cedente;
      } else {
        notFound++;
        return c;
      }
    });

    setListaCedentes(updated);
    setPrograms((prev) =>
      prev.map((cfg) => (cfg.key === p.key ? { ...cfg, stats: { matched, notFound } } : cfg)),
    );
  }

  /* ---------- Etapa 3 — Responsáveis ---------- */
  function applyResponsaveis() {
    try {
      const sh = sheets.find((s) => s.name === respCfg.sheet);
      if (!sh) {
        alert("Selecione uma aba válida.");
        return;
      }
      const colCed = respColsFor(respCfg.sheet).includes(respCfg.colCedente.toUpperCase())
        ? respCfg.colCedente.toUpperCase()
        : "";
      const colResp = respColsFor(respCfg.sheet).includes(respCfg.colResp.toUpperCase())
        ? respCfg.colResp.toUpperCase()
        : "";

      if (!colCed || !colResp) {
        alert("Escolha as colunas de Cedente e Responsável.");
        return;
      }

      const idxCed = colLetterToIndex(colCed);
      const idxResp = colLetterToIndex(colResp);

      const mapResp = new Map<string, string>();
      const cedentesInSheet: Array<{ key: string; raw: string; resp: string }> = [];

      for (const row of sh.rows) {
        const r = Array.isArray(row) ? row : [];
        theLoop: {
          const cedStr = safeString(r[idxCed]).trim();
          const respStr = safeString(r[idxResp]).trim();
          if (!cedStr || !respStr) break theLoop;
          const k = keyName(cedStr);
          if (!k) break theLoop;
          cedentesInSheet.push({ key: k, raw: cedStr, resp: respStr });
          mapResp.set(k, respStr);
        }
      }

      // ===== NOVO findFuncionario aceita login/primeiro nome/email =====
      function findFuncionario(ref: string): Staff | undefined {
        const raw = (ref || "").trim();
        if (!raw) return undefined;

        const cleaned = cleanRespRef(raw);
        const targetMain = norm(cleaned);
        const targetFirst = norm(firstName(cleaned));

        // Match exato por vários campos
        const exact =
          funcionarios.find((f) => norm(f.id) === targetMain) ||
          funcionarios.find((f) => typeof f.slug === "string" && norm(f.slug) === targetMain) ||
          funcionarios.find((f) => typeof f.login === "string" && norm(f.login) === targetMain) ||
          funcionarios.find((f) => norm(firstName(f.nome)) === targetMain) ||
          funcionarios.find((f) => norm(f.nome) === targetMain) ||
          funcionarios.find(
            (f) => typeof f.email === "string" && norm(f.email.split("@")[0]) === targetMain,
          ) ||
          // também aceite quando a célula tem só o primeiro nome
          funcionarios.find((f) => norm(firstName(f.nome)) === targetFirst);

        if (exact) return exact;

        if (!respCfg.approximate) return undefined;

        // Aproximação: considera login/primeiro nome/nome completo/etc.
        let best: { f: Staff; score: number } | null = null;
        for (const f of funcionarios) {
          const candidates = [
            f.nome,
            firstName(f.nome),
            f.login ?? "",
            f.slug ?? "",
            typeof f.email === "string" ? f.email.split("@")[0] : "",
            f.id,
          ].filter(Boolean);
          const score = Math.max(...candidates.map((c) => similarity(c, cleaned)));
          if (!best || score > best.score) best = { f, score };
        }
        if (best && best.score >= 0.86) return best.f;
        return undefined;
      }

      let matched = 0,
        notFound = 0;

      const updated = listaCedentes.map((c) => {
        const idKey = keyName(c.identificador);
        const nomeKey = keyName(c.nome_completo);
        const keysDoCedente = [idKey, nomeKey].filter(Boolean);

        let respRef: string | undefined;

        for (const k of keysDoCedente) {
          const hit = mapResp.get(k);
          if (hit) {
            respRef = hit;
            break;
          }
        }

        if (!respRef && respCfg.approximate && cedentesInSheet.length && keysDoCedente.length) {
          let best: { resp: string; score: number } | null = null;
          for (const cand of cedentesInSheet) {
            const sc = Math.max(...keysDoCedente.map((k) => similarity(cand.key, k)));
            if (!best || sc > best.score) best = { resp: cand.resp, score: sc };
          }
          if (best && best.score >= 0.9) respRef = best.resp;
        }

        if (respRef) {
          const f = findFuncionario(respRef);
          if (f) {
            matched++;
            return { ...c, responsavelId: f.id, responsavelNome: f.nome };
          }
        }
        notFound++;
        return c;
      });

      setListaCedentes(updated);
      setRespCfg((prev) => ({ ...prev, stats: { matched, notFound } }));

      // log de apoio (apenas no console)
      if (notFound > 0) {
        const exemplos = updated
          .filter((c) => !c.responsavelId)
          .slice(0, 10)
          .map((c) => ({ cedente: c.nome_completo, id: c.identificador }));
        console.table(exemplos);
      }

      alert(`Responsáveis aplicados: ${matched}. Não encontrados: ${notFound}.`);
    } catch (e) {
      console.error("[CedentesImporter] applyResponsaveis error:", e);
      alert("Erro ao aplicar responsáveis. Veja o console para detalhes.");
    }
  }

  /* ---------- Persistência ---------- */
  async function saveToServer() {
    if (!listaCedentes.length) {
      alert("Nada para salvar. Gere a lista primeiro.");
      return;
    }
    try {
      const res = await fetch("/api/cedentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listaCedentes,
          meta: {
            fileName,
            namesSheet,
            colNome,
            threshold,
            approximatePoints,
            programs: programs.map((p) => ({
              key: p.key,
              sheet: p.sheet,
              colName: p.colName,
              colPoints: p.colPoints,
            })),
            responsaveis: {
              sheet: respCfg.sheet,
              colCedente: respCfg.colCedente,
              colResp: respCfg.colResp,
              approximate: respCfg.approximate,
            },
          },
        }),
      });

      const json: ApiSaveResp = await res.json();
      if (!("ok" in json) || typeof json.ok !== "boolean") throw new Error("Resposta inválida do servidor");
      if (isApiErr(json)) throw new Error(typeof json.error === "string" ? json.error : "Falha ao salvar");

      alert("Salvo com sucesso ✅");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      alert(`Erro ao salvar: ${msg}`);
    }
  }

  async function loadFromServer() {
    try {
      const res = await fetch("/api/cedentes", { method: "GET" });
      const json: ApiLoadResp = await res.json();

      if (!("ok" in json) || typeof json.ok !== "boolean") throw new Error("Resposta inválida do servidor");
      if (isApiErr(json)) throw new Error(typeof json.error === "string" ? json.error : "Falha ao carregar");

      const dataAny = (json as ApiOk & { data?: unknown }).data;
      const data: ApiLoadData | undefined = isRecord(dataAny) ? (dataAny as ApiLoadData) : undefined;

      const listaRaw = data?.listaCedentes;
      const savedAtRaw = data?.savedAt;

      if (!isCedenteArray(listaRaw)) {
        alert("Nenhum dado salvo ainda.");
        return;
      }

      setListaCedentes(listaRaw as Cedente[]);
      setDedupedNames((listaRaw as Cedente[]).map((c) => c.nome_completo));

      const savedAt = typeof savedAtRaw === "string" ? savedAtRaw : undefined;
      alert(`Carregado ${(listaRaw as Cedente[]).length} cedentes${savedAt ? ` (salvo em ${savedAt})` : ""}.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      alert(`Erro ao carregar: ${msg}`);
    }
  }

  /* ---------- Export ---------- */
  function exportCSV() {
    if (!listaCedentes.length) return;
    const header =
      "identificador;nome_completo;latam;esfera;livelo;smiles;responsavel_id;responsavel_nome\n";
    const lines = listaCedentes.map(
      (r) =>
        `${r.identificador};${r.nome_completo};${r.latam};${r.esfera};${r.livelo};${r.smiles};${
          r.responsavelId || ""
        };${r.responsavelNome || ""}`,
    );
    download("cedentes_importados.csv", header + lines.join("\n"));
  }
  function exportJSON() {
    if (!listaCedentes.length) return;
    download("cedentes_importados.json", JSON.stringify(listaCedentes, null, 2));
  }

  /* ---------- UI ---------- */
  const respCols = useMemo(() => respColsFor(respCfg.sheet), [respCfg.sheet, respColsFor]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Image src="/logo.png" alt="TradeMiles" width={48} height={48} />
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">TradeMiles • Cedentes</h1>
      </div>

      <p className="mb-6 text-sm text-slate-600">
        Etapa 1: importe os nomes e gere IDs. Etapa 2: para <b>cada programa</b> (Latam, Esfera, Livelo,
        Smiles), selecione a <b>aba</b> e as colunas de <b>Nome</b> e <b>Pontos</b>. Etapa 3: aplique os{" "}
        <b>responsáveis</b>.
      </p>

      {/* Upload */}
      <div className="mb-4 flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Arquivo Excel</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            try {
              const f = e.currentTarget?.files?.[0];
              if (f) parseWorkbook(f);
            } catch (err) {
              console.error("[CedentesImporter] onChange file error:", err);
              alert("Falha ao ler o arquivo.");
            }
          }}
          style={{ display: "none" }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-offset-2"
          >
            Escolher arquivo
          </button>
          <span className="text-sm text-slate-700">{fileName || "Nenhum arquivo escolhido"}</span>
          <span className="text-xs text-slate-500">Aceita .xlsx ou .xls</span>
        </div>
      </div>

      {/* ETAPA 1 — Nomes */}
      {sheets.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-lg font-semibold">Etapa 1 — Nomes</h2>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-slate-600">Aba dos Nomes</label>
              <select
                className="rounded-xl border px-3 py-2"
                value={namesSheet}
                onChange={(e) => setNamesSheet(e.currentTarget?.value ?? "")}
              >
                {sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-slate-600">Coluna com os Nomes</label>
              <select
                className="rounded-xl border px-3 py-2"
                value={colNome}
                onChange={(e) => setColNome(e.currentTarget?.value ?? "A")}
              >
                {availableColumnsOnNames.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-slate-600">
                Similaridade (≥) p/ deduplicar nomes
              </label>
              <input
                type="range"
                min={0.7}
                max={0.98}
                step={0.01}
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.currentTarget?.value ?? "0.9"))}
              />
              <div className="text-xs text-slate-600">{Math.round(threshold * 100)}%</div>
            </div>
          </div>

          {firstRowsPreview.length > 0 && (
            <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="mb-2 font-medium">Prévia (primeiras linhas da coluna de nomes)</div>
              <ul className="list-disc space-y-1 pl-6">
                {firstRowsPreview.map((v, i) => (
                  <li key={i} className="text-slate-700">
                    {v || <span className="text-slate-400">(vazio)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={processNames}
            className="mb-6 rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800"
          >
            Processar nomes e gerar IDs
          </button>
        </>
      )}

      {/* ETAPA 2 — PONTOS POR PROGRAMA */}
      {dedupedNames.length > 0 && sheets.length > 0 && (
        <>
          <div className="mt-2 mb-3 flex items-center gap-3">
            <h2 className="text-lg font-semibold">Etapa 2 — Importar Pontos por Programa</h2>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={approximatePoints}
                onChange={(e) => setApproximatePoints(e.currentTarget?.checked ?? false)}
              />
              Usar correspondência aproximada (≥ 90%)
            </label>
          </div>

          <div className="grid gap-4">
            {programs.map((p, idx) => {
              const cols = availableColumnsOn(p.sheet);
              return (
                <div key={p.key} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-base font-medium">{p.label}</div>
                    {p.stats.matched + p.stats.notFound > 0 && (
                      <div className="text-xs text-slate-600">
                        Casados: <b>{p.stats.matched}</b> • Não encontrados: <b>{p.stats.notFound}</b>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="flex flex-col">
                      <label className="mb-1 text-xs font-medium text-slate-600">Aba</label>
                      <select
                        className="rounded-xl border px-3 py-2"
                        value={p.sheet}
                        onChange={(e) => {
                          const v = e.currentTarget?.value ?? "";
                          setPrograms((prev) =>
                            prev.map((cfg, i) =>
                              i === idx
                                ? { ...cfg, sheet: v, colName: "", colPoints: "", stats: { matched: 0, notFound: 0 } }
                                : cfg,
                            ),
                          );
                        }}
                      >
                        {sheets.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col">
                      <label className="mb-1 text-xs font-medium text-slate-600">Coluna do Nome</label>
                      <select
                        className="rounded-xl border px-3 py-2"
                        value={p.colName}
                        onChange={(e) => {
                          const v = e.currentTarget?.value ?? "";
                          setPrograms((prev) =>
                            prev.map((cfg, i) => (i === idx ? { ...cfg, colName: v } : cfg)),
                          );
                        }}
                      >
                        <option value="">Selecione…</option>
                        {cols.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col">
                      <label className="mb-1 text-xs font-medium text-slate-600">Coluna dos Pontos</label>
                      <select
                        className="rounded-xl border px-3 py-2"
                        value={p.colPoints}
                        onChange={(e) => {
                          const v = e.currentTarget?.value ?? "";
                          setPrograms((prev) =>
                            prev.map((cfg, i) => (i === idx ? { ...cfg, colPoints: v } : cfg)),
                          );
                        }}
                      >
                        <option value="">Selecione…</option>
                        {cols.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        onClick={() => applyPointsForProgram(p)}
                        className="rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800 disabled:opacity-50"
                        disabled={!p.sheet || !p.colName || !p.colPoints}
                      >
                        Aplicar {p.label}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ETAPA 3 — RESPONSÁVEIS */}
      {listaCedentes.length > 0 && sheets.length > 0 && (
        <>
          <h2 className="mt-6 mb-3 text-lg font-semibold">Etapa 3 — Atribuir Responsáveis</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <div className="flex flex-col">
                <label className="mb-1 text-xs font-medium text-slate-600">Aba</label>
                <select
                  className="rounded-xl border px-3 py-2"
                  value={respCfg.sheet}
                  onChange={(e) => {
                    const v = e.currentTarget?.value ?? "";
                    setRespCfg((prev) => ({
                      ...prev,
                      sheet: v,
                      colCedente: "",
                      colResp: "",
                      stats: { matched: 0, notFound: 0 },
                    }));
                  }}
                >
                  {sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="mb-1 text-xs font-medium text-slate-600">Coluna do Cedente</label>
                <select
                  className="rounded-xl border px-3 py-2"
                  value={respCfg.colCedente}
                  onChange={(e) => {
                    const v = e.currentTarget?.value ?? "";
                    setRespCfg((prev) => ({ ...prev, colCedente: v.toUpperCase(), stats: { matched: 0, notFound: 0 } }));
                  }}
                >
                  <option value="">Selecione…</option>
                  {respCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="mb-1 text-xs font-medium text-slate-600">Coluna do Responsável</label>
                <select
                  className="rounded-xl border px-3 py-2"
                  value={respCfg.colResp}
                  onChange={(e) => {
                    const v = e.currentTarget?.value ?? "";
                    setRespCfg((prev) => ({ ...prev, colResp: v.toUpperCase(), stats: { matched: 0, notFound: 0 } }));
                  }}
                >
                  <option value="">Selecione…</option>
                  {respCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <label className="mt-6 flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={respCfg.approximate}
                  onChange={(e) =>
                    setRespCfg((prev) => ({ ...prev, approximate: e.currentTarget?.checked ?? true }))
                  }
                />
                Usar correspondência aproximada
              </label>

              <div className="flex items-end">
                <button
                  onClick={applyResponsaveis}
                  className="w-full rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800 disabled:opacity-50"
                  disabled={!respCfg.sheet || !respCfg.colCedente || !respCfg.colResp || !listaCedentes.length}
                >
                  Aplicar responsáveis
                </button>
              </div>
            </div>

            {respCfg.stats.matched + respCfg.stats.notFound > 0 && (
              <div className="mt-3 text-xs text-slate-600">
                Atribuídos: <b>{respCfg.stats.matched}</b> • Não encontrados: <b>{respCfg.stats.notFound}</b>
              </div>
            )}
          </div>
        </>
      )}

      {/* Resultado final */}
      {listaCedentes.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Resultado ({listaCedentes.length} cedentes)</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={saveToServer}
                className="rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                disabled={!listaCedentes.length}
              >
                Salvar no servidor
              </button>
              <button
                onClick={loadFromServer}
                className="rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800"
              >
                Carregar último
              </button>
              <button
                onClick={exportCSV}
                className="rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                disabled={!listaCedentes.length}
              >
                Exportar CSV
              </button>
              <button
                onClick={exportJSON}
                className="rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                disabled={!listaCedentes.length}
              >
                Exportar JSON
              </button>
            </div>
          </div>

          <div className="max-h-[460px] overflow-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Nome completo</th>
                  <th className="px-3 py-2 font-medium">Responsável</th>
                  <th className="px-3 py-2 font-medium text-right">Latam</th>
                  <th className="px-3 py-2 font-medium text-right">Esfera</th>
                  <th className="px-3 py-2 font-medium text-right">Livelo</th>
                  <th className="px-3 py-2 font-medium text-right">Smiles</th>
                </tr>
              </thead>
              <tbody>
                {listaCedentes.map((r, idx) => (
                  <tr key={r.identificador} className="border-t border-slate-200">
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono">{r.identificador}</td>
                    <td className="px-3 py-2">{toTitleCase(r.nome_completo)}</td>
                    <td className="px-3 py-2">
                      {r.responsavelNome ? (
                        `${r.responsavelNome} (${r.responsavelId})`
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{(r.latam ?? 0).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right">{(r.esfera ?? 0).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right">{(r.livelo ?? 0).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right">{(r.smiles ?? 0).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 text-xs text-slate-500">
        Dica: se um programa estiver com muitos “não encontrados”, confira as colunas e a aba. Se os nomes variam
        muito, ative a correspondência aproximada.
      </div>
    </div>
  );
}
