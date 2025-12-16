"use client";

import { useEffect, useMemo, useState } from "react";

type Prefill = { nomeHint: string | null; cpfHint: string | null };

export default function ConviteCedentePage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [prefill, setPrefill] = useState<Prefill>({ nomeHint: null, cpfHint: null });

  const [step, setStep] = useState<"form" | "termo">("form");
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
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
    pontosLatam: 0,
    pontosSmiles: 0,
    pontosLivelo: 0,
    pontosEsfera: 0,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/cedentes/invites/${token}`, { cache: "no-store" });
        const json = await res.json();
        if (!json?.ok) throw new Error(json?.error || "Convite inválido.");

        const p = json.data as Prefill;
        setPrefill(p);

        setForm((prev) => ({
          ...prev,
          nomeCompleto: p.nomeHint ?? prev.nomeCompleto,
          cpf: p.cpfHint ?? prev.cpf,
        }));
      } catch (e: any) {
        alert(e?.message || "Convite inválido/expirado.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const resumoTermo = useMemo(() => {
    return {
      nome: form.nomeCompleto || prefill.nomeHint || "",
      cpf: form.cpf || prefill.cpfHint || "",
    };
  }, [form.nomeCompleto, form.cpf, prefill.nomeHint, prefill.cpfHint]);

  function setField(key: string, value: any) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function goToTermo(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nomeCompleto.trim()) return alert("Informe o nome completo.");
    if (!form.cpf || form.cpf.replace(/\D/g, "").length !== 11) return alert("CPF inválido.");
    setStep("termo");
  }

  async function concluirCadastro() {
    if (!accepted) return alert("Você precisa marcar que concorda com os termos.");

    try {
      setSaving(true);

      const res = await fetch("/api/cedentes/public/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          form,
          termo: {
            versao: "v1",
            accepted: true,
          },
        }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao concluir.");

      alert("Cadastro enviado ✅");
      window.location.href = "/login";
    } catch (e: any) {
      alert(e?.message || "Erro ao concluir.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Carregando convite…</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Cadastro de cedente</h1>
      <p className="mb-6 text-sm text-slate-600">
        Preencha seus dados. Ao final, você verá o termo e poderá aceitar.
      </p>

      {step === "form" ? (
        <form onSubmit={goToTermo} className="space-y-4 rounded-2xl border p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Nome completo">
              <input className="w-full rounded-xl border px-3 py-2" value={form.nomeCompleto} onChange={(e) => setField("nomeCompleto", e.target.value)} />
            </Field>
            <Field label="Data de nascimento">
              <input type="date" className="w-full rounded-xl border px-3 py-2" value={form.dataNascimento} onChange={(e) => setField("dataNascimento", e.target.value)} />
            </Field>
            <Field label="CPF">
              <input className="w-full rounded-xl border px-3 py-2" value={form.cpf} onChange={(e) => setField("cpf", e.target.value)} placeholder="Somente números" />
            </Field>
            <Field label="Banco">
              <input className="w-full rounded-xl border px-3 py-2" value={form.banco} onChange={(e) => setField("banco", e.target.value)} />
            </Field>

            <Field label="E-mail criado">
              <input className="w-full rounded-xl border px-3 py-2" value={form.emailCriado} onChange={(e) => setField("emailCriado", e.target.value)} />
            </Field>
            <Field label="Senha do e-mail">
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaEmail} onChange={(e) => setField("senhaEmail", e.target.value)} />
            </Field>

            <Field label="Senha Smiles">
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaSmiles} onChange={(e) => setField("senhaSmiles", e.target.value)} />
            </Field>
            <Field label="Senha Latam Pass">
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaLatamPass} onChange={(e) => setField("senhaLatamPass", e.target.value)} />
            </Field>
            <Field label="Senha Livelo">
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaLivelo} onChange={(e) => setField("senhaLivelo", e.target.value)} />
            </Field>
            <Field label="Senha Esfera">
              <input className="w-full rounded-xl border px-3 py-2" value={form.senhaEsfera} onChange={(e) => setField("senhaEsfera", e.target.value)} />
            </Field>

            <Field label="Chave PIX">
              <input className="w-full rounded-xl border px-3 py-2" value={form.chavePix} onChange={(e) => setField("chavePix", e.target.value)} />
            </Field>

            <Field label="Pontos Latam">
              <input type="number" min={0} className="w-full rounded-xl border px-3 py-2" value={form.pontosLatam} onChange={(e) => setField("pontosLatam", Number(e.target.value || 0))} />
            </Field>
            <Field label="Pontos Smiles">
              <input type="number" min={0} className="w-full rounded-xl border px-3 py-2" value={form.pontosSmiles} onChange={(e) => setField("pontosSmiles", Number(e.target.value || 0))} />
            </Field>
            <Field label="Pontos Livelo">
              <input type="number" min={0} className="w-full rounded-xl border px-3 py-2" value={form.pontosLivelo} onChange={(e) => setField("pontosLivelo", Number(e.target.value || 0))} />
            </Field>
            <Field label="Pontos Esfera">
              <input type="number" min={0} className="w-full rounded-xl border px-3 py-2" value={form.pontosEsfera} onChange={(e) => setField("pontosEsfera", Number(e.target.value || 0))} />
            </Field>
          </div>

          <button className="rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900">
            Continuar para o termo
          </button>
        </form>
      ) : (
        <div className="space-y-4 rounded-2xl border p-4">
          <div className="text-sm text-slate-700">
            <div><b>Nome:</b> {resumoTermo.nome}</div>
            <div><b>CPF:</b> {resumoTermo.cpf}</div>
          </div>

          <div className="h-[70vh] overflow-hidden rounded-xl border">
            <iframe
              title="Termo"
              src="/termo-cedente.pdf"
              className="h-full w-full"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            Li e declaro que concordo com os termos.
          </label>

          <button
            onClick={concluirCadastro}
            disabled={saving}
            className="rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {saving ? "Enviando..." : "Cadastrar"}
          </button>

          <button
            type="button"
            onClick={() => setStep("form")}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Voltar
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm">{label}</label>
      {children}
    </div>
  );
}
