# Generates the Android launcher icons (square, round, adaptive foreground)
# for the ERPGEN Stats Capacitor app: a bold white "E" on a green ERPGEN-brand
# circle/square. Run: python gen-icons.py
from PIL import Image, ImageDraw, ImageFont
import os

RES = os.path.join(os.path.dirname(__file__), 'android', 'app', 'src', 'main', 'res')
BRAND_GREEN = (26, 122, 58, 255)   # #1a7a3a — matches Stats/styles/stats.css --green
FONT_PATH = r'C:\Windows\Fonts\arialbd.ttf'

DENSITIES = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192,
}
FOREGROUND_SCALE = 108 / 48  # foreground canvas is 108dp vs 48dp base icon


def draw_e(size, fg=(255, 255, 255, 255), bg=None, letter_scale=0.62):
    img = Image.new('RGBA', (size, size), bg if bg else (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font_size = int(size * letter_scale)
    font = ImageFont.truetype(FONT_PATH, font_size)
    text = 'E'
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pos = ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1])
    draw.text(pos, text, font=font, fill=fg)
    return img


def square_icon(size):
    return draw_e(size, fg=(255, 255, 255, 255), bg=BRAND_GREEN, letter_scale=0.62)


def round_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
    bg = Image.new('RGBA', (size, size), BRAND_GREEN)
    img.paste(bg, (0, 0), mask)
    letter = draw_e(size, fg=(255, 255, 255, 255), bg=None, letter_scale=0.58)
    img = Image.alpha_composite(img, letter)
    return img


def foreground_icon(size):
    # Adaptive icon foreground: transparent bg, "E" sized to the ~66% safe zone.
    return draw_e(size, fg=(255, 255, 255, 255), bg=None, letter_scale=0.40)


for density, base in DENSITIES.items():
    d = os.path.join(RES, f'mipmap-{density}')
    square_icon(base).save(os.path.join(d, 'ic_launcher.png'))
    round_icon(base).save(os.path.join(d, 'ic_launcher_round.png'))
    fg_size = int(round(base * FOREGROUND_SCALE))
    foreground_icon(fg_size).save(os.path.join(d, 'ic_launcher_foreground.png'))
    print(f'{density}: icon {base}px, foreground {fg_size}px')

print('Done.')
