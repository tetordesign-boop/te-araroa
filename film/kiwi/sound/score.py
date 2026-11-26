"""THE SCORE — « Le kiwi » (51.0 s, 90 BPM, 4/4, key of D). Renders sound/score.wav, sound/stems/{music,sfx}.wav and
sound/cues.md. Run: nice python3 sound/score.py

Harmony rule: the first MAJOR chord of the film is the step at 37.333 (bar 15). Before it: no F#, no major triad, no
major third above the bass (dawn = open fifths / sus2 + D-E-G-A-C pentatonic; storm = D minor / Phrygian power
chords and clusters)."""
import os, sys, time
import numpy as np
import lib, sfx
from lib import at, BEAT, BAR, SR, N, m, db, place, add, render_note, one_shot, S

T0 = time.time()
HERE = lib.HERE
PAD = int(4 * SR)
NT = N + PAD
BUS = {k: np.zeros((NT, 2), np.float32) for k in ("str", "brs", "ww", "harp", "perc", "sfx", "sfx_dry")}
CUES = []          # (t, what)
PRE = 0.002        # onset pre-roll kept by the sample cache: one-shots are placed 2 ms early -> transient on time


def cue(t, what):
    CUES.append((t, what))


# orchestral seating (pan, width)
SEAT = {
    "vln": (-0.55, 0.45), "vln2": (-0.25, 0.45), "vla": (0.18, 0.45), "vc": (0.45, 0.45), "cb": (0.65, 0.35),
    "hn": (-0.3, 0.4), "tpt": (0.12, 0.35), "tbn": (0.35, 0.4), "tuba": (0.5, 0.35),
    "fl": (-0.12, 0.3), "ob": (0.05, 0.3), "cl": (0.2, 0.3), "harp": (-0.65, 0.5), "glock": (0.35, 0.4),
    "timp": (-0.08, 0.6), "perc": (0.1, 0.8),
}
BUSOF = {"vln": "str", "vla": "str", "vc": "str", "cb": "str", "hn": "brs", "tpt": "brs", "tbn": "brs", "tuba": "brs",
         "fl": "ww", "ob": "ww", "cl": "ww", "harp": "harp", "glock": "perc"}


def family(name):
    return name.split("_")[0]


def note(name, pitch, t, dur=None, vel=0.7, g=0.0, pan=None, width=None, release=0.35, attack=0.0, env=None,
         lead=0.0, seat=None, bus=None):
    midi = m(pitch) if isinstance(pitch, str) else pitch
    fam = family(name)
    p0, w0 = SEAT[seat or fam]
    y, meta = render_note(name, midi, dur, vel, release, attack, env)
    # short articulations: land the perceived attack (not the first audible sample) on the beat
    add(BUS[bus or BUSOF[fam]], place(y, p0 if pan is None else pan, w0 if width is None else width), t - lead, db(g))


def chord(name, pitches, t, dur=None, **kw):
    for p in pitches:
        note(name, p, t, dur, **kw)


_rr = {}


def rr(key, n=2):
    k = _rr.get(key, 0)
    _rr[key] = k + 1
    return k % n + 1


def shot(rel, t, g=0.0, pan=0.1, width=0.8, ratio=1.0, maxlen=8.0, bus="perc", env=None, tail=None):
    y, _ = one_shot(rel, maxlen, ratio)
    if tail is not None:          # shorten: fade out over `tail` = (start, length) seconds
        a, L = tail
        i0, n1 = int(a * SR), int(L * SR)
        if i0 < len(y):
            k = np.linspace(1, 0, min(n1, len(y) - i0), dtype=np.float32)
            y[i0:i0 + len(k)] *= k[:, None] ** 2
            y[i0 + len(k):] = 0
    if env is not None:
        y = y * env(np.arange(len(y)) / SR).astype(np.float32)[:, None]
    add(BUS[bus], place(y, pan, width), t - PRE, db(g))


# ---- percussion helpers
TIMP_HIT = {1: 89.7, 2: 122.3, 3: 142.7, 4: 168.9, 5: 191.1}      # measured principal tones (Hz)
TIMP_ROLL = {1: 94.2, 2: 127.0, 3: 142.7, 4: 166.2, 5: 201.7}
TIMP_LAYERS = {1: [1, 3], 2: [1, 3, 4], 3: [1, 3, 4], 4: [1, 3, 4], 5: [1, 3, 4]}


def _drum_for(f, table):
    best = None
    for k, f0 in table.items():
        c = abs(np.log2(f / f0)) + (0.0 if f <= f0 else 0.08)      # prefer tuning a drum down
        if best is None or c < best[0]:
            best = (c, k)
    return best[1]


def timp(pitch, t, vel=1.0, g=0.0):
    f = lib.hz(m(pitch))
    k = _drum_for(f, TIMP_HIT)
    lay = TIMP_LAYERS[k]
    v = lay[int(round(np.clip(vel, 0, 1) * (len(lay) - 1)))]
    rel = "Percussion/Timpani/Timpani%d_Hit_v%d_rr%d_Sum.wav" % (k, v, rr(("timp", k, v)))
    shot(rel, t, g, *SEAT["timp"], ratio=f / TIMP_HIT[k], maxlen=6.0)


def timp_roll(pitch, t0, t1, lo=0.08, hi=1.0, curve=2.0, g=0.0, release=0.15, loud=True):
    f = lib.hz(m(pitch))
    k = _drum_for(f, TIMP_ROLL)
    v = {5: 4}.get(k, 5) if loud else 3
    rel = "Percussion/Timpani/Rolls/Timpani%d_Roll_v%d_rr1_Sum.wav" % (k, v)
    x, _ = lib.load_sample(rel, 12.0)
    ratio = f / TIMP_ROLL[k]
    T = t1 - t0
    y = lib.resample_play(x[int(0.3 * SR):], ratio, int((T + release) * SR))     # skip the initial stroke
    tt = np.arange(len(y)) / SR
    e = lo + (hi - lo) * np.clip(tt / T, 0, 1) ** curve
    e *= np.clip(1 - (tt - T) / release, 0, 1)
    y *= e.astype(np.float32)[:, None]
    add(BUS["perc"], place(y, *SEAT["timp"]), t0, db(g + 6))


def bd(t, v=7, g=0.0):
    shot("Percussion/BDrumNewhit_v%d_rr%d_Sum.wav" % (v, rr(("bd", v))), t, g, pan=0.05, width=0.7, maxlen=4.0)


def crash(t, dyn="ff", g=0.0, pan=0.25, tail=None):
    shot("Percussion/cymbal-crash1_%s_rr%d.wav" % (dyn, rr(("crash", dyn))), t, g, pan=pan, width=1.0, maxlen=9.0, tail=tail)


def gong(t, dyn="fff", g=0.0):
    shot("Percussion/gongHit_%s.wav" % dyn, t, g, pan=-0.15, width=0.9, maxlen=12.0)


def swell(t_peak, kind="Short", g=0.0, after=0.12):
    """Suspended-cymbal crescendo placed so that its loudest point lands on t_peak, then cut quickly."""
    peak = {"Short": 1.303, "Median": 3.410, "Long": 7.171}[kind]
    env = lambda tt: np.where(tt < peak, 1.0, np.exp(-(tt - peak) / after))
    y, _ = one_shot("Percussion/susCymb1-cresc-%s_v1.wav" % kind, 14.0)
    y = y * env(np.arange(len(y)) / SR).astype(np.float32)[:, None]
    add(BUS["perc"], place(y, 0.2, 1.0), t_peak - peak, db(g))


def tri(t, g=0.0, kind="Triangle3-Hit_v2"):
    shot("Percussion/%s_rr%d_Sum.wav" % (kind, rr(("tri", kind))), t, g, pan=0.4, width=0.6, maxlen=5.0)


def harp(pitch, t, g=-12.0, dur=2.2, pan=None):
    y, meta = render_note("harp", m(pitch) if isinstance(pitch, str) else pitch, dur, 1.0, 0.9)
    add(BUS["harp"], place(y, SEAT["harp"][0] if pan is None else pan, SEAT["harp"][1]),
        t - PRE, db(g))


def sfx_add(x, t, g=0.0, bus="sfx"):
    add(BUS[bus], x, t, db(g))


# ---- envelopes
def cresc(T, lo=0.05, hi=1.0, p=2.0):
    return lambda t: lo + (hi - lo) * np.clip(t / T, 0, 1) ** p


def sfz(low=0.22, tau=0.1, hold=0.04, T=None, rise=None):
    """Sforzando: full on the attack, drop to `low`; optional crescendo back to `rise` by time T."""
    def e(t):
        y = np.where(t < hold, 1.0, low + (1 - low) * np.exp(-(t - hold) / tau))
        if T is not None and rise is not None:
            y = y + (rise - low) * np.clip((t - 0.3) / max(T - 0.3, 1e-3), 0, 1) ** 2
        return y
    return e


def swell_env(t_pk, lo=0.1, after=0.35, p=2.5, start=0.0, tau=0.25):
    """Crescendo from `start` to the peak at t_pk (relative), then decay toward `after`."""
    def e(t):
        up = lo + (1 - lo) * np.clip((t - start) / max(t_pk - start, 1e-3), 0, 1) ** p
        dn = after + (1 - after) * np.exp(-(t - t_pk) / tau)
        return np.where(t <= t_pk, up, dn)
    return e


B = BEAT
E = BEAT / 2           # eighth
X = BEAT / 4           # sixteenth


# ==================================================================================================== ACT 1 — dawn
def act1():
    # pad: cellos + violas (+ a whisper of bass), soft layer, open fifths / sus2, no thirds
    pads = [  # (inst, note, t0, t1, vel, g)
        ("cb", "D2", 0.0, at(2), 0.0, -14),
        ("vc", "D3", 0.0, at(2), 0.0, -9), ("vc", "A3", 0.0, at(2), 0.0, -11), ("vla", "E4", 0.0, at(2), 0.0, -11),
        ("vc", "G2", at(2), at(3), 0.0, -9), ("vc", "D3", at(2), at(3), 0.0, -11),
        ("vla", "A3", at(2), at(3), 0.0, -11), ("vla", "D4", at(2), at(3), 0.0, -12),
        ("cb", "D2", at(3), at(4), 0.0, -14),
        ("vc", "D3", at(3), at(4), 0.0, -9), ("vc", "A3", at(3), at(4), 0.0, -11), ("vla", "E4", at(3), at(4), 0.0, -11),
        ("vc", "G2", at(4), at(4, 2.5), 0.0, -9), ("vc", "D3", at(4), at(4, 2.5), 0.0, -11),
        ("vla", "A3", at(4), at(4, 2.5), 0.0, -11), ("vla", "D4", at(4), at(4, 2.5), 0.0, -12),
    ]
    for inst, p, t0, t1, v, g in pads:
        first = t0 == 0.0
        note(inst, p, t0, t1 - t0 + (0.0 if first else 0.15), vel=v, g=g, attack=2.2 if first else 0.45,
             release=0.7, lead=0.0 if first else 0.15)

    # harp: rolling eighths in open fifths
    bars = {
        1: ["D3", "A3", "E4", "A4", "D5", "A4", "E4", "A3"],
        2: ["G2", "D3", "A3", "D4", "G4", "D4", "A3", "D3"],
        3: ["D3", "A3", "E4", "A4", None, "E5", "A4", "E4"],
        4: ["G2", "D3", "A3", "D4"],
    }
    for b, ns in bars.items():
        for i, p in enumerate(ns):
            if p is None:
                continue
            t = at(b) + i * E
            g = -15 + (2.5 if i % 4 == 0 else 0) - (3 if b == 1 and i < 2 else 0) - (1.5 * i if b == 4 else 0)
            harp(p, t, g=g, dur=1.9)
    cue(0.0, "Dawn: harp eighths in open fifths (D-A-E / G-D-A), viola+cello pad without thirds; picture fades in 1.2 s")

    # flute melody (D-E-G-A-C pentatonic, no thirds of D)
    mel = [(1, 2, 1.0, "A4"), (1, 3, 1.0, "D5"),
           (2, 0, 2.0, "E5"), (2, 2, 0.5, "D5"), (2, 2.5, 0.5, "C5"), (2, 3, 1.0, "A4"),
           (3, 0, 1.5, "G4"), (3, 1.5, 0.5, "A4"), (3, 2, 2.0, "D5"),
           (4, 0, 1.0, "E5"), (4, 1, 0.5, "D5"), (4, 1.5, 1.6, "A4")]
    for b, bt, d, p in mel:
        note("fl", p, at(b, bt), d * B + 0.04, vel=1.0, g=-10.5, release=0.3, attack=0.03, lead=0.05)
    cue(at(1, 2), "Solo flute enters (pentatonic D-E-G-A-C)")

    # bar 3 beat 3: the lace pulled tight -> harp + pizz pluck
    t = at(3, 2)
    harp("D5", t, g=-4, dur=2.5, pan=-0.15)
    harp("A5", t, g=-7, dur=2.5, pan=-0.1)
    note("vln_pizz", "D5", t - PRE, None, vel=1.0, g=-5, pan=0.05)
    note("vla_pizz", "A4", t - PRE, None, vel=1.0, g=-7, pan=0.15)
    z, pre = sfx.lace_zip()
    sfx_add(place(z, 0.0, 0.3), t - pre, g=-34)
    cue(t, "LACE PULLED TIGHT: harp D5+A5 + violin/viola pizz pluck (+ tiny lace friction into it)")

    # bar 4 beats 3-4: low string swell + timpani roll + cymbal swell into bar 5 (sky darkens)
    t0, t1 = at(4, 2), at(5)
    T = t1 - t0
    for inst, p, g in (("vc", "D2", -3), ("cb", "D2", -2), ("vc", "D3", -6), ("vla", "A3", -10)):
        note(inst, p, t0, T - 0.1, vel=1.0, g=g, env=cresc(T - 0.1, 0.03, 0.75, 2.6), release=0.05)
    note("tbn", "D2", t0, T - 0.1, vel=0.5, g=-8, env=cresc(T - 0.1, 0.02, 0.8, 3.0), release=0.05)
    timp_roll("D2", t0, t1 - 0.09, lo=0.05, hi=0.8, curve=2.2, g=-2, release=0.03)
    swell(t1 - 0.07, "Short", g=-11, after=0.03)
    cue(t0, "Bar 4 beats 3-4: low strings + trombone + timpani roll + suspended-cymbal swell crescendo (sky darkens)")


# ==================================================================================================== ACT 2 — storm
ROOTS = {5: ["D"] * 8, 6: ["D"] * 4 + ["Eb"] * 4, 7: ["D"] * 6 + ["C"] * 2, 8: ["Bb"] * 4 + ["A"] * 4,
         9: ["D"] * 8, 10: ["C"] * 4 + ["A"] * 4}
VC_OCT = {"D": "D3", "Eb": "Eb3", "C": "C3", "Bb": "Bb2", "A": "A2", "F": "F3", "E": "E3"}
CB_OCT = {"D": "D2", "Eb": "Eb2", "C": "C2", "Bb": "Bb1", "A": "A1", "F": "F2", "E": "E2"}
ACC = [1.0, 0.35, 0.5, 0.35, 1.0, 0.35, 0.6, 0.45]


def power(root, octs):
    """Power-chord pitches (root + fifth) in the given octaves, e.g. power('D', [3]) -> ['D3', 'A3']."""
    fifth = {"D": "A", "Eb": "Bb", "C": "G", "Bb": "F", "A": "E", "G": "D", "F": "C"}[root]
    out = []
    for o in octs:
        out.append("%s%d" % (root, o))
        fo = o + (1 if m("%s%d" % (fifth, o)) < m("%s%d" % (root, o)) else 0)
        out.append("%s%d" % (fifth, fo))
    return out


def brass_stab(root, t, g=-4.0, vel=0.85, tuba=True, horns=True, tbn=True, sus=False, length=0.5):
    if tbn:
        chord("tbn_stac", power(root, [2 if root in ("Bb", "A") else 3])[:2], t - PRE, None, vel=vel, g=g)
    if horns:
        chord("hn_stac", power(root, [3 if root in ("Bb", "A") else 4]), t - PRE, None, vel=vel, g=g - 1)
    if tuba:
        note("tuba_stac", CB_OCT[root], t - PRE, None, vel=vel, g=g + 1)
    if sus:
        env = sfz(0.2, 0.09)
        chord("tbn", power(root, [2 if root in ("Bb", "A") else 3])[:2], t, length, vel=1.0, g=g - 2, env=env, release=0.25)
        chord("hn", power(root, [3 if root in ("Bb", "A") else 4]), t, length, vel=1.0, g=g - 3, env=env, release=0.25)


def tutti(t, bass, lowbrass, horns, tpts, vln, vla, g=0.0, length=0.55, low=0.25, tau=0.11, perc=True, cym="ff",
          gong_=False, timp_note=None):
    """A massive hit: stac + sfz sustains in the brass, spiccato + sfz strings, BD + timpani + cymbal."""
    env = sfz(low, tau)
    note("tuba_stac", bass, t - PRE, None, vel=1.0, g=g + 1)
    note("tuba", bass, t, length, vel=1.0, g=g - 3, env=env, release=0.3)
    note("cb_spic", bass, t - PRE, None, vel=1.0, g=g + 2)
    note("vc_spic", lowbrass[0], t - PRE, None, vel=1.0, g=g + 1)
    for p in lowbrass:
        note("tbn_stac", p, t - PRE, None, vel=1.0, g=g)
        note("tbn", p, t, length, vel=1.0, g=g - 3, env=env, release=0.3)
    for p in horns:
        note("hn_stac", p, t - PRE, None, vel=1.0, g=g - 1)
        note("hn", p, t, length, vel=1.0, g=g - 3, env=env, release=0.3)
    for p in tpts:
        note("tpt_stac", p, t - PRE, None, vel=1.0, g=g - 2)
        note("tpt", p, t, length, vel=1.0, g=g - 5, env=env, release=0.3)
    for p in vln:
        note("vln_spic", p, t - PRE, None, vel=1.0, g=g - 1)
        note("vln", p, t, length, vel=1.0, g=g - 6, env=env, release=0.3)
    for p in vla:
        note("vla_spic", p, t - PRE, None, vel=1.0, g=g - 1)
    if perc:
        bd(t, 7, g=g + 1)
        timp(timp_note or bass if m(timp_note or bass) >= m("D2") else "D2", t, 1.0, g=g + 1)
        if cym:
            crash(t, cym, g=g - 3)
        if gong_:
            gong(t, "fff", g=g - 2)


def ostinato():
    for b, roots in ROOTS.items():
        for i, r in enumerate(roots):
            t = at(b) + i * E
            a = ACC[i]
            if b == 8:            # rocks on beats 2 and 4 -> accents there
                a = [0.5, 0.35, 1.0, 0.35, 0.5, 0.35, 1.0, 0.45][i]
            gsec = -3.0 if b == 7 else 0.0          # duck under the sandfly swarm
            vcn = VC_OCT[r]
            if b == 5 and i == 6:
                vcn = "F3"                           # minor-third pickup
            if b == 5 and i == 7:
                vcn = "E3"
            v = 1.0 if a >= 0.9 else 0.3
            note("vc_spic", vcn, t - PRE, None, vel=v, g=-7 + 7 * (a - 1) * 0.8 + gsec)
            note("cb_spic", CB_OCT[r], t - PRE, None, vel=v, g=-6 + 7 * (a - 1) * 0.8 + gsec)
            if b in (9, 10):
                note("vla_spic", VC_OCT[r].replace("3", "4").replace("2", "3"), t - PRE, None, vel=v,
                     g=-11 + 6 * (a - 1) + gsec)
    cue(at(5), "Storm ostinato: cello + bass spiccato eighths (D minor / Phrygian), accents on beats 1 and 3")


def act2():
    ostinato()
    # ---- bar 5: the storm hits; lightning on beat 3
    brass_stab("D", at(5), g=0, sus=True, length=0.6)
    timp("D2", at(5), 1.0, g=1)
    bd(at(5), 7, g=-1)
    crash(at(5), "ff", g=-6)
    cue(at(5), "Bar 5 downbeat: storm entrance (brass stab, timpani, BD, crash mf) — sky dark")
    t = at(5, 2)
    tutti(t, "D2", ["D3", "A3"], ["D4", "A4"], ["D5", "F5"], ["A4", "D5", "F5"], ["A3", "D4"], g=0.0, length=0.9)
    sfx_add(sfx.thunder(seed=4, dur=4.5, crack=1.0, pan=0.3), t, g=-4)
    sfx_add(sfx.thunder(seed=44, dur=1.2, crack=0.5, pan=0.15), at(5, 2.35), g=-14)
    cue(t, "LIGHTNING: tutti D minor sfz (brass + strings), BD, crash ff, timpani D, thunder crack + roll")
    cue(at(5, 2.35), "second flash: small thunder crackle")
    # horn answer
    note("hn", "D4", at(5, 3), B, vel=0.6, g=-9, release=0.2)

    # ---- bar 6: flood; the wave on beat 3 (Phrygian bII)
    brass_stab("D", at(6), g=-5)
    timp("D2", at(6), 0.6, g=-4)
    t = at(6, 2)
    env = sfz(0.3, 0.14)
    note("tuba_stac", "Eb2", t - PRE, None, vel=1.0, g=1)
    note("tuba", "Eb2", t, 1.1, vel=1.0, g=-1, env=env)
    for p in ("Eb3", "Bb3"):
        note("tbn_stac", p, t - PRE, None, vel=1.0, g=0)
        note("tbn", p, t, 1.1, vel=1.0, g=-2, env=env)
    for p in ("Eb4", "Bb4"):
        note("hn", p, t, 1.1, vel=1.0, g=-4, env=env)
        note("hn_stac", p, t - PRE, None, vel=1.0, g=-2)
    bd(t, 7, g=1)
    timp("Eb2", t, 1.0, g=0)
    sfx_add(sfx.water_crash(seed=5, pan=0.1), t, g=-5)
    cue(t, "FLOOD WAVE: low brass Eb power chord sfz (tuba, trombones, horns), BD, timpani Eb, water crash")

    # ---- bar 7: sandflies — violin tremolo cluster, densest on beat 3
    brass_stab("D", at(7), g=-7, tuba=False)
    note("hn", "D4", at(7), 2 * B, vel=0.6, g=-8, release=0.2)
    note("hn", "Eb4", at(7, 2), 2 * B, vel=0.6, g=-10, release=0.3)
    tv = at(7, 2)
    tr = [("C6", at(7, 0.3), at(8, 0.0)), ("D6", at(7, 0.65), at(7, 3.8)), ("Eb6", at(7, 1.1), at(7, 3.3)),
          ("A5", at(7, 1.5), at(7, 2.8))]
    for p, a, z in tr:
        T = z - a
        k = tv - a
        e = (lambda k_, T_: (lambda tt: np.where(tt < k_, 0.12 + 0.88 * np.clip(tt / k_, 0, 1) ** 2,
                                                  0.3 + 0.7 * np.exp(-(tt - k_) / 0.15)) * np.clip((T_ - tt) / 0.3 + 0.0, 0, 1) ** 0.5))(k, T)
        note("vln_trem", p, a, T, vel=1.0, g=-6, env=e, release=0.25)
    for p, a in (("G4", at(7, 0.8)), ("A4", at(7, 1.3))):
        k = tv - a
        note("vla_trem", p, a, at(7, 3.5) - a, vel=1.0, g=-9,
             env=(lambda k_: (lambda tt: np.where(tt < k_, 0.15 + 0.85 * (tt / k_) ** 2, 0.4 + 0.6 * np.exp(-(tt - k_) / 0.3))))(k),
             release=0.3)
    timp("D2", tv, 0.7, g=-3)
    sw = sfx.sandflies(dur=at(8) + 0.1 - at(7, 0.3), t_vortex=tv - at(7, 0.3), t_in=0.0, seed=6)
    sfx_add(sw, at(7, 0.3), g=-19)
    cue(at(7, 0.3), "Sandfly swarm buzz enters; violin tremolo cluster (C6 D6 Eb6 Bb5) + viola trem build")
    cue(tv, "SANDFLY VORTEX: tremolo cluster + buzz densest, horns move to Eb (b2), soft timpani")

    # ---- bar 8: scree; rocks on beats 2 and 4
    brass_stab("Bb", at(8), g=-6)
    note("hn", "F4", at(8), 2 * B, vel=0.6, g=-9, release=0.2)
    note("hn", "E4", at(8, 2), 2 * B, vel=0.6, g=-9, release=0.2)
    for t, tp, run in ((at(8, 1), "Bb2", ["F5", "Eb5", "C5"]), (at(8, 3), "A2", ["Bb5", "G5", "E5"])):
        timp(tp, t, 1.0, g=4)
        timp(tp, t + X, 0.4, g=-5)
        bd(t, 4, g=-6)
        sfx_add(sfx.rock_clatter(seed=int(t * 10), pan_from=-0.7 if t < 20 else 0.7, pan_to=0.6 if t < 20 else -0.6), t, g=-5)
        for j, p in enumerate(run):
            note("vln_spic", p, t + j * X - PRE, None, vel=1.0 if j == 0 else 0.3, g=-6 - 3 * j)
        cue(t, "ROCK: timpani %s (+ grace) + rock clatter + violin spiccato bounce %s" % (tp, "-".join(run)))

    # ---- bar 9: snow pass; avalanche release on beat 1, engulf on beat 3
    t0, t1 = at(9), at(9, 2)
    brass_stab("D", t0, g=-1)
    timp("D2", t0, 1.0, g=3)
    bd(t0, 6, g=-3)
    T = t1 - t0
    for inst, p, g in (("hn", "D4", -5), ("hn", "A4", -6), ("tbn", "D3", -4), ("tbn", "A3", -5), ("vln_trem", "D5", -6),
                       ("vln_trem", "A5", -7), ("vla_trem", "D4", -8)):
        note(inst, p, t0 + 0.05, T - 0.05, vel=1.0, g=g, env=cresc(T, 0.06, 1.0, 2.4), release=0.08)
    timp_roll("D2", t0 + 0.2, t1, lo=0.1, hi=1.0, curve=2.0, g=-3)
    swell(t1, "Short", g=-10, after=0.05)
    tutti(t1, "D2", ["D3", "A3"], ["D4", "A4", "D5"], ["D5", "F5"], ["A4", "D5", "F5"], ["A3", "D4"], g=0.5,
          length=1.0, low=0.3, tau=0.18, gong_=True)
    av = sfx.avalanche(t_rel=0.0, t_hit=t1 - t0, t_clear=at(9, 3.4) - t0, dur=at(10) - t0 + 0.6, seed=3)
    sfx_add(av, t0, g=-6)
    cue(t0, "AVALANCHE RELEASE: brass stab + timpani D; slab crack + whumpf; horns/trombones/violin trem crescendo + timp roll")
    cue(t1, "AVALANCHE ENGULFS: tutti D minor + GONG + BD + crash ff + timpani; white roar")

    # ---- bar 10: red crater gale; gust on beat 3 (brass swell)
    brass_stab("C", at(10), g=-5)
    timp("C3", at(10), 0.8, g=-3)
    note("hn", "G4", at(10), 2 * B, vel=0.6, g=-9, release=0.2)
    tg = at(10, 2)
    k = tg - at(10, 1)
    for inst, p, g in (("hn", "A3", -3), ("hn", "E4", -4), ("hn", "A4", -6), ("tbn", "A2", -3), ("tbn", "E3", -4), ("tuba", "A1", -4)):
        note(inst, p, at(10, 1), at(11) - at(10, 1), vel=1.0, g=g,
             env=swell_env(k - 0.05, lo=0.06, after=0.25, p=2.6, tau=0.1), release=0.1)
    swell(tg, "Short", g=-8, after=0.06)
    timp("A2", tg, 0.6, g=-9)
    timp_roll("A2", at(10, 3), at(11), lo=0.1, hi=1.0, curve=2.0, g=-4)
    shot("Percussion/Snare2-rollNS_v5_rr1_Sum.wav", at(10, 3), g=-14, pan=0.15, width=0.6, maxlen=8.0,
         env=lambda tt: (0.05 + 0.95 * np.clip(tt / (at(11) - at(10, 3)), 0, 1) ** 2) * (tt < at(11) - at(10, 3)))
    cue(tg, "GALE GUST: horns + trombones + tuba swell peaking on the beat, timpani A, cymbal swell + wind gust")

    # wind beds: snow pass + gale (gust peak on tg)
    w1 = sfx.wind(at(10) - at(9) + 0.05, lambda tt: 0.35 + 0.1 * np.sin(tt), seed=101, whistle=0.5)
    sfx_add(sfx.norm(w1) * np.clip(np.arange(len(w1))[:, None] / (0.03 * SR), 0, 1), at(9), g=-14)
    gd = at(11) - at(10)
    w2 = sfx.wind(gd + 0.02, lambda tt: 0.55 + 0.95 * np.exp(-0.5 * ((tt - (tg - at(10)) + 0.02) / 0.28) ** 2), seed=102, whistle=1.0)
    sfx_add(sfx.norm(w2), at(10), g=-3)

    # ---- bar 11: the montage, four tutti hits on every beat (with whooshes and each element)
    hits = [
        (at(11, 0), "D2", ["D3", "A3"], ["D4", "A4"], ["D5"], ["D5", "A5"], ["A3", "D4"], "ff", "D2"),
        (at(11, 1), "D2", ["D3", "A3"], ["D4", "A4"], ["F5"], ["D5", "F5"], ["A3", "D4"], None, "D2"),
        (at(11, 2), "D2", ["D3", "A3"], ["A4", "D5"], ["A5"], ["A5", "D6"], ["D4", "A4"], None, "D2"),
        (at(11, 3), "Eb2", ["Eb3", "Bb3"], ["F4", "Bb4"], ["Eb5"], ["Eb5", "F5", "Bb5"], ["Bb3", "F4"], "ff", "Eb2"),
    ]
    for i, (t, bs, lb, hn, tp, vl, va, cy, tn) in enumerate(hits):
        tutti(t, bs, lb, hn, tp, vl, va, g=-0.5 + 0.5 * i, length=0.5, low=0.22, tau=0.09, cym=cy, timp_note=tn)
        if cy is None:
            shot("Percussion/susCymb1-hit_fff_rr%d.wav" % rr("sush"), t, g=-6, pan=0.3, width=1.0, maxlen=4.0)
        w, pre = sfx.whoosh(pre=0.3, post=0.22, seed=200 + i, pan_from=(-0.7 if i % 2 == 0 else 0.7), pan_to=(0.5 if i % 2 == 0 else -0.5))
        sfx_add(w, t - pre, g=-19)
    sfx_add(sfx.thunder(seed=11, dur=0.9, crack=1.0, pan=-0.3), hits[0][0], g=-9)
    sfx_add(sfx.water_crash(seed=12, dur=0.8, pan=0.2), hits[1][0], g=-9)
    av2 = sfx.avalanche(t_rel=0.0, t_hit=0.0, t_clear=0.55, dur=0.75, seed=13)
    sfx_add(av2, hits[2][0], g=-10)
    w4 = sfx.wind(0.7, lambda tt: 1.4 * np.exp(-tt / 0.3) * (1 - np.exp(-tt / 0.02)), seed=14, whistle=1.0)
    sfx_add(sfx.norm(w4) * np.linspace(1, 0, len(w4))[:, None] ** 0.5, hits[3][0], g=-2)
    for i, h in enumerate(hits):
        cue(h[0], "MONTAGE HIT %d/4: tutti (%s) + BD + timpani + %s + whoosh + %s" % (
            i + 1, ["Dm, top D", "Dm, top F", "D5, top A", "Eb sus2 (Phrygian bII)"][i],
            "crash ff" if h[7] else "suspended cymbal fff",
            ["lightning crack", "water crash", "avalanche roar", "wind gust"][i]))

    # ---- bar 12: eye close-up — suspended cluster, timpani roll crescendo, low thunder on the flashes
    t0 = at(12)
    for inst, p, g, v in (("vln", "D6", -4, 0.0), ("vln", "Eb6", -5, 0.0), ("vla_trem", "A4", -7, 0.0),
                          ("vc_trem", "D3", -4, 0.0), ("cb", "D2", -2, 0.0)):
        note(inst, p, t0, at(13) - t0 + 0.1, vel=v, g=g, attack=0.25, env=cresc(BAR, 0.6, 1.0, 1.5), release=0.15)
    timp_roll("D2", t0 + 0.05, at(14), lo=0.1, hi=1.0, curve=2.4, g=-3, release=0.003)
    for i, tt in enumerate((at(12, 1), at(12, 2.25), at(12, 3.5))):
        sfx_add(sfx.thunder(seed=30 + i, dur=1.8, distant=True), tt, g=-10)
        cue(tt, "low distant thunder (flash %d)" % (i + 1))
    cue(t0, "EYE: suspended cluster (violins D6+Eb6, viola trem, cello trem, bass D2), timpani roll begins (p) -> crescendo to the cut")

    # ---- bar 13: the spiral — rising strings, everything building, hard cut at bar 14
    t0, t1 = at(13), at(14)
    penta = ["D", "E", "G", "A", "C"]
    def sp(o, kk):
        nn = penta[kk % 5]
        return "%s%d" % (nn, o + kk // 5 + (1 if nn == "C" else 0))
    run = list(range(12)) + [10, 11, 10, 11]          # 12 steps up, then a measured D-E trill at the top
    for k, kk in enumerate(run):
        t = t0 + k * X
        vel = 0.3 if k < 6 else 1.0
        g = -12 + 11 * (k / 15)
        note("vln_spic", sp(4, kk), t - PRE, None, vel=vel, g=g)
        note("vla_spic", sp(3, kk), t - PRE, None, vel=vel, g=g - 2)
        note("vc_spic", sp(2, kk), t - PRE, None, vel=vel, g=g - 1)
    for inst, p, g in (("hn", "D4", -4), ("hn", "A4", -5), ("tbn", "D3", -4), ("tbn", "A3", -5), ("tuba", "D2", -4),
                       ("cb", "D2", -4), ("vln_trem", "D6", -8), ("vln_trem", "A5", -9)):
        note(inst, p, t0, t1 - t0, vel=1.0, g=g, env=cresc(t1 - t0, 0.05, 1.0, 2.3), release=0.003)
    for p, g in (("D5", -7), ("Eb5", -8)):
        note("tpt", p, at(13, 2), t1 - at(13, 2), vel=1.0, g=g, env=cresc(t1 - at(13, 2), 0.05, 1.0, 2.0), release=0.003)
    swell(t1, "Median", g=-3, after=0.002)
    shot("Percussion/Snare2-rollNS_v5_rr1_Sum.wav", at(13, 2), g=-12, pan=0.15, width=0.6, maxlen=8.0,
         env=lambda tt: 0.05 + 0.95 * np.clip(tt / (2 * B), 0, 1) ** 2)
    sp_w = sfx.wind(t1 - t0, lambda tt: 0.3 + 0.9 * np.clip(tt / (t1 - t0), 0, 1) ** 1.5, seed=103, whistle=1.2, pan_rate=0.9)
    sfx_add(sfx.norm(sp_w), t0, g=-5)
    sfx_add(sfx.riser(t1 - t0 + 0.0, seed=171), t0, g=-22)
    cue(t0, "SPIRAL: strings rise in 16ths on the dawn pentatonic D-E-G-A-C (3 octaves, measured trill at the top), horns/trombones/tuba + trumpets D-Eb crescendo, "
            "timpani + snare rolls, cymbal swell peaking at the cut, spiral wind + riser")
    cue(t1, "HARD CUT TO SILENCE (music, SFX and reverb tails gated in 2 ms)")

    # ---- storm SFX beds (rain per shot density, surf, flood roar)
    dens = [(at(5), at(6), 0.35), (at(6), at(7), 0.5), (at(8), at(9), 1.0), (at(11), at(11, 1), 0.6), (at(12), at(13), 0.3)]
    r0, r1 = at(5), at(13)
    def dfn(tt):
        x = np.zeros_like(tt)
        for a, b, d in dens:
            x += d * np.clip((tt - (a - r0)) / 0.03, 0, 1) * np.clip(((b - r0) - tt) / 0.03, 0, 1)
        return x
    sfx_add(sfx.rain(r1 - r0, dfn, seed=21), r0, g=-35)
    su = sfx.surf(at(6) - at(5) + 0.03, seed=31)
    su[-int(0.03 * SR):] *= np.linspace(1, 0, int(0.03 * SR))[:, None]
    sfx_add(su, at(5), g=-27)
    fr = sfx.flood_roar(at(7) - at(6) + 0.03, surge_t=at(6, 2) - at(6), seed=41)
    fr[:int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))[:, None]
    fr[-int(0.03 * SR):] *= np.linspace(1, 0, int(0.03 * SR))[:, None]
    sfx_add(fr, at(6), g=-20)
    fr2 = sfx.flood_roar(at(11, 2) - at(11, 1), surge_t=0.05, seed=42)
    fr2[-int(0.03 * SR):] *= np.linspace(1, 0, int(0.03 * SR))[:, None]
    sfx_add(fr2, at(11, 1), g=-22)
    # darkening wind at the end of act 1
    dw = sfx.wind(at(5) - at(4, 2) + 0.4, lambda tt: 0.15 + 0.6 * np.clip(tt / 1.4, 0, 1) ** 2, seed=104, whistle=0.4)
    sfx_add(sfx.norm(dw), at(4, 2), g=-17)


# ==================================================================================================== ACT 3 — silence, the step, the trail
def bar14_whisper():
    """The only sound in bar 14: a whisper of wind when the beanie lifts (~34.9 s). Added after the hard-cut gate."""
    t0 = at(14, 0.25)
    d = 2.3
    w = sfx.wind(d, lambda tt: 0.25 * np.exp(-0.5 * ((tt - 0.45) / 0.3) ** 2) + 0.12 * np.exp(-0.5 * ((tt - 1.2) / 0.4) ** 2),
                 seed=105, whistle=0.6, pan_rate=0.25, base=0.8)
    w = sfx.fade_edges(w, 0.05, 0.4)
    return w, t0


def harp_gliss(t0, t1, lo="D3", hi="D6", g=-15, scale=(2, 4, 6, 7, 9, 11, 13)):
    """D major harp glissando (scale degrees as semitones above C... we use D major pitch classes)."""
    pcs = {2, 4, 6, 7, 9, 11, 1}       # D E F# G A B C#
    ns = [k for k in range(m(lo), m(hi) + 1) if k % 12 in pcs]
    if t1 < t0:
        ns = ns[::-1]
        t0, t1 = t1, t0
    for i, k in enumerate(ns):
        t = t0 + (t1 - t0) * (i / max(len(ns) - 1, 1)) ** 0.9
        note("harp", k, t - PRE, 1.2, vel=1.0, g=g + 3 * (i / len(ns)), release=0.6)


VOICE = {  # chord voicings for the D major theme: (bass, cellos, violas, violins II)
    "D": ("D2", ["D3", "A3"], ["F#4", "A4"], ["D5"]),
    "Bm": ("B1", ["B2", "F#3"], ["D4", "F#4"], ["B4"]),
    "G": ("G1", ["G2", "D3"], ["B3", "D4"], ["G4", "B4"]),
    "D/F#": ("F#2", ["D3", "A3"], ["F#4", "A4"], ["D5"]),
    "Em7": ("E2", ["E3", "B3"], ["G4", "B4"], ["D5"]),
    "Asus4": ("A1", ["A2", "E3"], ["D4", "E4"], ["A4"]),
    "A": ("A1", ["A2", "E3"], ["C#4", "E4"], ["A4"]),
    "Dadd9": ("D2", ["D3", "A3"], ["E4", "F#4"], ["A4", "D5"]),
}


def strings_chord(name, t, dur, g=-4.0, vel=0.9, attack=0.06, release=0.45, lead=0.04):
    bs, vc, va, v2 = VOICE[name]
    note("cb", bs, t, dur, vel=vel, g=g, attack=attack, release=release, lead=lead)
    for p in vc:
        note("vc", p, t, dur, vel=vel, g=g - 1, attack=attack, release=release, lead=lead)
    for p in va:
        note("vla", p, t, dur, vel=vel, g=g - 2, attack=attack, release=release, lead=lead)
    for p in v2:
        note("vln", p, t, dur, vel=vel, g=g - 2, attack=attack, release=release, lead=lead, seat="vln2")


def act3():
    # ---------------------------------------------------------------- 37.333 THE STEP: the first major chord
    t = at(15)
    hold = 2 * B
    env_b = sfz(0.55, 0.35)
    # brass
    note("tuba_stac", "D2", t - PRE, None, vel=1.0, g=2)
    note("tuba", "D2", t, hold, vel=1.0, g=0, env=env_b, release=0.5)
    for p in ("D3", "F#3", "A3"):
        note("tbn_stac", p, t - PRE, None, vel=1.0, g=0)
        note("tbn", p, t, hold, vel=1.0, g=-1, env=env_b, release=0.5)
    for p in ("D4", "F#4", "A4", "D5"):
        note("hn_stac", p, t - PRE, None, vel=1.0, g=-1)
        note("hn", p, t, hold, vel=1.0, g=-2, env=env_b, release=0.5)
    for p in ("A4", "D5", "F#5"):
        note("tpt_stac", p, t - PRE, None, vel=1.0, g=-2)
        note("tpt", p, t, hold, vel=1.0, g=-4, env=env_b, release=0.5)
    # strings: spiccato attack + full sustain
    for inst, ps, g in (("cb_spic", ["D2"], 2), ("vc_spic", ["D3", "A3"], 0), ("vla_spic", ["F#4", "A4"], -1),
                        ("vln_spic", ["D5", "F#5", "A5"], -1)):
        chord(inst, ps, t - PRE, None, vel=1.0, g=g)
    strings_chord("D", t, BAR, g=-1, vel=1.0, attack=0.0, lead=0.0)
    chord("vln", ["F#5", "A5", "D6"], t, BAR, vel=1.0, g=-4, release=0.4)
    # winds
    chord("fl", ["D6", "A6"], t, BAR, vel=1.0, g=-8, release=0.4)
    note("ob", "F#5", t, BAR, vel=1.0, g=-9, release=0.4)
    chord("cl", ["A4", "D5"], t, BAR, vel=1.0, g=-10, release=0.4)
    # percussion + sub
    timp("D2", t, 1.0, g=2)
    bd(t, 7, g=2)
    crash(t, "ff", g=-1, pan=0.3)
    crash(t, "ff", g=-3, pan=-0.3)
    gong(t, "fff", g=-1)
    sfx_add(sfx.sub_boom(), t, g=0, bus="sfx_dry")
    sfx_add(sfx.grass_wave(), t, g=-20)
    harp_gliss(t + 0.06, t + 0.85, "D3", "D6", g=-11)
    cue(t, "THE STEP — FIRST MAJOR CHORD: D major fff tutti (brass stac + sfz sustains, strings, winds), "
           "timpani D + BD + 2 crashes + gong + sub boom; harp glissando up; tussock shockwave rustle")

    # ---------------------------------------------------------------- heroic D major theme (bars 15-18)
    prog = [(at(15), BAR, "D"), (at(16), 2 * B, "Bm"), (at(16, 2), 2 * B, "G"), (at(17), 2 * B, "D/F#"),
            (at(17, 2), 2 * B, "Em7"), (at(18), 2 * B, "G"), (at(18, 2), B, "Asus4"), (at(18, 3), B, "A")]
    for t0, d, name in prog[1:]:
        soft = t0 >= at(17, 2)
        g = {True: -9, False: -3}[soft]
        if t0 >= at(18, 2):
            g = -7 + (2 if name == "A" else 0)
        if soft:
            g += 3
        strings_chord(name, t0, d + (0.0 if t0 + d == at(17, 2) else (-0.04 if abs(t0 + d - at(19)) < 1e-6 else 0.05)), g=g, vel=0.5 if soft else 0.9,
                      attack=0.25 if soft else 0.05, lead=0.0 if soft else 0.04,
                      release=0.12 if abs(t0 + d - at(17, 2)) < 1e-6 else (0.06 if abs(t0 + d - at(19)) < 1e-6 else 0.45))
        if soft and t0 == at(18):
            pass
    # low brass warmth under bars 15-16
    for t0, d, ps in ((at(15, 2), 2 * B, ["D3", "A3"]), (at(16), 2 * B, ["B2", "F#3"]), (at(16, 2), 2 * B, ["G2", "D3"]),
                      (at(17), 2 * B, ["F#2", "D3"])):
        chord("tbn", ps, t0, d - (0.05 if t0 == at(17) else -0.05), vel=0.5, g=-9, attack=0.05,
              release=0.12 if t0 == at(17) else 0.3)
    # melody: trumpet + horns (unison), violins I double
    mel = [(15, 0.0, 1.5, "D5"), (15, 1.5, 0.5, "A4"), (15, 2.0, 1.5, "D5"), (15, 3.5, 0.5, "E5"),
           (16, 0.0, 1.5, "F#5"), (16, 1.5, 0.5, "E5"), (16, 2.0, 1.0, "D5"), (16, 3.0, 1.0, "B4"),
           (17, 0.0, 1.5, "A4"), (17, 1.5, 0.5, "D5"), (17, 2.0, 2.0, "E5"),
           (18, 0.0, 2.0, "D5"), (18, 2.0, 2.0, "E5")]
    for b, bt, d, p in mel:
        t0 = at(b, bt)
        if t0 < at(15, 1.5):
            continue                      # the hit chord already carries the first D
        soft = t0 >= at(17, 2)
        gt = -6 if not soft else -14
        ld = 0.0 if soft else 1.0
        rl = 0.1 if abs(t0 + d * B - at(17, 2)) < 1e-6 else (0.05 if abs(t0 + d * B - at(19)) < 1e-6 else 0.3)
        at_ = 0.12 if soft else 0.0
        if b < 18:
            note("tpt", p, t0, d * B + 0.03, vel=1.0 if not soft else 0.0, g=gt, release=rl, lead=0.015 * ld, attack=at_)
        note("hn", p, t0, d * B + 0.03, vel=0.9 if not soft else 0.3, g=-5 if not soft else -11, release=rl, lead=0.02 * ld, attack=at_)
        note("hn", m(p) - 12, t0, d * B + 0.03, vel=0.9 if not soft else 0.3, g=-8 if not soft else -14, release=rl, lead=0.02 * ld, attack=at_)
        if not soft:
            note("vln", p, t0, d * B + 0.05, vel=1.0, g=-6, release=min(rl, 0.35), lead=0.06)
            note("vln", m(p) + 12, t0, d * B + 0.05, vel=1.0, g=-10, release=min(rl, 0.35), lead=0.06)
        else:
            note("vln", p, t0, d * B + 0.05, vel=0.0, g=-11, release=0.4, attack=0.2)
    cue(at(15, 1.5), "Heroic D major theme: trumpet + horns (melody), violins I in octaves, lush strings "
                     "(D | Bm G | D/F# Em7 | G Asus4 A | D)")
    # timpani + harp support on the bar lines
    timp("D2", at(16), 0.6, g=-5)
    timp("D2", at(17), 0.5, g=-7)
    harp_gliss(at(16, 3.5), at(17) - 0.03, "A3", "A5", g=-17)

    # ---------------------------------------------------------------- the trail lights: rising glock/celesta shimmer
    penta = [k for k in range(m("A5"), m("B7") + 1) if k % 12 in (2, 4, 6, 9, 11)]
    zig = [0, 2, 1, 3]
    t_lights = [39.0 + 4.667 * i / 47 for i in range(48)]
    for i, tl in enumerate(t_lights):
        k = min(int(round(i * 7 / 47)) + zig[i % 4], len(penta) - 1)
        p = penta[k]
        note("glock", p, tl - PRE, None, vel=1.0, g=-17 + 4 * (i / 47), pan=0.35 - 0.7 * (i / 47), width=0.3)
        cel = sfx.celesta(lib.hz(p - 12), dur=1.2)
        add(BUS["perc"], place(cel, 0.3 - 0.6 * (i / 47), 0.2), tl, db(-37 + 4 * (i / 47)))
    beats = [b for b in (at(15, 3), at(16), at(16, 1), at(16, 2), at(16, 3), at(17), at(17, 1)) if 39.0 <= b <= 43.7]
    for j, tb in enumerate(beats):
        p = ["D6", "A6", "E6", "D7", "F#6", "A6", "D7"][j % 7]
        note("glock", p, tb - PRE, None, vel=1.0, g=-12, pan=0.0, width=0.3)
        tri(tb, g=-19)
        harp(["D5", "A5", "E5", "D6", "F#5", "A5", "D6"][j % 7], tb, g=-15)
    cue(39.0, "TRAIL LIGHTS 0..47: one glockenspiel note per light (t_i = 39.0 + 4.667*i/47), rising D major "
              "pentatonic A5 -> B7, celesta (FM) doubling; accents (glock + triangle + harp) on every beat")
    # high air bed under the island shot
    ab = sfx.wind(at(17, 2) - at(15, 2), lambda tt: 0.18 + 0.05 * np.sin(tt * 1.3), seed=106, whistle=0.2, pan_rate=0.05)
    sfx_add(sfx.fade_edges(sfx.norm(ab), 0.3, 0.4), at(15, 2), g=-24)

    # ---------------------------------------------------------------- 44.0 last light at Bluff
    t = 44.0
    note("glock", "D7", t - PRE, None, vel=1.0, g=2, pan=0.2, width=0.3)
    note("glock", "A6", t - PRE, None, vel=1.0, g=-4, pan=0.25, width=0.3)
    harp("D6", t, g=-6, dur=2.0)
    tri(t, g=0, kind="Triangle6-Hit_v2")
    cue(t, "LAST LIGHT AT BLUFF: glock D7 + A6 + triangle ding (bar 17 beat 3; S16 cut). shots.js markerLit = at(17,2.3) = 44.2")
    lap = sfx.water_lap(at(18, 3) - at(17, 2), seed=161)
    sfx_add(sfx.fade_edges(lap, 0.2, 0.5), at(17, 2), g=-20)

    # ---------------------------------------------------------------- 45.333 beanie lands
    t = at(18)
    note("vc_pizz", "G2", t - PRE, None, vel=1.0, g=-1, pan=0.1, lead=0.022)
    note("vc_pizz", "G3", t - PRE, None, vel=0.0, g=-6, pan=0.1)
    harp("G2", t, g=-3, dur=2.0)
    harp("D3", t, g=-8, dur=2.0)
    sfx_add(sfx.soft_thump(seed=151), t, g=-21)
    cue(t, "BEANIE LANDS: soft cello pizz 'pom' (G2+G3) + harp G2/D3 + fabric fwump; music drops to p (G major)")

    # ---------------------------------------------------------------- bar 18 beats 3-4: lift into the final chord
    t0, t1 = at(18, 2), at(19)
    timp_roll("A2", t0, at(18, 3) - 0.04, lo=0.08, hi=0.7, curve=2.2, g=-8, release=0.02)
    harp_gliss(at(18, 3.3), t1 - 0.04, "A4", "A6", g=-18)
    swell(t1 - 0.05, "Short", g=-19, after=0.03)
    for p, tl, gg in (("A2", at(18, 3), 1), ("E3", at(18, 3.25), 5)):          # "ta-DA"
        note("vc_pizz", p, tl - PRE, None, vel=1.0, g=gg, pan=0.2, lead=0.015)
        note("vla_pizz", m(p) + 12, tl - PRE, None, vel=1.0, g=gg - 4, pan=0.15, lead=0.015)
        timp("A2" if p == "A2" else "E3", tl, 0.8 if p == "A2" else 1.0, g=-2 if p == "A2" else 1)
    harp("A3", at(18, 3), g=-8)
    harp("E4", at(18, 3.25), g=-8)
    cue(t0, "LIFT: timpani roll A + harp glissando + strings Asus4 -> A crescendo")
    cue(at(18, 3), "Title 'T' slams: cello pizz A2 + timpani A + harp")
    cue(at(18, 3.25), "Title 'A' slams: cello pizz E3 + soft timpani + harp")

    # ---------------------------------------------------------------- 48.0 the final chord (dot pops)
    t = at(19)
    dur = 2.0
    strings_chord("Dadd9", t, dur, g=-3, vel=0.9, attack=0.0, release=1.0, lead=0.0)
    chord("vln", ["F#5", "A5", "D6"], t, dur, vel=0.9, g=-6, release=1.0)
    chord("hn", ["D4", "F#4", "A4"], t, dur, vel=0.7, g=-7, release=1.0)
    note("tbn", "D3", t, dur, vel=0.5, g=-10, release=1.0)
    chord("fl", ["A5", "E6"], t, dur, vel=1.0, g=-12, release=0.9)
    note("cl", "F#5", t, dur, vel=0.5, g=-13, release=0.9)
    for i, p in enumerate(["D2", "A2", "D3", "F#3", "A3", "E4", "F#4", "A4", "D5", "E5", "A5"]):
        harp(p, t + i * 0.045, g=-9 - 0.3 * i, dur=2.6)
    note("glock", "D6", t - PRE, None, vel=1.0, g=0, pan=0.0, width=0.3)
    note("glock", "A6", t - PRE, None, vel=1.0, g=-4, pan=0.05, width=0.3)
    timp("D2", t, 1.0, g=1)
    bd(t, 6, g=-3)
    crash(t, "mp", g=-7, pan=0.2)
    shot("Percussion/susCymb1-hit_mp_rr1.wav", t, g=-10, pan=0.25, width=1.0, maxlen=6.0)
    sfx_add(sfx.pop(), t, g=-15, bus="sfx_dry")
    cue(t, "FINAL CHORD (orange dot pops): D major add9 — strings, horns, flutes, rolled harp, glock D6+A6, "
           "soft timpani/BD/suspended cymbal + dot 'pop'; rings out, fades to silence by 51.0")


# ---- dawn ambience (SFX)
def ambience():
    lap = sfx.water_lap(at(4, 3), seed=160)
    lap = lap * np.clip(np.arange(len(lap)) / (1.2 * SR), 0, 1)[:, None]
    sfx_add(sfx.fade_edges(lap, 0.0, 0.8), 0.0, g=-17)
    for t, notes, pan, seed in ((1.9, (1760.0, 1318.5, 2349.3), -0.6, 71), (4.7, (1568.0, 2349.3, 1760.0, 1318.5), 0.55, 72),
                                (7.9, (2349.3, 1760.0), -0.35, 73)):
        b = sfx.bellbird(seed=seed, notes=notes)
        sfx_add(place(b, pan, 0.2), t, g=-18)
    cue(1.9, "NZ dawn ambience: water lapping + bellbird (korimako) calls at 1.9 / 4.7 / 7.9 s, pitched A6-E6-D7-G6")


# ==================================================================================================== mix
def mix():
    music_dry = BUS["str"] + BUS["brs"] + BUS["ww"] + BUS["harp"] + BUS["perc"]
    send = BUS["str"] * 0.32 + BUS["brs"] * 0.26 + BUS["ww"] * 0.34 + BUS["harp"] * 0.36 + BUS["perc"] * 0.22
    ir = lib.make_ir(rt60=2.3, length=3.4, predelay=0.022, seed=7)
    music = music_dry + lib.reverb(send, ir) * 1.0
    ir2 = lib.make_ir(rt60=1.1, length=1.8, predelay=0.012, seed=9, hf_rt=0.6, lf_rt=1.3)
    SFXG = db(12.0)                      # SFX bus trim (music first, SFX under it, punchy on the hits)
    fx = BUS["sfx"] * SFXG + lib.reverb(BUS["sfx"] * (0.18 * SFXG), ir2) + BUS["sfx_dry"]
    music, fx = music[:N].copy(), fx[:N].copy()
    # section automation: lift the intimate dawn (+5 dB) back to unity as the low swell starts
    auto = lib.smooth_env([(0, 5.0), (at(4, 1.8), 5.0), (at(4, 2.2), 0.0), (51.0, 0.0)], N)
    music *= (10 ** (auto / 20))[:, None]
    # DC / rumble (before the gate, so the filter cannot ring into the silence)
    music = lib.filt(music, "highpass", 22.0, 2)
    fx = lib.filt(fx, "highpass", 24.0, 2)

    # the HARD CUT: bar 14 is silent (gate 2 ms ramp ending exactly at 34.667; reopens at 37.333)
    a, b = S(at(14)), S(at(15))
    g = np.ones(N, np.float32)
    r = int(0.002 * SR)
    g[a - r:a] = np.linspace(1, 0, r, dtype=np.float32)
    g[a:b] = 0.0
    music *= g[:, None]
    fx *= g[:, None]
    w, tw = bar14_whisper()
    add(fx, sfx.norm(w), tw, db(-12))
    cue(tw, "BAR 14 SILENCE: only a whisper of wind (beanie lifts at 34.9)")

    # global edges: 5 ms fade-in, fade to silence 50.0 -> 51.0
    fi = int(0.005 * SR)
    ramp = np.ones(N, np.float32)
    ramp[:fi] = np.linspace(0, 1, fi)
    f0 = S(50.0)
    k = np.linspace(0, 1, N - f0)
    ramp[f0:] = (np.cos(k * np.pi) * 0.5 + 0.5) ** 1.3
    music *= ramp[:, None]
    fx *= ramp[:, None]
    return music, fx


def master(music, fx, target=-16.0, ceiling_db=-1.2):
    """Pre-normalise to the target, gentle bus compression, look-ahead limiter; iterate the make-up gain.
    One linked gain curve G(t) is applied to both stems so music + sfx == score."""
    raw = music + fx
    L0 = lib.lufs_integrated(raw)
    gain = db(target - L0)
    for it in range(8):
        mix_ = raw * gain
        cg = lib.compressor_gain(mix_, thresh_db=-15.0, ratio=1.8, knee=8.0, attack=0.02, release=0.3)
        y = mix_ * cg[:, None]
        lg = lib.limiter_gain(y, db(ceiling_db - 0.3))
        y = y * lg[:, None]
        L = lib.lufs_integrated(y)
        print("  master pass %d: pre-gain %+.2f dB -> %.2f LUFS, max limiter GR %.1f dB, max comp GR %.1f dB"
              % (it, 20 * np.log10(gain), L, -20 * np.log10(lg.min()), -20 * np.log10(cg.min())))
        if abs(L - target) < 0.1:
            break
        gain *= db((target - L) * 1.3)
    G = (gain * cg * lg).astype(np.float32)
    mu, fxo = music * G[:, None], fx * G[:, None]
    tp = lib.true_peak(mu + fxo)
    if tp > db(ceiling_db):
        s = db(ceiling_db) / tp
        mu *= s
        fxo *= s
    return mu, fxo, G


def write_cues(path, stats=None):
    lines = ["# « Le kiwi » — sound cue sheet", "",
             "Generated by `sound/score.py`. 90 BPM, 4/4, beat = 0.6667 s, bar = 2.6667 s, "
             "`at(bar, beat) = (bar-1)*BAR + beat*BEAT`. 48 kHz, 24-bit stereo, exactly 51.000 s (2 448 000 samples).",
             "Every time below is where the transient / downbeat lands in `score.wav` (sample = round(t*48000)).", "",
             "| time (s) | bar.beat | sample | cue |", "|---:|:---:|---:|---|"]
    for t, w in sorted(CUES, key=lambda c: c[0]):
        bar = int(t // BAR) + 1
        beat = (t - (bar - 1) * BAR) / BEAT
        lines.append("| %.3f | %d.%s | %d | %s |" % (t, bar, ("%.2f" % (beat + 1)).rstrip("0").rstrip("."), S(t), w))
    if stats:
        lines += ["", stats]
    open(path, "w").write("\n".join(lines) + "\n")


def main():
    print("rendering act 1 ...")
    act1()
    ambience()
    print("rendering act 2 ...  %.1fs" % (time.time() - T0))
    act2()
    print("rendering act 3 ...  %.1fs" % (time.time() - T0))
    act3()
    print("mixing ...  %.1fs" % (time.time() - T0))
    music, fx = mix()
    np.save(os.path.join(HERE, "cache", "premaster_music.npy"), music)
    np.save(os.path.join(HERE, "cache", "premaster_sfx.npy"), fx)
    finish(music, fx)


def finish(music, fx):
    mu, fxo, G = master(music, fx)
    out = mu + fxo
    assert len(out) == N
    os.makedirs(os.path.join(HERE, "stems"), exist_ok=True)
    lib.write_wav(os.path.join(HERE, "score.wav"), out, 24)
    lib.write_wav(os.path.join(HERE, "stems", "music.wav"), mu, 24)
    lib.write_wav(os.path.join(HERE, "stems", "sfx.wav"), fxo, 24)
    L = lib.lufs_integrated(out)
    tp = lib.true_peak(out)
    stats = ("Master: integrated loudness %.1f LUFS (BS.1770, K-weighted, gated), sample peak %.2f dBFS, true peak "
             "(4x) %.2f dBTP. Stems `stems/music.wav` + `stems/sfx.wav` sum to `score.wav` (same gain curve)."
             % (L, 20 * np.log10(np.abs(out).max()), 20 * np.log10(tp)))
    if CUES:
        write_cues(os.path.join(HERE, "cues.md"), stats)
    print(stats)
    print("done in %.1fs" % (time.time() - T0))


if __name__ == "__main__":
    if "--master-only" in sys.argv:       # re-master the cached pre-master mix (cues need a full render)
        finish(np.load(os.path.join(HERE, "cache", "premaster_music.npy")), np.load(os.path.join(HERE, "cache", "premaster_sfx.npy")))
    else:
        main()
