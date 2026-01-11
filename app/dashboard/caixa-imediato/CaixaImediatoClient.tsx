"use client";

import { useEffect, useMemo, useState } from "react";

type Points = { latam: number; smiles: number; livelo: number; esfera: number };

type Snapshot = {
  id: string;
  date: string; // ISO
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

type RatesCents = {
  latamRateCents: number; // ex: 2750 => R$ 27,50
  smilesRateCents: number;
  liveloRateCents: number;
  esferaRateCents: number;
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
function safeInt(v: unknown, fb = 0) {
  const n = Number(String(v ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}
function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="space-y-1">
      <div className="text-xs text-slate-600">{label}</div>
      <input
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </label>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger" | "dark";
}) {
  const base = "rounded-2xl border p-4";
  const cls =
    tone === "dark"
      ? `${base} bg-black text-white`
      : `${base} bg-slate-50`;

  return (
    <div className={cls}>
      <div className={tone === "dark" ? "text-xs opacity-80" : "text-xs text-slate-600"}>
        {label}
      </div>
      <div className={tone === "dark" ? "text-2xl font-bold" : "text-xl font-bold"}>
        {value}
      </div>
      {hint ? (
        <div className={tone === "dark" ? "text-xs opacity-70 mt-1" : "text-xs text-slate-500 mt-1"}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

const LS_CUTOFF_KEY = "tm.caixaImediato.cutoff";
const LS_CASH_KEY = "tm.caixaImediato.cashInput";

export default function CaixaImediatoClient() {
  const [loading, setLoading] = useState(false);

  // ✅ corte (persistido)
  const [cutoffInput, setCutoffInput] = useState<string>("5000");

  // dados
  const [cedentes, setCedentes] = useState<CedenteOpt[]>([]);
  const [blockedRows, setBlockedRows] = useState<BlockRow[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // caixa (persistido + pode vir do backend do caixa-imediato)
  const [cashInput, setCashInput] = useState<string>("");

  // rates (somente leitura, vem do resumo)
  const [ratesCents, setRatesCents] = useState<RatesCents | null>(null);

  // pendências / financeiro (vem do resumo)
  const [debtsOpenCents, setDebtsOpenCents] = useState<number>(0);
  const [pendingCedenteCommissionsCents, setPendingCedenteCommissionsCents] = useState<number>(0);
  const [receivablesOpenCents, setReceivablesOpenCents] = useState<number>(0);
  const [employeePayoutsPendingCents, setEmployeePayoutsPendingCents] = useState<number>(0);
  const [taxesPendingCents, setTaxesPendingCents] = useState<number>(0);

  const [didHydrate, setDidHydrate] = useState(false);

  // ✅ hydrate do localStorage
  useEffect(() => {
    try {
      const c = localStorage.getItem(LS_CUTOFF_KEY);
      if (c && /^\d+$/.test(c)) setCutoffInput(c);

      const cash = localStorage.getItem(LS_CASH_KEY);
      if (cash) setCashInput(cash);
    } catch {}
    setDidHydrate(true);
  }, []);

  // ✅ persistência local do cutoff e cash
  useEffect(() => {
    if (!didHydrate) return;
    try {
      localStorage.setItem(LS_CUTOFF_KEY, String(safeInt(cutoffInput, 5000)));
    } catch {}
  }, [cutoffInput, didHydrate]);

  useEffect(() => {
    if (!didHydrate) return;
    try {
      localStorage.setItem(LS_CASH_KEY, cashInput);
    } catch {}
  }, [cashInput, didHydrate]);

  async function loadAll() {
    setLoading(true);
    try {
      const [rResumo, rCedentes, rBloq, rCx] = await Promise.all([
        fetch("/api/resumo", { cache: "no-store" }),
        fetch("/api/cedentes/options", { cache: "no-store" }),
        fetch("/api/bloqueios", { cache: "no-store" }),
        fetch("/api/caixa-imediato", { cache: "no-store" }),
      ]);

      const jResumo = await rResumo.json();
      const jCed = await rCedentes.json();
      const jBloq = await rBloq.json();
      const jCx = await rCx.json();

      if (!jResumo?.ok) throw new Error(jResumo?.error || "Erro ao carregar resumo");
      if (!jCed?.ok) throw new Error(jCed?.error || "Erro ao carregar cedentes");
      if (!jBloq?.ok) throw new Error(jBloq?.error || "Erro ao carregar bloqueios");
      if (!jCx?.ok) throw new Error(jCx?.error || "Erro ao carregar caixa imediato");

      // cedentes p/ somar pontos com corte
      setCedentes(jCed.data || []);

      // bloqueios
      setBlockedRows(jBloq.data?.rows || []);

      // ✅ snapshots do CAIXA-IMEDIATO (separado)
      setSnapshots(jCx.data?.snapshots || []);

      // ✅ cash do CAIXA-IMEDIATO (se houver), senão mantém o digitado/localStorage
      if (typeof jCx.data?.latestCashCents === "number") {
        const latestCashCents = Number(jCx.data.latestCashCents ?? 0);
        setCashInput(String((latestCashCents / 100).toFixed(2)).replace(".", ","));
      }

      // ✅ rates (somente leitura) do resumo
      const rates = jResumo.data?.ratesCents;
      if (rates) setRatesCents(rates);

      // financeiros (do resumo)
      setDebtsOpenCents(Number(jResumo.data.debtsOpenCents || 0));
      setPendingCedenteCommissionsCents(Number(jResumo.data.pendingCedenteCommissionsCents || 0));
      setReceivablesOpenCents(Number(jResumo.data.receivablesOpenCents || 0));
      setEmployeePayoutsPendingCents(Number(jResumo.data.employeePayoutsPendingCents || 0));
      setTaxesPendingCents(Number(jResumo.data.taxesPendingCents || 0));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // ✅ Totais bloqueados (OPEN)
  const blockedTotals = useMemo(() => {
    const open = blockedRows.filter((r) => r.status === "OPEN");
    const openCount = open.length;
    const pointsBlocked = open.reduce((a, r) => a + (r.pointsBlocked || 0), 0);
    const valueBlockedCents = open.reduce((a, r) => a + (r.valueBlockedCents || 0), 0);

    const byProgram: Points = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
    for (const r of open) {
      if (r.program === "LATAM") byProgram.latam += r.pointsBlocked || 0;
      if (r.program === "SMILES") byProgram.smiles += r.pointsBlocked || 0;
      if (r.program === "LIVELO") byProgram.livelo += r.pointsBlocked || 0;
      if (r.program === "ESFERA") byProgram.esfera += r.pointsBlocked || 0;
    }

    return { openCount, pointsBlocked, valueBlockedCents, byProgram };
  }, [blockedRows]);

  // ✅ Pontos elegíveis (>= corte) por programa (somando cedentes)
  const eligible = useMemo(() => {
    const cutoff = Math.max(0, safeInt(cutoffInput, 0));

    let pts: Points = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
    let counts = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };

    for (const c of cedentes) {
      const pLatam = Number(c.pontosLatam || 0);
      const pSmiles = Number(c.pontosSmiles || 0);
      const pLivelo = Number(c.pontosLivelo || 0);
      const pEsfera = Number(c.pontosEsfera || 0);

      if (pLatam >= cutoff) { pts.latam += pLatam; counts.latam += 1; }
      if (pSmiles >= cutoff) { pts.smiles += pSmiles; counts.smiles += 1; }
      if (pLivelo >= cutoff) { pts.livelo += pLivelo; counts.livelo += 1; }
      if (pEsfera >= cutoff) { pts.esfera += pEsfera; counts.esfera += 1; }
    }

    return { cutoff, pts, counts };
  }, [cedentes, cutoffInput]);

  const calc = useMemo(() => {
    // milheiros inteiros
    const milLatam = Math.floor((eligible.pts.latam || 0) / 1000);
    const milSmiles = Math.floor((eligible.pts.smiles || 0) / 1000);
    const milLivelo = Math.floor((eligible.pts.livelo || 0) / 1000);
    const milEsfera = Math.floor((eligible.pts.esfera || 0) / 1000);

    // ✅ rates (do resumo). Se ainda não carregou, trata como 0.
    const rLatam = (ratesCents?.latamRateCents ?? 0) / 100;
    const rSmiles = (ratesCents?.smilesRateCents ?? 0) / 100;
    const rLivelo = (ratesCents?.liveloRateCents ?? 0) / 100;
    const rEsfera = (ratesCents?.esferaRateCents ?? 0) / 100;

    // valor das milhas elegíveis
    const vLatamCents = Math.round(milLatam * rLatam * 100);
    const vSmilesCents = Math.round(milSmiles * rSmiles * 100);
    const vLiveloCents = Math.round(milLivelo * rLivelo * 100);
    const vEsferaCents = Math.round(milEsfera * rEsfera * 100);

    const milesValueEligibleCents = vLatamCents + vSmilesCents + vLiveloCents + vEsferaCents;

    const cashCents = toCentsFromInput(cashInput);
    const receivableCents = Number(receivablesOpenCents || 0);

    // ✅ BRUTO (para caixa imediato): milhas elegíveis + caixa + a receber
    const totalGrossCents = milesValueEligibleCents + cashCents + receivableCents;

    // ✅ subtrai dívidas abertas
    const afterDebtsCents = totalGrossCents - (debtsOpenCents || 0);

    // ✅ subtrai o BLOQUEADO (OPEN)
    const afterBlockedCents = afterDebtsCents - (blockedTotals.valueBlockedCents || 0);

    // ✅ subtrai pendências operacionais
    const totalImmediateCents =
      afterBlockedCents -
      (pendingCedenteCommissionsCents || 0) -
      (employeePayoutsPendingCents || 0) -
      (taxesPendingCents || 0);

    // ✅ caixa projetado (só caixa + a receber - a pagar func - impostos - bloqueado)
    const cashProjectedCents =
      cashCents +
      receivableCents -
      (employeePayoutsPendingCents || 0) -
      (taxesPendingCents || 0) -
      (blockedTotals.valueBlockedCents || 0);

    return {
      milLatam, milSmiles, milLivelo, milEsfera,
      vLatamCents, vSmilesCents, vLiveloCents, vEsferaCents,
      milesValueEligibleCents,
      cashCents, receivableCents,
      totalGrossCents, afterDebtsCents, afterBlockedCents, totalImmediateCents,
      cashProjectedCents,
    };
  }, [
    eligible,
    cashInput,
    receivablesOpenCents,
    debtsOpenCents,
    blockedTotals.valueBlockedCents,
    pendingCedenteCommissionsCents,
    employeePayoutsPendingCents,
    taxesPendingCents,
    ratesCents,
  ]);

  async function salvarCaixaHoje() {
    try {
      const res = await fetch("/api/caixa-imediato/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashCents: calc.cashCents,
          totalBrutoCents: calc.totalGrossCents,
          totalDividasCents: debtsOpenCents,
          totalLiquidoCents: calc.afterDebtsCents, // histórico “clássico” (bruto − dívidas)
        }),
      });

      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao salvar snapshot");
      await loadAll();
      alert("✅ Snapshot do Caixa Imediato salvo!");
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Caixa imediato</h1>
          <p className="text-sm text-slate-600">
            Só conta <b>milhas elegíveis</b> (cedentes com pontos ≥ corte) + caixa + a receber, e
            desconta dívidas, bloqueios e pendências.
          </p>
        </div>

        <button
          onClick={loadAll}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* corte */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <Input
            label="Ponto de corte (pts)"
            value={cutoffInput}
            onChange={setCutoffInput}
            placeholder="Ex: 5000"
            inputMode="numeric"
          />

          <div className="rounded-xl border bg-slate-50 p-3 md:col-span-2">
            <div className="text-xs text-slate-600">
              Elegíveis (cedentes com saldo ≥ {fmtInt(eligible.cutoff)})
            </div>
            <div className="mt-1 grid gap-2 sm:grid-cols-4 text-sm">
              <div>LATAM: <b>{fmtInt(eligible.counts.latam)}</b></div>
              <div>Smiles: <b>{fmtInt(eligible.counts.smiles)}</b></div>
              <div>Livelo: <b>{fmtInt(eligible.counts.livelo)}</b></div>
              <div>Esfera: <b>{fmtInt(eligible.counts.esfera)}</b></div>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Cedentes abaixo do corte são ignorados no cálculo de milhas.
            </div>
          </div>
        </div>
      </div>

      {/* Top cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Milhas elegíveis */}
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Milhas elegíveis</div>
            <span className="text-[11px] rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              ≥ {fmtInt(eligible.cutoff)} pts
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div>LATAM: <b>{fmtInt(eligible.pts.latam)}</b></div>
            <div>Smiles: <b>{fmtInt(eligible.pts.smiles)}</b></div>
            <div>Livelo: <b>{fmtInt(eligible.pts.livelo)}</b></div>
            <div>Esfera: <b>{fmtInt(eligible.pts.esfera)}</b></div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Valor estimado (milheiros inteiros)</div>
            <div className="text-xl font-bold">{fmtMoneyBR(calc.milesValueEligibleCents)}</div>
          </div>

          <div className="text-xs text-slate-600">
            * usa milheiros inteiros: <b>floor(pontos/1000)</b>. <br/>
            * valor do milheiro vem do <b>Resumo</b> (somente leitura).
          </div>
        </div>

        {/* Caixa */}
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Caixa (Inter)</div>
            <span className="text-[11px] rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              snapshot diário (desta página)
            </span>
          </div>

          <Input
            label="Saldo atual (R$)"
            value={cashInput}
            onChange={setCashInput}
            placeholder="Ex: 12345,67"
          />

          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Caixa projetado</div>
            <div className="text-xl font-bold">{fmtMoneyBR(calc.cashProjectedCents)}</div>
            <div className="text-xs text-slate-500 mt-1">
              caixa + a receber − (func + impostos) − bloqueios
            </div>
          </div>

          <button
            onClick={salvarCaixaHoje}
            className="w-full rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800"
          >
            Salvar caixa de hoje
          </button>

          <div className="text-xs text-slate-600">
            Grava/atualiza o snapshot do dia no histórico <b>desta página</b>.
          </div>
        </div>

        {/* Bloqueios */}
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Bloqueado (OPEN)</div>
            <span className="text-[11px] rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              desconta no imediato
            </span>
          </div>

          <div className="grid gap-2">
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-xs text-slate-600">Bloqueios em aberto</div>
              <div className="text-xl font-bold">{fmtInt(blockedTotals.openCount)}</div>
              <div className="text-xs text-slate-500 mt-1">Qtd de registros OPEN</div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-xs text-slate-600">Pontos bloqueados (soma)</div>
              <div className="text-xl font-bold">{fmtInt(blockedTotals.pointsBlocked)}</div>
              <div className="text-xs text-slate-500 mt-1">
                LATAM {fmtInt(blockedTotals.byProgram.latam)} • SMILES {fmtInt(blockedTotals.byProgram.smiles)} • LIVELO{" "}
                {fmtInt(blockedTotals.byProgram.livelo)} • ESFERA {fmtInt(blockedTotals.byProgram.esfera)}
              </div>
            </div>

            <div className="rounded-xl border bg-black p-3 text-white">
              <div className="text-xs opacity-80">Valor total bloqueado (R$)</div>
              <div className="text-2xl font-bold">{fmtMoneyBR(blockedTotals.valueBlockedCents)}</div>
              <div className="text-xs opacity-70 mt-1">Esse valor é subtraído do “imediato”.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Totais */}
      <div className="rounded-2xl border bg-white p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="TOTAL BRUTO (milhas elegíveis + caixa + a receber)" value={fmtMoneyBR(calc.totalGrossCents)} />
          <StatCard label="A RECEBER (aberto)" value={`+${fmtMoneyBR(calc.receivableCents)}`} hint="saldo total OPEN" />
          <StatCard label="DÍVIDAS EM ABERTO" value={`-${fmtMoneyBR(debtsOpenCents)}`} hint="saldo total OPEN" tone="danger" />
          <StatCard label="APÓS DÍVIDAS" value={fmtMoneyBR(calc.afterDebtsCents)} hint="bruto − dívidas" />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="BLOQUEADO (OPEN)" value={`-${fmtMoneyBR(blockedTotals.valueBlockedCents)}`} hint="subtrai do imediato" tone="danger" />
          <StatCard label="COMISSÕES PENDENTES (cedentes)" value={`-${fmtMoneyBR(pendingCedenteCommissionsCents)}`} hint="status PENDING" tone="danger" />
          <StatCard label="A PAGAR (funcionários)" value={`-${fmtMoneyBR(employeePayoutsPendingCents)}`} hint="paidAt = null" tone="danger" />
          <StatCard label="IMPOSTOS PENDENTES" value={`-${fmtMoneyBR(taxesPendingCents)}`} hint="meses não pagos" tone="danger" />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard
            label="CAIXA IMEDIATO (referência)"
            value={fmtMoneyBR(calc.totalImmediateCents)}
            hint="(bruto − dívidas − bloqueios − pendências)"
            tone="dark"
          />
          <div className="md:col-span-3 rounded-2xl border bg-slate-50 p-4">
            <div className="text-xs text-slate-600">Observação</div>
            <div className="text-sm text-slate-700 mt-1">
              Esse número é o “quanto dá pra contar agora”, porque remove:
              <b> bloqueios OPEN</b> e ignora <b>saldos pequenos</b> (abaixo do corte).
            </div>
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold">Histórico (snapshot diário)</div>
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
                  <th className="px-3 py-2 text-right">Total líquido (após dívidas)</th>
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
          Aqui o snapshot salva <b>bruto − dívidas</b> (com bruto = milhas elegíveis + caixa + a receber).
        </div>
      </div>
    </div>
  );
}
