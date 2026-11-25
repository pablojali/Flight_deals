-- Calendario de precios por día de salida de cada alerta (JSON).
ALTER TABLE watches ADD COLUMN calendar_json TEXT NOT NULL DEFAULT '{}';
