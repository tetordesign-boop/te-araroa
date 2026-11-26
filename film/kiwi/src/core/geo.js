// Real geography for the island shot: lng/lat -> local km (x east, z south), centred on the South Island.
export const LNG0 = 170.5, LAT0 = -43.6;
const KX = 111.32 * Math.cos((LAT0 * Math.PI) / 180), KZ = 110.57;
export const proj = (lng, lat) => [(lng - LNG0) * KX, -(lat - LAT0) * KZ];
export async function loadGeo() {
  const [nz, trail] = await Promise.all([fetch("/data/nz.json").then((r) => r.json()), fetch("/data/trail.json").then((r) => r.json())]);
  // South Island = the ring whose centroid is south of -40.6
  const rings = nz.rings.map((r) => r.map(([a, b]) => proj(a, b)));
  const south = rings.filter((r) => r.reduce((s, p) => s + p[1], 0) / r.length > -150);
  const parts = trail.parts.map((p) => p.map(([lng, lat, km]) => [...proj(lng, lat), km]));
  return { rings, south, trail: parts, totalKm: trail.total_km };
}
export const SHIP_COVE = proj(174.2353, -41.0947);
export const BLUFF = proj(168.3573, -46.6135);
