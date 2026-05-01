import type {
  ConversationRuntime,
  RuntimeInfo,
} from "@plugins/conversations/server";
import type { ConversationModel } from "@plugins/conversations/server";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolveClaudeSessionId } from "./claude-session";

function resolveBin(name: string, extraCandidates: string[]): string {
  const fromPath = Bun.which(name);
  if (fromPath) return fromPath;
  for (const p of extraCandidates) {
    if (existsSync(p)) return p;
  }
  return name;
}

const home = homedir();
const TMUX = resolveBin("tmux", [
  `${home}/.local/share/mise/shims/tmux`,
  "/opt/homebrew/bin/tmux",
  "/usr/local/bin/tmux",
  "/usr/bin/tmux",
]);
const CLAUDE = resolveBin("claude", [
  `${home}/.local/bin/claude`,
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
]);
// Sessions we manage: new ones use `conv-…`; `claude-…` is the pre-rename
// legacy prefix kept so zombie sessions still get picked up by the poller.
const SESSION_NAME_RE = /^(conv|claude)-\d+(-[a-z0-9]+)?$/;

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
    SESSION_NAME_RE.test(title);

  return {
    title: isDefault ? "" : title,
    working,
  };
}

// Field separator: tab (not present in pane paths or titles) keeps splits
// unambiguous even though pane titles can contain arbitrary characters.
const SEP = "\t";

async function listPanes(): Promise<
  Map<
    string,
    { rawTitle: string; panePid: number; dead: boolean; worktreePath: string }
  >
> {
  const proc = Bun.spawn(
    [
      TMUX,
      "list-panes",
      "-a",
      "-F",
      `#{session_name}${SEP}#{pane_pid}${SEP}#{pane_dead}${SEP}#{pane_start_path}${SEP}#{pane_title}`,
      "-f",
      `#{r:^(conv|claude)-,#{session_name}}`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exit = await proc.exited;
  const map = new Map<
    string,
    { rawTitle: string; panePid: number; dead: boolean; worktreePath: string }
  >();
  if (exit !== 0) {
    // "no server running" is a legitimate empty state — tmux had no sessions
    // so it could not start a server to query. Any other non-zero exit
    // (FD exhaustion, hung server, killed mid-call) means we cannot trust
    // emptiness as truth; throw so the poller treats this runtime's state
    // as unknown rather than declaring every conversation gone.
    if (/no server running/i.test(stderr)) return map;
    throw new Error(
      `tmux list-panes failed (exit ${exit}): ${stderr.trim() || "<no stderr>"}`,
    );
  }
  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    const [name, pidStr, deadStr, startPath, ...rest] = line.split(SEP);
    if (!name || !pidStr) continue;
    if (map.has(name)) continue;
    const pid = Number(pidStr);
    if (!Number.isFinite(pid)) continue;
    map.set(name, {
      panePid: pid,
      dead: deadStr === "1",
      worktreePath: startPath ?? "",
      rawTitle: rest.join(SEP),
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
      const { rawTitle, dead, worktreePath } = panes.get(id)!;
      const { title, working } = cleanPaneTitle(rawTitle ?? "");
      out.set(id, {
        title,
        working: working && !dead,
        dead,
        claudeSessionId: sessionIds[i] ?? null,
        worktreePath,
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
      resumeSessionId?: string;
      forkSession?: boolean;
    },
  ): Promise<void> {
    // SINGULARITY_CONVERSATION_ID is read by the .githooks/prepare-commit-msg
    // hook so any `git commit` made inside the pane gets stamped with a
    // Singularity-Conversation trailer. SINGULARITY_PARENT_HOST is the
    // worktree slug Claude's .mcp.json dials back to over HTTP — it must be a
    // host the gateway actually routes, so we read it straight from the
    // server's own worktree env rather than from a caller-supplied label.
    // The ids are generated slugs (no shell metacharacters) but we still
    // keep them wrapped in single quotes.
    const hasPrompt = typeof opts?.prompt === "string" && opts.prompt.length > 0;
    const envArgs = hasPrompt
      ? ["-e", `SINGULARITY_PROMPT=${opts!.prompt}`]
      : [];
    const parentHost = Bun.env.SINGULARITY_WORKTREE;
    if (!parentHost) {
      throw new Error("tmux runtime requires SINGULARITY_WORKTREE to route MCP back to the parent server");
    }
    const claudeBase = opts?.model ? `${CLAUDE} --model ${opts.model}` : CLAUDE;
    const cmdParts: string[] = [claudeBase];
    if (opts?.resumeSessionId) {
      cmdParts.push(`--resume ${opts.resumeSessionId}`);
      if (opts.forkSession) cmdParts.push("--fork-session");
    }
    // `--` end-of-options: prompts often start with `- ` (markdown bullets,
    // especially from improve-plugin-authored tasks). Without this, claude
    // parses the prompt as an unknown flag, prints "error: unknown option …",
    // and exits 1 — the tmux pane dies in <1s, runtime.create has already
    // returned success, so the row sits in "starting" until the 30s sweep.
    if (hasPrompt) cmdParts.push(`-- "$SINGULARITY_PROMPT"`);
    const claudeCmd = cmdParts.join(" ");
    const proc = Bun.spawn(
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
    );
    const [stderr, exit] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exit !== 0) {
      // tmux's per-arg cap (~16KB on 3.6a) bites here when callers stuff a
      // huge value into SINGULARITY_PROMPT — failure mode is a silent
      // "command too long" with no session created. Surface it loudly so
      // the conversation row never lands in a half-created state.
      throw new Error(
        `tmux new-session for ${conversationId} failed (exit ${exit}): ${stderr.trim() || "<no stderr>"}`,
      );
    }
  },

  async delete(conversationId: string): Promise<void> {
    await Bun.spawn([TMUX, "kill-session", "-t", conversationId], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
  },

  async interrupt(conversationId: string): Promise<void> {
    // Escape interrupts Claude Code's current operation (same as pressing
    // Esc in the TUI). Exit copy mode first so the key reaches Claude
    // rather than tmux's vi bindings (see send() for the same rationale).
    await Bun.spawn([TMUX, "copy-mode", "-q", "-t", conversationId], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
    await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "Escape"], {
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
    // Send the text via load-buffer + paste-buffer -p so tmux wraps it in
    // bracketed paste markers (\x1b[200~ … \x1b[201~). Without that, Claude
    // CLI falls back to a timing/burst heuristic to detect pastes — large
    // multi-line prompts get split into several "[Pasted text #N]" chips and
    // the trailing Enter we send below gets absorbed into the last paste,
    // leaving the prompt unsubmitted. -b uses a named buffer (not the
    // anonymous default the user cycles through with prefix+]) and -d
    // deletes it after paste. tmux buffers are isolated from the system
    // clipboard.
    const bufferName = `singularity-send-${conversationId}`;
    const load = Bun.spawn([TMUX, "load-buffer", "-b", bufferName, "-"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    load.stdin.write(text);
    await load.stdin.end();
    const loadExit = await load.exited;
    if (loadExit !== 0) {
      const stderr = await new Response(load.stderr).text();
      throw new Error(
        `tmux load-buffer for ${conversationId} failed (exit ${loadExit}): ${stderr.trim() || "<no stderr>"}`,
      );
    }
    await Bun.spawn(
      [TMUX, "paste-buffer", "-d", "-p", "-b", bufferName, "-t", conversationId],
      { stdout: "pipe", stderr: "pipe" },
    ).exited;
    await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "Enter"], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
  },
};
