// src/app/dashboard/analise/page.tsx
"use client";

import { useEffect, useState } from "react";

/* ===========================================================
 *  TradeMiles – Análise (versão básica)
 *  Foco: Somatório de pontos por programa a partir de /api/cedentes
 * =========================================================== */

type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";

type ApiOk = { ok: true; data?: unknown };
type ApiErr = { ok: false; error?: string };
type ApiResp = ApiOk | ApiErr;

type CedenteMin = {
  latam?: number | string;
  smiles?: number | string;
  livelo?: number | string;
  esfera?: number | string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Converte "54.000" | "1,5" | 54000 -> number */
function toNum(x: unknown): number {
  const s = String(x ?? 0).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export default function AnaliseBasica() {
  const [estoque, setEstoque] = useState<Record<ProgramKey, number>>({
    latam: 0,
    smiles: 0,
    livelo: 0,
    esfera: 0,
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("-");
  const [erro, setErro] = useState<string | null>(null);
  const [qtdCedentes, setQtdCedentes] = useState(0);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/cedentes?ts=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });
      const json: ApiResp = await res.json();

      if (!("ok" in json) || !json.ok || !isRecord(json.data)) {
        const msg = "error" in (json as ApiErr) && (json as ApiErr).error
          ? (json as ApiErr).error
          : "Resposta inválida";
        throw new Error(msg);
      }

      const lista = (json.data as Record<string, unknown>).listaCedentes;
      if (!Array.isArray(lista)) {
        throw new Error("Campo data.listaCedentes ausente/inesperado");
      }

      const acc: Record<ProgramKey, number> = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
      for (const raw of lista as CedenteMin[]) {
        if (!isRecord(raw)) continue;
        acc.latam += toNum((raw as CedenteMin).latam);
        acc.smiles += toNum((raw as CedenteMin).smiles);
        acc.livelo += toNum((raw as CedenteMin).livelo);
        acc.esfera += toNum((raw as CedenteMin).esfera);
      }

      setEstoque(acc);
      setQtdCedentes(lista.length);
      setLastUpdated(new Date().toLocaleString("pt-BR"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro(msg || "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const totalGeral =
    estoque.latam + estoque.smiles + estoque.livelo + estoque.esfera;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Estoque de Pontos (Básico)</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={carregar}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Recarregando..." : "Recarregar"}
          </button>
        </div>
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
              <Row programa="LATAM" valor={estoque.latam} />
              <Row programa="SMILES" valor={estoque.smiles} />
              <Row programa="LIVELO" valor={estoque.livelo} />
              <Row programa="ESFERA" valor={estoque.esfera} />
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
          Última atualização: {lastUpdated} • Cedentes na soma: {qtdCedentes}
        </div>
      </section>

      <section className="rounded-2xl border p-4">
        <div className="text-sm font-medium mb-2">Depuração rápida</div>
        <ul className="text-sm text-slate-700 space-y-1">
          <li>LATAM: {estoque.latam.toLocaleString("pt-BR")} pts</li>
          <li>SMILES: {estoque.smiles.toLocaleString("pt-BR")} pts</li>
          <li>LIVELO: {estoque.livelo.toLocaleString("pt-BR")} pts</li>
          <li>ESFERA: {estoque.esfera.toLocaleString("pt-BR")} pts</li>
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
