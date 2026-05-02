"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FilterX, Plus, RefreshCw, Search, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/cn";

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}

function intInputBR(n: number) {
  return Math.max(0, n || 0).toLocaleString("pt-BR");
}

function moneyInputBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function moneyToCentsBR(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function intFromBR(input: string) {
  const digits = String(input || "").replace(/\D+/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// ✅ evita “voltar 1 dia” quando vier ISO em UTC
function fmtDateBR(v: string) {
  if (!v) return "—";
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mm = Number(m[2]);
    const d = Number(m[3]);
    return new Date(y, mm - 1, d).toLocaleDateString("pt-BR");
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR");
}

function fmtDateTimeBR(v: string) {
  if (!v) return "—";
  const dt = new Date(String(v));
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("pt-BR");
}

function ymdSaoPaulo(v: string | Date) {
  const dt = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(dt.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dt);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}

function isTodaySaoPaulo(v: string) {
  return Boolean(v) && ymdSaoPaulo(v) === ymdSaoPaulo(new Date());
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

const FIELD_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const CONTROL_SELECT =
  "min-w-[280px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";
const CONTROL_INPUT =
  "w-full min-w-[240px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 pl-10 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

const SUMMARY_BAR: Record<"slate" | "sky" | "amber" | "emerald", string> = {
  slate: "bg-slate-400",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
};

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: keyof typeof SUMMARY_BAR;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/70 p-4 shadow-sm shadow-slate-200/35">
      <div className={cn("absolute left-0 top-0 h-full w-1 rounded-r", SUMMARY_BAR[accent])} aria-hidden />
      <div className="pl-3">
        <div className="text-[11px] font-semibold uppercase leading-snug tracking-wide text-slate-500">{label}</div>
        <div className="mt-1.5 text-lg font-bold tabular-nums tracking-tight text-slate-900">{value}</div>
      </div>
    </div>
  );
}

const CARD_MANUAL_VALUE = "__MANUAL__";
const CARD_NONE_VALUE = "__NONE__";

function cardLabelForUser(user: { name: string; login: string }) {
  return user.login ? `Cartão ${user.name} (@${user.login})` : `Cartão ${user.name}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!r.ok || j.ok === false) throw new Error(j.error || `Erro ${r.status}`);
  return j as T;
}

type SaleRow = {
  id: string;
  numero: string;
  date: string;

  program: "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
  points: number;
  milheiroCents: number;
  passengers: number;

  pointsValueCents?: number;
  commissionCents?: number;
  bonusCents?: number;
  metaMilheiroCents?: number;
  totalCents: number;
  paymentStatus: "PENDING" | "PAID" | "CANCELED";
  paidAt?: string | null;
  locator: string | null;

  // ✅ vem da API (aparece só no modal)
  feeCardLabel?: string | null;
  embarqueFeeCents?: number | null;

  cliente: { id: string; identificador: string; nome: string };

  cedente?: { id: string; identificador: string; nomeCompleto: string } | null;

  receivable?: {
    id: string;
    totalCents: number;
    receivedCents: number;
    balanceCents: number;
    status: "OPEN" | "RECEIVED" | "CANCELED";
  } | null;

  createdAt: string;
};

type UserSession = {
  id: string;
  login: string;
  role: "admin" | "staff";
  team: string;
  name?: string;
};

type UserLite = {
  id: string;
  name: string;
  login: string;
};

type CardOption = {
  value: string;
  label: string;
};

type SaleAuditSnapshot = {
  feeCardLabel?: string | null;
  points?: number;
  milheiroCents?: number;
  embarqueFeeCents?: number;
  pointsValueCents?: number;
  totalCents?: number;
  commissionCents?: number;
  bonusCents?: number;
  metaMilheiroCents?: number;
  paymentStatus?: string;
  receivable?: {
    totalCents?: number;
    receivedCents?: number;
    balanceCents?: number;
    status?: string;
  } | null;
};

type SaleAuditLog = {
  id: string;
  action: string;
  actorLogin: string | null;
  note: string | null;
  before: SaleAuditSnapshot | null;
  after: SaleAuditSnapshot | null;
  createdAt: string;
  actor?: { id: string; name: string; login: string } | null;
};

type StatusFilter = "ALL" | "PENDING" | "PAID" | "CANCELED";

function pendingCentsOfSale(r: SaleRow) {
  if (r.paymentStatus === "PAID") return 0;
  if (r.paymentStatus === "CANCELED") return 0;

  if (typeof r.receivable?.balanceCents === "number")
    return Math.max(0, r.receivable.balanceCents);
  return Math.max(0, r.totalCents || 0);
}

function feeCentsOfSale(r: SaleRow) {
  const v = r.embarqueFeeCents;
  return typeof v === "number" ? Math.max(0, v) : null;
}

function textOrDash(value: string | null | undefined) {
  const s = String(value || "").trim();
  return s || "—";
}

function auditChanges(log: SaleAuditLog) {
  const before = log.before || {};
  const after = log.after || {};
  const changes: string[] = [];

  if (before.feeCardLabel !== after.feeCardLabel) {
    changes.push(`Cartão: ${textOrDash(before.feeCardLabel)} → ${textOrDash(after.feeCardLabel)}`);
  }
  if (before.points !== after.points) {
    changes.push(`Pontos: ${fmtInt(before.points || 0)} → ${fmtInt(after.points || 0)}`);
  }
  if (before.milheiroCents !== after.milheiroCents) {
    changes.push(
      `Milheiro: ${fmtMoneyBR(before.milheiroCents || 0)} → ${fmtMoneyBR(after.milheiroCents || 0)}`
    );
  }
  if (before.pointsValueCents !== after.pointsValueCents) {
    changes.push(
      `Valor pontos: ${fmtMoneyBR(before.pointsValueCents || 0)} → ${fmtMoneyBR(
        after.pointsValueCents || 0
      )}`
    );
  }
  if (before.totalCents !== after.totalCents) {
    changes.push(`Total: ${fmtMoneyBR(before.totalCents || 0)} → ${fmtMoneyBR(after.totalCents || 0)}`);
  }
  if (before.receivable?.balanceCents !== after.receivable?.balanceCents) {
    changes.push(
      `Saldo recebível: ${fmtMoneyBR(before.receivable?.balanceCents || 0)} → ${fmtMoneyBR(
        after.receivable?.balanceCents || 0
      )}`
    );
  }

  return changes.length ? changes : ["Ajuste registrado."];
}

export default function VendasClient() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [q, setQ] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // ✅ filtros
  const [clientId, setClientId] = useState<string>("ALL");
  const [status, setStatus] = useState<StatusFilter>("PENDING");

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [users, setUsers] = useState<UserLite[]>([]);

  // ✅ modal de detalhes
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const details = useMemo(
    () => (detailsId ? rows.find((r) => r.id === detailsId) || null : null),
    [rows, detailsId]
  );
  const isAdmin = user?.role === "admin";
  const canEditDetails =
    Boolean(details) &&
    isAdmin &&
    details?.paymentStatus !== "CANCELED" &&
    isTodaySaoPaulo(details?.createdAt || "");

  const [auditLogs, setAuditLogs] = useState<SaleAuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [editingSale, setEditingSale] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editFeeCardLabel, setEditFeeCardLabel] = useState("");
  const [editPoints, setEditPoints] = useState("");
  const [editMilheiro, setEditMilheiro] = useState("");
  const [editNote, setEditNote] = useState("");

  const cardOptions = useMemo<CardOption[]>(() => {
    const map = new Map<string, string>();
    map.set("Cartão Vias Aéreas", "Vias Aéreas");

    for (const u of users) {
      if (!u?.name) continue;
      const value = cardLabelForUser({ name: u.name, login: u.login || "" });
      map.set(value, u.login ? `${u.name} (@${u.login})` : u.name);
    }

    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [users]);

  const editCardSelectValue = useMemo(() => {
    const label = editFeeCardLabel.trim();
    if (!label) return CARD_NONE_VALUE;
    return cardOptions.some((option) => option.value === label)
      ? label
      : CARD_MANUAL_VALUE;
  }, [cardOptions, editFeeCardLabel]);

  async function load(opts?: { append?: boolean }) {
    const append = Boolean(opts?.append);
    if (append && !nextCursor) return;

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const qs = new URLSearchParams();
      if (append && nextCursor) qs.set("cursor", nextCursor);
      qs.set("limit", "200");
      if (q.trim()) qs.set("q", q.trim());
      if (clientId !== "ALL") qs.set("clientId", clientId);
      if (status !== "ALL") qs.set("status", status);

      const out = await api<{
        ok: true;
        sales: SaleRow[];
        nextCursor?: string | null;
      }>(`/api/vendas?${qs.toString()}`);

      const list = out.sales || [];

      if (append) setRows((prev) => [...prev, ...list]);
      else setRows(list);

      setNextCursor(out.nextCursor || null);
    } catch {
      if (!append) {
        setRows([]);
        setNextCursor(null);
      }
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }

  async function loadAudit(saleId: string) {
    setLoadingAudit(true);
    try {
      const out = await api<{ ok: true; logs: SaleAuditLog[] }>(`/api/vendas/${saleId}/audit`);
      setAuditLogs(out.logs || []);
    } catch {
      setAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  }

  async function saveAdminEdit() {
    if (!details || savingEdit) return;

    if (!canEditDetails) {
      alert("Essa venda só pode ser ajustada pelo admin no mesmo dia em que foi criada.");
      return;
    }

    const points = intFromBR(editPoints);
    const milheiroCents = moneyToCentsBR(editMilheiro);
    if (points <= 0) return alert("Quantidade de pontos inválida.");
    if (milheiroCents <= 0) return alert("Valor do milheiro inválido.");

    setSavingEdit(true);
    try {
      const out = await api<{ ok: true; sale: SaleRow }>(`/api/vendas/${details.id}/admin-edit`, {
        method: "PATCH",
        body: JSON.stringify({
          feeCardLabel: editFeeCardLabel.trim() || null,
          points,
          milheiroCents,
          note: editNote.trim() || null,
        }),
      });

      setRows((prev) => prev.map((x) => (x.id === out.sale.id ? out.sale : x)));
      setEditingSale(false);
      setEditNote("");
      await loadAudit(details.id);
    } catch (error: unknown) {
      alert(errorMessage(error, "Falha ao ajustar venda."));
    } finally {
      setSavingEdit(false);
    }
  }

  useEffect(() => {
    let alive = true;
    api<{ ok: true; hasSession: boolean; user: UserSession | null }>("/api/session")
      .then((out) => {
        if (alive) setUser(out.user || null);
      })
      .catch(() => {
        if (alive) setUser(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    api<{ ok: true; users: UserLite[] }>("/api/users/simple")
      .then((out) => {
        if (!alive) return;
        setUsers(
          (out.users || [])
            .filter((u) => u?.id && u?.name)
            .map((u) => ({ id: u.id, name: u.name, login: u.login || "" }))
        );
      })
      .catch(() => {
        if (alive) setUsers([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!details) {
      setAuditLogs([]);
      setEditingSale(false);
      return;
    }

    setEditingSale(false);
    setEditFeeCardLabel(details.feeCardLabel || "");
    setEditPoints(intInputBR(details.points));
    setEditMilheiro(moneyInputBR(details.milheiroCents));
    setEditNote("");
    loadAudit(details.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.id]);

  // ✅ busca no servidor (inclusive localizador) com debounce
  useEffect(() => {
    const delay = q.trim() ? 300 : 0;
    const t = setTimeout(() => {
      load();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, clientId, status]);

  const clients = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; identificador: string }>();
    for (const r of rows) {
      if (r?.cliente?.id && !map.has(r.cliente.id)) {
        map.set(r.cliente.id, {
          id: r.cliente.id,
          nome: r.cliente.nome || "—",
          identificador: r.cliente.identificador || "—",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR")
    );
  }, [rows]);

  const selectedClient = useMemo(() => {
    if (!clientId || clientId === "ALL") return null;
    return clients.find((c) => c.id === clientId) || null;
  }, [clients, clientId]);

  const filtered = useMemo(() => {
    const s = (q || "").trim().toLowerCase();

    return rows.filter((r) => {
      // 1) filtro cliente
      if (clientId !== "ALL" && r.cliente?.id !== clientId) return false;

      // 2) filtro status
      if (status !== "ALL" && r.paymentStatus !== status) return false;

      // 3) busca livre
      if (!s) return true;

      const ced = (r.cedente?.nomeCompleto || "").toLowerCase();
      const cedId = (r.cedente?.identificador || "").toLowerCase();
      const cliente = (r.cliente?.nome || "").toLowerCase();
      const num = (r.numero || "").toLowerCase();
      const loc = (r.locator || "").toLowerCase();
      const card = (r.feeCardLabel || "").toLowerCase();

      return (
        num.includes(s) ||
        cliente.includes(s) ||
        loc.includes(s) ||
        ced.includes(s) ||
        cedId.includes(s) ||
        card.includes(s)
      );
    });
  }, [rows, q, clientId, status]);

  const totals = useMemo(() => {
    let totalGeral = 0;
    let totalPend = 0;
    let totalPago = 0;

    for (const r of filtered) {
      totalGeral += r.totalCents || 0;

      const pend = pendingCentsOfSale(r);
      totalPend += pend;

      if (r.paymentStatus === "PAID") totalPago += r.totalCents || 0;
    }
    return { totalGeral, totalPend, totalPago, count: filtered.length };
  }, [filtered]);

  async function togglePago(r: SaleRow) {
    if (updatingId) return;
    if (r.paymentStatus === "CANCELED") return;

    const next: "PENDING" | "PAID" = r.paymentStatus === "PAID" ? "PENDING" : "PAID";

    setUpdatingId(r.id);
    try {
      await api<{ ok: true }>("/api/vendas/status", {
        method: "PATCH",
        // ✅ mando os dois nomes (status e paymentStatus) pra ser compatível
        body: JSON.stringify({ saleId: r.id, status: next, paymentStatus: next }),
      });

      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                paymentStatus: next,
                receivable: x.receivable
                  ? {
                      ...x.receivable,
                      status: next === "PAID" ? "RECEIVED" : "OPEN",
                      receivedCents: next === "PAID" ? x.totalCents : 0,
                      balanceCents: next === "PAID" ? 0 : x.totalCents,
                    }
                  : x.receivable,
              }
            : x
        )
      );
    } catch (error: unknown) {
      alert(errorMessage(error, "Falha ao atualizar status."));
    } finally {
      setUpdatingId(null);
    }
  }

  /**
   * ✅ Cancelar venda:
   * - sempre estorna pontos
   * - pergunta se mantém passageiros "queimados" (padrão) ou reseta (erro de cadastro)
   */
  async function cancelSale(r: SaleRow) {
    if (updatingId) return;
    if (r.paymentStatus === "CANCELED") return;

    const ok1 = confirm(
      `Cancelar a venda ${r.numero}?\n\n• Os pontos serão estornados para o cedente.\n• O recebível (se existir) será cancelado.`
    );
    if (!ok1) return;

    // ✅ padrão: manter passageiros usados (CPF queimado)
    const keepPassengers = confirm(
      "Manter o uso dos passageiros?\n\n✅ OK = MANTER (padrão). A cota NÃO volta (CPF queimado).\n❌ Cancelar = RESETAR. Use só se foi erro de cadastro e quer devolver a cota."
    );

    setUpdatingId(r.id);
    try {
      await api<{ ok: true }>("/api/vendas/cancelar", {
        method: "POST",
        body: JSON.stringify({ saleId: r.id, keepPassengers }),
      });

      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                paymentStatus: "CANCELED",
                receivable: x.receivable
                  ? {
                      ...x.receivable,
                      status: "CANCELED",
                      receivedCents: 0,
                      balanceCents: 0,
                    }
                  : x.receivable,
              }
            : x
        )
      );
    } catch (error: unknown) {
      alert(errorMessage(error, "Falha ao cancelar venda."));
    } finally {
      setUpdatingId(null);
    }
  }

  function statusBadge(r: SaleRow) {
    return r.paymentStatus === "PAID"
      ? "bg-emerald-50 border-emerald-200/80 text-emerald-800 ring-1 ring-emerald-200/70"
      : r.paymentStatus === "CANCELED"
        ? "bg-slate-100 border-slate-200/80 text-slate-700 ring-1 ring-slate-200/70"
        : "bg-amber-50 border-amber-200/80 text-amber-900 ring-1 ring-amber-200/70";
  }

  function statusLabel(r: SaleRow) {
    return r.paymentStatus === "PAID"
      ? "Pago"
      : r.paymentStatus === "CANCELED"
      ? "Cancelado"
      : "Pendente";
  }

  function chip(active: boolean) {
    return cn(
      "rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition",
      active
        ? "border-slate-900 bg-slate-900 text-white shadow-slate-900/20"
        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
    );
  }

  const headerSuffix = selectedClient ? ` • ${selectedClient.nome}` : "";

  // ✅ fechar modal com ESC
  useEffect(() => {
    if (!detailsId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailsId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailsId]);

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-4 pb-10 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm">
            <ShoppingBag className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            Gestão de pontos
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Vendas{headerSuffix}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Filtre por cliente e status para ver pendências e pagamentos.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-55"
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 text-slate-500", loading && "animate-spin")} strokeWidth={2} aria-hidden />
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <Link
            href="/dashboard/vendas/nova"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Nova venda
          </Link>
        </div>
      </div>

      {/* filtros */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={FIELD_LABEL}>Cliente</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={cn(CONTROL_SELECT, "min-w-[min(100%,320px)] w-full xl:w-auto")}
            >
              <option value="ALL">Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.identificador})
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={FIELD_LABEL}>Status</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(status === "ALL")} onClick={() => setStatus("ALL")}>
                Todos
              </button>
              <button type="button" className={chip(status === "PENDING")} onClick={() => setStatus("PENDING")}>
                Pendentes
              </button>
              <button type="button" className={chip(status === "PAID")} onClick={() => setStatus("PAID")}>
                Pagos
              </button>
              <button type="button" className={chip(status === "CANCELED")} onClick={() => setStatus("CANCELED")}>
                Cancelados
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5 basis-full lg:basis-[min(100%,32rem)]">
            <span className={FIELD_LABEL}>Busca</span>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
                aria-hidden
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cliente, número, localizador, cedente, cartão..."
                className={CONTROL_INPUT}
              />
            </div>
          </div>

          {(clientId !== "ALL" || status !== "PENDING" || q.trim()) && (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 xl:self-end"
              onClick={() => {
                setClientId("ALL");
                setStatus("PENDING");
                setQ("");
              }}
            >
              <FilterX className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Vendas (filtro)" value={fmtInt(totals.count)} accent="slate" />
        <SummaryStat
          label={selectedClient ? "Total no filtro (cliente)" : "Total no filtro"}
          value={fmtMoneyBR(totals.totalGeral)}
          accent="sky"
        />
        <SummaryStat
          label={selectedClient ? "Total pendente a receber (cliente)" : "Total pendente a receber"}
          value={fmtMoneyBR(totals.totalPend)}
          accent="amber"
        />
        <SummaryStat
          label={selectedClient ? "Total pago (cliente)" : "Total pago"}
          value={fmtMoneyBR(totals.totalPago)}
          accent="emerald"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/95">
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-[120px] px-4 py-3 text-left">Data</th>
                <th className="w-[130px] px-4 py-3 text-left">Venda</th>
                <th className="w-[260px] px-4 py-3 text-left">Cliente</th>
                <th className="w-[280px] px-4 py-3 text-left">Cedente</th>
                <th className="w-[120px] px-4 py-3 text-left">Programa</th>
                <th className="w-[140px] px-4 py-3 text-right">Pontos</th>
                <th className="w-[130px] px-4 py-3 text-right">Milheiro</th>
                <th className="w-[100px] px-4 py-3 text-right">Pax</th>
                <th className="w-[160px] px-4 py-3 text-right">Total</th>
                <th className="w-[170px] px-4 py-3 text-right">A receber</th>
                <th className="w-[140px] px-4 py-3 text-left">Status</th>
                <th className="w-[140px] px-4 py-3 text-left">Loc</th>
                <th className="w-[200px] px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-0">
                    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200/80">
                        <ShoppingBag className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">Nenhum resultado</p>
                      <p className="max-w-md text-xs leading-relaxed text-slate-500">
                        Ajuste os filtros ou a busca para encontrar vendas.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {filtered.map((r) => {
                const pend = pendingCentsOfSale(r);
                const isBusy = updatingId === r.id;

                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer transition hover:bg-slate-50/90"
                    onClick={() => setDetailsId(r.id)}
                    title="Clique para ver detalhes"
                  >
                    <td className="px-4 py-3">{fmtDateBR(r.date)}</td>

                    <td className="px-4 py-3 font-mono">
                      <button
                        className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailsId(r.id);
                        }}
                      >
                        {r.numero}
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{r.cliente.nome}</div>
                      <div className="text-xs text-slate-500">{r.cliente.identificador}</div>
                    </td>

                    <td className="px-4 py-3">
                      {r.cedente?.nomeCompleto ? (
                        <>
                          <div className="font-medium">{r.cedente.nomeCompleto}</div>
                          <div className="text-xs text-slate-500">{r.cedente.identificador}</div>
                        </>
                      ) : (
                        <div className="text-slate-400">—</div>
                      )}
                    </td>

                    <td className="px-4 py-3">{r.program}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.points)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtMoneyBR(r.milheiroCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.passengers)}</td>

                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {fmtMoneyBR(r.totalCents)}
                    </td>

                    <td
                      className={cn(
                        "px-4 py-3 text-right font-semibold tabular-nums",
                        pend > 0 ? "text-amber-800" : "text-slate-600"
                      )}
                    >
                      {fmtMoneyBR(pend)}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          statusBadge(r)
                        )}
                      >
                        {statusLabel(r)}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-mono text-xs">{r.locator || "—"}</td>

                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()} // ✅ não abrir detalhes ao clicar nos botões
                    >
                      {r.paymentStatus === "CANCELED" ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => togglePago(r)}
                            disabled={isBusy}
                            className={cn(
                              "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition",
                              isBusy ? "cursor-not-allowed opacity-60" : "hover:border-slate-300 hover:bg-slate-50"
                            )}
                            title={r.paymentStatus === "PAID" ? "Marcar como pendente" : "Marcar como pago"}
                          >
                            {isBusy
                              ? "Salvando..."
                              : r.paymentStatus === "PAID"
                              ? "Marcar pendente"
                              : "Marcar pago"}
                          </button>

                          <button
                            type="button"
                            onClick={() => cancelSale(r)}
                            disabled={isBusy}
                            className={cn(
                              "rounded-xl border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 shadow-sm transition",
                              isBusy ? "cursor-not-allowed opacity-60" : "hover:border-red-300 hover:bg-red-50"
                            )}
                            title="Cancelar venda (estorna pontos e opcionalmente reseta passageiros)"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {loading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center">
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
                      <RefreshCw className="h-4 w-4 animate-spin text-slate-400" strokeWidth={2} aria-hidden />
                      Carregando...
                    </span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-xs leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-700">A receber:</span> usa{" "}
          <code className="rounded bg-white px-1 py-0.5 text-[10px] text-slate-700 ring-1 ring-slate-200/80">
            Receivable.balanceCents
          </code>{" "}
          quando existir; caso contrário, o total da venda quando o status for Pendente.
        </div>
      </div>

      <div className="flex justify-center pb-2">
        {nextCursor ? (
          <button
            type="button"
            onClick={() => load({ append: true })}
            className={cn(
              "rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50",
              loadingMore && "pointer-events-none opacity-60"
            )}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
                Carregando...
              </span>
            ) : (
              "Carregar mais"
            )}
          </button>
        ) : (
          <div className="rounded-full border border-slate-200/80 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-500">
            Fim do histórico
          </div>
        )}
      </div>

      {/* ✅ MODAL DETALHES */}
      {details ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={() => setDetailsId(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <div className="text-xs text-slate-500">Detalhes da venda</div>
                <div className="text-lg font-semibold">
                  {details.numero} • {fmtDateBR(details.date)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Criada em {fmtDateTimeBR(details.createdAt)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isAdmin && details.paymentStatus !== "CANCELED" ? (
                  <button
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm",
                      canEditDetails
                        ? "hover:bg-slate-50"
                        : "cursor-not-allowed border-slate-200 text-slate-400"
                    )}
                    onClick={() => {
                      if (canEditDetails) setEditingSale((v) => !v);
                    }}
                    disabled={!canEditDetails}
                    title={
                      canEditDetails
                        ? "Ajustar venda"
                        : "Ajuste disponível só no dia em que a venda foi criada"
                    }
                  >
                    {editingSale ? "Ocultar ajuste" : "Ajustar"}
                  </button>
                ) : null}

                <button
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => setDetailsId(null)}
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="mt-1">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-1 text-xs",
                        statusBadge(details)
                      )}
                    >
                      {statusLabel(details)}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Programa</div>
                  <div className="mt-1 font-semibold">{details.program}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {fmtInt(details.points)} pts • {fmtInt(details.passengers)} pax
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Milheiro: <span className="font-semibold">{fmtMoneyBR(details.milheiroCents)}</span>
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Localizador</div>
                  <div className="mt-1 font-mono text-sm">{details.locator || "—"}</div>
                </div>
              </div>

              {/* ✅ cartão + taxa (SÓ no modal) */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Cartão usado</div>
                  <div className="mt-1 text-sm text-slate-800">
                    {details.feeCardLabel ? (
                      <span className="font-medium">{details.feeCardLabel}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Taxa de embarque</div>
                  <div className="mt-1 text-lg font-semibold">
                    {feeCentsOfSale(details) === null
                      ? "—"
                      : fmtMoneyBR(feeCentsOfSale(details) || 0)}
                  </div>
                </div>
              </div>

              {editingSale ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Ajuste administrativo</div>
                      <div className="text-xs text-slate-500">
                        Alterações ficam registradas no histórico da venda.
                      </div>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-white px-2 py-1 text-xs text-amber-700">
                      Hoje
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="text-xs text-slate-600">
                      Cartão usado
                      <select
                        value={editCardSelectValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === CARD_NONE_VALUE) {
                            setEditFeeCardLabel("");
                            return;
                          }
                          if (value === CARD_MANUAL_VALUE) {
                            if (editCardSelectValue !== CARD_MANUAL_VALUE) setEditFeeCardLabel("");
                            return;
                          }
                          setEditFeeCardLabel(value);
                        }}
                        className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        <option value={CARD_NONE_VALUE}>Sem cartão</option>
                        {cardOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                        <option value={CARD_MANUAL_VALUE}>Manual</option>
                      </select>
                      {editCardSelectValue === CARD_MANUAL_VALUE ? (
                        <input
                          value={editFeeCardLabel}
                          onChange={(e) => setEditFeeCardLabel(e.target.value)}
                          className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900"
                          placeholder="Ex: Cartão Inter PJ"
                        />
                      ) : (
                        <div className="mt-1 text-[11px] text-slate-500">
                          {editFeeCardLabel || "—"}
                        </div>
                      )}
                    </label>

                    <label className="text-xs text-slate-600">
                      Pontos
                      <input
                        value={editPoints}
                        onChange={(e) => setEditPoints(e.target.value)}
                        className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900"
                        inputMode="numeric"
                        placeholder="23.720"
                      />
                    </label>

                    <label className="text-xs text-slate-600">
                      Milheiro
                      <input
                        value={editMilheiro}
                        onChange={(e) => setEditMilheiro(e.target.value)}
                        className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900"
                        inputMode="decimal"
                        placeholder="28,00"
                      />
                    </label>
                  </div>

                  <label className="mt-3 block text-xs text-slate-600">
                    Observação
                    <input
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900"
                      placeholder="Motivo do ajuste"
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      className="rounded-xl border bg-white px-4 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setEditingSale(false);
                        setEditFeeCardLabel(details.feeCardLabel || "");
                        setEditPoints(intInputBR(details.points));
                        setEditMilheiro(moneyInputBR(details.milheiroCents));
                        setEditNote("");
                      }}
                      disabled={savingEdit}
                    >
                      Cancelar
                    </button>
                    <button
                      className={cn(
                        "rounded-xl bg-black px-4 py-2 text-sm text-white",
                        savingEdit ? "cursor-not-allowed opacity-60" : "hover:bg-gray-800"
                      )}
                      onClick={() => saveAdminEdit()}
                      disabled={savingEdit}
                    >
                      {savingEdit ? "Salvando..." : "Salvar ajuste"}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Cliente</div>
                  <div className="mt-1 font-semibold">{details.cliente.nome}</div>
                  <div className="text-xs text-slate-500">{details.cliente.identificador}</div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-xs text-slate-500">Cedente</div>
                  {details.cedente?.nomeCompleto ? (
                    <>
                      <div className="mt-1 font-semibold">{details.cedente.nomeCompleto}</div>
                      <div className="text-xs text-slate-500">{details.cedente.identificador}</div>
                    </>
                  ) : (
                    <div className="mt-1 text-slate-400">—</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="text-xs text-slate-500">Total</div>
                    <div className="text-lg font-semibold">{fmtMoneyBR(details.totalCents)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">A receber</div>
                    <div
                      className={cn(
                        "text-lg font-semibold",
                        pendingCentsOfSale(details) > 0 ? "text-amber-700" : "text-slate-800"
                      )}
                    >
                      {fmtMoneyBR(pendingCentsOfSale(details))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Recebível</div>
                    {details.receivable ? (
                      <div className="text-sm mt-1 text-slate-700">
                        <div>
                          ID: <span className="font-mono">{details.receivable.id}</span>
                        </div>
                        <div>
                          Status: <span className="font-semibold">{details.receivable.status}</span>
                        </div>
                        <div>
                          Total:{" "}
                          <span className="font-semibold">
                            {fmtMoneyBR(details.receivable.totalCents)}
                          </span>
                        </div>
                        <div>
                          Recebido:{" "}
                          <span className="font-semibold">
                            {fmtMoneyBR(details.receivable.receivedCents)}
                          </span>
                        </div>
                        <div>
                          Saldo:{" "}
                          <span className="font-semibold">
                            {fmtMoneyBR(details.receivable.balanceCents)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-slate-400">—</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">Histórico de alterações</div>
                  {loadingAudit ? <div className="text-xs text-slate-500">Carregando...</div> : null}
                </div>

                {auditLogs.length ? (
                  <div className="mt-3 space-y-2">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="rounded-xl border bg-slate-50 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                          <span>
                            {fmtDateTimeBR(log.createdAt)} •{" "}
                            {log.actor?.name || log.actorLogin || "admin"}
                          </span>
                          <span className="font-mono">{log.action}</span>
                        </div>
                        <div className="mt-1 text-sm text-slate-800">
                          {auditChanges(log).join(" • ")}
                        </div>
                        {log.note ? <div className="mt-1 text-xs text-slate-500">{log.note}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-slate-500">
                    {loadingAudit ? "Buscando histórico..." : "Nenhum ajuste registrado."}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 justify-end border-t pt-4">
                {details.paymentStatus !== "CANCELED" ? (
                  <>
                    <button
                      onClick={() => togglePago(details)}
                      disabled={updatingId === details.id}
                      className={cn(
                        "rounded-xl border px-4 py-2 text-sm",
                        updatingId === details.id ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50"
                      )}
                    >
                      {updatingId === details.id
                        ? "Salvando..."
                        : details.paymentStatus === "PAID"
                        ? "Marcar pendente"
                        : "Marcar pago"}
                    </button>

                    <button
                      onClick={() => cancelSale(details)}
                      disabled={updatingId === details.id}
                      className={cn(
                        "rounded-xl border px-4 py-2 text-sm border-red-300 text-red-700",
                        updatingId === details.id ? "opacity-60 cursor-not-allowed" : "hover:bg-red-50"
                      )}
                    >
                      Cancelar venda
                    </button>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Venda cancelada.</div>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Dica: aperta <span className="font-mono">ESC</span> pra fechar.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
