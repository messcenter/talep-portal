import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

// SSR helper: render a React tree to a full HTML document string.
// Mirrors the old layout()'s doctype + html skeleton, but content is React.
export function render(title: string, body: ReactElement): string {
  return "<!doctype html>" + renderToStaticMarkup(
    <html lang="tr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{`${title} · Talep Portalı`}</title>
        <link rel="stylesheet" href="/app.css" />
      </head>
      {body}
    </html>,
  );
}
