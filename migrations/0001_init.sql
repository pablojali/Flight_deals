-- Histórico de precios: una fila por viaje concreto y día de observación.
CREATE TABLE IF NOT EXISTS observations (
  trip_key     TEXT    NOT NULL,
  observed_day TEXT    NOT NULL, -- YYYY-MM-DD (UTC)
  origin       TEXT    NOT NULL,
  destination  TEXT    NOT NULL,
  mode         TEXT    NOT NULL,
  depart_date  TEXT    NOT NULL, -- fecha local de salida
  nights       INTEGER NOT NULL,
  price        INTEGER NOT NULL,
  airline      TEXT    NOT NULL DEFAULT '',
  source       TEXT    NOT NULL,
  PRIMARY KEY (trip_key, observed_day)
);
CREATE INDEX IF NOT EXISTS idx_obs_origin_day ON observations (origin, observed_day);
CREATE INDEX IF NOT EXISTS idx_obs_route ON observations (origin, destination, mode, depart_date);

-- Ofertas vigentes detectadas.
CREATE TABLE IF NOT EXISTS deals (
  trip_key       TEXT    PRIMARY KEY,
  origin         TEXT    NOT NULL,
  destination    TEXT    NOT NULL,
  mode           TEXT    NOT NULL,
  nights         INTEGER NOT NULL,
  depart_at      TEXT    NOT NULL,
  return_at      TEXT    NOT NULL,
  price          INTEGER NOT NULL,
  currency       TEXT    NOT NULL,
  airline        TEXT    NOT NULL,
  flight_numbers TEXT    NOT NULL DEFAULT '',
  useful_hours   REAL,
  median_price   REAL    NOT NULL,
  discount       REAL    NOT NULL,
  z_score        REAL,
  samples        INTEGER NOT NULL,
  score          INTEGER NOT NULL,
  error_fare     INTEGER NOT NULL DEFAULT 0,
  link           TEXT    NOT NULL DEFAULT '',
  source         TEXT    NOT NULL,
  first_seen_at  TEXT    NOT NULL,
  last_seen_at   TEXT    NOT NULL,
  alerted_price  INTEGER,
  alerted_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_deals_seen ON deals (last_seen_at);
CREATE INDEX IF NOT EXISTS idx_deals_score ON deals (score DESC);

-- Registro de ejecuciones del escáner (observabilidad).
CREATE TABLE IF NOT EXISTS scan_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT    NOT NULL,
  finished_at TEXT,
  origins     TEXT    NOT NULL,
  offers      INTEGER NOT NULL DEFAULT 0,
  deals       INTEGER NOT NULL DEFAULT 0,
  alerts      INTEGER NOT NULL DEFAULT 0,
  errors      TEXT    NOT NULL DEFAULT '[]'
);
