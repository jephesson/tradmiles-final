"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Funcionario = {
  id: string;
  nomeCompleto: string | null;
  login: string | null;
  cpf: string | null;
  time: string | null;
  conviteSlug: string | null;
};

export default function EditFuncionarioClient({ id }: { id: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    nomeCompleto: "",
    login: "",
    cpf: "",
    time: "@vias_aereas",
    conviteSlug: "",
  });

  const conviteLink = useMemo(() => {
    const slug = form.conviteSlug?.trim();
    if (!slug) return "";
    return `https://www.trademiles.com.br/convite/${slug}`;
  }, [form.conviteSlug]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/funcionarios/${id}`, { cache: "no-store" });
        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Não encontrado");
        }

        const f: Funcionario = json.data;

        if (!mounted) return;

        setForm({
          nomeCompleto: f.nomeCompleto ?? "",
          login: f.login ?? "",
          cpf: f.cpf ?? "",
          time: f.time ?? "@vias_aereas",
          conviteSlug: f.conviteSlug ?? "",
        });
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Erro ao carregar");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  async function onSave() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/funcionarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Erro ao salvar");
      }

      // volta pra listagem ou só dá refresh
      router.push("/dashboard/funcionarios");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Editar funcionário</h1>
        <div className="mt-4 rounded-2xl border p-4">Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Editar funcionário</h1>
        <div className="mt-4 rounded-2xl border p-4">
          <p className="font-medium">Erro:</p>
          <p className="mt-1 text-sm opacity-80">{error}</p>

          <div className="mt-4 flex gap-2">
            <button
              className="rounded-xl border px-4 py-2"
              onClick={() => router.push("/dashboard/funcionarios")}
            >
              Voltar
            </button>
            <button
              className="rounded-xl border px-4 py-2"
              onClick={() => router.refresh()}
            >
              Tentar de novo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Editar funcionário</h1>

        <div className="flex gap-2">
          <button
            className="rounded-xl border px-4 py-2"
            onClick={() => router.push("/dashboard/funcionarios")}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Nome completo"
            value={form.nomeCompleto}
            onChange={(v) => setForm((s) => ({ ...s, nomeCompleto: v }))}
          />

          <Field
            label="Login"
            value={form.login}
            onChange={(v) => setForm((s) => ({ ...s, login: v }))}
          />

          <Field
            label="CPF"
            value={form.cpf}
            onChange={(v) => setForm((s) => ({ ...s, cpf: v }))}
          />

          <Field
            label="Time (ex: @vias_aereas)"
            value={form.time}
            onChange={(v) => setForm((s) => ({ ...s, time: v }))}
          />

          <Field
            label="Slug do convite (ex: conv-lucas)"
            value={form.conviteSlug}
            onChange={(v) => setForm((s) => ({ ...s, conviteSlug: v }))}
          />
        </div>

        <div className="mt-5 rounded-xl border p-4">
          <p className="text-sm font-medium">Link convite</p>
          <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
            <input
              className="w-full rounded-xl border px-3 py-2"
              readOnly
              value={conviteLink || "—"}
            />
            <button
              className="rounded-xl border px-4 py-2"
              onClick={() => {
                if (!conviteLink) return;
                navigator.clipboard.writeText(conviteLink);
              }}
              disabled={!conviteLink}
            >
              Copiar
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border p-3">
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="mt-1 w-full rounded-xl border px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
