import { MODES, parseOrigins } from "./config";
import { googleFlightsLink } from "./core/links";
import { sendTelegram } from "./notify/telegram";
import { searchPlaces } from "./places";
import { validateWatch } from "./core/watch";
import { makeSource, runScan } from "./scan";
import { isoDay, lastRuns, listDeals, routeHistory, type DealRow } from "./storage/db";
import * as watches from "./storage/watches";
import type { Env } from "./types";
import { checkWatch, runWatches } from "./watches";

/** Cron de alertas personalizadas (debe coincidir con wrangler.jsonc). */
const WATCH_CRON = "7 * * * *";

const IATA = /^[A-Z]{3}$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Comparación en tiempo constante para el token de administración. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** null si está autorizado; si no, la respuesta de error con el motivo. */
function checkAdmin(req: Request, env: Env): Response | null {
  const expected = (env.ADMIN_TOKEN ?? "").trim();
  if (!expected) return json({ error: "ADMIN_TOKEN no está configurado en el Worker" }, 503);
  const header = (req.headers.get("Authorization") ?? "").trim();
  if (!/^Bearer\s+/i.test(header)) return json({ error: "falta la cabecera Authorization: Bearer <token>" }, 401);
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return safeEqual(token, expected) ? null : json({ error: "no autorizado: el token no coincide" }, 401);
}

function presentDeal(d: DealRow) {
  return { ...d, error_fare: d.error_fare === 1, google_flights: googleFlightsLink(d.origin, d.destination, d.depart_at, d.return_at) };
}

async function handleApi(req: Request, env: Env, url: URL, ctx?: ExecutionContext): Promise<Response> {
  const path = url.pathname;

  if (path === "/api/places" && req.method === "GET") {
    return json({ places: await searchPlaces(url.searchParams.get("q") ?? "", ctx) });
  }

  if (path === "/api/config" && req.method === "GET") {
    return json({ origins: parseOrigins(env.ORIGINS), modes: Object.fromEntries(Object.entries(MODES).map(([k, v]) => [k, v.label])) });
  }

  if (path === "/api/deals" && req.method === "GET") {
    const origin = url.searchParams.get("origin")?.toUpperCase();
    const mode = url.searchParams.get("mode") ?? undefined;
    const maxPrice = Number(url.searchParams.get("maxPrice")) || undefined;
    if (origin && !IATA.test(origin)) return json({ error: "origin inválido" }, 400);
    if (mode && !(mode in MODES)) return json({ error: "mode inválido" }, 400);
    const rows = await listDeals(env.DB, { origin, mode, maxPrice }, new Date());
    return json({ deals: rows.map(presentDeal) });
  }

  const hist = path.match(/^\/api\/routes\/([A-Za-z]{3})\/([A-Za-z]{3})$/);
  if (hist && req.method === "GET") {
    return json({ history: await routeHistory(env.DB, hist[1]!.toUpperCase(), hist[2]!.toUpperCase()) });
  }

  if (path === "/api/runs" && req.method === "GET") {
    const denied = checkAdmin(req, env);
    if (denied) return denied;
    return json({ runs: await lastRuns(env.DB) });
  }

  if (path === "/api/scan" && req.method === "POST") {
    const denied = checkAdmin(req, env);
    if (denied) return denied;
    const requested = parseOrigins(url.searchParams.get("origins") ?? "");
    const allowed = new Set(parseOrigins(env.ORIGINS));
    const origins = requested.filter((o) => allowed.has(o));
    return json(await runScan(env, { origins: origins.length ? origins : undefined }));
  }

  if (path === "/api/telegram/test" && req.method === "POST") {
    const denied = checkAdmin(req, env);
    if (denied) return denied;
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return json({ error: "faltan los secretos TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHAT_ID en el Worker" }, 503);
    }
    try {
      await sendTelegram(
        env.TELEGRAM_BOT_TOKEN.trim(),
        env.TELEGRAM_CHAT_ID.trim(),
        "✅ <b>Flight Deals</b>: el bot funciona. Aquí te llegarán las alertas de vuelos.",
      );
      return json({ ok: true });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  }

  if (path === "/api/watches" || path.startsWith("/api/watches/")) {
    const denied = checkAdmin(req, env);
    if (denied) return denied;
    return handleWatches(req, env, path);
  }

  return json({ error: "no encontrado" }, 404);
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function handleWatches(req: Request, env: Env, path: string): Promise<Response> {
  const now = new Date();
  if (path === "/api/watches") {
    if (req.method === "GET") return json({ watches: await watches.listWatches(env.DB) });
    if (req.method === "POST") {
      const v = validateWatch(await readJson(req), isoDay(now));
      if (!v.ok) return json({ error: v.error }, 400);
      const id = await watches.createWatch(env.DB, v.value, now);
      // Primera comprobación inmediata para que veas resultados al momento.
      const w = await watches.getWatch(env.DB, id);
      const check = await checkWatch(env, w!, makeSource(env), now);
      return json({ watch: await watches.getWatch(env.DB, id), check }, 201);
    }
    return json({ error: "método no permitido" }, 405);
  }

  const m = path.match(/^\/api\/watches\/(\d+)(\/(check|history|active))?$/);
  if (!m) return json({ error: "no encontrado" }, 404);
  const id = Number(m[1]);
  const action = m[3];
  const existing = await watches.getWatch(env.DB, id);
  if (!existing) return json({ error: "alerta no encontrada" }, 404);

  if (!action && req.method === "PUT") {
    const v = validateWatch(await readJson(req), isoDay(now));
    if (!v.ok) return json({ error: v.error }, 400);
    await watches.updateWatch(env.DB, id, v.value);
    const check = await checkWatch(env, (await watches.getWatch(env.DB, id))!, makeSource(env), now);
    return json({ watch: await watches.getWatch(env.DB, id), check });
  }
  if (!action && req.method === "DELETE") {
    await watches.deleteWatch(env.DB, id);
    return json({ ok: true });
  }
  if (action === "check" && req.method === "POST") {
    const check = await checkWatch(env, existing, makeSource(env), now);
    return json({ watch: await watches.getWatch(env.DB, id), check });
  }
  if (action === "active" && req.method === "POST") {
    const body = (await readJson(req)) as { active?: unknown } | null;
    await watches.setWatchActive(env.DB, id, body?.active === true);
    return json({ watch: await watches.getWatch(env.DB, id) });
  }
  if (action === "history" && req.method === "GET") {
    return json({ history: await watches.watchHistory(env.DB, id) });
  }
  return json({ error: "método no permitido" }, 405);
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, env, url, ctx);
      } catch (e) {
        console.error(JSON.stringify({ event: "api_error", path: url.pathname, error: String(e) }));
        return json({ error: "error interno" }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },

  async scheduled(controller, env, ctx): Promise<void> {
    const job = controller.cron === WATCH_CRON ? runWatches(env) : runScan(env);
    ctx.waitUntil(job.then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
