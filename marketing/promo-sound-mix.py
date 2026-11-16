# Builds the ffmpeg mix: calm bed + one cue per animated moment in promo/index.html.
# usage: python3 promo-sound-mix.py <sounds dir> <out.mp4> <silent render of promo/> [caption option] [formation option] [LUFS] [taps|notaps] [end mark option]
import subprocess, sys
D, OUT = sys.argv[1], sys.argv[2]
CAP = sys.argv[4] if len(sys.argv) > 4 else "marimba"
FORM = sys.argv[5] if len(sys.argv) > 5 else "none"
LUFS = sys.argv[6] if len(sys.argv) > 6 else "-21"
TAPS = (sys.argv[7] if len(sys.argv) > 7 else "notaps") == "taps"
db = lambda d: 10 ** (d / 20)
rev = lambda a, b: f"atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.4,afade=t=out:st={b - a - 0.12:.2f}:d=0.12"
# Each option: list of (file, offset from the moment it should peak, gain, filter). Gains bring each file to about -14 dBFS peak.
CAPTION = {  # peak lands as the new caption slides in
    "fabric":  [("cap_fabric", -0.175, db(4), "")],
    "kinoton": [("cap_kinoton", -0.2, db(-4.5), "")],
    "marimba": [("marimba", -0.08, 0.3, "asetrate=44100*1.5,aresample=44100"), ("marimba", 0, 0.3, "asetrate=44100*2,aresample=44100")],
    "none": [],
}
FORMATION = {  # reversed swells that peak as the dancers arrive
    "glassy":   [("form_glassy", -1.625, db(11.5), rev(1.45, 3.15))],
    "revpiano": [("form_revpiano", -1.6, db(-12), rev(2.5, 4.2))],
    "swell":    [("form_swell", -1.5, db(-8), rev(0.4, 2.1))],
    "none": [],
}
END = sys.argv[8] if len(sys.argv) > 8 else "kalimba"
ENDMARK = {  # as "Eight" lands on the end card
    "shimmer": [("end_shimmer", 0, db(-14), "")],
    "melody":  [("end_melody", 0, db(-9), "")],
    "dreamy":  [("end_dreamy", 0, db(-8), "")],
    "chord":   [("marimba", 0, 0.25, f"asetrate=44100*{r},aresample=44100") for r in (1, 1.25, 1.5)],
    "kalimba":   [("end_kalimba", 0, db(-8.8), "")],
    "harp":      [("end_harp", 0, db(-11), "")],
    "glock":     [("end_glock", 0, db(-4.5), "afade=t=out:st=1.5:d=1")],
    "musicbox":  [("end_musicbox", -0.15, db(-8.8), "")],
    "vibes":     [("end_vibes", -0.2, db(-12.7), "")],
    "sparkle":   [("end_sparkle", -0.05, db(-5.8), "")],
    "pianobell": [("end_pianobell", 0, db(-3.5), "")],
    "none": [],
}
def put(opts, t):
    for f, off, v, x in opts: cues.append((f, t + off, v, x))
SCALE = [1, 9/8, 5/4, 3/2, 5/3, 2, 9/4, 5/2]  # major pentatonic, rising per dancer
cues = []  # (file, start_s, volume, extra_filter)
def mar(t, r, v): cues.append(("marimba", t, v, f"asetrate=44100*{r:.4f},aresample=44100"))
for i in range(8): mar(0.05 + 0.05*i, SCALE[i], 0.35)           # dancers pop in
for k in range(4): cues.append(("bubble", 0.45 + 0.07*k, 0.25, ""))  # formation bars rise
for c in range(8): cues.append(("click", 0.9 + 0.03*c, 0.6, ""))     # counts appear
for n in range(32 if TAPS else 0): cues.append(("tap", 1.2 + 0.45*n, 0.12 if n % 8 == 0 else 0.05, ""))  # count marker hops
for k in (1, 2, 3):
    at = 1.2 + 3.6*k
    put(CAPTION[CAP], at - 1.1)                                                   # caption swap
    put(FORMATION[FORM], at + 0.5)                                                # dancers travel
    if FORM != "none": cues.append(("ding", at - 0.1, 0.3, ""))                   # stage colour + ring switch, part of the formation change
put(CAPTION[CAP], 15.875)   # cut to end card
put(ENDMARK[END], 16.0)  # "Eight" lands
for k, r in enumerate([1, 5/4, 3/2, 2, 5/2]): mar(16.6 + 0.08*k, r, 0.3)  # colour swatches

files = sorted({c[0] for c in cues})
args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", sys.argv[3], "-i", f"{D}/epiano.mp3"]
for f in files: args += ["-i", f"{D}/{f}.mp3"]
idx = {f: i + 2 for i, f in enumerate(files)}
count = {f: sum(c[0] == f for c in cues) for f in files}
fc = ["[1:a]atrim=0:20,volume=1.6,afade=t=in:d=0.8,afade=t=out:st=18.2:d=1.8[bed]"]
for f in files: fc.append(f"[{idx[f]}:a]asplit={count[f]}" + "".join(f"[{f}{j}]" for j in range(count[f])))
used = {f: 0 for f in files}; labels = []
for n, (f, t, v, x) in enumerate(cues):
    j = used[f]; used[f] += 1
    fc.append(f"[{f}{j}]{x + ',' if x else ''}volume={v},adelay={int(t*1000)}:all=1[c{n}]"); labels.append(f"[c{n}]")
fc.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0[sfx]")
fc.append(f"[bed][sfx]amix=inputs=2:normalize=0:duration=first,loudnorm=I={LUFS}:TP=-1.5:LRA=11,aresample=48000[out]")
args += ["-filter_complex", ";".join(fc), "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", "20", OUT]
subprocess.run(args, check=True)
print(len(cues), "cues")
