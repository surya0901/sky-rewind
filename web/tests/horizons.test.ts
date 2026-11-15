// Compares the app's own pipeline (Astronomy Engine positions -> the app's sky frame -> horizon)
// with JPL Horizons, which is an independent ephemeris. Fails if any body is off by more than the
// tolerance for its era. Ancient errors are dominated by Delta T (Earth's unpredictable rotation),
// which is why the allowed error grows with age.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { buildFrame, LtpTable, worldToAltAz } from "../src/astro/frame";
import { historicalSky } from "../src/astro/ephemeris";
import { localSolarToJD } from "../src/astro/time";
import { CASES, HORIZONS } from "./horizons_cases";

const meta = JSON.parse(readFileSync("public/data/ltp.json", "utf8"));
const bin = readFileSync("public/data/ltp.bin");
const ltp: LtpTable = { ...meta, data: new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4) };
const D = Math.PI / 180;
const vec = (az: number, alt: number) => new THREE.Vector3(Math.cos(alt * D) * Math.sin(az * D), Math.sin(alt * D), -Math.cos(alt * D) * Math.cos(az * D));
// degrees. The Moon's ancient position is the weakest: its long-term acceleration is hard to model.
const tolerance = (year: number, body: string) => (year >= 1800 ? 0.1 : year >= 0 ? 0.3 : body === "Moon" && year < -1000 ? 2.0 : 1.0);

let fails = 0;
let worstModern = 0;
CASES.forEach((c, ci) => {
  const jd = localSolarToJD(c.y, c.m, c.d, c.h, c.lon);
  const hs = historicalSky(jd, c.lat, c.lon);
  const f = buildFrame(ltp, { epoch: hs.epoch, lambdaSun: hs.lambdaSun, hourAngleSun: hs.hourAngleSun, latDeg: c.lat });
  console.log(`\n${c.label}`);
  for (const [i, name, az, alt] of HORIZONS) {
    if (i !== ci) continue;
    const b = hs.bodies.find((x) => x.name === name)!;
    const w = new THREE.Vector3(...b.j2000).applyMatrix3(f.M);
    const mine = worldToAltAz(w);
    const sep = w.angleTo(vec(az, alt)) / D;
    const tol = tolerance(c.y, name);
    if (c.y >= 1800) worstModern = Math.max(worstModern, sep);
    const ok = sep <= tol;
    if (!ok) fails++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name.padEnd(8)} app alt ${mine.alt.toFixed(2).padStart(6)} az ${mine.az.toFixed(2).padStart(6)} | Horizons alt ${alt.toFixed(2).padStart(6)} az ${az.toFixed(2).padStart(6)} | off ${(sep * 60).toFixed(1)}' (limit ${tol * 60}')`);
  }
});
console.log(`\nworst modern difference from JPL Horizons: ${(worstModern * 60).toFixed(1)} arcmin`);
if (fails) {
  console.error(`${fails} body position(s) outside tolerance`);
  process.exit(1);
}
console.log("PASS");
