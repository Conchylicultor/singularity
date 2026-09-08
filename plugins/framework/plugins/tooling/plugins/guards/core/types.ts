export type AllowVerdict = { kind: "allow" };
export type DenyVerdict = { kind: "deny"; reason: string; fatal?: boolean };
/**
 * Let the call through, but hand the model a fact it was missing. The arm for a
 * guard that has an *answer* rather than an objection — blocking there would be
 * a false positive, and staying silent leaves the model to keep guessing.
 */
export type InformVerdict = { kind: "inform"; context: string };
export type Verdict = AllowVerdict | DenyVerdict | InformVerdict;

/**
 * The session transcript, or the reason there isn't one.
 *
 * A discriminated result rather than `string | undefined`, because the two
 * outcomes lead to opposite verdicts: "the harness has not reported that task
 * finished" is grounds to block a wait, "I could not look" is not. An absent
 * transcript read as empty text is indistinguishable from a transcript that
 * mentions nothing, which is exactly the confusion this type removes.
 */
export type TranscriptRead =
  { kind: "read"; text: string } | { kind: "unavailable"; why: string };

export type ToolMatcher =
  "Bash" | "Write" | "Edit" | "Read" | "NotebookEdit" | "Agent";

export interface GuardContext {
  cwd: string;
  /**
   * The Claude Code session this tool call belongs to, straight off the
   * PreToolUse payload. Guards that carry state across calls key it on this.
   */
  sessionId: string;
  /**
   * Absolute directories OUTSIDE any checkout that an agent may still write
   * into — host-global user content whose home is a `defineDataDir`
   * declaration, not the repo (today: the prototypes tree).
   *
   * Supplied by the hook ENTRY POINT (`bin/guard.ts`) rather than read here,
   * and this is the whole point of the field. A data dir's absolute path is
   * only reachable from its owner's `data-dirs/index.ts`, which the boundary
   * rules keep out of `core/` — so a guard that wanted to name one had no
   * choice but to hardcode `~/.singularity/…`, and that literal would go
   * silently wrong the next time the data root moves (it already has once, in
   * the `apps/` layout migration). Passing the RESOLVED paths in means the
   * guard compares against wherever the declaration says the directory is
   * today, including under a `SINGULARITY_DIR` override.
   */
  writableDataDirs: readonly string[];
  /**
   * This session's transcript as the harness has written it so far — the only
   * record of what the harness has TOLD the agent, which is where a background
   * task's completion notification lives.
   *
   * A capability, not the `transcript_path` string off the payload. A guard
   * holding the path would have to remember that the field can be missing, that
   * the file can be huge, and that a failed read must not read as "the harness
   * said nothing" — the mistake that made every look at a finished task's
   * output count as a poll. Reading is lazy: callers ask only once a rule has
   * already tripped, so the common path pays nothing.
   */
  readTranscript(): TranscriptRead;
  hasBypass(token: string): boolean;
  allow(): AllowVerdict;
  deny(reason: string): DenyVerdict;
  fatal(reason: string): DenyVerdict;
  inform(context: string): InformVerdict;
}

export interface BashInput {
  command?: string;
  /**
   * Set by the caller to detach the command. Only a tool-level background run
   * is tracked by the harness and notifies on exit — a shell-level `&` is not.
   */
  run_in_background?: boolean;
}
export interface FileInput {
  file_path?: string;
}
export interface AgentInput {
  model?: string;
  subagent_type?: string;
}

export interface Guard<I = unknown> {
  name: string;
  matcher: ToolMatcher | ToolMatcher[];
  check(input: I, ctx: GuardContext): Verdict | Promise<Verdict>;
}

export interface FileHint {
  name: string;
  match(filePath: string): boolean;
  message: string;
  /** Tools this hint fires on. Omit for every file tool (incl. Read). */
  tools?: ToolMatcher[];
}
