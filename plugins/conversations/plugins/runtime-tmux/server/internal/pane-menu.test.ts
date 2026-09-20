import { describe, expect, test } from "bun:test";
import { classifyPaneText } from "./pane-menu";

const RULE = "─".repeat(70);

/** The composer box the CLI draws whenever no modal menu is open. */
const composer = (hint = "⏵⏵ auto mode on (shift+tab to cycle)") =>
  [RULE, "❯ ", RULE, `  ${hint}`].join("\n");

/** An open AskUserQuestion menu, footer last. */
const questionMenu = (footer: string) =>
  [
    "  ⏺ Planning the change now.",
    "",
    `⏴  ⏸ Scope  ⏸ Landing  ✔ Submit  ⏵`,
    "",
    "How wide should this plan be?",
    "",
    "❯ 1. Git journey only (Recommended)",
    "     Push becomes local-only without a writable remote.",
    RULE,
    "  2. Git journey + a first-run doctor",
    "  3. Type something.",
    "  4. Chat about this",
    "",
    footer,
  ].join("\n");

const QUESTION_FOOTER =
  "Enter to select · Tab/Arrow keys to navigate · Esc to cancel";
const LEGACY_FOOTER = "Enter to select · ↑/↓ to navigate · Esc to cancel";
const REWIND_FOOTER = "Enter to continue · Esc to cancel";

describe("a menu that is on screen", () => {
  test("bare question footer at the very bottom", () => {
    expect(classifyPaneText(questionMenu(QUESTION_FOOTER))).toBe("question");
  });

  test("the pre-v2.1.276 arrow-key footer still reads as a question", () => {
    expect(classifyPaneText(questionMenu(LEGACY_FOOTER))).toBe("question");
  });

  test("trailing blank lines do not hide the footer", () => {
    expect(classifyPaneText(`${questionMenu(QUESTION_FOOTER)}\n\n\n`)).toBe(
      "question",
    );
  });

  test("the spinner + tip chrome the old CLI drew below a menu", () => {
    const text = [
      questionMenu(QUESTION_FOOTER),
      "",
      "✶ Gallivanting… (19d 17h · ↓ 16.9k tokens)",
      "  ⎿  Tip: Use /statusline to set up a custom status line",
    ].join("\n");
    expect(classifyPaneText(text)).toBe("question");
  });

  // The regression this file exists for: the CLI grew a peer-message banner
  // below the menu, and the old bottom-most-content-line rule read the whole
  // pane as idle.
  test("a peer-message banner below the footer", () => {
    const text = [
      questionMenu(QUESTION_FOOTER),
      "",
      "›  Message from @aa55e1f7474d9c347 (ctrl+o to expand)",
      "",
    ].join("\n");
    expect(classifyPaneText(text)).toBe("question");
  });

  test("any unknown bottom notice the CLI may grow next", () => {
    const text = [
      questionMenu(QUESTION_FOOTER),
      "",
      "  ⚑ Something nobody has written a regex for yet",
      "  ⚑ …nor for this one",
    ].join("\n");
    expect(classifyPaneText(text)).toBe("question");
  });

  test("a hard-wrapped footer is rejoined before matching", () => {
    const text = questionMenu(
      ["Enter to select · Tab/Arrow keys to navigate ·", "Esc to cancel"].join(
        "\n",
      ),
    );
    expect(classifyPaneText(text)).toBe("question");
  });

  test("the rewind menu is a menu, not idle", () => {
    const text = [
      "Restore the code and the conversation to a previous point?",
      "",
      "❯ 1. Restore code and conversation",
      "  2. Restore conversation only",
      "",
      REWIND_FOOTER,
    ].join("\n");
    expect(classifyPaneText(text)).toBe("rewind");
  });
});

describe("a footer left behind in scrollback", () => {
  test("answered question, agent now idle at the composer", () => {
    const text = [
      questionMenu(QUESTION_FOOTER),
      "",
      "⏺ Going with the git journey only.",
      "",
      composer(),
    ].join("\n");
    expect(classifyPaneText(text)).toBe("idle");
  });

  test("answered question, agent mid-stream (composer still rendered)", () => {
    const text = [
      questionMenu(QUESTION_FOOTER),
      "",
      "✳ Zigzagging… (27s · thinking more)",
      "                                                    143149 tokens",
      composer("⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt"),
    ].join("\n");
    expect(classifyPaneText(text)).toBe("idle");
  });

  test("a stale rewind footer is idle too", () => {
    const text = [REWIND_FOOTER, "", composer()].join("\n");
    expect(classifyPaneText(text)).toBe("idle");
  });

  test("the LIVE menu wins when a stale footer sits above it", () => {
    const text = [
      questionMenu(QUESTION_FOOTER),
      "",
      "⏺ Answered. Asking the next one.",
      "",
      composer(),
      questionMenu(QUESTION_FOOTER),
    ].join("\n");
    expect(classifyPaneText(text)).toBe("question");
  });
});

describe("no menu at all", () => {
  test("plain idle pane", () => {
    expect(classifyPaneText(["⏺ All done.", "", composer()].join("\n"))).toBe(
      "idle",
    );
  });

  test("empty capture", () => {
    expect(classifyPaneText("")).toBe("idle");
  });

  // The footer's control string is fixed; prose merely quoting part of it must
  // not fabricate a menu, because a false positive fires Escape into a working
  // agent.
  test("prose quoting the control words is not a menu", () => {
    const text = [
      "⏺ The footer reads Enter to select and then you navigate with arrows;",
      "  pressing Esc to cancel backs out.",
      "",
      composer(),
    ].join("\n");
    expect(classifyPaneText(text)).toBe("idle");
  });

  test("a terminator with no recognised head anchors is not a question", () => {
    expect(classifyPaneText(["  Esc to cancel"].join("\n"))).toBe("idle");
  });
});
