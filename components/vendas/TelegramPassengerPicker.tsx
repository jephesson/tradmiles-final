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
};

function defaultSelected(messages: Msg[], expectedCount: number) {
  const max = Math.max(2, (expectedCount || 2) * 3, 8);
  const picked: number[] = [];
  let miss = 0;
  for (const m of messages) {
    if (m.looksPassenger) {
      picked.push(m.id);
      miss = 0;
    } else {
      miss += 1;
      if (picked.length && miss >= 2) break;
    }
    if (picked.length >= max) break;
  }
  return picked;
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
      const ids = suggested.length ? suggested : defaultSelected(list, props.expectedCount);
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
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">Telegram</div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Digite o número, confirme o código do app e fica logado na empresa.
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
                  Já marquei tabela do voo + fichas desta emissão. Ajuste se misturou com outra venda.
                </p>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {messages.map((m) => (
                    <li key={m.id} className="flex items-start gap-2 px-3 py-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!!selected[m.id]}
                        onChange={(e) =>
                          setSelected((prev) => ({ ...prev, [m.id]: e.target.checked }))
                        }
                      />
                      <div className="min-w-0 flex-1 text-[12px] text-slate-700">
                        {m.hasPhoto ? <span className="mr-1 font-semibold text-slate-500">[foto]</span> : null}
                        {m.text || (m.hasPhoto ? "Imagem" : "(sem texto)")}
                      </div>
                    </li>
                  ))}
                </ul>
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
