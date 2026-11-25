import { MODES, RULES } from "../config";
import type { Baseline, ClassifiedTrip, Deal, Offer } from "../types";
import { robustZ } from "./baseline";
import { hasUsableSchedule, scheduleFactor, tripKey } from "./trip";

export type Verdict =
  | { deal: Deal }
  | { rejected: "stops" | "schedule" | "price_cap" | "few_samples" | "not_cheap" };

/**
 * Decide si una oferta es "más barata de lo normal" para su ruta y modalidad.
 *
 * Criterios (todos deben cumplirse):
 *  - vuelos directos y horario aprovechable para la modalidad;
 *  - precio por debajo del tope absoluto de la modalidad;
 *  - suficientes observaciones para conocer el precio normal;
 *  - descuento frente a la mediana >= minDiscount y, si hay dispersión, z robusto >= minZScore.
 *
 * Puntuación = descuento (%) × factor de horario (0.6–1.2).
 */
export function evaluate(offer: Offer, trip: ClassifiedTrip, baseline: Baseline | null): Verdict {
  if (offer.transfers > 0 || offer.returnTransfers > 0) return { rejected: "stops" };
  if (!hasUsableSchedule(trip)) return { rejected: "schedule" };
  if (offer.price > MODES[trip.mode].maxPrice) return { rejected: "price_cap" };
  if (!baseline || baseline.samples < RULES.minSamples) return { rejected: "few_samples" };

  const discount = 1 - offer.price / baseline.median;
  const z = robustZ(offer.price, baseline);
  if (discount < RULES.minDiscount) return { rejected: "not_cheap" };
  if (z !== null && z < RULES.minZScore) return { rejected: "not_cheap" };

  const score = Math.round(discount * 100 * scheduleFactor(trip));
  return {
    deal: {
      tripKey: tripKey(offer),
      offer,
      trip,
      baseline,
      discount: Math.round(discount * 1000) / 1000,
      zScore: z === null ? null : Math.round(z * 100) / 100,
      score,
      errorFare: discount >= RULES.errorFareDiscount,
    },
  };
}
