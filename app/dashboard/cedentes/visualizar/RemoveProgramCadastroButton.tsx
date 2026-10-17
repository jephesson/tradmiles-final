"use client";

import { useState } from "react";
import { UserMinus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fetchUpcomingSmilesFlightsForCedente } from "@/lib/cedentes/fetchUpcomingSmilesFlights";
import { appendSmilesFlightsToExclusaoConfirm } from "@/lib/cedentes/upcomingSmilesFlightsShared";
import { VP_CONTROL_INPUT, VP_MODAL_BACKDROP, VP_MODAL_PANEL } from "./visualizarPontosUi";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA" | "IBERIA";

const PROGRAM_LABEL: Record<Program, string> = {
  LATAM: "LATAM",
  SMILES: "Smiles",
  LIVELO: "Livelo",
  ESFERA: "Esfera",
  IBERIA: "Iberia",
};

export function RemoveProgramCadastroButton({
  program,
  cedenteId,
  nomeCompleto,
  identificador,
  className,
  onRemoved,
}: {
  program: Program;
  cedenteId: string;
  nomeCompleto: string;
  identificador: string;
  className?: string;
  onRemoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const label = PROGRAM_LABEL[program];

  async function confirmRemove() {
    const code = totpCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      alert("Informe o código de 6 dígitos do Authenticator.");
      return;
    }

    setBusy(true);
    try {
      let upcoming = [] as Awaited<ReturnType<typeof fetchUpcomingSmilesFlightsForCedente>>;
      if (program === "SMILES") {
        upcoming = await fetchUpcomingSmilesFlightsForCedente(cedenteId);
      }
      const base = `Remover o cadastro ${label} de ${nomeCompleto} (${identificador})?\n\nSó este programa some das listas. Os outros programas e as vendas já feitas continuam.`;
      const msg =
        program === "SMILES" ? appendSmilesFlightsToExclusaoConfirm(base, upcoming) : base;
      if (!confirm(msg)) return;

      const res = await fetch("/api/cedentes/exclusao-definitiva", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedenteId,
          mode: "PROGRAM",
          program,
          reasonCode: "PROGRAM_REMOVED",
          totpCode: code,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Falha ao remover o cadastro deste programa.");
      }
      setOpen(false);
      setTotpCode("");
      onRemoved();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Falha ao remover o cadastro.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTotpCode("");
          setOpen(true);
        }}
        className={cn(
          "group relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-300 text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-800",
          className
        )}
        title={`Remover cadastro ${label}`}
      >
        <UserMinus size={15} />
        <span className="sr-only">Remover cadastro {label}</span>
        <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
          Remover {label}
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className={VP_MODAL_BACKDROP}
            aria-label="Cancelar"
            onClick={() => !busy && setOpen(false)}
          />
          <div className={cn(VP_MODAL_PANEL, "w-[min(94vw,440px)]")}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold tracking-tight text-slate-900">
                  Remover cadastro {label}
                </div>
                <div className="text-sm text-slate-500">
                  {nomeCompleto} • {identificador}
                </div>
              </div>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Sai só da lista e do painel deste programa. Os demais programas ficam.
            </p>
            <label className="mt-4 block">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Código do Authenticator
              </div>
              <input
                className={cn(VP_CONTROL_INPUT, "font-mono tracking-[0.35em]")}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="h-10 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => void confirmRemove()}
                disabled={busy || totpCode.replace(/\s/g, "").length !== 6}
              >
                {busy ? "Removendo..." : `Remover ${label}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
