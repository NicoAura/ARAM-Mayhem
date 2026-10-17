import { afterEach, describe, expect, it } from "vitest";
import { adminFromCookie, adminToken } from "@/lib/admin-session";

describe("admin sign-in cookie", () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it("accepts its own signature and nothing else", async () => {
    process.env.ADMIN_PASSWORD = "correct horse";
    const token = await adminToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await adminFromCookie(token!)).toBe(true);
    expect(await adminFromCookie(token!.replace(/.$/, (c) => (c === "0" ? "1" : "0")))).toBe(false);
    expect(await adminFromCookie(undefined)).toBe(false);
    expect(await adminFromCookie("")).toBe(false);
  });

  it("signs everyone out when the password changes", async () => {
    process.env.ADMIN_PASSWORD = "first";
    const old = await adminToken();
    process.env.ADMIN_PASSWORD = "second";
    expect(await adminFromCookie(old!)).toBe(false);
  });

  it("lets no one in when no password is set", async () => {
    expect(await adminToken()).toBeNull();
    expect(await adminFromCookie("anything")).toBe(false);
  });
});
