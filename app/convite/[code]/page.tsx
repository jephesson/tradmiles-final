"use client";

import { useEffect, useMemo, useState } from "react";

type InviteData = {
  code: string;
  user: {
    id: string;
    name: string;
    login: string;
    team: string;
    role: "admin" | "staff";
  };
};

export default function ConvitePage({
  params,
}: {
  params: { code: string };
}) {
  const code = useMemo(() => String(params?.code || "").trim(), [params]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<InviteData | null>(null);

  async function load() {
    if (!code) return;

    try {
      setLoading(true);
      setError("");
      setData(null);

      const res = await fetch(`/api/convite/${encodeURIComponent(code)}`, {
        method: "GET",
        cache: "no-store",
      });

      // evita o erro "Unexpected token <" caso venha HTML
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `API não retornou JSON (status ${res.status}). ${text.slice(0, 80)}`
        );
      }

      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Convite inválido.");

      setData(json.data as InviteData);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar convite.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="min-h-screen p-6 flex items-start justify-center">
      <div className="w-full max-w-xl rounded-2xl border p-6">
        <h1 className="text-2xl font-bold mb-2">Convite</h1>
        <p className="text-sm text-slate-600 mb-6">
          Link de convite do funcionário.
        </p>

        {loading && (
          <div className="rounded-xl border p-4 text-sm text-slate-700">
            Carregando...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border p-4">
            <div className="text-sm font-semibold mb-2">Convite inválido</div>
            <div className="text-sm text-slate-700">{error}</div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={load}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                Tentar de novo
              </button>

              <button
                type="button"
                onClick={() => (window.location.href = "/")}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                Ir para início
              </button>
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <div className="text-sm font-semibold mb-2">Funcionário</div>
              <div className="text-sm text-slate-700">
                <div><b>Nome:</b> {data.user.name}</div>
                <div><b>Login:</b> {data.user.login}</div>
                <div><b>Time:</b> {data.user.team}</div>
                <div><b>Cargo:</b> {data.user.role}</div>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-sm font-semibold mb-2">Código</div>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-xl border px-3 py-2 text-xs"
                  readOnly
                  value={data.code}
                />
                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 text-sm"
                  onClick={() => navigator.clipboard.writeText(data.code)}
                >
                  Copiar
                </button>
              </div>
            </div>

            {/* Aqui depois você pode colocar o fluxo real do convite (ex.: aceitar termo / criar conta cedente / etc.) */}
            <button
              type="button"
              className="w-full rounded-xl bg-black px-4 py-2 text-white"
              onClick={() => alert("Próximo passo: implementar a tela de aceite/fluxo do convite.")}
            >
              Continuar
            </button>
          </div>
        )}

        <div className="mt-10 text-center text-xs text-slate-400">
          Desenvolvido por Dr. Jephesson Santos
        </div>
      </div>
    </div>
  );
}
