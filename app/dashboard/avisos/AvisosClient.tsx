"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  Loader2,
  Megaphone,
  Plus,
  RotateCcw,
  Trash2,
  User as UserIcon,
  Users,
} from "lucide-react";
import { getSession } from "@/lib/auth";

type AvisoStatus = "PENDENTE" | "RESOLVIDO";
type AvisoAudience = "GROUP" | "USER" | "SELF";

type Member = { id: string; name: string; login: string };

type Person = { id: string; name: string; login: string } | null;

type Row = {
  id: string;
  status: AvisoStatus;
  titulo: string | null;
  texto: string;
  dateISO: string;
  audience: AvisoAudience;
  targetUser: Person;
  createdBy: Person;
  resolvedBy: Person;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function todayISO() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD (local)
}

function fmtDateBR(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function fmtDateTimeBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("pt-BR");
}

function audienceLabel(row: Row) {
  if (row.audience === "GROUP") return "Todo o grupo";
  if (row.audience === "SELF") return "Só para mim";
  return row.targetUser ? `Para ${row.targetUser.name}` : "Pessoa específica";
}

function audienceClass(audience: AvisoAudience) {
  if (audience === "GROUP") return "border-sky-200 bg-sky-50 text-sky-700";
  if (audience === "SELF") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-teal-200 bg-teal-50 text-teal-700";
}

function AudienceIcon({ audience }: { audience: AvisoAudience }) {
  if (audience === "GROUP") return <Users className="h-3.5 w-3.5" aria-hidden />;
  if (audience === "SELF") return <UserIcon className="h-3.5 w-3.5" aria-hidden />;
  return <Megaphone className="h-3.5 w-3.5" aria-hidden />;
}

export default function AvisosClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [meId, setMeId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // formulário
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [dateISO, setDateISO] = useState(todayISO());
  const [audience, setAudience] = useState<AvisoAudience>("GROUP");
  const [targetUserId, setTargetUserId] = useState("");

  // filtros
  const [statusFilter, setStatusFilter] = useState<"" | AvisoStatus>("PENDENTE");
  const [audienceFilter, setAudienceFilter] = useState<"" | AvisoAudience>("");
  const [dateFilter, setDateFilter] = useState("");
  const [q, setQ] = useState("");

  const role = useMemo(() => getSession()?.role ?? "staff", []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/avisos", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar avisos.");
      }
      setRows((json.rows || []) as Row[]);
      setMembers((json.members || []) as Member[]);
      setMeId(String(json?.me?.id || ""));
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const today = todayISO();

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (audienceFilter && r.audience !== audienceFilter) return false;
      if (dateFilter && r.dateISO !== dateFilter) return false;
      if (!text) return true;
      const hay = `${r.titulo || ""} ${r.texto} ${r.createdBy?.name || ""} ${
        r.targetUser?.name || ""
      }`.toLowerCase();
      return hay.includes(text);
    });
  }, [rows, statusFilter, audienceFilter, dateFilter, q]);

  const todayCount = useMemo(
    () => rows.filter((r) => r.dateISO === today && r.status === "PENDENTE").length,
    [rows, today]
  );

  async function createAviso() {
    if (texto.trim().length < 3) {
      alert("O aviso deve ter pelo menos 3 caracteres.");
      return;
    }
    if (audience === "USER" && !targetUserId) {
      alert("Selecione o destinatário do aviso.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/avisos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          texto,
          dateISO,
          audience,
          targetUserId: audience === "USER" ? targetUserId : null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao criar aviso.");
      }
      setTitulo("");
      setTexto("");
      setDateISO(todayISO());
      setAudience("GROUP");
      setTargetUserId("");
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao criar aviso.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, next: AvisoStatus) {
    setBusyId(id);
    try {
      const res = await fetch("/api/avisos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao atualizar status.");
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao atualizar.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeAviso(id: string) {
    if (!confirm("Excluir este aviso? Esta ação não pode ser desfeita.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/avisos?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao excluir aviso.");
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao excluir.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/25">
            <Bell className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Avisos
            </h1>
            <p className="text-sm text-slate-500">
              Mural de avisos do time. Escreva, defina a data e o destinatário.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {todayCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {todayCount} para hoje
            </span>
          ) : null}
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Atualizar
          </button>
        </div>
      </div>

      {/* Novo aviso */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Plus className="h-4 w-4 text-orange-500" aria-hidden />
          Novo aviso
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              Título <span className="text-slate-400">(opcional)</span>
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Manutenção no sistema amanhã"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">
              Data do aviso
            </label>
            <input
              type="date"
              value={dateISO}
              onChange={(e) => setDateISO(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Aviso</label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva o aviso..."
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Para quem</label>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
              {(
                [
                  { v: "GROUP", label: "Grupo", Icon: Users },
                  { v: "USER", label: "Pessoa", Icon: Megaphone },
                  { v: "SELF", label: "Para mim", Icon: UserIcon },
                ] as const
              ).map(({ v, label, Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAudience(v)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition ${
                    audience === v
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">
              Destinatário
            </label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              disabled={audience !== "USER"}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">
                {audience === "USER" ? "Selecione..." : "—"}
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (@{m.login})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={createAviso}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition hover:from-amber-600 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              {saving ? "Publicando..." : "Publicar aviso"}
            </button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { v: "PENDENTE", label: "Pendentes" },
              { v: "RESOLVIDO", label: "Resolvidos" },
              { v: "", label: "Todos" },
            ] as const
          ).map(({ v, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => setStatusFilter(v)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                statusFilter === v
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value as "" | AvisoAudience)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
          >
            <option value="">Todos os destinos</option>
            <option value="GROUP">Todo o grupo</option>
            <option value="USER">Pessoa específica</option>
            <option value="SELF">Só para mim</option>
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar aviso, autor..."
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 sm:w-64"
          />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Carregando avisos...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <Bell className="h-8 w-8 text-slate-300" aria-hidden />
          <div className="text-sm font-medium text-slate-600">
            Nenhum aviso por aqui
          </div>
          <div className="text-xs text-slate-400">
            Crie o primeiro aviso usando o formulário acima.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((r) => {
            const isToday = r.dateISO === today;
            const resolved = r.status === "RESOLVIDO";
            const canDelete = r.createdBy?.id === meId || role === "admin";
            return (
              <div
                key={r.id}
                className={`group relative flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
                  resolved
                    ? "border-slate-200 opacity-80"
                    : isToday
                    ? "border-amber-300 ring-2 ring-amber-100"
                    : "border-slate-200"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${audienceClass(
                      r.audience
                    )}`}
                  >
                    <AudienceIcon audience={r.audience} />
                    {audienceLabel(r)}
                  </span>

                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    <CalendarDays className="h-3 w-3" aria-hidden />
                    {fmtDateBR(r.dateISO)}
                  </span>

                  {isToday && !resolved ? (
                    <span className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                      Hoje
                    </span>
                  ) : null}

                  <span
                    className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      resolved
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {resolved ? "Resolvido" : "Pendente"}
                  </span>
                </div>

                {r.titulo ? (
                  <div
                    className={`text-sm font-semibold text-slate-900 ${
                      resolved ? "line-through decoration-slate-300" : ""
                    }`}
                  >
                    {r.titulo}
                  </div>
                ) : null}

                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {r.texto}
                </p>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="min-w-0 text-[11px] leading-tight text-slate-500">
                    <div className="truncate">
                      Por{" "}
                      <span className="font-medium text-slate-700">
                        {r.createdBy?.name || "—"}
                      </span>
                    </div>
                    {resolved ? (
                      <div className="truncate text-emerald-600">
                        Resolvido por {r.resolvedBy?.name || "—"} •{" "}
                        {fmtDateTimeBR(r.resolvedAt)}
                      </div>
                    ) : (
                      <div className="truncate text-slate-400">
                        Criado em {fmtDateTimeBR(r.createdAt)}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {resolved ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => changeStatus(r.id, "PENDENTE")}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Reabrir
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => changeStatus(r.id, "RESOLVIDO")}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Resolver
                      </button>
                    )}

                    {canDelete ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => removeAviso(r.id)}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"
                        aria-label="Excluir aviso"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
