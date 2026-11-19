"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, CreditCard, Eye, KeyRound, Link2, Loader2, MessageCircle, Plus, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { startViewAsEmissor } from "@/lib/viewAsEmissor";

type Emissor = {
  id: string;
  name: string;
  login: string;
  cpf: string | null;
  pixTipo: string | null;
  chavePix: string | null;
  isActive: boolean;
  totpEnabled: boolean;
  linkedSocioId: string | null;
  defaultFeeCardId: string | null;
  email: string | null;
  whatsapp: string | null;
  bankName: string | null;
  contractVersion: string | null;
  contractAcceptedAt: string | null;
  createdAt: string;
};
type Socio = { id: string; name: string; login: string; defaultCardId: string | null };
type Card = { id: string; label: string; last4: string; isCompany: boolean; userId: string | null };
type Invite = {
  id: string;
  url: string;
  socio: { name: string; login: string } | null;
  emissor: { name: string; login: string } | null;
  createdAt: string;
  expiresAt: string;
  status: "ABERTO" | "USADO" | "CANCELADO" | "EXPIRADO";
};

const INVITE_BADGE: Record<Invite["status"], string> = {
  ABERTO: "bg-sky-50 text-sky-700 ring-sky-200",
  USADO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELADO: "bg-slate-100 text-slate-500 ring-slate-200",
  EXPIRADO: "bg-amber-50 text-amber-700 ring-amber-200",
};

const INPUT =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const PIX_TIPOS = ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"];

function firstName(n: string) {
  return String(n || "").trim().split(/\s+/)[0] || n;
}

const EMPTY_FORM = {
  name: "",
  login: "",
  password: "",
  cpf: "",
  pixTipo: "CPF",
  chavePix: "",
  linkedSocioId: "",
  defaultFeeCardId: "",
  sameAuthenticator: false,
};

export default function EmissoresClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [emissores, setEmissores] = useState<Emissor[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSocio, setInviteSocio] = useState("");
  const [inviteCard, setInviteCard] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [newLink, setNewLink] = useState("");
  const [copied, setCopied] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/emissores", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setEmissores(json.data.emissores || []);
      setSocios(json.data.socios || []);
      setCards(json.data.cards || []);
      const inv = await fetch("/api/emissores/convites", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (inv?.ok) setInvites(inv.data || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const socioById = useMemo(() => new Map(socios.map((s) => [s.id, s])), [socios]);

  function cardsFor(socioId: string) {
    // Empresa + cartões de todos os sócios (o do sócio vinculado primeiro).
    return [...cards].sort((a, b) => {
      const rank = (c: Card) => (c.userId === socioId ? 0 : c.isCompany ? 1 : 2);
      return rank(a) - rank(b);
    });
  }

  function cardLabel(c: Card) {
    const owner = c.isCompany ? "Vias Aéreas" : firstName(socioById.get(String(c.userId))?.name || "Sócio");
    return `${owner} · ${c.label} · •••• ${c.last4}`;
  }

  async function create() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/emissores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao cadastrar.");
      setForm(EMPTY_FORM);
      setFormOpen(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao cadastrar.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, data: Record<string, unknown>) {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/emissores?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao salvar.");
      setEmissores((prev) => prev.map((e) => (e.id === id ? json.data : e)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusyId("");
    }
  }

  async function createInvite() {
    setInviteBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/emissores/convites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedSocioId: inviteSocio, defaultFeeCardId: inviteCard }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao gerar link.");
      setNewLink(json.data.url);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao gerar link.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvite(id: string) {
    if (!window.confirm("Cancelar este link? Quem tiver o link não consegue mais se cadastrar.")) return;
    const res = await fetch(`/api/emissores/convites?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return setErr(json?.error || "Falha ao cancelar.");
    await load();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      window.prompt("Copie o link:", text);
    }
  }

  function whatsText(url: string) {
    return `https://wa.me/?text=${encodeURIComponent(
      `Olá! Segue o link para você se cadastrar como emissor da Vias Aéreas. Preencha seus dados, crie sua senha, configure o Google Authenticator e aceite o contrato: ${url}`
    )}`;
  }

  function resetPassword(e: Emissor) {
    const pwd = window.prompt(`Nova senha para @${e.login} (mínimo 6 caracteres):`, "");
    if (!pwd) return;
    void patch(e.id, { password: pwd });
  }

  function resetAuthenticator(e: Emissor) {
    if (!window.confirm(`Zerar o autenticador de @${e.login}? No próximo login ele configura de novo.`)) return;
    void patch(e.id, { resetAuthenticator: true });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-700 ring-1 ring-emerald-200">
            <Users size={14} /> CADASTRO
          </span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Emissores</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Emissores só fazem vendas e veem o Painel de emissões. Cada um responde a um sócio: as vendas dele
            contam no bônus desse sócio. Recebem só C1 e C2, e a taxa de embarque sai do cartão de um sócio ou da
            Vias Aéreas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setInviteOpen((v) => !v);
            setNewLink("");
          }}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          <Link2 size={16} /> Gerar link de cadastro
        </button>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
        >
          {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Fechar" : "Cadastrar manualmente"}
        </button>
        </div>
      </header>

      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div> : null}

      {inviteOpen ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
            <Link2 size={18} /> Link de cadastro (uso único, vale 7 dias)
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            O emissor preenche nome, e-mail, nascimento, telefone, CPF, banco e PIX, cria a senha, configura o Google
            Authenticator e aceita o contrato. Ao concluir, ele já aparece aqui e nos pagamentos.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className={LABEL}>Sócio vinculado</span>
              <select
                className={INPUT}
                value={inviteSocio}
                onChange={(e) => {
                  setInviteSocio(e.target.value);
                  setInviteCard(socioById.get(e.target.value)?.defaultCardId || "");
                }}
              >
                <option value="">Escolha…</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (@{s.login})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Cartão padrão da taxa</span>
              <select
                className={INPUT}
                value={inviteCard}
                disabled={!inviteSocio}
                onChange={(e) => setInviteCard(e.target.value)}
              >
                <option value="">Padrão do sócio</option>
                {cardsFor(inviteSocio).map((c) => (
                  <option key={c.id} value={c.id}>
                    {cardLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void createInvite()}
                disabled={inviteBusy || !inviteSocio}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {inviteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 size={16} />} Gerar link
              </button>
            </div>
          </div>
          {newLink ? (
            <div className="mt-4 rounded-xl border border-emerald-300 bg-white p-3">
              <div className="break-all font-mono text-xs text-slate-800">{newLink}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copy(newLink)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {copied === newLink ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} Copiar link
                </button>
                <a
                  href={whatsText(newLink)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <MessageCircle size={14} /> Enviar no WhatsApp
                </a>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {formOpen ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
            <UserPlus size={18} /> Novo emissor
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className={LABEL}>Nome completo</span>
              <input className={INPUT} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
              <span className={LABEL}>Login</span>
              <input
                className={INPUT}
                value={form.login}
                placeholder="ex.: maria.silva"
                onChange={(e) => setForm({ ...form, login: e.target.value.toLowerCase().trim() })}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Senha (mín. 6)</span>
              <input
                className={INPUT}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Sócio vinculado</span>
              <select
                className={INPUT}
                value={form.linkedSocioId}
                onChange={(e) => {
                  const s = socioById.get(e.target.value);
                  setForm({ ...form, linkedSocioId: e.target.value, defaultFeeCardId: s?.defaultCardId || "" });
                }}
              >
                <option value="">Escolha…</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (@{s.login})
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className={LABEL}>Cartão padrão da taxa</span>
              <select
                className={INPUT}
                value={form.defaultFeeCardId}
                disabled={!form.linkedSocioId}
                onChange={(e) => setForm({ ...form, defaultFeeCardId: e.target.value })}
              >
                <option value="">Padrão do sócio</option>
                {cardsFor(form.linkedSocioId).map((c) => (
                  <option key={c.id} value={c.id}>
                    {cardLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>CPF (opcional)</span>
              <input
                className={INPUT}
                value={form.cpf}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Tipo da chave PIX</span>
              <select className={INPUT} value={form.pixTipo} onChange={(e) => setForm({ ...form, pixTipo: e.target.value })}>
                {PIX_TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Chave PIX (para receber C1/C2)</span>
              <input className={INPUT} value={form.chavePix} onChange={(e) => setForm({ ...form, chavePix: e.target.value })} />
            </label>
          </div>
          <label className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.sameAuthenticator}
              onChange={(e) => setForm({ ...form, sameAuthenticator: e.target.checked })}
            />
            <span>
              <b>Usar o mesmo Google Authenticator do meu login.</b> Use só para uma conta de teste sua. Sem marcar, o emissor
              configura o autenticador dele no primeiro login.
            </span>
          </label>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void create()}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus size={16} />} Cadastrar
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-900">
          {emissores.length} emissor{emissores.length === 1 ? "" : "es"}
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : !emissores.length ? (
          <div className="py-12 text-center text-sm text-slate-500">Nenhum emissor cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Emissor</th>
                  <th className="px-4 py-3">Sócio vinculado</th>
                  <th className="px-4 py-3">
                    <CreditCard className="mr-1 inline h-3.5 w-3.5" /> Cartão padrão da taxa
                  </th>
                  <th className="px-4 py-3">Acesso</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {emissores.map((e) => {
                  const busy = busyId === e.id;
                  return (
                    <tr key={e.id} className={cn(!e.isActive && "bg-slate-50 text-slate-400", busy && "opacity-60")}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{e.name}</div>
                        <div className="text-xs text-slate-500">
                          @{e.login}
                          {e.chavePix ? ` · PIX ${e.pixTipo}: ${e.chavePix}` : " · sem PIX"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {[e.email, e.whatsapp ? `+${e.whatsapp}` : null, e.bankName].filter(Boolean).join(" · ")}
                        </div>
                        <div className={cn("text-[11px]", e.contractAcceptedAt ? "text-emerald-700" : "text-amber-700")}>
                          {e.contractAcceptedAt
                            ? `Contrato aceito em ${new Date(e.contractAcceptedAt).toLocaleString("pt-BR")}`
                            : "Contrato ainda não aceito"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className={cn(INPUT, "h-9")}
                          value={e.linkedSocioId || ""}
                          disabled={busy}
                          onChange={(ev) => void patch(e.id, { linkedSocioId: ev.target.value, defaultFeeCardId: "" })}
                        >
                          <option value="">—</option>
                          {socios.map((s) => (
                            <option key={s.id} value={s.id}>
                              {firstName(s.name)} (@{s.login})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className={cn(INPUT, "h-9")}
                          value={e.defaultFeeCardId || ""}
                          disabled={busy || !e.linkedSocioId}
                          onChange={(ev) => void patch(e.id, { defaultFeeCardId: ev.target.value })}
                        >
                          <option value="">Padrão do sócio</option>
                          {cardsFor(String(e.linkedSocioId || "")).map((c) => (
                            <option key={c.id} value={c.id}>
                              {cardLabel(c)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 font-semibold ring-1",
                              e.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"
                            )}
                          >
                            {e.isActive ? "Ativo" : "Suspenso"}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1",
                              e.totpEnabled ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-amber-50 text-amber-700 ring-amber-200"
                            )}
                          >
                            <ShieldCheck size={12} /> {e.totpEnabled ? "Autenticador ok" : "Configura no 1º login"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              startViewAsEmissor({ id: e.id, name: e.name });
                              window.location.href = "/dashboard/vendas/nova";
                            }}
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-400 px-2.5 text-xs font-bold text-amber-950 hover:bg-amber-300"
                            title="Ver o sistema como este emissor vê (só visualização)"
                          >
                            <Eye size={13} /> Ver como
                          </button>
                          <button
                            type="button"
                            onClick={() => resetPassword(e)}
                            disabled={busy}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <KeyRound size={13} /> Senha
                          </button>
                          <button
                            type="button"
                            onClick={() => resetAuthenticator(e)}
                            disabled={busy || !e.totpEnabled}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            <ShieldCheck size={13} /> Zerar 2FA
                          </button>
                          <button
                            type="button"
                            onClick={() => void patch(e.id, { isActive: !e.isActive })}
                            disabled={busy}
                            className={cn(
                              "h-8 rounded-lg px-2.5 text-xs font-semibold",
                              e.isActive ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-emerald-600 text-white hover:bg-emerald-700"
                            )}
                          >
                            {e.isActive ? "Suspender" : "Reativar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {invites.length ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-900">Links de cadastro</div>
          <ul className="divide-y divide-slate-100">
            {invites.map((iv) => (
              <li key={iv.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", INVITE_BADGE[iv.status])}>
                  {iv.status === "ABERTO" ? "Aberto" : iv.status === "USADO" ? "Usado" : iv.status === "CANCELADO" ? "Cancelado" : "Expirado"}
                </span>
                <span className="text-slate-700">
                  Sócio <b>{iv.socio ? firstName(iv.socio.name) : "—"}</b>
                  {iv.emissor ? (
                    <>
                      {" "}
                      · cadastrou <b>{iv.emissor.name}</b> (@{iv.emissor.login})
                    </>
                  ) : null}
                </span>
                <span className="text-xs text-slate-500">
                  criado {new Date(iv.createdAt).toLocaleDateString("pt-BR")}
                  {iv.status === "ABERTO" ? ` · vale até ${new Date(iv.expiresAt).toLocaleDateString("pt-BR")}` : ""}
                </span>
                {iv.status === "ABERTO" ? (
                  <span className="ml-auto flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copy(iv.url)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {copied === iv.url ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />} Copiar
                    </button>
                    <a
                      href={whatsText(iv.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={() => void revokeInvite(iv.id)}
                      className="h-8 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Cancelar
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
