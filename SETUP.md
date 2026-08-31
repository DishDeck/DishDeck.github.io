# DishDeck Setup Guide

A step-by-step guide to launching a restaurant menu on DishDeck.

## Quick start: 5 minutes to live

### 1. Create your restaurant folder

Copy an existing restaurant as a template:

```bash
cp -r restaurants/akshaya-patra restaurants/my-restaurant
```

(Or use `nova-table` for futuristic theme, `saffron-house` for classic + YAML config + Google Sheets example.)

### 2. Edit the brand config

Open `restaurants/my-restaurant/brand.json`:

```json
{
  "name": "My Restaurant",
  "tagline": "Your tagline here",
  "theme": {
    "skin": "classic",
    "accent": "#e0a63c",
    "accent2": "#b23a2e"
  },
  "contact": {
    "phone": "+1-234-567-8900",
    "address": "123 Main St, City, State",
    "email": "hello@myrestaurant.com"
  },
  "hours": {
    "Mon": "11:00-22:00",
    "Tue": "11:00-22:00",
    "Wed": "11:00-22:00",
    "Thu": "11:00-22:00",
    "Fri": "11:00-23:00",
    "Sat": "10:00-23:00",
    "Sun": "10:00-21:00"
  }
}
```

**Theme options:**
- `skin`: `"futuristic"` (glass, neon, animation) or `"classic"` (paper, foil, serif)
- `accent`: main brand colour (buttons, highlights) — any hex code
- `accent2`: secondary accent (special prices, markers)

**Logo:** Drop an image in the folder (`logo.png`, `logo.svg`) and add to config:

```json
"logo": { "src": "logo.png", "alt": "My Restaurant logo" }
```

Leave it blank for an auto-generated monogram from the restaurant's initials.

### 3. Edit the menu

Open `restaurants/my-restaurant/menu.json`. It's an array of dishes:

```json
[
  {
    "id": "butter-chicken",
    "category": "Curries",
    "name": "Butter Chicken",
    "desc": "Tender chicken in a silky tomato and cream sauce",
    "price": 480,
    "image": "butter-chicken.jpg",
    "video": "butter-chicken.mp4",
    "tags": ["chicken", "classic"]
  }
]
```

**Required fields:** `id`, `category`, `name`, `price`

**Optional fields:**
- `desc` — dish description
- `image` — relative path to image file (e.g., `images/dish.jpg`)
- `video` — relative path to video file (`.mp4` or `.webm`)
- `tags` — array of searchable tags
- `spice` — number (1–4) for a spice icon badge
- `status` — `"on"` (default, served), `"off"` (not available today), `"soldout"` (sold out)
- `special` — boolean; if `true`, set `specialPrice` to show discounted price
- `specialPrice` — the discounted price, shown with a strikethrough over `price`

**No special characters.** Commas in names are OK; quote properly in JSON. Emoji work in descriptions.

### 4. Register the restaurant

Open `config/tenants.json`, add an entry to the `restaurants` array:

```json
{
  "id": "my-restaurant",
  "name": "My Restaurant",
  "dir": "restaurants/my-restaurant",
  "config": "brand.json"
}
```

If your restaurant uses YAML instead of JSON, set `"config": "brand.yaml"` — see `saffron-house` for an example.

### 5. Push to GitHub

```bash
git add .
git commit -m "Add My Restaurant menu"
git push
```

GitHub Pages deploys automatically. Visit:
- `https://yourusername.github.io/DishDeck.github.io/?r=my-restaurant` (or just deploy to your own domain)
- `https://yourusername.github.io/DishDeck.github.io/admin.html?r=my-restaurant` to edit prices on the fly

---

## Customization

### Change which restaurant appears by default

Open `config/tenants.json`:

```json
{
  "default": "my-restaurant",
  ...
}
```

Now `/?r=` defaults to your restaurant.

### Use a Google Sheet for the menu instead of JSON

1. Create a Google Sheet with columns: `name`, `category`, `price`, `desc`, `image`, `video`, `status`, `special`, `specialPrice`, `tags`, `spice`.
   See [`restaurants/saffron-house/SHEET_TEMPLATE.md`](restaurants/saffron-house/SHEET_TEMPLATE.md) for details.

2. Share it "Anyone with the link: Viewer" (not edit).

3. In `brand.json`, replace `data: {}` with:

```json
"data": {
  "source": "sheet",
  "sheetId": "YOUR_SHEET_ID",
  "sheets": {
    "menu": "Menu"
  }
}
```

The sheet ID is the long hash in the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`.

Staff can now edit the menu in Sheets, and the live site picks it up automatically every 2 minutes.

### Change price/status without touching code

**Option A: Edit JSON in the repo**
- Open `restaurants/my-restaurant/menu.json`
- Change `price`, `status`, or `special`/`specialPrice`
- Commit and push
- Site updates within 2 minutes on next auto-refresh poll

**Option B: Use admin.html**
- Open `/admin.html?r=my-restaurant`
- Edit the grid (inline like a spreadsheet)
- Click **Download menu.json** and commit the file back to the repo
- Or **Copy CSV** to paste into a Google Sheet

**Option C: Edit the Google Sheet directly** (if configured)
- Staff edit the Sheet from a phone at the table
- Site auto-refreshes every 2 minutes

### Add a different visual theme

See `theme.css` for the 4 built-in combinations:
- **Futuristic light/dark** — glass panels, neon accents, scan line animation
- **Classic light/dark** — paper texture, foil, serif titles

To add a new skin, extend `theme.css`:

1. Add a new `[data-skin="myname"]` block with custom tokens (background, text colours, fonts, etc.)
2. In the brand config, set `theme.skin: "myname"`

No restaurant-specific CSS is needed; just colours and fonts in the config.

### Add video to dishes

1. Upload a short MP4 or WebM file to the restaurant folder (e.g., `videos/dish.mp4`)
2. In `menu.json`, set `video: "videos/dish.mp4"` on the dish
3. The card shows a muted loop that loads only when it scrolls into view
4. Clicking the card plays it with sound
5. Data-saver and reduced-motion modes show the poster image instead

### Add social media links

In `brand.json`, add a `social` object:

```json
"social": {
  "instagram": "https://instagram.com/myrestaurant",
  "facebook": "https://facebook.com/myrestaurant",
  "x": "https://x.com/myrestaurant",
  "youtube": "https://youtube.com/@myrestaurant"
}
```

Links appear in the footer.

### Make a QR code for a menu card or poster

Go to `/qr.html`:
- Select your restaurant (auto-fills the menu link)
- Choose a size (100–500px)
- Click to open the code full-size, then save/screenshot

Or generate a URL directly: `qrImageUrl('https://yourdomain.com/?r=my-restaurant', 300)`

---

## Data sources & formats

### menu.json

Array of dish objects:

```json
[
  {
    "id": "unique-id",
    "category": "Section Name",
    "name": "Dish Name",
    "desc": "Optional description",
    "price": 399,
    "image": "path/to/image.jpg",
    "video": "path/to/video.mp4",
    "tags": ["tag1", "tag2"],
    "spice": 2,
    "status": "on",
    "special": false
  }
]
```

### Google Sheets

Create a sheet with columns: `name`, `category`, `price`, `desc`, `image`, `video`, `tags`, `spice`, `status`, `special`, `specialPrice`.

Each row is a dish. See [`restaurants/saffron-house/SHEET_TEMPLATE.md`](restaurants/saffron-house/SHEET_TEMPLATE.md) for exact column order and special values.

### brand.json / brand.yaml

Restaurant metadata and theme:

```json
{
  "name": "Restaurant Name",
  "tagline": "Tagline",
  "theme": {
    "skin": "classic" | "futuristic",
    "accent": "#hex-color",
    "accent2": "#hex-color"
  },
  "logo": {
    "src": "logo.png",
    "alt": "Logo alt text"
  },
  "contact": {
    "phone": "+1-234-567-8900",
    "address": "123 Main St",
    "email": "hello@restaurant.com",
    "maps": "https://maps.google.com/?q=address",
    "bookUrl": "https://reservation-system.com"
  },
  "hours": {
    "Mon": "11:00-22:00",
    ...
  },
  "social": {
    "instagram": "https://...",
    "facebook": "https://...",
    "x": "https://...",
    "youtube": "https://..."
  },
  "data": {
    "source": "json" | "sheet" | "csv",
    "sheetId": "...",
    "sheets": { "menu": "Menu" },
    "csvUrl": "https://..."
  },
  "features": {
    "callToOrder": true,
    "printBoard": true
  }
}
```

All fields optional except `name`. Defaults are sensible.

---

## Local testing

No build step, but browsers block `fetch()` on `file://` URLs. Use any static server:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080/?r=my-restaurant` and test on mobile via `chrome://inspect` or by tethering from a real device.

---

## Deployment

The repo includes `.github/workflows/pages.yml` which deploys to GitHub Pages on every push to `main`:

1. In your repo's **Settings → Pages**, set **Source** to **GitHub Actions**
2. Push to `main`
3. Site goes live in seconds

To deploy to your own domain instead of `github.io`, point your DNS at GitHub's Pages IP addresses and add a CNAME record — see [GitHub's docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

---

## Troubleshooting

### Menu doesn't update
- **GitHub Pages cache:** Hard-refresh in the browser (`Ctrl+Shift+R` or `Cmd+Shift+R`)
- **Menu source unreachable:** Site falls back to cached version; check browser console for errors
- **Git not pushed:** Changes in the repo don't go live until pushed to `main`

### Search doesn't find dishes
Search matches words anywhere in `name`, `desc`, `category`, or `tags` — case-insensitive, any order. Test with a common ingredient name or category.

### Images/videos don't show
- Paths must be relative to the restaurant folder (e.g., `images/dish.jpg`)
- Or absolute from the root (e.g., `/assets/dish.jpg`)
- Check the browser console for 404 errors

### Admin.html doesn't work
Admin is fully client-side (no backend) — it only exports JSON/CSV. Download and commit the file manually, or paste CSV into the Sheet.

### Different restaurants showing same menu
Check `config/tenants.json` — each restaurant entry must point to its own `menu.json` file and `brand.json` config.

---

## Architecture / How it works

**Zero backend.** The site is fully static HTML + CSS + vanilla JS:

1. **Tenant resolution:** On page load, the app checks (in order) `?r=<id>` → `#/<id>` → hostname in `hosts` map → `default` in config
2. **Config loading:** Fetch the restaurant's `brand.json` or `brand.yaml`, apply theme tokens to the page
3. **Menu loading:** Fetch the restaurant's `menu.json` (or a Google Sheet URL), normalize the data, cache it in the browser
4. **Rendering:** Generate HTML for the menu grid, search, category chips, footer, etc. — all in the browser
5. **Search:** Match every word against every field; live as you type
6. **Video:** Lazy-load clips with IntersectionObserver (only fetch when scrolled into view)
7. **Auto-refresh:** Re-poll the menu every 2 minutes; if the source is down, fall back to cached version

**Design tokens:** Every colour, spacing, font, and radius is a CSS custom property, redefined per skin/mode — no restaurant-specific CSS needed.

**No authentication:** Admin.html is read-only + export-only. Gate access to menus by who can push to the repo or who can edit the Sheet.

---

## FAQ

**Can I add my own custom fields to dishes?**
Yes — add them to `menu.json`. The app ignores unknown fields, so you can store whatever you want (allergens, prep time, etc.). To display them, edit `assets/js/app.js` in the `dishCard()` function.

**Can I add my own custom sections to the page?**
Yes — edit the restaurant's `brand.json` to add custom data, then modify `assets/js/app.js` to use it.

**Do I need a backend?**
No. The site is fully static. Pricing changes go to GitHub or a Google Sheet; the browser syncs from there every 2 minutes.

**Can I host this on my own domain?**
Yes. Push your repo to GitHub, then point your domain at GitHub Pages via DNS CNAME record, or use another static host (Netlify, Vercel, etc.) — just set the deploy source to the repo root.

**How many restaurants can I run on one DishDeck instance?**
Unlimited. The site is a single codebase; each restaurant is a config folder. One deploy serves them all.

**Can I remove the "Powered by DishDeck" footer link?**
Sure — edit `assets/js/app.js` in the `renderFooter()` function and remove it. But linking back to the project is appreciated!

---

## Contributing

Found a bug? Got a feature idea? Issues and PRs welcome on [GitHub](https://github.com/anthropics/dishdeck).

---

## License

MIT. Use freely, modify, deploy anywhere.
