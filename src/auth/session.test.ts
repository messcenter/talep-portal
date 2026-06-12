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
