import * as THREE from "three";
import {
  bodyFrag, bodyVert, copyFrag, domeFrag, domeVert, duneFrag, duneVert, lineFrag, lineVert,
  polyVert, quadVert, SKY_RADIUS, starFrag, starVert, trailFrag, streakVert, streakFrag, artVert, artFrag, deepVert, deepFrag, cometVert, cometFrag,
} from "./shaders";
import { DEEP, TYPE_CODE, type DeepObject, type MinorState } from "../data/deepsky";

/** Narrowest field of view, about one arcminute: telescope power, enough to see Saturn's rings. */
export const MIN_FOV = 0.02;
// planet radii (km) and IAU north poles (RA, Dec, J2000 degrees)
const AU_KM = 149597870.7;
const RADIUS_KM: Record<string, number> = { Sun: 695700, Moon: 1737.4, Mercury: 2439.7, Venus: 6051.8, Mars: 3396.2, Jupiter: 71492, Saturn: 60268, Uranus: 25559, Neptune: 24764 };
const POLE: Record<string, [number, number]> = { Moon: [270.0, 66.54], Mercury: [281.01, 61.42], Venus: [272.76, 67.16], Mars: [317.68, 52.89], Jupiter: [268.06, 64.5], Saturn: [40.59, 83.54], Uranus: [257.31, -15.18], Neptune: [299.36, 43.46] };
const DISC_KIND: Record<string, number> = { Moon: 1, Jupiter: 2, Saturn: 3, Mars: 4, Mercury: 5, Venus: 5, Uranus: 5, Neptune: 5 };
import { altAzToWorld, worldToAltAz, Frame, raDecToUnit } from "../astro/frame";
import type { BodyState } from "../astro/ephemeris";
import type { CometState } from "../astro/comets";
import { Landscape } from "./landscape";

export interface StarCatalog {
  count: number;
  names: Record<string, string>;
  desig: Record<string, string>;
  hip: number[];
  young: number[];
  data: Float32Array; // 8 floats per star
}

export interface ConstellationLabel { id: string; name: string; ra: number; dec: number; rank: number }

export interface Layers {
  constellations: boolean;
  labels: boolean;
  milkyWay: boolean;
  trails: boolean;
  poleTrack: boolean;
  planets: boolean;
  ecliptic: boolean;
  art: boolean;
  grid: boolean;
  deep: boolean;
}

export type Picked =
  | { kind: "star"; index: number; name: string; dir: THREE.Vector3; mag: number }
  | { kind: "body"; name: string; dir: THREE.Vector3; body: BodyState }
  | { kind: "transient"; name: string; dir: THREE.Vector3 }
  | { kind: "deep"; name: string; dir: THREE.Vector3; obj: DeepObject }
  | { kind: "minor"; name: string; dir: THREE.Vector3; m: MinorState };

export interface Transient { name: string; ra: number; dec: number; mag: number }
export interface Bolide { fromAz: number; fromAlt: number; toAz: number; toAlt: number }
export interface Meteors { radiantRa: number; radiantDec: number; perMinute: number }

export interface SkyState {
  frame: Frame;
  years: number; // epoch - 2000 for proper motion
  bodies: BodyState[] | null;
  scatter: number;
  hideYoung: boolean;
  day: number; // 0..1
  limitMag: number;
  transient: Transient | null;
  eclipse: number;
  comets: CometState[];
  minors?: MinorState[];
  lightPollution: number;
}

const BODY_STYLE: Record<string, { color: [number, number, number]; size: number }> = {
  Sun: { color: [1.0, 0.95, 0.85], size: 34 },
  Moon: { color: [0.93, 0.91, 0.86], size: 22 },
  Mercury: { color: [0.92, 0.86, 0.78], size: 5 },
  Venus: { color: [1.0, 0.98, 0.92], size: 8 },
  Mars: { color: [1.0, 0.72, 0.55], size: 6 },
  Jupiter: { color: [1.0, 0.94, 0.84], size: 7 },
  Saturn: { color: [0.98, 0.90, 0.74], size: 6 },
  Uranus: { color: [0.74, 0.92, 0.95], size: 4 },
  Neptune: { color: [0.55, 0.68, 1.0], size: 4 },
};
const MINOR_BASE = 10; // body slots: 9 Sun, Moon and planets, 1 new star, then asteroids
const TRANSIENT = 9;

export class SkyEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  private skyScene = new THREE.Scene();
  private groundScene = new THREE.Scene();
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private trailMat: THREE.ShaderMaterial;
  private copyMat: THREE.ShaderMaterial;
  private rtSky: THREE.WebGLRenderTarget;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;

  private starMat: THREE.ShaderMaterial;
  private lineMat: THREE.ShaderMaterial;
  private poleMat: THREE.ShaderMaterial;
  private domeMat: THREE.ShaderMaterial;
  readonly landscape = new Landscape();
  private cometGeo!: THREE.BufferGeometry;
  private flashEl: HTMLDivElement;
  private fireball!: THREE.Sprite;
  /** impact sequence clock (s), scale 0..1, -1 when idle */
  private impactT = -1;
  private impactScale = 0;
  private impactDir = new THREE.Vector3(0, 0, -1);
  private shake = new THREE.Vector2();
  /** 0..1 dust that dims the stars after a big impact (read by the app) */
  dust = 0;
  private bodyGeo: THREE.BufferGeometry;
  private deepGeo!: THREE.BufferGeometry;
  private cometBodyGeo!: THREE.BufferGeometry;
  private deepMat!: THREE.ShaderMaterial;
  private maxPoint = 256;
  /** sprite size (CSS px) of each deep-sky glyph this frame, for picking */
  private deepPx: number[] = [];
  /** how many magnitudes zooming in adds, like looking through binoculars or a telescope */
  get canvas() {
    return this.renderer.domElement;
  }
  get zoomBoost() {
    return Math.max(0, 2.5 * Math.log10(70 / this.camera.fov)) * 1.5;
  }
  private bodyMat: THREE.ShaderMaterial;
  private lines: THREE.LineSegments;
  private pole: THREE.Line;
  private bodies: THREE.Points;
  private fx: THREE.Points; // bolide and meteors
  private fxGeo: THREE.BufferGeometry;
  private fxMat: THREE.ShaderMaterial;

  yaw = 0; // radians, 0 = north
  pitch = THREE.MathUtils.degToRad(28);
  fov = 70;
  private targetYaw: number | null = null;
  private targetPitch: number | null = null;

  private decay = 0;
  private lastM = new THREE.Matrix3();
  state: SkyState | null = null;
  private labelsEl: HTMLElement;
  private labelPool: HTMLDivElement[] = [];
  layers: Layers = { constellations: true, labels: true, milkyWay: true, trails: true, poleTrack: false, planets: true, ecliptic: false, art: false, grid: false, deep: true };
  /** forces long-exposure decay during the cinematic rewind */
  trailBoost = 0;
  /** 0..1, hides labels and figures while the sky is rewinding */
  quiet = 0;
  private time = 0;
  /** solid: the landscape hides what is below the horizon. glass: look down through the Earth. space: no ground at all */
  groundMode: "auto" | "solid" | "glass" | "space" = "auto";
  /** auto keeps the landscape until you tilt down past it, then lets you look through */
  private effGround(): "solid" | "glass" | "space" {
    return this.groundMode === "auto" ? (this.pitch < (this.landscape.calm ? -0.1 : -0.2) ? "glass" : "solid") : this.groundMode;
  }
  private uBelow = { value: 0 };
  /** 0..1 how see-through the plain hills are right now */
  private see = 0;
  private ecliptic!: THREE.LineSegments;
  /** extra rotation of the whole sky while time is rewinding: radians about slideAxis */
  slide = 0;
  slideAxis = new THREE.Vector3(0, 1, 0);
  /** 0..1 blue glow and brighter stars during the rewind */
  rewind = 0;
  private lastSlide = 0;
  private lastFullM = new THREE.Matrix3();
  private lastFullValid = false;
  private streakMat!: THREE.ShaderMaterial;
  private streaks!: THREE.LineSegments;
  private artMat: THREE.ShaderMaterial | null = null;
  private art: THREE.Mesh | null = null;
  private grid!: THREE.LineSegments;
  private common!: { uM: { value: THREE.Matrix3 }; uYears: { value: number }; uScatter: { value: number } };

  private bolide: Bolide | null = null;
  private bolideT = -1;
  private meteors: Meteors | null = null;
  private meteorList: { start: THREE.Vector3; dir: THREE.Vector3; t: number; len: number; life: number }[] = [];

  constructor(
    private host: HTMLElement,
    private catalog: StarCatalog,
    private lineIdx: Uint16Array,
    private constellations: ConstellationLabel[],
    milkyWay: THREE.Texture,
    polePath: THREE.Vector3[],
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
    host.appendChild(this.renderer.domElement);
    this.labelsEl = document.createElement("div");
    this.labelsEl.className = "sky-labels";
    host.appendChild(this.labelsEl);

    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 1000);
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    this.rtSky = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, depthBuffer: false });
    this.rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);

    const common = {
      uM: { value: new THREE.Matrix3() },
      uYears: { value: 0 },
      uScatter: { value: 0 },
      uBelow: this.uBelow,
    };

    this.common = common;
    // ---- dome
    milkyWay.wrapS = THREE.RepeatWrapping;
    // the ESO photograph carries fine star detail: mipmaps keep it smooth when zoomed out
    milkyWay.minFilter = THREE.LinearMipmapLinearFilter;
    milkyWay.generateMipmaps = true;
    milkyWay.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: domeVert,
      fragmentShader: domeFrag,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uM: common.uM, uMilkyWay: { value: milkyWay }, uMilkyWayOn: { value: 1 },
        uSun: { value: new THREE.Vector3(0, -1, 0) }, uMoon: { value: new THREE.Vector3(0, -1, 0) }, uMoonGlow: { value: 0 },
        uDay: { value: 0 }, uEclipse: { value: 0 },
        uLight: { value: 0 }, uImpact: { value: 0 }, uImpactDir: { value: new THREE.Vector3(0, 0, -1) }, uRewind: { value: 0 }, uBelow: this.uBelow, uVeil: { value: 0 },
      },
    });
    this.skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS * 1.2, 64, 32), this.domeMat));

    // ---- stars
    const n = catalog.count;
    const pos = new Float32Array(n * 3);
    const pm = new Float32Array(n * 3);
    const mag = new Float32Array(n);
    const bv = new Float32Array(n);
    const young = new Float32Array(n);
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      pos.set([catalog.data[o], catalog.data[o + 1], catalog.data[o + 2]], i * 3);
      pm.set([catalog.data[o + 3], catalog.data[o + 4], catalog.data[o + 5]], i * 3);
      mag[i] = catalog.data[o + 6];
      bv[i] = catalog.data[o + 7];
      const s = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2);
      seed.set([s.x, s.y, s.z], i * 3);
    }
    for (const i of catalog.young) young[i] = 1;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute("aPM", new THREE.BufferAttribute(pm, 3));
    starGeo.setAttribute("aMag", new THREE.BufferAttribute(mag, 1));
    starGeo.setAttribute("aBV", new THREE.BufferAttribute(bv, 1));
    starGeo.setAttribute("aYoung", new THREE.BufferAttribute(young, 1));
    starGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: starVert,
      fragmentShader: starFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...common,
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uLimitMag: { value: 6.5 },
        uHideYoung: { value: 0 },
        uFovScale: { value: 1 },
        uTime: { value: 0 },
        uRewind: { value: 0 },
        uMotion: { value: 0 },
      },
    });
    const stars = new THREE.Points(starGeo, this.starMat);
    stars.frustumCulled = false;
    this.skyScene.add(stars);

    // ---- streaks: a segment per star from its previous to its current position
    {
      const dup = (src: Float32Array, size: number) => {
        const out = new Float32Array(src.length * 2);
        for (let i = 0; i < src.length / size; i++) for (let e = 0; e < 2; e++) for (let c = 0; c < size; c++) out[(i * 2 + e) * size + c] = src[i * size + c];
        return out;
      };
      // only the brightest stars streak, so the trails are a handful of ribbons and cheap to draw many times
      const keep: number[] = [];
      for (let i = 0; i < n; i++) if (mag[i] < 2.4) keep.push(i);
      const pick = (src: Float32Array, size: number) => {
        const out = new Float32Array(keep.length * size);
        keep.forEach((i, k) => out.set(src.subarray(i * size, i * size + size), k * size));
        return out;
      };
      const nb = keep.length;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(dup(pick(pos, 3), 3), 3));
      g.setAttribute("aPM", new THREE.BufferAttribute(dup(pick(pm, 3), 3), 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(dup(pick(seed, 3), 3), 3));
      g.setAttribute("aMag", new THREE.BufferAttribute(dup(pick(mag, 1), 1), 1));
      g.setAttribute("aBV", new THREE.BufferAttribute(dup(pick(bv, 1), 1), 1));
      const end = new Float32Array(nb * 2);
      for (let i = 0; i < nb; i++) end[i * 2 + 1] = 1;
      g.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
      this.streakMat = new THREE.ShaderMaterial({
        vertexShader: streakVert, fragmentShader: streakFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: {
          ...common, uMPrev: { value: new THREE.Matrix3() }, uLimitMag: { value: 6.5 }, uStreak: { value: 0 },
          uOff: { value: new THREE.Vector2() }, uMagCut: { value: 2.3 }, uWeight: { value: 1 },
        },
      });
      this.streaks = new THREE.LineSegments(g, this.streakMat);
      this.streaks.frustumCulled = false;
      this.streaks.visible = false;
      this.skyScene.add(this.streaks);
      // brighter stars get wider, softer trails: the same segments drawn again to each side, fading outward,
      // so every arc has a glowing core and a soft edge rather than a hard bar
      // only the brightest stars streak, as a handful of long luminous ribbons; the rest fade into the glow
      for (const [px, cut, w, ax] of [1, 2, 3, 5, 7].flatMap((p, i) => [-p, p].flatMap((q) => [0, 1].map((a) => [q, [2.3, 2.3, 1.6, 1.0, 0.4][i], [0.6, 0.38, 0.22, 0.11, 0.05][i], a])))) {
        const m = this.streakMat.clone();
        m.uniforms = { ...this.streakMat.uniforms, uOff: { value: new THREE.Vector2(0, px) }, uMagCut: { value: cut }, uWeight: { value: w } };
        const l = new THREE.LineSegments(g, m);
        l.frustumCulled = false;
        l.userData.px = px;
        l.userData.ax = ax;
        this.streaks.add(l);
      }
    }

    // ---- the ecliptic: the path of the Sun, Moon and planets, as a dotted golden arc right round the sky
    {
      const pts: number[] = [];
      const eps = THREE.MathUtils.degToRad(23.4393), R = SKY_RADIUS * 0.998;
      for (let i = 0; i < 360; i += 2) {
        for (const L of [i, i + 0.9]) {
          const l = THREE.MathUtils.degToRad(L);
          pts.push(Math.cos(l) * R, Math.sin(l) * Math.cos(eps) * R, Math.sin(l) * Math.sin(eps) * R);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      this.ecliptic = new THREE.LineSegments(g, new THREE.ShaderMaterial({
        vertexShader: polyVert, fragmentShader: lineFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uM: common.uM, uBelow: this.uBelow, uColor: { value: new THREE.Color(0.95, 0.78, 0.38) }, uOpacity: { value: 0.6 } },
      }));
      this.ecliptic.frustumCulled = false;
      this.skyScene.add(this.ecliptic);
    }

    // ---- altitude and azimuth grid, fixed to the ground
    {
      const pts: number[] = [];
      const R = SKY_RADIUS * 0.997;
      const P = (alt: number, az: number) => { const v = altAzToWorld(alt, az); pts.push(v.x * R, v.y * R, v.z * R); };
      for (let alt = 15; alt <= 75; alt += 15) for (let az = 0; az < 360; az += 3) { P(alt, az); P(alt, az + 3); }
      for (let az = 0; az < 360; az += 30) for (let alt = 0; alt < 87; alt += 3) { P(alt, az); P(alt + 3, az); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      this.grid = new THREE.LineSegments(g, new THREE.ShaderMaterial({
        vertexShader: polyVert, fragmentShader: lineFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uM: { value: new THREE.Matrix3() }, uColor: { value: new THREE.Color(0.45, 0.6, 0.9) }, uOpacity: { value: 0.16 } },
      }));
      this.grid.frustumCulled = false;
      this.skyScene.add(this.grid);
    }

    // ---- constellation lines share the star attributes
    const lineGeo = new THREE.BufferGeometry();
    for (const k of ["position", "aPM", "aSeed"]) lineGeo.setAttribute(k, starGeo.getAttribute(k));
    lineGeo.setIndex(new THREE.BufferAttribute(lineIdx, 1));
    this.lineMat = new THREE.ShaderMaterial({
      vertexShader: lineVert,
      fragmentShader: lineFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...common, uColor: { value: new THREE.Color(0.62, 0.68, 0.78) }, uOpacity: { value: 0.26 } },
    });
    this.lines = new THREE.LineSegments(lineGeo, this.lineMat);
    this.lines.frustumCulled = false;
    this.skyScene.add(this.lines);

    // ---- precession circle of the pole
    const poleGeo = new THREE.BufferGeometry().setFromPoints(polePath);
    this.poleMat = new THREE.ShaderMaterial({
      vertexShader: polyVert,
      fragmentShader: lineFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uM: common.uM, uColor: { value: new THREE.Color(0.84, 0.77, 0.6) }, uOpacity: { value: 0.55 } },
    });
    this.pole = new THREE.Line(poleGeo, this.poleMat);
    this.pole.frustumCulled = false;
    this.skyScene.add(this.pole);

    // ---- Sun, Moon, planets, transient star
    const nb = MINOR_BASE + 6;
    this.bodyGeo = new THREE.BufferGeometry();
    this.bodyGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nb * 3), 3));
    this.bodyGeo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(nb), 1));
    this.bodyGeo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(nb * 3), 3));
    this.bodyGeo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(nb), 1));
    this.bodyGeo.setAttribute("aIsMoon", new THREE.BufferAttribute(new Float32Array(nb), 1));
    this.bodyGeo.setAttribute("aDisc", new THREE.BufferAttribute(new Float32Array(nb), 1));
    this.bodyGeo.setAttribute("aLight", new THREE.BufferAttribute(new Float32Array(nb * 3), 3));
    this.bodyGeo.setAttribute("aPole", new THREE.BufferAttribute(new Float32Array(nb * 3), 3));
    {
      const gl = this.renderer.getContext();
      const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | number[];
      this.maxPoint = (range && range[1]) || 256;
    }
    this.bodyMat = new THREE.ShaderMaterial({
      vertexShader: bodyVert,
      fragmentShader: bodyFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uFovScale: { value: 1 },
        uSunView: { value: new THREE.Vector3(0, 0, 1) },
        uMoonDark: { value: 0.06 },
        uCorona: { value: 0 },
      },
    });
    this.bodies = new THREE.Points(this.bodyGeo, this.bodyMat);
    this.bodies.frustumCulled = false;
    this.skyScene.add(this.bodies);

    // ---- galaxies, nebulae and clusters
    {
      const n = DEEP.length;
      this.deepGeo = new THREE.BufferGeometry();
      this.deepGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      for (const [k, w] of [["aSize", 1], ["aAlpha", 1], ["aType", 1], ["aRatio", 1], ["aAngle", 1], ["aSeed", 1]] as [string, number][]) {
        this.deepGeo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n * w), w));
      }
      const T = this.deepGeo.getAttribute("aType") as THREE.BufferAttribute;
      const R = this.deepGeo.getAttribute("aRatio") as THREE.BufferAttribute;
      const Sd = this.deepGeo.getAttribute("aSeed") as THREE.BufferAttribute;
      DEEP.forEach((o, i) => {
        T.setX(i, o.glyph ? TYPE_CODE[o.type] : 99);
        R.setX(i, o.ratio);
        Sd.setX(i, (i * 0.6180339) % 1);
      });
      this.deepMat = new THREE.ShaderMaterial({
        vertexShader: deepVert,
        fragmentShader: deepFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uPixelRatio: { value: this.renderer.getPixelRatio() } },
      });
      const pts = new THREE.Points(this.deepGeo, this.deepMat);
      pts.frustumCulled = false;
      pts.renderOrder = -1;
      this.skyScene.add(pts);
    }

    // ---- effects: bolide head and meteor streaks as sprites
    const nf = 400;
    this.fxGeo = new THREE.BufferGeometry();
    this.fxGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nf * 3), 3));
    this.fxGeo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(nf), 1));
    this.fxGeo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(nf * 3), 3));
    this.fxGeo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(nf), 1));
    this.fxGeo.setAttribute("aIsMoon", new THREE.BufferAttribute(new Float32Array(nf), 1));
    this.fxMat = this.bodyMat.clone();
    this.fxMat.blending = THREE.AdditiveBlending;
    this.fxMat.uniforms = this.bodyMat.uniforms;
    this.fx = new THREE.Points(this.fxGeo, this.fxMat);
    this.fx.frustumCulled = false;
    this.skyScene.add(this.fx);

    // ---- comets: head plus ion and dust tails as soft sprites
    const nc = 600;
    this.cometGeo = new THREE.BufferGeometry();
    this.cometGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nc * 3), 3));
    this.cometGeo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(nc), 1));
    this.cometGeo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(nc * 3), 3));
    this.cometGeo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(nc), 1));
    this.cometGeo.setAttribute("aIsMoon", new THREE.BufferAttribute(new Float32Array(nc), 1));
    const comets = new THREE.Points(this.cometGeo, this.fxMat);
    comets.frustumCulled = false;
    this.skyScene.add(comets);
    // photographic comet bodies: one textured patch per comet, drawn in angular coordinates
    {
      const nq = 4;
      this.cometBodyGeo = new THREE.BufferGeometry();
      this.cometBodyGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nq * 4 * 3), 3));
      this.cometBodyGeo.setAttribute("aAng", new THREE.BufferAttribute(new Float32Array(nq * 4 * 2), 2));
      this.cometBodyGeo.setAttribute("aShape", new THREE.BufferAttribute(new Float32Array(nq * 4 * 4), 4));
      this.cometBodyGeo.setAttribute("aBright", new THREE.BufferAttribute(new Float32Array(nq * 4), 1));
      const idx: number[] = [];
      for (let q = 0; q < nq; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
      this.cometBodyGeo.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        vertexShader: cometVert,
        fragmentShader: cometFrag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uBelow: this.uBelow },
      });
      const mesh = new THREE.Mesh(this.cometBodyGeo, mat);
      mesh.frustumCulled = false;
      this.skyScene.add(mesh);
    }

    this.flashEl = document.createElement("div");
    this.flashEl.className = "impact-flash";
    host.appendChild(this.flashEl);

    // ---- dunes (drawn after the trail composite so they stay crisp)
    this.buildGround();

    // ---- post: trail accumulation and display
    this.trailMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: trailFrag,
      uniforms: { uCurrent: { value: null }, uHistory: { value: null }, uDecay: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    });
    this.copyMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: copyFrag,
      uniforms: { uTex: { value: null } },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.trailMat);
    this.quadScene.add(this.quad);

    this.bindControls();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** Constellation figures: each is a patch of sky mapped from its drawing by three anchor stars. */
  setArt(tex: THREE.Texture, data: { cols: number; rows: number; figures: { id: string; tile: number; A: number[] }[] }) {
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const G = 12;
    const pos: number[] = [], uv: number[] = [], cen: number[] = [], idx: number[] = [];
    const v = new THREE.Vector3();
    for (const f of data.figures) {
      const A = new THREE.Matrix3().set(f.A[0], f.A[1], f.A[2], f.A[3], f.A[4], f.A[5], f.A[6], f.A[7], f.A[8]);
      const c = new THREE.Vector3(0.5, 0.5, 1).applyMatrix3(A).normalize();
      const col = f.tile % data.cols, row = Math.floor(f.tile / data.cols);
      const base = pos.length / 3;
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
        const s = i / G, t = j / G;
        v.set(s, t, 1).applyMatrix3(A).normalize();
        pos.push(v.x, v.y, v.z);
        cen.push(c.x, c.y, c.z);
        const pad = 0.004;
        uv.push((col + pad + s * (1 - 2 * pad)) / data.cols, 1 - (row + pad + t * (1 - 2 * pad)) / data.rows);
      }
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const a = base + j * (G + 1) + i, b = a + G + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("aCenter", new THREE.Float32BufferAttribute(cen, 3));
    g.setIndex(idx);
    this.artMat = new THREE.ShaderMaterial({
      vertexShader: artVert, fragmentShader: artFrag, transparent: true, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: {
        uM: this.common.uM, uBelow: this.uBelow, uArt: { value: tex }, uOpacity: { value: 0 }, uView: { value: new THREE.Vector3(0, 0, -1) },
        uTexel: { value: new THREE.Vector2(1.4 / (data.cols * 256), 1.4 / (data.rows * 256)) },
      },
    });
    this.art = new THREE.Mesh(g, this.artMat);
    this.art.frustumCulled = false;
    this.skyScene.add(this.art);
  }

  /** The brightest named star at least minAlt degrees up right now. */
  brightestNamed(minAlt = 12): { name: string; index: number; dir: THREE.Vector3; mag: number } | null {
    const s = this.state;
    if (!s || s.scatter > 0) return null;
    let best: { name: string; index: number; dir: THREE.Vector3; mag: number } | null = null;
    const sinMin = Math.sin(THREE.MathUtils.degToRad(minAlt));
    for (const [k, name] of Object.entries(this.catalog.names)) {
      const i = Number(k), mag = this.catalog.data[i * 8 + 6];
      if (mag > s.limitMag || (best && mag >= best.mag)) continue;
      const dir = this.starWorld(i);
      if (dir.y > sinMin) best = { name, index: i, dir, mag };
    }
    return best;
  }

  /** The best-placed major constellation: the highest one in the sky right now. */
  highConstellation(): { name: string; dir: THREE.Vector3; ra: number; dec: number } | null {
    const s = this.state;
    if (!s || s.scatter > 0) return null;
    let best: { name: string; dir: THREE.Vector3; ra: number; dec: number } | null = null;
    for (const c of this.constellations) {
      if (c.rank > 1) continue;
      const dir = raDecToUnit(c.ra, c.dec).applyMatrix3(s.frame.M);
      if (dir.y > 0.42 && (!best || dir.y > best.dir.y)) best = { name: c.name, dir, ra: c.ra, dec: c.dec };
    }
    return best;
  }

  /** World direction of a fixed J2000 position (degrees). */
  worldOf(raDeg: number, decDeg: number): THREE.Vector3 | null {
    return this.state ? raDecToUnit(raDeg, decDeg).applyMatrix3(this.state.frame.M) : null;
  }

  /** Every named star with its magnitude and current altitude and azimuth (degrees). */
  namedStars(): { name: string; mag: number; alt: number; az: number }[] {
    if (!this.state) return [];
    return Object.entries(this.catalog.names).map(([i, name]) => ({ name, mag: this.catalog.data[Number(i) * 8 + 6], ...worldToAltAz(this.starWorld(Number(i))) }));
  }

  /** How many catalogue stars are above the horizon and at least as bright as the given magnitude. */
  countVisible(limitMag: number): number {
    const s = this.state;
    if (!s) return 0;
    const d = this.catalog.data, e = s.frame.M.elements;
    let n = 0;
    for (let i = 0; i < this.catalog.count; i++) {
      const o = i * 8;
      if (d[o + 6] > limitMag) continue;
      if (e[1] * d[o] + e[4] * d[o + 1] + e[7] * d[o + 2] > 0.035) n++;
    }
    return n;
  }

  /** The named star nearest a J2000 direction (catalogue positions, no proper motion). */
  nearestNamed(dir: THREE.Vector3, maxMag = 4): { name: string; sep: number } | null {
    const d = this.catalog.data;
    let best: { name: string; sep: number } | null = null;
    for (const [k, name] of Object.entries(this.catalog.names)) {
      const o = Number(k) * 8;
      if (d[o + 6] > maxMag) continue;
      const sep = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dir.x * d[o] + dir.y * d[o + 1] + dir.z * d[o + 2], -1, 1)));
      if (!best || sep < best.sep) best = { name, sep };
    }
    return best;
  }

  private minPitch() {
    return this.groundMode === "solid" ? -0.15 : -Math.PI / 2 + 0.02;
  }
  setGroundMode(m: SkyEngine["groundMode"]) {
    this.groundMode = m;
    if (m === "solid") this.pitch = Math.max(this.pitch, -0.15);
  }

  /**
   * Fix the axis the sky slides around. Given a latitude, it is the visible celestial pole, so the stars wheel
   * in true concentric circles as in a long-exposure photograph (the time-rewind look). Otherwise it is the
   * camera's own up, leaned back, so a drag sweeps the stars sideways in wide arcs.
   */
  captureSlideAxis(poleLat?: number) {
    if (poleLat !== undefined) {
      this.slideAxis.copy(altAzToWorld(Math.abs(poleLat), poleLat >= 0 ? 0 : 180)).normalize();
      if (poleLat < 0) this.slideAxis.negate();
      return;
    }
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.slideAxis.copy(up.multiplyScalar(Math.cos(0.32)).addScaledVector(fwd, -Math.sin(0.32))).normalize();
  }
  resetSlide() {
    this.slide = 0;
    this.lastSlide = 0;
  }

  private buildGround() {
    this.groundScene.add(this.landscape.group);
    this.groundScene.fog = this.landscape.fog;
    // impact fireball, drawn in the ground pass so the land can hide its base
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(128, 150, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,250,220,1)");
    grd.addColorStop(0.25, "rgba(255,190,90,0.95)");
    grd.addColorStop(0.6, "rgba(220,70,20,0.55)");
    grd.addColorStop(1, "rgba(80,10,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.fireball = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.fireball.visible = false;
    this.fireball.renderOrder = 1.5;
    this.groundScene.add(this.fireball);
  }

  // ------------------------------------------------------------------ controls
  private bindControls() {
    const el = this.renderer.domElement;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    el.addEventListener("pointerdown", (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      if (!this.follow) this.targetYaw = this.targetPitch = null;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      if (this.follow && Math.hypot(e.clientX - lx, e.clientY - ly) < 3) return;
      if (this.follow) { this.follow = null; this.targetYaw = this.targetPitch = null; }
      const k = (this.fov / el.clientHeight) * (Math.PI / 180);
      this.yaw += (e.clientX - lx) * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - ly) * k, this.minPitch(), Math.PI / 2 - 0.01);
      lx = e.clientX;
      ly = e.clientY;
    });
    el.addEventListener("pointerup", () => (dragging = false));
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.fov = THREE.MathUtils.clamp(this.fov * Math.exp(e.deltaY * 0.0015), MIN_FOV, 100);
      if (this.follow) this.follow.fov = this.fov;
    }, { passive: false });
    // keyboard: arrows or WASD turn and tilt; held keys keep turning
    window.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") this.turn.x = 1;
      if (k === "arrowright" || k === "d") this.turn.x = -1;
      if (k === "arrowup" || k === "w") this.turn.y = 1;
      if (k === "arrowdown" || k === "s") this.turn.y = -1;
      if (k === "+" || k === "=") this.fov = THREE.MathUtils.clamp(this.fov * 0.85, MIN_FOV, 100);
      if (k === "-") this.fov = THREE.MathUtils.clamp(this.fov / 0.85, MIN_FOV, 100);
      if (this.follow && (k === "+" || k === "=" || k === "-")) this.follow.fov = this.fov;
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (["arrowleft", "arrowright", "a", "d"].includes(k)) this.turn.x = 0;
      if (["arrowup", "arrowdown", "w", "s"].includes(k)) this.turn.y = 0;
    });
  }

  /** Continuous turning, driven by held keys or the on-screen look pad. x: +1 left, y: +1 up */
  turn = { x: 0, y: 0 };

  lookUp() {
    this.targetYaw = this.yaw;
    this.targetPitch = Math.PI / 2 - 0.02;
  }

  /** Compass heading the camera faces, degrees from north through east. */
  heading(): number {
    return ((-this.yaw * 180) / Math.PI % 360 + 360) % 360;
  }

  /** Device-orientation mode: when set, the camera follows the phone. */
  deviceQuat: THREE.Quaternion | null = null;

  /** What sits under a screen point: planets first, then the transient, then the brightest nearby star. */
  pick(clientX: number, clientY: number, radiusPx = 26): Picked | null {
    const s = this.state;
    if (!s) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const toScreen = (d: THREE.Vector3) => {
      const p = d.clone().multiplyScalar(SKY_RADIUS).project(this.camera);
      if (p.z > 1) return null;
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    };
    let best: Picked | null = null;
    let bestScore = Infinity;
    const consider = (cand: Picked, magBias: number) => {
      if (cand.dir.y < -0.02 && this.effGround() === "solid") return;
      const sp = toScreen(cand.dir);
      if (!sp) return;
      const d = Math.hypot(sp.x - clientX, sp.y - clientY);
      if (d > radiusPx) return;
      const score = d + magBias * 4;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    };
    if (s.bodies && this.layers.planets) {
      for (const b of s.bodies) consider({ kind: "body", name: b.name, dir: new THREE.Vector3(...b.j2000).applyMatrix3(s.frame.M), body: b }, -6);
    }
    if (s.transient) consider({ kind: "transient", name: s.transient.name, dir: raDecToUnit(s.transient.ra, s.transient.dec).applyMatrix3(s.frame.M) }, -5);
    if (s.minors && this.layers.planets) {
      for (const m of s.minors) if (m.mag < s.limitMag + this.zoomBoost) consider({ kind: "minor", name: m.name, dir: new THREE.Vector3(...m.j2000).applyMatrix3(s.frame.M), m }, -3);
    }
    if (this.layers.deep && s.scatter === 0) {
      DEEP.forEach((o, i) => {
        if (o.mag > s.limitMag + this.zoomBoost + 1) return;
        const dir = raDecToUnit(o.ra, o.dec).applyMatrix3(s.frame.M);
        const sp = toScreen(dir);
        if (!sp) return;
        // a big glyph can be picked anywhere inside it, but a star on top of it still wins
        const d = Math.hypot(sp.x - clientX, sp.y - clientY);
        const reach = Math.max(radiusPx, (this.deepPx[i] ?? 0) * 0.32);
        if (d > reach) return;
        const score = d * (radiusPx / reach) + 6;
        if (score < bestScore) {
          bestScore = score;
          best = { kind: "deep", name: o.name, dir, obj: o };
        }
      });
    }
    if (s.scatter === 0) {
      const d = this.catalog.data;
      for (let i = 0; i < this.catalog.count; i++) {
        const mag = d[i * 8 + 6];
        if (mag > s.limitMag || mag > 6) continue;
        if (s.hideYoung && this.catalog.young.includes(i)) continue;
        consider({ kind: "star", index: i, name: this.catalog.names[i] ?? this.catalog.desig[i] ?? `HIP ${this.catalog.hip[i]}`, dir: this.starWorld(i), mag }, mag);
      }
    }
    return best;
  }

  /** Screen-centre pick for the phone reticle. */
  pickCenter(): Picked | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    return this.pick(r.left + r.width / 2, r.top + r.height / 2, 60);
  }

  findStarDir(i: number): THREE.Vector3 | null {
    return this.state ? this.starWorld(i) : null;
  }

  starMag(i: number) {
    return this.catalog.data[i * 8 + 6];
  }
  starBV(i: number) {
    return this.catalog.data[i * 8 + 7];
  }
  starJ2000(i: number) {
    const o = i * 8;
    return new THREE.Vector3(this.catalog.data[o], this.catalog.data[o + 1], this.catalog.data[o + 2]);
  }
  constellationOf(i: number): string | null {
    const d = this.catalog.desig[i];
    if (!d) return null;
    const gen = d.split(" ").slice(1).join(" ");
    return gen || null;
  }

  /** Smoothly turn the view toward a world direction. */
  lookAt(dir: THREE.Vector3) {
    this.follow = null;
    const d = dir.clone().normalize();
    const alt = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    const az = Math.atan2(d.x, -d.z);
    this.targetYaw = -az;
    this.targetPitch = THREE.MathUtils.clamp(Math.max(alt, 0.12), -0.15, Math.PI / 2 - 0.05);
  }

  lookAtAltAz(alt: number, az: number) {
    this.lookAt(altAzToWorld(alt, az));
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    const pw = Math.floor(w * this.renderer.getPixelRatio());
    const ph = Math.floor(h * this.renderer.getPixelRatio());
    for (const rt of [this.rtSky, this.rtA, this.rtB]) rt.setSize(pw, ph);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ effects
  private pendingImpact = 0;
  onBolide: (() => void) | null = null;
  onImpact: ((scale: number) => void) | null = null;
  playBolide(b: Bolide | null, impactScale = 0) {
    this.bolide = b;
    this.bolideT = b ? -0.6 : -1;
    this.pendingImpact = impactScale;
    this.impactT = -1;
    if (b) {
      this.impactDir = altAzToWorld(Math.max(0, b.toAlt), b.toAz);
      this.onBolide?.();
    }
  }

  setMeteors(m: Meteors | null) {
    this.meteors = m;
    this.meteorList = [];
  }

  // ------------------------------------------------------------------ frame
  setState(s: SkyState) {
    this.state = s;
  }

  /** Direction in world space for a named object (star, planet, constellation, transient). */
  findTarget(name: string): THREE.Vector3 | null {
    const s = this.state;
    if (!s) return null;
    const q = name.trim().toLowerCase();
    if (s.bodies) {
      const b = s.bodies.find((x) => x.name.toLowerCase() === q);
      if (b) return new THREE.Vector3(...b.j2000).applyMatrix3(s.frame.M);
    }
    const comet = s.comets.find((c) => c.name.toLowerCase() === q || c.name.toLowerCase().includes(q));
    if (comet && q.length > 3) return new THREE.Vector3(...comet.head).applyMatrix3(s.frame.M);
    if (s.transient && s.transient.name.toLowerCase() === q) {
      return raDecToUnit(s.transient.ra, s.transient.dec).applyMatrix3(s.frame.M);
    }
    for (const [i, nm] of Object.entries(this.catalog.names)) {
      if (nm.toLowerCase() === q) return this.starWorld(Number(i));
    }
    const deep = DEEP.find((x) => x.name.toLowerCase() === q || x.id.toLowerCase() === q);
    if (deep) return raDecToUnit(deep.ra, deep.dec).applyMatrix3(s.frame.M);
    const minor = s.minors?.find((m) => m.name.toLowerCase() === q);
    if (minor) return new THREE.Vector3(...minor.j2000).applyMatrix3(s.frame.M);
    const pleiades = q.includes("pleiades") ? "Alcyone" : null;
    if (pleiades) return this.findTarget(pleiades);
    const c = this.constellations.find((x) => x.name.toLowerCase() === q || x.id.toLowerCase() === q);
    if (c) return raDecToUnit(c.ra, c.dec).applyMatrix3(s.frame.M);
    return null;
  }

  private starWorld(i: number): THREE.Vector3 {
    const s = this.state!;
    const o = i * 8;
    const d = this.catalog.data;
    const u = new THREE.Vector3(d[o], d[o + 1], d[o + 2]);
    const w = new THREE.Vector3(d[o + 3], d[o + 4], d[o + 5]);
    const len = w.length();
    if (len > 0) {
      const th = len * THREE.MathUtils.clamp(s.years, -200000, 200000);
      u.multiplyScalar(Math.cos(th)).add(w.multiplyScalar(Math.sin(th) / len));
    }
    return u.applyMatrix3(s.frame.M);
  }

  render(dt: number) {
    let s = this.state!;
    if (!s) return;
    // the time slide turns the whole sky about one axis; everything downstream sees the turned frame
    const baseM = s.frame.M;
    const turned = (ang: number) => (ang === 0 ? baseM.clone()
      : new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationAxis(this.slideAxis, ang)).multiply(baseM));
    if (this.slide !== 0) s = this.state = { ...s, frame: { ...s.frame, M: turned(this.slide) } };

    // a zoomed-in object is followed as the sky turns, and the zoom tightens as the view arrives
    if (this.follow) {
      const d = this.findTarget(this.follow.name);
      if (!d) this.follow = null;
      else {
        this.targetYaw = -Math.atan2(d.x, -d.z);
        this.targetPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)), this.minPitch(), Math.PI / 2 - 0.01);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const off = THREE.MathUtils.radToDeg(fwd.angleTo(d));
        this.fov = THREE.MathUtils.clamp(Math.max(this.follow.fov, off * 3), MIN_FOV, 100);
      }
    }
    // camera easing toward a requested target
    if (this.targetYaw !== null && this.targetPitch !== null) {
      let dy = this.targetYaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = 1 - Math.exp(-dt * (this.follow ? 4 : 2.6));
      this.yaw += dy * k;
      this.pitch += (this.targetPitch - this.pitch) * k;
      const eps = 0.002 * Math.min(1, this.camera.fov / 70);
      if (!this.follow && Math.abs(dy) < eps && Math.abs(this.targetPitch - this.pitch) < eps) this.targetYaw = this.targetPitch = null;
    }
    if (this.turn.x || this.turn.y) {
      this.targetYaw = this.targetPitch = null;
      this.follow = null;
      const rate = (this.camera.fov / 70) * 0.9; // radians per second, slower when zoomed in
      this.yaw += this.turn.x * rate * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch + this.turn.y * rate * dt, this.minPitch(), Math.PI / 2 - 0.01);
    }
    this.camera.fov += (this.fov - this.camera.fov) * (1 - Math.exp(-dt * 8));
    this.camera.updateProjectionMatrix();
    if (this.deviceQuat) {
      this.camera.quaternion.slerp(this.deviceQuat, 1 - Math.exp(-dt * 12));
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.yaw = -Math.atan2(fwd.x, -fwd.z);
      this.pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
    } else {
      this.camera.rotation.set(0, 0, 0);
      this.camera.rotateY(this.yaw + this.shake.x);
      this.camera.rotateX(this.pitch + this.shake.y);
    }
    const fovScale = THREE.MathUtils.clamp(Math.pow(70 / this.camera.fov, 0.5), 0.8, 1.9);

    // shared uniforms
    this.time += dt;
    const u = this.starMat.uniforms;
    u.uTime.value = this.time;
    u.uM.value.copy(s.frame.M);
    u.uYears.value = THREE.MathUtils.clamp(s.years, -200000, 200000);
    u.uScatter.value = s.scatter;
    u.uLimitMag.value = s.limitMag + this.zoomBoost * 0.7;
    u.uHideYoung.value = s.hideYoung ? 1 : 0;
    u.uFovScale.value = fovScale;
    u.uRewind.value = this.rewind;
    this.domeMat.uniforms.uRewind.value = this.rewind;
    this.streakMat.uniforms.uLimitMag.value = s.limitMag;
    this.grid.visible = this.layers.grid;
    this.ecliptic.visible = this.layers.ecliptic && s.scatter === 0;
    // Plain hills fade smoothly into tinted glass as you look down, like a planetarium app;
    // landscapes with monuments or skylines switch to a dark veil instead.
    const g = this.effGround();
    const calm = this.landscape.calm && g !== "space";
    this.see += ((g === "solid" ? 0 : 1) - this.see) * (1 - Math.exp(-dt * 5));
    if (Math.abs(this.see - (g === "solid" ? 0 : 1)) < 0.002) this.see = g === "solid" ? 0 : 1;
    this.landscape.setSee(this.see);
    this.uBelow.value = calm ? this.see : g === "solid" ? 0 : g === "glass" ? 0.62 : 1;
    this.domeMat.uniforms.uVeil.value = !calm && g === "glass" ? 1 : 0;
    if (this.artMat && this.art) {
      this.art.visible = this.layers.art;
      const far = (1 - 0.5 * THREE.MathUtils.smoothstep(Math.abs(s.years), 20000, 60000)) * THREE.MathUtils.smoothstep(this.camera.fov, 7, 22);
      this.artMat.uniforms.uOpacity.value = 0.27 * (1 - 0.45 * s.day) * (s.scatter > 0 ? 0 : 1) * (1 - this.quiet) * far;
      this.artMat.uniforms.uView.value.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    }
    this.lineMat.uniforms.uYears.value = u.uYears.value;
    this.lineMat.uniforms.uScatter.value = s.scatter;
    this.lineMat.uniforms.uOpacity.value = 0.26 * (1 - 0.35 * s.day) * (s.scatter > 0 ? 0 : 1) * (1 - this.quiet);
    this.lines.visible = this.layers.constellations;
    this.pole.visible = this.layers.poleTrack;
    this.domeMat.uniforms.uSun.value.copy(s.frame.sunWorld);
    this.domeMat.uniforms.uDay.value = s.day;
    this.domeMat.uniforms.uEclipse.value = s.eclipse;
    this.domeMat.uniforms.uMilkyWayOn.value = this.layers.milkyWay ? 1 : 0;

    // bodies
    const P = this.bodyGeo.getAttribute("position") as THREE.BufferAttribute;
    const S = this.bodyGeo.getAttribute("aSize") as THREE.BufferAttribute;
    const C = this.bodyGeo.getAttribute("aColor") as THREE.BufferAttribute;
    const A = this.bodyGeo.getAttribute("aAlpha") as THREE.BufferAttribute;
    const MO = this.bodyGeo.getAttribute("aIsMoon") as THREE.BufferAttribute;
    let moonWorld: THREE.Vector3 | null = null;
    let moonPhase = 0;
    const DI = this.bodyGeo.getAttribute("aDisc") as THREE.BufferAttribute;
    const LI = this.bodyGeo.getAttribute("aLight") as THREE.BufferAttribute;
    const PO = this.bodyGeo.getAttribute("aPole") as THREE.BufferAttribute;
    for (let i = 0; i < A.count; i++) { A.setX(i, 0); DI.setX(i, 0); }
    // CSS pixels per radian at the centre of the view
    const pxPerRad = this.host.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    const maxCss = this.maxPoint / this.renderer.getPixelRatio() * 0.98;
    const view = this.camera.matrixWorldInverse;
    const boost = this.zoomBoost;
    if (s.bodies && this.layers.planets) {
      const sunB = s.bodies.find((b) => b.name === "Sun");
      const sunVec = sunB ? new THREE.Vector3(...sunB.j2000).applyMatrix3(s.frame.M).multiplyScalar(sunB.dist ?? 1) : null;
      const moonB = s.bodies.find((b) => b.name === "Moon");
      let moonGrow = 1, eclipseNear = false;
      if (moonB?.dist && sunB) {
        const mPx = ((2 * RADIUS_KM.Moon) / (moonB.dist * AU_KM)) * pxPerRad;
        moonGrow = Math.max(BODY_STYLE.Moon.size * 0.92 * fovScale, mPx) / mPx;
        const mw = new THREE.Vector3(...moonB.j2000), sw = new THREE.Vector3(...sunB.j2000);
        eclipseNear = mw.angleTo(sw) < THREE.MathUtils.degToRad(1.3);
      }
      s.bodies.forEach((b, i) => {
        const w = new THREE.Vector3(...b.j2000).applyMatrix3(s.frame.M);
        const st = BODY_STYLE[b.name];
        P.setXYZ(i, w.x * SKY_RADIUS * 0.99, w.y * SKY_RADIUS * 0.99, w.z * SKY_RADIUS * 0.99);
        let sz = b.name === "Sun" || b.name === "Moon" ? st.size : st.size * THREE.MathUtils.clamp(1 - (b.mag + 2) * 0.12, 0.6, 1.4);
        const ang = b.dist ? (2 * RADIUS_KM[b.name]) / (b.dist * AU_KM) : 0;
        let discPx = ang * pxPerRad;
        let disc = 0;
        if (b.name === "Sun" && (discPx >= 9 || eclipseNear)) {
          // near an eclipse the Sun is drawn at the same enlargement as the Moon, so their sizes compare truly
          const shownSun = discPx * moonGrow;
          const sprite = Math.min(shownSun * 3.4, maxCss);
          discPx = shownSun;
          disc = Math.min(discPx / sprite, 0.95);
          sz = sprite / fovScale;
        } else if (b.name === "Sun") sz = Math.max(sz, discPx * 2.6 / fovScale);
        else if (b.name === "Moon" || discPx >= 3.5) {
          const shown = b.name === "Moon" ? Math.max(st.size * 0.92 * fovScale, discPx) : discPx;
          const sprite = Math.min(shown * (b.name === "Saturn" ? 2.45 : b.name === "Moon" ? 1.09 : 1.5), maxCss);
          disc = Math.min(shown / sprite, b.name === "Saturn" ? 0.408 : 0.95);
          sz = sprite / fovScale;
          // orient the disc: rotate so the planet sits on the view axis, then take the Sun and pole in that frame
          const wv = w.clone().transformDirection(view);
          const q = new THREE.Quaternion().setFromUnitVectors(wv, new THREE.Vector3(0, 0, -1));
          const light = sunVec ? sunVec.clone().sub(w.clone().multiplyScalar(b.dist ?? 1)).normalize().transformDirection(view).applyQuaternion(q) : new THREE.Vector3(0, 0, 1);
          const pl = POLE[b.name] ?? [0, 90];
          const pole = raDecToUnit(pl[0], pl[1]).applyMatrix3(s.frame.M).transformDirection(view).applyQuaternion(q);
          LI.setXYZ(i, light.x, light.y, light.z);
          PO.setXYZ(i, pole.x, pole.y, pole.z);
        }
        S.setX(i, sz);
        DI.setX(i, disc);
        C.setXYZ(i, ...st.color);
        const visible = b.name === "Sun" || b.name === "Moon" ? 1 : THREE.MathUtils.clamp((s.limitMag + boost - b.mag) / 2, 0, 1);
        A.setX(i, b.name === "Sun" ? 1 - s.eclipse * 0.97 : visible);
        MO.setX(i, b.name === "Sun" ? (disc > 0 ? 6 : 9) : disc > 0 ? DISC_KIND[b.name] ?? 5 : 0);
        if (b.name === "Moon") {
          // inside Earth's shadow the Moon dims and turns copper red, lit only by sunsets around the Earth
          const u = b.umbra ?? 0, pn = b.penumbra ?? 0;
          const base = new THREE.Color(...st.color).multiplyScalar(1 - 0.3 * pn);
          base.lerp(new THREE.Color(0.55, 0.20, 0.10), u * 0.92).multiplyScalar(1 - 0.55 * u);
          C.setXYZ(i, base.r, base.g, base.b);
          if (sunB) {
            const sepSun = w.angleTo(new THREE.Vector3(...sunB.j2000).applyMatrix3(s.frame.M));
            this.bodyMat.uniforms.uMoonDark.value = sepSun < THREE.MathUtils.degToRad(1.3) ? 0.985 : 0.06;
          }
        }
        if (b.name === "Moon") {
          moonWorld = w;
          moonPhase = b.phase ?? 0;
        }
      });
    }
    if (s.minors && this.layers.planets) {
      s.minors.forEach((m, j) => {
        const i = MINOR_BASE + j;
        if (i >= A.count) return;
        const w = new THREE.Vector3(...m.j2000).applyMatrix3(s.frame.M);
        P.setXYZ(i, w.x * SKY_RADIUS * 0.99, w.y * SKY_RADIUS * 0.99, w.z * SKY_RADIUS * 0.99);
        S.setX(i, 3.6);
        C.setXYZ(i, 0.86, 0.84, 0.96);
        MO.setX(i, 0);
        A.setX(i, THREE.MathUtils.clamp((s.limitMag + boost - m.mag) / 2, 0, 0.9));
      });
    }
    if (s.transient) {
      const w = raDecToUnit(s.transient.ra, s.transient.dec).applyMatrix3(s.frame.M);
      const i = TRANSIENT;
      P.setXYZ(i, w.x * SKY_RADIUS * 0.99, w.y * SKY_RADIUS * 0.99, w.z * SKY_RADIUS * 0.99);
      S.setX(i, THREE.MathUtils.clamp(6 - s.transient.mag * 1.4, 4, 18));
      C.setXYZ(i, 1.0, 0.97, 0.9);
      A.setX(i, THREE.MathUtils.clamp((s.limitMag - s.transient.mag) / 2, 0, 1.2));
      MO.setX(i, 0);
    }
    DI.needsUpdate = LI.needsUpdate = PO.needsUpdate = true;
    this.updateDeep(s, pxPerRad, maxCss);
    P.needsUpdate = S.needsUpdate = C.needsUpdate = A.needsUpdate = MO.needsUpdate = true;
    const sunView = s.frame.sunWorld.clone().transformDirection(this.camera.matrixWorldInverse);
    this.bodyMat.uniforms.uSunView.value.copy(sunView);
    this.bodyMat.uniforms.uCorona.value = THREE.MathUtils.smoothstep(s.eclipse, 0.6, 0.97);
    this.bodyMat.uniforms.uFovScale.value = fovScale;

    // moonlight brightens the sky
    {
      const mw = moonWorld as THREE.Vector3 | null;
      this.domeMat.uniforms.uMoon.value.copy(mw ?? new THREE.Vector3(0, -1, 0));
      this.domeMat.uniforms.uMoonGlow.value = mw && mw.y > 0 ? Math.pow(moonPhase, 1.5) * THREE.MathUtils.smoothstep(mw.y, 0, 0.3) : 0;
    }
    // impact sequence: flash, shaking ground, fireball, burning sky, then dust
    let glow = new THREE.Color(0, 0, 0);
    let skyImpact = 0;
    this.dust = 0;
    this.shake.set(0, 0);
    if (this.impactT >= 0) {
      this.impactT += dt;
      const t = this.impactT;
      const k = this.impactScale;
      this.flashEl.style.opacity = String(Math.min(1, k * 1.2) * Math.exp(-t * 1.8));
      const quake = k * (0.05 * Math.exp(-t * 0.9) + (t > 3.2 ? 0.035 * Math.exp(-(t - 3.2) * 0.7) : 0));
      this.shake.set(
        quake * (Math.sin(t * 47.0) * 0.6 + Math.sin(t * 31.3 + 1.7) * 0.4),
        quake * (Math.sin(t * 53.1 + 0.4) * 0.6 + Math.sin(t * 23.7) * 0.4),
      );
      skyImpact = k * THREE.MathUtils.smoothstep(t, 0.3, 5) * Math.exp(-Math.max(0, t - 8) * (k > 0.8 ? 0.07 : 0.15));
      this.dust = k > 0.8 ? THREE.MathUtils.smoothstep(t, 7, 16) : 0;
      glow = new THREE.Color(0.55, 0.18, 0.05).multiplyScalar(skyImpact * 0.6 + Math.exp(-t * 1.5) * k);
      if (k > 0.8) {
        // the fireball rises and spreads over the horizon toward ground zero
        const grow = THREE.MathUtils.smoothstep(t, 0, 9);
        const dir = this.impactDir.clone().setY(0).normalize();
        this.fireball.visible = true;
        this.fireball.position.copy(dir.multiplyScalar(600)).setY(-10 + grow * 140);
        const size = 50 + grow * 300;
        this.fireball.scale.set(size * 1.4, size, 1);
        (this.fireball.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.4 + t * 0.4) * (1 - THREE.MathUtils.smoothstep(t, 9, 26));
      }
      if (t > 40) this.impactT = -1;
    } else {
      this.flashEl.style.opacity = "0";
      this.fireball.visible = false;
    }
    this.domeMat.uniforms.uImpact.value = skyImpact;
    this.domeMat.uniforms.uImpactDir.value.copy(this.impactDir);
    this.domeMat.uniforms.uLight.value = s.lightPollution;

    // the land: moonlit, sunlit or lit by fire
    {
      const mw = moonWorld as THREE.Vector3 | null;
      this.landscape.update(dt, { sun: s.frame.sunWorld, moon: mw, moonPhase, day: s.day * (1 - s.eclipse * 0.8), glow });
    }
    this.updateComets(s, fovScale);

    this.updateFx(dt, s);

    // long-exposure decay follows how fast the sky is turning
    const turn = this.matrixAngle(this.lastM, s.frame.M) / Math.max(dt, 1e-3);
    this.lastM.copy(s.frame.M);
    const wanted = this.layers.trails ? THREE.MathUtils.clamp(Math.max(turn * 0.35, this.trailBoost), 0, 0.985) : 0;
    this.decay += (wanted - this.decay) * (1 - Math.exp(-dt * 6));

    // passes 1 and 2: render the sky and fold it into the long exposure. A fast slide is split
    // into sub-steps, each drawing star streaks from the last position, so trails stay continuous.
    const dSlide = this.slide - this.lastSlide;
    // the true motion since the last frame, including the date changing under the sweep: sub-steps follow it
    // exactly (slerp from last frame's sky to this one), so every trail is one unbroken line
    const moved = this.matrixAngle(this.lastFullM, s.frame.M);
    const fresh = this.lastFullValid && moved < 0.5;
    const K = this.layers.trails && fresh ? THREE.MathUtils.clamp(Math.ceil(Math.max(Math.abs(dSlide), moved) / 0.008), 1, 16) : 1;
    const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().setFromMatrix3(this.lastFullM));
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().setFromMatrix3(s.frame.M));
    const at = (f: number) => new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q0.clone().slerp(q1, f)));
    const stepDecay = Math.pow(this.decay, 1 / K);
    this.streaks.visible = fresh && this.slide !== 0 && (K > 1 || moved > 0.002);
    this.streakMat.uniforms.uStreak.value = this.streaks.visible ? 1 : 0;
    // while the sky wheels, the light travels along the continuous trails: the point sprites, which would
    // otherwise be stamped once per sub-step as a string of beads, fade out
    this.starMat.uniforms.uMotion.value += (THREE.MathUtils.smoothstep(Math.abs(dSlide), 0.002, 0.012) - this.starMat.uniforms.uMotion.value) * (1 - Math.exp(-dt * 10));
    for (const c of this.streaks.children) {
      const m = (c as THREE.LineSegments).material as THREE.ShaderMaterial;
      const px = c.userData.px as number;
      // thicken in both screen directions, so a curving trail is equally wide all the way round
      const ax = c.userData.ax as number;
      m.uniforms.uOff.value.set((ax === 0 ? px * 2 : 0) / this.rtSky.width, (ax === 1 ? px * 2 : 0) / this.rtSky.height);
    }
    let prev = fresh ? this.lastFullM.clone() : s.frame.M.clone();
    // only the trails are needed for the in-between sub-steps; the full sky is drawn once, on the last
    const kids = this.skyScene.children;
    const shown = kids.map((c) => c.visible);
    for (let k = 1; k <= K; k++) {
      if (K > 1) kids.forEach((c, i) => (c.visible = k === K ? shown[i] : c === this.streaks));
      const Mk = k === K ? s.frame.M : at(k / K);
      this.common.uM.value.copy(Mk);
      this.streakMat.uniforms.uMPrev.value.copy(prev);
      prev = Mk;
      this.renderer.setRenderTarget(this.rtSky);
      this.renderer.clear();
      this.renderer.render(this.skyScene, this.camera);
      this.trailMat.uniforms.uCurrent.value = this.rtSky.texture;
      this.trailMat.uniforms.uHistory.value = this.rtA.texture;
      this.trailMat.uniforms.uDecay.value = stepDecay;
      this.quad.material = this.trailMat;
      this.renderer.setRenderTarget(this.rtB);
      this.renderer.render(this.quadScene, this.quadCam);
      [this.rtA, this.rtB] = [this.rtB, this.rtA];
    }
    kids.forEach((c, i) => (c.visible = shown[i]));
    this.lastFullM.copy(s.frame.M);
    this.lastFullValid = true;
    this.lastSlide = this.slide;
    // pass 3: display, then crisp dunes on top
    this.copyMat.uniforms.uTex.value = this.rtA.texture;
    this.quad.material = this.copyMat;
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.quadScene, this.quadCam);
    if (this.effGround() === "solid" || (this.landscape.calm && this.effGround() !== "space")) this.renderer.render(this.groundScene, this.camera);

    this.updateLabels(s);
  }

  private matrixAngle(a: THREE.Matrix3, b: THREE.Matrix3): number {
    const x = new THREE.Vector3(0.3, 0.5, 0.81).normalize();
    const p = x.clone().applyMatrix3(a);
    const q = x.clone().applyMatrix3(b);
    return p.angleTo(q);
  }

  /** Place each deep-sky glyph at its catalogue position, size and orientation. */
  private updateDeep(s: SkyState, pxPerRad: number, maxCss: number) {
    const P = this.deepGeo.getAttribute("position") as THREE.BufferAttribute;
    const Sz = this.deepGeo.getAttribute("aSize") as THREE.BufferAttribute;
    const A = this.deepGeo.getAttribute("aAlpha") as THREE.BufferAttribute;
    const Ang = this.deepGeo.getAttribute("aAngle") as THREE.BufferAttribute;
    const on = this.layers.deep && s.scatter === 0;
    const north = new THREE.Vector3(0, 0, 1).applyMatrix3(s.frame.M);
    const boost = this.zoomBoost;
    DEEP.forEach((o, i) => {
      const w = raDecToUnit(o.ra, o.dec).applyMatrix3(s.frame.M);
      P.setXYZ(i, w.x * SKY_RADIUS * 0.995, w.y * SKY_RADIUS * 0.995, w.z * SKY_RADIUS * 0.995);
      const real = THREE.MathUtils.degToRad(o.size / 60) * pxPerRad;
      const px = Math.min(Math.max(real * 1.45, o.mag < 5 ? 16 : 11), maxCss);
      this.deepPx[i] = px;
      Sz.setX(i, px);
      // brighter when zoomed, fainter in daylight and low in the sky
      const vis = THREE.MathUtils.clamp((s.limitMag + boost * 0.8 - o.mag + 1.2) / 2.2, 0, 1);
      const sb = THREE.MathUtils.clamp(1.25 - 0.1 * (o.mag - 3), 0.45, 1.25);
      A.setX(i, on && o.glyph ? vis * sb * (1 - 0.8 * s.day) * THREE.MathUtils.smoothstep(w.y, 0.02, 0.24) * (1 - 0.85 * s.lightPollution) * (1 - this.quiet) : 0);
      // screen angle of the long axis: from celestial north, turned toward east by the position angle
      const tN = north.clone().sub(w.clone().multiplyScalar(north.dot(w)));
      if (tN.lengthSq() < 1e-10) tN.set(0, 1, 0);
      tN.normalize();
      const a = w.clone().multiplyScalar(SKY_RADIUS).project(this.camera);
      const b = w.clone().addScaledVector(tN, 0.002).normalize().multiplyScalar(SKY_RADIUS).project(this.camera);
      const aspect = this.camera.aspect;
      const northAng = Math.atan2(b.y - a.y, (b.x - a.x) * aspect);
      Ang.setX(i, northAng + THREE.MathUtils.degToRad(o.pa));
    });
    P.needsUpdate = Sz.needsUpdate = A.needsUpdate = Ang.needsUpdate = true;
  }

  /** Field of view that frames a named object, or null if it is not one that needs zooming. */
  fitFov(name: string): number | null {
    const q = name.trim().toLowerCase();
    const o = DEEP.find((x) => x.name.toLowerCase() === q || x.id.toLowerCase() === q);
    if (o) return THREE.MathUtils.clamp((o.size / 60) * 2.6, 1, 60);
    const b = this.state?.bodies?.find((x) => x.name.toLowerCase() === q);
    if (b && b.dist && b.name !== "Sun") {
      const ang = THREE.MathUtils.radToDeg((2 * RADIUS_KM[b.name]) / (b.dist * AU_KM));
      return THREE.MathUtils.clamp(ang * (b.name === "Saturn" ? 7 : b.name === "Moon" ? 2.2 : 5), MIN_FOV, 40);
    }
    if (this.state?.minors?.some((m) => m.name.toLowerCase() === q)) return 8;
    return null;
  }

  /** Turn toward a named object and zoom so it fills the view. */
  zoomTo(name: string) {
    const d = this.findTarget(name);
    if (!d) return;
    const f = this.fitFov(name);
    if (f) this.follow = { name, fov: f };
    else this.lookAt(d);
  }
  /** object the view is locked onto while zoomed in; any drag or key turn releases it */
  follow: { name: string; fov: number } | null = null;

  private updateComets(s: SkyState, fovScale: number) {
    const P = this.cometGeo.getAttribute("position") as THREE.BufferAttribute;
    const A = this.cometGeo.getAttribute("aAlpha") as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) A.setX(i, 0);
    A.needsUpdate = true;
    const BP = this.cometBodyGeo.getAttribute("position") as THREE.BufferAttribute;
    const BA = this.cometBodyGeo.getAttribute("aAng") as THREE.BufferAttribute;
    const BS = this.cometBodyGeo.getAttribute("aShape") as THREE.BufferAttribute;
    const BB = this.cometBodyGeo.getAttribute("aBright") as THREE.BufferAttribute;
    const R = SKY_RADIUS * 0.985;
    const D2R = Math.PI / 180;
    let q = 0;
    for (const c of s.comets) {
      if (q >= 4) break;
      const vis = THREE.MathUtils.clamp((s.limitMag + 1.5 - c.mag) / 3, 0, 1.4);
      if (vis <= 0 || !this.layers.planets) continue;
      const head = new THREE.Vector3(...c.head).applyMatrix3(s.frame.M).normalize();
      const ion = new THREE.Vector3(...c.ionTail).applyMatrix3(s.frame.M).normalize();
      const dust = new THREE.Vector3(...c.dustTail).applyMatrix3(s.frame.M).normalize();
      // tangent-plane (gnomonic) frame at the head, x toward the dust tip
      const tan = (v: THREE.Vector3) => v.clone().divideScalar(Math.max(v.dot(head), 1e-3)).sub(head);
      const td = tan(dust), ti = tan(ion);
      // lengths in "tangent degrees", the unit the patch is drawn in (a tail longer than 70° is cut there)
      const cap = Math.tan(70 * D2R);
      const L = Math.max(0.5, Math.min(td.length(), cap) / D2R);
      const Li = Math.max(0.5, Math.min(ti.length(), cap) / D2R);
      const ex = td.lengthSq() > 1e-10 ? td.clone().normalize() : new THREE.Vector3(0, 1, 0).cross(head).normalize();
      const ey = head.clone().cross(ex).normalize();
      const th = Math.atan2(ti.dot(ey), ti.dot(ex));
      // the coma: bigger and brighter for brighter comets
      const r0 = THREE.MathUtils.clamp(0.12 + (4 - c.mag) * 0.06, 0.08, 0.7);
      const span = Math.max(L, Li) * 1.08 + r0 * 4;
      const across = Math.max(L * 0.42, Li * Math.abs(Math.sin(th)) * 1.15) + r0 * 4;
      const corners: [number, number][] = [[-r0 * 4, -across], [span, -across], [span, across], [-r0 * 4, across]];
      corners.forEach(([ax, cy], k) => {
        const i = q * 4 + k;
        const p = head.clone().addScaledVector(ex, ax * D2R).addScaledVector(ey, cy * D2R).multiplyScalar(R);
        BP.setXYZ(i, p.x, p.y, p.z);
        BA.setXY(i, ax, cy);
        BS.setXYZW(i, L, r0, th, Li);
        BB.setX(i, vis);
      });
      q++;
    }
    for (let i = q * 4; i < BB.count; i++) BB.setX(i, 0);
    BP.needsUpdate = BA.needsUpdate = BS.needsUpdate = BB.needsUpdate = true;
    void fovScale;
  }

  private updateFx(dt: number, s: SkyState) {
    const P = this.fxGeo.getAttribute("position") as THREE.BufferAttribute;
    const S = this.fxGeo.getAttribute("aSize") as THREE.BufferAttribute;
    const C = this.fxGeo.getAttribute("aColor") as THREE.BufferAttribute;
    const A = this.fxGeo.getAttribute("aAlpha") as THREE.BufferAttribute;
    let k = 0;
    const put = (v: THREE.Vector3, size: number, alpha: number, warm = 0) => {
      if (k >= P.count) return;
      P.setXYZ(k, v.x * SKY_RADIUS * 0.98, v.y * SKY_RADIUS * 0.98, v.z * SKY_RADIUS * 0.98);
      S.setX(k, size);
      C.setXYZ(k, 1, 1 - warm * 0.25, 1 - warm * 0.5);
      A.setX(k, alpha);
      k++;
    };

    // bolide: head travels along the great circle, tail of fading sprites
    if (this.bolide && this.bolideT > -1) {
      this.bolideT += dt / 3.2;
      const t = THREE.MathUtils.clamp(this.bolideT, 0, 1);
      const a = altAzToWorld(this.bolide.fromAlt, this.bolide.fromAz);
      const b = altAzToWorld(this.bolide.toAlt, this.bolide.toAz);
      // it speeds up as it falls, so the motion reads as a dive rather than a slide
      const e = Math.pow(t, 1.35);
      const along = (u: number) => a.clone().lerp(b, THREE.MathUtils.clamp(u, 0, 1)).normalize();
      // the persistent train it leaves in the air: a faint glow that cools and fades after impact
      if (this.bolideT > 0) {
        const fade = this.bolideT < 1 ? 1 : Math.max(0, 1 - (this.bolideT - 1) / 1.2);
        const end = Math.max(0, e - 0.3);
        for (let i = 0; i < 90 && end > 0; i++) {
          const u = (end * i) / 89;
          put(along(u), 7, 0.07 * fade * (0.4 + 0.6 * (u / Math.max(end, 1e-3))), 0.85);
        }
      }
      if (this.bolideT > 0 && this.bolideT < 1) {
        // a continuous tail: many overlapping soft sprites, white at the head cooling to orange
        const tail = Math.min(0.4, 0.14 + 0.32 * e);
        const N = 200;
        for (let i = 1; i < N; i++) {
          const f = i / N;
          const u = e - f * tail;
          if (u < 0) break;
          put(along(u), 4 + 15 * Math.pow(1 - f, 1.6), 0.55 * Math.pow(1 - f, 1.7), Math.min(1, f * 1.6));
        }
        const fl = 0.86 + 0.14 * Math.sin(this.time * 41) * Math.sin(this.time * 23);
        const head = along(e);
        put(head, 64 * fl * (0.7 + 0.5 * e), 0.32, 0.35); // glowing coma of hot air
        put(head, 24 * fl, 1.4, 0); // the fireball itself
        // late in the dive it breaks apart: a few fragments trail just off the main track
        if (e > 0.55) {
          const side = head.clone().cross(b.clone().sub(a)).normalize();
          for (let j = 1; j <= 6; j++) {
            const lag = j * 0.012 * (e - 0.55) / 0.45;
            const v = along(e - lag).addScaledVector(side, (j % 2 ? 1 : -1) * j * 0.0016 * (e - 0.55) * 10).normalize();
            put(v, 9 - j, 0.8 * fl, 0.4 + j * 0.08);
          }
        }
      }
      if (this.bolideT >= 1 && this.pendingImpact > 0) {
        this.impactScale = this.pendingImpact;
        this.pendingImpact = 0;
        this.impactT = 0;
        this.onImpact?.(this.impactScale);
      }
      // impact flash on the horizon
      if (this.bolideT >= 1 && this.bolideT < 2.2) {
        const f = 1 - (this.bolideT - 1) / 1.2;
        put(b, 160 * f + 40, 0.9 * f, 0.7);
      }
      if (this.bolideT > 2.2) this.bolideT = 2.2;
    }

    // meteor shower streaks fan out from the radiant
    if (this.meteors) {
      const rad = raDecToUnit(this.meteors.radiantRa, this.meteors.radiantDec).applyMatrix3(s.frame.M);
      if (rad.y > -0.1 && Math.random() < (this.meteors.perMinute / 60) * dt * 3) {
        const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const start = rad.clone().add(off.multiplyScalar(0.2 + Math.random() * 0.6)).normalize();
        const dir = start.clone().sub(rad).normalize();
        this.meteorList.push({ start, dir, t: 0, len: 0.12 + Math.random() * 0.25, life: 0.5 + Math.random() * 0.6 });
      }
      this.meteorList = this.meteorList.filter((m) => (m.t += dt) < m.life);
      for (const m of this.meteorList) {
        const f = m.t / m.life;
        const head = m.start.clone().add(m.dir.clone().multiplyScalar(m.len * f)).normalize();
        for (let i = 0; i < 14; i++) {
          const v = m.start.clone().add(m.dir.clone().multiplyScalar(m.len * Math.max(0, f - i * 0.02))).normalize();
          put(v, 6 * (1 - i / 14), (1 - f) * (1 - i / 14), 0.1);
        }
        put(head, 7, 1 - f, 0);
      }
    }
    for (let i = k; i < P.count; i++) A.setX(i, 0);
    P.needsUpdate = S.needsUpdate = C.needsUpdate = A.needsUpdate = true;
  }

  // ------------------------------------------------------------------ labels
  private labelAt(i: number): HTMLDivElement {
    if (!this.labelPool[i]) {
      const d = document.createElement("div");
      d.className = "sky-label";
      this.labelsEl.appendChild(d);
      this.labelPool[i] = d;
    }
    return this.labelPool[i];
  }

  /** called when a constellation name is clicked */
  onConstellation: ((c: ConstellationLabel, dir: THREE.Vector3) => void) | null = null;

  private updateLabels(s: SkyState) {
    let k = 0;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    // labels are placed in priority order and a later one is dropped if it would sit on an earlier one
    const taken: [number, number, number, number][] = [];
    // keep sky names off the place, date and buttons at the top of the screen
    const hr = this.host.getBoundingClientRect();
    for (const sel of ["#place", "#date", "#clock", "#ground", "#context", "#darksky-badge", ".title-actions"]) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width) taken.push([r.left - hr.left - 6, r.top - hr.top - 4, r.right - hr.left + 6, r.bottom - hr.top + 4]);
    }
    const show = (dir: THREE.Vector3, text: string, cls: string, must = false, pick?: ConstellationLabel) => {
      if (dir.y < 0.01 && (this.effGround() === "solid" || cls === "monument")) return;
      const p = dir.clone().multiplyScalar(SKY_RADIUS).project(this.camera);
      if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) return;
      const x = ((p.x + 1) / 2) * w, y = ((1 - p.y) / 2) * h;
      const centred = cls === "constellation" || cls.startsWith("cardinal") || cls === "monument";
      const bw = text.length * (cls === "constellation" ? 13 : 7) + 14, bh = 20;
      const box: [number, number, number, number] = centred ? [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2] : [x + 4, y + 2, x + 4 + bw, y + 2 + bh];
      if (!must && taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) return;
      taken.push(box);
      const el = this.labelAt(k++);
      el.textContent = text;
      el.className = `sky-label ${cls}`;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.display = "";
      el.onclick = pick && this.onConstellation ? () => this.onConstellation!(pick, dir.clone()) : null;
    };
    for (const [az, txt] of [[0, "N"], [45, "NE"], [90, "E"], [135, "SE"], [180, "S"], [225, "SW"], [270, "W"], [315, "NW"]] as [number, string][]) {
      show(altAzToWorld(1.5, az), txt, txt.length === 1 ? "cardinal" : "cardinal minor", true);
    }
    if (this.layers.labels) for (const m of this.landscape.monuments) show(m.dir.clone().setY(Math.max(m.dir.y, 0.02)).normalize(), m.name, "monument", true);
    if (this.layers.poleTrack) show(s.frame.poleJ2000.clone().applyMatrix3(s.frame.M), "Celestial pole", "pole", true);
    if (this.layers.labels && this.quiet < 0.3) {
      // planets first, then new stars and comets, then stars by brightness, then constellation names
      if (s.bodies && this.layers.planets) {
        for (const b of s.bodies) {
          if (b.name !== "Sun" && b.name !== "Moon" && b.mag > s.limitMag + this.zoomBoost) continue;
          show(new THREE.Vector3(...b.j2000).applyMatrix3(s.frame.M), b.name, "body", true);
        }
      }
      if (s.transient) show(raDecToUnit(s.transient.ra, s.transient.dec).applyMatrix3(s.frame.M), s.transient.name, "transient", true);
      if (s.minors && this.layers.planets && this.fov < 40) {
        for (const m of s.minors) if (m.mag < s.limitMag + this.zoomBoost - 0.5) show(new THREE.Vector3(...m.j2000).applyMatrix3(s.frame.M), m.name, "asteroid");
      }
      if (this.layers.deep && s.scatter === 0) {
        const fovCut = (m: number) => (m < 4.5 ? 120 : m < 6.5 ? 60 : 32);
        for (const o of DEEP) {
          if (this.fov > fovCut(o.mag) || o.mag > s.limitMag + this.zoomBoost + 0.5) continue;
          show(raDecToUnit(o.ra, o.dec).applyMatrix3(s.frame.M), o.name, "deep");
        }
      }
      if (this.layers.planets) for (const c of s.comets) if (c.mag < s.limitMag + 1) show(new THREE.Vector3(...c.head).applyMatrix3(s.frame.M), c.name, "transient");
      if (s.scatter === 0) {
        // wide view: constellation names only. medium: bright named stars. close: fainter named stars too
        const starCut = this.fov > 80 ? -9 : this.fov > 46 ? 1.6 : this.fov > 30 ? 2.8 : 3.8;
        const stars: [number, number, string][] = [];
        for (const [i, nm] of Object.entries(this.catalog.names)) {
          const idx = Number(i), m = this.catalog.data[idx * 8 + 6];
          if (m > Math.min(starCut, s.limitMag)) continue;
          if (s.hideYoung && this.catalog.young.includes(idx)) continue;
          stars.push([m, idx, nm]);
        }
        stars.sort((a, b) => a[0] - b[0]);
        for (const [, idx, nm] of stars.slice(0, 60)) show(this.starWorld(idx), nm, "star");
        if (this.layers.constellations || this.layers.art) {
          const rankCut = this.fov > 46 ? 1 : 3;
          for (const c of this.constellations) {
            if (c.rank > rankCut) continue;
            show(raDecToUnit(c.ra, c.dec).applyMatrix3(s.frame.M), c.name, "constellation", false, c);
          }
        }
      }
    }
    for (let i = k; i < this.labelPool.length; i++) this.labelPool[i].style.display = "none";
  }
}

function smoothFade(y: number) {
  return THREE.MathUtils.smoothstep(y, -0.01, 0.05);
}
