// Checks the shared sky frame against Astronomy Engine's independent horizon math.
// Run: npm run test:astro
import { readFileSync } from "node:fs";
import * as Astronomy from "astronomy-engine";
import * as THREE from "three";
import { buildFrame, LtpTable, raDecToUnit, worldToAltAz } from "../src/astro/frame";
import { historicalSky } from "../src/astro/ephemeris";
import { J2000, localSolarToJD } from "../src/astro/time";

const meta = JSON.parse(readFileSync("public/data/ltp.json", "utf8"));
const bin = readFileSync("public/data/ltp.bin");
const ltp: LtpTable = { ...meta, data: new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4) };

const stars = [
  { name: "Sirius", ra: 101.2872, dec: -16.7161 },
  { name: "Vega", ra: 279.2347, dec: 38.7837 },
  { name: "Thuban", ra: 211.0973, dec: 64.3758 },
  { name: "Polaris", ra: 37.9546, dec: 89.2641 },
];

const cases = [
  { label: "Princeton, today", y: 2026, m: 11, d: 9, h: 22, lat: 40.3431, lon: -74.6551 },
  { label: "Giza, 1250 BCE", y: -1249, m: 6, d: 21, h: 22, lat: 29.9792, lon: 31.1342 },
  { label: "Giza, 2560 BCE", y: -2559, m: 3, d: 20, h: 2, lat: 29.9792, lon: 31.1342 },
  { label: "Chichen Itza, 900 CE", y: 900, m: 3, d: 21, h: 21, lat: 20.6843, lon: -88.5678 },
];

let worst = 0;
for (const c of cases) {
  const jd = localSolarToJD(c.y, c.m, c.d, c.h, c.lon);
  const hs = historicalSky(jd, c.lat, c.lon);
  const f = buildFrame(ltp, { epoch: hs.epoch, lambdaSun: hs.lambdaSun, hourAngleSun: hs.hourAngleSun, latDeg: c.lat });
  const time = Astronomy.MakeTime(jd - J2000);
  const obs = new Astronomy.Observer(c.lat, c.lon, 0);
  console.log(`\n${c.label}  (Delta T ${(hs.deltaTSeconds / 3600).toFixed(2)} h)`);
  for (const s of stars) {
    Astronomy.DefineStar(Astronomy.Body.Star1, s.ra / 15, s.dec, 1000);
    const eq = Astronomy.Equator(Astronomy.Body.Star1, time, obs, true, true);
    const ref = Astronomy.Horizon(time, obs, eq.ra, eq.dec);
    const mine = worldToAltAz(raDecToUnit(s.ra, s.dec).applyMatrix3(f.M));
    const refV = new THREE.Vector3(
      Math.cos((ref.altitude * Math.PI) / 180) * Math.sin((ref.azimuth * Math.PI) / 180),
      Math.sin((ref.altitude * Math.PI) / 180),
      -Math.cos((ref.altitude * Math.PI) / 180) * Math.cos((ref.azimuth * Math.PI) / 180),
    );
    const sep = (raDecToUnit(s.ra, s.dec).applyMatrix3(f.M).angleTo(refV) * 180) / Math.PI * 60;
    worst = Math.max(worst, sep);
    console.log(`  ${s.name.padEnd(8)} alt ${mine.alt.toFixed(2).padStart(7)}  az ${mine.az.toFixed(2).padStart(7)}   ref alt ${ref.altitude.toFixed(2).padStart(7)} az ${ref.azimuth.toFixed(2).padStart(7)}   diff ${sep.toFixed(2)}'`);
  }
}

// Pole star sanity: angle between the pole of date and Thuban / Polaris
for (const [label, epoch] of [["2800 BCE", -2799], ["today", 2026], ["12,000 BCE", -11999]] as const) {
  const f = buildFrame(ltp, { epoch, lambdaSun: 0, hourAngleSun: 0, latDeg: 45 });
  const d = (s: { ra: number; dec: number }) => ((f.poleJ2000.angleTo(raDecToUnit(s.ra, s.dec)) * 180) / Math.PI).toFixed(2);
  console.log(`pole of ${label}: Thuban ${d(stars[2])} deg, Polaris ${d(stars[3])} deg, Vega ${d(stars[1])} deg`);
}

console.log(`\nworst disagreement with Astronomy Engine: ${worst.toFixed(2)} arcmin`);
if (worst > 3) {
  console.error("FAIL: frame disagrees by more than 3 arcmin");
  process.exit(1);
}
console.log("PASS");
