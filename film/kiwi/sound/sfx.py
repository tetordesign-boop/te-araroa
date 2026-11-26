"""Synthesized sound effects (filtered noise, envelopes, modal knocks, oscillators). Every function returns a stereo
float32 array whose sample 0 is the sync point (impact) unless it says otherwise (pre-roll returned separately).
Deterministic: every random source is seeded."""
import numpy as np
from scipy import signal
from lib import SR, filt, place, pan_gain

F32 = np.float32


def rng(seed):
    return np.random.default_rng(seed)


def tvec(n):
    return np.arange(n, dtype=np.float64) / SR


def noise(n, seed):
    return rng(seed).standard_normal(n).astype(F32)


def brown(n, seed, leak=0.999):
    w = noise(n, seed)
    y = signal.lfilter([1.0], [1.0, -leak], w).astype(F32)
    return y / (np.abs(y).max() + 1e-9)


def stereo(l, r=None):
    return np.stack([l, l if r is None else r], 1).astype(F32)


def norm(x, peak=1.0):
    return (x * (peak / (np.abs(x).max() + 1e-9))).astype(F32)


def shaped(dur, gain_fn, seed, nper=1024):
    """Noise shaped in the STFT domain: gain_fn(f[:,None], t[None,:]) -> (F, T) magnitude. Mono."""
    n = int(dur * SR)
    w = noise(n + nper, seed)
    hop = nper // 4
    f, t, Z = signal.stft(w, fs=SR, nperseg=nper, noverlap=nper - hop, boundary=None, padded=True)
    G = gain_fn(f[:, None], t[None, :])
    _, y = signal.istft(Z * G, fs=SR, nperseg=nper, noverlap=nper - hop, boundary=False)
    y = y[:n].astype(F32)
    if len(y) < n:
        y = np.concatenate([y, np.zeros(n - len(y), F32)])
    return y


def bump(t, c, w):
    return np.exp(-0.5 * ((t - c) / w) ** 2)


def fade_edges(x, a=0.003, b=0.02):
    na, nb = int(a * SR), int(b * SR)
    if na:
        x[:na] *= np.linspace(0, 1, na, dtype=F32)[:, None] if x.ndim == 2 else np.linspace(0, 1, na, dtype=F32)
    if nb:
        x[-nb:] *= np.linspace(1, 0, nb, dtype=F32)[:, None] if x.ndim == 2 else np.linspace(1, 0, nb, dtype=F32)
    return x


# ------------------------------------------------------------------------------------------------ weather
def thunder(seed=1, dur=4.5, crack=1.0, pan=0.25, distant=False):
    """Lightning strike: (crack at sample 0) + boom + rolling rumble. distant=True: no crack, soft onset."""
    R = rng(seed)
    n = int(dur * SR)
    t = tvec(n)
    out = np.zeros((n, 2), F32)
    if not distant:
        c = noise(n, seed + 1) * np.exp(-t / 0.025).astype(F32)
        c = filt(c, "highpass", 700.0, 2)
        # sizzle: sparse impulses over the first 0.3 s
        imp = np.zeros(n, F32)
        k = R.integers(0, int(0.3 * SR), 90)
        imp[k] = (R.random(90) * np.exp(-k / SR / 0.12)).astype(F32) * (R.choice([-1, 1], 90))
        imp = filt(signal.lfilter([1.0], [1.0, -0.6], imp).astype(F32), "highpass", 1500.0, 2)
        cr = norm(c, 1.0) + 0.6 * norm(imp, 1.0)
        out += place(cr, pan, 0.4) * crack
        b = filt(noise(n, seed + 2), "lowpass", 160.0, 4) * ((1 - np.exp(-t / 0.006)) * np.exp(-t / 0.55)).astype(F32)
        thump = np.sin(2 * np.pi * (38 * t + 30 * 0.08 * (1 - np.exp(-t / 0.08)))) * np.exp(-t / 0.35) * (1 - np.exp(-t / 0.003))
        out += stereo(norm(b, 0.9) + 0.55 * thump.astype(F32))
    else:
        b = filt(noise(n, seed + 2), "lowpass", 140.0, 4) * ((1 - np.exp(-t / 0.012)) * np.exp(-t / 0.35)).astype(F32)
        out += stereo(norm(b, 0.8))
    # roll: band-limited brown noise with random bumps, decorrelated L/R
    env = np.zeros(n)
    nb = 9 if not distant else 6
    cs = np.sort(R.uniform(0.15, dur * 0.65, nb))
    for i, cc in enumerate(cs):
        env += R.uniform(0.4, 1.0) * np.exp(-cc / (dur * 0.35)) * bump(t, cc, R.uniform(0.12, 0.4))
    env += 0.3 * np.exp(-t / (dur * 0.3))
    att = 0.004 if not distant else 0.02
    env *= (1 - np.exp(-t / att)) * np.clip((dur - t) / 0.5, 0, 1)
    rl = filt(brown(n, seed + 3, 0.995), "lowpass", 260.0 if distant else 420.0, 3)
    rr = filt(brown(n, seed + 4, 0.995), "lowpass", 260.0 if distant else 420.0, 3)
    rl, rr = filt(rl, "highpass", 28.0, 2), filt(rr, "highpass", 28.0, 2)
    out += np.stack([norm(rl) * env, norm(rr) * env], 1).astype(F32) * (0.8 if not distant else 1.0)
    return fade_edges(out, 0.0, 0.3)


def rain(dur, density_fn, seed=20):
    """Rain bed: hiss wash + individual drops. density_fn(t) in [0, 1] (per-shot levels, hard cut aware)."""
    n = int(dur * SR)
    t = tvec(n)
    d = density_fn(t).astype(F32)
    R = rng(seed)
    out = np.zeros((n, 2), F32)
    for ch in range(2):
        wash = filt(filt(noise(n, seed + ch), "highpass", 900.0, 2), "lowpass", 9000.0, 2)
        # drops: Poisson clicks, rate ~ 2500/s at density 1
        p = np.clip(d * 2500.0 / SR, 0, 1)
        hits = (R.random(n) < p).astype(F32) * R.uniform(0.2, 1.0, n).astype(F32)
        drops = signal.lfilter([1.0], [1.0, -0.82], hits).astype(F32)
        drops = filt(drops, "bandpass", (1800.0, 7000.0), 2)
        out[:, ch] = norm(wash, 0.5) * np.sqrt(d) + norm(drops, 1.0) * d
    return out


def surf(dur, seed=30):
    """Stormy sea roar under the coastal shot (slow swells)."""
    n = int(dur * SR)
    t = tvec(n)
    R = rng(seed)
    env = 0.55 + 0.45 * np.sin(2 * np.pi * 0.42 * t + R.uniform(0, 6)) ** 2
    l = filt(noise(n, seed), "bandpass", (90.0, 1400.0), 2)
    r = filt(noise(n, seed + 1), "bandpass", (90.0, 1400.0), 2)
    return np.stack([norm(l) * env, norm(r) * env], 1).astype(F32)


def flood_roar(dur, surge_t, seed=40):
    """Roaring river; level and brightness surge up into `surge_t` (seconds from start), then settle."""
    k_up = lambda t: np.clip((t - (surge_t - 0.8)) / 0.68, 0, 1) ** 2
    def g(f, tt):
        dip = 1 - 0.55 * np.clip((tt - (surge_t - 0.12)) / 0.08, 0, 1)
        s = k_up(tt) * dip * (tt <= surge_t) + (tt > surge_t) * (0.45 + 0.25 * np.clip((tt - surge_t) / 0.3, 0, 1)) * np.exp(-(tt - surge_t) / 0.9)
        fc = 700 + 1800 * s
        tilt = 1.0 / (1 + (f / fc) ** 2)
        lo = 1.0 / (1 + (90.0 / (f + 1)) ** 4)
        return tilt * lo * (0.55 + 0.6 * s)
    l = shaped(dur, g, seed)
    r = shaped(dur, g, seed + 1)
    t = tvec(len(l))
    turb = 1 + 0.25 * np.sin(2 * np.pi * 6.3 * t) * np.sin(2 * np.pi * 0.7 * t)
    return np.stack([l * turb, r * turb], 1).astype(F32) / (np.abs(l).max() + 1e-9)


def water_crash(seed=50, dur=1.8, pan=0.0):
    """Wave smashing on the bridge: sharp broadband slap at sample 0 + spray + low thump."""
    R = rng(seed)
    n = int(dur * SR)
    t = tvec(n)
    slap = filt(filt(noise(n, seed), "lowpass", 7000.0, 2), "highpass", 120.0, 2) * ((1 - np.exp(-t / 0.002)) * np.exp(-t / 0.28))
    # spray: many short grains, density decaying
    spray = np.zeros(n, F32)
    for i in range(260):
        c = R.exponential(0.35)
        if c > dur - 0.1:
            continue
        L = int(R.uniform(0.004, 0.03) * SR)
        i0 = int(c * SR)
        g = R.standard_normal(L) * np.hanning(L) * np.exp(-c / 0.5)
        spray[i0:i0 + L] += g.astype(F32)
    spray = filt(spray, "highpass", 2200.0, 2)
    thump = np.sin(2 * np.pi * 55 * t) * np.exp(-t / 0.18) * (1 - np.exp(-t / 0.002))
    m = norm(slap) + 0.45 * norm(spray) + 0.6 * thump.astype(F32)
    l = m + 0.25 * filt(noise(n, seed + 9), "bandpass", (300.0, 3000.0), 2) * np.exp(-t / 0.3).astype(F32)
    r = m + 0.25 * filt(noise(n, seed + 10), "bandpass", (300.0, 3000.0), 2) * np.exp(-t / 0.3).astype(F32)
    out = np.stack([l, r], 1).astype(F32)
    gl, gr = pan_gain(pan)
    out[:, 0] *= gl
    out[:, 1] *= gr
    return fade_edges(out, 0.0, 0.2)


# ------------------------------------------------------------------------------------------------ creatures
def sandflies(dur, t_vortex, t_in, seed=60, nflies=36):
    """Swarm whine. Flies arrive from t_in, converge to the densest point at t_vortex, then scatter (Doppler drop).
    Times in seconds from the array start."""
    R = rng(seed)
    n = int(dur * SR)
    t = tvec(n)
    out = np.zeros((n, 2), F32)
    for i in range(nflies):
        f0 = R.uniform(330, 640)
        arrive = t_in + (t_vortex - t_in) * R.uniform(0.0, 0.85) ** 1.5
        leave = t_vortex + R.uniform(0.05, 0.9)
        a = np.clip((t - arrive) / 0.25, 0, 1) * np.clip(1 - (t - leave) / R.uniform(0.15, 0.4), 0, 1)
        a *= 0.55 + 0.45 * bump(t, t_vortex, 0.18) * 2.2
        # pitch: wobble + rises as they converge, Doppler drop when they scatter
        wob = 1 + 0.025 * np.sin(2 * np.pi * R.uniform(8, 22) * t + R.uniform(0, 6))
        conv = 1 + 0.06 * bump(t, t_vortex, 0.3)
        dop = 1 - 0.12 * np.clip((t - leave + 0.15) / 0.3, 0, 1)
        f = f0 * wob * conv * dop
        ph = 2 * np.pi * np.cumsum(f) / SR
        w = sum(np.sin(k * ph) / k ** 1.2 for k in range(1, 7))
        # orbit: pan rotates faster toward the vortex
        rate = R.uniform(0.6, 1.2) * (1 + 2.5 * bump(t, t_vortex, 0.4))
        pan = np.sin(2 * np.pi * np.cumsum(rate) / SR + R.uniform(0, 6)) * 0.85
        gl, gr = pan_gain(pan)
        s = (w * a).astype(F32)
        out[:, 0] += s * gl.astype(F32)
        out[:, 1] += s * gr.astype(F32)
    out = filt(out, "highpass", 250.0, 2)
    return fade_edges(out / (np.abs(out).max() + 1e-9), 0.01, 0.1)


def bellbird(seed=70, notes=(1760.0, 1318.5, 2349.3), gap=0.16):
    """Korimako-like liquid bell notes (pitched to the dawn pentatonic: A6, E6, D7 ...)."""
    R = rng(seed)
    segs = []
    tot = int((len(notes) * gap + 0.6) * SR)
    out = np.zeros(tot, F32)
    for i, f in enumerate(notes):
        L = int(R.uniform(0.12, 0.25) * SR)
        tt = tvec(L)
        glide = f * (1 + R.uniform(-0.03, 0.03) * np.exp(-tt / 0.03))
        ph = 2 * np.pi * np.cumsum(glide) / SR
        y = (np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.05 * np.sin(3.01 * ph)) * (1 - np.exp(-tt / 0.004)) * np.exp(-tt / R.uniform(0.05, 0.11))
        i0 = int(i * gap * SR + R.uniform(0, 0.03) * SR)
        out[i0:i0 + L] += y.astype(F32)
    return fade_edges(stereo(out), 0.0, 0.05)


# ------------------------------------------------------------------------------------------------ mountains
def modal_knock(seed, size=1.0):
    """One rock knock: a few damped modes + noise tick."""
    R = rng(seed)
    L = int(0.25 * SR)
    t = tvec(L)
    y = np.zeros(L)
    for k in range(5):
        f = R.uniform(250, 1700) / size
        y += R.uniform(0.3, 1.0) * np.sin(2 * np.pi * f * t + R.uniform(0, 6)) * np.exp(-t / R.uniform(0.012, 0.04))
    tick = R.standard_normal(L) * np.exp(-t / 0.003)
    thud = np.sin(2 * np.pi * 90 / size * t) * np.exp(-t / 0.05) * size
    return (y / 3 + 0.5 * tick + 0.8 * thud).astype(F32)


def rock_clatter(seed=80, pan_from=-0.6, pan_to=0.7, dur=1.4):
    """A rock bounding past: big knock at sample 0, then bounces with shrinking gaps + pebble rattle."""
    R = rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2), F32)
    times, g = [0.0], 0.24
    while times[-1] + g < dur - 0.3 and len(times) < 9:
        times.append(times[-1] + g)
        g *= R.uniform(0.72, 0.85)
    for j, tc in enumerate(times):
        amp = (1.0 if j == 0 else 0.75 * 0.8 ** j)
        k = modal_knock(seed + 10 + j, 1.3 if j == 0 else R.uniform(0.8, 1.1)) * amp
        p = pan_from + (pan_to - pan_from) * (tc / max(times[-1], 1e-3))
        gl, gr = pan_gain(p)
        i0 = int(tc * SR)
        L = min(len(k), n - i0)
        out[i0:i0 + L, 0] += k[:L] * gl
        out[i0:i0 + L, 1] += k[:L] * gr
    # pebbles
    for i in range(70):
        tc = R.uniform(0.02, dur - 0.3)
        L = int(0.02 * SR)
        tt = tvec(L)
        s = (R.standard_normal(L) * np.exp(-tt / 0.002) + np.sin(2 * np.pi * R.uniform(1800, 4000) * tt) * np.exp(-tt / 0.006)) * 0.12 * np.exp(-tc / 0.8)
        p = R.uniform(-0.8, 0.8)
        gl, gr = pan_gain(p)
        i0 = int(tc * SR)
        out[i0:i0 + L, 0] += (s * gl).astype(F32)
        out[i0:i0 + L, 1] += (s * gr).astype(F32)
    return fade_edges(out / (np.abs(out).max() + 1e-9), 0.0, 0.1)


def avalanche(t_rel, t_hit, t_clear, dur, seed=90):
    """Times in seconds from the array start: release crack + whumpf at t_rel, rumble swelling to the engulfing roar
    at t_hit, snow hiss thinning out by t_clear."""
    n = int(dur * SR)
    t = tvec(n)
    R = rng(seed)
    out = np.zeros((n, 2), F32)
    # release: slab crack + whumpf
    i0 = int(t_rel * SR)
    L = int(1.2 * SR)
    tt = tvec(L)
    crack = filt(noise(L, seed), "highpass", 1200.0, 2) * np.exp(-tt / 0.012).astype(F32)
    crack2 = filt(noise(L, seed + 1), "highpass", 900.0, 2) * (np.exp(-np.maximum(tt - 0.05, 0) / 0.02) * (tt > 0.05)).astype(F32)
    whumpf = (np.sin(2 * np.pi * (34 * tt + 25 * 0.1 * (1 - np.exp(-tt / 0.1)))) * np.exp(-tt / 0.4) * (1 - np.exp(-tt / 0.004))).astype(F32)
    rel = norm(crack) * 0.9 + norm(crack2) * 0.4 + whumpf * 0.9
    out[i0:i0 + L] += stereo(rel[: n - i0])
    # rumble: low roar rising, brighter as it nears
    def g(f, tt):
        up = np.clip((tt - t_rel) / (t_hit - t_rel), 0, 1)
        after = np.exp(-np.maximum(tt - t_hit, 0) / max(0.35 * (t_clear - t_hit), 0.05))
        s = np.where(tt < t_hit, up ** 2.2, after)
        s = s * (tt >= t_rel)
        fc = 150 + 2400 * s ** 1.5
        return s * (1.0 / (1 + (f / fc) ** 3)) * (1.0 / (1 + (35.0 / (f + 1)) ** 4))
    l, r = shaped(dur, g, seed + 3), shaped(dur, g, seed + 4)
    sc = 1.0 / (max(np.abs(l).max(), np.abs(r).max()) + 1e-9)
    out += np.stack([l, r], 1) * sc * 1.1
    # engulf: wall of white
    i1 = int(t_hit * SR)
    L = n - i1
    tt = tvec(L)
    wall_env = (1 - np.exp(-tt / 0.006)) * np.exp(-tt / (0.45 * (t_clear - t_hit)))
    wl = filt(filt(noise(L, seed + 5), "lowpass", 5000.0, 2), "highpass", 45.0, 2) * wall_env.astype(F32)
    wr = filt(filt(noise(L, seed + 6), "lowpass", 5000.0, 2), "highpass", 45.0, 2) * wall_env.astype(F32)
    boom = (np.sin(2 * np.pi * 42 * tt) * np.exp(-tt / 0.4) * (1 - np.exp(-tt / 0.003))).astype(F32)
    hiss = filt(noise(L, seed + 7), "highpass", 3500.0, 2) * (np.exp(-tt / (t_clear - t_hit + 0.4)) * 0.25).astype(F32)
    out[i1:] += np.stack([norm(wl) + boom * 0.8 + norm(hiss) * 0.25, norm(wr) + boom * 0.8 + norm(hiss) * 0.25], 1)
    return fade_edges(out, 0.0, 0.2)


def wind(dur, strength_fn, seed=100, whistle=1.0, pan_rate=0.15, base=1.0):
    """Wind: noise with 3 wandering resonances (whistle) whose pitch and level follow strength_fn(t) (0..1.5)."""
    R = rng(seed)
    nT = int(dur * SR / 256) + 8
    tt = np.arange(nT) * 256 / SR
    walks = []
    for k in range(3):
        w = np.cumsum(R.standard_normal(nT)) * 0.02
        w = signal.lfilter([0.02], [1, -0.98], w)
        walks.append(w - w.mean())
    def g(f, t):
        s = strength_fn(t)
        G = base * (0.35 * s) / (1 + (f / (300 + 900 * s)) ** 2) * (1.0 / (1 + (60.0 / (f + 1)) ** 4))
        for k in range(3):
            wk = np.interp(t, tt, walks[k])
            fc = (380 + 520 * k) * (0.7 + 0.6 * s) * np.exp(wk)
            G = G + whistle * (0.55 / (k + 1)) * s ** 1.5 * np.exp(-0.5 * (np.log(f / fc + 1e-9) / 0.09) ** 2)
        return G
    l, r = shaped(dur, g, seed + 1, 2048), shaped(dur, g, seed + 2, 2048)
    t = tvec(len(l))
    p = 0.5 * np.sin(2 * np.pi * pan_rate * t + R.uniform(0, 6))
    gl, gr = pan_gain(p)
    out = np.stack([l * gl, r * gr], 1).astype(F32)
    return out


def whoosh(pre=0.32, post=0.25, seed=110, f0=250.0, f1=3800.0, pan_from=-0.6, pan_to=0.6):
    """Impact-frame whoosh: a band of noise sweeping up into the hit. Returns (audio, pre) — sample `pre*SR` is the
    hit instant (peak), so place it at t_hit - pre."""
    dur = pre + post
    def g(f, t):
        k = np.clip(t / pre, 0, 1)
        fc = f0 * (f1 / f0) ** (k ** 1.6)
        fc = np.where(t > pre, f1 * np.exp(-(t - pre) / 0.15), fc)
        a = np.where(t <= pre, k ** 3, np.exp(-(t - pre) / 0.07))
        return a * np.exp(-0.5 * (np.log(f / fc + 1e-9) / 0.55) ** 2)
    l, r = shaped(dur, g, seed, 512), shaped(dur, g, seed + 1, 512)
    t = tvec(len(l))
    p = pan_from + (pan_to - pan_from) * np.clip(t / dur, 0, 1)
    gl, gr = pan_gain(p)
    out = np.stack([l * gl, r * gr], 1).astype(F32)
    return fade_edges(norm(out), 0.005, 0.03), pre


def sub_boom(dur=3.0):
    """The step: sub drop 75->31 Hz, click transient, body thump. Sample 0 = foot plant."""
    n = int(dur * SR)
    t = tvec(n)
    f = 31 + 44 * np.exp(-t / 0.07)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(ph) * (1 - np.exp(-t / 0.0015)) * np.exp(-t / 0.85)
    body = np.sin(2 * np.pi * 95 * t) * np.exp(-t / 0.09) * (1 - np.exp(-t / 0.001))
    click = filt(noise(n, 120), "lowpass", 2500.0, 2) * np.exp(-t / 0.004).astype(F32)
    y = sub + 0.45 * body + 0.35 * norm(click)
    return fade_edges(stereo(y.astype(F32)), 0.0, 0.3)


def grass_wave(seed=130, dur=1.4):
    """Shockwave through the tussock: a rustle that spreads outward in the stereo field. Sample 0 = plant."""
    n = int(dur * SR)
    t = tvec(n)
    env = (1 - np.exp(-t / 0.01)) * np.exp(-t / 0.35)
    l = filt(filt(noise(n, seed), "highpass", 1800.0, 2), "lowpass", 9000.0, 2)
    r = filt(filt(noise(n, seed + 1), "highpass", 1800.0, 2), "lowpass", 9000.0, 2)
    am = 0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 23 * t))
    w = np.clip(t / 0.5, 0, 1)                       # spreads from centre to wide
    mid = (l + r) / 2
    L, Rr = mid * (1 - w) + l * w, mid * (1 - w) + r * w
    return fade_edges(np.stack([L * env * am, Rr * env * am], 1).astype(F32), 0.0, 0.1)


def lace_zip(seed=140, pre=0.14):
    """Bootlace pulled tight: short friction rising into the pull. Returns (audio, pre)."""
    def g(f, t):
        k = np.clip(t / pre, 0, 1)
        fc = 900 * (5.0 ** k)
        a = np.where(t <= pre, k ** 2, np.exp(-(t - pre) / 0.02))
        return a * np.exp(-0.5 * (np.log(f / fc + 1e-9) / 0.4) ** 2)
    y = shaped(pre + 0.1, g, seed, 256)
    return fade_edges(stereo(norm(y)), 0.003, 0.02), pre


def soft_thump(seed=150, f=180.0, tau=0.06, lp=900.0):
    """Beanie landing / fabric 'fwump'. Sample 0 = contact."""
    n = int(0.4 * SR)
    t = tvec(n)
    y = filt(noise(n, seed), "lowpass", lp, 2) * ((1 - np.exp(-t / 0.004)) * np.exp(-t / tau)).astype(F32)
    y = norm(y) + 0.5 * (np.sin(2 * np.pi * f * t) * np.exp(-t / tau * 0.8) * (1 - np.exp(-t / 0.002))).astype(F32)
    return fade_edges(stereo(y.astype(F32)), 0.0, 0.05)


def pop(f0=1100.0, f1=380.0):
    """Title dot pop: a tiny pitched bubble. Sample 0 = pop."""
    n = int(0.25 * SR)
    t = tvec(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.018)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - np.exp(-t / 0.0015)) * np.exp(-t / 0.05)
    return fade_edges(stereo(y.astype(F32)), 0.0, 0.03)


def celesta(freq, dur=1.6):
    """FM bell, celesta-ish, used under the glockenspiel for warmth. Sample 0 = strike."""
    n = int(dur * SR)
    t = tvec(n)
    I = 1.2 * np.exp(-t / 0.08) + 0.15
    y = np.sin(2 * np.pi * freq * t + I * np.sin(2 * np.pi * freq * 1.0 * t)) * np.exp(-t / 0.55) * (1 - np.exp(-t / 0.001))
    y += 0.2 * np.sin(2 * np.pi * freq * 4.0 * t) * np.exp(-t / 0.05)
    return fade_edges(stereo(y.astype(F32)), 0.0, 0.05)


def water_lap(dur, seed=160):
    """Still cove at dawn: tiny lapping wavelets."""
    n = int(dur * SR)
    t = tvec(n)
    R = rng(seed)
    env = np.zeros(n)
    for c in np.arange(0.3, dur, 1.7):
        env += bump(t, c + R.uniform(-0.3, 0.3), R.uniform(0.15, 0.3)) * R.uniform(0.4, 1.0)
    l = filt(noise(n, seed), "bandpass", (180.0, 1600.0), 2)
    r = filt(noise(n, seed + 1), "bandpass", (180.0, 1600.0), 2)
    return np.stack([norm(l) * env, norm(r) * env], 1).astype(F32) * 0.6


def riser(dur, seed=170):
    """Spiral riser: noise band climbing over dur, ending at full level (cut by the hard cut)."""
    def g(f, t):
        k = np.clip(t / dur, 0, 1)
        fc = 200 * (25.0 ** k)
        return (k ** 2.2) * np.exp(-0.5 * (np.log(f / fc + 1e-9) / 0.5) ** 2)
    l, r = shaped(dur, g, seed, 1024), shaped(dur, g, seed + 1, 1024)
    return norm(np.stack([l, r], 1))
