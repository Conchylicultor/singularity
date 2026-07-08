import { describe, expect, it } from "vitest";

import { shouldRedirectToDefaultApp } from "../internal/redirect-gate";

// The gate for the ONLY destructive `replaceState` redirect in the app. It must
// never overwrite a URL that could still resolve to a real app.
describe("shouldRedirectToDefaultApp", () => {
  const base = {
    matched: false,
    hasDefault: true,
    isBareRoot: false,
    deferredComplete: true,
    anyAppShellLoadError: false,
  };

  it("a matched app never redirects", () => {
    expect(shouldRedirectToDefaultApp({ ...base, matched: true })).toBe(false);
  });

  it("no default app ⇒ nothing to canonicalize to", () => {
    expect(shouldRedirectToDefaultApp({ ...base, hasDefault: false })).toBe(false);
  });

  it("bare root redirects immediately, regardless of load state", () => {
    expect(
      shouldRedirectToDefaultApp({
        ...base,
        isBareRoot: true,
        deferredComplete: false,
      }),
    ).toBe(true);
    expect(
      shouldRedirectToDefaultApp({
        ...base,
        isBareRoot: true,
        anyAppShellLoadError: true,
      }),
    ).toBe(true);
  });

  it("unmatched + still loading ⇒ wait (an app shell may still register)", () => {
    expect(shouldRedirectToDefaultApp({ ...base, deferredComplete: false })).toBe(false);
  });

  it("unmatched + settled + a shell failed to load ⇒ suppress (show error, keep the URL)", () => {
    expect(shouldRedirectToDefaultApp({ ...base, anyAppShellLoadError: true })).toBe(false);
  });

  it("unmatched + settled + healthy ⇒ redirect", () => {
    expect(shouldRedirectToDefaultApp(base)).toBe(true);
  });
});
