import { describe, expect, it } from "vitest";
import { FixtureSource } from "../src/sources/fixture";
import { TravelpayoutsSource, normalizeTpFare } from "../src/sources/travelpayouts";
import { SourceError } from "../src/sources/types";
import { pickOrigins, upcomingMonths } from "../src/scan";

const sample = {
  origin: "MRS",
  destination: "LIS",
  origin_airport: "MRS",
  destination_airport: "LIS",
  price: 54,
  airline: "FR",
  flight_number: 1234,
  departure_at: "2026-12-05T06:45:00+01:00",
  return_at: "2026-12-05T21:30:00+00:00",
  transfers: 0,
  return_transfers: 0,
  duration_to: 135,
  duration_back: 125,
  link: "/search/MRS0512LIS05121?t=abc",
};

describe("Travelpayouts", () => {
  it("normaliza una tarifa", () => {
    const o = normalizeTpFare(sample, "MRS", "eur")!;
    expect(o).toMatchObject({ origin: "MRS", destination: "LIS", price: 54, currency: "EUR", flightNumbers: "FR1234", durationOutMin: 135 });
    expect(o.link).toBe("https://www.aviasales.com/search/MRS0512LIS05121?t=abc");
  });

  it("descarta tarifas incompletas", () => {
    expect(normalizeTpFare({ ...sample, return_at: undefined }, "MRS", "eur")).toBeNull();
    expect(normalizeTpFare({ ...sample, price: 0 }, "MRS", "eur")).toBeNull();
  });

  it("envía el token por cabecera y pide sólo directos", async () => {
    let calledUrl = "";
    let headers: HeadersInit | undefined;
    const fake = (async (url: string, init?: RequestInit) => {
      calledUrl = url;
      headers = init?.headers;
      return new Response(JSON.stringify({ success: true, data: [sample], currency: "eur" }));
    }) as unknown as typeof fetch;
    const offers = await new TravelpayoutsSource("tok", "eur", fake).roundTrips("MRS", "2026-12");
    expect(offers).toHaveLength(1);
    expect(calledUrl).toContain("direct=true");
    expect(calledUrl).not.toContain("tok");
    expect((headers as Record<string, string>)["X-Access-Token"]).toBe("tok");
  });

  it("llama al fetch global sin un `this` ajeno (Workers lanza Illegal invocation)", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    // Imita la comprobación de Workers: falla si `this` no es globalThis/undefined.
    globalThis.fetch = function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      calls++;
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: [sample] })));
    } as typeof fetch;
    try {
      const offers = await new TravelpayoutsSource("tok").roundTrips("MRS", "2026-12");
      expect(offers).toHaveLength(1);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("propaga el código HTTP en los errores", async () => {
    const fake = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    await expect(new TravelpayoutsSource("tok", "eur", fake).roundTrips("MRS", "2026-12")).rejects.toMatchObject({
      status: 429,
    } satisfies Partial<SourceError>);
  });
});

describe("FixtureSource", () => {
  it("es determinista", async () => {
    const a = await new FixtureSource(1).roundTrips("MPL", "2026-12");
    const b = await new FixtureSource(1).roundTrips("MPL", "2026-12");
    expect(a.length).toBeGreaterThan(20);
    expect(a).toEqual(b);
  });
});

describe("scan helpers", () => {
  it("rota los aeropuertos de salida", () => {
    const all = ["MPL", "MRS", "FNI", "BZR", "TLN"];
    expect(pickOrigins(all, 2, 1)).toEqual(["MPL", "MRS"]);
    expect(pickOrigins(all, 2, 2)).toEqual(["FNI", "BZR"]);
    expect(pickOrigins(all, 2, 3)).toEqual(["TLN", "MPL"]);
  });

  it("genera meses a partir del actual", () => {
    expect(upcomingMonths(new Date("2026-11-25T00:00:00Z"), 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});
