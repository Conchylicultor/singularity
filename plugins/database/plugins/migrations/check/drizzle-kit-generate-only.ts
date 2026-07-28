import { grepCode, type CodeMatch } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

// Inlined minimal Check shape (mirrors the sibling orphaned-tables /
// imperative-create-table-allowlisted checks) to avoid a cross-plugin import of
// the framework Check type from a check file.
type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

// The CLI tool name, split so this file's own source is never itself mistaken
// for an invocation. The paths check uses the same trick.
const TOOL = "drizzle" + "-kit";

// Every subcommand the tool exposes. `generate` is the only pure-filesystem one
// (snapshot diff → SQL); every other one DIALS the database in `dbCredentials`,
// which drizzle.config.ts deliberately sets to a non-resolving sentinel.
const SUBCOMMANDS = [
  "generate",
  "migrate",
  "push",
  "pull",
  "studio",
  "check",
  "up",
  "export",
  "introspect",
] as const;

const ONLY_ALLOWED = "generate";
const SUB_ALT = SUBCOMMANDS.join("|");

// In TS the tool and its subcommand are argv ELEMENTS: quoted tokens whose
// ENTIRE content is the word. Requiring the quotes on both sides is what
// separates a real command array from the many prose mentions of the tool in
// error messages ("\nError: drizzle-kit printed a diagnostic…") and lint hints —
// and it is why a nearby `cmd.push(…)` can never be read as the `push`
// subcommand.
const TS_TOOL_RE = new RegExp(`(["'\`])${TOOL}\\1`);
const TS_SUB_RE = new RegExp(`(["'\`])(${SUB_ALT})\\1`);

// In a shell script both are bare words.
const SH_TOOL_RE = new RegExp(`(?:^|[\\s(=])${TOOL}\\s`);
const SH_SUB_RE = new RegExp(`(?:^|\\s)(${SUB_ALT})(?:\\s|$)`);

// `import … from "drizzle-kit"` / `require("drizzle-kit")` name the npm PACKAGE,
// not an invocation — drizzle.config.ts imports `defineConfig` from it.
const MODULE_SPECIFIER_RE = new RegExp(`(?:\\bfrom|\\brequire\\s*\\(|\\bimport\\s*\\()\\s*["'\`]${TOOL}`);

// How far past the tool's line to look for its subcommand. A command array is
// often written across several lines (the migrations-in-sync check writes one
// element per line), so the subcommand is not reliably on the tool's own line.
const LINE_WINDOW = 8;

export interface Invocation {
  path: string;
  line: number;
  /** The resolved subcommand, or `<none found>` when none is within reach. */
  subcommand: string;
}

/**
 * PURE helper (exported for unit testing): pair each tool occurrence with the
 * nearest following subcommand token in the same file.
 *
 * Both inputs come from `grepCode`, which masks COMMENTS but keeps string
 * interiors — the only combination that works here, since the tokens genuinely
 * live inside string literals while drizzle.config.ts's own header comment
 * legitimately names the banned subcommands.
 *
 * A tool occurrence with no subcommand in reach is reported as an offender too:
 * the invariant is that every invocation is PROVABLY `generate`, and
 * "unreadable" is not a proof.
 */
export function resolveInvocations(
  toolMatches: CodeMatch[],
  subMatches: CodeMatch[],
  subPattern: RegExp,
): Invocation[] {
  const subsByPath = new Map<string, CodeMatch[]>();
  for (const s of subMatches) {
    const list = subsByPath.get(s.path);
    if (list) list.push(s);
    else subsByPath.set(s.path, [s]);
  }
  for (const list of subsByPath.values()) list.sort((a, b) => a.line - b.line);

  return toolMatches.map((t) => {
    const nearest = (subsByPath.get(t.path) ?? []).find(
      (s) => s.line >= t.line && s.line <= t.line + LINE_WINDOW,
    );
    const word = nearest ? nearest.text.match(subPattern) : null;
    // The capture group holding the word is the LAST one in both patterns (the
    // TS pattern's first group is the quote character it back-references).
    const subcommand = word ? word[word.length - 1]! : "<none found>";
    return { path: t.path, line: t.line, subcommand };
  });
}

/** One extension family's scan: its pathspecs and its two token patterns. */
const DIALECTS = [
  { pathspecs: ["*.ts", "*.tsx"], tool: TS_TOOL_RE, sub: TS_SUB_RE, skipModuleSpecifier: true },
  // A shell script is scanned with the same (TS) comment masker, which does not
  // understand `#`. Harmless: a shell comment that names the tool also names the
  // subcommand it is describing, so it resolves to that word rather than to
  // nothing.
  { pathspecs: ["*.sh"], tool: SH_TOOL_RE, sub: SH_SUB_RE, skipModuleSpecifier: false },
] as const;

// This file spells out every subcommand name in its own patterns and hint; exempt
// it by path, the same self-reference hatch no-raw-websocket and
// imperative-create-table-allowlisted use.
const SELF = "plugins/database/plugins/migrations/check/drizzle-kit-generate-only.ts";

const check: Check = {
  id: "database-migrations:drizzle-kit-generate-only",
  description:
    "every drizzle-kit invocation uses the `generate` subcommand — the dialing subcommands (push/migrate/studio/pull) are unsupported through drizzle.config.ts, whose credentials are a non-resolving sentinel",
  // Pure source scan, but cheap (one git grep narrows to a handful of files).
  // Never cache: a stale PASS on a correctness gate is worse than re-scanning.
  cacheSignature: () => null,
  async run() {
    const root = await getWorktreeRoot();
    const offenders: Invocation[] = [];

    for (const dialect of DIALECTS) {
      // maskStrings:false is load-bearing and is the sanctioned token-in-string
      // case: the tool name IS a string literal (an argv element), so a full
      // mask would erase the very token being searched for. Comments are masked
      // regardless, which is what keeps drizzle.config.ts's header — where the
      // banned subcommands are named on purpose — out of the scan.
      const keep = (m: CodeMatch) => m.path !== SELF && !m.path.startsWith("research/");
      const toolMatches = (
        await grepCode({
          root,
          pattern: dialect.tool,
          grepArg: TOOL,
          fixed: true,
          maskStrings: false,
          pathspecs: [...dialect.pathspecs],
        })
      ).filter((m) => keep(m) && !(dialect.skipModuleSpecifier && MODULE_SPECIFIER_RE.test(m.text)));

      // Same candidate files (grepArg is still the tool), scanned for subcommand
      // tokens so a command array split across lines still resolves.
      const subMatches = (
        await grepCode({
          root,
          pattern: dialect.sub,
          grepArg: TOOL,
          fixed: true,
          maskStrings: false,
          pathspecs: [...dialect.pathspecs],
        })
      ).filter(keep);

      offenders.push(
        ...resolveInvocations(toolMatches, subMatches, dialect.sub).filter(
          (i) => i.subcommand !== ONLY_ALLOWED,
        ),
      );
    }

    if (offenders.length === 0) return { ok: true };
    return {
      ok: false,
      message:
        `non-\`${ONLY_ALLOWED}\` ${TOOL} invocation in ${offenders.length} place(s):\n` +
        offenders.map((o) => `  - ${o.path}:${o.line} (subcommand: ${o.subcommand})`).join("\n"),
      hint:
        "plugins/database/plugins/migrations/drizzle.config.ts is CODEGEN config: its dbCredentials url is a " +
        "non-resolving `.invalid` sentinel, so any subcommand that dials (push/migrate/studio/pull) fails by " +
        "design. To APPLY migrations use the runner (it runs on server boot) or `./singularity apply-migrations`, " +
        "both of which build their own connection from @plugins/database/core. To GENERATE one, run " +
        "`./singularity build --migration-name <slug>` — never the tool directly. If this fired on a real " +
        `${ONLY_ALLOWED} invocation, its subcommand is more than ${LINE_WINDOW} lines below the tool name; ` +
        "move them closer together.",
    };
  },
};

export default check;
