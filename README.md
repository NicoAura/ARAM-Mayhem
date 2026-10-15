# ARAM-Mayhem
Create a website that displays ARAM Mayhem data, damage simulation, and PBE information

## Stats dashboard

`dashboard/` is a static page that reads a Mayhem match archive (`mayhem-backup.json`,
the format the mayhem-archive scraper writes) and shows win rate, KDA, damage,
win rate by month, champion and augment tables, and recent games. Filters cover
queue, date range and champion.

Open `dashboard/index.html` and drop the archive on it. The file is read in the
browser and never uploaded. To load it automatically, put it at
`dashboard/data/mayhem-backup.json` (git-ignored) and serve the folder:

```
cd dashboard && python3 -m http.server
```

Champion and augment names come from Data Dragon and CommunityDragon; without
network access the page shows ids instead.
