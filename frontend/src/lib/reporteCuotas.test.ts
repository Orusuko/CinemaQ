import { describe, expect, it } from "vitest";
import { agruparReporte, semanaDe } from "./reporteCuotas";
import type { PagoCuota } from "./tipos";

const pago = (parcial: Pick<PagoCuota, "empleado_id" | "area_id" | "fecha" | "monto_esperado" | "estado">): PagoCuota =>
  ({ id: parcial.fecha + parcial.empleado_id, ...parcial } as PagoCuota);

describe("semanaDe", () => {
  it("jueves y miercoles caen en la misma semana", () => {
    expect(semanaDe("2026-09-10")).toEqual({ desde: "2026-09-10", hasta: "2026-09-16" });
    expect(semanaDe("2026-09-16")).toEqual({ desde: "2026-09-10", hasta: "2026-09-16" });
  });
  it("el jueves siguiente abre otra semana", () => {
    expect(semanaDe("2026-09-17")).toEqual({ desde: "2026-09-17", hasta: "2026-09-23" });
  });
});

describe("agruparReporte", () => {
  it("separa falta, validado y en revision, y omite cancelado", () => {
    const semanas = agruparReporte([
      pago({ empleado_id: "a", area_id: "cor", fecha: "2026-09-10", monto_esperado: 10, estado: "pendiente" }),
      pago({ empleado_id: "a", area_id: "cor", fecha: "2026-09-11", monto_esperado: 10, estado: "validado" }),
      pago({ empleado_id: "a", area_id: "cor", fecha: "2026-09-12", monto_esperado: 10, estado: "marcado_pendiente_validacion" }),
      pago({ empleado_id: "a", area_id: "cor", fecha: "2026-09-13", monto_esperado: 10, estado: "cancelado" }),
      pago({ empleado_id: "b", area_id: "com", fecha: "2026-09-17", monto_esperado: 21, estado: "pendiente" }),
    ]);
    expect(semanas.map((s) => s.desde)).toEqual(["2026-09-17", "2026-09-10"]);
    const primera = semanas[1].filas[0];
    expect(primera).toMatchObject({ empleadoId: "a", dias: 3, esperado: 30, validado: 10, falta: 10, enRevision: 10 });
    expect(semanas[1]).toMatchObject({ esperado: 30, validado: 10, falta: 10, enRevision: 10 });
  });
});
