import { describe, expect, it } from "vitest";
import { classifyTrip, hasUsableSchedule, scheduleFactor } from "../src/core/trip";
import { offer } from "./helpers";

describe("classifyTrip", () => {
  it("calcula horas útiles de un viaje en el día con zonas horarias distintas", () => {
    // Sale 07:00 +01 (06:00Z), vuela 130 min → llega 08:10Z. Vuelta 21:00 +00 (21:00Z).
    // 12.83 h brutas − 2 h de traslados = 10.8 h
    const t = classifyTrip(offer())!;
    expect(t.mode).toBe("daytrip");
    expect(t.nights).toBe(0);
    expect(t.usefulHours).toBeCloseTo(10.8, 1);
    expect(hasUsableSchedule(t)).toBe(true);
  });

  it("descuenta sueño por noche", () => {
    const t = classifyTrip(offer({ returnAt: "2026-12-07T20:00:00+00:00" }))!;
    expect(t.mode).toBe("escapade");
    expect(t.nights).toBe(2);
    // llega 08:10Z del 5, vuelve 20:00Z del 7 → 59.83 h brutas − 2 − 16 = 41.8
    expect(t.usefulHours).toBeCloseTo(41.8, 1);
  });

  it("rechaza viajes de más de 7 noches y vueltas anteriores a la ida", () => {
    expect(classifyTrip(offer({ returnAt: "2026-12-20T20:00:00+00:00" }))).toBeNull();
    expect(classifyTrip(offer({ returnAt: "2026-12-04T20:00:00+00:00" }))).toBeNull();
  });

  it("marca como inservible un día con horario trampa", () => {
    const t = classifyTrip(offer({ departAt: "2026-12-05T13:00:00+01:00", returnAt: "2026-12-05T19:00:00+00:00" }))!;
    expect(hasUsableSchedule(t)).toBe(false);
    expect(scheduleFactor(t)).toBe(0.6);
  });
});
