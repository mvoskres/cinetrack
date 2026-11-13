"""Draws the app icons (icons/*.png) from the same film-frame mark as the favicon in index.html.
Plain on purpose: dark tile, amber mark. To use another picture, replace the PNGs (same names and sizes) and skip this script.
Run:  py tools/make_icons.py"""
import os
from PIL import Image, ImageDraw
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG, FG = (15, 18, 22), (232, 163, 61)   # --ink, the favicon's amber
K = 8                                    # supersampling

def draw(size, scale, rounded):
    """mark occupies `scale` of the tile (1 = favicon proportions); rounded corners for the 'any' icon, full bleed for maskable"""
    S = size * K
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 5 // 24, fill=BG)
    else:
        d.rectangle([0, 0, S, S], fill=BG)
    u = S / 24 * scale                   # one viewBox unit
    o = (S - 24 * u) / 2                 # centre the 24-unit box
    P = lambda v: o + v * u
    d.rounded_rectangle([P(5), P(5), P(19), P(19)], radius=1.5 * u, outline=FG, width=round(1.8 * u))
    w = round(1.4 * u)
    for x in (9, 15):
        d.line([P(x), P(5), P(x), P(19)], fill=FG, width=w)
    for y in (10, 14):
        d.line([P(5), P(y), P(9), P(y)], fill=FG, width=w)
        d.line([P(15), P(y), P(19), P(y)], fill=FG, width=w)
    return im.resize((size, size), Image.LANCZOS)

out = os.path.join(root, 'icons')
os.makedirs(out, exist_ok=True)
draw(192, 1.0, True).save(os.path.join(out, 'icon-192.png'))
draw(512, 1.0, True).save(os.path.join(out, 'icon-512.png'))
draw(512, 0.78, False).save(os.path.join(out, 'icon-maskable-512.png'))   # mark inside the 80% safe zone
draw(180, 1.0, False).save(os.path.join(out, 'apple-touch-icon.png'))     # iOS rounds the corners itself
print('icons written to', out)
