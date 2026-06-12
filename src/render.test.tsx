import { expect, test } from "bun:test";
import { render } from "./render";

test("render wraps content in a full html document with body and css link", () => {
  const html = render("Test", <p>merhaba</p>);
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain('lang="tr"');
  expect(html).toContain('rel="stylesheet"');
  expect(html).toContain('href="/app.css"');
  expect(html).toContain("<title>Test · Talep Portalı</title>");
  expect(html).toContain("<body");
  expect(html).toContain("merhaba");
});

test("render HTML-escapes special characters in text nodes", () => {
  const html = render("X", <span>{"a&b"}</span>);
  expect(html).toContain("a&amp;b");
});
