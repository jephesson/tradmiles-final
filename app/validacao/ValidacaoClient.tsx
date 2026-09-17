"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Fingerprint, CreditCard } from "lucide-react";
import {
  buildLatamPagamentoLink,
  extractLatamOrderId,
  normalizeUnicoBiometriaLink,
} from "@/lib/latam/validacaoLinks";

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    window.prompt("Copie:", value);
    return true;
  }
}

function ResultBox({
  value,
  note,
}: {
  value: string;
  note?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="mt-3 space-y-2">
      {note ? <div className="text-[12px] font-medium text-emerald-700">{note}</div> : null}
      <div className="break-all rounded-xl border border-emerald-200 bg-white px-3 py-2.5 font-mono text-[12px] text-slate-800">
        {value}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-800 hover:bg-slate-50"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
        <button
          type="button"
          onClick={() => window.open(value, "_blank", "noopener,noreferrer")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] font-medium text-sky-800 hover:bg-sky-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Abrir
        </button>
      </div>
    </div>
  );
}

export default function ValidacaoClient() {
  const [orderInput, setOrderInput] = useState("");
  const [bioInput, setBioInput] = useState("");

  const orderId = useMemo(() => extractLatamOrderId(orderInput), [orderInput]);
  const pagamentoLink = orderId ? buildLatamPagamentoLink(orderId) : null;
  const bioLink = useMemo(() => normalizeUnicoBiometriaLink(bioInput), [bioInput]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
        <div className="mb-8">
          <Image
            src="/vias-aereas-logo.png"
            alt="Vias Aéreas"
            width={200}
            height={72}
            priority
            className="h-14 w-auto object-contain object-left"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Validação</h1>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-slate-600">
          Cole o link da LATAM para gerar a página de pagamento, ou o link da Unico para gerar o
          link da biometria. Não precisa entrar no sistema.
        </p>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                <CreditCard className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Pagamento LATAM</h2>
                <p className="text-[12px] text-slate-500">
                  Cole o link da reserva ou o Order ID (LA…).
                </p>
              </div>
            </div>
            <input
              className="mt-4 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm outline-none focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-900/10"
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              placeholder="https://www.latamairlines.com/…?orderId=LA…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {orderInput.trim() && !orderId ? (
              <div className="mt-2 text-[12px] text-rose-600">
                Order ID inválido. Precisa começar com LA.
              </div>
            ) : null}
            {orderId && pagamentoLink ? (
              <ResultBox value={pagamentoLink} note={`Order ID ${orderId} → página de pagamento`} />
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-violet-700">
                <Fingerprint className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Biometria Unico</h2>
                <p className="text-[12px] text-slate-500">
                  Cole o link do intro. Converte para o process que o cedente abre.
                </p>
              </div>
            </div>
            <input
              className="mt-4 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-900/10"
              value={bioInput}
              onChange={(e) => setBioInput(e.target.value)}
              placeholder="https://cadastro.unico.app/flow/intro?…&id=…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {bioInput.trim() && !bioLink ? (
              <div className="mt-2 text-[12px] text-rose-600">
                Link Unico inválido. Use o intro (com id=) ou o /process/….
              </div>
            ) : null}
            {bioLink ? (
              <ResultBox
                value={bioLink}
                note={
                  bioLink !== bioInput.trim()
                    ? "Convertido do intro → process"
                    : "Link de biometria pronto"
                }
              />
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
