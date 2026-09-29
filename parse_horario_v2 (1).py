"""
Extractor v3: PDF semanal de horarios de cine -> contrato JSON "crudo" para
la pantalla "Importar horario" de CinemaQ.

Este script SOLO extrae y clasifica el PDF (hora, área, estado, si genera
cuota según la regla de negocio). Ya NO decide "crear / omitir / conflicto":
esa resolución requiere el estado en vivo de Supabase (¿ya existe el
horario/asistencia?, ¿ya fue validado?, ¿cuál es la cuota vigente esa
fecha?) y por eso se movió a `frontend/src/lib/importacionHorario.ts`, que
la vuelve a calcular contra datos frescos cada vez que se sube este JSON.

Cada fila de salida trae: ps, nombre_pdf, fecha (ISO YYYY-MM-DD), hora_inicio,
hora_fin, area_pdf, area_cinema, categoria, genera_cuota, estado.

Ver informe.md para la crítica del script v1 y las decisiones de diseño.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

# --------------------------------------------------------------------------
# Constantes de negocio
# --------------------------------------------------------------------------

TIME_RANGE_RE = re.compile(
    r"^(?P<start>\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(?P<end>\d{1,2}:\d{2}\s*[AP]M)$"
)
LOOSE_TIME_HINT_RE = re.compile(r"\d{1,2}:\d{2}|AM|PM")

# Catálogo editable de estados "no laborables" conocidos. Cualquier estado
# fuera de este set (y distinto de TRABAJA/SIN_TURNO) se manda a "revisar"
# en vez de asumir silenciosamente que es seguro ignorarlo.
KNOWN_NON_WORK_STATUSES = {
    "VACACIÓN", "VACACION", "DESCANSO", "INCAPACIDAD", "PERMISO", "FALTA",
    "BAJA", "SIN GOCE DE SUELDO",
}

CORTE_CUOTA_MINUTOS = 11 * 60  # 11:00 — hora impresa en el PDF, interpretada como America/Mexico_City

# Encabezado de columna de fecha en el PDF: variantes toleradas.
#   "01/09/2026", "01/09", "LUN 01/09", "1-Sep-2026", etc.
DATE_HEADER_DDMM_RE = re.compile(r"(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?")
DATE_HEADER_ISO_RE = re.compile(r"(\d{4})-(\d{1,2})-(\d{1,2})")
MESES_ABR = {
    "ENE": 1, "JAN": 1, "FEB": 2, "MAR": 3, "ABR": 4, "APR": 4, "MAY": 5,
    "JUN": 6, "JUL": 7, "AGO": 8, "AUG": 8, "SEP": 9, "SET": 9, "OCT": 10,
    "NOV": 11, "DIC": 12, "DEC": 12,
}

DEFAULT_ALIASES = {
    "comanderos": ["COMANDEROS"],
    "corredores": ["CORREDORES"],
    "otras_areas_reconocidas": [
        "APOYO OTRAS AREAS", "COCINA", "LIMPIEZA PROFUNDA",
        "LIMPIEZA ENTRE FUNCIONES", "TAQUILLA", "DULCERIA", "BAÑOS",
    ],
}


# --------------------------------------------------------------------------
# Tiempo / regla de mediodía
# --------------------------------------------------------------------------

def parse_time_to_minutes(time_str: str) -> int:
    """'08:30 AM' -> minutos desde medianoche (0-1439). ValueError si es inválida."""
    m = re.match(r"^(\d{1,2}):(\d{2})\s*([AP]M)$", time_str.strip())
    if not m:
        raise ValueError(f"hora no reconocida: {time_str!r}")
    hour, minute, period = int(m.group(1)), int(m.group(2)), m.group(3)
    if not (1 <= hour <= 12) or not (0 <= minute < 60):
        raise ValueError(f"hora fuera de rango: {time_str!r}")
    hour24 = (0 if hour == 12 else hour) if period == "AM" else (12 if hour == 12 else hour + 12)
    return hour24 * 60 + minute


def genera_cuota_por_corte(hora_inicio: str) -> bool:
    """Regla 6: hora_inicio >= 11:00 (America/Mexico_City) -> True (candidato a cuota)."""
    return parse_time_to_minutes(hora_inicio) >= CORTE_CUOTA_MINUTOS


# --------------------------------------------------------------------------
# Normalización de fecha de encabezado y de PS (número de empleado)
# --------------------------------------------------------------------------

def normalize_fecha_header(texto: str, anio_default: Optional[int] = None) -> str:
    """Convierte el texto de una columna de fecha del PDF a ISO 'YYYY-MM-DD'.

    Tolera 'DD/MM/YYYY', 'DD/MM', 'DD-MM-YYYY', nombres de día como prefijo
    ('LUN 01/09'), abreviaturas de mes ('1-SEP-2026') y 'YYYY-MM-DD' directo.
    Si el encabezado no trae año (caso común en PDFs semanales), usa
    `anio_default`. Lanza ValueError si no puede normalizarse — nunca
    adivina en silencio, para no correr el riesgo de fechas erróneas al
    momento de crear obligaciones de pago reales.
    """
    t = texto.strip().upper()

    m_iso = DATE_HEADER_ISO_RE.search(t)
    if m_iso:
        anio, mes, dia = int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))
        return f"{anio:04d}-{mes:02d}-{dia:02d}"

    for abr, mes_num in MESES_ABR.items():
        if abr in t:
            m_dia = re.search(r"(\d{1,2})", t)
            m_anio = re.search(r"(\d{4})", t)
            if m_dia:
                dia = int(m_dia.group(1))
                anio = int(m_anio.group(1)) if m_anio else anio_default
                if anio is None:
                    raise ValueError(f"fecha sin año y sin --anio-default: {texto!r}")
                return f"{anio:04d}-{mes_num:02d}-{dia:02d}"

    m_ddmm = DATE_HEADER_DDMM_RE.search(t)
    if m_ddmm:
        dia, mes = int(m_ddmm.group(1)), int(m_ddmm.group(2))
        anio_texto = m_ddmm.group(3)
        if anio_texto:
            anio = int(anio_texto) if len(anio_texto) == 4 else 2000 + int(anio_texto)
        elif anio_default is not None:
            anio = anio_default
        else:
            raise ValueError(f"fecha sin año y sin --anio-default: {texto!r}")
        if not (1 <= mes <= 12) or not (1 <= dia <= 31):
            raise ValueError(f"fecha fuera de rango: {texto!r}")
        return f"{anio:04d}-{mes:02d}-{dia:02d}"

    raise ValueError(f"encabezado de fecha no reconocido: {texto!r}")


def normalize_ps(ps: str) -> str:
    """Normaliza el número de empleado (PS) al formato de 6 dígitos usado en
    `empleados.numero_empleado` (ver validación en Empleados.tsx: /^[0-9]{6}$/)."""
    digitos = re.sub(r"\D", "", ps or "")
    if not digitos:
        raise ValueError(f"PS sin dígitos: {ps!r}")
    return digitos.zfill(6)


# --------------------------------------------------------------------------
# Alias de área (editable vía area_aliases.json)
# --------------------------------------------------------------------------

def normalize_area(text: str) -> str:
    return " ".join(text.strip().upper().split())


def load_alias_lookup(alias_json_path: Optional[str]) -> dict:
    data = DEFAULT_ALIASES if alias_json_path is None else json.loads(
        Path(alias_json_path).read_text(encoding="utf-8")
    )
    lookup = {}
    for text in data.get("comanderos", []):
        lookup[normalize_area(text)] = "comanderos"
    for text in data.get("corredores", []):
        lookup[normalize_area(text)] = "corredores"
    for text in data.get("otras_areas_reconocidas", []):
        lookup[normalize_area(text)] = "otra_reconocida"
    return lookup


def map_area(area_pdf: Optional[str], alias_lookup: dict):
    """-> (area_cinema, categoria). categoria en
    {'comanderos','corredores','otra_reconocida','desconocida'}."""
    if not area_pdf:
        return None, "desconocida"
    categoria = alias_lookup.get(normalize_area(area_pdf), "desconocida")
    area_cinema = categoria if categoria in ("comanderos", "corredores") else None
    return area_cinema, categoria


# --------------------------------------------------------------------------
# Extracción cruda: una fila por (empleado, fecha), incluidos días sin turno
# --------------------------------------------------------------------------

def classify_cell(raw_cell: Optional[str]) -> dict:
    text = (raw_cell or "").strip()
    if not text:
        return {"estado": "SIN_TURNO", "hora_inicio": None, "hora_fin": None, "area_pdf": None}

    lines = [l.strip() for l in text.split("\n") if l.strip()]
    first = lines[0].upper()
    m = TIME_RANGE_RE.match(first)
    if m:
        try:
            parse_time_to_minutes(m.group("start"))
            parse_time_to_minutes(m.group("end"))
        except ValueError:
            return {"estado": "FORMATO_INVALIDO", "hora_inicio": None, "hora_fin": None, "area_pdf": None}
        area_pdf = " ".join(lines[1:]) if len(lines) > 1 else ""
        return {"estado": "TRABAJA", "hora_inicio": m.group("start"), "hora_fin": m.group("end"),
                "area_pdf": area_pdf}

    if LOOSE_TIME_HINT_RE.search(first):
        # Parece un horario (trae AM/PM o un patrón H:MM) pero no calzó el
        # patrón exacto -> se marca como error explícito, no se adivina.
        return {"estado": "FORMATO_INVALIDO", "hora_inicio": None, "hora_fin": None, "area_pdf": None}

    return {"estado": text, "hora_inicio": None, "hora_fin": None, "area_pdf": None}


def extract_raw_records(pdf_path: str, anio_default: Optional[int] = None) -> tuple[list[dict], str, list[str]]:
    import pdfplumber  # solo hace falta para leer PDFs reales; los tests no lo requieren

    records: list[dict] = []
    location = ""
    fecha_problems: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if not location and page_text:
                location = page_text.split("\n")[0].strip()
            tables = page.extract_tables()
            if not tables:
                continue
            header = tables[0][0]
            date_cols_raw = header[2:]
            date_cols_iso: list[Optional[str]] = []
            for encabezado in date_cols_raw:
                try:
                    date_cols_iso.append(normalize_fecha_header(encabezado or "", anio_default))
                except ValueError as e:
                    fecha_problems.append(str(e))
                    date_cols_iso.append(None)
            for row in tables[0][1:]:
                if not row or not row[0]:
                    continue
                try:
                    ps = normalize_ps(row[0])
                except ValueError as e:
                    fecha_problems.append(f"fila omitida, PS inválido: {e}")
                    continue
                nombre = " ".join((row[1] or "").split("\n")).strip()
                for fecha_iso, raw_cell in zip(date_cols_iso, row[2:]):
                    if fecha_iso is None:
                        continue  # ya se reportó en fecha_problems; no se puede crear una obligación sin fecha cierta
                    records.append({"ps": ps, "nombre_pdf": nombre, "fecha": fecha_iso, "raw_cell": raw_cell or ""})
    return records, location, fecha_problems


def check_integrity(raw_records: list[dict], date_cols: list[str]) -> list[str]:
    problems = []
    seen = set()
    per_employee: dict[str, set] = {}
    for r in raw_records:
        key = (r["ps"], r["fecha"])
        if key in seen:
            problems.append(f"duplicado: PS={r['ps']} fecha={r['fecha']}")
        seen.add(key)
        per_employee.setdefault(r["ps"], set()).add(r["fecha"])
        if date_cols and r["fecha"] not in date_cols:
            problems.append(f"fecha fuera de cabecera: PS={r['ps']} fecha={r['fecha']}")
    for ps, fechas in per_employee.items():
        if date_cols and len(fechas) > len(date_cols):
            problems.append(f"PS={ps} tiene más fechas ({len(fechas)}) que columnas de cabecera ({len(date_cols)})")
    return problems


# --------------------------------------------------------------------------
# Clasificación de negocio por fila (sin conocer el estado de Supabase)
# --------------------------------------------------------------------------
#
# Este script ya NO decide "crear / omitir / conflicto" (ver docstring del
# módulo). Solo deja cada fila lista con el dato mínimo para que
# `importacionHorario.ts` resuelva la acción contra CinemaQ en vivo:
#   - "revisar": estado desconocido o celda con formato de hora irreconocible.
#   - "ignorar_area": área reconocida pero fuera de alcance (taquilla, etc.).
#   - "sin_cuota_omitir": trabaja pero entra antes del corte de las 11:00.
#   - "candidato_cuota": comandero/corredor que entra a partir de las 11:00
#     — es la fila que, si no existe ya en CinemaQ, generará horario+asistencia.
#   - "ignorar": sin turno o estado no laborable conocido (descanso, etc.).

def build_contract_record(raw: dict, alias_lookup: dict) -> dict:
    cell = classify_cell(raw["raw_cell"])
    estado, hora_inicio, hora_fin, area_pdf = cell["estado"], cell["hora_inicio"], cell["hora_fin"], cell["area_pdf"]

    motivos: list[str] = []
    confidence = 1.0
    genera_cuota = False
    area_cinema = None
    clasificacion = "ignorar"

    if estado == "FORMATO_INVALIDO":
        motivos.append("celda con patrón de hora irreconocible: revisar manualmente")
        clasificacion, confidence = "revisar", 0.3
    elif estado == "SIN_TURNO":
        motivos.append("sin turno registrado ese día")
        clasificacion = "ignorar"
    elif estado != "TRABAJA":
        if estado.upper() not in KNOWN_NON_WORK_STATUSES:
            motivos.append(f"estado '{estado}' no está en el catálogo conocido: revisar")
            clasificacion, confidence = "revisar", 0.5
        else:
            motivos.append(f"estado no laborable conocido: {estado}")
            clasificacion = "ignorar"
    else:
        area_cinema, categoria = map_area(area_pdf, alias_lookup)
        if categoria == "desconocida":
            motivos.append("área del PDF no está en el alias (comanderos/corredores/otra_reconocida): agregar alias o revisar")
            clasificacion, confidence = "revisar", 0.4
        elif categoria == "otra_reconocida":
            motivos.append("área reconocida pero fuera de alcance (no es comanderos/corredores)")
            clasificacion = "ignorar_area"
        else:
            try:
                genera_cuota = genera_cuota_por_corte(hora_inicio)
            except ValueError as e:
                motivos.append(f"hora_inicio inválida: {e}")
                clasificacion, confidence, genera_cuota = "revisar", 0.3, False
            else:
                if genera_cuota:
                    motivos.append(f"área={area_cinema}, hora_inicio >= 11:00: candidato a horario+asistencia")
                    clasificacion = "candidato_cuota"
                else:
                    motivos.append("hora_inicio < 11:00 (America/Mexico_City): sin_cuota, no entra al esperado (regla 6)")
                    clasificacion = "sin_cuota_omitir"

    return {
        "ps": raw["ps"], "nombre_pdf": raw["nombre_pdf"], "fecha": raw["fecha"],
        "hora_inicio": hora_inicio, "hora_fin": hora_fin,
        "area_pdf": area_pdf, "area_cinema": area_cinema, "estado": estado,
        "genera_cuota": genera_cuota, "clasificacion": clasificacion,
        "motivos": motivos, "confidence": confidence, "raw_cell": raw["raw_cell"],
    }


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="PDF horario semanal -> contrato JSON crudo para Importar horario en CinemaQ")
    ap.add_argument("pdf_path")
    ap.add_argument("--alias", default=None, help="area_aliases.json (usa default embebido si se omite)")
    ap.add_argument("--out", default="contrato_horario.json")
    ap.add_argument("--raw-csv", default=None, help="opcional: también volcar crudo a CSV de auditoría")
    ap.add_argument(
        "--anio-default", type=int, default=None,
        help="Año a usar cuando el encabezado de fecha del PDF no lo incluye (ej. '01/09'). "
             "Si el PDF ya trae año en el encabezado, se ignora.",
    )
    args = ap.parse_args()

    alias_lookup = load_alias_lookup(args.alias)
    raw_records, location, fecha_problems = extract_raw_records(args.pdf_path, args.anio_default)
    date_cols = sorted({r["fecha"] for r in raw_records})

    problems = fecha_problems + check_integrity(raw_records, date_cols)
    if problems:
        print("Problemas de integridad/fecha detectados:", file=sys.stderr)
        for p in problems:
            print(" -", p, file=sys.stderr)
        if fecha_problems:
            print(
                "Sugerencia: si el PDF no trae año en el encabezado, vuelve a correr con --anio-default 2026.",
                file=sys.stderr,
            )

    contrato = [build_contract_record(r, alias_lookup) for r in raw_records]
    Path(args.out).write_text(json.dumps(contrato, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.raw_csv:
        with open(args.raw_csv, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=["ps", "nombre_pdf", "fecha", "raw_cell"])
            w.writeheader()
            w.writerows(raw_records)

    resumen = Counter(c["clasificacion"] for c in contrato)
    print(f"Ubicación: {location}")
    print(f"Registros (persona-día): {len(contrato)}")
    print("Resumen por clasificación:", dict(resumen))
    print(f"Contrato JSON escrito en: {args.out}")
    print(
        "Recordatorio: este JSON es 'crudo'. La decisión de crear/omitir/conflicto se hace "
        "en la pantalla 'Importar horario' del panel, contra el estado real de Supabase."
    )


if __name__ == "__main__":
    main()
