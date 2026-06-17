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
test("StatusBadge renders in_progress label", () => {
  const html = renderToStaticMarkup(<StatusBadge status="in_progress" />);
  expect(html).toContain("Yapılıyor");
});
test("StatusBadge renders done label", () => {
  const html = renderToStaticMarkup(<StatusBadge status="done" />);
  expect(html).toContain("Tamamlandı");
});
test("StatusBadge renders cancelled label", () => {
  const html = renderToStaticMarkup(<StatusBadge status="cancelled" />);
  expect(html).toContain("İptal edildi");
});
