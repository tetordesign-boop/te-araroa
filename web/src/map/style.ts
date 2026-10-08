import type { SkySpecification, StyleSpecification } from "maplibre-gl";
import { OFFLINE_MAP } from "../config";

export type BaseStyle = "satellite" | "relief";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ESRI_ATTR = '<a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics';
const TA_ATTR = 'Tracé <a href="https://www.teararoa.org.nz/trail-maps/" target="_blank" rel="noopener">Te Araroa Trust</a> CC BY 4.0';
const DEM_ATTR = '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a>';
const LINZ_ATTR = '<a href="https://www.linz.govt.nz/products-services/data/linz-basemaps/data-attribution" target="_blank" rel="noopener">© Toitū Te Whenua LINZ</a> CC BY 4.0';

const SKY_LIGHT = {
  "sky-color": "#8fc1ec",
  "horizon-color": "#e6eef6",
  "fog-color": "#e4ebf2",
  "fog-ground-blend": 0.35,
  "horizon-fog-blend": 0.6,
  "sky-horizon-blend": 0.7,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.8, 9, 0],
} as unknown as SkySpecification;

export function buildStyle(base: BaseStyle, opts: { dark: boolean; linzKey?: string | null; land?: GeoJSON.Feature }): StyleSpecification {
  if (OFFLINE_MAP) return offlineStyle(opts.land, opts.dark);

  const linz = opts.linzKey?.trim();
  const demSource = linz
    ? {
        type: "raster-dem" as const,
        tiles: [`https://basemaps.linz.govt.nz/v1/tiles/elevation/WebMercatorQuad/{z}/{x}/{y}.png?api=${linz}&pipeline=terrain-rgb`],
        tileSize: 256, maxzoom: 14, encoding: "mapbox" as const, attribution: LINZ_ATTR,
      }
    : {
        type: "raster-dem" as const,
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        tileSize: 256, maxzoom: 14, encoding: "terrarium" as const, attribution: DEM_ATTR,
      };

  const imagery = base === "satellite"
    ? linz
      ? { tiles: [`https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad/{z}/{x}/{y}.webp?api=${linz}`], maxzoom: 19, attribution: `${LINZ_ATTR} · ${TA_ATTR}` }
      : { tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], maxzoom: 18, attribution: `${ESRI_ATTR} · ${TA_ATTR}` }
    : {
        tiles: [`${ESRI}/Canvas/${opts.dark ? "World_Dark_Gray_Base" : "World_Light_Gray_Base"}/MapServer/tile/{z}/{y}/{x}`],
        maxzoom: 16, attribution: `${ESRI_ATTR} · ${TA_ATTR}`,
      };

  const layers: StyleSpecification["layers"] = [
    { id: "background", type: "background", paint: { "background-color": opts.dark ? "#1b2128" : "#dfe7ec" } },
    {
      id: "imagery", type: "raster", source: "imagery",
      paint: base === "satellite"
        ? { "raster-fade-duration": 250, "raster-saturation": 0.08, "raster-contrast": 0.04 }
        : { "raster-fade-duration": 250 },
    },
  ];
  if (base === "relief") {
    layers.push({
      id: "hillshade", type: "hillshade", source: "dem-hs",
      paint: {
        "hillshade-exaggeration": 0.55,
        "hillshade-shadow-color": opts.dark ? "#05080c" : "#4f6273",
        "hillshade-highlight-color": opts.dark ? "#3a4654" : "#ffffff",
        "hillshade-accent-color": opts.dark ? "#0b1016" : "#5d6b78",
        "hillshade-illumination-anchor": "viewport",
      },
    });
  }

  return {
    version: 8,
    projection: { type: "globe" },
    sources: {
      imagery: { type: "raster", tileSize: 256, ...imagery },
      dem: demSource,
      ...(base === "relief" ? { "dem-hs": { ...demSource, attribution: undefined } } : {}),
    },
    layers,
    terrain: { source: "dem", exaggeration: 1.25 },
    sky: opts.dark
      ? { ...SKY_LIGHT, "sky-color": "#0f1a28", "horizon-color": "#2b3a4c", "fog-color": "#202a36" }
      : SKY_LIGHT,
  } as unknown as StyleSpecification;
}

/** Vector-only style used in development when tile servers are unreachable. */
function offlineStyle(land: GeoJSON.Feature | undefined, dark: boolean): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    sources: {
      land: { type: "geojson", data: land ?? { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": dark ? "#0e2433" : "#9cc3dc" } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": dark ? "#24352c" : "#7f9c78" } },
      { id: "land-edge", type: "line", source: "land", paint: { "line-color": dark ? "#3c5546" : "#e9f1e4", "line-width": 1, "line-opacity": 0.7 } },
    ],
    sky: dark
      ? { ...SKY_LIGHT, "sky-color": "#0f1a28", "horizon-color": "#2b3a4c", "fog-color": "#202a36" }
      : SKY_LIGHT,
  } as unknown as StyleSpecification;
}
