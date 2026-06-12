import { expect, test } from "bun:test";
import { render } from "./render";

test("render wraps markup in a full html document with css link", () => {
  const html = render("Test", <p>merhaba</p>);
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain('lang="tr"');
  expect(html).toContain('rel="stylesheet"');
  expect(html).toContain('href="/app.css"');
  expect(html).toContain("merhaba");
  expect(html).toContain("Test");
});

test("render escapes nothing it should not and renders children verbatim text", () => {
  const html = render("X", <span>{"a&b"}</span>);
  expect(html).toContain("a&amp;b");
});
