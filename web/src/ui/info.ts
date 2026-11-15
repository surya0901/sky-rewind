// Tap-to-identify card, Sky Guide style.
import * as Astronomy from "astronomy-engine";
import * as THREE from "three";
import type { Picked, SkyEngine } from "../sky/engine";
import { worldToAltAz, raDecToUnit } from "../astro/frame";
import { TYPE_NAME } from "../data/deepsky";
import { J2000, formatHour } from "../astro/time";

export interface InfoContext {
  jd: number | null; // UT, only in recorded history
  lat: number;
  lon: number;
  epochYear: number;
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

function compass(az: number) {
  return COMPASS[Math.round(az / 45) % 8];
}

function raDec(v: THREE.Vector3) {
  const ra = ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360;
  const dec = (Math.asin(THREE.MathUtils.clamp(v.z, -1, 1)) * 180) / Math.PI;
  const h = ra / 15;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60) % 60;
  return { ra, dec, text: `RA ${hh}h ${String(mm).padStart(2, "0")}m, Dec ${dec >= 0 ? "+" : "−"}${Math.abs(dec).toFixed(1)}°` };
}

/** Effective temperature from B-V (Ballesteros 2012). */
function temperature(bv: number) {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

function colourWord(bv: number) {
  if (bv < -0.1) return "blue-white";
  if (bv < 0.3) return "white";
  if (bv < 0.6) return "yellow-white";
  if (bv < 1.0) return "yellow";
  if (bv < 1.4) return "orange";
  return "red-orange";
}

function riseSet(body: Astronomy.Body, ctx: InfoContext): string | null {
  if (ctx.jd === null) return null;
  const obs = new Astronomy.Observer(ctx.lat, ctx.lon, 0);
  const start = Astronomy.MakeTime(ctx.jd - 0.5 - J2000);
  const toLocal = (t: Astronomy.AstroTime | null) => {
    if (!t) return null;
    const local = (t.ut + J2000 + ctx.lon / 360 + 0.5) % 1;
    return formatHour(local * 24);
  };
  try {
    const r = toLocal(Astronomy.SearchRiseSet(body, obs, +1, start, 1));
    const s = toLocal(Astronomy.SearchRiseSet(body, obs, -1, start, 1));
    if (!r && !s) return null;
    let hi: string | null = null;
    try {
      hi = toLocal(Astronomy.SearchHourAngle(body, obs, 0, start).time);
    } catch { /* no transit found */ }
    return `Rises ${r ?? "not today"}, ${hi ? `highest ${hi}, ` : ""}sets ${s ?? "not today"} (local solar time)`;
  } catch {
    return null;
  }
}

// Short, well-established facts only. A star with no entry simply shows none.
export const STAR_FACTS: Record<string, string> = {
  Polaris: "Currently within 1° of the north celestial pole, which makes it the North Star of our era.",
  Thuban: "Sat close to the north celestial pole in the third millennium BCE, when the Giza pyramids were built.",
  Vega: "Earth's axis will point near Vega again in roughly 12,000 years as it precesses.",
  Sirius: "The brightest star in the night sky. Its first dawn rising marked the Nile flood season in the Egyptian calendar.",
  Betelgeuse: "A red supergiant near the end of its life.",
  Rigel: "A blue supergiant and the brightest star in Orion.",
  Antares: "A red supergiant. Its name means rival of Mars, for its colour.",
  Arcturus: "The brightest star in the northern half of the sky.",
  Canopus: "The second brightest star in the night sky.",
  Spica: "Hipparchus compared Spica's position with older records and discovered precession, in the second century BCE.",
  Algol: "An eclipsing pair of stars: it dims for a few hours every 2.87 days.",
  Mizar: "Has a faint naked-eye companion, Alcor, a traditional test of eyesight.",
  Deneb: "With Vega and Altair it forms the Summer Triangle.",
  Altair: "With Vega and Deneb it forms the Summer Triangle.",
};
export const BODY_FACTS: Record<string, string> = {
  Uranus: "The first planet found with a telescope, by William Herschel in 1781. It spins tipped over on its side.",
  Neptune: "Found in 1846 where mathematics predicted it, from its pull on Uranus. Too faint to see without a telescope.",
  Sun: "The nearest star. Its light takes about 8.3 minutes to reach Earth.",
  Moon: "The pull of the Moon and Sun on Earth's equatorial bulge is what drives precession.",
  Mercury: "Never strays far from the Sun, so it is only seen low at dusk or dawn.",
  Venus: "The brightest planet. It stays near the Sun in the sky, as the evening or morning star.",
  Mars: "Its red colour comes from iron oxide dust.",
  Jupiter: "The largest planet. Its four big moons show in binoculars.",
  Saturn: "Its rings need a small telescope to see.",
};

export interface Described { title: string; sub: string; rows: string[]; visible: boolean; why?: string; source: string }

export function describe(p: Picked, engine: SkyEngine, ctx: InfoContext): Described {
  const { alt, az } = worldToAltAz(p.dir);
  const where = alt > 85 ? "Straight overhead" : `${Math.round(alt)}° up in the ${compass(az)}`;
  if (p.kind === "star") {
    const i = p.index;
    const proper = engine["catalog"].names[i];
    const des = engine["catalog"].desig[i];
    const bv = engine.starBV(i);
    const v = engine.starJ2000(i);
    const coords = raDec(v);
    const circ = coords.dec > 90 - ctx.lat ? "Never sets from here" : coords.dec < -(90 - ctx.lat) ? "Never rises from here" : null;
    // the designation ends in the constellation's Latin genitive ("α Lyrae", "α Ursae Minoris"); match it to an IAU code
    const gen = (des ?? "").trim().split(/\s+/).slice(1).map((w: string) => w.toLowerCase());
    const code = gen.length === 1 ? gen[0].slice(0, 3) : gen.length === 2 ? gen[0][0] + gen[1].slice(0, 2) : "";
    const con = code ? engine["constellations"].find((c: { id: string; name: string }) => c.id.toLowerCase() === code)?.name : undefined;
    const rows = [
      where,
      `Azimuth ${az.toFixed(0)}°, altitude ${alt.toFixed(0)}°`,
      ...(con ? [`In ${con}`] : []),
      `Magnitude ${engine.starMag(i).toFixed(2)}, ${colourWord(bv)}, about ${Math.round(temperature(bv) / 100) * 100} K from its colour`,
      `${coords.text} (J2000)`,
    ];
    if (circ) rows.push(circ);
    else if (ctx.jd !== null) {
      Astronomy.DefineStar(Astronomy.Body.Star2, coords.ra / 15, coords.dec, 1000);
      const rs = riseSet(Astronomy.Body.Star2, ctx);
      if (rs) rows.push(rs);
    }
    rows.push(`HIP ${engine["catalog"].hip[i]}`);
    return { title: proper ?? des ?? `HIP ${engine["catalog"].hip[i]}`, sub: proper && des ? des : "Star", rows, visible: alt > 0, why: proper ? STAR_FACTS[proper] : undefined, source: "Position and brightness: Hipparcos-based catalogue. Turned to this date with the precession model." };
  }
  if (p.kind === "body") {
    const b = p.body;
    const rows = [where, `Azimuth ${az.toFixed(0)}°, altitude ${alt.toFixed(0)}°`, `Magnitude ${b.mag.toFixed(1)}`];
    if (b.phase !== undefined && b.name !== "Sun") rows.push(`${Math.round(b.phase * 100)}% illuminated`);
    if (ctx.jd !== null) {
      const body = Astronomy.Body[b.name as keyof typeof Astronomy.Body] as Astronomy.Body;
      const t = Astronomy.MakeTime(ctx.jd - J2000);
      const eq = Astronomy.Equator(body, t, new Astronomy.Observer(ctx.lat, ctx.lon, 0), false, true);
      const km = eq.dist * 149597870.7;
      rows.push(b.name === "Moon" ? `${Math.round(km).toLocaleString("en-US")} km away` : `${eq.dist.toFixed(2)} AU away, light takes ${(eq.dist * 8.317).toFixed(1)} minutes`);
      const rs = riseSet(body, ctx);
      if (rs) rows.push(rs);
    }
    const sub = b.name === "Sun" ? "Star" : b.name === "Moon" ? "Earth's moon" : "Planet";
    return { title: b.name, sub, rows, visible: alt > 0, why: BODY_FACTS[b.name], source: "Position, distance and rise and set times: Astronomy Engine." };
  }
  if (p.kind === "deep") {
    const o = p.obj;
    const size = o.size >= 60 ? `about ${(o.size / 60).toFixed(o.size >= 600 ? 0 : 1)}° across` : `about ${o.size < 3 ? o.size.toFixed(1) : Math.round(o.size)} arcminutes across`;
    const rows = [where, `In ${o.con}`, `Distance ${o.dist}`, ...(o.type === "centre" ? [] : [`Magnitude ${o.mag.toFixed(1)}, ${size}`]), `${raDec(raDecToUnit(o.ra, o.dec)).text} (J2000)`];
    return { title: o.name, sub: o.id !== o.name ? `${TYPE_NAME[o.type]}, ${o.id}` : TYPE_NAME[o.type], rows, visible: alt > 0, why: o.fact, source: `Position, size and brightness: Messier and NGC catalogue values. Distance: published estimates, rounded.${o.glyph ? " The shape drawn is an illustration, not a photograph." : ""}` };
  }
  if (p.kind === "minor") {
    const m = p.m;
    const rows = [where, `About ${m.km} km across`, `Magnitude ${m.mag.toFixed(1)}${m.mag > 6.5 ? ", needs binoculars" : ""}`, `${m.r.toFixed(2)} AU from the Sun, ${m.delta.toFixed(2)} AU from Earth`, `Light takes ${(m.delta * 8.317).toFixed(0)} minutes to reach us`];
    return { title: m.name, sub: "Asteroid", rows, visible: alt > 0, why: m.name === "Ceres" ? "The largest body in the asteroid belt, and a dwarf planet. It was the first asteroid found, in 1801." : m.name === "Vesta" ? "The brightest asteroid. NASA's Dawn spacecraft orbited it in 2011 and 2012." : undefined, source: `Orbit: JPL Small-Body Database (solution ${m.orbit}), two-body motion, approximate. Brightness: IAU H-G system.` };
  }
  return { title: p.name, sub: "Historical new star", rows: [where, "A star that flared and faded within months, recorded by observers at the time"], visible: alt > 0, source: "Position from the modern remnant; brightness from historical accounts." };
}
