import { afterEach, describe, expect, test } from "bun:test";
import {
  abandonRelayQuestion,
  awaitRelayQuestion,
  registerRelayQuestion,
} from "../core/endpoints";
import {
  abandonQuestion,
  answeredHookOutput,
  parseHookInput,
  relayPaths,
  runRelay,
  UNREACHABLE_RELEASE_MS,
  type RelayHookInput,
} from "./relay";

const INPUT: RelayHookInput = {
  tool_use_id: "toolu_1",
  tool_input: {
    questions: [{ question: "Which colour?", options: [{ label: "Blue" }] }],
  },
};

/** The route's path with its `:params` filled in. */
function fill(route: string, params: Record<string, string>): string {
  return route
    .replace(/^[A-Z]+ /, "")
    .replace(/:(\w+)/g, (_, name: string) => params[name]!);
}

type Reply = { status: number; body?: unknown };

let server: ReturnType<typeof Bun.serve> | null = null;
afterEach(() => {
  void server?.stop(true);
  server = null;
});

/** A stub backend answering each request with the next scripted reply. */
function stub(replies: Reply[]) {
  const seen: string[] = [];
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      seen.push(`${req.method} ${url.pathname}`);
      const reply = replies.shift();
      if (!reply) return new Response("no more replies", { status: 599 });
      return Response.json(reply.body ?? null, { status: reply.status });
    },
  });
  return { baseUrl: `http://localhost:${server.port}`, seen };
}

const noSleep = () => Promise.resolve();

describe("relay paths", () => {
  test("are the endpoints' own routes", () => {
    const p = { id: "conv-1", toolUseId: "toolu_1" };
    expect(relayPaths.register("conv-1")).toBe(
      fill(registerRelayQuestion.route, p),
    );
    expect(relayPaths.action("conv-1", "toolu_1", "await")).toBe(
      fill(awaitRelayQuestion.route, p),
    );
    expect(relayPaths.action("conv-1", "toolu_1", "abandon")).toBe(
      fill(abandonRelayQuestion.route, p),
    );
  });
});

describe("parseHookInput", () => {
  test("reads the tool-use id and questions", () => {
    expect(
      parseHookInput(JSON.stringify({ ...INPUT, session_id: "s" })),
    ).toEqual(INPUT);
  });
  test("throws on input without questions", () => {
    expect(() =>
      parseHookInput(JSON.stringify({ tool_use_id: "x", tool_input: {} })),
    ).toThrow(/questions/);
  });
});

describe("runRelay against a stub backend", () => {
  test("answered → the PreToolUse allow carrying the answer, questions unchanged", async () => {
    const answer = { answers: { "Which colour?": "Blue" } };
    const { baseUrl, seen } = stub([
      { status: 200, body: { state: "open" } },
      { status: 200, body: { state: "open" } }, // one await cap
      { status: 200, body: { state: "answered", answer } },
    ]);
    const outcome = await runRelay({
      baseUrl,
      conversationId: "conv-1",
      input: INPUT,
      pid: 4242,
      sleep: noSleep,
    });
    expect(outcome).toEqual({
      kind: "answered",
      output: answeredHookOutput(INPUT.tool_input, answer),
    });
    expect(
      JSON.parse(outcome.kind === "answered" ? outcome.output : ""),
    ).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { questions: INPUT.tool_input.questions, ...answer },
      },
    });
    expect(seen).toEqual([
      "POST /api/conversations/conv-1/questions",
      "GET /api/conversations/conv-1/questions/toolu_1/await",
      "GET /api/conversations/conv-1/questions/toolu_1/await",
    ]);
  });

  test("released → exits silently", async () => {
    const { baseUrl } = stub([
      { status: 200, body: { state: "open" } },
      { status: 200, body: { state: "released" } },
    ]);
    expect(
      await runRelay({
        baseUrl,
        conversationId: "conv-1",
        input: INPUT,
        pid: 1,
        sleep: noSleep,
      }),
    ).toEqual({ kind: "released", reason: "released" });
  });

  test("a restarting backend (5xx) is retried; a lost row re-registers", async () => {
    const { baseUrl, seen } = stub([
      { status: 502 },
      { status: 200, body: { state: "open" } },
      { status: 503 },
      { status: 404 },
      { status: 200, body: { state: "open" } },
      { status: 200, body: { state: "released" } },
    ]);
    const outcome = await runRelay({
      baseUrl,
      conversationId: "conv-1",
      input: INPUT,
      pid: 1,
      sleep: noSleep,
    });
    expect(outcome).toEqual({ kind: "released", reason: "released" });
    expect(seen.map((s) => s.split(" ")[0])).toEqual([
      "POST",
      "POST",
      "GET",
      "GET",
      "POST",
      "GET",
    ]);
  });

  test("an unreachable backend is released after 5 minutes, not before", async () => {
    let clock = 0;
    const retries: string[] = [];
    const outcome = await runRelay({
      // Nothing listens here: every request is a connection error.
      baseUrl: "http://127.0.0.1:1",
      conversationId: "conv-1",
      input: INPUT,
      pid: 1,
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
      onRetry: (m) => retries.push(m),
    });
    expect(outcome).toEqual({ kind: "released", reason: "unreachable" });
    expect(clock).toBeGreaterThanOrEqual(UNREACHABLE_RELEASE_MS);
    expect(clock).toBeLessThan(UNREACHABLE_RELEASE_MS + 5_000);
    expect(retries.length).toBeGreaterThan(10);
  });

  test("a refused request (4xx) throws", async () => {
    const { baseUrl } = stub([{ status: 404, body: "no conversation" }]);
    expect(
      runRelay({
        baseUrl,
        conversationId: "conv-1",
        input: INPUT,
        pid: 1,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  test("abandon posts to the question's abandon route", async () => {
    const { baseUrl, seen } = stub([{ status: 204 }]);
    await abandonQuestion(baseUrl, "conv-1", "toolu_1");
    expect(seen).toEqual([
      "POST /api/conversations/conv-1/questions/toolu_1/abandon",
    ]);
  });
});
