#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Terminal de Viralidad — Body PDF generator
Estilo: Bloomberg Terminal Dark (fondo #0A0E14, mono SarasaMonoSC, accent teal #2DD4BF)
"""

import os
import sys
import hashlib
import platform
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, CondPageBreak, HRFlowable, Preformatted, XPreformatted,
    Flowable, Image,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfgen import canvas

# ═══════════════════════════════════════════════════════════════════════════
# 1. FONT REGISTRATION
# ═══════════════════════════════════════════════════════════════════════════

FONT_DIR = '/usr/share/fonts'

# Mono — SarasaMonoSC (excellent terminal aesthetic, multiple weights)
pdfmetrics.registerFont(TTFont('Mono',         f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Mono-Light',   f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Light.ttf'))
pdfmetrics.registerFont(TTFont('Mono-SemiBold',f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-SemiBold.ttf'))
pdfmetrics.registerFont(TTFont('Mono-Bold',    f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Bold.ttf'))

# Serif — FreeSerif (English/Spanish body text, has full Latin coverage)
pdfmetrics.registerFont(TTFont('Body',         f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('Body-Bold',    f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('Body-Italic',  f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('Body-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))

# Sans — FreeSans (for UI labels, captions, sans-serif accent)
pdfmetrics.registerFont(TTFont('Sans',         f'{FONT_DIR}/truetype/freefont/FreeSans.ttf'))
pdfmetrics.registerFont(TTFont('Sans-Bold',    f'{FONT_DIR}/truetype/freefont/FreeSansBold.ttf'))
pdfmetrics.registerFont(TTFont('Sans-Italic',  f'{FONT_DIR}/truetype/freefont/FreeSansOblique.ttf'))

# Symbol/code — DejaVuSansMono (math symbols, fallback)
pdfmetrics.registerFont(TTFont('Sym',          f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('Sym-Bold',     f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono-Bold.ttf'))

registerFontFamily('Mono', normal='Mono', bold='Mono-Bold')
registerFontFamily('Body', normal='Body', bold='Body-Bold', italic='Body-Italic', boldItalic='Body-BoldItalic')
registerFontFamily('Sans', normal='Sans', bold='Sans-Bold', italic='Sans-Italic')
registerFontFamily('Sym',  normal='Sym',  bold='Sym-Bold')

# ═══════════════════════════════════════════════════════════════════════════
# 2. PALETTE — Bloomberg Terminal Dark
# ═══════════════════════════════════════════════════════════════════════════

# Backgrounds
BG_BASE      = colors.HexColor('#0A0E14')   # page root
BG_ELEVATED  = colors.HexColor('#0D1117')   # tables even row
BG_PANEL     = colors.HexColor('#11161D')   # tables odd row
BG_HOVER     = colors.HexColor('#161B22')   # callout bg
BG_ACTIVE    = colors.HexColor('#1C2128')   # table header
BG_INSET     = colors.HexColor('#070A0F')   # code block

# Borders
BORDER_SUBTLE = colors.HexColor('#1F2937')
BORDER_DEFAULT= colors.HexColor('#21262D')
BORDER_STRONG = colors.HexColor('#30363D')
BORDER_FOCUS  = colors.HexColor('#5EEAD4')

# Text
TEXT_PRIMARY  = colors.HexColor('#E6EDF3')
TEXT_SECONDARY= colors.HexColor('#94A3B8')
TEXT_TERTIARY = colors.HexColor('#7D8590')
TEXT_DISABLED = colors.HexColor('#484F58')

# Accents — 4 fases
ACC_FORMING   = colors.HexColor('#FBBF24')   # amber
ACC_RISING    = colors.HexColor('#2DD4BF')   # teal
ACC_PEAKED    = colors.HexColor('#94A3B8')   # slate
ACC_DECAY     = colors.HexColor('#F87171')   # rose
ACC_LIVE      = colors.HexColor('#00FF9F')   # neon green

# Functional
LINK_BLUE     = colors.HexColor('#58A6FF')
WARN_AMBER    = colors.HexColor('#F59E0B')
DANGER_RED    = colors.HexColor('#EF4444')

# ═══════════════════════════════════════════════════════════════════════════
# 3. PAGE GEOMETRY
# ═══════════════════════════════════════════════════════════════════════════

PAGE_W, PAGE_H = A4  # 595.28 x 841.89 pt
MARGIN_L = 50
MARGIN_R = 50
MARGIN_T = 60
MARGIN_B = 50
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R   # ≈ 495pt
CONTENT_H = PAGE_H - MARGIN_T - MARGIN_B   # ≈ 731pt

# ═══════════════════════════════════════════════════════════════════════════
# 4. PARAGRAPH STYLES
# ═══════════════════════════════════════════════════════════════════════════

# H1 — Chapter title (mono, big, teal accent)
h1 = ParagraphStyle('H1', fontName='Mono-Bold', fontSize=22, leading=28,
    textColor=ACC_RISING, alignment=TA_LEFT, spaceBefore=8, spaceAfter=6,
    letterSpace=-0.5)

# H1 kicker (above the H1, small mono uppercase)
h1_kicker = ParagraphStyle('H1Kicker', fontName='Mono', fontSize=9, leading=12,
    textColor=TEXT_TERTIARY, alignment=TA_LEFT, spaceBefore=18, spaceAfter=2,
    letterSpace=2)

# H2 — Section title
h2 = ParagraphStyle('H2', fontName='Mono-Bold', fontSize=14, leading=18,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceBefore=18, spaceAfter=6,
    letterSpace=-0.2)

# H3 — Sub-section title
h3 = ParagraphStyle('H3', fontName='Mono-SemiBold', fontSize=11.5, leading=15,
    textColor=ACC_RISING, alignment=TA_LEFT, spaceBefore=12, spaceAfter=4,
    letterSpace=0)

# H4 — Inline mini-heading
h4 = ParagraphStyle('H4', fontName='Sans-Bold', fontSize=10, leading=13,
    textColor=TEXT_SECONDARY, alignment=TA_LEFT, spaceBefore=8, spaceAfter=2,
    letterSpace=1)

# Body — main paragraph (serif for readability)
body = ParagraphStyle('Body', fontName='Body', fontSize=10.5, leading=16,
    textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceBefore=0, spaceAfter=8,
    firstLineIndent=0)

# Body indent variant
body_indent = ParagraphStyle('BodyIndent', parent=body, leftIndent=14)

# Lead paragraph (after H1)
lead = ParagraphStyle('Lead', fontName='Body-Italic', fontSize=11.5, leading=17,
    textColor=TEXT_SECONDARY, alignment=TA_LEFT, spaceBefore=6, spaceAfter=12)

# Bullet
bullet = ParagraphStyle('Bullet', fontName='Body', fontSize=10.5, leading=15,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leftIndent=18, bulletIndent=4,
    spaceBefore=2, spaceAfter=2)

# Code block (Preformatted)
code = ParagraphStyle('Code', fontName='Mono', fontSize=8.5, leading=12,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leftIndent=0, rightIndent=0,
    spaceBefore=4, spaceAfter=4)

# Code inline (used inside Paragraph)
# Use <font name="Mono">...</font> inline

# Caption
caption = ParagraphStyle('Caption', fontName='Mono', fontSize=8.5, leading=11,
    textColor=TEXT_TERTIARY, alignment=TA_CENTER, spaceBefore=4, spaceAfter=12,
    letterSpace=0.5)

# Callout text
callout = ParagraphStyle('Callout', fontName='Body-Italic', fontSize=10.5, leading=15,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leftIndent=14, rightIndent=8,
    spaceBefore=4, spaceAfter=4)

# Table cell styles
th = ParagraphStyle('TH', fontName='Mono-SemiBold', fontSize=9, leading=12,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, letterSpace=0.3)
th_c = ParagraphStyle('THc', parent=th, alignment=TA_CENTER)
td = ParagraphStyle('TD', fontName='Body', fontSize=9, leading=12,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT)
td_c = ParagraphStyle('TDc', parent=td, alignment=TA_CENTER)
td_mono = ParagraphStyle('TDm', fontName='Mono', fontSize=8.5, leading=11,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT)

# TOC styles
toc_h1 = ParagraphStyle('TOCh1', fontName='Mono-Bold', fontSize=11, leading=20,
    textColor=TEXT_PRIMARY, leftIndent=0, rightIndent=20, spaceBefore=4)
toc_h2 = ParagraphStyle('TOCh2', fontName='Mono', fontSize=10, leading=16,
    textColor=TEXT_SECONDARY, leftIndent=20, rightIndent=20, spaceBefore=0)

# ═══════════════════════════════════════════════════════════════════════════
# 5. HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def add_heading(text, style, level=0):
    """Add a heading that registers itself in TOC."""
    key = 'h_' + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/>{text}', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def chapter_header(num, title, kicker_text=None):
    """Render a chapter heading with optional kicker line."""
    items = []
    if kicker_text:
        items.append(Paragraph(kicker_text.upper(), h1_kicker))
    items.append(add_heading(f'<font color="#5EEAD4">{num:02d}</font>   {title}', h1, level=0))
    # Accent rule below H1
    items.append(HRFlowable(width=CONTENT_W*0.18, thickness=1.2, color=ACC_RISING,
                            spaceBefore=2, spaceAfter=10))
    return items

def section_header(text):
    """H2 section header."""
    return add_heading(text, h2, level=1)

def subsection_header(text):
    """H3 sub-section header."""
    return add_heading(text, h3, level=2)

def body_p(text):
    return Paragraph(text, body)

def lead_p(text):
    return Paragraph(text, lead)

def bullet_p(text):
    return Paragraph(f'<font color="#2DD4BF">▸</font>   {text}', bullet)

def code_block(text, lang=None):
    """Code block with dark inset background. Uses XPreformatted to wrap long lines."""
    # Escape HTML-sensitive chars
    safe = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    # Use newlines directly — XPreformatted handles them
    pre = XPreformatted(safe, code)
    # Wrap in Table for background
    t = Table([[pre]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_INSET),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LINEBEFORE', (0,0), (0,-1), 2, ACC_RISING),
    ]))
    items = [Spacer(1, 4), t, Spacer(1, 6)]
    if lang:
        items.insert(0, Paragraph(f'<font color="#7D8590">{lang.upper()}</font>', caption))
    return items

def callout_box(title, body_text, color=ACC_RISING):
    """Callout box with accent left border."""
    inner = [
        Paragraph(f'<font color="{color.hexval()}" name="Mono-Bold">{title}</font>', callout),
        Paragraph(body_text, callout),
    ]
    t = Table([[inner]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_HOVER),
        ('LEFTPADDING', (0,0), (-1,-1), 14),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LINEBEFORE', (0,0), (0,-1), 3, color),
    ]))
    return [Spacer(1, 6), t, Spacer(1, 8)]

def make_table(headers, rows, col_widths=None, header_color=BG_ACTIVE, mono_cols=None):
    """Build a styled dark table. mono_cols = list of col indices that should use mono font."""
    if col_widths is None:
        n = len(headers)
        col_widths = [CONTENT_W / n] * n
    mono_cols = mono_cols or []
    # Build header row
    header_row = [Paragraph(f'<b>{h}</b>', th_c if i > 0 else th) for i, h in enumerate(headers)]
    data = [header_row]
    for row in rows:
        row_cells = []
        for i, cell in enumerate(row):
            style = td_mono if i in mono_cols else td
            row_cells.append(Paragraph(str(cell), style))
        data.append(row_cells)
    t = Table(data, colWidths=col_widths, hAlign='CENTER', repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0,0), (-1,0), header_color),
        ('TEXTCOLOR',  (0,0), (-1,0), TEXT_PRIMARY),
        ('VALIGN',     (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING',(0,0), (-1,-1), 6),
        ('RIGHTPADDING',(0,0),(-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0),(-1,-1), 5),
        ('LINEBELOW',  (0,0), (-1,0), 0.8, BORDER_STRONG),
        ('LINEBELOW',  (0,-1),(-1,-1), 0.5, BORDER_SUBTLE),
        ('GRID',       (0,1), (-1,-1), 0.25, BORDER_SUBTLE),
    ]
    # Alternating row backgrounds
    for i in range(1, len(data)):
        bg = BG_ELEVATED if i % 2 == 1 else BG_PANEL
        style_cmds.append(('BACKGROUND', (0,i), (-1,i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

def ascii_diagram(text, caption_text=None):
    """ASCII art diagram in a code-block style with caption."""
    items = code_block(text)
    if caption_text:
        items.append(Paragraph(caption_text, caption))
    return items

def safe_keep_together(elements, max_height=CONTENT_H * 0.4):
    """Wrap elements in KeepTogether only if they fit."""
    total = 0
    for el in elements:
        try:
            w, h = el.wrap(CONTENT_W, CONTENT_H)
            total += h
        except Exception:
            return list(elements)
    if total <= max_height:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)

# ═══════════════════════════════════════════════════════════════════════════
# 6. PAGE TEMPLATE — Dark Background + Header/Footer
# ═══════════════════════════════════════════════════════════════════════════

def draw_page_chrome(canvas_obj, doc):
    """Paint dark background + header/footer on every page."""
    c = canvas_obj
    c.saveState()
    # Full-bleed dark background
    c.setFillColor(BG_BASE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # Top accent strip (very subtle)
    c.setFillColor(ACC_RISING)
    c.rect(0, PAGE_H - 3, PAGE_W, 3, fill=1, stroke=0)
    # Header — doc title (left), version (right)
    c.setFont('Mono', 8)
    c.setFillColor(TEXT_TERTIARY)
    c.drawString(MARGIN_L, PAGE_H - 22, 'TERMINAL DE VIRALIDAD · v1.0')
    c.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 22, 'INTELLIGENCE TERMINAL')
    # Header rule
    c.setStrokeColor(BORDER_DEFAULT)
    c.setLineWidth(0.3)
    c.line(MARGIN_L, PAGE_H - 30, PAGE_W - MARGIN_R, PAGE_H - 30)
    # Footer rule
    c.line(MARGIN_L, MARGIN_B - 8, PAGE_W - MARGIN_R, MARGIN_B - 8)
    # Footer — page number, prompt-style
    c.setFont('Mono', 8)
    c.setFillColor(TEXT_TERTIARY)
    c.drawString(MARGIN_L, MARGIN_B - 20, '$ terminal --page')
    page_num = c.getPageNumber()
    c.setFillColor(ACC_RISING)
    c.setFont('Mono-Bold', 9)
    c.drawRightString(PAGE_W - MARGIN_R, MARGIN_B - 20, f'[{page_num:03d}]')
    c.restoreState()

# ═══════════════════════════════════════════════════════════════════════════
# 7. TOC DOC TEMPLATE
# ═══════════════════════════════════════════════════════════════════════════

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text  = getattr(flowable, 'bookmark_text', '')
            key   = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

print("[setup] Fuentes y estilos listos.", file=sys.stderr)
