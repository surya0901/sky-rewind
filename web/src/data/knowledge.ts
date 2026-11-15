// Client side of the knowledge base: event types, keyword retrieval, and an
// offline natural-language parser used when the LLM server is unreachable.
import { findPlace, Place } from "./places";
import { astroYearFromAgo, bceToAstronomical, CURRENT_YEAR } from "../astro/time";

export interface SkyEvent {
  id: string;
  title: string;
  kind: string;
  certainty: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  place: string;
  lat: number;
  lon: number;
  look?: { target?: string; alt?: number; az?: number };
  transient?: { name: string; ra: number; dec: number; peakMag: number; daysVisible: number; start: [number, number, number] };
  meteors?: { radiantRa: number; radiantDec: number; perMinute: number };
  bolide?: { fromAz: number; fromAlt: number; toAz: number; toAlt: number };
  impact?: number; // 0..1 strength of flash, shake and fireball
  summary: string;
  sources: string[];
  tags: string[];
}

export interface SceneRequest {
  place?: Place;
  year?: number; // astronomical
  month?: number;
  day?: number;
  hour?: number;
  target?: string;
  event?: SkyEvent;
  reply?: string;
}

const STOP = new Set("the a an of in at to me take show go what was did is on and for from with sky over above".split(" "));

function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
}

/** BM25-lite retrieval over titles, tags and summaries. */
export function retrieve(events: SkyEvent[], query: string, k = 3): { event: SkyEvent; score: number }[] {
  const q = tokens(query);
  if (!q.length) return [];
  const docs = events.map((e) => ({
    e,
    title: tokens(e.title),
    tags: tokens(e.tags.join(" ")),
    body: tokens(`${e.summary} ${e.place}`),
  }));
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set([...d.title, ...d.tags, ...d.body])) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  return docs
    .map((d) => {
      let score = 0;
      for (const w of q) {
        const idf = Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
        const tf = d.title.filter((x) => x === w).length * 3 + d.tags.filter((x) => x === w).length * 2 + d.body.filter((x) => x === w).length * 0.5;
        score += idf * (tf / (tf + 1.2));
      }
      return { event: d.e, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Offline parser for requests like "Take me to Giza in 1250 BCE at midnight". */
export function parseLocally(text: string, events: SkyEvent[], targets: string[]): SceneRequest {
  const t = text.toLowerCase().replace(/,(?=\d{3})/g, "");
  const req: SceneRequest = {};

  // years
  let m = t.match(/(\d+(?:\.\d+)?)\s*(million|thousand|k)?\s*(?:years?|yrs?)\s*ago/);
  if (m) {
    const mult = m[2] === "million" ? 1e6 : m[2] === "thousand" || m[2] === "k" ? 1e3 : 1;
    req.year = astroYearFromAgo(parseFloat(m[1]) * mult);
  } else if ((m = t.match(/(\d+)\s*(bce|bc|b\.c\.?)\b/))) {
    req.year = bceToAstronomical(parseInt(m[1], 10));
  } else if ((m = t.match(/(?:\b(?:ad|a\.d\.)\s*(\d+))|(?:(\d+)\s*(?:ce|ad|a\.d\.)\b)/))) {
    req.year = parseInt(m[1] ?? m[2], 10);
  } else if ((m = t.match(/\b(?:in|year)\s+(\d{3,4})\b/)) || (m = t.match(/\b(1[0-9]{3}|20[0-9]{2})\b/))) {
    req.year = parseInt(m[1], 10);
  } else if (/jurassic/.test(t)) {
    req.year = astroYearFromAgo(150e6);
  } else if (/cretaceous|t\.? ?rex|tyrannosaur/.test(t)) {
    req.year = astroYearFromAgo(68e6);
  } else if (/triassic|pangaea|pangea/.test(t)) {
    req.year = astroYearFromAgo(230e6);
  } else if (/ice age|glacial|mammoth/.test(t)) {
    req.year = astroYearFromAgo(21000);
  } else if (/dinosaur/.test(t) && !/impact|asteroid|extinct/.test(t)) {
    req.year = astroYearFromAgo(150e6);
  } else if (/\b(today|tonight|now|right now)\b/.test(t)) {
    req.year = CURRENT_YEAR;
  }

  // month and day
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b${MONTHS[i]}[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b|\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTHS[i]}[a-z]*\\b`);
    const mm = t.match(re);
    if (mm) {
      req.month = i + 1;
      req.day = parseInt(mm[1] ?? mm[2], 10);
      break;
    }
    if (new RegExp(`\\b${MONTHS[i]}[a-z]*\\b`).test(t) && !req.month && MONTHS[i] !== "may") {
      req.month = i + 1;
      req.day = 15;
    }
  }
  if (/summer solstice|midsummer/.test(t)) [req.month, req.day] = [6, 21];
  if (/winter solstice|midwinter/.test(t)) [req.month, req.day] = [12, 21];
  if (/spring equinox|vernal equinox|march equinox/.test(t)) [req.month, req.day] = [3, 20];
  if (/autumn equinox|fall equinox|autumnal/.test(t)) [req.month, req.day] = [9, 22];

  // hour
  if ((m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/))) {
    let h = parseInt(m[1], 10) % 12;
    if (m[3] === "pm") h += 12;
    req.hour = h + (m[2] ? parseInt(m[2], 10) / 60 : 0);
  } else if (/midnight/.test(t)) req.hour = 0;
  else if (/\bdawn|sunrise\b/.test(t)) req.hour = 5;
  else if (/\bdusk|sunset|evening\b/.test(t)) req.hour = 19.5;
  else if (/\bnoon|midday\b/.test(t)) req.hour = 12;

  req.place = findPlace(t) ?? undefined;
  const tgt = targets.find((n) => new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
  if (tgt) req.target = tgt;

  // knowledge-base match when the query names an event rather than coordinates
  const hits = retrieve(events, text, 1);
  const strong = hits[0] && hits[0].score > 2.2;
  if (strong && (req.year === undefined || !req.place)) req.event = hits[0].event;
  return req;
}
