"use client";

import { useEffect, useMemo, useState } from "react";

type Cedente = {
  id: string;
  nomeCompleto: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
};

type Item = {
  id: string;
  type: string;
  title: string;
  amountCents: number;
  status: string;
};

type Purchase = {
  id: string;
  status: string;
  cedente: { id: string; nomeCompleto: string };
  items: Item[];
};

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function num(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

export default function CompraClient({ purchaseId }: { purchaseId: string }) {
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [cedente, setCedente] = useState<Cedente | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/compras/${purchaseId}`, { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j.error);
      setPurchase(j.data);

      const rc = await fetch(`/api/cedentes/${j.data.cedente.id}`, {
        cache: "no-store",
      });
      const jc = await rc.json();
      if (jc?.ok) setCedente(jc.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [purchaseId]);

  const totalCost = useMemo(() => {
    return (
      purchase?.items.reduce((s, it) => s + (it.amountCents || 0), 0) || 0
    );
  }, [purchase]);

  if (!purchase) {
    return <div className="p-4">{loading ? "Carregando…" : "Não carregado"}</div>;
  }

  return (
    <div className="max-w-4xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Compra #{purchase.id}</h1>
        <p className="text-sm text-slate-600">
          Cedente: <b>{purchase.cedente.nomeCompleto}</b> • Status:{" "}
          <b>{purchase.status}</b>
        </p>
      </div>

      <div className="rounded-xl border p-4">
        <div className="font-semibold mb-2">Pontos atuais</div>
        {cedente ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>LATAM: <b>{num(cedente.pontosLatam)}</b></div>
            <div>Smiles: <b>{num(cedente.pontosSmiles)}</b></div>
            <div>Livelo: <b>{num(cedente.pontosLivelo)}</b></div>
            <div>Esfera: <b>{num(cedente.pontosEsfera)}</b></div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">Carregando pontos…</div>
        )}
      </div>

      <div className="rounded-xl border p-4">
        <div className="font-semibold mb-2">Carrinho</div>

        {purchase.items.length === 0 ? (
          <div className="text-sm text-slate-500">Sem itens.</div>
        ) : (
          <div className="space-y-2">
            {purchase.items.map((it) => (
              <div key={it.id} className="flex justify-between text-sm">
                <div>{it.title}</div>
                <div>{money(it.amountCents)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4">
        <div className="font-semibold">Totais</div>
        <div className="text-sm mt-1">
          Custo total: <b>{money(totalCost)}</b>
        </div>
      </div>

      <button
        onClick={load}
        disabled={loading}
        className="rounded-xl border px-4 py-2 text-sm"
      >
        Atualizar
      </button>
    </div>
  );
}
    