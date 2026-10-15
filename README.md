# Fixate
Reading speed and comprehension trainer. Words and short phrases flash one at a time in a fixed spot,
with word help, a spoiler-safe reading guide, a word bank and progress stats.

**Live:** https://richiesomething.github.io/Fixate/

## Layout
| Path | What it is |
| --- | --- |
| `index.html`, `app.css`, `app.js` | The app shell (about 50 KB gzipped). |
| `books/<id>.json` | Text and annotations for each built-in book, fetched only when that book is opened. |
| `books/ss.json` → `guide.england`, `guide.ledger`, `guide.tree`, `guide.letters` | The *Sense and Sensibility* England map, money ledger, family tree and the six letters quoted in full, built by `tools/ss-extras/build_extras.py`; every fact is tied to the word where the book reveals it. |
| `books/tl.json` → `guide.voyage`, `guide.depths`, `guide.vessel` | *Twenty Thousand Leagues Under the Seas* in F. P. Walter's complete translation (© 1999, used under the Project Gutenberg License; see `books/tl.LICENSE.txt`): the voyage on a world map with a leagues counter, the depths reached, and a Nautilus spec sheet. Built by `tools/tl/`; each place, depth and fact appears only once the reader reaches it. |
| `books/ss.audio.json` | Word-by-word time map for the *Sense and Sensibility* audiobook (LibriVox, read by Elizabeth Klett); see `tools/audio/`. |
| `data/freq.txt`, `data/gendict.json` | Word frequencies and dictionary, fetched only when someone adds a PDF. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install. |
| `tools/build-single.mjs` | Builds one self-contained HTML file, used for the Claude artifact version. |
| `docs/mobile-plan.md` | The mobile optimisation plan. |

## Run locally
Any static server works, for example:

    python3 -m http.server 8000

Then open http://localhost:8000. The service worker only runs over `http(s)`, not `file://`.

## Deploy
Every push to `main` publishes automatically: `.github/workflows/pages.yml` copies the site to the
`gh-pages` branch, which GitHub Pages serves at the live link above. Fixate is fully static, so any
other static host works too. The app's own files are fetched fresh whenever the phone is online, so a push shows up the next
time the app is opened. When `books/` or `data/` change, bump `VERSION` in `sw.js` so installed copies
download the new files; an open app reloads into the new version once the reader is paused.

## Claude artifact version
    node tools/build-single.mjs          # writes dist/fixate-single.html

Inside Claude, the page can also use Claude for chapter checks, word
meanings in context and guides for PDFs. Outside Claude those features are hidden and everything
else works.
