# Contributing to DishDeck

We welcome contributions! Here's how to get started.

## Areas we'd love help with

- **Bug fixes** — Found something broken? Open an issue with steps to reproduce
- **New skins** — Design a new visual theme (add to `theme.css`)
- **Data sources** — Support for new menu sources (e.g., Airtable, Notion)
- **Mobile improvements** — Better mobile UX, faster loading, new components
- **Documentation** — Clearer guides, better examples, translation

## Setting up locally

No build step required, but you need a local server:

```bash
git clone https://github.com/yourusername/DishDeck.github.io.git
cd DishDeck.github.io

# Start a local server (any of these work)
npx serve .
# or
python -m http.server 8080
# or
ruby -run -ehttpd . -p8080
```

Then open `http://localhost:8080/?r=akshaya-patra` and start testing.

## Code style

- **Vanilla JS** — no frameworks, no dependencies. Keep it simple.
- **CSS custom properties** — all layout/color/spacing goes through tokens in `theme.css`
- **No comments on the "what"** — code should be self-documenting. Comment only on the "why" if non-obvious.
- **Avoid premature abstraction** — three similar lines are better than one helper until the pattern is clear.

## Testing checklist before a PR

- [ ] Run locally: `npx serve .`
- [ ] Test root: `http://localhost:8080/` (should show Akshaya Patra)
- [ ] Test query param: `http://localhost:8080/?r=nova-table`
- [ ] Check console for errors (F12 → Console tab)
- [ ] Test on mobile (DevTools device mode or real phone)
- [ ] Search works (multi-word, case-insensitive)
- [ ] Dark/light toggle works
- [ ] Videos lazy-load (check Network tab, videos only load on scroll)
- [ ] Admin editor works: `/admin.html?r=akshaya-patra`

## File structure for PRs

Make changes in:

- **Core library:** `assets/js/*.js`
- **Styling:** `assets/css/*.css`
- **Config examples:** `restaurants/*/brand.json` or `brand.yaml`
- **Docs:** `README.md`, `SETUP.md`, `DEVELOPER.md`

Don't modify:

- `config/tenants.json` (registry; edit in your own deployment, not the template)
- `.github/workflows/pages.yml` (CI; only update if fixing a GitHub Pages issue)

## Making a PR

1. Fork the repo
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Test locally (see checklist above)
5. Commit with a clear message: `feat: add new theme` or `fix: search ignores spaces`
6. Push: `git push origin my-feature`
7. Open a PR with a description of what you changed and why

## Commit message format

Keep it short and clear:

- `feat: ` — new feature (e.g., "feat: add video support")
- `fix: ` — bug fix (e.g., "fix: search doesn't find special characters")
- `refactor: ` — code cleanup, no behavior change (e.g., "refactor: extract search logic")
- `docs: ` — documentation only (e.g., "docs: add CONTRIBUTING guide")
- `style: ` — CSS/formatting only (e.g., "style: improve mobile footer spacing")

## Architecture decisions

**Why no frameworks?**
- DishDeck should load fast and work on slow networks
- A 10KB vanilla app is better than 100KB of framework + bundle
- Simpler to fork and customize without learning a framework

**Why CSS custom properties instead of CSS-in-JS or SCSS?**
- No build step = instant feedback during development
- Tokens are human-editable in the browser (DevTools)
- Dynamic theme switching is trivial (just change a property)

**Why no database or backend?**
- GitHub Pages is free and infinitely scalable
- Restaurants own their menus (in the repo or a Sheet they control)
- No authentication needed; access control is via repo/Sheet permissions

**Why localStorage instead of IndexedDB?**
- Simpler API, good enough for menu caching
- No async complexity
- Always available on all browsers

## Reporting bugs

Open an issue with:

1. **What you expected** — e.g., "Search should find dishes with spice=2"
2. **What actually happened** — e.g., "Search found nothing"
3. **Steps to reproduce** — e.g., "Go to /?r=akshaya-patra, type 'spicy'"
4. **Environment** — e.g., "Chrome 120, Mac, locally via npx serve"
5. **Screenshots or video** — if relevant

## Suggesting features

Open an issue with:

1. **What you want** — e.g., "Multi-language menus"
2. **Why it's useful** — e.g., "Tourists visit our restaurant from 50 countries"
3. **Rough idea of implementation** — e.g., "Add `lang` field to dishes, detect via Accept-Language header"

We'll discuss and decide if it fits the project's scope (keep it simple, zero-backend).

## Code review process

All PRs are reviewed by the maintainers. We'll check:

- ✓ Tests pass (manual checklist above)
- ✓ Code is simple and maintainable
- ✓ No breaking changes to existing restaurants' configs
- ✓ Performance impact is minimal
- ✓ Mobile experience is good
- ✓ Documentation is updated if needed

We might ask for changes — that's normal and helpful. We're aiming for high quality and simplicity.

## Questions?

Open an issue or discussion. We're here to help!

---

## License

By contributing, you agree that your code will be released under the same license as the project (MIT).

Thanks for helping make DishDeck better! 🍽️
