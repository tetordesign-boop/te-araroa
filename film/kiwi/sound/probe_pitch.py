# Probe: estimate the fundamental of some VSCO samples to learn the octave naming convention.
import numpy as np, scipy.io.wavfile as wf, sys, os
ROOT = "/home/claude/ext-vsco/repo"
def load(p):
    sr, x = wf.read(p)
    if x.dtype == np.int16: x = x / 32768.0
    elif x.dtype == np.int32: x = x / 2147483648.0
    if x.ndim > 1: x = x.mean(1)
    return sr, x.astype(np.float64)
def f0_hps(sr, x):
    a = np.abs(x); env = np.convolve(a, np.ones(2048)/2048, 'same')
    i = int(np.argmax(env)); seg = x[max(0,i-8192): i+8192]
    seg = seg * np.hanning(len(seg))
    n = 1 << 17
    S = np.abs(np.fft.rfft(seg, n)); fr = np.fft.rfftfreq(n, 1/sr)
    # harmonic product spectrum
    hps = S.copy()
    for h in (2,3,4):
        d = S[::h]; hps[:len(d)] *= d
    lo = np.searchsorted(fr, 25); hi = np.searchsorted(fr, 3000)
    k = lo + np.argmax(hps[lo:hi]); f = fr[k]
    return f
def f0(sr, x):
    # YIN on a few frames around the loudest part; median of estimates
    a = np.abs(x); env = np.convolve(a, np.ones(2048)/2048, 'same')
    i0 = int(np.argmax(env)); ests = []
    W = 4096; maxlag = int(sr/25)
    for off in range(0, 8):
        s = i0 + off*2048
        seg = x[s: s+W+maxlag]
        if len(seg) < W+maxlag: break
        d = np.array([np.sum((seg[:W]-seg[l:l+W])**2) for l in range(1, maxlag)])
        cm = d * np.arange(1, maxlag) / np.maximum(np.cumsum(d), 1e-12)
        idx = np.where(cm < 0.15)[0]
        if len(idx) == 0: k = int(np.argmin(cm))
        else:
            k = idx[0]
            while k+1 < len(cm) and cm[k+1] < cm[k]: k += 1
        ests.append(sr/(k+1))
    return float(np.median(ests))
def name(f):
    m = 69 + 12*np.log2(f/440); r = int(round(m))
    return "%s%d (%+.0fc)" % (["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][r%12], r//12-1, (m-r)*100)
for rel in sys.argv[1:]:
    sr, x = load(os.path.join(ROOT, rel)); f = f0(sr, x)
    print("%-70s %8.2f Hz  %s" % (rel, f, name(f)))
