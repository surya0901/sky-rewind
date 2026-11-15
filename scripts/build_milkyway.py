"""Build web/public/data/milkyway.jpg from ESO's all-sky panorama (eso0932a, ESO/S. Brunier, CC BY 4.0).

The panorama is in galactic coordinates. We remove only the point stars (the catalogue draws those) and
keep every other pixel at full resolution, so the dust lanes, star clouds and nebulae stay sharp, then
reproject to J2000 equatorial coordinates: u = RA / 360 deg (RA increasing to the right), north at the top.

usage: python3 scripts/build_milkyway.py eso0932a_large.jpg out.jpg [width]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None
src_path, out_path = sys.argv[1], sys.argv[2]
W = int(sys.argv[3]) if len(sys.argv) > 3 else 8192
H = W // 2

img = np.asarray(Image.open(src_path).convert("RGB"), dtype=np.float32) / 255.0
sh, sw = img.shape[:2]

# --- stars down, structure kept: a multi-scale (wavelet-style) split. The finest scales hold the point
# stars and the JPEG grain; their bright spikes are clamped and mostly let go (the catalogue draws the
# stars). The middle and large scales hold the star clouds, dust lanes and nebulae: kept, the dust lanes
# gently strengthened, so the band stays crisp when you zoom in instead of turning to mush.
T = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
def g(a, s):
    return np.stack([ndi.gaussian_filter(a[..., c], s) for c in range(3)], -1)
S1, S2, S3 = g(img, 1.2), g(img, 3.0), g(img, 9.0)
d1, d2, d3 = img - S1, S1 - S2, S2 - S3
def clamp_up(d, t):
    # bright spikes (stars) are capped; dark detail (dust lanes) passes untouched
    return np.where(d > t, t + (d - t) * 0.08, d)
# the fine detail lives only where the Milky Way itself is bright: away from the band the photo's grain
# would read as thousands of extra faint stars, so there the sky stays smooth and dark
band = np.clip((S3 @ np.array([0.30, 0.59, 0.11], dtype=np.float32) - 0.05) / 0.12, 0, 1)
band = (band * band * (3 - 2 * band))[..., None]
clean = S3 + (0.5 + 0.7 * band) * d3 + band * (0.6 * T * clamp_up(d2, 0.02) + 0.15 * T * clamp_up(d1, 0.01))
print("multi-scale clean done")

# --- reproject galactic -> J2000 equatorial
M = np.array([[-0.0548755604, -0.8734370902, -0.4838350155],
              [0.4941094279, -0.4448296300, 0.7469822445],
              [-0.8676661490, -0.1980763734, 0.4559837762]])
out = np.zeros((H, W, 3), dtype=np.float32)
ra = (np.arange(W) + 0.5) / W * 2 * np.pi
for r0 in range(0, H, 256):
    rows = np.arange(r0, min(H, r0 + 256))
    dec = (0.5 - (rows + 0.5) / H) * np.pi
    RA, DEC = np.meshgrid(ra, dec)
    e = np.stack([np.cos(DEC) * np.cos(RA), np.cos(DEC) * np.sin(RA), np.sin(DEC)], 0).reshape(3, -1)
    g = M @ e
    l = np.degrees(np.arctan2(g[1], g[0]))
    b = np.degrees(np.arcsin(np.clip(g[2], -1, 1)))
    x = (0.5 - l / 360.0) * sw - 0.5
    y = (0.5 - b / 180.0) * sh - 0.5
    for c in range(3):
        out[rows[0]:rows[-1] + 1, :, c] = ndi.map_coordinates(clean[..., c], [y, x], order=3, mode="grid-wrap").reshape(len(rows), W)
Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out_path, quality=88, optimize=True, progressive=True)
print("wrote", out_path, W, H)
