import { existsSync } from "node:fs";
import { homedir } from "node:os";

function resolveBin(name: string, extraCandidates: string[]): string {
  const fromPath = Bun.which(name);
  if (fromPath) return fromPath;
  for (const p of extraCandidates) {
    if (existsSync(p)) return p;
  }
  return name;
}

export const GIT   = Bun.which("git")   ?? "git";
export const PGREP = Bun.which("pgrep") ?? "pgrep";
export const PS    = Bun.which("ps")    ?? "ps";

export const CLAUDE =
  process.env.SINGULARITY_CLAUDE_BIN ??
  resolveBin("claude", [
    `${homedir()}/.local/bin/claude`,
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ]);

export const TMUX = resolveBin("tmux", [
  `${homedir()}/.local/share/mise/shims/tmux`,
  "/opt/homebrew/bin/tmux",
  "/usr/local/bin/tmux",
  "/usr/bin/tmux",
]);
