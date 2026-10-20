"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">Telegram</div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Marque o print do voo e a ficha do passageiro. Verde é o que você mandou; branco é o cliente.
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
            {chat ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <button type="button" className="text-slate-500 underline" onClick={() => setChat(null)}>
                    Trocar conversa
                  </button>
                  <span className="font-medium text-slate-800">{chat.title}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Já marquei o bloco desta emissão. Desmarque se entrou venda antiga (“passagem emitida”).
                </p>
                <div className="max-h-[52vh] space-y-2 overflow-auto rounded-xl bg-[#e9eef5] p-3">
                  {[...messages].reverse().map((m) => {
                    const mine = Boolean(m.fromYou);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
                      >
                        <input
                          type="checkbox"
                          className="mb-2 shrink-0"
                          checked={!!selected[m.id]}
                          onChange={(e) =>
                            setSelected((prev) => ({ ...prev, [m.id]: e.target.checked }))
                          }
                        />
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] shadow-sm ${
                            mine
                              ? "rounded-br-md bg-emerald-100 text-slate-800"
                              : "rounded-bl-md bg-white text-slate-800"
                          } ${m.looksIssued ? "opacity-60" : ""}`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            <span>{m.sender || (mine ? "Você" : "Contato")}</span>
                            <span>{formatHour(m.date)}</span>
                          </div>
                          {m.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.thumb}
                              alt="Foto do Telegram"
                              className="mb-1 max-h-40 w-full rounded-lg object-cover"
                            />
                          ) : m.hasPhoto ? (
                            <div className="mb-1 rounded-lg bg-slate-200 px-2 py-6 text-center text-[11px] text-slate-500">
                              Foto
                            </div>
                          ) : null}
                          {m.text ? (
                            <div className="whitespace-pre-wrap break-words">{m.text}</div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={busy || !selectedIds.length}
                  onClick={() => void extractSelected()}
                  className="h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Lendo voo e passageiros…" : `Usar ${selectedIds.length} mensagem(ns)`}
                </button>
              </div>
            ) : (
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
                    placeholder="Buscar conversa (ex.: FLASH)"
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
            )}
          </TelegramLoginForm>
          {error ? <p className="mt-3 text-sm font-medium text-amber-800">{error}</p> : null}
          {busy && connected ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Falando com o Telegram…
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
      </div>
    </div>
  );
}
