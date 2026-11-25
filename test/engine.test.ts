import { describe, expect, it } from "vitest";
import { classifyAll, findDeals, type HistoryPoint } from "../src/core/engine";
import { offer } from "./helpers";

function history(prices: number[], over: Partial<HistoryPoint> = {}): HistoryPoint[] {
  return prices.map((price, i) => ({
    trip_key: `hist-${i}`,
    destination: "LIS",
    mode: "daytrip",
    depart_date: "2026-12-10",
    price,
    ...over,
  }));
}

describe("findDeals", () => {
  const normal = [95, 100, 105, 110, 98, 102, 120, 90];

  it("detecta un precio muy por debajo de lo normal", () => {
    const items = classifyAll([offer({ price: 55 })]);
    const [deal] = findDeals(items, history(normal));
    expect(deal).toBeDefined();
    expect(deal!.baseline.median).toBe(101);
    expect(deal!.discount).toBeCloseTo(0.455, 2);
    expect(deal!.errorFare).toBe(false);
    expect(deal!.score).toBeGreaterThan(30);
  });

  it("no marca precios normales", () => {
    expect(findDeals(classifyAll([offer({ price: 92 })]), history(normal))).toHaveLength(0);
  });

  it("exige historial suficiente", () => {
    expect(findDeals(classifyAll([offer({ price: 40 })]), history([100, 100, 100]))).toHaveLength(0);
  });

  it("no compara con otras modalidades ni fechas lejanas", () => {
    const other = [...history(normal, { mode: "weekend" }), ...history(normal, { depart_date: "2027-04-01" })];
    expect(findDeals(classifyAll([offer({ price: 40 })]), other)).toHaveLength(0);
  });

  it("descarta vuelos con escalas", () => {
    expect(findDeals(classifyAll([offer({ price: 40, transfers: 1 })]), history(normal))).toHaveLength(0);
  });

  it("marca posibles tarifas erróneas", () => {
    const [deal] = findDeals(classifyAll([offer({ price: 30 })]), history(normal));
    expect(deal!.errorFare).toBe(true);
  });

  it("deduplica el mismo viaje quedándose con el más barato", () => {
    const items = classifyAll([offer({ price: 80 }), offer({ price: 60 })]);
    expect(items).toHaveLength(1);
    expect(items[0]!.offer.price).toBe(60);
  });
});
