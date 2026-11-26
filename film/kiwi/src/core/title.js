// End title: "TA." with the orange dot, and the line under it (FR or EN). Drawn on a canvas each frame (on twos),
// uploaded as a texture and laid over the frame by the composite pass.
import * as THREE from "three";
import { ease, clamp, twos } from "./time.js";

let font;
export async function loadFont() {
  if (font) return;
  font = new FontFace("ArchivoFilm", "url(/assets/archivo.woff2)", { stretch: "62% 125%", weight: "100 900" });
  await font.load(); document.fonts.add(font);
}

export class Title {
  constructor() { this.canvas = document.createElement("canvas"); this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.NoColorSpace; }
  /** spec: {t0, lang, line: {fr, en}}; returns the texture (or null if nothing to draw yet). */
  draw(t, w, h, spec, lang) {
    const c = this.canvas; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; this.tex.dispose(); this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.NoColorSpace; }
    const g = c.getContext("2d"); g.clearRect(0, 0, w, h);
    const u = twos(t) - spec.t0; if (u < 0) return null;
    const portrait = h > w, S = portrait ? w / 1080 : h / 1080;
    const cx = w / 2, cy = h * (portrait ? 0.46 : 0.45);
    // "TA" letters slam in one after the other (scale from 1.6 with overshoot), then the dot pops on the beat
    const size = 300 * S;
    g.font = `860 ${size}px ArchivoFilm`; g.fontStretch = "expanded"; g.textBaseline = "alphabetic";
    const wT = g.measureText("T").width, wA = g.measureText("A").width, gap = -size * 0.02, dotR = size * 0.085;
    const total = wT + gap + wA + dotR * 2.6;
    let x = cx - total / 2; const base = cy + size * 0.34;
    const letter = (ch, lx, lw, delay) => {
      const k = clamp((u - delay) / 0.25); if (k <= 0) return;
      const s = 1 + (1 - ease.backOut(k, 2.2)) * 0.6, a = clamp(k * 3);
      g.save(); g.globalAlpha = a; g.translate(lx + lw / 2, base - size * 0.35); g.scale(s, s); g.translate(-(lx + lw / 2), -(base - size * 0.35));
      g.fillStyle = "#F3F6FB"; g.fillText(ch, lx, base); g.restore();
    };
    letter("T", x, wT, 0.0); x += wT + gap; letter("A", x, wA, 0.17); x += wA;
    const kd = clamp((u - 0.667) / 0.35);
    if (kd > 0) {
      const r = dotR * ease.backOut(kd, 3.0), dx = x + dotR * 1.45, dy = base - dotR;
      const glow = g.createRadialGradient(dx, dy, 0, dx, dy, r * 4.2); glow.addColorStop(0, "rgba(255,107,18,0.45)"); glow.addColorStop(1, "rgba(255,107,18,0)");
      g.fillStyle = glow; g.fillRect(dx - r * 5, dy - r * 5, r * 10, r * 10);
      g.fillStyle = "#FF6B12"; g.beginPath(); g.arc(dx, dy, r, 0, Math.PI * 2); g.fill();
    }
    // the line: wipes in from the left, after the dot
    const line = spec.line[lang] ?? spec.line.fr; const kl = clamp((u - 1.0) / 0.6);
    if (kl > 0) {
      const ls = (portrait ? 64 : 58) * S; g.font = `600 ${ls}px ArchivoFilm`; g.fontStretch = "normal";
      const lw = g.measureText(line).width, lx = cx - lw / 2, ly = base + ls * 1.9;
      g.save(); g.beginPath(); g.rect(lx - 10, ly - ls * 1.2, (lw + 20) * ease.out(kl), ls * 1.8); g.clip();
      g.fillStyle = "#E6ECF5"; g.fillText(line, lx, ly); g.restore();
    }
    this.tex.needsUpdate = true; return this.tex;
  }
}
