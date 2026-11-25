import type { Offer } from "../types";
import type { FlightSource } from "./types";

/**
 * Fuente sintética y determinista para desarrollo local (DATA_SOURCE=fixture).
 * Genera precios "normales" por ruta con ruido y, de vez en cuando, una bajada fuerte,
 * para poder probar el motor de ofertas y la interfaz sin claves de API.
 */
const DESTS: Array<{ iata: string; base: number; offset: string; flightMin: number }> = [
  { iata: "LIS", base: 110, offset: "+00:00", flightMin: 130 },
  { iata: "OPO", base: 95, offset: "+00:00", flightMin: 115 },
  { iata: "MAD", base: 90, offset: "+01:00", flightMin: 85 },
  { iata: "LGW", base: 85, offset: "+00:00", flightMin: 110 },
  { iata: "DUB", base: 120, offset: "+00:00", flightMin: 140 },
  { iata: "FCO", base: 100, offset: "+01:00", flightMin: 90 },
  { iata: "NAP", base: 105, offset: "+01:00", flightMin: 100 },
  { iata: "BER", base: 130, offset: "+01:00", flightMin: 125 },
  { iata: "AMS", base: 140, offset: "+01:00", flightMin: 115 },
  { iata: "CPH", base: 150, offset: "+01:00", flightMin: 140 },
  { iata: "RAK", base: 135, offset: "+01:00", flightMin: 150 },
  { iata: "PMI", base: 80, offset: "+01:00", flightMin: 60 },
  { iata: "ATH", base: 170, offset: "+02:00", flightMin: 170 },
  { iata: "PRG", base: 145, offset: "+01:00", flightMin: 120 },
];

const PATTERNS = [
  { nights: 0, out: "07:00", back: "20:40" },
  { nights: 1, out: "08:15", back: "19:30" },
  { nights: 2, out: "18:30", back: "20:00" },
  { nights: 4, out: "10:10", back: "16:45" },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export class FixtureSource implements FlightSource {
  readonly name = "fixture";

  /** `bucket` cambia el ruido entre ejecuciones (por defecto, cada 2 h). */
  constructor(private readonly bucket = Math.floor(Date.now() / 7_200_000)) {}

  async roundTrips(origin: string, month: string): Promise<Offer[]> {
    const offers: Offer[] = [];
    const [y, m] = month.split("-").map(Number) as [number, number];
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

    for (const dest of DESTS) {
      if (hash(`${origin}${dest.iata}route`) < 0.3) continue; // no todas las rutas existen
      for (let day = 1; day <= daysInMonth; day += 2) {
        const date = `${month}-${String(day).padStart(2, "0")}`;
        for (const p of PATTERNS) {
          const seed = `${origin}${dest.iata}${date}${p.nights}`;
          if (hash(seed) < 0.55) continue;
          const routeFactor = 0.8 + hash(`${origin}${dest.iata}`) * 0.5;
          const noise = 0.75 + hash(`${seed}${this.bucket}`) * 0.5;
          const drop = hash(`${seed}${this.bucket}drop`) < 0.03 ? 0.45 : 1;
          const price = Math.round(dest.base * routeFactor * noise * drop * (1 + p.nights * 0.08));
          offers.push({
            source: this.name,
            origin,
            destination: dest.iata,
            price,
            currency: "EUR",
            airline: ["FR", "U2", "VY", "W6"][Math.floor(hash(`${origin}${dest.iata}al`) * 4)]!,
            flightNumbers: "",
            departAt: `${date}T${p.out}:00+01:00`,
            returnAt: `${addDays(date, p.nights)}T${p.back}:00${dest.offset}`,
            durationOutMin: dest.flightMin,
            durationBackMin: dest.flightMin,
            transfers: 0,
            returnTransfers: 0,
            link: "",
          });
        }
      }
    }
    return offers;
  }
}
