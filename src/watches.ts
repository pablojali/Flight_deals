import { buildCalendar, collectMatches, isExpired, pickAlerts, planQueries, WATCH_LIMITS } from "./core/watch";
import { formatWatchMessage, sendTelegram } from "./notify/telegram";
import { makeSource } from "./scan";
import { SourceError, type FlightSource } from "./sources/types";
import { isoDay } from "./storage/db";
import * as store from "./storage/watches";
import type { Env } from "./types";

export interface WatchCheckResult {
  id: number;
  name: string;
  queries: number;
  matches: number;
  cheapest: number | null;
  alerts: number;
  error: string | null;
}

/** Comprueba una alerta: consulta la fuente, guarda resultados y avisa por Telegram si toca. */
export async function checkWatch(env: Env, w: store.Watch, source: FlightSource, now: Date): Promise<WatchCheckResult> {
  const queries = planQueries(w);
  const offers = [];
  const errors: string[] = [];
  for (const q of queries) {
    try {
      offers.push(...(await source.search(q)));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      if (e instanceof SourceError && (e.status === 429 || e.status === 401 || e.status === 403)) break;
    }
  }

  const matches = collectMatches(offers, w);
  const error = errors.length ? errors.slice(0, 3).join(" | ") : null;
  await store.saveCheck(env.DB, w.id, matches, error, now, WATCH_LIMITS.keepResults, buildCalendar(offers, w));

  let alerts = 0;
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && matches.length) {
    const toSend = pickAlerts(matches, w, await store.alertedPrices(env.DB, w.id));
    const sent = [];
    for (const { match, reason } of toSend) {
      try {
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, formatWatchMessage(w.name, match, reason, w.maxPrice));
        sent.push(match);
      } catch (e) {
        console.error(JSON.stringify({ event: "watch_telegram_error", id: w.id, error: String(e) }));
        break;
      }
    }
    await store.recordAlerts(env.DB, w.id, sent, now);
    alerts = sent.length;
  }

  return { id: w.id, name: w.name, queries: queries.length, matches: matches.length, cheapest: matches[0]?.price ?? null, alerts, error };
}

/**
 * Ejecución del cron de alertas. Respeta un presupuesto de consultas por ejecución
 * (límite de subpeticiones de Workers); las alertas que no caben esperan a la siguiente.
 */
export async function runWatches(env: Env, opts: { budget?: number; now?: Date; source?: FlightSource } = {}): Promise<WatchCheckResult[]> {
  const now = opts.now ?? new Date();
  const today = isoDay(now);
  let budget = opts.budget ?? 36;
  const source = opts.source ?? makeSource(env);
  const results: WatchCheckResult[] = [];

  for (const w of await store.dueWatches(env.DB)) {
    if (isExpired(w, today)) {
      await store.setWatchActive(env.DB, w.id, false);
      continue;
    }
    const cost = planQueries(w).length;
    if (cost > budget) continue;
    budget -= cost;
    results.push(await checkWatch(env, w, source, now));
  }
  console.log(JSON.stringify({ event: "watches", checked: results.length, results }));
  return results;
}
