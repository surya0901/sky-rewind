// The one rotation every sky layer shares:
//   world = A(lat) * Rz(LST) * P(epoch) * u_J2000
// P   long-term precession (Vondrak et al. 2011, from pyerfa ltpb), J2000 -> mean of date
// Rz  Earth rotation to the local sidereal angle
// A   tilt to the observer's horizon, output in three.js axes (x east, y up, z south)
//
// Sidereal angle comes from the Sun: LST = RA_sun(date) + H_sun, where H_sun is the
// Sun's hour angle (local apparent solar time - 12h). This lets the same math run in
// recorded history (H and the Sun's longitude come from Astronomy Engine) and in deep
// time (they come from season + solar hour, because clock time is unknowable there).

import * as THREE from "three";

export interface LtpTable {
  start: number;
  step: number;
  count: number;
  data: Float32Array; // 10 floats per epoch: 3x3 row-major + obliquity
}

export async function loadLtp(base = "/data"): Promise<LtpTable> {
  const [meta, buf] = await Promise.all([
    fetch(`${base}/ltp.json`).then((r) => r.json()),
    fetch(`${base}/ltp.bin`).then((r) => r.arrayBuffer()),
  ]);
  return { ...meta, data: new Float32Array(buf) };
}

export const LTP_MIN = -198000;
export const LTP_MAX = 12000;

/** Precession matrix (row major) and obliquity at a Julian epoch, interpolated and re-orthonormalised. */
export function precessionAt(t: LtpTable, epoch: number): { m: number[]; eps: number } {
  const x = (Math.min(LTP_MAX, Math.max(LTP_MIN, epoch)) - t.start) / t.step;
  const i = Math.min(t.count - 2, Math.max(0, Math.floor(x)));
  const f = x - i;
  const a = i * 10;
  const b = (i + 1) * 10;
  const m: number[] = [];
  for (let k = 0; k < 9; k++) m.push(t.data[a + k] * (1 - f) + t.data[b + k] * f);
  const eps = t.data[a + 9] * (1 - f) + t.data[b + 9] * f;
  // Gram-Schmidt on rows so the lerp stays a pure rotation
  const r0 = new THREE.Vector3(m[0], m[1], m[2]).normalize();
  let r1 = new THREE.Vector3(m[3], m[4], m[5]);
  r1 = r1.sub(r0.clone().multiplyScalar(r1.dot(r0))).normalize();
  const r2 = new THREE.Vector3().crossVectors(r0, r1);
  return { m: [r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, r2.x, r2.y, r2.z], eps };
}

/** Right ascension of the Sun (rad) on the equator of date from its ecliptic longitude. */
export function sunRA(lambda: number, eps: number): number {
  return Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
}

export interface FrameParams {
  epoch: number; // Julian epoch (years), drives precession and proper motion
  lambdaSun: number; // Sun's ecliptic longitude of date (rad)
  hourAngleSun: number; // Sun's local hour angle (rad), 0 at local noon
  latDeg: number;
  precessionOff?: boolean; // geologic mode: orientation is unknowable
}

export interface Frame {
  M: THREE.Matrix3; // J2000 unit vector -> world (three.js axes)
  lst: number; // local sidereal angle (rad)
  eps: number;
  sunWorld: THREE.Vector3;
  poleJ2000: THREE.Vector3; // north celestial pole of date, J2000 frame
}

export function buildFrame(ltp: LtpTable, p: FrameParams): Frame {
  const pre = p.precessionOff ? { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], eps: 0.40909 } : precessionAt(ltp, p.epoch);
  const P = new THREE.Matrix3().set(...(pre.m as [number, number, number, number, number, number, number, number, number]));
  const lst = sunRA(p.lambdaSun, pre.eps) + p.hourAngleSun;
  const c = Math.cos(lst);
  const s = Math.sin(lst);
  const Rz = new THREE.Matrix3().set(c, s, 0, -s, c, 0, 0, 0, 1);
  const phi = THREE.MathUtils.degToRad(p.latDeg);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  // rows: east, up, south  from (meridian-equator, east, pole)
  const A = new THREE.Matrix3().set(0, 1, 0, cp, 0, sp, sp, 0, -cp);
  const M = A.clone().multiply(Rz).multiply(P);

  // Sun on the mean equator of date, then into world
  const lam = p.lambdaSun;
  const e = pre.eps;
  const sunDate = new THREE.Vector3(Math.cos(lam), Math.sin(lam) * Math.cos(e), Math.sin(lam) * Math.sin(e));
  const sunWorld = sunDate.applyMatrix3(A.clone().multiply(Rz)).normalize();
  const poleJ2000 = new THREE.Vector3(pre.m[6], pre.m[7], pre.m[8]);
  return { M, lst, eps: pre.eps, sunWorld, poleJ2000 };
}

/** Alt/az (deg) of a world direction. Azimuth from north through east. */
export function worldToAltAz(v: THREE.Vector3): { alt: number; az: number } {
  const alt = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)));
  const az = (THREE.MathUtils.radToDeg(Math.atan2(v.x, -v.z)) + 360) % 360;
  return { alt, az };
}

export function altAzToWorld(altDeg: number, azDeg: number): THREE.Vector3 {
  const a = THREE.MathUtils.degToRad(altDeg);
  const z = THREE.MathUtils.degToRad(azDeg);
  return new THREE.Vector3(Math.cos(a) * Math.sin(z), Math.sin(a), -Math.cos(a) * Math.cos(z));
}

export function raDecToUnit(raDeg: number, decDeg: number): THREE.Vector3 {
  const a = THREE.MathUtils.degToRad(raDeg);
  const d = THREE.MathUtils.degToRad(decDeg);
  return new THREE.Vector3(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
}
