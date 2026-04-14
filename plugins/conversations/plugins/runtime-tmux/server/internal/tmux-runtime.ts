import type {
  ConversationRuntime,
  RuntimeInfo,
} from "@plugins/conversations/server/api";
import { resolveClaudeSessionId } from "./claude-session";

const TMUX = "/opt/homebrew/bin/tmux";
const CLAUDE = "/Users/admin/.local/bin/claude";
const PREFIX = "claude";

const SPINNER_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠂⠄⠠⠈]\s*/;
const READY_RE = /^✳\s*/;

function cleanPaneTitle(raw: string): { title: string; working: boolean } {
  const trimmed = raw.replace(/^_ /, "").trim();

  // Prefix convention from Claude Code's tmux title:
  //   spinner glyph (⠋⠙…) → actively processing
  //   ✳                   → finished, waiting for user input
  //   anything else       → default pane state
  const working = SPINNER_RE.test(trimmed);
  const title = trimmed.replace(SPINNER_RE, "").replace(READY_RE, "").trim();

  const isDefault =
    !title ||
    /^[a-zA-Z0-9-]+\.(local|internal|lan)$/.test(title) ||
    /^claude-\d+$/.test(title);

  return {
    title: isDefault ? "" : title,
    working,
  };
}

async function listPanes(): Promise<
  Map<string, { rawTitle: string; panePid: number; dead: boolean }>
> {
  const proc = Bun.spawn(
    [
      TMUX,
      "list-panes",
      "-a",
      "-F",
      "#{session_name}|#{pane_pid}|#{pane_dead}|#{pane_title}",
      "-f",
      `#{m:${PREFIX}-*,#{session_name}}`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  const exit = await proc.exited;
  const map = new Map<
    string,
    { rawTitle: string; panePid: number; dead: boolean }
  >();
  if (exit !== 0) return map;
  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    const [name, pidStr, deadStr, ...rest] = line.split("|");
    if (!name || !pidStr) continue;
    if (map.has(name)) continue;
    const pid = Number(pidStr);
    if (!Number.isFinite(pid)) continue;
    map.set(name, {
      panePid: pid,
      dead: deadStr === "1",
      rawTitle: rest.join("|"),
    });
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
      const { rawTitle, dead } = panes.get(id)!;
      const { title, working } = cleanPaneTitle(rawTitle ?? "");
      out.set(id, {
        title,
        working: working && !dead,
        dead,
        claudeSessionId: sessionIds[i] ?? null,
      });
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
