import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Check } from "@plugins/framework/plugins/tooling/core";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
// Own-plugin, so relative — the `@plugins/infra/plugins/namespace/core` alias
// would name this plugin from inside itself. Same shape as `paths/check`
// importing `../core/internal/paths`.
import { NAMESPACE_LABEL_RE, NAMESPACE_MAX_BYTES } from "../core/namespace";

// Files allowed to spell the namespace host suffix themselves. Each is either
// the owner of the rule, or asking a question that is not namespace identity.
const ALLOWED_PATHS = [
  // The owner, its tests, and this check.
  "plugins/infra/plugins/namespace/core/namespace.ts",
  "plugins/infra/plugins/namespace/core/namespace.test.ts",
  "plugins/infra/plugins/namespace/check/index.ts",
  // The SSRF guard refuses `.localhost` because it RESOLVES TO LOOPBACK — a
  // question about where a URL points, not about which namespace it names. It
  // must keep refusing these hosts however the namespace scheme changes.
  "plugins/infra/plugins/safe-fetch/server/internal/ssrf.ts",
  // "Did the user type a local address?" in the browser app's omnibox —
  // navigation heuristics over free text, not identity extraction.
  "plugins/apps/plugins/browser/plugins/omnibox/web/normalize.ts",
  // Generates a Caddy site-block for a PUBLIC deploy, and documents the
  // gateway's `.localhost` fallthrough as the reason its hostnames route the way
  // they do. Prose about the rule, in another machine's config.
  "plugins/framework/plugins/cli/plugins/deploy/cli/internal/converge-script.ts",
];

/**
 * The two shapes that ARE namespace identity, as opposed to the many benign
 * mentions of `.localhost` in the tree.
 *
 * A bare `.localhost` grep is useless here: it also matches sample URLs in test
 * fixtures, `--help` text, check hints and the SSRF guard — 26 hits, 23 of them
 * fine. What actually went wrong is narrower, and is greppable exactly:
 *
 *  - BUILDING a host out of a value. Every one of the ~25 swept sites was an
 *    interpolation followed by the suffix — which is also how the port came to
 *    be written out 25 times.
 *  - PARSING the suffix back off a host. Four call sites did this four different
 *    ways; one took `host.split(".")[0]`, which silently yields `sonata` for
 *    `sonata.att-x.localhost`.
 *
 * A hardcoded literal like `http://singularity.localhost:9000` in a test fixture
 * is deliberately NOT matched. It is sample data rather than a derivation, and
 * it cannot drift from the rule because it names nothing live.
 */
const PATTERNS: ReadonlyArray<{ pattern: RegExp; what: string }> = [
  {
    pattern: /\$\{[^}]*\}\.localhost/,
    what: "builds a namespace host from a value",
  },
  {
    pattern: /["'`]\.localhost/,
    what: "parses the namespace host suffix by hand",
  },
];

const noHandBuiltNamespaceUrlCheck: Check = {
  // INPUT-KEYED (Stage 1). Pure `grepCode` — see no-raw-websocket for rationale.
  inputKeyed: true,
  id: "namespace:no-hand-built-url",
  description:
    "A namespace URL or host must be built with namespaceUrl()/namespaceHost() and read back with namespaceFromHost(), never by spelling the host suffix inline",
  async run() {
    const root = await getWorktreeRoot();
    const offenders: string[] = [];

    for (const { pattern, what } of PATTERNS) {
      const matches = await grepCode({
        root,
        pattern,
        // Fast candidate pre-filter only; `pattern` is what actually decides.
        grepArg: ".localhost",
        fixed: true,
        // `grepCode` always masks COMMENTS, which is what keeps docstrings and
        // check hints out of this. String interiors must SURVIVE — the suffix
        // being looked for lives inside a literal.
        maskStrings: false,
      });
      for (const m of matches) {
        if (m.path.startsWith("research/")) continue;
        if (ALLOWED_PATHS.includes(m.path)) continue;
        offenders.push(
          `${m.path}:${m.line} — ${what}\n        ${m.text.trim()}`,
        );
      }
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `hand-built namespace host in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Build one with `namespaceUrl(ns, path?)` / `namespaceHost(ns)` and read one back with `namespaceFromHost(location.host)`, from `@plugins/infra/plugins/namespace/core`. " +
        "A namespace is `<composition>.<checkout>` with both sentinels elided, so only the owner knows how many labels that is — which is why the four hand-rolled parsers disagreed with each other and with the gateway. " +
        "If your line is genuinely not namespace identity (an SSRF guard, a navigation heuristic), add it to ALLOWED_PATHS with the reason.",
    };
  },
};

/**
 * The namespace vocabulary exists in two languages, and only one of them can
 * import the other's copy.
 *
 * `namespace/core/namespace.ts` is the source of truth, and every TypeScript
 * caller imports it — including `server-core/bin/select-registry.ts`, which runs
 * before anything else a backend does. It used to carry inline copies, justified
 * by a `config_v2` closure that predates the namespace plugin being extracted;
 * the owner is a zero-import module today and `paths/core` (already in the boot
 * closure) imports it, so the copies were deleted rather than pinned. That is
 * rung 1 — there is nothing to keep in sync — where this check is rung 3.
 *
 * What remains is the gateway, in Go, which cannot import TypeScript. Its copy
 * cannot be deleted, so the agreement is asserted instead.
 *
 * The Go copy is matched against a DIFFERENT expected pattern than the owner's
 * own `NAMESPACE_RE`, on purpose: the gateway composes the label into an
 * UNCAPPED multi-label name, because it validates path-safety, not meaning. Its
 * 63-byte cap is a separate constant rather than a regex clause, because Go's
 * RE2 has no lookahead.
 *
 * What must not drift is the label rule itself — the charset and the length —
 * plus the byte cap, which is the difference between two namespaces having two
 * databases and silently sharing one.
 */
const grammarInSyncCheck: Check = {
  id: "namespace:grammar-in-sync",
  description:
    "The gateway's Go copy of the namespace grammar and byte cap must match the namespace plugin's",
  async run() {
    const root = await getWorktreeRoot();
    // The label rule as it appears inside a regex literal, anchors stripped —
    // the part both spellings share.
    const label = NAMESPACE_LABEL_RE.source
      .replace(/^\^/, "")
      .replace(/\$$/, "");

    const sites = [
      {
        path: "gateway/registry.go",
        // `^<label>(\.<label>)*$` — the label, composed into a multi-label name.
        expect: "`^" + label + "(\\." + label + ")*$`",
        what: "nameRegex",
      },
      {
        path: "gateway/registry.go",
        expect: `maxNamespaceBytes = ${NAMESPACE_MAX_BYTES}`,
        what: "the namespace byte cap",
      },
    ];

    const offenders: string[] = [];
    for (const site of sites) {
      const text = await readFile(join(root, site.path), "utf8");
      if (!text.includes(site.expect)) {
        offenders.push(
          `${site.path}: ${site.what} does not contain the expected literal ${site.expect}`,
        );
      }
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `namespace grammar out of sync in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "plugins/infra/plugins/namespace/core/namespace.ts is the source of truth for both of these. " +
        "The gateway's copy exists only because Go cannot import it — every TypeScript caller imports the owner instead. " +
        "Update gateway/registry.go to match: a namespace the gateway rejects is a 404 that cannot be debugged from the TypeScript side, " +
        "and a byte cap the two sides disagree on is two apps silently sharing one Postgres database.",
    };
  },
};

export default [noHandBuiltNamespaceUrlCheck, grammarInSyncCheck];
