import { describe, expect, it } from "vitest";
import {
  buildContractRecord,
  classifyCell,
  generaCuotaPorCorte,
  mapArea,
  normalizePs,
  parseFechaIso,
} from "./horarioReglas";

describe("corte de las 11:00", () => {
  it("11:00 AM entra, 10:59 AM no", () => {
    expect(generaCuotaPorCorte("11:00 AM")).toBe(true);
    expect(generaCuotaPorCorte("10:59 AM")).toBe(false);
  });
  it("mediodia y medianoche", () => {
    expect(generaCuotaPorCorte("12:00 PM")).toBe(true);
    expect(generaCuotaPorCorte("12:00 AM")).toBe(false);
  });
});

describe("fecha y PS", () => {
  it("solo acepta ISO", () => {
    expect(parseFechaIso("2026-09-10")).toBe("2026-09-10");
    expect(parseFechaIso("MAR 02/09")).toBeNull();
    expect(parseFechaIso("2026-13-40")).toBeNull();
  });
  it("PS de 6 digitos", () => {
    expect(normalizePs("244689")).toBe("244689");
    expect(normalizePs(" 244689 ")).toBe("244689");
    expect(normalizePs("2446")).toBeNull();
  });
});

describe("celdas y registros (formatos reales del PDF)", () => {
  it("hora con espacio final y area", () => {
    const c = classifyCell("04:00 PM - 10:00 PM \nCOMANDEROS");
    expect(c.hora_inicio).toBe("04:00 PM");
    expect(c.hora_fin).toBe("10:00 PM");
    expect(c.area_pdf).toBe("COMANDEROS");
  });
  it("area de 3 lineas se une con espacio", () => {
    const c = classifyCell("02:30 PM - 09:45 PM\nLIMPIEZA ENTRE\nFUNCIONES");
    expect(c.area_pdf).toBe("LIMPIEZA ENTRE FUNCIONES");
    expect(mapArea(c.area_pdf).categoria).toBe("otra_reconocida");
  });
  it("areas fuera de alcance con acentos", () => {
    expect(mapArea("BAÑOS").categoria).toBe("otra_reconocida");
    expect(mapArea("APOYO OTRAS AREAS").categoria).toBe("otra_reconocida");
  });
  it("clasificaciones", () => {
    const base = { ps: "100001", nombre_pdf: "PRUEBA UNO", fecha: "2026-09-10" };
    const clasif = (raw_cell: string) => buildContractRecord({ ...base, raw_cell }).clasificacion;
    expect(clasif("04:00 PM - 10:00 PM\nCOMANDEROS")).toBe("candidato_cuota");
    expect(clasif("11:00 AM - 07:00 PM\nCORREDORES")).toBe("candidato_cuota");
    expect(clasif("08:30 AM - 04:30 PM\nCOMANDEROS")).toBe("sin_cuota_omitir");
    expect(clasif("VACACIÓN")).toBe("ignorar");
    expect(clasif("10:00 AM - 04:30 PM\nCOCINA")).toBe("ignorar_area");
    expect(clasif("")).toBe("ignorar");
    expect(clasif("ALGO RARO")).toBe("revisar");
    expect(clasif("04:00 PM - 10:00 PM\nAREA NUEVA")).toBe("revisar");
  });
  it("candidato trae area_cinema y genera_cuota", () => {
    const r = buildContractRecord({
      ps: "100001",
      nombre_pdf: "X",
      fecha: "2026-09-10",
      raw_cell: "04:00 PM - 10:00 PM\nCOMANDEROS",
    });
    expect(r.area_cinema).toBe("comanderos");
    expect(r.genera_cuota).toBe(true);
    expect(r.hora_inicio).toBe("04:00 PM");
  });
});
