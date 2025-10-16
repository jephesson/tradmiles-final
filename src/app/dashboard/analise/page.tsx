// src/app/dashboard/analise/page.tsx
"use client";

import { useEffect, useState } from "react";
import { type Cedente, loadCedentes } from "@/lib/storage";

/* ===========================================================
 *  Estoque de Pontos (BÁSICO) — mesma origem da tela Visualizar
 *  - GET /api/cedentes (data.listaCedentes)
 *  - Fallback: loadCedentes() do localStorage
 * =========================================================== */

type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";

type ApiOk = { ok: true; data?: unknown };
type ApiErr = { ok: false; error?: string };
type ApiResp = ApiOk | ApiErr;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
/** Converte string/number “à brasileira” para número */
function toNum(x: unknown): number {
  const s = String(x ?? 0).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Extrai listaCedentes de payloads variados (compatível com Visualizar) */
function pickListaCedentes(root: unknown): Cedente[] {
  const tryGet = (p: unknown): unknown[] => {
    if (!p) return [];
    if (Array.isArray(p)) return p;
    if (isObj(p)) {
      const candidates: unknown[] = [
        p["listaCedentes"],
        p["cedentes"],
        p["items"],
        p["lista"],
      ];
      const nested = isObj(p["data"])
        ? [
            (p["data"] as Record<string, unknown>)["listaCedentes"],
            (p["data"] as Record<string, unknown>)["cedentes"],
            (p["data"] as Record<string, unknown>)["items"],
            (p["data"] as Record<string, unknown>)["lista"],
          ]
        : [];
      for (const c of [...candidates, ...nested]) if (Array.isArray(c)) return c;
    }
    return [];
  };

  const arr = tryGet(root);
  return (Array.isArray(arr) ? (arr as Cedente[]) : []) ?? [];
}

/** Lê um campo de pontos do Cedente sem usar any */
function getPts(c: Cedente, k: ProgramKey): number {
  const record = c as unknown as Record<string, unknown>;
  return toNum(record[k]);
}

export default function AnaliseBasica() {
  const [tot, setTot] = useState<Record<ProgramKey, number>>({
    latam: 0,
    smiles: 0,
    livelo: 0,
    esfera: 0,
  });
  const [qtdCedentes, setQtdCedentes] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("-");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fonte, setFonte] = useState<"server" | "local" | "-">("-");

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      // 1) servidor (mesma rota do Visualizar)
      const res = await fetch(`/api/cedentes?ts=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });

      let lista: Cedente[] = [];
      if (res.ok) {
        const json: ApiResp | unknown = await res.json();
        const root = isObj(json) && "ok" in json ? (json as ApiOk).data : json;
        lista = pickListaCedentes(root);
      }

      // 2) fallback localStorage se vier vazio
      if (!lista?.length) {
        lista = loadCedentes();
        setFonte("local");
      } else {
        setFonte("server");
      }

      // Somatório simples por programa
      const totals = lista.reduce<Record<ProgramKey, number>>(
        (acc, c) => {
          acc.latam += getPts(c, "latam");
          acc.smiles += getPts(c, "smiles");
          acc.livelo += getPts(c, "livelo");
          acc.esfera += getPts(c, "esfera");
          return acc;
        },
        { latam: 0, smiles: 0, livelo: 0, esfera: 0 }
      );

      setTot(totals);
      setQtdCedentes(lista.length);
      setUpdatedAt(new Date().toLocaleString("pt-BR"));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();

    // Recarrega automaticamente quando a tela "Visualizar" salva
    function onStorage(e: StorageEvent) {
      if (e.key === "TM_CEDENTES_REFRESH") void carregar();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const totalGeral = tot.latam + tot.smiles + tot.livelo + tot.esfera;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Estoque de Pontos (Básico)</h1>
        <button
          onClick={carregar}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Recarregando..." : "Recarregar"}
        </button>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Erro: {erro}
        </div>
      )}

      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-medium mb-3">Pontos por Programa</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Programa</th>
                <th className="py-2 pr-4 text-right">Pontos</th>
              </tr>
            </thead>
            <tbody>
              <Row programa="LATAM" valor={tot.latam} />
              <Row programa="SMILES" valor={tot.smiles} />
              <Row programa="LIVELO" valor={tot.livelo} />
              <Row programa="ESFERA" valor={tot.esfera} />
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td className="py-2 pr-4 font-medium">Total</td>
                <td className="py-2 pr-4 text-right font-semibold">
                  {totalGeral.toLocaleString("pt-BR")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Última atualização: {updatedAt} • Cedentes: {qtdCedentes} • Fonte: {fonte}
        </div>
      </section>

      <section className="rounded-2xl border p-4">
        <div className="text-sm font-medium mb-2">Depuração rápida</div>
        <ul className="text-sm text-slate-700 space-y-1">
          <li>LATAM: {tot.latam.toLocaleString("pt-BR")} pts</li>
          <li>SMILES: {tot.smiles.toLocaleString("pt-BR")} pts</li>
          <li>LIVELO: {tot.livelo.toLocaleString("pt-BR")} pts</li>
          <li>ESFERA: {tot.esfera.toLocaleString("pt-BR")} pts</li>
          <li className="font-medium">TOTAL: {totalGeral.toLocaleString("pt-BR")} pts</li>
        </ul>
      </section>
    </div>
  );
}

function Row({ programa, valor }: { programa: string; valor: number }) {
  return (
    <tr className="border-b">
      <td className="py-2 pr-4">{programa}</td>
      <td className="py-2 pr-4 text-right">{valor.toLocaleString("pt-BR")}</td>
    </tr>
  );
}
