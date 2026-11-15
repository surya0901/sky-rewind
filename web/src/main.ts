import "./style.css";
import * as THREE from "three";
import { buildFrame, LtpTable, loadLtp, LTP_MIN } from "./astro/frame";
import { HISTORICAL_MAX, HISTORICAL_MIN, historicalSky, type BodyState } from "./astro/ephemeris";
import {
  calendarToJD, CURRENT_YEAR, dayOfYear, formatHour, formatYear, localSolarToJD, monthName, usesJulianCalendar, yearsAgo,
} from "./astro/time";
import { SkyEngine, type ConstellationLabel, type StarCatalog, type Transient } from "./sky/engine";
import { Timeline } from "./ui/timeline";
import { Picker } from "./ui/picker";
import { Sound } from "./ui/sound";
import { Search, ERAS, type Suggestion } from "./ui/search";
import { describe } from "./ui/info";
import { cometsAt, type CometState } from "./astro/comets";
import { DEEP, TYPE_NAME, minorsAt, type MinorState } from "./data/deepsky";
import { Paleo, drawWorld, type PaleoData } from "./data/paleo";
import { Borders, type BordersData } from "./data/borders";
import { LAND_RINGS } from "./data/world";
import { phoneSupported, startPhone } from "./ui/phone";
import type { Picked } from "./sky/engine";
import { listen, voiceSupported } from "./ui/voice";
import { parseLocally, type SceneRequest, type SkyEvent } from "./data/knowledge";
import type { Place } from "./data/places";
import { THINK, THINK_ERA, renderThink } from "./ui/think";
import { Globe, explain, explainWithClaude, questions, renderBasis, sourceList, type Answer, type Facts } from "./ui/discovery";
import { describeGround } from "./sky/landscape";
import { mediaFor, loadLocalMedia, LOCAL_MEDIA } from "./data/media";
import { Narrator } from "./ui/narrator";
import { STAR_FACTS, BODY_FACTS } from "./ui/info";
import tzlookup from "@photostructure/tz-lookup";
import { buildBrief, renderBrief, type Audience, type Minutes } from "./ui/brief";

// ---------------------------------------------------------------- types
type Era = "historical" | "deep" | "geologic";

interface Scene {
  place: Place;
  year: number; // astronomical numbering
  month: number;
  day: number;
  hour: number; // local solar time
  event?: SkyEvent;
  /** playback: days added to the whole clock (the sky turns) */
  addDays?: number;
  /** playback: days added for the Moon, planets, comets and new stars only, so the stars hold still */
  shiftDays?: number;
}

interface Params {
  era: Era;
  epoch: number;
  lambda: number;
  H: number;
  lat: number;
  lon: number;
  bodies: BodyState[] | null;
  jd: number | null;
  comets?: CometState[];
  minors?: MinorState[];
  jdBodies?: number;
  paleo?: [number, number] | null; // where this spot sat, for ages over a million years
}

let PALEO: Paleo | null = null;
let BORDERS: Borders | null = null;

const TAU = Math.PI * 2;

function eraOf(year: number): Era {
  if (year >= HISTORICAL_MIN && year <= HISTORICAL_MAX) return "historical";
  if (year >= LTP_MIN) return "deep";
  return "geologic";
}

function derive(s: Scene): Params {
  const era = eraOf(s.year);
  if (era === "historical") {
    const jd = localSolarToJD(s.year, s.month, s.day, s.hour, s.place.lon) + (s.addDays ?? 0);
    const h = historicalSky(jd, s.place.lat, s.place.lon);
    let bodies = h.bodies, jdB = jd;
    if (s.shiftDays) {
      // the Sun keeps its place (and the daylight with it); everything that wanders moves on
      jdB = jd + s.shiftDays;
      const hb = historicalSky(jdB, s.place.lat, s.place.lon);
      bodies = hb.bodies.map((b) => (b.name === "Sun" ? h.bodies[0] : b));
    }
    return { era, epoch: h.epoch, lambda: h.lambdaSun, H: h.hourAngleSun, lat: s.place.lat, lon: s.place.lon, bodies, jd, jdBodies: jdB, comets: cometsAt(jdB), minors: minorsAt(jdB) };
  }
  // Deep and geologic time: the date sets the season, the hour sets local solar time
  const lambda = (TAU * (dayOfYear(s.month, s.day) - 80)) / 365.2422;
  const H = ((s.hour - 12) / 24) * TAU;
  // continents drift: over millions of years the sky depends on where this spot sat then
  const ageMy = (CURRENT_YEAR - s.year) / 1e6;
  const paleo = ageMy >= 1 && PALEO ? PALEO.position(s.place.lat, s.place.lon, ageMy) : null;
  return { era, epoch: s.year, lambda, H, lat: paleo ? paleo[0] : s.place.lat, lon: s.place.lon, bodies: null, jd: null, paleo };
}

const ERA_TEXT: Record<Era, [string, string]> = {
  historical: [
    "Recorded history",
    "Calendar dates, planets and eclipses from Astronomy Engine, with long-term precession. Dates before October 1582 use the Julian calendar. Earth's slowing spin is modelled, and its uncertainty grows the further back you go.",
  ],
  deep: [
    "Deep time",
    "Precession from the Vondrák (2011) long-term model, good to about 200,000 years. Calendars and clocks can't be pinned this far back, so the date sets the season and the slider sets local solar time. The brightest named stars carry their proper motion.",
  ],
  geologic: [
    "Geologic time",
    "The continents move: the Merdith et al. (2021) plate model sets where this spot sat, and that latitude sets the sky. Individual stars have since moved hundreds of light years and Earth's axis wanders chaotically, so the real star patterns of this era are unknown. Today's constellations are drawn as a reference only. Layers can scatter them instead to show the uncertainty.",
  ],
};

// ---------------------------------------------------------------- boot
// The standalone SkyRewind.html embeds its data; a server build loads it from /data.
const EMBEDDED = (window as unknown as { __SKY_DATA__?: Record<string, string> }).__SKY_DATA__;
function asset(path: string): string {
  return EMBEDDED?.[path] ?? path;
}
if (EMBEDDED) {
  // decode embedded data in place (no network), so it also works where fetch of data: URLs is blocked
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const uri = typeof input === "string" ? EMBEDDED[input] : undefined;
    if (!uri) return realFetch(input, init);
    const comma = uri.indexOf(",");
    const type = uri.slice(5, uri.indexOf(";"));
    const bin = atob(uri.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return Promise.resolve(new Response(bytes, { headers: { "Content-Type": type } }));
  };
}

/** fetch a core file, naming it if it fails so the loading screen can say which */
async function need<T>(url: string, read: (r: Response) => Promise<T>): Promise<T> {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    return await read(r);
  } catch (e) {
    throw new Error(`Could not load ${url} (${e instanceof Error ? e.message : e})`);
  }
}

async function boot() {
  const [ltp, starsMeta, starsBin, linesBin, cons, events, mw] = await Promise.all([
    loadLtp(),
    need("/data/stars.json", (r) => r.json()),
    need("/data/stars.bin", (r) => r.arrayBuffer()),
    need("/data/lines.bin", (r) => r.arrayBuffer()),
    need("/data/constellations.json", (r) => r.json()) as Promise<ConstellationLabel[]>,
    need("/data/events.json", (r) => r.json()) as Promise<SkyEvent[]>,
    new THREE.TextureLoader().loadAsync(asset("/data/milkyway.jpg")).catch(() => {
      throw new Error("Could not load /data/milkyway.jpg");
    }),
  ]);
  try {
    PALEO = new Paleo((await fetch("/data/paleo.json").then((r) => r.json())) as PaleoData);
  } catch {
    PALEO = null;
  }
  fetch("/data/borders.json").then((r) => r.json()).then((d) => (BORDERS = new Borders(d as BordersData))).catch(() => null);
  const catalog: StarCatalog = { ...starsMeta, data: new Float32Array(starsBin) };
  const polePath = poleCircle(ltp);
  const engine = new SkyEngine(document.getElementById("sky")!, catalog, new Uint16Array(linesBin), cons, mw, polePath);
  Promise.all([new THREE.TextureLoader().loadAsync(asset("/data/art.webp")), fetch("/data/art.json").then((r) => r.json())])
    .then(([tex, data]) => engine.setArt(tex, data)).catch(() => null);
  const app = new App(engine, ltp, events, catalog, cons);
  (window as unknown as Record<string, unknown>).skyrewind = { engine, app };
  app.start();
  document.getElementById("loading")!.remove();
}

function poleCircle(ltp: LtpTable): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let y = -24000; y <= 3000; y += 100) pts.push(buildFrame(ltp, { epoch: y, lambdaSun: 0, hourAngleSun: 0, latDeg: 0 }).poleJ2000);
  return pts;
}

// ---------------------------------------------------------------- app
class App {
  scene: Scene;
  current: Params;
  travel: { from: Params; to: Params; t: number; dur: number; slideFrom: number; slideTo: number; target: Scene } | null = null;
  playing = false;
  timeline: Timeline;
  tourIndex = -1;
  tourTimer = 0;
  hudTimer = 0;
  last = performance.now();
  targets: string[];

  constructor(private engine: SkyEngine, private ltp: LtpTable, private events: SkyEvent[], catalog: StarCatalog, cons: ConstellationLabel[]) {
    // always open on the real sky, right now, over Princeton
    const home = { name: "Princeton, New Jersey", lat: 40.3431, lon: -74.6551 };
    this.scene = { place: home, ...nowAt(home) };
    this.current = derive(this.scene);
    this.targets = [
      "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pleiades", "Ceres", "Vesta", "Pallas", "Juno",
      ...DEEP.map((o) => o.name), ...DEEP.map((o) => o.id).filter((x) => x.length > 2),
      ...Object.values(catalog.names).filter((n) => n.length > 2),
      ...cons.map((c) => c.name),
    ].sort((a, b) => b.length - a.length);

    this.timeline = new Timeline(document.getElementById("timeline")!, events);
    this.timeline.onCommit = (year) => this.go({ ...this.scene, year, event: undefined });
    this.timeline.onEvent = (e) => this.goEvent(e);
    this.picker = new Picker(document.getElementById("panel-picker")!, this.scene);
    this.picker.onGo = (v) => {
      this.stopTour();
      // a new place on the map means that place now, unless a different date was chosen there too
      const target = v.year === this.scene.year ? { place: v.place, ...nowAt(v.place) } : { ...v, event: undefined };
      this.say(`${v.place.name}, ${target.year === v.year && v.year !== this.scene.year ? formatYear(v.year) : "now"}.`);
      this.go(target);
    };
    this.search = new Search(events, this.targets);
    this.search.load((p) => fetch(p).then((r) => r.json())).then(() => {
      // the city-glow model needs the gazetteer populations: redraw the ground once they arrive
      if (this.travel) return;
      const s = this.scene;
      try {
        this.engine.landscape.build(s.place.lat, s.place.lon, s.year);
        this.current = derive(s);
      } catch (err) {
        console.error(err);
      }
    });
    this.bindUI();
    this.buildMoments();
  }
  picker: Picker;
  sound = new Sound();
  search!: Search;

  private searchActions() {
    return {
      goScene: (req: SceneRequest, label: string) => this.applyRequest(req, label),
      goEvent: (e: SkyEvent) => {
        this.say(`${e.title}.`);
        this.goEvent(e);
      },
      lookAt: (name: string) => {
        const d = this.engine.findTarget(name);
        if (d) {
          this.engine.lookAt(d);
          this.say(`Looking at ${name}.`);
        } else this.say(`${name} isn't above the horizon here right now.`);
      },
    };
  }

  start() {
    this.engine.landscape.build(this.scene.place.lat, this.scene.place.lon, this.scene.year);
    this.picker.paleo = PALEO;
    this.engine.onBolide = () => this.sound.bolide();
    this.engine.onImpact = (k) => this.sound.impact(k);
    const unlock = () => {
      this.sound.unlock();
      this.sound.setAmbient(this.engine.landscape.info.biome, this.engine.landscape.info.lightPollution);
      this.sound.preloadClips();
    };
    window.addEventListener("pointerdown", unlock, { once: false });
    window.addEventListener("keydown", unlock, { once: false });
    const sb = document.getElementById("sound")!;
    sb.addEventListener("click", () => {
      this.sound.setEnabled(!this.sound.enabled);
      sb.setAttribute("aria-pressed", String(this.sound.enabled));
    });
    this.engine.lookAtAltAz(32, 0);
    this.updateHud(true);
    // name every dock button for the first few seconds, so nobody has to guess the icons
    this.setUnit(unitFor(this.scene.year));
    document.body.classList.add("dock-hints");
    window.setTimeout(() => document.body.classList.remove("dock-hints"), 7000);
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      try {
        this.tick(dt);
      } catch (err) {
        this.recover(err);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    // the GPU can drop the canvas (sleep, driver reset): say so instead of leaving it black
    const canvas = this.engine.canvas;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.showRecovery("The graphics card reset the sky. It should come back by itself; if not, reload the page.");
    });
    canvas.addEventListener("webglcontextrestored", () => this.hideRecovery());
    document.getElementById("recover-retry")!.addEventListener("click", () => {
      this.hideRecovery();
      this.go({ ...this.scene, event: undefined });
    });
    document.getElementById("recover-reset")!.addEventListener("click", () => this.resetToPrinceton());
  }

  // ------------------------------------------------------------ recovery: never leave a dead screen
  /** last scene that arrived and rendered without error */
  private safeScene: Scene | null = null;
  private lastError = -Infinity;

  private recover(err: unknown) {
    console.error("Sky Rewind recovered from an error:", err);
    // drop whatever was in flight and fall back to the last scene that worked
    this.travel = null;
    this.show = null;
    if (this.safeScene) {
      this.scene = { ...this.safeScene };
      try {
        this.current = derive(this.scene);
      } catch {
        /* keep the previous frame */
      }
    }
    const now = performance.now();
    if (now - this.lastError > 4000) this.showRecovery("That view could not be drawn, so the last sky is kept.");
    this.lastError = now;
  }

  private showRecovery(text: string) {
    document.getElementById("recover-text")!.textContent = text;
    document.getElementById("recover")!.hidden = false;
  }

  private hideRecovery() {
    document.getElementById("recover")!.hidden = true;
  }

  resetToPrinceton() {
    this.hideRecovery();
    if (this.demo) this.stopDemo();
    const home = { name: "Princeton, New Jersey", lat: 40.3431, lon: -74.6551 };
    this.go({ place: home, ...nowAt(home) });
  }

  // ------------------------------------------------------------ travel
  go(target: Scene) {
    this.endShow(false);
    delete target.addDays;
    delete target.shiftDays;
    document.getElementById("brief")!.hidden = true;
    if (this.sheet !== "time") this.openSheet(null);
    if (this.selected || !document.getElementById("info")!.hidden) this.showInfo(null);
    this.settle = null;
    const from = this.travel ? this.interp(this.travel, ease(Math.min(1, this.travel.t / this.travel.dur))) : this.current;
    const to = derive(target);
    const span = Math.abs(yearsAgo(target.year) - yearsAgo(this.scene.year));
    const dir = target.year < this.scene.year ? -1 : 1;
    // Moon Knight rewind: the whole sky sweeps sideways, left into the past and right into the future,
    // through more full turns for deeper jumps, and lands exactly on the sky of the new date
    // one smooth sideways sweep of the whole sky (exactly one turn, so it lands on the true new sky), with the
    // brightest stars drawing long glowing ribbons across a violet glow: the Moon Knight look, without spinning
    const sweep = span < 1 ? 0 : -dir * TAU;
    const dur = span < 1 ? 1.6 : Math.min(6.5, 4.6 + 0.3 * Math.log10(span + 1));
    if (this.engine.slide === 0) this.engine.captureSlideAxis();
    const slideFrom = this.engine.slide;
    this.travel = { from, to, t: 0, dur, slideFrom, slideTo: slideFrom + sweep, target };
    if (span >= 1) this.sound.rewind(dur, dir);
    this.scene = target;
    this.picker?.set(target);
    this.engine.setMeteors(null);
    this.engine.playBolide(null);
    this.showStory(target.event ?? null);
    (document.getElementById("hour") as HTMLInputElement).value = String(target.hour);
  }

  goEvent(e: SkyEvent) {
    const now = new Date();
    const sentinel = e.year === 0 && e.month === 0;
    this.go({
      place: { name: e.place, lat: e.lat, lon: e.lon },
      year: sentinel ? CURRENT_YEAR : e.year,
      month: sentinel ? now.getMonth() + 1 : e.month,
      day: sentinel ? now.getDate() : e.day,
      hour: e.hour,
      event: e,
    });
  }

  private interp(tr: NonNullable<App["travel"]>, e: number): Params {
    const a = tr.from;
    const b = tr.to;
    // glide through time on a log scale of "years ago" so deep jumps stay readable
    const agoA = CURRENT_YEAR - a.epoch;
    const agoB = CURRENT_YEAR - b.epoch;
    let epoch: number;
    if (agoA > 0 && agoB > 0) {
      const la = Math.log10(agoA + 1);
      const lb = Math.log10(agoB + 1);
      epoch = CURRENT_YEAR - (Math.pow(10, la + (lb - la) * e) - 1);
    } else epoch = a.epoch + (b.epoch - a.epoch) * e;
    const dl = Math.atan2(Math.sin(b.lambda - a.lambda), Math.cos(b.lambda - a.lambda));
    const dH = Math.atan2(Math.sin(b.H - a.H), Math.cos(b.H - a.H));
    return {
      era: eraOf(epoch),
      epoch,
      lambda: a.lambda + dl * e,
      H: a.H + dH * e,
      lat: a.lat + (b.lat - a.lat) * e,
      lon: b.lon,
      bodies: null,
      jd: null,
    };
  }

  private arrive() {
    const s = this.scene;
    this.current = derive(s);
    this.travel = null;
    this.setUnit(unitFor(s.year));
    this.engine.resetSlide();
    this.prevSlide = 0;
    this.dirty = false;
    const e = s.event;
    try {
      this.engine.landscape.build(s.place.lat, s.place.lon, s.year);
    } catch (err) {
      console.error("landscape failed, keeping the previous one", err);
    }
    this.safeScene = { ...s };
    this.hideRecovery();
    this.sound.setAmbient(this.engine.landscape.info.biome, this.engine.landscape.info.lightPollution);
    if (e?.bolide) this.engine.playBolide(e.bolide, e.impact ?? 0);
    if (!document.getElementById("narrator")!.hidden) window.setTimeout(() => this.refreshNarrator(), 400);
    if (e?.meteors) this.engine.setMeteors(e.meteors);
    // let one frame render so targets resolve against the new sky
    requestAnimationFrame(() => {
      const look = e?.look;
      const dir = look?.target ? this.engine.findTarget(look.target) : null;
      if (dir) this.engine.lookAt(dir);
      else if (look?.alt !== undefined && look.az !== undefined) this.engine.lookAtAltAz(look.alt, look.az);
      else if (this.pendingTarget) {
        const d = this.engine.findTarget(this.pendingTarget);
        if (d) this.engine.zoomTo(this.pendingTarget);
      }
      this.pendingTarget = null;
    });
  }
  pendingTarget: string | null = null;
  phoneOn = false;
  reticleTimer = 0;
  daylight = true;
  refSky = true;

  // ------------------------------------------------------------ per frame
  private tick(dt: number) {
    let p: Params;
    let nightLock = 0;
    if (this.travel) {
      this.travel.t += dt;
      const s = Math.min(1, this.travel.t / this.travel.dur);
      p = this.interp(this.travel, ease(s));
      this.timeline.place(p.epoch);
      nightLock = 1 - smooth(0.82, 1.0, s);
      // a sine ease: the sweep starts softly, glides, and slows into the new night without a lurch
      this.engine.slide = this.travel.slideFrom + (this.travel.slideTo - this.travel.slideFrom) * (0.5 - 0.5 * Math.cos(Math.PI * s));
      if (s >= 1) {
        this.arrive();
        p = this.current;
      }
    } else {
      if (this.playing) {
        this.scene.hour += (dt * 900) / 3600; // 15 minutes per second
        if (this.scene.hour >= 24) {
          this.scene.hour -= 24;
          this.advanceDay();
        }
        (document.getElementById("hour") as HTMLInputElement).value = String(this.scene.hour);
        this.current = derive(this.scene);
      }
      if (this.settle) {
        // after a drag the sky keeps gliding the same way and eases into its true position
        this.settle.t += dt;
        const k = Math.min(1, this.settle.t / this.settle.dur);
        this.engine.slide = this.settle.from + (this.settle.to - this.settle.from) * (1 - Math.pow(1 - k, 3));
        if (k >= 1) {
          this.settle = null;
          this.engine.resetSlide();
          this.prevSlide = 0;
          this.finishScrub();
        }
      }
      if (this.show) this.stepShow(dt);
      p = this.current;
      this.timeline.place(this.scene.year);
    }
    // how hard the sky is moving drives the glow, the streaks and the sound
    const speed = Math.abs(this.engine.slide - this.prevSlide) / Math.max(dt, 1e-3);
    this.prevSlide = this.engine.slide;
    const sliding = this.engine.slide !== 0;
    const wantGlow = sliding ? Math.min(1, speed / (this.travel ? 0.8 : 1.1)) : 0;
    this.glow += (wantGlow - this.glow) * (1 - Math.exp(-dt * (wantGlow > this.glow ? 6 : 2.5)));
    if (this.glow < 0.004) this.glow = 0;
    this.engine.rewind = this.glow;
    this.engine.trailBoost = 0.978 * Math.min(1, this.glow * 1.5);
    this.engine.quiet = this.glow > 0.1 || this.travel ? 1 : 0;
    this.sound.scrub(this.travel ? 0 : this.glow);
    nightLock = Math.max(nightLock, Math.min(1, this.glow * 2));
    if (sliding) p = { ...p, bodies: null, jd: null, comets: [], minors: [] };

    const frame = buildFrame(this.ltp, {
      epoch: p.epoch,
      lambdaSun: p.lambda,
      hourAngleSun: p.H,
      latDeg: p.lat,
      precessionOff: p.era === "geologic",
    });
    const sunAlt = THREE.MathUtils.radToDeg(Math.asin(frame.sunWorld.y));
    // the sky stays dark at every hour, as it is above the air, unless Daylight is switched on
    let day = this.daylight ? smooth(-14, 4, sunAlt) * (1 - nightLock) : 0;

    // eclipse: Moon covering the Sun darkens the daytime sky
    let eclipse = 0;
    if (p.bodies) {
      const sun = p.bodies.find((b) => b.name === "Sun")!;
      const moon = p.bodies.find((b) => b.name === "Moon")!;
      const sep = THREE.MathUtils.radToDeg(new THREE.Vector3(...sun.j2000).angleTo(new THREE.Vector3(...moon.j2000)));
      const cover = THREE.MathUtils.clamp((0.526 - sep) / 0.52, 0, 1);
      eclipse = Math.pow(cover, 5);
      day *= 1 - eclipse * 0.92;
    }
    // a soft daytime sky, as in planetarium apps: blue above, but the brighter stars still show
    let limitMag = 6.6 - day * 2.4;
    if (p.bodies) {
      const moon = p.bodies.find((b) => b.name === "Moon")!;
      const mAlt = new THREE.Vector3(...moon.j2000).applyMatrix3(frame.M).y;
      if (mAlt > 0) limitMag -= (moon.phase ?? 0) * 1.3;
    }

    // city glow, with the comparison card able to switch it to an earlier state
    const lpNow = this.travel || sliding ? 0 : this.engine.landscape.info.lightPollution;
    // the comparison card, when open, decides; otherwise the Layers choice: observed sky or dark-sky simulation
    const mode = !document.getElementById("lights")!.hidden ? this.lightMode : this.skyMode === "dark" ? "natural" : "today";
    const lpWant = lpNow * (mode === "natural" ? 0 : mode === "before" ? 0.04 : 1);
    document.getElementById("darksky-badge")!.hidden = !(mode === "natural" && lpNow > 0.05);
    this.lpShown += (lpWant - this.lpShown) * (1 - Math.exp(-dt * 2.2));
    if (Math.abs(lpWant - this.lpShown) < 0.002) this.lpShown = lpWant;
    const lp = this.lpShown;
    this.baseLimit = limitMag;
    this.isNight = day < 0.2;
    limitMag -= lp * 3.4 * (1 - day) + this.engine.dust * 6;
    const ago = yearsAgo(p.epoch);
    // millions of years back the true star patterns are unknown: draw today's as a labelled reference, or scatter them
    const ref = p.era === "geologic" && this.refSky;
    const scatter = p.era === "geologic" && !ref ? THREE.MathUtils.clamp(Math.log10(ago / 2e5) / 2.5, 0, 1) * 0.55 : 0;

    this.engine.setState({
      frame,
      years: ref ? 0 : p.epoch - 2000,
      bodies: p.bodies,
      scatter,
      hideYoung: ago > 5e7 && !ref,
      day,
      limitMag,
      transient: p.jd ? this.transientAt(p.jdBodies ?? p.jd) : null,
      eclipse,
      comets: p.comets ?? [],
      minors: p.minors ?? [],
      lightPollution: lp,
    });
    this.engine.render(dt);
    this.trackMarker();
    this.updateHighlights();
    if (this.phoneOn) {
      this.reticleTimer -= dt;
      if (this.reticleTimer <= 0) {
        this.reticleTimer = 0.3;
        const hit = this.engine.pickCenter();
        if (hit && (!this.selected || hit.name !== this.selected.name)) this.showInfo(hit);
      }
    }

    // a live sky: while showing the present, the clock keeps up with real time
    this.liveTimer -= dt;
    if (this.liveTimer <= 0) {
      this.liveTimer = 20;
      const sc = this.scene;
      if (!this.travel && !this.show && !this.demo && !this.playing && !sc.event && !sc.addDays && !sc.shiftDays && isNow(sc)) {
        Object.assign(sc, nowAt(sc.place));
        this.current = derive(sc);
      }
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.updateHud(false, p, sunAlt);
      this.hudTimer = 0.12;
    }
    this.tourStep(dt);
    this.demoStep(dt);
  }

  private prevSlide = 0;
  private glow = 0;
  private settle: { from: number; to: number; t: number; dur: number } | null = null;
  private dirty = false;
  private liveTimer = 20;
  private yearAcc = 0;
  private dayAcc = 0;
  private lastDir = -1;
  unit: "hour" | "day" | "year" | "century" | "millennium" | "myr" = "century";
  sheet: string | null = null;

  /** The time dial. steps < 0 goes into the past. One step is one small tick. */
  scrubBy(steps: number) {
    if (this.travel || !steps) return;
    this.stopTour();
    this.settle = null;
    const s = this.scene;
    this.lastDir = steps < 0 ? -1 : 1;
    if (this.unit === "hour") {
      let h = s.hour + steps / 10; // one long tick on the dial is one hour
      while (h >= 24) { h -= 24; this.advanceDay(); }
      while (h < 0) { h += 24; this.retreatDay(); }
      s.hour = h;
      (document.getElementById("hour") as HTMLInputElement).value = String(h);
    } else if (this.unit === "day") {
      this.dayAcc += steps;
      const n = Math.trunc(this.dayAcc);
      this.dayAcc -= n;
      for (let i = 0; i < Math.abs(n); i++) n > 0 ? this.advanceDay() : this.retreatDay();
    } else {
      const per = { year: 1, century: 10, millennium: 100, myr: 1e5 }[this.unit];
      this.yearAcc = Math.min(12000, Math.max(-300_000_000, this.yearAcc + steps * per));
      s.year = Math.round(this.yearAcc);
      if (this.engine.slide === 0) this.engine.captureSlideAxis();
      this.engine.slide -= steps * 0.03;
      this.dirty = true;
    }
    s.event = undefined;
    this.showStory(null);
    this.current = derive(s);
    this.hudTimer = 0;
  }

  beginScrub() {
    this.yearAcc = this.scene.year;
    this.dayAcc = 0;
  }

  endScrub() {
    const a = this.engine.slide;
    if (a === 0 || this.travel) return this.finishScrub();
    // keep moving the way the dial was going, to the next whole turn
    const to = (this.lastDir < 0 ? Math.ceil(a / TAU - 1e-6) : Math.floor(a / TAU + 1e-6)) * TAU;
    this.settle = { from: a, to, t: 0, dur: Math.min(2.6, Math.max(0.9, Math.abs(to - a) / 2.4)) };
  }

  private finishScrub() {
    if (!this.dirty) return;
    this.dirty = false;
    const s = this.scene;
    this.picker?.set(s);
    this.engine.landscape.build(s.place.lat, s.place.lon, s.year);
    this.sound.setAmbient(this.engine.landscape.info.biome, this.engine.landscape.info.lightPollution);
  }

  private retreatDay() {
    const s = this.scene;
    s.day -= 1;
    if (s.day < 1) {
      s.month -= 1;
      if (s.month < 1) {
        s.month = 12;
        s.year -= 1;
      }
      s.day = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][s.month - 1];
    }
  }

  private advanceDay() {
    const s = this.scene;
    const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][s.month - 1];
    s.day += 1;
    if (s.day > dim) {
      s.day = 1;
      s.month += 1;
      if (s.month > 12) {
        s.month = 1;
        s.year += 1;
      }
    }
  }

  // ------------------------------------------------------------ watch the moment
  private show: { t: number; dur: number; from: number; to: number; field: "addDays" | "shiftDays"; hold: number; say: (x: number) => string; lastSay: string; reset: boolean } | null = null;

  /** What "watch" does for each kind of moment: a short, real time-lapse computed from the ephemeris. */
  private showPlan(e: SkyEvent): { label: string; run: () => void } | null {
    const target = e.look?.target;
    const H = (x: number) => {
      const m = Math.round(Math.abs(x) * 24 * 60);
      const t = m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
      return m < 2 ? "" : x < 0 ? `${t} before` : `${t} after`;
    };
    const D = (x: number, zero: string) => {
      const d = Math.round(x);
      return d === 0 ? zero : `${Math.abs(d)} ${Math.abs(d) === 1 ? "day" : "days"} ${d < 0 ? "before" : "after"}`;
    };
    const start = (field: "addDays" | "shiftDays", from: number, to: number, dur: number, say: (x: number) => string, follow?: { name: string; fov: number }, reset = false) => {
      this.show = { t: 0, dur, from, to, field, hold: 2.5, say, lastSay: "", reset };
      this.scene[field] = from;
      this.current = derive(this.scene);
      if (follow) this.engine.follow = follow;
      this.sound.chime(true);
    };
    if (e.kind === "eclipse" && target === "Sun") {
      return { label: "Watch the eclipse", run: () => start("addDays", -75 / 1440, 0, 14, (x) => (H(x) ? `${H(x)} maximum` : "Maximum eclipse"), { name: "Sun", fov: 3.2 }) };
    }
    if (e.kind === "eclipse" && target === "Moon") {
      return { label: "Watch the Moon turn red", run: () => start("addDays", -60 / 1440, 0, 14, (x) => (H(x) ? `${H(x)} the deepest point` : "Inside Earth's shadow"), { name: "Moon", fov: 3.5 }) };
    }
    if (e.kind === "comet" && target) {
      return { label: "Watch the comet move", run: () => start("shiftDays", -12, 0, 14, (x) => D(x, "The night of the story"), { name: target, fov: 55 }) };
    }
    if (e.kind === "conjunction" && target) {
      return { label: "Watch the planets meet", run: () => start("shiftDays", -50, 0, 14, (x) => D(x, "The night of the story"), { name: target, fov: 16 }) };
    }
    if (e.kind === "supernova" && e.transient) {
      const span = Math.min(e.transient.daysVisible, 420);
      return { label: "Watch it flare and fade", run: () => {
        const d = this.engine.findTarget(e.transient!.name);
        if (d) this.engine.lookAt(d);
        start("shiftDays", -4, span, 16, (x) => (x < 0 ? "Before anyone noticed" : x < 1 ? "It appears" : `${Math.round(x)} days later`), undefined, true);
      } };
    }
    if (e.kind === "impact" && e.bolide) {
      return { label: "Replay the impact", run: () => this.engine.playBolide(e.bolide!, e.impact ?? 0) };
    }
    if (e.kind === "meteor" && e.meteors) {
      return { label: "Watch the shower", run: () => start("addDays", -40 / 1440, 0, 12, (x) => (H(x) ? H(x) : "The peak"), undefined) };
    }
    if (this.current.era === "historical") {
      return { label: "Watch the sky turn", run: () => start("addDays", -2.5 / 24, 0, 13, (x) => (H(x) ? H(x) : "The moment"), target ? { name: target, fov: this.engine.fov } : undefined) };
    }
    return null;
  }

  private stepShow(dt: number) {
    const sh = this.show!;
    sh.t += dt;
    const k = Math.min(1, sh.t / sh.dur);
    const x = sh.from + (sh.to - sh.from) * (k < 1 ? 0.5 - 0.5 * Math.cos(Math.PI * k) : 1);
    this.scene[sh.field] = x;
    this.current = derive(this.scene);
    const line = sh.say(x);
    if (line !== sh.lastSay) {
      sh.lastSay = line;
      this.caption(line);
    }
    if (k >= 1) {
      sh.hold -= dt;
      if (sh.hold <= 0) this.endShow(sh.reset);
    }
  }

  private endShow(reset: boolean) {
    if (!this.show) return;
    const field = this.show.field;
    this.show = null;
    this.caption(null);
    if (reset) {
      delete this.scene[field];
      this.current = derive(this.scene);
    }
    document.getElementById("story-play")?.classList.remove("on");
  }

  private transientAt(jd: number): Transient | null {
    for (const e of this.events) {
      const tr = e.transient;
      if (!tr) continue;
      const start = calendarToJD(tr.start[0], tr.start[1], tr.start[2]);
      const days = jd - start;
      if (days < -0.5 || days > tr.daysVisible) continue;
      const rise = days < 3 ? (3 - days) * 1.2 : 0;
      const mag = tr.peakMag + (6.8 - tr.peakMag) * Math.max(0, days) / tr.daysVisible + rise;
      return { name: tr.name, ra: tr.ra, dec: tr.dec, mag };
    }
    return null;
  }

  // ------------------------------------------------------------ HUD
  /** choose the dial's step size, and show it */
  setUnit(u: App["unit"]) {
    this.unit = u;
    for (const x of document.querySelectorAll<HTMLElement>("#units button")) x.setAttribute("aria-checked", String(x.dataset.unit === u));
    this.updateDialLabels();
  }

  /** readable values under the dial: two long ticks to either side of now */
  updateDialLabels() {
    const s = this.scene;
    const [l, c, r] = ["dl-l", "dl-c", "dl-r"].map((id) => document.getElementById(id)!);
    const clock = (h: number) => {
      const hh = ((Math.round(h) % 24) + 24) % 24;
      return hh === 0 ? "midnight" : hh === 12 ? "noon" : `${hh % 12 || 12} ${hh < 12 ? "AM" : "PM"}`;
    };
    if (this.unit === "hour") {
      [l.textContent, c.textContent, r.textContent] = [clock(s.hour - 2), clock(s.hour), clock(s.hour + 2)];
      return;
    }
    if (this.unit === "day") {
      [l.textContent, c.textContent, r.textContent] = ["20 days earlier", `${s.day} ${monthName(s.month)}`, "20 days later"];
      return;
    }
    const span = { year: 20, century: 200, millennium: 2000, myr: 2e6 }[this.unit];
    [l.textContent, c.textContent, r.textContent] = [formatYear(s.year - span), formatYear(s.year), formatYear(s.year + span)];
  }

  private updateHud(force: boolean, p: Params = this.current, sunAlt = 0) {
    const s = this.scene;
    const era = this.travel ? eraOf(p.epoch) : eraOf(s.year);
    document.getElementById("place")!.textContent = s.place.name;
    const dateEl = document.getElementById("date")!;
    const clockEl = document.getElementById("clock")!;
    if (this.travel) {
      dateEl.textContent = formatYear(p.epoch);
      dateEl.dataset.note = "";
      document.getElementById("ground")!.textContent = "";
      clockEl.textContent = this.travel.target.year < this.travel.from.epoch ? "Rewinding the sky" : this.travel.target.year > this.travel.from.epoch + 1 ? "Turning the sky forward" : "Moving";
      for (const id of ["return-now", "compare", "context"]) document.getElementById(id)!.hidden = true;
    } else {
      const y = formatYear(s.year);
      if (era === "historical") {
        const cal = usesJulianCalendar(s.year, s.month, s.day) ? "Julian calendar" : "";
        const civil = civilClock(s, true);
        const here = nowAt(s.place);
        const today = s.year === here.year && s.month === here.month && s.day === here.day;
        // one practical line: Now, or the day, then the time people would read off a clock (or the sun)
        const day = isNow(s) ? "Now" : today ? (s.hour >= 17 || s.hour < 5 ? "Tonight" : "Today") : `${s.day} ${monthName(s.month)} ${y}`;
        dateEl.textContent = `${day} · ${civil ?? `${formatHour(s.hour)} local solar time`}`;
        dateEl.dataset.note = s.event ? cal : "";
      } else if (era === "deep") {
        dateEl.textContent = `${seasonName(s.month, s.place.lat)}, ${y}`;
        dateEl.dataset.note = "";
      } else {
        dateEl.textContent = y;
        dateEl.dataset.note = "";
      }
      const sunTxt = era === "geologic" ? "" : sunAlt < -0.8 ? `Sun ${Math.round(-sunAlt)}° below the horizon` : `Sun ${Math.round(sunAlt)}° up`;
      clockEl.textContent = era === "historical" ? sunTxt : `${formatHour(s.hour)} sun time${sunTxt ? ` · ${sunTxt}` : ""}`;
      if (s.place.name === "Custom location") clockEl.textContent += ` · ${Math.abs(s.place.lat).toFixed(1)}° ${s.place.lat >= 0 ? "N" : "S"}, ${Math.abs(s.place.lon).toFixed(1)}° ${s.place.lon >= 0 ? "E" : "W"}`;
      // the two home actions, or a way back to the present after a Moment
      const live = isNow(s) && !s.event;
      const ret = document.getElementById("return-now")!;
      ret.hidden = live || !!this.demo;
      ret.textContent = `Return to now in ${s.place.name.split(",")[0]}`;
      const cmpBtn = document.getElementById("compare")!;
      cmpBtn.hidden = !live || !!this.demo;
      document.getElementById("plan")!.hidden = era !== "historical" || !!s.event || !!this.demo || Math.abs(s.year - CURRENT_YEAR) > 1;
      cmpBtn.textContent = this.engine.landscape.info.lightPollution > 0.3 ? "See what city light hides" : "Compare this sky";
      document.getElementById("explore")!.classList.toggle("accent", false);
      // the HUD keeps to the sky: one science observation. Ground and territory history go in an optional card.
      const notes: string[] = [];
      const context: string[] = [];
      const info = this.engine.landscape.info;
      if (era === "geologic") notes.push(this.refSky ? "Educational reconstruction. Today's constellations shown for reference, the real patterns of this time are unknown" : "Educational reconstruction. Star positions scattered, the real patterns of this time are unknown");
      if (info.label) context.push(info.label);
      const ruled = BORDERS && s.year < 1990 ? BORDERS.at(s.place.lat, s.place.lon, s.year) : null;
      if (ruled) context.push(ruled.ruler ? `Part of ${ruled.name}, under ${ruled.ruler}` : `Land of ${ruled.name}`);
      const ctx = document.getElementById("context") as HTMLDetailsElement;
      // history belongs to the Moments, not the present-day sky
      ctx.hidden = !context.length || !s.event;
      document.getElementById("context-text")!.textContent = context.join(". ") + (context.length ? "." : "");
      if (this.current.paleo) {
        const [pl] = this.current.paleo;
        notes.push(`This spot sat at ${Math.abs(pl).toFixed(0)}° ${pl >= 0 ? "N" : "S"}, ${Math.abs(pl - s.place.lat) < 3 ? "close to its latitude today" : `today it is at ${Math.abs(s.place.lat).toFixed(0)}° ${s.place.lat >= 0 ? "N" : "S"}`}`);
      }
      if ((document.getElementById("lights")!.hidden || this.lightMode === "today") && info.lightPollution > 0.3 && this.skyMode !== "dark" && (this.engine.state?.day ?? 0) < 0.5) notes.push("Estimated city glow hides the faint stars");
      document.getElementById("ground")!.textContent = notes.join(". ") + (notes.length ? "." : "");
      this.drawEarthThen();
    }
    document.getElementById("hour-out")!.textContent = formatHour(s.hour);
    this.updateDialLabels();
    document.getElementById("hour-out2")!.textContent = formatHour(s.hour);
    document.getElementById("scrub-year")!.textContent = this.travel ? formatYear(p.epoch) : this.unit === "hour" || this.unit === "day" ? (era === "historical" ? `${s.day} ${monthName(s.month)} ${formatYear(s.year)}` : formatYear(s.year)) : formatYear(s.year);
    document.getElementById("needle")!.style.transform = `rotate(${-this.engine.heading()}deg)`;
    const pts = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const alt = Math.round((this.engine.pitch * 180) / Math.PI);
    document.getElementById("heading")!.textContent =
      alt > 80 ? "Facing straight up" : `Facing ${pts[Math.round(this.engine.heading() / 45) % 8]}, ${alt}° up`;
    const [name, note] = ERA_TEXT[era];
    const eraName = document.getElementById("era-name")!;
    if (force || eraName.textContent !== name) {
      eraName.textContent = name;
      document.getElementById("era-note")!.textContent = note;
      document.body.dataset.era = era;
    }
  }

  private earthKey = "";
  private drawEarthThen() {
    const fig = document.getElementById("earth-then")!;
    const ageMy = (CURRENT_YEAR - this.scene.year) / 1e6;
    const historic = BORDERS && ageMy < 5 && this.scene.year < 1900 && BORDERS.snapshot(this.scene.year) !== null;
    if ((!PALEO || ageMy < 5) && !historic) {
      fig.hidden = true;
      this.earthKey = "";
      return;
    }
    const key = `${this.scene.year}|${this.scene.place.lat}|${this.scene.place.lon}|${Boolean(BORDERS)}`;
    if (historic) {
      if (key === this.earthKey && !fig.hidden) return;
      this.earthKey = key;
      fig.hidden = false;
      const css = getComputedStyle(document.body);
      const here = BORDERS!.at(this.scene.place.lat, this.scene.place.lon, this.scene.year);
      drawWorld(document.getElementById("earth-canvas") as HTMLCanvasElement, {
        paleo: null, ageMy: 0, rings: LAND_RINGS, marker: [this.scene.place.lat, this.scene.place.lon],
        land: "#3a3e4c", hair: css.getPropertyValue("--hair").trim(), dot: "#888", sand: css.getPropertyValue("--sand").trim(),
        overlay: (g, w, h) => BORDERS!.draw(g, w, h, this.scene.year, here?.name ?? null, { line: "rgba(236,234,244,0.25)", hi: "rgba(217,200,160,0.55)" }),
      });
      const snapTxt = formatYear(here?.snap ?? BORDERS!.snapshot(this.scene.year)!);
      document.getElementById("earth-caption")!.textContent =
        `${here ? `Here: ${here.name}${here.ruler ? `, under ${here.ruler}` : ""}. ` : ""}Borders as of ${snapTxt}, approximate (historical-basemaps).`;
      return;
    }
    if (key === this.earthKey && !fig.hidden) return;
    this.earthKey = key;
    fig.hidden = false;
    const css = getComputedStyle(document.body);
    drawWorld(document.getElementById("earth-canvas") as HTMLCanvasElement, {
      paleo: PALEO!, ageMy, rings: [], marker: this.current.paleo ?? null,
      land: "#4a4e5e", hair: css.getPropertyValue("--hair").trim(), dot: "#888", sand: css.getPropertyValue("--sand").trim(),
    });
    document.getElementById("earth-caption")!.textContent = `Earth ${formatYear(this.scene.year)}. Plate model: ${PALEO!.model}.`;
  }

  private showStory(e: SkyEvent | null) {
    const el = document.getElementById("story")!;
    if (!e) {
      el.hidden = true;
      this.showEvidence(undefined, false);
      return;
    }
    el.hidden = false;
    const when = e.year === 0 && e.month === 0 ? "Tonight" : formatYear(e.year);
    document.getElementById("story-meta")!.textContent = `${when}, ${e.place}. ${capital(e.certainty)}.`;
    {
      const box = document.getElementById("story-think")!;
      box.hidden = true;
      renderThink(box, THINK[e.id] ?? THINK_ERA[this.current.era]);
    }
    {
      const plan = this.showPlan(e);
      const btn = document.getElementById("story-play")!;
      btn.hidden = !plan;
      if (plan) btn.textContent = plan.label;
    }
    document.getElementById("story-title")!.textContent = e.title;
    this.showEvidence(e.id, innerWidth > 1000 && !this.demo);
    document.getElementById("story-body")!.textContent = e.summary;
    const ul = document.getElementById("story-sources")!;
    ul.innerHTML = "";
    for (const src of e.sources) {
      const li = document.createElement("li");
      li.textContent = src;
      ul.appendChild(li);
    }
  }

  // ------------------------------------------------------------ moments + tour
  private momentFilter = "all";
  private static KINDS: [string, string, string[]][] = [
    ["all", "All", []],
    ["wonders", "Ancient sites", ["alignment", "culture"]],
    ["eclipse", "Eclipses", ["eclipse"]],
    ["comet", "Comets", ["comet", "conjunction", "meteor"]],
    ["star", "New stars", ["supernova"]],
    ["impact", "Impacts", ["impact"]],
    ["science", "Discoveries", ["observation"]],
  ];

  private buildMoments() {
    const filters = document.getElementById("moment-filters")!;
    for (const [id, label] of App.KINDS) {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute("aria-pressed", String(id === this.momentFilter));
      b.addEventListener("click", () => {
        this.momentFilter = id;
        for (const x of filters.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
        this.renderMoments();
      });
      filters.appendChild(b);
    }
    this.renderMoments();
  }

  private renderMoments() {
    const list = document.getElementById("moments-list")!;
    list.innerHTML = "";
    const kinds = App.KINDS.find((k) => k[0] === this.momentFilter)![2];
    const byId = (id: string) => this.events.find((e) => e.id === id);
    const deep = (e: SkyEvent) => e.year !== 0 && e.year < -12000;
    const TONIGHT = ["princeton_tonight", "eclipse2027", "matariki", "emu"];
    const FIRST = ["giza2560", "stonehenge2500"];
    const chrono = (a: SkyEvent, b: SkyEvent) => a.year - b.year;
    type Card = { title: string; meta: string; why: string; go: () => void };
    const fromEvent = (e: SkyEvent): Card => ({
      title: e.title,
      meta: `${e.place} · ${e.year === 0 && e.month === 0 ? "Tonight" : e.month ? `${e.day ? `${e.day} ` : ""}${monthName(e.month)} ${formatYear(e.year)}` : formatYear(e.year)}`,
      why: firstSentence(e.summary),
      go: () => {
        this.stopTour();
        this.goEvent(e);
      },
    });
    const keep = (e: SkyEvent | undefined): e is SkyEvent => !!e && (!kinds.length || kinds.includes(e.kind));
    const home = { name: "Princeton, New Jersey", lat: 40.3431, lon: -74.6551 };
    const sections: [string, Card[]][] = [
      ["Tonight & upcoming", TONIGHT.map(byId).filter(keep).map(fromEvent)],
      ["Light pollution", this.momentFilter === "all" ? [
        { title: "City glow vs dark sky", meta: "Princeton, New Jersey · Now", why: "Same place, same moment: see which stars the estimated city glow hides.", go: () => {
          this.stopTour();
          this.go({ place: home, ...nowAt(home) });
          window.setTimeout(() => this.setLights(true, "natural"), 1900);
        } },
        { title: "Before electric light", meta: "Princeton, New Jersey · 1850", why: "Oil and gas lamps added almost no sky glow, so the Milky Way still arched over town.", go: () => {
          this.stopTour();
          this.go({ place: home, year: 1850, month: 11, day: 12, hour: 21 });
        } },
      ] : []],
      ["Human sky stories", [
        ...FIRST.map(byId).filter(keep),
        ...this.events.filter((e) => ["alignment", "culture", "observation"].includes(e.kind) && !deep(e) && !TONIGHT.includes(e.id) && !FIRST.includes(e.id)).filter(keep).sort(chrono),
      ].map(fromEvent)],
      ["Comets & rare events", this.events.filter((e) => ["comet", "eclipse", "supernova", "impact", "meteor", "conjunction"].includes(e.kind) && !deep(e) && !TONIGHT.includes(e.id)).filter(keep).sort(chrono).map(fromEvent)],
      ["Deep time", this.events.filter((e) => deep(e)).filter(keep).sort(chrono).map(fromEvent)],
    ];
    for (const [label, cards] of sections) {
      if (!cards.length) continue;
      const h = document.createElement("h3");
      h.textContent = label;
      const ol = document.createElement("ol");
      ol.className = "mcards";
      for (const c of cards) {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.className = "mcard";
        b.innerHTML = `<span class="m-title"></span><span class="m-meta"></span><span class="m-why"></span><span class="m-go">View this sky</span>`;
        b.querySelector(".m-title")!.textContent = c.title;
        b.querySelector(".m-meta")!.textContent = c.meta;
        b.querySelector(".m-why")!.textContent = c.why;
        b.addEventListener("click", c.go);
        li.appendChild(b);
        ol.appendChild(li);
      }
      list.append(h, ol);
    }
  }


  private TOUR = ["princeton_tonight", "giza2560", "stonehenge2500", "sn1054", "eclipse2017", "dart2022", "princeton_tonight"];

  private startTour() {
    this.tourIndex = 0;
    this.tourTimer = 0;
    document.getElementById("tour")!.textContent = "Stop the tour";
    this.goEvent(this.events.find((e) => e.id === this.TOUR[0])!);
  }

  private stopTour() {
    this.tourIndex = -1;
    document.getElementById("tour")!.textContent = "Take the sky tour · 80 sec";
  }

  private tourStep(dt: number) {
    if (this.tourIndex < 0 || this.travel) return;
    this.tourTimer += dt;
    if (this.tourTimer < 11) return;
    this.tourTimer = 0;
    this.tourIndex++;
    if (this.tourIndex >= this.TOUR.length) return this.stopTour();
    this.goEvent(this.events.find((e) => e.id === this.TOUR[this.tourIndex])!);
  }

  // ------------------------------------------------------------ input
  private bindUI() {
    this.bindDiscovery();
    for (const b of document.querySelectorAll<HTMLButtonElement>(".layers button")) {
      b.addEventListener("click", () => {
        const k = b.dataset.layer as keyof SkyEngine["layers"];
        this.engine.layers[k] = !this.engine.layers[k];
        b.setAttribute("aria-pressed", String(this.engine.layers[k]));
      });
    }
    const hour = document.getElementById("hour") as HTMLInputElement;
    hour.addEventListener("input", () => {
      this.scene.hour = Number(hour.value);
      if (!this.travel) this.current = derive(this.scene);
    });
    // tap or click a star, planet or the Moon to identify it (ignored if the pointer dragged)
    const canvas = this.engine.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY };
      if (this.sheet && this.sheet !== "time") this.openSheet(null);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const hit = this.engine.pick(e.clientX, e.clientY);
      if (hit) this.sound.tick();
      this.showInfo(hit);
    });
    document.getElementById("info-close")!.addEventListener("click", () => this.showInfo(null));

    // point-your-phone mode
    const phoneBtn = document.getElementById("phone")!;
    if (phoneSupported()) phoneBtn.hidden = false;
    let stopPhone: (() => void) | null = null;
    phoneBtn.addEventListener("click", async () => {
      if (stopPhone) {
        stopPhone();
        stopPhone = null;
        this.phoneOn = false;
        this.engine.deviceQuat = null;
        document.body.classList.remove("phone-mode");
        document.getElementById("reticle")!.hidden = true;
        phoneBtn.textContent = "Point your phone at the sky";
        return;
      }
      try {
        stopPhone = await startPhone((q) => (this.engine.deviceQuat = q));
        this.phoneOn = true;
        document.body.classList.add("phone-mode");
        this.openSheet(null);
        document.getElementById("reticle")!.hidden = false;
        phoneBtn.textContent = "Stop pointing";
      } catch (err) {
        this.say((err as Error).message);
      }
    });
    const play = document.getElementById("play")!;
    play.addEventListener("click", () => {
      this.playing = !this.playing;
      play.setAttribute("aria-pressed", String(this.playing));
      play.textContent = this.playing ? "Pause" : "Play time";
    });

    // dock: each button opens its sheet above it; tap again or tap the sky to dismiss
    for (const b of document.querySelectorAll<HTMLButtonElement>(".dock [data-sheet]")) {
      b.addEventListener("click", () => this.openSheet(this.sheet === b.dataset.sheet ? null : b.dataset.sheet!));
    }
    document.getElementById("btn-compass")!.addEventListener("click", () => {
      this.engine.lookAtAltAz(Math.max(22, (this.engine.pitch * 180) / Math.PI > 75 ? 30 : (this.engine.pitch * 180) / Math.PI), 0);
      this.say("Facing north");
    });
    document.getElementById("story-close")!.addEventListener("click", () => this.showStory(null));

    // time dial: drag left for the past, right for the future
    const dial = document.getElementById("dial")!;
    const ticks = dial.querySelector<HTMLElement>(".dial-ticks")!;
    let dragX: number | null = null;
    let dialX = 0;
    const move = (dx: number) => {
      dialX += dx;
      ticks.style.setProperty("--dial-x", `${((dialX % 100) + 100) % 100}px`);
      this.scrubBy(dx / 10);
    };
    dial.addEventListener("pointerdown", (e) => {
      dragX = e.clientX;
      dial.setPointerCapture(e.pointerId);
      this.beginScrub();
    });
    dial.addEventListener("pointermove", (e) => {
      if (dragX === null) return;
      move(e.clientX - dragX);
      dragX = e.clientX;
    });
    const up = () => {
      if (dragX === null) return;
      dragX = null;
      this.endScrub();
    };
    dial.addEventListener("pointerup", up);
    dial.addEventListener("pointercancel", up);
    dial.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.beginScrub();
      move(-(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.5);
      clearTimeout(wheelEnd);
      wheelEnd = window.setTimeout(() => this.endScrub(), 220);
    }, { passive: false });
    let wheelEnd = 0;
    dial.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      this.beginScrub();
      move(e.key === "ArrowLeft" ? -10 : 10);
      clearTimeout(wheelEnd);
      wheelEnd = window.setTimeout(() => this.endScrub(), 350);
    });
    for (const b of document.querySelectorAll<HTMLButtonElement>("#skymode-seg button")) {
      b.addEventListener("click", () => {
        this.skyMode = b.dataset.sky as App["skyMode"];
        for (const x of document.querySelectorAll("#skymode-seg button")) x.setAttribute("aria-checked", String(x === b));
        this.say(this.skyMode === "dark" ? "Dark-sky baseline: the same sky with no artificial light." : "Observed sky: with this place's modelled city glow.");
        this.updateHud(true);
      });
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>("#units button")) {
      b.addEventListener("click", () => {
        this.setUnit(b.dataset.unit as App["unit"]);
        this.hudTimer = 0;
      });
    }

    const fsBtn = document.getElementById("fullscreen")!;
    const toggleFs = () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else document.documentElement.requestFullscreen?.().catch(() => this.say("Full screen isn't available here."));
    };
    fsBtn.addEventListener("click", toggleFs);
    document.addEventListener("fullscreenchange", () => fsBtn.setAttribute("aria-pressed", String(Boolean(document.fullscreenElement))));
    window.addEventListener("keydown", (e) => {
      const typing = ["INPUT", "SELECT", "TEXTAREA"].includes((e.target as HTMLElement).tagName);
      if (e.key === "Escape") {
        if (this.demo) this.stopDemo();
        else if (!document.getElementById("narrator")!.hidden) this.closeNarrator();
        else if (!document.getElementById("explain")!.hidden) document.getElementById("explain")!.hidden = true;
        else if (!document.getElementById("lights")!.hidden) this.setLights(false);
        else if (this.sheet) this.openSheet(null);
        else if (!document.getElementById("info")!.hidden) this.showInfo(null);
        (e.target as HTMLElement).blur?.();
      }
      if (!typing && (e.key === "f" || e.key === "F")) toggleFs();
      if ((!typing && e.key === "/") || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        this.openSheet("search");
      }
      const onButton = (e.target as HTMLElement).tagName === "BUTTON";
      if (!typing && !onButton && e.key === " ") {
        e.preventDefault();
        document.getElementById("play")!.click();
        this.say(this.playing ? "Time is running" : "Time paused");
      }
      if (!typing && !e.metaKey && !e.ctrlKey && (e.key === "r" || e.key === "R")) {
        this.engine.fov = 70;
        this.engine.lookAtAltAz(32, 0);
      }
    });
    document.getElementById("tour")!.addEventListener("click", () => {
      this.openSheet(null);
      if (this.demo) this.stopDemo();
      else this.startDemo();
    });

    const form = document.getElementById("ask") as HTMLFormElement;
    const input = document.getElementById("ask-input") as HTMLInputElement;
    const box = document.getElementById("suggest")!;
    let items: Suggestion[] = [];
    let active = -1;
    const close = () => {
      box.hidden = true;
      input.setAttribute("aria-expanded", "false");
      active = -1;
    };
    const render = () => {
      box.innerHTML = "";
      if (!items.length) return close();
      let last = "";
      items.forEach((it, i) => {
        if (it.group !== last) {
          const h = document.createElement("li");
          h.className = "sg-h";
          h.setAttribute("role", "presentation");
          h.textContent = it.group;
          box.appendChild(h);
          last = it.group;
        }
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.id = `sg-${i}`;
        li.className = it.group === "Go" ? "sg-go" : "";
        li.setAttribute("aria-selected", String(i === active));
        li.innerHTML = `<span class="sg-t"></span><span class="sg-m"></span>`;
        li.querySelector(".sg-t")!.textContent = it.title;
        li.querySelector(".sg-m")!.textContent = it.meta;
        li.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          choose(i);
        });
        box.appendChild(li);
      });
      box.hidden = false;
      input.setAttribute("aria-expanded", "true");
      input.setAttribute("aria-activedescendant", active >= 0 ? `sg-${active}` : "");
    };
    const choose = (i: number) => {
      const it = items[i];
      if (!it) return;
      close();
      this.stopTour();
      it.apply();
    };
    input.addEventListener("input", () => {
      items = this.search.suggest(input.value, this.searchActions());
      active = -1;
      render();
    });
    input.addEventListener("keydown", (e) => {
      if (box.hidden) return;
      if (e.key === "ArrowDown") { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
      if (e.key === "ArrowUp") { active = Math.max(-1, active - 1); render(); e.preventDefault(); }
      if (e.key === "Escape") { close(); e.stopPropagation(); }
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      if (active >= 0) return choose(active);
      // a confident local match goes straight there; anything else asks Claude
      const strong = items[0] && (items[0].group === "Go" || items[0].group === "Eras" || (items[0].group === "Moments" && items.filter((x) => x.group === "Moments").length === 1));
      close();
      if (strong) return choose(0);
      this.ask(text);
    });
    const dest = document.getElementById("dest")!;
    for (const er of ERAS) {
      const b = document.createElement("button");
      b.textContent = er.name;
      b.title = er.note;
      b.addEventListener("click", () => {
        this.stopTour();
        this.applyRequest({ year: er.year, place: er.place ? { name: er.place[0], lat: er.place[1], lon: er.place[2] } : undefined }, er.name);
      });
      dest.appendChild(b);
    }
    const mic = document.getElementById("mic")!;
    if (!voiceSupported()) {
      mic.setAttribute("disabled", "");
      mic.title = "Voice input needs Chrome, Edge or Safari";
    }
    let stop: (() => void) | null = null;
    mic.addEventListener("click", () => {
      if (stop) return stop();
      mic.classList.add("listening");
      this.say("Listening");
      stop = listen(
        (t) => (input.value = t),
        (t) => {
          input.value = t;
          this.ask(t);
        },
        (err) => {
          mic.classList.remove("listening");
          stop = null;
          if (err) this.say(err === "not-allowed" ? "Microphone access was blocked. Allow it in the browser to speak requests." : "Didn't catch that. Try again or type the request.");
        },
      );
    });
  }

  // ------------------------------------------------------------ discovery layer
  lightMode: "natural" | "before" | "today" = "today";
  /** Layers: the observed sky with its modelled city glow, or a dark-sky simulation without it */
  skyMode: "observed" | "dark" = "observed";
  private lpShown = 0;
  private baseLimit = 6.6;
  private isNight = true;
  private globe: Globe | null = null;
  private placePick: Place | null = null;

  /** Everything the explanations are allowed to say, computed from the live scene. */
  facts(): Facts {
    const s = this.scene, p = this.current;
    const pole = this.engine.state ? this.engine.nearestNamed(this.engine.state.frame.poleJ2000) : null;
    const hist = p.era === "historical";
    const f: Facts = {
      place: s.place.name, lat: s.place.lat, lon: s.place.lon,
      when: hist ? `${s.day} ${monthName(s.month)} ${formatYear(s.year)}, ${formatHour(s.hour)} local solar time` : formatYear(s.year),
      year: s.year, ago: Math.max(0, yearsAgo(s.year)), era: p.era,
      poleStar: p.era === "geologic" ? null : pole?.name ?? null, poleSep: pole?.sep ?? 0,
      lpToday: describeGround(s.place.lat, s.place.lon, new Date().getFullYear()).lightPollution,
    };
    if (s.event) f.event = { title: s.event.title, summary: s.event.summary, sources: s.event.sources, certainty: s.event.certainty };
    if (this.selected) {
      const d = this.selected.dir;
      f.selected = { name: this.selected.name, kind: this.selected.kind, alt: THREE.MathUtils.radToDeg(Math.asin(d.y)), az: (THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z)) + 360) % 360 };
    }
    return f;
  }

  openBasis() {
    renderBasis(document.getElementById("basis-body")!, this.facts());
    const d = document.getElementById("basis") as HTMLDialogElement;
    if (!d.open) d.showModal();
  }

  private explainRun = 0;
  openExplain(ask?: string) {
    const card = document.getElementById("explain")!;
    this.setLights(false);
    this.openSheet(null);
    document.getElementById("evidence")!.hidden = true;
    card.hidden = false;
    const f = this.facts();
    const qs = questions(f);
    const box = document.getElementById("explain-qs")!;
    box.innerHTML = "";
    const show = (q: { id: string; text: string }) => {
      for (const b of box.children) b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.q === q.id));
      const facts = this.facts();
      const draft = explain(q.id, facts);
      this.renderAnswer(draft, "Built from this scene's computed values.");
      const run = ++this.explainRun;
      explainWithClaude(q.text, facts, draft).then((a) => {
        if (a && run === this.explainRun && !card.hidden) this.renderAnswer(a, "Worded by Claude from this scene's computed values and the sources listed.");
      });
    };
    for (const q of qs) {
      const b = document.createElement("button");
      b.textContent = q.text;
      b.dataset.q = q.id;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => show(q));
      box.appendChild(b);
    }
    show(qs.find((q) => q.id === ask) ?? qs[0]);
  }

  private renderAnswer(a: Answer, by: string) {
    const out = document.getElementById("explain-answer")!;
    out.innerHTML = "";
    const part = (h: string, t: string) => {
      const d = document.createElement("div");
      const hh = document.createElement("h3");
      hh.textContent = h;
      const p = document.createElement("p");
      p.textContent = t;
      d.append(hh, p);
      out.appendChild(d);
    };
    part("What you are seeing", a.seeing);
    part("Why it happens", a.physics);
    part("Why it matters", a.matters);
    part("Confidence and limits", a.confidence);
    const d = document.createElement("div");
    const hh = document.createElement("h3");
    hh.textContent = "Sources";
    d.append(hh, sourceList(a.sources, a.extra));
    out.appendChild(d);
    const note = document.createElement("p");
    note.className = "by";
    note.textContent = by;
    out.appendChild(note);
  }

  /** The three-state comparison: the same sky with today's glow, with almost none, with none. */
  private briefFor: { audience: Audience; minutes: Minutes } = { audience: "middle", minutes: 20 };
  openBrief() {
    const host = document.getElementById("brief")!;
    if (!this.engine.state) return;
    this.setLights(false);
    this.openSheet(null);
    document.getElementById("explain")!.hidden = true;
    const s = this.scene;
    const lp = this.engine.landscape.info.lightPollution;
    const when = document.getElementById("date")!.textContent ?? "";
    const b = buildBrief(this.engine, { place: s.place.name, when, lat: s.place.lat, limCity: this.baseLimit - lp * 3.4, limDark: this.baseLimit, glow: lp }, this.briefFor.audience, this.briefFor.minutes);
    renderBrief(host, b, {
      look: (name) => {
        const d = this.engine.findTarget(name);
        if (d) this.engine.lookAt(d);
      },
      rebuild: (audience, minutes) => {
        this.briefFor = { audience, minutes };
        const top = host.scrollTop;
        this.openBrief();
        host.scrollTop = top;
      },
      close: () => (host.hidden = true),
    });
    host.hidden = false;
  }

  setLights(open: boolean, mode: App["lightMode"] = "today") {
    const card = document.getElementById("lights")!;
    card.hidden = !open;
    document.getElementById("lights-btn")!.setAttribute("aria-pressed", String(open));
    this.lightMode = open ? mode : "today";
    if (!open) return;
    document.getElementById("brief")!.hidden = true;
    document.getElementById("explain")!.hidden = true;
    this.openSheet(null);
    for (const b of document.querySelectorAll<HTMLElement>("#lights-seg button")) b.setAttribute("aria-checked", String(b.dataset.light === this.lightMode));
    const s = this.scene;
    const lp = this.engine.landscape.info.lightPollution;
    const text = document.getElementById("lights-text")!, count = document.getElementById("lights-count")!;
    count.textContent = "";
    if (lp < 0.03) {
      text.textContent = s.year < 1900
        ? `In ${formatYear(s.year)} there is no electric light here: this is already the natural sky. Jump to today in a city to compare.`
        : `No large city lies within 60 km of ${s.place.name} in this model, so the sky here is close to naturally dark.`;
      return;
    }
    text.textContent = {
      today: `${s.place.name.split(",")[0]} tonight, with the estimated glow of nearby cities.`,
      before: "Before electric light: oil and gas lamps added almost no sky glow. A reconstruction, not a measured historical light map.",
      natural: "Dark-sky baseline: same place, same time, with no artificial light.",
    }[this.lightMode];
    if (this.isNight) {
      const lim = (k: number) => this.baseLimit - lp * k * 3.4;
      const n = (k: number) => Math.round(this.engine.countVisible(lim(k)) / 10) * 10;
      const k = this.lightMode === "natural" ? 0 : this.lightMode === "before" ? 0.04 : 1;
      // one big number for the sky on screen, and the comparison underneath it
      count.innerHTML = "";
      const big = document.createElement("span");
      big.className = "lc-num";
      big.textContent = n(k).toLocaleString();
      const lab = document.createElement("span");
      lab.className = "lc-lab";
      lab.textContent = `modelled visible catalogue stars (faintest magnitude ${lim(k).toFixed(1)})`;
      const cmp = document.createElement("span");
      cmp.className = "lc-cmp";
      cmp.textContent = `Tonight ${n(1).toLocaleString()} · Dark-sky baseline ${n(0).toLocaleString()}. Same place, same time: the difference is artificial light.`;
      count.append(big, lab, cmp);
    } else count.textContent = "Star counts appear at night.";
  }

  private setPlacePick(p: Place, turn = true) {
    this.placePick = p;
    document.getElementById("place-name")!.textContent = p.name;
    document.getElementById("place-coords")!.textContent = `${Math.abs(p.lat).toFixed(2)}° ${p.lat >= 0 ? "N" : "S"}, ${Math.abs(p.lon).toFixed(2)}° ${p.lon >= 0 ? "E" : "W"} (approximate)`;
    document.getElementById("place-extra")!.textContent = `${p.lat >= 0 ? "Northern" : "Southern"} hemisphere. Local solar time stays ${formatHour(this.scene.hour)}.`;
    const here = this.scene.place, dLat = p.lat - here.lat, pole = Math.abs(p.lat).toFixed(0);
    document.getElementById("place-insight")!.textContent =
      `The ${p.lat >= 0 ? "north" : "south"} celestial pole stands ${pole}° above the horizon here, and stars within ${pole}° of it never set.` +
      (Math.abs(dLat) > 3 ? ` Compared with ${here.name}, stars up to ${Math.abs(dLat).toFixed(0)}° further ${dLat < 0 ? "south" : "north"} rise into view.` : "");
    if (this.globe) {
      this.globe.selected = { lat: p.lat, lon: p.lon };
      if (turn) this.globe.focus(p.lat, p.lon);
      else this.globe.draw();
    }
  }

  private bindDiscovery() {
    void loadLocalMedia();
    const $ = (id: string) => document.getElementById(id)!;
    for (const b of document.querySelectorAll<HTMLElement>("#ground-seg button")) {
      b.addEventListener("click", () => {
        const m = b.dataset.ground as "auto" | "solid" | "glass" | "space";
        this.engine.setGroundMode(m);
        for (const x of document.querySelectorAll("#ground-seg button")) x.setAttribute("aria-checked", String(x === b));
        this.say(m === "auto" ? "Look through Earth: drag down past the horizon to see the sky on the far side." : m === "glass" ? "See-through ground. Drag down to look through the Earth." : m === "space" ? "No ground. The whole sphere of sky is around you." : "Solid ground. The view stops at the horizon.");
      });
    }
    $("story-evidence").addEventListener("click", () => this.showEvidence(this.scene.event?.id, $("evidence").hidden));
    $("evidence-close").addEventListener("click", () => ($("evidence").hidden = true));
    $("life").addEventListener("click", () => {
      this.engine.landscape.showLife = !this.engine.landscape.showLife;
      $("life").setAttribute("aria-pressed", String(this.engine.landscape.showLife));
    });
    $("daylight").addEventListener("click", () => {
      this.daylight = !this.daylight;
      $("daylight").setAttribute("aria-pressed", String(this.daylight));
      this.say(this.daylight ? "Daylight on. The Sun lights the sky by day." : "Dark sky at every hour, so the stars always show.");
    });
    $("refsky").addEventListener("click", () => {
      this.refSky = !this.refSky;
      $("refsky").setAttribute("aria-pressed", String(this.refSky));
      this.say(this.refSky ? "Today's constellations, drawn as a reference in deep time." : "Deep-time stars scattered, because their real positions are unknown.");
    });
    $("info-explain").addEventListener("click", () => this.narrateSelected());
    $("info-zoom").addEventListener("click", () => {
      if (!this.selected) return;
      this.engine.zoomTo(this.selected.name);
      $("info-zoom").hidden = true;
    });
    $("info-basis").addEventListener("click", () => this.openBasis());
    this.engine.onConstellation = (con, dir) => {
      this.showInfo(null);
      const alt = THREE.MathUtils.radToDeg(Math.asin(dir.y)), az = (THREE.MathUtils.radToDeg(Math.atan2(dir.x, -dir.z)) + 360) % 360;
      this.fillInfo(con.name, "Constellation", [`Centre ${alt.toFixed(0)}° up, azimuth ${az.toFixed(0)}°`, "One of the 88 constellations the International Astronomical Union recognises today", "Figure and lines follow the Stellarium western sky culture"], alt > 0, "", "Lines and artwork: Stellarium sky cultures. Star positions: Hipparcos-based catalogue.");
    };
    $("now").addEventListener("click", () => {
      const d = new Date(), lon = this.scene.place.lon;
      const hour = (((d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15) % 24) + 24) % 24;
      this.stopTour();
      this.go({ place: this.scene.place, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour });
      this.say(`Now, over ${this.scene.place.name}.`);
    });
    $("red").addEventListener("click", () => $("red").setAttribute("aria-pressed", String(document.documentElement.classList.toggle("red"))));
    // controls dim when nothing has moved for a while, and return on any input
    let idleTimer = 0;
    const wake = () => {
      document.body.classList.remove("idle");
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => document.body.classList.add("idle"), 8000);
    };
    for (const ev of ["pointermove", "pointerdown", "keydown", "wheel"]) window.addEventListener(ev, wake, { passive: true });
    wake();
    // a faint ring shows what a click would select
    const hover = document.createElement("div");
    hover.className = "sky-hover";
    hover.hidden = true;
    document.body.appendChild(hover);
    let lastHover = 0;
    const cv = this.engine.renderer.domElement;
    cv.addEventListener("pointermove", (e) => {
      if (e.buttons || e.pointerType !== "mouse" || performance.now() - lastHover < 70) return void (e.buttons && (hover.hidden = true));
      lastHover = performance.now();
      const hit = this.travel ? null : this.engine.pick(e.clientX, e.clientY, 18);
      const major = hit && (hit.kind !== "star" || hit.mag < 3);
      hover.hidden = !major;
      if (major) {
        const p = hit.dir.clone().multiplyScalar(100).project(this.engine.camera);
        const r = cv.getBoundingClientRect();
        hover.style.left = `${r.left + ((p.x + 1) / 2) * r.width}px`;
        hover.style.top = `${r.top + ((1 - p.y) / 2) * r.height}px`;
      }
    });
    cv.addEventListener("pointerleave", () => (hover.hidden = true));
    this.globe = new Globe($("globe") as HTMLCanvasElement, (lat, lon) => {
      const near = this.search.nearest?.(lat, lon);
      this.setPlacePick({ name: near ?? "Custom location", lat, lon }, false);
    });
    const input = $("place-input") as HTMLInputElement, results = $("place-results");
    const fill = () => {
      results.innerHTML = "";
      for (const r of this.search.places(input.value, 5)) {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.tabIndex = 0;
        const t = document.createElement("span");
        t.className = "sg-t";
        t.textContent = r[0];
        const m = document.createElement("span");
        m.className = "sg-m";
        m.textContent = [r[3], r[5]].filter((x) => typeof x === "string" && x).join(". ");
        li.append(t, m);
        const pick = () => {
          this.setPlacePick({ name: r[0], lat: r[1], lon: r[2] });
          results.innerHTML = "";
          input.value = r[0];
        };
        li.addEventListener("click", pick);
        li.addEventListener("keydown", (e) => e.key === "Enter" && pick());
        results.appendChild(li);
      }
    };
    input.addEventListener("input", fill);
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      // typed coordinates, such as "13.08, 80.27" or "-33.9 151.2"
      const m = input.value.trim().match(/^(-?\d{1,2}(?:\.\d+)?)[\s,]+(-?\d{1,3}(?:\.\d+)?)$/);
      if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) {
        const lat = +m[1], lon = +m[2];
        this.setPlacePick({ name: this.search.nearest?.(lat, lon) ?? "Custom location", lat, lon });
        results.innerHTML = "";
        return;
      }
      const first = this.search.places(input.value, 1)[0];
      if (first) {
        this.setPlacePick({ name: first[0], lat: first[1], lon: first[2] });
        results.innerHTML = "";
      }
    });
    const quick: [string, number, number][] = [["Princeton", 40.3573, -74.6672], ["Giza", 29.9792, 31.1342], ["Rome", 41.9028, 12.4964], ["Stonehenge", 51.1789, -1.8262], ["Uluru", -25.3444, 131.0369]];
    const qbox = $("place-quick");
    const chip = (label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", fn);
      qbox.appendChild(b);
    };
    chip("My hometown", () => {
      const fail = () => {
        this.say("Location isn't available here. Search for your town instead.");
        input.focus();
      };
      if (!navigator.geolocation) return fail();
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        this.setPlacePick({ name: this.search.nearest?.(lat, lon) ?? "My location", lat, lon });
      }, fail, { timeout: 8000 });
    });
    for (const [n, lat, lon] of quick) chip(n, () => this.setPlacePick({ name: n, lat, lon }));
    $("place-go").addEventListener("click", () => {
      const p = this.placePick ?? this.scene.place;
      this.stopTour();
      this.openSheet(null);
      this.say(`The sky over ${p.name}, right now.`);
      try {
        this.go({ place: p, ...nowAt(p) });
      } catch (err) {
        this.recover(err);
      }
    });
    $("place-reset").addEventListener("click", () => {
      this.openSheet(null);
      this.resetToPrinceton();
    });

    $("story-basis").addEventListener("click", () => this.openBasis());
    $("layers-basis").addEventListener("click", () => this.openBasis());
    $("basis-close").addEventListener("click", () => ($("basis") as HTMLDialogElement).close());
    $("basis").addEventListener("click", (e) => e.target === $("basis") && ($("basis") as HTMLDialogElement).close());
    $("story-explain").addEventListener("click", () => { this.openNarrator(); this.playScene(); });
    $("story-think-btn").addEventListener("click", () => {
      const box = $("story-think");
      box.hidden = !box.hidden;
      $("story-think-btn").classList.toggle("on", !box.hidden);
      if (!box.hidden) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    $("story-play").addEventListener("click", () => {
      const e = this.scene.event;
      if (!e || this.travel) return;
      this.endShow(true);
      const plan = this.showPlan(e);
      if (!plan) return;
      $("story-play").classList.add("on");
      plan.run();
    });
    // the main action: tonight's sky with its estimated city glow, then one tap shows the dark-sky baseline.
    // By day it first moves the clock to tonight, since the stars only show at night
    $("compare").addEventListener("click", () => {
      if (!$("lights").hidden) return this.setLights(false);
      if (this.isNight) return this.setLights(true, "today");
      const s = this.scene;
      this.go({ place: s.place, year: s.year, month: s.month, day: s.day, hour: 21 });
      const wait = () => (this.travel ? window.setTimeout(wait, 100) : this.setLights(true, "today"));
      window.setTimeout(wait, 300);
    });
    $("explore").addEventListener("click", () => this.openSheet(this.sheet === "moments" ? null : "moments"));
    $("return-now").addEventListener("click", () => {
      const p = this.scene.place;
      this.stopTour();
      this.say(`${p.name.split(",")[0]}, right now.`);
      this.go({ place: { name: p.name, lat: p.lat, lon: p.lon }, ...nowAt(p) });
    });
    $("explain-open").addEventListener("click", () => ($("narrator").hidden ? this.openNarrator() : this.closeNarrator()));
    this.bindNarrator();
    $("explain-close").addEventListener("click", () => ($("explain").hidden = true));
    $("lights-btn").addEventListener("click", () => this.setLights($("lights").hidden, "natural"));
    $("lights-close").addEventListener("click", () => this.setLights(false));
    // Plan an observation: a brief for tonight here. By day it first moves the clock to tonight
    $("plan").addEventListener("click", () => {
      if (!$("brief").hidden) return void ($("brief").hidden = true);
      if (this.isNight) return this.openBrief();
      const s = this.scene;
      this.go({ place: s.place, year: s.year, month: s.month, day: s.day, hour: 21 });
      const wait = () => (this.travel ? window.setTimeout(wait, 100) : window.setTimeout(() => this.openBrief(), 400));
      window.setTimeout(wait, 300);
    });
    for (const b of document.querySelectorAll<HTMLElement>("#lights-seg button")) b.addEventListener("click", () => this.setLights(true, b.dataset.light as App["lightMode"]));
    $("demo").addEventListener("click", () => (this.demo ? this.stopDemo() : this.startDemo()));
    $("finale-close").addEventListener("click", () => this.stopDemo());
  }

  // ------------------------------------------------------------ narrator and highlights
  private narrator!: Narrator;
  private captionsOn = true;
  private lastSaid = "";
  private hl: { type: string; name: string; fact: string; say: string; dir: () => THREE.Vector3 | null; el: HTMLElement }[] = [];
  private hlIndex = -1;

  private bindNarrator() {
    const $ = (id: string) => document.getElementById(id)!;
    this.narrator = new Narrator(
      (text, i, total) => {
        this.caption(text && this.captionsOn ? text : null);
        if (text === null && total > 0 && i >= total) this.sound.chime(false);
      },
      () => {
        if (!this.narrator) return; // the first voice list can arrive during construction
        const on = this.narrator.speaking && !this.narrator.paused;
        $("narrator").classList.toggle("playing", on);
        $("nar-play").setAttribute("aria-label", on ? "Pause" : "Play");
        const sel = $("nar-voice") as HTMLSelectElement;
        if (this.narrator && sel.options.length !== this.narrator.voices.length) {
          sel.innerHTML = "";
          for (const v of this.narrator.voices) sel.add(new Option(v.name.replace(/ \(English.*\)$/, ""), v.name));
        }
        if (this.narrator) sel.value = this.narrator.voiceName;
        $("nar-note").textContent = this.narrator.silent ? "No voice is available in this browser, so the narration runs as captions." : "";
      },
    );
    {
      const sel = $("nar-voice") as HTMLSelectElement;
      for (const v of this.narrator.voices) sel.add(new Option(v.name.replace(/ \(English.*\)$/, ""), v.name));
      sel.value = this.narrator.voiceName;
    }
    $("nar-play").addEventListener("click", () => (this.narrator.speaking ? this.narrator.toggle() : this.playScene()));
    $("nar-replay").addEventListener("click", () => this.say2(this.lastSaid || this.sceneNarration().text));
    $("nar-next").addEventListener("click", () => this.nextHighlight());
    $("nar-cc").addEventListener("click", () => {
      this.captionsOn = !this.captionsOn;
      $("nar-cc").setAttribute("aria-pressed", String(this.captionsOn));
      if (!this.captionsOn) this.caption(null);
    });
    $("nar-vol").addEventListener("input", (e) => (this.narrator.volume = Number((e.target as HTMLInputElement).value)));
    $("nar-details").addEventListener("click", () => this.openExplain());
    $("nar-voice").addEventListener("change", (e) => {
      this.narrator.setVoice((e.target as HTMLSelectElement).value);
      this.say2("This is how I will sound. The sky changes slowly.");
    });
    $("nar-close").addEventListener("click", () => this.closeNarrator());
  }

  /** Speak a passage: chime, voice, one caption sentence at a time. */
  private say2(text: string) {
    this.lastSaid = text;
    this.sound.chime(true);
    this.narrator.play(text);
  }

  openNarrator() {
    this.setLights(false);
    this.openSheet(null);
    this.showInfo(null);
    document.getElementById("explain")!.hidden = true;
    document.getElementById("evidence")!.hidden = true;
    document.getElementById("narrator")!.hidden = false;
    document.body.classList.add("narrating");
    this.refreshNarrator();
  }

  closeNarrator() {
    this.narrator?.stop();
    document.getElementById("narrator")!.hidden = true;
    document.body.classList.remove("narrating");
    document.getElementById("highlights")!.innerHTML = "";
    this.hl = [];
    this.caption(null);
  }

  private refreshNarrator() {
    const n = this.sceneNarration();
    document.getElementById("nar-title")!.textContent = n.title;
    document.getElementById("nar-line")!.textContent = n.line;
    this.computeHighlights();
    const modes = document.getElementById("nar-modes")!;
    modes.innerHTML = "";
    const add = (label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", fn);
      modes.appendChild(b);
    };
    const ev = this.scene.event;
    add(ev ? (ev.kind === "impact" ? "Listen to this event" : "Listen to this moment") : "Listen to the sky", () => this.playScene());
    if (this.hl.length) add("Find the brightest object", () => this.focusHighlight(0));
    if (yearsAgo(this.scene.year) >= 1) add("What changed since today?", () => {
      const a = explain("changed", this.facts());
      this.say2(`${a.seeing} ${a.physics.split(/(?<=[.])\s+/).slice(0, 2).join(" ")}`);
    });
    else if (Math.abs(this.scene.place.lat - 40.36) > 8) add("Why is this sky different?", () => this.say2(this.placeNarration()));
    if (mediaFor(ev?.id)) add("See the evidence", () => { this.narrator.stop(); this.showEvidence(ev!.id, true); });
    add("Scientific details", () => this.openExplain());
  }

  playScene() {
    this.say2(this.sceneNarration().text);
  }

  private compassWord(az: number) {
    return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round((((az % 360) + 360) % 360) / 45) % 8];
  }
  private whereWords(d: THREE.Vector3) {
    const alt = THREE.MathUtils.radToDeg(Math.asin(d.y)), az = THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z));
    return alt > 70 ? "almost overhead" : `${alt < 22 ? "low" : alt < 50 ? "halfway up" : "high"} in the ${this.compassWord(az)}`;
  }

  private placeNarration(): string {
    const p = this.scene.place, south = p.lat < 0, lat = Math.abs(p.lat).toFixed(0);
    return `${p.name} sits ${lat} degrees ${south ? "south" : "north"} of the equator. From here the sky turns around the ${south ? "south" : "north"} celestial pole, ${lat} degrees above the horizon. ` +
      (south ? "No bright star marks that pole. Stars that never rise over Princeton pass high overhead here." : "The further north you stand, the higher that pole climbs, and the more stars circle it without ever setting.") +
      " Change the place, and the sky changes with it.";
  }

  /** The 20 to 30 second script for this scene. Every figure in it is computed; set pieces are used only for their own moments. */
  private sceneNarration(): { title: string; line: string; text: string } {
    const s = this.scene, f = this.facts(), id = s.event?.id;
    const hist = f.era === "historical";
    const title = `${s.place.name}, ${hist ? `${s.day} ${monthName(s.month)} ${formatYear(s.year)}, ${formatHour(s.hour)}` : formatYear(s.year)}`;
    const polaris = f.poleStar === "Polaris" && f.poleSep < 2;
    if (id === "giza2560") return { title, line: "North belonged to a different star.", text: `Above Giza, more than four thousand years ago, north belonged to a different star. Thuban stood ${f.poleSep.toFixed(1)} degrees from the celestial pole while the Great Pyramid rose below. Earth's axis slowly changes direction over thousands of years, carrying the pole from Thuban toward Polaris. The sky was not just scenery. It was a compass.` };
    if (id === "chicxulub") return { title, line: "An educational reconstruction.", text: "This is an educational reconstruction of the sky above the Yucatan, near the time of the Chicxulub impact. The event transformed life on Earth. The stars shown here are not their true positions. Nobody can compute those across sixty six million years. What we show separates calculated geometry from the parts scientists must reconstruct." };
    if (id === "dart2022") return { title, line: "The night we moved an asteroid.", text: "In September 2022, humanity deliberately struck a small asteroid moon named Dimorphos. The impact shortened its orbit by thirty two minutes, and proved that planetary defence can be more than science fiction. It was far too faint to see by eye. This is the sky the telescopes at Sutherland were watching that night." };
    const day = (this.engine.state?.day ?? 0) > 0.5;
    const when = f.ago < 1 ? (day ? "today" : "tonight") : hist ? `in ${formatYear(s.year)}` : formatYear(s.year);
    const A = `Above ${s.place.name}, ${when}.`;
    const first = this.hl[0];
    const d = first?.dir();
    const B = day ? "The Sun is up, and the stars are hidden behind daylight. They have not gone anywhere."
      : f.era === "geologic" ? "The constellations drawn here are today's, shown as a guide. Their true shapes this long ago cannot be computed."
      : first && d ? `${first.name} ${first.type === "PLANET" ? "shines with a steady light" : "stands out"}, ${this.whereWords(d)}.`
      : "The sky is quiet, and full of faint stars.";
    const C = f.era === "geologic" ? "Over millions of years the stars drift apart, and the continents move beneath them."
      : s.place.lat < -15 ? "From here the sky turns around the south celestial pole, which no bright star marks."
      : polaris ? "Everything turns around Polaris. It appears still because it sits almost directly above Earth's northern axis."
      : f.poleStar ? `The sky turns around a point near ${f.poleStar}, not Polaris. Earth's axis slowly circles over about twenty six thousand years.`
      : "The whole sky turns around the celestial pole, the point Earth's axis aims at.";
    const firstSentence = s.event ? s.event.summary.split(/(?<=[.])\s+/)[0] : "";
    const D = firstSentence && firstSentence.length < 190 ? firstSentence
      : f.ago >= 130 && f.era !== "geologic" ? "There is no electric light. On a clear night, people here could see thousands of stars."
      : f.lpToday > 0.3 ? "Modelled city glow hides most of these stars tonight. They are still there."
      : polaris ? "This same turning has helped travellers find north for centuries." : "People have steered and kept time by this sky for as long as there have been people.";
    const E = s.place.lat < -15 ? "Change the place, and the sky changes with it." : f.ago >= 1 ? "The sky changes slowly. Looking closely changes us faster." : "Look up. It is all still there.";
    return { title, line: f.era === "geologic" ? "An educational reconstruction." : E, text: [A, B, C, D, E].join(" ") };
  }

  /** Up to three things worth pointing at, chosen only from what is above the horizon in the computed scene. */
  private computeHighlights() {
    const box = document.getElementById("highlights")!;
    box.innerHTML = "";
    this.hl = [];
    this.hlIndex = -1;
    const st = this.engine.state;
    if (!st || st.day > 0.5 || this.current.era === "geologic") return;
    const push = (type: string, name: string, fact: string, say: string, dir: () => THREE.Vector3 | null) => {
      const el = document.createElement("div");
      el.className = "hl";
      el.innerHTML = '<span class="hl-ring"></span><span class="hl-line"></span>';
      const tag = document.createElement("button");
      tag.className = "hl-tag";
      tag.setAttribute("aria-label", `${name}. Focus and explain`);
      for (const [cls, t] of [["hl-type", type], ["hl-name", name], ["hl-fact", fact]]) {
        const sp = document.createElement("span");
        sp.className = cls;
        sp.textContent = t;
        tag.appendChild(sp);
      }
      const i = this.hl.length;
      tag.addEventListener("click", () => this.focusHighlight(i));
      el.appendChild(tag);
      box.appendChild(el);
      this.hl.push({ type, name, fact, say, dir, el });
    };
    const up = (d: THREE.Vector3 | null, deg: number) => !!d && d.y > Math.sin(THREE.MathUtils.degToRad(deg));
    // one planet (or the Moon), the brightest that is up
    const bodies = (this.current.bodies ?? []).filter((b) => b.name !== "Sun" && up(this.engine.findTarget(b.name), 8) && (b.name === "Moon" || b.mag < st.limitMag));
    const planet = bodies.filter((b) => b.name !== "Moon").sort((a, b) => a.mag - b.mag)[0] ?? bodies[0];
    if (planet) {
      const moon = planet.name === "Moon";
      push(moon ? "MOON" : "PLANET", planet.name, BODY_FACTS[planet.name] ?? "",
        moon ? `The Moon is ${Math.round((planet.phase ?? 0) * 100)} percent lit. ${BODY_FACTS.Moon}`
          : `${planet.name} does not twinkle like a star. Its steady light is sunlight, reflected from another world. ${BODY_FACTS[planet.name] ?? ""}`,
        () => this.engine.findTarget(planet.name));
    }
    // one bright star
    const star = this.engine.brightestNamed(12);
    if (star) {
      const bv = this.engine.starBV(star.index);
      const colour = bv < 0.3 ? "blue-white, a sign of a surface hotter than the Sun's" : bv < 0.85 ? "close to the colour of our own Sun" : "orange, the colour of a star cooler than the Sun";
      push("STAR", star.name, STAR_FACTS[star.name] ?? `Its light is ${colour.split(",")[0]}.`,
        `${star.name} is the brightest star in the sky right now. Its light is ${colour}. ${STAR_FACTS[star.name] ?? ""}`, () => this.engine.findStarDir(star.index));
    }
    // one deep-sky object if the sky is dark enough to show it, otherwise the best-placed constellation
    const DSO: [string, string, number, number, number, string, string][] = [
      ["GALAXY", "Andromeda Galaxy", 10.685, 41.269, 4.6, "Another galaxy, about 2.5 million light-years away.", "Andromeda is not a star. It is another galaxy, about two and a half million light-years away, and the most distant thing most people can see with their own eyes."],
      ["GALAXY", "Large Magellanic Cloud", 80.89, -69.76, 3.5, "A small companion galaxy of the Milky Way.", "The Large Magellanic Cloud is a small galaxy that keeps company with our own, about one hundred and sixty thousand light-years away. It never rises for most of the northern world."],
      ["NEBULA", "Orion Nebula", 83.82, -5.39, 4.6, "A cloud of gas where new stars are forming.", "The Orion Nebula is a cloud of gas and dust, about thirteen hundred light-years away, where new stars are forming now."],
      ["CLUSTER", "Pleiades", 56.75, 24.12, 3.0, "A young cluster of stars, about 440 light-years away.", "The Pleiades are a family of young stars, born together and still travelling together, about four hundred and forty light-years away."],
    ];
    const dso = DSO.find((o) => st.limitMag >= o[4] && up(this.engine.worldOf(o[2], o[3]), 18));
    if (dso) push(dso[0], dso[1], dso[5], dso[6], () => this.engine.worldOf(dso[2], dso[3]));
    else {
      const c = this.engine.highConstellation();
      if (c) push("CONSTELLATION", c.name, "A pattern made by perspective.", `${c.name} is a pattern made by perspective. Its stars lie at very different distances, but from Earth they line up into a figure people have named for centuries.`, () => this.engine.worldOf(c.ra, c.dec));
    }
  }

  private updateHighlights() {
    if (!this.hl.length) return;
    const hide = this.travel !== null || this.engine.slide !== 0;
    for (const h of this.hl) {
      const d = hide ? null : h.dir();
      const p = d && d.y > 0.02 ? d.clone().multiplyScalar(100).project(this.engine.camera) : null;
      if (!p || p.z > 1 || Math.abs(p.x) > 1.02 || Math.abs(p.y) > 1.02) {
        h.el.style.display = "none";
        continue;
      }
      h.el.style.display = "";
      h.el.style.transform = `translate(${((p.x + 1) / 2) * innerWidth}px, ${((1 - p.y) / 2) * innerHeight}px)`;
    }
  }

  private focusHighlight(i: number) {
    const h = this.hl[i];
    if (!h) return;
    this.hlIndex = i;
    this.hl.forEach((x, k) => x.el.classList.toggle("on", k === i));
    const d = h.dir();
    if (d) this.engine.lookAt(d);
    this.say2(h.say.trim());
  }

  private nextHighlight() {
    if (!this.hl.length) return this.say("Nothing to point out right now. Try a night-time scene.");
    this.focusHighlight((this.hlIndex + 1) % this.hl.length);
  }

  /** A short spoken note on whatever is selected in the inspector. */
  private narrateSelected() {
    const p = this.selected;
    if (!p) return this.openExplain();
    const where = `It is ${this.whereWords(p.dir)}.`;
    const fact = p.kind === "star" ? STAR_FACTS[p.name] : p.kind === "body" ? BODY_FACTS[p.name] : p.kind === "deep" ? `${p.obj.fact} It is ${p.obj.dist} away.` : p.kind === "minor" ? `An asteroid about ${p.m.km} kilometres across, one of the largest in the belt between Mars and Jupiter.` : "It flared, and faded within months.";
    const lead = p.kind === "body" && p.name !== "Sun" && p.name !== "Moon" ? `${p.name} does not twinkle like a star. Its steady light is reflected sunlight.` : p.kind === "deep" ? `This is the ${TYPE_NAME[p.obj.type].toLowerCase()} ${p.name}.` : `This is ${p.name}.`;
    document.getElementById("narrator")!.hidden = false;
    document.body.classList.add("narrating");
    document.getElementById("nar-title")!.textContent = p.name;
    document.getElementById("nar-line")!.textContent = fact ?? where;
    this.say2([lead, where, fact ?? ""].join(" ").trim());
  }

  // ------------------------------------------------------------ demo story
  private demo: { i: number; t: number } | null = null;
  private caption(t: string | null) {
    const el = document.getElementById("caption")!;
    el.hidden = !t;
    if (t) {
      el.textContent = t;
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    }
  }
  private setLayer(key: "poleTrack", on: boolean) {
    this.engine.layers[key] = on;
    document.querySelector(`[data-layer="${key}"]`)?.setAttribute("aria-pressed", String(on));
  }
  /** One route, about 75 seconds: Princeton, Giza and Thuban, precession, home again, the lights. */
  private DEMO: { hold: number; run: () => void }[] = [
    { hold: 6, run: () => { this.goEvent(this.events.find((e) => e.id === "princeton_tonight")!); this.caption("Princeton, tonight. Every star here is computed for this place and this minute."); } },
    { hold: 5, run: () => { this.goEvent(this.events.find((e) => e.id === "giza2560")!); this.caption("Now rewind more than 4,500 years, to Giza as the Great Pyramid rises."); } },
    { hold: 9, run: () => { this.engine.lookAtAltAz(30, 0); this.setLayer("poleTrack", true); this.caption("North is not where Polaris is. The whole sky turns around Thuban."); } },
    { hold: 26, run: () => { this.caption(null); this.openNarrator(); this.playScene(); } },
    { hold: 4, run: () => { this.closeNarrator(); this.setLayer("poleTrack", false); this.goEvent(this.events.find((e) => e.id === "princeton_tonight")!); this.caption("Back to Princeton, tonight."); } },
    { hold: 8, run: () => { this.engine.lookAtAltAz(40, 180); this.setLights(true, "natural"); this.caption("This is the sky Princeton would have with no artificial light."); } },
    { hold: 8, run: () => { this.setLights(true, "today"); this.caption("And this is tonight, under the glow of its cities."); } },
    { hold: 1e9, run: () => {
      this.caption(null);
      this.setLights(false);
      // end on a question, so the tour finishes with the viewer reasoning, not just watching
      renderThink(document.getElementById("finale-think")!, THINK.giza2560);
      document.getElementById("finale")!.hidden = false;
    } },
  ];
  startDemo() {
    this.stopTour();
    this.openSheet(null);
    this.showInfo(null);
    document.body.classList.add("demo");
    document.getElementById("demo")!.textContent = "Stop";
    document.getElementById("demo")!.hidden = false;
    this.demo = { i: 0, t: 0 };
    this.DEMO[0].run();
  }
  stopDemo() {
    this.demo = null;
    document.body.classList.remove("demo");
    document.getElementById("demo")!.textContent = "Take the sky tour · 80 sec";
    document.getElementById("demo")!.hidden = true;
    document.getElementById("finale")!.hidden = true;
    document.getElementById("explain")!.hidden = true;
    this.closeNarrator();
    this.caption(null);
    this.setLights(false);
    this.setLayer("poleTrack", false);
  }
  private demoStep(dt: number) {
    if (!this.demo || this.travel) return;
    this.demo.t += dt;
    if (this.demo.t < this.DEMO[this.demo.i].hold) return;
    this.demo.t = 0;
    this.demo.i++;
    this.DEMO[this.demo.i].run();
  }

  /** One sheet at a time rises above the dock; null puts them all away. */
  openSheet(name: string | null) {
    this.sheet = name;
    for (const sh of document.querySelectorAll<HTMLElement>(".sheet")) sh.hidden = sh.id !== `sheet-${name}`;
    for (const b of document.querySelectorAll<HTMLButtonElement>(".dock [data-sheet]")) b.setAttribute("aria-expanded", String(b.dataset.sheet === name));
    document.body.classList.toggle("sheet-open", Boolean(name));
    if (name === "search") (document.getElementById("ask-input") as HTMLInputElement).focus({ preventScroll: true });
    if (name === "time") this.beginScrub();
    if (name) {
      document.getElementById("explain")!.hidden = true;
      if (!document.getElementById("lights")!.hidden) this.setLights(false);
    }
    if (this.globe) {
      this.globe.here = { lat: this.scene.place.lat, lon: this.scene.place.lon };
      this.globe.run(name === "place");
      if (name === "place") {
        this.setPlacePick(this.placePick ?? this.scene.place);
        this.globe.focus(this.scene.place.lat, this.scene.place.lon);
      }
    }
  }

  selected: Picked | null = null;
  marker: HTMLDivElement | null = null;

  private showInfo(p: Picked | null) {
    const el = document.getElementById("info")!;
    this.selected = p;
    if (!p) {
      el.hidden = true;
      this.marker?.remove();
      this.marker = null;
      return;
    }
    const c = this.scene;
    const d = describe(p, this.engine, { jd: this.current.jd, lat: c.place.lat, lon: c.place.lon, epochYear: c.year });
    document.getElementById("evidence")!.hidden = true;
    this.fillInfo(d.title, d.sub, d.rows, d.visible, d.why ?? "", d.source);
    document.getElementById("explain")!.hidden = true;
    el.hidden = false;
    if (!this.marker) {
      this.marker = document.createElement("div");
      this.marker.className = "sky-marker";
      document.body.appendChild(this.marker);
    }
  }

  /** The evidence card for a moment: one real image or visualization, labelled for what it is, with credit. */
  private showEvidence(eventId: string | undefined, open: boolean) {
    const m = mediaFor(eventId);
    const card = document.getElementById("evidence")!;
    document.getElementById("story-evidence")!.hidden = !m;
    if (!m || !open) {
      card.hidden = true;
      return;
    }
    const $ = (id: string) => document.getElementById(id)!;
    const img = $("evidence-img") as HTMLImageElement, fb = $("evidence-fallback");
    $("evidence-fig").style.background = m.gradient;
    fb.hidden = true;
    img.hidden = false;
    img.onerror = () => {
      img.hidden = true;
      fb.hidden = false;
    };
    img.alt = `${m.status}: ${m.title}`;
    img.src = LOCAL_MEDIA[m.asset ?? m.eventId] ?? m.imageUrl;
    $("evidence-status").textContent = m.status;
    $("evidence-title").textContent = m.title;
    $("evidence-caption").textContent = m.caption;
    $("evidence-when").textContent = m.when;
    $("evidence-credit").textContent = m.credit;
    const a = $("evidence-link") as HTMLAnchorElement;
    a.href = m.sourceUrl;
    a.textContent = m.sourceLabel;
    const more = $("evidence-more");
    more.innerHTML = "";
    for (const x of m.more ?? []) {
      const li = document.createElement("li");
      const l = document.createElement("a");
      l.href = x.url;
      l.target = "_blank";
      l.rel = "noopener";
      l.textContent = x.label;
      li.appendChild(l);
      more.appendChild(li);
    }
    this.showInfo(null);
    card.hidden = false;
  }

  private fillInfo(title: string, sub: string, rows: string[], visible: boolean, why: string, source: string) {
    document.getElementById("info-title")!.textContent = title;
    document.getElementById("info-sub")!.textContent = sub;
    const badge = document.getElementById("info-badge")!;
    badge.textContent = visible ? "Visible now" : "Below horizon";
    badge.className = `badge ${visible ? "high" : "below"}`;
    const ul = document.getElementById("info-rows")!;
    ul.innerHTML = "";
    for (const r of rows) {
      const li = document.createElement("li");
      li.textContent = r;
      ul.appendChild(li);
    }
    document.getElementById("info-why")!.textContent = why;
    document.getElementById("info-src")!.textContent = source;
    document.getElementById("info-explain")!.hidden = !this.selected;
    const sel = this.selected;
    document.getElementById("info-zoom")!.hidden = !sel || !this.engine.fitFov(sel.name) || this.engine.fov <= (this.engine.fitFov(sel.name) ?? 0) * 1.05;
    document.getElementById("info")!.hidden = false;
  }

  /** keep the selection ring on the chosen object as the sky moves */
  private trackMarker() {
    if (!this.marker || !this.selected) return;
    const fresh = this.selected.kind === "star" ? this.engine.findStarDir(this.selected.index)
      : this.engine.findTarget(this.selected.name);
    if (!fresh || fresh.y < -0.02) {
      this.marker.style.display = "none";
      return;
    }
    const p = fresh.clone().multiplyScalar(100).project(this.engine.camera);
    if (p.z > 1) {
      this.marker.style.display = "none";
      return;
    }
    this.marker.style.display = "";
    this.marker.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
    this.marker.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
  }

  private sayTimer = 0;
  private say(t: string) {
    const el = document.getElementById("reply")!;
    el.textContent = t;
    el.classList.remove("gone");
    clearTimeout(this.sayTimer);
    this.sayTimer = window.setTimeout(() => el.classList.add("gone"), 5200);
  }

  async ask(text: string) {
    this.stopTour();
    const reply = document.getElementById("reply")!;
    reply.classList.add("thinking");
    this.say("Asking Claude where and when");
    let req: SceneRequest | null = await this.search.askClaude(text);
    if (!req) {
      try {
        req = await askServer(text, this.events);
      } catch {
        req = null;
      }
    }
    reply.classList.remove("thinking");
    if (!req) {
      // offline: best local reading, using the world gazetteer for the place
      req = parseLocally(text, this.events, this.targets);
      if (!req.place) {
        const hit = this.search.places(this.search.placeText(text), 1)[0];
        if (hit) req.place = { name: hit[0], lat: hit[1], lon: hit[2] };
      }
    }
    this.applyRequest(req, text);
  }

  private applyRequest(req: SceneRequest, text: string) {
    if (req.event && req.year === undefined && !req.place) {
      this.say(req.reply ?? `${req.event.title}.`);
      this.pendingTarget = req.target ?? null;
      return this.goEvent(req.event);
    }
    if (req.event && (req.year === undefined || !req.place)) {
      this.say(req.reply ?? `${req.event.title}.`);
      return this.goEvent(req.event);
    }
    if (req.year === undefined && !req.place && !req.target && req.month === undefined && req.hour === undefined) {
      this.say(`I couldn't find a place or a date in "${text}". Try "Stonehenge at the summer solstice in 2500 BCE".`);
      return;
    }
    if (req.place && req.year === undefined && req.month === undefined && req.day === undefined && req.hour === undefined && !req.event) {
      this.pendingTarget = req.target ?? null;
      this.say(req.reply ?? `${req.place.name}, right now.`);
      return this.go({ place: req.place, ...nowAt(req.place) });
    }
    const next: Scene = {
      place: req.place ?? this.scene.place,
      year: req.year ?? this.scene.year,
      month: req.month ?? this.scene.month,
      day: req.day ?? this.scene.day,
      hour: req.hour ?? (this.scene.hour > 6 && this.scene.hour < 18 ? 22 : this.scene.hour),
    };
    if (next.year < -300_000_000) next.year = -300_000_000;
    if (next.year > 12000) next.year = 12000;
    this.pendingTarget = req.target ?? null;
    this.say(req.reply ?? `${next.place.name}, ${formatYear(next.year)}${req.target ? `. Looking at ${req.target}` : ""}.`);
    if (next.place === this.scene.place && next.year === this.scene.year && next.month === this.scene.month && next.day === this.scene.day && next.hour === this.scene.hour && req.target) {
      const d = this.engine.findTarget(req.target);
      if (d) this.engine.lookAt(d);
      else this.say(`${req.target} isn't in this sky.`);
      return;
    }
    this.go(next);
  }
}

// ---------------------------------------------------------------- server agent
async function askServer(text: string, events: SkyEvent[]): Promise<SceneRequest | null> {
  if (location.protocol === "file:") return null; // opened as a file: no agent server, use the offline parser
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: ctl.signal,
  });
  clearTimeout(timer);
  if (!res.ok) return null;
  const j = await res.json();
  const req: SceneRequest = { reply: j.reply ?? undefined, target: j.target ?? undefined };
  if (j.event_id) req.event = events.find((e) => e.id === j.event_id);
  if (j.place && typeof j.place.lat === "number") req.place = { name: j.place.name, lat: j.place.lat, lon: j.place.lon };
  if (typeof j.year === "number") req.year = j.year;
  if (typeof j.month === "number") req.month = j.month;
  if (typeof j.day === "number") req.day = j.day;
  if (typeof j.hour === "number") req.hour = j.hour;
  return req;
}

// ---------------------------------------------------------------- utils
function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/**
 * Ordinary clock time, shown only when it can be known: a modern date at a place whose sun time is
 * within an hour of this device's time zone. Everywhere else the HUD shows local mean solar time.
 */
/** the step size that suits a date: hours near today, wider steps further away */
function unitFor(year: number): App["unit"] {
  const d = Math.abs(CURRENT_YEAR - year);
  if (year < -12000) return year < -1e6 ? "myr" : "millennium";
  if (d <= 2) return "hour";
  if (d <= 150) return "year";
  if (d <= 3000) return "century";
  return "millennium";
}

function civilClock(s: Scene, zone = false): string | null {
  // clock time follows laws and time zones, known only for recent years: elsewhere use sun time
  if (s.year < 1970 || s.year > CURRENT_YEAR + 20) return null;
  const tz = zoneFor(s.place.lat, s.place.lon);
  if (!tz) return null;
  const jd = localSolarToJD(s.year, s.month, s.day, s.hour, s.place.lon);
  try {
    return new Date((jd - 2440587.5) * 86400000).toLocaleTimeString([], zone ? { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" } : { timeZone: tz, hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
}

/** The first sentence of a summary, for a one-line reason on a card. */
function firstSentence(t: string): string {
  const m = t.match(/^.*?[.!?](?=\s+[A-Z0-9]|$)/);
  return (m ? m[0] : t).trim();
}

/** The IANA time zone at a spot, or null at sea and near the poles, where local solar time is the honest clock. */
function zoneFor(lat: number, lon: number): string | null {
  if (Math.abs(lat) > 80) return null;
  try {
    const z = tzlookup(lat, lon);
    return z.startsWith("Etc/") ? null : z;
  } catch {
    return null;
  }
}

/** Today's date and the local mean solar hour at a place, right now. */
function nowAt(place: Place): { year: number; month: number; day: number; hour: number } {
  const d = new Date(Date.now() + (place.lon / 15) * 3600000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 };
}

/** True when a scene shows the present moment (within a quarter of an hour). */
function isNow(s: Scene): boolean {
  const jd = localSolarToJD(s.year, s.month, s.day, s.hour, s.place.lon);
  return Math.abs(jd - (Date.now() / 86400000 + 2440587.5)) < 15 / 1440;
}

function seasonName(month: number, lat: number) {
  const north = ["Midwinter", "Late winter", "Spring equinox", "Spring", "Late spring", "Midsummer", "High summer", "Late summer", "Autumn equinox", "Autumn", "Late autumn", "Early winter"];
  const flip = (m: number) => ((m + 5) % 12) + 1;
  return north[(lat >= 0 ? month : flip(month)) - 1];
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById("loading");
  if (!l) return;
  const what = err instanceof Error ? err.message : String(err);
  l.innerHTML = "";
  const box = document.createElement("div");
  box.className = "boot-fail";
  const h = document.createElement("p");
  h.textContent = "The sky could not load.";
  const d = document.createElement("small");
  d.textContent = what;
  const b = document.createElement("button");
  b.className = "pill accent";
  b.textContent = "Try again";
  b.addEventListener("click", () => location.reload());
  box.append(h, d, b);
  l.appendChild(box);
});
