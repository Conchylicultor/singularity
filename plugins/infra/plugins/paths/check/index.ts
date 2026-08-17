import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import type {
  Check,
  CheckContext,
  CheckResult,
} from "@plugins/framework/plugins/tooling/core";
import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
// Own-plugin, so relative — the `@plugins/infra/plugins/paths/core` alias would
// name this plugin from inside itself. Same shape as `test-layout/check`
// importing `../core/test-layout`.
import { dataDirsEntries } from "../core/data-dirs.generated";
import {
  DATA_DIR_KINDS,
  dataRoot,
  getDataDirs,
} from "../core/internal/data-dir";
import type { DataDir } from "../core/internal/data-dir";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Canonical files where these patterns are intentionally allowed.
const ALLOWED_PATHS = [
  // The check itself and the paths plugin source files.
  "plugins/infra/plugins/paths/check/index.ts",
  "plugins/infra/plugins/paths/core/internal/paths.ts",
  // The declared-directory registry for the data root. Same category as
  // paths.ts: the owner of the path family names the root in its own prose
  // (every docblock here is ABOUT `~/.singularity/`), and `legacyLocation`'s
  // contract is written in terms of it.
  "plugins/infra/plugins/paths/core/internal/data-dir.ts",
  // The same paths written the way a person types them (`~/…`), for prose that
  // TELLS somebody where a directory is: UI empty states, agent prompts, check
  // messages. Its own leaf plugin because the browser needs it and cannot
  // import paths.ts (homedir() at module scope). Same category as the entry
  // above — the path family's owner declaring its own spelling.
  "plugins/infra/plugins/paths/plugins/display/core/internal/display.ts",
  "plugins/infra/plugins/paths/server/internal/bins.ts",
  // CLI bin/ imports from @plugins/infra/paths/server — no homedir() calls, no allowlist entry needed.
  // Tooling inlines the subset of paths it needs (HOME_DIR) to avoid depending on cli/.
  "plugins/framework/plugins/tooling/plugins/guards/core/guards/main-edits.ts",
  // Database plugin owns its own embedded-PG path constants and config
  // reader. Lives in shared/ so server, central, and CLI can all import
  // from a sanctioned location.
  "plugins/database/plugins/embedded/shared/internal/paths.ts",
  // Deploy owns the REMOTE host's layout — a different machine's filesystem,
  // reached over SSH. This plugin cannot source those from `paths` even in
  // principle: `paths` resolves paths on THIS machine, and a dev-host constant
  // in a generated remote script would be silently wrong (the laptop is macOS,
  // the target is Ubuntu). Same principle as the entries above — the owner of a
  // path family is source-of-truth territory; its consumers (the CLI's
  // `deploy.ts`, which generates the scripts) stay policed.
  "plugins/apps/plugins/deploy/plugins/deployments/core/derive.ts",
  // Display-only strings (JSX text, plugin description metadata, log messages).
  "plugins/auth/web/components/accounts-pane.tsx",
  "plugins/infra/plugins/attachments/server/index.ts",
  "plugins/infra/plugins/secrets/central/index.ts",
  "plugins/infra/plugins/secrets/central/internal/boot.ts",
];

// Strings are split so this source file does not match its own grep patterns.
const PATTERNS = [
  "home" + "dir()",
  "process.env" + ".HOME",
  "/opt/" + "homebrew",
  "/usr/" + "bin/",
  "/" + "Users/",
  "~/" + ".singularity",
];

const noHardcodedPathsCheck: Check = {
  id: "paths:no-hardcoded-paths",
  description:
    "Filesystem paths must come from @plugins/infra/plugins/paths/{core,server}; no homedir() calls or hardcoded path strings in TS",
  async run() {
    const root = await getWorktreeRoot();
    const seen = new Set<string>();
    const offenders: string[] = [];

    for (const pattern of PATTERNS) {
      const matches = await grepCode({
        root,
        pattern: new RegExp(escapeRegExp(pattern)),
        grepArg: pattern,
        fixed: true,
        maskStrings: false,
      });

      for (const m of matches) {
        const line = `${m.path}:${m.line}:${m.text}`;
        if (seen.has(line)) continue;
        seen.add(line);

        if (ALLOWED_PATHS.includes(m.path)) continue;
        if (m.path.startsWith("research/")) continue;

        offenders.push(line);
      }
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `hardcoded path found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint: "Import path constants from `@plugins/infra/plugins/paths/core` (e.g. HOME_DIR, SINGULARITY_DIR) or `@plugins/infra/plugins/paths/server` (e.g. GIT, CLAUDE, TMUX) instead of constructing paths from homedir() or hardcoding binary paths.",
    };
  },
};

// Guards the per-worktree ARTIFACT layout owned by paths.ts: the
// `worktrees/<name>` data dir (worktreeDataDir) and the build/release artifact
// filenames (worktreeArtifacts). Re-inlining any of these re-couples a reader
// to a writer behind paths.ts's back, exactly the drift the single source of
// truth exists to prevent.
//
// This is DISTINCT from the git-checkout `.claude/worktrees` path (see
// plugins/infra/plugins/worktree): that is a different concept and is
// intentionally NOT matched here — pattern 1 is scoped to SINGULARITY_DIR-derived
// paths, so `join(repoRoot, ".claude", "worktrees")` never trips this check and
// needs no allowlist entry.
const WORKTREE_ARTIFACT_PATTERNS: { pattern: RegExp; grepArg: string }[] = [
  // Base dir re-inline: join(SINGULARITY_DIR, "worktrees" or `${SINGULARITY_DIR}/worktrees`.
  {
    pattern: /SINGULARITY_DIR\s*(?:,\s*["'`]|\}?\/)worktrees/,
    grepArg: "worktrees",
  },
  // build-profile artifact filename.
  { pattern: /["'`]build-profile[^"'`\s]*\.json/, grepArg: "build-profile" },
  // build-logs artifact filename.
  { pattern: /["'`]build-logs[^"'`\s]*\.json/, grepArg: "build-logs" },
  // release-logs artifact filename.
  { pattern: /["'`]release-logs[^"'`\s]*\.json/, grepArg: "release-logs" },
  // build.log human-readable artifact filename.
  { pattern: /["'`]build(?:-[^"'`\s]*)?\.log/, grepArg: ".log" },
  // check.log check-transcript filename. Its absence here is what let four
  // separate `join(worktreeDataDir(name), "check.log")` call sites be written by
  // hand — and stay in sync with each other but not with the artifact layout.
  { pattern: /["'`]check(?:-[^"'`\s]*)?\.log/, grepArg: ".log" },
];

// The paths plugin OWNS the artifact layout: paths.ts defines it, the prune
// logic (core/internal/prune-artifacts.ts) mirrors the filename families
// to reap old artifacts, and both have co-located tests that reference concrete
// filenames. Anything inside the plugin is source-of-truth territory, exempt by
// the same principle that exempts paths.ts. This guard exists to stop *other*
// plugins from re-coupling to the layout behind paths.ts's back — not to police
// the owner's own internals.
const WORKTREE_ARTIFACT_ALLOWED_PREFIXES = ["plugins/infra/plugins/paths/"];

const noInlinedWorktreeArtifactsCheck: Check = {
  id: "paths:no-inlined-worktree-artifacts",
  description:
    "The per-worktree artifact layout (the worktrees/<name> data dir and the build/release artifact filenames) must come from worktreeDataDir()/worktreeArtifacts in @plugins/infra/plugins/paths; never re-inline the base dir or a raw artifact filename.",
  async run() {
    const root = await getWorktreeRoot();
    const seen = new Set<string>();
    const offenders: string[] = [];

    for (const p of WORKTREE_ARTIFACT_PATTERNS) {
      const matches = await grepCode({
        root,
        pattern: p.pattern,
        grepArg: p.grepArg,
        fixed: true,
        maskStrings: false,
      });

      for (const m of matches) {
        const line = `${m.path}:${m.line}:${m.text}`;
        if (seen.has(line)) continue;
        seen.add(line);

        if (
          WORKTREE_ARTIFACT_ALLOWED_PREFIXES.some((p) => m.path.startsWith(p))
        )
          continue;
        if (m.path.startsWith("research/")) continue;

        offenders.push(line);
      }
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `inlined worktree-artifact path found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint: "Import `worktreeDataDir` / `worktreeArtifacts` from `@plugins/infra/plugins/paths/core` (or `/server`) instead of reconstructing the ~/.singularity/worktrees/<name> dir or hardcoding artifact filenames (build-profile*.json, build-logs*.json, build*.log, check*.log, release-logs-*.json). Note: the git-checkout `.claude/worktrees` path (plugins/infra/plugins/worktree) is a different concept and intentionally out of scope.",
    };
  },
};

// ── no-undeclared-data-dirs ─────────────────────────────────────────────────
//
// The check that reads the data root AS A WHOLE. Nothing ever did, which is why
// `~/.singularity/` accreted 60-odd top-level entries — nine of them orphans
// with zero references left in the repo, ~1 GB, discovered a year late by a
// hand audit rather than by anything that runs.
//
// The two checks above are grep checks over the tree: they police how the repo
// SPELLS a path. This one polices the filesystem the repo WRITES TO, which is
// state no tree scan can see. Hence `scope: "deploy"` — the verdict is not a
// function of the working-tree hash, so it owes a `cacheSignature()` (asserted
// at load in `checks/core/runner.ts`) that folds in the real root's listing.

/**
 * Entries the OS mints that no plugin will ever own and nobody may declare.
 * Kept separate from `LEGACY_TOP_LEVEL` deliberately: that list is a to-do,
 * this one is permanent, and merging them would make the to-do list look like
 * it can never reach zero.
 */
const OS_NOISE = new Set([".DS_Store"]);

/**
 * A SHRINKING TO-DO LIST. **Nothing may be added to it, ever.**
 *
 * Seeded with everything sitting at the root the day this check landed, so it
 * lands green and the migration can proceed name by name. Each entry is a
 * directory or loose file that predates the registry; a name LEAVES this list
 * when its owner declares it via `defineDataDir` (and, for the ones that move,
 * when the launcher migration relocates it under its kind).
 *
 * Adding a name here to make the check pass would defeat the entire point: an
 * undeclared entry is either something an owner must declare, or an orphan that
 * belongs in `deprecated/`. There is no third case, and "grandfather it" is not
 * an answer for anything minted after this list was written.
 *
 * Note the kind names (`logs`, `worktrees`, and the six kinds not yet on disk)
 * are absent by construction — they are allowed as KINDS below, not as legacy.
 * So are the grandfathered live services once their `legacyLocation`
 * declarations land; the run below says so out loud when it spots one.
 */
const LEGACY_TOP_LEVEL = new Set([
  "attachments",
  "auth",
  "backups",
  "build-log.jsonl",
  "build-progress.jsonl",
  "build-progress.jsonl.1",
  "build-progress.jsonl.2",
  "build-slots",
  "central-routes.json",
  "check-progress.jsonl",
  "check-progress.jsonl.1",
  "check-progress.jsonl.2",
  "check-progress.jsonl.preformat.bak",
  "crashes",
  "database.json",
  // Transient: the sentinel mints it while the host is under duress and clears
  // it after. Present or absent, it is the same undeclared root entry.
  "duress.latch",
  "eslint-closure-cache",
  "forensics",
  "gateway.pid",
  "op-log.jsonl",
  "op-wedge-captures.log",
  "op-wedge-captures.log.1",
  "op-wedge-captures.log.2",
  "op-wedge-captures.log.3",
  "push-8x3g-detached.log",
  "push-8x3g-run.sh",
  "push-contention.jsonl",
  // Transient, like `duress.latch`: written while a push holds the mutex and
  // cleared when it finishes, so a snapshot of the root taken between pushes
  // does not see it. Seeded from the recorded pre-registry inventory rather
  // than from a live listing, for exactly that reason.
  "push-holder.json",
  "push.lock",
  "scripts",
  "secrets.json.enc",
  "signal-origin.jsonl",
  "sockets",
  "type-check-worker-background-slots",
  "type-check-worker-interactive-slots",
  "wedge-captures-manual",
  "wedge-repro",
]);

const KIND_NAMES: ReadonlySet<string> = new Set<string>(DATA_DIR_KINDS);

function isDataDir(value: unknown): value is DataDir {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DataDir>;
  const spec = candidate.spec as Partial<DataDir["spec"]> | undefined;
  return (
    typeof spec === "object" &&
    spec !== null &&
    typeof spec.kind === "string" &&
    typeof spec.name === "string" &&
    typeof spec.owner === "string" &&
    typeof candidate.file === "function" &&
    typeof candidate.ensure === "function"
  );
}

/**
 * The root's top-level entries, or `null` when the root does not exist yet — a
 * fresh machine that has never run a build. Nothing to police in that case; an
 * unreadable-for-any-other-reason root is a real fault and rethrows.
 */
function readRootEntries(): string[] | null {
  try {
    return readdirSync(dataRoot());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * The top-level names covered by a `legacyLocation` declaration — the
 * grandfathered live services (`postgres`, `sockets`, `zero`, `node`), which
 * are declared where they already sit rather than moved under their kind.
 *
 * The FIRST segment only: a legacy path may reach deeper than the root's own
 * listing, and what is being cleared here is exactly one top-level entry.
 */
function legacyDeclaredTopLevel(dirs: Iterable<DataDir>): Set<string> {
  const names = new Set<string>();
  for (const dir of dirs) {
    const legacy = dir.spec.legacyLocation;
    if (legacy) names.add(legacy.path.split("/")[0]!);
  }
  return names;
}

const noUndeclaredDataDirsCheck: Check = {
  id: "paths:no-undeclared-data-dirs",
  description:
    "Every top-level entry under the singularity data root is a declared data dir (defineDataDir), one of the closed set of kinds, or a grandfathered legacy entry — nothing mints a directory at the root behind the registry's back.",
  // The subject is the live filesystem, not the tree — see the block comment
  // above. A deploy-scoped check MUST supply a cacheSignature().
  scope: "deploy",
  cacheSignature(): string {
    // The verdict is a function of the root's top-level listing (this) plus the
    // declarations (tree content, already covered by the runner's tree hash).
    // Cheap: one readdir, no stat pass.
    const entries = readRootEntries();
    if (entries === null) return "no-root";
    return createHash("sha256")
      .update([...entries].sort().join("\n"))
      .digest("hex");
  },
  async run(ctx: CheckContext): Promise<CheckResult> {
    const entries = readRootEntries();
    if (entries === null) return { ok: true };

    // Loading the collected dir EVALUATES each owner's `data-dirs/index.ts`, and
    // the `defineDataDir` calls in them are what populate the registry. Read the
    // registry rather than the returned array, so declarations already made by
    // anything else in this process are counted too.
    await loadCollectedDir<DataDir>(dataDirsEntries, {
      isItem: isDataDir,
      dedupeKey: (d) => `${d.spec.kind}/${d.spec.name}`,
      label: "data-dir",
    });
    const declared = [...getDataDirs().values()];
    const legacyDeclared = legacyDeclaredTopLevel(declared);

    const offenders = entries.filter(
      (name) =>
        !OS_NOISE.has(name) &&
        !KIND_NAMES.has(name) &&
        !legacyDeclared.has(name) &&
        !LEGACY_TOP_LEVEL.has(name),
    );

    // The list is only a to-do list if somebody is told when an item is done.
    // A name that is BOTH grandfathered here and covered by a real declaration
    // is a line this file can now delete.
    const redundant = [...legacyDeclared].filter((n) =>
      LEGACY_TOP_LEVEL.has(n),
    );
    if (redundant.length > 0) {
      ctx.log?.(
        `paths:no-undeclared-data-dirs: ${redundant.length} LEGACY_TOP_LEVEL entr(ies) now carry a declaration and can be removed from the list: ${redundant.sort().join(", ")}`,
        "stdout",
      );
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `${offenders.length} undeclared entr(ies) at the data root (${dataRoot()}):\n    ` +
        offenders.sort().join("\n    "),
      hint:
        "Every directory under the data root has exactly one owning plugin. Declare it: create " +
        "`plugins/<owner>/data-dirs/index.ts` default-exporting a `DataDir[]` built with " +
        "`defineDataDir({ kind, name, owner, description, reclaim })` from " +
        "`@plugins/infra/plugins/paths/core`, then read `.path` / `.file(…)` / `.ensure()` from it " +
        "instead of joining the root by hand (see plugins/infra/plugins/paths/CLAUDE.md). If nothing " +
        "owns the entry any more, move it into `deprecated/` by hand — it is an orphan, and that is " +
        "the quarantine this check drains into. Do NOT add it to LEGACY_TOP_LEVEL: that list is a " +
        "shrinking record of what predates the registry, and nothing may be added to it.",
    };
  },
};

export default [
  noHardcodedPathsCheck,
  noInlinedWorktreeArtifactsCheck,
  noUndeclaredDataDirsCheck,
];
