import type {
  ConversationRuntime,
  RuntimeInfo,
} from "@plugins/conversations/server";
import { resolveCliFlag } from "@plugins/conversations/plugins/model-provider/server";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import {
  resolveEffortFlag,
  resolveEffortSettings,
  type EffortLevel,
} from "@plugins/conversations/plugins/effort-provider/core";
import { CLAUDE, TMUX } from "@plugins/infra/plugins/paths/server";
import { runtimeNamespace } from "@plugins/infra/plugins/runtime-identity/core";
import { isWorktreeOpActive } from "@plugins/infra/plugins/worktree/server";
import { backgroundPrefix } from "@plugins/packages/plugins/spawn-priority/server";
import { recordReport } from "@plugins/reports/server";
import { basename } from "node:path";
import { AGENT_SESSION_WRAPPER } from "./agent-session-env";
import {
  resolveSessionState,
  type PaneRef,
  type SessionState,
} from "./claude-session";
import { parseInputDraft } from "./input-draft";
import { asLaunchMessage } from "./launch-message";
import { classifyPaneText, type PaneMenu } from "./pane-menu";
import { resolvePaneStatus } from "./pane-status";
import { captureProcessTree } from "./process-tree";
import { typedChunks } from "./typed-keys";

// AskUserQuestion menus must be detected regardless of how the pane otherwise
// reads, because nothing outside the pane's own pixels says a question is up:
//   - Old CLI: the menu kept the spinner + session status:"busy", so the pane
//     looked `working` while actually waiting.
//   - CLI v2.1.159: the menu presents as an IDLE pane — `✳` ready title prefix,
//     session file status:"waiting" / waitingFor:"permission prompt".
//   - CLI v2.1.276: same idle presentation, waitingFor:"input needed".
// Those last two spellings are also what the CLI writes when it is merely
// sitting at the prompt with nothing on screen, so neither the title nor the
// session file can tell a blocked question from an ordinary wait. Only the
// menu's own footer can — pane-menu.ts owns that reading, including the rule
// that separates a live menu from one already answered.
//
// We therefore probe EVERY non-dead pane (not just working ones) and, on a
// match, override the verdict to {working:false, waitingFor:"question"} — the
// signal the AskUserQuestion web form gates on. Throttled to one capture-pane
// per pane every PROBE_INTERVAL_MS to keep the cost bounded.
const PROBE_INTERVAL_MS = 5_000;

const probeCache = new Map<string, { at: number; waiting: boolean }>();

// Single fresh capture-pane → which interactive menu (if any) is on screen.
// `-S -15` reaches a little into scrollback, which always covers the whole
// visible pane too, so the composer that pane-menu.ts looks for is in frame
// whenever the CLI is rendering it.
async function classifyPaneMenu(id: string): Promise<PaneMenu> {
  const proc = Bun.spawn([TMUX, "capture-pane", "-p", "-S", "-15", "-t", id], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return classifyPaneText(stdout);
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

// Field separator: tab (not present in pane paths or titles) keeps splits
// unambiguous even though pane titles can contain arbitrary characters.
const SEP = "\t";

// typeTurn() submit-verification poll. The CLI is an async (Ink/React) TUI:
// when tmux writes the turn's text and Enter into the PTY in one read chunk,
// the input handler schedules a React state update but the trailing Enter is
// processed in the SAME tick — before the text commits to state — so it fires
// against an empty draft and submits nothing (the user then has to press Enter
// manually). A fixed inter-key delay only papers over this: under concurrent
// load the render can lag past any constant.
//
// Instead we verify against the rendered input box, the same self-healing shape
// answerPrompt() uses for Escape. The Claude idle input is a `❯` prompt line
// bounded by full-width `─` rules; its draft content is everything between the
// prompt glyph and the next rule. We (1) poll until that draft is non-empty —
// proof the text committed — then (2) send Enter and poll until the draft
// clears again, RE-SENDING Enter on SUBMIT_ENTER_RETRY_MS if it lingers (a
// dropped/early keystroke). A second Enter on an already-empty box is a no-op,
// so retry is safe. Timeouts are generous because many concurrent agents slow
// tmux/Ink.
//
// Both timeouts are VERIFICATION outcomes, not delivery failures: they report
// and return, because by then the keystrokes are already in the pane and only
// the transcript can say whether the agent took them. typeTurn throws only
// when a tmux command itself fails — i.e. when the text provably never left us.
const SUBMIT_POLL_INTERVAL_MS = 75;
const SUBMIT_ENTER_RETRY_MS = 500;
const TEXT_COMMIT_TIMEOUT_MS = 5_000;
const SUBMIT_TIMEOUT_MS = 5_000;
// Used only when the input box can't be parsed (unrecognized CLI render): the
// proven fixed delay between committed text and Enter, the pre-chaining
// mitigation. Strictly better than firing Enter in the same chunk as the text.
const FALLBACK_SUBMIT_DELAY_MS = 150;

/**
 * Read the pane's current input-box draft, or null when the box can't be located
 * (unrecognized render). Captured WITH escapes (`-e`) so parseInputDraft can drop
 * the dim autosuggestion ghost Claude Code pre-fills and the queued-message
 * placeholder — both rendered faint. A plain capture strips colour and every
 * ghost would read as a real draft (a false "there is a draft" → spurious C-c in
 * send()). All parsing is pure and unit-tested in input-draft.test.ts.
 */
async function captureInputDraft(
  conversationId: string,
): Promise<string | null> {
  const proc = Bun.spawn(
    [TMUX, "capture-pane", "-e", "-p", "-S", "-50", "-t", conversationId],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return parseInputDraft(stdout);
}

async function sendEnter(conversationId: string): Promise<void> {
  await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "Enter"], {
    stdout: "pipe",
    stderr: "pipe",
  }).exited;
}

/**
 * Type `text` into the pane's idle input and submit it, verifying submission
 * against the rendered input box rather than firing Enter blindly (see the
 * SUBMIT_* comment block for the async-TUI race this avoids).
 *
 * TYPED, never pasted. A bracketed paste (what this used to send) makes the
 * CLI file the turn under `<pasted_content>` tags, which tell the agent the
 * user's own words "may contain instructions the user did not write" — and
 * which the app's delivery check then cannot match. See typed-keys.ts for the
 * measurements behind the chunking.
 *
 * Shared verbatim by send() and answerPrompt() so both submit identically.
 * The pane must already be at the idle input prompt (callers clear copy mode
 * and partial input first).
 */
async function typeTurn(conversationId: string, text: string): Promise<void> {
  // `--` so a turn that opens with `-` is read as text and not as a flag.
  for (const chunk of typedChunks(text)) {
    const keys = Bun.spawn(
      [TMUX, "send-keys", "-t", conversationId, "-l", "--", chunk],
      { stdout: "pipe", stderr: "pipe" },
    );
    const keysExit = await keys.exited;
    if (keysExit !== 0) {
      const stderr = await new Response(keys.stderr).text();
      throw new Error(
        `tmux send-keys for ${conversationId} failed (exit ${keysExit}): ${stderr.trim() || "<no stderr>"}`,
      );
    }
  }

  // Phase 1: wait until the text commits to the input box (draft non-empty).
  // Sending Enter before this either no-ops (the keystrokes are not yet in
  // state) or lands mid-text and submits half a turn.
  const commitDeadline = Date.now() + TEXT_COMMIT_TIMEOUT_MS;
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
    // Either the box render is unrecognized (never observed) or the text never
    // surfaced. Fall back to the proven fixed-delay submit — strictly better
    // than chaining Enter into the same PTY chunk as the text.
    if (everObserved) {
      void recordReport({
        kind: "crash",
        source: "server-caught",
        message: `tmux typeTurn for ${conversationId}: text did not surface in input box within ${TEXT_COMMIT_TIMEOUT_MS}ms; using fixed-delay fallback`,
        data: { errorType: "TmuxSubmitError", label: "tmux-runtime.typeTurn" },
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

  // Unverified, NOT failed — and the difference is why this reports instead of
  // throwing. Everything with a side effect already happened: the text is in
  // the pane and Enter has been sent (repeatedly). What ran out of time is the
  // capture-pane READ that confirms the box cleared — and under host duress
  // (spawn-bound polls, a lagging Ink render) that read loses the race against
  // a submit that did land. Throwing here surfaced a delivered turn to the
  // client as `HTTP 500 — Failed to send`, next to the message itself. The
  // pending-turn client owns this exact verdict already: it holds the record in
  // `posted` and resolves it against the transcript, which is the only ground
  // truth for "did the agent get it" — routing to `unconfirmed` + its own
  // report if it never lands. So the honest outcome is a 200 plus this report.
  void recordReport({
    kind: "crash",
    source: "server-caught",
    message: `tmux typeTurn for ${conversationId}: draft did not clear within ${SUBMIT_TIMEOUT_MS}ms despite repeated Enter; submission unverified (transcript decides)`,
    data: { errorType: "TmuxSubmitError", label: "tmux-runtime.typeTurn" },
  });
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
 * Shared by answerPrompt() (which then pastes the answer) and
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

/**
 * One live pane as `listPanes` reports it. It extends `PaneRef`, so a pane can
 * be handed straight to `resolveSessionState` — the resolver's inputs are a
 * strict subset of what listing a pane already tells us, and there is nothing
 * to assemble (or mis-assemble) at the call site.
 *
 * `#{pane_id}` is the pane's identity for its whole life. `#{window_id}` is
 * deliberately not carried: it moves under `break-pane` / `move-window`, and
 * matching on it would buy nothing that `%pane_id` does not already settle.
 */
export interface TmuxPane extends PaneRef {
  rawTitle: string;
  dead: boolean;
}

/**
 * Live tmux panes we manage, keyed by conversation id (the tmux session name).
 *
 * Exported so out-of-plugin observers (the session-divergence monitor) can join
 * a conversation to its pane pid through this one implementation rather than
 * re-deriving `tmux list-panes` — including its "no server running" empty-state
 * nuance, which a second copy would inevitably get wrong.
 */
export async function listPanes(): Promise<Map<string, TmuxPane>> {
  const proc = Bun.spawn(
    [
      TMUX,
      "list-panes",
      "-a",
      "-F",
      `#{session_name}${SEP}#{pane_pid}${SEP}#{pane_id}${SEP}#{pane_dead}${SEP}#{pane_start_path}${SEP}#{pane_title}`,
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
  const map = new Map<string, TmuxPane>();
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
    const [name, pidStr, paneId, deadStr, startPath, ...rest] = line.split(SEP);
    if (!name || !pidStr || !paneId) continue;
    if (map.has(name)) continue;
    const pid = Number(pidStr);
    if (!Number.isFinite(pid)) continue;
    map.set(name, {
      panePid: pid,
      paneId,
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
    const NULL_SESSION: SessionState = {
      sessionId: null,
      status: null,
      waitingFor: null,
    };
    // One process snapshot for every pane. A failure here throws out of list(),
    // which the poller reads as "runtime state unknown" — same contract as a
    // failed `tmux list-panes`, and far safer than resolving against an empty tree.
    const tree = await captureProcessTree();
    const states = await Promise.all(
      ids.map(async (id) => {
        try {
          return await resolveSessionState(panes.get(id)!, tree);
        } catch (err) {
          void recordReport({
            kind: "crash",
            source: "server-caught",
            message: `resolveSessionState failed for pane "${id}": ${err instanceof Error ? err.message : String(err)}`,
            data: {
              errorType: "SessionStateError",
              label: "tmux-runtime.resolveSessionState",
            },
          });
          return NULL_SESSION;
        }
      }),
    );
    // Only the ambiguous "shell" state needs the build/push-in-flight signal,
    // so we skip the filesystem scan for every other pane. isWorktreeOpActive is
    // async (off-event-loop), so resolve every pane's op state in parallel up
    // front, then consume it synchronously when assembling the map.
    const opActives = await Promise.all(
      ids.map((id, i) => {
        const { worktreePath } = panes.get(id)!;
        const state = states[i]!;
        return state.status === "shell" && worktreePath
          ? isWorktreeOpActive(basename(worktreePath))
          : Promise.resolve(false);
      }),
    );

    const out = new Map<string, RuntimeInfo>();
    ids.forEach((id, i) => {
      const { rawTitle, dead, worktreePath } = panes.get(id)!;
      const state = states[i]!;
      const opActive = opActives[i]!;
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
      const probeResults = await Promise.all(
        probeIds.map((id) => isProbeWaiting(id)),
      );
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

  async isRunning(conversationId: string): Promise<boolean> {
    // `tmux has-session -t <id>` exits 0 iff a session by that name exists.
    const exit = await Bun.spawn([TMUX, "has-session", "-t", conversationId], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
    return exit === 0;
  },

  async create(
    conversationId: string,
    worktreePath: string,
    opts?: {
      prompt?: string;
      model?: ConversationModel;
      effort?: EffortLevel;
      resumeSessionId?: string;
      forkSession?: boolean;
    },
  ): Promise<void> {
    // Idempotent under durable-job retry: if a live session already exists (a
    // retry after a crash between `new-session` and the job commit), do nothing.
    // `tmux new-session -s <id>` refuses a duplicate name, so a non-idempotent
    // retry would loop forever on the duplicate error.
    if (await this.isRunning(conversationId)) return;

    // SINGULARITY_CONVERSATION_ID is read by the .githooks/prepare-commit-msg
    // hook so any `git commit` made inside the pane gets stamped with a
    // Singularity-Conversation trailer. SINGULARITY_PARENT_HOST is the
    // namespace Claude's .mcp.json dials back to over HTTP — it must be a host
    // the gateway actually routes, so it is this backend's own declared
    // runtime namespace rather than a caller-supplied label. runtimeNamespace()
    // throws when the process never declared one.
    //
    // CLAUDE_CODE_DISABLE_AGENT_VIEW pins the session to this pane. Claude
    // Code's agent view can otherwise move a live session into its per-machine
    // background daemon (`←` on an empty prompt, `/background`, the exit
    // dialog), and the daemon hands every session it hosts ITS OWN environment
    // — the one of whichever pane first spawned it. A session moved that way
    // keeps working through a stub in this pane, so the app cannot tell, but
    // its commits, pushes and MCP calls then carry another conversation's id
    // (the Sep 9 misattributed push). The app never uses background sessions,
    // so the pane is the only place a session may run.
    // The launch message, escaped so the CLI reads it as a turn and never as a
    // slash command (see launch-message.ts). Every use below reads this one
    // value, so the temp-file and positional paths cannot diverge.
    const launchMessage =
      typeof opts?.prompt === "string" && opts.prompt.length > 0
        ? asLaunchMessage(opts.prompt)
        : undefined;
    const parentHost = runtimeNamespace();
    const cliFlag = opts?.model ? resolveCliFlag(opts.model) : undefined;
    // Thinking mode: levels low..max ride `--effort <flag>`; `ultracode` is not a
    // valid flag value, so it rides `--settings '{"ultracode":true}'` (xhigh +
    // dynamic-workflow orchestration). At most one channel is set per level.
    const effortFlag = opts?.effort
      ? resolveEffortFlag(opts.effort)
      : undefined;
    const effortSettings = opts?.effort
      ? resolveEffortSettings(opts.effort)
      : undefined;
    const claudeBase = [
      CLAUDE,
      cliFlag && `--model ${cliFlag}`,
      effortFlag && `--effort ${effortFlag}`,
      // JSON contains no single quotes, so single-quote wrapping is shell-safe.
      effortSettings && `--settings '${JSON.stringify(effortSettings)}'`,
    ]
      .filter(Boolean)
      .join(" ");
    const cmdParts: string[] = [claudeBase];
    if (opts?.resumeSessionId) {
      cmdParts.push(`--resume ${opts.resumeSessionId}`);
      if (opts.forkSession) cmdParts.push("--fork-session");
    }

    // tmux has a ~16KB per-arg cap. For long prompts, write to a temp file and
    // have the shell script cat+delete it. Short prompts use positional $1.
    const PROMPT_ARG_LIMIT = 12_000;
    const useTempFile =
      launchMessage !== undefined && launchMessage.length > PROMPT_ARG_LIMIT;
    let promptFile: string | undefined;
    if (useTempFile) {
      promptFile = `/tmp/singularity-prompt-${conversationId}.txt`;
      await Bun.write(promptFile, launchMessage);
    }

    if (launchMessage !== undefined) {
      if (useTempFile) {
        cmdParts.push(`-- "$(cat '${promptFile}' && rm -f '${promptFile}')"`);
      } else {
        cmdParts.push(`-- "$1"`);
      }
    }
    // Demote the whole agent subtree (claude + everything it spawns: builds,
    // tests, git) below the interactive backends. The prefix must live in the
    // session command STRING: the pane process is forked by the shared tmux
    // SERVER, so demoting our short-lived `tmux new-session` client below
    // would be a no-op. backgroundPrefix() is a fixed literal — shell-safe.
    const claudeCmd = backgroundPrefix() + cmdParts.join(" ");
    // tmux execs this argv directly, so the first zsh is the only process that
    // can expand `$VAR` against what tmux hands the pane (its injected TMUX /
    // TMUX_PANE plus the two `-e` values). That shell immediately re-execs into
    // an allowlisted environment; see agent-session-env.ts for why the pane's
    // inherited environment cannot be trusted. The Claude command and the
    // prompt ride as positional words, never interpolated into the wrapper.
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
        "-e",
        `SINGULARITY_CONVERSATION_ID=${conversationId}`,
        "-e",
        `SINGULARITY_PARENT_HOST=${parentHost}`,
        "-e",
        "CLAUDE_CODE_DISABLE_AGENT_VIEW=1",
        "zsh",
        "-l",
        "-c",
        AGENT_SESSION_WRAPPER,
        "zsh",
        claudeCmd,
        ...(launchMessage !== undefined && !useTempFile ? [launchMessage] : []),
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
    // Clear a partial draft ONLY when the input box actually holds one, asking
    // the box directly via captureInputDraft (the same trusted read typeTurn
    // uses to verify submission). C-c is the CLI's "abort current line": at an
    // idle prompt it discards the draft harmlessly, but sent into a WORKING
    // agent it interrupts the streaming response and STOPS it. So it must never
    // reach a working agent — and the old `!paneIsWorking()` gate could not
    // guarantee that: a process-tree heuristic with false-negatives plus a
    // check→send race would occasionally fire C-c into a live agent (the
    // regular-prompt "agent stopped" bug). A web-driven send leaves the terminal
    // input empty, so this reads "" and sends no C-c; C-c fires only for a
    // genuine hand-typed draft — exactly the text typeTurn would append to.
    if (await captureInputDraft(conversationId)) {
      await Bun.spawn([TMUX, "send-keys", "-t", conversationId, "C-c"], {
        stdout: "pipe",
        stderr: "pipe",
      }).exited;
    }
    // Typed keystrokes + a verified Enter (see typeTurn).
    await typeTurn(conversationId, text);
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

    // 3. Type + Enter. We deliberately do NOT C-c first: the answer text comes
    //    from the web form, so the terminal input line is empty (no draft to
    //    clear), and an unconditional C-c here could interrupt/kill a running
    //    agent — the same hazard send() avoids by clearing only a genuine draft
    //    (captureInputDraft). The menu is already dismissed, so typeTurn writes
    //    into the idle prompt.
    await typeTurn(conversationId, text);
  },

  async flushInteractivePrompt(conversationId: string): Promise<void> {
    // Dismiss the live prompt menu (e.g. AskUserQuestion) WITHOUT sending an
    // answer. Cancelling the menu forces the CLI to flush the buffered
    // assistant tool_use to the JSONL transcript so the web UI can render it.
    // This is exactly answerPrompt()'s self-healing Escape loop minus the
    // C-c + type step — no answer text is ever sent.
    await escapeUntilPromptCleared(conversationId);
  },
};
