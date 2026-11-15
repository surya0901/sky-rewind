// Sanity checks for the plate reconstruction (Merdith et al. 2021 model, as bundled).
// These are wide-bound consistency checks, not precise validation: each expected range is
// deliberately generous and reflects the broad, well-established position of the region.
import { readFileSync } from "node:fs";
import { Paleo } from "../src/data/paleo";
const p = new Paleo(JSON.parse(readFileSync("public/data/paleo.json", "utf8")));

let fails = 0;
const check = (name: string, lat: number, lon: number, my: number, lo: number, hi: number, why: string) => {
  const r = p.position(lat, lon, my);
  const ok = !!r && r[0] >= lo && r[0] <= hi;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(22)} ${String(my).padStart(4)} Ma -> ${r ? `${r[0].toFixed(1)}°` : "none"}  allowed ${lo}..${hi}°  (${why})`);
};
// present day must map to itself
for (const [n, la, lo] of [["Princeton", 40.343, -74.655], ["Giza", 29.979, 31.134], ["Uluru", -25.344, 131.037]] as const) {
  const r = p.position(la, lo, 0);
  const ok = !!r && Math.abs(r[0] - la) < 1 && Math.abs(((r[1] - lo + 540) % 360) - 180) < 1;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n.padEnd(22)}    0 Ma -> ${r ? `${r[0].toFixed(2)}°, ${r[1].toFixed(2)}°` : "none"}  (present day unchanged)`);
}
check("Chicxulub", 21.3, -89.6, 66, 15, 32, "Yucatan in the subtropical north at the end of the Cretaceous");
check("Hell Creek, Montana", 47.5, -106.9, 66, 42, 62, "western interior of North America, mid northern latitudes");
check("Como Bluff, Wyoming", 41.89, -106.07, 150, 25, 42, "Morrison Formation, subtropical north");
check("Princeton", 40.343, -74.655, 250, -10, 15, "eastern North America near the equator inside Pangaea");
check("Uluru", -25.344, 131.037, 100, -70, -45, "Australia still joined to Antarctica, high southern latitudes");
check("Chennai", 13.083, 80.271, 66, -45, -10, "India still in the southern hemisphere, drifting north");
check("Giza", 29.979, 31.134, 150, -10, 15, "north Africa near the equator in the Late Jurassic");
if (fails) {
  console.error(`${fails} paleogeography check(s) failed`);
  process.exit(1);
}
console.log("PASS");
