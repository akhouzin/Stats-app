# Generates the iOS app icon for the ERPGEN Stats Capacitor app — the same
# bold white "E" on ERPGEN green as the Android launcher icons (gen-icons.py),
# as one 1024x1024 opaque PNG (iOS rejects icons with an alpha channel; the
# system applies the rounded mask itself). Used by .github/workflows/build-ios.yml
# on a macOS runner: python3 gen-ios-icon.py <out.png> [font.ttf]
import sys
from PIL import Image, ImageDraw, ImageFont

BRAND_GREEN = (26, 122, 58)   # #1a7a3a — matches Stats/styles/stats.css --green
SIZE = 1024
LETTER_SCALE = 0.62

out = sys.argv[1] if len(sys.argv) > 1 else 'AppIcon-1024.png'
font_path = sys.argv[2] if len(sys.argv) > 2 else '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

img = Image.new('RGB', (SIZE, SIZE), BRAND_GREEN)
draw = ImageDraw.Draw(img)
font = ImageFont.truetype(font_path, int(SIZE * LETTER_SCALE))
bbox = draw.textbbox((0, 0), 'E', font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
draw.text(((SIZE - tw) / 2 - bbox[0], (SIZE - th) / 2 - bbox[1]), 'E', font=font, fill=(255, 255, 255))
img.save(out)
print('wrote', out)
