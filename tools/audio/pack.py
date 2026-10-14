# Pack per-chapter alignments into books/ss.audio.json for the app.
import json, os, sys
out = sys.argv[1]
chapters = []
for n in range(1, 51):
    f = f'a{n:02d}.json'
    if not os.path.exists(f): chapters.append(None); continue
    a = json.load(open(f)); st = a['start']
    t0 = st[0]; d = [0] + [round((st[k] - st[k - 1]) * 100) for k in range(1, len(st))]
    # rounding drift guard: rebuild from deltas and compare
    t, mx = t0, 0
    for k in range(1, len(st)): t += d[k] / 100; mx = max(mx, abs(t - st[k]))
    assert mx < 0.05, (n, mx)
    chapters.append({'file': f'senseandsensibility_{n:02d}_austen_64kb.mp3', 't0': round(t0, 2), 'end': a['end'], 'd': d})
doc = {'reader': 'Elizabeth Klett', 'source': 'LibriVox', 'page': sys.argv[2],
       'base': 'https://archive.org/download/sense_sensibility_ver3_ek/', 'chapters': chapters}
json.dump(doc, open(out, 'w'), separators=(',', ':'))
print('chapters packed:', sum(1 for c in chapters if c), 'size', os.path.getsize(out))
