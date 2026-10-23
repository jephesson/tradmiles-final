"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type SwapShift = {
  id: string;
  dateISO: string;
  dateBR: string;
  startHHMM: string;
  endHHMM: string;
  label: string;
};

export type SwapRequest = {
  id: string;
  status: string;
  note: string;
  createdAt: string;
  requester: { id: string; name: string };
  target: { id: string; name: string };
  give: SwapShift | null; // turno do solicitante que vai para o alvo
  take: SwapShift | null; // turno do alvo que vai para o solicitante
};

type Inbox = { received: SwapRequest[]; sent: SwapRequest[] };

/** Avisa página e pop-up para recarregar depois de qualquer mudança. */
export const AGENDA_CHANGED_EVENT = "agenda:changed";

function notifyChanged() {
  window.dispatchEvent(new Event(AGENDA_CHANGED_EVENT));
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function shiftText(s: SwapShift) {
  const wd = WEEKDAYS[new Date(`${s.dateISO}T12:00:00.000Z`).getUTCDay()];
  return `${wd} ${s.dateBR.slice(0, 5)} · ${s.label} ${s.startHHMM}–${s.endHHMM}`;
}

function firstName(name: string) {
  return name.split(" ")[0] || name;
}

async function fetchInbox(): Promise<Inbox | null> {
  const res = await fetch("/api/agenda/trocas", { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) return null;
  return json.data as Inbox;
}

async function respond(id: string, action: "accept" | "decline" | "cancel") {
  const res = await fetch(`/api/agenda/trocas?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const json = await res.json().catch(() => null);
  if (!json?.ok) throw new Error(json?.error || "Não deu para responder a troca.");
  notifyChanged();
}

function useInbox(pollMs: number) {
  const [inbox, setInbox] = useState<Inbox | null>(null);

  useEffect(() => {
    let alive = true;
    const reload = () => {
      fetchInbox()
        .then((next) => {
          if (alive && next) setInbox(next);
        })
        .catch(() => undefined); // tenta de novo no próximo ciclo
    };
    reload();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, pollMs);
    window.addEventListener("focus", reload);
    window.addEventListener(AGENDA_CHANGED_EVENT, reload);
    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener("focus", reload);
      window.removeEventListener(AGENDA_CHANGED_EVENT, reload);
    };
  }, [pollMs]);

  return inbox;
}

/** O que cada lado ganha/perde, do ponto de vista de quem lê. */
function SwapSummary({ r, viewer }: { r: SwapRequest; viewer: "target" | "requester" }) {
  const youGet = viewer === "target" ? r.give : r.take;
  const youGive = viewer === "target" ? r.take : r.give;
  return (
    <div className="space-y-1.5 text-sm">
      {youGive ? (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">
            Você passa
          </span>
          <span className="tabular-nums text-slate-800">{shiftText(youGive)}</span>
        </div>
      ) : null}
      {youGet ? (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
            Você assume
          </span>
          <span className="tabular-nums text-slate-800">{shiftText(youGet)}</span>
        </div>
      ) : null}
      {r.note ? <p className="text-[13px] italic text-slate-500">“{r.note}”</p> : null}
    </div>
  );
}

function ReceivedCard({ r, onDone }: { r: SwapRequest; onDone?: () => void }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");

  async function act(action: "accept" | "decline") {
    setBusy(action);
    setError("");
    try {
      await respond(r.id, action);
      onDone?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha.");
    } finally {
      setBusy(null);
    }
  }

  const kind = r.give && r.take ? "quer trocar com você" : r.give ? "quer passar um turno para você" : "pediu um turno seu";
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3.5">
      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-900">{r.requester.name}</span> {kind}
      </p>
      <div className="mt-2.5">
        <SwapSummary r={r} viewer="target" />
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void act("decline")}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Recusar
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void act("accept")}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Aceitar
        </button>
      </div>
    </li>
  );
}

function SentCard({ r }: { r: SwapRequest }) {
  const [busy, setBusy] = useState(false);
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-600">
          Aguardando <span className="font-semibold text-slate-900">{firstName(r.target.name)}</span>
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await respond(r.id, "cancel");
            } catch (e: unknown) {
              alert(e instanceof Error ? e.message : "Falha ao cancelar.");
            } finally {
              setBusy(false);
            }
          }}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          {busy ? "Cancelando…" : "Cancelar pedido"}
        </button>
      </div>
      <div className="mt-2">
        <SwapSummary r={r} viewer="requester" />
      </div>
    </li>
  );
}

/** Painel na página da agenda: pedidos recebidos e enviados. */
export function AgendaSwapPanel() {
  const inbox = useInbox(60_000);
  if (!inbox || (!inbox.received.length && !inbox.sent.length)) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <ArrowLeftRight className="h-4 w-4 text-teal-700" />
        Trocas de turno
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {inbox.received.length ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Para você responder
            </p>
            <ul className="space-y-2">
              {inbox.received.map((r) => (
                <ReceivedCard key={r.id} r={r} />
              ))}
            </ul>
          </div>
        ) : null}
        {inbox.sent.length ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Seus pedidos
            </p>
            <ul className="space-y-2">
              {inbox.sent.map((r) => (
                <SentCard key={r.id} r={r} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

const SNOOZE_KEY = "tm.agendaSwaps.snoozed";

function readSnoozed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SNOOZE_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Pop-up global: aparece em qualquer tela quando alguém pede troca com você. */
export default function AgendaSwapPopup() {
  const inbox = useInbox(45_000);
  const [snoozed, setSnoozed] = useState<string[]>(readSnoozed);

  const pending = (inbox?.received || []).filter((r) => !snoozed.includes(r.id));
  if (!pending.length) return null;

  function later() {
    const next = [...snoozed, ...pending.map((r) => r.id)];
    setSnoozed(next);
    try {
      sessionStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200/80 bg-slate-50 p-5 shadow-2xl shadow-slate-900/20">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 ring-1 ring-teal-100">
            <ArrowLeftRight className="h-5 w-5 text-teal-700" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-slate-900">
              {pending.length === 1 ? "Pedido de troca" : `${pending.length} pedidos de troca`}
            </div>
            <p className="mt-0.5 text-sm text-slate-600">
              A agenda só muda se você aceitar.
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {pending.map((r) => (
            <ReceivedCard key={r.id} r={r} />
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Link
            href="/dashboard/agenda"
            onClick={later}
            className="text-sm font-semibold text-teal-700 hover:underline"
          >
            Ver na agenda
          </Link>
          <button
            type="button"
            onClick={later}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200/60"
          >
            Responder depois
          </button>
        </div>
      </div>
    </div>
  );
}

/** Formulário no detalhe do turno para pedir troca. */
export function SwapRequestForm(props: {
  event: { id: string; dateISO: string; user: { id: string; name: string } };
  meId: string;
  members: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const mine = props.event.user.id === props.meId;
  const [targetId, setTargetId] = useState<string>(mine ? "" : props.event.user.id);
  const [options, setOptions] = useState<SwapShift[] | null>(null);
  const [pick, setPick] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // Mostra os turnos de quem vai dar algo em troca: do colega (se o turno é meu) ou meus.
  const optionsOf = mine ? targetId : props.meId;

  useEffect(() => {
    if (!optionsOf) return;
    let alive = true;
    setOptions(null);
    setPick("");
    void (async () => {
      const res = await fetch(`/api/agenda/trocas?shiftsOf=${encodeURIComponent(optionsOf)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!alive) return;
      const list: SwapShift[] = json?.ok ? json.data.shifts || [] : [];
      setOptions(list.filter((s) => s.id !== props.event.id));
    })();
    return () => {
      alive = false;
    };
  }, [optionsOf, props.event.id]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const body = mine
        ? { fromEventId: props.event.id, toEventId: pick || null, targetId, note }
        : { toEventId: props.event.id, fromEventId: pick || null, note };
      const res = await fetch("/api/agenda/trocas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Não deu para pedir a troca.");
      setSent(true);
      notifyChanged();
      window.setTimeout(props.onDone, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao pedir troca.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
        <Check className="h-4 w-4" /> Pedido enviado. A troca acontece quando a pessoa aceitar.
      </div>
    );
  }

  const otherName = mine
    ? firstName(props.members.find((m) => m.id === targetId)?.name || "")
    : firstName(props.event.user.name);

  return (
    <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-teal-800">
        <ArrowLeftRight className="h-3.5 w-3.5" />
        {mine ? "Pedir troca deste turno" : `Pedir este turno a ${otherName}`}
      </div>

      {mine ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">Com quem?</p>
          <div className="flex flex-wrap gap-1.5">
            {props.members
              .filter((m) => m.id !== props.meId)
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTargetId(m.id)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                    targetId === m.id
                      ? "border-teal-600 bg-teal-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-teal-300"
                  )}
                >
                  {m.name}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      {optionsOf ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">
            {mine ? `Em troca, você assume qual turno de ${otherName}?` : "O que você dá em troca?"}
          </p>
          {options === null ? (
            <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando turnos…
            </div>
          ) : (
            <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                  pick === "" ? "border-teal-500 bg-white" : "border-transparent bg-white/60 hover:bg-white"
                )}
              >
                <input type="radio" className="accent-teal-600" checked={pick === ""} onChange={() => setPick("")} />
                <span className="text-slate-700">
                  {mine ? `Nada — só passo meu turno para ${otherName}` : "Nada — só assumo este turno"}
                </span>
              </label>
              {options.map((s) => (
                <label
                  key={s.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    pick === s.id ? "border-teal-500 bg-white" : "border-transparent bg-white/60 hover:bg-white"
                  )}
                >
                  <input
                    type="radio"
                    className="accent-teal-600"
                    checked={pick === s.id}
                    onChange={() => setPick(s.id)}
                  />
                  <span className="tabular-nums text-slate-800">{shiftText(s)}</span>
                </label>
              ))}
              {!options.length ? (
                <p className="px-1 py-1 text-xs text-slate-500">
                  {mine ? `${otherName} não tem turnos futuros.` : "Você não tem turnos futuros."}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {optionsOf ? (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Recado (opcional)"
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-400"
        />
      ) : null}

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={busy || !optionsOf || options === null}
        onClick={() => void submit()}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {mine && !targetId ? "Escolha com quem trocar" : `Enviar pedido para ${otherName}`}
      </button>
    </div>
  );
}
