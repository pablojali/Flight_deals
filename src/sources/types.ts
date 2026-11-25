import type { Offer } from "../types";

export interface FlightSource {
  readonly name: string;
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
