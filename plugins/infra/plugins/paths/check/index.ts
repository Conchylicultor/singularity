import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
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

const check: Check = {
  id: "paths:no-hardcoded-paths",
  description:
    "Filesystem paths must come from @plugins/infra/plugins/paths/{core,server}; no homedir() calls or hardcoded path strings in TS",
  async run() {
    const root = await getRoot();
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

export default check;
