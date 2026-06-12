import { expect, test, describe } from "bun:test";
import { buildAuthUrl, verifyDomain } from "./google";

describe("buildAuthUrl", () => {
  test("contains client_id, redirect, scope, hd, state", () => {
    const url = buildAuthUrl({
      clientId: "cid",
      redirectUri: "http://localhost:3000/auth/google/callback",
      hostedDomain: "kokilmetal.com.tr",
      state: "abc",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("hd")).toBe("kokilmetal.com.tr");
    expect(u.searchParams.get("state")).toBe("abc");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
  });
});

describe("verifyDomain", () => {
  test("accepts matching hosted domain", () => {
    expect(
      verifyDomain(
        { email: "a@kokilmetal.com.tr", hd: "kokilmetal.com.tr" },
        "kokilmetal.com.tr",
      ),
    ).toBe(true);
  });
  test("rejects mismatched email domain even if hd claims match", () => {
    expect(
      verifyDomain(
        { email: "a@gmail.com", hd: "kokilmetal.com.tr" },
        "kokilmetal.com.tr",
      ),
    ).toBe(false);
  });
  test("rejects when hd missing", () => {
    expect(
      verifyDomain({ email: "a@kokilmetal.com.tr" }, "kokilmetal.com.tr"),
    ).toBe(false);
  });
});
