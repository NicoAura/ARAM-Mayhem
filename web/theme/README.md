# ARAM Mayhem UI theme

The site uses one modern minimalist look. Pages embedded from other folders (dashboard/, simulator/viewer/, tools/fun/) should match it, because they render inside the site in an iframe. Copy [mayhem-theme.css](mayhem-theme.css) into your page's stylesheet.

## Rules

- **Fonts:** Geist for text, Geist Mono for labels, numbers in chips and small captions. No display fonts.
- **Colors:** only the tokens in mayhem-theme.css. Neutral grey on near-white, or near-black in dark mode. Gold (`--accent`) is for eyebrow labels, the focus ring and the gold tier only. Green and red only mean win/loss or buff/nerf.
- **Light and dark:** follow `prefers-color-scheme`. Both must work.
- **Surfaces:** flat. Use 1px `--line` borders and dividers. No shadows, gradients, glows or tinted card backgrounds. Radius is 8px for controls, 12px for a framed panel, 4px for chips.
- **Background:** the page background is `--bg` and the body has no extra margin or max-width when embedded, so it sits flush in the site's frame.
- **Tables:** hairline rows, muted headers, numbers right-aligned with tabular figures, row hover with `--hover`.
- **Headings:** an eyebrow label (mono, uppercase, gold) above a semibold, tightly tracked heading. The site already shows the tab's title, so an embedded page can drop its own big h1.
- **Exceptions:** data colours that carry meaning (ability colours in the replay, chart series) are fine. Keep them to the chart or canvas, not the page chrome.
