"use client";

import { useEffect, useMemo, useState } from "react";

type HintData = {
  nomeHint: string | null;
  cpfHint: string | null;
};

type FormState = {
  nomeCompleto: string;
  dataNascimento: string;
  cpf: string;

  emailCriado: string;
  senhaEmail: string;

  senhaSmiles: string;
  senhaLatamPass: string;
  senhaLivelo: string;
  senhaEsfera: string;

  chavePix: string;
  banco: string;

  pontosLatam: number | "";
  pontosSmiles: number | "";
  pontosLivelo: number | "";
  pontosEsfera: number | "";
};

function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}
function normalizeCpf(v: string) {
  return onlyDigits(v).slice(0, 11);
}

function makeIdentifier(nomeCompleto: string) {
  const cleaned = nomeCompleto
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .trim();
  const base = (cleaned.split(/\s+/)[0] || "CED").replace(/[^A-Z0-9]/g, "");
  const prefix = (base.slice(0, 3) || "CED").padEnd(3, "X");
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

export default function ConviteCedentePage({ params }: { params: { token: string } }) {
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [hint, setHint] = useState<HintData>({ nomeHint: null, cpfHint: null });
  const [error, setError] = useState("");

  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState<FormState>({
    nomeCompleto: "",
    dataNascimento: "",
    cpf: "",
    emailCriado: "",
    senhaEmail: "",
    senhaSmiles: "",
    senhaLatamPass: "",
    senhaLivelo: "",
    senhaEsfera: "",
    chavePix: "",
    banco: "",
    pontosLatam: "",
    pontosSmiles: "",
    pontosLivelo: "",
    pontosEsfera: "",
  });

  const identificadorPreview = useMemo(
    () => (form.nomeCompleto.trim() ? makeIdentifier(form.nomeCompleto) : ""),
    [form.nomeCompleto]
  );

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/convite/${token}`, { cache: "no-store" });
        const json = await res.json();

        if (!json?.ok) {
          setValid(false);
          setError(json?.error || "Convite inválido.");
          return;
        }

        setHint(json.data);
        setValid(true);

        setForm((prev) => ({
          ...prev,
          nomeCompleto: json.data.nomeHint ?? prev.nomeCompleto,
          cpf: json.data.cpfHint ?? prev.cpf,
        }));
      } catch (e: any) {
        setValid(false);
        setError(e?.message || "Erro ao validar convite.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted) return alert("Você precisa aceitar o termo.");

    try {
      setSaving(true);

      const res = await fetch(`/api/convite/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, accepted: true }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro");

      setDone(true);
    } catch (e: any) {
      alert(e?.message || "Erro ao finalizar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Validando convite...</div>;
  if (!valid) return <div className="p-6 text-red-600">{error}</div>;
  if (done) return <div className="p-6">Cadastro concluído ✅</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-4">Cadastro do cedente</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <input className="w-full border p-2" value={form.nomeCompleto} onChange={(e) => setField("nomeCompleto", e.target.value)} placeholder="Nome completo" />
        <input type="date" className="w-full border p-2" value={form.dataNascimento} onChange={(e) => setField("dataNascimento", e.target.value)} />
        <input className="w-full border p-2" value={form.cpf} onChange={(e) => setField("cpf", normalizeCpf(e.target.value))} placeholder="CPF" />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          Aceito os termos
        </label>

        <button disabled={saving} className="bg-black text-white px-4 py-2 rounded">
          {saving ? "Enviando..." : "Concluir cadastro"}
        </button>
      </form>
    </div>
  );
}
