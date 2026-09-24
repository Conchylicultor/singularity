import { describe, expect, test } from "bun:test";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { subagentRunState } from "./run-state";

type ToolCallEvent = Extract<JsonlEvent, { kind: "tool-call" }>;
type TaskNotificationEvent = Extract<JsonlEvent, { kind: "task-notification" }>;

const TOOL_USE_ID = "toolu_1";

const agentCall = (withResult: boolean): ToolCallEvent => ({
  kind: "tool-call",
  at: "2026-09-20T10:00:00.000Z",
  toolUseId: TOOL_USE_ID,
  name: "Agent",
  input: {},
  ...(withResult
    ? { result: { at: "2026-09-20T10:05:00.000Z", content: "done" } }
    : {}),
});

const notification = (
  toolUseId: string | undefined,
): TaskNotificationEvent => ({
  kind: "task-notification",
  at: "2026-09-20T10:05:00.000Z",
  taskId: "task-1",
  toolUseId,
  status: "completed",
  summary: "Report delivered.",
});

describe("subagentRunState", () => {
  test("foreground: the parent's tool_result lands only at completion, so it means finished", () => {
    expect(
      subagentRunState({
        toolUseId: TOOL_USE_ID,
        agentToolEvent: agentCall(true),
        taskNotifications: [],
        requestShape: "foreground",
        turnEnded: false,
        conversationStatus: "working",
      }),
    ).toEqual({ kind: "finished" });
  });

  test("background: the same tool_result is only a launch acknowledgement, so it means nothing", () => {
    expect(
      subagentRunState({
        toolUseId: TOOL_USE_ID,
        agentToolEvent: agentCall(true),
        taskNotifications: [],
        requestShape: "background",
        turnEnded: false,
        conversationStatus: "working",
      }),
    ).toEqual({ kind: "running" });
  });

  test("background: the task-notification carrying the same tool-use id is what finishes it", () => {
    expect(
      subagentRunState({
        toolUseId: TOOL_USE_ID,
        agentToolEvent: agentCall(true),
        taskNotifications: [
          notification("toolu_other"),
          notification(TOOL_USE_ID),
        ],
        requestShape: "background",
        turnEnded: false,
        conversationStatus: "working",
      }),
    ).toEqual({ kind: "finished" });
  });

  test("a notification for another sub-agent does not finish this one", () => {
    expect(
      subagentRunState({
        toolUseId: TOOL_USE_ID,
        agentToolEvent: agentCall(false),
        taskNotifications: [
          notification("toolu_other"),
          notification(undefined),
        ],
        requestShape: "background",
        turnEnded: false,
        conversationStatus: "working",
      }),
    ).toEqual({ kind: "running" });
  });

  test("no completion and the parent still has a live process: running", () => {
    expect(
      subagentRunState({
        toolUseId: TOOL_USE_ID,
        agentToolEvent: agentCall(false),
        taskNotifications: [],
        requestShape: "background",
        turnEnded: false,
        conversationStatus: "waiting",
      }),
    ).toEqual({ kind: "running" });
  });

  test("no completion and the parent is gone: ended without reporting, never 'still running'", () => {
    expect(
      subagentRunState({
        toolUseId: TOOL_USE_ID,
        agentToolEvent: agentCall(false),
        taskNotifications: [],
        requestShape: "background",
        turnEnded: false,
        conversationStatus: "done",
      }),
    ).toEqual({ kind: "ended-without-reporting" });
  });

  test("meta not landed yet: neither signal can be trusted, so the parent's liveness decides", () => {
    // A foreground-looking result under an unknown shape must NOT be read as
    // completion — that is exactly the case where it might be a launch ack.
    expect(
      subagentRunState({
        toolUseId: TOOL_USE_ID,
        agentToolEvent: agentCall(true),
        taskNotifications: [],
        requestShape: undefined,
        turnEnded: false,
        conversationStatus: "working",
      }),
    ).toEqual({ kind: "running" });
    expect(
      subagentRunState({
        toolUseId: TOOL_USE_ID,
        agentToolEvent: undefined,
        taskNotifications: [],
        requestShape: undefined,
        turnEnded: false,
        conversationStatus: "done",
      }),
    ).toEqual({ kind: "ended-without-reporting" });
  });

  test("nested teammate: no launching call or notification in the conversation, but its own turn ended — finished", () => {
    // conv-1790156090-2opp: six teammates started by a sub-agent, whose own
    // transcripts closed with `end_turn`, read "running" for over an hour
    // because nothing in the conversation's transcript could ever finish them.
    expect(
      subagentRunState({
        toolUseId: "",
        agentToolEvent: undefined,
        taskNotifications: [],
        requestShape: "background",
        turnEnded: true,
        conversationStatus: "working",
      }),
    ).toEqual({ kind: "finished" });
  });

  test("no end marker seen is not evidence either way: liveness still decides", () => {
    expect(
      subagentRunState({
        toolUseId: "",
        agentToolEvent: undefined,
        taskNotifications: [],
        requestShape: "background",
        turnEnded: false,
        conversationStatus: "working",
      }),
    ).toEqual({ kind: "running" });
    expect(
      subagentRunState({
        toolUseId: "",
        agentToolEvent: undefined,
        taskNotifications: [],
        requestShape: "background",
        turnEnded: undefined,
        conversationStatus: "done",
      }),
    ).toEqual({ kind: "ended-without-reporting" });
  });
});
