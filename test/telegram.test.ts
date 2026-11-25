import { describe, expect, it } from "vitest";
import { formatDealMessage } from "../src/notify/telegram";
import type { DealRow } from "../src/storage/db";

const row: DealRow = {
  trip_key: "k", origin: "MRS", destination: "LIS", mode: "daytrip", nights: 0,
  depart_at: "2026-12-05T06:45:00+01:00", return_at: "2026-12-05T21:30:00+00:00",
  price: 54, currency: "EUR", airline: "FR", flight_numbers: "", useful_hours: 11.7,
  median_price: 110, discount: 0.51, z_score: 2.4, samples: 20, score: 55, error_fare: 0,
  link: "https://www.aviasales.com/search/x?a=1&b=2", source: "travelpayouts",
  first_seen_at: "", last_seen_at: "", alerted_price: null, alerted_at: null,
};

describe("formatDealMessage", () => {
  it("incluye ruta, horario, precio y enlaces escapados", () => {
    const msg = formatDealMessage(row);
    expect(msg).toContain("MRS → LIS");
    expect(msg).toContain("sáb 05/12 06:45");
    expect(msg).toContain("54 EUR");
    expect(msg).toContain("−51%");
    expect(msg).toContain("a=1&amp;b=2");
    expect(msg).toContain("Google Flights");
  });
});

describe("sendTelegram", () => {
  it("incluye el motivo de Telegram en el error, sin el token", async () => {
    const { sendTelegram } = await import("../src/notify/telegram");
    const fake = (async () =>
      new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), { status: 400 })) as unknown as typeof fetch;
    const err = await sendTelegram("123:SECRET", "42", "hola", fake).catch((e: Error) => e);
    expect(String(err)).toContain("chat not found");
    expect(String(err)).not.toContain("SECRET");
  });
});
