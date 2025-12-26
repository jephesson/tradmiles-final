"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ClienteTipo = "PESSOA" | "EMPRESA";
type ClienteOrigem = "BALCAO_MILHAS" | "PARTICULAR" | "SITE" | "OUTROS";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
  rightSlot,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-slate-600">{label}</div>
        {rightSlot ? <div className="text-xs text-slate-500">{rightSlot}</div> : null}
      </div>
      <input
        className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
      />
      {hint ? <div className="text-[11px] text-slate-500">{hint}</div> : null}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="space-y-1">
      <div className="text-xs text-slate-600">{label}</div>
      <select
        className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      {hint ? <div className="text-[11px] text-slate-500">{hint}</div> : null}
    </label>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border bg-white px-2 py-1 text-[11px] text-slate-600">
      {children}
    </span>
  );
}

export default function ClienteNovoClient() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [tipo, setTipo] = useState<ClienteTipo>("PESSOA");
  const [nome, setNome] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [origem, setOrigem] = useState<ClienteOrigem>("PARTICULAR");
  const [origemDescricao, setOrigemDescricao] = useState("");

  const labelNome = tipo === "EMPRESA" ? "Nome da empresa" : "Nome do cliente";

  const cpfCnpjHint = useMemo(() => {
    const d = onlyDigits(cpfCnpj);
    if (!d) return "Opcional";
    if (d.length === 11) return "CPF detectado (11 dígitos)";
    if (d.length === 14) return "CNPJ detectado (14 dígitos)";
    return "Digite 11 (CPF) ou 14 (CNPJ) dígitos";
  }, [cpfCnpj]);

  const telHint = useMemo(() => {
    const d = onlyDigits(telefone);
    if (!d) return "Opcional";
    if (d.length >= 10 && d.length <= 13) return "Ok";
    return "Tamanho inválido";
  }, [telefone]);

  async function salvar() {
    const nomeTrim = nome.trim();
    if (!nomeTrim) return alert("Informe o nome (ou empresa).");

    if (origem === "OUTROS" && !origemDescricao.trim()) {
      return alert("Em 'Outros', descreva a origem.");
    }

    const doc = onlyDigits(cpfCnpj);
    if (doc && doc.length !== 11 && doc.length !== 14) {
      return alert("CPF/CNPJ inválido (11 ou 14 dígitos).");
    }

    const tel = onlyDigits(telefone);
    if (tel && (tel.length < 10 || tel.length > 13)) {
      return alert("Telefone inválido.");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          nome: nomeTrim,
          cpfCnpj: doc || null,
          telefone: tel || null,
          origem,
          origemDescricao: origem === "OUTROS" ? origemDescricao.trim() : null,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || "Falha ao criar cliente.");
      }

      const identificador = j?.data?.cliente?.identificador;
      alert(`✅ Cliente criado: ${identificador || "OK"}`);

      // Ajuste se tua listagem for outro caminho
      router.push("/dashboard/clientes");
      router.refresh();
    } catch (e: any) {
      alert(e?.message || "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Novo cliente</h1>
          <p className="text-sm text-slate-600">
            Cliente é quem compra os pontos. Campos opcionais ajudam na organização.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip>ID automático: CL00001…</Chip>
            <Chip>CPF/CNPJ opcional</Chip>
            <Chip>Telefone opcional</Chip>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => router.back()}
            className="rounded-xl border bg-white px-4 py-2 text-sm hover:bg-slate-50"
            disabled={saving}
          >
            Voltar
          </button>
          <button
            onClick={salvar}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Salvando..." : "Salvar cliente"}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Col 1 */}
          <div className="space-y-4 lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Tipo"
                value={tipo}
                onChange={(v) => setTipo(v as ClienteTipo)}
                hint="Pessoa ou empresa"
              >
                <option value="PESSOA">Pessoa</option>
                <option value="EMPRESA">Empresa</option>
              </Select>

              <Select
                label="Origem"
                value={origem}
                onChange={(v) => setOrigem(v as ClienteOrigem)}
                hint="De onde veio esse cliente"
              >
                <option value="BALCAO_MILHAS">Balcão de milhas</option>
                <option value="PARTICULAR">Particular</option>
                <option value="SITE">Site</option>
                <option value="OUTROS">Outros</option>
              </Select>
            </div>

            <Field
              label={labelNome}
              value={nome}
              onChange={setNome}
              placeholder={tipo === "EMPRESA" ? "Ex: ACME LTDA" : "Ex: João da Silva"}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="CPF/CNPJ (opcional)"
                value={cpfCnpj}
                onChange={setCpfCnpj}
                placeholder="Somente números"
                rightSlot={<span>{cpfCnpjHint}</span>}
              />
              <Field
                label="Telefone (opcional)"
                value={telefone}
                onChange={setTelefone}
                placeholder="DDD + número"
                rightSlot={<span>{telHint}</span>}
              />
            </div>

            {origem === "OUTROS" ? (
              <Field
                label="Descreva a origem"
                value={origemDescricao}
                onChange={setOrigemDescricao}
                placeholder="Ex: indicação, parceria, anúncio..."
                hint="Obrigatório quando Origem = Outros"
              />
            ) : null}
          </div>

          {/* Col 2 (Resumo) */}
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm font-semibold">Resumo</div>
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Tipo</span>
                <b>{tipo === "EMPRESA" ? "Empresa" : "Pessoa"}</b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Origem</span>
                <b>
                  {origem === "BALCAO_MILHAS"
                    ? "Balcão"
                    : origem === "PARTICULAR"
                    ? "Particular"
                    : origem === "SITE"
                    ? "Site"
                    : "Outros"}
                </b>
              </div>
              <div className="border-t pt-2 text-xs text-slate-600">
                Ao salvar, o sistema gera um ID único (CL00001...).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
