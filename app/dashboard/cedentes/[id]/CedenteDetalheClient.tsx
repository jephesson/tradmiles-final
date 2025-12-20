"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Cedente = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;

  telefone: string | null;
  dataNascimento: string | null;
  emailCriado: string | null;

  banco: string | null;
  pixTipo: string | null;
  chavePix: string | null;

  senhaEmailEnc: string | null;
  senhaSmilesEnc: string | null;
  senhaLatamPassEnc: string | null;
  senhaLiveloEnc: string | null;
  senhaEsferaEnc: string | null;

  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;

  owner?: { id: string; name: string; login: string } | null;
};

export default function CedenteDetalheClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<Cedente | null>(null);
  const [form, setForm] = useState<Cedente | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/cedentes/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error);
      setData(json.data);
      setForm(json.data);
    } catch (e: any) {
      alert(e.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function confirmPassword(): Promise<boolean> {
    const password = prompt("Digite sua senha para confirmar:");
    if (!password) return false;

    const res = await fetch("/api/auth/confirm-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const json = await res.json();
    if (!json?.ok) {
      alert("Senha inválida.");
      return false;
    }
    return true;
  }

  async function salvar() {
    if (!form) return;
    if (!(await confirmPassword())) return;

    try {
      const res = await fetch(`/api/cedentes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error);

      setEditing(false);
      load();
      alert("✅ Cedente atualizado com sucesso.");
    } catch (e: any) {
      alert(e.message || "Erro ao salvar.");
    }
  }

  if (loading) return <div className="p-6 text-sm">Carregando…</div>;
  if (!form) return <div className="p-6 text-sm">Cedente não encontrado.</div>;

  const Input = ({
    label,
    value,
    onChange,
    type = "text",
  }: {
    label: string;
    value: any;
    onChange: (v: any) => void;
    type?: string;
  }) => (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        disabled={!editing}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm disabled:bg-slate-50"
      />
    </div>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold">{form.nomeCompleto}</h1>
          <p className="text-sm text-slate-600">
            {form.identificador} • CPF: {form.cpf}
          </p>
        </div>

        <div className="flex gap-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="rounded-xl border px-4 py-2 text-sm"
            >
              ✏️ Editar
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setForm(data);
                  setEditing(false);
                }}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                className="rounded-xl bg-black px-4 py-2 text-sm text-white"
              >
                💾 Salvar
              </button>
            </>
          )}

          <button
            onClick={() => router.back()}
            className="rounded-xl border px-4 py-2 text-sm"
          >
            Voltar
          </button>
        </div>
      </div>

      <section className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Nome completo" value={form.nomeCompleto} onChange={(v) => setForm({ ...form, nomeCompleto: v })} />
        <Input label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
        <Input label="Email criado" value={form.emailCriado} onChange={(v) => setForm({ ...form, emailCriado: v })} />
        <Input label="Banco" value={form.banco} onChange={(v) => setForm({ ...form, banco: v })} />
        <Input label="Pix tipo" value={form.pixTipo} onChange={(v) => setForm({ ...form, pixTipo: v })} />
        <Input label="Chave Pix" value={form.chavePix} onChange={(v) => setForm({ ...form, chavePix: v })} />
      </section>

      <section className="rounded-xl border p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Input label="LATAM" type="number" value={form.pontosLatam} onChange={(v) => setForm({ ...form, pontosLatam: Number(v) })} />
        <Input label="Smiles" type="number" value={form.pontosSmiles} onChange={(v) => setForm({ ...form, pontosSmiles: Number(v) })} />
        <Input label="Livelo" type="number" value={form.pontosLivelo} onChange={(v) => setForm({ ...form, pontosLivelo: Number(v) })} />
        <Input label="Esfera" type="number" value={form.pontosEsfera} onChange={(v) => setForm({ ...form, pontosEsfera: Number(v) })} />
      </section>
    </div>
  );
}
