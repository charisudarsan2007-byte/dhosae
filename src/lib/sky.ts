/**
 * sky — the real sky over India, computed, not faked.
 *
 * Sun and Moon position (altitude/azimuth) and the Moon's illuminated fraction
 * are derived with the standard astronomy formulae (the same maths SunCalc uses,
 * public-domain). No network, no API: given an instant and a place, the sky is a
 * fact. We anchor it to Chennai, so the page shows the sky that is actually over
 * India at this moment — the sun where it really stands, or a moon of the correct
 * phase (and, on a moonless night, the honest absence of one).
 *
 * This module is imported on the server (for the first paint) AND in the browser
 * (to keep it live) — so it must stay pure and free of DOM/Node specifics.
 */

export const CHENNAI = { lat: 13.0827, lon: 80.2707, name: "Chennai" };

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397; // obliquity of the ecliptic

const toJulian = (d: Date) => d.valueOf() / DAY_MS - 0.5 + J1970;
const toDays = (d: Date) => toJulian(d) - J2000;

const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
const azimuth = (H: number, phi: number, dec: number) =>
  Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitude = (H: number, phi: number, dec: number) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;

function astroRefraction(h: number): number {
  if (h < 0) h = 0;
  return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

// --- the sun ---------------------------------------------------------------
const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number): number {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372; // perihelion of the Earth
  return M + C + P + Math.PI;
}
function sunCoords(d: number) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

const normH = (H: number) => Math.atan2(Math.sin(H), Math.cos(H)); // → [-π, π]

export function sunPosition(date: Date, lat: number, lon: number) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = normH(siderealTime(d, lw) - c.ra);
  return { azimuth: azimuth(H, phi, c.dec), altitude: altitude(H, phi, c.dec), ha: H, dec: c.dec };
}

// --- the moon --------------------------------------------------------------
function moonCoords(d: number) {
  const L = RAD * (218.316 + 13.176396 * d); // ecliptic longitude
  const M = RAD * (134.963 + 13.064993 * d); // mean anomaly
  const F = RAD * (93.272 + 13.2293 * d); // mean distance
  const l = L + RAD * 6.289 * Math.sin(M); // longitude
  const b = RAD * 5.128 * Math.sin(F); // latitude
  const dt = 385001 - 20905 * Math.cos(M); // distance to the moon, km
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
}

export function moonPosition(date: Date, lat: number, lon: number) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const c = moonCoords(d);
  const H = normH(siderealTime(d, lw) - c.ra);
  let h = altitude(H, phi, c.dec);
  h += astroRefraction(h); // the moon you see is bent up a touch by the air
  return { azimuth: azimuth(H, phi, c.dec), altitude: h, ha: H, dec: c.dec };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Horizontal place in the sky as -1 (rising, east) … 0 (on the meridian) … +1
 * (setting, west), from the hour angle. Stable even when a tropical sun crosses
 * nearly overhead, where azimuth would otherwise lurch from one side to the other.
 */
function horizonNorm(ha: number, dec: number, latRad: number): number {
  const arg = -Math.tan(latRad) * Math.tan(dec);
  const H0 = Math.abs(arg) < 1 ? Math.acos(arg) : arg <= -1 ? Math.PI : 0.0001;
  return clamp(ha / H0, -1.15, 1.15);
}

/** Illuminated fraction (0..1) and phase (0 new → .5 full → 1 new). */
export function moonIllumination(date: Date) {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000; // sun distance, km
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra)
  );
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
  );
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
  };
}

export function phaseName(phase: number): string {
  if (phase < 0.02 || phase > 0.98) return "new";
  if (phase < 0.23) return "waxing crescent";
  if (phase < 0.27) return "first-quarter";
  if (phase < 0.48) return "waxing gibbous";
  if (phase < 0.52) return "full";
  if (phase < 0.73) return "waning gibbous";
  if (phase < 0.77) return "last-quarter";
  return "waning crescent";
}

// --- the view-model the whole page draws ------------------------------------
// No strip, no horizon, no painted sky: just where the one light in the sky is,
// how bright it is, and what mood the hour is in. The page itself becomes the sky.

export type Phase = "day" | "dawn" | "dusk" | "night";

export interface SkyView {
  /** the mood of the hour — drives the page's whole palette */
  phase: Phase;
  /** which light is up, if any */
  kind: "sun" | "moon" | "none";
  /** 0..100, horizontal place across the viewport (east → west) */
  xPct: number;
  /** 0..100, vertical place (small = high in the sky) */
  yPct: number;
  /** 0..1, how strongly the light burns (size + glow) */
  intensity: number;
  /** 0..1, how dark the sky is — when the stars come out */
  darkness: number;
  /** the sun's true altitude, degrees (negative when down) */
  sunAltDeg: number;
  moonFraction: number;
  moonPhase: number;
  moonWaxing: boolean;
  /** one honest line about the real sky right now */
  caption: string;
}

export function skyView(
  date: Date = new Date(),
  lat: number = CHENNAI.lat,
  lon: number = CHENNAI.lon
): SkyView {
  const phi = RAD * lat;
  const sp = sunPosition(date, lat, lon);
  const mp = moonPosition(date, lat, lon);
  const mi = moonIllumination(date);

  const sunAltDeg = sp.altitude / RAD;
  const moonAltDeg = mp.altitude / RAD;
  const sunX = horizonNorm(sp.ha, sp.dec, phi);
  const moonX = horizonNorm(mp.ha, mp.dec, phi);
  const rising = sunX < 0; // east of the meridian → on its way up

  // The mood of the hour. -6° is where civil twilight ends and the stars begin;
  // above +6° the day is fully open.
  const phase: Phase =
    sunAltDeg > 6 ? "day" : sunAltDeg > -6 ? (rising ? "dawn" : "dusk") : "night";

  // Stars fade in through the end of dusk and burn fully once the sun is well down.
  const darkness = clamp((-sunAltDeg - 1) / 15, 0, 1);

  // By day (and through twilight) the sun leads; once it's properly down, the moon
  // takes over — if it's up at all.
  const sunIsActor = sunAltDeg > -6;
  const kind: SkyView["kind"] = sunIsActor ? "sun" : moonAltDeg > 0 ? "moon" : "none";

  const actorX = kind === "moon" ? moonX : sunX;
  const actorAlt = kind === "moon" ? moonAltDeg : sunAltDeg;

  // Across the viewport, with a margin so the orb never hugs the very edge.
  const xPct = 50 + clamp(actorX, -1, 1) * 44;
  // High sun rides near the top; a setting/rising light sits low. We let it dip a
  // touch below the fold during twilight so it reads as "just over the horizon".
  const yPct = clamp(80 - (clamp(actorAlt, -5, 70) / 70) * 70, 7, 88);

  const intensity =
    kind === "moon"
      ? clamp(0.25 + mi.fraction * 0.6, 0, 1)
      : clamp((sunAltDeg + 6) / 60, 0.12, 1);

  const caption = captionFor(phase, kind, sunAltDeg, sunX, mi);

  return {
    phase,
    kind,
    xPct: +xPct.toFixed(2),
    yPct: +yPct.toFixed(2),
    intensity: +intensity.toFixed(3),
    darkness: +darkness.toFixed(3),
    sunAltDeg: +sunAltDeg.toFixed(1),
    moonFraction: mi.fraction,
    moonPhase: mi.phase,
    moonWaxing: mi.phase < 0.5,
    caption,
  };
}

function captionFor(
  phase: Phase,
  kind: SkyView["kind"],
  sunAltDeg: number,
  sunX: number,
  mi: { fraction: number; phase: number }
): string {
  if (kind === "moon") {
    const pct = Math.round(mi.fraction * 100);
    return pct < 2
      ? "a new moon over india · the night sky is dark"
      : `a ${phaseName(mi.phase)} moon over india · ${pct}% lit`;
  }
  if (kind === "none") return "no moon over india right now · only the stars are up";
  if (phase === "dawn") return "first light over india · the sun is climbing in the east";
  if (phase === "dusk") return "dusk over india · the sun is going down in the west";
  const alt = Math.round(sunAltDeg);
  const dir = sunX < 0 ? "still climbing in the east" : "leaning to the west";
  return `the sun over india · ${alt}° above the horizon, ${dir}`;
}

/**
 * The illuminated sliver of the moon, as an SVG path inside a unit disc of the
 * given radius centred at (cx, cy). Used to draw the moon in its true phase.
 */
export function moonLitPath(cx: number, cy: number, r: number, k: number, waxing: boolean): string {
  const rx = r * Math.abs(1 - 2 * k); // terminator width: r at new/full, 0 at quarter
  const outer = waxing ? 1 : 0; // which limb is lit
  const inner = k < 0.5 ? (waxing ? 0 : 1) : waxing ? 1 : 0;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${outer} ${cx} ${cy + r} A ${rx.toFixed(
    2
  )} ${r} 0 0 ${inner} ${cx} ${cy - r} Z`;
}
