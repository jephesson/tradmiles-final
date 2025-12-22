"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LoyaltyProgram = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type PurchaseItemType = "CLUB" | "POINTS_BUY" | "TRANSFER" | "ADJUSTMENT" | "EXTRA_COST";
type TransferMode = "FULL_POINTS" | "POINTS_PLUS_CASH";
type BonusMode = "PERCENT" | "TOTAL" | "";

type DraftItem = {
  type: PurchaseItemType;
  title: string;
  details: string;

  programFrom: LoyaltyProgram | "";
  programTo: LoyaltyProgram | "";

  pointsBase: number;
  bonusMode: BonusMode;
  bonusValue: number;

  amountCents: number;

  transferMode: TransferMode | "";
  pointsDebitedFromOrigin: number;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function clampInt(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.trunc(v);
}

function computePointsFinal(it: DraftItem) {
  const base = Math.max(0, clampInt(it.pointsBase));
  const mode = it.bonusMode || "";
  const bonus = Math.max(0, clampInt(it.bonusValue));

  if (!mode || bonus <= 0) return base;
  if (mode === "PERCENT") return base + Math.floor((base * bonus) / 100);
  return base + bonus; // TOTAL
}

function defaultItem(): DraftItem {
  return {
    type: "POINTS_BUY",
    title: "",
    details: "",
    programFrom: "",
    programTo: "",
    pointsBase: 0,
    bonusMode: "",
    bonusValue: 0,
    amountCents: 0,
    transferMode: "",
    pointsDebitedFromOrigin: 0,
  };
}

export default function NewPurchaseClient() {
  const router = useRouter();
  const search = useSearchParams();
  const cedenteIdFromUrl = search.get("cedenteId") || "";

  const [cedenteId, setCedenteId] = useState(cedenteIdFromUrl);
  const [note, setNote] = useState("");

  const [cedentePayCents, setCedentePayCents] = useState(0);
  const [vendorCommissionBps, setVendorCommissionBps] = useState(100);
  const [extraPoints, setExtraPoints] = useState(0);
  const [extraPointsCostCents, setExtraPointsCostCents] = useState(0);

  const [items, setItems] = useState<DraftItem[]>([defaultItem()]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totals = useMemo(() => {
    const itemsCents = items.reduce((a, it) => a + Math.max(0, clampInt(it.amountCents)), 0);
    const total = itemsCents + Math.max(0, clampInt(extraPointsCostCents)) + Math.max(0, clampInt(cedentePayCents));
    const pointsFinalSum = items.reduce((a, it) => a + computePointsFinal(it), 0);
    return { itemsCents, total, pointsFinalSum };
  }, [items, extraPointsCostCents, cedentePayCents]);

  function setItem(idx: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, defaultItem()]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function validateClient() {
    if (!cedenteId.trim()) return "cedenteId é obrigatório (cole o ID do cedente).";

    if (!items.length) return "Adicione pelo menos 1 item.";

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.title.trim()) return `Item #${i + 1}: título é obrigatório.`;

      if (it.type === "TRANSFER") {
        if (!it.programFrom) return `Item #${i + 1}: TRANSFER precisa programFrom.`;
        if (!it.programTo) return `Item #${i + 1}: TRANSFER precisa programTo.`;
        if (!it.transferMode) return `Item #${i + 1}: TRANSFER precisa transferMode.`;
        if (clampInt(it.pointsBase) <= 0) return `Item #${i + 1}: TRANSFER precisa pointsBase > 0.`;

        if (it.transferMode === "POINTS_PLUS_CASH" && clampInt(it.pointsDebitedFromOrigin) <= 0) {
          return `Item #${i + 1}: POINTS_PLUS_CASH precisa pointsDebitedFromOrigin > 0.`;
        }
      }

      if (it.type === "POINTS_BUY" && clampInt(it.pointsBase) <= 0) {
        return `Item #${i + 1}: POINTS_BUY precisa pointsBase > 0.`;
      }

      if (it.type === "CLUB" && clampInt(it.amountCents) <= 0) {
        return `Item #${i + 1}: CLUB precisa amountCents > 0.`;
      }

      if (it.type === "EXTRA_COST" && clampInt(it.amountCents) <= 0) {
        return `Item #${i + 1}: EXTRA_COST precisa amountCents > 0.`;
      }
    }

    return null;
  }

  async function save() {
    setErr(null);
    const v = validateClient();
    if (v) return setErr(v);

    setSaving(true);
    try {
      const payload = {
        cedenteId: cedenteId.trim(),
        cedentePayCents: clampInt(cedentePayCents),
        vendorCommissionBps: clampInt(vendorCommissionBps),
        extraPoints: clampInt(extraPoints),
        extraPointsCostCents: clampInt(extraPointsCostCents),
        note: note.trim() ? note.trim() : null,
        items: items.map((it) => ({
          type: it.type,
          title: it.title.trim(),
          details: it.details.trim() ? it.details.trim() : null,
          programFrom: it.programFrom || null,
          programTo: it.programTo || null,
          pointsBase: clampInt(it.pointsBase),
          bonusMode: it.bonusMode ? it.bonusMode : null,
          bonusValue: it.bonusMode ? clampInt(it.bonusValue) : null,
          amountCents: clampInt(it.amountCents),
          transferMode: it.transferMode || null,
          pointsDebitedFromOrigin: clampInt(it.pointsDebitedFromOrigin),
        })),
      };

      const r = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error(await r.text());
      const created = await r.json();

      router.push(`/dashboard/purchases/${created.id}`);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Nova Compra</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
            Crie a compra e seus itens (clube, compra de pontos, transferência, custos).
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => router.push(cedenteId ? `/dashboard/purchases?cedenteId=${encodeURIComponent(cedenteId)}` : "/dashboard/purchases")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Voltar
          </button>

          <button
            disabled={saving}
            onClick={save}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              background: saving ? "rgba(0,0,0,.4)" : "black",
              color: "white",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            {saving ? "Salvando..." : "Salvar compra"}
          </button>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#fff3f3", border: "1px solid #ffd0d0" }}>
          <b>Erro:</b> {err}
        </div>
      )}

      {/* Cabeçalho */}
      <div style={{ marginTop: 16, border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Cedente ID</label>
            <input
              value={cedenteId}
              onChange={(e) => setCedenteId(e.target.value)}
              placeholder="Cole o ID do cedente (UUID)"
              style={{
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,.15)",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Nota</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Opcional"
              style={{
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,.15)",
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <FieldMoney label="Pagamento ao cedente (R$)" cents={cedentePayCents} setCents={setCedentePayCents} />
          <FieldInt label="Comissão vendedor (bps)" value={vendorCommissionBps} setValue={setVendorCommissionBps} />
          <FieldInt label="Pontos extras" value={extraPoints} setValue={setExtraPoints} />
          <FieldMoney label="Custo pontos extras (R$)" cents={extraPointsCostCents} setCents={setExtraPointsCostCents} />
        </div>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed rgba(0,0,0,.18)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>Itens: <b>{items.length}</b> • Soma pontos finais (preview): <b>{totals.pointsFinalSum.toLocaleString("pt-BR")}</b></div>
          <div>Total custo (itens + extras + cedente): <b>{fmtMoneyBR(totals.total)}</b></div>
        </div>
      </div>

      {/* Itens */}
      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {items.map((it, idx) => {
          const pointsFinal = computePointsFinal(it);

          return (
            <div key={idx} style={{ border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>Item #{idx + 1}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    pointsFinal (preview): <b>{pointsFinal.toLocaleString("pt-BR")}</b>
                  </div>
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(idx)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,.12)",
                        background: "white",
                        cursor: "pointer",
                        fontWeight: 800,
                      }}
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Tipo</label>
                  <select
                    value={it.type}
                    onChange={(e) => setItem(idx, { type: e.target.value as PurchaseItemType })}
                    style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.15)" }}
                  >
                    <option value="POINTS_BUY">POINTS_BUY (Compra de pontos)</option>
                    <option value="TRANSFER">TRANSFER (Transferência)</option>
                    <option value="CLUB">CLUB (Assinatura)</option>
                    <option value="EXTRA_COST">EXTRA_COST (Custo extra)</option>
                    <option value="ADJUSTMENT">ADJUSTMENT (Ajuste)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Título</label>
                  <input
                    value={it.title}
                    onChange={(e) => setItem(idx, { title: e.target.value })}
                    placeholder='Ex: "Compra Smiles 100k + 30%"'
                    style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.15)" }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Detalhes (opcional)</label>
                <input
                  value={it.details}
                  onChange={(e) => setItem(idx, { details: e.target.value })}
                  placeholder="Opcional"
                  style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.15)" }}
                />
              </div>

              {/* Campos por tipo */}
              {it.type === "TRANSFER" && (
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                  <FieldProgram label="De" value={it.programFrom} setValue={(v) => setItem(idx, { programFrom: v })} />
                  <FieldProgram label="Para" value={it.programTo} setValue={(v) => setItem(idx, { programTo: v })} />

                  <div>
                    <label style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>TransferMode</label>
                    <select
                      value={it.transferMode}
                      onChange={(e) => setItem(idx, { transferMode: e.target.value as any })}
                      style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.15)" }}
                    >
                      <option value="">Selecione</option>
                      <option value="FULL_POINTS">FULL_POINTS</option>
                      <option value="POINTS_PLUS_CASH">POINTS_PLUS_CASH</option>
                    </select>
                  </div>

                  <FieldInt
                    label="Pontos debitados do origem"
                    value={it.pointsDebitedFromOrigin}
                    setValue={(v) => setItem(idx, { pointsDebitedFromOrigin: v })}
                    disabled={it.transferMode !== "POINTS_PLUS_CASH"}
                  />
                </div>
              )}

              {/* Bloco de pontos + bônus (serve p/ POINTS_BUY, TRANSFER, ADJUSTMENT) */}
              {(it.type === "POINTS_BUY" || it.type === "TRANSFER" || it.type === "ADJUSTMENT") && (
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <FieldInt label="pointsBase" value={it.pointsBase} setValue={(v) => setItem(idx, { pointsBase: v })} />

                  <div>
                    <label style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>bonusMode</label>
                    <select
                      value={it.bonusMode}
                      onChange={(e) => setItem(idx, { bonusMode: e.target.value as BonusMode })}
                      style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.15)" }}
                    >
                      <option value="">Sem bônus</option>
                      <option value="PERCENT">PERCENT</option>
                      <option value="TOTAL">TOTAL</option>
                    </select>
                  </div>

                  <FieldInt
                    label={it.bonusMode === "PERCENT" ? "bonusValue (%)" : "bonusValue (pontos)"}
                    value={it.bonusValue}
                    setValue={(v) => setItem(idx, { bonusValue: v })}
                    disabled={!it.bonusMode}
                  />
                </div>
              )}

              {/* dinheiro */}
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FieldMoney label="amountCents (R$)" cents={it.amountCents} setCents={(v) => setItem(idx, { amountCents: v })} />
                <div style={{ padding: "10px 12px", borderRadius: 12, border: "1px dashed rgba(0,0,0,.18)" }}>
                  <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Preview</div>
                  <div style={{ marginTop: 6, fontWeight: 900 }}>
                    {fmtMoneyBR(Math.max(0, clampInt(it.amountCents)))} • pointsFinal {pointsFinal.toLocaleString("pt-BR")}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <button
          onClick={addItem}
          style={{
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,.12)",
            background: "white",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          + Adicionar item
        </button>
      </div>
    </div>
  );
}

function FieldInt({
  label,
  value,
  setValue,
  disabled,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>{label}</label>
      <input
        disabled={disabled}
        value={String(value ?? 0)}
        onChange={(e) => setValue(clampInt(e.target.value))}
        inputMode="numeric"
        style={{
          width: "100%",
          marginTop: 6,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,.15)",
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  );
}

function FieldMoney({
  label,
  cents,
  setCents,
}: {
  label: string;
  cents: number;
  setCents: (n: number) => void;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>{label}</label>
      <input
        value={String(cents ?? 0)}
        onChange={(e) => setCents(clampInt(e.target.value))}
        inputMode="numeric"
        placeholder="em centavos (ex: 150000 = R$1500)"
        style={{
          width: "100%",
          marginTop: 6,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,.15)",
        }}
      />
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
        Preview: <b>{fmtMoneyBR(Math.max(0, clampInt(cents)))}</b>
      </div>
    </div>
  );
}

function FieldProgram({
  label,
  value,
  setValue,
}: {
  label: string;
  value: LoyaltyProgram | "";
  setValue: (v: LoyaltyProgram | "") => void;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value as any)}
        style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,.15)" }}
      >
        <option value="">Selecione</option>
        <option value="LATAM">LATAM</option>
        <option value="SMILES">SMILES</option>
        <option value="LIVELO">LIVELO</option>
        <option value="ESFERA">ESFERA</option>
      </select>
    </div>
  );
}
