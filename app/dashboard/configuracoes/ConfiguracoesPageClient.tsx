"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock, Save } from "lucide-react";
import { cn } from "@/lib/cn";
import { bpsToPercentNumber } from "@/lib/payouts/employeeCommissionRates";

type ApiOk = {
  ok: true;
  data: { employeeC1Bps: number; employeeBonusAboveMetaBps: number; vendorCommissionBps: number };
};
type ApiErr = { ok: false; error?: string; code?: string };

async function fetchCommission(): Promise<
  { ok: true; data: ApiOk["data"] } | { ok: false; status: number; body: ApiErr }
> {
  const res = await fetch("/api/settings/employee-commission", {
    cache: "no-store",
    credentials: "include",
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const ok = res.ok && body.ok === true && body.data && typeof body.data === "object";
  if (ok) {
    return { ok: true, data: body.data as ApiOk["data"] };
  }
  return {
    ok: false,
    status: res.status,
    body: {
      ok: false,
      error: typeof body.error === "string" ? body.error : undefined,
      code: typeof body.code === "string" ? body.code : undefined,
    },
  };
}

async function apiPostCommission(body: unknown): Promise<ApiOk> {
  const res = await fetch("/api/settings/employee-commission", {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.ok !== true) {
    const msg = typeof json.error === "string" ? json.error : `Erro (${res.status})`;
    throw new Error(msg);
  }
  return json as unknown as ApiOk;
}

export default function ConfiguracoesPageClient() {
  const [booting, setBooting] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityErr, setSecurityErr] = useState<string | null>(null);

  const [c1Percent, setC1Percent] = useState("1");
  const [bonusPercent, setBonusPercent] = useState("30");
  const [vendorPercent, setVendorPercent] = useState("1");

  const applyCommissionData = useCallback((data: ApiOk["data"]) => {
    setC1Percent(
      bpsToPercentNumber(data.employeeC1Bps).toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      })
    );
    setBonusPercent(
      bpsToPercentNumber(data.employeeBonusAboveMetaBps).toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      })
    );
    setVendorPercent(
      bpsToPercentNumber(data.vendorCommissionBps).toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      })
    );
  }, []);

  const tryLoadCommission = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchCommission();
      if (r.ok) {
        applyCommissionData(r.data);
        setUnlocked(true);
        return;
      }
      if (r.status === 403 && r.body?.code === "SETTINGS_GATE_REQUIRED") {
        setUnlocked(false);
        return;
      }
      setErr(r.body?.error || `Erro (${r.status})`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [applyCommissionData]);

  useEffect(() => {
    void (async () => {
      setBooting(true);
      setErr(null);
      const r = await fetchCommission();
      if (r.ok) {
        applyCommissionData(r.data);
        setUnlocked(true);
      } else if (r.status === 403 && r.body?.code === "SETTINGS_GATE_REQUIRED") {
        setUnlocked(false);
      } else {
        setErr(r.body?.error || `Erro (${r.status})`);
        setUnlocked(false);
      }
      setBooting(false);
    })();
  }, [applyCommissionData]);

  async function submitSecurity() {
    setSecurityBusy(true);
    setSecurityErr(null);
    try {
      const res = await fetch("/api/settings/security-verify", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: securityAnswer }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSecurityErr(json?.error || "Não foi possível validar.");
        return;
      }
      setSecurityAnswer("");
      await tryLoadCommission();
    } catch {
      setSecurityErr("Erro de rede.");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const c1 = Number(String(c1Percent).replace(",", "."));
      const bonus = Number(String(bonusPercent).replace(",", "."));
      const vendor = Number(String(vendorPercent).replace(",", "."));
      await apiPostCommission({
        employeeC1Percent: c1,
        employeeBonusAboveMetaPercent: bonus,
        vendorCommissionPercent: vendor,
      });
      await tryLoadCommission();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (booting) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 p-12 text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <span className="text-sm font-medium">Carregando…</span>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-lg space-y-6 p-4 sm:p-6">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Voltar
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Configurações</h1>
          <p className="mt-1 text-sm text-slate-600">Confirme a pergunta de segurança para continuar.</p>
        </div>

        <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 to-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Lock className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-slate-900">Pergunta de segurança</h2>
              <p className="mt-2 text-sm font-medium text-slate-800">Qual a sua cidade favorita?</p>
              <label className="mt-4 block">
                <span className="sr-only">Resposta</span>
                <input
                  type="text"
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitSecurity();
                  }}
                  disabled={securityBusy}
                  placeholder="Digite a resposta"
                />
              </label>
              {securityErr ? (
                <p className="mt-2 text-sm text-rose-700">{securityErr}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void submitSecurity()}
                disabled={securityBusy || !securityAnswer.trim()}
                className={cn(
                  "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:w-auto",
                  (securityBusy || !securityAnswer.trim()) && "pointer-events-none opacity-50"
                )}
              >
                {securityBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {securityBusy ? "Verificando…" : "Confirmar acesso"}
              </button>
            </div>
          </div>
        </div>

        {err ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Configurações</h1>
        <p className="mt-1 text-sm text-slate-600">
          Parâmetros globais do sistema. Valores atuais já refletem o que estava em uso (C1 = 1% do PV sem
          taxa; bônus sobre excedente da meta = 30%; comissão vendedor em compras = 1%).
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Comissões de funcionários</h2>
        <p className="mt-1 text-sm text-slate-600">
          Usados ao registrar vendas (C1/C2 gravados na venda) e nos recálculos de pagamentos de funcionários.
        </p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Percentual C1 (sobre o valor dos pontos, PV sem taxa de embarque)
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              value={c1Percent}
              onChange={(e) => setC1Percent(e.target.value)}
              disabled={loading || saving}
              placeholder="1"
            />
            <span className="mt-1 block text-xs text-slate-500">Padrão histórico: 1%. Máximo permitido aqui: 20%.</span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Percentual do bônus sobre o excedente acima do milheiro de meta (C2)
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              value={bonusPercent}
              onChange={(e) => setBonusPercent(e.target.value)}
              disabled={loading || saving}
              placeholder="30"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Padrão histórico: 30% do valor (em R$) do excedente do milheiro em relação à meta. Máximo: 100%.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Comissão vendedor em compras (sobre subtotal)
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              value={vendorPercent}
              onChange={(e) => setVendorPercent(e.target.value)}
              disabled={loading || saving}
              placeholder="1"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Padrão: 1% sobre o subtotal da compra. Aplicado automaticamente em novas compras. Máximo: 20%.
            </span>
          </label>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {err}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800",
              (loading || saving) && "pointer-events-none opacity-60"
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => void tryLoadCommission()}
            disabled={loading || saving}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Recarregar
          </button>
        </div>
      </div>
    </div>
  );
}
