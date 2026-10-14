# Read-along audio

`books/ss.audio.json` gives the time each word of *Sense and Sensibility* is spoken in the LibriVox
recording read by Elizabeth Klett
(https://librivox.org/sense-and-sensibility-version-03-by-jane-austen/), which was read from the
same Project Gutenberg text (#161) as `books/ss.json`. The audio itself streams from archive.org.

## How it was made
For each of the 50 chapter files:
1. `transcribe.py` runs Whisper (`base.en`, via faster-whisper) for a transcript with rough word times.
2. `align.py` matches that transcript against the app's own words for the chapter, keeps runs of
   matching words as anchors (skipping the LibriVox announcements), then runs a wav2vec2 CTC forced
   alignment between anchors to time every word to about 20 ms. Words the narrator skipped are
   interpolated.
3. `pack.py` stores the result per chapter as the first word's time plus differences in hundredths
   of a second.

Requirements: Python 3, ffmpeg, and `pip install faster-whisper torch torchaudio`
(CPU builds are fine; the whole book takes about an hour on 4 cores).

    python transcribe.py base.en mp3/01.mp3 t01.json 4
    python align.py 0 mp3/01.mp3 t01.json a01.json 4
    python pack.py ../../books/ss.audio.json <librivox page url>

`align.py` reads `books/ss.json` relative to its own location in the repository.
