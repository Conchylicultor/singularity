import { describe, expect, test } from "bun:test";
import { turnEndedOfLines } from "./turn-end";

const assistant = (stopReason: string | null, content: unknown[] = []) => ({
  type: "assistant",
  message: { role: "assistant", stop_reason: stopReason, content },
});
const user = (content: unknown) => ({
  type: "user",
  message: { role: "user", content },
});
const attachment = () => ({ type: "attachment", attachment: {} });

describe("turnEndedOfLines", () => {
  test("a final piece closing the turn, followed by harness bookkeeping, has ended", () => {
    // The shape every one of conv-1790156090-2opp's teammates ended on: the
    // closing text piece, then attachment lines the harness appends after it.
    expect(
      turnEndedOfLines([
        assistant(null, [{ type: "thinking", thinking: "…" }]),
        assistant("end_turn", [{ type: "text", text: "Sent all verdicts." }]),
        attachment(),
        attachment(),
      ]),
    ).toBe(true);
  });

  test("stop_sequence closes a turn too", () => {
    expect(turnEndedOfLines([assistant("stop_sequence")])).toBe(true);
  });

  test("a streamed piece with no stop reason says nothing", () => {
    expect(
      turnEndedOfLines([assistant(null, [{ type: "text", text: "Let me" }])]),
    ).toBe(false);
  });

  test("a turn handing off to a tool is still open", () => {
    expect(
      turnEndedOfLines([
        assistant("tool_use", [{ type: "tool_use", name: "Read", input: {} }]),
      ]),
    ).toBe(false);
  });

  test("a user line after the end reopens it — a tool result or a message waking an idle teammate", () => {
    expect(
      turnEndedOfLines([assistant("end_turn"), user("next batch, please")]),
    ).toBe(false);
    expect(
      turnEndedOfLines([
        assistant("end_turn"),
        user([{ type: "tool_result", tool_use_id: "tu_1", content: "ok" }]),
      ]),
    ).toBe(false);
  });

  test("a window with no message at all has not ended", () => {
    expect(turnEndedOfLines([])).toBe(false);
    expect(turnEndedOfLines([attachment()])).toBe(false);
  });
});
