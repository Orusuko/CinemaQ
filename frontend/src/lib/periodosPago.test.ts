import { describe, expect, it } from "vitest";
import { moverPeriodo, periodoDe } from "./periodosPago";

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

describe("moverPeriodo", () => {
  it("avanza y retrocede un periodo completo", () => {
    expect(periodoDe("catorcenal", moverPeriodo("catorcenal", "2026-09-17", 1)).desde).toBe("2026-09-24");
    expect(periodoDe("semanal", moverPeriodo("semanal", "2026-09-17", -1)).desde).toBe("2026-09-10");
  });
});
