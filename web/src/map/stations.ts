// The trail's own stations, by name: which are always labelled, and how they are shortened. Kept apart from the map
// (map.ts) so the plain drawing of the trail (ui/TrailSketch.tsx) doesn't need the map library to be loaded.

/** Label tiers for the trail's own stations: 1 = always, 2 = regional zoom, 3 = close-up only. */
export const TIER1 = new Set(["Ship Cove · Meretoto", "St Arnaud", "Arthur's Pass (Klondyke Corner)", "Lake Tekapo", "Queenstown", "Bluff · Stirling Point"]);
export const TIER2 = new Set(["Havelock", "Boyle Village", "Lake Coleridge · Rakaia", "Twizel", "Wānaka", "Invercargill"]);
export const stationName = (n: string) => n.replace(" (Klondyke Corner)", "").replace(" · Stirling Point", "").replace(" · Meretoto", "").replace("Lake Coleridge · Rakaia", "Rakaia").replace(" · Aparima", "");
