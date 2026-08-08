import { describe, expect, test } from "bun:test";
import { detectBotMitigation } from "./bot-mitigation";

describe("named mitigation headers", () => {
  // The verified case: shotgun.live answers every plain request this way, on the
  // first request, in ~200ms — including its own `Allow: /` robots.txt targets.
  test("x-vercel-mitigated on a 429 is mitigation", () => {
    expect(
      detectBotMitigation(429, { "x-vercel-mitigated": "challenge" }),
    ).toEqual({ signal: "x-vercel-mitigated: challenge" });
  });

  test("fires on 403 and 503 too", () => {
    expect(detectBotMitigation(403, { "cf-mitigated": "challenge" })).toEqual({
      signal: "cf-mitigated: challenge",
    });
    expect(
      detectBotMitigation(503, { "x-vercel-mitigated": "challenge" }),
    ).not.toBeNull();
  });

  test("reads a structural header object (a Response's headers)", () => {
    const headers = new Headers({ "x-vercel-mitigated": "challenge" });
    expect(detectBotMitigation(429, headers)).toEqual({
      signal: "x-vercel-mitigated: challenge",
    });
  });

  test("is case-insensitive over a hand-built record", () => {
    expect(
      detectBotMitigation(429, { "X-Vercel-Mitigated": "challenge" }),
    ).toEqual({ signal: "x-vercel-mitigated: challenge" });
  });
});

describe("the refusals, each of which is load-bearing", () => {
  // A readable page carrying the header is still readable. Escalating on a 2xx
  // would also make the caller's content fingerprint bistable, paying for a model
  // call every tick.
  test("never fires on a 2xx", () => {
    expect(
      detectBotMitigation(200, { "x-vercel-mitigated": "challenge" }),
    ).toBeNull();
  });

  // The real rate-limit case. It must keep retrying — it will succeed later.
  test("a bare 429 with no evidence is not mitigation", () => {
    expect(detectBotMitigation(429, {})).toBeNull();
    expect(detectBotMitigation(429, { "retry-after": "120" })).toBeNull();
  });

  test("an ordinary 404 or 500 is not mitigation", () => {
    expect(detectBotMitigation(404, {})).toBeNull();
    expect(detectBotMitigation(500, { server: "cloudflare" })).toBeNull();
  });

  test("no vendor we have not observed or that has not documented a header", () => {
    // Akamai / DataDome / PerimeterX are deliberately absent: a guessed header
    // that never fires is dead code that reads like coverage.
    expect(
      detectBotMitigation(403, { "x-akamai-bot-manager": "denied" }),
    ).toBeNull();
    expect(detectBotMitigation(403, { "x-datadome": "blocked" })).toBeNull();
  });
});

describe("the Cloudflare shape — inference, and narrower on purpose", () => {
  test("server: cloudflare + cf-ray on a 403/429 is mitigation", () => {
    expect(
      detectBotMitigation(403, {
        server: "cloudflare",
        "cf-ray": "8a1b2c3d4e",
      }),
    ).toEqual({ signal: "server: cloudflare, cf-ray: 8a1b2c3d4e" });
  });

  // A Cloudflare 503 is just as likely an origin outage; calling that terminal
  // would park a healthy source through a blip.
  test("NOT extended to 503", () => {
    expect(
      detectBotMitigation(503, {
        server: "cloudflare",
        "cf-ray": "8a1b2c3d4e",
      }),
    ).toBeNull();
  });

  test("needs both halves of the shape", () => {
    expect(detectBotMitigation(403, { server: "cloudflare" })).toBeNull();
    expect(detectBotMitigation(403, { "cf-ray": "8a1b2c3d4e" })).toBeNull();
  });
});
