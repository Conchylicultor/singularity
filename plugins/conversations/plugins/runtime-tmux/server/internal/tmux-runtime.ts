import type {
  ConversationRuntime,
  RuntimeInfo,
} from "@plugins/conversations/server/api";
import { resolveClaudeSessionId } from "./claude-session";

const TMUX = "/opt/homebrew/bin/tmux";
const CLAUDE = "/Users/admin/.local/bin/claude";
const PREFIX = "claude";

function cleanPaneTitle(raw: string): { title: string; idle: boolean } {
  const cleaned = raw
    .replace(/^_ /, "")
    .replace(/^[✳⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠂⠄⠠⠈]\s*/, "")
    .trim();

  const isIdle =
    !cleaned ||
    /^[a-zA-Z0-9-]+\.(local|internal|lan)$/.test(cleaned) ||
    /^claude-\d+$/.test(cleaned);

  return { title: isIdle ? "" : cleaned, idle: isIdle };
}

async function listPanes(): Promise<
  Map<string, { rawTitle: string; panePid: number }>
> {
  const proc = Bun.spawn(
    [
      TMUX,
      "list-panes",
      "-a",
      "-F",
      "#{session_name}|#{pane_pid}|#{pane_title}",
      "-f",
      `#{m:${PREFIX}-*,#{session_name}}`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  const exit = await proc.exited;
  const map = new Map<string, { rawTitle: string; panePid: number }>();
  if (exit !== 0) return map;
  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    const [name, pidStr, ...rest] = line.split("|");
    if (!name || !pidStr) continue;
    // Only first pane per session; duplicates (multi-pane sessions) collapse.
    if (map.has(name)) continue;
    const pid = Number(pidStr);
    if (!Number.isFinite(pid)) continue;
    map.set(name, { panePid: pid, rawTitle: rest.join("|") });
  }
  return map;
}

export const tmuxRuntime: ConversationRuntime = {
  id: "tmux",

  async list(): Promise<Map<string, RuntimeInfo>> {
    const panes = await listPanes();
    const ids = Array.from(panes.keys());
    const sessionIds = await Promise.all(
      ids.map((id) => resolveClaudeSessionId(panes.get(id)!.panePid)),
    );
    const out = new Map<string, RuntimeInfo>();
    ids.forEach((id, i) => {
      const { rawTitle } = panes.get(id)!;
      const { title, idle } = cleanPaneTitle(rawTitle ?? "");
      out.set(id, { title, idle, claudeSessionId: sessionIds[i] ?? null });
    });
    return out;
  },

  async create(conversationId: string, worktreePath: string): Promise<void> {
    await Bun.spawn(
      [
        TMUX,
        "-u",
        "new-session",
        "-d",
        "-s",
        conversationId,
        "-c",
        worktreePath,
        `zsh -l -c '${CLAUDE}'`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    ).exited;
  },

  async delete(conversationId: string): Promise<void> {
    await Bun.spawn([TMUX, "kill-session", "-t", conversationId], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
  },
};
