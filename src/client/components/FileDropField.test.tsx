// src/client/components/FileDropField.test.tsx
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FileDropField } from "./FileDropField";

test("FileDropField renders the drag-and-drop prompt", () => {
  const html = renderToStaticMarkup(<FileDropField name="files" />);
  expect(html).toContain("sürükleyin");
});

test("FileDropField renders the accepted-types hint", () => {
  const html = renderToStaticMarkup(<FileDropField name="files" />);
  expect(html).toContain("PDF");
});

test("FileDropField wires the given name onto the file input", () => {
  const html = renderToStaticMarkup(<FileDropField name="files" />);
  expect(html).toContain('name="files"');
  expect(html).toContain('type="file"');
});
