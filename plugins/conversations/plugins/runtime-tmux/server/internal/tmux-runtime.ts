import type {
  ConversationRuntime,
  RuntimeInfo,
} from "@plugins/conversations/server";
import { resolveCliFlag } from "@plugins/conversations/plugins/model-provider/server";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import { CLAUDE, TMUX } from "@plugins/infra/plugins/paths/server";
import { recordCrash } from "@plugins/crashes/server";
import { resolveSessionState, type SessionState } from "./claude-session";
// Sessions we manage: new ones use `conv-…`; `claude-…` is the pre-rename
// legacy prefix kept so zombie sessions still get picked up by the poller.
const SESSION_NAME_RE = /^(conv|claude)-\d+(-[a-z0-9]+)?$/;

const SPINNER_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠂⠄⠠⠈]\s*/;
const READY_RE = /^✳\s*/;
const STATUS_PREFIX_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠂⠄⠠⠈✳]\s*/;

// AskUserQuestion menus must be detected regardless of how the pane otherwise
// reads, because the CLI signature changed across versions:
//   - Old CLI: the menu kept the spinner + session status:"busy", so the pane
//     looked `working` while actually waiting. (still handled below)
//   - CLI v2.1.159: the menu presents as an IDLE pane — `✳` ready title prefix,
//     session file status:"waiting" / waitingFor:"permission prompt". Nothing
//     in the title or session file distinguishes it from an ordinary idle/
//     permission state, so the only reliable signal is the menu's
//     "Enter to select" footer in the pane content.
// We therefore probe EVERY non-dead pane (not just working ones) and, on a
// match, override the verdict to {working:false, waitingFor:"question"} — the
// signal the AskUserQuestion web form gates on. Throttled to one capture-pane
// per pane every PROBE_INTERVAL_MS to keep the cost bounded.
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

// answerPrompt() form-dismissal poll. After Escape the TUI takes ~210ms to
// re-render from the prompt menu back to the idle input. Sending into a live
// menu makes it auto-select a wrong option and fabricate an answer, so we
// poll the pane with a FRESH capture each iteration (never the throttled
// isProbeWaiting cache) until "Enter to select" is gone. ~75ms cadence clears
// in 2-5 iterations; 3000ms cap then throw — never send into a live form.
const FORM_CLEAR_POLL_INTERVAL_MS = 75;
const FORM_CLEAR_TIMEOUT_MS = 3_000;

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

/**
 * Paste `text` into the pane's idle input and submit it with Enter, in one
 * atomic tmux invocation.
 *
 * `paste-buffer -p` wraps the content in bracketed-paste markers
 * (\e[200~/\e[201~). Chaining paste-buffer and send-keys Enter with ";" makes
 * tmux process them in a single event-loop iteration — back-to-back with no
 * inter-process gap — so Enter cannot arrive before the CLI exits paste mode
 * and be swallowed as a literal newline.
 *
 * Shared verbatim by send() and answerPrompt() so both submit identically.
 * The pane must already be at the idle input prompt (callers clear copy mode
 * and partial input first).
 */
async function pasteTurn(conversationId: string, text: string): Promise<void> {
  const bufferName = `singularity-send-${conversationId}`;
  const load = Bun.spawn([TMUX, "load-buffer", "-b", bufferName, "-"], {
    stdin: Buffer.from(text),
    stdout: "pipe",
    stderr: "pipe",
  });
  const loadExit = await load.exited;
  if (loadExit !== 0) {
    const stderr = await new Response(load.stderr).text();
    throw new Error(
      `tmux load-buffer for ${conversationId} failed (exit ${loadExit}): ${stderr.trim() || "<no stderr>"}`,
    );
  }
  const pasteAndEnter = Bun.spawn(
    [
      TMUX,
      "paste-buffer", "-d", "-p", "-b", bufferName, "-t", conversationId,
      ";",
      "send-keys", "-t", conversationId, "Enter",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await pasteAndEnter.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(pasteAndEnter.stderr).text();
    throw new Error(
      `tmux paste+enter for ${conversationId} failed (exit ${exitCode}): ${stderr.trim() || "<no stderr>"}`,
    );
  }
}

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

    // Probe every non-dead pane for the AskUserQuestion menu's "Enter to
    // select" footer. The menu can present as either working (old CLI spinner
    // bug) or idle (CLI v2.1.159, see PROBE_INTERVAL_MS comment), so we cannot
    // pre-filter on `working` — that workaround skipped idle menus and left the
    // interactive answer form dormant. A match overrides whatever the title /
    // session file said (including waitingFor:"permission prompt") to
    // {working:false, waitingFor:"question"}. Each capture-pane stays throttled
    // per pane via isProbeWaiting's PROBE_INTERVAL_MS cache.
    const probeIds = ids.filter((id) => !out.get(id)!.dead);
    if (probeIds.length > 0) {
      const probeResults = await Promise.all(probeIds.map((id) => isProbeWaiting(id)));
      probeIds.forEach((id, i) => {
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
    const cliFlag = opts?.model ? resolveCliFlag(opts.model) : undefined;
    const claudeBase = cliFlag ? `${CLAUDE} --model ${cliFlag}` : CLAUDE;
    const cmdParts: string[] = [claudeBase];
    if (opts?.resumeSessionId) {
      cmdParts.push(`--resume ${opts.resumeSessionId}`);
      if (opts.forkSession) cmdParts.push("--fork-session");
    }

    // tmux has a ~16KB per-arg cap. For long prompts, write to a temp file and
    // have the shell script cat+delete it. Short prompts use positional $1.
    const PROMPT_ARG_LIMIT = 12_000;
    const useTempFile = hasPrompt && opts!.prompt!.length > PROMPT_ARG_LIMIT;
    let promptFile: string | undefined;
    if (useTempFile) {
      promptFile = `/tmp/singularity-prompt-${conversationId}.txt`;
      await Bun.write(promptFile, opts!.prompt!);
    }

    if (hasPrompt) {
      if (useTempFile) {
        cmdParts.push(`-- "$(cat '${promptFile}' && rm -f '${promptFile}')"`);
      } else {
        cmdParts.push(`-- "$1"`);
      }
    }
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
        "-e", `SINGULARITY_CONVERSATION_ID=${conversationId}`,
        "-e", `SINGULARITY_PARENT_HOST=${parentHost}`,
        "zsh", "-l", "-c", claudeCmd,
        "zsh",
        ...(hasPrompt && !useTempFile ? [opts!.prompt!] : []),
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
    // Bracketed paste + Enter in one atomic tmux invocation (see pasteTurn).
    await pasteTurn(conversationId, text);
  },

  async answerPrompt(conversationId: string, text: string): Promise<void> {
    // Dismiss the active prompt form, wait until it has actually cleared, then
    // send `text` as a turn. The wait is the whole point: Escape does not clear
    // the form instantly (the TUI re-renders to the idle input in ~210ms), and
    // pasting into a still-live menu makes it auto-select a wrong option and
    // fabricate an answer — losing the user's text. See ConversationRuntime
    // interface docs.

    // 1. Dismiss the form with Escape (same as interrupt()): exit copy mode
    //    first so the key reaches Claude rather than tmux's vi bindings.
    await Bun.spawn([TMUX, "copy-mode", "-q", "-t", conversationId], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
    await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "Escape"], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;

    // 2. Bounded poll until the form has cleared. FRESH capture each iteration
    //    via probeWaiting() — NOT the throttled isProbeWaiting cache, whose 5s
    //    window would not reflect the form clearing within this 3s budget.
    const deadline = Date.now() + FORM_CLEAR_TIMEOUT_MS;
    let cleared = false;
    for (;;) {
      if (!(await probeWaiting(conversationId))) {
        cleared = true;
        break;
      }
      if (Date.now() + FORM_CLEAR_POLL_INTERVAL_MS >= deadline) break;
      await Bun.sleep(FORM_CLEAR_POLL_INTERVAL_MS);
    }
    if (!cleared) {
      // Never send into a live form — that fabricates a wrong answer.
      throw new Error(
        `tmux answerPrompt for ${conversationId}: prompt form did not clear ` +
          `within ${FORM_CLEAR_TIMEOUT_MS}ms after Escape; refusing to send`,
      );
    }

    // 3. Clear any partial input, then paste + Enter (same as send()).
    await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "C-c"], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
    await pasteTurn(conversationId, text);
  },
};
