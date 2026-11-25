import type { Baseline } from "../types";

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Mediana de las desviaciones absolutas: medida de dispersión resistente a outliers. */
export function mad(values: number[], center = median(values)): number {
  return median(values.map((v) => Math.abs(v - center)));
}

export function computeBaseline(prices: number[]): Baseline | null {
  const clean = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (clean.length === 0) return null;
  const m = median(clean);
  return { median: m, mad: mad(clean, m), samples: clean.length };
}

/**
 * z-score robusto: cuántas "desviaciones" está el precio por debajo de la mediana.
 * 1.4826 escala la MAD para que sea comparable a una desviación típica.
 * Devuelve null si los precios apenas varían (MAD ~ 0).
 */
export function robustZ(price: number, baseline: Baseline): number | null {
  const sigma = 1.4826 * baseline.mad;
  if (sigma < 1) return null;
  return (baseline.median - price) / sigma;
}
