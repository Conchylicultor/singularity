/**
 * The Chromium launch argv. Pure, so the security-critical parts of it are
 * unit-testable without starting a browser.
 *
 * `--host-resolver-rules` is a **launch** flag, and it is the only mechanism
 * inside Chromium that pins DNS. That single fact is why this primitive launches
 * one browser per call: a warm browser reused for a second host would have to
 * resolve that host with Chromium's own unguarded resolver, throwing away the
 * DNS-rebinding protection `safe-fetch` exists to provide.
 */

/** The resolver rule that makes every unpinned hostname unresolvable. */
export const CATCH_ALL_RESOLVER_RULE = "MAP * ~NOTFOUND";

/**
 * Build the resolver-rules value for one pinned (hostname, validated IP) pair.
 *
 * The catch-all is **not optional and must stay last**. Chromium applies these
 * rules in order, so a `MAP *` ahead of the pin would swallow the pin itself.
 * With it last, the pinned host resolves to the address we security-checked and
 * *nothing else resolves at all* — so anything that slips past request
 * interception (a prefetch, a beacon, a cross-host redirect) dies in the
 * resolver rather than on the network.
 */
export function buildResolverRules(hostname: string, ip: string): string {
  // Bracket IPv6 so Chromium reads the replacement as one address, matching the
  // bracketing `safe-fetch`'s own pinned dial does.
  const replacement = ip.includes(":") ? `[${ip}]` : ip;
  return `MAP ${hostname} ${replacement},${CATCH_ALL_RESOLVER_RULE}`;
}

/**
 * The full argv for a browser pinned to exactly one host.
 *
 * Two flags are conspicuous by their ABSENCE, and their absence is the security
 * posture, not an oversight:
 *
 * - **Never `--no-sandbox`.** This browser executes hostile third-party JS in
 *   the user's own account; the sandbox is the containment, and disabling it to
 *   dodge a launch problem would trade the entire blast-radius argument for
 *   convenience.
 * - **Never `--ignore-certificate-errors`** (nor `ignoreHTTPSErrors` on the
 *   context). We dial a pinned IP but keep SNI and certificate verification
 *   bound to the real hostname; ignoring cert errors would make the pin
 *   meaningless against an on-path attacker.
 *
 * Both are pinned by `launch-args.test.ts` so they cannot reappear quietly.
 */
export function buildLaunchArgs(hostname: string, ip: string): string[] {
  return [
    `--host-resolver-rules=${buildResolverRules(hostname, ip)}`,
    // No telemetry / variations / safe-browsing chatter: every one of those is a
    // request to a host we did not pin, i.e. a guaranteed resolver failure and
    // wasted startup time.
    "--disable-background-networking",
    "--no-first-run",
    "--disable-sync",
    "--disable-component-update",
    // Cap the renderer's JS heap: a hostile page must not be able to spend the
    // backend's memory. 512 MB is far above any document we intend to read.
    "--js-flags=--max-old-space-size=512",
  ];
}
