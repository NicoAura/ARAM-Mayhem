// Registers (or updates) the bot's /deeparam slash command with Discord. Run once after creating the app,
// and again whenever the command below changes:
//
//   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... node apps/discord/register.mjs
//
// The token is only needed here, on your own machine; the site itself only needs the app's public key.
const { DISCORD_APP_ID: app, DISCORD_BOT_TOKEN: token } = process.env;
if (!app || !token) {
  console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN (Discord Developer Portal → your app).");
  process.exit(1);
}

const commands = [
  {
    name: "deeparam",
    description: "A champion's ARAM Mayhem tier and best build",
    // Usable in servers, in DMs with the bot, and by anyone who adds the app to their own account.
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    options: [{ type: 3, name: "champion", description: "Champion name, like Jinx", required: true, autocomplete: true }],
  },
];

const res = await fetch(`https://discord.com/api/v10/applications/${app}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
const text = await res.text();
if (!res.ok) {
  console.error(`Discord said ${res.status}: ${text}`);
  process.exit(1);
}
console.log(`Registered: ${JSON.parse(text).map((c) => "/" + c.name).join(", ")}`);
console.log(`Invite link: https://discord.com/oauth2/authorize?client_id=${app}&scope=applications.commands`);
