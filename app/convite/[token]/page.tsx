"use client";

import { useEffect, useMemo, useState } from "react";

type Responsavel = { id: string; name: string; login?: string | null; team?: string | null };

type FormState = {
  nomeCompleto: string;
  dataNascimento: string; // DD/MM/AAAA
  cpf: string;

  telefone: string; // (DD) 9XXXX-XXXX
  emailCriado: string;

  senhaEmail: string;
  senhaSmiles: string;
  senhaLivelo: string;
  senhaLatamPass: string;
  senhaEsfera: string;
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function normalizeCpf(v: string) {
  return onlyDigits(v).slice(0, 11);
}

function normalizeDateBR(v: string) {
  const cleaned = (v || "").replace(/[^\d/]/g, "");
  const digits = cleaned.replace(/\//g, "");
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  let out = d;
  if (digits.length > 2) out += "/" + m;
  if (digits.length > 4) out += "/" + y;
  return out.slice(0, 10);
}

function brToIsoDate(br: string): string | null {
  const v = (br || "").trim();
  if (!v) return null;
  const parts = v.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return null;

  const d = Number(dd);
  const m = Number(mm);
  const y = Number(yyyy);

  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  return `${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalizePhoneBR(v: string) {
  // aceita 10 ou 11 dígitos (DDD + número)
  const digits = onlyDigits(v).slice(0, 11);
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (!ddd) return "";

  // 11 dígitos: 9XXXX-XXXX
  if (digits.length >= 11) {
    const p1 = rest.slice(0, 5);
    const p2 = rest.slice(5, 9);
    return `(${ddd}) ${p1}${p2 ? "-" + p2 : ""}`.trim();
  }

  // 10 dígitos: XXXX-XXXX
  const p1 = rest.slice(0, 4);
  const p2 = rest.slice(4, 8);
  return `(${ddd}) ${p1}${p2 ? "-" + p2 : ""}`.trim();
}

export default function ConviteCedentePage({ params }: { params: { token: string } }) {
  const code = params.token; // agora é code fixo do funcionário

  const [loading, setLoading] = useState(true);
  const [responsavel, setResponsavel] = useState<Responsavel | null>(null);

  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState<FormState>({
    nomeCompleto: "",
    dataNascimento: "",
    cpf: "",
    telefone: "",
    emailCriado: "",
    senhaEmail: "",
    senhaSmiles: "",
    senhaLivelo: "",
    senhaLatamPass: "",
    senhaEsfera: "",
  });

  const cpfOk = useMemo(() => normalizeCpf(form.cpf).length === 11, [form.cpf]);

  const phoneDigits = useMemo(() => onlyDigits(form.telefone), [form.telefone]);
  const phoneOk = useMemo(() => phoneDigits.length === 10 || phoneDigits.length === 11, [phoneDigits]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // GET: só para pegar o responsável (e hints se você quiser)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/convite/${code}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (json?.ok) {
          setResponsavel(json.data?.responsavel ?? null);

          // se quiser pré-preencher nome/cpf (opcional)
          setForm((prev) => ({
            ...prev,
            nomeCompleto: json.data?.nomeHint ?? prev.nomeCompleto,
            cpf: json.data?.cpfHint ?? prev.cpf,
          }));
        } else {
          // mesmo se falhar, deixa cadastrar (mas vai falhar no POST se code não existir)
          setResponsavel(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.nomeCompleto.trim()) return alert("Informe o nome completo.");
    if (!cpfOk) return alert("CPF inválido (11 dígitos).");
    if (!phoneOk) return alert("Telefone inválido. Use DDD + número.");

    const isoNascimento = form.dataNascimento.trim() ? brToIsoDate(form.dataNascimento) : null;
    if (form.dataNascimento.trim() && !isoNascimento) {
      return alert("Data de nascimento inválida. Use DD/MM/AAAA.");
    }

    if (!form.emailCriado.trim()) return alert("Informe o e-mail criado.");
    if (!form.senhaEmail.trim()) return alert("Informe a senha do e-mail.");

    if (!accepted) return alert("Você precisa aceitar o termo.");

    try {
      setSaving(true);

      const payload = {
        nomeCompleto: form.nomeCompleto.trim(),
        cpf: normalizeCpf(form.cpf),
        dataNascimento: isoNascimento,

        telefone: onlyDigits(form.telefone), // manda só dígitos
        emailCriado: form.emailCriado.trim(),

        // mantém o padrão do backend atual
        senhaEmailEnc: form.senhaEmail || null,
        senhaSmilesEnc: form.senhaSmiles || null,
        senhaLiveloEnc: form.senhaLivelo || null,
        senhaLatamPassEnc: form.senhaLatamPass || null,
        senhaEsferaEnc: form.senhaEsfera || null,

        accepted: true,
      };

      const res = await fetch(`/api/convite/${code}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Erro ao enviar.");

      setDone(true);
    } catch (e: any) {
      alert(e?.message || "Erro ao finalizar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Carregando...</div>;

  if (done) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold mb-2">Em análise ✅</h1>
        <p className="text-slate-700">
          Recebemos seus dados e eles estão <b>em análise</b>.{" "}
          {responsavel?.name ? (
            <>
              O(a) funcionário(a) responsável <b>{responsavel.name}</b> irá entrar em contato.
            </>
          ) : (
            <>O funcionário responsável irá entrar em contato.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-1">Cadastro do cedente</h1>

      {responsavel?.name && (
        <div className="mb-6 rounded-xl border bg-slate-50 p-3 text-sm">
          Funcionário responsável: <b>{responsavel.name}</b>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-semibold">Dados</h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm">Nome completo</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.nomeCompleto}
                onChange={(e) => setField("nomeCompleto", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm">Data de nascimento (DD/MM/AAAA)</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.dataNascimento}
                onChange={(e) => setField("dataNascimento", normalizeDateBR(e.target.value))}
                placeholder="DD/MM/AAAA"
                inputMode="numeric"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm">CPF (somente números)</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.cpf}
                onChange={(e) => setField("cpf", normalizeCpf(e.target.value))}
                placeholder="Somente números"
              />
              {!cpfOk && form.cpf.length > 0 && (
                <div className="mt-1 text-[11px] text-red-600">CPF deve ter 11 dígitos</div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm">Telefone</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.telefone}
                onChange={(e) => setField("telefone", normalizePhoneBR(e.target.value))}
                placeholder="(11) 99999-9999"
                inputMode="tel"
              />
              {!phoneOk && form.telefone.length > 0 && (
                <div className="mt-1 text-[11px] text-red-600">Telefone inválido (inclua DDD)</div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-semibold">Acessos</h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">E-mail criado</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.emailCriado}
                onChange={(e) => setField("emailCriado", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm">Senha do e-mail</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.senhaEmail}
                onChange={(e) => setField("senhaEmail", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm">Senha Smiles</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.senhaSmiles}
                onChange={(e) => setField("senhaSmiles", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm">Senha Livelo</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.senhaLivelo}
                onChange={(e) => setField("senhaLivelo", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm">Senha Latam Pass</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.senhaLatamPass}
                onChange={(e) => setField("senhaLatamPass", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm">Senha Esfera</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.senhaEsfera}
                onChange={(e) => setField("senhaEsfera", e.target.value)}
              />
            </div>
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
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            Li e declaro que concordo com os termos.
          </label>
        </section>

        <button
          disabled={saving}
          className="rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
        >
          {saving ? "Enviando..." : "Concluir cadastro"}
        </button>
      </form>
    </div>
  );
}
