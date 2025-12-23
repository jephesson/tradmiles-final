"use client";

import { useEffect, useMemo, useState } from "react";

type Programa = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type TipoItem = "CLUB" | "POINTS_BUY" | "TRANSFER" | "ADJUSTMENT" | "EXTRA_COST";
type TransferMode = "FULL_POINTS" | "POINTS_PLUS_CASH";

type Compra = {
  id: string; // cuid do prisma
  numero: string; // "ID00001"
  status: "OPEN" | "CLOSED" | "CANCELED";
  createdAt: string;
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    pontosLatam: number;
    pontosSmiles: number;
    pontosLivelo: number;
    pontosEsfera: number;
    blockedAccounts?: { program: Programa; status: string }[];
  };
  items: Item[];
};

type Item = {
  id: string;
  type: TipoItem;
  status: "PENDING" | "RELEASED" | "CANCELED";
  title: string;
  details?: string | null;

  programFrom?: Programa | null;
  programTo?: Programa | null;

  pointsBase: number;
  bonusMode?: string | null; // PERCENT | TOTAL
  bonusValue?: number | null;
  pointsFinal: number;

  amountCents: number;
  transferMode?: TransferMode | null;
  pointsDebitedFromOrigin: number;

  createdAt: string;
};

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function fmtMoney(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function compraIdFmt(numero: string) {
  return numero || "-";
}

function toCents(input: string) {
  // aceita "12,34" ou "12.34"
  const s = (input || "").trim().replace(/\./g, "").replace(",", ".");
  const v = Number(s);
  if (!isFinite(v)) return 0;
  return Math.trunc(v * 100);
}

export default function Compra({ id }: { id: string }) {
  const [compra, setCompra] = useState<Compra | null>(null);
  const [loading, setLoading] = useState(true);

  // modo de operação
  const [modo, setModo] = useState<"CIA" | "BANCO_CIA">("CIA");
  const [cia, setCia] = useState<"LATAM" | "SMILES">("LATAM"); // destino quando CIA

  const [banco, setBanco] = useState<"LIVELO" | "ESFERA">("LIVELO"); // origem quando BANCO_CIA
  const [cia2, setCia2] = useState<"LATAM" | "SMILES">("LATAM"); // destino quando BANCO_CIA

  // formulário de item (genérico)
  const [tipo, setTipo] = useState<TipoItem>("POINTS_BUY");
  const [titulo, setTitulo] = useState("");
  const [detalhes, setDetalhes] = useState("");

  const [pontosConfirmados, setPontosConfirmados] = useState(""); // pointsBase
  const [bonusPct, setBonusPct] = useState(""); // PERCENT
  const [bonusTotal, setBonusTotal] = useState(""); // TOTAL
  const [modoBonus, setModoBonus] = useState<"NENHUM" | "PERCENT" | "TOTAL">("NENHUM");

  const [valor, setValor] = useState(""); // amount
  const [transferMode, setTransferMode] = useState<TransferMode>("FULL_POINTS");
  const [pontosDebitoOrigem, setPontosDebitoOrigem] = useState(""); // pointsDebitedFromOrigin

  async function carregar() {
    setLoading(true);
    try {
      // ✅ id aqui é o NUMERO (ID00001)
      const res = await fetch(`/api/compras/numero/${id}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar compra.");
      setCompra(json.compra);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar compra.");
      setCompra(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ✅ Se o modo for CIA, não pode deixar TRANSFER selecionado
  useEffect(() => {
    if (modo === "CIA" && tipo === "TRANSFER") setTipo("POINTS_BUY");
  }, [modo, tipo]);

  // pontos “prévia” por programa
  const pontos = useMemo(() => {
    const c = compra?.cedente;
    if (!c) return { LATAM: 0, SMILES: 0, LIVELO: 0, ESFERA: 0 };
    return {
      LATAM: c.pontosLatam,
      SMILES: c.pontosSmiles,
      LIVELO: c.pontosLivelo,
      ESFERA: c.pontosEsfera,
    };
  }, [compra]);

  // “programas ativos” (1 ou 2) conforme modo
  const programasAtivos = useMemo(() => {
    if (modo === "CIA") return { programFrom: null as Programa | null, programTo: cia as Programa };
    return { programFrom: banco as Programa, programTo: cia2 as Programa };
  }, [modo, cia, banco, cia2]);

  const pontosPrevistos = useMemo(() => {
    // sugere os pontos baseado nos pontos do programa selecionado
    if (modo === "CIA") return pontos[cia];
    return pontos[banco];
  }, [modo, cia, banco, pontos]);

  // totais do carrinho
  const totais = useMemo(() => {
    const items = compra?.items || [];
    const totalCents = items.reduce((acc, it) => acc + (it.amountCents || 0), 0);
    const totalPontosFinal = items.reduce((acc, it) => acc + (it.pointsFinal || 0), 0);
    return { totalCents, totalPontosFinal };
  }, [compra]);

  async function adicionarItem() {
    if (!compra) return;

    // validações mínimas
    const pointsBase = Math.trunc(Number(pontosConfirmados || 0));
    const amountCents = toCents(valor);

    if (tipo === "TRANSFER" && modo !== "BANCO_CIA") {
      alert("Transferência só faz sentido no modo Banco + CIA.");
      return;
    }

    // título default se vazio
    const titleFinal =
      titulo.trim() ||
      (tipo === "TRANSFER"
        ? "Transferência"
        : tipo === "CLUB"
        ? "Clube"
        : tipo === "POINTS_BUY"
        ? "Compra de pontos"
        : tipo === "EXTRA_COST"
        ? "Custo extra"
        : "Ajuste");

    // bonus
    let bonusMode: "PERCENT" | "TOTAL" | null = null;
    let bonusValue: number | null = null;
    if (modoBonus === "PERCENT") {
      bonusMode = "PERCENT";
      bonusValue = Math.trunc(Number(bonusPct || 0));
    } else if (modoBonus === "TOTAL") {
      bonusMode = "TOTAL";
      bonusValue = Math.trunc(Number(bonusTotal || 0));
    }

    const payload: any = {
      type: tipo,
      title: titleFinal,
      details: detalhes.trim() || null,
      pointsBase,
      bonusMode,
      bonusValue,
      amountCents,
    };

    // regras por tipo
    if (tipo === "TRANSFER") {
      payload.programFrom = programasAtivos.programFrom;
      payload.programTo = programasAtivos.programTo;
      payload.transferMode = transferMode;
      payload.pointsDebitedFromOrigin = Math.trunc(Number(pontosDebitoOrigem || 0));
    }

    try {
      const res = await fetch(`/api/compras/${compra.id}/itens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        alert(json?.error || "Erro ao adicionar item.");
        return;
      }

      // limpa form
      setTitulo("");
      setDetalhes("");
      setValor("");
      setPontosConfirmados("");
      setModoBonus("NENHUM");
      setBonusPct("");
      setBonusTotal("");
      setTransferMode("FULL_POINTS");
      setPontosDebitoOrigem("");

      await carregar();
    } catch {
      alert("Erro de rede ao adicionar item.");
    }
  }

  async function removerItem(itemId: string) {
    if (!compra) return;
    if (!confirm("Remover este item do carrinho?")) return;

    try {
      // ✅ delete no caminho correto (item dentro da compra)
      const res = await fetch(`/api/compras/${compra.id}/itens/${itemId}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        alert(json?.error || "Erro ao remover item.");
        return;
      }
      await carregar();
    } catch {
      alert("Erro de rede ao remover item.");
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Carregando…</div>;
  if (!compra) return <div className="text-sm text-red-600">Compra não encontrada.</div>;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Compra {compraIdFmt(compra.numero)}{" "}
            <span className="text-sm font-normal text-slate-500">({compra.status})</span>
          </h1>
          <div className="text-sm text-slate-600">
            Cedente: <span className="font-medium">{compra.cedente.nomeCompleto}</span> •{" "}
            {compra.cedente.identificador}
          </div>
        </div>

        <div className="rounded-xl border px-3 py-2 text-sm">
          <div className="text-xs text-slate-500">Totais do carrinho</div>
          <div className="font-semibold">{fmtMoney(totais.totalCents)}</div>
          <div className="text-xs text-slate-500">Pontos finais: {fmtInt(totais.totalPontosFinal)}</div>
        </div>
      </div>

      {/* Seleção de programas */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold">1) Programas usados</h2>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={modo === "CIA"} onChange={() => setModo("CIA")} />
            Só CIA (LATAM ou SMILES)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={modo === "BANCO_CIA"} onChange={() => setModo("BANCO_CIA")} />
            Banco + CIA (LIVELO/ESFERA → LATAM/SMILES)
          </label>
        </div>

        {modo === "CIA" ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-slate-600">CIA:</div>
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              value={cia}
              onChange={(e) => setCia(e.target.value as any)}
            >
              <option value="LATAM">LATAM</option>
              <option value="SMILES">SMILES</option>
            </select>

            <div className="rounded-xl border px-3 py-2 text-sm">
              <span className="text-slate-500">Pontos atuais: </span>
              <span className="font-semibold">{fmtInt(pontos[cia])}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-slate-600">Banco (origem):</div>
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              value={banco}
              onChange={(e) => setBanco(e.target.value as any)}
            >
              <option value="LIVELO">LIVELO</option>
              <option value="ESFERA">ESFERA</option>
            </select>

            <div className="text-sm text-slate-600">CIA (destino):</div>
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              value={cia2}
              onChange={(e) => setCia2(e.target.value as any)}
            >
              <option value="LATAM">LATAM</option>
              <option value="SMILES">SMILES</option>
            </select>

            <div className="rounded-xl border px-3 py-2 text-sm">
              <span className="text-slate-500">Pontos no banco: </span>
              <span className="font-semibold">{fmtInt(pontos[banco])}</span>
            </div>
          </div>
        )}
      </div>

      {/* Form de item */}
      <div className="rounded-2xl border bg-white p-4 space-y-4">
        <h2 className="text-sm font-semibold">2) Adicionar item ao carrinho</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-500">Tipo</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoItem)}
            >
              <option value="CLUB">Clube</option>
              <option value="POINTS_BUY">Compra de pontos</option>
              {modo === "BANCO_CIA" && <option value="TRANSFER">Transferência</option>}
              <option value="EXTRA_COST">Custo extra</option>
              <option value="ADJUSTMENT">Ajuste manual</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-slate-500">Título (opcional)</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Clube 10k, Transfer 30%, Taxa..."
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs text-slate-500">Detalhes (opcional)</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={detalhes}
              onChange={(e) => setDetalhes(e.target.value)}
              placeholder="Observações do item..."
            />
          </div>
        </div>

        {/* Pontos */}
        <div className="rounded-xl border p-3 space-y-2">
          <div className="text-sm font-medium">Pontos</div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">Prévia do saldo no programa selecionado:</span>
            <span className="font-semibold">{fmtInt(pontosPrevistos)}</span>

            <button
              type="button"
              className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50"
              onClick={() => setPontosConfirmados(String(pontosPrevistos))}
              title="Usar o saldo como base"
            >
              Usar prévia
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-slate-500">Quantidade confirmada (editável)</div>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                inputMode="numeric"
                value={pontosConfirmados}
                onChange={(e) => setPontosConfirmados(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Ex: 50000"
              />
            </div>

            <div>
              <div className="text-xs text-slate-500">Bônus</div>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={modoBonus}
                onChange={(e) => setModoBonus(e.target.value as any)}
              >
                <option value="NENHUM">Sem bônus</option>
                <option value="PERCENT">% (percentual)</option>
                <option value="TOTAL">Total (pontos bônus)</option>
              </select>
            </div>

            {modoBonus === "PERCENT" ? (
              <div>
                <div className="text-xs text-slate-500">% bônus (ex: 30)</div>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  inputMode="numeric"
                  value={bonusPct}
                  onChange={(e) => setBonusPct(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="30"
                />
              </div>
            ) : modoBonus === "TOTAL" ? (
              <div>
                <div className="text-xs text-slate-500">Bônus total (pontos)</div>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  inputMode="numeric"
                  value={bonusTotal}
                  onChange={(e) => setBonusTotal(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="30000"
                />
              </div>
            ) : (
              <div className="text-xs text-slate-500 flex items-end">—</div>
            )}
          </div>

          {tipo === "TRANSFER" && (
            <div className="mt-3 rounded-xl border p-3 space-y-2">
              <div className="text-sm font-medium">Transferência</div>

              <div className="text-xs text-slate-500">
                Origem: <b>{programasAtivos.programFrom}</b> → Destino: <b>{programasAtivos.programTo}</b>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-slate-500">Modo</div>
                  <select
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={transferMode}
                    onChange={(e) => setTransferMode(e.target.value as TransferMode)}
                  >
                    <option value="FULL_POINTS">Só pontos</option>
                    <option value="POINTS_PLUS_CASH">Pontos + dinheiro</option>
                  </select>
                </div>

                <div>
                  <div className="text-xs text-slate-500">Pontos debitados da origem (se aplicável)</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    inputMode="numeric"
                    value={pontosDebitoOrigem}
                    onChange={(e) => setPontosDebitoOrigem(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="Ex: 1000"
                  />
                </div>

                <div>
                  <div className="text-xs text-slate-500">Custo (R$) (se Pontos + dinheiro)</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="Ex: 79,90"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Valor para itens que envolvem dinheiro */}
        {tipo !== "TRANSFER" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500">Valor (R$)</div>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="Ex: 79,90"
              />
            </div>

            <div className="text-xs text-slate-500 flex items-end">(Se não tiver valor em dinheiro, deixe vazio/0)</div>
          </div>
        )}

        <button
          onClick={adicionarItem}
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
          disabled={compra.status !== "OPEN"}
        >
          Adicionar ao carrinho
        </button>
      </div>

      {/* Carrinho */}
      <div className="rounded-2xl border bg-white p-4">
        <h2 className="text-sm font-semibold">3) Carrinho</h2>

        {compra.items.length === 0 ? (
          <div className="mt-3 text-sm text-slate-500">Nenhum item ainda.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {compra.items.map((it) => (
              <div key={it.id} className="rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {it.title} <span className="text-xs font-normal text-slate-500">({it.type})</span>
                  </div>

                  <div className="text-xs text-slate-500">
                    Pontos: {fmtInt(it.pointsBase)} → final: <b>{fmtInt(it.pointsFinal)}</b>
                    {it.bonusMode === "PERCENT" && it.bonusValue != null && <> • bônus: {it.bonusValue}%</>}
                    {it.bonusMode === "TOTAL" && it.bonusValue != null && <> • bônus: +{fmtInt(it.bonusValue)}</>}
                  </div>

                  {it.type === "TRANSFER" && (
                    <div className="text-xs text-slate-500">
                      {it.programFrom} → {it.programTo} • modo: {it.transferMode} • débito origem: {fmtInt(it.pointsDebitedFromOrigin)}
                    </div>
                  )}

                  {it.details && <div className="text-xs text-slate-500">{it.details}</div>}
                </div>

                <div className="text-right">
                  <div className="text-sm font-semibold">{fmtMoney(it.amountCents)}</div>
                  <button
                    className="mt-1 rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                    onClick={() => removerItem(it.id)}
                    disabled={compra.status !== "OPEN"}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-600">
            Total: <b>{fmtMoney(totais.totalCents)}</b> • Pontos finais: <b>{fmtInt(totais.totalPontosFinal)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
