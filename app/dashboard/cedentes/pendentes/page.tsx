"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Cake,
  Check,
  CheckCircle2,
  Copy,
  IdCard,
  Landmark,
  ListPlus,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  User,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { isProgramCreacaoPendente } from "@/lib/cedentes/programCreacaoPendente";

type ReviewKind = "APROVAR_FILA" | "APROVAR" | "RECUSAR";

const REVIEW_CONFIRM: Record<
  ReviewKind,
  { title: string; text: string; button: string; buttonCls: string }
> = {
  APROVAR_FILA: {
    title: "Aprovar e colocar na Fila de assinatura?",
    text: "O cedente é aprovado e entra no fim da Fila de assinatura.",
    button: "Sim, aprovar + fila",
    buttonCls: "bg-black text-white hover:bg-slate-900",
  },
  APROVAR: {
    title: "Apenas aprovar?",
    text: "O cedente é aprovado e não entra na Fila de assinatura.",
    button: "Sim, apenas aprovar",
    buttonCls: "bg-slate-800 text-white hover:bg-slate-900",
  },
  RECUSAR: {
    title: "Recusar cadastro?",
    text: "O cedente é reprovado e sai da lista de pendentes.",
    button: "Sim, recusar",
    buttonCls: "bg-red-600 text-white hover:bg-red-700",
  },
};

type Owner = { id: string; name: string; login?: string | null; team?: string | null };

type Referrer = { id: string; identificador: string; nomeCompleto: string };

type Funcionario = { id: string; name: string; login: string; isActive?: boolean };

type Item = {
  id: string;
  identificador?: string | null;
  nomeCompleto: string;
  cpf: string;
  dataNascimento: string | null;

  telefone: string | null;
  emailCriado: string | null;
  senhaEmail: string | null;
  senhaSmiles: string | null;
  senhaLatamPass: string | null;
  senhaLivelo: string | null;
  senhaEsfera: string | null;

  latamCreacaoPendente: boolean;
  smilesCreacaoPendente: boolean;
  liveloCreacaoPendente: boolean;

  banco: string | null;
  pixTipo: string | null;
  chavePix: string | null;
  titularConfirmado: boolean | null;

  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;

  createdAt: string;

  owner: Owner;
  referredByCedenteId: string | null;
  referredByCedente: Referrer | null;
};

type PointsDraft = {
  pontosLatam: number | "";
  pontosSmiles: number | "";
  pontosLivelo: number | "";
  pontosEsfera: number | "";
};

type AdminDraft = {
  ownerId: string;
  referredByCedenteId: string;
  latamCreacaoPendente: boolean;
  smilesCreacaoPendente: boolean;
  liveloCreacaoPendente: boolean;
};

function labelMissing(c: Item) {
  const miss: string[] = [];

  if (!c.nomeCompleto?.trim()) miss.push("Nome");
  if (!c.cpf?.trim()) miss.push("CPF");
  if (!c.telefone?.trim()) miss.push("Telefone");
  if (!c.emailCriado?.trim()) miss.push("E-mail criado");
  if (!c.senhaEmail?.trim()) miss.push("Senha do e-mail");
  if (!c.senhaEsfera?.trim()) miss.push("Senha Esfera");
  if (!c.banco?.trim()) miss.push("Banco");
  if (!c.chavePix?.trim()) miss.push("Chave PIX");
  if (!c.pixTipo?.trim()) miss.push("Tipo PIX");
  if (!c.titularConfirmado) miss.push("Titular não confirmado");

  return miss;
}

function programPendingLabels(c: Item) {
  const out: string[] = [];
  if (isProgramCreacaoPendente(c, "LATAM")) out.push("Latam");
  if (isProgramCreacaoPendente(c, "SMILES")) out.push("Smiles");
  if (isProgramCreacaoPendente(c, "LIVELO")) out.push("Livelo");
  return out;
}

export default function CedentesPendentesPage() {
  const [items, setItems] = useState<Item[]>([]);
  // Ação escolhida esperando confirmação no pop-up.
  const [confirmAsk, setConfirmAsk] = useState<{ id: string; kind: ReviewKind } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);

  const [draft, setDraft] = useState<Record<string, PointsDraft>>({});
  const [adminDraft, setAdminDraft] = useState<Record<string, AdminDraft>>({});

  const totalPendentes = useMemo(() => items.length, [items]);

  async function loadMeta() {
    const [meRes, funcRes, refRes] = await Promise.all([
      fetch("/api/auth/me", { cache: "no-store", credentials: "include" }),
      fetch("/api/funcionarios", { cache: "no-store", credentials: "include" }),
      fetch("/api/cedentes/referrers-options", { cache: "no-store", credentials: "include" }),
    ]);

    const meJson = await meRes.json().catch(() => ({}));
    setIsAdmin(meJson?.ok && meJson?.data?.session?.role === "admin");

    const funcJson = await funcRes.json().catch(() => ({}));
    if (funcJson?.ok && Array.isArray(funcJson.data)) {
      setFuncionarios(
        funcJson.data.filter((f: Funcionario) => f.isActive !== false).map((f: Funcionario) => ({
          id: f.id,
          name: f.name,
          login: f.login,
        }))
      );
    }

    const refJson = await refRes.json().catch(() => ({}));
    if (refJson?.ok && Array.isArray(refJson.data)) {
      setReferrers(refJson.data);
    }
  }

  async function load() {
    setLoading(true);
    const res = await fetch("/api/cedentes/pendentes", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    const list: Item[] = json?.data?.items || [];
    setItems(list);

    setDraft((prev) => {
      const next = { ...prev };
      for (const c of list) {
        if (!next[c.id]) {
          next[c.id] = {
            pontosLatam: c.pontosLatam ?? 0,
            pontosSmiles: c.pontosSmiles ?? 0,
            pontosLivelo: c.pontosLivelo ?? 0,
            pontosEsfera: c.pontosEsfera ?? 0,
          };
        }
      }
      return next;
    });

    setAdminDraft((prev) => {
      const next = { ...prev };
      for (const c of list) {
        next[c.id] = {
          ownerId: c.owner?.id || "",
          referredByCedenteId: c.referredByCedenteId || "",
          latamCreacaoPendente: c.latamCreacaoPendente,
          smilesCreacaoPendente: c.smilesCreacaoPendente,
          liveloCreacaoPendente: c.liveloCreacaoPendente,
        };
      }
      return next;
    });

    setLoading(false);
  }

  async function review(id: string, action: "APPROVE" | "REJECT", addToFila = false) {
    const points = draft[id] || {
      pontosLatam: 0,
      pontosSmiles: 0,
      pontosLivelo: 0,
      pontosEsfera: 0,
    };

    const payload: Record<string, unknown> = { action };

    if (action === "APPROVE") {
      payload.points = {
        pontosLatam: Number(points.pontosLatam || 0),
        pontosSmiles: Number(points.pontosSmiles || 0),
        pontosLivelo: Number(points.pontosLivelo || 0),
        pontosEsfera: Number(points.pontosEsfera || 0),
      };
      const ad = adminDraft[id];
      if (isAdmin && ad) {
        payload.ownerId = ad.ownerId || undefined;
        payload.referredByCedenteId = ad.referredByCedenteId || null;
        payload.latamCreacaoPendente = ad.latamCreacaoPendente;
        payload.smilesCreacaoPendente = ad.smilesCreacaoPendente;
        payload.liveloCreacaoPendente = ad.liveloCreacaoPendente;
      }
    }

    const res = await fetch(`/api/cedentes/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!json?.ok) return alert(json?.error || "Erro ao revisar");

    if (addToFila) {
      const filaRes = await fetch("/api/fila-assinatura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedenteId: id }),
      }).catch(() => null);
      const filaJson = await filaRes?.json().catch(() => null);
      if (!filaJson?.ok) {
        alert(
          `Cedente aprovado, mas não entrou na Fila de assinatura: ${
            filaJson?.error || "falha de conexão"
          }. Coloque pela tela da fila.`
        );
      }
    }

    await load();
  }

  function setDraftField(id: string, key: keyof PointsDraft, value: number | "") {
    setDraft((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { pontosLatam: "", pontosSmiles: "", pontosLivelo: "", pontosEsfera: "" }),
        [key]: value,
      },
    }));
  }

  function setAdminField<K extends keyof AdminDraft>(id: string, key: K, value: AdminDraft[K]) {
    setAdminDraft((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || ({} as AdminDraft)), [key]: value },
    }));
  }

  useEffect(() => {
    void loadMeta();
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold tracking-wide text-sky-700 ring-1 ring-sky-200">
            <UserCheck size={14} /> CEDENTES
          </span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Cedentes pendentes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Confira os dados, preencha os pontos e aprove.{" "}
            <span className="font-semibold text-slate-700">
              {totalPendentes} {totalPendentes === 1 ? "pendente" : "pendentes"}
            </span>
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={cn(loading && "animate-spin")} /> Atualizar
        </button>
      </header>

      {loading && !items.length ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-14 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando pendentes…
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-14 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-700">Nenhum cadastro pendente</p>
          <p className="text-sm text-slate-500">Quando alguém se cadastrar, aparece aqui.</p>
        </div>
      ) : null}

      <div className="space-y-5">
        {items.map((c) => {
          const missing = labelMissing(c);
          const programPending = programPendingLabels(c);
          const d = draft[c.id] || {
            pontosLatam: 0,
            pontosSmiles: 0,
            pontosLivelo: 0,
            pontosEsfera: 0,
          };
          const ad = adminDraft[c.id];
          const wa = whatsappHref(c.telefone);
          const nasc = fmtNascimento(c.dataNascimento);

          return (
            <article
              key={c.id}
              className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50"
            >
              {/* Cabeçalho do cadastro */}
              <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-base font-bold text-white">
                  {initials(c.nomeCompleto)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-slate-900">{c.nomeCompleto}</h2>
                  <p className="text-xs text-slate-500">
                    {c.identificador ? `${c.identificador} · ` : ""}cadastrado em{" "}
                    {new Date(c.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                    title={`Abrir conversa com ${c.telefone}`}
                  >
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                ) : (
                  <span className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                    Sem telefone para WhatsApp
                  </span>
                )}
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
                {/* Dados */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <InfoTile icon={<IdCard size={15} />} label="CPF" value={c.cpf} copy />
                  <InfoTile
                    icon={<Cake size={15} />}
                    label="Nascimento"
                    value={nasc ? nasc.data : null}
                    hint={nasc ? `${nasc.idade} anos` : "Não informado"}
                    warn={!nasc}
                  />
                  <InfoTile
                    icon={<Phone size={15} />}
                    label="Telefone"
                    value={c.telefone}
                    copy
                    action={
                      wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50"
                          title="Abrir no WhatsApp"
                        >
                          <MessageCircle size={14} />
                        </a>
                      ) : null
                    }
                  />
                  <InfoTile icon={<Mail size={15} />} label="E-mail" value={c.emailCriado} copy />
                  <InfoTile
                    icon={<Landmark size={15} />}
                    label="PIX"
                    value={c.chavePix ? `${c.pixTipo ?? "—"} · ${c.chavePix}` : null}
                    hint={[c.banco, c.titularConfirmado ? "titular confirmado" : "titular não confirmado"]
                      .filter(Boolean)
                      .join(" · ")}
                    warn={!c.chavePix || !c.titularConfirmado}
                  />
                  <InfoTile icon={<User size={15} />} label="Responsável" value={c.owner?.name ?? null} />
                  <div className="sm:col-span-2 xl:col-span-3">
                    <InfoTile
                      icon={<Users size={15} />}
                      label="Indicação"
                      value={
                        c.referredByCedente
                          ? `${c.referredByCedente.nomeCompleto} (${c.referredByCedente.identificador})`
                          : null
                      }
                      hint={c.referredByCedente ? undefined : "Sem indicação"}
                    />
                  </div>
                </div>

                {/* Pendências */}
                <aside
                  className={cn(
                    "h-fit rounded-2xl border p-4 text-sm",
                    missing.length || programPending.length
                      ? "border-amber-200 bg-amber-50/60"
                      : "border-emerald-200 bg-emerald-50/60"
                  )}
                >
                  {missing.length === 0 ? (
                    <p className="flex items-center gap-2 font-semibold text-emerald-800">
                      <CheckCircle2 size={16} /> Cadastro completo
                    </p>
                  ) : (
                    <>
                      <p className="flex items-center gap-2 font-semibold text-amber-900">
                        <AlertTriangle size={16} /> Campos faltando
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {missing.map((m) => (
                          <span
                            key={m}
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {programPending.length > 0 ? (
                    <div className="mt-3 border-t border-amber-200/70 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                        Programas a criar
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {programPending.map((p) => (
                          <span
                            key={p}
                            className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </aside>
              </div>

              {isAdmin && ad ? (
                <Section title="Responsável e quem indicou" tone="indigo">
                  <p className="-mt-1 mb-3 text-xs text-slate-500">
                    A indicação do link já vem preenchida. Se precisar mudar, ajuste aqui — entra junto no Aprovar.
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className={LABEL}>Funcionário responsável</span>
                      <select
                        className={INPUT}
                        value={ad.ownerId}
                        onChange={(e) => setAdminField(c.id, "ownerId", e.target.value)}
                      >
                        <option value="">Selecione…</option>
                        {funcionarios.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} ({f.login})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className={LABEL}>Cedente que indicou</span>
                      <select
                        className={INPUT}
                        value={ad.referredByCedenteId}
                        onChange={(e) => setAdminField(c.id, "referredByCedenteId", e.target.value)}
                      >
                        <option value="">Nenhum / remover</option>
                        {referrers.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nomeCompleto} — {r.identificador}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <ProgramToggle
                      label="Latam pendente criação"
                      checked={!c.senhaLatamPass?.trim() ? true : ad.latamCreacaoPendente}
                      disabled={!c.senhaLatamPass?.trim()}
                      onChange={(v) => setAdminField(c.id, "latamCreacaoPendente", v)}
                    />
                    <ProgramToggle
                      label="Smiles pendente criação"
                      checked={!c.senhaSmiles?.trim() ? true : ad.smilesCreacaoPendente}
                      disabled={!c.senhaSmiles?.trim()}
                      onChange={(v) => setAdminField(c.id, "smilesCreacaoPendente", v)}
                    />
                    <ProgramToggle
                      label="Livelo pendente criação"
                      checked={!c.senhaLivelo?.trim() ? true : ad.liveloCreacaoPendente}
                      disabled={!c.senhaLivelo?.trim()}
                      onChange={(v) => setAdminField(c.id, "liveloCreacaoPendente", v)}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Sem senha do programa, fica pendente automaticamente. Com senha, você pode marcar manualmente.
                  </p>
                </Section>
              ) : null}

              <Section title="Credenciais para revisão">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <FieldText label="Senha do e-mail" value={c.senhaEmail} />
                  <FieldText label="Senha Latam Pass" value={c.senhaLatamPass} missing={!c.senhaLatamPass?.trim()} />
                  <FieldText label="Senha Smiles" value={c.senhaSmiles} missing={!c.senhaSmiles?.trim()} />
                  <FieldText label="Senha Livelo" value={c.senhaLivelo} missing={!c.senhaLivelo?.trim()} />
                  <FieldText label="Senha Esfera" value={c.senhaEsfera} />
                </div>
              </Section>

              <Section title="Pontos" subtitle="preencher antes de aprovar">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <FieldNumber label="Latam" value={d.pontosLatam} onChange={(v) => setDraftField(c.id, "pontosLatam", v)} />
                  <FieldNumber label="Smiles" value={d.pontosSmiles} onChange={(v) => setDraftField(c.id, "pontosSmiles", v)} />
                  <FieldNumber label="Livelo" value={d.pontosLivelo} onChange={(v) => setDraftField(c.id, "pontosLivelo", v)} />
                  <FieldNumber label="Esfera" value={d.pontosEsfera} onChange={(v) => setDraftField(c.id, "pontosEsfera", v)} />
                </div>
              </Section>

              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                <button
                  onClick={() => setConfirmAsk({ id: c.id, kind: "RECUSAR" })}
                  className="mr-auto inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  <XCircle size={16} /> Recusar
                </button>
                <button
                  onClick={() => setConfirmAsk({ id: c.id, kind: "APROVAR" })}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Check size={16} /> Apenas aprovar
                </button>
                <button
                  onClick={() => setConfirmAsk({ id: c.id, kind: "APROVAR_FILA" })}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  <ListPlus size={16} /> Aprovar + Fila de assinatura
                </button>
              </footer>
            </article>
          );
        })}
      </div>
      {confirmAsk ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="text-lg font-bold text-slate-900">{REVIEW_CONFIRM[confirmAsk.kind].title}</div>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {items.find((c) => c.id === confirmAsk.id)?.nomeCompleto || "Cedente"}
            </p>
            <p className="mt-1 text-sm text-slate-600">{REVIEW_CONFIRM[confirmAsk.kind].text}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={confirming}
                onClick={() => setConfirmAsk(null)}
                className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={confirming}
                onClick={async () => {
                  setConfirming(true);
                  const { id, kind } = confirmAsk;
                  await review(id, kind === "RECUSAR" ? "REJECT" : "APPROVE", kind === "APROVAR_FILA");
                  setConfirming(false);
                  setConfirmAsk(null);
                }}
                className={cn(
                  "h-10 rounded-xl px-4 text-sm font-semibold disabled:opacity-50",
                  REVIEW_CONFIRM[confirmAsk.kind].buttonCls
                )}
              >
                {confirming ? "Salvando…" : REVIEW_CONFIRM[confirmAsk.kind].button}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProgramToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
        checked ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <input
        type="checkbox"
        className="accent-amber-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

const LABEL = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

function whatsappHref(telefone?: string | null) {
  let d = String(telefone || "").replace(/\D+/g, "");
  if (!d) return null;
  while (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12) return null;
  return `https://wa.me/${d}`;
}

/** A data de nascimento é gravada como meia-noite UTC: formata em UTC para não voltar um dia. */
function fmtNascimento(v: string | null) {
  if (!v) return null;
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return null;
  const now = new Date();
  let idade = now.getUTCFullYear() - dt.getUTCFullYear();
  const m = now.getUTCMonth() - dt.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dt.getUTCDate())) idade--;
  return { data: dt.toLocaleDateString("pt-BR", { timeZone: "UTC" }), idade };
}

function initials(nome: string) {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* sem permissão de copiar */
        }
      }}
      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      title="Copiar"
    >
      {done ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    </button>
  );
}

function InfoTile({
  icon,
  label,
  value,
  hint,
  warn,
  copy,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  hint?: string;
  warn?: boolean;
  copy?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        warn ? "border-amber-200 bg-amber-50/50" : "border-slate-100 bg-slate-50/70"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {icon}
          {label}
        </span>
        <span className="flex items-center">
          {action}
          {copy && value ? <CopyButton text={value} /> : null}
        </span>
      </div>
      <p className="mt-0.5 break-all text-sm font-semibold text-slate-900">{value || "—"}</p>
      {hint ? <p className={cn("text-xs", warn ? "text-amber-800" : "text-slate-500")}>{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "indigo";
  children: React.ReactNode;
}) {
  return (
    <section className={cn("border-t border-slate-100 px-5 py-4", tone === "indigo" && "bg-indigo-50/40")}>
      <h3 className="mb-3 text-sm font-semibold text-slate-900">
        {title}
        {subtitle ? <span className="ml-1.5 font-normal text-slate-500">· {subtitle}</span> : null}
      </h3>
      {children}
    </section>
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
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input
        type="number"
        min={0}
        className={cn(INPUT, "tabular-nums")}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </label>
  );
}

function FieldText({
  label,
  value,
  missing,
}: {
  label: string;
  value: string | null;
  missing?: boolean;
}) {
  const v = value?.trim() || "";
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className={cn(LABEL, "mb-0")}>{label}</span>
        {missing ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            Pendente criação
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm",
          missing ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-900"
        )}
      >
        <span className="break-all font-mono">{v || "—"}</span>
        {v ? <CopyButton text={v} /> : null}
      </div>
    </div>
  );
}
