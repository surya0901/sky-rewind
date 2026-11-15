// Discovery layer: the globe place picker, the scientific basis card and the grounded
// "Explain this sky" answers. Every explanation is built from facts the app computed for
// the scene; sources come only from the fixed list below or from the moment's own record.
import { LAND_RINGS } from "../data/world";

export const SOURCES = {
  AE: { label: "Astronomy Engine (D. Cross): Sun, Moon and planet positions, Delta T, eclipses. Stated accuracy about 1 arcminute.", url: "https://github.com/cosinekitty/astronomy" },
  VON: { label: "Vondrák, Capitaine & Wallace (2011), New precession expressions, valid for long time intervals. Astronomy & Astrophysics 534, A22.", url: "https://doi.org/10.1051/0004-6361/201117274" },
  HIP: { label: "ESA (1997), The Hipparcos and Tycho Catalogues, ESA SP-1200: star positions, brightness and motions.", url: "https://www.cosmos.esa.int/web/hipparcos/catalogues" },
  DT: { label: "Espenak & Meeus, polynomial expressions for Delta T (Earth's slowing rotation), NASA Eclipse Web Site.", url: "https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html" },
  MER: { label: "Merdith et al. (2021), a full-plate model of the last billion years. Earth-Science Reviews 214, 103477.", url: "https://doi.org/10.1016/j.earscirev.2020.103477" },
  HZ: { label: "JPL Horizons (NASA JPL Solar System Dynamics): the independent ephemeris the app is checked against in tests/horizons.test.ts and tests/comets.test.ts.", url: "https://ssd.jpl.nasa.gov/horizons/" },
  WAL: { label: "Walker (1977), The effects of urban lighting on the brightness of the night sky, PASP 89, 405: the population and distance rule behind the modelled city glow.", url: "https://doi.org/10.1086/130142" },
  BM: { label: "NASA Black Marble (VIIRS Day/Night Band): satellite-measured night lights. For further reading only: this app does not use its data.", url: "https://blackmarble.gsfc.nasa.gov/" },
  DS: { label: "DarkSky International: what light pollution is and how to reduce it.", url: "https://darksky.org/" },
  ESO: { label: "ESO / S. Brunier (2009), The Milky Way panorama (eso0932a), CC BY 4.0: the photograph behind the Milky Way, reprojected onto the sky.", url: "https://www.eso.org/public/images/eso0932a/" },
  STEL: { label: "Stellarium sky cultures: constellation lines and figures (art by Johan Meuris).", url: "https://github.com/Stellarium/stellarium-skycultures" },
} as const;
export type SourceId = keyof typeof SOURCES;

export type EraName = "historical" | "deep" | "geologic";

export interface Facts {
  place: string;
  lat: number;
  lon: number;
  when: string;
  year: number;
  ago: number; // years before now
  era: EraName;
  poleStar: string | null;
  poleSep: number; // degrees between the celestial pole and that star
  lpToday: number; // 0..1 modelled city glow for this spot today
  event?: { title: string; summary: string; sources: string[]; certainty: string };
  selected?: { name: string; kind: string; alt: number; az: number };
}

export interface Answer {
  seeing: string;
  physics: string;
  matters: string;
  confidence: string;
  sources: SourceId[];
  extra?: string[]; // the moment's own cited sources
}

export const CONFIDENCE: Record<EraName, { label: string; text: string }> = {
  historical: {
    label: "High confidence: recorded history",
    text: "Sun, Moon and planet positions come from Astronomy Engine. The app's whole pipeline is checked against JPL Horizons, an independent ephemeris, at five places and dates: within half an arcminute for modern dates and a few arcminutes in antiquity, except the Moon before 1000 BCE, which can be off by more than a degree. The clock is the weak point: Earth's rotation is extrapolated, so the time of night is uncertain by minutes around 1 CE and by more than an hour before 2000 BCE. Weather and local viewing conditions are not reconstructed.",
  },
  deep: {
    label: "Educational reconstruction: deep time",
    text: "The direction of Earth's axis comes from a precession model valid for about 200,000 years. There is no calendar or clock this far back, so the date only sets the season. Planets and the Moon are not drawn. Only the 112 brightest stars carry measured motions, so the fainter star patterns are approximate.",
  },
  geologic: {
    label: "Educational reconstruction: deep time",
    text: "Nobody can compute where individual stars were millions of years ago. Stars orbit the galaxy and the constellations dissolve. The app draws today's constellations as a labelled reference, not as the real sky of that time. Layers can scatter them instead and remove stars too young to have existed. Continent positions come from a published plate model.",
  },
};

const compass = (az: number) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round((((az % 360) + 360) % 360) / 45) % 8];
const baseSources = (f: Facts): SourceId[] => (f.era === "historical" ? ["AE", "VON", "HIP", "DT"] : f.era === "deep" ? ["VON", "HIP"] : ["HIP", "MER"]);

export function questions(f: Facts): { id: string; text: string }[] {
  const first = f.selected
    ? { id: "object", text: `Why is ${f.selected.name} here?` }
    : f.era !== "geologic" && f.poleStar && f.poleStar !== "Polaris"
      ? { id: "pole", text: "Why is the pole star different?" }
      : { id: "pole", text: "What is the sky turning around?" };
  return [first, { id: "changed", text: "What changed since today?" }, { id: "matters", text: "Why does this matter?" }, { id: "certain", text: "How certain is this reconstruction?" }];
}

/** Scene-specific explanations with no model involved: every number comes from Facts. */
export function explain(id: string, f: Facts): Answer {
  const conf = `${CONFIDENCE[f.era].label}. ${CONFIDENCE[f.era].text}`;
  const src = baseSources(f);
  const extra = f.event?.sources;
  const sep = f.poleSep < 10 ? f.poleSep.toFixed(1) : f.poleSep.toFixed(0);
  const shift = ((f.ago / 25772) * 360) % 360;
  const precession = "Earth spins like a tilted top. The pull of the Moon and Sun on its equatorial bulge makes the axis sweep a slow circle on the sky about once every 25,800 years. This is axial precession. The stars stay put; the point they appear to turn around moves.";

  if (id === "object" && f.selected) {
    const s = f.selected;
    return {
      seeing: `${s.name} is ${s.alt.toFixed(0)}° above the horizon toward the ${compass(s.az)}, seen from ${f.place} (${Math.abs(f.lat).toFixed(1)}° ${f.lat >= 0 ? "N" : "S"}) at ${f.when}.`,
      physics: s.kind === "star"
        ? "A star's place in your sky is set by three things: its fixed position among the stars, your latitude, and how far Earth has turned. Over centuries, precession also slowly shifts where each star rises and how high it climbs."
        : "The Sun, Moon and planets move against the stars along the ecliptic, the plane of the solar system. Where one appears depends on where it and Earth are in their orbits on this date, then on your latitude and the time of night.",
      matters: f.event ? f.event.summary : "Knowing exactly where an object stood lets you test old records: an alignment, a recorded sighting or a navigation star can be checked against the computed sky.",
      confidence: conf,
      sources: src,
      extra,
    };
  }
  if (id === "changed") {
    const parts: string[] = [];
    if (f.ago < 1) parts.push("This is the present-day sky.");
    else if (f.era === "geologic") parts.push("Almost everything. The constellations drawn are today's, kept only as a guide, the young bright stars of today's sky had not formed, and the ground under you sat at a different latitude.");
    else {
      if (f.poleStar) parts.push(`The sky turns around a point ${sep}° from ${f.poleStar}; today that point is within 1° of Polaris.`);
      parts.push(`Precession has carried the equinoxes about ${shift.toFixed(0)}° around the sky since then, so each constellation appears in a different season than it does now.`);
    }
    if (f.lpToday > 0.15 && f.ago >= 130) parts.push(`There is no electric light. Today, city glow near ${f.place} hides most of the faint stars shown here.`);
    return {
      seeing: parts.join(" "),
      physics: f.era === "geologic" ? "Stars orbit the centre of the galaxy at different speeds, so patterns dissolve over millions of years. Plate tectonics moves the continents a few centimetres a year, which adds up to thousands of kilometres." : precession,
      matters: "Calendars, navigation and monument alignments were all tied to a sky that slowly drifts. A date or an alignment only makes sense against the sky of its own era.",
      confidence: conf,
      sources: f.lpToday > 0.15 ? [...src, "WAL"] : src,
      extra,
    };
  }
  if (id === "matters") {
    return {
      seeing: f.event ? `${f.event.title}. ${f.event.summary}` : `The sky over ${f.place} at ${f.when}, rebuilt from star catalogues and orbital models.`,
      physics: f.era === "geologic" ? "Deep time is reconstructed from what we can still measure: star ages, galactic orbits and the magnetic record of drifting continents." : precession,
      matters: f.event
        ? "A computed sky lets you check a historical record against physics: whether an eclipse was visible from a place, where a new star appeared, or what an alignment pointed at."
        : "Most people now live under skies too bright to show the Milky Way. Rebuilding the sky of another era shows what earlier observers could see, and what a dark site still shows today.",
      confidence: conf,
      sources: src,
      extra,
    };
  }
  if (id === "certain") {
    return {
      seeing: `${f.place}, ${f.when}. ${CONFIDENCE[f.era].label}.`,
      physics: f.era === "historical"
        ? "Planet positions come from orbital theory and star positions from measured catalogues, turned to the observer's horizon with a precession model. The largest error is Delta T, the slow and irregular lengthening of the day, which shifts the clock, not the pattern."
        : f.era === "deep"
          ? "The precession model is fitted to a long numerical integration of Earth's motion and is published as valid for about 200,000 years either side of today."
          : "Star positions cannot be run backwards this far: small errors in each star's measured motion grow without limit, and the galaxy's own gravity field matters.",
      matters: "A reconstruction is only useful if you know which parts to trust. Star and planet geometry in recorded history is solid; clock time, weather and anything in deep time are not.",
      confidence: CONFIDENCE[f.era].text,
      sources: src,
      extra,
    };
  }
  // pole
  const isGiza = Math.abs(f.lat - 29.98) < 0.5 && Math.abs(f.lon - 31.13) < 0.5 && f.year < -2000;
  return {
    seeing: f.era === "geologic" || !f.poleStar
      ? "The whole sky appears to turn around the celestial pole, the point Earth's axis aims at."
      : f.poleStar === "Polaris" && f.poleSep < 2
        ? `The sky turns around a point ${sep}° from Polaris, the current North Star.`
        : `The sky turns around a point ${sep}° from ${f.poleStar}. Polaris is far from the pole at this date and circles it like any other star.`,
    physics: precession,
    matters: isGiza
      ? "The Great Pyramid's sides face the cardinal directions to within a few arcminutes. With no bright star exactly at the pole, its builders needed a method based on the turning sky. Which method they used is still debated."
      : "A pole star is how travellers find north without a compass. Which star does that job, or whether any does, depends on the date.",
    confidence: conf,
    sources: src,
    extra,
  };
}

/** Ask Claude (when the page has it) for the same five-part answer, restricted to the computed facts. */
export async function explainWithClaude(question: string, f: Facts, draft: Answer): Promise<Answer | null> {
  const c = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
  if (!c) return null;
  const sample = (await c.use("sample").catch(() => null)) as null | { json: (i: string, o?: object) => Promise<unknown> };
  if (!sample) return null;
  const ids = Object.keys(SOURCES) as SourceId[];
  const prompt = `You explain one scene in a sky-reconstruction app to a curious visitor. Reply with only a JSON object:
{"seeing": string, "physics": string, "matters": string, "confidence": string, "source_ids": string[]}
Rules:
- Use only the scene facts below plus textbook astronomy. Do not state any number, date, name or historical claim that is not in the facts or the draft.
- Do not claim more certainty than the confidence statement allows. Keep "confidence" faithful to it.
- Each field is 1 to 3 plain sentences. No dashes, no markdown.
- source_ids: choose only from ${JSON.stringify(ids)}. Never invent a source.
Scene facts: ${JSON.stringify(f)}
Confidence statement: ${CONFIDENCE[f.era].label}. ${CONFIDENCE[f.era].text}
Draft answer you may improve for clarity: ${JSON.stringify(draft)}
Question: ${question}`;
  try {
    const j = (await sample.json(prompt, { modelTier: "quick" })) as Record<string, unknown>;
    const str = (k: string) => (typeof j[k] === "string" && (j[k] as string).length > 10 ? (j[k] as string) : null);
    const seeing = str("seeing"), physics = str("physics"), matters = str("matters"), confidence = str("confidence");
    if (!seeing || !physics || !matters || !confidence) return null;
    const picked = Array.isArray(j.source_ids) ? (j.source_ids as unknown[]).filter((s): s is SourceId => ids.includes(s as SourceId)) : [];
    return { seeing, physics, matters, confidence, sources: picked.length ? picked : draft.sources, extra: draft.extra };
  } catch {
    return null;
  }
}

export function sourceList(ids: SourceId[], extra?: string[]): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.className = "cite";
  for (const id of [...new Set(ids)]) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = SOURCES[id].url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = SOURCES[id].label;
    li.appendChild(a);
    ul.appendChild(li);
  }
  for (const s of extra ?? []) {
    const li = document.createElement("li");
    li.textContent = s;
    ul.appendChild(li);
  }
  return ul;
}

/** The "Scientific basis" card: what is computed, how, and how far to trust it. */
export function renderBasis(root: HTMLElement, f: Facts) {
  root.innerHTML = "";
  const add = (tag: string, text: string, cls = "") => {
    const el = document.createElement(tag);
    el.textContent = text;
    if (cls) el.className = cls;
    root.appendChild(el);
    return el;
  };
  add("p", `${f.place}, ${f.when}`, "eyebrow");
  add("p", CONFIDENCE[f.era].label, `badge ${f.era === "historical" ? "high" : "edu"}`);
  const hist = f.era === "historical", deep = f.era === "deep";
  const sections: [string, string[]][] = [
    ["Input", [
      hist ? "The selected calendar date and local mean solar time (sun time). For a modern place in your own time zone the header shows your clock time instead; the sky is the same" : "The selected year (sets the direction of Earth's axis) and a season and solar time (no calendar exists this far back)",
      `Observer latitude and longitude: ${Math.abs(f.lat).toFixed(2)}° ${f.lat >= 0 ? "N" : "S"}, ${Math.abs(f.lon).toFixed(2)}° ${f.lon >= 0 ? "E" : "W"}`,
    ]],
    ["Calculation", hist ? [
      `Convert the date to a Julian date${f.year <= 1582 ? " (Julian calendar before October 1582)" : ""} and correct for Earth's slowing rotation (Delta T)`,
      "Compute Sun, Moon and planet positions with Astronomy Engine",
      "Turn catalogue star positions to this date with a long-term precession model (Vondrák 2011); measured motions applied to the 112 brightest stars",
      "The sky is turned using the Sun's apparent position, which includes nutation; nutation is not applied separately to stars and planets (under 20 arcseconds)",
      "Rotate everything into the observer's altitude and azimuth using latitude and local sidereal time",
      "Checked against JPL Horizons for 13 positions (tests/horizons.test.ts); comets against Horizons for 11 dates (tests/comets.test.ts)",
    ] : deep ? [
      "Find the direction of Earth's axis from the long-term precession model (Vondrák 2011, published as valid for about 200,000 years)",
      "Place the Sun on the ecliptic from the season, and derive sidereal time from the solar hour",
      "Rotate catalogue stars into the observer's altitude and azimuth; measured motions for the 112 brightest only",
    ] : [
      "Move this spot to its ancient latitude with the Merdith et al. (2021) plate model",
      "Draw today's constellations as a reference only, or scatter them and remove stars younger than about 50 million years",
      "No star, planet or Moon position is computed for this era",
    ]],
    ["Rendering", [
      "Stars are drawn on a local celestial sphere, sized by magnitude and tinted by colour index",
      "The Milky Way, its dust lanes and glowing gas are a real photograph (ESO / S. Brunier, CC BY 4.0) reprojected onto the sky; it shows the present day",
      "Comets are drawn from their computed head and tail directions; their look (green coma, curved dust tail, blue ion tail) is an illustration based on photographs",
      "Objects fade near and below the horizon; labels and brightness are adjusted for readability, not photometric accuracy",
    ]],
    ["Limits", [
      "Confidence decreases the further back you go",
      ...(hist ? ["Earth's rotation is extrapolated, so the exact clock time is uncertain in ancient eras"] : ["Sun, Moon and planets are not drawn"]),
      "Weather, haze, landscape obstructions and historic light levels are not reconstructed",
      "Deep-time views are educational reconstructions, not simulations",
      "Comets use two-body orbits around each perihelion: within 0.1° of JPL Horizons on the tested dates, but not checked on every date",
      "City glow is a modelled estimate from nearby populations, not measured sky brightness",
    ]],
  ];
  for (const [title, items] of sections) {
    add("h3", title);
    const ul = document.createElement("ul");
    ul.className = "basis-list";
    for (const t of items) {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    }
    root.appendChild(ul);
  }
  add("p", CONFIDENCE[f.era].text, "basis-note");
  add("h3", "Sources");
  root.appendChild(sourceList(f.era === "geologic" ? ["HIP", "MER", "STEL"] : f.era === "deep" ? ["VON", "HIP", "STEL"] : ["AE", "HZ", "VON", "HIP", "DT", "STEL", "ESO"], f.event?.sources));
}

// ---------------------------------------------------------------- globe
const D2R = Math.PI / 180;

/** A small orthographic globe: drag to turn, click to choose a spot. */
export class Globe {
  lon0 = -40;
  lat0 = 25;
  selected: { lat: number; lon: number } | null = null;
  here: { lat: number; lon: number } | null = null;
  private g: CanvasRenderingContext2D;
  private idle = true;
  private raf = 0;

  constructor(private canvas: HTMLCanvasElement, private onPick: (lat: number, lon: number) => void) {
    this.g = canvas.getContext("2d")!;
    let down: { x: number; y: number; moved: boolean } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, moved: false };
      this.target = null;
      canvas.setPointerCapture(e.pointerId);
      this.idle = false;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) down.moved = true;
      if (!down.moved) return;
      const k = 180 / canvas.clientWidth;
      this.lon0 -= dx * k;
      this.lat0 = Math.max(-80, Math.min(80, this.lat0 + dy * k));
      down.x = e.clientX;
      down.y = e.clientY;
      this.draw();
    });
    canvas.addEventListener("pointerup", (e) => {
      if (down && !down.moved) {
        const r = canvas.getBoundingClientRect();
        const p = this.unproject(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
        if (p) this.onPick(p.lat, p.lon);
      }
      down = null;
    });
    canvas.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] }[e.key];
      if (step) {
        e.preventDefault();
        this.idle = false;
        this.lon0 += step[0];
        this.lat0 = Math.max(-80, Math.min(80, this.lat0 + step[1]));
        this.draw();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.onPick(Math.round(this.lat0 * 10) / 10, (((this.lon0 + 540) % 360) - 180));
      }
    });
  }

  /** Spin slowly while the sheet is open and nobody has touched the globe. */
  run(on: boolean) {
    cancelAnimationFrame(this.raf);
    if (!on) return;
    const loop = () => {
      if (this.idle && !matchMedia("(prefers-reduced-motion: reduce)").matches) this.lon0 += 0.08;
      if (this.target) {
        const dl = ((this.target.lon - this.lon0 + 540) % 360) - 180, dp = this.target.lat - this.lat0;
        this.lon0 += dl * 0.12;
        this.lat0 += dp * 0.12;
        if (Math.abs(dl) + Math.abs(dp) < 0.05) this.target = null;
      }
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  private target: { lat: number; lon: number } | null = null;
  /** Turn smoothly to bring a place to the centre. */
  focus(lat: number, lon: number) {
    this.idle = false;
    this.target = { lat: Math.max(-80, Math.min(80, lat)), lon };
  }

  private project(lat: number, lon: number): [number, number, number] {
    const p = lat * D2R, l = (lon - this.lon0) * D2R, p0 = this.lat0 * D2R;
    const x = Math.cos(p) * Math.sin(l);
    const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l);
    const z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
    return [x, y, z];
  }

  private unproject(x: number, y: number): { lat: number; lon: number } | null {
    const R = 0.94;
    x /= R;
    y /= R;
    const r2 = x * x + y * y;
    if (r2 > 1) return null;
    const z = Math.sqrt(1 - r2), p0 = this.lat0 * D2R;
    const lat = Math.asin(y * Math.cos(p0) + z * Math.sin(p0)) / D2R;
    const lon = this.lon0 + Math.atan2(x, z * Math.cos(p0) - y * Math.sin(p0)) / D2R;
    return { lat, lon: ((lon + 540) % 360) - 180 };
  }

  draw() {
    const c = this.canvas, g = this.g;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = c.clientWidth || 240;
    if (c.width !== size * dpr) c.width = c.height = size * dpr;
    const W = c.width, R = (W / 2) * 0.94, cx = W / 2, cy = W / 2;
    g.clearRect(0, 0, W, W);
    const sea = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    sea.addColorStop(0, "#20407a");
    sea.addColorStop(1, "#070f24");
    g.beginPath();
    g.arc(cx, cy, R, 0, 7);
    g.fillStyle = sea;
    g.fill();
    g.save();
    g.clip();
    // land: points behind the globe are pushed onto the limb so shapes close cleanly
    g.fillStyle = "rgba(170, 196, 255, 0.34)";
    g.strokeStyle = "rgba(200, 218, 255, 0.55)";
    g.lineWidth = dpr * 0.7;
    for (const ring of LAND_RINGS) {
      let any = false;
      g.beginPath();
      for (let i = 0; i < ring.length; i++) {
        let [x, y, z] = this.project(ring[i][1], ring[i][0]);
        if (z < 0) {
          const n = Math.hypot(x, y) || 1;
          x /= n;
          y /= n;
        } else any = true;
        if (i === 0) g.moveTo(cx + x * R, cy - y * R);
        else g.lineTo(cx + x * R, cy - y * R);
      }
      if (!any) continue;
      g.closePath();
      g.fill();
      g.stroke();
    }
    // graticule
    g.strokeStyle = "rgba(255, 255, 255, 0.07)";
    for (let lat = -60; lat <= 60; lat += 30) this.path((t) => [lat, t * 360 - 180], cx, cy, R);
    for (let lon = -180; lon < 180; lon += 30) this.path((t) => [t * 180 - 90, lon], cx, cy, R);
    g.restore();
    g.beginPath();
    g.arc(cx, cy, R, 0, 7);
    g.strokeStyle = "rgba(158, 188, 255, 0.5)";
    g.lineWidth = dpr;
    g.stroke();
    const dot = (p: { lat: number; lon: number } | null, color: string, r: number, ringed: boolean) => {
      if (!p) return;
      const [x, y, z] = this.project(p.lat, p.lon);
      if (z < 0) return;
      g.beginPath();
      g.arc(cx + x * R, cy - y * R, r * dpr, 0, 7);
      g.fillStyle = color;
      g.fill();
      if (ringed) {
        g.beginPath();
        g.arc(cx + x * R, cy - y * R, r * 2.4 * dpr, 0, 7);
        g.strokeStyle = color;
        g.lineWidth = dpr * 1.2;
        g.stroke();
      }
    };
    dot(this.here, "rgba(255,255,255,0.6)", 2.5, false);
    dot(this.selected, "#ffd98a", 3.5, true);
  }

  private path(f: (t: number) => [number, number], cx: number, cy: number, R: number) {
    const g = this.g;
    g.beginPath();
    let pen = false;
    for (let i = 0; i <= 72; i++) {
      const [lat, lon] = f(i / 72);
      const [x, y, z] = this.project(lat, lon);
      if (z < 0) {
        pen = false;
        continue;
      }
      if (pen) g.lineTo(cx + x * R, cy - y * R);
      else g.moveTo(cx + x * R, cy - y * R);
      pen = true;
    }
    g.stroke();
  }
}
