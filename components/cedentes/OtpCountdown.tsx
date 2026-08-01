"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  formatOtpCountdown,
  otpRemainingMs,
  OTP_VALIDITY_MS,
} from "@/lib/gmail/otp";

type Program = "LATAM" | "SMILES";

type Props = {
  arrivedIso: string | null | undefined;
  program: Program;
  className?: string;
};

/** Contador regressivo da validade (ex.: Smiles = 5 min desde a chegada). */
export function OtpCountdown({ arrivedIso, program, className }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!arrivedIso) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [arrivedIso]);

  const remaining = otpRemainingMs(arrivedIso, program, now);
  if (remaining == null) return null;

  const total = OTP_VALIDITY_MS[program];
  const expired = remaining <= 0;
  const urgent = !expired && remaining <= 60_000;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        expired
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : urgent
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-sky-200 bg-sky-50 text-sky-950",
        className
      )}
      title={`Válido por ${Math.round(total / 60_000)} min a partir da chegada do e-mail`}
    >
      {expired ? (
        "Código expirado (5 min)"
      ) : (
        <>
          <span className="opacity-80">Expira em</span>
          <span className="font-mono text-xs">{formatOtpCountdown(remaining)}</span>
        </>
      )}
    </div>
  );
}
