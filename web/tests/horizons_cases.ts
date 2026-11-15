// Shared cases for the JPL Horizons comparison (tests/horizons.test.ts).
export const CASES = [
  { label: "Princeton, 11 Nov 2026, 22:00", y: 2026, m: 11, d: 11, h: 22, lat: 40.3431, lon: -74.6551, bodies: ["Moon", "Saturn", "Jupiter", "Mars"] },
  { label: "Hopkinsville, eclipse 2017", y: 2017, m: 8, d: 21, h: 12.7, lat: 36.8656, lon: -87.4886, bodies: ["Sun", "Moon"] },
  { label: "Padua, Galileo, 7 Jan 1610", y: 1610, m: 1, d: 7, h: 19, lat: 45.4064, lon: 11.8768, bodies: ["Jupiter", "Moon"] },
  { label: "Jerusalem, 7 BCE conjunction", y: -6, m: 10, d: 1, h: 21, lat: 31.7683, lon: 35.2137, bodies: ["Jupiter", "Saturn"] },
  { label: "Giza, 2560 BCE", y: -2559, m: 3, d: 20, h: 2, lat: 29.9792, lon: 31.1342, bodies: ["Moon", "Jupiter", "Venus"] },
];
export const HORIZONS_ID: Record<string, string> = { Sun: "10", Moon: "301", Mercury: "199", Venus: "299", Mars: "499", Jupiter: "599", Saturn: "699" };

// JPL Horizons apparent azimuth / elevation (airless), topocentric at sea level, for each case above.
// Fetched 2026-11-11 from ssd.jpl.nasa.gov/api/horizons.api (Jupiter and Saturn before 1600 use the
// system barycentres, which Horizons covers over long spans). [case, body, azimuth deg, elevation deg]
export const HORIZONS: [number, string, number, number][] = [
  [0, "Moon", 265.626056, -41.108575], [0, "Saturn", 198.926499, 49.104634], [0, "Jupiter", 54.403414, -16.860877], [0, "Mars", 54.210939, -14.989266],
  [1, "Sun", 201.802465, 63.502935], [1, "Moon", 201.72233, 63.499232],
  [2, "Jupiter", 113.348962, 50.492122], [2, "Moon", 103.02622, 41.409489],
  [3, "Jupiter", 142.257406, 44.131662], [3, "Saturn", 142.419226, 43.163259],
  [4, "Moon", 118.663997, 5.409819], [4, "Jupiter", 139.240523, 33.994759], [4, "Venus", 7.115486, -58.690771],
];
