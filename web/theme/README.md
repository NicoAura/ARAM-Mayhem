# DeepARAM UI theme

The site (deeparam.com) uses one look on desktop and phones. Pages embedded from other folders (dashboard/, simulator/viewer/, tools/fun/, data/cook-builds/) render inside the site in an iframe, so they should match it. Copy [mayhem-theme.css](mayhem-theme.css) into your page's stylesheet. The live source of truth is `web/src/app/globals.css`.

## Rules

- **Fonts:** Bricolage Grotesque (`--display`) for page headings and big numbers' titles, Geist (`--sans`) for text, Geist Mono (`--mono`) for eyebrows, table headers, chips and numbers.
- **Colors:** only the tokens. Cool grey page (`--bg`), white cards (`--surface`), `--raised` for insets and hover. In dark mode near-black with slightly lighter cards. Glacial blue `--accent` is for links, active states, meters and focus rings. Green and red only mean win/loss or buff/nerf. Gold and silver are tier colours.
- **The one flourish:** the `--prismatic` gradient, used for the Prismatic tier chip and the logo mark. Don't use it for chrome.
- **Light and dark:** follow `prefers-color-scheme`, and honour `data-theme="light"`/`"dark"` on the root. Both must work.
- **Surfaces:** content sits in cards with a 1px `--line` border and 14px radius (`--r`). No drop shadows or glows. Controls use 8px (`--r-sm`); tabs, chips and buttons are full pills.
- **Headings:** a mono uppercase eyebrow in `--muted` above a display-font heading with tight tracking. Card titles are 15px semibold Geist. The site already shows the tab's title, so an embedded page can drop its own big h1.
- **Tables:** inside a bordered card, mono uppercase muted headers, hairline rows, numbers right-aligned in mono with tabular figures, row hover with `--hover`.
- **Layout:** content max width 1120px with a 16px side gutter; the page background is `--bg` with no extra margin when embedded.
- **Phones:** the site adds `html[data-device="mobile"]` on iOS and Android and shows a bottom tab bar. Embedded pages should simply stack to one column under 640px and use 16px inputs so iOS doesn't zoom.
- **Exceptions:** data colours that carry meaning (ability colours in the replay, chart series) are fine. Keep them to the chart or canvas, not the page chrome.
