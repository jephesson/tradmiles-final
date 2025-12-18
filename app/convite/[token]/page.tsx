"use client";

import { useEffect, useMemo, useState } from "react";

type Responsavel = { id: string; name: string; login?: string | null; team?: string | null };

type PixTipo = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA" | "";

type FormState = {
  nomeCompleto: string;
  dataNascimento: string;
  cpf: string;

  telefone: string;
  emailCriado: string;

  senhaEmail: string;
  senhaSmiles: string;
  senhaLivelo: string;
  senhaLatamPass: string;
  senhaEsfera: string;

  banco: string;
  pixTipo: PixTipo;
  chavePix: string;

  confirmoTitular: boolean;
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
  const digits = onlyDigits(v).slice(0, 11);
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (!ddd) return "";

  if (digits.length >= 11) {
    const p1 = rest.slice(0, 5);
    const p2 = rest.slice(5, 9);
    return `(${ddd}) ${p1}${p2 ? "-" + p2 : ""}`.trim();
  }

  const p1 = rest.slice(0, 4);
  const p2 = rest.slice(4, 8);
  return `(${ddd}) ${p1}${p2 ? "-" + p2 : ""}`.trim();
}
function normalizePixChave(tipo: PixTipo, v: string) {
  const raw = (v || "").trim();
  if (!tipo) return raw;
  if (tipo === "CPF") return normalizeCpf(raw);
  if (tipo === "CNPJ") return onlyDigits(raw).slice(0, 14);
  if (tipo === "TELEFONE") return onlyDigits(raw).slice(0, 11);
  if (tipo === "EMAIL") return raw.toLowerCase();
  return raw; // ALEATORIA
}
function isPixOk(tipo: PixTipo, chave: string) {
  if (!tipo) return false;
  const v = normalizePixChave(tipo, chave);
  if (tipo === "CPF") return v.length === 11;
  if (tipo === "CNPJ") return v.length === 14;
  if (tipo === "TELEFONE") return v.length === 10 || v.length === 11;
  if (tipo === "EMAIL") return v.includes("@") && v.includes(".");
  if (tipo === "ALEATORIA") return v.length >= 16;
  return false;
}

export default function ConviteCedentePage({
  params,
}: {
  // ✅ aceita token OU code (evita quebrar se a pasta da rota mudar)
  params: { token?: string; code?: string };
}) {
  // ✅ nunca deixa vazio / undefined
  const code = useMemo(() => String(params?.token ?? params?.code ?? "").trim(), [params]);

  const [loading, setLoading] = useState(true);
  const [responsavel, setResponsavel] = useState<Responsavel | null>(null);
  const [inviteError, setInviteError] = useState<string>("");

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
    banco: "",
    pixTipo: "",
    chavePix: "",
    confirmoTitular: false,
  });

  const cpfOk = useMemo(() => normalizeCpf(form.cpf).length === 11, [form.cpf]);
  const phoneDigits = useMemo(() => onlyDigits(form.telefone), [form.telefone]);
  const phoneOk = useMemo(() => phoneDigits.length === 10 || phoneDigits.length === 11, [phoneDigits]);
  const pixOk = useMemo(() => isPixOk(form.pixTipo, form.chavePix), [form.pixTipo, form.chavePix]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ✅ Carrega responsável e valida convite (sem “Link inválido” falso)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setInviteError("");
        setResponsavel(null);

        // ✅ se não veio código, não chama a API
        if (!code) {
          if (!alive) return;
          setInviteError("Convite inválido (código ausente).");
          return;
        }

        const res = await fetch(`/api/convite/${encodeURIComponent(code)}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (!alive) return;

        if (!json?.ok) {
          setInviteError(json?.error || "Convite inválido.");
          return;
        }

        setResponsavel(json.data?.responsavel ?? null);
        setForm((prev) => ({
          ...prev,
          nomeCompleto: json.data?.nomeHint ?? prev.nomeCompleto,
          cpf: json.data?.cpfHint ?? prev.cpf,
        }));
      } catch (err: any) {
        if (!alive) return;
        setInviteError(err?.message || "Erro ao validar convite.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (inviteError) return alert(inviteError);

    if (!form.nomeCompleto.trim()) return alert("Informe o nome completo.");
    if (!cpfOk) return alert("CPF inválido (11 dígitos).");
    if (!phoneOk) return alert("Telefone inválido. Use DDD + número.");

    const isoNascimento = form.dataNascimento.trim() ? brToIsoDate(form.dataNascimento) : null;
    if (form.dataNascimento.trim() && !isoNascimento) return alert("Data de nascimento inválida. Use DD/MM/AAAA.");

    if (!form.emailCriado.trim()) return alert("Informe o e-mail criado.");
    if (!form.senhaEmail.trim()) return alert("Informe a senha do e-mail.");

    if (!form.banco.trim()) return alert("Informe o banco.");
    if (!form.pixTipo) return alert("Selecione o tipo da chave PIX.");
    if (!form.chavePix.trim()) return alert("Informe a chave PIX.");
    if (!pixOk) return alert("Chave PIX inválida para o tipo escolhido.");
    if (!form.confirmoTitular) return alert("Você precisa confirmar que é o titular da conta/PIX.");
    if (!accepted) return alert("Você precisa aceitar o termo.");

    try {
      setSaving(true);

      const payload = {
        nomeCompleto: form.nomeCompleto.trim(),
        cpf: normalizeCpf(form.cpf),
        dataNascimento: isoNascimento,

        telefone: onlyDigits(form.telefone),
        emailCriado: form.emailCriado.trim(),

        banco: form.banco.trim(),
        chavePix: normalizePixChave(form.pixTipo, form.chavePix),

        pixTipo: form.pixTipo,
        titularConfirmado: true,

        senhaEmailEnc: form.senhaEmail || null,
        senhaSmilesEnc: form.senhaSmiles || null,
        senhaLiveloEnc: form.senhaLivelo || null,
        senhaLatamPassEnc: form.senhaLatamPass || null,
        senhaEsferaEnc: form.senhaEsfera || null,

        termoVersao: "v1",
        accepted: true,
      };

      const res = await fetch(`/api/convite/${encodeURIComponent(code)}/submit`, {
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

  if (inviteError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold mb-2">Convite</h1>
        <div className="rounded-2xl border p-4 text-sm text-red-600">{inviteError}</div>
      </div>
    );
  }

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

      {/* ✅ caixa cinza sempre aparece (mesmo se vier null, mostra "-") */}
      <div className="mb-6 rounded-xl border bg-slate-50 p-3 text-sm">
        Funcionário responsável: <b>{responsavel?.name ?? "-"}</b>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* ... daqui pra baixo mantém seu JSX igual ... */}
        {/* (não re-colei tudo pra não ficar gigante; pode manter seu layout atual) */}

        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 font-semibold">Dados</h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm">Nome completo</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.nomeCompleto} onChange={(e) => setField("nomeCompleto", e.target.value)} />
            </div>

            <div>
              <label className="mb-1 block text-sm">Data de nascimento (DD/MM/AAAA)</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.dataNascimento} onChange={(e) => setField("dataNascimento", normalizeDateBR(e.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" />
            </div>

            <div>
              <label className="mb-1 block text-sm">CPF (somente números)</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.cpf} onChange={(e) => setField("cpf", normalizeCpf(e.target.value))} placeholder="Somente números" />
              {!cpfOk && form.cpf.length > 0 && <div className="mt-1 text-[11px] text-red-600">CPF deve ter 11 dígitos</div>}
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm">Telefone</label>
              <input className="w-full rounded-xl border px-3 py-2" value={form.telefone} onChange={(e) => setField("telefone", normalizePhoneBR(e.target.value))} placeholder="(11) 99999-9999" inputMode="tel" />
              {!phoneOk && form.telefone.length > 0 && <div className="mt-1 text-[11px] text-red-600">Telefone inválido (inclua DDD)</div>}
            </div>
          </div>
        </section>

        {/* restante: acessos / pix / termo ... pode manter igual ao seu */}
        <button disabled={saving} className="rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60">
          {saving ? "Enviando..." : "Concluir cadastro"}
        </button>
      </form>
    </div>
  );
}
