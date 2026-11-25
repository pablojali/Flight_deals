import { MODES, RULES } from "../config";
import type { ClassifiedTrip, Offer, TripMode } from "../types";

/** Duración supuesta de un vuelo europeo cuando la fuente no la indica. */
const DEFAULT_FLIGHT_MIN = 120;

/** Fecha local (YYYY-MM-DD) tal como viene en un ISO con offset, sin convertir a UTC. */
export function localDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Hora local (HH:MM) tal como viene en un ISO con offset. */
export function localTime(iso: string): string {
  return iso.slice(11, 16);
}

export function daysBetween(dateA: string, dateB: string): number {
  const a = Date.parse(`${dateA}T00:00:00Z`);
  const b = Date.parse(`${dateB}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function modeForNights(nights: number): TripMode | null {
  if (nights < 0 || nights > RULES.maxNights) return null;
  if (nights === 0) return "daytrip";
  if (nights === 1) return "weekend";
  if (nights === 2) return "escapade";
  return "long";
}

/**
 * Clasifica un viaje y calcula las horas útiles en destino:
 * (salida de la vuelta − llegada de la ida) − traslados − horas de sueño.
 * Se trabaja con instantes absolutos, así que las zonas horarias distintas
 * de origen y destino no desplazan el cálculo.
 */
export function classifyTrip(offer: Offer): ClassifiedTrip | null {
  const departMs = Date.parse(offer.departAt);
  const returnMs = Date.parse(offer.returnAt);
  if (Number.isNaN(departMs) || Number.isNaN(returnMs) || returnMs <= departMs) return null;

  const nights = daysBetween(localDate(offer.departAt), localDate(offer.returnAt));
  const mode = modeForNights(nights);
  if (!mode) return null;

  const arrivalMs = departMs + (offer.durationOutMin ?? DEFAULT_FLIGHT_MIN) * 60_000;
  const grossHours = (returnMs - arrivalMs) / 3_600_000;
  const usefulHours = grossHours - RULES.transferBufferHours - nights * RULES.sleepHoursPerNight;

  return { mode, nights, usefulHours: Math.round(usefulHours * 10) / 10 };
}

/** ¿El horario permite aprovechar el viaje según la modalidad? */
export function hasUsableSchedule(trip: ClassifiedTrip): boolean {
  if (trip.usefulHours === null) return true;
  return trip.usefulHours >= MODES[trip.mode].minUsefulHours;
}

/**
 * Factor de calidad del horario, entre 0.6 y 1.2.
 * 1.0 = las horas útiles ideales de la modalidad.
 */
export function scheduleFactor(trip: ClassifiedTrip): number {
  if (trip.usefulHours === null) return 1;
  const ratio = trip.usefulHours / MODES[trip.mode].targetUsefulHours;
  return Math.min(1.2, Math.max(0.6, ratio));
}

/** Identificador estable de un viaje concreto (misma ruta, horas y aerolínea). */
export function tripKey(offer: Offer): string {
  return [offer.origin, offer.destination, offer.departAt, offer.returnAt, offer.airline].join("|");
}
