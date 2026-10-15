import sys
from tfind import find
# usage: q.py "minch:pattern" ...  -> first 3 hits at or after chapter minch
for arg in sys.argv[1:]:
    ch, pat = arg.split(':', 1); ch = int(ch)
    hits = [h for h in find(pat, 11, 9999) if h[1] >= ch][:3]
    print('==', arg); [print(f'  {i:6d} ch{c:2d} | {t[:200]}') for i, c, t in hits]
