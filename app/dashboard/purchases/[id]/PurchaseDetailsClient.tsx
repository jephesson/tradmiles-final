"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type PurchaseStatus = "OPEN" | "CLOSED" | "CANCELED";

type Purchase = {
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
  cedente?: { id: string; nomeCompleto: string; cpf: string; identificador: string };
  items: Array<{
    id: string;
    type: string;
    status: string;
    title: string;
    details: string | null;
    programFrom: string | null;
    programTo: string | null;
    pointsBase: number;
    bonusMode: string | null;
    bonusValue: number | null;
    pointsFinal: number;
    amountCents: number;
    transferMode: string | null;
    pointsDebitedFromOrigin: number;
    createdAt: string;
  }>;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR");
}

export default function PurchaseDetailsClient() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [data, setData] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/purchases/${id}`, { cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      const j = (await r.json()) as Purchase;
      setData(j);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sums = useMemo(() => {
    if (!data) return { itemsCents: 0, totalCents: 0, pointsFinalSum: 0 };
    const itemsCents = data.items.reduce((a, it) => a + (it.amountCents || 0), 0);
    const totalCents = itemsCents + (data.extraPointsCostCents || 0) + (data.cedentePayCents || 0);
    const pointsFinalSum = data.items.reduce((a, it) => a + (it.pointsFinal || 0), 0);
    return { itemsCents, totalCents, pointsFinalSum };
  }, [data]);

  async function patchStatus(status: PurchaseStatus) {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/purchases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error(await r.text());
      await load();
    } catch (e: any) {
      setErr(e?.message || "Erro ao atualizar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Detalhe da Compra</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>ID: <b>{id}</b></p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => router.back()}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.12)", background: "white", cursor: "pointer", fontWeight: 800 }}
          >
            Voltar
          </button>
          <button
            onClick={load}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.12)", background: "white", cursor: "pointer", fontWeight: 800 }}
          >
            Atualizar
          </button>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#fff3f3", border: "1px solid #ffd0d0" }}>
          <b>Erro:</b> {err}
        </div>
      )}

      {loading || !data ? (
        <div style={{ marginTop: 16, opacity: 0.7 }}>Carregando…</div>
      ) : (
        <>
          <div style={{ marginTop: 16, border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 900 }}>
                  Status:{" "}
                  <span style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid rgba(0,0,0,.15)", fontSize: 12 }}>
                    {data.status}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                  Criada em {fmtDateBR(data.createdAt)} • Atualizada {fmtDateBR(data.updatedAt)}
                </div>
                {data.cedente?.nomeCompleto ? (
                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
                    Cedente: <b>{data.cedente.nomeCompleto}</b> ({data.cedente.identificador})
                  </div>
                ) : null}
              </div>

              <div style={{ textAlign: "right" }}>
                <div>Total: <b>{fmtMoneyBR(sums.totalCents)}</b></div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>itens + extras + cedente</div>
                <div style={{ marginTop: 8 }}>Pontos finais (soma): <b>{sums.pointsFinalSum.toLocaleString("pt-BR")}</b></div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                disabled={saving}
                onClick={() => patchStatus("OPEN")}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.12)", background: "white", cursor: "pointer", fontWeight: 900, opacity: saving ? 0.6 : 1 }}
              >
                Marcar OPEN
              </button>
              <button
                disabled={saving}
                onClick={() => patchStatus("CLOSED")}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.12)", background: "black", color: "white", cursor: "pointer", fontWeight: 900, opacity: saving ? 0.6 : 1 }}
              >
                Marcar CLOSED
              </button>
              <button
                disabled={saving}
                onClick={() => patchStatus("CANCELED")}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.12)", background: "#fff", cursor: "pointer", fontWeight: 900, opacity: saving ? 0.6 : 1 }}
              >
                Cancelar
              </button>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            {data.items.map((it) => (
              <div key={it.id} style={{ border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{it.title}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      {it.type} • status {it.status} • {fmtDateBR(it.createdAt)}
                    </div>
                    {it.details ? <div style={{ marginTop: 6, opacity: 0.85 }}>{it.details}</div> : null}
                    {(it.programFrom || it.programTo) ? (
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                        {it.programFrom ? <>De <b>{it.programFrom}</b> </> : null}
                        {it.programTo ? <>para <b>{it.programTo}</b></> : null}
                        {it.transferMode ? <> • {it.transferMode}</> : null}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{fmtMoneyBR(it.amountCents)}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      pointsBase {it.pointsBase.toLocaleString("pt-BR")} • pointsFinal <b>{it.pointsFinal.toLocaleString("pt-BR")}</b>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
