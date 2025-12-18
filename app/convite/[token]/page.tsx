"use client";

import { useEffect, useMemo, useState } from "react";

type HintData = {
  nomeHint: string | null;
  cpfHint: string | null;
};

export default function ConviteCedentePage({
  params,
}: {
  params: { token: string };
}) {
  const token = useMemo(() => String(params?.token || "").trim(), [params]);

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [hint, setHint] = useState<HintData>({ nomeHint: null, cpfHint: null });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/cedentes/invites/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });

        const json = await res.json();
        if (!json?.ok) {
          setValid(false);
          setError(json?.error || "Convite inválido.");
          return;
        }

        setHint(json.data);
        setValid(true);
      } catch (e: any) {
        setValid(false);
        setError(e?.message || "Erro ao validar convite.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return <div className="p-6">Validando convite...</div>;
  if (!valid) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Convite válido ✅</h1>
      <p className="text-sm text-slate-600">
        Nome sugerido: {hint.nomeHint ?? "—"} <br />
        CPF sugerido: {hint.cpfHint ?? "—"}
      </p>
    </div>
  );
}
