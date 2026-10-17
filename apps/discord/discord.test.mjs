// node --experimental-strip-types --test apps/discord/discord.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { findChampions, respond, verifyDiscord } from "../../web/src/lib/discord.ts";

const champ = (name, tier, rank) => ({
  name, tier, rank, winRate: 0.55, pickRate: 0.012, augments: ["A", "B"], core: ["X", "Y"], coreWinRate: 0.56,
  boots: "Boots", full: ["X", "Y", "Z"], skills: ["Q", "E", "W"],
});
const data = {
  patch: "16.20",
  of: 3,
  champions: { Jinx: champ("Jinx", "S", 1), MissFortune: champ("Miss Fortune", "A", 2), Jax: champ("Jax", "B", 3) },
};

test("matches names, ids, nicknames and prefixes", () => {
  assert.deepEqual(findChampions(data, "jinx"), ["Jinx"]);
  assert.equal(findChampions(data, "Miss Fortune")[0], "MissFortune");
  assert.equal(findChampions(data, "mf")[0], "MissFortune");
  assert.deepEqual(findChampions(data, "ja"), ["Jax"]);
  assert.deepEqual(findChampions(data, "j"), ["Jax", "Jinx"]);
  assert.deepEqual(findChampions(data, "zzz"), []);
});

test("command reply carries tier, build and the notice", () => {
  const r = respond(data, { type: 2, data: { name: "deeparam", options: [{ name: "champion", value: "Jinx" }] } });
  const e = r.data.embeds[0];
  assert.equal(r.type, 4);
  assert.equal(e.title, "Jinx · S tier");
  assert.equal(e.url, "https://deeparam.com/champions/Jinx");
  assert.ok(e.fields.some((f) => f.value === "X → Y → Boots"));
  assert.match(e.footer.text, /Patch 16\.20.*isn't endorsed by Riot Games/);
});

test("unknown champion is a private message; autocomplete lists choices", () => {
  const miss = respond(data, { type: 2, data: { options: [{ name: "champion", value: "nobody" }] } });
  assert.equal(miss.data.flags, 64);
  const ac = respond(data, { type: 4, data: { options: [{ name: "champion", value: "j", focused: true }] } });
  assert.deepEqual(ac, { type: 8, data: { choices: [{ name: "Jax", value: "Jax" }, { name: "Jinx", value: "Jinx" }] } });
});

test("accepts Discord's signature and nothing else", async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pub = Buffer.from(await crypto.subtle.exportKey("raw", publicKey)).toString("hex");
  const body = JSON.stringify({ type: 1 });
  const ts = "1700000000";
  const sig = Buffer.from(await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(ts + body))).toString("hex");
  assert.equal(await verifyDiscord(body, sig, ts, pub), true);
  assert.equal(await verifyDiscord(body + " ", sig, ts, pub), false);
  assert.equal(await verifyDiscord(body, sig, "1700000001", pub), false);
  assert.equal(await verifyDiscord(body, null, ts, pub), false);
  assert.equal(await verifyDiscord(body, "zz", ts, pub), false);
});
