import type {
  ConversationRuntime,
  RuntimeInfo,
} from "@plugins/conversations/server";
import { MODEL_REGISTRY, type ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import { CLAUDE, TMUX } from "@plugins/infra/plugins/paths/server";
import { recordCrash } from "@plugins/crashes/server";
import { resolveSessionState, type SessionState } from "./claude-session";
// Sessions we manage: new ones use `conv-…`; `claude-…` is the pre-rename
// legacy prefix kept so zombie sessions still get picked up by the poller.
const SESSION_NAME_RE = /^(conv|claude)-\d+(-[a-z0-9]+)?$/;

const SPINNER_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠂⠄⠠⠈]\s*/;
const READY_RE = /^✳\s*/;
const STATUS_PREFIX_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠂⠄⠠⠈✳]\s*/;

// CLI bug workaround: AskUserQuestion keeps spinner + status:"busy" despite
// being idle. Probe pane content every PROBE_INTERVAL_MS to detect it.
const PROBE_INTERVAL_MS = 5_000;
const WAITING_PATTERN_RE = /Enter to select/;
const probeCache = new Map<string, { at: number; waiting: boolean }>();

async function probeWaiting(id: string): Promise<boolean> {
  const proc = Bun.spawn(
    [TMUX, "capture-pane", "-p", "-S", "-10", "-t", id],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return WAITING_PATTERN_RE.test(stdout);
}

async function isProbeWaiting(id: string): Promise<boolean> {
  const now = Date.now();
  const cached = probeCache.get(id);
  if (cached && now - cached.at < PROBE_INTERVAL_MS) return cached.waiting;
  const waiting = await probeWaiting(id);
  probeCache.set(id, { at: now, waiting });
  return waiting;
}

interface ResolvedPaneStatus {
  title: string;
  working: boolean;
  waitingFor: string | null;
}

/**
 * Merge the two status sources for a tmux pane into a single verdict.
 *
 * 1. Tmux pane title prefix (real-time):
 *    - Spinner glyph → working
 *    - ✳ ready mark  → not working
 *    - Neither       → no signal (startup race, bare hostname, etc.)
 *
 * 2. Pid JSON session file (~/.claude/sessions/<pid>.json):
 *    - status: "busy" | "idle" | "waiting" (can lag behind the TUI)
 *    - waitingFor: human-readable reason (only meaningful when not busy)
 *
 * The pane title is the freshest signal for busy/idle because it updates
 * on every TUI render frame. The session file provides `waitingFor`
 * context (permission prompt, user input, etc.) that the title lacks,
 * and acts as a fallback when the title carries no prefix.
 */
function resolvePaneStatus(
  rawTitle: string,
  session: SessionState,
): ResolvedPaneStatus {
  const trimmed = rawTitle.replace(/^_ /, "").trim();

  // Extract display title (strip status prefix).
  const titleText = trimmed.replace(STATUS_PREFIX_RE, "").trim();
  const isDefault =
    !titleText ||
    /^[a-zA-Z0-9-]+\.(local|internal|lan)$/.test(titleText) ||
    SESSION_NAME_RE.test(titleText);
  const title = isDefault ? "" : titleText;

  // Resolve working status.
  let working: boolean;
  if (SPINNER_RE.test(trimmed)) {
    working = true;
  } else if (READY_RE.test(trimmed)) {
    working = false;
  } else {
    // No title signal — fall back to session file.
    // null = file not written yet (startup race) → treat as working.
    working = session.status == null || session.status === "busy";
  }

  const waitingFor = working ? null : (session.waitingFor ?? null);
  return { title, working, waitingFor };
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
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
    const NULL_SESSION: SessionState = { sessionId: null, status: null, waitingFor: null };
    const states = await Promise.all(
      ids.map(async (id) => {
        try {
          return await resolveSessionState(panes.get(id)!.panePid);
        } catch (err) {
          void recordCrash({
            source: "server-caught",
            errorType: "SessionStateError",
            message: `resolveSessionState failed for pane "${id}": ${err instanceof Error ? err.message : String(err)}`,
            label: "tmux-runtime.resolveSessionState",
          });
          return NULL_SESSION;
        }
      }),
    );
    const out = new Map<string, RuntimeInfo>();
    ids.forEach((id, i) => {
      const { rawTitle, dead, worktreePath } = panes.get(id)!;
      const state = states[i]!;
      const resolved = resolvePaneStatus(rawTitle, state);
      out.set(id, {
        title: resolved.title,
        working: resolved.working && !dead,
        dead,
        claudeSessionId: state.sessionId ?? null,
        worktreePath,
        waitingFor: dead ? null : resolved.waitingFor,
      });
    });

    // Probe panes that look "working" — the CLI sometimes keeps the spinner
    // during AskUserQuestion prompts. Throttled to one capture-pane per pane
    // every PROBE_INTERVAL_MS.
    const workingIds = ids.filter((id) => out.get(id)!.working && !out.get(id)!.dead);
    if (workingIds.length > 0) {
      const probeResults = await Promise.all(workingIds.map((id) => isProbeWaiting(id)));
      workingIds.forEach((id, i) => {
        if (probeResults[i]) {
          const info = out.get(id)!;
          out.set(id, { ...info, working: false, waitingFor: "question" });
        }
      });
    }

    // Evict stale probe cache entries.
    for (const key of probeCache.keys()) {
      if (!panes.has(key)) probeCache.delete(key);
    }

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
    const hasPrompt = typeof opts?.prompt === "string" && opts.prompt.length > 0;
    const parentHost = Bun.env.SINGULARITY_WORKTREE;
    if (!parentHost) {
      throw new Error("tmux runtime requires SINGULARITY_WORKTREE to route MCP back to the parent server");
    }
    const cliFlag = opts?.model ? MODEL_REGISTRY[opts.model].cliFlag : undefined;
    const claudeBase = cliFlag ? `${CLAUDE} --model ${cliFlag}` : CLAUDE;
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
    // "$1" is the prompt positional arg passed as a separate argv element below,
    // which avoids embedding prompt content in the shell script string.
    if (hasPrompt) cmdParts.push(`-- "$1"`);
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
        // Set env vars via tmux -e so the shell inherits them without explicit
        // export. SINGULARITY_CONVERSATION_ID: git commit hook. SINGULARITY_PARENT_HOST: MCP routing.
        "-e", `SINGULARITY_CONVERSATION_ID=${conversationId}`,
        "-e", `SINGULARITY_PARENT_HOST=${parentHost}`,
        // Split "zsh -l -c <script>" into separate argv elements rather than a
        // single-quoted blob. tmux 3.6a passes trailing non-option args directly
        // to exec, so zsh receives them as its own argv: -l -c <script> <$0> [<$1>].
        // A "zsh -l -c '...'" single string can trigger tmux's command parser
        // ("unknown command: zsh …") in edge cases — separate args avoid it.
        "zsh", "-l", "-c", claudeCmd,
        // $0 (script name) then, when present, $1 (prompt for claude --).
        // Passing the prompt as a positional OS arg avoids embedding it in the
        // shell script and eliminates the SINGULARITY_PROMPT env var indirection.
        // tmux's per-arg cap (~16KB on 3.6a) still applies; oversized prompts
        // surface here rather than silently dying inside the pane.
        "zsh",
        ...(hasPrompt ? [opts!.prompt!] : []),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stderr, exit] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exit !== 0) {
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
    // Clear any partial input the user may have typed before we paste.
    // C-c is the standard "abort current line" signal; at the Claude CLI's
    // input prompt it discards the entire multi-line draft without affecting
    // the running session. send() is only called when the conversation is
    // not working (caller guards on !working), so C-c reaches the idle input
    // handler rather than interrupting a streaming response.
    await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "C-c"], {
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
    void load.stdin.write(text);
    await load.stdin.end();
    const loadExit = await load.exited;
    if (loadExit !== 0) {
      const stderr = await new Response(load.stderr).text();
      throw new Error(
        `tmux load-buffer for ${conversationId} failed (exit ${loadExit}): ${stderr.trim() || "<no stderr>"}`,
      );
    }
    const pasteProc = Bun.spawn(
      [TMUX, "paste-buffer", "-d", "-p", "-b", bufferName, "-t", conversationId],
      { stdout: "pipe", stderr: "pipe" },
    );
    const pasteExit = await pasteProc.exited;
    if (pasteExit !== 0) {
      const stderr = await new Response(pasteProc.stderr).text();
      throw new Error(
        `tmux paste-buffer for ${conversationId} failed (exit ${pasteExit}): ${stderr.trim() || "<no stderr>"}`,
      );
    }
    // Give Claude's input parser time to process the paste-end marker
    // (\e[201~) and exit bracketed-paste mode before Enter arrives.
    // Without this, Enter sometimes lands while the parser is still in
    // paste mode and gets swallowed as a literal newline.
    await Bun.sleep(50);
    await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "Enter"], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
  },
};
