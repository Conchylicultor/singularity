/**
 * `Mcp.instructions` rides the initialize result only: an initialize request
 * renders every contribution (nulls dropped, id order, blank-line joined), and
 * any other request renders nothing.
 *
 * Run: `./singularity test plugins/infra/plugins/mcp`
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { handleMcpRequest } from "./handle-mcp";
import { Mcp, type McpToolContext } from "./mcp";
import { instructionsRegistry, registry } from "./registry";

const CONVERSATION = "conv-test";

let renders: Array<{ id: string; ctx: McpToolContext }> = [];

function contribute(id: string, text: string | null): void {
  void Mcp.instructions({
    id,
    render: (ctx) => {
      renders.push({ id, ctx });
      return Promise.resolve(text);
    },
  }).register();
}

function post(body: unknown): Promise<Response> {
  return handleMcpRequest(
    new Request(`http://localhost/api/mcp/${CONVERSATION}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    }),
    { conversationId: CONVERSATION },
  );
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0.0.0" },
  },
};

beforeEach(() => {
  renders = [];
  instructionsRegistry.clear();
  registry.clear();
  void Mcp.tool({
    name: "echo",
    description: "Echo",
    inputSchema: { text: z.string() },
    handler: (args) => ({ content: [{ type: "text", text: args.text }] }),
  }).register();
});

afterEach(() => {
  instructionsRegistry.clear();
  registry.clear();
});

describe("Mcp.instructions", () => {
  test("initialize carries rendered instructions, nulls omitted, id order", async () => {
    contribute("b-second", "Second section.");
    contribute("a-first", "First section.");
    contribute("c-null", null);

    const res = await post(initialize);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result: { instructions?: string };
    };
    expect(json.result.instructions).toBe("First section.\n\nSecond section.");
    expect(renders.map((r) => r.id).sort()).toEqual([
      "a-first",
      "b-second",
      "c-null",
    ]);
    expect(renders[0]?.ctx).toEqual({ conversationId: CONVERSATION });
  });

  test("a batch containing initialize also renders", async () => {
    contribute("a", "Batched.");
    const res = await post([initialize]);
    expect(res.status).toBe(200);
    expect(renders.map((r) => r.id)).toEqual(["a"]);
  });

  test("initialize omits instructions when every contribution is null", async () => {
    contribute("only-null", null);
    const res = await post(initialize);
    const json = (await res.json()) as { result: Record<string, unknown> };
    expect("instructions" in json.result).toBe(false);
  });

  test("tools/list and tools/call render nothing", async () => {
    contribute("a", "Should not render.");

    const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(list.status).toBe(200);
    const listJson = (await list.json()) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(listJson.result.tools.map((t) => t.name)).toEqual(["echo"]);

    const call = await post({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "echo", arguments: { text: "hi" } },
    });
    expect(call.status).toBe(200);
    const callJson = (await call.json()) as {
      result: { content: Array<{ text: string }> };
    };
    expect(callJson.result.content[0]?.text).toBe("hi");

    expect(renders).toEqual([]);
  });

  test("a throwing contribution fails initialize loudly", async () => {
    void Mcp.instructions({
      id: "boom",
      render: () => Promise.reject(new Error("render failed")),
    }).register();
    const outcome = await post(initialize).then(
      () => "resolved",
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    );
    expect(outcome).toBe("render failed");
  });

  test("duplicate ids throw at register", () => {
    contribute("dup", "x");
    expect(() => contribute("dup", "y")).toThrow('"dup" already registered');
  });
});
