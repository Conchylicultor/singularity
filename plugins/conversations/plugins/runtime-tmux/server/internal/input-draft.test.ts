import { describe, expect, test } from "bun:test";
import { nonFaintText, parseInputDraft, stripAnsi } from "./input-draft";

// The escape sequences below are taken verbatim from `tmux capture-pane -e`
// dumps of live Claude Code panes (see the investigation that motivated this
// module). ESC[39m = default fg (the ❯ glyph), ESC[2m = faint (the dim
// autosuggestion ghost / placeholder), ESC[0m = reset. The whole point of the
// module is that faint text is NOT a real draft.
const E = "\x1b";
const GLYPH = `${E}[39m❯ `; // default-fg prompt glyph + space, as the CLI emits it
const RULE = `${E}[38;5;240m${"─".repeat(40)}${E}[0m`; // coloured box border

describe("nonFaintText", () => {
  test("keeps a bright (normal-intensity) draft", () => {
    expect(nonFaintText(`${GLYPH}${E}[0mfix the bug`)).toBe("❯ fix the bug");
  });

  test("drops a fully-faint ghost with a closing reset", () => {
    expect(nonFaintText(`${GLYPH}${E}[2mImplement it${E}[0m`)).toBe("❯ ");
  });

  test("drops a faint ghost even when the closing reset is missing (truncated …)", () => {
    // Real capture: the ghost is width-truncated with an ellipsis and never
    // emits its ESC[0m, so faint must latch to end-of-line.
    expect(nonFaintText(`${GLYPH}${E}[2mfile a task for the grant-que…`)).toBe("❯ ");
  });

  test("keeps a typed prefix but drops its dim suggested completion", () => {
    expect(nonFaintText(`${GLYPH}${E}[0mfix${E}[2m the rest is a suggestion`)).toBe("❯ fix");
  });

  test("bare ESC[m resets like ESC[0m (clears faint)", () => {
    expect(nonFaintText(`${E}[2mghost${E}[mreal`)).toBe("real");
  });

  test("consumes and ignores non-'m' CSI sequences without eating text", () => {
    expect(nonFaintText(`${E}[2Kkept`)).toBe("kept");
  });
});

describe("parseInputDraft", () => {
  const box = (promptLine: string): string =>
    ["transcript above", RULE, promptLine, RULE, "  footer hints"].join("\n");

  test("empty box → ''", () => {
    expect(parseInputDraft(box(`${GLYPH}${E}[0m`))).toBe("");
  });

  test("dim autosuggestion ghost → '' (the false-positive this module fixes)", () => {
    expect(parseInputDraft(box(`${GLYPH}${E}[2mImplement it${E}[0m`))).toBe("");
  });

  test("truncated ghost with no closing reset → ''", () => {
    expect(parseInputDraft(box(`${GLYPH}${E}[2mScreenshot the popover crash isolation working`))).toBe("");
  });

  test("real bright draft → the draft text", () => {
    expect(parseInputDraft(box(`${GLYPH}${E}[0mship the fix`))).toBe("ship the fix");
  });

  test("real prefix + dim completion → just the typed prefix", () => {
    expect(parseInputDraft(box(`${GLYPH}${E}[0mfix${E}[2m the bug in the parser`))).toBe("fix");
  });

  test("faint queued-message placeholder → '' (box resting state, not a draft)", () => {
    expect(parseInputDraft(box(`${GLYPH}${E}[2mPress up to edit queued messages${E}[0m`))).toBe("");
  });

  test("placeholder backstop: reads empty even if NOT rendered faint", () => {
    expect(parseInputDraft(box(`${GLYPH}${E}[0mPress up to edit queued messages`))).toBe("");
  });

  test("no prompt glyph anywhere → null (unrecognized render)", () => {
    expect(parseInputDraft("just some\ntranscript\nlines")).toBeNull();
  });

  test("anchors on the BOTTOM-most glyph (transcript ❯ above is ignored)", () => {
    const captured = [
      `${E}[39m❯ an old prompt echoed in the transcript`,
      RULE,
      `${GLYPH}${E}[0mthe live draft`,
      RULE,
    ].join("\n");
    expect(parseInputDraft(captured)).toBe("the live draft");
  });

  test("box with no closing rule runs to end of capture", () => {
    expect(parseInputDraft(`${GLYPH}${E}[0mlast line draft`)).toBe("last line draft");
  });
});

describe("stripAnsi", () => {
  test("removes SGR colour codes, keeps text and box glyphs", () => {
    expect(stripAnsi(`${E}[38;5;240m${"─".repeat(12)}${E}[0m`)).toBe("─".repeat(12));
  });
});
