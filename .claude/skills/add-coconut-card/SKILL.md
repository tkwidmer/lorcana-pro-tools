---
name: add-coconut-card
description: Add a newly released [Format Coconut] card to this app — its art to the Proxy Generator and the card to the Coconut deck builder. Use whenever the user says "add this coconut card", pastes or attaches new Coconut card art, or points at a new Coconut release (they ship roughly weekly). Covers deriving the card id, verifying the base card and inks against LorcanaJSON, transcribing the printed ability, finding duels.ink's own card id, and the counts in tests and CLAUDE.md that will silently fail if you forget them.
---

# Add a [Format Coconut] card

New Coconut cards are released in waves (currently about one batch a week).
Each one is an alternate-ability variant of a **real printed Lorcana card**,
with its own full-art face. Adding one is mostly data entry plus an image —
but there are four hardcoded counts that break if you miss them, and two
fields you must verify rather than read off the art.

Read CLAUDE.md's "[Format Coconut] Deck Builder", "Coconut Decklist Text" and
"Coconut Card Faces" sections first if you haven't this session.

## What you need from the user

The card art. Anything works — an attached image, a zip, a link, or a
print-ready PDF sheet. If they give a Google Drive folder link, the Drive
connector may only surface some files; ask for a direct attachment if the art
isn't there.

If the art arrives as a **print-ready PDF** of the whole set, extract the
fronts with PyMuPDF rather than screenshotting:

```python
import pymupdf
d = pymupdf.open('sheet.pdf')
# Front pages carry one image per card; back pages repeat a single shared image.
for pi in (0, 2):
    for inf in d[pi].get_image_info(xrefs=True):
        img = d.extract_image(inf['xref'])
        open(f"front_{inf['xref']}.{img['ext']}", 'wb').write(img['image'])
```

## Steps

### 1. Identify the card and verify its base card

Read the name and subtitle off the art, then **confirm the base card exists in
LorcanaJSON** — this is what gives you `baseFullName` and, crucially, the
authoritative `inks`.

```bash
npm run dev                       # serves /api/cards via the Vite proxy
curl -sf http://localhost:5173/api/cards -o /tmp/allCards.json
```

```js
const cards = (JSON.parse(fs.readFileSync('/tmp/allCards.json','utf8')).cards)
cards.filter(c => c.name === 'Belle & Beast')
     .forEach(c => console.log(c.fullName, '|', c.color))
```

**Do not read the inks off the ink badge alone.** Take them from the base
card's `color` run through `resolveColors()` (`src/lib/inkColors.js`), which
already splits Lorcana's dual-ink `"Amethyst-Emerald"` form. The badge is a
good cross-check, not the source. If no base card matches, stop and ask — a
Coconut card with no printed counterpart would break `getCardLimit()` and the
deck builder's auto-seeded 4x, and that's a rules question, not a code one.

### 2. Derive the id

The `id` is the art filename and the deck builder's stored key, so it must be
stable. It's the base card's `fullName`, lowercased, with `&` spelled out and
punctuation dropped:

```js
const id = fullName.toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/['\u2019]/g, '')        // drop apostrophes FIRST, or "Canard's" -> "canard-s"
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
// 'Mr. Incredible - Super Strong'            -> 'mr-incredible-super-strong'
// "Darkwing Duck & Launchpad - St. Canard's Finest"
//   -> 'darkwing-duck-and-launchpad-st-canards-finest'
```

Check the result against `public/coconut-cards/` — every existing card's id is
this function applied to its `baseFullName`, so if yours doesn't round-trip for
the current 25, the rule has drifted and the filename will be wrong.

### 3. Save the art

Write it to `public/coconut-cards/<id>.jpg`. It must be JPEG (the whole
directory is, and `coconutCardImageUrl()` hardcodes `.jpg`) and 5:7.

```python
from PIL import Image
im = Image.open(src).convert('RGBA')
bg = Image.new('RGB', im.size, 'white')      # flatten alpha; PNGs often have it
bg.paste(im, (0, 0), im)
bg.save(f'public/coconut-cards/{id}.jpg', 'JPEG', quality=90, optimize=True, progressive=True)
```

750x1050 is exactly 300 DPI at 2.5"x3.5" and is what the existing faces use;
640x896 (~256 DPI) is acceptable. Never upscale to hit a number. If the art is
already JPEG at the right size, copy it byte-for-byte rather than re-encoding.

Reject a face stamped **"FOR BETA TEST ONLY"** or obviously greyed out — that's
an older revision. The current faces are full colour with no watermark.

### 4. Transcribe the printed ability

Read it off the art at full resolution. The rules-text band sits at roughly
0.655-0.895 of the card height:

```python
w, h = im.size
im.crop((int(w*0.04), int(h*0.655), int(w*0.96), int(h*0.895))).save('text.png')
```

Transcribe **what is printed**, not what you expect. Write ink costs as the
word "ink" and lore as `◇`, matching the existing entries. Obvious typos on
the card (there have been some) get silently corrected — mention it to the
user rather than preserving the typo.

If the drop also reships existing cards, diff their text too: a past wave
quietly rewrote five abilities (Mufasa's "top 3" became "top 2", Robin Hood's
was replaced outright). Stale `ability` strings sit right next to the art in
the deck builder, so they read as a contradiction.

### 5. Find duels.ink's card id (optional field)

duels.ink declares the Coconut card in a decklist with a `Coconut: <id>`
header, ids matching `/^coconut-(\d+)$/`. Their ids come from their own client
bundle, which lists the precon decks:

```bash
curl -sS --compressed https://duels.ink/ -o /tmp/home.html
grep -aoE 'src="/assets/index-[^"]*\.js"' /tmp/home.html      # hashed, changes
curl -sS --compressed https://duels.ink/assets/index-XXXX.js -o /tmp/app.js
grep -aoE '"id":"coconut-[a-z0-9-]+","name":"[^"]{0,60}".{0,200}?"coconutCardId":"coconut-[0-9]+"' /tmp/app.js
```

Numbering follows the order cards appear on the official print sheet, which is
a useful cross-check when a precon doesn't name one.

**duels.ink lags the releases.** If the new card isn't there, simply omit
`duelsId` — the export falls back to the `# Coconut Card:` comment, which still
round-trips in this app. Never invent an id; a wrong one imports as the wrong
leader.

### 6. Add the entry

Append to `COCONUT_CARDS` in `src/lib/coconutCards.js`, keeping the existing
shape:

```js
  {
    id: 'belle-and-beast-certain-as-the-sun',
    name: 'Belle & Beast',
    version: 'Certain as the Sun',
    baseFullName: 'Belle & Beast - Certain as the Sun',
    inks: ['ruby', 'sapphire'],        // every ink must be locked by a deck
    duelsId: 'coconut-019',            // omit entirely if duels.ink lacks it
    ability: 'Whenever one of your characters with cost 5 or more readies, draw a card.',
  },
```

Add `extraCopy: { name: '...', maxCopies: 4 }` only if the card grants a second
4-of beyond its own base card (so far only Nick Wilde / Pawpsicle). The new
frame prints no reminder text, so absence of a reminder line is **not**
evidence a rule was dropped — ask.

**Nothing else needs wiring.** The Proxy Generator's picker and its "Add all N"
button, and the deck builder's ink-grouped picker, all iterate `COCONUT_CARDS`
and pick the card up for free.

### 7. Update the counts that will otherwise fail

These are the easy ones to miss:

| File | What |
|---|---|
| `src/lib/__tests__/coconutFormat.test.js` | `expect(COCONUT_CARDS.length).toBe(25)` |
| `src/lib/__tests__/coconutDecklistText.test.js` | the two `toBe(18)` duels.ink id assertions — only if you set a `duelsId` |
| `CLAUDE.md` | "all 25", "25 beta Coconut cards", "so all 25 are bundled", "Add all 25" |

Also refresh CLAUDE.md's "catalog stops at `coconut-018`" line if duels.ink has
extended its range.

### 8. Verify

```bash
npm run lint
npm test
```

Then confirm the data really lines up, rather than trusting the transcription:

```js
// every card resolves against LorcanaJSON, and inks match the base card exactly
const base = byFullName.get(c.baseFullName.toLowerCase())
resolveColors([base.color])   // must deep-equal [...c.inks].sort()
```

Finally look at it. Per CLAUDE.md, drive the **local dev server**, not the
Vercel preview (preview is behind deployment protection and blocks Playwright):

- `/proxy` -> "+ Coconut cards": the new face renders, "Add all N" is N+1.
- `/coconut-deck-builder` -> "+ New deck": it appears under each of its inks,
  and picking it locks exactly those inks and seeds 4x the base card.

Watch the picker at ~1366px too: a long name wraps to two lines there, which is
fine (the grid is `items-start`), but it's where layout regressions show.

### 9. Ship it

Branch, commit, push, open a PR with the Vercel preview link and a screenshot
of the new card in the picker, per CLAUDE.md's Pull Requests section.

## Batch drops

For a wave of several cards, do step 1 for all of them in one LorcanaJSON pass
before writing anything — it's the step most likely to turn up a surprise (a
card that's a duo, or one whose subtitle differs from the art). Then loop the
rest. Update each count once, at the end, not per card.
