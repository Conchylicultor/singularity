import { describe, expect, test } from "bun:test";
import {
  clientIpFromHops,
  forwardedHops,
  hostOnly,
  requestClientIp,
} from "./forwarded";

const ok = () => new Response("ok");

function req(path: string, xff: string | null): Request {
  const headers = new Headers();
  if (xff !== null) headers.set("x-forwarded-for", xff);
  return new Request(`http://backend${path}`, { headers });
}

describe("forwardedHops", () => {
  test("absent header has no hops", () => {
    expect(forwardedHops(null)).toEqual([]);
  });
  test("splits and trims, dropping empties", () => {
    expect(forwardedHops(" 203.0.113.7 ,127.0.0.1,")).toEqual([
      "203.0.113.7",
      "127.0.0.1",
    ]);
  });
});

describe("requestClientIp", () => {
  test("public request: Caddy's entry, second-to-last", () => {
    expect(requestClientIp(req("/api/x", "203.0.113.7, 127.0.0.1"))).toBe(
      "203.0.113.7",
    );
  });
  test("a spoofed prefix cannot move the answer off Caddy's entry", () => {
    // Caddy replaces client XFF; were one ever to survive, the gateway's hop
    // is still last and Caddy's is still second-to-last.
    expect(clientIpFromHops(["6.6.6.6", "203.0.113.7", "127.0.0.1"])).toBe(
      "203.0.113.7",
    );
  });
  test("on-box request: the single hop is the client", () => {
    expect(requestClientIp(req("/api/x", "127.0.0.1"))).toBe("127.0.0.1");
  });
  test("no header throws — the request bypassed the gateway", () => {
    expect(() => requestClientIp(req("/api/x", null))).toThrow(
      /X-Forwarded-For/,
    );
  });
});

describe("hostOnly", () => {
  const route = hostOnly(ok);

  test("one hop (on the box) passes", async () => {
    const res = await route(req("/api/host-only/q", "127.0.0.1"), {});
    expect(res.status).toBe(200);
  });
  test("two hops (through Caddy) is a 404", async () => {
    const res = await route(
      req("/api/host-only/q", "203.0.113.7, 127.0.0.1"),
      {},
    );
    expect(res.status).toBe(404);
  });
  test("no header (not via the gateway) is a 404", async () => {
    const res = await route(req("/api/host-only/q", null), {});
    expect(res.status).toBe(404);
  });
  test("wrapping a route outside the prefix throws", () => {
    expect(() => route(req("/api/public", "127.0.0.1"), {})).toThrow(
      /outside \/api\/host-only\//,
    );
  });
});
