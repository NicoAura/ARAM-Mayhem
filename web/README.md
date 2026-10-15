# ARAM Mayhem website

Next.js (TypeScript) app with three sections: Stats, Simulator and PBE. The
pages are placeholders for now.

## Run locally

```bash
cd web
npm install
cp .env.example .env.local   # then paste your Riot API key
npm run dev
```

Open http://localhost:3000.

## Riot API key

The key lives only in the `RIOT_API_KEY` environment variable and is read on
the server (`src/lib/riot.ts`). The browser calls this site's own API routes,
never Riot directly, so the key is never sent to visitors. Riot responses are
cached for a few minutes to save rate limit.

Example route: `/api/riot/account?gameName=Name&tagLine=NA1&region=americas`.

## Deploy on Vercel

1. Import the GitHub repo in Vercel and set **Root Directory** to `web`.
2. Add `RIOT_API_KEY` under Project Settings → Environment Variables.
3. Every push to `main` deploys.

A development key expires every 24 hours, so a site that stays up needs a
Personal or Production key from the Riot Developer Portal.
