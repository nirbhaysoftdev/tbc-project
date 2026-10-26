#!/usr/bin/env python3
"""
Generate every PWA icon and iOS launch image from the one source logo.

Run it again whenever public/images/tbc-logo-1.png changes:

    python3 scripts/pwa-icons.py        # needs Pillow: pip install pillow

WHY THE ICONS ARE BAKED AND NOT DRAWN AT RUNTIME. A home-screen icon is read by
the operating system before any of our code runs, so it has to be a flat file of
an exact size. The same is true of the iOS launch image: iOS picks one by media
query at launch and shows a blank screen when nothing matches.

WHY THEY HAVE A BACKGROUND. The source logo is a transparent coin. Android masks
an icon into whatever shape the launcher uses and iOS puts it on a rounded
square with no transparency at all, so an icon shipped with an alpha channel
comes out as a coin floating on white (iOS) or clipped (Android). Every file
here is therefore opaque, on the portal's own navy, and the maskable pair keeps
the logo inside the 80% safe circle that a launcher is allowed to crop to.
"""
from PIL import Image, ImageDraw
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'images', 'tbc-logo-1.png')
OUT = os.path.join(ROOT, 'public', 'icons')

# The portal's own background (--bg-sidebar) with the accent blue (--accent-blue)
# glowing behind the logo, so the icon, the splash and the first painted screen
# are the same colour and the app does not flash.
NAVY = (11, 16, 34)
BLUE = (58, 111, 255)

os.makedirs(OUT, exist_ok=True)
logo = Image.open(SRC).convert('RGBA')


def plate(size, glow=0.55):
    """An opaque square of portal navy with a soft blue glow in the middle."""
    img = Image.new('RGBA', (size, size), NAVY + (255,))
    steps = 48
    overlay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for i in range(steps, 0, -1):
        r = size * 0.62 * (i / steps)
        a = int(44 * glow * (1 - i / steps) ** 1.6)
        d.ellipse(
            [size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r],
            fill=BLUE + (a,),
        )
    return Image.alpha_composite(img, overlay)


def compose(size, inset, glow=0.55):
    """The logo centred on a plate, scaled to `inset` of the square."""
    img = plate(size, glow)
    w = int(size * inset)
    mark = logo.resize((w, w), Image.LANCZOS)
    img.alpha_composite(mark, ((size - w) // 2, (size - w) // 2))
    return img.convert('RGB')


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path, 'PNG', optimize=True)
    print(f'{name:28} {img.size[0]}x{img.size[1]}  {os.path.getsize(path) // 1024}KB')


# ── Home-screen and launcher icons ───────────────────────────────────────────
# `any` icons are shown as-is, so the logo can fill most of the square.
for s in (192, 256, 384, 512):
    save(compose(s, 0.86), f'icon-{s}.png')

# `maskable` icons may be cropped to a circle of 80% of the square, so the logo
# sits inside that safe zone and the plate bleeds to the edge.
for s in (192, 512):
    save(compose(s, 0.62), f'maskable-{s}.png')

# iOS applies its own rounded mask and no transparency.
save(compose(180, 0.80), 'apple-touch-icon-180.png')

# Small sizes for browser tabs and the Windows taskbar.
for s in (32, 96):
    save(compose(s, 0.90), f'icon-{s}.png')

# ── iOS launch images ────────────────────────────────────────────────────────
# iOS matches one by exact device size, so a device with no match gets a blank
# screen. These are the current iPhone and iPad viewports, portrait.
LAUNCH = [
    (1320, 2868), (1290, 2796), (1284, 2778), (1206, 2622), (1179, 2556),
    (1170, 2532), (1242, 2688), (1125, 2436), (828, 1792), (750, 1334),
    (1536, 2048), (1640, 2360), (1668, 2388), (2048, 2732),
]
# The plate is flat here rather than glowing: a gradient at 2048x2732 is a
# megabyte of PNG for something on screen for half a second.
for w, h in LAUNCH:
    img = Image.new('RGBA', (w, h), NAVY + (255,))
    mark_w = int(min(w, h) * 0.34)
    mark = logo.resize((mark_w, mark_w), Image.LANCZOS)
    img.alpha_composite(mark, ((w - mark_w) // 2, (h - mark_w) // 2))
    # Palette-reduced: the plate is one colour and the mark is small, so 128
    # colours is invisible here and turns 300KB of splash into 30KB.
    save(img.convert('RGB').quantize(colors=128, method=Image.MEDIANCUT), f'launch-{w}x{h}.png')
