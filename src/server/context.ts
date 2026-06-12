// src/server/context.ts
import { parseCookies } from "./cookies";

export type ReqCtx = {
  req: Request;
  method: string;
  url: URL;
  path: string;
  cookies: Record<string, string>;
  header(name: string): string | null;
};

export function makeCtx(req: Request): ReqCtx {
  const url = new URL(req.url);
  return {
    req,
    method: req.method,
    url,
    path: url.pathname,
    cookies: parseCookies(req.headers.get("cookie")),
    header: (n) => req.headers.get(n),
  };
}
