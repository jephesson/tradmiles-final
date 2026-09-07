"use client";

import { useRef, useState } from "react";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDurationMin } from "@/lib/cotacao-passagens";

export type ShareLeg = {
  origin: string;
  dest: string;
  dateBr: string;
  airline: string;
  depTime?: string | null;
  arrTime?: string | null;
  durationMin: number | null;
  stops: number | null;
};

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function stopsLabel(stops: number | null) {
  if (stops === 0) return "Direto";
  if (typeof stops === "number" && stops > 0) {
    return `${stops} ${stops === 1 ? "parada" : "paradas"}`;
  }
  return "";
}

function cityName(iata?: string | null) {
  const code = String(iata || "")
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const names: Record<string, string> = {
    GRU: "São Paulo",
    CGH: "São Paulo",
    VCP: "Campinas",
    GIG: "Rio de Janeiro",
    SDU: "Rio de Janeiro",
    CWB: "Curitiba",
    POA: "Porto Alegre",
    CNF: "Belo Horizonte",
    PLU: "Belo Horizonte",
    BSB: "Brasília",
    SSA: "Salvador",
    REC: "Recife",
    FOR: "Fortaleza",
    MAO: "Manaus",
    BEL: "Belém",
    NAT: "Natal",
    MCZ: "Maceió",
    AJU: "Aracaju",
    SLZ: "São Luís",
    THE: "Teresina",
    JPA: "João Pessoa",
    CGB: "Cuiabá",
    CGR: "Campo Grande",
    GYN: "Goiânia",
    FLN: "Florianópolis",
    NVT: "Navegantes",
    IGU: "Foz do Iguaçu",
    VIX: "Vitória",
    BPS: "Porto Seguro",
    FEN: "Fernando de Noronha",
    PMW: "Palmas",
    PVH: "Porto Velho",
    RBR: "Rio Branco",
    MCP: "Macapá",
    BVB: "Boa Vista",
  };
  return names[code] || code;
}

function routeTitle(ida: ShareLeg | null, milesIda: ShareLeg | null) {
  const origin = ida?.origin || milesIda?.origin || "";
  const dest = ida?.dest || milesIda?.dest || "";
  if (!origin || !dest) return "Trecho";
  const a = cityName(origin);
  const b = cityName(dest);
  if (a.length > 3 && b.length > 3) return `${a.toUpperCase()} → ${b.toUpperCase()}`;
  return `${origin} → ${dest}`;
}

function FlightRow({ label, leg, empty }: { label: string; leg: ShareLeg | null; empty: string }) {
  if (!leg) {
    return (
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
        <p className="mt-1 text-[13px] text-slate-500">{empty}</p>
      </div>
    );
  }
  const times = leg.depTime && leg.arrTime ? `${leg.depTime}  →  ${leg.arrTime}` : "";
  const meta = [fmtDurationMin(leg.durationMin), stopsLabel(leg.stops)].filter(Boolean).join(" · ");
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#9f1239]">{label}</div>
        {leg.dateBr ? <div className="text-[11px] font-medium text-slate-500">{leg.dateBr}</div> : null}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <div className="text-[18px] font-bold tracking-tight text-slate-900">
            {leg.origin}
            <span className="mx-1.5 text-[13px] font-semibold text-slate-400">→</span>
            {leg.dest}
          </div>
          {times ? <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-slate-800">{times}</div> : null}
          <div className="mt-0.5 text-[12px] text-slate-500">
            {[leg.airline, meta].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
    </div>
  );
}

export type CotacaoShareModel = {
  tripKind: string;
  cashTotalCents: number;
  cashIda: ShareLeg | null;
  cashVolta: ShareLeg | null;
  ciaLabel: string;
  milesTotalCents: number;
  miles: number;
  feeCents: number;
  milheiroCents: number;
  milheiroLabel?: string;
  milesIda: ShareLeg | null;
  milesVolta: ShareLeg | null;
};

function savingsCopy(cash: number, miles: number) {
  const delta = cash - miles;
  if (cash <= 0 || miles <= 0) return null;
  const pct = Math.round((delta / cash) * 1000) / 10;
  if (delta > 0) {
    return {
      tone: "save" as const,
      reais: `Economia de ${fmtMoney(delta)}`,
      pct: `${pct.toLocaleString("pt-BR")}% mais barato que no Google Flights`,
    };
  }
  if (delta < 0) {
    const up = Math.round((Math.abs(delta) / cash) * 1000) / 10;
    return {
      tone: "more" as const,
      reais: `${fmtMoney(Math.abs(delta))} a mais`,
      pct: `${up}% acima do à vista`,
    };
  }
  return { tone: "even" as const, reais: "Mesmo valor do à vista", pct: "A vantagem fica no itinerário" };
}

function timeCopy(cashMin: number | null, milesMin: number | null) {
  if (!cashMin || !milesMin) return null;
  const d = cashMin - milesMin;
  if (d >= 20) return `${fmtDurationMin(d)} mais rápido`;
  if (d <= -20) return `${fmtDurationMin(-d)} a mais de viagem`;
  return "Tempo de voo parecido";
}

function stopsCopy(cashStops: number | null, milesStops: number | null) {
  if (cashStops == null || milesStops == null) return null;
  const d = cashStops - milesStops;
  if (d > 0) return `${d} ${d === 1 ? "parada a menos" : "paradas a menos"}`;
  if (d < 0) return `${-d} ${-d === 1 ? "parada a mais" : "paradas a mais"}`;
  if (cashStops === 0) return "Os dois diretos";
  return "Mesmas conexões";
}

function sumDur(legs: Array<ShareLeg | null>) {
  let n = 0;
  let ok = 0;
  for (const l of legs) {
    if (l?.durationMin && l.durationMin > 0) {
      n += l.durationMin;
      ok += 1;
    }
  }
  return ok ? n : null;
}

function sumStops(legs: Array<ShareLeg | null>) {
  let n = 0;
  let ok = 0;
  for (const l of legs) {
    if (typeof l?.stops === "number") {
      n += l.stops;
      ok += 1;
    }
  }
  return ok ? n : null;
}

export function CotacaoShareCard({
  model,
  id,
  fluid,
}: {
  model: CotacaoShareModel;
  id?: string;
  fluid?: boolean;
}) {
  const save = savingsCopy(model.cashTotalCents, model.milesTotalCents);
  const cashLegs = [model.cashIda, model.cashVolta];
  const milesLegs = [model.milesIda, model.milesVolta];
  const time = timeCopy(sumDur(cashLegs), sumDur(milesLegs));
  const stops = stopsCopy(sumStops(cashLegs), sumStops(milesLegs));
  const ida = model.milesIda || model.cashIda;
  const volta = model.milesVolta || model.cashVolta;
  const hasVolta = Boolean(model.cashVolta || model.milesVolta);
  const title = routeTitle(model.cashIda, model.milesIda);
  const date = ida?.dateBr || "";
  const direct = milesLegs.every((l) => !l || l.stops === 0) && milesLegs.some((l) => l);

  return (
    <div
      id={id}
      className={cn(
        "overflow-hidden rounded-[28px] text-slate-900",
        fluid ? "w-full max-w-[720px]" : "w-[720px]"
      )}
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", background: "#0f2744" }}
    >
      <div className="px-7 pb-5 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-xl bg-white px-2 py-1.5">
              <img
                src="/vias-aereas-logo.png"
                alt="Vias Aéreas"
                width={220}
                height={90}
                className="h-[44px] w-auto object-contain object-left"
                crossOrigin="anonymous"
              />
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
              Sua viagem mais longe
            </div>
          </div>
          <div className="rounded-full bg-[#9f1239] px-3 py-1.5 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-white">Passagens com milhas</div>
            <div className="text-[9px] font-medium text-white/85">Mais destinos. Mais economia.</div>
          </div>
        </div>
        <div className="mt-6">
          <div className="text-[26px] font-bold leading-tight tracking-tight text-white">{title}</div>
          <div className="mt-1 text-[13px] font-medium text-white/80">
            {model.tripKind}
            {date ? ` · ${date}` : ""}
            {hasVolta && volta?.dateBr ? ` → ${volta.dateBr}` : ""}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 bg-[#e8eef4] px-4 py-4">
        <div className="col-span-3 rounded-2xl bg-white px-5 py-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Seu voo</div>
          <div className="mt-3 space-y-4">
            <FlightRow label="Ida" leg={ida} empty="Selecione a ida" />
            {hasVolta ? (
              <>
                <div className="h-px bg-slate-100" />
                <FlightRow label="Volta" leg={volta} empty="Selecione a volta" />
              </>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-slate-600">
            {direct ? <span className="rounded-full bg-slate-100 px-2.5 py-1">Voo direto</span> : null}
            {time ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{time}</span> : null}
            {stops && !direct ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{stops}</span> : null}
            <span className="rounded-full bg-slate-100 px-2.5 py-1">{model.ciaLabel}</span>
          </div>
        </div>

        <div
          className={cn(
            "col-span-2 flex flex-col rounded-2xl px-4 py-4 text-white shadow-sm",
            save?.tone === "more" ? "bg-slate-900" : "bg-emerald-600"
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-white/75">
            Valor com a Vias Aéreas
          </div>
          <div className="mt-2 text-[32px] font-bold leading-none tracking-tight tabular-nums">
            {fmtMoney(model.milesTotalCents)}
          </div>
          <div className="mt-1 text-[12px] text-white/85">com a gente</div>
          {save ? (
            <div className="mt-3 rounded-xl bg-black/20 px-3 py-2.5">
              <div className="text-[16px] font-bold leading-tight">{save.reais}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-white/90">{save.pct}</div>
            </div>
          ) : null}
          <div className="mt-auto border-t border-white/20 pt-3">
            <div className="text-[9px] font-bold uppercase tracking-wide text-white/60">Em outros sites</div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-white/80">Google Flights</span>
              <span className="text-[14px] font-semibold tabular-nums text-white/90">
                {fmtMoney(model.cashTotalCents)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-7 py-3 text-[11px] text-white/70">
        <span>Viaje mais. Viva o extraordinário.</span>
        <span>@viasaereastrip · viasaereas.com.br</span>
      </div>
    </div>
  );
}

async function waitForImages(node: HTMLElement) {
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
    )
  );
}

async function nodeToPngBlob(node: HTMLElement) {
  await waitForImages(node);
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#0f2744",
  });
  if (!blob) throw new Error("Não consegui gerar a imagem.");
  return blob;
}

async function copyPng(blob: Blob) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return;
  } catch {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": Promise.resolve(blob) as unknown as Blob }),
    ]);
  }
}

export function CotacaoShareActions({ model, disabled }: { model: CotacaoShareModel | null; disabled?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"copy" | "down" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function withCard(kind: "copy" | "down") {
    if (!model || !mountRef.current) return;
    setBusy(kind);
    setError("");
    try {
      const node = mountRef.current.querySelector("[data-share-card]") as HTMLElement | null;
      if (!node) throw new Error("Cartão não encontrado.");
      const blob = await nodeToPngBlob(node);
      if (kind === "copy") {
        await copyPng(blob);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const route = model.cashIda ? `${model.cashIda.origin}-${model.cashIda.dest}` : "trecho";
        a.href = url;
        a.download = `proposta-${route}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar a imagem.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || !model || busy != null}
          onClick={() => void withCard("copy")}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#9f1239] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "copy" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Copiada" : "Copiar imagem"}
        </button>
        <button
          type="button"
          disabled={disabled || !model || busy != null}
          onClick={() => void withCard("down")}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50"
        >
          {busy === "down" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Baixar PNG
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      {model ? (
        <div
          ref={mountRef}
          aria-hidden
          className="pointer-events-none fixed"
          style={{ left: -10000, top: 0, zIndex: -1 }}
        >
          <div data-share-card>
            <CotacaoShareCard model={model} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
