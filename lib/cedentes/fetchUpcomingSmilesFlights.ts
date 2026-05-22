import type { UpcomingSmilesFlight } from "@/lib/cedentes/upcomingSmilesFlights";

export async function fetchUpcomingSmilesFlightsForCedente(
  cedenteId: string
): Promise<UpcomingSmilesFlight[]> {
  const res = await fetch(
    `/api/cedentes/exclusao-definitiva?cedenteId=${encodeURIComponent(cedenteId)}`,
    { cache: "no-store", credentials: "include" }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || "Falha ao verificar voos Smiles.");
  }
  return Array.isArray(json?.upcomingSmilesFlights)
    ? (json.upcomingSmilesFlights as UpcomingSmilesFlight[])
    : [];
}
