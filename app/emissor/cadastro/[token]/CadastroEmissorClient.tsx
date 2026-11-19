"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, KeyRound, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { buildEmissorContrato } from "@/lib/emissorContrato";

type Info = { socioNome: string; expiresAt: string; qrDataUrl: string; secret: string; contractVersion: string };

const INPUT =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";
const PIX_TIPOS = [
  { v: "CPF", l: "CPF" },
  { v: "TELEFONE", l: "Telefone" },
  { v: "EMAIL", l: "E-mail" },
  { v: "CNPJ", l: "CNPJ" },
  { v: "ALEATORIA", l: "Aleatória" },
];

function suggestLogin(nome: string) {
  const parts = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  return parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0];
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

export default function CadastroEmissorClient({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [form, setForm] = useState({
    nome: "",
    email: "",
    birthDate: "",
    telefone: "",
    cpf: "",
    meiCnpj: "",
    banco: "",
    pixTipo: "CPF",
    chavePix: "",
    login: "",
    password: "",
    password2: "",
    totpCode: "",
  });
  const [loginTouched, setLoginTouched] = useState(false);
  const [readAll, setReadAll] = useState(false);
  const [accept, setAccept] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const contractRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/emissor-convite/${encodeURIComponent(token)}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Link inválido.");
        setInfo(json.data);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Link inválido.");
      }
    })();
  }, [token]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "nome" && !loginTouched) next.login = suggestLogin(v);
      return next;
    });
  }

  const contrato = useMemo(
    () =>
      buildEmissorContrato({
        nome: form.nome,
        cpf: form.cpf,
        meiCnpj: form.meiCnpj,
        email: form.email,
        telefone: form.telefone,
        socioNome: info?.socioNome || "",
      }),
    [form.nome, form.cpf, form.meiCnpj, form.email, form.telefone, info?.socioNome]
  );

  function onContractScroll() {
    const el = contractRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadAll(true);
  }

  async function submit() {
    setErr("");
    if (form.password !== form.password2) return setErr("As senhas não conferem.");
    setSaving(true);
    try {
      const res = await fetch(`/api/emissor-convite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, accept }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao concluir.");
      setDone(json.data.login);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao concluir.");
    } finally {
      setSaving(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <main className="min-h-[100dvh] bg-[#f4f7fb] px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Vias Aéreas · TradeMiles</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Cadastro de emissor</h1>
        </header>
        {children}
      </div>
    </main>
  );

  if (done) {
    return shell(
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-3 text-xl font-bold">Cadastro concluído!</h2>
        <p className="mt-2 text-sm text-slate-600">
          Seu login é <b className="font-mono">{done}</b>. Entre com sua senha e o código do Google Authenticator.
        </p>
        <a
          href="/login"
          className="mt-5 inline-flex h-11 items-center rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Entrar no TradeMiles
        </a>
      </div>
    );
  }

  if (loadErr) {
    return shell(
      <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center text-sm text-rose-800 shadow-sm">{loadErr}</div>
    );
  }

  if (!info) {
    return shell(
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Abrindo cadastro…
      </div>
    );
  }

  return shell(
    <>
      <p className="text-center text-sm text-slate-600">
        Você vai emitir passagens vinculado a <b>{info.socioNome}</b>. Preencha seus dados, crie sua senha, configure
        o autenticador e aceite o contrato.
      </p>

      <Section icon={<UserRound size={18} />} title="Seus dados">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={LABEL}>Nome completo</span>
            <input className={INPUT} value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </label>
          <label>
            <span className={LABEL}>E-mail</span>
            <input className={INPUT} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label>
            <span className={LABEL}>Data de nascimento</span>
            <input className={INPUT} type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
          </label>
          <label>
            <span className={LABEL}>Telefone (WhatsApp)</span>
            <input
              className={INPUT}
              inputMode="tel"
              placeholder="(81) 99999-9999"
              value={form.telefone}
              onChange={(e) => set("telefone", e.target.value)}
            />
          </label>
          <label>
            <span className={LABEL}>CPF</span>
            <input className={INPUT} inputMode="numeric" value={form.cpf} onChange={(e) => set("cpf", e.target.value)} />
          </label>
          <label>
            <span className={LABEL}>CNPJ do MEI (se já tiver)</span>
            <input className={INPUT} inputMode="numeric" value={form.meiCnpj} onChange={(e) => set("meiCnpj", e.target.value)} />
          </label>
          <label>
            <span className={LABEL}>Banco</span>
            <input className={INPUT} placeholder="Ex.: Nubank" value={form.banco} onChange={(e) => set("banco", e.target.value)} />
          </label>
          <label>
            <span className={LABEL}>Tipo da chave PIX</span>
            <select className={INPUT} value={form.pixTipo} onChange={(e) => set("pixTipo", e.target.value)}>
              {PIX_TIPOS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>Chave PIX (para receber as comissões)</span>
            <input className={INPUT} value={form.chavePix} onChange={(e) => set("chavePix", e.target.value)} />
          </label>
        </div>
      </Section>

      <Section icon={<KeyRound size={18} />} title="Login e senha">
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className={LABEL}>Login</span>
            <input
              className={cn(INPUT, "font-mono")}
              value={form.login}
              onChange={(e) => {
                setLoginTouched(true);
                set("login", e.target.value.toLowerCase().trim());
              }}
            />
          </label>
          <label>
            <span className={LABEL}>Senha (mín. 8)</span>
            <input
              className={INPUT}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
          </label>
          <label>
            <span className={LABEL}>Repita a senha</span>
            <input
              className={INPUT}
              type="password"
              autoComplete="new-password"
              value={form.password2}
              onChange={(e) => set("password2", e.target.value)}
            />
          </label>
        </div>
      </Section>

      <Section icon={<ShieldCheck size={18} />} title="Google Authenticator">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={info.qrDataUrl} alt="QR do autenticador" className="h-44 w-44 rounded-xl border border-slate-200" />
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Instale o <b>Google Authenticator</b> no celular.</li>
            <li>
              Toque em <b>+</b> e leia o QR ao lado. Sem câmera? Digite a chave:{" "}
              <span className="break-all font-mono text-xs">{info.secret}</span>
            </li>
            <li>
              Digite o código de 6 números que aparece no app:
              <input
              className={cn(INPUT, "mt-2 block max-w-[12rem] text-center font-mono text-lg tracking-[0.3em]")}
              inputMode="numeric"
              maxLength={6}
              value={form.totpCode}
              onChange={(e) => set("totpCode", e.target.value.replace(/\D/g, ""))}
            />
            </li>
          </ol>
        </div>
      </Section>

      <Section icon={<FileText size={18} />} title="Contrato de prestação de serviços">
        <div
          ref={contractRef}
          onScroll={onContractScroll}
          className="max-h-[28rem] space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-700"
        >
          {contrato.map((s) => (
            <div key={s.titulo}>
              <h3 className="mb-1.5 font-semibold text-slate-900">{s.titulo}</h3>
              {s.itens.map((t, i) => (
                <p key={i} className="mb-1.5">
                  {t}
                </p>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {readAll ? "Contrato lido até o fim." : "Role o contrato até o fim para liberar o aceite."} Versão{" "}
          {info.contractVersion}.
        </p>
        <label
          className={cn(
            "mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm",
            readAll ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50 text-slate-400"
          )}
        >
          <input
            type="checkbox"
            className="mt-0.5"
            disabled={!readAll}
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
          />
          <span>
            Li e aceito o contrato, inclusive as regras de proteção de dados (LGPD), sigilo e uso exclusivo dos cartões
            dos sócios.
          </span>
        </label>
      </Section>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div> : null}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving || !accept}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Concluir cadastro
      </button>
    </>
  );
}
