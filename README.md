# DishDeck

A free, static, multi-restaurant menu site for GitHub Pages. One codebase,
unlimited restaurants — each with its own branding, colours, fonts and logo —
and a menu that updates live from an external source (a Google Sheet or a
JSON file) with **no redeploy needed** to change a price, mark a dish sold
out, or post today's special.

Two visual "skins" ship out of the box, both in dark and light mode:

- **Futuristic** — glass panels, neon rim light, animated scan line, grid mesh background.
- **Classic** — espresso/ivory paper, foil accents, hairline rules, serif display type.

Every restaurant picks its skin, its accent colours, its fonts and its logo
from a small config file. No restaurant-specific code is ever written — a new
restaurant is a new folder with a config and a menu, nothing else.

---

## Live structure

```
index.html            the storefront (menu, hero, specials, hours, footer)
board.html             a printable "Today's Board" page (specials, QR, PDF-ready)
admin.html             a no-backend price/status/specials editor for staff
qr.html                 a QR-code generator for any menu link or table card
akshaya-patra/, nova-table/, saffron-house/   clean-URL entry points, see "Clean URLs" below
  index.html + admin.html   (one copy of each root page, per restaurant)
config/
  tenants.json         registry: which restaurants exist, how to route to each
  runtime.json          optional CI/env overrides layered on top of each brand
restaurants/
  akshaya-patra/         classic-skin example, the default restaurant — a full
    brand.json             Indian menu (12 sections, 55 dishes: tandoor,
    menu.json               biryani, South Indian, curries, thali staples...)
  nova-table/            futuristic-skin example, sourced from a local menu.json
    brand.json
    menu.json
  saffron-house/         classic-skin example — an Indian restaurant (butter
    brand.yaml            chicken, biryani, tandoori, dal makhani, gulab jamun),
    menu.json              and documents the Google Sheet path
    SHEET_TEMPLATE.md    exact columns to use if you switch it to a live Sheet
assets/
  css/  theme.css (tokens + both skins), app.css, admin.css, qr.css
  js/   config.js, data.js, theme.js, hours.js, yaml.js, util.js, app.js, admin.js, qr.js
```

## How a restaurant is chosen

DishDeck is one deployed site serving many restaurants. On load it resolves
which one to show, in this order:

1. `?r=<id>` in the URL — e.g. `index.html?r=saffron-house`
2. a clean `/<id>/` path — e.g. `/nova-table/` (see "Clean URLs" below)
3. a `/r/<id>/` path segment (an older, equivalent form of the same thing)
4. `#/<id>` in the URL hash
5. the `hosts` map in `config/tenants.json` (for a custom domain per restaurant)
6. `default` in `config/tenants.json` — currently **Akshaya Patra**

For a single-restaurant deployment, just set `default` and ignore the rest.

## Clean per-restaurant URLs

`?r=akshaya-patra` always works with zero setup, but a clean URL like
`DishDeck.github.io/akshaya-patra/` reads better on a menu card or a QR
code — and `DishDeck.github.io/akshaya-patra/admin` gets the same restaurant's
price/status editor with nowhere to type. GitHub Pages has no server-side
rewriting, so this repo gets clean URLs the only way a static host can: a
real folder per restaurant at the repo root, containing a copy of the root
`index.html` and `admin.html`. That's what `akshaya-patra/`, `nova-table/`
and `saffron-house/` are — open any of their `index.html`/`admin.html` next
to the root ones, they're identical. The app resolves which restaurant to
show from the URL path itself (step 2 above), so neither shell needs to know
its own restaurant's id — the same two files work unmodified in every
restaurant's folder.

`/<id>/admin` (no `.html`) works because GitHub Pages serves `<name>.html`
for a request to `/<name>` whenever no file extension is given and no folder
of that exact name exists — the same behaviour that lets `/akshaya-patra`
(no trailing slash) find that folder's `index.html`. If that ever doesn't
resolve on your specific setup, `/<id>/admin.html` with the extension always
works regardless.

To give a new restaurant `<your-id>` the same two clean URLs:

```bash
mkdir <your-id>
cp index.html admin.html <your-id>/
```

That's it — no edits to either copied file. If you ever restructure the root
`index.html` or `admin.html`, copy it over every restaurant folder's copy
again to keep them in sync (there's currently no build step doing this for
you).

**A true subdomain** (`akshayapatra.dishdeck.github.io`) is not something
GitHub or anyone else can hand out under `github.io` — that namespace belongs
to GitHub. It becomes possible once you point your **own** domain at GitHub
Pages (e.g. `akshayapatra.yourdomain.com` via a CNAME record); the `hosts` map
in `config/tenants.json` is exactly for that case.

## Getting your own restaurant live in 5 minutes

1. Copy `restaurants/akshaya-patra/` (or `nova-table/`/`saffron-house/`) to `restaurants/<your-id>/`.
2. Edit `brand.json` (or `.yaml`) — name, tagline, contact info, hours, and
   `theme.skin` / `theme.accent` / `theme.accent2` to taste. Drop a logo file
   in the folder and point `logo.src` at it, or leave it blank for an
   auto-generated monogram.
3. Edit `menu.json` — or switch `data.source` to `sheet` and point it at a
   Google Sheet (see below) if you want non-technical staff editing it.
4. Add an entry for `<your-id>` to `config/tenants.json`'s `restaurants` array.
5. Optional — for clean URLs instead of `?r=`: `mkdir <your-id> && cp index.html admin.html <your-id>/`.
6. Commit and push. GitHub Pages (via the included Actions workflow) deploys
   automatically. Visit `/?r=<your-id>` (or `/<your-id>/` and `/<your-id>/admin`
   if you did step 5).

## Changing prices / today's special / sold-out — without touching code

Two ways, both free:

### A. Edit the JSON in the repo (fine for occasional changes)
Open `restaurants/<id>/menu.json`, change a `price`, flip `status` to
`"soldout"`, `"off"`, or back to `"on"`, tick `"special": true` and set
`"specialPrice"`. Commit. The live site picks it up on its next
`autoRefreshSeconds` poll (default 120s) or on page reload — no build step.

### B. Use a Google Sheet (best for daily/staff editing, zero code)
Point `data.source: sheet` and `data.sheetId: "<your sheet id>"` in a
restaurant's brand config. Share the sheet as "Anyone with the link: Viewer".
Staff then edit price/status/special columns directly in Sheets from a phone
or laptop; the live site re-reads it automatically. Full column reference:
[`restaurants/saffron-house/SHEET_TEMPLATE.md`](restaurants/saffron-house/SHEET_TEMPLATE.md).
This works because Google Sheets can export any sheet as a public CSV URL —
no API key, no server, and it stays inside GitHub Pages' free static hosting.

### C. Use `admin.html` as a quick local editor
Open `/<id>/admin` (or `admin.html?r=<id>`) for a spreadsheet-like grid of the
current menu. Edit prices/status/specials, then **Download menu.json**
(commit it over the restaurant's file) or **Copy CSV** (paste it over the
Menu tab of a Google Sheet). It never writes anywhere by itself — this is a
static site with no server, so "save" always means "export, then commit or
paste it yourself".

## Daily specials board

`board.html?r=<id>` renders today's specials (or the first few dishes, if
none are flagged) as a clean, printable page with a **Print / Save as PDF**
button and a QR code linking back to the live menu — handed to the
front-of-house to print each morning, or projected on a screen. It reads the
same live menu source as the storefront, so marking a dish `special: true` in
the Sheet/JSON is the only step needed.

## QR codes

Every menu comes with a scannable code for free, no extra setup:

- **On the printable board** (`board.html?r=<id>`) — printed automatically
  in the corner, linking to that restaurant's menu.
- **`qr.html`** — a standalone generator: pick a restaurant (auto-fills its
  menu link) or type any URL, choose a size, then open the code full-size to
  save it for a table card, flyer, or window sticker. Linked from the top of
  `admin.html` as "Table QR code".

Codes are generated by a free public API at request time (no key, nothing
stored) rather than a bundled library, so the site's own JS stays at zero
extra weight for a feature most visitors never trigger themselves — see the
comment on `qrImageUrl` in `assets/js/util.js` if you'd rather vendor an
offline encoder instead.

## Dynamic data sources supported

Set per restaurant under `data:` in its brand config:

| `source` | Where prices/menu live | Setup |
|---|---|---|
| `json` (default) | `restaurants/<id>/menu.json` in this repo, or any absolute URL | edit and commit, or point at any JSON API |
| `csv` | any published CSV URL | `data.csvUrl: "https://..."` |
| `sheet` | a Google Sheet, tab per table | `data.sheetId` + `data.sheets: {menu, categories, settings}` |

If the source is briefly unreachable, the storefront falls back to the last
successfully loaded menu (cached in the visitor's browser) and shows a small
"showing cached menu" notice instead of an empty page.

## Mobile-first

Most guests open this at the table on a phone, not at a desk, so that's the
default layout, not a squeezed-down afterthought:

- Category chips and search sit in their own full-width rows under 640px,
  each large enough to tap comfortably.
- A **Call / WhatsApp / Book** bar stays pinned to the bottom of the screen
  on phone widths, within one-handed thumb reach, instead of living only in
  the header where it's a stretch to reach on a tall screen.
- The dish detail sheet caps its own height and scrolls internally, so it
  never runs off the bottom of a small screen.
- Searching always looks across the *entire* menu regardless of which
  category chip is selected — see "Search" below.

## Dish photos & video

Every dish can carry an `image`, a short `video` (`.mp4`/`.webm`), or both —
set per dish in `menu.json` or in the Sheet's `video` column (see
[`SHEET_TEMPLATE.md`](restaurants/saffron-house/SHEET_TEMPLATE.md)). With a
video set:

- the **card** shows a muted, looping preview that only starts loading once
  it actually scrolls into view (nothing is fetched for a clip a guest never
  scrolls to), and pauses again the moment it scrolls back out;
- opening the dish plays the same clip **with sound** and normal controls;
- a guest with `prefers-reduced-motion` on, or an active "Data Saver"
  connection, never gets the autoplay preview at all — just the poster image
  (`image`, or the clip's first frame if `image` is blank) — since an
  autoplaying muted clip is a fair trade for someone with data to spare, and
  a battery/bandwidth cost for someone who explicitly said they'd rather not.

No video required for any dish — plain `image` continues to work exactly as
before.

## Search

Typing matches **every word you type against every dish**, in any order and
anywhere in its name, description, category, or tags — so `chicken spicy`
and `spicy chicken` both find "Spicy Miso Chicken", and `veg` finds every
`vegan`/`veg`-tagged dish. A search always looks at the whole menu, even if a
category chip is selected, since narrowing to one section while trying to
search defeats the point.

## Design system

`assets/css/theme.css` defines every colour/spacing/font as a CSS custom
property, redefined per skin (`futuristic` / `classic`) and per mode
(`dark` / `light`) — four total combinations, chosen per restaurant via
`theme.skin` and `theme.mode` (`auto` follows the visitor's OS setting, with a
manual toggle in the header). `assets/css/app.css` builds the actual page out
of those tokens only — no restaurant-specific CSS is ever needed; a new brand
is colours and fonts in a config file, not a new stylesheet.

## Local preview

No build step — but browsers block `fetch()` on `file://` pages, so serve it:

```bash
# any static file server works; for example:
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080/` (Akshaya Patra, the default) or
`http://localhost:8080/?r=nova-table` / `?r=saffron-house` for the others.

## Deploying

The included `.github/workflows/pages.yml` deploys the repo root to GitHub
Pages on every push to `main` via GitHub's official Pages Action — nothing to
build, nothing to install. In the repo's **Settings → Pages**, set the source
to **GitHub Actions** once, and every push after that goes live on its own.

## Notes / limitations

- This is a fully static site — there is no backend, no database, and no
  authentication on `admin.html`. Anyone who can reach the page can open the
  editor; it only ever produces a file to download or copy, it never writes
  back anywhere. Don't rely on it to gate who can change prices — gate that
  with who has edit access to the Sheet, or who can push to this repo.
- `config/runtime.json` is meant for non-secret overrides only (e.g. a
  banner, a sheet id per environment). It ships to every visitor's browser —
  never put an API key or anything private in it.
- Google Sheets CSV export has no caching guarantees and is rate-limited for
  very high traffic; for a busier site, mirror the sheet into `menu.json` via
  a scheduled GitHub Action instead of reading Sheets directly at page-load.
