import { expect, test } from "@playwright/test";

// Bugs that were fixed once and must stay fixed.

// #91: the Riot ID sign-in box overflowed its card on phones.
test("Riot ID sign-in fits on the screen", async ({ page }) => {
  await page.goto("/stats");
  const name = page.locator('[name="riot-name"], #riot-name').first();
  await expect(name).toBeVisible();
  const vw = page.viewportSize()!.width;
  for (const sel of ['[name="riot-name"], #riot-name', '[name="riot-tag"], #riot-tag', '[name="region"], #region']) {
    const box = (await page.locator(sel).first().boundingBox())!;
    expect(box, sel).not.toBeNull();
    expect(box.x, sel).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, sel).toBeLessThanOrEqual(vw);
  }
});

// #84: a saved account whose profile has no ranked list crashed My Stats and the header.
test("an old saved account without ranked data doesn't break the page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("deeparam.riotId", JSON.stringify({ riotId: "Old#NA1", platform: "na1", at: Date.now(), profile: { gameName: "Old", tagLine: "NA1", profileIconId: 1, summonerLevel: 1 } }));
  });
  await page.route("**/api/**", (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/stats");
  await page.waitForLoadState("load");
  await expect(page.locator("header").first()).toBeVisible();
  expect(errors).toEqual([]);
});

// #73: a client-side error shows a recoverable message, not a blank "Application error".
test("a broken settings save doesn't blank the site", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("deeparam-settings", "{broken");
    localStorage.setItem("deeparam-favorites", "{broken");
    localStorage.setItem("deeparam-theme", "purple");
  });
  await page.goto("/tier-list");
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Application error");
  expect(errors).toEqual([]);
});

// The site fills the screen: no fixed-width page container on a wide desktop (#64, #82).
test("pages fill wide screens", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.setViewportSize({ width: 2200, height: 1000 });
  await page.goto("/tier-list");
  const width = await page.locator("main").first().evaluate((m) => m.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(1800);
});
