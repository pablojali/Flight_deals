# Flight Deals

Radar de vuelos directos "más baratos de lo normal" desde el sur de Francia (MPL, MRS, FNI, BZR, TLN).
Cloudflare Worker (TypeScript) + D1 + Cron + interfaz estática en `public/`.

## Comandos
- `npm test` — tests unitarios (Vitest). `npm run typecheck` — tipos.
- `cp .dev.vars.example .dev.vars && npm run db:migrate:local && npm run dev` — local con datos sintéticos (`DATA_SOURCE=fixture`).
- Escaneo manual local: `curl -X POST -H "Authorization: Bearer dev-admin-token" localhost:8787/api/scan`

## Estructura
- `src/core/` lógica pura y testeada: clasificación de viaje y horas útiles (`trip.ts`), mediana/MAD (`baseline.ts`), criterio de oferta (`scoring.ts`), orquestación sin I/O (`engine.ts`).
- `src/core/watch.ts` alertas personalizadas: validación, plan de consultas, filtro por fechas y cuándo avisar. Runner en `src/watches.ts`, SQL en `src/storage/watches.ts`.
- Dos crons en `wrangler.jsonc`; `WATCH_CRON` en `src/index.ts` debe coincidir con el de alertas.
- `src/sources/` adaptadores de datos (`FlightSource`). `src/storage/db.ts` todo el SQL. `src/scan.ts` el pipeline del cron.
- Umbrales y modalidades en `src/config.ts`. Esquema en `migrations/` (nunca editar una migración ya aplicada: crear otra).

## Reglas
- Sin secretos en el repo: van con `wrangler secret put`.
- Cambios de lógica en `src/core/` llevan test.
- No usar endpoints no oficiales ni rotar cuentas para saltarse cuotas.
