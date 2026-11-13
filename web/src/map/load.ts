// The map and its library (MapLibre, the biggest piece of the site's code) come in their own file, asked for as
// soon as the page starts (main.tsx) but not waited for: the presentation and the panel show first, and the
// island appears under them a moment later, instead of a dark screen until everything has arrived.
let mod: Promise<typeof import("./map")> | null = null;
export const loadMap = () => (mod ??= import("./map"));
