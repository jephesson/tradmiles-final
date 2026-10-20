"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import {
  formatEmissionHint,
  type TelegramEmission,
} from "@/lib/telegram/emission";
import TelegramLoginForm from "@/components/vendas/TelegramLoginForm";

export type TelegramFlightApply = {
  origin: string;
  destination: string;
  outbound: string;
  inbound: string;
  trip: "IDA" | "IDA_VOLTA";
  adt: number;
  chd: number;
  inf: number;
};

type Chat = { id: string; title: string; lastMessage: string };
type Msg = {
  id: number;
  date: string | null;
  text: string;
  hasPhoto: boolean;
  looksPassenger: boolean;
  looksFlight?: boolean;
  looksIssued?: boolean;
  fromYou?: boolean;
  sender?: string;
  thumb?: string | null;
};

function defaultSelected(messages: Msg[]) {
  const picked: number[] = [];
  let miss = 0;
  for (const m of messages) {
    if (m.looksIssued) continue;
    const useful = m.looksPassenger || m.looksFlight || m.hasPhoto;
    if (useful) {
      picked.push(m.id);
      miss = 0;
    } else {
      miss += 1;
      if (picked.length && miss >= 4) break;
    }
    if (picked.length >= 8) break;
  }
  return picked;
}

function formatHour(iso: string | null) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function formatDay(iso: string | null) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export default function TelegramPassengerPicker(props: {
  existingText: string;
  expectedCount: number;
  emission: TelegramEmission;
  onClose: () => void;
  onApply: (payload: { passengerText: string; flight: TelegramFlightApply | null }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [q, setQ] = useState("");
  const [lastChatId, setLastChatId] = useState<string | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement | null>(null);

  const selectedIds = useMemo(
    () => messages.filter((m) => selected[m.id]).map((m) => m.id),
    [messages, selected]
  );

  async function loadChats(query: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/telegram/chats?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao listar conversas.");
      setChats(Array.isArray(json.chats) ? json.chats : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao listar conversas.");
    } finally {
      setBusy(false);
    }
  }

  async function openChat(next: Chat) {
    setBusy(true);
    setError("");
    try {
      const e = props.emission;
      const qs = new URLSearchParams({
        chatId: next.id,
        title: next.title,
        origin: e.origin || "",
        destination: e.destination || "",
        outbound: e.outbound || "",
        inbound: e.inbound || "",
        trip: e.trip || "",
        adt: String(e.adt || 0),
        chd: String(e.chd || 0),
        inf: String(e.inf || 0),
        expectedCount: String(e.expectedCount || props.expectedCount || 0),
      });
      const res = await fetch(`/api/telegram/messages?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao ler mensagens.");
      const list: Msg[] = Array.isArray(json.messages) ? json.messages : [];
      setChat(next);
      setMessages(list);
      const suggested = Array.isArray(json.suggestedIds)
        ? json.suggestedIds.map((n: unknown) => Number(n)).filter((n: number) => n > 0)
        : [];
      const ids = suggested.length ? suggested : defaultSelected(list);
      const map: Record<number, boolean> = {};
      for (const id of ids) map[id] = true;
      setSelected(map);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao ler mensagens.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!connected) return;
    void loadChats("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    if (!connected || !lastChatId || chat || !chats.length) return;
    const last = chats.find((c) => c.id === lastChatId);
    if (last) void openChat(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, lastChatId, chats]);

  useEffect(() => {
    if (!chat || !messages.length) return;
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [chat, messages.length]);

  async function extractSelected() {
    if (!chat || !selectedIds.length) {
      setError("Marque as mensagens desta emissão.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/telegram/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          messageIds: selectedIds,
          existingText: "",
          expectedCount: props.expectedCount,
          emission: props.emission,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Não achei voo nem passageiros.");
      const text = String(json.extractedText || json.mergedText || "");
      const raw = json.flight && typeof json.flight === "object" ? json.flight : null;
      const flight: TelegramFlightApply | null = raw
        ? {
            origin: String(raw.origin || "").toUpperCase(),
            destination: String(raw.destination || "").toUpperCase(),
            outbound: String(raw.outbound || ""),
            inbound: String(raw.inbound || ""),
            trip: raw.trip === "IDA_VOLTA" ? "IDA_VOLTA" : "IDA",
            adt: Math.max(1, Math.trunc(Number(raw.adt) || 1)),
            chd: Math.max(0, Math.trunc(Number(raw.chd) || 0)),
            inf: Math.max(0, Math.trunc(Number(raw.inf) || 0)),
          }
        : null;
      void fetch("/api/telegram/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emission: {
            ...props.emission,
            ...(flight
              ? {
                  origin: flight.origin,
                  destination: flight.destination,
                  outbound: flight.outbound,
                  inbound: flight.inbound,
                  trip: flight.trip,
                  adt: flight.adt,
                  chd: flight.chd,
                  inf: flight.inf,
                  expectedCount: flight.adt + flight.chd + flight.inf,
                }
              : null),
          },
          passengerText: text,
          chatSnippet: String(json.chatSnippet || ""),
        }),
      }).catch(() => undefined);
      props.onApply({ passengerText: text, flight });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao ler a conversa.");
    } finally {
      setBusy(false);
    }
  }

  const chronological = useMemo(() => [...messages].reverse(), [messages]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-3">
      <div className="flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[90vh] sm:rounded-2xl">
        {chat ? (
          <>
            <div className="flex items-center gap-3 bg-[#517da2] px-3 py-2.5 text-white">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm font-medium hover:bg-white/10"
                onClick={() => {
                  setChat(null);
                  setMessages([]);
                }}
              >
                ←
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{chat.title}</div>
                <div className="text-[11px] text-white/80">Toque na foto ou no texto para selecionar</div>
              </div>
              <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={props.onClose}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#e7eef4] px-3 py-3">
              {chronological.map((m, i) => {
                const mine = Boolean(m.fromYou);
                const on = !!selected[m.id];
                const prev = chronological[i - 1];
                const day = formatDay(m.date);
                const showDay = day && day !== formatDay(prev?.date || null);
                const who = mine ? "Você" : m.sender && m.sender !== "Contato" ? m.sender : chat.title;
                return (
                  <div key={m.id}>
                    {showDay ? (
                      <div className="my-3 text-center text-[11px] font-medium text-slate-500">{day}</div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelected((prevSel) => ({ ...prevSel, [m.id]: !prevSel[m.id] }))}
                      className={`mb-2 flex w-full ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`relative max-w-[88%] rounded-2xl px-2.5 py-1.5 text-left text-[13px] shadow-sm ${
                          mine ? "rounded-br-md bg-[#d2f8c6]" : "rounded-bl-md bg-white"
                        } ${on ? "ring-2 ring-sky-500" : ""} ${m.looksIssued ? "opacity-55" : ""}`}
                      >
                        <div className="mb-0.5 text-[10px] font-semibold text-sky-800">{who}</div>
                        {m.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.thumb}
                            alt=""
                            className="mb-1 max-h-72 w-full cursor-zoom-in rounded-lg object-contain bg-slate-100"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setPreview(m.thumb || null);
                            }}
                          />
                        ) : m.hasPhoto ? (
                          <div className="mb-1 rounded-lg bg-slate-200 px-2 py-10 text-center text-[11px] text-slate-500">
                            Foto
                          </div>
                        ) : null}
                        {m.text ? (
                          <div className="whitespace-pre-wrap break-words text-slate-800">{m.text}</div>
                        ) : null}
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                          {on ? <Check className="h-3 w-3 text-sky-600" /> : null}
                          <span>{formatHour(m.date)}</span>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
              <div ref={chatEnd} />
            </div>
            {error ? <p className="bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{error}</p> : null}
            <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={busy || !selectedIds.length}
                onClick={() => void extractSelected()}
                className="h-10 flex-1 rounded-xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Lendo voo e fotos…" : `Usar ${selectedIds.length} selecionada(s)`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Telegram</div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Abre a conversa igual o app. Aí você vê as fotos e marca o voo e os passageiros.
              </p>
              {formatEmissionHint(props.emission) ? (
                <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
                  Emissão atual: {formatEmissionHint(props.emission)}
                </div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              <TelegramLoginForm
                onStatus={(s) => {
                  setConnected(s.connected);
                  setLastChatId(s.lastChatId);
                  if (!s.connected) {
                    setChats([]);
                    setChat(null);
                    setMessages([]);
                  }
                }}
              >
                <div className="space-y-3">
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void loadChats(q);
                    }}
                  >
                    <input
                      className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
                      placeholder="Buscar conversa"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Buscar
                    </button>
                  </form>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {chats.length === 0 ? (
                      <li className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma conversa.</li>
                    ) : (
                      chats.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void openChat(c)}
                            className="w-full px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-50"
                          >
                            <div className="text-sm font-medium text-slate-900">
                              {c.title}
                              {c.id === lastChatId ? (
                                <span className="ml-2 text-[10px] font-semibold text-emerald-700">última</span>
                              ) : null}
                            </div>
                            {c.lastMessage ? (
                              <div className="truncate text-[11px] text-slate-500">{c.lastMessage}</div>
                            ) : null}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </TelegramLoginForm>
              {error ? <p className="mt-3 text-sm font-medium text-amber-800">{error}</p> : null}
              {busy && connected ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Abrindo conversa…
                </div>
              ) : null}
            </div>
            <div className="border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
      {preview ? (
        <button
          type="button"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </button>
      ) : null}
    </div>
  );
}
