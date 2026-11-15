// "Pick a place and time": click anywhere on a world map, search places,
// and set an exact date with a BCE / CE switch.
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import { PLACES, type Place } from "../data/places";
import { bceToAstronomical, CURRENT_YEAR, formatYear, yearsAgo } from "../astro/time";
import { drawWorld, type Paleo } from "../data/paleo";
import { LAND_RINGS } from "../data/world";

export interface PickerValue {
  place: Place;
  year: number; // astronomical
  month: number;
  day: number;
  hour: number;
}

type Ring = [number, number][];

export class Picker {
  private canvas: HTMLCanvasElement;
  private rings: Ring[] = [];
  /** plate model, set once loaded: the map then shows the continents of the chosen age */
  paleo: Paleo | null = null;
  private value: PickerValue;
  onGo: (v: PickerValue) => void = () => {};

  constructor(private root: HTMLElement, initial: PickerValue) {
    this.value = { ...initial };
    root.innerHTML = `
      <form class="pk" autocomplete="off">
        <div class="pk-map-wrap">
          <canvas class="pk-map" aria-label="World map. Click to choose a location."></canvas>
        </div>
        <p class="pk-mapcap"></p>
        <div class="pk-row">
          <label class="pk-field pk-grow">Place
            <input class="pk-search" type="text" list="pk-places" placeholder="Search or click the map" />
            <datalist id="pk-places"></datalist>
          </label>
        </div>
        <div class="pk-row">
          <label class="pk-field">Latitude <input class="pk-lat" type="number" min="-90" max="90" step="0.01" /></label>
          <label class="pk-field">Longitude <input class="pk-lon" type="number" min="-180" max="180" step="0.01" /></label>
        </div>
        <div class="pk-row">
          <label class="pk-field pk-year">Year <input class="pk-y" type="number" min="1" step="1" /></label>
          <div class="pk-era" role="radiogroup" aria-label="Era">
            <button type="button" data-era="bce" role="radio">BCE</button>
            <button type="button" data-era="ce" role="radio">CE</button>
            <button type="button" data-era="ago" role="radio">years ago</button>
          </div>
        </div>
        <div class="pk-row">
          <label class="pk-field">Month
            <select class="pk-m">${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select>
          </label>
          <label class="pk-field pk-day">Day <input class="pk-d" type="number" min="1" max="31" /></label>
          <label class="pk-field pk-time">Time <input class="pk-h" type="time" step="300" /></label>
        </div>
        <p class="pk-hint"></p>
        <button type="submit" class="pk-go">Go there</button>
      </form>`;
    this.canvas = root.querySelector(".pk-map")!;
    const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
    const geo = feature(topo, topo.objects.land) as unknown as { features: { geometry: { type: string; coordinates: unknown } }[] };
    for (const f of geo.features) {
      const g = f.geometry;
      const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Ring[][];
      for (const p of polys) for (const r of p) this.rings.push(r);
    }
    const dl = root.querySelector("#pk-places")!;
    for (const p of PLACES) {
      const o = document.createElement("option");
      o.value = p.name;
      dl.appendChild(o);
    }
    this.bind();
    this.fill();
    new ResizeObserver(() => this.draw()).observe(this.canvas);
  }

  set(v: PickerValue) {
    this.value = { ...v, place: { ...v.place } };
    this.fill();
  }

  private q<T extends HTMLElement>(sel: string) {
    return this.root.querySelector(sel) as T;
  }

  private era: "bce" | "ce" | "ago" = "ce";

  private fill() {
    const v = this.value;
    this.q<HTMLInputElement>(".pk-search").value = v.place.name;
    this.q<HTMLInputElement>(".pk-lat").value = v.place.lat.toFixed(2);
    this.q<HTMLInputElement>(".pk-lon").value = v.place.lon.toFixed(2);
    const ago = yearsAgo(v.year);
    if (ago > 200000) {
      this.era = "ago";
      this.q<HTMLInputElement>(".pk-y").value = String(Math.round(ago));
    } else if (v.year <= 0) {
      this.era = "bce";
      this.q<HTMLInputElement>(".pk-y").value = String(1 - v.year);
    } else {
      this.era = "ce";
      this.q<HTMLInputElement>(".pk-y").value = String(v.year);
    }
    this.q<HTMLSelectElement>(".pk-m").value = String(v.month);
    this.q<HTMLInputElement>(".pk-d").value = String(v.day);
    const h = ((v.hour % 24) + 24) % 24;
    this.q<HTMLInputElement>(".pk-h").value = `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60) % 60).padStart(2, "0")}`;
    this.syncEra();
    this.draw();
  }

  private syncEra() {
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(".pk-era button")) {
      b.setAttribute("aria-checked", String(b.dataset.era === this.era));
    }
    const hint = this.q<HTMLElement>(".pk-hint");
    hint.textContent =
      this.era === "ago"
        ? "Beyond about 200,000 years the sky becomes a reconstruction. Try 66000000 for the dinosaur impact."
        : this.era === "bce"
          ? "Before 4000 BCE the date sets the season rather than a calendar day."
          : "";
  }

  private read(): PickerValue {
    const yv = Math.max(0, Number(this.q<HTMLInputElement>(".pk-y").value) || 0);
    let year: number;
    if (this.era === "ago") year = CURRENT_YEAR - yv;
    else if (this.era === "bce") year = bceToAstronomical(Math.max(1, yv));
    else year = Math.max(1, Math.min(12000, yv));
    const [hh, mm] = (this.q<HTMLInputElement>(".pk-h").value || "21:00").split(":").map(Number);
    return {
      place: this.value.place,
      year,
      month: Number(this.q<HTMLSelectElement>(".pk-m").value),
      day: Math.max(1, Math.min(31, Number(this.q<HTMLInputElement>(".pk-d").value) || 1)),
      hour: hh + (mm || 0) / 60,
    };
  }

  private setPlace(p: Place) {
    this.value.place = p;
    this.q<HTMLInputElement>(".pk-search").value = p.name;
    this.q<HTMLInputElement>(".pk-lat").value = p.lat.toFixed(2);
    this.q<HTMLInputElement>(".pk-lon").value = p.lon.toFixed(2);
    this.draw();
  }

  private bind() {
    this.canvas.addEventListener("click", (e) => {
      const r = this.canvas.getBoundingClientRect();
      let lon = ((e.clientX - r.left) / r.width) * 360 - 180;
      let lat = 90 - ((e.clientY - r.top) / r.height) * 180;
      const ageMy = this.ageMy();
      if (this.paleo && ageMy >= 5) {
        // the map shows the ancient Earth: find which present-day place sat here
        const now = this.paleo.inverse(lat, lon, ageMy);
        if (!now) {
          this.q<HTMLElement>(".pk-hint").textContent = "That spot was open ocean then. Pick land on the map.";
          return;
        }
        [lat, lon] = now;
      }
      this.setPlace({ name: nameFor(lat, lon), lat: +lat.toFixed(3), lon: +lon.toFixed(3) });
    });
    this.q<HTMLInputElement>(".pk-y").addEventListener("input", () => this.draw());
    const search = this.q<HTMLInputElement>(".pk-search");
    search.addEventListener("change", async () => {
      const t = search.value.trim().toLowerCase();
      const local = PLACES.find((p) => p.name.toLowerCase() === t || p.aliases?.some((a) => a === t))
        ?? PLACES.find((p) => p.name.toLowerCase().startsWith(t));
      if (local) return this.setPlace(local);
      const remote = await geocode(search.value.trim());
      if (remote) this.setPlace(remote);
      else this.q<HTMLElement>(".pk-hint").textContent = `No match for "${search.value}". Click the map instead.`;
    });
    for (const sel of [".pk-lat", ".pk-lon"]) {
      this.q<HTMLInputElement>(sel).addEventListener("change", () => {
        const lat = Math.max(-90, Math.min(90, Number(this.q<HTMLInputElement>(".pk-lat").value)));
        const lon = Math.max(-180, Math.min(180, Number(this.q<HTMLInputElement>(".pk-lon").value)));
        this.setPlace({ name: nameFor(lat, lon), lat, lon });
      });
    }
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(".pk-era button")) {
      b.addEventListener("click", () => {
        const before = this.read();
        this.era = b.dataset.era as typeof this.era;
        // keep the same moment when switching units
        if (this.era === "ago") this.q<HTMLInputElement>(".pk-y").value = String(Math.max(0, yearsAgo(before.year)));
        else if (this.era === "bce") this.q<HTMLInputElement>(".pk-y").value = String(Math.max(1, 1 - before.year));
        else this.q<HTMLInputElement>(".pk-y").value = String(Math.max(1, before.year));
        this.syncEra();
        this.draw();
      });
    }
    this.q<HTMLFormElement>(".pk").addEventListener("submit", (e) => {
      e.preventDefault();
      this.onGo(this.read());
    });
  }

  private ageMy(): number {
    try {
      return yearsAgo(this.read().year) / 1e6;
    } catch {
      return 0;
    }
  }

  private draw() {
    const css = getComputedStyle(document.body);
    const ageMy = this.ageMy();
    const ancient = Boolean(this.paleo && ageMy >= 5);
    const p = this.value.place;
    const marker = ancient ? this.paleo!.position(p.lat, p.lon, ageMy) : ([p.lat, p.lon] as [number, number]);
    drawWorld(this.canvas, {
      paleo: ancient ? this.paleo : null, ageMy, rings: this.rings, marker,
      land: css.getPropertyValue("--land").trim() || "#3a3d47", hair: css.getPropertyValue("--hair").trim(),
      dot: css.getPropertyValue("--ink-3").trim(), sand: css.getPropertyValue("--sand").trim() || "#d9c8a0",
    });
    const cap = this.root.querySelector(".pk-mapcap");
    if (cap) cap.textContent = ancient ? `Continents ${formatYear(this.read().year)}. Click land to choose where to stand.` : "";
  }
}

/** Nearest famous site within ~150 km, otherwise plain coordinates. */
export function nameFor(lat: number, lon: number): string {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of PLACES) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (best && bestD < 150) return `Near ${best.name}`;
  return `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? "E" : "W"}`;
}

function haversineKm(a: number, b: number, c: number, d: number) {
  const R = 6371;
  const r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Online place search through the local server (OpenStreetMap Nominatim). */
async function geocode(q: string): Promise<Place | null> {
  if (location.protocol === "file:") return null;
  try {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j.lat === "number" ? { name: j.name, lat: j.lat, lon: j.lon } : null;
  } catch {
    return null;
  }
}
