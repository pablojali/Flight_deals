import { mergePlaces, normalize, normalizeRemote, searchLocal, type Place } from "./core/places";

const REMOTE = "https://autocomplete.travelpayouts.com/places2";
const CACHE_SECONDS = 7 * 24 * 3600;

/**
 * Autocompletado de ciudades/aeropuertos: lista local + autocompletado oficial de Travelpayouts
 * (cacheado 7 días en el edge). Si el servicio externo falla o tarda, se devuelve sólo la lista local.
 */
export async function searchPlaces(query: string, ctx?: ExecutionContext): Promise<Place[]> {
  const q = query.trim().slice(0, 40);
  const local = searchLocal(q);
  if (normalize(q).length < 2) return local;

  const url = new URL(REMOTE);
  url.searchParams.set("term", q);
  url.searchParams.set("locale", "es");
  url.searchParams.append("types[]", "city");
  url.searchParams.append("types[]", "airport");

  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const key = new Request(url.toString());
    let res = await cache.match(key);
    if (!res) {
      const fresh = await fetch(url.toString(), { signal: AbortSignal.timeout(3000) });
      if (!fresh.ok) return local;
      const body = await fresh.text();
      res = new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } });
      const toCache = res.clone();
      if (ctx) ctx.waitUntil(cache.put(key, toCache));
      else await cache.put(key, toCache);
    }
    return mergePlaces(local, normalizeRemote(await res.json()));
  } catch (e) {
    console.warn(JSON.stringify({ event: "places_remote_failed", error: String(e) }));
    return local;
  }
}
