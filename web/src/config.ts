// Public configuration (safe to ship: the publishable key only grants what RLS allows).
export const SUPABASE_URL = "https://jmedorwtksxxnzwyjvbz.supabase.co";
export const SUPABASE_KEY = "sb_publishable_-XKxRnwVevyUpGjZ9HF0NQ_4B_ykHCx";

export const STORAGE_PUBLIC = `${SUPABASE_URL}/storage/v1/object/public`;
export const TRAIL_URL = `${STORAGE_PUBLIC}/site/trail.json`;
export const mediaUrl = (path?: string | null) =>
  !path ? "" : /^(data:|blob:|https?:|\/)/.test(path) ? path : `${STORAGE_PUBLIC}/media/${path}`;

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/** NZ time zone used for every "trail day". */
export const NZ_TZ = "Pacific/Auckland";

/** After this long without news, the position is shown as "last known" instead of live. */
export const LIVE_THRESHOLD_MIN = 180;

/** Dev helpers: `?mock` uses local sample data, `?offline-map` a vector land map (no tile servers). */
const qs = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
export const MOCK = import.meta.env.DEV && qs.has("mock");
export const OFFLINE_MAP = import.meta.env.DEV && (qs.has("offline-map") || qs.has("mock"));
