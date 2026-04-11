import type { ClaudeSession } from "../../shared/types";

const TMUX = "/opt/homebrew/bin/tmux";
const GIT = "/usr/bin/git";
const CLAUDE = "/Users/admin/.local/bin/claude";
const PREFIX = "claude";

async function getRepoRoot(): Promise<string> {
  const proc = Bun.spawn([GIT, "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.trim();
}

function cleanPaneTitle(raw: string): { task: string; idle: boolean } {
  // Strip Claude Code status prefixes (spinner chars, "_ " prefix)
  const cleaned = raw
    .replace(/^_ /, "")
    .replace(/^[✳⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠂⠄⠠⠈]\s*/, "")
    .trim();

  // Detect idle sessions: hostname, empty, or matches session name pattern
  const isIdle =
    !cleaned ||
    /^[a-zA-Z0-9-]+\.(local|internal|lan)$/.test(cleaned) ||
    /^claude-\d+$/.test(cleaned);

  return { task: isIdle ? "" : cleaned, idle: isIdle };
}

export async function listClaudeSessions(): Promise<ClaudeSession[]> {
  const proc = Bun.spawn(
    [
      TMUX,
      "list-sessions",
      "-F",
      "#{session_name}|#{session_created}|#{pane_title}|#{session_attached}",
      "-f",
      `#{m:${PREFIX}-*,#{session_name}}`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) return [];

  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, createdEpoch, rawTitle, attached] = line.split("|");
      const { task, idle } = cleanPaneTitle(rawTitle ?? "");
      return {
        name,
        createdAt: new Date(parseInt(createdEpoch, 10) * 1000).toISOString(),
        task,
        idle,
        attached: attached === "1",
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createClaudeSession(): Promise<ClaudeSession> {
  const repoRoot = await getRepoRoot();
  const worktreeDir = `${repoRoot}/.claude/worktrees`;
  const name = `${PREFIX}-${Math.floor(Date.now() / 1000)}`;
  const branch = `claude-web/${name}`;
  const wtPath = `${worktreeDir}/${name}`;

  await Bun.spawn([GIT, "-C", repoRoot, "worktree", "add", "-b", branch, wtPath, "main"], {
    stdout: "pipe",
    stderr: "pipe",
  }).exited;

  await Bun.spawn(
    [TMUX, "-u", "new-session", "-d", "-s", name, "-c", wtPath, `zsh -l -c '${CLAUDE}'`],
    { stdout: "pipe", stderr: "pipe" },
  ).exited;

  return {
    name,
    createdAt: new Date().toISOString(),
    task: "",
    idle: true,
    attached: false,
  };
}

export async function deleteClaudeSession(name: string): Promise<void> {
  await Bun.spawn([TMUX, "kill-session", "-t", name], {
    stdout: "pipe",
    stderr: "pipe",
  }).exited;
}
