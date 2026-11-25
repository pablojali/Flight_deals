import { RULES } from "../config";
import type { ClassifiedTrip, Deal, Offer } from "../types";
import { computeBaseline } from "./baseline";
import { evaluate } from "./scoring";
import { classifyTrip, daysBetween, localDate, tripKey } from "./trip";

export interface HistoryPoint {
  trip_key: string;
  destination: string;
  mode: string;
  depart_date: string;
  price: number;
}

export interface Classified {
  key: string;
  offer: Offer;
  trip: ClassifiedTrip;
}

/** Clasifica las ofertas y elimina duplicados (mismo viaje → precio más bajo). */
export function classifyAll(offers: Offer[]): Classified[] {
  const byKey = new Map<string, Classified>();
  for (const offer of offers) {
    const trip = classifyTrip(offer);
    if (!trip) continue;
    const key = tripKey(offer);
    const prev = byKey.get(key);
    if (!prev || offer.price < prev.offer.price) byKey.set(key, { key, offer, trip });
  }
  return [...byKey.values()];
}

/**
 * Para cada viaje, el "precio normal" es la mediana de los precios observados
 * de la misma ruta y modalidad con salida en ±seasonWindowDays, excluyendo el propio viaje.
 * El histórico incluye el escaneo actual, así que desde el primer día ya se compara
 * contra las otras fechas de la misma ruta; con las semanas la referencia mejora.
 */
export function findDeals(items: Classified[], history: HistoryPoint[]): Deal[] {
  const groups = new Map<string, HistoryPoint[]>();
  for (const h of history) {
    const g = `${h.destination}|${h.mode}`;
    let arr = groups.get(g);
    if (!arr) groups.set(g, (arr = []));
    arr.push(h);
  }

  const deals: Deal[] = [];
  for (const { key, offer, trip } of items) {
    const departDate = localDate(offer.departAt);
    const pool = (groups.get(`${offer.destination}|${trip.mode}`) ?? [])
      .filter((h) => h.trip_key !== key && Math.abs(daysBetween(h.depart_date, departDate)) <= RULES.seasonWindowDays)
      .map((h) => h.price);
    const verdict = evaluate(offer, trip, computeBaseline(pool));
    if ("deal" in verdict) deals.push(verdict.deal);
  }
  return deals.sort((a, b) => b.score - a.score);
}
