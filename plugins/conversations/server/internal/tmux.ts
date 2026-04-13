import { db } from "../../../../server/src/db/client";
import { conversations } from "../schema";
import { forkDatabase } from "./db-fork";

const TMUX = "/opt/homebrew/bin/tmux";
const GIT = "/usr/bin/git";
const CLAUDE = "/Users/admin/.local/bin/claude";
const PREFIX = "claude";

export interface TmuxInfo {
  task: string;
  idle: boolean;
}

// The main worktree root (parent of all `.claude/worktrees/*`), not the
// current worktree — `git rev-parse --show-toplevel` would return the latter
// when the server runs inside a worktree.
let cachedRepoRoot: string | null = null;
export async function getMainWorktreeRoot(): Promise<string> {
  if (cachedRepoRoot) return cachedRepoRoot;
  const proc = Bun.spawn([GIT, "worktree", "list", "--porcelain"], {
    stdout: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  const firstLine = text.split("\n").find((l) => l.startsWith("worktree "));
  if (!firstLine) throw new Error("Could not determine main worktree root");
  cachedRepoRoot = firstLine.slice("worktree ".length).trim();
  return cachedRepoRoot;
}

export async function worktreePathFor(id: string): Promise<string> {
  const root = await getMainWorktreeRoot();
  return `${root}/.claude/worktrees/${id}`;
}

export function cleanPaneTitle(raw: string): { task: string; idle: boolean } {
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

export async function listTmuxSessions(): Promise<Map<string, TmuxInfo>> {
  const proc = Bun.spawn(
    [
      TMUX,
      "list-sessions",
      "-F",
      "#{session_name}|#{pane_title}",
      "-f",
      `#{m:${PREFIX}-*,#{session_name}}`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  const map = new Map<string, TmuxInfo>();
  if (exitCode !== 0) return map;

  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    const [name, rawTitle] = line.split("|");
    if (!name) continue;
    map.set(name, cleanPaneTitle(rawTitle ?? ""));
  }
  return map;
}

export async function createConversation() {
  const repoRoot = await getMainWorktreeRoot();
  const id = `${PREFIX}-${Math.floor(Date.now() / 1000)}`;
  const branch = `claude-web/${id}`;
  const wtPath = await worktreePathFor(id);

  await Bun.spawn([GIT, "-C", repoRoot, "worktree", "add", "-b", branch, wtPath, "main"], {
    stdout: "pipe",
    stderr: "pipe",
  }).exited;

  await forkDatabase(id);

  // Insert the DB row BEFORE spawning tmux so the poller never observes a
  // tmux session without a matching DB row (which would trigger orphan adoption).
  const [row] = await db
    .insert(conversations)
    .values({ id, worktreePath: wtPath })
    .returning();

  await Bun.spawn(
    [TMUX, "-u", "new-session", "-d", "-s", id, "-c", wtPath, `zsh -l -c '${CLAUDE}'`],
    { stdout: "pipe", stderr: "pipe" },
  ).exited;

  return row!;
}

export async function deleteConversation(name: string): Promise<void> {
  await Bun.spawn([TMUX, "kill-session", "-t", name], {
    stdout: "pipe",
    stderr: "pipe",
  }).exited;
}
