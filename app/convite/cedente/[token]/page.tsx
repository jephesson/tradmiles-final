"use client";

import { useEffect, useMemo, useState } from "react";

type FormState = {
  nomeCompleto: string;
  dataNascimento: string;
  cpf: string;

  emailCriado: string;
  senhaEmailEnc: string;

  senhaSmilesEnc: string;
  senhaLatamPassEnc: string;
  senhaLiveloEnc: string;
  senhaEsferaEnc: string;

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

export default function CedenteInvitePage({ params }: { params: { token: string } }) {
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [inviteError, setInviteError] = useState<string>("");

  const [form, setForm] = useState<FormState>({
    nomeCompleto: "",
    dataNascimento: "",
    cpf: "",
    emailCriado: "",
    senhaEmailEnc: "",
    senhaSmilesEnc: "",
    senhaLatamPassEnc: "",
    senhaLiveloEnc: "",
    senhaEsferaEnc: "",
    chavePix: "",
    banco: "",
    pontosLatam: "",
    pontosSmiles: "",
    pontosLivelo: "",
    pontosEsfera: "",
  });

  const [accepting, setAccepting] = useState(false);
  const [termoAceito, setTermoAceito] = useState(false);

  // você pode mudar a versão quando atualizar o PDF/termo
  const termoVersao = "v1";

  const cpfOk = useMemo(() => normalizeCpf(form.cpf).length === 11, [form.cpf]);

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setInviteError("");

        const res = await fetch(`/api/cedentes/invites/${token}`, { cache: "no-store" });
        const json = await res.json();

        if (!json?.ok) throw new Error(json?.error || "Convite inválido");

        const nomeHint = json.data?.nomeHint ?? "";
        const cpfHint = json.data?.cpfHint ?? "";

        setForm((prev) => ({
          ...prev,
          nomeCompleto: prev.nomeCompleto || nomeHint,
          cpf: prev.cpf || cpfHint,
        }));
      } catch (e: any) {
        setInviteError(e?.message || "Erro ao carregar convite");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nomeCompleto.trim()) return alert("Informe o nome completo.");
    if (!cpfOk) return alert("CPF inválido (11 dígitos).");
    if (!termoAceito) return alert("Você precisa aceitar o termo.");

    try {
      setAccepting(true);

      const payload = {
        nomeCompleto: form.nomeCompleto.trim(),
        cpf: normalizeCpf(form.cpf),
        dataNascimento: form.dataNascimento ? form.dataNascimento : null,

        emailCriado: form.emailCriado.trim() || null,
        chavePix: form.chavePix.trim() || null,
        banco: form.banco.trim() || null,

        // sem criptografia (como você pediu)
        senhaEmailEnc: form.senhaEmailEnc || null,
        senhaSmilesEnc: form.senhaSmilesEnc || null,
        senhaLatamPassEnc: form.senhaLatamPassEnc || null,
        senhaLiveloEnc: form.senhaLiveloEnc || null,
        senhaEsferaEnc: form.senhaEsferaEnc || null,

        pontosLatam: Number(form.pontosLatam || 0),
        pontosSmiles: Number(form.pontosSmiles || 0),
        pontosLivelo: Number(form.pontosLivelo || 0),
        pontosEsfera: Number(form.pontosEsfera || 0),

        termoAceito: true,
        termoVersao,
      };

      const res = await fetch(`/api/cedentes/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao cadastrar.");

      alert("Cadastro enviado ✅ Obrigado! Você já pode fechar esta página.");
    } catch (e: any) {
      alert(e?.message || "Erro ao enviar cadastro.");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return <div className="max-w-3xl p-6">Carregando convite...</div>;
  }

  if (inviteError) {
    return (
      <div className="max-w-3xl p-6">
        <h1 className="text-2xl font-bold mb-2">Convite</h1>
        <div className="rounded-2xl border p-4 text-sm text-red-600">{inviteError}</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Cadastro de cedente</h1>
      <p className="mb-6 text-sm text-slate-600">
        Preencha seus dados e, ao final, aceite o termo para concluir.
      </p>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-semibold">Dados</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Nome completo</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.nomeCompleto} onChange={(e) => setField("nomeCompleto", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Data de nascimento</label>
              <input type="date" className="w-full rounded-xl border px-3 py-2" value={form.dataNascimento} onChange={(e) => setField("dataNascimento", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">CPF</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.cpf} onChange={(e) => setField("cpf", normalizeCpf(e.target.value))} placeholder="Somente números" />
              {!cpfOk && form.cpf.length > 0 && <div className="mt-1 text-[11px] text-red-600">CPF deve ter 11 dígitos</div>}
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
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaEmailEnc} onChange={(e) => setField("senhaEmailEnc", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Senha Smiles</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaSmilesEnc} onChange={(e) => setField("senhaSmilesEnc", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Senha Latam Pass</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaLatamPassEnc} onChange={(e) => setField("senhaLatamPassEnc", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Senha Livelo</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaLiveloEnc} onChange={(e) => setField("senhaLiveloEnc", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Senha Esfera</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaEsferaEnc} onChange={(e) => setField("senhaEsferaEnc", e.target.value)} />
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
          <h2 className="mb-3 font-semibold">Termo</h2>

          <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
            Abra e leia o termo antes de aceitar:
            <div className="mt-2">
              <a className="underline" href="/TERMO_CIENCIA_AUTORIZACAO_VIAS_AEREAS_COMPLETO_ATUALIZADO.pdf" target="_blank" rel="noreferrer">
                Ver termo (PDF)
              </a>
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={termoAceito} onChange={(e) => setTermoAceito(e.target.checked)} />
            Li e declaro que concordo com os termos.
          </label>
        </section>

        <button
          type="submit"
          disabled={accepting}
          className="rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
        >
          {accepting ? "Enviando..." : "Cadastrar"}
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
