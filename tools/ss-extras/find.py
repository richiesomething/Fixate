# Search Sense and Sensibility by regex over the app's word stream; prints global word index, chapter and context.
import json, re, sys
d = json.load(open('/home/user/Fixate/books/ss.json'))
W, CH = [], []
for ci, c in enumerate(d['chs']):
    for p in c['p']:
        for w in p.split(' '): W.append(w); CH.append(ci)
text = ' '.join(W)
starts = []; pos = 0
for w in W: starts.append(pos); pos += len(w) + 1
import bisect
def find(pat, ctx=25, limit=40):
    out = []
    for m in re.finditer(pat, text, flags=re.I):
        i = bisect.bisect_right(starts, m.start()) - 1
        out.append((i, CH[i] + 1, ' '.join(W[max(0, i - ctx):i + ctx])))
        if len(out) >= limit: break
    return out
if __name__ == '__main__':
    for pat in sys.argv[1:]:
        print('==', pat)
        for i, c, t in find(pat, int(__import__('os').environ.get('CTX', 22))): print(f'{i:6d} ch{c:2d} | {t}')
