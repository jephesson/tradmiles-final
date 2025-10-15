// src/components/ResponsavelImporter.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";
import { type Cedente } from "@/lib/storage";

/* =========================
   Tipos utilitários
========================= */
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

/* API response types */
type ApiOk = { ok: true; data?: unknown };
type ApiErr = { ok: false; error?: string };
type ApiResp = ApiOk | ApiErr;

/* =========================
   Utils
========================= */
function stripDiacritics(str: string) {
  return str
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
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
function keyName(str: string) {
  return stripDiacritics(str).toLowerCase().replace(/\s+/g, " ").trim();
}
function slugify(str: string) {
  return stripDiacritics(String(str))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function similarity(a: string, b: string) {
  const s1 = keyName(a), s2 = keyName(b);
  if (!s1 || !s2) return 0;
  const dist = levenshtein(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - dist / maxLen;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isCedenteArray(v: unknown): v is Cedente[] {
  return (
    Array.isArray(v) &&
    v.every((o) => {
      if (!isRecord(o)) return false;
      return typeof o.identificador === "string" && typeof o.nome_completo === "string";
    })
  );
}
function isApiErr(r: ApiResp): r is ApiErr {
  return (r as ApiErr).ok === false;
}

/* =========================
   Componente
========================= */
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

  // Cedentes já salvos no servidor
  const [listaCedentes, setListaCedentes] = useState<Cedente[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  /* ---------- Abrir arquivo ---------- */
  function parseWorkbook(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
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
    };
    reader.readAsArrayBuffer(file);
  }

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
  const respCols = useMemo(() => {
    const sh = sheets.find((s) => s.name === respCfg.sheet);
    if (!sh) return ["A"];
    const rows = sh.rows.slice(0, 32);
    const maxLen = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)), 1);
    return Array.from({ length: maxLen }, (_, i) => indexToColLetter(i));
  }, [sheets, respCfg.sheet]);

  function safeColumnValue(sheet: string, raw: string) {
    const v = (raw || "").toUpperCase();
    const sh = sheets.find((s) => s.name === sheet);
    if (!sh) return "";
    const rows = sh.rows.slice(0, 32);
    const maxLen = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)), 1);
    const cols = Array.from({ length: maxLen }, (_, i) => indexToColLetter(i));
    return cols.includes(v) ? v : "";
  }

  /* ---------- Carregar cedentes do servidor ---------- */
  async function loadFromServer() {
    try {
      const res = await fetch("/api/cedentes", { method: "GET" });
      const json: ApiResp = await res.json();
      if (isApiErr(json)) throw new Error(json.error ?? "Falha ao carregar");
      const data = isRecord(json.data) ? (json.data as Record<string, unknown>) : {};
      const listaRaw = data.listaCedentes;
      if (!isCedenteArray(listaRaw)) {
        alert("Nenhum dado salvo ainda.");
        return;
      }
      setListaCedentes(listaRaw);
      setIsLoaded(true);
      alert(`Carregado ${listaRaw.length} cedentes.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      alert(`Erro ao carregar: ${msg}`);
    }
  }

  /* ---------- Aplicar responsáveis ---------- */
  function applyResponsaveis() {
    const sh = sheets.find((s) => s.name === respCfg.sheet);
    if (!sh) {
      alert("Selecione a aba que contém Cedente e Responsável.");
      return;
    }
    const colCed = safeColumnValue(respCfg.sheet, respCfg.colCedente);
    const colResp = safeColumnValue(respCfg.sheet, respCfg.colResp);
    if (!colCed || !colResp) {
      alert("Verifique as colunas de Cedente e Responsável.");
      return;
    }

    const idxCed = colLetterToIndex(colCed);
    const idxResp = colLetterToIndex(colResp);

    const mapResp = new Map<string, string>();
    const cedentesInSheet: Array<{ key: string; raw: string; resp: string }> = [];

    for (const row of sh.rows) {
      const r = Array.isArray(row) ? row : [];
      const cedRaw = r[idxCed];
      const respRaw = r[idxResp];

      const cedStr = typeof cedRaw === "string" ? cedRaw.trim() : String(cedRaw ?? "").trim();
      const respStr = typeof respRaw === "string" ? respRaw.trim() : String(respRaw ?? "").trim();
      if (!cedStr) continue;
      if (!respStr) continue;

      const k = keyName(cedStr);
      cedentesInSheet.push({ key: k, raw: cedStr, resp: respStr });
      mapResp.set(k, respStr);
    }

    let matched = 0, notFound = 0;

    const updated = listaCedentes.map((c) => {
      const keysDoCedente = [keyName(c.identificador), keyName(c.nome_completo)];
      let respRef: string | undefined;

      for (const k of keysDoCedente) {
        const hit = mapResp.get(k);
        if (hit) { respRef = hit; break; }
      }

      if (!respRef && respCfg.approximate && cedentesInSheet.length) {
        let best: { resp: string; score: number } | null = null;
        for (const cand of cedentesInSheet) {
          const s1 = similarity(cand.key, keysDoCedente[0]);
          const s2 = similarity(cand.key, keysDoCedente[1]);
          const sc = Math.max(s1, s2);
          if (!best || sc > best.score) best = { resp: cand.resp, score: sc };
        }
        if (best && best.score >= 0.9) respRef = best.resp;
      }

      if (respRef) {
        matched++;
        return { ...c, responsavelNome: toTitleCase(respRef), responsavelId: slugify(respRef) };
      }

      notFound++;
      return c;
    });

    setListaCedentes(updated);
    setRespCfg((prev) => ({ ...prev, stats: { matched, notFound } }));
  }

  /* ---------- Salvar ---------- */
  async function saveToServer() {
    if (!listaCedentes.length) {
      alert("Nada para salvar. Carregue os cedentes primeiro.");
      return;
    }
    try {
      const res = await fetch("/api/cedentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listaCedentes }),
      });
      const json: ApiResp = await res.json();
      if (isApiErr(json)) throw new Error(json.error ?? "Falha ao salvar");
      alert("Salvo com sucesso ✅");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      alert(`Erro ao salvar: ${msg}`);
    }
  }

  /* ---------- UI ---------- */
  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Image src="/logo.png" alt="TradeMiles" width={48} height={48} />
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">TradeMiles • Responsáveis</h1>
      </div>

      <p className="mb-6 text-sm text-slate-600">
        Importe uma planilha contendo as colunas <b>Cedente</b> e <b>Responsável</b>. O sistema vai casar com os cedentes já salvos e atribuir o responsável.
      </p>

      {/* Ações topo */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={loadFromServer}
          className="rounded-xl bg-black px-4 py-2 text-white shadow-soft hover:bg-gray-800"
        >
          Carregar cedentes salvos
        </button>
        <span className="text-xs text-slate-600">
          {isLoaded ? `Lista carregada (${listaCedentes.length})` : "Nenhuma lista carregada ainda"}
        </span>
      </div>

      {/* Upload Excel */}
      <div className="mb-4 flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Arquivo Excel (com Cedente e Responsável)</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) parseWorkbook(f);
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

      {/* Config de responsáveis */}
      {sheets.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-slate-600">Aba</label>
              <select
                className="rounded-xl border px-3 py-2"
                value={respCfg.sheet}
                onChange={(e) => {
                  const v = e.currentTarget.value;
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
                onChange={(e) =>
                  setRespCfg((prev) => ({ ...prev, colCedente: safeColumnValue(prev.sheet, e.currentTarget.value) }))
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
                  setRespCfg((prev) => ({ ...prev, colResp: safeColumnValue(prev.sheet, e.currentTarget.value) }))
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

      {/* Resultado */}
      {listaCedentes.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Cedentes ({listaCedentes.length})</h2>
            <div className="flex gap-3">
              <button
                onClick={saveToServer}
                className="rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                disabled={!listaCedentes.length}
              >
                Salvar no servidor
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
                </tr>
              </thead>
              <tbody>
                {listaCedentes.map((r, idx) => (
                  <tr key={r.identificador} className="border-t border-slate-200">
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono">{r.identificador}</td>
                    <td className="px-3 py-2">{toTitleCase(r.nome_completo)}</td>
                    <td className="px-3 py-2">
                      {r.responsavelNome ? `${r.responsavelNome} (${r.responsavelId})` : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Dica: se muitos ficarem “não encontrados”, confira a aba/colunas e considere ativar a correspondência aproximada.
          </div>
        </div>
      )}
    </div>
  );
}
