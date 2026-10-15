import json
exec(open('labels.py').read())
d = json.load(open('annotated.json')); spk = d['spk']
code = {'A': 'Professor Aronnax', 'C': 'Conseil', 'N': 'Ned Land', 'E': 'Captain Nemo', 'F': 'Commander Farragut', 'G': 'The engineer'}
bad = []; changed = total = 0
for ci, c in enumerate(d['chs']):
    lab = L[ci + 1].replace(' ', '')
    runs = [r for rr in c['r'] for r in rr]
    if len(lab) != len(runs): bad.append((ci + 1, len(lab), len(runs))); continue
    k = 0
    for rr in c['r']:
        for r in rr:
            ch = lab[k]; k += 1; total += 1
            new = spk.index(code[ch]) if ch != '-' else -1
            if new != r[2]: changed += 1
            r[2] = new; r[3] = 0
print('mismatched chapters:', bad)
print('quotes:', total, 'changed:', changed)
from collections import Counter
print(Counter(spk[r[2]] if r[2] >= 0 else '-' for c in d['chs'] for rr in c['r'] for r in rr))
json.dump(d, open('labelled.json', 'w'), ensure_ascii=False)
