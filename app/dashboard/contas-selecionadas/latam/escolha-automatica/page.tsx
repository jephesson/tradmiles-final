"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  MessageCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { buildWhatsAppLink, normalizeBRPhoneToE164 } from "@/lib/whatsapp";

type Row = {
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    telefone?: string | null;
    pontosLatam: number;
  };
  owner: { id: string; name: string; login: string };
  account: { cpfLimit: number; cpfUsed: number; cpfFree: number };
  clubLabel: "sem clube" | "cancelado";
  turboStatus: "PENDING" | "TRANSFERRED" | "SKIPPED" | null;
};

type ApiResp = {
  ok: true;
  monthKey: string;
  minFree: number;
  summary: { accounts: number; paxFree: number };
  rows: Row[];
};

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function monthLabel(key: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return d.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftMonthKey(key: string, delta: number) {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function whatsappHref(telefone?: string | null) {
  const e164 = normalizeBRPhoneToE164(telefone);
  if (!e164) return null;
  return buildWhatsAppLink(e164);
}

function turboLabel(s: Row["turboStatus"]) {
  if (s === "SKIPPED") return "Negado";
  if (s === "PENDING") return "Aguardando";
  return "—";
}

export default function EscolhaAutomaticaLatamPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [minFreeInput, setMinFreeInput] = useState("5");
  const [minFree, setMinFree] = useState(5);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiResp | null>(null);

  async function load(nextMinFree = minFree) {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({
        monthKey,
        minFree: String(nextMinFree),
      });
      if (q.trim()) qs.set("q", q.trim());
      const res = await fetch(
        `/api/contas-selecionadas/latam/escolha-automatica?${qs}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao gerar a lista");
      setData(json as ApiResp);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, minFree]);

  const displayMonth = data?.monthKey || monthKey;
  const rows = data?.rows || [];
  const grouped = useMemo(() => {
    const map = new Map<string, { owner: Row["owner"]; rows: Row[] }>();
    for (const r of rows) {
      const key = r.owner.id || r.owner.login;
      const cur = map.get(key) || { owner: r.owner, rows: [] };
      cur.rows.push(r);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.owner.name.localeCompare(b.owner.name, "pt-BR", { sensitivity: "base" })
    );
  }, [rows]);

  function applyMinFree() {
    const n = Math.max(0, Math.min(999, Math.trunc(Number(minFreeInput) || 0)));
    setMinFreeInput(String(n));
    setMinFree(n);
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const qs = new URLSearchParams({
        monthKey: displayMonth,
        minFree: String(minFree),
      });
      if (q.trim()) qs.set("q", q.trim());
      const res = await fetch(
        `/api/contas-selecionadas/latam/escolha-automatica/pdf?${qs}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "Falha ao gerar o PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `escolha-automatica-latam-${displayMonth}-min${minFree}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Escolha automática
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Contas LATAM com mais de {fmtInt(minFree)} passageiros livres, sem clube
            ativo ou inativo, que não foram transferidas no Turbo e que não cancelaram
            no mês já estando como transferidas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              className="px-2.5 py-2 text-slate-600 hover:text-slate-900"
              onClick={() => setMonthKey(shiftMonthKey(displayMonth, -1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[9.5rem] px-1 text-center text-sm font-semibold capitalize text-slate-800">
              {monthLabel(displayMonth)}
            </div>
            <button
              type="button"
              className="px-2.5 py-2 text-slate-600 hover:text-slate-900"
              onClick={() => setMonthKey(shiftMonthKey(displayMonth, 1))}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <label className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
            <span className="whitespace-nowrap text-slate-500">Livres &gt;</span>
            <input
              className="w-14 bg-transparent text-sm font-semibold tabular-nums outline-none"
              inputMode="numeric"
              value={minFreeInput}
              onChange={(e) => setMinFreeInput(e.target.value.replace(/\D+/g, ""))}
              onBlur={applyMinFree}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyMinFree();
              }}
            />
          </label>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 sm:w-64"
              placeholder="Buscar nome, identificador ou CPF"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
            />
          </div>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={() => {
              applyMinFree();
              load(Math.max(0, Math.min(999, Math.trunc(Number(minFreeInput) || 0))));
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Gerar lista
          </button>
          <button
            type="button"
            disabled={pdfBusy || loading}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold",
              pdfBusy
                ? "border-slate-200 bg-slate-50 text-slate-400"
                : "border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100"
            )}
            onClick={downloadPdf}
          >
            {pdfBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            PDF
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Contas
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {loading && !data ? "—" : fmtInt(data?.summary.accounts || 0)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Passageiros livres
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-teal-800">
            {loading && !data ? "—" : fmtInt(data?.summary.paxFree || 0)}
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Gerando lista…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Nenhuma conta com esses filtros.
        </div>
      ) : (
        <div className="grid gap-5">
          {grouped.map((g) => (
            <section
              key={g.owner.id || g.owner.login}
              className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40"
            >
              <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{g.owner.name}</div>
                  <div className="text-xs text-slate-500">@{g.owner.login}</div>
                </div>
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-teal-800">
                  {fmtInt(g.rows.length)} contas · {fmtInt(g.rows.reduce((a, r) => a + r.account.cpfFree, 0))} livres
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Identificador</th>
                      <th className="px-3 py-3">Nome</th>
                      <th className="px-3 py-3">CPF</th>
                      <th className="px-3 py-3">Livres</th>
                      <th className="px-3 py-3">Limite</th>
                      <th className="px-3 py-3">Usados</th>
                      <th className="px-3 py-3">Clube</th>
                      <th className="px-3 py-3">Turbo</th>
                      <th className="px-3 py-3 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const wa = whatsappHref(r.cedente.telefone);
                      return (
                        <tr
                          key={r.cedente.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {r.cedente.identificador}
                          </td>
                          <td className="px-3 py-3 text-slate-800">{r.cedente.nomeCompleto}</td>
                          <td className="px-3 py-3 tabular-nums text-slate-600">{r.cedente.cpf}</td>
                          <td className="px-3 py-3">
                            <span className="inline-flex min-w-7 justify-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-teal-800">
                              {r.account.cpfFree}
                            </span>
                          </td>
                          <td className="px-3 py-3 tabular-nums text-slate-600">
                            {r.account.cpfLimit}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-slate-600">
                            {r.account.cpfUsed}
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {r.clubLabel === "cancelado" ? "Cancelado" : "Sem clube"}
                          </td>
                          <td className="px-3 py-3 text-slate-600">{turboLabel(r.turboStatus)}</td>
                          <td className="px-3 py-3 pr-4">
                            {wa ? (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                aria-label="WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
