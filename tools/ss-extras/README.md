# Sense and Sensibility extras

`build_extras.py` writes three things into `books/ss.json` under `guide`:

- `england`: the map of southern England (coastline from Natural Earth via the `world-atlas`
  package, `countries-10m.json`), the Dashwoods' route and other places mentioned.
- `ledger`: every sum of money in the book, with the quote it comes from.
- `tree`: the family tree, with links whose labels change as the story reveals more.

Every item carries `i`, the index of the word after which the book has revealed it, found by
searching the text itself (`find.py`). Quotes are checked against the text when the script runs.

    curl -sLO https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-10m.json
    python3 build_extras.py

Run it on a copy of `books/ss.json` without these keys (the script adds them; rerunning on its own
output also works). It reads the book from an absolute path set near the top of both files; adjust
`BOOK` / the path in `find.py` to your checkout.
