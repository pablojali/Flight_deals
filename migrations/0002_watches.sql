-- Alertas personalizadas definidas por el usuario.
CREATE TABLE IF NOT EXISTS watches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  kind            TEXT    NOT NULL,             -- europe | longhaul
  origins         TEXT    NOT NULL,             -- CSV de IATA
  destinations    TEXT    NOT NULL DEFAULT '',  -- CSV; vacío = cualquiera
  depart_date     TEXT    NOT NULL,
  depart_flex     INTEGER NOT NULL DEFAULT 0,
  return_date     TEXT    NOT NULL,
  return_flex     INTEGER NOT NULL DEFAULT 0,
  max_price       INTEGER,
  max_stops       INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL,
  last_checked_at TEXT,
  last_error      TEXT,
  results_json    TEXT    NOT NULL DEFAULT '[]' -- mejores viajes de la última comprobación
);

-- Viajes ya avisados por cada alerta (para no repetir).
CREATE TABLE IF NOT EXISTS watch_alerts (
  watch_id   INTEGER NOT NULL,
  trip_key   TEXT    NOT NULL,
  price      INTEGER NOT NULL,
  alerted_at TEXT    NOT NULL,
  PRIMARY KEY (watch_id, trip_key)
);

-- Precio mínimo diario de cada alerta (evolución).
CREATE TABLE IF NOT EXISTS watch_history (
  watch_id  INTEGER NOT NULL,
  day       TEXT    NOT NULL,
  min_price INTEGER NOT NULL,
  PRIMARY KEY (watch_id, day)
);
