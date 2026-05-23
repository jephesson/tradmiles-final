export type UpcomingSmilesFlight = {
  saleId: string;
  numero: string;
  locator: string | null;
  departureDate: string | null;
  returnDate: string | null;
  departureAirportIata: string | null;
  /** Próxima data relevante (ida ou volta), ISO */
  nextEventAt: string;
};

function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function formatUpcomingSmilesFlightsWarning(flights: UpcomingSmilesFlight[]): string {
  if (!flights.length) return "";

  const lines = flights.map((f, i) => {
    const ida = fmtDateBR(f.departureDate);
    const volta = fmtDateBR(f.returnDate);
    const loc = f.locator?.trim() ? ` • loc. ${f.locator.trim()}` : "";
    const iata = f.departureAirportIata?.trim()
      ? ` (${f.departureAirportIata.trim()})`
      : "";

    const parts: string[] = [];
    if (ida) parts.push(`Ida: ${ida}${iata}`);
    if (volta) parts.push(`Volta: ${volta}`);

    const when =
      parts.length > 0
        ? parts.join(" • ")
        : `Próximo evento: ${fmtDateBR(f.nextEventAt) || "—"}`;

    return `${i + 1}. Venda ${f.numero}${loc}\n   ${when}`;
  });

  return [
    "",
    `⚠️ ATENÇÃO: há ${flights.length} voo(s) Smiles ainda por ocorrer:`,
    "",
    ...lines,
    "",
  ].join("\n");
}

export function appendSmilesFlightsToExclusaoConfirm(
  baseMessage: string,
  flights: UpcomingSmilesFlight[]
): string {
  const warning = formatUpcomingSmilesFlightsWarning(flights);
  if (!warning) return baseMessage;
  return `${baseMessage}${warning}Deseja mesmo continuar com a exclusão?`;
}
