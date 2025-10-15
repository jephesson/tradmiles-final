// src/components/ResponsavelImporter.tsx
"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";
import { type Cedente } from "@/lib/storage";
import { loadFuncionarios, type Funcionario } from "@/lib/staff";

/** ===== Types ===== */
type Cell = string | number | boolean | null | undefined;
type Row = Cell[];
type SheetData = { name: string; rows: Row[] };

type RespConfig = {
  sheet: string;
  colCedente: string;
  colResp: string;
  approximate: boolean;
  stats: { matched: number; notFound: number };
};

type ApiOk = { ok: true };
type ApiErr = { ok: false; error?: string };
type ApiLoadData = { listaCedentes?: unknown; savedAt?: unknown };
type ApiLoadResp = (ApiOk & { data?: unknown }) | ApiErr;

// Permite slug opcional
type Staff = Funcionario & { slug?: string };

/** ===== Utils (sem \p{…}) ===== */
function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function safeString(v: unknown) {
  return v == null ? "" : String(v);
}
function keyName(value: unknown) {
  const str = safeString(value);
  if (!str) return "";
  return stripDiacritics(str)
    .replace(/[^A-Za-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
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
  const s1 = keyName(a);
  const s2 = keyName(b);
  if (!s1 || !s2) return 0;
  const dist = levenshtein(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - dist / maxLen;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
// Aceita a lista mesmo que faltem campos; tratamos depois
function isCedenteArray(v: unknown): v is Cedente[] {
  return (
    Array.isArray(v) &&
    v.every((o) => {
      if (!isRecord(o)) return false;
      const hasAnyKey = "identificador" in o || "nome_completo" in o;
      return hasAnyKey;
    })
  );
}
function isStaff(v: unknown): v is Staff {
  return isRecord(v) && typeof v.id === "string" && typeof v.nome === "string";
}

/** ===== Component ===== */
export default function ResponsavelImporter() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Excel
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [respCfg, setRespCfg] = useState<RespConfig>({
    sheet: "",
    colCedente: "",
    colResp: "",
    approximate: true,
    stats: { matched: 0, notFound: 0 },
  });

  // Dados
  const [listaCedentes, setListaCedentes] = useState<Cedente[]>([]);
  const [funcionarios] = useState<Staff[]>(() => {
    const raw = loadFuncionarios();
    return Array.isArray(raw) ? raw.filter(isStaff).map((f) => ({ ...f })) : [];
  });

  /** ===== Coluna helpers ===== */
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
  function safeColumnValue(sheet: string, raw: string) {
    try {
      const v = (raw || "").toUpperCase();
      const cols = respColsFor(sheet);
      return cols.includes(v) ? v : "";
    } catch (e) {
      console.error("[ResponsavelImporter] safeColumnValue error:", e);
      return "";
    }
  }

  /** ===== Abrir arquivo ===== */
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
          setRespCfg({
            sheet: first,
            colCedente: "",
            colResp: "",
            approximate: true,
            stats: { matched: 0, notFound: 0 },
          });
        } catch (e) {
          console.error("[ResponsavelImporter] reader.onload error:", e);
          alert("Erro ao ler o Excel.");
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (e) {
      console.error("[ResponsavelImporter] parseWorkbook error:", e);
      alert("Erro ao abrir o arquivo.");
    }
  }

  /** ===== Carregar cedentes já salvos ===== */
  async function loadFromServer() {
    try {
      const res = await fetch("/api/cedentes", { method: "GET" });
      const json: ApiLoadResp = await res.json();

      if (!("ok" in json) || typeof json.ok !== "boolean") throw new Error("Resposta inválida do servidor");
      if (!json.ok) throw new Error((json as ApiErr).error || "Falha ao carregar");

      const data: ApiLoadData | undefined =
        isRecord(json) && isRecord((json as Record<string, unknown>).data)
          ? ((json as Record<string, unknown>).data as ApiLoadData)
          : undefined;

      const listaRaw = data?.listaCedentes;
      if (!isCedenteArray(listaRaw)) {
        alert("Nenhum dado salvo ainda.");
        return;
      }
      setListaCedentes(listaRaw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "desconhecido";
      console.error("[ResponsavelImporter] loadFromServer error:", e);
      alert(`Erro ao carregar: ${msg}`);
    }
  }

  /** ===== Aplicar responsáveis ===== */
  function applyResponsaveis() {
    try {
      const sh = sheets.find((s) => s.name === respCfg.sheet);
      if (!sh) {
        alert("Selecione uma aba válida.");
        return;
      }
      const colCed = safeColumnValue(respCfg.sheet, respCfg.colCedente);
      const colResp = safeColumnValue(respCfg.sheet, respCfg.colResp);
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
        const cedStr = safeString(r[idxCed]).trim();
        const respStr = safeString(r[idxResp]).trim();
        if (!cedStr || !respStr) continue;
        const k = keyName(cedStr);
        if (!k) continue; // ignora chaves vazias
        cedentesInSheet.push({ key: k, raw: cedStr, resp: respStr });
        mapResp.set(k, respStr);
      }

      function findFuncionario(ref: string): Staff | undefined {
        const raw = ref.trim();
        if (!raw) return undefined;

        const byId = funcionarios.find((f) => f.id.toLowerCase() === raw.toLowerCase());
        if (byId) return byId;

        const bySlug = funcionarios.find(
          (f) => typeof f.slug === "string" && f.slug.toLowerCase() === raw.toLowerCase(),
        );
        if (bySlug) return bySlug;

        const target = keyName(raw);
        const byName = funcionarios.find((f) => keyName(f.nome) === target);
        if (byName) return byName;

        if (!respCfg.approximate) return undefined;

        let best: { f: Staff; score: number } | null = null;
        for (const f of funcionarios) {
          const sc = similarity(f.nome, raw);
          if (!best || sc > best.score) best = { f, score: sc };
        }
        if (best && best.score >= 0.88) return best.f;
        return undefined;
      }

      let matched = 0, notFound = 0;

      const updated = listaCedentes.map((c) => {
        // sem any: destruturação com tipo seguro
        const { identificador, nome_completo }: { identificador?: unknown; nome_completo?: unknown } = c as unknown as {
          identificador?: unknown;
          nome_completo?: unknown;
        };

        const idKey = keyName(identificador);
        const nomeKey = keyName(nome_completo);
        const keysDoCedente = [idKey, nomeKey].filter(Boolean);

        let respRef: string | undefined;

        // correspondência exata
        for (const k of keysDoCedente) {
          const hit = mapResp.get(k);
          if (hit) {
            respRef = hit;
            break;
          }
        }

        // fallback aproximado
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
      alert(`Responsáveis aplicados: ${matched}. Não encontrados: ${notFound}.`);
    } catch (e) {
      console.error("[ResponsavelImporter] applyResponsaveis error:", e);
      alert("Erro ao aplicar responsáveis. Veja o console para detalhes.");
    }
  }

  /** ===== UI ===== */
  const respCols = useMemo(() => respColsFor(respCfg.sheet), [respColsFor, respCfg.sheet]);

  return (
    <div className="mx-auto max-w-6xl">
      <h2 className="mb-1 text-[13px] font-medium text-slate-700">Sincronizar responsáveis com cedentes</h2>
      <p className="mb-6 text-xs text-slate-500">
        Carregue o Excel com as colunas de <b>Cedente</b> e <b>Responsável</b>, aplique a correspondência e salve para
        atualizar os cedentes existentes.
      </p>

      <div className="mb-6 flex items-center gap-3">
        <Image src="/logo.png" alt="TradeMiles" width={40} height={40} />
        <h1 className="text-2xl font-bold">TradeMiles • Responsáveis</h1>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button onClick={loadFromServer} className="rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800">
          Carregar cedentes salvos
        </button>
        <span className="text-xs text-slate-500">
          {listaCedentes.length ? `${listaCedentes.length} registros carregados` : "Nenhuma lista carregada ainda"}
        </span>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Arquivo Excel (com Cedente e Responsável)</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            try {
              const f = e.currentTarget.files?.[0];
              if (f) parseWorkbook(f);
            } catch (err) {
              console.error("[ResponsavelImporter] onChange file error:", err);
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

      {sheets.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-slate-600">Aba</label>
              <select
                className="rounded-xl border px-3 py-2"
                value={respCfg.sheet}
                onChange={(e) =>
                  setRespCfg((prev) => ({
                    ...prev,
                    sheet: e.currentTarget.value,
                    colCedente: "",
                    colResp: "",
                    stats: { matched: 0, notFound: 0 },
                  }))
                }
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
                onChange={(e) =>
                  setRespCfg((prev) => ({
                    ...prev,
                    colCedente: safeColumnValue(prev.sheet, e.currentTarget.value),
                    stats: { matched: 0, notFound: 0 },
                  }))
                }
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
                onChange={(e) =>
                  setRespCfg((prev) => ({
                    ...prev,
                    colResp: safeColumnValue(prev.sheet, e.currentTarget.value),
                    stats: { matched: 0, notFound: 0 },
                  }))
                }
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
                onChange={(e) => setRespCfg((prev) => ({ ...prev, approximate: e.currentTarget.checked }))}
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
      )}
    </div>
  );
}
