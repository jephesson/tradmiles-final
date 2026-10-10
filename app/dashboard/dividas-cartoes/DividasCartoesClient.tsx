"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard, Plus } from "lucide-react";
import PixDestinoConfirmModal, { type PixDestinoView } from "@/components/PixDestinoConfirmModal";
import { currentMonthISORecife, nextMonthISO, previousMonthISO } from "@/lib/bonus/monthlyBonus";
import { cn } from "@/lib/cn";
import { getSession } from "@/lib/auth";

type PixTipo = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";

type Row = {
  id: string;
  purchaseId: string;
  title: string;
  addedAt?: string | null;
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

function parseReaisToCents(input: string) {
  const reais = Number(String(input).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(reais) || reais <= 0) return 0;
  return Math.round(reais * 100);
}

function addMonthsISO(iso: string, add: number) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1 + add, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}


export default function DividasCartoesClient() {
  const [month, setMonth] = useState(currentMonthISORecife());
  const [tab, setTab] = useState<"mes" | "todas">("mes");
  const [hidePaid, setHidePaid] = useState(true);
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
  const [confirmNew, setConfirmNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPix, setShowPix] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);

  const visible = tab === "mes" ? rows : openRows;
  const listed = useMemo(
    () => (hidePaid ? visible.filter((r) => r.status === "OPEN") : visible),
    [visible, hidePaid]
  );
  const selectedIds = useMemo(
    () => listed.filter((r) => r.status === "OPEN" && selected[r.id]).map((r) => r.id),
    [listed, selected]
  );
  const selectedCents = useMemo(
    () => listed.filter((r) => selected[r.id] && r.status === "OPEN").reduce((s, r) => s + r.amountCents, 0),
    [listed, selected]
  );

  const newInstallmentCents = useMemo(() => parseReaisToCents(newAmount), [newAmount]);
  const newCountN = useMemo(() => Math.max(0, Math.trunc(Number(newCount) || 0)), [newCount]);
  const newTotalCents = newInstallmentCents * newCountN;

  const groups = useMemo(() => {
    const map = new Map<string, { purchaseId: string; title: string; addedAt: string | null; items: Row[] }>();
    for (const r of listed) {
      const cur = map.get(r.purchaseId) || {
        purchaseId: r.purchaseId,
        title: r.title,
        addedAt: r.addedAt || null,
        items: [],
      };
      cur.items.push(r);
      map.set(r.purchaseId, cur);
    }
    return [...map.values()];
  }, [listed]);

  async function loadMonth(ym = month) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dividas-cartoes?month=${ym}`, { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || `Falha ao carregar (${res.status}).`);
      const monthsOpen = json.data.openByMonth || [];
      setOpenByMonth(monthsOpen);
      const returnedMonth = String(json.data.month || ym);
      if (returnedMonth !== ym) setMonth(returnedMonth);
      setRows(json.data.installments || []);
      setTotals(json.data.totals);
      setCreditorName(json.data.creditor?.name || "Jocykleber");
      if (json.data.creditor?.pixTipo) setPixTipo(json.data.creditor.pixTipo);
      if (json.data.creditor?.chavePix) setChavePix(json.data.creditor.chavePix);
      if (!json.data.creditor?.chavePix && json.data?.viewOnly !== true) setShowPix(true);
      if (json.data?.viewOnly) setViewOnly(true);
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
    setViewOnly(getSession()?.role === "socio");
    void loadMonth(month).then(() => void loadOpen());
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
      setShowPix(false);
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
    if (!json?.ok || !json.data?.pixKey) {
      setShowPix(true);
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

  function openCreateConfirm() {
    if (!newTitle.trim()) return alert("Informe a descrição da compra.");
    if (newInstallmentCents <= 0) return alert("Informe o valor da parcela.");
    if (newCountN <= 0) return alert("Informe a quantidade de parcelas.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDue)) return alert("Informe a data da 1ª parcela.");
    setConfirmNew(true);
  }

  async function createPurchase() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/dividas-cartoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: newTitle,
          amountCents: newInstallmentCents,
          count: newCountN,
          firstDueDate: newDue,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao cadastrar.");
      setNewTitle("");
      setNewAmount("");
      setConfirmNew(false);
      setShowNew(false);
      const dueMonth = newDue.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(dueMonth) && dueMonth !== month) {
        setMonth(dueMonth);
      } else {
        await loadMonth(month);
      }
      await loadOpen();
    } catch (e: any) {
      alert(e?.message || "Erro");
    } finally {
      setCreating(false);
    }
  }

  const monthOpenIds = rows.filter((r) => r.status === "OPEN").map((r) => r.id);
  const listedOpenIds = listed.filter((r) => r.status === "OPEN").map((r) => r.id);
  const allListedSelected = listedOpenIds.length > 0 && listedOpenIds.every((id) => selected[id]);

  function toggleGroup(purchaseId: string) {
    const ids = listed.filter((r) => r.purchaseId === purchaseId && r.status === "OPEN").map((r) => r.id);
    const allOn = ids.every((id) => selected[id]);
    setSelected((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = !allOn;
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Financeiro</div>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Dívida cartões</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              {viewOnly
                ? `Acompanhamento das parcelas do ${creditorName}.`
                : `Parcelas do ${creditorName}. Marque várias e pague em um PIX só.`}
            </p>
          </div>
          {viewOnly ? null : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPix((v) => !v)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <CreditCard className="h-4 w-4" />
              {chavePix ? "Chave PIX" : "Cadastrar PIX"}
            </button>
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Nova compra
            </button>
          </div>
          )}
        </div>

        {showPix && !viewOnly ? (
          <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-[160px_1fr_auto]">
            <select
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
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
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              placeholder={`Chave PIX — ${creditorName}`}
              value={chavePix}
              onChange={(e) => setChavePix(e.target.value)}
            />
            <button
              type="button"
              disabled={pixSaving || !chavePix.trim()}
              onClick={() => void savePix()}
              className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pixSaving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        ) : chavePix && !viewOnly ? (
          <div className="mt-3 text-xs text-slate-500">
            PIX cadastrado: {pixTipo} · {chavePix}
          </div>
        ) : null}

        {showNew ? (
          <div className="mt-4 space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
            <div className="grid gap-2 sm:grid-cols-5">
            <label className="block text-xs font-medium text-slate-600">
              Compra
              <input className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Descrição" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Valor da parcela
              <input className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="R$ 0,00" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Qtd de parcelas
              <input className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="12" value={newCount} onChange={(e) => setNewCount(e.target.value)} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Data da 1ª parcela
              <input className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
            </label>
            <button type="button" className="h-10 self-end rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white" onClick={openCreateConfirm}>
              Cadastrar
            </button>
            </div>
            {newTotalCents > 0 ? (
              <div className="rounded-xl border border-amber-200/80 bg-white px-3 py-2 text-sm text-slate-700">
                Total da compra:{" "}
                <b className="tabular-nums text-slate-900">{money(newTotalCents)}</b>
                <span className="text-xs text-slate-500">
                  {" "}
                  ({newCountN} × {money(newInstallmentCents)})
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/80 to-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              A pagar em {monthLabel(month)}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-amber-950">{money(totals.monthOpenCents)}</div>
            <div className="mt-1 text-xs text-amber-800">{totals.monthOpenCount} parcela(s)</div>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Pago neste mês</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">{money(totals.monthPaidCents)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/60 to-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Restante total</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{money(totals.allOpenCents)}</div>
            <div className="mt-1 text-xs text-slate-500">{totals.allOpenCount} parcela(s)</div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/60 to-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Já pago</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{money(totals.allPaidCents)}</div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50">
            <button type="button" className="inline-flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-white" onClick={() => setMonth(previousMonthISO(month))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[150px] px-2 text-center text-sm font-semibold capitalize text-slate-900">{monthLabel(month)}</div>
            <button type="button" className="inline-flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-white" onClick={() => setMonth(nextMonthISO(month))}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setTab("mes")}
              className={cn("rounded-full px-4 py-1.5 text-xs font-semibold", tab === "mes" ? "bg-slate-900 text-white" : "text-slate-600")}
            >
              Este mês
            </button>
            <button
              type="button"
              onClick={() => setTab("todas")}
              className={cn("rounded-full px-4 py-1.5 text-xs font-semibold", tab === "todas" ? "bg-slate-900 text-white" : "text-slate-600")}
            >
              Restante
            </button>
          </div>
          <label className="ml-1 inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={hidePaid} onChange={(e) => setHidePaid(e.target.checked)} />
            Só em aberto
          </label>
        </div>
        {!viewOnly && tab === "mes" ? (
          <button
            type="button"
            disabled={busy || !monthOpenIds.length}
            onClick={() => void startPix(monthOpenIds)}
            className="inline-flex h-10 items-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            PIX do mês {totals ? money(totals.monthOpenCents) : ""}
          </button>
        ) : !viewOnly ? (
          <button
            type="button"
            disabled={busy || !openRows.length}
            onClick={() => void startPix(openRows.map((r) => r.id))}
            className="inline-flex h-10 items-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            PIX do restante {totals ? money(totals.allOpenCents) : ""}
          </button>
        ) : null}
      </div>

      {tab === "todas" && openByMonth.length ? (
        <div className="flex flex-wrap gap-2">
          {openByMonth.map((m) => (
            <button
              key={m.month}
              type="button"
              onClick={() => {
                setMonth(m.month);
                setTab("mes");
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {monthLabel(m.month)} · {money(m.openCents)}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-semibold text-slate-800">
            {tab === "mes" ? `Parcelas de ${monthLabel(month)}` : "Parcelas em aberto"}
            {loading ? <span className="ml-2 text-xs font-normal text-slate-500">carregando...</span> : null}
          </div>
          {viewOnly ? null : (
          <label className="inline-flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={allListedSelected}
              onChange={(e) => {
                const next: Record<string, boolean> = {};
                if (e.target.checked) for (const id of listedOpenIds) next[id] = true;
                setSelected(next);
              }}
            />
            Selecionar todas
          </label>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {!loading && groups.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">Nenhuma parcela nesta visão.</div>
          ) : null}

          {groups.map((g) => {
            const openItems = g.items.filter((i) => i.status === "OPEN");
            const groupCents = openItems.reduce((s, i) => s + i.amountCents, 0);
            const groupSelected = openItems.length > 0 && openItems.every((i) => selected[i.id]);
            return (
              <div key={g.purchaseId}>
                <div className="flex flex-wrap items-center gap-3 bg-slate-50/80 px-4 py-2.5">
                  {viewOnly ? null : (
                  <input type="checkbox" checked={groupSelected} disabled={!openItems.length} onChange={() => toggleGroup(g.purchaseId)} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{g.title}</div>
                    <div className="text-xs text-slate-500">
                      {g.addedAt ? `Adicionada em ${dateBR(g.addedAt)}` : null}
                      {g.addedAt ? " · " : null}
                      {openItems.length ? `${openItems.length} em aberto · ${money(groupCents)}` : "Tudo pago neste recorte"}
                    </div>
                  </div>
                  {openItems.length && !viewOnly ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                      onClick={() => void startPix(openItems.map((i) => i.id))}
                    >
                      PIX desta compra
                    </button>
                  ) : null}
                </div>
                {g.items.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 pl-11 text-sm">
                    {r.status === "OPEN" && !viewOnly ? (
                      <input
                        type="checkbox"
                        checked={!!selected[r.id]}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                      />
                    ) : (
                      <span className="w-4" />
                    )}
                    <div className="w-16 tabular-nums text-slate-500">{r.n}ª</div>
                    <div className="w-28 tabular-nums text-slate-600">{dateBR(r.dueDate)}</div>
                    <div className="flex-1 font-medium tabular-nums text-slate-900">{money(r.amountCents)}</div>
                    {r.status === "PAID" ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Pago</span>
                    ) : viewOnly ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Aberto</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Aberto</span>
                        <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => void pay("local", [r.id])}>
                          Marcar pago
                        </button>
                        <button type="button" className="text-xs font-semibold text-emerald-700 hover:underline" onClick={() => void startPix([r.id])}>
                          PIX
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {selectedIds.length > 0 && !viewOnly ? (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-lg">
          <div className="text-sm text-slate-800">
            <b>{selectedIds.length}</b> parcela(s) · <b>{money(selectedCents)}</b>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" onClick={() => setSelected({})}>
              Limpar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void pay("local", selectedIds)}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
            >
              Marcar pago
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startPix(selectedIds)}
              className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Pagar em 1 PIX
            </button>
          </div>
        </div>
      ) : null}

      {confirmNew ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
          onMouseDown={() => !creating && setConfirmNew(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xl shadow-slate-900/20 sm:p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-bold tracking-tight text-slate-900">Confirmar compra</div>
            <p className="mt-1 text-sm text-slate-500">Revise os dados antes de lançar as parcelas.</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">Compra</dt>
                <dd className="text-right font-medium text-slate-900">{newTitle.trim() || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">Parcela</dt>
                <dd className="tabular-nums font-medium text-slate-900">{money(newInstallmentCents)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">Parcelas</dt>
                <dd className="tabular-nums font-medium text-slate-900">{newCountN}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">1ª parcela</dt>
                <dd className="tabular-nums font-medium text-slate-900">{dateBR(newDue)}</dd>
              </div>
              {newCountN > 1 ? (
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                  <dt className="text-slate-500">Última parcela</dt>
                  <dd className="tabular-nums font-medium text-slate-900">
                    {dateBR(addMonthsISO(newDue, newCountN - 1))}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 py-1.5">
                <dt className="font-semibold text-slate-700">Total</dt>
                <dd className="tabular-nums text-base font-bold text-slate-900">{money(newTotalCents)}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={creating}
                onClick={() => setConfirmNew(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() => void createPurchase()}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {creating ? "Cadastrando..." : "Confirmar"}
              </button>
            </div>
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
