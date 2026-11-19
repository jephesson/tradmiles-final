"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Download, LayoutGrid, MessageCircle, Plane, Puzzle, Wallet } from "lucide-react";
import { getSession } from "@/lib/auth";
import { emissorViewNow } from "@/components/useEmissorView";
import { EXTENSION_SEEN_KEY, EXTENSION_VERSION, EXTENSION_ZIP_HREF } from "@/lib/extensaoLatam";

/** Boas-vindas do emissor no primeiro acesso (por navegador: em outro PC ele vê de novo e instala a extensão lá). */
const KEY = "tm:emissor-boas-vindas:v1";

function firstName(name?: string | null) {
  const n = String(name || "").trim().split(/\s+/)[0] || "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
}

export default function EmissorWelcome() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [whoId, setWhoId] = useState("");

  useEffect(() => {
    const s = getSession();
    const { asEmissor, preview } = emissorViewNow();
    if (!asEmissor) return;
    // Na visualização do admin, conta como "primeiro acesso" daquele emissor neste navegador.
    const who = preview ? { id: `preview:${preview.id}`, name: preview.name } : { id: String(s?.id || ""), name: s?.name };
    let seen = false;
    try {
      seen = localStorage.getItem(`${KEY}:${who.id}`) === "1";
    } catch {
      seen = false;
    }
    if (seen) return;
    const t = window.setTimeout(() => {
      setWhoId(who.id);
      setName(firstName(who.name));
      setOpen(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  function finish() {
    try {
      if (whoId) localStorage.setItem(`${KEY}:${whoId}`, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  function downloaded() {
    try {
      localStorage.setItem(EXTENSION_SEEN_KEY, EXTENSION_VERSION);
      window.dispatchEvent(new Event("tm:extensao-vista"));
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-900/60 p-4" role="dialog" aria-modal="true">
      <div className="flex min-h-full items-center justify-center">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-[#0b2545] via-[#13315c] to-sky-600 px-6 py-6 text-white">
          <Plane className="h-8 w-8 opacity-90" />
          <h2 className="mt-3 text-2xl font-bold tracking-tight">Bem-vindo(a){name ? `, ${name}` : ""}!</h2>
          <p className="mt-1 text-sm text-white/80">
            Antes da primeira emissão, deixe tudo pronto neste computador. Leva uns 5 minutos.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">1</span>
              <Puzzle size={16} /> Instale a extensão de emissão (Chrome)
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Ela preenche passageiros e cartão no site da LATAM. Sem ela, a emissão é toda à mão.
            </p>
            <a
              href={EXTENSION_ZIP_HREF}
              download
              onClick={downloaded}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Download size={16} /> Baixar extensão v{EXTENSION_VERSION}
            </a>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>Descompacte o ZIP baixado em uma pasta.</li>
              <li>
                No Chrome, abra <code className="rounded bg-slate-100 px-1">chrome://extensions</code>.
              </li>
              <li>
                Ligue o <b>Modo do desenvolvedor</b> (canto superior direito).
              </li>
              <li>
                Clique em <b>Carregar sem compactação</b> e escolha a pasta.
              </li>
              <li>Use o TradeMiles neste mesmo Chrome.</li>
            </ol>
            <p className="mt-2 text-xs text-slate-500">
              Saiu versão nova? O link <b>Extensão de emissão</b> no menu mostra o selo &quot;nova&quot;: baixe de novo,
              substitua a pasta e clique em ↻ na extensão.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">2</span>
              <MessageCircle size={16} /> Conecte o seu Telegram
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Os pedidos dos clientes chegam pelo Telegram. Conectado, a venda lê os passageiros da conversa direto.
            </p>
            <Link
              href="/dashboard/telegram"
              onClick={finish}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Conectar Telegram
            </Link>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">3</span>
              Suas telas
            </h3>
            <ul className="mt-2 space-y-1.5">
              <li className="flex gap-2">
                <Plane size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  <b>Efetuar venda</b>: a emissão do começo ao fim (cedente, biometria, extensão e comprovante).
                </span>
              </li>
              <li className="flex gap-2">
                <LayoutGrid size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  <b>Painel de emissões</b>: quantos CPFs cada conta ainda tem na LATAM.
                </span>
              </li>
              <li className="flex gap-2">
                <Wallet size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  <b>Meus ganhos</b>: suas comissões, o lucro de cada mês, o total vendido e cada venda.
                </span>
              </li>
              <li className="flex gap-2">
                <CalendarDays size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  <b>Agenda</b>: marque seus horários.
                </span>
              </li>
            </ul>
          </section>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={finish}
            className="inline-flex h-11 items-center rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Tudo pronto, começar
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
