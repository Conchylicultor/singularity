type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

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
  // Database plugin owns its own embedded-PG path constants and config
  // reader. Lives in shared/ so server, central, and CLI can all import
  // from a sanctioned location.
  "plugins/database/plugins/embedded/shared/internal/paths.ts",
  "plugins/database/core/internal/config.ts",
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
      const proc = Bun.spawn(
        ["git", "grep", "-nF", "--", pattern, "*.ts", "*.tsx"],
        { cwd: root, stdout: "pipe", stderr: "pipe" },
      );
      const out = (await new Response(proc.stdout).text()).trim();
      if (!out) continue;

      for (const line of out.split("\n")) {
        if (seen.has(line)) continue;
        seen.add(line);

        const path = line.split(":", 1)[0];
        if (ALLOWED_PATHS.includes(path)) continue;
        if (path.startsWith("research/")) continue;

        // Skip single-line comments and JSDoc lines.
        const content = line.split(":").slice(2).join(":").trimStart();
        if (content.startsWith("//")) continue;
        if (content.startsWith("*")) continue;
        if (content.startsWith("#!")) continue;

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
