"""Sound department library: VSCO-2-CE sample access (cached, onset-trimmed, pitch-measured), note rendering by
resampling, DSP helpers (filters, panning, reverb, loudness, limiter). numpy + scipy only."""
import os, re, json, glob, math
import numpy as np
import scipy.io.wavfile as wavfile
from scipy import signal

SR = 48000
BPM = 90
BEAT = 60.0 / BPM
BAR = 4 * BEAT
DUR = 51.0
N = int(round(DUR * SR))          # 2 448 000 samples
ROOT = "/home/claude/ext-vsco/repo"
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
os.makedirs(CACHE, exist_ok=True)


def at(bar, beat=0.0):
    """Same as src/core/time.js: bar is 1-based, beat 0-based (fractional ok)."""
    return (bar - 1) * BAR + beat * BEAT


def S(t):
    """Seconds -> sample index (rounded: sample-accurate placement)."""
    return int(round(t * SR))


NOTE_IDX = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11,
            "Db": 1, "Eb": 3, "Gb": 6, "Ab": 8, "Bb": 10}


def m(name):
    """'D4' -> 62 (scientific pitch, A4 = 69). Accepts sharps or flats: 'Eb3', 'F#5'."""
    mt = re.fullmatch(r"([A-G](?:#|b)?)(-?\d)", name)
    return 12 * (int(mt.group(2)) + 1) + NOTE_IDX[mt.group(1)]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


# ---------------------------------------------------------------------------------------------------- WAV reading
def read_wav(path):
    """Any PCM/float WAV -> float32 (n, 2), native rate."""
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        sr, x = wavfile.read(path)
    if x.dtype == np.int16:
        x = x.astype(np.float32) / 32768.0
    elif x.dtype == np.int32:
        x = x.astype(np.float32) / 2147483648.0
    elif x.dtype == np.uint8:
        x = (x.astype(np.float32) - 128.0) / 128.0
    else:
        x = x.astype(np.float32)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    elif x.shape[1] > 2:
        x = x[:, :2]
    elif x.shape[1] == 1:
        x = np.repeat(x, 2, 1)
    return sr, x


def to48k(x, sr):
    if sr == SR:
        return x
    g = math.gcd(SR, sr)
    return signal.resample_poly(x, SR // g, sr // g, axis=0).astype(np.float32)


# ---------------------------------------------------------------------------------------------------- pitch analysis
def refine_dev(x, f_exp, harmonics=(1, 2, 3)):
    """Measure how many cents the sample deviates from f_exp (search +-60 cents around a few harmonics)."""
    mono = x.mean(1).astype(np.float64)
    w = int(0.02 * SR)
    env = np.sqrt(np.convolve(mono ** 2, np.ones(w) / w, "same") + 1e-20)
    ipk = int(np.argmax(env))
    s0 = ipk + int(0.04 * SR)
    seg = mono[s0: s0 + int(0.4 * SR)]
    if len(seg) < int(0.1 * SR):
        seg = mono[ipk: ipk + int(0.4 * SR)]
    if len(seg) < 2048:
        return 0.0
    nfft = 1 << 19
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), nfft))
    fr = np.fft.rfftfreq(nfft, 1.0 / SR)
    best = None
    for h in harmonics:
        fc = f_exp * h
        if fc > 16000:
            continue
        lo, hi = np.searchsorted(fr, fc * 2 ** (-0.6 / 12)), np.searchsorted(fr, fc * 2 ** (0.6 / 12))
        if hi - lo < 3:
            continue
        k = lo + int(np.argmax(spec[lo:hi]))
        if k <= lo or k >= hi - 1:
            continue
        a, b, c = np.log(spec[k - 1] + 1e-12), np.log(spec[k] + 1e-12), np.log(spec[k + 1] + 1e-12)
        d = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
        f = (k + d) * (fr[1] - fr[0])
        # prominence vs. band median
        prom = spec[k] / (np.median(spec[lo:hi]) + 1e-12)
        score = spec[k] * (1.0 if h == 1 else 0.8)
        if prom > 4 and (best is None or score > best[0]):
            best = (score, 1200 * math.log2(f / fc))
    return 0.0 if best is None else float(best[1])


# ---------------------------------------------------------------------------------------------------- cache
_INDEX_PATH = os.path.join(CACHE, "index.json")
_index = json.load(open(_INDEX_PATH)) if os.path.exists(_INDEX_PATH) else {}
_mem = {}


def _save_index():
    tmp = _INDEX_PATH + ".tmp"
    json.dump(_index, open(tmp, "w"), indent=0)
    os.replace(tmp, _INDEX_PATH)


def _key(rel, maxlen):
    return re.sub(r"[^A-Za-z0-9#_.-]+", "_", rel) + "__%g" % maxlen


def load_sample(rel, maxlen=8.0, f_exp=None, onset_db=-42.0):
    """Load a VSCO file (relative path), 48 kHz float32 stereo, leading silence trimmed (2 ms pre-roll kept), capped at
    maxlen seconds with a 30 ms fade. Cached as .npy under sound/cache/. Returns (audio, meta)."""
    k = _key(rel, maxlen)
    if k in _mem:
        return _mem[k]
    npy = os.path.join(CACHE, k + ".npy")
    meta = _index.get(k)
    if meta is not None and os.path.exists(npy):
        x = np.load(npy)
    else:
        sr, x = read_wav(os.path.join(ROOT, rel))
        # trim leading silence at native rate first (cheaper), then resample
        a = np.abs(x).max(1)
        pk = float(a.max()) + 1e-12
        thr = pk * 10 ** (onset_db / 20)
        i0 = int(np.argmax(a > thr))
        i0 = max(0, i0 - int(0.002 * sr))
        x = x[i0: i0 + int((maxlen + 0.05) * sr)]
        x = to48k(x, sr)
        x = x[: int(maxlen * SR)]
        nf = min(len(x), int(0.03 * SR))
        x[-nf:] *= np.linspace(1, 0, nf, dtype=np.float32)[:, None] ** 2
        mono = x.mean(1)
        w = int(0.1 * SR)
        e = np.sqrt(np.convolve(mono ** 2, np.ones(w) / w, "same"))
        ipk = int(np.argmax(e))
        # time to reach -12 dB of the 10 ms envelope peak (perceived attack)
        w2 = int(0.01 * SR)
        e2 = np.sqrt(np.convolve(mono ** 2, np.ones(w2) / w2, "same"))
        att = int(np.argmax(e2 > e2.max() * 0.25))
        meta = {"lev": float(e[ipk]), "peak": float(np.abs(x).max()), "att": att / SR, "len": len(x) / SR,
                "dev": 0.0 if f_exp is None else refine_dev(x, f_exp)}
        np.save(npy, x.astype(np.float32))
        _index[k] = meta
        _save_index()
    _mem[k] = (x, meta)
    return x, meta


# ---------------------------------------------------------------------------------------------------- instruments
TOKEN = re.compile(r"_([A-G]#?)(-?\d)(?=_|\.wav)")


def _parse(fn):
    t = TOKEN.search(fn)
    if not t:
        return None
    note, octv = t.group(1), int(t.group(2))
    v = re.search(r"_v(\d+)", fn)
    rr = re.search(r"_(?:rr|RR|r)(\d+)", fn)
    if not rr:
        rr = re.search(r"_(\d+)(?:_[A-Za-z]+)?\.wav$", fn)
    return note, octv, int(v.group(1)) if v else 1, int(rr.group(1)) if rr else 1


# name: (dir, octave offset name->scientific, maxlen seconds, filename filter)
INSTRUMENTS = {
    "vln":      ("Strings/Violin Section/susVib", 1, 7.0, None),
    "vln_spic": ("Strings/Violin Section/Spic", 1, 1.2, None),
    "vln_pizz": ("Strings/Violin Section/Pizz", 1, 2.5, None),
    "vln_trem": ("Strings/Violin Section/Trem", 1, 6.0, None),
    "vla":      ("Strings/Viola Section/susvib", 1, 7.0, None),
    "vla_spic": ("Strings/Viola Section/spic", 1, 1.2, None),
    "vla_pizz": ("Strings/Viola Section/pizz", 1, 2.5, None),
    "vla_trem": ("Strings/Viola Section/trem", 1, 6.0, None),
    "vc":       ("Strings/Cello Section/susvib", 1, 7.0, None),
    "vc_spic":  ("Strings/Cello Section/spic", 1, 1.2, None),
    "vc_pizz":  ("Strings/Cello Section/pizzT", 1, 3.0, None),
    "vc_trem":  ("Strings/Cello Section/trem", 1, 6.0, None),
    "cb":       ("Strings/Solo Contrabass/SusNV", 1, 7.0, None),
    "cb_spic":  ("Strings/Solo Contrabass/Spic", 1, 1.2, None),
    "harp":     ("Strings/Harp", 0, 6.0, None),
    "hn":       ("Brass/F Horn/sus", 1, 7.0, None),
    "hn_stac":  ("Brass/F Horn/stac", 1, 1.5, None),
    "tpt":      ("Brass/Trumpet/sus", 1, 7.0, None),
    "tpt_stac": ("Brass/Trumpet/stac", 1, 1.5, None),
    "tbn":      ("Brass/Tenor Trombone/sus", 1, 7.0, None),
    "tbn_stac": ("Brass/Tenor Trombone/stac", 1, 1.5, None),
    "tuba":     ("Brass/Tuba/sus", 1, 7.0, None),
    "tuba_stac": ("Brass/Tuba/stac", 1, 1.5, None),
    "fl":       ("Woodwinds/Flute/susvib", 1, 6.0, None),
    "fl_nv":    ("Woodwinds/Flute/susNV", 1, 6.0, None),
    "cl":       ("Woodwinds/Clarinet/susLong", 1, 6.0, None),
    "ob":       ("Woodwinds/Oboe/Vib", 1, 6.0, None),
    "glock":    ("Percussion/Glock", 1, 4.0, None),
}


class Instrument:
    def __init__(self, name):
        d, octoff, maxlen, flt = INSTRUMENTS[name]
        self.name, self.maxlen = name, maxlen
        self.files = []                 # (midi_named, layer_value, rr, rel)
        for p in sorted(glob.glob(os.path.join(ROOT, d, "*.wav"))):
            fn = os.path.basename(p)
            r = _parse(fn)
            if r is None:
                continue
            note, octv, v, rr = r
            midi = 12 * (octv + octoff + 1) + NOTE_IDX[note]
            self.files.append((midi, v, rr, os.path.relpath(p, ROOT)))
        self.layers = sorted(set(f[1] for f in self.files))
        self._rr = {}
        self._norm = None

    def norm(self):
        """Per-instrument gain: top layer median loudness -> 1.0 (relative layer loudness preserved)."""
        if self._norm is None:
            top = [f for f in self.files if f[1] == self.layers[-1] and f[2] == 1]
            mids = sorted(top, key=lambda f: f[0])
            pick = mids[len(mids) // 4: len(mids) // 4 * 3 + 1] or mids
            levs = [self.get(f)[1]["lev"] for f in pick]
            self._norm = 1.0 / (float(np.median(levs)) + 1e-9)
        return self._norm

    def get(self, f):
        return load_sample(f[3], self.maxlen, f_exp=hz(f[0]))

    def pick(self, midi, vel):
        li = int(round(np.clip(vel, 0, 1) * (len(self.layers) - 1)))
        layer = self.layers[li]
        cand = [f for f in self.files if f[1] == layer] or self.files
        # nearest named pitch (prefer sampling a little above: shifting down sounds more natural)
        best = min(abs(f[0] - midi) + (0.01 if f[0] < midi else 0) for f in cand)
        same = [f for f in cand if abs(f[0] - midi) + (0.01 if f[0] < midi else 0) == best]
        key = (same[0][0], layer)
        n = self._rr.get(key, 0)
        self._rr[key] = n + 1
        rrs = sorted(same, key=lambda f: f[2])
        return rrs[n % len(rrs)]


_inst = {}


def inst(name):
    if name not in _inst:
        _inst[name] = Instrument(name)
    return _inst[name]


def resample_play(x, ratio, n_out=None):
    """Play x (n,2) at `ratio` speed (ratio>1 = higher pitch) with cubic Hermite interpolation."""
    if n_out is None:
        n_out = int((len(x) - 3) / ratio)
    n_out = max(0, min(n_out, int((len(x) - 3) / ratio)))
    if abs(ratio - 1.0) < 1e-6:
        return x[:n_out].copy()
    pos = np.arange(n_out, dtype=np.float64) * ratio
    i = pos.astype(np.int64)
    f = (pos - i).astype(np.float32)[:, None]
    xm1 = x[np.maximum(i - 1, 0)]
    x0, x1, x2 = x[i], x[i + 1], x[i + 2]
    c1 = 0.5 * (x1 - xm1)
    c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2
    c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1)
    return (((c3 * f + c2) * f + c1) * f + x0).astype(np.float32)


def render_note(name, midi, dur=None, vel=0.8, release=0.35, attack=0.0, env=None, tune=True):
    """Return (audio (n,2), sample meta). dur=None plays the whole (capped) sample (one-shots / plucks).
    env: optional callable(t_seconds array) -> gain multiplier (for swells, sfz)."""
    I = inst(name)
    f = I.pick(midi, vel)
    x, meta = I.get(f)
    src_midi = f[0] + (meta["dev"] / 100.0 if tune else 0.0)
    ratio = 2 ** ((midi - src_midi) / 12.0)
    if dur is None:
        y = resample_play(x, ratio)
    else:
        n_out = int((dur + release) * SR)
        y = resample_play(x, ratio, n_out)
        nd = min(len(y), int(dur * SR))
        nr = len(y) - nd
        if nr > 0:
            k = np.linspace(0, 1, nr, dtype=np.float32)
            y[nd:] *= (np.cos(k * np.pi) * 0.5 + 0.5)[:, None] ** 1.5
    nf = min(len(y), int(0.006 * SR))
    if nf > 0:
        y[-nf:] *= np.linspace(1, 0, nf, dtype=np.float32)[:, None]
    if attack > 0:
        na = min(len(y), int(attack * SR))
        y[:na] *= (np.linspace(0, 1, na, dtype=np.float32) ** 2)[:, None]
    if env is not None:
        t = np.arange(len(y)) / SR
        y *= env(t).astype(np.float32)[:, None]
    return y * I.norm(), meta


def one_shot(rel, maxlen=8.0, ratio=1.0):
    x, meta = load_sample(rel, maxlen)
    y = resample_play(x, ratio) if ratio != 1.0 else x.copy()
    nf = min(len(y), int(0.01 * SR))
    y[-nf:] *= np.linspace(1, 0, nf, dtype=np.float32)[:, None]
    return y, meta


# ---------------------------------------------------------------------------------------------------- DSP helpers
def sos(kind, f, order=2):
    if kind in ("bandpass", "bandstop"):
        return signal.butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], btype=kind, output="sos")
    return signal.butter(order, f / (SR / 2), btype=kind, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x, axis=0).astype(np.float32)


def pan_gain(pan):
    """Constant-power pan, unity at centre. pan in [-1, 1]."""
    a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.cos(a) * math.sqrt(2), np.sin(a) * math.sqrt(2)


def place(x, pan=0.0, width=1.0):
    """Narrow a stereo sample to `width` then pan it (orchestral seating)."""
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    mid = 0.5 * (x[:, 0] + x[:, 1])
    side = 0.5 * (x[:, 0] - x[:, 1]) * width
    gl, gr = pan_gain(pan)
    return np.stack([(mid + side) * gl, (mid - side) * gr], 1).astype(np.float32)


def add(bus, x, t, gain=1.0):
    """Mix x into bus at time t (sample-accurate, rounding)."""
    i0 = S(t)
    if i0 < 0:
        x = x[-i0:]
        i0 = 0
    n = min(len(x), len(bus) - i0)
    if n > 0:
        bus[i0: i0 + n] += x[:n] * gain


def db(g):
    return 10 ** (g / 20.0)


def smooth_env(points, n, sr=SR):
    """Piecewise-linear envelope from [(t, value), ...] over n samples."""
    ts = np.array([p[0] for p in points]) * sr
    vs = np.array([p[1] for p in points])
    return np.interp(np.arange(n), ts, vs).astype(np.float32)


def make_ir(rt60=2.3, length=3.2, predelay=0.022, seed=7, hf_rt=1.1, lf_rt=2.8, er=True):
    """Synthetic stereo hall IR: decorrelated noise with band-dependent exponential decays + early reflections."""
    rng = np.random.default_rng(seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2), np.float32)
    bands = [("lowpass", 300.0, lf_rt), ("bandpass", (300.0, 3000.0), rt60), ("highpass", 3000.0, hf_rt)]
    for ch in range(2):
        w = rng.standard_normal(n).astype(np.float32)
        acc = np.zeros(n, np.float32)
        for kind, f, rt in bands:
            acc += filt(w, kind, f, 2) * np.exp(-6.91 * t / rt).astype(np.float32)
        # soft onset of the diffuse tail
        acc *= (1 - np.exp(-t / 0.012)).astype(np.float32)
        out[:, ch] = acc
    if er:
        for k in range(14):
            dt = 0.004 + rng.random() * 0.075
            i = int(dt * SR)
            g = 0.55 * (1 - dt / 0.09) * (0.6 + 0.4 * rng.random())
            out[i, k % 2] += g * 6.0 * (1 if rng.random() > 0.5 else -1)
    pd = int(predelay * SR)
    out = np.concatenate([np.zeros((pd, 2), np.float32), out])
    out /= np.sqrt((out ** 2).sum(0, keepdims=True))
    return out


def reverb(x, ir, xfeed=0.25):
    """Stereo convolution: L->L, R->R with a little cross-feed for a wide, diffuse field."""
    yl = signal.fftconvolve(x[:, 0] + xfeed * x[:, 1], ir[:, 0])[: len(x)]
    yr = signal.fftconvolve(x[:, 1] + xfeed * x[:, 0], ir[:, 1])[: len(x)]
    return np.stack([yl, yr], 1).astype(np.float32)


# ---------------------------------------------------------------------------------------------------- loudness
_K1 = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
_K2 = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def kweight(x):
    y = signal.lfilter(_K1[0], _K1[1], x, axis=0)
    return signal.lfilter(_K2[0], _K2[1], y, axis=0)


def block_loudness(x, block=0.4, hop=0.1):
    y = kweight(x.astype(np.float64))
    p = (y ** 2).sum(1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    nb, nh = int(block * SR), int(hop * SR)
    starts = np.arange(0, len(p) - nb + 1, nh)
    ms = (c[starts + nb] - c[starts]) / nb
    return starts / SR, ms


def lufs_integrated(x):
    _, ms = block_loudness(x)
    l = -0.691 + 10 * np.log10(ms + 1e-20)
    g1 = ms[l > -70]
    if len(g1) == 0:
        return -120.0
    lr = -0.691 + 10 * np.log10(g1.mean()) - 10
    g2 = ms[(l > -70) & (l > lr)]
    return float(-0.691 + 10 * np.log10(g2.mean()))


def lufs_short_term(x):
    t, ms = block_loudness(x, block=3.0, hop=0.1)
    return t, -0.691 + 10 * np.log10(ms + 1e-20)


def true_peak(x):
    y = signal.resample_poly(x, 4, 1, axis=0)
    return float(np.abs(y).max())


def limiter_gain(x, ceiling, lookahead=0.005, release=0.12):
    """Gain curve (n,) that keeps |x| under `ceiling`: look-ahead peak hold, instant attack (ramped over the
    look-ahead), exponential release. Applied identically to every stem (linked) so stems still sum to the mix."""
    a = np.abs(x).max(1)
    la = int(lookahead * SR)
    # required gain per sample
    need = np.minimum(1.0, ceiling / np.maximum(a, 1e-9))
    # look-ahead: min over the next `la` samples (sliding minimum via maximum filter on 1/need)
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    g = minimum_filter1d(need, size=2 * la + 1, origin=0)
    # release smoothing (one-pole on rising gain), run on 16-sample block minima for speed
    dec = 16
    nb = (len(g) + dec - 1) // dec
    gp = np.concatenate([g, np.ones(nb * dec - len(g), g.dtype)]).reshape(nb, dec).min(1)
    coef = math.exp(-dec / (release * SR))
    sm = np.empty(nb)
    p = 1.0
    for i in range(nb):
        v = gp[i]
        p = v if v < p else v + (p - v) * coef
        sm[i] = p
    out = np.repeat(sm, dec)[: len(g)]
    # smooth the attack edges (avoid clicks) with a short moving average, then re-enforce the ceiling
    out = uniform_filter1d(out, size=la + 1)
    out = np.minimum(out, minimum_filter1d(need, size=3))
    return out.astype(np.float32)


def compressor_gain(x, thresh_db=-14.0, ratio=2.0, knee=6.0, attack=0.02, release=0.25):
    """Gentle RMS bus compression gain curve (linked stereo)."""
    p = (x.astype(np.float64) ** 2).mean(1)
    w = int(0.01 * SR)
    from scipy.ndimage import uniform_filter1d
    r = np.sqrt(np.maximum(uniform_filter1d(p, size=w), 0) + 1e-20)
    lv = 20 * np.log10(r + 1e-12)
    over = lv - thresh_db
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio), (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    # attack/release smoothing on gain reduction (dB), decimated for speed
    dec = 48
    grd = gr[::dec]
    ca, cr = math.exp(-dec / (attack * SR)), math.exp(-dec / (release * SR))
    sm = np.empty_like(grd)
    s = 0.0
    for i, v in enumerate(grd):
        s = v + (s - v) * (ca if v > s else cr)
        sm[i] = s
    g = np.interp(np.arange(len(x)), np.arange(len(grd)) * dec, sm)
    return (10 ** (-g / 20)).astype(np.float32)


def write_wav(path, x, bits=24):
    x = np.ascontiguousarray(np.clip(np.nan_to_num(x), -1.0, 1.0), dtype=np.float64)
    if bits == 16:
        wavfile.write(path, SR, (x * 32767).round().astype(np.int16))
        return
    # 24-bit PCM written by hand (scipy writes int32 as 32-bit); pack little-endian 3 bytes
    q = (x * 8388607).round().astype(np.int32)
    b = q.astype("<i4").view(np.uint8).reshape(-1, 4)[:, :3].reshape(-1)
    nch = x.shape[1]
    data = b.tobytes()
    import struct
    hdr = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    hdr += b"fmt " + struct.pack("<IHHIIHH", 16, 1, nch, SR, SR * nch * 3, nch * 3, 24)
    hdr += b"data" + struct.pack("<I", len(data))
    with open(path, "wb") as f:
        f.write(hdr)
        f.write(data)
