// Computes precise local times for knowledge-base events (eclipses, solstices,
// conjunctions) with Astronomy Engine so the curated data is not hand-guessed.
import * as A from "astronomy-engine";
import { J2000, calendarToJD } from "../src/astro/time";

function jdToCal(jd: number) {
  // Meeus ch.7 inverse, Julian calendar before 1582-10-15
  const Z = Math.floor(jd + 0.5), F = jd + 0.5 - Z;
  let Aa = Z;
  if (Z >= 2299161) { const al = Math.floor((Z - 1867216.25) / 36524.25); Aa = Z + 1 + al - Math.floor(al / 4); }
  const B = Aa + 1524, C = Math.floor((B - 122.1) / 365.25), D = Math.floor(365.25 * C), E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + F;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  return { year, month, day };
}
function local(jdUT: number, lon: number) {
  const jl = jdUT + lon / 360; // local mean solar time
  const c = jdToCal(jl);
  const d = Math.floor(c.day);
  return { year: c.year, month: c.month, day: d, hour: +((c.day - d) * 24).toFixed(2) };
}
function eclipse(label: string, y: number, m: number, d: number, lat: number, lon: number) {
  const obs = new A.Observer(lat, lon, 0);
  const e = A.SearchLocalSolarEclipse(A.MakeTime(calendarToJD(y, m, d) - J2000), obs);
  const jd = e.peak.time.ut + J2000;
  console.log(label, JSON.stringify({ ...local(jd, lon), kind: e.kind, obscuration: +e.obscuration.toFixed(3), sunAlt: +e.peak.altitude.toFixed(1) }));
}
function season(label: string, y: number, which: "jun_solstice" | "dec_solstice" | "mar_equinox", lon: number) {
  const s = A.Seasons(y)[which];
  console.log(label, JSON.stringify(local(s.ut + J2000, lon)));
}
function conj(label: string, y: number, m: number, d: number, days: number, lat: number, lon: number) {
  let best = { sep: 999, jd: 0 };
  const j0 = calendarToJD(y, m, d);
  for (let k = 0; k < days; k++) {
    const t = A.MakeTime(j0 + k - J2000);
    const sep = A.AngleBetween(A.GeoVector(A.Body.Jupiter, t, true), A.GeoVector(A.Body.Saturn, t, true));
    if (sep < best.sep) best = { sep, jd: j0 + k };
  }
  console.log(label, JSON.stringify({ ...local(best.jd, lon), sepDeg: +best.sep.toFixed(2) }));
}
eclipse("thales_585bce", -584, 5, 1, 40.0, 35.0);
eclipse("bur_sagale_763bce", -762, 6, 1, 36.36, 43.15);
eclipse("ugarit_1223bce", -1222, 2, 20, 35.60, 35.78);
eclipse("eddington_1919", 1919, 5, 20, -3.69, -40.35);
eclipse("eclipse_2024", 2024, 4, 1, 32.78, -96.80);
eclipse("eclipse_2017", 2017, 8, 15, 36.97, -86.44);
season("stonehenge_2500bce_jun", -2499, "jun_solstice", -1.8262);
season("newgrange_3200bce_dec", -3199, "dec_solstice", -6.4755);
season("chichen_1000ce_mar", 1000, "mar_equinox", -88.5678);
conj("bethlehem_7bce_a", -6, 4, 1, 120, 31.77, 35.21);
conj("bethlehem_7bce_b", -6, 8, 15, 75, 31.77, 35.21);
conj("bethlehem_7bce_c", -6, 11, 1, 60, 31.77, 35.21);
conj("great_conj_2020", 2020, 12, 1, 40, 40.3431, -74.6551);
