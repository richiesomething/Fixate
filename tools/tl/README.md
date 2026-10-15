# Twenty Thousand Leagues under the Sea

Builds `books/tl.json` from Project Gutenberg #164 (the 1872 English translation).

1. `parse.py` splits `pg164.txt` into 46 chapters (`chs.json`).
2. `annotate.mjs` runs the app's own annotation pipeline (phrase weights, bonds, speech detection).
3. `labels.py` holds hand-checked speaker labels for every quoted speech, chapter by chapter
   (A = Aronnax, C = Conseil, N = Nemo, E = Ned Land, F = Farragut, G = the crew, - = no one);
   `apply_labels.py` writes them into `labelled.json`.
4. `build_tl.py` adds scenes, the character map, the chapter guide, and the extras:
   - `guide.voyage`: 28 stops on a world map (x = longitude + 120, y = 80 − latitude), plus the
     leagues counter from the narrator's running totals.
   - `guide.depths`: each depth the text gives, converted to metres.
   - `guide.vessel`: the Nautilus facts, each tied to where Nemo reveals it.

   Every item carries the word index where the book reveals it, and each quote is checked against
   the text, so the app never shows anything the reader hasn't reached.

`dump.py` and `tfind.py` are helpers for finding passages while editing the data.
