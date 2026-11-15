// "Think like an astronomer": one short question per guided scene, so the visit ends in a
// prediction the viewer can check against the sky they just saw. Every answer restates only
// facts the app itself shows or cites.
export interface Think {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export const THINK: Record<string, Think> = {
  princeton_tonight: {
    q: "As city glow grows, what disappears first?",
    options: ["Bright planets like Jupiter", "The Milky Way and the faint stars", "The Moon"],
    answer: 1,
    why: "Sky glow drowns faint, spread-out light first. Planets and the brightest stars survive even downtown; the Milky Way is the first thing lost. Turn on City glow in Layers to compare.",
  },
  giza2560: {
    q: "Thuban marked north over Giza. Polaris marks it today. What moved?",
    options: ["The stars drifted across the sky", "Earth's spinning axis slowly swung round, pointing at a different star", "Egypt moved to a new latitude"],
    answer: 1,
    why: "Axial precession: Earth's tilted axis traces a circle about every 26,000 years. Around 2600 BCE it pointed close to Thuban in Draco; today it points near Polaris. The stars themselves barely moved.",
  },
  stonehenge2500: {
    q: "What decides where the midsummer Sun rises behind the stones?",
    options: ["The tilt of Earth's axis and the latitude of the site", "The constellations behind the Sun", "The phase of the Moon"],
    answer: 0,
    why: "Sunrise direction depends on axial tilt and latitude. The tilt was about 24° then and is 23.4° now, so the solstice sunrise has hardly shifted, while precession moved the stars a long way.",
  },
  eclipse2017: {
    q: "There is a new Moon every month. Why is a solar eclipse rare?",
    options: ["The Moon is usually too small to cover the Sun", "The Moon's orbit is tilted about 5°, so it usually passes above or below the Sun", "Clouds hide most of them"],
    answer: 1,
    why: "Only when a new Moon falls near a crossing point of the two orbits do the Sun, Moon and Earth line up. Watch the eclipse here to see the Moon slide exactly across the Sun.",
  },
  dart2022: {
    q: "What did NASA's DART impact actually change?",
    options: ["It destroyed the asteroid Dimorphos", "It shortened Dimorphos's orbit around Didymos by about 32 minutes", "It pushed both asteroids out of the asteroid belt"],
    answer: 1,
    why: "The impact slowed Dimorphos slightly, cutting its orbit of 11 hours 55 minutes by about 32 minutes. Neither asteroid threatened Earth: it was a test of planetary defence.",
  },
  halley1910: {
    q: "Halley returns about every 76 years. Why not exactly the same each time?",
    options: ["Jupiter and Saturn tug on it, changing the orbit a little each pass", "It loses mass and speeds up", "Calendars have changed"],
    answer: 0,
    why: "Planetary pulls make the gap between returns vary from about 74 to 79 years. That is why this app uses a separate JPL Horizons orbit for each return.",
  },
  sn1054: {
    q: "The 1054 star was bright enough to see by day. Why can't we see it now?",
    options: ["It moved behind the Sun", "It was an exploding star that faded within two years; its debris is now the Crab Nebula", "Light pollution hides it"],
    answer: 1,
    why: "A supernova flares for weeks and fades over months. What remains is the Crab Nebula, still expanding, with a pulsar at its centre.",
  },
};

/** Fallback questions by how certain the scene is. */
export const THINK_ERA: Record<"historical" | "deep" | "geologic", Think> = {
  historical: {
    q: "In this scene, what is calculated and what is illustration?",
    options: ["Everything is a photograph", "Sun, Moon, planet and star positions are calculated; the landscape and colours are illustration", "Nothing is calculated"],
    answer: 1,
    why: "Positions come from Astronomy Engine and a long-term precession model, checked against JPL Horizons. The ground, haze and artwork are there to help you read the sky. Scientific basis shows the full list.",
  },
  deep: {
    q: "Tens of thousands of years back, what can still be computed?",
    options: ["The exact time on a clock", "The direction of Earth's axis, and so which stars circle the pole", "The weather that night"],
    answer: 1,
    why: "The long-term precession model gives the axis direction for about 200,000 years. Calendars, clocks and planet positions cannot be pinned down this far back.",
  },
  geologic: {
    q: "Are these the stars a dinosaur would have seen?",
    options: ["Yes, exactly these constellations", "No: the stars have moved hundreds of light-years, so today's patterns are drawn only as a reference", "Yes, but dimmer"],
    answer: 1,
    why: "Millions of years ago the real star patterns are unknown. What the plate model does give is where this spot sat on the globe, which sets how the sky turned overhead.",
  },
};

/** Render a question into a host element. Answer reveals the explanation. */
export function renderThink(host: HTMLElement, t: Think) {
  host.innerHTML = "";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Think like an astronomer";
  const q = document.createElement("p");
  q.className = "think-q";
  q.textContent = t.q;
  const list = document.createElement("div");
  list.className = "think-options";
  const why = document.createElement("p");
  why.className = "think-why";
  why.hidden = true;
  t.options.forEach((label, i) => {
    const b = document.createElement("button");
    b.className = "think-opt";
    b.textContent = label;
    b.addEventListener("click", () => {
      list.querySelectorAll("button").forEach((x, k) => {
        x.classList.toggle("right", k === t.answer);
        x.classList.toggle("wrong", k === i && i !== t.answer);
        (x as HTMLButtonElement).disabled = true;
      });
      why.textContent = (i === t.answer ? "Yes. " : "Not quite. ") + t.why;
      why.hidden = false;
    });
    list.appendChild(b);
  });
  host.append(eyebrow, q, list, why);
}
