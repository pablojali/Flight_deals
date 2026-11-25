import type { Offer } from "../types";

export interface SearchQuery {
  origin: string;
  /** IATA de ciudad o aeropuerto; sin destino = cualquier destino. */
  destination?: string;
  /** YYYY-MM o YYYY-MM-DD */
  departure: string;
  /** YYYY-MM o YYYY-MM-DD; sin valor = cualquier vuelta. */
  return?: string;
  directOnly: boolean;
}

export interface FlightSource {
  readonly name: string;
  /** Búsqueda genérica de ida y vuelta. */
  search(q: SearchQuery): Promise<Offer[]>;
  /** Ofertas de ida y vuelta desde `origin` con salida en el mes `month` (YYYY-MM). */
  roundTrips(origin: string, month: string): Promise<Offer[]>;
}

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
