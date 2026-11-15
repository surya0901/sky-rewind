// Recorded-history mode: real dates in, Sun geometry and planet positions out.
// Astronomy Engine handles Delta T (Earth's slowing rotation), nutation and aberration.

import * as Astronomy from "astronomy-engine";
import { J2000 } from "./time";

export const HISTORICAL_MIN = -4000; // IAU 2006 and long-term precession agree to < 1' here
export const HISTORICAL_MAX = 3000;

export type BodyName = "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn" | "Uranus" | "Neptune";
export const BODIES: BodyName[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

export interface BodyState {
  name: BodyName;
  j2000: [number, number, number]; // topocentric unit vector, J2000 equator
  mag: number;
  phase?: number; // illuminated fraction (Moon, Venus, Mercury)
  dist?: number; // AU from the observer
  umbra?: number; // Moon only: 0..1 how deep into Earth's umbra (a lunar eclipse)
  penumbra?: number;
}

export interface HistoricalSky {
  epoch: number; // Julian epoch (TT)
  lambdaSun: number; // rad
  hourAngleSun: number; // rad
  deltaTSeconds: number;
  bodies: BodyState[];
}

export function historicalSky(jdUT: number, latDeg: number, lonDeg: number): HistoricalSky {
  const time = Astronomy.MakeTime(jdUT - J2000);
  const obs = new Astronomy.Observer(latDeg, lonDeg, 0);

  const sunOfDate = Astronomy.Equator(Astronomy.Body.Sun, time, obs, true, true);
  const lambdaSun = (Astronomy.SunPosition(time).elon * Math.PI) / 180;
  const lstHours = Astronomy.SiderealTime(time) + lonDeg / 15;
  const hourAngleSun = ((lstHours - sunOfDate.ra) * Math.PI) / 12;

  const bodies: BodyState[] = BODIES.map((name) => {
    const body = Astronomy.Body[name];
    const eq = Astronomy.Equator(body, time, obs, false, true); // J2000, topocentric
    const v = eq.vec;
    const r = Math.hypot(v.x, v.y, v.z);
    let mag = name === "Sun" ? -26.7 : 0;
    let phase: number | undefined;
    if (name !== "Sun") {
      try {
        const ill = Astronomy.Illumination(body, time);
        mag = ill.mag;
        phase = ill.phase_fraction;
      } catch {
        mag = 1;
      }
    }
    let umbra: number | undefined, penumbra: number | undefined;
    if (name === "Moon") {
      // geocentric geometry of Earth's shadow cone (the 1.02 factor is the usual allowance for the atmosphere)
      const gm = Astronomy.GeoVector(Astronomy.Body.Moon, time, true), gs = Astronomy.GeoVector(Astronomy.Body.Sun, time, true);
      const dm = Math.hypot(gm.x, gm.y, gm.z), ds = Math.hypot(gs.x, gs.y, gs.z);
      const sep = (Math.acos(Math.max(-1, Math.min(1, -(gm.x * gs.x + gm.y * gs.y + gm.z * gs.z) / (dm * ds)))) * 180) / Math.PI;
      const AU = 149597870.7, R2D = 180 / Math.PI;
      const pm = Math.asin(6378.14 / (dm * AU)) * R2D, ps = 8.794 / 3600 / ds, ss = 959.63 / 3600 / ds, sm = Math.asin(1737.4 / (dm * AU)) * R2D;
      const rU = 1.02 * (pm + ps - ss), rP = 1.02 * (pm + ps + ss);
      umbra = Math.max(0, Math.min(1, (rU + sm - sep) / (2 * sm)));
      penumbra = Math.max(0, Math.min(1, (rP + sm - sep) / (2 * sm)));
    }
    return { name, j2000: [v.x / r, v.y / r, v.z / r], mag, phase, dist: eq.dist, umbra, penumbra };
  });

  return {
    epoch: 2000 + (time.tt) / 365.25,
    lambdaSun,
    hourAngleSun,
    deltaTSeconds: (time.tt - time.ut) * 86400,
    bodies,
  };
}
