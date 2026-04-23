import type {
  ConversationRuntime,
  RuntimeInfo,
} from "@plugins/conversations/server";
import type { ConversationModel } from "@plugins/conversations/server";
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
    /^claude-\d+(-[a-z0-9]+)?$/.test(title);

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

  async create(
    conversationId: string,
    worktreePath: string,
    opts?: {
      prompt?: string;
      model?: ConversationModel;
      spawnedBy?: string | null;
      resumeSessionId?: string;
    },
  ): Promise<void> {
    // SINGULARITY_CONVERSATION_ID is read by the .githooks/prepare-commit-msg
    // hook so any `git commit` made inside the pane gets stamped with a
    // Singularity-Conversation trailer. SINGULARITY_PARENT_HOST is the
    // worktree slug Claude's .mcp.json dials back to over HTTP. The ids are
    // generated slugs (no shell metacharacters) but we still keep them
    // wrapped in single quotes.
    const hasPrompt = typeof opts?.prompt === "string" && opts.prompt.length > 0;
    const envArgs = hasPrompt
      ? ["-e", `SINGULARITY_PROMPT=${opts!.prompt}`]
      : [];
    const parentHost = opts?.spawnedBy;
    if (!parentHost) {
      throw new Error("tmux runtime requires spawnedBy to route MCP back to the parent server");
    }
    const claudeBase = opts?.model ? `${CLAUDE} --model ${opts.model}` : CLAUDE;
    const claudeCmd = opts?.resumeSessionId
      ? `${claudeBase} --resume ${opts.resumeSessionId}`
      : hasPrompt
        ? `${claudeBase} "$SINGULARITY_PROMPT"`
        : claudeBase;
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
        ...envArgs,
        `zsh -l -c 'export SINGULARITY_CONVERSATION_ID=${conversationId}; export SINGULARITY_PARENT_HOST=${parentHost}; ${claudeCmd}'`,
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

  async send(conversationId: string, text: string): Promise<void> {
    // Exit copy mode if the pane is in it (e.g. user scrolled up before
    // clicking Push & Exit). copy-mode -q is a no-op when already in normal
    // mode. Without this, send-keys goes to copy mode's vi key bindings
    // instead of the running process — 'f' triggers "Jump to char", consuming
    // the rest of the prompt without it ever reaching Claude.
    await Bun.spawn([TMUX, "copy-mode", "-q", "-t", conversationId], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
    await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "-l", text], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
    await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "Enter"], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
  },
};
