# Running this restaurant off a Google Sheet

This restaurant currently ships with a static `menu.json`. To make prices, the
daily special, and sold-out flags editable by staff with no code and no
redeploy, switch its `data:` block in [brand.yaml](brand.yaml) to a Sheet.

## 1. Create the sheet

Make a Google Sheet with up to three tabs (only **Menu** is required):

### Tab "Menu" — one row per dish

| column | required | notes |
|---|---|---|
| `id` | no | stable slug; auto-generated from name if blank |
| `category` | yes | groups dishes into sections, e.g. `starters` |
| `name` | yes | dish name |
| `description` | no | shown under the name |
| `price` | yes | plain number, no currency symbol |
| `variants` | no | e.g. `Half=180 \| Full=320` |
| `image` | no | a public image URL (Google Drive share links won't work directly — use Imgur, GitHub, or your CDN); used as the poster frame if `video` is also set |
| `video` | no | a public **.mp4** or **.webm** URL — a short (5–15s) clip of the dish. Shown as a muted, looping preview on the card and played with sound when a guest opens it. Give two URLs separated by `\|` (e.g. an `.mp4` and a `.webm` copy) if you have both, for smaller file size on browsers that support webm |
| `tags` | no | comma-separated: `veg, bestseller, chef` |
| `spice` | no | `0`–`3` |
| `status` | yes | `on`, `soldout`, `off`, or `hidden` |
| `special` | no | `TRUE` to feature on Today's Board |
| `special_price` | no | discounted price while featured |
| `special_from` / `special_to` | no | `YYYY-MM-DD`; leave blank for "starting now" / "no end" |
| `sort` | no | lower numbers appear first within a category |
| `note` | no | small print shown in the dish detail sheet |

### Tab "Categories" — optional, controls section order and labels

| column | notes |
|---|---|
| `id` | must match the `category` values used in Menu |
| `name` | display name, e.g. `Mains & Curries` |
| `note` | small subtitle under the section heading |
| `sort` | lower numbers appear first |

### Tab "Settings" — optional, restaurant-wide switches

| key | value |
|---|---|
| `closedToday` | `TRUE` / `FALSE` — shows a "closed today" banner site-wide |
| `closedNote` | shown next to the banner, e.g. "Closed for a private event" |
| `announcement` | a short banner message, any day |
| `specialsNote` | replaces the tagline under "Today's Board" |

## 2. Share it

**File → Share → General access → "Anyone with the link" → Viewer.**
No Google account or API key needed — DishDeck reads it as a public CSV export.

## 3. Point brand.yaml at it

```yaml
data:
  source: sheet
  sheetId: "1AbCDefGhIJkLmnoPQRstuVWxyz0123456789"   # from the sheet's URL
  sheets: { menu: Menu, categories: Categories, settings: Settings }
```

The sheet id is the long string in the URL between `/d/` and `/edit`.

## 4. Edit freely

Change a price, flip `status` to `soldout`, tick `special` for tonight's
feature — the live site picks it up within `autoRefreshSeconds` (default 120s,
set per restaurant in `brand.yaml` → `features.autoRefreshSeconds`), no commit,
no redeploy. A visitor can also force it with `?debug=1` in the console to see
which source loaded.

If the sheet is ever unreachable, the site falls back to the last successful
copy (cached in the visitor's browser) and shows a small "showing cached menu"
notice rather than an empty page.

## Adding a dish video

Most guests are on mobile data, so keep clips short and light: **5–15
seconds, under ~3–5MB, 720p is plenty**. A vertical or square crop (9:16 or
1:1) tends to look better than widescreen in the card grid. Host the file
anywhere that serves a direct `.mp4`/`.webm` URL — GitHub itself works for a
small file (drag it into an Issue/Discussion comment to get a public link,
or commit it into the restaurant's own folder and reference it as a plain
filename in the `video` column).

The card preview never autoplays for a guest with `prefers-reduced-motion`
switched on or a "Data Saver" connection — they see the poster frame instead,
and can still tap into the dish to watch it deliberately, with sound.
