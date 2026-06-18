import { describe, expect, test } from "bun:test";
import { isProxyEscape } from "./escape-detect";

const base = {
  active: true,
  proxyEnabled: true,
  proxiedSrc: true,
  wasLoading: false,
  committed: false,
};

describe("isProxyEscape", () => {
  test("iframe-initiated load with no commit on the active proxied tab is an escape", () => {
    expect(isProxyEscape(base)).toBe(true);
  });

  test("a committed load is never an escape (normal proxied page)", () => {
    expect(isProxyEscape({ ...base, committed: true })).toBe(false);
  });

  test("a PRG POST landing commits, so it is not an escape", () => {
    // iframe-initiated (wasLoading false) but routed through the proxy → commit.
    expect(isProxyEscape({ ...base, wasLoading: false, committed: true })).toBe(
      false,
    );
  });

  test("a parent-initiated load (loading) is not an escape even without a commit", () => {
    // Non-HTML (PDF/image) or the proxy error page: no shim, no commit, but the
    // user/parent started it.
    expect(isProxyEscape({ ...base, wasLoading: true })).toBe(false);
  });

  test("not judged when proxy mode is off", () => {
    expect(isProxyEscape({ ...base, proxyEnabled: false })).toBe(false);
  });

  test("not judged for a direct (non-proxied) src", () => {
    expect(isProxyEscape({ ...base, proxiedSrc: false })).toBe(false);
  });

  test("not judged for a background (inactive) tab", () => {
    expect(isProxyEscape({ ...base, active: false })).toBe(false);
  });
});
