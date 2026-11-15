// Comet positions checked against JPL Horizons (observer table, geocentric, astrometric RA/Dec J2000
// and distance), fetched 2026-11-11 from ssd.jpl.nasa.gov/api/horizons.api. Fails on any mismatch.
import { cometsAt } from "../src/astro/comets";

const D = Math.PI / 180;
// [label, JD (UT), comet, Horizons RA deg, Horizons Dec deg, Horizons distance AU]
const REF: [string, number, string, number, number, number][] = [
  ["Halley 240 BCE May 25", 1633907.5, "Halley's Comet", 54.71082, 35.28686, 0.64814],
  ["Halley 837 Apr 10", 2026872.0, "Halley's Comet", 242.02796, -52.24757, 0.03342],
  ["Halley 1066 Apr 24", 2110527.5, "Halley's Comet", 82.18595, 26.81652, 0.10578],
  ["Halley 1910 May 19", 2418810.6, "Halley's Comet", 55.27142, 19.85259, 0.16238],
  ["Halley 1910 May 20", 2418812.0, "Halley's Comet", 77.16064, 19.63399, 0.15136],
  ["Halley 1986 Apr 11", 2446531.5, "Halley's Comet", 224.6978, -47.21406, 0.41723],
  ["Hale-Bopp 1997 Mar 22", 2450530.0, "Comet Hale-Bopp", 3.50244, 45.63472, 1.31519],
  ["Hale-Bopp 1997 Apr 1", 2450539.5, "Comet Hale-Bopp", 26.87326, 44.5562, 1.35091],
  ["NEOWISE 2020 Jul 18", 2459048.5, "Comet NEOWISE", 130.07071, 48.18168, 0.72976],
  ["NEOWISE 2020 Jul 23", 2459053.5, "Comet NEOWISE", 156.76071, 44.73778, 0.69185],
  ["West 1976 Mar 5", 2442842.5, "Comet West", 328.48162, 6.0795, 0.83229],
];
// two-body motion around each perihelion, versus a fully perturbed ephemeris
const MAX_SEP_DEG = 1.0;
const MAX_DIST_FRAC = 0.05;

let fails = 0;
for (const [label, jd, name, ra, dec, dist] of REF) {
  const c = cometsAt(jd).find((x) => x.name === name);
  if (!c) {
    console.log(`FAIL ${label}: comet not produced`);
    fails++;
    continue;
  }
  const ref = [Math.cos(dec * D) * Math.cos(ra * D), Math.cos(dec * D) * Math.sin(ra * D), Math.sin(dec * D)];
  const sep = Math.acos(Math.min(1, c.head[0] * ref[0] + c.head[1] * ref[1] + c.head[2] * ref[2])) / D;
  const df = Math.abs(c.delta - dist) / dist;
  const ok = sep <= MAX_SEP_DEG && df <= MAX_DIST_FRAC;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(24)} off by ${sep.toFixed(2)}°  distance ${c.delta.toFixed(4)} AU vs ${dist.toFixed(4)} (${(df * 100).toFixed(1)}%)`);
}
if (fails) {
  console.error(`${fails} comet check(s) outside ${MAX_SEP_DEG}° / ${MAX_DIST_FRAC * 100}%`);
  process.exit(1);
}
console.log(`All ${REF.length} comet checks within ${MAX_SEP_DEG}° and ${MAX_DIST_FRAC * 100}% of JPL Horizons.`);
