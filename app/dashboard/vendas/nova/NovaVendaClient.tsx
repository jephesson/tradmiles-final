"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { getSession } from "@/lib/auth";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Owner = { id: string; name: string; login: string };

type Suggestion = {
  cedente: { id: string; identificador: string; nomeCompleto: string; cpf: string; owner: Owner };
  program: Program;
  pointsNeeded: number;
  passengersNeeded: number;
  pts: number;
  paxLimit: number;
  usedPassengersYear: number;
  availablePassengersYear: number;
  leftoverPoints: number;
  eligible: boolean;
  priorityLabel: "MAX" | "OK" | "MEIO" | "BAIXA" | "INELIGIVEL";
  alerts: string[];
};

type ClienteLite = {
  id: string;
  identificador: string;
  nome: string;
  cpfCnpj: string | null;
  telefone: string | null;
};

type CompraOpen = {
  id: string;
  numero: string;
  status: "OPEN";
  ciaAerea: Program | null;
  metaMilheiroCents: number;
  custoMilheiroCents: number;
  metaMarkupCents: number;
};

type UserLite = { id: string; name: string; login: string };

function clampInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}
function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}
function fmtMoneyBR(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function moneyToCentsBR(input: string) {
  const s = (input || "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function normStr(v?: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j as any)?.ok === false) throw new Error((j as any)?.error || `Erro ${res.status}`);
  return j as T;
}

export default function NovaVendaClient() {
  const session = getSession();

  // ✅ FIX: Session não tem `.user` — usa o próprio session como fonte de id/name/login
  const user: UserLite | null = session
    ? { id: (session as any).id, name: (session as any).name, login: (session as any).login }
    : null;

  // 1) input principal
  const [program, setProgram] = useState<Program>("LATAM");
  const [pointsStr, setPointsStr] = useState("");
  const points = useMemo(() => clampInt((pointsStr || "").replace(/\D+/g, "")), [pointsStr]);
  const [passengers, setPassengers] = useState(1);

  // sugestões
  const [loadingSug, setLoadingSug] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sel, setSel] = useState<Suggestion | null>(null);

  // ✅ busca cedente (filtra dentro das sugestões retornadas)
  const [cedenteQ, setCedenteQ] = useState("");

  // cliente
  const [clienteQ, setClienteQ] = useState("");
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [clienteId, setClienteId] = useState("");

  // compras OPEN do cedente selecionado
  const [compras, setCompras] = useState<CompraOpen[]>([]);
  const [purchaseId, setPurchaseId] = useState("");

  // funcionários (para cartão)
  const [users, setUsers] = useState<UserLite[]>([]);
  const [feeCardLabel, setFeeCardLabel] = useState("");
  const [feeCardMode, setFeeCardMode] = useState<"SELF" | "USER" | "VIAS" | "MANUAL">("SELF");
  const [feeCardUserId, setFeeCardUserId] = useState("");

  // campos venda
  const [dateISO, setDateISO] = useState(isoToday());
  const [milheiroStr, setMilheiroStr] = useState("0,00");
  const [embarqueStr, setEmbarqueStr] = useState("0,00");
  const [locator, setLocator] = useState("");

  const milheiroCents = useMemo(() => moneyToCentsBR(milheiroStr), [milheiroStr]);
  const embarqueFeeCents = useMemo(() => moneyToCentsBR(embarqueStr), [embarqueStr]);

  const pointsValueCents = useMemo(() => {
    const denom = points / 1000;
    if (denom <= 0) return 0;
    return Math.round(denom * milheiroCents);
  }, [points, milheiroCents]);

  const totalCents = useMemo(() => pointsValueCents + embarqueFeeCents, [pointsValueCents, embarqueFeeCents]);

  const commissionCents = useMemo(() => Math.round(pointsValueCents * 0.01), [pointsValueCents]);

  const compraSel = useMemo(() => compras.find((c) => c.id === purchaseId) || null, [compras, purchaseId]);
  const metaMilheiroCents = compraSel?.metaMilheiroCents || 0;

  const bonusCents = useMemo(() => {
    if (!metaMilheiroCents) return 0;
    const diff = milheiroCents - metaMilheiroCents;
    if (diff <= 0) return 0;
    const denom = points / 1000;
    const diffTotal = Math.round(denom * diff);
    return Math.round(diffTotal * 0.3);
  }, [milheiroCents, metaMilheiroCents, points]);

  const detailsRef = useRef<HTMLDivElement | null>(null);

  function badgeClass(priorityLabel: Suggestion["priorityLabel"]) {
    return priorityLabel === "MAX"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : priorityLabel === "BAIXA"
        ? "bg-slate-100 border-slate-200 text-slate-600"
        : "bg-amber-50 border-amber-200 text-amber-700";
  }

  function selectSuggestion(s: Suggestion) {
    setSel(s);
    // ✅ ao selecionar, some a tabela e rola pros detalhes
    setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  function clearSelection() {
    setSel(null);
    setCompras([]);
    setPurchaseId("");
  }

  // load users (cartão)
  useEffect(() => {
    (async () => {
      try {
        const out = await api<{ ok: true; users: UserLite[] }>("/api/users/simple");
        setUsers(out.users || []);
      } catch {
        setUsers([]);
      }
    })();
  }, []);

  // default card label
  useEffect(() => {
    if (!user?.name) return;
    if (!feeCardLabel) setFeeCardLabel(`Cartão ${user.name}`);
  }, [user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // aplica modo do cartão
  useEffect(() => {
    if (feeCardMode === "SELF") {
      setFeeCardLabel(user?.name ? `Cartão ${user.name}` : "Cartão do vendedor");
      return;
    }
    if (feeCardMode === "VIAS") {
      setFeeCardLabel("Cartão Vias Aéreas");
      return;
    }
    if (feeCardMode === "USER") {
      const u = users.find((x) => x.id === feeCardUserId);
      setFeeCardLabel(u ? `Cartão ${u.name}` : "");
      return;
    }
    // MANUAL: mantém
  }, [feeCardMode, feeCardUserId, users, user?.name]);

  // sugestões (debounce)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (points <= 0 || passengers <= 0) {
        setSuggestions([]);
        setSel(null);
        return;
      }
      setLoadingSug(true);
      try {
        const out = await api<{ ok: true; suggestions: Suggestion[] }>(
          `/api/vendas/sugestoes?program=${program}&points=${points}&passengers=${passengers}`
        );
        const list = out.suggestions || [];
        setSuggestions(list);

        // ✅ se mudou entrada e o selecionado não existe mais, limpa
        if (sel?.cedente?.id && !list.some((x) => x.cedente.id === sel.cedente.id)) {
          clearSelection();
        }
      } catch {
        setSuggestions([]);
        setSel(null);
      } finally {
        setLoadingSug(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, points, passengers]);

  // cliente search (debounce)
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = clienteQ.trim();
      if (q.length < 2) {
        setClientes([]);
        return;
      }
      try {
        const out = await api<{ ok: true; clientes: ClienteLite[] }>(
          `/api/clientes/search?q=${encodeURIComponent(q)}`
        );
        setClientes(out.clientes || []);
      } catch {
        setClientes([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [clienteQ]);

  // quando escolhe cedente -> carrega compras OPEN daquele cedente
  useEffect(() => {
    (async () => {
      if (!sel?.cedente?.id) {
        setCompras([]);
        setPurchaseId("");
        return;
      }
      try {
        const out = await api<{ ok: true; compras: CompraOpen[] }>(`/api/compras/open?cedenteId=${sel.cedente.id}`);
        setCompras(out.compras || []);
        setPurchaseId("");
      } catch {
        setCompras([]);
        setPurchaseId("");
      }
    })();
  }, [sel?.cedente?.id]);

  function onChangePoints(v: string) {
    const digits = (v || "").replace(/\D+/g, "");
    if (!digits) return setPointsStr("");
    const n = clampInt(digits);
    setPointsStr(n.toLocaleString("pt-BR"));
  }

  async function salvarVenda() {
    if (!sel?.eligible) return alert("Selecione um cedente elegível.");
    if (!clienteId) return alert("Selecione um cliente.");
    if (!purchaseId) return alert("Selecione a compra OPEN (ID).");
    if (points <= 0 || passengers <= 0) return alert("Pontos/Passageiros inválidos.");
    if (milheiroCents <= 0) return alert("Milheiro inválido.");

    const payload = {
      program,
      points,
      passengers,
      cedenteId: sel.cedente.id,
      clienteId,
      purchaseId,
      date: dateISO,
      milheiroCents,
      embarqueFeeCents,
      feeCardLabel: feeCardLabel?.trim() || null,
      locator: locator?.trim() || null,
    };

    try {
      await api("/api/vendas", { method: "POST", body: JSON.stringify(payload) });
      alert("Venda criada!");
      window.location.href = "/dashboard/vendas";
    } catch (e: any) {
      alert(e.message);
    }
  }

  // ✅ lista visível: só 10 por padrão. Se tiver busca, mostra até 10 do filtro.
  const filteredSuggestions = useMemo(() => {
    const q = normStr(cedenteQ);
    if (!q) return suggestions;

    return suggestions.filter((s) => {
      const hay = [
        s.cedente.nomeCompleto,
        s.cedente.identificador,
        s.cedente.cpf,
        s.cedente.owner?.name,
        s.cedente.owner?.login,
      ]
        .map(normStr)
        .join(" | ");
      return hay.includes(q);
    });
  }, [suggestions, cedenteQ]);

  const visibleSuggestions = useMemo(() => filteredSuggestions.slice(0, 10), [filteredSuggestions]);

  const countLabel = useMemo(() => {
    if (loadingSug) return "Calculando...";
    if (sel) return "Selecionado";
    const q = normStr(cedenteQ);
    if (!suggestions.length) return "0 resultados";
    if (q) return `${Math.min(10, filteredSuggestions.length)} de ${filteredSuggestions.length} (busca)`;
    return `${Math.min(10, suggestions.length)} de ${suggestions.length}`;
  }, [loadingSug, sel, cedenteQ, suggestions.length, filteredSuggestions.length]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Nova venda</h1>
          <p className="text-sm text-slate-500">Informe pontos + CIA + passageiros. O sistema sugere o melhor cedente.</p>
        </div>

        <div className="flex gap-2">
          <Link href="/dashboard/vendas" className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50">
            Voltar
          </Link>
          <button onClick={salvarVenda} className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800">
            Salvar venda
          </button>
        </div>
      </div>

      {/* 1) Input */}
      <div className="rounded-2xl border bg-white p-5">
        <div className="font-medium">1) Dados da venda</div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-1">
            <div className="text-xs text-slate-600">CIA / Programa</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
              value={program}
              onChange={(e) => setProgram(e.target.value as Program)}
            >
              <option value="LATAM">LATAM</option>
              <option value="SMILES">SMILES</option>
              <option value="LIVELO">LIVELO</option>
              <option value="ESFERA">ESFERA</option>
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">Pontos</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
              value={pointsStr}
              onChange={(e) => onChangePoints(e.target.value)}
              placeholder="Ex: 100.000"
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">Passageiros</div>
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
              value={passengers}
              onChange={(e) => setPassengers(Math.max(1, clampInt(e.target.value)))}
            />
          </label>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Sugestões consideram: <b>pontos</b>, <b>limite anual</b> (EmissionEvent) e <b>bloqueio</b> (BlockedAccount OPEN).
        </div>
      </div>

      {/* 2) Sugestões */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <div className="font-medium">2) Cedentes sugeridos</div>
            <div className="text-xs text-slate-500">
              Prioridade: sobrar &lt; 2k (MAX) • sobrar 3-10k (BAIXA) • acima de 10k, sobrar menos primeiro.
            </div>
          </div>
          <div className="text-xs text-slate-500">{countLabel}</div>
        </div>

        {/* ✅ SELECIONADO: some a tabela totalmente */}
        {sel ? (
          <div className="p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="text-xs text-slate-500">Cedente selecionado</div>
                <div className="text-base font-semibold">{sel.cedente.nomeCompleto}</div>
                <div className="text-xs text-slate-500">
                  {sel.cedente.identificador} • Resp.: <b>{sel.cedente.owner.name}</b> (@{sel.cedente.owner.login})
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border bg-white px-2 py-1">
                    PTS: <b className="tabular-nums">{fmtInt(sel.pts)}</b>
                  </span>
                  <span className="rounded-full border bg-white px-2 py-1">
                    PAX disp.:{" "}
                    <b className="tabular-nums">{fmtInt(sel.availablePassengersYear)}</b>{" "}
                    <span className="text-slate-500">
                      (usados {fmtInt(sel.usedPassengersYear)}/{fmtInt(sel.paxLimit)})
                    </span>
                  </span>
                  <span className="rounded-full border bg-white px-2 py-1">
                    Sobra: <b className="tabular-nums">{fmtInt(sel.leftoverPoints)}</b>
                  </span>
                  <span className={cn("rounded-full border px-2 py-1", badgeClass(sel.priorityLabel))}>
                    {sel.priorityLabel}
                  </span>
                </div>

                {sel.alerts.includes("PASSAGEIROS_ESTOURADOS_COM_PONTOS") ? (
                  <div className="mt-2 text-[11px] text-rose-600">
                    Alerta: limite anual estoura e ainda sobraria &gt; 3.000 pts.
                  </div>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Ir para dados
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Trocar cedente
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ✅ Não selecionado: mostra busca + apenas 10 */}
            <div className="p-5 border-b">
              <div className="grid gap-3 md:grid-cols-3 md:items-end">
                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs text-slate-600">Pesquisar cedente (nome, ID, CPF, responsável)</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={cedenteQ}
                    onChange={(e) => setCedenteQ(e.target.value)}
                    placeholder="Ex: Rayssa / RAY-212 / Lucas / 123..."
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setCedenteQ("")}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Limpar busca
                </button>
              </div>

              <div className="mt-2 text-xs text-slate-500">
                Mostrando no máximo <b>10</b>. Para achar alguém específico, use a busca acima.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-slate-600">
                    <th className="text-left font-semibold px-4 py-3 w-[360px]">CEDENTE</th>
                    <th className="text-left font-semibold px-4 py-3 w-[220px]">RESPONSÁVEL</th>
                    <th className="text-right font-semibold px-4 py-3 w-[140px]">PTS</th>
                    <th className="text-right font-semibold px-4 py-3 w-[220px]">PAX DISP. (ano)</th>
                    <th className="text-right font-semibold px-4 py-3 w-[140px]">SOBRA</th>
                    <th className="text-left font-semibold px-4 py-3 w-[140px]">PRIOR.</th>
                    <th className="text-right font-semibold px-4 py-3 w-[120px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {!loadingSug && suggestions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-slate-500">
                        Informe pontos e passageiros para ver sugestões.
                      </td>
                    </tr>
                  ) : null}

                  {!loadingSug && suggestions.length > 0 && visibleSuggestions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-slate-500">
                        Nenhum cedente encontrado para essa busca.
                      </td>
                    </tr>
                  ) : null}

                  {visibleSuggestions.map((s) => {
                    const badge = badgeClass(s.priorityLabel);

                    return (
                      <tr key={s.cedente.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{s.cedente.nomeCompleto}</div>
                          <div className="text-xs text-slate-500">{s.cedente.identificador}</div>
                          {s.alerts.includes("PASSAGEIROS_ESTOURADOS_COM_PONTOS") ? (
                            <div className="mt-1 text-[11px] text-rose-600">
                              Alerta: limite anual estoura e ainda sobraria &gt; 3.000 pts.
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{s.cedente.owner.name}</div>
                          <div className="text-xs text-slate-500">@{s.cedente.owner.login}</div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtInt(s.pts)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmtInt(s.availablePassengersYear)}
                          <span className="text-xs text-slate-500">
                            {" "}
                            (usados {fmtInt(s.usedPassengersYear)}/{fmtInt(s.paxLimit)})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtInt(s.leftoverPoints)}</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs", badge)}>
                            {s.priorityLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            disabled={!s.eligible}
                            onClick={() => selectSuggestion(s)}
                            className={cn(
                              "rounded-xl border px-3 py-1.5 text-sm",
                              s.eligible ? "hover:bg-slate-50" : "opacity-40 cursor-not-allowed"
                            )}
                          >
                            Usar
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {loadingSug ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-slate-500">
                        Carregando...
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 3) Detalhes da venda (só aparece depois do cedente) */}
      {sel && (
        <div ref={detailsRef} className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border bg-white p-5">
              <div className="font-medium">3) Cliente + Compra OPEN + Dados</div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <div className="text-xs text-slate-600">Data</div>
                  <input
                    type="date"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={dateISO}
                    onChange={(e) => setDateISO(e.target.value)}
                  />
                </label>

                <div className="space-y-1">
                  <div className="text-xs text-slate-600">Vendedor</div>
                  <div className="rounded-xl border px-3 py-2 text-sm bg-slate-50">
                    {user?.name ? `${user.name} (@${user.login})` : "—"}
                  </div>
                </div>

                <div className="md:col-span-2 grid gap-2 md:grid-cols-2">
                  <label className="space-y-1">
                    <div className="text-xs text-slate-600">Buscar cliente</div>
                    <input
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                      value={clienteQ}
                      onChange={(e) => setClienteQ(e.target.value)}
                      placeholder="Nome / CPF/CNPJ / telefone..."
                    />
                  </label>

                  <label className="space-y-1">
                    <div className="text-xs text-slate-600">Selecionar cliente</div>
                    <select
                      className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                      value={clienteId}
                      onChange={(e) => setClienteId(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome} ({c.identificador})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs text-slate-600">Compra OPEN (do cedente)</div>
                  <select
                    className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                    value={purchaseId}
                    onChange={(e) => setPurchaseId(e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {compras.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} • meta {((c.metaMilheiroCents || 0) / 100).toFixed(2).replace(".", ",")}
                      </option>
                    ))}
                  </select>
                  <div className="text-[11px] text-slate-500 mt-1">
                    A venda só deixa salvar se a compra estiver OPEN e for do mesmo cedente.
                  </div>
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">Milheiro (R$)</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
                    value={milheiroStr}
                    onChange={(e) => setMilheiroStr(e.target.value)}
                    placeholder="Ex: 25,50"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">Taxa de embarque (R$)</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
                    value={embarqueStr}
                    onChange={(e) => setEmbarqueStr(e.target.value)}
                    placeholder="Ex: 78,34"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">Cartão da taxa</div>
                  <select
                    className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                    value={feeCardMode}
                    onChange={(e) => setFeeCardMode(e.target.value as any)}
                  >
                    <option value="SELF">Meu cartão</option>
                    <option value="USER">Cartão de funcionário</option>
                    <option value="VIAS">Cartão Vias Aéreas</option>
                    <option value="MANUAL">Manual</option>
                  </select>

                  {feeCardMode === "USER" ? (
                    <select
                      className="mt-2 w-full rounded-xl border px-3 py-2 text-sm bg-white"
                      value={feeCardUserId}
                      onChange={(e) => setFeeCardUserId(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} (@{u.login})
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {feeCardMode === "MANUAL" ? (
                    <input
                      className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
                      value={feeCardLabel}
                      onChange={(e) => setFeeCardLabel(e.target.value)}
                      placeholder="Ex: Cartão Inter PJ"
                    />
                  ) : (
                    <div className="mt-2 text-xs text-slate-500">Selecionado: {feeCardLabel || "—"}</div>
                  )}
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">Localizador</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
                    value={locator}
                    onChange={(e) => setLocator(e.target.value)}
                    placeholder="Opcional"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Resumo */}
          <div className="rounded-2xl border bg-white p-5 h-fit lg:sticky lg:top-4 space-y-2">
            <div className="font-medium">Resumo</div>

            <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Pontos</span>
                <b>{fmtInt(points)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">PAX</span>
                <b>{fmtInt(passengers)}</b>
              </div>
              <div className="h-px bg-slate-200 my-2" />

              <div className="flex justify-between">
                <span className="text-slate-600">Valor pontos</span>
                <b>{fmtMoneyBR(pointsValueCents)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Taxa embarque</span>
                <b>{fmtMoneyBR(embarqueFeeCents)}</b>
              </div>
              <div className="h-px bg-slate-200 my-2" />
              <div className="flex justify-between">
                <span className="text-slate-600">Total</span>
                <b>{fmtMoneyBR(totalCents)}</b>
              </div>

              <div className="h-px bg-slate-200 my-2" />
              <div className="flex justify-between">
                <span className="text-slate-600">Comissão (1%)</span>
                <b>{fmtMoneyBR(commissionCents)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Meta (compra)</span>
                <b>{metaMilheiroCents ? fmtMoneyBR(metaMilheiroCents) : "—"}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Bônus (30%)</span>
                <b>{fmtMoneyBR(bonusCents)}</b>
              </div>
            </div>

            <div className="text-xs text-slate-500">Comissão ignora taxa. Bônus = 30% do excedente acima da meta.</div>
          </div>
        </div>
      )}
    </div>
  );
}
