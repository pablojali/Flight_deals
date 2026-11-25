import { RULES, parseOrigins } from "./config";
import { classifyAll, findDeals } from "./core/engine";
import { formatDealMessage, sendTelegram } from "./notify/telegram";
import { FixtureSource } from "./sources/fixture";
import { TravelpayoutsSource } from "./sources/travelpayouts";
import { SourceError, type FlightSource } from "./sources/types";
import * as db from "./storage/db";
import type { Env } from "./types";

export interface ScanResult {
  runId: number;
  origins: string[];
  offers: number;
  deals: number;
  alerts: number;
  errors: string[];
}

export function makeSource(env: Env): FlightSource {
  if (env.DATA_SOURCE === "fixture") return new FixtureSource();
  return new TravelpayoutsSource(env.TRAVELPAYOUTS_TOKEN ?? "", env.CURRENCY || "eur");
}

/** Meses YYYY-MM desde el actual, `count` en total. */
export function upcomingMonths(now: Date, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Elige qué aeropuertos tocan en esta ejecución, rotando para no exceder cuotas. */
export function pickOrigins(all: string[], perRun: number, runId: number): string[] {
  if (all.length === 0) return [];
  const n = Math.min(Math.max(1, perRun), all.length);
  const start = (((runId - 1) * n) % all.length + all.length) % all.length;
  return Array.from({ length: n }, (_, i) => all[(start + i) % all.length]!);
}

export async function runScan(env: Env, opts: { origins?: string[]; now?: Date; source?: FlightSource } = {}): Promise<ScanResult> {
  const now = opts.now ?? new Date();
  const all = parseOrigins(env.ORIGINS);
  const runId = await db.startRun(env.DB, opts.origins ?? all, now);
  const origins = opts.origins?.length ? opts.origins : pickOrigins(all, Number(env.ORIGINS_PER_RUN) || 2, runId);
  const months = upcomingMonths(now, Math.min(Number(env.HORIZON_MONTHS) || 6, 12));
  const errors: string[] = [];
  const dealKeys: string[] = [];
  let offerCount = 0;

  let source: FlightSource;
  try {
    source = opts.source ?? makeSource(env);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.finishRun(env.DB, runId, { origins, offers: 0, deals: 0, alerts: 0, errors: [msg] });
    return { runId, origins, offers: 0, deals: 0, alerts: 0, errors: [msg] };
  }

  for (const origin of origins) {
    const offers = [];
    for (const month of months) {
      try {
        offers.push(...(await source.roundTrips(origin, month)));
      } catch (e) {
        errors.push(`${origin} ${month}: ${e instanceof Error ? e.message : String(e)}`);
        if (e instanceof SourceError && (e.status === 429 || e.status === 401 || e.status === 403)) break;
      }
    }

    const items = classifyAll(offers).filter((c) => c.offer.origin === origin);
    offerCount += items.length;
    if (items.length === 0) continue;

    await db.saveObservations(env.DB, items, now);
    const history = await db.loadHistory(env.DB, origin, now);
    const deals = findDeals(items, history);
    await db.upsertDeals(env.DB, deals, now);
    await db.pruneDeals(env.DB, origin, new Set(deals.map((d) => d.tripKey)), new Set(items.map((i) => i.key)), now);
    dealKeys.push(...deals.map((d) => d.tripKey));
  }

  let alerts = 0;
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && dealKeys.length > 0) {
    const pending = (await db.dealsToAlert(env.DB, dealKeys)).slice(0, RULES.maxAlertsPerRun);
    const sent = [];
    for (const row of pending) {
      try {
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, formatDealMessage(row));
        sent.push(row);
      } catch (e) {
        errors.push(`telegram: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
    await db.markAlerted(env.DB, sent, now);
    alerts = sent.length;
  }

  const result = { runId, origins, offers: offerCount, deals: dealKeys.length, alerts, errors };
  await db.finishRun(env.DB, runId, result);
  console.log(JSON.stringify({ event: "scan", ...result }));
  return result;
}
