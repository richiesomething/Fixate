# Print every quote of a chapter range in order, with the narration around it, for hand labelling.
import json, sys, re
d = json.load(open('annotated.json')); spk = d['spk']
code = {'Professor Aronnax': 'A', 'Conseil': 'C', 'Ned Land': 'N', 'Captain Nemo': 'E', 'Commander Farragut': 'F', 'The engineer': 'G'}
a0, a1 = int(sys.argv[1]), int(sys.argv[2])
for ci in range(a0 - 1, a1):
    c = d['chs'][ci]; n = 0; out = []
    for pi, runs in enumerate(c['r']):
        ws = c['p'][pi].split(' '); prev_end = 0
        for (a, b, sp, g) in runs:
            before = ' '.join(ws[prev_end:a])[-45:]
            q = ' '.join(ws[a:b + 1]); q = q if len(q) < 95 else q[:60] + '…' + q[-30:]
            after = ' '.join(ws[b + 1:b + 9])
            lab = (code.get(spk[sp], '?') if sp >= 0 else '-') + ('?' if g else '')
            out.append(f"{n:3d} {lab:3} {('…'+before+' ') if before.strip() else ''}{q} ⟨{after}⟩")
            n += 1; prev_end = b + 1
    print(f'=== ch{ci + 1} ({c["t"]}: {c["s"]}) {n} quotes'); print('\n'.join(out))
