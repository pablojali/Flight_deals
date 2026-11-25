# Flight Deals ✈️

Radar de **vuelos directos más baratos de lo normal** desde los aeropuertos del sur de Francia:
Montpellier (MPL), Marsella (MRS), Nîmes (FNI), Béziers (BZR) y Toulon-Hyères (TLN).

Dos formas de usarlo, ambas con avisos por Telegram:

- **Mis alertas**: defines salida (aeropuertos locales y/o hubs como BCN, MAD, PAR), destino (o *cualquiera*),
  fechas de ida y vuelta con ± días de margen y, opcionalmente, un precio máximo. Hay dos tipos:
  *Europa low-cost* (solo directos) y *Larga distancia* (con escalas, p. ej. `BUE` para Argentina).
  Se comprueban cada hora; avisa cuando un vuelo baja de tu máximo o, sin máximo, cuando aparece un nuevo mínimo.
- **Radar automático**: sin configurar nada, aprende el **precio normal** de cada ruta directa y avisa cuando
  un viaje cae claramente por debajo, siempre que el **horario sea aprovechable**.

## Cómo decide el radar qué es una oferta

1. **Recoge** cada 3 horas precios de ida y vuelta directos para los próximos 6 meses (Travelpayouts / Aviasales Data API).
2. **Clasifica** cada viaje: en el día, 1 noche, 2 noches o 3-7 noches, y calcula las **horas útiles en destino**
   (salida de la vuelta − llegada de la ida − 2 h de traslados − 8 h de sueño por noche).
3. **Precio normal** = mediana de los precios observados de la misma ruta y modalidad, con salida en ±45 días,
   durante los últimos 90 días. Desde el primer escaneo se compara con las demás fechas; con las semanas mejora.
4. **Es oferta** si: es directo, el horario da las horas mínimas de su modalidad, el precio está ≥25 % por debajo
   de la mediana y es estadísticamente raro (z robusto ≥ 1 con la MAD), con al menos 6 observaciones.
5. **Puntuación** = % de descuento × factor de horario (0,6–1,2). ≥60 % de descuento se marca como posible tarifa errónea.
6. **Alerta** por Telegram (sin repetir salvo que baje otro 5 %) y se muestra en la web.

Todos los umbrales están en [`src/config.ts`](src/config.ts).

## Arquitectura

```
Cron radar (3 h) / alertas (1 h) ─▶ Worker ─▶ Travelpayouts API
                     │
                     ├─▶ D1: observations · deals · scan_runs · watches · watch_alerts · watch_history
                     ├─▶ Telegram
                     └─▶ /api/* + interfaz estática (public/)
```

| Ruta | Descripción |
|---|---|
| `GET /api/deals?origin=MRS&mode=daytrip&maxPrice=80` | Ofertas vigentes ordenadas por puntuación |
| `GET /api/routes/MRS/LIS` | Histórico diario de precio mínimo de una ruta |
| `GET /api/config` | Aeropuertos y modalidades |
| `POST /api/scan?origins=MPL,MRS` | Escaneo manual (requiere `Authorization: Bearer $ADMIN_TOKEN`) |
| `GET /api/runs` | Últimas ejecuciones (requiere token) |
| `GET/POST /api/watches` | Listar / crear alertas personalizadas (requiere token) |
| `PUT/DELETE /api/watches/:id` | Editar / borrar una alerta (requiere token) |
| `POST /api/watches/:id/check` · `POST /api/watches/:id/active` · `GET /api/watches/:id/history` | Comprobar ya, pausar/activar, evolución del precio |

## Desarrollo local (sin claves, con datos sintéticos)

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
curl -X POST -H "Authorization: Bearer dev-admin-token" "http://localhost:8787/api/scan?origins=MPL,MRS"
```

Abre http://localhost:8787. Tests: `npm test` · tipos: `npm run typecheck`.

## Despliegue en Cloudflare

1. Token gratuito de datos en [Travelpayouts](https://www.travelpayouts.com/) (programa Aviasales → API token).
2. Bot de Telegram con [@BotFather](https://t.me/BotFather) y tu `chat_id` (opcional).
3. Base de datos:
   ```bash
   npx wrangler login
   npx wrangler d1 create flight-deals      # copia el database_id a wrangler.jsonc
   npm run db:migrate:remote
   ```
4. Secretos:
   ```bash
   npx wrangler secret put TRAVELPAYOUTS_TOKEN
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   npx wrangler secret put ADMIN_TOKEN
   ```
5. `npm run deploy`, o conecta el repo en *Workers & Pages → Create → Import a repository* para desplegar con cada push.

La web de ofertas es pública por defecto; para hacerla privada, protégela con **Cloudflare Access** (gratis hasta 50 usuarios).

## Límites y avisos

- Los precios de Travelpayouts son **en caché** (búsquedas reales recientes), no cotizaciones en vivo: confirma siempre en el enlace.
- Se escanean 2 aeropuertos por ejecución (rotando) para respetar cuotas y los límites de subpeticiones del plan gratuito de Workers.
  Ajustable con `ORIGINS_PER_RUN` y `HORIZON_MONTHS`.
- Las primeras semanas el "precio normal" se basa en pocas observaciones; la detección mejora con el histórico.
