"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  CalendarDays,
  Copy,
  KeyRound,
  Loader2,
  Plane,
  Search,
  Ticket,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { VerificationCodeFetch } from "@/components/cedentes/VerificationCodeFetch";
import {
  cancelFinePaxCount,
  computeCancelFineTotalCents,
  defaultCancelFinePerPaxCents,
} from "@/lib/vendas/cancelFine";

type PaymentStatus = "PENDING" | "PAID" | "CANCELED";

type TicketRow = {
  id: string;
  numero: string;
  date: string;
  program: string;
  points: number;
  passengers: number;
  milheiroCents: number;
  embarqueFeeCents: number;
  pointsValueCents: number;
  totalCents: number;
  paymentStatus: PaymentStatus;
  locator: string | null;
  purchaseCode: string | null;
  firstPassengerLastName: string | null;
  departureAirportIata: string | null;
  departureDate: string | null;
  returnDate: string | null;
  feeCardLabel: string | null;
  latamLocatorCheckStatus: string | null;
  smilesLocatorManualStatus: string | null;
  smilesConfirmPassengerNames: string | null;
  canceledAt: string | null;
  cancelFineCents: number;
  cancelRefundCents: number;
  cliente: {
    id: string;
    identificador: string;
    nome: string;
    cpfCnpj: string | null;
    telefone: string | null;
  };
  cedente: { id: string; identificador: string; nomeCompleto: string } | null;
  seller: { id: string; name: string; login: string } | null;
  purchase: { id: string; numero: string } | null;
  createdAt: string;
};

type StatusFilter = "ALL" | "ACTIVE" | "CANCELED";
type ProgramKey = "LATAM" | "SMILES" | "LIVELO" | "ESFERA" | "IBERIA";

function asProgramKey(raw: string | null | undefined): ProgramKey | null {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "LATAM" || u === "SMILES" || u === "LIVELO" || u === "ESFERA" || u === "IBERIA") {
    return u;
  }
  return null;
}

function CredCopyField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string | null | undefined;
  copied: boolean;
  onCopy: () => void;
}) {
  const text = String(value || "").trim();
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 break-all font-mono text-sm font-medium text-slate-900">{text || "—"}</div>
      {text ? (
        <button
          type="button"
          onClick={onCopy}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copiado" : "Copiar"}
        </button>
      ) : null}
    </div>
  );
}

function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}

function moneyToCentsBR(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function moneyInputBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateBR(v: string | null | undefined) {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v).trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function statusLabel(s: PaymentStatus) {
  if (s === "PAID") return "Pago";
  if (s === "CANCELED") return "Cancelado";
  return "Pendente";
}

function statusClass(s: PaymentStatus) {
  if (s === "PAID") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (s === "CANCELED") return "bg-rose-50 text-rose-800 ring-rose-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

export default function LocalizadoresClient() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<TicketRow | null>(null);
  const [cancelChargeFine, setCancelChargeFine] = useState(true);
  const [cancelFinePerPaxStr, setCancelFinePerPaxStr] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [creds, setCreds] = useState<{
    cpf: string;
    email: string | null;
    senhaPrograma: string | null;
    senhaEmail: string | null;
    senhaLivelo: string | null;
  } | null>(null);
  const [credsLoading, setCredsLoading] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState("");

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (q.trim()) qs.set("q", q.trim());
        qs.set("status", status);
        qs.set("limit", "50");
        const res = await fetch(`/api/localizadores?${qs.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao buscar.");
        if (!cancelled) {
          setRows(Array.isArray(json.sales) ? json.sales : []);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Falha ao buscar.");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, q.trim() ? 280 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, status]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) || rows[0] || null,
    [rows, selectedId]
  );

  useEffect(() => {
    if (!selectedId && rows[0]) setSelectedId(rows[0].id);
    if (selectedId && !rows.some((r) => r.id === selectedId)) {
      setSelectedId(rows[0]?.id || null);
    }
  }, [rows, selectedId]);

  useEffect(() => {
    const cedenteId = selected?.cedente?.id;
    const program = asProgramKey(selected?.program);
    if (!cedenteId || !program) {
      setCreds(null);
      setCredsError(null);
      setCredsLoading(false);
      return;
    }

    let cancelled = false;
    setCredsLoading(true);
    setCredsError(null);
    setCopiedField("");

    (async () => {
      try {
        const fetches: Promise<Response>[] = [
          fetch(
            `/api/cedentes/credentials?cedenteId=${encodeURIComponent(cedenteId)}&program=${program}`,
            { cache: "no-store", credentials: "include" }
          ),
        ];
        if (program === "LATAM") {
          fetches.push(
            fetch(
              `/api/cedentes/credentials?cedenteId=${encodeURIComponent(cedenteId)}&program=LIVELO`,
              { cache: "no-store", credentials: "include" }
            )
          );
        }
        const responses = await Promise.all(fetches);
        const jsons = await Promise.all(responses.map((r) => r.json().catch(() => null)));
        const mainRes = responses[0];
        const mainJson = jsons[0];
        if (!mainRes.ok || !mainJson?.ok) {
          throw new Error(mainJson?.error || "Falha ao carregar credenciais.");
        }
        const liveloJson = jsons[1];
        if (cancelled) return;
        setCreds({
          cpf: String(mainJson.data?.cpf || ""),
          email: mainJson.data?.email ?? liveloJson?.data?.email ?? null,
          senhaPrograma: mainJson.data?.senhaPrograma ?? null,
          senhaEmail: mainJson.data?.senhaEmail ?? liveloJson?.data?.senhaEmail ?? null,
          senhaLivelo: program === "LATAM" ? liveloJson?.data?.senhaPrograma ?? null : null,
        });
      } catch (e: unknown) {
        if (cancelled) return;
        setCreds(null);
        setCredsError(e instanceof Error ? e.message : "Falha ao carregar credenciais.");
      } finally {
        if (!cancelled) setCredsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected?.cedente?.id, selected?.program]);

  async function copyValue(field: string, value: string | null | undefined) {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((curr) => (curr === field ? "" : curr));
      }, 1400);
    } catch {
      /* ignore */
    }
  }

  function openCancel(r: TicketRow) {
    setCancelTarget(r);
    setCancelChargeFine(true);
    setCancelFinePerPaxStr(moneyInputBR(defaultCancelFinePerPaxCents(r.program)));
  }

  async function confirmCancel() {
    const r = cancelTarget;
    if (!r || cancelSubmitting) return;
    const pax = cancelFinePaxCount(r.passengers);
    const finePerPaxCents = cancelChargeFine ? moneyToCentsBR(cancelFinePerPaxStr) : 0;
    const fineCents = cancelChargeFine
      ? computeCancelFineTotalCents({ perPaxCents: finePerPaxCents, passengers: pax })
      : 0;
    if (cancelChargeFine && fineCents <= 0) {
      alert("Informe o valor da multa por passageiro.");
      return;
    }
    if (
      !confirm(
        `Cancelar ${r.locator || r.numero}?\nPontos voltam ao cedente. CPF permanece usado.`
      )
    )
      return;

    setCancelSubmitting(true);
    try {
      const res = await fetch("/api/vendas/cancelar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: r.id,
          chargeFine: cancelChargeFine,
          finePerPaxCents: cancelChargeFine ? finePerPaxCents : 0,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Falha ao cancelar.");
      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                paymentStatus: "CANCELED",
                canceledAt: new Date().toISOString(),
                cancelFineCents: Math.max(0, json.fineCents || 0),
                cancelRefundCents: Math.max(0, json.refundCents || 0),
              }
            : x
        )
      );
      setCancelTarget(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Falha ao cancelar.");
    } finally {
      setCancelSubmitting(false);
    }
  }

  const passengerNames = selected?.smilesConfirmPassengerNames
    ? selected.smilesConfirmPassengerNames
        .split(/[;\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
              <Ticket className="h-3.5 w-3.5" strokeWidth={2.2} />
              Passagens
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Gerenciamento de localizadores
            </h1>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Busque pelo localizador, nome do cliente ou CPF e veja a passagem completa — com
              opção de cancelar.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-base text-slate-900 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-900/10"
              placeholder="Localizador, cliente, CPF, Order ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </label>
          <div className="flex rounded-2xl border border-slate-200 bg-white p-1 text-sm font-semibold shadow-sm">
            {(
              [
                ["ALL", "Todos"],
                ["ACTIVE", "Ativos"],
                ["CANCELED", "Cancelados"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatus(id)}
                className={cn(
                  "rounded-xl px-3 py-2 transition",
                  status === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <section className="min-h-[420px] overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
          {loading ? (
            <div className="flex h-80 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando passagens…
            </div>
          ) : error ? (
            <div className="px-6 py-16 text-center text-sm text-rose-700">{error}</div>
          ) : !rows.length ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">
              {q.trim().length >= 2
                ? "Nenhuma passagem encontrada para essa busca."
                : "Nenhum localizador recente. Digite para buscar."}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const active = selected?.id === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-4 text-left transition sm:px-5",
                        active ? "bg-sky-50/80" : "hover:bg-slate-50"
                      )}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                        <Plane className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-bold tracking-wide text-slate-900">
                            {r.locator || "Sem localizador"}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                              statusClass(r.paymentStatus)
                            )}
                          >
                            {statusLabel(r.paymentStatus)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {r.program}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-sm font-medium text-slate-800">
                          {r.cliente.nome}
                        </div>
                        <div className="mt-0.5 text-[12px] text-slate-500">
                          {r.departureAirportIata || "—"} · {fmtDateBR(r.departureDate)}
                          {r.returnDate ? ` → ${fmtDateBR(r.returnDate)}` : ""}
                          {" · "}
                          {fmtInt(r.passengers)} pax
                        </div>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <div className="text-sm font-semibold tabular-nums text-slate-900">
                          {fmtMoneyBR(r.totalCents)}
                        </div>
                        <div className="text-[11px] text-slate-500">{r.numero}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
          {!selected ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-sm text-slate-500">
              <Ticket className="mb-3 h-8 w-8 text-slate-300" />
              Selecione uma passagem para ver os dados completos.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Localizador
                  </div>
                  <div className="mt-0.5 font-mono text-2xl font-bold tracking-wide text-slate-900">
                    {selected.locator || "—"}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {selected.numero} · {selected.program}
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                    statusClass(selected.paymentStatus)
                  )}
                >
                  {statusLabel(selected.paymentStatus)}
                </span>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" /> Trecho
                </div>
                <div className="mt-2 text-lg font-bold text-slate-900">
                  {selected.departureAirportIata || "—"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Ida {fmtDateBR(selected.departureDate)}
                  {selected.returnDate ? ` · Volta ${fmtDateBR(selected.returnDate)}` : " · só ida"}
                </div>
                {selected.purchaseCode ? (
                  <div className="mt-2 font-mono text-xs text-slate-500">
                    Order ID {selected.purchaseCode}
                  </div>
                ) : null}
              </div>

              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <UserRound className="h-3.5 w-3.5" /> Cliente e passageiros
                </div>
                <div className="mt-2 font-semibold text-slate-900">{selected.cliente.nome}</div>
                <div className="text-sm text-slate-500">
                  {selected.cliente.identificador}
                  {selected.cliente.cpfCnpj ? ` · ${selected.cliente.cpfCnpj}` : ""}
                </div>
                {selected.cliente.telefone ? (
                  <div className="text-sm text-slate-500">{selected.cliente.telefone}</div>
                ) : null}
                <div className="mt-2 text-sm text-slate-700">
                  {fmtInt(selected.passengers)} passageiro{selected.passengers === 1 ? "" : "s"}
                  {selected.firstPassengerLastName
                    ? ` · 1º sobrenome ${selected.firstPassengerLastName}`
                    : ""}
                </div>
                {passengerNames.length ? (
                  <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                    {passengerNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                ) : null}
                <Link
                  href={`/dashboard/clientes/${selected.cliente.id}`}
                  className="mt-2 inline-block text-[12px] font-semibold text-sky-700 hover:underline"
                >
                  Abrir ficha do cliente
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase text-slate-500">Pontos</div>
                  <div className="font-semibold tabular-nums">{fmtInt(selected.points)}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase text-slate-500">Total</div>
                  <div className="font-semibold tabular-nums">{fmtMoneyBR(selected.totalCents)}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase text-slate-500">Milheiro</div>
                  <div className="font-semibold tabular-nums">
                    {fmtMoneyBR(selected.milheiroCents)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase text-slate-500">Taxa</div>
                  <div className="font-semibold tabular-nums">
                    {fmtMoneyBR(selected.embarqueFeeCents)}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-sm text-slate-600">
                <div>
                  <b>Cedente:</b>{" "}
                  {selected.cedente
                    ? `${selected.cedente.nomeCompleto} (${selected.cedente.identificador})`
                    : "—"}
                </div>
                <div>
                  <b>Compra:</b> {selected.purchase?.numero || "—"}
                </div>
                <div>
                  <b>Vendedor:</b>{" "}
                  {selected.seller
                    ? `${selected.seller.name}${selected.seller.login ? ` (@${selected.seller.login})` : ""}`
                    : "—"}
                </div>
                {selected.feeCardLabel ? (
                  <div>
                    <b>Cartão:</b> {selected.feeCardLabel}
                  </div>
                ) : null}
              </div>

              {selected.cedente ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <KeyRound className="h-3.5 w-3.5" />
                    Acesso da conta
                  </div>
                  {credsError ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {credsError}
                    </div>
                  ) : credsLoading && !creds ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando credenciais e código…
                    </div>
                  ) : creds ? (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-1 gap-2">
                        <CredCopyField
                          label="CPF (login)"
                          value={creds.cpf}
                          copied={copiedField === "cpf"}
                          onCopy={() => copyValue("cpf", creds.cpf)}
                        />
                        <CredCopyField
                          label={`Senha ${selected.program}`}
                          value={creds.senhaPrograma}
                          copied={copiedField === "senhaPrograma"}
                          onCopy={() => copyValue("senhaPrograma", creds.senhaPrograma)}
                        />
                        {asProgramKey(selected.program) === "LATAM" ? (
                          <CredCopyField
                            label="Senha LIVELO"
                            value={creds.senhaLivelo}
                            copied={copiedField === "senhaLivelo"}
                            onCopy={() => copyValue("senhaLivelo", creds.senhaLivelo)}
                          />
                        ) : null}
                        <CredCopyField
                          label="E-mail"
                          value={creds.email}
                          copied={copiedField === "email"}
                          onCopy={() => copyValue("email", creds.email)}
                        />
                        <CredCopyField
                          label="Senha do e-mail"
                          value={creds.senhaEmail}
                          copied={copiedField === "senhaEmail"}
                          onCopy={() => copyValue("senhaEmail", creds.senhaEmail)}
                        />
                      </div>
                      {asProgramKey(selected.program) === "LATAM" ||
                      asProgramKey(selected.program) === "SMILES" ? (
                        <VerificationCodeFetch
                          cedenteId={selected.cedente.id}
                          program={asProgramKey(selected.program) === "SMILES" ? "SMILES" : "LATAM"}
                          email={creds.email}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-slate-500">Sem credenciais neste cedente.</div>
                  )}
                </div>
              ) : null}

              {selected.paymentStatus === "CANCELED" ? (
                <div className="rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-sm text-rose-800">
                  Localizador cancelado
                  {selected.cancelFineCents
                    ? ` · multa ${fmtMoneyBR(selected.cancelFineCents)}`
                    : ""}
                  {selected.cancelRefundCents
                    ? ` · reembolso ${fmtMoneyBR(selected.cancelRefundCents)}`
                    : ""}
                  .
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openCancel(selected)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
                >
                  <Ban className="h-4 w-4" />
                  Cancelar localizador
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      {cancelTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
          onMouseDown={() => !cancelSubmitting && setCancelTarget(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(() => {
              const r = cancelTarget;
              const pax = cancelFinePaxCount(r.passengers);
              const perPax = cancelChargeFine ? moneyToCentsBR(cancelFinePerPaxStr) : 0;
              const fineTotal = cancelChargeFine
                ? computeCancelFineTotalCents({ perPaxCents: perPax, passengers: pax })
                : 0;
              const wasPaid = r.paymentStatus === "PAID";
              const refund = wasPaid ? Math.max(0, (r.totalCents || 0) - fineTotal) : 0;
              return (
                <>
                  <div className="text-lg font-bold text-slate-900">Cancelar localizador</div>
                  <p className="mt-1 text-sm text-slate-500">
                    {r.locator || r.numero} · {r.cliente.nome}
                  </p>
                  <p className="mt-3 text-sm text-slate-700">
                    Pontos voltam ao cedente. O CPF permanece usado. Bebê não entra na multa —{" "}
                    {fmtInt(pax)} passageiro{pax === 1 ? "" : "s"}.
                  </p>
                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={cancelChargeFine}
                      onChange={(e) => setCancelChargeFine(e.target.checked)}
                      disabled={cancelSubmitting}
                    />
                    <span>
                      <span className="font-semibold text-slate-900">Cobrar multa por CPF</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Não entra no lucro da venda.
                      </span>
                    </span>
                  </label>
                  {cancelChargeFine ? (
                    <label className="mt-3 block text-sm font-medium text-slate-700">
                      Multa por passageiro
                      <input
                        className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 font-semibold tabular-nums"
                        value={cancelFinePerPaxStr}
                        onChange={(e) => setCancelFinePerPaxStr(e.target.value)}
                        inputMode="decimal"
                      />
                      <span className="mt-1 block text-xs text-slate-500">
                        Total {fmtMoneyBR(fineTotal)}
                        {wasPaid ? ` · reembolso ${fmtMoneyBR(refund)}` : ""}
                      </span>
                    </label>
                  ) : null}
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium"
                      onClick={() => setCancelTarget(null)}
                      disabled={cancelSubmitting}
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                      onClick={() => void confirmCancel()}
                      disabled={cancelSubmitting}
                    >
                      {cancelSubmitting ? "Cancelando…" : "Confirmar cancelamento"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
