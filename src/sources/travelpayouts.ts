import type { Offer } from "../types";
import { SourceError, type FlightSource, type SearchQuery } from "./types";

const ENDPOINT = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

/** Forma de cada elemento de `data` en la respuesta de prices_for_dates. */
export interface TpFare {
  origin?: string;
  destination?: string;
  origin_airport?: string;
  destination_airport?: string;
  price?: number;
  airline?: string;
  flight_number?: string | number;
  departure_at?: string;
  return_at?: string;
  transfers?: number;
  return_transfers?: number;
  duration?: number;
  duration_to?: number;
  duration_back?: number;
  link?: string;
}

interface TpResponse {
  success?: boolean;
  data?: TpFare[];
  currency?: string;
  error?: string;
}

/**
 * Travelpayouts (Aviasales) Data API.
 * Ojo: son precios en caché de búsquedas reales de las últimas horas/días,
 * no cotizaciones en vivo. Sirven muy bien para detectar caídas de precio;
 * el precio final se confirma en el enlace de compra.
 */
export class TravelpayoutsSource implements FlightSource {
  readonly name = "travelpayouts";

  constructor(
    private readonly token: string,
    private readonly currency = "eur",
    // Envuelto en una arrow function: en Workers, llamar a `fetch` con otro `this`
    // (p. ej. this.fetchFn(...)) lanza "Illegal invocation".
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    if (!token) throw new SourceError("Falta TRAVELPAYOUTS_TOKEN");
  }

  roundTrips(origin: string, month: string): Promise<Offer[]> {
    return this.search({ origin, departure: month, directOnly: true });
  }

  async search(q: SearchQuery): Promise<Offer[]> {
    const { origin } = q;
    const month = q.departure;
    const params = new URLSearchParams({
      origin,
      departure_at: q.departure,
      one_way: "false",
      direct: String(q.directOnly),
      currency: this.currency,
      sorting: "price",
      limit: "1000",
      page: "1",
    });
    if (q.destination) params.set("destination", q.destination);
    if (q.return) params.set("return_at", q.return);

    const res = await this.fetchFn(`${ENDPOINT}?${params}`, {
      headers: { "X-Access-Token": this.token, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new SourceError(`Travelpayouts HTTP ${res.status} (${origin}${q.destination ? `→${q.destination}` : ""} ${month})`, res.status);
    }
    const body = (await res.json()) as TpResponse;
    if (body.success === false) {
      throw new SourceError(`Travelpayouts error: ${body.error ?? "desconocido"}`);
    }
    return (body.data ?? [])
      .map((f) => normalizeTpFare(f, origin, body.currency ?? this.currency))
      .filter((o): o is Offer => o !== null);
  }
}

export function normalizeTpFare(f: TpFare, requestedOrigin: string, currency: string): Offer | null {
  const destination = f.destination_airport ?? f.destination;
  if (!destination || !f.departure_at || !f.return_at) return null;
  if (typeof f.price !== "number" || f.price <= 0) return null;

  const link = f.link
    ? f.link.startsWith("http")
      ? f.link
      : `https://www.aviasales.com${f.link}`
    : "";

  return {
    source: "travelpayouts",
    origin: (f.origin_airport ?? f.origin ?? requestedOrigin).toUpperCase(),
    destination: destination.toUpperCase(),
    price: Math.round(f.price),
    currency: currency.toUpperCase(),
    airline: f.airline ?? "",
    flightNumbers: f.flight_number !== undefined ? `${f.airline ?? ""}${f.flight_number}` : "",
    departAt: f.departure_at,
    returnAt: f.return_at,
    durationOutMin: typeof f.duration_to === "number" ? f.duration_to : null,
    durationBackMin: typeof f.duration_back === "number" ? f.duration_back : null,
    durationTotalMin: typeof f.duration === "number" ? f.duration : null,
    transfers: f.transfers ?? 0,
    returnTransfers: f.return_transfers ?? 0,
    link,
  };
}
