#!/usr/bin/env python3
"""Generate Raagam app icons as PNG files using Pillow."""
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

def draw_rounded_rect(draw, xy, radius, fill):
    x0, y0, x1, y1 = xy
    r = radius
    # Four corners
    draw.ellipse([x0, y0, x0+2*r, y0+2*r], fill=fill)
    draw.ellipse([x1-2*r, y0, x1, y0+2*r], fill=fill)
    draw.ellipse([x0, y1-2*r, x0+2*r, y1], fill=fill)
    draw.ellipse([x1-2*r, y1-2*r, x1, y1], fill=fill)
    # Rectangles to fill the rest
    draw.rectangle([x0+r, y0, x1-r, y1], fill=fill)
    draw.rectangle([x0, y0+r, x1, y1-r], fill=fill)

def draw_bar(draw, cx, cy, w, h, radius, color, opacity=255):
    x0 = cx - w // 2
    y0 = cy - h // 2
    x1 = cx + w // 2
    y1 = cy + h // 2
    r = min(radius, w // 2, h // 2)
    c = color + (opacity,)
    draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=c)

def create_icon(size, include_text=False, include_r=True):
    """Create a Raagam icon at given size."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    s = size / 512.0  # scale factor

    # Colors
    bg_top = hex_to_rgb('#1a1a2e')
    bg_bot = hex_to_rgb('#16213e')
    green = hex_to_rgb('#1DB954')
    green_light = hex_to_rgb('#1ed760')
    green_pale = hex_to_rgb('#4ade80')
    white = (255, 255, 255)

    # Draw gradient background with rounded corners
    corner_r = int(108 * s)

    # Create gradient background
    for y in range(size):
        t = y / size
        # Diagonal gradient
        for x in range(size):
            t2 = (x + y) / (size * 2)
            c = lerp_color(bg_top, bg_bot, t2)
            img.putpixel((x, y), c + (255,))

    # Apply rounded corners mask
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size-1, size-1], radius=corner_r, fill=255)
    img.putalpha(mask)

    draw = ImageDraw.Draw(img)

    # Subtle center glow
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    cx, cy_center = int(256 * s), int(238 * s)
    glow_r = int(140 * s)
    glow_draw.ellipse([cx - glow_r, cy_center - glow_r, cx + glow_r, cy_center + glow_r],
                       fill=green + (12,))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    # === Sound wave bars ===
    bar_cx = int(256 * s)
    bar_cy = int(238 * s)
    bar_w = int(22 * s)

    bars = [
        # (x_offset, height, color, opacity)
        (-130, 70, green_pale, 140),
        (-98, 116, green_light, 178),
        (-66, 156, green, 216),
        # Center gap for disc
        (44, 156, green, 216),
        (76, 116, green_light, 178),
        (108, 70, green_pale, 140),
    ]

    for x_off, h, color, opacity in bars:
        bx = bar_cx + int(x_off * s)
        bh = int(h * s)
        draw_bar(draw, bx, bar_cy, bar_w, bh, int(11 * s), color, opacity)

    # === Vinyl disc in center ===
    disc_cx, disc_cy = bar_cx, bar_cy
    # Outer ring
    r_outer = int(42 * s)
    draw.ellipse([disc_cx - r_outer, disc_cy - r_outer, disc_cx + r_outer, disc_cy + r_outer],
                 outline=green + (216,), width=max(1, int(3.5 * s)))
    # Middle ring
    r_mid = int(26 * s)
    draw.ellipse([disc_cx - r_mid, disc_cy - r_mid, disc_cx + r_mid, disc_cy + r_mid],
                 outline=green + (128,), width=max(1, int(2 * s)))
    # Groove hint
    r_groove = int(34 * s)
    draw.ellipse([disc_cx - r_groove, disc_cy - r_groove, disc_cx + r_groove, disc_cy + r_groove],
                 outline=green + (64,), width=max(1, int(1 * s)))
    # Center dot
    r_center = int(10 * s)
    draw.ellipse([disc_cx - r_center, disc_cy - r_center, disc_cx + r_center, disc_cy + r_center],
                 fill=green)
    # Play triangle
    tri_s = int(10 * s)
    tri_points = [
        (disc_cx - int(5*s), disc_cy - tri_s),
        (disc_cx - int(5*s), disc_cy + tri_s),
        (disc_cx + int(9*s), disc_cy),
    ]
    draw.polygon(tri_points, fill=white + (242,))

    # === "R" lettermark ===
    if include_r:
        try:
            # Try system fonts
            font_size = int(48 * s)
            for font_name in ['/System/Library/Fonts/SFCompact.ttf',
                              '/System/Library/Fonts/Helvetica.ttc',
                              '/System/Library/Fonts/SFNSDisplay.ttf',
                              '/System/Library/Fonts/SFNS.ttf']:
                try:
                    font = ImageFont.truetype(font_name, font_size)
                    break
                except:
                    continue
            else:
                font = ImageFont.load_default()
        except:
            font = ImageFont.load_default()

        text_y = int(388 * s)
        draw.text((bar_cx, text_y), "R", fill=white + (230,), font=font, anchor="mt")

    # === Full text version ===
    if include_text:
        try:
            font_size_title = int(52 * s)
            font_size_sub = int(20 * s)
            for font_name in ['/System/Library/Fonts/SFCompact.ttf',
                              '/System/Library/Fonts/Helvetica.ttc',
                              '/System/Library/Fonts/SFNSDisplay.ttf',
                              '/System/Library/Fonts/SFNS.ttf']:
                try:
                    font_title = ImageFont.truetype(font_name, font_size_title)
                    font_sub = ImageFont.truetype(font_name, font_size_sub)
                    break
                except:
                    continue
            else:
                font_title = ImageFont.load_default()
                font_sub = ImageFont.load_default()
        except:
            font_title = ImageFont.load_default()
            font_sub = ImageFont.load_default()

        title_y = int(355 * s)
        draw.text((bar_cx, title_y), "RAAGAM", fill=white, font=font_title, anchor="mt")
        sub_y = int(400 * s)
        draw.text((bar_cx, sub_y), "MUSIC", fill=(179, 179, 179, 255), font=font_sub, anchor="mt")

    return img


def main():
    import os
    docs_dir = os.path.join(os.path.dirname(__file__), 'docs')

    # Generate icon sizes for PWA
    sizes = [48, 72, 96, 128, 144, 192, 384, 512]

    for sz in sizes:
        # Maskable icon (with R lettermark, good for homescreen)
        icon = create_icon(sz, include_text=False, include_r=True)
        path = os.path.join(docs_dir, f'icon-{sz}.png')
        icon.save(path, 'PNG', optimize=True)
        print(f'Created icon-{sz}.png')

    # Special: 512px with full text (for splash)
    splash_icon = create_icon(512, include_text=True, include_r=False)
    splash_icon.save(os.path.join(docs_dir, 'icon-splash.png'), 'PNG', optimize=True)
    print('Created icon-splash.png')

    # Apple touch icon (180x180)
    apple = create_icon(180, include_text=False, include_r=True)
    apple.save(os.path.join(docs_dir, 'apple-touch-icon.png'), 'PNG', optimize=True)
    print('Created apple-touch-icon.png')

    print('\nAll icons generated successfully!')


if __name__ == '__main__':
    main()
