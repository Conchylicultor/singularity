import { describe, expect, test } from "bun:test";
import { decideRequest, type RequestDecision } from "./request-policy";

const PINNED = "shotgun.live";

function decide(
  url: string,
  overrides: Partial<{
    resourceType: string;
    isMainFrameNavigation: boolean;
  }> = {},
): RequestDecision {
  return decideRequest({
    url,
    resourceType: overrides.resourceType ?? "xhr",
    isMainFrameNavigation: overrides.isMainFrameNavigation ?? false,
    pinnedHost: PINNED,
  });
}

describe("SSRF — the reason this function exists", () => {
  // The resolver rules are INERT against a bare IP literal: no hostname is
  // looked up, so neither `MAP` rule applies. This check is the only thing
  // standing between hostile page JS and the cloud-metadata service.
  test("blocks the cloud-metadata address", () => {
    expect(decide("http://169.254.169.254/latest/meta-data/")).toMatchObject({
      kind: "block",
    });
  });

  test("blocks loopback, including our own backend's port", () => {
    expect(decide("http://127.0.0.1:9000/")).toMatchObject({ kind: "block" });
    expect(decide("http://localhost:9000/api/tasks")).toMatchObject({
      kind: "block",
    });
    expect(decide("http://[::1]:5432/")).toMatchObject({ kind: "block" });
  });

  test("blocks private ranges", () => {
    expect(decide("http://10.0.0.5/")).toMatchObject({ kind: "block" });
    expect(decide("http://192.168.1.1/admin")).toMatchObject({ kind: "block" });
    expect(decide("http://172.16.4.2/")).toMatchObject({ kind: "block" });
  });

  test("blocks non-http schemes", () => {
    expect(decide("file:///etc/passwd")).toMatchObject({ kind: "block" });
    expect(decide("chrome://settings")).toMatchObject({ kind: "block" });
    expect(decide("ws://evil.example.com/socket")).toMatchObject({
      kind: "block",
    });
  });

  test("lets inert, network-free schemes through", () => {
    expect(decide("data:text/css,body{}")).toEqual({ kind: "continue" });
    expect(decide("blob:https://shotgun.live/abc")).toEqual({
      kind: "continue",
    });
  });
});

describe("routing", () => {
  test("the pinned host answers for itself — a REAL Chromium request", () => {
    expect(
      decide("https://shotgun.live/en/venues/x", { resourceType: "document" }),
    ).toEqual({ kind: "continue" });
    expect(decide("https://shotgun.live/_next/app.js")).toEqual({
      kind: "continue",
    });
    // The pin binds a hostname, not a scheme or port.
    expect(decide("http://shotgun.live:8443/x")).toEqual({ kind: "continue" });
  });

  test("cross-origin subresources are proxied, not blocked", () => {
    // Blocking these outright would break every SPA whose bundle lives on a
    // third-party CDN — and break it as a silently EMPTY page.
    expect(decide("https://cdn.example.com/bundle.js")).toEqual({
      kind: "proxy",
    });
  });

  test("cosmetic subresources are skipped for speed, even on the pinned host", () => {
    for (const resourceType of ["image", "media", "font"]) {
      expect(
        decide("https://shotgun.live/hero.png", { resourceType }),
      ).toMatchObject({ kind: "block" });
    }
    // stylesheets are deliberately kept: some frameworks gate first paint on them.
    expect(
      decide("https://shotgun.live/app.css", { resourceType: "stylesheet" }),
    ).toEqual({ kind: "continue" });
  });

  test("a main-frame navigation off the pinned host is reported for relaunch", () => {
    expect(
      decide("https://www.shotgun.live/en", {
        resourceType: "document",
        isMainFrameNavigation: true,
      }),
    ).toEqual({
      kind: "cross-host-navigation",
      url: "https://www.shotgun.live/en",
    });
  });

  test("a sub-frame navigation off the pinned host is only a subresource", () => {
    expect(
      decide("https://embed.example.com/widget", { resourceType: "document" }),
    ).toEqual({ kind: "proxy" });
  });

  // The guard runs before the host comparison, so a private target can never be
  // reported as a redirect to relaunch against.
  test("a main-frame navigation to a private host is blocked, not relaunched", () => {
    expect(
      decide("http://169.254.169.254/", {
        resourceType: "document",
        isMainFrameNavigation: true,
      }),
    ).toMatchObject({ kind: "block" });
  });
});
