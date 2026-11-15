import { setGlowCities } from "../sky/landscape";
// The time machine's search: instant suggestions as you type (moments, places, eras,
// sky objects), and Claude for anything open-ended.
import { retrieve, parseLocally, type SceneRequest, type SkyEvent } from "../data/knowledge";
import { astroYearFromAgo, CURRENT_YEAR, formatYear } from "../astro/time";

export type GazRow = [string, number, number, string, number, string];

export interface Suggestion {
  group: "Go" | "Moments" | "Places" | "Eras" | "In the sky";
  title: string;
  meta: string;
  apply: () => void;
}

export const ERAS: { name: string; words: string[]; year: number; place?: [string, number, number]; note: string }[] = [
  { name: "Tonight", words: ["tonight", "now", "today", "present"], year: CURRENT_YEAR, note: "The sky right now" },
  { name: "Pyramids being built", words: ["pyramid", "old kingdom", "khufu", "ancient egypt"], year: -2559, place: ["Giza", 29.9792, 31.1342], note: "Giza, 2560 BCE" },
  { name: "Stonehenge rises", words: ["neolithic", "stonehenge", "bronze age"], year: -2499, place: ["Stonehenge", 51.17886, -1.82622], note: "2500 BCE" },
  { name: "Rome at its height", words: ["rome", "roman", "colosseum", "classical"], year: 117, place: ["Rome", 41.8902, 12.4922], note: "117 CE" },
  { name: "Medieval sky", words: ["medieval", "middle ages", "viking", "crusade"], year: 1066, note: "1066 CE" },
  { name: "Before electric light", words: ["1800s", "victorian", "before electricity"], year: 1850, note: "1850 CE" },
  { name: "The last ice age", words: ["ice age", "glacial", "mammoth", "pleistocene"], year: astroYearFromAgo(21000), note: "21,000 years ago" },
  { name: "Green Sahara", words: ["green sahara", "humid period"], year: -6999, place: ["Sahara", 23.416, 25.663], note: "7000 BCE" },
  { name: "End of the dinosaurs", words: ["cretaceous", "t rex", "tyrannosaurus", "extinction"], year: astroYearFromAgo(66e6), note: "66 million years ago" },
  { name: "Age of dinosaurs", words: ["jurassic", "dinosaur", "sauropod", "brachiosaurus"], year: astroYearFromAgo(150e6), note: "150 million years ago" },
  { name: "Pangaea", words: ["pangaea", "pangea", "supercontinent", "triassic", "permian"], year: astroYearFromAgo(250e6), note: "250 million years ago" },
];

export function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

const FILLER = /\b(take me|bring me|go|show me|show|the sky|sky|over|above|from|in|on|at|during|around|to|of|the|a|an|what|did|look|like|was|when|famous|year|years|ago|bce|bc|ce|ad|million|thousand|night|tonight|midnight|dawn|sunrise|sunset|dusk|evening|noon|am|pm|\d+(st|nd|rd|th)?|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/g;

export class Search {
  private gaz: GazRow[] = [];
  private gazNorm: string[] = [];

  constructor(private events: SkyEvent[], private targets: string[]) {}

  async load(fetchJson: (p: string) => Promise<unknown>) {
    try {
      this.gaz = (await fetchJson("/data/gazetteer.json")) as GazRow[];
      this.gazNorm = this.gaz.map((r) => norm(r[0]));
      // populations for the modelled city glow (rank = 20 + 10 log10(population), see build_gazetteer.py)
      setGlowCities(this.gaz.filter((r) => r[3] === "city" && r[4] >= 60).map((r) => [r[1], r[2], Math.pow(10, (r[4] - 20) / 10)]));
    } catch {
      this.gaz = [];
    }
  }

  /** Name of the nearest populated place or feature within about 60 km, for labelling a clicked spot. */
  nearest(lat: number, lon: number): string | null {
    let best: GazRow | null = null, bd = 0.55 * 0.55;
    const c = Math.cos((lat * Math.PI) / 180);
    for (const r of this.gaz) {
      const dy = r[1] - lat;
      if (dy > 0.6 || dy < -0.6) continue;
      const dx = (((r[2] - lon + 540) % 360) - 180) * c;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = r; }
    }
    return best ? (bd < 0.0004 ? best[0] : `Near ${best[0]}`) : null;
  }

  /** Place words left after removing dates and filler. */
  placeText(q: string) {
    return norm(q).replace(FILLER, " ").replace(/\s+/g, " ").trim();
  }

  places(text: string, k = 6): GazRow[] {
    const t = norm(text);
    if (t.length < 2) return [];
    const words = t.split(" ");
    const scored: [number, GazRow][] = [];
    for (let i = 0; i < this.gaz.length; i++) {
      const n = this.gazNorm[i];
      let s = 0;
      if (n === t) s = 1000;
      else if (n.startsWith(t)) s = 700;
      else if (words.every((w) => n.includes(w))) s = 500;
      else if (words.length > 1 && words.some((w) => w.length > 3 && n.split(" ").includes(w))) s = 150;
      else continue;
      const r = this.gaz[i];
      // context words (country, region) also count: "kerid iceland"
      const ctx = norm(r[5]);
      for (const w of words) if (w.length > 2 && ctx.includes(w)) s += 120;
      scored.push([s + r[4], r]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, k).map((x) => x[1]);
  }

  /** Grouped suggestions for what is typed so far. */
  suggest(q: string, act: {
    goScene: (req: SceneRequest, label: string) => void;
    goEvent: (e: SkyEvent) => void;
    lookAt: (name: string) => void;
  }): Suggestion[] {
    const out: Suggestion[] = [];
    const text = q.trim();
    if (!text) return out;
    const parsed = parseLocally(text, this.events, this.targets);
    const pt = this.placeText(text);
    const placeHits = pt ? this.places(pt) : [];
    const eras = ERAS.filter((e) => e.words.some((w) => norm(text).includes(w)) || norm(e.name).startsWith(norm(text)));

    // the direct trip: a place and/or a time read from the words
    const when = parsed.year !== undefined ? formatYear(parsed.year) : null;
    const top = placeHits[0];
    if (top && (when || parsed.month || parsed.hour !== undefined)) {
      const label = `${top[0]}${when ? `, ${when}` : ""}`;
      out.push({
        group: "Go", title: label, meta: [top[5], kindLabel(top[3])].filter(Boolean).join(". "),
        apply: () => act.goScene({ ...parsed, place: { name: top[0], lat: top[1], lon: top[2] } }, label),
      });
    } else if (!top && when) {
      out.push({ group: "Go", title: `Here, ${when}`, meta: "Keep this place", apply: () => act.goScene(parsed, when) });
    }
    for (const e of eras.slice(0, 2)) {
      out.push({
        group: "Eras", title: e.name, meta: e.note,
        apply: () => act.goScene({ year: e.year, place: e.place ? { name: e.place[0], lat: e.place[1], lon: e.place[2] } : undefined }, e.name),
      });
    }
    for (const { event } of retrieve(this.events, text, 4).filter((r) => r.score > 1.2)) {
      out.push({
        group: "Moments", title: event.title, meta: `${event.year === 0 && event.month === 0 ? "Tonight" : formatYear(event.year)}, ${event.place}`,
        apply: () => act.goEvent(event),
      });
    }
    for (const r of placeHits.slice(0, 5)) {
      if (out[0]?.group === "Go" && r === top) continue;
      out.push({
        group: "Places", title: r[0], meta: [r[5], kindLabel(r[3])].filter(Boolean).join(". "),
        apply: () => act.goScene({ ...parsed, place: { name: r[0], lat: r[1], lon: r[2] } }, r[0]),
      });
    }
    const nt = norm(text);
    if (nt.length > 2) {
      for (const t of this.targets.filter((x) => norm(x).startsWith(nt)).slice(0, 3)) {
        out.push({ group: "In the sky", title: t, meta: "Find it in this sky", apply: () => act.lookAt(t) });
      }
    }
    return out.slice(0, 12);
  }

  /** Ask Claude to read an open-ended request. Returns null if Claude is unavailable. */
  async askClaude(text: string): Promise<SceneRequest | null> {
    const c = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
    if (!c) return null;
    const sample = (await c.use("sample").catch(() => null)) as null | { json: (i: string, o?: object) => Promise<unknown> };
    if (!sample) return null;
    const list = this.events.map((e) => `${e.id}: ${e.title} (${e.year === 0 ? "now" : formatYear(e.year)}, ${e.place})`).join("\n");
    const prompt = `You are the navigator of a sky time machine. Read the request and reply with only a JSON object:
{"event_id": string|null, "place": {"name": string, "lat": number, "lon": number}|null, "year": number|null, "month": number|null, "day": number|null, "hour": number|null, "target": string|null, "reply": string}
Rules:
- Today is ${new Date().toISOString().slice(0, 10)}. "year" is ASTRONOMICAL: 1 BCE = 0, so N BCE = 1 - N. "N years ago" = ${CURRENT_YEAR} - N. Range: -300000000 to ${CURRENT_YEAR}.
- Give accurate coordinates (north and east positive) for the place the person means, choosing the most famous match (e.g. "Iceland famous crater" -> Kerid crater, 64.041, -20.885).
- hour is local solar time, 0-24. Leave fields null when the request does not imply them. If no time is given, null.
- Set event_id ONLY to an id from this list when the request is clearly about that moment:
${list}
- target: a star, planet, comet or constellation to face, if asked.
- reply: one plain sentence saying where and when you are taking them and why it is interesting. No dashes.
Request: ${text}`;
    try {
      const j = (await sample.json(prompt, { modelTier: "quick" })) as Record<string, unknown>;
      const req: SceneRequest = { reply: typeof j.reply === "string" ? j.reply : undefined };
      const ev = typeof j.event_id === "string" ? this.events.find((e) => e.id === j.event_id) : undefined;
      if (ev) req.event = ev;
      const pl = j.place as { name?: unknown; lat?: unknown; lon?: unknown } | null;
      if (pl && Number.isFinite(Number(pl.lat)) && Number.isFinite(Number(pl.lon))) {
        req.place = { name: String(pl.name ?? "Here"), lat: Math.max(-90, Math.min(90, Number(pl.lat))), lon: ((Number(pl.lon) + 540) % 360) - 180 };
      }
      for (const k of ["year", "month", "day", "hour"] as const) if (Number.isFinite(Number(j[k])) && j[k] !== null) req[k] = Number(j[k]);
      if (typeof j.target === "string") req.target = j.target;
      return req;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "not_granted" || code === "sampling_disabled") return null;
      return null;
    }
  }
}

function kindLabel(k: string) {
  if (k === "city" || k === "region") return "";
  return k.charAt(0).toUpperCase() + k.slice(1);
}
