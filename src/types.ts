export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  /** Aeropuertos de salida separados por comas, p. ej. "MPL,MRS,FNI". */
  ORIGINS: string;
  /** Meses hacia delante que se rastrean. */
  HORIZON_MONTHS: string;
  /** Cuántos aeropuertos de salida se procesan en cada ejecución del cron (rotación). */
  ORIGINS_PER_RUN: string;
  CURRENCY: string;
  /** "travelpayouts" (real) o "fixture" (datos sintéticos para desarrollo local). */
  DATA_SOURCE: string;

  // Secretos (wrangler secret put ...)
  TRAVELPAYOUTS_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  /** Protege POST /api/scan. */
  ADMIN_TOKEN?: string;
}

export type TripMode = "daytrip" | "weekend" | "escapade" | "long";

/** Una oferta de ida y vuelta normalizada, independiente de la fuente. */
export interface Offer {
  source: string;
  origin: string; // IATA aeropuerto de salida
  destination: string; // IATA aeropuerto de destino
  price: number; // precio total ida y vuelta
  currency: string;
  airline: string;
  flightNumbers: string;
  /** ISO 8601 con offset local del aeropuerto de salida, p. ej. 2026-12-05T06:45:00+01:00 */
  departAt: string;
  /** Hora de salida del vuelo de vuelta, ISO con offset local del destino. */
  returnAt: string;
  /** Duración del vuelo de ida en minutos (null si la fuente no la da). */
  durationOutMin: number | null;
  /** Duración del vuelo de vuelta en minutos. */
  durationBackMin: number | null;
  /** Duración total (ida + vuelta, con escalas) en minutos, si la fuente la da. */
  durationTotalMin?: number | null;
  transfers: number;
  returnTransfers: number;
  /** Enlace de compra/búsqueda. */
  link: string;
}

export interface ClassifiedTrip {
  mode: TripMode;
  nights: number;
  usefulHours: number | null;
}

export interface Baseline {
  median: number;
  mad: number;
  samples: number;
}

export interface Deal {
  tripKey: string;
  offer: Offer;
  trip: ClassifiedTrip;
  baseline: Baseline;
  discount: number; // 0..1
  zScore: number | null;
  score: number;
  errorFare: boolean;
}
