import { describe, expect, it } from "vitest";
import {
  collectMatches,
  isExpired,
  monthsInWindow,
  pickAlerts,
  planQueries,
  validateWatch,
  type WatchInput,
  type WatchMatch,
} from "../src/core/watch";
import { FixtureSource } from "../src/sources/fixture";
import { offer } from "./helpers";

const TODAY = "2026-11-25";

const europe: WatchInput = {
  name: "Lisboa puente",
  kind: "europe",
  origins: ["MPL", "MRS"],
  destinations: ["LIS"],
  departDate: "2026-12-05",
  departFlex: 2,
  returnDate: "2026-12-08",
  returnFlex: 1,
  maxPrice: 120,
  maxStops: 0,
};

const argentina: WatchInput = {
  name: "Navidad en Argentina",
  kind: "longhaul",
  origins: ["MRS", "BCN"],
  destinations: ["BUE"],
  departDate: "2026-12-20",
  departFlex: 3,
  returnDate: "2027-01-10",
  returnFlex: 3,
  maxPrice: null,
  maxStops: 1,
};

describe("validateWatch", () => {
  it("acepta una alerta de Europa y fuerza vuelos directos", () => {
    const v = validateWatch({ ...europe, maxStops: 2, origins: "mpl, mrs" }, TODAY);
    expect(v).toEqual({ ok: true, value: { ...europe, maxStops: 0 } });
  });

  it("larga distancia exige destino y permite escalas", () => {
    expect(validateWatch({ ...argentina, destinations: [] }, TODAY)).toMatchObject({ ok: false });
    const v = validateWatch(argentina, TODAY);
    expect(v.ok && v.value.maxStops).toBe(1);
  });

  it("genera un nombre si no se da", () => {
    const v = validateWatch({ ...europe, name: "", destinations: [] }, TODAY);
    expect(v.ok && v.value.name).toBe("MPL, MRS → cualquier destino");
  });

  it("rechaza datos incoherentes", () => {
    const bad = [
      { ...europe, origins: [] },
      { ...europe, origins: ["MONTPELLIER"] },
      { ...europe, returnDate: "2026-12-01" },
      { ...europe, departDate: "2026-02-30" },
      { ...europe, departDate: "2026-11-01", returnDate: "2026-11-05" },
      { ...europe, departFlex: 15 },
      { ...europe, maxPrice: -3 },
      { ...argentina, origins: ["MPL", "MRS", "FNI", "BCN", "MAD", "PAR"], destinations: ["BUE", "EZE", "SCL"] },
    ];
    for (const b of bad) expect(validateWatch(b, TODAY).ok, JSON.stringify(b)).toBe(false);
  });
});

describe("planQueries", () => {
  it("cubre los meses de la ventana y respeta directos", () => {
    expect(monthsInWindow("2026-12-30", 3)).toEqual(["2026-12", "2027-01"]);
    const q = planQueries(argentina);
    expect(q).toHaveLength(2); // 2 orígenes × 1 destino × 1 mes ida × 1 mes vuelta
    expect(q[0]).toEqual({ origin: "MRS", destination: "BUE", departure: "2026-12", return: "2027-01", directOnly: false });
    expect(planQueries(europe).every((x) => x.directOnly)).toBe(true);
  });
});

describe("collectMatches", () => {
  it("filtra por ventana de fechas y escalas, ordenado por precio", () => {
    const offers = [
      offer({ price: 90, departAt: "2026-12-04T07:00:00+01:00", returnAt: "2026-12-08T20:00:00+00:00" }),
      offer({ price: 70, departAt: "2026-12-07T07:00:00+01:00", returnAt: "2026-12-09T20:00:00+00:00" }),
      offer({ price: 50, departAt: "2026-12-02T07:00:00+01:00", returnAt: "2026-12-08T20:00:00+00:00" }), // ida fuera
      offer({ price: 40, departAt: "2026-12-05T07:00:00+01:00", returnAt: "2026-12-10T20:00:00+00:00" }), // vuelta fuera
      offer({ price: 30, departAt: "2026-12-05T07:00:00+01:00", returnAt: "2026-12-08T20:00:00+00:00", transfers: 1 }),
    ];
    expect(collectMatches(offers, europe).map((m) => m.price)).toEqual([70, 90]);
  });
});

describe("pickAlerts", () => {
  const m = (key: string, price: number) => ({ key, price }) as WatchMatch;

  it("con precio máximo avisa de los que están por debajo, sin repetir", () => {
    const matches = [m("a", 80), m("b", 110), m("c", 130)];
    expect(pickAlerts(matches, europe, new Map()).map((x) => x.match.key)).toEqual(["a", "b"]);
    expect(pickAlerts(matches, europe, new Map([["a", 80], ["b", 110]]))).toEqual([]);
    // re-aviso si baja ≥ 5 %
    expect(pickAlerts([m("a", 75)], europe, new Map([["a", 80]])).map((x) => x.reason)).toEqual(["under_max"]);
  });

  it("sin precio máximo avisa sólo de nuevos mínimos", () => {
    expect(pickAlerts([m("a", 900)], argentina, new Map())[0]?.reason).toBe("new_low");
    expect(pickAlerts([m("b", 880)], argentina, new Map([["a", 900]]))).toEqual([]);
    expect(pickAlerts([m("b", 850)], argentina, new Map([["a", 900]]))[0]?.match.key).toBe("b");
  });
});

describe("integración con la fuente sintética", () => {
  it("encuentra vuelos de larga distancia con escala en la ventana", async () => {
    const src = new FixtureSource(1);
    const offers = (await Promise.all(planQueries(argentina).map((q) => src.search(q)))).flat();
    const matches = collectMatches(offers, argentina);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((x) => x.transfers <= 1 && x.returnTransfers <= 1)).toBe(true);
  });

  it("caduca cuando la ventana de ida ha pasado", () => {
    expect(isExpired(europe, "2026-12-07")).toBe(false);
    expect(isExpired(europe, "2026-12-08")).toBe(true);
  });
});
