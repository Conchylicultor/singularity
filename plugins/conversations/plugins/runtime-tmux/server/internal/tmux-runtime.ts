import type {
  ConversationRuntime,
  RuntimeInfo,
} from "@plugins/conversations/server";
import { resolveCliFlag } from "@plugins/conversations/plugins/model-provider/server";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import { CLAUDE, TMUX } from "@plugins/infra/plugins/paths/server";
import { isWorktreeOpActive } from "@plugins/infra/plugins/worktree/server";
import { recordCrash } from "@plugins/crashes/server";
import { basename } from "node:path";
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
// The AskUserQuestion menu's footer — its presence is the only reliable signal
// that the CLI is blocked on a question (the title/session file can read as a
// plain idle/permission state, see the PROBE_INTERVAL_MS comment above).
const QUESTION_FOOTER_RE = /Enter to select/;
// Claude's *rewind* menu (opened by Esc-Esc at the idle prompt). It does NOT
// share the question footer — verified against CLI v2.1.161 it renders
// "Enter to continue · Esc to cancel" plus a "Restore the code…" header. We
// detect it so escapeUntilPromptCleared() can treat it as a menu to dismiss
// rather than mistaking it for the idle prompt (which would strand the menu).
const REWIND_FOOTER_RE = /Enter to continue|Restore the code and\/or conversation/;
const probeCache = new Map<string, { at: number; waiting: boolean }>();

type PaneMenu = "question" | "rewind" | "idle";

// Single fresh capture-pane → which interactive menu (if any) is on screen.
// Both menu footers live in the bottom few lines, so a shallow capture suffices.
async function classifyPaneMenu(id: string): Promise<PaneMenu> {
  const proc = Bun.spawn(
    [TMUX, "capture-pane", "-p", "-S", "-15", "-t", id],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  if (QUESTION_FOOTER_RE.test(stdout)) return "question";
  if (REWIND_FOOTER_RE.test(stdout)) return "rewind";
  return "idle";
}

async function probeWaiting(id: string): Promise<boolean> {
  return (await classifyPaneMenu(id)) === "question";
}

async function isProbeWaiting(id: string): Promise<boolean> {
  const now = Date.now();
  const cached = probeCache.get(id);
  if (cached && now - cached.at < PROBE_INTERVAL_MS) return cached.waiting;
  const waiting = await probeWaiting(id);
  probeCache.set(id, { at: now, waiting });
  return waiting;
}

// escapeUntilPromptCleared() form-dismissal poll. After an Escape the TUI takes
// ~210ms to re-render from the prompt menu back to the idle input; under heavy
// concurrent load capture-pane can lag further behind the real CLI state. We
// poll a FRESH capture each iteration (never the throttled isProbeWaiting
// cache) until no menu remains.
//
// The cadence is the whole ballgame. A single Escape DOES reliably dismiss the
// AskUserQuestion menu (verified, CLI v2.1.161) — the danger is sending a SECOND
// one too soon. The prior implementation re-fired Escape every 500ms while the
// footer was still on screen, but capture-pane lags the real CLI: once Escape
// dismissed the menu, the CLI sat at idle while the capture still showed the
// stale footer, so the next cadence Escape (and the one after) landed at idle —
// an Esc-Esc that opens Claude's *rewind* menu. That is the crash this fixes.
//
// So we space Escapes by ESCAPE_MIN_GAP_MS — comfortably longer than the
// re-render lag — and re-check state before each one. In the common case the
// menu clears after the first Escape and we observe idle before the gap
// elapses, sending exactly one keystroke. A second Escape only fires if the
// menu is STILL present a full gap later (a genuinely dropped keystroke, not
// lag), where re-pressing is safe because the menu really is up. And because
// classifyPaneMenu() recognises the rewind menu as a menu (not idle), any
// rewind opened by a queued/overshot keystroke is just escaped away on a later
// tick instead of being mistaken for the cleared prompt — rewind is recoverable,
// never an absorbing trap.
const FORM_CLEAR_POLL_INTERVAL_MS = 100;
const ESCAPE_MIN_GAP_MS = 1_500;
const FORM_CLEAR_TIMEOUT_MS = 6_000;

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
 *    - status: "busy" | "idle" | "shell" | "waiting" (can lag behind the TUI)
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
  opActive: boolean,
): ResolvedPaneStatus {
  const trimmed = rawTitle.replace(/^_ /, "").trim();

  // Extract display title (strip status prefix).
  const titleText = trimmed.replace(STATUS_PREFIX_RE, "").trim();
  const isDefault =
    !titleText ||
    /^[a-zA-Z0-9-]+\.(local|internal|lan|home)$/.test(titleText) ||
    SESSION_NAME_RE.test(titleText);
  const title = isDefault ? "" : titleText;

  // Resolve working status.
  let working: boolean;
  if (session.status === "shell" && opActive) {
    // A background subprocess is attached (the CLI reports "shell" while any
    // background task runs) AND Singularity knows a build or push is in flight
    // for this worktree. That operation will finish and resume the agent, so
    // this is real work — but the TUI keeps rendering the ✳ ready mark in the
    // title throughout, so we must override the title here. Without opActive we
    // deliberately do NOT special-case "shell": a never-ending background shell
    // (a dev server, `tail -f`, or a build whose completion marker never
    // matched) falls through to the title's ready mark below and reads as
    // waiting, so a stalled agent surfaces in the needs-input queue instead of
    // looking busy forever.
    working = true;
  } else if (SPINNER_RE.test(trimmed)) {
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

// pasteTurn() submit-verification poll. The CLI is an async (Ink/React) TUI:
// when tmux writes the bracketed paste and Enter into the PTY in one read
// chunk, the paste handler schedules a React state update but the trailing
// Enter is processed in the SAME tick — before the paste commits to state — so
// it fires against an empty draft and submits nothing (the user then has to
// press Enter manually). A fixed inter-key delay only papers over this: under
// concurrent load the render can lag past any constant.
//
// Instead we verify against the rendered input box, the same self-healing shape
// answerPrompt() uses for Escape. The Claude idle input is a `❯` prompt line
// bounded by full-width `─` rules; its draft content is everything between the
// prompt glyph and the next rule. We (1) poll until that draft is non-empty —
// proof the paste committed — then (2) send Enter and poll until the draft
// clears again, RE-SENDING Enter on SUBMIT_ENTER_RETRY_MS if it lingers (a
// dropped/early keystroke). A second Enter on an already-empty box is a no-op,
// so retry is safe. Timeouts are generous because many concurrent agents slow
// tmux/Ink.
const SUBMIT_POLL_INTERVAL_MS = 75;
const SUBMIT_ENTER_RETRY_MS = 500;
const PASTE_COMMIT_TIMEOUT_MS = 5_000;
const SUBMIT_TIMEOUT_MS = 5_000;
// Used only when the input box can't be parsed (unrecognized CLI render): the
// proven fixed delay between a committed paste and Enter, the pre-chaining
// mitigation. Strictly better than firing Enter in the same chunk as the paste.
const FALLBACK_SUBMIT_DELAY_MS = 150;

const RULE_RE = /^─{10,}$/;
const PROMPT_GLYPH = "❯";

/**
 * Extract the current draft text from the pane's idle input box, or null when
 * the box can't be located (unrecognized render). The box is the `❯` prompt
 * line plus any continuation lines, up to the next full-width `─` rule below
 * it. We anchor on the bottom-most `❯` (always the live input prompt; transcript
 * rules/glyphs sit above it) and strip the glyph + surrounding whitespace, so
 * an empty box returns "" and a box holding the pasted draft returns non-empty.
 */
async function captureInputDraft(conversationId: string): Promise<string | null> {
  const proc = Bun.spawn(
    [TMUX, "capture-pane", "-p", "-S", "-50", "-t", conversationId],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  const lines = stdout.split("\n");
  let promptIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.includes(PROMPT_GLYPH)) {
      promptIdx = i;
      break;
    }
  }
  if (promptIdx === -1) return null;
  let end = lines.length;
  for (let i = promptIdx + 1; i < lines.length; i++) {
    if (RULE_RE.test(lines[i]!.trim())) {
      end = i;
      break;
    }
  }
  return lines
    .slice(promptIdx, end)
    .join("\n")
    .split(PROMPT_GLYPH)
    .join("")
    .trim();
}

async function sendEnter(conversationId: string): Promise<void> {
  await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "Enter"], {
    stdout: "pipe",
    stderr: "pipe",
  }).exited;
}

/**
 * Paste `text` into the pane's idle input and submit it, verifying submission
 * against the rendered input box rather than firing Enter blindly (see the
 * SUBMIT_* comment block for the async-TUI race this avoids).
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
  const paste = Bun.spawn(
    [TMUX, "paste-buffer", "-d", "-p", "-b", bufferName, "-t", conversationId],
    { stdout: "pipe", stderr: "pipe" },
  );
  const pasteExit = await paste.exited;
  if (pasteExit !== 0) {
    const stderr = await new Response(paste.stderr).text();
    throw new Error(
      `tmux paste-buffer for ${conversationId} failed (exit ${pasteExit}): ${stderr.trim() || "<no stderr>"}`,
    );
  }

  // Phase 1: wait until the paste commits to the input box (draft non-empty).
  // Sending Enter before this either no-ops (paste not yet in state) or, if the
  // CLI is still in paste mode, appends a literal newline to the draft.
  const commitDeadline = Date.now() + PASTE_COMMIT_TIMEOUT_MS;
  let committed = false;
  let everObserved = false;
  for (;;) {
    const draft = await captureInputDraft(conversationId);
    if (draft !== null) {
      everObserved = true;
      if (draft.length > 0) {
        committed = true;
        break;
      }
    }
    if (Date.now() + SUBMIT_POLL_INTERVAL_MS >= commitDeadline) break;
    await Bun.sleep(SUBMIT_POLL_INTERVAL_MS);
  }

  if (!committed) {
    // Either the box render is unrecognized (never observed) or the paste never
    // surfaced. Fall back to the proven fixed-delay submit — strictly better
    // than chaining Enter into the same PTY chunk as the paste.
    if (everObserved) {
      void recordCrash({
        source: "server-caught",
        errorType: "TmuxSubmitError",
        message: `tmux pasteTurn for ${conversationId}: paste did not surface in input box within ${PASTE_COMMIT_TIMEOUT_MS}ms; using fixed-delay fallback`,
        label: "tmux-runtime.pasteTurn",
      });
    }
    await Bun.sleep(FALLBACK_SUBMIT_DELAY_MS);
    await sendEnter(conversationId);
    return;
  }

  // Phase 2: submit and verify. Re-send Enter until the box clears (a cleared
  // box, after a confirmed non-empty draft, is a real submission).
  const submitDeadline = Date.now() + SUBMIT_TIMEOUT_MS;
  let nextEnterAt = 0;
  for (;;) {
    if (Date.now() >= nextEnterAt) {
      await sendEnter(conversationId);
      nextEnterAt = Date.now() + SUBMIT_ENTER_RETRY_MS;
    }
    const draft = await captureInputDraft(conversationId);
    if (draft === "") return; // box cleared → submitted
    if (Date.now() + SUBMIT_POLL_INTERVAL_MS >= submitDeadline) break;
    await Bun.sleep(SUBMIT_POLL_INTERVAL_MS);
  }
  throw new Error(
    `tmux pasteTurn for ${conversationId}: draft did not clear within ${SUBMIT_TIMEOUT_MS}ms despite repeated Enter`,
  );
}

/**
 * Dismiss the active prompt menu (AskUserQuestion), pressing Escape until the
 * pane returns to the idle input — but spacing Escapes by ESCAPE_MIN_GAP_MS so
 * we never stack two into an Esc-Esc that opens Claude's rewind menu. Each
 * iteration re-classifies the pane from a FRESH capture (never the throttled
 * isProbeWaiting cache, whose 5s window would not reflect clearance within this
 * budget):
 *   - idle     → cleared, return.
 *   - question → press Escape, but at most once per ESCAPE_MIN_GAP_MS. The
 *                common case clears on the first press and reaches idle before
 *                the gap elapses (one keystroke total); a second press only
 *                fires if the menu is genuinely still up a full gap later.
 *   - rewind   → an overshot/queued Escape already dismissed the question and
 *                opened rewind; it is just another menu, so the same gated
 *                Escape closes it back to idle. Recognising it (instead of
 *                reading it as idle) is what keeps it from being left stranded.
 *
 * Exit copy mode before each Escape so the key reaches Claude rather than
 * tmux's vi bindings (see send()). Throws if the pane never reaches idle within
 * FORM_CLEAR_TIMEOUT_MS rather than letting the caller send into a live menu
 * (which would auto-select a wrong option and fabricate an answer).
 *
 * Shared by answerPrompt() (which then C-c + pastes the answer) and
 * flushInteractivePrompt() (which stops here, sending no answer).
 */
async function escapeUntilPromptCleared(conversationId: string): Promise<void> {
  const deadline = Date.now() + FORM_CLEAR_TIMEOUT_MS;
  let lastEscapeAt = -Infinity;
  for (;;) {
    if ((await classifyPaneMenu(conversationId)) === "idle") return;
    // A menu (question or rewind) is up. Press Escape only if we haven't pressed
    // within the last gap — long enough for a prior Escape's re-render to land,
    // so we never Esc-Esc a pane that has already reached idle under render lag.
    if (Date.now() - lastEscapeAt >= ESCAPE_MIN_GAP_MS) {
      await Bun.spawn([TMUX, "copy-mode", "-q", "-t", conversationId], {
        stdout: "pipe",
        stderr: "pipe",
      }).exited;
      await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "Escape"], {
        stdout: "pipe",
        stderr: "pipe",
      }).exited;
      lastEscapeAt = Date.now();
    }
    if (Date.now() + FORM_CLEAR_POLL_INTERVAL_MS >= deadline) break;
    await Bun.sleep(FORM_CLEAR_POLL_INTERVAL_MS);
  }
  // Never send into a live menu — that fabricates a wrong answer.
  throw new Error(
    `tmux escapeUntilPromptCleared for ${conversationId}: prompt menu did not clear ` +
      `within ${FORM_CLEAR_TIMEOUT_MS}ms despite repeated Escape; refusing to send`,
  );
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
      // Only the ambiguous "shell" state needs the build/push-in-flight signal,
      // so we skip the filesystem read for every other pane.
      const opActive =
        state.status === "shell" && worktreePath
          ? isWorktreeOpActive(basename(worktreePath))
          : false;
      const resolved = resolvePaneStatus(rawTitle, state, opActive);
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

    // 1+2. Dismiss the form, RE-SENDING Escape until it actually clears (throws
    //    if it never does). See escapeUntilPromptCleared() for the full
    //    self-healing rationale.
    await escapeUntilPromptCleared(conversationId);

    // 3. Clear any partial input, then paste + Enter (same as send()).
    await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "C-c"], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
    await pasteTurn(conversationId, text);
  },

  async flushInteractivePrompt(conversationId: string): Promise<void> {
    // Dismiss the live prompt menu (e.g. AskUserQuestion) WITHOUT sending an
    // answer. Cancelling the menu forces the CLI to flush the buffered
    // assistant tool_use to the JSONL transcript so the web UI can render it.
    // This is exactly answerPrompt()'s self-healing Escape loop minus the
    // C-c + paste step — no answer text is ever sent.
    await escapeUntilPromptCleared(conversationId);
  },
};
