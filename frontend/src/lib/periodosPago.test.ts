import { describe, expect, it } from "vitest";
import { catorcenaNumerada, fechaDeNumero, moverPeriodo, periodoDe, semanaNumerada } from "./periodosPago";

describe("periodoDe", () => {
  it("semanal es jueves-miércoles", () => {
    expect(periodoDe("semanal", "2026-09-17")).toEqual({ desde: "2026-09-17", hasta: "2026-09-23" });
  });

  it("catorcenal arranca en el jueves ancla y dura 14 días", () => {
    expect(periodoDe("catorcenal", "2026-09-10")).toEqual({ desde: "2026-09-10", hasta: "2026-09-23" });
    expect(periodoDe("catorcenal", "2026-09-23")).toEqual({ desde: "2026-09-10", hasta: "2026-09-23" });
    expect(periodoDe("catorcenal", "2026-09-24")).toEqual({ desde: "2026-09-24", hasta: "2026-10-07" });
  });

  it("catorcenal funciona antes del ancla", () => {
    expect(periodoDe("catorcenal", "2026-09-03")).toEqual({ desde: "2026-08-27", hasta: "2026-09-09" });
  });
});

describe("numeración de la portada del horario", () => {
  it("coincide con los PDF Sem 33 a Sem 38", () => {
    expect(semanaNumerada("2026-08-13")).toMatchObject({ anio: 2026, numero: 33, desde: "2026-08-13", hasta: "2026-08-19" });
    expect(semanaNumerada("2026-08-26").numero).toBe(34);
    expect(semanaNumerada("2026-08-27").numero).toBe(35);
    expect(semanaNumerada("2026-09-09").numero).toBe(36);
    expect(semanaNumerada("2026-09-10").numero).toBe(37);
    expect(semanaNumerada("2026-09-17")).toMatchObject({ numero: 38, desde: "2026-09-17", hasta: "2026-09-23" });
  });

  it("la catorcena junta la semana impar con la siguiente", () => {
    expect(catorcenaNumerada("2026-09-17")).toMatchObject({
      anio: 2026,
      numero: 19,
      desde: "2026-09-10",
      hasta: "2026-09-23",
      semanaDesde: 37,
      semanaHasta: 38,
    });
    expect(catorcenaNumerada("2026-08-20").numero).toBe(17);
    expect(catorcenaNumerada("2026-09-03")).toMatchObject({ numero: 18, semanaDesde: 35, semanaHasta: 36 });
  });

  it("el número escrito vuelve a la fecha de la portada", () => {
    expect(fechaDeNumero("semanal", 2026, 37)).toBe("2026-09-10");
    expect(fechaDeNumero("catorcenal", 2026, 19)).toBe("2026-09-10");
    expect(semanaNumerada(fechaDeNumero("semanal", 2026, 33)).numero).toBe(33);
  });
});

describe("moverPeriodo", () => {
  it("avanza y retrocede un periodo completo", () => {
    expect(periodoDe("catorcenal", moverPeriodo("catorcenal", "2026-09-17", 1)).desde).toBe("2026-09-24");
    expect(periodoDe("semanal", moverPeriodo("semanal", "2026-09-17", -1)).desde).toBe("2026-09-10");
  });
});
