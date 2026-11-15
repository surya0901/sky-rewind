// Log-scale ruler from 100 million years ago (left) to today (right).
import { CURRENT_YEAR, formatYear } from "../astro/time";
import type { SkyEvent } from "../data/knowledge";

const MAX_LOG = Math.log10(3.0e8); // 300 million years ago at the left edge

export function yearToX(astroYear: number): number {
  const ago = Math.max(0, CURRENT_YEAR - astroYear);
  return 1 - Math.log10(ago + 1) / MAX_LOG;
}

export function xToYear(x: number): number {
  const ago = Math.pow(10, (1 - Math.min(1, Math.max(0, x))) * MAX_LOG) - 1;
  return Math.round(CURRENT_YEAR - ago);
}

const ERAS: { label: string; ago: number }[] = [
  { label: "10 yr", ago: 10 },
  { label: "100 yr", ago: 100 },
  { label: "1,000 yr", ago: 1000 },
  { label: "10,000 yr", ago: 10000 },
  { label: "100,000 yr", ago: 100000 },
  { label: "1 million", ago: 1e6 },
  { label: "10 million", ago: 1e7 },
  { label: "100 million", ago: 1e8 },
];

// Geologic periods (International Chronostratigraphic Chart), years ago
const PERIODS: { name: string; short: string; from: number; to: number }[] = [
  { name: "Triassic", short: "T", from: 2.519e8, to: 2.013e8 },
  { name: "Jurassic", short: "J", from: 2.013e8, to: 1.45e8 },
  { name: "Cretaceous", short: "K", from: 1.45e8, to: 6.6e7 },
  { name: "Paleogene", short: "Pg", from: 6.6e7, to: 2.3e7 },
  { name: "Neogene", short: "N", from: 2.3e7, to: 2.58e6 },
  { name: "Ice ages", short: "Ice", from: 2.58e6, to: 11700 },
  { name: "Holocene", short: "Hol", from: 11700, to: 0 },
];

export class Timeline {
  private handle: HTMLElement;
  private readout: HTMLElement;
  private track: HTMLElement;
  private dragging = false;
  onCommit: (year: number) => void = () => {};
  onEvent: (e: SkyEvent) => void = () => {};

  constructor(private root: HTMLElement, events: SkyEvent[]) {
    root.innerHTML = `
      <div class="tl-track" role="slider" tabindex="0" aria-label="Year">
        <div class="tl-zones">
          <span class="tl-zone hist" title="Recorded history: calendar dates, planets, eclipses"></span>
          <span class="tl-zone deep" title="Deep time: long-term precession, season and solar hour"></span>
          <span class="tl-zone geo" title="Geologic time: reconstruction only"></span>
        </div>
        <div class="tl-ticks"></div>
        <div class="tl-eras"></div>
        <div class="tl-events"></div>
        <div class="tl-handle"><span class="tl-readout"></span></div>
      </div>`;
    this.track = root.querySelector(".tl-track")!;
    this.handle = root.querySelector(".tl-handle")!;
    this.readout = root.querySelector(".tl-readout")!;

    const ticks = root.querySelector(".tl-ticks")!;
    for (const e of ERAS) {
      const t = document.createElement("span");
      t.className = "tl-tick";
      t.style.left = `${(1 - Math.log10(e.ago + 1) / MAX_LOG) * 100}%`;
      t.textContent = e.label;
      ticks.appendChild(t);
    }
    const now = document.createElement("span");
    now.className = "tl-tick now";
    now.style.left = "100%";
    now.textContent = "Now";
    ticks.appendChild(now);

    // zone boundaries: history down to 4000 BCE, deep time to ~200,000 years ago
    const hx = yearToX(-4000) * 100;
    const dx = yearToX(-198000) * 100;
    const zones = root.querySelectorAll<HTMLElement>(".tl-zone");
    zones[0].style.cssText = `left:${hx}%;width:${100 - hx}%`;
    zones[1].style.cssText = `left:${dx}%;width:${hx - dx}%`;
    zones[2].style.cssText = `left:0;width:${dx}%`;

    const eras = root.querySelector(".tl-eras")!;
    for (const p of PERIODS) {
      const x0 = (1 - Math.log10(p.from + 1) / MAX_LOG) * 100;
      const x1 = (1 - Math.log10(p.to + 1) / MAX_LOG) * 100;
      const b = document.createElement("button");
      b.className = "tl-era";
      b.style.left = `${Math.max(0, x0)}%`;
      b.style.width = `${x1 - Math.max(0, x0)}%`;
      b.dataset.full = p.name;
      b.dataset.short = p.short;
      b.textContent = p.name;
      b.title = `${p.name}: ${formatYear(CURRENT_YEAR - p.from)} to ${p.to ? formatYear(CURRENT_YEAR - p.to) : "now"}`;
      b.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const mid = p.to ? Math.sqrt(p.from * Math.max(p.to, 1)) : 3000;
        this.onCommit(Math.round(CURRENT_YEAR - (p.name === "Ice ages" ? 21000 : mid)));
      });
      eras.appendChild(b);
    }
    const fit = () => {
      for (const b of eras.querySelectorAll<HTMLElement>(".tl-era")) {
        b.textContent = b.dataset.full!;
        if (b.scrollWidth > b.clientWidth) b.textContent = b.dataset.short!;
      }
    };
    new ResizeObserver(fit).observe(eras);

    const evWrap = root.querySelector(".tl-events")!;
    for (const e of events) {
      if (e.year === 0) continue;
      const b = document.createElement("button");
      b.className = `tl-event k-${e.kind}`;
      b.style.left = `${yearToX(e.year) * 100}%`;
      b.title = `${e.title} (${formatYear(e.year)})`;
      b.setAttribute("aria-label", b.title);
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.onEvent(e);
      });
      evWrap.appendChild(b);
    }

    const toX = (clientX: number) => {
      const r = this.track.getBoundingClientRect();
      return (clientX - r.left) / r.width;
    };
    this.track.addEventListener("pointerdown", (e) => {
      const cls = (e.target as HTMLElement).classList;
      if (cls.contains("tl-event") || cls.contains("tl-era")) return;
      this.dragging = true;
      this.track.setPointerCapture(e.pointerId);
      this.preview(xToYear(toX(e.clientX)));
    });
    this.track.addEventListener("pointermove", (e) => {
      if (this.dragging) this.preview(xToYear(toX(e.clientX)));
    });
    this.track.addEventListener("pointerup", (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.onCommit(xToYear(toX(e.clientX)));
    });
    this.track.addEventListener("keydown", (e) => {
      const cur = Number(this.track.getAttribute("aria-valuenow") ?? CURRENT_YEAR);
      const x = yearToX(cur);
      if (e.key === "ArrowLeft") this.onCommit(xToYear(x - 0.01));
      if (e.key === "ArrowRight") this.onCommit(xToYear(x + 0.01));
    });
  }

  private preview(year: number) {
    this.place(year);
    this.readout.textContent = formatYear(year);
  }

  /** Move the handle without committing (called every frame during travel). */
  place(year: number) {
    this.handle.style.left = `${yearToX(year) * 100}%`;
    this.track.setAttribute("aria-valuenow", String(Math.round(year)));
    this.track.setAttribute("aria-valuetext", formatYear(year));
    if (!this.dragging) this.readout.textContent = formatYear(year);
  }
}
