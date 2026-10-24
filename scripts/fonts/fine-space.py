"""The narrow no-break space (U+202F) that French typography puts in "1 334 km" and before ? ! : ;

Archivo and Literata don't have it, so each browser used to borrow it from whatever font the
device had: a clear gap on one phone, almost nothing on another ("1334"). This tiny font holds that
one character, 0.15 em wide, and comes first in the site's font stacks (app.css) with
`unicode-range: U+202F`, so every other character still comes from Archivo or Literata.

    pip install fonttools brotli
    python3 scripts/fonts/fine-space.py   # writes web/src/fonts/fine-space.woff2
"""

from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1000
WIDTH = 150  # 0.15 em: between Literata's thin space (0.125 em) and a word space (0.2 em)
OUT = Path(__file__).resolve().parents[2] / "web" / "src" / "fonts" / "fine-space.woff2"

empty = TTGlyphPen(None).glyph()
# .notdef is never shown (only U+202F is mapped), but it needs an outline: browsers reject a font
# whose glyf table is empty ("OTS parsing error: glyf: zero-length table").
box = TTGlyphPen(None)
box.moveTo((20, 0))
box.lineTo((20, 700))
box.lineTo((130, 700))
box.lineTo((130, 0))
box.closePath()
fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder([".notdef", "uni202F"])
fb.setupCharacterMap({0x202F: "uni202F"})
fb.setupGlyf({".notdef": box.glyph(), "uni202F": empty})
fb.setupHorizontalMetrics({".notdef": (WIDTH, 0), "uni202F": (WIDTH, 0)})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({"familyName": "Te Araroa Fine", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
fb.setupPost()
fb.font.flavor = "woff2"
OUT.parent.mkdir(parents=True, exist_ok=True)
fb.save(str(OUT))
print(OUT, OUT.stat().st_size, "bytes")
