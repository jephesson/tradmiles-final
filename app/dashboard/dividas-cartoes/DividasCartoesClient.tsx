"use client";

import { useEffect, useMemo, useState } from "react";
import PixDestinoConfirmModal, { type PixDestinoView } from "@/components/PixDestinoConfirmModal";
import { currentMonthISORecife, nextMonthISO, previousMonthISO } from "@/lib/bonus/monthlyBonus";
import { cn } from "@/lib/cn";

type PixTipo = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";

type Row = {
  id: string;
  purchaseId: string;
  title: string;
  n: number;
  dueDate: string;
  amountCents: number;
  status: string;
  paidAt?: string | null;
  paidVia?: string | null;
};

type Totals = {
  monthOpenCents: number;
  monthPaidCents: number;
  monthCount: number;
  monthOpenCount: number;
  allOpenCents: number;
  allOpenCount: number;
  allPaidCents: number;
  allPaidCount: number;
  allTotalCents: number;
  allCount: number;
};

function money(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateBR(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 15))
  );
}

export default function DividasCartoesClient() {
  const [month, setMonth] = useState(currentMonthISORecife());
  const [tab, setTab] = useState<"mes" | "todas">("mes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [openRows, setOpenRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [openByMonth, setOpenByMonth] = useState<{ month: string; openCents: number; count: number }[]>([]);
  const [pixTipo, setPixTipo] = useState<PixTipo>("CPF");
  const [chavePix, setChavePix] = useState("");
  const [creditorName, setCreditorName] = useState("Jocykleber");
  const [pixSaving, setPixSaving] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ ids: string[]; amountCents: number } | null>(null);
  const [destino, setDestino] = useState<PixDestinoView | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCount, setNewCount] = useState("12");
  const [newDue, setNewDue] = useState("");
  const [showNew, setShowNew] = useState(false);

  const visible = tab === "mes" ? rows : openRows;
  const selectedIds = useMemo(
    () => visible.filter((r) => r.status === "OPEN" && selected[r.id]).map((r) => r.id),
    [visible, selected]
  );
  const selectedCents = useMemo(
    () => visible.filter((r) => selected[r.id] && r.status === "OPEN").reduce((s, r) => s + r.amountCents, 0),
    [visible, selected]
  );

  async function loadMonth(ym = month) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dividas-cartoes?month=${ym}`, { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setRows(json.data.installments || []);
      setTotals(json.data.totals);
      setOpenByMonth(json.data.openByMonth || []);
      setCreditorName(json.data.creditor?.name || "Jocykleber");
      if (json.data.creditor?.pixTipo) setPixTipo(json.data.creditor.pixTipo);
      if (json.data.creditor?.chavePix) setChavePix(json.data.creditor.chavePix);
    } catch (e: any) {
      setError(e?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function loadOpen() {
    const res = await fetch("/api/dividas-cartoes/abertas", { cache: "no-store", credentials: "include" });
    const json = await res.json();
    if (json?.ok) setOpenRows(json.data || []);
  }

  useEffect(() => {
    void loadMonth(month);
    void loadOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function savePix() {
    setPixSaving(true);
    try {
      const res = await fetch("/api/dividas-cartoes/pix", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pixTipo, chavePix }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao salvar PIX.");
      alert("PIX salvo.");
    } catch (e: any) {
      alert(e?.message || "Erro");
    } finally {
      setPixSaving(false);
    }
  }

  async function pay(via: "local" | "inter", ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dividas-cartoes/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ via, installmentIds: ids }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao pagar.");
      if (via === "inter" && json.data?.awaitingApproval) {
        alert("PIX enviado. Aguardando aprovação no Inter.");
      } else {
        alert(via === "inter" ? "PIX enviado." : "Parcela(s) marcada(s) como paga.");
      }
      setSelected({});
      setConfirm(null);
      await loadMonth(month);
      await loadOpen();
    } catch (e: any) {
      alert(e?.message || "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function startPix(ids: string[]) {
    const amountCents = (tab === "mes" ? rows : openRows)
      .filter((r) => ids.includes(r.id))
      .reduce((s, r) => s + r.amountCents, 0);
    const res = await fetch("/api/dividas-cartoes/pix", { cache: "no-store", credentials: "include" });
    const json = await res.json();
    if (!json?.ok) {
      alert(json?.error || "Cadastre o PIX.");
      return;
    }
    if (!json.data?.pixKey) {
      alert("Cadastre a chave PIX do Jocykleber nesta tela.");
      return;
    }
    setDestino({
      nome: json.data.nome,
      cpf: json.data.cpf,
      banco: json.data.banco,
      pixTipo: json.data.pixTipo,
      pixKey: json.data.pixKey,
      source: json.data.source,
      cpfMatchesKey: json.data.cpfMatchesKey,
    });
    setConfirm({ ids, amountCents });
  }

  async function createPurchase() {
    const reais = Number(String(newAmount).replace(/\./g, "").replace(",", "."));
    const amountCents = Math.round(reais * 100);
    try {
      const res = await fetch("/api/dividas-cartoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: newTitle,
          amountCents,
          count: Number(newCount),
          firstDueDate: newDue,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao cadastrar.");
      setNewTitle("");
      setNewAmount("");
      setShowNew(false);
      await loadMonth(month);
      await loadOpen();
      alert("Compra parcelada cadastrada.");
    } catch (e: any) {
      alert(e?.message || "Erro");
    }
  }

  const monthOpenIds = rows.filter((r) => r.status === "OPEN").map((r) => r.id);
  const allOpenIds = openRows.map((r) => r.id);

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Financeiro</div>
        <h1 className="text-2xl font-bold">Dívida cartões</h1>
        <p className="text-sm text-slate-600">
          Parcelas do {creditorName} (planilha Jocykleber). Marque várias parcelas e pague tudo em <b>um PIX só</b>.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border p-4">
        <div className="text-sm font-semibold">Chave PIX ({creditorName})</div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-xl border px-3 py-2 text-sm bg-white"
            value={pixTipo}
            onChange={(e) => setPixTipo(e.target.value as PixTipo)}
          >
            <option value="CPF">CPF</option>
            <option value="CNPJ">CNPJ</option>
            <option value="EMAIL">E-mail</option>
            <option value="TELEFONE">Telefone</option>
            <option value="ALEATORIA">Aleatória</option>
          </select>
          <input
            className="min-w-[240px] flex-1 rounded-xl border px-3 py-2 text-sm"
            placeholder="Chave PIX"
            value={chavePix}
            onChange={(e) => setChavePix(e.target.value)}
          />
          <button
            type="button"
            disabled={pixSaving || !chavePix.trim()}
            onClick={() => void savePix()}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {pixSaving ? "Salvando..." : "Salvar PIX"}
          </button>
        </div>
      </div>

      {totals ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-slate-500">A pagar neste mês</div>
            <div className="text-lg font-semibold tabular-nums">{money(totals.monthOpenCents)}</div>
            <div className="text-xs text-slate-500">{totals.monthOpenCount} parcela(s)</div>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-slate-500">Pago neste mês</div>
            <div className="text-lg font-semibold tabular-nums">{money(totals.monthPaidCents)}</div>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-slate-500">Restante total</div>
            <div className="text-lg font-semibold tabular-nums">{money(totals.allOpenCents)}</div>
            <div className="text-xs text-slate-500">{totals.allOpenCount} parcela(s)</div>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-slate-500">Já pago (todas)</div>
            <div className="text-lg font-semibold tabular-nums">{money(totals.allPaidCents)}</div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => setMonth(previousMonthISO(month))}>
          ←
        </button>
        <div className="min-w-[180px] text-center text-sm font-semibold capitalize">{monthLabel(month)}</div>
        <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => setMonth(nextMonthISO(month))}>
          →
        </button>
        <button
          type="button"
          className={cn("rounded-xl border px-3 py-2 text-sm", tab === "mes" && "bg-black text-white")}
          onClick={() => setTab("mes")}
        >
          Parcelas do mês
        </button>
        <button
          type="button"
          className={cn("rounded-xl border px-3 py-2 text-sm", tab === "todas" && "bg-black text-white")}
          onClick={() => setTab("todas")}
        >
          Restante total
        </button>
        <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => setShowNew((v) => !v)}>
          Nova compra
        </button>
      </div>

      {showNew ? (
        <div className="grid gap-2 rounded-2xl border p-4 sm:grid-cols-5">
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Compra" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Valor da parcela" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Qtd parcelas" value={newCount} onChange={(e) => setNewCount(e.target.value)} />
          <input className="rounded-xl border px-3 py-2 text-sm" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
          <button type="button" className="rounded-xl bg-black px-3 py-2 text-sm text-white" onClick={() => void createPurchase()}>
            Cadastrar
          </button>
        </div>
      ) : null}

      {openByMonth.length && tab === "todas" ? (
        <div className="flex flex-wrap gap-2">
          {openByMonth.map((m) => (
            <button
              key={m.month}
              type="button"
              onClick={() => {
                setMonth(m.month);
                setTab("mes");
              }}
              className="rounded-full border px-3 py-1 text-xs hover:bg-slate-50"
            >
              {monthLabel(m.month)} · {money(m.openCents)} ({m.count})
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !selectedIds.length}
          onClick={() => void pay("local", selectedIds)}
          className="rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
        >
          Marcar pago ({selectedIds.length}) {selectedCents ? money(selectedCents) : ""}
        </button>
        <button
          type="button"
          disabled={busy || !selectedIds.length}
          onClick={() => void startPix(selectedIds)}
          className="rounded-xl bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {selectedIds.length > 1
            ? `Pagar ${selectedIds.length} parcelas em 1 PIX (${money(selectedCents)})`
            : selectedIds.length === 1
              ? `Pagar 1 parcela no PIX (${money(selectedCents)})`
              : "Pagar seleção em 1 PIX"}
        </button>
        {tab === "mes" ? (
          <>
            <button
              type="button"
              disabled={busy || !monthOpenIds.length}
              onClick={() => void pay("local", monthOpenIds)}
              className="rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
            >
              Marcar mês pago
            </button>
            <button
              type="button"
              disabled={busy || !monthOpenIds.length}
              onClick={() => void startPix(monthOpenIds)}
              className="rounded-xl bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              PIX do mês {totals ? money(totals.monthOpenCents) : ""}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy || !allOpenIds.length}
            onClick={() => void startPix(allOpenIds)}
            className="rounded-xl bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            PIX do restante {totals ? money(totals.allOpenCents) : ""}
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-slate-600">Carregando...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="p-3">
                  <input
                    type="checkbox"
                    checked={visible.filter((r) => r.status === "OPEN").length > 0 && visible.filter((r) => r.status === "OPEN").every((r) => selected[r.id])}
                    onChange={(e) => {
                      const next: Record<string, boolean> = {};
                      if (e.target.checked) {
                        for (const r of visible) if (r.status === "OPEN") next[r.id] = true;
                      }
                      setSelected(next);
                    }}
                  />
                </th>
                <th className="p-3">Compra</th>
                <th className="p-3">Parcela</th>
                <th className="p-3">Vencimento</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    {r.status === "OPEN" ? (
                      <input
                        type="checkbox"
                        checked={!!selected[r.id]}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                      />
                    ) : null}
                  </td>
                  <td className="p-3 font-medium">
                    <div>{r.title}</div>
                    {r.status === "OPEN" ? (
                      <button
                        type="button"
                        className="text-[11px] text-slate-500 underline"
                        onClick={() => {
                          const ids = visible.filter((x) => x.purchaseId === r.purchaseId && x.status === "OPEN").map((x) => x.id);
                          setSelected((prev) => {
                            const next = { ...prev };
                            for (const id of ids) next[id] = true;
                            return next;
                          });
                        }}
                      >
                        Juntar restantes desta compra
                      </button>
                    ) : null}
                  </td>
                  <td className="p-3 tabular-nums">{r.n}</td>
                  <td className="p-3 tabular-nums">{dateBR(r.dueDate)}</td>
                  <td className="p-3 tabular-nums">{money(r.amountCents)}</td>
                  <td className="p-3">
                    {r.status === "PAID" ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Pago</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Aberto</span>
                    )}
                  </td>
                  <td className="p-3">
                    {r.status === "OPEN" ? (
                      <div className="flex gap-2">
                        <button type="button" className="text-xs underline" onClick={() => void pay("local", [r.id])}>
                          Marcar pago
                        </button>
                        <button type="button" className="text-xs underline text-emerald-700" onClick={() => void startPix([r.id])}>
                          PIX
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td className="p-6 text-slate-500" colSpan={7}>
                    Nenhuma parcela {tab === "mes" ? "neste mês" : "em aberto"}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {selectedIds.length > 0 ? (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg">
          <div className="text-sm text-emerald-950">
            <b>{selectedIds.length}</b> parcela(s) juntas · <b>{money(selectedCents)}</b>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => setSelected({})}>
              Limpar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startPix(selectedIds)}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Pagar em 1 PIX
            </button>
          </div>
        </div>
      ) : null}

      {confirm && destino ? (
        <PixDestinoConfirmModal
          title="Enviar PIX das parcelas"
          amountCents={confirm.amountCents}
          destino={destino}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void pay("inter", confirm.ids)}
        />
      ) : null}
    </div>
  );
}
