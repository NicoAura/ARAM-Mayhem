# Stacking Timer

How fast stacking champions grow in ARAM Mayhem: Veigar (Phenomenal Evil), Nasus (Siphoning Strike),
Senna (Mist) and Smolder (Dragon Practice). Set how often each stacking event happens per minute and the
page shows stacks, the stat they give, ability damage, Senna's crit and range tiers and Smolder's Q
upgrades at each minute, plus when you reach a stack goal. The Phenomenal Evil augment can be added to any
champion (+1 AP per ability hit on a champion, +40 AP if taken as the second augment).

- `build_data.py` pulls the stack values from CommunityDragon (ARAM and Mayhem overrides applied) into `data.js`.
- `calc.js` is the math (stacks grow linearly: rate × stacks per event); `app.js` is the page.
- Open `index.html` directly, or through the Fun Tools tab. The build is kept in the URL hash, so links share it.

Refresh the data after a patch with `python3 build_data.py`.
