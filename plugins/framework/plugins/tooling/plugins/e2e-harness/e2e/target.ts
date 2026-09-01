/**
 * Where an e2e script points its browser.
 *
 * # One URL, two components
 *
 * A run has exactly ONE target URL, and it has two halves that go to two
 * different consumers:
 *
 *     --url http://wt.localhost:9000/deploy/server/3/dep/91
 *           └────── origin ────────┘└────── path ────────┘
 *           which deploy?            which screen?
 *                   ↓                       ↓
 *           pathUrl("/api/…")          page.goto(…)
 *           builds every API call      opens the screen under test
 *
 * The origin is not a second input — it is the target URL with the path cut
 * off. There is never a run where "the origin" and "the page's origin" differ,
 * which is why there is ONE flag rather than one per half.
 *
 * This file used to hand the whole string to the half that only wanted the
 * origin. `screenshot.ts` read the same unsplit value as the page — and its own
 * usage block, and the repo's CLAUDE.md, documented `--url` WITH a path. So
 * `pathUrl("/api/config-v2/…")` resolved to
 * `<origin>/deploy/server/3/dep/91/api/config-v2/…`, which the SPA catch-all
 * answers with index.html and HTTP 200: `res.ok` passes and `res.json()` throws
 * "Failed to parse JSON". Harmless until the agent-config-write revert ledger
 * made `withBrowser` itself call the app's API on every run — after which the
 * documented `screenshot.ts` invocation could not run at all.
 *
 * The split now happens once, here, and the unsplit value never leaves this
 * module. Scripts get `pathUrl(path)` (a path the SCRIPT chose), plus
 * `pageUrl(fallback)` / `requirePage(usage)` (the path the USER chose) — so
 * there is no origin string for a script to hold, navigate to, or concatenate
 * onto.
 *
 * # The default is derived, never literal
 *
 * This exists to kill a whole class of rot by construction. Before the
 * per-plugin move, four scripts carried a *literal* ephemeral worktree host as
 * their default (`att-1781283277-ilxk.localhost:9000`, …). Those worktrees are
 * long gone, so the scripts could not run as written and nobody noticed,
 * because a default that is a dead string fails at the browser, not at the type
 * checker.
 *
 * `checkoutWorktreeName(REPO_ROOT)` is the worktree directory name, which is
 * exactly the namespace the gateway serves this worktree's backend under — the
 * same derivation `test/bun-preload.ts` uses for `SINGULARITY_WORKTREE`. So a
 * script run with no arguments at all hits the deploy that `./singularity
 * build` just produced, in every worktree, forever.
 */
import {
  REPO_ROOT,
  checkoutWorktreeName,
} from "@plugins/infra/plugins/paths/core";
import {
  asNamespace,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";
import { arg, usage } from "./args";

interface Target {
  /** Scheme + host + port. Never carries a path. */
  origin: string;
  /** The page path the caller named, if any — from the URL, or from `--path`. */
  page: string | undefined;
}

/**
 * The target URL, as the caller spelled it, plus which flag carried it.
 *
 * `--base` and `--origin` are ALIASES, not separate flags with their own
 * meaning: every pre-existing invocation keeps working, and there is still only
 * one way for a caller to say "the target".
 */
function rawTarget(): { raw: string; flag: string } {
  for (const flag of ["url", "base", "origin"] as const) {
    const value = arg(flag);
    if (value !== undefined) return { raw: value, flag: `--${flag}` };
  }
  const env = process.env.SINGULARITY_E2E_BASE;
  if (env !== undefined) return { raw: env, flag: "$SINGULARITY_E2E_BASE" };

  const name = asNamespace(
    process.env.SINGULARITY_WORKTREE ?? checkoutWorktreeName(REPO_ROOT),
  );
  return { raw: namespaceUrl(name), flag: "<this worktree's deploy>" };
}

/**
 * Parse the target, or explain why it is not one.
 *
 * Deliberately NOT a bare `try { new URL(raw) }`. `new URL` only throws on
 * input it cannot parse AT ALL, and a bare host:port parses fine — it just
 * parses as something else entirely: `att-wt.localhost:9000` is read as the
 * scheme `att-wt.localhost:` with the opaque path `9000`, whose `.origin` is
 * the STRING "null". So the missing-scheme case, the one a human actually
 * types, sails through the throw-check and degrades to `null/9000` at the first
 * fetch — the same class of late, unattributable failure this module exists to
 * end. The real requirement is a scheme the browser and `fetch` can dial and a
 * host to dial it at, so that is what gets asserted.
 */
function httpUrl(raw: string, flag: string): URL {
  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch (err) {
    // `new URL` signals unparseable with a TypeError and nothing else; anything
    // else is unexpected and keeps propagating. The message comes from the
    // shared check below, so both failures read the same.
    if (!(err instanceof TypeError)) throw err;
  }

  if (
    url !== undefined &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.host !== ""
  ) {
    return url;
  }

  // Name the fix, which differs by what they actually typed: a leading `/` is a
  // page and belongs on `--path`; no `//` at all is a bare host missing its
  // scheme; anything else named a scheme we cannot dial, where prefixing
  // `http://` would only produce a second wrong URL.
  const hint = raw.startsWith("/")
    ? `  That is a page path, not a URL — pass it as --path ${raw}`
    : raw.includes("//")
      ? "  The scheme must be http or https."
      : `  It is missing a scheme — try http://${raw}`;
  usage(`${flag} is not an http(s) URL: ${raw}\n${hint}`);
}

let parsed: Target | undefined;

/**
 * Split the target once. Memoized so a malformed URL reports once, and so the
 * `--path` conflict cannot be reported twice by two different callers.
 */
function target(): Target {
  if (parsed) return parsed;

  const { raw, flag } = rawTarget();
  const url = httpUrl(raw, flag);

  // `/` is what a bare origin parses to, so it is the ABSENCE of a page path,
  // not a request for the root. A script that wants the root asks for it
  // explicitly with `pathUrl("/")`.
  const suffix = `${url.pathname}${url.search}${url.hash}`;
  const fromUrl = suffix === "/" ? undefined : suffix;
  const fromFlag = arg("path");

  if (fromUrl !== undefined && fromFlag !== undefined) {
    usage(
      `${flag} names a page (${fromUrl}) and so does --path (${fromFlag}).\n` +
        `  Pass the page once: either in the URL, or as --path against the deploy.`,
    );
  }

  parsed = { origin: url.origin, page: fromUrl ?? fromFlag };
  return parsed;
}

/**
 * `pageUrl()` was called, so a page path in the target was actually honoured.
 *
 * Tracked because the alternative is silence: a per-plugin script drives its
 * own screen, so `tabs-verify.ts --url http://wt:9000/pages` would run against
 * `/agents` and pass, having tested a screen the caller did not ask for. See
 * `unconsumedPage()`.
 */
let pageConsumed = false;

/**
 * The page path the caller named and no script ever read, if any.
 *
 * `withBrowser` turns this into a failed run at teardown. Teardown rather than
 * startup because a script may legitimately call `pageUrl()` inside the
 * `withBrowser` callback, which has not run yet when the browser launches.
 */
export function unconsumedPage(): string | undefined {
  if (pageConsumed) return undefined;
  return target().page;
}

/** The target's origin joined to an app path, with exactly one slash between. */
export function pathUrl(path: string): string {
  return `${target().origin}/${path.replace(/^\/+/, "")}`;
}

/**
 * The page to open: the path the CALLER named (`--url`'s path, or `--path`),
 * falling back to the one this script drives by default.
 *
 * Only for tools whose job is "open the page I name" — `screenshot.ts`,
 * `perf.ts`, and the profilers. A script that verifies one specific screen
 * names it with `pathUrl` instead, and a caller who passes a page to such a
 * script is told so rather than quietly getting the wrong screen.
 */
export function pageUrl(fallbackPath = "/"): string {
  pageConsumed = true;
  return pathUrl(target().page ?? fallbackPath);
}

/**
 * `pageUrl` for a harness that cannot pick a default page on the caller's
 * behalf — the page twin of `args.ts`'s `requireArg`.
 *
 * A generic probe ("point me at a surface where X happens") has no route of its
 * own to fall back to: a hardcoded one is exactly what rots when the app it
 * named is deleted. So an absent page is a caller error, not a default.
 */
export function requirePage(usageLine: string): string {
  pageConsumed = true;
  const page = target().page;
  if (page === undefined) usage(usageLine);
  return pathUrl(page);
}
