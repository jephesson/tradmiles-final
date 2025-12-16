"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  nomeCompleto: string;
  cpf: string;
  emailCriado: string | null;
  createdAt: string;
};

export default function CedentesPendentesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/cedentes/pendentes", { cache: "no-store" });
    const json = await res.json();
    setItems(json?.data?.items || []);
    setLoading(false);
  }

  async function review(id: string, action: "APPROVE" | "REJECT") {
    const res = await fetch(`/api/cedentes/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (!json?.ok) return alert(json?.error || "Erro ao revisar");
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="mb-4 text-2xl font-bold">Cedentes pendentes</h1>

      {loading && <div>Carregando...</div>}

      {!loading && items.length === 0 && (
        <div className="rounded-xl border p-4 text-sm text-slate-600">Nenhum pendente 🎉</div>
      )}

      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="rounded-xl border p-4">
            <div className="font-semibold">{c.nomeCompleto}</div>
            <div className="text-sm text-slate-600">
              CPF: {c.cpf} · Email: {c.emailCriado ?? "-"} · Criado em {new Date(c.createdAt).toLocaleString()}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => review(c.id, "APPROVE")}
                className="rounded-xl bg-black px-3 py-2 text-sm text-white hover:bg-slate-900"
              >
                Aprovar
              </button>
              <button
                onClick={() => review(c.id, "REJECT")}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
              >
                Reprovar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
