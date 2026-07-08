/**
 * The gate for apps-layout's default-app canonicalization redirect — the ONLY
 * raw `replaceState` redirect in the app, and DESTRUCTIVE (it overwrites the
 * address bar), so it must never fire on a URL that could still resolve.
 *
 * Extracted from the layout component so the decision is a named, unit-testable
 * pure function rather than an inline `useEffect` condition. `AppsLayout` calls
 * it with live signals; a change here changes both the redirect and the
 * suppressed-surface derivation, which read the same rule.
 *
 *  - matched app OR no default app         ⇒ nothing to canonicalize.
 *  - bare `/`                              ⇒ redirect immediately (nothing to
 *                                            destroy; keeps cold-start instant).
 *  - non-bare, deferred tier NOT settled   ⇒ wait (an app shell owning this URL
 *                                            may still register).
 *  - non-bare, settled, an app shell failed⇒ suppress (show the error surface;
 *                                            never destroy a possibly-valid URL).
 *  - non-bare, settled, healthy            ⇒ redirect (genuinely unmatched).
 */
export function shouldRedirectToDefaultApp(opts: {
  /** An app's `path` prefix owns the current URL (`activeApp` resolved). */
  matched: boolean;
  /** A default app exists to canonicalize to. */
  hasDefault: boolean;
  /** The current pathname is the bare root `/`. */
  isBareRoot: boolean;
  /** The deferred plugin tier has fully settled. */
  deferredComplete: boolean;
  /** Any app shell under `apps/plugins/` failed to load (coarse by design). */
  anyAppShellLoadError: boolean;
}): boolean {
  if (opts.matched || !opts.hasDefault) return false;
  if (opts.isBareRoot) return true;
  if (!opts.deferredComplete) return false;
  if (opts.anyAppShellLoadError) return false;
  return true;
}
