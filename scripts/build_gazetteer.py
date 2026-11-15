"""
World gazetteer for search: cities, countries, provinces, deserts, ranges, peaks,
volcanoes and famous craters. Natural Earth (public domain) plus a curated list.
Usage: python3 scripts/build_gazetteer.py <folder with Natural Earth geojson>
Output: web/public/data/gazetteer.json  [[name, lat, lon, kind, rank, context], ...]
  rank: higher is more prominent (used to order suggestions)
"""
import json
import math
import sys
from pathlib import Path

from shapely.geometry import shape

src = Path(sys.argv[1])
out = Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "gazetteer.json"
rows = []


def load(name):
    return json.loads((src / f"{name}.geojson").read_text())["features"]


def rp(geom):
    g = shape(geom)
    p = g.representative_point()
    return round(p.y, 3), round(p.x, 3)


for f in load("ne_110m_admin_0_countries"):
    p = f["properties"]
    lat, lon = rp(f["geometry"])
    for nm in {p.get("NAME"), p.get("NAME_LONG"), p.get("ADMIN")}:
        if nm:
            rows.append([nm, lat, lon, "country", 100, ""])

for f in load("ne_10m_admin_1_states_provinces"):
    p = f["properties"]
    if not p.get("name") or not f.get("geometry"):
        continue
    try:
        lat, lon = rp(f["geometry"])
    except Exception:
        continue
    rows.append([p["name"], lat, lon, "region", 60 - int(p.get("scalerank") or 5), p.get("admin") or ""])

for f in load("ne_10m_populated_places_simple"):
    p = f["properties"]
    pop = p.get("pop_max") or 0
    lon, lat = f["geometry"]["coordinates"]
    rank = 20 + min(70, int(10 * math.log10(max(pop, 10))))
    ctx = ", ".join(x for x in [p.get("adm1name"), p.get("adm0name")] if x)
    rows.append([p["name"], round(lat, 3), round(lon, 3), "city", rank, ctx])

for name in ["ne_10m_geography_regions_points", "ne_10m_geography_regions_elevation_points"]:
    for f in load(name):
        p = f["properties"]
        nm = p.get("name") or p.get("NAME")
        if not nm:
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        kind = (p.get("featurecla") or "feature").lower()
        elev = p.get("elevation")
        ctx = f"{int(elev):,} m" if isinstance(elev, (int, float)) and elev else ""
        rows.append([nm, round(lat, 3), round(lon, 3), kind, 55 - int(p.get("scalerank") or 5), ctx])

for f in load("ne_50m_geography_regions_polys"):
    p = f["properties"]
    nm = p.get("name") or p.get("NAME")
    if not nm:
        continue
    try:
        lat, lon = rp(f["geometry"])
    except Exception:
        continue
    rows.append([nm, lat, lon, (p.get("featurecla") or "region").lower(), 65 - int(p.get("scalerank") or 5), p.get("region") or ""])

# Famous craters and volcanoes. Impact ages from the Earth Impact Database (approximate).
CURATED = [
    ("Meteor Crater (Barringer Crater)", 35.027, -111.022, "impact crater", "Arizona. 1.2 km wide, about 50,000 years old"),
    ("Chicxulub crater", 21.40, -89.52, "impact crater", "Yucatan. 180 km wide, 66 million years old"),
    ("Vredefort crater", -27.00, 27.50, "impact crater", "South Africa. Largest known, about 2 billion years old"),
    ("Sudbury Basin", 46.60, -81.18, "impact crater", "Ontario. About 1.85 billion years old"),
    ("Manicouagan crater", 51.38, -68.70, "impact crater", "Quebec. Ring lake, about 214 million years old"),
    ("Popigai crater", 71.65, 111.18, "impact crater", "Siberia. About 36 million years old"),
    ("Chesapeake Bay crater", 37.28, -76.02, "impact crater", "Virginia. About 35 million years old"),
    ("Ries crater (Nordlinger Ries)", 48.88, 10.62, "impact crater", "Bavaria. About 15 million years old"),
    ("Lonar crater", 19.976, 76.509, "impact crater", "Maharashtra, India. Lake in a young basalt crater"),
    ("Wolfe Creek crater", -19.17, 127.80, "impact crater", "Western Australia. About 120,000 years old"),
    ("Kaali crater", 58.37, 22.67, "impact crater", "Estonia. Fell within human memory, a few thousand years ago"),
    ("Tswaing crater", -25.41, 28.08, "impact crater", "South Africa. About 220,000 years old"),
    ("Gosses Bluff", -23.82, 132.31, "impact crater", "Northern Territory. About 142 million years old"),
    ("Kerid crater", 64.041, -20.885, "volcanic crater", "Iceland. Red scoria crater with a blue lake, about 6,500 years old"),
    ("Viti crater (Askja)", 65.047, -16.725, "volcanic crater", "Iceland. Geothermal crater lake in the Askja caldera"),
    ("Askja caldera", 65.03, -16.75, "volcano", "Iceland highlands"),
    ("Hverfjall", 65.604, -16.872, "volcanic crater", "Iceland. Tephra ring 1 km wide near Myvatn"),
    ("Eyjafjallajokull", 63.63, -19.62, "volcano", "Iceland. Its 2010 ash cloud grounded European flights"),
    ("Hekla", 63.98, -19.70, "volcano", "Iceland. Called the gateway to hell in medieval Europe"),
    ("Laki (Lakagigar)", 64.07, -18.23, "volcano", "Iceland. The 1783 fissure eruption darkened skies across Europe"),
    ("Vesuvius", 40.821, 14.426, "volcano", "Italy. Buried Pompeii in 79 CE"),
    ("Pompeii", 40.749, 14.485, "archaeological site", "Italy. Roman town buried by Vesuvius in 79 CE"),
    ("Krakatoa", -6.102, 105.423, "volcano", "Indonesia. The 1883 eruption reddened sunsets worldwide"),
    ("Tambora", -8.25, 118.00, "volcano", "Indonesia. Its 1815 eruption caused the Year Without a Summer"),
    ("Mount St. Helens", 46.191, -122.195, "volcano", "Washington. Erupted 18 May 1980"),
    ("Crater Lake", 42.944, -122.109, "volcanic crater", "Oregon. Caldera of Mount Mazama, about 7,700 years old"),
    ("Ngorongoro Crater", -3.20, 35.50, "volcanic crater", "Tanzania. The world's largest unbroken caldera"),
    ("Haleakala crater", 20.709, -156.253, "volcanic crater", "Maui, Hawaii"),
    ("Kilauea", 19.421, -155.287, "volcano", "Hawaii"),
    ("Mount Etna", 37.751, 14.993, "volcano", "Sicily"),
    ("Santorini (Thera)", 36.404, 25.396, "volcano", "Greece. The Bronze Age Minoan eruption"),
    ("Yellowstone Caldera", 44.43, -110.59, "volcano", "Wyoming. Supervolcano"),
    ("Mount Fuji", 35.361, 138.727, "volcano", "Japan"),
    ("Mount Pinatubo", 15.14, 120.35, "volcano", "Philippines. 1991 eruption cooled the globe"),
    ("Kilimanjaro", -3.067, 37.356, "volcano", "Tanzania. Highest peak in Africa"),
    ("Mount Everest", 27.988, 86.925, "peak", "Nepal and Tibet. 8,849 m"),
    ("Great Wall of China (Badaling)", 40.354, 116.020, "archaeological site", "China"),
    ("Petra", 30.329, 35.444, "archaeological site", "Jordan"),
    ("Mohenjo-daro", 27.329, 68.138, "archaeological site", "Indus Valley, Pakistan"),
    ("Knossos", 35.298, 25.163, "archaeological site", "Crete. Minoan palace"),
    ("Persepolis", 29.935, 52.891, "archaeological site", "Iran. Achaemenid capital"),
    ("Easter Island (Rapa Nui)", -27.113, -109.350, "archaeological site", "Moai statues"),
    ("Mesa Verde", 37.184, -108.489, "archaeological site", "Colorado. Ancestral Puebloan cliff dwellings"),
    ("Cahokia", 38.655, -90.062, "archaeological site", "Illinois. Mississippian city"),
    ("Nazca Lines", -14.739, -75.130, "archaeological site", "Peru"),
    ("Taj Mahal", 27.175, 78.042, "landmark", "Agra, India"),
    ("Eiffel Tower", 48.858, 2.294, "landmark", "Paris"),
    ("Hagia Sophia", 41.008, 28.980, "landmark", "Istanbul"),
    ("Borobudur", -7.608, 110.204, "archaeological site", "Java"),
    ("Great Zimbabwe", -20.271, 30.934, "archaeological site", "Zimbabwe"),
    ("Mauna Kea Observatories", 19.821, -155.468, "observatory", "Hawaii"),
    ("Paranal Observatory", -24.627, -70.404, "observatory", "Atacama, Chile"),
    ("Jodrell Bank", 53.237, -2.307, "observatory", "England"),
    ("Kennedy Space Center", 28.573, -80.649, "landmark", "Florida. Apollo launches"),
]
for nm, lat, lon, kind, ctx in CURATED:
    rows.append([nm, lat, lon, kind, 95, ctx])

for r in rows:
    if r[0].isupper():
        r[0] = r[0].title()
seen = set()
uniq = []
for r in sorted(rows, key=lambda r: -r[4]):
    key = (r[0].lower(), round(r[1]), round(r[2]))
    if key in seen:
        continue
    seen.add(key)
    uniq.append(r)
out.write_text(json.dumps(uniq, separators=(",", ":"), ensure_ascii=False))
print(f"{len(uniq)} places, {out.stat().st_size / 1e6:.2f} MB")
