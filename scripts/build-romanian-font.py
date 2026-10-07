"""Build the local Romanian glyph supplement from the original Press Start 2P TTF.

Requires fontTools. Usage: python scripts/build-romanian-font.py original-font.ttf
The application serves the generated TTF directly; Python is not a build dependency.
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


font = TTFont(sys.argv[1])
cmap = font.getBestCmap()
original_order = list(font.getGlyphOrder())
added = []
for code, base_code, name in [(0x0218, 0x53, "Scommaaccent"), (0x0219, 0x73, "scommaaccent")]:
    base = cmap[base_code]
    comma = cmap[0x0326]
    advance, bearing = font["hmtx"][base]
    pen = TTGlyphPen(font.getGlyphSet())
    pen.addComponent(base, (1, 0, 0, 1, 0, 0))
    # The original combining comma is positioned relative to the previous advance.
    pen.addComponent(comma, (1, 0, 0, 1, advance, 0))
    font["glyf"][name] = pen.glyph()
    font["hmtx"].metrics[name] = (advance, bearing)
    added.append(name)
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[code] = name
font.setGlyphOrder(original_order + added)

# The original family name is reserved by the OFL, so rename the derivative.
names = {
    1: "Hopper Romanian Pixel",
    2: "Regular",
    3: "HopperRomanianPixel-Regular-1.0",
    4: "Hopper Romanian Pixel Regular",
    6: "HopperRomanianPixel-Regular",
    16: "Hopper Romanian Pixel",
    17: "Regular",
}
for record in font["name"].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())

options = subset.Options()
options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
options.name_legacy = True
options.name_languages = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=[0x0218, 0x0219])
subsetter.subset(font)
destination = Path("mobile/app/fonts/hopper-romanian-pixel.ttf")
destination.parent.mkdir(parents=True, exist_ok=True)
font.save(destination)
print(f"Romanian pixel glyphs written to {destination}")
