import { expect, test, type Page } from "@playwright/test";

// Every main page: loads, shows the header and the legal notice, throws no script errors,
// loads every image and script it asks for from the site, and never scrolls sideways on a phone.
const PAGES = [
  "/",
  "/tier-list",
  "/tier-list?tab=augments",
  "/simulator",
  "/pbe",
  "/info",
  "/lab",
  "/stats",
  "/champions/Ahri",
  "/champions/Yunara",
  "/compare",
  "/builder",
  "/draft",
  "/synergy",
  "/patches",
  "/privacy",
  "/terms",
];

// Data-origin and backend names that must never show on a page (site rule), and the mode's internal name.
const FORBIDDEN = /communitydragon|cdragon|datamin|tencent|101\.qq|riot api|cloudflare|next\.js|github|built with|open full screen|\bkiwi\b/i;

// Files a page looks for first and does without when they aren't there (each falls back or stays optional):
// My Stats' local sync helper and backup, and the Simulator's locally built sprites, models and sounds
// (the models fall back to /assets/models/).
const OPTIONAL = /^\/embed\/(dashboard\/(data|api)\/|simulator\/replay-data\/(sprites\.webp|models\/|sounds\/))/;

function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`script error: ${e.message}`));
  page.on("response", (r) => {
    const url = new URL(r.url());
    if (url.host === new URL(page.url() || "http://localhost").host || url.hostname === "localhost") {
      if (r.status() >= 400 && /^\/(_next|assets|embed)\//.test(url.pathname) && !OPTIONAL.test(url.pathname)) problems.push(`${r.status()} ${url.pathname}`);
    }
  });
  return problems;
}

for (const path of PAGES) {
  test(`${path} loads cleanly`, async ({ page }) => {
    const problems = watch(page);
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), "page status").toBe(200);
    await page.waitForLoadState("load");
    await expect(page.locator("header").first()).toBeVisible();
    await expect(page.locator("footer").first()).toContainText("isn't endorsed by Riot Games");
    // let client code and embeds settle, then look for anything that went wrong
    await page.waitForTimeout(1500);
    const text = await page.locator("body").innerText();
    expect(text, "data-origin or backend wording on the page").not.toMatch(FORBIDDEN);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
    expect(problems).toEqual([]);
  });
}

test("unknown pages get the 404 page", async ({ page }) => {
  const res = await page.goto("/champions/NotAChampion");
  expect(res?.status()).toBe(404);
  const res2 = await page.goto("/this-page-does-not-exist");
  expect(res2?.status()).toBe(404);
  await expect(page.locator("header").first()).toBeVisible();
});

test("old addresses redirect to the current tabs", async ({ page }) => {
  for (const [from, to] of [
    ["/guide", "/info"],
    ["/tools/guide", "/info"],
    ["/tools/simulator", "/simulator"],
    ["/china", "/tier-list"],
    ["/tools/fun", "/lab"],
    ["/augments", "/tier-list?tab=augments"],
  ]) {
    await page.goto(from);
    expect(new URL(page.url()).pathname + new URL(page.url()).search, from).toBe(to);
  }
  await page.goto("/kitchen");
  expect(new URL(page.url()).hash).toBe("#cook-builds");
});

test("new visitors start in dark mode", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
