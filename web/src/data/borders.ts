// Who ruled a place at a date, from historical-basemaps (A. Ourednik, GPL-3.0):
// 54 world snapshots from 123,000 BCE to 2010. Borders are approximate, especially
// before about 1500, and many peoples are shown as broad cultural regions.

export interface BordersData {
  source: string;
  years: number[];
  polities: Record<string, [string, string, number[][]][]>;
}

type Ring = [number, number][];

export class Borders {
  private decoded = new Map<number, { name: string; ruler: string; rings: Ring[]; box: number[] }[]>();

  constructor(private d: BordersData) {}

  /** The snapshot nearest in time, or null outside the dataset's range. */
  snapshot(year: number): number | null {
    if (year < -130000) return null;
    return this.d.years.reduce((a, b) => (Math.abs(b - year) < Math.abs(a - year) ? b : a));
  }

  private polys(snap: number) {
    let p = this.decoded.get(snap);
    if (p) return p;
    p = this.d.polities[String(snap)].map(([name, ruler, rings]) => {
      const rs: Ring[] = rings.map((flat) => {
        const out: Ring = [];
        let x = 0, y = 0;
        for (let i = 0; i < flat.length; i += 2) {
          if (i === 0) { x = flat[0]; y = flat[1]; } else { x += flat[i]; y += flat[i + 1]; }
          out.push([x / 10, y / 10]);
        }
        return out;
      });
      const box = [180, 90, -180, -90];
      for (const r of rs) for (const [x, y] of r) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
      return { name, ruler, rings: rs, box };
    });
    this.decoded.set(snap, p);
    return p;
  }

  /** The polity covering a point; the smallest one wins where regions overlap. */
  at(lat: number, lon: number, year: number): { name: string; ruler: string; snap: number } | null {
    const snap = this.snapshot(year);
    if (snap === null) return null;
    let best: { name: string; ruler: string; area: number } | null = null;
    for (const p of this.polys(snap)) {
      if (lon < p.box[0] || lon > p.box[2] || lat < p.box[1] || lat > p.box[3]) continue;
      for (const r of p.rings) {
        if (!inside(r, lon, lat)) continue;
        const area = (p.box[2] - p.box[0]) * (p.box[3] - p.box[1]);
        if (!best || area < best.area) best = { name: p.name, ruler: p.ruler, area };
      }
    }
    return best ? { name: best.name, ruler: best.ruler, snap } : null;
  }

  /** Draw polities for a year onto an equirectangular canvas, highlighting one. */
  draw(g: CanvasRenderingContext2D, w: number, h: number, year: number, highlight: string | null, colors: { line: string; hi: string }) {
    const snap = this.snapshot(year);
    if (snap === null) return;
    const X = (lon: number) => ((lon + 180) / 360) * w;
    const Y = (lat: number) => ((90 - lat) / 180) * h;
    for (const p of this.polys(snap)) {
      const hue = hash(p.ruler || p.name) % 360;
      g.fillStyle = p.name === highlight ? colors.hi : `hsla(${hue}, 22%, 46%, 0.42)`;
      g.strokeStyle = colors.line;
      g.lineWidth = p.name === highlight ? 1.2 : 0.5;
      g.beginPath();
      for (const r of p.rings) {
        r.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.closePath();
      }
      g.fill();
      g.stroke();
    }
  }
}

function inside(r: Ring, x: number, y: number) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x1, y1] = r[i], [x2, y2] = r[j];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
