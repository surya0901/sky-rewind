"""Pack the Stellarium western constellation figures (Johan Meuris, Free Art License) into one atlas.
Writes web/public/data/art.webp and art.json (per figure: the plane that maps image pixels to J2000 directions)."""
import json, math, os
import numpy as np
from PIL import Image

PKG = "web/node_modules/@found-in-space/stellarium-skycultures-western"
OUT = "web/public/data"
TILE, COLS = 256, 10

man = json.load(open(f"{PKG}/dist/manifest.json"))
figs = [c for c in man["constellations"] if c.get("image")]
rows = math.ceil(len(figs) / COLS)
atlas = Image.new("L", (COLS * TILE, rows * TILE), 0)
out = []
for i, c in enumerate(figs):
    im = Image.open(f"{PKG}/dist/{c['image']['file']}")
    w, h = c["image"]["size"]
    rgba = np.asarray(im.convert("RGBA"), dtype=np.float32) / 255
    lum = rgba[..., :3].max(axis=2) * rgba[..., 3]
    tile = Image.fromarray((lum * 255).astype(np.uint8)).resize((TILE, TILE), Image.LANCZOS)
    atlas.paste(tile, ((i % COLS) * TILE, (i // COLS) * TILE))
    an = c["image"]["anchors"]
    S = np.array([[a["pixel"]["x"] / w, a["pixel"]["y"] / h, 1.0] for a in an]).T  # columns (s, t, 1)
    P = np.array([[a["icrs"]["x"], a["icrs"]["y"], a["icrs"]["z"]] for a in an]).T
    A = P @ np.linalg.inv(S)  # direction = normalize(A @ (s, t, 1))
    out.append({"id": c["iau"], "name": c["common_name"]["native"], "tile": i, "A": [round(float(v), 5) for v in A.flatten()]})
atlas.save(f"{OUT}/art.webp", quality=72, method=6)
json.dump({"cols": COLS, "rows": rows, "figures": out}, open(f"{OUT}/art.json", "w"), separators=(",", ":"))
print(len(out), "figures", os.path.getsize(f"{OUT}/art.webp"), "bytes", im.mode)
atlas.resize((1280, rows * 128)).save("/tmp/claude-0/-home-claude/1dce33e8-245e-51b1-b49f-0dddbc5e00f1/scratchpad/atlas_preview.png")
