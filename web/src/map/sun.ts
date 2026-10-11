// Where the sun is, for lighting the relief like it is lit right now in New Zealand.
// Formulas from the NOAA / SunCalc approach (accurate to a fraction of a degree, plenty for shading).

const rad = Math.PI / 180;
const dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;

const toDays = (date: Date) => date.valueOf() / dayMs - 0.5 + J1970 - J2000;
const rightAscension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const solarMeanAnomaly = (d: number) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}
const siderealTime = (d: number, lw: number) => rad * (280.16 + 360.9856235 * d) - lw;

/** Sun azimuth (degrees clockwise from north) and altitude (degrees above the horizon). */
export function sunPosition(date: Date, lat: number, lng: number): { azimuth: number; altitude: number } {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const M = solarMeanAnomaly(d), L = eclipticLongitude(M);
  const dec = declination(L, 0), ra = rightAscension(L, 0);
  const H = siderealTime(d, lw) - ra;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  // azimuth from south, westward → convert to from north, clockwise
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { azimuth: (az / rad + 180 + 360) % 360, altitude: altitude / rad };
}

/** Sky colours for the 3D horizon, by sun altitude: night, blue hour, golden hour, day. */
export function skyFor(altitude: number, dark: boolean) {
  if (dark || altitude < -6) return { sky: "#0b1322", horizon: "#22324a", fog: "#1a2433" };
  if (altitude < 0) return { sky: "#5d6f9c", horizon: "#e9a98a", fog: "#d9c3c0" };
  if (altitude < 8) return { sky: "#8fb0de", horizon: "#f6d3a8", fog: "#efe3d6" };
  return { sky: "#86b8ea", horizon: "#e7eef6", fog: "#edf1f5" };
}
