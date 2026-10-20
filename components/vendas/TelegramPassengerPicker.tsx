"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Chat = { id: string; title: string; lastMessage: string };

export default function TelegramPassengerPicker(props: {
  existingText: string;
  expectedCount: number;
  onClose: () => void;
  onApply: (text: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [q, setQ] = useState("");

  async function loadStatus() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telegram", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao ver o Telegram.");
      setConfigured(Boolean(json.configured));
      setConnected(Boolean(json.connected));
      setStatus(json.status || null);
      setName(json.name || null);
      if (json.phone) setPhone(String(json.phone).replace(/^\+/, ""));
      if (json.connected) await loadChats("");
    } catch (e: any) {
      setError(e?.message || "Falha no Telegram.");
    } finally {
      setLoading(false);
    }
  }

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
    } catch (e: any) {
      setError(e?.message || "Falha ao listar conversas.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/telegram/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Não deu para enviar o código.");
      setStatus("PENDING");
    } catch (e: any) {
      setError(e?.message || "Falha ao enviar código.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/telegram/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: status === "NEED_PASSWORD" ? "" : code,
          password: status === "NEED_PASSWORD" || password ? password : "",
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Código inválido.");
      if (json.needPassword) {
        setStatus("NEED_PASSWORD");
        return;
      }
      setConnected(true);
      setStatus("CONNECTED");
      setName(json.name || null);
      await loadChats("");
    } catch (e: any) {
      setError(e?.message || "Falha ao confirmar.");
    } finally {
      setBusy(false);
    }
  }

  async function pickChat(chatId: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/telegram/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          existingText: props.existingText,
          expectedCount: props.expectedCount,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Não achei passageiros.");
      props.onApply(String(json.mergedText || ""));
    } catch (e: any) {
      setError(e?.message || "Falha ao ler a conversa.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/telegram", { method: "DELETE" });
      setConnected(false);
      setStatus(null);
      setChats([]);
      setCode("");
      setPassword("");
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
            Entra com o código do app, escolhe a conversa e lê os passageiros (texto e print).
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : !configured ? (
            <p className="text-sm text-amber-800">
              Falta configurar TELEGRAM_API_ID e TELEGRAM_API_HASH na Vercel. Crie o app em
              my.telegram.org → API development tools e coloque as duas chaves no ambiente.
            </p>
          ) : connected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>Conectado{name ? ` · ${name}` : ""}</span>
                <button type="button" className="underline" onClick={() => void disconnect()}>
                  Sair
                </button>
              </div>
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
                        onClick={() => void pickChat(c.id)}
                        className="w-full px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-50"
                      >
                        <div className="text-sm font-medium text-slate-900">{c.title}</div>
                        {c.lastMessage ? (
                          <div className="truncate text-[11px] text-slate-500">{c.lastMessage}</div>
                        ) : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : status === "NEED_PASSWORD" ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Esta conta tem senha de duas etapas do Telegram.</p>
              <input
                type="password"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                placeholder="Senha de duas etapas"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !password}
                onClick={() => void verify()}
                className="h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Entrando…" : "Entrar"}
              </button>
            </div>
          ) : status === "PENDING" ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Digite o código que o Telegram mandou no app.</p>
              <input
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm tracking-widest"
                placeholder="Código"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <button
                type="button"
                disabled={busy || code.length < 5}
                onClick={() => void verify()}
                className="h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Confirmando…" : "Confirmar código"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Celular da conta Telegram (com DDD).</p>
              <input
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                placeholder="81999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || phone.replace(/\D/g, "").length < 10}
                onClick={() => void sendCode()}
                className="h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Enviando…" : "Enviar código"}
              </button>
            </div>
          )}
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
