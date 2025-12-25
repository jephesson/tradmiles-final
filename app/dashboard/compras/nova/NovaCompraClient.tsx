"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LoyaltyProgram = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Cedente = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
};

// ✅ inclui OPEN (backend cria como OPEN)
type PurchaseStatus = "OPEN" | "DRAFT" | "READY" | "RELEASED" | "CANCELED";

type PurchaseItemType =
  | "CLUB"
  | "POINTS_BUY"
  | "TRANSFER"
  | "ADJUSTMENT"
  | "EXTRA_COST";

type TransferMode = "FULL_POINTS" | "POINTS_PLUS_CASH";

type PurchaseItem = {
  id?: string; // no front pode ser vazio; backend cria
  type: PurchaseItemType;
  title: string;
  details?: string;

  programFrom?: LoyaltyProgram | null;
  programTo?: LoyaltyProgram | null;

  pointsBase: number; // transferido/comprado base
  bonusMode?: "PERCENT" | "TOTAL" | "" | null;
  bonusValue?: number | null;
  pointsFinal: number; // total final (na CIA, se aplicável)

  transferMode?: TransferMode | null;
  pointsDebitedFromOrigin: number;

  amountCents: number; // custo do item
};

type PurchaseDraft = {
  id: string;
  numero: string;
  status: PurchaseStatus;

  cedenteId: string;

  ciaProgram: LoyaltyProgram | null; // LATAM/SMILES
  ciaPointsTotal: number;

  cedentePayCents: number; // default 5000
  vendorCommissionBps: number; // default 100 (1%)
  targetMarkupCents: number; // default 150

  subtotalCostCents: number;
  vendorCommissionCents: number;
  totalCostCents: number;

  costPerKiloCents: number;
  targetPerKiloCents: number;

  expectedLatamPoints: number | null;
  expectedSmilesPoints: number | null;
  expectedLiveloPoints: number | null;
  expectedEsferaPoints: number | null;

  note: string | null;

  items: PurchaseItem[];
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function clampInt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.trunc(x);
}

function roundCents(n: number) {
  return Math.round(n);
}

function calcItemPointsFinal(item: PurchaseItem) {
  const base = clampInt(item.pointsBase);
  const mode = item.bonusMode || "";
  const val = item.bonusValue ?? 0;

  if (!mode) return base;

  if (mode === "PERCENT") {
    const pct = Math.max(0, clampInt(val));
    const bonus = Math.round((base * pct) / 100);
    return base + bonus;
  }

  if (mode === "TOTAL") {
    const total = Math.max(0, clampInt(val));
    return base + total;
  }

  return base;
}

function computeTotals(d: PurchaseDraft) {
  const itemsCost = d.items.reduce((acc, it) => acc + (it.amountCents || 0), 0);
  const subtotal = itemsCost + (d.cedentePayCents || 0);

  const vendor = roundCents((subtotal * (d.vendorCommissionBps || 0)) / 10000);
  const total = subtotal + vendor;

  const pts = Math.max(0, d.ciaPointsTotal || 0);
  const denom = pts / 1000;

  const costPerKilo = denom > 0 ? roundCents(total / denom) : 0;
  const targetPerKilo = costPerKilo + (d.targetMarkupCents || 0);

  return {
    subtotalCostCents: subtotal,
    vendorCommissionCents: vendor,
    totalCostCents: total,
    costPerKiloCents: costPerKilo,
    targetPerKiloCents: targetPerKilo,
  };
}

/**
 * api() robusta:
 * - cache no-store
 * - credentials include (cookie/sessão)
 * - lê text antes (se vier HTML/redirect)
 * - respeita ok:false
 */
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  const text = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data?.ok === false) {
    console.error("API FAIL:", url, res.status, data);
    throw new Error(data?.error || `Erro ${res.status}`);
  }

  return data as T;
}

function norm(v?: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function onlyDigits(v?: string) {
  return (v || "").replace(/\D+/g, "");
}

export default function NovaCompraClient() {
  // ===== Cedentes (carrega 1x pela MESMA rota do visualizar)
  const [query, setQuery] = useState("");
  const [allCedentes, setAllCedentes] = useState<Cedente[]>([]);
  const [cedenteSel, setCedenteSel] = useState<Cedente | null>(null);
  const [loadingCed, setLoadingCed] = useState(false);

  // ===== Draft
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveTimer = useRef<number | null>(null);

  // ✅ carrega cedentes aprovados (igual Visualizar)
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoadingCed(true);
      try {
        const out = await api<{ ok: true; data: Cedente[] }>(`/api/cedentes/approved`);
        if (!alive) return;
        setAllCedentes(Array.isArray(out?.data) ? out.data : []);
      } catch (e: any) {
        console.error("Falha ao carregar cedentes aprovados:", e);
        if (!alive) return;
        setAllCedentes([]);
      } finally {
        if (alive) setLoadingCed(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  // ✅ filtra no front (mesmo estilo do Visualizar)
  const cedentes = useMemo(() => {
    const s = norm(query);
    if (s.length < 2) return [];

    const dig = onlyDigits(query);

    return allCedentes
      .filter((c) => {
        const nome = norm(c.nomeCompleto);
        const ident = norm(c.identificador);
        const cpfDig = onlyDigits(c.cpf);

        if (dig.length >= 2) {
          // se usuário digitou número, tenta bater CPF/ID também
          return (
            cpfDig.includes(dig) ||
            onlyDigits(c.identificador).includes(dig) ||
            nome.includes(s) ||
            ident.includes(s)
          );
        }

        return nome.includes(s) || ident.includes(s) || cpfDig.includes(s);
      })
      .slice(0, 30); // evita lista gigante
  }, [allCedentes, query]);

  // ===== Create purchase (generate ID)
  async function createDraft() {
    if (!cedenteSel) return;
    setError(null);
    setSaving(true);
    try {
      // ✅ rota corrigida + chave de retorno corrigida
      const out = await api<{ ok: true; compra: PurchaseDraft }>(`/api/compras`, {
        method: "POST",
        body: JSON.stringify({ cedenteId: cedenteSel.id }),
      });

      const p = out.compra;

      // defaults esperado = saldos atuais
      p.expectedLatamPoints ??= cedenteSel.pontosLatam ?? 0;
      p.expectedSmilesPoints ??= cedenteSel.pontosSmiles ?? 0;
      p.expectedLiveloPoints ??= cedenteSel.pontosLivelo ?? 0;
      p.expectedEsferaPoints ??= cedenteSel.pontosEsfera ?? 0;

      const totals = computeTotals(p);
      const next = { ...p, ...totals };
      setDraft(next);
    } catch (e: any) {
      setError(e?.message || "Falha ao criar compra.");
    } finally {
      setSaving(false);
    }
  }

  function scheduleAutosave(next: PurchaseDraft) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveDraft(next);
    }, 700);
  }

  async function saveDraft(nextDraft?: PurchaseDraft) {
    const d = nextDraft || draft;
    if (!d) return;
    setError(null);
    setSaving(true);
    try {
      const totals = computeTotals(d);
      const payload = { ...d, ...totals };

      setDraft(payload);

      // ✅ rota corrigida
      await api<{ ok: true }>(`/api/compras/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ciaProgram: payload.ciaProgram,
          ciaPointsTotal: payload.ciaPointsTotal,

          cedentePayCents: payload.cedentePayCents,
          vendorCommissionBps: payload.vendorCommissionBps,
          targetMarkupCents: payload.targetMarkupCents,

          note: payload.note,

          expectedLatamPoints: payload.expectedLatamPoints,
          expectedSmilesPoints: payload.expectedSmilesPoints,
          expectedLiveloPoints: payload.expectedLiveloPoints,
          expectedEsferaPoints: payload.expectedEsferaPoints,

          items: payload.items,

          subtotalCostCents: payload.subtotalCostCents,
          vendorCommissionCents: payload.vendorCommissionCents,
          totalCostCents: payload.totalCostCents,
          costPerKiloCents: payload.costPerKiloCents,
          targetPerKiloCents: payload.targetPerKiloCents,
        }),
      });
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function releasePurchase() {
    if (!draft) return;
    setError(null);
    setSaving(true);
    try {
      await saveDraft(draft);

      // ✅ rota corrigida + chave de retorno corrigida
      const out = await api<{ ok: true; compra: PurchaseDraft }>(
        `/api/compras/${draft.id}/release`,
        { method: "POST", body: JSON.stringify({}) }
      );

      setDraft(out.compra);
    } catch (e: any) {
      setError(e?.message || "Falha ao liberar.");
    } finally {
      setSaving(false);
    }
  }

  const totals = useMemo(() => {
    if (!draft) return null;
    return computeTotals(draft);
  }, [draft]);

  function updateDraft(patch: Partial<PurchaseDraft>) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    const t = computeTotals(next);
    const merged = { ...next, ...t };
    setDraft(merged);
    scheduleAutosave(merged);
  }

  function addItem() {
    if (!draft) return;
    const nextItem: PurchaseItem = {
      type: "TRANSFER",
      title: "Transferência",
      details: "",
      programFrom: "LIVELO",
      programTo: "SMILES",
      pointsBase: 0,
      bonusMode: "PERCENT",
      bonusValue: 0,
      pointsFinal: 0,
      transferMode: "FULL_POINTS",
      pointsDebitedFromOrigin: 0,
      amountCents: 0,
    };
    updateDraft({ items: [...draft.items, nextItem] });
  }

  function removeItem(idx: number) {
    if (!draft) return;
    const items = [...draft.items];
    items.splice(idx, 1);
    updateDraft({ items });
  }

  function updateItem(idx: number, patch: Partial<PurchaseItem>) {
    if (!draft) return;
    const items = [...draft.items];
    const cur = items[idx];
    const merged: PurchaseItem = { ...cur, ...patch };

    const autoFinal = calcItemPointsFinal(merged);
    if (
      merged.type === "TRANSFER" ||
      merged.type === "POINTS_BUY" ||
      merged.type === "ADJUSTMENT"
    ) {
      merged.pointsFinal = autoFinal;
    }

    items[idx] = merged;
    updateDraft({ items });
  }

  function fillCiaPointsFromItems() {
    if (!draft || !draft.ciaProgram) return;
    const sum = draft.items
      .filter((it) => it.programTo === draft.ciaProgram)
      .reduce((acc, it) => acc + (it.pointsFinal || 0), 0);
    updateDraft({ ciaPointsTotal: sum });
  }

  const isReleased = draft?.status === "RELEASED";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Nova compra</h1>
        <p className="text-sm text-gray-600">
          Crie a compra em rascunho, edite no seu tempo e só aplique no saldo ao liberar.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* =========================
          1) Selecionar Cedente + Criar compra
         ========================= */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">1) Cedente</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm text-gray-600">Buscar cedente</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Nome, CPF, identificador..."
              disabled={!!draft}
            />

            {loadingCed && (
              <div className="mt-1 text-xs text-gray-500">
                Carregando cedentes aprovados...
              </div>
            )}

            {!draft && query.trim().length >= 2 && cedentes.length === 0 && !loadingCed && (
              <div className="mt-2 text-xs text-gray-500">Nenhum cedente encontrado.</div>
            )}

            {!draft && cedentes.length > 0 && (
              <div className="mt-2 max-h-56 overflow-auto rounded-md border">
                {cedentes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCedenteSel(c)}
                    className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      cedenteSel?.id === c.id ? "bg-gray-50" : ""
                    }`}
                  >
                    <div>
                      <div className="font-medium">{c.nomeCompleto}</div>
                      <div className="text-xs text-gray-500">
                        CPF: {c.cpf} · ID: {c.identificador}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      LATAM {c.pontosLatam} · SMILES {c.pontosSmiles}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-sm font-medium">Selecionado</div>
            {!cedenteSel && <div className="text-sm text-gray-600">Nenhum.</div>}
            {cedenteSel && (
              <div className="text-sm text-gray-700 space-y-1">
                <div className="font-medium">{cedenteSel.nomeCompleto}</div>
                <div className="text-xs text-gray-500">
                  CPF {cedenteSel.cpf} · {cedenteSel.identificador}
                </div>
                <div className="text-xs text-gray-500">
                  Saldos atuais: LATAM {cedenteSel.pontosLatam} · SMILES{" "}
                  {cedenteSel.pontosSmiles} · LIVELO {cedenteSel.pontosLivelo} ·
                  ESFERA {cedenteSel.pontosEsfera}
                </div>
              </div>
            )}

            <div className="mt-3">
              <button
                type="button"
                onClick={createDraft}
                disabled={!cedenteSel || saving || !!draft}
                className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {draft ? "Compra criada" : "Gerar compra (ID único)"}
              </button>

              {draft && (
                <div className="mt-2 text-xs text-gray-600">
                  Compra: <span className="font-mono">{draft.numero}</span> · Status:{" "}
                  <span className="font-mono">{draft.status}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================
          2) Configuração da compra
         ========================= */}
      {draft && (
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-medium">2) Configuração</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveDraft(draft)}
                disabled={saving || isReleased}
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={releasePurchase}
                disabled={saving || isReleased || !draft.ciaProgram || !draft.ciaPointsTotal}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                LIBERAR (aplicar saldo)
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-sm text-gray-600">CIA aérea (base do milheiro)</label>
              <select
                value={draft.ciaProgram || ""}
                disabled={isReleased}
                onChange={(e) =>
                  updateDraft({
                    ciaProgram: (e.target.value || null) as LoyaltyProgram | null,
                  })
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                <option value="LATAM">LATAM</option>
                <option value="SMILES">Smiles</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-600">
                Total de pontos na CIA (para cálculo do milheiro)
              </label>
              <input
                type="number"
                value={draft.ciaPointsTotal}
                disabled={isReleased}
                onChange={(e) => updateDraft({ ciaPointsTotal: clampInt(e.target.value) })}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Ex: 120000"
              />
              <button
                type="button"
                onClick={fillCiaPointsFromItems}
                disabled={isReleased || !draft.ciaProgram}
                className="mt-2 text-xs underline text-gray-700 disabled:opacity-50"
              >
                Sugerir pelo somatório dos itens (programTo = CIA)
              </button>
            </div>

            <div>
              <label className="text-sm text-gray-600">Observação</label>
              <input
                value={draft.note || ""}
                disabled={isReleased}
                onChange={(e) => updateDraft({ note: e.target.value })}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-sm text-gray-600">Taxa cedente</label>
              <input
                type="number"
                value={draft.cedentePayCents / 100}
                disabled={isReleased}
                onChange={(e) =>
                  updateDraft({ cedentePayCents: roundCents(Number(e.target.value || 0) * 100) })
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Comissão vendedor</label>
              <input
                type="number"
                value={draft.vendorCommissionBps / 100}
                disabled={isReleased}
                onChange={(e) =>
                  updateDraft({ vendorCommissionBps: roundCents(Number(e.target.value || 0) * 100) })
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="1 = 1%"
              />
              <div className="mt-1 text-xs text-gray-500">Use 1 para 1% (interno em bps).</div>
            </div>

            <div>
              <label className="text-sm text-gray-600">Markup meta (R$/milheiro)</label>
              <input
                type="number"
                value={draft.targetMarkupCents / 100}
                disabled={isReleased}
                onChange={(e) =>
                  updateDraft({ targetMarkupCents: roundCents(Number(e.target.value || 0) * 100) })
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="1.50"
              />
            </div>

            <div className="rounded-md bg-gray-50 p-3">
              <div className="text-xs text-gray-600">Resumo (cálculo)</div>
              <div className="mt-1 text-sm">
                Subtotal: <b>{fmtMoneyBR(totals?.subtotalCostCents || 0)}</b>
              </div>
              <div className="text-sm">
                1%: <b>{fmtMoneyBR(totals?.vendorCommissionCents || 0)}</b>
              </div>
              <div className="text-sm">
                Total: <b>{fmtMoneyBR(totals?.totalCostCents || 0)}</b>
              </div>
              <div className="mt-2 text-sm">
                Milheiro: <b>{fmtMoneyBR(totals?.costPerKiloCents || 0)}</b>
              </div>
              <div className="text-sm">
                Meta: <b>{fmtMoneyBR(totals?.targetPerKiloCents || 0)}</b>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================
          3) Itens da compra
         ========================= */}
      {draft && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">3) Itens (pontos + custos)</h2>
            <button
              type="button"
              onClick={addItem}
              disabled={isReleased}
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              + Adicionar item
            </button>
          </div>

          <div className="overflow-auto rounded-md border">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Título</th>
                  <th className="p-2">De</th>
                  <th className="p-2">Para</th>
                  <th className="p-2">Base</th>
                  <th className="p-2">Bônus</th>
                  <th className="p-2">Final</th>
                  <th className="p-2">Debitado origem</th>
                  <th className="p-2">Modo</th>
                  <th className="p-2">Custo (R$)</th>
                  <th className="p-2"></th>
                </tr>
              </thead>

              <tbody>
                {draft.items.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-3 text-gray-500">
                      Sem itens ainda.
                    </td>
                  </tr>
                )}

                {draft.items.map((it, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">
                      <select
                        value={it.type}
                        disabled={isReleased}
                        onChange={(e) =>
                          updateItem(idx, { type: e.target.value as PurchaseItemType })
                        }
                        className="w-full rounded-md border px-2 py-1 text-sm"
                      >
                        <option value="TRANSFER">Transferência</option>
                        <option value="POINTS_BUY">Compra pontos</option>
                        <option value="CLUB">Clube</option>
                        <option value="ADJUSTMENT">Ajuste</option>
                        <option value="EXTRA_COST">Extra</option>
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        value={it.title}
                        disabled={isReleased}
                        onChange={(e) => updateItem(idx, { title: e.target.value })}
                        className="w-full rounded-md border px-2 py-1 text-sm"
                        placeholder="Ex: Transfer Livelo→Smiles"
                      />
                      <input
                        value={it.details || ""}
                        disabled={isReleased}
                        onChange={(e) => updateItem(idx, { details: e.target.value })}
                        className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
                        placeholder="Detalhes (opcional)"
                      />
                    </td>

                    <td className="p-2">
                      <select
                        value={it.programFrom || ""}
                        disabled={isReleased}
                        onChange={(e) =>
                          updateItem(idx, { programFrom: (e.target.value || null) as any })
                        }
                        className="w-full rounded-md border px-2 py-1 text-sm"
                      >
                        <option value="">—</option>
                        <option value="LATAM">LATAM</option>
                        <option value="SMILES">SMILES</option>
                        <option value="LIVELO">LIVELO</option>
                        <option value="ESFERA">ESFERA</option>
                      </select>
                    </td>

                    <td className="p-2">
                      <select
                        value={it.programTo || ""}
                        disabled={isReleased}
                        onChange={(e) =>
                          updateItem(idx, { programTo: (e.target.value || null) as any })
                        }
                        className="w-full rounded-md border px-2 py-1 text-sm"
                      >
                        <option value="">—</option>
                        <option value="LATAM">LATAM</option>
                        <option value="SMILES">SMILES</option>
                        <option value="LIVELO">LIVELO</option>
                        <option value="ESFERA">ESFERA</option>
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        value={it.pointsBase}
                        disabled={isReleased}
                        onChange={(e) => updateItem(idx, { pointsBase: clampInt(e.target.value) })}
                        className="w-full rounded-md border px-2 py-1 text-sm"
                      />
                    </td>

                    <td className="p-2">
                      <div className="flex gap-1">
                        <select
                          value={it.bonusMode || ""}
                          disabled={isReleased}
                          onChange={(e) => updateItem(idx, { bonusMode: e.target.value as any })}
                          className="rounded-md border px-2 py-1 text-sm"
                        >
                          <option value="">—</option>
                          <option value="PERCENT">%</option>
                          <option value="TOTAL">+Pts</option>
                        </select>
                        <input
                          type="number"
                          value={it.bonusValue ?? 0}
                          disabled={isReleased || !it.bonusMode}
                          onChange={(e) => updateItem(idx, { bonusValue: clampInt(e.target.value) })}
                          className="w-24 rounded-md border px-2 py-1 text-sm disabled:opacity-50"
                        />
                      </div>
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        value={it.pointsFinal}
                        disabled={isReleased}
                        onChange={(e) => updateItem(idx, { pointsFinal: clampInt(e.target.value) })}
                        className="w-full rounded-md border px-2 py-1 text-sm"
                      />
                      <div className="text-[11px] text-gray-500 mt-1">
                        Sugere automaticamente (base + bônus), mas você pode editar.
                      </div>
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        value={it.pointsDebitedFromOrigin}
                        disabled={isReleased}
                        onChange={(e) =>
                          updateItem(idx, { pointsDebitedFromOrigin: clampInt(e.target.value) })
                        }
                        className="w-full rounded-md border px-2 py-1 text-sm"
                        placeholder="0"
                      />
                    </td>

                    <td className="p-2">
                      <select
                        value={it.transferMode || ""}
                        disabled={isReleased}
                        onChange={(e) =>
                          updateItem(idx, { transferMode: (e.target.value || null) as any })
                        }
                        className="w-full rounded-md border px-2 py-1 text-sm"
                      >
                        <option value="">—</option>
                        <option value="FULL_POINTS">Só pontos</option>
                        <option value="POINTS_PLUS_CASH">Pontos + dinheiro</option>
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        value={(it.amountCents || 0) / 100}
                        disabled={isReleased}
                        onChange={(e) =>
                          updateItem(idx, {
                            amountCents: roundCents(Number(e.target.value || 0) * 100),
                          })
                        }
                        className="w-full rounded-md border px-2 py-1 text-sm"
                      />
                    </td>

                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        disabled={isReleased}
                        className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-600">
            Dica: use <b>programTo = LATAM/SMILES</b> nos itens que geram pontos na CIA. Depois clique
            em “Sugerir pelo somatório” pra preencher o total.
          </div>
        </div>
      )}

      {/* =========================
          4) Saldo esperado (aplica ao liberar)
         ========================= */}
      {draft && cedenteSel && (
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">4) Saldo final esperado (será aplicado ao LIBERAR)</h2>

          <div className="grid gap-3 md:grid-cols-4">
            <BalanceField
              label="LATAM"
              current={cedenteSel.pontosLatam}
              value={draft.expectedLatamPoints}
              disabled={isReleased}
              onChange={(v) => updateDraft({ expectedLatamPoints: v })}
            />
            <BalanceField
              label="Smiles"
              current={cedenteSel.pontosSmiles}
              value={draft.expectedSmilesPoints}
              disabled={isReleased}
              onChange={(v) => updateDraft({ expectedSmilesPoints: v })}
            />
            <BalanceField
              label="Livelo"
              current={cedenteSel.pontosLivelo}
              value={draft.expectedLiveloPoints}
              disabled={isReleased}
              onChange={(v) => updateDraft({ expectedLiveloPoints: v })}
            />
            <BalanceField
              label="Esfera"
              current={cedenteSel.pontosEsfera}
              value={draft.expectedEsferaPoints}
              disabled={isReleased}
              onChange={(v) => updateDraft({ expectedEsferaPoints: v })}
            />
          </div>

          <div className="text-xs text-gray-600">
            Esses valores são o “como tem que ficar”. Quando você clicar em <b>LIBERAR</b>, o sistema
            vai atualizar os pontos do cedente para exatamente esses saldos (e a compra entra no
            rateio).
          </div>
        </div>
      )}

      {/* Footer */}
      {draft && (
        <div className="text-xs text-gray-500">
          {saving ? "Salvando..." : "Autosave ativo (a cada ~0,7s ao editar)."}{" "}
          {draft.status === "RELEASED" ? "Compra liberada (travada)." : ""}
        </div>
      )}
    </div>
  );
}

function BalanceField(props: {
  label: string;
  current: number;
  value: number | null;
  disabled?: boolean;
  onChange: (v: number | null) => void;
}) {
  const { label, current, value, disabled, onChange } = props;

  return (
    <div className="rounded-md bg-gray-50 p-3">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-gray-600">Atual: {current}</div>

      <label className="mt-2 block text-xs text-gray-600">Esperado</label>
      <input
        type="number"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? Math.trunc(n) : 0);
        }}
        className="mt-1 w-full rounded-md border px-2 py-2 text-sm disabled:opacity-50"
        placeholder="Ex: 150000"
      />
    </div>
  );
}
