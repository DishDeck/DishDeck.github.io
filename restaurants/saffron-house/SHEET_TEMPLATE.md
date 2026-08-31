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
| `image` | no | a public image URL (Google Drive share links won't work directly — use Imgur, GitHub, or your CDN) |
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
