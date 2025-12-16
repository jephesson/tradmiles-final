"use client";

import { useMemo, useState } from "react";

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
  const d = onlyDigits(v).slice(0, 11);
  return d;
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
  // ID “amigável”, o UUID do Prisma fica como id real
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

export default function CedentesNovoPage() {
  const [mode, setMode] = useState<"manual" | "link">("manual");

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

  const [saving, setSaving] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string>("");

  const identificador = useMemo(
    () => (form.nomeCompleto.trim() ? makeIdentifier(form.nomeCompleto) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.nomeCompleto]
  );

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();

    if (!form.nomeCompleto.trim()) return alert("Informe o nome completo.");
    if (normalizeCpf(form.cpf).length !== 11) return alert("CPF inválido (11 dígitos).");

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

        // ⚠️ sem criptografia (como você pediu)
        senhaEmailEnc: form.senhaEmail || null,
        senhaSmilesEnc: form.senhaSmiles || null,
        senhaLatamPassEnc: form.senhaLatamPass || null,
        senhaLiveloEnc: form.senhaLivelo || null,
        senhaEsferaEnc: form.senhaEsfera || null,

        pontosLatam: Number(form.pontosLatam || 0),
        pontosSmiles: Number(form.pontosSmiles || 0),
        pontosLivelo: Number(form.pontosLivelo || 0),
        pontosEsfera: Number(form.pontosEsfera || 0),
      };

      const res = await fetch("/api/cedentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao cadastrar.");

      alert("Cedente cadastrado ✅");
      setForm({
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
    } catch (err: any) {
      alert(err?.message || "Erro ao cadastrar.");
    } finally {
      setSaving(false);
    }
  }

  async function generateInvite() {
    if (!form.nomeCompleto.trim()) return alert("Informe ao menos o nome (opcional, mas ajuda).");
    if (form.cpf && normalizeCpf(form.cpf).length !== 11) return alert("CPF inválido (11 dígitos).");

    try {
      setInviteLoading(true);
      setInviteUrl("");

      const res = await fetch("/api/cedentes/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeHint: form.nomeCompleto.trim() || null,
          cpfHint: form.cpf ? normalizeCpf(form.cpf) : null,
          expiresInHours: 72,
        }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao gerar convite.");

      setInviteUrl(json.data.url as string);

      // copia automático
      try {
        await navigator.clipboard.writeText(json.data.url);
      } catch {}
    } catch (err: any) {
      alert(err?.message || "Erro ao gerar convite.");
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">Cadastrar cedente</h1>
      <p className="mb-6 text-sm text-slate-600">
        Escolha: cadastro manual (feito por você) ou gerar um link para o cedente preencher e aceitar o termo.
      </p>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-xl border px-4 py-2 text-sm ${
            mode === "manual" ? "bg-black text-white" : "hover:bg-slate-50"
          }`}
        >
          Cadastro manual
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`rounded-xl border px-4 py-2 text-sm ${
            mode === "link" ? "bg-black text-white" : "hover:bg-slate-50"
          }`}
        >
          Gerar link (convite)
        </button>
      </div>

      {/* Form comum (serve pros 2 modos, mas só envia no manual) */}
      <form onSubmit={submitManual} className="space-y-6">
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-semibold">Dados</h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Nome completo</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.nomeCompleto}
                onChange={(e) => setField("nomeCompleto", e.target.value)}
                placeholder="Ex.: Maria Silva"
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
                Dica: esse CPF será usado para identificar e preencher o termo no convite.
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm">Identificador (prévia)</label>
              <input className="w-full rounded-xl border px-3 py-2" value={identificador} readOnly />
              <div className="mt-1 text-[11px] text-slate-500">
                No cadastro manual, o identificador final é gerado automaticamente.
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-semibold">Acessos e dados bancários</h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">E-mail criado</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.emailCriado}
                onChange={(e) => setField("emailCriado", e.target.value)}
                placeholder="ex.: maria.silva@gmail.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm">Senha do e-mail</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.senhaEmail}
                onChange={(e) => setField("senhaEmail", e.target.value)}
                placeholder="(sem criptografia por enquanto)"
              />
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

        {mode === "manual" ? (
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Cadastrar manualmente"}
          </button>
        ) : (
          <div className="rounded-2xl border p-4">
            <div className="mb-2 font-semibold">Gerar convite</div>
            <p className="mb-3 text-sm text-slate-600">
              Você envia o link para o cedente preencher. Ao final ele aceita o termo e o cadastro entra no sistema.
            </p>

            <button
              type="button"
              onClick={generateInvite}
              disabled={inviteLoading}
              className="rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
            >
              {inviteLoading ? "Gerando..." : "Gerar link de convite"}
            </button>

            {inviteUrl && (
              <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-sm">
                <div className="mb-1 font-medium">Link gerado (copiado para a área de transferência):</div>
                <div className="break-all">{inviteUrl}</div>
              </div>
            )}
          </div>
        )}
      </form>

      <div className="mt-8 rounded-2xl border p-4 text-xs text-slate-600">
        <b>⚠️ Aviso importante:</b> por enquanto estamos salvando senhas em texto no banco (como você pediu). Isso é
        arriscado. Quando você quiser, eu troco para criptografia reversível sem mudar a experiência do cedente.
      </div>
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
