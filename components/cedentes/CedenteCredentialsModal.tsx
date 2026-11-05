"use client";

import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";
import { VerificationCodeFetch } from "@/components/cedentes/VerificationCodeFetch";

export type CredentialsCedente = {
  id: string;
  nomeCompleto: string;
  identificador: string;
  cpf: string;
};

type Creds = {
  cpf: string;
  email: string | null;
  senhaEmail: string | null;
  senhaLatam: string | null;
  senhaLivelo: string | null;
};

async function fetchCreds(cedenteId: string, program: "LATAM" | "LIVELO") {
  const res = await fetch(
    `/api/cedentes/credentials?cedenteId=${encodeURIComponent(cedenteId)}&program=${program}`,
    { cache: "no-store" }
  );
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Falha ao carregar credenciais ${program}.`);
  }
  return json.data || {};
}

/** Credenciais LATAM/LIVELO do cedente + código de verificação do e-mail (LATAM). */
export function CedenteCredentialsModal({
  cedente,
  onClose,
}: {
  cedente: CredentialsCedente;
  onClose: () => void;
}) {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState("");

  useEffect(() => {
    let alive = true;
    setCreds(null);
    setError("");
    Promise.all([fetchCreds(cedente.id, "LATAM"), fetchCreds(cedente.id, "LIVELO")])
      .then(([latam, livelo]) => {
        if (!alive) return;
        setCreds({
          cpf: String(latam.cpf || cedente.cpf || ""),
          email: latam.email ?? livelo.email ?? null,
          senhaEmail: latam.senhaEmail ?? livelo.senhaEmail ?? null,
          senhaLatam: latam.senhaPrograma ?? null,
          senhaLivelo: livelo.senhaPrograma ?? null,
        });
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Falha ao carregar credenciais.");
      });
    return () => {
      alive = false;
    };
  }, [cedente.id, cedente.cpf]);

  async function copyValue(field: string, value: string | null | undefined) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(""), 1200);
    } catch {
      // noop
    }
  }

  const fields: { key: keyof Creds; label: string; wide?: boolean }[] = [
    { key: "cpf", label: "CPF (login)" },
    { key: "senhaLatam", label: "Senha LATAM" },
    { key: "senhaLivelo", label: "Senha LIVELO" },
    { key: "email", label: "E-mail" },
    { key: "senhaEmail", label: "Senha do e-mail", wide: true },
  ];

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-label="Fechar credenciais"
        onClick={onClose}
      />
      <div className="absolute left-1/2 top-1/2 max-h-[92vh] w-[min(94vw,700px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Credenciais</div>
            <div className="text-sm text-slate-500">
              {cedente.nomeCompleto} • {cedente.identificador}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-slate-600 hover:bg-slate-100"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {!creds && !error ? (
          <div className="rounded-xl border bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Carregando credenciais…
          </div>
        ) : creds ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={`rounded-xl border bg-slate-50 p-3${f.wide ? " md:col-span-2" : ""}`}>
                <div className="text-xs uppercase tracking-wide text-slate-500">{f.label}</div>
                <div className="mt-1 break-all font-medium">{creds[f.key] || "-"}</div>
                <button
                  type="button"
                  onClick={() => copyValue(f.key, creds[f.key])}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  <Copy size={13} /> {copiedField === f.key ? "Copiado" : "Copiar"}
                </button>
              </div>
            ))}

            <div className="md:col-span-2">
              <VerificationCodeFetch cedenteId={cedente.id} program="LATAM" email={creds.email} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
