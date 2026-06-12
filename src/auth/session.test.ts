import { expect, test, describe } from "bun:test";
import { signSession, verifySession } from "./session";

const secret = "test-secret-at-least-16-chars";
const user = { email: "a@kokilmetal.com.tr", name: "A" };

describe("session sign/verify", () => {
  test("round-trips a valid token", () => {
    const token = signSession(user, secret);
    expect(verifySession(token, secret)).toEqual(user);
  });
  test("rejects tampered payload", () => {
    const token = signSession(user, secret);
    const tampered = token.slice(0, -2) + "xx";
    expect(verifySession(tampered, secret)).toBeNull();
  });
  test("rejects wrong secret", () => {
    const token = signSession(user, secret);
    expect(verifySession(token, "other-secret-16chars")).toBeNull();
  });
  test("rejects garbage", () => {
    expect(verifySession("not-a-token", secret)).toBeNull();
  });
});

describe("session expiry", () => {
  test("accepts a token within max-age", () => {
    const token = signSession(user, secret, 1000);
    expect(
      verifySession(token, secret, { nowSeconds: 1000 + 3600, maxAgeSeconds: 28800 }),
    ).toEqual(user);
  });
  test("rejects a token older than max-age", () => {
    const token = signSession(user, secret, 1000);
    expect(
      verifySession(token, secret, { nowSeconds: 1000 + 28801, maxAgeSeconds: 28800 }),
    ).toBeNull();
  });
  test("rejects a token whose iat is implausibly in the future", () => {
    const token = signSession(user, secret, 100000);
    expect(
      verifySession(token, secret, { nowSeconds: 0, maxAgeSeconds: 28800 }),
    ).toBeNull();
  });
});
