import type { TripMode } from "./types";

export interface ModeRule {
  label: string;
  /** Horas útiles mínimas en destino para que el viaje tenga sentido. */
  minUsefulHours: number;
  /** Horas útiles "ideales"; se usan para el factor de calidad del horario. */
  targetUsefulHours: number;
  /** Tope absoluto de precio (€) aunque sea una bajada grande. */
  maxPrice: number;
}

export const MODES: Record<TripMode, ModeRule> = {
  daytrip: { label: "En el día", minUsefulHours: 8, targetUsefulHours: 12, maxPrice: 120 },
  weekend: { label: "1 noche", minUsefulHours: 20, targetUsefulHours: 30, maxPrice: 180 },
  escapade: { label: "2 noches", minUsefulHours: 32, targetUsefulHours: 44, maxPrice: 250 },
  long: { label: "3-7 noches", minUsefulHours: 48, targetUsefulHours: 80, maxPrice: 450 },
};

export const RULES = {
  /** Viajes de más noches se ignoran. */
  maxNights: 7,
  /** Horas que se restan por traslados aeropuerto-centro (ida + vuelta en destino). */
  transferBufferHours: 2,
  /** Horas de sueño que se descuentan por cada noche. */
  sleepHoursPerNight: 8,
  /** Descuento mínimo frente al precio normal para considerarlo oferta. */
  minDiscount: 0.25,
  /** z-score robusto mínimo (si hay dispersión suficiente). */
  minZScore: 1.0,
  /** Observaciones mínimas de la ruta para fiarse de la mediana. */
  minSamples: 6,
  /** Ventana (días) alrededor de la fecha de salida para comparar precios. */
  seasonWindowDays: 45,
  /** Antigüedad máxima (días) de las observaciones que forman el precio normal. */
  historyDays: 90,
  /** Descuento a partir del cual se marca como posible tarifa errónea. */
  errorFareDiscount: 0.6,
  /** Re-alertar sólo si el precio baja al menos este porcentaje respecto a la última alerta. */
  realertDrop: 0.05,
  /** Máximo de alertas de Telegram por ejecución. */
  maxAlertsPerRun: 8,
  /** Una oferta deja de mostrarse si no se ha vuelto a ver en estas horas. */
  dealTtlHours: 36,
};

export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{3}$/.test(s));
}
