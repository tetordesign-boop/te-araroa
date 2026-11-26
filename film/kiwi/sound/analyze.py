"""Verify sound/score.wav: length/format, loudness, peaks, per-section levels, onset timing at every sync point,
the bar-14 silence, and render a spectrogram PNG with the sync points marked. Run: nice python3 sound/analyze.py"""
import os, sys
import numpy as np
import lib
from lib import SR, at, BEAT

HERE = lib.HERE
OUT = os.path.join(HERE, "analysis")
os.makedirs(OUT, exist_ok=True)


def load(p):
    sr, x = lib.read_wav(p)
    assert sr == SR, sr
    return x.astype(np.float64)


x = load(os.path.join(HERE, "score.wav"))
mu = load(os.path.join(HERE, "stems", "music.wav"))
fx = load(os.path.join(HERE, "stems", "sfx.wav"))
mono = x.mean(1)
rep = []
P = lambda *a: (print(*a), rep.append(" ".join(str(v) for v in a)))

P("length: %d samples = %.4f s (expected %d)" % (len(x), len(x) / SR, lib.N))
P("stems sum error: %.2e (max abs)" % np.abs(mu + fx - x).max())
L = lib.lufs_integrated(x)
P("integrated loudness: %.2f LUFS | sample peak %.2f dBFS | true peak %.2f dBTP"
  % (L, 20 * np.log10(np.abs(x).max()), 20 * np.log10(lib.true_peak(x))))
ts, st = lib.lufs_short_term(x)
P("short-term (3 s) loudness max %.1f LUFS at %.1f s" % (st.max(), ts[np.argmax(st)] + 1.5))


def rms_db(a):
    return 10 * np.log10((a ** 2).mean() + 1e-20)


secs = [("dawn bars 1-4", 0, at(5)), ("storm bars 5-10", at(5), at(11)), ("montage bar 11", at(11), at(12)),
        ("eye bar 12", at(12), at(13)), ("spiral bar 13", at(13), at(14)), ("SILENCE bar 14", at(14), at(15)),
        ("step + theme bars 15-17", at(15), at(18)), ("beanie + lift bar 18", at(18), at(19)), ("final chord 48-51", at(19), 51.0)]
P("\nper-section levels (RMS dBFS: master / music / sfx, peak dBFS master):")
for name, a, b in secs:
    i, j = lib.S(a), lib.S(b)
    P("  %-24s %6.1f / %6.1f / %6.1f   peak %6.1f" % (name, rms_db(x[i:j]), rms_db(mu[i:j]), rms_db(fx[i:j]),
                                                    20 * np.log10(np.abs(x[i:j]).max() + 1e-12)))

# ---- the silence
i, j = lib.S(at(14)), lib.S(at(15))
P("\nbar 14 (%.3f-%.3f): music stem max |x| = %.2e (%s), sfx (wind whisper) RMS %.1f dBFS, peak %.1f dBFS"
  % (at(14), at(15), np.abs(mu[i:j]).max(), "digital silence" if np.abs(mu[i:j]).max() == 0 else "NOT silent",
     rms_db(fx[i:j]), 20 * np.log10(np.abs(fx[i:j]).max() + 1e-12)))
k = lib.S(at(14))
P("hard cut: master RMS 20 ms before %.1f dBFS -> 20 ms after %.1f dBFS"
  % (rms_db(x[k - 960:k]), rms_db(x[k + 1:k + 961])))
k2 = lib.S(at(15))
P("step re-entry: last 20 ms before 37.333 %.1f dBFS -> first 20 ms after %.1f dBFS"
  % (rms_db(x[k2 - 960:k2]), rms_db(x[k2:k2 + 960])))

# ---- onsets: energy envelope (1 ms hop, 4 ms window) and its log-derivative
hop = 48
e = np.sqrt(np.convolve(mono ** 2, np.ones(192) / 192, "same")[::hop] + 1e-12)
le = 20 * np.log10(e)
dle = np.diff(le, prepend=le[0])


def env_db(sig):
    e_ = np.sqrt(np.convolve(sig ** 2, np.ones(192) / 192, "same")[::hop] + 1e-12)
    l_ = 20 * np.log10(e_)
    return np.diff(l_, prepend=l_[0])


D_MU, D_FX = env_db(mu.mean(1)), env_db(fx.mean(1))


def onset_in(d_, t, win=0.04):
    c = int(t * SR / hop)
    w = int(win * SR / hop)
    return (c - w + int(np.argmax(d_[c - w:c + w]))) * hop / SR


def onset(t, win=0.04):
    """Within +-win of t: time of the sharpest energy rise, and rise in dB (10 ms after vs 30 ms before t)."""
    c = int(t * SR / hop)
    w = int(win * SR / hop)
    seg = dle[c - w:c + w]
    k = int(np.argmax(seg))
    t_on = (c - w + k) * hop / SR
    a = lib.S(t)
    rise = rms_db(mono[a:a + 480]) - rms_db(mono[a - 1440:a])
    return t_on, rise, seg[k]


SYNC = [(6.667, "lace pluck"), (at(5), "storm downbeat"), (12.0, "lightning"), (14.667, "flood wave"),
        (17.333, "sandfly vortex (swell)"), (19.333, "rock 1"), (20.667, "rock 2"), (21.333, "avalanche release"),
        (22.667, "avalanche engulf"), (25.333, "gale gust (swell)"), (26.667, "montage hit 1"), (27.333, "montage hit 2"),
        (28.0, "montage hit 3"), (28.667, "montage hit 4"), (30.0, "low thunder 1"), (30.833, "low thunder 2"),
        (31.667, "low thunder 3"), (37.333, "THE STEP"), (44.0, "last light Bluff"), (45.333, "beanie lands"),
        (47.333, "title T"), (47.5, "title A"), (48.0, "final chord / dot")]


def env5(sig):
    return 10 * np.log10(np.convolve(sig ** 2, np.ones(240) / 240, "same")[::hop] + 1e-20)


E_M, E_MU, E_FX = env5(mono), env5(mu.mean(1)), env5(fx.mean(1))


def cross(E, t, thr=6.0):
    """First time (1 ms grid) in [t-40 ms, t+60 ms] where the 5 ms level exceeds the level of [t-80, t-15] ms by thr dB."""
    c = int(t * SR / hop)
    base = 10 * np.log10(np.mean(10 ** (E[c - 80:c - 15] / 10)))
    seg = E[c - 40:c + 60]
    k = np.where(seg > base + thr)[0]
    return None if len(k) == 0 else (c - 40 + k[0]) * hop / SR - t


def fmt(v):
    return "   n/a  " if v is None else "%+6.1f ms" % (v * 1000)


P("\nsync points: first rise of the 5 ms level >= +6 dB above the preceding 65 ms (n/a = sustained swell, no step):")
for t, name in SYNC:
    a_ = lib.S(t)
    rise = rms_db(mono[a_:a_ + 480]) - rms_db(mono[a_ - 1440:a_])
    P("  %7.3f  %-24s master %s  (rise %+5.1f dB) | music %s | sfx %s"
      % (t, name, fmt(cross(E_M, t)), rise, fmt(cross(E_MU, t)), fmt(cross(E_FX, t))))

HB = env5(lib.filt(mono.astype(np.float32), "bandpass", (2000.0, 8000.0), 4).astype(np.float64))
P("\nbright cues, 2-8 kHz band (glockenspiel / triangle / pizz):")
for t, name in ((6.667, "lace pluck"), (44.0, "last light Bluff"), (45.333, "beanie lands"), (47.333, "title T"),
                (47.5, "title A"), (48.0, "final chord / dot")):
    c = int(t * SR / hop)
    base = 10 * np.log10(np.mean(10 ** (HB[c - 80:c - 15] / 10)))
    P("  %7.3f  %-20s onset %s, 2-8 kHz rise %+5.1f dB" % (t, name, fmt(cross(HB, t)), HB[c:c + 30].max() - base))

# swells: where is the loudest 50 ms around the swell target?
P("\nswell peaks (loudest 50 ms window within +-0.35 s):")
for t, name in ((17.333, "sandfly vortex"), (25.333, "gale gust"), (34.66, "spiral peak before cut")):
    a, b = lib.S(t - 0.35), lib.S(min(t + 0.35, at(14) - 0.001))
    w = 2400
    lo = []
    for sig in (mono, mu.mean(1), fx.mean(1)):
        env = np.convolve(sig[a:b] ** 2, np.ones(w) / w, "valid")
        lo.append((a + np.argmax(env) + w / 2) / SR)
    P("  %-24s target %.3f  loudest at %.3f (music %.3f, sfx %.3f)" % (name, t, lo[0], lo[1], lo[2]))

# trail lights: onset near each light
tl = [39.0 + 4.667 * i / 47 for i in range(48)]
hits = np.array([onset_in(D_MU, t, 0.03) - t for t in tl]) * 1000
P("\ntrail lights (48, music stem): steepest rise offset median %+.1f ms, |max| %.1f ms" % (np.median(hits), np.abs(hits).max()))

open(os.path.join(OUT, "report.txt"), "w").write("\n".join(rep) + "\n")

# ---- spectrogram
if "--no-png" not in sys.argv:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from scipy import signal
    f, t, Z = signal.stft(mono[::2], fs=SR // 2, nperseg=1024, noverlap=768)
    Sdb = 20 * np.log10(np.abs(Z) + 1e-7)
    fig, ax = plt.subplots(2, 1, figsize=(22, 9), gridspec_kw={"height_ratios": [3, 1]}, sharex=True)
    ax[0].pcolormesh(t, f, Sdb, vmin=Sdb.max() - 90, vmax=Sdb.max(), shading="auto", cmap="magma")
    ax[0].set_yscale("symlog", linthresh=200)
    ax[0].set_ylim(30, 12000)
    ax[0].set_ylabel("Hz")
    for tt, name in SYNC:
        for a in ax:
            a.axvline(tt, color="cyan", lw=0.6, alpha=0.7)
        ax[0].text(tt, 9000, name, rotation=90, color="cyan", fontsize=7, va="top")
    for b in range(1, 20):
        ax[1].axvline(at(b), color="0.7", lw=0.4)
    tt2 = np.arange(len(le)) * hop / SR
    ax[1].plot(tt2, le, lw=0.4, color="k")
    ax[1].plot(ts + 1.5, st, lw=1.5, color="tab:orange", label="short-term LUFS")
    ax[1].set_ylim(-90, 0)
    ax[1].set_xlim(0, 51)
    ax[1].set_xlabel("s")
    ax[1].legend(loc="lower left")
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "spectrogram.png"), dpi=70)
    print("wrote", os.path.join(OUT, "spectrogram.png"))
