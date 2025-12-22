"use client";

import { useEffect, useMemo, useState } from "react";

type LoyaltyProgram = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type ItemStatus = "PENDING" | "RELEASED" | "CANCELED";
type ItemType = "CLUB" | "POINTS_BUY" | "TRANSFER" | "ADJUSTMENT" | "EXTRA_COST";
type TransferMode = "FULL_POINTS" | "POINTS_PLUS_CASH";

type Cedente = {
  id: string;
  nomeCompleto: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
};

type PurchaseItem = {
  id: string;
  type: ItemType;
  status: ItemStatus;

  title: string;
  details?: string | null;

  programFrom?: LoyaltyProgram | null;
  programTo?: LoyaltyProgram | null;

  pointsBase: number;
  pointsFinal: number;
  bonusMode?: string | null;
  bonusValue?: number | null;

  amountCents: number;
  transferMode?: TransferMode | null;
  pointsDebitedFromOrigin: number;

  createdAt: string;
};

type Purchase = {
  id: string;
  status: "OPEN" | "CLOSED" | "CANCELED";
  note?: string | null;
  cedente: { id: string; nomeCompleto: string };
  items: PurchaseItem[];
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

export default function CompraDetalheClient({ purchaseId }: { purchaseId: string }) {
  const [loading, setLoading] = useState(false);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [cedentePreview, setCedentePreview] = useState<Cedente | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/compras/${purchaseId}`, { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar compra.");
      setPurchase(j.data);

      // carrega cedente com pontos atuais para prévia
      const cId = j.data?.cedente?.id;
      if (cId) {
        const rc = await fetch(`/api/cedentes/${cId}`, { cache: "no-store" });
        const jc = await rc.json();
        if (jc?.ok) setCedentePreview(jc.data);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId]);

  async function liberarItem(itemId: string) {
    if (!confirm("Liberar este item? Isso vai atualizar os pontos do cedente.")) return;

    try {
      const r = await fetch(`/api/compras/${purchaseId}/itens/${itemId}/release`, {
        method: "POST",
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao liberar item.");

      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const totals = useMemo(() => {
    const items = purchase?.items || [];
    const totalCostCents = items.reduce((sum, it) => sum + (it.amountCents || 0), 0);

    const releasedPoints = {
      LATAM: 0,
      SMILES: 0,
      LIVELO: 0,
      ESFERA: 0,
    };

    for (const it of items) {
      if (it.status !== "RELEASED") continue;

      if (it.type === "POINTS_BUY") {
        if (it.programTo) releasedPoints[it.programTo] += it.pointsFinal > 0 ? it.pointsFinal : it.pointsBase;
      }

      if (it.type === "TRANSFER") {
        if (it.programTo) releasedPoints[it.programTo] += it.pointsFinal > 0 ? it.pointsFinal : it.pointsBase;
        if (it.programFrom) {
          const debit = it.transferMode === "POINTS_PLUS_CASH" ? it.pointsDebitedFromOrigin : it.pointsBase;
          releasedPoints[it.programFrom] -= debit;
        }
      }

      if (it.type === "ADJUSTMENT") {
        if (it.programTo) releasedPoints[it.programTo] += it.pointsBase; // pode ser negativo
      }
    }

    return { totalCostCents, releasedPoints };
  }, [purchase]);

  if (!purchase) {
    return (
      <div className="p-4">
        <div className="text-sm text-slate-600">{loading ? "Carregando..." : "Compra não carregada."}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Compra #{purchase.id}</h1>
          <p className="text-sm text-slate-600">
            Cedente: <b>{purchase.cedente.nomeCompleto}</b> • Status: <b>{purchase.status}</b>
          </p>
        </div>

        <button
          onClick={load}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* Prévia pontos atuais */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="font-semibold mb-2">Prévia de pontos (atual no sistema)</div>

        {cedentePreview ? (
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div>LATAM: <b>{fmtInt(cedentePreview.pontosLatam)}</b></div>
            <div>Smiles: <b>{fmtInt(cedentePreview.pontosSmiles)}</b></div>
            <div>Livelo: <b>{fmtInt(cedentePreview.pontosLivelo)}</b></div>
            <div>Esfera: <b>{fmtInt(cedentePreview.pontosEsfera)}</b></div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">Carregando pontos do cedente…</div>
        )}

        <div className="text-xs text-slate-500 mt-2">
          * Ao liberar um item, esses valores são atualizados automaticamente.
        </div>
      </div>

      {/* Totais do carrinho */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="font-semibold mb-2">Totais do carrinho</div>
        <div className="text-sm">
          Custo total (somatório dos itens): <b>{fmtMoneyBR(totals.totalCostCents)}</b>
        </div>
        <div className="text-xs text-slate-500 mt-2">
          Dica: depois colocamos “meta milheiro” e “projeção de lucro” aqui.
        </div>
      </div>

      {/* Itens */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold">Itens (carrinho)</div>

        {purchase.items.length === 0 ? (
          <div className="text-sm text-slate-600">Nenhum item adicionado ainda.</div>
        ) : (
          <div className="space-y-2">
            {purchase.items.map((it) => (
              <div key={it.id} className="rounded-xl border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{it.title}</div>
                  <div className="text-xs text-slate-600">
                    Tipo: <b>{it.type}</b> • Status:{" "}
                    <b className={it.status === "RELEASED" ? "text-green-700" : it.status === "CANCELED" ? "text-red-700" : ""}>
                      {it.status}
                    </b>
                  </div>

                  <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                    {it.type === "TRANSFER" ? (
                      <div>
                        {it.programFrom} → {it.programTo} • modo: <b>{it.transferMode}</b>
                      </div>
                    ) : null}

                    {(it.type === "POINTS_BUY" || it.type === "TRANSFER" || it.type === "ADJUSTMENT") ? (
                      <div>
                        Pontos base: <b>{fmtInt(it.pointsBase)}</b>{" "}
                        {it.pointsFinal ? (
                          <>
                            • Pontos final: <b>{fmtInt(it.pointsFinal)}</b>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {it.amountCents ? (
                      <div>
                        Valor: <b>{fmtMoneyBR(it.amountCents)}</b>
                      </div>
                    ) : null}

                    {it.details ? <div className="text-slate-500">{it.details}</div> : null}
                  </div>
                </div>

                <div className="shrink-0 flex flex-col gap-2">
                  {it.status === "PENDING" ? (
                    <button
                      onClick={() => liberarItem(it.id)}
                      className="rounded-xl bg-black px-3 py-2 text-white text-xs hover:bg-gray-800"
                    >
                      Liberar (atualiza pontos)
                    </button>
                  ) : (
                    <button
                      disabled
                      className="rounded-xl border px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
                    >
                      {it.status === "RELEASED" ? "Liberado" : "Cancelado"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-slate-500">
          Quando você clicar em “Liberar”, os pontos do cedente serão ajustados conforme o tipo do item.
        </div>
      </div>
    </div>
  );
}
