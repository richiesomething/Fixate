# Align one chapter of the app's text to a LibriVox recording.
#   python align.py <chapter index 0-based> <mp3> <whisper json> <out json>
# Output: {"start": [seconds per app word], "end": seconds of last word, "stats": {...}}
import sys, json, re, subprocess, difflib
import numpy as np, torch, torchaudio

import os
BOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'books', 'ss.json')
ci, mp3, wjson, out = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
torch.set_num_threads(int(sys.argv[5]) if len(sys.argv) > 5 else 2)

chs = json.load(open(BOOK))['chs']
ours = [w for p in chs[ci]['p'] for w in p.split(' ')]
norm = lambda w: re.sub(r"[^a-z0-9']", '', w.lower().replace('’', "'").replace('‘', "'")).strip("'")
on = [norm(w) for w in ours]
wh = json.load(open(wjson))['words']
wn = [norm(w[0]) for w in wh]

# 1. anchors: app words matched to whisper words in order
# a Whisper word stretched over a long silence has a bad end, and the word after it a bad start
bad = set()
for j, w in enumerate(wh):
    if w[2] - w[1] > 1.5: bad.update((j, j + 1))
sm = difflib.SequenceMatcher(None, on, wn, autojunk=False)
anchor = {}  # our index -> (whisper start, whisper end, run length)
for a, b, n in sm.get_matching_blocks():
    for k in range(n):
        if b + k not in bad: anchor[a + k] = (wh[b + k][1], wh[b + k][2], n)

# 2. emissions for the whole chapter, in 20 s pieces
pcm = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-i', mp3, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True, check=True).stdout
audio = torch.from_numpy(np.frombuffer(pcm, np.int16).astype(np.float32) / 32768)
bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
model = bundle.get_model().eval()
labels = bundle.get_labels()  # ('-', '|', 'E', 'T', ...)
lid = {c: i for i, c in enumerate(labels)}
SR, HOP = 16000, 320  # 20 ms per frame
piece, pad = 20 * SR, 1 * SR
ems = []
with torch.inference_mode():
    for s in range(0, len(audio), piece):
        a0, a1 = max(0, s - pad), min(len(audio), s + piece + pad)
        e, _ = model(audio[a0:a1].unsqueeze(0))
        e = torch.log_softmax(e[0], -1)
        f0 = (s - a0) // HOP
        nf = (min(len(audio), s + piece) - s) // HOP
        ems.append(e[f0:f0 + nf])
em = torch.cat(ems).numpy()
nframes = em.shape[0]

def ctc_align(e, toks):
    """Viterbi CTC alignment; returns the first frame of each token."""
    S = 2 * len(toks) + 1
    ext = np.zeros(S, int); ext[1::2] = toks
    T = e.shape[0]
    if T < len(toks): return None
    NEG = -1e9
    dp = np.full(S, NEG); dp[0] = e[0, 0]; dp[1] = e[0, ext[1]]
    bp = np.zeros((T, S), np.int8)
    can_skip = np.zeros(S, bool); can_skip[3::2] = ext[3::2] != ext[1:-2:2]
    for t in range(1, T):
        stay = dp
        prev1 = np.concatenate(([NEG], dp[:-1]))
        prev2 = np.where(can_skip, np.concatenate(([NEG, NEG], dp[:-2])), NEG)
        best = np.maximum(stay, np.maximum(prev1, prev2))
        bp[t] = np.where(best == stay, 0, np.where(best == prev1, 1, 2))
        dp = best + e[t, ext]
    s = S - 1 if dp[S - 1] >= dp[S - 2] else S - 2
    path = np.zeros(T, int)
    for t in range(T - 1, -1, -1):
        path[t] = s; s -= int(bp[t, s])
    first = {}
    for t in range(T):
        if path[t] % 2 == 1 and path[t] // 2 not in first: first[path[t] // 2] = t
    return [first.get(i) for i in range(len(toks))]

def tokens(w):
    return [lid[c] for c in w.upper().replace("'", "'") if c in lid and c not in '-|']

# 3. windows between confident anchors (inside a run of >= 3 matched words), ~40+ words apart
conf = sorted(k for k, v in anchor.items() if v[2] >= 3)
bounds = []
for k in conf:
    if not bounds or k - bounds[-1] >= 40: bounds.append(k)
start = [None] * len(ours)
refined = 0
if bounds:
    last_conf = conf[-1]
    bounds_end = bounds[1:] + [len(ours)]
    for a, b in zip(bounds, bounds_end):
        t0 = max(0.0, anchor[a][0] - 0.3)
        # the last window ends a little after the final words are due; Whisper's own last timestamps
        # often stretch over the closing silence and the "End of chapter" announcement
        t1 = (anchor[b][0] + 0.15) if b < len(ours) else min(nframes * 0.02, anchor[last_conf][0] + 0.5 * (len(ours) - last_conf + 1) + 0.8)
        f0, f1 = int(t0 * 50), min(nframes, int(t1 * 50) + 1)
        toks, owner = [], []
        for k in range(a, b):
            if k >= len(ours): break
            tk = tokens(on[k])
            if tk:
                owner.append((k, len(toks)))
                toks += tk + [lid['|']]
        if not toks or f1 - f0 < len(toks): continue
        fr = ctc_align(em[f0:f1], toks)
        if fr is None: continue
        for k, ti in owner:
            if fr[ti] is not None:
                start[k] = round((f0 + fr[ti]) * 0.02, 3); refined += 1

# 4. fall back to whisper times, then interpolate; keep times increasing
for k, v in anchor.items():
    if start[k] is None: start[k] = v[0]
# discard refined times that disagree badly with a nearby whisper anchor (window failure)
for k, v in anchor.items():
    if v[2] >= 3 and abs(start[k] - v[0]) > 1.5: start[k] = v[0]
known = [k for k in range(len(ours)) if start[k] is not None]
for k in range(len(ours)):
    if start[k] is None:
        lo = max([j for j in known if j < k], default=None); hi = min([j for j in known if j > k], default=None)
        if lo is None: start[k] = start[hi] - 0.3 * (hi - k)
        elif hi is None: start[k] = start[lo] + 0.3 * (k - lo)
        else: start[k] = start[lo] + (start[hi] - start[lo]) * (k - lo) / (hi - lo)
for k in range(1, len(ours)):
    if start[k] < start[k - 1]: start[k] = start[k - 1]
end_t = min(len(audio) / SR, start[-1] + 0.25 + 0.07 * len(ours[-1]))
diffs = [abs(start[k] - anchor[k][0]) for k in anchor if anchor[k][2] >= 3]
stats = {'words': len(ours), 'anchored': len(anchor), 'refined': refined,
         'median_shift_vs_whisper': round(float(np.median(diffs)), 3) if diffs else None,
         'dur': round(len(audio) / SR, 1), 'first': start[0], 'end': round(end_t, 2)}
json.dump({'start': [round(x, 2) for x in start], 'end': round(end_t, 2), 'stats': stats}, open(out, 'w'))
print(ci, json.dumps(stats), flush=True)
