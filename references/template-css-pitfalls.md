# Template CSS pitfalls

Lessons from iterative template debugging at 1920×1080 with Chromium/Playwright.

## ⚠ CSS selector duplication during patching

When doing iterative `patch` edits on an HTML `<style>` block, a selector can accidentally get **duplicated/nested** (e.g., two `.subtitle {` lines). This silently invalidates the entire CSS rule — the element renders with default styles (tiny font, no wrapping, no clamping).

**Symptom**: element `scrollHeight` is abnormally small (e.g., 22px for a paragraph that should be 2 lines at 44px font), confirming the CSS never applied.

**Fix**: after any patch that touches a CSS block, run:
```bash
grep -c "\.subtitle {" templates/terminal/slide.html
# Should output 1. If it outputs 2+, you have a nesting bug.
```

**Prevention**: always include enough context (surrounding lines) in `old_string` to make the match unique. Never match on just the selector name.

## ⚠ `-webkit-line-clamp` compatibility

`-webkit-line-clamp: N` requires ALL of these on the same element, and **nothing that conflicts**:

```css
display: -webkit-box;
-webkit-line-clamp: 2;        /* or 3 */
-webkit-box-orient: vertical;
overflow: hidden;
```

**DO NOT add these on the same element** — they break line clamping:
- `max-height` — forces the box to collapse before text fills N lines
- `text-overflow: ellipsis` — only works with `white-space: nowrap` (single-line), conflicts with multi-line box clamp
- `white-space: nowrap` — prevents wrapping entirely, defeats line clamping

If you need multi-line truncation with ellipsis, rely on `-webkit-line-clamp` alone — it adds the ellipsis automatically.

## Single-line ellipsis (title, highlights)

For single-line truncation, the standard triple works:

```css
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
```

For `<li>` elements, put these on the `li` itself, not on the `<ul>`.

## Testing overflow with real data

**Never test CSS overflow with short content.** A subtitle of "Strix 是开源的 AI 渗透测试工具" will fit on one line and look fine even if line-clamp is broken.

Always test with a **deliberately long string** (200+ chars) to confirm:
- Subtitle wraps to exactly 2 lines then shows `...`
- Title stays on 1 line with `...`
- Each highlight stays on 1 line with `...`

Verify with Playwright DOM inspection:
```js
const info = await page.evaluate(() => {
  const el = document.querySelector('.subtitle');
  return { scrollH: el.scrollHeight, clientH: el.clientHeight };
});
// For 44px font, line-height 1.4: 2 lines = ~123px
// If scrollH === clientH and both are correct → CSS is working
// If scrollH is tiny (e.g., 22px) → CSS rule is broken (see nesting bug above)
```
