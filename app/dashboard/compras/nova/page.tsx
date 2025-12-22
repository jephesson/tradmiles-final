"use client";

import { useEffect, useMemo, useState } from "react";

type Cedente = {
  id: string;
  nomeCompleto: string;
};

export default function NovaCompraPage() {
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/cedentes/approved", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setCedentes(j.data);
      });
  }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return cedentes
      .filter((c) => c.nomeCompleto.toLowerCase().includes(s))
      .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
  }, [cedentes, q]);

  async function criarCompra(cedenteId: string) {
    setLoading(true);
    try {
      // 1) cria compra
      const r = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedenteId }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j.error);

      const purchaseId = j.data.id;

      // 2) cria custo fixo: pagamento cedente (R$ 50)
      await fetch(`/api/compras/${purchaseId}/itens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "EXTRA_COST",
          title: "Pagamento ao cedente",
          amountCents: 5000,
          details: "Valor padrão inicial",
        }),
      });

      // 3) cria custo fixo: comissão 1%
      await fetch(`/api/compras/${purchaseId}/itens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "EXTRA_COST",
          title: "Comissão vendedores (1%)",
          amountCents: 0, // calculado depois
          details: "1% do valor total da compra",
        }),
      });

      // 4) abre a compra
      window.location.href = `/dashboard/compras/${purchaseId}`;
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Nova compra</h1>

      <input
        className="w-full rounded-xl border px-3 py-2"
        placeholder="Buscar cedente..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="rounded-xl border divide-y max-h-80 overflow-auto">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => criarCompra(c.id)}
            disabled={loading}
            className="w-full text-left px-4 py-3 hover:bg-slate-50"
          >
            {c.nomeCompleto}
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500">
            Nenhum cedente encontrado.
          </div>
        )}
      </div>

      {loading && <div className="text-sm text-slate-500">Criando compra…</div>}
    </div>
  );
}
