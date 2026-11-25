import { MODES, parseOrigins } from "./config";
import { googleFlightsLink } from "./core/links";
import { runScan } from "./scan";
import { lastRuns, listDeals, routeHistory, type DealRow } from "./storage/db";
import type { Env } from "./types";

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

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

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

  return json({ error: "no encontrado" }, 404);
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, env, url);
      } catch (e) {
        console.error(JSON.stringify({ event: "api_error", path: url.pathname, error: String(e) }));
        return json({ error: "error interno" }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(runScan(env).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
