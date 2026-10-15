# Parse F. P. Walter's translation (Project Gutenberg #2488) into the app's chapter/paragraph structure.
# The text is kept as published; only layout changes: lines are joined into paragraphs, footnote
# asterisks are dropped (each note stays as its own paragraph after the passage it explains) and the
# short lines of letters and addresses stay on their own lines.
import re, json
raw = open('src/pg2488.txt', encoding='utf-8').read().replace('\r', '')
body = raw[raw.index('\nFIRST PART\n'):raw.index('*** END')]
lines = body.split('\n')
def clean(t):
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'(?<=\S)\*+(?=[\s,.;:”’)]|$)', '', t)   # footnote markers in the text
    t = re.sub(r'^\*+', '', t)                          # and at the start of the note itself
    t = re.sub(r'\s*—\s*', '— ', t)                     # dash style used by the other books
    t = re.sub(r'— ([”’)])', r'—\1', t)
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
    raw_l = lines[i]; L = raw_l.strip()
    if L in ('FIRST PART', 'SECOND PART'):
        flush(); part += 1; i += 1; continue
    m = re.match(r'^CHAPTER (\d+)$', L)
    if m:
        flush(); j = i + 1
        while not lines[j].strip(): j += 1
        title = lines[j].strip()
        if m.group(1) == '1': part2 = len(chs) and 2 or 1
        else: part2 = 2 if any(c['t'].startswith('Part 2') for c in chs) else 1
        cur = {'t': f'Part {part2}, Chapter {m.group(1)}', 's': re.sub(r'\*+$', '', title), 'p': []}
        chs.append(cur); i = j + 1; continue
    if re.fullmatch(r'END OF THE (FIRST|SECOND) PART', L): i += 1; continue
    if not L: flush()
    else:
        para.append(L)
        # indented short lines (letter headings, addresses, signatures) stand alone
        if raw_l.startswith('  ') and len(L) < 45 and not L.startswith('*'): flush()
    i += 1
flush()
words = sum(len(p.split(' ')) for c in chs for p in c['p'])
print(len(chs), 'chapters', words, 'words')
odd = [(c['t'], p[:110]) for c in chs for p in c['p'] if re.search(r'[\[\]_{}*]|^[A-Z ]{12,}$|\s[ivxl]+$', p)]
print('odd paragraphs:', len(odd)); [print(' ', o) for o in odd[:20]]
json.dump(chs, open('chs.json', 'w'), ensure_ascii=False)
