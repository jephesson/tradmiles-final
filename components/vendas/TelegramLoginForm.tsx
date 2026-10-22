"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type TelegramLoginStatus = {
  configured: boolean;
  connected: boolean;
  status: string | null;
  name: string | null;
  lastChatId: string | null;
};

export default function TelegramLoginForm(props: {
  children?: ReactNode;
  onStatus?: (s: TelegramLoginStatus) => void;
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
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");

  function emit(next: TelegramLoginStatus) {
    props.onStatus?.(next);
  }

  async function loadStatus() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telegram", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao ver o Telegram.");
      const next: TelegramLoginStatus = {
        configured: Boolean(json.configured),
        connected: Boolean(json.connected),
        status: json.status || null,
        name: json.name || null,
        lastChatId: json.lastChatId || null,
      };
      setConfigured(next.configured);
      setConnected(next.connected);
      setStatus(next.status);
      setName(next.name);
      if (json.phone) setPhone(String(json.phone).replace(/^\+/, ""));
      emit(next);
      return next;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha no Telegram.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveApp() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/telegram/app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId, apiHash }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Não deu para salvar o app.");
      setConfigured(true);
      setApiHash("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao salvar o app.");
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/telegram/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, force: status === "EXPIRED" || status === "CONNECTED" }),
      });
      const json = await res.json();
      if (!json?.ok) {
        if (json?.needApp) setConfigured(false);
        throw new Error(json?.error || "Não deu para enviar o código.");
      }
      if (json.alreadyConnected) {
        await loadStatus();
        return;
      }
      setStatus("PENDING");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao enviar código.");
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
      await loadStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao confirmar.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/telegram", { method: "DELETE" });
      setConnected(false);
      setStatus("DISCONNECTED");
      setName(null);
      setCode("");
      setPassword("");
      emit({
        configured,
        connected: false,
        status: "DISCONNECTED",
        name: null,
        lastChatId: null,
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!configured ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Primeira vez: em{" "}
            <a
              href="https://my.telegram.org"
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              my.telegram.org
            </a>{" "}
            → <b>API development tools</b>, cole os dois códigos. Depois é só o número e o código do app.
          </p>
          <input
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            placeholder="API ID"
            value={apiId}
            onChange={(e) => setApiId(e.target.value.replace(/\D/g, ""))}
          />
          <input
            className="h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm"
            placeholder="API HASH"
            value={apiHash}
            onChange={(e) => setApiHash(e.target.value.trim())}
          />
          <button
            type="button"
            disabled={busy || !apiId || apiHash.length < 16}
            onClick={() => void saveApp()}
            className="h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Salvando…" : "Salvar e continuar"}
          </button>
        </div>
      ) : connected ? (
        <div>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500">
            <span>Logado na empresa{name ? ` · ${name}` : ""}</span>
            <button type="button" className="underline" onClick={() => void disconnect()}>
              Trocar conta
            </button>
          </div>
          {props.children}
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
          <p className="text-sm text-slate-600">
            {status === "EXPIRED"
              ? "A sessão caiu. Manda o código de novo — depois continua logado."
              : "Digite o celular. O Telegram envia o código no app e fica logado na empresa."}
          </p>
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
      {error ? <p className="text-sm font-medium text-amber-800">{error}</p> : null}
      {busy && connected ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Falando com o Telegram…
        </div>
      ) : null}
    </div>
  );
}
