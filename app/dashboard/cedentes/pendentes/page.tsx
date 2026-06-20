"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { isProgramCreacaoPendente } from "@/lib/cedentes/programCreacaoPendente";

type Owner = { id: string; name: string; login?: string | null; team?: string | null };

type Referrer = { id: string; identificador: string; nomeCompleto: string };

type Funcionario = { id: string; name: string; login: string; isActive?: boolean };

type Item = {
  id: string;
  nomeCompleto: string;
  cpf: string;

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
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);

  const [draft, setDraft] = useState<Record<string, PointsDraft>>({});
  const [adminDraft, setAdminDraft] = useState<Record<string, AdminDraft>>({});
  const [savingAdminId, setSavingAdminId] = useState<string | null>(null);

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

  async function review(id: string, action: "APPROVE" | "REJECT") {
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
    }

    const res = await fetch(`/api/cedentes/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!json?.ok) return alert(json?.error || "Erro ao revisar");

    await load();
  }

  async function saveAdminAdjustments(id: string) {
    const ad = adminDraft[id];
    if (!ad) return;

    setSavingAdminId(id);
    try {
      const res = await fetch(`/api/cedentes/${id}/pendente-admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: ad.ownerId || undefined,
          referredByCedenteId: ad.referredByCedenteId || null,
          latamCreacaoPendente: ad.latamCreacaoPendente,
          smilesCreacaoPendente: ad.smilesCreacaoPendente,
          liveloCreacaoPendente: ad.liveloCreacaoPendente,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao salvar.");
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingAdminId(null);
    }
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
    <div className="max-w-5xl">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cedentes pendentes</h1>
          <div className="text-sm text-slate-600">
            Total: <b>{totalPendentes}</b>
          </div>
        </div>

        <button
          onClick={() => void load()}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
        >
          Atualizar
        </button>
      </div>

      {loading && <div>Carregando...</div>}

      {!loading && items.length === 0 && (
        <div className="rounded-xl border p-4 text-sm text-slate-600">Nenhum pendente 🎉</div>
      )}

      <div className="space-y-3">
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

          return (
            <div key={c.id} className="rounded-2xl border p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-lg font-semibold">{c.nomeCompleto}</div>

                  <div className="mt-1 text-sm text-slate-600 space-y-1">
                    <div>
                      CPF: <b>{c.cpf}</b> · Telefone: <b>{c.telefone ?? "-"}</b>
                    </div>
                    <div>
                      Email: <b>{c.emailCriado ?? "-"}</b>
                    </div>
                    <div>
                      PIX: <b>{c.banco ?? "-"}</b> · <b>{c.pixTipo ?? "-"}</b> ·{" "}
                      <b>{c.chavePix ?? "-"}</b> · Titular:{" "}
                      <b>{c.titularConfirmado ? "Sim" : "Não"}</b>
                    </div>
                    <div>
                      Responsável: <b>{c.owner?.name ?? "-"}</b>
                    </div>
                    <div>
                      Indicação:{" "}
                      <b>
                        {c.referredByCedente
                          ? `${c.referredByCedente.nomeCompleto} (${c.referredByCedente.identificador})`
                          : "—"}
                      </b>
                    </div>
                    <div>
                      Criado em <b>{new Date(c.createdAt).toLocaleString("pt-BR")}</b>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3 text-sm min-w-[260px]">
                  <div className="font-medium mb-2">Campos faltando</div>
                  {missing.length === 0 ? (
                    <div className="text-slate-700">Nenhum ✅</div>
                  ) : (
                    <ul className="list-disc pl-5 text-slate-700">
                      {missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  )}
                  {programPending.length > 0 ? (
                    <div className="mt-3 border-t pt-2">
                      <div className="font-medium text-amber-800">Programas pendentes de criação</div>
                      <div className="mt-1 text-amber-900">{programPending.join(", ")}</div>
                    </div>
                  ) : null}
                </div>
              </div>

              {isAdmin && ad ? (
                <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
                  <div className="mb-3 font-semibold text-indigo-950">Ajustes admin (somente pendente)</div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">Funcionário responsável</span>
                      <select
                        className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
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
                      <span className="mb-1 block text-sm font-medium">Cedente que indicou</span>
                      <select
                        className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
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

                  <div className="mt-3 flex flex-wrap gap-4">
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
                  <p className="mt-2 text-xs text-slate-600">
                    Sem senha do programa, fica pendente automaticamente. Com senha, você pode marcar manualmente.
                  </p>

                  <button
                    type="button"
                    onClick={() => void saveAdminAdjustments(c.id)}
                    disabled={savingAdminId === c.id}
                    className={cn(
                      "mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800",
                      savingAdminId === c.id && "opacity-60"
                    )}
                  >
                    {savingAdminId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Salvar ajustes
                  </button>
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border p-4">
                <div className="mb-4 font-semibold">Credenciais para revisão</div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FieldText label="Senha do e-mail" value={c.senhaEmail} />
                  <FieldText label="Senha Smiles" value={c.senhaSmiles} missing={!c.senhaSmiles?.trim()} />
                  <FieldText label="Senha Latam Pass" value={c.senhaLatamPass} missing={!c.senhaLatamPass?.trim()} />
                  <FieldText label="Senha Livelo" value={c.senhaLivelo} missing={!c.senhaLivelo?.trim()} />
                  <FieldText label="Senha Esfera" value={c.senhaEsfera} />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border p-4">
                <div className="mb-2 font-semibold">Pontos (preencher antes de aprovar)</div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <FieldNumber
                    label="Latam"
                    value={d.pontosLatam}
                    onChange={(v) => setDraftField(c.id, "pontosLatam", v)}
                  />
                  <FieldNumber
                    label="Smiles"
                    value={d.pontosSmiles}
                    onChange={(v) => setDraftField(c.id, "pontosSmiles", v)}
                  />
                  <FieldNumber
                    label="Livelo"
                    value={d.pontosLivelo}
                    onChange={(v) => setDraftField(c.id, "pontosLivelo", v)}
                  />
                  <FieldNumber
                    label="Esfera"
                    value={d.pontosEsfera}
                    onChange={(v) => setDraftField(c.id, "pontosEsfera", v)}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => void review(c.id, "APPROVE")}
                  className="rounded-xl bg-black px-3 py-2 text-sm text-white hover:bg-slate-900"
                >
                  Aprovar e enviar para lista
                </button>

                <button
                  onClick={() => void review(c.id, "REJECT")}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Reprovar
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
    <label className={cn("inline-flex items-center gap-2 text-sm", disabled && "opacity-50")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
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

function FieldText({
  label,
  value,
  missing,
}: {
  label: string;
  value: string | null;
  missing?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm">
        {label}
        {missing ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Pendente criação
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "rounded-xl border px-3 py-2 text-sm break-all",
          missing ? "border-amber-200 bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-900"
        )}
      >
        {value?.trim() || "-"}
      </div>
    </div>
  );
}
