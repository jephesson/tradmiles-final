"use client";

import { useEffect, useMemo, useState } from "react";

type HintData = {
  nomeHint: string | null;
  cpfHint: string | null;
};

type FormState = {
  nomeCompleto: string;
  dataNascimento: string; // yyyy-mm-dd
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
  const [error, setError] = useState<string>("");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const res = await fetch(`/api/cedentes/invites/${token}`, { cache: "no-store" });
        const json = await res.json();

        if (!json?.ok) {
          setValid(false);
          setError(json?.error || "Convite inválido.");
          return;
        }

        const data = json.data as HintData;
        setHint(data);
        setValid(true);

        setForm((prev) => ({
          ...prev,
          nomeCompleto: data.nomeHint ?? prev.nomeCompleto,
          cpf: data.cpfHint ?? prev.cpf,
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
    if (!valid) return;

    if (!form.nomeCompleto.trim()) return alert("Informe o nome completo.");
    if (normalizeCpf(form.cpf).length !== 11) return alert("CPF inválido (11 dígitos).");
    if (!accepted) return alert("Você precisa aceitar o termo para finalizar.");

    try {
      setSaving(true);

      const payload = {
        identificador: makeIdentifier(form.nomeCompleto),
        nomeCompleto: form.nomeCompleto.trim(),
        cpf: normalizeCpf(form.cpf),
        dataNascimento: form.dataNascimento ? form.dataNascimento : null,

        emailCriado: form.emailCriado.trim() || null,
        chavePix: form.chavePix.trim() || null,
        banco: form.banco.trim() || null,

        // sem criptografia (como você pediu)
        senhaEmailEnc: form.senhaEmail || null,
        senhaSmilesEnc: form.senhaSmiles || null,
        senhaLatamPassEnc: form.senhaLatamPass || null,
        senhaLiveloEnc: form.senhaLivelo || null,
        senhaEsferaEnc: form.senhaEsfera || null,

        pontosLatam: Number(form.pontosLatam || 0),
        pontosSmiles: Number(form.pontosSmiles || 0),
        pontosLivelo: Number(form.pontosLivelo || 0),
        pontosEsfera: Number(form.pontosEsfera || 0),

        // aceite
        accepted: true,
      };

      const res = await fetch(`/api/cedentes/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao finalizar cadastro.");

      setDone(true);
    } catch (err: any) {
      alert(err?.message || "Erro ao finalizar cadastro.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Cadastro do cedente</h1>
        <p className="mt-2 text-sm text-slate-600">Validando convite...</p>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Convite inválido</h1>
        <p className="mt-2 text-sm text-red-600">{error || "Este link não é válido, expirou ou já foi usado."}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Cadastro concluído ✅</h1>
        <p className="mt-2 text-sm text-slate-600">
          Obrigado! Seu cadastro foi enviado para a equipe do Vias Aéreas / TradeMiles.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Cadastro do cedente</h1>
      <p className="mb-6 text-sm text-slate-600">
        Preencha os dados abaixo. Ao final, leia e aceite o termo para concluir.
      </p>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-semibold">Dados</h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Nome completo</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.nomeCompleto}
                onChange={(e) => setField("nomeCompleto", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm">Data de nascimento</label>
              <input
                type="date"
                className="w-full rounded-xl border px-3 py-2"
                value={form.dataNascimento}
                onChange={(e) => setField("dataNascimento", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm">CPF</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.cpf}
                onChange={(e) => setField("cpf", normalizeCpf(e.target.value))}
                placeholder="Somente números"
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Pré-preenchido do convite: {hint.cpfHint ? "sim" : "não"}.
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm">Identificador (prévia)</label>
              <input className="w-full rounded-xl border px-3 py-2" value={identificadorPreview} readOnly />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-semibold">Acessos e dados bancários</h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">E-mail criado</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.emailCriado} onChange={(e) => setField("emailCriado", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Senha do e-mail</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaEmail} onChange={(e) => setField("senhaEmail", e.target.value)} />
            </div>

            <div>
              <label className="mb-1 block text-sm">Senha Smiles</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaSmiles} onChange={(e) => setField("senhaSmiles", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Senha Latam Pass</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaLatamPass} onChange={(e) => setField("senhaLatamPass", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Senha Livelo</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaLivelo} onChange={(e) => setField("senhaLivelo", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Senha Esfera</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaEsfera} onChange={(e) => setField("senhaEsfera", e.target.value)} />
            </div>

            <div>
              <label className="mb-1 block text-sm">Chave PIX</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.chavePix} onChange={(e) => setField("chavePix", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Banco</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.banco} onChange={(e) => setField("banco", e.target.value)} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-semibold">Pontos</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FieldNumber label="Latam" value={form.pontosLatam} onChange={(v) => setField("pontosLatam", v)} />
            <FieldNumber label="Smiles" value={form.pontosSmiles} onChange={(v) => setField("pontosSmiles", v)} />
            <FieldNumber label="Livelo" value={form.pontosLivelo} onChange={(v) => setField("pontosLivelo", v)} />
            <FieldNumber label="Esfera" value={form.pontosEsfera} onChange={(v) => setField("pontosEsfera", v)} />
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <h2 className="mb-2 font-semibold">Termo de ciência</h2>
          <p className="mb-3 text-sm text-slate-600">
            Leia o termo e marque a caixa para concluir.
          </p>

          {/* Ajuste aqui se você quiser abrir o PDF em outra rota. */}
          <a
            href="/TERMO_CIENCIA_AUTORIZACAO_VIAS_AEREAS_COMPLETO_ATUALIZADO.pdf"
            target="_blank"
            rel="noreferrer"
            className="text-sm underline"
          >
            Abrir termo em PDF
          </a>

          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1"
            />
            <span>Li e declaro que concordo com os termos.</span>
          </label>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
        >
          {saving ? "Enviando..." : "Concluir cadastro"}
        </button>
      </form>
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm">{label}</label>
      <input
        type="number"
        min={0}
        className="w-full rounded-xl border px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </div>
  );
}
