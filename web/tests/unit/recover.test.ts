// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearReloadFlag, isStaleChunk, reloadOnce } from "@/lib/recover";

describe("stale script recovery", () => {
  it("recognises errors from a version that is no longer live", () => {
    const e = (name: string, message: string) => Object.assign(new Error(message), { name });
    expect(isStaleChunk(e("ChunkLoadError", "Loading chunk 123 failed."))).toBe(true);
    expect(isStaleChunk(e("TypeError", "Failed to fetch dynamically imported module: /x.js"))).toBe(true);
    expect(isStaleChunk(e("TypeError", "Cannot read properties of undefined"))).toBe(false);
  });

  describe("reloadOnce", () => {
    beforeEach(() => {
      sessionStorage.clear();
      vi.stubGlobal("location", { reload: vi.fn() });
    });

    afterEach(() => vi.unstubAllGlobals());

    it("reloads once, then refuses again within 30 seconds so a broken page can't loop", () => {
      expect(reloadOnce()).toBe(true);
      expect(reloadOnce()).toBe(false);
      clearReloadFlag();
      expect(reloadOnce()).toBe(true);
      expect(location.reload).toHaveBeenCalledTimes(2);
    });
  });
});
