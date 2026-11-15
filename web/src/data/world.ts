// Present-day land outlines (Natural Earth 110m via world-atlas), shared by the maps.
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";

export type Ring = [number, number][];

export const LAND_RINGS: Ring[] = (() => {
  const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
  const geo = feature(topo, topo.objects.land) as unknown as { features: { geometry: { type: string; coordinates: unknown } }[] };
  const out: Ring[] = [];
  for (const f of geo.features) {
    const g = f.geometry;
    const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Ring[][];
    for (const p of polys) for (const r of p) out.push(r);
  }
  return out;
})();
