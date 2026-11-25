import type { PriceCalendar, WatchInput, WatchKind, WatchMatch } from "../core/watch";
import { isoDay } from "./db";

export interface WatchRow {
  id: number;
  name: string;
  kind: string;
  origins: string;
  destinations: string;
  depart_date: string;
  depart_flex: number;
  return_date: string;
  return_flex: number;
  max_price: number | null;
  max_stops: number;
  active: number;
  created_at: string;
  last_checked_at: string | null;
  last_error: string | null;
  results_json: string;
  calendar_json: string;
}

export interface Watch extends WatchInput {
  id: number;
  active: boolean;
  createdAt: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  results: WatchMatch[];
  calendar: PriceCalendar | null;
}

const csv = (s: string) => (s ? s.split(",").filter(Boolean) : []);

export function rowToWatch(r: WatchRow): Watch {
  let results: WatchMatch[] = [];
  let calendar: PriceCalendar | null = null;
  try {
    results = JSON.parse(r.results_json) as WatchMatch[];
  } catch {
    results = [];
  }
  try {
    const c = JSON.parse(r.calendar_json ?? "{}") as Partial<PriceCalendar>;
    calendar = Array.isArray(c.days) && Array.isArray(c.months) ? (c as PriceCalendar) : null;
  } catch {
    calendar = null;
  }
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as WatchKind,
    origins: csv(r.origins),
    destinations: csv(r.destinations),
    departDate: r.depart_date,
    departFlex: r.depart_flex,
    returnDate: r.return_date,
    returnFlex: r.return_flex,
    maxPrice: r.max_price,
    maxStops: r.max_stops,
    active: r.active === 1,
    createdAt: r.created_at,
    lastCheckedAt: r.last_checked_at,
    lastError: r.last_error,
    results,
    calendar,
  };
}

function inputParams(w: WatchInput) {
  return [
    w.name,
    w.kind,
    w.origins.join(","),
    w.destinations.join(","),
    w.departDate,
    w.departFlex,
    w.returnDate,
    w.returnFlex,
    w.maxPrice,
    w.maxStops,
  ];
}

export async function listWatches(db: D1Database): Promise<Watch[]> {
  const { results } = await db.prepare(`SELECT * FROM watches ORDER BY active DESC, depart_date ASC`).all<WatchRow>();
  return results.map(rowToWatch);
}

export async function getWatch(db: D1Database, id: number): Promise<Watch | null> {
  const row = await db.prepare(`SELECT * FROM watches WHERE id = ?1`).bind(id).first<WatchRow>();
  return row ? rowToWatch(row) : null;
}

export async function createWatch(db: D1Database, w: WatchInput, now: Date): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO watches (name, kind, origins, destinations, depart_date, depart_flex, return_date, return_flex,
         max_price, max_stops, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) RETURNING id`,
    )
    .bind(...inputParams(w), now.toISOString())
    .first<{ id: number }>();
  return row!.id;
}

/** Al cambiar criterios se borran avisos y resultados previos: es una búsqueda nueva. */
export async function updateWatch(db: D1Database, id: number, w: WatchInput): Promise<boolean> {
  const res = await db.batch([
    db
      .prepare(
        `UPDATE watches SET name = ?1, kind = ?2, origins = ?3, destinations = ?4, depart_date = ?5, depart_flex = ?6,
           return_date = ?7, return_flex = ?8, max_price = ?9, max_stops = ?10,
           results_json = '[]', calendar_json = '{}', last_checked_at = NULL, last_error = NULL
         WHERE id = ?11`,
      )
      .bind(...inputParams(w), id),
    db.prepare(`DELETE FROM watch_alerts WHERE watch_id = ?1`).bind(id),
    db.prepare(`DELETE FROM watch_history WHERE watch_id = ?1`).bind(id),
  ]);
  return (res[0]?.meta.changes ?? 0) > 0;
}

export async function setWatchActive(db: D1Database, id: number, active: boolean): Promise<boolean> {
  const res = await db.prepare(`UPDATE watches SET active = ?2 WHERE id = ?1`).bind(id, active ? 1 : 0).run();
  return res.meta.changes > 0;
}

export async function deleteWatch(db: D1Database, id: number): Promise<boolean> {
  const res = await db.batch([
    db.prepare(`DELETE FROM watches WHERE id = ?1`).bind(id),
    db.prepare(`DELETE FROM watch_alerts WHERE watch_id = ?1`).bind(id),
    db.prepare(`DELETE FROM watch_history WHERE watch_id = ?1`).bind(id),
  ]);
  return (res[0]?.meta.changes ?? 0) > 0;
}

/** Alertas activas a comprobar, las que llevan más tiempo sin mirarse primero. */
export async function dueWatches(db: D1Database): Promise<Watch[]> {
  const { results } = await db
    .prepare(`SELECT * FROM watches WHERE active = 1 ORDER BY last_checked_at IS NOT NULL, last_checked_at ASC`)
    .all<WatchRow>();
  return results.map(rowToWatch);
}

export async function alertedPrices(db: D1Database, id: number): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(`SELECT trip_key, price FROM watch_alerts WHERE watch_id = ?1`)
    .bind(id)
    .all<{ trip_key: string; price: number }>();
  return new Map(results.map((r) => [r.trip_key, r.price]));
}

export async function saveCheck(
  db: D1Database,
  id: number,
  matches: WatchMatch[],
  error: string | null,
  now: Date,
  keep: number,
  calendar: PriceCalendar,
): Promise<void> {
  const stmts = [
    db
      .prepare(`UPDATE watches SET last_checked_at = ?2, last_error = ?3, results_json = ?4, calendar_json = ?5 WHERE id = ?1`)
      .bind(id, now.toISOString(), error, JSON.stringify(matches.slice(0, keep)), JSON.stringify(calendar)),
  ];
  const cheapest = matches[0];
  if (cheapest) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO watch_history (watch_id, day, min_price) VALUES (?1, ?2, ?3)
           ON CONFLICT (watch_id, day) DO UPDATE SET min_price = MIN(min_price, excluded.min_price)`,
        )
        .bind(id, isoDay(now), cheapest.price),
    );
  }
  await db.batch(stmts);
}

export async function recordAlerts(db: D1Database, id: number, matches: WatchMatch[], now: Date): Promise<void> {
  if (matches.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO watch_alerts (watch_id, trip_key, price, alerted_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (watch_id, trip_key) DO UPDATE SET price = excluded.price, alerted_at = excluded.alerted_at`,
  );
  await db.batch(matches.map((m) => stmt.bind(id, m.key, m.price, now.toISOString())));
}

export async function watchHistory(db: D1Database, id: number): Promise<Array<{ day: string; min_price: number }>> {
  const { results } = await db
    .prepare(`SELECT day, min_price FROM watch_history WHERE watch_id = ?1 ORDER BY day`)
    .bind(id)
    .all<{ day: string; min_price: number }>();
  return results;
}
