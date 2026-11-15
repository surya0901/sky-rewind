// "Point your phone": the sky follows the device's compass and tilt, like Sky Guide.
import * as THREE from "three";

type OrientationEvt = DeviceOrientationEvent & { webkitCompassHeading?: number };

const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // camera looks out of the back of the phone

export function phoneSupported(): boolean {
  return typeof window !== "undefined" && "DeviceOrientationEvent" in window && matchMedia("(pointer: coarse)").matches;
}

/** Ask for sensor access (iOS needs a tap and HTTPS), then stream camera orientation. */
export async function startPhone(onQuat: (q: THREE.Quaternion) => void): Promise<() => void> {
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof DOE.requestPermission === "function") {
    const res = await DOE.requestPermission();
    if (res !== "granted") throw new Error("Motion access was declined. Allow it in Safari settings to point your phone.");
  }
  const handler = (e: Event) => {
    const ev = e as OrientationEvt;
    if (ev.beta === null || ev.gamma === null) return;
    // compass-referenced alpha: iOS gives a true heading, Android's absolute event gives alpha from north
    const heading = ev.webkitCompassHeading;
    const alphaDeg = heading !== undefined ? -heading : ev.alpha ?? 0;
    const orient = ((screen.orientation?.angle ?? 0) * Math.PI) / 180;
    const q = new THREE.Quaternion();
    euler.set(THREE.MathUtils.degToRad(ev.beta), THREE.MathUtils.degToRad(alphaDeg), -THREE.MathUtils.degToRad(ev.gamma), "YXZ");
    q.setFromEuler(euler);
    q.multiply(q1);
    q.multiply(q0.setFromAxisAngle(zee, -orient));
    onQuat(q);
  };
  const evName = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  window.addEventListener(evName, handler);
  return () => window.removeEventListener(evName, handler);
}
