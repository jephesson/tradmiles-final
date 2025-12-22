"use client";

import Link from "next/link";
import { useMemo, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type PurchaseStatus = "OPEN" | "CLOSED" | "CANCELED";

type PurchaseRow = {
  id: string;
  status: PurchaseStatus;
  cedenteId: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  cedentePayCents: number;
  vendorCommissionBps: number;
  extraPoints: number;
  extraPointsCostCents: number;
  items: Array<{
    id: string;
    type: string;
    title: string;
    pointsBase: number;
    pointsFinal: number;
    amountCents: number;
    status: string;
  }>;
  cedente?: { id: string; nomeCompleto: string; cpf: string; identificador: string };
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR");
}

export default function PurchasesClient() {
  const search = useSearchParams();
  const cedenteId = search.get("cedenteId") || "";

  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = cedenteId ? `?cedenteId=${encodeURIComponent(cedenteId)}` : "";
      const r = await fetch(`/api/purchases${qs}`, { cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as PurchaseRow[];
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cedenteId]);

  const totalCusto = useMemo(() => {
    return rows.reduce((acc, p) => {
      const itemsSum = p.items?.reduce((a, it) => a + (it.amountCents || 0), 0) || 0;
      return acc + itemsSum + (p.extraPointsCostCents || 0) + (p.cedentePayCents || 0);
    }, 0);
  }, [rows]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Compras</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
            {cedenteId ? <>Filtrando por cedenteId: <b>{cedenteId}</b></> : "Sem filtro de cedente (últimas 100)."}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={load}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Atualizar
          </button>

          <Link
            href={cedenteId ? `/dashboard/purchases/new?cedenteId=${encodeURIComponent(cedenteId)}` : "/dashboard/purchases/new"}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              background: "black",
              color: "white",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            + Nova compra
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 14, borderRadius: 14, border: "1px solid rgba(0,0,0,.10)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div><b>{rows.length}</b> compras</div>
          <div>Total custo estimado (itens + extras + cedente): <b>{fmtMoneyBR(totalCusto)}</b></div>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#fff3f3", border: "1px solid #ffd0d0" }}>
          <b>Erro:</b> {err}
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: 16, opacity: 0.7 }}>Carregando…</div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {rows.map((p) => {
            const itemsSum = p.items?.reduce((a, it) => a + (it.amountCents || 0), 0) || 0;

            return (
              <div key={p.id} style={{ border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      <Link href={`/dashboard/purchases/${p.id}`} style={{ color: "black", textDecoration: "none" }}>
                        Compra #{p.id.slice(0, 8)}
                      </Link>
                      <span style={{ marginLeft: 10, padding: "4px 10px", borderRadius: 999, border: "1px solid rgba(0,0,0,.15)", fontSize: 12 }}>
                        {p.status}
                      </span>
                    </div>
                    <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
                      Criada em {fmtDateBR(p.createdAt)}
                      {p.cedente?.nomeCompleto ? <> • Cedente: <b>{p.cedente.nomeCompleto}</b></> : null}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{fmtMoneyBR(itemsSum)}</div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Soma dos itens</div>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {p.items?.slice(0, 4).map((it) => (
                    <div key={it.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, opacity: 0.95 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {it.title}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {it.type} • pontos: {it.pointsFinal || 0}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800 }}>{fmtMoneyBR(it.amountCents || 0)}</div>
                    </div>
                  ))}
                  {p.items?.length > 4 ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>+ {p.items.length - 4} itens</div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div style={{ opacity: 0.7, padding: 12 }}>Nenhuma compra encontrada.</div>
          )}
        </div>
      )}
    </div>
  );
}
