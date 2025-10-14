"use client";

import { useEffect, useMemo, useState } from "react";

/** =========================
 *  Storage
 * ========================= */
const DEBTS_KEY = "TM_DEBTS";
const DEBTS_TXNS_KEY = "TM_DEBTS_TXNS";

type Debt = {
  id: string;
  nome: string;
  inicial: number;
  nota?: string;
  createdAt: string;
  isClosed?: boolean;
};

type DebtTxn = {
  id: string;
  debtId: string;
  tipo: "add" | "pay"; // add = nova dívida; pay = pagamento
  valor: number;
  obs?: string;
  dataISO: string;
};

function loadLS<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function saveLS<T>(key: string, value: T) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
}
function formatBRL(n: number) {
  const v = Number(n) || 0;
  return "R$ " + new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function parseBRL(s: string) {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** =========================
 *  Page
 * ========================= */
export default function DividasPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [txns, setTxns] = useState<DebtTxn[]>([]);

  // form "nova dívida"
  const [nome, setNome] = useState("");
  const [valorTxt, setValorTxt] = useState("R$ 0,00");
  const [nota, setNota] = useState("");

  // linha-ação
  const [valorAcaoTxt, setValorAcaoTxt] = useState("R$ 0,00");
  const [obsAcao, setObsAcao] = useState("");

  useEffect(() => {
    setDebts(loadLS(DEBTS_KEY, [] as Debt[]));
    setTxns(loadLS(DEBTS_TXNS_KEY, [] as DebtTxn[]));
  }, []);

  function persist(debtsNext: Debt[] = debts, txnsNext: DebtTxn[] = txns) {
    setDebts(debtsNext); saveLS(DEBTS_KEY, debtsNext);
    setTxns(txnsNext);   saveLS(DEBTS_TXNS_KEY, txnsNext);
  }

  function addDebt() {
    const inicial = parseBRL(valorTxt);
    if (!nome.trim()) return;
    const d: Debt = { id: crypto.randomUUID(), nome: nome.trim(), inicial, nota: nota.trim() || undefined, createdAt: new Date().toISOString() };
    persist([d, ...debts], txns);
    setNome(""); setValorTxt("R$ 0,00"); setNota("");
  }

  function addTxn(debtId: string, tipo: DebtTxn["tipo"], valor: number, obs?: string) {
    const t: DebtTxn = { id: crypto.randomUUID(), debtId, tipo, valor, obs, dataISO: new Date().toISOString() };
    persist(debts, [t, ...txns]);
  }

  function toggleClose(debtId: string) {
    const list = debts.map(d => d.id === debtId ? { ...d, isClosed: !d.isClosed } : d);
    persist(list, txns);
  }

  function removeDebt(debtId: string) {
    if (!confirm("Remover esta dívida e seu histórico?")) return;
    const list = debts.filter(d => d.id !== debtId);
    const tx = txns.filter(t => t.debtId !== debtId);
    persist(list, tx);
  }

  function saldo(debtId: string) {
    const d = debts.find(x => x.id === debtId);
    if (!d) return 0;
    const adds = txns.filter(t => t.debtId === debtId && t.tipo === "add").reduce((s, t) => s + t.valor, 0);
    const pays = txns.filter(t => t.debtId === debtId && t.tipo === "pay").reduce((s, t) => s + t.valor, 0);
    return d.inicial + adds - pays;
  }

  const totalAberto = useMemo(() =>
    debts.filter(d => !d.isClosed).reduce((s, d) => s + saldo(d.id), 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [debts, txns]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dívidas</h1>
        <div className="text-sm text-slate-600">Total em aberto: <span className="font-semibold">{fmtMoney(totalAberto)}</span></div>
      </div>

      {/* Nova dívida */}
      <section className="bg-white rounded-2xl shadow p-4 space-y-3">
        <h2 className="font-medium">Adicionar nova dívida</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="block">
            <div className="text-xs text-slate-600 mb-1">Nome do credor</div>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="ex.: Gabriel" />
          </label>
          <label className="block">
            <div className="text-xs text-slate-600 mb-1">Valor inicial</div>
            <div className="flex items-center rounded-lg border px-3 py-2 text-sm">
              <span className="mr-2 text-slate-500">R$</span>
              <input
                value={valorAcionavel(valorTxt)}
                onChange={(e) => setValorTxt("R$ " + e.target.value)}
                onBlur={() => setValorTxt(formatBRL(parseBRL(valorTxt)))}
                className="w-full outline-none"
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
          </label>
          <label className="sm:col-span-2 block">
            <div className="text-xs text-slate-600 mb-1">Observação</div>
            <input value={nota} onChange={(e) => setNota(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="ex.: empréstimo..." />
          </label>
        </div>
        <div>
          <button onClick={addDebt} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">Salvar dívida</button>
        </div>
      </section>

      {/* Lista */}
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-medium mb-2">Dívidas registradas</h2>

        {/* Ações em lote */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-3">
          <div className="sm:col-span-2">
            <div className="text-xs text-slate-600 mb-1">Valor p/ ação</div>
            <div className="flex items-center rounded-lg border px-3 py-2 text-sm">
              <span className="mr-2 text-slate-500">R$</span>
              <input
                value={valorAcionavel(valorAcaoTxt)}
                onChange={(e) => setValorAcaoTxt("R$ " + e.target.value)}
                onBlur={() => setValorAcaoTxt(formatBRL(parseBRL(valorAcaoTxt)))}
                className="w-full outline-none"
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
          </div>
          <div className="sm:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Observação</div>
            <input value={obsAcao} onChange={(e) => setObsAcao(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="ex.: parcela 1/5..." />
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Credor</th>
                <th className="py-2 pr-4">Criada em</th>
                <th className="py-2 pr-4">Saldo</th>
                <th className="py-2 pr-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {debts.length === 0 && (
                <tr><td className="py-4 text-slate-500" colSpan={4}>Nenhuma dívida cadastrada.</td></tr>
              )}
              {debts.map((d) => {
                const s = saldo(d.id);
                return (
                  <tr key={d.id} className="border-b align-top">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{d.nome}{d.isClosed ? " (quitada)" : ""}</div>
                      {d.nota && <div className="text-xs text-slate-500">{d.nota}</div>}
                    </td>
                    <td className="py-2 pr-4">{new Date(d.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="py-2 pr-4 font-semibold">{fmtMoney(s)}</td>
                    <td className="py-2 pr-4 space-x-2">
                      <button onClick={() => addTxn(d.id, "add", parseBRL(valorAcaoTxt), obsAcao)} className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50">Adicionar (+)</button>
                      <button onClick={() => addTxn(d.id, "pay", parseBRL(valorAcaoTxt), obsAcao)} className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50">Pagamento (-)</button>
                      <button onClick={() => toggleClose(d.id)} className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50">{d.isClosed ? "Reabrir" : "Quitar"}</button>
                      <button onClick={() => removeDebt(d.id)} className="rounded-lg border px-2 py-1 text-xs hover:bg-rose-50">Excluir</button>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-slate-600">Extrato</summary>
                        <DebtExtract debt={d} txns={txns.filter(t => t.debtId === d.id)} />
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function valorAcionavel(s: string) { return (s || "").replace(/^R\$\s?/, ""); }

function DebtExtract({ debt, txns }: { debt: Debt; txns: DebtTxn[] }) {
  return (
    <div className="mt-2 rounded-lg border">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left border-b">
            <th className="py-1 px-2">Data</th>
            <th className="py-1 px-2">Tipo</th>
            <th className="py-1 px-2">Valor</th>
            <th className="py-1 px-2">Obs.</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-1 px-2">{new Date(debt.createdAt).toLocaleString("pt-BR")}</td>
            <td className="py-1 px-2">Inicial</td>
            <td className="py-1 px-2">{fmtMoney(debt.inicial)}</td>
            <td className="py-1 px-2">{debt.nota || "-"}</td>
          </tr>
          {txns.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="py-1 px-2">{new Date(t.dataISO).toLocaleString("pt-BR")}</td>
              <td className="py-1 px-2">{t.tipo === "add" ? "Dívida (+)" : "Pagamento (-)"}</td>
              <td className="py-1 px-2">{fmtMoney(t.valor)}</td>
              <td className="py-1 px-2">{t.obs || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
