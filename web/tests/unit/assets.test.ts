import { describe, expect, it } from "vitest";
import { localAsset } from "@/lib/assets";

describe("localAsset", () => {
  it("points client-file URLs at the site's own lower-case copy", () => {
    expect(localAsset("https://raw.communitydragon.org/latest/Game/Assets/UX/Foo.PNG")).toBe("/assets/cd/latest/game/assets/ux/foo.png");
  });

  it("never ships the mode's internal name in an asset path", () => {
    const out = localAsset("https://raw.communitydragon.org/latest/game/assets/ux/kiwi/augments/icons/thing_small.png");
    expect(out).not.toMatch(/kiwi/i);
    expect(out).toContain("/mayhem/");
  });

  it("keeps Data Dragon paths' case", () => {
    expect(localAsset("https://ddragon.leagueoflegends.com/cdn/16.20.1/img/spell/AspectOfTheCougar.png")).toBe(
      "/assets/dd/16.20.1/img/spell/AspectOfTheCougar.png",
    );
  });

  it("passes through empty and already-local values", () => {
    expect(localAsset(undefined)).toBeUndefined();
    expect(localAsset("")).toBe("");
    expect(localAsset("/assets/x.png")).toBe("/assets/x.png");
  });
});
