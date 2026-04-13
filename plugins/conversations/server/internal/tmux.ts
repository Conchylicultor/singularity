import { db } from "../../../../server/src/db/client";
import { conversations } from "../schema";
import type { Conversation, ConversationStatus } from "../../shared/types";
import { forkDatabase } from "./db-fork";

const TMUX = "/opt/homebrew/bin/tmux";
const GIT = "/usr/bin/git";
const CLAUDE = "/Users/admin/.local/bin/claude";
const PREFIX = "claude";

interface TmuxInfo {
  task: string;
  idle: boolean;
  attached: boolean;
  cwd: string;
}

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

async function listTmuxSessions(): Promise<Map<string, TmuxInfo>> {
  const proc = Bun.spawn(
    [
      TMUX,
      "list-sessions",
      "-F",
      "#{session_name}|#{pane_title}|#{session_attached}|#{session_path}",
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
    const [name, rawTitle, attached, sessionPath] = line.split("|");
    const { task, idle } = cleanPaneTitle(rawTitle ?? "");
    map.set(name, {
      task,
      idle,
      attached: attached === "1",
      cwd: sessionPath ?? "",
    });
  }
  return map;
}

export async function listConversations(): Promise<Conversation[]> {
  const [rows, live] = await Promise.all([
    db.select().from(conversations),
    listTmuxSessions(),
  ]);

  const repoRoot = await getRepoRoot();

  return rows
    .map((row): Conversation => {
      const tmux = live.get(row.id);
      return {
        name: row.id,
        createdAt: row.createdAt.toISOString(),
        task: tmux?.task ?? "",
        idle: tmux?.idle ?? true,
        attached: tmux?.attached ?? false,
        cwd: tmux?.cwd ?? `${repoRoot}/.claude/worktrees/${row.id}`,
        title: row.title,
        status: row.status as ConversationStatus,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createConversation(): Promise<Conversation> {
  const repoRoot = await getRepoRoot();
  const worktreeDir = `${repoRoot}/.claude/worktrees`;
  const name = `${PREFIX}-${Math.floor(Date.now() / 1000)}`;
  const branch = `claude-web/${name}`;
  const wtPath = `${worktreeDir}/${name}`;

  await Bun.spawn([GIT, "-C", repoRoot, "worktree", "add", "-b", branch, wtPath, "main"], {
    stdout: "pipe",
    stderr: "pipe",
  }).exited;

  await forkDatabase(name);

  await Bun.spawn(
    [TMUX, "-u", "new-session", "-d", "-s", name, "-c", wtPath, `zsh -l -c '${CLAUDE}'`],
    { stdout: "pipe", stderr: "pipe" },
  ).exited;

  const [row] = await db
    .insert(conversations)
    .values({ id: name, worktree: name })
    .returning();

  return {
    name: row.id,
    createdAt: row.createdAt.toISOString(),
    task: "",
    idle: true,
    attached: false,
    cwd: wtPath,
    title: row.title,
    status: row.status as ConversationStatus,
  };
}

export async function deleteConversation(name: string): Promise<void> {
  await Bun.spawn([TMUX, "kill-session", "-t", name], {
    stdout: "pipe",
    stderr: "pipe",
  }).exited;
}
