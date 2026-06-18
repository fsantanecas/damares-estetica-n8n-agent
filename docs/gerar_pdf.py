"""Gera PDF da documentação a partir do Markdown usando reportlab."""
import re, markdown
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Preformatted, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

INPUT  = r"g:\Meu Drive\IT\Projetos\DamaresEstetica\docs\Documentacao_Agente_DamaresEstetica.md"
OUTPUT = r"g:\Meu Drive\IT\Projetos\DamaresEstetica\docs\Documentacao_Agente_DamaresEstetica.pdf"

# ── Cores ──────────────────────────────────────────────────────────────────
BRAND   = colors.HexColor("#2D6A4F")   # verde escuro (Damares)
ACCENT  = colors.HexColor("#52B788")   # verde médio
LIGHT   = colors.HexColor("#F0FAF4")   # fundo tabela cabeçalho
GRAY    = colors.HexColor("#6B7280")
CODEBG  = colors.HexColor("#F3F4F6")
CODEBRD = colors.HexColor("#D1D5DB")

# ── Estilos ────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def S(name, **kw):
    return ParagraphStyle(name, **kw)

sH1   = S("H1",   fontName="Helvetica-Bold",   fontSize=20, textColor=BRAND,
           spaceAfter=8, spaceBefore=20, leading=26)
sH2   = S("H2",   fontName="Helvetica-Bold",   fontSize=15, textColor=BRAND,
           spaceAfter=6, spaceBefore=16, leading=20,
           borderPad=4, borderColor=ACCENT, borderWidth=0)
sH3   = S("H3",   fontName="Helvetica-Bold",   fontSize=12, textColor=BRAND,
           spaceAfter=4, spaceBefore=12, leading=16)
sH4   = S("H4",   fontName="Helvetica-Bold",   fontSize=11, textColor=ACCENT,
           spaceAfter=3, spaceBefore=8,  leading=14)
sBODY = S("BODY", fontName="Helvetica",        fontSize=9,  leading=14,
           spaceAfter=4, textColor=colors.black)
sBULL = S("BULL", fontName="Helvetica",        fontSize=9,  leading=13,
           leftIndent=16, spaceAfter=2, textColor=colors.black,
           bulletIndent=6)
sCODE = S("CODE", fontName="Courier",          fontSize=8,  leading=12,
           backColor=CODEBG, borderColor=CODEBRD, borderWidth=1,
           borderPad=6, leftIndent=8, spaceAfter=6, spaceBefore=4,
           textColor=colors.HexColor("#1F2937"))
sTH   = S("TH",   fontName="Helvetica-Bold",   fontSize=8,  leading=11,
           textColor=colors.white)
sTD   = S("TD",   fontName="Helvetica",        fontSize=8,  leading=11)
sMETA = S("META", fontName="Helvetica-Oblique",fontSize=8,  textColor=GRAY,
           alignment=TA_CENTER, spaceAfter=6)

def escape_para(t):
    return (t.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
             .replace("**","<b>",1).replace("**","</b>",1) if False else
            re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>",
            re.sub(r"`(.+?)`",      r"<font name='Courier'>\1</font>",
            t.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;"))))

def build_story(md_path):
    with open(md_path, encoding="utf-8") as f:
        lines = f.readlines()

    story = []
    i = 0
    n = len(lines)

    def flush_para(buf):
        txt = " ".join(b.strip() for b in buf if b.strip())
        if txt:
            story.append(Paragraph(escape_para(txt), sBODY))

    para_buf = []

    while i < n:
        raw = lines[i].rstrip("\n")
        stripped = raw.strip()

        # ── H1 ──
        if stripped.startswith("# ") and not stripped.startswith("## "):
            flush_para(para_buf); para_buf = []
            story.append(Paragraph(escape_para(stripped[2:]), sH1))
            story.append(HRFlowable(width="100%", thickness=2, color=BRAND,
                                    spaceAfter=4))
            i += 1; continue

        # ── H2 ──
        if stripped.startswith("## "):
            flush_para(para_buf); para_buf = []
            story.append(Spacer(1, 6))
            story.append(Paragraph(escape_para(stripped[3:]), sH2))
            story.append(HRFlowable(width="100%", thickness=0.5,
                                    color=ACCENT, spaceAfter=3))
            i += 1; continue

        # ── H3 ──
        if stripped.startswith("### "):
            flush_para(para_buf); para_buf = []
            story.append(Paragraph(escape_para(stripped[4:]), sH3))
            i += 1; continue

        # ── H4 ──
        if stripped.startswith("#### "):
            flush_para(para_buf); para_buf = []
            story.append(Paragraph(escape_para(stripped[5:]), sH4))
            i += 1; continue

        # ── Separador ---
        if re.match(r"^-{3,}$", stripped):
            flush_para(para_buf); para_buf = []
            story.append(HRFlowable(width="100%", thickness=0.5,
                                    color=GRAY, spaceAfter=4, spaceBefore=4))
            i += 1; continue

        # ── Bloco de código ```
        if stripped.startswith("```"):
            flush_para(para_buf); para_buf = []
            i += 1
            code_lines = []
            while i < n and not lines[i].rstrip("\n").strip().startswith("```"):
                code_lines.append(lines[i].rstrip("\n"))
                i += 1
            i += 1  # pula o fechamento ```
            code_text = "\n".join(code_lines)
            story.append(Preformatted(code_text, sCODE))
            continue

        # ── Tabela Markdown |
        if stripped.startswith("|"):
            flush_para(para_buf); para_buf = []
            tbl_lines = []
            while i < n and lines[i].strip().startswith("|"):
                tbl_lines.append(lines[i].rstrip("\n"))
                i += 1
            # remove linha separadora |---|
            rows_raw = [l for l in tbl_lines
                        if not re.match(r"^\s*\|[-:| ]+\|\s*$", l)]
            data = []
            for row in rows_raw:
                cells = [c.strip() for c in row.split("|") if c.strip() != ""]
                data.append(cells)
            if data:
                is_header = True
                tdata = []
                for ri, row in enumerate(data):
                    style_cell = sTH if ri == 0 else sTD
                    tdata.append([Paragraph(escape_para(c), style_cell)
                                  for c in row])
                ncols = max(len(r) for r in tdata)
                col_w = (A4[0] - 3*cm) / ncols
                t = Table(tdata, colWidths=[col_w]*ncols, repeatRows=1)
                t.setStyle(TableStyle([
                    ("BACKGROUND",  (0,0), (-1,0),  BRAND),
                    ("TEXTCOLOR",   (0,0), (-1,0),  colors.white),
                    ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, LIGHT]),
                    ("GRID",        (0,0), (-1,-1), 0.4, colors.HexColor("#D1D5DB")),
                    ("TOPPADDING",  (0,0), (-1,-1), 4),
                    ("BOTTOMPADDING",(0,0),(-1,-1), 4),
                    ("LEFTPADDING", (0,0), (-1,-1), 6),
                    ("RIGHTPADDING",(0,0), (-1,-1), 6),
                    ("VALIGN",      (0,0), (-1,-1), "TOP"),
                ]))
                story.append(t)
                story.append(Spacer(1, 6))
            continue

        # ── Bullet - / *
        if re.match(r"^[-*]\s", stripped):
            flush_para(para_buf); para_buf = []
            text = re.sub(r"^[-*]\s+", "", stripped)
            story.append(Paragraph("• " + escape_para(text), sBULL))
            i += 1; continue

        # ── Blockquote >
        if stripped.startswith("> "):
            flush_para(para_buf); para_buf = []
            text = stripped[2:]
            bq = S("BQ", fontName="Helvetica-Oblique", fontSize=9,
                   leftIndent=20, borderPad=6,
                   borderColor=ACCENT, borderWidth=2, leading=13,
                   textColor=GRAY)
            story.append(Paragraph(escape_para(text), bq))
            i += 1; continue

        # ── Linha vazia
        if not stripped:
            flush_para(para_buf); para_buf = []
            story.append(Spacer(1, 3))
            i += 1; continue

        # ── Parágrafo normal
        para_buf.append(stripped)
        i += 1

    flush_para(para_buf)
    return story

# ── Gera PDF ───────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=2.2*cm, bottomMargin=2*cm,
    title="Documentação — Agente IA Damares Estética",
    author="Claude Code / Anthropic"
)

def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    # Header
    canvas.setFillColor(BRAND)
    canvas.rect(0, h - 1.4*cm, w, 1.4*cm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(2*cm, h - 0.9*cm, "Damares Estética Home Care — Agente IA WhatsApp")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(w - 2*cm, h - 0.9*cm, "Documentação Técnica & Funcional")
    # Footer
    canvas.setFillColor(ACCENT)
    canvas.rect(0, 0, w, 0.9*cm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(2*cm, 0.3*cm, "Confidencial — Uso interno")
    canvas.drawRightString(w - 2*cm, 0.3*cm, f"Página {doc.page}")
    canvas.restoreState()

story = build_story(INPUT)
doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print(f"PDF gerado: {OUTPUT}")
