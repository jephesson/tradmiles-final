"use client";

import { useEffect, useMemo, useState } from "react";

type FormState = {
  nomeCompleto: string;
  dataNascimento: string;
  cpf: string;
};

function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}
function normalizeCpf(v: string) {
  return onlyDigits(v).slice(0, 11);
}

export default function ConviteCedentePage({ params }: { params: { token: string } }) {
  const code = params.token; // agora é CODE fixo, não token

  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState<FormState>({
    nomeCompleto: "",
    dataNascimento: "",
    cpf: "",
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // 🔹 GET serve só para hint (não bloqueia cadastro)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/convite/${code}`, { cache: "no-store" });
        const json = await res.json();

        if (json?.ok) {
          setForm((prev) => ({
            ...prev,
            nomeCompleto: json.data?.nomeHint ?? prev.nomeCompleto,
            cpf: json.data?.cpfHint ?? prev.cpf,
          }));
        }
      } catch {
        // silêncio total: link não bloqueia cadastro
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.nomeCompleto.trim()) return alert("Informe o nome completo.");
    if (normalizeCpf(form.cpf).length !== 11) return alert("CPF inválido.");
    if (!accepted) return alert("Você precisa aceitar o termo.");

    try {
      setSaving(true);

      const res = await fetch(`/api/convite/${code}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeCompleto: form.nomeCompleto.trim(),
          cpf: normalizeCpf(form.cpf),
          dataNascimento: form.dataNascimento || null,
          accepted: true,
        }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao cadastrar.");

      setDone(true);
    } catch (e: any) {
      alert(e?.message || "Erro ao finalizar cadastro.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Carregando...</div>;
  if (done) return <div className="p-6">Cadastro concluído ✅</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-4">Cadastro do cedente</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <input
          className="w-full border p-2"
          value={form.nomeCompleto}
          onChange={(e) => setField("nomeCompleto", e.target.value)}
          placeholder="Nome completo"
        />

        <input
          type="date"
          className="w-full border p-2"
          value={form.dataNascimento}
          onChange={(e) => setField("dataNascimento", e.target.value)}
        />

        <input
          className="w-full border p-2"
          value={form.cpf}
          onChange={(e) => setField("cpf", normalizeCpf(e.target.value))}
          placeholder="CPF (somente números)"
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          Li e aceito os termos.
        </label>

        <button
          disabled={saving}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {saving ? "Enviando..." : "Concluir cadastro"}
        </button>
      </form>
    </div>
  );
}
