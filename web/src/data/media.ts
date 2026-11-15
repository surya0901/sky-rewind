// Curated evidence for selected moments. Every entry was read from the source page named here;
// nothing is searched live. If an image cannot load, the panel shows a plain fallback instead.
export type MediaStatus = "Observation" | "Scientific visualization" | "Historical illustration" | "Educational reconstruction";

export interface EventMedia {
  eventId: string;
  status: MediaStatus;
  title: string;
  caption: string;
  when: string;
  credit: string;
  sourceLabel: string;
  sourceUrl: string;
  imageUrl: string;
  gradient: string; // shown behind the image, and alone if it fails to load
  more?: { label: string; url: string }[];
  /** key of the embedded copy in /data/media.json, when several moments share one image */
  asset?: string;
}

export const EVENT_MEDIA: EventMedia[] = [
  {
    eventId: "dart2022",
    status: "Observation",
    title: "The DART impact, seen by LICIACube",
    caption: "The Italian cubesat LICIACube photographed the debris thrown up minutes after NASA's DART spacecraft struck the asteroid moonlet Dimorphos. The larger asteroid Didymos is the bright body off centre.",
    when: "26 September 2022, 11 million km from Earth",
    credit: "ASI / NASA",
    sourceLabel: "NASA Science (Astronomy Picture of the Day, 29 September 2022)",
    sourceUrl: "https://science.nasa.gov/image-article/apod-2022-september-29-dart-asteroid-impact-from-space/",
    imageUrl: "https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2022/september/liciacube_leia_l0_1664234215_00000_01_0.jpg",
    gradient: "radial-gradient(circle at 40% 45%, #6f7684, #1a1d26 60%, #06070b)",
    more: [{ label: "Early results imagery from the DART mission (NASA)", url: "https://www.nasa.gov/feature/imagery-of-early-results-from-nasa-s-dart-mission" }],
  },
  {
    eventId: "chelyabinsk2013",
    status: "Scientific visualization",
    title: "The Chelyabinsk dust plume, from satellite data and models",
    caption: "Data from the Suomi NPP satellite combined with NASA's GEOS-5 atmospheric model show how dust from the airburst spread through the stratosphere. This is a visualization, not footage of the meteor.",
    when: "Airburst 15 February 2013; visualization released 14 August 2013",
    credit: "NASA's Goddard Space Flight Center Scientific Visualization Studio",
    sourceLabel: "NASA Scientific Visualization Studio, entry 4094",
    sourceUrl: "https://svs.gsfc.nasa.gov/4094",
    imageUrl: "https://svs.gsfc.nasa.gov/vis/a000000/a004000/a004094/chelyabinsk_comp.08380.jpg",
    gradient: "radial-gradient(circle at 60% 40%, #5a6f96, #152038 65%, #070b14)",
  },
  {
    eventId: "eclipse2024",
    status: "Observation",
    title: "Totality over Dallas, Texas",
    caption: "The Sun's corona during the total solar eclipse whose path crossed North America from Mexico's Pacific coast to Newfoundland.",
    when: "8 April 2024, Dallas, Texas",
    credit: "NASA / Keegan Barber",
    sourceLabel: "NASA image NHQ202404080101",
    sourceUrl: "https://science.nasa.gov/image-detail/amf-nhq202404080101/",
    imageUrl: "https://images-assets.nasa.gov/image/NHQ202404080101/NHQ202404080101~large.jpg",
    gradient: "radial-gradient(circle at 50% 50%, #000 14%, #e9eefb 16%, #55607a 30%, #05060a 70%)",
  },
  {
    eventId: "chicxulub",
    status: "Observation",
    title: "The buried crater's rim, mapped by radar from orbit",
    caption: "Shuttle radar elevation data of the Yucatan. A faint semicircular trough, only 3 to 5 metres deep and about 5 km wide, traces the rim of the Chicxulub crater. This is the crater as it is today, not a picture of the impact.",
    when: "Data acquired February 2000, Yucatan Peninsula, Mexico",
    credit: "NASA / JPL",
    sourceLabel: "NASA Photojournal PIA03379",
    sourceUrl: "https://science.nasa.gov/photojournal/shaded-relief-with-height-as-color-yucatan-peninsula-mexico/",
    imageUrl: "https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia03/pia03379/PIA03379.jpg",
    gradient: "linear-gradient(160deg, #1d4a3a, #7da34f 45%, #d9c36a 70%, #1b3a5c)",
    more: [{ label: "Scientific visualization: Chicxulub impact event, computer animations and paper models (USGS Open-File Report 97-442-A)", url: "https://pubs.usgs.gov/publication/ofr97442A" }],
  },
  {eventId: "sn1054", asset: "PIA03606", status: "Observation", title: "The Crab Nebula: what the 1054 star left behind", caption: "Hubble mosaic of the expanding debris from the supernova recorded in 1054. A pulsar, the collapsed core of the star, spins at its centre. This is the remnant today, not the star as it was seen.", when: "Released 1 December 2005", credit: "NASA / ESA / JPL / Arizona State University", sourceLabel: "NASA Image and Video Library, PIA03606", sourceUrl: "https://images.nasa.gov/details/PIA03606", imageUrl: "https://images-assets.nasa.gov/image/PIA03606/PIA03606~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "sn1006", asset: "GSFC_20171208_Archive_e002166", status: "Observation", title: "The shell of SN 1006 today", caption: "X-ray, radio and visible light combined show the full shell of the remnant, about 60 light-years across and nearly 7,000 light-years away. This is the remnant today, not the star as it was seen.", when: "Released 1 July 2008", credit: "NASA (Goddard Space Flight Center image archive)", sourceLabel: "NASA Image and Video Library, GSFC_20171208_Archive_e002166", sourceUrl: "https://images.nasa.gov/details/GSFC_20171208_Archive_e002166", imageUrl: "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e002166/GSFC_20171208_Archive_e002166~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "sn1987a", asset: "stsci-h-p1708c-m-2000x2000", status: "Observation", title: "The remains of Supernova 1987A", caption: "ALMA (red), Hubble (green) and Chandra (blue) observations combined, three decades after the explosion.", when: "Released 24 February 2017", credit: "NASA, ESA, and A. Angelich (NRAO/AUI/NSF)", sourceLabel: "NASA Image and Video Library, stsci-h-p1708c-m-2000x2000", sourceUrl: "https://images.nasa.gov/details/stsci-h-p1708c-m-2000x2000", imageUrl: "https://images-assets.nasa.gov/image/stsci-h-p1708c-m-2000x2000/stsci-h-p1708c-m-2000x2000~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "halley240bce", asset: "PIA17485", status: "Observation", title: "Halley's nucleus, seen by Giotto in 1986", caption: "The European Giotto spacecraft flew past Halley during its 1986 return and photographed the dark nucleus. The same comet, on a later visit: not a picture from this date.", when: "14 March 1986", credit: "NASA / ESA / Giotto Project", sourceLabel: "NASA Image and Video Library, PIA17485", sourceUrl: "https://images.nasa.gov/details/PIA17485", imageUrl: "https://images-assets.nasa.gov/image/PIA17485/PIA17485~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "halley1066", asset: "PIA17485", status: "Observation", title: "Halley's nucleus, seen by Giotto in 1986", caption: "The European Giotto spacecraft flew past Halley during its 1986 return and photographed the dark nucleus. The same comet, on a later visit: not a picture from this date.", when: "14 March 1986", credit: "NASA / ESA / Giotto Project", sourceLabel: "NASA Image and Video Library, PIA17485", sourceUrl: "https://images.nasa.gov/details/PIA17485", imageUrl: "https://images-assets.nasa.gov/image/PIA17485/PIA17485~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "halley1910", asset: "PIA17485", status: "Observation", title: "Halley's nucleus, seen by Giotto in 1986", caption: "The European Giotto spacecraft flew past Halley during its 1986 return and photographed the dark nucleus. The same comet, on a later visit: not a picture from this date.", when: "14 March 1986", credit: "NASA / ESA / Giotto Project", sourceLabel: "NASA Image and Video Library, PIA17485", sourceUrl: "https://images.nasa.gov/details/PIA17485", imageUrl: "https://images-assets.nasa.gov/image/PIA17485/PIA17485~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "halebopp1997", asset: "sts083-410-009", status: "Observation", title: "Hale-Bopp from the Space Shuttle", caption: "A time exposure taken by the crew of Space Shuttle mission STS-83.", when: "4 to 8 April 1997", credit: "NASA", sourceLabel: "NASA Image and Video Library, sts083-410-009", sourceUrl: "https://images.nasa.gov/details/sts083-410-009", imageUrl: "https://images-assets.nasa.gov/image/sts083-410-009/sts083-410-009~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "neowise2020", asset: "NHQ202007120001", status: "Observation", title: "Comet NEOWISE over Washington", caption: "The comet seen before sunrise.", when: "12 July 2020, Washington, DC", credit: "NASA / Bill Ingalls", sourceLabel: "NASA Image and Video Library, NHQ202007120001", sourceUrl: "https://images.nasa.gov/details/NHQ202007120001", imageUrl: "https://images-assets.nasa.gov/image/NHQ202007120001/NHQ202007120001~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "eclipse2017", asset: "NHQ201708210100", status: "Observation", title: "Totality above Madras, Oregon", caption: "The total solar eclipse of 21 August 2017, whose path crossed the United States from Oregon to South Carolina.", when: "21 August 2017, Madras, Oregon", credit: "NASA / Aubrey Gemignani", sourceLabel: "NASA Image and Video Library, NHQ201708210100", sourceUrl: "https://images.nasa.gov/details/NHQ201708210100", imageUrl: "https://images-assets.nasa.gov/image/NHQ201708210100/NHQ201708210100~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "eclipse1999", asset: "NHQ201708210100", status: "Observation", title: "What a total eclipse looks like", caption: "A modern total solar eclipse (Oregon, 2017), shown for comparison. This is not a picture of this eclipse.", when: "21 August 2017, Madras, Oregon", credit: "NASA / Aubrey Gemignani", sourceLabel: "NASA Image and Video Library, NHQ201708210100", sourceUrl: "https://images.nasa.gov/details/NHQ201708210100", imageUrl: "https://images-assets.nasa.gov/image/NHQ201708210100/NHQ201708210100~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "eclipse2009", asset: "NHQ201708210100", status: "Observation", title: "What a total eclipse looks like", caption: "A modern total solar eclipse (Oregon, 2017), shown for comparison. This is not a picture of this eclipse.", when: "21 August 2017, Madras, Oregon", credit: "NASA / Aubrey Gemignani", sourceLabel: "NASA Image and Video Library, NHQ201708210100", sourceUrl: "https://images.nasa.gov/details/NHQ201708210100", imageUrl: "https://images-assets.nasa.gov/image/NHQ201708210100/NHQ201708210100~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "eddington1919", asset: "NHQ201708210100", status: "Observation", title: "What a total eclipse looks like", caption: "A modern total solar eclipse (Oregon, 2017), shown for comparison. This is not a picture of this eclipse.", when: "21 August 2017, Madras, Oregon", credit: "NASA / Aubrey Gemignani", sourceLabel: "NASA Image and Video Library, NHQ201708210100", sourceUrl: "https://images.nasa.gov/details/NHQ201708210100", imageUrl: "https://images-assets.nasa.gov/image/NHQ201708210100/NHQ201708210100~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "thales585", asset: "NHQ201708210100", status: "Observation", title: "What a total eclipse looks like", caption: "A modern total solar eclipse (Oregon, 2017), shown for comparison. This is not a picture of this eclipse.", when: "21 August 2017, Madras, Oregon", credit: "NASA / Aubrey Gemignani", sourceLabel: "NASA Image and Video Library, NHQ201708210100", sourceUrl: "https://images.nasa.gov/details/NHQ201708210100", imageUrl: "https://images-assets.nasa.gov/image/NHQ201708210100/NHQ201708210100~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "bursagale763", asset: "NHQ201708210100", status: "Observation", title: "What a total eclipse looks like", caption: "A modern total solar eclipse (Oregon, 2017), shown for comparison. This is not a picture of this eclipse.", when: "21 August 2017, Madras, Oregon", credit: "NASA / Aubrey Gemignani", sourceLabel: "NASA Image and Video Library, NHQ201708210100", sourceUrl: "https://images.nasa.gov/details/NHQ201708210100", imageUrl: "https://images-assets.nasa.gov/image/NHQ201708210100/NHQ201708210100~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "ugarit1223", asset: "NHQ201708210100", status: "Observation", title: "What a total eclipse looks like", caption: "A modern total solar eclipse (Oregon, 2017), shown for comparison. This is not a picture of this eclipse.", when: "21 August 2017, Madras, Oregon", credit: "NASA / Aubrey Gemignani", sourceLabel: "NASA Image and Video Library, NHQ201708210100", sourceUrl: "https://images.nasa.gov/details/NHQ201708210100", imageUrl: "https://images-assets.nasa.gov/image/NHQ201708210100/NHQ201708210100~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "columbus1504", asset: "201012210003HQ", status: "Observation", title: "The Moon in Earth's shadow", caption: "A total lunar eclipse seen from Arlington, Virginia, shown for comparison. This is not a picture of the 1504 eclipse.", when: "21 December 2010, Arlington, Virginia", credit: "NASA / Bill Ingalls", sourceLabel: "NASA Image and Video Library, 201012210003HQ", sourceUrl: "https://images.nasa.gov/details/201012210003HQ", imageUrl: "https://images-assets.nasa.gov/image/201012210003HQ/201012210003HQ~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "greatconj2020", asset: "NHQ202012220003", status: "Observation", title: "Jupiter and Saturn after sunset", caption: "Jupiter (left) and Saturn (right) the evening after their closest approach.", when: "22 December 2020, Washington, DC", credit: "NASA / Aubrey Gemignani", sourceLabel: "NASA Image and Video Library, NHQ202012220003", sourceUrl: "https://images.nasa.gov/details/NHQ202012220003", imageUrl: "https://images-assets.nasa.gov/image/NHQ202012220003/NHQ202012220003~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "bethlehem7bce", asset: "NHQ202012220003", status: "Observation", title: "A Jupiter and Saturn conjunction", caption: "The 2020 conjunction, shown for comparison. This is not a picture of 7 BCE.", when: "22 December 2020, Washington, DC", credit: "NASA / Aubrey Gemignani", sourceLabel: "NASA Image and Video Library, NHQ202012220003", sourceUrl: "https://images.nasa.gov/details/NHQ202012220003", imageUrl: "https://images-assets.nasa.gov/image/NHQ202012220003/NHQ202012220003~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "apollo11", asset: "as11-40-5902", status: "Observation", title: "Buzz Aldrin on the Moon", caption: "Aldrin walks near a leg of the lunar module. Neil Armstrong took the photograph.", when: "20 July 1969, Sea of Tranquility", credit: "NASA", sourceLabel: "NASA Image and Video Library, as11-40-5902", sourceUrl: "https://images.nasa.gov/details/as11-40-5902", imageUrl: "https://images-assets.nasa.gov/image/as11-40-5902/as11-40-5902~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "alsufi964", asset: "PIA04921", status: "Observation", title: "Andromeda in ultraviolet light", caption: "NASA's Galaxy Evolution Explorer view of the galaxy al-Sufi described as a small cloud. Ultraviolet light picks out young, hot stars in its arms.", when: "Released 10 December 2003", credit: "NASA / JPL / Caltech", sourceLabel: "NASA Image and Video Library, PIA04921", sourceUrl: "https://images.nasa.gov/details/PIA04921", imageUrl: "https://images-assets.nasa.gov/image/PIA04921/PIA04921~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "nebra1600", asset: "PIA09262", status: "Observation", title: "The Pleiades in infrared light", caption: "The Spitzer Space Telescope's view of the Seven Sisters, with clouds of dust around the stars. Infrared light, not what the eye sees.", when: "Released 16 April 2007", credit: "NASA / JPL-Caltech", sourceLabel: "NASA Image and Video Library, PIA09262", sourceUrl: "https://images.nasa.gov/details/PIA09262", imageUrl: "https://images-assets.nasa.gov/image/PIA09262/PIA09262~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "matariki", asset: "PIA09262", status: "Observation", title: "The Pleiades in infrared light", caption: "The Spitzer Space Telescope's view of the Seven Sisters, with clouds of dust around the stars. Infrared light, not what the eye sees.", when: "Released 16 April 2007", credit: "NASA / JPL-Caltech", sourceLabel: "NASA Image and Video Library, PIA09262", sourceUrl: "https://images.nasa.gov/details/PIA09262", imageUrl: "https://images-assets.nasa.gov/image/PIA09262/PIA09262~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "lascaux17000", asset: "PIA09262", status: "Observation", title: "The Pleiades in infrared light", caption: "The Spitzer Space Telescope's view of the Seven Sisters, with clouds of dust around the stars. Infrared light, not what the eye sees.", when: "Released 16 April 2007", credit: "NASA / JPL-Caltech", sourceLabel: "NASA Image and Video Library, PIA09262", sourceUrl: "https://images.nasa.gov/details/PIA09262", imageUrl: "https://images-assets.nasa.gov/image/PIA09262/PIA09262~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
  {eventId: "galileo1610", asset: "PIA01299", status: "Observation", title: "The four moons Galileo found", caption: "Io, Europa, Ganymede and Callisto, imaged by NASA's Galileo spacecraft.", when: "NASA Galileo mission", credit: "NASA / JPL / DLR", sourceLabel: "NASA Image and Video Library, PIA01299", sourceUrl: "https://images.nasa.gov/details/PIA01299", imageUrl: "https://images-assets.nasa.gov/image/PIA01299/PIA01299~medium.jpg", gradient: "radial-gradient(circle at 50% 45%, #3a4660, #0b0f1a 70%)"},
];

/** Images embedded with the app (downscaled copies of the originals), keyed by moment. Loaded once at start. */
export const LOCAL_MEDIA: Record<string, string> = {};
export async function loadLocalMedia() {
  try {
    Object.assign(LOCAL_MEDIA, await (await fetch("/data/media.json")).json());
  } catch { /* the remote image or the fallback is used instead */ }
}

export const mediaFor = (eventId: string | undefined) => EVENT_MEDIA.find((m) => m.eventId === eventId) ?? null;
