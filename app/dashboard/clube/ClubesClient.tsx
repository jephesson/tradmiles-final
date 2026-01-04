"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type Status = "ACTIVE" | "PAUSED" | "CANCELED";

type CedenteLite = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
};

type ClubeRow = {
  id: string;
  team: string;
  cedenteId: string;
  program: Program;

  tierK: number;
  priceCents: number;

  subscribedAt: string; // ISO
  renewalDay: number;

  lastRenewedAt: string | null;
  pointsExpireAt: string | null;
  renewedThisCycle: boolean;

  status: Status;
  smilesBonusEligibleAt: string | null;

  notes: string | null;

  createdAt: string;
  updatedAt: string;

  cedente: CedenteLite;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isoToInputDate(iso: string | null) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

function inputDateToISO(v: string) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function jfetch(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json?.ok) {
    throw new Error(json?.error || "Erro na requisição");
  }
  return json;
}

export default function ClubesClient({
  initialCedentes,
  initialClubes,
}: {
  initialCedentes: CedenteLite[];
  initialClubes: ClubeRow[];
}) {
  const [cedentes, setCedentes] = useState<CedenteLite[]>(initialCedentes || []);
  const [clubes, setClubes] = useState<ClubeRow[]>(initialClubes || []);

  const [q, setQ] = useState("");
  const [filterProgram, setFilterProgram] = useState<"" | Program>("");
  const [filterStatus, setFilterStatus] = useState<"" | Status>("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // form (criar/editar)
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyForm = useMemo(
    () => ({
      cedenteId: cedentes[0]?.id || "",
      program: "LATAM" as Program,
      tierK: 10,
      priceReais: "0",
      subscribedAt: isoToInputDate(new Date().toISOString()),
      renewalDay: 1,
      lastRenewedAt: "",
      pointsExpireAt: "",
      renewedThisCycle: false,
      status: "ACTIVE" as Status,
      smilesBonusEligibleAt: "",
      notes: "",
    }),
    [cedentes]
  );

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    // mantém o form coerente quando a lista de cedentes chega depois (fallback)
    setForm((f) => ({ ...emptyForm, ...f }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cedentes.length]);

  // ✅ fallback: se por algum motivo vier sem cedentes, busca um "lite" a partir do approved
  useEffect(() => {
    if (cedentes.length > 0) return;

    (async () => {
      try {
        const json = await jfetch("/api/cedentes/approved");
        const list = Array.isArray(json?.data) ? json.data : [];
        const lite: CedenteLite[] = list.map((r: any) => ({
          id: r.id,
          identificador: r.identificador,
          nomeCompleto: r.nomeCompleto,
          cpf: r.cpf,
        }));
        setCedentes(lite);
      } catch {
        // não explode UI; o form já vai bloquear se não tiver cedente
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return clubes.filter((c) => {
      if (filterProgram && c.program !== filterProgram) return false;
      if (filterStatus && c.status !== filterStatus) return false;

      if (!qq) return true;

      const hay = [
        c.cedente?.nomeCompleto,
        c.cedente?.identificador,
        c.cedente?.cpf,
        c.program,
        c.notes || "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [clubes, q, filterProgram, filterStatus]);

  function resetAlerts() {
    setErr(null);
    setMsg(null);
  }

  async function refresh() {
    resetAlerts();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterProgram) params.set("program", filterProgram);
      if (filterStatus) params.set("status", filterStatus);
      if (q.trim()) params.set("q", q.trim());

      const qs = params.toString();
      const json = await jfetch(qs ? `/api/clubes?${qs}` : "/api/clubes");
      setClubes(json.items || []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    resetAlerts();
    setEditingId(null);
    setForm(emptyForm);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(row: ClubeRow) {
    resetAlerts();
    setEditingId(row.id);
    setForm({
      cedenteId: row.cedenteId,
      program: row.program,
      tierK: row.tierK,
      priceReais: String((row.priceCents / 100).toFixed(2)).replace(".", ","),
      subscribedAt: isoToInputDate(row.subscribedAt),
      renewalDay: row.renewalDay,
      lastRenewedAt: isoToInputDate(row.lastRenewedAt),
      pointsExpireAt: isoToInputDate(row.pointsExpireAt),
      renewedThisCycle: row.renewedThisCycle,
      status: row.status,
      smilesBonusEligibleAt: isoToInputDate(row.smilesBonusEligibleAt),
      notes: row.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function parsePriceCentsFromReais(input: string) {
    // aceita: "1234,56" | "1.234,56" | "1234.56" | "1,234.56"
    let s = String(input || "").trim();
    if (!s) return 0;

    // remove R$, espaços e afins
    s = s.replace(/[R$\s]/gi, "");

    if (s.includes(",")) {
      // se tem vírgula, assume vírgula = decimal (pt-BR)
      // remove pontos de milhar, troca vírgula por ponto
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // sem vírgula: assume ponto = decimal (en-US)
      // remove vírgulas de milhar
      s = s.replace(/,/g, "");
    }

    const v = Number(s);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.round(v * 100));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    resetAlerts();
    setLoading(true);

    try {
      const payload: any = {
        cedenteId: form.cedenteId,
        program: form.program,
        tierK: Number(form.tierK) || 0,
        priceCents: parsePriceCentsFromReais(form.priceReais),
        subscribedAt: inputDateToISO(form.subscribedAt),
        renewalDay: Number(form.renewalDay) || 1,
        lastRenewedAt: form.lastRenewedAt ? inputDateToISO(form.lastRenewedAt) : null,
        pointsExpireAt: form.pointsExpireAt ? inputDateToISO(form.pointsExpireAt) : null,
        renewedThisCycle: Boolean(form.renewedThisCycle),
        status: form.status,
        smilesBonusEligibleAt:
          form.program === "SMILES" && form.smilesBonusEligibleAt
            ? inputDateToISO(form.smilesBonusEligibleAt)
            : null,
        notes: form.notes?.trim().slice(0, 500) || null,
      };

      if (!cedentes.length) throw new Error("Você precisa cadastrar/importar cedentes primeiro.");
      if (!payload.cedenteId) throw new Error("Escolha um cedente");
      if (!payload.subscribedAt) throw new Error("Data de assinatura inválida");
      payload.renewalDay = Math.min(31, Math.max(1, payload.renewalDay));

      if (!editingId) {
        const json = await jfetch("/api/clubes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setClubes((prev) => [json.item, ...prev]);
        setMsg("Clube criado ✅");
        setForm(emptyForm);
      } else {
        const json = await jfetch(`/api/clubes/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setClubes((prev) => prev.map((c) => (c.id === editingId ? json.item : c)));
        setMsg("Clube atualizado ✅");
      }
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  async function onCancel(row: ClubeRow) {
    resetAlerts();
    setLoading(true);
    try {
      const json = await jfetch(`/api/clubes/${row.id}`, { method: "DELETE" });
      setClubes((prev) => prev.map((c) => (c.id === row.id ? json.item : c)));
      setMsg("Clube cancelado ✅");
    } catch (e: any) {
      setErr(e?.message || "Erro ao cancelar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clubes</h1>
          <p className="text-sm text-neutral-500">
            Cadastre assinaturas (LATAM/SMILES/LIVELO/ESFERA) por cedente.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={startCreate}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
            type="button"
          >
            Novo clube
          </button>
          <button
            onClick={refresh}
            className="rounded-xl bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={loading}
            type="button"
          >
            {loading ? "Carregando..." : "Recarregar"}
          </button>
        </div>
      </div>

      {(msg || err) && (
        <div
          className={[
            "rounded-xl border px-3 py-2 text-sm",
            err
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700",
          ].join(" ")}
        >
          {err || msg}
        </div>
      )}

      {/* Form */}
      <form onSubmit={onSave} className="rounded-2xl border p-4 space-y-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {editingId ? "Editar clube" : "Cadastrar clube"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="text-xs text-neutral-500 hover:text-neutral-800"
            >
              sair do modo edição
            </button>
          )}
        </div>

        {!cedentes.length && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            Nenhum cedente disponível. Importe/cadastre cedentes primeiro.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-neutral-600">
            Cedente
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
              value={form.cedenteId}
              onChange={(e) => setForm((f) => ({ ...f, cedenteId: e.target.value }))}
              disabled={!cedentes.length}
            >
              {cedentes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeCompleto} — {c.identificador}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-neutral-600">
            Programa
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              value={form.program}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  program: e.target.value as Program,
                  smilesBonusEligibleAt: "",
                }))
              }
            >
              <option value="LATAM">LATAM</option>
              <option value="SMILES">SMILES</option>
              <option value="LIVELO">LIVELO</option>
              <option value="ESFERA">ESFERA</option>
            </select>
          </label>

          <label className="text-xs text-neutral-600">
            Status
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Status }))}
            >
              <option value="ACTIVE">ATIVO</option>
              <option value="PAUSED">PAUSADO</option>
              <option value="CANCELED">CANCELADO</option>
            </select>
          </label>

          <label className="text-xs text-neutral-600">
            Tier (K)
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              type="number"
              min={0}
              value={form.tierK}
              onChange={(e) =>
                setForm((f) => ({ ...f, tierK: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>

          <label className="text-xs text-neutral-600">
            Preço (R$)
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="ex: 129,90"
              value={form.priceReais}
              onChange={(e) => setForm((f) => ({ ...f, priceReais: e.target.value }))}
            />
          </label>

          <label className="text-xs text-neutral-600">
            Assinado em
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              type="date"
              value={form.subscribedAt}
              onChange={(e) => setForm((f) => ({ ...f, subscribedAt: e.target.value }))}
            />
          </label>

          <label className="text-xs text-neutral-600">
            Dia renovação (1-31)
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              type="number"
              min={1}
              max={31}
              value={form.renewalDay}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  renewalDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)),
                }))
              }
            />
          </label>

          <label className="text-xs text-neutral-600">
            Última renovação (opcional)
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              type="date"
              value={form.lastRenewedAt}
              onChange={(e) => setForm((f) => ({ ...f, lastRenewedAt: e.target.value }))}
            />
          </label>

          <label className="text-xs text-neutral-600">
            Expiração dos pontos (opcional)
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              type="date"
              value={form.pointsExpireAt}
              onChange={(e) => setForm((f) => ({ ...f, pointsExpireAt: e.target.value }))}
            />
          </label>

          <label className="text-xs text-neutral-600 flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={form.renewedThisCycle}
              onChange={(e) => setForm((f) => ({ ...f, renewedThisCycle: e.target.checked }))}
            />
            Renovou neste ciclo
          </label>

          {form.program === "SMILES" && (
            <label className="text-xs text-neutral-600 md:col-span-2">
              SMILES: elegível bônus novamente (opcional)
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                type="date"
                value={form.smilesBonusEligibleAt}
                onChange={(e) => setForm((f) => ({ ...f, smilesBonusEligibleAt: e.target.value }))}
              />
            </label>
          )}

          <label className="text-xs text-neutral-600 md:col-span-3">
            Observações (opcional)
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm min-h-[70px]"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            disabled={loading || !cedentes.length}
          >
            {loading ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar"}
          </button>
        </div>
      </form>

      {/* Filters */}
      <div className="rounded-2xl border p-4 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Buscar (nome, identificador, cpf, obs...)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value as any)}
          >
            <option value="">Todos programas</option>
            <option value="LATAM">LATAM</option>
            <option value="SMILES">SMILES</option>
            <option value="LIVELO">LIVELO</option>
            <option value="ESFERA">ESFERA</option>
          </select>

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
          >
            <option value="">Todos status</option>
            <option value="ACTIVE">ATIVO</option>
            <option value="PAUSED">PAUSADO</option>
            <option value="CANCELED">CANCELADO</option>
          </select>

          <button
            onClick={refresh}
            className="rounded-xl bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={loading}
            type="button"
          >
            Aplicar filtros
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-medium">
            Registros: <span className="text-neutral-600">{filtered.length}</span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-4 py-2">Cedente</th>
                <th className="text-left px-4 py-2">Programa</th>
                <th className="text-left px-4 py-2">Tier</th>
                <th className="text-left px-4 py-2">Preço</th>
                <th className="text-left px-4 py-2">Assinatura</th>
                <th className="text-left px-4 py-2">Renova</th>
                <th className="text-left px-4 py-2">Expira pts</th>
                <th className="text-left px-4 py-2">Bônus SMILES</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <div className="font-medium">{c.cedente?.nomeCompleto}</div>
                    <div className="text-xs text-neutral-500">
                      {c.cedente?.identificador} • CPF {c.cedente?.cpf}
                    </div>
                  </td>

                  <td className="px-4 py-2 font-medium">{c.program}</td>

                  <td className="px-4 py-2">{c.tierK}k</td>

                  <td className="px-4 py-2">{fmtMoneyBR(c.priceCents)}</td>

                  <td className="px-4 py-2">{isoToInputDate(c.subscribedAt)}</td>

                  <td className="px-4 py-2">
                    dia {c.renewalDay}
                    {c.renewedThisCycle ? (
                      <span className="ml-2 text-xs text-green-700">• renovou</span>
                    ) : (
                      <span className="ml-2 text-xs text-neutral-500">• pendente</span>
                    )}
                  </td>

                  <td className="px-4 py-2">
                    {c.pointsExpireAt ? isoToInputDate(c.pointsExpireAt) : "-"}
                  </td>

                  <td className="px-4 py-2">
                    {c.program === "SMILES" && c.smilesBonusEligibleAt
                      ? isoToInputDate(c.smilesBonusEligibleAt)
                      : "-"}
                  </td>

                  <td className="px-4 py-2">
                    <span
                      className={[
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                        c.status === "ACTIVE"
                          ? "border-green-200 bg-green-50 text-green-700"
                          : c.status === "PAUSED"
                          ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                          : "border-red-200 bg-red-50 text-red-700",
                      ].join(" ")}
                    >
                      {c.status}
                    </span>
                  </td>

                  <td className="px-4 py-2 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="rounded-lg border px-2 py-1 text-xs hover:bg-white"
                    >
                      Editar
                    </button>

                    {c.status !== "CANCELED" && (
                      <button
                        type="button"
                        onClick={() => onCancel(c)}
                        className="rounded-lg border px-2 py-1 text-xs hover:bg-white"
                        disabled={loading}
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {!filtered.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={10}>
                    Nenhum clube encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
