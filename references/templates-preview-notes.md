# Template preview notes

Three starter HTML templates ship under `templates/<name>/`, each renders at 1920×1080.

## Terminal (`templates/terminal/`) — DEFAULT

- **Aesthetic:** hacker-terminal / green phosphor CRT
- **Palette:** `#0a0a0a` bg, `#00ff88` primary, `#00d4ff` secondary
- **Font:** JetBrains Mono (Google Fonts)
- **Layout:** command-prompt prefix (`$ cat project.md`), tag-style metrics, `▶` highlighted bullet list
- **Files:** `slide.html`, `intro.html`, `outro.html`, `cover.html`, `config.json`
- **Strong when:** tech / developer audience
- **User chose this one** as the default for AI open-source news videos

### Verified font sizes (do NOT change without user confirmation)
| Element | Size | Overflow |
|---------|------|----------|
| header (date/category) | 36px | flex space-between |
| cmd (decorative) | 32px | — |
| title | 110px | single-line ellipsis |
| subtitle | 44px | 2-line `-webkit-line-clamp` |
| metrics tags | 32px | flex row |
| highlights | 40px | per-li single-line ellipsis |
| footer (link) | 36px | block, left-aligned, ellipsis |

### Spacing (prevents highlights/footer overlap)
- header `margin-bottom: 50px`
- subtitle `margin-bottom: 45px`
- metrics `margin-bottom: 50px`
- highlights `line-height: 1.5`

## HUD (`templates/hud/`)

- **Aesthetic:** sci-fi heads-up display
- **Palette:** radial gradient `#0d1b2a → #0d1117`, cyan `#22d3ee`, magenta `#ec4899`
- **Fonts:** Orbitron + Inter + JetBrains Mono
- **Layout:** 2-column with radar decoration
- **Strong when:** maximum visual punch needed

## Minimal (`templates/minimal/`)

- **Aesthetic:** editorial / Apple-keynote
- **Palette:** pure black `#000`, neon-green `#00ff88` accent
- **Font:** Inter (weight contrast)
- **Strong when:** content speaks for itself

## Picking a template

User selected **Terminal** after seeing all 3 side-by-side. To switch:
```bash
npx tsx scripts/make-video.ts --template hud
```

To re-render previews after template tweaks, generate a single slide with **long test data** (see `references/template-css-pitfalls.md` for why short data is misleading):
```bash
npx tsx scripts/generate-ppt.ts --data examples/mock-news.json --template terminal --out /tmp/preview
```
