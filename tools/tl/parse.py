# Parse Gutenberg #164 into the app's chapter/paragraph structure.
import re, json
raw = open('pg164.txt', encoding='utf-8').read()
body = raw[raw.index('*** START'):raw.index('*** END')]
body = body[body.index('PART ONE'):]
lines = body.replace('\r', '').split('\n')
ROM = {'I':1,'V':5,'X':10,'L':50}
def rom(s):
    n=0
    for i,c in enumerate(s):
        v=ROM[c]; n+= -v if i+1<len(s) and ROM[s[i+1]]>v else v
    return n
def titlecase(t):
    small = {'a','an','the','of','to','in','on','at','by','for','and','or','from','under'}
    ws = t.lower().split()
    out = [w if (k and w in small) else (w[:1].upper()+w[1:]) for k,w in enumerate(ws)]
    s = ' '.join(out)
    return re.sub(r'(?<=[“"(])([a-z])', lambda m: m.group(1).upper(), s).replace('Captain Nemo’s','Captain Nemo’s')
def clean(t):
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'_([^_]+)_', r'\1', t)          # _italics_
    t = re.sub(r'\s*—\s*', '— ', t)             # dash style used by the other books
    t = re.sub(r'— ([”’)])', r'—\1', t)          # but keep a closing quote attached
    t = re.sub(r'— $', '—', t)
    return t.strip()
chs = []; part = 0; cur = None; para = []; i = 0
def flush():
    global para
    if para and cur is not None:
        p = clean(' '.join(para))
        if p: cur['p'].append(p)
    para = []
while i < len(lines):
    L = lines[i].strip()
    if L in ('PART ONE', 'PART TWO'):
        flush(); part += 1; i += 1; continue
    m = re.match(r'^CHAPTER ([IVXL]+)$', L)
    if m:
        flush()
        j = i + 1
        while not lines[j].strip(): j += 1
        title = lines[j].strip()
        n = rom(m.group(1))
        cur = {'t': f'Part {part}, Chapter {n}', 's': titlecase(title), 'p': []}
        chs.append(cur); i = j + 1; continue
    if not L: flush()
    else: para.append(L)
    i += 1
flush()
words = sum(len(p.split(' ')) for c in chs for p in c['p'])
print(len(chs), 'chapters', words, 'words')
for c in chs[:3] + chs[23:25] + chs[-2:]: print(c['t'], '|', c['s'], '|', len(c['p']), 'paras |', c['p'][0][:90])
odd = [(c['t'], p[:100]) for c in chs for p in c['p'] if re.search(r'[\[\]_{}]|^[A-Z ]{12,}$|\*', p)]
print('odd paragraphs:', len(odd)); [print(' ', o) for o in odd[:15]]
json.dump(chs, open('chs.json', 'w'), ensure_ascii=False)
