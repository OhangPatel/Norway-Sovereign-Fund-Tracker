# GPFG Global — "Lime" Design System

A dark-first/light editorial dashboard theme built around a lime accent, warm neutrals,
and a Swiss-grid data aesthetic. Use this as the single source of truth for building the
rest of the website. Reference implementation: `index.html`.

---

## 1. Theming model

Two themes — **Light** (default) and **Dark** — implemented with CSS custom properties on
`:root` and `[data-theme="dark"]`. Toggle by setting the attribute on `<html>`:

```js
document.documentElement.setAttribute("data-theme", "dark"); // or "light"
```

Theme choice persists in `localStorage` under the key `gpfg-theme`. **Always reference
colors through the `var(--token)` names below — never hardcode hex values in components.**

---

## 2. Color tokens

### Surface & text (theme-dependent)

| Token                  | Light       | Dark        | Use |
|------------------------|-------------|-------------|-----|
| `--bg`                 | `#F4F3EE`   | `#131019`   | Page background |
| `--surface`            | `#FFFFFF`   | `#2D2A29`   | Cards / panels |
| `--line`               | `#E4E2DA`   | `#46413D`   | Borders, dividers |
| `--track`              | `#ECEAE2`   | `#3A3633`   | Progress-bar track |
| `--ink`                | `#1B1A17`   | `#FCFEE7`   | Primary text |
| `--sub`                | `#7C786E`   | `#A89F95`   | Secondary text |
| `--soft`               | `#9C988C`   | `#8C857F`   | Tertiary / mono labels |
| `--row-hover`          | `#FAF9F5`   | `#34302E`   | List-row hover |
| `--card-hover-border`  | `#1B1A17`   | `#D6E134`   | Card hover border |

### Accent

| Token            | Light       | Dark        | Use |
|------------------|-------------|-------------|-----|
| `--accent`       | `#D6E134`   | `#D6E134`   | Lime accent (bars, dots, CTAs) — same in both themes |
| `--accent-text`  | `#8E9612`   | `#D6E134`   | Accent used as text (needs to be legible on `--bg`) |

> **Note:** raw lime `#D6E134` is too low-contrast for text on the light background, so
> `--accent-text` darkens to `#8E9612` in light mode. Use `--accent` for fills/shapes and
> `--accent-text` for any accent-colored text.

### Feature card (the inverted highlight card)

| Token            | Light       | Dark        |
|------------------|-------------|-------------|
| `--feature`      | `#1B1A17`   | `#D6E134`   | Feature card background |
| `--feature-ink`  | `#FCFEE7`   | `#131019`   | Feature card text |
| `--feature-sub`  | `#9A968A`   | `#5F6A12`   | Feature card secondary text |
| `--feature-num`  | `#D6E134`   | `#131019`   | Feature card hero number |

The feature card inverts between themes: a near-black card in light mode becomes a solid
lime card in dark mode. Use it for the single most important stat on a screen.

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
`--treemap-cell-fg` (`#1B1A17` light, `#131019` dark) — these sector hues are all light
enough to take dark text in both themes.

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
- ❌ Don't hardcode hex in components. ❌ Don't use raw `#D6E134` for text on light bg (use `--accent-text`).
  ❌ Don't introduce gradients, drop shadows on cards, or new accent colors.
  ❌ Don't mix sector colors arbitrarily — map each to its semantic `--sector-*` token.
