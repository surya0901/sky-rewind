# Sky Rewind

Rewind the night sky to any place and moment in history. Stand at Giza while the pyramid
builders watched Thuban circle the pole, watch the guest star of 1054 blaze in Taurus,
or see the sky over the Yucatan on the night the dinosaurs ended.

HackPrinceton, Science + Discovery track.

## Run it

**Easiest:** double-click `start.command` in Finder. The first run installs packages, then
the app opens at http://localhost:5173.

**By hand:**

```bash
cd web
npm install
npm run dev            # http://localhost:5173
```

Optional language agent (better natural-language parsing; the app works without it):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r server/requirements.txt
cp server/.env.example server/.env      # add an API key
uvicorn server.app:app --port 8000
```

**On your iPhone ("point your phone" mode):**

```bash
cd web && npm run phone
```

Open the `https://<your-mac-ip>:5173` address it prints on your phone (same Wi-Fi), accept
the certificate warning, then tap **Point your phone at the sky**. Safari only grants
motion and compass access over HTTPS, which is why this mode uses a local certificate.

## What it does

| Feature | How |
|---|---|
| Any place, any date, 100 million years | Three eras with honest accuracy limits (below) |
| The Moon Knight rewind | The whole sky sweeps sideways in blue streaks, left into the past and right into the future, and lands on the exact sky of the new date. Drag the time dial to do it by hand |
| Sky Guide style interface | Full-screen sky, title at the top, five glass buttons at the bottom (layers, time, compass, moments, search) |
| Explore a place | Globe button: search 12,800 places or click a turning globe; the date and time stay as they are |
| Scientific basis | A card on every moment and in Layers: what is computed, the model behind each part, a confidence label and linked sources |
| Modelled city glow | Natural darkness, before electric light, and today for the same sky, with a computed count of catalogue stars within the estimated naked-eye limit. City glow is modelled from nearby city size; NASA Black Marble is cited as the reference dataset but is not wired in |
| Explain this sky | Four scene-based questions answered in five parts (seeing, physics, why it matters, confidence, sources). Built from computed scene values; on the published page Claude rewords the same facts and can only cite from the fixed source list |
| Start a discovery | A 75-second guided story: Princeton, Giza and Thuban, precession, back to Princeton, the city lights comparison |
| Inspector | Click a star, planet, the Moon or a constellation name: altitude and azimuth, magnitude, coordinates, rise, highest and set times, a sourced fact where one exists, and links to explain it or see the scientific basis |
| Labels by zoom | Wide view shows constellation names, medium adds bright stars, close adds fainter ones; planets win overlaps |
| Shortcuts | Space plays time, R resets the view, / or Cmd+K searches, Esc closes, F is full screen. Time has a Now button. Night vision turns the display red |
| Look through the Earth | Layers, Ground: Solid, See-through or Space. With see-through you can tilt straight down and see the stars under your feet, dimmed, with the horizon as a thin ring. An Ecliptic toggle draws the path of the Sun, Moon and planets |
| Evidence & visualization | Four moments carry one real, credited image each, labelled Observation or Scientific visualization: DART (ASI/NASA), Chelyabinsk plume (NASA SVS), the 2024 eclipse (NASA/Keegan Barber), the Chicxulub crater rim from radar (NASA/JPL). Images load from NASA; if one cannot, a labelled fallback shows instead |
| Wildlife | Dinosaurs are distant silhouettes on the horizon with pterosaurs circling; a Layers toggle turns them off |
| Constellation art | Stellarium's western figures by Johan Meuris, anchored to their stars; the one you look at glows |
| Tap to identify | Stars (name, Bayer designation, magnitude, colour temperature, rise and set), planets and the Moon (distance, phase) |
| Point your phone | Device compass and tilt drive the camera; a reticle names what you aim at |
| Speak or type | Live suggestions for moments, 12,800 places, eras and sky objects as you type. Open-ended requests ("Iceland famous crater") go to Claude on the published page, the LangChain agent locally, or the offline parser |
| Place and time picker | Click a world map, search places, set year with BCE / CE / years ago |
| 61 sourced sky moments | Supernovae appear on their dates, eclipses darken the sky, meteor storms, bolides |
| Guided tour | One button plays a curated journey for judges |
| Comets from their orbits | Halley (31 apparitions, 240 BCE to 2061), Hale-Bopp, NEOWISE and West, with ion and dust tails pointing away from the Sun |
| Continental drift | Merdith et al. (2021) plate model via GPlates: the map shows Pangaea and every later stage, and the sky uses the latitude your spot had then |
| Landscapes by place and era | Desert, forest, jungle, mountains, the Green Sahara, the Laurentide ice front, Mesozoic forest with dinosaurs and a volcano |
| Landmarks at true positions | Giza pyramids (with the white casing until 1303 CE), Stonehenge (whole, then ruined), El Castillo, Teotihuacan, Angkor Wat, Uluru, Machu Picchu, Newgrange, the Colosseum. Each appears only after it was built |
| Impacts | Chicxulub: flash, ground shake, fireball, burning sky, then dust. Tunguska and Chelyabinsk at smaller scale |
| Sound | Web Audio: rewind whoosh, bolide roar, impact boom and rumble, wind, insects and city hum per landscape. Phones vibrate on impacts. Optional ElevenLabs clips via `ELEVENLABS_API_KEY` |
| Who ruled here | Historical borders for 54 dates from 123,000 BCE to 2010 (historical-basemaps), on the map and under the date |
| Dinosaurs | 3D sauropods and tyrannosaurids built on curved spines, walking with jointed legs |
| Light pollution | Modern cities glow and lose their faint stars. Rewind before 1900 and they come back |

Controls: drag to look, scroll or +/- to zoom, arrows or WASD to turn and tilt, or the look pad.

## Accuracy, by era

| Era | Range | Model | Verified |
|---|---|---|---|
| Recorded history | 4000 BCE to 3000 CE | Astronomy Engine (Delta T, nutation, VSOP87 planets) plus Vondrák 2011 long-term precession | Internal consistency only: the app's frame agrees with Astronomy Engine's own horizon math within 1.2 arcmin at 2560 BCE (`npm run test:astro`). Not independently checked against JPL Horizons |
| Deep time | to about 200,000 years ago | Vondrák, Capitaine & Wallace (2011) via pyerfa `ltpb`, valid ±200 kyr | Pole sits 0.09° from Thuban in 2800 BCE and within 3° of Vega by 12,000 BCE |
| Geologic | beyond | Reconstruction only | Stars younger than ~50 Myr are removed, the rest scattered, and the UI says so |

Things the app is upfront about:

- **Calendars drift.** Before October 1582 dates are Julian, so the Stonehenge midsummer solstice of 2500 BCE falls on 14 July.
- **Earth's spin slows.** Delta T is about 8 hours by 1250 BCE and 17 hours by 2560 BCE. Astronomy Engine models it; its uncertainty grows with age.
- **Deep time has no clock.** Past about 4000 BCE the date sets the season and the slider sets local solar time.
- **Comets are not drawn.** Two-body orbits for Halley drift by years over millennia; those moments say so.
- **Proper motion** is applied to the 112 brightest named stars (from the XEphem catalogue in pyephem).

## Architecture

```
web/                      Vite + TypeScript + three.js (no framework, full control of the render loop)
  src/astro/frame.ts      world = A(lat) · Rz(LST) · P(epoch) · u_J2000, one matrix shared by every layer
  src/astro/ephemeris.ts  recorded-history mode: Sun geometry, planets, Delta T from Astronomy Engine
  src/sky/shaders.ts      stars (proper motion on the GPU), Milky Way, twilight, Moon phase, dunes, trails
  src/sky/engine.ts       render passes: sky -> trail accumulation (max with decay) -> display -> dunes
  src/data/knowledge.ts   BM25 retrieval over the event knowledge base and an offline query parser
  src/ui/                 timeline, picker, identify card, voice (Web Speech API), phone orientation
  public/data/            prebuilt binary catalogues and events.json
server/                   FastAPI + LangChain: RAG (BM25Retriever) -> structured output (SkyQuery) -> geocode
scripts/build_data.py     regenerates public/data from npm and pip packages
```

**Why sidereal time comes from the Sun.** LST = RA of the Sun + the Sun's hour angle. In recorded
history both come from Astronomy Engine for a real date. In deep time they come from the season
and solar hour. The same matrix code serves both, so the rewind animation interpolates smoothly
across eras and spins exactly whole turns.

**Agent pipeline.** The query is matched against the knowledge base with BM25, the top events
go into the prompt, and the model must return a typed `SkyQuery`. It can only pick an
`event_id` that was retrieved, so it can't invent history. With no key or no network, the
browser falls back to a local parser and the same retrieval. Set `LLM_MODEL` to any LangChain
provider string; for a sponsor's OpenAI-compatible gateway use `openai:<model>` with
`OPENAI_BASE_URL`.

## Data and licences

| Data | Source | Licence |
|---|---|---|
| Stars to magnitude 7.2, names, designations | d3-celestial (Hipparcos-based) | BSD-3 |
| Constellation figures and art | Stellarium western sky culture (npm `@found-in-space/stellarium-skycultures-western`); illustrations by Johan Meuris | CC BY-SA; art under the Free Art License |
| Proper motions | XEphem catalogue in pyephem | LGPL |
| Long-term precession | pyerfa (ERFA) `ltpb` | BSD-3 |
| Planets, Delta T, eclipses | Astronomy Engine | MIT |
| Milky Way | Procedural, placed with the IAU galactic transform | ours |
| World map | world-atlas (Natural Earth) | ISC / public domain |
| Sky moments | Curated in `events.json`, each with sources; eclipse and solstice times computed with Astronomy Engine | ours |
| Paleogeography | Merdith et al., Earth-Science Reviews 214 (2021), served by gws.gplates.org; baked into `paleo.json` | CC BY 4.0 |
| Historical borders | historical-basemaps, A. Ourednik (2010s to present) | GPL-3.0 |
| Gazetteer | Natural Earth populated places, countries, provinces, physical features | public domain |
| Comet orbits | JPL Small-Body Database; Halley perihelia from Yeomans & Kiang (1981) | public |

Regenerate data: `pip install pyerfa ephem pillow numpy && cd web && npm install && npm run build:data`.

Checks: `npx tsx tests/astro.test.ts` (sky frame), `npx tsx tests/comets.test.ts` (comet positions against 1910, 1066, 1986 and 1997), `npx tsx tests/paleo.test.ts` (paleolatitudes).

One-file builds: after `npm run build`, `python3 scripts/make_standalone.py` writes `SkyRewind.html` (double-click to open) and `SkyRewind.web.html` (the published page).

## 36-hour plan

| Hours | Goal | Owner idea |
|---|---|---|
| 0 to 4 | Everyone runs it; pick the demo route; decide who owns sky, UI, agent, story | all |
| 4 to 12 | Add 10 more moments your team cares about (your region, your culture); verify each date with `tests/compute_events.ts` | story |
| 4 to 12 | Agent: add your key, test 30 phrasings, tune the prompt; try the sponsor model | agent |
| 12 to 20 | Visual polish on a real GPU: trail length, Milky Way strength, landmark silhouettes (pyramids at Giza, trilithons at Stonehenge) | sky |
| 12 to 20 | Phone mode on two real phones; fix any compass offset | UI |
| 20 to 28 | Stretch: draw comets from JPL Horizons ephemerides you download ahead of time; ambient sound | any |
| 28 to 32 | Record a backup demo video; freeze features | all |
| 32 to 36 | Pitch rehearsal, Devpost write-up, screenshots | all |

## Demo script (2 minutes)

1. Open on tonight over Princeton. Tap Vega: "this is the real sky right now."
2. Say "Take me to Giza when the pyramid was built." The sky spins backward. Turn on **Pole drift**: the pole sits on Thuban, not Polaris.
3. Click the 1054 moment: a new star brighter than Venus in Taurus, recorded by Song astronomers. Today it's the Crab Nebula.
4. Drag the timeline to 66 million years ago at Chicxulub. The bolide comes in from the northeast. Point out that the app removes Orion's young giants because they didn't exist yet.
5. Hand a judge the phone in point mode.

Pitch line: *every sky you see is computed, and where the science runs out, the app tells you.*


## Observation Brief

"Plan an observation" builds a short plan for a class or a star party from the computed sky: three naked-eye targets that are really above the horizon (altitude, direction, viewing window), the Moon's effect, the modelled skyglow estimate against a dark-sky baseline, a timed plan for 10, 20 or 45 minutes, and a Sky Survey that compares what the group saw with the model (copy as text or download as CSV). The planner (web/src/ui/brief.ts) is deterministic: every number comes from the astronomy engine and the Walker's-law skyglow model, and no language model writes any of it.

## Testing (run `npm test` in web/)

- `test:astro`: regression test of the app's sky frame against Astronomy Engine's own horizon output (worst 1.2 arcmin). Not independent.
- `test:horizons`: independent check of the full pipeline against JPL Horizons, 13 Sun, Moon and planet positions at five places and dates. Modern dates within 0.4 arcmin; the Moon before 1000 BCE can be off by about 1.5°.
- `test:comets`: 11 comet positions against JPL Horizons; all within 0.1°. Halley uses per-return elements from Horizons.
- `test:paleo`: wide-bound sanity checks of the plate model; not precise validation.
- `test:landscape`: the ground model. Chennai in 1877 has no city glow and no urban stage; a place built today and rewound to 1877 rebuilds its ground (the cache key carries the urban stage, urban and light-pollution values); no ordinary city ever gets building geometry, only curated landmark sites do.

City glow is a modelled educational estimate (Walker's law from bundled city populations), not satellite data. NASA Black Marble is cited for further reading only.

- Time zones: @photostructure/tz-lookup (MIT), offline coordinates to IANA zone lookup. At sea and above 80° latitude the app shows local solar time instead.

## Image credits

- Milky Way: ESO / S. Brunier, "The Milky Way panorama" (eso0932a), CC BY 4.0, reprojected from galactic to J2000 equatorial coordinates, with the point stars suppressed by a multi-scale filter (scripts/build_milkyway.py) so the dust lanes, star clouds and nebulae stay sharp at 8192 × 4096 (web/public/data/milkyway.jpg). The catalogue stars are the only star layer.
- Evidence photographs: NASA Image and Video Library, credited on each card.
