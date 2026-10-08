// Photo & video preparation on the phone, before anything is uploaded.
// Photos: resized to 1600 px (plus a 640 px thumbnail), which keeps the free 1 GB of storage and the monthly
// bandwidth comfortable for a whole season. Videos: re-encoded to 720p H.264 (plays everywhere, light to send),
// sound copied as is.

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

const MAX_MAIN = 1600;
const MAX_THUMB = 640;
const VIDEO_LONG_SIDE = 1280;
const VIDEO_BITRATE = 1_600_000;
export const MAX_UPLOAD = 49 * 1024 * 1024;

function canvasFor(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

/** iOS caps the total memory of all canvases: give it back as soon as a canvas is done. */
function release(c: HTMLCanvasElement | null) {
  if (c) { c.width = 0; c.height = 0; }
}

function toBlob(c: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Encodage impossible"))), "image/jpeg", q));
}

function fit(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Downscale in halving steps (crisper than one big jump). Intermediate canvases are released right away. */
function downscale(src: CanvasImageSource, w0: number, h0: number, max: number): HTMLCanvasElement {
  const target = fit(w0, h0, max);
  let cur: CanvasImageSource = src, cw = w0, ch = h0;
  let prev: HTMLCanvasElement | null = null;
  while (cw / 2 > target.w * 1.15) {
    const step = canvasFor(Math.round(cw / 2), Math.round(ch / 2));
    step.ctx.drawImage(cur, 0, 0, step.c.width, step.c.height);
    release(prev);
    prev = step.c; cur = step.c; cw = step.c.width; ch = step.c.height;
  }
  const out = canvasFor(target.w, target.h);
  out.ctx.drawImage(cur, 0, 0, target.w, target.h);
  release(prev);
  return out.c;
}

async function encode(c: HTMLCanvasElement, q: number): Promise<Blob> {
  try { return await toBlob(c, q); } finally { release(c); }
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
  const img = new Image();
  try {
    img.decoding = "async";
    img.src = url;
    try { await img.decode(); } catch (_) { throw new Error("Photo illisible sur ce téléphone."); }
    const w0 = img.naturalWidth, h0 = img.naturalHeight; // EXIF orientation already applied by the browser
    const mainCanvas = downscale(img, w0, h0, MAX_MAIN);
    const { width, height } = mainCanvas;
    // the thumbnail comes from the already reduced picture: much less memory than starting over
    const thumbCanvas = downscale(mainCanvas, width, height, MAX_THUMB);
    const thumb = await encode(thumbCanvas, 0.76);
    const main = await encode(mainCanvas, 0.8);
    return {
      kind: "photo", main, thumb, width, height, duration: null,
      takenAt: exif.takenAt ?? (file.lastModified ? new Date(file.lastModified).toISOString() : null),
      lat: exif.lat, lng: exif.lng,
    };
  } finally {
    img.src = "";
    URL.revokeObjectURL(url);
  }
}

// ------------------------------------------------------------------ video
function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    const fail = () => rej(new Error("Cette vidéo ne peut pas être lue sur ce téléphone."));
    const timer = window.setTimeout(fail, 20_000);
    v.preload = "metadata"; v.muted = true; v.playsInline = true;
    v.onloadedmetadata = () => { clearTimeout(timer); res(v); };
    v.onerror = () => { clearTimeout(timer); fail(); };
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

interface VideoInfo { codec: string | null; mp4: boolean; hasAudio: boolean }

/**
 * Re-encode (or just re-wrap) a video as MP4 / H.264 with the original sound.
 * Returns null when the phone can't do it, or when the result would lose the sound.
 */
async function convert(file: File, reencode: boolean, onProgress: (p: number) => void): Promise<{ blob: Blob; w: number; h: number } | null> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const audios = await input.getAudioTracks();
    const sound = audios.find((a) => a.codec === "aac") ?? audios[0] ?? null;
    const landscape = track.displayWidth >= track.displayHeight;
    const size = Math.min(VIDEO_LONG_SIDE, Math.max(track.displayWidth, track.displayHeight));
    if (reencode && !(await mb.canEncodeVideo("avc", { width: landscape ? size : undefined, height: landscape ? undefined : size, bitrate: VIDEO_BITRATE }))) return null;

    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input, output, showWarnings: false,
      video: (t) => (t.id !== track.id ? { discard: true }
        : reencode ? { codec: "avc", bitrate: VIDEO_BITRATE, forceTranscode: true, ...(landscape ? { width: size } : { height: size }) }
          : { codec: "avc" }),
      // no bitrate here on purpose: iPhone sound (AAC) is copied as is, no audio encoder needed
      audio: (t) => (sound && t.id === sound.id ? { codec: "aac" } : { discard: true }),
    });
    if (!conversion.isValid) return null;
    if (sound && !conversion.utilizedTracks.some((t) => t.id === sound.id)) return null; // would come out silent
    conversion.onProgress = (p) => onProgress(p);
    await conversion.execute();
    const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buf) return null;
    const out = reencode ? fit(track.displayWidth, track.displayHeight, size) : { w: track.displayWidth, h: track.displayHeight };
    return { blob: new Blob([buf], { type: "video/mp4" }), w: out.w, h: out.h };
  } finally {
    input.dispose();
  }
}

async function inspect(file: File): Promise<VideoInfo | null> {
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    try {
      const [format, track, audios] = await Promise.all([input.getFormat(), input.getPrimaryVideoTrack(), input.getAudioTracks()]);
      return { codec: track?.codec ?? null, mp4: format === mb.MP4, hasAudio: audios.length > 0 };
    } finally {
      input.dispose();
    }
  } catch (_) {
    return null;
  }
}

export async function prepareVideo(file: File, onProgress: (p: number) => void): Promise<Prepared> {
  const url = URL.createObjectURL(file);
  let v: HTMLVideoElement | null = null;
  try {
    v = await loadVideo(url);
    const duration = Number.isFinite(v.duration) ? v.duration : null;
    await seek(v, Math.min(0.8, (duration ?? 1) / 3));
    const w0 = v.videoWidth || 1280, h0 = v.videoHeight || 720;
    const thumb = await encode(downscale(v, w0, h0, MAX_THUMB), 0.78);
    v.removeAttribute("src"); v.load(); // free the decoder before re-encoding

    const info = await inspect(file);
    const bitrate = duration ? (file.size * 8) / duration : Infinity;
    // iPhones film in HEVC by default: lighter, but many Android phones and PCs can't play it
    const reencode = !info || info.codec !== "avc" || Math.max(w0, h0) > VIDEO_LONG_SIDE * 1.2 || bitrate > VIDEO_BITRATE * 1.8;
    let main: Blob = file, dims = { w: w0, h: h0 };
    if (reencode || !info?.mp4) {
      try {
        const out = await convert(file, reencode, onProgress);
        if (out && (!reencode || out.blob.size < file.size)) { main = out.blob; dims = { w: out.w, h: out.h }; }
      } catch (e) {
        console.warn("video conversion failed", e);
      }
    }
    if (main.size > MAX_UPLOAD) {
      throw new Error("Vidéo trop lourde (plus de 49 Mo même compressée). Coupe-la ou ajoute plutôt un lien YouTube.");
    }
    return {
      kind: "video", main, thumb, width: dims.w, height: dims.h, duration,
      takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : null, lat: null, lng: null,
    };
  } finally {
    if (v) { v.removeAttribute("src"); v.load(); }
    URL.revokeObjectURL(url);
  }
}
