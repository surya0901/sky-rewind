// Observation Brief: turns the computed sky into a short, usable plan for a class or a star party.
// Everything here is deterministic. Positions, magnitudes and the skyglow estimate come from the same
// engine that draws the sky; nothing is written by a language model, so nothing can be invented.
import * as THREE from "three";
import type { SkyEngine } from "../sky/engine";
import { altAzToWorld, worldToAltAz, raDecToUnit } from "../astro/frame";
import { DEEP, TYPE_NAME } from "../data/deepsky";
import { STAR_FACTS, BODY_FACTS } from "./info";

export type Audience = "elementary" | "middle" | "high" | "public";
export type Minutes = 10 | 20 | 45;

export interface BriefTarget {
  name: string;
  kind: string;
  mag: number;
  alt: number;
  az: number;
  window: string;
  fact: string;
}

export interface Brief {
  place: string;
  when: string;
  audience: Audience;
  minutes: Minutes;
  limCity: number;
  limDark: number;
  starsCity: number;
  starsDark: number;
  glow: number;
  targets: BriefTarget[];
  hidden: { name: string; kind: string; alt: number; az: number } | null;
  moon: string;
  milkyWayModel: boolean;
  refs: { name: string; mag: number; alt: number; az: number }[];
  story: string;
  activity: string;
  schedule: string[];
  trace: string[];
}

export interface BriefContext {
  place: string;
  when: string;
  lat: number;
  limCity: number;
  limDark: number;
  glow: number; // 0..1 modelled light-pollution index
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const compass = (az: number) => COMPASS[Math.round(az / 45) % 8];
const where = (alt: number, az: number) => (alt > 75 ? "almost overhead" : `${Math.round(alt)}° up in the ${compass(az)}`);
const AUD: Record<Audience, string> = { elementary: "Elementary school", middle: "Middle school", high: "High school", public: "Public event" };

/** Altitude of a world direction some hours later: the sky turns 15° an hour about the celestial pole. */
function later(w: THREE.Vector3, lat: number, hours: number): number {
  const pole = altAzToWorld(lat, 0).normalize();
  const turn = (sign: number, v: THREE.Vector3) => v.clone().applyAxisAngle(pole, sign * THREE.MathUtils.degToRad(15.04 * hours));
  // pick the sense of rotation in which the east point rises
  const sign = turn(1, altAzToWorld(0, 90)).y > 0 ? 1 : -1;
  return worldToAltAz(turn(sign, w)).alt;
}

function windowText(w: THREE.Vector3, lat: number): string {
  const now = worldToAltAz(w).alt, h1 = later(w, lat, 1), h2 = later(w, lat, 2);
  if (h1 < 10) return "Setting soon: look at this first";
  if (h2 < 10) return "Sinking: best in the next hour";
  if (h1 > now + 3) return "Rising: good now, better in an hour";
  return "Well placed for the next two hours";
}

export function buildBrief(engine: SkyEngine, ctx: BriefContext, audience: Audience, minutes: Minutes): Brief {
  const s = engine.state!;
  const M = s.frame.M;
  const trace: string[] = [];

  // 1. calculateSky
  const bodies = (s.bodies ?? []).filter((b) => b.name !== "Sun").map((b) => {
    const w = new THREE.Vector3(...b.j2000).applyMatrix3(M);
    return { b, w, ...worldToAltAz(w) };
  });
  const stars = engine.namedStars();
  const sunAlt = s.bodies ? worldToAltAz(new THREE.Vector3(...s.bodies.find((b) => b.name === "Sun")!.j2000).applyMatrix3(M)).alt : -90;
  trace.push(`calculateSky: ${ctx.place}, ${ctx.when}. Sun ${Math.abs(Math.round(sunAlt))}° ${sunAlt < 0 ? "below" : "above"} the horizon; ${bodies.filter((x) => x.alt > 0).length} of 8 Moon and planets and ${stars.filter((x) => x.alt > 0).length} named stars above it.`);

  // 2. estimateSkyglow
  const starsCity = Math.round(engine.countVisible(ctx.limCity) / 10) * 10;
  const starsDark = Math.round(engine.countVisible(ctx.limDark) / 10) * 10;
  trace.push(`estimateSkyglow: modelled naked-eye limit magnitude ${ctx.limCity.toFixed(1)} here against ${ctx.limDark.toFixed(1)} with no artificial light (Walker's law from nearby city populations; an estimate, not a measurement).`);

  // 3. findVisibleTargets: only things this sky really shows to the naked eye, high enough to clear rooftops
  const picks: BriefTarget[] = [];
  const moon = bodies.find((x) => x.b.name === "Moon");
  const add = (name: string, kind: string, mag: number, w: THREE.Vector3, fact: string) => {
    const { alt, az } = worldToAltAz(w);
    picks.push({ name, kind, mag, alt, az, window: windowText(w, ctx.lat), fact });
  };
  if (moon && moon.alt > 10 && (moon.b.phase ?? 0) > 0.04) add("Moon", `${Math.round((moon.b.phase ?? 0) * 100)}% lit`, moon.b.mag, moon.w, BODY_FACTS.Moon);
  for (const p of bodies.filter((x) => x.b.name !== "Moon" && x.alt > 12 && x.b.mag < Math.min(ctx.limCity - 1, 2.5)).sort((a, b) => a.b.mag - b.b.mag).slice(0, 2)) {
    add(p.b.name, "Planet", p.b.mag, p.w, BODY_FACTS[p.b.name] ?? "");
  }
  const bright = stars.filter((x) => x.alt > 15 && x.mag < Math.min(ctx.limCity - 1.5, 2.6)).sort((a, b) => (STAR_FACTS[b.name] ? 1 : 0) - (STAR_FACTS[a.name] ? 1 : 0) || a.mag - b.mag);
  for (const st of bright) {
    if (picks.length >= 3) break;
    add(st.name, "Star", st.mag, altAzToWorld(st.alt, st.az), STAR_FACTS[st.name] ?? "One of the brightest stars in tonight's sky.");
  }
  const targets = picks.slice(0, 3);
  trace.push(`findVisibleTargets: ${targets.length ? targets.map((t) => `${t.name} (mag ${t.mag.toFixed(1)}, ${Math.round(t.alt)}° up)`).join(", ") : "nothing bright enough is above 12° at this time"}.`);

  // what the dark-sky baseline would add: the brightest deep-sky object that the city glow hides
  const hid = DEEP.map((d) => ({ d, ...worldToAltAz(raDecToUnit(d.ra, d.dec).applyMatrix3(M)) }))
    .filter((x) => x.alt > 20 && x.d.type !== "asteroid" && x.d.mag < ctx.limDark - 1.5 && x.d.mag > ctx.limCity - 2.5)
    .sort((a, b) => a.d.mag - b.d.mag)[0];
  const hidden = hid ? { name: hid.d.name, kind: TYPE_NAME[hid.d.type], alt: hid.alt, az: hid.az } : null;

  // reference stars of stepped brightness, for the limiting-magnitude survey
  const refs: Brief["refs"] = [];
  const pool = stars.filter((x) => x.alt > 25);
  for (const want of [1, 2.5, 3.5, 4.5, 5.5]) {
    const near = pool.filter((x) => !refs.some((r) => r.name === x.name) && Math.abs(x.mag - want) < 0.6).sort((a, b) => Math.abs(a.mag - want) - Math.abs(b.mag - want))[0];
    if (near) refs.push(near);
  }
  refs.sort((a, b) => a.mag - b.mag);

  const moonText = !moon || moon.alt < 0
    ? "The Moon is below the horizon, so it adds no light to this sky."
    : (moon.b.phase ?? 0) > 0.5
      ? `The Moon is up and ${Math.round((moon.b.phase ?? 0) * 100)}% lit. It brightens the whole sky and hides faint stars, but it is the easiest target for beginners.`
      : `The Moon is up but only ${Math.round((moon.b.phase ?? 0) * 100)}% lit, so it adds little light.`;

  // 4. selectTeachingObjective
  const cityStory = ctx.glow > 0.3;
  const story = cityStory
    ? `Same place, same time: this model estimates that artificial skyglow cuts the faintest visible star from about magnitude ${ctx.limDark.toFixed(1)} to ${ctx.limCity.toFixed(1)}. That is roughly ${starsCity.toLocaleString()} stars in the catalogue instead of ${starsDark.toLocaleString()}. The stars have not gone anywhere. Scattered light from the ground is brighter than they are.`
    : `This sky is close to naturally dark in the model: about ${starsDark.toLocaleString()} catalogue stars are within reach of the naked eye. In a large city the same sky would show only a few hundred.`;
  const a = targets[0]?.name ?? "the brightest star", b = targets[1]?.name ?? "a fainter one";
  const activity = {
    elementary: `Find ${a} and ${b}. Which is brighter? Watch each for ten seconds: stars twinkle, planets mostly shine steadily. Then count every star you can see inside one hand held at arm's length.`,
    middle: `Measure how high ${a} is using fists at arm's length (one fist is about 10°) and compare with the altitude in this brief. Then do the Sky Survey below and see whether your sky matches the model.`,
    high: `Find the faintest reference star you can see and record its magnitude: that is your measured limiting magnitude. Compare it with the modelled ${ctx.limCity.toFixed(1)}, and discuss what could explain the difference (the Moon, haze, nearby lamps, dark adaptation).`,
    public: `Start everyone on ${a}, which no one can miss, then move to ${b}. Finish with the Sky Survey so each visitor leaves with one measurement of their own sky.`,
  }[audience];
  trace.push(`selectTeachingObjective: ${AUD[audience]}, ${minutes} minutes: ${cityStory ? "what artificial light hides" : "reading a dark sky"}.`);

  // 5. createObservationBrief
  const each = minutes === 10 ? 2 : minutes === 20 ? 4 : 8;
  const open = minutes === 10 ? 2 : minutes === 20 ? 4 : 10;
  const close = minutes - open - each * Math.max(1, targets.length);
  const schedule = [
    `${open} min: lights off, eyes adjust. ${minutes === 45 ? "Full dark adaptation takes about 20 minutes, so keep phones dim." : "Keep phones dim."}`,
    ...targets.map((t) => `${each} min: ${t.name}, ${where(t.alt, t.az)}.`),
    `${Math.max(close, 1)} min: Sky Survey and comparison with the model.`,
  ];
  trace.push(`createObservationBrief: ${schedule.length} steps, ${minutes} minutes.`);
  trace.push("saveAndShareBrief: ready to copy as text or download as CSV.");

  return {
    place: ctx.place, when: ctx.when, audience, minutes, limCity: ctx.limCity, limDark: ctx.limDark, starsCity, starsDark, glow: ctx.glow,
    targets, hidden, moon: moonText, milkyWayModel: ctx.limCity >= 6.0, refs, story, activity, schedule, trace,
  };
}

export function briefText(b: Brief): string {
  return [
    `SKY REWIND OBSERVATION BRIEF`,
    `${b.place} · ${b.when} · ${AUD[b.audience]} · ${b.minutes} minutes`,
    ``,
    `TARGETS`,
    ...b.targets.map((t, i) => `${i + 1}. ${t.name} (${t.kind}, magnitude ${t.mag.toFixed(1)}): ${Math.round(t.alt)}° up in the ${compass(t.az)}. ${t.window}. ${t.fact}`),
    ``,
    `MOON: ${b.moon}`,
    `MODELLED ARTIFICIAL SKYGLOW (estimate, not a measurement): faintest naked-eye star about magnitude ${b.limCity.toFixed(1)} here, ${b.limDark.toFixed(1)} with no artificial light. About ${b.starsCity.toLocaleString()} catalogue stars visible against ${b.starsDark.toLocaleString()}.`,
    b.hidden ? `HIDDEN BY CITY LIGHT: ${b.hidden.name} (${b.hidden.kind}) is ${where(b.hidden.alt, b.hidden.az)} but too faint for this sky.` : ``,
    ``,
    `STORY: ${b.story}`,
    ``,
    `PLAN`,
    ...b.schedule.map((x) => `- ${x}`),
    ``,
    `ACTIVITY: ${b.activity}`,
    ``,
    `Positions: Astronomy Engine, checked against JPL Horizons. Skyglow: Walker's law model from nearby city populations.`,
  ].filter((x, i, arr) => !(x === "" && arr[i - 1] === "")).join("\n");
}

export interface BriefHooks {
  look: (name: string) => void;
  rebuild: (audience: Audience, minutes: Minutes) => void;
  close: () => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

function seg<T extends string | number>(label: string, options: [T, string][], value: T, on: (v: T) => void): HTMLElement {
  const wrap = el("div", "seg");
  wrap.setAttribute("role", "radiogroup");
  wrap.setAttribute("aria-label", label);
  for (const [v, text] of options) {
    const b = el("button", "", text);
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(v === value));
    b.addEventListener("click", () => on(v));
    wrap.appendChild(b);
  }
  return wrap;
}

async function save(name: string, text: string, type: string) {
  // inside the hosted Claude page a file is offered through its downloads capability; elsewhere, a plain link
  const claude = (window as unknown as { claude?: { use(n: string): Promise<{ save(f: { filename: string; data: string }): Promise<unknown> } | null> } }).claude;
  if (claude?.use) {
    try {
      const dl = await Promise.race([claude.use("downloads"), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
      if (dl) return void (await dl.save({ filename: name, data: text }));
    } catch {
      return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function renderBrief(host: HTMLElement, b: Brief, hooks: BriefHooks) {
  host.innerHTML = "";
  const x = el("button", "x");
  x.setAttribute("aria-label", "Close");
  x.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>`;
  x.addEventListener("click", hooks.close);
  host.append(x, el("p", "eyebrow", "Observation brief"), el("h2", "", `${b.place.split(",")[0]} · ${b.when}`));

  const pick = el("div", "brief-pick");
  pick.append(
    seg<Audience>("Audience", [["elementary", "Elementary"], ["middle", "Middle school"], ["high", "High school"], ["public", "Public"]], b.audience, (v) => hooks.rebuild(v, b.minutes)),
    seg<Minutes>("Duration", [[10, "10 min"], [20, "20 min"], [45, "45 min"]], b.minutes, (v) => hooks.rebuild(b.audience, v)),
  );
  host.appendChild(pick);

  const tr = el("details", "brief-trace");
  tr.appendChild(el("summary", "", `Planner: ${b.trace.length} steps completed`));
  const tl = el("ol");
  for (const t of b.trace) {
    const [name, ...rest] = t.split(": ");
    const li = el("li");
    li.append(el("b", "", `✓ ${name}`), document.createTextNode(` ${rest.join(": ")}`));
    tl.appendChild(li);
  }
  tr.append(tl, el("p", "fine", "Every number comes from the app's astronomy engine and skyglow model. No language model writes or changes them."));
  host.appendChild(tr);

  host.appendChild(el("h3", "", "What you can see"));
  if (!b.targets.length) host.appendChild(el("p", "", "Nothing bright enough is high in the sky at this time. Try a later hour."));
  const ol = el("ol", "brief-targets");
  for (const t of b.targets) {
    const li = el("li");
    const btn = el("button", "brief-target");
    btn.append(el("span", "bt-name", t.name), el("span", "bt-where", `${Math.round(t.alt)}° up · ${compass(t.az)} · mag ${t.mag.toFixed(1)}`), el("span", "bt-win", t.window));
    btn.title = "Show in the sky";
    btn.addEventListener("click", () => hooks.look(t.name));
    li.append(btn, el("p", "bt-fact", t.fact));
    ol.appendChild(li);
  }
  host.append(ol, el("p", "brief-moon", b.moon));

  host.appendChild(el("h3", "", "What city light hides"));
  host.appendChild(el("p", "", b.story));
  if (b.hidden) host.appendChild(el("p", "brief-hidden", `Example: ${b.hidden.name} (${b.hidden.kind.toLowerCase()}) is ${where(b.hidden.alt, b.hidden.az)} right now, but too faint for this sky.`));

  host.appendChild(el("h3", "", `${b.minutes}-minute plan`));
  const plan = el("ul", "brief-plan");
  for (const s of b.schedule) plan.appendChild(el("li", "", s));
  host.append(plan, el("p", "brief-activity", b.activity));

  // ---- Sky Survey: what the group actually saw, against the model ----
  host.appendChild(el("h3", "", "Sky Survey"));
  const form = el("div", "brief-survey");
  const answers: Record<string, string> = {};
  const ask = (key: string, q: string, options: string[]) => {
    const row = el("div", "bs-row");
    row.appendChild(el("span", "bs-q", q));
    row.appendChild(seg<string>(q, options.map((o) => [o, o]), "", (v) => {
      answers[key] = v;
      row.querySelectorAll("button").forEach((bn) => bn.setAttribute("aria-checked", String(bn.textContent === v)));
    }));
    form.appendChild(row);
  };
  b.targets.forEach((t, i) => ask(`t${i}`, `Can you see ${t.name}?`, ["Yes", "No"]));
  ask("mw", "Can you see the Milky Way?", ["Yes", "No"]);
  if (b.refs.length) ask("ref", "Faintest star you can find", b.refs.map((r) => r.name));
  ask("cloud", "Clouds", ["Clear", "Some", "Overcast"]);
  if (b.refs.length) form.appendChild(el("p", "fine", `Reference stars, brightest first: ${b.refs.map((r) => `${r.name} (mag ${r.mag.toFixed(1)}, ${compass(r.az)}, ${Math.round(r.alt)}° up)`).join("; ")}.`));
  const result = el("div", "brief-result");
  result.hidden = true;
  const rows = (): [string, string, string, string][] => {
    const out: [string, string, string, string][] = [];
    b.targets.forEach((t, i) => out.push([t.name, "Visible", answers[`t${i}`] === "Yes" ? "Visible" : answers[`t${i}`] === "No" ? "Not seen" : "No answer", ""]));
    out.push(["Milky Way", b.milkyWayModel ? "Visible" : "Hidden by skyglow", answers.mw === "Yes" ? "Visible" : answers.mw === "No" ? "Not seen" : "No answer", ""]);
    const ref = b.refs.find((r) => r.name === answers.ref);
    out.push(["Limiting magnitude", b.limCity.toFixed(1), ref ? `at least ${ref.mag.toFixed(1)}` : "No answer", ref ? ref.name : ""]);
    for (const r of out) r[3] = r[3] || "";
    return out;
  };
  const compare = el("button", "pill accent", "Compare with the model");
  compare.addEventListener("click", () => {
    result.innerHTML = "";
    result.hidden = false;
    const table = el("table");
    table.innerHTML = "<thead><tr><th></th><th>Model</th><th>You</th></tr></thead>";
    const tb = el("tbody");
    let agree = 0, answered = 0;
    for (const [what, model, you] of rows()) {
      const trw = el("tr");
      const same = what === "Limiting magnitude" ? null : you === "No answer" ? null : (model === "Visible") === (you === "Visible");
      if (same !== null) {
        answered++;
        if (same) agree++;
      }
      trw.append(el("td", "", what), el("td", "", model), el("td", same === null ? "" : same ? "ok" : "diff", you));
      tb.appendChild(trw);
    }
    table.appendChild(tb);
    result.appendChild(table);
    const ref = b.refs.find((r) => r.name === answers.ref);
    const notes: string[] = [];
    if (answered) notes.push(`Your observation matches the model on ${agree} of ${answered} checks.`);
    if (ref) {
      const brightest = b.refs[b.refs.length - 1].name === ref.name;
      const d = ref.mag - b.limCity;
      notes.push(d > 0.4 ? `You reached magnitude ${ref.mag.toFixed(1)}, fainter than the modelled ${b.limCity.toFixed(1)}: your sky is darker than the estimate, or your eyes are well adapted.`
        : d < -0.8 && !brightest ? `You reached magnitude ${ref.mag.toFixed(1)}, short of the modelled ${b.limCity.toFixed(1)}: nearby lamps, haze, the Moon or eyes not yet adapted can all cost a magnitude or more.`
        : `You reached magnitude ${ref.mag.toFixed(1)}, consistent with the modelled limit of about ${b.limCity.toFixed(1)}.`);
    }
    if (answers.cloud && answers.cloud !== "Clear") notes.push("With cloud about, a missing object says more about the weather than about the model.");
    if (!notes.length) notes.push("Answer the questions above first.");
    for (const n of notes) result.appendChild(el("p", "", n));
  });
  host.append(form, compare, result);

  const actions = el("div", "brief-actions");
  const copy = el("button", "pill", "Copy brief");
  copy.addEventListener("click", async () => {
    const text = briefText(b);
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "Copied";
    } catch {
      save("sky-rewind-brief.txt", text, "text/plain");
    }
    setTimeout(() => (copy.textContent = "Copy brief"), 1600);
  });
  const csv = el("button", "pill", "Download CSV");
  csv.addEventListener("click", () => {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ["place", "time", "audience", "minutes", "item", "model", "observed", "note"].map(q).join(","),
      ...rows().map(([what, model, you, note]) => [b.place, b.when, b.audience, b.minutes, what, model, you, note].map(q).join(",")),
      [b.place, b.when, b.audience, b.minutes, "Clouds", "", answers.cloud ?? "No answer", ""].map(q).join(","),
    ];
    save("sky-rewind-survey.csv", lines.join("\n"), "text/csv");
  });
  actions.append(copy, csv);
  host.append(actions, el("p", "fine", "Positions from Astronomy Engine, checked against JPL Horizons. The skyglow figures are an educational model (Walker's law from nearby city populations), not a measurement of this site."));
}
