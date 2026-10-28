export const LATAM_FILA_ASSINATURA_PAX_LIMIT = 20;

export function latamPaxAposRenovacao(total: number, renewEndOfMonth: number) {
  return Math.max(0, Math.trunc(Number(total) || 0) - Math.trunc(Number(renewEndOfMonth) || 0));
}

/** Sem clube, sem emissão no mês corrente e menos de 20 pax após a queda do mês-12. */
export function isElegivelFilaAssinaturaLatam(input: {
  latamClubAtivoAgora: boolean;
  inFilaAssinatura?: boolean;
  issuedThisMonth: number;
  total: number;
  renewEndOfMonth: number;
}) {
  if (input.latamClubAtivoAgora) return false;
  if (input.inFilaAssinatura) return false;
  if (Math.trunc(Number(input.issuedThisMonth) || 0) > 0) return false;
  return (
    latamPaxAposRenovacao(input.total, input.renewEndOfMonth) <
    LATAM_FILA_ASSINATURA_PAX_LIMIT
  );
}
