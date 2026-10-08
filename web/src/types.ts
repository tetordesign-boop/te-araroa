export type Lang = "fr" | "en";

export interface Settings {
  site_title: string;
  site_tagline_fr: string;
  site_tagline_en: string;
  hiker_name: string | null;
  intro_fr: string | null;
  intro_en: string | null;
  start_date: string | null; // YYYY-MM-DD (NZ)
  target_end_date: string | null;
  direction: "sobo" | "nobo";
  position_delay_minutes: number;
  linz_api_key: string | null;
  trail_version: string | null;
  trail_total_km: number | null;
}

export type DayKind = "hike" | "rest" | "transport";

export interface ElevationProfile {
  /** [km from Ship Cove, metres] */
  p: [number, number][];
}

export interface Day {
  id: string;
  date: string; // YYYY-MM-DD
  day_number: number;
  kind: DayKind;
  title: string | null;
  title_en: string | null;
  story: string | null;
  story_en: string | null;
  start_km: number | null;
  end_km: number | null;
  start_lng: number | null;
  start_lat: number | null;
  end_lng: number | null;
  end_lat: number | null;
  start_name: string | null;
  end_name: string | null;
  distance_km: number | null;
  ascent_m: number | null;
  descent_m: number | null;
  moving_time_min: number | null;
  weather: string | null;
  mood: string | null;
  cover_media_id: string | null;
  track: ElevationProfile | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export type MediaKind = "photo" | "video" | "embed";

export interface Media {
  id: string;
  day_id: string;
  kind: MediaKind;
  path: string | null;
  thumb_path: string | null;
  embed_url: string | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  taken_at: string | null;
  lng: number | null;
  lat: number | null;
  caption: string | null;
  caption_en: string | null;
  sort: number;
}

export interface Position {
  id: number;
  recorded_at: string;
  lng: number;
  lat: number;
  alt: number | null;
  acc: number | null;
  source: "owntracks" | "checkin" | "photo" | "manual";
  note: string | null;
}

export interface Message {
  id: string;
  day_id: string | null;
  author: string;
  body: string;
  created_at: string;
}

export type ReactionKey = "heart" | "clap" | "fire" | "wow";
export interface ReactionState { total: number; mine: boolean }
export type DayReactions = Partial<Record<ReactionKey, ReactionState>>;

/** Trail route as published in storage (site/trail.json). */
export interface Trail {
  v: string;
  source: string;
  total_km: number;
  /** each part: [lng, lat, km][] — parts are separated by transport gaps */
  parts: [number, number, number][][];
  legs?: { n: string; k0: number; k1: number }[];
  gaps: { km: number; m: number }[];
  places: { n: string; km: number; c: [number, number] }[];
}
