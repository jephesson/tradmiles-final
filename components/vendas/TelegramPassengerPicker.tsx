"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, RefreshCw, Search, ZoomIn, X } from "lucide-react";
import {
  formatEmissionHint,
  type TelegramEmission,
} from "@/lib/telegram/emission";
import {
  fetchTelegramChats,
  fetchTelegramMessages,
  peekTelegramChats,
  peekTelegramMessages,
  TELEGRAM_FRESH_MS,
} from "@/lib/telegram/clientCache";
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

type Chat = {
  id: string;
  title: string;
  lastMessage: string;
  lastDate?: number;
  accessHash?: string;
};
type ChatCursor = { offsetDate: number; offsetId: number; offsetPeer: string };

const AVATAR_COLORS = [
  "#54a9eb",
  "#64b161",
  "#e17072",
  "#efa531",
  "#a695e7",
  "#ee7aae",
  "#6ec9cb",
];

function avatarColor(id: string) {
  let n = 0;
  for (const ch of id) n = (n + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[n] || AVATAR_COLORS[0];
}

function initials(title: string) {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatChatTime(unix?: number) {
  if (!unix) return "";
  const ms = unix > 1e12 ? unix : unix * 1000;
  try {
    const d = new Date(ms);
    const now = new Date();
    const sameDay =
      d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ===
      now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      ...(sameDay
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "short" }),
    }).format(d);
  } catch {
    return "";
  }
}
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
  fileLabel?: string | null;
};

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

const LONG_TEXT = 420;

function Avatar(props: { id: string; title: string; size?: "sm" | "md" }) {
  const size = props.size === "sm" ? "h-9 w-9 text-[12px]" : "h-11 w-11 text-[13px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${size}`}
      style={{ background: avatarColor(props.id) }}
    >
      {initials(props.title)}
    </span>
  );
}

function ChatRow(props: {
  chat: Chat;
  highlight?: boolean;
  onOpen: () => void;
  onWarm: () => void;
}) {
  const c = props.chat;
  return (
    <button
      type="button"
      onClick={props.onOpen}
      onPointerEnter={props.onWarm}
      onFocus={props.onWarm}
      onTouchStart={props.onWarm}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 ${
        props.highlight ? "bg-sky-50/60" : ""
      }`}
    >
      <Avatar id={c.id} title={c.title} />
      <span className="min-w-0 flex-1 border-b border-slate-100 pb-2.5 pt-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-medium text-slate-900">{c.title}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
            {formatChatTime(c.lastDate)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-slate-500">
          {c.lastMessage || "Sem mensagens"}
        </span>
      </span>
    </button>
  );
}

function ChatListSkeleton() {
  return (
    <div className="animate-pulse">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <div className="h-11 w-11 shrink-0 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-slate-200" />
            <div className="h-3 w-4/5 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessagesSkeleton() {
  const rows = [
    { mine: false, w: "w-3/5", h: "h-12" },
    { mine: false, w: "w-2/5", h: "h-40" },
    { mine: true, w: "w-1/2", h: "h-10" },
    { mine: false, w: "w-3/5", h: "h-20" },
    { mine: true, w: "w-1/3", h: "h-8" },
  ];
  return (
    <div className="animate-pulse space-y-2.5 px-12 py-4">
      {rows.map((r, i) => (
        <div key={i} className={`flex ${r.mine ? "justify-end" : "justify-start"}`}>
          <div className={`${r.w} ${r.h} rounded-2xl ${r.mine ? "bg-emerald-100" : "bg-white/80"}`} />
        </div>
      ))}
    </div>
  );
}

export default function TelegramPassengerPicker(props: {
  existingText: string;
  expectedCount: number;
  emission: TelegramEmission;
  onClose: () => void;
  onApply: (payload: { passengerText: string; flight: TelegramFlightApply | null }) => void;
}) {
  const [cachedChats] = useState(() => peekTelegramChats<Chat>());
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [chats, setChats] = useState<Chat[]>(cachedChats?.chats || []);
  const [chatNext, setChatNext] = useState<ChatCursor | null>(cachedChats?.next || null);
  const [q, setQ] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastChatId, setLastChatId] = useState<string | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const openChatId = useRef<string | null>(null);
  const chatsReq = useRef(0);

  const selectedIds = useMemo(
    () => messages.filter((m) => selected[m.id]).map((m) => m.id),
    [messages, selected]
  );

  function applyChatPage(json: { chats?: Chat[]; next?: ChatCursor | null }, append: boolean) {
    const list: Chat[] = Array.isArray(json.chats) ? json.chats : [];
    setChats((prev) => {
      if (!append) return list;
      const seen = new Set(prev.map((c) => c.id));
      return [...prev, ...list.filter((c) => !seen.has(c.id))];
    });
    const next = json.next;
    setChatNext(next && (next.offsetPeer || next.offsetDate || next.offsetId) ? next : null);
  }

  async function loadChats(
    query: string,
    opts: { append?: boolean; cursor?: ChatCursor | null; force?: boolean } = {}
  ) {
    const req = ++chatsReq.current;
    const append = Boolean(opts.append);
    const plain = !query.trim() && !append;
    if (append) setLoadingMore(true);
    else if (!plain || !peekTelegramChats<Chat>()) setLoadingChats(true);
    setError("");
    try {
      let json: { ok: boolean; error?: string; chats?: Chat[]; next?: ChatCursor | null };
      if (plain) {
        json = await fetchTelegramChats<Chat>(opts.force ? 0 : TELEGRAM_FRESH_MS);
      } else {
        const qs = new URLSearchParams();
        if (query) qs.set("q", query);
        const cursor = opts.cursor;
        if (cursor?.offsetDate) qs.set("offsetDate", String(cursor.offsetDate));
        if (cursor?.offsetId) qs.set("offsetId", String(cursor.offsetId));
        if (cursor?.offsetPeer) qs.set("offsetPeer", cursor.offsetPeer);
        const res = await fetch(`/api/telegram/chats?${qs}`, { cache: "no-store" });
        json = await res.json();
        if (!json?.ok) throw new Error(json?.error || "Falha ao listar conversas.");
      }
      if (req !== chatsReq.current) return;
      applyChatPage(json, append);
    } catch (e: unknown) {
      if (req !== chatsReq.current) return;
      setError(e instanceof Error ? e.message : "Falha ao listar conversas.");
    } finally {
      if (req === chatsReq.current) {
        setLoadingChats(false);
        setLoadingMore(false);
      }
    }
  }

  function warmChat(c: Chat) {
    void fetchTelegramMessages<Msg>(c, TELEGRAM_FRESH_MS).catch(() => undefined);
  }

  async function openChat(next: Chat, force = false) {
    openChatId.current = next.id;
    setChat(next);
    setError("");
    setSelected({});
    setExpanded({});
    const cached = peekTelegramMessages<Msg>(next.id)?.messages;
    setMessages(cached || []);
    setLoadingMessages(true);
    try {
      const json = await fetchTelegramMessages<Msg>(next, force ? 0 : TELEGRAM_FRESH_MS);
      if (openChatId.current !== next.id) return;
      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setLastChatId(next.id);
    } catch (e: unknown) {
      if (openChatId.current !== next.id) return;
      setError(e instanceof Error ? e.message : "Falha ao ler mensagens.");
    } finally {
      if (openChatId.current === next.id) setLoadingMessages(false);
    }
  }

  function backToList() {
    openChatId.current = null;
    setChat(null);
    setMessages([]);
    setError("");
  }

  useEffect(() => {
    if (!connected) return;
    const t = window.setTimeout(() => void loadChats(q), q.trim() ? 350 : 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, q]);

  useEffect(() => {
    if (!chat || !messages.length) return;
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [chat, messages.length]);

  async function extractSelected() {
    if (!chat || !selectedIds.length) {
      setError("Marque as mensagens desta emissão.");
      return;
    }
    setExtracting(true);
    setError("");
    try {
      const res = await fetch("/api/telegram/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          accessHash: chat.accessHash || "",
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
      setExtracting(false);
    }
  }

  const chronological = useMemo(() => [...messages].reverse(), [messages]);
  const lastChat = useMemo(
    () => (lastChatId && !q.trim() ? chats.find((c) => c.id === lastChatId) || null : null),
    [chats, lastChatId, q]
  );
  const otherChats = useMemo(
    () => (lastChat ? chats.filter((c) => c.id !== lastChat.id) : chats),
    [chats, lastChat]
  );
  const emissionHint = formatEmissionHint(props.emission);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(92vh,760px)] sm:rounded-3xl">
        {chat ? (
          <>
            <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-2 py-2">
              <button
                type="button"
                aria-label="Voltar para conversas"
                className="rounded-full p-2 text-slate-600 hover:bg-slate-100"
                onClick={backToList}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar id={chat.id} title={chat.title} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-slate-900">{chat.title}</div>
                <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  {loadingMessages ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {messages.length ? "Atualizando…" : "Carregando mensagens…"}
                    </>
                  ) : (
                    "Toque nas mensagens com o voo e os passageiros"
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label="Recarregar conversa"
                disabled={loadingMessages}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                onClick={() => void openChat(chat, true)}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Fechar"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                onClick={props.onClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#e9eef3] py-2">
              {!messages.length && loadingMessages ? (
                <MessagesSkeleton />
              ) : !messages.length ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  Nenhuma mensagem nesta conversa.
                </div>
              ) : null}
              {chronological.map((m, i) => {
                const mine = Boolean(m.fromYou);
                const on = !!selected[m.id];
                const prev = chronological[i - 1];
                const day = formatDay(m.date);
                const showDay = day && day !== formatDay(prev?.date || null);
                const who = mine ? "Você" : m.sender && m.sender !== "Contato" ? m.sender : chat.title;
                const prevWho = prev
                  ? prev.fromYou
                    ? "Você"
                    : prev.sender && prev.sender !== "Contato"
                      ? prev.sender
                      : chat.title
                  : null;
                const firstOfRun = showDay || who !== prevWho;
                const long = m.text.length > LONG_TEXT || m.text.split("\n").length > 12;
                const open = !!expanded[m.id];
                return (
                  <div key={m.id}>
                    {showDay ? (
                      <div className="sticky top-0 z-10 my-2 flex justify-center">
                        <span className="rounded-full bg-slate-900/40 px-2.5 py-0.5 text-[11px] font-medium capitalize text-white backdrop-blur">
                          {day}
                        </span>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelected((prevSel) => ({ ...prevSel, [m.id]: !prevSel[m.id] }))}
                      className={`flex w-full items-end gap-2 px-3 text-left transition-colors ${
                        firstOfRun ? "pt-2" : "pt-0.5"
                      } pb-0.5 ${on ? "bg-sky-500/15" : "hover:bg-black/[0.03]"}`}
                    >
                      <span
                        className={`mb-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          on ? "border-sky-500 bg-sky-500 text-white" : "border-slate-400/70 bg-white/70"
                        }`}
                      >
                        {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                      <span className={`flex min-w-0 flex-1 ${mine ? "justify-end" : "justify-start"}`}>
                        <span
                          className={`relative block max-w-[85%] rounded-2xl px-2.5 py-1.5 text-[13.5px] leading-snug shadow-sm ${
                            mine ? "bg-[#dcf8c6]" : "bg-white"
                          } ${firstOfRun ? (mine ? "rounded-br-md" : "rounded-bl-md") : ""} ${
                            m.looksIssued && !on ? "opacity-60" : ""
                          }`}
                        >
                          {firstOfRun && !mine ? (
                            <span className="mb-0.5 block text-[12px] font-semibold" style={{ color: avatarColor(who) }}>
                              {who}
                            </span>
                          ) : null}
                          {m.thumb ? (
                            <span className="relative mb-1 block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={m.thumb}
                                alt=""
                                className="max-h-60 w-full rounded-lg bg-slate-100 object-contain"
                              />
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label="Ampliar foto"
                                className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setPreview(m.thumb || null);
                                }}
                              >
                                <ZoomIn className="h-3.5 w-3.5" />
                              </span>
                            </span>
                          ) : m.hasPhoto ? (
                            <span className="mb-1 block rounded-lg bg-slate-200 px-2 py-8 text-center text-[11px] text-slate-500">
                              Foto
                            </span>
                          ) : null}
                          {m.fileLabel ? (
                            <span className="mb-1 block truncate rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                              📎 {m.fileLabel}
                            </span>
                          ) : null}
                          {m.text ? (
                            <span
                              className={`block whitespace-pre-wrap break-words text-slate-800 ${
                                long && !open ? "line-clamp-[10]" : ""
                              }`}
                            >
                              {m.text}
                            </span>
                          ) : !m.thumb && !m.hasPhoto && !m.fileLabel ? (
                            <span className="block text-[11px] italic text-slate-400">Mensagem sem texto</span>
                          ) : null}
                          {long ? (
                            <span
                              role="button"
                              tabIndex={0}
                              className="mt-0.5 block text-[12px] font-medium text-sky-700"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setExpanded((p) => ({ ...p, [m.id]: !p[m.id] }));
                              }}
                            >
                              {open ? "Mostrar menos" : "Ver tudo"}
                            </span>
                          ) : null}
                          <span className="mt-0.5 flex items-center justify-end gap-1.5 text-[10.5px] text-slate-500">
                            {m.looksIssued ? (
                              <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                                já emitida?
                              </span>
                            ) : null}
                            <span className="tabular-nums">{formatHour(m.date)}</span>
                          </span>
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })}
              <div ref={chatEnd} />
            </div>
            {error ? (
              <p className="border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900">
                {error}
              </p>
            ) : null}
            <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
              {selectedIds.length ? (
                <button
                  type="button"
                  onClick={() => setSelected({})}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Limpar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={props.onClose}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                disabled={extracting || !selectedIds.length}
                onClick={() => void extractSelected()}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {extracting
                  ? "Lendo voo e fotos…"
                  : selectedIds.length
                    ? `Usar ${selectedIds.length} ${selectedIds.length === 1 ? "mensagem" : "mensagens"}`
                    : "Selecione as mensagens"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-slate-200 bg-white px-4 pb-3 pt-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold tracking-tight text-slate-900">
                  Quem mandou a ficha?
                </h2>
                <div className="flex items-center">
                  {connected ? (
                    <button
                      type="button"
                      aria-label="Recarregar conversas"
                      disabled={loadingChats}
                      className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                      onClick={() => void loadChats(q, { force: true })}
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingChats ? "animate-spin" : ""}`} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Fechar"
                    className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                    onClick={props.onClose}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {emissionHint ? (
                <p className="mt-0.5 truncate text-[12px] text-slate-500">
                  Emissão: <span className="font-medium text-slate-700">{emissionHint}</span>
                </p>
              ) : null}
              {connected ? (
                <form
                  className="mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void loadChats(q);
                  }}
                >
                  <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-sky-200">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      autoFocus
                      className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                      placeholder="Buscar agência, pessoa ou mensagem…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                    {loadingChats && q ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                    {q ? (
                      <button
                        type="button"
                        aria-label="Limpar busca"
                        className="rounded-full p-0.5 text-slate-400 hover:text-slate-600"
                        onClick={() => setQ("")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-white">
              <TelegramLoginForm
                onStatus={(s) => {
                  setConnected(s.connected);
                  setLastChatId(s.lastChatId);
                  if (!s.connected) {
                    setChats([]);
                    setChatNext(null);
                    backToList();
                  }
                }}
              >
                <div className="pb-2">
                  {loadingChats && !chats.length ? (
                    <ChatListSkeleton />
                  ) : !chats.length ? (
                    <div className="px-6 py-16 text-center text-sm text-slate-500">
                      Nenhuma conversa nesta busca. Tente o nome da agência.
                    </div>
                  ) : (
                    <>
                      {lastChat ? (
                        <>
                          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                            Última usada
                          </p>
                          <ChatRow
                            chat={lastChat}
                            highlight
                            onOpen={() => void openChat(lastChat)}
                            onWarm={() => warmChat(lastChat)}
                          />
                          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Conversas
                          </p>
                        </>
                      ) : null}
                      {otherChats.map((c) => (
                        <ChatRow
                          key={c.id}
                          chat={c}
                          onOpen={() => void openChat(c)}
                          onWarm={() => warmChat(c)}
                        />
                      ))}
                    </>
                  )}
                  {chatNext ? (
                    <div className="px-4 pt-2">
                      <button
                        type="button"
                        disabled={loadingMore || loadingChats}
                        onClick={() => void loadChats(q, { append: true, cursor: chatNext })}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                      >
                        {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {loadingMore ? "Carregando…" : "Ver conversas mais antigas"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </TelegramLoginForm>
              {error ? (
                <p className="mx-4 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                  {error}
                </p>
              ) : null}
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
