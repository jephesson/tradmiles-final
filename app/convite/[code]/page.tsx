"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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

export default function ConvitePage() {
  const params = useParams<{ code: string }>();

  const code = useMemo(() => {
    const raw = params?.code;
    if (!raw) return "";
    if (Array.isArray(raw)) return String(raw[0] || "").trim();
    return String(raw).trim();
  }, [params]);

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
        cache: "no-store",
      });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(`Resposta inválida da API (${res.status})`);
      }

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Convite inválido.");

      setData(json.data);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar convite.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!code) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="min-h-screen p-6 flex items-start justify-center">
      <div className="w-full max-w-xl rounded-2xl border p-6">
        <h1 className="text-2xl font-bold mb-2">Convite</h1>
        <p className="text-sm text-slate-600 mb-6">
          Link de convite do funcionário
        </p>

        {loading && (
          <div className="rounded-xl border p-4 text-sm">Carregando…</div>
        )}

        {!loading && error && (
          <div className="rounded-xl border p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4 text-sm">
              <b>Funcionário:</b>
              <div>Nome: {data.user.name}</div>
              <div>Login: {data.user.login}</div>
              <div>Time: {data.user.team}</div>
              <div>Cargo: {data.user.role}</div>
            </div>

            <div className="rounded-xl border p-4">
              <input
                className="w-full rounded-xl border px-3 py-2 text-xs"
                readOnly
                value={data.code}
              />
            </div>

            <button
              className="w-full rounded-xl bg-black px-4 py-2 text-white"
              onClick={() =>
                alert("Fluxo de aceite do convite será implementado aqui")
              }
            >
              Continuar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
