"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, X } from "lucide-react";

type Gap = {
  dateISO: string;
  dateBR: string;
  kind: "MANHA" | "TARDE" | "NOITE";
  startHHMM: string;
  endHHMM: string;
  label: string;
};

const STORAGE_KEY = "tm.agendaRemnants.shown";

export default function AgendaRemnantsModal() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/agenda/gaps?remanescentes=1", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive || !res.ok || !json?.ok) return;
        const list = (json.data?.remnantGaps || []) as Gap[];
        if (list.length === 0) return;
        const day = json.data?.todayISO || "";
        const shown = sessionStorage.getItem(STORAGE_KEY);
        if (shown === day) return;
        setGaps(list);
        setOpen(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function dismiss() {
    const today = new Date().toLocaleDateString("en-CA");
    try {
      sessionStorage.setItem(STORAGE_KEY, today);
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open || gaps.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xl shadow-slate-900/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 ring-1 ring-amber-100">
              <Clock className="h-5 w-5 text-amber-700" aria-hidden />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900">Horários remanescentes</div>
              <p className="mt-0.5 text-sm text-slate-600">
                Faltam cobrir estes intervalos. Até 72h antes do dia, qualquer pessoa pode se
                escalar nas vagas.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            onClick={dismiss}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {gaps.map((g, i) => (
            <li
              key={`${g.dateISO}-${g.kind}-${g.startHHMM}-${i}`}
              className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm"
            >
              <div className="font-semibold text-amber-950">
                {g.dateBR} · {g.label}
              </div>
              <div className="tabular-nums text-amber-800">
                Intervalo vago: {g.startHHMM}–{g.endHHMM}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={dismiss}
          >
            Fechar
          </button>
          <Link
            href="/dashboard/agenda"
            onClick={dismiss}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Ir para a agenda
          </Link>
        </div>
      </div>
    </div>
  );
}
