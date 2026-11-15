// The ground under the sky: a horizon that fits the place and the era, and real
// monuments placed from their surveyed coordinates. Distances are in metres / 10,
// so every object keeps its true angular size as seen from the viewpoint.
import * as THREE from "three";
import { altAzToWorld } from "../astro/frame";
import { CURRENT_YEAR } from "../astro/time";
import { duneFrag, duneVert } from "./shaders";
import { makeCreature, type Creature } from "./creatures";

const S = 0.1; // scene units per metre
const EYE = 1.7; // metres

export type Biome =
  | "desert" | "savanna" | "grassland" | "forest" | "jungle" | "mountains"
  | "ice" | "tundra" | "mesozoic" | "cenozoic";

export interface LandscapeInfo {
  biome: Biome;
  label: string; // shown in the HUD, e.g. "Laurentide ice sheet to the north"
  site: string | null;
  lightPollution: number; // 0..1
  urban: number; // 0..1: how built-up the area is. Affects nothing drawn; kept for the cache key and tests
  /** architecture era, so a place seen today and then in 1877 never shares a cached ground */
  urbanStage: "preindustrial" | "industrial" | "modern";
}

/** Everything that changes what the ground looks like. Two scenes with the same key share the built ground. */
export function groundKey(info: LandscapeInfo, lat: number, lon: number, year: number, visibleSet = "") {
  return [info.biome, info.site, visibleSet, info.urbanStage, Math.round(info.urban * 10), Math.round(info.lightPollution * 10),
    year > 1300, year > 500, Math.round(lat), Math.round(lon), info.label].join("|");
}

// ------------------------------------------------------------------ where am I
interface Box { lat: [number, number]; lon: [number, number] }
const DESERTS: Box[] = [
  { lat: [15, 33], lon: [-17, 60] }, // Sahara and Arabia
  { lat: [-32, -19], lon: [119, 142] }, // central Australia
  { lat: [-28, -17], lon: [-71.5, -68] }, // Atacama
  { lat: [30, 37.5], lon: [-117, -108] }, // Mojave and Sonoran
  { lat: [37, 46], lon: [92, 112] }, // Gobi
  { lat: [24, 30], lon: [69, 75] }, // Thar
];
const MOUNTAINS: Box[] = [
  { lat: [-20, -8], lon: [-78, -68] }, // central Andes
  { lat: [27, 36], lon: [75, 95] }, // Himalaya and Tibet
  { lat: [45.5, 47.5], lon: [6, 13] }, // Alps
];
const inBox = (lat: number, lon: number, b: Box) => lat >= b.lat[0] && lat <= b.lat[1] && lon >= b.lon[0] && lon <= b.lon[1];

// Modelled city glow (an educational estimate, not measured sky brightness).
// Walker's law (Walker 1977, PASP 89, 405): the extra zenith sky glow from a city of population P
// at distance r km is roughly 0.01 P r^-2.5 times the natural sky. Populations come from the bundled
// Natural Earth places (set by setGlowCities). A few hand-set values below are kept as a floor.
let GLOW_CITIES: [number, number, number][] = []; // lat, lon, population
export function setGlowCities(rows: [number, number, number][]) {
  GLOW_CITIES = rows;
}
function walkerGlow(lat: number, lon: number) {
  let I = 0;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const [cl, co, pop] of GLOW_CITIES) {
    // quick box test before the great-circle distance: nothing beyond about 150 km matters here
    if (Math.abs(cl - lat) > 1.4 || Math.abs(co - lon) * cosLat > 1.4) continue;
    const d = km(lat, lon, cl, co);
    const r = Math.max(d, Math.sqrt(pop) / 350 + 1); // you cannot be closer than inside the city
    I += 0.01 * pop * Math.pow(r, -2.5);
  }
  // 0 for a natural sky, about 0.5 when the city adds ten times the natural glow, 1 at a hundred times
  return Math.min(1, Math.log10(1 + I) / 2);
}
const CITIES: { lat: number; lon: number; glow: number }[] = [
  { lat: 40.7128, lon: -74.006, glow: 1 }, { lat: 40.3431, lon: -74.6551, glow: 0.45 }, { lat: 40.5754, lon: -74.3224, glow: 0.7 },
  { lat: 30.0444, lon: 31.2357, glow: 1 }, { lat: 29.9792, lon: 31.1342, glow: 0.7 }, { lat: 41.8902, lon: 12.4922, glow: 0.9 },
  { lat: 37.9715, lon: 23.7257, glow: 0.9 }, { lat: 39.9042, lon: 116.4074, glow: 1 }, { lat: 51.4769, lon: -0.0005, glow: 1 },
  { lat: 29.7604, lon: -95.3698, glow: 1 }, { lat: 13.0827, lon: 80.2707, glow: 1 }, { lat: 34.3416, lon: 108.9398, glow: 0.9 },
  { lat: 33.3152, lon: 44.3661, glow: 0.9 }, { lat: 50.0755, lon: 14.4378, glow: 0.9 }, { lat: 26.9248, lon: 75.8246, glow: 0.8 },
  { lat: 25.3176, lon: 82.9739, glow: 0.8 }, { lat: 45.4064, lon: 11.8768, glow: 0.7 }, { lat: 11.6643, lon: 78.146, glow: 0.6 },
];

export function km(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

export function describeGround(lat: number, lon: number, year: number): LandscapeInfo {
  const ago = CURRENT_YEAR - year;
  const site = SITES.find((s) => km(lat, lon, s.center[0], s.center[1]) < 15) ?? null;
  let lp = 0;
  if (year >= 1900) {
    const grow = THREE.MathUtils.smoothstep(year, 1900, 1990);
    for (const c of CITIES) {
      const d = km(lat, lon, c.lat, c.lon);
      if (d < 60) lp = Math.max(lp, c.glow * (1 - d / 60) * grow);
    }
    lp = Math.max(lp, walkerGlow(lat, lon) * grow);
  }
  // inside a big modern city the horizon is buildings: low blocks by 1900, towers by the late 20th century
  let urbanPop = 0;
  if (year >= 1880) for (const [cl, co, pop] of GLOW_CITIES) if (pop >= 3e6 && km(lat, lon, cl, co) < 12) urbanPop = Math.max(urbanPop, pop);
  // inside a big modern city the horizon is buildings: low blocks by 1900, towers by the late 20th century
  let urban = 0;
  if (year >= 1880) for (const c of CITIES) if (c.glow >= 0.9 && km(lat, lon, c.lat, c.lon) < 14) urban = THREE.MathUtils.smoothstep(year, 1880, 1975);
  if (urbanPop && !site) urban = Math.max(urban, THREE.MathUtils.smoothstep(year, 1880, 1975));
  const urbanStage: LandscapeInfo["urbanStage"] = year < 1880 ? "preindustrial" : year < 1950 ? "industrial" : "modern";
  const base = { site: site?.name ?? null, lightPollution: lp, urban, urbanStage };
  if (ago > 252e6) return { ...base, biome: "cenozoic", label: "Before the dinosaurs. Continents in different places" };
  if (ago >= 66e6) {
    // the first dinosaurs appear about 233 million years ago; before that the interior of Pangaea was hot and dry
    if (ago > 235e6) return { ...base, biome: "desert", label: "Early Triassic, before the dinosaurs. Much of Pangaea's interior was dry" };
    const period = ago > 201e6 ? "Triassic" : ago > 145e6 ? "Jurassic" : "Cretaceous";
    return { ...base, biome: "mesozoic", label: `${period} conifers and ferns. Continents sat in different places` };
  }
  if (ago > 2.6e6) return { ...base, biome: "cenozoic", label: "Age of mammals. Continents close to today" };
  // Last Glacial Period: big northern ice sheets
  if (ago > 11700 && ago < 115000) {
    const nAm = lon < -50 && lon > -140;
    const eu = lon > -12 && lon < 60;
    if ((nAm && lat > 41) || (eu && lat > 53) || lat > 66) return { ...base, biome: "ice", label: "On the ice sheet" };
    if (nAm && lat > 38) return { ...base, biome: "tundra", label: "Tundra. The Laurentide ice sheet stands to the north" };
    if ((eu && lat > 42) || lat > 50) return { ...base, biome: "tundra", label: "Ice-age steppe tundra" };
  }
  if (Math.abs(lat) > 66) return { ...base, biome: "ice", label: "Polar snow" };
  for (const b of MOUNTAINS) if (inBox(lat, lon, b)) return { ...base, biome: "mountains", label: "" };
  for (const b of DESERTS) {
    if (!inBox(lat, lon, b)) continue;
    // the African Humid Period turned the Sahara green
    const green = b === DESERTS[0] && year > -9500 && year < -3500;
    return green ? { ...base, biome: "savanna", label: "The Green Sahara: grassland, lakes and hippos" } : { ...base, biome: "desert", label: "" };
  }
  if (site?.biome) return { ...base, biome: site.biome, label: "" };
  if (Math.abs(lat) < 18) return { ...base, biome: "jungle", label: "" };
  return { ...base, biome: "forest", label: "" };
}

// ------------------------------------------------------------------ monuments
interface Landmark {
  name: string;
  at: [number, number]; // lat, lon of the monument's centre
  from: number; // astronomical year it existed from
  build: (year: number) => THREE.Object3D; // geometry in metres, origin at ground centre
}
interface Site {
  name: string;
  center: [number, number];
  view: [number, number]; // where you stand
  biome?: Biome;
  landmarks: Landmark[];
}

// ------------------------------------------------------------------ surfaces
// Small procedural textures so stone, sand and grass have grain instead of flat colour.
const texCache = new Map<string, THREE.CanvasTexture>();
function noiseTex(kind: "sarsen" | "limestone" | "blocks" | "grass" | "sand" | "snow" | "fern" | "tundra" | "rock" | "red" | "skin"): THREE.CanvasTexture {
  const hit = texCache.get(kind);
  if (hit) return hit;
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const img = g.createImageData(N, N);
  const r = rng(kind.length * 977 + kind.charCodeAt(0));
  // value noise in two octaves, tileable
  const grid = (n: number) => Array.from({ length: n * n }, () => r());
  const g1 = grid(16), g2 = grid(64);
  const sample = (G: number[], n: number, x: number, y: number) => {
    const fx = (x / N) * n, fy = (y / N) * n;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (i: number, j: number) => G[((j % n) * n + (i % n))];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
  };
  const base: Record<string, [number, number, number]> = {
    sarsen: [128, 124, 114], limestone: [214, 204, 180], blocks: [170, 140, 100], grass: [58, 78, 40], sand: [196, 160, 112],
    snow: [222, 230, 240], fern: [40, 66, 34], tundra: [96, 98, 84], rock: [92, 90, 86], red: [170, 78, 44], skin: [92, 88, 66],
  };
  const [br, bg, bb] = base[kind];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n = sample(g1, 16, x, y) * 0.6 + sample(g2, 64, x, y) * 0.4;
      const fine = r();
      let k = 0.75 + 0.5 * n + (fine - 0.5) * 0.18;
      let [cr, cg, cb] = [br, bg, bb];
      if (kind === "sarsen") {
        // lichen blotches and dark pits on weathered sandstone
        if (sample(g2, 64, x + 37, y + 11) > 0.78) { cr = 150; cg = 152; cb = 120; }
        if (fine > 0.985) k *= 0.55;
      }
      if (kind === "blocks") {
        // stepped courses of limestone blocks with dark joints
        const course = y % 32;
        const off = Math.floor(y / 32) % 2 ? 24 : 0;
        if (course < 2 || (x + off) % 48 < 2) k *= 0.55;
      }
      if (kind === "limestone") {
        // fine joints between casing blocks, and faint rain streaks down the face
        const row = Math.floor(y / 32);
        if (y % 32 < 1 || (x + (row % 2 ? 40 : 0)) % 80 < 1) k *= 0.86;
        k *= 0.94 + 0.12 * sample(g1, 16, x * 4, y * 0.25);
      }
      if (kind === "skin") {
        // pebbly scales and darker countershaded blotches
        const sc = Math.sin(x * 0.9) * Math.sin(y * 0.9) > 0.55 ? 0.85 : 1;
        const blot = sample(g1, 16, x * 2 + 50, y) > 0.62 ? 0.72 : 1;
        k *= sc * blot;
      }
      if (kind === "grass" || kind === "fern") k *= 0.8 + 0.4 * (fine > 0.5 ? 1 : 0.7);
      const i = (y * N + x) * 4;
      img.data[i] = Math.min(255, cr * k);
      img.data[i + 1] = Math.min(255, cg * k);
      img.data[i + 2] = Math.min(255, cb * k);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(kind, t);
  return t;
}

function surface(kind: Parameters<typeof noiseTex>[0], repeat = 1, tint = 1) {
  const map = noiseTex(kind).clone();
  map.needsUpdate = true;
  map.repeat.set(repeat, repeat);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, color: new THREE.Color(tint, tint, tint) });
}

const stone = (r: number, g: number, b: number) => new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), roughness: 0.95 });

function pyramid(base: number, height: number, year: number, casingLostAfter = 1300) {
  // Giza pyramids are aligned to the cardinal points. Until the 1303 earthquake they wore smooth white
  // Tura limestone with a bright capstone; afterwards the casing was quarried away, leaving the stepped core.
  const cased = year < casingLostAfter;
  const grp = new THREE.Group();
  if (cased) {
    const h = base / 2, slant = Math.hypot(h, height), tile = 16; // metres per texture repeat
    const pos: number[] = [], uv: number[] = [];
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      pos.push(bx, 0, bz, ax, 0, az, 0, height, 0);
      uv.push(0, 0, base / tile, 0, base / tile / 2, slant / tile);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mat = surface("limestone", 1);
    mat.roughness = 0.55;
    mat.side = THREE.DoubleSide;
    grp.add(new THREE.Mesh(g, mat));
    // the pyramidion: a small capstone, by tradition sheathed in electrum
    const capH = height * 0.035;
    const cap = new THREE.Mesh(new THREE.ConeGeometry((capH * h) / height * Math.SQRT2 * 1.02, capH, 4, 1),
      new THREE.MeshStandardMaterial({ color: 0xd9b860, roughness: 0.3, metalness: 0.85, emissive: 0x2a2008 }));
    cap.rotation.y = Math.PI / 4;
    cap.position.y = height - capH / 2 + 0.05;
    grp.add(cap);
  } else {
    // the stepped core: one block course after another, each set back from the one below
    const courses = Math.min(140, Math.max(40, Math.round(height / 1.05)));
    const ch = (height * 0.97) / courses;
    const bm = surface("blocks", 1);
    bm.map!.repeat.set(30, 0.125);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bm, courses);
    const m4 = new THREE.Matrix4();
    const r = rng(Math.round(base * 13 + height));
    for (let i = 0; i < courses; i++) {
      const w = base * (1 - i / courses) * (0.992 + r() * 0.012) + 1.2;
      m4.compose(new THREE.Vector3((r() - 0.5) * 0.3, ch * (i + 0.5), (r() - 0.5) * 0.3), new THREE.Quaternion(), new THREE.Vector3(w, ch, w));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, new THREE.Color().setScalar(0.82 + r() * 0.3));
    }
    grp.add(im);
  }
  return grp;
}

function stepped(base: number, top: number, levels: number, height: number, temple: number, mat: THREE.Material, rot = 0) {
  const grp = new THREE.Group();
  const h = height / levels;
  for (let k = 0; k < levels; k++) {
    const w = base - ((base - top) * k) / levels;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    m.position.y = h * (k + 0.5);
    grp.add(m);
  }
  if (temple > 0) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(top * 0.6, temple, top * 0.6), mat);
    t.position.y = height + temple / 2;
    grp.add(t);
  }
  grp.rotation.y = (-rot * Math.PI) / 180;
  return grp;
}

function stonehenge(year: number) {
  // Sarsen circle (30 uprights, 33 m across, lintels), trilithon horseshoe open to the
  // midsummer sunrise (axis 49.9°), and the Heel Stone 77 m out on that axis
  const grp = new THREE.Group();
  const mat = surface("sarsen", 1);
  const ruined = year > 500;
  const keep = (i: number) => !ruined || [0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 21, 22, 23, 26, 27, 28, 29].includes(i);
  const R = 16.5;
  for (let i = 0; i < 30; i++) {
    if (!keep(i)) continue;
    const a = ((49.9 + 6 + i * 12) * Math.PI) / 180;
    const jit = Math.sin(i * 12.9898) * 0.5;
    const hgt = 4.1 + jit * 0.5;
    const m = new THREE.Mesh(roughStone(2.1, hgt, 1.1, i), mat);
    m.position.set(R * Math.sin(a), hgt / 2, -R * Math.cos(a));
    m.rotation.set(jit * 0.04, -a + jit * 0.06, jit * 0.03);
    grp.add(m);
    if (keep(i + 1) && (!ruined || i % 3 !== 2)) {
      const b = a + (12 * Math.PI) / 180;
      const mid = (a + b) / 2;
      const l = new THREE.Mesh(roughStone(3.5, 0.8, 1.0, i * 3 + 1), mat);
      l.position.set(R * Math.sin(mid), 4.55, -R * Math.cos(mid));
      l.rotation.y = -mid;
      grp.add(l);
    }
  }
  const tri = [[-105, 6.0], [-55, 6.6], [0, 7.3], [55, 6.6], [105, 6.0]];
  tri.forEach(([off, h], k) => {
    if (ruined && (k === 1 || k === 2)) return;
    const a = ((229.9 + off) * Math.PI) / 180;
    const r = 8.5 + Math.abs(off) / 60;
    const cx = r * Math.sin(a), cz = -r * Math.cos(a);
    const pair = new THREE.Group();
    for (const s of [-1, 1]) {
      const u = new THREE.Mesh(roughStone(2.3, h, 1.3, k * 7 + s), mat);
      u.position.set(s * 1.35, h / 2, 0);
      pair.add(u);
    }
    const l = new THREE.Mesh(roughStone(5.2, 1.0, 1.3, k * 5 + 2), mat);
    l.position.y = h + 0.5;
    pair.add(l);
    pair.position.set(cx, 0, cz);
    pair.rotation.y = -a;
    grp.add(pair);
  });
  const heelA = (51.3 * Math.PI) / 180;
  const heel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.7, 2.0), mat);
  heel.position.set(77 * Math.sin(heelA), 2.2, -77 * Math.cos(heelA));
  heel.rotation.z = 0.12;
  grp.add(heel);
  return grp;
}

/** A sarsen: a box with weathered, uneven faces and a slight taper. */
function roughStone(w: number, h: number, d: number, seed: number) {
  const g = new THREE.BoxGeometry(w, h, d, 6, 12, 4);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 3.1 + seed) * Math.cos(y * 2.3 + seed * 1.7) * Math.sin(z * 4.7 + seed * 0.3)
      + 0.5 * Math.sin(x * 9.3 + y * 7.1 + seed * 2.1) * Math.cos(z * 8.2 - y * 5.3);
    const taper = 1 - 0.14 * (y / h + 0.5);
    // round the corners and top a little, like dressed but weathered sarsen
    const edge = Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (d / 2));
    const top = Math.max(0, y / (h / 2));
    p.setXYZ(i, x * taper * (1 + 0.07 * n), y + 0.1 * n - 0.15 * edge * top * top, z * taper * (1 + 0.12 * n));
  }
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 0.35 + seed * 0.13, uv.getY(i) * h * 0.35);
  g.computeVertexNormals();
  return g;
}

function mound(diameter: number, height: number, mat: THREE.Material) {
  const g = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.scale.set(diameter / 2, height, diameter / 2);
  return m;
}

function angkor() {
  const grp = new THREE.Group();
  const mat = surface("rock", 6, 1.1);
  const terr = [[187, 215, 6], [100, 115, 7], [60, 60, 12]];
  let y = 0;
  for (const [w, d, h] of terr) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.y = y + h / 2;
    grp.add(m);
    y += h;
  }
  // five lotus-bud towers in a quincunx
  for (const [x, z, h] of [[0, 0, 65 - y], [-25, -25, 42], [25, -25, 42], [-25, 25, 42], [25, 25, 42]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 9, h, 10), mat);
    t.position.set(x, y + h / 2, z);
    grp.add(t);
  }
  return grp;
}

function colosseum(year: number) {
  const mat = surface("limestone", 8, 0.8);
  const grp = new THREE.Group();
  const outer = new THREE.CylinderGeometry(1, 1, 48, 64, 1, true);
  const m = new THREE.Mesh(outer, new THREE.MeshStandardMaterial({ map: mat.map, roughness: 0.95, side: THREE.DoubleSide, color: mat.color }));
  m.scale.set(94.5, 1, 78);
  m.position.y = 24;
  grp.add(m);
  if (year > 1349) {
    // the 1349 earthquake brought down the outer south side: cut a notch
    const cut = new THREE.Mesh(new THREE.BoxGeometry(80, 30, 40), new THREE.MeshBasicMaterial({ colorWrite: false }));
    cut.position.set(0, 40, 70);
    grp.add(cut);
  }
  return grp;
}

export const SITES: Site[] = [
  {
    name: "Giza pyramids",
    center: [29.9765, 31.1313],
    view: [29.9753, 31.1376], // beside the Sphinx
    landmarks: [
      { name: "Great Pyramid of Khufu", at: [29.9792, 31.1342], from: -2559, build: (y) => pyramid(230.3, 146.6, y) },
      { name: "Pyramid of Khafre", at: [29.9761, 31.1308], from: -2529, build: (y) => pyramid(215.3, 143.5, y) },
      { name: "Pyramid of Menkaure", at: [29.9725, 31.1281], from: -2509, build: (y) => pyramid(102.2, 65.5, y) },
    ],
  },
  {
    name: "Stonehenge",
    center: [51.17886, -1.82622],
    view: [51.17886, -1.82622],
    biome: "grassland",
    landmarks: [{ name: "Stonehenge", at: [51.17886, -1.82622], from: -2499, build: stonehenge }],
  },
  {
    name: "Chichen Itza",
    center: [20.6835, -88.5682],
    view: [20.6843, -88.5678], // Great Plaza, north of the pyramid
    biome: "jungle",
    landmarks: [{
      name: "El Castillo", at: [20.68297, -88.56858], from: 900,
      build: () => stepped(55.3, 19.5, 9, 24, 6, surface("limestone", 3, 0.85), 21),
    }],
  },
  {
    name: "Teotihuacan",
    center: [19.6925, -98.8438],
    view: [19.6925, -98.8462], // on the Avenue of the Dead
    biome: "grassland",
    landmarks: [{
      name: "Pyramid of the Sun", at: [19.6925, -98.8438], from: 200,
      build: () => stepped(225, 40, 5, 65, 0, surface("rock", 12), 15.5),
    }],
  },
  {
    name: "Uluru",
    center: [-25.3444, 131.0369],
    view: [-25.3335, 131.0006],
    landmarks: [{
      name: "Uluru", at: [-25.3444, 131.0369], from: -600e6,
      build: () => {
        const m = mound(1, 348, surface("red", 10));
        m.scale.set(1800, 348, 950);
        m.rotation.y = -0.35;
        return m;
      },
    }],
  },
  {
    name: "Angkor Wat",
    center: [13.4125, 103.8670],
    view: [13.41245, 103.8610], // western causeway
    biome: "jungle",
    landmarks: [{ name: "Angkor Wat", at: [13.41245, 103.86696], from: 1150, build: angkor }],
  },
  {
    name: "Machu Picchu",
    center: [-13.1631, -72.5450],
    view: [-13.1631, -72.5450],
    biome: "mountains",
    landmarks: [
      { name: "Huayna Picchu", at: [-13.1564, -72.5462], from: -50e6, build: () => peak(290, 330, 0.16) },
      { name: "Machu Picchu mountain", at: [-13.1702, -72.5383], from: -50e6, build: () => peak(650, 700, 0.14) },
    ],
  },
  {
    name: "Newgrange",
    center: [53.6947, -6.4755],
    view: [53.6935, -6.4738],
    biome: "grassland",
    landmarks: [{ name: "Newgrange", at: [53.6947, -6.4755], from: -3199, build: () => mound(85, 13.5, surface("grass", 4, 1.2)) }],
  },
  {
    name: "Colosseum",
    center: [41.8902, 12.4922],
    view: [41.8902, 12.4890],
    landmarks: [{ name: "Colosseum", at: [41.8902, 12.4922], from: 80, build: colosseum }],
  },
];

function peak(height: number, radius: number, green: number) {
  const g = new THREE.ConeGeometry(radius, height, 24, 6);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 1 + 0.18 * Math.sin(p.getX(i) * 0.05) * Math.cos(p.getZ(i) * 0.04) * (0.5 - y / height);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  g.translate(0, height / 2, 0);
  const m = surface("fern", 8, 0.7 + green);
  return new THREE.Mesh(g, m);
}

// ------------------------------------------------------------------ horizon profiles
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

interface Style {
  far: (a: number) => number; // crest altitude in degrees for azimuth a (radians)
  near: (a: number) => number;
  base: [number, number, number];
  crest: [number, number, number];
  rim: [number, number, number];
  day: [number, number, number];
  ground: [number, number, number];
}

function styleFor(biome: Biome, seed: number, iceNorth: boolean): Style {
  const r = rng(seed);
  const ph = Array.from({ length: 12 }, () => r() * 6.28);
  const wave = (a: number, f: number[], amp: number[]) => f.reduce((t, fi, i) => t + amp[i] * Math.sin(a * fi + ph[i]), 0);
  // a treeline: many narrow crowns of random height
  const crowns = Array.from({ length: 360 }, () => r());
  const trees = (a: number, h: number, pointy: number) => {
    const x = (a / (Math.PI * 2)) * crowns.length;
    const i = Math.floor(x);
    const f = x - i;
    const c0 = crowns[i % crowns.length];
    const shape = pointy > 0 ? 1 - Math.abs(f - 0.5) * 2 : Math.sqrt(Math.max(0, 1 - (f - 0.5) ** 2 * 4));
    return h * (0.35 + 0.65 * c0) * Math.pow(shape, pointy > 0 ? 1.25 : 0.5);
  };
  const night = (b: number[], c: number[]) => ({ base: b as [number, number, number], crest: c as [number, number, number] });
  switch (biome) {
    case "desert":
      return {
        far: (a) => 1.6 + wave(a, [3, 7, 13], [0.8, 0.4, 0.2]),
        near: (a) => 1.6 + wave(a, [2, 5, 9], [1.8, 0.9, 0.4]),
        ...night([0.010, 0.009, 0.008], [0.050, 0.044, 0.036]),
        rim: [0.24, 0.215, 0.18], day: [0.62, 0.50, 0.36], ground: [0.006, 0.0055, 0.005],
      };
    case "savanna":
    case "grassland":
      return {
        far: (a) => 0.5 + wave(a, [2, 5, 11], [0.35, 0.2, 0.1]) + (r() < 0 ? 0 : 0) + (Math.sin(a * 37 + ph[3]) > 0.97 ? trees(a, 1.4, 0) : 0),
        near: (a) => 0.2 + wave(a, [3, 7], [0.4, 0.15]),
        ...night([0.008, 0.010, 0.008], [0.030, 0.038, 0.028]),
        rim: [0.14, 0.17, 0.12], day: [0.34, 0.42, 0.22], ground: [0.005, 0.006, 0.005],
      };
    case "forest":
      return {
        far: (a) => 0.8 + wave(a, [2, 5], [0.4, 0.2]) + trees(a * 0.3, 1.7, 0) + trees(a * 0.7, 0.8, 0),
        near: (a) => -2,
        ...night([0.004, 0.005, 0.005], [0.006, 0.008, 0.008]),
        rim: [0.05, 0.06, 0.06], day: [0.10, 0.18, 0.10], ground: [0.004, 0.005, 0.004],
      };
    case "jungle":
      return {
        far: (a) => 1.2 + wave(a, [3, 8], [0.4, 0.2]) + trees(a * 0.3, 3.0, 0) + trees(a * 0.7, 1.0, 0),
        near: (a) => -2,
        ...night([0.004, 0.006, 0.004], [0.007, 0.010, 0.007]),
        rim: [0.05, 0.07, 0.05], day: [0.10, 0.22, 0.10], ground: [0.004, 0.005, 0.004],
      };
    case "mountains":
      return {
        far: (a) => 6 + wave(a, [2, 3, 5, 9, 17], [4, 2.5, 1.5, 0.8, 0.4]),
        near: (a) => 2 + wave(a, [2, 4, 7, 13], [2.2, 1.2, 0.6, 0.3]),
        ...night([0.006, 0.007, 0.008], [0.030, 0.034, 0.040]),
        rim: [0.20, 0.22, 0.26], day: [0.32, 0.36, 0.30], ground: [0.005, 0.006, 0.006],
      };
    case "ice":
      return {
        far: (a) => 0.8 + wave(a, [2, 5], [0.5, 0.25]),
        near: (a) => 0.3 + wave(a, [3, 7], [0.3, 0.1]),
        ...night([0.040, 0.048, 0.062], [0.10, 0.12, 0.15]),
        rim: [0.30, 0.34, 0.40], day: [0.82, 0.88, 0.95], ground: [0.030, 0.036, 0.048],
      };
    case "tundra":
      return {
        // the ice sheet edge stands as a pale wall in the north
        far: (a) => {
          const north = Math.cos(a);
          return 0.4 + wave(a, [3, 7], [0.25, 0.1]) + (iceNorth ? Math.max(0, north - 0.2) * 3.2 : 0);
        },
        near: (a) => 0.2 + wave(a, [2, 5], [0.3, 0.1]),
        ...night([0.018, 0.020, 0.024], [0.060, 0.070, 0.088]),
        rim: [0.26, 0.29, 0.34], day: [0.55, 0.58, 0.55], ground: [0.012, 0.014, 0.016],
      };
    case "mesozoic":
      return {
        far: (a) => 0.5 + wave(a, [2, 5], [0.3, 0.2]) + trees(a * 0.25, 2.6, 0) * 0.8 + trees(a * 0.6, 1.3, 0) * 0.6,
        near: (a) => -2,
        ...night([0.004, 0.006, 0.004], [0.008, 0.012, 0.008]),
        rim: [0.06, 0.08, 0.05], day: [0.14, 0.26, 0.10], ground: [0.004, 0.006, 0.004],
      };
    case "cenozoic":
    default:
      return {
        far: (a) => 0.7 + wave(a, [2, 4, 9], [0.4, 0.25, 0.1]) + trees(a * 0.4, 1.6, 0) * 0.7,
        near: (a) => 0.2 + wave(a, [3, 7], [0.3, 0.1]),
        ...night([0.006, 0.008, 0.006], [0.020, 0.028, 0.018]),
        rim: [0.10, 0.13, 0.09], day: [0.30, 0.40, 0.20], ground: [0.005, 0.006, 0.005],
      };
  }
}

// ------------------------------------------------------------------ glow sprites
function glowTexture(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ the landscape
export class Landscape {
  readonly group = new THREE.Group();
  /** atmospheric haze, assigned to the ground scene by the engine */
  fog: THREE.FogExp2 | null = new THREE.FogExp2(0x05060a, 0.0022);
  private grass: THREE.InstancedMesh | null = null;
  private ridgeMats: THREE.ShaderMaterial[] = [];
  private ambient = new THREE.HemisphereLight(0x8899cc, 0x1a1a14, 0.1);
  private key = new THREE.DirectionalLight(0xdfe4ff, 0.0);
  /** distant animals of the era; can be switched off in Layers */
  showLife = false;
  private animals: { c: Creature; az: number; dist: number; dir: number; pause: number }[] = [];
  private flyers: { root: THREE.Group; wings: THREE.Mesh[]; r: number; h: number; a: number; speed: number; phase: number }[] = [];
  private snow: THREE.Points | null = null;
  private volcano: THREE.Sprite | null = null;
  private time = 0;
  info: LandscapeInfo = { biome: "forest", label: "", site: null, lightPollution: 0, urban: 0, urbanStage: "modern" };
  /** names and screen anchors of monuments in view, for labels */
  monuments: { name: string; dir: THREE.Vector3 }[] = [];
  private key_: string = "";

  constructor() {
    this.group.add(this.ambient, this.key, this.key.target);
  }

  build(lat: number, lon: number, year: number) {
    const info = describeGround(lat, lon, year);
    const visibleSet = (SITES.find((s) => s.name === info.site)?.landmarks ?? []).filter((l) => year >= l.from).map((l) => l.name).join(",");
    const key = groundKey(info, lat, lon, year, visibleSet);
    this.info = info;
    if (key === this.key_) return;
    this.key_ = key;

    for (const c of [...this.group.children]) if (c !== this.ambient && c !== this.key && c !== this.key.target) this.group.remove(c);
    this.ridgeMats = [];
    this.animals = [];
    this.flyers = [];
    this.snow = null;
    this.volcano = null;
    this.monuments = [];

    const seed = Math.round((lat + 90) * 1000) * 7919 + Math.round((lon + 180) * 1000);
    const st = styleFor(info.biome, seed, info.label.includes("north"));
    // Every ordinary place, city or not, gets the same calm horizon: smooth layered hills and a soft
    // tree line in aerial perspective. No generic buildings are ever drawn; city glow only changes the sky.
    // Only curated landmark sites get modelled geometry.
    const calm = !info.site;
    this.calmGround = null;
    this.calm = calm;
    if (calm) this.buildCalm(info, seed);
    // layered hills fading into the haze, lightest at the back
    if (!calm) {
      const rh = rng(seed + 21);
      const hp = Array.from({ length: 9 }, () => rh() * 6.28);
      const flat = ["desert", "grassland", "savanna", "tundra", "ice"].includes(info.biome) ? 0.55 : 1;
      const hills = (k: number, h: number) => (a: number) =>
        h * flat * (0.55 + 0.26 * Math.sin(a * 2 + hp[k * 3]) + 0.14 * Math.sin(a * 5 + hp[k * 3 + 1]) + 0.06 * Math.sin(a * 11 + hp[k * 3 + 2]));
      const layers: [number, [number, number, number], [number, number, number]][] = [
        [4.4, [0.024, 0.040, 0.082], [0.52, 0.63, 0.80]],
        [3.1, [0.017, 0.028, 0.058], [0.44, 0.55, 0.72]],
        [1.9, [0.011, 0.018, 0.038], [0.36, 0.46, 0.62]],
      ];
      layers.forEach(([h, col, day], k) =>
        this.ridge(99.6 - k * 0.4, -2, hills(k, h), col, col, { ...st, rim: col.map((v) => v * 1.6) as [number, number, number], day }, 0));
    }
    if (!calm) this.ridge(98, -2, st.far, st.base, st.crest, st, 0);
    if (info.biome === "tundra" && info.label.includes("north")) {
      // the Laurentide ice front, a pale wall low on the northern horizon
      const r2 = rng(seed + 11);
      const ph = r2() * 6;
      const ice = (a: number) => {
        const north = Math.cos(a);
        return north > 0.35 ? 0.6 + 2.6 * Math.pow((north - 0.35) / 0.65, 0.6) + 0.25 * Math.sin(a * 23 + ph) : -3;
      };
      this.ridge(96, -2, ice, [0.035, 0.042, 0.055], [0.15, 0.17, 0.21], { ...st, rim: [0.35, 0.38, 0.45], day: [0.85, 0.9, 0.96] }, 0);
    }
    if (!calm && st.near(0) > -1) this.ridge(70, -2, st.near, st.base.map((v) => v * 0.6) as [number, number, number], st.crest.map((v) => v * 1.25) as [number, number, number], st, 0);
    // the ground you stand on: a textured plain that fades into haze
    const groundKind0 = ({ desert: "sand", savanna: "grass", grassland: "grass", forest: "grass", jungle: "fern", mountains: "rock", ice: "snow", tundra: "tundra", mesozoic: "fern", cenozoic: "grass" } as const)[info.biome];
    const groundKind = groundKind0;
    const gmat = surface(groundKind, 900, info.biome === "desert" || info.biome === "ice" ? 0.8 : 0.6);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(300, 96), gmat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -EYE * S;
    disc.renderOrder = 1;
    if (!calm) this.group.add(disc);
    this.grass = null;
    if (!calm && ["grassland", "savanna", "tundra", "forest", "cenozoic", "mesozoic", "jungle"].includes(info.biome)) {
      // blades of grass (or fern fronds) around your feet
      const blade = new THREE.BufferGeometry();
      blade.setAttribute("position", new THREE.Float32BufferAttribute([-0.002, 0, 0, 0.002, 0, 0, 0, 0.03, 0], 3));
      blade.computeVertexNormals();
      const n = info.biome === "tundra" ? 1500 : 5000;
      const im = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({
        color: info.biome === "tundra" ? 0x6b6a52 : info.biome === "mesozoic" || info.biome === "jungle" ? 0x2c4a22 : 0x3e5a2a,
        side: THREE.DoubleSide, roughness: 1,
      }), n);
      const r = rng(seed + 5);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        const rad = 0.2 + Math.sqrt(r()) * 1.5;
        const ang = r() * Math.PI * 2;
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * Math.PI, (r() - 0.5) * 0.5));
        const sc = 0.6 + r() * 1.1;
        m4.compose(new THREE.Vector3(Math.cos(ang) * rad, -EYE * S, Math.sin(ang) * rad), q, new THREE.Vector3(sc, sc * (0.7 + r()), sc));
        im.setMatrixAt(i, m4);
      }
      im.renderOrder = 3;
      im.frustumCulled = false;
      this.group.add(im);
      this.grass = im;
    }

    // monuments, at their true bearing and distance from the viewpoint
    const site = SITES.find((s) => s.name === info.site);
    if (site) {
      const [vlat, vlon] = site.view;
      for (const lm of site.landmarks) {
        if (year < lm.from) continue;
        const east = (lm.at[1] - vlon) * Math.cos((vlat * Math.PI) / 180) * 111320;
        const north = (lm.at[0] - vlat) * 110540;
        const obj = lm.build(year);
        obj.scale.multiplyScalar(S);
        obj.position.set(east * S, -EYE * S, -north * S);
        obj.traverse((o) => {
          o.renderOrder = 2;
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false;
        });
        this.group.add(obj);
        const d = Math.hypot(east, north);
        if (d > 30) {
          const box = new THREE.Box3().setFromObject(obj);
          const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
          this.monuments.push({ name: lm.name, dir: top.normalize() });
        }
      }
    }

    // life and weather
    if (info.biome === "mesozoic") {
      const rand = rng(seed + 3);
      const ago = CURRENT_YEAR - year;
      // giant sauropods belong to the Jurassic and Early Cretaceous; the Triassic had smaller, lighter dinosaurs
      const kind = ago > 100e6 && ago < 201e6 ? "sauropod" : "theropod";
      const small = ago >= 201e6 ? 0.45 : 1;
      const skin = surface("skin", 1, 0.8);
      skin.fog = false; // ground haze is tuned for the terrain and would erase animals this far away
      const n = kind === "sauropod" ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const c = makeCreature(kind, skin);
        // kept far off, where they read as living silhouettes on the horizon
        const dist = (kind === "sauropod" ? 190 : 120) + rand() * (kind === "sauropod" ? 110 : 60);
        const az = kind === "sauropod" ? 250 + i * 7 + rand() * 4 : 50 + i * 55 + rand() * 12;
        const sc = 0.85 + rand() * 0.3;
        c.root.scale.setScalar(S * sc * small);
        c.root.traverse((o) => { o.renderOrder = 2; if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false; });
        this.group.add(c.root);
        this.animals.push({ c, az, dist, dir: kind === "sauropod" ? 1 : rand() < 0.5 ? -1 : 1, pause: rand() * 6 });
      }
      // pterosaurs wheeling overhead: about 10 m across in the latest Cretaceous, small in the Jurassic
      const span = ago > 100e6 ? 1.8 : 9.5;
      const dark = new THREE.MeshBasicMaterial({ color: 0x06070a, side: THREE.DoubleSide, fog: false });
      // pterosaurs first appear in the Late Triassic, about 228 million years ago
      for (let i = 0; i < (ago < 228e6 ? 5 : 0); i++) {
        const root = new THREE.Group();
        const wings: THREE.Mesh[] = [];
        for (const side of [1, -1]) {
          const g = new THREE.BufferGeometry();
          const h = span / 2;
          // a narrow membrane wing: shoulder, wrist, tip, trailing edge back to the body
          g.setAttribute("position", new THREE.Float32BufferAttribute([
            0.1 * h, 0, 0, 0.16 * h, 0, side * 0.42 * h, -0.16 * h, 0, 0,
            0.16 * h, 0, side * 0.42 * h, -0.02 * h, 0, side * h, -0.16 * h, 0, 0,
          ], 3));
          const w = new THREE.Mesh(g, dark);
          wings.push(w);
          root.add(w);
        }
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.035 * span, 0.3 * span, 5), dark);
        body.rotation.z = -Math.PI / 2;
        body.position.x = 0.03 * span;
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.02 * span, 0.26 * span, 4), dark);
        head.rotation.z = -Math.PI / 2;
        head.position.x = 0.3 * span;
        root.add(body, head);
        root.scale.setScalar(S);
        root.traverse((o) => { o.renderOrder = 3; if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false; });
        this.group.add(root);
        this.flyers.push({ root, wings, r: span * (15 + rand() * 10), h: span * (4 + rand() * 4), a: 0.6 + i * 0.22 + rand() * 0.1, speed: 9 + rand() * 3, phase: rand() * 6 });
      }
    }
    if (info.biome === "ice" || info.biome === "tundra") {
      const n = 1600;
      const pos = new Float32Array(n * 3);
      const r = rng(seed + 9);
      for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 30, r() * 14 - 2, (r() - 0.5) * 30], i * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.snow = new THREE.Points(g, new THREE.PointsMaterial({
        color: 0xdfe7f2, size: 0.018, map: glowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), alphaTest: 0.02,
        transparent: true, opacity: info.biome === "ice" ? 0.8 : 0.5, depthWrite: false,
      }));
      this.snow.renderOrder = 4;
      this.group.add(this.snow);
    }
  }

  /** true when the horizon is the plain layered hills, which can turn to tinted glass */
  calm = false;
  setSee(v: number) {
    for (const m of this.ridgeMats) m.uniforms.uSee.value = v;
  }
  private calmGround: { mat: THREE.MeshBasicMaterial; night: THREE.Color; day: THREE.Color } | null = null;

  /** Four smooth ridges, lighter and bluer with distance, over a plain dark ground. */
  private buildCalm(info: LandscapeInfo, seed: number) {
    const r = rng(seed + 5);
    const ph = Array.from({ length: 24 }, () => r() * 6.283);
    const b = info.biome;
    // kept low, so a Sun or Moon a degree or two up still clears the hills
    const amp = b === "mountains" ? 3.2 : b === "desert" ? 1.4 : b === "ice" || b === "tundra" ? 0.7 : 1.25;
    const lift = b === "mountains" ? 2.0 : 0.15;
    const wooded = b === "forest" || b === "jungle" || b === "savanna" || b === "grassland";
    const shape = (k: number) => (a: number) => {
      const o = k * 6;
      let h = 0.55 + 0.32 * Math.sin(a * 2 + ph[o]) + 0.18 * Math.sin(a * 3 + ph[o + 1]) + 0.09 * Math.sin(a * 7 + ph[o + 2]) + 0.035 * Math.sin(a * 13 + ph[o + 3]);
      // dunes lean one way: a long gentle face and a steeper slip face
      if (b === "desert") h += 0.12 * Math.sin(a * 9 + ph[o + 4] + 0.6 * Math.sin(a * 9 + ph[o + 4]));
      let hh = lift * (1 - k * 0.2) + (1.7 - k * 0.3) * amp * Math.max(h, 0.05);
      // a soft, low tree line on the two nearest ridges where the land is wooded: rounded crowns, no detail
      if (wooded && k >= 2) {
        const c = Math.sin(a * (k === 3 ? 260 : 420) + ph[o + 5]) * 0.5 + 0.5;
        const gap = 0.5 + 0.5 * Math.sin(a * 23 + ph[o + 4]);
        const vary = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(a * 61 + ph[o + 3]) * Math.sin(a * 17 + ph[o + 2]));
        hh += (k === 3 ? 0.42 : 0.24) * Math.sqrt(c) * vary * Math.min(1, gap * 1.8);
      }
      return hh;
    };
    const tint = b === "desert" ? [1.08, 1.0, 0.9] : b === "ice" || b === "tundra" ? [1.05, 1.08, 1.12] : [1, 1, 1];
    const t3 = (c: number[]) => c.map((v, i) => v * tint[i]) as [number, number, number];
    // far to near: night colour, daytime colour
    const layers: [number, number[], number[]][] = [
      [99.4, [0.024, 0.036, 0.070], [0.56, 0.63, 0.77]],
      [98.6, [0.015, 0.023, 0.048], [0.43, 0.50, 0.64]],
      [97.6, [0.009, 0.014, 0.031], [0.32, 0.37, 0.49]],
      [96.0, [0.005, 0.008, 0.018], [0.23, 0.26, 0.35]],
    ];
    layers.forEach(([rad, night, day], k) => {
      const n = t3(night), d = t3(day);
      const st: Style = { far: () => 0, near: () => 0, base: n, crest: n, rim: n.map((v) => v * 1.8) as [number, number, number], day: d, ground: n };
      // the nearest ridge is also the ground: it runs all the way down under your feet, darkening as it goes
      this.ridge(rad, k === 3 ? -89.9 : -2, shape(k), k === 3 ? t3([0.002, 0.003, 0.006]) : n, n.map((v) => v * 1.25) as [number, number, number], st, 0);
    });
  }

  private ridge(radius: number, baseAlt: number, crest: (a: number) => number, base: [number, number, number],
    crestCol: [number, number, number], st: Style, order: number) {
    const seg = 1440;
    const pos: number[] = [];
    const ridge: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const deg = (a * 180) / Math.PI;
      const top = altAzToWorld(crest(a), deg).multiplyScalar(radius);
      const bot = altAzToWorld(baseAlt, deg).multiplyScalar(radius);
      pos.push(top.x, top.y, top.z, bot.x, bot.y, bot.z);
      ridge.push(1, 0);
      if (i < seg) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aRidge", new THREE.Float32BufferAttribute(ridge, 1));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      vertexShader: duneVert,
      fragmentShader: duneFrag,
      side: THREE.DoubleSide,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uSee: { value: 0 },
        uBase: { value: new THREE.Color(...base) },
        uCrest: { value: new THREE.Color(...crestCol) },
        uRim: { value: new THREE.Color(...st.rim) },
        uDayCol: { value: new THREE.Color(...st.day) },
        uMoon: { value: new THREE.Vector3(0, 1, 0) },
        uMoonLight: { value: 0 },
        uDay: { value: 0 },
        uGlow: { value: new THREE.Color(0, 0, 0) },
      },
    });
    this.ridgeMats.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    this.group.add(mesh);
  }

  update(dt: number, light: { sun: THREE.Vector3; moon: THREE.Vector3 | null; moonPhase: number; day: number; glow: THREE.Color }) {
    this.time += dt;
    const moonUp = light.moon && light.moon.y > 0;
    for (const m of this.ridgeMats) {
      m.uniforms.uMoon.value.copy(light.moon ?? new THREE.Vector3(0, -1, 0));
      m.uniforms.uMoonLight.value = moonUp ? 0.25 + 0.75 * light.moonPhase : 0.15;
      m.uniforms.uDay.value = light.day;
      m.uniforms.uGlow.value.copy(light.glow);
    }
    // monuments: lit by the Sun by day, by the Moon at night, starlight otherwise
    const useSun = light.sun.y > -0.05;
    const dir = useSun ? light.sun : moonUp ? light.moon! : new THREE.Vector3(0.3, 1, 0.2);
    this.key.position.copy(dir).multiplyScalar(100);
    this.key.intensity = useSun ? 0.15 + 2.8 * light.day * light.day : moonUp ? 0.04 + 0.4 * light.moonPhase : 0.015;
    this.key.color.set(useSun ? 0xfff1dc : 0xc9d3ff);
    // fill light follows the sky: deep blue at night, bright blue by day, orange under fire
    const night = new THREE.Color(0.35, 0.42, 0.62), day = new THREE.Color(0.75, 0.85, 1.0);
    this.ambient.color.copy(night).lerp(day, light.day).add(light.glow);
    this.ambient.groundColor.setRGB(0.12 + light.glow.r * 0.5, 0.11, 0.08);
    this.ambient.intensity = 0.05 + 1.3 * light.day * light.day + light.glow.r * 1.2;
    if (this.fog) {
      const nightFog = new THREE.Color(0.012, 0.020, 0.042), dayFog = new THREE.Color(0.62, 0.72, 0.84);
      this.fog.color.copy(nightFog).lerp(dayFog, light.day).add(light.glow.clone().multiplyScalar(0.3));
    }

    if (this.calmGround) this.calmGround.mat.color.copy(this.calmGround.night).lerp(this.calmGround.day, Math.pow(light.day, 1.4)).add(light.glow.clone().multiplyScalar(0.25));
    for (const a of this.animals) a.c.root.visible = this.showLife;
    for (const f of this.flyers) f.root.visible = this.showLife;
    for (const a of this.animals) {
      // walk across the view along a circle around you, stopping now and then to graze
      a.pause -= dt;
      const walking = a.pause > 0 ? 0 : 1;
      if (a.pause < -14) a.pause = 3 + Math.random() * 6;
      a.az += ((a.dir * a.c.speed * walking * dt) / a.dist) * (180 / Math.PI);
      a.c.update(dt, walking);
      const r = (a.az * Math.PI) / 180;
      const d = a.dist * S;
      a.c.root.position.set(d * Math.sin(r), -EYE * S, -d * Math.cos(r));
      const fx = a.dir * Math.cos(r), fz = a.dir * Math.sin(r);
      a.c.root.rotation.y = Math.atan2(-fz, fx);
    }
    for (const f of this.flyers) {
      // slow circles on the wind, a few wingbeats and then a long glide
      f.a += (f.speed / f.r) * dt;
      f.phase += dt;
      const beat = Math.sin(f.phase * 0.35) > 0.55 ? Math.sin(f.phase * 5.5) : 0.25;
      f.wings[0].rotation.x = -beat * 0.5;
      f.wings[1].rotation.x = beat * 0.5;
      const y = (f.h + Math.sin(f.phase * 0.2) * f.h * 0.15 - EYE) * S;
      f.root.position.set(f.r * S * Math.sin(f.a), y, -f.r * S * Math.cos(f.a));
      f.root.rotation.set(0, -f.a, 0);
      f.root.rotateZ(0.0);
      f.root.rotateX(-0.28);
    }
    if (this.volcano) {
      const f = 0.85 + 0.15 * Math.sin(this.time * 2.3) * Math.sin(this.time * 0.7);
      this.volcano.material.opacity = f * (1 - light.day * 0.8);
    }
    if (this.snow) {
      const p = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * (0.6 + (i % 7) * 0.08);
        let x = p.getX(i) + Math.sin(this.time * 0.8 + i) * dt * 0.3;
        if (y < -2) y += 14;
        if (x > 15) x -= 30;
        p.setXY(i, x, y);
      }
      p.needsUpdate = true;
    }
  }
}
