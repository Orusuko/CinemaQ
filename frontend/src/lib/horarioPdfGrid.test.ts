import { expect, it } from "vitest";
import { buildGridFromItems, type ItemTexto } from "./horarioPdfGrid";

// Coordenadas tomadas de un PDF real de horario; PS y nombres son ficticios.
const t = (str: string, x: number, y: number, w = str.length * 5, pagina = 1): ItemTexto => ({
  str,
  x,
  y,
  w,
  pagina,
});

const encabezado = [
  t("C. VIP GALERIAS SANTA ANITA", 36, 727.4),
  t("37, 2026-09-10 - 2026-09-16", 36, 707.4),
  t("PS", 55.2, 684.5, 11),
  t("Nombre", 138.6, 684.5, 36),
  t("2026-09-10", 271.7, 684.5, 55),
  t("2026-09-11", 408.5, 684.5, 55),
];

it("fila de 3 lineas no invade la fila siguiente y el pie se descarta", () => {
  const items = [
    ...encabezado,
    // fila alta: celda de 3 lineas (LIMPIEZA ENTRE / FUNCIONES)
    t("100001", 42.5, 541.4, 33),
    t("PRUEBA UNO", 107.7, 541.4, 60),
    t("APELLIDO NOMBRE", 113.1, 527.1, 80),
    t("02:30 PM - 09:45 PM ", 250.6, 542.9, 100),
    t("LIMPIEZA ENTRE", 258.1, 531.0, 75),
    t("FUNCIONES", 270.3, 519.1, 50),
    t("03:00 PM - 09:00 PM ", 387.5, 542.9, 100),
    t("LIMPIEZA ENTRE", 395.0, 531.0, 75),
    t("FUNCIONES", 407.2, 519.1, 50),
    // fila siguiente, segunda celda vacia
    t("100002", 42.5, 502.7, 33),
    t("PRUEBA DOS", 105.8, 502.7, 60),
    t("APELLIDO NOMBRE", 120.1, 488.4, 80),
    t("08:30 AM - 02:30 PM ", 250.3, 504.2, 100),
    t("LIMPIEZA PROFUNDA", 247.0, 492.3, 85),
    t("2026-09-14 16:58:39, C. VIP GALERIAS SANTA ANITA SA1224, 37,PAG. 1/2", 300, 30, 340),
  ];
  const { filas, avisos, meta, empleados } = buildGridFromItems(items);
  expect(avisos).toEqual([]);
  expect(empleados).toBe(2);
  expect(meta).toMatchObject({
    ubicacion: "C. VIP GALERIAS SANTA ANITA",
    semana: 37,
    desde: "2026-09-10",
    hasta: "2026-09-16",
    generadoEn: "2026-09-14 16:58:39",
  });
  expect(filas).toEqual([
    { ps: "100001", nombre_pdf: "PRUEBA UNO APELLIDO NOMBRE", fecha: "2026-09-10", raw_cell: "02:30 PM - 09:45 PM\nLIMPIEZA ENTRE\nFUNCIONES" },
    { ps: "100001", nombre_pdf: "PRUEBA UNO APELLIDO NOMBRE", fecha: "2026-09-11", raw_cell: "03:00 PM - 09:00 PM\nLIMPIEZA ENTRE\nFUNCIONES" },
    { ps: "100002", nombre_pdf: "PRUEBA DOS APELLIDO NOMBRE", fecha: "2026-09-10", raw_cell: "08:30 AM - 02:30 PM\nLIMPIEZA PROFUNDA" },
    { ps: "100002", nombre_pdf: "PRUEBA DOS APELLIDO NOMBRE", fecha: "2026-09-11", raw_cell: "" },
  ]);
});

it("pagina sin encabezado de fechas genera aviso", () => {
  const { filas, avisos } = buildGridFromItems([t("hola", 10, 10)]);
  expect(filas).toEqual([]);
  expect(avisos.length).toBe(1);
});

it("palabras partidas por kerning se pegan sin espacio", () => {
  const items = [
    ...encabezado,
    t("100001", 42.5, 667.7, 33),
    t("PRUEBA", 94.7, 667.7, 40),
    t("04:00 PM - 10:00 PM ", 250.3, 669.1, 100),
    t("COMANDE", 263.2, 657.2, 35),
    t("ROS", 298.2, 657.2, 15),
  ];
  const { filas } = buildGridFromItems(items);
  expect(filas[0].raw_cell).toBe("04:00 PM - 10:00 PM\nCOMANDEROS");
});

it("PS fusionado con la primera linea del nombre en un solo fragmento", () => {
  const items = [
    ...encabezado,
    t("100001 PRUEBA UNO", 42.5, 667.7, 187.9),
    t("SEGUNDO NOMBRE", 110.7, 653.4, 80),
    t("04:00 PM - 10:00 PM ", 250.3, 669.1, 100),
    t("COMANDEROS", 263.2, 657.2, 50),
  ];
  const { filas, empleados } = buildGridFromItems(items);
  expect(empleados).toBe(1);
  expect(filas[0]).toEqual({
    ps: "100001",
    nombre_pdf: "PRUEBA UNO SEGUNDO NOMBRE",
    fecha: "2026-09-10",
    raw_cell: "04:00 PM - 10:00 PM\nCOMANDEROS",
  });
});

it("pagina 2 solo con encabezado repetido y avisos de PS repetido", () => {
  const pag2 = (str: string, x: number, y: number, w = str.length * 5) => t(str, x, y, w, 2);
  const items = [
    ...encabezado,
    t("100001", 42.5, 667.7, 33),
    t("PRUEBA", 94.7, 667.7, 40),
    pag2("PS", 55.2, 744.5, 11),
    pag2("Nombre", 138.6, 744.5, 36),
    pag2("2026-09-10", 271.7, 744.5, 55),
    pag2("2026-09-11", 408.5, 744.5, 55),
    pag2("100001", 42.5, 727.7, 33),
    pag2("OTRA", 94.7, 727.7, 30),
  ];
  const { filas, avisos, empleados } = buildGridFromItems(items);
  expect(empleados).toBe(1);
  expect(filas.length).toBe(2);
  expect(avisos.some((a) => a.includes("100001"))).toBe(true);
});

it("avisa si las fechas de las columnas salen del rango del titulo", () => {
  const items = [
    t("37, 2026-09-10 - 2026-09-12", 36, 707.4),
    t("PS", 55.2, 684.5, 11),
    t("Nombre", 138.6, 684.5, 36),
    t("2026-09-10", 271.7, 684.5, 55),
    t("2026-09-15", 408.5, 684.5, 55),
  ];
  const { avisos } = buildGridFromItems(items);
  expect(avisos.some((a) => a.includes("2026-09-15"))).toBe(true);
});
