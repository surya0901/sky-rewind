// Regression checks for the ground model: no generic city skyline is ever built, city glow follows the
// historical era, and a place seen today then rewound to 1877 never keeps the modern ground.
import { readFileSync } from "node:fs";

// a minimal 2D canvas so the landscape textures can be built outside a browser
const ctx = new Proxy({} as Record<string, unknown>, {
  get: (_t, k) =>
    k === "createImageData" || k === "getImageData" ? (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4) })
    : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop() {} })
    : k === "measureText" ? () => ({ width: 0 })
    : () => {},
  set: () => true,
});
(globalThis as Record<string, unknown>).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { Landscape, describeGround, groundKey, setGlowCities } = await import("../src/sky/landscape");
type Row = [string, number, number, string, number];
const gaz = JSON.parse(readFileSync("public/data/gazetteer.json", "utf8")) as Row[];
setGlowCities(gaz.filter((r) => r[3] === "city" && r[4] >= 60).map((r) => [r[1], r[2], Math.pow(10, (r[4] - 20) / 10)]));

let fails = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) fails++;
};

const CHENNAI: [number, number] = [13.0827, 80.2707];
const then = describeGround(...CHENNAI, 1877);
const now = describeGround(...CHENNAI, 2026);
check(then.urban === 0 && then.lightPollution === 0, `Chennai 1877: urban ${then.urban}, light pollution ${then.lightPollution} (both must be 0)`);
check(then.urbanStage === "preindustrial", `Chennai 1877 is pre-industrial (${then.urbanStage})`);
check(now.lightPollution > 0.3, `Chennai today has modelled city glow (${now.lightPollution.toFixed(2)})`);
check(groundKey(then, ...CHENNAI, 1877) !== groundKey(now, ...CHENNAI, 2026), "Chennai 1877 and today have different ground cache keys");

// the real scenario: build modern Chennai, then rewind to 1877 on the same object
const land = new Landscape();
land.build(...CHENNAI, 2026);
const modernKids = new Set(land.group.children);
const hasPoints = (l: InstanceType<typeof Landscape>) => l.group.children.some((c) => (c as { isPoints?: boolean }).isPoints);
check(land.calm, "Modern Chennai uses the calm horizon, not a generic skyline");
check(!hasPoints(land), "Modern Chennai has no lit-window points");
land.build(...CHENNAI, 1877);
check(land.info.lightPollution === 0 && land.info.urban === 0, "After rewinding, the landscape info is the 1877 one");
check(land.group.children.every((c) => !modernKids.has(c) || c.type.endsWith("Light") || c.type === "Object3D"), "After rewinding, no ground mesh from the modern build is kept");
check(!hasPoints(land), "Chennai 1877 has no lit-window points");

// no ordinary place anywhere gets building geometry: only curated sites may
for (const [name, lat, lon] of [["New York", 40.7128, -74.006], ["Paris", 48.8566, 2.3522], ["Beijing", 39.9042, 116.4074], ["Tokyo", 35.6762, 139.6503], ["Princeton", 40.3431, -74.6551]] as [string, number, number][]) {
  const l = new Landscape();
  l.build(lat, lon, 2026);
  check(l.calm && !hasPoints(l), `${name} today: calm horizon, no skyline or windows`);
}
const giza = new Landscape();
giza.build(29.9792, 31.1342, -2560);
check(!giza.calm && giza.info.site !== null, `Giza 2560 BCE keeps its curated landmark scene (${giza.info.site})`);

if (fails) {
  console.error(`${fails} landscape check(s) failed`);
  process.exit(1);
}
console.log("All landscape checks pass.");
