// Offline gazetteer: famous sky-watching sites, so travel works with no network.
export interface Place { name: string; lat: number; lon: number; aliases?: string[] }

export const PLACES: Place[] = [
  { name: "Princeton", lat: 40.3431, lon: -74.6551, aliases: ["hackprinceton", "princeton university", "new jersey"] },
  { name: "Giza", lat: 29.9792, lon: 31.1342, aliases: ["pyramids", "great pyramid", "khufu", "egypt", "cairo pyramids"] },
  { name: "Cairo", lat: 30.0444, lon: 31.2357 },
  { name: "Luxor", lat: 25.6872, lon: 32.6396, aliases: ["thebes", "karnak"] },
  { name: "Memphis, Egypt", lat: 29.85, lon: 31.25, aliases: ["memphis egypt"] },
  { name: "Alexandria", lat: 31.2001, lon: 29.9187 },
  { name: "Dendera", lat: 26.1419, lon: 32.6700 },
  { name: "Abu Simbel", lat: 22.3372, lon: 31.6258 },
  { name: "Babylon", lat: 32.5422, lon: 44.4209, aliases: ["mesopotamia"] },
  { name: "Nineveh", lat: 36.3594, lon: 43.1528, aliases: ["assyria"] },
  { name: "Ur", lat: 30.9626, lon: 46.1031 },
  { name: "Jerusalem", lat: 31.7683, lon: 35.2137, aliases: ["bethlehem"] },
  { name: "Athens", lat: 37.9715, lon: 23.7257, aliases: ["acropolis", "greece"] },
  { name: "Rhodes", lat: 36.4341, lon: 28.2176 },
  { name: "Delphi", lat: 38.4824, lon: 22.5010 },
  { name: "Rome", lat: 41.8902, lon: 12.4922, aliases: ["colosseum"] },
  { name: "Stonehenge", lat: 51.1789, lon: -1.8262, aliases: ["salisbury"] },
  { name: "Newgrange", lat: 53.6947, lon: -6.4755, aliases: ["bru na boinne"] },
  { name: "Lascaux", lat: 45.0537, lon: 1.1676 },
  { name: "Gobekli Tepe", lat: 37.2232, lon: 38.9224, aliases: ["göbekli tepe", "gobekli"] },
  { name: "Chichen Itza", lat: 20.6843, lon: -88.5678, aliases: ["chichén itzá", "el castillo", "kukulkan"] },
  { name: "Chicxulub, Yucatan", lat: 21.30, lon: -89.60, aliases: ["chicxulub", "yucatan", "yucatán", "dinosaur impact", "k-pg"] },
  { name: "Teotihuacan", lat: 19.6925, lon: -98.8438 },
  { name: "Tikal", lat: 17.2220, lon: -89.6237 },
  { name: "Machu Picchu", lat: -13.1631, lon: -72.5450, aliases: ["inca", "cusco"] },
  { name: "Chaco Canyon", lat: 36.0608, lon: -107.9611, aliases: ["pueblo bonito", "chaco"] },
  { name: "Mauna Kea", lat: 19.8207, lon: -155.4681, aliases: ["hawaii"] },
  { name: "Uluru", lat: -25.3444, lon: 131.0369, aliases: ["ayers rock", "australia"] },
  { name: "Angkor Wat", lat: 13.4125, lon: 103.8670, aliases: ["angkor", "cambodia"] },
  { name: "Varanasi", lat: 25.3176, lon: 82.9739 },
  { name: "Jaipur", lat: 26.9248, lon: 75.8246, aliases: ["jantar mantar"] },
  { name: "Salem, India", lat: 11.6643, lon: 78.1460 },
  { name: "Chennai", lat: 13.0827, lon: 80.2707 },
  { name: "Beijing", lat: 39.9042, lon: 116.4074 },
  { name: "Xi'an", lat: 34.3416, lon: 108.9398, aliases: ["xian", "chang'an", "xianyang"] },
  { name: "Kaifeng", lat: 34.7970, lon: 114.3076 },
  { name: "Samarkand", lat: 39.6542, lon: 66.9597, aliases: ["ulugh beg"] },
  { name: "Isfahan", lat: 32.6539, lon: 51.6660 },
  { name: "Baghdad", lat: 33.3152, lon: 44.3661 },
  { name: "Padua", lat: 45.4064, lon: 11.8768 },
  { name: "Prague", lat: 50.0755, lon: 14.4378 },
  { name: "Greenwich", lat: 51.4769, lon: -0.0005, aliases: ["london"] },
  { name: "Atacama Desert", lat: -24.6272, lon: -70.4043, aliases: ["atacama", "chile", "paranal"] },
  { name: "Sahara", lat: 23.4162, lon: 25.6628, aliases: ["sahara desert"] },
  { name: "North Pole", lat: 89.99, lon: 0 },
  { name: "Equator", lat: 0, lon: 0 },
  { name: "Siberia", lat: 60.89, lon: 101.89, aliases: ["tunguska"] },
  { name: "Houston", lat: 29.7604, lon: -95.3698 },
  { name: "New York", lat: 40.7128, lon: -74.0060, aliases: ["nyc", "manhattan"] },
  { name: "Iselin", lat: 40.5754, lon: -74.3224 },
];

export function findPlace(text: string): Place | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { p: Place; len: number } | null = null;
  for (const p of PLACES) {
    for (const key of [p.name, ...(p.aliases ?? [])]) {
      const k = key.toLowerCase();
      const re = new RegExp(`[^a-z]${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z]`);
      if (re.test(t) && (!best || k.length > best.len)) best = { p, len: k.length };
    }
  }
  return best?.p ?? null;
}
