"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ClienteOrigem = "BALCAO_MILHAS" | "PARTICULAR" | "SITE" | "OUTROS";
type ClienteTipo = "PESSOA" | "EMPRESA";

type ClienteRow = {
  id: string;
  identificador: string;
  tipo: ClienteTipo;
  nome: string;
  cpfCnpj: string | null;
  telefone: string | null;
  origem: ClienteOrigem;
  origemDescricao: string | null;
  createdAt: string;
};

function dateBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function origemLabel(o: ClienteOrigem, desc?: string | null) {
  if (o === "BALCAO_MILHAS") return "Balcão de milhas";
  if (o === "PARTICULAR") return "Particular";
  if (o === "SITE") return "Site";
  return desc ? `Outros — ${desc}` : "Outros";
}

export default function ClientesClient() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ClienteRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (search.trim()) params.set("q", search.trim());

      const r = await fetch(`/api/clientes?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar clientes");
      setRows(j.data.clientes || []);
    } catch (e: any) {
      setRows([]);
      setError(e.message || "Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      load(q);
    }, 250);

    return () => clearTimeout(timer);
  }, [load, q]);

  const canExport = rows.length > 0;

  return (
    <div className="space-y-6">
      {/* Topbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-slate-600">
            Clientes são para quem você vende os pontos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => load(q)}
            disabled={loading}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>

          <a
            href="/api/clientes/export"
            aria-disabled={!canExport}
            className={[
              "rounded-xl border px-4 py-2 text-sm hover:bg-slate-50",
              !canExport ? "pointer-events-none opacity-50" : "",
            ].join(" ")}
          >
            Baixar XLS
          </a>

          <Link
            href="/dashboard/clientes/novo"
            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            + Novo cliente
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">Buscar</div>
          <div className="text-xs text-slate-500">
            {q.trim()
              ? `${rows.length} resultado(s)`
              : `Mostrando até ${rows.length} cliente(s) mais recentes`}
          </div>
        </div>

        <input
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome, CL00001, CPF/CNPJ, telefone..."
        />

        {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
        {!error && q.trim() && (
          <div className="mt-2 text-xs text-slate-500">
            Busca no banco inteiro por nome, ID, CPF/CNPJ ou telefone.
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-white p-4">
        {rows.length === 0 ? (
          <div className="text-sm text-slate-600">
            {q.trim() ? "Nenhum resultado para a busca." : "Nenhum cliente cadastrado ainda."}
          </div>
        ) : (
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">CPF/CNPJ</th>
                  <th className="px-3 py-2 text-left">Telefone</th>
                  <th className="px-3 py-2 text-left">Origem</th>
                  <th className="px-3 py-2 text-left">Criado em</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{c.identificador}</td>
                    <td className="px-3 py-2">{c.nome}</td>
                    <td className="px-3 py-2">
                      {c.tipo === "EMPRESA" ? "Empresa" : "Pessoa"}
                    </td>
                    <td className="px-3 py-2">{c.cpfCnpj || "-"}</td>
                    <td className="px-3 py-2">{c.telefone || "-"}</td>
                    <td className="px-3 py-2">
                      {origemLabel(c.origem, c.origemDescricao)}
                    </td>
                    <td className="px-3 py-2">{dateBR(c.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/dashboard/clientes/${c.id}/editar`}
                        className="inline-flex rounded-lg border px-3 py-1.5 text-xs hover:bg-white"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
