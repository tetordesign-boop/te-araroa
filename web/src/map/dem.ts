// One elevation source shared by the 3D terrain, the shaded relief, the colour relief and the contour lines,
// so each DEM tile is downloaded once. Contours are computed in a web worker (maplibre-contour).
import maplibregl from "maplibre-gl";
import mlcontour from "maplibre-contour";

export interface Dem {
  /** tiles URL to use in raster-dem sources (served from the shared cache) */
  tiles: string;
  encoding: "terrarium" | "mapbox";
  maxzoom: number;
  contours: string;
  attribution: string;
}

const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const DEM_ATTR = '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a>';
const LINZ_ATTR = '<a href="https://www.linz.govt.nz/products-services/data/linz-basemaps/data-attribution" target="_blank" rel="noopener">© Toitū Te Whenua LINZ</a> CC BY 4.0';

const made = new Map<string, Dem>();

export function demFor(linzKey?: string | null): Dem {
  const key = linzKey?.trim() || "";
  const hit = made.get(key);
  if (hit) return hit;
  const encoding = key ? "mapbox" as const : "terrarium" as const;
  const url = key
    ? `https://basemaps.linz.govt.nz/v1/tiles/elevation/WebMercatorQuad/{z}/{x}/{y}.png?api=${key}&pipeline=terrain-rgb`
    : TERRARIUM;
  const maxzoom = key ? 14 : 13;
  const source = new mlcontour.DemSource({
    url, encoding, maxzoom, worker: true, cacheSize: 160, timeoutMs: 12_000,
    id: key ? "dem-linz" : "dem",
  });
  source.setupMaplibre(maplibregl);
  const dem: Dem = {
    tiles: source.sharedDemProtocolUrl,
    encoding, maxzoom,
    contours: source.contourProtocolUrl({
      // [minor, major] interval in metres, by zoom
      thresholds: { 10: [200, 1000], 11: [100, 500], 12: [100, 500], 13: [50, 250], 14: [20, 100], 15: [10, 50] },
      elevationKey: "ele", levelKey: "level", contourLayer: "contours",
      overzoom: 1, subsampleBelow: 100, buffer: 1,
    }),
    attribution: key ? LINZ_ATTR : DEM_ATTR,
  };
  made.set(key, dem);
  return dem;
}
