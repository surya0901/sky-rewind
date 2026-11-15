// GLSL for every sky layer. All layers share uM (J2000 -> world) so they move together.

export const SKY_RADIUS = 100.0;

// Moves a J2000 unit vector along its proper-motion great circle, then into world space.
const starPosition = /* glsl */ `
  uniform mat3 uM;
  uniform float uYears;      // epoch - 2000, clamped for the proper-motion model
  uniform float uScatter;
  uniform float uBelow;      // brightness of things under the horizon: 0 with solid ground    // geologic mode: positions are unknowable, so scatter them
  attribute vec3 aPM;        // proper motion vector, rad/yr
  attribute vec3 aSeed;

  vec3 skyLocal(vec3 u0) {
    float w = length(aPM);
    vec3 d = u0;
    if (w > 0.0) {
      float th = w * uYears;
      d = u0 * cos(th) + (aPM / w) * sin(th);
    }
    if (uScatter > 0.0) d = normalize(d + aSeed * uScatter);
    return d;
  }
  vec3 skyDirection(vec3 u0) { return uM * skyLocal(u0); }
`;

export const starVert = /* glsl */ `
  ${starPosition}
  attribute float aMag;
  attribute float aBV;
  attribute float aYoung;
  uniform float uPixelRatio;
  uniform float uLimitMag;   // faintest visible magnitude right now (sky brightness)
  uniform float uHideYoung;  // 1 when the scene predates massive young stars
  uniform float uFovScale;
  uniform float uTime;
  uniform float uRewind;     // 0..1 while the sky slides through time
  uniform float uMotion;     // 0..1 how fast the sky is wheeling: the trails carry the light instead of the points
  varying vec3 vColor;
  varying float vAlpha;

  vec3 bvColor(float bv) {
    // muted stellar palette: blue-white through white to warm amber
    float t = clamp((bv + 0.35) / 2.2, 0.0, 1.0);
    vec3 hot = vec3(0.74, 0.82, 1.00);
    vec3 mid = vec3(1.00, 0.97, 0.93);
    vec3 cool = vec3(1.00, 0.76, 0.52);
    return t < 0.25 ? mix(hot, mid, t / 0.25) : mix(mid, cool, (t - 0.25) / 0.75);
  }

  void main() {
    vec3 dir = skyDirection(position);
    vec4 mv = modelViewMatrix * vec4(dir * ${SKY_RADIUS.toFixed(1)}, 1.0);
    gl_Position = projectionMatrix * mv;

    float flux = pow(10.0, -0.4 * (aMag - 1.0));
    float size = clamp(3.4 + 5.2 * pow(flux, 0.4), 3.4, 18.0);
    gl_PointSize = size * uPixelRatio * uFovScale * (1.0 - 0.3 * uRewind);

    float vis = 1.0 - smoothstep(uLimitMag - 0.6, uLimitMag + 0.6, aMag);
    // atmospheric extinction near the horizon
    float ext = smoothstep(-0.01, 0.22, dir.y);
    float young = mix(1.0, 1.0 - aYoung, uHideYoung);
    vAlpha = clamp(pow(flux, 0.4) * 1.45, 0.26, 2.6) * vis * (dir.y > -0.02 ? mix(0.25, 1.0, max(ext, uBelow)) : uBelow * (uBelow < 0.99 ? mix(1.0, 0.04, smoothstep(-0.42, -0.06, dir.y)) : 1.0)) * young;
    // scintillation: gentle overhead, stronger through the thick air near the horizon
    float low = 1.0 - smoothstep(0.0, 0.55, dir.y);
    // three slow, unrelated waves per star, so no two stars breathe together and nothing repeats visibly
    float ph = aSeed.x * 37.0 + aSeed.y * 91.0 + aSeed.z * 53.0;
    float tw = 0.5 * sin(uTime * (0.9 + abs(aSeed.x) * 1.3) + ph)
             + 0.3 * sin(uTime * (1.7 + abs(aSeed.y) * 1.9) + ph * 1.7)
             + 0.2 * sin(uTime * (3.1 + abs(aSeed.z) * 2.3) + ph * 2.9);
    // now and then a star catches the air and glints for a moment
    float glint = pow(max(0.0, sin(uTime * (0.23 + abs(aSeed.z) * 0.31) + ph * 4.3)), 28.0);
    float bright = smoothstep(4.5, 1.0, aMag);
    vAlpha *= 1.0 + (tw * (0.16 + 0.30 * low) + glint * (0.35 + 0.55 * bright)) * (1.0 - uRewind);
    gl_PointSize *= 1.0 + glint * 0.22 * bright * (1.0 - uRewind);
    vAlpha *= (1.0 - 0.35 * uRewind) * (1.0 - 0.92 * uMotion);
    // extinction reddens light low in the sky
    vColor = bvColor(aBV) * mix(vec3(1.0, 0.80, 0.66), vec3(1.0), ext);
    vColor = mix(vColor, vec3(0.62, 0.78, 1.0), 0.5 * uRewind);
  }
`;

export const starFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r2 = dot(p, p) * 4.0;
    float core = exp(-r2 * 9.0);
    float halo = exp(-r2 * 2.6) * 0.22;
    float a = (core + halo) * vAlpha;
    if (a < 0.003) discard;
    // additive blending multiplies by alpha, so send alpha 1 to keep brightness linear
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

// While the sky slides, each star is also drawn as a segment from where it was to where it is,
// so fast motion leaves continuous streaks instead of dots.
export const streakVert = /* glsl */ `
  ${starPosition}
  uniform mat3 uMPrev;
  uniform float uLimitMag;
  uniform float uStreak;
  uniform vec2 uOff;        // clip-space nudge: extra passes thicken the streaks of bright stars
  uniform float uMagCut;
  uniform float uWeight;    // the side passes are fainter, so a trail has a bright core and a soft glow
  attribute float aMag;
  attribute float aBV;
  attribute float aEnd;
  varying vec3 vColor;
  void main() {
    vec3 d = skyLocal(position);
    vec3 dir = aEnd > 0.5 ? uM * d : uMPrev * d;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(dir * ${SKY_RADIUS.toFixed(1)}, 1.0);
    float flux = pow(10.0, -0.4 * (aMag - 1.0));
    float vis = 1.0 - smoothstep(uLimitMag - 0.6, uLimitMag + 0.6, aMag);
    gl_Position.xy += uOff * gl_Position.w;
    float a = clamp(pow(flux, 0.4) * 1.3, 0.12, 2.2) * vis * mix(uBelow, 1.0, step(-0.02, dir.y)) * uStreak * step(aMag, uMagCut) * uWeight;
    // each trail keeps its star's own colour, cooled toward a silver blue: white, ice blue and a few gold arcs
    float t = clamp((aBV + 0.35) / 2.2, 0.0, 1.0);
    vec3 own = t < 0.25 ? mix(vec3(0.70, 0.80, 1.00), vec3(1.0, 0.97, 0.93), t / 0.25) : mix(vec3(1.0, 0.97, 0.93), vec3(1.0, 0.78, 0.52), (t - 0.25) / 0.75);
    vColor = mix(own, vec3(0.66, 0.80, 1.0), 0.35) * a;
  }
`;
export const streakFrag = /* glsl */ `
  varying vec3 vColor;
  void main() { gl_FragColor = vec4(vColor, 1.0); }
`;

// Constellation figures (Stellarium western art) laid on the sky; the one you look at glows.
export const artVert = /* glsl */ `
  uniform mat3 uM;
  uniform vec3 uView;
  attribute vec3 aCenter;
  varying vec2 vUv;
  varying float vFocus;
  varying float vY;
  void main() {
    vec3 dir = uM * position;
    vY = dir.y;
    vUv = uv;
    vFocus = smoothstep(0.93, 0.985, dot(normalize(uM * aCenter), uView));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(dir * ${(SKY_RADIUS * 0.9995).toFixed(2)}, 1.0);
  }
`;
export const artFrag = /* glsl */ `
  uniform sampler2D uArt;
  uniform float uOpacity;
  uniform vec2 uTexel;
  uniform float uBelow;
  varying vec2 vUv;
  varying float vFocus;
  varying float vY;
  void main() {
    float v = texture2D(uArt, vUv).r;
    float l = texture2D(uArt, vUv - vec2(uTexel.x, 0.0)).r;
    float r = texture2D(uArt, vUv + vec2(uTexel.x, 0.0)).r;
    float u = texture2D(uArt, vUv - vec2(0.0, uTexel.y)).r;
    float d = texture2D(uArt, vUv + vec2(0.0, uTexel.y)).r;
    float edge = abs(l - r) + abs(u - d);
    float a = min((v * 0.07 + edge * 1.6) * uOpacity, 0.045) * vFocus * max(smoothstep(-0.02, 0.10, vY), uBelow * 0.8 * (uBelow < 0.99 ? mix(1.0, 0.04, smoothstep(-0.42, -0.06, vY)) : 1.0));
    gl_FragColor = vec4(vec3(0.66, 0.78, 1.0) * a, 1.0);
  }
`;

export const lineVert = /* glsl */ `
  ${starPosition}
  varying float vY;
  void main() {
    vec3 dir = skyDirection(position);
    vY = dir.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(dir * ${(SKY_RADIUS * 0.999).toFixed(2)}, 1.0);
  }
`;

export const lineFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uBelow;
  varying float vY;
  void main() {
    float a = uOpacity * max(smoothstep(-0.01, 0.08, vY), uBelow * 0.8 * (uBelow < 0.99 ? mix(1.0, 0.04, smoothstep(-0.42, -0.06, vY)) : 1.0));
    gl_FragColor = vec4(uColor * a, a);
  }
`;

// Static J2000 polyline (precession circle of the pole)
export const polyVert = /* glsl */ `
  uniform mat3 uM;
  varying float vY;
  void main() {
    vec3 dir = uM * position;
    vY = dir.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(dir * ${(SKY_RADIUS * 0.998).toFixed(2)}, 1.0);
  }
`;

// Background dome: night gradient, twilight toward the Sun, Milky Way in J2000
export const domeVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const domeFrag = /* glsl */ `
  uniform mat3 uM;
  uniform sampler2D uMilkyWay;
  uniform float uMilkyWayOn;
  uniform vec3 uSun;          // world direction
  uniform vec3 uMoon;         // world direction
  uniform float uMoonGlow;    // 0..1, moon altitude x phase
  uniform float uDay;         // 0 night .. 1 full day
  uniform float uEclipse;     // 0 .. 1 darkening from an eclipse
  uniform float uLight;       // city light pollution 0 .. 1
  uniform float uImpact;      // 0 .. 1 red sky from impact ejecta
  uniform vec3 uImpactDir;    // world direction of the impact
  uniform float uRewind;      // 0..1 while the sky slides through time
  uniform float uBelow;       // > 0 when the ground is see-through or gone
  uniform float uVeil;        // 0..1 dark tint over the sky under your feet
  varying vec3 vDir;

  // A pristine, pre-industrial sky: near black, faint airglow low down, no light pollution.
  const vec3 NIGHT_ZENITH = vec3(0.0040, 0.0065, 0.0170);
  const vec3 NIGHT_HORIZON = vec3(0.038, 0.066, 0.140);
  const vec3 AIRGLOW = vec3(0.010, 0.016, 0.010);
  const vec3 DAY_ZENITH = vec3(0.12, 0.25, 0.54);
  const vec3 DAY_HORIZON = vec3(0.46, 0.56, 0.72);
  const vec3 TWILIGHT_ZENITH = vec3(0.035, 0.065, 0.16);
  const vec3 SUNSET = vec3(0.90, 0.42, 0.16);
  const vec3 MOONLIT = vec3(0.045, 0.070, 0.13);

  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x),
                   mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x),
                   mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, t = 0.0;
    for (int k = 0; k < 5; k++) { t += a * vnoise(p); p = p * 2.03 + 0.17; a *= 0.5; }
    return t / 0.97;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(uBelow > 0.0 ? abs(d.y) : d.y, 0.0, 1.0);
    float g = 1.0 - exp(-h * 3.2);
    float sunAlt = uSun.y;
    // daylight belongs to the air above you: looking down through the Earth it is always night
    float dayK = uDay * (uBelow > 0.0 ? smoothstep(-0.035, 0.005, d.y) : 1.0);

    vec3 night = mix(NIGHT_HORIZON, NIGHT_ZENITH, g) + AIRGLOW * exp(-h * 9.0);
    // under your feet there is no air: the far side of the sky is the neutral black of space
    if (uBelow > 0.0 && d.y < 0.0) night = mix(night, vec3(0.0022, 0.0026, 0.0034), uBelow * smoothstep(0.0, -0.10, d.y));
    // moonlight scatters into a pale blue sky, brightest near the Moon
    night += MOONLIT * uMoonGlow * (0.55 + 0.45 * (1.0 - g));
    night += vec3(0.10, 0.11, 0.12) * uMoonGlow * pow(max(dot(d, uMoon), 0.0), 60.0);

    vec3 day = mix(DAY_HORIZON, DAY_ZENITH, g);
    float twi = smoothstep(-0.31, -0.05, sunAlt) * (1.0 - smoothstep(0.02, 0.22, sunAlt));
    vec3 twilight = mix(NIGHT_HORIZON * 3.0, TWILIGHT_ZENITH, g);
    vec3 col = mix(night, twilight, twi * (1.0 - dayK));
    col = mix(col, day, dayK);

    // warm band toward the Sun at sunrise and sunset
    vec2 dh = normalize(d.xz + 1e-5);
    vec2 sh = normalize(uSun.xz + 1e-5);
    float toward = max(dot(dh, sh), 0.0);
    col += SUNSET * twi * pow(toward, 4.0) * pow(1.0 - h, 6.0) * 0.8;
    // glare around the Sun when it is up
    float sd = max(dot(d, uSun), 0.0);
    float sunUp = smoothstep(-0.02, 0.05, sunAlt) * (1.0 - uEclipse);
    col += vec3(1.0, 0.92, 0.80) * pow(sd, 220.0) * sunUp;
    // the bright aureole around the Sun, and a paler sky toward it
    col += vec3(0.95, 0.93, 0.90) * (pow(sd, 18.0) * 0.32 + pow(sd, 4.0) * 0.10) * sunUp * dayK;

    // Milky Way, sampled in J2000 equatorial coordinates so it turns with the stars
    vec3 j = transpose(uM) * d;
    float ra = atan(j.y, j.x);
    float dec = asin(clamp(j.z, -1.0, 1.0));
    vec2 uv = vec2(fract(ra / 6.2831853 + 1.0), 0.5 + dec / 3.14159265);
    // a real photograph of the whole sky (ESO / S. Brunier), reprojected to J2000:
    // dust lanes, star clouds and the red glow of hydrogen where they really are
    // the photograph has had its point stars removed (scripts: star-removing opening filter), so it adds
    // only diffuse light, dust lanes and gas: the catalogue stars stay the one authoritative star layer
    vec3 photo = texture2D(uMilkyWay, uv).rgb;
    float speck = 1.0;
    photo = max(photo - 0.034, 0.0) * 1.05;              // lift off the photograph's background floor
    float lum = dot(photo, vec3(0.30, 0.59, 0.11));
    photo = max(mix(vec3(lum), photo, 1.5), 0.0);         // bring back the colour of the gas clouds
    photo *= vec3(1.06, 0.97, 1.0);                        // hydrogen red, as long exposures record it
    float mw = clamp(lum * 3.0, 0.0, 1.0);
    float dark = (1.0 - 0.82 * dayK) * (1.0 - uMoonGlow * 0.6);
    // more air near the horizon: the Milky Way fades out through the lowest 10 to 15 degrees
    float fade = dark * mix(0.12, 1.0, smoothstep(0.0, 0.26, d.y)) * mix(uBelow, 1.0, step(0.0, d.y)) * uMilkyWayOn;
    // below the horizon there is no air glow to fight, so the far side shows a little richer
    float space = uBelow * smoothstep(0.0, -0.08, d.y);
    // city glow drowns the faint Milky Way first (above the horizon only)
    float glow = (1.0 - space) * uLight;
    // observed sky: city glow drowns the Milky Way almost completely; the dark-sky simulation sets glow to 0
    // while the sky wheels the photograph would smear into bands, so it dims and the star trails take over
    col += photo * speck * (1.7 + 0.8 * space) * fade * (1.0 - 0.96 * smoothstep(0.06, 0.5, glow)) * (1.0 - 0.85 * uRewind);

    // faint dust clouds along the galactic plane, fixed to the stars (skipped while the sky slides)
    if (uRewind < 0.5 && fade > 0.0) {
      float n1 = fbm(j * 2.2 + vec3(3.1, 1.7, 0.4));
      float n2 = fbm(j * 4.6 + vec3(9.2, 4.4, 7.3));
      float veil = smoothstep(0.42, 0.80, n1) * (0.55 + 0.45 * n2);
      float nearPlane = smoothstep(0.02, 0.5, mw);
      vec3 neb = mix(vec3(0.30, 0.50, 0.95), vec3(0.62, 0.40, 0.85), smoothstep(0.3, 0.75, n2)) * veil;
      col += neb * (0.01 + 0.04 * nearPlane) * fade * (1.0 - uRewind * 2.0) * (1.0 - space);
    }
    // the rewind: the whole sky glows a deep electric blue
    // the rewind: a luminous violet-blue wash, brighter overhead, like the sky Khonshu turns back
    col += mix(vec3(0.030, 0.026, 0.085), vec3(0.075, 0.060, 0.175), smoothstep(-0.05, 0.85, d.y)) * uRewind;

    // sodium-lit cities: a warm dome low on the horizon that drowns the faint sky
    col += vec3(0.13, 0.085, 0.05) * uLight * (0.12 + 0.88 * pow(1.0 - h, 3.0)) * (1.0 - dayK);
    // impact: the sky toward the blast burns orange, then the whole sky glows red with ejecta
    float toImpact = max(dot(normalize(d), uImpactDir), 0.0);
    col += vec3(1.0, 0.45, 0.14) * uImpact * (0.015 + 0.75 * pow(toImpact, 9.0) * (0.25 + 0.75 * pow(1.0 - h, 3.0)));
    col += vec3(0.16, 0.035, 0.012) * uImpact * uImpact * pow(1.0 - h, 3.0) * (0.3 + 0.7 * toImpact);

    col = mix(col, NIGHT_ZENITH * 2.5 + vec3(0.02, 0.025, 0.04) * (1.0 - g), uEclipse * dayK);
    // looking down through the Earth: the far side of the sky under a dark veil, with the horizon drawn as a thin bright ring
    if (uVeil > 0.0) {
      // a low line of hills, black against the sky; under it the ground thins out so the far side of the sky shows through
      float az = atan(d.x, -d.z);
      float ridge = 0.013 + 0.010 * sin(az * 3.0 + 1.0) + 0.006 * sin(az * 7.0 + 2.3) + 0.003 * sin(az * 17.0 + 0.7);
      if (d.y < ridge) col = mix(col, vec3(0.003, 0.005, 0.010), mix(0.5, 0.975, smoothstep(-0.42, -0.06, d.y)));
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Sun, Moon and planets as point sprites. Zoomed in far enough, a planet becomes a lit disc
// at its true angular size: phase from the real Sun direction, belts and rings aligned to the
// planet's IAU pole, Saturn's rings opening and closing as they really do.
export const bodyVert = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aIsMoon;   // kind: 0 point, 1 Moon, 2 Jupiter, 3 Saturn, 4 Mars, 5 plain disc
  attribute float aDisc;     // disc radius as a fraction of the sprite, 0 for a point
  attribute vec3 aLight;     // direction to the Sun, in the planet's view frame
  attribute vec3 aPole;      // planet's north pole, in the same frame
  uniform float uPixelRatio;
  uniform float uFovScale;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vIsMoon;
  varying float vDisc;
  varying vec3 vLight;
  varying vec3 vPole;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * uFovScale;
    vColor = aColor;
    vAlpha = aAlpha * smoothstep(-0.02, 0.01, normalize(position).y);
    vIsMoon = aIsMoon;
    vDisc = aDisc;
    vLight = aLight;
    vPole = aPole;
  }
`;

export const bodyFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vIsMoon;
  varying float vDisc;
  varying vec3 vLight;
  varying vec3 vPole;
  uniform float uCorona;     // 0..1 near totality: the Sun's corona shows around the Moon
  uniform float uMoonDark;   // opacity of the Moon's unlit side: high when it is passing in front of the Sun
  float h11(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
  void main() {
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    p.y = -p.y;
    float r2 = dot(p, p);
    if (vDisc > 0.0) {
      vec2 q = p / vDisc;
      float qr2 = dot(q, q);
      vec3 L = normalize(vLight + vec3(0.0, 0.0, 1e-4));
      vec3 N = normalize(vPole + vec3(0.0, 1e-4, 0.0));
      int kind = int(vIsMoon + 0.5);
      // Saturn's rings: where the line of sight crosses the plane through the centre at right angles to the pole
      float ringA = 0.0;
      float ringZ = -1e9;
      vec3 ringCol = vec3(0.0);
      if (kind == 3 && abs(N.z) > 0.0015) {
        float t = -(q.x * N.x + q.y * N.y) / N.z;
        vec3 rp = vec3(q, t);
        float rr = length(rp);
        float band = smoothstep(1.22, 1.26, rr) * (1.0 - smoothstep(2.25, 2.29, rr));
        float cassini = 1.0 - 0.88 * smoothstep(1.935, 1.955, rr) * (1.0 - smoothstep(2.015, 2.035, rr));
        float cRing = mix(0.28, 1.0, smoothstep(1.50, 1.54, rr));
        float aRing = mix(1.0, 0.78, smoothstep(2.03, 2.05, rr));
        ringA = band * cassini * cRing * aRing * 0.92;
        // the sunlit face of the rings, or the dim unlit face
        float face = sign(dot(N, L)) * sign(N.z) > 0.0 ? 1.0 : 0.32;
        // Saturn's shadow falls across the rings behind it
        float bL = dot(rp, L);
        float shadow = (bL < 0.0 && length(rp - bL * L) < 1.0) ? 0.08 : 1.0;
        ringCol = vec3(0.93, 0.86, 0.70) * (0.8 + 0.2 * h11(floor(rr * 70.0))) * face * shadow;
        ringZ = t;
      }
      vec4 o = vec4(0.0);
      if (kind == 6) {
        // the Sun up close: a limb-darkened disc in a soft white glow
        float rq = sqrt(qr2);
        if (rq <= 1.0) {
          float mu = sqrt(max(0.0, 1.0 - qr2));
          o = vec4(vec3(1.0, 0.96, 0.90) * 2.6 * (0.42 + 0.58 * mu), smoothstep(1.0, 0.97, rq) + (1.0 - smoothstep(1.0, 0.97, rq)) * 0.6);
        } else {
          float ang = atan(q.y, q.x);
          float rays = 0.55 + 0.45 * sin(ang * 7.0 + 1.3) * sin(ang * 3.0 + 0.4);
          float g = exp(-(rq - 1.0) * 3.2) * 0.55 + exp(-(rq - 1.0) * 14.0) * 0.6;
          g += uCorona * (exp(-(rq - 1.0) * 1.5) * 1.25 * rays + exp(-(rq - 1.0) * 9.0) * 0.5);
          o = vec4(mix(vec3(1.0, 0.97, 0.93), vec3(0.92, 0.96, 1.0), uCorona) * 1.6, min(g, 1.0));
        }
        if (o.a * vAlpha < 0.003) discard;
        gl_FragColor = vec4(o.rgb, o.a * vAlpha);
        return;
      }
      if (qr2 <= 1.0) {
        vec3 n = vec3(q, sqrt(1.0 - qr2));
        float lit = smoothstep(-0.03, 0.09, dot(n, L));
        float lat = dot(n, N);
        vec3 base = vColor;
        if (kind == 2) {
          float b = 0.5 + 0.5 * sin(lat * 13.0 + 0.4);
          base = mix(vec3(0.70, 0.55, 0.42), vec3(0.98, 0.93, 0.84), b) * (0.93 + 0.07 * sin(lat * 31.0));
          base = mix(base, vec3(0.78, 0.73, 0.66), smoothstep(0.72, 0.95, abs(lat)));
        } else if (kind == 3) {
          base = mix(vec3(0.82, 0.72, 0.52), vec3(0.97, 0.91, 0.74), 0.5 + 0.5 * sin(lat * 10.0));
        } else if (kind == 4) {
          base = mix(vec3(0.82, 0.44, 0.26), vec3(0.96, 0.94, 0.93), smoothstep(0.86, 0.9, abs(lat)));
        }
        float limb = kind == 1 ? mix(0.82, 1.0, n.z) : mix(0.62, 1.0, pow(n.z, 0.45));
        vec3 col = base * limb * lit;
        float edge = smoothstep(1.0, 0.93, qr2);
        float a = edge * mix(kind == 1 ? uMoonDark : 0.12, 1.0, lit);
        if (ringA > 0.0 && ringZ > n.z) { col = mix(col, ringCol, ringA); a = max(a, ringA); }
        o = vec4(col, a);
      } else if (ringA > 0.0) {
        o = vec4(ringCol, ringA);
      } else if (kind != 1) {
        // a faint glow just outside the planet's limb
        float g = exp(-(qr2 - 1.0) * 5.0) * 0.10;
        o = vec4(vColor, g);
      }
      if (o.a * vAlpha < 0.003) discard;
      gl_FragColor = vec4(o.rgb, o.a * vAlpha);
      return;
    }
    float core = exp(-r2 * 6.0);
    float halo = exp(-r2 * 1.6) * 0.3;
    float a = (core + halo) * vAlpha;
    if (a < 0.003) discard;
    // the Sun sits on its own HDR glare, so its disc is brighter than white rather than a grey spot on it
    gl_FragColor = vIsMoon > 8.5 ? vec4(vColor * (1.2 + 5.0 * core), min(a, 1.0)) : vec4(vColor * a, a);
  }
`;

// Galaxies, nebulae and clusters. Each is an illustration drawn at the object's real position,
// size and orientation (catalogue axes and position angle), never a photograph.
export const deepVert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aType;
  attribute float aRatio;
  attribute float aAngle;
  attribute float aSeed;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vType;
  varying float vRatio;
  varying float vAngle;
  varying float vSeed;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
    vAlpha = aAlpha;
    vType = aType;
    vRatio = aRatio;
    vAngle = aAngle;
    vSeed = aSeed;
  }
`;

export const deepFrag = /* glsl */ `
  varying float vAlpha;
  varying float vType;
  varying float vRatio;
  varying float vAngle;
  varying float vSeed;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, t = 0.0;
    for (int k = 0; k < 5; k++) { t += a * noise(p); p = p * 2.07 + 1.3; a *= 0.5; }
    return t;
  }
  void main() {
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    p.y = -p.y;
    float c = cos(vAngle), s = sin(vAngle);
    vec2 u = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
    vec2 e = vec2(u.x, u.y / max(vRatio, 0.06));
    float r = length(e);
    float pr = length(p);
    int t = int(vType + 0.5);
    vec3 col = vec3(0.0);
    if (t == 0) {
      if (r > 1.0) discard;
      float th = atan(e.y, e.x);
      float arms = 0.5 + 0.5 * cos(2.0 * (th - log(r + 0.04) * 3.0 + vSeed * 6.283));
      float dust = fbm(e * 7.0 + vSeed * 13.0);
      float disc = exp(-r * 4.0) * (0.45 + 0.9 * arms * smoothstep(0.06, 0.3, r)) * (0.65 + 0.55 * dust);
      float bulge = exp(-r * r * 70.0);
      // a dust lane across galaxies seen nearly edge on
      float lane = vRatio < 0.3 ? 1.0 - 0.55 * exp(-pow((u.y + 0.02 * vRatio) / (0.035 * max(vRatio, 0.06) + 0.003), 2.0)) * smoothstep(0.05, 0.25, abs(u.x)) * smoothstep(0.95, 0.4, abs(u.x)) : 1.0;
      col = (vec3(0.62, 0.74, 1.0) * disc + vec3(1.0, 0.86, 0.64) * (bulge * 1.5 + exp(-r * 9.0) * 0.35)) * lane;
      col *= smoothstep(1.0, 0.7, r);
    } else if (t == 1) {
      if (r > 1.0) discard;
      col = vec3(1.0, 0.88, 0.72) * (exp(-r * r * 7.0) * 0.8 + exp(-r * r * 60.0) * 0.8) * smoothstep(1.0, 0.75, r);
    } else if (t == 2) {
      if (r > 1.0) discard;
      float n = fbm(e * 3.5 + vSeed * 9.0);
      float knots = smoothstep(0.62, 0.85, fbm(e * 9.0 + vSeed * 4.0));
      col = (vec3(0.66, 0.76, 1.0) * n * n * 1.4 + vec3(1.0, 0.55, 0.65) * knots * 0.5) * smoothstep(1.0, 0.3, r);
    } else if (t == 3) {
      if (pr > 1.0) discard;
      vec2 cell = p * 26.0;
      vec2 f = fract(cell) - 0.5;
      float star = smoothstep(0.32, 0.0, length(f)) * step(0.55, hash(floor(cell) + vSeed));
      col = vec3(1.0, 0.92, 0.80) * (exp(-pr * pr * 16.0) * 1.1 + star * exp(-pr * pr * 4.5) * 0.9);
    } else if (t == 5) {
      if (pr > 1.0) discard;
      float n = fbm(p * 2.6 + vSeed * 7.0);
      float m = fbm(p * 5.0 + 3.0 + vSeed);
      col = mix(vec3(0.95, 0.30, 0.40), vec3(0.45, 0.62, 1.0), smoothstep(0.35, 0.75, m)) * n * n * 1.9 * smoothstep(1.0, 0.25, pr);
      col += vec3(1.0, 0.95, 0.9) * exp(-pr * pr * 90.0) * 0.6;
    } else if (t == 6) {
      if (r > 1.0) discard;
      float ring = exp(-pow((r - 0.55) / 0.14, 2.0));
      col = mix(vec3(0.40, 0.92, 0.85), vec3(1.0, 0.45, 0.42), smoothstep(0.48, 0.72, r)) * ring * 1.1 + vec3(0.6, 0.9, 1.0) * exp(-r * r * 9.0) * 0.18;
    } else if (t == 7) {
      if (r > 1.0) discard;
      float n = fbm(e * 5.0 + vSeed * 11.0);
      col = vec3(1.0, 0.55, 0.32) * smoothstep(0.48, 0.78, n) * smoothstep(1.0, 0.35, r) * 1.6 + vec3(0.55, 0.65, 1.0) * exp(-r * r * 6.0) * 0.45;
    } else {
      discard;
    }
    gl_FragColor = vec4(col * vAlpha, 1.0);
  }
`;

// Long exposure: keep the brighter of this frame and the decayed history
export const trailFrag = /* glsl */ `
  uniform sampler2D uCurrent;
  uniform sampler2D uHistory;
  uniform float uDecay;
  varying vec2 vUv;
  void main() {
    vec3 cur = texture2D(uCurrent, vUv).rgb;
    vec3 hist = texture2D(uHistory, vUv).rgb * uDecay * vec3(0.990, 0.995, 1.0);
    gl_FragColor = vec4(max(cur, hist), 1.0);
  }
`;

export const quadVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const copyFrag = /* glsl */ `
  uniform sampler2D uTex;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uTex, vUv).rgb;
    // gentle filmic roll-off so bright stars do not clip harshly
    c = c / (1.0 + c * 0.35);
    gl_FragColor = vec4(c, 1.0);
  }
`;

// Moonlit dunes along the horizon
export const duneVert = /* glsl */ `
  attribute float aRidge;   // 1 on the crest, 0 at the base
  varying float vRidge;
  varying vec3 vDir;
  void main() {
    vRidge = aRidge;
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const duneFrag = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uCrest;
  uniform vec3 uRim;       // moonlit edge colour
  uniform vec3 uDayCol;    // ground colour in daylight
  uniform vec3 uGlow;      // fire or impact light on the land
  uniform vec3 uMoon;      // world direction of the Moon
  uniform float uMoonLight;
  uniform float uDay;
  uniform float uSee;      // 0 solid ground, 1 a tinted glass Earth you can look through
  varying float vRidge;
  varying vec3 vDir;
  void main() {
    float facing = max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(uMoon.x, 0.0, uMoon.z))), 0.0);
    float rim = pow(vRidge, 10.0) * (0.25 + 0.75 * facing) * uMoonLight;
    vec3 col = mix(uBase, uCrest, pow(vRidge, 3.0));
    col += uRim * rim;
    col = mix(col, uDayCol * (0.55 + 0.45 * vRidge), pow(uDay, 1.7));
    col += uGlow * (0.35 + 0.65 * vRidge);
    // see-through, as in planetarium apps: soft misty dunes near the horizon that thin out
    // to almost nothing under your feet, so the far side of the sky shows through clearly
    vec3 dv = normalize(vDir);
    float below = smoothstep(0.0, -0.02, dv.y);
    // ripples of sand seen in perspective on the ground plane
    vec2 gp = dv.xz / max(-dv.y, 0.02);
    float dune = sin(gp.x * 0.55 + sin(gp.y * 0.37) * 2.2) * 0.5 + sin(gp.y * 0.83 + sin(gp.x * 0.29) * 1.7) * 0.35 + sin((gp.x + gp.y) * 1.9) * 0.15;
    float near = smoothstep(-0.05, -0.6, dv.y);            // ripples only where the ground is close enough to see
    vec3 mist = mix(vec3(0.075, 0.085, 0.11), uDayCol * 0.85, pow(uDay, 1.4));
    vec3 glass = mix(col, mist * (0.9 + 0.12 * vRidge), 0.6) * (1.0 + 0.14 * dune * near * below);
    col = mix(col, glass, uSee);
    float see = mix(0.05, 0.62, smoothstep(-0.25, -0.004, dv.y)) * (1.0 + 0.35 * dune * near);
    gl_FragColor = vec4(col, mix(1.0, clamp(see, 0.0, 1.0), uSee));
  }
`;
// A comet as it looks in long-exposure photographs, drawn on a flat patch of sky in angular
// coordinates (degrees, gnomonic): x runs from the head down the dust tail, y across it.
// Green coma (glowing carbon gas), a tiny bright pseudo-nucleus, a broad curved white-gold dust
// tail with fine striations, and a straight, narrow blue ion tail streaming directly away from the Sun.
export const cometVert = /* glsl */ `
  attribute vec2 aAng;      // degrees: along the dust axis, across it
  attribute vec4 aShape;    // dust length, coma radius, ion angle (rad), ion length
  attribute float aBright;
  varying vec2 vAng;
  varying vec4 vShape;
  varying float vBright;
  varying float vUp;
  void main() {
    vAng = aAng;
    vShape = aShape;
    vBright = aBright;
    vUp = normalize(position).y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const cometFrag = /* glsl */ `
  varying vec2 vAng;
  varying vec4 vShape;
  varying float vBright;
  varying float vUp;
  uniform float uBelow;
  float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
  void main() {
    float a = vAng.x, c = vAng.y;
    float L = vShape.x, r0 = vShape.y, th = vShape.z, Li = vShape.w;
    float r2 = a * a + c * c;
    // coma and pseudo-nucleus
    float coma = exp(-r2 / (2.0 * r0 * r0));
    float halo = exp(-sqrt(r2) / (r0 * 3.0)) * 0.35;
    float rn = r0 * 0.10;
    float nucleus = exp(-r2 / (2.0 * rn * rn));
    // dust tail: leaves the head along the Sun line and curves back toward its tip, widening as it goes
    float t = clamp(a / L, 0.0, 1.0);
    float cen = a * tan(th) * (1.0 - t) * 0.65;
    float w = r0 * 0.9 + a * 0.13;
    float q = (c - cen) / w;
    float dust = exp(-q * q * 1.6) * smoothstep(-r0, r0 * 1.5, a) * pow(1.0 - t, 1.5);
    // the leading edge is sharp, the trailing side fans out softly
    dust *= 0.75 + 0.25 * smoothstep(-1.5, 1.0, q * sign(tan(th) + 1e-4) * -1.0);
    // synchrones: faint parallel striations across the dust fan
    dust *= 0.82 + 0.18 * n1(q * 6.0 + a * 0.35);
    // ion tail: straight and narrow, with knots and streamers
    vec2 id = vec2(cos(th), sin(th));
    float ia = dot(vec2(a, c), id);
    float ic = dot(vec2(a, c), vec2(-id.y, id.x));
    float iw = r0 * 0.35 + max(ia, 0.0) * 0.022;
    float ion = exp(-pow(ic / iw, 2.0)) * smoothstep(0.0, r0 * 2.0, ia) * exp(-max(ia, 0.0) / (Li * 0.7));
    ion *= 0.65 + 0.35 * n1(ic / iw * 3.0 + ia * 0.9) + 0.25 * n1(ia * 2.3);
    vec3 col = vec3(0.62, 1.0, 0.74) * coma * 0.75 + vec3(0.80, 1.0, 0.86) * halo * 0.5
             + vec3(1.0, 1.0, 0.98) * nucleus * 1.6
             + vec3(1.0, 0.94, 0.82) * dust * 0.8
             + vec3(0.42, 0.62, 1.0) * ion * 0.6;
    float fade = mix(smoothstep(-0.02, 0.04, vUp), 1.0, uBelow);
    gl_FragColor = vec4(col * vBright * fade, 1.0);
  }
`;
