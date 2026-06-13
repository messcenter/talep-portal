import { expect, test, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownView } from "./MarkdownView";

const render = (src: string) => renderToStaticMarkup(<MarkdownView source={src} />);

describe("MarkdownView security", () => {
  test("strips raw <script>", () => {
    const html = render("merhaba <script>alert(1)</script> son");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)</script>");
  });
  test("drops javascript: link href", () => {
    expect(render("[tıkla](javascript:alert(1))")).not.toContain("javascript:");
  });
  test("drops javascript: image src", () => {
    expect(render("![x](javascript:alert(1))")).not.toContain("javascript:");
  });
  test("strips inline event handler from raw html img", () => {
    expect(render('<img src="x" onerror="alert(1)">')).not.toContain("onerror");
  });
});

describe("MarkdownView rendering", () => {
  test("bold + list + safe link + image", () => {
    const html = render("**kalın**\n\n- a\n- b\n\n[link](https://x.com) ![alt](https://x.com/i.png)");
    expect(html).toContain("<strong>kalın</strong>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain('href="https://x.com"');
    expect(html).toContain('src="https://x.com/i.png"');
  });
});
