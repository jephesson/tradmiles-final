// app/dashboard/compras/nova/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** ====== ENGINE CENTRAL (server-only) ====== */
import {
  computeTotais,
  computeDeltaPorPrograma,
  type ProgramaCIA,
  type ProgramaOrigem,
  type ProgramaGeral,
  type StatusItem,
  type ItemLinha,
  type ClubeItem,
  type CompraItem,
  type TransfItem,
} from "@/lib/calculo/engine";

export const dynamic = "force-dynamic";

/** ================= Helpers (server) ================= */
const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(v) ? v : 0
  );
const fmtInt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? Math.round(n) : 0
  );
const parseMoneyLoose = (s: FormDataEntryValue | null) => {
  const raw = (s ?? "").toString();
  if (!raw) return 0;
  const only = raw.replace(/[^\d]/g, "");
  return only ? Number(only) / 100 : 0;
};
const parseIntLoose = (s: FormDataEntryValue | null) => {
  const raw = (s ?? "").toString();
  if (!raw) return 0;
  const only = raw.replace(/[^\d]/g, "");
  return only ? Number(only) : 0;
};
const parsePctLoose = (s: FormDataEntryValue | null) => {
  const raw = (s ?? "").toString().replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};
function hojeISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const d2 = new Date(d.getTime() - off * 60 * 1000);
  return d2.toISOString().slice(0, 10);
}

/** ===== Tipos auxiliares (server) ===== */
type StatusComissao = "pago" | "aguardando";
type Cedente = { id: string; nome: string; latam?: number; smiles?: number; livelo?: number; esfera?: number };
type CedenteRaw = {
  identificador: string;
  nome_completo?: string;
  nome?: string;
  latam?: number | string;
  smiles?: number | string;
  livelo?: number | string;
  esfera?: number | string;
};

type Draft = {
  compraId: string;
  dataCompra: string;
  cedenteId: string;
  linhas: ItemLinha[];
  comissaoCedente: number; // R$
  comissaoStatus: StatusComissao;
  metaMilheiro: number; // R$/milheiro
};

const DRAFT_COOKIE = "nova_compra_draft";

/** ===== Persistência de rascunho via cookie (Next 15: cookies() é assíncrono) ===== */
async function readDraft(): Promise<Draft | null> {
  const jar = await cookies();
  const c = jar.get(DRAFT_COOKIE)?.value;
  if (!c) return null;
  try {
    const d = JSON.parse(c) as Draft;
    if (!d || typeof d !== "object") return null;
    return {
      compraId: String(d.compraId || "0001"),
      dataCompra: String(d.dataCompra || hojeISO()),
      cedenteId: String(d.cedenteId || ""),
      linhas: Array.isArray(d.linhas) ? (d.linhas as ItemLinha[]) : [],
      comissaoCedente: Number.isFinite(d.comissaoCedente) ? d.comissaoCedente : 0,
      comissaoStatus: (d.comissaoStatus as StatusComissao) || "aguardando",
      metaMilheiro: Number.isFinite(d.metaMilheiro) ? d.metaMilheiro : 1.5,
    };
  } catch {
    return null;
  }
}
async function writeDraft(d: Draft) {
  const jar = await cookies();
  jar.set(DRAFT_COOKIE, JSON.stringify(d), { httpOnly: true, sameSite: "lax", path: "/" });
}
async function clearDraft() {
  const jar = await cookies();
  jar.set(DRAFT_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** ===== Carregamentos ===== */
async function loadCedentes(): Promise<Cedente[]> {
  try {
    const res = await fetch("/api/cedentes", { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { listaCedentes?: CedenteRaw[] } };
    const lista = (json?.data?.listaCedentes ?? []) as CedenteRaw[];
    return (Array.isArray(lista) ? lista : []).map((r) => ({
      id: String(r.identificador),
      nome: String(r.nome_completo ?? r.nome ?? ""),
      latam: Number(r.latam ?? 0),
      smiles: Number(r.smiles ?? 0),
      livelo: Number(r.livelo ?? 0),
      esfera: Number(r.esfera ?? 0),
    }));
  } catch {
    return [];
  }
}
async function loadNextCompraId(): Promise<string> {
  try {
    const res = await fetch("/api/compras/next-id", { cache: "no-store" });
    if (!res.ok) return "0001";
    const json = (await res.json()) as { nextId?: number | string };
    return String(json?.nextId ?? "0001").padStart(4, "0");
  } catch {
    return "0001";
  }
}

/**
 * ===== Base do draft =====
 * persistOnInit=false: NÃO grava cookie durante o render (evita set-cookie em Server Component).
 * Em Server Actions, passe true para persistir.
 */
async function ensureDraftBase(persistOnInit = false) {
  let d = await readDraft();
  const cedentes = await loadCedentes();
  if (!d) {
    const nextId = await loadNextCompraId();
    const defaultCedenteId = cedentes[0]?.id ?? "";
    d = {
      compraId: nextId,
      dataCompra: hojeISO(),
      cedenteId: defaultCedenteId,
      linhas: [],
      comissaoCedente: 0,
      comissaoStatus: "aguardando",
      metaMilheiro: 1.5,
    };
    if (persistOnInit) await writeDraft(d);
  } else if (!d.cedenteId && cedentes.length) {
    d.cedenteId = cedentes[0].id;
    if (persistOnInit) await writeDraft(d);
  }
  return d;
}

/** ===== Persistência do draft em /api/* (sem redirect) ===== */
async function persistDraft(d: Draft) {
  const deltaPrevisto = computeDeltaPorPrograma(d.linhas);
  const totals = computeTotais(d.linhas, d.comissaoCedente, d.metaMilheiro, 1);

  const cedentes = await loadCedentes();
  const cedenteNome = cedentes.find((c) => c.id === d.cedenteId)?.nome ?? "";

  const payload = {
    id: d.compraId,
    dataCompra: d.dataCompra,
    cedenteId: d.cedenteId,
    cedenteNome,
    itens: d.linhas,
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
    metaMilheiro: d.metaMilheiro,
    comissaoCedente: d.comissaoCedente,
    comissaoStatus: d.comissaoStatus,
    saldosDelta: {
      latam: deltaPrevisto.latam,
      smiles: deltaPrevisto.smiles,
      livelo: deltaPrevisto.livelo,
      esfera: deltaPrevisto.esfera,
    },
  };

  const res = await fetch("/api/compras", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Erro ao salvar a compra");

  if (d.comissaoCedente > 0 && d.cedenteId) {
    await fetch("/api/comissoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compraId: d.compraId,
        cedenteId: d.cedenteId,
        cedenteNome,
        valor: d.comissaoCedente,
        status: d.comissaoStatus,
      }),
      cache: "no-store",
    });
  }
}

/** ===== Server Actions (no exports aqui!) ===== */

/** Cabeçalho */
async function actUpdateHeader(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  d.dataCompra = String(formData.get("dataCompra") || d.dataCompra);
  d.compraId = String(formData.get("compraId") || d.compraId).replace(/[^\d]/g, "").padStart(4, "0");
  d.cedenteId = String(formData.get("cedenteId") || d.cedenteId);
  await writeDraft(d);
  redirect("/dashboard/compras/nova");
}

/** Comissão + Meta */
async function actUpdateComissaoMeta(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  d.comissaoCedente = parseMoneyLoose(formData.get("comissaoCedente"));
  d.comissaoStatus = (String(formData.get("comissaoStatus")) as StatusComissao) || "aguardando";
  d.metaMilheiro = parseMoneyLoose(formData.get("metaMilheiro"));
  await writeDraft(d);
  redirect("/dashboard/compras/nova");
}

/** Add Clube */
async function actAddClube(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  const it: ClubeItem = {
    id: Date.now(),
    programa: String(formData.get("clubePrograma")) as ProgramaGeral,
    pontos: parseIntLoose(formData.get("clubePontos")),
    valor: parseMoneyLoose(formData.get("clubeValor")),
    status: (String(formData.get("clubeStatus")) as StatusItem) || "aguardando",
  };
  d.linhas.push({ kind: "clube", data: it });
  await writeDraft(d);
  redirect("/dashboard/compras/nova");
}

/** Add Compra */
async function actAddCompra(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  const it: CompraItem = {
    id: Date.now(),
    programa: String(formData.get("compPrograma")) as ProgramaGeral,
    pontos: parseIntLoose(formData.get("compPontos")),
    valor: parseMoneyLoose(formData.get("compValor")),
    bonusPct: parsePctLoose(formData.get("compBonus")),
    status: (String(formData.get("compStatus")) as StatusItem) || "aguardando",
  };
  d.linhas.push({ kind: "compra", data: it });
  await writeDraft(d);
  redirect("/dashboard/compras/nova");
}

/** Add Transferência (entra como AGUARDANDO nesta tela) */
async function actAddTransf(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  const modo = String(formData.get("trModo")) as "pontos" | "pontos+dinheiro";
  const pontosUsados = parseIntLoose(formData.get("trPontosUsados"));
  const pontosTotais = modo === "pontos+dinheiro" ? parseIntLoose(formData.get("trPontosTotais")) : pontosUsados;
  const it: TransfItem = {
    id: Date.now(),
    origem: String(formData.get("trOrigem")) as ProgramaOrigem,
    destino: String(formData.get("trDestino")) as ProgramaCIA,
    modo,
    pontosUsados,
    pontosTotais,
    valorPago: parseMoneyLoose(formData.get("trValorPago")),
    bonusPct: parsePctLoose(formData.get("trBonus")),
    status: "aguardando",
  };
  d.linhas.push({ kind: "transferencia", data: it });
  await writeDraft(d);
  redirect("/dashboard/compras/nova");
}

/** Toggle status (apenas clube/compra) */
async function actToggleStatus(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  const id = Number(formData.get("itemId"));
  d.linhas = d.linhas.map((l) => {
    if (l.data.id !== id) return l;
    if (l.kind === "transferencia") return l; // não alterna aqui
    const next: StatusItem = l.data.status === "liberado" ? "aguardando" : "liberado";
    return l.kind === "clube"
      ? { kind: "clube", data: { ...(l.data as ClubeItem), status: next } }
      : { kind: "compra", data: { ...(l.data as CompraItem), status: next } };
  });
  await writeDraft(d);
  redirect("/dashboard/compras/nova");
}

/** Remover item */
async function actRemoveItem(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  const id = Number(formData.get("itemId"));
  d.linhas = d.linhas.filter((l) => l.data.id !== id);
  await writeDraft(d);
  redirect("/dashboard/compras/nova");
}

/** Salvar (permanece na página nova) */
async function actSave() {
  "use server";
  const d = (await ensureDraftBase(true))!;
  await persistDraft(d);
  await clearDraft();
  redirect("/dashboard/compras/nova");
}

/** Salvar e voltar para a lista */
async function actSaveAndBack() {
  "use server";
  const d = (await ensureDraftBase(true))!;
  await persistDraft(d);
  await clearDraft();
  redirect("/dashboard/compras");
}

/** ======= Página (Server Component) ======= */
export default async function NovaCompraPage() {
  const d = (await ensureDraftBase(false))!;
  const cedentes = await loadCedentes();
  const cedente = cedentes.find((c) => c.id === d.cedenteId);

  // Painel de saldos: saldo atual + delta (engine só conta LIBERADOS)
  const deltaPrevisto = computeDeltaPorPrograma(d.linhas);
  const saldoAtual = {
    latam: Number(cedente?.latam || 0),
    smiles: Number(cedente?.smiles || 0),
    livelo: Number(cedente?.livelo || 0),
    esfera: Number(cedente?.esfera || 0),
  };
  const saldoPrevisto = {
    latam: saldoAtual.latam + (deltaPrevisto.latam || 0),
    smiles: saldoAtual.smiles + (deltaPrevisto.smiles || 0),
    livelo: saldoAtual.livelo + (deltaPrevisto.livelo || 0),
    esfera: saldoAtual.esfera + (deltaPrevisto.esfera || 0),
  };

  // Totais com engine
  const totals = computeTotais(d.linhas, d.comissaoCedente, d.metaMilheiro, 1);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-bold">Compra de pontos — ID {d.compraId}</h1>

      {/* Cabeçalho */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <form action={actUpdateHeader}>
          <label className="mb-1 block text-xs text-slate-600">Data</label>
          <input
            type="date"
            name="dataCompra"
            defaultValue={d.dataCompra}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
          <input type="hidden" name="compraId" value={d.compraId} />
          <input type="hidden" name="cedenteId" value={d.cedenteId} />
          <div className="mt-2">
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-100">Atualizar data</button>
          </div>
        </form>

        <form action={actUpdateHeader}>
          <label className="mb-1 block text-xs text-slate-600">ID</label>
          <input
            name="compraId"
            defaultValue={d.compraId}
            className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
          />
          <input type="hidden" name="dataCompra" value={d.dataCompra} />
          <input type="hidden" name="cedenteId" value={d.cedenteId} />
          <div className="mt-2">
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-100">Atualizar ID</button>
          </div>
        </form>

        <form action={actUpdateHeader}>
          <label className="mb-1 block text-xs text-slate-600">Cedente</label>
          <select
            name="cedenteId"
            defaultValue={d.cedenteId}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="">Selecione…</option>
            {cedentes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <input type="hidden" name="dataCompra" value={d.dataCompra} />
          <input type="hidden" name="compraId" value={d.compraId} />
          <div className="mt-2">
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-100">Atualizar cedente</button>
          </div>
        </form>

        <div className="flex items-end gap-2">
          <form action={actSave}>
            <button
              type="submit"
              className="w-full rounded-lg border bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Salvar
            </button>
          </form>
          <form action={actSaveAndBack}>
            <button
              type="submit"
              className="w-full rounded-lg border px-4 py-2 text-sm hover:bg-slate-100"
              title="Salvar e voltar para a lista"
            >
              Salvar e voltar
            </button>
          </form>
        </div>
      </div>

      {/* Painel de Saldos do Cedente */}
      {d.cedenteId && (
        <div className="mb-6 rounded-xl border p-3">
          <div className="mb-2 text-sm font-semibold">Saldos do cedente</div>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
            {(["latam", "smiles", "livelo", "esfera"] as const).map((k) => (
              <div key={k} className="rounded-lg border px-3 py-2">
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">{k}</div>
                <div className="text-[13px]">
                  <div>
                    Atual: <b>{fmtInt(saldoAtual[k])}</b>
                  </div>
                  <div>
                    Variação desta compra:{" "}
                    <b className={(deltaPrevisto[k] ?? 0) >= 0 ? "text-green-700" : "text-red-700"}>
                      {(deltaPrevisto[k] ?? 0) >= 0 ? "+" : ""}
                      {fmtInt(deltaPrevisto[k] ?? 0)}
                    </b>
                  </div>
                  <div>
                    Previsto: <b>{fmtInt(saldoPrevisto[k])}</b>
                  </div>
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
        </div>
        <form action={actAddClube} className="grid grid-cols-1 gap-3 p-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-slate-600">Programa</label>
            <select name="clubePrograma" defaultValue="latam" className="w-full rounded-xl border px-3 py-2 text-sm">
              <option value="livelo">Livelo</option>
              <option value="esfera">Esfera</option>
              <option value="latam">Latam Pass</option>
              <option value="smiles">Smiles</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Quantidade de pontos</label>
            <input name="clubePontos" placeholder="ex.: 3.000" className="w-full rounded-xl border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Valor</label>
            <input name="clubeValor" placeholder="R$ 0,00" className="w-full rounded-xl border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Status inicial</label>
            <select name="clubeStatus" defaultValue="aguardando" className="w-full rounded-xl border px-3 py-2 text-sm">
              <option value="aguardando">Aguardando liberação</option>
              <option value="liberado">Liberado</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="w-full rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90">Adicionar</button>
          </div>
          <div className="md:col-span-5 text-[11px] text-slate-600">
            * Apenas <b>Latam/Smiles</b> contam para o total de pontos da CIA. Livelo/Esfera não somam.
          </div>
        </form>
      </section>

      {/* === Compra de pontos === */}
      <section className="mb-4 rounded-xl border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Compra de pontos</div>
        </div>
        <form action={actAddCompra} className="grid grid-cols-1 gap-3 p-3 md:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs text-slate-600">Programa</label>
            <select name="compPrograma" defaultValue="latam" className="w-full rounded-xl border px-3 py-2 text-sm">
              <option value="livelo">Livelo</option>
              <option value="esfera">Esfera</option>
              <option value="latam">Latam Pass</option>
              <option value="smiles">Smiles</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Quantidade</label>
            <input name="compPontos" placeholder="ex.: 90.000" className="w-full rounded-xl border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">% bônus</label>
            <input name="compBonus" placeholder="ex.: 80" className="w-full rounded-xl border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Valor</label>
            <input name="compValor" placeholder="R$ 0,00" className="w-full rounded-xl border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Status inicial</label>
            <select name="compStatus" defaultValue="aguardando" className="w-full rounded-xl border px-3 py-2 text-sm">
              <option value="aguardando">Aguardando liberação</option>
              <option value="liberado">Liberado</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="w-full rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90">Adicionar</button>
          </div>
          <div className="md:col-span-6 text-[11px] text-slate-600">
            * Só contam para a CIA as <b>compras em Latam/Smiles</b> (aplicando o bônus).
          </div>
        </form>
      </section>

      {/* === Transferência === */}
      <section className="mb-6 rounded-xl border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Transferência de pontos</div>
        </div>
        <form action={actAddTransf} className="grid grid-cols-1 gap-3 p-3 md:grid-cols-8">
          <div>
            <label className="mb-1 block text-xs text-slate-600">Origem</label>
            <select name="trOrigem" defaultValue="livelo" className="w-full rounded-xl border px-3 py-2 text-sm">
              <option value="livelo">Livelo</option>
              <option value="esfera">Esfera</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-600">Destino</label>
            <select name="trDestino" defaultValue="latam" className="w-full rounded-xl border px-3 py-2 text-sm">
              <option value="latam">Latam Pass</option>
              <option value="smiles">Smiles</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-600">Modo</label>
            <select name="trModo" defaultValue="pontos" className="w-full rounded-xl border px-3 py-2 text-sm">
              <option value="pontos">Pontos</option>
              <option value="pontos+dinheiro">Pontos + dinheiro</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-600">Pontos usados</label>
            <input name="trPontosUsados" placeholder="ex.: 90.000" className="w-full rounded-xl border px-3 py-2 text-sm" />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-600">Pts transferidos (se pontos+dinheiro)</label>
            <input name="trPontosTotais" placeholder="ex.: 130.000" className="w-full rounded-xl border px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-600">Valor pago</label>
            <input name="trValorPago" placeholder="R$ 0,00" className="w-full rounded-xl border px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-600">% bônus</label>
            <input name="trBonus" placeholder="ex.: 70" className="w-full rounded-xl border px-3 py-2 text-sm" />
          </div>

          <div className="md:col-span-8 text-[11px] text-slate-600">
            * Chegam na CIA: <b>pontos usados (ou pts transferidos) × (1 + bônus%)</b>. Nesta tela, transferências entram como <b>aguardando</b>.
          </div>

          <div className="md:col-span-8 flex items-end">
            <button className="w-full rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90">Adicionar</button>
          </div>
        </form>
      </section>

      {/* ===== Carrinho (itens adicionados) ===== */}
      <section className="mb-6 rounded-xl border">
        <div className="border-b px-3 py-2 text-sm font-semibold">Itens adicionados</div>
        {d.linhas.length === 0 ? (
          <div className="p-3 text-sm text-slate-600">Nenhum item adicionado.</div>
        ) : (
          <ul className="divide-y">
            {d.linhas.map((l) => {
              const itemId = l.data.id;
              const itemStatus = l.data.status;
              const resumo = renderResumoUnico(l);
              return (
                <li
                  key={itemId}
                  className="flex flex-col gap-2 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className={"rounded-full px-2 py-[2px] text-[11px] " + badgeColor(l.kind)}>
                      {labelKind(l.kind)}
                    </span>
                    <span className="text-slate-700">{resumo}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.kind !== "transferencia" ? (
                      <form action={actToggleStatus}>
                        <input type="hidden" name="itemId" value={String(itemId)} />
                        <button
                          className={
                            "rounded border px-2 py-1 text-xs " +
                            (itemStatus === "liberado"
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "bg-yellow-50 border-yellow-200 text-yellow-700")
                          }
                          title="Alternar status (Aguardando / Liberado)"
                        >
                          {itemStatus === "liberado" ? "Liberado" : "Aguardando"}
                        </button>
                      </form>
                    ) : (
                      <span className="rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
                        Aguardando
                      </span>
                    )}
                    <form action={actRemoveItem}>
                      <input type="hidden" name="itemId" value={String(itemId)} />
                      <button className="rounded border px-2 py-1 text-xs hover:bg-slate-100">Remover</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ===== Comissão + Meta ===== */}
      <form action={actUpdateComissaoMeta} className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-slate-600">Comissão ao cedente</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              name="comissaoCedente"
              defaultValue={String(Math.round((d.comissaoCedente || 0) * 100))}
              placeholder="R$ 0,00"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
            <select
              name="comissaoStatus"
              defaultValue={d.comissaoStatus}
              className="rounded-xl border px-3 py-2 text-sm"
              title="Status do pagamento da comissão"
            >
              <option value="aguardando">Aguardando pagamento</option>
              <option value="pago">Pago</option>
            </select>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            * Campo de valor aceita dígitos (centavos). Ex.: <b>150</b> = R$ 1,50. Entra no custo total (além de 1%).
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">Meta de venda (R$/milheiro)</label>
          <input
            name="metaMilheiro"
            defaultValue={String(Math.round((d.metaMilheiro || 0) * 100))}
            placeholder="R$ 0,00"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
          <div className="mt-1 text-[11px] text-slate-500">
            * Campo aceita dígitos (centavos). Ex.: <b>150</b> = R$ 1,50.
          </div>
        </div>
        <div className="md:col-span-2">
          <button className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-100">Atualizar comissão/meta</button>
        </div>
      </form>

      {/* ===== Resumo ===== */}
      <div className="rounded-xl border p-4">
        <div className="mb-2 text-lg font-semibold">Resumo</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-sm">
          <div>
            {cedente?.nome && (
              <div>
                Cedente: <b>{cedente.nome}</b>
              </div>
            )}
            <div>
              Total de pontos (CIA): <b>{fmtInt(totals.totalCIA)}</b>
            </div>
            <div>
              Pontos liberados: <b>{fmtInt(totals.ptsLiberados)}</b>
            </div>
            <div>
              Pontos aguardando: <b>{fmtInt(totals.ptsAguardando)}</b>
            </div>
          </div>
          <div>
            <div>
              Custo base dos itens: <b>{fmtMoney(totals.custoBase)}</b>
            </div>
            <div>
              Taxa vendedores (1%): <b>{fmtMoney(totals.taxaVendedores)}</b>
            </div>
            <div>
              Comissão ao cedente: <b>{fmtMoney(totals.comissao)}</b>
            </div>
          </div>
        </div>
        <div className="mt-2 text-sm">
          <div>
            <b>Custo total</b>: {fmtMoney(totals.custoTotal)}
          </div>
          <div>
            <b>Custo por milheiro (total)</b>: {fmtMoney(totals.custoMilheiroTotal || 0)}
          </div>
          <div>
            <b>Lucro estimado (sobre liberado)</b>: {fmtMoney(totals.lucroTotal)}
          </div>
        </div>
      </div>
    </main>
  );
}

/** ===== Render helpers (server) ===== */
function labelPrograma(p: ProgramaGeral): string {
  switch (p) {
    case "latam":
      return "Latam Pass";
    case "smiles":
      return "Smiles";
    case "livelo":
      return "Livelo";
    case "esfera":
      return "Esfera";
    default:
      return String(p);
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
function renderResumoUnico(l: ItemLinha): string {
  if (l.kind === "clube") {
    const it = l.data as ClubeItem;
    const conta = it.programa === "latam" || it.programa === "smiles";
    return `${labelPrograma(it.programa)} • ${fmtInt(it.pontos)} pts ${conta ? "(conta)" : "(não conta)"} • ${fmtMoney(
      it.valor
    )}`;
  }
  if (l.kind === "compra") {
    const it = l.data as CompraItem;
    const conta = it.programa === "latam" || it.programa === "smiles";
    const ptsFinais = conta ? Math.round(it.pontos * (1 + (it.bonusPct || 0) / 100)) : it.pontos;
    return `${labelPrograma(it.programa)} • ${fmtInt(ptsFinais)} pts ${conta ? "(conta)" : "(não conta)"} • bônus ${
      it.bonusPct || 0
    }% • ${fmtMoney(it.valor)}`;
  }
  const it = l.data as TransfItem;
  const base = it.modo === "pontos+dinheiro" ? it.pontosTotais : it.pontosUsados;
  const chegam = Math.round(base * (1 + (it.bonusPct || 0) / 100));
  const detalhe =
    it.modo === "pontos+dinheiro"
      ? `usados ${fmtInt(it.pontosUsados)} • totais ${fmtInt(it.pontosTotais)}`
      : `usados ${fmtInt(it.pontosUsados)}`;
  const valor = fmtMoney(it.valorPago || 0);
  return `${labelPrograma(it.origem as ProgramaGeral)} → ${labelPrograma(it.destino as ProgramaGeral)} • ${
    it.modo
  } • ${detalhe} • chegam ${fmtInt(chegam)} pts • ${valor}`;
}
