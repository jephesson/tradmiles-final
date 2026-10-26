"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import LoginSkyBackdrop from "@/app/login/LoginSkyBackdrop";

const navy = "#0c2340";
const waGreen = "#25D366";

type Payload = {
  latam: { maxAccount: number; total: number; minAccountThreshold: number };
  online: { name: string; whatsappUrl: string | null }[];
};

function fmtPts(n: number) {
  return n.toLocaleString("pt-BR");
}

function WhatsAppBubble({ href, name }: { href: string; name: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`WhatsApp de ${name}`}
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-md shadow-emerald-700/25 transition hover:scale-105 hover:brightness-110"
      style={{ backgroundColor: waGreen }}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  );
}

export default function ParceirosClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/parceiros", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setData(json.data as Payload);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <main className="relative min-h-screen overflow-hidden font-sans">
      <LoginSkyBackdrop />
      <div className="relative z-10 grid min-h-screen place-items-center px-4 py-10 sm:px-6 sm:py-12">
        <section className="w-full max-w-[440px] overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_24px_48px_-12px_rgba(12,35,64,0.14)] backdrop-blur-sm">
          <div className="space-y-6 px-7 pb-2 pt-8 sm:px-9 sm:pt-9">
            <header className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-4 sm:gap-5">
                <Image
                  src="/trademiles.png"
                  alt=""
                  width={88}
                  height={88}
                  unoptimized
                  className="h-20 w-20 shrink-0 object-contain sm:h-24 sm:w-24"
                />
                <div className="min-w-0 text-left">
                  <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Parceiros</h1>
                  <p className="mt-0.5 text-sm text-slate-500">Estoque LATAM e atendentes online</p>
                </div>
              </div>
            </header>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">LATAM Pass</h2>
              <p className="mt-1 text-xs text-slate-500">
                Contas com {fmtPts(data?.latam.minAccountThreshold ?? 2000)} pontos ou mais.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-medium text-slate-500">Máximo em uma conta</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: navy }}>
                    {loading ? "…" : fmtPts(data?.latam.maxAccount ?? 0)}
                  </div>
                  <div className="text-xs text-slate-400">pontos</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-medium text-slate-500">Estoque total</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: navy }}>
                    {loading ? "…" : fmtPts(data?.latam.total ?? 0)}
                  </div>
                  <div className="text-xs text-slate-400">pontos</div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Atendentes online
                </h2>
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  ao vivo
                </span>
              </div>

              {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

              {loading ? (
                <p className="mt-3 text-sm text-slate-500">Carregando…</p>
              ) : !data?.online.length ? (
                <p className="mt-3 rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">
                  Nenhum atendente online no momento.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.online.map((p, i) => (
                    <li
                      key={`${p.name}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-800">{p.name}</div>
                          <div className="text-xs text-slate-500">Online agora</div>
                        </div>
                      </div>
                      {p.whatsappUrl ? (
                        <WhatsAppBubble href={p.whatsappUrl} name={p.name} />
                      ) : (
                        <span className="text-xs text-slate-400">WhatsApp indisponível</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <footer className="border-t border-slate-200/80 bg-slate-50/90 px-7 py-4 text-center text-[11px] leading-relaxed text-slate-500 sm:px-9">
            <p>TradeMiles — uma empresa do grupo Vias Aéreas LTDA</p>
            <p className="mt-0.5 text-slate-400">CNPJ: 63.817.773/0001-85</p>
            <a href="/login" className="mt-2 inline-block text-xs font-medium text-sky-700 hover:underline">
              Área interna
            </a>
          </footer>
        </section>
      </div>
    </main>
  );
}
