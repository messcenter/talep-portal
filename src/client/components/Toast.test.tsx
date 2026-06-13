import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastProvider } from "./Toast";

test("ToastProvider renders children", () => {
  const html = renderToStaticMarkup(
    <ToastProvider>
      <div>içerik</div>
    </ToastProvider>,
  );
  expect(html).toContain("içerik");
});
