#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_pdf.py — Orquestador principal
Genera el body PDF (ReportLab + dark theme + TOC), merge con cover.pdf,
output final en /home/z/my-project/download/terminal_de_viralidad.pdf
"""

import os
import sys
import subprocess

# Add scripts dir to path
sys.path.insert(0, '/home/z/my-project/scripts')

from generate_body_part1 import (
    TocDocTemplate, draw_page_chrome,
    PAGE_W, PAGE_H, MARGIN_L, MARGIN_R, MARGIN_T, MARGIN_B,
    A4,
)
from generate_body_part2 import build_story
from generate_body_part3 import build_chapters_3_to_7
from generate_body_part4 import build_chapters_8_to_11

# ─────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────

SCRIPTS_DIR  = '/home/z/my-project/scripts'
DOWNLOAD_DIR = '/home/z/my-project/download'
COVER_HTML   = os.path.join(SCRIPTS_DIR, 'cover.html')
COVER_PDF    = os.path.join(SCRIPTS_DIR, 'cover.pdf')
BODY_PDF     = os.path.join(SCRIPTS_DIR, 'body.pdf')
FINAL_PDF    = os.path.join(DOWNLOAD_DIR, 'Terminal_de_Viralidad_v1.0.pdf')

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────
# STEP 1: Render cover (already done — verify exists)
# ─────────────────────────────────────────────────────────────────────────

if not os.path.exists(COVER_PDF):
    print('[1/4] Cover PDF not found, rendering from HTML...')
    subprocess.run([
        'node', '/home/z/my-project/skills/pdf/scripts/html2poster.js',
        COVER_HTML, '--output', COVER_PDF, '--width', '794px'
    ], check=True)
else:
    print(f'[1/4] Cover PDF exists: {COVER_PDF}')

# ─────────────────────────────────────────────────────────────────────────
# STEP 2: Build body PDF
# ─────────────────────────────────────────────────────────────────────────

print('[2/4] Building body PDF...')

doc = TocDocTemplate(
    BODY_PDF,
    pagesize=A4,
    leftMargin=MARGIN_L,
    rightMargin=MARGIN_R,
    topMargin=MARGIN_T,
    bottomMargin=MARGIN_B,
    title='Terminal de Viralidad — Documento de Arquitectura',
    author='Z.ai Intelligence',
    creator='Z.ai',
    subject='Arquitectura, algoritmo y estrategia para detección anticipatoria de tendencias',
)

# Combine stories: chapters 1-2 (from part2) + chapters 3-7 (part3) + chapters 8-11 (part4)
story = build_story()
story.extend(build_chapters_3_to_7())
story.extend(build_chapters_8_to_11())

print(f'   Story flowables: {len(story)}')

# multiBuild for TOC (TOC needs 2 passes)
doc.multiBuild(
    story,
    onFirstPage=draw_page_chrome,
    onLaterPages=draw_page_chrome,
)

print(f'   Body PDF generated: {BODY_PDF}')

# ─────────────────────────────────────────────────────────────────────────
# STEP 3: Merge cover + body
# ─────────────────────────────────────────────────────────────────────────

print('[3/4] Merging cover + body...')

from pypdf import PdfReader, PdfWriter

A4_W_PT, A4_H_PT = 595.28, 841.89

def normalize_to_a4(page):
    """Scale page to exact A4 dimensions (595.28 x 841.89 pt)."""
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    # Always normalize if not exact A4 (within 0.1pt tolerance)
    if abs(w - A4_W_PT) > 0.1 or abs(h - A4_H_PT) > 0.1:
        page.scale_to(A4_W_PT, A4_H_PT)
    return page

writer = PdfWriter()
# Cover as page 1
cover_page = PdfReader(COVER_PDF).pages[0]
writer.add_page(normalize_to_a4(cover_page))
# Body pages
body_reader = PdfReader(BODY_PDF)
for page in body_reader.pages:
    writer.add_page(normalize_to_a4(page))

# Metadata
writer.add_metadata({
    '/Title': 'Terminal de Viralidad — Documento de Arquitectura',
    '/Author': 'Z.ai Intelligence',
    '/Creator': 'Z.ai',
    '/Subject': 'Arquitectura, algoritmo y estrategia para detección anticipatoria de tendencias',
    '/Keywords': 'viralidad, terminal, twitter, gdelt, reddit, scraping, scoring, HMM, anti-gaming, reactbytes',
})

with open(FINAL_PDF, 'wb') as f:
    writer.write(f)

print(f'[4/4] Final PDF: {FINAL_PDF}')

# Stats
final_size = os.path.getsize(FINAL_PDF) / 1024
total_pages = len(PdfReader(FINAL_PDF).pages)
print(f'   Pages: {total_pages}')
print(f'   Size:  {final_size:.1f} KB')
print()
print('✓ Done.')
