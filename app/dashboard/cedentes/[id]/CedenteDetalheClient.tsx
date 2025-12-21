"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Owner = { id: string; name: string; login: string };

type Cedente = {
  id: string;
  identificador: string;

  nomeCompleto: string;
  cpf: string;

  telefone: string | null;
  dataNascimento: string | null; // vem do backend como ISO ou null
  emailCriado: string | null;

  banco: string | null;
  pixTipo: string | null;
  chavePix: string | null;

  // ✅ SENHAS (SEM ENC)
  senhaEmail: string | null;
  senhaSmiles: string | null;
  senhaLatamPass: string | null;
  senhaLivelo: string | null;
  senhaEsfera: string | null;

  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;

  owner?: Owner | null;

  // se existirem no teu GET
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function toISODateInput(v: string | null | undefined) {
  if (!v) return "";
  // se já vier YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  // yyyy-mm-dd para input type=date
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Erro ao carregar.");

      setData(json.data);
      setForm(json.data);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar.");
      setData(null);
      setForm(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function confirmPassword(): Promise<boolean> {
    const password = prompt("Digite sua senha para confirmar:");
    if (!password) return false;

    const res = await fetch("/api/auth/confirm-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const json = await res.json().catch(() => null);
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

      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Erro ao salvar.");

      setEditing(false);
      await load();
      alert("✅ Cedente atualizado com sucesso.");
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar.");
    }
  }

  const Input = ({
    label,
    value,
    onChange,
    type = "text",
    disabled,
  }: {
    label: string;
    value: any;
    onChange: (v: any) => void;
    type?: string;
    disabled?: boolean;
  }) => (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        disabled={disabled ?? !editing}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm disabled:bg-slate-50"
      />
    </div>
  );

  const NumberInput = ({
    label,
    value,
    onChange,
    disabled,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    disabled?: boolean;
  }) => (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled ?? !editing}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        className="w-full rounded border px-3 py-2 text-sm disabled:bg-slate-50"
      />
    </div>
  );

  const Secret = ({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) => {
    const [show, setShow] = useState(false);

    return (
      <div className="rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-600">{label}</div>
          <div className="flex gap-2">
            {value ? (
              <button
                type="button"
                className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
                onClick={() => setShow((s) => !s)}
              >
                {show ? "Ocultar" : "Mostrar"}
              </button>
            ) : null}

            {value ? (
              <button
                type="button"
                className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(value);
                    alert("✅ Copiado!");
                  } catch {
                    alert("Não consegui copiar.");
                  }
                }}
              >
                Copiar
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-2">
          <input
            type={show ? "text" : "password"}
            value={value ?? ""}
            disabled={!editing}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm disabled:bg-slate-50 font-mono"
            placeholder="—"
          />
        </div>
      </div>
    );
  };

  const ownerLabel = useMemo(() => {
    if (!form?.owner) return "-";
    return `${form.owner.name} (@${form.owner.login})`;
  }, [form?.owner]);

  if (loading) return <div className="p-6 text-sm">Carregando…</div>;
  if (!form) return <div className="p-6 text-sm">Cedente não encontrado.</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{form.nomeCompleto}</h1>
          <p className="text-sm text-slate-600">
            {form.identificador} • CPF: {form.cpf}
          </p>
          <p className="text-xs text-slate-500">Responsável: {ownerLabel}</p>
        </div>

        <div className="flex gap-2">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="rounded-xl border px-4 py-2 text-sm">
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
              <button onClick={salvar} className="rounded-xl bg-black px-4 py-2 text-sm text-white">
                💾 Salvar
              </button>
            </>
          )}

          <button onClick={() => router.back()} className="rounded-xl border px-4 py-2 text-sm">
            Voltar
          </button>
        </div>
      </div>

      {/* DADOS PRINCIPAIS */}
      <section className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Identificador"
          value={form.identificador}
          onChange={(v) => setForm({ ...form, identificador: v })}
          disabled={!editing} // pode deixar true se você nunca quer editar
        />
        <Input
          label="CPF"
          value={form.cpf}
          onChange={(v) => setForm({ ...form, cpf: v })}
          disabled={true} // recomendo NÃO editar CPF
        />

        <Input
          label="Nome completo"
          value={form.nomeCompleto}
          onChange={(v) => setForm({ ...form, nomeCompleto: v })}
        />
        <Input
          label="Telefone"
          value={form.telefone}
          onChange={(v) => setForm({ ...form, telefone: v })}
        />

        <Input
          label="Email criado"
          value={form.emailCriado}
          onChange={(v) => setForm({ ...form, emailCriado: v })}
        />

        <Input
          label="Data de nascimento"
          type="date"
          value={toISODateInput(form.dataNascimento)}
          onChange={(v) => {
            // guarda como string YYYY-MM-DD (backend pode parsear)
            setForm({ ...form, dataNascimento: v || null });
          }}
        />
      </section>

      {/* BANCO / PIX */}
      <section className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Banco" value={form.banco} onChange={(v) => setForm({ ...form, banco: v })} />
        <Input label="Pix tipo" value={form.pixTipo} onChange={(v) => setForm({ ...form, pixTipo: v })} />
        <Input label="Chave Pix" value={form.chavePix} onChange={(v) => setForm({ ...form, chavePix: v })} />
      </section>

      {/* SENHAS */}
      <section className="rounded-xl border p-4 space-y-3">
        <div className="text-sm font-semibold">Senhas (interno)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Secret
            label="Senha Email"
            value={form.senhaEmail}
            onChange={(v) => setForm({ ...form, senhaEmail: v })}
          />
          <Secret
            label="Senha Smiles"
            value={form.senhaSmiles}
            onChange={(v) => setForm({ ...form, senhaSmiles: v })}
          />
          <Secret
            label="Senha LATAM Pass"
            value={form.senhaLatamPass}
            onChange={(v) => setForm({ ...form, senhaLatamPass: v })}
          />
          <Secret
            label="Senha Livelo"
            value={form.senhaLivelo}
            onChange={(v) => setForm({ ...form, senhaLivelo: v })}
          />
          <Secret
            label="Senha Esfera"
            value={form.senhaEsfera}
            onChange={(v) => setForm({ ...form, senhaEsfera: v })}
          />
        </div>
      </section>

      {/* PONTOS */}
      <section className="rounded-xl border p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumberInput label="LATAM" value={form.pontosLatam} onChange={(v) => setForm({ ...form, pontosLatam: v })} />
        <NumberInput
          label="Smiles"
          value={form.pontosSmiles}
          onChange={(v) => setForm({ ...form, pontosSmiles: v })}
        />
        <NumberInput
          label="Livelo"
          value={form.pontosLivelo}
          onChange={(v) => setForm({ ...form, pontosLivelo: v })}
        />
        <NumberInput
          label="Esfera"
          value={form.pontosEsfera}
          onChange={(v) => setForm({ ...form, pontosEsfera: v })}
        />
      </section>

      {/* INFO EXTRA */}
      <section className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Status" value={(form as any).status ?? ""} onChange={() => {}} disabled />
        <Input label="Criado em" value={(form as any).createdAt ?? ""} onChange={() => {}} disabled />
        <Input label="Atualizado em" value={(form as any).updatedAt ?? ""} onChange={() => {}} disabled />
      </section>
    </div>
  );
}
