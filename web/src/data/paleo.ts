// Continental drift from the Merdith et al. (2021) plate model, served by the GPlates
// Web Service and baked into public/data/paleo.json by scripts/build_paleo.py.
//   land: run-length land masks (2° cells) for each age
//   grid / places: where present-day points sat at each age (paleomagnetic frame, so
//   paleolatitude is measured from the spin axis and drives the sky directly)

const AL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-";

export interface PaleoData {
  model: string;
  w: number;
  h: number;
  land: Record<string, string>;
  ptimes: number[];
  grid: { step: number; lats: number[]; lons: number[]; at: Record<string, string> };
  places: { name: string; lat: number; lon: number; at: Record<string, string> }[];
}

export class Paleo {
  private masks = new Map<number, Uint8Array>();
  readonly landTimes: number[];

  constructor(private d: PaleoData) {
    this.landTimes = Object.keys(d.land).map(Number).sort((a, b) => a - b);
  }

  get model() {
    return this.d.model;
  }

  /** Land mask (1 = land) for the slice nearest this age in millions of years. */
  mask(ageMy: number): { t: number; w: number; h: number; m: Uint8Array } | null {
    if (ageMy < 5) return null;
    let t = this.landTimes[0];
    for (const x of this.landTimes) if (Math.abs(x - ageMy) < Math.abs(t - ageMy)) t = x;
    let m = this.masks.get(t);
    if (!m) {
      m = new Uint8Array(this.d.w * this.d.h);
      this.d.land[String(t)].split("/").forEach((row, y) => {
        let x = 0;
        let v = 0;
        for (const ch of row) {
          const n = AL.indexOf(ch);
          for (let i = 0; i < n; i++) m![y * this.d.w + x++] = v;
          v ^= 1;
        }
      });
      this.masks.set(t, m);
    }
    return { t, w: this.d.w, h: this.d.h, m };
  }

  private decode(s: string, i: number): [number, number] | null {
    const a = s.slice(i * 4, i * 4 + 4);
    if (a === "----" || a.length < 4) return null;
    const lat = AL.indexOf(a[0]) * 64 + AL.indexOf(a[1]) - 900;
    const lon = AL.indexOf(a[2]) * 64 + AL.indexOf(a[3]) - 1800;
    return [lat / 10, lon / 10];
  }

  private atTime(lat: number, lon: number, t: number): [number, number] | null {
    // exact reconstruction for named places
    for (const p of this.d.places) {
      if (Math.abs(p.lat - lat) < 0.5 && Math.abs(p.lon - lon) < 0.5) {
        const v = this.decode(p.at[String(t)], 0);
        if (v) return v;
      }
    }
    // otherwise blend the four surrounding grid nodes as unit vectors
    const g = this.d.grid;
    const fi = (lat - g.lats[0]) / g.step;
    const fj = (lon - g.lons[0]) / g.step;
    const i0 = Math.max(0, Math.min(g.lats.length - 2, Math.floor(fi)));
    const j0 = Math.max(0, Math.min(g.lons.length - 2, Math.floor(fj)));
    const s = g.at[String(t)];
    let x = 0, y = 0, z = 0, wsum = 0;
    for (const [di, dj] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const i = i0 + di, j = j0 + dj;
      const v = this.decode(s, i * g.lons.length + j);
      if (!v) continue;
      const wi = 1 - Math.min(1, Math.abs(fi - i));
      const wj = 1 - Math.min(1, Math.abs(fj - j));
      const w = Math.max(1e-3, wi * wj);
      const la = (v[0] * Math.PI) / 180, lo = (v[1] * Math.PI) / 180;
      x += w * Math.cos(la) * Math.cos(lo);
      y += w * Math.cos(la) * Math.sin(lo);
      z += w * Math.sin(la);
      wsum += w;
    }
    if (!wsum) return null;
    return [(Math.asin(z / Math.hypot(x, y, z)) * 180) / Math.PI, (Math.atan2(y, x) * 180) / Math.PI];
  }

  /** Where a present-day place sat at this age (millions of years), or null if unknown. */
  position(lat: number, lon: number, ageMy: number): [number, number] | null {
    if (ageMy < 1) return [lat, lon];
    const T = [0, ...this.d.ptimes];
    let k = 0;
    while (k < T.length - 2 && T[k + 1] < ageMy) k++;
    const t0 = T[k], t1 = T[k + 1];
    const a = t0 === 0 ? ([lat, lon] as [number, number]) : this.atTime(lat, lon, t0);
    const b = this.atTime(lat, lon, t1);
    if (!a || !b) return a ?? b;
    const f = Math.max(0, Math.min(1, (ageMy - t0) / (t1 - t0)));
    let dlon = b[1] - a[1];
    if (dlon > 180) dlon -= 360;
    if (dlon < -180) dlon += 360;
    return [a[0] + (b[0] - a[0]) * f, ((a[1] + dlon * f + 540) % 360) - 180];
  }

  /** Present-day place whose ancient position lies nearest a point on the old map. */
  inverse(plat: number, plon: number, ageMy: number): [number, number] | null {
    const g = this.d.grid;
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let lat = -80; lat <= 80; lat += 2.5) {
      for (let lon = -180; lon < 180; lon += 2.5) {
        const p = this.position(lat, lon, ageMy);
        if (!p) continue;
        const d = (p[0] - plat) ** 2 + ((p[1] - plon) * Math.cos((plat * Math.PI) / 180)) ** 2;
        if (d < bd) {
          bd = d;
          best = [lat, lon];
        }
      }
    }
    void g;
    return bd < 60 ? best : null;
  }
}

/** Draw the world for an age onto a canvas: present-day rings, or the ancient land mask. */
export function drawWorld(
  canvas: HTMLCanvasElement,
  opts: { paleo: Paleo | null; ageMy: number; rings: [number, number][][]; marker: [number, number] | null; land: string; hair: string; dot: string; sand: string; overlay?: (g: CanvasRenderingContext2D, w: number, h: number) => void },
) {
  const w = canvas.clientWidth;
  if (!w) return;
  const h = w / 2;
  const dpr = Math.min(2, window.devicePixelRatio);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = `${h}px`;
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const X = (lon: number) => ((lon + 180) / 360) * w;
  const Y = (lat: number) => ((90 - lat) / 180) * h;
  g.strokeStyle = opts.hair;
  g.lineWidth = 1;
  for (let lon = -150; lon <= 150; lon += 30) { g.beginPath(); g.moveTo(X(lon), 0); g.lineTo(X(lon), h); g.stroke(); }
  for (let lat = -60; lat <= 60; lat += 30) { g.beginPath(); g.moveTo(0, Y(lat)); g.lineTo(w, Y(lat)); g.stroke(); }
  const mk = opts.paleo?.mask(opts.ageMy);
  if (mk) {
    // upscale the 2° mask with smoothing, then threshold for soft coastlines
    const src = document.createElement("canvas");
    src.width = mk.w;
    src.height = mk.h;
    const sg = src.getContext("2d")!;
    const img = sg.createImageData(mk.w, mk.h);
    for (let i = 0; i < mk.m.length; i++) img.data[i * 4 + 3] = mk.m[i] ? 255 : 0;
    sg.putImageData(img, 0, 0);
    const big = document.createElement("canvas");
    big.width = canvas.width;
    big.height = canvas.height;
    const bg = big.getContext("2d")!;
    bg.imageSmoothingEnabled = true;
    bg.imageSmoothingQuality = "high";
    bg.filter = `blur(${0.6 * dpr * (w / mk.w)}px)`;
    bg.drawImage(src, 0, 0, big.width, big.height);
    const data = bg.getImageData(0, 0, big.width, big.height);
    const col = parseColor(opts.land);
    for (let i = 0; i < data.data.length; i += 4) {
      const a = data.data[i + 3] > 110 ? 255 : 0;
      data.data[i] = col[0];
      data.data[i + 1] = col[1];
      data.data[i + 2] = col[2];
      data.data[i + 3] = a;
    }
    bg.filter = "none";
    bg.putImageData(data, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(big, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  } else {
    g.fillStyle = opts.land;
    g.beginPath();
    for (const r of opts.rings) {
      r.forEach(([lon, lat], i) => (i ? g.lineTo(X(lon), Y(lat)) : g.moveTo(X(lon), Y(lat))));
      g.closePath();
    }
    g.fill("evenodd");
  }
  opts.overlay?.(g, w, h);
  if (opts.marker) {
    const [la, lo] = opts.marker;
    g.strokeStyle = opts.sand;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(X(lo), Y(la), 6, 0, Math.PI * 2);
    g.stroke();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      g.beginPath();
      g.moveTo(X(lo) + dx * 7, Y(la) + dy * 7);
      g.lineTo(X(lo) + dx * 11, Y(la) + dy * 11);
      g.stroke();
    }
  }
}

function parseColor(c: string): [number, number, number] {
  const m = c.match(/#([0-9a-f]{6})/i);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  return [58, 61, 71];
}
