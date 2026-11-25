import type { Offer } from "../src/types";

export function offer(over: Partial<Offer> = {}): Offer {
  return {
    source: "test",
    origin: "MRS",
    destination: "LIS",
    price: 100,
    currency: "EUR",
    airline: "FR",
    flightNumbers: "",
    departAt: "2026-12-05T07:00:00+01:00",
    returnAt: "2026-12-05T21:00:00+00:00",
    durationOutMin: 130,
    durationBackMin: 125,
    transfers: 0,
    returnTransfers: 0,
    link: "",
    ...over,
  };
}
