#!/usr/bin/env python3
"""Genera HTML y PDF del manual desde Manual-Usuario-Cuotas-Propinas.md"""

from __future__ import annotations

import base64
import mimetypes
import re
import sys
from pathlib import Path

try:
    import markdown
except ImportError:
    print("Instala markdown: pip install markdown")
    sys.exit(1)

try:
    from xhtml2pdf import pisa
except ImportError:
    print("Instala xhtml2pdf: pip install xhtml2pdf")
    sys.exit(1)

DOCS = Path(__file__).parent
MD_FILE = DOCS / "Manual-Usuario-Cuotas-Propinas.md"
HTML_FILE = DOCS / "Manual-Usuario-Cuotas-Propinas.html"
PDF_FILE = DOCS / "Manual-Usuario-Cuotas-Propinas.pdf"

CSS = """
@page { margin: 20mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", Calibri, Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.5;
  color: #1a1a1a;
}
h1 { font-size: 22pt; color: #0f3d6e; margin-bottom: 0.2em; page-break-after: avoid; }
h2 { font-size: 14pt; color: #0f3d6e; border-bottom: 2px solid #dbeafe; padding-bottom: 0.2em;
     margin-top: 1.4em; page-break-after: avoid; }
h3 { font-size: 12pt; color: #1e40af; margin-top: 1.1em; page-break-after: avoid; }
h4 { font-size: 11pt; margin-top: 0.9em; page-break-after: avoid; }
.portada { text-align: center; padding: 100px 20px 60px; page-break-after: always; }
.portada .sub { font-size: 13pt; color: #475569; }
.portada .meta { margin-top: 2em; font-size: 10pt; color: #64748b; }
.portada .url { font-size: 11pt; color: #0f3d6e; font-weight: 600; margin-top: 0.8em; }
table { width: 100%; border-collapse: collapse; margin: 0.6em 0 1em; font-size: 9.5pt; page-break-inside: avoid; }
th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #eff6ff; color: #1e3a5f; font-weight: 600; }
tr:nth-child(even) td { background: #f8fafc; }
pre, code { font-family: Consolas, "Courier New", monospace; }
pre {
  background: #f1f5f9;
  border-left: 4px solid #3b82f6;
  padding: 10px 12px;
  font-size: 8.5pt;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  page-break-inside: avoid;
}
blockquote {
  margin: 0.8em 0;
  padding: 8px 12px;
  background: #fffbeb;
  border-left: 4px solid #f59e0b;
  color: #78350f;
  font-size: 10pt;
  page-break-inside: avoid;
}
ul, ol { margin: 0.3em 0 0.8em; padding-left: 1.3em; }
li { margin-bottom: 0.25em; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
.pie { margin-top: 2em; text-align: center; font-size: 9pt; color: #64748b;
       border-top: 1px solid #e2e8f0; padding-top: 0.8em; }
strong { color: #0f172a; }
a { color: #1d4ed8; text-decoration: none; }
figure.imagen-manual {
  margin: 1em 0 1.4em;
  page-break-inside: avoid;
  text-align: center;
}
figure.imagen-manual img {
  max-width: 100%;
  height: auto;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
figure.imagen-manual figcaption {
  font-size: 9pt;
  color: #64748b;
  margin-top: 0.4em;
  font-style: italic;
}
h4.grupo-menu {
  margin-top: 1em;
  margin-bottom: 0.3em;
  color: #1e40af;
  background: #eff6ff;
  padding: 6px 10px;
  border-radius: 4px;
  page-break-after: avoid;
}
table { table-layout: fixed; }
td, th {
  min-height: 1.4em;
  line-height: 1.45;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
td:empty::before { content: "\\00a0"; }
"""


def preprocess_md(text: str) -> str:
    # Quitar frontmatter YAML
    text = re.sub(r"^---\n.*?\n---\n", "", text, count=1, flags=re.DOTALL)
    # Portada HTML → sección portada
    text = re.sub(
        r'<div style="[^"]*">\s*\n# Manual de Usuario\s*\n## Sistema.*?</div>',
        "",
        text,
        count=1,
        flags=re.DOTALL,
    )
    portada = """
<section class="portada">
  <h1>Manual de Usuario</h1>
  <p class="sub">Sistema de Seguimiento de Cuotas de Propinas</p>
  <p class="meta"><strong>Versión 1.2</strong> · Julio 2026</p>
  <p class="url">https://orusuko.github.io/CinemaQ/</p>
  <p class="meta">Guía para empleados y administradores de área (Comanderos y Corredores).</p>
</section>
"""
    return portada + text


def _imagen_a_data_uri(ruta: Path) -> str:
    mime, _ = mimetypes.guess_type(str(ruta))
    if not mime:
        mime = "image/png"
    datos = base64.b64encode(ruta.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{datos}"


def _embedir_imagenes_para_pdf(html: str) -> str:
    """Sustituye rutas relativas por data URI para xhtml2pdf."""

    def reemplazar_src(m: re.Match[str]) -> str:
        ruta = m.group(1)
        if ruta.startswith(("http", "data:")):
            return m.group(0)
        archivo = (DOCS / ruta).resolve()
        if not archivo.is_file():
            return m.group(0)
        return f'src="{_imagen_a_data_uri(archivo)}"'

    return re.sub(r'src="(imagenes/[^"]+)"', reemplazar_src, html)


def _arreglar_html(body: str) -> str:
    # Celdas vacías: evitan solapamiento en xhtml2pdf
    body = re.sub(r"<td>\s*</td>", "<td>&nbsp;</td>", body)

    # Imágenes → figure con pie (ruta relativa; el PDF las embebe después)
    def reemplazar_img(m: re.Match[str]) -> str:
        alt = m.group(1)
        ruta = m.group(2)
        return (
            f'<figure class="imagen-manual">'
            f'<img src="{ruta}" alt="{alt}" />'
            f'<figcaption>{alt}</figcaption>'
            f"</figure>"
        )

    body = re.sub(
        r'<p><img alt="([^"]*)" src="([^"]+)" /></p>',
        reemplazar_img,
        body,
    )
    return body


def md_to_html(md: str) -> str:
    body = markdown.markdown(
        md,
        extensions=["tables", "fenced_code", "nl2br", "sane_lists"],
    )
    body = _arreglar_html(body)
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Manual de Usuario — Cuotas de Propinas v1.2</title>
  <style>{CSS}</style>
</head>
<body>
{body}
</body>
</html>"""


def html_to_pdf(html: str, dest: Path) -> None:
    with open(dest, "wb") as out:
        status = pisa.CreatePDF(html, dest=out, encoding="utf-8")
    if status.err:
        raise RuntimeError(f"Error generando PDF ({status.err} errores)")


def main() -> None:
    md_raw = MD_FILE.read_text(encoding="utf-8")
    md_clean = preprocess_md(md_raw)
    html = md_to_html(md_clean)
    HTML_FILE.write_text(html, encoding="utf-8")
    print(f"HTML: {HTML_FILE}")
    html_to_pdf(_embedir_imagenes_para_pdf(html), PDF_FILE)
    print(f"PDF:  {PDF_FILE}")


if __name__ == "__main__":
    main()
