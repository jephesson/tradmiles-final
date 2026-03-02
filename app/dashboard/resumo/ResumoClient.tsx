"use client";

import { useEffect, useMemo, useState } from "react";

type Points = { latam: number; smiles: number; livelo: number; esfera: number };

type Snapshot = {
  id: string;
  date: string;
  totalBruto: number;
  totalDividas: number;
  totalLiquido: number;
};

type CedenteOpt = {
  id: string;
  nomeCompleto: string;
  cpf: string;
  identificador: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
};

type BlockRow = {
  id: string;
  status: "OPEN" | "UNBLOCKED" | "CANCELED";
  program: "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
  createdAt: string;
  cedente: { id: string; nomeCompleto: string; cpf: string; identificador: string };
  pointsBlocked: number;
  valueBlockedCents: number;
};

type ReceberStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELED";
type DividaAReceberRow = {
  id: string;
  status?: ReceberStatus | string | null;
  totalCents?: number | null;
  receivedCents?: number | null;
};

// ✅ shape do backend (igual ao Caixa Imediato)
type DARResponse = {
  ok: boolean;
  rows?: DividaAReceberRow[];
  totalsAll?: { totalCents: number; receivedCents: number; balanceCents: number };
  totalsOpen?: { totalCents: number; receivedCents: number; balanceCents: number }; // OPEN+PARTIAL
  error?: string;
};

type PendingPointsResponse = {
  ok: true;
  data: {
    latamPoints: number;
    smilesPoints: number;
    latamCount: number;
    smilesCount: number;
  };
};

type LatamVisualizarResponse = {
  ok?: boolean;
  rows?: Array<{ latamPendente?: number }>;
  error?: string;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function dateBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}
function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function safeInt(v: unknown, fb = 0) {
  const n = Number(String(v ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}
function centsToRateInput(cents: number) {
  const v = (Number(cents || 0) / 100).toFixed(2);
  return v.replace(".", ",");
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1">
      <div className="text-xs text-slate-600">{label}</div>
      <input
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function Line({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "plus" | "minus";
}) {
  const vCls =
    tone === "plus"
      ? "font-semibold text-emerald-700"
      : tone === "minus"
      ? "font-semibold text-rose-700"
      : "font-semibold text-slate-900";

  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-sm text-slate-700">{label}</div>
        {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
      </div>
      <div className={`shrink-0 text-sm ${vCls}`}>{value}</div>
    </div>
  );
}

// ✅ fallback (caso totalsOpen não venha)
function computeDividasAReceberOpenCents(list: DividaAReceberRow[]) {
  let sum = 0;

  for (const r of list || []) {
    const status = String(r?.status || "").toUpperCase();
    if (status === "CANCELED") continue; // ignora canceladas

    const total = Math.max(0, Number(r?.totalCents ?? 0) || 0);
    const received = Math.max(0, Number(r?.receivedCents ?? 0) || 0);
    const remaining = total - received;

    if (remaining > 0) sum += remaining;
  }

  return sum;
}

export default function CedentesResumoClient() {
  const [loading, setLoading] = useState(false);
  const [cutoffInput, setCutoffInput] = useState<string>("5000");

  const [points, setPoints] = useState<Points>({
    latam: 0,
    smiles: 0,
    livelo: 0,
    esfera: 0,
  });

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [cashInput, setCashInput] = useState<string>("");
  const [cedentes, setCedentes] = useState<CedenteOpt[]>([]);
  const [blockedRows, setBlockedRows] = useState<BlockRow[]>([]);

  const [debtsOpenCents, setDebtsOpenCents] = useState<number>(0);

  // ✅ comissões pendentes (cedentes)
  const [pendingCedenteCommissionsCents, setPendingCedenteCommissionsCents] = useState<number>(0);

  // ✅ recebimentos em aberto (A RECEBER - vendas)
  const [receivablesOpenCents, setReceivablesOpenCents] = useState<number>(0);

  // ✅ dívidas a receber (OPEN+PARTIAL pelo totalsOpen.balanceCents)
  const [dividasAReceberOpenCents, setDividasAReceberOpenCents] = useState<number>(0);

  // ✅ a pagar funcionários (pendente)
  const [employeePayoutsPendingCents, setEmployeePayoutsPendingCents] = useState<number>(0);

  // ✅ impostos pendentes (mês não pago)
  const [taxesPendingCents, setTaxesPendingCents] = useState<number>(0);

  // ✅ pontos pendentes de compras OPEN (para caixa imediato)
  const [pendingPurchaseLatamPoints, setPendingPurchaseLatamPoints] = useState(0);
  const [pendingPurchaseSmilesPoints, setPendingPurchaseSmilesPoints] = useState(0);
  const [pendingPurchaseLatamCount, setPendingPurchaseLatamCount] = useState(0);
  const [pendingPurchaseSmilesCount, setPendingPurchaseSmilesCount] = useState(0);

  // ✅ opcional: se o backend mandar pronto, usamos (senão calculamos)
  const [cashProjectedFromApiCents, setCashProjectedFromApiCents] = useState<number | null>(null);

  const [rateLatam, setRateLatam] = useState("20,00");
  const [rateSmiles, setRateSmiles] = useState("18,00");
  const [rateLivelo, setRateLivelo] = useState("22,00");
  const [rateEsfera, setRateEsfera] = useState("17,00");

  const [didLoad, setDidLoad] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [rResumo, rDAR, rCedentes, rBloq, rPendingPts, rLatamVisualizar] = await Promise.all([
        fetch("/api/resumo", { cache: "no-store" }),
        // ✅ se teu endpoint suportar, pode reduzir payload (totalsOpen continua vindo)
        fetch("/api/dividas-a-receber?take=1", { cache: "no-store" }),
        fetch("/api/cedentes/options", { cache: "no-store" }),
        fetch("/api/bloqueios", { cache: "no-store" }),
        fetch("/api/compras/pending-points", { cache: "no-store" }),
        fetch("/api/cedentes/latam", { cache: "no-store" }),
      ]);

      const j = await rResumo.json();
      const jDAR = (await rDAR.json()) as DARResponse;
      const jCed = await rCedentes.json();
      const jBloq = await rBloq.json();
      const jPending = (await rPendingPts.json()) as PendingPointsResponse;
      const jLatam = (await rLatamVisualizar.json()) as LatamVisualizarResponse;

      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar resumo");
      if (!jDAR?.ok) throw new Error(jDAR?.error || "Erro ao carregar dívidas a receber");
      if (!jCed?.ok) throw new Error(jCed?.error || "Erro ao carregar cedentes");
      if (!jBloq?.ok) throw new Error(jBloq?.error || "Erro ao carregar bloqueios");
      if (!jPending?.ok) throw new Error((jPending as any)?.error || "Erro ao carregar pontos pendentes");

      setPoints(j.data.points);
      setSnapshots(j.data.snapshots);
      setCedentes(jCed.data || []);
      setBlockedRows(jBloq.data?.rows || []);

      const latestCashCents = Number(j.data.latestCashCents ?? 0);
      setCashInput(String((latestCashCents / 100).toFixed(2)).replace(".", ","));

      const rates = j.data.ratesCents;
      if (rates) {
        setRateLatam(centsToRateInput(rates.latamRateCents));
        setRateSmiles(centsToRateInput(rates.smilesRateCents));
        setRateLivelo(centsToRateInput(rates.liveloRateCents));
        setRateEsfera(centsToRateInput(rates.esferaRateCents));
      }

      setDebtsOpenCents(Number(j.data.debtsOpenCents || 0));
      setPendingCedenteCommissionsCents(Number(j.data.pendingCedenteCommissionsCents || 0));
      setReceivablesOpenCents(Number(j.data.receivablesOpenCents || 0));

      setEmployeePayoutsPendingCents(Number(j.data.employeePayoutsPendingCents || 0));
      setTaxesPendingCents(Number(j.data.taxesPendingCents || 0));

      const apiProjected = j.data.cashProjectedCents;
      setCashProjectedFromApiCents(apiProjected == null ? null : Number(apiProjected || 0));

      /**
       * ✅ DÍVIDAS A RECEBER:
       * Igual ao Caixa Imediato:
       * usa totalsOpen.balanceCents (OPEN+PARTIAL).
       * Se não vier, faz fallback pelos rows.
       */
      const darOpen = Number(jDAR?.totalsOpen?.balanceCents ?? NaN);
      if (Number.isFinite(darOpen)) {
        setDividasAReceberOpenCents(darOpen);
      } else {
        const rows = Array.isArray(jDAR?.rows) ? jDAR.rows : [];
        setDividasAReceberOpenCents(computeDividasAReceberOpenCents(rows));
      }

      const pendingLatamFromCompras = Number(jPending.data?.latamPoints || 0);
      const pendingLatamCountFromCompras = Number(jPending.data?.latamCount || 0);

      let pendingLatamFromVisualizar = 0;
      let pendingLatamCountFromVisualizar = 0;
      if (rLatamVisualizar.ok && jLatam?.ok && Array.isArray(jLatam.rows)) {
        pendingLatamFromVisualizar = jLatam.rows.reduce(
          (acc, row) => acc + Number(row?.latamPendente || 0),
          0
        );
        pendingLatamCountFromVisualizar = jLatam.rows.filter(
          (row) => Number(row?.latamPendente || 0) > 0
        ).length;
      }

      if (pendingLatamFromVisualizar > pendingLatamFromCompras) {
        setPendingPurchaseLatamPoints(pendingLatamFromVisualizar);
        setPendingPurchaseLatamCount(pendingLatamCountFromVisualizar);
      } else {
        setPendingPurchaseLatamPoints(pendingLatamFromCompras);
        setPendingPurchaseLatamCount(pendingLatamCountFromCompras);
      }

      setPendingPurchaseSmilesPoints(Number(jPending.data?.smilesPoints || 0));
      setPendingPurchaseSmilesCount(Number(jPending.data?.smilesCount || 0));

      setDidLoad(true);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function salvarRates() {
    const res = await fetch("/api/resumo/rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latam: rateLatam,
        smiles: rateSmiles,
        livelo: rateLivelo,
        esfera: rateEsfera,
      }),
    });
    const j = await res.json();
    if (!j?.ok) throw new Error(j?.error || "Erro ao salvar milheiros");
  }

  useEffect(() => {
    if (!didLoad) return;
    const t = setTimeout(() => {
      salvarRates().catch(() => {});
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateLatam, rateSmiles, rateLivelo, rateEsfera, didLoad]);

  const blockedTotals = useMemo(() => {
    const open = blockedRows.filter((r) => r.status === "OPEN");
    const openCount = open.length;
    const valueBlockedCents = open.reduce((a, r) => a + (r.valueBlockedCents || 0), 0);
    return { openCount, valueBlockedCents };
  }, [blockedRows]);

  const eligible = useMemo(() => {
    const cutoff = Math.max(0, safeInt(cutoffInput, 0));

    let pts: Points = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
    let counts = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };

    for (const c of cedentes) {
      const pLatam = Number(c.pontosLatam || 0);
      const pSmiles = Number(c.pontosSmiles || 0);
      const pLivelo = Number(c.pontosLivelo || 0);
      const pEsfera = Number(c.pontosEsfera || 0);

      if (pLatam >= cutoff) {
        pts.latam += pLatam;
        counts.latam += 1;
      }
      if (pSmiles >= cutoff) {
        pts.smiles += pSmiles;
        counts.smiles += 1;
      }
      if (pLivelo >= cutoff) {
        pts.livelo += pLivelo;
        counts.livelo += 1;
      }
      if (pEsfera >= cutoff) {
        pts.esfera += pEsfera;
        counts.esfera += 1;
      }
    }

    return { cutoff, pts, counts };
  }, [cedentes, cutoffInput]);

  const caixaImediatoCalc = useMemo(() => {
    const milLatam = Math.floor((eligible.pts.latam || 0) / 1000);
    const milSmiles = Math.floor((eligible.pts.smiles || 0) / 1000);
    const milLivelo = Math.floor((eligible.pts.livelo || 0) / 1000);
    const milEsfera = Math.floor((eligible.pts.esfera || 0) / 1000);

    const rateLatamCents = Math.round((Number(String(rateLatam).replace(",", ".")) || 0) * 100);
    const rateSmilesCents = Math.round((Number(String(rateSmiles).replace(",", ".")) || 0) * 100);
    const rateLiveloCents = Math.round((Number(String(rateLivelo).replace(",", ".")) || 0) * 100);
    const rateEsferaCents = Math.round((Number(String(rateEsfera).replace(",", ".")) || 0) * 100);

    const milesValueEligibleCents =
      milLatam * rateLatamCents +
      milSmiles * rateSmilesCents +
      milLivelo * rateLiveloCents +
      milEsfera * rateEsferaCents;

    const pendingLatamMil = Math.floor((pendingPurchaseLatamPoints || 0) / 1000);
    const pendingSmilesMil = Math.floor((pendingPurchaseSmilesPoints || 0) / 1000);

    const pendingLatamValueCents = pendingLatamMil * rateLatamCents;
    const pendingSmilesValueCents = pendingSmilesMil * rateSmilesCents;
    const pendingPurchasesValueCents = pendingLatamValueCents + pendingSmilesValueCents;

    const cashCents = toCentsFromInput(cashInput);
    const receivableSalesCents = Number(receivablesOpenCents || 0);
    const receivableDARcents = Number(dividasAReceberOpenCents || 0);

    const totalGrossCents =
      milesValueEligibleCents +
      pendingPurchasesValueCents +
      cashCents +
      receivableSalesCents +
      receivableDARcents;

    const outCents =
      (debtsOpenCents || 0) +
      (blockedTotals.valueBlockedCents || 0) +
      (pendingCedenteCommissionsCents || 0) +
      (employeePayoutsPendingCents || 0) +
      (taxesPendingCents || 0);

    const totalImmediateCents = totalGrossCents - outCents;

    const cashProjectedInterCents =
      cashCents +
      receivableSalesCents +
      receivableDARcents -
      (employeePayoutsPendingCents || 0) -
      (taxesPendingCents || 0);

    return {
      milLatam,
      milSmiles,
      milLivelo,
      milEsfera,
      milesValueEligibleCents,
      pendingLatamMil,
      pendingSmilesMil,
      pendingLatamValueCents,
      pendingSmilesValueCents,
      pendingPurchasesValueCents,
      cashCents,
      receivableSalesCents,
      receivableDARcents,
      totalGrossCents,
      outCents,
      totalImmediateCents,
      cashProjectedInterCents,
    };
  }, [
    eligible,
    rateLatam,
    rateSmiles,
    rateLivelo,
    rateEsfera,
    pendingPurchaseLatamPoints,
    pendingPurchaseSmilesPoints,
    cashInput,
    receivablesOpenCents,
    dividasAReceberOpenCents,
    debtsOpenCents,
    blockedTotals.valueBlockedCents,
    pendingCedenteCommissionsCents,
    employeePayoutsPendingCents,
    taxesPendingCents,
  ]);

  const calc = useMemo(() => {
    const milLatam = Math.floor((points.latam || 0) / 1000);
    const milSmiles = Math.floor((points.smiles || 0) / 1000);
    const milLivelo = Math.floor((points.livelo || 0) / 1000);
    const milEsfera = Math.floor((points.esfera || 0) / 1000);

    const rLatam = Number(String(rateLatam).replace(",", ".")) || 0;
    const rSmiles = Number(String(rateSmiles).replace(",", ".")) || 0;
    const rLivelo = Number(String(rateLivelo).replace(",", ".")) || 0;
    const rEsfera = Number(String(rateEsfera).replace(",", ".")) || 0;

    const vLatamCents = Math.round(milLatam * rLatam * 100);
    const vSmilesCents = Math.round(milSmiles * rSmiles * 100);
    const vLiveloCents = Math.round(milLivelo * rLivelo * 100);
    const vEsferaCents = Math.round(milEsfera * rEsfera * 100);

    const cashCents = toCentsFromInput(cashInput);

    const receivableSalesCents = Number(receivablesOpenCents || 0);
    const receivableDARcents = Number(dividasAReceberOpenCents || 0);

    const totalGrossCents =
      vLatamCents +
      vSmilesCents +
      vLiveloCents +
      vEsferaCents +
      cashCents +
      receivableSalesCents +
      receivableDARcents;

    const totalNetCents = totalGrossCents - (debtsOpenCents || 0);

    const totalAfterPendingsCents =
      totalNetCents -
      (pendingCedenteCommissionsCents || 0) -
      (employeePayoutsPendingCents || 0) -
      (taxesPendingCents || 0);

    const cashProjectedCalcCents =
      cashCents +
      receivableSalesCents +
      receivableDARcents -
      (employeePayoutsPendingCents || 0) -
      (taxesPendingCents || 0);

    const cashProjectedCents =
      cashProjectedFromApiCents != null ? cashProjectedFromApiCents : cashProjectedCalcCents;

    return {
      milLatam,
      milSmiles,
      milLivelo,
      milEsfera,
      vLatamCents,
      vSmilesCents,
      vLiveloCents,
      vEsferaCents,
      cashCents,

      receivableSalesCents,
      receivableDARcents,

      totalGrossCents,
      totalNetCents,
      totalAfterPendingsCents,
      cashProjectedCents,
    };
  }, [
    points,
    rateLatam,
    rateSmiles,
    rateLivelo,
    rateEsfera,
    cashInput,
    debtsOpenCents,
    pendingCedenteCommissionsCents,
    receivablesOpenCents,
    dividasAReceberOpenCents,
    employeePayoutsPendingCents,
    taxesPendingCents,
    cashProjectedFromApiCents,
  ]);

  async function salvarCaixaHoje() {
    try {
      const res = await fetch("/api/resumo/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashCents: calc.cashCents,
          totalBrutoCents: calc.totalGrossCents, // ✅ bruto inclui DAR
          totalDividasCents: debtsOpenCents,
          totalLiquidoCents: calc.totalNetCents, // ✅ bruto − dívidas
        }),
      });

      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao salvar snapshot");
      await load();
      alert("✅ Snapshot do dia salvo!");
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function salvarCaixaImediatoHoje() {
    try {
      const res = await fetch("/api/caixa-imediato/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashCents: caixaImediatoCalc.cashCents,
          cutoffPoints: eligible.cutoff,
          totalBrutoCents: caixaImediatoCalc.totalGrossCents,
          totalDividasCents: debtsOpenCents,
          totalLiquidoCents: caixaImediatoCalc.totalImmediateCents,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || "Erro ao salvar snapshot do caixa imediato");

      await load();
      alert("✅ Snapshot do Caixa Imediato salvo!");
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar snapshot do caixa imediato.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resumo</h1>
          <p className="text-sm text-slate-600">
            Patrimônio estimado: milhas (por milheiro) + caixa + a receber (vendas) + dívidas a receber − dívidas −
            pendências (comissões/funcionários/impostos).
          </p>
        </div>

        <button
          onClick={load}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* Top cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Milhas */}
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Milhas atuais</div>
            <span className="text-[11px] rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              somatório cedentes
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div>
              LATAM: <b>{fmtInt(points.latam)}</b>
            </div>
            <div>
              Smiles: <b>{fmtInt(points.smiles)}</b>
            </div>
            <div>
              Livelo: <b>{fmtInt(points.livelo)}</b>
            </div>
            <div>
              Esfera: <b>{fmtInt(points.esfera)}</b>
            </div>
          </div>

          <div className="text-xs text-slate-600">
            * cálculo usa milheiros inteiros (pontos/1000 arredondado para baixo).
          </div>
        </div>

        {/* Caixa */}
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Caixa (Inter)</div>
            <span className="text-[11px] rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              referência operacional
            </span>
          </div>

          <Input label="Saldo atual (R$)" value={cashInput} onChange={setCashInput} placeholder="Ex: 12345,67" />
          <Input
            label="Ponto de corte (pts) para caixa imediato"
            value={cutoffInput}
            onChange={setCutoffInput}
            placeholder="Ex: 5000"
          />

          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Caixa projetado</div>
            <div className="text-xl font-bold">{fmtMoneyBR(caixaImediatoCalc.cashProjectedInterCents)}</div>
            <div className="text-xs text-slate-500 mt-1">
              caixa + a receber (vendas) + dívidas a receber − (a pagar funcionários + impostos)
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Caixa total (sem corte)</div>
            <div className="text-xl font-bold">{fmtMoneyBR(calc.totalAfterPendingsCents)}</div>
            <div className="text-xs text-slate-500 mt-1">
              milhas totais + caixa + a receber − dívidas − pendências
            </div>
          </div>

          <div className="text-xs text-slate-600">
            Elegíveis no corte: LATAM {fmtInt(eligible.counts.latam)} • Smiles {fmtInt(eligible.counts.smiles)} •
            Livelo {fmtInt(eligible.counts.livelo)} • Esfera {fmtInt(eligible.counts.esfera)}
          </div>
        </div>
      </div>

      {/* Milheiro */}
      <div className="rounded-2xl border bg-white p-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">Valor do milheiro</div>
            <div className="text-xs text-slate-600">R$/1000</div>
          </div>

          <button
            onClick={async () => {
              try {
                await salvarRates();
                alert("✅ Milheiros salvos!");
              } catch (e: any) {
                alert(e.message);
              }
            }}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Salvar milheiros
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="LATAM" value={rateLatam} onChange={setRateLatam} />
          <Input label="Smiles" value={rateSmiles} onChange={setRateSmiles} />
          <Input label="Livelo" value={rateLivelo} onChange={setRateLivelo} />
          <Input label="Esfera" value={rateEsfera} onChange={setRateEsfera} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">LATAM</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milLatam)}</b> • Valor: <b>{fmtMoneyBR(calc.vLatamCents)}</b>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">Smiles</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milSmiles)}</b> • Valor: <b>{fmtMoneyBR(calc.vSmilesCents)}</b>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">Livelo</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milLivelo)}</b> • Valor: <b>{fmtMoneyBR(calc.vLiveloCents)}</b>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">Esfera</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milEsfera)}</b> • Valor: <b>{fmtMoneyBR(calc.vEsferaCents)}</b>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">Caixa imediato (integrado)</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Entradas e saídas consolidadas em lista para leitura rápida.
              </div>
            </div>
            <button
              onClick={salvarCaixaImediatoHoje}
              className="rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800"
            >
              Salvar snapshot do caixa imediato
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Entradas</div>
                <div className="text-xs text-slate-600">
                  Total: <b className="text-emerald-700">+{fmtMoneyBR(caixaImediatoCalc.totalGrossCents)}</b>
                </div>
              </div>
              <div className="mt-3 divide-y">
                <Line
                  label="Milhas elegíveis (valor estimado)"
                  value={`+${fmtMoneyBR(caixaImediatoCalc.milesValueEligibleCents)}`}
                  tone="plus"
                  hint={`milheiros inteiros • corte ${fmtInt(eligible.cutoff)}`}
                />
                <Line
                  label="Pontos pendentes (compras OPEN) — LATAM"
                  value={`+${fmtMoneyBR(caixaImediatoCalc.pendingLatamValueCents)}`}
                  tone="plus"
                  hint={`${fmtInt(pendingPurchaseLatamPoints)} pts • ${fmtInt(caixaImediatoCalc.pendingLatamMil)} milheiros • ${fmtInt(
                    pendingPurchaseLatamCount
                  )} compras`}
                />
                <Line
                  label="Pontos pendentes (compras OPEN) — Smiles"
                  value={`+${fmtMoneyBR(caixaImediatoCalc.pendingSmilesValueCents)}`}
                  tone="plus"
                  hint={`${fmtInt(pendingPurchaseSmilesPoints)} pts • ${fmtInt(caixaImediatoCalc.pendingSmilesMil)} milheiros • ${fmtInt(
                    pendingPurchaseSmilesCount
                  )} compras`}
                />
                <Line label="Caixa (Inter)" value={`+${fmtMoneyBR(caixaImediatoCalc.cashCents)}`} tone="plus" />
                <Line label="A receber (Vendas)" value={`+${fmtMoneyBR(caixaImediatoCalc.receivableSalesCents)}`} tone="plus" />
                <Line
                  label="Dívidas a receber"
                  value={`+${fmtMoneyBR(caixaImediatoCalc.receivableDARcents)}`}
                  tone="plus"
                  hint="OPEN + PARTIAL"
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Saídas</div>
                <div className="text-xs text-slate-600">
                  Total: <b className="text-rose-700">-{fmtMoneyBR(caixaImediatoCalc.outCents)}</b>
                </div>
              </div>
              <div className="mt-3 divide-y">
                <Line label="Dívidas em aberto" value={`-${fmtMoneyBR(debtsOpenCents)}`} tone="minus" hint="saldo OPEN" />
                <Line
                  label="Bloqueado (OPEN)"
                  value={`-${fmtMoneyBR(blockedTotals.valueBlockedCents)}`}
                  tone="minus"
                  hint={`${fmtInt(blockedTotals.openCount)} bloqueios`}
                />
                <Line
                  label="Comissões pendentes (cedentes)"
                  value={`-${fmtMoneyBR(pendingCedenteCommissionsCents)}`}
                  tone="minus"
                />
                <Line
                  label="A pagar (funcionários)"
                  value={`-${fmtMoneyBR(employeePayoutsPendingCents)}`}
                  tone="minus"
                />
                <Line label="Impostos pendentes" value={`-${fmtMoneyBR(taxesPendingCents)}`} tone="minus" />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border bg-black p-4 text-white">
              <div className="text-xs opacity-80">Caixa imediato (referência)</div>
              <div className="text-3xl font-bold">{fmtMoneyBR(caixaImediatoCalc.totalImmediateCents)}</div>
              <div className="text-xs opacity-70 mt-1">entradas − (dívidas + bloqueios + pendências)</div>
            </div>
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-xs text-slate-600">Caixa total (sem corte)</div>
              <div className="text-xl font-bold">{fmtMoneyBR(calc.totalAfterPendingsCents)}</div>
              <div className="text-xs text-slate-500 mt-1">milhas totais + caixa + a receber − dívidas − pendências</div>
            </div>
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold">Histórico do caixa (por dia)</div>
          <div className="text-xs text-slate-500">últimos {Math.min(60, snapshots.length)} dias</div>
        </div>

        {snapshots.length === 0 ? (
          <div className="text-sm text-slate-600">Nenhum snapshot salvo ainda.</div>
        ) : (
          <div className="max-h-80 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Dia</th>
                  <th className="px-3 py-2 text-right">Total líquido (snapshot)</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2">{dateBR(s.date)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoneyBR(s.totalLiquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-xs text-slate-600">
          Se quiser “automático no fim do dia”, dá pra colocar um Cron na Vercel chamando um endpoint.
        </div>
      </div>
    </div>
  );
}
