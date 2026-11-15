// Comets from osculating orbital elements (J2000 ecliptic), two-body Kepler motion around
// each listed perihelion. This is an approximate two-body illustration: planetary
// perturbations within a passage are ignored. tests/comets.test.ts checks the result
// against JPL Horizons for documented dates. Each comet is only drawn within its window.
import * as Astronomy from "astronomy-engine";
import { calendarToJD, J2000 } from "./time";

interface Elements {
  q: number; // perihelion distance, AU
  e: number;
  i: number; // degrees
  node: number; // longitude of ascending node, degrees
  peri: number; // argument of perihelion, degrees
}

interface CometDef {
  name: string;
  el: Elements;
  H: number; // total magnitude parameters: m = H + 5 log Δ + K log r
  K: number;
  apparitions: [number, number, number][]; // perihelion dates (Julian calendar before 1582)
  /** separate elements for each return, with perihelion time as JD (TT), when the orbit changes between returns */
  orbits?: { el: Elements; T: number }[];
  windowDays: number;
  source: string;
}

// Halley: osculating elements for each return, from JPL Horizons (record 1P, the closest
// numbered apparition solution, ecliptic J2000, at perihelion), fetched 2026-11-11.
// Columns: year, q (AU), e, i, node, argument of perihelion, perihelion time (JD TDB).
const HALLEY: [number, number, number, number, number, number, number][] = [
  [-239,0.585401,0.967596,163.4701,30.8092,88.1095,1633907.620],[-163,0.584500,0.967700,163.7000,32.0600,89.1100,1661838.070],[-86,0.585600,0.967681,163.3401,34.0173,90.7776,1689863.962],[-11,0.587200,0.967369,163.5890,35.9040,92.5590,1717323.349],[66,0.585100,0.967550,163.5770,36.1290,92.6519,1745189.460],[141,0.583140,0.967840,163.4370,37.2190,93.6940,1772638.934],[218,0.581471,0.967979,163.5740,37.9082,94.1470,1800819.223],[295,0.575910,0.968751,163.3670,39.1110,95.2410,1828915.898],[374,0.577190,0.968586,163.5421,40.5785,96.5095,1857707.842],[451,0.573740,0.968910,163.4790,41.2100,97.0280,1885963.749],[530,0.575590,0.968708,163.3940,41.9739,97.5820,1914909.630],[607,0.580830,0.968040,163.4760,43.2610,98.7990,1942837.976],[684,0.579580,0.968150,163.4180,43.8000,99.1490,1971164.267],[760,0.581840,0.967847,163.4430,44.6869,99.9968,1998788.171],[837,0.582320,0.967810,163.4470,44.9300,100.1009,2026830.770],[912,0.580160,0.968068,163.3110,45.6462,100.7772,2054365.174],[989,0.581911,0.967888,163.3990,46.5614,101.4841,2082538.188],[1066,0.574500,0.968868,163.1120,47.6241,102.4730,2110493.434],[1145,0.574790,0.968787,163.2240,49.0541,103.7042,2139377.061],[1222,0.574210,0.968837,163.1920,49.3040,103.8489,2167664.323],[1301,0.572710,0.968916,163.0761,50.1516,104.4995,2196546.082],[1378,0.576200,0.968371,163.1130,51.0203,105.2952,2224686.187],[1456,0.579701,0.967997,162.8900,51.8658,105.8350,2253022.133],[1531,0.581200,0.967749,162.9170,53.0571,106.9761,2280492.739],[1607,0.583615,0.967489,162.9055,53.7701,107.5503,2308304.041],[1682,0.582621,0.967933,162.2649,55.5671,109.2215,2335655.779],[1759,0.584466,0.967685,162.3725,57.2458,110.7093,2363592.562],[1835,0.586563,0.967393,162.2588,57.5185,110.7043,2391598.940],[1910,0.587208,0.967296,162.2189,58.5623,111.7366,2418781.678],[1986,0.587103,0.967279,162.2422,58.8599,111.8656,2446470.959],[2061,0.592782,0.966577,161.9651,59.3923,112.0521,2474034.220]
];

export const COMETS: CometDef[] = [
  {
    name: "Halley's Comet",
    el: { q: 0.587103, e: 0.967279, i: 162.2422, node: 58.8599, peri: 111.8656 },
    H: 5.5,
    K: 10,
    apparitions: [],
    orbits: HALLEY.map(([, q, e, i, node, peri, T]) => ({ el: { q, e, i, node, peri }, T })),
    windowDays: 150,
    source: "JPL Horizons, per-return osculating elements of 1P/Halley",
  },
  {
    name: "Comet Hale-Bopp",
    el: { q: 0.914142, e: 0.995086, i: 89.429, node: 282.4703, peri: 130.5888 },
    H: -0.8,
    K: 8,
    apparitions: [[1997, 4, 1.137]],
    windowDays: 260,
    source: "JPL Small-Body Database, C/1995 O1",
  },
  {
    name: "Comet NEOWISE",
    el: { q: 0.29467, e: 0.99918, i: 128.937, node: 61.01, peri: 37.278 },
    H: 6.5,
    K: 11,
    apparitions: [[2020, 7, 3.677]],
    windowDays: 70,
    source: "JPL Small-Body Database, C/2020 F3",
  },
  {
    name: "Comet West",
    el: { q: 0.196611, e: 0.999971, i: 43.0664, node: 118.9269, peri: 358.4316 },
    H: 5.5,
    K: 11,
    apparitions: [[1976, 2, 25.2]],
    windowDays: 60,
    source: "JPL Small-Body Database, C/1975 V1",
  },
];

const K_GAUSS = 0.01720209895;
const OBL = (23.4392911 * Math.PI) / 180;
const D2R = Math.PI / 180;

export interface CometState {
  name: string;
  head: [number, number, number]; // geocentric unit vector, J2000 equator
  ionTail: [number, number, number]; // direction of the ion tail tip
  dustTail: [number, number, number]; // direction of the dust tail tip
  mag: number;
  r: number; // distance from the Sun, AU
  delta: number; // distance from Earth, AU
}

function solveKepler(M: number, e: number): number {
  let E = e > 0.8 ? Math.PI * Math.sign(M) * Math.min(1, Math.abs(M)) : M;
  if (e > 0.8 && Math.abs(M) < 0.2) E = Math.cbrt(6 * M);
  for (let k = 0; k < 80; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

/** Heliocentric position, J2000 equatorial, AU. */
function helio(el: Elements, jdTT: number, T: number): [number, number, number] {
  const a = el.q / (1 - el.e);
  const n = K_GAUSS / Math.pow(a, 1.5);
  let M = n * (jdTT - T);
  M = Math.atan2(Math.sin(M), Math.cos(M));
  const E = solveKepler(M, el.e);
  const xo = a * (Math.cos(E) - el.e);
  const yo = a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const w = el.peri * D2R, O = el.node * D2R, inc = el.i * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const x = (cO * cw - sO * sw * ci) * xo + (-cO * sw - sO * cw * ci) * yo;
  const y = (sO * cw + cO * sw * ci) * xo + (-sO * sw + cO * cw * ci) * yo;
  const z = sw * si * xo + cw * si * yo;
  // ecliptic -> equatorial
  return [x, y * Math.cos(OBL) - z * Math.sin(OBL), y * Math.sin(OBL) + z * Math.cos(OBL)];
}

const norm = (v: number[]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Comets visible near this moment, as geocentric directions with physically oriented tails. */
export function cometsAt(jdUT: number): CometState[] {
  const time = Astronomy.MakeTime(jdUT - J2000);
  const jdTT = time.tt + J2000;
  const out: CometState[] = [];
  for (const c of COMETS) {
    const passes = c.orbits ?? c.apparitions.map(([y, m, d]) => ({ el: c.el, T: calendarToJD(y, m, d) }));
    for (const { el, T } of passes) {
      if (Math.abs(jdTT - T) > c.windowDays) continue;
      const earth = Astronomy.HelioVector(Astronomy.Body.Earth, time);
      const p = helio(el, jdTT, T);
      const p1 = helio(el, jdTT - 1, T);
      const g = [p[0] - earth.x, p[1] - earth.y, p[2] - earth.z];
      const r = Math.hypot(p[0], p[1], p[2]);
      const delta = Math.hypot(g[0], g[1], g[2]);
      // tails grow as the comet nears the Sun
      const len = Math.min(0.8, 0.32 / Math.max(r, 0.25) ** 1.3);
      const away = norm(p);
      const vel = norm([p[0] - p1[0], p[1] - p1[1], p[2] - p1[2]]);
      const ionTip = [g[0] + away[0] * len, g[1] + away[1] * len, g[2] + away[2] * len];
      const curve = norm([away[0] * 0.8 - vel[0] * 0.45, away[1] * 0.8 - vel[1] * 0.45, away[2] * 0.8 - vel[2] * 0.45]);
      const dustTip = [g[0] + curve[0] * len * 0.85, g[1] + curve[1] * len * 0.85, g[2] + curve[2] * len * 0.85];
      out.push({
        name: c.name,
        head: norm(g),
        ionTail: norm(ionTip),
        dustTail: norm(dustTip),
        mag: c.H + 5 * Math.log10(delta) + c.K * Math.log10(r),
        r,
        delta,
      });
    }
  }
  return out;
}
