import { RULES } from "../config";
import { localDate } from "../core/trip";
import type { ClassifiedTrip, Deal, Offer } from "../types";

const CHUNK = 200;

export interface ObservationRow {
  trip_key: string;
  destination: string;
  mode: string;
  depart_date: string;
  price: number;
}

export interface DealRow {
  trip_key: string;
  origin: string;
  destination: string;
  mode: string;
  nights: number;
  depart_at: string;
  return_at: string;
  price: number;
  currency: string;
  airline: string;
  flight_numbers: string;
  useful_hours: number | null;
  median_price: number;
  discount: number;
  z_score: number | null;
  samples: number;
  score: number;
  error_fare: number;
  link: string;
  source: string;
  first_seen_at: string;
  last_seen_at: string;
  alerted_price: number | null;
  alerted_at: string | null;
}

async function runChunked(db: D1Database, stmts: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await db.batch(stmts.slice(i, i + CHUNK));
  }
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Guarda el precio observado hoy de cada viaje (se queda con el mínimo del día). */
export async function saveObservations(
  db: D1Database,
  items: Array<{ key: string; offer: Offer; trip: ClassifiedTrip }>,
  now: Date,
): Promise<void> {
  const day = isoDay(now);
  const stmt = db.prepare(
    `INSERT INTO observations (trip_key, observed_day, origin, destination, mode, depart_date, nights, price, airline, source)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT (trip_key, observed_day) DO UPDATE SET price = excluded.price
     WHERE excluded.price < observations.price`,
  );
  await runChunked(
    db,
    items.map(({ key, offer, trip }) =>
      stmt.bind(
        key,
        day,
        offer.origin,
        offer.destination,
        trip.mode,
        localDate(offer.departAt),
        trip.nights,
        offer.price,
        offer.airline,
        offer.source,
      ),
    ),
  );
}

export async function loadHistory(db: D1Database, origin: string, now: Date): Promise<ObservationRow[]> {
  const since = isoDay(new Date(now.getTime() - RULES.historyDays * 86_400_000));
  const { results } = await db
    .prepare(
      `SELECT trip_key, destination, mode, depart_date, price
       FROM observations WHERE origin = ?1 AND observed_day >= ?2`,
    )
    .bind(origin, since)
    .all<ObservationRow>();
  return results;
}

export async function upsertDeals(db: D1Database, deals: Deal[], now: Date): Promise<void> {
  const ts = now.toISOString();
  const stmt = db.prepare(
    `INSERT INTO deals (trip_key, origin, destination, mode, nights, depart_at, return_at, price, currency,
       airline, flight_numbers, useful_hours, median_price, discount, z_score, samples, score, error_fare,
       link, source, first_seen_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21)
     ON CONFLICT (trip_key) DO UPDATE SET
       price = excluded.price, median_price = excluded.median_price, discount = excluded.discount,
       z_score = excluded.z_score, samples = excluded.samples, score = excluded.score,
       error_fare = excluded.error_fare, link = excluded.link, useful_hours = excluded.useful_hours,
       last_seen_at = excluded.last_seen_at`,
  );
  await runChunked(
    db,
    deals.map((d) =>
      stmt.bind(
        d.tripKey,
        d.offer.origin,
        d.offer.destination,
        d.trip.mode,
        d.trip.nights,
        d.offer.departAt,
        d.offer.returnAt,
        d.offer.price,
        d.offer.currency,
        d.offer.airline,
        d.offer.flightNumbers,
        d.trip.usefulHours,
        d.baseline.median,
        d.discount,
        d.zScore,
        d.baseline.samples,
        d.score,
        d.errorFare ? 1 : 0,
        d.offer.link,
        d.offer.source,
        ts,
      ),
    ),
  );
}

/**
 * Quita de la tabla de ofertas los viajes de `origin` que ya no son oferta
 * (vistos en este escaneo pero sin pasar el filtro) o cuyo vuelo ya salió.
 */
export async function pruneDeals(db: D1Database, origin: string, stillDealKeys: Set<string>, seenKeys: Set<string>, now: Date): Promise<void> {
  const gone = [...seenKeys].filter((k) => !stillDealKeys.has(k));
  const stmt = db.prepare(`DELETE FROM deals WHERE trip_key = ?1 AND origin = ?2`);
  await runChunked(db, gone.map((k) => stmt.bind(k, origin)));
  const ttl = new Date(now.getTime() - RULES.dealTtlHours * 3_600_000).toISOString();
  await db
    .prepare(`DELETE FROM deals WHERE origin = ?1 AND (last_seen_at < ?2 OR depart_at < ?3)`)
    .bind(origin, ttl, now.toISOString())
    .run();
}

export async function dealsToAlert(db: D1Database, keys: string[]): Promise<DealRow[]> {
  if (keys.length === 0) return [];
  const rows: DealRow[] = [];
  for (let i = 0; i < keys.length; i += 90) {
    const slice = keys.slice(i, i + 90);
    const placeholders = slice.map((_, j) => `?${j + 1}`).join(",");
    const { results } = await db
      .prepare(
        `SELECT * FROM deals WHERE trip_key IN (${placeholders})
         AND (alerted_price IS NULL OR price <= alerted_price * ${1 - RULES.realertDrop})`,
      )
      .bind(...slice)
      .all<DealRow>();
    rows.push(...results);
  }
  return rows.sort((a, b) => b.score - a.score);
}

export async function markAlerted(db: D1Database, rows: DealRow[], now: Date): Promise<void> {
  const stmt = db.prepare(`UPDATE deals SET alerted_price = price, alerted_at = ?2 WHERE trip_key = ?1`);
  await runChunked(db, rows.map((r) => stmt.bind(r.trip_key, now.toISOString())));
}

export interface DealQuery {
  origin?: string;
  mode?: string;
  maxPrice?: number;
  limit?: number;
}

export async function listDeals(db: D1Database, q: DealQuery, now: Date): Promise<DealRow[]> {
  const where = ["depart_at >= ?1", "last_seen_at >= ?2"];
  const args: unknown[] = [now.toISOString(), new Date(now.getTime() - RULES.dealTtlHours * 3_600_000).toISOString()];
  if (q.origin) {
    args.push(q.origin);
    where.push(`origin = ?${args.length}`);
  }
  if (q.mode) {
    args.push(q.mode);
    where.push(`mode = ?${args.length}`);
  }
  if (q.maxPrice) {
    args.push(q.maxPrice);
    where.push(`price <= ?${args.length}`);
  }
  args.push(Math.min(q.limit ?? 200, 500));
  const { results } = await db
    .prepare(`SELECT * FROM deals WHERE ${where.join(" AND ")} ORDER BY score DESC, price ASC LIMIT ?${args.length}`)
    .bind(...args)
    .all<DealRow>();
  return results;
}

export async function routeHistory(db: D1Database, origin: string, destination: string): Promise<Array<{ observed_day: string; mode: string; min_price: number; median_hint: number }>> {
  const { results } = await db
    .prepare(
      `SELECT observed_day, mode, MIN(price) AS min_price, AVG(price) AS median_hint
       FROM observations WHERE origin = ?1 AND destination = ?2
       GROUP BY observed_day, mode ORDER BY observed_day`,
    )
    .bind(origin, destination)
    .all<{ observed_day: string; mode: string; min_price: number; median_hint: number }>();
  return results;
}

export async function startRun(db: D1Database, origins: string[], now: Date): Promise<number> {
  const row = await db
    .prepare(`INSERT INTO scan_runs (started_at, origins) VALUES (?1, ?2) RETURNING id`)
    .bind(now.toISOString(), origins.join(","))
    .first<{ id: number }>();
  return row?.id ?? 0;
}

export async function finishRun(
  db: D1Database,
  id: number,
  stats: { origins: string[]; offers: number; deals: number; alerts: number; errors: string[] },
): Promise<void> {
  await db
    .prepare(
      `UPDATE scan_runs SET finished_at = ?2, origins = ?3, offers = ?4, deals = ?5, alerts = ?6, errors = ?7 WHERE id = ?1`,
    )
    .bind(id, new Date().toISOString(), stats.origins.join(","), stats.offers, stats.deals, stats.alerts, JSON.stringify(stats.errors))
    .run();
}

export async function lastRuns(db: D1Database, limit = 10): Promise<unknown[]> {
  const { results } = await db.prepare(`SELECT * FROM scan_runs ORDER BY id DESC LIMIT ?1`).bind(limit).all();
  return results;
}
