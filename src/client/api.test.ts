// src/client/api.test.ts
// jsdom-free — uses global stubs for fetch, document, window.

import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";

// ---- minimal DOM stubs ----
function stubGlobals(cookieStr = "csrf=tok") {
  const win = { location: { href: "" } };
  Object.defineProperty(globalThis, "document", {
    value: { cookie: cookieStr },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: win,
    configurable: true,
    writable: true,
  });
  return win;
}

function makeResponse(status: number, body?: unknown, headers?: Record<string, string>) {
  const bodyStr = body !== undefined ? JSON.stringify(body) : "";
  return new Response(bodyStr || null, {
    status,
    headers: { "content-type": "application/json", ...(headers ?? {}) },
  });
}

describe("readCookie", () => {
  it("returns value for a present cookie", async () => {
    stubGlobals("other=abc; csrf=mytoken; foo=bar");
    const { readCookie } = await import("./api");
    expect(readCookie("csrf")).toBe("mytoken");
  });

  it("returns null for a missing cookie", async () => {
    stubGlobals("other=abc");
    const { readCookie } = await import("./api");
    expect(readCookie("csrf")).toBeNull();
  });
});

describe("apiGet", () => {
  it("returns parsed JSON on 200", async () => {
    stubGlobals();
    const fetchSpy = mock(() => Promise.resolve(makeResponse(200, { id: 1, name: "Test" })));
    globalThis.fetch = fetchSpy as any;

    const { apiGet } = await import("./api");
    const result = await apiGet<{ id: number; name: string }>("/api/me");
    expect(result).toEqual({ id: 1, name: "Test" });

    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/me");
    expect((opts as any).credentials).toBe("same-origin");
  });

  it("throws on non-ok, non-401 response", async () => {
    stubGlobals();
    globalThis.fetch = mock(() => Promise.resolve(makeResponse(500))) as any;
    const { apiGet } = await import("./api");
    await expect(apiGet("/api/fail")).rejects.toThrow("500");
  });

  it("redirects to /login on 401", async () => {
    const win = stubGlobals();
    globalThis.fetch = mock(() => Promise.resolve(makeResponse(401))) as any;
    const { apiGet } = await import("./api");
    try { await apiGet("/api/me"); } catch { /* expected */ }
    expect(win.location.href).toBe("/login");
  });
});

describe("apiSend", () => {
  it("includes X-CSRF-Token from csrf cookie and credentials", async () => {
    stubGlobals("csrf=tok123");
    const fetchSpy = mock(() => Promise.resolve(makeResponse(204)));
    globalThis.fetch = fetchSpy as any;

    const { apiSend } = await import("./api");
    const result = await apiSend("/api/requests", "POST");

    expect(result).toBeNull();
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/requests");
    expect((opts as any).credentials).toBe("same-origin");
    const headers = (opts as any).headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("tok123");
  });

  it("sends Content-Type and CSRF header when contentType is provided", async () => {
    stubGlobals("csrf=tokjson");
    const fetchSpy = mock(() => Promise.resolve(makeResponse(201, { id: 1 })));
    globalThis.fetch = fetchSpy as any;

    const { apiSend } = await import("./api");
    await apiSend("/api/admin/departments", "POST", JSON.stringify({ name: "X" }), "application/json");

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = (opts as any).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-CSRF-Token"]).toBe("tokjson");
  });

  it("omits Content-Type when contentType is not provided (FormData boundary)", async () => {
    stubGlobals("csrf=tok");
    const fetchSpy = mock(() => Promise.resolve(makeResponse(204)));
    globalThis.fetch = fetchSpy as any;

    const { apiSend } = await import("./api");
    await apiSend("/api/requests", "POST", new FormData());

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = (opts as any).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("returns null on 204", async () => {
    stubGlobals();
    globalThis.fetch = mock(() => Promise.resolve(makeResponse(204))) as any;
    const { apiSend } = await import("./api");
    const result = await apiSend("/api/requests/1/reply", "POST");
    expect(result).toBeNull();
  });

  it("returns parsed JSON on 201", async () => {
    stubGlobals();
    globalThis.fetch = mock(() =>
      Promise.resolve(makeResponse(201, { id: 42 }))
    ) as any;
    const { apiSend } = await import("./api");
    const result = await apiSend<{ id: number }>("/api/requests", "POST");
    expect(result).toEqual({ id: 42 });
  });

  it("returns parsed JSON on 200", async () => {
    stubGlobals();
    globalThis.fetch = mock(() =>
      Promise.resolve(makeResponse(200, { ok: true }))
    ) as any;
    const { apiSend } = await import("./api");
    const result = await apiSend<{ ok: boolean }>("/api/path", "POST");
    expect(result).toEqual({ ok: true });
  });

  it("throws with error message from JSON body on non-ok response", async () => {
    stubGlobals();
    globalThis.fetch = mock(() =>
      Promise.resolve(makeResponse(422, { error: "invalid input" }))
    ) as any;
    const { apiSend } = await import("./api");
    await expect(apiSend("/api/requests", "POST")).rejects.toThrow("invalid input");
  });

  it("throws with errors array from JSON body on non-ok response", async () => {
    stubGlobals();
    globalThis.fetch = mock(() =>
      Promise.resolve(makeResponse(400, { errors: ["title required"] }))
    ) as any;
    const { apiSend } = await import("./api");
    await expect(apiSend("/api/requests", "POST")).rejects.toThrow();
  });

  it("redirects to /login on 401", async () => {
    const win = stubGlobals();
    globalThis.fetch = mock(() => Promise.resolve(makeResponse(401))) as any;
    const { apiSend } = await import("./api");
    try { await apiSend("/api/requests", "POST"); } catch { /* expected */ }
    expect(win.location.href).toBe("/login");
  });
});
