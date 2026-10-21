"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import { getSession } from "@/lib/auth";

type LedgerLine = {
  dateISO: string;
  origin: "OWN" | "VOLUNTARY" | "CREDIT";
  startHHMM: string;
  endHHMM: string;
  declaredHours: number;
  fulfilledHours: number;
  creditHours: number;
  note: string;
};

type DayAttendance = {
  dateISO: string;
  declaredHours: number;
  fulfilledHours: number;
  attendance: number;
  upcoming?: boolean;
};

type Person = {
  userId: string;
  name: string;
  login: string;
  declaredHours: number;
  fulfilledHours: number;
  missedHours: number;
  voluntaryHours: number;
  creditHours: number;
  creditCount: number;
  adjustedHours: number;
  attendance: number;
  days: DayAttendance[];
  minHours: number;
  eligible: boolean;
  ineligibleReason: string | null;
  score: number | null;
  isWinner: boolean;
  bonusCents: number;
  ledger: LedgerLine[];
};

function fmtH(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " h";
}

function fmtPct(n: number) {
  return (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
}

function fmtDateBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function originLabel(o: LedgerLine["origin"]) {
  if (o === "OWN") return "Turno próprio";
  if (o === "VOLUNTARY") return "Cobertura voluntária";
  return "Crédito de emissão";
}

export default function AttendanceCard({ month }: { month: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Person | null>(null);
  const [ranking, setRanking] = useState<Person[]>([]);
  const [period, setPeriod] = useState<{ startISO: string; endISO: string; minHours: number } | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const isAdmin = getSession()?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/attendance?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar assiduidade.");
      setMe(json.me);
      setRanking(json.ranking || []);
      setPeriod(json.period);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function closePeriod() {
    if (!confirm("Fechar a apuração deste mês e registrar o vencedor de R$ 200?")) return;
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Falha ao fechar apuração.");
      return;
    }
    await load();
  }

  const focus =
    ranking.find((p) => p.userId === openUser) || me || ranking[0] || null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-teal-600" aria-hidden />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assiduidade</div>
            <div className="text-sm font-semibold text-slate-900">
              Prévia diária e extrato do período
              {focus ? ` · ${focus.name}` : ""}
            </div>
          </div>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={closePeriod}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Fechar apuração
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Sessão de 1h (renova só no clique). Horas cumpridas = sessão ∩ turno, inclusive se fechar a janela até
        expirar. Crédito de emissão (1h) entra só na pontuação, não nas horas reais. Pontuação (quem leva R$ 200) =
        média² × √(horas ajustadas / mínimo). Bônus no dia 1, com os demais. Período{" "}
        {period ? `${fmtDateBR(period.startISO)} a ${fmtDateBR(period.endISO)}` : "—"}.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : focus ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Declaradas" value={fmtH(focus.declaredHours)} />
            <Stat label="Cumpridas" value={fmtH(focus.fulfilledHours)} />
            <Stat label="Não cumpridas" value={fmtH(focus.missedHours)} />
            <Stat
              label="Média dos dias"
              value={fmtPct(focus.attendance)}
              hint="Até agora: só horas que já deveriam ter sido feitas"
            />
            <Stat label="Emissões extras" value={String(focus.creditCount)} hint="1h de crédito cada" />
            <Stat label="Crédito (pontuação)" value={fmtH(focus.creditHours)} hint="Não é hora trabalhada" />
            <Stat label="Horas ajustadas (C)" value={fmtH(focus.adjustedHours)} />
            <Stat label="Mínimo do período" value={fmtH(focus.minHours)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {focus.eligible ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                Elegível · pontuação {focus.score?.toFixed(2)}
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Inelegível · {focus.ineligibleReason}
              </span>
            )}
            {focus.isWinner ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
                <Trophy className="h-3 w-3" /> R$ 200,00
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Sem dados de assiduidade neste período.</p>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-3 text-left">Ranking</th>
              <th className="py-2 px-2 text-right">Decl.</th>
              <th className="py-2 px-2 text-right">Cump.</th>
              <th className="py-2 px-2 text-right">Média</th>
              <th className="py-2 px-2 text-right">Crédito</th>
              <th className="py-2 pl-2 text-right" title="Pontuação do bônus: média² × √(horas ajustadas / mínimo)">
                Pontuação
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ranking.map((p) => (
              <tr
                key={p.userId}
                className={cn(
                  p.isWinner && "bg-violet-50/70",
                  focus?.userId === p.userId && "bg-teal-50/80"
                )}
              >
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    className="text-left font-medium text-slate-900 hover:underline"
                    onClick={() => setOpenUser(openUser === p.userId ? null : p.userId)}
                  >
                    {p.name}
                  </button>
                  <div className="text-[11px] text-slate-500">
                    {p.eligible ? "Elegível" : p.ineligibleReason}
                  </div>
                </td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtH(p.declaredHours)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtH(p.fulfilledHours)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtPct(p.attendance)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtH(p.creditHours)}</td>
                <td className="py-2 pl-2 text-right tabular-nums font-semibold">
                  {p.score == null ? "—" : p.score.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {focus ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="text-xs font-semibold text-slate-700">Por dia · {focus.name}</div>
          <p className="mt-1 text-[11px] text-slate-500">
            Todos os turnos do período. A % de cada dia (e a média) só conta o que já deveria ter sido feito.
            Clique no nome no ranking para ver outra pessoa.
          </p>
          <DayTable days={focus.days || []} />
          <div className="mt-3 text-xs font-semibold text-slate-700">Extrato · {focus.name}</div>
          <ul className="mt-2 max-h-[28rem] space-y-1 overflow-y-auto text-xs [scrollbar-width:thin]">
            {focus.ledger.length === 0 ? (
              <li className="text-slate-500">Sem lançamentos ainda neste período.</li>
            ) : (
              focus.ledger.map((l, i) => (
                <li key={`${l.dateISO}-${l.origin}-${i}`} className="rounded-lg bg-white px-2 py-1.5">
                  <span className="font-medium text-slate-800">
                    {fmtDateBR(l.dateISO)} {l.startHHMM}–{l.endHHMM}
                  </span>
                  <span className="text-slate-500"> · {originLabel(l.origin)}</span>
                  {l.origin === "CREDIT" ? (
                    <span className="text-violet-700"> · +{fmtH(l.creditHours)} crédito</span>
                  ) : (
                    <span className="text-slate-600">
                      {" "}
                      · decl. {fmtH(l.declaredHours)} · cump. {fmtH(l.fulfilledHours)}
                    </span>
                  )}
                  <div className="text-[11px] text-slate-500">{l.note}</div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function DayTable({ days }: { days: DayAttendance[] }) {
  if (!days.length) {
    return <p className="mt-3 text-xs text-slate-500">Nenhum dia com horário neste período.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1.5 pr-3 text-left">Dia</th>
            <th className="py-1.5 px-2 text-right">Declaradas</th>
            <th className="py-1.5 px-2 text-right">Cumpridas</th>
            <th className="py-1.5 pl-2 text-right">Assiduidade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {days.map((day) => (
            <tr key={day.dateISO}>
              <td className="py-1.5 pr-3 text-slate-800">{fmtDateBR(day.dateISO)}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{fmtH(day.declaredHours)}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{fmtH(day.fulfilledHours)}</td>
              <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">
                {day.upcoming ? "ainda não" : fmtPct(day.attendance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</div>
      {hint ? <div className="text-[10px] text-slate-500">{hint}</div> : null}
    </div>
  );
}
