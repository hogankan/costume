# Costume Sizing & Ordering

Matches dancers' measurements to costume sizes across multiple costume companies,
flags the dancers a human needs to look at, and produces an order sheet ready to
submit.

## The rule that drives everything

**Girth is the binding constraint, and it rounds up.**

Girth is measured over one shoulder, down through the crotch and back up to the
same shoulder. It is the one dimension a seamstress cannot let out: a too-small
girth cannot be worn on recital day, while a too-large bust, waist or hip can be
taken in. So:

1. Girth alone selects the size — **even when every other measurement fits the
   smaller size.** There is no "closest overall fit" averaging anywhere in this
   codebase, and adding one would produce unwearable recommendations.
2. Girth landing in a gap between two printed sizes resolves to the **larger** size.
3. Bust, waist, hips, inseam and height are **advisory**: reported as flags with
   direction and magnitude, never able to override the girth decision.

This is also the vendors' own rule. Revolution: *"If a student is in between
sizes, allow girth to be the guiding measurement to make the call."*

The one place advisory measurements participate is as a tiebreak *among sizes
that already satisfy girth*, which happens on charts carrying long variants
(IC vs ICL) where several rows legitimately contain the same girth. Girth still
gates the candidate set.

## Ordering shape

The **class is the ordering unit**, not the dancer. A studio uploads a class
roster and the whole class gets one costume, though individual dancers may take a
different colourway. Different classes may order from different companies in the
same season, so the order summary splits per company.

## The season catalogue

Costume ranges are fixed for a season, and a product page lists the sizes a
costume is **made** in rather than what is in stock (stock sits behind a vendor
login and is not needed for sizing). So catalogues are crawled once per season:

```bash
npm run catalog:crawl                      # every vendor with a crawler
npm run catalog:crawl -- --company revolution
npm run catalog:crawl -- --season 2026-2027 --resume
```

Results land in `catalog/{season}/{company}.json`, committed to the repo, with
products sorted by style number so re-crawling an unchanged catalogue produces no
diff at all. After that the app never contacts a vendor to pick a costume - it
searches the file.

Crawling is deliberately unhurried (a delay between every request); it runs once
a season, so there is no reason to hammer a vendor's servers. Products that fail
to parse are recorded in the file with their reason rather than silently dropped.

## How size charts get into the app

Every vendor publishes its sizing numbers as **images**, not text. Each product
page names the chart it uses and the crawler records that, so the charts needed
are discovered from the catalogue rather than guessed at:

```bash
npm run charts:seed -- --list   # what the crawled costumes actually reference
npm run charts:validate         # check every stored chart
```

There are three ways to get the numbers in, and **the API is the least important
of them**: all 406 Revolution costumes share just two charts, and Weissman has
six, so the whole system needs roughly eight charts ever.

1. **Type it in** — the app shows the vendor's chart image beside a table
   pre-filled with the size codes that costume offers. No API key, no dependency,
   and accurate because a person read it.
2. **Read it automatically** — `npm run charts:seed` with `ANTHROPIC_API_KEY` set.
   Produces a draft that must still be confirmed against the image.
3. Both write to `charts/{company}/{variant}.json`, committed, so the numbers
   every recommendation rests on are reviewable in a diff.

Which chart applies is decided by **the chart image the product page links to**,
with size codes only as a fallback. That ordering is load-bearing: Revolution's
male/unisex chart and its female chart share size codes, so style 27733
(`XSC SC MC LC XLC`) matches both by codes alone and would be sized against the
wrong garment.

**A sizing run refuses to execute against an unconfirmed chart**, and there are
no bundled placeholder charts. If nothing has been read, the app says so instead
of sizing against invented numbers.

Two things real charts taught the code:

- **Printed order is not girth order.** Revolution lists PA (Petite Adult, girth
  53-57) between XXLC (56-58) and SA (55-58), because it is a differently
  proportioned size rather than the next size up. The matcher orders by girth, not
  by printed position, and the validator only treats *most* steps going backwards
  as a real error.
- **A single printed value is the garment's dimension, not a fit range.** Charts
  print inseam as one number per size. Treating it as a range flagged every dancer
  whose leg differed from it, which made an entire class look like it needed
  review.

`ICL` / `MCL` / `SAL` are **separate long sizes with their own girth**, not fit
notes on `IC` / `MC` / `SA`.

## Try it

```bash
npm install
npm run dev
```

Open http://localhost:3000, drop in `sample-data/junior-jazz-roster.xlsx`, then
enter a costume by **style number or product URL** - e.g. `27776`. A style number
is answered from the crawled catalogue without contacting the vendor; a URL that
has not been crawled is fetched directly.

### A whole costume workbook at once

Drop in `sample-data/holiday-costume-workbook.xlsx` (or the `.pdf` of it). A
workbook with one tab per class, each with a `COSTUME` line above its table
(e.g. `A Wish 10096Y // 16179G (boy)`), is sized in one go:

- the costume is read from each tab and looked up automatically;
- a second style marked `(boy)` adds a checkbox list to choose who wears it;
- tabs marked `NOT SELECTED YET`, or with no measurements, are shown and skipped;
- two downloads: the order sheet, and the studio's own workbook with the Size
  column filled in (formatting kept).

PDFs are read from their text, so a PDF saved from Excel or Sheets works; a
scanned or photographed sheet is refused with a message rather than guessed at.
Regenerate the sample with `npx tsx scripts/make-sample-workbook.ts`.

Sizing needs at least one confirmed chart, so run `npm run charts:seed` first.
Until then the app will tell you no charts have been read rather than guessing.

The database is not needed for this flow; nothing is persisted yet.

## Setup

```bash
npm install
cp .env.example .env      # set DATABASE_URL and ANTHROPIC_API_KEY
npm run db:generate
npm run db:migrate        # needs a reachable Postgres
```

## Commands

| Command | What it does |
|---|---|
| `npm test` | Full test suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run demo` | End-to-end run on generated sample classes; writes `tmp/costume-order.xlsx` |
| `npm run charts:check` | Verify every chart image in the manifest is still reachable |
| `npm run charts:seed` | Extract chart images into `charts/` as drafts |
| `npm run charts:extract -- <url>` | Read one chart image and print it for eye-checking |
| `node scripts/show-workbook.mjs` | Print a built order workbook to the terminal |
| `npx tsx scripts/make-sample-roster.ts` | Regenerate the sample class roster |

## Layout

```
src/lib/sizing/     matcher (pure, no I/O), run orchestration
src/lib/charts/     extraction, validation, chart-to-costume resolution, manifest
src/lib/vendors/    per-company scrapers + the manual fallback
src/lib/import/     spreadsheet parsing, header mapping, unit detection
src/lib/export/     the order workbook
prisma/schema.prisma
charts/             confirmed chart library (committed)
```

The export workbook has four sheets: **Order Summary** (company → style → colour →
size → qty, what gets submitted), **By Class** (distribution day), **Master
Roster** (full audit trail including override reasons), and **Exceptions** (the
"re-measure these dancers before ordering" list, blocking first).

## Vendor status

All four vendors work with plain `fetch` — no headless browser anywhere. Enter a
style number, get the costume, tied to its chart.

| Vendor | Charts | Enter | Sizes |
|---|---|---|---|
| Revolution | 2 | style number or URL | from the product |
| Weissman | 7 | style number or URL | from the product |
| A Wish Come True | 3 | product URL | from the product |
| Layla's | 3 | style number or URL | not published — whole chart used |

Catalogues crawled: **406 Revolution**, **477 Layla's**. A style number for either
resolves from disk with no vendor request.

### Each vendor blocked in a different way

- **Weissman** looked hardest — its catalogue is client-rendered — but its product
  pages embed a `jsonProductLite` object with the style number, name, sizes,
  colours and the chart the product uses, and `weissmans.com/{style}.aspx` serves
  a product directly. It ended up the easiest.
- **A Wish Come True** sends an incomplete TLS certificate chain. Browsers and
  curl tolerate the missing intermediate; Node rejects it. Verification is relaxed
  for that one host — a public catalogue page, no credentials.
- **Layla's** returns 403 to Node and 200 to curl, and *no* header set changes it:
  they fingerprint the TLS handshake. Offering Chrome's cipher suite order rather
  than Node's default gets a 200.

### Where a vendor does not publish sizes

Layla's hides its per-costume size list behind a trade login. Rather than fetch
477 product pages that would not answer the question anyway, the crawl reads the
listing tiles — style number, name, URL — and ties every costume to Layla's one
chart.

An empty size list then means **the whole chart** rather than "nothing
orderable", so the costume can still be sized, and the interface says the range
was not confirmed with the vendor. That is the honest position: refusing to size
would be worse, and silently inventing a size list would be worse still.

## How far each chart has been verified

Nine charts were read off images, which is the one step where a wrong digit does
real damage. Every one has now been checked a second, independent way:

| Charts | Verification |
|---|---|
| A Wish Come True (3) | Read from **HTML tables**, not an image — authoritative |
| Weissman (7) | Matched the size table **embedded in a product page**, exactly |
| Layla's (3) | Re-read cell by cell (14 sizes x 5, 0 mismatches) **and** girth cross-checked against the chart's own centimetre row — worst disagreement 0.66" |
| Revolution (2) | Re-read cell by cell (13 sizes x 5, 0 mismatches) |

`npm run charts:crosscheck` re-runs the Layla's inch/centimetre check.

Each chart also carries the vendor's own measuring instructions and caveats,
because those do not follow from the numbers — Revolution's note that XLC and
XXLC "are made to fit a larger child, not a petite adult" is the kind of thing no
matcher would infer.

## What real charts taught the code

Every one of these came from a real vendor chart, and none would have surfaced
from invented test data.

- **Not every chart has girth.** Weissman's boys and mens charts print no girth
  column at all — those costumes are two-piece, so there is no shoulder-to-crotch
  dimension to constrain — and are sized on chest. Each chart declares its
  deciding measurement explicitly rather than having it inferred, so a chart that
  merely *lost* its girth column in transcription still fails loudly.
- **Printed order is not girth order.** Revolution lists PA (Petite Adult, girth
  53-57) between XXLC (56-58) and SA (55-58). The matcher orders by the deciding
  measurement, not by printed position, and only treats *most* steps going
  backwards as a real "read upside down" error.
- **A single printed value is the garment's dimension, not a fit range.** Charts
  print inseam as one number per size. Treating it as a range flagged every dancer
  whose leg differed, which made a whole class look like it needed review.
- **Long sizes can share girth exactly.** Weissman's ICL and MC both run 47-52;
  ICL carries IC's bust and waist with MC's length. Girth alone cannot separate
  them, which is what the advisory tiebreak is for.
- **Vendors ship lettered and very short style numbers.** 272 of Revolution's 406
  products use an `RC` prefix, and three are two or three digits.

## The results screen

Three views stacked, so a recommendation can be checked rather than taken on trust:

1. **Size chart used** — the whole chart as a table, with the rows this class
   actually needs highlighted and a count on each, and sizes the costume does not
   offer struck through. Where a chart came from an image, the original can be
   shown alongside for eye-checking. Vendor notes print underneath.
2. **Class measurements** — the roster as a grid, with every measurement that fell
   outside the assigned size highlighted in place: ▲ above the range, ▼ below,
   each with how far out it is. Girth is marked as the deciding measurement and
   shows the range it landed in.
3. **Results** — per-dancer size, rationale, flags, and the override control.

## Current state

Working end to end in the browser: upload a roster, correct the column mapping,
look up or hand-enter a costume, size the class, override individual dancers with
a recorded reason, and download the order workbook.

**Not yet built:** persistence (nothing is saved between sessions — the Prisma
schema exists but no migration has been run), auth and studio scoping, multiple
classes in one order sheet, the Weissman / A Wish Come True / Layla's scrapers,
and the declarative per-vendor rules overlay (e.g. Revolution's note that XLC and
XXLC fit a larger child rather than a petite adult).

**Not yet verified live:** chart extraction has never been run against the API —
it needs `ANTHROPIC_API_KEY`. Image fetching, hashing and downscaling are verified
against all seven real chart images. The database migration has not been run;
it needs a reachable Postgres.
