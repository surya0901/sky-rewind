"""
Build every static data file the web app loads, from packages that install
through npm and pip (no GitHub or VizieR access needed).

Inputs
  web/node_modules/d3-celestial/data/*.json            stars (HIP ids), names, Milky Way
  web/node_modules/@found-in-space/stellarium-skycultures-western/dist/manifest.json
                                                       constellation lines (HIP ids)
  pip: pyerfa, ephem, pillow, numpy

Outputs (web/public/data)
  stars.bin      Float32 x 8 per star: ux uy uz (J2000 unit vector), wx wy wz
                 (proper motion vector, rad/yr), mag, bv
  stars.json     {count, names: {index: name}, hip: [hip ids], young: [index]}
  lines.bin      Uint16 pairs of star indices for constellation segments
  constellations.json  label anchors [{id, name, ra, dec}]
  ltp.bin        Float32 x 10 per epoch: 3x3 precession matrix (J2000 -> mean of
                 date, Vondrak et al. 2011, row major) + obliquity (rad)
  ltp.json       {start, step, count}
  milkyway.png   equirectangular J2000 brightness map (RA 0..360 left to right)

Run:  python3 scripts/build_data.py
"""
import json
import math
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
NM = ROOT / "web" / "node_modules"
OUT = ROOT / "web" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

D3 = NM / "d3-celestial" / "data"
SKY = NM / "@found-in-space" / "stellarium-skycultures-western" / "dist" / "manifest.json"

MAG_LIMIT = 7.2  # a little past naked eye, faint stars add depth
MAS_TO_RAD = math.pi / (180 * 3600 * 1000)


def radec_unit(ra_deg, dec_deg):
    a, d = math.radians(ra_deg), math.radians(dec_deg)
    return np.array([math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)])


def lon_to_ra(lon):
    return lon + 360 if lon < 0 else lon


# ---------------------------------------------------------------- stars
def build_stars():
    feats = json.loads((D3 / "stars.8.json").read_text())["features"]
    names_raw = json.loads((D3 / "starnames.json").read_text())

    # HIP ids the constellation figures need, kept even if fainter than the cutoff
    sky = json.loads(SKY.read_text())
    line_hips = set()
    for c in sky["constellations"]:
        for poly in c["lines"]:
            line_hips.update(int(h) for h in poly if isinstance(h, (int, str)) and str(h).isdigit())

    stars = []
    for f in feats:
        hip = int(f["id"])
        mag = float(f["properties"]["mag"])
        if mag > MAG_LIMIT and hip not in line_hips:
            continue
        lon, lat = f["geometry"]["coordinates"]
        bv = f["properties"].get("bv")
        try:
            bv = float(bv)
        except (TypeError, ValueError):
            bv = 0.6
        stars.append({"hip": hip, "ra": lon_to_ra(lon), "dec": lat, "mag": mag, "bv": bv})
    stars.sort(key=lambda s: s["mag"])  # brightest first: draw order + label priority

    # Proper motions for the bright named stars (XEphem catalog shipped with pyephem).
    # Format: name,f|S|spec,RA|pmRA*,Dec|pmDec,mag   (pm in mas/yr, pmRA includes cos dec)
    import ephem.stars

    pm_by_name = {}
    for line in ephem.stars.db.splitlines():
        parts = line.split(",")
        name = parts[0].strip()
        pmra = float(parts[2].split("|")[1])
        pmdec = float(parts[3].split("|")[1])
        pm_by_name[name.lower()] = (pmra, pmdec)
    aliases = {"alkaid": ["alcaid"], "eltanin": ["etamin"], "albireo": ["albereo"],
               "fomalhaut": ["formalhaut"], "rigil kentaurus": ["rigil kentaurus"]}

    names = {}
    desig = {}
    cons_gen = {f["id"]: f["properties"].get("gen", f["id"])
                for f in json.loads((D3 / "constellations.json").read_text())["features"]}
    pm_hits = 0
    buf = bytearray()
    young = []
    # Massive supergiants younger than ~66 Myr that B-V alone does not flag
    young_named = {"betelgeuse", "antares", "deneb", "rigel", "polaris"}
    for i, s in enumerate(stars):
        meta = names_raw.get(str(s["hip"]), {})
        nm = (meta.get("name") or "").strip()
        if nm:
            names[i] = nm
        con = meta.get("c", "")
        letter = (meta.get("bayer") or meta.get("flam") or "").strip()
        if letter and con:
            desig[i] = f"{letter} {cons_gen.get(con, con)}"
        elif meta.get("hd"):
            desig[i] = meta["hd"]
        u = radec_unit(s["ra"], s["dec"])
        w = np.zeros(3)
        key = nm.lower()
        pm = pm_by_name.get(key)
        if pm is None:
            for a in aliases.get(key, []):
                pm = pm_by_name.get(a)
                if pm:
                    break
        if pm:
            pm_hits += 1
            a, d = math.radians(s["ra"]), math.radians(s["dec"])
            e_ra = np.array([-math.sin(a), math.cos(a), 0.0])
            e_dec = np.array([-math.sin(d) * math.cos(a), -math.sin(d) * math.sin(a), math.cos(d)])
            w = (pm[0] * e_ra + pm[1] * e_dec) * MAS_TO_RAD
        # Hot O / early-B stars (B-V < -0.15) live well under 66 Myr
        if s["bv"] < -0.15 or key in young_named:
            young.append(i)
        buf += struct.pack("<8f", *u, *w, s["mag"], s["bv"])

    (OUT / "stars.bin").write_bytes(bytes(buf))
    (OUT / "stars.json").write_text(json.dumps({
        "count": len(stars),
        "names": names,
        "desig": desig,
        "hip": [s["hip"] for s in stars],
        "young": young,
    }))
    print(f"stars: {len(stars)} (mag <= {MAG_LIMIT} plus figure stars), "
          f"{len(names)} named, {pm_hits} with proper motion, {len(young)} flagged young")
    return {s["hip"]: i for i, s in enumerate(stars)}


# ---------------------------------------------------------------- lines
def build_lines(hip_index):
    sky = json.loads(SKY.read_text())
    segs = []
    missing = 0
    for c in sky["constellations"]:
        for poly in c["lines"]:
            ids = [int(h) for h in poly if str(h).isdigit()]
            for a, b in zip(ids, ids[1:]):
                if a in hip_index and b in hip_index:
                    segs += [hip_index[a], hip_index[b]]
                else:
                    missing += 1
    (OUT / "lines.bin").write_bytes(struct.pack(f"<{len(segs)}H", *segs))

    feats = json.loads((D3 / "constellations.json").read_text())["features"]
    labels = []
    for f in feats:
        lon, lat = f["geometry"]["coordinates"]
        labels.append({"id": f["id"], "name": f["properties"]["name"],
                       "ra": lon_to_ra(lon), "dec": lat, "rank": int(f["properties"].get("rank", 3))})
    (OUT / "constellations.json").write_text(json.dumps(labels))
    print(f"lines: {len(segs)//2} segments ({missing} skipped), {len(labels)} labels")


# ---------------------------------------------------------------- precession
def build_ltp():
    import erfa

    start, stop, step = -198000.0, 12000.0, 50.0
    epochs = np.arange(start, stop + step / 2, step)
    buf = bytearray()
    for epj in epochs:
        p = erfa.ltpb(epj)  # GCRS/J2000 -> mean equator and equinox of date
        ecl = erfa.ltpecl(epj)  # ecliptic pole, J2000 frame
        equ = erfa.ltpequ(epj)  # equator pole, J2000 frame
        eps = math.acos(float(np.clip(ecl @ equ, -1, 1)))
        buf += struct.pack("<10f", *p.reshape(-1), eps)
    (OUT / "ltp.bin").write_bytes(bytes(buf))
    (OUT / "ltp.json").write_text(json.dumps({"start": start, "step": step, "count": len(epochs)}))
    print(f"ltp: {len(epochs)} epochs {start:.0f}..{stop:.0f}")


# ---------------------------------------------------------------- milky way
def _value_noise3(p, freq, seed):
    """Smooth 3D value noise sampled at unit vectors p (N,3)."""
    rng = np.random.default_rng(seed)
    n = 64
    lattice = rng.random((n, n, n)).astype(np.float32)
    q = (p * freq + 1000.0)
    i0 = np.floor(q).astype(np.int64)
    f = q - i0
    f = f * f * (3 - 2 * f)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (np.where(dx, f[:, 0], 1 - f[:, 0]) * np.where(dy, f[:, 1], 1 - f[:, 1])
                     * np.where(dz, f[:, 2], 1 - f[:, 2]))
                out = out + w * lattice[(i0[:, 0] + dx) % n, (i0[:, 1] + dy) % n, (i0[:, 2] + dz) % n]
    return out


def build_milkyway():
    """Procedural Milky Way placed exactly on the galactic plane (J2000 frame)."""
    from PIL import Image

    W, H = 2048, 1024
    ra = (np.arange(W) + 0.5) / W * 2 * np.pi
    dec = np.pi / 2 - (np.arange(H) + 0.5) / H * np.pi
    RA, DEC = np.meshgrid(ra, dec)
    v = np.stack([np.cos(DEC) * np.cos(RA), np.cos(DEC) * np.sin(RA), np.sin(DEC)], -1).reshape(-1, 3)

    # IAU J2000 equatorial -> galactic rotation
    G = np.array([[-0.0548755604, -0.8734370902, -0.4838350155],
                  [0.4941094279, -0.4448296300, 0.7469822445],
                  [-0.8676661490, -0.1980763734, 0.4559837762]])
    g = v @ G.T
    l = np.degrees(np.arctan2(g[:, 1], g[:, 0]))  # -180..180, 0 = galactic centre
    b = np.degrees(np.arcsin(np.clip(g[:, 2], -1, 1)))

    toward_centre = np.exp(-(l / 75.0) ** 2)
    thickness = 6.0 + 7.0 * toward_centre
    disk = (0.6 * np.exp(-np.abs(b) / thickness) + 0.4 * np.exp(-(b / (2.2 * thickness)) ** 2)) * (0.4 + 0.6 * toward_centre)
    bulge = 0.45 * np.exp(-(l / 20.0) ** 2 - (b / 12.0) ** 2)
    sky = disk + bulge

    # Great Rift: dust lane from Cygnus (l ~ 80) down to Sagittarius (l ~ 0)
    rift_window = np.exp(-((l - 35.0) / 35.0) ** 2)
    rift = 1 - 0.55 * rift_window * np.exp(-((b - 1.0) / 3.5) ** 2)
    # southern Coalsack near Crux (l ~ 301, b ~ -1)
    coal = 1 - 0.6 * np.exp(-(((l + 59) / 3.0) ** 2) - ((b + 1) / 3.0) ** 2)
    sky *= rift * coal

    # Magellanic Clouds (J2000 centres)
    for ra_c, dec_c, size, amp in ((80.9, -69.8, 4.5, 0.55), (13.2, -72.8, 2.5, 0.35)):
        c = radec_unit(ra_c, dec_c)
        ang = np.degrees(np.arccos(np.clip(v @ c, -1, 1)))
        sky += amp * np.exp(-(ang / size) ** 2)

    # cloudy structure
    n = (_value_noise3(v, 6.0, 1) * 0.55 + _value_noise3(v, 14.0, 2) * 0.3 + _value_noise3(v, 30.0, 3) * 0.15)
    sky *= (0.2 + 1.6 * n) ** 1.4

    sky = np.clip(sky / np.percentile(sky, 99.8), 0, 1).reshape(H, W)
    Image.fromarray((sky ** 0.75 * 255).astype(np.uint8)).save(OUT / "milkyway.png", optimize=True)
    print("milkyway.png written (procedural, galactic frame)")


if __name__ == "__main__":
    idx = build_stars()
    build_lines(idx)
    build_ltp()
    build_milkyway()
