# Fixate on phones: plan

Fixate started as a single 4 MB HTML artifact. To launch it as a web app that people use mostly on
phones, three things matter: how fast it loads on a mobile connection, whether it behaves like an app
once it's on the home screen, and whether the reading screen holds up at every phone size and
orientation. This plan comes from reading the whole codebase and testing it in mobile emulation
(iPhone SE, iPhone 14, Pixel 7, a 320 px phone and iPhone 14 in landscape).

## What we found

| Area | Finding | Impact |
| --- | --- | --- |
| Load | Every visit downloads all three books, a frequency list and a dictionary: 4.0 MB (1.5 MB gzipped) before anything renders. | Slow first open on cellular; wasted data. |
| Offline | No manifest, no service worker. | Can't be installed to the home screen and doesn't work offline. Fonts and pdf.js come from the network each time. |
| Screen sleep | Nothing keeps the screen on while flashing words. | The phone dims and locks mid-chapter. This is the most common complaint about speed readers on phones. |
| Landscape | On a landscape phone (340 px tall) the reader overlaps the header and the controls overlap the reader. | Unusable sideways. |
| Menu tabs | Six text tabs don't fit a 390 px screen, so "Settings" shows as "Set" and needs a sideways scroll to find. | Settings are hard to find. |
| Viewport | Heights use `100%`/`vh`, which on mobile browsers ignore the toolbars and the on-screen keyboard. No left/right safe-area padding for notches in landscape. | Content hidden behind browser bars or the notch, and the keyboard covers the summary box. |
| Saving | Progress is saved 400 ms after each change. When iOS kills a backgrounded tab, the last change can be lost. Browser storage can be cleared under storage pressure. | People lose their place. |
| Gestures | Double-tap can zoom the page; pull-down can trigger pull-to-refresh; long-press on the reader shows the iOS callout. | Accidental zooms, reloads and pop-ups while reading. |
| Android back | The full bookshelf view isn't a dialog, so the back button leaves the app instead of closing it. | Feels broken when installed. |
| Touch targets | Character chips (~30 px), speed −/+ (40 px) and the word-delete button (40 px) are below the 44 px minimum. | Missed taps. |

## The plan

### 1. Load only what's needed
- Split the single file into an app shell (`index.html`, `app.css`, `app.js`) plus data files:
  `books/<id>.json`, `data/freq.txt` and `data/gendict.json`.
- Fetch only the book being read. The others load when someone opens them.
- The frequency list and dictionary are only needed when someone adds their own PDF, so they load
  then. The built-in books' word lists are merged into `gendict.json` ahead of time, so adding a PDF
  never pulls in other books.
- `tools/build-single.mjs` puts it all back into one self-contained HTML file. That keeps the
  Claude artifact version (and its Claude features) easy to update from the same code.

### 2. Make it installable and offline
- A web app manifest (name, icons, standalone display, theme colours, portrait-first).
- Icons: SVG, 192/512 PNG, a maskable variant for Android, and an `apple-touch-icon` for iOS.
- A service worker that precaches the app shell, saves each book the first time it's opened (so
  books you've read work offline), and caches Google Fonts and pdf.js.
- Ask the browser for persistent storage so progress, saved words and uploaded PDFs aren't evicted.

### 3. Fit every phone screen
- Use dynamic viewport units (`dvh`) so the layout follows the real visible area.
- Add left and right safe-area padding for notched phones in landscape.
- New compact landscape layout: the reader on the left, and the progress bar, transport and speed
  on the right, with the context paragraph hidden.
- Turn the menu into an icon-plus-label tab bar that fits all six tabs at 320 px, so Settings is
  always visible.
- Size the bottom sheet with `dvh`. Have the browser resize the page for the on-screen keyboard,
  and scroll the summary box into view when it gets focus.
- Bring the small touch targets up to 44 px.

### 4. Behave like an app while reading
- Keep the screen awake while words are flashing (Screen Wake Lock), and get the lock back when you
  return to the app.
- Save immediately when the page is hidden or closed, as well as on the existing timer.
- Turn off double-tap zoom, pull-to-refresh and the long-press callout on the reader.
- A light haptic tick on Android as you drag to scrub, so you can feel each step.
- The Android back button closes the bookshelf instead of leaving the app.

### Not in this pass
- Claude features (questions, summaries, sharper speaker detection, PDF guides) only work when the
  page runs inside Claude. As a standalone web app they're hidden and everything else works. A
  hosted backend for them is a separate decision.
- Accounts and sync across devices.

## How it's checked
- Playwright screenshots at 320×568, iPhone SE, iPhone 14 (portrait and landscape) and Pixel 7,
  before and after, with element positions compared for overlap.
- Load the app from a local server and confirm the service worker installs, the app works with the
  network cut off, and only the current book is downloaded.
- Smoke test: play, pause, scrub, switch book, open each menu tab, and check there are no console
  errors.
