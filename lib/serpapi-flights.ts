export type SerpApiFlightFilters = {
  adults?: number;
  directOnly?: boolean;
  maxDurationMin?: number | null;
  depFrom?: string | null;
  depTo?: string | null;
};

export type SerpApiCheapestFlight = {
  priceCents: number;
  carrier: string;
  airlineName: string;
  depTime: string;
  arrTime: string;
  durationMin: number;
  stops: number;
  googleUrl: string;
  rawPrice: string;
};

type SerpAirport = { id?: string; name?: string; time?: string };
type SerpLeg = {
  airline?: string;
  flight_number?: string;
  departure_airport?: SerpAirport;
  arrival_airport?: SerpAirport;
  duration?: number;
};
type SerpOffer = {
  price?: number;
  type?: string;
  flights?: SerpLeg[];
  total_duration?: number;
  layovers?: unknown[];
};

function clockFromWhen(raw: string | undefined) {
  const m = /(\d{2}):(\d{2})/.exec(String(raw || ""));
  return m ? `${m[1]}:${m[2]}` : "";
}

function outboundTimes(depFrom?: string | null, depTo?: string | null) {
  const fromH = /^(\d{1,2}):/.exec(String(depFrom || "").trim());
  const toH = /^(\d{1,2}):/.exec(String(depTo || "").trim());
  if (!fromH && !toH) return "";
  const a = fromH ? Math.min(23, Math.max(0, Number(fromH[1]))) : 0;
  const b = toH ? Math.min(23, Math.max(0, Number(toH[1]))) : 23;
  return `${a},${b}`;
}

function googleFlightsPageUrl(origin: string, dest: string, dateISO: string) {
  const q = encodeURIComponent(`Voos de ${origin} para ${dest} em ${dateISO}`);
  return `https://www.google.com/travel/flights?hl=pt-BR&gl=br&curr=BRL&q=${q}`;
}

function pickCheapest(offers: SerpOffer[]): SerpOffer | null {
  const priced = offers.filter((o) => typeof o.price === "number" && Number(o.price) > 0);
  if (!priced.length) return null;
  priced.sort((a, b) => Number(a.price) - Number(b.price));
  return priced[0];
}

export function parseGoogleFlightsResult(
  data: {
    best_flights?: SerpOffer[];
    other_flights?: SerpOffer[];
    price_insights?: { lowest_price?: number };
    search_metadata?: { google_flights_url?: string };
    error?: string;
  },
  origin: string,
  dest: string,
  dateISO: string
): SerpApiCheapestFlight | { error: string } {
  if (data?.error) return { error: String(data.error).slice(0, 400) };
  const offer = pickCheapest([...(data.best_flights || []), ...(data.other_flights || [])]);
  const price = offer?.price ?? data.price_insights?.lowest_price;
  if (!price || Number(price) <= 0) {
    return { error: "Google Flights não devolveu tarifa para este trecho/data." };
  }
  const legs = offer?.flights || [];
  const first = legs[0];
  const last = legs[legs.length - 1];
  const airlineName = String(first?.airline || "").trim();
  const stops =
    Array.isArray(offer?.layovers) && offer.layovers.length
      ? offer.layovers.length
      : Math.max(0, legs.length - 1);
  const durationMin = Math.trunc(Number(offer?.total_duration) || Number(first?.duration) || 0);
  const googleUrl = String(data.search_metadata?.google_flights_url || "").trim() || googleFlightsPageUrl(origin, dest, dateISO);
  const priceCents = Math.round(Number(price) * 100);
  return {
    priceCents,
    carrier: airlineName,
    airlineName,
    depTime: clockFromWhen(first?.departure_airport?.time),
    arrTime: clockFromWhen(last?.arrival_airport?.time || first?.arrival_airport?.time),
    durationMin,
    stops,
    googleUrl,
    rawPrice: `${airlineName || "Google Flights"} · R$ ${Number(price).toLocaleString("pt-BR")}`,
  };
}

export async function searchGoogleFlightsCheapest(
  origin: string,
  dest: string,
  dateISO: string,
  filters: SerpApiFlightFilters = {}
): Promise<SerpApiCheapestFlight | { error: string }> {
  const apiKey = String(process.env.SERPAPI_API_KEY || "").trim();
  if (!apiKey) {
    return { error: "Configure SERPAPI_API_KEY no ambiente (Vercel / .env.local)." };
  }
  const params = new URLSearchParams({
    engine: "google_flights",
    api_key: apiKey,
    departure_id: origin,
    arrival_id: dest,
    outbound_date: dateISO,
    type: "2",
    currency: "BRL",
    hl: "pt",
    gl: "br",
    sort_by: "2",
    adults: String(Math.min(9, Math.max(1, Math.trunc(filters.adults || 1)))),
  });
  if (filters.directOnly) params.set("stops", "1");
  if (filters.maxDurationMin && filters.maxDurationMin > 0) {
    params.set("max_duration", String(Math.trunc(filters.maxDurationMin)));
  }
  const times = outboundTimes(filters.depFrom, filters.depTo);
  if (times) params.set("outbound_times", times);

  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as
    | {
        best_flights?: SerpOffer[];
        other_flights?: SerpOffer[];
        price_insights?: { lowest_price?: number };
        search_metadata?: { google_flights_url?: string };
        error?: string;
      }
    | null;
  if (!res.ok || !data) {
    return { error: `SerpAPI HTTP ${res.status}.` };
  }
  return parseGoogleFlightsResult(data, origin, dest, dateISO);
}
