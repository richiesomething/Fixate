// Builds one self-contained HTML file (books, word lists, styles and script inlined), which is the
// form the app takes as a Claude artifact. Inside Claude the Claude features (chapter checks,
// sharper speaker detection, word meanings in context, PDF guides) become available.
//   node tools/build-single.mjs [out.html]     (default: dist/fixate-single.html)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist/fixate-single.html'));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
// keep "</script" inside embedded text from closing the tag early
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1');

const app = read('app.js');
const catalog = [...app.matchAll(/\{id:'(\w+)',title:'[^']*'/g)].map(m => m[1]);
if (!catalog.length) throw new Error('book catalog not found in app.js');

let html = read('index.html')
  .replace(/<link rel="manifest"[^>]*>\n/, '')
  .replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\n/g, '')
  .replace(/<link rel="stylesheet" href="app.css">/, () => `<style>\n${read('app.css')}</style>`);

const data = catalog.map(id => `<script type="application/json" data-book="${id}">${safe(read(`books/${id}.json`))}</script>`)
  .concat(catalog.filter(id => fs.existsSync(path.join(root, `books/${id}.audio.json`))).map(id => `<script type="application/json" data-audio="${id}">${safe(read(`books/${id}.audio.json`))}</script>`))
  .concat(`<script type="text/plain" id="freqdata">${safe(read('data/freq.txt'))}</script>`,
          `<script type="application/json" id="gendict">${safe(read('data/gendict.json'))}</script>`)
  .join('\n');

html = html.replace('<script src="app.js" defer></script>', () => `${data}\n<script>\n${app}</script>`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
