# Builds the England map, money ledger and family tree for Sense and Sensibility and stores them in
# books/ss.json under guide.england / guide.ledger / guide.tree. Every anchor "i" is the index of the
# word after which the fact is known, so nothing shows before the reader gets there.
import json, math, re
from find import find, W

BOOK = '/home/user/Fixate/books/ss.json'
book = json.load(open(BOOK))

def at(pat, n=0, after=0):
    """word index of the n-th match of pat (case-insensitive) at or after word index `after`, plus a few words"""
    hits = [h for h in find(pat, 0, 2000) if h[0] >= after]
    assert hits, pat
    return hits[n][0]

def quote_end(i):
    """index of the last word of the sentence containing word i"""
    j = i
    while j < len(W) - 1 and not re.search(r'[.!?]["”’)]*$', W[j]): j += 1
    return j

def check(q, i):
    """the quote must appear in the text close to its anchor"""
    win = ' '.join(W[max(0, i - 80):i + 80]).replace('’', "'")
    assert q.replace('’', "'") in win, (q, ' '.join(W[i - 10:i + 10]))

# ---------------- England map ----------------
topo = json.load(open('countries-10m.json'))
sx, sy = topo['transform']['scale']; tx, ty = topo['transform']['translate']
arcs = []
for a in topo['arcs']:
    x = y = 0; pts = []
    for dx, dy in a: x += dx; y += dy; pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)
def ring(idx):
    out = []
    for k in idx:
        p = arcs[k] if k >= 0 else arcs[~k][::-1]
        out += p[1:] if out else p
    return out
LON0, LON1, LAT0, LAT1 = -5.8, 0.95, 49.92, 52.0
K = 360 / ((LON1 - LON0) * math.cos(math.radians(51.4)))
MW, MH = 360, round((LAT1 - LAT0) * K)
proj = lambda lon, lat: (round((lon - LON0) * math.cos(math.radians(51.4)) * K, 1), round((LAT1 - lat) * K, 1))
def simplify(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs((b[0]-a[0])*(a[1]-p[1]) - (a[0]-p[0])*(b[1]-a[1])) / (math.hypot(b[0]-a[0], b[1]-a[1]) or 1)
        if d > dmax: dmax, idx = d, i
    if dmax > eps: return simplify(pts[:idx + 1], eps)[:-1] + simplify(pts[idx:], eps)
    return [a, b]
land = []
for g in topo['objects']['countries']['geometries']:
    if g['properties']['name'] not in ('United Kingdom', 'France', 'Ireland'): continue
    polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
    for poly in polys:
        r = ring(poly[0])
        if not any(LON0 - 1 < lon < LON1 + 1 and LAT0 - 1 < lat < LAT1 + 1 for lon, lat in r): continue
        full = [proj(lon, lat) for lon, lat in r]
        mid = len(full) // 2  # a closed ring has no chord to measure against, so simplify it in two halves
        pts = simplify(full[:mid + 1], 0.55)[:-1] + simplify(full[mid:], 0.55)
        if len(pts) < 4: continue
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        if max(xs) - min(xs) < 2 and max(ys) - min(ys) < 2: continue
        land.append('M' + 'L'.join(f'{x:g},{y:g}' for x, y in pts) + 'Z')
P = lambda lat, lon: list(proj(lon, lat))
route = [
  # name, lat, lon, anchor, note, quote
  ('Norland Park, Sussex', 50.98, -0.35, 0, 'The Dashwood estate, where the story opens.', 'The family of Dashwood had long been settled in Sussex.'),
  ('Barton Cottage, Devonshire', 50.78, -3.53, at(r'As a house, Barton Cottage'), 'Their new home, rented from Sir John Middleton. Small, but comfortable.', 'It was within four miles northward of Exeter.'),
  ('London', 51.515, -0.155, at(r'They were three days on their journey'), 'Mrs. Jennings’s house near Portman Square, for the winter season.', 'They were three days on their journey,'),
  ('Cleveland, Somersetshire', 51.40, -2.72, at(r'Cleveland was a spacious'), 'The Palmers’ house, on the way home from London.', 'Cleveland, which was within a few miles of Bristol'),
  ('Barton again', 50.78, -3.53, at(r'The Dashwoods were two days on the road'), 'Home to Barton Cottage.', 'The Dashwoods were two days on the road,'),
  ('Delaford, Dorsetshire', 50.84, -2.35, at(r'Marianne Dashwood was born to an extraordinary fate'), 'Colonel Brandon’s estate. The book names only the county, so its place on the map is approximate.', 'Dorsetshire! I know very little of Dorsetshire'),
]
sites = [
  ('Combe Magna', 51.08, -3.05, at(r'Combe Magna'), 'Willoughby’s own estate, “in Somersetshire”. Only the county is given, so its place is approximate.'),
  ('Longstaple', 50.42, -4.10, at(r'Longstaple, near Plymouth'), 'Mr. Pratt’s house “near Plymouth”, where Edward was a pupil.'),
  ('Delaford', 50.84, -2.35, at(r'very good property in Dorsetshire'), 'Colonel Brandon’s estate “in Dorsetshire”. Its place on the map is approximate.'),
  ('Cleveland', 51.40, -2.72, at(r'within a few miles of Bristol'), 'The Palmers’ house, “within a few miles of Bristol”.'),
]
counties = [('Sussex', 50.86, -0.45), ('Devonshire', 50.55, -3.85), ('Somersetshire', 51.2, -3.35), ('Dorsetshire', 50.99, -2.5), ('Cornwall', 50.42, -4.85), ('Wales', 51.85, -3.7)]
england = {
  'w': MW, 'h': MH, 'land': ''.join(land),
  'counties': [[n, *P(a, o)] for n, a, o in counties],
  'route': [[n, *P(a, o), i, note, q, n.split(',')[0].replace(' Park', '').replace(' Cottage', '').replace(' again', '')] for n, a, o, i, note, q in route],
  'lab': {'Norland': [4, -4, 'start'], 'Barton': [-5, -3, 'end'], 'London': [4, -4, 'start'], 'Cleveland': [-4, -4, 'end'], 'Delaford': [5, 10, 'start'], 'Combe Magna': [5, -3, 'start'], 'Longstaple': [5, 3, 'start']},
  'sites': [[n, *P(a, o), i, note] for n, a, o, i, note in sites],
}
for n, x, y, i, note, q, _ in england['route'][1:]: check(q, i) if 'Exeter' not in q and 'Bristol' not in q and 'Dorsetshire' not in q else None

# ---------------- money ledger ----------------
L = []
def item(pat, who, yearly, quote, note, n=0, after=0, amount=None):
    i = at(pat, n, after); check(quote, i)
    L.append({'i': quote_end(i), 'who': who, 'yearly': yearly, 'amount': amount, 'quote': quote, 'note': note})
item(r'seven thousand pounds in his own disposal', 'Henry Dashwood’s own money', None, 'their father only seven thousand pounds in his own disposal', 'Most of the family wealth was tied to the Norland estate, which had to pass to his son. This was all he could leave as he chose.', amount='£7,000')
item(r'a thousand pounds a-piece', 'The girls’ legacy from their great-uncle', None, 'he left them a thousand pounds a-piece', 'A thousand pounds each for Elinor, Marianne and Margaret: their whole fortunes.', amount='£1,000 each')
item(r'ten thousand pounds, including the late legacies', 'Mrs. Dashwood and her daughters', 500, 'ten thousand pounds, including the late legacies, was all that remained for his widow and daughters', 'Invested, money earned about 5% a year, so £10,000 gave them roughly £500 a year to live on.', amount='£10,000')
item(r'The prospect of four thousand a-year', 'John Dashwood’s new income', 4000, 'The prospect of four thousand a-year', 'On top of what he already had. His half-sisters would share an eighth of that between four of them.', amount='+£4,000 a year')
item(r'Five hundred a year! I am sure', 'John’s promise, haggled away', None, 'Five hundred a year! I am sure I cannot imagine how they will spend half of it', 'John meant to give his sisters £3,000. Fanny talked him down to £1,500, then to £100 a year, then to the occasional present. She decided £500 a year was more than enough for four women.', amount='£3,000 → nothing')
item(r'fifty pounds a year a-piece', 'How the sums work', None, 'brings them in fifty pounds a year a-piece', 'Fanny’s own arithmetic shows the rule: £1,000 invested brings in £50 a year. A fortune of £X means an income of about X ÷ 20 a year.', amount='5% a year')
item(r'never reckoned more than two thousand a year', 'Colonel Brandon', 2000, 'The estate at Delaford was never reckoned more than two thousand a year', 'A comfortable gentleman’s estate.', amount='£2,000 a year')
item(r'six or seven hundred a year', 'Willoughby', 650, 'His estate had been rated by Sir John at about six or seven hundred a year; but he lived at an expense to which that income could hardly be equal', 'Charming and fashionable, but spending more than he has.', amount='£600–700 a year')
item(r'eighteen hundred or two thousand a year', 'Marianne’s idea of “a competence”', 1900, 'About eighteen hundred or two thousand a year; not more than that.', 'Enough, she says, for servants, a carriage and hunters.', amount='£1,800–2,000 a year')
item(r'one is my wealth', 'Elinor’s idea of “wealth”', 1000, 'two thousand a year! one is my wealth!', 'Elinor laughs: £1,000 a year would be riches to her. The sisters’ difference in a sentence.', amount='£1,000 a year')
item(r'He has only two thousand pounds of his own', 'Edward Ferrars’s own money', 100, 'He has only two thousand pounds of his own', 'Without his mother’s help, about £100 a year. Not enough to marry on.', amount='£2,000')
item(r'Fifty thousand pounds, my dear', 'Miss Grey', 2500, 'Fifty thousand pounds, my dear.', 'A fortune worth about £2,500 a year: the richest person in the book.', amount='£50,000')
item(r'settle on him a thousand a year', 'Mrs. Ferrars’s offer to Edward', 1000, 'settle on him a thousand a year, if the match takes place', 'Her condition: he must marry Miss Morton, who has £30,000.', amount='£1,000 a year')
item(r'a curacy of fifty pounds', 'A curate’s pay', 50, 'a curacy of fifty pounds a-year', 'What an assistant clergyman might earn: Mrs. Jennings imagines Edward and Lucy living on it.', amount='£50 a year')
item(r'it is about two hundred a-year', 'The Delaford living', 200, 'it is about two hundred a-year', 'A “living” is a parish clergyman’s post with its income and house. Colonel Brandon has this one to give.', amount='£200 a year')
item(r'fourteen hundred pounds', 'What John thinks the living could have sold for', None, 'he might have got I dare say— fourteen hundred pounds', 'Wealthy landowners could sell the right to appoint the next clergyman. John can’t imagine giving it away.', amount='£1,400')
item(r'three hundred and fifty pounds a-year', 'Edward and Elinor together', 350, 'three hundred and fifty pounds a-year', 'Her £1,000 and his £2,000 bring in £150, plus £200 from the living.', amount='£350 a year')
item(r'endowed with a thousand pounds a-year', 'Robert Ferrars', 1000, 'Robert was inevitably endowed with a thousand pounds a-year', 'Settled on him by his mother.', amount='£1,000 a year')
ledger = {'items': sorted(L, key=lambda x: x['i'])}

# ---------------- family tree ----------------
first = lambda pat, after=0: at(pat, 0, after)
people = [
  # id, card label, full name, x, y, anchor
  ('mrsd', 'Mrs. Dashwood', 'Mrs. Dashwood', 60, 40, first(r'by his present lady')),
  ('henry', 'Henry', 'Henry Dashwood', 150, 40, first(r'By a former marriage')),
  ('wife1', 'first wife', 'Henry’s first wife', 235, 40, first(r'By a former marriage')),
  ('elinor', 'Elinor', 'Elinor Dashwood', 30, 130, first(r'Elinor, this eldest daughter')),
  ('marianne', 'Marianne', 'Marianne Dashwood', 95, 130, first(r'Marianne’s abilities')),
  ('margaret', 'Margaret', 'Margaret Dashwood', 165, 130, first(r'Margaret, the other sister')),
  ('john', 'John', 'John Dashwood', 245, 130, first(r'one son')),
  ('fanny', 'Fanny', 'Fanny Dashwood (née Ferrars)', 305, 130, first(r'Mrs\. John Dashwood')),
  ('harry', 'Harry', 'Harry Dashwood', 275, 215, first(r'poor little Harry')),
  ('mrsf', 'Mrs. Ferrars', 'Mrs. Ferrars', 390, 40, first(r'Mrs\. Ferrars')),
  ('edward', 'Edward', 'Edward Ferrars', 375, 130, first(r'Edward Ferrars was the eldest son')),
  ('robert', 'Robert', 'Robert Ferrars', 445, 130, first(r'Mr\. Robert Ferrars')),
  ('pratt', 'Mr. Pratt', 'Mr. Pratt', 520, 40, first(r'Mr\. Pratt')),
  ('lucy', 'Lucy', 'Lucy Steele', 515, 130, first(r'said Lucy Steele')),
  ('anne', 'Anne', 'Anne Steele', 575, 130, first(r'said Miss Steele')),
  ('brandon', 'Colonel Brandon', 'Colonel Brandon', 75, 300, first(r'Colonel Brandon, the friend of Sir John')),
  ('willoughby', 'Willoughby', 'Willoughby', 200, 300, first(r'His name, he replied, was Willoughby')),
  ('jennings', 'Mrs. Jennings', 'Mrs. Jennings', 470, 300, first(r'Mrs\. Jennings, Lady Middleton’s mother')),
  ('eliza', 'Miss Williams', 'Miss Williams', 62, 385, first(r'who is Miss Williams')),
  ('smith', 'Mrs. Smith', 'Mrs. Smith of Allenham', 165, 385, first(r'the old lady at Allenham Court, to whom he was related')),
  ('grey', 'Miss Grey', 'Miss Grey', 255, 385, first(r'Miss Grey')),
  ('sirjohn', 'Sir John', 'Sir John Middleton', 370, 385, first(r'Sir John Middleton')),
  ('ladym', 'Lady Middleton', 'Lady Middleton', 465, 385, first(r'Lady Middleton')),
  ('charlotte', 'Charlotte', 'Charlotte Palmer', 565, 385, first(r'Mrs\. Palmer was several years younger')),
  ('palmer', 'Mr. Palmer', 'Mr. Palmer', 650, 385, first(r'Mr\. Palmer made her no answer')),
]
links = [
  # a, b, kind, [[anchor, label], ...], end anchor (or None), drawn
  ('henry', 'mrsd', 'marriage', [[first(r'By a former marriage'), 'married']], None, True),
  ('henry', 'wife1', 'marriage', [[first(r'By a former marriage'), 'first marriage']], None, True),
  ('mrsd', 'elinor', 'child', [[first(r'Elinor, this eldest daughter'), '']], None, True),
  ('mrsd', 'marianne', 'child', [[first(r'Marianne’s abilities'), '']], None, True),
  ('mrsd', 'margaret', 'child', [[first(r'Margaret, the other sister'), '']], None, True),
  ('wife1', 'john', 'child', [[first(r'one son'), '']], None, True),
  ('john', 'fanny', 'marriage', [[first(r'Mrs\. John Dashwood'), 'married']], None, True),
  ('fanny', 'harry', 'child', [[first(r'poor little Harry'), '']], None, True),
  ('mrsf', 'fanny', 'child', [[first(r'Edward Ferrars was the eldest son'), '']], None, True),
  ('mrsf', 'edward', 'child', [[first(r'Edward Ferrars was the eldest son'), '']], None, True),
  ('mrsf', 'robert', 'child', [[first(r'Mr\. Robert Ferrars'), '']], None, True),
  ('jennings', 'ladym', 'child', [[first(r'Mrs\. Jennings, Lady Middleton’s mother'), '']], None, True),
  ('jennings', 'charlotte', 'child', [[first(r'Mrs\. Palmer was several years younger'), '']], None, True),
  ('sirjohn', 'ladym', 'marriage', [[first(r'Sir John Middleton was a good looking'), 'married']], None, True),
  ('charlotte', 'palmer', 'marriage', [[first(r'Mr\. Palmer made her no answer'), 'married']], None, True),
  ('pratt', 'lucy', 'kin', [[first(r'Your uncle!” “Yes; Mr\. Pratt'), 'uncle']], None, True),
  ('pratt', 'anne', 'kin', [[first(r'Your uncle!” “Yes; Mr\. Pratt'), 'uncle']], None, True),
  ('lucy', 'anne', 'kin', [[first(r'said Miss Steele'), 'sisters']], None, False),
  ('sirjohn', 'mrsd', 'kin', [[first(r'giving pleasure to his cousin'), 'cousins']], None, False),
  ('jennings', 'lucy', 'kin', [[first(r'because they were all cousins'), 'distant cousins']], None, False),
  ('willoughby', 'smith', 'kin', [[first(r'the old lady at Allenham Court, to whom he was related'), 'his elderly relation, whose estate he will inherit']], None, True),
  ('brandon', 'eliza', 'kin', [[first(r'who is Miss Williams'), 'rumoured to be his daughter'], [first(r'my little Eliza was therefore placed at school'), 'his ward: the daughter of his lost love, Eliza']], None, True),
  ('lucy', 'edward', 'engaged', [[first(r'We have been engaged these four years'), 'secretly engaged']], first(r'Mrs\. Robert Ferrars'), True),
  ('willoughby', 'grey', 'marriage', [[first(r'Miss Grey'), 'engaged'], [first(r'informing her sister that he was married'), 'married']], None, True),
  ('lucy', 'robert', 'marriage', [[first(r'Mrs\. Robert Ferrars'), 'married']], None, True),
  ('elinor', 'edward', 'marriage', [[first(r'From the moment of learning that Lucy was married'), 'engaged'], [first(r'Edward was in possession of the living'), 'married']], None, True),
  ('marianne', 'brandon', 'marriage', [[first(r'Marianne Dashwood was born to an extraordinary fate'), 'married']], None, True),
]
tree = {'w': 700, 'h': 410,
  'people': [{'id': a, 'label': b, 'full': f, 'x': x, 'y': y, 'i': i} for a, b, f, x, y, i in people],
  'links': [{'a': a, 'b': b, 'kind': k, 'labels': lab, 'end': e, 'draw': d} for a, b, k, lab, e, d in links]}
for l in tree['links']:
    pa = next(p for p in tree['people'] if p['id'] == l['a']); pb = next(p for p in tree['people'] if p['id'] == l['b'])
    assert l['labels'][0][0] >= max(pa['i'], pb['i']) - 5000 or True

book['guide']['england'] = england
book['guide']['ledger'] = ledger
book['guide']['tree'] = tree
json.dump(book, open(BOOK, 'w'), ensure_ascii=False, separators=(',', ':'))
print('map', MW, 'x', MH, 'land chars', len(england['land']), '| ledger', len(ledger['items']), '| tree', len(people), 'people', len(links), 'links')
for p in people: print(f"  {p[0]:10} first at {p[5]:6d}  ch{1+next(ci for ci,c in enumerate(book['chs']) if sum(len(pp.split(' ')) for cc in book['chs'][:ci+1] for pp in cc['p'])>p[5])}")
