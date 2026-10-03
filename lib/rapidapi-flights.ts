import type { SerpApiCheapestFlight, SerpApiFlightFilters } from "@/lib/serpapi-flights";

type RapidOffer = {
  price?: unknown;
  price_as_number?: unknown;
  duration?: unknown;
  duration_seconds?: unknown;
  airline?: unknown;
  stops?: unknown;
  departure_description?: unknown;
  arrival_description?: unknown;
  buy_link?: unknown;
};

function hourFromClock(raw?: string | null) {
  const m = /^(\d{1,2}):/.exec(String(raw || "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.min(23, Math.max(0, n)) : null;
}

function clockFromDescription(raw: unknown) {
  const s = String(raw || "");
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(s);
  if (!m) {
    const h24 = /(\d{1,2}):(\d{2})/.exec(s);
    return h24 ? `${h24[1].padStart(2, "0")}:${h24[2]}` : "";
  }
  let h = Number(m[1]) % 12;
  if (String(m[3]).toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function priceNumber(offer: RapidOffer) {
  const n = Number(offer.price_as_number);
  if (Number.isFinite(n) && n > 0) return n;
  const raw = String(offer.price || "");
  const parsed = Number(raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function asList(data: unknown): RapidOffer[] {
  if (Array.isArray(data)) return data as RapidOffer[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["flights", "results", "data", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as RapidOffer[];
    }
  }
  return [];
}

export function rapidApiFlightsConfigured() {
  return Boolean(String(process.env.RAPIDAPI_KEY || "").trim());
}

export async function searchRapidApiGoogleFlightsCheapest(
  origin: string,
  dest: string,
  dateISO: string,
  filters: SerpApiFlightFilters = {}
): Promise<SerpApiCheapestFlight | { error: string }> {
  const apiKey = String(process.env.RAPIDAPI_KEY || "").trim();
  if (!apiKey) {
    return { error: "Configure RAPIDAPI_KEY no ambiente (Vercel / .env.local)." };
  }

  const host = String(
    process.env.RAPIDAPI_FLIGHTS_HOST || "google-flights-live-api.p.rapidapi.com"
  ).trim();
  const adults = Math.min(9, Math.max(1, Math.trunc(filters.adults || 1)));
  const depMin = hourFromClock(filters.depFrom);
  const depMax = hourFromClock(filters.depTo);

  const body: Record<string, unknown> = {
    from_airport: origin,
    to_airport: dest,
    departure_date: dateISO,
    currency: "brl",
    sort_type: "Price",
    seat_type: 1,
    passengers: Array.from({ length: adults }, () => 1),
    limit: 8,
  };
  if (filters.directOnly) body.max_stops = 0;
  if (depMin != null) body.departure_time_min = depMin;
  if (depMax != null) body.departure_time_max = depMax;

  const res = await fetch(`https://${host}/api/google_flights/oneway/v1`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": host,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (res.status === 429) {
    return { error: "RapidAPI atingiu o limite de requisições." };
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "message" in data
        ? String((data as { message?: unknown }).message || "")
        : "";
    return { error: (msg || `RapidAPI HTTP ${res.status}.`).slice(0, 400) };
  }

  const offers = asList(data)
    .map((o) => ({ o, price: priceNumber(o) }))
    .filter((x) => x.price > 0)
    .sort((a, b) => a.price - b.price);

  const maxDur = filters.maxDurationMin && filters.maxDurationMin > 0 ? filters.maxDurationMin : null;
  const picked =
    offers.find((x) => {
      const sec = Number(x.o.duration_seconds);
      const min = Number.isFinite(sec) && sec > 0 ? Math.round(sec / 60) : 0;
      return !maxDur || min <= 0 || min <= maxDur;
    }) || offers[0];

  if (!picked) {
    return { error: "RapidAPI não devolveu tarifa para este trecho/data." };
  }

  const offer = picked.o;
  const durationSec = Number(offer.duration_seconds);
  const durationMin =
    Number.isFinite(durationSec) && durationSec > 0
      ? Math.round(durationSec / 60)
      : 0;
  const airlineName = String(offer.airline || "").split("|")[0].trim();
  const googleUrl = String(offer.buy_link || "").trim();

  return {
    priceCents: Math.round(picked.price * 100),
    carrier: airlineName,
    airlineName,
    depTime: clockFromDescription(offer.departure_description),
    arrTime: clockFromDescription(offer.arrival_description),
    durationMin,
    stops: Math.max(0, Math.trunc(Number(offer.stops) || 0)),
    googleUrl,
    rawPrice: `${airlineName || "Google Flights"} · R$ ${picked.price.toLocaleString("pt-BR")}`,
  };
}
