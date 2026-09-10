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

function LegBlock({
  label,
  leg,
  empty,
  onDark,
}: {
  label?: string;
  leg: ShareLeg | null;
  empty?: string;
  onDark?: boolean;
}) {
  if (!leg) {
    return (
      <p className={cn("text-[13px]", onDark ? "text-white/70" : "text-slate-500")}>{empty || "—"}</p>
    );
  }
  const times = leg.depTime && leg.arrTime ? `${leg.depTime} → ${leg.arrTime}` : "";
  const dur = fmtDurationMin(leg.durationMin);
  const stops = stopsLabel(leg.stops);
  return (
    <div>
      {label ? (
        <div
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide",
            onDark ? "text-white/60" : "text-slate-400"
          )}
        >
          {label}
        </div>
      ) : null}
      <div className={cn("text-[15px] font-semibold", onDark ? "text-white" : "text-slate-900")}>
        {leg.origin} → {leg.dest}
      </div>
      <div className={cn("text-[12px]", onDark ? "text-white/75" : "text-slate-500")}>
        {leg.dateBr}
        {leg.airline ? ` · ${leg.airline}` : ""}
      </div>
      {times ? (
        <div className={cn("mt-0.5 text-[14px] font-medium", onDark ? "text-white" : "text-slate-800")}>
          {times}
        </div>
      ) : null}
      {dur || stops ? (
        <div className={cn("text-[12px]", onDark ? "text-white/75" : "text-slate-600")}>
          {[dur, stops].filter(Boolean).join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

export type CotacaoShareModel = {
  tripKind: string;
  cashTotalCents: number;
  cashSiteLabel?: string;
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
      pct: `${pct}% abaixo do à vista`,
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
  const route = model.cashIda
    ? `${model.cashIda.origin} → ${model.cashIda.dest}`
    : model.milesIda
      ? `${model.milesIda.origin} → ${model.milesIda.dest}`
      : "Trecho";
  const date = model.cashIda?.dateBr || model.milesIda?.dateBr || "";
  const hasVolta = Boolean(model.cashVolta || model.milesVolta);

  return (
    <div
      id={id}
      className={cn(
        "overflow-hidden rounded-[28px] bg-white text-slate-900",
        fluid ? "w-full max-w-[720px]" : "w-[720px]"
      )}
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="bg-white px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <img
            src="/vias-aereas-logo.png"
            alt="Vias Aéreas"
            width={220}
            height={90}
            className="h-[56px] w-auto object-contain object-left"
            crossOrigin="anonymous"
          />
          <div className="text-right">
            <div className="text-[20px] font-bold tracking-tight text-slate-900">{route}</div>
            <div className="text-[12px] text-slate-500">
              {date}
              {date ? " · " : ""}
              {model.tripKind}
            </div>
          </div>
        </div>
      </div>
      <div className="h-1.5 bg-[#9f1239]" />

      <div className="grid grid-cols-5">
        <div className="col-span-2 flex min-h-[300px] flex-col bg-slate-100 px-5 py-5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Em outros sites
          </div>
          <div className="mt-0.5 text-[13px] font-semibold text-slate-500">
            {model.cashSiteLabel || "Google Flights"}
          </div>
          <div className="mt-3 flex-1 space-y-3">
            <LegBlock label={hasVolta ? "Ida" : undefined} leg={model.cashIda} empty="Sem tarifa à vista" />
            {hasVolta ? <LegBlock label="Volta" leg={model.cashVolta} empty="Sem volta à vista" /> : null}
          </div>
          <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="text-[22px] font-semibold tabular-nums text-slate-500">
              {fmtMoney(model.cashTotalCents)}
            </div>
            <div className="text-[11px] text-slate-400">preço em dinheiro</div>
          </div>
        </div>

        <div
          className={cn(
            "col-span-3 flex min-h-[300px] flex-col px-6 py-5",
            save?.tone === "more" ? "bg-slate-900 text-white" : "bg-emerald-600 text-white"
          )}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Com a gente</div>
          <div className="mt-0.5 text-[15px] font-bold">{model.ciaLabel}</div>
          <div className="mt-3 flex-1 space-y-3">
            <LegBlock
              onDark
              label={hasVolta ? "Ida" : undefined}
              leg={model.milesIda}
              empty="Selecione o voo na cia"
            />
            {hasVolta ? (
              <LegBlock onDark label="Volta" leg={model.milesVolta} empty="Selecione a volta na cia" />
            ) : null}
          </div>
          <div className="mt-4 border-t border-white/20 pt-3">
            <div className="text-[40px] font-bold leading-none tracking-tight tabular-nums">
              {fmtMoney(model.milesTotalCents)}
            </div>
            <div className="mt-1 text-[13px] text-white/85">com a Vias Aéreas</div>
            {save ? (
              <div className="mt-3 rounded-2xl bg-white/15 px-3 py-2.5">
                <div className="text-[22px] font-bold leading-tight tracking-tight">{save.reais}</div>
                <div className="mt-0.5 text-[13px] text-white/90">{save.pct}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {time || stops ? (
        <div className="bg-slate-50 px-6 py-2.5 text-[13px] text-slate-600">
          {[time, stops].filter(Boolean).join(" · ")}
        </div>
      ) : null}

      <div className="flex items-center justify-between px-6 py-3 text-[12px] text-slate-500">
        <span>Proposta Vias Aéreas · valores sujeitos à disponibilidade</span>
        <span>@viasaereastrip</span>
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
    backgroundColor: "#ffffff",
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
