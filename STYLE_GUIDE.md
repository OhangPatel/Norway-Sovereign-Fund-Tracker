# GPFG Global — "Lime" Design System

A two-theme editorial dashboard built around a lime accent and a Swiss-grid data
aesthetic. Use this as the single source of truth for building the rest of the website.
Reference implementation: `frontend/index.html` (the `<style>` block holds every token).

The two themes have names, and the names are load-bearing:

- **Light = "Olive wash."** The page is a warm olive field; the accent's hue runs through
  the neutrals on purpose.
- **Dark = "Onyx field."** Pure neutral greys on true black. **No hue anywhere except
  `--accent` and the `--sector-*` chart colors.** This replaced the earlier "Ink field,"
  whose neutrals were derived from the lime's own hue (~67°) — that tinted every dark
  surface olive and stopped `--ink` from ever reading as white. The greys below are
  Apple's system scale, the ground the Stocks app uses for the same kind of dense
  numeric page.

If you are adding a dark-theme color: **it must be a grey (R=G=B, or within a few points
of it) unless it is the accent or a sector hue.** That single rule is what keeps the dark
theme neutral.

---

## 1. Theming model

Two themes — **Light** (default) and **Dark** — implemented with CSS custom properties on
`:root[data-theme="light"]` and `:root[data-theme="dark"]`. Both selectors are explicit;
there is no bare-`:root` fallback for the palette. Toggle by setting the attribute on
`<html>`:

```js
document.documentElement.setAttribute("data-theme", "dark"); // or "light"
```

Theme choice persists in `localStorage` under the key `sov-theme` (see `src/app.jsx`).
**Always reference colors through the `var(--token)` names below — never hardcode hex
values in components.** The JSX is already clean on this; keep it that way.

A small group of tokens lives on bare `:root` because it is *theme-independent* — the nav
card keeps the same cream look in both themes, so its text colors cannot inherit `--ink`:

| Token                | Value     | Use |
|----------------------|-----------|-----|
| `--nav-ink`          | `#16170F` | Nav card primary text |
| `--nav-sub`          | `#6F6D5F` | Nav card secondary text |
| `--nav-soft`         | `#646851` | Nav card tertiary text (clears all four nav backgrounds at 5.01–5.77:1) |
| `--nav-accent-text`  | `#6C8118` | Accent text on the nav card |

---

## 2. Color tokens

### Surface & text (theme-dependent)

| Token                  | Light       | Dark        | Use |
|------------------------|-------------|-------------|-----|
| `--bg`                 | `#E3E8CE`   | `#000000`   | Page background |
| `--surface`            | `#FFFFFF`   | `#1C1C1E`   | Cards / panels |
| `--line`               | `#E3E8D3`   | `#2C2C2E`   | Borders, dividers |
| `--track`              | `#E3E8D3`   | `#2C2C2E`   | Progress-bar track |
| `--ink`                | `#16170F`   | `#FFFFFF`   | Primary text |
| `--sub`                | `#626054`   | `#98989D`   | Secondary text |
| `--soft`               | `#5E624C`   | `#8E8E93`   | Tertiary / mono labels |
| `--row-hover`          | `#F4F6EA`   | `#242426`   | List-row hover |
| `--card-hover-border`  | `#16170F`   | `#D8F34A`   | Card hover border |

Dark-theme elevation runs `--bg` → `--surface` → `--row-hover` → `--line`, darkest to
lightest. Keep that ordering if you add a surface: a row hover that outruns `--line`
erases the borders inside the row it is highlighting.

**Contrast.** Every text token clears WCAG AA (4.5:1) against every background it can
land on. Secondary and tertiary text is mostly 9–11px, so the 4.5:1 *normal-text* bar
applies, not the 3:1 large-text one. Measured on the dark theme:

| Token    | on `--bg` | on `--surface` | on `--row-hover` |
|----------|-----------|----------------|------------------|
| `--ink`  | 21.00     | 17.01          | 15.49            |
| `--sub`  | 7.31      | 5.93           | 5.40             |
| `--soft` | 6.44      | 5.22           | 4.75             |

`--soft` on `--row-hover` is the tightest pair in the theme. Re-check all three columns
if any of those three backgrounds change.

### Accent

| Token            | Light       | Dark        | Use |
|------------------|-------------|-------------|-----|
| `--accent`       | `#D8F34A`   | `#D8F34A`   | Lime accent (bars, dots, CTAs) — same in both themes |
| `--accent-text`  | `#6C8118`   | `#D8F34A`   | Accent used as text (needs to be legible on `--bg`) |

> **Note:** raw lime `#D8F34A` is too low-contrast for text on the light background, so
> `--accent-text` darkens to `#6C8118` in light mode. Use `--accent` for fills/shapes and
> `--accent-text` for any accent-colored text. On the dark theme the raw lime is fine
> (16.84:1 on `--bg`), so the two are the same value there.

### Feature card (the inverted highlight card)

| Token            | Light       | Dark        | Use |
|------------------|-------------|-------------|-----|
| `--feature`      | `#14150F`   | `#D8F34A`   | Feature card background |
| `--feature-ink`  | `#F4F2EC`   | `#000000`   | Feature card text |
| `--feature-sub`  | `#8F9180`   | `#5A6B12`   | Feature card secondary text |
| `--feature-num`  | `#D8F34A`   | `#000000`   | Feature card hero number |

The feature card inverts between themes: a near-black card in light mode becomes a solid
lime card in dark mode. Use it for the single most important stat on a screen.

`--feature-sub` is dark olive in the dark theme, and that is *not* a violation of the
no-hue rule: it sits on the lime card, and text on a colored fill takes a darker shade
from that same color family.

### Nav shell, footer, hero (self-contained surfaces)

These three carry their own colors instead of the page tokens, because each one keeps a
look that does not follow the theme.

| Token             | Light                     | Dark                      | Use |
|-------------------|---------------------------|---------------------------|-----|
| `--nav-surface`   | `#FFFFFF`                 | `#FFFDF7`                 | Floating nav card |
| `--nav-line`      | `#E3E8D3`                 | `#E3E8D3`                 | Nav card border |
| `--nav-field`     | `#F4F6EA`                 | `#F2EFE4`                 | Search field inside the nav |
| `--nav-band`      | `#16170F`                 | `#D8F34A`                 | Ticker band |
| `--nav-band-ink`  | `#8F9180`                 | `#2C3505`                 | Ticker band text |
| `--tick-up`       | `#9BE04A`                 | `#15490A`                 | Ticker gain |
| `--tick-down`     | `#FF7A6B`                 | `#8E1104`                 | Ticker loss |
| `--foot-surface`  | `#14150F`                 | `#1C1C1E`                 | Footer band |
| `--foot-ink`      | `#F4F2EC`                 | `#FFFFFF`                 | Footer primary text |
| `--foot-sub`      | `#A9AB9C`                 | `#98989D`                 | Footer secondary text |
| `--foot-soft`     | `#8A8C7D`                 | `#8E8E93`                 | Footer tertiary text |
| `--foot-line`     | `rgba(244,242,236,.11)`   | `rgba(255,255,255,.11)`   | Footer rules |
| `--foot-accent`   | `#D8F34A`                 | `#D8F34A`                 | Footer accent |
| `--hero-surface`  | `#FFFFFF`                 | `#FFFDF7`                 | Hero card |
| `--hero-line`     | `#E3E8D3`                 | `#FFFDF7`                 | Hero card border |
| `--hero-ink`      | `#16170F`                 | `#16170F`                 | Hero card text |
| `--hero-sub`      | `#6F6D5F`                 | `#6F6D5F`                 | Hero card secondary text |

**The nav card and the hero card stay cream on the onyx field.** That is deliberate — nav
and ticker band read as one card in both themes — but it is the one place the dark theme
is not neutral, and it is a much starker contrast against `#000000` than it was against
the old `#14150F`. Revisit it as a design decision, not as a bug.

The footer inverts its old logic: on the ink field it sat a shade *under* the page, and
nothing sits under `#000`, so on the onyx field it sits a shade *above* and reads as a
band the same way. It shares `--surface`'s value on purpose — the footer is the page's
last card, not a fourth elevation.

### Shimmer

`--shimmer` is the gradient swept across the total-holdings figure (clipped to the
numerals, 5s infinite). Light: lime → white → lime on the ink card. Dark: black → white →
black on the lime card.

> **Removed:** `--page-glow`. The dark theme used to wash a lime
> `radial-gradient(…rgba(216,243,74,.13)…)` across the top-right of the page via
> `body::before`. It was the largest single source of hue on the dark UI and is gone
> along with the `body::before` rule that painted it. Do not reintroduce a tinted page
> wash — the onyx field is flat by design.

### Sector palette (shared — identical in both themes)

Categorical colors for charts, treemaps, tags. Pick by sector, not by index.

| Token                   | Hex       |
|-------------------------|-----------|
| `--sector-tech`         | `#60A5FA` |
| `--sector-financials`   | `#D6E134` |
| `--sector-healthcare`   | `#2DD4BF` |
| `--sector-energy`       | `#FB923C` |
| `--sector-industrials`  | `#A78BFA` |
| `--sector-consumer`     | `#F472B6` |
| `--sector-utilities`    | `#FBBF24` |
| `--sector-realestate`   | `#4ADE80` |

### Market signals

| Token      | Hex       | Use |
|------------|-----------|-----|
| `--bull`   | `#4ADE80` | Positive / gains |
| `--bear`   | `#F87171` | Negative / losses |

When placing sector colors as a treemap/chart fill, text on top uses
`--treemap-cell-fg` (`#16170F` light, `#000000` dark) — these sector hues are all light
enough to take dark text in both themes.

Sector and signal colors are the **only** hues allowed on the dark theme besides
`--accent`. They are data, not decoration.

### Logo (its own palette, on purpose)

The Crown Ridge mark is the brand; lime stays the UI accent. These tokens deliberately do
not track `--accent` or the neutrals, so do not "fix" them to match a theme.

| Token           | Light         | Dark      | Use |
|-----------------|---------------|-----------|-----|
| `--logo-tile`   | `#16181B`     | `#0F1113` | Mark tile |
| `--logo-stroke` | `transparent` | `#2B2F33` | Tile hairline (dark only — the tile is a shade off the onyx ground and needs an edge to read as a tile) |
| `--logo-crown`  | `#F7F6F2`     | `#F7F6F2` | Crown |
| `--logo-gold`   | `#C9A227`     | `#C9A227` | Bar |

### Surfaces outside the app bundle

Three non-SPA surfaces carry hardcoded copies of the dark palette. They are not wired to
the tokens, so **changing a dark neutral means changing all four files**:

| File | What it renders | Notes |
|------|-----------------|-------|
| `frontend/index.html` | The app's tokens | Source of truth |
| `frontend/scripts/build-static.mjs` | Static `/holdings/*` SEO pages | Own token names, same values; OS preference only, no toggle |
| `frontend/scripts/generate-images.py` | `og-image.png`, icon PNGs | Not part of `npm run build`; re-run by hand |
| `frontend/index.html` `<meta name="theme-color">` | Mobile browser chrome | Dark value must equal `--bg` |

---

## 3. Typography

Two families, loaded from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
```

| Token             | Family                          | Use |
|-------------------|---------------------------------|-----|
| `--font-display`  | `'Space Grotesk', sans-serif`   | Headings, body, UI labels |
| `--font-mono`     | `'JetBrains Mono', monospace`   | Numbers, eyebrows, indices, tags, data values |

### Type scale & treatment

| Role            | Size  | Weight | Notes |
|-----------------|-------|--------|-------|
| Hero headline   | 62px  | 600    | `line-height: 0.98; letter-spacing: -0.03em` |
| Feature number  | 48px  | 600    | `letter-spacing: -0.03em` |
| Stat value      | 38px  | 600    | `letter-spacing: -0.02em` |
| Panel H2        | 26px  | 600    | `letter-spacing: -0.02em` |
| Body            | 15px  | 400    | `line-height: 1.6`, color `--sub` |
| List item name  | 16px  | 600    | — |
| Data value      | 13px  | mono   | — |
| Eyebrow / label | 10–11px | 500–600 mono | `text-transform: uppercase; letter-spacing: 0.1–0.16em` |

**Rule of thumb:** anything numeric or label-like → `--font-mono`, uppercase, wide tracking.
Anything sentence-like → `--font-display`, tight negative tracking on large sizes.

---

## 4. Spacing, radius, motion

- **Radii:** large cards `24px`, small cards/stats `20px`, pills/buttons `999px`, chart containers `6px`.
- **Grid gap:** `14px` between bento/grid cells.
- **Card padding:** large `48px 44px`, panels `34px 38px`, small cards `24px 26px`.
- **Page gutter:** `5vw` left/right; content `max-width: 1760px`, centered.
- **Hover:** cards lift `translateY(-4px)` and shift border to `--card-hover-border` over `.18s`.
- **Theme transition:** `background .25s, color .25s` on `body`.
- **Borders:** `1px solid var(--line)` everywhere; never use shadows for separation except the floating toggle (`0 14px 44px rgba(0,0,0,0.4)`).

---

## 5. Components

### Card
`background: var(--surface); border: 1px solid var(--line); border-radius: 20–24px;`
Hover: lift + `border-color: var(--card-hover-border)`.

### Feature card
Inverted highlight card using `--feature*` tokens. One per screen, max.

### Ghost button
`border: 1.5px solid var(--ink); border-radius: 999px;` uppercase mono. Hover inverts:
`background: var(--ink); color: var(--bg)`.

### Stat
Mono uppercase `--soft` label + large `--ink` value.

### Data row (list)
Flex row: mono rank (`--soft`) · name (`--ink`, 600) · flexible progress bar · mono value.
Progress bar = `--track` background, `--accent` fill, fully rounded. Hover `--row-hover`.

### Treemap (sector weight)
Two flex-wrap rows at `height: 50%` each; each cell's `width` = its share of that row's
total. Fill with a `--sector-*` token; `2px solid var(--surface)` gutters; label uses
`--treemap-cell-fg`. This is the canonical way to show categorical weight — prefer it over
pie/donut for sector breakdowns.

### Histogram (distribution)
Full-width panel. Bars in a flex row (`align-items: flex-end`, `gap: 5px`), each filled with
`--accent`, rounded top corners only (`3px 3px 0 0`). Chart area has a `1px solid var(--line)`
baseline and faint horizontal gridlines via `repeating-linear-gradient` in `--line`. Axis
labels and stat labels are mono/uppercase `--soft`; stat values are `--ink` at 22px/600.
Use for any single-variable distribution (ownership %, returns, etc.).

### Floating mode toggle
Fixed bottom-center pill, dark glass (`rgba(18,18,20,0.92)` + blur). Active segment = white
fill / dark text; inactive = transparent / translucent white text. Keep this consistent
site-wide as the theme switcher.

---

## 6. Layout patterns

- **Bento hero:** 4-column grid. Lead card spans `3×2`, feature card spans `1×3`, remaining
  stats fill single cells. `grid-auto-rows: minmax(110px, auto)`.
- **Detail row:** `1.5fr / 1fr` two-column split — primary data table left, supporting
  visual (treemap/chart) right, matched heights.
- Everything sits inside `.wrap` (`max-width:1760px; margin:0 auto`) with `5vw` section gutters.

---

## 7. Do / Don't

- ✅ Use `var(--*)` tokens for every color. ✅ Mono for all numerals & labels.
  ✅ Negative letter-spacing on big display type. ✅ 1px borders over shadows.
  ✅ Keep every new dark-theme neutral a true grey.
- ❌ Don't hardcode hex in components. ❌ Don't use raw `#D8F34A` for text on light bg (use `--accent-text`).
  ❌ Don't introduce gradients, drop shadows on cards, or new accent colors.
  ❌ Don't mix sector colors arbitrarily — map each to its semantic `--sector-*` token.
  ❌ Don't tint a dark neutral toward the lime — that is the mistake the "Ink field"
  palette made, and undoing it is why the dark theme is neutral today.

---

## 8. Known drift

Recorded rather than silently fixed. Each is a separate decision, not a bug in the
palette above.

- **§3–§6 predate UI 2.0.** The type scale, radii, layout patterns, and the "floating
  mode toggle" in §5 describe the pre-redesign build. The toggle now lives in the nav
  menu, not a bottom-center pill. Colors (§1–§2) are current; treat the rest as stale
  until someone does a pass.
- **Accent drift outside the SPA.** `build-static.mjs` and `generate-images.py` still use
  the pre-2.0 lime `#D6E134`; the app uses `#D8F34A`. Visible when a reader crosses from
  the dashboard to a `/holdings/` page.
- **`site.webmanifest`** carries `background_color: #F4F3EE` (a light `--bg` that no
  longer exists) and `theme_color: #16181B` (the logo tile). A manifest can hold only one
  value, so this needs a call about which theme the PWA splash should represent.
