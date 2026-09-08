"""Create one travel thumbnail. Requires Pillow; leaves the original untouched."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps

source, destination = map(Path, sys.argv[1:3])
with Image.open(source) as image:
    if getattr(image, 'is_animated', False):
        print(json.dumps({'skipped': True}))
        sys.exit(0)
    image = ImageOps.exif_transpose(image)
    image.thumbnail((800, 800), Image.Resampling.LANCZOS)
    image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
    image.save(destination, 'WEBP', quality=76, method=6)
    print(json.dumps({'original': source.stat().st_size, 'thumbnail': destination.stat().st_size}))
