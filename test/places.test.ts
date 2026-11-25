import { describe, expect, it } from "vitest";
import { LOCAL_PLACES, mergePlaces, normalizeRemote, searchLocal } from "../src/core/places";

const codes = (q: string) => searchLocal(q).map((p) => p.code);

describe("searchLocal", () => {
  it("encuentra por ciudad, priorizando el código de ciudad", () => {
    expect(codes("buenos")).toEqual(["BUE", "AEP", "EZE"]);
    expect(codes("Lisboa")).toEqual(["LIS"]);
  });

  it("ignora acentos y mayúsculas", () => {
    expect(codes("zurich")).toContain("ZRH");
    expect(codes("CORDOBA")).toContain("COR");
    expect(codes("sao paulo")[0]).toBe("SAO");
  });

  it("acepta el código IATA directamente y por país", () => {
    expect(codes("eze")[0]).toBe("EZE");
    expect(codes("argentina")).toContain("BUE");
  });

  it("no devuelve nada con menos de 2 letras", () => {
    expect(searchLocal("b")).toEqual([]);
  });

  it("la lista no tiene códigos repetidos ni mal formados", () => {
    const all = LOCAL_PLACES.map((p) => p.code);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((c) => /^[A-Z]{3}$/.test(c))).toBe(true);
  });
});

describe("normalizeRemote / mergePlaces", () => {
  it("normaliza places2 y descarta basura", () => {
    const remote = normalizeRemote([
      { type: "city", code: "nqn", name: "Neuquén", country_name: "Argentina" },
      { type: "airport", code: "EZE", name: "Ministro Pistarini", city_name: "Buenos Aires", country_name: "Argentina" },
      { type: "country", code: "AR", name: "Argentina" },
      { type: "city", code: "12", name: "X" },
    ]);
    expect(remote.map((p) => p.code)).toEqual(["NQN", "EZE"]);
    expect(remote[1]!.city).toBe("Buenos Aires");
    expect(normalizeRemote({ error: 1 })).toEqual([]);
  });

  it("une sin repetir y respeta el límite", () => {
    const local = searchLocal("buenos");
    const merged = mergePlaces(local, normalizeRemote([{ type: "airport", code: "EZE", name: "Pistarini" }, { type: "city", code: "NQN", name: "Neuquén" }]), 4);
    expect(merged.map((p) => p.code)).toEqual(["BUE", "AEP", "EZE", "NQN"]);
  });
});
