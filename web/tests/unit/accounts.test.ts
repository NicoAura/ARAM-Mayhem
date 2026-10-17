import { describe, expect, it } from "vitest";
import { checkPasswordHash, cleanData, cleanEmail, cleanPassword, hashPassword } from "@/lib/accounts";
import { ownerFromCookie } from "@/lib/admin-session";

describe("account passwords", () => {
  it("stores a salted hash that checks only the right password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).toMatch(/^pbkdf2\$100000\$/);
    expect(stored).not.toContain("correct horse");
    expect(await hashPassword("correct horse battery")).not.toBe(stored); // a new salt each time
    expect(await checkPasswordHash("correct horse battery", stored)).toBe(true);
    expect(await checkPasswordHash("correct horse batterY", stored)).toBe(false);
    expect(await checkPasswordHash("anything", null)).toBe(false);
  });

  it("asks for a real email and a long enough password", () => {
    expect(cleanEmail("  Nico@Example.com ")).toBe("nico@example.com");
    expect(() => cleanEmail("not an email")).toThrow(/valid email/);
    expect(() => cleanPassword("short")).toThrow(/10 characters/);
    expect(cleanPassword("long enough pw")).toBe("long enough pw");
  });
});

describe("synced account data", () => {
  it("keeps only champion ids and known settings of the right type", () => {
    const d = cleanData({
      favorites: ["Ahri", "Ahri", "<script>", 5, "Kai'Sa"],
      settings: { sound: false, motion: "reduce", graphics: 3, evil: "x" },
      extra: "dropped",
    });
    expect(d).toEqual({ favorites: ["Ahri", "Kai'Sa"], settings: { sound: false, motion: "reduce" } });
    expect(cleanData(null)).toEqual({ favorites: [], settings: {} });
  });
});

describe("owner-only files", () => {
  it("stay closed without a signed-in owner session", async () => {
    expect(await ownerFromCookie(undefined)).toBe(false);
    expect(await ownerFromCookie("not-a-session")).toBe(false);
    expect(await ownerFromCookie("x".repeat(43))).toBe(false); // no accounts database outside Cloudflare
  });
});

describe("challenge tokens and title on the account page", async () => {
  const { shownOff } = await import("@/lib/riot");
  it("names the shown tokens at their level and the picked title", () => {
    const got = shownOff({ challengeIds: [101000, 999999999], title: "10100006" }, [
      { challengeId: 101000, level: "MASTER", value: 1, percentile: 0.1 },
    ]);
    expect(got.title).toBe("ARAM God");
    expect(got.tokens).toEqual([{ id: 101000, name: "ARAM Authority", description: expect.any(String), level: "MASTER" }]);
  });
  it("shows nothing when the player picked nothing", () => {
    expect(shownOff(undefined, [])).toEqual({ tokens: [], title: null });
  });
});

describe("Sign in with Google or Apple", async () => {
  const { readIdToken } = await import("@/lib/oauth");
  const token = (claims: Record<string, unknown>) => `x.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.y`;
  const good = { iss: "accounts.google.com", aud: "client", exp: Date.now() / 1000 + 60, nonce: "n1", sub: "123", email: "A@Example.com", email_verified: true };

  it("reads who signed in, keeping only a verified email", () => {
    expect(readIdToken("google", token(good), "client", "n1")).toEqual({ subject: "123", email: "a@example.com" });
    expect(readIdToken("google", token({ ...good, email_verified: false }), "client", "n1").email).toBeNull();
    expect(readIdToken("apple", token({ ...good, iss: "https://appleid.apple.com", email_verified: "true" }), "client", "n1").email).toBe("a@example.com");
  });

  it("rejects a token for another site, another sign-in, another issuer or one that expired", () => {
    expect(() => readIdToken("google", token(good), "other-client", "n1")).toThrow();
    expect(() => readIdToken("google", token(good), "client", "n2")).toThrow();
    expect(() => readIdToken("apple", token(good), "client", "n1")).toThrow();
    expect(() => readIdToken("google", token({ ...good, exp: 1 }), "client", "n1")).toThrow();
    expect(() => readIdToken("google", "garbage", "client", "n1")).toThrow();
  });
});

describe("Sign in with Apple's client secret", () => {
  it("is an ES256 token signed with the .p8 key", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
    Object.assign(process.env, { APPLE_CLIENT_ID: "com.example.web", APPLE_TEAM_ID: "TEAM", APPLE_KEY_ID: "KEY", APPLE_PRIVATE_KEY: pem });
    let secret = "";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      secret = new URLSearchParams(String(init.body)).get("client_secret") ?? "";
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;
    try {
      const { exchange } = await import("@/lib/oauth");
      await expect(exchange("apple", "https://example.com", "code", "n")).rejects.toThrow(); // no id token in the fake answer
    } finally {
      globalThis.fetch = realFetch;
    }
    const [head, body, sig] = secret.split(".");
    const dec = (s: string) => JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/")));
    expect(dec(head)).toEqual({ alg: "ES256", kid: "KEY" });
    expect(dec(body)).toMatchObject({ iss: "TEAM", sub: "com.example.web", aud: "https://appleid.apple.com" });
    const raw = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(sig.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, raw, new TextEncoder().encode(`${head}.${body}`))).toBe(true);
  });
});
