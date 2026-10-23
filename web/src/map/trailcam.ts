// The camera of the whole-trail flyover. It glides towards the km being scrubbed on the elevation profile,
// or moves on by itself when playing. Position and heading are smoothed, so river crossings (where the route
// jumps) and hairpins become a calm drone flight instead of a jump cut. A bright point marks where it is,
// and the way from Ship Cove to that point is drawn in turquoise, so one sees at a glance how far along it is.
import maplibregl from "maplibre-gl";
import type { LngLat, Route } from "../lib/geo";
import type { TrailMap } from "./map";

type Padding = { top: number; right: number; bottom: number; left: number };

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** km per second while playing: the whole trail in about nine minutes */
const SPEED = 2.4;
/** how often the turquoise way is redrawn (the point itself moves every frame) */
const FLIGHT_EVERY_MS = 160;

export class TrailCam {
  /** km the camera is over (smoothed) and km it is heading for */
  km: number;
  target: number;
  playing = false;
  /** the person took the map in hand at some point (no automatic start after that) */
  grabbed = false;
  speed = SPEED;
  private center: LngLat;
  private bearing: number;
  // a little higher than a drone: enough valley around the point to know where it is
  private zoom = 10.6;
  private pitch = 60;
  private padding: Padding;
  private following = false;
  private raf = 0;
  private last = 0;
  private dead = false;
  private off: (() => void)[] = [];
  private pin: maplibregl.Marker;
  private flightAt = -1;
  private flightTime = 0;

  constructor(private tm: TrailMap, private route: Route, startKm: number, padding: Padding, private onChange: () => void) {
    this.km = this.target = clampKm(startKm, route);
    this.center = route.pointAt(this.km);
    this.bearing = route.bearingAt(this.km, 3);
    this.padding = padding;
    const m = tm.map;
    tm.stopShow();
    tm.claimCamera();
    tm.replaying = true;
    document.documentElement.classList.add("is-replaying");

    // the point: always drawn whole, even behind a ridge (the map would fade a marker the relief hides)
    const el = document.createElement("div");
    el.className = "fly-pin";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<span class="fly-pin__ring"></span><span class="fly-pin__dot"></span>';
    this.pin = new maplibregl.Marker({ element: el, anchor: "center", opacity: "1", opacityWhenCovered: "1" }).setLngLat(this.center).addTo(m);
    this.drawFlight(true);

    // Someone takes the map in hand: stop steering until they scrub or press play again, and keep their zoom
    // and tilt. Watched on the raw events: while the camera moves every frame, MapLibre never sees a drag start.
    const grab = (e: Event) => {
      if (e.type === "pointerdown" && (e as PointerEvent).button > 0) return;
      this.grabbed = true;
      this.following = false;
      if (this.playing) { this.playing = false; this.onChange(); }
    };
    const cc = m.getCanvasContainer();
    cc.addEventListener("pointerdown", grab, { capture: true, passive: true });
    cc.addEventListener("wheel", grab, { capture: true, passive: true });
    this.off.push(() => {
      cc.removeEventListener("pointerdown", grab, { capture: true });
      cc.removeEventListener("wheel", grab, { capture: true });
    });
    // the approach; the loop starts when it lands (or at once with reduced motion)
    // (stopping whatever the camera was doing ends it with a "moveend": only listen after that, or the flyover
    // would keep the height of the flight it interrupted)
    m.stop();
    const settle = () => { if (!this.following) { this.zoom = m.getZoom(); this.pitch = m.getPitch(); } };
    m.on("moveend", settle);
    this.off.push(() => m.off("moveend", settle));
    m.once("moveend", () => {
      if (this.dead) return;
      this.center = m.getCenter().toArray() as LngLat;
      this.bearing = m.getBearing();
      if (!this.grabbed) this.following = true;
      this.last = 0;
      this.raf = requestAnimationFrame(this.frame);
    });
    m.flyTo({ center: this.center, zoom: this.zoom, pitch: this.pitch, bearing: this.bearing, padding: this.padding, duration: reduceMotion() ? 0 : 2400, curve: 1.3, essential: true });
  }

  setPadding(p: Padding) { this.padding = p; }

  scrubTo(km: number) {
    this.target = clampKm(km, this.route);
    this.resume();
    this.onChange();
  }

  play() {
    if (this.target >= this.route.total - 0.5) this.target = this.km = 0;
    this.playing = true;
    this.resume();
    this.onChange();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.onChange();
  }

  private resume() {
    if (this.following || this.dead) return;
    const m = this.tm.map;
    this.zoom = m.getZoom();
    this.pitch = Math.max(30, m.getPitch());
    this.center = m.getCenter().toArray() as LngLat;
    this.bearing = m.getBearing();
    this.following = true;
  }

  /** The turquoise way from Ship Cove to the point (not every frame: it is a whole line). */
  private drawFlight(force = false) {
    const now = performance.now();
    if (!force && (Math.abs(this.km - this.flightAt) < 0.05 || now - this.flightTime < FLIGHT_EVERY_MS)) return;
    this.flightAt = this.km;
    this.flightTime = now;
    this.tm.setFlight(this.km > 0.05 ? this.route.sample(0, this.km, 0.4) : []);
  }

  private frame = (now: number) => {
    if (this.dead) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    if (this.following) {
      if (this.playing) {
        this.target = Math.min(this.route.total, this.target + this.speed * dt);
        if (this.target >= this.route.total) { this.playing = false; this.onChange(); }
      }
      // reduced motion: no gliding, the camera is simply where the finger says
      const instant = reduceMotion();
      const a = instant ? 1 : 1 - Math.exp(-dt / (this.playing ? 0.12 : 0.32));
      this.km += (this.target - this.km) * a;
      if (Math.abs(this.target - this.km) < 0.002) this.km = this.target;
      const want = this.route.pointAt(this.km);
      const b = instant ? 1 : 1 - Math.exp(-dt / 0.22);
      const dx = want[0] - this.center[0], dy = want[1] - this.center[1];
      this.center = [this.center[0] + dx * b, this.center[1] + dy * b];
      // looking a little further ahead at this pace keeps the turns calm
      const heading = this.route.bearingAt(Math.min(this.route.total, this.km + 2.6), 4);
      const delta = ((heading - this.bearing + 540) % 360) - 180;
      this.bearing = (this.bearing + delta * (instant ? 1 : 1 - Math.exp(-dt / 1.4)) + 360) % 360;
      // once everything has arrived, leave the map alone (it stays free for the person's fingers)
      const still = !this.playing && this.km === this.target && Math.abs(dx) < 1e-7 && Math.abs(dy) < 1e-7 && Math.abs(delta) < 0.05;
      if (!still) {
        this.tm.map.jumpTo({ center: this.center, bearing: this.bearing, zoom: this.zoom, pitch: this.pitch, padding: this.padding });
        this.pin.setLngLat(want);
        this.drawFlight(this.km === this.target && !this.playing);
        this.onChange();
      }
    } else {
      // the map in hand: the point and its way still follow the profile
      const want = this.route.pointAt(this.target);
      this.km = this.target;
      this.pin.setLngLat(want);
      this.drawFlight();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  destroy() {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.raf);
    for (const f of this.off) f();
    this.pin.remove();
    this.tm.setFlight([]);
    this.tm.replaying = false;
    document.documentElement.classList.remove("is-replaying");
  }
}

function clampKm(km: number, route: Route) {
  return Math.max(0, Math.min(route.total, km));
}
