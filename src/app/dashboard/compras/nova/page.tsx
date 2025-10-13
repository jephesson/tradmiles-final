"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/** === Comissão (storage helpers) =============================== */
import {
  loadComissoes,   // lê todas as comissões do localStorage
  saveComissoes,   // salva lista de comissões
} from "@/lib/storage";

/** ================= Helpers ================= */
const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(v) ? v : 0
  );
const fmtInt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? Math.round(n) : 0
  );
const parseMoney = (s: string) => {
  if (!s) return 0;
  const only = s.replace(/[^\d]/g, "");
  return only ? Number(only) / 100 : 0;
};
const parseIntLoose = (s: string) => {
  if (!s) return 0;
  const only = s.replace(/[^\d]/g, "");
  return only ? Number(only) : 0;
};
function hojeISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const d2 = new Date(d.getTime() - off * 60 * 1000);
  return d2.toISOString().slice(0, 10);
}
const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const pad4 = (n: number) => String(Math.max(0, n | 0)).padStart(4, "0");

/** ================= Tipos ================= */
type ProgramaCIA = "latam" | "smiles";
type ProgramaOrigem = "livelo" | "esfera";
type ProgramaGeral = ProgramaCIA | ProgramaOrigem;
type StatusItem = "aguardando" | "liberado";
type StatusComissao = "pago" | "aguardando";

type ClubeItem = {
  id: number;
  programa: ProgramaGeral;
  pontos: number;
  valor: number; // R$
  status: StatusItem;
};
type CompraItem = {
  id: number;
  programa: ProgramaGeral;
  pontos: number;
  valor: number;
  bonusPct: number; // %
  status: StatusItem;
};
type TransfItem = {
  id: number;
  origem: ProgramaOrigem;
  destino: ProgramaCIA;
  modo: "pontos" | "pontos+dinheiro";
  pontosUsados: number;       // pontos que saem da origem
  pontosTotais: number;       // pontos que chegam ANTES do bônus
  valorPago: number;          // dinheiro desembolsado (se houver)
  bonusPct: number;           // %
  status: StatusItem;
};

type ItemLinha =
  | { kind: "clube"; data: ClubeItem }
  | { kind: "compra"; data: CompraItem }
  | { kind: "transferencia"; data: TransfItem };

// >>> Cedente com saldos atuais
type Cedente = {
  id: string;
  nome: string;
  latam?: number;
  smiles?: number;
  livelo?: number;
  esfera?: number;
};

/** ================= Inputs ================= */
function Money({
  value,
  onChange,
  placeholder,
}: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => { if (value !== display) setDisplay(value); }, [value, display]);
  const cents = display?.replace(/[^\d]/g, "") || "";
  const num = cents ? Number(cents) / 100 : 0;
  return (
    <input
      type="text"
      value={display ? fmtMoney(num) : ""}
      onChange={(e) => {
        const only = e.target.value.replace(/[^\d]/g, "");
        setDisplay(only);
        onChange(only);
      }}
      placeholder={placeholder || "R$ 0,00"}
      className="w-full rounded-xl border px-3 py-2 text-sm"
      inputMode="numeric"
      autoComplete="off"
    />
  );
}
function Int({
  value,
  onChange,
  placeholder,
}: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  const [focused, setFocused] = useState(false);
  const [display, setDisplay] = useState(value);
  useEffect(() => { if (!focused && value !== display) setDisplay(value); }, [value, focused, display]);
  return (
    <input
      type="text"
      value={focused ? display : display ? fmtInt(parseIntLoose(display)) : ""}
      onChange={(e) => {
        const only = e.target.value.replace(/[^\d]/g, "");
        setDisplay(only);
        onChange(only);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder || "1.000"}
      className="w-full rounded-xl border px-3 py-2 text-sm"
      inputMode="numeric"
      autoComplete="off"
    />
  );
}
function Pct({
  value,
  onChange,
  placeholder,
}: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => { if (value !== display) setDisplay(value); }, [value, display]);
  return (
    <input
      type="text"
      value={display}
      onChange={(e) => {
        const only = e.target.value.replace(/[^\d.,-]/g, "");
        setDisplay(only);
        onChange(only);
      }}
      placeholder={placeholder || "ex.: 30"}
      className="w-full rounded-xl border px-3 py-2 text-sm"
      inputMode="decimal"
      autoComplete="off"
    />
  );
}

/** ================= Página ================= */
export default function NovaCompraPage() {
  const router = useRouter();

  /** Cabeçalho */
  const [dataCompra, setDataCompra] = useState(hojeISO());
  const [compraId, setCompraId] = useState("0001");
  const [idTouched, setIdTouched] = useState(false);

  /** --------- Descobrir próximo ID automaticamente --------- */
  async function loadNextCompraId() {
    try {
      const res = await fetch(`/api/compras?ts=${Date.now()}`, { cache: "no-store" });
      let list: any[] = [];
      if (res.ok) {
        const json = await res.json();
        list = Array.isArray(json?.items) ? json.items : Array.isArray(json?.data) ? json.data : [];
      }
      const nums = list
        .map((r) => {
          const raw = r?.id ?? r?.compraId ?? r?.identificador ?? "";
          const d = onlyDigits(String(raw));
          return d ? Number(d) : 0;
        })
        .filter((n) => Number.isFinite(n)) as number[];
      let maxSrv = nums.length ? Math.max(...nums) : 0;
      try {
        const lastLocal = Number(localStorage.getItem("TM_COMPRAS_LAST_ID") || "0");
        if (Number.isFinite(lastLocal)) maxSrv = Math.max(maxSrv, lastLocal);
      } catch {}
      const next = pad4(maxSrv + 1);
      setCompraId((cur) => (idTouched ? cur : next));
    } catch {
      try {
        const lastLocal = Number(localStorage.getItem("TM_COMPRAS_LAST_ID") || "0");
        const next = pad4((Number.isFinite(lastLocal) ? lastLocal : 0) + 1);
        setCompraId((cur) => (idTouched ? cur : next));
      } catch {}
    }
  }
  useEffect(() => {
    if (!idTouched) void loadNextCompraId();
    const onVis = () => {
      if (document.visibilityState === "visible" && !idTouched) void loadNextCompraId();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idTouched]);

  /** Cedente (carregado do /api/cedentes) */
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [cedenteId, setCedenteId] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/cedentes", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          const arr: Cedente[] =
            json?.data?.listaCedentes?.map((c: any) => ({
              id: c.identificador,
              nome: c.nome_completo,
              latam: Number(c.latam || 0),
              smiles: Number(c.smiles || 0),
              livelo: Number(c.livelo || 0),
              esfera: Number(c.esfera || 0),
            })) ?? [];
          setCedentes(arr);
          if (!cedenteId && arr.length) setCedenteId(arr[0].id);
        }
      } catch { /* silencioso */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cedenteNome = useMemo(
    () => cedentes.find((c) => c.id === cedenteId)?.nome || "",
    [cedentes, cedenteId]
  );

  // saldos atuais do cedente selecionado
  const saldoAtual = useMemo(() => {
    const c = cedentes.find((x) => x.id === cedenteId);
    return {
      latam: Number(c?.latam || 0),
      smiles: Number(c?.smiles || 0),
      livelo: Number(c?.livelo || 0),
      esfera: Number(c?.esfera || 0),
    };
  }, [cedentes, cedenteId]);

  /** Itens */
  const [linhas, setLinhas] = useState<ItemLinha[]>([]);

  /** Forms abertos/fechados */
  const [openClube, setOpenClube] = useState(false);
  const [openCompra, setOpenCompra] = useState(false);
  const [openTransf, setOpenTransf] = useState(false);

  /** Forms — Clubes */
  const [clubePrograma, setClubePrograma] = useState<ProgramaGeral>("latam");
  const [clubePontos, setClubePontos] = useState("");
  const [clubeValor, setClubeValor] = useState("");
  const [clubeStatus, setClubeStatus] = useState<StatusItem>("aguardando");

  /** Forms — Compras */
  const [compPrograma, setCompPrograma] = useState<ProgramaGeral>("latam");
  const [compPontos, setCompPontos] = useState("");
  const [compValor, setCompValor] = useState("");
  const [compBonus, setCompBonus] = useState("");
  const [compStatus, setCompStatus] = useState<StatusItem>("aguardando");

  /** Forms — Transferências */
  const [trOrigem, setTrOrigem] = useState<ProgramaOrigem>("livelo");
  const [trDestino, setTrDestino] = useState<ProgramaCIA>("latam");
  const [trModo, setTrModo] = useState<"pontos" | "pontos+dinheiro">("pontos");
  const [trPontosUsados, setTrPontosUsados] = useState("");
  const [trPontosTotais, setTrPontosTotais] = useState("");
  const [trValorPago, setTrValorPago] = useState("");
  const [trBonus, setTrBonus] = useState("");
  const [trStatus, setTrStatus] = useState<StatusItem>("aguardando");

  /** Comissão + meta */
  const [comissaoCedente, setComissaoCedente] = useState(""); // money string
  const [comissaoStatus, setComissaoStatus] = useState<StatusComissao>("aguardando");
  const [metaMilheiro, setMetaMilheiro] = useState("150");    // "centavos" string (R$ 1,50)
  const [metaTouched, setMetaTouched] = useState(false);

  /** Add handlers */
  const addClube = () => {
    const it: ClubeItem = {
      id: Date.now(),
      programa: clubePrograma,
      pontos: parseIntLoose(clubePontos),
      valor: parseMoney(clubeValor),
      status: clubeStatus,
    };
    setLinhas((prev) => [...prev, { kind: "clube", data: it }]);
    setClubePontos(""); setClubeValor("");
    setClubeStatus("aguardando"); setOpenClube(false);
  };

  const addCompra = () => {
    const it: CompraItem = {
      id: Date.now(),
      programa: compPrograma,
      pontos: parseIntLoose(compPontos),
      valor: parseMoney(compValor),
      bonusPct: parseFloat((compBonus || "0").replace(",", ".")) || 0,
      status: compStatus,
    };
    setLinhas((prev) => [...prev, { kind: "compra", data: it }]);
    setCompPontos(""); setCompValor(""); setCompBonus("");
    setCompStatus("aguardando"); setOpenCompra(false);
  };

  const addTransf = () => {
    const pontosUsados = parseIntLoose(trPontosUsados);
    const pontosTotais = trModo === "pontos+dinheiro" ? parseIntLoose(trPontosTotais) : pontosUsados;
    const it: TransfItem = {
      id: Date.now(),
      origem: trOrigem,
      destino: trDestino,
      modo: trModo,
      pontosUsados,
      pontosTotais,
      valorPago: parseMoney(trValorPago),
      bonusPct: parseFloat((trBonus || "0").replace(",", ".")) || 0,
      status: trStatus,
    };
    setLinhas((prev) => [...prev, { kind: "transferencia", data: it }]);
    setTrPontosUsados(""); setTrPontosTotais(""); setTrValorPago(""); setTrBonus("");
    setTrStatus("aguardando"); setTrModo("pontos"); setOpenTransf(false);
  };

  const removeLinha = (id: number) => {
    setLinhas((prev) =>
      prev.filter((l) => {
        const any = l.kind === "clube" ? l.data : l.kind === "compra" ? l.data : l.data;
        return any.id !== id;
      })
    );
  };

  const toggleStatus = (id: number) => {
    setLinhas((prev) =>
      prev.map((l) => {
        const any = l.kind === "clube" ? l.data : l.kind === "compra" ? l.data : l.data;
        if (any.id !== id) return l;
        const next: StatusItem = any.status === "liberado" ? "aguardando" : "liberado";
        if (l.kind === "clube") return { kind: "clube", data: { ...l.data, status: next } };
        if (l.kind === "compra") return { kind: "compra", data: { ...l.data, status: next } };
        return { kind: "transferencia", data: { ...l.data, status: next } };
      })
    );
  };

  /** ======= Cálculos ======= */
  const contribCIA = (l: ItemLinha) => {
    if (l.kind === "clube") {
      const { programa, pontos } = l.data;
      return programa === "latam" || programa === "smiles" ? pontos : 0;
    }
    if (l.kind === "compra") {
      const { programa, pontos, bonusPct } = l.data;
      return (programa === "latam" || programa === "smiles")
        ? pontos * (1 + (bonusPct || 0) / 100)
        : 0;
    }
    const { modo, pontosUsados, pontosTotais, bonusPct } = l.data;
    const basePts = modo === "pontos+dinheiro" ? pontosTotais : pontosUsados;
    return basePts * (1 + (bonusPct || 0) / 100);
  };

  const valorItem = (l: ItemLinha) => {
    if (l.kind === "clube") return l.data.valor;
    if (l.kind === "compra") return l.data.valor;
    return l.data.valorPago || 0; // transferência: custo é o dinheiro pago
  };

  // delta previsto por programa (para o painel de saldos)
  const deltaPrevisto = useMemo(() => {
    const d = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
    for (const l of linhas) {
      if (l.kind === "clube") {
        d[l.data.programa] += l.data.pontos;
      } else if (l.kind === "compra") {
        if (l.data.programa === "latam" || l.data.programa === "smiles") {
          d[l.data.programa] += Math.round(l.data.pontos * (1 + (l.data.bonusPct || 0) / 100));
        } else {
          d[l.data.programa] += l.data.pontos;
        }
      } else {
        const { origem, destino, modo, pontosUsados, pontosTotais, bonusPct } = l.data;
        const base = modo === "pontos+dinheiro" ? pontosTotais : pontosUsados;
        const chegam = Math.round(base * (1 + (bonusPct || 0) / 100));
        d[destino] += chegam;         // crédito na CIA
        d[origem] -= pontosUsados;    // débito no banco (regra solicitada)
      }
    }
    return d;
  }, [linhas]);

  const saldoPrevisto = useMemo(
    () => ({
      latam: saldoAtual.latam + deltaPrevisto.latam,
      smiles: saldoAtual.smiles + deltaPrevisto.smiles,
      livelo: saldoAtual.livelo + deltaPrevisto.livelo,
      esfera: saldoAtual.esfera + deltaPrevisto.esfera,
    }),
    [saldoAtual, deltaPrevisto]
  );

  const totals = useMemo(() => {
    const base = linhas.reduce(
      (acc, l) => {
        const v = valorItem(l);
        const pts = contribCIA(l);
        const isLiberado =
          (l.kind === "clube" && l.data.status === "liberado") ||
          (l.kind === "compra" && l.data.status === "liberado") ||
          (l.kind === "transferencia" && l.data.status === "liberado");
        if (isLiberado) {
          acc.ptsLiberados += pts;
          acc.custoLiberado += v;
        } else {
          acc.ptsAguardando += pts;
          acc.custoAguardando += v;
        }
        acc.custoBase += v;
        return acc;
      },
      { ptsLiberados: 0, ptsAguardando: 0, custoLiberado: 0, custoAguardando: 0, custoBase: 0 }
    );

    const taxaVendedoresTotal = base.custoBase * 0.01;
    const comissaoTotal = parseMoney(comissaoCedente);
    const custoTotalGeral = base.custoBase + taxaVendedoresTotal + comissaoTotal;

    const milheirosTotais = (base.ptsLiberados + base.ptsAguardando) / 1000;
    const custoMilheiroTotal = milheirosTotais > 0 ? custoTotalGeral / milheirosTotais : 0;

    const proporcaoLiberado = base.custoBase > 0 ? base.custoLiberado / base.custoBase : 0;
    const taxaVendedoresLiberado = taxaVendedoresTotal * proporcaoLiberado;
    const comissaoLiberado = comissaoTotal * proporcaoLiberado;
    const custoTotalLiberado = base.custoLiberado + taxaVendedoresLiberado + comissaoLiberado;

    const milheirosLiberados = base.ptsLiberados / 1000;
    const custoMilheiroLiberado = milheirosLiberados > 0 ? custoTotalLiberado / milheirosLiberados : 0;

    const meta = parseMoney(metaMilheiro);
    const lucroTotal = milheirosLiberados > 0 ? (meta - custoMilheiroLiberado) * milheirosLiberados : 0;

    return {
      ...base,
      taxaVendedores: taxaVendedoresTotal,
      comissao: comissaoTotal,
      custoTotal: custoTotalGeral,
      custoTotalLiberado,
      custoMilheiro: custoMilheiroLiberado,
      custoMilheiroTotal,
      totalCIA: base.ptsLiberados + base.ptsAguardando,
      lucroTotal,
    };
  }, [linhas, comissaoCedente, metaMilheiro]);

  /** Meta automática: custo/milheiro TOTAL + R$ 1,50 (a menos que usuário edite) */
  useEffect(() => {
    if (metaTouched) return;
    const val = Math.max(0, (totals.custoMilheiroTotal || 0) + 1.5);
    setMetaMilheiro(String(Math.round(val * 100)));
  }, [totals.custoMilheiroTotal, metaTouched]);

  /** ======= Salvar ======= */
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving">("idle");

  const payloadFromState = useCallback(() => {
    return {
      id: compraId,
      dataCompra,
      cedenteId,
      cedenteNome,
      itens: linhas,
      totais: {
        pontosCIA: totals.totalCIA,
        pontosLiberados: totals.ptsLiberados,
        pontosAguardando: totals.ptsAguardando,
        custoBase: totals.custoBase,
        taxaVendedores: totals.taxaVendedores,
        comissao: totals.comissao,
        custoTotal: totals.custoTotal,
        custoTotalLiberado: totals.custoTotalLiberado,
        custoMilheiro: totals.custoMilheiro,
        custoMilheiroTotal: totals.custoMilheiroTotal,
        lucroTotal: totals.lucroTotal,
      },
      metaMilheiro: parseMoney(metaMilheiro),
      comissaoCedente: parseMoney(comissaoCedente),
      comissaoStatus, // novo: salva status junto, se sua API aceitar
    };
  }, [
    compraId,
    dataCompra,
    linhas,
    totals,
    metaMilheiro,
    comissaoCedente,
    cedenteId,
    cedenteNome,
    comissaoStatus,
  ]);

  const salvar = async (goToList = false) => {
    if (!linhas.length) {
      setMsg({ kind: "err", text: "Adicione ao menos um item antes de salvar." });
      return;
    }
    setMsg(null);
    setSaving("saving");
    try {
      const res = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromState()),
      });
      if (!res.ok) throw new Error(await res.text());

      /** ---------- UPSERT da comissão no storage (evita duplicar) ---------- */
      try {
        const valor = parseMoney(comissaoCedente);
        if (valor > 0 && cedenteId) {
          const lista = loadComissoes();
          const idx = lista.findIndex(
            (c: any) => c.compraId === compraId && c.cedenteId === cedenteId
          );
          const now = new Date().toISOString();
          if (idx >= 0) {
            // atualiza
            lista[idx] = {
              ...lista[idx],
              valor,
              status: comissaoStatus,
              cedenteNome,
              atualizadoEm: now,
            };
          } else {
            // cria
            lista.unshift({
              id: crypto.randomUUID(),
              compraId,
              cedenteId,
              cedenteNome,
              valor,
              status: comissaoStatus as StatusComissao,
              criadoEm: now,
              atualizadoEm: now,
            });
          }
          saveComissoes(lista);
        }
      } catch { /* silencioso */ }

      try {
        const cur = Number(onlyDigits(compraId) || "0");
        if (Number.isFinite(cur)) localStorage.setItem("TM_COMPRAS_LAST_ID", String(cur));
      } catch {}
      const nextId = pad4((Number(onlyDigits(compraId)) || 0) + 1);
      if (!goToList) setCompraId(nextId);
      setMsg({ kind: "ok", text: "Salvo com sucesso." });
      if (goToList) router.push("/dashboard/compras");
    } catch (e: any) {
      const txt = String(e?.message || "Erro ao salvar.");
      setMsg({ kind: "err", text: txt.startsWith("<!DOCTYPE") ? "Erro ao salvar." : txt });
    } finally {
      setSaving("idle");
    }
  };

  /** ================= Render ================= */
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-bold">Compra de pontos — ID {compraId}</h1>

      {msg && (
        <div
          className={
            "mb-4 rounded-lg border px-3 py-2 text-sm " +
            (msg.kind === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700")
          }
        >
          {msg.text}
        </div>
      )}

      {/* Cabeçalho */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-slate-600">Data</label>
          <input
            type="date"
            value={dataCompra}
            onChange={(e) => setDataCompra(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">ID</label>
          <input
            value={compraId}
            onChange={(e) => {
              setIdTouched(true);
              setCompraId(e.target.value.replace(/[^\d]/g, "").padStart(4, "0"));
            }}
            className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">Cedente</label>
          <select
            value={cedenteId}
            onChange={(e) => setCedenteId(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="">Selecione…</option>
            {cedentes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            className="w-full rounded-lg border bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            onClick={() => salvar(false)}
            disabled={saving === "saving"}
          >
            {saving === "saving" ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            className="w-full rounded-lg border px-4 py-2 text-sm hover:bg-slate-100"
            onClick={() => salvar(true)}
            disabled={saving === "saving"}
            title="Salvar e voltar para a lista"
          >
            Salvar e voltar
          </button>
        </div>
      </div>

      {/* Painel de Saldos do Cedente */}
      {cedenteId && (
        <div className="mb-6 rounded-xl border p-3">
          <div className="mb-2 text-sm font-semibold">Saldos do cedente</div>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
            {(["latam", "smiles", "livelo", "esfera"] as const).map((k) => (
              <div key={k} className="rounded-lg border px-3 py-2">
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">{k}</div>
                <div className="text-[13px]">
                  <div>Atual: <b>{fmtInt(saldoAtual[k])}</b></div>
                  <div>
                    Variação desta compra:{" "}
                    <b className={deltaPrevisto[k] >= 0 ? "text-green-700" : "text-red-700"}>
                      {deltaPrevisto[k] >= 0 ? "+" : ""}
                      {fmtInt(deltaPrevisto[k])}
                    </b>
                  </div>
                  <div>Previsto: <b>{fmtInt(saldoPrevisto[k])}</b></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === Clubes === */}
      <section className="mb-4 rounded-xl border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Clubes</div>
          <button className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-100" onClick={() => setOpenClube((v) => !v)}>
            {openClube ? "Fechar" : "+ Adicionar"}
          </button>
        </div>

        {openClube && (
          <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs text-slate-600">Programa</label>
              <select value={clubePrograma} onChange={(e) => setClubePrograma(e.target.value as ProgramaGeral)} className="w-full rounded-xl border px-3 py-2 text-sm">
                <option value="livelo">Livelo</option>
                <option value="esfera">Esfera</option>
                <option value="latam">Latam Pass</option>
                <option value="smiles">Smiles</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Quantidade de pontos</label>
              <Int value={clubePontos} onChange={setClubePontos} placeholder="ex.: 3.000" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Valor</label>
              <Money value={clubeValor} onChange={setClubeValor} placeholder="R$ 0,00" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Status inicial</label>
              <select value={clubeStatus} onChange={(e) => setClubeStatus(e.target.value as StatusItem)} className="w-full rounded-xl border px-3 py-2 text-sm">
                <option value="aguardando">Aguardando liberação</option>
                <option value="liberado">Liberado</option>
              </select>
            </div>
            <div className="flex items-end">
              <button className="w-full rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90" onClick={addClube}>Adicionar</button>
            </div>
            <div className="md:col-span-5 text-[11px] text-slate-600">
              * Apenas <b>Latam/Smiles</b> contam para o total de pontos da CIA. Livelo/Esfera não somam.
            </div>
          </div>
        )}
      </section>

      {/* === Compra de pontos === */}
      <section className="mb-4 rounded-xl border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Compra de pontos</div>
          <button className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-100" onClick={() => setOpenCompra((v) => !v)}>
            {openCompra ? "Fechar" : "+ Adicionar"}
          </button>
        </div>

        {openCompra && (
          <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs text-slate-600">Programa</label>
              <select value={compPrograma} onChange={(e) => setCompPrograma(e.target.value as ProgramaGeral)} className="w-full rounded-xl border px-3 py-2 text-sm">
                <option value="livelo">Livelo</option>
                <option value="esfera">Esfera</option>
                <option value="latam">Latam Pass</option>
                <option value="smiles">Smiles</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Quantidade</label>
              <Int value={compPontos} onChange={setCompPontos} placeholder="ex.: 90.000" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">% bônus</label>
              <Pct value={compBonus} onChange={setCompBonus} placeholder="ex.: 80" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Valor</label>
              <Money value={compValor} onChange={setCompValor} placeholder="R$ 0,00" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Status inicial</label>
              <select value={compStatus} onChange={(e) => setCompStatus(e.target.value as StatusItem)} className="w-full rounded-xl border px-3 py-2 text-sm">
                <option value="aguardando">Aguardando liberação</option>
                <option value="liberado">Liberado</option>
              </select>
            </div>
            <div className="flex items-end">
              <button className="w-full rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90" onClick={addCompra}>Adicionar</button>
            </div>
            <div className="md:col-span-6 text-[11px] text-slate-600">
              * Só contam para a CIA as <b>compras em Latam/Smiles</b> (aplicando o bônus).
            </div>
          </div>
        )}
      </section>

      {/* === Transferência === */}
      <section className="mb-6 rounded-xl border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Transferência de pontos</div>
          <button className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-100" onClick={() => setOpenTransf((v) => !v)}>
            {openTransf ? "Fechar" : "+ Adicionar"}
          </button>
        </div>

        {openTransf && (
          <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-8">
            <div>
              <label className="mb-1 block text-xs text-slate-600">Origem</label>
              <select value={trOrigem} onChange={(e) => setTrOrigem(e.target.value as ProgramaOrigem)} className="w-full rounded-xl border px-3 py-2 text-sm">
                <option value="livelo">Livelo</option>
                <option value="esfera">Esfera</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-600">Destino</label>
              <select value={trDestino} onChange={(e) => setTrDestino(e.target.value as ProgramaCIA)} className="w-full rounded-xl border px-3 py-2 text-sm">
                <option value="latam">Latam Pass</option>
                <option value="smiles">Smiles</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-600">Modo</label>
              <select value={trModo} onChange={(e) => setTrModo(e.target.value as any)} className="w-full rounded-xl border px-3 py-2 text-sm">
                <option value="pontos">Pontos</option>
                <option value="pontos+dinheiro">Pontos + dinheiro</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-slate-600">Pontos usados</label>
              <Int value={trPontosUsados} onChange={setTrPontosUsados} placeholder="ex.: 90.000" />
            </div>

            {trModo === "pontos+dinheiro" && (
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-600">Pts transferidos</label>
                <Int value={trPontosTotais} onChange={setTrPontosTotais} placeholder="ex.: 130.000" />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-slate-600">Valor pago</label>
              <Money value={trValorPago} onChange={setTrValorPago} placeholder="R$ 0,00" />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-600">% bônus</label>
              <Pct value={trBonus} onChange={setTrBonus} placeholder="ex.: 70" />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-600">Status inicial</label>
              <select value={trStatus} onChange={(e) => setTrStatus(e.target.value as StatusItem)} className="w-full rounded-xl border px-3 py-2 text-sm">
                <option value="aguardando">Aguardando</option>
                <option value="liberado">Liberado</option>
              </select>
            </div>

            <div className="md:col-span-8 flex items-end">
              <button className="w-full rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90" onClick={addTransf}>
                Adicionar
              </button>
            </div>

            <div className="md:col-span-8 text-[11px] text-slate-600">
              * Chegam na CIA: <b>
                {trModo === "pontos+dinheiro" ? "pts transferidos × (1 + bônus%)" : "pontos usados × (1 + bônus%)"}
              </b>.
            </div>
          </div>
        )}
      </section>

      {/* ===== Carrinho (itens adicionados) ===== */}
      <section className="mb-6 rounded-xl border">
        <div className="border-b px-3 py-2 text-sm font-semibold">Itens adicionados</div>
        <Carrinho
          linhas={linhas}
          onToggleStatus={toggleStatus}
          onRemove={removeLinha}
        />
      </section>

      {/* ===== Comissão + Meta ===== */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-slate-600">Comissão ao cedente</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Money value={comissaoCedente} onChange={setComissaoCedente} placeholder="R$ 0,00" />
            <select
              value={comissaoStatus}
              onChange={(e) => setComissaoStatus(e.target.value as StatusComissao)}
              className="rounded-xl border px-3 py-2 text-sm"
              title="Status do pagamento da comissão"
            >
              <option value="aguardando">Aguardando pagamento</option>
              <option value="pago">Pago</option>
            </select>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Entra no custo total (além de 1% de taxa vendedores).
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">Meta de venda (R$/milheiro)</label>
          <Money
            value={metaMilheiro}
            onChange={(v) => { setMetaTouched(true); setMetaMilheiro(v); }}
            placeholder="R$ 0,00"
          />
        </div>
      </div>

      {/* ===== Resumo ===== */}
      <div className="rounded-xl border p-4">
        <div className="mb-2 text-lg font-semibold">Resumo</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-sm">
          <div>
            {cedenteNome && <div>Cedente: <b>{cedenteNome}</b></div>}
            <div>Total de pontos (CIA): <b>{fmtInt(totals.totalCIA)}</b></div>
            <div>Pontos liberados: <b>{fmtInt(totals.ptsLiberados)}</b></div>
            <div>Pontos aguardando: <b>{fmtInt(totals.ptsAguardando)}</b></div>
          </div>
          <div>
            <div>Custo base dos itens: <b>{fmtMoney(totals.custoBase)}</b></div>
            <div>Taxa vendedores (1%): <b>{fmtMoney(totals.taxaVendedores)}</b></div>
            <div>Comissão ao cedente: <b>{fmtMoney(totals.comissao)}</b></div>
          </div>
        </div>
        <div className="mt-2 text-sm">
          <div><b>Custo total</b>: {fmtMoney(totals.custoTotal)}</div>
          <div><b>Custo por milheiro (total)</b>: {fmtMoney(totals.custoMilheiroTotal || 0)}</div>
          <div><b>Lucro estimado (sobre liberado)</b>: {fmtMoney(totals.lucroTotal)}</div>
        </div>
      </div>
    </main>
  );
}

/** ===== Carrinho ===== */
function Carrinho({
  linhas,
  onToggleStatus,
  onRemove,
}: {
  linhas: ItemLinha[];
  onToggleStatus: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  if (linhas.length === 0) {
    return <div className="p-3 text-sm text-slate-600">Nenhum item adicionado.</div>;
  }
  return (
    <ul className="divide-y">
      {linhas.map((l) => {
        const any = l.kind === "clube" ? l.data : l.kind === "compra" ? l.data : l.data;
        const resumo = renderResumoUnico(l);
        return (
          <li key={any.id} className="flex flex-col gap-2 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <span className={"rounded-full px-2 py-[2px] text-[11px] " + badgeColor(l.kind)}>
                {labelKind(l.kind)}
              </span>
              <span className="text-slate-700">{resumo}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className={"rounded border px-2 py-1 text-xs " +
                  (any.status === "liberado" ? "bg-green-50 border-green-200 text-green-700" : "bg-yellow-50 border-yellow-200 text-yellow-700")}
                onClick={() => onToggleStatus(any.id)}
                title="Alternar status (Aguardando / Liberado)"
              >
                {any.status === "liberado" ? "Liberado" : "Aguardando"}
              </button>
              <button
                className="rounded border px-2 py-1 text-xs hover:bg-slate-100"
                onClick={() => onRemove(any.id)}
              >
                Remover
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function renderResumoUnico(l: ItemLinha): string {
  if (l.kind === "clube") {
    const it = l.data;
    const conta = it.programa === "latam" || it.programa === "smiles";
    return `${labelPrograma(it.programa)} • ${fmtInt(it.pontos)} pts ${conta ? "(conta)" : "(não conta)"} • ${fmtMoney(it.valor)}`;
  }
  if (l.kind === "compra") {
    const it = l.data;
    const conta = it.programa === "latam" || it.programa === "smiles";
    const ptsFinais = conta ? Math.round(it.pontos * (1 + (it.bonusPct || 0) / 100)) : it.pontos;
    return `${labelPrograma(it.programa)} • ${fmtInt(ptsFinais)} pts ${conta ? "(conta)" : "(não conta)"} • bônus ${it.bonusPct || 0}% • ${fmtMoney(it.valor)}`;
  }
  const it = l.data;
  const base = it.modo === "pontos+dinheiro" ? it.pontosTotais : it.pontosUsados;
  const chegam = Math.round(base * (1 + (it.bonusPct || 0) / 100));
  const detalhe =
    it.modo === "pontos+dinheiro"
      ? `usados ${fmtInt(it.pontosUsados)} • totais ${fmtInt(it.pontosTotais)}`
      : `usados ${fmtInt(it.pontosUsados)}`;
  const valor = fmtMoney(it.valorPago || 0);
  return `${labelPrograma(it.origem)} → ${labelPrograma(it.destino)} • ${it.modo} • ${detalhe} • chegam ${fmtInt(chegam)} pts • ${valor}`;
}

/** ===== Auxiliares ===== */
function labelPrograma(p: ProgramaGeral): string {
  switch (p) {
    case "latam": return "Latam Pass";
    case "smiles": return "Smiles";
    case "livelo": return "Livelo";
    case "esfera": return "Esfera";
  }
}
function labelKind(k: ItemLinha["kind"]): string {
  return k === "clube" ? "Clube" : k === "compra" ? "Compra" : "Transferência";
}
function badgeColor(k: ItemLinha["kind"]): string {
  if (k === "clube") return "bg-indigo-50 text-indigo-700 border border-indigo-200";
  if (k === "compra") return "bg-sky-50 text-sky-700 border border-sky-200";
  return "bg-amber-50 text-amber-700 border border-amber-200";
}
function labelStatus(s: StatusItem): string {
  return s === "liberado" ? "Liberado" : "Aguardando liberação";
}
