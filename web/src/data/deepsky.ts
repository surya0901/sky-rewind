// Deep-sky objects and the four largest asteroids.
// Positions are J2000 catalogue coordinates (Messier / NGC). Magnitudes and sizes are the usual
// catalogue values. Distances are rounded published values and are given as text ("about ...").
// The glyph drawn for each object is an illustration, not a photograph.
import * as Astronomy from "astronomy-engine";
import { J2000 } from "../astro/time";

export type DeepType = "spiral" | "elliptical" | "irregular" | "globular" | "open" | "nebula" | "planetary" | "remnant" | "centre" | "asteroid";

export interface DeepObject {
  id: string; // catalogue designation, also accepted by search
  name: string;
  type: DeepType;
  ra: number; // degrees, J2000
  dec: number;
  mag: number;
  size: number; // long axis, arcminutes
  ratio: number; // short axis / long axis
  pa: number; // position angle of the long axis, degrees east of north
  dist: string;
  con: string;
  fact: string;
  glyph: boolean; // false where real catalogue stars or the Milky Way image already show it
}

export const TYPE_NAME: Record<DeepType, string> = {
  spiral: "Spiral galaxy", elliptical: "Elliptical galaxy", irregular: "Irregular galaxy", globular: "Globular cluster",
  open: "Open star cluster", nebula: "Emission nebula", planetary: "Planetary nebula", remnant: "Supernova remnant",
  centre: "Centre of our galaxy", asteroid: "Asteroid",
};
export const TYPE_CODE: Record<DeepType, number> = { spiral: 0, elliptical: 1, irregular: 2, globular: 3, open: 4, nebula: 5, planetary: 6, remnant: 7, centre: 8, asteroid: 9 };

const o = (id: string, name: string, type: DeepType, ra: number, dec: number, mag: number, size: number, ratio: number, pa: number, dist: string, con: string, fact: string, glyph = true): DeepObject =>
  ({ id, name, type, ra, dec, mag, size, ratio, pa, dist, con, fact, glyph });

export const DEEP: DeepObject[] = [
  // galaxies
  o("M31", "Andromeda Galaxy", "spiral", 10.685, 41.269, 3.4, 190, 0.32, 35, "about 2.5 million light-years", "Andromeda", "The nearest large galaxy, and the farthest thing most people can see without a telescope. Its light left before our species existed."),
  o("M33", "Triangulum Galaxy", "spiral", 23.462, 30.660, 5.7, 70, 0.6, 23, "about 2.7 million light-years", "Triangulum", "The third largest galaxy of our Local Group, after Andromeda and the Milky Way."),
  o("LMC", "Large Magellanic Cloud", "irregular", 80.894, -69.756, 0.9, 645, 0.85, 0, "about 163,000 light-years", "Dorado", "A small companion galaxy of the Milky Way, visible only from southern latitudes.", false),
  o("SMC", "Small Magellanic Cloud", "irregular", 13.187, -72.829, 2.7, 320, 0.6, 45, "about 200,000 light-years", "Tucana", "A dwarf galaxy near the Milky Way. Its pulsing stars gave astronomers their first yardstick for the universe.", false),
  o("M81", "Bode's Galaxy", "spiral", 148.888, 69.065, 6.9, 27, 0.52, 157, "about 12 million light-years", "Ursa Major", "A grand spiral close enough to show its arms in small telescopes."),
  o("M82", "Cigar Galaxy", "irregular", 148.968, 69.680, 8.4, 11, 0.38, 65, "about 12 million light-years", "Ursa Major", "A galaxy forming stars at a furious rate after a close pass by its neighbour M81."),
  o("M51", "Whirlpool Galaxy", "spiral", 202.470, 47.195, 8.4, 11, 0.7, 0, "roughly 25 to 30 million light-years", "Canes Venatici", "The first galaxy in which spiral arms were seen, in 1845."),
  o("M101", "Pinwheel Galaxy", "spiral", 210.802, 54.349, 7.9, 29, 0.93, 0, "about 21 million light-years", "Ursa Major", "A large spiral galaxy seen face on."),
  o("M104", "Sombrero Galaxy", "spiral", 189.998, -11.623, 8.0, 9, 0.4, 90, "about 30 million light-years", "Virgo", "Seen almost edge on, with a dark lane of dust crossing its bright bulge."),
  o("M87", "Virgo A", "elliptical", 187.706, 12.391, 8.6, 8, 0.85, 0, "about 54 million light-years", "Virgo", "A giant elliptical galaxy. Its central black hole was the first ever imaged, in 2019."),
  o("NGC 253", "Sculptor Galaxy", "spiral", 11.888, -25.288, 7.2, 27, 0.25, 52, "about 11 million light-years", "Sculptor", "One of the brightest galaxies in the southern sky, seen nearly edge on."),
  o("NGC 5128", "Centaurus A", "elliptical", 201.365, -43.019, 6.8, 26, 0.77, 35, "about 12 million light-years", "Centaurus", "A galaxy crossed by a dark dust lane, and one of the strongest radio sources in the sky."),
  // globular clusters
  o("NGC 5139", "Omega Centauri", "globular", 201.697, -47.480, 3.9, 36, 1, 0, "about 17,000 light-years", "Centaurus", "The largest globular cluster of the Milky Way, holding millions of stars."),
  o("NGC 104", "47 Tucanae", "globular", 6.024, -72.081, 4.1, 31, 1, 0, "about 14,000 light-years", "Tucana", "A dense ball of very old stars beside the Small Magellanic Cloud."),
  o("M13", "Hercules Cluster", "globular", 250.423, 36.461, 5.8, 20, 1, 0, "about 22,000 light-years", "Hercules", "The finest globular cluster of the northern sky. The Arecibo radio message of 1974 was aimed at it."),
  o("M22", "Sagittarius Cluster", "globular", 279.100, -23.905, 5.1, 32, 1, 0, "about 10,000 light-years", "Sagittarius", "One of the nearest globular clusters, close to the direction of the galactic centre."),
  o("M5", "M5", "globular", 229.638, 2.081, 5.7, 23, 1, 0, "about 24,500 light-years", "Serpens", "Among the oldest clusters of the Milky Way, around thirteen billion years old."),
  o("M3", "M3", "globular", 205.548, 28.377, 6.2, 18, 1, 0, "about 34,000 light-years", "Canes Venatici", "Half a million stars, far above the plane of the galaxy."),
  o("M4", "M4", "globular", 245.897, -26.526, 5.6, 26, 1, 0, "about 6,000 to 7,000 light-years", "Scorpius", "One of the closest globular clusters to Earth, just west of Antares."),
  // nebulae
  o("M42", "Orion Nebula", "nebula", 83.822, -5.391, 4.0, 65, 0.9, 0, "about 1,340 light-years", "Orion", "A cloud of gas where new stars are forming now. It is the middle point of Orion's sword."),
  o("NGC 3372", "Carina Nebula", "nebula", 161.265, -59.684, 1.0, 120, 1, 0, "about 8,000 light-years", "Carina", "A vast star-forming cloud of the southern Milky Way, home to the unstable giant star Eta Carinae."),
  o("M8", "Lagoon Nebula", "nebula", 270.92, -24.38, 6.0, 90, 0.45, 90, "roughly 4,000 to 6,000 light-years", "Sagittarius", "A glowing stellar nursery toward the centre of the galaxy."),
  o("M17", "Omega Nebula", "nebula", 275.196, -16.171, 6.0, 11, 1, 0, "about 5,500 light-years", "Sagittarius", "A bright cloud of hydrogen lit by young stars hidden inside it."),
  o("M16", "Eagle Nebula", "nebula", 274.700, -13.807, 6.0, 7, 1, 0, "about 6,000 light-years", "Serpens", "Home of the Pillars of Creation, columns of gas where stars are being born."),
  o("M57", "Ring Nebula", "planetary", 283.396, 33.029, 8.8, 1.4, 0.72, 60, "about 2,500 light-years", "Lyra", "The glowing shell of gas thrown off by a dying star."),
  o("M27", "Dumbbell Nebula", "planetary", 299.901, 22.721, 7.5, 8, 0.7, 125, "about 1,300 light-years", "Vulpecula", "The first planetary nebula ever discovered, in 1764."),
  o("NGC 7293", "Helix Nebula", "planetary", 337.411, -20.837, 7.6, 16, 0.85, 0, "about 650 light-years", "Aquarius", "One of the closest planetary nebulae, a preview of the Sun's distant future."),
  o("M1", "Crab Nebula", "remnant", 83.633, 22.014, 8.4, 6, 0.67, 125, "about 6,500 light-years", "Taurus", "The wreck of the star seen to explode in 1054. A pulsar spins at its heart thirty times a second."),
  // open clusters: their real stars are already in the catalogue
  o("M45", "Pleiades", "open", 56.75, 24.117, 1.6, 110, 1, 0, "about 444 light-years", "Taurus", "A young cluster of hot blue stars, known to almost every culture on Earth.", false),
  o("Mel 25", "Hyades", "open", 66.75, 15.87, 0.5, 330, 1, 0, "about 153 light-years", "Taurus", "The nearest star cluster to the Sun. It forms the V of the Bull's face.", false),
  o("M44", "Beehive Cluster", "open", 130.1, 19.667, 3.7, 95, 1, 0, "about 600 light-years", "Cancer", "A swarm of stars that looks like a small cloud to the unaided eye.", false),
  o("NGC 869", "Double Cluster", "open", 34.75, 57.13, 4.3, 60, 1, 0, "about 7,500 light-years", "Perseus", "Two young clusters side by side in the Perseus arm of the galaxy.", false),
  o("M7", "Ptolemy's Cluster", "open", 268.463, -34.793, 3.3, 80, 1, 0, "about 980 light-years", "Scorpius", "Described by Ptolemy around the year 130.", false),
  o("M6", "Butterfly Cluster", "open", 265.083, -32.253, 4.2, 25, 1, 0, "about 1,600 light-years", "Scorpius", "A cluster whose brightest stars trace a butterfly.", false),
  o("Sgr A*", "Galactic Centre", "centre", 266.417, -29.008, 0, 60, 1, 0, "about 26,000 light-years", "Sagittarius", "The centre of the Milky Way. A black hole of four million solar masses sits here, hidden behind dust.", false),
];

// ---------------------------------------------------------------- asteroids
// Osculating elements from the JPL Small-Body Database (ssd-api.jpl.nasa.gov/sbdb.api),
// epoch JD 2461200.5, ecliptic J2000, fetched 2026-11-11. Two-body motion only, so the
// positions are approximate and drift with distance in time from the epoch.
interface Minor { name: string; e: number; a: number; i: number; node: number; peri: number; M: number; H: number; G: number; km: number; orbit: string }
const EPOCH = 2461200.5;
const MINOR: Minor[] = [
  { name: "Ceres", e: 0.0796922951, a: 2.7655526, i: 10.5880278, node: 80.2486268, peri: 73.2942145, M: 274.419346, H: 3.34, G: 0.12, km: 939, orbit: "JPL 48" },
  { name: "Vesta", e: 0.0902037438, a: 2.36136597, i: 7.14392555, node: 103.701293, peri: 151.468648, M: 81.1901561, H: 3.25, G: 0.32, km: 523, orbit: "JPL 36" },
  { name: "Pallas", e: 0.2307001, a: 2.76955901, i: 34.9327932, node: 172.886619, peri: 310.969916, M: 254.249652, H: 4.12, G: 0.11, km: 513, orbit: "JPL 74" },
  { name: "Juno", e: 0.255699984, a: 2.67098953, i: 12.9865924, node: 169.811595, peri: 247.895074, M: 262.732294, H: 5.19, G: 0.32, km: 247, orbit: "JPL 144" },
];
/** Years either side of the element epoch for which the two-body positions are shown. */
export const MINOR_SPAN_YEARS = 200;

export interface MinorState { name: string; j2000: [number, number, number]; mag: number; r: number; delta: number; km: number; orbit: string }

const D2R = Math.PI / 180;
const K_GAUSS = 0.01720209895;
const OBL = 23.4392911 * D2R;

export function minorsAt(jdUT: number): MinorState[] {
  if (Math.abs(jdUT - EPOCH) > MINOR_SPAN_YEARS * 365.25) return [];
  const time = Astronomy.MakeTime(jdUT - J2000);
  const jdTT = time.tt + J2000;
  const earth = Astronomy.HelioVector(Astronomy.Body.Earth, time);
  return MINOR.map((m) => {
    const n = K_GAUSS / Math.pow(m.a, 1.5);
    const M = m.M * D2R + n * (jdTT - EPOCH);
    let E = M;
    for (let k = 0; k < 40; k++) {
      const d = (E - m.e * Math.sin(E) - M) / (1 - m.e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-13) break;
    }
    const xo = m.a * (Math.cos(E) - m.e), yo = m.a * Math.sqrt(1 - m.e * m.e) * Math.sin(E);
    const w = m.peri * D2R, O = m.node * D2R, inc = m.i * D2R;
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
    const x = (cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo;
    const y = (sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo;
    const z = sw * si * xo + cw * si * yo;
    const p = [x, y * Math.cos(OBL) - z * Math.sin(OBL), y * Math.sin(OBL) + z * Math.cos(OBL)];
    const g = [p[0] - earth.x, p[1] - earth.y, p[2] - earth.z];
    const r = Math.hypot(p[0], p[1], p[2]), delta = Math.hypot(g[0], g[1], g[2]);
    const R = Math.hypot(earth.x, earth.y, earth.z);
    // IAU H-G phase law
    const alpha = Math.acos(Math.max(-1, Math.min(1, (r * r + delta * delta - R * R) / (2 * r * delta))));
    const t = Math.tan(alpha / 2);
    const phi1 = Math.exp(-3.33 * Math.pow(t, 0.63)), phi2 = Math.exp(-1.87 * Math.pow(t, 1.22));
    const mag = m.H + 5 * Math.log10(r * delta) - 2.5 * Math.log10((1 - m.G) * phi1 + m.G * phi2);
    return { name: m.name, j2000: [g[0] / delta, g[1] / delta, g[2] / delta] as [number, number, number], mag, r, delta, km: m.km, orbit: m.orbit };
  });
}
