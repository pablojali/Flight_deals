import type { Offer } from "../types";
import type { SearchQuery } from "../sources/types";
import { localDate, tripKey } from "./trip";

export type WatchKind = "europe" | "longhaul";

/** Lo que el usuario define en el formulario. */
export interface WatchInput {
  name: string;
  kind: WatchKind;
  origins: string[];
  /** Vacío = cualquier destino (sólo Europa). */
  destinations: string[];
  departDate: string; // YYYY-MM-DD
  departFlex: number; // ± días
  returnDate: string;
  returnFlex: number;
  maxPrice: number | null;
  maxStops: number;
}

export interface WatchMatch {
  key: string;
  origin: string;
  destination: string;
  price: number;
  currency: string;
  airline: string;
  departAt: string;
  returnAt: string;
  transfers: number;
  returnTransfers: number;
  durationMin: number | null;
  link: string;
}

export type AlertReason = "under_max" | "new_low";

export const WATCH_LIMITS = {
  maxOrigins: 6,
  maxDestinations: 4,
  maxFlexDays: 7,
  /** Consultas a la API por comprobación de una alerta. */
  maxQueries: 16,
  /** Re-avisar del mismo viaje sólo si baja al menos este porcentaje. */
  realertDrop: 0.05,
  maxAlertsPerCheck: 3,
  keepResults: 8,
};

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && addDays(s, 0) === s;
}

function iataList(raw: unknown): string[] | null {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,;]+/) : null;
  if (!arr) return null;
  const out = [...new Set(arr.map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
  return out.every((x) => IATA.test(x)) ? out : null;
}

function intIn(raw: unknown, min: number, max: number, fallback: number): number | null {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Meses (YYYY-MM) que cubre la ventana fecha ± flex. */
export function monthsInWindow(date: string, flex: number): string[] {
  return [...new Set([addDays(date, -flex).slice(0, 7), addDays(date, flex).slice(0, 7)])];
}

/** Consultas a la fuente necesarias para comprobar la alerta. */
export function planQueries(w: WatchInput): SearchQuery[] {
  const dests = w.destinations.length ? w.destinations : [undefined];
  const out: SearchQuery[] = [];
  for (const origin of w.origins)
    for (const destination of dests)
      for (const departure of monthsInWindow(w.departDate, w.departFlex))
        for (const ret of monthsInWindow(w.returnDate, w.returnFlex))
          out.push({ origin, destination, departure, return: ret, directOnly: w.maxStops === 0 });
  return out;
}

export type Validation = { ok: true; value: WatchInput } | { ok: false; error: string };

export function validateWatch(raw: unknown, today: string): Validation {
  if (!raw || typeof raw !== "object") return { ok: false, error: "datos inválidos" };
  const r = raw as Record<string, unknown>;

  const kind: WatchKind = r.kind === "longhaul" ? "longhaul" : "europe";
  const origins = iataList(r.origins);
  if (!origins || origins.length === 0) return { ok: false, error: "elige al menos un aeropuerto de salida (códigos IATA de 3 letras)" };
  if (origins.length > WATCH_LIMITS.maxOrigins) return { ok: false, error: `máximo ${WATCH_LIMITS.maxOrigins} aeropuertos de salida` };

  const destinations = iataList(r.destinations ?? "");
  if (!destinations) return { ok: false, error: "destino inválido: usa códigos IATA de 3 letras (p. ej. LIS, BUE)" };
  if (destinations.length > WATCH_LIMITS.maxDestinations) return { ok: false, error: `máximo ${WATCH_LIMITS.maxDestinations} destinos` };
  if (kind === "longhaul" && destinations.length === 0) return { ok: false, error: "en larga distancia indica el destino (p. ej. BUE para Buenos Aires)" };

  if (!isValidDate(r.departDate) || !isValidDate(r.returnDate)) return { ok: false, error: "fechas inválidas" };
  const departFlex = intIn(r.departFlex, 0, WATCH_LIMITS.maxFlexDays, 0);
  const returnFlex = intIn(r.returnFlex, 0, WATCH_LIMITS.maxFlexDays, 0);
  if (departFlex === null || returnFlex === null) return { ok: false, error: `el margen debe estar entre 0 y ${WATCH_LIMITS.maxFlexDays} días` };
  if (r.returnDate < r.departDate) return { ok: false, error: "la vuelta no puede ser antes de la ida" };
  if (addDays(r.departDate, departFlex) < today) return { ok: false, error: "las fechas de ida ya han pasado" };

  let maxPrice: number | null = null;
  if (r.maxPrice !== undefined && r.maxPrice !== null && r.maxPrice !== "") {
    const n = Number(r.maxPrice);
    if (!Number.isFinite(n) || n < 1 || n > 20000) return { ok: false, error: "precio máximo inválido" };
    maxPrice = Math.round(n);
  }

  const maxStops = kind === "europe" ? 0 : intIn(r.maxStops, 0, 2, 1);
  if (maxStops === null) return { ok: false, error: "escalas máximas: 0, 1 o 2" };

  const autoName = `${origins.join(", ")} → ${destinations.length ? destinations.join(", ") : "cualquier destino"}`;
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 60) : autoName;

  const value: WatchInput = {
    name,
    kind,
    origins,
    destinations,
    departDate: r.departDate,
    departFlex,
    returnDate: r.returnDate,
    returnFlex,
    maxPrice,
    maxStops,
  };
  const queries = planQueries(value).length;
  if (queries > WATCH_LIMITS.maxQueries) {
    return { ok: false, error: `demasiadas combinaciones (${queries} búsquedas): reduce aeropuertos o destinos` };
  }
  return { ok: true, value };
}

/** ¿El viaje cae en las ventanas de fechas y respeta las escalas? */
export function matchesWatch(o: Offer, w: WatchInput): boolean {
  const dep = localDate(o.departAt);
  const ret = localDate(o.returnAt);
  return (
    dep >= addDays(w.departDate, -w.departFlex) &&
    dep <= addDays(w.departDate, w.departFlex) &&
    ret >= addDays(w.returnDate, -w.returnFlex) &&
    ret <= addDays(w.returnDate, w.returnFlex) &&
    o.transfers <= w.maxStops &&
    o.returnTransfers <= w.maxStops
  );
}

/** Filtra, deduplica y ordena por precio las ofertas que encajan con la alerta. */
export function collectMatches(offers: Offer[], w: WatchInput): WatchMatch[] {
  const byKey = new Map<string, WatchMatch>();
  for (const o of offers) {
    if (!matchesWatch(o, w)) continue;
    const key = tripKey(o);
    const prev = byKey.get(key);
    if (prev && prev.price <= o.price) continue;
    byKey.set(key, {
      key,
      origin: o.origin,
      destination: o.destination,
      price: o.price,
      currency: o.currency,
      airline: o.airline,
      departAt: o.departAt,
      returnAt: o.returnAt,
      transfers: o.transfers,
      returnTransfers: o.returnTransfers,
      durationMin: o.durationTotalMin ?? null,
      link: o.link,
    });
  }
  return [...byKey.values()].sort((a, b) => a.price - b.price);
}

/**
 * Qué avisar:
 *  - con precio máximo: los viajes por debajo de él que no se hayan avisado
 *    (o que hayan bajado un 5 % desde el último aviso);
 *  - sin precio máximo: el más barato, si es un nuevo mínimo (−5 %) respecto a lo ya avisado.
 */
export function pickAlerts(
  matches: WatchMatch[],
  w: WatchInput,
  alerted: Map<string, number>,
): Array<{ match: WatchMatch; reason: AlertReason }> {
  const drop = 1 - WATCH_LIMITS.realertDrop;
  if (w.maxPrice !== null) {
    return matches
      .filter((m) => m.price <= w.maxPrice!)
      .filter((m) => {
        const prev = alerted.get(m.key);
        return prev === undefined || m.price <= prev * drop;
      })
      .slice(0, WATCH_LIMITS.maxAlertsPerCheck)
      .map((match) => ({ match, reason: "under_max" as const }));
  }
  const cheapest = matches[0];
  if (!cheapest) return [];
  const bestAlerted = alerted.size ? Math.min(...alerted.values()) : Infinity;
  return cheapest.price <= bestAlerted * drop ? [{ match: cheapest, reason: "new_low" }] : [];
}

/** La alerta ya no tiene sentido si la ventana de ida ha pasado. */
export function isExpired(w: WatchInput, today: string): boolean {
  return addDays(w.departDate, w.departFlex) < today;
}

export interface CalendarDay {
  date: string; // salida (fecha local)
  price: number;
  nights: number;
  returnAt: string;
  airline: string;
  stops: number;
  origin: string;
  destination: string;
}

export interface PriceCalendar {
  months: string[];
  nightsMin: number;
  nightsMax: number;
  days: CalendarDay[];
}

/**
 * Calendario de precios: el viaje más barato por día de salida, en los meses de ida
 * de la alerta, para estancias de duración parecida a la buscada
 * (± el margen total de la alerta, mínimo ±2 noches). Usa las ofertas ya descargadas,
 * así que no consume consultas extra.
 */
export function buildCalendar(offers: Offer[], w: WatchInput): PriceCalendar {
  const months = monthsInWindow(w.departDate, w.departFlex);
  const target = Math.round((Date.parse(`${w.returnDate}T00:00:00Z`) - Date.parse(`${w.departDate}T00:00:00Z`)) / 86_400_000);
  const tol = Math.max(2, w.departFlex + w.returnFlex);
  const nightsMin = Math.max(0, target - tol);
  const nightsMax = target + tol;

  const best = new Map<string, CalendarDay>();
  for (const o of offers) {
    const date = localDate(o.departAt);
    if (!months.includes(date.slice(0, 7))) continue;
    if (o.transfers > w.maxStops || o.returnTransfers > w.maxStops) continue;
    const nights = Math.round((Date.parse(`${localDate(o.returnAt)}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
    if (nights < nightsMin || nights > nightsMax) continue;
    const prev = best.get(date);
    if (prev && prev.price <= o.price) continue;
    best.set(date, {
      date,
      price: o.price,
      nights,
      returnAt: o.returnAt,
      airline: o.airline,
      stops: Math.max(o.transfers, o.returnTransfers),
      origin: o.origin,
      destination: o.destination,
    });
  }
  const days = [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { months, nightsMin, nightsMax, days };
}
