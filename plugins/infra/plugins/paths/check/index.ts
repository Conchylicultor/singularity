import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Canonical files where these patterns are intentionally allowed.
const ALLOWED_PATHS = [
  // The check itself and the paths plugin source files.
  "plugins/infra/plugins/paths/check/index.ts",
  "plugins/infra/plugins/paths/core/internal/paths.ts",
  "plugins/infra/plugins/paths/server/internal/bins.ts",
  // CLI bin/ imports from @plugins/infra/paths/server — no homedir() calls, no allowlist entry needed.
  // Tooling inlines the subset of paths it needs (HOME_DIR, libpqEnv) to avoid depending on cli/.
  "plugins/framework/plugins/tooling/plugins/guards/core/guards/main-edits.ts",
  // Database plugin owns its own embedded-PG path constants and config
  // reader. Lives in shared/ so server, central, and CLI can all import
  // from a sanctioned location.
  "plugins/database/plugins/embedded/shared/internal/paths.ts",
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
  { pattern: /SINGULARITY_DIR\s*(?:,\s*["'`]|\}?\/)worktrees/, grepArg: "worktrees" },
  // build-profile artifact filename.
  { pattern: /["'`]build-profile[^"'`\s]*\.json/, grepArg: "build-profile" },
  // build-logs artifact filename.
  { pattern: /["'`]build-logs[^"'`\s]*\.json/, grepArg: "build-logs" },
  // release-logs artifact filename.
  { pattern: /["'`]release-logs[^"'`\s]*\.json/, grepArg: "release-logs" },
  // build.log human-readable artifact filename.
  { pattern: /["'`]build(?:-[^"'`\s]*)?\.log/, grepArg: ".log" },
];

// The paths plugin OWNS the artifact layout: paths.ts defines it, the prune
// logic (server/internal/prune-build-artifacts.ts) mirrors the filename families
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

        if (WORKTREE_ARTIFACT_ALLOWED_PREFIXES.some((p) => m.path.startsWith(p))) continue;
        if (m.path.startsWith("research/")) continue;

        offenders.push(line);
      }
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `inlined worktree-artifact path found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint: "Import `worktreeDataDir` / `worktreeArtifacts` from `@plugins/infra/plugins/paths/core` (or `/server`) instead of reconstructing the ~/.singularity/worktrees/<name> dir or hardcoding artifact filenames (build-profile*.json, build-logs*.json, build*.log, release-logs-*.json). Note: the git-checkout `.claude/worktrees` path (plugins/infra/plugins/worktree) is a different concept and intentionally out of scope.",
    };
  },
};

export default [noHardcodedPathsCheck, noInlinedWorktreeArtifactsCheck];
