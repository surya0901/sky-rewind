// Dinosaurs as lit 3D bodies: a smooth hull swept along a spine curve, jointed legs
// that swing in a walk cycle. Proportions follow published skeletal reconstructions
// (sauropod ~25 m long, ~5 m at the hip; tyrannosaurid ~12 m long, ~3.8 m at the hip).
import * as THREE from "three";

interface Spec {
  spine: [number, number][]; // side view, metres: x forward (head at +x), y up
  radius: number[]; // body radius at each spine point
  widthRatio: number[]; // horizontal/vertical radius at each spine point
  legs: { x: number; z: number; y: number; thigh: number; shin: number; foot: number; hipA: number; kneeA: number; r: number; front: boolean }[];
  arms?: { x: number; y: number; z: number; len: number }[];
  stride: number; // metres per full step
}

const SAUROPOD: Spec = {
  spine: [[-14, 2.2], [-10, 3.8], [-5.5, 5.0], [-1, 5.5], [3.5, 5.7], [6.2, 7.6], [8.3, 10.6], [9.8, 12.7], [10.9, 13.5], [12.0, 13.3], [12.7, 12.9]],
  radius: [0.07, 0.55, 1.55, 2.25, 1.85, 0.95, 0.62, 0.45, 0.5, 0.36, 0.18],
  widthRatio: [0.9, 0.9, 0.95, 1.0, 0.95, 0.85, 0.8, 0.8, 0.75, 0.7, 0.7],
  legs: [
    { x: -4.6, z: 1.15, y: 4.75, thigh: 2.45, shin: 2.25, foot: 0.12, hipA: 0.03, kneeA: -0.05, r: 0.62, front: false },
    { x: -4.6, z: -1.15, y: 4.75, thigh: 2.45, shin: 2.25, foot: 0.12, hipA: 0.03, kneeA: -0.05, r: 0.62, front: false },
    { x: 3.4, z: 1.05, y: 5.1, thigh: 2.6, shin: 2.45, foot: 0.1, hipA: -0.02, kneeA: 0.03, r: 0.55, front: true },
    { x: 3.4, z: -1.05, y: 5.1, thigh: 2.6, shin: 2.45, foot: 0.1, hipA: -0.02, kneeA: 0.03, r: 0.55, front: true },
  ],
  stride: 3.6,
};

const THEROPOD: Spec = {
  spine: [[-6.6, 2.7], [-4.2, 3.35], [-1.6, 3.95], [0.5, 4.15], [2.0, 4.15], [2.9, 4.45], [3.5, 4.85], [4.3, 4.8], [5.0, 4.55], [5.45, 4.35]],
  radius: [0.05, 0.38, 0.88, 1.02, 0.86, 0.55, 0.62, 0.58, 0.42, 0.22],
  widthRatio: [0.9, 0.85, 0.85, 0.9, 0.85, 0.75, 0.62, 0.58, 0.55, 0.5],
  legs: [
    { x: -1.1, z: 0.62, y: 3.62, thigh: 1.95, shin: 1.85, foot: 0.75, hipA: 0.35, kneeA: -0.75, r: 0.42, front: false },
    { x: -1.1, z: -0.62, y: 3.62, thigh: 1.95, shin: 1.85, foot: 0.75, hipA: 0.35, kneeA: -0.75, r: 0.42, front: false },
  ],
  arms: [{ x: 2.1, y: 3.55, z: 0.45, len: 0.95 }, { x: 2.1, y: 3.55, z: -0.45, len: 0.95 }],
  stride: 3.2,
};

function hull(spec: Spec): THREE.BufferGeometry {
  const pts = spec.spine.map(([x, y]) => new THREE.Vector3(x, y, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const M = 90, N = 16;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const interp = (arr: number[], t: number) => {
    const f = t * (arr.length - 1);
    const i = Math.min(arr.length - 2, Math.floor(f));
    const u = f - i;
    const s = u * u * (3 - 2 * u);
    return arr[i] * (1 - s) + arr[i + 1] * s;
  };
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= M; i++) {
    const t = i / M;
    const c = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const nrm = new THREE.Vector3().crossVectors(side, tan).normalize();
    const r = interp(spec.radius, t);
    const w = interp(spec.widthRatio, t);
    for (let j = 0; j <= N; j++) {
      const a = (j / N) * Math.PI * 2;
      // flatter belly, rounder back
      const ry = r * (Math.sin(a) < 0 ? 0.92 : 1.0);
      const p = c.clone().addScaledVector(nrm, Math.sin(a) * ry).addScaledVector(side, Math.cos(a) * r * w);
      pos.push(p.x, p.y, p.z);
      // countershading: dark along the back, pale underneath, with soft bands down the flanks
      const upness = Math.sin(a) * 0.5 + 0.5;
      const band = 0.5 + 0.5 * Math.sin(t * 46 + Math.cos(a) * 1.5);
      const shade = (0.62 + 0.75 * (1 - upness)) * (1 - 0.3 * band * upness);
      col.push(shade * 1.02, shade, shade * 0.9);
      uv.push(t * 6, j / N);
    }
  }
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, b = a + N + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function limb(len: number, r0: number, r1: number, mat: THREE.Material) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 10, 1);
  g.translate(0, -len / 2, 0); // pivot at the top joint
  return new THREE.Mesh(g, mat);
}

export interface Creature {
  root: THREE.Group;
  update: (dt: number, walking: number) => void;
  speed: number; // metres per second
}

export function makeCreature(kind: "sauropod" | "theropod", skin: THREE.Material): Creature {
  const spec = kind === "sauropod" ? SAUROPOD : THEROPOD;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hullMat = (skin as THREE.MeshStandardMaterial).clone();
  hullMat.vertexColors = true;
  body.add(new THREE.Mesh(hull(spec), hullMat));
  // head details: eyes, and for the hunter a heavy lower jaw that works as it walks
  const tip = spec.spine[spec.spine.length - 1], neck = spec.spine[spec.spine.length - 3];
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x141008, roughness: 0.15, metalness: 0.2 });
  const headR = spec.radius[spec.radius.length - 3];
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.13, 10, 8), eyeMat);
    eye.position.set((tip[0] + neck[0]) / 2 + headR * 0.2, (tip[1] + neck[1]) / 2 + headR * 0.42, side * headR * 0.5);
    body.add(eye);
    if (kind === "theropod") {
      // brow ridge above each eye
      const brow = new THREE.Mesh(new THREE.BoxGeometry(headR * 0.7, headR * 0.16, headR * 0.22), skin);
      brow.position.copy(eye.position).add(new THREE.Vector3(0, headR * 0.2, 0));
      brow.rotation.z = -0.25;
      body.add(brow);
    }
  }
  let jaw: THREE.Group | null = null;
  if (kind === "theropod") {
    jaw = new THREE.Group();
    jaw.position.set(neck[0] + 0.1, neck[1] - headR * 0.45, 0);
    const jg = new THREE.BoxGeometry(1.2, 0.2, 0.55);
    jg.translate(0.6, -0.1, 0);
    const p = jg.getAttribute("position");
    for (let i = 0; i < p.count; i++) if (p.getX(i) > 0.7) p.setZ(i, p.getZ(i) * 0.45); // taper to the chin
    jg.computeVertexNormals();
    jaw.add(new THREE.Mesh(jg, skin));
    const teeth = new THREE.InstancedMesh(new THREE.ConeGeometry(0.035, 0.13, 5), new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.5 }), 22);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 22; i++) {
      const f = Math.floor(i / 2) / 10, side = i % 2 ? 1 : -1;
      m4.makeTranslation(0.3 + f * 0.85, 0.06, side * (0.24 - f * 0.12));
      teeth.setMatrixAt(i, m4);
    }
    jaw.add(teeth);
    body.add(jaw);
  }
  const legs: { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group; phase: number; base: number; kneeBase: number }[] = [];
  spec.legs.forEach((L, i) => {
    const hip = new THREE.Group();
    hip.position.set(L.x, L.y, L.z);
    hip.add(limb(L.thigh, L.r * (kind === "theropod" ? 1.55 : 1.1), L.r * 0.78, skin));
    const knee = new THREE.Group();
    knee.position.y = -L.thigh;
    hip.add(knee);
    knee.add(limb(L.shin, L.r * 0.78, L.r * 0.6, skin));
    const ankle = new THREE.Group();
    ankle.position.y = -L.shin;
    knee.add(ankle);
    if (L.foot > 0.3) {
      // a three-toed theropod foot pointing forward
      const foot = limb(L.foot, L.r * 0.55, L.r * 0.35, skin);
      foot.rotation.z = Math.PI / 2 - 0.08;
      ankle.add(foot);
      for (const splay of [-0.45, 0, 0.45]) {
        const toe = limb(L.foot * 0.7, L.r * 0.26, L.r * 0.06, skin);
        toe.position.set(L.foot * 0.75, -0.06, 0);
        toe.rotation.set(0, splay, Math.PI / 2 - 0.02, "YXZ");
        ankle.add(toe);
      }
    } else {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(L.r * 0.7, L.r * 0.8, 0.25, 12), skin);
      pad.position.y = -0.05;
      ankle.add(pad);
    }
    // a fore-aft swing; diagonal pairs move together for sauropods
    const phase = kind === "sauropod" ? [0, Math.PI, Math.PI, 0][i] : [0, Math.PI][i];
    hip.rotation.z = L.hipA;
    knee.rotation.z = L.kneeA;
    body.add(hip);
    legs.push({ hip, knee, ankle, phase, base: L.hipA, kneeBase: L.kneeA });
  });
  for (const A of spec.arms ?? []) {
    const sh = new THREE.Group();
    sh.position.set(A.x, A.y, A.z);
    const arm = limb(A.len, 0.14, 0.08, skin);
    arm.rotation.z = 0.9;
    sh.add(arm);
    body.add(sh);
  }
  let t = Math.random() * 10;
  let idle = Math.random() * 10;
  const speed = kind === "sauropod" ? 1.1 : 1.8;
  return {
    root,
    speed,
    update: (dt, walking) => {
      t += dt * walking * (speed / spec.stride) * Math.PI * 2;
      for (const l of legs) {
        const s = Math.sin(t + l.phase);
        l.hip.rotation.z = l.base + s * (kind === "sauropod" ? 0.22 : 0.42) * walking;
        l.knee.rotation.z = l.kneeBase - Math.max(0, Math.cos(t + l.phase)) * (kind === "sauropod" ? 0.18 : 0.55) * walking;
        l.ankle.rotation.z = -(l.hip.rotation.z + l.knee.rotation.z) * 0.6;
      }
      body.position.y = Math.abs(Math.sin(t)) * (kind === "sauropod" ? 0.06 : 0.1) * walking;
      body.rotation.y = Math.sin(t) * 0.02 * walking;
      body.rotation.z = Math.sin(t * 0.5) * 0.012;
      idle += dt;
      if (jaw) jaw.rotation.z = -0.1 - 0.16 * Math.max(0, Math.sin(idle * 0.7)) ** 4;
    },
  };
}
