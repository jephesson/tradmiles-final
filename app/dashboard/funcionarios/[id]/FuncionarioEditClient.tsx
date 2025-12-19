"use client";

import { useEffect, useMemo, useState } from "react";

type FuncItem = {
  id: string;
  name: string;
  login: string;
  cpf: string | null;
  team: string;
  role: string;
  inviteCode: string | null;
  createdAt: string;
  _count?: { cedentes: number };
};

function baseUrl() {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function FuncionarioEditClient({ id }: { id: string }) {
  const [item, setItem] = useState<FuncItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const appBase = useMemo(() => baseUrl(), []);

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/funcionarios", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao carregar.");

      const found = (json.data || []).find((x: FuncItem) => x.id === id);
      if (!found) throw new Error("Funcionário não encontrado.");
      setItem(found);
    } catch (e: any) {
      setMsg(e?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const inviteUrl = item?.inviteCode ? `${appBase}/convite/${item.inviteCode}` : "";

  async function gerarOuRegenerarLink() {
    if (!item) return;
    setMsg("");
    try {
      const res = await fetch(`/api/funcionarios/${item.id}/invite`, {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao gerar convite.");

      const code = String(json.code || "");
      setItem({ ...item, inviteCode: code }); // ✅ atualiza na hora
      setMsg("✅ Link gerado/regenerado com sucesso.");
    } catch (e: any) {
      setMsg(e?.message || "Erro");
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Editar funcionário</h1>
          <p className="text-sm text-slate-600">Gere o link de indicação aqui.</p>
        </div>
        <a href="/dashboard/funcionarios" className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">
          Voltar
        </a>
      </div>

      {loading && <p className="text-sm text-slate-600">Carregando...</p>}
      {!loading && msg && <p className="text-sm">{msg}</p>}

      {!loading && item && (
        <div className="rounded-2xl border p-4 space-y-4 max-w-2xl">
          <div>
            <div className="text-lg font-semibold">{item.name}</div>
            <div className="text-sm text-slate-600">
              Login: <span className="font-medium">{item.login}</span> • Time:{" "}
              <span className="font-medium">{item.team}</span> • CPF:{" "}
              <span className="font-medium">{item.cpf || "-"}</span>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Link de indicação</div>
                <div className="text-xs text-slate-500">Clique para gerar ou regenerar.</div>
              </div>

              <button onClick={gerarOuRegenerarLink} className="rounded-xl bg-black px-4 py-2 text-white">
                {item.inviteCode ? "Regenerar link" : "Gerar link"}
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <input className="w-full rounded-xl border px-3 py-2 text-xs" value={inviteUrl || "—"} readOnly />
              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
                disabled={!inviteUrl}
                onClick={() => {
                  if (!inviteUrl) return;
                  navigator.clipboard.writeText(inviteUrl);
                  alert("Link copiado!");
                }}
              >
                Copiar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
