// src/app/dashboard/analise/page.tsx
"use client";

import { useEffect, useState } from "react";

/* ===========================================================
 *  Estoque de Pontos (BÁSICO)
 *  - Soma LATAM/SMILES/LIVELO/ESFERA em qualquer formato de JSON
 *  - Sem dependências, sem gráficos, só o total correto
 * =========================================================== */

type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";

type ApiOk = { ok: true; data?: unknown };
type ApiErr = { ok: false; error?: string };
type ApiResp = ApiOk | ApiErr;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Converte "54.000" | "1,5" | 54000 -> number seguro */
function toNum(x: unknown): number {
  const s = String(x ?? 0).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Walker recursivo: soma campos com nomes de programas em *qualquer* nível */
function sumPrograms(payload: unknown) {
  const totals: Record<ProgramKey, number> = {
    latam: 0,
    smiles: 0,
    livelo: 0,
    esfera: 0,
  };

  // contagem de "cedentes": objetos que possuem ao menos 1 dos campos-programa
  let cedentesCount = 0;

  function walk(node: unknown) {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (isRecord(node)) {
      // Se este objeto tiver algum dos campos-programa, conta como um cedente
      let hasProgramField = false;

      for (const [k, v] of Object.entries(node)) {
        const key = k.toLowerCase() as ProgramKey;

        if (key === "latam" || key === "smiles" || key === "livelo" || key === "esfera") {
          totals[key] += toNum(v);
          hasProgramField = true;
        }

        // Recurse também em valores que sejam objetos/arrays (pode haver nesting)
        if (typeof v === "object" && v !== null) {
          walk(v);
        }
      }

      if (hasProgramField) cedentesCount += 1;
    }
  }

  walk(payload);
  return { totals, cedentesCount };
}

export default function EstoqueBasico() {
  const [tot, setTot] = useState<Record<ProgramKey, number>>({
    latam: 0,
    smiles: 0,
    livelo: 0,
    esfera: 0,
  });
  const [totalGeral, setTotalGeral] = useState(0);
  const [cedentes, setCedentes] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string>("-");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/cedentes?ts=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });
      const json: ApiResp | unknown = await res.json();

      // payload pode ser { ok:true, data }, ou outra coisa
      let root: unknown = json;
      if (isRecord(json) && "ok" in json) {
        const r = json as ApiResp;
        if (!r.ok) throw new Error((r as ApiErr).error || "ok=false");
        root = (r as ApiOk).data;
      }

      const { totals, cedentesCount } = sumPrograms(root);

      const geral = totals.latam + totals.smiles + totals.livelo + totals.esfera;

      setTot(totals);
      setTotalGeral(geral);
      setCedentes(cedentesCount);
      setUpdatedAt(new Date().toLocaleString("pt-BR"));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();

    // Se outra tela salvar, podemos reagir via localStorage (opcional)
    function onStorage(ev: StorageEvent) {
      if (ev.key === "TM_CEDENTES" || ev.key === "TM_CEDENTES_REFRESH") {
        void carregar();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
        <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">
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

        <div className="text-xs text-slate-500 mt-3">
          Última atualização: {updatedAt} • Cedentes detectados: {cedentes}
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
