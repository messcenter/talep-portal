import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FilePicker, formatBytes } from "./FilePicker";

test("formatBytes humanizes sizes", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1024)).toBe("1.0 KB");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(1048576)).toBe("1.0 MB");
});

test("empty FilePicker shows trigger + empty hint", () => {
  const html = renderToStaticMarkup(<FilePicker value={[]} onChange={() => {}} />);
  expect(html).toContain("Dosya seç");
  expect(html).toContain("Dosya seçilmedi");
});
