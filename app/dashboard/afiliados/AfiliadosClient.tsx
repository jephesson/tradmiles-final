"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AffiliateRow = {
  id: string;
  name: string;
  document: string;
  flightSalesLink: string | null;
  pointsPurchaseLink: string | null;
  commissionBps: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { clients?: number };
};

type FormState = {
  name: string;
  document: string;
  flightSalesLink: string;
  pointsPurchaseLink: string;
  commissionPercent: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  document: "",
  flightSalesLink: "",
  pointsPurchaseLink: "",
  commissionPercent: "",
  isActive: true,
};

function onlyDigits(value: string) {
  return (value || "").replace(/\D+/g, "");
}

function formatDocument(value: string) {
  const digits = onlyDigits(value);
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return value || "-";
}

function formatPercent(bps: number) {
  return `${(bps / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function dateBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  optional,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  optional?: boolean;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-600">{label}</div>
        {optional ? <div className="text-[11px] text-slate-400">Opcional</div> : null}
      </div>
      <input
        type={type}
        className="w-full rounded-xl border px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export default function AfiliadosClient() {
  const [rows, setRows] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const editing = useMemo(
    () => rows.find((row) => row.id === editingId) || null,
    [editingId, rows]
  );

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());

      const r = await fetch(`/api/afiliados?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar afiliados.");
      setRows(j.data.affiliates || []);
    } catch (e: unknown) {
      setRows([]);
      setError(errorMessage(e, "Erro ao carregar afiliados."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      load(q);
    }, 250);
    return () => clearTimeout(timer);
  }, [load, q]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function startEdit(row: AffiliateRow) {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      document: row.document || "",
      flightSalesLink: row.flightSalesLink || "",
      pointsPurchaseLink: row.pointsPurchaseLink || "",
      commissionPercent: String(row.commissionBps / 100).replace(".", ","),
      isActive: row.isActive,
    });
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        document: onlyDigits(form.document),
        flightSalesLink: form.flightSalesLink.trim() || null,
        pointsPurchaseLink: form.pointsPurchaseLink.trim() || null,
        commissionPercent: form.commissionPercent.trim(),
        isActive: form.isActive,
      };

      const r = await fetch(editingId ? `/api/afiliados/${editingId}` : "/api/afiliados", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao salvar afiliado.");

      startNew();
      await load(q);
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao salvar afiliado."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: AffiliateRow) {
    setError("");
    try {
      const r = await fetch(`/api/afiliados/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao alterar status.");
      await load(q);
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao alterar status."));
    }
  }

  const canSave =
    form.name.trim().length > 1 &&
    (onlyDigits(form.document).length === 11 || onlyDigits(form.document).length === 14) &&
    form.flightSalesLink.trim().length > 0 &&
    form.pointsPurchaseLink.trim().length > 0 &&
    form.commissionPercent.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Afiliados</h1>
          <p className="text-sm text-slate-600">
            Parceiros que indicam venda de passagens e compra de pontos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => load(q)}
            disabled={loading}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <button
            type="button"
            onClick={startNew}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            Novo afiliado
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">
              {editing ? "Editar afiliado" : "Cadastrar afiliado"}
            </h2>
            <p className="text-xs text-slate-500">
              A comissão fica salva no afiliado e poderá ser usada nas vendas futuras.
            </p>
          </div>
          {editing ? (
            <span className="rounded-full border px-3 py-1 text-xs text-slate-600">
              Editando {editing.name}
            </span>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Nome"
            value={form.name}
            onChange={(value) => setField("name", value)}
            placeholder="Ex: Agência parceira / João Silva"
          />
          <Input
            label="CPF/CNPJ"
            value={form.document}
            onChange={(value) => setField("document", value)}
            placeholder="Somente números ou formatado"
          />
          <Input
            label="Link para venda de passagens"
            value={form.flightSalesLink}
            onChange={(value) => setField("flightSalesLink", value)}
            placeholder="https://..."
            type="url"
          />
          <Input
            label="Link para compra de pontos"
            value={form.pointsPurchaseLink}
            onChange={(value) => setField("pointsPurchaseLink", value)}
            placeholder="https://..."
            type="url"
          />
          <Input
            label="Percentual de comissão"
            value={form.commissionPercent}
            onChange={(value) => setField("commissionPercent", value)}
            placeholder="Ex: 5 ou 2,5"
          />
          <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
            />
            Afiliado ativo
          </label>
        </div>

        {error ? <div className="text-sm text-rose-600">{error}</div> : null}

        <div className="flex flex-wrap justify-end gap-2">
          {editing ? (
            <button
              type="button"
              onClick={startNew}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar edição
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Lista de afiliados</h2>
            <p className="text-xs text-slate-500">
              {rows.length} registro(s) encontrado(s)
            </p>
          </div>
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm sm:max-w-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ ou link..."
          />
        </div>

        {rows.length === 0 ? (
          <div className="text-sm text-slate-600">
            {loading ? "Carregando afiliados..." : "Nenhum afiliado cadastrado ainda."}
          </div>
        ) : (
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-left">CPF/CNPJ</th>
                  <th className="px-3 py-2 text-left">Comissão</th>
                  <th className="px-3 py-2 text-left">Links</th>
                  <th className="px-3 py-2 text-left">Clientes</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Criado em</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    <td className="px-3 py-2">{formatDocument(row.document)}</td>
                    <td className="px-3 py-2">{formatPercent(row.commissionBps)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {row.flightSalesLink ? (
                          <a
                            href={row.flightSalesLink}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border px-2 py-1 text-xs hover:bg-white"
                          >
                            Passagens
                          </a>
                        ) : null}
                        {row.pointsPurchaseLink ? (
                          <a
                            href={row.pointsPurchaseLink}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border px-2 py-1 text-xs hover:bg-white"
                          >
                            Pontos
                          </a>
                        ) : null}
                        {!row.flightSalesLink && !row.pointsPurchaseLink ? "-" : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">{row._count?.clients || 0}</td>
                    <td className="px-3 py-2">
                      <span
                        className={[
                          "rounded-full px-2 py-1 text-xs",
                          row.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600",
                        ].join(" ")}
                      >
                        {row.isActive ? "ATIVO" : "INATIVO"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{dateBR(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(row)}
                          className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white"
                        >
                          {row.isActive ? "Inativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
