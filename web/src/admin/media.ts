// Photo & video preparation on the phone, before anything is uploaded:
// photos are resized (2048 px) and thumbnailed (640 px); long videos are re-encoded to 720p.

export interface Prepared {
  kind: "photo" | "video";
  main: Blob;
  thumb: Blob;
  width: number;
  height: number;
  duration: number | null;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
}

const MAX_MAIN = 2048;
const MAX_THUMB = 640;
export const MAX_UPLOAD = 49 * 1024 * 1024;

function canvasFor(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

function toBlob(c: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", q));
}

function fit(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Draw a source in steps (halving) for crisp downscales. */
async function scaled(src: CanvasImageSource, w0: number, h0: number, max: number, q: number): Promise<Blob> {
  let cur: CanvasImageSource = src, cw = w0, ch = h0;
  const target = fit(w0, h0, max);
  while (cw / 2 > target.w * 1.15) {
    const step = canvasFor(Math.round(cw / 2), Math.round(ch / 2));
    step.ctx.drawImage(cur, 0, 0, step.c.width, step.c.height);
    cur = step.c; cw = step.c.width; ch = step.c.height;
  }
  const out = canvasFor(target.w, target.h);
  out.ctx.drawImage(cur, 0, 0, target.w, target.h);
  return toBlob(out.c, q);
}

async function readExif(file: File) {
  try {
    const exifr = (await import("exifr")).default;
    const [gps, tags] = await Promise.all([
      exifr.gps(file).catch(() => null),
      exifr.parse(file, ["DateTimeOriginal", "CreateDate"]).catch(() => null),
    ]);
    const d: Date | undefined = tags?.DateTimeOriginal ?? tags?.CreateDate;
    return {
      takenAt: d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : null,
      lat: gps && Number.isFinite(gps.latitude) ? gps.latitude : null,
      lng: gps && Number.isFinite(gps.longitude) ? gps.longitude : null,
    };
  } catch (_) {
    return { takenAt: null, lat: null, lng: null };
  }
}

export async function preparePhoto(file: File): Promise<Prepared> {
  const exif = await readExif(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth, h0 = img.naturalHeight; // EXIF orientation already applied by the browser
    const main = await scaled(img, w0, h0, MAX_MAIN, 0.82);
    const thumb = await scaled(img, w0, h0, MAX_THUMB, 0.76);
    const dims = fit(w0, h0, MAX_MAIN);
    return {
      kind: "photo", main, thumb, width: dims.w, height: dims.h, duration: null,
      takenAt: exif.takenAt ?? (file.lastModified ? new Date(file.lastModified).toISOString() : null),
      lat: exif.lat, lng: exif.lng,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.playsInline = true;
    v.onloadedmetadata = () => res(v);
    v.onerror = () => rej(new Error("Cette vidéo ne peut pas être lue sur ce téléphone."));
    v.src = url;
  });
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const done = () => { v.removeEventListener("seeked", done); res(); };
    v.addEventListener("seeked", done);
    v.currentTime = t;
    window.setTimeout(done, 3000);
  });
}

async function transcode(file: File, onProgress: (p: number) => void): Promise<Blob | null> {
  const mb = await import("mediabunny");
  if (!(await mb.canEncodeVideo("avc"))) return null;
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const conversion = await mb.Conversion.init({
    input, output,
    video: (track) => {
      const landscape = track.displayWidth >= track.displayHeight;
      const long = Math.max(track.displayWidth, track.displayHeight);
      const size = Math.min(1280, long);
      return { codec: "avc", bitrate: 2_500_000, forceTranscode: true, ...(landscape ? { width: size } : { height: size }) };
    },
    audio: { codec: "aac", bitrate: 96_000 },
  });
  if (!conversion.isValid) return null;
  conversion.onProgress = (p) => onProgress(p);
  await conversion.execute();
  const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
  return buf ? new Blob([buf], { type: "video/mp4" }) : null;
}

export async function prepareVideo(file: File, onProgress: (p: number) => void): Promise<Prepared> {
  const url = URL.createObjectURL(file);
  try {
    const v = await loadVideo(url);
    const duration = Number.isFinite(v.duration) ? v.duration : null;
    await seek(v, Math.min(0.8, (duration ?? 1) / 3));
    const w0 = v.videoWidth || 1280, h0 = v.videoHeight || 720;
    const thumb = await scaled(v, w0, h0, MAX_THUMB, 0.78);
    let main: Blob = file;
    const needs = file.size > 18 * 1024 * 1024 || Math.max(w0, h0) > 1920;
    if (needs) {
      try {
        const out = await transcode(file, onProgress);
        if (out && out.size < file.size) main = out;
      } catch (e) {
        console.warn("transcode failed", e);
      }
    }
    if (main.size > MAX_UPLOAD) {
      throw new Error("Vidéo trop lourde (plus de 49 Mo même compressée). Coupe-la ou ajoute plutôt un lien YouTube.");
    }
    const dims = main === file ? { w: w0, h: h0 } : fit(w0, h0, 1280);
    return {
      kind: "video", main, thumb, width: dims.w, height: dims.h, duration,
      takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : null, lat: null, lng: null,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
