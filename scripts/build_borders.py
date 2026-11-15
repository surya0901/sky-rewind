"""
Historical political borders for the 'who ruled here' map.
Source: historical-basemaps by A. Ourednik (GPL-3.0), 54 snapshots from 123,000 BCE to 2010.
Usage: python3 scripts/build_borders.py <folder with world_*.geojson and index.json>
Output: web/public/data/borders.json
  { years: [astronomical years], polities: { year: [[name, ruler, [ring, ...]], ...] } }
  ring = flat int list: x0, y0, dx1, dy1, ... in tenths of a degree
"""
import json
import sys
from pathlib import Path

from shapely.geometry import shape
from shapely.validation import make_valid

src = Path(sys.argv[1])
out = Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "borders.json"
index = json.loads((src / "index.json").read_text())
years, polities = [], {}
total = 0
for entry in index["years"]:
    y = entry["year"]
    astro = y + 1 if y < 0 else y  # dataset uses historical years: 1 BCE = -1
    gj = json.loads((src / entry["filename"]).read_text())
    feats = []
    for f in gj["features"]:
        p = f.get("properties") or {}
        name = (p.get("NAME") or "").strip()
        if not name or not f.get("geometry"):
            continue
        ruler = (p.get("SUBJECTO") or "").strip()
        try:
            g = make_valid(shape(f["geometry"])).simplify(0.18, preserve_topology=True)
        except Exception:
            continue
        polys = [g] if g.geom_type == "Polygon" else [x for x in getattr(g, "geoms", []) if x.geom_type == "Polygon"]
        rings = []
        for poly in polys:
            if poly.area < 0.08:
                continue
            pts = [(round(x * 10), round(y_ * 10)) for x, y_ in poly.exterior.coords]
            flat, px, py = [], 0, 0
            for i, (x, y_) in enumerate(pts):
                flat += [x, y_] if i == 0 else [x - px, y_ - py]
                px, py = x, y_
            if len(flat) >= 8:
                rings.append(flat)
        if rings:
            feats.append([name, ruler if ruler and ruler != name else "", rings])
    years.append(astro)
    polities[str(astro)] = feats
    total += len(feats)
data = {"source": "historical-basemaps, A. Ourednik (GPL-3.0)", "years": years, "polities": polities}
out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
print(f"{len(years)} snapshots, {total} polities, {out.stat().st_size / 1e6:.2f} MB")
