import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "./StatusBadge";

test("StatusBadge renders Turkish label for slug", () => {
  const html = renderToStaticMarkup(<StatusBadge status="clarifying" />);
  expect(html).toContain("Netleştiriliyor");
});

test("StatusBadge renders accepted label", () => {
  const html = renderToStaticMarkup(<StatusBadge status="accepted" />);
  expect(html).toContain("Kabul edildi");
});
