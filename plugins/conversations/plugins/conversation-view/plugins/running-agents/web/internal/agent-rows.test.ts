import { describe, expect, test } from "bun:test";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import type { SubagentEntry } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/web";
import {
  DONE_LINGER_MS,
  agentRow,
  nextLingerExpiry,
  summarizeAgents,
  visibleAgentRows,
} from "./agent-rows";

const T0 = Date.parse("2026-09-22T10:00:00.000Z");
const at = (s: number) => new Date(T0 + s * 1000);

type ToolCallEvent = Extract<JsonlEvent, { kind: "tool-call" }>;

function call(input: Record<string, unknown>): ToolCallEvent {
  return {
    kind: "tool-call",
    at: at(0).toISOString(),
    toolUseId: "toolu_1",
    name: "Agent",
    input: { prompt: "do it", ...input },
  };
}

function entry(over: Partial<SubagentEntry> & { id: string }): SubagentEntry {
  const { id, ...rest } = over;
  return {
    row: {
      kind: "described",
      agentId: id,
      agentType: "Explore",
      description: "Search auth flow",
      toolUseId: "toolu_1",
      startedAt: at(0).toISOString(),
      lastActivityAt: at(30).toISOString(),
      lastStep: { kind: "tool", toolName: "Read", preview: "auth.ts" },
    },
    state: { kind: "running" },
    startedAt: at(0),
    endedAt: null,
    lastStep: { kind: "tool", toolName: "Read", preview: "auth.ts" },
    agentToolEvent: undefined,
    ...rest,
  };
}

describe("agentRow", () => {
  test("reads the meta file first, and the parent's call for what it never recorded", () => {
    const row = agentRow(
      entry({
        id: "a",
        row: {
          kind: "described",
          agentId: "a",
          agentType: "Plan",
          description: "Design migration path",
          toolUseId: "toolu_1",
          // No `model` and no `requestShape` — the older half of the corpus.
          startedAt: at(0).toISOString(),
          lastActivityAt: at(30).toISOString(),
          lastStep: null,
        },
        agentToolEvent: call({ model: "opus", run_in_background: true }),
      }),
    );

    expect(row).toMatchObject({
      key: "a",
      type: "Plan",
      description: "Design migration path",
      model: "opus",
      background: true,
      toolUseId: "toolu_1",
    });
  });

  test("a recorded requestShape wins over the call's flag", () => {
    const row = agentRow(
      entry({
        id: "a",
        row: {
          kind: "described",
          agentId: "a",
          agentType: "Explore",
          description: "d",
          requestShape: "foreground",
          startedAt: at(0).toISOString(),
          lastActivityAt: at(1).toISOString(),
          lastStep: null,
        },
        agentToolEvent: call({ run_in_background: true }),
      }),
    );
    expect(row.background).toBe(false);
  });

  test("an unreadable meta still yields a row, described by the parent's call", () => {
    const row = agentRow(
      entry({
        id: "broken",
        row: {
          kind: "undescribed",
          agentId: "broken",
          reason: "not valid JSON",
          startedAt: at(0).toISOString(),
          lastActivityAt: at(5).toISOString(),
          lastStep: { kind: "tool-result" },
        },
        lastStep: { kind: "tool-result" },
        agentToolEvent: call({ description: "Audit endpoints" }),
      }),
    );
    expect(row).toMatchObject({
      key: "broken",
      type: "general-purpose",
      description: "Audit endpoints",
      model: null,
      toolUseId: "toolu_1",
    });
  });

  test("a sub-agent nothing can reach opens no pane", () => {
    const row = agentRow(
      entry({
        id: "mate",
        row: {
          kind: "described",
          agentId: "mate",
          agentType: "fork",
          description: "Verify boundaries",
          name: "live-probe",
          startedAt: at(0).toISOString(),
          lastActivityAt: at(1).toISOString(),
          lastStep: null,
        },
      }),
    );
    expect(row.toolUseId).toBeNull();
  });
});

describe("visibleAgentRows", () => {
  const running = entry({ id: "running" });
  const background = entry({
    id: "background",
    row: {
      kind: "described",
      agentId: "background",
      agentType: "Explore",
      description: "Find theme tokens",
      toolUseId: "toolu_bg",
      requestShape: "background",
      startedAt: at(0).toISOString(),
      lastActivityAt: at(10).toISOString(),
      lastStep: null,
    },
  });
  const justFinished = entry({
    id: "finished",
    state: { kind: "finished" },
    endedAt: at(58),
  });
  const longFinished = entry({
    id: "old",
    state: { kind: "finished" },
    endedAt: at(10),
  });
  const justEnded = entry({
    id: "ended",
    state: { kind: "ended-without-reporting" },
    endedAt: at(59),
  });

  const now = at(60).getTime();

  test("shows what is running, plus what stopped within the linger", () => {
    const rows = visibleAgentRows(
      [running, background, justFinished, longFinished, justEnded],
      now,
    );
    expect(rows.map((r) => r.key)).toEqual([
      "running",
      "background",
      "finished",
      "ended",
    ]);
    expect(rows[1]!.background).toBe(true);
  });

  test("a sub-agent that ended without reporting leaves like any other", () => {
    const later = at(59).getTime() + DONE_LINGER_MS;
    expect(visibleAgentRows([justEnded], later).map((r) => r.key)).toEqual([]);
  });

  test("the next expiry is the first row due to leave", () => {
    const rows = visibleAgentRows([running, justFinished, justEnded], now);
    expect(nextLingerExpiry(rows)).toBe(at(58).getTime() + DONE_LINGER_MS);
    expect(nextLingerExpiry(visibleAgentRows([running], now))).toBeNull();
  });
});

describe("summarizeAgents", () => {
  test("counts only what is still working, and clocks the longest of those", () => {
    const now = at(300).getTime();
    const rows = visibleAgentRows(
      [
        entry({ id: "a", startedAt: at(60) }),
        entry({ id: "b", startedAt: at(120) }),
        entry({ id: "done", state: { kind: "finished" }, endedAt: at(299) }),
      ],
      now,
    );
    expect(summarizeAgents(rows)).toEqual({
      running: 2,
      longestSince: at(60),
    });
  });

  test("nothing running is nothing working, however many rows linger", () => {
    const now = at(300).getTime();
    const rows = visibleAgentRows(
      [entry({ id: "done", state: { kind: "finished" }, endedAt: at(299) })],
      now,
    );
    expect(summarizeAgents(rows)).toEqual({ running: 0, longestSince: null });
  });
});
