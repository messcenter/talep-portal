import { expect, test } from "bun:test";
import { esc } from "./escape";

test("esc escapes html-significant chars", () => {
  expect(esc(`<a href="x">&`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
});
