// The relay's loop, kept out of `bin/ask-relay.ts` so it runs (and is tested)
// against any base URL. Plain fetch and timers (and the import-free namespace
// grammar) only: no npm import, no zod —
// the relay is started by the CLI for every question and must load fast and
// with whatever node_modules the checkout has.
//
// Lifecycle (research/2026-10-06-conversations-askuserquestion-hook-relay.md):
//   register → await (long-poll, re-issued on its 45 s cap) → one of
//   - answered  → the PreToolUse allow carrying the answer as `updatedInput`;
//   - released  → exit silently: the CLI draws its own menu;
//   - abandoned → exit silently (the CLI is already writing its own result);
//   - the backend unreachable for {@link UNREACHABLE_RELEASE_MS} straight →
//     exit silently, so an agent never hangs on a dead app.
// It never gives up on a wall-clock timer otherwise.

import {
  asNamespace,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";

/** The hook's stdin, as far as the relay reads it. */
export interface RelayHookInput {
  tool_use_id: string;
  tool_input: { questions: unknown[] } & Record<string, unknown>;
}

/** The answer in the tool's own input shape (core/schemas.ts `CliAnswer`). */
export interface RelayAnswer {
  answers: Record<string, string>;
  annotations?: Record<string, { notes: string }>;
  response?: string;
}

type Resolution =
  | { state: "open" }
  | { state: "answered"; answer: RelayAnswer }
  | { state: "released" }
  | { state: "abandoned" };

export type RelayOutcome =
  /** Print `output` (one JSON line) to stdout and exit 0. */
  | { kind: "answered"; output: string }
  /** Exit 0 with no output: the CLI falls back to its own menu. */
  | { kind: "released"; reason: "released" | "abandoned" | "unreachable" };

/**
 * The backend refused the relay outright (a 4xx other than a lost row): a bug
 * or a misrouted host, not a restart. The bin exits 1 with the message, which
 * the CLI treats as a non-blocking hook error and draws the menu.
 */
export class RelayRefusedError extends Error {}

/** How long the backend may stay unreachable before the relay lets go. */
export const UNREACHABLE_RELEASE_MS = 5 * 60_000;
const BACKOFF_START_MS = 250;
const BACKOFF_MAX_MS = 5_000;
/** The abandon POST's bound: the CLI SIGKILLs an ignoring hook ~8 s later. */
export const ABANDON_TIMEOUT_MS = 2_000;

/** The relay's routes — the same strings as core/endpoints.ts (tested). */
export const relayPaths = {
  register: (conversationId: string) =>
    `/api/conversations/${encodeURIComponent(conversationId)}/questions`,
  action: (
    conversationId: string,
    toolUseId: string,
    action: "await" | "abandon",
  ) =>
    `/api/conversations/${encodeURIComponent(conversationId)}/questions/${encodeURIComponent(toolUseId)}/${action}`,
};

/**
 * Where the relay reaches its backend: the namespace the pane's .mcp.json
 * dials too (`SINGULARITY_PARENT_HOST`). Throws on a value that is not one.
 */
export function relayBaseUrl(parentHost: string): string {
  return namespaceUrl(asNamespace(parentHost));
}

/** Read and check the hook's stdin JSON. Throws on a shape it cannot hold. */
export function parseHookInput(raw: string): RelayHookInput {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("hook input is not an object");
  }
  const { tool_use_id, tool_input } = parsed as Record<string, unknown>;
  if (typeof tool_use_id !== "string" || tool_use_id.length === 0) {
    throw new Error("hook input carries no tool_use_id");
  }
  if (
    typeof tool_input !== "object" ||
    tool_input === null ||
    !Array.isArray((tool_input as Record<string, unknown>).questions)
  ) {
    throw new Error("hook input carries no tool_input.questions");
  }
  return {
    tool_use_id,
    tool_input: tool_input as RelayHookInput["tool_input"],
  };
}

/**
 * The PreToolUse output that answers the question: allow, with the tool's own
 * input (questions unchanged) plus the answer. The CLI then skips its menu and
 * writes the real `Your questions have been answered: …` result.
 */
export function answeredHookOutput(
  toolInput: RelayHookInput["tool_input"],
  answer: RelayAnswer,
): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: { ...toolInput, ...answer },
    },
  });
}

function parseResolution(body: unknown): Resolution {
  if (typeof body !== "object" || body === null) {
    throw new Error(`unexpected relay response: ${JSON.stringify(body)}`);
  }
  const state = (body as { state?: unknown }).state;
  switch (state) {
    case "open":
    case "released":
    case "abandoned":
      return { state };
    case "answered": {
      const answer = (body as { answer?: unknown }).answer;
      if (typeof answer !== "object" || answer === null) {
        throw new Error("answered resolution without an answer");
      }
      return { state, answer: answer as RelayAnswer };
    }
    default:
      throw new Error(`unexpected relay state: ${JSON.stringify(state)}`);
  }
}

export interface RunRelayOptions {
  baseUrl: string;
  conversationId: string;
  input: RelayHookInput;
  pid: number;
  /** Injected for tests; defaults to the real clock and timer. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Called with each transient failure (the bin writes it to stderr). */
  onRetry?: (message: string) => void;
}

type Attempt =
  | { kind: "ok"; resolution: Resolution }
  | { kind: "lost" }
  | { kind: "retry"; message: string };

async function attempt(url: string, init: RequestInit): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    // Connection refused / reset: the backend is restarting or a build is
    // swapping it. A reconnect, not a poll.
    return {
      kind: "retry",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (res.status >= 500) {
    return { kind: "retry", message: `HTTP ${res.status}` };
  }
  // The row is gone (a re-forked DB, a swept row): register again.
  if (res.status === 404 && init.method === "GET") return { kind: "lost" };
  if (!res.ok) {
    throw new RelayRefusedError(
      `${init.method} ${url} → HTTP ${res.status}: ${await res.text()}`,
    );
  }
  return { kind: "ok", resolution: parseResolution(await res.json()) };
}

/** Run one held question to its outcome. */
export async function runRelay(opts: RunRelayOptions): Promise<RelayOutcome> {
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const { baseUrl, conversationId, input } = opts;
  const registerInit: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      toolUseId: input.tool_use_id,
      questions: input.tool_input.questions,
      pid: opts.pid,
    }),
  };
  const registerUrl = baseUrl + relayPaths.register(conversationId);
  const awaitUrl =
    baseUrl + relayPaths.action(conversationId, input.tool_use_id, "await");

  let registered = false;
  let unreachableSince: number | null = null;
  let backoff = BACKOFF_START_MS;

  for (;;) {
    const result = registered
      ? await attempt(awaitUrl, { method: "GET" })
      : await attempt(registerUrl, registerInit);

    if (result.kind === "retry") {
      unreachableSince ??= now();
      if (now() - unreachableSince >= UNREACHABLE_RELEASE_MS) {
        return { kind: "released", reason: "unreachable" };
      }
      opts.onRetry?.(result.message);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
      continue;
    }
    unreachableSince = null;
    backoff = BACKOFF_START_MS;
    if (result.kind === "lost") {
      registered = false;
      continue;
    }
    registered = true;
    const { resolution } = result;
    switch (resolution.state) {
      case "open":
        continue; // the await's cap: hold again
      case "answered":
        return {
          kind: "answered",
          output: answeredHookOutput(input.tool_input, resolution.answer),
        };
      case "released":
      case "abandoned":
        return { kind: "released", reason: resolution.state };
    }
  }
}

/**
 * Tell the backend the relay is being killed (Escape in the terminal). Bounded:
 * the CLI SIGKILLs a hook that ignores SIGTERM, and the reconciler's pid check
 * is the backstop when this does not land.
 */
export async function abandonQuestion(
  baseUrl: string,
  conversationId: string,
  toolUseId: string,
): Promise<void> {
  const res = await fetch(
    baseUrl + relayPaths.action(conversationId, toolUseId, "abandon"),
    { method: "POST", signal: AbortSignal.timeout(ABANDON_TIMEOUT_MS) },
  );
  if (!res.ok) {
    throw new Error(`abandon → HTTP ${res.status}: ${await res.text()}`);
  }
}
