# Twenty Thousand Leagues Under the Seas

Builds `books/tl.json` from F. P. Walter's complete translation, Project Gutenberg #2488.

The translation is copyright © 1999 Frederick Paul Walter and is on Project Gutenberg with his
permission, under the Project Gutenberg License. Fixate meets that license by keeping the text unchanged
(only the layout is converted), staying free, and showing the license notice with a link on the book's
card and chapter list. The full notice and license are in `books/tl.LICENSE.txt`.

1. Download the eBook to `src/pg2488.txt` (https://www.gutenberg.org/cache/epub/2488/pg2488.txt).
2. `python3 parse.py` splits it into 47 chapters (`chs.json`). Lines become paragraphs, footnote
   asterisks are dropped (each note stays as its own paragraph) and short letter lines stand alone.
3. `node annotate.mjs` runs the app's own annotation pipeline (phrase weights for timing, phrase breaks,
   the chapter word lists) and writes `annotated.json`.
4. `python3 build_tl.py` (needs `countries-110m.json` from the world-atlas package, https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json) adds scenes, the character map, the chapter guide and the extras:
   - `guide.voyage`: 28 stops on a world map (x = longitude + 120, y = 80 − latitude), plus the
     leagues counter from the narrator's running totals.
   - `guide.depths`: each depth the text gives, in metres as Walter keeps them.
   - `guide.vessel`: the Nautilus facts, each tied to where Nemo reveals it.

   Every item is tied to the word where the book reveals it, and each quote is checked against the text,
   so the app never shows anything the reader hasn't reached.

`q.py "<chapter>:<regex>"` and `tfind.py` help find passages when editing the data.
