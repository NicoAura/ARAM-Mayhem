# DeepARAM Discord bot

`/deeparam Jinx` replies with the champion's live-patch tier, win and pick rate, most picked build,
top augments and skill order, linking to their page on the site.

It is a slash-command-only app (no gateway connection, nothing to keep running): Discord sends each
command to `https://deeparam.com/api/discord`, which the site's own Worker answers.

| Piece | Where |
| --- | --- |
| Request handler | `web/src/app/api/discord/route.ts` |
| Signature check, champion matching, reply card | `web/src/lib/discord.ts` |
| Tiers and builds it answers from, built each deploy | `web/src/lib/bot.ts` → `/data/bot.json` |
| Command registration | `apps/discord/register.mjs` |
| Tests | `node --experimental-strip-types --test apps/discord/discord.test.mjs` |

## Setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application
   named DeepARAM and give it the site logo.
2. On **General Information**, copy the **Application ID** and **Public Key**.
3. In Cloudflare, on the `aram-mayhem` Worker → **Settings → Variables and Secrets**, add
   `DISCORD_PUBLIC_KEY` with the public key, then redeploy (or push anything to main).
4. Back on **General Information**, set **Interactions Endpoint URL** to `https://deeparam.com/api/discord`
   and save. Discord tests the URL right away; it only saves if the site answers correctly.
5. On **Bot**, press **Reset Token** and copy it. Then, from the repo:
   `DISCORD_APP_ID=<id> DISCORD_BOT_TOKEN=<token> node apps/discord/register.mjs`
   It prints the invite link. The token isn't stored anywhere else.
6. Open the invite link to add the bot to a server.
