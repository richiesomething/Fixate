// Runs the app's own PDF annotation code (app.js) over the parsed chapters.
import fs from 'fs';
const app = fs.readFileSync('/home/user/Fixate/app.js', 'utf8');
const src = app.slice(app.indexOf('const FW={det'), app.indexOf('/* ---- 4. the upload flow ---- */'));
const FREQ = new Map();
fs.readFileSync('/home/user/Fixate/data/freq.txt', 'utf8').split(';').forEach(b => { const [z, ws] = b.split('|'); ws.split(' ').forEach(w => FREQ.set(w, +z)) });
const GENDICT = JSON.parse(fs.readFileSync('/home/user/Fixate/data/gendict.json', 'utf8'));
const zipfOf = w => FREQ.get(w) ?? 2.0, genDict = () => GENDICT;
// book-specific names: the detector keeps "the <adjective>" from phrases like "the imperturbable Conseil"
let CI = 0;
const ALIAS = { 'The commander': 'Commander Farragut', 'The harpooner': 'Ned Land', 'Ned': 'Ned Land', 'The rancorous': 'Ned Land', 'The disappointed': 'Ned Land', 'The Canadian': 'Ned Land', 'The imperturbable': 'Conseil', 'The impassive': 'Captain Nemo', 'The stranger': 'Captain Nemo', 'The inextricable': null, 'The question': null };
const alias = n => { if (n == null) return n; if (n in ALIAS) return ALIAS[n]; if (n === 'The captain' || n === 'The Captain') return CI < 7 ? 'Commander Farragut' : 'Captain Nemo'; return n };
let src2 = src.replace('const validName=n=>{', 'const validName=n=>alias(validName0(n));const validName0=n=>{')
               .replace('chs.forEach((c,ci)=>{\n    c.r=[];', 'chs.forEach((c,ci)=>{\n    setCI(ci);c.r=[];');
if (src2.indexOf('setCI(ci)') < 0 || src2.indexOf('validName0') < 0) throw new Error('injection failed');
const annotate = new Function('zipfOf', 'genDict', 'alias', 'setCI', src2 + '\nreturn annotate;')(zipfOf, genDict, alias, c => { CI = c });
const chs = JSON.parse(fs.readFileSync('chs.json', 'utf8'));
const res = annotate(chs, (m) => {});
const spk = res.spk.map(n => n === 'Narrator' ? 'Professor Aronnax' : n), pre = res.pre;
// the dictionary entries this book needs: every word form that has one
const dict = {};
for (const c of chs) for (const p of c.p) for (const w of p.split(' ')) {
  const f = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase();
  if (f && GENDICT[f] && !dict[f]) dict[f] = GENDICT[f]; else if (f.endsWith('s') && GENDICT[f.slice(0, -1)] && !dict[f.slice(0, -1)]) dict[f.slice(0, -1)] = GENDICT[f.slice(0, -1)];
}
fs.writeFileSync('annotated.json', JSON.stringify({ chs, spk, pre, dict }));
const runs = chs.reduce((a, c) => a + c.r.flat().length, 0), named = chs.reduce((a, c) => a + c.r.flat().filter(r => r[2] >= 0 && !r[3]).length, 0);
console.log('speakers:', spk.length, spk.slice(0, 25).join(', '));
console.log('quotes:', runs, 'named directly:', named, '| dict entries:', Object.keys(dict).length, '| pre words ch1:', pre[0].map(x => x[2]).join(','));
