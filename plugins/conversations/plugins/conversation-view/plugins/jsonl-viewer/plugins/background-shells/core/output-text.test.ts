import { describe, expect, test } from "bun:test";
import { lastOutputLine, stripAnsi, terminalText } from "./output-text";

describe("lastOutputLine", () => {
  test("empty input has no line yet", () => {
    expect(lastOutputLine("")).toBeNull();
  });

  test("only blank lines have no line yet", () => {
    expect(lastOutputLine("\n  \n\r\n")).toBeNull();
  });

  test("skips trailing blank lines", () => {
    expect(lastOutputLine("tick 1\ntick 2\n\n  \n")).toBe("tick 2");
  });

  test("a \\r progress redraw shows its latest frame", () => {
    expect(lastOutputLine("Compiling\n 10%\r 50%\r 90%")).toBe(" 90%");
    expect(lastOutputLine("Receiving 1/3\rReceiving 3/3\r\n")).toBe(
      "Receiving 3/3",
    );
  });

  test("strips ANSI colour and cursor sequences", () => {
    expect(
      lastOutputLine("\x1b[32mok\x1b[0m\n\x1b[1;31merror: boom\x1b[0m\n"),
    ).toBe("error: boom");
    // A line that is ONLY escapes is blank once stripped.
    expect(lastOutputLine("done\n\x1b[2K\x1b[0m\n")).toBe("done");
  });
});

describe("stripAnsi", () => {
  test("removes CSI, OSC hyperlinks and two-byte escapes", () => {
    expect(
      stripAnsi(
        "\x1b]8;;http://x\x07link\x1b]8;;\x07 \x1b[38;5;200mc\x1b[m\x1bM",
      ),
    ).toBe("link c");
  });
});

describe("terminalText", () => {
  test("keeps each line's last carriage-return frame", () => {
    expect(terminalText("start\n 10%\r 50%\r100%\ndone\r\n")).toBe(
      "start\n100%\ndone\n",
    );
  });
  test("strips escapes", () => {
    expect(terminalText("\x1b[31mred\x1b[0m\n")).toBe("red\n");
  });
});
